/* Match audio, all synthesized (no audio files to download or decode on the TV).
 *
 * One-shot effects (ball strike, tackle, post, net, claps, drum) are generated once with ZzFX (MIT, vendor/zzfx.js) and
 * kept as AudioBuffers. The referee whistle is an FM "pea" whistle. The crowd is two looped noise beds (murmur + roar)
 * whose level and brightness follow the danger on the pitch, with swells for chances and goals, and chants that are
 * composed on the fly (random melody, key, tempo, vowels, claps or drum, side of the stadium), never the same loop.
 *
 * One AudioContext, created lazily after onStart (first sound), closed in onDestroy.
 */
(function (NS) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var chantsOn = true;
  var suspended = false;
  var sfxVolume = 0.8;

  var master = null, sfxBus = null, crowdBus = null;
  var buf = {};                 // prebuilt effect buffers
  var noiseBuf = null;
  var murmurG = null, murmurF = null, roarG = null, roarF = null;
  var crowdLive = false;
  var excite = 0;               // 0..1, smoothed
  var chantT = 6;               // seconds to the next chant
  var chantBusyUntil = 0;
  var lastSent = -1;            // crowd levels are not re-sent before this time (a swell is playing, or rate limit)
  var sentExcite = -1;

  // chant melodies in semitones (0 = key root); -99 = rest
  var MELODIES = [
    [0, 0, 4, 7, 7, 4, 0, -99],        // "o-le, o-le-o-le"
    [7, 7, 7, 5, 4, 4, 2, -99],
    [0, 4, 0, 4, 7, 7, 7, -99],
    [0, 2, 4, 5, 7, -99, 7, -99],
    [4, 4, 4, 0, 2, 2, 2, -99],
    [0, 0, 0, -99, 0, 0, 0, -99]       // "we-will-win" style shout
  ];
  // formant pairs for sung vowels: o, e, a, u
  var VOWELS = [[500, 900], [420, 1900], [750, 1200], [350, 750]];
  var CLAPS = [
    [0, 0.5, 1, 1.25, 1.5],            // clap clap clap-clap-clap
    [0, 0.5, 1, 1.5],
    [0, 0.25, 0.5, 1, 1.5, 1.75]
  ];

  function ensure() {
    if (!enabled || suspended) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); build(); } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  // AudioBuffer from samples, normalized to a 0.9 peak (no clipping when layers are mixed)
  function toBuffer(samples) {
    var pk = 0;
    for (var i = 0; i < samples.length; i++) { var v = samples[i] < 0 ? -samples[i] : samples[i]; if (v > pk) pk = v; }
    if (pk > 0.9) { var k = 0.9 / pk; for (var j = 0; j < samples.length; j++) samples[j] *= k; }
    var b = ctx.createBuffer(1, samples.length, 44100);
    b.getChannelData(0).set(samples);
    return b;
  }

  function mix(a, b, gb) {
    var out = new Float32Array(Math.max(a.length, b.length));
    for (var i = 0; i < out.length; i++) out[i] = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] * gb : 0);
    return out;
  }

  // A foot striking a ball: the ball's body (a low thud whose pitch drops fast as the ball leaves the boot, gone in a few
  // hundredths of a second), the contact click (a very short burst of mid / high noise) and, for a shot, a faint rush of
  // air after it. f0 -> f1 body pitch (Hz), decay (s), click level, whoosh level. Rendered once into samples.
  function strike(dur, f0, f1, decay, click, whoosh) {
    var sr = 44100, n = Math.floor(sr * dur);
    var out = new Float32Array(n);
    var ph = 0, lp = 0, lp2 = 0, hpPrev = 0, hp = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var f = f1 + (f0 - f1) * Math.exp(-t / 0.018);
      ph += 2 * Math.PI * f / sr;
      var body = Math.sin(ph) * Math.exp(-t / decay) * (t < 0.002 ? t / 0.002 : 1);
      var w = Math.random() * 2 - 1;
      lp += 0.35 * (w - lp);               // band-limit the noise: low-pass ~3 kHz...
      hp = lp - lp2; lp2 += 0.06 * (lp - lp2); // ...minus a ~400 Hz low-pass = a mid band
      var clk = hp * Math.exp(-t / 0.005) * click * 2.2;
      var air = 0;
      if (whoosh) { hpPrev += 0.5 * (w - hpPrev); air = (w - hpPrev) * whoosh * Math.exp(-Math.pow((t - 0.07) / 0.06, 2)); }
      out[i] = body + clk + air;
    }
    return out;
  }

  // Builds the buses, effect buffers and the crowd beds (once).
  function build() {
    master = ctx.createGain();
    master.gain.value = sfxVolume;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    crowdBus = ctx.createGain();
    crowdBus.gain.value = 0;
    crowdBus.connect(master);

    var Z = window.ZZFX;
    if (Z) {
      // ZzFX parameters: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
      // pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
      // (filter: negative = low-pass, positive = high-pass, in Hz)
      // ball strikes: a modelled leather "thock" (see strike()) instead of synth tones
      buf.kick = toBuffer(strike(0.12, 210, 105, 0.022, 0.35, 0));
      buf.shot = toBuffer(strike(0.28, 150, 68, 0.038, 0.6, 0.12));
      var scuff = Z.buildSamples(0.6, 0.1, 300, 0.01, 0.06, 0.18, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1100);
      buf.tackle = toBuffer(mix(scuff, Z.buildSamples(0.8, 0, 70, 0.001, 0.01, 0.12, 0, 1, -0.8), 0.8));
      // the post: inharmonic metal partials ringing out
      var clang = Z.buildSamples(0.6, 0, 523, 0, 0.02, 0.9, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.05);
      clang = mix(clang, Z.buildSamples(0.35, 0, 1307, 0, 0.01, 0.6), 1);
      clang = mix(clang, Z.buildSamples(0.2, 0, 2213, 0, 0.01, 0.35), 1);
      buf.post = toBuffer(clang);
      buf.net = toBuffer(Z.buildSamples(0.5, 0.1, 900, 0.02, 0.15, 0.35, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2500));
      buf.clap = toBuffer(Z.buildSamples(0.7, 0.2, 1700, 0, 0, 0.05, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 900));
      buf.drum = toBuffer(Z.buildSamples(1, 0.05, 62, 0.002, 0.03, 0.3, 0, 1, -0.4, 0, 0, 0, 0, 0.1, 0, 0, 0, 1, 0.05, 0, -400));
    }

    // 3 s of brown-ish noise (looped) for the crowd beds
    var n = ctx.sampleRate * 3;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.06 * w) / 1.06;
      d[i] = last * 3.2 + w * 0.12;
    }
    // murmur: the stadium breathing, low and wide
    var src1 = ctx.createBufferSource();
    src1.buffer = noiseBuf; src1.loop = true;
    murmurF = ctx.createBiquadFilter(); murmurF.type = 'bandpass'; murmurF.frequency.value = 520; murmurF.Q.value = 0.5;
    murmurG = ctx.createGain(); murmurG.gain.value = 0.18;
    src1.connect(murmurF); murmurF.connect(murmurG); murmurG.connect(crowdBus);
    src1.start();
    // roar: thousands of voices rising with the danger (started half-way through the loop so it never phases)
    var src2 = ctx.createBufferSource();
    src2.buffer = noiseBuf; src2.loop = true;
    roarF = ctx.createBiquadFilter(); roarF.type = 'bandpass'; roarF.frequency.value = 800; roarF.Q.value = 0.9;
    roarG = ctx.createGain(); roarG.gain.value = 0;
    src2.connect(roarF); roarF.connect(roarG); roarG.connect(crowdBus);
    src2.start(0, 1.5);
  }

  function play(b, vol, rate, delay, pan) {
    if (!b) return;
    var s = ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate || 1;
    var g = ctx.createGain();
    g.gain.value = vol;
    var out = g;
    if (pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    s.connect(g);
    out.connect(sfxBus);
    s.start(ctx.currentTime + (delay || 0));
  }

  // Referee pea whistle: a sine near 2.9 kHz trilled by the pea (FM ~30 Hz), with a little breath noise.
  function blow(at, dur) {
    var t0 = ctx.currentTime + at;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2900;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 27 + Math.random() * 6;
    var depth = ctx.createGain();
    depth.gain.value = 140;
    lfo.connect(depth); depth.connect(o.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.setValueAtTime(0.16, t0 + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + dur + 0.02); lfo.stop(t0 + dur + 0.02);
  }

  function ramp(param, value, time) {
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + time);
  }

  // A sung chant: a choir of detuned voices through vowel formants, a random melody, key, tempo and side of the ground,
  // with claps or a drum on the beat. Composed fresh each time.
  function chant(big) {
    var now = ctx.currentTime;
    var bpm = 92 + Math.random() * 40;
    var beat = 60 / bpm;
    var mel = MELODIES[(Math.random() * MELODIES.length) | 0];
    var root = 150 + Math.random() * 70;
    var reps = 2 + ((Math.random() * 2) | 0);
    var dur = mel.length * beat * reps;
    var pan = (Math.random() - 0.5) * 1.2;
    var withDrum = Math.random() < 0.5;
    var level = (big ? 0.2 : 0.11) * (0.8 + Math.random() * 0.4);

    var out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + beat * 2);
    out.gain.setValueAtTime(level, now + dur - beat * 2);
    out.gain.linearRampToValueAtTime(0, now + dur);
    var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; out.connect(panner); panner.connect(crowdBus); } else out.connect(crowdBus);

    var f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    var f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
    var g2 = ctx.createGain(); g2.gain.value = 0.55;
    f1.connect(out); f2.connect(g2); g2.connect(out);

    var voices = 6;
    var oscs = [];
    for (var v = 0; v < voices; v++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = (Math.random() - 0.5) * 38; // a crowd never sings in tune
      o.connect(f1); o.connect(f2);
      oscs.push(o);
    }
    var vowel = (Math.random() * VOWELS.length) | 0;
    for (var r = 0; r < reps; r++) {
      for (var k = 0; k < mel.length; k++) {
        var t = now + (r * mel.length + k) * beat;
        var semi = mel[k];
        if (k % 2 === 0) vowel = (vowel + 1 + ((Math.random() * 2) | 0)) % VOWELS.length;
        f1.frequency.setValueAtTime(VOWELS[vowel][0], t);
        f2.frequency.setValueAtTime(VOWELS[vowel][1], t);
        for (var w = 0; w < voices; w++) {
          var f = semi === -99 ? 0 : root * Math.pow(2, semi / 12) * (w % 3 === 2 ? 2 : 1);
          oscs[w].frequency.setValueAtTime(f || 1, t + Math.random() * 0.04);
        }
        if (semi === -99) { f1.frequency.setValueAtTime(60, t); f2.frequency.setValueAtTime(60, t); }
        if (withDrum && k % 2 === 0) play(buf.drum, 0.35, 1, t - now, pan);
        else if (!withDrum && k % 2 === 1) play(buf.clap, 0.28, 0.9 + Math.random() * 0.2, t - now, pan);
      }
    }
    for (var q = 0; q < voices; q++) { oscs[q].start(now); oscs[q].stop(now + dur + 0.05); }
    chantBusyUntil = now + dur;
  }

  // Rhythmic clapping across one end of the ground.
  function claps() {
    var now = ctx.currentTime;
    var pat = CLAPS[(Math.random() * CLAPS.length) | 0];
    var beat = 60 / (100 + Math.random() * 30);
    var reps = 3 + ((Math.random() * 3) | 0);
    var pan = (Math.random() - 0.5) * 1.2;
    for (var r = 0; r < reps; r++) {
      for (var k = 0; k < pat.length; k++) {
        var t = (r * 2 + pat[k]) * beat;
        for (var c = 0; c < 3; c++) play(buf.clap, 0.16, 0.85 + Math.random() * 0.3, t + Math.random() * 0.03, pan);
      }
    }
    chantBusyUntil = now + reps * 2 * beat;
  }

  NS.Audio = {
    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled && ctx && crowdBus) ramp(crowdBus.gain, 0, 0.2);
    },
    setChants: function (v) { chantsOn = !!v; },
    // a short three-note chime (a checkoAI training finished): plays even with the match sounds off or the app hidden
    chime: function () {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC(); build();
        }
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
        var t0 = ctx.currentTime + 0.05;
        [784, 988, 1319].forEach(function (f, i) {
          var o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.14;
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.35, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + (i === 2 ? 0.9 : 0.35));
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 1);
        });
      } catch (e) {}
    },
    setVolume: function (v) {
      sfxVolume = v >= 0 && v <= 1 ? v : 0.8;
      if (master) master.gain.value = sfxVolume;
    },

    kick: function (heavy) {
      var c = ensure();
      if (!c) return;
      try { play(heavy ? buf.shot : buf.kick, heavy ? 0.9 : 0.6, 0.92 + Math.random() * 0.16); } catch (e) {}
    },
    tackle: function () {
      var c = ensure();
      if (!c) return;
      try { play(buf.tackle, 0.6, 0.9 + Math.random() * 0.2); } catch (e) {}
    },
    post: function () {
      var c = ensure();
      if (!c) return;
      try { play(buf.post, 0.7, 0.95 + Math.random() * 0.1); this.ooh(); } catch (e) {}
    },
    net: function () {
      var c = ensure();
      if (!c) return;
      try { play(buf.net, 0.5, 1); } catch (e) {}
    },
    // kind: 0 = one blow (kickoff, pause), 1 = two (half time), 2 = three, the last one long (full time)
    whistle: function (kind) {
      var c = ensure();
      if (!c) return;
      try {
        if (kind === 2) { blow(0, 0.28); blow(0.42, 0.28); blow(0.84, 0.9); }
        else if (kind === 1) { blow(0, 0.3); blow(0.45, 0.6); }
        else blow(0, 0.38);
      } catch (e) {}
    },
    // the whole ground erupts, then sings
    goal: function () {
      var c = ensure();
      if (!c || !roarG) return;
      try {
        var now = ctx.currentTime;
        roarG.gain.cancelScheduledValues(now);
        roarG.gain.setValueAtTime(roarG.gain.value, now);
        roarG.gain.linearRampToValueAtTime(0.85, now + 0.35);
        roarG.gain.setValueAtTime(0.85, now + 2.4);
        roarG.gain.linearRampToValueAtTime(0.25, now + 5.5);
        roarF.frequency.cancelScheduledValues(now);
        roarF.frequency.setValueAtTime(roarF.frequency.value, now);
        roarF.frequency.linearRampToValueAtTime(1150, now + 0.35);
        roarF.frequency.linearRampToValueAtTime(820, now + 5);
        this.net();
        chantT = 2.6; // the scorers' end starts singing
        lastSent = now + 5.5;
      } catch (e) {}
    },
    // the trainer claps checkoAI: a few claps, more and louder for a stronger one
    applause: function (strength) {
      var c = ensure();
      if (!c || !buf.clap) return;
      try {
        var n = 2 + Math.round(strength * 4);
        for (var k = 0; k < n; k++) play(buf.clap, 0.25 + strength * 0.35, 0.9 + Math.random() * 0.25, k * 0.13);
      } catch (e) {}
    },
    // near miss / big chance: "oooh"
    ooh: function () {
      var c = ensure();
      if (!c || !roarG) return;
      try {
        var now = ctx.currentTime;
        roarG.gain.cancelScheduledValues(now);
        roarG.gain.setValueAtTime(roarG.gain.value, now);
        roarG.gain.linearRampToValueAtTime(0.55, now + 0.25);
        roarG.gain.linearRampToValueAtTime(0.12, now + 1.8);
        roarF.frequency.cancelScheduledValues(now);
        roarF.frequency.setValueAtTime(700, now);
        roarF.frequency.linearRampToValueAtTime(380, now + 1.6);
        lastSent = now + 1.8;
      } catch (e) {}
    },

    // Match crowd on / off (menus, pause, full time).
    crowd: function (on) {
      var c = ensure();
      if (!c || !crowdBus) { crowdLive = false; return; }
      crowdLive = !!on;
      ramp(crowdBus.gain, on ? 1 : 0, on ? 1.2 : 0.5);
    },

    // Per simulation step while the match runs: danger 0..1 (ball near a goal, a chance) drives the roar, and the
    // chants are scheduled. Audio params are only touched when the level really moved.
    tick: function (dt, danger) {
      if (!ctx || !crowdLive || suspended || !enabled) return;
      excite += (danger - excite) * Math.min(1, dt * 1.5);
      var now = ctx.currentTime;
      if (now > lastSent && Math.abs(excite - sentExcite) > 0.04) {
        lastSent = now + 0.25;
        sentExcite = excite;
        roarG.gain.setTargetAtTime(excite * 0.45, now, 0.3);
        roarF.frequency.setTargetAtTime(650 + excite * 450, now, 0.3);
        murmurG.gain.setTargetAtTime(0.16 + excite * 0.08, now, 0.5);
      }
      chantT -= dt;
      if (chantT <= 0) {
        chantT = 9 + Math.random() * 14;
        if (chantsOn && now > chantBusyUntil && excite < 0.65) {
          try { if (Math.random() < 0.65) chant(chantT < 12); else claps(); } catch (e) {}
        }
      }
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
      master = sfxBus = crowdBus = null;
      murmurG = murmurF = roarG = roarF = null;
      buf = {};
      crowdLive = false;
    }
  };
})(window.RS6 = window.RS6 || {});
