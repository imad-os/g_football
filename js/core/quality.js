/* Graphics quality tiers. AUTO starts from My PC's info.quality.tier and adapts to the measured frame rate. */
(function (NS) {
  'use strict';

  var TIERS = {
    LOW: { name: 'LOW', pixelRatio: 0.65, useLighting: false, pitchStripes: false, crowdCount: 0 },
    MEDIUM: { name: 'MED', pixelRatio: 0.85, useLighting: true, pitchStripes: true, crowdCount: 45 },
    HIGH: { name: 'HIGH', pixelRatio: 1.0, useLighting: true, pitchStripes: true, crowdCount: 140 }
  };

  var selectedMode = 'AUTO';
  var activeKey = 'MEDIUM';
  var startKey = 'MEDIUM';
  var onChange = null;
  var onFps = null;
  var frames = 0;
  var acc = 0;
  var cooldown = 3;
  var lastFps = 60;

  function notify() {
    if (onChange) onChange(TIERS[activeKey], selectedMode);
  }

  NS.Quality = {
    init: function (hostTier, changeCb, fpsCb) {
      onChange = changeCb;
      onFps = fpsCb;
      startKey = hostTier === 'low' ? 'LOW' : (hostTier === 'high' ? 'HIGH' : 'MEDIUM');
      activeKey = startKey;
    },
    apply: function (mode) {
      selectedMode = mode;
      activeKey = mode === 'AUTO' ? startKey : mode;
      frames = 0; acc = 0; cooldown = 3;
      notify();
    },
    mode: function () { return selectedMode; },
    tier: function () { return TIERS[activeKey]; },
    label: function () { return selectedMode === 'AUTO' ? 'AUTO (' + TIERS[activeKey].name + ')' : TIERS[activeKey].name; },
    // Called once per rendered frame with the real frame time in seconds.
    frame: function (dt) {
      frames++;
      acc += dt;
      if (acc < 1) return;
      var fps = Math.round(frames / acc);
      frames = 0; acc = 0;
      if (fps !== lastFps) { lastFps = fps; if (onFps) onFps(fps); }
      if (selectedMode !== 'AUTO') return;
      if (cooldown > 0) { cooldown--; return; }
      if (fps < 46 && activeKey === 'HIGH') { activeKey = 'MEDIUM'; cooldown = 3; notify(); }
      else if (fps < 44 && activeKey === 'MEDIUM') { activeKey = 'LOW'; cooldown = 3; notify(); }
      else if (fps >= 58 && activeKey === 'LOW' && startKey !== 'LOW') { activeKey = 'MEDIUM'; cooldown = 6; notify(); }
    },
    resetTimer: function () { frames = 0; acc = 0; }
  };
})(window.RS6 = window.RS6 || {});
