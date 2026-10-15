/* CPU players: formation shape, chasing/pressing, tackling, ball carrier decisions, goalkeeper. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  var GOAL_HALF_W = NS.GOAL_HALF_W;

  var PROFILES = {
    EASY: { speedMul: 0.84, tackle: 0.3, tackleRate: 1.4, shoot: 0.05, gkSave: 0.6, chasers: 1 },
    NORMAL: { speedMul: 1.0, tackle: 0.5, tackleRate: 2.2, shoot: 0.07, gkSave: 0.72, chasers: 1 },
    HARD: { speedMul: 1.1, tackle: 0.62, tackleRate: 2.8, shoot: 0.09, gkSave: 0.8, chasers: 2 },
    LEGEND: { speedMul: 1.2, tackle: 0.72, tackleRate: 3.2, shoot: 0.11, gkSave: 0.86, chasers: 2 }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function moveToward(p, tx, tz, speed, dt) {
    var dx = tx - p.pos.x;
    var dz = tz - p.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var k = Math.min(1, 10 * dt);
    if (d > 0.65) {
      p.vel.x += (dx / d * speed - p.vel.x) * k;
      p.vel.z += (dz / d * speed - p.vel.z) * k;
      p.facing = Math.atan2(dx, dz);
    } else {
      p.vel.x *= 0.8;
      p.vel.z *= 0.8;
      var ball = World.ball;
      p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
    }
  }

  function nearestOpponentDist(p) {
    var best = 1e9;
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var o = players[i];
      if (o.team === p.team) continue;
      var dx = o.pos.x - p.pos.x;
      var dz = o.pos.z - p.pos.z;
      var d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  function aiCarrier(p, dt, prof) {
    var ball = World.ball;
    var attack = p.team === 0 ? 1 : -1;
    var goalX = attack * HALF_W;
    var distToGoal = Math.abs(goalX - p.pos.x);
    var nearOpp = nearestOpponentDist(p);

    // dribble towards goal, drifting to the centre and away from the closest opponent
    var dirX = goalX - p.pos.x;
    var dirZ = -p.pos.z * 0.35;
    if (nearOpp < 6) dirZ += (p.pos.z >= 0 ? 1 : -1) * 6;
    var dl = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    var speed = 9.6 * prof.speedMul;
    var k = Math.min(1, 10 * dt);
    p.vel.x += (dirX / dl * speed - p.vel.x) * k;
    p.vel.z += (dirZ / dl * speed - p.vel.z) * k;
    p.facing = Math.atan2(p.vel.x, p.vel.z);
    p.dribbling = nearOpp < 5;
    p.carry = p.dribbling ? 0.7 + 0.4 * Math.abs(Math.sin(p.animPhase * 0.5)) : 0.95;

    p.aiCd -= dt;
    if (p.aiCd > 0) return;
    p.aiCd = 0.28;

    if (distToGoal < 24 && Math.random() < prof.shoot * (1 + (24 - distToGoal) / 24)) {
      Actions.kick(p, ACT.SHOOT, 0.55 + Math.random() * 0.4, 0, (Math.random() - 0.5) * 1.6, 1.6);
      return;
    }
    var pressured = nearOpp < 4.5;
    if ((pressured && Math.random() < 0.5) || Math.random() < 0.09) {
      var r = Math.random();
      var type = r < 0.22 ? ACT.LONG : (r < 0.5 ? ACT.THROUGH : ACT.PASS);
      Actions.kick(p, type, 0.6, attack, 0, 2);
    }
  }

  function aiGoalkeeper(p, dt, prof) {
    var ball = World.ball;
    var dir = p.team === 0 ? 1 : -1;
    if (ball.owner === p) {
      p.gkHold += dt;
      p.vel.x *= 0.8; p.vel.z *= 0.8;
      if (p.gkHold > 0.7) {
        Actions.kick(p, Math.random() < 0.5 ? ACT.LONG : ACT.PASS, 0.6, dir, (Math.random() - 0.5), 1.5);
        p.gkHold = 0;
      }
      return;
    }
    p.gkHold = 0;
    var gkX = -dir * (HALF_W - 2.5);
    var limit = GOAL_HALF_W - 0.5;
    var tz = clamp(ball.pos.z * 0.55, -limit, limit);
    var speed = 9;
    var towardGoal = ball.vel.x * -dir; // >0 = ball travelling at our goal
    if (towardGoal > 6 && !ball.owner) {
      var t = (gkX - ball.pos.x) / ball.vel.x;
      if (t > 0 && t < 2.2) {
        tz = clamp(ball.pos.z + ball.vel.z * t, -limit - 0.6, limit + 0.6);
        speed = 15;
      }
    }
    // rush out for a slow loose ball inside the box
    var bdx = ball.pos.x - gkX;
    if (!ball.owner && ball.pickupCooldown <= 0 && Math.abs(bdx) < 12 && Math.abs(ball.pos.z) < 11 &&
        ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z < 60) {
      moveToward(p, ball.pos.x, ball.pos.z, 10.5 * prof.speedMul, dt);
      return;
    }
    moveToward(p, gkX, tz, speed, dt);
  }

  NS.AI = {
    profiles: PROFILES,
    profile: function (name) { return PROFILES[name] || PROFILES.NORMAL; },

    // rank = 0 for the team's closest outfield player to the ball.
    step: function (p, dt, rank, prof, pressing) {
      var ball = World.ball;
      if (p.role === 'GK') { aiGoalkeeper(p, dt, prof); return; }
      if (ball.owner === p) { aiCarrier(p, dt, prof); return; }

      p.dribbling = false;
      p.carry = 0.95;
      var attack = p.team === 0 ? 1 : -1;
      var carrier = ball.owner;
      var ownBall = carrier !== null && carrier.team === p.team;
      var oppBall = carrier !== null && carrier.team !== p.team;

      var chasers = prof.chasers;
      if (pressing) chasers = 3;
      var engage = false;
      if (oppBall) {
        var cdx = carrier.pos.x - p.pos.x;
        var cdz = carrier.pos.z - p.pos.z;
        var cd2 = cdx * cdx + cdz * cdz;
        // any defender in reach tries to win the ball, not only the closest one
        if (cd2 < 6.8 && p.tackleCd <= 0 && Math.random() < prof.tackleRate * dt) {
          Actions.startTackle(p, carrier, false);
          return;
        }
        engage = cd2 < 100;
      }
      var tx, tz, speed;
      if (p.runToT > 0) {
        p.runToT -= dt;
        tx = p.runToX; tz = p.runToZ; speed = 11.5 * prof.speedMul;
      } else if (!ownBall && (rank < chasers || engage)) {
        // chase / press the ball (aim slightly ahead of a moving ball)
        tx = ball.pos.x + ball.vel.x * 0.25;
        tz = ball.pos.z + ball.vel.z * 0.25;
        speed = (10.2 + (pressing ? 1.2 : 0)) * prof.speedMul;
      } else {
        var shiftX = ball.pos.x * 0.42 + (ownBall ? attack * 9 : 0);
        if (ownBall && p.role === 'FWD') shiftX += attack * 6;
        if (pressing && !ownBall) shiftX += attack * 6;
        tx = clamp(p.homeX + shiftX, -HALF_W + 4, HALF_W - 4);
        tz = clamp(p.homeZ + ball.pos.z * 0.22, -HALF_H + 3, HALF_H - 3);
        speed = 8.4 * prof.speedMul;
      }
      moveToward(p, tx, tz, speed, dt);
    }
  };
})(window.RS6 = window.RS6 || {});
