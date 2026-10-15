/* Player actions shared by humans and the AI: pass / through ball / long ball / shot, tackle, press, switch. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var G = 24.0;
  var DRAG_K = 1.273; // -ln(0.28): ground speed needed per unit of distance

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var Actions = {
    lastTarget: null, // receiver of the last pass (so the cursor can follow it)

    // Best team-mate for a pass of the given type. (ax, az) is the aim direction (0,0 = facing).
    pickTarget: function (passer, ax, az, type) {
      var players = World.players;
      var al = Math.sqrt(ax * ax + az * az);
      var fx, fz;
      if (al > 0.1) { fx = ax / al; fz = az / al; } else { fx = Math.sin(passer.facing); fz = Math.cos(passer.facing); }
      var attack = passer.team === 0 ? 1 : -1;
      var minD = type === ACT.LONG ? 16 : (type === ACT.THROUGH ? 7 : 3);
      var maxD = type === ACT.LONG ? 64 : (type === ACT.THROUGH ? 38 : 26);
      var best = null;
      var bestScore = -1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== passer.team || m === passer || m.role === 'GK') continue;
        var dx = m.pos.x - passer.pos.x;
        var dz = m.pos.z - passer.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < minD || d > maxD) continue;
        var dot = (dx * fx + dz * fz) / d;
        if (dot < -0.15) continue;
        var score = dot * 3 - d * 0.03;
        if (type !== ACT.PASS) score += m.pos.x * attack * 0.05;
        // penalty when an opponent stands next to the receiver
        for (var j = 0; j < players.length; j++) {
          var o = players[j];
          if (o.team === passer.team) continue;
          var ox = o.pos.x - m.pos.x;
          var oz = o.pos.z - m.pos.z;
          if (ox * ox + oz * oz < 16) { score -= 1.4; break; }
        }
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return best;
    },

    // type: ACT.PASS | THROUGH | LONG | SHOOT, power 0..1, (ax, az) aim input.
    kick: function (p, type, power, ax, az, accuracy) {
      var ball = World.ball;
      ball.owner = null;
      ball.pickupCooldown = 0.28;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.hard = type === ACT.SHOOT;
      p.dribbling = false;
      this.lastTarget = null;
      var attack = p.team === 0 ? 1 : -1;
      NS.Audio.kick(type === ACT.SHOOT);

      var angle, speed, vy, d, tx, tz;
      if (type === ACT.SHOOT) {
        var goalX = attack * HALF_W;
        var goalZ = (az > 0.1 || az < -0.1) ? az * GOAL_HALF_W * 0.85 : clamp(-p.pos.z * 0.25, -3, 3);
        angle = Math.atan2(goalX - p.pos.x, goalZ - p.pos.z);
        angle += (Math.random() - 0.5) * (1.05 - power) * 0.16 * (accuracy || 1);
        speed = 22 + power * 20;
        vy = 2.2 + power * 7.5;
        ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
        ball.spinY = -az * 4.5;
        return;
      }

      var mate = this.pickTarget(p, ax, az, type);
      this.lastTarget = mate;
      ball.spinY = 0;
      if (!mate) {
        // nobody in the aimed direction: kick it that way
        var al = Math.sqrt(ax * ax + az * az);
        var kx = al > 0.1 ? ax / al : Math.sin(p.facing);
        var kz = al > 0.1 ? az / al : Math.cos(p.facing);
        d = type === ACT.LONG ? 36 : (type === ACT.THROUGH ? 24 : 14);
        tx = p.pos.x + kx * d; tz = p.pos.z + kz * d;
      } else if (type === ACT.THROUGH) {
        tx = clamp(mate.pos.x + attack * 7, -HALF_W + 2, HALF_W - 2);
        tz = clamp(mate.pos.z + mate.vel.z * 0.4, -HALF_H + 2, HALF_H - 2);
      } else if (type === ACT.LONG) {
        tx = clamp(mate.pos.x + attack * 3, -HALF_W + 2, HALF_W - 2);
        tz = mate.pos.z;
      } else {
        tx = mate.pos.x + mate.vel.x * 0.25;
        tz = mate.pos.z + mate.vel.z * 0.25;
      }
      var dx = tx - p.pos.x;
      var dz = tz - p.pos.z;
      d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.5) d = 0.5;
      angle = Math.atan2(dx, dz);
      angle += (Math.random() - 0.5) * 0.05 * (accuracy || 1);

      if (type === ACT.LONG) {
        // lobbed: flight time T, vertical speed from gravity, horizontal speed = distance / T
        var T = clamp(d / 30, 0.75, 1.6);
        vy = 0.5 * G * T;
        speed = d / T;
        ball.pos.y = NS.BALL_R + 0.15;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = T + 0.7; }
      } else if (type === ACT.THROUGH) {
        speed = clamp(d * DRAG_K + 4, 16, 34);
        vy = 0.8;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = 1.5; }
      } else {
        speed = clamp(d * DRAG_K + 3, 14, 32);
        vy = 0.6;
      }
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
    },

    // Tackle lunge towards the ball carrier.
    startTackle: function (p, carrier, human) {
      var dx = carrier.pos.x + carrier.vel.x * 0.15 - p.pos.x;
      var dz = carrier.pos.z + carrier.vel.z * 0.15 - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.01) d = 0.01;
      p.tackleT = 0.3;
      p.tackleCd = 1.0;
      p.tackleHit = false;
      p.tackleHuman = human;
      p.vel.x = dx / d * 16;
      p.vel.z = dz / d * 16;
      p.facing = Math.atan2(dx, dz);
      NS.Audio.tackle();
    },

    // Resolves a lunge each step: success steals the ball, failure makes the tackler stumble.
    updateTackle: function (p, dt, baseChance) {
      p.tackleT -= dt;
      var ball = World.ball;
      var carrier = ball.owner;
      if (!p.tackleHit && carrier && carrier.team !== p.team) {
        var dx = carrier.pos.x - p.pos.x;
        var dz = carrier.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 3.6) {
          p.tackleHit = true;
          var vx = -dx, vz = -dz;
          var vl = Math.sqrt(vx * vx + vz * vz) || 1;
          var front = (Math.sin(carrier.facing) * (vx / vl) + Math.cos(carrier.facing) * (vz / vl)); // +1 = tackled from the front
          var chance = baseChance * (1 - 0.18 * front);
          if (carrier.dribbling) chance *= 0.6;
          chance = clamp(chance, 0.05, 0.92);
          if (Math.random() < chance) {
            ball.owner = p;
            ball.lastTouchTeam = p.team;
            ball.lastToucher = p.name;
            ball.pickupCooldown = 0.12;
            carrier.stun = 0.55;
            carrier.vel.set(0, 0, 0);
            carrier.dribbling = false;
            p.tackleT = 0;
            p.vel.set(0, 0, 0);
            NS.Audio.kick(false);
          } else {
            p.stun = 0.5;
            p.tackleT = 0;
          }
        }
      }
      if (p.tackleT <= 0 && !p.tackleHit) p.stun = 0.3;
      if (p.tackleT <= 0) { p.vel.x *= 0.3; p.vel.z *= 0.3; }
    },

    // Nearest outfield team-mate to the ball, skipping the excluded players.
    nearestToBall: function (team, exA, exB) {
      var ball = World.ball;
      var players = World.players;
      var best = null;
      var bestD = 1e9;
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        if (p.team !== team || p.role === 'GK' || p === exA || p === exB) continue;
        var dx = p.pos.x - ball.pos.x;
        var dz = p.pos.z - ball.pos.z;
        var d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    }
  };

  NS.Actions = Actions;
})(window.RS6 = window.RS6 || {});
