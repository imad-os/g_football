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
  // shot: realistic ball speeds from SHOT_MIN (a placed finish) to SHOT_MAX (a full-lace thunderbolt)
  var SHOT_MIN = 22, SHOT_MAX = 42;
  var GH = [[0.10, NS.BALL_R], [0.11, 0.55], [0.30, 1.15], [0.40, 1.75], [0.50, NS.GOAL_HEIGHT], [1.0, 6.8]]; // (50%: the bar)

  // Horizontal launch speed so a ball in the air for T seconds covers d (air drag included).
  function airSpeed(d, T) { return d * AIR_K / (1 - Math.exp(-AIR_K * T)); }

  // Pass assistance per kick type (index = ACT.PASS / THROUGH / LONG): preferred distance, accepted range,
  // how far ahead the receiver's run is read.
  var IDEAL_D = [0, 11, 18, 32];
  var MIN_D = [0, 3, 6, 14];
  var MAX_D = [0, 52, 56, 72];
  var LEAD_T = [0, 0.3, 0.55, 0.8];
  // a human's power bar (0..1) -> the distance he is passing to: DEPTH0 + DEPTH1 * power
  var DEPTH0 = [0, 6, 10, 18];
  var DEPTH1 = [0, 44, 42, 52];

  // Human reaction: the seconds a player needs between a ball being played and a controlled header / first touch
  var REACT_HEAD = 0.45;
  var HEAD_SHOT_MAX = 22;   // metres from the goal a header at goal can come from
  var REACT_TOUCH = 0.34;

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
      var want = this.passPower >= 0 ? DEPTH0[t] + DEPTH1[t] * this.passPower : -1;
      if (this.lob && want >= 0) want = 16 + 36 * this.passPower;
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
        if (m.role === 'GK' && t !== ACT.PASS) continue;
        var mx = m.pos.x + m.vel.x * LEAD_T[t];
        var mz = m.pos.z + m.vel.z * LEAD_T[t];
        var dx = mx - passer.pos.x;
        var dz = mz - passer.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < MIN_D[t] || d > MAX_D[t]) continue;
        var dot = (dx * fx + dz * fz) / d;
        if (dot < minDot) continue;
        var ang = Math.acos(dot > 1 ? 1 : dot);
        var side = d * Math.sin(ang);
        var off, score = -ang * 5 - Math.min(side, 20) * 0.04;
        if (want > 0) {
          off = Math.abs(d - want) / Math.max(want, 8);
          score -= off * 1.4;
        } else {
          off = Math.abs(d - ideal) / ideal;
          score -= off * 0.5;
        }
        if (m.role === 'GK') score -= 0.25;
        if (t !== ACT.PASS) score += (m.pos.x - passer.pos.x) * attack * 0.006;
        if (t === ACT.THROUGH && m.runT > 0) score += 0.2;
        for (var j = 0; j < players.length; j++) {
          var o = players[j];
          if (o.team === passer.team || o.stun > 0) continue;
          var rx = o.pos.x - mx, rz = o.pos.z - mz;
          if (rx * rx + rz * rz < 9) score -= 0.2;
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
      ball.kickerT = 0.35;
      ball.gkTried = 0; ball.gkCd = 0; ball.hard = false; ball.chip = false; ball.pen = false; ball.shotD = 0;
      ball.receiver = p;
      ball.contester = null;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false; ball.thrown = false;
      var sp = Math.min(18.5, Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) + 7.5);
      ball.pos.y = NS.BALL_R;
      ball.vel.set(dx * sp, 0.45, dz * sp);
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
      ball.thrown = !!p.throwIn;
      if (p.throwIn) { p.throwIn = false; p.throwT = 0.4; }
      ball.owner = null;
      ball.pickupCooldown = 0.24;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = p;
      ball.kickerT = 0.45;
      ball.gkTried = 0;
      ball.gkCd = 0;
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
      p.kickT = p.throwT > 0 ? 0 : (type >= ACT.SHOOT ? 0.36 : 0.28);
      p.kickHard = type >= ACT.SHOOT || type === ACT.LONG || (type === ACT.THROUGH && this.lob);
      this.lastTarget = null;
      NS.Audio.kick(type >= ACT.SHOOT);
      if (NS.Stats) NS.Stats.kick(p, type >= ACT.SHOOT);
      if (this.onKick) this.onKick(p, type);
    },

    kick: function (p, type, power, ax, az, accuracy, forceTarget) {
      var ball = World.ball;
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
          // Aim outside the post on the far side and curl back in with Magnus spin
          var side = aimed ? (az > 0 ? 1 : -1) : (p.pos.z > 0 ? -1 : 1);
          var curveZ = -side * (GOAL_HALF_W + 1.8);
          angle = Math.atan2(goalX - p.pos.x, curveZ - p.pos.z);
          this.shotForm(p, goalX, 0);
          angle += (Math.random() - 0.5) * (1.05 - power) * 0.09 * (accuracy || 1) * (p.bumpT > 0 ? BUMP_ACC : 1) * this.shotErr;
          speed = (24 + power * 10) * (0.88 + p.st.sht / 99 * 0.16) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1);
          var cvx = goalX - p.pos.x, cvz = curveZ - p.pos.z;
          var cd0 = Math.sqrt(cvx * cvx + cvz * cvz);
          var kd = cd0 * AIR_K / speed;
          var cT = kd < 0.85 ? -Math.log(1 - kd) / AIR_K : cd0 / speed * 1.4;
          vy = Math.min(8.5, (1.25 + power * 0.85 - ball.pos.y) / cT + 0.5 * G * cT);
          ball.vel.set(Math.sin(angle) * speed, Math.max(0.6, vy), Math.cos(angle) * speed);
          ball.spinY = side * attack * 26;
          return;
        }
        if (type === ACT.CHIP) {
          // Lofted shot that drops into the goal over the keeper
          var dg = Math.abs(goalX - p.pos.x) - 1;
          if (dg < 3) dg = 3;
          var chipFar = dg > 32;
          if (chipFar) dg = 32;
          var Tc = clamp(dg / 13.5, 0.95, 1.8);
          var cz = aimed ? az * GOAL_HALF_W * 0.6 : 0;
          var cdx = chipFar ? attack * 32 : goalX - attack - p.pos.x;
          var cdz = chipFar ? 0 : cz - p.pos.z;
          var cd = Math.sqrt(cdx * cdx + cdz * cdz) || 1;
          this.shotForm(p, goalX, cz);
          var ce = (0.6 + dg / 30) * (accuracy || 1) * this.shotErr * (1.7 - p.st.sht / 99 * 1.1) * (p.bumpT > 0 ? BUMP_ACC : 1);
          if (NS.teamClass) ce *= clamp(1 - 0.3 * NS.teamClass(p.team), 0.6, 1.5);
          var ca = gaussR() * 0.07 * ce, cc = Math.cos(ca), sn = Math.sin(ca);
          var ux = (cdx * cc + cdz * sn) / cd, uz = (-cdx * sn + cdz * cc) / cd;
          var cs = airSpeed(cd * (1 + gaussR() * 0.11 * ce), Tc);
          ball.pos.y = NS.BALL_R + 0.12;
          ball.vel.set(ux * cs, 0.5 * G * Tc, uz * cs);
          ball.spinY = 0;
          return;
        }
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
      if (!mate && p.throwT > 0.35) mate = this.nearestMate(p, 24);
      this.lastTarget = mate;
      ball.spinY = 0;
      if (!mate) {
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
          var pw = this.passPower;
          var lead = pw >= 0 ? (this.lob ? 3 + 21 * pw : 4 + 15 * pw) : (this.lob ? 14 : 11);
          var runLead = pw >= 0 ? 0.25 + 0.45 * pw : 0.7;
          var spot = this.throughSpot(p, mate, ax, az, lead, runLead);
          tx = spot[0]; tz = spot[1];
          if (this.lob && (pw < 0 || pw >= 0.35)) {
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
        var ldx = mate.pos.x - p.pos.x, ldz = mate.pos.z - p.pos.z;
        var lT = clamp(Math.sqrt(ldx * ldx + ldz * ldz) / 26, 0.8, 1.75);
        tx = clamp(mate.pos.x + mate.vel.x * lT * 0.6 + attack * 2, -HALF_W + 2, HALF_W - 2);
        tz = clamp(mate.pos.z + mate.vel.z * lT * 0.6, -HALF_H + 2, HALF_H - 2);
      } else {
        tx = mate.pos.x + mate.vel.x * 0.25;
        tz = mate.pos.z + mate.vel.z * 0.25;
      }
      this.launch(p, type, tx, tz, mate, accuracy, forceTarget);
    },

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
    shotForm: function (p, goalX, goalZ) {
      var gx = goalX - p.pos.x, gz = goalZ - p.pos.z, gl = Math.sqrt(gx * gx + gz * gz) || 1;
      var f = (1 + (Math.sin(p.facing) * gx + Math.cos(p.facing) * gz) / gl) / 2;
      var m = World.match, dead = (m.penalty || m.restart) && m.setTaker === p;
      if (dead) f = 1;
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
    shotSpeed: function (g) { return SHOT_MIN + (SHOT_MAX - SHOT_MIN) * Math.pow(Math.min(1, g / 0.55), 0.75); },
    driveShot: function (p, goalZ, g, accuracy, bend) {
      var ball = World.ball;
      var attack = NS.attack(p.team);
      g = clamp(g, 0, 1);
      var goalX = attack * HALF_W;
      var sdx = goalX - ball.pos.x, sdz = goalZ - ball.pos.z;
      var sd = Math.sqrt(sdx * sdx + sdz * sdz);
      ball.shotD = sd;
      var err = (0.016 + sd * 0.0015) * (accuracy || 1) * (0.6 + g * 0.7) * (2.1 - p.st.sht / 99 * 1.65);
      if (p.bumpT > 0) err *= BUMP_ACC;
      if (NS.teamClass) err *= clamp(1 - 0.3 * NS.teamClass(p.team), 0.6, 1.5);
      this.shotForm(p, goalX, goalZ);
      err *= this.shotErr;
      var angle = Math.atan2(sdx, sdz) + gaussR() * err;
      var speed = this.shotSpeed(g) * (0.84 + p.st.sht / 99 * 0.24) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1);
      var ty = this.gaugeHeight(g);
      var vy;
      if (ty < 0) {
        // Low driven daisy-cutter: realistic pace with a slight turf skip instead of a 2x speed hack
        ball.pos.y = NS.BALL_R;
        speed = Math.min(SHOT_MAX, speed * 1.12);
        vy = 0.85;
      } else {
        ty += gaussR() * err * sd * 0.28;
        var kd = sd * AIR_K / speed;
        var Ts = kd < 0.88 ? -Math.log(1 - kd) / AIR_K : sd / speed * 1.45;
        vy = (ty - ball.pos.y) / Ts + 0.5 * G * Ts;
        if (vy < 0.35) vy = 0.35;
        if (vy > 18) vy = 18;
      }
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      ball.spinY = -(bend || 0) * attack * 2.2 + (g > 0.8 ? (Math.random() - 0.5) * 3.5 : 0);
    },

    shootAt: function (p, goalZ, g, accuracy) {
      this.release(p, ACT.SHOOT);
      this.driveShot(p, goalZ, g, accuracy, 0);
    },

    kickTo: function (p, type, tx, tz, mate, accuracy) {
      this.release(p, type);
      this.lastTarget = mate;
      World.ball.spinY = 0;
      this.launch(p, type, clamp(tx, -HALF_W + 2, HALF_W - 2), clamp(tz, -HALF_H + 2, HALF_H - 2), mate, accuracy, null);
    },

    throughSpot: function (p, mate, ax, az, lead, runLead) {
      var attack = NS.attack(p.team), players = World.players;
      var al = Math.sqrt(ax * ax + az * az);
      var sx = al > 0.1 ? ax / al : Math.sin(p.facing), sz = al > 0.1 ? az / al : Math.cos(p.facing);
      var bx = mate.pos.x + mate.vel.x * runLead, bz = mate.pos.z + mate.vel.z * runLead;
      var wide = Math.abs(bz) > HALF_H * 0.45;
      var gx = attack * HALF_W - bx, gl = Math.sqrt(gx * gx + bz * bz) || 1;
      var fx = wide ? attack : (attack * 0.6 + gx / gl * 0.4), fz = wide ? 0 : -bz / gl * 0.4;
      var dx = sx * 0.5 + fx * 0.5, dz = sz * 0.5 + fz * 0.5, dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;
      if (dx * attack < 0.15) { dx = attack * 0.15 + dx * 0.5; dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl; }
      var best = null, bestSc = -1e9, K = [0.6, 0.8, 1, 1.2, 1.4];
      for (var k = 0; k < K.length; k++) {
        var L = lead * K[k];
        var tx = clamp(bx + dx * L, -HALF_W + 4, HALF_W - 4);
        var tz = clamp(bz + dz * L, -HALF_H + 3.5, HALF_H - 3.5);
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

    // Realistic ground pass speeds calibrated to ROLL_K = 0.82 so passes arrive crisply at ~11-14 m/s
    passSpeed: function (d) { return clamp(d * DRAG_K + 12.5, 18, 42); },
    thruSpeed: function (d) { return clamp(d * DRAG_K + 9.5, 15, 38); },

    launch: function (p, type, tx, tz, mate, accuracy, forceTarget) {
      var ball = World.ball;
      var angle, speed, vy, d;
      var bumped = p.bumpT > 0;
      if (bumped) accuracy = (accuracy || 1) * BUMP_ACC;
      if (p.st) accuracy = (accuracy || 1) * (1.45 - p.st.drb / 99 * 0.6);
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
      if ((type === ACT.LONG || (type === ACT.THROUGH && this.lob)) && !thrown) d *= fpow;

      if (type === ACT.LONG && d > 18) d *= 1 + gaussR() * 0.06 * (accuracy || 1);
      if (p.throwT > 0.35) {
        if (d > 24) { dx *= 24 / d; dz *= 24 / d; d = 24; }
        var Tt = clamp(d / 18, 0.45, 1.1);
        speed = airSpeed(d, Tt);
        vy = (THROW_Y - ball.pos.y) / Tt + 0.5 * G * Tt;
        if (mate) { mate.runToX = p.pos.x + dx; mate.runToZ = p.pos.z + dz; mate.runToT = Tt + 0.6; }
      } else if (type === ACT.LONG) {
        var T = clamp(d / 25, 0.85, 1.85);
        vy = 0.5 * G * T;
        speed = airSpeed(d, T);
        ball.pos.y = NS.BALL_R + 0.12;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = T + 0.7; }
      } else if (type === ACT.THROUGH && this.lob) {
        var Tl = clamp(d / 23, 0.95, 1.95);
        vy = 0.5 * G * Tl;
        speed = airSpeed(d, Tl);
        ball.pos.y = NS.BALL_R + 0.12;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = Tl + 0.9; }
      } else if (type === ACT.THROUGH) {
        speed = forceTarget ? clamp(d * DRAG_K + 7, 14, 34) : this.thruSpeed(d);
        vy = 0.55;
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = 1.5; }
      } else {
        speed = this.passSpeed(d);
        vy = d > 18 ? 0.65 : 0.35; // slight turf hop on longer ground passes
        if (mate) { mate.runToX = tx - (dx / d) * 1.5; mate.runToZ = tz - (dz / d) * 1.5; mate.runToT = Math.min(1.0, d / speed + 0.25); }
      }
      if (this.passPower > 0 && !(p.throwT > 0.35)) {
        var pw = 1 + this.passPower * 0.15;
        speed *= pw;
        if (type === ACT.LONG) vy /= pw;
      }
      if (bumped) { speed *= BUMP_POW; vy *= BUMP_POW; }
      if (type === ACT.PASS || (type === ACT.THROUGH && !this.lob)) speed *= fpow;
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      ball.receiver = mate || null;
      ball.thru = !!mate && type === ACT.THROUGH && !(p.throwT > 0.35);
      ball.thruX = tx; ball.thruZ = tz;
      this.pickContester(p.team);
    },

    markOffside: function (p) {
      var players = World.players;
      var ball = World.ball;
      var a = NS.attack(p.team);
      var i, q;
      for (i = 0; i < players.length; i++) players[i].offside = false;
      ball.offTeam = -1;
      var rk = World.match.restart;
      if (p.throwIn || (rk >= 3 && rk <= 5)) return;
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

    shoulder: function (p, c, skill) {
      var ball = World.ball;
      if (!c || ball.owner !== c || c.team === p.team || c.gkHands || c.throwIn || World.match.protectT > 0) return false;
      var dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      if (d > 1.45) return false;
      var front = -(Math.sin(c.facing) * dx + Math.cos(c.facing) * dz) / d;
      p.shoulderT = 0.32;
      p.shoulderDir = (Math.cos(p.facing) * dx - Math.sin(p.facing) * dz) > 0 ? 1 : -1;
      var strength = (p.st.def * 0.6 + p.st.hdr * 0.4) / 99;
      var chance = (skill || 0.3) * (0.55 + strength * 0.7) * (1.35 - c.st.drb / 99 * 0.7) * 0.5;
      if (NS.classEdge) chance *= NS.classEdge(p.team, c.team);
      if (front < -0.55) chance *= 0.3;
      else if (front > 0.45) chance *= 0.8;
      if (c.dribbling) chance *= 0.8;
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
        if (NS.dbg) NS.dbg('shoulder_took_ball', p.team);
        ball.owner = p;
        ball.lastTouchTeam = p.team;
        ball.lastToucher = p.name;
        ball.pickupCooldown = 0.12;
        this.touch(p);
      } else {
        if (NS.dbg) NS.dbg('shoulder_knocked_loose', p.team);
        ball.owner = null;
        ball.vel.set(c.vel.x * 0.9 - nz * 1.8 * p.shoulderDir, 0.45, c.vel.z * 0.9 + nx * 1.8 * p.shoulderDir);
        ball.lastTouchTeam = p.team;
        ball.pickupCooldown = 0.1;
        ball.kicker = c; ball.kickerT = 0.35;
        ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
      }
      c.dribbling = false;
      c.stun = 0.3;
      c.fallT = 0.4;
      return true;
    },

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

    canHead: function (p) {
      var ball = World.ball;
      if (ball.owner || ball.pos.y < 1.45 || ball.pos.y > 3.6 || p.stun > 0) return false;
      if (p === ball.kicker && ball.kickerT > 0) return false;
      var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 > 1.7 * (0.75 + p.st.hdr / 99 * 0.5)) return false;
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

    header: function (p, shot, type, ax, az) {
      var ball = World.ball;
      var attack = NS.attack(p.team);
      var y0 = ball.pos.y;
      if (this.touch(p)) return;
      var gdx = attack * HALF_W - p.pos.x;
      if (shot && Math.sqrt(gdx * gdx + p.pos.z * p.pos.z) > HEAD_SHOT_MAX) {
        shot = false; type = ACT.LONG;
        if (!(ax * ax + az * az > 0.01) || ax * attack < 0) { ax = attack; az = 0; }
      }
      this.release(p, shot ? ACT.SHOOT : type);
      if (shot && NS.Stats) NS.Stats.headed();
      ball.headed = true;
      p.kickT = 0;
      p.headT = 0.55;
      var tx, tz, speed, mate = null, ty = R0;
      if (shot) {
        var aimed = az > 0.1 || az < -0.1;
        tx = attack * (HALF_W + 1);
        tz = aimed ? az * GOAL_HALF_W * 0.8 : clamp(-p.pos.z * 0.3, -3, 3) + (Math.random() - 0.5) * 4;
        ty = 0.85; // downwards header towards the turf/low corner
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
      speed = shot ? clamp(d * 0.95 + 8, 16, 26) : clamp(d * 0.85 + 5, 9, 19);
      speed *= 0.85 + p.st.hdr / 99 * 0.3;
      var angle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.1;
      var T = d / speed;
      ball.vel.set(Math.sin(angle) * speed, (ty - y0) / T + 0.5 * G * T, Math.cos(angle) * speed);
      ball.spinY = 0;
      if (mate) { ball.receiver = mate; ball.thru = false; mate.runToT = 0; }
      this.pickContester(p.team);
      this.lastTarget = mate;
    },

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

    startTackle: function (p, carrier, human, slide) {
      var dx = carrier.pos.x + carrier.vel.x * 0.15 - p.pos.x;
      var dz = carrier.pos.z + carrier.vel.z * 0.15 - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.01) d = 0.01;
      p.tackleT = slide ? 0.52 : 0.32;
      p.tackleCd = slide ? 1.4 : 1.0;
      p.tackleHit = false;
      p.tackleHuman = human;
      p.tackleSlide = !!slide;
      if (slide) p.slideT = 0.85; else p.lungeT = 0.36;
      var lunge = slide ? 15.5 : 13.0;
      p.vel.x = dx / d * lunge;
      p.vel.z = dz / d * lunge;
      p.facing = Math.atan2(dx, dz);
      NS.Audio.tackle();
    },

    // Resolves a lunge each step with continuous turf deceleration instead of instant zero-velocity stops.
    updateTackle: function (p, dt, baseChance) {
      p.tackleT -= dt;
      // Continuous turf friction during a slide or lunge
      var slideDrag = Math.exp(-(p.tackleSlide ? 2.8 : 4.5) * dt);
      p.vel.x *= slideDrag;
      p.vel.z *= slideDrag;

      var ball = World.ball;
      var carrier = ball.owner;
      if (!p.tackleHit && carrier && carrier.team !== p.team && !carrier.gkHands && World.match.protectT <= 0) {
        var dx = carrier.pos.x - p.pos.x;
        var dz = carrier.pos.z - p.pos.z;
        var bx = ball.pos.x - p.pos.x;
        var bz = ball.pos.z - p.pos.z;
        var reach = p.tackleSlide ? 3.8 : 1.56;
        var onBall = bx * bx + bz * bz < reach;
        if (onBall || dx * dx + dz * dz < reach * 0.8) {
          p.tackleHit = true;
          var cl = Math.sqrt(dx * dx + dz * dz) || 1;
          var front = -(Math.sin(carrier.facing) * dx + Math.cos(carrier.facing) * dz) / cl;
          if (front < -0.35 && dx * dx + dz * dz < reach && this.onFoul && World.match.protectT <= 0) {
            p.tackleT = 0;
            p.stun = 1.0;
            carrier.fallT = 0.55;
            if (NS.dbg) NS.dbg('foul_from_behind', p.team);
            this.onFoul(p, carrier);
            return;
          }
          var chance = (baseChance + (p.tackleSlide ? 0.08 : 0)) * (0.6 + p.st.def / 99 * 0.6) * (1.3 - carrier.st.drb / 99 * 0.6);
          if (front < -0.35) chance *= p.tackleSlide ? 0.22 : 0.1;
          else if (front < 0.3) chance *= 0.6;
          else chance *= 1.08;
          if (carrier.dribbling) chance *= 0.75;
          if (!onBall) chance *= 0.45;
          if (NS.classEdge) chance *= NS.classEdge(p.team, carrier.team);
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
              var tl = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
              var pk = 5.5 + Math.random() * 6.5;
              var pa = (Math.random() - 0.5) * 1.1;
              var tx0 = p.vel.x / tl, tz0 = p.vel.z / tl;
              ball.owner = null;
              ball.vel.set((tx0 * Math.cos(pa) - tz0 * Math.sin(pa)) * pk, 0.6 + Math.random() * 1.1, (tx0 * Math.sin(pa) + tz0 * Math.cos(pa)) * pk);
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
            carrier.vel.multiplyScalar(0.35); // carrier stumbles forward with residual momentum
            carrier.dribbling = false;
            p.tackleT = 0;
            p.vel.multiplyScalar(0.45);
            NS.Audio.kick(false);
          } else {
            if (NS.dbg) NS.dbg(p.tackleSlide ? 'slide_contact_lost' : 'tackle_contact_lost', p.team);
            p.stun = (p.tackleSlide ? 0.85 : 0.45) + (front < -0.35 ? 0.25 : 0);
            p.tackleT = 0;
          }
        }
      }
      if (p.tackleT <= 0 && !p.tackleHit) p.stun = p.tackleSlide ? 0.55 : 0.28;
    },

    controls: function (p) {
      var ball = World.ball;
      var vx = ball.vel.x - p.vel.x * 0.5, vz = ball.vel.z - p.vel.z * 0.5;
      var s = Math.sqrt(vx * vx + vz * vz);
      if (s < 7.5 && ball.pos.y < 0.95) return true;
      var react = ball.age;
      if (react < 0.14 && s > 15) return false;
      var pace = Math.max(0, s - (ball.receiver === p ? 18 : 9.5)) / 22;
      var quick = react < REACT_TOUCH ? Math.min(1, (REACT_TOUCH - react) / (REACT_TOUCH - 0.14)) : 0;
      var skill = (p.role === 'GK' ? p.st.drb * 0.5 + 30 : p.st.drb) / 99;
      var fail = (pace * 0.35 + quick * 0.5) * (1.6 - skill * 1.0);
      if (NS.teamClass) fail *= clamp(1 - 0.25 * NS.teamClass(p.team), 0.6, 1.4);
      if (ball.thrown && ball.receiver === p) return Math.random() >= clamp(fail * 0.2, 0, 0.1);
      if (ball.receiver === p) fail *= 0.45;
      if (ball.pos.y > 1.9) fail += 0.18; else if (ball.pos.y > 0.9) fail += 0.07;
      return Math.random() >= clamp(fail, 0, 0.85);
    },

    // Realistic surface-normal reflection when a loose ball or hard shot hits player p.
    knockOff: function (p, hardShot) {
      var ball = World.ball;
      var nx = ball.pos.x - p.pos.x;
      var nz = ball.pos.z - p.pos.z;
      var nl = Math.sqrt(nx * nx + nz * nz);
      if (nl < 0.05) {
        nx = Math.sin(p.facing);
        nz = Math.cos(p.facing);
      } else {
        nx /= nl;
        nz /= nl;
      }

      // Relative velocity of the ball with respect to the player's body
      var rvx = ball.vel.x - p.vel.x;
      var rvz = ball.vel.z - p.vel.z;
      var vn = rvx * nx + rvz * nz;

      if (hardShot) {
        // Hard shot block: elastic reflection off the defender's body normal + slight angular scatter
        var rest = 0.48 + Math.random() * 0.18;
        if (vn < 0) {
          rvx -= (1 + rest) * vn * nx;
          rvz -= (1 + rest) * vn * nz;
        } else {
          rvx = nx * (6 + Math.random() * 5);
          rvz = nz * (6 + Math.random() * 5);
        }
        var tang = (Math.random() - 0.5) * 4.5;
        ball.vel.x = p.vel.x * 0.45 + rvx * 0.65 - nz * tang;
        ball.vel.z = p.vel.z * 0.45 + rvz * 0.65 + nx * tang;
        ball.vel.y = Math.min(7.5, Math.abs(ball.vel.y) * 0.4 + 1.2 + Math.random() * 3.0);
        NS.Audio.tackle();
      } else {
        // Heavy first touch / miscontrol: dampened bounce in the direction of the touch or body normal
        var keep = 0.28 + Math.random() * 0.22;
        if (vn < 0) {
          rvx -= 1.35 * vn * nx;
          rvz -= 1.35 * vn * nz;
        }
        var ang = (Math.random() - 0.5) * 0.9;
        var c = Math.cos(ang), s = Math.sin(ang);
        var vx = rvx * c - rvz * s, vz = rvx * s + rvz * c;
        ball.vel.set(p.vel.x * 0.55 + vx * keep + nx * 1.6, 0.5 + Math.random() * 1.6, p.vel.z * 0.55 + vz * keep + nz * 1.6);
        NS.Audio.kick(false);
      }

      ball.hard = false;
      ball.thrown = false;
      ball.receiver = null;
      ball.contester = null;
      ball.pickupCooldown = 0.15;
      ball.gkTried = 0; // keeper can react to a deflected ball
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
      if (this.touch(p)) return true;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = p;
      ball.kickerT = hardShot ? 0.22 : 0.32;
      return false;
    },

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
