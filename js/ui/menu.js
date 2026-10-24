/* Menus: main, controller sides, teams, game plan, competitions (team pick + hub), pause, settings, controls help.
 * Fully usable with a TV remote: arrows move the focus (spatial navigation), OK clicks, Back/cancel goes back.
 * Input arrives from My PC only (UI.onInput); there are no keydown listeners. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var T = function (k) { return NS.I18n.t(k); };

  var root;
  var screens = {};
  var order = ['MAIN', 'SIDES', 'TEAMS', 'GAMEPLAN', 'COMPPICK', 'COMPHUB', 'PAUSE', 'SETTINGS', 'HELP', 'BUTTONS', 'DEBUG', 'RESULT', 'AIMALEARN'];
  var current = 'MAIN';
  var open = true;
  var focused = null;
  var lastFocusKey = {};
  var helpReturn = 'MAIN';
  var refs = {};
  var mapLast = -2; // move index (-1 = sprint) of the focused row on the mapping screen

  var MODES = [
    { comp: 'EXHIBITION', icon: '⚽', tone: 'sky' },
    { comp: 'DOMESTIC_LEAGUE', icon: '🛡️', tone: 'green' },
    { comp: 'CONTINENTAL_CUP', icon: '🏆', tone: 'amber' },
    { comp: 'WORLD_NATIONALS', icon: '🌍', tone: 'purple' }
  ];
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
    // the mouse takes P1's cursor only when it really moves (not a list redrawn or scrolled under a pointer at rest)
    b.addEventListener('mouseenter', function () { if (performance.now() - mouseAt < 150) setFocus(b, true); });
    return b;
  }
  var mouseAt = 0;
  document.addEventListener('mousemove', function () { mouseAt = performance.now(); }, true);

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
      if (list[i].getAttribute('data-k') === key && mayFocus(0, list[i])) { setFocus(list[i]); return true; }
    }
    return false;
  }

  function focusDefault() {
    var key = lastFocusKey[current];
    if (key && focusByKey(key)) return;
    var list = visibleFocusables();
    var pick = null, first = null;
    for (var i = 0; i < list.length; i++) {
      if (!mayFocus(0, list[i])) continue; // (P2's panel is his)
      if (!first) first = list[i];
      if (list[i].hasAttribute('data-default')) { pick = list[i]; break; }
    }
    setFocus(pick || first || null);
  }

  /* Two cursors: on the Teams and Game plan screens, when two people play, each has his own cursor (P1 light blue, P2
   * light red, as their arrows in a match) and works on his own side's panel at the same time as the other; the shared
   * buttons (Back, Next, Kick off) are for both. With one player his cursor goes everywhere. */
  var DUAL = { TEAMS: 1, GAMEPLAN: 1 };
  var focus2 = null;
  var actor = 0;               // the cursor that pressed the button being handled (0 = P1 / the mouse)
  function twoPlayers() {
    var p = NS.sidePads();
    return !!(DUAL[current] && p[0] >= 0 && p[1] >= 0 && NS.Devices.of(0) && NS.Devices.of(1));
  }
  // the cursor a device moves (P2's own device: the second one; every other device: the first)
  function cursorOf(dev) { return twoPlayers() && NS.Devices.player(dev || 'keys') === 1 ? 1 : 0; }
  // the panel (0 home, 1 away) cursor c looks after: its player's side; both on one side: P1 that one, P2 the other
  function panelOf(c) { var p = NS.sidePads(); return c === 1 && p[0] === p[1] ? 1 - p[1] : p[c]; }
  function mayFocus(c, node) {
    if (!twoPlayers()) return true;
    var pn = node.closest ? node.closest('[data-panel]') : null;
    return !pn || +pn.getAttribute('data-panel') === panelOf(c);
  }
  function getF(c) { return c === 1 ? focus2 : focused; }
  function setF(c, node) { if (c === 1) setFocus2(node); else setFocus(node); }
  function setFocus2(node) {
    if (focus2 && focus2 !== node) focus2.classList.remove('focus2');
    focus2 = node;
    if (!node) return;
    node.classList.add('focus2');
    if (node.scrollIntoView) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // cursor c onto the button with this key, else onto its panel's selected / first button
  function focusC(c, key) {
    var list = visibleFocusables(), i, first = null, sel = null;
    for (i = 0; i < list.length; i++) {
      if (!mayFocus(c, list[i])) continue;
      if (key && list[i].getAttribute('data-k') === key) { setF(c, list[i]); return; }
      var pn = list[i].closest('[data-panel]');
      if (pn && +pn.getAttribute('data-panel') === panelOf(c)) {
        if (!first) first = list[i];
        if (!sel && list[i].classList.contains('sel')) sel = list[i];
      }
    }
    if (c === 1) setFocus2(sel || first);
    else if (twoPlayers() && (sel || first)) setFocus(sel || first);
    else focusDefault();
  }
  // after a screen was drawn again: both cursors back on the buttons they were on (by key)
  function keyOf(node) { return node ? node.getAttribute('data-k') : ''; }
  function refocus(k0, k1) {
    if (focused) focused.classList.remove('focus');
    focused = null;
    focusC(0, k0);
    if (twoPlayers()) { if (focus2) focus2.classList.remove('focus2'); focus2 = null; focusC(1, k1); }
    else setFocus2(null);
  }

  // dir: 0 left, 1 right, 2 up, 3 down; c: the cursor (1 = P2's on the two-cursor screens)
  function move(dir, cur) {
    cur = cur || 0;
    var all = visibleFocusables(), list = [];
    for (var a = 0; a < all.length; a++) if (mayFocus(cur, all[a])) list.push(all[a]);
    if (!list.length) return;
    var focused = getF(cur); // (this cursor)
    if (!focused || list.indexOf(focused) < 0) { focusC(cur, ''); return; }
    var r = focused.getBoundingClientRect();
    if (dir === 2 || dir === 3) {
      // the focused button was scrolled out of view: go on from the edge of the view
      var vs = scroller(focused);
      if (vs) {
        var vr = vs.getBoundingClientRect();
        if (r.bottom < vr.top) r = { left: r.left, right: r.right, top: vr.top, bottom: vr.top };
        else if (r.top > vr.bottom) r = { left: r.left, right: r.right, top: vr.bottom, bottom: vr.bottom };
      }
    }
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
    // up / down: a list longer than the screen is read by scrolling first (text between the buttons has no button to land on)
    if ((dir === 2 || dir === 3) && scrollStep(focused, dir === 3 ? 1 : -1, best)) return;
    if (best) setF(cur, best);
  }

  // the nearest ancestor that scrolls vertically
  function scroller(node) {
    for (var n = node.parentNode; n && n !== document.body && n.nodeType === 1; n = n.parentNode) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return null;
  }
  // scrolls the focused item's list a page-step when there is more of it that way and the next button is not in view; true = scrolled
  function scrollStep(from, sign, next) {
    var sc = scroller(from);
    if (!sc) return false;
    var room = sign > 0 ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop;
    if (room < 2) return false;
    if (next && sc.contains(next)) {
      var cr = sc.getBoundingClientRect(), nr = next.getBoundingClientRect();
      if (nr.top >= cr.top && nr.bottom <= cr.bottom) return false; // the next button is in view: just go to it
    }
    sc.scrollTop += sign * Math.max(40, Math.round(sc.clientHeight * 0.6));
    return true;
  }

  /* ------------------------------ screens ------------------------------ */

  function matchRunning() { return World.match.running; }

  function show(key) {
    current = key;
    open = true;
    root.classList.remove('hidden');
    NS.Gamepad.touchPad(false); // (a menu: My PC's own pad serves it)
    if (matchRunning()) { World.match.paused = true; NS.Audio.crowd(false); }
    for (var i = 0; i < order.length; i++) screens[order[i]].classList.toggle('hidden', order[i] !== key);
    root.classList.toggle('menu-wide', key === 'SETTINGS' || key === 'AIMALEARN'); // these use the whole screen
    trainDot();
    refs.badge.textContent = T('step.' + key.toLowerCase());
    refreshNav();
    if (key === 'MAIN') renderMain();
    if (key === 'COMPPICK') renderCompPick();
    if (key === 'COMPHUB') { abandonArmed = false; renderCompHub(); }
    if (key === 'SIDES') updateSideSlots();
    if (key === 'TEAMS') {
      // both sides start on their leagues, each cursor on its side's league
      teamView[0] = teamView[1] = 'cats';
      lastFocusKey.TEAMS = 'c0:' + World.session.activeCategory;
      renderTeams();
    }
    if (key === 'GAMEPLAN') renderGamePlan();
    if (key === 'SETTINGS') renderSettings();
    if (key === 'HELP') renderHelp();
    if (key === 'BUTTONS') renderButtons();
    if (key === 'DEBUG') renderDebug();
    if (key === 'PAUSE') updatePauseSummary();
    if (key === 'AIMALEARN') renderLearn();
    if (key === 'RESULT') renderResult();
    NS.UI.refreshStats();
    NS.Input.clearEdges();
    if (matchRunning()) NS.Input.releaseAll(); // (keys held when the menu opened)
    if (focused) focused.classList.remove('focus');
    focused = null;
    setFocus2(null);
    root.classList.toggle('two-cur', twoPlayers()); // (P1's cursor blue, P2's red)
    if (twoPlayers()) { focusC(0, ''); focusC(1, ''); } else focusDefault();
    NS.App.syncMenuItems();
  }

  function hide() {
    open = false;
    root.classList.add('hidden');
    NS.Gamepad.touchPad(true); // (the match: the game's own touch pad, on a phone)
    NS.Input.clearEdges();
    NS.Input.block(350);
    focused = null;
    setFocus2(null);
  }

  function refreshNav() {
    var running = matchRunning();
    refs.btnKickoff.classList.toggle('hidden', running);
    refs.btnResume.classList.toggle('hidden', !running);
    refs.sidesNext.firstChild.textContent = running ? T('nav.apply_sides') : T('nav.next_teams');
  }

  function back() {
    if (current === 'BUTTONS') { show('SETTINGS'); return; }
    if (current === 'AIMALEARN') { show(learnFrom === 'RESULT' ? 'RESULT' : (matchRunning() ? 'PAUSE' : 'MAIN')); return; }
    if (current === 'DEBUG') { if (!NS.Debug.running()) show('SETTINGS'); return; }
    if (current === 'RESULT') { if (resView !== 'sum') { resView = 'sum'; renderResult(); } else resultExit(); return; }
    if (current === 'SETTINGS' && NS.Aima && NS.Aima.training()) return; // a checkoAI training is running
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
    cvcBrains(function () {
      NS.Match.start();
      NS.App.syncMenuItems();
    });
  }

  function updatePauseSummary() {
    var s = World.session;
    refs.pzAima.classList.toggle('hidden', !(NS.Aima && (World.aiSlots[0].active || World.aiSlots[1].active)));
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
      World.session.selStarter = [null, null];
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

  // Like FIFA / PES: one row per device (the keyboard / remote, each controller, a second keyboard player once used),
  // its icon where it was last time; that device's stick, D-pad or arrows push it left for the home team, right for the
  // away team, to the middle for none. The first two devices on a side are P1 and P2 (both may be on one side, together
  // against the CPU). A team with nobody on it is played by the CPU (or checkoAI on that level).
  var slotEls = {};

  function buildSides() {
    var wrap = screens.SIDES;
    var head = el('div', 'screen-head');
    head.appendChild(el('h2', null, T('sides.title')));
    head.appendChild(el('p', 'muted', T('sides.how')));
    wrap.appendChild(head);

    var grid = el('div', 'panel-card sides-grid');
    var hr = el('div', 'side-row side-head');
    var h0 = el('div', 'side-cell home');
    h0.appendChild(el('div', 'tag red', T('sides.home')));
    slotEls.cpu0 = el('div', 'slot cpu', T('slot.cpu'));
    h0.appendChild(slotEls.cpu0);
    var hm = el('div', 'side-cell mid');
    hm.appendChild(el('div', 'tag amber', T('sides.ctrl')));
    var h1 = el('div', 'side-cell away');
    h1.appendChild(el('div', 'tag blue', T('sides.away')));
    slotEls.cpu1 = el('div', 'slot cpu', T('slot.cpu'));
    h1.appendChild(slotEls.cpu1);
    hr.appendChild(h0); hr.appendChild(hm); hr.appendChild(h1);
    grid.appendChild(hr);
    slotEls.rows = el('div', 'side-rows');
    grid.appendChild(slotEls.rows);
    wrap.appendChild(grid);
    refs.sideMsg = el('div', 'muted small side-msg');
    wrap.appendChild(refs.sideMsg);
    refs.cvc = el('div', 'panel-card cvc hidden');
    wrap.appendChild(refs.cvc);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back'), 'back', back));
    refs.sidesNext = plusKey(btn('primary', T('nav.next_teams'), 'next', function () {
      if (matchRunning()) cvcBrains(function () { NS.Match.applySides(); show('PAUSE'); });
      else show('TEAMS');
    }));
    refs.sidesNext.setAttribute('data-default', '1');
    foot.appendChild(refs.sidesNext);
    wrap.appendChild(foot);
  }

  // a device's name and picture: the keyboard (or the TV remote), the second keyboard player, a controller, a phone
  function devName(dev) {
    var D = NS.Devices, k = D.kind(dev);
    if (k === 'keys') return ['\u2328', T('dev.keys')];
    if (k === 'keys2') return ['\u2328', T('dev.keys2')];
    var pads = NS.Gamepad.devs(), num = 0;
    for (var i = 0; i < pads.length && pads[i] !== dev; i++) if (D.kind(pads[i]) === k) num++;
    return [k === 'phone' ? '\uD83D\uDCF1' : '\uD83C\uDFAE', T(k === 'phone' ? 'dev.phone' : 'dev.pad') + ' ' + (num + 1)];
  }

  function updateSideSlots() {
    var s = World.session, D = NS.Devices;
    if (s.sideMode !== 'CUSTOM') {
      s.pads = NS.sidePads().slice();
      s.padDev = [null, null]; // (fix: P1 is the device on the menus now)
      s.sideMode = 'CUSTOM';
    }
    D.fix();
    clear(slotEls.rows);
    D.list().forEach(function (dev) {
      var n = D.player(dev), sd = n >= 0 ? s.pads[n] : -1;
      var row = el('div', 'side-row');
      var cells = [el('div', 'side-cell home'), el('div', 'side-cell mid'), el('div', 'side-cell away')];
      var nm = devName(dev);
      var ic = el('div', 'pad-ico ' + (n >= 0 ? 'p' + (n + 1) : 'idle'));
      ic.appendChild(el('b', null, n >= 0 ? 'P' + (n + 1) : nm[0]));
      ic.appendChild(el('span', 'dev-name', (n >= 0 ? nm[0] + ' ' : '') + nm[1]));
      ic.appendChild(el('span', 'dev-arrows', '\u25C0  \u25B6'));
      cells[sd === 0 ? 0 : (sd === 1 ? 2 : 1)].appendChild(ic);
      cells.forEach(function (c) { row.appendChild(c); });
      slotEls.rows.appendChild(row);
    });
    for (var t = 0; t < 2; t++) slotEls['cpu' + t].classList.toggle('hidden', s.pads[0] === t || s.pads[1] === t);
    renderCvc();
  }

  // CPU v CPU (nobody on either team): each side's level, and for a checkoAI side the brain that plays it. Up / down
  // walk these buttons (left / right move the controller icons on this screen)
  var CVC_LV = ['EASY', 'NORMAL', 'HARD', 'LEGEND', 'AIMA'];
  function cvcOn() { var s = World.session; return s.sideMode === 'CUSTOM' && s.pads[0] < 0 && s.pads[1] < 0; }
  function lvName(lv) { return T('opt.' + lv.toLowerCase()); }
  function cvcBrainName(t) {
    var s = World.session, id = s.cpuBrains[t], list = NS.Aima.brains();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    s.cpuBrains[t] = ''; // (deleted since)
    var a = NS.Aima.brain();
    return T('dbg.active') + (a ? ' (' + a.name + ')' : '');
  }
  function renderCvc() {
    var box = refs.cvc, s = World.session, on = cvcOn();
    if (!box) return;
    box.classList.toggle('hidden', !on);
    if (!on) return;
    var keep = focused && box.contains(focused) ? focused.getAttribute('data-k') : '';
    if (!s.cpuLevels) s.cpuLevels = [World.settings.difficulty, World.settings.difficulty];
    clear(box);
    box.appendChild(el('div', 'tag amber', T('cvc.title')));
    [0, 1].forEach(function (t) {
      box.appendChild(btn('opt cvc-opt', T(t ? 'sides.away' : 'sides.home') + ':  ' + lvName(s.cpuLevels[t]), 'cvc:lv' + t, function () {
        s.cpuLevels[t] = CVC_LV[(CVC_LV.indexOf(s.cpuLevels[t]) + 1) % CVC_LV.length];
        renderCvc();
      }));
      if (s.cpuLevels[t] === 'AIMA' && NS.Aima) {
        box.appendChild(btn('opt cvc-opt sub', T('dbg.brain') + ':  ' + cvcBrainName(t), 'cvc:br' + t, function () {
          var ids = [''].concat(NS.Aima.brains().map(function (e) { return e.id; }));
          s.cpuBrains[t] = ids[(ids.indexOf(s.cpuBrains[t]) + 1) % ids.length];
          renderCvc();
        }));
      }
    });
    if (keep) { focused = null; if (!focusByKey(keep)) focusDefault(); }
  }
  // the brains a CPU v CPU match's checkoAI sides picked (loaded first, from the cloud when not in memory), else none
  function cvcBrains(then) {
    var s = World.session;
    if (!NS.Aima) { then(); return; }
    var want = [0, 1].map(function (t) { return cvcOn() && s.cpuLevels && s.cpuLevels[t] === 'AIMA' ? s.cpuBrains[t] : ''; });
    if (!want[0] && !want[1]) { NS.Aima.setDebugBrains(null); then(); return; }
    Promise.all(want.map(function (id) { return id ? NS.Aima.getBrain(id).catch(function () { return null; }) : null; })).then(function (bs) {
      NS.Aima.setDebugBrains(bs); // (a brain that failed to load: the active one plays that side)
      then();
    });
  }

  // a device's stick / D-pad / arrows pushed left (-1) or right (+1) on this screen: its icon moves one column. A device
  // that leaves the middle becomes the first free player (two at most); back in the middle it plays no more.
  function sideMove(dev, d) {
    if (!open || current !== 'SIDES') return;
    var s = World.session;
    if (s.sideMode !== 'CUSTOM') updateSideSlots();
    var n = NS.Devices.player(dev);
    var pos = n < 0 ? 0 : (s.pads[n] === 0 ? -1 : (s.pads[n] === 1 ? 1 : 0));
    pos = Math.max(-1, Math.min(1, pos + d));
    var side = pos < 0 ? 0 : (pos > 0 ? 1 : -1);
    refs.sideMsg.textContent = '';
    if (n < 0) {
      if (side < 0) return;
      n = !s.padDev[0] ? 0 : (!s.padDev[1] ? 1 : -1);
      if (n < 0) { refs.sideMsg.textContent = T('sides.full'); return; } // (two players already)
      s.padDev[n] = dev;
    }
    s.pads[n] = side;
    if (side < 0) s.padDev[n] = null;
    updateSideSlots();
  }

  /* ------------------------------ TEAMS ------------------------------ */

  // Each side: first its league / continent (a list), then that one's teams (Back: the leagues again). Two players pick
  // at the same time, each on his own side with his own cursor.
  var teamView = ['cats', 'cats'];
  var TP = [{}, {}];             // each side's panel: { sw, title, stars, crumb, list, owner }

  function buildTeams() {
    var wrap = screens.TEAMS;
    var cols = el('div', 'two-cols');
    [0, 1].forEach(function (t) {
      var P = TP[t];
      var card = el('div', 'panel-card ' + (t ? 'away' : 'home'));
      card.setAttribute('data-panel', String(t));
      var hh = el('div', 'col-head');
      P.sw = el('span', 'swatch');
      P.title = el('div', 'col-title');
      hh.appendChild(P.sw);
      var box = el('div');
      var tags = el('div', 'row');
      tags.appendChild(el('div', 'tag ' + (t ? 'blue' : 'red'), T(t ? 'teams.away' : 'teams.home')));
      P.owner = el('span', 'owner-chip');
      tags.appendChild(P.owner);
      box.appendChild(tags);
      box.appendChild(P.title);
      hh.appendChild(box);
      P.stars = el('span', 'stars');
      hh.appendChild(P.stars);
      card.appendChild(hh);
      P.crumb = el('div', 'team-crumb muted small');
      card.appendChild(P.crumb);
      P.list = el('div', 'team-list');
      card.appendChild(P.list);
      cols.appendChild(card);
    });
    wrap.appendChild(cols);

    var foot = el('div', 'foot');
    foot.appendChild(btn('', T('nav.back_sides'), 'back', back));
    foot.appendChild(plusKey(btn('primary', T('nav.next_plan'), 'next', function () {
      NS.Match.syncRosters();
      World.session.editingSquadIdx = 0;
      World.session.selStarter = [null, null];
      show('GAMEPLAN');
    })));
    wrap.appendChild(foot);
  }

  // a screen drawn again after cursor `actor` pressed key k: that cursor stays there, the other one where it was
  function redrawKeys(k) {
    var k0 = keyOf(focused), k1 = keyOf(focus2);
    if (actor === 1) k1 = k; else k0 = k;
    return [k0, k1];
  }

  function teamButton(t, isHome) {
    var s = World.session;
    var sel = (isHome ? s.homeTeamId : s.awayTeamId) === t.id;
    var b = btn('team' + (sel ? ' sel ' + (isHome ? 'home' : 'away') : ''), '', (isHome ? 'h:' : 'a:') + t.id, function () {
      if (isHome) s.homeTeamId = t.id; else s.awayTeamId = t.id;
      NS.Match.syncRosters();
      renderTeams(redrawKeys((isHome ? 'h:' : 'a:') + t.id));
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

  // keys: [P1's cursor, P2's] after the redraw (none: as they are)
  function renderTeams(keys) {
    var s = World.session;
    var cats = NS.Teams.CATEGORIES;
    keys = keys || [keyOf(focused), keyOf(focus2)];
    var two = twoPlayers();
    [0, 1].forEach(function (t) {
      var P = TP[t], catKey = t ? 'awayCategory' : 'activeCategory';
      var cat = null;
      for (var i = 0; i < cats.length; i++) if (cats[i].id === s[catKey]) cat = cats[i];
      clear(P.list);
      if (teamView[t] === 'cats' || !cat) {
        // its leagues / continents: the one its team is from marked
        P.crumb.textContent = T('teams.pickcat');
        cats.forEach(function (c) {
          var b = btn('team cat' + (s[catKey] === c.id ? ' sel ' + (t ? 'away' : 'home') : ''), '', 'c' + t + ':' + c.id, function () {
            s[catKey] = c.id;
            teamView[t] = 'teams';
            var cur = t ? s.awayTeamId : s.homeTeamId, list = NS.Teams.byCategory(c.id), k = list.length ? list[0].id : '';
            for (var j = 0; j < list.length; j++) if (list[j].id === cur) k = cur;
            renderTeams(redrawKeys((t ? 'a:' : 'h:') + k));
          });
          var box = el('div', 'team-box');
          box.appendChild(el('div', 'team-name', c.label));
          box.appendChild(el('div', 'team-sub', NS.Teams.byCategory(c.id).length + ' ' + T('teams.count')));
          b.appendChild(box);
          P.list.appendChild(b);
        });
      } else {
        // its teams, and the way back to the leagues first
        P.crumb.textContent = cat.label;
        var bk = btn('team back', '', 'tb' + t, function () { teamView[t] = 'cats'; renderTeams(redrawKeys('c' + t + ':' + cat.id)); });
        bk.appendChild(el('div', 'team-name', '◀  ' + T('teams.leagues')));
        P.list.appendChild(bk);
        NS.Teams.byCategory(cat.id).forEach(function (tm) { P.list.appendChild(teamButton(tm, t === 0)); });
      }
      var tm = NS.Teams.byId(t ? s.awayTeamId : s.homeTeamId);
      P.title.textContent = tm.name + ' (' + tm.code + ')';
      P.stars.textContent = new Array(tm.stars + 1).join('★');
      P.sw.style.background = 'linear-gradient(135deg,' + NS.Assets.hexToCss(tm.c1) + ' 50%,' + NS.Assets.hexToCss(tm.c2) + ' 50%)';
      // who picks here: P1 / P2 (two players), else nobody's name
      var own = two ? (panelOf(0) === t ? 0 : 1) : -1;
      P.owner.textContent = own >= 0 ? 'P' + (own + 1) : '';
      P.owner.className = 'owner-chip' + (own >= 0 ? ' p' + (own + 1) : ' hidden');
    });
    refocus(keys[0], keys[1]);
  }

  // Back on a two-cursor screen: the panel cursor c is in steps back first (its team list -> its leagues; the game plan:
  // a starter picked for a swap is let go). True = done there.
  function panelBack(c) {
    var f = getF(c), pn = f && f.closest ? f.closest('[data-panel]') : null;
    var t = pn ? +pn.getAttribute('data-panel') : (twoPlayers() ? panelOf(c) : -1);
    if (t < 0) return false;
    var s = World.session;
    actor = c;
    try {
      if (current === 'TEAMS' && teamView[t] === 'teams') {
        teamView[t] = 'cats';
        renderTeams(redrawKeys('c' + t + ':' + (t ? s.awayCategory : s.activeCategory)));
        return true;
      }
      if (current === 'GAMEPLAN' && s.selStarter[t] !== null) {
        var k = 's' + t + ':' + s.selStarter[t];
        s.selStarter[t] = null;
        renderGamePlan(redrawKeys(k));
        return true;
      }
    } finally { actor = 0; }
    return c === 1; // (P2's Back never leaves the screen)
  }

  /* ------------------------------ GAME PLAN ------------------------------ */

  // Split in two: each side's panel (formation, tactics, starters and bench) next to the other's, so two players set
  // their teams up at the same time, each with his own cursor (one player: his cursor goes to both).
  var GP = [{}, {}];             // each side's panel: { title, owner, forms, tac[], hint, starters, subs, stats }

  function buildGamePlan() {
    var wrap = screens.GAMEPLAN;
    var cols = el('div', 'gp-split');
    [0, 1].forEach(function (t) {
      var P = GP[t];
      var card = el('div', 'panel-card gp-panel ' + (t ? 'away' : 'home'));
      card.setAttribute('data-panel', String(t));
      var head = el('div', 'row gp-head');
      P.title = el('div', 'tag ' + (t ? 'blue' : 'red'));
      head.appendChild(P.title);
      P.owner = el('span', 'owner-chip');
      head.appendChild(P.owner);
      card.appendChild(head);
      // the formation
      var forms = el('div', 'row gp-forms');
      NS.FORMATION_KEYS.forEach(function (f) {
        var b = btn('form', f, 'f' + t + ':' + f, function () {
          World.session.formations[t] = f;
          World.session.selStarter[t] = null;
          if (matchRunning()) NS.Match.refreshFromSession();
          else NS.Match.refitRoster(t); // the right players for the new positions
          renderGamePlan(redrawKeys('f' + t + ':' + f));
        });
        b.setAttribute('data-form', f);
        forms.appendChild(b);
      });
      card.appendChild(forms);
      // tactics: what each block (defence, midfield, attack) is told to do; confirm cycles defensive / balanced /
      // attacking; the 4th: counter-attacks (rarely / when it is on / always)
      var tac = el('div', 'row gp-tac');
      P.tac = [];
      [0, 1, 2, 3].forEach(function (b) {
        var bt = btn('tac', '', 'tac' + t + ':' + b, function () {
          var row = World.session.tactics[t];
          row[b] = ((row[b] === undefined ? 1 : row[b]) + 1) % 3;
          renderGamePlan(redrawKeys('tac' + t + ':' + b));
        });
        P.tac.push(bt);
        tac.appendChild(bt);
      });
      card.appendChild(tac);
      P.hint = el('div', 'muted small tac-hint');
      card.appendChild(P.hint);
      // the players: a starter picked, then a bench player = they swap
      var lists = el('div', 'gp-lists');
      var c1 = el('div', 'list-col');
      c1.appendChild(el('div', 'tag amber', T('gp.starters')));
      P.starters = el('div', 'stack');
      c1.appendChild(P.starters);
      var c2 = el('div', 'list-col');
      c2.appendChild(el('div', 'tag blue', T('gp.bench')));
      P.subs = el('div', 'stack');
      c2.appendChild(P.subs);
      lists.appendChild(c1);
      lists.appendChild(c2);
      card.appendChild(lists);
      P.stats = el('div', 'gp-statline muted small');
      card.appendChild(P.stats);
      cols.appendChild(card);
    });
    wrap.appendChild(cols);
    wrap.appendChild(el('p', 'muted small gp-hint', T('gp.hint')));

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

  // the six ratings of a player in one line (the one picked for a swap, else the first)
  var STAT_KEYS = [['spd', 'st.spd'], ['drb', 'st.drb'], ['sht', 'st.sht'], ['sta', 'st.sta'], ['hdr', 'st.hdr'], ['def', 'st.def']];
  function statLine(teamObj, name) {
    if (!name) return '';
    var st = NS.Players.statsFor(teamObj, name), out = name + '  ' + st.pos + ' ' + st.ovr + '   ';
    for (var i = 0; i < STAT_KEYS.length; i++) out += T(STAT_KEYS[i][1]).toUpperCase() + ' ' + st[STAT_KEYS[i][0]] + '  ';
    return out;
  }

  // keys: [P1's cursor, P2's] after the redraw (none: as they are)
  function renderGamePlan(keys) {
    var s = World.session;
    keys = keys || [keyOf(focused), keyOf(focus2)];
    var two = twoPlayers();
    if (!s.selStarter) s.selStarter = [null, null];
    [0, 1].forEach(function (t) {
      var P = GP[t];
      var teamObj = NS.Teams.byId(t === 0 ? s.homeTeamId : s.awayTeamId);
      var formKey = s.formations[t];
      var layout = NS.FORMATIONS[formKey];
      var roster = s.rosters[t];
      var picked = s.selStarter[t];
      P.title.textContent = teamObj.name + '  ·  ' + formKey;
      var own = two ? (panelOf(0) === t ? 0 : 1) : -1;
      P.owner.textContent = own >= 0 ? 'P' + (own + 1) : '';
      P.owner.className = 'owner-chip' + (own >= 0 ? ' p' + (own + 1) : ' hidden');
      var fb = GP[t].title.parentNode.parentNode.querySelectorAll('[data-form]');
      for (var i = 0; i < fb.length; i++) fb[i].classList.toggle('sel', fb[i].getAttribute('data-form') === formKey);
      var trow = s.tactics[t], hint = [];
      if (trow[3] === undefined) trow[3] = 1;
      for (var tb = 0; tb < 4; tb++) {
        P.tac[tb].textContent = T('tac.b' + tb) + ': ' + T((tb === 3 ? 'tac.c' : 'tac.m') + trow[tb]);
        for (var mk = 0; mk < 3; mk++) P.tac[tb].classList.toggle('m' + mk, trow[tb] === mk);
        hint.push(T('tac.h' + tb + trow[tb]));
      }
      P.hint.textContent = hint.join('  ·  ');
      clear(P.starters);
      clear(P.subs);
      P.starters.parentNode.parentNode.classList.toggle('nobench', roster.length <= layout.length); // (no bench: two columns of starters)
      layout.forEach(function (slot, n) {
        var b = btn('player' + (picked === n ? ' sel' : ''), '', 's' + t + ':' + n, function () {
          s.selStarter[t] = s.selStarter[t] === n ? null : n;
          renderGamePlan(redrawKeys('s' + t + ':' + n));
        });
        b.appendChild(el('span', 'role', slot.role));
        b.appendChild(el('span', 'pname', roster[n] || ('PLAYER ' + (n + 1))));
        b.appendChild(el('span', 'ovr', String(NS.Players.statsFor(teamObj, roster[n]).ovr)));
        b.appendChild(el('span', 'num', '#' + slot.num));
        P.starters.appendChild(b);
      });
      for (var j = layout.length; j < roster.length; j++) {
        (function (k) {
          var b = btn('player sub', '', 'b' + t + ':' + k, function () {
            var at = s.selStarter[t];
            if (at === null) return;
            var tmp = roster[at];
            roster[at] = roster[k];
            roster[k] = tmp;
            s.selStarter[t] = null;
            if (matchRunning()) NS.Match.refreshFromSession();
            renderGamePlan(redrawKeys('s' + t + ':' + at));
          });
          b.appendChild(el('span', 'role sub', T('gp.sub')));
          b.appendChild(el('span', 'pname', roster[k]));
          b.appendChild(el('span', 'ovr', String(NS.Players.statsFor(teamObj, roster[k]).ovr)));
          b.appendChild(el('span', 'num good', picked !== null ? T('gp.swap') : T('gp.ready')));
          P.subs.appendChild(b);
        })(j);
      }
      P.stats.textContent = statLine(teamObj, roster[picked !== null ? picked : 0]);
    });
    refocus(keys[0], keys[1]);
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
      ['plan', 'sky', '📋', function () { World.session.selStarter = [null, null]; show('GAMEPLAN'); }],
      ['settings', 'amber', '⚙️', function () { show('SETTINGS'); }],
      ['sides', 'purple', '🎮', function () { show('SIDES'); }],
      ['controls', 'teal', '❓', function () { helpReturn = 'PAUSE'; show('HELP'); }],
      ['replay', 'green', '🎬', function () {
        hide();
        if (!NS.Replay.playLast(function () { show('PAUSE'); })) show('PAUSE');
      }],
      ['aima', 'purple', '🧠', function () { learnFrom = 'PAUSE'; show('AIMALEARN'); }],
      ['restart', 'orange', '🔄', function () { startMatch(); }],
      ['quit', 'rose', '🏠', function () { NS.Match.exitToMenu(); }]
    ];
    items.forEach(function (it, i) {
      var b = btn('row-card tone-' + it[1], '', 'pz:' + it[0], it[3]);
      if (i === 0) b.setAttribute('data-default', '1');
      if (it[0] === 'aima') refs.pzAima = b; // (only while a checkoAI team plays)
      b.appendChild(el('div', 'card-icon sm', it[2]));
      var box = el('div');
      box.appendChild(el('div', 'row-title', T('pause.' + it[0])));
      box.appendChild(el('div', 'row-desc', T('pause.' + it[0] + '.d')));
      b.appendChild(box);
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
  }

  /* ------------------------------ checkoAI: what he is learning in this match (from the pause menu) ------------------------------ */

  var learnFrom = 'PAUSE';   // the screen Back returns to (the pause menu, or the full-time page)
  function buildLearn() {
    var wrap = screens.AIMALEARN;
    refs.learnBody = el('div', 'learn-body');
    wrap.appendChild(refs.learnBody);
    wrap.appendChild(el('p', 'muted learn-hint', T('learn.hint')));
    var foot = el('div', 'foot');
    var b = btn('primary', T('nav.back'), 'back', back);
    b.setAttribute('data-default', '1');
    foot.appendChild(b);
    wrap.appendChild(foot);
  }

  function signed(v) { return (v >= 0 ? '+' : '') + v.toFixed(2); }
  function renderLearn() {
    var body = refs.learnBody, list = NS.Aima ? NS.Aima.learnView() : [];
    clear(body);
    if (!list.length) { body.appendChild(el('p', 'muted', T('learn.none'))); return; }
    var s = World.session;
    list.forEach(function (v) {
      var d = v.d, team = NS.Teams.byId(v.team ? s.awayTeamId : s.homeTeamId);
      var head = el('div', 'learn-head');
      head.appendChild(el('span', 'tag ' + (v.team ? 'blue' : 'red'), team.name));
      head.appendChild(el('b', null, 'checkoAI  ' + v.b.name));
      head.appendChild(el('span', 'learn-total' + (v.reward < 0 ? ' neg' : ''), T('learn.reward') + '  ' + signed(v.reward)));
      body.appendChild(head);
      var cols = el('div', 'aima-cols');

      // this match's counters: how much he decided himself, what he practised, how it went
      var c1 = aimaCard(T('learn.c.match'));
      var g = el('div', 'aima-grid');
      kv(g, T('learn.k.own'), (d.decisions ? pct(d.modelDec / d.decisions) : '-') + '   (' + T('learn.k.help') + ' ' + pct(v.help) + ')');
      kv(g, T('learn.k.lessons'), d.rl + ' ' + T('learn.k.fromrew') + ' + ' + d.im + ' ' + T('learn.k.fromcopy'));
      kv(g, T('aima.k.passes'), d.passes + '  (' + (d.passes ? pct(Math.min(1, d.passOk / d.passes)) : '-') + ', ' + T('aima.k.fwd') + ' ' + d.fwdPass + ')');
      kv(g, T('aima.k.shots'), d.shots + '  (' + T('aima.k.ontarget') + ' ' + d.onTarget + ', ' + T('aima.k.goals').toLowerCase() + ' ' + d.goals + ')');
      kv(g, T('aima.k.wonlost'), d.won + ' / ' + d.lost);
      kv(g, T('aima.k.tackles'), d.tackles + '   ' + T('aima.k.fouls') + ' ' + d.fouls);
      kv(g, T('aima.k.claps'), d.claps + '   ' + T('aima.k.punish') + ' ' + d.punish);
      c1.appendChild(g);
      cols.appendChild(c1);

      // where the rewards came from: green pushes him to do more of it, red less
      var c2 = aimaCard(T('learn.c.why'));
      var mx = 0.01;
      v.why.forEach(function (w) { mx = Math.max(mx, Math.abs(w.r)); });
      if (!v.why.length) c2.appendChild(el('div', 'aima-k', T('learn.empty')));
      v.why.forEach(function (w) {
        var row = el('div', 'aima-bar learn-bar');
        row.appendChild(el('span', 'aima-k', T('learn.w.' + w.k) + (w.k === 'carry' ? '' : ' ×' + w.n)));
        var tr = el('i');
        var fill = el('b', w.r < 0 ? 'neg' : null);
        fill.style.width = Math.round(Math.abs(w.r) / mx * 100) + '%';
        tr.appendChild(fill);
        row.appendChild(tr);
        row.appendChild(el('span', 'learn-val' + (w.r < 0 ? ' neg' : ''), signed(w.r)));
        c2.appendChild(row);
      });
      cols.appendChild(c2);

      // the latest rewards, newest first
      var c3 = aimaCard(T('learn.c.feed'));
      if (!v.feed.length) c3.appendChild(el('div', 'aima-k', T('learn.empty')));
      v.feed.forEach(function (f) {
        var line = el('div', 'learn-line');
        line.appendChild(el('span', 'aima-k', Math.floor(f.t / 60) + "'"));
        line.appendChild(el('span', null, T('learn.w.' + f.k)));
        line.appendChild(el('b', 'learn-val' + (f.r < 0 ? ' neg' : ''), signed(f.r)));
        c3.appendChild(line);
      });
      cols.appendChild(c3);
      body.appendChild(cols);
    });
  }

  /* ------------------------------ FULL TIME: the result and the statistics ------------------------------ */

  var resView = 'sum';      // 'sum' the main numbers, 'full' every statistic, 'goals' the goals to watch again
  var resFocus = '';
  var resMatch = -1;

  function buildResult() {
    var wrap = screens.RESULT;
    var head = el('div', 'res-head');
    refs.resChip = el('span', 'chip res-chip', '');
    head.appendChild(refs.resChip);
    wrap.appendChild(head);
    var main = el('div', 'res-main');  // (a TV: the score on the left, the statistics on the right)
    refs.resHero = el('div', 'res-hero');
    main.appendChild(refs.resHero);
    refs.resBody = el('div', 'res-body');
    main.appendChild(refs.resBody);
    wrap.appendChild(main);
    var foot = el('div', 'foot res-foot');
    var left = el('div', 'row');
    refs.resStats = btn('', '', 'rs:stats', function () { resView = resView === 'full' ? 'sum' : 'full'; renderResult('rs:stats'); });
    refs.resGoals = btn('', '', 'rs:goals', function () {
      resView = resView === 'goals' ? 'sum' : 'goals';
      renderResult(resView === 'goals' && NS.Stats.goals().length ? 'rg:0' : 'rs:goals'); // (the remote lands on the first goal)
    });
    // checkoAI played: what he learnt in this match (the same page as the pause menu's)
    refs.resAima = btn('', T('pause.aima'), 'rs:aima', function () { learnFrom = 'RESULT'; resFocus = 'rs:aima'; show('AIMALEARN'); });
    left.appendChild(refs.resStats);
    left.appendChild(refs.resAima);
    left.appendChild(refs.resGoals);
    foot.appendChild(left);
    var right = el('div', 'row');
    refs.resTeams = btn('', T('res.teams'), 'rs:teams', function () { show('TEAMS'); });
    refs.resAgain = plusKey(btn('primary', T('res.again'), 'rs:again', function () { startMatch(); }));
    refs.resAgain.setAttribute('data-default', '1');
    refs.resExit = btn('', '', 'rs:exit', resultExit);
    right.appendChild(refs.resTeams);
    right.appendChild(refs.resAgain);
    right.appendChild(refs.resExit);
    foot.appendChild(right);
    wrap.appendChild(foot);
  }

  function resultExit() {
    resView = 'sum';
    show(NS.Comp.active() ? 'COMPHUB' : 'MAIN');
  }

  function kitCss(t) {
    var k = World.kitColors;
    var s = World.session, tm = NS.Teams.byId(t === 0 ? s.homeTeamId : s.awayTeamId);
    return NS.Assets.hexToCss(k ? k[t] : tm.c1);
  }

  // one line of statistics, TV style: home value | name | away value, the two shares as a bar under it
  function statRow(label, a, b, txtA, txtB, lowerBetter) {
    var row = el('div', 'res-row');
    var top = el('div', 'res-line');
    var lead = a === b ? -1 : ((a > b) !== !!lowerBetter ? 0 : 1);
    var va = el('span', 'res-v' + (lead === 0 ? ' lead' : ''));
    var vb = el('span', 'res-v r' + (lead === 1 ? ' lead' : ''));
    if (typeof txtA === 'string') va.textContent = txtA; else va.appendChild(txtA);
    if (typeof txtB === 'string') vb.textContent = txtB; else vb.appendChild(txtB);
    top.appendChild(va);
    top.appendChild(el('span', 'res-k', label));
    top.appendChild(vb);
    row.appendChild(top);
    var bar = el('div', 'res-bar');
    var tot = a + b;
    var fa = el('i', 'l'), fb = el('i', 'r');
    fa.style.width = (tot > 0 ? a / tot * 100 : 50) + '%';
    fb.style.width = (tot > 0 ? b / tot * 100 : 50) + '%';
    fa.style.background = kitCss(0);
    fb.style.background = kitCss(1);
    bar.appendChild(fa);
    bar.appendChild(fb);
    row.appendChild(bar);
    return row;
  }

  function cardsEl(y, r) {
    var s = el('span', 'res-cards');
    s.appendChild(el('i', 'mc y'));
    s.appendChild(document.createTextNode(String(y)));
    s.appendChild(el('i', 'mc r'));
    s.appendChild(document.createTextNode(String(r)));
    return s;
  }

  function goalText(g) {
    return g.mins + "'  " + g.who + (g.pen ? ' ' + T('res.pen') : '') + (g.own ? ' ' + T('res.og') : '');
  }

  function renderResult(keepKey) {
    var S = NS.Stats, s = World.session, m = World.match;
    var comp = NS.Comp.active();
    if (resMatch !== S.id()) { resMatch = S.id(); resView = 'sum'; delete lastFocusKey.RESULT; keepKey = null; resFocus = ''; } // a new match
    var home = NS.Teams.byId(s.homeTeamId), away = NS.Teams.byId(s.awayTeamId);
    var goals = S.goals();
    refs.resChip.textContent = T('res.ft') + '  •  ' + T('comp.' + s.compType);

    // the score, the teams in their kit colours, the scorers under each
    var hero = refs.resHero;
    clear(hero);
    [0, 1].forEach(function (t) {
      var tm = t === 0 ? home : away;
      var side = el('div', 'res-team ' + (t === 0 ? 'home' : 'away'));
      var badge = el('div', 'res-badge', tm.code);
      badge.style.background = kitCss(t);
      side.appendChild(badge);
      side.appendChild(el('div', 'res-name', tm.name));
      var ul = el('div', 'res-scorers');
      goals.forEach(function (g) { if (g.team === t) ul.appendChild(el('div', 'res-scorer', '⚽ ' + goalText(g))); });
      side.appendChild(ul);
      hero.appendChild(side);
      if (t === 0) {
        var mid = el('div', 'res-mid');
        var won = m.score[0] === m.score[1] ? -1 : (m.score[0] > m.score[1] ? 0 : 1);
        var sc = el('div', 'res-score');
        var a = el('span', won === 0 ? 'w' : '', String(m.score[0]));
        var b = el('span', won === 1 ? 'w' : '', String(m.score[1]));
        sc.appendChild(a);
        sc.appendChild(el('span', 'dash', '–'));
        sc.appendChild(b);
        mid.appendChild(sc);
        mid.appendChild(el('div', 'res-xg', 'xG ' + S.get('xg', 0).toFixed(2) + ' – ' + S.get('xg', 1).toFixed(2)));
        hero.appendChild(mid);
      }
    });

    var body = refs.resBody;
    clear(body);
    body.className = 'res-body view-' + resView;
    if (resView === 'goals') {
      if (!goals.length) body.appendChild(el('div', 'muted res-empty', T('res.nogoals')));
      goals.forEach(function (g, i) {
        var tm = g.team === 0 ? home : away;
        var b = btn('res-goal', '', 'rg:' + i, function () {
          resFocus = 'rg:' + i;
          hide();
          var played = NS.Replay.play(g.clip, { auto: true, title: T('rp.goal'), sub: tm.code + '  ' + goalText(g),
            onEnd: function () { show('RESULT'); } });
          if (!played) show('RESULT');
        });
        var dot = el('span', 'res-gdot');
        dot.style.background = kitCss(g.team);
        b.appendChild(dot);
        b.appendChild(el('span', 'res-gteam', tm.code));
        b.appendChild(el('span', 'res-gtxt', goalText(g)));
        b.appendChild(el('span', 'res-gplay', g.clip ? '▶' : T('res.noclip')));
        if (!g.clip) b.disabled = true;
        body.appendChild(b);
      });
    } else {
      var p0 = S.possPct(0);
      body.appendChild(statRow(T('res.poss'), p0, 100 - p0, p0 + '%', (100 - p0) + '%'));
      body.appendChild(statRow(T('res.xg'), S.get('xg', 0), S.get('xg', 1), S.get('xg', 0).toFixed(2), S.get('xg', 1).toFixed(2)));
      body.appendChild(statRow(T('res.shots'), S.get('shots', 0), S.get('shots', 1), String(S.get('shots', 0)), String(S.get('shots', 1))));
      body.appendChild(statRow(T('res.ont'), S.get('onT', 0), S.get('onT', 1), String(S.get('onT', 0)), String(S.get('onT', 1))));
      if (resView === 'full') {
        var acc = function (t) { var n = S.get('passes', t); return n ? Math.round(S.get('passOk', t) * 100 / n) : 0; };
        body.appendChild(statRow(T('res.passes'), S.get('passes', 0), S.get('passes', 1), String(S.get('passes', 0)), String(S.get('passes', 1))));
        body.appendChild(statRow(T('res.passacc'), acc(0), acc(1), acc(0) + '%', acc(1) + '%'));
        [['res.corners', 'corners'], ['res.saves', 'saves']].forEach(function (r) {
          body.appendChild(statRow(T(r[0]), S.get(r[1], 0), S.get(r[1], 1), String(S.get(r[1], 0)), String(S.get(r[1], 1))));
        });
        [['res.fouls', 'fouls'], ['res.offsides', 'offsides'], ['res.yellow', 'yellow'], ['res.red', 'red']].forEach(function (r) {
          body.appendChild(statRow(T(r[0]), S.get(r[1], 0), S.get(r[1], 1), String(S.get(r[1], 0)), String(S.get(r[1], 1)), true));
        });
      } else {
        var c0 = S.get('yellow', 0) + S.get('red', 0) * 2, c1 = S.get('yellow', 1) + S.get('red', 1) * 2;
        body.appendChild(statRow(T('res.cards'), c0, c1, cardsEl(S.get('yellow', 0), S.get('red', 0)), cardsEl(S.get('yellow', 1), S.get('red', 1)), true));
      }
    }

    refs.resStats.textContent = resView === 'full' ? T('res.summary') : T('res.full');
    var kept = 0;
    goals.forEach(function (g) { if (g.clip) kept++; });
    refs.resGoals.textContent = resView === 'goals' ? T('res.summary') : T('res.goals') + (goals.length ? ' (' + goals.length + ')' : '');
    refs.resGoals.disabled = !kept && resView !== 'goals';
    refs.resAima.classList.toggle('hidden', !(NS.Aima && NS.Aima.learnView().length));
    refs.resTeams.classList.toggle('hidden', comp);
    refs.resAgain.classList.toggle('hidden', comp);
    refs.resExit.textContent = comp ? T('res.cont') : T('res.exit');
    if (comp) refs.resExit.setAttribute('data-default', '1'); else refs.resExit.removeAttribute('data-default');
    var want = keepKey || resFocus;
    resFocus = '';
    if (focused) focused.classList.remove('focus');
    focused = null;
    if (!(want && focusByKey(want))) focusDefault();
  }

  /* ------------------------------ SETTINGS ------------------------------ */

  var settingsGroup = 'game';

  // Settings: one tab per group (Gameplay, Graphics, Audio), only that group's rows below it.
  function buildSettings() {
    var wrap = screens.SETTINGS;
    refs.setTabs = el('div', 'tabs set-tabs');
    NS.SETTING_GROUPS.forEach(function (g, i) {
      var b = btn('tab' + (g[0] === 'aima' ? ' aima-tab' : ''), T(g[1]), 'sg:' + g[0], function () {
        if (NS.Aima && NS.Aima.training()) return; // a checkoAI training is running
        settingsGroup = g[0];
        renderSettings('sg:' + g[0]);
      });
      b.setAttribute('data-group', g[0]);
      if (g[0] === 'aima') { // checkoAI: the white rooster before its name
        var ic = el('span', 'aima-tabico');
        ic.innerHTML = NS.HUD.ROOSTER;
        b.insertBefore(ic, b.firstChild);
      }
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
    // (no "save and return" button: every setting is saved when it is changed; Back / B closes the page, see back())
    wrap.appendChild(foot);
  }

  // the green dot at the top right of the menu while a checkoAI training, recording or learning from data is running
  var dotOn = false;
  function trainDot() {
    var on = !!(NS.Aima && NS.Aima.busy && NS.Aima.busy());
    if (on === dotOn) return;
    dotOn = on;
    refs.dot.classList.toggle('hidden', !on);
  }

  /* ------------------------------ DEBUG MATCHES ------------------------------ */

  // CPU v CPU matches at full speed with every move counted (js/game/debug.js); the report goes into a text box to copy.
  var DBG_OPTS = [
    ['matches', [5, 10, 20, 50, 100]],
    ['home', ['EASY', 'NORMAL', 'HARD', 'LEGEND', 'AIMA']],
    ['away', ['EASY', 'NORMAL', 'HARD', 'LEGEND', 'AIMA']],
    ['teams', ['SELECTED', 'RANDOM']],
    ['size', [11, 7]],
    ['stadium', ['COMPACT', 'SMALL', 'STANDARD', 'GRAND', 'ULTRA']],
    ['length', [3, 5, 10]]
  ];
  var dbgSel = { matches: 1, home: 1, away: 1, teams: 0, size: 0, stadium: 1, length: 0 };
  var dbgReport = '';
  var dbgBrain = ['', ''];   // the brain of a checkoAI side ('' = the active one)

  function dbgBrainName(side) {
    var id = dbgBrain[side], list = NS.Aima.brains();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    dbgBrain[side] = ''; // (deleted since)
    var a = NS.Aima.brain();
    return T('dbg.active') + (a ? ' (' + a.name + ')' : '');
  }

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
      var shown = o[1][dbgSel[o[0]]] === 'AIMA' ? 'checkoAI' : o[1][dbgSel[o[0]]];
      var b = btn('opt dbg-opt', T('dbg.' + o[0]) + ': ' + shown, 'dbg:' + o[0], function () {
        if (NS.Debug.running()) return;
        dbgSel[o[0]] = (dbgSel[o[0]] + 1) % o[1].length;
        renderDebug('dbg:' + o[0]);
      });
      if (busy) b.disabled = true;
      refs.dbgOpts.appendChild(b);
      // a checkoAI side: which brain plays it (default: the active one)
      var side = o[0] === 'home' ? 0 : (o[0] === 'away' ? 1 : -1);
      if (side >= 0 && shown === 'checkoAI' && NS.Aima) {
        var bb = btn('opt dbg-opt', T('dbg.brain') + ': ' + dbgBrainName(side), 'dbg:brain' + side, function () {
          if (NS.Debug.running()) return;
          var ids = [''].concat(NS.Aima.brains().map(function (e) { return e.id; }));
          dbgBrain[side] = ids[(ids.indexOf(dbgBrain[side]) + 1) % ids.length];
          renderDebug('dbg:brain' + side);
        });
        if (busy) bb.disabled = true;
        refs.dbgOpts.appendChild(bb);
      }
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
    // the picked brains are loaded first (from the cloud when not in memory)
    var want = [0, 1].map(function (t) { return cfg.levels[t] === 'AIMA' && NS.Aima ? dbgBrain[t] : ''; });
    if (want[0] || want[1]) {
      refs.dbgStatus.textContent = T('dbg.loading');
      Promise.all(want.map(function (id) { return id ? NS.Aima.getBrain(id) : null; })).then(function (bs) {
        if (NS.Debug.running()) return;
        cfg.brains = bs;
        runDebug(cfg);
      }, function (e) { refs.dbgStatus.textContent = T('dbg.loadfail') + ' ' + (e && e.message || e); });
      return;
    }
    runDebug(cfg);
  }

  function runDebug(cfg) {
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

  /* ------------------------------ checkoAI (Settings tab: Stats, Settings, Brains, Training) ------------------------------ */

  var AIMA_SUBS = ['stats', 'settings', 'brains', 'train'];
  var aimaSub = 'stats';
  // option rows of a brain, training and data options: shared with trainer.html (js/game/aima.js)
  var AIMA_OPTS = NS.Aima.OPTS;
  var aimaSel = '';       // the brain every sub-tab shows (default: the active one)
  var selLoading = '';
  var aimaConfirm = '';   // a size change / reset / delete waits for a second press
  var aimaMsg = '';
  // training options (cycled like the debug screen)
  var TR_OPTS = NS.Aima.TR_OPTS;
  var trSel = { matches: 1, size: 0, stadium: 1, length: 0, hours: 0, brain: '', opp: 'NORMAL' };
  var trView = { id: 0, full: false };   // the session whose summary / full stats are open
  var trMsg = '';
  var sesRefs = {};                       // session id -> its card's live elements (progress, text)
  var sesState = {};                      // session id -> the state its card was drawn with

  function kv(grid, label, value) {
    grid.appendChild(el('span', 'aima-k', label));
    grid.appendChild(el('b', 'aima-v', value));
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function spark(h) {
    if (!h || !h.length) return '-';
    var bars = '▁▂▃▄▅▆▇█', mn = 1e9, mx = -1e9, i, out = '';
    var a = h.slice(-12);
    for (i = 0; i < a.length; i++) { mn = Math.min(mn, a[i]); mx = Math.max(mx, a[i]); }
    for (i = 0; i < a.length; i++) out += bars[mx > mn ? Math.round((a[i] - mn) / (mx - mn) * 7) : 3];
    return out + '  ' + a[a.length - 1];
  }
  function when(t) { return t ? new Date(t).toLocaleString() : '-'; }
  function aimaCard(title) {
    var c = el('div', 'panel-card');
    c.appendChild(el('div', 'tag amber', title));
    return c;
  }
  function again(key) { renderSettings(key); }

  // one line of a brain's history
  function histText(h) {
    var d = h.d || {};
    switch (h.k) {
      case 'created': return T('aima.h.created');
      case 'cloned': return T('aima.h.cloned') + ' ' + d.from;
      case 'renamed': return T('aima.h.renamed') + ' ' + d.from + ' -> ' + d.to;
      case 'set': return T('aima.h.set') + ' ' + d.k + ' = ' + d.v;
      case 'size': return T('aima.h.size') + ' ' + d.v;
      case 'reset': return T('aima.h.reset');
      case 'inputs': return T('aima.h.inputs') + ' ' + d.from + ' -> ' + d.to;
      case 'match': return T('aima.h.match') + ' ' + d.s + ' (' + T(d.vs === 'human' ? 'aima.h.vshuman' : 'aima.h.vscpu') + ')';
      case 'data': return T('aima.h.data') + ' "' + d.set + '": ' + d.steps + ' ' + T('aima.d.steps').toLowerCase() + ', ' + d.dir + '% / ' + d.same + '%';
      case 'train': return T('aima.h.train') + ' v ' + d.opp + ': ' + d.n + (d.of && d.n < d.of ? '/' + d.of : '') + ' ' + T('aima.tr.matches') + ', ' + d.w + '-' + d.d + '-' + d.l +
        ' (' + d.gf + '-' + d.ga + ')';
      default: return h.k;
    }
  }

  function statsCards(list, b) {
    var A = NS.Aima, s = b.st;
    var cols = el('div', 'aima-cols');
    var c1 = aimaCard(T('aima.c.stats'));
    var g = el('div', 'aima-grid');
    kv(g, T('aima.k.matches'), s.matches + '  (' + s.w + '-' + s.d + '-' + s.l + ')' + (s.trainMatches ? '  ' + T('aima.k.trained') + ' ' + s.trainMatches : ''));
    kv(g, T('aima.k.minutes'), String(Math.round(s.mins)));
    kv(g, T('aima.k.goals'), s.goals + '   (' + T('aima.k.team') + ' ' + s.gf + '-' + s.ga + ')');
    kv(g, T('aima.k.shots'), s.shots + '  (' + T('aima.k.ontarget') + ' ' + s.onTarget + ')');
    kv(g, T('aima.k.passes'), s.passes + '  (' + (s.passes ? pct(Math.min(1, s.passOk / s.passes)) : '-') + ', ' + T('aima.k.fwd') + ' ' + s.fwdPass + ')');
    kv(g, T('aima.k.tackles'), String(s.tackles));
    kv(g, T('aima.k.wonlost'), s.won + ' / ' + s.lost);
    kv(g, T('aima.k.fouls'), String(s.fouls));
    if (s.agreeN > 500) kv(g, T('aima.k.agree'), Math.round(s.agree / (1 - Math.pow(0.998, s.agreeN)) * 100) + '%');
    if (s.pressN > 0) kv(g, T('aima.k.presssame'), Math.round(s.pressSame * 100 / s.pressN) + '%  (' + T('aima.k.pressodds') + ' ' + Math.round(s.pressOdds * 100 / s.pressN) + '%)');
    kv(g, T('aima.k.claps'), s.claps + (s.claps ? '  (' + T('aima.k.avg') + ' ' + pct(s.clapSum / s.claps) + ')' : ''));
    kv(g, T('aima.k.punish'), String(s.punish || 0));
    kv(g, T('aima.k.reward'), String(Math.round(s.reward * 10) / 10));
    kv(g, T('aima.k.trend'), spark(s.hist));
    c1.appendChild(g);
    cols.appendChild(c1);

    var c3 = aimaCard(T('aima.c.style'));
    var sy = A.style(b);
    var bars = [['aima.y.pass', sy.pass], ['aima.y.shoot', sy.shoot], ['aima.y.fwd', sy.fwd], ['aima.y.sprint', sy.sprint], ['aima.y.carry', sy.carry],
      ['aima.y.pos', (sy.pos + 1) / 2]];
    for (var i = 0; i < bars.length; i++) {
      var row = el('div', 'aima-bar');
      row.appendChild(el('span', 'aima-k', T(bars[i][0])));
      var tr = el('i');
      var fill = el('b');
      fill.style.width = Math.round(Math.max(0, Math.min(1, bars[i][1])) * 100) + '%';
      tr.appendChild(fill);
      row.appendChild(tr);
      c3.appendChild(row);
    }
    cols.appendChild(c3);
    list.appendChild(cols);

    // work: operations, the same count on every device (how heavy this brain is, not how fast this device is)
    var w = A.work(b), f = A.fmtOps;
    var c4 = aimaCard(T('aima.w.title') + ' — ' + T('aima.w.sub'));
    g = el('div', 'aima-grid');
    kv(g, T('aima.w.measured'), w.measured ? f(w.perSec) + ' ' + T('aima.w.persec') : T('aima.w.none'));
    if (w.measured) kv(g, '  ' + T('aima.w.split'), T('aima.w.play') + ' ' + f(w.playPerSec) + '  ·  ' + T('aima.w.learn') + ' ' + f(w.learnPerSec));
    kv(g, T('aima.w.expected'), T('aima.w.lon') + ' ' + f(w.expOn) + '  ·  ' + T('aima.w.loff') + ' ' + f(w.expOff) + ' ' + T('aima.w.persec'));
    kv(g, T('aima.w.decision'), f(w.perDecision) + '  ·  ' + T('aima.w.step') + ' ' + f(w.perStep));
    kv(g, T('aima.w.total'), f(w.total));
    kv(g, T('aima.w.memory'), (Math.round(w.memBytes / 104857.6) / 10) + ' MB');
    c4.appendChild(g);
    c4.appendChild(el('div', 'set-hint', T('aima.w.hint')));
    list.appendChild(c4);
  }

  function modelCard(b) {
    var A = NS.Aima, s = b.st;
    var c2 = aimaCard(T('aima.c.model'));
    var g = el('div', 'aima-grid');
    kv(g, T('aima.k.name'), b.name);
    kv(g, T('aima.k.alg'), A.ALG);
    kv(g, T('aima.k.brain'), b.cfg.size + '  ' + A.F + '-' + b.H1 + '-' + b.H2 + '-' + A.NOUT);
    kv(g, T('aima.k.params'), b.NP.toLocaleString() + '  (' + Math.round(b.NP * 2.75 / 102.4) / 10 + ' KB)');
    kv(g, T('aima.k.inputs'), T('aima.inputs'));
    kv(g, T('aima.k.decisions'), s.decisions + '  (' + T('aima.k.own') + ' ' + (s.decisions ? pct(s.modelDec / s.decisions) : '-') + ')');
    kv(g, T('aima.k.updates'), 'RL ' + s.rl + '  /  ' + T('aima.k.copy') + ' ' + s.im);
    kv(g, T('aima.k.samples'), T('aima.k.you') + ' ' + s.humanSamples + '  /  Legend ' + s.cpuSamples + '  (' + A.memory(b) + ')');
    kv(g, T('aima.k.help'), pct(b.help()));
    kv(g, T('aima.k.from'), T('aima.from.' + (b.from || 'new')));
    kv(g, T('aima.k.created'), when(b.created));
    kv(g, T('aima.k.saved'), when(b.saved));
    c2.appendChild(g);
    return c2;
  }

  // the selected brain (loaded), or null while it loads from the cloud
  function selBrain() {
    var A = NS.Aima, brains = A.brains();
    if (!aimaSel || !brains.some(function (e) { return e.id === aimaSel; })) aimaSel = A.activeId();
    var b = A.loadedBrain(aimaSel);
    if (b) return b;
    if (selLoading !== aimaSel) {
      selLoading = aimaSel;
      A.getBrain(aimaSel).then(function () { selLoading = ''; again('ai:pick'); },
        function () { selLoading = ''; aimaMsg = T('aima.loadfail'); aimaSel = A.activeId(); again('ai:pick'); });
    }
    return null;
  }
  function selectBrain(id) { aimaSel = id; aimaConfirm = ''; aimaMsg = ''; }

  function subStats(list, b) {
    statsCards(list, b);
  }

  function subSettings(list, b) {
    var A = NS.Aima, trainer = A.isTrainer();
    if (trainer) {
      var grid = el('div', 'aima-opts');
      list.appendChild(grid);
      AIMA_OPTS.forEach(function (o) {
        var r = el('div', 'set-row');
        var lab = el('div', 'set-label');
        lab.appendChild(el('div', 'set-name', T(o[1])));
        lab.appendChild(el('div', 'set-hint', T(o[1] + '.h')));
        r.appendChild(lab);
        var opts = el('div', 'row');
        o[2].forEach(function (v) {
          var key = 'ai:' + o[0] + ':' + v[0];
          opts.appendChild(btn('opt' + (b.cfg[o[0]] === v[0] ? ' sel' : ''), T(v[1]), key, function () {
            if (o[0] === 'size') {
              if (v[0] === b.cfg.size) return;
              if (A.sizeNeedsCloud(v[0]) && !A.hasCloud()) { aimaMsg = T('aima.needcloud'); again(key); return; }
              if (aimaConfirm !== key) { aimaConfirm = key; aimaMsg = T('aima.confirm.size'); again(key); return; }
              aimaConfirm = '';
              A.setSize(v[0], b);
              aimaMsg = T('aima.done.size');
            } else {
              A.setCfg(o[0], v[0], b);
            }
            again(key);
          }));
        });
        r.appendChild(opts);
        grid.appendChild(r);
      });
    }
    // the account (the imad profile): Google sign-in, kept in this profile's My PC save for all its devices
    var act = el('div', 'row aima-actions');
    var acc = A.account();
    list.appendChild(el('div', 'set-hint', T('aima.k.cloud') + ': ' + A.cloud + (acc ? '  -  ' + acc : '')));
    if (A.isImad() && A.hasCloud()) {
      if (acc) {
        act.appendChild(btn('', T('aima.signout'), 'ai:signout', function () { A.signOut(); aimaMsg = ''; again('ai:signout'); }));
      } else {
        act.appendChild(btn('primary', T('aima.signin'), 'ai:signin', function () {
          aimaMsg = T('aima.signing');
          again('ai:signin');
          A.signIn().then(function (who) { aimaMsg = T('aima.signed') + ' ' + who; again('ai:signin'); },
            function (e) { aimaMsg = T('aima.signfail') + ' ' + (e && e.message ? e.message : e); again('ai:signin'); });
        }));
        var inp = document.createElement('input');
        inp.className = 'aima-code';
        inp.placeholder = T('aima.code');
        inp.setAttribute('spellcheck', 'false');
        act.appendChild(inp);
        act.appendChild(btn('', T('aima.usecode'), 'ai:code', function () {
          if (!inp.value.trim()) return;
          A.signInCode(inp.value.trim()).then(function (who) { aimaMsg = T('aima.signed') + ' ' + who; again('ai:code'); },
            function (e) { aimaMsg = T('aima.signfail') + ' ' + (e && e.message ? e.message : e); again('ai:code'); });
        }));
      }
    }
    if (trainer) {
      act.appendChild(btn('', T('aima.save'), 'ai:save', function () { A.saveBrain(b); aimaMsg = T('aima.saved'); again('ai:save'); }));
      act.appendChild(btn('danger', T('aima.reset'), 'ai:reset', function () {
        if (aimaConfirm !== 'reset') { aimaConfirm = 'reset'; aimaMsg = T('aima.confirm.reset'); again('ai:reset'); return; }
        aimaConfirm = '';
        A.reset(b);
        aimaMsg = T('aima.done.reset');
        again('ai:reset');
      }));
    }
    list.appendChild(act);
    list.appendChild(el('div', 'set-hint aima-note', T(trainer ? 'aima.note.trainer' : (A.isImad() ? 'aima.note.signin' : 'aima.note.viewer'))));
  }

  function subBrains(list) {
    var A = NS.Aima, trainer = A.isTrainer();
    var brainSel = aimaSel; // (picked with the brain picker at the top)
    // the selected brain: info, history, actions
    var sb = A.loadedBrain(brainSel);
    var cols = el('div', 'aima-cols two');
    if (sb) {
      cols.appendChild(modelCard(sb));
      var hc = aimaCard(T('aima.c.history'));
      var ul = el('ul', 'aima-hist');
      var h = sb.hist.slice(-25).reverse();
      if (!h.length) ul.appendChild(el('li', null, '-'));
      h.forEach(function (x) {
        var li = el('li');
        li.appendChild(el('span', 'aima-k', new Date(x.t).toLocaleDateString() + ' ' + new Date(x.t).toLocaleTimeString().slice(0, 5) + '  '));
        li.appendChild(document.createTextNode(histText(x)));
        ul.appendChild(li);
      });
      hc.appendChild(ul);
      cols.appendChild(hc);
    } else {
      cols.appendChild(el('div', 'set-hint', T('aima.loading')));
    }
    list.appendChild(cols);

    if (!trainer) return;
    // every brain, each with its own buttons (the name box is used by Rename, Clone and New brain)
    var act = el('div', 'row aima-actions');
    var name = document.createElement('input');
    name.className = 'aima-code';
    name.placeholder = T('aima.newname');
    name.maxLength = 24;
    act.appendChild(name);
    function nm() { return name.value.trim().slice(0, 24); }
    act.appendChild(btn('', T('aima.sub.settings'), 'ai:brset', function () {
      aimaSub = 'settings'; aimaMsg = ''; aimaConfirm = '';
      again('as:settings');
    }));
    act.appendChild(btn('', T('aima.newbrain'), 'ai:new', function () {
      var b = A.create(nm() || 'checkoAI ' + (A.brains().length + 1));
      selectBrain(b.id); aimaMsg = T('aima.created') + ' ' + b.name; again('ai:new');
    }));
    list.appendChild(act);
    var ac = aimaCard(T('aima.c.all') + ' (' + A.brains().length + ')');
    A.brains().forEach(function (e) {
      var id = e.id, isAct = id === A.activeId(), used = A.inUse(id);
      var row = el('div', 'aima-brow' + (id === brainSel ? ' sel' : ''));
      row.appendChild(el('div', 'aima-bname', (isAct ? '★ ' : '') + e.name));
      row.appendChild(el('div', 'aima-bsub', e.size + '  ·  ' + (e.matches || 0) + ' ' + T('aima.tr.matches') + (used ? '  ·  ' + T('aima.inuse') : '')));
      var bt = el('div', 'row aima-bbtns');
      bt.appendChild(btn('', T('aima.sel'), 'ai:s:' + id, function () { selectBrain(id); again('ai:s:' + id); }));
      if (!isAct) bt.appendChild(btn('primary', T('aima.use'), 'ai:u:' + id, function () {
        A.use(id).then(function (b) { aimaMsg = T('aima.used') + ' ' + b.name; again('ai:u:' + id); }, function () { aimaMsg = T('aima.loadfail'); again('ai:u:' + id); });
      }));
      bt.appendChild(btn('', T('aima.clone'), 'ai:c:' + id, function () {
        A.clone(id, nm() || e.name + ' 2').then(function (b) { selectBrain(b.id); aimaMsg = T('aima.cloned') + ' ' + b.name; again('ai:c:' + id); },
          function () { aimaMsg = T('aima.loadfail'); again('ai:c:' + id); });
      }));
      bt.appendChild(btn('', T('aima.rename'), 'ai:r:' + id, function () {
        if (!nm()) { aimaMsg = T('aima.needname'); again('ai:r:' + id); return; }
        A.rename(id, nm()).then(function () { aimaMsg = T('aima.renamed'); again('ai:r:' + id); }, function () { aimaMsg = T('aima.loadfail'); again('ai:r:' + id); });
      }));
      if (!isAct && !used && A.brains().length > 1) {
        bt.appendChild(btn('danger', T('aima.delete'), 'ai:d:' + id, function () {
          if (aimaConfirm !== 'del:' + id) { aimaConfirm = 'del:' + id; aimaMsg = T('aima.confirm.del') + ' (' + e.name + ')'; again('ai:d:' + id); return; }
          aimaConfirm = '';
          if (A.remove(id)) { if (aimaSel === id) aimaSel = A.activeId(); aimaMsg = T('aima.deleted'); } else aimaMsg = T('aima.inuse');
          again('ai:d:' + id);
        }));
      }
      row.appendChild(bt);
      ac.appendChild(row);
    });
    list.appendChild(ac);
  }

  function trName(id) {
    var bs = NS.Aima.brains();
    for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i].name;
    return '?';
  }

  // live progress of a session card (no re-render; a new state redraws the tab)
  function sesProgress(S) {
    var played = S.done + (NS.Aima.playing() === S ? Math.min(1, S.mins / 90) : 0);
    if (!S.cfg.matches) return played - S.done; // continuous: the match being played
    return Math.min(1, played / S.cfg.matches);
  }
  function sesInfo(S) {
    var d = S.b && S.runs[S.b.id] ? S.runs[S.b.id].acc : {};
    var txt = T('aima.ss.' + S.state) + '  \u00b7  ' + S.done + ' / ' + (S.cfg.matches || '∞') + ' ' + T('aima.tr.matches') +
      '  \u00b7  ' + (d.w || 0) + '-' + (d.d || 0) + '-' + (d.l || 0) + '  (' + (d.gf || 0) + '-' + (d.ga || 0) + ')';
    if (NS.Aima.playing() === S) txt += '  \u00b7  ' + T('aima.ss.now') + ' ' + Math.floor(S.mins) + "'";
    if (S.error) txt += '  \u00b7  ' + S.error;
    return txt;
  }
  // a new state redraws the Training tab: keep where the list was scrolled to
  function redrawTrain() {
    var sc = refs.setList, y0 = sc.scrollTop, y1 = sc.parentNode ? sc.parentNode.scrollTop : 0;
    again('tr:start');
    sc.scrollTop = y0;
    if (sc.parentNode) sc.parentNode.scrollTop = y1;
  }
  function onTrain(S) {
    if (current !== 'SETTINGS' || settingsGroup !== 'aima' || aimaSub !== 'train') return;
    if (sesState[S.id] !== S.state || !sesRefs[S.id]) { redrawTrain(); return; }
    var r = sesRefs[S.id], f = sesProgress(S);
    r.fill.style.width = Math.round(f * 1000) / 10 + '%';
    r.pct.textContent = Math.round(f * 100) + '%';
    r.info.textContent = sesInfo(S);
  }

  function subTrain(list) {
    var A = NS.Aima;
    A.onTrain = onTrain;
    if (!A.isTrainer()) { list.appendChild(el('div', 'set-hint', T('aima.note.signin'))); return; }
    var brains = A.brains();
    var me = selBrain();
    // ---- a new session for the brain picked at the top: its own opponent, matches and pitch
    var form = aimaCard(T('aima.ss.new') + ': ' + (me ? me.name : '?'));
    var opps = ['EASY', 'NORMAL', 'HARD', 'LEGEND'];
    brains.forEach(function (e) { opps.push('B:' + e.id); });
    if (opps.indexOf(trSel.opp) < 0) trSel.opp = 'NORMAL';
    var opts = el('div', 'dbg-opts');
    function cyc(key, label, value, next) {
      opts.appendChild(btn('opt dbg-opt', label + ': ' + value, 'tr:' + key, function () { next(); again('tr:' + key); }));
    }
    cyc('opp', T('aima.tr.opp'), trSel.opp.indexOf('B:') === 0 ? 'checkoAI ' + trName(trSel.opp.slice(2)) : T('opt.' + trSel.opp.toLowerCase()), function () {
      trSel.opp = opps[(opps.indexOf(trSel.opp) + 1) % opps.length];
    });
    TR_OPTS.forEach(function (o) {
      var v = o[1][trSel[o[0]]];
      cyc(o[0], T('dbg.' + o[0]), !v && o[0] === 'matches' ? T('aima.tr.forever') : (!v && o[0] === 'hours' ? T('aima.tr.nolimit') : String(v)), function () { trSel[o[0]] = (trSel[o[0]] + 1) % o[1].length; });
    });
    form.appendChild(opts);
    var row = el('div', 'row aima-actions');
    row.appendChild(btn('primary', T('aima.ss.start'), 'tr:start', function () {
      if (!me) return;
      var S = A.startSession({ brain: me.id, opp: trSel.opp, matches: TR_OPTS[0][1][trSel.matches], teamSize: TR_OPTS[1][1][trSel.size],
        stadium: TR_OPTS[2][1][trSel.stadium], duration: TR_OPTS[3][1][trSel.length], hours: TR_OPTS[4][1][trSel.hours] });
      trMsg = S ? '' : T('aima.tr.busy');
      again('tr:start');
    }));
    if (A.training()) row.appendChild(btn('danger', T('aima.ss.stopall'), 'tr:stopall', function () { A.stopTraining(); again('tr:start'); }));
    form.appendChild(row);
    form.appendChild(el('div', 'set-hint', trMsg || T('aima.ss.hint')));
    list.appendChild(form);
    list.appendChild(dataCard(me));

    // ---- the sessions, newest first: each with its own progress bar
    sesRefs = {};
    var all = A.sessions().slice().reverse();
    all.forEach(function (S) {
      sesState[S.id] = S.state;
      var c = el('div', 'panel-card aima-ses ' + S.state);
      var head = el('div', 'aima-ses-head');
      head.appendChild(el('b', null, '#' + S.id + '  ' + (S.b ? S.b.name : trName(S.cfg.brain)) + '  v  ' +
        (S.oppLabel || (S.cfg.opp.indexOf('B:') === 0 ? 'checkoAI ' + trName(S.cfg.opp.slice(2)) : S.cfg.opp))));
      head.appendChild(el('span', 'set-hint', S.cfg.teamSize + ' ' + T('aima.tr.aside') + ' \u00b7 ' + S.cfg.stadium + ' \u00b7 ' + S.cfg.duration + ' min'));
      c.appendChild(head);
      var bar = el('div', 'aima-prog');
      var fill = el('b');
      var f = sesProgress(S);
      fill.style.width = Math.round(f * 1000) / 10 + '%';
      var pc = el('span', null, Math.round(f * 100) + '%');
      bar.appendChild(fill); bar.appendChild(pc);
      c.appendChild(bar);
      var info = el('div', 'set-hint', sesInfo(S));
      c.appendChild(info);
      sesRefs[S.id] = { fill: fill, pct: pc, info: info };
      var acts = el('div', 'row aima-actions');
      var live = S.state === 'running' || S.state === 'loading';
      if (live) acts.appendChild(btn('danger', T('dbg.stop'), 'tr:stop:' + S.id, function () { A.stopSession(S.id); again('tr:stop:' + S.id); }));
      acts.appendChild(btn('opt' + (trView.id === S.id && !trView.full ? ' sel' : ''), T('aima.tr.summary'), 'tr:sum:' + S.id, function () {
        trView = trView.id === S.id && !trView.full ? { id: 0, full: false } : { id: S.id, full: false }; again('tr:sum:' + S.id);
      }));
      acts.appendChild(btn('opt' + (trView.id === S.id && trView.full ? ' sel' : ''), T('aima.tr.full'), 'tr:full:' + S.id, function () {
        trView = trView.id === S.id && trView.full ? { id: 0, full: false } : { id: S.id, full: true }; again('tr:full:' + S.id);
      }));
      if (!live) acts.appendChild(btn('', T('aima.ss.remove'), 'tr:rm:' + S.id, function () { A.removeSession(S.id); again('tr:start'); }));
      c.appendChild(acts);
      if (trView.id === S.id) {
        var ta = document.createElement('textarea');
        ta.className = 'dbg-text aima-out';
        ta.readOnly = true;
        ta.setAttribute('spellcheck', 'false');
        ta.value = A.sessionText(S, trView.full);
        c.appendChild(ta);
        c.appendChild(btn('', T('dbg.copy'), 'tr:copy:' + S.id, function () {
          ta.focus(); ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).catch(function () {});
        }));
      }
      list.appendChild(c);
    });
  }

  // ---- recorded data (Legend v Legend, named sets in the cloud) and learning from it: a card of its own on the Training tab
  var DT_PASSES = NS.Aima.DT_PASSES, DT_WIN = NS.Aima.DT_WIN, DT_ROUNDS = NS.Aima.DT_ROUNDS;
  var dtSel = { set: '', passes: 1, win: DT_WIN.indexOf(100), rounds: 0 };
  var dtMsg = '', dtAsked = false;
  var jobRefs = {}, jobState = {};
  function onData(J) {
    if (current !== 'SETTINGS' || settingsGroup !== 'aima' || aimaSub !== 'train') return;
    if (!J || jobState[J.id] !== J.state || !jobRefs[J.id]) { redrawTrain(); return; }
    jobRefs[J.id].textContent = NS.Aima.jobText(J);
  }
  function dataCard(me) {
    var A = NS.Aima;
    A.onData = onData;
    if (!dtAsked && A.hasCloud()) { dtAsked = true; A.loadDataIndex(); }
    var c = aimaCard(T('aima.d.title'));
    var sets = A.dataSets(), cur = null;
    sets.forEach(function (x) { if (x.id === dtSel.set) cur = x; });
    if (!cur) dtSel.set = '';
    var g = el('div', 'aima-grid');
    if (!sets.length) kv(g, '-', T('aima.d.none'));
    sets.forEach(function (x) {
      kv(g, x.name + (x.local ? ' *' : ''), x.matches + ' ' + T('aima.tr.matches') + ' \u00b7 ' + x.samples + ' ' + T('aima.d.samples') + ' \u00b7 ' +
        x.presses + ' ' + T('aima.d.presses') + ' \u00b7 ' + x.teamSize + ' ' + T('aima.tr.aside') + ' \u00b7 ' + when(x.updated) +
        (x.F !== A.F ? ' \u00b7 ' + T('aima.d.oldF') : ''));
    });
    c.appendChild(g);
    // what this brain has already learnt from the chosen set (the next run goes on from there)
    var lr = cur && me ? A.learnt(me, cur.id) : null;
    if (cur && me) c.appendChild(el('div', 'set-hint', me.name + ': ' + (lr ? lr.passes.toFixed(3) + ' ' + T('aima.d.passes') + ' · ' + lr.chunks + ' / ' + cur.chunks + ' ' + T('aima.d.chunks') +
      (cur.chunks > lr.chunks ? ' · +' + (cur.chunks - lr.chunks) + ' ' + T('aima.d.newchunks') : '') : T('aima.d.never'))));
    c.appendChild(el('div', 'set-hint', T('aima.k.cloud') + ': ' + A.dataState()));
    var opts = el('div', 'dbg-opts');
    opts.appendChild(btn('opt dbg-opt', T('aima.d.set') + ': ' + (cur ? cur.name : T('aima.d.new')), 'dt:set', function () {
      var ids = [''].concat(A.dataSets().map(function (x) { return x.id; }));
      dtSel.set = ids[(ids.indexOf(dtSel.set) + 1) % ids.length];
      dtMsg = ''; aimaConfirm = '';
      again('dt:set');
    }));
    opts.appendChild(btn('opt dbg-opt', T('aima.d.passes') + ': ' + DT_PASSES[dtSel.passes], 'dt:passes', function () {
      dtSel.passes = (dtSel.passes + 1) % DT_PASSES.length;
      again('dt:passes');
    }));
    opts.appendChild(btn('opt dbg-opt', T('aima.d.win') + ': ' + DT_WIN[dtSel.win], 'dt:win', function () {
      dtSel.win = (dtSel.win + 1) % DT_WIN.length;
      again('dt:win');
    }));
    opts.appendChild(btn('opt dbg-opt', T('aima.d.rounds') + ': ' + (DT_ROUNDS[dtSel.rounds] || '∞'), 'dt:rounds', function () {
      dtSel.rounds = (dtSel.rounds + 1) % DT_ROUNDS.length;
      again('dt:rounds');
    }));
    c.appendChild(opts);
    var row = el('div', 'row aima-actions');
    var name = document.createElement('input');
    name.className = 'aima-code';
    name.placeholder = T('aima.d.name');
    name.maxLength = 24;
    if (!cur) row.appendChild(name);
    row.appendChild(btn('primary', T('aima.d.record'), 'dt:rec', function () {
      if (!cur && !name.value.trim()) { dtMsg = T('aima.d.needname'); again('dt:rec'); return; }
      var J = A.startRecord({ set: dtSel.set, name: name.value.trim(), matches: TR_OPTS[0][1][trSel.matches], teamSize: TR_OPTS[1][1][trSel.size],
        stadium: TR_OPTS[2][1][trSel.stadium], duration: TR_OPTS[3][1][trSel.length], hours: TR_OPTS[4][1][trSel.hours] });
      if (J) { dtSel.set = J.set; dtMsg = ''; } else dtMsg = T('aima.d.cant');
      again('dt:rec');
    }));
    row.appendChild(btn('', T('aima.d.learnbtn'), 'dt:learn', function () {
      if (!me || !cur) { dtMsg = T('aima.d.pickset'); again('dt:learn'); return; }
      var J = A.startLearn({ brain: me.id, sets: [cur.id], passes: DT_PASSES[dtSel.passes], win: DT_WIN[dtSel.win], rounds: DT_ROUNDS[dtSel.rounds],
        hours: TR_OPTS[4][1][trSel.hours] });
      dtMsg = J ? '' : T('aima.d.cant');
      again('dt:learn');
    }));
    if (cur && A.dataMissing(cur.id)) {
      row.appendChild(btn('opt sel', T('aima.d.resend') + ' (' + A.dataMissing(cur.id) + ')', 'dt:resend', function () {
        dtMsg = A.resendSet(cur.id) ? T('aima.d.resending') : T('aima.d.signfirst');
        again('dt:resend');
      }));
    }
    if (cur) {
      row.appendChild(btn('danger', T('aima.d.del'), 'dt:del', function () {
        if (aimaConfirm !== 'dtdel:' + cur.id) { aimaConfirm = 'dtdel:' + cur.id; dtMsg = T('aima.d.confirmdel'); again('dt:del'); return; }
        aimaConfirm = '';
        dtMsg = A.deleteSet(cur.id) ? T('aima.d.deleted') : T('aima.d.inuse');
        again('dt:del');
      }));
    }
    c.appendChild(row);
    c.appendChild(el('div', 'set-hint', dtMsg || T('aima.d.hint')));
    // its jobs, newest first
    jobRefs = {};
    A.dataJobs().slice().reverse().forEach(function (J) {
      jobState[J.id] = J.state;
      var jc = el('div', 'panel-card aima-ses ' + J.state);
      var info = el('div', 'set-hint aima-job', A.jobText(J));
      jc.appendChild(info);
      jobRefs[J.id] = info;
      var acts = el('div', 'row aima-actions');
      var live = J.state === 'running' || J.state === 'loading';
      if (live) acts.appendChild(btn('danger', T('dbg.stop'), 'dt:stop:' + J.id, function () { A.stopJob(J.id); again('dt:stop:' + J.id); }));
      else acts.appendChild(btn('', T('aima.ss.remove'), 'dt:rm:' + J.id, function () { A.removeJob(J.id); again('dt:rec'); }));
      jc.appendChild(acts);
      c.appendChild(jc);
    });
    return c;
  }

  function renderAima() {
    var A = NS.Aima;
    var list = refs.setList;
    var trainer = A.isTrainer();
    var shown = selBrain();
    var brains = A.brains();
    var selName = '?';
    for (var i = 0; i < brains.length; i++) if (brains[i].id === aimaSel) selName = brains[i].name;
    if (shown) selName = shown.name;
    // sub-tabs (Stats and Settings for everyone; Brains and Training for the trainer), then the brain they all show
    var subs = trainer ? AIMA_SUBS : ['stats', 'settings'];
    if (subs.indexOf(aimaSub) < 0) aimaSub = 'stats';
    var tabs = el('div', 'tabs aima-subs');
    subs.forEach(function (s) {
      var t = btn('tab' + (s === aimaSub ? ' sel' : ''), T('aima.sub.' + s), 'as:' + s, function () {
        aimaSub = s; aimaMsg = ''; aimaConfirm = '';
        again('as:' + s);
        list.scrollTop = 0; // a new sub-tab starts at the top
        if (list.parentNode) list.parentNode.scrollTop = 0;
      });
      tabs.appendChild(t);
    });
    if (brains.length > 1 || trainer) {
      var isAct = (shown ? shown.id : aimaSel) === A.activeId();
      var pk = btn('opt aima-pick', T('aima.tr.brain') + ': ' + (isAct ? '\u2605 ' : '') + selName + '  \u25b8', 'ai:pick', function () {
        if (brains.length < 2) return;
        var j = 0;
        for (; j < brains.length; j++) if (brains[j].id === aimaSel) break;
        selectBrain(brains[(j + 1) % brains.length].id);
        again('ai:pick');
      });
      tabs.appendChild(pk);
    }
    list.appendChild(tabs);
    if (!shown) list.appendChild(el('div', 'set-hint', T('aima.loading')));
    else if (aimaSub === 'stats') subStats(list, shown);
    else if (aimaSub === 'settings') subSettings(list, shown);
    else if (aimaSub === 'brains') subBrains(list);
    else subTrain(list);
    if (aimaMsg) list.appendChild(el('div', 'map-msg', aimaMsg));
  }

  function renderSettings(keepKey) {
    clear(refs.setList);
    refs.setList.classList.toggle('aima-mode', settingsGroup === 'aima'); // one column, its own layout
    if (settingsGroup === 'aima') renderAima();
    else NS.SETTING_DEFS.forEach(function (def) {
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
          if (def.key === 'difficulty') renderSettings('set:' + def.key + ':' + o[0]); // (the model row below shows for checkoAI)
        });
        b.setAttribute('data-set', def.key);
        b.setAttribute('data-val', String(o[0]));
        opts.appendChild(b);
      });
      row.appendChild(opts);
      refs.setList.appendChild(row);
      if (def.key === 'difficulty' && World.settings.difficulty === 'AIMA' && NS.Aima) refs.setList.appendChild(aimaModelRow());
    });
    var tabs = refs.setTabs.querySelectorAll('[data-group]');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('sel', tabs[i].getAttribute('data-group') === settingsGroup);
    syncSettings();
    if (keepKey) { focused = null; if (!focusByKey(keepKey)) focusDefault(); }
  }

  // checkoAI is the CPU level: which of the available models plays (the active brain, the one every match uses)
  function aimaModelRow() {
    var A = NS.Aima;
    var row = el('div', 'set-row');
    var lab = el('div', 'set-label');
    lab.appendChild(el('div', 'set-name', T('aima.pick.model')));
    lab.appendChild(el('div', 'set-hint', T('aima.pick.model.h')));
    row.appendChild(lab);
    var opts = el('div', 'row');
    var list = A.brains();
    if (!list.length) opts.appendChild(el('div', 'set-hint', T('aima.loading')));
    list.forEach(function (e) {
      var on = e.id === A.activeId();
      opts.appendChild(btn('opt' + (on ? ' sel' : ''), e.name + '  ·  ' + e.size, 'set:aimamodel:' + e.id, function () {
        A.use(e.id).then(function () { if (current === 'SETTINGS' && settingsGroup !== 'aima') renderSettings('set:aimamodel:' + e.id); }, function () {});
      }));
    });
    row.appendChild(opts);
    return row;
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

  var mapP = 0;   // the map the screen shows and changes: 0 the game controllers', 1 the keyboard's
  function buildButtons() {
    var wrap = screens.BUTTONS;
    var head = el('div', 'screen-head');
    head.appendChild(el('h2', null, T('map.title')));
    head.appendChild(el('p', 'muted small', T('map.sub')));
    refs.mapNote = el('p', 'map-note hidden', T('map.noraw'));
    head.appendChild(refs.mapNote);
    // which map: the game controllers' or the keyboard's (each player plays with the one of his device)
    var who = el('div', 'row map-who');
    refs.mapWho = [0, 1].map(function (n) {
      var b = btn('opt', T(n ? 'map.kb' : 'map.pads'), 'mp:' + n, function () { mapP = n; renderButtons('mp:' + n); });
      who.appendChild(b);
      return b;
    });
    refs.mapDev = el('span', 'muted small');
    who.appendChild(refs.mapDev);
    head.appendChild(who);
    wrap.appendChild(head);
    refs.mapCols = el('div', 'help-cols map-cols');
    wrap.appendChild(refs.mapCols);
    refs.mapMsg = el('div', 'map-msg');
    wrap.appendChild(refs.mapMsg);
    var foot = el('div', 'foot');
    var left = el('div', 'row');
    left.appendChild(btn('', T('nav.back'), 'back', back));
    left.appendChild(btn('danger', T('map.reset'), 'mapreset', function () {
      NS.Bindings.reset(mapP);
      NS.Storage.saveBindings();
      renderButtons('mapreset');
      refs.mapMsg.textContent = T('map.reset.done');
    }));
    foot.appendChild(left);
    foot.appendChild(btn('', T('map.clear'), 'mapclear', function () {
      if (mapLast >= 0) {
        NS.Bindings.clear(mapLast, mapP);
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
    var sprint = idx === -1, clap = idx === -2, pun = idx === -3;
    if (pun) {
      var pb = btn('map-row', '', 'mv:' + idx, function () { startCapture(idx); });
      pb.setAttribute('data-mv', String(idx));
      pb.appendChild(el('span', 'map-name', T('mv.punish')));
      pb.appendChild(el('span', 'map-val pad', B.maskLabel(B.punishMask())));
      return pb;
    }
    var b = btn('map-row', '', 'mv:' + idx, function () { startCapture(idx); });
    b.setAttribute('data-mv', String(idx));
    b.appendChild(el('span', 'map-name', T(clap ? 'mv.clap' : (sprint ? 'mv.sprint' : 'mv.' + B.MOVES[idx].id))));
    // the map of the player picked above (P1 / P2)
    var v = el('span', 'map-val pad' + (!sprint && !clap && !B.maskOf(idx, mapP) ? ' off' : ''),
      clap ? B.maskLabel(B.clapMask()) : (sprint ? B.maskLabel(B.sprintMask(mapP), mapP) : B.bindingLabel(idx, mapP)));
    b.appendChild(v);
    return b;
  }

  function renderButtons(focusKey) {
    var B = NS.Bindings;
    clear(refs.mapCols);
    refs.mapNote.classList.toggle('hidden', NS.Gamepad.live());
    refs.mapWho[0].classList.toggle('sel', mapP === 0);
    refs.mapWho[1].classList.toggle('sel', mapP === 1);
    // the keyboard has two keys to play with (My PC keeps the others): what this map can use
    refs.mapDev.textContent = mapP ? T('map.keys') : '';
    var groups = [['map.group.move', 0], ['map.group.att', 1], ['map.group.def', 2]];
    groups.forEach(function (g) {
      var card = el('div', 'panel-card');
      card.appendChild(el('div', 'tag amber', T(g[0])));
      var list = el('div', 'stack');
      if (g[1] === 0) {
        list.appendChild(mapRow(-1));
        if (NS.Aima && NS.Aima.isImad() && !mapP) { list.appendChild(mapRow(-2)); list.appendChild(mapRow(-3)); } // checkoAI's clap / punishment: the trainer only (a controller)
      }
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
    var sprint = idx === -1, clap = idx === -2, pun = idx === -3;
    refs.capTitle.textContent = T(pun ? 'mv.punish' : (clap ? 'mv.clap' : (sprint ? 'mv.sprint' : 'mv.' + B.MOVES[idx].id)));
    refs.capText.textContent = T(mapP === 1 ? 'map.prompt.kb' : (sprint || clap || pun ? 'map.prompt.sprint' : 'map.prompt'));
    refs.capLive.textContent = T('map.waiting');
    refs.capture.classList.remove('hidden');
    refs.mapMsg.textContent = '';
    var kb = mapP === 1;
    NS.Mapper.start(function (mask) {
      var msg;
      if (!mask) {
        msg = T('map.timeout');
      } else if (kb) {
        // the keyboard: the key(s) pressed (KeyboardEvent.code, one or two)
        var res = sprint ? B.setSprintKeys(mask) : B.setKeys(idx, mask);
        if (res === false) { msg = T('map.keybad'); mask = 0; }
        else {
          msg = T('map.kb') + ':  ' + T(sprint ? 'mv.sprint' : 'mv.' + B.MOVES[idx].id) + ' = ' + B.keysLabel(mask) +
            (!sprint && res >= 0 ? '   (' + T('mv.' + B.MOVES[res].id) + ': ' + T('map.conflict') + ')' : '');
        }
      } else if (!clap && !pun && (mask & B.DPAD)) {
        msg = T('map.dpad'); mask = 0; // the D-pad moves the player: only the clap / punishment may use it
      } else if (pun) {
        msg = B.setPunish(mask) ? T('mv.punish') + ' = ' + B.maskLabel(mask) : T('map.clapbusy');
      } else if (clap) {
        msg = B.setClap(mask) ? T('mv.clap') + ' = ' + B.maskLabel(mask) : T('map.clapbusy');
      } else if (sprint) {
        B.setSprint(mask, mapP);
        msg = T('mv.sprint') + ' = ' + B.maskLabel(mask, mapP);
      } else {
        var cleared = B.set(idx, mask, mapP);
        msg = T(mapP ? 'map.kb' : 'map.pads') + ':  ' + T('mv.' + B.MOVES[idx].id) + ' = ' + B.bindingLabel(idx, mapP) +
          (cleared >= 0 ? '   (' + T('mv.' + B.MOVES[cleared].id) + ': ' + T('map.conflict') + ')' : '');
      }
      if (mask) NS.Storage.saveBindings();
      renderButtons('mv:' + idx);
      refs.mapMsg.textContent = msg;
      NS.Input.clearEdges();
      NS.Input.block(350); // the button just mapped must not also press the focused row again
    }, function (mask) {
      refs.capLive.textContent = T('map.detected') + ' ' + (kb ? B.keysLabel(mask) : B.maskLabel(mask, 0));
    }, function (secs) {
      refs.capCount.textContent = T('map.countdown').replace('%s', secs);
    }, function (dev) { return NS.Devices.isKeys(dev) === (mapP === 1); }); // (only the map's own kind of device)
  }

  /* ------------------------------ public ------------------------------ */

  NS.UI = {
    build: function () {
      root = document.getElementById('menu-root');
      refs.badge = document.getElementById('menu-step-badge');
      refs.dot = document.getElementById('train-dot');
      setInterval(function () { if (open) trainDot(); }, 1000);
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
      buildResult();
      buildLearn();
      NS.Match.syncRosters();
      lastFocusKey.TEAMS = 'h:' + World.session.homeTeamId;
    },
    show: show,
    hide: hide,
    isOpen: function () { return open; },
    screen: function () { return current; },
    // controllers connected / gone: the mapping screen shows the right names and the "connect a controller" note
    padsChanged: function () {
      if (open && current === 'BUTTONS' && !NS.Mapper.active()) renderButtons(focused && focused.getAttribute('data-k'));
      if (open && current === 'SIDES') updateSideSlots();
    },
    // a controller's stick / D-pad went left or right (js/core/gamepad.js): the sides screen moves its icon
    padSide: sideMove,
    // a controller's L / R (d -1 / +1): the Settings page goes to the tab before / after (round). false = not on Settings
    tabStep: function (d) {
      if (!open || current !== 'SETTINGS') return false;
      var tabs = [].filter.call(refs.setTabs.querySelectorAll('[data-group]'), function (b) { return b.offsetParent !== null; });
      if (!tabs.length) return true;
      var at = 0;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].getAttribute('data-group') === settingsGroup) at = i;
      var to = tabs[(at + d + tabs.length) % tabs.length];
      setFocus(to); // (the highlight moves off the tab before)
      to.click();
      return true;
    },
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
      if (id === 'plan') { World.session.selStarter = [null, null]; show('GAMEPLAN'); }
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
    onInput: function (action, pressed, repeat, dev) {
      // the mapper is listening to the real buttons / keys (js/core/gamepad.js, js/core/keyboard.js)
      if (NS.Mapper.active()) return;
      if (!pressed) return;
      // the sides screen: left / right move this keyboard's icon (a controller moves its own, through padSide)
      if (current === 'SIDES' && (action === 'left' || action === 'right')) {
        if (!repeat && !/^pad/.test(dev || '')) sideMove(!dev || dev === 'touch' ? 'keys' : dev, action === 'left' ? -1 : 1);
        return;
      }
      var c = DUAL[current] ? cursorOf(dev) : 0;
      switch (action) {
        case 'left': move(0, c); break;
        case 'right': move(1, c); break;
        case 'up': move(2, c); break;
        case 'down': move(3, c); break;
        case 'confirm': if (!repeat && getF(c)) { actor = c; getF(c).click(); actor = 0; } break;
        case 'cancel':
          if (repeat) break;
          if (DUAL[current] && panelBack(c)) break; // (a panel's own step back: its leagues, a pick undone)
          if (c === 0) back();                     // (only P1 leaves the screen)
          break;
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
