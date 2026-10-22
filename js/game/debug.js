/* Debug matches (Settings > Debug matches): CPU v CPU matches at full speed with every move counted, then a text report
 * (per-match averages for both teams, rates, a match log and anything that looked wrong) to copy and analyse.
 * The game code reports its events through NS.dbg(kind, team, value, extra), which is null outside a debug run; the
 * rest is read here by wrapping a few Actions functions and watching the ball each step. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var KICK = ['', 'pass', 'through_ball', 'long_ball', 'shot_driven', 'shot_curve', 'shot_chip'];
  var DEC = { '-2': 'clearance', '-1': 'dribble', 1: 'pass', 2: 'through_ball', 3: 'long_ball', 4: 'shot' };
  var RESTART = ['', 'free_kick', '', 'throw_in', 'corner', 'goal_kick', 'kick_off'];
  var CARD = ['verbal_warning', '', 'yellow_card', 'red_card'];
  var STEP = 1 / 60;
  var CHUNK = 600;     // at least this many simulation steps per slice,
  var SLICE_MS = 150;  // and about this long (the page stays responsive, the progress line moves)

  var run = null; // the run in progress

  // The next slice: a browser throttles setTimeout in a hidden or minimised tab (once a second, then once a minute),
  // so a tiny worker keeps the beat instead (a worker's timers and its messages are not throttled).
  var ticker = null, tickFns = {}, tickSeq = 0;
  try {
    ticker = new Worker(URL.createObjectURL(new Blob(
      ['onmessage=function(e){setTimeout(function(){postMessage(e.data[0])},e.data[1])}'], { type: 'text/javascript' })));
    ticker.onmessage = function (e) { var f = tickFns[e.data]; delete tickFns[e.data]; if (f) f(); };
  } catch (e) { ticker = null; }
  function later(fn, ms) {
    if (!ticker) { setTimeout(fn, ms || 0); return; }
    tickFns[++tickSeq] = fn;
    ticker.postMessage([tickSeq, ms || 0]);
  }

  function minute() { return Math.min(90, Math.floor(World.match.timeSeconds / 60) + 1); }
  function add(key, team, n) {
    var c = run.C[key];
    if (!c) { c = run.C[key] = [0, 0]; run.order.push(key); }
    c[team] += n === undefined ? 1 : n;
  }
  function note(text) {
    run.cur.anoms.push(minute() + "' " + text);
    run.anomCount[text.split(':')[0]] = (run.anomCount[text.split(':')[0]] || 0) + 1;
  }
  function sideName(t) { return run.cur.names[t]; }
  function goalX(team) { return team === 0 ? NS.PITCH_HALF_W : -NS.PITCH_HALF_W; }
  function bucket(d) { return d <= 12 ? '0-12m' : (d <= 20 ? '12-20m' : (d <= 28 ? '20-28m' : '28m+')); }

  // ---- events from the game code
  function onEvent(kind, team, value, extra) {
    if (!run || team === undefined || team < 0) return;
    if (kind === 'goal') {
      var sh = run.shot;
      var how = value.own ? 'own goal' : (sh && sh.team === team ? sh.desc : 'other');
      if (World.ball.pen) how = 'penalty';
      add('goals', team);
      if (value.own) add('goals_own_goal_for', team);
      else if (sh && sh.team === team) { add('shot_result_goal', team); add('shots_' + sh.bucket + '_goals', team); sh.done = true; run.shot = null; }
      run.cur.goals.push(value.mins + "' " + sideName(team) + ' ' + (value.who || '?') + ' (' + how + ')');
      return;
    }
    if (kind === 'cpu_decision') { add('cpu_decision_' + (DEC[value] || ('type' + value)), team); return; }
    if (kind === 'foul_committed') {
      add('fouls_committed', team);
      add('card_' + CARD[value], team);
      if (value) run.cur.cards.push(minute() + "' " + sideName(team) + ' ' + extra + ' ' + CARD[value]);
      return;
    }
    if (kind === 'restart_auto_played_10s') { add(kind + '_' + RESTART[value], team); note('restart not played in 10s: ' + RESTART[value] + ' ' + sideName(team)); return; }
    if (kind === 'restart_walkup_timeout') { add(kind, team); return; }
    if (kind.indexOf('gk_') === 0 && run.shot && run.shot.team !== team) {
      // the keeper dealt with the shot on its way
      if (kind === 'gk_catch') { add('shot_result_saved_caught', run.shot.team); run.shot = null; }
      else if (kind === 'gk_parry_wide_shot' || kind === 'gk_parry_central_shot') { add('shot_result_saved_parried', run.shot.team); run.shot = null; }
    }
    if (kind === 'shot_hit_outfield_player' && run.shot && run.shot.team !== team) { add('shot_result_blocked', run.shot.team); run.shot = null; }
    add(kind, team);
  }

  // ---- wrapped Actions functions (only during the run)
  var orig = {};
  function wrap() {
    var A = NS.Actions;
    orig.release = A.release; orig.controls = A.controls; orig.header = A.header; orig.startTackle = A.startTackle;
    orig.knockOff = A.knockOff; orig.oneTwo = A.oneTwo;
    A.release = function (p, type) {
      var m = World.match;
      var t = p.team;
      if (m.restart) add('restart_taken_' + RESTART[m.restart] + (m.restart === 1 && type >= ACT.SHOOT ? '_shot' : ''), t);
      if (p.role === 'GK') add('keeper_kicks_or_throws', t);
      add('kick_' + (KICK[type] || 'type' + type), t);
      var r = orig.release.apply(this, arguments);
      if (type >= ACT.SHOOT) {
        var dx = goalX(t) - p.pos.x, dz = p.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var b = bucket(d);
        add('shots', t);
        add('shots_' + b, t);
        run.shot = { team: t, bucket: b, desc: KICK[type].replace('shot_', '') + ' ' + Math.round(d) + 'm', age: 0 };
        run.pass = null;
      } else {
        run.pass = { team: t, type: KICK[type] || 'type' + type, age: 0, x: p.pos.x };
      }
      run.lastKick = { team: t, x: p.pos.x };
      return r;
    };
    A.controls = function (p) {
      var ok = orig.controls.apply(this, arguments);
      var intended = World.ball.receiver === p;
      add('first_touch_' + (intended ? 'intended_receiver_' : 'other_player_') + (ok ? 'controlled' : 'bad_touch'), p.team);
      return ok;
    };
    A.header = function (p, shot, type) {
      add(shot ? 'header_at_goal' : (type === ACT.LONG ? 'header_long' : 'header_pass'), p.team);
      run.headChain++;
      if (run.headChain === 3) { add('header_chains_3_or_more', p.team); note('header chain (3+ headers in a row)'); }
      var r = orig.header.apply(this, arguments);
      if (shot && run.shot) run.shot.desc = 'header ' + run.shot.desc.split(' ')[1];
      return r;
    };
    A.startTackle = function (p, c, human, slide) { add(slide ? 'slide_tackle_attempts' : 'tackle_attempts', p.team); return orig.startTackle.apply(this, arguments); };
    A.knockOff = function (p, hard) { if (!hard) add('ball_bounced_off_player', p.team); return orig.knockOff.apply(this, arguments); };
    A.oneTwo = function (p) { add('one_two_started', p.team); return orig.oneTwo.apply(this, arguments); };
    NS.dbg = onEvent;
  }
  function unwrap() {
    var A = NS.Actions;
    for (var k in orig) A[k] = orig[k];
    NS.dbg = null;
  }

  // ---- watching every step
  function watch() {
    var m = World.match, ball = World.ball, players = World.players;
    var o = ball.owner;
    var live = !m.setPieceTimer && !m.restart && !m.penalty && m.kickoffTimer <= 0 && m.celebrationTimer <= 0 && m.fullTimeTimer <= 0;
    // possession and where it is
    if (o) {
      add('possession_seconds', o.team, STEP);
      var a = o.team === 0 ? 1 : -1;
      var fx = o.pos.x * a; // from the half-way line towards the goal it attacks
      run.ownerZone = fx > NS.PITCH_HALF_W / 3 ? 'final_third' : (fx < -NS.PITCH_HALF_W / 3 ? 'own_third' : 'middle_third');
      add('ball_seconds_in_' + run.ownerZone, o.team, STEP);
      run.headChain = 0;
    }
    // turnovers and ping-pong (the ball changing teams again and again)
    var ot = o ? o.team : -1;
    if (ot >= 0 && ot !== run.lastOwnerTeam) {
      if (run.lastOwnerTeam >= 0) {
        add('ball_won_from_opponent', ot);
        add('ball_lost_in_' + run.ownerZone, run.lastOwnerTeam); // where the team that had it lost it
        // four changes of team within two real seconds: nobody can keep it (ping-pong)
        run.flips.push(run.cur.steps);
        while (run.flips.length && run.flips[0] < run.cur.steps - 120) run.flips.shift();
        if (run.flips.length >= 4) { add('turnover_ping_pong_4_in_2s', ot); run.flips.length = 0; }
      }
      run.lastOwnerTeam = ot;
    }
    // a pass on its way: who gets it
    var ps = run.pass;
    if (ps) {
      ps.age += STEP;
      if (o) {
        add('pass_' + ps.type + (o.team === ps.team ? '_completed' : '_intercepted'), ps.team);
        if (o.team === ps.team) {
          // how far up the pitch it moved the ball
          var gain = (o.pos.x - ps.x) * (ps.team === 0 ? 1 : -1);
          add(gain > 5 ? 'pass_completed_forward_5m_plus' : (gain < -3 ? 'pass_completed_backward' : 'pass_completed_square'), ps.team);
        }
        if (o.team === ps.team && o.offside) add('pass_' + ps.type + '_to_offside_player', ps.team);
        run.pass = null;
      } else if (m.setPieceTimer > 0 || m.celebrationTimer > 0) {
        add('pass_' + ps.type + '_out_of_play', ps.team);
        run.pass = null;
      } else if (ps.age > 8) { add('pass_' + ps.type + '_unresolved', ps.team); run.pass = null; }
    }
    // a shot: off target, blocked, rebound kept
    var sh = run.shot;
    if (sh) {
      sh.age += STEP;
      if (m.setPieceTimer > 0) {
        add(m.setPiece === 4 ? 'shot_result_out_for_corner' : (m.setPiece === 5 ? 'shot_result_off_target' : 'shot_result_other_stoppage'), sh.team);
        run.shot = null;
      } else if (o) {
        add(o.team === sh.team ? 'shot_result_rebound_kept' : (o.role === 'GK' ? 'shot_result_keeper_collected' : 'shot_result_cleared_by_defender'), sh.team);
        run.shot = null;
      } else if (sh.age > 5) { add('shot_result_unresolved', sh.team); run.shot = null; }
    }
    // the same player keeping the ball for a long time
    if (o && o === run.holder) {
      run.holdT += STEP;
      if (run.holdT > 12 && !run.holdNoted && live) { note('one player held the ball 12s+: ' + o.name + ' (' + o.role + ')'); run.holdNoted = true; }
    } else { run.holder = o; run.holdT = 0; run.holdNoted = false; }
    // ball stuck in open play
    var dx = ball.pos.x - run.stillX, dz = ball.pos.z - run.stillZ;
    if (!live || dx * dx + dz * dz > 0.25) { run.stillX = ball.pos.x; run.stillZ = ball.pos.z; run.stillT = 0; }
    else {
      run.stillT += STEP;
      if (run.stillT > 8 && run.stillT - STEP <= 8) note('ball did not move 8s in open play: owner ' + (o ? o.name : 'none'));
    }
    // positions that make no sense
    if (isNaN(ball.pos.x) || isNaN(ball.pos.z)) { note('ball position NaN'); run.broken = true; }
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (isNaN(p.pos.x) || isNaN(p.pos.z)) { note('player position NaN: ' + p.name); run.broken = true; break; }
      if ((Math.abs(p.pos.x) > NS.PITCH_HALF_W + 6 || Math.abs(p.pos.z) > NS.PITCH_HALF_H + 6) && run.cur.outside.indexOf(p) < 0) {
        run.cur.outside.push(p);
        note('player far outside the pitch: ' + p.name);
      }
      var sp = p.vel.x * p.vel.x + p.vel.z * p.vel.z;
      if (sp > 0.25) add('metres_run', p.team, Math.sqrt(sp) * STEP);
    }
  }

  // ---- the run
  function pickTeams() {
    var s = World.session;
    if (run.cfg.teams !== 'RANDOM') return [s.homeTeamId, s.awayTeamId];
    var all = NS.Teams.TEAMS;
    var a = all[Math.floor(Math.random() * all.length)].id, b = a;
    while (b === a) b = all[Math.floor(Math.random() * all.length)].id;
    return [a, b];
  }

  function startMatch() {
    var s = World.session;
    var ids = pickTeams();
    s.homeTeamId = ids[0];
    s.awayTeamId = ids[1];
    NS.Match.syncRosters();
    NS.Match.start();
    World.match.paused = true; // the page's own loop leaves it to us
    run.cur = {
      n: run.done + 1, names: [NS.Teams.byId(ids[0]).code, NS.Teams.byId(ids[1]).code],
      goals: [], cards: [], anoms: [], outside: [], steps: 0, ended: false
    };
    run.lastOwnerTeam = -1; run.ownerZone = 'middle_third'; run.flips = []; run.pass = null; run.shot = null; run.headChain = 0;
    run.holder = null; run.holdT = 0; run.stillT = 0; run.stillX = 0; run.stillZ = 0;
  }

  function endMatch() {
    var m = World.match, c = run.cur;
    var g0 = m.score[0], g1 = m.score[1];
    run.res.push([g0, g1]);
    add('matches_won', 0, g0 > g1 ? 1 : 0); add('matches_won', 1, g1 > g0 ? 1 : 0);
    add('matches_drawn', 0, g0 === g1 ? 1 : 0); add('matches_drawn', 1, g0 === g1 ? 1 : 0);
    var line = '#' + c.n + ' ' + c.names[0] + ' ' + g0 + '-' + g1 + ' ' + c.names[1];
    if (c.goals.length) line += ' | goals: ' + c.goals.join(', ');
    if (c.cards.length) line += ' | cards: ' + c.cards.join(', ');
    if (c.anoms.length) line += ' | ISSUES: ' + c.anoms.join('; ');
    run.log.push(line);
    run.done++;
  }

  function slice() {
    if (!run) return;
    if (run.stop) { finishRun(); return; }
    var m = World.match;
    var t0 = Date.now();
    for (var i = 0; i < CHUNK || Date.now() - t0 < SLICE_MS; i++) {
      if ((i & 255) === 0 && Date.now() - t0 > SLICE_MS * 2) break;
      if (!run.cur || run.cur.ended) {
        if (run.cur) endMatch();
        if (run.done >= run.cfg.matches) { finishRun(); return; }
        startMatch();
      }
      try {
        NS.Match.update(STEP);
        watch();
      } catch (e) {
        // a crash in the game code: logged with where it happened, the match is abandoned, the run goes on
        add('game_code_errors', 0);
        note('ERROR ' + String(e && e.stack || e).split(String.fromCharCode(10)).slice(0, 3).join(' <- '));
        run.broken = true;
      }
      run.cur.steps++;
      if (run.broken || run.cur.steps > 60 * 60 * 40) {
        if (!run.broken) note('match did not end (over 40 minutes real time)');
        run.broken = false;
        run.cur.ended = true;
        m.running = false;
      }
    }
    if (run.onProgress) run.onProgress(run.done, run.cfg.matches, m.timeSeconds / 60);
    later(slice);
  }

  function pct(a, b) { return b > 0 ? (100 * a / b).toFixed(0) + '%' : '-'; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function lpad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

  function report() {
    var cfg = run.cfg, n = Math.max(1, run.done), C = run.C;
    var get = function (k, t) { return C[k] ? C[k][t] : 0; };
    var sum = function (prefix, suffix, t) {
      var v = 0;
      for (var k in C) if (k.indexOf(prefix) === 0 && (!suffix || k.slice(-suffix.length) === suffix)) v += C[k][t];
      return v;
    };
    var out = [];
    var g0 = 0, g1 = 0, w0 = 0, w1 = 0, dr = 0;
    run.res.forEach(function (r) { g0 += r[0]; g1 += r[1]; if (r[0] > r[1]) w0++; else if (r[1] > r[0]) w1++; else dr++; });
    out.push('REAL SOCCER 6 DEBUG REPORT  v' + NS.VERSION + '  ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    out.push('matches ' + run.done + (run.done < cfg.matches ? ' (stopped, ' + cfg.matches + ' planned)' : '') + ' | ' + cfg.teamSize + ' a side | stadium ' + cfg.stadium +
      ' | ' + cfg.duration + ' min | teams ' + (cfg.teams === 'RANDOM' ? 'random' : run.firstNames.join(' v ')) +
      ' | HOME CPU ' + cfg.levels[0] + ' v AWAY CPU ' + cfg.levels[1] +
      ' | tactics home ' + World.session.tactics[0].join('-') + ' away ' + World.session.tactics[1].join('-') + ' (0 def 1 bal 2 att: defence-midfield-attack)');
    out.push('results: home won ' + w0 + ', drawn ' + dr + ', away won ' + w1 + ' | goals home ' + g0 + ' away ' + g1 +
      ' | ' + ((g0 + g1) / n).toFixed(2) + ' goals per match');
    out.push('');
    out.push('KEY RATES                                  HOME      AWAY');
    var rate = function (label, a0, b0, a1, b1) { out.push(pad(label, 40) + lpad(pct(a0, b0), 8) + lpad(pct(a1, b1), 10)); };
    var t;
    var poss = [get('possession_seconds', 0), get('possession_seconds', 1)];
    rate('possession', poss[0], poss[0] + poss[1], poss[1], poss[0] + poss[1]);
    ['pass', 'through_ball', 'long_ball'].forEach(function (k) {
      var c = [0, 1].map(function (t) { return get('pass_' + k + '_completed', t); });
      var all = [0, 1].map(function (t) { return sum('pass_' + k + '_', '', t) - get('pass_' + k + '_to_offside_player', t); });
      rate(k + ' completed', c[0], all[0], c[1], all[1]);
    });
    var on = [0, 1].map(function (t) { return get('shot_result_goal', t) + get('shot_result_saved_caught', t) + get('shot_result_saved_parried', t); });
    rate('shots on target', on[0], get('shots', 0), on[1], get('shots', 1));
    rate('shots scored', get('shot_result_goal', 0), get('shots', 0), get('shot_result_goal', 1), get('shots', 1));
    var tw = [0, 1].map(function (t) { return get('tackle_won', t) + get('slide_won', t); });
    var ta = [0, 1].map(function (t) { return get('tackle_attempts', t) + get('slide_tackle_attempts', t); });
    rate('tackles won (of attempts)', tw[0], ta[0], tw[1], ta[1]);
    var fo = [0, 1].map(function (t) { return sum('first_touch_', '_controlled', t); });
    var fa = [0, 1].map(function (t) { return sum('first_touch_', '', t); });
    rate('first touches controlled', fo[0], fa[0], fo[1], fa[1]);
    var ir = [0, 1].map(function (t) { return get('first_touch_intended_receiver_controlled', t); });
    var ia = [0, 1].map(function (t) { return sum('first_touch_intended_receiver_', '', t); });
    rate('  by the intended receiver', ir[0], ia[0], ir[1], ia[1]);
    var shw = [0, 1].map(function (t) { return get('shoulder_took_ball', t) + get('shoulder_knocked_loose', t); });
    var sha = [0, 1].map(function (t) { return sum('shoulder_', '', t); });
    rate('shoulder challenges won', shw[0], sha[0], shw[1], sha[1]);
    out.push('');
    out.push('EVERY COUNTER, PER MATCH                    HOME      AWAY    (totals home / away)');
    run.order.slice().sort().forEach(function (k) {
      var v = C[k];
      var isSec = k.indexOf('seconds') >= 0 || k === 'metres_run';
      out.push(pad(k, 44) + lpad((v[0] / n).toFixed(isSec ? 0 : 2), 8) + lpad((v[1] / n).toFixed(isSec ? 0 : 2), 10) +
        '    (' + (isSec ? Math.round(v[0]) : v[0]) + ' / ' + (isSec ? Math.round(v[1]) : v[1]) + ')');
    });
    out.push('');
    var akeys = Object.keys(run.anomCount);
    out.push('ISSUES SEEN: ' + (akeys.length ? akeys.map(function (k) { return k + ' x' + run.anomCount[k]; }).join(' | ') : 'none'));
    out.push('');
    out.push('MATCH LOG');
    for (t = 0; t < run.log.length; t++) out.push(run.log[t]);
    return out.join('\n');
  }

  var saved = null;
  function finishRun() {
    var m = World.match;
    var r = run;
    if (r.cur && !r.cur.ended && r.cur.steps > 0 && r.stop) r.log.push('#' + r.cur.n + ' stopped at ' + Math.floor(m.timeSeconds / 60) + "'");
    var text = report();
    unwrap();
    NS.Match.exitToMenu = saved.exit;
    // back to the player's settings, teams and sides
    var s = World.session, st = World.settings;
    st.stadium = saved.stadium; st.teamSize = saved.teamSize; st.durationMins = saved.duration;
    s.sideMode = saved.sideMode; s.homeTeamId = saved.home; s.awayTeamId = saved.away; s.compActive = saved.comp;
    World.levels = null;
    m.running = false;
    m.paused = true;
    NS.HUD.show(false);
    NS.HUD.hideBanner();
    NS.HUD.hideGoalFx();
    NS.Audio.setEnabled(st.soundEnabled);
    NS.Match.applySides();
    NS.Match.syncRosters();
    run = null;
    if (r.onDone) r.onDone(text);
  }

  NS.Debug = {
    running: function () { return !!run; },
    // cfg: { matches, levels: [home, away], teams: 'SELECTED' | 'RANDOM', teamSize, stadium, duration }
    start: function (cfg, onProgress, onDone) {
      if (run) return;
      var s = World.session, st = World.settings;
      saved = { stadium: st.stadium, teamSize: st.teamSize, duration: st.durationMins, sideMode: s.sideMode,
        home: s.homeTeamId, away: s.awayTeamId, comp: s.compActive, exit: NS.Match.exitToMenu };
      run = { cfg: cfg, C: {}, order: [], log: [], res: [], anomCount: {}, done: 0, cur: null, stop: false, broken: false,
        onProgress: onProgress, onDone: onDone,
        firstNames: [NS.Teams.byId(s.homeTeamId).code, NS.Teams.byId(s.awayTeamId).code] };
      st.stadium = cfg.stadium; st.teamSize = cfg.teamSize; st.durationMins = cfg.duration;
      s.sideMode = 'CPU_CPU';
      s.compActive = false;
      World.levels = cfg.levels;
      NS.Audio.setEnabled(false);
      NS.Audio.crowd(false);
      NS.Match.applySides();
      NS.Match.exitToMenu = function () { World.match.running = false; if (run && run.cur) run.cur.ended = true; };
      wrap();
      later(slice);
    },
    stop: function () { if (run) run.stop = true; },
    later: later
  };
})(window.RS6 = window.RS6 || {});
