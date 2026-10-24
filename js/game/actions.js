/* Player actions shared by humans and the AI: pass / through ball / long ball / shot, tackle, press, switch. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var G = NS.PHYS.G;
  var DRAG_K = NS.PHYS.ROLL_K; // ground speed needed per unit of distance
  var AIR_K = NS.PHYS.AIR_K;
  var R0 = NS.BALL_R;
  var THROW_Y = 1.2;  // a throw-in comes down to the receiver at this height (his waist)
  // pressed shoulder to shoulder (Actions.shoulder): for BUMP_T seconds his kicks miss by BUMP_ACC x more, BUMP_POW of the pace
  var BUMP_T = 1.2, BUMP_ACC = 2.2, BUMP_POW = 0.88;
  // shot: speed from SHOT_MIN (a tap) to SHOT_MAX (from half the bar); GH = [gauge, height at the goal line]
  var SHOT_MIN = 26, SHOT_MAX = 58; // a struck shot: much faster than a long ball, so its flight stays flat
  var GH = [[0.10, NS.BALL_R], [0.11, 0.6], [0.30, 1.1], [0.40, 1.7], [0.50, NS.GOAL_HEIGHT], [1.0, 9.0]]; // (50%: the bar)

  // Horizontal launch speed so a ball in the air for T seconds covers d (air drag included).
  function airSpeed(d, T) { return d * AIR_K / (1 - Math.exp(-AIR_K * T)); }

  // Pass assistance per kick type (index = ACT.PASS / THROUGH / LONG): preferred distance, accepted range,
  // how far ahead the receiver's run is read.
  var IDEAL_D = [0, 11, 18, 32];
  var MIN_D = [0, 3, 6, 14];
  var MAX_D = [0, 52, 56, 72]; // (a ground pass carries ~32 m now it is struck firmly)
  var LEAD_T = [0, 0.3, 0.55, 0.8];
  // a human's power bar (0..1) -> the distance he is passing to: DEPTH0 + DEPTH1 * power
  var DEPTH0 = [0, 6, 10, 18];
  var DEPTH1 = [0, 44, 42, 52];

  // Human reaction: the seconds a player needs between a ball being played and a controlled header / first touch
  var REACT_HEAD = 0.5;
  var HEAD_SHOT_MAX = 22;   // metres from the goal a header at goal can come from
  var REACT_TOUCH = 0.38;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function gaussR() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; } // ~N(0, 1)

  var Actions = {
    lastTarget: null, // receiver of the last pass (so the cursor can follow it)
    passPower: -1,    // 0..1 from a human's hold time (-1 = normal pace, the CPU)
    lob: false,       // the pass being played is a long through ball (ACT.THROUGH, lofted over the defenders)

    // Assisted pass: the team-mate nearest to where the ball is aimed (stick direction, or facing without input),
    // at a distance that suits the pass type (short / through / long), not marked tight, with a free lane.
    pickTarget: function (passer, ax, az, type) {
      var al = Math.sqrt(ax * ax + az * az);
      var fx, fz;
      if (al > 0.1) { fx = ax / al; fz = az / al; } else { fx = Math.sin(passer.facing); fz = Math.cos(passer.facing); }
      var t = type >= ACT.PASS && type <= ACT.LONG ? type : ACT.PASS;
      // a human's power bar says how far: a tap to the near one, a full bar to the one behind him
      var want = this.passPower >= 0 ? DEPTH0[t] + DEPTH1[t] * this.passPower : -1;
      if (this.lob && want >= 0) want = 16 + 36 * this.passPower; // a long through ball: a tap = 16 m, a full bar = the far runner
      // the stick first: somebody within ~35 degrees of it, else ~70, else wider
      var best = this.scanTargets(passer, fx, fz, t, 0.82, want);
      if (!best) best = this.scanTargets(passer, fx, fz, t, 0.34, want);
      if (!best) best = this.scanTargets(passer, fx, fz, t, -0.2, want);
      return best;
    },

    scanTargets: function (passer, fx, fz, t, minDot, want) {
      var players = World.players;
      var attack = NS.attack(passer.team);
      var lofted = t === ACT.LONG || (t === ACT.THROUGH && this.lob);
      var ideal = this.lob && t === ACT.THROUGH ? 30 : IDEAL_D[t];
      var best = null;
      var bestScore = -1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== passer.team || m === passer || m.stun > 0) continue;
        // the keeper: a pass back to him when the stick points at him (never a through ball or a long ball)
        if (m.role === 'GK' && t !== ACT.PASS) continue;
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
        // what decides: the stick's direction most (the angle off it, and how far off its line he stands), then the
        // power bar (how far); the assist (free lane, marked, a run) only tips a close call
        var side = d * Math.sin(ang); // how far off the aimed line he is
        var off, score = -ang * 5 - Math.min(side, 20) * 0.04;
        if (want > 0) {
          off = Math.abs(d - want) / Math.max(want, 8);
          score -= off * 1.4;
        } else {
          off = Math.abs(d - ideal) / ideal;
          score -= off * 0.5;
        }
        if (m.role === 'GK') score -= 0.25;
        if (t !== ACT.PASS) score += (m.pos.x - passer.pos.x) * attack * 0.006; // through / long balls go forward
        if (t === ACT.THROUGH && m.runT > 0) score += 0.2; // a team-mate making a run in behind
        for (var j = 0; j < players.length; j++) {
          var o = players[j];
          if (o.team === passer.team || o.stun > 0) continue;
          // receiver marked tight
          var rx = o.pos.x - mx, rz = o.pos.z - mz;
          if (rx * rx + rz * rz < 9) score -= 0.2;
          // opponent standing in the lane (a lofted ball only cares about the landing area)
          var ox = o.pos.x - passer.pos.x;
          var oz = o.pos.z - passer.pos.z;
          var u = (ox * dx + oz * dz) / d;
          if (u < 1 || u > d - 1) continue;
          if (lofted && u < d * 0.8) continue;
          var perp = Math.abs(ox * dz - oz * dx) / d;
          if (perp < 1.8) score -= 0.3;
          else if (perp < 3) score -= 0.1;
        }
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return best;
    },

    // A knock-on: the dribbler pushes the ball a few metres ahead ((dx, dz): the stick) and runs onto it.
    knockOn: function (p, dx, dz) {
      var ball = World.ball;
      var l = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= l; dz /= l;
      ball.owner = null;
      ball.pickupCooldown = 0.1;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = p;
      ball.kickerT = 0.35; // not straight back on his own foot
      ball.gkTried = 0; ball.hard = false; ball.chip = false; ball.pen = false; ball.shotD = 0;
      ball.receiver = p; // he chases it by himself, like a pass to him (the arrow flashes)
      ball.contester = null;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false; ball.thrown = false;
      var sp = Math.min(22, Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) + 10); // 2 to 3 m ahead of him
      ball.pos.y = NS.BALL_R;
      ball.vel.set(dx * sp, 0, dz * sp);
      p.dribbling = false;
      p.facing = Math.atan2(dx, dz);
      p.kickT = 0.18;
      p.kickHard = false;
      NS.Audio.kick(false);
    },

    // type: ACT.PASS | THROUGH | LONG | SHOOT, power 0..1, (ax, az) aim input.
    // The ball leaves the player's foot (shared by every kick).
    release: function (p, type) {
      var ball = World.ball;
      this.markOffside(p);
      ball.thrown = !!p.throwIn; // (a throw-in: a soft ball, easy to bring down for the man it is thrown to)
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
      ball.thru = false;
      ball.contester = null;
      ball.pen = false;
      ball.shotD = 0;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
      p.dribbling = false;
      p.gkHands = false;
      p.kickT = p.throwT > 0 ? 0 : (type >= ACT.SHOOT ? 0.36 : 0.28); // kick animation (not on a throw-in)
      p.kickHard = type >= ACT.SHOOT || type === ACT.LONG || (type === ACT.THROUGH && this.lob);
      this.lastTarget = null;
      NS.Audio.kick(type >= ACT.SHOOT);
      if (NS.Stats) NS.Stats.kick(p, type >= ACT.SHOOT);
      if (this.onKick) this.onKick(p, type);
    },

    kick: function (p, type, power, ax, az, accuracy, forceTarget) {
      var ball = World.ball;
      // a throw-in is thrown to a team-mate (no shots from the touchline); a corner / goal kick may not be shot either
      if (p.throwIn && type !== ACT.LONG && type !== ACT.THROUGH) type = ACT.PASS;
      var rs = World.match.restart;
      if (rs >= 3 && rs <= 5 && type >= ACT.SHOOT && type !== ACT.CHIP) type = ACT.LONG;
      this.release(p, type);
      var attack = NS.attack(p.team);

      var angle, speed, vy, d, tx, tz;
      if (type >= ACT.SHOOT) {
        var goalX = attack * HALF_W;
        var aimed = az > 0.1 || az < -0.1;
        if (type === ACT.CURVE) {
          // aim outside the post on the far side and curl back in
          var side = aimed ? (az > 0 ? 1 : -1) : (p.pos.z > 0 ? -1 : 1);
          var curveZ = -side * (GOAL_HALF_W + 2);
          angle = Math.atan2(goalX - p.pos.x, curveZ - p.pos.z);
          this.shotForm(p, goalX, 0); // (his body to the goal, a defender on him, his run: as a driven shot)
          angle += (Math.random() - 0.5) * (1.05 - power) * 0.1 * (accuracy || 1) * (p.bumpT > 0 ? BUMP_ACC : 1) * this.shotErr;
          speed = (30 + power * 12) * (0.88 + p.st.sht / 99 * 0.16) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1);
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
          // a chip is a delicate thing: its line and its length both go astray (more from further out, for a poor
          // finisher, with an awkward body / a man on him / at a sprint, for a weaker team); a bit long = over the bar,
          // a bit short = into the keeper's arms
          this.shotForm(p, goalX, cz);
          var ce = (0.6 + dg / 30) * (accuracy || 1) * this.shotErr * (1.7 - p.st.sht / 99 * 1.1) * (p.bumpT > 0 ? BUMP_ACC : 1);
          if (NS.teamClass) ce *= clamp(1 - 0.3 * NS.teamClass(p.team), 0.6, 1.5);
          var ca = gaussR() * 0.07 * ce, cc = Math.cos(ca), sn = Math.sin(ca);
          var ux = (cdx * cc + cdz * sn) / cd, uz = (-cdx * sn + cdz * cc) / cd;
          var cs = airSpeed(cd * (1 + gaussR() * 0.11 * ce), Tc);
          ball.pos.y = NS.BALL_R + 0.15;
          ball.vel.set(ux * cs, 0.5 * G * Tc, uz * cs);
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
      // a throw-in always goes to a team-mate (never thrown into empty space, often straight out again): the one the
      // stick points at, else the nearest one in reach of a throw
      if (!mate && p.throwT > 0.35) mate = this.nearestMate(p, 24);
      this.lastTarget = mate;
      ball.spinY = 0;
      if (!mate) {
        // nobody in the aimed direction: kick it that way
        var al = Math.sqrt(ax * ax + az * az);
        var kx = al > 0.1 ? ax / al : Math.sin(p.facing);
        var kz = al > 0.1 ? az / al : Math.cos(p.facing);
        d = type === ACT.LONG ? 36 : (type === ACT.THROUGH ? (this.lob ? 34 : 28) : 14);
        tx = p.pos.x + kx * d; tz = p.pos.z + kz * d;
      } else if (type === ACT.THROUGH) {
        if (forceTarget) {
          tx = mate.pos.x + mate.vel.x * 0.5;
          tz = mate.pos.z + mate.vel.z * 0.4;
        } else {
          // into the space ahead of the receiver: along the aim, pulled towards the goal he attacks
          // The hold sets how far ahead: a tap = his position, a full bar = the far space, always more towards the goal
          var pw = this.passPower; // -1: the CPU (a fixed lead)
          var lead = pw >= 0 ? (this.lob ? 3 + 21 * pw : 4 + 15 * pw) : (this.lob ? 14 : 11);
          var runLead = pw >= 0 ? 0.25 + 0.45 * pw : 0.7;
          var spot = this.throughSpot(p, mate, ax, az, lead, runLead);
          tx = spot[0]; tz = spot[1];
          if (this.lob && (pw < 0 || pw >= 0.35)) {
            // over the defenders: it comes down beyond the deepest outfield opponent near the line of the ball
            var ldx2 = tx - p.pos.x, ldz2 = tz - p.pos.z, ldl = Math.sqrt(ldx2 * ldx2 + ldz2 * ldz2) || 1;
            var deep = tx * attack;
            for (var oi = 0; oi < World.players.length; oi++) {
              var op = World.players[oi];
              if (op.team === p.team || op.role === 'GK' || op.stun > 0) continue;
              var ou = ((op.pos.x - p.pos.x) * ldx2 + (op.pos.z - p.pos.z) * ldz2) / ldl;
              if (ou < 3 || ou > ldl + 10) continue;
              var operp = Math.abs((op.pos.x - p.pos.x) * ldz2 - (op.pos.z - p.pos.z) * ldx2) / ldl;
              if (operp < 9 && op.pos.x * attack + 4 > deep) deep = op.pos.x * attack + 4;
            }
            tx = deep * attack;
            var lfd = Math.sqrt((tx - p.pos.x) * (tx - p.pos.x) + (tz - p.pos.z) * (tz - p.pos.z));
            if (lfd > 52) { tx = p.pos.x + (tx - p.pos.x) * 52 / lfd; tz = p.pos.z + (tz - p.pos.z) * 52 / lfd; }
          }
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
    // How well he can strike it now (Actions.shotPow / shotErr, x the pace and the miss): his body to the goal (facing
    // it: full power, his best aim; side on or turned away: much less of both), a defender on him (shoulder to shoulder
    // or close: rushed, less clean) and his run (standing: a little less pace; a sprint or running onto his knock-on:
    // more pace, a little less control).
    shotForm: function (p, goalX, goalZ) {
      var gx = goalX - p.pos.x, gz = goalZ - p.pos.z, gl = Math.sqrt(gx * gx + gz * gz) || 1;
      var f = (1 + (Math.sin(p.facing) * gx + Math.cos(p.facing) * gz) / gl) / 2; // 1 facing the goal, 0.5 side on, 0 back to it
      var m = World.match, dead = (m.penalty || m.restart) && m.setTaker === p; // a dead ball: he lines it up, with a run-up
      if (dead) f = 1;
      // (a great finisher copes better with an awkward body: Shoot 90 ~ 0.65 of the loss, 60 ~ 0.95)
      var fin = p.st ? clamp(1.55 - p.st.sht / 99, 0.55, 1.1) : 1;
      var pow = 1 - 0.5 * (1 - Math.pow(f, 0.7)) * fin;
      var err = 1 + 4 * Math.pow(1 - f, 1.3) * fin;
      var near = 99, pl = World.players;
      for (var i = 0; i < pl.length; i++) {
        var q = pl[i];
        if (q.team === p.team || q.role === 'GK') continue;
        var dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < near) near = d;
      }
      if (near < 1.6) { pow *= 0.9; err *= 1.7; } else if (near < 3.2) err *= 1 + 0.35 * (3.2 - near) / 1.6;
      var v = dead ? 9 : Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      pow *= 0.92 + clamp((v - 4) / 11, 0, 1) * 0.16;
      err *= 1 + clamp((v - 11) / 5, 0, 1) * 0.25;
      this.shotPow = pow; this.shotErr = err;
    },
    shotPow: 1, shotErr: 1,
    shotSpeed: function (g) { return SHOT_MIN + (SHOT_MAX - SHOT_MIN) * Math.pow(Math.min(1, g / 0.5), 0.7); },
    driveShot: function (p, goalZ, g, accuracy, bend) {
      var ball = World.ball;
      var attack = NS.attack(p.team);
      g = clamp(g, 0, 1);
      var goalX = attack * HALF_W;
      var sdx = goalX - ball.pos.x, sdz = goalZ - ball.pos.z; // from the ball (in front of his foot)
      var sd = Math.sqrt(sdx * sdx + sdz * sdz);
      ball.shotD = sd; // the keeper sees a shot from range coming for longer
      // his Shoot rating: accuracy (a great finisher misses by much less) and pace
      var err = (0.016 + sd * 0.0015) * (accuracy || 1) * (0.6 + g * 0.7) * (2.1 - p.st.sht / 99 * 1.65);
      if (p.bumpT > 0) err *= BUMP_ACC; // pressed shoulder to shoulder: off balance
      if (NS.teamClass) err *= clamp(1 - 0.3 * NS.teamClass(p.team), 0.6, 1.5); // (a better team finishes better)
      this.shotForm(p, goalX, goalZ);
      err *= this.shotErr;
      var angle = Math.atan2(sdx, sdz) + gaussR() * err;
      var speed = this.shotSpeed(g) * (0.84 + p.st.sht / 99 * 0.24) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1);
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

    // Where a through ball goes for `mate`: into the space ahead of his run, in the stick's direction blended with his
    // own lane forward (a wide man: straight down the wing; a central one: towards goal), kept off the touchlines and the
    // goal line, at the lead the power bar asks for or a little shorter / longer where he gets there before the defenders.
    throughSpot: function (p, mate, ax, az, lead, runLead) {
      var attack = NS.attack(p.team), players = World.players;
      var al = Math.sqrt(ax * ax + az * az);
      var sx = al > 0.1 ? ax / al : Math.sin(p.facing), sz = al > 0.1 ? az / al : Math.cos(p.facing);
      var bx = mate.pos.x + mate.vel.x * runLead, bz = mate.pos.z + mate.vel.z * runLead;
      var wide = Math.abs(bz) > HALF_H * 0.45;
      var gx = attack * HALF_W - bx, gl = Math.sqrt(gx * gx + bz * bz) || 1;
      var fx = wide ? attack : (attack * 0.6 + gx / gl * 0.4), fz = wide ? 0 : -bz / gl * 0.4; // his lane forward
      var dx = sx * 0.5 + fx * 0.5, dz = sz * 0.5 + fz * 0.5, dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;
      if (dx * attack < 0.15) { dx = attack * 0.15 + dx * 0.5; dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl; } // (a through ball goes forward)
      var best = null, bestSc = -1e9, K = [0.6, 0.8, 1, 1.2, 1.4];
      for (var k = 0; k < K.length; k++) {
        var L = lead * K[k];
        var tx = clamp(bx + dx * L, -HALF_W + 4, HALF_W - 4);
        var tz = clamp(bz + dz * L, -HALF_H + 3.5, HALF_H - 3.5); // (a ball to the touchline runs out of play)
        // who gets there first: him, or the nearest opponent (keeper included)?
        var mt = Math.sqrt((tx - mate.pos.x) * (tx - mate.pos.x) + (tz - mate.pos.z) * (tz - mate.pos.z)) / 9;
        var ot = 99;
        for (var i = 0; i < players.length; i++) {
          var o = players[i];
          if (o.team === p.team || o.stun > 0) continue;
          var t = Math.sqrt((tx - o.pos.x) * (tx - o.pos.x) + (tz - o.pos.z) * (tz - o.pos.z)) / 9;
          if (t < ot) ot = t;
        }
        var sc = clamp(ot - mt, -1, 1.2) * 0.8 - Math.abs(K[k] - 1) * 0.5;
        if (sc > bestSc) { bestSc = sc; best = [tx, tz]; }
      }
      return best;
    },

    // Ground pass pace for a distance d: it still arrives firmly (~24 at the receiver, about twice what it was), a
    // through ball rolls on into the space a little softer.
    passSpeed: function (d) { return clamp(d * DRAG_K + 24, 30, 62); },
    thruSpeed: function (d) { return clamp(d * DRAG_K + 16, 24, 56); },

    launch: function (p, type, tx, tz, mate, accuracy, forceTarget) {
      var ball = World.ball;
      var angle, speed, vy, d;
      var bumped = p.bumpT > 0;
      if (bumped) accuracy = (accuracy || 1) * BUMP_ACC; // pressed shoulder to shoulder: off balance
      if (p.st) accuracy = (accuracy || 1) * (1.45 - p.st.drb / 99 * 0.6); // his technique (Dribble): a cleaner pass
      // as a shot (Actions.shotForm), a little less strongly: his body to the target, a defender on him, his run, and his
      // team's class. An awkward pass goes astray more and comes off softer / shorter.
      var thrown = p.throwT > 0.35, fpow = 1;
      if (!thrown) {
        this.shotForm(p, tx, tz);
        accuracy = (accuracy || 1) * (1 + (this.shotErr - 1) * 0.4);
        if (NS.teamClass) accuracy *= clamp(1 - 0.4 * NS.teamClass(p.team), 0.55, 1.5);
        fpow = 1 - (1 - this.shotPow) * 0.4;
      }
      var dx = tx - p.pos.x;
      var dz = tz - p.pos.z;
      d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.5) d = 0.5;
      angle = Math.atan2(dx, dz);
      angle += gaussR() * 0.016 * (accuracy || 1) * (d > 25 ? 1.6 : 1);
      if ((type === ACT.LONG || (type === ACT.THROUGH && this.lob)) && !thrown) d *= fpow; // (a lofted ball: shorter)

      if (type === ACT.LONG && d > 18) d *= 1 + gaussR() * 0.06 * (accuracy || 1);
      if (p.throwT > 0.35) {
        // thrown from over the head: a flat arc that comes down to waist height where the receiver will be (he stops
        // there and takes it on the thigh / chest) rather than at his feet beyond him, over his head (~24 m at most)
        if (d > 24) { dx *= 24 / d; dz *= 24 / d; d = 24; }
        var Tt = clamp(d / 22, 0.4, 0.95);
        speed = airSpeed(d, Tt);
        vy = (THROW_Y - ball.pos.y) / Tt + 0.5 * G * Tt;
        if (mate) { mate.runToX = p.pos.x + dx; mate.runToZ = p.pos.z + dz; mate.runToT = Tt + 0.6; }
      } else if (type === ACT.LONG) {
        // lobbed: flight time T, vertical speed from gravity, horizontal speed = distance / T
        var T = clamp(d / 30, 0.75, 1.6);
        vy = 0.5 * G * T;
        speed = airSpeed(d, T);
        ball.pos.y = NS.BALL_R + 0.15;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = T + 0.7; }
      } else if (type === ACT.THROUGH && this.lob) {
        // long through ball: lobbed, comes down on the space behind the defenders where the receiver runs to
        var Tl = clamp(d / 26, 0.9, 1.8);
        vy = 0.5 * G * Tl;
        speed = airSpeed(d, Tl);
        ball.pos.y = NS.BALL_R + 0.15;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = Tl + 0.9; }
      } else if (type === ACT.THROUGH) {
        speed = forceTarget ? clamp(d * DRAG_K + 8, 16, 44) : this.thruSpeed(d);
        vy = 0.8;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = 1.5; }
      } else {
        speed = this.passSpeed(d); // crisp: arrives with pace instead of dying in front of a defender
        vy = 0.6;
        // the receiver comes towards the ball to meet it
        if (mate) { mate.runToX = tx - (dx / d) * 1.5; mate.runToZ = tz - (dz / d) * 1.5; mate.runToT = Math.min(1.0, d / speed + 0.2); }
      }
      // a human held the pass button: a tap is the normal pace, a full hold ~35% firmer (a long ball flies flatter)
      if (this.passPower > 0 && !(p.throwT > 0.35)) {
        var pw = 1 + this.passPower * 0.15; // the bar picks the receiver; a little firmer too
        speed *= pw;
        if (type === ACT.LONG) vy /= pw;
      }
      if (bumped) { speed *= BUMP_POW; vy *= BUMP_POW; }
      if (type === ACT.PASS || (type === ACT.THROUGH && !this.lob)) speed *= fpow; // (along the ground: softer / firmer)
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      ball.receiver = mate || null;
      ball.thru = !!mate && type === ACT.THROUGH && !(p.throwT > 0.35);
      ball.thruX = tx; ball.thruZ = tz;
      this.pickContester(p.team);
    },

    // Offside, read when the ball is played: a team-mate of the kicker is offside when he is in the opponents' half,
    // nearer to their goal line than the ball and than the second-last opponent (the keeper usually being the last).
    // Not from a throw-in, a corner or a goal kick.
    markOffside: function (p) {
      var players = World.players;
      var ball = World.ball;
      var a = NS.attack(p.team);
      var i, q;
      for (i = 0; i < players.length; i++) players[i].offside = false;
      ball.offTeam = -1;
      var rk = World.match.restart;
      if (p.throwIn || (rk >= 3 && rk <= 5)) return;
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
      if (d > 1.45) return false; // shoulder to shoulder
      var front = -(Math.sin(c.facing) * dx + Math.cos(c.facing) * dz) / d; // +1 in front of him, -1 behind
      p.shoulderT = 0.32;
      p.shoulderDir = (Math.cos(p.facing) * dx - Math.sin(p.facing) * dz) > 0 ? 1 : -1;
      // body strength ~ Defense and Header (aerial / physical) against his Dribble and balance
      var strength = (p.st.def * 0.6 + p.st.hdr * 0.4) / 99;
      // (a shoulder is mostly a nuisance, not a tackle: half the odds a tackle-like challenge would have)
      var chance = (skill || 0.3) * (0.55 + strength * 0.7) * (1.35 - c.st.drb / 99 * 0.7) * 0.5;
      if (NS.classEdge) chance *= NS.classEdge(p.team, c.team); // (the better team wins more of them)
      if (front < -0.55) chance *= 0.3;       // from behind: his back shields the ball
      else if (front > 0.45) chance *= 0.8;  // in front: it is a tackle's job
      if (c.dribbling) chance *= 0.8;
      // the bump: the carrier is pushed away from the challenger and slowed, the challenger loses a little speed;
      // for a moment the carrier stays slower and off balance (his passes and shots lose accuracy and power, see
      // launch / driveShot), the challenger a little slower too
      var nx = dx / d, nz = dz / d;
      c.vel.x = c.vel.x * 0.8 + nx * 2.6; c.vel.z = c.vel.z * 0.8 + nz * 2.6;
      p.vel.x *= 0.85; p.vel.z *= 0.85;
      c.bumpT = BUMP_T; c.bumpK = 0.85;
      if (!(p.bumpT > 0.5)) { p.bumpT = 0.8; p.bumpK = 0.92; }
      NS.Audio.tackle();
      if (Math.random() >= clamp(chance, 0.02, 0.3)) { if (NS.dbg) NS.dbg('shoulder_failed', p.team); return false; }
      ball.receiver = null;
      ball.contester = null;
      if (Math.random() < 0.5) {
        // he takes it off him
        if (NS.dbg) NS.dbg('shoulder_took_ball', p.team);
        ball.owner = p;
        ball.lastTouchTeam = p.team;
        ball.lastToucher = p.name;
        ball.pickupCooldown = 0.12;
        this.touch(p);
      } else {
        // knocked loose: it runs on ahead, whoever is first gets it
        if (NS.dbg) NS.dbg('shoulder_knocked_loose', p.team);
        ball.owner = null;
        ball.vel.set(c.vel.x * 0.9 - nz * 1.5 * p.shoulderDir, 0, c.vel.z * 0.9 + nx * 1.5 * p.shoulderDir);
        ball.lastTouchTeam = p.team;
        ball.pickupCooldown = 0.08;
        ball.kicker = c; ball.kickerT = 0.35;
        ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
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
      // no time to react: a header needs the time to see the ball, jump and set the neck. A ball that reaches him less
      // than REACT_HEAD seconds after it was played (struck hard from close by) just hits him; a slow ball from close
      // by gives him the time. A header coming back off a header needs a little longer (no head tennis).
      if (ball.age < (ball.headed ? REACT_HEAD + 0.1 : REACT_HEAD)) return false;
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
      var attack = NS.attack(p.team);
      var y0 = ball.pos.y;
      if (this.touch(p)) return;
      // a header carries ~20 m: from further out a "header at goal" is a long headed ball forward
      var gdx = attack * HALF_W - p.pos.x;
      if (shot && Math.sqrt(gdx * gdx + p.pos.z * p.pos.z) > HEAD_SHOT_MAX) {
        shot = false; type = ACT.LONG;
        if (!(ax * ax + az * az > 0.01) || ax * attack < 0) { ax = attack; az = 0; }
      }
      this.release(p, shot ? ACT.SHOOT : type);
      if (shot && NS.Stats) NS.Stats.headed();
      ball.headed = true;
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
      if (mate) { ball.receiver = mate; ball.thru = false; mate.runToT = 0; }
      this.pickContester(p.team);
      this.lastTarget = mate;
    },

    // One-two: short pass, the receiver plays it straight back into the space the passer runs into.
    oneTwo: function (p, ax, az) {
      var attack = NS.attack(p.team);
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
        // the ball within his leg's reach (or the man, for a clumsy one): ~1.25 m standing, ~2 m sliding
        var reach = p.tackleSlide ? 4.0 : 1.56;
        var onBall = bx * bx + bz * bz < reach;
        if (onBall || dx * dx + dz * dz < reach * 0.8) {
          p.tackleHit = true;
          var cl = Math.sqrt(dx * dx + dz * dz) || 1;
          // +1 = the tackler comes from the front (where the ball is), -1 = from behind
          var front = -(Math.sin(carrier.facing) * dx + Math.cos(carrier.facing) * dz) / cl;
          // a tackle that goes through the man from behind is a foul (free kick, or a penalty in the box)
          if (front < -0.35 && dx * dx + dz * dz < reach && this.onFoul && World.match.protectT <= 0) {
            p.tackleT = 0;
            p.stun = 1.0;
            carrier.fallT = 0.55;
            if (NS.dbg) NS.dbg('foul_from_behind', p.team);
            this.onFoul(p, carrier);
            return;
          }
          // the tackler's Defense against the carrier's Dribble
          var chance = (baseChance + (p.tackleSlide ? 0.08 : 0)) * (0.6 + p.st.def / 99 * 0.6) * (1.3 - carrier.st.drb / 99 * 0.6);
          if (front < -0.35) chance *= p.tackleSlide ? 0.22 : 0.1; // from behind: the carrier's body shields the ball
          else if (front < 0.3) chance *= 0.6;                      // from the side
          else chance *= 1.08;
          if (carrier.dribbling) chance *= 0.75;
          if (!onBall) chance *= 0.45; // into the man, not the ball
          if (NS.classEdge) chance *= NS.classEdge(p.team, carrier.team); // (the better team wins more of them)
          chance = clamp(chance, 0.03, 0.92);
          if (Math.random() < chance) {
            if (NS.dbg) { NS.dbg(p.tackleSlide ? 'slide_won' : 'tackle_won', p.team); if (!onBall) NS.dbg('tackle_won_via_body', p.team); }
            if (NS.Commentary) NS.Commentary.event('TACKLE', p.team);
            ball.receiver = null;
            ball.contester = null;
            ball.lastTouchTeam = p.team;
            ball.lastToucher = p.name;
            if (Math.random() < (p.tackleSlide ? 0.8 : 0.45)) {
              if (NS.dbg) NS.dbg('tackle_poked_loose', p.team);
              // poked away: the ball runs on where his foot sent it, anybody's ball (it may go out)
              var tl = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
              var pk = 5 + Math.random() * 7;
              var pa = (Math.random() - 0.5) * 1.2;
              var tx0 = p.vel.x / tl, tz0 = p.vel.z / tl;
              ball.owner = null;
              ball.vel.set((tx0 * Math.cos(pa) - tz0 * Math.sin(pa)) * pk, 0.5 + Math.random(), (tx0 * Math.sin(pa) + tz0 * Math.cos(pa)) * pk);
              ball.pickupCooldown = 0.18;
              ball.kicker = p; ball.kickerT = 0.25;
              ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
            } else {
              ball.owner = p;
              ball.pickupCooldown = 0.12;
            }
            this.touch(p);
            carrier.stun = 0.55;
            carrier.fallT = 0.55;
            carrier.vel.set(0, 0, 0);
            carrier.dribbling = false;
            p.tackleT = 0;
            p.vel.set(0, 0, 0);
            NS.Audio.kick(false);
          } else {
            if (NS.dbg) NS.dbg(p.tackleSlide ? 'slide_contact_lost' : 'tackle_contact_lost', p.team);
            p.stun = (p.tackleSlide ? 0.9 : 0.5) + (front < -0.35 ? 0.3 : 0);
            p.tackleT = 0;
          }
        }
      }
      if (p.tackleT <= 0 && !p.tackleHit) p.stun = p.tackleSlide ? 0.6 : 0.3;
      if (p.tackleT <= 0) { p.vel.x *= 0.3; p.vel.z *= 0.3; }
    },

    // First touch: does p bring the loose ball under control? Harder when it comes fast, when it was played from close by
    // (less time to see it and set his body), above the knee, and for a poor touch (Dribble); the player a pass was meant
    // for is ready for it. Returns false for a bad touch (the caller knocks it off him).
    controls: function (p) {
      var ball = World.ball;
      var vx = ball.vel.x - p.vel.x * 0.5, vz = ball.vel.z - p.vel.z * 0.5;
      var s = Math.sqrt(vx * vx + vz * vz);
      if (s < 7 && ball.pos.y < 0.9) return true;
      // seconds he saw it coming (the time since it was played: its speed and the distance together)
      var react = ball.age;
      if (react < 0.15 && s > 14) return false; // a reflex: a hard ball from right next to him just hits him
      // (the man a pass was played to expects it firm: only well above a pass's pace makes it harder for him)
      var pace = Math.max(0, s - (ball.receiver === p ? 22 : 10)) / 25;
      var quick = react < REACT_TOUCH ? Math.min(1, (REACT_TOUCH - react) / (REACT_TOUCH - 0.15)) : 0;
      var skill = (p.role === 'GK' ? p.st.drb * 0.5 + 30 : p.st.drb) / 99;
      var fail = (pace * 0.35 + quick * 0.5) * (1.6 - skill * 1.0);
      if (NS.teamClass) fail *= clamp(1 - 0.25 * NS.teamClass(p.team), 0.6, 1.4); // (a better team's touch is surer)
      // a throw-in to him: thrown softly at his body (he meets it on the thigh or chest even when running to it)
      if (ball.thrown && ball.receiver === p) return Math.random() >= clamp(fail * 0.2, 0, 0.1);
      if (ball.receiver === p) fail *= 0.45;
      if (ball.pos.y > 1.9) fail += 0.18; else if (ball.pos.y > 0.9) fail += 0.07;
      return Math.random() >= clamp(fail, 0, 0.85);
    },

    // A loose ball hits p and comes off him (a bad first touch, a block, a hard shot): it keeps part of its pace in a
    // changed direction. He touched it last (an own goal line = a corner).
    knockOff: function (p, hardShot) {
      var ball = World.ball;
      if (hardShot) {
        // a block: back where it came from, or on its way at less pace (often behind for a corner)
        ball.vel.x = (Math.random() < 0.5 ? 0.4 : -0.25) * ball.vel.x + (Math.random() - 0.5) * 8;
        ball.vel.z = ball.vel.z * 0.35 + (Math.random() - 0.5) * 10;
        ball.vel.y = 1 + Math.random() * 4;
        NS.Audio.tackle();
      } else {
        var keep = 0.3 + Math.random() * 0.3;
        var ang = (Math.random() - 0.5) * 1.8; // up to ~50 degrees off its line
        var c = Math.cos(ang), s = Math.sin(ang);
        var vx = ball.vel.x * c - ball.vel.z * s, vz = ball.vel.x * s + ball.vel.z * c;
        ball.vel.set(vx * keep + p.vel.x * 0.3, Math.random() * 2.5, vz * keep + p.vel.z * 0.3);
        NS.Audio.kick(false);
      }
      ball.hard = false;
      ball.thrown = false;
      ball.receiver = null;
      ball.contester = null;
      ball.pickupCooldown = 0.15;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
      if (this.touch(p)) return true;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = p;
      ball.kickerT = hardShot ? 0.25 : 0.35;
      return false;
    },

    // Nearest outfield team-mate of p within maxD (null if none).
    nearestMate: function (p, maxD) {
      var players = World.players, best = null, bestD = maxD * maxD;
      for (var i = 0; i < players.length; i++) {
        var q = players[i];
        if (q.team !== p.team || q === p || q.role === 'GK' || q.stun > 0) continue;
        var dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = dx * dx + dz * dz;
        if (d < bestD && d > 4) { bestD = d; best = q; }
      }
      return best;
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
