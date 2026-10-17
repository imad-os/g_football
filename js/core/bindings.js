/* Button map. Every move has TWO bindings:
 *   kb  = TV remote / keyboard / touch / phone (My PC actions: OK = jump, RUN, CANCEL)
 *   pad = gamepad, every physical button (A B X Y, L R, ZL ZR, L3 R3) read directly (js/core/gamepad.js); until a real
 *         press is seen there, a gamepad arrives as My PC's OK / RUN / CANCEL and uses the kb binding.
 * A binding is a button or a two-button combination. There are no tap / hold gestures: every move has its own button,
 * and holding it only changes how the move is played:
 *
 * Moves have a context (1 = with the ball, 2 = without it) and a kind:
 *   0 instant    with the ball: fires on release, a longer hold = more power (passes)
 *                without the ball: fires as soon as it is pressed (tackle, slide, switch)
 *   1 charge     fires on release, power grows with the hold time (shots)
 *   2 continuous active while the button is held (press, team press)
 */
(function (NS) {
  'use strict';

  // kb buttons (from My PC actions)
  var J = 1, R = 2, C = 4;
  // gamepad buttons (raw, by position: a = bottom, b = right, x = left, y = top)
  var PA = 8, PB = 16, PX = 32, PY = 64, PL = 128, PR = 256, PZL = 512, PZR = 1024, PL3 = 2048, PR3 = 4096;
  var KB_MASK = 7;

  NS.BTN = { JUMP: J, RUN: R, CANCEL: C, KB: KB_MASK };
  // raw button name -> bit (unknown layouts: up to 3 extra buttons 'btnN')
  var RAW_BITS = { a: PA, b: PB, x: PX, y: PY, l: PL, r: PR, zl: PZL, zr: PZR, l3: PL3, r3: PR3 };
  var EXTRA = [8192, 16384, 32768];
  var extraNames = {};
  // [bit, kb text key | standard gamepad button index]: gamepad buttons are shown with the controller's own names
  var BIT_LABEL = [[J, 'btn.jump'], [R, 'btn.run'], [C, 'btn.cancel'], [PA, 0], [PB, 1], [PX, 2], [PY, 3], [PL, 4], [PR, 5],
    [PZL, 6], [PZR, 7], [PL3, 10], [PR3, 11]];
  var PAD_FALLBACK = ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', '', '', 'L3', 'R3'];
  function padName(i) { return NS.Gamepad ? NS.Gamepad.label(i) : PAD_FALLBACK[i]; }

  var SAVE_VERSION = 2; // v2: no gesture tiers (older saves are reset to the defaults)

  function pop(m) { var c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

  // cls = colour class of the HUD chip
  // TV / KB side: OK, CANCEL and RUN (RUN alone = sprint; RUN + OK etc. are combinations). With OK alone the game is
  // still playable: pass and tackle. Gamepad side: PES-style, one button per move.
  var MOVES = [
    { id: 'lowpass', ctx: 1, kind: 0, cls: 1, mask: J, pmask: PA },
    { id: 'through', ctx: 1, kind: 0, cls: 2, mask: J | C, pmask: PY },
    { id: 'long', ctx: 1, kind: 0, cls: 3, mask: R | J, pmask: PB },
    { id: 'shoot', ctx: 1, kind: 1, cls: 4, mask: C, pmask: PX },
    { id: 'curve', ctx: 1, kind: 1, cls: 4, mask: 0, pmask: PZR | PX },
    { id: 'chip', ctx: 1, kind: 1, cls: 4, mask: R | J | C, pmask: PL | PX },
    { id: 'onetwo', ctx: 1, kind: 0, cls: 1, mask: 0, pmask: PL | PA },
    { id: 'tackle', ctx: 2, kind: 0, cls: 1, mask: J, pmask: PB },
    { id: 'slide', ctx: 2, kind: 0, cls: 1, mask: J | C, pmask: PX },
    { id: 'press', ctx: 2, kind: 2, cls: 2, mask: R | J, pmask: PA },
    { id: 'teampress', ctx: 2, kind: 2, cls: 3, mask: R | J | C, pmask: PY },
    { id: 'switch', ctx: 2, kind: 0, cls: 1, mask: C, pmask: PL }
  ];
  var DEF = [];
  for (var i = 0; i < MOVES.length; i++) DEF.push([MOVES[i].mask, MOVES[i].pmask]);
  var DEF_SPRINT = R, DEF_PSPRINT = PR;

  var sprintMask = DEF_SPRINT;
  var psprintMask = DEF_PSPRINT;
  var relevant = 0;

  function recompute() {
    relevant = 0;
    for (var k = 0; k < MOVES.length; k++) relevant |= MOVES[k].mask | MOVES[k].pmask;
  }
  recompute();

  var B = {
    MOVES: MOVES,
    isPadMask: function (mask) { return (mask & ~KB_MASK) !== 0; },
    // raw button name -> bit (0 when we run out of bits for an unknown layout)
    bitOf: function (name) {
      if (RAW_BITS[name]) return RAW_BITS[name];
      if (extraNames[name]) return extraNames[name];
      var n = 0;
      for (var k in extraNames) n++;
      if (n >= EXTRA.length) return 0;
      extraNames[name] = EXTRA[n];
      return EXTRA[n];
    },
    index: function (id) {
      for (var k = 0; k < MOVES.length; k++) if (MOVES[k].id === id) return k;
      return -1;
    },
    sprintMask: function (pad) { return pad ? psprintMask : sprintMask; },
    // true while a sprint button (or all buttons of a sprint combination) is held
    sprintDown: function (cur) {
      return (sprintMask !== 0 && (cur & sprintMask) === sprintMask) || (psprintMask !== 0 && (cur & psprintMask) === psprintMask);
    },
    // Buttons that take part in any move: other buttons (plain sprint) are ignored by the gesture engine.
    relevant: function () { return relevant; },

    // true when a bigger combination than `mask` exists (so a short wait for a second button is needed)
    needsSettle: function (mask) {
      for (var k = 0; k < MOVES.length; k++) {
        var m = MOVES[k].mask, pm = MOVES[k].pmask;
        if ((m !== mask && (m & mask) === mask) || (pm !== mask && (pm & mask) === mask)) return true;
      }
      return false;
    },

    // Move bound to the held buttons `mask` in context `ctx` (the biggest combination that is fully held), or -1.
    // The hold time never changes which move it is. No allocation.
    resolve: function (ctx, mask) {
      // a gamepad's B on an older My PC arrives as RUN + CANCEL together while it is held to sprint: not a move
      if (mask === (R | C)) return -1;
      var bi = -1, bestPop = 0, k, m, pc;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx !== ctx) continue;
        if (m.mask && (m.mask & ~mask) === 0) { pc = pop(m.mask); if (pc > bestPop) { bestPop = pc; bi = k; } }
        if (m.pmask && (m.pmask & ~mask) === 0) { pc = pop(m.pmask); if (pc > bestPop) { bestPop = pc; bi = k; } }
      }
      return bi;
    },

    // Binds a move on the kb or the pad side (chosen by the buttons); any other move of the same context bound to the
    // same buttons is unbound. Returns that move's index or -1.
    set: function (idx, mask) {
      var pad = this.isPadMask(mask);
      var m = MOVES[idx];
      var cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        var o = MOVES[k];
        if (k === idx || o.ctx !== m.ctx) continue;
        if (pad) { if (o.pmask === mask) { o.pmask = 0; cleared = k; } }
        else if (o.mask === mask) { o.mask = 0; cleared = k; }
      }
      if (pad) m.pmask = mask; else m.mask = mask;
      recompute();
      return cleared;
    },
    clear: function (idx) { MOVES[idx].mask = 0; MOVES[idx].pmask = 0; recompute(); },
    setSprint: function (mask) {
      if (!mask) return;
      if (this.isPadMask(mask)) psprintMask = mask & ~KB_MASK; else sprintMask = mask & KB_MASK;
    },
    reset: function () {
      for (var k = 0; k < MOVES.length; k++) {
        MOVES[k].mask = DEF[k][0]; MOVES[k].pmask = DEF[k][1];
      }
      sprintMask = DEF_SPRINT;
      psprintMask = DEF_PSPRINT;
      recompute();
    },

    // Saved form: { v: 2, s: kbSprint, ps: padSprint, m: { id: [mask, pmask] } }
    serialize: function () {
      var out = { v: SAVE_VERSION, s: sprintMask, ps: psprintMask, m: {} };
      for (var k = 0; k < MOVES.length; k++) out.m[MOVES[k].id] = [MOVES[k].mask, MOVES[k].pmask];
      return out;
    },
    load: function (saved) {
      this.reset();
      // maps saved with tap / hold gestures put several moves on one button: start again from the defaults
      if (!saved || typeof saved !== 'object' || saved.v !== SAVE_VERSION) return;
      function okMask(v, lo, hi) { return typeof v === 'number' && v >= lo && v <= hi && v === Math.floor(v); }
      if (okMask(saved.s, 1, KB_MASK)) sprintMask = saved.s;
      if (okMask(saved.ps, 8, 65535)) psprintMask = saved.ps;
      if (saved.m && typeof saved.m === 'object') {
        for (var k = 0; k < MOVES.length; k++) {
          var v = saved.m[MOVES[k].id];
          if (!v || !v.length) continue;
          if (okMask(v[0], 0, KB_MASK)) MOVES[k].mask = v[0];
          if (v.length >= 2 && (v[1] === 0 || okMask(v[1], 8, 65535))) MOVES[k].pmask = v[1];
        }
      }
      recompute();
    },

    // Readable name of a button combination ("OK", "OK + CANCEL", "L + X").
    maskLabel: function (mask) {
      var t = NS.I18n.t;
      if (!mask) return t('map.unbound');
      var out = '';
      for (var k = 0; k < BIT_LABEL.length; k++) {
        if (mask & BIT_LABEL[k][0]) out += (out ? ' + ' : '') + (k < 3 ? t(BIT_LABEL[k][1]) : padName(BIT_LABEL[k][1]));
      }
      for (var n in extraNames) if (mask & extraNames[n]) out += (out ? ' + ' : '') + n.toUpperCase();
      return out;
    },
    bindingLabel: function (idx, pad) {
      var m = MOVES[idx];
      var mask = pad ? m.pmask : m.mask;
      return this.maskLabel(mask);
    }
  };
  NS.Bindings = B;
})(window.RS6 = window.RS6 || {});
