/* Button map. Every move has TWO bindings:
 *   kb  = TV remote / keyboard / touch / phone (My PC actions: OK = jump, RUN, CANCEL)
 *   pad = gamepad, every physical button (A B X Y, L R, ZL ZR, L3 R3) read directly (js/core/gamepad.js); until a real
 *         press is seen there, a gamepad arrives as My PC's OK / RUN / CANCEL and uses the kb binding.
 * A binding is a button or a two-button combination plus a gesture: tap / hold / hold+ / long hold.
 *
 * Moves have a context (1 = with the ball, 2 = without it) and a kind:
 *   0 instant    fires on release (with the ball) or as soon as its gesture is reached (without it)
 *   1 charge     fires on release, power grows with the hold time (shots)
 *   2 continuous active while the button is held (press)
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

  var TH = [0, 0.16, 0.36, 0.58]; // hold time (s) where each gesture tier starts

  function pop(m) { var c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

  // cls = colour class of the HUD chip
  var MOVES = [
    { id: 'lowpass', ctx: 1, kind: 0, cls: 1, mask: J, tier: 0, pmask: PA, ptier: 0 },
    { id: 'through', ctx: 1, kind: 0, cls: 2, mask: J, tier: 1, pmask: PY, ptier: 0 },
    { id: 'long', ctx: 1, kind: 0, cls: 3, mask: J, tier: 2, pmask: PB, ptier: 0 },
    { id: 'shoot', ctx: 1, kind: 1, cls: 4, mask: J, tier: 3, pmask: PX, ptier: 0 },
    { id: 'curve', ctx: 1, kind: 1, cls: 4, mask: J | C, tier: 0, pmask: PZR | PX, ptier: 0 },
    { id: 'chip', ctx: 1, kind: 1, cls: 4, mask: J | C, tier: 3, pmask: PL | PX, ptier: 0 },
    { id: 'onetwo', ctx: 1, kind: 0, cls: 1, mask: C, tier: 0, pmask: PL | PA, ptier: 0 },
    { id: 'tackle', ctx: 2, kind: 0, cls: 1, mask: J, tier: 0, pmask: PB, ptier: 0 },
    { id: 'slide', ctx: 2, kind: 0, cls: 1, mask: J | C, tier: 0, pmask: PX, ptier: 0 },
    { id: 'press', ctx: 2, kind: 2, cls: 2, mask: J, tier: 1, pmask: PA, ptier: 0 },
    { id: 'teampress', ctx: 2, kind: 2, cls: 3, mask: J, tier: 3, pmask: PY, ptier: 0 },
    { id: 'switch', ctx: 2, kind: 0, cls: 1, mask: C, tier: 0, pmask: PL, ptier: 0 }
  ];
  var DEF = [];
  for (var i = 0; i < MOVES.length; i++) DEF.push([MOVES[i].mask, MOVES[i].tier, MOVES[i].pmask, MOVES[i].ptier]);
  var DEF_SPRINT = R, DEF_PSPRINT = PR;

  var sprintMask = DEF_SPRINT;
  var psprintMask = DEF_PSPRINT;
  var relevant = 0;

  function recompute() {
    relevant = 0;
    for (var k = 0; k < MOVES.length; k++) relevant |= MOVES[k].mask | MOVES[k].pmask;
  }
  recompute();

  function tierOf(d) { return d >= TH[3] ? 3 : (d >= TH[2] ? 2 : (d >= TH[1] ? 1 : 0)); }

  var B = {
    MOVES: MOVES,
    TH: TH,
    tierOf: tierOf,
    lastTier: 0,       // gesture tier of the binding the last resolve() matched (shot power starts there)
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

    // Move for the held `mask` after holding `d` seconds in context `ctx`, or -1. No allocation.
    resolve: function (ctx, mask, d) {
      var bestPop = 0, bestMask = 0, k, m, pc;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx !== ctx) continue;
        if (m.mask && (m.mask & ~mask) === 0) { pc = pop(m.mask); if (pc > bestPop) { bestPop = pc; bestMask = m.mask; } }
        if (m.pmask && (m.pmask & ~mask) === 0) { pc = pop(m.pmask); if (pc > bestPop) { bestPop = pc; bestMask = m.pmask; } }
      }
      if (!bestPop) return -1;
      var tier = tierOf(d);
      var bi = -1, bt = -1;
      for (k = 0; k < MOVES.length; k++) {
        m = MOVES[k];
        if (m.ctx !== ctx) continue;
        if (m.mask === bestMask && m.tier <= tier && m.tier > bt) { bi = k; bt = m.tier; }
        if (m.pmask === bestMask && m.ptier <= tier && m.ptier > bt) { bi = k; bt = m.ptier; }
      }
      if (bi < 0) return -1;
      this.lastTier = bt;
      // remote / keyboard side: an instant move only fires inside its own gesture window, so a long press of a button
      // (gamepad B on an older My PC = RUN + CANCEL, held to sprint) never turns into a tap move on release
      if ((bestMask & ~KB_MASK) === 0 && MOVES[bi].kind === 0 && bt < 3 && d >= TH[bt + 1]) return -1;
      return bi;
    },

    // Binds a move on the kb or the pad side (chosen by the buttons); any other move of the same context bound to the
    // same buttons + gesture is unbound. Returns that move's index or -1.
    set: function (idx, mask, tier) {
      var pad = this.isPadMask(mask);
      var m = MOVES[idx];
      var cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        var o = MOVES[k];
        if (k === idx || o.ctx !== m.ctx) continue;
        if (pad) { if (o.pmask === mask && o.ptier === tier) { o.pmask = 0; cleared = k; } }
        else if (o.mask === mask && o.tier === tier) { o.mask = 0; cleared = k; }
      }
      if (pad) { m.pmask = mask; m.ptier = tier; } else { m.mask = mask; m.tier = tier; }
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
        MOVES[k].mask = DEF[k][0]; MOVES[k].tier = DEF[k][1]; MOVES[k].pmask = DEF[k][2]; MOVES[k].ptier = DEF[k][3];
      }
      sprintMask = DEF_SPRINT;
      psprintMask = DEF_PSPRINT;
      recompute();
    },

    // Saved form: { s: kbSprint, ps: padSprint, m: { id: [mask, tier, pmask, ptier] } } (old saves have no pad part)
    serialize: function () {
      var out = { s: sprintMask, ps: psprintMask, m: {} };
      for (var k = 0; k < MOVES.length; k++) out.m[MOVES[k].id] = [MOVES[k].mask, MOVES[k].tier, MOVES[k].pmask, MOVES[k].ptier];
      return out;
    },
    load: function (saved) {
      this.reset();
      if (!saved || typeof saved !== 'object') return;
      function okMask(v, lo, hi) { return typeof v === 'number' && v >= lo && v <= hi && v === Math.floor(v); }
      if (okMask(saved.s, 1, KB_MASK)) sprintMask = saved.s;
      if (okMask(saved.ps, 8, 65535)) psprintMask = saved.ps;
      if (saved.m && typeof saved.m === 'object') {
        for (var k = 0; k < MOVES.length; k++) {
          var v = saved.m[MOVES[k].id];
          if (!v || !v.length) continue;
          if (okMask(v[0], 0, KB_MASK) && okMask(v[1], 0, 3)) { MOVES[k].mask = v[0]; MOVES[k].tier = v[1]; }
          if (v.length >= 4 && (v[2] === 0 || okMask(v[2], 8, 65535)) && okMask(v[3], 0, 3)) { MOVES[k].pmask = v[2]; MOVES[k].ptier = v[3]; }
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
      if (!mask) return NS.I18n.t('map.unbound');
      return this.maskLabel(mask) + ' • ' + NS.I18n.t('tier.' + (pad ? m.ptier : m.tier));
    }
  };
  NS.Bindings = B;
})(window.RS6 = window.RS6 || {});
