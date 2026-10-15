/* Per-player input state fed ONLY by My PC (MyPC.init onInput). No keydown listeners of our own.
 * Actions: left right up down, jump (OK), run, cancel. Device decides the player: keys2 / pad1.. = player 2. */
(function (NS) {
  'use strict';

  var TAP_WINDOW = 280; // ms between two presses of one direction = sprint burst (dribble burst)

  function makePad() {
    return {
      x: 0, y: 0, l: false, r: false, u: false, d: false,
      ok: false, okValid: false, okDown: false, okUp: false,
      run: false,
      cancelHeld: false, cancelT: 0, cancelUp: false, cancelFired: false,
      burst: false,
      dirT: [0, 0, 0, 0]
    };
  }

  var pads = [makePad(), makePad()];
  var twoPlayers = false;
  var blockUntil = 0; // ms timestamp: OK presses before it are ignored (the press that closed a menu)

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

  function clearEdges() {
    for (var i = 0; i < 2; i++) {
      var p = pads[i];
      p.okDown = false; p.okUp = false; p.cancelUp = false; p.burst = false;
    }
  }

  NS.Input = {
    pads: pads,
    setPlayers: function (n) { twoPlayers = n > 1; },
    block: function (ms) { blockUntil = performance.now() + ms; },
    clearEdges: clearEdges,
    // Called for every My PC input event (also while a menu is open so nothing sticks).
    feed: function (action, pressed, repeat, dev) {
      var p = padOf(dev);
      switch (action) {
        case 'left': setDir(p, 'l', 0, pressed, repeat); break;
        case 'right': setDir(p, 'r', 1, pressed, repeat); break;
        case 'up': setDir(p, 'u', 2, pressed, repeat); break;
        case 'down': setDir(p, 'd', 3, pressed, repeat); break;
        case 'jump':
          if (pressed) {
            if (!p.ok) { p.ok = true; p.okValid = performance.now() >= blockUntil; p.okDown = p.okValid; }
          } else if (p.ok) {
            p.ok = false;
            if (p.okValid) p.okUp = true;
            p.okValid = false;
          }
          break;
        case 'run': p.run = pressed; break;
        case 'cancel':
          if (pressed) {
            if (!p.cancelHeld) { p.cancelHeld = true; p.cancelT = 0; p.cancelFired = false; }
          } else if (p.cancelHeld) {
            p.cancelHeld = false;
            p.cancelUp = true;
          }
          break;
      }
    },
    releaseAll: function () {
      for (var i = 0; i < 2; i++) {
        var p = pads[i];
        p.l = p.r = p.u = p.d = false;
        p.x = 0; p.y = 0; p.ok = false; p.run = false; p.cancelHeld = false;
      }
      clearEdges();
    }
  };
})(window.RS6 = window.RS6 || {});
