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
  var hintTimer = 0;

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
    init: function () {
      var ids = ['hud', 'hud-comp', 'hud-home-badge', 'hud-home-name', 'hud-score-home', 'hud-score-away', 'hud-away-name',
        'hud-away-badge', 'hud-clock', 'hud-telemetry', 'hud-fps', 'hud-quality', 'hud-radar-box', 'radar-canvas',
        'event-banner', 'event-title', 'event-sub', 'hud-hint'];
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
      var c = el['radar-canvas'];
      radarCtx = c.getContext('2d');
      radarW = c.width;
      radarH = c.height;
    },

    show: function (v) {
      el.hud.classList.toggle('hidden', !v);
      if (!v) this.hideBanner();
    },

    setTeams: function (home, away) {
      homeCss = NS.Assets.hexToCss(home.c1);
      awayCss = NS.Assets.hexToCss(away.c1);
      el['hud-home-name'].textContent = home.code;
      el['hud-away-name'].textContent = away.code;
      el['hud-home-badge'].style.background = homeCss;
      el['hud-away-badge'].style.background = awayCss;
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
