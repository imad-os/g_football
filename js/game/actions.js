/* Player actions shared by humans and the AI: pass / through ball / long ball / shot, tackle, press, switch. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var G = NS.PHYS.G;
  var DRAG_K = NS.PHYS.ROLL_K; // ground speed needed per unit of distance
  var AIR_K = NS.PHYS.AIR_K;
  var R0 = NS.BALL_R;

  // Horizontal launch speed so a ball in the air for T seconds covers d (air drag included).
  function airSpeed(d, T) { return d * AIR_K / (1 - Math.exp(-AIR_K * T)); }

  // Pass assistance per kick type (index = ACT.PASS / THROUGH / LONG): preferred distance, accepted range,
  // how far ahead the receiver's run is read.
  var IDEAL_D = [0, 11, 18, 32];
  var MIN_D = [0, 3, 6, 14];
  var MAX_D = [0, 32, 44, 72];
  var LEAD_T = [0, 0.3, 0.55, 0.8];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function gaussR() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; } // ~N(0, 1)

  var Actions = {
    lastTarget: null, // receiver of the last pass (so the cursor can follow it)

    // Assisted pass: the team-mate nearest to where the ball is aimed (stick direction, or facing without input),
    // at a distance that suits the pass type (short / through / long), not marked tight, with a free lane.
    pickTarget: function (passer, ax, az, type) {
      var al = Math.sqrt(ax * ax + az * az);
      var fx, fz;
      if (al > 0.1) { fx = ax / al; fz = az / al; } else { fx = Math.sin(passer.facing); fz = Math.cos(passer.facing); }
      var t = type >= ACT.PASS && type <= ACT.LONG ? type : ACT.PASS;
      var best = this.scanTargets(passer, fx, fz, t, 0.34); // within ~70 degrees of the aim
      if (!best) best = this.scanTargets(passer, fx, fz, t, -0.2);
      return best;
    },

    scanTargets: function (passer, fx, fz, t, minDot) {
      var players = World.players;
      var attack = passer.team === 0 ? 1 : -1;
      var lofted = t === ACT.LONG;
      var best = null;
      var bestScore = -1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== passer.team || m === passer || m.role === 'GK' || m.stun > 0) continue;
        // where the receiver will be when the ball gets there
        var mx = m.pos.x + m.vel.x * LEAD_T[t];
        var mz = m.pos.z + m.vel.z * LEAD_T[t];
        var dx = mx - passer.pos.x;
        var dz = mz - passer.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < MIN_D[t] || d > MAX_D[t]) continue;
        var dot = (dx * fx + dz * fz) / d;
        if (dot < minDot) continue;
        var ang = Math.acos(dot > 1 ? 1 : dot);
        var off = Math.abs(d - IDEAL_D[t]) / IDEAL_D[t];
        var score = -ang * 2.8 - off * 0.6;
        if (t !== ACT.PASS) score += (m.pos.x - passer.pos.x) * attack * 0.012; // through / long balls go forward
        for (var j = 0; j < players.length; j++) {
          var o = players[j];
          if (o.team === passer.team || o.stun > 0) continue;
          // receiver marked tight
          var rx = o.pos.x - mx, rz = o.pos.z - mz;
          if (rx * rx + rz * rz < 9) score -= 0.45;
          // opponent standing in the lane (a lofted ball only cares about the landing area)
          var ox = o.pos.x - passer.pos.x;
          var oz = o.pos.z - passer.pos.z;
          var u = (ox * dx + oz * dz) / d;
          if (u < 1 || u > d - 1) continue;
          if (lofted && u < d * 0.8) continue;
          var perp = Math.abs(ox * dz - oz * dx) / d;
          if (perp < 1.8) score -= 0.7;
          else if (perp < 3) score -= 0.25;
        }
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return best;
    },

    // type: ACT.PASS | THROUGH | LONG | SHOOT, power 0..1, (ax, az) aim input.
    // The ball leaves the player's foot (shared by every kick).
    release: function (p, type) {
      var ball = World.ball;
      ball.owner = null;
      ball.pickupCooldown = 0.28;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = p;
      ball.kickerT = 0.5;
      ball.gkTried = 0;
      ball.hard = type === ACT.SHOOT || type === ACT.CURVE;
      ball.chip = type === ACT.CHIP;
      ball.receiver = null;
      p.dribbling = false;
      p.gkHands = false;
      p.kickT = type >= ACT.SHOOT ? 0.36 : 0.28; // kick animation
      p.kickHard = type >= ACT.SHOOT || type === ACT.LONG;
      this.lastTarget = null;
      NS.Audio.kick(type >= ACT.SHOOT);
      if (this.onKick) this.onKick(p, type);
    },

    kick: function (p, type, power, ax, az, accuracy, forceTarget) {
      var ball = World.ball;
      this.release(p, type);
      var attack = p.team === 0 ? 1 : -1;

      var angle, speed, vy, d, tx, tz;
      if (type >= ACT.SHOOT) {
        var goalX = attack * HALF_W;
        var aimed = az > 0.1 || az < -0.1;
        if (type === ACT.CURVE) {
          // aim outside the post on the far side and curl back in
          var side = aimed ? (az > 0 ? 1 : -1) : (p.pos.z > 0 ? -1 : 1);
          var curveZ = -side * (GOAL_HALF_W + 2);
          angle = Math.atan2(goalX - p.pos.x, curveZ - p.pos.z);
          angle += (Math.random() - 0.5) * (1.05 - power) * 0.1 * (accuracy || 1);
          speed = 30 + power * 12;
          var cvx = goalX - p.pos.x, cvz = curveZ - p.pos.z;
          var cT = Math.sqrt(cvx * cvx + cvz * cvz) / speed;
          vy = (1.3 + power * 0.9 - ball.pos.y) / cT + 0.5 * G * cT;
          ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
          ball.spinY = side * attack * 30;
          return;
        }
        if (type === ACT.CHIP) {
          // lofted shot that drops into the goal over the keeper
          var dg = Math.abs(goalX - p.pos.x) - 1;
          if (dg < 3) dg = 3;
          var Tc = clamp(dg / 15, 0.9, 1.7);
          var cz = aimed ? az * GOAL_HALF_W * 0.6 : 0;
          var cdx = goalX - attack - p.pos.x;
          var cdz = cz - p.pos.z;
          var cd = Math.sqrt(cdx * cdx + cdz * cdz) || 1;
          var cs = airSpeed(cd, Tc);
          ball.pos.y = NS.BALL_R + 0.15;
          ball.vel.set(cdx / cd * cs, 0.5 * G * Tc, cdz / cd * cs);
          ball.spinY = 0;
          return;
        }
        // Driven shot: aimed at a point in the goal and struck on a real trajectory (not lobbed).
        // Where: the stick picks the side; without it, the far side from the keeper.
        var gk = null;
        for (var gi = 0; gi < World.players.length; gi++) {
          var q = World.players[gi];
          if (q.role === 'GK' && q.team !== p.team) { gk = q; break; }
        }
        var goalZ;
        if (aimed) goalZ = clamp(az, -1, 1) * (GOAL_HALF_W - 0.9);
        else goalZ = (gk && gk.pos.z > p.pos.z * 0.15 ? -1 : 1) * (GOAL_HALF_W - 1.3);
        // How high: power decides (soft = low and placed, full power = rising towards the top corner)
        var ty = 0.45 + power * power * 2.5;
        var sdx = goalX - p.pos.x, sdz = goalZ - p.pos.z;
        var sd = Math.sqrt(sdx * sdx + sdz * sdz);
        // error grows with distance, power and the shooter's accuracy
        var err = (0.018 + sd * 0.0016) * (accuracy || 1) * (0.55 + power * 0.8);
        angle = Math.atan2(sdx, sdz) + gaussR() * err;
        ty += gaussR() * err * sd * 0.5 + (power > 0.9 ? Math.random() * 0.9 : 0);
        speed = 24 + power * 22;
        var kd = sd * AIR_K / speed;
        var Ts = kd < 0.9 ? -Math.log(1 - kd) / AIR_K : sd / speed * 1.6; // time to the goal line, air drag included
        vy = (ty - ball.pos.y) / Ts + 0.5 * G * Ts;
        ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
        // aimed shots bend a little towards the corner; full-power shots wobble (knuckle)
        ball.spinY = (aimed ? -clamp(az, -1, 1) * attack * 1.6 : 0) + (power > 0.8 ? (Math.random() - 0.5) * 3 : 0);
        return;
      }

      var mate = forceTarget || this.pickTarget(p, ax, az, type);
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
        if (forceTarget) {
          tx = mate.pos.x + mate.vel.x * 0.5;
          tz = mate.pos.z + mate.vel.z * 0.4;
        } else {
          // into the space ahead of the receiver: along the aim, pulled towards the goal he attacks
          var al2 = Math.sqrt(ax * ax + az * az);
          var lx = (al2 > 0.1 ? ax / al2 : Math.sin(p.facing)) * 0.6 + attack * 0.4;
          var lz = (al2 > 0.1 ? az / al2 : Math.cos(p.facing)) * 0.6;
          var ll = Math.sqrt(lx * lx + lz * lz) || 1;
          tx = mate.pos.x + mate.vel.x * 0.4 + lx / ll * 6.5;
          tz = mate.pos.z + mate.vel.z * 0.4 + lz / ll * 6.5;
        }
        tx = clamp(tx, -HALF_W + 2, HALF_W - 2);
        tz = clamp(tz, -HALF_H + 2, HALF_H - 2);
      } else if (type === ACT.LONG) {
        // lands where the receiver will be (he reads the flight and goes to the landing spot)
        var ldx = mate.pos.x - p.pos.x, ldz = mate.pos.z - p.pos.z;
        var lT = clamp(Math.sqrt(ldx * ldx + ldz * ldz) / 30, 0.75, 1.6);
        tx = clamp(mate.pos.x + mate.vel.x * lT * 0.6 + attack * 2, -HALF_W + 2, HALF_W - 2);
        tz = clamp(mate.pos.z + mate.vel.z * lT * 0.6, -HALF_H + 2, HALF_H - 2);
      } else {
        tx = mate.pos.x + mate.vel.x * 0.25;
        tz = mate.pos.z + mate.vel.z * 0.25;
      }
      this.launch(p, type, tx, tz, mate, accuracy, forceTarget);
    },

    // AI pass to an exact point (receiver runs onto it).
    kickTo: function (p, type, tx, tz, mate, accuracy) {
      this.release(p, type);
      this.lastTarget = mate;
      World.ball.spinY = 0;
      this.launch(p, type, clamp(tx, -HALF_W + 2, HALF_W - 2), clamp(tz, -HALF_H + 2, HALF_H - 2), mate, accuracy, null);
    },

    launch: function (p, type, tx, tz, mate, accuracy, forceTarget) {
      var ball = World.ball;
      var angle, speed, vy, d;
      var dx = tx - p.pos.x;
      var dz = tz - p.pos.z;
      d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.5) d = 0.5;
      angle = Math.atan2(dx, dz);
      angle += (Math.random() - 0.5) * 0.05 * (accuracy || 1) * (d > 25 ? 1.6 : 1);

      if (type === ACT.LONG) {
        // lobbed: flight time T, vertical speed from gravity, horizontal speed = distance / T
        var T = clamp(d / 30, 0.75, 1.6);
        vy = 0.5 * G * T;
        speed = airSpeed(d, T);
        ball.pos.y = NS.BALL_R + 0.15;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = T + 0.7; }
      } else if (type === ACT.THROUGH) {
        speed = forceTarget ? clamp(d * DRAG_K + 2, 9, 30) : clamp(d * DRAG_K + 4, 16, 34);
        vy = 0.8;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = 1.5; }
      } else {
        speed = clamp(d * DRAG_K + 8, 18, 34); // crisp: arrives with pace instead of dying in front of a defender
        vy = 0.6;
        // the receiver comes towards the ball to meet it
        if (mate) { mate.runToX = tx - (dx / d) * 1.5; mate.runToZ = tz - (dz / d) * 1.5; mate.runToT = Math.min(1.0, d / speed + 0.2); }
      }
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      ball.receiver = mate || null;
    },

    // Header from a ball in the air: a shot at goal (downwards, under the bar) or a headed pass to the team-mate
    // nearest the aim (headers do not carry far, so a long ball becomes a through-ball distance).
    header: function (p, shot, type, ax, az) {
      var ball = World.ball;
      var attack = p.team === 0 ? 1 : -1;
      var y0 = ball.pos.y;
      this.release(p, shot ? ACT.SHOOT : type);
      p.kickT = 0;
      p.headT = 0.4; // header animation
      var tx, tz, speed, mate = null, ty = R0;
      if (shot) {
        var aimed = az > 0.1 || az < -0.1;
        tx = attack * (HALF_W + 1);
        tz = aimed ? az * GOAL_HALF_W * 0.8 : clamp(-p.pos.z * 0.3, -3, 3) + (Math.random() - 0.5) * 4;
        ty = 1.0;
      } else {
        mate = this.pickTarget(p, ax, az, type === ACT.PASS ? ACT.PASS : ACT.THROUGH);
        if (mate) {
          tx = mate.pos.x + mate.vel.x * 0.5;
          tz = mate.pos.z + mate.vel.z * 0.5;
        } else {
          var al = Math.sqrt(ax * ax + az * az);
          tx = p.pos.x + (al > 0.1 ? ax / al : Math.sin(p.facing)) * 10;
          tz = p.pos.z + (al > 0.1 ? az / al : Math.cos(p.facing)) * 10;
        }
        tx = clamp(tx, -HALF_W + 2, HALF_W - 2);
        tz = clamp(tz, -HALF_H + 2, HALF_H - 2);
      }
      var dx = tx - p.pos.x;
      var dz = tz - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1) d = 1;
      speed = shot ? clamp(d * 1.1 + 8, 18, 28) : clamp(d * 0.9 + 5, 9, 20);
      var angle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.1;
      var T = d / speed;
      ball.vel.set(Math.sin(angle) * speed, (ty - y0) / T + 0.5 * G * T, Math.cos(angle) * speed);
      ball.spinY = 0;
      if (mate) { ball.receiver = mate; mate.runToT = 0; }
      this.lastTarget = mate;
    },

    // One-two: short pass, the receiver plays it straight back into the space the passer runs into.
    oneTwo: function (p, ax, az) {
      var attack = p.team === 0 ? 1 : -1;
      this.kick(p, ACT.PASS, 0.6, ax, az, 1);
      var m = this.lastTarget;
      if (m) {
        m.returnTo = p;
        m.returnT = 0;
        m.returnExp = 3;
        p.runToX = clamp(p.pos.x + attack * 16, -HALF_W + 3, HALF_W - 3);
        p.runToZ = clamp(p.pos.z + (m.pos.z > p.pos.z ? -7 : 7), -HALF_H + 3, HALF_H - 3);
        p.runToT = 1.6;
      }
      return m;
    },

    // Tackle lunge towards the ball carrier (slide = longer, wider, riskier).
    startTackle: function (p, carrier, human, slide) {
      var dx = carrier.pos.x + carrier.vel.x * 0.15 - p.pos.x;
      var dz = carrier.pos.z + carrier.vel.z * 0.15 - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.01) d = 0.01;
      p.tackleT = slide ? 0.45 : 0.3;
      p.tackleCd = slide ? 1.4 : 1.0;
      p.tackleHit = false;
      p.tackleHuman = human;
      p.tackleSlide = !!slide;
      if (slide) p.slideT = 0.85; else p.lungeT = 0.36; // animations
      var lunge = slide ? 19 : 16;
      p.vel.x = dx / d * lunge;
      p.vel.z = dz / d * lunge;
      p.facing = Math.atan2(dx, dz);
      NS.Audio.tackle();
    },

    // Resolves a lunge each step: success steals the ball, failure makes the tackler stumble.
    updateTackle: function (p, dt, baseChance) {
      p.tackleT -= dt;
      var ball = World.ball;
      var carrier = ball.owner;
      if (!p.tackleHit && carrier && carrier.team !== p.team && !carrier.gkHands) { // never from a keeper's hands
        var dx = carrier.pos.x - p.pos.x;
        var dz = carrier.pos.z - p.pos.z;
        var bx = ball.pos.x - p.pos.x;
        var bz = ball.pos.z - p.pos.z;
        var reach = p.tackleSlide ? 6.4 : 3.6;
        if (dx * dx + dz * dz < reach || bx * bx + bz * bz < reach) {
          p.tackleHit = true;
          var cl = Math.sqrt(dx * dx + dz * dz) || 1;
          // +1 = the tackler comes from the front (where the ball is), -1 = from behind
          var front = -(Math.sin(carrier.facing) * dx + Math.cos(carrier.facing) * dz) / cl;
          var chance = baseChance + (p.tackleSlide ? 0.08 : 0);
          if (front < -0.35) chance *= p.tackleSlide ? 0.22 : 0.1; // from behind: the carrier's body shields the ball
          else if (front < 0.3) chance *= 0.6;                      // from the side
          else chance *= 1.08;
          if (carrier.dribbling) chance *= 0.75;
          chance = clamp(chance, 0.03, 0.92);
          if (Math.random() < chance) {
            ball.owner = p;
            ball.receiver = null;
            ball.lastTouchTeam = p.team;
            ball.lastToucher = p.name;
            ball.pickupCooldown = 0.12;
            carrier.stun = 0.55;
            carrier.fallT = 0.55;
            carrier.vel.set(0, 0, 0);
            carrier.dribbling = false;
            p.tackleT = 0;
            p.vel.set(0, 0, 0);
            NS.Audio.kick(false);
          } else {
            p.stun = (p.tackleSlide ? 0.9 : 0.5) + (front < -0.35 ? 0.3 : 0);
            p.tackleT = 0;
          }
        }
      }
      if (p.tackleT <= 0 && !p.tackleHit) p.stun = p.tackleSlide ? 0.6 : 0.3;
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
