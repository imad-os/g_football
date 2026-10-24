/* The keyboard player's keys (device 'keys'), by KeyboardEvent.code, for the keyboard map (NS.Bindings: any key, or two
 * together). Two ways in:
 *  - Inside My PC the game is a frame and My PC keeps the keyboard: it only sends actions. Those that tell keys apart are
 *    turned back into keys here (virtual): 'keys' jump = Enter (Space and Z send it too), 'keys' run = Shift (X too), and
 *    My PC's second-keyboard keys W A S D F G ('keys2' up left down right jump run). The game has one keyboard player:
 *    those are his extra keys.
 *  - Standalone (or once the frame has the focus, a mouse click on a PC) every key reaches the game itself: read directly
 *    (keydown / keyup, an exception to My PC's "no keydown of your own", asked for by the owner).
 * The arrows move the player and Esc opens the menu (My PC's actions, NS.Input.key). In a match a key of the map presses
 * its bit for the keyboard's player; Enter, when no move uses it, is the pass (the TV remote's OK). The mapping screen
 * captures keys from here (NS.Mapper.key).
 */
(function (NS) {
  'use strict';

  var down = {};     // codes held -> the bit each one pressed (0: none)
  var V1 = { jump: 'Enter', run: 'ShiftLeft' };
  var V2 = { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', jump: 'KeyF', run: 'KeyG' };

  function typing(e) {
    var t = e.target;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  // a key (by code) pressed / released, from either way in
  function onCode(code, pressed) {
    if (pressed) {
      if (code in down) return; // (auto-repeat, or the same key from both ways)
    } else if (!(code in down)) return;
    var M = NS.Mapper, B = NS.Bindings;
    if (M && M.active()) {
      if (pressed) down[code] = 0; else delete down[code];
      if (B.mappable(code)) M.key(code, pressed, 'keys');
      return;
    }
    var n = NS.Devices ? NS.Devices.player('keys') : -1;
    if (!pressed) {
      var b = down[code];
      delete down[code];
      if (b && n >= 0) NS.Input.button(n, b, false);
      return;
    }
    var bit = B.keyBit(code);
    if (!bit && code === 'Enter') bit = B.maskOf(B.index('lowpass'), 1); // (the remote's OK: the pass, unless mapped)
    // (only a match on screen: a key that opened or closed a menu plays nothing)
    if (!bit || n < 0 || !NS.World.match.running || (NS.UI && NS.UI.isOpen())) { down[code] = 0; return; }
    down[code] = bit;
    NS.Input.button(n, bit, true);
  }

  function onKey(e, pressed) {
    if (!e.code || typing(e)) return;
    onCode(e.code, pressed);
  }

  // every held key let go (the window lost the focus, a pause)
  function releaseAll() {
    var n = NS.Devices ? NS.Devices.player('keys') : -1;
    for (var c in down) if (down[c] && n >= 0) NS.Input.button(n, down[c], false);
    down = {};
  }

  window.addEventListener('keydown', function (e) { onKey(e, true); }, true);
  window.addEventListener('keyup', function (e) { onKey(e, false); }, true);
  window.addEventListener('blur', releaseAll);

  NS.Keyboard = {
    // one of My PC's actions that stands for a key ('keys' jump / run, every 'keys2' one): that key; true = taken. While
    // the game has the focus its own key events are read instead (My PC's would press the same key twice).
    virtual: function (dev, action, pressed) {
      var code = dev === 'keys' ? V1[action] : (dev === 'keys2' ? V2[action] : null);
      if (!code) return false;
      if (!(document.hasFocus && document.hasFocus())) onCode(code, pressed);
      return true;
    },
    reset: releaseAll
  };
})(window.RS6 = window.RS6 || {});
