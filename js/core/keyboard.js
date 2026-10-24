/* The keyboard, read directly. An exception to My PC's rule "never read keydown yourself", asked for by the owner: My PC
 * gives games only the arrows, Enter / Space, Shift and Esc, too few keys to play with or to map. keydown / keyup on the
 * window: in a match a key of the keyboard map (NS.Bindings: any key, or two together) presses its bit for the player who
 * plays with the keyboard (device 'keys'); the mapping screen captures keys from here (NS.Mapper.key). The arrows and Esc
 * stay My PC's (movement, menus), so are not mappable. If My PC keeps the keys to itself (no key event ever reaches the
 * game) its Enter / Shift still play (NS.Input.key). Event-driven, no allocation of our own per key but the held set.
 */
(function (NS) {
  'use strict';

  var live = false;  // a key event reached the game: the keyboard is read here, not through My PC's Enter / Shift
  var down = {};     // codes held -> the bit each one pressed (0: none)

  function typing(e) {
    var t = e.target;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKey(e, pressed) {
    var code = e.code;
    if (!code || typing(e)) return;
    live = true;
    if (pressed) {
      if (code in down) return; // (auto-repeat)
    } else if (!(code in down)) return;
    var M = NS.Mapper;
    if (M && M.active()) {
      if (pressed) down[code] = 0; else delete down[code];
      if (NS.Bindings.mappable(code)) M.key(code, pressed, 'keys');
      return;
    }
    var n = NS.Devices ? NS.Devices.player('keys') : -1;
    if (!pressed) {
      var b = down[code];
      delete down[code];
      if (b && n >= 0) NS.Input.button(n, b, false);
      return;
    }
    var bit = NS.Bindings.keyBit(code);
    // (only a match on screen: a key that opened or closed a menu plays nothing)
    if (!bit || n < 0 || !NS.World.match.running || (NS.UI && NS.UI.isOpen())) { down[code] = 0; return; }
    down[code] = bit;
    NS.Input.button(n, bit, true);
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
    // the game gets the keyboard's own key events (else only My PC's actions)
    live: function () { return live; },
    reset: releaseAll
  };
})(window.RS6 = window.RS6 || {});
