/* Menus: main, controller sides, teams, game plan, pause, settings, controls help.
 * Fully usable with a TV remote: arrows move the focus (spatial navigation), OK clicks, Back/cancel goes back.
 * Input arrives from My PC only (UI.onInput); there are no keydown listeners. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var T = function (k) { return NS.I18n.t(k); };

  var root;
  var screens = {};
  var order = ['MAIN', 'SIDES', 'TEAMS', 'GAMEPLAN', 'PAUSE', 'SETTINGS', 'HELP', 'BUTTONS'];
  var current = 'MAIN';
  var open = true;
  var focused = null;
  var lastFocusKey = {};
  var helpReturn = 'MAIN';
  var gpCanvas, gpCtx;
  var refs = {};
  var mapLast = -2; // move index (-1 = sprint) of the focused row on the mapping screen

  var MODES = [
    { comp: 'EXHIBITION', icon: '⚽', tone: 'sky' },
    { comp: 'CONTINENTAL_CUP', icon: '🏆', tone: 'amber' },
    { comp: 'DOMESTIC_LEAGUE', icon: '🛡️', tone: 'green' },
    { comp: 'WORLD_NATIONALS', icon: '🌍', tone: 'purple' }
  ];
  var PRESETS = ['1P_CPU', '1P_2P', 'COOP_CPU', 'CPU_CPU'];

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }

  function btn(cls, txt, key, onClick) {
    var b = el('button', 'btn fx ' + cls, txt);
    b.type = 'button';
    if (key) b.setAttribute('data-k', key);
    b.addEventListener('click', onClick);
    b.addEventListener('mouseenter', function () { setFocus(b, true); });
    return b;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ------------------------------ focus ------------------------------ */

  function visibleFocusables() {
    var list = screens[current].querySelectorAll('.fx');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].offsetParent !== null && !list[i].disabled) out.push(list[i]);
    }
    return out;
  }

  function setFocus(node, noScroll) {
    if (focused && focused !== node) focused.classList.remove('focus');
    focused = node;
    if (!node) return;
    node.classList.add('focus');
    var k = node.getAttribute('data-k');
    if (k) lastFocusKey[current] = k;
    if (node.hasAttribute('data-mv')) mapLast = +node.getAttribute('data-mv');
    if (!noScroll && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function focusByKey(key) {
    var list = visibleFocusables();
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute('data-k') === key) { setFocus(list[i]); return true; }
    }
    return false;
  }

  function focusDefault() {
    var key = lastFocusKey[current];
    if (key && focusByKey(key)) return;
    var list = visibleFocusables();
    var pick = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].hasAttribute('data-default')) { pick = list[i]; break; }
    }
    setFocus(pick || list[0] || null);
  }

  // dir: 0 left, 1 right, 2 up, 3 down
  function move(dir) {
    var list = visibleFocusables();
    if (!list.length) return;
    if (!focused || list.indexOf(focused) < 0) { focusDefault(); return; }
    var r = focused.getBoundingClientRect();
    var cx = (r.left + r.right) / 2;
    var cy = (r.top + r.bottom) / 2;
    var best = null;
    var bestScore = Infinity;
    var bestOverlap = null;
    var bestOverlapScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c === focused) continue;
      var b = c.getBoundingClientRect();
      var dx = (b.left + b.right) / 2 - cx;
      var dy = (b.top + b.bottom) / 2 - cy;
      var primary, secondary, overlap;
      if (dir === 0 || dir === 1) {
        primary = dir === 1 ? dx : -dx;
        secondary = Math.abs(dy);
        overlap = b.bottom > r.top && b.top < r.bottom;
      } else {
        primary = dir === 3 ? dy : -dy;
        secondary = Math.abs(dx);
        overlap = b.right > r.left && b.left < r.right;
      }
      if (primary <= 2) continue;
      var score = primary + secondary * 0.4;
      if (overlap) {
        if (score < bestOverlapScore) { bestOverlapScore = score; bestOverlap = c; }
      } else {
        score = primary + secondary * 3;
        if (score < bestScore) { bestScore = score; best = c; }
      }
    }
    // same row / column first; otherwise the closest element in that direction
    if (bestOverlap) best = bestOverlap;
    if (best) setFocus(best);
  }

  /* ------------------------------ screens ------------------------------ */

  function matchRunning() { return World.match.running; }

  function show(key) {
    current = key;
    open = true;
    root.classList.remove('hidden');
    if (matchRunning()) World.match.paused = true;
    for (var i = 0; i < order.length; i++) screens[order[i]].classList.toggle('hidden', order[i] !== key);
    refs.badge.textContent = T('step.' + key.toLowerCase());
    refreshNav();
    if (key === 'SIDES') updateSideSlots();
    if (key === 'TEAMS') renderTeams();
    if (key === 'GAMEPLAN') renderGamePlan();
    if (key === 'SETTINGS') syncSettings();
    if (key === 'HELP') renderHelp();
    if (key === 'BUTTONS') renderButtons();
    if (key === 'PAUSE') updatePauseSummary();
    NS.UI.refreshStats();
    NS.Input.clearEdges();
    focused = null;
    focusDefault();
    NS.App.syncMenuItems();
  }

  function hide() {
    open = false;
    root.classList.add('hidden');
    NS.Input.clearEdges();
    NS.Input.block(350);
    focused = null;
  }

  function refreshNav() {
    var running = matchRunning();
    refs.btnKickoff.classList.toggle('hidden', running);
    refs.btnResume.classList.toggle('hidden', !running);
    refs.sidesNext.textContent = running ? T('nav.apply_sides') : T('nav.next_teams');
  }

  function back() {
    if (current === 'BUTTONS') { show('SETTINGS'); return; }
    var running = matchRunning();
    if (running) {
      if (current === 'PAUSE') resumeMatch();
      else if (current === 'HELP') show(helpReturn);
      else show('PAUSE');
      return;
    }
    if (current === 'GAMEPLAN') show('TEAMS');
    else if (current === 'TEAMS') show('SIDES');
    else if (current === 'HELP') show(helpReturn);
    else if (current !== 'MAIN') show('MAIN');
  }

  function resumeMatch() {
    hide();
    World.match.paused = false;
    NS.App.syncMenuItems();
  }

  function startMatch() {
    hide();
    NS.Match.start();
    NS.App.syncMenuItems();
  }

  function updatePauseSummary() {
    var s = World.session;
    refs.pauseScore.textContent = NS.Teams.byId(s.homeTeamId).name + ' ' + World.match.score[0] + ' - ' +
      World.match.score[1] + ' ' + NS.Teams.byId(s.awayTeamId).name;
  }

  /* ------------------------------ MAIN ------------------------------ */

  function buildMain() {
    var wrap = screens.MAIN;
    var grid = el('div', 'cards');
    MODES.forEach(function (m, i) {
      var b = btn('card tone-' + m.tone, '', 'm:' + m.comp, function () {
        World.session.compType = m.comp;
        if (m.comp === 'DOMESTIC_LEAGUE') World.session.activeCategory = 'LEAGUE_MAR';
        else if (m.comp === 'WORLD_NATIONALS') World.session.activeCategory = 'NAT_AFRICA';
        else if (m.comp === 'CONTINENTAL_CUP') World.session.activeCategory = 'CLUBS_WORLD';
        show('SIDES');
      });
      if (i === 0) b.setAttribute('data-default', '1');
      b.appendChild(el('div', 'card-icon', m.icon));
      b.appendChild(el('div', 'card-tag', T('mode.' + m.comp + '.tag')));
      b.appendChild(el('h2', 'card-title', T('mode.' + m.comp)));
      b.appendChild(el('p', 'card-desc', T('mode.' + m.comp + '.d')));
      grid.appendChild(b);
    });
    var sb = btn('card tone-rose', '', 'm:settings', function () { show('SETTINGS'); });
    sb.appendChild(el('div', 'card-icon', '⚙️'));
    sb.appendChild(el('div', 'card-tag', T('mode.settings.tag')));
    sb.appendChild(el('h2', 'card-title', T('mode.settings')));
    sb.appendChild(el('p', 'card-desc', T('mode.settings.d')));
    grid.appendChild(sb);
    var hb = btn('card tone-teal', '', 'm:help', function () { helpReturn = 'MAIN'; show('HELP'); });
    hb.appendChild(el('div', 'card-icon', '🎮'));
    hb.appendChild(el('div', 'card-tag', T('mode.help.tag')));
    hb.appendChild(el('h2', 'card-title', T('mode.help')));
    hb.appendChild(el('p', 'card-desc', T('mode.help.d')));
    grid.appendChild(hb);
    wrap.appendChild(grid);
  }

  /* ------------------------------ SIDES ------------------------------ */

  var slotEls = {};

  function buildSides() {
    var wrap = screens.SIDES;
    var head = el('div', 'screen-head');
    head.appendChild(el('h2', null, T('sides.title')));
    head.appendChild(el('p', 'muted', T('sides.sub')));
    wrap.appendChild(head);

    var row = el('div', 'sides-row');
    var home = el('div', 'panel-card home');
    home.appendChild(el('div', 'tag red', T('sides.home')));
    home.appendChild(el('div', 'big', T('sides.team1')));
    slotEls.p1h = el('div', 'slot');
    slotEls.p2h = el('div', 'slot');
    home.appendChild(slotEls.p1h);
    home.appendChild(slotEls.p2h);

    var mid = el('div', 'panel-card');
    mid.appendChild(el('div', 'tag amber', T('sides.presets')));
    var list = el('div', 'stack');
    PRESETS.forEach(function (p, i) {
      var b = btn('wide', T('preset.' + p), 'p:' + p, function () {
        World.session.sideMode = p;
        updateSideSlots();
      });
      b.setAttribute('data-preset', p);
      if (i === 0) b.setAttribute('data-default', '1');
      list.appendChild(b);
    });
    mid.appendChild(list);

    var away = el('div', 'panel-card away');
    away.appendChild(el('div', 'tag blue', T('sides.away')));
    away.appendChild(el('div', 'big', T('sides.team2')));
    slotEls.p1a = el('div', 'slot');
    slotEls.p2a = el('div', 'slot');
    away.appendChild(slotEls.p1a);
    away.appendChild(slotEls.p2a);
    row.appendChild(home);
    row.appendChild(mid);
    row.appendChild(away);
    wrap.appendChild(row);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back'), 'back', back));
    refs.sidesNext = btn('primary', T('nav.next_teams'), 'next', function () {
      if (matchRunning()) { NS.Match.applySides(); show('PAUSE'); } else show('TEAMS');
    });
    foot.appendChild(refs.sidesNext);
    wrap.appendChild(foot);
  }

  function setSlot(node, text, tone) {
    node.textContent = text;
    node.className = 'slot ' + (tone || 'empty');
  }

  function updateSideSlots() {
    var mode = World.session.sideMode;
    setSlot(slotEls.p1h, T('slot.empty'));
    setSlot(slotEls.p2h, T('slot.empty'));
    setSlot(slotEls.p1a, T('slot.empty'));
    setSlot(slotEls.p2a, T('slot.empty'));
    if (mode === '1P_CPU') {
      setSlot(slotEls.p1h, T('slot.p1'), 'p1');
      setSlot(slotEls.p2a, T('slot.cpu'), 'cpu');
    } else if (mode === '1P_2P') {
      setSlot(slotEls.p1h, T('slot.p1'), 'p1');
      setSlot(slotEls.p2a, T('slot.p2local'), 'p2');
    } else if (mode === 'COOP_CPU') {
      setSlot(slotEls.p1h, T('slot.p1cap'), 'p1');
      setSlot(slotEls.p2h, T('slot.p2coop'), 'p2');
      setSlot(slotEls.p2a, T('slot.cpu'), 'cpu');
    } else {
      setSlot(slotEls.p1h, T('slot.cpuhome'), 'cpu');
      setSlot(slotEls.p2a, T('slot.cpuaway'), 'cpu');
    }
    var presets = screens.SIDES.querySelectorAll('[data-preset]');
    for (var i = 0; i < presets.length; i++) {
      presets[i].classList.toggle('sel', presets[i].getAttribute('data-preset') === mode);
    }
  }

  /* ------------------------------ TEAMS ------------------------------ */

  function buildTeams() {
    var wrap = screens.TEAMS;
    refs.tabs = el('div', 'tabs');
    wrap.appendChild(refs.tabs);
    var cols = el('div', 'two-cols');
    var hc = el('div', 'panel-card home');
    var hh = el('div', 'col-head');
    refs.homeSwatch = el('span', 'swatch');
    refs.homeTitle = el('div', 'col-title');
    hh.appendChild(refs.homeSwatch);
    var hbox = el('div');
    hbox.appendChild(el('div', 'tag red', T('teams.home')));
    hbox.appendChild(refs.homeTitle);
    hh.appendChild(hbox);
    refs.homeStars = el('span', 'stars');
    hh.appendChild(refs.homeStars);
    hc.appendChild(hh);
    refs.homeList = el('div', 'team-list');
    hc.appendChild(refs.homeList);

    var ac = el('div', 'panel-card away');
    var ah = el('div', 'col-head');
    refs.awaySwatch = el('span', 'swatch');
    refs.awayTitle = el('div', 'col-title');
    ah.appendChild(refs.awaySwatch);
    var abox = el('div');
    abox.appendChild(el('div', 'tag blue', T('teams.away')));
    abox.appendChild(refs.awayTitle);
    ah.appendChild(abox);
    refs.awayStars = el('span', 'stars');
    ah.appendChild(refs.awayStars);
    ac.appendChild(ah);
    refs.awayList = el('div', 'team-list');
    ac.appendChild(refs.awayList);
    cols.appendChild(hc);
    cols.appendChild(ac);
    wrap.appendChild(cols);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back_sides'), 'back', back));
    foot.appendChild(btn('primary', T('nav.next_plan'), 'next', function () {
      NS.Match.syncRosters();
      World.session.editingSquadIdx = 0;
      World.session.selectedStarterIdx = null;
      show('GAMEPLAN');
    }));
    wrap.appendChild(foot);
  }

  function teamButton(t, isHome) {
    var s = World.session;
    var sel = (isHome ? s.homeTeamId : s.awayTeamId) === t.id;
    var b = btn('team' + (sel ? ' sel ' + (isHome ? 'home' : 'away') : ''), '', (isHome ? 'h:' : 'a:') + t.id, function () {
      if (isHome) s.homeTeamId = t.id; else s.awayTeamId = t.id;
      NS.Match.syncRosters();
      renderTeams((isHome ? 'h:' : 'a:') + t.id);
    });
    var sw = el('span', 'swatch');
    sw.style.background = 'linear-gradient(135deg,' + NS.Assets.hexToCss(t.c1) + ' 50%,' + NS.Assets.hexToCss(t.c2) + ' 50%)';
    b.appendChild(sw);
    var box = el('div', 'team-box');
    box.appendChild(el('div', 'team-name', t.name));
    box.appendChild(el('div', 'team-sub', t.code + ' • ' + new Array(t.stars + 1).join('★')));
    b.appendChild(box);
    return b;
  }

  function renderTeams(keepKey) {
    var s = World.session;
    var cats = NS.Teams.CATEGORIES;
    clear(refs.tabs);
    cats.forEach(function (cat) {
      var b = btn('tab' + (s.activeCategory === cat.id ? ' sel' : ''), cat.label, 'c:' + cat.id, function () {
        s.activeCategory = cat.id;
        renderTeams('c:' + cat.id);
      });
      refs.tabs.appendChild(b);
    });
    clear(refs.homeList);
    clear(refs.awayList);
    var teams = NS.Teams.byCategory(s.activeCategory);
    teams.forEach(function (t) {
      refs.homeList.appendChild(teamButton(t, true));
      refs.awayList.appendChild(teamButton(t, false));
    });
    var hT = NS.Teams.byId(s.homeTeamId);
    var aT = NS.Teams.byId(s.awayTeamId);
    refs.homeTitle.textContent = hT.name + ' (' + hT.code + ')';
    refs.awayTitle.textContent = aT.name + ' (' + aT.code + ')';
    refs.homeStars.textContent = new Array(hT.stars + 1).join('★');
    refs.awayStars.textContent = new Array(aT.stars + 1).join('★');
    refs.homeSwatch.style.background = 'linear-gradient(135deg,' + NS.Assets.hexToCss(hT.c1) + ' 50%,' + NS.Assets.hexToCss(hT.c2) + ' 50%)';
    refs.awaySwatch.style.background = 'linear-gradient(135deg,' + NS.Assets.hexToCss(aT.c1) + ' 50%,' + NS.Assets.hexToCss(aT.c2) + ' 50%)';
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
  }

  /* ------------------------------ GAME PLAN ------------------------------ */

  function buildGamePlan() {
    var wrap = screens.GAMEPLAN;
    var top = el('div', 'gp-bar');
    var tabs = el('div', 'row');
    tabs.appendChild(el('span', 'muted', T('gp.editing')));
    refs.gpHome = btn('', T('gp.home'), 'gp:h', function () { World.session.editingSquadIdx = 0; World.session.selectedStarterIdx = null; renderGamePlan('gp:h'); });
    refs.gpAway = btn('', T('gp.away'), 'gp:a', function () { World.session.editingSquadIdx = 1; World.session.selectedStarterIdx = null; renderGamePlan('gp:a'); });
    tabs.appendChild(refs.gpHome);
    tabs.appendChild(refs.gpAway);
    top.appendChild(tabs);
    var forms = el('div', 'row');
    forms.appendChild(el('span', 'muted', T('gp.formation')));
    NS.FORMATION_KEYS.forEach(function (f) {
      var b = btn('form', f, 'f:' + f, function () {
        World.session.formations[World.session.editingSquadIdx] = f;
        if (matchRunning()) NS.Match.refreshFromSession();
        renderGamePlan('f:' + f);
      });
      b.setAttribute('data-form', f);
      forms.appendChild(b);
    });
    top.appendChild(forms);
    wrap.appendChild(top);

    var mid = el('div', 'gp-mid');
    var boardCard = el('div', 'panel-card boardcard');
    refs.gpTitle = el('div', 'tag green');
    boardCard.appendChild(refs.gpTitle);
    gpCanvas = document.createElement('canvas');
    gpCanvas.width = 280;
    gpCanvas.height = 190;
    gpCanvas.className = 'board-canvas';
    gpCtx = gpCanvas.getContext('2d');
    boardCard.appendChild(gpCanvas);
    boardCard.appendChild(el('p', 'muted small', T('gp.hint')));
    mid.appendChild(boardCard);

    var lists = el('div', 'panel-card lists');
    var c1 = el('div', 'list-col');
    c1.appendChild(el('div', 'tag amber', T('gp.starters')));
    refs.gpStarters = el('div', 'stack');
    c1.appendChild(refs.gpStarters);
    var c2 = el('div', 'list-col');
    c2.appendChild(el('div', 'tag blue', T('gp.bench')));
    refs.gpSubs = el('div', 'stack');
    c2.appendChild(refs.gpSubs);
    lists.appendChild(c1);
    lists.appendChild(c2);
    mid.appendChild(lists);
    wrap.appendChild(mid);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back'), 'back', back));
    var right = el('div', 'row');
    refs.btnResume = btn('good', T('nav.resume'), 'resume', resumeMatch);
    refs.btnResume.setAttribute('data-default', '1');
    refs.btnKickoff = btn('primary kick', T('nav.kickoff'), 'kick', startMatch);
    refs.btnKickoff.setAttribute('data-default', '1');
    right.appendChild(refs.btnResume);
    right.appendChild(refs.btnKickoff);
    foot.appendChild(right);
    wrap.appendChild(foot);
  }

  function drawBoard(layout, roster, teamObj) {
    var w = gpCanvas.width;
    var h = gpCanvas.height;
    var s = World.session;
    gpCtx.clearRect(0, 0, w, h);
    gpCtx.strokeStyle = 'rgba(255,255,255,0.35)';
    gpCtx.lineWidth = 1.5;
    gpCtx.strokeRect(10, 10, w - 20, h - 20);
    gpCtx.beginPath();
    gpCtx.moveTo(w / 2, 10);
    gpCtx.lineTo(w / 2, h - 10);
    gpCtx.stroke();
    gpCtx.beginPath();
    gpCtx.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
    gpCtx.stroke();
    for (var i = 0; i < layout.length; i++) {
      var slot = layout[i];
      var px = ((slot.x + NS.PITCH_HALF_W) / (NS.PITCH_HALF_W * 2)) * (w - 36) + 18;
      var pz = ((slot.z + NS.PITCH_HALF_H) / (NS.PITCH_HALF_H * 2)) * (h - 36) + 18;
      gpCtx.fillStyle = s.selectedStarterIdx === i ? '#f59e0b' : NS.Assets.hexToCss(teamObj.c1);
      gpCtx.beginPath();
      gpCtx.arc(px, pz, 8, 0, Math.PI * 2);
      gpCtx.fill();
      gpCtx.strokeStyle = '#ffffff';
      gpCtx.stroke();
      gpCtx.fillStyle = '#ffffff';
      gpCtx.font = 'bold 11px sans-serif';
      gpCtx.textAlign = 'center';
      gpCtx.fillText((roster[i] || '').slice(0, 9), px, pz + 20);
    }
  }

  function renderGamePlan(keepKey) {
    var s = World.session;
    var idx = s.editingSquadIdx;
    var teamObj = NS.Teams.byId(idx === 0 ? s.homeTeamId : s.awayTeamId);
    var formKey = s.formations[idx];
    var layout = NS.FORMATIONS[formKey];
    var roster = s.rosters[idx];
    refs.gpHome.classList.toggle('sel', idx === 0);
    refs.gpAway.classList.toggle('sel', idx === 1);
    var fb = screens.GAMEPLAN.querySelectorAll('[data-form]');
    for (var i = 0; i < fb.length; i++) fb[i].classList.toggle('sel', fb[i].getAttribute('data-form') === formKey);
    refs.gpTitle.textContent = teamObj.name + ' (' + formKey + ')';
    clear(refs.gpStarters);
    clear(refs.gpSubs);

    layout.forEach(function (slot, n) {
      var b = btn('player' + (s.selectedStarterIdx === n ? ' sel' : ''), '', 's:' + n, function () {
        s.selectedStarterIdx = n;
        renderGamePlan('s:' + n);
      });
      b.appendChild(el('span', 'role', slot.role));
      b.appendChild(el('span', 'pname', roster[n] || ('PLAYER ' + (n + 1))));
      b.appendChild(el('span', 'num', '#' + slot.num));
      refs.gpStarters.appendChild(b);
    });
    for (var j = 7; j < roster.length; j++) {
      (function (k) {
        var b = btn('player sub', '', 'b:' + k, function () {
          if (s.selectedStarterIdx === null) return;
          var tmp = roster[s.selectedStarterIdx];
          roster[s.selectedStarterIdx] = roster[k];
          roster[k] = tmp;
          var back1 = 's:' + s.selectedStarterIdx;
          s.selectedStarterIdx = null;
          if (matchRunning()) NS.Match.refreshFromSession();
          renderGamePlan(back1);
        });
        b.appendChild(el('span', 'role sub', T('gp.sub')));
        b.appendChild(el('span', 'pname', roster[k]));
        b.appendChild(el('span', 'num good', s.selectedStarterIdx !== null ? T('gp.swap') : T('gp.ready')));
        refs.gpSubs.appendChild(b);
      })(j);
    }
    drawBoard(layout, roster, teamObj);
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
  }

  /* ------------------------------ PAUSE ------------------------------ */

  function buildPause() {
    var wrap = screens.PAUSE;
    var head = el('div', 'screen-head');
    head.appendChild(el('span', 'chip', T('pause.tag')));
    refs.pauseScore = el('h2', 'score-line');
    head.appendChild(refs.pauseScore);
    wrap.appendChild(head);
    var grid = el('div', 'cards two');
    var items = [
      ['resume', 'good', '▶', resumeMatch],
      ['plan', 'sky', '📋', function () { World.session.selectedStarterIdx = null; show('GAMEPLAN'); }],
      ['settings', 'amber', '⚙️', function () { show('SETTINGS'); }],
      ['sides', 'purple', '🎮', function () { show('SIDES'); }],
      ['controls', 'teal', '❓', function () { helpReturn = 'PAUSE'; show('HELP'); }],
      ['restart', 'orange', '🔄', function () { startMatch(); }],
      ['quit', 'rose', '🏠', function () { NS.Match.exitToMenu(); }]
    ];
    items.forEach(function (it, i) {
      var b = btn('row-card tone-' + it[1], '', 'pz:' + it[0], it[3]);
      if (i === 0) b.setAttribute('data-default', '1');
      b.appendChild(el('div', 'card-icon sm', it[2]));
      var box = el('div');
      box.appendChild(el('div', 'row-title', T('pause.' + it[0])));
      box.appendChild(el('div', 'row-desc', T('pause.' + it[0] + '.d')));
      b.appendChild(box);
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
  }

  /* ------------------------------ SETTINGS ------------------------------ */

  function buildSettings() {
    var wrap = screens.SETTINGS;
    var list = el('div', 'settings-list');
    NS.SETTING_DEFS.forEach(function (def, i) {
      var row = el('div', 'set-row');
      var lab = el('div', 'set-label');
      lab.appendChild(el('div', 'set-name', T(def.label)));
      lab.appendChild(el('div', 'set-hint', T(def.hint)));
      row.appendChild(lab);
      var opts = el('div', 'row');
      def.options.forEach(function (o, j) {
        var b = btn('opt', T(o[1]), 'set:' + def.key + ':' + o[0], function () {
          NS.Storage.setSetting(def.key, o[0]);
          NS.App.applySettings();
          syncSettings();
        });
        b.setAttribute('data-set', def.key);
        b.setAttribute('data-val', String(o[0]));
        if (i === 0 && j === 0) b.setAttribute('data-default', '1');
        opts.appendChild(b);
      });
      row.appendChild(opts);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    var foot = el('div', 'foot');
    foot.appendChild(btn('danger', T('set.reset'), 'reset', function () {
      NS.Storage.resetSettings();
      NS.App.applySettings();
      syncSettings();
    }));
    foot.appendChild(btn('', T('set.buttons'), 'mapbtn', function () { show('BUTTONS'); }));
    foot.appendChild(btn('primary', T('set.done'), 'done', function () {
      if (matchRunning()) show('PAUSE'); else show('MAIN');
    }));
    wrap.appendChild(foot);
  }

  function syncSettings() {
    var settings = World.settings;
    var bs = screens.SETTINGS.querySelectorAll('[data-set]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('sel', String(settings[bs[i].getAttribute('data-set')]) === bs[i].getAttribute('data-val'));
    }
  }

  /* ------------------------------ HELP ------------------------------ */

  function buildHelp() {
    var wrap = screens.HELP;
    refs.helpCols = el('div', 'help-cols');
    wrap.appendChild(refs.helpCols);
    var foot = el('div', 'foot');
    var b = btn('primary', T('nav.back'), 'back', back);
    b.setAttribute('data-default', '1');
    foot.appendChild(b);
    foot.appendChild(btn('', T('set.buttons'), 'mapbtn', function () { show('BUTTONS'); }));
    wrap.appendChild(foot);
  }

  function helpRow(ul, idx) {
    var B = NS.Bindings;
    var li = el('li');
    li.appendChild(el('b', null, T('mv.' + B.MOVES[idx].id) + ': '));
    li.appendChild(document.createTextNode(B.bindingLabel(idx, false) + '   |   ' + T('map.pad') + ': ' + B.bindingLabel(idx, true)));
    ul.appendChild(li);
  }

  // The controls list always shows the player's own button map (remote / keyboard | gamepad).
  function renderHelp() {
    clear(refs.helpCols);
    var B = NS.Bindings;
    var groups = [['help.attack', 1], ['help.defense', 2]];
    groups.forEach(function (g) {
      var card = el('div', 'panel-card');
      card.appendChild(el('div', 'tag amber', T(g[0])));
      var ul = el('ul', 'help-list');
      if (g[1] === 1) {
        var li = el('li');
        li.appendChild(el('b', null, T('mv.sprint') + ': '));
        li.appendChild(document.createTextNode(B.maskLabel(B.sprintMask(false)) + '   |   ' + T('map.pad') + ': ' + B.maskLabel(B.sprintMask(true))));
        ul.appendChild(li);
      }
      for (var i = 0; i < B.MOVES.length; i++) if (B.MOVES[i].ctx === g[1]) helpRow(ul, i);
      card.appendChild(ul);
      refs.helpCols.appendChild(card);
    });
    var gen = el('div', 'panel-card');
    gen.appendChild(el('div', 'tag amber', T('help.general')));
    var gl = el('ul', 'help-list');
    ['help.a1', 'help.a7', 'help.d4', 'help.g1', 'help.g2', 'help.g3'].forEach(function (k) { gl.appendChild(el('li', null, T(k))); });
    gen.appendChild(gl);
    refs.helpCols.appendChild(gen);
  }

  /* ------------------------------ BUTTON MAPPING ------------------------------ */

  function buildButtons() {
    var wrap = screens.BUTTONS;
    var head = el('div', 'screen-head');
    head.appendChild(el('h2', null, T('map.title')));
    head.appendChild(el('p', 'muted small', T('map.sub')));
    refs.mapNote = el('p', 'map-note hidden', T('map.noraw'));
    head.appendChild(refs.mapNote);
    wrap.appendChild(head);
    refs.mapCols = el('div', 'help-cols map-cols');
    wrap.appendChild(refs.mapCols);
    refs.mapMsg = el('div', 'map-msg');
    wrap.appendChild(refs.mapMsg);
    var foot = el('div', 'foot');
    var left = el('div', 'row');
    left.appendChild(btn('', T('nav.back'), 'back', back));
    left.appendChild(btn('danger', T('map.reset'), 'mapreset', function () {
      NS.Bindings.reset();
      NS.Storage.saveBindings();
      renderButtons('mapreset');
      refs.mapMsg.textContent = T('map.reset.done');
    }));
    foot.appendChild(left);
    foot.appendChild(btn('', T('map.clear'), 'mapclear', function () {
      if (mapLast >= 0) {
        NS.Bindings.clear(mapLast);
        NS.Storage.saveBindings();
        renderButtons('mapclear');
        refs.mapMsg.textContent = T('map.cleared');
      }
    }));
    wrap.appendChild(foot);

    // capture overlay
    refs.capture = el('div', 'capture hidden');
    var box = el('div', 'capture-box');
    refs.capTitle = el('div', 'cap-title');
    refs.capText = el('div', 'cap-text');
    refs.capLive = el('div', 'cap-live');
    refs.capCount = el('div', 'cap-count');
    box.appendChild(refs.capTitle);
    box.appendChild(refs.capText);
    box.appendChild(refs.capLive);
    box.appendChild(refs.capCount);
    box.appendChild(el('div', 'cap-note', T('map.note')));
    refs.capture.appendChild(box);
    wrap.appendChild(refs.capture);
  }

  function mapRow(idx) {
    var B = NS.Bindings;
    var sprint = idx === -1;
    var b = btn('map-row', '', 'mv:' + idx, function () { startCapture(idx); });
    b.setAttribute('data-mv', String(idx));
    b.appendChild(el('span', 'map-name', T(sprint ? 'mv.sprint' : 'mv.' + B.MOVES[idx].id)));
    var vals = el('span', 'map-vals');
    var kb = sprint ? B.maskLabel(B.sprintMask(false)) : B.bindingLabel(idx, false);
    var pad = sprint ? B.maskLabel(B.sprintMask(true)) : B.bindingLabel(idx, true);
    var v1 = el('span', 'map-val' + (!sprint && !B.MOVES[idx].mask ? ' off' : ''));
    v1.appendChild(el('i', 'map-dev', T('map.kb')));
    v1.appendChild(document.createTextNode(kb));
    var v2 = el('span', 'map-val pad' + (!sprint && !B.MOVES[idx].pmask ? ' off' : ''));
    v2.appendChild(el('i', 'map-dev', T('map.pad')));
    v2.appendChild(document.createTextNode(pad));
    vals.appendChild(v1);
    vals.appendChild(v2);
    b.appendChild(vals);
    return b;
  }

  function renderButtons(focusKey) {
    var B = NS.Bindings;
    clear(refs.mapCols);
    refs.mapNote.classList.toggle('hidden', NS.Input.rawEnabled());
    var groups = [['map.group.move', 0], ['map.group.att', 1], ['map.group.def', 2]];
    groups.forEach(function (g) {
      var card = el('div', 'panel-card');
      card.appendChild(el('div', 'tag amber', T(g[0])));
      var list = el('div', 'stack');
      if (g[1] === 0) list.appendChild(mapRow(-1));
      else for (var i = 0; i < B.MOVES.length; i++) if (B.MOVES[i].ctx === g[1]) list.appendChild(mapRow(i));
      card.appendChild(list);
      refs.mapCols.appendChild(card);
    });
    refs.capture.classList.add('hidden');
    if (focusKey) { focused = null; if (!focusByKey(focusKey)) focusDefault(); }
  }

  // Detection: the real button(s) pressed on the remote, keyboard or gamepad. The gamepad side is set when a gamepad
  // button was pressed, the remote / keyboard side otherwise. Nothing cancels it but the 5 s timeout.
  function startCapture(idx) {
    var B = NS.Bindings;
    var sprint = idx === -1;
    refs.capTitle.textContent = T(sprint ? 'mv.sprint' : 'mv.' + B.MOVES[idx].id);
    refs.capText.textContent = T(sprint ? 'map.prompt.sprint' : 'map.prompt');
    refs.capLive.textContent = T('map.waiting');
    refs.capture.classList.remove('hidden');
    refs.mapMsg.textContent = '';
    NS.Mapper.start(function (mask, tier) {
      var msg;
      var pad = B.isPadMask(mask);
      if (!mask) {
        msg = T('map.timeout');
      } else if (sprint) {
        B.setSprint(mask);
        msg = T('mv.sprint') + ' (' + T(pad ? 'map.pad' : 'map.kb') + ') = ' + B.maskLabel(mask);
      } else {
        var cleared = B.set(idx, mask, tier);
        msg = T('mv.' + B.MOVES[idx].id) + ' (' + T(pad ? 'map.pad' : 'map.kb') + ') = ' + B.bindingLabel(idx, pad) +
          (cleared >= 0 ? '   (' + T('mv.' + B.MOVES[cleared].id) + ': ' + T('map.conflict') + ')' : '');
      }
      if (mask) NS.Storage.saveBindings();
      renderButtons('mv:' + idx);
      refs.mapMsg.textContent = msg;
      NS.Input.clearEdges();
      NS.Input.block(350); // the button just mapped must not also press the focused row again
    }, function (mask) {
      refs.capLive.textContent = T('map.detected') + ' ' + B.maskLabel(mask);
    }, function (secs) {
      refs.capCount.textContent = T('map.countdown').replace('%s', secs);
    });
  }

  /* ------------------------------ public ------------------------------ */

  NS.UI = {
    build: function () {
      root = document.getElementById('menu-root');
      refs.badge = document.getElementById('menu-step-badge');
      refs.statWins = document.getElementById('menu-stat-wins');
      refs.statCups = document.getElementById('menu-stat-cups');
      refs.statGoals = document.getElementById('menu-stat-goals');
      for (var i = 0; i < order.length; i++) screens[order[i]] = document.getElementById('screen-' + order[i].toLowerCase());
      buildMain();
      buildSides();
      buildTeams();
      buildGamePlan();
      buildPause();
      buildSettings();
      buildHelp();
      buildButtons();
      NS.Match.syncRosters();
      updateSideSlots();
      lastFocusKey.TEAMS = 'h:' + World.session.homeTeamId;
    },
    show: show,
    hide: hide,
    isOpen: function () { return open; },
    screen: function () { return current; },
    openPause: function () {
      World.match.paused = true;
      NS.Audio.whistle();
      show('PAUSE');
    },
    // Opens one of our screens from a My PC pause-menu item (onMenu).
    openFromHost: function (id) {
      if (!matchRunning()) return;
      if (id === 'restart') { startMatch(); return; }
      if (id === 'abandon') { NS.Match.exitToMenu(); return; }
      if (id === 'plan') { World.session.selectedStarterIdx = null; show('GAMEPLAN'); }
      else if (id === 'settings') show('SETTINGS');
      else if (id === 'sides') show('SIDES');
      else if (id === 'controls') { helpReturn = 'PAUSE'; show('HELP'); }
    },
    refreshStats: function () {
      var st = NS.Storage.getStats();
      refs.statWins.textContent = st.wins;
      refs.statCups.textContent = st.cups;
      refs.statGoals.textContent = st.goals;
    },
    onInput: function (action, pressed, repeat) {
      if (NS.Mapper.active()) return; // the mapper is listening to the real buttons
      if (!pressed) return;
      switch (action) {
        case 'left': move(0); break;
        case 'right': move(1); break;
        case 'up': move(2); break;
        case 'down': move(3); break;
        case 'confirm': if (!repeat && focused) focused.click(); break;
        case 'cancel': if (!repeat) back(); break;
        case 'menu': if (!repeat && matchRunning()) { if (current === 'PAUSE') resumeMatch(); else back(); } break;
      }
    }
  };
})(window.RS6 = window.RS6 || {});
