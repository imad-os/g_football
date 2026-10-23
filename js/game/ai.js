/* CPU football brain.
 *
 * Team level (teamUpdate, once per step): phase (attack / defend / loose ball) and the moment of the game (build-up,
 * progression, final third, counter-attack, securing the ball, counter-pressing, the defensive block), counter-attacks
 * (when a won ball becomes one, with how many, when it is over: from the level, the Counter tactic, the score and the
 * time; the team caught open sprints back), game state
 * (urgency when losing late, caution when winning late), who presses (pressing triggers), who covers, man-marking near
 * the ball, the block's height and its lines, and the in-possession shape: players behind the ball (rest defence) and
 * the attackers spread over the five vertical lanes, staggered (wide high, half-spaces between the lines, the centre
 * on the last line). Nobody is ever sent off the pitch (every target is kept inside the lines).
 *
 * Player level (step):
 *   ball carrier  scores every option (dribble directions, short / through / long pass to each team-mate, shot) with
 *                 lane interception risk, space, progress and shot quality, then plays the best one (difficulty adds noise
 *                 and reaction time instead of only speed)
 *   attack        support angles near the carrier, runs in behind the last defender, width, stay level with the line
 *   defence       presser goal-side + jockey + timed tackle, cover behind the presser, goal-side markers blocking lanes,
 *                 a compact zonal block with one back line
 *   loose ball    the player who can reach the ball first (interception) goes for it, passes are read
 *   goalkeeper    angle positioning, reaction to shots, rushing out for through balls, distribution to a free player
 *
 * Everything works on numbers and pre-allocated arrays: no allocation in the simulation step.
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });
  var GOAL_HALF_W = NS.GOAL_HALF_W;

  // Difficulty = speed AND intelligence: reaction time, decision noise, pass accuracy, marking tightness, keeper.
  var PROFILES = {
    // (spread wide enough to feel: EASY is slow, late and loose; LEGEND is quick, sharp and has a great keeper)
    EASY: { iq: 0, speedMul: 0.86, react: 0.6, noise: 0.34, tackle: 0.28, tackleRate: 1.1, gkSave: 0.62, gkReact: 0.28, acc: 2.6, tight: 0.55, press2: false, shootBias: -0.06, chasers: 1 },
    NORMAL: { iq: 1, speedMul: 1.0, react: 0.32, noise: 0.12, tackle: 0.5, tackleRate: 2.0, gkSave: 0.7, gkReact: 0.22, acc: 1.4, tight: 0.85, press2: false, shootBias: 0, chasers: 1 },
    HARD: { iq: 2, speedMul: 1.06, react: 0.22, noise: 0.07, tackle: 0.6, tackleRate: 2.6, gkSave: 0.77, gkReact: 0.19, acc: 1.05, tight: 0.95, press2: true, shootBias: 0.02, chasers: 2 },
    LEGEND: { iq: 3, speedMul: 1.12, react: 0.14, noise: 0.03, tackle: 0.7, tackleRate: 3.2, gkSave: 0.84, gkReact: 0.16, acc: 0.8, tight: 1.05, press2: true, shootBias: 0.04, chasers: 2 }
  };

  var RUN_SPEED = 10.4;    // what the AI assumes a player covers per second when judging races to the ball
  var DRIBBLE_OFF = [0, 0.5, -0.5, 1.05, -1.05];
  var THRU_LEAD = [5, 9, 14]; // through balls: metres ahead of the runner
  var SUPPORT_ANG = [0.55, -0.55, 1.25, -1.25, 2.3, -2.3];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // The team's plan for a block (Game plan > Tactics): -1 defensive, 0 balanced, +1 attacking.
  // block 0 = defence, 1 = midfield, 2 = attack
  function moodOf(t, block) {
    var tac = World.session.tactics;
    return tac && tac[t] ? tac[t][block] - 1 : 0;
  }
  function mood(p) { return moodOf(p.team, p.role === 'DEF' ? 0 : (p.role === 'MID' ? 1 : 2)); }
  // the Counter tactic (Game plan): 0 rarely, 1 when it is on (default), 2 always
  function counterPlan(t) {
    var tac = World.session.tactics;
    var v = tac && tac[t] ? tac[t][3] : undefined;
    return v === undefined ? 1 : v;
  }

  // the moment of the game (a team's plan for it)
  var M_LOOSE = 0, M_BUILD = 1, M_PROG = 2, M_FINAL = 3, M_COUNTER = 4, M_SECURE = 5, M_CPRESS = 6, M_BLOCK = 7;
  var MOMENT_NAMES = ['loose', 'build_up', 'progression', 'final_third', 'counter_attack', 'secure', 'counter_press', 'block'];
  var B_HIGH = 0, B_MID = 1, B_LOW = 2;
  var BLOCK_NAMES = ['high_press', 'mid_block', 'low_block'];
  // what each level understands (iq 0 Easy .. 3 Legend): how often the shape is worked out again, how many press right
  // after losing it and for how long
  var RETARGET = [0.6, 0.45, 0.35, 0.3];
  var CP_N = [0, 1, 2, 3];
  var CP_T = [0, 2, 2.5, 3];
  var EDGE = 0.8; // no target closer than this to a line

  function makeTeam() {
    return {
      phase: 0,          // 1 attack (we have the ball), 2 defend, 0 loose
      moment: M_LOOSE, block: B_MID, has: false, wonT: 99, lostT: 99, iq: 1,
      cntLevel: 0, cntT: 0, cntBest: 0, cntStall: 0, // a counter-attack: 0 none, 1 a quick break, 2 everyone
      trigT: 0, switchT: 0, pressN: 1, press3: null, shapeT: 0, lastOwner: null, oppMidX: 0,
      urgency: 0,        // 0..1: losing late, take more risks
      caution: 0,        // 0..1: winning late, keep the ball
      presser: null, cover: null, chaser: null, chaser2: null, chaseT: 99,
      sup1: null, sup2: null,
      lineX: 0,          // our back line (x)
      lastX: 0,          // x of our deepest outfield player (the opponents' "offside" line)
      markT: 0,
      gk: null
    };
  }
  var TEAMS = [makeTeam(), makeTeam()];

  // scratch for interception results and marking (pre-allocated)
  var ICX = 0, ICZ = 0;
  var OPP = [null, null, null, null, null, null, null, null, null, null, null];
  var DNG = new Float64Array(11);
  var ZX = 0, ZZ = 0; // zoneSpot result

  /* ------------------------------------------------------------------ helpers */

  function attackOf(p) { return NS.attack(p.team); }

  function keepX(x) { return clamp(x, -HALF_W + EDGE, HALF_W - EDGE); }
  function keepZ(z) { return clamp(z, -HALF_H + EDGE, HALF_H - EDGE); }

  // every AI target is inside the pitch: nobody runs over a line (a ball going out is let go at the line)
  function moveToward(p, tx, tz, speed, dt) {
    tx = keepX(tx); tz = keepZ(tz);
    var dx = tx - p.pos.x;
    var dz = tz - p.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var k = Math.min(1, 10 * dt);
    if (d > 0.6) {
      var s = d < 2.5 ? speed * (0.45 + d * 0.22) : speed; // slow down on arrival instead of overshooting
      p.vel.x += (dx / d * s - p.vel.x) * k;
      p.vel.z += (dz / d * s - p.vel.z) * k;
      p.facing = Math.atan2(dx, dz);
    } else {
      p.vel.x *= 0.8;
      p.vel.z *= 0.8;
      var ball = World.ball;
      p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
    }
  }

  // distance from (x, z) to the nearest player of the other team than `team`
  function oppDist(x, z, team) {
    var best = 1e9;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === team) continue;
      var dx = o.pos.x - x;
      var dz = o.pos.z - z;
      var d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // distance from (x, z) to the nearest team-mate of `team` other than `skip`
  function mateDist(x, z, team, skip) {
    var best = 1e9;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team !== team || o === skip || o.role === 'GK') continue;
      var dx = o.pos.x - x;
      var dz = o.pos.z - z;
      var d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // earliest time an opponent of `team` can be at (x, z)
  function oppArrival(x, z, team) {
    return Math.max(0, oppDist(x, z, team) - 1) / RUN_SPEED + 0.12;
  }

  // Probability that a ball played from (x0, z0) to (x1, z1) at `speed` is cut out by `team`'s opponents.
  function laneRisk(x0, z0, x1, z1, team, speed, lofted) {
    var dx = x1 - x0;
    var dz = z1 - z0;
    var L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.1) return 0;
    var ux = dx / L;
    var uz = dz / L;
    var risk = 0;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === team || o.stun > 0) continue;
      var rx = o.pos.x - x0;
      var rz = o.pos.z - z0;
      var u = rx * ux + rz * uz;
      if (u < 0.8 || u > L + 1.5) continue;
      if (lofted && u < L * 0.78) continue; // a lofted ball can only be won where it lands
      var perp = Math.abs(rx * uz - rz * ux);
      if (perp > 9) continue;
      var tBall = u / (speed * 0.82);
      // he has to see it, react and get going (not at full sprint from the first step)
      var tOpp = Math.max(0, perp - 1.2) / (RUN_SPEED * 0.85) + 0.2;
      var r = 1 / (1 + Math.exp(-(tBall - tOpp) * 6));
      // a marker at (or behind) the receiver: the receiver comes to meet it and gets there first more often than not
      if (u > L - 2) r *= 0.55;
      if (r > risk) risk = r;
    }
    return risk;
  }

  // 0..~1: how good a shot from (x, z) is for `team` (goal angle, distance, blockers, keeper)
  function shotQuality(x, z, team) {
    var a = NS.attack(team);
    var goalX = a * HALF_W;
    var dx = Math.abs(goalX - x);
    if (dx < 1) dx = 1;
    var ang = Math.abs(Math.atan2(GOAL_HALF_W - z, dx) - Math.atan2(-GOAL_HALF_W - z, dx));
    var dist = Math.sqrt(dx * dx + z * z);
    var q = ang * Math.exp(-dist / 22) * 1.4;
    var lx = goalX - x;
    var lz = -z;
    var ll = Math.sqrt(lx * lx + lz * lz) || 1;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === team || o.stun > 0) continue;
      var ox = o.pos.x - x;
      var oz = o.pos.z - z;
      var u = (ox * lx + oz * lz) / ll;
      if (u < 0.5 || u > ll) continue;
      var perp = Math.abs(ox * lz - oz * lx) / ll;
      if (o.role === 'GK') { if (perp < 1.3) q *= 0.8; }
      else if (perp < 1.5) q *= 0.55;
    }
    return q;
  }

  // The offside line `team` attacks against (x): the second-last opponent (O.lastX: their deepest outfield player),
  // or the ball when it is further forward, and never inside our own half.
  function offLine(team, ball) {
    var a = NS.attack(team);
    var O = TEAMS[1 - team];
    return a * Math.max(O.lastX * a, ball.pos.x * a, 0);
  }

  // p stands in an offside position right now
  function offsideNow(p, ball) {
    var a = NS.attack(p.team);
    return p.pos.x * a > offLine(p.team, ball) * a + 0.2;
  }

  // Defensive shape (we do not have the ball): one back line, the midfield a few metres in front of it, the forwards
  // further up, everybody shifted towards the ball's side and squeezed narrow. Sets ZX / ZZ.
  // The block is compact: the lines a fixed gap apart (a high press a little longer, a low block shorter), so the team is
  // about 25-30 m long whatever the ball does; the forwards stand in front of the opponents' midfield (their cover
  // shadow on the passes into it). Easy keeps the older, looser spacing.
  var GAPS = [[10, 12], [9, 10], [7, 9]]; // [def-mid, mid-fwd] per block
  function zoneSpot(p, T, ball) {
    var a = attackOf(p);
    var depth = (ball.pos.x - T.lineX) * a; // how far the ball is in front of our line
    var x;
    if (T.iq === 0) {
      if (p.role === 'DEF') x = T.lineX;
      else if (p.role === 'MID') x = T.lineX + a * (clamp(depth * 0.5, 5, 13) + moodOf(p.team, 1) * 2);
      else x = T.lineX + a * (clamp(depth * 0.85, 14, 30) + moodOf(p.team, 2) * 4);
    } else {
      var g = GAPS[T.block];
      if (p.role === 'DEF') x = T.lineX;
      else if (p.role === 'MID') x = T.lineX + a * clamp(depth * 0.6, 6, g[0]);
      else x = T.lineX + a * clamp(depth * 0.9, g[0] + 4, g[0] + g[1] + moodOf(p.team, 2) * 3);
    }
    ZX = clamp(x, -HALF_W + 4, HALF_W - 4);
    // narrow and shifted to the ball's side (the far side tucks in; forwards close the middle)
    var kz = p.role === 'FWD' ? 0.5 : 0.7;
    ZZ = clamp(p.homeZ * kz + ball.pos.z * 0.33, -HALF_H + 3, HALF_H - 3);
  }

  // Earliest time `p` can reach the ball (the ball's own physics: flight, bounce, curl, roll). Sets ICX / ICZ.
  function interceptTime(p, speed, reachY) {
    var t = World.intercept(p, speed, reachY);
    ICX = World.icX;
    ICZ = World.icZ;
    return t;
  }

  /* ------------------------------------------------------------------ team brain */

  function assignMarks(t, T) {
    var players = World.players;
    var a = NS.attack(t);
    var ownGoalX = -a * HALF_W;
    var carrier = World.ball.owner;
    var n = 0, i, j;
    for (i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.team === t) { p.mark = null; continue; }
      if (p.role === 'GK' || p === carrier || n >= 11) continue;
      if ((p.pos.x - ownGoalX) * a > 42 - moodOf(t, 0) * 6) continue; // far from our goal: covered by the zone, not man-marked
      OPP[n] = p;
      DNG[n] = -Math.abs(p.pos.x - ownGoalX) - Math.abs(p.pos.z) * 0.3; // closer to our goal and central = more dangerous
      n++;
    }
    // most dangerous first (insertion sort, no allocation)
    for (i = 1; i < n; i++) {
      var op = OPP[i], dv = DNG[i];
      j = i - 1;
      while (j >= 0 && DNG[j] < dv) { OPP[j + 1] = OPP[j]; DNG[j + 1] = DNG[j]; j--; }
      OPP[j + 1] = op; DNG[j + 1] = dv;
    }
    for (i = 0; i < n; i++) {
      var o = OPP[i];
      var best = null, bestD = 1e9;
      for (j = 0; j < players.length; j++) {
        var d = players[j];
        if (d.team !== t || d.role === 'GK' || d.mark || d === T.presser || d === T.cover || d.isCtl) continue;
        // forwards only pick up opponents in their own half of the pitch
        if (d.role === 'FWD' && (o.pos.x * a) < -10) continue;
        // the man is picked up by the player whose place in the shape is near him (nobody is dragged across)
        zoneSpot(d, T, World.ball);
        var zx = ZX - o.pos.x, zz = ZZ - o.pos.z;
        if (zx * zx + zz * zz > (T.iq ? 196 : 400)) continue; // (a man is picked up only in the player's own zone)
        var dx = d.pos.x - o.pos.x, dz = d.pos.z - o.pos.z;
        var dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) best.mark = o;
    }
  }

  function teamUpdate(dt, profs) {
    var ball = World.ball;
    var players = World.players;
    var owner = ball.owner;
    var m = World.match;
    var mins = m.timeSeconds / 60;
    for (var t = 0; t < 2; t++) {
      var T = TEAMS[t];
      var a = NS.attack(t);
      T.iq = profs && profs[t] && profs[t].iq !== undefined ? profs[t].iq : 1;
      T.phase = owner ? (owner.team === t ? 1 : 2) : 0;
      // who had it last (a loose ball keeps the moment of the team that played it)
      if (owner && owner.team === t && !T.has) {
        T.has = true; T.wonT = 0; T.shapeT = 0;
        // the score and the time first (the counter decision depends on them)
        var df0 = m.score[t] - m.score[1 - t];
        T.urgency = df0 < 0 ? clamp((mins - 45) / 40, 0, 1) * (df0 < -1 ? 1 : 0.75) : 0;
        T.caution = df0 > 0 ? clamp((mins - 55) / 35, 0, 1) : 0;
        T.cntLevel = counterDecide(t, T, owner);
        T.cntT = 0; T.cntStall = 0; T.cntBest = owner.pos.x * a;
        if (T.cntLevel) {
          if (owner.aiCd > 0.12) owner.aiCd = 0.12; // the first pass goes quickly
          if (NS.dbg) NS.dbg(T.cntLevel === 2 ? 'counter_attack_started_everyone' : 'counter_attack_started_quick_break', t);
        }
      } else if (owner && owner.team !== t && T.has) {
        T.has = false; T.lostT = 0;
        if (T.cntLevel && NS.dbg) NS.dbg('counter_attack_end_ball_lost', t);
        T.cntLevel = 0;
      }
      T.wonT += dt; T.lostT += dt;
      // a counter lives while the ball keeps going forward; it ends when it stalls, after 10 s, or (Hard and Legend)
      // when they have got enough men back
      if (T.has && T.cntLevel) {
        T.cntT += dt;
        var cbx = ball.pos.x * a;
        if (cbx > T.cntBest + 1) { T.cntBest = cbx; T.cntStall = 0; } else T.cntStall += dt;
        var why = '';
        if (T.cntStall > (T.iq >= 2 ? 1.8 : 2.5)) why = 'stalled';
        else if (T.cntT > 10) why = 'time';
        else if (T.iq >= 2 && T.cntT > (T.cntLevel === 2 ? 1.5 : 2.5) && counterClosed(t, T.cntLevel === 2 ? 2 : 3)) why = 'they_got_back';
        if (why) { T.cntLevel = 0; if (NS.dbg) NS.dbg('counter_attack_end_' + why, t); }
      }
      if (T.trigT > 0) T.trigT -= dt;
      if (T.switchT > 0) T.switchT -= dt;
      var diff = m.score[t] - m.score[1 - t];
      T.urgency = diff < 0 ? clamp((mins - 45) / 40, 0, 1) * (diff < -1 ? 1 : 0.75) : 0;
      T.caution = diff > 0 ? clamp((mins - 55) / 35, 0, 1) : 0;
      T.presser = null; T.cover = null; T.press3 = null; T.chaser = null; T.chaser2 = null; T.chaseT = 99;
      T.sup1 = null; T.sup2 = null;

      var deepest = 1e9;
      var i, p, best1 = null, best2 = null, best3 = null, d1 = 1e9, d2 = 1e9, d3 = 1e9;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.team !== t) continue;
        if (p.role === 'GK') { T.gk = p; continue; }
        var depth = p.pos.x * a;
        if (depth < deepest) { deepest = depth; T.lastX = p.pos.x; }
        if (p.isCtl || p.stun > 0) continue;
        var dd;
        if (T.phase === 0) {
          dd = interceptTime(p, RUN_SPEED, 1.9);
          p.icX = ICX; p.icZ = ICZ;
        } else if (T.phase === 2) {
          var cx = owner.pos.x - p.pos.x, cz = owner.pos.z - p.pos.z;
          dd = cx * cx + cz * cz;
        } else {
          // the forwards stay up on the last line (they are not the ones who come short to help)
          if (p === owner || p.role === 'FWD') continue;
          var sx = owner.pos.x - p.pos.x, sz = owner.pos.z - p.pos.z;
          dd = sx * sx + sz * sz;
        }
        if (dd < d1) { d3 = d2; best3 = best2; d2 = d1; best2 = best1; d1 = dd; best1 = p; }
        else if (dd < d2) { d3 = d2; best3 = best2; d2 = dd; best2 = p; }
        else if (dd < d3) { d3 = dd; best3 = p; }
      }
      if (T.phase === 0) { T.chaser = best1; T.chaser2 = best2; T.chaseT = d1; }
      else if (T.phase === 2) { T.presser = best1; T.cover = best2; T.press3 = best3; }
      else { T.sup1 = best1; T.sup2 = best2; }

      momentOf(t, T, owner);
      var dm = moodOf(t, 0);
      var lx;
      if (T.iq === 0) {
        // back line: follows the ball, never deeper than 7 from our goal, higher when chasing the game
        lx = ball.pos.x - a * (15 - T.urgency * 4 + T.caution * 3 - dm * (dm > 0 ? 3 : 2));
        var deepLimit = -a * (HALF_W - 7 - (dm > 0 ? dm * 3 : 0));
        if ((lx - deepLimit) * a < 0) lx = deepLimit;
        if ((lx * a) > 8 + dm * 6) lx = a * (8 + dm * 6);
      } else {
        // the block's back line: a high press squeezes up to their half, a mid block holds around our half, a low
        // block protects the box; it steps up when the press is triggered
        var bxa = ball.pos.x * a, lo, hi, behind;
        if (T.block === B_HIGH) { behind = 13; lo = -HALF_W + 18; hi = HALF_W * 0.22; }
        else if (T.block === B_MID) { behind = 17; lo = -HALF_W + 14; hi = -HALF_W * 0.08; }
        else { behind = 13; lo = -HALF_W + 7; hi = -HALF_W + 24; }
        if (T.trigT > 0 && T.block !== B_LOW) { behind -= 4; hi += 6; }
        lx = a * clamp(bxa - behind, lo, hi);
      }
      T.lineX = lx;

      T.markT -= dt;
      if (T.phase === 2 && T.markT <= 0) { T.markT = 0.35; assignMarks(t, T); }
      if (T.phase === 1) {
        for (i = 0; i < players.length; i++) if (players[i].team === t) players[i].mark = null;
      }
      // the in-possession shape (worked out a few times a second, not every step)
      T.shapeT -= dt;
      if (T.has && T.shapeT <= 0) { T.shapeT = RETARGET[T.iq]; shapeUp(t, T); }
      if (NS.dbg) NS.dbg('moment_seconds', t, dt, MOMENT_NAMES[T.moment] + (T.moment === M_BLOCK ? '_' + BLOCK_NAMES[T.block] : ''));
    }
  }

  // Just won it: a counter-attack? 0 no, 1 a quick break (the forwards and the most advanced run, the rest keeps its
  // place), 2 everyone but the last two or three. "Cut": we broke up their attack (won it in our half, or a good part of
  // their team is in our half). "Open": the share of their outfield players still goal-side of the ball.
  //  Easy     a quick break (the forwards run) when we break up their attack and they are not all back
  //  Normal   the standard: every attack of theirs we break up turns into a counter with everyone
  //  Hard /   only when it is on, with as many as it deserves
  //  Legend
  // The Counter tactic sets how readily (rarely / when it is on / always); losing pushes towards always (all in when
  // losing late), winning late towards rarely and fewer runners (the others keep the lead safe).
  var OPEN_MAX = [0.4, 0.6, 0.8];
  function counterDecide(t, T, c) {
    var a = NS.attack(t), players = World.players, behind = 0, inOurHalf = 0, out = 0;
    var cx = c.pos.x * a;
    if (cx > HALF_W * 0.45) return 0; // already near their box: a normal attack
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === t || o.role === 'GK') continue;
      out++;
      if ((o.pos.x - c.pos.x) * a > 0) behind++;
      if (o.pos.x * a < 0) inOurHalf++;
    }
    if (!out) return 0;
    var open = behind / out;
    var cut = cx < HALF_W * 0.15 || inOurHalf >= out * 0.4;
    var plan = counterPlan(t);
    var sv = clamp(plan + (T.urgency > 0.25 ? 1 : 0) - (T.caution > 0.5 ? 1 : 0), 0, 2);
    var iq = T.iq, lv;
    if (iq === 0) return sv >= 1 && cut && open <= 0.75 ? 1 : 0;
    if (iq === 1) {
      if (sv === 0) lv = open <= 0.4 ? 2 : 0;
      else lv = cut || open <= 0.5 ? 2 : 0;
    } else {
      if (!cut && sv < 2) return 0;
      if (open > OPEN_MAX[sv]) return 0;
      lv = open <= OPEN_MAX[sv] * 0.6 || T.urgency > 0.5 || sv === 2 ? 2 : 1;
    }
    if (lv === 2 && T.caution > 0.5 && plan < 2) lv = 1; // winning late: a few go, the rest stays
    return lv;
  }

  // they have got enough men back: more of them goal-side of the ball than our players up there (plus a margin: two\n  // on a counter with everyone, three on a quick break, which only ever has a few)
  function counterClosed(t, margin) {
    var a = NS.attack(t), players = World.players, bx = World.ball.pos.x, them = 0, us = 0;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.role === 'GK') continue;
      var ahead = (o.pos.x - bx) * a;
      if (o.team === t) { if (ahead > -2) us++; } else if (ahead > 0) them++;
    }
    return them >= us + margin;
  }

  function momentOf(t, T, owner) {
    var a = NS.attack(t), ball = World.ball, iq = T.iq;
    var bx = ball.pos.x * a;
    // the block: from the plan (Game plan > Tactics, defence), the score and the time (Hard and Legend); Easy and
    // Normal always defend in a mid block
    var dm = moodOf(t, 0), b = B_MID;
    if (iq >= 2) {
      b = dm < 0 ? B_LOW : (dm > 0 ? B_HIGH : B_MID);
      if (T.urgency > 0.5) b = B_HIGH;
      else if (T.caution > 0.5) b = b === B_HIGH ? B_MID : B_LOW;
    }
    T.block = b;
    // pressing triggers (Hard and Legend): a pass back, the carrier facing his own goal, the ball near the touchline,
    // the keeper on the ball (high press only)
    if (owner && owner.team !== t && iq >= 2 && b !== B_LOW) {
      var ca = NS.attack(owner.team);
      var back = T.lastOwner && T.lastOwner !== owner && T.lastOwner.team === owner.team && (owner.pos.x - T.lastOwner.pos.x) * ca < -5;
      var facing = Math.sin(owner.facing) * ca < -0.55;
      var wide = Math.abs(owner.pos.z) > HALF_H - 7;
      var keeper = owner.role === 'GK' && b === B_HIGH;
      if ((back || facing || wide || keeper) && T.trigT <= 0) {
        T.trigT = 1.8;
        if (NS.dbg) NS.dbg('press_trigger', t);
      }
    }
    if (owner) T.lastOwner = owner;
    // how many press the carrier
    var mm = moodOf(t, 1);
    T.pressN = 1;
    if (T.trigT > 0) T.pressN = 2;
    if (!T.has && T.lostT < CP_T[iq] && CP_N[iq] > 1) T.pressN = Math.max(T.pressN, CP_N[iq] + (mm < 0 ? -1 : 0));
    if (mm > 0 && iq >= 1 && bx > -HALF_W * 0.2) T.pressN++;
    // the ball near our box: a second man closes the shooter down (Normal and up)
    if (iq >= 1 && owner && owner.team !== t) {
      var gdx = owner.pos.x + a * HALF_W, gdz = owner.pos.z;
      if (gdx * gdx + gdz * gdz < 900) T.pressN = Math.max(T.pressN, 2);
    }
    if (T.has) {
      if (T.cntLevel) T.moment = M_COUNTER;
      else if (T.wonT < 1.2 && iq >= 1) T.moment = M_SECURE;
      else T.moment = bx < -HALF_W / 3 ? M_BUILD : (bx > HALF_W / 3 ? M_FINAL : M_PROG);
    } else {
      T.moment = T.lostT < CP_T[iq] ? M_CPRESS : M_BLOCK;
    }
  }

  /* ------------------------------------------------------------------ in-possession shape */

  // Who stays behind the ball (rest defence: a back tier of up to three, the far-side full-back tucked in, plus one or two
  // pivots in front of them) and where everyone else goes: the attackers spread over the five vertical lanes (wide
  // players hold the touchline lanes), staggered (the half-spaces between the opponents' lines, the centre and the
  // wings on their last line), the ball side a little overloaded and the far winger left wide for the switch.
  // Sets p.slX / p.slZ (the place in the shape) and p.slRest for every outfield player of the team.
  var SH_P = [], SH_A = [], SH_R = [], SH_V = [], SH_L = []; // (reused: no allocation)
  function byHomeZ(u, v) { return u.homeZ - v.homeZ; }
  function shapeUp(t, T) {
    var a = NS.attack(t), ball = World.ball, players = World.players;
    var bxA = ball.pos.x * a, bz = ball.pos.z;
    var i, j, p, n = 0;
    SH_P.length = 0; SH_A.length = 0; SH_R.length = 0;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.team !== t || p.role === 'GK') continue;
      SH_P.push(p); p.slRest = 0; p.slPick = false; p.cntRun = 0; n++;
    }
    if (n < 3) return;
    var am = moodOf(t, 2), dm = moodOf(t, 0), M = T.moment;
    // how many stay behind the ball
    var rest;
    if (T.iq === 0) { rest = 0; for (i = 0; i < n; i++) if (SH_P[i].role === 'DEF') rest++; rest = clamp(rest, 1, n - 2); }
    else {
      rest = n >= 8 ? 5 : (n >= 5 ? 3 : 1); // (11-a-side 3+2; 7-a-side 2+1)
      rest += (dm < 0 ? 1 : 0) + (am < 0 ? 1 : 0) - (am > 0 ? 1 : 0) - (T.urgency > 0.5 ? 1 : 0) + (T.caution > 0.5 ? 1 : 0);
      // a counter with everyone: only the last two (Normal) or three (Hard, Legend) stay; 7-a-side two (one when losing late)
      if (M === M_COUNTER && T.cntLevel === 2) {
        rest = (n >= 8 ? 2 + (T.iq >= 2 ? 1 : 0) : 2) + (T.caution > 0.5 ? 1 : 0) - (T.urgency > 0.5 ? 1 : 0);
      }
      rest = clamp(rest, 1, n - 2);
    }
    var back = rest >= 6 ? 4 : (rest >= 4 ? 3 : rest);
    var piv = rest - back;
    // the back tier: defenders, central first, then the full-back on the far side from the ball
    for (j = 0; j < back; j++) {
      var bp = null, bs = 1e9;
      for (i = 0; i < n; i++) {
        p = SH_P[i];
        if (p.slPick) continue;
        var sc = (p.role === 'DEF' ? 0 : (p.role === 'MID' ? 100 : 200)) + Math.abs(p.homeZ) + (p.homeZ * bz > 0 ? 6 : 0) - p.homeX * a * 0.1;
        if (sc < bs) { bs = sc; bp = p; }
      }
      bp.slPick = true; bp.slRest = 1; SH_R.push(bp);
    }
    // the pivots: the deepest midfielders
    var pivs = SH_V;
    pivs.length = 0;
    for (j = 0; j < piv; j++) {
      var pp = null, ps = 1e9;
      for (i = 0; i < n; i++) {
        p = SH_P[i];
        if (p.slPick) continue;
        var sc2 = (p.role === 'MID' ? 0 : (p.role === 'DEF' ? 50 : 100)) + p.homeX * a + Math.abs(p.homeZ) * 0.3;
        if (sc2 < ps) { ps = sc2; pp = p; }
      }
      pp.slPick = true; pp.slRest = 2; pivs.push(pp);
    }
    for (i = 0; i < n; i++) if (!SH_P[i].slPick) SH_A.push(SH_P[i]);

    // rest defence spots
    var backA = clamp(bxA - (M === M_BUILD ? 8 : 18), -HALF_W + 12, HALF_W * 0.2);
    var wb = (M === M_BUILD ? 0.55 : 0.38) * HALF_H;
    SH_R.sort(byHomeZ);
    for (j = 0; j < SH_R.length; j++) {
      p = SH_R[j];
      var k = SH_R.length;
      p.slX = a * backA;
      p.slZ = (k === 1 ? 0 : -wb + 2 * wb * j / (k - 1)) + bz * 0.15;
    }
    pivs.sort(byHomeZ);
    for (j = 0; j < pivs.length; j++) {
      p = pivs[j];
      var kp = pivs.length;
      p.slX = a * (backA + (M === M_BUILD ? 8 : 10));
      p.slZ = (kp === 1 ? 0 : (-0.3 + 0.6 * j / (kp - 1)) * HALF_H) + bz * 0.3;
    }

    // the attackers over the lanes
    var lineA = offLine(t, ball) * a, lim = Math.min(lineA - 0.8, HALF_W - 6);
    var omid = 0, on = 0;
    for (i = 0; i < players.length; i++) if (players[i].team !== t && players[i].role === 'MID') { omid += players[i].pos.x * a; on++; }
    var oppMidA = on ? omid / on : lineA - 14;
    if (oppMidA > lineA - 6) oppMidA = lineA - 6;
    var between = clamp((lineA + oppMidA) / 2, -HALF_W + 12, lim);
    if (M === M_COUNTER && T.cntLevel) counterRunners(T, a, bxA, bz, lim);
    SH_A.sort(byHomeZ);
    var k2 = SH_A.length, wa = HALF_H - 5, nonWide = 0;
    var lz = SH_L;
    for (j = 0; j < k2; j++) {
      lz[j] = k2 >= 3 ? -wa + 2 * wa * j / (k2 - 1) : (k2 === 2 ? (j ? 1 : -1) * HALF_H * 0.4 : 0);
      if (Math.abs(lz[j]) <= HALF_H * 0.6) nonWide++;
    }
    var q = 0;
    for (j = 0; j < k2; j++) {
      p = SH_A[j];
      var z = lz[j], wide = Math.abs(z) > HALF_H * 0.6, high;
      if (wide) high = true;
      else { high = nonWide === 1 ? true : (q % 2 === 1); q++; }
      if (p.cntRun) continue; // (a counter runner: his lane is set)
      var xa;
      var mid = M === M_BUILD ? Math.min(between, bxA + 22) : between;
      if (M === M_COUNTER && T.cntLevel === 2) {
        // following the counter just behind the ball: a pass back, a cut-back, the second ball
        xa = Math.min(bxA + 5, lim - 4);
        z = (k2 > 1 ? (j < k2 / 2 ? -1 : 1) * HALF_H * 0.28 : 0) + bz * 0.3;
        p.slX = a * clamp(xa, -HALF_W + 10, HALF_W - 6);
        p.slZ = clamp(z, -HALF_H + 3, HALF_H - 3);
        continue;
      }
      if (M === M_COUNTER) xa = wide ? Math.min(Math.max(bxA + 8, mid), lim) : (high ? lim : mid); // (a quick break: the others as usual)
      else if (M === M_BUILD) xa = wide ? Math.min(bxA + 16, lim) : (high ? lim : mid);
      else if (M === M_SECURE) xa = wide ? Math.min(bxA + 5, lim) : (high ? lim : mid);
      else if (M === M_FINAL) xa = wide ? lim - 1 : (high ? lim : (z * bz > 0 || nonWide < 3 ? mid : lim - 0.5));
      else xa = wide ? Math.min(Math.max(bxA + 8, mid), lim) : (high ? lim : mid);
      // the ball side is overloaded a little; the far winger stays wide
      if (!wide) z += bz * 0.18;
      p.slX = a * clamp(xa, -HALF_W + 10, HALF_W - 6);
      p.slZ = clamp(z, -HALF_H + 3, HALF_H - 3);
    }
  }

  // A counter's runners: the most advanced attackers (three when everyone goes, two on a quick break) sprint in three
  // lanes, both channels and the middle (the middle one on the far side from the ball), on their last line; each keeps
  // his side (sorted by where they are now, nobody crosses). Sets their slot and p.cntRun.
  var SH_C = [];
  function byAhead(u, v) { return v.ahead - u.ahead; }
  function byPosZ(u, v) { return u.pos.z - v.pos.z; }
  function counterRunners(T, a, bxA, bz, lim) {
    var i, p, n = SH_A.length;
    for (i = 0; i < n; i++) { p = SH_A[i]; p.cntRun = 0; p.ahead = p.pos.x * a + (p.role === 'FWD' ? 6 : 0); }
    SH_A.sort(byAhead);
    var nr = Math.min(T.cntLevel === 2 ? 3 : 2, n);
    SH_C.length = 0;
    for (i = 0; i < nr; i++) SH_C.push(SH_A[i]);
    SH_C.sort(byPosZ);
    var side = bz > 0 ? -1 : 1;
    for (i = 0; i < nr; i++) {
      p = SH_C[i];
      p.cntRun = 1;
      var z = nr === 3 ? [-0.45, side * 0.08, 0.45][i] : (nr === 2 ? (i ? 0.3 : -0.3) : side * 0.1);
      p.slX = a * clamp(lim, -HALF_W + 10, HALF_W - 6);
      p.slZ = clamp(z * HALF_H, -HALF_H + 3, HALF_H - 3);
    }
  }

  // the player's place in the shape, adjusted to the free space nearby (Normal and up), the rest defence marking the
  // opponents left up front (Hard and up); sets p.tgtX / p.tgtZ
  function shapeTarget(p, T, carrier) {
    var a = attackOf(p), ball = World.ball;
    var x = p.slX, z = p.slZ;
    if (p.slRest) {
      if (T.iq >= 2) {
        // an opponent waiting up front near the spot: goal-side of him
        var players = World.players, best = null, bd = 196;
        for (var i = 0; i < players.length; i++) {
          var o = players[i];
          if (o.team === p.team || o.role === 'GK') continue;
          var dx = o.pos.x - x, dz = o.pos.z - z, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = o; }
        }
        if (best && (best.pos.x - 3 * a - x) * a < 0) { x = best.pos.x - a * 3; z = (z + best.pos.z) / 2; }
      }
      p.tgtX = x; p.tgtZ = z;
      return;
    }
    if (T.iq === 0) { freeSpot(p, x, z); }
    else {
      var bs = -1e9, rx = x, rz = z;
      for (var k = 0; k < 5; k++) {
        var cx = keepX(x + (k === 1 ? 4 : (k === 2 ? -4 : 0)) * a), cz = keepZ(z + (k === 3 ? 4 : (k === 4 ? -4 : 0)));
        var sc = Math.min(oppDist(cx, cz, p.team), 8) + Math.min(mateDist(cx, cz, p.team, p), 8) * 0.6 - (k ? 1 : 0);
        if (T.iq >= 2 && carrier) sc += (1 - laneRisk(carrier.pos.x, carrier.pos.z, cx, cz, p.team, 22, false)) * 3;
        if (sc > bs) { bs = sc; rx = cx; rz = cz; }
      }
      p.tgtX = rx; p.tgtZ = rz;
    }
    var line = offLine(p.team, ball);
    if ((p.tgtX - line) * a > -0.5) p.tgtX = line - a * 0.8; // never offside
  }

  /* ------------------------------------------------------------------ ball carrier */

  // shot targets: 4 points across the goal x 3 heights (low, chest high, top corner). With the gauge a low shot is a
  // soft one, so low is only for close range; the pace comes from striking it higher.
  var SHOT_Z = [-4.6, -2.6, 2.6, 4.6];
  var SHOT_H = [0.9, 1.8, 2.8];

  // opponents (not the keeper) standing in the line of a shot from (x, z) to (gx, gz)
  function blockers(x, z, gx, gz, team) {
    var dx = gx - x, dz = gz - z;
    var L = Math.sqrt(dx * dx + dz * dz) || 1;
    var n = 0;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === team || o.role === 'GK' || o.stun > 0) continue;
      var ox = o.pos.x - x, oz = o.pos.z - z;
      var u = (ox * dx + oz * dz) / L;
      if (u < 1 || u > L - 0.5) continue;
      if (Math.abs(ox * dz - oz * dx) / L < 1.3) n++;
    }
    return n;
  }

  // Picks where to put it: the corner the keeper covers least, a lane without a defender, a height that suits the
  // distance (along the ground close in, higher from range), then strikes it with the matching gauge.
  function shootNow(p, prof) {
    var a = attackOf(p);
    var goalX = a * HALF_W;
    var gk = TEAMS[1 - p.team].gk;
    var dx = goalX - p.pos.x;
    var dist = Math.sqrt(dx * dx + p.pos.z * p.pos.z);
    var gkZ = gk ? gk.pos.z : 0;
    var gkOff = gk ? Math.abs(gk.pos.x - goalX) : 0;

    if (gk && gkOff > 5 && dist < 30 && Math.random() < 0.7) { Actions.kick(p, ACT.CHIP, 0.6, 0, gkZ > 0 ? -0.5 : 0.5, 0.4); return; }
    if (Math.abs(p.pos.z) > 8 && dist < 28 && Math.random() < 0.3) {
      Actions.kick(p, ACT.CURVE, clamp(0.45 + dist / 60, 0.45, 0.9), 0, p.pos.z > 0 ? 1 : -1, 0.4);
      return;
    }
    var best = -1e9, bz = 0, bh = 1;
    for (var i = 0; i < SHOT_Z.length; i++) {
      for (var j = 0; j < SHOT_H.length; j++) {
        var tz = SHOT_Z[i], th = SHOT_H[j];
        // how far the keeper has to go (a high ball near his body is easier for him than a low one at his feet)
        var reach = Math.abs(tz - gkZ) - (th > 2 ? 0.9 : (th < 1 ? 0.3 : 0.6));
        var sc = reach * 0.55 - blockers(p.pos.x, p.pos.z, goalX, tz, p.team) * 1.6;
        if (th < 1) sc -= dist > 10 ? 1.2 : -0.2;   // low: fine close in, too soft from further out
        if (th > 2) sc -= 0.25 + (dist < 10 ? 0.5 : 0); // the top corner is harder to hit, and over the bar close in
        sc += (Math.random() - 0.5) * prof.noise * 6;
        if (sc > best) { best = sc; bz = tz; bh = th; }
      }
    }
    // the power that puts it at that height from here (a little human error on the gauge)
    var g = Actions.gaugeFor(dist - 1, bh) + gauss() * 0.025 * prof.acc;
    var pressure = oppDist(p.pos.x, p.pos.z, p.team);
    Actions.shootAt(p, bz, g, 0.55 * prof.acc * (pressure < 2.5 ? 1.35 : 1));
  }

  // A penalty: corner and height chosen at random (low corners most of the time), struck after a short run-up wait.
  function penaltyShot(p, prof) {
    var side = Math.random() < 0.5 ? -1 : 1;
    var z = side * (2.4 + Math.random() * 2.3);
    if (Math.random() < 0.12) z = (Math.random() - 0.5) * 1.5; // straight down the middle
    var h = Math.random() < 0.6 ? 1.1 + Math.random() * 0.8 : 1.9 + Math.random() * 0.9; // struck firmly, low-ish or high
    Actions.shootAt(p, z, Actions.gaugeFor(10, h) + gauss() * 0.02, 0.5 * prof.acc);
  }

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; } // ~N(0, 1)

  // Scores every option and plays the best one.
  function decide(p, prof) {
    var T = TEAMS[p.team];
    var O = TEAMS[1 - p.team];
    var a = attackOf(p);
    var px = p.pos.x, pz = p.pos.z;
    var players = World.players;
    var pressure = oppDist(px, pz, p.team);
    var ownHalf = px * a < 0 ? 1 : 0;
    var loss = 0.28 + 0.3 * ownHalf + 0.25 * T.caution + (px * a < -HALF_W + 18 ? 0.25 : 0) + (T.moment === M_SECURE ? 0.2 : 0);
    var noise = prof.noise;
    var cnt = T.moment === M_COUNTER ? 1 : 0; // a counter-attack: forward, fast
    // near the by-line, wide of the goal: a cut-back to the penalty spot area is the best ball (Normal and up)
    var cutback = prof.iq >= 1 && (a * HALF_W - px) * a < 10 && Math.abs(pz) > 5 && Math.abs(pz) < 24;

    var best = -1e9, bType = -1, bMate = null, bx = 0, bz = 0, bKind = '';
    var k, sc;

    // --- dribble: five directions around "forward" (straight up the pitch; near the box, towards the goal itself,
    // not on to the goal line)
    var gdist0 = Math.sqrt((a * HALF_W - px) * (a * HALF_W - px) + pz * pz);
    var near = clamp((40 - gdist0) / 16, 0, 1);
    var fux = a * (1 - near) + (a * HALF_W - px) / (gdist0 || 1) * near;
    var fuz = -pz / (gdist0 || 1) * near;
    var fwd = Math.atan2(fux, fuz);
    for (k = 0; k < DRIBBLE_OFF.length; k++) {
      var f = fwd + DRIBBLE_OFF[k];
      var dx = Math.sin(f), dz = Math.cos(f);
      var tx = px + dx * 7, tz = pz + dz * 7;
      var space = Math.min(oppDist(tx, tz, p.team), 9) / 9;
      var ahead = (dx * fux + dz * fuz) / (Math.sqrt(fux * fux + fuz * fuz) || 1);
      sc = 0.12 + 0.32 * ahead + 0.3 * space + (space > 0.75 && ahead > 0.8 ? 0.12 : 0);
      if (Math.abs(tz) > HALF_H - 3) sc -= 0.35;
      if (tx * a > HALF_W - 3) sc -= 0.35; // not on to the goal line
      sc += cnt * 0.2 * ahead;
      if (pressure < 2.4) sc -= 0.2;
      if (gdist0 < 30 && pressure < 4.5) sc -= 0.12;
      if (p.drX * dx + p.drZ * dz > 0.9) sc += 0.05; // keep a direction once chosen
      sc += (Math.random() - 0.5) * noise;
      if (sc > best) { best = sc; bType = -1; bx = dx; bz = dz; }
    }

    // --- clearance: pressed near our own goal, the safe thing is to kick it long towards the touchline
    if ((px - -a * HALF_W) * a < 30 && pressure < 3.2 && p.role !== 'FWD') {
      sc = 0.32 + (pressure < 2 ? 0.28 : 0.12) + ((px - -a * HALF_W) * a < 18 ? 0.12 : 0) + (Math.random() - 0.5) * noise;
      if (sc > best) { best = sc; bType = -2; }
    }

    // --- shot
    var gdx = a * HALF_W - px;
    var gdist = Math.sqrt(gdx * gdx + pz * pz);
    if (gdist < 34) {
      sc = shotQuality(px, pz, p.team) * 2.8 + prof.shootBias + T.urgency * 0.12 - T.caution * 0.05;
      // from range: worth a try when nobody blocks the way (more for a good finisher)
      if (gdist > 14 && gdist < 30) {
        var bl = Math.min(blockers(px, pz, a * HALF_W, 3.5, p.team), blockers(px, pz, a * HALF_W, -3.5, p.team));
        sc += ((bl === 0 ? 0.18 : 0.06) + p.st.sht / 99 * 0.16) * (gdist > 25 ? 0.55 : 1);
      }
      if (gdist > 28) sc -= 0.12;
      // in and around the box a sight of goal is the thing to take (a forward does not dribble on past it)
      if (gdist < 22) sc += (22 - gdist) / 22 * 0.45 + (p.role === 'FWD' ? 0.06 : 0);
      sc += (Math.random() - 0.5) * noise;
      if (sc > best) { best = sc; bType = ACT.SHOOT; }
    }

    // --- passes
    var oppLine = O.lastX;
    for (var i = 0; i < players.length; i++) {
      var mt = players[i];
      if (mt.team !== p.team || mt === p || mt.role === 'GK' || mt.stun > 0) continue;
      if (offsideNow(mt, World.ball)) continue; // he would be flagged
      var mdx = mt.pos.x - px, mdz = mt.pos.z - pz;
      var md = Math.sqrt(mdx * mdx + mdz * mdz);

      // short pass to feet
      if (md > 4 && md < 34) {
        var sx = mt.pos.x + mt.vel.x * 0.3, sz = mt.pos.z + mt.vel.z * 0.3;
        var spd = clamp(md * NS.PHYS.ROLL_K + 12, 21, 40);
        var risk = laneRisk(px, pz, sx, sz, p.team, spd, false);
        var rspace = clamp((oppDist(sx, sz, p.team) - 1.5) / 7, 0, 1);
        var gain = (sx - px) * a;
        var val = 0.26 + 1.2 * gain / 35 + 0.32 * rspace + 0.5 * shotQuality(sx, sz, p.team) + cnt * 0.3 * gain / 35;
        if (gain < -3 && pressure > 4) val -= 0.1; // nobody on him: no need to go back
        if (cnt && gain < -2) val -= 0.15;         // a counter does not go backwards
        if (prof.iq >= 1 && rspace <= 0.05) val -= 0.12; // he has a man on him: a pass into traffic
        if (cutback && Math.abs(mt.pos.z) < 10 && Math.abs(a * HALF_W - mt.pos.x) > 6 && Math.abs(a * HALF_W - mt.pos.x) < 17) val += 0.22;
        sc = (1 - risk) * val - risk * loss * 1.5 + (Math.random() - 0.5) * noise;
        if (sc > best) { best = sc; bType = ACT.PASS; bMate = mt; bx = sx; bz = sz; }
      }

      // through ball into the space ahead of a forward-moving team-mate
      // (three depths, bent a little towards the goal: the one he wins the race to)
      if (mt.role !== 'DEF' && (mt.pos.x - px) * a > -3 && md < 40) {
        for (var li = 0; li < THRU_LEAD.length; li++) {
          var lead = THRU_LEAD[li];
          var lx = mt.pos.x + a * lead + mt.vel.x * 0.3;
          var lz = clamp(mt.pos.z * (1 - lead * 0.02) + mt.vel.z * 0.3, -HALF_H + 3, HALF_H - 3);
          if (Math.abs(lx) > HALF_W - 4) continue;
          var ldx = lx - px, ldz = lz - pz;
          var ld = Math.sqrt(ldx * ldx + ldz * ldz);
          var tspd = clamp(ld * NS.PHYS.ROLL_K + 8, 18, 38);
          var trisk = laneRisk(px, pz, lx, lz, p.team, tspd, false);
          var mgx = lx - mt.pos.x, mgz = lz - mt.pos.z;
          var mgd = Math.sqrt(mgx * mgx + mgz * mgz) || 1;
          // already running that way: he is there sooner (the defenders have to turn and start)
          var mom = Math.max(0, (mt.vel.x * mgx + mt.vel.z * mgz) / mgd);
          var mateT = Math.max(0, mgd - 1 - mom * 0.35) / 11;
          if (mt.runT > 0.9) mateT *= 0.6;
          var race = 1 / (1 + Math.exp(-(mateT - oppArrival(lx, lz, p.team) - 0.15) * 5));
          if (race > trisk) trisk = race;
          var tval = 0.32 + 0.5 * (lx - px) * a / 35 + 0.7 * shotQuality(lx, lz, p.team) + ((lx - oppLine) * a > 0 ? 0.25 : 0) +
            (mt.runT > 0.9 ? 0.15 : 0) + cnt * (mt.cntRun ? 0.2 : 0.08); // (a counter: into the runner's path)
          sc = (1 - trisk) * tval - trisk * loss * 1.5 + (Math.random() - 0.5) * noise;
          if (sc > best) { best = sc; bType = ACT.THROUGH; bMate = mt; bx = lx; bz = lz; }
        }
      }

      // a runner in behind (his run has just started, he is still onside): played into his path, along the ground
      // through a gap or chipped over the line when a defender is in the way
      if (mt.runT > 0.9 && mt.role !== 'DEF' && md < 45) {
        var rx2 = clamp(mt.pos.x + mt.vel.x * 0.9, -HALF_W + 4, HALF_W - 4);
        var rz2 = clamp(mt.pos.z + mt.vel.z * 0.9, -HALF_H + 3, HALF_H - 3);
        var rdist = Math.sqrt((rx2 - px) * (rx2 - px) + (rz2 - pz) * (rz2 - pz));
        var gr = laneRisk(px, pz, rx2, rz2, p.team, clamp(rdist * NS.PHYS.ROLL_K + 8, 18, 38), false) * 0.7;
        var lr = rdist > 16 ? laneRisk(px, pz, rx2, rz2, p.team, 25, true) : 1;
        var race2 = 1 / (1 + Math.exp(-(0.3 - oppArrival(rx2, rz2, p.team)) * 5));
        var rrisk = Math.max(Math.min(gr, lr), race2);
        var rval = 0.42 + 0.5 * (rx2 - px) * a / 35 + 0.8 * shotQuality(rx2, rz2, p.team);
        sc = (1 - rrisk) * rval - rrisk * loss * 1.2 + (Math.random() - 0.5) * noise;
        if (sc > best) { best = sc; bType = gr <= lr ? ACT.THROUGH : ACT.LONG; bMate = mt; bx = rx2; bz = rz2; bKind = 'chip_to_runner'; }
      }

      // a cross from a wide position near the box to a team-mate in it (he attacks it with his head or his foot)
      if (Math.abs(pz) > 13 && (a * HALF_W - px) * a < 30) {
        var inBox = Math.abs(a * HALF_W - mt.pos.x) < NS.BOX_D - 1 && Math.abs(mt.pos.z) < 12;
        if (inBox) {
          var crisk = laneRisk(px, pz, mt.pos.x, mt.pos.z, p.team, 25, true) * 0.75;
          var cval = 0.38 + 0.9 * shotQuality(mt.pos.x, mt.pos.z, p.team) + mt.st.hdr / 99 * 0.15;
          sc = (1 - crisk) * cval - crisk * loss + (Math.random() - 0.5) * noise;
          if (sc > best) { best = sc; bType = ACT.LONG; bMate = mt; bx = mt.pos.x - a * 0.5; bz = mt.pos.z; bKind = 'cross'; }
        }
      }

      // long ball: switch play or go over the top
      if (md > 20 && md < 64) {
        var gx = mt.pos.x + a * 3, gz = mt.pos.z;
        var lrisk = laneRisk(px, pz, gx, gz, p.team, 25, true);
        var mT = Math.max(0, Math.sqrt((gx - mt.pos.x) * (gx - mt.pos.x)) - 1) / 11 + 0.2;
        var lrace = 1 / (1 + Math.exp(-(mT - oppArrival(gx, gz, p.team) - 0.5) * 4));
        if (lrace > lrisk) lrisk = lrace;
        var gspace = clamp((oppDist(gx, gz, p.team) - 2) / 8, 0, 1);
        var gval = 0.24 + 0.85 * (gx - px) * a / 35 + 0.3 * gspace + 0.4 * shotQuality(gx, gz, p.team) + (pressure < 3 ? 0.08 : 0);
        // a switch of play to the free far side (Hard and up)
        // a switch of play to the free far side: when the ball side is closed down (not every time he is free)
        var sw = (gz - pz) * pz < 0 && Math.abs(gz - pz) > 25;
        if (sw && prof.iq >= 1) {
          if (pressure > 4 || T.switchT > 0) gval -= 0.2;
          else if (prof.iq >= 2 && gspace > 0.85) gval += 0.08;
        } else if (prof.iq >= 1 && pressure > 4 && gspace < 0.85) gval -= 0.14; // nobody on him: keep it on the ground
        sc = (1 - lrisk) * gval - lrisk * loss * 1.5 - 0.16 + (Math.random() - 0.5) * noise;
        if (sc > best) { best = sc; bType = ACT.LONG; bMate = mt; bx = gx; bz = gz; bKind = (gz - pz) * pz < 0 && Math.abs(gz - pz) > 25 ? 'switch' : 'over_the_top'; }
      }
    }

    if (bKind === 'switch' && bType === ACT.LONG) T.switchT = 15;
    if (NS.dbg) {
      NS.dbg('cpu_decision', p.team, bType);
      if (bType === ACT.LONG) NS.dbg('cpu_long_ball_' + bKind, p.team);
      if (cnt && bType === ACT.SHOOT) NS.dbg('counter_attack_shots', p.team);
    }
    if (bType === -2 && Math.abs(-a * HALF_W - px) < 8 && Math.abs(pz) > 8 && pressure < 1.6 && Math.random() < 0.35) {
      // pinned on his own goal line: he hacks it behind for a corner rather than lose it there
      Actions.release(p, ACT.LONG);
      World.ball.vel.set(-a * (8 + Math.random() * 6), 2 + Math.random() * 3, (pz >= 0 ? 1 : -1) * (2 + Math.random() * 4));
      p.drX = 0; p.drZ = 0;
    } else if (bType === -2) {
      // aimed at the touchline area (some go out for a throw-in)
      Actions.release(p, ACT.LONG);
      World.ball.spinY = 0;
      Actions.launch(p, ACT.LONG, clamp(px + a * (26 + Math.random() * 14), -HALF_W + 4, HALF_W - 4),
        (pz >= 0 ? 1 : -1) * (HALF_H - 10 + Math.random() * 12), null, prof.acc * 2, null);
      p.drX = 0; p.drZ = 0;
    } else if (bType === -1) {
      p.drX = bx; p.drZ = bz;
    } else if (bType === ACT.SHOOT) {
      shootNow(p, prof);
    } else {
      Actions.kickTo(p, bType, bx, bz, bMate, prof.acc);
      p.drX = 0; p.drZ = 0;
    }
  }

  // Throw-in / corner taken by the CPU: a cross to the best header of the ball in the box (now and then a short one),
  // a throw to the free team-mate nearest the touchline spot.
  function restartPlay(p, prof) {
    var m = World.match;
    var players = World.players;
    var a = attackOf(p);
    var goalX = a * HALF_W;
    var best = -1e9, bm = null, i, mt, sc;
    for (i = 0; i < players.length; i++) {
      mt = players[i];
      if (mt.team !== p.team || mt === p || mt.role === 'GK') continue;
      var dx = mt.pos.x - p.pos.x, dz = mt.pos.z - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var room = Math.min(oppDist(mt.pos.x, mt.pos.z, p.team), 4) / 4;
      if (m.restart === 4) {
        var inBox = Math.abs(goalX - mt.pos.x) < NS.BOX_D && Math.abs(mt.pos.z) < NS.BOX_HW;
        if (inBox) sc = mt.st.hdr / 99 + room * 0.6;
        else sc = d < 14 ? 0.35 + room * 0.4 : -1; // a short corner
      } else {
        if (d > 22 || d < 3) continue;
        sc = (1 - laneRisk(p.pos.x, p.pos.z, mt.pos.x, mt.pos.z, p.team, 14, true)) + room * 0.5 + (mt.pos.x - p.pos.x) * a / 40;
      }
      sc += (Math.random() - 0.5) * prof.noise * 2;
      if (sc > best) { best = sc; bm = mt; }
    }
    if (!bm) { Actions.kick(p, m.restart === 4 ? ACT.LONG : ACT.PASS, 0.6, a, 0, prof.acc); return; }
    var inB = Math.abs(goalX - bm.pos.x) < NS.BOX_D;
    var type = m.restart === 4 && inB ? ACT.LONG : ACT.PASS;
    Actions.kickTo(p, type, bm.pos.x + (type === ACT.LONG ? -a * 0.5 : bm.vel.x * 0.3), bm.pos.z, bm, prof.acc);
  }

  function aiCarrier(p, dt, prof) {
    var m = World.match;
    if (m.restart && p === m.setTaker) {
      // throw-in / corner / goal kick: he stands, looks up, then plays it
      p.vel.x = 0; p.vel.z = 0;
      p.aiT += dt;
      if (p.aiT > 1.1) {
        p.aiT = 0;
        // a free kick: the usual choice (a shot when it is on, else a pass); a kick-off and the others: a set play
        if (m.restart === 1) {
          decide(p, prof);
          if (World.ball.owner === p) restartPlay(p, prof); // it chose to dribble: not allowed, play it
        } else {
          restartPlay(p, prof);
        }
      }
      return;
    }
    if (m.penalty) {
      // the penalty taker waits for the referee, then shoots
      p.vel.x = 0; p.vel.z = 0;
      p.aiT += dt;
      if (p.aiT > 1.1) { p.aiT = 0; penaltyShot(p, prof); }
      return;
    }
    var a = attackOf(p);
    if (p.drX === 0 && p.drZ === 0) { p.drX = a; p.drZ = 0; }

    var pressure = oppDist(p.pos.x, p.pos.z, p.team);
    var Tc = TEAMS[p.team];
    var counter = Tc.moment === M_COUNTER;
    // (on a counter with room in front of him he runs with it at pace)
    var speed = (pressure < 4 ? 8.8 : (counter ? 10.4 : 9.8)) * prof.speedMul;
    // stay on the pitch: steer away from the touchlines and the goal lines, looking where he will be in half a second
    var dx = p.drX, dz = p.drZ;
    var fz = p.pos.z + p.vel.z * 0.5, fx = p.pos.x + p.vel.x * 0.5;
    if ((p.pos.z > HALF_H - 4 || fz > HALF_H - 2) && dz > -0.3) dz = -0.4;
    if ((p.pos.z < -HALF_H + 4 || fz < -HALF_H + 2) && dz < 0.3) dz = 0.4;
    if ((p.pos.x * a) > HALF_W - 5 || fx * a > HALF_W - 2.5) { dx = -a * 0.25; dz = -p.pos.z > 0 ? 1 : -1; }
    if (fx * a < -HALF_W + 2.5) { dx = a; }
    var dl = Math.sqrt(dx * dx + dz * dz) || 1;
    var k = Math.min(1, 9 * dt);
    p.vel.x += (dx / dl * speed - p.vel.x) * k;
    p.vel.z += (dz / dl * speed - p.vel.z) * k;
    p.facing = Math.atan2(p.vel.x, p.vel.z);
    p.dribbling = pressure < 5;
    p.carry = p.dribbling ? 0.7 + 0.4 * Math.abs(Math.sin(p.animPhase * 0.5)) : 0.95;

    if (p.returnTo) {
      // one-two: give it straight back to the player who passed
      p.returnT -= dt;
      if (p.returnT <= 0) {
        var back = p.returnTo;
        p.returnTo = null;
        Actions.kick(p, ACT.THROUGH, 0.6, 0, 0, 1, back);
      }
      return;
    }

    p.aiCd -= dt;
    if (pressure < 2.2 && p.aiCd > prof.react * 0.5) p.aiCd = prof.react * 0.5; // a defender arrives: think faster
    if (counter && p.aiCd > prof.react * 0.6) p.aiCd = prof.react * 0.6;          // a counter: look up quickly
    if (p.aiCd > 0) return;
    p.aiCd = prof.react + Math.random() * 0.12;
    decide(p, prof);
  }

  /* ------------------------------------------------------------------ attack without the ball */

  // best free spot near (bx, bz): tries a few offsets, prefers space away from opponents and team-mates
  function freeSpot(p, bx, bz) {
    var best = -1e9, rx = bx, rz = bz;
    for (var k = 0; k < 5; k++) {
      var ox = k === 1 ? 4 : (k === 2 ? -4 : 0);
      var oz = k === 3 ? 4 : (k === 4 ? -4 : 0);
      var x = clamp(bx + ox, -HALF_W + 3, HALF_W - 3);
      var z = clamp(bz + oz, -HALF_H + 2, HALF_H - 2);
      var sc = Math.min(oppDist(x, z, p.team), 8) + Math.min(mateDist(x, z, p.team, p), 7) * 0.6 - (k ? 1.2 : 0);
      if (sc > best) { best = sc; rx = x; rz = z; }
    }
    p.tgtX = rx;
    p.tgtZ = rz;
  }

  // Off-the-ball runs while a team-mate has the ball. A human on the ball gets them too (so he has someone to play a
  // through ball to). How often depends on the block's plan (Tactics) and the score. At most two or three at once.
  //  - in behind: a forward or midfielder level with the last defender bends a run into the space behind him, through
  //    the gap with the most room (straight or diagonal); he starts onside
  //  - late run: a midfielder arrives in the box when the ball is in the last third
  //  - overlap: the full-back on the ball's side runs past the carrier down the touchline
  function startRun(p, T, carrier, carrierFree, oppLine) {
    var ball = World.ball;
    var a = attackOf(p);
    var mo = mood(p);
    var human = carrier.isCtl;
    var players = World.players;
    var runners = 0;
    for (var i = 0; i < players.length; i++) if (players[i].team === p.team && players[i].runT > 0) runners++;
    if (runners >= (mo > 0 ? 3 : 2)) return;
    var cx = carrier.pos.x * a;           // how far up the carrier is (0 = half-way line)
    var behind = (p.pos.x - carrier.pos.x) * a;
    var line = offLine(p.team, ball);
    var wide = Math.abs(p.homeZ) > HALF_H * 0.4;
    var bias = mo * 0.08 + T.urgency * 0.2 - T.caution * 0.2 + (human ? 0.12 : 0);
    var r = Math.random();

    // overlap: a wide defender on the ball's side, from behind the carrier, while we build up
    if (p.role === 'DEF') {
      if (!wide || mo < 0 || (p.homeZ > 0) !== (carrier.pos.z > 0) || behind > -2 || cx < -18 || cx > HALF_W * 0.6) return;
      if (r > 0.12 + mo * 0.2 + bias * 0.5) return;
      var side = p.homeZ > 0 ? 1 : -1, under = false;
      if (T.iq >= 2) {
        for (var w = 0; w < players.length; w++) {
          var wm = players[w];
          if (wm.team === p.team && wm !== p && wm !== carrier && wm.pos.z * side > HALF_H - 9 && (wm.pos.x - carrier.pos.x) * a > -4) { under = true; break; }
        }
      }
      if (NS.dbg) NS.dbg(under ? 'run_underlap' : 'run_overlap', p.team);
      p.runT = 2.6; p.runCd = 7 - mo * 2;
      p.runX = clamp(carrier.pos.x + a * (under ? 14 : 16), -HALF_W + 5, HALF_W - 5);
      p.runZ = side * (under ? HALF_H * 0.42 : HALF_H - 4);
      return;
    }

    // late run into the box: midfielders, once the ball is in the last third
    if (p.role === 'MID' && cx > HALF_W * 0.3 && behind < 6 && r < 0.18 + bias) {
      if (NS.dbg) NS.dbg('run_late_into_box', p.team);
      p.runT = 2.2; p.runCd = 5 - mo;
      var gx = a * HALF_W;
      p.runX = gx - a * (NS.PEN_D + (Math.random() - 0.5) * 5);
      p.runZ = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 6);
      if ((p.runX - line) * a > -0.5) p.runX = line - a * 0.5; // arrives level, not offside
      return;
    }

    // in behind: from level with the last defender, when the carrier can look up
    if ((!carrierFree && !human) || cx < -25 || offsideNow(p, ball)) return;
    if (Math.abs(p.pos.x - line) > 12 || behind < -25) return;
    if (r > 0.3 + bias + (p.role === 'FWD' ? 0.1 : -0.08)) return;
    // the gap with the most room behind the line (straight on, or diagonal across a defender)
    var tx = clamp(oppLine + a * 10, -HALF_W + 5, HALF_W - 5);
    var bz = p.pos.z, bs = -1e9;
    for (var k = -1; k <= 1; k++) {
      var z = clamp(p.pos.z * 0.75 + k * 9, -HALF_H + 5, HALF_H - 5);
      var sc = Math.min(oppDist(tx, z, p.team), 10) - Math.abs(z) * 0.06 + (k === 0 ? 0.6 : 0) + Math.random();
      if (sc > bs) { bs = sc; bz = z; }
    }
    if (NS.dbg) NS.dbg('run_in_behind', p.team);
    p.runT = 2.0;
    p.runCd = 3.6 - mo * 0.8;
    p.runX = tx;
    p.runZ = bz;
    // the carrier looks up now: the pass has to go while the runner is still level with the last defender
    if (carrier.aiCd > 0.06) carrier.aiCd = 0.06;
  }

  // a supporter only comes over from close by (the others keep their places in the shape)
  function supportNear(p, c) {
    var dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
    return dx * dx + dz * dz < 26 * 26;
  }

  function attackOffBall(p, T, prof, dt) {
    var ball = World.ball;
    var carrier = ball.owner;
    var a = attackOf(p);
    var O = TEAMS[1 - p.team];
    if (p.runT > 0) p.runT -= dt;
    if (p.runCd > 0) p.runCd -= dt;
    p.aiT -= dt;
    if (p.aiT <= 0) {
      p.aiT = 0.3 + Math.random() * 0.15;
      var oppLine = O.lastX;
      var carrierFree = oppDist(carrier.pos.x, carrier.pos.z, p.team) > 2.5;

      if (p.runT <= 0 && p.runCd <= 0) startRun(p, T, carrier, carrierFree, oppLine);

      if (p.runT > 0) {
        p.tgtX = p.runX; p.tgtZ = p.runZ; p.tgtS = 12;
      } else if ((p === T.sup1 || (p === T.sup2 && (T.iq === 0 || !carrierFree))) && supportNear(p, carrier) &&
          !(T.moment === M_COUNTER && (p.cntRun || carrierFree))) {
        // offer a passing angle near the carrier (the nearest one short, the second one further)
        var bestS = -1e9, sx = p.pos.x, sz = p.pos.z;
        // (the second one only ahead of the ball or level: one safe option behind is enough)
        var nAng = p === T.sup1 ? SUPPORT_ANG.length : 4;
        for (var k = 0; k < nAng; k++) {
          var th = SUPPORT_ANG[k];
          var r = p === T.sup1 ? 11 : 17;
          var x = clamp(carrier.pos.x + a * Math.cos(th) * r, -HALF_W + 3, HALF_W - 3);
          var z = clamp(carrier.pos.z + Math.sin(th) * r, -HALF_H + 2, HALF_H - 2);
          var lane = 1 - laneRisk(carrier.pos.x, carrier.pos.z, x, z, p.team, 18, false);
          var space = Math.min(oppDist(x, z, p.team), 8) / 8;
          var dxm = x - p.pos.x, dzm = z - p.pos.z;
          var sc = lane * 1.0 + space * 0.8 + Math.cos(th) * 0.3 - Math.sqrt(dxm * dxm + dzm * dzm) / 25 +
            Math.min(mateDist(x, z, p.team, p), 6) / 12;
          if (sc > bestS) { bestS = sc; sx = x; sz = z; }
        }
        if ((sx - offLine(p.team, ball)) * a > -0.5) sx = offLine(p.team, ball) - a * 0.5;
        p.tgtX = sx; p.tgtZ = sz; p.tgtS = 10;
      } else if (T.has && p.slX !== undefined) {
        // the team's shape for this moment (lanes, staggering, rest defence)
        shapeTarget(p, T, carrier);
        var sdx = p.tgtX - p.pos.x, sdz = p.tgtZ - p.pos.z;
        // a counter: the runners sprint flat out, the ones following run hard
        p.tgtS = T.moment === M_COUNTER && !p.slRest ? (p.cntRun ? 11.8 : 10.6) : (sdx * sdx + sdz * sdz > 64 ? 10 : 8.6);
      } else {
        // shape: the formation moved up with the ball, wide players wide, forwards on the offside line (never
        // beyond it), defenders a line behind the ball
        // (the whole team goes up with the ball: the midfield about level with it, the forwards ahead, so the carrier
        // has someone to play forward to)
        var push = (p.role === 'FWD' ? 15 : (p.role === 'MID' ? 9 : 3)) + T.urgency * 5 - T.caution * 5 + mood(p) * 3;
        var bx = p.homeX * 0.45 + ball.pos.x * 0.85 + a * push;
        var bz = p.homeZ * 1.15 + ball.pos.z * 0.25;
        if (Math.abs(p.homeZ) > 15) bz = (p.homeZ > 0 ? 1 : -1) * Math.min(HALF_H - 3, Math.abs(p.homeZ) * 1.3);
        var line = offLine(p.team, ball);
        if (p.role === 'FWD' && ball.pos.x * a > -18) bx = line - a * 1.2; // stretch them: on the last defender
        if ((bx - line) * a > -0.8) bx = line - a * 0.8;
        if (p.role === 'DEF' && (bx - carrier.pos.x) * a > -8) bx = carrier.pos.x - a * 8;
        if (p.role === 'DEF' && bx * a > 12) bx = a * 12;
                freeSpot(p, bx, bz);
        if ((p.tgtX - line) * a > -0.5) p.tgtX = line - a * 0.8; // the search for space never takes him offside
        // far from his place (we have just won it back): he sprints up to join in
        var fdx = p.tgtX - p.pos.x, fdz = p.tgtZ - p.pos.z;
        p.tgtS = fdx * fdx + fdz * fdz > 64 ? 10 : 8.6;
      }
    }
    moveToward(p, p.tgtX, p.tgtZ, p.tgtS * prof.speedMul, dt);
  }

  /* ------------------------------------------------------------------ defence */

  function defend(p, T, prof, dt, pressing) {
    var ball = World.ball;
    var c = ball.owner;
    var a = attackOf(p);
    var ownGoalX = -a * HALF_W;
    var gx = ownGoalX - c.pos.x, gz = -c.pos.z;
    var gl = Math.sqrt(gx * gx + gz * gz) || 1;
    gx /= gl; gz /= gl;

    if (p.shCd > 0) p.shCd -= dt;
    // (a counter-press or a triggered press: the second and third only from close by, the others keep the block)
    var cdx0 = c.pos.x - p.pos.x, cdz0 = c.pos.z - p.pos.z, closeBy = cdx0 * cdx0 + cdz0 * cdz0 < 225;
    var extra = pressing || T.urgency > 0.5 || (prof.press2 && (c.pos.x * a) < -10) || (T.pressN >= 2 && closeBy);
    if (p === T.presser || (extra && p === T.cover) || (T.pressN >= 3 && closeBy && p === T.press3)) {
      // close down goal-side, jockey when near, tackle when the moment is right
      var tx = c.pos.x + c.vel.x * 0.25 + gx * 1.4;
      var tz = c.pos.z + c.vel.z * 0.25 + gz * 1.4;
      var cdx = c.pos.x - p.pos.x, cdz = c.pos.z - p.pos.z;
      var d = Math.sqrt(cdx * cdx + cdz * cdz);
      // where we stand relative to the carrier: +1 in front of him (where the ball is), -1 behind his back
      var side = -(Math.sin(c.facing) * cdx + Math.cos(c.facing) * cdz) / (d || 1);
      var cSpeed = Math.sqrt(c.vel.x * c.vel.x + c.vel.z * c.vel.z);
      // alongside or just behind him: lean in with the shoulder to win it or knock it off his foot
      if (d < 1.45 && side < 0.5 && p.shCd <= 0 && World.match.protectT <= 0 && !c.gkHands) {
        p.shCd = 0.7 + Math.random() * 0.5;
        if (Actions.shoulder(p, c, prof.tackle * 0.5)) return;
      }
      // he is running away with it: sprint after him and get alongside (where the ball can be reached)
      if (side < -0.3 && d < 7 && cSpeed > 6) {
        var rx = -Math.cos(c.facing), rz = Math.sin(c.facing); // carrier's right
        var lat2 = (-cdx * rx - cdz * rz) >= 0 ? 1 : -1;
        moveToward(p, c.pos.x + c.vel.x * 0.3 + rx * lat2 * 1.1, c.pos.z + c.vel.z * 0.3 + rz * lat2 * 1.1, 11.6 * prof.speedMul, dt);
        // a slide from the side when he is level
        if (d < 2.4 && side > -0.5 && p.tackleCd <= 0 && Math.random() < prof.tackleRate * 0.3 * dt) Actions.startTackle(p, c, false, true);
        return;
      }
      if (side < -0.3 && d < 4.5) {
        // behind the carrier: the ball is shielded, run round him (on the side we already are) to get goal-side
        var px = -Math.cos(c.facing), pz = Math.sin(c.facing); // carrier's right
        var lat = (-cdx * px - cdz * pz) >= 0 ? 1 : -1;
        tx = c.pos.x + px * lat * 2.2 + gx * 1.6;
        tz = c.pos.z + pz * lat * 2.2 + gz * 1.6;
        moveToward(p, tx, tz, 10.8 * prof.speedMul, dt);
        return;
      }
      // a free kick: stand off the ball until it is played
      if (World.match.protectT > 0) {
        moveToward(p, c.pos.x + gx * 7.5, c.pos.z + gz * 7.5, 9 * prof.speedMul, dt);
        return;
      }
      if (d < 2.0 && p.tackleCd <= 0 && side > -0.45 && !c.gkHands) {
        // carrier running at us (facing our goal) is easier to time than one shielding the ball
        var facing = Math.sin(c.facing) * gx + Math.cos(c.facing) * gz;
        var rate = prof.tackleRate * (0.8 + 0.5 * Math.max(0, facing)) * (c.dribbling ? 0.8 : 1.15);
        if (Math.random() < rate * dt) { Actions.startTackle(p, c, false); return; }
      }
      moveToward(p, tx, tz, (d > 4 ? 10.8 : 8.6) * prof.speedMul, dt);
      return;
    }
    // they are countering and he is not goal-side of the ball: a recovery sprint (Easy only jogs back faster)
    var recover = TEAMS[1 - p.team].moment === M_COUNTER && (p.pos.x - ball.pos.x) * a > -1;
    var rs = recover ? (T.iq ? 11 : 9.8) : 0;
    if (p === T.cover) {
      moveToward(p, c.pos.x + gx * 6.5, c.pos.z * 0.85 + gz * 6.5, Math.max(9.6, rs) * prof.speedMul, dt);
      return;
    }
    var o = p.mark;
    if (o) {
      // goal-side of the man, shaded towards the ball to block the passing lane
      var ox = ownGoalX - o.pos.x, oz = -o.pos.z;
      var ol = Math.sqrt(ox * ox + oz * oz) || 1;
      var bxv = ball.pos.x - o.pos.x, bzv = ball.pos.z - o.pos.z;
      var bl = Math.sqrt(bxv * bxv + bzv * bzv) || 1;
      // a defensive block sits tighter on its man (less room to turn and shoot)
      // (shaded only a little towards the ball: he cannot stand in every lane, a pass to feet can still get there)
      var tight = (3.6 - 2.0 * clamp(1 - ol / 45, 0, 1)) / prof.tight * (moodOf(p.team, 0) < 0 ? 0.75 : 1);
      var mx = o.pos.x + ox / ol * tight + bxv / bl * 0.45 + o.vel.x * 0.2;
      var mz = o.pos.z + oz / ol * tight + bzv / bl * 0.45 + o.vel.z * 0.2;
      var fast = o.vel.x * o.vel.x + o.vel.z * o.vel.z > 60;
      moveToward(p, mx, mz, Math.max(fast ? 11 : 9.6, rs) * prof.speedMul, dt);
      return;
    }
    // zonal: one compact block behind the ball
    zoneSpot(p, T, ball);
    moveToward(p, ZX, ZZ, Math.max(9, rs) * prof.speedMul, dt);
  }

  /* ------------------------------------------------------------------ goalkeeper */

  // Plays it to the best free team-mate. Without `force` it waits (returns false) when nobody is a good option.
  function gkDistribute(p, prof, force) {
    var a = attackOf(p);
    var players = World.players;
    var best = -1e9, bm = null, bx = 0, bz = 0, bt = ACT.PASS;
    for (var i = 0; i < players.length; i++) {
      var m = players[i];
      if (m.team !== p.team || m === p || m.stun > 0) continue;
      var dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var short = d < 32;
      var risk = laneRisk(p.pos.x, p.pos.z, m.pos.x, m.pos.z, p.team, short ? clamp(d * NS.PHYS.ROLL_K + 12, 21, 40) : 25, !short);
      var space = clamp((oppDist(m.pos.x, m.pos.z, p.team) - 2) / 8, 0, 1);
      var sc = (1 - risk) * (0.4 + space * 0.6 + (m.pos.x * a + HALF_W) / 200) - risk * 0.8 + (Math.random() - 0.5) * prof.noise;
      if (sc > best) { best = sc; bm = m; bx = m.pos.x; bz = m.pos.z; bt = short ? ACT.PASS : ACT.LONG; }
    }
    if (!force && best < 0.3) return false;
    if (bm) Actions.kickTo(p, bt, bx, bz, bm, prof.acc);
    else Actions.kick(p, ACT.LONG, 0.6, a, 0, prof.acc);
    return true;
  }

  function aiGoalkeeper(p, dt, prof) {
    var ball = World.ball;
    var a = attackOf(p);
    var ownGoalX = -a * HALF_W;
    var T = TEAMS[p.team];
    var O = TEAMS[1 - p.team];
    var limit = GOAL_HALF_W - 0.4;
    if (p.diveCd > 0) p.diveCd -= dt;

    // facing a penalty: on the line, still, until it is struck
    if (World.match.penalty && ball.owner && ball.owner.team !== p.team) {
      p.vel.x = 0; p.vel.z = 0;
      p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
      return;
    }

    // in the air during a dive: no steering, he glides and lands
    if (p.diveT > 0 && ball.owner !== p) {
      var glide = Math.exp(-2.2 * dt);
      p.vel.x *= glide; p.vel.z *= glide;
      return;
    }

    if (ball.owner === p) {
      // gkHold is counted by the match (5 s rule: after that he must kick it long)
      p.vel.x *= 0.8; p.vel.z *= 0.8;
      if (p.diveT > 0) return; // still on the grass after a diving catch
      p.aiCd -= dt;
      if (p.gkHold > 0.9 && p.aiCd <= 0) {
        p.aiCd = 0.25;
        if (gkDistribute(p, prof, p.gkHold > 3.5)) p.gkHold = 0;
      }
      return;
    }

    // shot coming: react (after the reaction time) and move across to where it crosses our line
    var toward = ball.vel.x * -a;
    if (!ball.owner && ball.lastTouchTeam !== p.team && toward > 8) {
      p.gkRT += dt;
      var lineX = ownGoalX + a * 1.2;
      var t = (lineX - ball.pos.x) / ball.vel.x;
      if (t > 0 && t < 2.4) {
        if (p.gkRT < prof.gkReact) { p.vel.x *= 0.85; p.vel.z *= 0.85; return; }
        // where the shot really crosses our line (same physics: curl, drag, dip)
        World.predict(t);
        var cz = World.prZ, cy = World.prY;
        var need = Math.abs(cz - p.pos.z);
        if (p.diveT <= 0 && p.diveCd <= 0 && need > 1.3 && t < 0.6 && cy < NS.GOAL_HEIGHT + 0.8 &&
            Math.abs(cz) < GOAL_HALF_W + 1.5) {
          // too far to step across in time: dive at it
          var dir = cz > p.pos.z ? 1 : -1;
          p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
          p.vel.z = dir * clamp(need / Math.max(t, 0.22), 6, 10); // a human dive, not a teleport
          p.vel.x = (lineX - p.pos.x) * 2;
          p.diveT = 0.8;
          p.diveCd = 1.2;
          p.diveHigh = cy > 1.9;
          p.diveRoll = -dir * Math.sin(p.facing) > 0 ? -1.25 : 1.25;
          return;
        }
        moveToward(p, lineX, clamp(cz, -limit - 0.8, limit + 0.8), 10.5, dt); // a keeper's side-steps, not a sprint
        return;
      }
    } else {
      p.gkRT = 0;
    }

    // loose ball in or near the box that we reach first: come and claim it
    if (!ball.owner && Math.abs(ball.pos.x - ownGoalX) < 16 && Math.abs(ball.pos.z) < 13) {
      var gt = interceptTime(p, 10.5, 3.2);
      if (gt < O.chaseT - 0.1 && gt < 1.6) { moveToward(p, ICX, ICZ, 11 * prof.speedMul, dt); return; }
    }

    // angle play: stand on the line from the goal centre to the ball, further out when the ball is close
    var bdx = ball.pos.x - ownGoalX, bdz = ball.pos.z;
    var bd = Math.sqrt(bdx * bdx + bdz * bdz) || 1;
    var off = bd < 30 ? clamp(1.4 + (30 - bd) * 0.1, 1.4, 4) : 1.6;
    if (T.phase === 1) off = 3.2; // our ball: step up to be an option
    var tx = ownGoalX + bdx / bd * off;
    var tz = clamp(bdz / bd * off * 1.3, -limit, limit);
    moveToward(p, tx, tz, 9 * prof.speedMul, dt);
  }

  /* ------------------------------------------------------------------ public */

  NS.AI = {
    profiles: PROFILES,
    // AI.MA's team-mates are the Legend CPU (only its selected player is the learning model)
    profile: function (name) { return PROFILES[name === 'AIMA' ? 'LEGEND' : name] || PROFILES.NORMAL; },
    teams: TEAMS,
    teamUpdate: teamUpdate,
    shotQuality: shotQuality,

    step: function (p, dt, rank, prof, pressing) {
      var ball = World.ball;
      if (p.role === 'GK') { aiGoalkeeper(p, dt, prof); return; }
      if (ball.owner === p) { aiCarrier(p, dt, prof); return; }
      if (World.match.restart === 4) {
        // a corner: everybody holds his place in the box until it is struck
        p.vel.x *= 0.8; p.vel.z *= 0.8;
        p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        return;
      }

      p.dribbling = false;
      p.carry = 0.95;
      if (p.returnTo) {
        p.returnExp -= dt; // the one-two pass never arrived: forget it
        if (p.returnExp <= 0) p.returnTo = null;
      }
      var T = TEAMS[p.team];

      // a pass was played to this player (or he is the opponent nearest to it): meet it where it can be played
      if (!ball.owner && (ball.receiver === p || ball.contester === p)) {
        // a through ball: he meets it as usual, but where meeting it would take him back towards his own goal he runs on
        // into the space instead and lets it come
        interceptTime(p, 11.5 * prof.speedMul, 1.9);
        if (ball.thru && ball.receiver === p && (ICX - p.pos.x) * NS.attack(p.team) < 0) {
          moveToward(p, ball.thruX, ball.thruZ, 11.8 * prof.speedMul, dt);
          p.runToT = 0;
          return;
        }
        moveToward(p, ICX, ICZ, 11.5 * prof.speedMul, dt);
        p.runToT = 0;
        return;
      }
      if (p.runToT > 0) {
        p.runToT -= dt;
        moveToward(p, p.runToX, p.runToZ, 11.5 * prof.speedMul, dt);
        return;
      }

      // live phase: the ball may have changed hands earlier in this step
      var owner = ball.owner;
      var phase = owner ? (owner.team === p.team ? 1 : 2) : 0;
      if (phase !== T.phase) {
        // team plan is one step old: the nearest player goes for the ball, everyone else keeps shape
        if (phase === 2 && rank === 0) { T.presser = p; }
        else if (phase === 0 && rank === 0) { moveToward(p, ball.pos.x, ball.pos.z, 10.8 * prof.speedMul, dt); return; }
        else if (phase === 1) { attackOffBall(p, T, prof, dt); return; }
      }

      if (phase === 0 && T.has && T.iq >= 2) {
        var rcv = ball.receiver;
        if (rcv && rcv.team === p.team && rcv !== p && p.tmRecv !== rcv) {
          p.tmRecv = rcv;
          var ta = attackOf(p), tdx = p.pos.x - rcv.pos.x, tdz = p.pos.z - rcv.pos.z;
          if (!p.slRest && p.role !== 'DEF' && p.runT <= 0 && p.runCd <= 0 && tdx * tdx + tdz * tdz < 500 && tdx * ta > -10 &&
              !offsideNow(p, ball) && Math.random() < 0.3) {
            if (NS.dbg) NS.dbg('run_third_man', p.team);
            p.runT = 1.8; p.runCd = 4;
            p.runX = clamp(offLine(p.team, ball) + ta * 9, -HALF_W + 5, HALF_W - 5);
            p.runZ = clamp(p.pos.z * 0.8 + rcv.pos.z * 0.2, -HALF_H + 5, HALF_H - 5);
          }
        }
        if (p.runT > 0) { p.runT -= dt; moveToward(p, p.runX, p.runZ, 12 * prof.speedMul, dt); return; }
      }
      if (phase === 0) {
        if (p === T.chaser || ((prof.press2 || pressing) && p === T.chaser2)) {
          moveToward(p, p.icX, p.icZ, 10.8 * prof.speedMul, dt);
          return;
        }
        // loose ball: keep the shape around it (the team that played it: its in-possession places; on a counter the
        // runners keep sprinting); the team caught open sprints back
        if (T.has && T.iq >= 1 && p.slX !== undefined) {
          moveToward(p, p.slX, p.slZ, (T.moment === M_COUNTER && p.cntRun ? 11.8 : 9) * prof.speedMul, dt);
          return;
        }
        var rec = TEAMS[1 - p.team].moment === M_COUNTER && (p.pos.x - ball.pos.x) * attackOf(p) > -1;
        zoneSpot(p, T, ball);
        moveToward(p, ZX, ZZ, (rec ? (T.iq ? 11 : 9.8) : 9) * prof.speedMul, dt);
        return;
      }
      if (phase === 1) { attackOffBall(p, T, prof, dt); return; }
      defend(p, T, prof, dt, pressing);
    }
  };
})(window.RS6 = window.RS6 || {});
