/* checkoAI: a learning player (named after the owner's white rooster). On a team whose CPU level is checkoAI ("AIMA") it
 * controls the selected player only (violet arrow), through a virtual controller: the same stick, sprint, buttons and
 * hold times as a human. The other ten are the Legend CPU.
 *
 * Brains: several networks, each with its own settings, stats and history (clone, rename, delete). One is active: it
 * plays in matches and is the one every other profile gets. Each team of a match may use a different brain (training:
 * brain v brain, or a brain v the CPU at any level).
 *
 * A brain is a small neural network (90 inputs: the play around him, his ratings and position, the last seconds and the
 * whole match situation; 2 hidden layers;
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
  var F = 90;      // inputs (v1.20: 64 -> 90; an older brain gets the new ones with weights of 0, so it plays as before)
  var OLD_F = 64;
  // brain sizes (hidden layers)
  var SIZES = { TINY: [32, 24], MEDIUM: [64, 48], LARGE: [256, 128], HUGE: [512, 256] }; // MEDIUM = the old SMALL (same layers)
  var LOCAL_SIZES = {};   // no model data in My PC's profile save: every brain lives in the cloud
  var NST = 9, NSP = 2, NBT = 13, NPW = 3;
  var O_ST = 0, O_SP = 9, O_BT = 11, O_PW = 24, O_V = 27, NOUT = 28;
  // per-brain options (index into these): decision speed, foresight, copied moves kept, weight of the trainer's play
  var TICKS = [0.08, 0.1, 0.15];
  var GAMMAS = [0.94, 0.97, 0.99];
  var MEMS = [3000, 6000, 12000];
  var MINEW = [1.5, 3, 6];
  var NSTEP = 20;           // n-step returns: 20 decisions
  var TRAJ = 64;
  var CLAP_BACK = 3.5;      // a clap is for something he did up to this many seconds before the button went down
  var CLAP_KEEP = 4.5;      // so his decisions wait this long before they are learnt (the press, plus a full hold)
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
  var CFG_DEF = { learn: true, mine: true, lr: 1, explore: 1, clap: 1, help: 'AUTO', style: 'BALANCED', size: 'MEDIUM',
    tick: 1, look: 1, mem: 1, mineW: 1, past: 1 };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function freshStats() {
    return {
      matches: 0, mins: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, goals: 0, shots: 0, onTarget: 0, passes: 0, passOk: 0,
      fwdPass: 0, tackles: 0, won: 0, lost: 0, fouls: 0, claps: 0, clapSum: 0, reward: 0, decisions: 0, modelDec: 0,
      rl: 0, im: 0, humanSamples: 0, cpuSamples: 0, carryT: 0, sprintT: 0, playT: 0, xSum: 0, xN: 0, trainMatches: 0,
      opsP: 0, opsL: 0, opsT: 0, // arithmetic operations, and the seconds of play they were counted over: playing (its decisions) and learning (the same count on every device)
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
    this.build(size || 'MEDIUM');
  }
  Brain.prototype.build = function (size) {
    if (!SIZES[size]) size = 'MEDIUM';
    this.cfg.size = size;
    var H1 = this.H1 = SIZES[size][0], H2 = this.H2 = SIZES[size][1];
    this.OW1 = 0; this.OB1 = H1 * F; this.OW2 = this.OB1 + H1; this.OB2 = this.OW2 + H2 * H1; this.OW3 = this.OB2 + H2;
    this.OB3 = this.OW3 + NOUT * H2;
    this.NP = this.OB3 + NOUT;
    // work (operations) of one decision and of one learning step: a multiply-add counts 2, tanh ~20, the optimizer
    // ~14 per value (gradient reset, norm, Adam). Exact for the layers, the same on every device.
    this.MAC = F * H1 + H1 * H2 + NOUT * H2;
    this.fwdOps = 2 * this.MAC + 20 * (H1 + H2) + 12 * NOUT;
    this.stepOps = this.fwdOps + 4 * this.MAC + 3 * (H1 + H2) + 14 * this.NP;
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

  // ---- the last seconds (updated every step, read by the inputs): who had the ball 1 s ago, the last action of each
  // team's selected player and how it went, shots, which way the play is going
  var OWN_N = 60;                         // 1 s of steps
  var ownRing = new Int16Array(OWN_N), ownI = 0, ownIdx = 0, ownPrev = null;
  var possT = 0, possTeam = -1, holdT = 0, evx = 0, evz = 0;
  var actK = [0, 0], actT = [0, 0], actRes = [0, 0], shotAgo = [99, 99];
  var ACT_PASS = 1, ACT_SHOT = 2, ACT_DEF = 3;
  function pastReset() {
    ownRing.fill(0); ownI = 0; ownIdx = 0; ownPrev = null;
    possT = 0; possTeam = -1; holdT = 0; evx = 0; evz = 0;
    actK[0] = actK[1] = 0; actT[0] = actT[1] = 0; actRes[0] = actRes[1] = 0; shotAgo[0] = shotAgo[1] = 99;
  }
  function setAct(t, k) { actK[t] = k; actT[t] = 0; actRes[t] = 0; }
  function pastStep(dt) {
    var ball = World.ball, o = ball.owner, t;
    if (o !== ownPrev) { ownPrev = o; ownIdx = o ? World.players.indexOf(o) + 1 : 0; holdT = 0; }
    ownRing[ownI] = ownIdx; ownI = (ownI + 1) % OWN_N;
    if (o) {
      holdT += dt;
      if (o.team !== possTeam) { possTeam = o.team; possT = 0; }
    }
    possT += dt;
    var k = Math.min(1, dt / 2);  // ~2 s average
    evx += (ball.vel.x - evx) * k; evz += (ball.vel.z - evz) * k;
    for (t = 0; t < 2; t++) {
      shotAgo[t] += dt;
      if (!actK[t]) continue;
      actT[t] += dt;
      if (actRes[t] !== 0) continue;
      // how it went: a pass reaches a team mate or not, a shot is saved / scores or not, a challenge wins the ball or not
      if (actK[t] === ACT_PASS && o && actT[t] > 0.1) actRes[t] = o.team === t ? 1 : -1;
      else if (actK[t] === ACT_SHOT && actT[t] > 4) actRes[t] = -1;
      else if (actK[t] === ACT_DEF) { if (o && o.team === t) actRes[t] = 1; else if (actT[t] > 1.5) actRes[t] = -1; }
    }
  }
  function rating(v) { return v === undefined ? 0 : (v - 70) / 25; }

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

  // 90 inputs, in the team's frame (x towards the goal it attacks). b: the brain (its "memory of the last seconds" option)
  function features(p, x, b) {
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
        if (side === 0) x[74 + k] = NR[k] < 0 ? 0 : rating(players[NR[k]].st && players[NR[k]].st.spd); // how fast the nearest opponents are
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
    // himself: his ratings and his position
    var ps = p.st || {};
    x[64] = rating(ps.spd); x[65] = rating(ps.drb); x[66] = rating(ps.sht); x[67] = rating(ps.sta); x[68] = rating(ps.hdr); x[69] = rating(ps.def);
    x[70] = p.role === 'GK' ? 1 : 0; x[71] = p.role === 'DEF' ? 1 : 0; x[72] = p.role === 'MID' ? 1 : 0; x[73] = p.role === 'FWD' ? 1 : 0;
    // (74-76: above) the last seconds
    if (b && !b.cfg.past) { for (i = 77; i < F; i++) x[i] = 0; return; }
    var t = p.team;
    x[77] = Math.min(1.5, possT / 10);                       // since the ball changed teams
    var oi = ownRing[ownI];                                   // the owner 1 s ago
    q = oi ? players[oi - 1] : null;
    x[78] = !q ? 0 : (q.team === t ? 1 : -1);
    x[79] = q === p ? 1 : 0;
    x[80] = actK[t] === ACT_PASS ? 1 : 0; x[81] = actK[t] === ACT_SHOT ? 1 : 0; x[82] = actK[t] === ACT_DEF ? 1 : 0;
    x[83] = actRes[t];                                        // it worked (1), it did not (-1), not known yet (0)
    x[84] = actK[t] ? Math.min(1.5, actT[t] / 5) : 1.5;
    x[85] = Math.min(1.5, shotAgo[t] / 20); x[86] = Math.min(1.5, shotAgo[1 - t] / 20);
    x[87] = clamp(evx * a / 20, -1.5, 1.5); x[88] = clamp(evz / 20, -1.5, 1.5); // which way the play has been going
    x[89] = o ? Math.min(1.5, holdT / 5) : 0;                 // how long the ball has been on the same foot
  }

  /* ------------------------------------------------------------------ copying (imitation) */

  function remember(b, x, stk, spr, btn, pw, ctx, w) {
    var MEM = MEMS[b.cfg.mem] || MEMS[1];
    if (!b.memX || b.memCap !== MEM) {
      b.memCap = MEM; b.memN = 0; b.memI = 0;
      b.memX = new Float32Array(MEM * F); b.memA = new Int8Array(MEM * 5); b.memW = new Float32Array(MEM);
    }
    var o = b.memI * F;
    for (var j = 0; j < F; j++) b.memX[o + j] = x[j];
    o = b.memI * 5;
    b.memA[o] = stk; b.memA[o + 1] = spr; b.memA[o + 2] = btn; b.memA[o + 3] = pw; b.memA[o + 4] = ctx;
    b.memW[b.memI] = w;
    var at = b.memI;
    b.memI = (b.memI + 1) % MEM;
    if (b.memN < MEM) b.memN++;
    return at;
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
    b.st.opsL += b.stepOps;
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
  function copyMove(slot, p, mi, pw, w) {
    var b = slot.brain, c = slot.c;
    if (!b.learns() || mi < 0) return;
    var a = p.team === 0 ? 1 : -1;
    features(p, xs, b);
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    // (kept with its time: a clap soon after makes this copied move count more)
    c.cp[c.cpi] = remember(b, xs, sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a), sp > 10.2 ? 1 : 0, mi + 1, pw, B.MOVES[mi].ctx, w);
    c.cpt[c.cpi] = c.clock;
    c.cpi = (c.cpi + 1) % c.cp.length;
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
      tctx: new Int8Array(TRAJ), tn: 0, th: 0,
      ts: new Float64Array(TRAJ), tnote: new Int8Array(TRAJ),   // each decision's time, and "a move worth a clap" (a button, a ball won)
      clock: 0, grace: 0,                                       // his own clock (match time), the wait before a Legend spell drops his last decisions
      cp: new Int32Array(8), cpt: new Float64Array(8), cpi: 0    // the last copied moves (where they are kept, when)
    };
    slot.c.cpt.fill(-1e9);
  }

  // n-step update of the oldest step of the slot's trajectory: its next NSTEP rewards, then the value NSTEP steps on
  // (bootstrap; none at the end). Steps are kept CLAP_KEEP seconds first, so a late clap still reaches them.
  function learnOldest(b, c, boot) {
    var n = c.tn;
    if (!n) return;
    var i0 = c.th;
    var R = 0, g = 1;
    var gamma = b ? GAMMAS[b.cfg.look] || GAMMAS[1] : GAMMAS[1];
    var m = Math.min(n, NSTEP);
    for (var k = 0; k < m; k++) { R += g * c.tr[(i0 + k) % TRAJ]; g *= gamma; }
    if (boot && n > NSTEP) R += g * c.tv[(i0 + NSTEP) % TRAJ];
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
      b.st.opsL += b.stepOps;
    }
    c.th = (c.th + 1) % TRAJ;
    c.tn--;
  }
  function flush(slot) {
    var c = slot.c;
    while (c.tn) learnOldest(slot.brain, c, false);
  }

  // decisions kept before they are learnt (CLAP_KEEP seconds at the brain's decision speed)
  function lagSteps(b) {
    return Math.min(TRAJ - 2, Math.max(NSTEP + 1, Math.ceil(CLAP_KEEP / (TICKS[b.cfg.tick] || TICKS[1]))));
  }
  function markNote(s) {
    if (s && s.c.tn && !s.c.cpu) s.c.tnote[(s.c.th + s.c.tn - 1) % TRAJ] = 1;
  }

  var matchReward = [0, 0];
  // own: the result of his own move (in a Legend spell only those still reach his last decisions)
  function addReward(team, r, own) {
    var s = World.aiSlots[team];
    if (!s || !s.active || !s.brain) return;
    s.brain.st.reward += r;
    matchReward[team] += r;
    var c = s.c;
    if (c.tn && (own || !c.cpu)) c.tr[(c.th + c.tn - 1) % TRAJ] += r;
  }

  // a clap: for the best move he made in the CLAP_BACK seconds before the button went down (at t0 on his clock): his
  // latest pass / shot / tackle / ball won there, else what he was doing ~0.8 s before; and the Legend moves he copied
  // in that time count more. r: the reward
  function clapCredit(s, t0, r, strength) {
    var c = s.c, b = s.brain, best = -1, near = -1, nd = 1e9, k, idx;
    for (k = 0; k < c.tn; k++) {
      idx = (c.th + k) % TRAJ;
      var tt = c.ts[idx];
      if (tt > t0 + 0.05 || tt < t0 - CLAP_BACK) continue;
      if (c.tnote[idx]) best = idx;
      var d = Math.abs(tt - (t0 - 0.8));
      if (d < nd) { nd = d; near = idx; }
    }
    idx = best >= 0 ? best : near;
    var copied = 0;
    if (b.memW) {
      for (k = 0; k < c.cp.length; k++) {
        if (c.cpt[k] < t0 - CLAP_BACK || c.cpt[k] > t0 + 0.05) continue;
        b.memW[c.cp[k]] = Math.min(4, b.memW[c.cp[k]] * (1 + strength));
        c.cpt[k] = -1e9; // (once)
        copied++;
      }
    }
    if (idx >= 0) {
      c.tr[idx] += r;
      b.st.reward += r;
      matchReward[s.team] += r;
    } else if (!copied) addReward(s.team, r, true);
  }

  // one decision of the brain: stick, sprint, maybe a button with its hold time
  function decide(slot, p) {
    var b = slot.brain, c = slot.c;
    features(p, xs, b);
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
    c.ts[idx] = c.clock;
    c.tnote[idx] = btn > 0 ? 1 : 0;
    c.tn++;
    var lag = lagSteps(b);
    while (c.tn > lag) learnOldest(b, c, true);
    b.st.modelDec++;
    b.st.opsP += b.fwdOps;
  }

  // the CPU played this tick: copy what it did (moves are copied at the moment they happen, see the hooks)
  function copyCpu(slot, p) {
    var b = slot.brain, c = slot.c;
    var a = p.team === 0 ? 1 : -1;
    if (b.learns() && c.tBtn === 0) {
      features(p, xs, b);
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
      copyMove(sc, p, KICK_MOVE[type], type >= ACT.SHOOT ? 2 : 1, 1.2); // he still has the ball here
      sc.c.tBtn = 1;
    }
    origRelease.apply(this, arguments);
    if (!World.match.running) return;
    modelPass = !!sc && !sc.c.cpu && type < ACT.SHOOT;
    if (type >= ACT.SHOOT) { shotsT[p.team]++; shotAgo[p.team] = 0; }
    if (sc) setAct(p.team, type >= ACT.SHOOT ? ACT_SHOT : ACT_PASS);
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
    if (sc && sc.c.cpu) { copyMove(sc, p, slide ? I_SLIDE : I_TACKLE, -1, 1.2); sc.c.tBtn = 1; }
    if (sc) setAct(p.team, ACT_DEF);
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
    if (sc && sc.c.cpu) { copyMove(sc, p, I_PRESS, 1, 1); sc.c.tBtn = 1; }
    if (sc) setAct(p.team, ACT_DEF);
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
        if (actK[t] === ACT_SHOT && actT[t] < 5) actRes[t] = 1;
        if (pendShot && pendShot.team === t && b) { b.st.goals++; b.st.onTarget++; addReward(t, 0.5 * b.styleW(0), true); pendShot = null; }
      }
      if (tackleT[t] > 0) tackleT[t] -= dt;
    }
    if (pendShot) {
      pendShotT -= dt;
      b = brainOfTeam(pendShot.team);
      if (b && !pendShotOn && (ball.gkTried & (1 << (1 - pendShot.team)))) { pendShotOn = true; b.st.onTarget++; addReward(pendShot.team, 0.1, true); }
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
            addReward(lt, 0.08 * b.styleW(2) + (gain > 5 ? 0.12 * b.styleW(3) : 0), true);
            if (gain > 5) b.st.fwdPass++;
          }
        }
        var bo = brainOfTeam(o.team);
        if (bo && aiOf(o) && o.team !== lt) { bo.st.won++; addReward(o.team, 0.25 * bo.styleW(4)); markNote(World.aiSlots[o.team]); }
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
  // (a brain saved with fewer inputs, OLD_F: its first layer gets the new inputs with weights of 0 = it plays the same)
  function unpackWeights(b, obj) {
    if (!obj || !obj.dims || obj.dims[3] !== NOUT) return false;
    var f0 = obj.dims[0];
    if (f0 !== F && f0 !== OLD_F) return false;
    var size = null;
    for (var k in SIZES) if (SIZES[k][0] === obj.dims[1] && SIZES[k][1] === obj.dims[2]) size = k;
    if (!size) return false;
    if (b.H1 !== obj.dims[1] || b.H2 !== obj.dims[2]) b.build(size);
    var u = unb64(obj.w);
    if (u.length !== (b.NP - b.H1 * (F - f0)) * 2) return false;
    var q = new Int16Array(u.buffer);
    var src = 0;
    for (var t = 0; t < b.TENS.length; t++) {
      var o = b.TENS[t][0], n = b.TENS[t][1], s = obj.sc[t], i;
      if (t === 0 && f0 !== F) {
        for (i = 0; i < b.H1; i++) for (var j = 0; j < F; j++) b.P[o + i * F + j] = j < f0 ? q[src + i * f0 + j] * s : 0;
        src += b.H1 * f0;
        continue;
      }
      for (i = 0; i < n; i++) b.P[o + i] = q[src + i] * s;
      src += n;
    }
    b.AM.fill(0); b.AV.fill(0); b.adamT = 0;
    b.upgraded = f0 !== F ? f0 : 0;
    return true;
  }

  function toDoc(b) {
    return { v: 2, alg: ALG, id: b.id, name: b.name, created: b.created, saved: b.saved, parent: b.parent, from: b.from,
      cfg: b.cfg, st: b.st, hist: b.hist, m: packWeights(b) };
  }
  function fromDoc(d) {
    if (!d || d.v !== 2 || !d.m) return null;
    var b = new Brain(d.id, d.name || 'checkoAI', (d.cfg && d.cfg.size) || 'MEDIUM');
    if (!unpackWeights(b, d.m)) return null;
    b.created = d.created || Date.now(); b.saved = d.saved || 0; b.parent = d.parent || ''; b.from = d.from || 'save';
    var k;
    if (d.cfg) for (k in d.cfg) if (Object.prototype.hasOwnProperty.call(CFG_DEF, k)) b.cfg[k] = d.cfg[k];
    for (k in SIZES) if (SIZES[k][0] === b.H1 && SIZES[k][1] === b.H2) b.cfg.size = k;
    if (d.st) for (k in d.st) if (Object.prototype.hasOwnProperty.call(b.st, k)) b.st[k] = d.st[k];
    b.hist = d.hist || [];
    if (b.upgraded) { b.log('inputs', { from: b.upgraded, to: F }); b.upgraded = 0; } // (saved with the new inputs next time)
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
  // only a Google sign-in is kept in the profile; a guest login stays in memory (it must never replace the saved sign-in)
  function saveAuth() { if (auth && auth.anon) return; try { MyPC.save('aimaAuth', auth); } catch (e) {} }
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

  // saves one brain (cloud) and the list; the active brain also goes to My PC's save when small enough (works offline)
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
    saveSelected();
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
    var b = new Brain(newId(), name, 'MEDIUM'); // a new brain: the default settings
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

  // My PC's profile save keeps only which brain is selected (its id and name), never any model data
  var picked = '';
  function saveSelected() {
    try { MyPC.save(SAVE_KEY, { v: 3, id: index.active || '', name: active ? active.name : '' }); } catch (e) {}
    lastSave = performance.now();
  }
  function load() {
    var obj = null;
    try { obj = MyPC.load(SAVE_KEY, null); } catch (e) { obj = null; }
    if (obj) {
      picked = obj.v === 3 ? String(obj.id || '') : (obj.index && obj.index.active ? String(obj.index.active) : '');
      if (obj.v !== 3) { try { MyPC.save(SAVE_KEY, { v: 3, id: picked, name: '' }); } catch (e) {} } // removes the old model data
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
      if (trainer && picked && findEntry(picked)) index.active = picked; // this profile's own selection
      var want = index.active;
      if (!loaded[want] || (trainer && loaded[want].saved < (findEntry(want) || {}).updated)) delete loaded[want];
      return getBrain(want).then(function (b) {
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

  var clapDown = 0, clapOn = false, clapAt = [0, 0]; // (clapAt: each slot's clock when the button went down)

  /* ------------------------------------------------------------------ training mode (full speed, js/game/debug.js) */

  // Training sessions: each one is a brain, its opponent (the CPU at a level, or a brain, which learns too), its number
  // of matches and pitch, its own progress and results. Running sessions take turns, one match each (one simulation at
  // a time), so they all advance together but count only their own matches. Every brain that plays is saved after
  // each of its matches.
  //   session: { id, cfg, state: 'loading'|'running'|'done'|'stopped'|'error', done, mins, b, ob, oppLabel,
  //              runs: { id: run }, order, log: [match lines], stopReq, curDone }
  //   run (one brain in one session): { b, help0, h (its history line), rew, opps, acc (its stats, this session), snap }
  var sessions = [], sesSeq = 0, rr = 0;
  var LOG_KEEP = 300, REW_KEEP = 400; // matches: 0 = continuous (until stopped), so a session's lists keep only the latest
  var training = null;  // the session whose match is being played right now

  function statDelta(a, b) {
    var d = {};
    for (var k in b) if (typeof b[k] === 'number') d[k] = b[k] - (a[k] || 0);
    return d;
  }
  function pct(n, d) { return d ? Math.round(n * 100 / d) + '%' : '-'; }
  // a brain's line in its history for this session, kept up to date after every match it plays
  function trainProgress(run) {
    var d = run.acc, h = run.h.d;
    h.n = d.matches || 0; h.w = d.w || 0; h.d = d.d || 0; h.l = d.l || 0; h.gf = d.gf || 0; h.ga = d.ga || 0;
    h.opp = oppList(run);
    return d;
  }
  function oppList(run) { return Object.keys(run.opps).join(', '); }
  function addRun(S, b, of) {
    if (S.runs[b.id]) return S.runs[b.id];
    var run = { b: b, help0: b.help(), rew: [], opps: {}, acc: {}, snap: null };
    b.frozen = false; // every brain of a training learns
    b.log('train', { opp: '', n: 0, of: of, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
    run.h = b.hist[b.hist.length - 1];
    S.runs[b.id] = run;
    S.order.push(b.id);
    return run;
  }
  function addDelta(acc, a, b) {
    for (var k in b) if (typeof b[k] === 'number') acc[k] = (acc[k] || 0) + b[k] - (a[k] || 0);
  }

  function notify(S) { if (Aima.onTrain) Aima.onTrain(S); }

  // the next match: the next running session in turn
  function pump() {
    if (training || !NS.Debug || NS.Debug.running()) return;
    var n = sessions.length, S = null;
    for (var i = 0; i < n; i++) {
      var c = sessions[(rr + i) % n];
      if (c.state === 'running') { S = c; rr = (rr + i + 1) % n; break; }
    }
    if (!S) return;
    training = S;
    S.curDone = false;
    S.mins = 0;
    var c2 = S.cfg;
    NS.Debug.start({ matches: 1, levels: ['AIMA', S.ob ? 'AIMA' : c2.opp], teams: 'RANDOM', teamSize: c2.teamSize, stadium: c2.stadium,
      duration: c2.duration }, function (done, total, mins) {
      S.mins = mins;
      notify(S);
    }, function (report) {
      training = null;
      teamBrains[0] = teamBrains[1] = null;
      if (S.curDone) {
        S.done++;
        // its line of the match log ("#1 ..." of this one-match run)
        var lines = report.split('\n');
        for (var k = 0; k < lines.length; k++) if (lines[k].indexOf('#1 ') === 0) S.log.push('#' + S.done + ' ' + lines[k].slice(3));
        if (S.log.length > LOG_KEEP) S.log.splice(0, S.log.length - LOG_KEEP); // (a continuous session keeps the latest)
      }
      if (S.stopReq) S.state = 'stopped';
      else if (S.cfg.matches > 0 && S.done >= S.cfg.matches) { S.state = 'done'; if (NS.Audio.chime) NS.Audio.chime(); }
      if (S.state !== 'running') { S.ended = Date.now(); for (var id in S.runs) { trainProgress(S.runs[id]); saveBrain(S.runs[id].b); } }
      setActive(active);
      notify(S);
      NS.Debug.later(pump, 30);
    });
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  // 1234567 -> "1.23 M"
  function fmtOps(n) {
    var u = ['', ' K', ' M', ' G', ' T', ' P'], i = 0;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (n >= 100 || i === 0 ? Math.round(n) : (Math.round(n * (n >= 10 ? 10 : 100)) / (n >= 10 ? 10 : 100))) + u[i];
  }

  // a brain's work: measured (per second of play) and expected from its settings; memory it holds
  function work(b) {
    var st = b.st, T = st.opsT || 0;
    var tick = TICKS[b.cfg.tick] || TICKS[1];
    var own = 1 - b.help();                       // share of decisions it makes itself
    var learnSteps = own + 3;                     // per decision: one reward step (its own play) + 3 copied moves
    var playExp = own * b.fwdOps / tick;
    var learnExp = learnSteps * b.stepOps / tick;
    var memBytes = b.NP * 4 * 4 + (b.memX ? b.memCap * (F * 4 + 9) : (MEMS[b.cfg.mem] || MEMS[1]) * (F * 4 + 9));
    return {
      measured: T > 0, perSec: T > 0 ? (st.opsP + st.opsL) / T : 0, playPerSec: T > 0 ? st.opsP / T : 0,
      learnPerSec: T > 0 ? st.opsL / T : 0,
      perDecision: b.fwdOps, perStep: b.stepOps,
      expOn: playExp + learnExp, expOff: playExp,   // learning on / off
      total: st.opsP + st.opsL, memBytes: memBytes,
      fmt: fmtOps
    };
  }

  function trainSummary(S) {
    var T = NS.I18n.t, c = S.cfg;
    var L = ['checkoAI ' + T('aima.tr.title') + ' #' + S.id + ': ' + S.b.name + '  v  ' + S.oppLabel + '   (' + S.done + ' / ' + (c.matches || '∞') + ' ' +
      T('aima.tr.matches') + ', ' + c.teamSize + ' ' + T('aima.tr.aside') + ', ' + c.stadium + ', ' + c.duration + ' min)  ' + T('aima.ss.' + S.state)];
    for (var i = 0; i < S.order.length; i++) {
      var run = S.runs[S.order[i]];
      L.push('', brainSummary(run, run.acc));
    }
    return L.join('\n');
  }

  function brainSummary(run, d) {
    var T = NS.I18n.t;
    var b = run.b, rew = run.rew;
    var n = d.matches || 1;
    d = statDelta({}, d); // (missing counters read as 0)
    for (var z in freshStats()) if (typeof freshStats()[z] === 'number' && d[z] === undefined) d[z] = 0;
    var half = Math.floor(rew.length / 2);
    var a1 = 0, a2 = 0, i;
    for (i = 0; i < half; i++) a1 += rew[i];
    for (i = half; i < rew.length; i++) a2 += rew[i];
    a1 = half ? a1 / half : 0; a2 = rew.length - half ? a2 / (rew.length - half) : 0;
    var trend = a2 - a1 > 0.3 ? T('aima.tr.better') : (a1 - a2 > 0.3 ? T('aima.tr.worse') : T('aima.tr.flat'));
    var L = [];
    L.push('\u25b6 ' + b.name + '  v  ' + (oppList(run) || '-') + '   (' + d.matches + ' ' + T('aima.tr.matches') + ')');
    L.push(T('aima.tr.results') + ': ' + d.w + ' - ' + d.d + ' - ' + d.l + '   ' + T('aima.tr.goals') + ' ' + d.gf + ' - ' + d.ga +
      '   (' + r1(d.gf / n) + ' - ' + r1(d.ga / n) + ' ' + T('aima.tr.permatch') + ')');
    L.push(T('aima.tr.hisplay') + ': ' + d.shots + ' ' + T('aima.tr.shots') + ' (' + d.onTarget + ' ' + T('aima.k.ontarget') + ', ' + d.goals + ' ' +
      T('aima.tr.goalsby') + '), ' + d.passes + ' ' + T('aima.tr.passes') + ' (' + pct(d.passOk, d.passes) + ', ' + d.fwdPass + ' ' + T('aima.k.fwd') + '), ' +
      T('aima.k.wonlost') + ' ' + d.won + ' / ' + d.lost + ', ' + d.tackles + ' ' + T('aima.tr.tackles') + ', ' + d.fouls + ' ' + T('aima.tr.fouls'));
    if (d.opsT > 0) L.push(T('aima.w.title') + ': ' + fmtOps((d.opsP + d.opsL) / d.opsT) + ' ' + T('aima.w.persec') + '  (' +
      T('aima.w.play') + ' ' + fmtOps(d.opsP / d.opsT) + ', ' + T('aima.w.learn') + ' ' + fmtOps(d.opsL / d.opsT) + ')');
    L.push(T('aima.tr.learning') + ': ' + d.rl + ' RL + ' + d.im + ' ' + T('aima.k.copy') + '   ' + T('aima.k.own') + ' ' + pct(d.modelDec, d.decisions) +
      '   ' + T('aima.k.help') + ' ' + Math.round(run.help0 * 100) + '% -> ' + Math.round(b.help() * 100) + '%');
    L.push(T('aima.tr.reward') + ': ' + r1(a1) + ' -> ' + r1(a2) + ' ' + T('aima.tr.permatch') + '   ' + trend);
    return L.join('\n');
  }

  function trainFull(S) {
    var T = NS.I18n.t;
    var L = [trainSummary(S)];
    for (var r = 0; r < S.order.length; r++) {
      var run = S.runs[S.order[r]];
      var d = run.acc;
      L.push('', T('aima.tr.brainstats') + ': ' + run.b.name);
      var keys = Object.keys(d).sort();
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] === 'trainMatches') continue;
        L.push('  ' + (keys[i] + '                    ').slice(0, 20) + (Math.round(d[keys[i]] * 100) / 100));
      }
      L.push('  ' + T('aima.tr.rewards') + ': ' + run.rew.map(function (x) { return r1(x); }).join(' '));
    }
    L.push('', T('aima.tr.log'));
    for (var m = 0; m < S.log.length; m++) L.push(S.log[m]);
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
    // the model the status box belongs to (the one playing the team it follows)
    modelName: function () { var s = World.aiSlots[showTeam()], b = s && s.brain || active; return b ? b.name : ''; },
    clapFrac: function () { return clapOn ? Math.min(1, (performance.now() - clapDown) / 1000 / CLAP_FULL) : -1; },
    account: function () { return auth && !auth.anon ? (auth.email || auth.uid || '?') : ''; },
    signIn: signIn,
    signInCode: function (code) { return useRefresh(code, '', ''); },
    signOut: function () { auth = null; idTok = ''; saveAuth(); trainer = isImad() && !cloudCfg(); },

    init: function (info) {
      var pr = info && info.profile ? info.profile : null;
      profile = { id: pr && pr.id ? String(pr.id) : '', name: pr && pr.name ? String(pr.name) : '' };
      try { auth = MyPC.load('aimaAuth', null); } catch (e) { auth = null; }
      if (auth && (auth.anon || !auth.refresh)) { auth = null; try { MyPC.save('aimaAuth', null); } catch (e) {} } // old guest login
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

    // ---- settings of a brain (b: a loaded brain, default the active one)
    setCfg: function (k, v, b) {
      b = b || active;
      if (b.cfg[k] === v) return;
      b.cfg[k] = v;
      if (k === 'mem') { b.memX = null; b.memN = 0; b.memI = 0; } // a new memory size starts empty
      b.log('set', { k: k, v: v });
      saveBrain(b);
    },
    // a new brain size: a new network (it starts again from zero, its settings and history stay)
    setSize: function (size, b) {
      b = b || active;
      if (!SIZES[size] || (!LOCAL_SIZES[size] && !cloudCfg())) return false;
      b.build(size);
      b.st = freshStats();
      b.log('size', { v: size });
      saveBrain(b);
      return true;
    },
    sizeNeedsCloud: function (size) { return !LOCAL_SIZES[size]; },
    reset: function (b) {
      b = b || active;
      b.init();
      b.st = freshStats();
      b.memN = 0; b.memI = 0;
      b.log('reset');
      saveBrain(b);
    },
    save: function () { if (active) saveBrain(active); },
    saveBrain: function (b) { saveBrain(b || active); },

    makeSlot: makeCtl,

    matchStart: function () {
      if (training) {
        var S = training;
        teamBrains[0] = S.b; teamBrains[1] = S.ob;
        S.runs[S.b.id].opps[S.ob ? 'checkoAI ' + S.ob.name : S.cfg.opp] = 1;
        if (S.ob && S.ob !== S.b) S.runs[S.ob.id].opps['checkoAI ' + S.b.name] = 1;
        for (var rid in S.runs) S.runs[rid].snap = JSON.parse(JSON.stringify(S.runs[rid].b.st));
      }
      poss[0] = poss[1] = 0; shotsT[0] = shotsT[1] = 0;
      lastOwner = null; lastOwnerAi = false; lastScore[0] = lastScore[1] = 0; matchOn = false;
      matchReward[0] = matchReward[1] = 0;
      pendShot = null; lastSetPiece = 0; tackleT[0] = tackleT[1] = 0;
      pastReset();
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
        if (training) { b.st.trainMatches++; var rw = training.runs[b.id]; if (rw) { rw.rew.push(matchReward[t]); if (rw.rew.length > REW_KEEP) rw.rew.shift(); } }
        else b.log('match', { s: my + '-' + th, vs: World.slots[0].active || World.slots[1].active ? 'human' : 'cpu' });
      }
      matchOn = false;
      if (training) {
        // every brain of this match is saved after it: a training stopped (or closed) half way keeps what was learnt
        if (finished) training.curDone = true;
        for (var id in done) {
          var run = training.runs[id];
          if (!run) continue;
          if (run.snap) addDelta(run.acc, run.snap, run.b.st);
          run.snap = null;
          trainProgress(run);
          saveBrain(run.b);
        }
        return;
      }
      if (performance.now() - lastSave > (NS.Debug && NS.Debug.running() ? 20000 : 0)) {
        for (var k in loaded) if (loaded[k].dirty && trainer) saveBrain(loaded[k]);
      }
    },

    poll: function (dt) {
      pastStep(dt);
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
      c.clock += dt;
      c.modeT -= dt;
      if (c.modeT <= 0) {
        c.modeT = 2;
        var newMode = Math.random() < b.help() ? 0 : 1;
        if (newMode !== c.mode) {
          // to a Legend spell: his last decisions wait CLAP_KEEP s (a clap may still come); back to him: learnt now
          if (newMode === 1) flush(slot); else c.grace = CLAP_KEEP;
          c.holdLeft = 0; pad.cur = 0;
        }
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
        var TICK = TICKS[b.cfg.tick] || TICKS[1];
        c.t = TICK;
        b.st.decisions++;
        b.st.playT += TICK;
        b.st.opsT += TICK;
        b.st.xSum += p.pos.x * (p.team === 0 ? 1 : -1) / NS.PITCH_HALF_W; b.st.xN++;
        if (!c.cpu) decide(slot, p);
        else copyCpu(slot, p);
        if (b.learns() && b.memN) { imitateOne(b); imitateOne(b); imitateOne(b); }
      }
      if (c.cpu) {
        if (c.tn) { c.grace -= dt; if (c.grace <= 0) flush(slot); }
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
      slot.obsT = TICKS[b.cfg.tick] || TICKS[1];
      var p = slot.player, pad = NS.Input.pads[slot.idx];
      features(p, xs, b);
      var ctx = ctxOf(p);
      var btn = 0;
      if (slot.pressing && !slot.obsPressing) btn = (slot.teamPress ? B.index('teampress') : I_PRESS) + 1;
      slot.obsPressing = slot.pressing;
      setMask(ctx);
      if (!bmask[btn]) btn = 0;
      remember(b, xs, stickClass(pad.x, pad.y, p.team === 0 ? 1 : -1), B.sprintDown(pad.cur) ? 1 : 0, btn, btn ? 1 : -1, ctx, (MINEW[b.cfg.mineW] || 3) / 2);
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
      features(p, xs, b);
      remember(b, xs, stickClass(pad.x, pad.y, p.team === 0 ? 1 : -1), B.sprintDown(pad.cur) ? 1 : 0, mi + 1, f < 0.3 ? 0 : (f < 0.75 ? 1 : 2), mv.ctx, MINEW[b.cfg.mineW] || 3);
      b.st.humanSamples++;
    },

    // what a brain sees right now for player p (a copy: for checks, not the play loop)
    inputs: function (p, b) { var x = new Float32Array(F); features(p, x, b || active); return x; },

    // the clap button (js/core/input.js): down starts the gauge, up gives the clap
    clapButton: function (down) {
      if (!trainer || !World.match.running || World.match.paused || !anyAi()) { clapOn = false; return; }
      if (down) {
        if (!clapOn) { clapOn = true; clapDown = performance.now(); clapAt[0] = World.aiSlots[0].c.clock; clapAt[1] = World.aiSlots[1].c.clock; }
        return;
      }
      if (!clapOn) return;
      clapOn = false;
      var held = (performance.now() - clapDown) / 1000;
      var strength = 0.25 + 0.75 * Math.min(1, held / CLAP_FULL); // a tap ~25%, a full hold 100%
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (!s.active || !s.brain) continue;
        clapCredit(s, clapAt[t], 1.5 * strength * (CLAP_W[s.brain.cfg.clap] || 1), strength);
        s.brain.st.claps++; s.brain.st.clapSum += strength;
      }
      happyT = 1.5 + strength; thought = 'happy'; thoughtT = 1;
      if (NS.HUD.clap) NS.HUD.clap(strength);
      if (NS.Audio.applause) NS.Audio.applause(strength);
    },

    // ---- training sessions. cfg: { brain: id, opp: 'EASY'..'LEGEND' | 'B:<id>', matches, teamSize, stadium, duration }
    training: function () { for (var i = 0; i < sessions.length; i++) if (sessions[i].state === 'running' || sessions[i].state === 'loading') return true; return false; },
    sessions: function () { return sessions; },
    playing: function () { return training; },
    startSession: function (cfg) {
      if (!trainer || !NS.Debug) return null;
      // (never over a match in progress outside the training)
      if (World.match.running && !training && !(NS.Debug && NS.Debug.running())) return null;
      var S = { id: ++sesSeq, cfg: cfg, state: 'loading', done: 0, mins: 0, runs: {}, order: [], log: [], stopReq: false, started: Date.now() };
      sessions.push(S);
      var oppBrain = cfg.opp.indexOf('B:') === 0 ? cfg.opp.slice(2) : '';
      var loads = [getBrain(cfg.brain)];
      if (oppBrain) loads.push(getBrain(oppBrain));
      Promise.all(loads).then(function (bs) {
        S.b = bs[0]; S.ob = bs[1] || null;
        S.oppLabel = S.ob ? 'checkoAI ' + S.ob.name : cfg.opp;
        addRun(S, S.b, cfg.matches);
        if (S.ob && S.ob !== S.b) addRun(S, S.ob, cfg.matches); // the opponent brain learns and is saved too
        for (var k in S.runs) saveBrain(S.runs[k].b);
        S.state = S.stopReq ? 'stopped' : 'running';
        notify(S);
        pump();
      }, function (e) { S.state = 'error'; S.error = e && e.message ? e.message : String(e); notify(S); });
      notify(S);
      return S;
    },
    // stop a session (its match in progress is dropped; what it played is kept and saved)
    stopSession: function (id) {
      for (var i = 0; i < sessions.length; i++) {
        var S = sessions[i];
        if (S.id !== id) continue;
        S.stopReq = true;
        if (training === S) NS.Debug.stop();
        else if (S.state === 'running' || S.state === 'loading') {
          S.state = 'stopped'; S.ended = Date.now();
          for (var k in S.runs) { trainProgress(S.runs[k]); saveBrain(S.runs[k].b); }
          notify(S);
        }
      }
    },
    removeSession: function (id) {
      sessions = sessions.filter(function (S) { return S.id !== id || S.state === 'running' || S.state === 'loading'; });
    },
    stopTraining: function () { for (var i = 0; i < sessions.length; i++) Aima.stopSession(sessions[i].id); },
    sessionText: function (S, full) { return S.b ? (full ? trainFull(S) : trainSummary(S)) : (S.error || ''); },

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
    memory: function (b) { return (b || active).memN; },
    work: function (b) { return work(b || active); },
    fmtOps: fmtOps
  };
  makeCtl(World.aiSlots[0]);
  makeCtl(World.aiSlots[1]);
  NS.Aima = Aima;
})(window.RS6 = window.RS6 || {});
