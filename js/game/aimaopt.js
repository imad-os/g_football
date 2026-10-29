/* checkoAI "options" brains (algorithm AIMA-OPT 2.0, docs/checkoai-plan.md steps A-C, F).
 *
 * A brain made with this algorithm plays the ball carrier of its team; the other players keep Legend's rules (ai.js).
 * Whenever the carrier decides, Legend's decide() lists every option it weighs (5 dribble directions, a clearance, the
 * shot, and for each team-mate: a pass to feet, a one-two, through balls, a ball to a runner, a cross, a long ball),
 * each with Legend's own score. The brain scores every option as
 *     logit = Legend's score / TAU + r(situation, option)
 * where r is a small network (30 inputs: 12 about the situation, 18 about the option -> 32 -> 16 -> 1) that starts at 0:
 * a new brain plays exactly like Legend, then learns where Legend is wrong:
 *   - copying (step B): every decision of a Legend team in its matches, and the trainer's own moves (x3), teach it to
 *     choose what they chose (cross-entropy over the options);
 *   - rewards (step C): each of its own choices gets the rewards of the next 10 seconds (discounted 0.85 a second):
 *     goals +-3, shots (more for a better chance), passes that move the ball forward, the ball lost -0.05; the advantage over
 *     a value network (12 situation inputs -> 16 -> 1) pushes that option's odds up or down (policy gradient);
 *     a pull towards r = 0 keeps it close to Legend except where the rewards say otherwise;
 *   - the trainer's claps and punishments: lessons (as in AIMA-AC 1.2: the situation and the option, a score; 5 claps
 *     make an option his first choice in situations like it, a punishment cuts it at once) plus 24 learning steps.
 * In a training 30% of its choices are drawn from its odds (it tries close alternatives); otherwise it plays its best.
 * Levels: one brain plays at Easy / Normal / Pro / Legend. Below Legend its team uses that level's rules (speed,
 * reactions, accuracy, keeper) and some of its choices are its 2nd / 3rd best (SHARP); it does not learn there.
 * Saved with the brain (b.opt). No allocation in the play loop. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;

  var ALG = 'AIMA-OPT 2.0 (Legend options + learned correction)';
  var NCTX = 12, NOF = 18, NIN = NCTX + NOF, H1 = 32, H2 = 16, VH = 16;
  var NCODE = 9;
  var MAXC = 160;
  var TAU = 0.04;         // Legend's score / TAU: a 0.1 better option has e^2.5 (12) x the odds
  var EXPLORE = 0.3;      // in a training: this share of its choices is drawn from its odds (the rest: its best)
  var LR = 0.0006;
  var BATCH = 4;
  var ANCHOR = 0.02;      // pull of r towards 0 (stay Legend where nothing says otherwise)
  var HORIZON = 10;       // seconds of rewards a choice gets
  var GAMMA = 0.85;       // per second
  var BC_W = 1, HUMAN_W = 3;
  var CLAP_BACK = 3.5;
  var RING = 64;
  // rewards: a goal +-GOAL_R (the match is won by goals: they outweigh the small ones), a ball lost LOST_R. The result's
  // points (win 3, draw 1) are added to the match's reward at full time by aima.js (a measure, not taught: they would
  // reach only the choices of the last HORIZON seconds)
  var GOAL_R = 3, LOST_R = -0.05;
  // its level (Settings > CPU level; the rest of the team plays with that level's rules): [share of its choices drawn
  // from its odds instead of its best, how flat those odds are (x TAU)]. Legend: always its best
  var SHARP = { EASY: [0.55, 3], NORMAL: [0.3, 2], HARD: [0.12, 1.4], LEGEND: [0, 1] };

  // parameter layout (one Float32Array)
  var OW1 = 0, OB1 = OW1 + H1 * NIN, OW2 = OB1 + H1, OB2 = OW2 + H2 * H1, OW3 = OB2 + H2, OB3 = OW3 + H2;
  var OV1 = OB3 + 1, OVB1 = OV1 + VH * NCTX, OV2 = OVB1 + VH, OVB2 = OV2 + VH, NP = OVB2 + 1;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function makeOpt() {
    var o = { P: new Float32Array(NP), G: new Float32Array(NP), M: new Float32Array(NP), V: new Float32Array(NP), t: 0, gN: 0, les: null };
    for (var i = 0; i < NP; i++) {
      var fan = i < OB1 ? NIN : (i >= OW2 && i < OB2 ? H1 : (i >= OV1 && i < OVB1 ? NCTX : (i >= OV2 && i < OVB2 ? VH : 0)));
      o.P[i] = fan ? (Math.random() * 2 - 1) * Math.sqrt(1.5 / fan) : 0;
    }
    for (i = OW3; i < OB3; i++) o.P[i] = 0; // r starts at exactly 0: Legend's own choices
    return o;
  }

  // ---- scratch (no allocation while playing)
  var X = new Float32Array(MAXC * NIN), A1 = new Float32Array(MAXC * H1), A2 = new Float32Array(MAXC * H2);
  var SC = new Float32Array(MAXC), CODE = new Int8Array(MAXC), R = new Float32Array(MAXC), LG = new Float32Array(MAXC), PR = new Float32Array(MAXC);
  var CTX = new Float32Array(NCTX), VA = new Float32Array(VH);
  var dh1 = new Float32Array(H1), dh2 = new Float32Array(H2);

  // the situation (team frame)
  function ctxOf(p, out) {
    var a = NS.attack(p.team), HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H, m = World.match;
    var px = p.pos.x * a, pz = p.pos.z;
    var pressure = NS.AI.oppDist(p.pos.x, p.pos.z, p.team);
    var gx = HW - px;
    var goalSide = 0, pl = World.players;
    for (var i = 0; i < pl.length; i++) if (pl[i].team !== p.team && pl[i].role !== 'GK' && pl[i].pos.x * a > px) goalSide++;
    out[0] = px / HW; out[1] = pz / HH; out[2] = Math.min(1.5, pressure / 10);
    out[3] = clamp((m.score[p.team] - m.score[1 - p.team]) / 3, -1.5, 1.5);
    out[4] = clamp(m.timeSeconds / 5400, 0, 1.1);
    out[5] = px < 0 ? 1 : 0;
    out[6] = Math.sqrt(gx * gx + pz * pz) / 60;
    out[7] = NS.AI.shotQuality(p.pos.x, p.pos.z, p.team) * 2;
    out[8] = goalSide / 6;
    out[9] = m.restart ? 1 : 0;
    out[10] = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) / 12;
    out[11] = 1;
  }
  // option i's inputs: the situation, then the option
  function rowOf(i, c, p) {
    var a = NS.attack(p.team), HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H, o = i * NIN, k;
    for (k = 0; k < NCTX; k++) X[o + k] = CTX[k];
    o += NCTX;
    for (k = 0; k < NCODE; k++) X[o + k] = k === c.code ? 1 : 0;
    var dx = c.x - p.pos.x, dz = c.z - p.pos.z;
    X[o + 9] = clamp(c.sc, -2, 2);
    X[o + 10] = c.x * a / HW; X[o + 11] = c.z / HH;
    X[o + 12] = Math.sqrt(dx * dx + dz * dz) / 40;
    X[o + 13] = clamp(dx * a / 35, -1.5, 1.5);
    X[o + 14] = clamp(c.risk, 0, 1);
    X[o + 15] = Math.min(1.5, NS.AI.oppDist(c.x, c.z, p.team) / 10);
    X[o + 16] = Math.min(2, NS.AI.shotQuality(c.x, c.z, p.team) * 2);
    X[o + 17] = c.mt && c.mt.role === 'FWD' ? 1 : 0;
  }

  // r for row i (keeps the activations for learning)
  function fwdRow(P, i) {
    var x = i * NIN, h1 = i * H1, h2 = i * H2, j, k, s;
    for (j = 0; j < H1; j++) {
      s = P[OB1 + j];
      var w = OW1 + j * NIN;
      for (k = 0; k < NIN; k++) s += P[w + k] * X[x + k];
      A1[h1 + j] = Math.tanh(s);
    }
    for (j = 0; j < H2; j++) {
      s = P[OB2 + j];
      var w2 = OW2 + j * H1;
      for (k = 0; k < H1; k++) s += P[w2 + k] * A1[h1 + k];
      A2[h2 + j] = Math.tanh(s);
    }
    s = P[OB3];
    for (j = 0; j < H2; j++) s += P[OW3 + j] * A2[h2 + j];
    return s;
  }
  // d(loss)/d(r_i) = g: into the gradients
  function backRow(opt, i, g) {
    var P = opt.P, G = opt.G, x = i * NIN, h1 = i * H1, h2 = i * H2, j, k;
    G[OB3] += g;
    for (j = 0; j < H2; j++) { G[OW3 + j] += g * A2[h2 + j]; dh2[j] = P[OW3 + j] * g * (1 - A2[h2 + j] * A2[h2 + j]); }
    for (j = 0; j < H1; j++) dh1[j] = 0;
    for (j = 0; j < H2; j++) {
      var d = dh2[j];
      if (d === 0) continue;
      G[OB2 + j] += d;
      var w2 = OW2 + j * H1;
      for (k = 0; k < H1; k++) { G[w2 + k] += d * A1[h1 + k]; dh1[k] += P[w2 + k] * d; }
    }
    for (j = 0; j < H1; j++) {
      var d1 = dh1[j] * (1 - A1[h1 + j] * A1[h1 + j]);
      if (d1 === 0) continue;
      G[OB1 + j] += d1;
      var w = OW1 + j * NIN;
      for (k = 0; k < NIN; k++) G[w + k] += d1 * X[x + k];
    }
  }
  function value(P, ctx) {
    var s = P[OVB2];
    for (var j = 0; j < VH; j++) {
      var t = P[OVB1 + j], w = OV1 + j * NCTX;
      for (var k = 0; k < NCTX; k++) t += P[w + k] * ctx[k];
      VA[j] = Math.tanh(t);
      s += P[OV2 + j] * VA[j];
    }
    return s;
  }
  function backValue(opt, ctx, g) {
    var P = opt.P, G = opt.G;
    G[OVB2] += g;
    for (var j = 0; j < VH; j++) {
      G[OV2 + j] += g * VA[j];
      var d = P[OV2 + j] * g * (1 - VA[j] * VA[j]), w = OV1 + j * NCTX;
      G[OVB1 + j] += d;
      for (var k = 0; k < NCTX; k++) G[w + k] += d * ctx[k];
    }
  }
  function adam(b) {
    var o = b.opt, P = o.P, G = o.G, i, n2 = 0;
    var inv = 1 / o.gN;
    for (i = 0; i < NP; i++) n2 += G[i] * G[i];
    n2 *= inv * inv;
    var sc = (n2 > 4 ? 2 / Math.sqrt(n2) : 1) * inv;
    o.t++;
    var c1 = 1 - Math.pow(0.9, o.t), c2 = 1 - Math.pow(0.999, o.t), lr = LR * Math.sqrt(c2) / c1;
    for (i = 0; i < NP; i++) {
      var g = G[i] * sc;
      o.M[i] = 0.9 * o.M[i] + 0.1 * g;
      o.V[i] = 0.999 * o.V[i] + 0.001 * g * g;
      P[i] -= lr * o.M[i] / (Math.sqrt(o.V[i]) + 1e-8);
      G[i] = 0;
    }
    o.gN = 0;
    b.dirty = true;
  }
  function done1(b) { b.opt.gN++; if (b.opt.gN >= BATCH) adam(b); }

  // logits of the n rows in X (r, plus Legend's score), and their odds; lessons: the trainer's lessons too
  function score(b, n, lessons) {
    var P = b.opt.P, mx = -1e9, i;
    for (i = 0; i < n; i++) {
      R[i] = fwdRow(P, i);
      LG[i] = SC[i] / TAU + R[i];
    }
    if (lessons) lessonBias(b, n);
    for (i = 0; i < n; i++) if (LG[i] > mx) mx = LG[i];
    var s = 0;
    for (i = 0; i < n; i++) { PR[i] = Math.exp(LG[i] - mx); s += PR[i]; }
    for (i = 0; i < n; i++) PR[i] /= s;
  }
  // one learning step over the n rows in X: towards option `to` (w > 0), or away from it (w < 0)
  function learnRows(b, n, to, w) {
    score(b, n, false);
    var o = b.opt, i;
    if (w >= 0) {
      for (i = 0; i < n; i++) backRow(o, i, w * (PR[i] - (i === to ? 1 : 0)) + ANCHOR * R[i]);
    } else {
      var pa = Math.min(0.999, PR[to]), aw = -w;
      for (i = 0; i < n; i++) backRow(o, i, aw * (i === to ? pa : -pa * PR[i] / (1 - pa)) + ANCHOR * R[i]);
    }
    done1(b);
  }

  // ---- lessons: the trainer's claps / punishments / moves, per option kind
  var LES_MAX = 300, LES_S2 = 0.03, LES_MERGE = 0.01, LES_MIN = 0.06, LES_FULL = 3.6, LES_LEAD = 1.6, LES_DOWN = 3, LES_DOWN_MAX = 16;
  function lesInit(o) {
    if (!o.les) o.les = { n: 0, X: new Float32Array(LES_MAX * NIN), C: new Int8Array(LES_MAX), W: new Float32Array(LES_MAX), T: new Float64Array(LES_MAX) };
    return o.les;
  }
  function lesDist(L, j, x) {
    var a = j * NIN, d = 0;
    for (var k = 0; k < NIN; k++) { var e = L.X[a + k] - X[x + k]; d += e * e; }
    return d / NIN;
  }
  function addLesson(b, row, code, delta) {
    var L = lesInit(b.opt), x = row * NIN, at = -1, bd = LES_MERGE, j, k;
    for (j = 0; j < L.n; j++) {
      if (L.C[j] !== code) continue;
      var d = lesDist(L, j, x);
      if (d < bd) { bd = d; at = j; }
    }
    if (at < 0) {
      if (L.n < LES_MAX) at = L.n++;
      else { at = 0; for (j = 1; j < L.n; j++) if (Math.abs(L.W[j]) < Math.abs(L.W[at])) at = j; }
      for (k = 0; k < NIN; k++) L.X[at * NIN + k] = X[x + k];
      L.C[at] = code; L.W[at] = 0;
    } else for (k = 0; k < NIN; k++) L.X[at * NIN + k] += (X[x + k] - L.X[at * NIN + k]) * 0.25;
    L.W[at] = clamp(L.W[at] + delta, -8, 8);
    L.T[at] = Date.now();
    b.st.lessons = L.n;
    b.dirty = true;
  }
  function lessonBias(b, n) {
    var L = b.opt.les;
    if (!L || !L.n) return;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < L.n; j++) {
        if (L.C[j] !== CODE[i] || L.W[j] === 0) continue;
        var sim = Math.exp(-lesDist(L, j, i * NIN) / LES_S2);
        if (sim < LES_MIN) continue;
        var w = L.W[j];
        if (w < 0) { LG[i] += sim * Math.max(-LES_DOWN_MAX, LES_DOWN * w); continue; }
        var mx = -1e9;
        for (var k = 0; k < n; k++) if (k !== i && LG[k] > mx) mx = LG[k];
        LG[i] += sim * Math.min(1, w / LES_FULL) * (Math.max(0, mx - LG[i]) + LES_LEAD);
      }
    }
  }

  // ---- its own choices, waiting for their rewards (a ring): the rows, Legend's scores, the choice, when, the return
  var ring = [];
  for (var ri = 0; ri < RING; ri++) ring.push({ n: 0, X: new Float32Array(MAXC * NIN), SC: new Float32Array(MAXC), CODE: new Int8Array(MAXC),
    ctx: new Float32Array(NCTX), to: 0, t: 0, team: 0, ret: 0, open: false, b: null });
  var ringI = 0, clock = 0;
  function keep(b, p, n, to) {
    var e = ring[ringI];
    if (e.open) finish(e);
    ringI = (ringI + 1) % RING;
    e.n = n; e.to = to; e.t = clock; e.team = p.team; e.ret = 0; e.open = true; e.b = b;
    for (var i = 0; i < n * NIN; i++) e.X[i] = X[i];
    for (i = 0; i < n; i++) { e.SC[i] = SC[i]; e.CODE[i] = CODE[i]; }
    for (i = 0; i < NCTX; i++) e.ctx[i] = CTX[i];
  }
  function load(e) {
    for (var i = 0; i < e.n * NIN; i++) X[i] = e.X[i];
    for (i = 0; i < e.n; i++) { SC[i] = e.SC[i]; CODE[i] = e.CODE[i]; }
  }
  // the policy-gradient step for a choice whose rewards are in
  function finish(e) {
    e.open = false;
    var b = e.b;
    if (!b || !b.learns()) return;
    load(e);
    var o = b.opt;
    var v = value(o.P, e.ctx);
    var adv = clamp(e.ret - v, -1, 1);
    backValue(o, e.ctx, (v - e.ret) * 0.5);
    score(b, e.n, false);
    for (var i = 0; i < e.n; i++) backRow(o, i, adv * (PR[i] - (i === e.to ? 1 : 0)) + ANCHOR * R[i]);
    done1(b);
    b.st.rl++;
  }
  // a reward for team t (its choices of the last HORIZON seconds, discounted by how long ago)
  function reward(t, r, why) {
    for (var i = 0; i < RING; i++) {
      var e = ring[i];
      if (!e.open || e.team !== t) continue;
      e.ret += r * Math.pow(GAMMA, clock - e.t);
    }
    var b = optBrain(t);
    if (b) { b.st.reward += r; tallyWhy[t][why] = (tallyWhy[t][why] || 0) + r; if (NS.Aima && NS.Aima.optReward) NS.Aima.optReward(t, r); }
  }
  var tallyWhy = [{}, {}];

  function optBrain(t) {
    var s = World.aiSlots[t];
    return s && s.active && s.brain && s.brain.algo === 'OPT' ? s.brain : null;
  }
  // the OPT brains learning in this match (Legend's decisions teach them)
  function learners() {
    var a = optBrain(0), b = optBrain(1), out = [];
    if (a && a.learns()) out.push(a);
    if (b && b !== a && b.learns()) out.push(b);
    return out;
  }

  // ---- called by ai.js decide(): the carrier p with the options CANDS[0..n-1]. Returns the option to play, -1 Legend's.
  function decide(p, prof, C, n) {
    var b = optBrain(p.team);
    var ls = b ? null : learners();
    if (!b && (!ls.length || prof.iq < 3)) return -1;
    n = Math.min(n, MAXC);
    if (n < 2) return -1;
    ctxOf(p, CTX);
    var leg = 0;
    for (var i = 0; i < n; i++) {
      rowOf(i, C[i], p);
      SC[i] = C[i].sc; CODE[i] = C[i].code;
      if (C[i].sc > C[leg].sc) leg = i;
    }
    if (!b) {
      // a Legend team's decision: the learning brains copy it
      for (var k = 0; k < ls.length; k++) { learnRows(ls[k], n, leg, BC_W); ls[k].st.im++; ls[k].st.cpuSamples++; }
      return -1;
    }
    score(b, n, true);
    var pick = 0, r, j;
    var sh = SHARP[NS.brainLevel ? NS.brainLevel(p.team) : 'LEGEND'] || SHARP.LEGEND;
    if (b.learns() && NS.Debug && NS.Debug.running() && Math.random() < EXPLORE) {
      // a training: drawn from his odds (close alternatives get tried)
      r = Math.random();
      for (j = 0; j < n - 1; j++) { r -= PR[j]; if (r <= 0) break; }
      pick = j;
    } else if (sh[0] > 0 && Math.random() < sh[0]) {
      // a lower level: drawn from flatter odds (a worse option now and then)
      var mx = -1e9, s2 = 0;
      for (i = 0; i < n; i++) if (LG[i] > mx) mx = LG[i];
      for (i = 0; i < n; i++) s2 += Math.exp((LG[i] - mx) / sh[1]);
      r = Math.random() * s2;
      for (j = 0; j < n - 1; j++) { r -= Math.exp((LG[j] - mx) / sh[1]); if (r <= 0) break; }
      pick = j;
    } else {
      for (i = 1; i < n; i++) if (LG[i] > LG[pick]) pick = i;
    }
    b.st.decisions++; b.st.modelDec++;
    if (!b.st.optPick) b.st.optPick = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    b.st.optPick[CODE[pick]]++;
    b.st.optSame = (b.st.optSame || 0) + (pick === leg ? 1 : 0);
    b.st.opsP += n * 2 * (NIN * H1 + H1 * H2 + H2);
    keep(b, p, n, pick);
    last[p.team] = { t: clock, e: ring[(ringI + RING - 1) % RING] };
    return pick;
  }
  var last = [null, null];

  // ---- rewards, polled every step
  var lastScore = [0, 0], lastOwner = null, passFrom = null, passX = 0;
  var shotWrapped = false;
  function wrapShots() {
    if (shotWrapped) return;
    shotWrapped = true;
    var orig = Actions.release;
    Actions.release = function (p, type) {
      orig.apply(this, arguments);
      var b = World.match.running && optBrain(p.team);
      if (!b) return;
      if (type >= ACT.SHOOT) { b.st.shots++; reward(p.team, 0.05 + 0.5 * Math.min(1, NS.AI.shotQuality(p.pos.x, p.pos.z, p.team)), 'shot'); }
      else { b.st.passes++; passFrom = p; passX = p.pos.x * NS.attack(p.team); }
    };
  }
  // wrapped once on load, like aima.js's hooks: a debug run (trainings) wraps Actions on top while it runs and puts back
  // what it found, so a hook added during a run would be lost after it (it was: no shot / pass rewards after the 1st match)
  wrapShots();
  function poll(dt) {
    clock += dt;
    var m = World.match, o = World.ball.owner, t;
    if (!optBrain(0) && !optBrain(1)) { lastOwner = o; lastScore[0] = m.score[0]; lastScore[1] = m.score[1]; return; }
    for (t = 0; t < 2; t++) {
      if (m.score[t] > lastScore[t]) { reward(t, GOAL_R, 'goal'); reward(1 - t, -GOAL_R, 'conceded'); }
      lastScore[t] = m.score[t];
    }
    if (o && o !== lastOwner) {
      var prev = lastOwner || passFrom;
      if (prev && prev.team !== o.team && !m.restart) {
        reward(prev.team, LOST_R, 'lost');
        var bl = optBrain(prev.team), bw = optBrain(o.team);
        if (bl) bl.st.lost++;
        if (bw) bw.st.won++;
      } else if (prev && prev.team === o.team && prev !== o && passFrom && passFrom.team === o.team) {
        var gain = o.pos.x * NS.attack(o.team) - passX, bp = optBrain(o.team);
        if (bp) { bp.st.passOk++; if (gain > 0) bp.st.fwdPass++; }
        reward(o.team, 0.02 + 0.08 * clamp(gain / 30, 0, 1), 'pass');
      }
      passFrom = null;
    }
    if (o) lastOwner = o;
    // choices whose rewards are all in
    for (var i = 0; i < RING; i++) {
      var e = ring[i];
      if (e.open && clock - e.t > HORIZON) finish(e);
    }
  }

  var MOVE_CODE = { lowpass: 3, onetwo: 4, through: 5, lobthrough: 6, long: 8, shoot: 2, curve: 2, chip: 2 };

  NS.AimaOpt = {
    ALG: ALG,
    NP: NP,
    create: makeOpt,
    decide: decide,
    poll: poll,
    clock: function () { return clock; },
    why: function (t) { return tallyWhy[t]; },
    matchStart: function () {
      wrapShots();
      for (var i = 0; i < RING; i++) ring[i].open = false;
      lastScore[0] = lastScore[1] = 0; lastOwner = null; passFrom = null; last[0] = last[1] = null;
      tallyWhy[0] = {}; tallyWhy[1] = {};
    },
    // full time: the last choices are learnt with what they got
    matchEnd: function () { for (var i = 0; i < RING; i++) if (ring[i].open) finish(ring[i]); },
    // the trainer's clap (sign 1) / punishment (-1) for team t's latest choice (made up to CLAP_BACK s before t0)
    coach: function (t, t0, sign, strength) {
      var b = optBrain(t), L = last[t];
      if (!b || !L || L.t < t0 - CLAP_BACK || L.t > t0 + 0.05 || !L.e.b) return false;
      load(L.e);
      var delta = sign * (0.6 + 0.4 * strength);
      addLesson(b, L.e.to, L.e.CODE[L.e.to], delta);
      if (b.learns()) for (var k = 0; k < 24; k++) learnRows(b, L.e.n, L.e.to, delta * 1.5);
      L.e.ret += delta;
      return true;
    },
    // the trainer made move `id` with player p (stick sx, sz): the matching option teaches the brain b
    human: function (b, p, id, sx, sz) {
      var code = MOVE_CODE[id];
      if (code === undefined || !b || !b.opt || World.ball.owner !== p) return;
      var oc = NS.AI.options(p), C = oc[0], n = Math.min(oc[1], MAXC);
      if (n < 2) return;
      ctxOf(p, CTX);
      var best = -1, bd = -2, sl = Math.sqrt(sx * sx + sz * sz);
      for (var i = 0; i < n; i++) {
        rowOf(i, C[i], p);
        SC[i] = C[i].sc; CODE[i] = C[i].code;
        var cd = C[i].code;
        if (cd !== code && !(code === 8 && cd === 7)) continue; // (a long ball may be a cross)
        var dx = C[i].x - p.pos.x, dz = C[i].z - p.pos.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
        var dot = sl > 0.2 ? (dx * sx + dz * sz) / (dl * sl) : -dl / 100;
        if (dot > bd) { bd = dot; best = i; }
      }
      if (best < 0) return;
      addLesson(b, best, CODE[best], 0.35);
      if (b.learns()) for (var k = 0; k < 4; k++) learnRows(b, n, best, HUMAN_W);
      b.st.humanSamples++;
    },
    pack: function (b) {
      var o = b.opt, L = o.les, out = { v: 1, np: NP, p: b64(new Uint8Array(o.P.buffer.slice(0))), t: o.t };
      if (L && L.n) {
        var q = new Int8Array(L.n * NIN), w = [], c = [];
        for (var i = 0; i < L.n * NIN; i++) q[i] = clamp(Math.round(L.X[i] * 60), -127, 127);
        for (i = 0; i < L.n; i++) { w.push(Math.round(L.W[i] * 100) / 100); c.push(L.C[i]); }
        out.les = { x: b64(new Uint8Array(q.buffer)), w: w, c: c };
      }
      return out;
    },
    unpack: function (b, d) {
      var o = makeOpt();
      if (d && d.np === NP && d.p) {
        var u = unb64(d.p);
        if (u.length === NP * 4) { o.P.set(new Float32Array(u.buffer)); o.t = 0; }
      }
      if (d && d.les && d.les.w) {
        var L = lesInit(o), q = new Int8Array(unb64(d.les.x).buffer), n = Math.min(LES_MAX, d.les.w.length);
        for (var i = 0; i < n * NIN; i++) L.X[i] = q[i] / 60;
        for (i = 0; i < n; i++) { L.W[i] = d.les.w[i]; L.C[i] = d.les.c[i]; }
        L.n = n;
      }
      b.opt = o;
    },
    lessons: function (b) { return b && b.opt && b.opt.les ? b.opt.les.n : 0; }
  };

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
})(window.RS6 = window.RS6 || {});
