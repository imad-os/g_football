/* Game controllers: the only way to play a match. Physical gamepads and phone controllers (a phone in Buttons mode is a
 * standard gamepad for My PC, device pad101 / pad102) are read through MyPC.gamepad (API level 9): every button by its
 * standard index, both sticks, the list of connected pads. The game never calls navigator.getGamepads() itself (the SDK
 * does, standalone too). Menus keep using My PC's actions (onInput), which every controller also sends.
 *
 * Player 1 is the first connected controller, player 2 the second (pads, then phones, in My PC's order).
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
  var DEAD = 0.22; // stick dead zone

  var order = [];        // connected devices in player order ('pad0', 'pad101'...)
  var kind = 'generic';
  var dpad = [[0, 0, 0, 0], [0, 0, 0, 0]]; // per player: up down left right held
  var stick = [[0, 0], [0, 0]];

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
  }

  function onButton(i, pressed, value, dev) {
    var n = playerOf(dev);
    if (n < 0) return;
    if (i >= 12 && i <= 15) { dpad[n][i - 12] = pressed ? 1 : 0; push(n); return; }
    var bit = i < BIT.length ? BIT[i] : 0;
    if (!bit) return; // Start / Select / Home: menus (My PC sends 'menu')
    if (NS.Mapper && NS.Mapper.active()) { NS.Mapper.button(bit, pressed); return; }
    NS.Input.button(n, bit, pressed);
  }

  function onAxes(axes, dev) {
    var n = playerOf(dev);
    if (n < 0) return;
    var x = axes[0] || 0, y = axes[1] || 0;
    var m = Math.sqrt(x * x + y * y);
    if (m < DEAD) { x = 0; y = 0; }
    stick[n][0] = x; stick[n][1] = y;
    push(n);
  }

  function onPads(list) {
    order.length = 0;
    for (var i = 0; i < list.length; i++) order.push(list[i].dev);
    kind = list.length ? (list[0].standard ? kindOf(list[0].name) : 'generic') : 'generic';
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
    // a controller (or phone controller) is connected
    live: function () { return order.length > 0; },
    count: function () { return order.length; },
    kind: function () { return kind; },
    // display name of a standard button index on this controller (L / ZL on Nintendo, LB / LT on Xbox...)
    label: function (index) { return NAMES[kind][index] || ('#' + (index + 1)); },
    // after a pause: every held direction is let go (My PC releases the buttons itself)
    reset: function () {
      for (var n = 0; n < 2; n++) { dpad[n][0] = dpad[n][1] = dpad[n][2] = dpad[n][3] = 0; stick[n][0] = stick[n][1] = 0; push(n); }
    }
  };
})(window.RS6 = window.RS6 || {});
