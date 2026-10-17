/* Competitions: a real league season, a continental cup (knockout) and a world cup (groups + knockout).
 *
 * The player only picks a team (and 1 player or 2-player co-op). The opponents are drawn at random, the CPU matches of
 * every round are simulated from the team strength (stars), the player's own match is played. A drawn knockout match is
 * settled by a (simulated) penalty shoot-out. Progress is saved with MyPC.save('comp') so a season can be continued.
 * The player's team is always the home side in the 3D match (team 0); fixtures still show the real home / away.
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var TYPE = { DOMESTIC_LEAGUE: 'LEAGUE', CONTINENTAL_CUP: 'CUP', WORLD_NATIONALS: 'WORLDCUP' };
  var KO_NAMES = { 16: 'comp.r16', 8: 'comp.qf', 4: 'comp.sf', 2: 'comp.final' };

  var state = null;

  function T(k) { return NS.I18n.t(k); }
  function team(id) { return NS.Teams.byId(id); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function poisson(l) {
    var L = Math.exp(-l), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L && k < 9);
    return k - 1;
  }

  // CPU vs CPU result from the stars of both teams
  function simScore(a, b) {
    var sa = team(a).stars, sb = team(b).stars;
    var la = Math.min(3, Math.max(0.25, 1.3 + (sa - sb) * 0.35));
    var lb = Math.min(3, Math.max(0.25, 1.3 + (sb - sa) * 0.35));
    return [poisson(la), poisson(lb)];
  }

  // penalty shoot-out: returns [pens a, pens b] with a winner
  function shootout(a, b) {
    var pa = 0, pb = 0, edge = (team(a).stars - team(b).stars) * 0.03;
    for (var k = 0; k < 5; k++) { if (Math.random() < 0.75 + edge) pa++; if (Math.random() < 0.75 - edge) pb++; }
    while (pa === pb) { if (Math.random() < 0.75 + edge) pa++; if (Math.random() < 0.75 - edge) pb++; }
    return [pa, pb];
  }

  function newRow() { return { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; }

  function addResult(table, a, b, ga, gb) {
    var A = table[a], B = table[b];
    A.p++; B.p++; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
    if (ga > gb) { A.w++; B.l++; A.pts += 3; }
    else if (gb > ga) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  }

  function sortTable(ids, table) {
    return ids.slice().sort(function (x, y) {
      var X = table[x], Y = table[y];
      return (Y.pts - X.pts) || ((Y.gf - Y.ga) - (X.gf - X.ga)) || (Y.gf - X.gf) || (team(y).stars - team(x).stars);
    });
  }

  // single round robin (circle method): rounds of [home, away]
  function roundRobin(ids) {
    var list = ids.slice();
    if (list.length % 2) list.push(null);
    var n = list.length, rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var games = [];
      for (var i = 0; i < n / 2; i++) {
        var h = list[i], a = list[n - 1 - i];
        if (h && a) games.push(r % 2 ? [a, h] : [h, a]);
      }
      rounds.push(games);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  function pickRandom(pool, n, exclude) {
    var c = [];
    for (var i = 0; i < pool.length; i++) if (pool[i].id !== exclude) c.push(pool[i]);
    // stronger teams are more likely to be in a continental competition
    c.sort(function (a, b) { return (b.stars + Math.random() * 2.5) - (a.stars + Math.random() * 2.5); });
    var out = [];
    for (var k = 0; k < n && k < c.length; k++) out.push(c[k].id);
    return out;
  }

  function catsFor(type) {
    var all = NS.Teams.CATEGORIES, out = [];
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (type === 'LEAGUE' && c.type === 'LEAGUE') out.push(c);
      else if (type === 'CUP' && (c.type === 'LEAGUE' || c.type === 'CLUB')) out.push(c);
      else if (type === 'WORLDCUP' && c.type === 'NATIONAL') out.push(c);
    }
    return out;
  }

  function teamsOf(cats) {
    var out = [];
    for (var i = 0; i < cats.length; i++) out = out.concat(NS.Teams.byCategory(cats[i].id));
    return out;
  }

  function save() { MyPC.save('comp', state); }

  /* ---------------- knockout helpers ---------------- */

  function koPairs(ids) {
    var r = [];
    for (var i = 0; i < ids.length; i += 2) r.push({ a: ids[i], b: ids[i + 1], ga: -1, gb: -1, pa: -1, pb: -1, w: null });
    return r;
  }

  function settle(m, ga, gb) {
    m.ga = ga; m.gb = gb;
    if (ga !== gb) { m.w = ga > gb ? m.a : m.b; return; }
    var p = shootout(m.a, m.b);
    m.pa = p[0]; m.pb = p[1];
    m.w = p[0] > p[1] ? m.a : m.b;
  }

  function koNext(round) {
    var w = [];
    for (var i = 0; i < round.length; i++) w.push(round[i].w);
    return w.length > 1 ? koPairs(w) : null;
  }

  function resultLine(a, b, ga, gb, pa, pb) {
    return team(a).code + ' ' + ga + ' - ' + gb + ' ' + team(b).code + (pa >= 0 ? ' (' + pa + '-' + pb + ' ' + T('comp.pens') + ')' : '');
  }

  // plays every remaining CPU knockout round (after the player went out, or for the rest of the bracket)
  function finishBracket() {
    var ko = state.ko;
    while (true) {
      var cur = ko[ko.length - 1];
      for (var i = 0; i < cur.length; i++) if (!cur[i].w) { var s = simScore(cur[i].a, cur[i].b); settle(cur[i], s[0], s[1]); }
      var nx = koNext(cur);
      if (!nx) break;
      ko.push(nx);
    }
    var fin = ko[ko.length - 1][0];
    state.champion = fin.w;
    state.done = true;
  }

  /* ---------------- public ---------------- */

  NS.Comp = {
    TYPE: TYPE,
    catsFor: function (compType) { return catsFor(TYPE[compType]); },

    load: function () {
      var s = MyPC.load('comp', null);
      state = s && typeof s === 'object' && s.type && s.user && NS.Teams.byId(s.user).id === s.user ? s : null;
      return state;
    },
    saved: function () { return state; },
    // the competition is the one being played (menus and the end of a match look at this)
    active: function () { return !!state && World.session.compActive === true; },
    enter: function () { if (state) { World.session.compActive = true; World.session.compType = state.compType; World.session.sideMode = state.side; } },
    leave: function () { World.session.compActive = false; },
    abandon: function () { state = null; MyPC.save('comp', null); World.session.compActive = false; },

    start: function (compType, userId, sideMode) {
      var type = TYPE[compType];
      var user = team(userId);
      state = { type: type, compType: compType, user: userId, side: sideMode, round: 0, done: false, champion: null,
        last: [], msg: '' };
      if (type === 'LEAGUE') {
        var ids = [];
        var lt = NS.Teams.byCategory(user.cat);
        for (var i = 0; i < lt.length; i++) ids.push(lt[i].id);
        state.teams = ids;
        state.fixtures = roundRobin(shuffle(ids.slice()));
        state.table = {};
        for (var j = 0; j < ids.length; j++) state.table[ids[j]] = newRow();
      } else if (type === 'CUP') {
        var field = shuffle([userId].concat(pickRandom(teamsOf(catsFor('CUP')), 15, userId)));
        state.teams = field;
        state.ko = [koPairs(field)];
      } else {
        var nat = [userId].concat(pickRandom(teamsOf(catsFor('WORLDCUP')), 15, userId));
        var rest = shuffle(nat.slice(1));
        state.groups = [[userId, rest[0], rest[1], rest[2]], rest.slice(3, 7), rest.slice(7, 11), rest.slice(11, 15)];
        state.teams = nat;
        state.table = {};
        for (var k = 0; k < nat.length; k++) state.table[nat[k]] = newRow();
        state.gfix = [];
        for (var g = 0; g < 4; g++) {
          var rr = roundRobin(state.groups[g]);
          for (var r = 0; r < rr.length; r++) state.gfix[r] = (state.gfix[r] || []).concat(rr[r]);
        }
        state.stage = 'G';
      }
      World.session.compActive = true;
      World.session.compType = compType;
      World.session.sideMode = sideMode;
      save();
      return state;
    },

    // { home, away } of the player's next match, or null (finished or knocked out)
    nextMatch: function () {
      if (!state || state.done) return null;
      var list = null, u = state.user, i;
      if (state.type === 'LEAGUE') list = state.fixtures[state.round];
      else if (state.type === 'WORLDCUP' && state.stage === 'G') list = state.gfix[state.round];
      if (list) {
        for (i = 0; i < list.length; i++) if (list[i][0] === u || list[i][1] === u) return { home: list[i][0], away: list[i][1] };
        return null;
      }
      var cur = state.ko[state.ko.length - 1];
      for (i = 0; i < cur.length; i++) if (cur[i].a === u || cur[i].b === u) return { home: cur[i].a, away: cur[i].b };
      return null;
    },

    // label of the current stage ("Matchday 3 / 11", "Quarter-final"...)
    stageLabel: function () {
      if (!state) return '';
      if (state.done) return T('comp.over');
      if (state.type === 'LEAGUE') return T('comp.matchday') + ' ' + (state.round + 1) + ' / ' + state.fixtures.length;
      if (state.type === 'WORLDCUP' && state.stage === 'G') return T('comp.group') + ' - ' + T('comp.matchday') + ' ' + (state.round + 1) + ' / 3';
      return T(KO_NAMES[state.ko[state.ko.length - 1].length * 2] || 'comp.final');
    },

    // Sets up World.session for the player's next match (player's team = home side of the 3D match).
    prepareMatch: function () {
      var nm = this.nextMatch();
      if (!nm) return false;
      var s = World.session;
      s.homeTeamId = state.user;
      s.awayTeamId = nm.home === state.user ? nm.away : nm.home;
      s.sideMode = state.side;
      s.compType = state.compType;
      s.compActive = true;
      NS.Match.syncRosters();
      return true;
    },

    // The player's match ended gF - gA (full time). Plays the rest of the round, moves the competition on.
    recordUserMatch: function (gF, gA) {
      if (!state || state.done) return;
      var nm = this.nextMatch();
      if (!nm) return;
      var u = state.user, i, m, sc;
      var last = [];
      var userHome = nm.home === u;
      var gh = userHome ? gF : gA, ga = userHome ? gA : gF;

      if (state.type === 'LEAGUE' || (state.type === 'WORLDCUP' && state.stage === 'G')) {
        var games = state.type === 'LEAGUE' ? state.fixtures[state.round] : state.gfix[state.round];
        for (i = 0; i < games.length; i++) {
          var h = games[i][0], a = games[i][1];
          if (h === nm.home && a === nm.away) sc = [gh, ga]; else sc = simScore(h, a);
          addResult(state.table, h, a, sc[0], sc[1]);
          last.push(resultLine(h, a, sc[0], sc[1], -1, -1));
        }
        state.round++;
        state.msg = gF > gA ? T('comp.won') : (gF < gA ? T('comp.lost') : T('comp.drew'));
        if (state.type === 'LEAGUE' && state.round >= state.fixtures.length) {
          state.done = true;
          state.champion = sortTable(state.teams, state.table)[0];
        } else if (state.type === 'WORLDCUP' && state.round >= 3) {
          // groups done: winners and runners-up to the quarter-finals (A1-B2, B1-A2, C1-D2, D1-C2)
          var q = [];
          for (var g = 0; g < 4; g++) q.push(sortTable(state.groups[g], state.table));
          state.ko = [koPairs([q[0][0], q[1][1], q[1][0], q[0][1], q[2][0], q[3][1], q[3][0], q[2][1]])];
          state.stage = 'K';
          var through = false;
          for (var t = 0; t < 4; t++) if (q[t][0] === u || q[t][1] === u) through = true;
          if (!through) { finishBracket(); state.msg = T('comp.out_groups'); }
          else state.msg = T('comp.through');
        }
      } else {
        var cur = state.ko[state.ko.length - 1];
        for (i = 0; i < cur.length; i++) {
          m = cur[i];
          if (m.a === nm.home && m.b === nm.away) settle(m, gh, ga);
          else { sc = simScore(m.a, m.b); settle(m, sc[0], sc[1]); }
          last.push(resultLine(m.a, m.b, m.ga, m.gb, m.pa, m.pb));
        }
        var mine = null;
        for (i = 0; i < cur.length; i++) if (cur[i].a === u || cur[i].b === u) mine = cur[i];
        var pens = mine && mine.pa >= 0 ? ' (' + T('comp.pens') + ' ' + (mine.a === u ? mine.pa + '-' + mine.pb : mine.pb + '-' + mine.pa) + ')' : '';
        if (mine && mine.w !== u) {
          finishBracket();
          state.msg = T('comp.knocked') + pens;
        } else {
          var nx = koNext(cur);
          if (nx) { state.ko.push(nx); state.msg = T('comp.through') + pens; }
          else { state.done = true; state.champion = u; state.msg = pens; }
        }
      }
      state.last = last;
      if (state.done && state.champion === u) {
        NS.Storage.addResult(0, 0, 1);
        MyPC.submitScore(1000);
        state.msg = T('comp.champion');
      } else if (state.done && !state.msg) {
        state.msg = T('comp.over');
      }
      save();
    },

    state: function () { return state; },
    sortTable: function (ids) { return sortTable(ids, state.table); },
    koLabel: function (n) { return T(KO_NAMES[n] || 'comp.final'); }
  };
})(window.RS6 = window.RS6 || {});
