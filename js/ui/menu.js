/* Menus: main, controller sides, teams, game plan, competitions (team pick + hub), pause, settings, controls help.
 * Fully usable with a TV remote: arrows move the focus (spatial navigation), OK clicks, Back/cancel goes back.
 * Input arrives from My PC only (UI.onInput); there are no keydown listeners. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var T = function (k) { return NS.I18n.t(k); };

  var root;
  var screens = {};
  var order = ['MAIN', 'SIDES', 'TEAMS', 'GAMEPLAN', 'COMPPICK', 'COMPHUB', 'PAUSE', 'SETTINGS', 'HELP', 'BUTTONS', 'DEBUG'];
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
    { comp: 'DOMESTIC_LEAGUE', icon: '🛡️', tone: 'green' },
    { comp: 'CONTINENTAL_CUP', icon: '🏆', tone: 'amber' },
    { comp: 'WORLD_NATIONALS', icon: '🌍', tone: 'purple' }
  ];
  var PRESETS = ['1P_CPU', '1P_2P', 'COOP_CPU', 'CPU_CPU'];
  // competition being set up on the team-pick screen
  var pick = { comp: 'DOMESTIC_LEAGUE', cat: 'LEAGUE_MAR', team: 'WAC', side: '1P_CPU' };
  var abandonArmed = false;

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

  // Marks the screen's main button: the gamepad / phone + (Start) presses it, and it shows a + badge.
  function plusKey(b) {
    b.setAttribute('data-plus', '1');
    b.appendChild(el('span', 'plus-key', '+'));
    return b;
  }

  function plusButton() {
    var list = screens[current].querySelectorAll('[data-plus]');
    for (var i = 0; i < list.length; i++) if (list[i].offsetParent !== null && !list[i].disabled) return list[i];
    return null;
  }

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
    if (matchRunning()) { World.match.paused = true; NS.Audio.crowd(false); }
    for (var i = 0; i < order.length; i++) screens[order[i]].classList.toggle('hidden', order[i] !== key);
    refs.badge.textContent = T('step.' + key.toLowerCase());
    refreshNav();
    if (key === 'MAIN') renderMain();
    if (key === 'COMPPICK') renderCompPick();
    if (key === 'COMPHUB') { abandonArmed = false; renderCompHub(); }
    if (key === 'SIDES') updateSideSlots();
    if (key === 'TEAMS') renderTeams();
    if (key === 'GAMEPLAN') renderGamePlan();
    if (key === 'SETTINGS') renderSettings();
    if (key === 'HELP') renderHelp();
    if (key === 'BUTTONS') renderButtons();
    if (key === 'DEBUG') renderDebug();
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
    refs.sidesNext.firstChild.textContent = running ? T('nav.apply_sides') : T('nav.next_teams');
  }

  function back() {
    if (current === 'BUTTONS') { show('SETTINGS'); return; }
    if (current === 'DEBUG') { if (!NS.Debug.running()) show('SETTINGS'); return; }
    var running = matchRunning();
    if (running) {
      if (current === 'PAUSE') resumeMatch();
      else if (current === 'HELP') show(helpReturn);
      else show('PAUSE');
      return;
    }
    if (current === 'GAMEPLAN') show(NS.Comp.active() ? 'COMPHUB' : 'TEAMS');
    else if (current === 'COMPHUB') { NS.Comp.leave(); show('MAIN'); }
    else if (current === 'COMPPICK') show('MAIN');
    else if (current === 'TEAMS') show('SIDES');
    else if (current === 'HELP') show(helpReturn);
    else if (current !== 'MAIN') show('MAIN');
  }

  function resumeMatch() {
    hide();
    World.match.paused = false;
    NS.Audio.crowd(true);
    NS.App.syncMenuItems();
  }

  function startMatch() {
    if (!NS.Comp.active()) World.session.compActive = false;
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

  function card(tone, key, icon, tag, title, desc, onClick) {
    var b = btn('card tone-' + tone, '', key, onClick);
    b.appendChild(el('div', 'card-icon', icon));
    b.appendChild(el('div', 'card-tag', tag));
    b.appendChild(el('h2', 'card-title', title));
    b.appendChild(el('p', 'card-desc', desc));
    return b;
  }

  function buildMain() {
    refs.mainGrid = el('div', 'cards');
    screens.MAIN.appendChild(refs.mainGrid);
  }

  // Rebuilt each time (the "continue" card follows the saved competition).
  function renderMain() {
    var grid = refs.mainGrid;
    clear(grid);
    var saved = NS.Comp.saved();
    if (saved && !saved.done) {
      var u = NS.Teams.byId(saved.user);
      var c = card('green', 'm:continue', '▶', T('mode.continue.tag'), T('mode.continue'),
        T('mode.' + saved.compType) + ' • ' + u.name + ' • ' + NS.Comp.stageLabel(), function () {
          NS.Comp.enter();
          show('COMPHUB');
        });
      grid.appendChild(c);
    }
    MODES.forEach(function (m) {
      grid.appendChild(card(m.tone, 'm:' + m.comp, m.icon, T('mode.' + m.comp + '.tag'), T('mode.' + m.comp), T('mode.' + m.comp + '.d'), function () {
        NS.Comp.leave();
        World.session.compType = m.comp;
        if (m.comp === 'EXHIBITION') { show('SIDES'); return; }
        var cats = NS.Comp.catsFor(m.comp);
        if (pick.comp !== m.comp) {
          pick.comp = m.comp;
          pick.cat = cats[0].id;
          pick.team = NS.Teams.byCategory(pick.cat)[0].id;
        }
        show('COMPPICK');
      }));
    });
    grid.appendChild(card('rose', 'm:settings', '⚙️', T('mode.settings.tag'), T('mode.settings'), T('mode.settings.d'), function () { show('SETTINGS'); }));
    grid.appendChild(card('teal', 'm:help', '🎮', T('mode.help.tag'), T('mode.help'), T('mode.help.d'), function () { helpReturn = 'MAIN'; show('HELP'); }));
    var first = grid.firstChild;
    if (first) first.setAttribute('data-default', '1');
  }

  /* ------------------------------ COMPETITION: pick your team ------------------------------ */

  function buildCompPick() {
    var wrap = screens.COMPPICK;
    var head = el('div', 'screen-head');
    refs.cpTitle = el('h2');
    refs.cpSub = el('p', 'muted');
    head.appendChild(refs.cpTitle);
    head.appendChild(refs.cpSub);
    wrap.appendChild(head);
    refs.cpTabs = el('div', 'tabs');
    wrap.appendChild(refs.cpTabs);
    var cols = el('div', 'cp-cols');
    var lc = el('div', 'panel-card');
    lc.appendChild(el('div', 'tag amber', T('cp.team')));
    refs.cpList = el('div', 'team-list');
    lc.appendChild(refs.cpList);
    var rc = el('div', 'panel-card cp-side');
    rc.appendChild(el('div', 'tag green', T('cp.players')));
    var st = el('div', 'stack');
    [['1P_CPU', 'cp.1p'], ['COOP_CPU', 'cp.coop']].forEach(function (o) {
      var b = btn('wide', T(o[1]), 'cp:' + o[0], function () { pick.side = o[0]; renderCompPick('cp:' + o[0]); });
      b.setAttribute('data-side', o[0]);
      st.appendChild(b);
    });
    rc.appendChild(st);
    refs.cpPicked = el('div', 'cp-picked');
    rc.appendChild(refs.cpPicked);
    refs.cpWarn = el('p', 'muted small', T('cp.replace'));
    rc.appendChild(refs.cpWarn);
    cols.appendChild(lc);
    cols.appendChild(rc);
    wrap.appendChild(cols);
    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back'), 'back', back));
    foot.appendChild(plusKey(btn('primary', T('cp.start'), 'cpstart', function () {
      NS.Comp.start(pick.comp, pick.team, pick.side);
      show('COMPHUB');
    })));
    wrap.appendChild(foot);
  }

  function swatchOf(t) {
    var sw = el('span', 'swatch');
    sw.style.background = 'linear-gradient(135deg,' + NS.Assets.hexToCss(t.c1) + ' 50%,' + NS.Assets.hexToCss(t.c2) + ' 50%)';
    return sw;
  }

  function renderCompPick(keepKey) {
    refs.cpTitle.textContent = T('mode.' + pick.comp);
    refs.cpSub.textContent = T('cp.sub.' + pick.comp);
    clear(refs.cpTabs);
    NS.Comp.catsFor(pick.comp).forEach(function (cat) {
      refs.cpTabs.appendChild(btn('tab' + (pick.cat === cat.id ? ' sel' : ''), cat.label, 'cc:' + cat.id, function () {
        pick.cat = cat.id;
        renderCompPick('cc:' + cat.id);
      }));
    });
    clear(refs.cpList);
    NS.Teams.byCategory(pick.cat).forEach(function (t) {
      var b = btn('team' + (pick.team === t.id ? ' sel home' : ''), '', 'ct:' + t.id, function () {
        pick.team = t.id;
        renderCompPick('ct:' + t.id);
      });
      if (pick.team === t.id) b.setAttribute('data-default', '1');
      b.appendChild(swatchOf(t));
      var box = el('div', 'team-box');
      box.appendChild(el('div', 'team-name', t.name));
      box.appendChild(el('div', 'team-sub', t.code + ' • ' + new Array(t.stars + 1).join('★')));
      b.appendChild(box);
      refs.cpList.appendChild(b);
    });
    var sides = screens.COMPPICK.querySelectorAll('[data-side]');
    for (var i = 0; i < sides.length; i++) sides[i].classList.toggle('sel', sides[i].getAttribute('data-side') === pick.side);
    var t = NS.Teams.byId(pick.team);
    clear(refs.cpPicked);
    refs.cpPicked.appendChild(swatchOf(t));
    refs.cpPicked.appendChild(el('b', null, t.name));
    var saved = NS.Comp.saved();
    refs.cpWarn.classList.toggle('hidden', !(saved && !saved.done));
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
  }

  /* ------------------------------ COMPETITION: hub ------------------------------ */

  function buildCompHub() {
    var wrap = screens.COMPHUB;
    var head = el('div', 'screen-head hub-head');
    refs.chStage = el('span', 'chip');
    refs.chTitle = el('h2');
    refs.chMsg = el('p', 'hub-msg');
    head.appendChild(refs.chStage);
    head.appendChild(refs.chTitle);
    head.appendChild(refs.chMsg);
    wrap.appendChild(head);
    var cols = el('div', 'hub-cols');
    refs.chLeft = el('div', 'panel-card hub-left');
    refs.chRight = el('div', 'panel-card hub-right');
    cols.appendChild(refs.chLeft);
    cols.appendChild(refs.chRight);
    wrap.appendChild(cols);
    var foot = el('div', 'foot');
    var left = el('div', 'row');
    left.appendChild(btn('', T('comp.menu'), 'back', back));
    refs.chAbandon = btn('danger', T('comp.abandon'), 'abandon', function () {
      if (!abandonArmed) { abandonArmed = true; refs.chAbandon.textContent = T('comp.abandon2'); return; }
      NS.Comp.abandon();
      show('MAIN');
    });
    left.appendChild(refs.chAbandon);
    foot.appendChild(left);
    refs.chPlay = plusKey(btn('primary kick', T('comp.play'), 'play', function () {
      var st = NS.Comp.state();
      if (st && st.done) { pick.comp = st.compType; show('COMPPICK'); return; }
      if (!NS.Comp.prepareMatch()) return;
      World.session.editingSquadIdx = 0;
      World.session.selectedStarterIdx = null;
      show('GAMEPLAN');
    }));
    refs.chPlay.setAttribute('data-default', '1');
    foot.appendChild(refs.chPlay);
    wrap.appendChild(foot);
  }

  function tableEl(ids, user, compact) {
    var tb = el('table', 'ltable' + (compact ? ' compact' : ''));
    var hr = el('tr');
    ['#', T('comp.t.team'), 'P', 'W', 'D', 'L', compact ? null : T('comp.t.gd'), 'Pts'].forEach(function (h) { if (h !== null) hr.appendChild(el('th', null, h)); });
    tb.appendChild(hr);
    var st = NS.Comp.state();
    NS.Comp.sortTable(ids).forEach(function (id, i) {
      var r = st.table[id];
      var t = NS.Teams.byId(id);
      var tr = el('tr', id === user ? 'me' : null);
      tr.appendChild(el('td', null, String(i + 1)));
      var td = el('td', 'tn');
      td.appendChild(swatchOf(t));
      td.appendChild(document.createTextNode(compact ? t.code : t.name));
      tr.appendChild(td);
      [r.p, r.w, r.d, r.l].forEach(function (v) { tr.appendChild(el('td', null, String(v))); });
      if (!compact) tr.appendChild(el('td', null, String(r.gf - r.ga)));
      tr.appendChild(el('td', 'pts', String(r.pts)));
      tb.appendChild(tr);
    });
    return tb;
  }

  function bracketEl(ko, user) {
    var wrap = el('div', 'bracket');
    var sizes = [16, 8, 4, 2];
    var first = ko[0].length * 2;
    for (var r = 0; r < sizes.length; r++) {
      if (sizes[r] > first) continue;
      var idx = sizes.indexOf(first) >= 0 ? r - sizes.indexOf(first) : r;
      var col = el('div', 'br-col');
      col.appendChild(el('div', 'br-title', NS.Comp.koLabel(sizes[r])));
      var round = ko[idx];
      var n = sizes[r] / 2;
      for (var k = 0; k < n; k++) {
        var m = round ? round[k] : null;
        var box = el('div', 'br-match' + (m && (m.a === user || m.b === user) ? ' me' : ''));
        if (m) {
          [[m.a, m.ga, m.pa], [m.b, m.gb, m.pb]].forEach(function (x) {
            var row = el('div', 'br-team' + (m.w && m.w === x[0] ? ' win' : (m.w ? ' lose' : '')));
            row.appendChild(el('span', null, NS.Teams.byId(x[0]).code));
            row.appendChild(el('b', null, x[1] >= 0 ? String(x[1]) + (x[2] >= 0 ? ' (' + x[2] + ')' : '') : ''));
            box.appendChild(row);
          });
        } else {
          box.appendChild(el('div', 'br-team tbd', '—'));
          box.appendChild(el('div', 'br-team tbd', '—'));
        }
        col.appendChild(box);
      }
      wrap.appendChild(col);
    }
    return wrap;
  }

  function renderCompHub() {
    var st = NS.Comp.state();
    if (!st) { show('MAIN'); return; }
    var u = NS.Teams.byId(st.user);
    refs.chStage.textContent = NS.Comp.stageLabel();
    refs.chTitle.textContent = T('mode.' + st.compType) + ' • ' + u.name;
    var msg = st.msg || '';
    if (st.done && st.champion) msg = (msg ? msg + ' • ' : '') + T('comp.champ_is') + ' ' + NS.Teams.byId(st.champion).name + ' 🏆';
    refs.chMsg.textContent = msg;
    refs.chMsg.classList.toggle('gold', !!(st.done && st.champion === st.user));

    clear(refs.chLeft);
    if (st.type === 'LEAGUE') {
      refs.chLeft.appendChild(el('div', 'tag amber', T('comp.table')));
      refs.chLeft.appendChild(tableEl(st.teams, st.user, false));
    } else if (st.type === 'WORLDCUP' && st.stage === 'G') {
      refs.chLeft.appendChild(el('div', 'tag amber', T('comp.groups')));
      var gw = el('div', 'groups');
      st.groups.forEach(function (g, i) {
        var box = el('div', 'group');
        box.appendChild(el('div', 'br-title', T('comp.group') + ' ' + 'ABCD'.charAt(i)));
        box.appendChild(tableEl(g, st.user, true));
        gw.appendChild(box);
      });
      refs.chLeft.appendChild(gw);
    } else {
      refs.chLeft.appendChild(el('div', 'tag amber', T('comp.bracket')));
      refs.chLeft.appendChild(bracketEl(st.ko, st.user));
    }

    clear(refs.chRight);
    var nm = NS.Comp.nextMatch();
    refs.chRight.appendChild(el('div', 'tag green', st.done ? T('comp.final_word') : T('comp.next')));
    if (nm) {
      var vs = el('div', 'vs');
      [nm.home, nm.away].forEach(function (id, i) {
        var t = NS.Teams.byId(id);
        var side = el('div', 'vs-team' + (id === st.user ? ' me' : ''));
        side.appendChild(swatchOf(t));
        side.appendChild(el('div', 'vs-name', t.name));
        side.appendChild(el('div', 'muted small', i === 0 ? T('comp.home') : T('comp.away')));
        vs.appendChild(side);
        if (i === 0) vs.appendChild(el('div', 'vs-x', 'VS'));
      });
      refs.chRight.appendChild(vs);
    } else if (st.done && st.champion) {
      var ch = NS.Teams.byId(st.champion);
      var cbox = el('div', 'champ');
      cbox.appendChild(el('div', 'champ-cup', '🏆'));
      cbox.appendChild(swatchOf(ch));
      cbox.appendChild(el('div', 'vs-name', ch.name));
      refs.chRight.appendChild(cbox);
    }
    if (st.last && st.last.length) {
      refs.chRight.appendChild(el('div', 'tag blue', T('comp.results')));
      var ul = el('ul', 'results');
      st.last.forEach(function (line) { ul.appendChild(el('li', null, line)); });
      refs.chRight.appendChild(ul);
    }
    refs.chPlay.firstChild.textContent = st.done ? T('comp.new') : T('comp.play');
    refs.chAbandon.textContent = T('comp.abandon');
    refs.chAbandon.classList.toggle('hidden', !!st.done);
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
    refs.sidesNext = plusKey(btn('primary', T('nav.next_teams'), 'next', function () {
      if (matchRunning()) { NS.Match.applySides(); show('PAUSE'); } else show('TEAMS');
    }));
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
    refs.homeTabs = el('div', 'tabs');
    hc.appendChild(refs.homeTabs);
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
    refs.awayTabs = el('div', 'tabs');
    ac.appendChild(refs.awayTabs);
    refs.awayList = el('div', 'team-list');
    ac.appendChild(refs.awayList);
    cols.appendChild(hc);
    cols.appendChild(ac);
    wrap.appendChild(cols);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back_sides'), 'back', back));
    foot.appendChild(plusKey(btn('primary', T('nav.next_plan'), 'next', function () {
      NS.Match.syncRosters();
      World.session.editingSquadIdx = 0;
      World.session.selectedStarterIdx = null;
      show('GAMEPLAN');
    })));
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
    // each side has its own league / group tabs (a Spanish club against a French one, a club against a nation...)
    [[refs.homeTabs, 'activeCategory', 'ch:'], [refs.awayTabs, 'awayCategory', 'ca:']].forEach(function (side) {
      clear(side[0]);
      cats.forEach(function (cat) {
        side[0].appendChild(btn('tab' + (s[side[1]] === cat.id ? ' sel' : ''), cat.label, side[2] + cat.id, function () {
          s[side[1]] = cat.id;
          renderTeams(side[2] + cat.id);
        }));
      });
    });
    clear(refs.homeList);
    clear(refs.awayList);
    NS.Teams.byCategory(s.activeCategory).forEach(function (t) { refs.homeList.appendChild(teamButton(t, true)); });
    NS.Teams.byCategory(s.awayCategory).forEach(function (t) { refs.awayList.appendChild(teamButton(t, false)); });
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
        else NS.Match.refitRoster(World.session.editingSquadIdx); // the right players for the new positions
        renderGamePlan('f:' + f);
      });
      b.setAttribute('data-form', f);
      forms.appendChild(b);
    });
    top.appendChild(forms);
    // tactics: what each block (defence, midfield, attack) is told to do; confirm cycles defensive / balanced / attacking
    var tac = el('div', 'row');
    tac.appendChild(el('span', 'muted', T('tac.title')));
    refs.tacBtns = [];
    [0, 1, 2].forEach(function (b) {
      var bt = btn('tac', '', 'tac:' + b, function () {
        var row = World.session.tactics[World.session.editingSquadIdx];
        row[b] = (row[b] + 1) % 3;
        renderGamePlan('tac:' + b);
      });
      refs.tacBtns.push(bt);
      tac.appendChild(bt);
    });
    top.appendChild(tac);
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
    refs.gpStats = el('div', 'gp-stats');
    boardCard.appendChild(refs.gpStats);
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
    refs.btnResume = plusKey(btn('good', T('nav.resume'), 'resume', resumeMatch));
    refs.btnResume.setAttribute('data-default', '1');
    refs.btnKickoff = plusKey(btn('primary kick', T('nav.kickoff'), 'kick', startMatch));
    refs.btnKickoff.setAttribute('data-default', '1');
    right.appendChild(refs.btnResume);
    right.appendChild(refs.btnKickoff);
    foot.appendChild(right);
    wrap.appendChild(foot);
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

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
      // kick-off positions are all in our half: spread them over the whole board (keeper left, forwards right)
      var px = clamp01((slot.x + 52.5) / 52.5) * (w - 36) + 18;
      var pz = ((slot.z + 34) / 68) * (h - 36) + 18;
      gpCtx.fillStyle = s.selectedStarterIdx === i ? '#f59e0b' : NS.Assets.hexToCss(teamObj.c1);
      gpCtx.beginPath();
      gpCtx.arc(px, pz, 8, 0, Math.PI * 2);
      gpCtx.fill();
      gpCtx.strokeStyle = '#ffffff';
      gpCtx.stroke();
      gpCtx.fillStyle = '#ffffff';
      gpCtx.font = layout.length > 7 ? 'bold 9px sans-serif' : 'bold 11px sans-serif';
      gpCtx.textAlign = 'center';
      gpCtx.fillText((roster[i] || '').slice(0, 9), px, pz + (layout.length > 7 ? 17 : 20));
    }
  }

  // the six ratings of one player on a hexagon, PES style: one corner per rating with its name and value
  var STAT_KEYS = [['spd', 'st.spd'], ['drb', 'st.drb'], ['sht', 'st.sht'], ['sta', 'st.sta'], ['hdr', 'st.hdr'], ['def', 'st.def']];
  var hexCanvas = null;
  function showStats(teamObj, name) {
    var box = refs.gpStats;
    clear(box);
    if (!name) return;
    var st = NS.Players.statsFor(teamObj, name);
    var head = el('div', 'gp-st-head');
    head.appendChild(el('b', null, name));
    head.appendChild(el('span', 'chip', st.pos + '  ' + st.ovr));
    box.appendChild(head);
    if (!hexCanvas) {
      hexCanvas = document.createElement('canvas');
      hexCanvas.width = 240;
      hexCanvas.height = 196;
      hexCanvas.className = 'hex-canvas';
    }
    box.appendChild(hexCanvas);
    drawHex(hexCanvas, st, teamObj);
  }

  function drawHex(cv, st, teamObj) {
    var g = cv.getContext('2d');
    var w = cv.width, h = cv.height, cx = w / 2, cy = h / 2 + 2, R = 56;
    var n = STAT_KEYS.length, i, k, a;
    g.clearRect(0, 0, w, h);
    function pt(idx, r) { a = -Math.PI / 2 + idx * Math.PI * 2 / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    // the web: rings at 25 / 50 / 75 / 100, and the spokes
    g.lineWidth = 1;
    for (k = 1; k <= 4; k++) {
      g.beginPath();
      for (i = 0; i <= n; i++) { var q = pt(i % n, R * k / 4); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.fillStyle = k % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
      g.strokeStyle = 'rgba(255,255,255,' + (k === 4 ? 0.45 : 0.18) + ')';
      if (k === 4) g.fill();
      g.stroke();
    }
    for (i = 0; i < n; i++) { var s0 = pt(i, R); g.beginPath(); g.moveTo(cx, cy); g.lineTo(s0[0], s0[1]); g.stroke(); }
    // the player's shape
    g.beginPath();
    for (i = 0; i <= n; i++) {
      var v = st[STAT_KEYS[i % n][0]];
      var p = pt(i % n, R * Math.max(0.05, (v - 30) / 69));
      if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
    var col = NS.Assets.hexToCss(teamObj.c1);
    g.fillStyle = 'rgba(56,189,248,0.38)';
    g.fill();
    g.strokeStyle = '#7dd3fc';
    g.lineWidth = 2;
    g.stroke();
    // names and values at the corners
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (i = 0; i < n; i++) {
      var val = st[STAT_KEYS[i][0]];
      var l = pt(i, R + 24);
      g.font = 'bold 12px sans-serif';
      g.fillStyle = '#cbd5e1';
      g.fillText(T(STAT_KEYS[i][1]).toUpperCase(), l[0], l[1] - 7);
      g.font = 'bold 15px sans-serif';
      g.fillStyle = val >= 80 ? '#4ade80' : (val >= 65 ? '#facc15' : '#f87171');
      g.fillText(String(val), l[0], l[1] + 7);
    }
    g.fillStyle = col;
    g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
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
    var trow = s.tactics[idx];
    for (var tb = 0; tb < 3; tb++) {
      refs.tacBtns[tb].textContent = T('tac.b' + tb) + ': ' + T('tac.m' + trow[tb]);
      for (var mk = 0; mk < 3; mk++) refs.tacBtns[tb].classList.toggle('m' + mk, trow[tb] === mk);
    }
    clear(refs.gpStarters);
    clear(refs.gpSubs);

    layout.forEach(function (slot, n) {
      var b = btn('player' + (s.selectedStarterIdx === n ? ' sel' : ''), '', 's:' + n, function () {
        s.selectedStarterIdx = n;
        renderGamePlan('s:' + n);
      });
      b.appendChild(el('span', 'role', slot.role));
      b.appendChild(el('span', 'pname', roster[n] || ('PLAYER ' + (n + 1))));
      b.appendChild(el('span', 'ovr', String(NS.Players.statsFor(teamObj, roster[n]).ovr)));
      b.appendChild(el('span', 'num', '#' + slot.num));
      refs.gpStarters.appendChild(b);
    });
    for (var j = layout.length; j < roster.length; j++) {
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
        b.appendChild(el('span', 'ovr', String(NS.Players.statsFor(teamObj, roster[k]).ovr)));
        b.appendChild(el('span', 'num good', s.selectedStarterIdx !== null ? T('gp.swap') : T('gp.ready')));
        refs.gpSubs.appendChild(b);
      })(j);
    }
    drawBoard(layout, roster, teamObj);
    showStats(teamObj, roster[s.selectedStarterIdx !== null ? s.selectedStarterIdx : 0]);
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

  var settingsGroup = 'game';

  // Settings: one tab per group (Gameplay, Graphics, Audio), only that group's rows below it.
  function buildSettings() {
    var wrap = screens.SETTINGS;
    refs.setTabs = el('div', 'tabs set-tabs');
    NS.SETTING_GROUPS.forEach(function (g, i) {
      var b = btn('tab', T(g[1]), 'sg:' + g[0], function () {
        settingsGroup = g[0];
        renderSettings('sg:' + g[0]);
      });
      b.setAttribute('data-group', g[0]);
      if (i === 0) b.setAttribute('data-default', '1');
      refs.setTabs.appendChild(b);
    });
    wrap.appendChild(refs.setTabs);
    refs.setList = el('div', 'settings-list');
    wrap.appendChild(refs.setList);
    var foot = el('div', 'foot');
    foot.appendChild(btn('danger', T('set.reset'), 'reset', function () {
      NS.Storage.resetSettings();
      NS.App.applySettings();
      syncSettings();
    }));
    foot.appendChild(btn('', T('set.buttons'), 'mapbtn', function () { show('BUTTONS'); }));
    refs.debugBtn = btn('', T('dbg.open'), 'dbgbtn', function () { show('DEBUG'); });
    foot.appendChild(refs.debugBtn);
    foot.appendChild(btn('primary', T('set.done'), 'done', function () {
      if (matchRunning()) show('PAUSE'); else show('MAIN');
    }));
    wrap.appendChild(foot);
  }

  /* ------------------------------ DEBUG MATCHES ------------------------------ */

  // CPU v CPU matches at full speed with every move counted (js/game/debug.js); the report goes into a text box to copy.
  var DBG_OPTS = [
    ['matches', [5, 10, 20, 50, 100]],
    ['home', ['EASY', 'NORMAL', 'HARD', 'LEGEND']],
    ['away', ['EASY', 'NORMAL', 'HARD', 'LEGEND']],
    ['teams', ['SELECTED', 'RANDOM']],
    ['size', [11, 7]],
    ['stadium', ['COMPACT', 'CLASSIC', 'GRAND', 'MEGA']],
    ['length', [3, 5, 10]]
  ];
  var dbgSel = { matches: 1, home: 1, away: 1, teams: 0, size: 0, stadium: 1, length: 0 };
  var dbgReport = '';

  function buildDebug() {
    var wrap = screens.DEBUG;
    refs.dbgOpts = el('div', 'dbg-opts');
    wrap.appendChild(refs.dbgOpts);
    refs.dbgStatus = el('div', 'muted dbg-status');
    wrap.appendChild(refs.dbgStatus);
    refs.dbgText = document.createElement('textarea');
    refs.dbgText.className = 'dbg-text';
    refs.dbgText.readOnly = true;
    refs.dbgText.setAttribute('spellcheck', 'false');
    wrap.appendChild(refs.dbgText);
    var foot = el('div', 'foot');
    refs.dbgBack = btn('', T('nav.back'), 'back', back);
    foot.appendChild(refs.dbgBack);
    var right = el('div', 'row');
    refs.dbgCopy = btn('', T('dbg.copy'), 'dbgcopy', copyDebug);
    refs.dbgRun = btn('primary', T('dbg.run'), 'dbgrun', function () {
      if (NS.Debug.running()) { NS.Debug.stop(); return; }
      startDebug();
    });
    refs.dbgRun.setAttribute('data-default', '1');
    right.appendChild(refs.dbgCopy);
    right.appendChild(refs.dbgRun);
    foot.appendChild(right);
    wrap.appendChild(foot);
  }

  function dbgVal(k) {
    for (var i = 0; i < DBG_OPTS.length; i++) if (DBG_OPTS[i][0] === k) return DBG_OPTS[i][1][dbgSel[k]];
    return null;
  }

  function renderDebug(keepKey) {
    clear(refs.dbgOpts);
    var busy = NS.Debug.running();
    DBG_OPTS.forEach(function (o) {
      var b = btn('opt dbg-opt', T('dbg.' + o[0]) + ': ' + o[1][dbgSel[o[0]]], 'dbg:' + o[0], function () {
        if (NS.Debug.running()) return;
        dbgSel[o[0]] = (dbgSel[o[0]] + 1) % o[1].length;
        renderDebug('dbg:' + o[0]);
      });
      if (busy) b.disabled = true;
      refs.dbgOpts.appendChild(b);
    });
    refs.dbgRun.textContent = busy ? T('dbg.stop') : T('dbg.run');
    refs.dbgRun.classList.toggle('danger', busy);
    refs.dbgBack.disabled = busy;
    refs.dbgText.value = dbgReport;
    if (!busy && !dbgReport) refs.dbgStatus.textContent = T('dbg.hint');
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
  }

  function startDebug() {
    dbgReport = '';
    var cfg = {
      matches: dbgVal('matches'), levels: [dbgVal('home'), dbgVal('away')], teams: dbgVal('teams'),
      teamSize: dbgVal('size'), stadium: dbgVal('stadium'), duration: dbgVal('length')
    };
    NS.Debug.start(cfg, function (done, total, mins) {
      refs.dbgStatus.textContent = T('dbg.running').replace('%d', done + 1).replace('%t', total) + '  ' + Math.floor(mins) + "'";
    }, function (text) {
      dbgReport = text;
      refs.dbgStatus.textContent = T('dbg.done');
      if (current === 'DEBUG') renderDebug('dbgcopy');
    });
    renderDebug('dbgrun');
  }

  function copyDebug() {
    var ta = refs.dbgText;
    if (!ta.value) return;
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () { refs.dbgStatus.textContent = T('dbg.copied'); }, function () {});
    }
    if (ok) refs.dbgStatus.textContent = T('dbg.copied');
  }

  function renderSettings(keepKey) {
    clear(refs.setList);
    NS.SETTING_DEFS.forEach(function (def) {
      if (def.group !== settingsGroup) return;
      var row = el('div', 'set-row');
      var lab = el('div', 'set-label');
      lab.appendChild(el('div', 'set-name', T(def.label)));
      lab.appendChild(el('div', 'set-hint', T(def.hint)));
      row.appendChild(lab);
      var opts = el('div', 'row');
      def.options.forEach(function (o) {
        var b = btn('opt', T(o[1]), 'set:' + def.key + ':' + o[0], function () {
          NS.Storage.setSetting(def.key, o[0]);
          NS.App.applySettings();
          syncSettings();
        });
        b.setAttribute('data-set', def.key);
        b.setAttribute('data-val', String(o[0]));
        opts.appendChild(b);
      });
      row.appendChild(opts);
      refs.setList.appendChild(row);
    });
    var tabs = refs.setTabs.querySelectorAll('[data-group]');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('sel', tabs[i].getAttribute('data-group') === settingsGroup);
    syncSettings();
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
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
    li.appendChild(document.createTextNode(B.bindingLabel(idx)));
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
        li.appendChild(document.createTextNode(B.maskLabel(B.sprintMask())));
        ul.appendChild(li);
      }
      for (var i = 0; i < B.MOVES.length; i++) if (B.MOVES[i].ctx === g[1]) helpRow(ul, i);
      card.appendChild(ul);
      refs.helpCols.appendChild(card);
    });
    var gen = el('div', 'panel-card');
    gen.appendChild(el('div', 'tag amber', T('help.general')));
    var gl = el('ul', 'help-list');
    ['help.g4', 'help.hold', 'help.a1', 'help.a7', 'help.d4', 'help.g1', 'help.g2', 'help.g3'].forEach(function (k) { gl.appendChild(el('li', null, T(k))); });
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
    // one map for every controller and phone controller
    var v = el('span', 'map-val pad' + (!sprint && !B.MOVES[idx].mask ? ' off' : ''),
      sprint ? B.maskLabel(B.sprintMask()) : B.bindingLabel(idx));
    b.appendChild(v);
    return b;
  }

  function renderButtons(focusKey) {
    var B = NS.Bindings;
    clear(refs.mapCols);
    refs.mapNote.classList.toggle('hidden', NS.Gamepad.live());
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
    NS.Mapper.start(function (mask) {
      var msg;
      if (!mask) {
        msg = T('map.timeout');
      } else if (sprint) {
        B.setSprint(mask);
        msg = T('mv.sprint') + ' = ' + B.maskLabel(mask);
      } else {
        var cleared = B.set(idx, mask);
        msg = T('mv.' + B.MOVES[idx].id) + ' = ' + B.bindingLabel(idx) +
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
      buildCompPick();
      buildCompHub();
      buildPause();
      buildSettings();
      buildHelp();
      buildButtons();
      buildDebug();
      NS.Match.syncRosters();
      updateSideSlots();
      lastFocusKey.TEAMS = 'h:' + World.session.homeTeamId;
    },
    show: show,
    hide: hide,
    isOpen: function () { return open; },
    screen: function () { return current; },
    // controllers connected / gone: the mapping screen shows the right names and the "connect a controller" note
    padsChanged: function () { if (open && current === 'BUTTONS' && !NS.Mapper.active()) renderButtons(focused && focused.getAttribute('data-k')); },
    openPause: function () {
      World.match.paused = true;
      NS.Audio.whistle(0);
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
        case 'menu':
          if (repeat) break;
          // + / Start: the screen's main button (next, kick off, play...); in the pause menu: resume
          var plus = plusButton();
          if (plus) plus.click();
          else if (matchRunning()) { if (current === 'PAUSE') resumeMatch(); else back(); }
          break;
      }
    }
  };
})(window.RS6 = window.RS6 || {});
