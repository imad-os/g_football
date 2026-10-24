/* The voice commentator (Settings > Commentator). The match tells it what happens (NS.Commentary.event('GOAL', team)...,
 * the event codes of audio/commentary/library.json); it decides what is worth saying and says one phrase at a time.
 *
 * - Off in the settings: nothing is loaded and nothing runs (event / tick return at once). It also stays idle in debug
 *   and training matches (NS.Debug) and in trainer.html, which does not load this file.
 * - On: at the first match its library (~30 KB) is read, then the MP3s of the chosen voice are fetched one at a time in
 *   the background, the important events first (bytes kept compressed, ~3 MB). A phrase is decoded when it is needed
 *   (a few kept, LRU); the next goal / penalty / save phrase is decoded ahead, so the big moments are never late.
 * - Smart: every event has a priority, a time it stays worth saying, and a cool-down (no "what a tackle!" every 10 s).
 *   One voice at a time; a much bigger moment (a goal) cuts a small one short; minor events are said only sometimes,
 *   depending on how talkative it is; a pause between phrases; the same phrase not twice in a row. While it speaks the
 *   crowd steps back a little, and the subtitle shows what it says.
 * - Light: a few comparisons per step; no allocation in the step (a fixed pool of pending events). It speaks through
 *   the game's one AudioContext (js/core/audio.js), so the My PC volume and the pause apply to it too. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var BASE = 'audio/commentary/';
  var LANGS = { en: 1, fr: 1, es: 1, ar: 1 };
  // p: priority, ttl: seconds it stays worth saying, cd: seconds before the same event again, minor: said only sometimes
  var EV = {
    GOAL: { p: 100, ttl: 4, cd: 0 },
    PENALTY: { p: 90, ttl: 3, cd: 0 },
    FULLTIME: { p: 88, ttl: 8, cd: 0 },
    HOMEWIN: { p: 86, ttl: 20, cd: 0 },
    AWAYWIN: { p: 86, ttl: 20, cd: 0 },
    HALFTIME: { p: 80, ttl: 8, cd: 0 },
    INTRO: { p: 75, ttl: 10, cd: 0 },
    SAVE: { p: 70, ttl: 2.5, cd: 6 },
    COUNTER: { p: 55, ttl: 2, cd: 25, minor: true },
    OFFSIDE: { p: 50, ttl: 2.5, cd: 15 },
    FOUL: { p: 45, ttl: 2.5, cd: 12 },
    CORNER: { p: 45, ttl: 3, cd: 10 },
    LONGPASS: { p: 35, ttl: 1.5, cd: 25, minor: true },
    ATTACK: { p: 30, ttl: 2, cd: 30, minor: true },
    TACKLE: { p: 25, ttl: 1.2, cd: 30, minor: true }
  };
  // fetched first (the moments that must never be silent)
  var FIRST = ['INTRO', 'GOAL', 'SAVE', 'PENALTY', 'HALFTIME', 'FULLTIME', 'HOMEWIN', 'AWAYWIN', 'CORNER', 'FOUL', 'OFFSIDE',
    'COUNTER', 'ATTACK', 'LONGPASS', 'TACKLE'];
  var AHEAD = ['GOAL', 'PENALTY', 'SAVE'];  // decoded ahead
  // how talkative: events below minP are never said, minor ones with this chance; cool-downs x cd; pause between phrases
  var TALK = {
    CALM: { minP: 45, chance: 0, cd: 1.6, gap: 3 },
    NORMAL: { minP: 0, chance: 0.55, cd: 1, gap: 1.4 },
    CHATTY: { minP: 0, chance: 1, cd: 0.55, gap: 0.6 }
  };
  var CUT = 30;       // a new event this much more important cuts the phrase being said
  var LRU_MAX = 8;    // decoded phrases kept
  var NPEND = 6;

  var cfg = { on: false, lang: 'en', key: 'en_m', enKey: 'en_m', fallback: 'EN', talk: TALK.NORMAL, vol: 0.85, subs: true, duck: true };
  var live = false;              // the service is running (setting on, a real match)
  var lib = null, libP = null;   // the phrase library, its loading
  var bytes = {}, decoded = {}, lru = [], waiting = {};   // 'key/id' -> compressed MP3 / AudioBuffer / decode in progress
  var fetchList = [], fetchAt = 0, fetching = false, fetchGen = 0;
  var bags = {}, ahead = {};     // event|key -> phrases still to use (shuffled); event -> the next phrase, decoded ahead
  var pend = [];                 // pending events (fixed pool)
  var clock = 0, gapUntil = 0, lastSaid = {};
  var busy = null;               // what it is saying: { p, src, g, end (text only) }
  var prep = null;               // a phrase being decoded to be said: { pick, p, until }
  for (var i = 0; i < NPEND; i++) pend.push({ ev: '', team: 0, at: 0 });

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---- settings (Settings > Commentator); off = everything dropped
  function readCfg(s) {
    var lang = s.commLang === 'AUTO' || !s.commLang ? NS.I18n.lang() : String(s.commLang).toLowerCase();
    if (!LANGS[lang]) lang = 'en';
    var enKey = s.commVoice === 'FEMALE' ? 'en_f' : 'en_m';
    var key = lang === 'en' ? enKey : lang;
    if (key !== cfg.key || enKey !== cfg.enKey) dropAudio();
    cfg.on = !!s.commentary; cfg.lang = lang; cfg.key = key; cfg.enKey = enKey;
    cfg.fallback = s.commFallback || 'EN';
    cfg.talk = TALK[s.commTalk] || TALK.NORMAL;
    cfg.vol = s.commVolume || 0.85;
    cfg.subs = s.commSubs !== false;
    cfg.duck = s.commDuck !== false;
  }
  function dropAudio() {
    hush(true);
    bytes = {}; decoded = {}; lru = []; waiting = {}; bags = {}; ahead = {};
    fetchList = []; fetchAt = 0; fetchGen++; fetching = false; inflight = {};
  }
  function shutdown() {
    live = false;
    dropAudio();
    lib = null; libP = null;
    clearPending();
  }
  function clearPending() { for (var i = 0; i < NPEND; i++) pend[i].ev = ''; prep = null; }

  // ---- loading: the library, then the voice's MP3s one at a time (the moments that matter most first)
  function url(path) { return BASE + path + '?v=' + NS.VERSION; }
  function loadLib() {
    if (lib || libP) return;
    libP = fetch(url('library.json')).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!cfg.on) return; lib = j; libP = null; plan(); }, function () { libP = null; });
  }
  // the files of the voice in use (and of the English voice when phrases fall back to it)
  function plan() {
    if (!lib) return;
    fetchList = []; fetchAt = 0;
    var keys = [cfg.key];
    if (cfg.fallback === 'EN' && cfg.key !== cfg.enKey) keys.push(cfg.enKey);
    for (var r = 0; r < 2; r++) {
      // the first round: one phrase of every event (all of them speak soon); the second: the rest
      FIRST.forEach(function (ev) {
        var list = lib.events[ev] || [];
        keys.forEach(function (k) {
          var n = 0;
          list.forEach(function (ph) {
            if (ph.a.indexOf(k) < 0) return;
            if ((r === 0) === (n++ === 0)) fetchList.push(k + '/' + ph.id);
          });
        });
      });
    }
    pumpFetch();
  }
  function pumpFetch() {
    if (fetching || !cfg.on || !lib) return;
    while (fetchAt < fetchList.length && bytes[fetchList[fetchAt]]) fetchAt++;
    readyAhead();
    if (fetchAt >= fetchList.length) return;
    fetching = true;
    var gen = fetchGen;
    function next() { if (gen === fetchGen) { fetching = false; pumpFetch(); } }
    getBytes(fetchList[fetchAt++]).then(next, next);
  }
  var inflight = {};
  function getBytes(k) {
    if (bytes[k]) return Promise.resolve(bytes[k]);
    if (inflight[k]) return inflight[k];
    var gen = fetchGen, sl = k.indexOf('/');
    var p = inflight[k] = fetch(url(lib.voices[k.slice(0, sl)] + '/' + k.slice(sl + 1) + '.mp3')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      delete inflight[k];
      if (gen === fetchGen) bytes[k] = ab;
      return ab;
    }, function (e) { delete inflight[k]; throw e; });
    return p;
  }
  // a phrase decoded (kept in the LRU); calls back with the AudioBuffer or null
  function decode(k, cb) {
    if (decoded[k]) { touch(k); cb(decoded[k]); return; }
    if (waiting[k]) { waiting[k].push(cb); return; }
    var A = NS.Audio.voice();
    if (!A) { cb(null); return; }
    waiting[k] = [cb];
    var gen = fetchGen;
    function done(buf) {
      var cbs = waiting[k] || [];
      delete waiting[k];
      if (buf && gen === fetchGen) { decoded[k] = buf; touch(k); }
      for (var i = 0; i < cbs.length; i++) cbs[i](gen === fetchGen ? buf : null);
    }
    getBytes(k).then(function (ab) {
      // (decodeAudioData takes the buffer over: a copy, the compressed bytes stay for later)
      A.ctx.decodeAudioData(ab.slice(0), done, function () { done(null); });
    }, function () { done(null); });
  }
  // most recently used last; the oldest one that is not a phrase readied ahead leaves memory
  function touch(k) {
    var i = lru.indexOf(k);
    if (i >= 0) lru.splice(i, 1);
    lru.push(k);
    while (lru.length > LRU_MAX) {
      var at = -1;
      for (i = 0; i < lru.length - 1 && at < 0; i++) if (!isAhead(lru[i])) at = i;
      if (at < 0) break;
      delete decoded[lru[at]];
      lru.splice(at, 1);
    }
  }
  function isAhead(k) { for (var e in ahead) if (ahead[e] && ahead[e].k === k) return true; return false; }

  // ---- what to say for an event: a phrase of the voice in use (else the fallback), never the same one twice in a row
  function pick(ev) {
    var list = lib && lib.events[ev];
    if (!list || !list.length) return null;
    var key = cfg.key, c = has(list, key);
    if (!c.length) {
      if (cfg.fallback === 'EN') { key = cfg.enKey; c = has(list, key); }
      else if (cfg.fallback === 'TEXT') { key = ''; c = list; }
      else return null;
      if (!c.length) return null;
    }
    var bk = ev + '|' + key, bag = bags[bk];
    if (!bag || !bag.length) {
      var last = bag && bag.lastId;
      bag = bags[bk] = shuffle(c.slice());
      if (bag.length > 1 && bag[bag.length - 1].id === last) bag.unshift(bag.pop());
    }
    // one that is already here first (fetched): it can be said at once
    var at = bag.length - 1;
    if (key) for (var j = bag.length - 1; j >= 0; j--) if (bytes[key + '/' + bag[j].id]) { at = j; break; }
    var ph = bag.splice(at, 1)[0];
    bag.lastId = ph.id;
    return { k: key ? key + '/' + ph.id : '', text: ph.t[key.indexOf('en') === 0 ? 'en' : cfg.lang] || ph.t.en };
  }
  function has(list, key) {
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i].a.indexOf(key) >= 0) out.push(list[i]);
    return out;
  }
  // the next phrase of each big moment, decoded as soon as its file is here, so it is said without delay (run when a
  // file arrives and after a big moment was said, never per step)
  function readyAhead() {
    if (!lib || !live) return;
    for (var i = 0; i < AHEAD.length; i++) {
      var ev = AHEAD[i];
      if (!ahead[ev]) {
        var list = lib.events[ev];
        if (!list || !has(list, cfg.key).length) continue;  // (no voice of its own: picked when it happens)
        ahead[ev] = pick(ev);
      }
      var pk = ahead[ev];
      if (pk && pk.k && bytes[pk.k] && !decoded[pk.k] && !waiting[pk.k]) decode(pk.k, function () {});
    }
  }

  // ---- saying it
  function say(pk, p) {
    if (!pk.k) {
      // no voice for it (text only): the subtitle for a while
      busy = { p: p, src: null, g: null, end: clock + 1.5 + pk.text.length * 0.045 };
      subtitle(pk.text);
      return;
    }
    if (decoded[pk.k]) { play(decoded[pk.k], pk, p); return; }
    // not decoded (or fetched) yet: it waits a moment for it, then gives up
    prep = { pk: pk, p: p, until: pk.until };
    decode(pk.k, function (buf) {
      if (!prep || prep.pk !== pk) return;
      prep = null;
      if (buf && live && !busy && clock <= pk.until) play(buf, pk, p);
    });
  }
  function play(buf, pk, p) {
    var A = NS.Audio.voice();
    if (!A) return;
    var src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf;
    g.gain.value = cfg.vol;
    src.connect(g);
    g.connect(A.out);
    var me = busy = { p: p, src: src, g: g, end: 0 };
    src.onended = function () { if (busy === me) finish(); };
    src.start();
    if (cfg.duck) NS.Audio.duck(0.45);
    subtitle(pk.text);
  }
  function finish() {
    busy = null;
    gapUntil = clock + cfg.talk.gap;
    NS.Audio.duck(1);
    subtitle('');
  }
  // stops the phrase being said (a quick fade): now (a bigger moment) or for good (cut = no pause after it)
  function hush(now) {
    var b = busy;
    if (!b) return;
    busy = null;
    if (b.src) {
      try {
        var t = b.g.context.currentTime;
        b.g.gain.setTargetAtTime(0, t, 0.05);
        b.src.stop(t + 0.2);
      } catch (e) {}
    }
    NS.Audio.duck(1);
    subtitle('');
    if (!now) gapUntil = clock + cfg.talk.gap;
  }
  function subtitle(text) { if (NS.HUD.subtitle) NS.HUD.subtitle(cfg.subs ? text : ''); }

  NS.Commentary = {
    EVENTS: EV,
    // Settings changed (or the app started): on / off, voice, language... Off drops everything.
    setup: function (s) {
      readCfg(s);
      if (!cfg.on) { shutdown(); return; }
      if (lib && !fetchList.length) plan();
    },
    // A match starts (not in debug / training matches): the service runs until the match is left.
    matchStart: function () {
      hush(true);
      clearPending();
      live = cfg.on && !(NS.Debug && NS.Debug.running());
      if (!live) return;
      clock = 0; gapUntil = 0; lastSaid = {};
      loadLib();
    },
    matchEnd: function () {
      hush(true);
      clearPending();
      live = false;
    },
    // Something happened (an event code of the library): kept for a moment if it is worth saying.
    event: function (ev, team) {
      if (!live) return;
      var d = EV[ev], T = cfg.talk;
      if (!d || d.p < T.minP) return;
      if (d.minor && Math.random() >= T.chance) return;
      var ls = lastSaid[ev];
      if (ls !== undefined && clock - ls < d.cd * T.cd) return;
      if (busy && d.p >= busy.p + CUT) hush(true);
      // the same event waiting: just newer; else a free place, else it replaces a less important one
      var slot = null, low = null, i;
      for (i = 0; i < NPEND; i++) if (pend[i].ev === ev) slot = pend[i];
      if (!slot) for (i = 0; i < NPEND; i++) if (!pend[i].ev) { slot = pend[i]; break; }
      if (!slot) {
        for (i = 0; i < NPEND; i++) if (!low || EV[pend[i].ev].p < EV[low.ev].p) low = pend[i];
        if (EV[low.ev].p >= d.p) return;
        slot = low;
      }
      slot.ev = ev; slot.team = team || 0; slot.at = clock;
    },
    // Every simulation step of a match (also its breaks): the next thing to say, when the commentator is free.
    tick: function (dt) {
      if (!live) return;
      clock += dt;
      if (!lib) return;
      if (busy) { if (busy.end && clock >= busy.end) finish(); return; }
      if (prep) { if (clock > prep.until) prep = null; else return; }
      var best = null, i, e;
      for (i = 0; i < NPEND; i++) {
        e = pend[i];
        if (!e.ev) continue;
        if (clock - e.at > EV[e.ev].ttl) { e.ev = ''; continue; }  // too late: it is not worth saying any more
        if (!best || EV[e.ev].p > EV[best.ev].p) best = e;
      }
      if (!best) return;
      var p = EV[best.ev].p;
      if (clock < gapUntil && p < 70) return;  // a breath between phrases (not before a big moment)
      var ev = best.ev;
      best.ev = '';
      var pk = ahead[ev] || pick(ev);
      ahead[ev] = null;
      if (!pk) return;
      lastSaid[ev] = clock;
      pk.until = clock + 1.2;
      say(pk, p);
      if (AHEAD.indexOf(ev) >= 0) readyAhead();
    },
    // (for the settings screen and checks) what the service is doing
    state: function () {
      return { on: cfg.on, live: live, lib: !!lib, fetched: Object.keys(bytes).length, toFetch: fetchList.length, decoded: lru.length,
        speaking: !!busy, voice: cfg.key, lang: cfg.lang };
    }
  };
})(window.RS6 = window.RS6 || {});
