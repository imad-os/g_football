/* Button map: ONE binding per move, shared by every game controller and phone controller (they all use the standard
 * button positions: A B X Y, L R, ZL ZR, L3 R3, shown with the controller's own names). A binding is a button or a
 * two-button combination. There are no tap / hold gestures: the buttons alone decide the move, holding only changes how
 * it is played.
 *
 * Moves have a context (1 = with the ball, 2 = without it) and a kind:
 *   0 instant    with the ball: fires on release, a longer hold = more power (passes)
 *                without the ball: fires as soon as it is pressed (tackle, slide, switch)
 *   1 charge     fires on release, power grows with the hold time (shots)
 *   2 continuous active while the button is held (press, team press)
 */
(function (NS) {
  'use strict';

  // button bits (standard positions: a = bottom, b = right, x = left, y = top), see js/core/gamepad.js
  var PA = 8, PB = 16, PX = 32, PY = 64, PL = 128, PR = 256, PZL = 512, PZR = 1024, PL3 = 2048, PR3 = 4096;
  // the D-pad (the four buttons under the left stick): it moves the player; only the clap / punish may use it
  var PDU = 8192, PDD = 16384, PDL = 32768, PDR = 65536, DPAD = PDU | PDD | PDL | PDR;
  // [bit, standard button index] for the names
  var BIT_INDEX = [[PA, 0], [PB, 1], [PX, 2], [PY, 3], [PL, 4], [PR, 5], [PZL, 6], [PZR, 7], [PL3, 10], [PR3, 11], [PDU, 12], [PDD, 13], [PDL, 14], [PDR, 15]];
  var PAD_FALLBACK = ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', '', '', 'L3', 'R3', 'D-pad \u2191', 'D-pad \u2193', 'D-pad \u2190', 'D-pad \u2192'];
  function padName(i) { return NS.Gamepad ? NS.Gamepad.label(i) : PAD_FALLBACK[i]; }

  var SAVE_VERSION = 3; // v3: one map for all controllers (v2 had a separate TV / keyboard side: its pad side is kept)
  var ALL = 131071;

  function pop(m) { var c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

  // PES-style defaults; cls = colour class of the HUD chip
  var MOVES = [
    { id: 'lowpass', ctx: 1, kind: 0, cls: 1, mask: PA },
    { id: 'through', ctx: 1, kind: 0, cls: 2, mask: PY },
    { id: 'long', ctx: 1, kind: 0, cls: 3, mask: PB },
    { id: 'shoot', ctx: 1, kind: 1, cls: 4, mask: PX },
    { id: 'curve', ctx: 1, kind: 1, cls: 4, mask: PZR | PX },
    { id: 'chip', ctx: 1, kind: 1, cls: 4, mask: PL | PX },
    { id: 'onetwo', ctx: 1, kind: 0, cls: 1, mask: PL | PA },
    { id: 'tackle', ctx: 2, kind: 0, cls: 1, mask: PB },
    { id: 'slide', ctx: 2, kind: 0, cls: 1, mask: PX },
    { id: 'press', ctx: 2, kind: 2, cls: 2, mask: PA },
    { id: 'teampress', ctx: 2, kind: 2, cls: 3, mask: PY },
    { id: 'switch', ctx: 2, kind: 0, cls: 1, mask: PL }
  ];
  var DEF = [];
  for (var i = 0; i < MOVES.length; i++) DEF.push(MOVES[i].mask);
  var DEF_SPRINT = PR;

  var sprintMask = DEF_SPRINT;
  var DEF_CLAP = PDU;           // checkoAI's clap (the trainer's profile only): D-pad up
  var DEF_PUNISH = PDD;         // checkoAI's punishment ("that was bad"): D-pad down
  var clapMask = DEF_CLAP, punishMask = DEF_PUNISH;
  var relevant = 0;

  function recompute() {
    relevant = 0;
    for (var k = 0; k < MOVES.length; k++) relevant |= MOVES[k].mask;
  }
  recompute();

  function okMask(v) { return typeof v === 'number' && v >= 8 && v <= ALL && v === Math.floor(v); }

  var B = {
    MOVES: MOVES,
    index: function (id) {
      for (var k = 0; k < MOVES.length; k++) if (MOVES[k].id === id) return k;
      return -1;
    },
    sprintMask: function () { return sprintMask; },
    clapMask: function () { return clapMask; },
    punishMask: function () { return punishMask; },
    DPAD: DPAD,
    // the clap / punish may not share a button with a move, sprint or each other (they must never play anything)
    setClap: function (mask) {
      if (!mask || (mask & relevant) || (mask & sprintMask) || mask === punishMask) return false;
      clapMask = mask;
      return true;
    },
    setPunish: function (mask) {
      if (!mask || (mask & relevant) || (mask & sprintMask) || mask === clapMask) return false;
      punishMask = mask;
      return true;
    },
    // true while the sprint button (or all buttons of a sprint combination) is held
    sprintDown: function (cur) { return sprintMask !== 0 && (cur & sprintMask) === sprintMask; },
    // Buttons that take part in any move: other buttons (plain sprint) are ignored by the move engine.
    relevant: function () { return relevant; },

    // true when a bigger combination than `mask` exists (so a short wait for a second button is needed)
    needsSettle: function (mask) {
      for (var k = 0; k < MOVES.length; k++) {
        var m = MOVES[k].mask;
        if (m !== mask && (m & mask) === mask) return true;
      }
      return false;
    },

    // Move bound to the held buttons `mask` in context `ctx` (the biggest combination that is fully held), or -1.
    // The hold time never changes which move it is. No allocation.
    resolve: function (ctx, mask) {
      var bi = -1, bestPop = 0, k, m, pc;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx !== ctx || !m.mask || (m.mask & ~mask) !== 0) continue;
        pc = pop(m.mask);
        if (pc > bestPop) { bestPop = pc; bi = k; }
      }
      return bi;
    },

    // Binds a move; any other move of the same context on the same buttons is unbound. Returns that move's index or -1.
    set: function (idx, mask) {
      var m = MOVES[idx];
      var cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        var o = MOVES[k];
        if (k !== idx && o.ctx === m.ctx && o.mask === mask) { o.mask = 0; cleared = k; }
      }
      m.mask = mask;
      recompute();
      return cleared;
    },
    clear: function (idx) { MOVES[idx].mask = 0; recompute(); },
    setSprint: function (mask) { if (mask) sprintMask = mask; },
    reset: function () {
      for (var k = 0; k < MOVES.length; k++) MOVES[k].mask = DEF[k];
      sprintMask = DEF_SPRINT;
      clapMask = DEF_CLAP;
      punishMask = DEF_PUNISH;
      recompute();
    },

    // Saved form: { v: 3, s: sprint, m: { id: mask } }
    serialize: function () {
      var out = { v: SAVE_VERSION, s: sprintMask, c: clapMask, p: punishMask, m: {} };
      for (var k = 0; k < MOVES.length; k++) out.m[MOVES[k].id] = MOVES[k].mask;
      return out;
    },
    load: function (saved) {
      this.reset();
      if (!saved || typeof saved !== 'object' || !saved.m || typeof saved.m !== 'object') return;
      var k, v;
      if (saved.v === SAVE_VERSION) {
        if (okMask(saved.s)) sprintMask = saved.s;
        // (ZL was the clap before the D-pad could be mapped: it moves to D-pad up)
        if (okMask(saved.c) && saved.c !== PZL) clapMask = saved.c;
        if (okMask(saved.p) && saved.p !== clapMask) punishMask = saved.p;
        for (k = 0; k < MOVES.length; k++) {
          v = saved.m[MOVES[k].id];
          if (v === 0 || okMask(v)) MOVES[k].mask = v;
        }
      } else if (saved.v === 2) {
        // the gamepad side of the previous version is the map now
        if (okMask(saved.ps)) sprintMask = saved.ps;
        for (k = 0; k < MOVES.length; k++) {
          v = saved.m[MOVES[k].id];
          if (v && v.length >= 2 && (v[1] === 0 || okMask(v[1]))) MOVES[k].mask = v[1];
        }
      }
      recompute();
    },

    // Readable name of a button combination ("A", "L + X", "LB + ✕"...)
    maskLabel: function (mask) {
      if (!mask) return NS.I18n.t('map.unbound');
      var out = '';
      for (var k = 0; k < BIT_INDEX.length; k++) {
        if (mask & BIT_INDEX[k][0]) out += (out ? ' + ' : '') + padName(BIT_INDEX[k][1]);
      }
      return out;
    },
    bindingLabel: function (idx) { return this.maskLabel(MOVES[idx].mask); }
  };
  NS.Bindings = B;
})(window.RS6 = window.RS6 || {});
