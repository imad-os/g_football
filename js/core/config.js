/* Shared constants, default settings and the settings schema (single source of truth). */
(function (NS) {
  'use strict';

  NS.VERSION = '1.25.0';

  // Pitch geometry (world units; x = length, z = width, y = up). The players and the goal are drawn ~1.5x real size,
  // so the markings around the goal are the real ones scaled to the goal (BOX_K), not to the pitch: the boxes look
  // like a real penalty area next to the players. The pitch size comes from the stadium (NS.usePitch).
  NS.GOAL_HALF_W = 5.6;
  var BOX_K = 1.25;
  NS.BOX_D = 16.5 * BOX_K;                  // penalty area: depth and half width
  NS.BOX_HW = NS.GOAL_HALF_W + 16.5 * BOX_K;
  NS.SIX_D = 5.5 * BOX_K;                   // goal area
  NS.SIX_HW = NS.GOAL_HALF_W + 5.5 * BOX_K;
  NS.PEN_D = 11 * BOX_K;                    // penalty spot
  NS.CIRCLE_R = 9.15 * BOX_K;               // centre circle and penalty arc

  // Stadiums: each one its own pitch size and grass (Settings > Stadium)
  NS.STADIUMS = {
    COMPACT: { w: 100, h: 64, grass: ['#1f7234', '#26843d'] },
    CLASSIC: { w: 110, h: 72, grass: ['#1d6e32', '#25803b'] },
    GRAND: { w: 120, h: 78, grass: ['#22763a', '#2a8a45'] },
    MEGA: { w: 130, h: 86, grass: ['#1b6a30', '#237c3a'] },
    ULTRA: { w: 200, h: 130, grass: ['#1e6f33', '#27833e'] } // a real pitch's shape (105 x 68) at the players' size and more
  };
  // Mowing patterns of the grass: one is drawn at random for every match (js/render/assets.js)
  NS.PITCH_DESIGNS = ['STRIPES', 'CHECKS', 'RINGS', 'DIAGONAL', 'PLAID'];
  NS.pitchDesign = 0;
  NS.PITCH_HALF_W = 55;
  NS.PITCH_HALF_H = 36;
  NS.PITCH_SCALE = NS.PITCH_HALF_W / 46; // crowd spacing
  NS.stadium = NS.STADIUMS.CLASSIC;
  NS.stadiumId = 'CLASSIC';
  // Modules keep their own copies of the pitch size: they register here and are told when it changes.
  NS.pitchHooks = [];
  NS.usePitch = function (id) {
    var s = NS.STADIUMS[id] || NS.STADIUMS.CLASSIC;
    NS.stadium = s;
    NS.stadiumId = NS.STADIUMS[id] ? id : 'CLASSIC';
    NS.PITCH_HALF_W = s.w / 2;
    NS.PITCH_HALF_H = s.h / 2;
    NS.PITCH_SCALE = NS.PITCH_HALF_W / 46;
    for (var i = 0; i < NS.pitchHooks.length; i++) NS.pitchHooks[i]();
  };
  NS.GOAL_DEPTH = 2.6;
  NS.GOAL_HEIGHT = 3.6;
  NS.BALL_R = 0.432; // 10% smaller than the original 0.48

  // Debug matches (js/game/debug.js): the event counter, null outside a debug run
  NS.dbg = null;

  // Fixed simulation step (the loop runs a 60 Hz accumulator)
  NS.STEP = 1 / 60;

  // Kick types
  NS.ACT = { NONE: 0, PASS: 1, THROUGH: 2, LONG: 3, SHOOT: 4, CURVE: 5, CHIP: 6 };

  // Defaults. Owner can override them without code in mypc-app.json "config" (MyPC.app_config).
  NS.DEFAULT_SETTINGS = {
    quality: 'AUTO',
    difficulty: 'NORMAL',
    teamSize: 11,
    stadium: 'CLASSIC',
    durationMins: 3,
    gameSpeed: 1.0,
    gaugeTime: 0.5,
    cameraMode: 'WIDE',
    ballSkin: 'CLASSIC',
    switchMode: 'AUTO',
    randomEnds: false,
    soundEnabled: true,
    crowdChants: true,
    showRadar: true,
    showFPS: false
  };

  // Settings groups (the tabs of the Settings screen)
  NS.SETTING_GROUPS = [['game', 'set.g.game'], ['video', 'set.g.video'], ['audio', 'set.g.audio'], ['aima', 'set.g.aima']];

  // Settings schema: drives the Settings screen, validation and the app_config merge.
  NS.SETTING_DEFS = [
    { key: 'difficulty', group: 'game', label: 'set.difficulty', hint: 'set.difficulty.h',
      options: [['EASY', 'opt.easy'], ['NORMAL', 'opt.normal'], ['HARD', 'opt.hard'], ['LEGEND', 'opt.legend'], ['AIMA', 'opt.aima']] },
    // players per team (applies from the next match)
    { key: 'teamSize', group: 'game', label: 'set.teamsize', hint: 'set.teamsize.h',
      options: [[11, 'opt.t11'], [7, 'opt.t7']] },
    // the stadium: pitch size (applies from the next match)
    { key: 'stadium', group: 'game', label: 'set.stadium', hint: 'set.stadium.h',
      options: [['COMPACT', 'opt.st.compact'], ['CLASSIC', 'opt.st.classic'], ['GRAND', 'opt.st.grand'], ['MEGA', 'opt.st.mega'], ['ULTRA', 'opt.st.ultra']] },
    { key: 'durationMins', group: 'game', label: 'set.duration', hint: 'set.duration.h',
      options: [[3, 'opt.min3'], [5, 'opt.min5'], [10, 'opt.min10']] },
    { key: 'gameSpeed', group: 'game', label: 'set.pace', hint: 'set.pace.h',
      options: [[0.88, 'opt.slow'], [1.0, 'opt.normal'], [1.18, 'opt.fast']] },
    // seconds the power bar takes to fill (shots, passes)
    { key: 'gaugeTime', group: 'game', label: 'set.gauge', hint: 'set.gauge.h',
      options: [[1.0, 'opt.slow'], [0.75, 'opt.normal'], [0.5, 'opt.fast'], [0.35, 'opt.vfast']] },
    { key: 'switchMode', group: 'game', label: 'set.switch', hint: 'set.switch.h',
      options: [['AUTO', 'opt.auto'], ['MANUAL', 'opt.manual']] },
    // first-half ends: home on the left, or drawn at random (the teams swap ends at half time either way)
    { key: 'randomEnds', group: 'game', label: 'set.ends', hint: 'set.ends.h',
      options: [[false, 'opt.ends.home'], [true, 'opt.ends.random']] },
    { key: 'cameraMode', group: 'video', label: 'set.camera', hint: 'set.camera.h',
      options: [['CLOSE', 'opt.dynamic'], ['WIDE', 'opt.wide'], ['BLIMP', 'opt.blimp']] },
    { key: 'ballSkin', group: 'video', label: 'set.ball', hint: 'set.ball.h',
      options: [['CLASSIC', 'opt.ball.classic'], ['PRO', 'opt.ball.pro'], ['NIGHT', 'opt.ball.night'], ['RETRO', 'opt.ball.retro'], ['GOLD', 'opt.ball.gold']] },
    { key: 'quality', group: 'video', label: 'set.quality', hint: 'set.quality.h',
      options: [['AUTO', 'opt.auto'], ['LOW', 'opt.low'], ['MEDIUM', 'opt.med'], ['HIGH', 'opt.high']] },
    { key: 'soundEnabled', group: 'audio', label: 'set.sound', hint: 'set.sound.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    { key: 'crowdChants', group: 'audio', label: 'set.chants', hint: 'set.chants.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    { key: 'showRadar', group: 'video', label: 'set.radar', hint: 'set.radar.h',
      options: [[true, 'opt.show'], [false, 'opt.hide']] },
    { key: 'showFPS', group: 'video', label: 'set.fps', hint: 'set.fps.h',
      options: [[true, 'opt.show'], [false, 'opt.hide']] }
  ];

  // Returns the validated value for a setting, or undefined when it is not allowed.
  NS.validSetting = function (key, value) {
    for (var i = 0; i < NS.SETTING_DEFS.length; i++) {
      var def = NS.SETTING_DEFS[i];
      if (def.key !== key) continue;
      for (var j = 0; j < def.options.length; j++) {
        if (def.options[j][0] === value) return value;
      }
      return undefined;
    }
    return undefined;
  };

  // defaults <- app_config (owner) <- saved (player), each key validated.
  NS.mergeSettings = function (appConfig, saved) {
    var out = {};
    var k;
    for (k in NS.DEFAULT_SETTINGS) out[k] = NS.DEFAULT_SETTINGS[k];
    var layers = [appConfig, saved];
    for (var i = 0; i < layers.length; i++) {
      var src = layers[i];
      if (!src || typeof src !== 'object') continue;
      for (k in NS.DEFAULT_SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(src, k) && NS.validSetting(k, src[k]) !== undefined) out[k] = src[k];
      }
    }
    return out;
  };
})(window.RS6 = window.RS6 || {});
