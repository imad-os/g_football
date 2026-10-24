/* The voice commentator (Settings > Commentator). The match tells it what happens (NS.Commentary.event('GOAL', team)...,
 * the event codes of the assets repo's library.json); it decides what is worth saying and says one phrase at a time.
 *
 * - Off in the settings: nothing is loaded and nothing runs (event / tick return at once). It also stays idle in debug
 *   and training matches (NS.Debug) and in trainer.html, which does not load this file.
 * - On: at the first match its library is read from the assets repo (imad-os/f_assets) through MyPC.net, then the MP3s
 *   of the chosen voice are fetched one at a time in the background, the important events first (bytes kept compressed,
 *   ~3 MB a voice). Every file is also kept in the browser's cache: the next launches load from there, also offline.
 *   A phrase is decoded when it is needed (a few kept, LRU); the next goal / penalty / save phrase is decoded ahead.
 * - Fail-safe: a phrase whose file is missing is skipped (another phrase, else the fallback setting); no network, no
 *   MyPC.net, a bad file or a broken library = no voice for it, never an error: the match goes on as without it.
 * - Smart: every event has a priority, a time it stays worth saying, and a cool-down (no "what a tackle!" every 10 s).
 *   One voice at a time; a much bigger moment (a goal) cuts a small one short; minor events are said only sometimes,
 *   depending on how talkative it is; a pause between phrases; the same phrase not twice in a row. While it speaks the
 *   crowd steps back a little, and the subtitle shows what it says.
 * - Light: a few comparisons per step; no allocation in the step (a fixed pool of pending events). It speaks through
 *   the game's one AudioContext (js/core/audio.js), so the My PC volume and the pause apply to it too. */
