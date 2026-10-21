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
  // shot: speed from SHOT_MIN (a tap) to SHOT_MAX (from half the bar); GH = [gauge, height at the goal line]
  var SHOT_MIN = 26, SHOT_MAX = 58; // a struck shot: much faster than a long ball, so its flight stays flat
  var GH = [[0.10, NS.BALL_R], [0.11, 0.6], [0.30, 1.1], [0.40, 1.7], [0.50, 3.6], [1.0, 9.0]];

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
    passPower: -1,    // 0..1 from a human's hold time (-1 = normal pace, the CPU)

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
      this.markOffside(p);
      if (p.throwIn) { p.throwIn = false; p.throwT = 0.4; }
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
      ball.contester = null;
      ball.pen = false;
      ball.shotD = 0;
      p.dribbling = false;
      p.gkHands = false;
      p.kickT = p.throwT > 0 ? 0 : (type >= ACT.SHOOT ? 0.36 : 0.28); // kick animation (not on a throw-in)
      p.kickHard = type >= ACT.SHOOT || type === ACT.LONG;
      this.lastTarget = null;
      NS.Audio.kick(type >= ACT.SHOOT);
      if (this.onKick) this.onKick(p, type);
    },

    kick: function (p, type, power, ax, az, accuracy, forceTarget) {
      var ball = World.ball;
      // a throw-in is thrown to a team-mate (no shots from the touchline); a corner / goal kick may not be shot either
      if (p.throwIn && type !== ACT.LONG && type !== ACT.THROUGH) type = ACT.PASS;
      if (World.match.restart && type >= ACT.SHOOT && type !== ACT.CHIP) type = ACT.LONG;
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
          vy = Math.min(9, (1.3 + power * 0.9 - ball.pos.y) / cT + 0.5 * G * cT);
          ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
          ball.spinY = side * attack * 30;
          return;
        }
        if (type === ACT.CHIP) {
          // lofted shot that drops into the goal over the keeper
          var dg = Math.abs(goalX - p.pos.x) - 1;
          if (dg < 3) dg = 3;
          var chipFar = dg > 32; // a chip only carries ~32: from further it drops short
          if (chipFar) dg = 32;
          var Tc = clamp(dg / 15, 0.9, 1.7);
          var cz = aimed ? az * GOAL_HALF_W * 0.6 : 0;
          var cdx = chipFar ? attack * 32 : goalX - attack - p.pos.x;
          var cdz = chipFar ? 0 : cz - p.pos.z;
          var cd = Math.sqrt(cdx * cdx + cdz * cdz) || 1;
          var cs = airSpeed(cd, Tc);
          ball.pos.y = NS.BALL_R + 0.15;
          ball.vel.set(cdx / cd * cs, 0.5 * G * Tc, cdz / cd * cs);
          ball.spinY = 0;
          return;
        }
        // Driven shot. Where: the stick picks the side; without it, the far side from the keeper.
        // How: `power` is the gauge (see driveShot).
        var gk = null;
        for (var gi = 0; gi < World.players.length; gi++) {
          var q = World.players[gi];
          if (q.role === 'GK' && q.team !== p.team) { gk = q; break; }
        }
        var goalZ;
        if (aimed) goalZ = clamp(az, -1, 1) * (GOAL_HALF_W - 0.9);
        else goalZ = (gk && gk.pos.z > p.pos.z * 0.15 ? -1 : 1) * (GOAL_HALF_W - 1.3);
        this.driveShot(p, goalZ, power, accuracy, aimed ? clamp(az, -1, 1) : 0);
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

    // The shot gauge g (0..1, the power bar) sets the height where the ball crosses the goal line, from anywhere:
    //   0-10% along the ground, 11% just off the grass, 30% waist, 40% chest, 50% the crossbar, then over into the stands.
    // Pace builds up over the first half of the bar (full pace from 50%), so a well-placed shot is also a hard one.
    gaugeHeight: function (g) {
      if (g <= GH[0][0]) return -1; // along the ground
      for (var i = 1; i < GH.length; i++) {
        if (g <= GH[i][0]) {
          var a = GH[i - 1], b = GH[i];
          return a[1] + (b[1] - a[1]) * (g - a[0]) / (b[0] - a[0]);
        }
      }
      return GH[GH.length - 1][1];
    },
    // gauge for a height at the goal line (distance does not matter any more; kept in the signature for the callers)
    gaugeFor: function (d, h) {
      if (h <= 0.5) return 0.08;
      for (var i = 1; i < GH.length; i++) {
        if (h <= GH[i][1]) {
          var a = GH[i - 1], b = GH[i];
          return a[0] + (b[0] - a[0]) * (h - a[1]) / (b[1] - a[1]);
        }
      }
      return 1;
    },
    shotSpeed: function (g) { return SHOT_MIN + (SHOT_MAX - SHOT_MIN) * Math.pow(Math.min(1, g / 0.5), 0.7); },
    driveShot: function (p, goalZ, g, accuracy, bend) {
      var ball = World.ball;
      var attack = p.team === 0 ? 1 : -1;
      g = clamp(g, 0, 1);
      var goalX = attack * HALF_W;
      var sdx = goalX - ball.pos.x, sdz = goalZ - ball.pos.z; // from the ball (in front of his foot)
      var sd = Math.sqrt(sdx * sdx + sdz * sdz);
      ball.shotD = sd; // the keeper sees a shot from range coming for longer
      // his Shoot rating: accuracy (a great finisher misses by much less) and pace
      var err = (0.016 + sd * 0.0015) * (accuracy || 1) * (0.6 + g * 0.7) * (1.7 - p.st.sht / 99 * 1.1);
      var angle = Math.atan2(sdx, sdz) + gaussR() * err;
      var speed = this.shotSpeed(g) * (0.9 + p.st.sht / 99 * 0.14);
      var ty = this.gaugeHeight(g);
      var vy;
      if (ty < 0) {
        vy = 0; // along the ground: struck twice as hard (the grass takes a lot of it)
        ball.pos.y = NS.BALL_R;
        speed = Math.min(SHOT_MAX, speed * 2);
      } else {
        ty += gaussR() * err * sd * 0.3;
        var kd = sd * AIR_K / speed;
        var Ts = kd < 0.9 ? -Math.log(1 - kd) / AIR_K : sd / speed * 1.6; // time to the goal line, air drag included
        vy = (ty - ball.pos.y) / Ts + 0.5 * G * Ts;
        if (vy < 0) vy = 0;
        if (vy > 22) vy = 22;
      }
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      // aimed shots bend a little towards the corner; hard-struck shots wobble (knuckle)
      ball.spinY = -(bend || 0) * attack * 1.6 + (g > 0.8 ? (Math.random() - 0.5) * 3 : 0);
    },

    // CPU / penalty shot at an exact target: goal z and gauge.
    shootAt: function (p, goalZ, g, accuracy) {
      this.release(p, ACT.SHOOT);
      this.driveShot(p, goalZ, g, accuracy, 0);
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

      if (p.throwT > 0.35) {
        // thrown from over the head: a flat lob that lands at the target (a long throw reaches ~24 m)
        if (d > 24) { dx *= 24 / d; dz *= 24 / d; d = 24; }
        var Tt = clamp(d / 20, 0.4, 1.05);
        speed = airSpeed(d, Tt);
        vy = (R0 - ball.pos.y) / Tt + 0.5 * G * Tt;
        if (mate) { mate.runToX = p.pos.x + dx; mate.runToZ = p.pos.z + dz; mate.runToT = Tt + 0.4; }
      } else if (type === ACT.LONG) {
        // lobbed: flight time T, vertical speed from gravity, horizontal speed = distance / T
        var T = clamp(d / 30, 0.75, 1.6);
        vy = 0.5 * G * T;
        speed = airSpeed(d, T);
        ball.pos.y = NS.BALL_R + 0.15;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = T + 0.7; }
      } else if (type === ACT.THROUGH) {
        speed = forceTarget ? clamp(d * DRAG_K + 4, 11, 32) : clamp(d * DRAG_K + 8, 18, 38);
        vy = 0.8;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = 1.5; }
      } else {
        speed = clamp(d * DRAG_K + 12, 21, 40); // crisp: arrives with pace instead of dying in front of a defender
        vy = 0.6;
        // the receiver comes towards the ball to meet it
        if (mate) { mate.runToX = tx - (dx / d) * 1.5; mate.runToZ = tz - (dz / d) * 1.5; mate.runToT = Math.min(1.0, d / speed + 0.2); }
      }
      // a human held the pass button: a tap is the normal pace, a full hold ~35% firmer (a long ball flies flatter)
      if (this.passPower > 0 && !(p.throwT > 0.35)) {
        var pw = 1 + this.passPower * 0.35;
        speed *= pw;
        if (type === ACT.LONG) vy /= pw;
      }
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      ball.receiver = mate || null;
      this.pickContester(p.team);
    },

    // Offside, read when the ball is played: a team-mate of the kicker is offside when he is in the opponents' half,
    // nearer to their goal line than the ball and than the second-last opponent (the keeper usually being the last).
    // Not from a throw-in, a corner or a goal kick.
    markOffside: function (p) {
      var players = World.players;
      var ball = World.ball;
      var a = p.team === 0 ? 1 : -1;
      var i, q;
      for (i = 0; i < players.length; i++) players[i].offside = false;
      ball.offTeam = -1;
      if (p.throwIn || World.match.restart) return;
      // the two deepest opponents
      var d1 = -1e9, d2 = -1e9;
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.team === p.team) continue;
        var dq = q.pos.x * a;
        if (dq > d1) { d2 = d1; d1 = dq; } else if (dq > d2) d2 = dq;
      }
      var line = Math.max(d2, ball.pos.x * a, 0);
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.team !== p.team || q === p) continue;
        if (q.pos.x * a > line + 0.25) { q.offside = true; ball.offTeam = p.team; }
      }
    },

    // Player q plays the ball. Returns true when he was offside (play stops: this.onOffside), and every flag is cleared
    // either way (the next pass sets them again).
    touch: function (q) {
      var ball = World.ball;
      if (ball.offTeam < 0) return false;
      var off = q.offside && q.team === ball.offTeam;
      var players = World.players;
      for (var i = 0; i < players.length; i++) players[i].offside = false;
      ball.offTeam = -1;
      if (off && this.onOffside) { this.onOffside(q); return true; }
      return false;
    },

    // Shoulder to shoulder while running for the ball / pressing: the challenger leans into the carrier. He may win it
    // (or knock it loose) when he is alongside, rarely from behind; otherwise both are bumped off their line.
    // Never a foul. Returns true when the ball changed hands or came loose.
    shoulder: function (p, c, skill) {
      var ball = World.ball;
      if (!c || ball.owner !== c || c.team === p.team || c.gkHands || c.throwIn || World.match.protectT > 0) return false;
      var dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      if (d > 1.9) return false;
      var front = -(Math.sin(c.facing) * dx + Math.cos(c.facing) * dz) / d; // +1 in front of him, -1 behind
      p.shoulderT = 0.32;
      p.shoulderDir = (Math.cos(p.facing) * dx - Math.sin(p.facing) * dz) > 0 ? 1 : -1;
      // body strength ~ Defense and Header (aerial / physical) against his Dribble and balance
      var strength = (p.st.def * 0.6 + p.st.hdr * 0.4) / 99;
      var chance = (skill || 0.3) * (0.55 + strength * 0.7) * (1.35 - c.st.drb / 99 * 0.7);
      if (front < -0.55) chance *= 0.3;       // from behind: his back shields the ball
      else if (front > 0.45) chance *= 0.8;  // in front: it is a tackle's job
      if (c.dribbling) chance *= 0.8;
      // the bump: the carrier is pushed away from the challenger and slowed, the challenger loses a little speed
      var nx = dx / d, nz = dz / d;
      c.vel.x = c.vel.x * 0.8 + nx * 2.6; c.vel.z = c.vel.z * 0.8 + nz * 2.6;
      p.vel.x *= 0.85; p.vel.z *= 0.85;
      NS.Audio.tackle();
      if (Math.random() >= clamp(chance, 0.03, 0.6)) return false;
      ball.receiver = null;
      ball.contester = null;
      if (Math.random() < 0.5) {
        // he takes it off him
        ball.owner = p;
        ball.lastTouchTeam = p.team;
        ball.lastToucher = p.name;
        ball.pickupCooldown = 0.12;
        this.touch(p);
      } else {
        // knocked loose: it runs on ahead, whoever is first gets it
        ball.owner = null;
        ball.vel.set(c.vel.x * 0.9 - nz * 1.5 * p.shoulderDir, 0, c.vel.z * 0.9 + nx * 1.5 * p.shoulderDir);
        ball.lastTouchTeam = p.team;
        ball.pickupCooldown = 0.08;
        ball.kicker = c; ball.kickerT = 0.35;
      }
      c.dribbling = false;
      c.stun = 0.3;
      c.fallT = 0.4;
      return true;
    },

    // The opponent who can reach the pass first goes for it too (he is marked like a receiver).
    pickContester: function (team) {
      var players = World.players;
      var best = null, bestT = 1e9;
      for (var i = 0; i < players.length; i++) {
        var o = players[i];
        if (o.team === team || o.role === 'GK' || o.stun > 0) continue;
        var t = World.intercept(o, 11, 1.9);
        if (t < bestT) { bestT = t; best = o; }
      }
      World.ball.contester = best;
    },

    // A header is allowed when the ball is at head height, within reach of p, and nobody is closer to it
    // (a player between him and the ball would get there first).
    canHead: function (p) {
      var ball = World.ball;
      if (ball.owner || ball.pos.y < 1.5 || ball.pos.y > 3.6 || p.stun > 0) return false; // up to 3.6: he jumps for it
      if (p === ball.kicker && ball.kickerT > 0) return false;
      var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 > 1.7 * (0.75 + p.st.hdr / 99 * 0.5)) return false; // his Header rating: how far he reaches
      var players = World.players;
      for (var i = 0; i < players.length; i++) {
        var q = players[i];
        if (q === p || q.stun > 0) continue;
        var qx = ball.pos.x - q.pos.x, qz = ball.pos.z - q.pos.z;
        if (qx * qx + qz * qz < d2) return false;
      }
      return true;
    },

    // Header from a ball in the air: a shot at goal (downwards, under the bar) or a headed pass to the team-mate
    // nearest the aim (headers do not carry far, so a long ball becomes a through-ball distance).
    header: function (p, shot, type, ax, az) {
      var ball = World.ball;
      var attack = p.team === 0 ? 1 : -1;
      var y0 = ball.pos.y;
      if (this.touch(p)) return;
      this.release(p, shot ? ACT.SHOOT : type);
      p.kickT = 0;
      p.headT = 0.55; // header animation: the jump
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
      speed *= 0.85 + p.st.hdr / 99 * 0.3; // a good header of the ball puts more on it
      var angle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.1;
      var T = d / speed;
      ball.vel.set(Math.sin(angle) * speed, (ty - y0) / T + 0.5 * G * T, Math.cos(angle) * speed);
      ball.spinY = 0;
      if (mate) { ball.receiver = mate; mate.runToT = 0; }
      this.pickContester(p.team);
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
      // never from a keeper's hands, nor while a free kick is being taken
      if (!p.tackleHit && carrier && carrier.team !== p.team && !carrier.gkHands && World.match.protectT <= 0) {
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
          // a tackle that goes through the man from behind is a foul (free kick, or a penalty in the box)
          if (front < -0.35 && dx * dx + dz * dz < reach && this.onFoul && World.match.protectT <= 0) {
            p.tackleT = 0;
            p.stun = 1.0;
            carrier.fallT = 0.55;
            this.onFoul(p, carrier);
            return;
          }
          // the tackler's Defense against the carrier's Dribble
          var chance = (baseChance + (p.tackleSlide ? 0.08 : 0)) * (0.6 + p.st.def / 99 * 0.6) * (1.3 - carrier.st.drb / 99 * 0.6);
          if (front < -0.35) chance *= p.tackleSlide ? 0.22 : 0.1; // from behind: the carrier's body shields the ball
          else if (front < 0.3) chance *= 0.6;                      // from the side
          else chance *= 1.08;
          if (carrier.dribbling) chance *= 0.75;
          chance = clamp(chance, 0.03, 0.92);
          if (Math.random() < chance) {
            ball.owner = p;
            ball.receiver = null;
            ball.contester = null;
            ball.lastTouchTeam = p.team;
            ball.lastToucher = p.name;
            ball.pickupCooldown = 0.12;
            this.touch(p);
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
