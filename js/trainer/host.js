/* trainer.html: what the game's code expects around it, without My PC, the 3D view, the HUD, sound or replays.
 * Loaded after the core files and before the game files: the simulation, checkoAI and the debug runner are the game's
 * own files, unchanged; only the screen side is replaced here by quiet stand-ins. */
(function (NS) {
  'use strict';

  // My PC: saves in this browser's own storage (the sign-in is shared with the game on the same site: rs6_aimaAuth)
  if (!window.MyPC) {
    window.MyPC = {
      app_config: {},
      load: function (k, d) {
        try { var v = localStorage.getItem('rs6trainer_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
      },
      save: function (k, v) { try { localStorage.setItem('rs6trainer_' + k, JSON.stringify(v)); } catch (e) {} },
      submitScore: function () {},
      report: function (e) { if (window.console) console.error(e); }
    };
  }

  // Anything the screen side is asked to do is ignored: every property is a function that does nothing.
  function noop() {}
  function quiet(own) {
    return new Proxy(own || {}, { get: function (o, k) { return k in o ? o[k] : noop; } });
  }
  NS.Scene = quiet({ lit: function () { return false; }, px: 0.5, py: 0.5 });
  NS.HUD = quiet();
  NS.Audio = quiet({ chime: function () { if (NS.Trainer) NS.Trainer.beep(); } });
  NS.Replay = quiet({ active: function () { return false; }, justEnded: function () { return false; } });
  NS.UI = quiet({ isOpen: function () { return false; } });
  NS.Mapper = quiet();
  NS.Gamepad = quiet();
  NS.App = quiet();
})(window.RS6 = window.RS6 || {});
