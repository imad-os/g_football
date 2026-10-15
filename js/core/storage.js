/* Saves through MyPC.save / MyPC.load (per My PC profile, backed up by My PC). Scores through MyPC.submitScore. */
(function (NS) {
  'use strict';

  var stats = { wins: 0, cups: 0, goals: 0 };
  var settings = null;

  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0; }

  NS.Storage = {
    // Call from onInit (MyPC.load is available there).
    load: function () {
      var s = MyPC.load('stats', null);
      if (s && typeof s === 'object') {
        stats.wins = num(s.wins);
        stats.cups = num(s.cups);
        stats.goals = num(s.goals);
      }
      var saved = MyPC.load('settings', null);
      settings = NS.mergeSettings(MyPC.app_config, saved);
      NS.Bindings.load(MyPC.load('bindings', null));
      return settings;
    },
    getSettings: function () { return settings; },
    saveBindings: function () { MyPC.save('bindings', NS.Bindings.serialize()); },
    getStats: function () { return stats; },
    saveSettings: function () {
      MyPC.save('settings', settings);
    },
    setSetting: function (key, value) {
      if (NS.validSetting(key, value) === undefined) return false;
      settings[key] = value;
      this.saveSettings();
      return true;
    },
    resetSettings: function () {
      var fresh = NS.mergeSettings(MyPC.app_config, null);
      for (var k in fresh) settings[k] = fresh[k]; // same object: World.settings keeps pointing at it
      this.saveSettings();
      return settings;
    },
    addResult: function (won, goals, cup) {
      stats.wins += won;
      stats.goals += goals;
      stats.cups += cup;
      MyPC.save('stats', stats);
    },
    // Points of one finished match: goals, a bonus for winning/drawing, a cup bonus. Nothing for CPU vs CPU.
    submitMatchScore: function (goalsFor, goalsAgainst, cupWon) {
      var pts = goalsFor * 100 + (goalsFor > goalsAgainst ? 300 : (goalsFor === goalsAgainst ? 100 : 0)) + (cupWon ? 500 : 0) -
        goalsAgainst * 25;
      if (pts < 0) pts = 0;
      MyPC.submitScore(pts);
      return pts;
    }
  };
})(window.RS6 = window.RS6 || {});
