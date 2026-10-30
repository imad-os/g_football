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
  var FIRST_POW = 0.2; // a human's pass with less of the power bar than this: to the first team-mate in line

  // Human reaction: the seconds a player needs between a ball being played and a controlled header / first touch
  // strong / weak foot (Actions.footFor): a shot's error and power multipliers
  var STRONG_ERR = 0.85, WEAK_ERR = 1.6, WEAK_POW = 0.9;
  // a curler (ACT.CURVE): the share of its spin's whole turn it is struck wide by; world.js's MAGNUS
  var CURVE_LEAD = 0.55, CURVE_MAGNUS = 0.042;
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  var REACT_HEAD = 0.45;
  var HEAD_SHOT_MAX = 22;   // metres from the goal a header at goal can come from
  var REACT_TOUCH = 0.34;

  // a through ball still rolls on at this pace where it meets the runner (slower than him: he runs onto it)
  var THRU_END = 6.5;
  var THRU_OUT = 4.8; // ... and rolls on about this far after it if nobody gets to it (grass drag from THRU_END)
  var ROLL_F = NS.PHYS.ROLL_F;
  // Rolling ball (grass drag K and friction F): the time it takes to cover d and still roll at vEnd (closed form).
  function rollV0(d, vEnd) {
    var K = DRAG_K, F = ROLL_F, lo = vEnd, hi = 80;
    for (var i = 0; i < 26; i++) {
      var v0 = (lo + hi) * 0.5;
      var x = (v0 - vEnd) / K - F / (K * K) * Math.log((K * v0 + F) / (K * vEnd + F));
      if (x < d) lo = v0; else hi = v0;
    }
    return hi;
  }
  function rollTime(d, vEnd) {
    var v0 = rollV0(d, vEnd);
    return Math.log((DRAG_K * v0 + ROLL_F) / (DRAG_K * vEnd + ROLL_F)) / DRAG_K;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function gaussR() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; } // ~N(0, 1)

  var Actions = {
    lastTarget: null, // receiver of the last pass (so the cursor can follow it)
    passPower: -1,    // 0..1 from a human's hold time (-1 = normal pace, the CPU)
    human: false,     // the kick being played is a human's (or checkoAI's controller): Dev mode powers apply
    lob: false,       // the pass being played is a long through ball (ACT.THROUGH, lofted over the defenders)
    shown: null,      // a human's last kick for the aim arrow (Dev mode): from (fx, fz) to (x, z), kind, t (seconds left)

    // Assisted pass: the team-mate nearest to where the ball is aimed (stick direction, or facing without input),
    // at a distance that suits the pass type (short / through / long), not marked tight, with a free lane.
    pickTarget: function (passer, ax, az, type) {
      var al = Math.sqrt(ax * ax + az * az);
      var fx, fz;
      if (al > 0.1) { fx = ax / al; fz = az / al; } else { fx = Math.sin(passer.facing); fz = Math.cos(passer.facing); }
      var t = type >= ACT.PASS && type <= ACT.LONG ? type : ACT.PASS;
      // a tap (a human's power bar under 20%): the first team-mate in line that way, however near he is
      if (this.passPower >= 0 && this.passPower < FIRST_POW) {
        var first = this.firstInLine(passer, fx, fz, t, 0.8) || this.firstInLine(passer, fx, fz, t, 0.5);
        if (first) return first;
      }
      var want = this.passPower >= 0 ? DEPTH0[t] + DEPTH1[t] * this.passPower : -1;
      if (this.lob && want >= 0) want = 16 + 36 * this.passPower;
      var best = this.scanTargets(passer, fx, fz, t, 0.82, want);
      if (!best) best = this.scanTargets(passer, fx, fz, t, 0.34, want);
      if (!best) best = this.scanTargets(passer, fx, fz, t, -0.2, want);
      return best;
    },

    // The nearest team-mate within the cone (minDot) the way (fx, fz) points: the first one in line (a slightly wider
    // angle counts as a little further away)
    firstInLine: function (passer, fx, fz, t, minDot) {
      var players = World.players, best = null, bc = 1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== passer.team || m === passer || m.stun > 0) continue;
        if (m.role === 'GK' && t !== ACT.PASS) continue;
        var dx = m.pos.x - passer.pos.x, dz = m.pos.z - passer.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.5 || d > MAX_D[t]) continue;
        var dot = (dx * fx + dz * fz) / d;
        if (dot < minDot) continue;
        var c = d * (1 + (1 - dot) * 3);
        if (c < bc) { bc = c; best = m; }
      }
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
      if (NS.Touch.later(p, 'knockOn', arguments)) return;
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

    // A fake shot (a shot being charged, then the pass button): he swings over the ball without touching it, and with
    // the stick held he steps it about a metre that way (past a defender who bit), then plays on. (ax, az): the stick
    fakeShot: function (p, ax, az) {
      if (NS.Touch.later(p, 'fakeShot', arguments)) return;
      if (ax * ax + az * az > 0.09) {
        this.knockOn(p, ax, az);
        var ball = World.ball, sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) + 3.5;
        var bl = Math.sqrt(ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z) || 1;
        ball.vel.x *= sp / bl; ball.vel.z *= sp / bl; ball.vel.y = 0; // a step, not a push into space
      }
      p.kickT = 0.24; p.kickHard = true; // the swing over the ball
      if (NS.dbg) NS.dbg('fake_shot', p.team);
    },

    // A shot is being shaped (a human charging it): the CPU defenders close to the shooter and goal-side of him throw a
    // leg out to block it (a passive move: they stand, leg out, for BLOCK_T; it reaches ~1 m, js/game/match.js). A real
    // shot then hits them more often; a fake leaves them planted while the attacker goes past. A human's team-mates do
    // not (they only press, see ai.js humanMate).
    blockReact: function (p) {
      var players = World.players, attack = NS.attack(p.team), M = NS.M, s = World.slots;
      for (var i = 0; i < players.length; i++) {
        var o = players[i];
        if (o.team === p.team || o.role === 'GK' || o.isCtl || o.stun > 0 || o.tackleT > 0 || o.blockCd > 0) continue;
        if ((s[0].active && s[0].team === o.team) || (s[1].active && s[1].team === o.team)) continue;
        var dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
        if (dx * dx + dz * dz > 6 * M * 6 * M || dx * attack < -0.5 * M) continue; // close, and between him and the goal
        if (Math.random() > 0.45 + 0.4 * (o.st ? o.st.def / 99 : 0.6)) continue;   // a good defender bites less late
        o.blockT = 0.55; o.blockCd = 1.3;
        o.blockSide = (dz * Math.cos(o.facing) - dx * Math.sin(o.facing)) > 0 ? -1 : 1;
        o.facing = Math.atan2(-dx, -dz);
        o.vel.x *= 0.3; o.vel.z *= 0.3;
        if (NS.dbg) NS.dbg('block_leg', o.team);
      }
    },

    // type: ACT.PASS | THROUGH | LONG | SHOOT, power 0..1, (ax, az) aim input.
    // The ball leaves the player's foot (shared by every kick).
    release: function (p, type) {
      var ball = World.ball;
      this.markOffside(p);
      ball.thrown = !!p.throwIn;
      if (p.throwIn) {
        p.throwIn = false; p.throwT = 0.4;
        // (held over his head behind the line, it is let go over the line: never out of play the moment it is thrown)
        var tl = HALF_H - R0 - 0.05;
        if (ball.pos.z > tl) ball.pos.z = tl; else if (ball.pos.z < -tl) ball.pos.z = -tl;
      }
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
      p.kickFoot = this.footFor(p, Math.sin(p.facing), Math.cos(p.facing)); // (a shot sets it again in shotForm)
      this.lastTarget = null;
      NS.Audio.kick(type >= ACT.SHOOT);
      if (NS.Stats) NS.Stats.kick(p, type >= ACT.SHOOT);
      if (this.onKick) this.onKick(p, type);
    },

    // A free kick set up for a shot (js/game/match.js fkSetup): the taker stands back from the ball (p.fkSpot). Any kick
    // he plays then (a human's or the CPU's, a pass or a shot) is kept and played when his run-up reaches the ball
    // (match.js fkRun), with the same aim, power and assistance. True: kept (nothing is played now).
    fkLater: function (p, fn, args) {
      if (!p.fkSpot || this.fkGo) return false;
      var self = this, a = Array.prototype.slice.call(args), pp = this.passPower, lob = this.lob, hu = this.human;
      p.fkPend = function () {
        var s0 = self.passPower, l0 = self.lob, h0 = self.human;
        self.fkGo = true; self.passPower = pp; self.lob = lob; self.human = hu;
        try { self[fn].apply(self, a); } finally { self.fkGo = false; self.passPower = s0; self.lob = l0; self.human = h0; }
      };
      return true;
    },
    fkGo: false,

    kick: function (p, type, power, ax, az, accuracy, forceTarget) {
      if (this.fkLater(p, 'kick', arguments)) return;
      if (NS.Touch.later(p, 'kick', arguments)) return; // the ball is not at his foot yet: played when he gets to it
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
          // A curler: aimed at a corner, it starts out wide of that post (away from the goal) and bends back in to it.
          // The spin turns the flight by TH over the whole flight (Magnus, decaying as in world.js integrate); a curving
          // path leaves about half of that turn away from the straight line, so it is struck that much wide.
          var side = aimed ? (az > 0 ? 1 : -1) : (p.pos.z > 0 ? -1 : 1); // the corner: +z / -z
          var tz = side * (GOAL_HALF_W - 0.55);
          var cvx = goalX - ball.pos.x, cvz = tz - ball.pos.z;
          var cd0 = Math.sqrt(cvx * cvx + cvz * cvz) || 1;
          this.shotForm(p, goalX, tz);
          speed = (24 + power * 10) * (0.88 + p.st.sht / 99 * 0.16) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1) * this.powMul(ACT.SHOOT);
          var kd = cd0 * AIR_K / speed;
          var cT = kd < 0.85 ? -Math.log(1 - kd) / AIR_K : cd0 / speed * 1.4;
          var chord = Math.atan2(cvx, cvz);
          var ty = NS.GOAL_HEIGHT * (0.32 + 0.33 * power); // the height it should cross the line at
          // which way to start: towards the outside of the corner (its side of the goal), then the spin brings it in
          // (turning the heading up moves the ball along z by -sin(chord): that sign times the corner's side is outward)
          var out = -Math.sin(chord) * side > 0 ? 1 : -1;
          var TH = (0.32 + 0.22 * power) * (0.75 + p.st.sht / 99 * 0.35) * clamp(cd0 / 22, 0.55, 1.25); // rad
          angle = chord + out * TH * CURVE_LEAD;
          angle += gaussR() * 0.035 * (1.05 - power * 0.4) * (accuracy || 1) * (p.bumpT > 0 ? BUMP_ACC : 1) * this.shotErr;
          // the spin that turns it by TH in its flight time: heading change rate = spin * MAGNUS, spin decaying at 1.4/s
          var decay = 1 - Math.exp(-1.4 * cT);
          var spin = TH * 1.4 / (CURVE_MAGNUS * Math.max(0.2, decay));
          vy = Math.min(13, (ty - ball.pos.y) / cT + 0.5 * G * cT);
          spin = out * clamp(spin, 6, 60); // (world.js: the heading turns by -spin * MAGNUS: back towards the goal)
          // the estimate above is close; the real flight (drag, the spin dying away) is then flown and the angle and
          // the lift put right until it crosses the line at the corner and the height wanted (a few quick passes)
          var err0 = angle - chord - out * TH * CURVE_LEAD; // (the striker's own error, kept)
          var aim = chord + out * TH * CURVE_LEAD;
          for (var it = 0; it < 4; it++) {
            ball.vel.set(Math.sin(aim) * speed, Math.max(0.6, vy), Math.cos(aim) * speed);
            ball.spinY = spin;
            if (!World.crossAt(goalX, 3)) break;
            var ez = World.prZ - tz, ey = World.prY - ty;
            // z moves by about -sin(chord) * distance per radian of aim: put the miss right
            var dzda = -Math.sin(chord) * cd0;
            if (dzda > -1 && dzda < 1) break;
            aim -= ez / dzda;
            vy = Math.min(13, Math.max(0.6, vy - ey / Math.max(0.3, World.prT)));
            if (ez < 0.15 && ez > -0.15 && ey < 0.2 && ey > -0.2) break;
          }
          angle = aim + err0;
          ball.vel.set(Math.sin(angle) * speed, Math.max(0.6, vy), Math.cos(angle) * speed);
          ball.spinY = spin;
          ball.shotD = cd0;
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

      var plan = this.plan(p, type, ax, az, forceTarget, false);
      var mate = plan[2];
      this.lastTarget = mate;
      ball.spinY = 0;
      this.launch(p, type, plan[0], plan[1], mate, accuracy, forceTarget);
    },

    // Where a pass goes (x, z) and to whom: [x, z, receiver]. dry: only looking (the aim arrow), nothing is played.
    plan: function (p, type, ax, az, forceTarget, dry) {
      var attack = NS.attack(p.team);
      var human = this.passPower >= 0 && !forceTarget && !(p.throwT > 0.35);
      var asst = human ? this.assist() : 1;
      var mate = forceTarget || (asst > 0.05 && !(p.throwT > 0.35) ? this.pickTarget(p, ax, az, type) : null);
      if (!mate && p.throwT > 0.35) {
        // a throw-in: to the nearest team-mate the way the stick points (the way he faces without it), a short one
        var tl0 = Math.sqrt(ax * ax + az * az);
        var tfx = tl0 > 0.1 ? ax / tl0 : Math.sin(p.facing), tfz = tl0 > 0.1 ? az / tl0 : Math.cos(p.facing);
        mate = this.firstInLine(p, tfx, tfz, ACT.PASS, 0.55) || this.firstInLine(p, tfx, tfz, ACT.PASS, -0.2) || this.nearestMate(p, 24);
        if (mate && mate.role === 'GK') mate = this.nearestMate(p, 24) || mate;
      }
      var tx, tz, man = null;
      if (!mate) {
        if (human) man = this.manualSpot(p, type, ax, az);
        else {
          var al = Math.sqrt(ax * ax + az * az);
          var kx = al > 0.1 ? ax / al : Math.sin(p.facing);
          var kz = al > 0.1 ? az / al : Math.cos(p.facing);
          var d = type === ACT.LONG ? 36 : (type === ACT.THROUGH ? (this.lob ? 34 : 28) : 14);
          man = [p.pos.x + kx * d, p.pos.z + kz * d];
        }
        tx = man[0]; tz = man[1];
      } else if (type === ACT.THROUGH) {
        if (forceTarget) {
          tx = mate.pos.x + mate.vel.x * 0.5;
          tz = mate.pos.z + mate.vel.z * 0.4;
        } else {
          var pw = this.passPower;
          // the power bar: how deep into the space ahead of him (a long through ball: further)
          var want = pw >= 0 ? (this.lob ? 8 + 30 * pw : 5 + 30 * pw) : -1;
          var spot = this.throughSpot(p, mate, ax, az, want);
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
          if (this.lob) {
            // a lofted ball lands, bounces and runs on: it comes down short of the keeper's area (in the middle no
            // deeper than the edge of the box, out wide short of the line) and well inside the touchline
            var central = Math.abs(tz) < NS.BOX_HW + 2 * NS.M;
            var maxA = HALF_W - (central ? NS.BOX_D * 0.85 : 9);
            if (tx * attack > maxA) tx = attack * maxA;
            tz = clamp(tz, -HALF_H + 6, HALF_H - 6);
          }
        }
      } else if (type === ACT.LONG) {
        var ldx = mate.pos.x - p.pos.x, ldz = mate.pos.z - p.pos.z;
        var lT = clamp(Math.sqrt(ldx * ldx + ldz * ldz) / 26, 0.8, 1.75);
        tx = mate.pos.x + mate.vel.x * lT * 0.6 + attack * 2;
        tz = mate.pos.z + mate.vel.z * lT * 0.6;
      } else {
        tx = mate.pos.x + mate.vel.x * 0.25;
        tz = mate.pos.z + mate.vel.z * 0.25;
      }
      // pass assist below 100: the ball goes part of the way from the team-mate to where the stick and power bar say
      var tap = human && mate && this.passPower < FIRST_POW; // (a tap: right to the first man in line, all the help)
      if (human && mate && asst < 0.999 && !tap) {
        man = this.manualSpot(p, type, ax, az);
        tx = man[0] + (tx - man[0]) * asst;
        tz = man[1] + (tz - man[1]) * asst;
      }
      tx = clamp(tx, -HALF_W + 2, HALF_W - 2);
      tz = clamp(tz, -HALF_H + 2, HALF_H - 2);
      // no help (or not all of it): the team-mate nearest to where it goes runs onto it
      if (human && !tap && (asst < 0.999 || !mate)) mate = this.nearestTo(p, tx, tz, type === ACT.PASS ? 9 : 14) || (asst > 0.5 ? mate : null);
      return [tx, tz, mate];
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
      // his strong foot (p.foot): a shot with it is cleaner, with the other one weaker and wilder (Actions.footFor)
      var ft = this.footFor(p, goalX - p.pos.x, goalZ - p.pos.z);
      p.kickFoot = ft;
      // (the weak foot by his weak-foot rating: 1, as good as the strong one; 0.5, the usual WEAK_ERR / WEAK_POW)
      var wf = p.wf >= 0 ? p.wf : 0.5;
      if ((ft > 0) === (p.foot !== 'L')) err *= STRONG_ERR;
      else { err *= 1 + (WEAK_ERR - 1) * 2 * (1 - wf); pow *= 1 - (1 - WEAK_POW) * 2 * (1 - wf); }
      // how cleanly the ball is met where it is (js/game/touch.js): stretched, first time, a volley, off balance
      if (!dead && NS.Touch) { NS.Touch.quality(p); err *= NS.Touch.qErr; pow *= NS.Touch.qPow; }
      this.shotPow = pow; this.shotErr = err;
    },
    shotPow: 1, shotErr: 1,

    // The foot he strikes with (1 right, -1 left) for a ball played in direction (dx, dz): the foot on the side the
    // ball is on at his feet (a ball clearly on one side: that foot); else his strong foot, unless the ball has to go
    // sharply across to the other side (a right-footer shooting far to his right uses his left).
    footFor: function (p, dx, dz) {
      var ball = World.ball, f = p.foot === 'L' ? -1 : 1;
      var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z;
      if (bx * bx + bz * bz > 0.04 && bx * bx + bz * bz < 4) {
        var side = wrapA(Math.atan2(bx, bz) - p.facing); // > 0: on his left
        if (side > 0.35) return -1;
        if (side < -0.35) return 1;
      }
      var a = wrapA(Math.atan2(dx, dz) - p.facing); // > 0: to his left
      if (f > 0 && a < -0.8) return -1;
      if (f < 0 && a > 0.8) return 1;
      return f;
    },
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
      var speed = this.shotSpeed(g) * (0.84 + p.st.sht / 99 * 0.24) * this.shotPow * (p.bumpT > 0 ? BUMP_POW : 1) * this.powMul(ACT.SHOOT);
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
      if (this.human) this.shown = { x: ball.pos.x + Math.sin(angle) * sd, z: ball.pos.z + Math.cos(angle) * sd, fx: ball.pos.x, fz: ball.pos.z, kind: 2, t: 1.4 };
      ball.spinY = -(bend || 0) * attack * 2.2 + (g > 0.8 ? (Math.random() - 0.5) * 3.5 : 0);
    },

    shootAt: function (p, goalZ, g, accuracy) {
      if (this.fkLater(p, 'shootAt', arguments)) return;
      if (NS.Touch.later(p, 'shootAt', arguments)) return;
      this.release(p, ACT.SHOOT);
      this.driveShot(p, goalZ, g, accuracy, 0);
    },

    kickTo: function (p, type, tx, tz, mate, accuracy) {
      if (this.fkLater(p, 'kickTo', arguments)) return;
      if (NS.Touch.later(p, 'kickTo', arguments)) return;
      this.release(p, type);
      this.lastTarget = mate;
      World.ball.spinY = 0;
      this.launch(p, type, clamp(tx, -HALF_W + 2, HALF_W - 2), clamp(tz, -HALF_H + 2, HALF_H - 2), mate, accuracy, null);
    },

    // A through ball: the spot in the space ahead of the runner where he and the ball arrive together, before any
    // defender (or the keeper) can get there. The run goes the way the stick points, bent towards the goal; `want` (a
    // human's power bar, -1 for the CPU) picks how deep.
    throughSpot: function (p, mate, ax, az, want) {
      var attack = NS.attack(p.team), players = World.players;
      var al = Math.sqrt(ax * ax + az * az);
      var sx = al > 0.1 ? ax / al : Math.sin(p.facing), sz = al > 0.1 ? az / al : Math.cos(p.facing);
      var bx = mate.pos.x + mate.vel.x * 0.2, bz = mate.pos.z + mate.vel.z * 0.2;
      var wide = Math.abs(bz) > HALF_H * 0.45;
      var gx = attack * HALF_W - bx, gl = Math.sqrt(gx * gx + bz * bz) || 1;
      var fx = wide ? attack : (attack * 0.6 + gx / gl * 0.4), fz = wide ? 0 : -bz / gl * 0.4;
      var dx = sx * 0.5 + fx * 0.5, dz = sz * 0.5 + fz * 0.5, dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;
      if (dx * attack < 0.3) { dx = attack * 0.3 + dx * 0.5; dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl; }
      var run = 11.2 * (mate.st ? 0.9 + mate.st.spd / 99 * 0.2 : 1);
      var vEnd = THRU_END, best = null, bestSc = -1e9;
      for (var L = 5; L <= 40; L += 2.5) {
        var rx0 = bx + dx * L, rz0 = bz + dz * L;
        var tx = clamp(rx0, -HALF_W + 3, HALF_W - 3);
        var tz = clamp(rz0, -HALF_H + 2.5, HALF_H - 2.5);
        var ex = tx - p.pos.x, ez = tz - p.pos.z, d = Math.sqrt(ex * ex + ez * ez);
        if (d < 6) continue;
        // never a ball he cannot keep in play or the keeper's: a run that would take him off the pitch, a ball that
        // rolls out over a line if he is a moment late (THRU_OUT past the spot), one into the goal area
        var bad = 0, ux0 = ex / d, uz0 = ez / d;
        if (rx0 !== tx || rz0 !== tz) bad += 1;
        if (Math.abs(tx + ux0 * THRU_OUT) > HALF_W - 0.5 || Math.abs(tz + uz0 * THRU_OUT) > HALF_H - 0.5) bad += 1.2;
        if (Math.abs(tx) > HALF_W - NS.SIX_D - 1.5 && Math.abs(tz) < NS.BOX_HW) bad += 2;
        var gkT = 99;
        var bt = rollTime(d, vEnd);                       // the ball gets there
        var mx = tx - mate.pos.x, mz = tz - mate.pos.z;
        var rt = 0.25 + Math.sqrt(mx * mx + mz * mz) / run; // the runner gets there
        var ot = 99;
        for (var i = 0; i < players.length; i++) {
          var o = players[i];
          if (o.team === p.team || o.stun > 0) continue;
          var ox = tx - o.pos.x, oz = tz - o.pos.z;
          var t = 0.3 + Math.sqrt(ox * ox + oz * oz) / (o.role === 'GK' ? 10.5 : 10.8);
          // a defender standing in the ball's path cuts it out on the way
          var u = ((o.pos.x - p.pos.x) * ex + (o.pos.z - p.pos.z) * ez) / d;
          if (u > 1 && u < d - 1 && o.role !== 'GK') {
            var perp = Math.abs((o.pos.x - p.pos.x) * ez - (o.pos.z - p.pos.z) * ex) / d;
            var tu = rollTime(u, Math.max(vEnd, 1)) * 0.9;
            if (perp < 1.6 + tu * 3) t = Math.min(t, tu + 0.1);
          }
          if (t < ot) ot = t;
          if (o.role === 'GK') gkT = t;
        }
        var meet = Math.max(bt, rt);
        if (gkT < meet + 0.25) bad += 2.5;                 // the keeper comes out and takes it
        var sc = clamp(ot - meet, -1.5, 1.5) * 1.6       // first to it
          - Math.abs(bt - rt) * 0.9                        // together (he does not wait, it does not run away from him)
          + (tx - mate.pos.x) * attack * 0.012             // deeper is better
          - bad;
        if (want > 0) sc -= Math.abs(L - want) / Math.max(want, 8) * 1.4;
        if (sc > bestSc) { bestSc = sc; best = [tx, tz]; }
      }
      if (!best) best = [clamp(bx + dx * 12, -HALF_W + 3, HALF_W - 3), clamp(bz + dz * 12, -HALF_H + 2.5, HALF_H - 2.5)];
      return best;
    },

    // Where a human aims (the stick, or the way he faces) and how far the power bar sends it: the pass with no help.
    manualSpot: function (p, type, ax, az) {
      var al = Math.sqrt(ax * ax + az * az);
      var kx = al > 0.1 ? ax / al : Math.sin(p.facing), kz = al > 0.1 ? az / al : Math.cos(p.facing);
      var t = type >= ACT.PASS && type <= ACT.LONG ? type : ACT.PASS;
      var pw = this.passPower >= 0 ? this.passPower : 0.5;
      var d = this.lob ? 16 + 36 * pw : DEPTH0[t] + DEPTH1[t] * pw;
      return [clamp(p.pos.x + kx * d, -HALF_W + 2, HALF_W - 2), clamp(p.pos.z + kz * d, -HALF_H + 2, HALF_H - 2)];
    },

    // Dev mode: the pace of a kick type x its setting
    powMul: function (type) {
      var s = World.settings;
      if (!s || !this.human) return 1;
      if (type === ACT.PASS) return s.powLow || 1;
      if (type === ACT.THROUGH) return (this.lob ? s.powLobThru : s.powThru) || 1;
      if (type === ACT.LONG) return s.powLong || 1;
      return s.powShot || 1;
    },
    // Dev mode: pass assist 0..1 (a human's pass)
    assist: function () {
      var s = World.settings;
      return s && s.passAssist >= 0 ? s.passAssist / 100 : 1;
    },

    // The aim arrow (Dev mode): where the pass / shot being charged would go, without playing it. Returns
    // [x, z, kind] (kind 0 ground, 1 lofted, 2 shot) or null.
    aimPoint: function (p, type, power, ax, az, lob) {
      if (type >= ACT.SHOOT) {
        var attack = NS.attack(p.team), goalX = attack * HALF_W;
        var aimed = az > 0.1 || az < -0.1;
        var gz = aimed ? clamp(az, -1, 1) * (GOAL_HALF_W - 0.9) : (p.pos.z > 0 ? -1 : 1) * (GOAL_HALF_W - 1.3);
        return [goalX, gz, 2];
      }
      var keepP = this.passPower, keepL = this.lob;
      this.passPower = power; this.lob = !!lob;
      var plan = this.plan(p, type, ax, az, null, true);
      this.passPower = keepP; this.lob = keepL;
      return [plan[0], plan[1], type === ACT.LONG || lob ? 1 : 0];
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
        // (thrown flat and quick, from over his head down to the receiver's waist: not looped up for a header)
        if (d > 20) { dx *= 20 / d; dz *= 20 / d; d = 20; }
        var Tt = clamp(d / 21, 0.4, 0.8);
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
        // along the ground into his path, still rolling (slower than him) when he gets there; a long one (20 m and
        // more) is skimmed a little off the grass (Settings > Dev mode > Through ball lift)
        var lift = World.settings && World.settings.thruLift >= 0 ? World.settings.thruLift : 0.4;
        vy = d > 20 * NS.M && lift > 0 ? Math.sqrt(2 * G * lift * NS.M) : 0.5;
        speed = World.speedFor(d, forceTarget ? 4.5 : THRU_END, vy);
        if (mate) { mate.runToX = tx; mate.runToZ = tz; mate.runToT = World.kickT + 0.8; }
      } else {
        speed = this.passSpeed(d);
        vy = d > 18 ? 0.65 : 0.35; // slight turf hop on longer ground passes
        if (mate) { mate.runToX = tx - (dx / d) * 1.5; mate.runToZ = tz - (dz / d) * 1.5; mate.runToT = Math.min(1.0, d / speed + 0.25); }
      }
      if (this.passPower > 0 && !(p.throwT > 0.35) && !(type === ACT.THROUGH && !this.lob)) {
        var pw = 1 + this.passPower * 0.15;
        speed *= pw;
        if (type === ACT.LONG) vy /= pw;
      }
      if (bumped) { speed *= BUMP_POW; vy *= BUMP_POW; }
      if (type === ACT.PASS || (type === ACT.THROUGH && !this.lob)) speed *= fpow;
      if (!thrown) speed *= this.powMul(type);
      ball.vel.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);
      // a throw always goes into the pitch (an error in its aim never sends it back out over the line)
      if (thrown && ball.vel.z * ball.pos.z > 0) ball.vel.z = -ball.vel.z * 0.5;
      if (this.human) this.shown = { x: tx, z: tz, fx: ball.pos.x, fz: ball.pos.z, kind: type === ACT.LONG || (type === ACT.THROUGH && this.lob) ? 1 : 0, t: 1.4 };
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
      // he got his body in and a foot to it: the ball is poked off the carrier's foot (never handed over). Half the
      // time it is steered back to the challenger's own feet (he collects it), else it runs loose
      ball.owner = null;
      ball.lastTouchTeam = p.team;
      ball.lastToucher = p.name;
      ball.kicker = c; ball.kickerT = 0.35;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0.4; ball.headed = false;
      if (Math.random() < 0.5) {
        if (NS.dbg) NS.dbg('shoulder_took_ball', p.team);
        var kx = p.pos.x + Math.sin(p.facing) * 0.8 - ball.pos.x, kz = p.pos.z + Math.cos(p.facing) * 0.8 - ball.pos.z;
        var kl = Math.sqrt(kx * kx + kz * kz) || 1, ks = Math.min(3, kl * 2.5);
        ball.vel.set(p.vel.x * 0.7 + kx / kl * ks, 0, p.vel.z * 0.7 + kz / kl * ks);
        ball.pickupCooldown = 0.05;
        ball.receiver = p;
      } else {
        if (NS.dbg) NS.dbg('shoulder_knocked_loose', p.team);
        ball.vel.set(c.vel.x * 0.9 - nz * 1.8 * p.shoulderDir, 0.45, c.vel.z * 0.9 + nx * 1.8 * p.shoulderDir);
        ball.pickupCooldown = 0.1;
      }
      p.touchT = 0.2; p.touchFoot = p.shoulderDir; p.touchKind = 0;
      this.touch(p);
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
      var tx, tz, speed, mate = null, ty = R0, thru = false;
      if (shot) {
        var aimed = az > 0.1 || az < -0.1;
        tx = attack * (HALF_W + 1);
        tz = aimed ? az * GOAL_HALF_W * 0.8 : clamp(-p.pos.z * 0.3, -3, 3) + (Math.random() - 0.5) * 4;
        ty = 0.85; // downwards header towards the turf/low corner
      } else {
        mate = this.pickTarget(p, ax, az, type === ACT.PASS ? ACT.PASS : ACT.THROUGH);
        if (mate && type === ACT.THROUGH) {
          // a headed through ball: flicked on into the space ahead of the runner (the same spot a kicked one goes to),
          // and he runs on to it (ball.thru), as for a kicked through ball
          var ts = this.throughSpot(p, mate, ax, az, -1);
          tx = ts[0]; tz = ts[1]; thru = true;
        } else if (mate) {
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
      if (mate) { ball.receiver = mate; ball.thru = thru; mate.runToT = 0; }
      ball.thruX = tx; ball.thruZ = tz;
      this.pickContester(p.team);
      this.lastTarget = mate;
    },

    oneTwo: function (p, ax, az) {
      if (this.fkLater(p, 'oneTwo', arguments)) return null;
      if (NS.Touch.later(p, 'oneTwo', arguments)) return null;
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
        var reach = p.tackleSlide ? 3.8 : 2.25; // (squared: a standing tackle reaches ~1.5 from him)
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
          // the ball out of his feet (a big touch, between two touches at a sprint) is there to be won; tight at the
          // feet of a good dribbler, less so
          var cbx = ball.pos.x - carrier.pos.x, cbz = ball.pos.z - carrier.pos.z, cbd = Math.sqrt(cbx * cbx + cbz * cbz);
          if (cbd > 1.5) chance *= 1 + Math.min(0.5, (cbd - 1.5) * 0.4);
          else chance *= 1.1 - (carrier.ctl || 0.6) * 0.2;
          if (NS.classEdge) chance *= NS.classEdge(p.team, carrier.team);
          chance = clamp(chance, 0.03, 0.92);
          if (Math.random() < chance) {
            if (NS.dbg) { NS.dbg(p.tackleSlide ? 'slide_won' : 'tackle_won', p.team); if (!onBall) NS.dbg('tackle_won_via_body', p.team); }
            if (NS.Commentary) NS.Commentary.event('TACKLE', p.team);
            ball.receiver = null;
            ball.contester = null;
            ball.lastTouchTeam = p.team;
            ball.lastToucher = p.name;
            // the tackle meets the ball: it is knocked away (never handed over). A slide / a lunge at full stretch
            // sends it on; a clean standing tackle wins it back to his own feet, where he collects it
            var tl = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
            var tx0 = p.vel.x / tl, tz0 = p.vel.z / tl;
            ball.owner = null;
            ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0.4; ball.headed = false;
            ball.kicker = carrier; ball.kickerT = 0.35;
            if (Math.random() < (p.tackleSlide ? 0.8 : 0.45)) {
              if (NS.dbg) NS.dbg('tackle_poked_loose', p.team);
              var pk = 5.5 + Math.random() * 6.5;
              var pa = (Math.random() - 0.5) * 1.1;
              ball.vel.set((tx0 * Math.cos(pa) - tz0 * Math.sin(pa)) * pk, 0.6 + Math.random() * 1.1, (tx0 * Math.sin(pa) + tz0 * Math.cos(pa)) * pk);
              ball.pickupCooldown = 0.18;
            } else {
              if (NS.dbg) NS.dbg('tackle_won_to_feet', p.team);
              var fx = p.pos.x + tx0 * 0.4 - ball.pos.x, fz = p.pos.z + tz0 * 0.4 - ball.pos.z;
              var fl = Math.sqrt(fx * fx + fz * fz) || 1, fs = Math.min(3.5, fl * 3);
              ball.vel.set(p.vel.x * 0.45 + fx / fl * fs, 0, p.vel.z * 0.45 + fz / fl * fs);
              ball.pickupCooldown = 0.05;
              ball.receiver = p;
            }
            p.touchT = 0.2; p.touchFoot = 1; p.touchKind = 0;
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
            // the foot got a toe to it without winning it: the ball is deflected, still there for either of them
            if (onBall && Math.random() < 0.35) {
              if (NS.dbg) NS.dbg('tackle_deflected', p.team);
              var da2 = (Math.random() - 0.5) * 2.2, dsp = 2 + Math.random() * 4;
              var cvx = ball.vel.x, cvz = ball.vel.z;
              ball.owner = null;
              ball.vel.set(cvx * 0.5 + Math.sin(p.facing + da2) * dsp, 0.3 + Math.random() * 0.8, cvz * 0.5 + Math.cos(p.facing + da2) * dsp);
              ball.lastTouchTeam = p.team; ball.lastToucher = p.name;
              ball.kicker = p; ball.kickerT = 0.5;
              ball.receiver = carrier; ball.contester = null; ball.pickupCooldown = 0.05;
              ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0.4; ball.headed = false;
              p.touchT = 0.2; p.touchFoot = 1; p.touchKind = 0;
              NS.Audio.kick(false);
            }
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
      var fail = (pace * 0.25 + quick * 0.32) * (1.5 - skill * 1.0);
      if (NS.teamClass) fail *= clamp(1 - 0.25 * NS.teamClass(p.team), 0.6, 1.4);
      if (ball.thrown && ball.receiver === p) return Math.random() >= clamp(fail * 0.2, 0, 0.1);
      if (ball.receiver === p) fail *= 0.45;
      if (ball.pos.y > 1.9) fail += 0.12; else if (ball.pos.y > 0.9) fail += 0.04;
      return Math.random() >= clamp(fail, 0, 0.6);
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
        // (it stays near him: a miscontrol he can still recover, not a ball sent away)
        var keep = 0.14 + Math.random() * 0.14;
        if (vn < 0) {
          rvx -= 1.2 * vn * nx;
          rvz -= 1.2 * vn * nz;
        }
        var ang = (Math.random() - 0.5) * 0.9;
        var c = Math.cos(ang), s = Math.sin(ang);
        var vx = rvx * c - rvz * s, vz = rvx * s + rvz * c;
        ball.vel.set(p.vel.x * 0.6 + vx * keep + nx * 0.9, 0.3 + Math.random() * 1.0, p.vel.z * 0.6 + vz * keep + nz * 0.9);
        NS.Audio.kick(false);
      }

      ball.hard = false;
      ball.thrown = false;
      ball.receiver = hardShot ? null : p; // (a miscontrol: he goes straight after it)
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

    // The receiver of a through ball keeps running on to the spot it is played into while the ball is still far from
    // him (more than ~4 m) and he is not there yet.
    runOn: function (p) {
      var ball = World.ball;
      if (!ball.thru || ball.receiver !== p || ball.owner) return false;
      var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z;
      var sx = ball.thruX - p.pos.x, sz = ball.thruZ - p.pos.z;
      return bx * bx + bz * bz > 49 && sx * sx + sz * sz > 2.5;
    },

    // the team-mate (not the keeper) nearest to (x, z) within r of it
    nearestTo: function (p, x, z, r) {
      var players = World.players, best = null, bestD = r * r;
      for (var i = 0; i < players.length; i++) {
        var q = players[i];
        if (q.team !== p.team || q === p || q.role === 'GK' || q.stun > 0) continue;
        var dx = q.pos.x - x, dz = q.pos.z - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = q; }
      }
      return best;
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
