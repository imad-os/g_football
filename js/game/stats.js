/* Match statistics for the full-time screen (like a TV channel's): possession, shots, xG, passes, fouls, cards, corners,
 * offsides, saves and the goals. Counted by a few calls from the game code (Actions.release / header, Match: takeBall,
 * the keeper's saves, fouls, restarts, goals); numbers only, nothing is allocated during play. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var KEYS = ['poss', 'shots', 'onT', 'xg', 'passes', 'passOk', 'fouls', 'yellow', 'red', 'corners', 'offsides', 'saves'];
  var c = {};
  for (var i = 0; i < KEYS.length; i++) c[KEYS[i]] = [0, 0];
  var goals = [];          // { team, who, mins, own, pen, clip }
  var shotTeam = -1;       // a shot on its way (it is on target when it goes in or the keeper saves it)
  var lastXg = 0;
  var passTeam = -1;       // a pass on its way (completed when a team-mate takes it)
  var possTeam = -1;       // the team that had the ball last (a loose ball is still theirs)
  var matchId = 0;

  // chance of a goal from where he shoots: the distance, and how much of the goal mouth he sees
  function xgOf(p) {
    var gx = NS.attack(p.team) * NS.PITCH_HALF_W;
    var dx = Math.abs(gx - p.pos.x), dz = p.pos.z, gw = NS.GOAL_HALF_W;
    var d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
    var ang = Math.atan2(gw - dz, dx) + Math.atan2(gw + dz, dx); // the goal mouth's angle from there
    var full = 2 * Math.atan2(gw, d);                             // the same, straight in front of the goal
    var v = 1 / (1 + Math.exp(-(1.1 - 0.13 * d))) * Math.pow(Math.max(0.05, Math.min(1, ang / full)), 0.7);
    return Math.max(0.01, Math.min(0.92, v));
  }

  NS.Stats = {
    KEYS: KEYS,
    begin: function () {
      for (var k = 0; k < KEYS.length; k++) c[KEYS[k]][0] = c[KEYS[k]][1] = 0;
      goals = [];
      shotTeam = passTeam = possTeam = -1;
      matchId++;
    },
    id: function () { return matchId; },
    // a live step: who has the ball
    tick: function (dt) {
      var o = World.ball.owner;
      if (o) possTeam = o.team;
      if (possTeam >= 0) c.poss[possTeam] += dt;
    },
    // a kick (Actions.release): a shot, else a pass of some kind
    kick: function (p, isShot) {
      var m = World.match;
      if (isShot) {
        c.shots[p.team]++;
        lastXg = m.penalty && p === m.setTaker ? 0.7 : xgOf(p);
        c.xg[p.team] += lastXg;
        shotTeam = p.team;
        passTeam = -1;
      } else {
        c.passes[p.team]++;
        passTeam = p.team;
        shotTeam = -1;
      }
    },
    // the shot was a header: worth less than one struck with the foot
    headed: function () { if (shotTeam >= 0) { c.xg[shotTeam] -= lastXg * 0.4; lastXg *= 0.6; } },
    // somebody took the ball (Match: takeBall)
    gain: function (p) {
      if (passTeam >= 0 && p.team === passTeam) c.passOk[passTeam]++;
      passTeam = -1;
      if (p.role !== 'GK' || p.team === shotTeam) shotTeam = -1; // (a keeper's catch is counted by save)
    },
    // the keeper of `team` kept a shot out
    save: function (team) {
      c.saves[team]++;
      if (shotTeam === 1 - team) c.onT[shotTeam]++;
      shotTeam = -1;
    },
    goal: function (team, who, mins, own, pen) {
      if (!own) {
        if (shotTeam !== team) c.shots[team]++; // (it went in without a shot: a deflection, a pass that rolled in)
        c.onT[team]++;
      }
      shotTeam = passTeam = -1;
      goals.push({ team: team, who: who, mins: mins, own: own, pen: pen, clip: null });
      return goals[goals.length - 1];
    },
    foul: function (team, card) {
      c.fouls[team]++;
      if (card >= 2) c.yellow[team]++; // (a red is always a second yellow here)
      if (card === 3) c.red[team]++;
      passTeam = shotTeam = -1;
    },
    corner: function (team) { c.corners[team]++; },
    offside: function (team) { c.offsides[team]++; passTeam = -1; },
    out: function () { passTeam = shotTeam = -1; },
    get: function (key, team) { return c[key][team]; },
    goals: function () { return goals; },
    // possession of a team in % (0..100)
    possPct: function (team) {
      var a = c.poss[0], b = c.poss[1];
      return a + b > 0 ? Math.round(c.poss[team] * 100 / (a + b)) : 50;
    }
  };
})(window.RS6 = window.RS6 || {});
