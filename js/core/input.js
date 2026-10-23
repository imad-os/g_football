/* Per-player match input, fed only by game controllers (js/core/gamepad.js: physical pads and phone controllers).
 * The TV remote and the keyboard only drive the menus (NS.UI gets My PC's actions directly).
 * pads[n]: x / y = direction (analog stick or D-pad), cur = buttons held (bit mask of NS.Bindings bits),
 * latch = buttons pressed since the last simulation step (a very short press is never lost), burst = a direction was
 * double-tapped (sprint burst). */
(function (NS) {
  'use strict';

  var TAP_WINDOW = 280; // ms between two pushes of one direction = sprint burst

  function makePad() {
    return {
      x: 0, y: 0,
      rx: 0, ry: 0, // the right stick (switch player / knock-on, see js/game/controls.js)
      cur: 0,
      latch: 0,
      ign: 0,    // buttons ignored until released (the press that closed a menu)
      burst: false,
      dir: [false, false, false, false], // left right up down pushed past half way
      dirT: [0, 0, 0, 0]
    };
  }

  var pads = [makePad(), makePad()];
  var blockUntil = 0;

  function edge(p, k, on) {
    if (on && !p.dir[k]) {
      var now = performance.now();
      if (now - p.dirT[k] < TAP_WINDOW) p.burst = true;
      p.dirT[k] = now;
    }
    p.dir[k] = on;
  }

  NS.Input = {
    pads: pads,
    setPlayers: function () {},
    // Ignore buttons pressed in the next `ms` (the press that just closed a menu must not play).
    block: function (ms) { blockUntil = performance.now() + ms; },
    clearEdges: function () {
      for (var i = 0; i < 2; i++) { pads[i].latch = 0; pads[i].burst = false; }
    },
    // player n's direction, -1..1 on each axis (y: down = +)
    direction: function (n, x, y) {
      var p = pads[n];
      p.x = x; p.y = y;
      edge(p, 0, x < -0.6);
      edge(p, 1, x > 0.6);
      edge(p, 2, y < -0.6);
      edge(p, 3, y > 0.6);
    },
    rstick: function (n, x, y) { pads[n].rx = x; pads[n].ry = y; },
    // player n pressed / released a button (bit)
    button: function (n, bit, pressed) {
      var p = pads[n];
      if (pressed) {
        if ((p.cur & bit) || (p.ign & bit)) return;
        if (performance.now() < blockUntil) { p.ign |= bit; return; }
        p.cur |= bit;
        p.latch |= bit;
      } else {
        p.cur &= ~bit;
        p.ign &= ~bit;
      }
      // checkoAI's clap: held = the gauge fills, released = the clap (only the trainer's profile; never a move)
      var cm = NS.Bindings.clapMask();
      if (NS.Aima && cm && (bit & cm)) NS.Aima.clapButton(pressed && (p.cur & cm) === cm);
      var pm = NS.Bindings.punishMask(); // and the punishment ("that was bad")
      if (NS.Aima && pm && (bit & pm)) NS.Aima.punishButton(pressed && (p.cur & pm) === pm);
    },
    releaseAll: function () {
      for (var i = 0; i < 2; i++) {
        var p = pads[i];
        p.x = 0; p.y = 0; p.rx = 0; p.ry = 0; p.cur = 0; p.latch = 0; p.ign = 0; p.burst = false;
        p.dir[0] = p.dir[1] = p.dir[2] = p.dir[3] = false;
      }
    }
  };
})(window.RS6 = window.RS6 || {});
