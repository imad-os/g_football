/* Game controllers: the only way to play a match. Physical gamepads and phone controllers (a phone in Buttons mode is a
 * standard gamepad for My PC, device pad101 / pad102) are read through MyPC.gamepad (API level 9): every button by its
 * standard index, both sticks, the list of connected pads. The game never calls navigator.getGamepads() itself (the SDK
 * does, standalone too). Menus keep using My PC's actions (onInput), which every controller also sends.
 *
 * Player 1 is the first connected controller, player 2 the second (pads, then phones, in My PC's order).
 * A phone or tablet running the game itself has no controller: My PC's own touch pad only sends menu actions, so during
 * a match the game asks My PC for a pad of its own (MyPC.pad): the same eight buttons as a controller (Nintendo names and
 * places) and the stick as four directions, feeding player 1 like a real pad (touchPad, called by the menu).
 * Event-driven (no polling); the handlers only update numbers, no allocation of our own.
 */
(function (NS) {
  'use strict';

  // standard button index -> our button bit (the same bits as NS.Bindings); 0 = not a move button
  var BIT = [8, 16, 32, 64, 128, 256, 512, 1024, 0, 0, 2048, 4096];
  // display names of the standard indices on each family of controller (Switch: by position, B is the bottom button)
  var NAMES = {
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'],
    ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'],
    nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3'],
    generic: ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', 'Select', 'Start', 'L3', 'R3']
  };
  var DPAD_NAMES = ['D-pad \u2191', 'D-pad \u2193', 'D-pad \u2190', 'D-pad \u2192'];
  var DPAD_BIT = [8192, 16384, 32768, 65536]; // up down left right (NS.Bindings)
  var DEAD = 0.22; // stick dead zone
  // the touch pad: [action, label, standard button index, place] (Nintendo: A right, B bottom, X top, Y left)
  var TOUCH = [['b0', 'B', 0, 'bottom'], ['b1', 'A', 1, 'right'], ['b2', 'Y', 2, 'left'], ['b3', 'X', 3, 'top'],
    ['b4', 'L', 4], ['b5', 'R', 5], ['b6', 'ZL', 6], ['b7', 'ZR', 7]];
  var TOUCH_DIR = { up: 0, down: 1, left: 2, right: 3 };
  var touchOn = false;
  function touchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  var order = [];        // connected devices in player order ('pad0', 'pad101'...)
  var kind = 'generic';
  var dpad = [[0, 0, 0, 0], [0, 0, 0, 0]]; // per player: up down left right held
  var stick = [[0, 0], [0, 0]];
  var side = [0, 0];     // per player: stick / D-pad held left (-1), right (1) or neither (the sides screen)

  function kindOf(name) {
    var id = String(name || '').toLowerCase();
    if (/xbox|xinput|045e/.test(id)) return 'xbox';
    if (/playstation|dualshock|dualsense|054c|wireless controller/.test(id)) return 'ps';
    if (/nintendo|switch|pro controller|joy-con|057e/.test(id)) return 'nintendo';
    return 'generic';
  }

  // 0 = player 1, 1 = player 2, -1 = a third / fourth controller (not used in a match)
  function playerOf(dev) {
    var i = order.indexOf(dev);
    if (i < 0) { order.push(dev); i = order.length - 1; } // a press can arrive before the pad list
    return i < 2 ? i : -1;
  }

  // stick + D-pad of one player -> his direction
  function push(n) {
    var d = dpad[n];
    var x = stick[n][0], y = stick[n][1];
    if (d[2] || d[3] || d[0] || d[1]) { x = (d[3] ? 1 : 0) - (d[2] ? 1 : 0); y = (d[1] ? 1 : 0) - (d[0] ? 1 : 0); }
    NS.Input.direction(n, x, y);
    var h = x > 0.6 ? 1 : (x < -0.6 ? -1 : (Math.abs(x) < 0.3 ? 0 : side[n]));
    if (h !== side[n]) { side[n] = h; if (h && NS.UI && NS.UI.padSide) NS.UI.padSide(n, h); }
  }

  function onButton(i, pressed, value, dev) {
    var n = playerOf(dev);
    if (NS.Replay && NS.Replay.active()) { NS.Replay.button(i, pressed); return; } // (any controller drives a replay)
    if (n < 0) return;
    if (i >= 12 && i <= 15) {
      var db = DPAD_BIT[i - 12], B = NS.Bindings;
      if (NS.Mapper && NS.Mapper.active()) { NS.Mapper.button(db, pressed); return; }
      // a D-pad button mapped to checkoAI's clap / punishment (the trainer): that button, not a direction
      if (NS.Aima && NS.Aima.isImad() && (db & (B.clapMask() | B.punishMask()))) { NS.Input.button(n, db, pressed); return; }
      dpad[n][i - 12] = pressed ? 1 : 0; push(n); return;
    }
    var bit = i < BIT.length ? BIT[i] : 0;
    if (!bit) return; // Start / Select / Home: menus (My PC sends 'menu')
    if (NS.Mapper && NS.Mapper.active()) { NS.Mapper.button(bit, pressed); return; }
    // the Settings page: L / R (the shoulder buttons) go to the tab before / after
    // (a release always goes on: it only clears the button)
    if (pressed && (i === 4 || i === 5) && NS.UI && NS.UI.isOpen() && NS.UI.tabStep && NS.UI.tabStep(i === 4 ? -1 : 1)) return;
    NS.Input.button(n, bit, pressed);
  }

  // an action of the game's own touch pad (player 1)
  function onTouch(action, down) {
    if (NS.Replay && NS.Replay.active()) {
      if (action === 'pause') { if (down) NS.Replay.stop(); return; }
      if (action === 'left' || action === 'right') { NS.Replay.button(action === 'left' ? 14 : 15, down); return; }
      if (action.charAt(0) === 'b') NS.Replay.button(+action.slice(1), down);
      return;
    }
    if (action in TOUCH_DIR) { dpad[0][TOUCH_DIR[action]] = down ? 1 : 0; push(0); return; }
    if (action === 'pause') { if (down && NS.App) NS.App.input('menu', true, false); return; }
    var i = action.charAt(0) === 'b' ? +action.slice(1) : -1;
    var bit = i >= 0 && i < BIT.length ? BIT[i] : 0;
    if (!bit) return;
    if (NS.Mapper && NS.Mapper.active()) { NS.Mapper.button(bit, down); return; }
    NS.Input.button(0, bit, down);
  }

  function onAxes(axes, dev) {
    var n = playerOf(dev);
    var x = axes[0] || 0, y = axes[1] || 0;
    var m = Math.sqrt(x * x + y * y);
    if (m < DEAD) { x = 0; y = 0; }
    if (NS.Replay && NS.Replay.active()) { NS.Replay.stick(x); return; }
    if (n < 0) return;
    stick[n][0] = x; stick[n][1] = y;
    push(n);
    // the right stick (standard axes 2 / 3)
    var rx = axes[2] || 0, ry = axes[3] || 0;
    if (rx * rx + ry * ry < DEAD * DEAD) { rx = 0; ry = 0; }
    NS.Input.rstick(n, rx, ry);
  }

  function onPads(list) {
    order.length = 0;
    for (var i = 0; i < list.length; i++) order.push(list[i].dev);
    kind = list.length ? (list[0].standard ? kindOf(list[0].name) : 'generic') : (touchDevice() ? 'nintendo' : 'generic');
    if (NS.UI && NS.UI.padsChanged) NS.UI.padsChanged();
  }

  NS.Gamepad = {
    init: function () {
      var g = MyPC.gamepad;
      if (!g || !g.on) return;
      g.on('button', onButton);
      g.on('axes', onAxes);
      g.on('pads', onPads);
      onPads(g.pads());
    },
    // the touch pad for a match (on = the match is on screen; off = a menu is: My PC's own pad is back). Only on a touch
    // device with no controller connected.
    touchPad: function (on) {
      var P = window.MyPC && MyPC.pad;
      if (!P || !P.init) return;
      try {
        if (!on) {
          if (touchOn) { touchOn = false; P.hide(); NS.Gamepad.reset(); NS.Input.releaseAll(); }
          return;
        }
        if (touchOn || order.length) return; // (My PC draws it only on a touch device)
        var all = [];
        for (var k = 0; k < TOUCH.length; k++) {
          var t = TOUCH[k];
          var b = { label: t[1], action: t[0] };
          if (t[3]) b.place = t[3];
          all.push(b);
        }
        P.init({ id: 'rs6-match', buttons: all.slice(0, 6), catalog: all, scale: { stick: 1.2, btn: 1.1 }, floating: true, onAction: onTouch });
        touchOn = !!(P.active ? P.active() : true);
      } catch (e) { touchOn = false; }
    },
    // a controller (or phone controller) is connected
    live: function () { return order.length > 0; },
    count: function () { return order.length; },
    kind: function () { return kind; },
    // display name of a standard button index on this controller (L / ZL on Nintendo, LB / LT on Xbox...)
    label: function (index) { return index >= 12 && index <= 15 ? DPAD_NAMES[index - 12] : (NAMES[kind][index] || ('#' + (index + 1))); },
    // after a pause: every held direction is let go (My PC releases the buttons itself)
    reset: function () {
      for (var n = 0; n < 2; n++) { dpad[n][0] = dpad[n][1] = dpad[n][2] = dpad[n][3] = 0; stick[n][0] = stick[n][1] = 0; push(n); }
    }
  };
})(window.RS6 = window.RS6 || {});
