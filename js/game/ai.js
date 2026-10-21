/* CPU football brain.
 *
 * Team level (teamUpdate, once per step): phase (attack / defend / loose ball), game state (urgency when losing late,
 * caution when winning late), who presses, who covers, man-marking assignments, the defensive line, ball interception.
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
    EASY: { speedMul: 0.86, react: 0.6, noise: 0.34, tackle: 0.28, tackleRate: 1.1, gkSave: 0.58, gkReact: 0.32, acc: 2.6, tight: 0.55, press2: false, shootBias: -0.06, chasers: 1 },
    NORMAL: { speedMul: 1.0, react: 0.32, noise: 0.12, tackle: 0.5, tackleRate: 2.0, gkSave: 0.74, gkReact: 0.17, acc: 1.4, tight: 0.85, press2: false, shootBias: 0, chasers: 1 },
    HARD: { speedMul: 1.06, react: 0.22, noise: 0.07, tackle: 0.6, tackleRate: 2.6, gkSave: 0.82, gkReact: 0.11, acc: 1.05, tight: 0.95, press2: true, shootBias: 0.02, chasers: 2 },
    LEGEND: { speedMul: 1.12, react: 0.14, noise: 0.03, tackle: 0.7, tackleRate: 3.2, gkSave: 0.9, gkReact: 0.07, acc: 0.8, tight: 1.05, press2: true, shootBias: 0.04, chasers: 2 }
  };

  var RUN_SPEED = 10.4;    // what the AI assumes a player covers per second when judging races to the ball
  var DRIBBLE_OFF = [0, 0.5, -0.5, 1.05, -1.05];
  var SUPPORT_ANG = [0.55, -0.55, 1.25, -1.25, 2.3, -2.3];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // The team's plan for a block (Game plan > Tactics): -1 defensive, 0 balanced, +1 attacking.
  // block 0 = defence, 1 = midfield, 2 = attack
  function moodOf(t, block) {
    var tac = World.session.tactics;
    return tac && tac[t] ? tac[t][block] - 1 : 0;
  }
  function mood(p) { return moodOf(p.team, p.role === 'DEF' ? 0 : (p.role === 'MID' ? 1 : 2)); }

  function makeTeam() {
    return {
      phase: 0,          // 1 attack (we have the ball), 2 defend, 0 loose
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

  function attackOf(p) { return p.team === 0 ? 1 : -1; }

  function moveToward(p, tx, tz, speed, dt) {
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
      var tOpp = Math.max(0, perp - 1.35) / RUN_SPEED + 0.06;
      var r = 1 / (1 + Math.exp(-(tBall - tOpp) * 6));
      if (r > risk) risk = r;
    }
    return risk;
  }

  // 0..~1: how good a shot from (x, z) is for `team` (goal angle, distance, blockers, keeper)
  function shotQuality(x, z, team) {
    var a = team === 0 ? 1 : -1;
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
    var a = team === 0 ? 1 : -1;
    var O = TEAMS[1 - team];
    return a * Math.max(O.lastX * a, ball.pos.x * a, 0);
  }

  // p stands in an offside position right now
  function offsideNow(p, ball) {
    var a = p.team === 0 ? 1 : -1;
    return p.pos.x * a > offLine(p.team, ball) * a + 0.2;
  }

  // Defensive shape (we do not have the ball): one back line, the midfield a few metres in front of it, the forwards
  // further up, everybody shifted towards the ball's side and squeezed narrow. Sets ZX / ZZ.
  function zoneSpot(p, T, ball) {
    var a = attackOf(p);
    var depth = (ball.pos.x - T.lineX) * a; // how far the ball is in front of our line
    var x;
    if (p.role === 'DEF') x = T.lineX;
    else if (p.role === 'MID') x = T.lineX + a * (clamp(depth * 0.5, 5, 13) + moodOf(p.team, 1) * 2);
    else x = T.lineX + a * (clamp(depth * 0.85, 14, 30) + moodOf(p.team, 2) * 4); // attacking: they wait up the pitch
    ZX = clamp(x, -HALF_W + 4, HALF_W - 4);
    ZZ = clamp(p.homeZ * 0.72 + ball.pos.z * 0.32, -HALF_H + 3, HALF_H - 3);
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
    var a = t === 0 ? 1 : -1;
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
        if (zx * zx + zz * zz > 400) continue;
        var dx = d.pos.x - o.pos.x, dz = d.pos.z - o.pos.z;
        var dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) best.mark = o;
    }
  }

  function teamUpdate(dt) {
    var ball = World.ball;
    var players = World.players;
    var owner = ball.owner;
    var m = World.match;
    var mins = m.timeSeconds / 60;
    for (var t = 0; t < 2; t++) {
      var T = TEAMS[t];
      var a = t === 0 ? 1 : -1;
      T.phase = owner ? (owner.team === t ? 1 : 2) : 0;
      var diff = m.score[t] - m.score[1 - t];
      T.urgency = diff < 0 ? clamp((mins - 45) / 40, 0, 1) * (diff < -1 ? 1 : 0.75) : 0;
      T.caution = diff > 0 ? clamp((mins - 55) / 35, 0, 1) : 0;
      T.presser = null; T.cover = null; T.chaser = null; T.chaser2 = null; T.chaseT = 99;
      T.sup1 = null; T.sup2 = null;

      var deepest = 1e9;
      var i, p, best1 = null, best2 = null, d1 = 1e9, d2 = 1e9;
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
          if (p === owner) continue;
          var sx = owner.pos.x - p.pos.x, sz = owner.pos.z - p.pos.z;
          dd = sx * sx + sz * sz;
        }
        if (dd < d1) { d2 = d1; best2 = best1; d1 = dd; best1 = p; }
        else if (dd < d2) { d2 = dd; best2 = p; }
      }
      if (T.phase === 0) { T.chaser = best1; T.chaser2 = best2; T.chaseT = d1; }
      else if (T.phase === 2) { T.presser = best1; T.cover = best2; }
      else { T.sup1 = best1; T.sup2 = best2; }

      // back line: follows the ball, never deeper than 7 from our goal, higher when chasing the game
      var dm = moodOf(t, 0);
      var lx = ball.pos.x - a * (15 - T.urgency * 4 + T.caution * 3 - dm * (dm > 0 ? 3 : 2));
      var deepLimit = -a * (HALF_W - 7 - (dm > 0 ? dm * 3 : 0));
      if ((lx - deepLimit) * a < 0) lx = deepLimit;
      if (lx * a > 8 + dm * 6) lx = a * (8 + dm * 6);
      T.lineX = lx;

      T.markT -= dt;
      if (T.phase === 2 && T.markT <= 0) { T.markT = 0.35; assignMarks(t, T); }
      if (T.phase === 1) {
        for (i = 0; i < players.length; i++) if (players[i].team === t) players[i].mark = null;
      }
    }
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
    var loss = 0.28 + 0.3 * ownHalf + 0.25 * T.caution + (px * a < -HALF_W + 18 ? 0.25 : 0);
    var noise = prof.noise;

    var best = -1e9, bType = -1, bMate = null, bx = 0, bz = 0;
    var k, sc;

    // --- dribble: five directions around "forward"
    var gdist0 = Math.sqrt((a * HALF_W - px) * (a * HALF_W - px) + pz * pz);
    var fwd = Math.atan2(a, 0);
    for (k = 0; k < DRIBBLE_OFF.length; k++) {
      var f = fwd + DRIBBLE_OFF[k];
      var dx = Math.sin(f), dz = Math.cos(f);
      var tx = px + dx * 7, tz = pz + dz * 7;
      var space = Math.min(oppDist(tx, tz, p.team), 9) / 9;
      sc = 0.12 + 0.22 * dx * a + 0.3 * space + (space > 0.75 && dx * a > 0.8 ? 0.12 : 0);
      if (Math.abs(tz) > HALF_H - 3) sc -= 0.35;
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
        var val = 0.26 + 0.7 * (sx - px) * a / 35 + 0.32 * rspace + 0.5 * shotQuality(sx, sz, p.team);
        sc = (1 - risk) * val - risk * loss * 1.5 + (Math.random() - 0.5) * noise;
        if (sc > best) { best = sc; bType = ACT.PASS; bMate = mt; bx = sx; bz = sz; }
      }

      // through ball into the space ahead of a forward-moving team-mate
      if (mt.role !== 'DEF' && (mt.pos.x - px) * a > -3 && md < 40) {
        var lx = mt.pos.x + a * 8 + mt.vel.x * 0.3;
        var lz = clamp(mt.pos.z + mt.vel.z * 0.3, -HALF_H + 3, HALF_H - 3);
        if (Math.abs(lx) < HALF_W - 4) {
          var ldx = lx - px, ldz = lz - pz;
          var ld = Math.sqrt(ldx * ldx + ldz * ldz);
          var tspd = clamp(ld * NS.PHYS.ROLL_K + 8, 18, 38);
          var trisk = laneRisk(px, pz, lx, lz, p.team, tspd, false);
          var mateT = Math.max(0, Math.sqrt((lx - mt.pos.x) * (lx - mt.pos.x) + (lz - mt.pos.z) * (lz - mt.pos.z)) - 1) / 11;
          if (mt.runT > 0.9) mateT *= 0.45; // he is already sprinting in behind, the defender has to turn
          var race = 1 / (1 + Math.exp(-(mateT - oppArrival(lx, lz, p.team)) * 5));
          if (race > trisk) trisk = race;
          var tval = 0.3 + 0.5 * (lx - px) * a / 35 + 0.6 * shotQuality(lx, lz, p.team) + ((lx - oppLine) * a > 0 ? 0.22 : 0) +
            (mt.runT > 0.9 ? 0.15 : 0);
          sc = (1 - trisk) * tval - trisk * loss * 1.5 - 0.03 + (Math.random() - 0.5) * noise;
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
        if (sc > best) { best = sc; bType = gr <= lr ? ACT.THROUGH : ACT.LONG; bMate = mt; bx = rx2; bz = rz2; }
      }

      // a cross from a wide position near the box to a team-mate in it (he attacks it with his head or his foot)
      if (Math.abs(pz) > 13 && (a * HALF_W - px) * a < 30) {
        var inBox = Math.abs(a * HALF_W - mt.pos.x) < NS.BOX_D - 1 && Math.abs(mt.pos.z) < 12;
        if (inBox) {
          var crisk = laneRisk(px, pz, mt.pos.x, mt.pos.z, p.team, 25, true) * 0.75;
          var cval = 0.38 + 0.9 * shotQuality(mt.pos.x, mt.pos.z, p.team) + mt.st.hdr / 99 * 0.15;
          sc = (1 - crisk) * cval - crisk * loss + (Math.random() - 0.5) * noise;
          if (sc > best) { best = sc; bType = ACT.LONG; bMate = mt; bx = mt.pos.x - a * 0.5; bz = mt.pos.z; }
        }
      }

      // long ball: switch play or go over the top
      if (md > 20 && md < 64) {
        var gx = mt.pos.x + a * 3, gz = mt.pos.z;
        var lrisk = laneRisk(px, pz, gx, gz, p.team, 25, true);
        var mT = Math.max(0, Math.sqrt((gx - mt.pos.x) * (gx - mt.pos.x)) - 1) / 11 + 0.2;
        var lrace = 1 / (1 + Math.exp(-(mT - oppArrival(gx, gz, p.team) - 0.5) * 4));
        if (lrace > lrisk) lrisk = lrace;
        var gval = 0.24 + 0.6 * (gx - px) * a / 35 + 0.3 * clamp((oppDist(gx, gz, p.team) - 2) / 8, 0, 1) +
          0.4 * shotQuality(gx, gz, p.team) + (pressure < 3 ? 0.08 : 0);
        sc = (1 - lrisk) * gval - lrisk * loss * 1.5 - 0.16 + (Math.random() - 0.5) * noise;
        if (sc > best) { best = sc; bType = ACT.LONG; bMate = mt; bx = gx; bz = gz; }
      }
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
    var speed = (pressure < 4 ? 8.8 : 9.8) * prof.speedMul;
    // stay on the pitch: steer away from the touchlines and the goal line
    var dx = p.drX, dz = p.drZ;
    if (p.pos.z > HALF_H - 4 && dz > 0) dz = -0.3;
    if (p.pos.z < -HALF_H + 4 && dz < 0) dz = 0.3;
    if ((p.pos.x * a) > HALF_W - 5) { dx = 0; dz = -p.pos.z > 0 ? 1 : -1; }
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
      p.runT = 2.6; p.runCd = 7 - mo * 2;
      p.runX = clamp(carrier.pos.x + a * 16, -HALF_W + 5, HALF_W - 5);
      p.runZ = (p.homeZ > 0 ? 1 : -1) * (HALF_H - 4);
      return;
    }

    // late run into the box: midfielders, once the ball is in the last third
    if (p.role === 'MID' && cx > HALF_W * 0.3 && behind < 6 && r < 0.18 + bias) {
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
      } else if ((p === T.sup1 || p === T.sup2) && supportNear(p, carrier)) {
        // offer a passing angle near the carrier (the nearest one short, the second one further)
        var bestS = -1e9, sx = p.pos.x, sz = p.pos.z;
        for (var k = 0; k < SUPPORT_ANG.length; k++) {
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
      } else {
// shape: the formation moved up with the ball, wide players wide, forwards on the offside line (never
        // beyond it), defenders a line behind the ball
        var push = (p.role === 'FWD' ? 14 : (p.role === 'MID' ? 8 : 4)) + T.urgency * 5 - T.caution * 5 + mood(p) * 3;
        var bx = p.homeX * 0.6 + ball.pos.x * 0.65 + a * push;
        var bz = p.homeZ * 1.15 + ball.pos.z * 0.25;
        if (Math.abs(p.homeZ) > 15) bz = (p.homeZ > 0 ? 1 : -1) * Math.min(HALF_H - 3, Math.abs(p.homeZ) * 1.3);
        var line = offLine(p.team, ball);
        if (p.role === 'FWD' && ball.pos.x * a > -18) bx = line - a * 1.2; // stretch them: on the last defender
        if ((bx - line) * a > -0.8) bx = line - a * 0.8;
        if (p.role === 'DEF' && (bx - carrier.pos.x) * a > -8) bx = carrier.pos.x - a * 8;
        if (p.role === 'DEF' && bx * a > 12) bx = a * 12;
                freeSpot(p, bx, bz);
        if ((p.tgtX - line) * a > -0.5) p.tgtX = line - a * 0.8; // the search for space never takes him offside
        p.tgtS = 8.6;
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
    var teamPress = pressing || T.urgency > 0.5 || (prof.press2 && (c.pos.x * a) < -10);

    if (p.shCd > 0) p.shCd -= dt;
    if (p === T.presser || (teamPress && p === T.cover)) {
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
    if (p === T.cover) {
      moveToward(p, c.pos.x + gx * 6.5, c.pos.z * 0.85 + gz * 6.5, 9.6 * prof.speedMul, dt);
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
      var tight = (3.4 - 2.0 * clamp(1 - ol / 45, 0, 1)) / prof.tight * (moodOf(p.team, 0) < 0 ? 0.75 : 1);
      var mx = o.pos.x + ox / ol * tight + bxv / bl * 1.0 + o.vel.x * 0.2;
      var mz = o.pos.z + oz / ol * tight + bzv / bl * 1.0 + o.vel.z * 0.2;
      var fast = o.vel.x * o.vel.x + o.vel.z * o.vel.z > 60;
      moveToward(p, mx, mz, (fast ? 11 : 9.6) * prof.speedMul, dt);
      return;
    }
    // zonal: one compact block behind the ball
    zoneSpot(p, T, ball);
    moveToward(p, ZX, ZZ, 9 * prof.speedMul, dt);
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
        moveToward(p, lineX, clamp(cz, -limit - 0.8, limit + 0.8), 14, dt);
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
    profile: function (name) { return PROFILES[name] || PROFILES.NORMAL; },
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
        interceptTime(p, 11.5 * prof.speedMul, 1.9);
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

      if (phase === 0) {
        if (p === T.chaser || ((prof.press2 || pressing) && p === T.chaser2)) {
          moveToward(p, p.icX, p.icZ, 10.8 * prof.speedMul, dt);
          return;
        }
        // loose ball: keep the shape around it
        zoneSpot(p, T, ball);
        moveToward(p, ZX, ZZ, 9 * prof.speedMul, dt);
        return;
      }
      if (phase === 1) { attackOffBall(p, T, prof, dt); return; }
      defend(p, T, prof, dt, pressing);
    }
  };
})(window.RS6 = window.RS6 || {});
