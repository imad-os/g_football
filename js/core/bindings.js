/* Button maps: one for the game controllers (every controller and phone controller: the standard button positions A B X Y,
 * L R, ZL ZR, L3 R3, shown with the controller's own names) and one for the keyboard / TV remote, which My PC gives only
 * two keys to play with: Enter / Space (bit KA) and Shift (bit KX); a second keyboard player has F and G for them. A
 * binding is a button or a two-button combination. There are no tap / hold gestures: the buttons alone decide the move,
 * holding only changes how it is played.
 * MOVES[k].mask is the controller map (checkoAI plays with it too), the keyboard's is kept apart; use(n) picks the map
 * the move engine reads (js/game/match.js sets it before each player's controls: his device's kind, and back after).
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

  var SAVE_VERSION = 5; // v5: controllers + keyboard; v4 (a map per player) / v3 (one map): the controllers' map; v2: its pad side
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
    { id: 'switch', ctx: 2, kind: 0, cls: 1, mask: PL },
    // (last on purpose: checkoAI's button head has one slot per move above; this one is for humans only)
    { id: 'lobthrough', ctx: 1, kind: 0, cls: 2, mask: PL | PY }
  ];
  var DEF = [];
  for (var i = 0; i < MOVES.length; i++) DEF.push(MOVES[i].mask);
  var DEF_SPRINT = PR;
  // the keyboard: its two keys and both together (no sprint key by default: a double tap of an arrow is the burst)
  var KA = PA, KX = PX;
  var DEFK = { lowpass: KA, long: KA | KX, shoot: KX, tackle: KX, slide: KA | KX, press: KA };
  var DEF2 = [];
  for (i = 0; i < MOVES.length; i++) DEF2.push(DEFK[MOVES[i].id] || 0);

  var sprint = [DEF_SPRINT, 0];            // controllers, keyboard
  var m2 = DEF2.slice();                   // the keyboard's moves (the controllers' are MOVES[k].mask)
  var cur = 0;                             // the map the move engine reads now
  var DEF_CLAP = PDU;           // checkoAI's clap (the trainer's profile only): D-pad up
  var DEF_PUNISH = PDD;         // checkoAI's punishment ("that was bad"): D-pad down
  var clapMask = DEF_CLAP, punishMask = DEF_PUNISH;
  var rel = [0, 0];

  function maskOf(k, p) { return p === 1 ? m2[k] : MOVES[k].mask; }
  function setMask(k, p, v) { if (p === 1) m2[k] = v; else MOVES[k].mask = v; }
  function pl(p) { return p === 1 ? 1 : (p === 0 ? 0 : cur); } // (no player given: the one in use)
  function recompute() {
    rel[0] = rel[1] = 0;
    for (var k = 0; k < MOVES.length; k++) { rel[0] |= MOVES[k].mask; rel[1] |= m2[k]; }
  }
  recompute();

  function okMask(v) { return typeof v === 'number' && v >= 8 && v <= ALL && v === Math.floor(v); }

  var B = {
    MOVES: MOVES,
    index: function (id) {
      for (var k = 0; k < MOVES.length; k++) if (MOVES[k].id === id) return k;
      return -1;
    },
    // the map the move engine reads from now on (0 = P1, also checkoAI's; 1 = P2)
    use: function (n) { cur = n === 1 ? 1 : 0; },
    // (p: the player; none = the map in use)
    sprintMask: function (p) { return sprint[pl(p)]; },
    clapMask: function () { return clapMask; },
    punishMask: function () { return punishMask; },
    DPAD: DPAD,
    // the clap / punish may not share a button with a move, sprint or each other (they must never play anything)
    setClap: function (mask) {
      if (!mask || (mask & (rel[0] | rel[1])) || (mask & (sprint[0] | sprint[1])) || mask === punishMask) return false;
      clapMask = mask;
      return true;
    },
    setPunish: function (mask) {
      if (!mask || (mask & (rel[0] | rel[1])) || (mask & (sprint[0] | sprint[1])) || mask === clapMask) return false;
      punishMask = mask;
      return true;
    },
    // true while the sprint button (or all buttons of a sprint combination) is held
    sprintDown: function (held) { var s = sprint[cur]; return s !== 0 && (held & s) === s; },
    // Buttons that take part in any move: other buttons (plain sprint) are ignored by the move engine.
    relevant: function () { return rel[cur]; },

    // true when a bigger combination than `mask` exists (so a short wait for a second button is needed)
    needsSettle: function (mask) {
      for (var k = 0; k < MOVES.length; k++) {
        var m = maskOf(k, cur);
        if (m !== mask && (m & mask) === mask) return true;
      }
      return false;
    },

    // Move bound to the held buttons `mask` in context `ctx` (the biggest combination that is fully held), or -1.
    // The hold time never changes which move it is. No allocation.
    resolve: function (ctx, mask) {
      var bi = -1, bestPop = 0, k, m, pc;
      for (k = 0; k < MOVES.length; k++) {
        m = maskOf(k, cur);
        if (MOVES[k].ctx !== ctx || !m || (m & ~mask) !== 0) continue;
        pc = pop(m);
        if (pc > bestPop) { bestPop = pc; bi = k; }
      }
      return bi;
    },

    // Binds a move of player p's map; any other move of the same context on the same buttons is unbound. Returns that
    // move's index or -1.
    set: function (idx, mask, p) {
      p = p === 1 ? 1 : 0;
      var cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        if (k !== idx && MOVES[k].ctx === MOVES[idx].ctx && maskOf(k, p) === mask) { setMask(k, p, 0); cleared = k; }
      }
      setMask(idx, p, mask);
      recompute();
      return cleared;
    },
    clear: function (idx, p) { setMask(idx, p === 1 ? 1 : 0, 0); recompute(); },
    setSprint: function (mask, p) { if (mask) sprint[p === 1 ? 1 : 0] = mask; },
    // p: one map back to the defaults (0 controllers, 1 keyboard); none: both (and the clap / punishment)
    reset: function (p) {
      for (var k = 0; k < MOVES.length; k++) {
        if (p !== 1) MOVES[k].mask = DEF[k];
        if (p !== 0) m2[k] = DEF2[k];
      }
      if (p !== 1) sprint[0] = DEF_SPRINT;
      if (p !== 0) sprint[1] = 0;
      if (p === undefined) { clapMask = DEF_CLAP; punishMask = DEF_PUNISH; }
      recompute();
    },

    // Saved form: { v: 5, s / s2: sprint, c, p, m / m2: { id: mask } } (controllers / keyboard)
    serialize: function () {
      var out = { v: SAVE_VERSION, s: sprint[0], s2: sprint[1], c: clapMask, p: punishMask, m: {}, m2: {} };
      for (var k = 0; k < MOVES.length; k++) { out.m[MOVES[k].id] = MOVES[k].mask; out.m2[MOVES[k].id] = m2[k]; }
      return out;
    },
    load: function (saved) {
      this.reset();
      if (!saved || typeof saved !== 'object' || !saved.m || typeof saved.m !== 'object') return;
      var k, v;
      if (saved.v === SAVE_VERSION || saved.v === 4 || saved.v === 3) {
        if (okMask(saved.s)) sprint[0] = saved.s;
        // (ZL was the clap before the D-pad could be mapped: it moves to D-pad up)
        if (okMask(saved.c) && saved.c !== PZL) clapMask = saved.c;
        if (okMask(saved.p) && saved.p !== clapMask) punishMask = saved.p;
        for (k = 0; k < MOVES.length; k++) {
          v = saved.m[MOVES[k].id];
          if (v === 0 || okMask(v)) MOVES[k].mask = v;
        }
        // the keyboard's own map (v5 only; before it there was none: its defaults)
        var o2 = saved.v === SAVE_VERSION && saved.m2 && typeof saved.m2 === 'object' ? saved.m2 : null;
        if (o2) {
          sprint[1] = saved.s2 === 0 || okMask(saved.s2) ? saved.s2 : 0;
          for (k = 0; k < MOVES.length; k++) { v = o2[MOVES[k].id]; m2[k] = v === 0 || okMask(v) ? v : DEF2[k]; }
        }
      } else if (saved.v === 2) {
        // the gamepad side of the previous version is the map now
        if (okMask(saved.ps)) sprint[0] = saved.ps;
        for (k = 0; k < MOVES.length; k++) {
          v = saved.m[MOVES[k].id];
          if (v && v.length >= 2 && (v[1] === 0 || okMask(v[1]))) MOVES[k].mask = v[1];
        }
      }
      recompute();
    },

    // Readable name of a button combination ("A", "L + X", "LB + ✕"...; the keyboard's: "Enter", "Enter + Shift")
    maskLabel: function (mask, p) {
      if (!mask) return NS.I18n.t('map.unbound');
      var out = '';
      if (p === 1) {
        if (mask & KA) out = NS.I18n.t('key.a');
        if (mask & KX) out += (out ? ' + ' : '') + NS.I18n.t('key.x');
        return out || NS.I18n.t('map.unbound');
      }
      for (var k = 0; k < BIT_INDEX.length; k++) {
        if (mask & BIT_INDEX[k][0]) out += (out ? ' + ' : '') + padName(BIT_INDEX[k][1]);
      }
      return out;
    },
    KEYS: KA | KX,
    bindingLabel: function (idx, p) { return this.maskLabel(maskOf(idx, p === 1 ? 1 : 0), p === 1 ? 1 : 0); },
    maskOf: function (idx, p) { return maskOf(idx, p === 1 ? 1 : 0); }
  };
  NS.Bindings = B;
})(window.RS6 = window.RS6 || {});
