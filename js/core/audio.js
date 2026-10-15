/* Synthesized sound effects (no audio assets). One AudioContext, created lazily after onStart, closed in onDestroy. */
(function (NS) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var suspended = false;
  var sfxVolume = 0.8;

  function ensure() {
    if (!enabled || suspended) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  function tone(c, type, f0, f1, vol, start, dur) {
    var osc = c.createOscillator();
    var gain = c.createGain();
    var t0 = c.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    gain.gain.setValueAtTime(vol * sfxVolume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  NS.Audio = {
    setEnabled: function (v) { enabled = !!v; },
    setVolume: function (v) { sfxVolume = v >= 0 && v <= 1 ? v : 0.8; },
    kick: function (heavy) {
      var c = ensure();
      if (!c) return;
      try { tone(c, 'sine', heavy ? 135 : 105, 28, heavy ? 0.35 : 0.22, 0, 0.09); } catch (e) {}
    },
    tackle: function () {
      var c = ensure();
      if (!c) return;
      try { tone(c, 'square', 90, 40, 0.14, 0, 0.12); } catch (e) {}
    },
    whistle: function () {
      var c = ensure();
      if (!c) return;
      try {
        tone(c, 'triangle', 2650, 2650, 0.15, 0, 0.1);
        tone(c, 'triangle', 2800, 2800, 0.15, 0.1, 0.2);
      } catch (e) {}
    },
    goal: function () {
      var c = ensure();
      if (!c) return;
      try {
        for (var i = 0; i < 4; i++) tone(c, 'sawtooth', [261.6, 329.6, 392.0, 523.2][i], [261.6, 329.6, 392.0, 523.2][i], 0.08, i * 0.06, 0.7);
      } catch (e) {}
    },
    // Hosted pause: nothing may make sound until onResume.
    suspend: function () {
      suspended = true;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {});
    },
    resume: function () {
      suspended = false;
    },
    close: function () {
      suspended = true;
      if (ctx) { try { ctx.close(); } catch (e) {} }
      ctx = null;
    }
  };
})(window.RS6 = window.RS6 || {});
