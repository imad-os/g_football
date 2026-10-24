/* Per-player match input (P1, P2), fed by the device each player picked on the sides screen: a game controller or a phone
 * controller (js/core/gamepad.js), or the keyboard / TV remote: the arrows through My PC's actions, its other keys through
 * js/core/keyboard.js (the keyboard map; My PC's second-keyboard keys W A S D F G are extra keys of the one keyboard
 * player). Menus get My PC's actions from every device.
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
      for (var d in keys) keys[d].l = keys[d].r = keys[d].u = keys[d].d = false;
    },

    // the keyboard's arrows during a match (My PC's onInput, dev 'keys'): its player's direction (its other keys:
    // js/core/keyboard.js). False = not a player's.
    key: function (dev, action, pressed) {
      var n = Devices.player(dev);
      if (n < 0) return false;
      var k = keys[dev] || (keys[dev] = { l: false, r: false, u: false, d: false });
      if (action === 'left') k.l = pressed;
      else if (action === 'right') k.r = pressed;
      else if (action === 'up') k.u = pressed;
      else if (action === 'down') k.d = pressed;
      else return false;
      NS.Input.direction(n, (k.r ? 1 : 0) - (k.l ? 1 : 0), (k.d ? 1 : 0) - (k.u ? 1 : 0));
      return true;
    }
  };

  var keys = {};             // keyboard device -> its arrows held

  /* The devices and the two players. A device is the keyboard / TV remote ('keys'; My PC's second-keyboard keys 'keys2'
   * are its extra keys), or a controller ('pad0'..'pad3', phones 'pad101'...). On the sides screen each device has its own
   * row and moves its own icon; the first two devices put on a side are P1 and P2 (session.padDev, their teams in
   * session.pads). The competitions' fixed side modes use the default devices: the controllers first, then the keyboard. */
  var Devices = {
    // every device that can play, in order: the controllers, then the keyboard(s)
    list: function () {
      var d = NS.Gamepad && NS.Gamepad.devs ? NS.Gamepad.devs() : null; // (trainer.html: no controllers)
      var out = d && d.slice ? d.slice() : [];
      out.push('keys'); // (one keyboard player: My PC's second-keyboard keys are his extra keys)
      return out;
    },
    seen: function (dev) {
      if (dev) this.last = dev === 'touch' || dev === 'keys2' ? 'keys' : dev;
    },
    isKeys: function (dev) { return dev === 'keys' || dev === 'keys2' || dev === 'touch'; },
    // 'pad', 'phone', 'keys', 'keys2'
    kind: function (dev) {
      if (dev === 'keys' || dev === 'touch') return 'keys';
      if (dev === 'keys2') return 'keys2';
      return /^pad1\d\d$/.test(String(dev)) ? 'phone' : 'pad';
    },
    // the device player n plays with (null: none)
    of: function (n) {
      var s = NS.World.session;
      if (s.sideMode === 'CUSTOM') return s.padDev ? s.padDev[n] || null : null;
      // a fixed side mode (the competitions): P1 the device that used the menus last, P2 the first other one
      var l = this.list(), d0 = l.indexOf(this.last) >= 0 ? this.last : l[0];
      if (n === 0) return d0 || null;
      for (var i = 0; i < l.length; i++) if (l[i] !== d0) return l[i];
      return null;
    },
    // the button map player n plays with: 1 the keyboard's (a keyboard player), 0 the controllers' (a controller, or the
    // phone's own touch pad, which has a controller's buttons)
    mapOf: function (n) {
      var d = this.of(n);
      return d && this.isKeys(d) && !(NS.Gamepad && NS.Gamepad.touching && NS.Gamepad.touching()) ? 1 : 0;
    },
    // the device that used the menus last (it is P1 when the sides screen opens for the first time)
    last: 'keys',
    // the player (0 / 1) a device plays as in a match, -1 none
    player: function (dev) {
      if (dev === 'touch') dev = 'keys';
      if (this.of(0) === dev) return 0;
      if (this.of(1) === dev) return 1;
      return -1;
    },
    // CUSTOM sides: a player with a side and no device gets the device that used the menus last (else the first free
    // one); a device that is gone frees its player; P1 is always the first of them (P2 alone becomes P1)
    fix: function () {
      var s = NS.World.session, l = this.list();
      if (!s.padDev) s.padDev = [null, null];
      for (var n = 0; n < 2; n++) {
        if (s.padDev[n] && l.indexOf(s.padDev[n]) < 0) { s.padDev[n] = null; s.pads[n] = -1; }
        if (s.pads[n] >= 0 && !s.padDev[n]) {
          if (l.indexOf(this.last) >= 0 && this.last !== s.padDev[1 - n]) s.padDev[n] = this.last;
          for (var i = 0; i < l.length && !s.padDev[n]; i++) if (l[i] !== s.padDev[1 - n]) s.padDev[n] = l[i];
          if (!s.padDev[n]) s.pads[n] = -1;
        }
        if (s.pads[n] < 0) s.padDev[n] = null;
      }
      if (!s.padDev[0] && s.padDev[1]) {
        s.padDev[0] = s.padDev[1]; s.pads[0] = s.pads[1];
        s.padDev[1] = null; s.pads[1] = -1;
      }
    }
  };
  NS.Devices = Devices;
})(window.RS6 = window.RS6 || {});
