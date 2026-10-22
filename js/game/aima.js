/* checkoAI: a learning player (named after the owner's white rooster). On a team whose CPU level is checkoAI ("AIMA") it
 * controls the selected player only (violet arrow), through a virtual controller: the same stick, sprint, buttons and
 * hold times as a human. The other ten are the Legend CPU.
 *
 * Brains: several networks, each with its own settings, stats and history (clone, rename, delete). One is active: it
 * plays in matches and is the one every other profile gets. Each team of a match may use a different brain (training:
 * brain v brain, or a brain v the CPU at any level).
 *
 * A brain is a small neural network (64 inputs: the play around him and the whole match situation; 2 hidden layers;
 * heads for stick, sprint, button, power and a value). It learns (the trainer's profile only):
 *  - by copying: the Legend CPU in spells it plays for him (fewer as he learns), and the trainer's own play
 *  - from rewards (actor-critic, n-step returns): goals, shots, passes, ball won / lost, fouls, and the trainer's claps
 * Store: the owner's Firebase project (REST): "aima/index" (the list, the active brain) and "aima/b_<id>" per brain.
 * The trainer signs in with Google once (the token is kept in his My PC save); everyone else anonymously, read only.
 * No allocation in the play loop: every buffer is made when a brain is built. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var B = NS.Bindings;
  var Actions = NS.Actions;

  var ALG = 'AIMA-AC 1.1 (actor-critic + imitation)';
  var SAVE_KEY = 'aima';
  var TRAINER = 'imad';
  var F = 64;
  // brain sizes (hidden layers)
  var SIZES = { SMALL: [64, 48], LARGE: [256, 128], HUGE: [512, 256] };
  var NST = 9, NSP = 2, NBT = 13, NPW = 3;
  var O_ST = 0, O_SP = 9, O_BT = 11, O_PW = 24, O_V = 27, NOUT = 28;
  var TICK = 0.1;           // a decision every 0.1 s of play
  var NSTEP = 20;           // n-step returns: 2 s
  var GAMMA = 0.97;
  var TRAJ = 32;
  var MEM = 6000;           // copied samples kept for replay (per brain)
  var CLAP_FULL = 1.0;      // seconds of hold for a 100% clap
  var HOLD_PASS = [0.12, 0.5, 1.0];   // x power bar time
  var HOLD_CONT = [0.3, 0.8, 1.5];    // press / team press, seconds
  var LR = [0.0003, 0.001, 0.003];
  var TEMP = [0.7, 1.0, 1.4];
  var CLAP_W = [0.6, 1.0, 1.6];
  var HELP = { AUTO: -1, H0: 0, H30: 0.3, H60: 0.6 };
  var HIST_MAX = 80;
  // reward weights per style: goal, shot, pass, forward pass, won, lost, carry
  var STYLES = {
    BALANCED: [1, 1, 1, 1, 1, 1, 1],
    ATTACKER: [1.3, 1.8, 0.6, 0.8, 0.8, 0.8, 1.5],
    PLAYMAKER: [1, 0.8, 2, 2.2, 1, 1.4, 0.6],
    DEFENDER: [1, 0.6, 1, 0.8, 2.2, 1.5, 0.6]
  };
  var CFG_DEF = { learn: true, mine: true, lr: 1, explore: 1, clap: 1, help: 'AUTO', style: 'BALANCED', size: 'SMALL' };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function freshStats() {
    return {
      matches: 0, mins: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, goals: 0, shots: 0, onTarget: 0, passes: 0, passOk: 0,
      fwdPass: 0, tackles: 0, won: 0, lost: 0, fouls: 0, claps: 0, clapSum: 0, reward: 0, decisions: 0, modelDec: 0,
      rl: 0, im: 0, humanSamples: 0, cpuSamples: 0, carryT: 0, sprintT: 0, playT: 0, xSum: 0, xN: 0, trainMatches: 0,
      btn: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hist: []
    };
  }

  /* ------------------------------------------------------------------ a brain */

  function newId() { return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function Brain(id, name, size) {
    this.id = id;
    this.name = name;
    this.created = Date.now();
    this.saved = 0;
    this.parent = '';
    this.from = 'new';
    this.cfg = {};
    for (var k in CFG_DEF) this.cfg[k] = CFG_DEF[k];
    this.st = freshStats();
    this.hist = [];
    this.frozen = false;  // an opponent in training: plays, does not learn
    this.dirty = false;
    this.build(size || 'SMALL');
  }
  Brain.prototype.build = function (size) {
    if (!SIZES[size]) size = 'SMALL';
    this.cfg.size = size;
    var H1 = this.H1 = SIZES[size][0], H2 = this.H2 = SIZES[size][1];
    this.OW1 = 0; this.OB1 = H1 * F; this.OW2 = this.OB1 + H1; this.OB2 = this.OW2 + H2 * H1; this.OW3 = this.OB2 + H2;
    this.OB3 = this.OW3 + NOUT * H2;
    this.NP = this.OB3 + NOUT;
    this.TENS = [[this.OW1, H1 * F], [this.OB1, H1], [this.OW2, H2 * H1], [this.OB2, H2], [this.OW3, NOUT * H2], [this.OB3, NOUT]];
    this.P = new Float32Array(this.NP); this.G = new Float32Array(this.NP);
    this.AM = new Float32Array(this.NP); this.AV = new Float32Array(this.NP);
    this.h1 = new Float32Array(H1); this.h2 = new Float32Array(H2); this.dh1 = new Float32Array(H1); this.dh2 = new Float32Array(H2);
    this.adamT = 0;
    this.memX = null; this.memN = 0; this.memI = 0;
    this.init();
  };
  Brain.prototype.init = function () {
    for (var t = 0; t < this.TENS.length; t++) {
      var o = this.TENS[t][0], n = this.TENS[t][1];
      var fan = t === 0 ? F : (t === 2 ? this.H1 : (t === 4 ? this.H2 : 0));
      var s = fan ? Math.sqrt(1.5 / fan) : 0;
      for (var i = 0; i < n; i++) this.P[o + i] = fan ? (Math.random() * 2 - 1) * s : 0;
    }
    this.P[this.OB3 + O_BT] = 3;    // a new brain mostly presses nothing
    this.P[this.OB3 + O_PW + 1] = 0.5;
    this.AM.fill(0); this.AV.fill(0); this.adamT = 0;
  };
  Brain.prototype.learns = function () { return trainer && this.cfg.learn && !this.frozen; };
  Brain.prototype.help = function () {
    var h = HELP[this.cfg.help];
    if (h === undefined || h < 0) h = clamp(1 - this.st.decisions / 150000, 0.35, 1);
    return h;
  };
  Brain.prototype.log = function (k, data) {
    this.hist.push({ t: Date.now(), k: k, d: data || null });
    if (this.hist.length > HIST_MAX) this.hist.shift();
    this.dirty = true;
  };
  Brain.prototype.styleW = function (i) { return (STYLES[this.cfg.style] || STYLES.BALANCED)[i]; };

  // ---- network (shared scratch for the outputs: everything runs synchronously)
  var out = new Float32Array(NOUT), dout = new Float32Array(NOUT);
  var prob = new Float32Array(16);
  var bmask = new Uint8Array(NBT);
  var xs = new Float32Array(F), rx = new Float32Array(F), ux = new Float32Array(F);

  function forward(b, x) {
    var P = b.P, h1 = b.h1, h2 = b.h2, H1 = b.H1, H2 = b.H2;
    var i, j, s, o;
    for (i = 0; i < H1; i++) {
      s = P[b.OB1 + i]; o = b.OW1 + i * F;
      for (j = 0; j < F; j++) s += P[o + j] * x[j];
      h1[i] = Math.tanh(s);
    }
    for (i = 0; i < H2; i++) {
      s = P[b.OB2 + i]; o = b.OW2 + i * H1;
      for (j = 0; j < H1; j++) s += P[o + j] * h1[j];
      h2[i] = Math.tanh(s);
    }
    for (i = 0; i < NOUT; i++) {
      s = P[b.OB3 + i]; o = b.OW3 + i * H2;
      for (j = 0; j < H2; j++) s += P[o + j] * h2[j];
      out[i] = s;
    }
  }

  // gradients of the loss w.r.t. the outputs are in dout: backprop, clip, one Adam step
  function backward(b, x) {
    var P = b.P, G = b.G, h1 = b.h1, h2 = b.h2, dh1 = b.dh1, dh2 = b.dh2, H1 = b.H1, H2 = b.H2, NP = b.NP;
    var i, j, o, d;
    G.fill(0);
    for (j = 0; j < H2; j++) dh2[j] = 0;
    for (i = 0; i < NOUT; i++) {
      d = dout[i];
      if (d === 0) continue;
      G[b.OB3 + i] += d;
      o = b.OW3 + i * H2;
      for (j = 0; j < H2; j++) { G[o + j] += d * h2[j]; dh2[j] += P[o + j] * d; }
    }
    for (j = 0; j < H1; j++) dh1[j] = 0;
    for (i = 0; i < H2; i++) {
      d = dh2[i] * (1 - h2[i] * h2[i]);
      G[b.OB2 + i] += d;
      o = b.OW2 + i * H1;
      for (j = 0; j < H1; j++) { G[o + j] += d * h1[j]; dh1[j] += P[o + j] * d; }
    }
    for (i = 0; i < H1; i++) {
      d = dh1[i] * (1 - h1[i] * h1[i]);
      G[b.OB1 + i] += d;
      o = b.OW1 + i * F;
      for (j = 0; j < F; j++) G[o + j] += d * x[j];
    }
    var n2 = 0;
    for (i = 0; i < NP; i++) n2 += G[i] * G[i];
    var sc = n2 > 25 ? 5 / Math.sqrt(n2) : 1;
    b.adamT++;
    var lr = LR[b.cfg.lr] || LR[1];
    var c1 = 1 - Math.pow(0.9, b.adamT), c2 = 1 - Math.pow(0.999, b.adamT);
    var a = lr * Math.sqrt(c2) / c1;
    var AM = b.AM, AV = b.AV;
    for (i = 0; i < NP; i++) {
      var g = G[i] * sc;
      AM[i] = 0.9 * AM[i] + 0.1 * g;
      AV[i] = 0.999 * AV[i] + 0.001 * g * g;
      P[i] -= a * AM[i] / (Math.sqrt(AV[i]) + 1e-8);
    }
    b.dirty = true;
  }

  function softmax(off, n, mask, temp) {
    var mx = -1e9, i;
    for (i = 0; i < n; i++) if ((!mask || mask[i]) && out[off + i] > mx) mx = out[off + i];
    var s = 0;
    for (i = 0; i < n; i++) {
      var e = (!mask || mask[i]) ? Math.exp((out[off + i] - mx) / temp) : 0;
      prob[i] = e; s += e;
    }
    for (i = 0; i < n; i++) prob[i] /= s;
  }
  function sample(n) {
    var r = Math.random(), i;
    for (i = 0; i < n - 1; i++) { r -= prob[i]; if (r <= 0) return i; }
    return n - 1;
  }
  // cross-entropy / policy-gradient gradient for one head: coef * (p - onehot) (+ entropy bonus)
  function headGrad(off, n, mask, a, coef, ent) {
    softmax(off, n, mask, 1);
    var H = 0, i;
    if (ent) for (i = 0; i < n; i++) if (prob[i] > 1e-9) H -= prob[i] * Math.log(prob[i]);
    for (i = 0; i < n; i++) {
      var g = coef * (prob[i] - (i === a ? 1 : 0));
      if (ent && prob[i] > 1e-9) g += ent * prob[i] * (Math.log(prob[i]) + H);
      dout[off + i] += g;
    }
  }
  function setMask(ctx) {
    bmask[0] = 1;
    for (var k = 0; k < B.MOVES.length; k++) bmask[k + 1] = (B.MOVES[k].ctx === ctx && B.MOVES[k].mask) ? 1 : 0;
  }

  /* ------------------------------------------------------------------ inputs */

  var NR = [0, 0, 0], NRD = [0, 0, 0];
  var poss = [0, 0], shotsT = [0, 0];

  function airNear(p) {
    var ball = World.ball;
    if (ball.owner || ball.pos.y < 1.3 || ball.pos.y > 6) return false;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    return dx * dx + dz * dz < 16;
  }
  function ctxOf(p) { var o = World.ball.owner; return o === p ? 1 : (airNear(p) ? 1 : 2); }

  function nearest3(p, team) {
    var players = World.players;
    NR[0] = NR[1] = NR[2] = -1; NRD[0] = NRD[1] = NRD[2] = 1e9;
    for (var i = 0; i < players.length; i++) {
      var q = players[i];
      if (q === p || q.team !== team || q.role === 'GK') continue;
      var dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
      var d = dx * dx + dz * dz;
      if (d >= NRD[2]) continue;
      var k = 2;
      while (k > 0 && NRD[k - 1] > d) { NRD[k] = NRD[k - 1]; NR[k] = NR[k - 1]; k--; }
      NRD[k] = d; NR[k] = i;
    }
  }

  // 64 inputs, in the team's frame (x towards the goal it attacks)
  function features(p, x) {
    var ball = World.ball, m = World.match, players = World.players;
    var HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H;
    var a = p.team === 0 ? 1 : -1;
    var px = p.pos.x * a, pz = p.pos.z;
    var o = ball.owner;
    var i, k, q, dx, dz;
    x[0] = px / HW; x[1] = pz / HH;
    x[2] = p.vel.x * a / 12; x[3] = p.vel.z / 12;
    x[4] = p.stamina / 100;
    x[5] = o === p ? 1 : 0;
    x[6] = o && o !== p && o.team === p.team ? 1 : 0;
    x[7] = o && o.team !== p.team ? 1 : 0;
    x[8] = o ? 0 : 1;
    dx = (ball.pos.x - p.pos.x) * a; dz = ball.pos.z - p.pos.z;
    x[9] = clamp(dx / 30, -1.5, 1.5); x[10] = clamp(dz / 30, -1.5, 1.5);
    x[11] = ball.pos.y / 4;
    x[12] = ball.vel.x * a / 25; x[13] = ball.vel.z / 25;
    x[14] = Math.sqrt(dx * dx + dz * dz) / 40;
    var gx = HW - px;
    x[15] = gx / (2 * HW);
    x[16] = Math.abs(Math.atan2(NS.GOAL_HALF_W - pz, gx) - Math.atan2(-NS.GOAL_HALF_W - pz, gx)) / 1.5;
    x[17] = Math.sqrt(gx * gx + pz * pz) / 60;
    var bgx = ball.pos.x * a + HW;
    x[18] = Math.sqrt(bgx * bgx + ball.pos.z * ball.pos.z) / 60;
    x[19] = ball.receiver === p ? 1 : 0;
    x[20] = ball.contester === p ? 1 : 0;
    for (var side = 0; side < 2; side++) {
      nearest3(p, side === 0 ? 1 - p.team : p.team);
      var base = side === 0 ? 21 : 30;
      for (k = 0; k < 3; k++) {
        if (NR[k] < 0) { x[base + k * 3] = 1; x[base + k * 3 + 1] = 0; x[base + k * 3 + 2] = 1.5; continue; }
        q = players[NR[k]];
        x[base + k * 3] = clamp((q.pos.x - p.pos.x) * a / 20, -2, 2);
        x[base + k * 3 + 1] = clamp((q.pos.z - p.pos.z) / 20, -2, 2);
        x[base + k * 3 + 2] = Math.min(1.5, Math.sqrt(NRD[k]) / 20);
      }
    }
    if (o && o.team !== p.team) {
      x[39] = clamp((o.pos.x - p.pos.x) * a / 20, -2, 2);
      x[40] = clamp((o.pos.z - p.pos.z) / 20, -2, 2);
      var cgx = o.pos.x * a + HW;
      x[41] = Math.sqrt(cgx * cgx + o.pos.z * o.pos.z) / 60;
    } else { x[39] = 0; x[40] = 0; x[41] = 0; }
    x[42] = m.restart && m.setTaker === p ? 1 : 0;
    x[43] = m.restart / 6;
    x[44] = m.penalty ? 1 : 0;
    var block = 0, ahead = 0, goalSide = 0, deep = 1e9, mine = 0, theirs = 0;
    var lx = gx, lz = -pz, ll = Math.sqrt(lx * lx + lz * lz) || 1;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      var qx = q.pos.x * a;
      if (q.team === p.team) {
        if (q.role !== 'GK') mine++;
        if (q !== p && qx > px + 3) ahead++;
        continue;
      }
      if (q.role === 'GK') continue;
      theirs++;
      if (qx > px) goalSide++;
      if (-qx < deep) deep = -qx;
      var ox = qx - px, oz = q.pos.z - pz;
      var u = (ox * lx + oz * lz) / ll;
      if (u > 0.5 && u < ll && Math.abs(ox * lz - oz * lx) / ll < 1.5) block++;
    }
    x[45] = block / 3; x[46] = ahead / 5; x[47] = goalSide / 6;
    x[48] = clamp((-deep - px) / 30, -2, 2);
    x[49] = airNear(p) ? 1 : 0;
    // the match: time, score, numbers, cards, possession, shots
    var frac = clamp(m.timeSeconds / 5400, 0, 1.1);
    var my = m.score[p.team], th = m.score[1 - p.team];
    x[50] = frac; x[51] = 1 - frac; x[52] = m.half > 1 ? 1 : 0;
    x[53] = clamp((my - th) / 3, -1.5, 1.5); x[54] = my / 5; x[55] = th / 5;
    x[56] = (mine - theirs) / 3;
    x[57] = m.warned[p.team] ? 1 : 0; x[58] = m.warned[1 - p.team] ? 1 : 0;
    x[59] = (p.fouls || 0) / 2;
    var pt = poss[0] + poss[1];
    x[60] = pt > 1 ? poss[p.team] / pt - 0.5 : 0;
    x[61] = clamp((shotsT[p.team] - shotsT[1 - p.team]) / 5, -2, 2);
    x[62] = my < th ? frac : 0;
    x[63] = 1;
  }

  /* ------------------------------------------------------------------ copying (imitation) */

  function remember(b, x, stk, spr, btn, pw, ctx, w) {
    if (!b.memX) { b.memX = new Float32Array(MEM * F); b.memA = new Int8Array(MEM * 5); b.memW = new Float32Array(MEM); }
    var o = b.memI * F;
    for (var j = 0; j < F; j++) b.memX[o + j] = x[j];
    o = b.memI * 5;
    b.memA[o] = stk; b.memA[o + 1] = spr; b.memA[o + 2] = btn; b.memA[o + 3] = pw; b.memA[o + 4] = ctx;
    b.memW[b.memI] = w;
    b.memI = (b.memI + 1) % MEM;
    if (b.memN < MEM) b.memN++;
  }

  function imitateOne(b) {
    if (!b.memN) return;
    var i = Math.floor(Math.random() * b.memN);
    var o = i * F;
    for (var j = 0; j < F; j++) rx[j] = b.memX[o + j];
    o = i * 5;
    var stk = b.memA[o], spr = b.memA[o + 1], btn = b.memA[o + 2], pw = b.memA[o + 3], ctx = b.memA[o + 4];
    var w = b.memW[i];
    forward(b, rx);
    dout.fill(0);
    headGrad(O_ST, NST, null, stk, w, 0);
    headGrad(O_SP, NSP, null, spr, w * 0.5, 0);
    setMask(ctx);
    if (bmask[btn]) headGrad(O_BT, NBT, bmask, btn, w * (btn ? 2.5 : 1), 0);
    if (btn && pw >= 0) headGrad(O_PW, NPW, null, pw, w, 0);
    backward(b, rx);
    b.st.im++;
  }

  // stick (world) -> one of 9 classes in the team's frame (0 = none)
  function stickClass(sx, sz, a) {
    var l = Math.sqrt(sx * sx + sz * sz);
    if (l < 0.35) return 0;
    var ang = Math.atan2(sz, sx * a);
    var k = Math.round(ang / (Math.PI / 4));
    if (k < 0) k += 8;
    return 1 + (k % 8);
  }

  // a move made right now (by the CPU in a copying spell): the situation at that very moment
  function copyMove(b, p, mi, pw, w) {
    if (!b.learns() || mi < 0) return;
    var a = p.team === 0 ? 1 : -1;
    features(p, xs);
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    remember(b, xs, sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a), sp > 10.2 ? 1 : 0, mi + 1, pw, B.MOVES[mi].ctx, w);
  }

  /* ------------------------------------------------------------------ the checkoAI controller (one per team) */

  var KICK_MOVE = {};
  KICK_MOVE[ACT.PASS] = 0; KICK_MOVE[ACT.THROUGH] = 1; KICK_MOVE[ACT.LONG] = 2;
  KICK_MOVE[ACT.SHOOT] = 3; KICK_MOVE[ACT.CURVE] = 4; KICK_MOVE[ACT.CHIP] = 5;
  var I_TACKLE = B.index('tackle'), I_SLIDE = B.index('slide'), I_PRESS = B.index('press');

  function makeCtl(slot) {
    slot.pad = { x: 0, y: 0, cur: 0, latch: 0, burst: false };
    slot.ai = true;
    slot.brain = null;
    slot.c = {
      t: 0, mode: 1, modeT: 0, cpu: true, stk: 0, spr: 0, btnMask: 0, holdLeft: 0, tBtn: 0,
      traj: new Float32Array(TRAJ * F), ta: new Int8Array(TRAJ * 4), tv: new Float32Array(TRAJ), tr: new Float32Array(TRAJ),
      tctx: new Int8Array(TRAJ), tn: 0, th: 0
    };
  }

  // n-step update of the oldest step of the slot's trajectory (bootstrap: the newest value, or 0 at the end)
  function learnOldest(b, c, boot) {
    var n = c.tn;
    if (!n) return;
    var i0 = c.th;
    var R = 0, g = 1;
    for (var k = 0; k < n; k++) { R += g * c.tr[(i0 + k) % TRAJ]; g *= GAMMA; }
    if (boot) R += g * c.tv[(i0 + n - 1) % TRAJ];
    if (b && b.learns()) {
      var o = i0 * F;
      for (var j = 0; j < F; j++) ux[j] = c.traj[o + j];
      forward(b, ux);
      var A = clamp(R - out[O_V], -2, 2);
      dout.fill(0);
      dout[O_V] = (out[O_V] - R) * 0.5;
      var ao = i0 * 4;
      headGrad(O_ST, NST, null, c.ta[ao], A, 0.01);
      headGrad(O_SP, NSP, null, c.ta[ao + 1], A * 0.5, 0.01);
      if (c.ta[ao + 2] >= 0) {
        setMask(c.tctx[i0]);
        headGrad(O_BT, NBT, bmask, c.ta[ao + 2], A, 0.01);
        if (c.ta[ao + 3] >= 0) headGrad(O_PW, NPW, null, c.ta[ao + 3], A * 0.5, 0.005);
      }
      backward(b, ux);
      b.st.rl++;
    }
    c.th = (c.th + 1) % TRAJ;
    c.tn--;
  }
  function flush(slot) {
    var c = slot.c;
    while (c.tn) learnOldest(slot.brain, c, false);
  }

  var matchReward = [0, 0];
  function addReward(team, r) {
    var s = World.aiSlots[team];
    if (!s || !s.active || !s.brain) return;
    s.brain.st.reward += r;
    matchReward[team] += r;
    var c = s.c;
    if (c.tn) c.tr[(c.th + c.tn - 1) % TRAJ] += r;
  }

  // one decision of the brain: stick, sprint, maybe a button with its hold time
  function decide(slot, p) {
    var b = slot.brain, c = slot.c;
    features(p, xs);
    forward(b, xs);
    var temp = TEMP[b.cfg.explore] || 1;
    softmax(O_ST, NST, null, temp);
    var stk = sample(NST);
    softmax(O_SP, NSP, null, temp);
    var spr = sample(NSP);
    var btn = -1, pw = -1;
    var ctx = ctxOf(p);
    if (c.holdLeft <= 0) {
      setMask(ctx);
      softmax(O_BT, NBT, bmask, temp);
      btn = sample(NBT);
      if (btn > 0) {
        softmax(O_PW, NPW, null, temp);
        pw = sample(NPW);
        var mv = B.MOVES[btn - 1];
        var full = World.settings.gaugeTime > 0 ? World.settings.gaugeTime : 0.5;
        c.btnMask = mv.mask;
        c.holdLeft = mv.kind === 2 ? HOLD_CONT[pw] : (mv.ctx === 2 ? 0.1 : HOLD_PASS[pw] * full);
        slot.pad.latch |= mv.mask;
        b.st.btn[btn]++;
      }
    }
    c.stk = stk; c.spr = spr;
    think(slot, p, btn, stk, spr);
    if (c.tn === TRAJ) learnOldest(b, c, true);
    var idx = (c.th + c.tn) % TRAJ;
    var o = idx * F;
    for (var j = 0; j < F; j++) c.traj[o + j] = xs[j];
    o = idx * 4;
    c.ta[o] = stk; c.ta[o + 1] = spr; c.ta[o + 2] = btn; c.ta[o + 3] = pw;
    c.tctx[idx] = ctx;
    c.tv[idx] = out[O_V];
    c.tr[idx] = 0;
    c.tn++;
    if (c.tn > NSTEP) learnOldest(b, c, true);
    b.st.modelDec++;
  }

  // the CPU played this tick: copy what it did (moves are copied at the moment they happen, see the hooks)
  function copyCpu(slot, p) {
    var b = slot.brain, c = slot.c;
    var a = p.team === 0 ? 1 : -1;
    if (b.learns() && c.tBtn === 0) {
      features(p, xs);
      var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      remember(b, xs, sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a), sp > 10.2 ? 1 : 0, 0, -1, ctxOf(p), 0.6);
    }
    b.st.cpuSamples++;
    think(slot, p, 0, 0, 0);
    c.tBtn = 0;
  }

  /* ------------------------------------------------------------------ rewards, stats (polled every step) */

  var lastOwner = null, lastOwnerAi = false, lastScore = [0, 0], matchOn = false;
  var pendShot = null, pendShotT = 0, pendShotOn = false, lastSetPiece = 0;
  var modelPass = false;   // the ball in play was last passed by a brain itself (not in a Legend spell)
  var tackleT = [0, 0];

  function slotOf(p) { var s = World.aiSlots[p.team]; return s && s.active && s.player === p && s.brain ? s : null; }
  function aiOf(p) { var s = slotOf(p); return !!s && !s.c.cpu; }
  function brainOfTeam(t) { var s = World.aiSlots[t]; return s && s.active ? s.brain : null; }

  // kick / tackle / shoulder hooks (wrapped once on load; debug matches wrap on top of them)
  var origRelease = Actions.release;
  Actions.release = function (p, type) {
    var sc = World.match.running ? slotOf(p) : null;
    if (sc && sc.c.cpu && KICK_MOVE[type] !== undefined) {
      copyMove(sc.brain, p, KICK_MOVE[type], type >= ACT.SHOOT ? 2 : 1, 1.2); // he still has the ball here
      sc.c.tBtn = 1;
    }
    origRelease.apply(this, arguments);
    if (!World.match.running) return;
    modelPass = !!sc && !sc.c.cpu && type < ACT.SHOOT;
    if (type >= ACT.SHOOT) shotsT[p.team]++;
    if (!sc || sc.c.cpu) return;
    var st = sc.brain.st;
    if (type >= ACT.SHOOT) {
      st.shots++; pendShot = p; pendShotT = 4; pendShotOn = false;
      addReward(p.team, 0.15 * sc.brain.styleW(1));
    } else {
      st.passes++;
    }
  };
  var origTackle = Actions.startTackle;
  Actions.startTackle = function (p, carrier, human, slide) {
    var sc = World.match.running ? slotOf(p) : null;
    if (sc && sc.c.cpu) { copyMove(sc.brain, p, slide ? I_SLIDE : I_TACKLE, -1, 1.2); sc.c.tBtn = 1; }
    var r = origTackle.apply(this, arguments);
    if (sc) {
      if (!sc.c.cpu) sc.brain.st.tackles++;
      tackleT[p.team] = 0.8;
    }
    return r;
  };
  var origShoulder = Actions.shoulder;
  Actions.shoulder = function (p) {
    var sc = World.match.running ? slotOf(p) : null;
    if (sc && sc.c.cpu) { copyMove(sc.brain, p, I_PRESS, 1, 1); sc.c.tBtn = 1; }
    return origShoulder.apply(this, arguments);
  };

  function poll(dt) {
    var ball = World.ball, m = World.match;
    var o = ball.owner, b;
    if (o) poss[o.team] += dt;
    for (var t = 0; t < 2; t++) {
      if (m.score[t] !== lastScore[t]) {
        var diff = m.score[t] - lastScore[t];
        lastScore[t] = m.score[t];
        if (diff <= 0) continue;
        b = brainOfTeam(t);
        addReward(t, 1.0 * (b ? b.styleW(0) : 1));
        addReward(1 - t, -0.8);
        if (pendShot && pendShot.team === t && b) { b.st.goals++; b.st.onTarget++; addReward(t, 0.5 * b.styleW(0)); pendShot = null; }
      }
      if (tackleT[t] > 0) tackleT[t] -= dt;
    }
    if (pendShot) {
      pendShotT -= dt;
      b = brainOfTeam(pendShot.team);
      if (b && !pendShotOn && (ball.gkTried & (1 << (1 - pendShot.team)))) { pendShotOn = true; b.st.onTarget++; addReward(pendShot.team, 0.1); }
      if (pendShotT <= 0) pendShot = null;
    }
    if (o && o !== lastOwner) {
      if (lastOwner) {
        var lt = lastOwner.team, a = lt === 0 ? 1 : -1;
        b = brainOfTeam(lt);
        if (lastOwnerAi && b) {
          if (o.team !== lt) { b.st.lost++; addReward(lt, -0.25 * b.styleW(5)); }
          else if (modelPass) {
            b.st.passOk++;
            var gain = (o.pos.x - lastOwner.pos.x) * a;
            addReward(lt, 0.08 * b.styleW(2) + (gain > 5 ? 0.12 * b.styleW(3) : 0));
            if (gain > 5) b.st.fwdPass++;
          }
        }
        var bo = brainOfTeam(o.team);
        if (bo && aiOf(o) && o.team !== lt) { bo.st.won++; addReward(o.team, 0.25 * bo.styleW(4)); }
      }
      lastOwner = o;
      lastOwnerAi = aiOf(o);
    }
    if (o && aiOf(o)) {
      b = brainOfTeam(o.team);
      b.st.carryT += dt;
      addReward(o.team, 0.004 * b.styleW(6) * o.vel.x * (o.team === 0 ? 1 : -1) * dt);
    }
    if (m.setPiece !== lastSetPiece) {
      var ft = 1 - m.setTeam;
      if ((m.setPiece === 1 || m.setPiece === 2) && m.setPieceTimer > 0 && tackleT[ft] > 0 && World.aiSlots[ft].active && World.aiSlots[ft].brain) {
        World.aiSlots[ft].brain.st.fouls++; addReward(ft, -0.3);
      }
      lastSetPiece = m.setPiece;
    }
  }

  /* ------------------------------------------------------------------ what he is thinking (the status box) */

  var thought = 'watch', thoughtT = 0, happyT = 0;
  function think(slot, p, btn, stk, spr) {
    // the status box follows the trainer's opponent (or team 1 when the CPU plays both)
    if (slot.team !== showTeam()) return;
    var m = World.match, o = World.ball.owner;
    var key;
    var frac = m.timeSeconds / 5400, my = m.score[p.team], th = m.score[1 - p.team];
    if (happyT > 0) key = 'happy';
    else if (slot.c.cpu) key = 'watch';
    else if (btn > 0 && B.MOVES[btn - 1].ctx === 1) {
      var id = B.MOVES[btn - 1].id;
      key = id === 'shoot' || id === 'curve' || id === 'chip' ? 'shoot' : (id === 'through' ? 'through' : (id === 'long' ? 'long' : 'pass'));
    } else if (btn > 0) key = B.MOVES[btn - 1].id === 'switch' ? 'switch' : 'win';
    else if (my < th && frac > 0.7 && Math.random() < 0.3) key = 'losing';
    else if (my > th && frac > 0.75 && Math.random() < 0.3) key = 'lead';
    else if (o === p) key = spr && (stk === 1 || stk === 2 || stk === 8) ? 'run' : 'look';
    else if (o && o.team === p.team) key = spr ? 'runbehind' : 'option';
    else if (o) key = 'close';
    else key = 'chase';
    if (key !== thought && (thoughtT <= 0 || key === 'shoot' || key === 'happy')) { thought = key; thoughtT = 0.6; }
  }
  function showTeam() { return World.aiSlots[1].active ? 1 : 0; }

  function anyAi() { return World.aiSlots[0].active || World.aiSlots[1].active; }

  /* ------------------------------------------------------------------ brains: the list, loading, saving */

  var index = { brains: [], active: '' };   // [{ id, name, size, matches, updated, parent }]
  var loaded = {};                          // id -> Brain (with its weights)
  var active = null;                        // the brain that plays (and that everybody else gets)
  var teamBrains = [null, null];            // training: the brain of each team (null = the active one)
  var trainer = false, profile = { id: '', name: '' };
  var lastSave = 0;

  function b64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  // weights as int16 with one scale per tensor
  function packWeights(b) {
    var q = new Int16Array(b.NP), scales = [];
    for (var t = 0; t < b.TENS.length; t++) {
      var o = b.TENS[t][0], n = b.TENS[t][1], mx = 1e-6, i;
      for (i = 0; i < n; i++) mx = Math.max(mx, Math.abs(b.P[o + i]));
      var s = mx / 32767;
      scales.push(s);
      for (i = 0; i < n; i++) q[o + i] = Math.round(b.P[o + i] / s);
    }
    return { dims: [F, b.H1, b.H2, NOUT], sc: scales, w: b64(new Uint8Array(q.buffer)) };
  }
  function unpackWeights(b, obj) {
    if (!obj || !obj.dims || obj.dims[0] !== F || obj.dims[3] !== NOUT) return false;
    var size = null;
    for (var k in SIZES) if (SIZES[k][0] === obj.dims[1] && SIZES[k][1] === obj.dims[2]) size = k;
    if (!size) return false;
    if (b.H1 !== obj.dims[1] || b.H2 !== obj.dims[2]) b.build(size);
    var u = unb64(obj.w);
    if (u.length !== b.NP * 2) return false;
    var q = new Int16Array(u.buffer);
    for (var t = 0; t < b.TENS.length; t++) {
      var o = b.TENS[t][0], n = b.TENS[t][1], s = obj.sc[t];
      for (var i = 0; i < n; i++) b.P[o + i] = q[o + i] * s;
    }
    b.AM.fill(0); b.AV.fill(0); b.adamT = 0;
    return true;
  }

  function toDoc(b) {
    return { v: 2, alg: ALG, id: b.id, name: b.name, created: b.created, saved: b.saved, parent: b.parent, from: b.from,
      cfg: b.cfg, st: b.st, hist: b.hist, m: packWeights(b) };
  }
  function fromDoc(d) {
    if (!d || d.v !== 2 || !d.m) return null;
    var b = new Brain(d.id, d.name || 'checkoAI', (d.cfg && d.cfg.size) || 'SMALL');
    if (!unpackWeights(b, d.m)) return null;
    b.created = d.created || Date.now(); b.saved = d.saved || 0; b.parent = d.parent || ''; b.from = d.from || 'save';
    var k;
    if (d.cfg) for (k in d.cfg) if (Object.prototype.hasOwnProperty.call(CFG_DEF, k)) b.cfg[k] = d.cfg[k];
    b.cfg.size = b.H1 === SIZES.LARGE[0] ? 'LARGE' : (b.H1 === SIZES.HUGE[0] ? 'HUGE' : 'SMALL');
    if (d.st) for (k in d.st) if (Object.prototype.hasOwnProperty.call(b.st, k)) b.st[k] = d.st[k];
    b.hist = d.hist || [];
    return b;
  }
  function entry(b) {
    return { id: b.id, name: b.name, size: b.cfg.size, matches: b.st.matches, updated: b.saved || b.created, parent: b.parent };
  }
  function syncEntry(b) {
    for (var i = 0; i < index.brains.length; i++) if (index.brains[i].id === b.id) { index.brains[i] = entry(b); return; }
    index.brains.push(entry(b));
  }

  // ---- cloud store (the owner's Firebase project, REST)
  var cloud = null, auth = null, idTok = '', idExp = 0, tokP = null;
  function cloudCfg() {
    var c = (MyPC.app_config && MyPC.app_config.aimaFirebase) || NS.AIMA_CLOUD;
    return c && c.apiKey && c.projectId ? c : null;
  }
  function saveAuth() { try { MyPC.save('aimaAuth', auth); } catch (e) {} }
  function post(url, body, form) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: body })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status); return j; }); });
  }
  // a valid ID token: refreshed from the saved refresh token, or a new anonymous account
  function token() {
    if (idTok && Date.now() < idExp - 60000) return Promise.resolve(idTok);
    if (tokP) return tokP;
    var key = encodeURIComponent(cloud.apiKey);
    if (auth && auth.refresh) {
      tokP = post('https://securetoken.googleapis.com/v1/token?key=' + key,
        'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refresh), true).then(function (j) {
        idTok = j.id_token; idExp = Date.now() + (+j.expires_in || 3600) * 1000;
        if (j.refresh_token && j.refresh_token !== auth.refresh) { auth.refresh = j.refresh_token; saveAuth(); }
        tokP = null; return idTok;
      }, function (e) { tokP = null; throw e; });
    } else {
      tokP = post('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + key, JSON.stringify({ returnSecureToken: true })).then(function (j) {
        auth = { refresh: j.refreshToken, uid: j.localId, anon: true };
        saveAuth();
        idTok = j.idToken; idExp = Date.now() + (+j.expiresIn || 3600) * 1000;
        tokP = null; return idTok;
      }, function (e) { tokP = null; throw e; });
    }
    return tokP;
  }
  function docUrl(id) {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cloud.projectId) +
      '/databases/(default)/documents/aima/' + id + '?key=' + encodeURIComponent(cloud.apiKey);
  }
  function cloudGet(id) {
    if (!cloud) return Promise.resolve(null);
    return token().then(function (t) {
      return fetch(docUrl(id), { headers: { Authorization: 'Bearer ' + t } });
    }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      return d && d.fields && d.fields.data ? JSON.parse(d.fields.data.stringValue) : null;
    });
  }
  function canWrite() { return !!(cloud && trainer && auth && !auth.anon); }
  // one write at a time per document (the newest content wins)
  var putBusy = {}, putNext = {};
  function cloudPut(id, obj) {
    if (!canWrite()) return;
    if (putBusy[id]) { putNext[id] = obj; return; }
    putBusy[id] = true;
    var body = JSON.stringify({ fields: { data: { stringValue: JSON.stringify(obj) }, updated: { integerValue: String(Date.now()) } } });
    token().then(function (t) {
      return fetch(docUrl(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body });
    }).then(function (r) {
      Aima.cloud = r.ok ? 'ok' : 'error ' + r.status;
    }, function (e) { Aima.cloud = 'error ' + (e && e.message ? e.message : 'network'); }).then(function () {
      putBusy[id] = false;
      if (putNext[id]) { var n = putNext[id]; putNext[id] = null; cloudPut(id, n); }
    });
  }
  function cloudDelete(id) {
    if (!canWrite()) return;
    token().then(function (t) { return fetch(docUrl(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } }); }).catch(function () {});
  }

  // saves one brain (cloud) and the list; the active SMALL brain also goes to My PC's save (works offline)
  function saveBrain(b) {
    if (!trainer || !b) return;
    b.saved = Date.now();
    b.dirty = false;
    syncEntry(b);
    var doc = toDoc(b);
    Aima.sizeKB = Math.round(JSON.stringify(doc).length / 102.4) / 10;
    cloudPut('b_' + b.id, doc);
    saveIndex();
  }
  function saveIndex() {
    if (!trainer) return;
    cloudPut('index', { v: 2, brains: index.brains, active: index.active, updated: Date.now() });
    var local = { v: 2, index: index, active: null };
    if (active && active.cfg.size === 'SMALL') local.active = toDoc(active);
    try { MyPC.save(SAVE_KEY, local); } catch (e) {}
    lastSave = performance.now();
  }

  // a brain by id: in memory, else from the cloud
  function getBrain(id) {
    if (loaded[id]) return Promise.resolve(loaded[id]);
    return cloudGet('b_' + id).then(function (d) {
      var b = fromDoc(d);
      if (!b) throw new Error('brain not found');
      loaded[b.id] = b;
      return b;
    });
  }

  function newBrain(name) {
    var b = new Brain(newId(), name, 'SMALL');
    b.log('created');
    loaded[b.id] = b;
    syncEntry(b);
    return b;
  }

  function setActive(b) {
    active = b;
    index.active = b.id;
    for (var t = 0; t < 2; t++) if (!teamBrains[t]) World.aiSlots[t].brain = b;
  }

  function load() {
    var obj = null;
    try { obj = MyPC.load(SAVE_KEY, null); } catch (e) { obj = null; }
    if (trainer && obj && obj.v === 2 && obj.index && obj.index.brains) {
      index = obj.index;
      var b = fromDoc(obj.active);
      if (b) { loaded[b.id] = b; setActive(b); return; }
    }
    // a first brain (or, for everyone else, until the cloud answers)
    var nb = newBrain('checkoAI');
    index.active = nb.id;
    setActive(nb);
  }

  // the list and the active brain from the cloud (the trainer: when newer than this device's copy)
  function loadCloud() {
    cloud = cloudCfg();
    if (!cloud) { Aima.cloud = 'off'; return; }
    Aima.cloud = 'loading';
    cloudGet('index').then(function (ix) {
      if (!ix || !ix.brains || !ix.brains.length) {
        // a new store: the trainer publishes his first brain
        if (canWrite()) saveBrain(active);
        Aima.cloud = 'ok';
        return null;
      }
      index = { brains: ix.brains, active: ix.active };
      if (!loaded[ix.active] || (trainer && loaded[ix.active].saved < (findEntry(ix.active) || {}).updated)) delete loaded[ix.active];
      return getBrain(ix.active).then(function (b) {
        if (!trainer) b.frozen = true;
        setActive(b);
        Aima.cloud = 'ok';
      });
    }).catch(function (e) { Aima.cloud = 'error ' + (e && e.message ? e.message : 'network'); });
  }
  function findEntry(id) { for (var i = 0; i < index.brains.length; i++) if (index.brains[i].id === id) return index.brains[i]; return null; }

  // ---- Google sign-in for the trainer (on a computer): Firebase Auth from Google's CDN, loaded only then
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = src;
      sc.onload = res;
      sc.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(sc);
    });
  }
  var FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  function signIn() {
    var c = cloudCfg();
    if (!c) return Promise.reject(new Error('no Firebase config'));
    var p = window.firebase && window.firebase.auth ? Promise.resolve() :
      loadScript(FB + 'firebase-app-compat.js').then(function () { return loadScript(FB + 'firebase-auth-compat.js'); });
    return p.then(function () {
      var fb = window.firebase;
      var app = fb.apps.length ? fb.app() : fb.initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain || c.projectId + '.firebaseapp.com',
        projectId: c.projectId, appId: c.appId });
      return app.auth().signInWithPopup(new fb.auth.GoogleAuthProvider());
    }).then(function (res) {
      return useRefresh(res.user.refreshToken, res.user.email || '', res.user.uid);
    });
  }
  // a refresh token (from the popup, or the code shown by aima-login.html): kept in the profile's save
  function useRefresh(refresh, email, uid) {
    cloud = cloudCfg();
    if (!cloud) return Promise.reject(new Error('no Firebase config'));
    auth = { refresh: String(refresh).trim(), uid: uid || '', email: email || '', anon: false };
    idTok = ''; idExp = 0;
    return token().then(function () {
      saveAuth();
      trainer = isImad();
      if (active) active.frozen = false;
      loadCloud();
      return auth.email || auth.uid || 'ok';
    });
  }
  function isImad() { return profile.name.trim().toLowerCase() === TRAINER; }

  /* ------------------------------------------------------------------ claps (the trainer only) */

  var clapDown = 0, clapOn = false;

  /* ------------------------------------------------------------------ training mode (full speed, js/game/debug.js) */

  var training = null;  // { cfg, brain, opp, st0, onProgress, onDone }

  function statDelta(a, b) {
    var d = {};
    for (var k in b) if (typeof b[k] === 'number') d[k] = b[k] - (a[k] || 0);
    return d;
  }
  function pct(n, d) { return d ? Math.round(n * 100 / d) + '%' : '-'; }
  function r1(v) { return Math.round(v * 10) / 10; }

  function trainSummary(t, d, rew) {
    var T = NS.I18n.t;
    var c = t.cfg, b = t.brain;
    var n = d.matches || 1;
    var half = Math.floor(rew.length / 2);
    var a1 = 0, a2 = 0, i;
    for (i = 0; i < half; i++) a1 += rew[i];
    for (i = half; i < rew.length; i++) a2 += rew[i];
    a1 = half ? a1 / half : 0; a2 = rew.length - half ? a2 / (rew.length - half) : 0;
    var trend = a2 - a1 > 0.3 ? T('aima.tr.better') : (a1 - a2 > 0.3 ? T('aima.tr.worse') : T('aima.tr.flat'));
    var L = [];
    L.push('checkoAI ' + T('aima.tr.title') + ': ' + b.name + '  v  ' + t.oppName + '   (' + d.matches + ' ' + T('aima.tr.matches') + ', ' +
      c.teamSize + ' ' + T('aima.tr.aside') + ', ' + c.stadium + ', ' + c.duration + ' min)');
    L.push(T('aima.tr.results') + ': ' + d.w + ' - ' + d.d + ' - ' + d.l + '   ' + T('aima.tr.goals') + ' ' + d.gf + ' - ' + d.ga +
      '   (' + r1(d.gf / n) + ' - ' + r1(d.ga / n) + ' ' + T('aima.tr.permatch') + ')');
    L.push(T('aima.tr.hisplay') + ': ' + d.shots + ' ' + T('aima.tr.shots') + ' (' + d.onTarget + ' ' + T('aima.k.ontarget') + ', ' + d.goals + ' ' +
      T('aima.tr.goalsby') + '), ' + d.passes + ' ' + T('aima.tr.passes') + ' (' + pct(d.passOk, d.passes) + ', ' + d.fwdPass + ' ' + T('aima.k.fwd') + '), ' +
      T('aima.k.wonlost') + ' ' + d.won + ' / ' + d.lost + ', ' + d.tackles + ' ' + T('aima.tr.tackles') + ', ' + d.fouls + ' ' + T('aima.tr.fouls'));
    L.push(T('aima.tr.learning') + ': ' + d.rl + ' RL + ' + d.im + ' ' + T('aima.k.copy') + '   ' + T('aima.k.own') + ' ' + pct(d.modelDec, d.decisions) +
      '   ' + T('aima.k.help') + ' ' + Math.round(t.help0 * 100) + '% -> ' + Math.round(b.help() * 100) + '%');
    L.push(T('aima.tr.reward') + ': ' + r1(a1) + ' -> ' + r1(a2) + ' ' + T('aima.tr.permatch') + '   ' + trend);
    return L.join('\n');
  }

  function trainFull(t, d, rew, report) {
    var T = NS.I18n.t;
    var L = [trainSummary(t, d, rew), '', T('aima.tr.brainstats')];
    var keys = Object.keys(d).sort();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === 'trainMatches') continue;
      var v = d[keys[i]];
      L.push('  ' + (keys[i] + '                    ').slice(0, 20) + (Math.round(v * 100) / 100));
    }
    L.push('', T('aima.tr.rewards') + ': ' + rew.map(function (x) { return r1(x); }).join(' '));
    L.push('', report);
    return L.join('\n');
  }

  /* ------------------------------------------------------------------ public */

  var Aima = {
    ALG: ALG, F: F, NOUT: NOUT, STYLES: STYLES, SIZES: SIZES,
    sizeKB: 0, cloud: 'off',
    hasCloud: function () { return !!cloudCfg(); },
    // the active brain (what the Stats / Settings tabs show)
    brain: function () { return active; },
    brains: function () { return index.brains; },
    activeId: function () { return index.active; },
    loadedBrain: function (id) { return loaded[id] || null; },
    getBrain: getBrain,
    profile: function () { return profile; },
    isTrainer: function () { return trainer; },
    isImad: function () { return isImad(); },
    thought: function () { return thought; },
    clapFrac: function () { return clapOn ? Math.min(1, (performance.now() - clapDown) / 1000 / CLAP_FULL) : -1; },
    account: function () { return auth && !auth.anon ? (auth.email || auth.uid || '?') : ''; },
    signIn: signIn,
    signInCode: function (code) { return useRefresh(code, '', ''); },
    signOut: function () { auth = null; idTok = ''; saveAuth(); trainer = isImad() && !cloudCfg(); },

    init: function (info) {
      var pr = info && info.profile ? info.profile : null;
      profile = { id: pr && pr.id ? String(pr.id) : '', name: pr && pr.name ? String(pr.name) : '' };
      try { auth = MyPC.load('aimaAuth', null); } catch (e) { auth = null; }
      // the trainer: the profile named "imad", signed in with his Google account (when the cloud store is set up)
      trainer = isImad() && (!cloudCfg() || !!(auth && auth.refresh && !auth.anon));
      // testing in a plain browser (not My PC): ?aimatrainer=1 shows the trainer's screens (it cannot write the cloud)
      if (info && info.standalone && /[?&]aimatrainer=1/.test(location.search)) trainer = true;
      load();
      if (!trainer) active.frozen = true;
      loadCloud();
    },

    // ---- brains (the trainer)
    use: function (id) {
      return getBrain(id).then(function (b) { setActive(b); saveIndex(); return b; });
    },
    clone: function (id, name) {
      return getBrain(id).then(function (src) {
        var b = fromDoc(toDoc(src));
        b.id = newId(); b.name = name || src.name + ' 2'; b.parent = src.id; b.from = 'clone'; b.created = Date.now();
        b.hist = src.hist.slice(-20);
        b.log('cloned', { from: src.name });
        b.frozen = false;
        loaded[b.id] = b;
        saveBrain(b);
        return b;
      });
    },
    rename: function (id, name) {
      return getBrain(id).then(function (b) { b.log('renamed', { from: b.name, to: name }); b.name = name; saveBrain(b); return b; });
    },
    remove: function (id) {
      if (id === index.active || index.brains.length < 2) return false;
      index.brains = index.brains.filter(function (e) { return e.id !== id; });
      delete loaded[id];
      cloudDelete('b_' + id);
      saveIndex();
      return true;
    },
    create: function (name) { var b = newBrain(name || 'checkoAI'); saveBrain(b); return b; },

    // ---- settings of the active brain
    setCfg: function (k, v) {
      var b = active;
      if (b.cfg[k] === v) return;
      b.cfg[k] = v;
      b.log('set', { k: k, v: v });
      saveBrain(b);
    },
    setSize: function (size) {
      var b = active;
      if (!SIZES[size] || (size !== 'SMALL' && !cloudCfg())) return false;
      b.build(size);
      b.st = freshStats();
      b.log('size', { v: size });
      saveBrain(b);
      return true;
    },
    reset: function () {
      var b = active;
      b.init();
      b.st = freshStats();
      b.memN = 0; b.memI = 0;
      b.log('reset');
      saveBrain(b);
    },
    save: function () { if (active) saveBrain(active); },

    makeSlot: makeCtl,

    matchStart: function () {
      poss[0] = poss[1] = 0; shotsT[0] = shotsT[1] = 0;
      lastOwner = null; lastOwnerAi = false; lastScore[0] = lastScore[1] = 0; matchOn = false;
      matchReward[0] = matchReward[1] = 0;
      pendShot = null; lastSetPiece = 0; tackleT[0] = tackleT[1] = 0;
    },

    // full time (finished) or abandoned: results, the last rewards, history, save
    matchEnd: function (finished) {
      var m = World.match, done = {};
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (!s.brain) continue;
        flush(s);
        var b = s.brain;
        if (!finished || !s.active || !matchOn || done[b.id]) continue;
        done[b.id] = true; // brain v itself: one result
        var my = m.score[t], th = m.score[1 - t];
        b.st.matches++; b.st.gf += my; b.st.ga += th;
        if (my > th) b.st.w++; else if (my < th) b.st.l++; else b.st.d++;
        b.st.hist.push(Math.round(matchReward[t] * 100) / 100);
        if (b.st.hist.length > 40) b.st.hist.shift();
        if (training) { b.st.trainMatches++; if (training.rew && b === training.brain) training.rew.push(matchReward[t]); }
        else b.log('match', { s: my + '-' + th, vs: World.slots[0].active || World.slots[1].active ? 'human' : 'cpu' });
      }
      matchOn = false;
      if (training) return; // saved at the end of the training
      if (performance.now() - lastSave > (NS.Debug && NS.Debug.running() ? 20000 : 0)) {
        for (var k in loaded) if (loaded[k].dirty && trainer) saveBrain(loaded[k]);
      }
    },

    poll: function (dt) {
      if (!anyAi()) return;
      matchOn = true;
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (s.active && s.brain && !(t === 1 && World.aiSlots[0].active && World.aiSlots[0].brain === s.brain)) s.brain.st.mins += dt / 60;
      }
      poll(dt);
    },

    // drives the slot: true = the brain plays this step (Controls.update reads slot.pad); false = the Legend CPU plays
    // him (a copying spell, a restart, a penalty)
    drive: function (slot, dt) {
      var p = slot.player, pad = slot.pad, c = slot.c;
      var b = slot.brain = teamBrains[slot.team] || active;
      c.modeT -= dt;
      if (c.modeT <= 0) {
        c.modeT = 2;
        var newMode = Math.random() < b.help() ? 0 : 1;
        if (newMode !== c.mode) { flush(slot); c.holdLeft = 0; pad.cur = 0; }
        c.mode = newMode;
      }
      var m = World.match;
      c.cpu = c.mode === 0 || m.penalty || (m.restart && World.ball.owner === p);
      c.t -= dt;
      var tick = c.t <= 0;
      if (slot.team === showTeam()) {
        if (thoughtT > 0) thoughtT -= dt;
        if (happyT > 0) happyT -= dt;
      }
      if (tick) {
        c.t = TICK;
        b.st.decisions++;
        b.st.playT += TICK;
        b.st.xSum += p.pos.x * (p.team === 0 ? 1 : -1) / NS.PITCH_HALF_W; b.st.xN++;
        if (!c.cpu) decide(slot, p);
        else copyCpu(slot, p);
        if (b.learns() && b.memN) { imitateOne(b); imitateOne(b); imitateOne(b); }
      }
      if (c.cpu) {
        pad.cur = 0; pad.x = 0; pad.y = 0; c.holdLeft = 0;
        return false;
      }
      var a2 = p.team === 0 ? 1 : -1;
      if (c.stk) {
        var ang = (c.stk - 1) * Math.PI / 4;
        pad.x = Math.cos(ang) * a2; pad.y = Math.sin(ang);
        // never runs himself off the pitch (the lines are walls for his stick)
        var HW = NS.PITCH_HALF_W - 1.2, HH = NS.PITCH_HALF_H - 1.2;
        if ((p.pos.x > HW && pad.x > 0) || (p.pos.x < -HW && pad.x < 0)) pad.x = 0;
        if ((p.pos.z > HH && pad.y > 0) || (p.pos.z < -HH && pad.y < 0)) pad.y = 0;
      } else { pad.x = 0; pad.y = 0; }
      if (c.spr) b.st.sprintT += dt;
      var cur = c.spr ? B.sprintMask() : 0;
      if (c.holdLeft > 0) { c.holdLeft -= dt; if (c.holdLeft > 0) cur |= c.btnMask; }
      pad.cur = cur;
      return true;
    },

    // the trainer's own play teaches the active brain ("learn from my play"): a sample every 0.1 s
    observe: function (slot, dt) {
      var b = active;
      if (!trainer || !b || !b.cfg.mine || !b.learns() || !slot.player) return;
      slot.obsT = (slot.obsT || 0) - dt;
      if (slot.obsT > 0) return;
      slot.obsT = TICK;
      var p = slot.player, pad = NS.Input.pads[slot.idx];
      features(p, xs);
      var ctx = ctxOf(p);
      var btn = 0;
      if (slot.pressing && !slot.obsPressing) btn = (slot.teamPress ? B.index('teampress') : I_PRESS) + 1;
      slot.obsPressing = slot.pressing;
      setMask(ctx);
      if (!bmask[btn]) btn = 0;
      remember(b, xs, stickClass(pad.x, pad.y, p.team === 0 ? 1 : -1), B.sprintDown(pad.cur) ? 1 : 0, btn, btn ? 1 : -1, ctx, 1.5);
      b.st.humanSamples++;
      imitateOne(b);
    },
    // a move the trainer just made (js/game/controls.js): the situation as he presses it, hold time -> power class
    humanMove: function (slot, mi, holdT) {
      var b = active;
      if (!trainer || slot.ai || !b || !b.cfg.mine || !b.learns() || !slot.player) return;
      var mv = B.MOVES[mi];
      var full = World.settings.gaugeTime > 0 ? World.settings.gaugeTime : 0.5;
      var f = mv.kind === 2 ? holdT / 1.5 : holdT / full;
      var p = slot.player, pad = NS.Input.pads[slot.idx];
      features(p, xs);
      remember(b, xs, stickClass(pad.x, pad.y, p.team === 0 ? 1 : -1), B.sprintDown(pad.cur) ? 1 : 0, mi + 1, f < 0.3 ? 0 : (f < 0.75 ? 1 : 2), mv.ctx, 3);
      b.st.humanSamples++;
    },

    // the clap button (js/core/input.js): down starts the gauge, up gives the clap
    clapButton: function (down) {
      if (!trainer || !World.match.running || World.match.paused || !anyAi()) { clapOn = false; return; }
      if (down) { if (!clapOn) { clapOn = true; clapDown = performance.now(); } return; }
      if (!clapOn) return;
      clapOn = false;
      var held = (performance.now() - clapDown) / 1000;
      var strength = 0.25 + 0.75 * Math.min(1, held / CLAP_FULL); // a tap ~25%, a full hold 100%
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (!s.active || !s.brain) continue;
        addReward(t, 1.5 * strength * (CLAP_W[s.brain.cfg.clap] || 1));
        s.brain.st.claps++; s.brain.st.clapSum += strength;
      }
      happyT = 1.5 + strength; thought = 'happy'; thoughtT = 1;
      if (NS.HUD.clap) NS.HUD.clap(strength);
      if (NS.Audio.applause) NS.Audio.applause(strength);
    },

    // ---- training: brain `cfg.brain` v the CPU (cfg.opp = 'EASY'...'LEGEND') or a brain ('B:<id>'), full speed
    training: function () { return !!training; },
    train: function (cfg, onProgress, onDone) {
      // (never over a match in progress: the training plays its own matches)
      if (training || !trainer || !NS.Debug || NS.Debug.running() || World.match.running) return false;
      var oppBrain = cfg.opp.indexOf('B:') === 0 ? cfg.opp.slice(2) : '';
      var ids = [getBrain(cfg.brain)];
      if (oppBrain) ids.push(getBrain(oppBrain));
      Promise.all(ids).then(function (bs) {
        var b = bs[0], ob = bs[1] || null;
        b.frozen = false;
        if (ob && ob !== b) ob.frozen = true; // the opponent plays, it does not learn
        teamBrains[0] = b; teamBrains[1] = ob;
        var oppName = ob ? 'checkoAI ' + ob.name : cfg.opp;
        training = { cfg: cfg, brain: b, opp: ob, oppName: oppName, st0: JSON.parse(JSON.stringify(b.st)), help0: b.help(), rew: [] };
        NS.Debug.start({ matches: cfg.matches, levels: ['AIMA', ob ? 'AIMA' : cfg.opp], teams: 'RANDOM', teamSize: cfg.teamSize,
          stadium: cfg.stadium, duration: cfg.duration }, onProgress, function (report) {
          var t = training;
          training = null;
          teamBrains[0] = teamBrains[1] = null;
          if (ob && ob !== b) ob.frozen = !trainer;
          var d = statDelta(t.st0, b.st);
          b.log('train', { opp: t.oppName, n: d.matches, w: d.w, d: d.d, l: d.l, gf: d.gf, ga: d.ga });
          saveBrain(b);
          setActive(active);
          onDone({ summary: trainSummary(t, d, t.rew), full: trainFull(t, d, t.rew, report) });
        });
      }, function (e) { onDone({ summary: 'Error: ' + (e && e.message ? e.message : e), full: '' }); });
      return true;
    },
    stopTraining: function () { if (training && NS.Debug) NS.Debug.stop(); },

    // style read from what he chooses himself
    style: function (b) {
      b = b || active;
      var st = b.st, k, kicks = 0, pass = 0, shots = 0;
      for (k = 0; k < B.MOVES.length; k++) {
        var n = st.btn[k + 1] || 0;
        if (B.MOVES[k].ctx === 1) { kicks += n; if (k >= 3 && k <= 5) shots += n; else pass += n; }
      }
      return {
        pass: kicks ? pass / kicks : 0, shoot: kicks ? shots / kicks : 0,
        sprint: st.playT ? st.sprintT / st.playT : 0, carry: st.playT ? st.carryT / st.playT : 0,
        pos: st.xN ? st.xSum / st.xN : 0, fwd: st.passOk ? st.fwdPass / st.passOk : 0
      };
    },
    memory: function (b) { return (b || active).memN; }
  };
  makeCtl(World.aiSlots[0]);
  makeCtl(World.aiSlots[1]);
  NS.Aima = Aima;
})(window.RS6 = window.RS6 || {});
