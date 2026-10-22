/* In-match HUD. Every DOM write is cached: nothing is touched unless the value changed. */
(function (NS) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var last = {};
  var radarCtx = null;
  var radarW = 0;
  var radarH = 0;
  var homeCss = '#dc2626';
  var awayCss = '#38bdf8';
  var radarSkip = 0;
  var bannerTimer = 0;
  var goalTimer = 0;
  var plates = [null, null];
  var boxes = [{ l: 0, r: 0, t: 2, b: 2 }, { l: 0, r: 0, t: 2, b: 2 }, { l: 0, r: 0, t: 2, b: 2 }];
  var covered = [false, false, false];
  var hintTimer = 0;
  var clapTimer = 0;
  // checkoAI: a white rooster's head (named after the owner's rooster)
  var ROOSTER = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#ef4444" d="M20 18c-2-8 6-12 9-6 1-8 10-8 10 0 3-6 11-3 8 4 5 0 6 6 1 8H22c-4-1-5-4-2-6z"/>' +
    '<path fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" d="M18 26c0-7 7-11 15-11s15 5 15 13c0 5-2 9-5 12l2 16H20l3-15c-3-4-5-9-5-15z"/>' +
    '<path fill="#f59e0b" stroke="#b45309" stroke-width="1" d="M47 26l12 5-12 5z"/><path fill="#ef4444" d="M44 36c3 0 5 3 4 7-1 4-6 4-7 0 0-3 1-7 3-7z"/>' +
    '<circle cx="38" cy="25" r="2.6" fill="#0f172a"/><circle cx="38.8" cy="24.2" r="0.8" fill="#fff"/></svg>';
  var AIMA_ICO = { watch: '👀', happy: '😊', shoot: '🎯', through: '🚀', long: '📡', pass: '🔁', switch: '🔀', win: '🛡️',
    losing: '🔥', lead: '🧊', run: '⚡', look: '🧠', runbehind: '🏃', option: '🙋', close: '👟', chase: '⚽' };

  function text(key, node, value) {
    if (last[key] !== value) { last[key] = value; node.textContent = value; }
  }

  function width(key, node, pct) {
    var v = pct < 0 ? 0 : (pct > 100 ? 100 : Math.round(pct));
    if (last[key] !== v) { last[key] = v; node.style.width = v + '%'; }
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // cache keys and element ids are built once, not per frame
  var PK = [null, null];
  (function () {
    for (var i = 0; i < 2; i++) {
      var n = i + 1;
      PK[i] = { l: 'l' + n, n: 'n' + n, r: 'r' + n, s: 's' + n, m: 'm' + n, t: 't' + n,
        label: 'p' + n + '-label', name: 'p' + n + '-name', role: 'p' + n + '-role', stamina: 'p' + n + '-stamina', mark: 'p' + n + '-mark', act: 'p' + n + '-act' };
    }
  })();

  NS.HUD = {
    ROOSTER: ROOSTER,
    init: function () {
      var ids = ['hud', 'hud-comp', 'hud-home-badge', 'hud-home-name', 'hud-score-home', 'hud-score-away', 'hud-away-name',
        'hud-away-badge', 'hud-clock', 'hud-telemetry', 'hud-fps', 'hud-quality', 'hud-radar-box', 'radar-canvas',
        'event-banner', 'event-title', 'event-sub', 'hud-hint', 'goal-fx', 'goal-word', 'goal-sub', 'hud-home-cards', 'hud-away-cards',
        'aima-box', 'aima-name', 'aima-ico', 'aima-txt', 'aima-gauge', 'clap-fx', 'clap-pct'];
      var i;
      for (i = 0; i < ids.length; i++) el[ids[i]] = $(ids[i]);
      for (i = 1; i <= 2; i++) {
        el['p' + i + '-label'] = $('p' + i + '-label');
        el['p' + i + '-role'] = $('p' + i + '-role');
        el['p' + i + '-name'] = $('p' + i + '-name');
        el['p' + i + '-stamina'] = $('p' + i + '-stamina');
        el['p' + i + '-mark'] = $('p' + i + '-mark');
        el['p' + i + '-act'] = $('p' + i + '-act');
      }
      $('aima-head').innerHTML = ROOSTER;
      plates[0] = document.querySelector('.plate.p1');
      plates[1] = document.querySelector('.plate.p2');
      var c = el['radar-canvas'];
      radarCtx = c.getContext('2d');
      radarW = c.width;
      radarH = c.height;
    },

    show: function (v) {
      el.hud.classList.toggle('hidden', !v);
      if (!v) this.hideBanner();
      else this.measure();
    },

    // Screen boxes (0..1) of the two player plates and the radar, read once (on show / resize), not per frame.
    measure: function () {
      var W = window.innerWidth || 1, H = window.innerHeight || 1;
      var nodes = [plates[0], plates[1], el['hud-radar-box']];
      for (var i = 0; i < 3; i++) {
        var n = nodes[i];
        if (!n) continue;
        var r = n.getBoundingClientRect();
        var b = boxes[i];
        b.l = r.left / W - 0.03; b.r = r.right / W + 0.03; b.t = r.top / H - 0.05; b.b = r.bottom / H + 0.02;
      }
    },

    // Fades a box when the ball (screen point nx, ny) is behind it.
    cover: function (nx, ny) {
      var nodes = [plates[0], plates[1], el['hud-radar-box']];
      for (var i = 0; i < 3; i++) {
        var b = boxes[i];
        var hit = nx > b.l && nx < b.r && ny > b.t && ny < b.b;
        if (hit !== covered[i]) { covered[i] = hit; if (nodes[i]) nodes[i].classList.toggle('behind', hit); }
      }
    },

    setTeams: function (home, away, homeColor, awayColor) {
      homeCss = NS.Assets.hexToCss(homeColor !== undefined ? homeColor : home.c1);
      awayCss = NS.Assets.hexToCss(awayColor !== undefined ? awayColor : away.c1);
      el['hud-home-name'].textContent = home.code;
      el['hud-away-name'].textContent = away.code;
      el['hud-home-badge'].style.background = homeCss;
      el['hud-away-badge'].style.background = awayCss;
    },

    // the bookings of team t on the scoreboard: one tiny card each (green = warning, yellow, red). Event-driven.
    setCards: function (t, cards) {
      var box = el[t === 0 ? 'hud-home-cards' : 'hud-away-cards'];
      while (box.firstChild) box.removeChild(box.firstChild);
      for (var i = 0; i < cards.length; i++) {
        var c = document.createElement('i');
        c.className = 'c' + cards[i];
        box.appendChild(c);
      }
    },

    setComp: function (label) { text('comp', el['hud-comp'], label); },
    setScore: function (h, a) {
      text('sh', el['hud-score-home'], String(h));
      text('sa', el['hud-score-away'], String(a));
    },
    setClock: function (mins, secs) { text('clock', el['hud-clock'], pad2(mins) + ':' + pad2(secs)); },

    setFps: function (fps) { text('fps', el['hud-fps'], String(fps)); },
    setQuality: function (label) { text('qual', el['hud-quality'], label); },
    applySettings: function (settings) {
      el['hud-radar-box'].style.visibility = settings.showRadar ? 'visible' : 'hidden';
      el['hud-telemetry'].style.display = settings.showFPS ? 'flex' : 'none';
    },

    // AI.MA's status box (per frame: DOM writes only when something changed) and the trainer's clap gauge
    aima: function (on) {
      if (last.aon !== on) {
        last.aon = on;
        el['aima-box'].classList.toggle('hidden', !on);
        el.hud.classList.toggle('aima-on', on); // the FPS pill moves below the box
      }
      if (!on || !NS.Aima) return;
      var nm = NS.Aima.modelName();
      if (last.anm !== nm) { last.anm = nm; el['aima-name'].textContent = nm; }
      var t = NS.Aima.thought();
      if (last.ath !== t) {
        last.ath = t;
        el['aima-ico'].textContent = AIMA_ICO[t] || '';
        el['aima-txt'].textContent = NS.I18n.t('aima.t.' + t);
      }
      var f = NS.Aima.clapFrac();
      var g = f < 0 ? -1 : Math.round(f * 20);
      if (last.agf !== g) {
        last.agf = g;
        el['aima-gauge'].style.visibility = g < 0 ? 'hidden' : 'visible';
        if (g >= 0) el['aima-gauge'].firstChild.style.width = (g * 5) + '%';
      }
    },
    // a clap from the trainer: hands pop beside the status box (bigger for a stronger clap); play goes on underneath
    clap: function (strength) {
      var fx = el['clap-fx'];
      fx.classList.remove('hidden', 'play');
      fx.style.setProperty('--s', String(0.6 + strength * 0.6));
      el['clap-pct'].textContent = Math.round(strength * 100) + '%';
      void fx.offsetWidth; // restart the animation (only on a clap, never per frame)
      fx.classList.add('play');
      clearTimeout(clapTimer);
      clapTimer = setTimeout(function () { fx.classList.add('hidden'); fx.classList.remove('play'); }, 1600);
    },

    // Player plate i (0 left, 1 right).
    plate: function (i, label, player, slot) {
      var k = PK[i];
      text(k.l, el[k.label], label);
      if (player) {
        text(k.n, el[k.name], player.name);
        text(k.r, el[k.role], player.roleText);
        width(k.s, el[k.stamina], player.stamina);
      }
      var frac = slot ? slot.chargeFrac : -1;
      var mark = el[k.mark];
      if (frac < 0) {
        if (last[k.m] !== -1) { last[k.m] = -1; mark.style.visibility = 'hidden'; }
      } else {
        var pct = Math.round(frac * 100);
        if (last[k.m] !== pct) { last[k.m] = pct; mark.style.visibility = 'visible'; mark.style.left = pct + '%'; }
      }
      var mv = slot && frac >= 0 ? slot.chargeMove : -1;
      if (last[k.t] !== mv) {
        last[k.t] = mv;
        var chip = el[k.act];
        if (mv >= 0) {
          chip.textContent = NS.I18n.t('mv.' + NS.Bindings.MOVES[mv].id);
          chip.setAttribute('data-act', NS.Bindings.MOVES[mv].cls);
        } else {
          chip.textContent = '';
        }
        chip.style.visibility = mv >= 0 ? 'visible' : 'hidden';
      }
    },

    // GOOOAL: big animated letters (one span per letter so they pop and wave one after the other; Arabic stays one
    // word so its letters keep joining) and a strip with the scorer, in the scoring team's colour. No score here: it is
    // on the board at the top.
    goalFx: function (word, sub, team) {
      var box = el['goal-fx'];
      var w = el['goal-word'];
      while (w.firstChild) w.removeChild(w.firstChild);
      var parts = NS.I18n.lang() === 'ar' ? [word] : word.split('');
      for (var i = 0; i < parts.length; i++) {
        var s = document.createElement('span');
        s.textContent = parts[i] === ' ' ? '\u00a0' : parts[i];
        var d = (i * 0.06).toFixed(2);
        s.style.animationDelay = d + 's, ' + (0.65 + i * 0.06).toFixed(2) + 's';
        w.appendChild(s);
      }
      el['goal-sub'].textContent = sub;
      box.style.setProperty('--team', team === 0 ? homeCss : awayCss);
      box.classList.remove('hidden');
      box.classList.remove('play');
      void box.offsetWidth; // restart the animations
      box.classList.add('play');
      goalTimer = 3.6;
    },
    hideGoalFx: function () { el['goal-fx'].classList.add('hidden'); goalTimer = 0; },

    banner: function (title, sub, seconds) {
      el['event-title'].textContent = title;
      el['event-sub'].textContent = sub;
      el['event-banner'].classList.remove('hidden');
      bannerTimer = seconds || 0;
    },
    hideBanner: function () { el['event-banner'].classList.add('hidden'); bannerTimer = 0; },

    hint: function (txt, seconds) {
      el['hud-hint'].textContent = txt;
      el['hud-hint'].classList.remove('hidden');
      hintTimer = seconds;
    },
    hideHint: function () { el['hud-hint'].classList.add('hidden'); hintTimer = 0; },
    tick: function (dt) {
      if (goalTimer > 0) { goalTimer -= dt; if (goalTimer <= 0) el['goal-fx'].classList.add('hidden'); }
      if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) el['hud-hint'].classList.add('hidden'); }
    },

    // Radar is repainted every third frame.
    radar: function (players, ball, slots) {
      if (++radarSkip < 3) return;
      radarSkip = 0;
      var ctx = radarCtx;
      var w = radarW;
      var h = radarH;
      ctx.fillStyle = 'rgba(20, 83, 45, 0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.beginPath();
      ctx.moveTo(w / 2, 4);
      ctx.lineTo(w / 2, h - 4);
      ctx.stroke();
      var sx = (w - 12) / (NS.PITCH_HALF_W * 2);
      var sz = (h - 12) / (NS.PITCH_HALF_H * 2);
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        var c0 = slots[0].active && slots[0].player === p;
        var cursor = c0 || (slots[1].active && slots[1].player === p);
        ctx.fillStyle = p.team === 0 ? homeCss : awayCss;
        ctx.beginPath();
        ctx.arc((p.pos.x + NS.PITCH_HALF_W) * sx + 6, (p.pos.z + NS.PITCH_HALF_H) * sz + 6, cursor ? 5 : 3.2, 0, 6.2832);
        ctx.fill();
        if (cursor) { ctx.strokeStyle = c0 ? '#3b82f6' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke(); } // P1 blue, P2 red
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc((ball.pos.x + NS.PITCH_HALF_W) * sx + 6, (ball.pos.z + NS.PITCH_HALF_H) * sz + 6, 3.6, 0, 6.2832);
      ctx.fill();
    },

    invalidate: function () { last = {}; }
  };
})(window.RS6 = window.RS6 || {});
