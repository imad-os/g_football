/* Shared constants, default settings and the settings schema (single source of truth). */
(function (NS) {
  'use strict';

  NS.VERSION = '1.47.0';

  // Pitch geometry (world units; x = length, z = width, y = up). NS.M: world units per metre, from the players: an
  // average footballer (1.81 m) is 2.9 units tall. Everything is at real size at that scale: the ball, the players,
  // the goal and every marking (the laws of the game); only the pitch's length and width come from the stadium.
  NS.M = 1.6;
  NS.GOAL_HALF_W = 7.32 / 2 * NS.M;          // goal: 7.32 x 2.44 m (between the posts, under the bar)
  NS.GOAL_HEIGHT = 2.44 * NS.M;
  NS.GOAL_DEPTH = 2 * NS.M;                  // the net, 2 m deep
  NS.POST_R = 0.06 * NS.M;                   // posts and bar 12 cm wide
  NS.BOX_D = 16.5 * NS.M;                    // penalty area: 16.5 m deep, 16.5 m either side of the posts
  NS.BOX_HW = NS.GOAL_HALF_W + 16.5 * NS.M;
  NS.SIX_D = 5.5 * NS.M;                     // goal area: 5.5 m
  NS.SIX_HW = NS.GOAL_HALF_W + 5.5 * NS.M;
  NS.PEN_D = 11 * NS.M;                      // penalty spot: 11 m
  NS.CIRCLE_R = 9.15 * NS.M;                 // centre circle and penalty arc: 9.15 m
  NS.CORNER_R = 1 * NS.M;                    // corner arcs: 1 m

  // Stadiums: each one its own pitch size (length x width in metres x NS.M) and grass (Settings > Stadium)
  function pitch(l, w, grass) { return { w: l * NS.M, h: w * NS.M, l: l, wm: w, grass: grass }; }
  NS.STADIUMS = {
    COMPACT: pitch(65, 45, ['#1f7234', '#26843d']),     // 7-a-side (the real penalty area still fits across it)
    SMALL: pitch(75, 48.75, ['#22763a', '#2a8a45']),
    STANDARD: pitch(85, 55, ['#1d6e32', '#25803b']),
    GRAND: pitch(105, 68, ['#1b6a30', '#237c3a']),      // a real pitch (FIFA's 105 x 68)
    ULTRA: pitch(110, 72, ['#1e6f33', '#27833e'])
  };
  // Mowing patterns of the grass: one is drawn at random for every match (js/render/assets.js)
  NS.PITCH_DESIGNS = ['STRIPES', 'CHECKS', 'RINGS', 'DIAGONAL', 'PLAID'];
  NS.pitchDesign = 0;
  NS.stadium = NS.STADIUMS.SMALL;
  NS.stadiumId = 'SMALL';
  NS.PITCH_HALF_W = NS.stadium.w / 2;
  NS.PITCH_HALF_H = NS.stadium.h / 2;
  NS.PITCH_SCALE = NS.PITCH_HALF_W / 46; // crowd spacing
  // Modules keep their own copies of the pitch size: they register here and are told when it changes.
  NS.pitchHooks = [];
  NS.usePitch = function (id) {
    var s = NS.STADIUMS[id] || NS.STADIUMS.SMALL;
    NS.stadium = s;
    NS.stadiumId = NS.STADIUMS[id] ? id : 'SMALL';
    NS.PITCH_HALF_W = s.w / 2;
    NS.PITCH_HALF_H = s.h / 2;
    NS.PITCH_SCALE = NS.PITCH_HALF_W / 46;
    for (var i = 0; i < NS.pitchHooks.length; i++) NS.pitchHooks[i]();
  };
  // A real size 5 ball: 68-70 cm round, 22 cm across, about 1/8 of a player's height (it fits between his legs)
  NS.BALL_R = 0.11 * NS.M;
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
    stadium: 'SMALL',
    durationMins: 3,
    gameSpeed: 1.0,
    gaugeTime: 0.5,
    cameraMode: 'WIDE',
    ballSkin: 'CLASSIC',
    ballSize: 1.0,
    playerModel: 'ATHLETE',
    playerDetail: 'AUTO',
    switchMode: 'AUTO',
    randomEnds: false,
    soundEnabled: true,
    crowdChants: true,
    showRadar: true,
    showFPS: false,
    replayLen: 10,
    goalReplay: true,
    commentary: true,
    commLang: 'AUTO',
    commVoice: 'MALE',
    commVolume: 0.85,
    commTalk: 'NORMAL',
    commSubs: true,
    commFallback: 'EN',
    commDuck: true
  };

  // Settings groups (the tabs of the Settings screen)
  NS.SETTING_GROUPS = [['game', 'set.g.game'], ['video', 'set.g.video'], ['audio', 'set.g.audio'], ['comm', 'set.g.comm'], ['aima', 'set.g.aima']];

  // Settings schema: drives the Settings screen, validation and the app_config merge.
  NS.SETTING_DEFS = [
    { key: 'difficulty', group: 'game', label: 'set.difficulty', hint: 'set.difficulty.h',
      options: [['EASY', 'opt.easy'], ['NORMAL', 'opt.normal'], ['HARD', 'opt.hard'], ['LEGEND', 'opt.legend'], ['AIMA', 'opt.aima']] },
    // players per team (applies from the next match)
    { key: 'teamSize', group: 'game', label: 'set.teamsize', hint: 'set.teamsize.h',
      options: [[11, 'opt.t11'], [7, 'opt.t7']] },
    // the stadium: pitch size (applies from the next match)
    { key: 'stadium', group: 'game', label: 'set.stadium', hint: 'set.stadium.h',
      options: [['COMPACT', 'opt.st.compact'], ['SMALL', 'opt.st.small'], ['STANDARD', 'opt.st.standard'], ['GRAND', 'opt.st.grand'], ['ULTRA', 'opt.st.ultra']] },
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
    // how big the ball is drawn (only the picture: its physics keep the real size)
    { key: 'ballSize', group: 'video', label: 'set.ballsize', hint: 'set.ballsize.h',
      options: [[1.0, 'opt.bs.small'], [1.1, 'opt.bs.normal'], [1.2, 'opt.bs.big']] },
    // the players' bodies: blocks, a real footballer's build (heights, hair, boots vary), or a big-headed toon
    { key: 'playerModel', group: 'video', label: 'set.model', hint: 'set.model.h',
      options: [['ATHLETE', 'opt.model.athlete'], ['CLASSIC', 'opt.model.classic'], ['TOON', 'opt.model.toon']] },
    // polygons of the rounded bodies and of the ball: more sides = rounder (AUTO follows the graphics quality)
    { key: 'playerDetail', group: 'video', label: 'set.detail', hint: 'set.detail.h',
      options: [['AUTO', 'opt.auto'], ['LOW', 'opt.low'], ['MEDIUM', 'opt.med'], ['HIGH', 'opt.high'], ['ULTRA', 'opt.ultra']] },
    { key: 'quality', group: 'video', label: 'set.quality', hint: 'set.quality.h',
      options: [['AUTO', 'opt.auto'], ['LOW', 'opt.low'], ['MEDIUM', 'opt.med'], ['HIGH', 'opt.high']] },
    { key: 'soundEnabled', group: 'audio', label: 'set.sound', hint: 'set.sound.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    { key: 'crowdChants', group: 'audio', label: 'set.chants', hint: 'set.chants.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    { key: 'showRadar', group: 'video', label: 'set.radar', hint: 'set.radar.h',
      options: [[true, 'opt.show'], [false, 'opt.hide']] },
    { key: 'showFPS', group: 'video', label: 'set.fps', hint: 'set.fps.h',
      options: [[true, 'opt.show'], [false, 'opt.hide']] },
    // replays: seconds shown (the last moments, each goal), and the replay after a goal
    { key: 'replayLen', group: 'video', label: 'set.replay', hint: 'set.replay.h',
      options: [[10, 'opt.s10'], [15, 'opt.s15'], [20, 'opt.s20']] },
    { key: 'goalReplay', group: 'video', label: 'set.goalrep', hint: 'set.goalrep.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    // the voice commentator (js/game/commentary.js): off = nothing is loaded and it never runs
    { key: 'commentary', group: 'comm', label: 'set.comm', hint: 'set.comm.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] },
    { key: 'commLang', group: 'comm', label: 'set.commlang', hint: 'set.commlang.h',
      options: [['AUTO', 'opt.auto'], ['EN', 'English'], ['FR', 'Français'], ['ES', 'Español'], ['AR', 'العربية']] },
    { key: 'commVoice', group: 'comm', label: 'set.commvoice', hint: 'set.commvoice.h',
      options: [['MALE', 'opt.comm.male'], ['FEMALE', 'opt.comm.female']] },
    { key: 'commVolume', group: 'comm', label: 'set.commvol', hint: 'set.commvol.h',
      options: [[0.6, 'opt.low'], [0.85, 'opt.med'], [1, 'opt.high']] },
    { key: 'commTalk', group: 'comm', label: 'set.commtalk', hint: 'set.commtalk.h',
      options: [['CALM', 'opt.comm.calm'], ['NORMAL', 'opt.normal'], ['CHATTY', 'opt.comm.chatty']] },
    { key: 'commSubs', group: 'comm', label: 'set.commsubs', hint: 'set.commsubs.h',
      options: [[true, 'opt.show'], [false, 'opt.hide']] },
    { key: 'commFallback', group: 'comm', label: 'set.commfb', hint: 'set.commfb.h',
      options: [['EN', 'opt.comm.english'], ['TEXT', 'opt.comm.text'], ['SILENT', 'opt.comm.silent']] },
    { key: 'commDuck', group: 'comm', label: 'set.commduck', hint: 'set.commduck.h',
      options: [[true, 'opt.on'], [false, 'opt.off']] }
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
