/* The player-ball interaction system, shared by humans, the CPU and checkoAI: the ball is never carried. It is a free
 * ball (world.js) even while a player has it; every change of its direction or pace is a contact by a foot (inside,
 * outside, laces, sole), a thigh, the chest or the head, struck from where the ball really is, with a quality that
 * depends on his ratings, his pace, the turn, his balance and a man on him. Between two touches it rolls on by itself
 * and he has to run to it; a touch too big, a ball run past or nicked by an opponent is no longer his.
 *   Touch.carry   (every step, every player)  the body (turn rate, balance), going to the ball, the dribble touches
 *   Touch.receive (Match: a ball taken)       the first touch: cushioned, into his stride, or a heavy one
 *   Touch.later   (Actions: a kick asked for) a kick waits until the ball is in reach of his foot
 *   Touch.quality (Actions.shotForm)          how cleanly a pass / shot is struck off the ball as it is
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var R = NS.BALL_R;
  var PI = Math.PI;
  var REACH = 1.65;    // a foot gets to the ball up to this far from his centre (~1 m, stretching) ...
  var REACH_Y = 0.8;   // ... and this high (above: thigh, chest, head)
  var BODY = 0.42;     // closer than this the ball is against his feet / shins: pushed out (player-ball collision)
  var LOSE = 3.4;      // a ball this far from him (~2.1 m) and running away faster than he can run is no longer his
  var LOSE_MAX = 5.2;  // ... and one this far (~3.3 m) is gone whatever it does
  var POKE_R = 1.3;    // an opponent's foot gets to the dribbler's ball up to this far from his centre (~0.8 m)
  var TURN_T = 0.34;   // a turn with the ball (Touch.turnMove): how long the move takes (match.js animate shows it)
  var KQ_T = 1.4;      // a kick asked for with the ball out of reach waits this long for him to get to it
  var TOUCH_T = 0.2;   // a touch's animation (match.js animate)
  // p.touchKind: what touched the ball (the animation shows it)
  var K_INSIDE = 0, K_OUTSIDE = 1, K_LACES = 2, K_SOLE = 3, K_THIGH = 4, K_CHEST = 5, K_HEAD = 6;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function wrapA(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }
  function gaussR() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; } // ~N(0, 1)

  // the nearest opponent to (x, z) (not on the ground): its distance (Touch.opp: who)
  function nearOpp(p, x, z) {
    var pl = World.players, best = 99;
    Touch.opp = null;
    for (var i = 0; i < pl.length; i++) {
      var q = pl[i];
      if (q.team === p.team || q.stun > 0) continue;
      var dx = q.pos.x - x, dz = q.pos.z - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) { best = d; Touch.opp = q; Touch.oppX = q.pos.x; Touch.oppZ = q.pos.z; }
    }
    return best;
  }

  // The foot that plays a ball at (bx, bz) from him (1 right, -1 left): the one on its side; a ball in front of
  // him: the foot that sends it across the body with the inside to turn (turn > 0: to his left), else the strong one.
  function footOf(p, bx, bz, turn) {
    var side = wrapA(Math.atan2(bx, bz) - p.facing); // > 0: on his left
    if (side > 0.3) return -1;
    if (side < -0.3) return 1;
    if (turn > 0.45) return 1;
    if (turn < -0.45) return -1;
    return p.foot === 'L' ? -1 : 1;
  }

  // The ball leaves his foot / body at (vx, vy, vz): the contact itself (the only place a touch moves the ball)
  function contact(p, vx, vy, vz, kind, foot, cd) {
    var ball = World.ball;
    ball.vel.set(vx, vy, vz);
    if (kind === K_OUTSIDE) ball.spinY = foot * 2.5; // the outside of the foot puts a little curl on it
    else ball.spinY *= 0.3;
    ball.lastTouchTeam = p.team;
    ball.lastToucher = p.name;
    p.touchT = TOUCH_T;
    p.touchFoot = foot;
    p.touchKind = kind;
    p.tchCd = cd;
  }

  var Touch = {
    opp: null, oppX: 0, oppZ: 0,
    deferred: false, // the last kick asked for was kept for later (Touch.later): Controls follows the pass then
    go: false,       // a kept kick is being played now

    // The ratings a touch reads, from the six of js/data/players.js (once per player, Match: rate)
    rate: function (p) {
      var s = p.st;
      if (!s) return;
      p.ctl = (p.role === 'GK' ? s.drb * 0.5 + 30 : s.drb) / 99;           // ball control, first touch
      p.agi = (s.drb * 0.55 + s.spd * 0.45) / 99;                            // agility: how sharply he turns
      p.bal = (s.def * 0.45 + s.hdr * 0.3 + s.sta * 0.25) / 99;              // balance / strength
      // weak foot (0..1): better technicians are more two-footed, plus a fixed personal variation
      var h = 7;
      for (var i = 0; i < p.name.length; i++) h = (h * 31 + p.name.charCodeAt(i)) % 1009;
      p.wf = clamp(0.2 + s.drb / 99 * 0.4 + (h % 5) * 0.08, 0.2, 1);
    },

    // The ball is in reach of his foot.
    reachable: function (p) {
      var ball = World.ball;
      if (ball.pos.y > 1.0) return false;
      var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
      return dx * dx + dz * dz <= REACH * REACH;
    },

    // The moment to strike it: as soon as a foot gets to it (at a stretch it comes off a little worse: Touch.quality),
    // so a pass or shot asked for is never held back longer than it takes him to reach the ball
    strikeNow: function (p) {
      var ball = World.ball;
      if (ball.pos.y > 1.0) return false;
      var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
      return dx * dx + dz * dz <= REACH * REACH;
    },

    // A kick (Actions fn with its arguments) asked for by the man on the ball while it is out of his reach: kept, and
    // played (Touch.carry) as soon as he gets to it, or dropped after KQ_T. True: kept (nothing is played now).
    later: function (p, fn, args) {
      var ball = World.ball, A = NS.Actions;
      this.deferred = false;
      if (this.go || ball.owner !== p || p.gkHands || p.throwIn || p.fkSpot) return false;
      var m = World.match;
      if ((m.restart || m.penalty || m.so) && p === m.setTaker) return false; // a dead ball: he stands at it
      if (this.strikeNow(p)) return false;
      p.kq = fn;
      p.kqA = Array.prototype.slice.call(args);
      p.kqT = KQ_T;
      p.kqPow = A.passPower; p.kqLob = A.lob; p.kqHum = A.human;
      p.kqFol = 0;
      this.deferred = true;
      if (NS.dbg) NS.dbg('kick_waits_for_ball', p.team);
      return true;
    },

    fire: function (p) {
      var A = NS.Actions, s0 = A.passPower, l0 = A.lob, h0 = A.human, fn = p.kq, a = p.kqA, fol = p.kqFol;
      p.kq = null; p.kqA = null;
      // a pass at a team-mate decided before he got to the ball: aimed where that man has run to meanwhile
      if (fn === 'kickTo' && a[4]) { var wt = KQ_T - p.kqT; a[2] += a[4].vel.x * wt; a[3] += a[4].vel.z * wt; }
      this.go = true; A.passPower = p.kqPow; A.lob = p.kqLob; A.human = p.kqHum;
      try { A[fn].apply(A, a); } finally { this.go = false; A.passPower = s0; A.lob = l0; A.human = h0; }
      if (fol > 0 && NS.Controls && NS.Controls.follow) NS.Controls.follow(p, A.lastTarget, fol);
    },

    // How cleanly he strikes the ball as it is now (Actions.shotForm): Touch.qErr multiplies the error, Touch.qPow the
    // pace. A ball at the end of his reach, rolling across / at him (a first-time ball), off the grass (a volley) or
    // struck off balance comes off worse; a better technician loses less of it.
    quality: function (p) {
      var ball = World.ball;
      var e = 1, pw = 1, ctl = p.ctl || 0.6;
      var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z, bd = Math.sqrt(bx * bx + bz * bz);
      if (bd > 1.25) { e *= 1 + (bd - 1.25) * 0.8; pw *= 1 - Math.min(0.2, (bd - 1.25) * 0.2); }
      var rx = ball.vel.x - p.vel.x, rz = ball.vel.z - p.vel.z, rs = Math.sqrt(rx * rx + rz * rz);
      if (p.inT < 0.35) rs = Math.max(rs, p.inV * (1 - p.inT / 0.35)); // played straight off his first touch
      e *= 1 + rs / 40 * (1.25 - ctl);
      if (ball.pos.y > 0.5) { e *= 1 + (ball.pos.y - 0.5) * 0.7; pw *= 0.95; }
      if (p.balT > 0) { e *= 1 + 0.35 * (1.1 - (p.bal || 0.6)); pw *= 0.93; }
      this.qErr = e; this.qPow = pw;
    },
    qErr: 1, qPow: 1,

    // The ball is no longer his (ran away from him, or an opponent got to it first): a loose ball he chases.
    lose: function (p, why) {
      var ball = World.ball;
      ball.owner = null;
      ball.receiver = p; // he still runs to it (AI / Controls: a ball played to him)
      ball.thru = false;
      ball.contester = null;
      ball.kicker = null; ball.kickerT = 0;
      ball.pickupCooldown = 0;
      ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0.4; ball.headed = false;
      ball.hard = false; ball.chip = false; ball.pen = false;
      p.kq = null; p.kqA = null;
      p.dribbling = false;
      if (NS.Actions) NS.Actions.pickContester(p.team);
      if (NS.dbg) NS.dbg(why, p.team);
    },

    // An opponent gets a foot to the dribbler's ball: it comes off his foot (his run, and a little astray), loose for
    // whoever gets to it first (usually him); take: he steps in and takes it off him (it stays at his own feet)
    poke: function (q, p, take) {
      var ball = World.ball, a = (Math.random() - 0.5) * 1.6, ps = 1.5 + Math.random() * 2.5;
      var hx = Math.sin(q.facing + a), hz = Math.cos(q.facing + a);
      this.lose(p, take ? 'ball_taken_off_dribbler' : 'ball_nicked_off_dribbler');
      if (take) {
        var fx = q.pos.x + Math.sin(q.facing) * 0.6 - ball.pos.x, fz = q.pos.z + Math.cos(q.facing) * 0.6 - ball.pos.z;
        ball.vel.set(q.vel.x * 0.8 + fx * 3, 0, q.vel.z * 0.8 + fz * 3);
      } else ball.vel.set(ball.vel.x * 0.25 + q.vel.x * 0.5 + hx * ps, 0.15, ball.vel.z * 0.25 + q.vel.z * 0.5 + hz * ps);
      ball.lastTouchTeam = q.team; ball.lastToucher = q.name;
      ball.receiver = q; ball.pickupCooldown = 0.15; // (he reacts to it first)
      q.touchT = TOUCH_T; q.touchFoot = 1; q.touchKind = K_INSIDE;
    },

    // Every step, after his brain (Controls / AI) has set the velocity it wants, before he moves.
    carry: function (p, dt) {
      if (p.tchCd > 0) p.tchCd -= dt;
      if (p.balT > 0) p.balT -= dt;
      if (p.inT < 9) p.inT += dt;
      var ball = World.ball, m = World.match;
      if (ball.owner !== p || p.gkHands || p.throwIn || p.fkSpot || p.fkPend) {
        if (ball.owner !== p) p.kq = null;
        p.cOwn = false;
        return;
      }
      var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z;
      var bd = Math.sqrt(bx * bx + bz * bz);
      if (p.tackleT > 0 || p.stun > 0) {
        // knocked off balance (or lunging): no touch, and a ball that runs on away from him is not his any more
        p.cOwn = false;
        if (bd > LOSE && !m.restart) this.lose(p, 'touch_too_heavy');
        return;
      }
      if (!p.cOwn) { p.cOwn = true; p.pvx = p.vel.x; p.pvz = p.vel.z; }

      // a dead ball (kick-off, free kick, corner, goal kick, penalty): he stands at it until he plays it
      if ((m.restart && p === m.setTaker) || m.penalty || m.so) {
        if (p.kq && this.reachable(p)) this.fire(p);
        p.pvx = p.vel.x; p.pvz = p.vel.z;
        return;
      }

      // ---- the body: what his brain asked for (the run he wants, and where the ball should go). The brains ease the
      // velocity towards the run they want (a share of the gap each step), so the way he wants to go is read ahead of
      // that easing: the step's change, carried on (the ball is touched where he is going, not where he was going)
      var wx = p.vel.x, wz = p.vel.z, ws = Math.sqrt(wx * wx + wz * wz);
      var ix = wx + (wx - p.pvx) * 4, iz = wz + (wz - p.pvz) * 4, il = Math.sqrt(ix * ix + iz * iz);
      var ux, uz;
      if (il > 0.5 && ws > 0.5) { ux = ix / il; uz = iz / il; }
      else if (ws > 0.5) { ux = wx / ws; uz = wz / ws; }
      else { ux = Math.sin(p.facing); uz = Math.cos(p.facing); }
      // he wants to stop (the stick let go, the CPU holding it up): he steps to the ball and puts his sole on it
      var stop = ws < 1.5 || il < 1.5;
      // ---- a turn with the ball: the stick reversed while it is in reach of his foot. He does not run a wide arc
      // round it: a drag-back (the sole rolls it back) or a Cruyff (the inside of the foot plays it behind his standing
      // leg), and he spins round with it
      // A ball a little ahead of his foot when he asks for it: the turn is kept (p.turnQ) while he steps onto the ball
      // at his pace (no braking arc), and made as soon as his foot gets to it
      if (p.turnQ > 0) p.turnQ -= dt;
      var hs0 = Math.sqrt(p.pvx * p.pvx + p.pvz * p.pvz), rev = 0;
      if (!stop && !p.kq && !(p.turnT > 0) && ball.pos.y < REACH_Y) {
        if (hs0 > 1) rev = wrapA(Math.atan2(ux, uz) - Math.atan2(p.pvx, p.pvz));
        var back = rev > 2.2 || rev < -2.2;
        if (p.turnQ > 0 && !(rev > 1.2 || rev < -1.2)) p.turnQ = 0; // (the stick came back round: no turn)
        if ((back && hs0 > 2.5) || p.turnQ > 0) {
          if (bd <= REACH && !(p.tchCd > 0.12)) {
            this.turnMove(p, ux, uz, ws, Math.max(hs0, 3), rev);
            p.turnQ = 0; p.pvx = p.vel.x; p.pvz = p.vel.z;
            return;
          }
          if (!(p.turnQ > 0) && bd <= REACH + 1.4) p.turnQ = 0.45;
        }
      } else p.turnQ = 0;
      // ... and what he can do: no instant turn. The turn rate falls with his pace and rises with his agility; a sharp
      // turn asked for at pace brakes him (less for a well balanced player)
      var vx = wx, vz = wz, ps = hs0;
      if (p.turnQ > 0) {
        // stepping onto the ball for the turn: straight to it, at his pace
        var qs = Math.max(ps, 4) / (bd || 1);
        vx = bx * qs; vz = bz * qs;
      } else if (ws > 0.5 && ps > 2) {
        var a0 = Math.atan2(p.pvx, p.pvz), da = wrapA(Math.atan2(wx, wz) - a0), ada = da < 0 ? -da : da;
        var maxT = (5.5 + 6.5 * (p.agi || 0.6)) / (1 + ps * 0.07) * (p.balT > 0 ? 0.55 : 1) * dt;
        if (ada > maxT) {
          var na = a0 + (da > 0 ? maxT : -maxT), ns = Math.min(ws, ps);
          if (ada > 0.8) ns *= 1 - (ada - 0.8) / (PI - 0.8) * (0.8 - 0.4 * (p.bal || 0.6)) * Math.min(1, dt * 6);
          vx = Math.sin(na) * ns; vz = Math.cos(na) * ns;
        }
      }

      // ---- going to the ball: the ball does not follow him, he follows the ball. Out of his feet (or a kick waiting
      // for it) he runs to where it will be; the further it is, the more he does
      // A ball rolling on ahead of him from his own touch: he keeps his stride (it slows back to him) and only bends
      // his run onto its line. Any other ball (stopped, going across or back, far away, a kick waiting): he goes to it
      var bvx = ball.vel.x, bvz = ball.vel.z, bs = Math.sqrt(bvx * bvx + bvz * bvz);
      var ahead0 = bx * ux + bz * uz, lat0 = bx * uz - bz * ux;
      var rolling = !p.kq && !stop && ws > 3 && ahead0 > 0 && bvx * ux + bvz * uz > ws - 1.5 && bd < LOSE;
      var w = rolling ? clamp(((lat0 < 0 ? -lat0 : lat0) - 0.35) / 1.2, 0, 0.6) : (p.kq ? 1 : clamp((bd - 0.95) / 1.5, 0, 1));
      if (w > 0) {
        var lead = clamp(bd / 11, 0.05, 0.4);
        var cx = bx + bvx * lead, cz = bz + bvz * lead, cl = Math.sqrt(cx * cx + cz * cz) || 1;
        var cs;
        if (rolling) cs = Math.sqrt(vx * vx + vz * vz);
        else {
          cs = Math.min(13.5, Math.max(ws, bs + 2.5 + bd * 0.6, 4)); // (the further it is, the harder he goes after it)
          if (cl < 0.9) cs = Math.min(cs, bs + 0.5);
        }
        vx += (cx / cl * cs - vx) * w;
        vz += (cz / cl * cs - vz) * w;
      }
      p.vel.x = vx; p.vel.z = vz;
      var vs = Math.sqrt(vx * vx + vz * vz);
      if (vs > 0.6) p.facing = Math.atan2(vx, vz);
      else if (ws > 0.5) p.facing += clamp(wrapA(Math.atan2(wx, wz) - p.facing), -9 * dt, 9 * dt); // turning on the spot

      // ---- the ball against his feet / shins: it bounces off him (never through him)
      if (bd < BODY && ball.pos.y < 1.2 && !(p.turnT > 0)) { // (a turn plays it past his feet)
        var nx = bd > 0.01 ? bx / bd : Math.sin(p.facing), nz = bd > 0.01 ? bz / bd : Math.cos(p.facing);
        ball.pos.x = p.pos.x + nx * BODY; ball.pos.z = p.pos.z + nz * BODY;
        var rn = (bvx - vx) * nx + (bvz - vz) * nz;
        if (rn < 0) { ball.vel.x -= 1.15 * rn * nx; ball.vel.z -= 1.15 * rn * nz; } // (a soft knock off the foot)
        bx = nx * BODY; bz = nz * BODY; bd = BODY;
      }

      // ---- a kick waiting for the ball: played the moment it is in reach (or given up)
      if (p.kq) {
        p.kqT -= dt;
        if (this.strikeNow(p)) { this.fire(p); p.pvx = p.vel.x; p.pvz = p.vel.z; return; }
        if (p.kqT <= 0) { p.kq = null; p.kqA = null; if (NS.dbg) NS.dbg('kick_ball_out_of_reach', p.team); }
      }

      // ---- lost: too far, or running away faster than he can follow it (a kick waiting for it: he is on his way to
      // play it, it stays his a little longer)
      if (p.kq ? bd > LOSE_MAX * 1.4 : (bd > LOSE_MAX || (bd > LOSE && (bvx * bx + bvz * bz) / bd > 12.5))) { this.lose(p, 'touch_too_heavy'); return; }
      // ... or an opponent's foot gets to it: as near to it as he is (or nearer: it is out of his feet) the opponent
      // reacts (his Defense against the dribbler's control) and pokes it away, or takes it off him
      if (ball.pos.y < 1.0 && !(m.protectT > 0)) {
        var od = nearOpp(p, ball.pos.x, ball.pos.z), q = this.opp;
        if (q && od < POKE_R && od < bd + 0.25 && !(q.tackleT > 0) && q.role !== 'GK') {
          var rate = (2.2 + 3.5 * clamp(bd - od, 0, 1.5)) * (0.35 + 0.65 * (q.st ? q.st.def / 99 : 0.6)) * (1.25 - 0.5 * (p.ctl || 0.6));
          if (Math.random() < rate * dt) { this.poke(q, p, od < 0.95 && Math.random() < 0.5); return; }
        }
      }

      // ---- the touch
      if (!(p.tchCd > 0) && !(p.turnQ > 0) && bd <= REACH && ball.pos.y < REACH_Y) this.dribbleTouch(p, bx, bz, bd, ux, uz, stop ? 0 : ws, vs);
      p.pvx = p.vel.x; p.pvz = p.vel.z;
    },

    // The turn with the ball (Touch.carry): the ball is played back past him the new way (ux, uz), just far enough to
    // be met in his first strides, and he pivots on the spot (TURN_T: the move; p.turnKind 0 drag-back, 1 Cruyff).
    // ws: the pace he wants, hs: his pace now, rev: the turn (radians, > 0 to his left)
    turnMove: function (p, ux, uz, ws, hs, rev) {
      var ball = World.ball;
      var cruyff = Math.random() < (hs > 6.5 ? 0.6 : 0.25);
      var foot = rev > 0 ? 1 : -1; // turning to his left: the right foot drags it back (and the other way round)
      if (cruyff) foot = -foot;    // (a Cruyff: the other foot plays it behind the standing leg)
      // where the ball goes: past the side of that foot, about a stride into the new way
      var sx = uz * foot * 0.3, sz = -ux * foot * 0.3, ahead = 2 + ws * 0.12;
      var gx = p.pos.x + ux * ahead + sx - ball.pos.x, gz = p.pos.z + uz * ahead + sz - ball.pos.z;
      var gl = Math.sqrt(gx * gx + gz * gz) || 1;
      var ns = 1.5 + (p.agi || 0.6) * 3.5; // (his pace out of the turn)
      var v = Math.sqrt(2 * 9 * gl) + ns; // (it rolls out to there and slows on the grass, ahead of him as he goes)
      // a clean move from a good dribbler; a man on him, his weak foot and his pace make it harder
      var opp = nearOpp(p, p.pos.x, p.pos.z);
      var diff = 0.04 + hs / 13 * 0.05 + (opp < 2.2 ? 0.06 : 0);
      if ((foot > 0) !== (p.foot !== 'L')) diff += (1 - (p.wf || 0.5)) * 0.05;
      diff *= 1.4 - (p.ctl || 0.6);
      var ea = gaussR() * diff, es = 1 + gaussR() * diff * 0.8, c = Math.cos(ea), s = Math.sin(ea);
      var vx = gx / gl * v * es, vz = gz / gl * v * es;
      contact(p, vx * c + vz * s, 0, -vx * s + vz * c, cruyff ? K_INSIDE : K_SOLE, foot, TURN_T * 0.9);
      // he pivots: the old run stops, the new one starts (a quicker man gets going sooner)
      p.turnA0 = p.facing;
      p.vel.x = ux * ns; p.vel.z = uz * ns;
      p.facing = Math.atan2(ux, uz);
      p.turnT = TURN_T; p.turnKind = cruyff ? 1 : 0; p.turnFoot = foot;
      p.touchT = 0; // (the move has its own animation)
      p.balT = Math.max(p.balT || 0, 0.12 * (1.3 - (p.bal || 0.6)));
      if (NS.dbg) NS.dbg(cruyff ? 'turn_cruyff' : 'turn_drag_back', p.team);
    },

    // A touch while he runs with it (or stands on it): does the ball need one, and which.
    dribbleTouch: function (p, bx, bz, bd, ux, uz, ws, vs) {
      var ball = World.ball;
      var bvx = ball.vel.x, bvz = ball.vel.z, bs = Math.sqrt(bvx * bvx + bvz * bvz);
      var opp = nearOpp(p, p.pos.x, p.pos.z);
      var foot, kind, tx, tz, ts;
      if (ws < 1.5) {
        // he wants to stand on it: a ball rolling on is stopped with the sole; one not at his feet is rolled back to
        // them, on the side away from a man on him (shielding: his body between the man and the ball)
        var sx = Math.sin(p.facing), sz = Math.cos(p.facing);
        if (opp < 3.2) {
          var ox = p.pos.x - this.oppX, oz = p.pos.z - this.oppZ, ol = Math.sqrt(ox * ox + oz * oz) || 1;
          sx = ox / ol; sz = oz / ol;
        }
        var gx = sx * 0.9 - bx, gz = sz * 0.9 - bz, gl = Math.sqrt(gx * gx + gz * gz);
        if (bs > 1.2 || gl > 0.45) {
          var gs = Math.min(2.2, gl * 2.6);
          tx = gl > 0.01 ? gx / gl * gs : 0; tz = gl > 0.01 ? gz / gl * gs : 0;
          foot = footOf(p, bx, bz, 0);
          this.apply(p, tx, tz, K_SOLE, foot, 0, opp, bd, bx, bz, 0.32);
        }
        return;
      }
      // he runs: the ball wants to go where he wants to go. A touch when it would run under his feet (he has caught
      // it up), when it goes clearly another way than his run (a turn: the touch is what turns it), or when it is dead
      var hb = bs > 0.8 ? Math.atan2(bvx, bvz) : p.facing;
      var turn = wrapA(Math.atan2(ux, uz) - hb), at = turn < 0 ? -turn : turn;
      var ahead = bx * ux + bz * uz;
      var along = bvx * ux + bvz * uz;
      // (a small change of line waits for the next touch of his stride, which takes it the new way; a real turn cannot)
      var need = bs < 0.8 || at > 0.6 || (ahead < 0.85 + vs * 0.02 && along < vs + 0.5);
      if (!need) return;
      // the size of the touch: short ones walking, longer at a run, big ones at a sprint (the ball is more out of his
      // control while it is out, and easier to win)
      // (the grass slows a rolling ball by ~10 units/s per second at a run: a touch Delta faster than him runs ~Delta^2/20
      // out ahead and is caught again after ~Delta/5 s: a jog ~0.6 units out, a touch every ~0.7 s; a sprint ~1.1, ~0.9 s)
      // a man close to him: close control, shorter touches that keep it under his body
      var delta = (1.6 + ws * 0.2 + Math.max(0, ws - 10.5) * 0.35) * (opp < 4 ? 0.45 + 0.55 * opp / 4 : 1);
      ts = ws + delta;
      foot = footOf(p, bx, bz, turn);
      kind = at < 0.45 ? (ws > 10.5 ? K_LACES : K_INSIDE) : ((turn > 0) === (foot > 0) ? K_INSIDE : K_OUTSIDE);
      var cd = 0.1, brake = 1;
      if (at > 2.5 && vs < 7) {
        // a U-turn from a walk / jog: the sole drags it back and he turns with it
        kind = K_SOLE; ts = 1.6 + ws * 0.22; brake = 0.3; cd = 0.22;
      } else if (at > 1.7) {
        // a hook / cut at a run: the inside (or outside) of the foot takes it across, and he has to check his stride
        ts = 2.2 + ws * 0.35; brake = 0.45 + 0.3 * (p.bal || 0.6); cd = 0.16;
      } else if (at > 0.9) {
        ts *= 0.8; brake = 0.8 + 0.15 * (p.bal || 0.6);
      }
      if (brake < 1) {
        p.vel.x *= brake; p.vel.z *= brake;
        p.balT = Math.max(p.balT || 0, (0.1 + at * 0.09) * (1.25 - (p.bal || 0.6)));
      }
      this.apply(p, ux * ts, uz * ts, kind, foot, at, opp, bd, bx, bz, cd);
    },

    // The touch itself: aimed at velocity (tx, tz); its error and a heavy touch now and then come from how hard it is
    // (the turn, his pace, the ball's speed at him, a man on him, his weak foot, a ball behind him or off balance)
    // and how good he is with the ball.
    apply: function (p, tx, tz, kind, foot, turn, opp, bd, bx, bz, cd) {
      var ball = World.ball;
      var ps = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      var rx = ball.vel.x - p.vel.x, rz = ball.vel.z - p.vel.z, rs = Math.sqrt(rx * rx + rz * rz);
      var diff = 0.02 + turn * 0.05 + ps / 13 * 0.04 + rs * 0.004;
      if (opp < 2.2) diff += 0.05; else if (opp < 3.5) diff += 0.02;
      if ((foot > 0) !== (p.foot !== 'L')) diff += (1 - (p.wf || 0.5)) * 0.06;
      if (bx * Math.sin(p.facing) + bz * Math.cos(p.facing) < -0.2) diff += 0.05; // behind him
      if (bd > 1.2) diff += 0.03;                                                 // stretching for it
      if (p.balT > 0) diff += 0.04;
      if (p.bumpT > 0) diff += 0.04;
      diff *= 1.4 - (p.ctl || 0.6);
      if (NS.teamClass) diff *= clamp(1 - 0.2 * NS.teamClass(p.team), 0.7, 1.3);
      var ea = gaussR() * diff * 1.2, es = 1 + gaussR() * diff * 1.4;
      if (kind !== K_SOLE && Math.random() < diff * 0.12) {
        es *= 1.15 + Math.random() * 0.25; // a heavy touch: it runs away from him
        if (NS.dbg) NS.dbg('heavy_touch', p.team);
      }
      var c = Math.cos(ea), s = Math.sin(ea);
      contact(p, (tx * c + tz * s) * es, 0, (-tx * s + tz * c) * es, kind, foot, cd);
    },

    // The first touch of a ball he has just taken (Match, after Actions.controls said he controls it): the part of
    // the body by its height, where he wants it (into his stride at a run, a human's right-stick direction, else at
    // his feet), and the incoming pace: a good first touch kills nearly all of it, a poor one keeps some of it (the
    // ball bounces off him) and goes astray.
    receive: function (p) {
      var ball = World.ball;
      var y = ball.pos.y;
      var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z;
      var rx = ball.vel.x - p.vel.x, rz = ball.vel.z - p.vel.z, rs = Math.sqrt(rx * rx + rz * rz);
      var kind = y < 0.75 ? K_INSIDE : (y < 1.5 ? K_THIGH : (y < 2.35 ? K_CHEST : K_HEAD));
      var ps = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      var ox, oz, os, dir = false;
      // a human's first-touch direction (right stick while the pass came)
      for (var i = 0; i < 2; i++) {
        var sl = World.slots[i];
        if (sl.active && sl.player === p && sl.preT > 0) {
          var pl = Math.sqrt(sl.preX * sl.preX + sl.preZ * sl.preZ) || 1;
          ox = sl.preX / pl; oz = sl.preZ / pl; os = Math.max(ps, 6) + 3.5; dir = true;
          sl.preT = 0;
        }
      }
      // ... or the oriented control: the left stick held the way he wants to go. The first touch takes the ball that
      // way, a stride out, and he opens his body and goes with it (no stop and turn after controlling it)
      var oriented = false;
      for (var j = 0; !dir && j < 2; j++) {
        var sj = World.slots[j];
        if (!sj.active || sj.player !== p) continue;
        var pd = sj.pad || NS.Input.pads[sj.idx];
        if (!pd || pd.x * pd.x + pd.y * pd.y < 0.25) continue;
        var pdl = Math.sqrt(pd.x * pd.x + pd.y * pd.y);
        ox = pd.x / pdl; oz = pd.y / pdl; os = Math.max(ps, 4) + 3; dir = true; oriented = true;
      }
      var opp1 = nearOpp(p, p.pos.x, p.pos.z);
      if (!dir && ps > 3) {
        ox = p.vel.x / ps; oz = p.vel.z / ps; dir = true;
        os = ps + (1.6 + ps * 0.2) * (opp1 < 4 ? 0.45 + 0.55 * opp1 / 4 : 1);
      }
      if (!dir) {
        // at his feet, on the side away from a man on him
        var opp0 = nearOpp(p, p.pos.x, p.pos.z), sx = Math.sin(p.facing), sz = Math.cos(p.facing);
        if (opp0 < 3.2) {
          var qx = p.pos.x - this.oppX, qz = p.pos.z - this.oppZ, ql = Math.sqrt(qx * qx + qz * qz) || 1;
          sx = qx / ql; sz = qz / ql;
        }
        var gx = sx * 0.9 - bx, gz = sz * 0.9 - bz, gl = Math.sqrt(gx * gx + gz * gz) || 1;
        ox = gx / gl; oz = gz / gl; os = Math.min(2.5, gl * 2.8);
      }
      // how hard it is: its pace at him, the body part, a man on him, a ball to turn round (it comes the other way to
      // where he wants it), from behind his back, his balance
      // (turn 0: it runs on the way he wants it, pi: it has to be turned right round; standing, it is only cushioned)
      var turn = 0;
      if (dir && rs > 1) turn = Math.acos(clamp((rx * ox + rz * oz) / rs, -1, 1));
      var diff = rs / 40 + (kind === K_THIGH ? 0.1 : (kind === K_CHEST ? 0.15 : (kind === K_HEAD ? 0.3 : 0))) + turn / PI * 0.15;
      var opp = nearOpp(p, p.pos.x, p.pos.z);
      if (opp < 2.4) diff += 0.15; else if (opp < 4) diff += 0.07;
      if (rx * Math.sin(p.facing) + rz * Math.cos(p.facing) > rs * 0.5) diff += 0.08; // it comes from behind him
      if (p.balT > 0) diff += 0.06;
      var q = diff * (1.35 - (p.ctl || 0.6));
      if (ball.receiver === p) q *= 0.85; // he was ready for it
      if (ball.thrown) q *= 0.4;          // a throw to his feet / chest
      if (NS.teamClass) q *= clamp(1 - 0.2 * NS.teamClass(p.team), 0.7, 1.3);
      var keep = clamp(0.02 + q * 0.16, 0.02, 0.25);
      if (Math.random() < q * 0.12) { keep += 0.15; if (NS.dbg) NS.dbg('first_touch_bounced_off', p.team); }
      var ea = gaussR() * q * 0.35, c = Math.cos(ea), s = Math.sin(ea);
      if (kind !== K_INSIDE) os *= 0.6; // the body cushions it down more than it directs it
      var tx = (ox * c + oz * s) * os, tz = (-ox * s + oz * c) * os;
      var vy = kind === K_INSIDE ? (q > 0.35 ? 0.4 + q * 1.5 : 0) : (kind === K_HEAD ? 1.8 + q * 1.5 : 0.6 + q * 1.5);
      var foot = footOf(p, bx, bz, 0);
      if (kind === K_INSIDE && rs < 9 && ps < 3) kind = K_SOLE;
      contact(p, tx + rx * keep, vy, tz + rz * keep, kind, foot, kind === K_INSIDE || kind === K_SOLE ? 0.18 : 0.3);
      if (kind === K_HEAD) p.headT = Math.max(p.headT, 0.3);
      p.inV = rs; p.inT = 0;
      if (q > 0.3) p.balT = Math.max(p.balT || 0, 0.15);
      if (oriented && kind !== K_HEAD) {
        // he turns with the touch: facing the new way and already moving off after it (a big turn shows him opening
        // his body to the ball: match.js animate, turnKind 2)
        var fa = Math.atan2(ox, oz), dA = wrapA(fa - p.facing);
        if (dA > 1.2 || dA < -1.2) { p.turnA0 = p.facing; p.turnT = TURN_T; p.turnKind = 2; p.turnFoot = dA > 0 ? -1 : 1; }
        p.facing = fa;
        var ov = Math.max(ps * 0.6, 2.5);
        p.vel.x = ox * ov; p.vel.z = oz * ov;
      }
      p.pvx = p.vel.x; p.pvz = p.vel.z; p.cOwn = true;
    }
  };

  NS.Touch = Touch;
})(window.RS6 = window.RS6 || {});
