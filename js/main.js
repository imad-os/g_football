/* Entry point: My PC lifecycle (init / ready / start / pause / resume / destroy), one rAF loop with a fixed 60 Hz step. */
(function (NS) {
  'use strict';

  // The 3D engine or one of our scripts did not load: let My PC show Retry / Back instead of hanging.
  if (typeof THREE === 'undefined' || !NS.Bindings || !NS.Gamepad || !NS.World || !NS.Scene || !NS.UI || !NS.Match) {
    var noop = function () {};
    MyPC.init({
      onInit: function () { MyPC.fail('Game files failed to load. Check the network.'); },
      onStart: noop, onPause: noop, onResume: noop, onDestroy: noop
    });
    return;
  }

  var World = NS.World;
  var STEP_MS = 1000 / 60;

  var raf = 0;
  var last = 0;
  var acc = 0;
  var menuFrame = 0;
  var sceneReady = false;
  var destroyed = false;
  var lastMenuJson = '';

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    var elapsed = ts - last;
    last = ts;
    if (elapsed > 250) elapsed = 250;
    var m = World.match;

    if (m.running) {
      if (!m.paused) {
        acc += elapsed;
        var dt = NS.STEP * World.settings.gameSpeed;
        while (acc >= STEP_MS && !m.paused) {
          NS.Match.update(dt);
          acc -= STEP_MS;
        }
      } else {
        acc = 0;
      }
      NS.Quality.frame(elapsed / 1000);
      NS.Match.drawHud(elapsed / 1000);
      NS.Scene.render();
    } else {
      // Menus cover the pitch: repaint the background at a low rate to spare the TV.
      acc = 0;
      if ((++menuFrame & 3) === 0) NS.Scene.render();
    }
  }

  function startLoop() {
    if (raf || destroyed) return;
    last = 0;
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function onResize() {
    NS.Scene.resize();
    NS.HUD.measure();
  }

  NS.App = {
    // My PC's actions drive the menus only (remote, keyboard and controllers); matches are played with the controllers
    // themselves (js/core/gamepad.js)
    input: function (action, pressed, repeat, dev) {
      if (NS.UI.isOpen()) NS.UI.onInput(action, pressed, repeat, dev);
      else if (action === 'menu' && pressed && !repeat) NS.Match.requestMenu();
    },
    applySettings: function () {
      var s = World.settings;
      NS.Audio.setEnabled(s.soundEnabled);
      NS.Audio.setChants(s.crowdChants);
      if (NS.Quality.mode() !== s.quality) NS.Quality.apply(s.quality);
      NS.HUD.applySettings(s);
      NS.Scene.setBallSkin(s.ballSkin);
      // 7 or 11 a side: the squads are rebuilt for the next match (a running match keeps its own)
      if (!World.match.running && NS.TEAM_SIZE !== s.teamSize) NS.Match.syncRosters();
    },
    // Extra entries of My PC's pause menu (only while a match is running).
    syncMenuItems: function () {
      var items = [];
      if (World.match.running) {
        var ids = ['plan', 'settings', 'sides', 'controls', 'restart', 'abandon'];
        for (var i = 0; i < ids.length; i++) items.push({ id: ids[i], label: NS.I18n.t('mypc.' + ids[i]) });
      }
      var json = JSON.stringify(items);
      if (json === lastMenuJson) return;
      lastMenuJson = json;
      MyPC.setMenu(items);
    }
  };

  MyPC.init({
    ownMenu: true,

    onInit: function (info) {
      try {
        NS.I18n.setLang(info.lang);
        NS.I18n.applyDom();
        MyPC.progress(0.1);

        NS.Gamepad.init();
        var settings = NS.Storage.load();
        World.settings = settings;
        try { NS.Aima.init(info); } catch (e) { MyPC.report && MyPC.report(e, { where: 'checkoAI init' }); } // never blocks the game
        NS.Comp.load(); // a saved league / cup to continue
        NS.Audio.setEnabled(settings.soundEnabled);
        NS.Audio.setChants(settings.crowdChants);
        NS.Audio.setVolume(info.volume && info.volume.sfx);
        NS.Match.labels({ p1: NS.I18n.t('hud.p1'), p2: NS.I18n.t('hud.p2'), cpu: NS.I18n.t('hud.cpu') });

        NS.HUD.init();
        NS.Quality.init(info.quality && info.quality.tier, function (tier) {
          if (sceneReady) NS.Scene.applyTier(tier);
          NS.HUD.setQuality(NS.Quality.label());
        }, function (fps) { NS.HUD.setFps(fps); });
        NS.Quality.apply(settings.quality);
        MyPC.progress(0.35);

        NS.Scene.init(document.getElementById('game-canvas'), NS.Quality.tier());
        sceneReady = true;
        NS.Scene.setBallSkin(settings.ballSkin);
        MyPC.progress(0.7);

        NS.UI.build();
        NS.HUD.applySettings(settings);
        NS.Match.syncRosters();
        window.addEventListener('resize', onResize);
        World.match.running = false;
        World.match.paused = true;
        NS.UI.show('MAIN');
        MyPC.progress(1);
        MyPC.ready();
      } catch (e) {
        MyPC.fail(String(e && e.message ? e.message : e));
      }
    },

    onStart: function () {
      NS.UI.refreshStats();
      MyPC.announce(NS.I18n.t('mode.EXHIBITION') + '. ' + NS.I18n.t('step.main'));
      startLoop();
    },

    onPause: function () {
      NS.Mapper.cancel(); // never leave a button capture running under My PC's menu
      stopLoop();
      NS.Input.releaseAll();
      NS.Audio.suspend();
    },

    onResume: function () {
      NS.Gamepad.reset();
      NS.Audio.resume();
      NS.Quality.resetTimer();
      startLoop();
    },

    onDestroy: function () {
      destroyed = true;
      stopLoop();
      window.removeEventListener('resize', onResize);
      NS.Audio.close();
      NS.Scene.dispose();
    },

    onInput: function (action, pressed, repeat, dev) { NS.App.input(action, pressed, repeat, dev); },

    onMenu: function (id) { NS.UI.openFromHost(id); },

    onVolume: function (v) { NS.Audio.setVolume(v && v.sfx); }
  });
})(window.RS6 = window.RS6 || {});
