/* checkoAI: a learning team (named after the owner's white rooster). On a team whose CPU level is checkoAI ("AIMA") one
 * network plays every outfield player, each through his own virtual controller: the same stick, sprint, buttons and
 * hold times as a human (the violet arrow shows the one with the ball, or nearest to it). The keeper is the game's.
 *
 * Brains: several networks, each with its own settings, stats and history (clone, rename, delete). One is active: it
 * plays in matches and is the one every other profile gets. Each team of a match may use a different brain (training:
 * brain v brain, or a brain v the CPU at any level).
 *
 * A brain is a small neural network (96 inputs: the play around him, his ratings, position and formation spot, the last seconds and the
 * whole match situation; 2 hidden layers;
 * heads for stick, sprint, button, power and a value). It learns (the trainer's profile only):
 *  - by copying: the Legend CPU in spells it plays for each player (fewer as he learns), every Legend player of the
 *    other team in a training against Legend, and the trainer's own play. Legend's passes and shots are rare moments,
 *    so they are kept in a memory of their own (with the decisions just before them, when the button would go down)
 *    and drawn more often than they happen
 *  - from rewards (actor-critic, n-step returns): goals, shots, passes, ball won / lost, fouls, and the trainer's claps
 * Store: the owner's Firebase project (REST): "aima/index" (the list, the active brain) and "aima/b_<id>" per brain;
 * recorded Legend play (named data sets to learn from without playing): "aimaData/index" and "aimaData/c_<set>_<n>".
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
  var F = 96;      // inputs (v1.20: 64 -> 90, v1.21: 91, v1.23: 96; an older brain gets the new ones with weights of 0, so it plays as before)
  var OLD_FS = [64, 90, 91];
  // brain sizes (hidden layers)
  var SIZES = { TINY: [32, 24], MEDIUM: [64, 48], LARGE: [256, 128], HUGE: [512, 256] }; // MEDIUM = the old SMALL (same layers)
  var LOCAL_SIZES = {};   // no model data in My PC's profile save: every brain lives in the cloud
  var NST = 9, NSP = 2, NBT = 13, NPW = 3;
  var O_ST = 0, O_SP = 9, O_BT = 11, O_PW = 24, O_V = 27, NOUT = 28;
  // per-brain options (index into these): decision speed, foresight, copied moves kept, weight of the trainer's play
  var TICKS = [0.08, 0.1, 0.15];
  var GAMMAS = [0.94, 0.97, 0.99];
  var MEMS = [20000, 50000, 100000];  // copied moves kept (20 players x 10 a second); passes / shots: a quarter more, apart
  var PRESS_SHARE = 0.08;   // of the copying steps, this share is a pass / shot / tackle of Legend (they are ~1% of his decisions)
  var PRE_PRESS = 0.25;     // Legend's decisions up to this long before his kick count as that press (a button goes down, then is held)
  var BATCH = 8;            // learning steps averaged into one change of the weights
  var IM_RATE = 150;        // copying steps per second of play (per team)
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
  // playing: his best choice, and now and then (this share of decisions) a choice drawn from his odds to try something
  // new. Drawing every choice (10 a second) made him turn and pass at random: a 5% press chance = a pass every 2 s.
  var EPS = [0.02, 0.06, 0.15];
  var CLAP_W = [0.6, 1.0, 1.6];
  var PUNISH = 3.0;         // a punishment: twice a clap's reward, negative
  var HELP = { AUTO: -1, H0: 0, H30: 0.3, H60: 0.6, H100: 1 };
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
      fwdPass: 0, tackles: 0, won: 0, lost: 0, fouls: 0, pressN: 0, pressSame: 0, pressOdds: 0, claps: 0, clapSum: 0, punish: 0, reward: 0, decisions: 0, modelDec: 0,
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
    this.data = {};   // per recorded data set it learnt from: { name, chunks (how many it had), passes (done over them), steps }
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
    this.stepOps = this.fwdOps + 4 * this.MAC + 3 * (H1 + H2) + Math.round(14 * this.NP / BATCH);
    this.TENS = [[this.OW1, H1 * F], [this.OB1, H1], [this.OW2, H2 * H1], [this.OB2, H2], [this.OW3, NOUT * H2], [this.OB3, NOUT]];
    this.P = new Float32Array(this.NP); this.G = new Float32Array(this.NP);
    this.AM = new Float32Array(this.NP); this.AV = new Float32Array(this.NP);
    this.h1 = new Float32Array(H1); this.h2 = new Float32Array(H2); this.dh1 = new Float32Array(H1); this.dh2 = new Float32Array(H2);
    this.adamT = 0; this.gN = 0; this.imAcc = 0;
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
    this.AM.fill(0); this.AV.fill(0); this.G.fill(0); this.adamT = 0; this.gN = 0;
  };
  Brain.prototype.learns = function () { return trainer && this.cfg.learn && !this.frozen; };
  Brain.prototype.help = function () {
    var h = HELP[this.cfg.help];
    if (h === undefined || h < 0) h = clamp(1 - this.st.decisions / 1500000, 0.35, 1); // (10 players decide)
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

  // gradients of the loss w.r.t. the outputs are in dout: backprop into G (added up); every BATCH samples one Adam step
  function backward(b, x) {
    var P = b.P, G = b.G, h1 = b.h1, h2 = b.h2, dh1 = b.dh1, dh2 = b.dh2, H1 = b.H1, H2 = b.H2;
    var i, j, o, d;
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
    b.gN++;
    if (b.gN >= BATCH) adamStep(b);
    b.dirty = true;
  }
  // the average gradient of the batch, clipped, one Adam step
  function adamStep(b) {
    var P = b.P, G = b.G, NP = b.NP, i;
    var inv = 1 / b.gN, n2 = 0;
    for (i = 0; i < NP; i++) n2 += G[i] * G[i];
    n2 *= inv * inv;
    var sc = (n2 > 25 ? 5 / Math.sqrt(n2) : 1) * inv;
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
      G[i] = 0;
    }
    b.gN = 0;
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
  // the best choice of prob[], or (with chance eps) one drawn from it
  function pick(n, eps) {
    if (eps >= 1 || Math.random() < eps) return sample(n);
    var bi = 0;
    for (var i = 1; i < n; i++) if (prob[i] > prob[bi]) bi = i;
    return bi;
  }
  var STAND = 0.3;   // he stands when his odds' average direction is shorter than this
  var DIRX = [0], DIRZ = [0];
  for (var di = 0; di < 8; di++) { DIRX.push(Math.cos(di * Math.PI / 4)); DIRZ.push(Math.sin(di * Math.PI / 4)); }
  var PRESS = 0.3;   // a button is pressed when its odds are above this (drawn from his odds when he tries something new)
  function pressPick(eps) {
    if (Math.random() < eps * 0.3) return sample(NBT);
    var bi = 1;
    for (var i = 2; i < NBT; i++) if (prob[i] > prob[bi]) bi = i;
    return prob[bi] > PRESS ? bi : 0;
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

  // 96 inputs, in the team's frame (x towards the goal it attacks). b: the brain (its "memory of the last seconds" option)
  function features(p, x, b) {
    var ball = World.ball, m = World.match, players = World.players;
    var HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H;
    var a = NS.attack(p.team);
    var px = p.pos.x * a, pz = p.pos.z;
    var o = ball.owner;
    var i, k, q, dx, dz;
    x[0] = px / HW; x[1] = pz / HH;
    // (not his own running: copying Legend, a brain learnt "keep running the way you run", and once stopped never moved again)
    x[2] = 0; x[3] = 0;
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
    // his team's end: +1 attacking towards the right of the screen, -1 towards the left (the ends swap at half time)
    x[90] = NS.attack(p.team);
    // his spot in the team's formation (the left back is not the right back) and the team's defensive line
    var hx = (p.homeX || 0) * a, hz = p.homeZ || 0;
    x[91] = hx / HW; x[92] = hz / HH;
    x[93] = clamp((hx - px) / 20, -2, 2); x[94] = clamp((hz - pz) / 20, -2, 2);
    var TM = NS.AI && NS.AI.teams && NS.AI.teams[p.team];
    x[95] = TM && TM.lineX !== undefined ? TM.lineX * a / HW : 0;
    // (74-76: above) the last seconds
    if (b && !b.cfg.past) { for (i = 77; i < 90; i++) x[i] = 0; return; }
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

  // Two memories: every copied decision, and (apart, kept longer) the presses: Legend's passes, shots and tackles. A
  // place in them is a code: i >= 0 the moves memory, -1 - i the presses memory.
  function memInit(b) {
    var MEM = MEMS[b.cfg.mem] || MEMS[1];
    if (b.memX && b.memCap === MEM) return;
    b.memCap = MEM; b.memN = 0; b.memI = 0;
    b.memX = new Float32Array(MEM * F); b.memA = new Int8Array(MEM * 5); b.memW = new Float32Array(MEM);
    var PM = MEM >> 2;
    b.pmCap = PM; b.pmN = 0; b.pmI = 0;
    b.pmX = new Float32Array(PM * F); b.pmA = new Int8Array(PM * 5); b.pmW = new Float32Array(PM);
  }
  function remember(b, x, stk, spr, btn, pw, ctx, w) {
    memInit(b);
    var press = btn > 0;
    var X = press ? b.pmX : b.memX, Ac = press ? b.pmA : b.memA, W = press ? b.pmW : b.memW;
    var at = press ? b.pmI : b.memI;
    var o = at * F;
    for (var j = 0; j < F; j++) X[o + j] = x[j];
    o = at * 5;
    Ac[o] = stk; Ac[o + 1] = spr; Ac[o + 2] = btn; Ac[o + 3] = pw; Ac[o + 4] = ctx;
    W[at] = w;
    if (press) { b.pmI = (at + 1) % b.pmCap; if (b.pmN < b.pmCap) b.pmN++; return -1 - at; }
    b.memI = (at + 1) % b.memCap;
    if (b.memN < b.memCap) b.memN++;
    return at;
  }
  // the weight of a kept decision (by its code), changed by f(w)
  function memWeight(b, code, f) {
    if (!b.memW) return;
    if (code >= 0) b.memW[code] = f(b.memW[code]);
    else b.pmW[-1 - code] = f(b.pmW[-1 - code]);
  }

  function imitateOne(b) {
    if (!b.memN && !b.pmN) return;
    var press = b.pmN > 0 && (!b.memN || Math.random() < PRESS_SHARE);
    var X = press ? b.pmX : b.memX, Ac = press ? b.pmA : b.memA;
    var i = Math.floor(Math.random() * (press ? b.pmN : b.memN));
    var o = i * F;
    for (var j = 0; j < F; j++) rx[j] = X[o + j];
    o = i * 5;
    var stk = Ac[o], spr = Ac[o + 1], btn = Ac[o + 2], pw = Ac[o + 3], ctx = Ac[o + 4];
    var w = press ? b.pmW[i] : b.memW[i];
    if (w <= 0) return;
    forward(b, rx);
    dout.fill(0);
    headGrad(O_ST, NST, null, stk, w, 0);
    headGrad(O_SP, NSP, null, spr, w * 0.5, 0);
    setMask(ctx);
    if (bmask[btn]) headGrad(O_BT, NBT, bmask, btn, w, 0);
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

  // a move made right now by Legend (a copying spell, or a Legend player watched): the situation at that very moment
  function copyMove(slot, p, mi, pw, w) {
    var b = slot.brain, c = slot.c;
    if (mi < 0) return;
    if (slot.rec) { recMove(slot, p, mi, pw); return; } // (a recording: kept in the data set, nobody learns now)
    var a = NS.attack(p.team);
    var ctx = B.MOVES[mi].ctx;
    features(p, xs, b);
    // would he press the same button here? (his odds of it, and his choice)
    forward(b, xs);
    setMask(ctx);
    softmax(O_BT, NBT, bmask, 1);
    var bi = 1;
    for (var k = 2; k < NBT; k++) if (prob[k] > prob[bi]) bi = k;
    b.st.pressN++; b.st.pressOdds += prob[mi + 1];
    if (bi === mi + 1 && prob[bi] > PRESS) b.st.pressSame++;
    if (!b.learns()) return;
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    var stk = sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a), spr = sp > 10.2 ? 1 : 0;
    // (kept with its time: a clap soon after makes this copied move count more)
    c.cp[c.cpi] = remember(b, xs, stk, spr, mi + 1, pw, ctx, w);
    c.cpt[c.cpi] = c.clock;
    c.cpi = (c.cpi + 1) % c.cp.length;
    // a pass / shot: his last decisions before it (when the button would go down) are that press too
    if (ctx !== 1 || !b.memX) return;
    for (k = 0; k < c.lm.length; k++) {
      var at = c.lm[k];
      if (at < 0 || c.clock - c.lmt[k] > PRE_PRESS || b.memA[at * 5 + 4] !== 1) continue;
      var o = at * F;
      for (var j = 0; j < F; j++) ux[j] = b.memX[o + j];
      remember(b, ux, b.memA[at * 5], b.memA[at * 5 + 1], mi + 1, pw, 1, w);
      b.memW[at] = 0; // (not "nothing" any more)
      c.lm[k] = -1;
    }
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
      t: 0, mode: 1, modeT: 0, cpu: true, stk: 0, ang: 0, spr: 0, btnMask: 0, holdLeft: 0, tBtn: 0,
      traj: new Float32Array(TRAJ * F), ta: new Int8Array(TRAJ * 4), tv: new Float32Array(TRAJ), tr: new Float32Array(TRAJ),
      tctx: new Int8Array(TRAJ), tn: 0, th: 0,
      ts: new Float64Array(TRAJ), tnote: new Int8Array(TRAJ),   // each decision's time, and "a move worth a clap" (a button, a ball won)
      clock: 0, grace: 0,                                       // his own clock (match time), the wait before a Legend spell drops his last decisions
      cp: new Int32Array(8), cpt: new Float64Array(8), cpi: 0,   // the last copied moves (where they are kept, when)
      lm: new Int32Array(3), lmt: new Float64Array(3), lmi: 0    // his last copied decisions (for the press just after)
    };
    slot.c.cpt.fill(-1e9);
    slot.c.lm.fill(-1);
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
  // a reward for player p's last decision (his own move), or (no p) for the whole team's: every player's last decision.
  // own: the result of his own move (in a Legend spell only those still reach his last decisions)
  function addReward(team, r, own, p) {
    var s = World.aiSlots[team];
    if (!s || !s.active || !s.brain) return;
    s.brain.st.reward += r;
    matchReward[team] += r;
    if (p) { var v = slotOf(p); if (v && !v.watch) rewardTo(v.c, r, own); return; }
    for (var i = 0; i < vlist.length; i++) if (vlist[i].team === team && !vlist[i].watch) rewardTo(vlist[i].c, r, own);
  }
  function rewardTo(c, r, own) { if (c.tn && (own || !c.cpu)) c.tr[(c.th + c.tn - 1) % TRAJ] += r; }

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
        memWeight(b, c.cp[k], function (w) { return r < 0 ? Math.max(0.02, w * (1 - 0.8 * strength)) : Math.min(4, w * (1 + strength)); });
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

  // the player a clap is for: the last one who made a move (a button, a ball won) just before it, else the featured one
  function clapSlot(t, t0) {
    var best = null, bt = -1e9;
    for (var i = 0; i < vlist.length; i++) {
      var v = vlist[i], c = v.c;
      if (v.team !== t || v.watch) continue;
      for (var k = 0; k < c.tn; k++) {
        var idx = (c.th + k) % TRAJ;
        if (c.tnote[idx] && c.ts[idx] <= t0 + 0.05 && c.ts[idx] >= t0 - CLAP_BACK && c.ts[idx] > bt) { bt = c.ts[idx]; best = v; }
      }
      for (k = 0; k < c.cp.length; k++) if (c.cpt[k] <= t0 + 0.05 && c.cpt[k] >= t0 - CLAP_BACK && c.cpt[k] > bt) { bt = c.cpt[k]; best = v; }
    }
    if (best) return best;
    var f = World.aiSlots[t].player;
    return f ? slotOf(f) : null;
  }

  // one decision of the brain: stick, sprint, maybe a button with its hold time
  function decide(slot, p) {
    var b = slot.brain, c = slot.c;
    features(p, xs, b);
    forward(b, xs);
    var temp = TEMP[b.cfg.explore] || 1;
    var eps = EPS[b.cfg.explore] || EPS[1];
    softmax(O_ST, NST, null, temp);
    // the stick: where his odds point on average (the single likeliest of the 9 is too often "stand": Legend's players
    // often walk to their spot, so "stand" can win while the 8 directions together say "go that way")
    var ex = 0, ez = 0, k;
    for (k = 1; k < NST; k++) { ex += prob[k] * DIRX[k]; ez += prob[k] * DIRZ[k]; }
    var stk;
    if (Math.random() < eps) { stk = sample(NST); c.ang = stk ? (stk - 1) * Math.PI / 4 : 0; }
    else if (ex * ex + ez * ez > STAND * STAND) {
      c.ang = Math.atan2(ez, ex);
      stk = 1 + ((Math.round(c.ang / (Math.PI / 4)) + 8) % 8);
    } else stk = 0;
    softmax(O_SP, NSP, null, temp);
    var spr = pick(NSP, eps);
    var btn = -1, pw = -1;
    var ctx = ctxOf(p);
    if (c.holdLeft <= 0) {
      setMask(ctx);
      softmax(O_BT, NBT, bmask, temp);
      // a button only when he is fairly sure of it (his best choice would nearly always be "nothing": buttons are rare)
      btn = pressPick(eps);
      if (btn > 0) {
        softmax(O_PW, NPW, null, temp);
        pw = pick(NPW, eps);
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
    var a = NS.attack(p.team);
    if (c.tBtn === 0) {
      features(p, xs, b);
      var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      var lab = sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, a);
      // how well he copies Legend: would his own first choice of direction be the same? (a running average)
      forward(b, xs);
      var best = 0;
      for (var k = 1; k < NST; k++) if (out[O_ST + k] > out[O_ST + best]) best = k;
      b.st.agree = (b.st.agree || 0) * 0.998 + (best === lab ? 0.002 : 0);
      b.st.agreeN = (b.st.agreeN || 0) + 1;
      if (b.learns()) {
        c.lm[c.lmi] = remember(b, xs, lab, sp > 10.2 ? 1 : 0, 0, -1, ctxOf(p), 0.6);
        c.lmt[c.lmi] = c.clock;
        c.lmi = (c.lmi + 1) % c.lm.length;
      }
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

  // a player's controller this match (a checkoAI team's outfield player, or a Legend player watched in a training)
  function slotOf(p) { var v = p.aiv; return v && v.gen === matchGen && (v.brain || v.rec) ? v : null; }
  function aiOf(p) { var s = slotOf(p); return !!s && !s.watch && !s.c.cpu; }
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
      addReward(p.team, 0.15 * sc.brain.styleW(1), false, p);
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
        if (pendShot && pendShot.team === t && b) { b.st.goals++; b.st.onTarget++; addReward(t, 0.5 * b.styleW(0), true, pendShot); pendShot = null; }
      }
      if (tackleT[t] > 0) tackleT[t] -= dt;
    }
    if (pendShot) {
      pendShotT -= dt;
      b = brainOfTeam(pendShot.team);
      if (b && !pendShotOn && (ball.gkTried & (1 << (1 - pendShot.team)))) { pendShotOn = true; b.st.onTarget++; addReward(pendShot.team, 0.1, true, pendShot); }
      if (pendShotT <= 0) pendShot = null;
    }
    if (o && o !== lastOwner) {
      if (lastOwner) {
        var lt = lastOwner.team, a = NS.attack(lt);
        b = brainOfTeam(lt);
        if (lastOwnerAi && b) {
          if (o.team !== lt) { b.st.lost++; addReward(lt, -0.25 * b.styleW(5), false, lastOwner); }
          else if (modelPass) {
            b.st.passOk++;
            var gain = (o.pos.x - lastOwner.pos.x) * a;
            addReward(lt, 0.08 * b.styleW(2) + (gain > 5 ? 0.12 * b.styleW(3) : 0), true, lastOwner);
            if (gain > 5) b.st.fwdPass++;
          }
        }
        var bo = brainOfTeam(o.team);
        if (bo && aiOf(o) && o.team !== lt) { bo.st.won++; addReward(o.team, 0.25 * bo.styleW(4), false, o); markNote(slotOf(o)); }
      }
      lastOwner = o;
      lastOwnerAi = aiOf(o);
    }
    if (o && aiOf(o)) {
      b = brainOfTeam(o.team);
      b.st.carryT += dt;
      addReward(o.team, 0.004 * b.styleW(6) * o.vel.x * NS.attack(o.team) * dt, false, o);
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

  var thought = 'watch', thoughtT = 0, happyT = 0, sorryT = 0;
  function think(slot, p, btn, stk, spr) {
    // the status box follows the trainer's opponent (or team 1 when the CPU plays both): its featured player
    if (slot.team !== showTeam() || slot.watch || World.aiSlots[slot.team].player !== p) return;
    var m = World.match, o = World.ball.owner;
    var key;
    var frac = m.timeSeconds / 5400, my = m.score[p.team], th = m.score[1 - p.team];
    if (sorryT > 0) key = 'sorry';
    else if (happyT > 0) key = 'happy';
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
    if (key !== thought && (thoughtT <= 0 || key === 'shoot' || key === 'happy' || key === 'sorry')) { thought = key; thoughtT = 0.6; }
  }
  function showTeam() { return World.aiSlots[1].active ? 1 : 0; }

  function anyAi() { return World.aiSlots[0].active || World.aiSlots[1].active; }

  /* ------------------------------------------------------------------ brains: the list, loading, saving */

  var index = { brains: [], active: '' };   // [{ id, name, size, matches, updated, parent }]
  var loaded = {};                          // id -> Brain (with its weights)
  var active = null;                        // the brain that plays (and that everybody else gets)
  var teamBrains = [null, null];            // training / debug matches: the brain of each team (null = the active one)
  var debugBrains = null;                   // debug matches: [home, away] brains picked in the Debug screen
  var trainer = false, profile = { id: '', name: '' };

  // ---- one controller per outfield player of a checkoAI team (and per Legend player watched in a training), made
  // when the match starts (matchGen tells this match's from an older one)
  var vlist = [], matchGen = 0, teamClock = [0, 0];
  function vslotOf(p, b) {
    var v = p.aiv;
    if (!v || v.gen !== matchGen) {
      v = p.aiv = {
        idx: -1, active: true, team: p.team, player: p, ai: true, gen: matchGen, watch: false, brain: null,
        chargeMove: -1, chargeFrac: -1, pressing: false, teamPress: false, evPlayer: null, burstT: 0, lockT: 0,
        sprPrev: false, sprTaps: 0, sprTapT: 9, knockT: 0,
        evActive: false, evMask: 0, evT: 0, evSettle: 0, evCtx: 0, evMove: -1, evPrev: 0,
        gkLeft: 0, manual: false, manualOwner: null, shCd: 0
      };
      makeCtl(v);
      v.c.t = Math.random() * 0.1; // (the players' decisions are spread over the ticks)
      vlist.push(v);
    }
    v.brain = b;
    return v;
  }
  // a training against the Legend CPU: Legend's players on the other team are watched and copied too
  function watched(t) {
    var S = training;
    return !!S && !S.ob && S.cfg.opp === 'LEGEND' && !World.aiSlots[t].active && World.aiSlots[1 - t].active && S.b.learns();
  }
  // one player of a checkoAI team, this step: true = the brain plays him (Controls.update reads v.pad); false = the
  // Legend CPU does (a copying spell, a penalty he takes)
  function driveOne(v, p, b, help, dt) {
    var c = v.c, pad = v.pad, m = World.match;
    c.clock = teamClock[v.team];
    c.modeT -= dt;
    if (c.modeT <= 0) {
      c.modeT = 1.5 + Math.random();
      var newMode = Math.random() < help ? 0 : 1;
      if (newMode !== c.mode) {
        // to a Legend spell: his last decisions wait CLAP_KEEP s (a clap may still come); back to him: learnt now
        if (newMode === 1) flush(v); else c.grace = CLAP_KEEP;
        c.holdLeft = 0; pad.cur = 0;
      }
      c.mode = newMode;
    }
    c.cpu = c.mode === 0 || (m.penalty && World.ball.owner === p);
    c.t -= dt;
    if (c.t <= 0) {
      var TICK = TICKS[b.cfg.tick] || TICKS[1];
      c.t += TICK;
      if (c.t <= 0) c.t = TICK;
      b.st.decisions++;
      b.st.xSum += p.pos.x * NS.attack(p.team) / NS.PITCH_HALF_W; b.st.xN++;
      if (!c.cpu) decide(v, p);
      else copyCpu(v, p);
    }
    if (c.cpu) {
      if (c.tn) { c.grace -= dt; if (c.grace <= 0) flush(v); }
      pad.cur = 0; pad.x = 0; pad.y = 0; c.holdLeft = 0;
      return false;
    }
    var a2 = NS.attack(p.team);
    if (c.stk) {
      var ang = c.ang;
      pad.x = Math.cos(ang) * a2; pad.y = Math.sin(ang);
      // never runs himself off the pitch (the lines are walls for his stick)
      var HW = NS.PITCH_HALF_W - 1.2, HH = NS.PITCH_HALF_H - 1.2;
      if ((p.pos.x > HW && pad.x > 0) || (p.pos.x < -HW && pad.x < 0)) pad.x = 0;
      if ((p.pos.z > HH && pad.y > 0) || (p.pos.z < -HH && pad.y < 0)) pad.y = 0;
    } else { pad.x = 0; pad.y = 0; }
    if (c.spr) b.st.sprintT += dt / 10;
    var cur = c.spr ? B.sprintMask() : 0;
    if (c.holdLeft > 0) { c.holdLeft -= dt; if (c.holdLeft > 0) cur |= c.btnMask; }
    pad.cur = cur;
    return true;
  }
  // copying steps: IM_RATE a second of play, from the memories
  function imitate(b, dt) {
    if (!b.learns() || (!b.memN && !b.pmN)) return;
    b.imAcc += dt * IM_RATE;
    while (b.imAcc >= 1) { b.imAcc -= 1; imitateOne(b); }
  }
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
  // (a brain saved with fewer inputs, OLD_FS: its first layer gets the new inputs with weights of 0 = it plays the same)
  function unpackWeights(b, obj) {
    if (!obj || !obj.dims || obj.dims[3] !== NOUT) return false;
    var f0 = obj.dims[0];
    if (f0 !== F && OLD_FS.indexOf(f0) < 0) return false;
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
      cfg: b.cfg, st: b.st, hist: b.hist, data: b.data, m: packWeights(b) };
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
    b.data = d.data || {};
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
  // (also a copy in this device's own storage: it restores the profile's value if that ever comes back empty)
  function saveAuth() {
    if (auth && auth.anon) return;
    try { MyPC.save('aimaAuth', auth); } catch (e) {}
    try { if (auth) localStorage.setItem('rs6_aimaAuth', JSON.stringify(auth)); else localStorage.removeItem('rs6_aimaAuth'); } catch (e) {}
  }
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

  var clapDown = 0, clapOn = false, clapSign = 1, clapAt = [0, 0]; // (clapAt: each slot's clock when the button went down)

  // the trainer's clap (sign 1) or punishment (sign -1): held = stronger; credited to what he did just before the press
  function coach(down, sign) {
    if (!trainer || !World.match.running || World.match.paused || !anyAi()) { clapOn = false; return; }
    if (down) {
      if (!clapOn) { clapOn = true; clapSign = sign; clapDown = performance.now(); clapAt[0] = teamClock[0]; clapAt[1] = teamClock[1]; }
      return;
    }
    if (!clapOn || clapSign !== sign) return;
    clapOn = false;
    var held = (performance.now() - clapDown) / 1000;
    var strength = 0.25 + 0.75 * Math.min(1, held / CLAP_FULL); // a tap ~25%, a full hold 100%
    for (var t = 0; t < 2; t++) {
      var s = World.aiSlots[t];
      if (!s.active || !s.brain) continue;
      var w = CLAP_W[s.brain.cfg.clap] || 1;
      var v = clapSlot(t, clapAt[t]);
      if (!v) continue;
      clapCredit(v, clapAt[t], sign > 0 ? 1.5 * strength * w : -PUNISH * strength * w, strength);
      if (sign > 0) { s.brain.st.claps++; s.brain.st.clapSum += strength; } else s.brain.st.punish++;
    }
    if (sign > 0) { happyT = 1.5 + strength; sorryT = 0; thought = 'happy'; }
    else { sorryT = 1.5 + strength; happyT = 0; thought = 'sorry'; }
    thoughtT = 1;
    if (NS.HUD.clap) NS.HUD.clap(strength, sign < 0);
    if (sign > 0) { if (NS.Audio.applause) NS.Audio.applause(strength); }
    else if (NS.Audio.whistle) NS.Audio.whistle(0);
  }

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
    if (training || recording || !NS.Debug || NS.Debug.running()) return;
    // (a recording of Legend v Legend takes every other turn when one is running)
    recTurn = !recTurn;
    if (recTurn && pumpRec()) return;
    var n = sessions.length, S = null;
    for (var i = 0; i < n; i++) {
      var c = sessions[(rr + i) % n];
      if (c.state === 'running') { S = c; rr = (rr + i + 1) % n; break; }
    }
    if (!S) { if (!recTurn) pumpRec(); return; }
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
      else if ((S.cfg.matches > 0 && S.done >= S.cfg.matches) || (S.cfg.hours > 0 && Date.now() - S.started >= S.cfg.hours * 3600000)) {
        S.state = 'done'; // its number of matches played, or its time limit reached
        if (NS.Audio.chime) NS.Audio.chime();
      }
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
    var playExp = 10 * own * b.fwdOps / tick;    // 10 outfield players
    var learnExp = (10 * own / tick + IM_RATE) * b.stepOps; // a reward step per own decision, IM_RATE copied ones a second
    var memBytes = b.NP * 4 * 5 + Math.round((b.memX ? b.memCap : (MEMS[b.cfg.mem] || MEMS[1])) * 1.25 * (F * 4 + 9));
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
    if (d.pressN) L.push(T('aima.k.presssame') + ': ' + pct(d.pressSame, d.pressN) + '   ' + T('aima.k.pressodds') + ' ' +
      Math.round(d.pressOdds * 100 / d.pressN) + '%   (' + d.pressN + ')');
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

  /* ------------------------------------------------------------------ recorded data: Legend v Legend, kept, learnt from */

  // A data set (a name of its own): Legend's play recorded at full speed, Legend v Legend, every outfield player of both
  // teams at 10 decisions a second, each decision as a brain sees it (its F inputs) with what Legend did (stick, sprint,
  // button, power, ball at his feet) and how the next 10 seconds went for his team (goals for / against). Legend's
  // passes / shots / tackles are all kept (and his decisions in the PRE_PRESS seconds before a kick become that press);
  // of his other decisions without the ball one in KEEP_MOVE. Kept in the cloud apart from the brains, collection
  // "aimaData": "index" (the sets) and "c_<set>_<n>" (chunks of up to CHUNK decisions, 8 bits a number).
  // Learning from a set ("Learn from data") needs no match: many passes over it, the presses drawn PRESS_SHARE of the
  // time, the decisions he already gets right (sure of Legend's stick and button) skipped; a twentieth of the set is
  // never learnt from and gives the score.
  var DQ = 40;              // an input x DQ -> int8 (-3.2 .. 3.2)
  var DA = 6;               // labels: stick, sprint, button (0 none), power (-1 none), ctx, the next 10 s x 100
  var CHUNK = 5000;         // decisions per cloud document (~700 KB)
  var KEEP_MOVE = 3;
  var RET_T = 10;
  var SURE = 0.9;           // skipped when his odds of Legend's stick and button are both above this
  var dataIndex = { sets: [] }, dataState = 'off';   // the list of sets ('off' | 'loading' | 'ok' | 'error ...')
  var dsets = {};           // set id -> [chunk: { x: Int8Array, a: Int8Array, n }] (in memory, from the recording or the cloud)
  var jobs = [], jobSeq = 0, recTurn = false;
  var recording = null;     // the record job whose match is being played
  var rb = null;            // this match's recording: { x, a, t (time), tm (team), n, cap, goals: [[t, team]] }
  var recT = 0;

  function dataUrl(id) {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cloud.projectId) +
      '/databases/(default)/documents/aimaData/' + id + '?key=' + encodeURIComponent(cloud.apiKey);
  }
  function dataGet(id) {
    if (!cloud) return Promise.reject(new Error('no cloud'));
    return token().then(function (t) { return fetch(dataUrl(id), { headers: { Authorization: 'Bearer ' + t } }); }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) { return d && d.fields && d.fields.data ? JSON.parse(d.fields.data.stringValue) : null; });
  }
  // writes run one after another (chunks, then the index): a promise of the answer
  var dataQ = Promise.resolve();
  function dataPut(id, obj) {
    var body = JSON.stringify({ fields: { data: { stringValue: JSON.stringify(obj) }, updated: { integerValue: String(Date.now()) } } });
    var p = dataQ.then(function () {
      if (!canWrite()) throw new Error('not signed in');
      return token().then(function (t) {
        return fetch(dataUrl(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body });
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 403 ? ' (Firestore rules: aimaData)' : '')); });
    });
    dataQ = p.catch(function () {});
    return p;
  }
  function dataDel(id) {
    dataQ = dataQ.then(function () {
      if (!canWrite()) return null;
      return token().then(function (t) { return fetch(dataUrl(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } }); });
    }).catch(function () {});
  }
  function findSet(id) { for (var i = 0; i < dataIndex.sets.length; i++) if (dataIndex.sets[i].id === id) return dataIndex.sets[i]; return null; }
  function saveDataIndex() {
    var sets = dataIndex.sets.map(function (x) { var c = {}; for (var k in x) if (k !== 'local') c[k] = x[k]; return c; }); // ("local" is only this session's note)
    return dataPut('index', { v: 1, sets: sets, updated: Date.now() });
  }
  function loadDataIndex() {
    cloud = cloud || cloudCfg();
    if (!cloud) { dataState = 'off'; return Promise.resolve(); }
    dataState = 'loading';
    return dataGet('index').then(function (ix) {
      // (sets recorded here and not saved yet stay in the list)
      var local = dataIndex.sets.filter(function (s) { return s.local; });
      dataIndex.sets = (ix && ix.sets ? ix.sets : []).concat(local.filter(function (s) { return !(ix && ix.sets || []).some(function (c) { return c.id === s.id; }); }));
      dataState = 'ok';
      jobNotify(null);
    }, function (e) { dataState = 'error ' + (e && e.message ? e.message : 'network'); jobNotify(null); });
  }

  // ---- recording (one match of a record job)
  function rbGrow(need) {
    if (rb.n + need <= rb.cap) return;
    var cap = Math.max(rb.cap * 2, rb.n + need);
    var x = new Int8Array(cap * F); x.set(rb.x); rb.x = x;
    var a = new Int8Array(cap * DA); a.set(rb.a); rb.a = a;
    var t = new Float32Array(cap); t.set(rb.t); rb.t = t;
    var tm = new Int8Array(cap); tm.set(rb.tm); rb.tm = tm;
    rb.cap = cap;
  }
  function recAdd(x, stk, spr, btn, pw, ctx, team) {
    rbGrow(1);
    var i = rb.n++, o = i * F;
    for (var j = 0; j < F; j++) { var q = Math.round(x[j] * DQ); rb.x[o + j] = q > 127 ? 127 : (q < -127 ? -127 : q); }
    o = i * DA;
    rb.a[o] = stk; rb.a[o + 1] = spr; rb.a[o + 2] = btn; rb.a[o + 3] = pw; rb.a[o + 4] = ctx; rb.a[o + 5] = 0;
    rb.t[i] = recT; rb.tm[i] = team;
    return i;
  }
  var ML = [0, 0];   // a Legend player's stick class and sprint, from how he runs
  function moveLabel(p) {
    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    ML[0] = sp < 1.5 ? 0 : stickClass(p.vel.x, p.vel.z, NS.attack(p.team));
    ML[1] = sp > 10.2 ? 1 : 0;
  }
  // a decision of a Legend player (every 0.1 s, as copyCpu)
  function recTick(v, p) {
    var c = v.c;
    if (c.tBtn) { c.tBtn = 0; return; } // (this tick's move was recorded as it happened)
    var ctx = ctxOf(p);
    if (ctx !== 1 && (++c.recK % KEEP_MOVE) !== 0) return;
    features(p, xs, null);
    moveLabel(p);
    c.lm[c.lmi] = recAdd(xs, ML[0], ML[1], 0, -1, ctx, p.team);
    c.lmt[c.lmi] = c.clock;
    c.lmi = (c.lmi + 1) % c.lm.length;
  }
  // a pass / shot / tackle / press of a Legend player, as it happens (from the hooks, through copyMove)
  function recMove(v, p, mi, pw) {
    var c = v.c, ctx = B.MOVES[mi].ctx;
    features(p, xs, null);
    moveLabel(p);
    recAdd(xs, ML[0], ML[1], mi + 1, pw, ctx, p.team);
    if (ctx !== 1) return;
    for (var k = 0; k < c.lm.length; k++) {
      var at = c.lm[k];
      if (at < 0 || c.clock - c.lmt[k] > PRE_PRESS || rb.a[at * DA + 4] !== 1) continue;
      rb.a[at * DA + 2] = mi + 1; rb.a[at * DA + 3] = pw; // (his decision just before: when the button would go down)
      c.lm[k] = -1;
    }
  }
  function recTeam(t, dt) {
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.team !== t || p.role === 'GK') continue;
      var v = vslotOf(p, null);
      if (!v.rec) { v.rec = true; v.watch = true; v.c.recK = Math.floor(Math.random() * KEEP_MOVE); }
      v.c.cpu = true; v.c.clock = recT;
      v.c.t -= dt;
      if (v.c.t <= 0) { v.c.t += 0.1; if (v.c.t <= 0) v.c.t = 0.1; recTick(v, p); }
    }
  }
  // the match is over: its outcome labels, its chunks into the set (memory, and the cloud when the trainer is signed in)
  function recMatchEnd(R, finished) {
    var r = rb;
    rb = null;
    if (!finished || !r || !r.n) return;
    var i, k, g;
    for (i = 0; i < r.n; i++) {
      var s = 0;
      for (k = 0; k < r.goals.length; k++) {
        g = r.goals[k];
        if (g[0] > r.t[i] && g[0] <= r.t[i] + RET_T) s += g[1] === r.tm[i] ? 1 : -1;
      }
      r.a[i * DA + 5] = Math.max(-1, Math.min(1, s)) * 100;
    }
    var meta = findSet(R.set);
    var list = dsets[R.set] || (dsets[R.set] = []);
    var presses = 0;
    for (i = 0; i < r.n; i++) if (r.a[i * DA + 2] > 0) presses++;
    for (var o = 0; o < r.n; o += CHUNK) {
      var n = Math.min(CHUNK, r.n - o);
      var ch = { x: r.x.slice(o * F, (o + n) * F), a: r.a.slice(o * DA, (o + n) * DA), n: n };
      var idx = meta.chunks++;
      list[idx] = ch;
      R.pending++;
      upChunk(R, meta, idx, ch, 0);
    }
    meta.matches++; meta.samples += r.n; meta.presses += presses; meta.updated = Date.now();
    R.samples += r.n; R.presses += presses;
    if (canWrite()) saveDataIndex().catch(function () {});
  }
  // a chunk to the cloud: tried again (the rules may take a minute to apply, the network may drop) before it is given up;
  // a chunk given up stays in memory (dmiss) and "Resend" tries it again. R: the record job (or null when resending)
  var dmiss = {}, upBusy = 0, UP_TRIES = [0, 8000, 20000, 45000];
  function missOf(id) { return Object.keys(dmiss[id] || {}).length; }
  function upChunk(R, meta, idx, ch, tryN) {
    tryN = tryN || 0;
    if (!tryN) upBusy++;
    function fin(ok, err) {
      if (ok) { if (dmiss[meta.id]) delete dmiss[meta.id][idx]; if (R) R.uploaded++; }
      else if (tryN + 1 < UP_TRIES.length && canWrite()) {
        if (R) R.upErr = err;
        setTimeout(function () { upChunk(R, meta, idx, ch, tryN + 1); }, UP_TRIES[tryN + 1]);
        jobNotify(R);
        return;
      } else { (dmiss[meta.id] || (dmiss[meta.id] = {}))[idx] = 1; if (R) R.upErr = err; }
      if (R) R.pending--;
      meta.local = missOf(meta.id) > 0;
      if (--upBusy <= 0 && canWrite()) saveDataIndex().catch(function () {}); // (the index last: the sets as they are now)
      jobNotify(R);
    }
    if (!canWrite()) { fin(false, NS.I18n.t('aima.d.local')); return; }
    dataPut('c_' + meta.id + '_' + idx, { v: 1, set: meta.id, n: idx, count: ch.n, F: F, DA: DA, q: DQ, x: b64(new Uint8Array(ch.x.buffer)),
      a: b64(new Uint8Array(ch.a.buffer)) }).then(function () { fin(true); }, function (e) { fin(false, e && e.message ? e.message : 'network'); });
  }
  // the chunks of a set that are still only in memory: sent again (only while this session still holds them)
  function resendSet(id) {
    var meta = findSet(id), n = 0;
    if (!meta || !dmiss[id] || !canWrite()) return 0;
    Object.keys(dmiss[id]).forEach(function (k) {
      var ch = dsets[id] && dsets[id][+k];
      if (!ch) { delete dmiss[id][k]; return; }
      n++;
      upChunk(null, meta, +k, ch, 0);
    });
    return n;
  }

  function pumpRec() {
    var R = null;
    for (var i = 0; i < jobs.length; i++) if (jobs[i].kind === 'rec' && jobs[i].state === 'running') { R = jobs[i]; break; }
    if (!R) return false;
    recording = R;
    R.mins = 0;
    var c = R.cfg;
    NS.Debug.start({ matches: 1, levels: ['LEGEND', 'LEGEND'], teams: 'RANDOM', teamSize: c.teamSize, stadium: c.stadium, duration: c.duration },
      function (done, total, mins) { R.mins = mins; jobNotify(R); },
      function () {
        recording = null;
        if (R.curDone) R.done++;
        R.curDone = false;
        if (R.stopReq) R.state = 'stopped';
        else if ((c.matches > 0 && R.done >= c.matches) || (c.hours > 0 && Date.now() - R.started >= c.hours * 3600000)) {
          R.state = 'done';
          if (NS.Audio.chime) NS.Audio.chime();
        }
        if (R.state !== 'running') R.ended = Date.now();
        jobNotify(R);
        NS.Debug.later(pump, 30);
      });
    return true;
  }

  // ---- learning from data
  function loadSet(J, id) {
    var meta = findSet(id), list = dsets[id] || (dsets[id] = []);
    var i = 0;
    function next() {
      while (i < meta.chunks && list[i]) i++;
      if (i >= meta.chunks || J.stopReq) return Promise.resolve();
      var at = i++;
      J.loadMsg = (at + 1) + ' / ' + meta.chunks;
      jobNotify(J);
      return dataGet('c_' + id + '_' + at).then(function (d) {
        if (d && d.F === F) list[at] = { x: new Int8Array(unb64(d.x).buffer), a: new Int8Array(unb64(d.a).buffer), n: d.count };
        else J.skipped = (J.skipped || 0) + 1; // missing, or recorded with other inputs
        return next();
      });
    }
    return next();
  }
  // one decision of the data: dequantized into rx, its labels into lab
  var lab = new Int8Array(DA);
  function sampleOf(ch, i) {
    var o = i * F;
    for (var j = 0; j < F; j++) rx[j] = ch.x[o + j] / DQ;
    o = i * DA;
    for (j = 0; j < DA; j++) lab[j] = ch.a[o + j];
  }
  // a learning step on rx / lab; false = skipped (he already does what Legend did, and is sure of it)
  function dataStep(b) {
    forward(b, rx);
    var stk = lab[0], btn = lab[2], ctx = lab[4];
    setMask(ctx);
    var bOk = !bmask[btn];
    if (!bOk) { softmax(O_BT, NBT, bmask, 1); bOk = prob[btn] > SURE; }
    if (bOk && btn === 0) { softmax(O_ST, NST, null, 1); if (prob[stk] > SURE) return false; }
    dout.fill(0);
    headGrad(O_ST, NST, null, stk, 1, 0);
    headGrad(O_SP, NSP, null, lab[1], 0.5, 0);
    setMask(ctx);
    if (bmask[btn]) headGrad(O_BT, NBT, bmask, btn, 1, 0);
    if (btn && lab[3] >= 0) headGrad(O_PW, NPW, null, lab[3], 1, 0);
    dout[O_V] = (out[O_V] - lab[5] / 100) * 0.25;
    backward(b, rx);
    b.st.im++;
    b.st.opsL += b.stepOps;
    return true;
  }
  // the score on the decisions never learnt from: his stick (as he plays it) = Legend's, the same button at Legend's
  // presses (and his odds of it), and presses where Legend pressed nothing (ball at his feet)
  function validate(J, b) {
    var v = { n: 0, dir: 0, pn: 0, same: 0, odds: 0, cn: 0, extra: 0 };
    var V = J.val, step = Math.max(1, Math.floor(V.length / 4000));
    for (var k = 0; k < V.length; k += step) {
      sampleOf(J.ch[V[k] >> 16], V[k] & 0xffff);
      forward(b, rx);
      softmax(O_ST, NST, null, 1);
      var ex = 0, ez = 0;
      for (var d = 1; d < NST; d++) { ex += prob[d] * DIRX[d]; ez += prob[d] * DIRZ[d]; }
      var mine = ex * ex + ez * ez > STAND * STAND ? 1 + ((Math.round(Math.atan2(ez, ex) / (Math.PI / 4)) + 8) % 8) : 0;
      v.n++; if (mine === lab[0]) v.dir++;
      setMask(lab[4]);
      softmax(O_BT, NBT, bmask, 1);
      var bi = 1;
      for (d = 2; d < NBT; d++) if (prob[d] > prob[bi]) bi = d;
      var press = bmask[bi] && prob[bi] > PRESS ? bi : 0;
      if (lab[2] > 0) { v.pn++; v.odds += prob[lab[2]]; if (press === lab[2]) v.same++; }
      else if (lab[4] === 1) { v.cn++; if (press) v.extra++; }
    }
    J.score = v;
    J.scores.push([J.steps, v.n ? v.dir / v.n : 0, v.pn ? v.same / v.pn : 0]);
  }
  // what the brain has learnt from the set so far: kept in the brain, so the next run goes on from here
  function noteData(J, b) {
    var id = J.cfg.sets[0], meta = findSet(id), size = J.move.length + J.press.length;
    if (!meta || !size) return;
    var d = b.data[id] || (b.data[id] = { name: meta.name, chunks: 0, passes: 0, steps: 0 });
    d.name = meta.name;
    d.passes = Math.round((d.passes + J.steps / size) * 100) / 100;  // (new data caught up to the old, so one average)
    d.chunks = J.chunksSeen; d.steps += J.steps; d.when = Date.now();
  }
  function learnSlice(J) {
    if (J.state !== 'running') return;
    var b = J.b, t0 = performance.now(), PS = J.press.length, MS = J.move.length;
    while (performance.now() - t0 < 25) {
      for (var k = 0; k < 64; k++) {
        // data this brain has not seen yet (or seen fewer times) is drawn in proportion to what it still owes
        var nw = J.remNew > 0 && Math.random() * (J.remNew + J.remOld) < J.remNew;
        var pl = nw && J.npress.length ? J.npress : J.press, ml = nw && J.nmove.length ? J.nmove : J.move;
        var PL = pl.length, ML2 = ml.length;
        if (nw) J.remNew--; else J.remOld--;
        var ref = PL && (!ML2 || Math.random() < PRESS_SHARE) ? pl[Math.floor(Math.random() * PL)] : ml[Math.floor(Math.random() * ML2)];
        sampleOf(J.ch[ref >> 16], ref & 0xffff);
        if (dataStep(b)) J.learnt++;
        J.steps++;
      }
      if (J.steps >= J.total) break;
    }
    if (J.steps - J.lastVal >= 50000 || J.steps >= J.total) { J.lastVal = J.steps; validate(J, b); }
    if (performance.now() - J.lastSave > 120000) { J.lastSave = performance.now(); saveBrain(b); }
    var timeUp = J.cfg.hours > 0 && Date.now() - J.started >= J.cfg.hours * 3600000;
    if (J.stopReq || J.steps >= J.total || timeUp) {
      if (b.gN) adamStep(b);
      J.state = J.stopReq ? 'stopped' : 'done';
      J.ended = Date.now();
      var sc = J.score || {};
      noteData(J, b);
      b.log('data', { set: J.setName, steps: J.steps, dir: sc.n ? Math.round(sc.dir * 100 / sc.n) : 0, same: sc.pn ? Math.round(sc.same * 100 / sc.pn) : 0 });
      saveBrain(b);
      if (J.state === 'done' && NS.Audio.chime) NS.Audio.chime();
      jobNotify(J);
      return;
    }
    jobNotify(J);
    NS.Debug.later(function () { learnSlice(J); }, 0);
  }
  function startLearn(J) {
    var ids = J.cfg.sets, i;
    var p = Promise.resolve();
    ids.forEach(function (id) { p = p.then(function () { return loadSet(J, id); }); });
    return Promise.all([getBrain(J.cfg.brain), p]).then(function (r) {
      var b = J.b = r[0];
      b.frozen = false;
      if (!b.learns()) throw new Error(NS.I18n.t('aima.d.nolearn'));
      // every decision of the sets: (chunk << 16) | index; one in 20 for the score only
      J.ch = []; J.press = []; J.move = []; J.val = []; J.nmove = []; J.npress = [];
      var g = 0, prev = b.data[ids[0]] || null, nOld = 0, nNew = 0;
      J.prev = prev ? prev.passes : 0;
      J.chunksSeen = (findSet(ids[0]) || {}).chunks || 0;
      ids.forEach(function (id) {
        var list = dsets[id] || [];
        for (var c = 0; c < list.length; c++) {
          if (!list[c]) continue;
          var ci = J.ch.length, ch = list[c];
          J.ch.push(ch);
          for (i = 0; i < ch.n; i++, g++) {
            var ref = (ci << 16) | i;
            var fresh = !prev || c >= prev.chunks;  // (a chunk the brain has not learnt from yet)
            if (g % 20 === 0) J.val.push(ref);
            else {
              if (fresh) nNew++; else nOld++;
              if (ch.a[i * DA + 2] > 0) { J.press.push(ref); if (fresh) J.npress.push(ref); }
              else { J.move.push(ref); if (fresh) J.nmove.push(ref); }
            }
          }
        }
      });
      if (!J.move.length && !J.press.length) throw new Error(NS.I18n.t('aima.d.empty'));
      // old data: the passes asked for; new data: those too, plus the ones the old data already had (it catches up)
      J.newN = nNew;
      J.remOld = J.cfg.passes * nOld; J.remNew = (J.cfg.passes + J.prev) * nNew;
      J.total = J.remOld + J.remNew;
      J.state = 'running';
      J.loadMsg = '';
      validate(J, b);
      J.score0 = J.score;
      jobNotify(J);
      learnSlice(J);
    }).catch(function (e) { J.state = 'error'; J.error = e && e.message ? e.message : String(e); jobNotify(J); });
  }

  function jobNotify(J) { if (Aima.onData) Aima.onData(J); }
  function pctOf(a, n) { return n ? Math.round(a * 100 / n) + '%' : '-'; }
  function jobText(J) {
    var T = NS.I18n.t, L = [], s;
    if (J.kind === 'rec') {
      L.push(T('aima.d.rec') + ' "' + J.setName + '"  (' + J.done + ' / ' + (J.cfg.matches || '∞') + ' ' + T('aima.tr.matches') + ', ' +
        J.cfg.teamSize + ' ' + T('aima.tr.aside') + ', ' + J.cfg.stadium + ', ' + J.cfg.duration + ' min)  ' + T('aima.ss.' + J.state));
      L.push(T('aima.d.samples') + ': ' + J.samples + '   ' + T('aima.d.presses') + ': ' + J.presses + '   ' + T('aima.d.saved') + ': ' + J.uploaded +
        (J.pending ? '  (' + J.pending + ' ' + T('aima.d.sending') + ')' : '') + (missOf(J.set) ? '   ' + T('aima.d.unsaved') + ': ' + missOf(J.set) : ''));
    } else {
      L.push(T('aima.d.learn') + ': ' + (J.b ? J.b.name : '?') + '  <-  "' + J.setName + '"  (' + J.cfg.passes + ' ' + T('aima.d.passes') + ')  ' + T('aima.ss.' + J.state));
      if (J.loadMsg) L.push(T('aima.d.loading') + ' ' + J.loadMsg);
      if (J.total && (J.prev || J.newN)) L.push(T('aima.d.cont') + ': ' + J.prev + ' ' + T('aima.d.passes') + ' ' + T('aima.d.before') + (J.newN ? '   +' + J.newN + ' ' + T('aima.d.newdec') : ''));
      if (J.total) L.push(T('aima.d.steps') + ': ' + J.steps + ' / ' + J.total + '   ' + T('aima.d.learnt') + ' ' + pctOf(J.learnt, J.steps) +
        '   (' + T('aima.d.sets') + ': ' + J.move.length + ' + ' + J.press.length + ' ' + T('aima.d.presses') + ', ' + J.val.length + ' ' + T('aima.d.check') + ')');
      s = J.score;
      if (s) {
        var s0 = J.score0 || s;
        L.push(T('aima.d.score') + ': ' + T('aima.k.agree') + ' ' + pctOf(s0.dir, s0.n) + ' -> ' + pctOf(s.dir, s.n) + '   ' +
          T('aima.k.presssame') + ' ' + pctOf(s0.same, s0.pn) + ' -> ' + pctOf(s.same, s.pn) + '   ' + T('aima.k.pressodds') + ' ' + pctOf(s.odds, s.pn) +
          '   ' + T('aima.d.extra') + ' ' + pctOf(s.extra, s.cn));
      }
      if (J.skipped) L.push(T('aima.d.skipped') + ': ' + J.skipped);
    }
    if (J.upErr) L.push(T('aima.d.cloud') + ': ' + J.upErr);
    if (J.error) L.push(J.error);
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
      // a saved sign-in is never erased here: an old guest login is only ignored (writing over it could wipe a newer one from another device)
      if (auth && (auth.anon || !auth.refresh)) auth = null;
      if (!auth) {
        try {
          var cp = JSON.parse(localStorage.getItem('rs6_aimaAuth') || 'null');
          if (cp && cp.refresh && !cp.anon) { auth = cp; MyPC.save('aimaAuth', auth); }
        } catch (e) {}
      }
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
      if (id === index.active || index.brains.length < 2 || Aima.inUse(id)) return false;
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
      if (!SIZES[size] || (!LOCAL_SIZES[size] && !cloudCfg()) || Aima.inUse(b.id)) return false;
      b.build(size);
      b.data = {};
      b.st = freshStats();
      b.log('size', { v: size });
      saveBrain(b);
      return true;
    },
    sizeNeedsCloud: function (size) { return !LOCAL_SIZES[size]; },
    reset: function (b) {
      b = b || active;
      if (Aima.inUse(b.id)) return;
      b.init();
      b.data = {};
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
      matchGen++; vlist.length = 0; teamClock[0] = teamClock[1] = 0;
      if (recording) { recT = 0; rb = { x: new Int8Array(20000 * F), a: new Int8Array(20000 * DA), t: new Float32Array(20000), tm: new Int8Array(20000), n: 0, cap: 20000, goals: [] }; }
      poss[0] = poss[1] = 0; shotsT[0] = shotsT[1] = 0;
      lastOwner = null; lastOwnerAi = false; lastScore[0] = lastScore[1] = 0; matchOn = false;
      matchReward[0] = matchReward[1] = 0;
      pendShot = null; lastSetPiece = 0; tackleT[0] = tackleT[1] = 0;
      pastReset();
    },

    // full time (finished) or abandoned: results, the last rewards, history, save
    matchEnd: function (finished) {
      var m = World.match, done = {};
      if (recording) { if (finished) recording.curDone = true; recMatchEnd(recording, finished); }
      for (var k0 = 0; k0 < vlist.length; k0++) if (!vlist[k0].watch) flush(vlist[k0]);
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (!s.brain) continue;
        var b = s.brain;
        if (b.gN) adamStep(b);
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
      if (recording && rb) {
        // a recording: the clock, possession (an input) and the goals (for the 10-second outcome)
        recT += dt;
        var ro = World.ball.owner;
        if (ro) poss[ro.team] += dt;
        for (var rt = 0; rt < 2; rt++) if (World.match.score[rt] !== lastScore[rt]) { if (World.match.score[rt] > lastScore[rt]) rb.goals.push([recT, rt]); lastScore[rt] = World.match.score[rt]; }
      }
      if (!anyAi()) return;
      matchOn = true;
      for (var t = 0; t < 2; t++) {
        var s = World.aiSlots[t];
        if (s.active && s.brain && !(t === 1 && World.aiSlots[0].active && World.aiSlots[0].brain === s.brain)) s.brain.st.mins += dt / 60;
      }
      poll(dt);
    },

    // a team's step (js/game/match.js, before the CPU moves the others): a checkoAI team's outfield players are each
    // played by the brain (or by Legend in a copying spell); in a training against Legend, Legend's players are copied
    driveTeam: function (t, dt) {
      var as = World.aiSlots[t], players = World.players, i, p, v, b;
      if (as.active) {
        b = as.brain = teamBrains[t] || active;
        if (!b) return;
        var help = b.help();
        teamClock[t] += dt;
        b.st.playT += dt; b.st.opsT += dt;
        for (i = 0; i < players.length; i++) {
          p = players[i];
          if (p.team !== t || p.role === 'GK') continue;
          v = vslotOf(p, b);
          if (p.stun > 0 || p.tackleT > 0) { v.c.t -= dt; continue; }
          if (driveOne(v, p, b, help, dt)) {
            p.isCtl = true;
            NS.Controls.update(v, dt);
            v.player = p; // (a pass / switch moves a human's cursor; each of these stays on his own player)
            p.isCtl = true;
          }
        }
        imitate(b, dt);
      } else if (watched(t)) {
        b = training.b;
        teamClock[t] += dt;
        for (i = 0; i < players.length; i++) {
          p = players[i];
          if (p.team !== t || p.role === 'GK') continue;
          v = vslotOf(p, b);
          v.watch = true; v.c.cpu = true; v.c.clock = teamClock[t];
          v.c.t -= dt;
          if (v.c.t <= 0) { v.c.t += TICKS[b.cfg.tick] || TICKS[1]; if (v.c.t <= 0) v.c.t = 0.1; copyCpu(v, p); }
        }
      } else if (recording && rb) {
        recTeam(t, dt);
      }
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
      remember(b, xs, stickClass(pad.x, pad.y, NS.attack(p.team)), B.sprintDown(pad.cur) ? 1 : 0, btn, btn ? 1 : -1, ctx, (MINEW[b.cfg.mineW] || 3) / 2);
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
      remember(b, xs, stickClass(pad.x, pad.y, NS.attack(p.team)), B.sprintDown(pad.cur) ? 1 : 0, mi + 1, f < 0.3 ? 0 : (f < 0.75 ? 1 : 2), mv.ctx, MINEW[b.cfg.mineW] || 3);
      b.st.humanSamples++;
    },

    // what a brain sees right now for player p (a copy: for checks, not the play loop)
    inputs: function (p, b) { var x = new Float32Array(F); features(p, x, b || active); return x; },

    // the clap button (js/core/input.js): down starts the gauge, up gives the clap
    clapButton: function (down) { coach(down, 1); },
    // the punishment: "that was bad" (the same timing as a clap, a reward of -PUNISH x the strength)
    punishButton: function (down) { coach(down, -1); },

    // ---- training sessions. cfg: { brain: id, opp: 'EASY'..'LEGEND' | 'B:<id>', matches, teamSize, stadium, duration, hours }
    // a training session or a recording is playing matches (the Settings page stays locked meanwhile)
    training: function () {
      var i;
      for (i = 0; i < sessions.length; i++) if (sessions[i].state === 'running' || sessions[i].state === 'loading') return true;
      for (i = 0; i < jobs.length; i++) if (jobs[i].kind === 'rec' && (jobs[i].state === 'running' || jobs[i].state === 'loading')) return true;
      return false;
    },
    // a brain a learning from data is changing right now (it cannot be reset, resized or deleted meanwhile)
    inUse: function (id) {
      for (var i = 0; i < jobs.length; i++) {
        var J = jobs[i];
        if (J.kind === 'learn' && (J.state === 'running' || J.state === 'loading') && J.cfg.brain === id) return true;
      }
      for (i = 0; i < sessions.length; i++) {
        var S = sessions[i];
        if ((S.state === 'running' || S.state === 'loading') && (S.cfg.brain === id || S.cfg.opp === 'B:' + id)) return true;
      }
      if (debugBrains && ((debugBrains[0] && debugBrains[0].id === id) || (debugBrains[1] && debugBrains[1].id === id))) return true;
      return false;
    },
    // debug matches: each team's brain (null = the active one); null clears both
    setDebugBrains: function (arr) {
      debugBrains = arr ? [arr[0] || null, arr[1] || null] : null;
      for (var t = 0; t < 2; t++) {
        teamBrains[t] = debugBrains ? debugBrains[t] : null;
        World.aiSlots[t].brain = teamBrains[t] || active;
      }
    },
    // the brain a team plays with (a training / debug pick, else the active one)
    teamBrain: function (t) { return teamBrains[t] || active; },
    // anything is running: a training, a recording, or learning from data (the green dot)
    busy: function () {
      if (Aima.training()) return true;
      for (var i = 0; i < jobs.length; i++) if (jobs[i].state === 'running' || jobs[i].state === 'loading') return true;
      return false;
    },
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
    stopTraining: function () {
      for (var i = 0; i < sessions.length; i++) Aima.stopSession(sessions[i].id);
      for (i = 0; i < jobs.length; i++) if (jobs[i].kind === 'rec') Aima.stopJob(jobs[i].id);
    },

    // ---- recorded data (Legend v Legend) and learning from it. A job: { id, kind: 'rec' | 'learn', cfg, state, ... }
    dataSets: function () { return dataIndex.sets; },
    // what a brain has already learnt from a set: { passes, chunks } or null
    learnt: function (b, setId) { return b && b.data && b.data[setId] || null; },
    dataState: function () { return dataState; },
    loadDataIndex: loadDataIndex,
    dataJobs: function () { return jobs; },
    recording: function () { return recording; },
    // cfg: { set: id ('' = a new set named cfg.name), name, matches, teamSize, stadium, duration, hours }
    startRecord: function (cfg) {
      if (!trainer || !NS.Debug) return null;
      if (World.match.running && !training && !recording && !(NS.Debug && NS.Debug.running())) return null;
      var meta = cfg.set ? findSet(cfg.set) : null;
      if (!meta) {
        meta = { id: newId(), name: (cfg.name || 'Legend').slice(0, 24), created: Date.now(), updated: Date.now(), F: F, matches: 0, samples: 0,
          presses: 0, chunks: 0, teamSize: cfg.teamSize, stadium: cfg.stadium, duration: cfg.duration, ver: NS.VERSION || '' };
        dataIndex.sets.push(meta);
      }
      if (meta.F !== F) return null; // recorded with other inputs: a new set is needed
      var J = { id: ++jobSeq, kind: 'rec', cfg: cfg, set: meta.id, setName: meta.name, state: 'running', done: 0, mins: 0, started: Date.now(),
        samples: 0, presses: 0, uploaded: 0, pending: 0, upErr: '', stopReq: false };
      jobs.push(J);
      jobNotify(J);
      pump();
      return J;
    },
    // cfg: { brain: id, sets: [id], passes, hours }
    startLearn: function (cfg) {
      if (!trainer || !cfg.sets.length || Aima.inUse(cfg.brain)) return null;
      var meta = findSet(cfg.sets[0]);
      if (!meta || meta.F !== F) return null;
      var J = { id: ++jobSeq, kind: 'learn', cfg: cfg, setName: meta.name, state: 'loading', started: Date.now(), steps: 0, learnt: 0, total: 0,
        lastVal: 0, lastSave: performance.now(), scores: [], stopReq: false, move: [], press: [], val: [] };
      jobs.push(J);
      jobNotify(J);
      startLearn(J);
      return J;
    },
    stopJob: function (id) {
      for (var i = 0; i < jobs.length; i++) {
        var J = jobs[i];
        if (J.id !== id || (J.state !== 'running' && J.state !== 'loading')) continue;
        J.stopReq = true;
        if (J.kind === 'rec') {
          if (recording === J) NS.Debug.stop();
          else { J.state = 'stopped'; J.ended = Date.now(); jobNotify(J); }
        } else if (J.state === 'loading') { J.state = 'stopped'; jobNotify(J); }
      }
    },
    removeJob: function (id) { jobs = jobs.filter(function (J) { return J.id !== id || J.state === 'running' || J.state === 'loading'; }); },
    // deletes a data set (its chunks and its line in the index); not while a job uses it
    deleteSet: function (id) {
      for (var i = 0; i < jobs.length; i++) {
        var J = jobs[i];
        if ((J.state === 'running' || J.state === 'loading') && (J.set === id || (J.cfg.sets && J.cfg.sets.indexOf(id) >= 0))) return false;
      }
      var meta = findSet(id);
      if (!meta) return false;
      for (var k = 0; k < meta.chunks; k++) dataDel('c_' + id + '_' + k);
      dataIndex.sets = dataIndex.sets.filter(function (s) { return s.id !== id; });
      delete dsets[id]; delete dmiss[id];
      if (canWrite()) saveDataIndex().catch(function () {});
      return true;
    },
    // chunks of a set not in the cloud yet (this session still holds them), and sending them again
    dataMissing: missOf,
    resendSet: resendSet,
    jobText: jobText,
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
