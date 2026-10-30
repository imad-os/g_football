/* Graphics quality tiers. AUTO starts from My PC's info.quality.tier and adapts to the measured frame rate. In every
 * mode the picture's size also adapts (dynamic resolution): a frame rate under the screen's draws a little smaller
 * picture, stretched to the screen, before any detail is given up. */
(function (NS) {
  'use strict';

  // maxW: the widest picture drawn (pixels across; a bigger window is drawn at this size and stretched).
  // litPlayers: the players lit by the sun as they turn (HIGH), else the same light painted on them once (cheaper)
  var TIERS = {
    LOW: { name: 'LOW', pixelRatio: 0.65, maxW: 1120, useLighting: false, litPlayers: false, pitchStripes: false, crowdCount: 0 },
    MEDIUM: { name: 'MED', pixelRatio: 0.85, maxW: 1440, useLighting: true, litPlayers: false, pitchStripes: true, crowdCount: 45 },
    HIGH: { name: 'HIGH', pixelRatio: 1.0, maxW: 1920, useLighting: true, litPlayers: true, pitchStripes: true, crowdCount: 140 }
  };
  var SCALES = [1, 0.875, 0.75]; // the picture's size steps (dynamic resolution)

  var selectedMode = 'AUTO';
  var activeKey = 'MEDIUM';
  var startKey = 'MEDIUM';
  var onChange = null;
  var onFps = null;
  var frames = 0;
  var acc = 0;
  var cooldown = 3;
  var lastFps = 60;
  var climbs = 0;
  var sIdx = 0;      // SCALES[sIdx] now
  var sUps = 0;      // times the picture grew back (3 at most: no see-saw)
  var screenFps = 60; // the screen's own frame rate (60, or 50 on a 50 Hz TV): see frame()
  var maxDt = 0;      // the longest frame of this second

  function notify() {
    if (onChange) onChange(TIERS[activeKey], selectedMode);
  }
  function setTier(key, cd) { activeKey = key; sIdx = 0; cooldown = cd; notify(); }

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
      frames = 0; acc = 0; cooldown = 3; climbs = 0; sIdx = 0; sUps = 0;
      notify();
    },
    mode: function () { return selectedMode; },
    tier: function () { return TIERS[activeKey]; },
    scale: function () { return SCALES[sIdx]; },
    label: function () {
      var t = selectedMode === 'AUTO' ? 'AUTO (' + TIERS[activeKey].name + ')' : TIERS[activeKey].name;
      return sIdx ? t + ' ' + Math.round(SCALES[sIdx] * 100) + '%' : t;
    },
    // Called once per rendered frame with the real frame time in seconds.
    frame: function (dt) {
      frames++;
      acc += dt;
      if (dt > maxDt) maxDt = dt;
      if (acc < 1) return;
      var fps = Math.round(frames / acc);
      frames = 0; acc = 0;
      if (fps !== lastFps) { lastFps = fps; if (onFps) onFps(fps); }
      // the screen's own rate: a 50 Hz TV shows 50 even frames (20 ms each); a slow game on a 60 Hz one mixes 17 and
      // 33 ms frames. Faster screens (up to 75 Hz) show it by themselves.
      if (fps >= 49 && fps <= 51 && maxDt < 0.024) screenFps = 50;
      else if (fps > screenFps && fps <= 75) screenFps = fps;
      maxDt = 0;
      if (cooldown > 0) { cooldown--; return; }
      var slow = fps < screenFps * 0.93, smooth = fps >= screenFps - 1;
      // the picture's size first, in every mode
      if (slow && sIdx < SCALES.length - 1) { sIdx++; cooldown = 2; notify(); return; }
      if (smooth && sIdx > 0 && sUps < 3) { sIdx--; sUps++; cooldown = 8; notify(); return; }
      if (selectedMode !== 'AUTO') return;
      // AUTO: still slow with the smallest picture: less detail (and the full picture again)
      if (slow && activeKey === 'HIGH') setTier('MEDIUM', 3);
      else if (slow && activeKey === 'MEDIUM') setTier('LOW', 3);
      else if (smooth && activeKey === 'LOW' && startKey !== 'LOW') setTier('MEDIUM', 6);
      // back up to HIGH after a dip (a loading hitch), twice at most, so a TV that cannot hold HIGH does not see-saw
      else if (smooth && activeKey === 'MEDIUM' && startKey === 'HIGH' && climbs < 2) { climbs++; setTier('HIGH', 8); }
    },
    resetTimer: function () { frames = 0; acc = 0; }
  };
})(window.RS6 = window.RS6 || {});
