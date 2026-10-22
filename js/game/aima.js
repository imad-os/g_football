/* ai.ma: a learning player. On a team whose CPU level is AI.MA it controls the selected player only (the arrow in
 * violet), through a virtual controller: the same stick, sprint, buttons and hold times as a human, so it has every
 * move a human has. The other ten are the Legend CPU.
 *
 * The model is a small neural network (64 inputs: the play around him and the whole match situation, time left,
 * score, cards, possession...; 2 hidden layers; heads for stick, sprint, button, power and a value). It learns:
 *  - by copying: the Legend CPU while it is new (it plays some spells of the match as the CPU, less and less), and the
 *    trainer's own play (the trainer's profile only), which is what gives it a style
 *  - from rewards (actor-critic, n-step returns): goals, shots, passes, ball won / lost, fouls... and the trainer's
 *    claps (a gauge: a quick tap is a small clap, a full hold 100%)
 * Saved with MyPC.save (per profile, synced by My PC). Training runs a few small steps per decision: no allocation in
 * the loop, a few hundred microseconds per second of play. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var B = NS.Bindings;
  var Actions = NS.Actions;

  var ALG = 'AIMA-AC 1.0 (actor-critic + imitation)';
  var SAVE_KEY = 'aima';
  var TRAINER = 'imad';
  var F = 64, H1 = 64, H2 = 48;
  // brain sizes (hidden layers). SMALL fits My PC's save (64 KB per app); the others need the Firebase store
  var SIZES = { SMALL: [64, 48], LARGE: [256, 128], HUGE: [512, 256] };
  var sizeName = 'SMALL';
  var NST = 9, NSP = 2, NBT = 13, NPW = 3;
  var O_ST = 0, O_SP = 9, O_BT = 11, O_PW = 24, O_V = 27, NOUT = 28;
  var TICK = 0.1;           // a decision every 0.1 s of play
  var NSTEP = 20;           // n-step returns: 2 s
  var GAMMA = 0.97;
  var TRAJ = 32;
  var MEM = 6000;           // copied samples kept for replay
  var CLAP_FULL = 1.0;      // seconds of hold for a 100% clap
  var HOLD_PASS = [0.12, 0.5, 1.0];   // x power bar time
  var HOLD_CONT = [0.3, 0.8, 1.5];    // press / team press, seconds
  var LR = [0.0003, 0.001, 0.003];
  var TEMP = [0.7, 1.0, 1.4];
  var CLAP_W = [0.6, 1.0, 1.6];
  var HELP = { AUTO: -1, H0: 0, H30: 0.3, H60: 0.6 };
  // reward weights per style: goal, shot, pass, forward pass, won, lost, carry
  var STYLES = {
    BALANCED: [1, 1, 1, 1, 1, 1, 1],
    ATTACKER: [1.3, 1.8, 0.6, 0.8, 0.8, 0.8, 1.5],
    PLAYMAKER: [1, 0.8, 2, 2.2, 1, 1.4, 0.6],
    DEFENDER: [1, 0.6, 1, 0.8, 2.2, 1.5, 0.6]
  };

  // ---- parameters: W1 b1 W2 b2 W3 b3 in one array (allocated by build(), never in the loop)
  var OW1, OB1, OW2, OB2, OW3, OB3, NP, TENS, P, G, AM, AV, h1, h2, dh1, dh2;
  var adamT = 0;
  var out = new Float32Array(NOUT), dout = new Float32Array(NOUT);
  function build(name) {
    if (!SIZES[name]) name = 'SMALL';
    sizeName = name;
    H1 = SIZES[name][0]; H2 = SIZES[name][1];
    OW1 = 0; OB1 = OW1 + H1 * F; OW2 = OB1 + H1; OB2 = OW2 + H2 * H1; OW3 = OB2 + H2; OB3 = OW3 + NOUT * H2;
    NP = OB3 + NOUT;
    TENS = [[OW1, H1 * F], [OB1, H1], [OW2, H2 * H1], [OB2, H2], [OW3, NOUT * H2], [OB3, NOUT]];
    P = new Float32Array(NP); G = new Float32Array(NP); AM = new Float32Array(NP); AV = new Float32Array(NP);
    h1 = new Float32Array(H1); h2 = new Float32Array(H2); dh1 = new Float32Array(H1); dh2 = new Float32Array(H2);
    if (NS.Aima) { NS.Aima.H1 = H1; NS.Aima.H2 = H2; NS.Aima.NP = NP; }
  }
  build('SMALL');
  var prob = new Float32Array(16);
  var bmask = new Uint8Array(NBT);
  var xs = new Float32Array(F);

  // ---- copied samples (Legend CPU, the trainer): ring buffer
  var memX = new Float32Array(MEM * F);
  var memA = new Int8Array(MEM * 5); // stick, sprint, button, power, ctx
  var memW = new Float32Array(MEM);
  var memN = 0, memI = 0;

  var cfg = { learn: true, mine: true, lr: 1, explore: 1, clap: 1, help: 'AUTO', style: 'BALANCED', size: 'SMALL' };
  var st = null;          // stats (saved)
  var meta = null;        // model info (saved)
  var trainer = false, profile = { id: '', name: '' };
  var lastSave = 0;
  var dirty = false;

  function freshStats() {
    return {
      matches: 0, mins: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, goals: 0, shots: 0, onTarget: 0, passes: 0, passOk: 0,
      fwdPass: 0, tackles: 0, won: 0, lost: 0, fouls: 0, claps: 0, clapSum: 0, reward: 0, decisions: 0, modelDec: 0,
      rl: 0, im: 0, humanSamples: 0, cpuSamples: 0, carryT: 0, sprintT: 0, playT: 0, xSum: 0, xN: 0,
      btn: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hist: []
    };
  }

  function initParams() {
    for (var t = 0; t < TENS.length; t++) {
      var o = TENS[t][0], n = TENS[t][1];
      var fan = t === 0 ? F : (t === 2 ? H1 : (t === 4 ? H2 : 0));
      var s = fan ? Math.sqrt(1.5 / fan) : 0;
      for (var i = 0; i < n; i++) P[o + i] = fan ? (Math.random() * 2 - 1) * s : 0;
    }
    P[OB3 + O_BT] = 3;    // a new model mostly presses nothing
    P[OB3 + O_PW + 1] = 0.5;
    AM.fill(0); AV.fill(0); adamT = 0;
    meta = { created: Date.now(), saved: 0, version: 1, from: 'new' };
  }

  // ---- network
  function forward(x) {
    var i, j, s, o;
    for (i = 0; i < H1; i++) {
      s = P[OB1 + i]; o = OW1 + i * F;
      for (j = 0; j < F; j++) s += P[o + j] * x[j];
      h1[i] = Math.tanh(s);
    }
    for (i = 0; i < H2; i++) {
      s = P[OB2 + i]; o = OW2 + i * H1;
      for (j = 0; j < H1; j++) s += P[o + j] * h1[j];
      h2[i] = Math.tanh(s);
    }
    for (i = 0; i < NOUT; i++) {
      s = P[OB3 + i]; o = OW3 + i * H2;
      for (j = 0; j < H2; j++) s += P[o + j] * h2[j];
      out[i] = s;
    }
  }

  // gradients of the loss w.r.t. the outputs are in dout; accumulates into G and takes one Adam step
  function backward(x) {
    var i, j, o, d;
    G.fill(0);
    for (j = 0; j < H2; j++) dh2[j] = 0;
    for (i = 0; i < NOUT; i++) {
      d = dout[i];
      if (d === 0) continue;
      G[OB3 + i] += d;
      o = OW3 + i * H2;
      for (j = 0; j < H2; j++) { G[o + j] += d * h2[j]; dh2[j] += P[o + j] * d; }
    }
    for (j = 0; j < H1; j++) dh1[j] = 0;
    for (i = 0; i < H2; i++) {
      d = dh2[i] * (1 - h2[i] * h2[i]);
      G[OB2 + i] += d;
      o = OW2 + i * H1;
      for (j = 0; j < H1; j++) { G[o + j] += d * h1[j]; dh1[j] += P[o + j] * d; }
    }
    for (i = 0; i < H1; i++) {
      d = dh1[i] * (1 - h1[i] * h1[i]);
      G[OB1 + i] += d;
      o = OW1 + i * F;
      for (j = 0; j < F; j++) G[o + j] += d * x[j];
    }
    // clip the gradient norm, then Adam
    var n2 = 0;
    for (i = 0; i < NP; i++) n2 += G[i] * G[i];
    var sc = n2 > 25 ? 5 / Math.sqrt(n2) : 1;
    adamT++;
    var lr = LR[cfg.lr] || LR[1];
    var c1 = 1 - Math.pow(0.9, adamT), c2 = 1 - Math.pow(0.999, adamT);
    var a = lr * Math.sqrt(c2) / c1;
    for (i = 0; i < NP; i++) {
      var g = G[i] * sc;
      AM[i] = 0.9 * AM[i] + 0.1 * g;
      AV[i] = 0.999 * AV[i] + 0.001 * g * g;
      P[i] -= a * AM[i] / (Math.sqrt(AV[i]) + 1e-8);
    }
    dirty = true;
  }

  // softmax of out[off..off+n) (optional mask) into prob[0..n)
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

  // which buttons can be pressed: the moves of this context that have a binding
  function setMask(ctx) {
    bmask[0] = 1;
    for (var k = 0; k < B.MOVES.length; k++) bmask[k + 1] = (B.MOVES[k].ctx === ctx && B.MOVES[k].mask) ? 1 : 0;
  }

  /* ------------------------------------------------------------------ inputs */

  var NR = [0, 0, 0], NRD = [0, 0, 0];
  var poss = [0, 0], shotsT = [0, 0];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function airNear(p) {
    var ball = World.ball;
    if (ball.owner || ball.pos.y < 1.3 || ball.pos.y > 6) return false;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    return dx * dx + dz * dz < 16;
  }
  function ctxOf(p) { var o = World.ball.owner; return o === p ? 1 : (airNear(p) ? 1 : 2); }

  // the 3 nearest players of `team` (not p, not keepers) into NR (indexes) / NRD (distances)
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

  function features(p, x) {
    var ball = World.ball, m = World.match, players = World.players;
    var HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H;
    var a = p.team === 0 ? 1 : -1;
    var px = p.pos.x * a, pz = p.pos.z;
    var o = ball.owner;
    var i, k, q, dx, dz, d;
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
    // shooting lane, team-mates ahead, opponents goal-side, the offside line
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

  function remember(x, stk, spr, btn, pw, ctx, w) {
    var o = memI * F;
    for (var j = 0; j < F; j++) memX[o + j] = x[j];
    o = memI * 5;
    memA[o] = stk; memA[o + 1] = spr; memA[o + 2] = btn; memA[o + 3] = pw; memA[o + 4] = ctx;
    memW[memI] = w;
    memI = (memI + 1) % MEM;
    if (memN < MEM) memN++;
  }

  var rx = new Float32Array(F);
  function imitateOne() {
    if (!memN) return;
    var i = Math.floor(Math.random() * memN);
    var o = i * F;
    for (var j = 0; j < F; j++) rx[j] = memX[o + j];
    o = i * 5;
    var stk = memA[o], spr = memA[o + 1], btn = memA[o + 2], pw = memA[o + 3], ctx = memA[o + 4];
    var w = memW[i];
    forward(rx);
    dout.fill(0);
    headGrad(O_ST, NST, null, stk, w, 0);
    headGrad(O_SP, NSP, null, spr, w * 0.5, 0);
    setMask(ctx);
    if (bmask[btn]) headGrad(O_BT, NBT, bmask, btn, w * (btn ? 2.5 : 1), 0);
    if (btn && pw >= 0) headGrad(O_PW, NPW, null, pw, w, 0);
    backward(rx);
    st.im++;
  }

  // stick (world) -> one of 9 classes in the team's frame (0 = none)
  function stickClass(sx, sz, a) {
    var l = Math.sqrt(sx * sx + sz * sz);
    if (l < 0.35) return 0;
    var ang = Math.atan2(sz, sx * a); // 0 = towards the goal
    var k = Math.round(ang / (Math.PI / 4));
    if (k < 0) k += 8;
    return 1 + (k % 8);
  }

  /* ------------------------------------------------------------------ the AI.MA controller */

  var KICK_MOVE = {};
  KICK_MOVE[ACT.PASS] = 0; KICK_MOVE[ACT.THROUGH] = 1; KICK_MOVE[ACT.LONG] = 2;
  KICK_MOVE[ACT.SHOOT] = 3; KICK_MOVE[ACT.CURVE] = 4; KICK_MOVE[ACT.CHIP] = 5;
  var I_TACKLE = B.index('tackle'), I_SLIDE = B.index('slide'), I_PRESS = B.index('press');

  function makeCtl(slot) {
    slot.pad = { x: 0, y: 0, cur: 0, latch: 0, burst: false };
    slot.ai = true;
    slot.c = {
      t: 0, mode: 1, modeT: 0, cpu: true, stk: 0, spr: 0, btnMask: 0, holdT: 0, holdLeft: 0,
      tBtn: 0, tPow: 1, // what the CPU did since the last tick (copying)
      traj: new Float32Array(TRAJ * F), ta: new Int8Array(TRAJ * 4), tv: new Float32Array(TRAJ), tr: new Float32Array(TRAJ),
      tctx: new Int8Array(TRAJ), tn: 0, th: 0
    };
  }

  function help() {
    var h = HELP[cfg.help];
    if (h === undefined || h < 0) h = clamp(1 - st.decisions / 150000, 0.35, 1);
    return h;
  }

  // n-step update of the oldest step of the slot's trajectory (bootstrap: the newest value, or 0 at the end)
  var ux = new Float32Array(F);
  function learnOldest(c, boot) {
    var n = c.tn;
    if (!n) return;
    var i0 = c.th;
    var R = 0, g = 1;
    for (var k = 0; k < n; k++) { R += g * c.tr[(i0 + k) % TRAJ]; g *= GAMMA; }
    if (boot) R += g * c.tv[(i0 + n - 1) % TRAJ];
    var o = i0 * F;
    for (var j = 0; j < F; j++) ux[j] = c.traj[o + j];
    if (cfg.learn) {
      forward(ux);
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
      backward(ux);
      st.rl++;
    }
    c.th = (c.th + 1) % TRAJ;
    c.tn--;
  }
  function flush(slot) {
    var c = slot.c;
    if (!c) return;
    while (c.tn) learnOldest(c, false);
  }

  function addReward(team, r) {
    var s = World.aiSlots[team];
    if (!s || !s.active || !s.c) return;
    st.reward += r;
    matchReward += r;
    var c = s.c;
    if (c.tn) c.tr[(c.th + c.tn - 1) % TRAJ] += r;
  }

  // one decision of the model: stick, sprint, maybe a button with its hold time
  function decide(slot, p) {
    var c = slot.c;
    var a = p.team === 0 ? 1 : -1;
    features(p, xs);
    forward(xs);
    var temp = TEMP[cfg.explore] || 1;
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
        st.btn[btn]++;
      }
    }
    c.stk = stk; c.spr = spr;
    think(slot, p, btn, stk, spr);
    // the trajectory (for the rewards)
    if (c.tn === TRAJ) learnOldest(c, true);
    var idx = (c.th + c.tn) % TRAJ;
    var o = idx * F;
    for (var j = 0; j < F; j++) c.traj[o + j] = xs[j];
    o = idx * 4;
    c.ta[o] = stk; c.ta[o + 1] = spr; c.ta[o + 2] = btn; c.ta[o + 3] = pw;
    c.tctx[idx] = ctx;
    c.tv[idx] = out[O_V];
    c.tr[idx] = 0;
    c.tn++;
    if (c.tn > NSTEP) learnOldest(c, true);
    st.modelDec++;
  }

  // a move made right now (by the CPU in a copying spell, or by the trainer): the situation at that very moment
  function copyMove(p, mi, pw, w) {
    if (!cfg.learn || mi < 0) return;
    var a = p.team === 0 ? 1 : -1;
    features(p, xs);
    var ctx = B.MOVES[mi].ctx;
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    remember(xs, sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a), sp > 10.2 ? 1 : 0, mi + 1, pw, ctx, w);
  }

  // the CPU played this spell: copy what it did
  function copyCpu(slot, p) {
    var c = slot.c;
    var a = p.team === 0 ? 1 : -1;
    features(p, xs);
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    var stk = sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a);
    var ctx = ctxOf(p);
    if (cfg.learn && c.tBtn === 0) remember(xs, stk, sp > 10.2 ? 1 : 0, 0, -1, ctx, 0.6);
    st.cpuSamples++;
    think(slot, p, 0, 0, 0);
    c.tBtn = 0; c.tPow = 1;
  }

  /* ------------------------------------------------------------------ rewards, stats (polled every step) */

  var lastOwner = null, lastOwnerAi = false, lastScore = [0, 0], matchReward = 0, matchOn = false, aiTeams = 0;
  var pendShot = null, pendShotT = 0, pendShotOn = false, lastSetPiece = 0;
  var tackleT = [0, 0];
  var aiPlayers = [null, null];

  function aiOf(p) { var s = World.aiSlots[p.team]; return s && s.active && s.player === p && s.c && !s.c.cpu; }
  function isAiSel(p) { var s = World.aiSlots[p.team]; return s && s.active && s.player === p; }

  // the kick hook (wrapped once on load; debug matches wrap on top of it)
  var origRelease = Actions.release;
  Actions.release = function (p, type) {
    var sc = World.aiSlots[p.team];
    if (World.match.running && sc && sc.active && sc.player === p && sc.c.cpu && KICK_MOVE[type] !== undefined) {
      copyMove(p, KICK_MOVE[type], type >= ACT.SHOOT ? 2 : 1, 1.2); // he still has the ball here
      sc.c.tBtn = 1;
    }
    origRelease.apply(this, arguments);
    if (!World.match.running) return;
    if (type >= ACT.SHOOT) shotsT[p.team]++;
    var s = World.aiSlots[p.team];
    if (!s || !s.active || s.player !== p) return;
    var c = s.c;
    if (c.cpu) return;
    if (type >= ACT.SHOOT) {
      st.shots++; pendShot = p; pendShotT = 4; pendShotOn = false;
      addReward(p.team, 0.15 * styleW(1));
    } else {
      st.passes++;
    }
  };
  var origTackle = Actions.startTackle;
  Actions.startTackle = function (p, carrier, human, slide) {
    if (World.match.running && isAiSel(p) && World.aiSlots[p.team].c.cpu) {
      copyMove(p, slide ? I_SLIDE : I_TACKLE, -1, 1.2);
      World.aiSlots[p.team].c.tBtn = 1;
    }
    var r = origTackle.apply(this, arguments);
    if (World.match.running && isAiSel(p)) {
      var c = World.aiSlots[p.team].c;
      if (!c.cpu) st.tackles++;
      tackleT[p.team] = 0.8;
    }
    return r;
  };
  var origShoulder = Actions.shoulder;
  Actions.shoulder = function (p) {
    if (World.match.running && isAiSel(p) && World.aiSlots[p.team].c.cpu) { copyMove(p, I_PRESS, 1, 1); World.aiSlots[p.team].c.tBtn = 1; }
    return origShoulder.apply(this, arguments);
  };

  function styleW(i) { return (STYLES[cfg.style] || STYLES.BALANCED)[i]; }

  function poll(dt) {
    var ball = World.ball, m = World.match;
    var o = ball.owner;
    if (o) poss[o.team] += dt;
    // goals
    for (var t = 0; t < 2; t++) {
      if (m.score[t] !== lastScore[t]) {
        var diff = m.score[t] - lastScore[t];
        lastScore[t] = m.score[t];
        if (diff <= 0) continue;
        addReward(t, 1.0 * styleW(0));
        addReward(1 - t, -0.8);
        if (pendShot && pendShot.team === t) { st.goals++; st.onTarget++; addReward(t, 0.5 * styleW(0)); pendShot = null; }
      }
      if (tackleT[t] > 0) tackleT[t] -= dt;
    }
    if (pendShot) {
      pendShotT -= dt;
      if (!pendShotOn && (ball.gkTried & (1 << (1 - pendShot.team)))) { pendShotOn = true; st.onTarget++; addReward(pendShot.team, 0.1); }
      if (pendShotT <= 0) pendShot = null;
    }
    // the ball changes hands
    if (o && o !== lastOwner) {
      if (lastOwner) {
        var lt = lastOwner.team, a = lt === 0 ? 1 : -1;
        if (lastOwnerAi) {
          if (o.team !== lt) { st.lost++; addReward(lt, -0.25 * styleW(5)); }
          else {
            st.passOk++;
            var gain = (o.pos.x - lastOwner.pos.x) * a;
            addReward(lt, 0.08 * styleW(2) + (gain > 5 ? 0.12 * styleW(3) : 0));
            if (gain > 5) st.fwdPass++;
          }
        }
        if (aiOf(o) && o.team !== lt) { st.won++; addReward(o.team, 0.25 * styleW(4)); }
      }
      lastOwner = o;
      lastOwnerAi = aiOf(o);
    }
    // carrying it forward
    if (o && aiOf(o)) {
      st.carryT += dt;
      addReward(o.team, 0.004 * styleW(6) * o.vel.x * (o.team === 0 ? 1 : -1) * dt);
    }
    // a foul given against the AI.MA team just after its player tackled
    if (m.setPiece !== lastSetPiece) {
      if ((m.setPiece === 1 || m.setPiece === 2) && m.setPieceTimer > 0 && tackleT[1 - m.setTeam] > 0 && World.aiSlots[1 - m.setTeam].active) {
        st.fouls++; addReward(1 - m.setTeam, -0.3);
      }
      lastSetPiece = m.setPiece;
    }
  }

  /* ------------------------------------------------------------------ claps (the trainer only) */

  var clapDown = 0, clapOn = false;

  /* ------------------------------------------------------------------ what he is thinking (the status box) */

  var thought = 'watch', thoughtT = 0, happyT = 0;
  // from his choice this tick (or the CPU's play while copying) and the match situation
  function think(slot, p, btn, stk, spr) {
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
    // a new thought shows for at least 0.6 s (no flicker)
    if (key !== thought && (thoughtT <= 0 || key === 'shoot' || key === 'happy')) { thought = key; thoughtT = 0.6; }
  }

  function anyAi() { return World.aiSlots[0].active || World.aiSlots[1].active; }

  /* ------------------------------------------------------------------ save / load */

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
  function packWeights() {
    var q = new Int16Array(NP), scales = [];
    for (var t = 0; t < TENS.length; t++) {
      var o = TENS[t][0], n = TENS[t][1], mx = 1e-6, i;
      for (i = 0; i < n; i++) mx = Math.max(mx, Math.abs(P[o + i]));
      var s = mx / 32767;
      scales.push(s);
      for (i = 0; i < n; i++) q[o + i] = Math.round(P[o + i] / s);
    }
    return { dims: [F, H1, H2, NOUT], size: sizeName, sc: scales, w: b64(new Uint8Array(q.buffer)) };
  }
  // loads weights; a model of another brain size switches the network to that size
  function unpackWeights(obj) {
    if (!obj || !obj.dims || obj.dims[0] !== F || obj.dims[3] !== NOUT) return false;
    if (obj.dims[1] !== H1 || obj.dims[2] !== H2) {
      var nm = null;
      for (var k in SIZES) if (SIZES[k][0] === obj.dims[1] && SIZES[k][1] === obj.dims[2]) nm = k;
      if (!nm) return false;
      build(nm);
      cfg.size = nm;
    }
    var u = unb64(obj.w);
    if (u.length !== NP * 2) return false;
    var q = new Int16Array(u.buffer);
    for (var t = 0; t < TENS.length; t++) {
      var o = TENS[t][0], n = TENS[t][1], s = obj.sc[t];
      for (var i = 0; i < n; i++) P[o + i] = q[o + i] * s;
    }
    AM.fill(0); AV.fill(0); adamT = 0;
    return true;
  }

  // ---- cloud store: the owner's own Firebase project (public web config in js/data/aima-cloud.js, or the app config
  // "aimaFirebase"), through the REST APIs (no SDK in the game; the Google sign-in loads Firebase Auth only then).
  //  - the trainer signs in once with Google (on a computer); the refresh token is kept in his My PC save, so his TV and
  //    other devices use it too. Only his account may write (Firestore rules): the model is "aima/trainer".
  //  - everyone else signs in anonymously and gets a fresh copy of the trainer's model at every start (read only).
  var cloud = null, auth = null, idTok = '', idExp = 0, tokP = null, cloudBusy = false, cloudAgain = false;
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
  // the trainer's model goes up (signed in with Google only)
  function cloudPut(obj) {
    if (!cloud || !trainer || !auth || auth.anon) return;
    if (cloudBusy) { cloudAgain = true; return; }
    cloudBusy = true;
    var body = JSON.stringify({ fields: { data: { stringValue: JSON.stringify(obj) }, updated: { integerValue: String(Date.now()) } } });
    token().then(function (t) {
      return fetch(docUrl('trainer'), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body });
    }).then(function (r) {
      Aima.cloud = r.ok ? 'ok' : 'error ' + r.status;
    }, function (e) { Aima.cloud = 'error ' + (e && e.message ? e.message : 'network'); }).then(function () {
      cloudBusy = false;
      if (cloudAgain) { cloudAgain = false; save(); }
    });
  }

  function applySaved(obj, withStats) {
    if (!obj || obj.v !== 1 || !unpackWeights(obj.m)) return false;
    meta = obj.meta || { created: Date.now(), saved: 0, version: 1, from: 'save' };
    if (withStats) {
      st = freshStats();
      if (obj.st) for (var k in obj.st) if (Object.prototype.hasOwnProperty.call(st, k)) st[k] = obj.st[k];
      if (obj.cfg) for (var c in obj.cfg) if (Object.prototype.hasOwnProperty.call(cfg, c)) cfg[c] = obj.cfg[c];
    }
    return true;
  }

  function save() {
    if (!st) return;
    // other profiles keep their own stats and settings only (the model is the trainer's)
    if (!trainer) {
      try { MyPC.save(SAVE_KEY, { v: 1, viewer: true, cfg: cfg, st: st }); } catch (e) {}
      lastSave = performance.now();
      dirty = false;
      return;
    }
    meta.saved = Date.now();
    var obj = { v: 1, alg: ALG, meta: meta, cfg: cfg, st: st, m: packWeights() };
    var json = JSON.stringify(obj);
    Aima.sizeKB = Math.round(json.length / 102.4) / 10;
    // My PC's save: the whole model when it fits (SMALL), else the settings and stats only (the model is in the cloud)
    var local = sizeName === 'SMALL' ? obj : { v: 1, cloudOnly: true, alg: ALG, meta: meta, cfg: cfg, st: st };
    try { MyPC.save(SAVE_KEY, local); } catch (e) {}
    cloudPut(obj);
    lastSave = performance.now();
    dirty = false;
  }

  function load() {
    var obj = null;
    try { obj = MyPC.load(SAVE_KEY, null); } catch (e) { obj = null; }
    st = freshStats();
    if (obj && obj.v === 1 && obj.cfg) for (var c in obj.cfg) if (Object.prototype.hasOwnProperty.call(cfg, c)) cfg[c] = obj.cfg[c];
    if (obj && obj.v === 1 && obj.st) for (var k in obj.st) if (Object.prototype.hasOwnProperty.call(st, k)) st[k] = obj.st[k];
    if (!trainer) cfg.learn = false; // only the trainer trains it
    if (!cloudCfg() && cfg.size !== 'SMALL') cfg.size = 'SMALL'; // a bigger brain needs the cloud store
    if (trainer && obj && !obj.cloudOnly && !obj.viewer && applySaved(obj, true)) {
      Aima.sizeKB = Math.round(JSON.stringify(obj).length / 102.4) / 10;
      return;
    }
    build(cfg.size);
    initParams();
    if (trainer && obj && obj.meta) meta = obj.meta;
    // until the cloud answers: the model published with the game (js/data/aima-seed.js), if any
    if (!trainer && NS.AIMA_SEED && unpackWeights(NS.AIMA_SEED.m)) meta.from = 'seed';
    Aima.sizeKB = 0;
  }

  // after start: the trainer's model from the cloud (for the trainer only when it is newer: another device trained it)
  function loadCloud() {
    cloud = cloudCfg();
    if (!cloud) { Aima.cloud = 'off'; return; }
    Aima.cloud = 'loading';
    var mine = trainer && meta && meta.saved ? meta.saved : 0;
    cloudGet('trainer').then(function (obj) {
      if (obj) {
        if (trainer) {
          if (obj.meta && (obj.meta.saved || 0) > mine) applySaved(obj, true); // trained on another device since
        } else if (unpackWeights(obj.m)) {
          meta = obj.meta || meta;
          meta.from = 'trainer';
          Aima.trainerStats = obj.st || null;
        }
      }
      Aima.cloud = 'ok';
    }).catch(function (e) { Aima.cloud = 'error ' + (e && e.message ? e.message : 'network'); });
  }

  // Google sign-in for the trainer (on a computer): Firebase Auth from Google's CDN, loaded only now
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
      loadCloud();
      return auth.email || auth.uid || 'ok';
    });
  }
  function isImad() { return profile.name.trim().toLowerCase() === TRAINER; }

  /* ------------------------------------------------------------------ public */

  var Aima = {
    ALG: ALG, F: F, H1: H1, H2: H2, NOUT: NOUT, NP: NP, STYLES: STYLES, SIZES: SIZES,
    sizeKB: 0, cloud: 'off', trainerStats: null,
    hasCloud: function () { return !!cloudCfg(); },
    // a new brain size: a new network (the old one is replaced)
    setSize: function (name) {
      if (!SIZES[name] || (name !== 'SMALL' && !cloudCfg())) return false;
      cfg.size = name;
      build(name);
      initParams();
      memN = 0; memI = 0;
      save();
      return true;
    },
    cfg: cfg,
    stats: function () { return st; },
    meta: function () { return meta; },
    help: function () { return help(); },
    memory: function () { return memN; },
    profile: function () { return profile; },
    isTrainer: function () { return trainer; },
    thought: function () { return thought; },
    clapFrac: function () { return clapOn ? Math.min(1, (performance.now() - clapDown) / 1000 / CLAP_FULL) : -1; },

    init: function (info) {
      var pr = info && info.profile ? info.profile : null;
      profile = { id: pr && pr.id ? String(pr.id) : '', name: pr && pr.name ? String(pr.name) : '' };
      try { auth = MyPC.load('aimaAuth', null); } catch (e) { auth = null; }
      // the trainer: the profile named "imad", signed in with his Google account (when the cloud store is set up)
      trainer = isImad() && (!cloudCfg() || !!(auth && auth.refresh && !auth.anon));
      load();
      loadCloud();
    },
    signIn: signIn,
    signInCode: function (code) { return useRefresh(code, '', ''); },
    signOut: function () { auth = null; idTok = ''; saveAuth(); trainer = isImad() && !cloudCfg(); },
    account: function () { return auth && !auth.anon ? (auth.email || auth.uid || '?') : ''; },
    isImad: function () { return isImad(); },

    makeSlot: makeCtl,

    // a new match: per-match counters
    matchStart: function () {
      poss[0] = poss[1] = 0; shotsT[0] = shotsT[1] = 0;
      lastOwner = null; lastOwnerAi = false; lastScore[0] = lastScore[1] = 0; matchReward = 0; matchOn = false;
      pendShot = null; lastSetPiece = 0; tackleT[0] = tackleT[1] = 0;
    },

    // full time (finished) or abandoned: results, the last rewards, save
    matchEnd: function (finished) {
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (!s.c) continue;
        flush(s);
        if (finished && s.active && matchOn) {
          var m = World.match, my = m.score[t], th = m.score[1 - t];
          st.matches++; st.gf += my; st.ga += th;
          if (my > th) st.w++; else if (my < th) st.l++; else st.d++;
        }
      }
      if (matchOn) {
        st.hist.push(Math.round(matchReward * 100) / 100);
        if (st.hist.length > 30) st.hist.shift();
      }
      matchOn = false;
      // debug matches run back to back: save at most every 20 s
      if (performance.now() - lastSave > (NS.Debug && NS.Debug.running() ? 20000 : 0)) save();
    },

    // every step of play (before the controllers)
    poll: function (dt) {
      if (!st || !anyAi()) return;
      matchOn = true;
      st.mins += dt / 60;
      poll(dt);
    },

    // drives the AI.MA slot. true = the model plays this step (Controls.update reads slot.pad); false = the Legend CPU
    // plays him (a copying spell)
    drive: function (slot, dt) {
      var c = slot.c, p = slot.player, pad = slot.pad;
      c.modeT -= dt;
      if (c.modeT <= 0) {
        c.modeT = 2;
        var newMode = Math.random() < help() ? 0 : 1;
        if (newMode !== c.mode) { flush(slot); c.holdLeft = 0; pad.cur = 0; }
        c.mode = newMode;
      }
      // restarts and penalties he takes are played by the Legend CPU (he copies them): play never waits on him
      var m = World.match;
      c.cpu = c.mode === 0 || m.penalty || (m.restart && World.ball.owner === p);
      c.t -= dt;
      var tick = c.t <= 0;
      if (thoughtT > 0) thoughtT -= dt;
      if (happyT > 0) happyT -= dt;
      if (tick) {
        c.t = TICK;
        st.decisions++;
        st.playT += TICK;
        var a = p.team === 0 ? 1 : -1;
        st.xSum += p.pos.x * a / NS.PITCH_HALF_W; st.xN++;
        if (!c.cpu) decide(slot, p);
        else copyCpu(slot, p);
        if (cfg.learn && memN) { imitateOne(); imitateOne(); imitateOne(); }
      }
      if (c.cpu) {
        pad.cur = 0; pad.x = 0; pad.y = 0; c.holdLeft = 0;
        return false;
      }
      // the virtual controller
      var a2 = p.team === 0 ? 1 : -1;
      if (c.stk) {
        var ang = (c.stk - 1) * Math.PI / 4;
        pad.x = Math.cos(ang) * a2; pad.y = Math.sin(ang);
        // never runs himself off the pitch (the lines are walls for his stick)
        var HW = NS.PITCH_HALF_W - 1.2, HH = NS.PITCH_HALF_H - 1.2;
        if ((p.pos.x > HW && pad.x > 0) || (p.pos.x < -HW && pad.x < 0)) pad.x = 0;
        if ((p.pos.z > HH && pad.y > 0) || (p.pos.z < -HH && pad.y < 0)) pad.y = 0;
      } else { pad.x = 0; pad.y = 0; }
      if (c.spr) { st.sprintT += dt; }
      var cur = c.spr ? B.sprintMask() : 0;
      if (c.holdLeft > 0) { c.holdLeft -= dt; if (c.holdLeft > 0) cur |= c.btnMask; }
      pad.cur = cur;
      return true;
    },

    // the human's own play (the trainer's profile, "learn from my play"): a sample every 0.1 s
    observe: function (slot, dt) {
      if (!trainer || !cfg.mine || !cfg.learn || !slot.player || !st) return;
      slot.obsT = (slot.obsT || 0) - dt;
      if (slot.obsT > 0) return;
      slot.obsT = TICK;
      var p = slot.player, pad = NS.Input.pads[slot.idx];
      var a = p.team === 0 ? 1 : -1;
      features(p, xs);
      var ctx = ctxOf(p);
      var btn = 0;
      if (slot.pressing && !slot.obsPressing) btn = (slot.teamPress ? B.index('teampress') : I_PRESS) + 1;
      slot.obsPressing = slot.pressing;
      setMask(ctx);
      if (!bmask[btn]) btn = 0;
      remember(xs, stickClass(pad.x, pad.y, a), B.sprintDown(pad.cur) ? 1 : 0, btn, btn ? 1 : -1, ctx, 1.5);
      st.humanSamples++;
      imitateOne();
    },
    // a move the human just made (js/game/controls.js): hold time -> power class
    humanMove: function (slot, mi, holdT) {
      if (!trainer || slot.ai) return;
      var mv = B.MOVES[mi];
      var full = World.settings.gaugeTime > 0 ? World.settings.gaugeTime : 0.5;
      var f = mv.kind === 2 ? holdT / 1.5 : holdT / full;
      if (!cfg.mine || !cfg.learn || !slot.player) return;
      // the situation as he presses it (before the ball leaves), with the stick he is holding
      var p = slot.player, pad = NS.Input.pads[slot.idx], a = p.team === 0 ? 1 : -1;
      features(p, xs);
      remember(xs, stickClass(pad.x, pad.y, a), B.sprintDown(pad.cur) ? 1 : 0, mi + 1, f < 0.3 ? 0 : (f < 0.75 ? 1 : 2), mv.ctx, 3);
      st.humanSamples++;
    },

    // the clap button (js/core/input.js): down starts the gauge, up gives the clap
    clapButton: function (down) {
      if (!trainer || !World.match.running || World.match.paused || !anyAi()) { clapOn = false; return; }
      if (down) { if (!clapOn) { clapOn = true; clapDown = performance.now(); } return; }
      if (!clapOn) return;
      clapOn = false;
      var held = (performance.now() - clapDown) / 1000;
      var strength = 0.25 + 0.75 * Math.min(1, held / CLAP_FULL); // a tap ~25%, a full hold 100%
      var r = 1.5 * strength * (CLAP_W[cfg.clap] || 1);
      for (var t = 0; t < 2; t++) if (World.aiSlots[t].active) addReward(t, r);
      st.claps++; st.clapSum += strength;
      happyT = 1.5 + strength; thought = 'happy'; thoughtT = 1;
      if (NS.HUD.clap) NS.HUD.clap(strength);
      NS.Audio.applause && NS.Audio.applause(strength);
    },

    setCfg: function (k, v) { cfg[k] = v; save(); },
    save: function () { if (dirty || st) save(); },
    reset: function () {
      initParams();
      st = freshStats();
      memN = 0; memI = 0;
      if (NS.AIMA_SEED && unpackWeights(NS.AIMA_SEED.m)) meta.from = 'seed';
      save();
    },
    // the model for the seed of every other profile (js/data/aima-seed.js): weights + where it stands
    exportText: function () {
      var pk = packWeights();
      return JSON.stringify({ alg: ALG, meta: { created: meta.created, exported: Date.now(), decisions: st.decisions, matches: st.matches,
        claps: st.claps, by: profile.name }, m: pk });
    },
    // style read from what it does (model spells): shares of its button presses, sprint, average position
    style: function () {
      var b = st.btn, k;
      var kicks = 0, pass = 0, shots = 0, def = 0;
      for (k = 0; k < B.MOVES.length; k++) {
        var n = b[k + 1] || 0;
        if (B.MOVES[k].ctx === 1) { kicks += n; if (k >= 3 && k <= 5) shots += n; else pass += n; }
        else def += n;
      }
      return {
        pass: kicks ? pass / kicks : 0, shoot: kicks ? shots / kicks : 0,
        sprint: st.playT ? st.sprintT / st.playT : 0, carry: st.playT ? st.carryT / st.playT : 0,
        pos: st.xN ? st.xSum / st.xN : 0, defend: def, fwd: st.passOk ? st.fwdPass / st.passOk : 0
      };
    }
  };
  makeCtl(World.aiSlots[0]);
  makeCtl(World.aiSlots[1]);
  NS.Aima = Aima;
})(window.RS6 = window.RS6 || {});
