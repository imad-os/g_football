/* The goalkeepers' own brain: every keeper (the CPU's, a human team's and checkoAI's) plays with these rules.
 *
 *  - Position: on the line that splits the angle between the ball and his two posts, off his line by how far the ball
 *    is (6 m out with the ball 35 m away, 1-2 m with it in the box, near post with it wide), and as a sweeper well off
 *    it (up to the edge of the box and beyond) behind his own back line when the ball is far up the pitch.
 *  - Set pieces: on his line for corners and penalties, 1-2 m out for a free kick near the box.
 *  - One against one (a man through with no defender left to cover): he comes out to narrow the angle, makes himself
 *    big (arms and legs spread) and, once the man is close or his touch runs away from him, dives at his feet to
 *    smother the ball. A loose ball he gets to first is claimed, diving on it when an attacker is close.
 *  - Shots: reaction time, then a side-step or a dive to where the shot crosses the line (same physics as the ball).
 *  - The keeper button (a human team, held): straight out at the ball or the man who has it, the same smother.
 * js/game/ai.js hands every keeper to Keeper.step with its helpers (K). Units: world units (NS.M per metre). */
(function (NS) {
  'use strict';

  var World = NS.World;
  var Actions = NS.Actions;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });
  var M = NS.M;
  var GHW = NS.GOAL_HALF_W;

  var SMOTHER_T = 0.7;        // a dive at the feet: seconds on the ground
  var SMOTHER_REACH = 2.1;    // ... reach of his hands and body (units) while it lasts
  var CLOSE_GAP = 4.5 * M;    // in a 1 v 1 he stays about this far in front of the man while closing him down
  var JUMP_REACH = 2.6 * M;   // the highest he can get a hand to (arms up and a jump): a ball over it goes over him

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rating(p) { return p.st ? p.st.def / 99 : 0.7; }
  function inBox(p, x, z) {
    var gx = -NS.attack(p.team) * HALF_W;
    return Math.abs(x - gx) < NS.BOX_D && Math.abs(z) < NS.BOX_HW;
  }

  // He has it in his hands (or at his feet outside his box).
  function claim(p, hands) {
    var ball = World.ball;
    if (Actions.touch(p)) return;
    if (NS.Stats) NS.Stats.gain(p);
    ball.owner = p;
    ball.lastTouchTeam = p.team; ball.lastToucher = p.name;
    ball.pickupCooldown = 0.2; ball.hard = false; ball.chip = false; ball.gkTried = 0; ball.gkCd = 0;
    ball.receiver = null; ball.contester = null; ball.pen = false; ball.thru = false;
    p.gkHands = !!hands; p.gkHold = 0; p.dribbling = false;
    if (hands) p.catchT = 0.4;
  }

  // The ball pushed away from goal (a smother outside his box, or one he cannot hold).
  function block(p) {
    var ball = World.ball, a = NS.attack(p.team);
    ball.owner = null;
    var side = ball.pos.z >= p.pos.z ? 1 : -1;
    ball.vel.set(a * (5 + Math.random() * 5), 0.8 + Math.random() * 1.5, side * (4 + Math.random() * 6));
    ball.lastTouchTeam = p.team; ball.lastToucher = p.name;
    ball.pickupCooldown = 0.25; ball.kicker = p; ball.kickerT = 0.4;
    ball.receiver = null; ball.contester = null; ball.thru = false; ball.hard = false;
    ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
    Actions.touch(p);
    NS.Audio.kick(false);
  }

  // A dive at the feet (or onto a loose ball) towards (tx, tz).
  function smother(p, tx, tz) {
    var dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    p.smotherT = SMOTHER_T;
    p.smotherDone = false;
    p.diveT = 0.8; p.diveHigh = false; p.diveCd = 1.4;
    p.facing = Math.atan2(dx, dz);
    var sp = clamp(d * 3.2, 6, 11);
    p.vel.x = dx / d * sp; p.vel.z = dz / d * sp;
    p.diveRoll = (Math.cos(p.facing) * dx - Math.sin(p.facing) * dz) > 0 ? -1.25 : 1.25;
    p.spreadT = 0;
    if (NS.dbg) NS.dbg('gk_smother', p.team);
  }

  // The smother reaches the ball: he wins it (held in his box, pushed away outside it), or the man keeps it.
  function smotherHit(p, prof) {
    var ball = World.ball, c = ball.owner;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    if (dx * dx + dz * dz > SMOTHER_REACH * SMOTHER_REACH || ball.pos.y > 1.2) return;
    p.smotherDone = true;
    var hands = inBox(p, ball.pos.x, ball.pos.z);
    if (!c) { if (hands) claim(p, true); else block(p); return; }
    if (c.team === p.team || c.gkHands) return;
    var sp = Math.sqrt(c.vel.x * c.vel.x + c.vel.z * c.vel.z);
    var drb = c.st ? c.st.drb / 99 : 0.7;
    // a heavy touch or a man flat out has less control; a good dribbler takes it round him more often
    var chance = 0.42 + 0.3 * rating(p) - 0.3 * drb + (sp > 10 ? 0.12 : 0) + 0.04 * (prof.iq || 0);
    if (NS.classEdge) chance *= NS.classEdge(p.team, c.team);
    if (Math.random() < clamp(chance, 0.15, 0.85)) {
      if (NS.dbg) NS.dbg('gk_smother_won', p.team);
      c.stun = 0.45; c.fallT = 0.5; c.dribbling = false;
      c.vel.x *= 0.4; c.vel.z *= 0.4;
      if (hands) claim(p, true); else block(p);
      NS.Audio.ooh();
    } else if (NS.dbg) NS.dbg('gk_smother_beaten', p.team);
  }

  // Team-mates of keeper p who can still stop carrier c on his way to goal: in his lane to the goal (K.blockersToGoal),
  // or right on him (within 2.5 m, about to tackle).
  function cover(p, c, ownGoalX, K) {
    var n = K.blockersToGoal(c, p.team, ownGoalX), players = World.players;
    for (var i = 0; i < players.length; i++) {
      var q = players[i];
      if (q.team !== p.team || q === p || q.stun > 0) continue;
      var dx = q.pos.x - c.pos.x, dz = q.pos.z - c.pos.z;
      if (dx * dx + dz * dz < 2.5 * M * 2.5 * M) n++;
    }
    return n;
  }

  // Where he stands for the ball at (bx, bz): on the bisector of the angle to his posts, `depth` units off his line.
  var POS = { x: 0, z: 0 };
  function anglePos(ownGoalX, a, bx, bz, depth) {
    var along = (bx - ownGoalX) * a;
    if (along < 0.6 * M) { // level with the line or behind it: at the near post
      POS.x = ownGoalX + a * 0.4 * M; POS.z = (bz >= 0 ? 1 : -1) * (GHW - 0.35);
      return POS;
    }
    var l1x = ownGoalX - bx, l1z = -GHW - bz, l2x = ownGoalX - bx, l2z = GHW - bz;
    var n1 = Math.sqrt(l1x * l1x + l1z * l1z), n2 = Math.sqrt(l2x * l2x + l2z * l2z);
    var ux = l1x / n1 + l2x / n2, uz = l1z / n1 + l2z / n2, ul = Math.sqrt(ux * ux + uz * uz) || 1;
    ux /= ul; uz /= ul;
    // B + s u is `depth` from the line; never closer than 2.5 m to the ball
    var s = (depth - along) / (ux * a);
    var bd = Math.sqrt((bx - ownGoalX) * (bx - ownGoalX) + bz * bz);
    s = clamp(s, 0, Math.max(0, bd - 0.5 * M));
    if (s < 2.5 * M && bd > 2.5 * M) s = Math.min(bd - 0.4 * M, 2.5 * M);
    POS.x = bx + ux * s; POS.z = bz + uz * s;
    return POS;
  }

  var Keeper = {
    step: function (p, dt, prof, K) {
      var ball = World.ball, mt = World.match;
      var a = NS.attack(p.team);
      var ownGoalX = -a * HALF_W;
      var T = K.teams[p.team], O = K.teams[1 - p.team];
      var limit = GHW - 0.4;
      var c = ball.owner;
      if (p.diveCd > 0) p.diveCd -= dt;
      if (p.rushT > 0) p.rushT -= dt;
      if (p.spreadT > 0) p.spreadT -= dt;
      if (p.oneT === undefined) p.oneT = 0;

      // facing a penalty: on the line, still, until it is struck
      if (mt.penalty && c && c.team !== p.team) {
        p.vel.x = 0; p.vel.z = 0; p.spreadT = 0;
        p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        return;
      }

      // a dive at the feet: he slides in and gets a hand / his body to the ball
      if (p.smotherT > 0) {
        p.smotherT -= dt;
        var sg = Math.exp(-3 * dt);
        p.vel.x *= sg; p.vel.z *= sg;
        if (!p.smotherDone && c !== p) smotherHit(p, prof);
        return;
      }

      // in the air during a dive: no steering, he glides and lands
      if (p.diveT > 0 && c !== p) {
        var glide = Math.exp(-2.2 * dt);
        p.vel.x *= glide; p.vel.z *= glide;
        return;
      }

      if (c === p) {
        // gkHold is counted by the match (5 s rule)
        p.vel.x *= 0.8; p.vel.z *= 0.8;
        p.spreadT = 0;
        if (p.diveT > 0) return; // still on the grass after a diving catch
        p.aiCd -= dt;
        // (a moment first for the team to spread out: longer for a goal kick, when they start in their own half)
        if (p.gkHold > (World.match.restart === 5 ? 2.2 : 1.3) && p.aiCd <= 0) {
          p.aiCd = 0.25;
          if (K.gkDistribute(p, prof, p.gkHold > 3.5)) p.gkHold = 0;
        }
        return;
      }

      // ---- a shot coming: react (after the reaction time), step or dive to where it crosses our line
      var toward = ball.vel.x * -a;
      if (!c && ball.lastTouchTeam !== p.team && toward > 8) {
        p.gkRT += dt;
        var lineX = ownGoalX + a * 1.2;
        var t = (lineX - ball.pos.x) / ball.vel.x;
        if (t > 0 && t < 2.4) {
          if (p.gkRT < prof.gkReact) { p.vel.x *= 0.85; p.vel.z *= 0.85; return; }
          // off his line: he meets the shot where he stands, not on the line behind him; unless it goes over his head
          // (a chip, a looping ball): then he backpedals to his line and goes up for it there
          var meetX = Math.abs(p.pos.x - ownGoalX) > 1.8 ? p.pos.x : lineX;
          if (meetX !== lineX) {
            var tMe = (p.pos.x - ball.pos.x) / ball.vel.x;
            if (tMe > 0) { World.predict(tMe); if (World.prY > JUMP_REACH) meetX = lineX; }
          }
          var tm = meetX === lineX ? t : Math.max(0.05, (meetX - ball.pos.x) / ball.vel.x);
          World.predict(tm);
          var cz = World.prZ, cy = World.prY;
          t = tm;
          var need = Math.abs(cz - p.pos.z);
          // a high ball near him: he jumps straight up for it, both hands over his head (a dive with no roll)
          if (p.diveT <= 0 && p.diveCd <= 0 && need <= 1.3 && cy > 1.8 * M && cy < NS.GOAL_HEIGHT + 0.8 && t < 0.45) {
            p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
            p.vel.z = (cz - p.pos.z) * 2; p.vel.x = (meetX - p.pos.x) * 2;
            p.diveT = 0.8; p.diveCd = 1.2; p.diveHigh = true; p.diveRoll = 0; p.spreadT = 0;
            if (NS.dbg) NS.dbg('gk_jump', p.team);
            return;
          }
          if (p.diveT <= 0 && p.diveCd <= 0 && need > 1.3 && t < 0.6 && cy < NS.GOAL_HEIGHT + 0.8 &&
              Math.abs(cz) < GHW + 1.5) {
            var dir = cz > p.pos.z ? 1 : -1;
            p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
            p.vel.z = dir * clamp(need / Math.max(t, 0.22), 6, 10); // a human dive, not a teleport
            p.vel.x = (meetX - p.pos.x) * 2;
            p.diveT = 0.8; p.diveCd = 1.2;
            p.diveHigh = cy > 1.9;
            p.diveRoll = -dir * Math.sin(p.facing) > 0 ? -1.25 : 1.25;
            p.spreadT = 0;
            return;
          }
          K.moveToward(p, meetX, clamp(cz, -limit - 0.8, limit + 0.8), 10.5, dt);
          return;
        }
      } else {
        p.gkRT = 0;
      }

      var restartOpp = mt.restart && ball.lastTouchTeam !== p.team && !(mt.setTaker && mt.setTaker.team === p.team);
      // ---- set pieces against him
      if (mt.restart === 4 && restartOpp) { // a corner: on his line, a step towards the far post
        K.moveToward(p, ownGoalX + a * 0.5 * M, -(ball.pos.z >= 0 ? 1 : -1) * 0.2 * GHW, 8, dt);
        p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        return;
      }
      var bdx0 = ball.pos.x - ownGoalX, bd0 = Math.sqrt(bdx0 * bdx0 + ball.pos.z * ball.pos.z);
      if (mt.restart === 1 && restartOpp && bd0 < 35 * M) { // a free kick near the box: 1-2 m off his line
        var fk = anglePos(ownGoalX, a, ball.pos.x, ball.pos.z, (bd0 < 22 * M ? 1.0 : 1.8) * M);
        K.moveToward(p, fk.x, clamp(fk.z, -limit, limit), 8, dt);
        p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        return;
      }

      // ---- the keeper button (a human team) or a man through on goal: out to meet him
      var free = !mt.restart && !mt.penalty;
      var oneV1 = false, along = 0;
      if (free && c && c.team !== p.team && !c.gkHands) {
        along = (c.pos.x - ownGoalX) * a;
        oneV1 = along < (prof.iq >= 2 ? 32 : 24) * M && along > 1.5 * M && Math.abs(c.pos.z) < NS.BOX_HW + 4 * M &&
          cover(p, c, ownGoalX, K) === 0;
      }
      // he reads it after his reaction time (a weaker keeper later)
      if (oneV1) p.oneT += dt; else p.oneT = 0;
      var reads = oneV1 && p.oneT > (prof.react || 0.3) * 0.8;
      var button = World.gkRush[p.team] > 0;
      if (free && (button || reads) && !(c && c.team === p.team)) {
        if (NS.dbg && reads && p.oneT - dt <= (prof.react || 0.3) * 0.8) NS.dbg('gk_one_v_one', p.team);
        if (c) {
          var cdx = ball.pos.x - p.pos.x, cdz = ball.pos.z - p.pos.z, cd = Math.sqrt(cdx * cdx + cdz * cdz);
          // the ball off his foot (a heavy touch): the keeper gets there first, he goes down on it
          var loose = Math.sqrt((ball.pos.x - c.pos.x) * (ball.pos.x - c.pos.x) + (ball.pos.z - c.pos.z) * (ball.pos.z - c.pos.z)) > 1.15;
          if (p.diveCd <= 0 && (cd < 3.2 * M || (loose && cd < 4.5 * M) || (button && cd < 3.6 * M))) {
            smother(p, ball.pos.x + c.vel.x * 0.12, ball.pos.z + c.vel.z * 0.12);
            return;
          }
          // close him down on his line to the goal, CLOSE_GAP in front of him (all the way in with the button)
          var gx = ownGoalX - c.pos.x, gz = -c.pos.z, gl = Math.sqrt(gx * gx + gz * gz) || 1;
          var gap = button ? 0 : Math.min(CLOSE_GAP, Math.max(0, gl - 2 * M));
          var tx = c.pos.x + c.vel.x * 0.2 + gx / gl * gap, tz = c.pos.z + c.vel.z * 0.2 + gz / gl * gap;
          // never further out than the man, never in his own net
          if ((tx - ownGoalX) * a < 0.8 * M) tx = ownGoalX + a * 0.8 * M;
          K.moveToward(p, tx, tz, (button ? 12.4 : 11.8) * prof.speedMul, dt);
          if (cd < 9 * M) p.spreadT = 0.25; // big: arms and legs out
          return;
        }
        // a loose ball: go and claim it
        K.interceptTime(p, 12.4, 3.2);
        var ic = K.ic();
        K.moveToward(p, ic.x, ic.z, 12.4 * prof.speedMul, dt);
        return;
      }

      // ---- a loose ball he gets to first: in or near the box, a long ball dropping in, a through ball behind his line
      var bAlong = (ball.pos.x - ownGoalX) * a;
      var dropIn = ball.vel.x * -a > 4 && bAlong < NS.BOX_D - 0.8 && Math.abs(ball.pos.z) < NS.BOX_HW - 1;
      var sweepZone = bAlong < NS.BOX_D + 10 * M && Math.abs(ball.pos.z) < NS.BOX_HW + 3 * M;
      if (!c && (sweepZone || dropIn) && ball.lastTouchTeam !== p.team || (!c && bAlong < NS.BOX_D && Math.abs(ball.pos.z) < NS.BOX_HW)) {
        var gt = K.interceptTime(p, 11, 3.2);
        var ic2 = K.ic();
        var icIn = inBox(p, ic2.x, ic2.z);
        if (gt < O.chaseT - (icIn ? 0.05 : 0.3) && gt < (icIn ? 1.8 : 1.3)) {
          // an attacker arriving at it too: dive on it
          var near = 99, players = World.players;
          for (var i = 0; i < players.length; i++) {
            var o = players[i];
            if (o.team === p.team) continue;
            var ox = o.pos.x - ball.pos.x, oz = o.pos.z - ball.pos.z;
            near = Math.min(near, Math.sqrt(ox * ox + oz * oz));
          }
          var bx = ball.pos.x - p.pos.x, bz = ball.pos.z - p.pos.z;
          if (near < 3 * M && ball.pos.y < 0.8 && bx * bx + bz * bz < 4.5 * M * 4.5 * M && p.diveCd <= 0) {
            smother(p, ball.pos.x + ball.vel.x * 0.15, ball.pos.z + ball.vel.z * 0.15);
            return;
          }
          K.moveToward(p, ic2.x, ic2.z, 11.5 * prof.speedMul, dt);
          return;
        }
      }

      // ---- position: on the angle, off his line by the ball's distance; a sweeper behind his back line
      var bx0 = c ? c.pos.x : ball.pos.x, bz0 = c ? c.pos.z : ball.pos.z;
      var bdm = Math.sqrt((bx0 - ownGoalX) * (bx0 - ownGoalX) + bz0 * bz0) / M; // metres from the goal centre
      var depth; // metres
      if (bdm < 40) depth = clamp(bdm * 0.16, 1.2, 6.2);
      else depth = 6.2 + (bdm - 40) * 0.3;
      var ang = Math.abs(Math.atan2(bz0, Math.max(0.1, (bx0 - ownGoalX) * a)));
      if (ang > 0.6) depth *= clamp(1 - (ang - 0.6) * 0.7, 0.3, 1); // wide: closer to his line and his near post
      if (T.phase === 1) depth = Math.max(depth, Math.min(bdm * 0.35, 20)); // our ball: an option, high up
      // never behind his own back line by less than 6 m (a ball over the top is his)
      var lineDepth = (T.lineX - ownGoalX) * a / M;
      depth = Math.min(depth, Math.max(2.5, lineDepth - 6), prof.iq >= 2 ? 24 : 16);
      var pos = anglePos(ownGoalX, a, bx0, bz0, depth * M);
      var wideZ = depth > 8 ? NS.BOX_HW * 0.6 : limit + 0.6 * M;
      var px = pos.x, pz = clamp(pos.z, -wideZ, wideZ);
      var dd = Math.sqrt((px - p.pos.x) * (px - p.pos.x) + (pz - p.pos.z) * (pz - p.pos.z));
      K.moveToward(p, px, pz, (dd > 6 ? 10.5 : 8.5) * prof.speedMul, dt);
      if (dd < 1.5) p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
    }
  };

  NS.Keeper = Keeper;
})(window.RS6 = window.RS6 || {});