(function (NS) {
  'use strict';

  var World = NS.World;
  // the phrase library of the assets repo (the owner can point to another one: mypc-app.json config "commLibrary");
  // its audio addresses are full ones (audio_full_url...) or relative to the library's folder
  var LIB_URL = 'https://raw.githubusercontent.com/imad-os/f_assets/main/library.json';
  var CACHE = 'rs6-commentary-1';   // downloaded files are kept in the browser's cache: the next launch needs no network
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
    var g = s.commVoice === 'FEMALE' ? '_f' : '_m';
    var enKey = 'en' + g, key = lang + g;   // (a language with one voice: the same file for both)
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

  // ---- the network (another site: only through My PC's MyPC.net) and the browser's cache. Nothing here can throw or
  // reject unhandled: a file that is missing or an app without network just means no voice for that phrase.
  var missing = {};          // addresses that answered 404 (never asked again this session)
  var offUntil = 0;          // the network failed: no more downloads until then (ms)
  function net(url, type) {
    try {
      if (!window.MyPC || !MyPC.net || !MyPC.net.fetch || (typeof MyPC.apiLevel === 'number' && MyPC.apiLevel < 10)) {
        return Promise.reject({ code: 'unsupported' });
      }
      return MyPC.net.fetch(url, { responseType: type, timeout: 20000 }).then(function (r) {
        if (!r || !r.ok) throw { code: 'http', status: r ? r.status : 0 };
        return r.body;
      });
    } catch (e) { return Promise.reject(e); }
  }
  function failed(url, e) {
    if (e && (e.status === 404 || e.status === 403)) missing[url] = 1;   // not generated (yet): skipped
    else offUntil = Date.now() + 60000;                                // no network / busy: try again in a minute
  }
  function cacheGet(url) {
    try {
      if (!window.caches) return Promise.resolve(null);
      return caches.open(CACHE).then(function (c) { return c.match(url); })
        .then(function (r) { return r ? r.arrayBuffer() : null; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function cachePut(url, ab) {
    try {
      if (window.caches) caches.open(CACHE).then(function (c) { return c.put(url, new Response(ab.slice(0))); }).catch(function () {});
    } catch (e) {}
  }

  // ---- the library: the assets repo's library.json (fresh from the network, else the copy cached last time), turned
  // into { events: { GOAL: [{ id, t: { en, fr, es, ar }, src: { en_m: url, en_f, fr_m, fr_f, ... } }] }, urls }
  var libRetry = 0;
  function libUrl() { return (MyPC.app_config && MyPC.app_config.commLibrary) || LIB_URL; }
  function loadLib() {
    if (lib || libP || Date.now() < libRetry) return;
    var u = libUrl();
    libP = net(u, 'arraybuffer').then(function (ab) { cachePut(u, ab); return ab; }, function () { return cacheGet(u); })
      .then(function (ab) {
        libP = null;
        if (!ab) throw 0;
        var j = JSON.parse(new TextDecoder().decode(ab));
        if (!cfg.on) return;
        lib = shape(j, u);
        plan();
      }).catch(function () { libP = null; libRetry = Date.now() + 120000; }); // (no commentary for now; tried at a later match)
  }
  function clean(s) { return String(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function shape(j, u) {
    var base = u.slice(0, u.lastIndexOf('/') + 1), out = { events: {}, urls: {} };
    var list = Array.isArray(j) ? j : (j && j.phrases) || [];
    function abs(p) { return !p ? '' : (/^https?:\/\//.test(p) ? p : base + String(p).replace(/^\.?\//, '')); }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.id || !EV[e.event]) continue;
      var tr = e.translations || {}, t = {}, src = {};
      for (var l in LANGS) t[l] = clean((tr[l] && tr[l].phrase) || e['phrase_' + l]);
      // every language has a male (_m) and a female (_f) voice: audio_full_url_male / _female when it has both, else
      // its one voice (audio_full_url) is used for either choice; a full address first, else the relative one
      for (var l2 in LANGS) {
        var x = tr[l2] || {};
        var one = x.audio_full_url || e['audio_full_url_' + l2] || abs(x.audio_url || e['audio_' + l2]);
        var male = x.audio_full_url_male || abs(x.audio_url_male || e['audio_' + l2 + '_male']) || one;
        var female = x.audio_full_url_female || abs(x.audio_url_female || e['audio_' + l2 + '_female']) || male;
        if (male) { src[l2 + '_m'] = male; out.urls[l2 + '_m/' + e.id] = male; }
        if (female) { src[l2 + '_f'] = female; out.urls[l2 + '_f/' + e.id] = female; }
      }
      (out.events[e.event] = out.events[e.event] || []).push({ id: e.id, t: t, src: src });
    }
    return out;
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
            if (!ph.src[k]) return;
            if ((r === 0) === (n++ === 0)) fetchList.push(k + '/' + ph.id);
          });
        });
      });
    }
    pumpFetch();
  }
  // one file at a time in the background; after a network failure it waits a minute (the match goes on meanwhile)
  var resumeT = 0;
  function pumpFetch() {
    if (fetching || !cfg.on || !lib) return;
    while (fetchAt < fetchList.length && (bytes[fetchList[fetchAt]] || missing[srcOf(fetchList[fetchAt])])) fetchAt++;
    readyAhead();
    if (fetchAt >= fetchList.length) return;
    if (Date.now() < offUntil) {
      if (!resumeT) resumeT = setTimeout(function () { resumeT = 0; pumpFetch(); }, offUntil - Date.now() + 50);
      return;
    }
    fetching = true;
    var gen = fetchGen;
    function next() { if (gen === fetchGen) { fetching = false; pumpFetch(); } }
    getBytes(fetchList[fetchAt++]).then(next, next);
  }
  function srcOf(k) { return (lib && lib.urls[k]) || ''; }
  // a phrase's MP3: in memory, else in the browser's cache, else from the network (then cached); rejects when it is not
  // there (missing, no network): the caller just goes without it
  var inflight = {};
  function getBytes(k) {
    if (bytes[k]) return Promise.resolve(bytes[k]);
    if (inflight[k]) return inflight[k];
    var u = srcOf(k);
    if (!u || missing[u]) return Promise.reject(0);
    var gen = fetchGen;
    var p = inflight[k] = cacheGet(u).then(function (ab) {
      if (ab) return ab;
      if (Date.now() < offUntil) throw 0;
      return net(u, 'arraybuffer').then(function (b) { cachePut(u, b); return b; }, function (e) { failed(u, e); throw 0; });
    }).then(function (ab) {
      delete inflight[k];
      if (gen === fetchGen) bytes[k] = ab;
      return ab;
    }, function () { delete inflight[k]; throw 0; });
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
      try {
        var pr = A.ctx.decodeAudioData(ab.slice(0), done, function () { done(null); });
        if (pr && pr.catch) pr.catch(function () {}); // (a bad file: no voice, no error)
      } catch (e) { done(null); }
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
    // (phrases found missing since the bag was filled are left out)
    if (bag && key) for (var m = bag.length - 1; m >= 0; m--) if (missing[bag[m].src[key]]) bag.splice(m, 1);
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
    return { ev: ev, k: key ? key + '/' + ph.id : '', text: ph.t[key ? key.slice(0, 2) : cfg.lang] || ph.t.en };
  }
  function has(list, key) {
    var out = [];
    for (var i = 0; i < list.length; i++) { var u = list[i].src[key]; if (u && !missing[u]) out.push(list[i]); }
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
      if (!live || busy || clock > pk.until) return;
      if (buf) { play(buf, pk, p); return; }
      // its file is not there (not generated, no network): another phrase of the event, else the fallback setting
      // (3 tries at most: without a network every file fails the same way)
      var alt = (pk.tries || 0) < 3 ? pick(pk.ev) : null;
      if (alt && alt.k !== pk.k) { alt.until = pk.until; alt.tries = (pk.tries || 0) + 1; say(alt, p); }
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
  // a bug here never stops the match: the commentator goes quiet for this match and it is reported once
  var faulted = false;
  function fault(e) {
    live = false;
    try { hush(true); } catch (x) {}
    if (!faulted && window.MyPC && MyPC.report) { faulted = true; try { MyPC.report(e, { where: 'commentary' }); } catch (x) {} }
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
    event: function (ev, team) { if (live) { try { this._event(ev, team); } catch (e) { fault(e); } } },
    _event: function (ev, team) {
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
    tick: function (dt) { if (live) { try { this._tick(dt); } catch (e) { fault(e); } } },
    _tick: function (dt) {
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
