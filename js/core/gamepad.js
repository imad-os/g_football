/* Real game controller buttons (navigator.getGamepads), like the other g_ games (g_rpg js/gamepad.js):
 * every physical button reaches the game by itself, so A B X Y, L R, ZL ZR, L3 R3 can each be mapped.
 * `live` turns true only after a real press was seen here; until then (or when the page cannot see the controller)
 * nothing changes and gamepads keep working through My PC's OK / RUN / CANCEL actions.
 * Start / Select / Home stay My PC's (pause menu). Opened directly in a browser (no My PC), this module also gives the
 * controller its directions and menu buttons, since there is nobody else to read it.
 * Polled once per frame from the main loop; no allocation of our own (the browser's pad list is its own). */
(function (NS) {
  'use strict';

  // W3C standard mapping index -> our button name (same bits as NS.Bindings)
  var RAW = ['a', 'b', 'x', 'y', 'l', 'r', 'zl', 'zr', '', '', 'l3', 'r3'];
  var NAMES = {
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'],
    ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'],
    nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3'],
    generic: ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', 'Select', 'Start', 'L3', 'R3']
  };
  var DEV = ['pad0', 'pad1', 'pad2', 'pad3'];
  var DIRS = ['up', 'down', 'left', 'right'];

  var kind = 'generic';
  var live = false;
  var standalone = false;
  var prev = [[], [], [], []];      // per pad: button index -> pressed
  var prevDir = [[false, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]];

  function kindOf(id) {
    id = String(id || '').toLowerCase();
    if (/xbox|xinput|045e/.test(id)) return 'xbox';
    if (/playstation|dualshock|dualsense|054c/.test(id)) return 'ps';
    if (/nintendo|switch|pro controller|joy-con|057e/.test(id)) return 'nintendo';
    if (/wireless controller/.test(id)) return 'ps';
    return 'generic';
  }

  function list() {
    try { return navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return null; }
  }

  function down(g, i) {
    var b = g.buttons[i];
    return !!(b && (b.pressed || b.value > 0.5));
  }

  function dir(pd, k, on, dev) {
    if (on !== pd[k]) { pd[k] = on; NS.App.input(DIRS[k], on, false, dev); }
  }

  // standalone only: directions (D-pad or left stick) and menu buttons, since no My PC reads the controller
  function standaloneExtras(g, n, dev) {
    var ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    var d0 = down(g, 12) || ay < -0.5, d1 = down(g, 13) || ay > 0.5, d2 = down(g, 14) || ax < -0.5, d3 = down(g, 15) || ax > 0.5;
    var pd = prevDir[n];
    dir(pd, 0, d0, dev);
    dir(pd, 1, d1, dev);
    dir(pd, 2, d2, dev);
    dir(pd, 3, d3, dev);
    var p = prev[n];
    if (down(g, 9) && !p[9]) MyPC.pause();
    p[9] = down(g, 9);
  }

  NS.Gamepad = {
    init: function (isStandalone) { standalone = !!isStandalone; },
    live: function () { return live; },
    kind: function () { return kind; },
    // display name of a standard button index on this controller (L / ZL on Nintendo, LB / LT on Xbox...)
    label: function (index) { return NAMES[kind][index] || ('#' + (index + 1)); },

    poll: function () {
      var pads = list();
      if (!pads) return;
      for (var n = 0; n < pads.length && n < 4; n++) {
        var g = pads[n];
        if (!g || !g.connected) continue;
        var p = prev[n];
        var dev = DEV[n];
        var mapped = g.mapping === 'standard';
        for (var i = 0; i < RAW.length && i < g.buttons.length; i++) {
          if (!RAW[i]) continue;
          var d = down(g, i);
          if (d === !!p[i]) continue;
          p[i] = d;
          if (d && !live) {
            live = true;
            kind = mapped ? kindOf(g.id) : 'generic';
            NS.Input.setRaw(true);
          }
          NS.Input.button(RAW[i], d, dev);
          // standalone: A / B also drive the menus (hosted, My PC sends confirm / cancel itself)
          if (standalone && (i === 0 || i === 1)) NS.App.input(i === 0 ? 'confirm' : 'cancel', d, false, dev);
        }
        if (standalone) standaloneExtras(g, n, dev);
      }
    },

    // after a pause: buttons still held must be released and pressed again to count
    resync: function () {
      var pads = list();
      if (!pads) return;
      for (var n = 0; n < pads.length && n < 4; n++) {
        var g = pads[n];
        if (!g || !g.connected) continue;
        for (var i = 0; i < RAW.length && i < g.buttons.length; i++) prev[n][i] = down(g, i);
      }
    }
  };
})(window.RS6 = window.RS6 || {});
