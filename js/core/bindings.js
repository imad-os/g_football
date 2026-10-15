/* Button map. My PC only gives games abstract buttons (OK = jump, RUN, CANCEL), so every move is bound to a detected
 * button or two-button combination plus a gesture: tap / hold / hold+ / long hold (how long the button is held).
 *
 * Moves have a context (1 = with the ball, 2 = without it) and a kind:
 *   0 instant    fires when its gesture window ends (with the ball) or starts (without the ball)
 *   1 charge     fires on release, power grows with the hold time (shots)
 *   2 continuous active while the button is held (press)
 */
(function (NS) {
  'use strict';

  var J = 1, R = 2, C = 4;
  NS.BTN = { JUMP: J, RUN: R, CANCEL: C };

  var TH = [0, 0.16, 0.36, 0.58]; // hold time (s) where each gesture tier starts
  var POP = [0, 1, 1, 2, 1, 2, 2, 3];

  // cls = colour class of the HUD chip
  var MOVES = [
    { id: 'lowpass', ctx: 1, kind: 0, cls: 1, mask: J, tier: 0 },
    { id: 'through', ctx: 1, kind: 0, cls: 2, mask: J, tier: 1 },
    { id: 'long', ctx: 1, kind: 0, cls: 3, mask: J, tier: 2 },
    { id: 'shoot', ctx: 1, kind: 1, cls: 4, mask: J, tier: 3 },
    { id: 'curve', ctx: 1, kind: 1, cls: 4, mask: J | C, tier: 0 },
    { id: 'chip', ctx: 1, kind: 1, cls: 4, mask: J | C, tier: 3 },
    { id: 'onetwo', ctx: 1, kind: 0, cls: 1, mask: C, tier: 0 },
    { id: 'tackle', ctx: 2, kind: 0, cls: 1, mask: J, tier: 0 },
    { id: 'slide', ctx: 2, kind: 0, cls: 1, mask: J | C, tier: 0 },
    { id: 'press', ctx: 2, kind: 2, cls: 2, mask: J, tier: 1 },
    { id: 'teampress', ctx: 2, kind: 2, cls: 3, mask: J, tier: 3 },
    { id: 'switch', ctx: 2, kind: 0, cls: 1, mask: C, tier: 0 }
  ];
  var DEF = [];
  for (var i = 0; i < MOVES.length; i++) DEF.push([MOVES[i].mask, MOVES[i].tier]);
  var DEF_SPRINT = R;

  var sprintMask = DEF_SPRINT;
  var relevant = 0;

  function recompute() {
    relevant = 0;
    for (var k = 0; k < MOVES.length; k++) relevant |= MOVES[k].mask;
  }
  recompute();

  function tierOf(d) { return d >= TH[3] ? 3 : (d >= TH[2] ? 2 : (d >= TH[1] ? 1 : 0)); }

  NS.Bindings = {
    MOVES: MOVES,
    TH: TH,
    tierOf: tierOf,
    index: function (id) {
      for (var k = 0; k < MOVES.length; k++) if (MOVES[k].id === id) return k;
      return -1;
    },
    sprintMask: function () { return sprintMask; },
    // true while the sprint button (or all buttons of a combination) is held
    sprintDown: function (cur) { return sprintMask !== 0 && (cur & sprintMask) === sprintMask; },
    // Buttons that take part in any move: other buttons (plain RUN) are ignored by the gesture engine.
    relevant: function () { return relevant; },

    // true when a bigger combination than `mask` exists (so a short wait for a second button is needed)
    needsSettle: function (mask) {
      for (var k = 0; k < MOVES.length; k++) {
        var m = MOVES[k].mask;
        if (m !== mask && (m & mask) === mask) return true;
      }
      return false;
    },

    // Move for the held `mask` after holding `d` seconds in context `ctx`, or -1. No allocation.
    resolve: function (ctx, mask, d) {
      var bestPop = 0, bestMask = 0, k, m;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx !== ctx || m.mask === 0 || (m.mask & ~mask) !== 0) continue;
        if (POP[m.mask] > bestPop) { bestPop = POP[m.mask]; bestMask = m.mask; }
      }
      if (!bestPop) return -1;
      var tier = tierOf(d);
      var bi = -1, bt = -1;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx === ctx && m.mask === bestMask && m.tier <= tier && m.tier > bt) { bi = k; bt = m.tier; }
      }
      if (bi < 0) return -1;
      // instant moves only fire inside their own window (e.g. a tap is not a 2 s hold)
      if (MOVES[bi].kind === 0 && bt < 3 && d >= TH[bt + 1]) return -1;
      return bi;
    },

    // Binds a move; any other move of the same context with the same button + gesture is unbound. Returns its index or -1.
    set: function (idx, mask, tier) {
      var m = MOVES[idx];
      var cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        var o = MOVES[k];
        if (k !== idx && o.ctx === m.ctx && o.mask === mask && o.tier === tier) { o.mask = 0; cleared = k; }
      }
      m.mask = mask;
      m.tier = tier;
      recompute();
      return cleared;
    },
    clear: function (idx) { MOVES[idx].mask = 0; recompute(); },
    setSprint: function (mask) { if (mask > 0 && mask < 8) sprintMask = mask; },
    reset: function () {
      for (var k = 0; k < MOVES.length; k++) { MOVES[k].mask = DEF[k][0]; MOVES[k].tier = DEF[k][1]; }
      sprintMask = DEF_SPRINT;
      recompute();
    },

    // Saved form: { s: sprintMask, m: { id: [mask, tier] } }
    serialize: function () {
      var out = { s: sprintMask, m: {} };
      for (var k = 0; k < MOVES.length; k++) out.m[MOVES[k].id] = [MOVES[k].mask, MOVES[k].tier];
      return out;
    },
    load: function (saved) {
      this.reset();
      if (!saved || typeof saved !== 'object') return;
      if (typeof saved.s === 'number' && saved.s > 0 && saved.s < 8) sprintMask = saved.s | 0;
      if (saved.m && typeof saved.m === 'object') {
        for (var k = 0; k < MOVES.length; k++) {
          var v = saved.m[MOVES[k].id];
          if (v && typeof v[0] === 'number' && typeof v[1] === 'number' && v[0] >= 0 && v[0] < 8 && v[1] >= 0 && v[1] < 4) {
            MOVES[k].mask = v[0] | 0;
            MOVES[k].tier = v[1] | 0;
          }
        }
      }
      recompute();
    },

    // Short readable name of a button combination ("OK", "OK + CANCEL", "B").
    maskLabel: function (mask) {
      var t = NS.I18n.t;
      if (!mask) return t('map.unbound');
      if (mask === (R | C)) return t('btn.b');
      var parts = [];
      if (mask & J) parts.push(t('btn.jump'));
      if (mask & R) parts.push(t('btn.run'));
      if (mask & C) parts.push(t('btn.cancel'));
      return parts.join(' + ');
    },
    bindingLabel: function (idx) {
      var m = MOVES[idx];
      if (!m.mask) return NS.I18n.t('map.unbound');
      return this.maskLabel(m.mask) + ' • ' + NS.I18n.t('tier.' + m.tier);
    }
  };
})(window.RS6 = window.RS6 || {});
