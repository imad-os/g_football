/* Shared constants, default settings and the settings schema (single source of truth). */
(function (NS) {
  'use strict';

  NS.VERSION = '1.13.0';

  // Pitch geometry (world units; x = length, z = width, y = up)
  // The pitch is 20% bigger than the original 92 x 56 (PITCH_SCALE also scales the formations).
  NS.PITCH_SCALE = 1.2;
  NS.PITCH_HALF_W = 46 * NS.PITCH_SCALE;
  NS.PITCH_HALF_H = 28 * NS.PITCH_SCALE;
  NS.GOAL_HALF_W = 5.6;
  NS.GOAL_DEPTH = 2.6;
  NS.GOAL_HEIGHT = 3.6;
  NS.BALL_R = 0.432; // 10% smaller than the original 0.48

  // Fixed simulation step (the loop runs a 60 Hz accumulator)
  NS.STEP = 1 / 60;

  // Kick types
  NS.ACT = { NONE: 0, PASS: 1, THROUGH: 2, LONG: 3, SHOOT: 4, CURVE: 5, CHIP: 6 };

  // Defaults. Owner can override them without code in mypc-app.json "config" (MyPC.app_config).
  NS.DEFAULT_SETTINGS = {
    quality: 'AUTO',
    difficulty: 'NORMAL',
    durationMins: 3,
    gameSpeed: 1.0,
    gaugeTime: 0.5,
    cameraMode: 'WIDE',
    ballSkin: 'CLASSIC',
    switchMode: 'AUTO',
    soundEnabled: true,
    crowdChants: true,
    showRadar: true,
    showFPS: false
  };

  // Settings groups (the tabs of the Settings screen)
  NS.SETTING_GROUPS = [['game', 'set.g.game'], ['video', 'set.g.video'], ['audio', 'set.g.audio']];

  // Settings schema: drives the Settings screen, validation and the app_config merge.
  NS.SETTING_DEFS = [
    { key: 'difficulty', group: 'game', label: 'set.difficulty', hint: 'set.difficulty.h',
      options: [['EASY', 'opt.easy'], ['NORMAL', 'opt.normal'], ['HARD', 'opt.hard'], ['LEGEND', 'opt.legend']] },
    { key: 'durationMins', group: 'game', label: 'set.duration', hint: 'set.duration.h',
      options: [[3, 'opt.min3'], [5, 'opt.min5'], [10, 'opt.min10']] },
    { key: 'gameSpeed', group: 'game', label: 'set.pace', hint: 'set.pace.h',
      options: [[0.88, 'opt.slow'], [1.0, 'opt.normal'], [1.18, 'opt.fast']] },
    // seconds the power bar takes to fill (shots, passes)
    { key: 'gaugeTime', group: 'game', label: 'set.gauge', hint: 'set.gauge.h',
      options: [[1.0, 'opt.slow'], [0.75, 'opt.normal'], [0.5, 'opt.fast'], [0.35, 'opt.vfast']] },
    { key: 'switchMode', group: 'game', label: 'set.switch', hint: 'set.switch.h',
      options: [['AUTO', 'opt.auto'], ['MANUAL', 'opt.manual']] },
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
