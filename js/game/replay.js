/* Replays, with the match camera: the last 10-20 seconds of play (Settings > Replay length) and every goal.
 *
 * Recording: 30 times a second of play, what is on screen is copied into a ring of numbers (the camera, the ball, the
 * nets, the clock and the score, then every player and the referee: place, facing and pose). Int16 (x 100: 1 cm,
 * 0.01 rad), one buffer made once (~430 KB), nothing allocated during play. A goal keeps its own copy (the replay
 * length up to 2.5 s after it went in) for the replay after the goal and the full-time screen.
 * Playing: the game is stopped, the frames are put on the meshes (smoothly between two frames), and the live picture is
 * put back exactly as it was at the end. Controls: left stick / D-pad / arrows = speed (right: faster, left: rewind; a
 * little = slow motion), A / OK = pause / play, B or + (or up / down on the remote) = exit.
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var HZ = 30, STEP = 1 / HZ;
  var Q = 100;
  var H = 17, E = 15, MAX_E = 24;           // header numbers, numbers per body, bodies (22 players + the referee)
  var BALL_Y = 16;                          // (the ball's turn about the vertical)
  var FSM = H + MAX_E * E;                   // ring stride
  var CAP = 20 * HZ + 10;                    // ring frames (the longest replay length)
  var AFTER = Math.round(2.5 * HZ);          // frames of a goal's clip after the ball went in
  var MAX_CLIPS = 12;                        // goals whose replay is kept (the oldest let go beyond that)
  var RED = 0xef4444, YELLOW = 0xfacc15;
  var TWO_PI = Math.PI * 2;

  var ents = [];                // the meshes (players, then the referee)
  var FS = H;                   // numbers per frame of this match
  var SC = new Float32Array(FSM);   // scale of each number (Q, or 1 for the clock, the score and the flags)
  var ANG = new Uint8Array(FSM);    // 1 = an angle (smallest turn between two frames)
  var ring = new Int16Array(CAP * FSM);
  var frames = 0, acc = 0, on = false;
  var cur = new Float32Array(FSM);  // a frame, unpacked
  var live = new Float32Array(FSM); // the live picture, put back after a replay
  var pending = null;               // a goal waiting for its last 2.5 s
  var clipsKept = [];

  var P = null;                     // the replay on screen
  var endT = 0;                     // when the last one ended (the button that ended it is not passed on)
  var sx = 0, dl = false, dr = false, kl = false, kr = false;
  var ui = null, hudWas = false;
  var lastProg = -1, lastSpeed = '', lastState = '', lastClock = -1, lastScore = '';

  function layout() {
    var i, k;
    for (i = 0; i < FSM; i++) { SC[i] = Q; ANG[i] = 0; }
    SC[13] = SC[14] = SC[15] = 1;   // clock (whole seconds), score
    ANG[9] = ANG[10] = ANG[BALL_Y] = 1; // ball spin
    for (k = 0; k < MAX_E; k++) {
      ANG[H + k * E + 3] = 1;       // facing
      SC[H + k * E + 13] = 1;       // flags
    }
  }
  layout();

  function wrapA(a) {
    a = a % TWO_PI;
    if (a > Math.PI) a -= TWO_PI; else if (a < -Math.PI) a += TWO_PI;
    return a;
  }

  // what is on screen now -> b (floats)
  function grab(b) {
    var m = World.match;
    NS.Scene.camState(b, 0, BALL_Y);
    b[13] = Math.floor(m.timeSeconds); b[14] = m.score[0]; b[15] = m.score[1];
    for (var i = 0; i < ents.length; i++) {
      var me = ents[i], o = H + i * E;
      b[o] = me.root.position.x; b[o + 1] = me.root.position.y; b[o + 2] = me.root.position.z; b[o + 3] = me.root.rotation.y;
      b[o + 4] = me.body.position.y; b[o + 5] = me.body.rotation.x; b[o + 6] = me.body.rotation.z;
      b[o + 7] = me.leftLeg.rotation.x; b[o + 8] = me.rightLeg.rotation.x;
      b[o + 9] = me.leftArm.rotation.x; b[o + 10] = me.rightArm.rotation.x;
      b[o + 11] = me.leftArm.rotation.z; b[o + 12] = me.rightArm.rotation.z; b[o + 14] = me.rightLeg.rotation.z;
      b[o + 13] = (me.root.visible ? 1 : 0) + (me.card.visible ? 2 : 0) + (me.card.material.color.getHex() === RED ? 4 : 0);
    }
  }

  // b (floats) -> on screen
  function put(b) {
    NS.Scene.setCamState(b, 0, BALL_Y);
    for (var i = 0; i < ents.length; i++) {
      var me = ents[i], o = H + i * E, f = b[o + 13];
      me.root.position.set(b[o], b[o + 1], b[o + 2]); me.root.rotation.y = b[o + 3];
      me.body.position.y = b[o + 4]; me.body.rotation.x = b[o + 5]; me.body.rotation.z = b[o + 6];
      me.leftLeg.rotation.x = b[o + 7]; me.rightLeg.rotation.x = b[o + 8];
      me.leftArm.rotation.x = b[o + 9]; me.rightArm.rotation.x = b[o + 10];
      me.leftArm.rotation.z = b[o + 11]; me.rightArm.rotation.z = b[o + 12];
      me.root.visible = (f & 1) !== 0;
      me.card.visible = (f & 2) !== 0;
      if (me.card.visible) me.card.material.color.setHex(f & 4 ? RED : YELLOW);
    }
  }

  function pack(b, dst, off) {
    for (var i = 0; i < FS; i++) {
      var v = Math.round((ANG[i] ? wrapA(b[i]) : b[i]) * SC[i]);
      dst[off + i] = v > 32767 ? 32767 : (v < -32767 ? -32767 : v);
    }
  }

  // frame t (fractional) of a clip -> cur (between its two frames)
  function unpack(clip, t) {
    var a = Math.floor(t), u = t - a;
    if (a >= clip.n - 1) { a = clip.n - 1; u = 0; }
    var d = clip.data, oa = a * FS, ob = u > 0 ? oa + FS : oa;
    for (var i = 0; i < FS; i++) {
      var va = d[oa + i] / SC[i];
      if (SC[i] === 1) { cur[i] = u < 0.5 ? va : d[ob + i]; continue; } // whole numbers: no in-between
      var dv = d[ob + i] / SC[i] - va;
      if (ANG[i]) { if (dv > Math.PI) dv -= TWO_PI; else if (dv < -Math.PI) dv += TWO_PI; }
      cur[i] = va + dv * u;
    }
  }

  // the last n frames of the ring -> a clip of its own
  function cut(n) {
    var have = Math.min(frames, CAP);
    if (n > have) n = have;
    var data = new Int16Array(n * FS);
    for (var k = 0; k < n; k++) {
      var src = ((frames - n + k) % CAP) * FSM;
      for (var i = 0; i < FS; i++) data[k * FS + i] = ring[src + i];
    }
    return { data: data, n: n, goalF: -1 };
  }

  function lenSecs() { var s = World.settings && World.settings.replayLen; return s >= 10 && s <= 20 ? s : 10; }

  function finishGoal() {
    var g = pending;
    pending = null;
    var clip = cut(lenSecs() * HZ + AFTER);
    clip.goalF = Math.max(0, clip.n - 1 - (AFTER - g.after)); // (the frames recorded since the ball went in)
    g.goal.clip = clip;
    clipsKept.push(g.goal);
    if (clipsKept.length > MAX_CLIPS) clipsKept.shift().clip = null; // the oldest replay goes (the goal stays listed)
  }

  /* ---------------------------------------------------------------- the overlay */
  function els() {
    if (ui) return ui;
    ui = {};
    ['replay-ui', 'rp-title', 'rp-sub', 'rp-state', 'rp-fill', 'rp-goal', 'rp-speed', 'rp-help', 'hud'].forEach(function (id) { ui[id] = document.getElementById(id); });
    return ui;
  }
  function key(name, txt) { return '<span class="rp-key">' + name + '</span>' + txt; }
  function helpHtml() {
    var G = NS.Gamepad, T = NS.I18n.t;
    var parts = [];
    if (G && G.live()) {
      var nin = G.kind() === 'nintendo';
      parts.push(key(G.label(nin ? 1 : 0), T('rp.pause')));
      parts.push(key('L ◀ ▶', T('rp.speed')));
      parts.push(key(G.label(nin ? 0 : 1) + ' / ' + G.label(9), T('rp.exit')));
    } else {
      parts.push(key('OK', T('rp.pause')));
      parts.push(key('◀ ▶', T('rp.speed')));
      parts.push(key('▲', T('rp.exit')));
    }
    return parts.join('');
  }

  function speedNow() {
    var x = sx;
    if (dr || kr) x = 1; else if (dl || kl) x = -1;
    if (x > 0.2 || x < -0.2) {
      var a = (Math.abs(x) - 0.2) / 0.8;
      return (x > 0 ? 1 : -1) * (0.25 + 2.75 * a * Math.sqrt(a)); // a little: slow motion; all the way: x3
    }
    return P.paused ? 0 : 1;
  }

  function show(speed) {
    var u = ui;
    var prog = Math.round(P.t / Math.max(1, P.clip.n - 1) * 1000) / 10;
    if (prog !== lastProg) { lastProg = prog; u['rp-fill'].style.transform = 'scaleX(' + (prog / 100) + ')'; }
    var sp = speed === 0 ? '' : (speed < 0 ? '◀◀ ' : '') + (Math.round(Math.abs(speed) * 100) / 100) + '×';
    if (sp !== lastSpeed) { lastSpeed = sp; u['rp-speed'].textContent = sp; }
    var st = speed === 0 ? '❚❚' : (speed < 0 ? '◀' : '▶');
    if (st !== lastState) { lastState = st; u['rp-state'].textContent = st; }
    if (cur[13] !== lastClock) {
      lastClock = cur[13];
      NS.HUD.setClock(Math.floor(lastClock / 60), lastClock % 60);
    }
    var sc = cur[14] + '-' + cur[15];
    if (sc !== lastScore) { lastScore = sc; NS.HUD.setScore(cur[14], cur[15]); }
  }

  function stop() {
    if (!P) return;
    var done = P.onEnd;
    put(live);
    NS.Scene.replayMode(false);
    var u = els();
    u['replay-ui'].classList.add('hidden');
    u.hud.classList.remove('replay-on');
    NS.HUD.show(hudWas);
    var m = World.match;
    NS.HUD.setScore(m.score[0], m.score[1]);
    var secs = Math.floor(m.timeSeconds);
    NS.HUD.setClock(Math.floor(secs / 60), secs % 60);
    P = null;
    endT = performance.now();
    sx = 0; dl = dr = kl = kr = false;
    if (NS.Gamepad) NS.Gamepad.reset();
    NS.Input.releaseAll();
    NS.Input.clearEdges();
    if (done) done();
  }

  NS.Replay = {
    HZ: HZ,
    // a new match: these meshes are filmed (players, then the referee); off = not recorded (debug matches)
    begin: function (meshes, record) {
      if (P) stop();
      ents = meshes.slice(0, MAX_E);
      FS = H + ents.length * E;
      frames = 0; acc = 0; pending = null; clipsKept = [];
      on = !!record;
    },
    // after each step of play (js/main.js)
    step: function (dt) {
      if (!on || P) return;
      acc += dt;
      if (acc < STEP) return;
      acc -= STEP;
      if (acc > STEP) acc = 0;
      grab(cur);
      pack(cur, ring, (frames % CAP) * FSM);
      frames++;
      if (pending && --pending.after <= 0) finishGoal();
    },
    // the ball went in: its clip is cut 2.5 s later (g: the goal of NS.Stats, its clip is filled in then)
    goal: function (g) {
      if (!on || !g) return;
      if (pending) finishGoal();
      pending = { goal: g, after: AFTER };
    },
    // the replay after a goal (Settings): true = it started (onEnd when it is over)
    afterGoal: function (onEnd) {
      if (!on || !World.settings.goalReplay) return false;
      if (pending) finishGoal();
      var g = clipsKept[clipsKept.length - 1];
      if (!g || !g.clip) return false;
      var who = (g.own ? NS.I18n.t('hud.owngoal') + ' ' : '') + g.who + '  ' + g.mins + "'";
      return this.play(g.clip, { auto: true, title: NS.I18n.t('rp.goal'), sub: who, onEnd: onEnd });
    },
    // the last moments of play (the pause menu)
    playLast: function (onEnd) {
      if (!on || frames < HZ) return false;
      return this.play(cut(lenSecs() * HZ), { title: NS.I18n.t('rp.title'), sub: '', onEnd: onEnd });
    },
    // a clip on screen. opts: { auto: leave at the end, title, sub, onEnd }
    play: function (clip, opts) {
      if (P || !clip || clip.n < 2) return false;
      opts = opts || {};
      grab(live);
      P = { clip: clip, t: 0, paused: false, auto: !!opts.auto, onEnd: opts.onEnd || null };
      sx = 0; dl = dr = kl = kr = false;
      var u = els();
      NS.Scene.replayMode(true);
      hudWas = !u.hud.classList.contains('hidden');
      NS.HUD.show(true);
      u.hud.classList.add('replay-on');
      u['rp-title'].textContent = opts.title || NS.I18n.t('rp.title');
      u['rp-sub'].textContent = opts.sub || '';
      u['rp-sub'].classList.toggle('hidden', !opts.sub);
      u['rp-help'].innerHTML = helpHtml();
      u['rp-goal'].classList.toggle('hidden', clip.goalF < 0);
      if (clip.goalF >= 0) u['rp-goal'].style.left = (clip.goalF / Math.max(1, clip.n - 1) * 100) + '%';
      u['replay-ui'].classList.remove('hidden');
      lastProg = -1; lastSpeed = lastState = lastScore = ''; lastClock = -1;
      NS.Audio.crowd(false);
      NS.Input.releaseAll();
      unpack(clip, 0); put(cur); show(1);
      return true;
    },
    active: function () { return !!P; },
    // a button was let go just now: the rest of that press is not for the game
    justEnded: function () { return performance.now() - endT < 450; },
    frame: function (dt) {
      if (!P) return;
      var speed = speedNow();
      P.t += dt * HZ * speed;
      var last = P.clip.n - 1;
      if (P.t >= last) {
        P.t = last;
        if (speed > 0) { if (P.auto) { stop(); return; } P.paused = true; }
      } else if (P.t < 0) P.t = 0;
      unpack(P.clip, P.t);
      put(cur);
      show(speedNow());
    },
    stop: stop,

    // ---- controls (js/core/gamepad.js, js/main.js)
    // a controller button (standard index): A pause / play, B or + exit, D-pad left / right speed
    button: function (i, pressed) {
      if (!P) return;
      var nin = NS.Gamepad && NS.Gamepad.kind() === 'nintendo';
      if (i === 14) { dl = pressed; return; }
      if (i === 15) { dr = pressed; return; }
      if (!pressed) return;
      if (i === (nin ? 1 : 0)) { if (P.t >= P.clip.n - 1) P.t = 0; P.paused = !P.paused; return; }
      if (i === (nin ? 0 : 1) || i === 9) stop();
    },
    stick: function (x) { sx = x; },
    // My PC's actions: the TV remote and the keyboard (a controller's own actions are skipped: its buttons came above)
    action: function (action, pressed, repeat, dev) {
      if (!P || /^pad/.test(dev || '')) return;
      if (action === 'left') { kl = pressed; return; }
      if (action === 'right') { kr = pressed; return; }
      if (!pressed || repeat) return;
      if (action === 'confirm') { if (P.t >= P.clip.n - 1) P.t = 0; P.paused = !P.paused; }
      else if (action === 'up' || action === 'down' || action === 'cancel' || action === 'menu') stop();
    },

    // the goals of the match with their replays (the full-time screen)
    goals: function () { return NS.Stats ? NS.Stats.goals() : []; }
  };
})(window.RS6 = window.RS6 || {});
