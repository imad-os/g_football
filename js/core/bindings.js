/* Button maps: one for the game controllers (every controller and phone controller: the standard button positions A B X Y,
 * L R, ZL ZR, L3 R3, shown with the controller's own names) and one for the keyboard, any key (read directly by
 * js/core/keyboard.js, not through My PC's few actions). A binding is a button / key or a combination of two. There are no tap / hold gestures: the buttons alone decide the move,
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

  var SAVE_VERSION = 7; // v7: controllers + keyboard keys; v6..v3: the controllers' map (keyboard: the defaults); v2: its pad side
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
  // The keyboard (read directly, js/core/keyboard.js): each move is one key or two together, by KeyboardEvent.code; the
  // arrows move the player, Esc / Backspace open the menu. The keys in use get a bit each (KEY_BITS, in the order they
  // are met) so the move engine reads the keyboard like a controller: m2 / sprint[1] are those bits.
  // (keys My PC lets through to a game in its frame: W A S D F G, Enter (Space, Z), Shift (X); js/core/keyboard.js)
  var DEFK = { lowpass: ['KeyS'], through: ['KeyW'], long: ['KeyA'], shoot: ['KeyD'], curve: ['KeyF'], chip: ['KeyG'],
    tackle: ['KeyA'], slide: ['KeyD'], press: ['KeyS'], teampress: ['KeyW'], switch: ['KeyG'] };
  var DEFK_SPRINT = ['ShiftLeft'];
  var KEY_BITS = [PA, PB, PX, PY, PL, PR, PZL, PZR, PL3, PR3, PDU, PDD, PDL, PDR];
  var NOT_MAPPABLE = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Escape: 1, Backspace: 1, Tab: 1 };
  var kc = [], kSprint = DEFK_SPRINT.slice(); // each move's keys, the sprint's
  for (i = 0; i < MOVES.length; i++) kc.push((DEFK[MOVES[i].id] || []).slice());
  var keyBit = {}, bitKey = {};

  var sprint = [DEF_SPRINT, 0];            // controllers, keyboard
  var m2 = [];                             // the keyboard's moves as bits (the controllers' are MOVES[k].mask)
  function keysMask(codes) { var m = 0; for (var j = 0; j < codes.length; j++) m |= keyBit[codes[j]] || 0; return m; }
  // the keys in use -> bits, and the keyboard's moves / sprint as bits
  function rebuildKeys() {
    keyBit = {}; bitKey = {};
    var n = 0;
    function take(codes) {
      for (var j = 0; j < codes.length; j++) {
        if (keyBit[codes[j]] || n >= KEY_BITS.length) continue;
        keyBit[codes[j]] = KEY_BITS[n]; bitKey[KEY_BITS[n]] = codes[j]; n++;
      }
    }
    take(kSprint);
    for (var k = 0; k < MOVES.length; k++) take(kc[k]);
    sprint[1] = keysMask(kSprint);
    for (k = 0; k < MOVES.length; k++) m2[k] = keysMask(kc[k]);
  }
  rebuildKeys();
  // a key's name on screen ('KeyS' -> 'S', 'ShiftLeft' -> 'Shift'...)
  function keyName(code) {
    if (!code) return '';
    var m = /^Key([A-Z])$/.exec(code) || /^Digit(\d)$/.exec(code);
    if (m) return m[1];
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    var names = { ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Ctrl', ControlRight: 'Ctrl R', AltLeft: 'Alt',
      AltRight: 'Alt R', Space: 'Space', Enter: 'Enter', CapsLock: 'Caps', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.',
      Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`' };
    return names[code] || code;
  }
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
    clear: function (idx, p) {
      if (p === 1) { kc[idx] = []; rebuildKeys(); } else setMask(idx, 0, 0);
      recompute();
    },
    setSprint: function (mask, p) { if (mask) sprint[p === 1 ? 1 : 0] = mask; },

    // the keyboard: a move on these keys (one or two KeyboardEvent.code); any other move of the same context on the
    // same keys is unbound (returns it, or -1). false: a key that cannot be mapped (arrows, Esc, Backspace, Tab).
    setKeys: function (idx, codes) {
      for (var j = 0; j < codes.length; j++) if (NOT_MAPPABLE[codes[j]]) return false;
      var key = codes.slice().sort().join('+'), cleared = -1;
      for (var k = 0; k < MOVES.length; k++) {
        if (k !== idx && MOVES[k].ctx === MOVES[idx].ctx && kc[k].slice().sort().join('+') === key) { kc[k] = []; cleared = k; }
      }
      kc[idx] = codes.slice(0, 2);
      rebuildKeys();
      recompute();
      return cleared;
    },
    setSprintKeys: function (codes) {
      for (var j = 0; j < codes.length; j++) if (NOT_MAPPABLE[codes[j]]) return false;
      kSprint = codes.slice(0, 2);
      rebuildKeys();
      return true;
    },
    // the bit a key presses in the keyboard map (0: no move uses it)
    keyBit: function (code) { return keyBit[code] || 0; },
    mappable: function (code) { return !!code && !NOT_MAPPABLE[code]; },
    keyName: keyName,

    // p: one map back to the defaults (0 controllers, 1 keyboard); none: both (and the clap / punishment)
    reset: function (p) {
      for (var k = 0; k < MOVES.length; k++) {
        if (p !== 1) MOVES[k].mask = DEF[k];
        if (p !== 0) kc[k] = (DEFK[MOVES[k].id] || []).slice();
      }
      if (p !== 1) sprint[0] = DEF_SPRINT;
      if (p !== 0) { kSprint = DEFK_SPRINT.slice(); rebuildKeys(); }
      if (p === undefined) { clapMask = DEF_CLAP; punishMask = DEF_PUNISH; }
      recompute();
    },

    // Saved form: { v: 6, s: sprint, c, p, m: { id: mask } (controllers), ks: sprint keys, k: { id: [codes] } (keyboard) }
    serialize: function () {
      var out = { v: SAVE_VERSION, s: sprint[0], c: clapMask, p: punishMask, m: {}, ks: kSprint.slice(), k: {} };
      for (var j = 0; j < MOVES.length; j++) { out.m[MOVES[j].id] = MOVES[j].mask; out.k[MOVES[j].id] = kc[j].slice(); }
      return out;
    },
    load: function (saved) {
      this.reset();
      if (!saved || typeof saved !== 'object' || !saved.m || typeof saved.m !== 'object') return;
      var k, v;
      if (saved.v >= 3 && saved.v <= SAVE_VERSION) {
        if (okMask(saved.s)) sprint[0] = saved.s;
        // (ZL was the clap before the D-pad could be mapped: it moves to D-pad up)
        if (okMask(saved.c) && saved.c !== PZL) clapMask = saved.c;
        if (okMask(saved.p) && saved.p !== clapMask) punishMask = saved.p;
        for (k = 0; k < MOVES.length; k++) {
          v = saved.m[MOVES[k].id];
          if (v === 0 || okMask(v)) MOVES[k].mask = v;
        }
        // the keyboard's keys (v7; v6 had defaults My PC does not let through: the new defaults)
        function codes(a) {
          if (!Array.isArray(a)) return null;
          var o = [];
          for (var j = 0; j < a.length && o.length < 2; j++) if (typeof a[j] === 'string' && !NOT_MAPPABLE[a[j]]) o.push(a[j]);
          return o;
        }
        if (saved.v === SAVE_VERSION && saved.k && typeof saved.k === 'object') {
          var ks = codes(saved.ks);
          if (ks) kSprint = ks;
          for (k = 0; k < MOVES.length; k++) { v = codes(saved.k[MOVES[k].id]); if (v) kc[k] = v; }
          rebuildKeys();
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

    // Readable name of a button combination ("A", "L + X", "LB + ✕"...; the keyboard's: "S", "Shift + D")
    maskLabel: function (mask, p) {
      if (!mask) return NS.I18n.t('map.unbound');
      var out = '';
      if (p === 1) {
        for (var b in bitKey) if (mask & +b) out += (out ? ' + ' : '') + keyName(bitKey[b]);
        return out || NS.I18n.t('map.unbound');
      }
      for (var k = 0; k < BIT_INDEX.length; k++) {
        if (mask & BIT_INDEX[k][0]) out += (out ? ' + ' : '') + padName(BIT_INDEX[k][1]);
      }
      return out;
    },
    // a list of keys on screen ("Shift + D")
    keysLabel: function (codes) { return codes && codes.length ? codes.map(keyName).join(' + ') : NS.I18n.t('map.unbound'); },
    bindingLabel: function (idx, p) { return this.maskLabel(maskOf(idx, p === 1 ? 1 : 0), p === 1 ? 1 : 0); },
    maskOf: function (idx, p) { return maskOf(idx, p === 1 ? 1 : 0); }
  };
  NS.Bindings = B;
})(window.RS6 = window.RS6 || {});
