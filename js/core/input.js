/* Per-player input state fed ONLY by My PC (MyPC.init onInput). No keydown listeners of our own.
 * Buttons: jump (OK / A / Space / Z), run (B / X / Y / Shift), cancel (B / Backspace / C) as bits 1, 2, 4.
 * Directions: left right up down. The device decides the player: keys2 / pad1.. = player 2.
 * Gamepads: once js/core/gamepad.js sees a real press (navigator.getGamepads), every button has its own bit
 * (A B X Y L R ZL ZR L3 R3) and the gamepad's OK / RUN / CANCEL actions from My PC are ignored here (menus still use them). */
(function (NS) {
  'use strict';

  var TAP_WINDOW = 280; // ms between two presses of one direction = sprint burst

  function makePad() {
    return {
      x: 0, y: 0, l: false, r: false, u: false, d: false,
      cur: 0,    // buttons held now (bit mask)
      latch: 0,  // buttons pressed since the last simulation step (so a very short tap is never lost)
      ign: 0,    // buttons ignored until released (the press that closed a menu)
      menuT: 0,  // how long CANCEL has been held alone
      menuFired: false,
      burst: false,
      dirT: [0, 0, 0, 0]
    };
  }

  var pads = [makePad(), makePad()];
  var twoPlayers = false;
  var blockUntil = 0;
  var BIT = { jump: 1, run: 2, cancel: 4 };
  var rawPads = false; // My PC sends every gamepad button by name

  function padOf(dev) {
    if (twoPlayers && (dev === 'keys2' || dev === 'pad1' || dev === 'pad2' || dev === 'pad3')) return pads[1];
    return pads[0];
  }

  function setDir(p, key, idx, pressed, repeat) {
    if (pressed && !repeat && !p[key]) {
      var now = performance.now();
      if (now - p.dirT[idx] < TAP_WINDOW) p.burst = true;
      p.dirT[idx] = now;
    }
    p[key] = pressed;
    p.x = (p.r ? 1 : 0) - (p.l ? 1 : 0);
    p.y = (p.d ? 1 : 0) - (p.u ? 1 : 0);
  }

  NS.Input = {
    pads: pads,
    setPlayers: function (n) { twoPlayers = n > 1; },
    // Ignore buttons pressed in the next `ms` (the press that just closed a menu must not play).
    block: function (ms) { blockUntil = performance.now() + ms; },
    clearEdges: function () {
      for (var i = 0; i < 2; i++) { pads[i].latch = 0; pads[i].burst = false; }
    },
    // Called for every My PC input event (also while a menu is open so nothing sticks).
    feed: function (action, pressed, repeat, dev) {
      var p = padOf(dev);
      switch (action) {
        case 'left': setDir(p, 'l', 0, pressed, repeat); break;
        case 'right': setDir(p, 'r', 1, pressed, repeat); break;
        case 'up': setDir(p, 'u', 2, pressed, repeat); break;
        case 'down': setDir(p, 'd', 3, pressed, repeat); break;
        case 'jump':
        case 'run':
        case 'cancel': {
          if (rawPads && dev && dev.charAt(0) === 'p') break; // the raw buttons of this pad are used instead
          var bit = BIT[action];
          if (pressed) {
            if (repeat || (p.cur & bit) || (p.ign & bit)) break;
            if (performance.now() < blockUntil) { p.ign |= bit; break; }
            p.cur |= bit;
            p.latch |= bit;
            if (NS.Mapper && NS.Mapper.active()) NS.Mapper.button(bit, true);
          } else {
            p.cur &= ~bit;
            p.ign &= ~bit;
            if (NS.Mapper && NS.Mapper.active()) NS.Mapper.button(bit, false);
          }
          break;
        }
      }
    },
    setRaw: function (on) { rawPads = !!on; },
    rawEnabled: function () { return rawPads; },
    // A physical gamepad button (js/core/gamepad.js): same press / release handling as the actions above.
    button: function (name, pressed, dev) {
      if (!rawPads) {
        rawPads = true;
        for (var i = 0; i < 2; i++) pads[i].cur &= ~NS.BTN.KB; // a gamepad OK / RUN / CANCEL seen before must not stay held
      }
      var bit = NS.Bindings.bitOf(name);
      if (!bit) return;
      var p = padOf(dev);
      if (pressed) {
        if ((p.cur & bit) || (p.ign & bit)) return;
        if (performance.now() < blockUntil) { p.ign |= bit; return; }
        p.cur |= bit;
        p.latch |= bit;
        if (NS.Mapper && NS.Mapper.active()) NS.Mapper.button(bit, true);
      } else {
        p.cur &= ~bit;
        p.ign &= ~bit;
        if (NS.Mapper && NS.Mapper.active()) NS.Mapper.button(bit, false);
      }
    },
    releaseAll: function () {
      for (var i = 0; i < 2; i++) {
        var p = pads[i];
        p.l = p.r = p.u = p.d = false;
        p.x = 0; p.y = 0; p.cur = 0; p.latch = 0; p.ign = 0; p.menuT = 0; p.menuFired = false; p.burst = false;
      }
    }
  };
})(window.RS6 = window.RS6 || {});
