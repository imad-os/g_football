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
  // At most this many game steps in one frame: after a slow frame the game catches up a little and lets the rest go
  // (the game slows for a moment) instead of running more steps, which would make the next frame slow too.
  var MAX_STEPS = 2;

  var raf = 0;
  var last = 0;
  var acc = 0;
  var menuFrame = 0;
  var sceneReady = false;
  var destroyed = false;
  var lastMenuJson = '';

  // ---- Dev mode > Performance: per second, the frame rate and where a frame's time goes (js/game ... js/render)
  var perf = { on: false, box: null, n: 0, t0: 0, worst: 0, slow: 0, step: 0, ai: 0, draw: 0, steps: 0, dropped: 0 };
  function perfNow() { return performance.now(); }
  function perfFrame(ms) {
    var f = perf;
    f.n++;
    if (ms > f.worst) f.worst = ms;
    if (ms > 20) f.slow++;
    var now = perfNow();
    if (!f.t0) f.t0 = now;
    if (now - f.t0 < 1000) return;
    var n = f.n || 1, s = (now - f.t0) / 1000, di = NS.Scene.drawInfo();
    // text built once a second only
    f.box.textContent = 'FPS ' + Math.round(n / s) + '   worst frame ' + Math.round(f.worst) + ' ms   slow frames ' + f.slow +
      '\ngame ' + (f.step / n).toFixed(2) + ' ms (checkoAI ' + (f.ai / n).toFixed(2) + ')   draw ' + (f.draw / n).toFixed(2) +
      ' ms   steps/frame ' + (f.steps / n).toFixed(2) + (f.dropped ? '   dropped ' + f.dropped : '') +
      (di ? '\ndraw calls ' + di.calls + '   triangles ' + di.triangles : '') +
      '\n' + NS.Quality.label() + ' ' + (NS.stadiumId || '') + ' ' + (World.settings.playerModel || '');
    f.n = 0; f.t0 = now; f.worst = 0; f.slow = 0; f.step = 0; f.ai = 0; f.draw = 0; f.steps = 0; f.dropped = 0;
  }
  function perfSync() {
    var on = !!World.settings && !!World.settings.perfHud;
    if (on === perf.on) return;
    perf.on = on;
    if (on && !perf.box) {
      perf.box = document.createElement('div');
      perf.box.className = 'perf-hud';
      document.body.appendChild(perf.box);
      // checkoAI's share of a game step
      if (NS.Aima && NS.Aima.driveTeam) {
        var dt0 = NS.Aima.driveTeam;
        NS.Aima.driveTeam = function (t, dt) {
          if (!perf.on) return dt0.call(this, t, dt);
          var a = perfNow(), r = dt0.call(this, t, dt);
          perf.ai += perfNow() - a;
          return r;
        };
      }
    }
    if (perf.box) perf.box.style.display = on ? '' : 'none';
    perf.n = 0; perf.t0 = 0;
  }

  // A menu on screen: the 3D scene is not drawn under it. The main menus cover it (the canvas is hidden, so the TV only
  // composites the menu); a pause menu shows the frozen match, drawn once when it opens.
  var menuDrawn = false, canvasHidden = false;
  function hideCanvas(h) {
    if (h === canvasHidden) return;
    canvasHidden = h;
    var cv = document.getElementById('game-canvas');
    if (cv) cv.style.visibility = h ? 'hidden' : '';
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    var elapsed = ts - last;
    last = ts;
    if (elapsed > 250) elapsed = 250;
    var m = World.match;

    if (NS.UI.isOpen() && !NS.Replay.active() && (!m.running || m.paused)) {
      acc = 0;
      hideCanvas(!m.running);
      if (m.running && !menuDrawn) { NS.Match.drawHud(0); NS.Scene.render(); }
      menuDrawn = true;
      return;
    }
    if (menuDrawn) { menuDrawn = false; NS.Quality.resetTimer(); } // (the menu's time is not a slow frame)
    hideCanvas(false);

    if (NS.Replay.active()) {
      // a replay on screen: the game waits, the recorded frames are shown
      acc = 0;
      NS.Replay.frame(elapsed / 1000);
      NS.Quality.frame(elapsed / 1000);
      NS.Scene.render();
    } else if (m.running) {
      var pt = perf.on ? perfNow() : 0;
      if (!m.paused) {
        acc += elapsed;
        var dt = NS.STEP * World.settings.gameSpeed, k = 0;
        while (acc >= STEP_MS && k < MAX_STEPS && !m.paused && !NS.Replay.active()) {
          NS.Match.update(dt);
          NS.Replay.step(dt);
          acc -= STEP_MS;
          k++;
        }
        if (acc >= STEP_MS) { if (perf.on) perf.dropped += Math.floor(acc / STEP_MS); acc %= STEP_MS; } // (the rest is let go)
        if (perf.on) perf.steps += k;
      } else {
        acc = 0;
      }
      NS.Quality.frame(elapsed / 1000);
      NS.Match.drawHud(elapsed / 1000);
      if (perf.on) { var pd = perfNow(); perf.step += pd - pt; NS.Scene.render(); perf.draw += perfNow() - pd; perfFrame(elapsed); }
      else NS.Scene.render();
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
    menuDrawn = false; // (a resized canvas is cleared: the frozen match is drawn again)
    NS.Scene.resize();
    NS.HUD.measure();
  }

  NS.App = {
    // My PC's actions drive the menus (remote, keyboard and controllers). In a match a controller plays through its own
    // buttons (js/core/gamepad.js), a keyboard player through these actions (NS.Input.key); Start (any controller) or
    // the keyboard's Esc opens the menu.
    input: function (action, pressed, repeat, dev) {
      NS.Devices.seen(dev);
      if (NS.Replay.active()) { NS.Replay.action(action, pressed, repeat, dev); return; }
      if (NS.Replay.justEnded()) return; // (the rest of the press that closed the replay)
      if (NS.UI.isOpen()) { NS.UI.onInput(action, pressed, repeat, dev); return; }
      if ((action === 'menu' || (action === 'cancel' && NS.Devices.isKeys(dev))) && pressed && !repeat) { NS.Match.requestMenu(); return; }
      if (!World.match.running || repeat) return;
      if (NS.Keyboard.virtual(dev, action, pressed)) return; // (My PC's actions that stand for a key: the keyboard map)
      if (NS.Devices.isKeys(dev)) NS.Input.key(dev, action, pressed);                    // (the arrows)
    },
    applySettings: function () {
      var s = World.settings;
      NS.Audio.setEnabled(s.soundEnabled);
      NS.Audio.setChants(s.crowdChants);
      if (NS.Quality.mode() !== s.quality) NS.Quality.apply(s.quality);
      NS.HUD.applySettings(s);
      NS.Scene.setBallSkin(s.ballSkin);
      NS.Scene.setBallSize(s.ballSize);
      NS.Match.restyle(); // player models / polygons (at once, also during a match)
      perfSync();
      NS.Commentary.setup(s); // on / off (off: dropped at once), voice, language, how talkative...
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
        perfSync();
        try { NS.Aima.init(info); } catch (e) { MyPC.report && MyPC.report(e, { where: 'checkoAI init' }); } // never blocks the game
        NS.Comp.load(); // a saved league / cup to continue
        NS.Audio.setEnabled(settings.soundEnabled);
        NS.Audio.setChants(settings.crowdChants);
        NS.Audio.setVolume(info.volume && info.volume.sfx);
        NS.Match.labels({ p1: NS.I18n.t('hud.p1'), p2: NS.I18n.t('hud.p2'), cpu: NS.I18n.t('hud.cpu') });

        NS.HUD.init();
        NS.Quality.init(info.quality && info.quality.tier, function (tier) {
          if (sceneReady) { NS.Scene.applyTier(tier); NS.Match.restyle(); } // (Polygons AUTO follows the tier)
          NS.HUD.setQuality(NS.Quality.label());
        }, function (fps) { NS.HUD.setFps(fps); });
        NS.Quality.apply(settings.quality);
        MyPC.progress(0.35);

        NS.Scene.init(document.getElementById('game-canvas'), NS.Quality.tier());
        sceneReady = true;
        NS.Scene.setBallSkin(settings.ballSkin);
        NS.Scene.setBallSize(settings.ballSize);
        NS.Commentary.setup(settings); // (only reads the settings: it loads nothing before a match)
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
