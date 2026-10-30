/* Match flow: team meshes, kickoff, the fixed-step update, goals, full time and the per-frame HUD refresh. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var Controls = NS.Controls;
  var AI = NS.AI;
  var Touch = NS.Touch;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });

  var SKIN = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xc68642];
  var labels = { p1: 'P1', p2: 'P2', cpu: 'CPU' };
  var lastSecond = -1;
  var lastOwner = null;
  // breaks without freezing: 1 = goal celebration, 2 = half time, 3 = full time
  var breakKind = 0;
  // ball out of play: the players walk to their places for the throw-in / corner / goal kick (no frozen screen)
  var walking = false, walkT = 0, walkBallY = 0;
  var hurried = false; // a human pressed A / B: the other team's restart is played at once (hurryRestart)
  // the referee (not one of World.players: he never touches the ball)
  var ref = null;
  var scorer = null;
  var breakClock = 0;
  var dangerT = 0;
  var commAttack = [false, false];  // (the commentator's ATTACK: each team's attack said once)
  var R = NS.BALL_R;
  var PI = Math.PI;
  var BLOCK_T = 0.55;      // a block (Actions.blockReact): seconds his leg is out
  var BLOCK_REACH2 = 2.6;  // ... and how far it reaches (squared units, ~1 m): a standing player 1.35

  function ease(u) { return u < 0 ? 0 : (u > 1 ? 1 : u * u * (3 - 2 * u)); }

  // Pose of one player for this step (rotations only, no allocation). Priority: dive, header, catch, throw, slide, fall,
  // shoulder, lunge, kick, run. HIP = height of the hips (the body pivots there, legs hang from it).
  var HIP = NS.Assets.HIP;
  // formation spots are given for a 105 x 68 pitch
  function SX() { return HALF_W / 52.5; }
  function SZ() { return HALF_H / 34; }

  // Dev mode aim arrows: while a human charges a pass / shot, where it would go now (its direction and power: the
  // same planning as the kick, worked out 20 times a second); after a kick, where it was played (fading out).
  var aimCache = [null, null], aimCd = [0, 0];
  var AIM_TYPE = { lowpass: 1, onetwo: 1, through: 2, lobthrough: 2, long: 3, shoot: 4, curve: 5, chip: 6 };
  function hideAims() { for (var k = 0; k < 3; k++) NS.Scene.setAim(k, false); }
  function aimArrows(dt) {
    var s = World.settings, ball = World.ball;
    if (!s.devArrow) { hideAims(); return; }
    for (var i = 0; i < 2; i++) {
      var sl = World.slots[i], p = sl.player, mv = sl.chargeMove;
      var mid = sl.active && p && mv >= 0 && sl.chargeFrac >= 0 && (sl.evCtx === 1 || sl.evCtx === 3 || sl.evCtx === 4) ? NS.Bindings.MOVES[mv].id : '';
      var type = AIM_TYPE[mid] || 0;
      if (!type) { aimCache[i] = null; NS.Scene.setAim(i, false); continue; }
      aimCd[i] -= dt;
      if (aimCd[i] <= 0 || !aimCache[i]) {
        aimCd[i] = 0.05;
        var pad = NS.Input.pads[sl.idx] || { x: 0, y: 0 };
        aimCache[i] = NS.Actions.aimPoint(p, type, sl.chargeFrac, pad.x, pad.y, mid === 'lobthrough');
      }
      var a = aimCache[i];
      var fx = ball.owner === p ? ball.pos.x : p.pos.x, fz = ball.owner === p ? ball.pos.z : p.pos.z;
      NS.Scene.setAim(i, true, fx, fz, a[0], a[1], a[2], 0.55 + 0.4 * sl.chargeFrac);
    }
    var sh = NS.Actions.shown;
    if (sh && sh.t > 0) {
      sh.t -= dt;
      NS.Scene.setAim(2, true, sh.fx, sh.fz, sh.x, sh.z, sh.kind, 0.6 * Math.min(1, sh.t / 0.5));
    } else NS.Scene.setAim(2, false);
  }

  function animate(p, dt) {
    var mesh = p.mesh;
    if (p.kickT > 0) p.kickT -= dt;
    if (p.lungeT > 0) p.lungeT -= dt;
    if (p.slideT > 0) p.slideT -= dt;
    if (p.fallT > 0) p.fallT -= dt;
    if (p.diveT > 0) p.diveT -= dt;
    if (p.headT > 0) p.headT -= dt;
    if (p.catchT > 0) p.catchT -= dt;
    if (p.shoulderT > 0) p.shoulderT -= dt;
    if (p.touchT > 0) p.touchT -= dt;
    if (p.throwT > 0) p.throwT -= dt;

    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    var run = sp > 0.5 ? clamp(sp / 12, 0, 1) : 0;
    if (sp > 0.5) p.animPhase += dt * (4.4 + sp * 0.62);
    var sw = Math.sin(p.animPhase);
    var legL = sw * 0.75 * run;
    var legR = -legL;
    var armL = -legL * 0.85;
    var armR = -armL;
    var outL = 0.08, outR = 0.08;
    // feet apart (legs out to the sides): together when running, a wider stance when he jockeys / closes down slowly
    var spread = sp > 0.5 && sp < 5 ? 0.13 : (run > 0.5 ? 0.03 : 0.05);
    var lean = 0.18 * run;
    var roll = 0;
    var H0 = mesh.hip, hs = H0 / HIP; // this model's hip height (the drops below are for the 1.2 of the blocks)
    var hipY = H0 + Math.abs(Math.cos(p.animPhase)) * 0.09 * hs * run;
    // knees and elbows (the rounded models): a running leg folds as it swings through (most at mid-swing) and is
    // nearly straight while it carries him; the forearms come up with the pace
    var cph = Math.cos(p.animPhase);
    var kneeL = run * (0.12 + 1.15 * (cph < 0 ? -cph : 0)) + (run ? 0 : 0.08);
    var kneeR = run * (0.12 + 1.15 * (cph > 0 ? cph : 0)) + (run ? 0 : 0.08);
    var elbL = -0.15 - 1.1 * run, elbR = elbL;
    var u, b, kicking = false, gait = false;

    if (p.diveT > 0) {
      // keeper dive: whole body falls to the side, arms stretched over the head (higher for a high shot)
      u = 1 - p.diveT / 0.8;
      b = ease(u / 0.25) * (1 - ease((u - 0.75) / 0.25));
      roll = p.diveRoll * b;
      hipY = H0 - 0.5 * hs * b + (p.diveHigh ? 0.8 * Math.sin(clamp(u, 0, 1) * PI) : 0);
      armL = armR = -2.9 * b;
      outL = outR = 0.25 * b;
      legL = 0.2 * b; legR = -0.2 * b; lean = 0; spread = 0.2 * b;
      kneeL = kneeR = 0.3 * b; elbL = elbR = -0.05; // fully stretched
    } else if (p.headT > 0) {
      // header: a crouch, a real jump (the whole body leaves the grass), arch back, snap the head through the ball
      u = 1 - p.headT / 0.55;
      var crouch = u < 0.15 ? Math.sin(u / 0.15 * PI) : 0;
      b = u < 0.15 ? 0 : Math.sin((u - 0.15) / 0.85 * PI);
      hipY = H0 - 0.25 * hs * crouch + 0.85 * b;
      lean = u < 0.5 ? -0.4 * clamp((u - 0.1) / 0.4, 0, 1) : -0.4 + 0.95 * ((u - 0.5) / 0.5);
      lean *= u < 0.15 ? 0 : 1;
      legL = 0.45 * b - 0.3 * crouch; legR = -0.35 * b - 0.3 * crouch;
      armL = armR = -1.1 * b;
      outL = outR = 0.08 + 0.6 * b; spread = 0.1 * b;
      kneeL = kneeR = 0.9 * crouch + 0.55 * b; elbL = elbR = -0.6 * b; // spring from bent knees, tucked in the air
    } else if (p.catchT > 0) {
      // keeper catch: both hands up to the ball
      u = 1 - p.catchT / 0.4;
      b = Math.sin(clamp(u * 1.6, 0, 1) * PI * 0.5);
      armL = armR = -2.1 * b - 1.3 * (1 - b);
      outL = outR = 0.12;
      lean = -0.1 * b;
      elbL = elbR = -0.5 - 0.4 * (1 - b); kneeL = kneeR = 0.25; // hands up and behind the ball, knees soft
    } else if (p.throwIn && World.ball.owner === p) {
      // ready to throw in: both hands over the head holding the ball
      armL = armR = -2.95; outL = outR = 0.12; lean = -0.12;
      elbL = elbR = -1.4; // the ball behind his head
    } else if (p.throwT > 0) {
      // the throw: arms come over from behind the head
      u = 1 - p.throwT / 0.4;
      armL = armR = -3.3 + u * 2.2; outL = outR = 0.12; lean = -0.2 + u * 0.45;
      elbL = elbR = -1.4 * (1 - u); // the arms whip straight as it goes
    } else if (p.slideT > 0) {
      // slide tackle: lean far back, hips near the grass, front leg out, back leg folded
      u = 1 - p.slideT / 0.85;
      b = ease(u / 0.15) * (1 - ease((u - 0.75) / 0.25));
      lean = -1.15 * b;
      hipY = H0 - 0.72 * hs * b;
      legR = legR * (1 - b) - 0.35 * b;
      legL = legL * (1 - b) + 0.75 * b;
      armL = armL * (1 - b) - 0.5 * b; armR = armR * (1 - b) - 0.2 * b;
      outL = 0.08 + 0.9 * b; outR = 0.08 + 0.6 * b; spread = 0.25 * b;
      kneeL = kneeL * (1 - b) + 1.6 * b; kneeR = kneeR * (1 - b) + 0.05 * b; // the back leg folded under him
    } else if (p.fallT > 0) {
      // lost the ball in a tackle: knocked off balance
      u = 1 - p.fallT / 0.55;
      b = Math.sin(clamp(u, 0, 1) * PI);
      lean = -0.45 * b;
      roll = 0.35 * b;
      hipY = H0 - 0.2 * hs * b;
      outL = outR = 0.08 + 0.9 * b;
      legL = 0.3 * b; legR = -0.4 * b; spread = 0.2 * b;
      kneeL = kneeR = 0.45 * b;
    } else if (p.shoulderT > 0) {
      // shoulder to shoulder: leans sideways into the other player, arm tucked in
      u = 1 - p.shoulderT / 0.32;
      b = Math.sin(clamp(u, 0, 1) * PI);
      roll = -0.35 * b * p.shoulderDir;
      if (p.shoulderDir > 0) outR = 0.02; else outL = 0.02;
    } else if (p.blockT > 0) {
      // a block: one leg stretched out sideways into the ball's way, the weight on the other, arms out for balance
      u = 1 - p.blockT / BLOCK_T;
      b = Math.sin(clamp(u * 2.2, 0, 1) * PI * 0.5) * (1 - ease((u - 0.8) / 0.2));
      hipY = H0 - 0.24 * hs * b; lean = -0.08 * b; spread = 0.25 * b;
      armL = armR = -0.55 * b; outL = outR = 0.08 + 0.35 * b;
      if (p.blockSide > 0) { outR = 0.08 + 1.05 * b; legR = -0.3 * b; legL = 0.1 * b; kneeR = 0.05; kneeL = 0.65 * b; }
      else { outL = 0.08 + 1.05 * b; legL = -0.3 * b; legR = 0.1 * b; kneeL = 0.05; kneeR = 0.65 * b; }
    } else if (p.lungeT > 0) {
      // standing tackle: lunge, front leg stretched to the ball
      u = 1 - p.lungeT / 0.36;
      b = Math.sin(clamp(u * 1.4, 0, 1) * PI * 0.5) * (1 - ease((u - 0.7) / 0.3));
      lean = 0.2 + 0.25 * b;
      legR = legR * (1 - b) - 1.15 * b;
      legL = legL * (1 - b) + 0.45 * b;
      hipY = H0 - 0.16 * hs * b;
      outL = outR = 0.08 + 0.55 * b; spread = 0.05 + 0.32 * b; // legs wide open: the ball can go through
      kneeR = kneeR * (1 - b) + 0.05 * b; kneeL = kneeL * (1 - b) + 0.55 * b; // the stretched leg straight, the other bent
    } else if (p.kickT > 0) {
      // kick: back-swing then strike through the ball (bigger swing and lean-back for shots and long balls); drawn for
      // the right foot, mirrored below when he kicks with his left (p.kickFoot)
      kicking = true;
      var dur = p.kickHard ? 0.36 : 0.28;
      u = 1 - p.kickT / dur;
      var reach = p.kickHard ? 1.45 : 0.95;
      var k = u < 0.25 ? 0.5 + u / 0.25 * 0.5 : 1 - (u - 0.25) / 0.5 * (1 + reach);
      if (u > 0.75) k = -reach * (1 - (u - 0.75) / 0.25);
      legR = k;
      legL = 0.15;
      lean = p.kickHard ? (u < 0.25 ? 0.15 : -0.22) : 0.08;
      armL = 0.4; armR = -0.3;
      outL = 0.95; outR = 0.45; spread = 0.08;
      hipY = H0;
      kneeR = k > 0 ? 0.25 + 1.3 * k : 0.08; kneeL = 0.22; // the back-swing folds the knee, the strike snaps it straight
    } else if (p.mood === 1 || (p.mood === 4 && sp < 2.5)) {
      // celebrating: jumping, both arms up, waving
      b = Math.abs(Math.sin(breakClock * 7 + p.index));
      hipY = H0 + 0.45 * b;
      armL = -2.75 + Math.sin(breakClock * 9 + p.index) * 0.3;
      armR = -2.75 - Math.sin(breakClock * 9 + p.index) * 0.3;
      outL = outR = 0.35;
      lean = -0.1;
      legL = 0.25 * b; legR = -0.25 * b; spread = 0.12 * b;
      kneeL = kneeR = 0.15 + 0.7 * b; elbL = elbR = -0.3;
    } else if (p.mood === 4) {
      // the scorer's run to the corner: arms spread like wings
      outL = outR = 1.45; armL = armR = 0; lean = 0.25; elbL = elbR = -0.1;
    } else if (p.mood === 2) {
      // dejected: head down, arms hanging, slow walk
      lean = 0.38; outL = outR = 0.02; armL *= 0.3; armR *= 0.3; hipY -= 0.05 * hs;
    } else if (p.mood === 3) {
      // on the knees
      lean = 0.25; armL = armR = 0.15; outL = outR = 0.12; elbL = elbR = -0.1;
      if (mesh.leftKnee) { hipY = mesh.thighLen + 0.07 * hs; legL = legR = 0.05; kneeL = kneeR = 1.55; } // kneeling: shins on the grass
      else { hipY = H0 * 0.56; legL = -1.45; legR = -1.45; }
    } else if (p.stun > 0) {
      lean = 0.3; outL = outR = 0.4; spread = 0.15; kneeL = kneeR = 0.3;
    } else if (p.gkHands && World.ball.owner === p) {
      armL = armR = -1.3; outL = outR = 0.1; // ball held in front
      elbL = elbR = -1.0; // (hands together at the chest)
    } else if (p.role === 'GK' && p.spreadT > 0 && !p.mood) {
      // one against one: making himself big, arms and legs wide, low on bent knees
      armL = armR = -1.0; outL = outR = 1.05; elbL = elbR = -0.2;
      kneeL = kneeR = 0.55; spread = 0.3; lean = 0.25; hipY = H0 - 0.16 * hs;
    } else if (p.role === 'GK' && sp < 3 && !p.mood) {
      // a keeper set for a shot: crouched on bent knees, feet apart, arms out low with the elbows bent, palms forward
      armL = armR = -0.5; outL = outR = 0.42; elbL = elbR = -0.95;
      kneeL = kneeR = 0.4; spread = 0.14; lean = 0.18; hipY = H0 - 0.09 * hs;
    } else {
      gait = true;
    }
    var tmp;
    if (kicking && p.kickFoot < 0) { // the left foot: the same kick, mirrored
      tmp = legL; legL = legR; legR = tmp; tmp = outL; outL = outR; outR = tmp;
      tmp = kneeL; kneeL = kneeR; kneeR = tmp; tmp = armL; armL = armR; armR = tmp;
    }
    if (gait && p.touchT > 0) {
      // a touch on the ball (js/game/touch.js), shown as it happens: the foot (p.touchFoot: 1 right, -1 left) reaching
      // to it, opened out for the inside, turned in for the outside, lifted with the toe up for the sole; the thigh
      // raised, or the chest leaning back to cushion a ball in the air
      var tk = Math.sin(clamp(1 - p.touchT / 0.2, 0, 1) * PI), kd = p.touchKind;
      var swing = kd === 3 ? -0.75 : (kd === 4 ? -1.1 : -0.55), bend = kd === 3 ? 0.1 : (kd === 4 ? 1.2 : 0.25);
      var turnOut = kd === 0 ? 0.3 : (kd === 1 ? -0.12 : 0.15);
      if (kd === 5) { lean = lean * (1 - tk) - 0.35 * tk; armL -= 0.5 * tk; armR -= 0.5 * tk; }
      else if (p.touchFoot > 0) { legR = legR * (1 - tk) + swing * tk; kneeR = kneeR * (1 - tk) + bend * tk; outR += turnOut * tk; }
      else { legL = legL * (1 - tk) + swing * tk; kneeL = kneeL * (1 - tk) + bend * tk; outL += turnOut * tk; }
    }

    mesh.body.position.y = hipY;
    mesh.body.rotation.x = lean;
    mesh.body.rotation.z = roll;
    mesh.leftLeg.rotation.x = legL;
    mesh.rightLeg.rotation.x = legR;
    mesh.leftLeg.rotation.z = -spread;
    mesh.rightLeg.rotation.z = spread;
    mesh.leftArm.rotation.x = armL;
    mesh.rightArm.rotation.x = armR;
    mesh.leftArm.rotation.z = -outL;
    mesh.rightArm.rotation.z = outR;
    if (mesh.leftKnee) {
      mesh.leftKnee.rotation.x = kneeL; mesh.rightKnee.rotation.x = kneeR;
      mesh.leftElbow.rotation.x = elbL; mesh.rightElbow.rotation.x = elbR;
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // the voice commentator (js/game/commentary.js): an event code of its library; nothing when it is off
  function say(ev, team) { if (NS.Commentary) NS.Commentary.event(ev, team); }

  // Restarts: the free-kick distance (10 m), and where players may stand at a kick-off.
  var FK_DIST = 10 * NS.M;
  // free kicks: QUICK seconds to play it at once (the fouled side's man on the ball, nobody set); then, in range of
  // goal, it is set: a wall, the best shooter on it with a run-up, the camera behind him (fkSetup)
  var FK_QUICK = 2, FK_RANGE = 36 * NS.M, FK_RUNUP = 2.6 * NS.M, WALL_REACH = 2.05 * NS.M;
  function keepAway(p, x, z, r) {
    var dx = p.pos.x - x, dz = p.pos.z - z, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    var d = Math.sqrt(d2);
    if (d < 0.1) { dx = -NS.attack(p.team); dz = 0; d = 1; }
    p.pos.x = clamp(x + dx / d * r, -HALF_W + 0.5, HALF_W - 0.5);
    p.pos.z = clamp(z + dz / d * r, -HALF_H + 0.5, HALF_H - 0.5);
  }
  function keepKickoff(p) {
    var a = NS.attack(p.team);
    if (p.pos.x * a > -0.4) p.pos.x = -a * 0.4;  // his own half (the half he defends)
    var o = World.ball.owner;
    if (o && o.team !== p.team) {
      // the team not kicking off: outside the centre circle (and still in its own half)
      var dx = p.pos.x, dz = p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < NS.CIRCLE_R) {
        if (d < 0.1) { dx = -a; dz = 0; d = 1; }
        p.pos.x = dx / d * NS.CIRCLE_R; p.pos.z = dz / d * NS.CIRCLE_R;
        if (p.pos.x * a > -0.4) { p.pos.x = -a * 0.4; p.pos.z = (dz >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, NS.CIRCLE_R * NS.CIRCLE_R - 0.16)); }
      }
    }
  }

  // Where a leg meets the ball's height (drop = hips - ball centre), across (x) and along his facing (z): legPX / legPZ.
  // A leg lifted over the ball (a stride, a kick) gives its foot instead, and legLow = false: the ball rolls under it.
  var legPX = 0, legPZ = 0, legLow = false;
  function legAt(side, legX, a, spread, drop, len) {
    var ca = Math.cos(a), cs = Math.cos(spread);
    if (ca < 0.2) ca = 0.2;
    var l = Math.min(len, drop / (cs * ca));
    legLow = len * cs * ca > drop - R; // its foot is below the top of the ball
    legPX = side * (legX + l * Math.sin(spread));
    legPZ = -l * cs * Math.sin(a);
  }

  // Through his legs (a nutmeg): a low ball whose path crosses the line between his feet, with room for it on both sides,
  // goes on past him unless he sees it in time to close his legs.
  function throughLegs(p, ball) {
    var me = p.mesh;
    if (p.diveT > 0 || p.headT > 0 || me.body.rotation.z > 0.25 || me.body.rotation.z < -0.25) return false;
    if (ball.receiver === p) return false;
    var hipY = me.body.position.y;
    if (ball.pos.y + R > hipY - me.legW * 2 || ball.vel.y > 2.5) return false;
    var c = Math.cos(p.facing), s = Math.sin(p.facing);
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    var lx = dx * c - dz * s, lz = dx * s + dz * c;
    var wx = ball.vel.x - p.vel.x, wz = ball.vel.z - p.vel.z;
    var ux = wx * c - wz * s, uz = wx * s + wz * c;
    var sp = Math.sqrt(ux * ux + uz * uz);
    if (sp < 5) return false;
    ux /= sp; uz /= sp;
    var lean = me.body.rotation.x, drop = hipY - ball.pos.y;
    // Fixed: left leg uses -me.leftLeg.rotation.z for its outward spread
    legAt(-1, me.legX, me.leftLeg.rotation.x + lean, -me.leftLeg.rotation.z, drop, me.legLen);
    var ax = legPX, az = legPZ, lowA = legLow;
    legAt(1, me.legX, me.rightLeg.rotation.x + lean, me.rightLeg.rotation.z, drop, me.legLen);
    var bx = legPX, bz = legPZ, lowB = legLow;
    var ex = bx - ax, ez = bz - az;
    var den = ux * ez - uz * ex;
    if (den < 1e-6 && den > -1e-6) return false;
    var qx = ax - lx, qz = az - lz;
    var t = (qx * ez - qz * ex) / den, f = (qx * uz - qz * ux) / den;
    if (t <= 0 || f <= 0 || f >= 1) return false;
    var room = R + me.legW;
    var gapA = qx * uz - qz * ux, gapB = (bx - lx) * uz - (bz - lz) * ux;
    if ((lowA && (gapA < 0 ? -gapA : gapA) < room) || (lowB && (gapB < 0 ? -gapB : gapB) < room)) return false;
    if (p.team === ball.lastTouchTeam) return !!ball.receiver;
    if (NS.dbg) NS.dbg('nutmeg_open', ball.lastTouchTeam);
    var tc = t / sp;
    var chance = clamp((sp - 5) / 12, 0.15, 1) * (1 - p.st.def / 99 * 0.45) * (tc < 0.2 ? 1 : 0.6) * (p.role === 'GK' ? 0.5 : 1);
    if (Math.random() >= chance) return false;
    ball.nutT = clamp((t + 1.2) / sp, 0.2, 0.6);
    return true;
  }

  function seedOf(name, k) {
    var s = k + 1;
    for (var i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) % 100003;
    return s;
  }

  function layoutOf(teamIdx) { return NS.FORMATIONS[World.session.formations[teamIdx]]; }

  function rate(p, teamObj) {
    var st = NS.Players.statsFor(teamObj, p.name);
    p.st = st;
    p.foot = st.foot || 'R';
    p.mSpd = clamp(1.03 + (st.spd - 72) * 0.0055, 0.8, 1.17);
    p.drain = 1.5 - st.sta / 99;
    NS.Touch.rate(p); // ball control, agility, balance, weak foot (js/game/touch.js)
  }

  function fatigue(p) { return p.stamina >= 35 ? 1 : 0.86 + 0.14 * p.stamina / 35; }

  function humanTeam(team) {
    return (World.slots[0].active && World.slots[0].team === team) || (World.slots[1].active && World.slots[1].team === team);
  }

  function levelOf(team) {
    if (World.levels) return World.levels[team];
    var s = World.session;
    if (s.sideMode === 'CUSTOM' && s.cpuLevels && s.cpuLevels[team] && s.pads[0] < 0 && s.pads[1] < 0) return s.cpuLevels[team];
    return NS.cpuLevel(World.settings.cpuType, World.settings.difficulty);
  }
  NS.levelOf = levelOf;
  // a checkoAI team's level ('EASY'..'LEGEND'; null: not a checkoAI team). Below Legend the brain only plays (read only)
  NS.brainLevel = function (team) {
    var l = levelOf(team);
    return NS.isAimaLv(l) ? NS.baseLv(l) : null;
  };

  function syncAiSlots() {
    for (var t = 0; t < 2; t++) {
      var s = World.aiSlots[t];
      var on = !!NS.Aima && !humanTeam(t) && NS.isAimaLv(levelOf(t));
      if (on !== s.active) {
        s.active = on; s.player = null; s.evActive = false; s.lockT = 0; s.manual = false;
        if (s.pad) { s.pad.cur = 0; s.pad.x = 0; s.pad.y = 0; }
      }
      if (on && !s.player) s.player = Actions.nearestToBall(t, null, null);
    }
  }

  var teamQ = [0, 0], qBase = [null, null], qProf = [null, null];
  var CLASS_K = 4;
  function rateTeams() {
    for (var t = 0; t < 2; t++) {
      var sum = 0, n = 0;
      for (var i = 0; i < World.players.length; i++) {
        var p = World.players[i];
        if (p.team === t && p.st) { sum += p.st.ovr; n++; }
      }
      teamQ[t] = n ? clamp((sum / n - 75) / 10, -1.6, 1.6) : 0;
    }
    qBase[0] = qBase[1] = null;
  }
  NS.classEdge = function (a, b) { return clamp(1 + 0.3 * (teamQ[a] - teamQ[b]), 0.55, 1.6); };
  NS.teamClass = function (t) { return teamQ[t]; };
  function withClass(b, q) {
    var c = {}, k;
    for (k in b) c[k] = b[k];
    q *= CLASS_K;
    c.speedMul = b.speedMul * (1 + 0.025 * q);
    c.noise = Math.max(0.01, b.noise * (1 - 0.28 * q));
    c.acc = Math.max(0.4, b.acc * (1 - 0.2 * q));
    c.react = Math.max(0.08, b.react * (1 - 0.18 * q));
    c.tackle = clamp(b.tackle * (1 + 0.14 * q), 0.15, 0.85);
    c.gkSave = clamp(b.gkSave + 0.035 * q, 0.5, 0.92);
    c.gkReact = Math.max(0.12, b.gkReact * (1 - 0.08 * q));
    c.tight = b.tight * (1 + 0.06 * q);
    c.shootBias = b.shootBias + 0.01 * q;
    return c;
  }
  function profFor(team) {
    var b = humanTeam(team) ? AI.profiles.NORMAL : AI.profile(levelOf(team));
    if (qBase[team] !== b) { qBase[team] = b; qProf[team] = withClass(b, teamQ[team]); }
    return qProf[team];
  }

  function configureSlots() {
    if (World.session.sideMode === 'CUSTOM') NS.Devices.fix();
    var pd = NS.sidePads();
    var s0 = World.slots[0];
    var s1 = World.slots[1];
    s0.active = pd[0] >= 0;
    s0.team = pd[0] >= 0 ? pd[0] : 0;
    s1.active = pd[1] >= 0;
    s1.team = pd[1] >= 0 ? pd[1] : 1;
    NS.Input.setPlayers(s1.active ? 2 : 1);
    s0.player = null;
    s1.player = null;
    s0.evActive = s1.evActive = false;
  }

  function assignKickoffCursors() {
    var players = World.players;
    var used = null;
    for (var i = 0; i < 2; i++) {
      var s = World.slots[i];
      if (!s.active) { s.player = null; continue; }
      var pick = null;
      var fallback = null;
      for (var j = 0; j < players.length; j++) {
        var p = players[j];
        if (p.team !== s.team || p === used || p.role === 'GK') continue;
        if (!fallback) fallback = p;
        if (p.role === 'FWD') { pick = p; break; }
      }
      s.player = pick || fallback;
      used = s.player;
      s.chargeMove = -1; s.chargeFrac = 0; s.pressing = false; s.burstT = 0; s.evActive = false; s.evMove = -1;
    }
    syncAiSlots();
    for (var t = 0; t < 2; t++) {
      var as = World.aiSlots[t];
      if (!as.active) continue;
      for (var k = 0; k < players.length; k++) if (players[k].team === t && players[k].role === 'FWD') { as.player = players[k]; break; }
      as.evActive = false; as.evMove = -1; as.chargeMove = -1; as.lockT = 0;
    }
  }

  function featured(team) {
    var ball = World.ball;
    if (ball.owner && ball.owner.team === team) return ball.owner;
    return Actions.nearestToBall(team, null, null);
  }

  function takeBall(p) {
    var ball = World.ball;
    if (Actions.touch(p)) return false;
    if (ball.receiver === p && ball.kicker && ball.kicker.team === p.team) {
      var lx = p.pos.x - ball.fromX, lz = p.pos.z - ball.fromZ;
      if (ball.thru || lx * lx + lz * lz > 784) say('LONGPASS', p.team);
    }
    if (NS.Stats) NS.Stats.gain(p);
    ball.owner = p;
    ball.lastTouchTeam = p.team;
    ball.lastToucher = p.name;
    ball.pickupCooldown = 0.2;
    ball.hard = false;
    ball.chip = false;
    ball.gkTried = 0;
    ball.gkCd = 0;
    ball.receiver = null;
    ball.contester = null;
    ball.pen = false;
    p.gkHands = false;
    p.gkHold = 0;
    if (p.returnTo) p.returnT = 0.28;
    p.dribbling = false;
    return true;
  }

  function inOwnBox(team) {
    var ball = World.ball;
    var goalX = -NS.attack(team) * HALF_W;
    return Math.abs(ball.pos.x - goalX) < NS.BOX_D + 0.5 && Math.abs(ball.pos.z) < NS.BOX_HW + 0.5;
  }

  function gkSkill(team) {
    return profFor(team).gkSave;
  }

  function setMoods(kind, team) {
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      p.stun = 0; p.tackleT = 0; p.slid = false;
      if (kind === 2) p.mood = 5;
      else if (kind === 1) p.mood = p.team === team ? 1 : (p.role === 'GK' ? 3 : 2);
      else if (team < 0) p.mood = 5;
      else p.mood = p.team === team ? 1 : (Math.random() < 0.4 ? 3 : 2);
    }
  }

  function triggerGoal(team) {
    var m = World.match;
    var ball = World.ball;
    if (m.so) { if (m.so.live) soResult(team === m.so.kt); return; } // a shoot-out kick: counted there, not in the score
    m.score[team]++;
    World.kickoffTeam = 1 - team;
    m.celebrationTimer = 4.6;
    breakKind = 1;
    breakClock = 0;
    setMoods(1, team);
    var k = ball.kicker;
    var own = !!(k && k.team !== team);
    scorer = k && !own ? k : Actions.nearestToBall(team, null, null);
    if (scorer) {
      var a = NS.attack(team);
      scorer.mood = 4;
      scorer.celX = a * (HALF_W - 2.5);
      scorer.celZ = (scorer.pos.z >= 0 ? 1 : -1) * (HALF_H - 2.5);
    }
    NS.Audio.goal();
    NS.Scene.crowdCheer(4.2);
    say('GOAL', team);
    NS.HUD.setScore(m.score[0], m.score[1]);
    var who = k ? k.name : ball.lastToucher;
    var mins = Math.min(m.half > 2 ? 120 : 90, Math.floor(m.timeSeconds / 60) + 1);
    if (NS.dbg) NS.dbg('goal', team, { own: own, who: who, mins: mins, k: k });
    if (NS.Stats) {
      var g = NS.Stats.goal(team, who, mins, own, !!ball.pen);
      if (NS.Replay) NS.Replay.goal(g);
    }
    NS.HUD.goalFx(NS.I18n.t('hud.goalword'), (own ? NS.I18n.t('hud.owngoal') + ' ' : '') + who + '  ' + mins + "'", team);
    if (World.slots[0].active && team === World.slots[0].team) NS.Storage.addResult(0, 1, 0);
    ball.owner = null;
    ball.receiver = null;
    ball.contester = null;
    ball.vel.multiplyScalar(0.65);
  }

  function swapHomes() {
    for (var i = 0; i < World.players.length; i++) {
      var p = World.players[i], sl = layoutOf(p.team)[p.index], d = NS.attack(p.team);
      if (!sl) continue;
      p.homeX = sl.x * d * SX(); p.homeZ = sl.z * d * SZ();
    }
  }

  var HALF_END = [0, 45, 90, 105, 120]; // the minute each half ends (3, 4: extra time)

  // the break into the next half (half time, the start of extra time, extra time's half time): ends change, kick-off
  function halfBreak(key) {
    var m = World.match;
    m.half++;
    m.dir[0] = -m.dir[0]; m.dir[1] = -m.dir[1];
    swapHomes();
    World.kickoffTeam = m.half === 3 ? m.firstKick : 1 - m.firstKick;
    m.celebrationTimer = 3.4;
    breakKind = 2;
    breakClock = 0;
    scorer = null;
    setMoods(2, -1);
    NS.Audio.whistle(1);
    NS.HUD.banner(NS.I18n.t(key), m.score[0] + ' - ' + m.score[1], 0);
    if (m.half === 2) say('HALFTIME', 0);
  }

  /* ---- penalty shoot-out: a cup knockout still level after extra time. 5 kicks each, the teams in turn, then sudden
   * death; every kick at the same goal, the clock stands, nobody else moves. A kick is a goal if it goes in from the
   * kick or off the keeper (no rebounds: everybody stays put); saved, held, wide, or not in after 4 s: missed.
   * m.so: { kt: team kicking, n: [kicks], g: [goals], order: [[takers], [takers]], res: [[true / false]], live: the
   *         kick is on its way, armed: set up, t: seconds since it was struck, wait: the pause before the next } */
  function soTakers(team) {
    var l = [], gk = null, players = World.players;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.team !== team) continue;
      if (p.role === 'GK') gk = p; else l.push(p);
    }
    l.sort(function (x, y) { return (y.st ? y.st.sht : 0) - (x.st ? x.st.sht : 0); }); // the best shooters first
    if (gk) l.push(gk); // the keeper last
    return l;
  }
  function startShootout() {
    var m = World.match;
    m.so = { kt: m.firstKick, n: [0, 0], g: [0, 0], order: [soTakers(0), soTakers(1)], res: [[], []], live: false, armed: false,
      t: 0, wait: 2.6, kicker: null };
    stopPlay();
    World.ball.vel.set(0, 0, 0);
    setMoods(2, -1);
    NS.Audio.whistle(2);
    NS.HUD.banner(NS.I18n.t('hud.shootout'), m.score[0] + ' - ' + m.score[1], 2.4);
    if (NS.dbg) NS.dbg('shootout_start', 0);
  }
  function soKick() {
    var m = World.match, S = m.so, t = S.kt;
    m.dir[t] = 1; m.dir[1 - t] = -1; // every kick at the same goal
    var ord = S.order[t];
    m.setPiece = 2;
    m.setTeam = t;
    m.setTaker = ord[S.n[t] % ord.length];
    m.setX = HALF_W - NS.PEN_D; m.setZ = 0;
    m.setPieceTimer = 0.9;
    stopPlay();
    World.ball.vel.set(0, 0, 0);
    S.armed = true; S.live = false; S.t = 0;
  }
  function soOver() {
    var S = World.match.so, a = S.g[0], b = S.g[1], na = S.n[0], nb = S.n[1];
    if (na <= 5 && nb <= 5) {
      if (a > b + (5 - nb) || b > a + (5 - na)) return true; // one of them can no longer be caught
      return na === 5 && nb === 5 && a !== b;
    }
    return na === nb && a !== b; // sudden death: after each pair
  }
  function soMarks(r) { var s = ''; for (var i = 0; i < r.length; i++) s += r[i] ? '\u25cf' : '\u25cb'; return s; }
  function soResult(goal) {
    var m = World.match, S = m.so, t = S.kt;
    S.live = false;
    S.res[t].push(goal);
    S.n[t]++;
    if (goal) { S.g[t]++; NS.Audio.goal(); NS.Scene.crowdCheer(2); } else NS.Audio.ooh();
    S.kt = 1 - t;
    S.wait = 1.8;
    NS.HUD.banner(NS.I18n.t('hud.shootout') + '  ' + S.g[0] + ' - ' + S.g[1], soMarks(S.res[0]) + '   |   ' + soMarks(S.res[1]), 1.7);
    if (NS.dbg) NS.dbg(goal ? 'shootout_goal' : 'shootout_miss', t);
  }
  function soStep(dt) {
    var m = World.match, S = m.so, ball = World.ball;
    if (S.wait > 0) {
      S.wait -= dt;
      if (S.wait <= 0) {
        if (soOver()) { m.pens = S.g.slice(); m.so = null; finish(); }
        else soKick();
      }
      return;
    }
    if (S.armed && !m.penalty && m.setPiece === 0 && ball.owner !== m.setTaker) { S.armed = false; S.live = true; S.t = 0; S.kicker = m.setTaker; }
    if (!S.live) return;
    S.t += dt;
    var bs = Math.sqrt(ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z);
    if (ball.owner || S.t > 4 || (S.t > 0.8 && bs < 0.5)) soResult(false); // held, dead or stopped: missed
  }

  function finish() {
    var m = World.match;
    m.fullTimeTimer = 5.0;
    breakKind = 3;
    breakClock = 0;
    scorer = null;
    setMoods(3, m.score[0] > m.score[1] ? 0 : (m.score[1] > m.score[0] ? 1 : -1));
    NS.Audio.whistle(2);
    say('FULLTIME', 0);
    if (m.score[0] !== m.score[1]) say(m.score[0] > m.score[1] ? 'HOMEWIN' : 'AWAYWIN', m.score[0] > m.score[1] ? 0 : 1);
    NS.HUD.banner(NS.I18n.t('hud.fulltime'), m.score[0] + ' - ' + m.score[1] +
      (m.pens ? '  (' + m.pens[0] + ' - ' + m.pens[1] + ' ' + NS.I18n.t('comp.pens') + ')' : ''), 0);
    if (NS.Aima) NS.Aima.matchEnd(true);
    if (World.slots[0].active) {
      var mt = World.slots[0].team;
      var won = m.score[mt] > m.score[1 - mt] ? 1 : 0;
      var cup = 0;
      NS.Storage.addResult(won, 0, cup);
      NS.Storage.submitMatchScore(m.score[mt], m.score[1 - mt], cup);
      MyPC.announce(NS.I18n.t('hud.fulltime') + ' ' + m.score[0] + ' - ' + m.score[1]);
    }
  }

  function breakStep(dt, camMode) {
    var ball = World.ball;
    var players = World.players;
    breakClock += dt;
    if (World.stepBall(dt) <= -3) ball.vel.set(0, 0, 0);
    NS.Scene.setBall(ball.pos, ball.vel, ball.spinY, dt, ball.pos.y < R + 0.03);
    NS.Scene.trail(false, ball.pos);
    if (World.netHit) { NS.Scene.netHit(World.netHit); World.netHit = 0; }
    var stopDrag = Math.exp(-8.5 * dt);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var tx = p.pos.x, tz = p.pos.z, sp = 0, stop = 0.6;
      if (p.mood === 4) { tx = p.celX; tz = p.celZ; sp = 10.5; stop = 1.2; }
      else if (p.mood === 1 && breakKind === 1 && scorer) { tx = scorer.pos.x; tz = scorer.pos.z; sp = 9.5; stop = 2.2; }
      else if (p.mood === 2) { tx = p.homeX * 0.6; tz = p.homeZ; sp = 3.2; }
      else if (p.mood === 5) { tx = p.pos.x * 0.6; tz = -HALF_H - 3; sp = 3.4; }
      if (p.mood === 3 && breakClock > 2.6 && breakKind === 1) p.mood = 2;
      var dx = tx - p.pos.x, dz = tz - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var k = Math.min(1, 6 * dt);
      if (sp > 0 && d > stop) {
        var s = d < 3 ? sp * (0.4 + d * 0.2) : sp;
        p.vel.x += (dx / d * s - p.vel.x) * k;
        p.vel.z += (dz / d * s - p.vel.z) * k;
        p.facing = Math.atan2(p.vel.x, p.vel.z);
      } else {
        p.vel.x *= stopDrag;
        p.vel.z *= stopDrag;
        if (p.mood === 4 && !p.slid) { p.slid = true; p.slideT = 0.85; }
        if (p.mood === 1 && scorer) p.facing = Math.atan2(scorer.pos.x - p.pos.x, scorer.pos.z - p.pos.z);
      }
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, -HALF_W - 2, HALF_W + 2);
      p.pos.z = clamp(p.pos.z + p.vel.z * dt, -HALF_H - 4, HALF_H + 2);
      p.mesh.root.rotation.y = p.facing;
      animate(p, dt);
    }
    for (var j = 0; j < 2; j++) NS.Scene.setRing(j, false, 0, 0);
    hideAims();
    if (breakKind === 1 && scorer) NS.Scene.followBall(dt, scorer.pos.x, scorer.pos.z, camMode);
    else NS.Scene.followBall(dt, ball.pos.x * 0.5, 0, camMode);
  }

  // ---------------------------------------------------------------- fouls, free kicks, penalties
  var CARD_COLOR = [0, 0, 0xfacc15, 0xef4444];
  var CARD_KEY = ['card.warn', '', 'card.yellow', 'card.red'];

  function refreshCards(t) {
    var list = [];
    var all = World.players.concat(World.sentOff);
    for (var i = 0; i < all.length; i++) if (all[i].team === t && all[i].card) list.push(all[i].card);
    list.sort();
    NS.HUD.setCards(t, list);
  }

  function book(p) {
    var m = World.match;
    if (!m.warned[p.team]) { m.warned[p.team] = true; return 0; }
    p.fouls++;
    p.card = p.fouls >= 2 ? 3 : 2;
    p.mesh.card.material.color.setHex(CARD_COLOR[p.card]);
    p.mesh.card.visible = true;
    refreshCards(p.team);
    return p.card;
  }

  function sendOff(p) {
    var players = World.players;
    var i = players.indexOf(p);
    if (i < 0) return;
    players.splice(i, 1);
    World.sentOff.push(p);
    p.mesh.root.visible = false;
    var ball = World.ball;
    if (ball.owner === p) ball.owner = null;
    if (ball.kicker === p) ball.kicker = null;
    if (ball.receiver === p) ball.receiver = null;
    if (ball.contester === p) ball.contester = null;
    for (var k = 0; k < players.length; k++) if (players[k].mark === p) players[k].mark = null;
    for (var s = 0; s < 4; s++) if (World.allSlots[s].player === p) World.allSlots[s].player = null;
  }

  function onFoul(tackler, victim) {
    var m = World.match;
    var ball = World.ball;
    if (m.setPieceTimer > 0 || m.penalty || breakKind) return;
    var card = book(tackler);
    if (NS.dbg) NS.dbg('foul_committed', tackler.team, card, tackler.name);
    if (NS.Stats) NS.Stats.foul(tackler.team, card);
    m.sendOff = card === 3 ? tackler : null;
    var ownGoalX = -NS.attack(tackler.team) * HALF_W;
    var inBox = Math.abs(victim.pos.x - ownGoalX) < NS.BOX_D && Math.abs(victim.pos.z) < NS.BOX_HW;
    m.setPiece = inBox ? 2 : 1;
    say(inBox ? 'PENALTY' : 'FOUL', victim.team);
    if (NS.dbg) NS.dbg(inBox ? 'penalty_won' : 'free_kick_won', victim.team);
    m.setTeam = victim.team;
    m.setX = clamp(victim.pos.x, -HALF_W + 2, HALF_W - 2);
    m.setZ = clamp(victim.pos.z, -HALF_H + 2, HALF_H - 2);
    m.setTaker = victim;
    m.setPieceTimer = 1.6;
    stopPlay();
    ball.vel.set(0, 0, 0);
    NS.Audio.whistle(0);
    NS.HUD.banner(NS.I18n.t(inBox ? 'hud.penalty' : 'hud.foul'),
      NS.I18n.t(CARD_KEY[card]) + ' - ' + tackler.name + '  •  ' + NS.I18n.t(inBox ? 'hud.penalty.sub' : 'hud.freekick'), 1.5);
    if (card === 3) m.setPieceTimer = 2.2;
  }

  function penaltyGuess(shootingTeam) {
    var players = World.players;
    var gk = null;
    for (var i = 0; i < players.length; i++) if (players[i].role === 'GK' && players[i].team !== shootingTeam) gk = players[i];
    if (!gk) return;
    var r = Math.random();
    var side = r < 0.43 ? -1 : (r < 0.86 ? 1 : 0);
    gk.diveCd = 1.6;
    World.ball.pen = true;
    if (!side) return;
    gk.facing = NS.attack(gk.team) * Math.PI / 2;
    gk.vel.z = side * 9.5;
    gk.diveT = 0.8;
    gk.diveHigh = Math.random() < 0.3;
    gk.diveRoll = -side * Math.sin(gk.facing) > 0 ? -1.25 : 1.25;
  }

  function refStep(dt) {
    if (!ref) return;
    var ball = World.ball;
    var tx = ball.pos.x - (ball.pos.x > 0 ? 5 : -5);
    var tz = ball.pos.z - 13;
    if (tz < -HALF_H + 2) tz = ball.pos.z + 13;
    tx = clamp(tx, -HALF_W + 6, HALF_W - 6);
    var dx = tx - ref.pos.x, dz = tz - ref.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var sp = d > 6 ? 9.5 : (d > 1.5 ? d * 1.5 : 0);
    var k = Math.min(1, 6 * dt);
    ref.vel.x += ((d > 0.01 ? dx / d : 0) * sp - ref.vel.x) * k;
    ref.vel.z += ((d > 0.01 ? dz / d : 0) * sp - ref.vel.z) * k;
    ref.pos.x += ref.vel.x * dt;
    ref.pos.z += ref.vel.z * dt;
    var v2 = ref.vel.x * ref.vel.x + ref.vel.z * ref.vel.z;
    ref.facing = v2 > 9 ? Math.atan2(ref.vel.x, ref.vel.z) : Math.atan2(ball.pos.x - ref.pos.x, ball.pos.z - ref.pos.z);
    ref.mesh.root.rotation.y = ref.facing;
    animate(ref, dt);
  }

  // The ball runs on after it went out (no freeze): unified with World.PHYS constants and dt-based grass friction.
  function rollOut(dt) {
    var ball = World.ball;
    var G = NS.PHYS.G;
    var airborne = ball.pos.y > R + 0.015 || ball.vel.y > 0.05;
    if (airborne) {
      ball.vel.y -= G * dt;
      var air = Math.exp(-NS.PHYS.AIR_K * dt);
      ball.vel.x *= air;
      ball.vel.z *= air;
    } else {
      ball.pos.y = R;
      ball.vel.y = 0;
      var sp = Math.sqrt(ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z);
      if (sp > 0) {
        var ns = Math.max(0, sp * Math.exp(-NS.PHYS.ROLL_K * dt) - NS.PHYS.ROLL_F * dt);
        ball.vel.x *= ns / sp;
        ball.vel.z *= ns / sp;
      }
    }
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    ball.pos.z += ball.vel.z * dt;
    if (ball.pos.y < R) {
      ball.pos.y = R;
      if (ball.vel.y < -1.1) {
        ball.vel.y = -ball.vel.y * 0.52;
        ball.vel.x *= 0.84;
        ball.vel.z *= 0.84;
      } else {
        ball.vel.y = 0;
      }
    }
    var lx = HALF_W + 3.5, lz = HALF_H + 3.5;
    if (Math.abs(ball.pos.x) > lx) { ball.pos.x = ball.pos.x > 0 ? lx : -lx; ball.vel.x *= -0.35; }
    if (Math.abs(ball.pos.z) > lz) { ball.pos.z = ball.pos.z > 0 ? lz : -lz; ball.vel.z *= -0.35; }
    NS.Scene.setBall(ball.pos, ball.vel, ball.spinY, dt, ball.pos.y < R + 0.03);
  }

  function walkStep(dt) {
    var players = World.players;
    walkT += dt;
    var taker = World.match.setTaker;
    var done = true, takerIn = false;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var dx = p.wX - p.pos.x, dz = p.wZ - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.25) {
        var sp = Math.min(p === taker ? 10 : 9, 1.5 + d * 3);
        p.vel.x = dx / d * sp; p.vel.z = dz / d * sp;
        p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
        p.facing = Math.atan2(dx, dz);
        if (d > 1.5) done = false;
      } else {
        p.vel.x = 0; p.vel.z = 0;
        p.facing = p.wF;
        if (p === taker) takerIn = true;
      }
      p.mesh.root.rotation.y = p.facing;
      animate(p, dt);
    }
    if (!(takerIn && (done || walkT > 1.2 || hurried)) && walkT < 3.2) return;
    if (NS.dbg && walkT >= 3.2) NS.dbg('restart_walkup_timeout', World.match.setTeam);
    walking = false;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.pos.x = p.wX; p.pos.z = p.wZ; p.vel.set(0, 0, 0); p.facing = p.wF;
      p.mesh.root.rotation.y = p.facing;
      animate(p, 0);
    }
    World.ball.pos.y = walkBallY;
    NS.Input.clearEdges();
  }

  function hurryRestart() {
    var m = World.match, tk = m.setTaker;
    if (!m.restart || !tk || World.ball.owner !== tk) return;
    if (hurried) { if (!walking) tk.aiT = 99; return; }
    for (var i = 0; i < 2; i++) {
      var slot = World.slots[i];
      if (!slot.active || slot.team === tk.team) continue;
      var map = NS.Devices.mapOf(i), B = NS.Bindings;
      var mask = B.maskOf(B.index('lowpass'), map) | B.maskOf(B.index('shoot'), map) | (map === 0 ? 8 | 16 : 0);
      if (NS.Input.pads[i].latch & mask) { hurried = true; if (!walking) tk.aiT = 99; return; }
    }
  }

  function stopPlay() {
    var ball = World.ball;
    ball.owner = null;
    ball.receiver = null;
    ball.contester = null;
    ball.hard = false;
    ball.offTeam = -1;
  }

  function onOut(code) {
    var m = World.match;
    var ball = World.ball;
    if (m.so) { if (m.so.live) soResult(false); return; } // a shoot-out kick wide / over: missed
    if (m.setPieceTimer > 0 || breakKind) return;
    var last = ball.lastTouchTeam;
    stopPlay();
    if (NS.Stats) NS.Stats.out();
    m.setTaker = null;
    m.setZ = ball.pos.z;
    if (code === -3) {
      m.setPiece = 3;
      m.setTeam = 1 - last;
      m.setX = clamp(ball.pos.x, -HALF_W + 1, HALF_W - 1);
      m.setPieceTimer = 0.6;
      if (NS.dbg) NS.dbg('throw_in_won', m.setTeam);
      return;
    }
    var gs = ball.pos.x > 0 ? 1 : -1;
    var defending = NS.attack(0) === gs ? 1 : 0;
    m.setX = gs * HALF_W;
    if (last === defending) {
      m.setPiece = 4;
      m.setTeam = 1 - defending;
      m.setPieceTimer = 0.8;
      if (NS.dbg) NS.dbg('corner_won', m.setTeam);
      if (NS.Stats) NS.Stats.corner(m.setTeam);
      say('CORNER', m.setTeam);
      NS.Audio.whistle(0);
      NS.HUD.banner(NS.I18n.t('hud.corner'), '', 1.0);
    } else {
      m.setPiece = 5;
      m.setTeam = defending;
      m.setPieceTimer = 0.6;
      if (NS.dbg) NS.dbg('goal_kick_won', m.setTeam);
    }
  }

  function onOffside(q) {
    var m = World.match;
    if (m.setPieceTimer > 0 || breakKind || m.penalty) return;
    stopPlay();
    if (NS.dbg) NS.dbg('offside_caught', q.team);
    if (NS.Stats) NS.Stats.offside(q.team);
    say('OFFSIDE', q.team);
    World.ball.vel.set(0, 0, 0);
    m.setPiece = 6;
    m.setTeam = 1 - q.team;
    m.setX = clamp(q.pos.x, -HALF_W + 2, HALF_W - 2);
    m.setZ = clamp(q.pos.z, -HALF_H + 2, HALF_H - 2);
    m.setTaker = null;
    m.setPieceTimer = 1.4;
    NS.Audio.whistle(0);
    NS.HUD.banner(NS.I18n.t('hud.offside'), q.name, 1.2);
  }

  function nearestOf(t, x, z, skip) {
    var players = World.players;
    var best = null, bd = 1e9;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.team !== t || p.role === 'GK' || p === skip) continue;
      var d = (p.pos.x - x) * (p.pos.x - x) + (p.pos.z - z) * (p.pos.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  var THROW_SPOTS = [[7, 5.5], [-5, 9]];
  var THROW_GAP = 3 * NS.M;
  function throwOptions(t, taker, bx, sz, a) {
    var players = World.players, used = null;
    for (var k = 0; k < THROW_SPOTS.length; k++) {
      var ox = clamp(bx + a * THROW_SPOTS[k][0] * NS.M, -HALF_W + 3, HALF_W - 3);
      var oz = sz * (HALF_H - THROW_SPOTS[k][1] * NS.M);
      var q = nearestOf(t, ox, oz, taker);
      if (q === used) q = null;
      for (var i = 0; !q && i < players.length; i++) {
        var c = players[i];
        if (c.team === t && c.role !== 'GK' && c !== taker && c !== used) q = c;
      }
      if (!q) continue;
      used = q;
      q.pos.set(ox, 0, oz);
      q.facing = Math.atan2(taker.pos.x - ox, taker.pos.z - oz);
      for (i = 0; i < players.length; i++) {
        var o = players[i];
        if (o.team === t || o.role === 'GK') continue;
        var dx = o.pos.x - ox, dz = o.pos.z - oz, dd = Math.sqrt(dx * dx + dz * dz);
        if (dd >= THROW_GAP) continue;
        if (dd < 0.1) { dx = a; dz = 0; dd = 1; }
        o.pos.x = clamp(ox + dx / dd * THROW_GAP, -HALF_W + 1, HALF_W - 1);
        o.pos.z = clamp(oz + dz / dd * THROW_GAP, -HALF_H + 1, HALF_H - 1);
      }
    }
  }

  var CORNER_SPOTS = [[6, -1.5], [8.5, 3], [11, -0.5], [5, 5.5], [13, -6], [14.5, 5]];
  function setupCorner(t, taker) {
    var m = World.match;
    var players = World.players;
    var gs = m.setX > 0 ? 1 : -1;
    var sz = m.setZ > 0 ? 1 : -1;
    var goalX = gs * HALF_W;
    var cx = gs * (HALF_W - 0.3), cz = sz * (HALF_H - 0.3);
    taker.pos.set(cx + gs * 0.7, 0, cz + sz * 0.7);
    taker.facing = Math.atan2(-gs, -sz);
    taker.carry = Math.sqrt(0.98);
    var att = [];
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.team === t && p !== taker && p.role !== 'GK') att.push(p);
    }
    att.sort(function (x, y) {
      var rx = (x.role === 'FWD' ? 30 : 0) + x.st.hdr, ry = (y.role === 'FWD' ? 30 : 0) + y.st.hdr;
      return ry - rx;
    });
    var nIn = Math.min(CORNER_SPOTS.length, Math.max(2, att.length - 2));
    var used = [];
    for (i = 0; i < att.length; i++) {
      p = att[i];
      if (i < nIn) {
        p.pos.set(goalX - gs * CORNER_SPOTS[i][0], 0, CORNER_SPOTS[i][1] * -sz);
      } else {
        p.pos.set(gs * (HALF_W - 32 - (i % 2) * 10), 0, (i % 2 ? 1 : -1) * 9);
      }
      p.facing = Math.atan2(cx - p.pos.x, cz - p.pos.z);
    }
    var keeper = null;
    for (i = 0; i < players.length; i++) if (players[i].team !== t && players[i].role === 'GK') keeper = players[i];
    if (keeper) { keeper.pos.set(goalX - gs * 0.8, 0, sz * 0.6); keeper.facing = Math.atan2(cx - keeper.pos.x, cz - keeper.pos.z); }
    for (i = 0; i < nIn; i++) {
      var d = nearestOf(1 - t, att[i].pos.x, att[i].pos.z, null);
      if (d && used.indexOf(d) >= 0) d = null;
      if (!d) {
        for (var j = 0; j < players.length; j++) {
          var c = players[j];
          if (c.team !== t && c.role !== 'GK' && used.indexOf(c) < 0) { d = c; break; }
        }
      }
      if (!d) break;
      used.push(d);
      d.pos.set(att[i].pos.x + gs * 0.9, 0, att[i].pos.z + (Math.random() - 0.5) * 0.8);
      d.facing = Math.atan2(cx - d.pos.x, cz - d.pos.z);
    }
    var edge = 0;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.team === t || p.role === 'GK' || used.indexOf(p) >= 0) continue;
      if (edge === 0) p.pos.set(goalX - gs * 1.2, 0, sz * 4.4);
      else p.pos.set(goalX - gs * (NS.BOX_D + 1 + (edge % 2) * 3), 0, ((edge * 7) % 24) - 12);
      p.facing = Math.atan2(cx - p.pos.x, cz - p.pos.z);
      edge++;
    }
  }

  /* ---- a free kick in range of goal (after FK_QUICK seconds nobody took it quickly): set like a real one. The best
   * shooter of the side takes it, standing FK_RUNUP behind the ball (on the side of his strong foot); 2 to 4 of the
   * defenders nearest the ball make a wall FK_DIST away on the line to the goal, the others stand in the box, the
   * attackers just behind them (onside), the keeper on his line on the side the wall does not cover. Nobody moves until
   * it is struck (the taker runs up first: Actions.fkLater, fkRun); the camera is behind the ball (Scene.fkView). */
  function fkSetup() {
    var m = World.match, ball = World.ball, players = World.players, t = m.setTeam, a = NS.attack(t), M = NS.M;
    var bx = ball.pos.x, bz = ball.pos.z, gx = a * HALF_W;
    var dx = gx - bx, dz = -bz, d = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / d, uz = dz / d;
    var i, p, old = m.setTaker;
    // the taker: the best shooter (fit and on the pitch)
    var best = old, bs = -1;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.team !== t || p.role === 'GK' || p.stun > 0) continue;
      var sv = (p.st ? p.st.sht : 60) + (p.st && p.st.foot === 'L' && bz * a < 0 ? 2 : 0);
      if (sv > bs) { bs = sv; best = p; }
    }
    // the wall: the defenders nearest the ball, 4 central and close, fewer from wide or far
    var ang = Math.abs(Math.atan2(Math.abs(bz), Math.abs(dx)));
    var nWall = d < 24 * M ? 4 : (d < 30 * M ? 3 : 2);
    if (ang > 0.75) nWall = Math.max(1, nWall - 2); else if (ang > 0.45) nWall = Math.max(2, nWall - 1);
    var defs = [];
    for (i = 0; i < players.length; i++) { p = players[i]; if (p.team !== t && p.role !== 'GK') defs.push(p); }
    defs.sort(function (x, y) {
      return ((x.pos.x - bx) * (x.pos.x - bx) + (x.pos.z - bz) * (x.pos.z - bz)) - ((y.pos.x - bx) * (y.pos.x - bx) + (y.pos.z - bz) * (y.pos.z - bz));
    });
    var wx = bx + ux * FK_DIST, wz = bz + uz * FK_DIST, px = -uz, pz = ux; // the wall's middle, and across it
    var nearSide = bz > 0 ? 1 : -1;                                        // it covers the near post
    var sideOf = (px * nearSide > 0 || pz * nearSide > 0) ? 1 : -1;
    for (i = 0; i < defs.length; i++) {
      p = defs[i];
      p.vel.set(0, 0, 0); p.wall = false; p.wallT = 0;
      if (i < nWall) {
        var off = (i - (nWall - 1) / 2) * 0.62 * M + sideOf * 0.35 * M;
        p.pos.set(wx + px * off, 0, wz + pz * off);
        p.wall = true;
        p.facing = Math.atan2(bx - p.pos.x, bz - p.pos.z);
      } else {
        var k = i - nWall;
        p.pos.set(gx - a * (8 + (k % 3) * 2.2) * M, 0, clamp(((k * 7) % 26 - 13) * M * 0.9, -NS.BOX_HW, NS.BOX_HW));
        p.facing = a > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
    var k2 = 0;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.team !== t || p === best) continue;
      p.vel.set(0, 0, 0);
      if (p.role === 'GK') continue;
      p.pos.set(gx - a * (12.5 + (k2 % 2) * 2) * M, 0, clamp(((k2 * 9) % 30 - 15) * M * 0.85, -NS.BOX_HW - 4 * M, NS.BOX_HW + 4 * M));
      p.facing = a > 0 ? Math.PI / 2 : -Math.PI / 2;
      k2++;
    }
    // the taker: behind the ball, on the side of his strong foot (a right-footer comes from its left)
    if (best !== old) {
      if (old) { old.vel.set(0, 0, 0); old.pos.set(bx - ux * 6 * M + uz * 4 * M, 0, bz - uz * 6 * M - ux * 4 * M); }
      ball.owner = best; ball.lastTouchTeam = t; ball.lastToucher = best.name; best.carry = 0.95;
      m.setTaker = best;
    }
    // (an angle is atan2(x, z); facing the goal his left is +90 degrees: behind the ball and to the left is
    // the way back turned 0.45 rad towards it)
    var fs = best.foot === 'L' ? -1 : 1;
    var ra = Math.atan2(ux, uz) + Math.PI - 0.45 * fs;
    var rx = Math.sin(ra), rz = Math.cos(ra);
    m.setX = bx; m.setZ = bz;
    best.pos.set(bx + rx * FK_RUNUP, 0, bz + rz * FK_RUNUP);
    best.vel.set(0, 0, 0);
    best.facing = Math.atan2(bx - best.pos.x, bz - best.pos.z);
    best.fkSpot = { x: bx, z: bz };
    best.aiT = 0;
    m.fkSet = true;
    m.fkCam = 1;
    m.restartT = 0;
    if (NS.HUD.hint) NS.HUD.hideHint();
    if (NS.dbg) NS.dbg('free_kick_set', t, nWall);
  }
  // the run-up: he runs to the ball and plays the kick he chose (Actions.fkLater) as he gets there
  function fkRun(p, dt) {
    var m = World.match, ball = World.ball;
    if (!p.fkSpot) { p.fkPend = null; return; }
    var gx = NS.attack(p.team) * HALF_W;
    var dx = p.fkSpot.x - p.pos.x, dz = p.fkSpot.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.95) {
      p.vel.x = dx / d * 7.5; p.vel.z = dz / d * 7.5;
      p.facing = Math.atan2(dx, dz);
      return;
    }
    // at the ball: struck (facing the goal, the ball at his feet)
    p.vel.x *= 0.3; p.vel.z *= 0.3;
    p.facing = Math.atan2(gx - p.pos.x, -p.pos.z);
    var go = p.fkPend;
    p.fkSpot = null; p.fkPend = null;
    m.fkSet = false;
    m.fkCam = 1.3; // the camera stays behind it and watches it fly
    for (var i = 0; i < World.players.length; i++) {
      var q = World.players[i];
      if (q.wall) { q.headT = 0.55; q.wallT = 0.9; } // the wall jumps
    }
    go();
  }

  function startSetPiece() {
    var m = World.match;
    var ball = World.ball;
    if (m.sendOff) { sendOff(m.sendOff); m.sendOff = null; }
    var players = World.players;
    var t = m.setTeam;
    var a = NS.attack(t);
    var kind = m.setPiece;
    var i, p;
    var walk = kind >= 3 && kind <= 5;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.wX = p.pos.x; p.wZ = p.pos.z;
      p.vel.set(0, 0, 0);
      p.stun = 0; p.tackleT = 0; p.slideT = 0; p.lungeT = 0; p.runToT = 0; p.throwIn = false; p.gkHands = false;
    }
    var taker = m.setTaker;
    var bx = m.setX, bz = m.setZ;
    m.restart = 0;
    m.restartT = 0;
    if (kind === 2) {
      var goalX = a * HALF_W;
      bx = goalX - a * NS.PEN_D;
      bz = 0;
      var best = null;
      for (i = 0; i < players.length; i++) { p = players[i]; if (p.team === t && p.role === 'FWD') { best = p; break; } }
      taker = m.so ? m.setTaker : (best || taker); // (a shoot-out: its order of takers)
      var k = 0;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p === taker) continue;
        if (p.role === 'GK' && p.team !== t) { p.pos.set(goalX - a * 0.6, 0, 0); p.facing = a > 0 ? -Math.PI / 2 : Math.PI / 2; continue; }
        if (m.so) { // a shoot-out: everybody else waits in the centre circle
          var ang = (k + p.team * 0.5) * 0.55;
          p.pos.set(Math.cos(ang) * 4 * NS.M, 0, Math.sin(ang) * 4 * NS.M);
          p.facing = a > 0 ? Math.PI / 2 : -Math.PI / 2;
          k++;
          continue;
        }
        if (p.role === 'GK') continue;
        p.pos.set(goalX - a * (NS.BOX_D + 3 + (k % 3) * 1.5), 0, -14 + (k * 2.6) % 28);
        k++;
      }
      m.penalty = true;
      taker.aiT = 0;
      taker.pos.set(bx - a * 0.95, 0, bz);
      taker.facing = a > 0 ? Math.PI / 2 : -Math.PI / 2;
      taker.carry = 0.95;
    } else if (kind === 3) {
      var sz = bz > 0 ? 1 : -1;
      bz = sz * HALF_H;
      taker = nearestOf(t, bx, bz, null);
      taker.pos.set(bx, 0, sz * (HALF_H + 0.45));
      taker.facing = sz > 0 ? Math.PI : 0;
      throwOptions(t, taker, bx, sz, a);
      m.restart = 3;
    } else if (kind === 4) {
      taker = nearestOf(t, bx, bz, null);
      setupCorner(t, taker);
      m.restart = 4;
    } else if (kind === 5) {
      var d = NS.attack(t);
      var own = -d * HALF_W;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.team === t && p.role === 'GK') taker = p;
        if (p.team !== t && Math.abs(p.pos.x - own) < NS.BOX_D + 1.5 && Math.abs(p.pos.z) < NS.BOX_HW + 1.5) p.pos.x = own + d * (NS.BOX_D + 2);
      }
      taker = taker || nearestOf(t, own, 0, null);
      taker.pos.set(own + d * (NS.SIX_D - 0.95), 0, (bz > 0 ? 1 : -1) * 4);
      taker.facing = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      taker.carry = 0.95;
      m.restart = 5;
    } else {
      taker = taker || nearestOf(t, bx, bz, null);
      // a quick free kick is on when a man of the fouled side is at the ball (the fouled one, else one within 6 m):
      // he has it at once and FK_QUICK seconds to play it; then it is set (fkSetup) when it is within shooting range
      var gxF = a * HALF_W, gdF = Math.sqrt((gxF - bx) * (gxF - bx) + bz * bz);
      m.fkShooting = gdF < FK_RANGE && Math.abs(bz) < NS.BOX_HW + 14 * NS.M && (gxF - bx) * a > 6 * NS.M;
      var near = taker && taker.stun <= 0 ? taker : null;
      if (!near) { var nq = nearestOf(t, bx, bz, null); if (nq && Math.sqrt((nq.pos.x - bx) * (nq.pos.x - bx) + (nq.pos.z - bz) * (nq.pos.z - bz)) < 6 * NS.M) near = nq; }
      if (near) taker = near;
      m.fkQuick = near ? FK_QUICK : 0.01;
      m.fkSet = false;
      if (near && humanTeam(t)) NS.HUD.hint(NS.I18n.t('hud.quickfk'), FK_QUICK);
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.team === t) continue;
        var dx = p.pos.x - bx, dz = p.pos.z - bz;
        var dd = Math.sqrt(dx * dx + dz * dz);
        if (dd < FK_DIST) {
          if (dd < 0.1) { dx = -a; dz = 0; dd = 1; }
          p.pos.x = clamp(bx + dx / dd * FK_DIST, -HALF_W + 1, HALF_W - 1);
          p.pos.z = clamp(bz + dz / dd * FK_DIST, -HALF_H + 1, HALF_H - 1);
        }
      }
      m.restart = 1;
      taker.pos.set(bx - a * 0.95, 0, bz);
      taker.facing = a > 0 ? Math.PI / 2 : -Math.PI / 2;
      taker.carry = 0.95;
    }
    if (kind === 3) {
      takeBall(taker);
      taker.throwIn = true;
      ball.pos.set(taker.pos.x, 3.05, taker.pos.z);
    } else {
      ball.pos.set(taker.pos.x + Math.sin(taker.facing) * taker.carry, R, taker.pos.z + Math.cos(taker.facing) * taker.carry);
      takeBall(taker);
    }
    ball.vel.set(0, 0, 0);
    ball.pickupCooldown = 0.3;
    m.setTaker = taker;
    if (m.restart) m.protectT = 99;
    m.setPiece = 0;
    NS.HUD.hideBanner();
    NS.Input.clearEdges();
    if (walk) {
      for (i = 0; i < players.length; i++) {
        p = players[i];
        var fx = p.wX, fz = p.wZ;
        p.wX = p.pos.x; p.wZ = p.pos.z; p.wF = p.facing;
        p.pos.x = fx; p.pos.z = fz;
      }
      walkBallY = ball.pos.y;
      ball.pos.y = R;
      walking = true;
      walkT = 0;
    }
    hurried = false;
    for (i = 0; i < players.length; i++) { players[i].mesh.root.rotation.y = players[i].facing; animate(players[i], 0); }
  }

  var EXTRA_MAX = 20;
  function attackOn() {
    var m = World.match;
    var ball = World.ball;
    if (m.setPieceTimer > 0) return m.setPiece === 2 || m.setPiece === 4;
    if (m.penalty || m.restart === 4) return true;
    var o = ball.owner;
    if (o) return o.pos.x * NS.attack(o.team) > HALF_W / 3;
    if (ball.hard) return true;
    return ball.pos.x * NS.attack(ball.lastTouchTeam === 0 ? 0 : 1) > HALF_W / 3;
  }

  var Match = {
    labels: function (l) { labels = l; },

    syncRosters: function () {
      var s = World.session;
      if (!World.match.running) NS.useTeamSize(World.settings ? World.settings.teamSize : 11);
      this.refitRoster(0);
      this.refitRoster(1);
    },
    refitRoster: function (t) {
      var s = World.session;
      var team = NS.Teams.byId(t === 0 ? s.homeTeamId : s.awayTeamId);
      s.rosters[t] = NS.Players.fitRoster(team, team.players, NS.FORMATIONS[s.formations[t]]);
    },

    rebuildTeams: function () {
      var i;
      for (i = 0; i < World.players.length; i++) {
        NS.Scene.remove(World.players[i].mesh.root);
        NS.Assets.disposePlayer(World.players[i].mesh);
      }
      for (i = 0; i < World.sentOff.length; i++) {
        NS.Scene.remove(World.sentOff[i].mesh.root);
        NS.Assets.disposePlayer(World.sentOff[i].mesh);
      }
      World.sentOff.length = 0;
      NS.HUD.setCards(0, []);
      NS.HUD.setCards(1, []);
      World.players.length = 0;
      var s = World.session;
      var homeT = NS.Teams.byId(s.homeTeamId);
      var awayT = NS.Teams.byId(s.awayTeamId);
      var lit = NS.Scene.lit();
      // the kits picked on the kits screen (for these two teams), else the automatic ones
      var kp = s.kitPick && s.kitPick.h === s.homeTeamId && s.kitPick.a === s.awayTeamId ? s.kitPick.k : null;
      var kits = NS.Teams.matchKits(homeT, awayT, kp);
      for (var t = 0; t < 2; t++) {
        var dir = NS.attack(t);
        var td = t === 0 ? kits.home : kits.away;
        var layout = layoutOf(t);
        var names = s.rosters[t];
        for (i = 0; i < layout.length; i++) {
          var slot = layout[i];
          var gk = slot.role === 'GK';
          var mesh = NS.Assets.createPlayer({ pattern: gk ? 'SOLID' : td.pattern, c1: gk ? kits.gk[t] : td.c1, c2: td.c2,
            shorts: td.shorts, skin: SKIN[(i + t) % SKIN.length], gk: gk, seed: seedOf(names[i] || '', t * 31 + i),
            ht: names[i] ? NS.Players.statsFor(NS.Teams.byId(t === 0 ? s.homeTeamId : s.awayTeamId), names[i]).ht : 0 }, lit);
          NS.Scene.add(mesh.root);
          var pos = mesh.root.position;
          pos.set(slot.x * dir * SX(), 0, slot.z * dir * SZ());
          World.players.push({
            team: t, index: i, name: names[i] || ('PLAYER ' + slot.num), role: slot.role, num: slot.num,
            roleText: slot.role + ' #' + slot.num,
            homeX: slot.x * dir * SX(), homeZ: slot.z * dir * SZ(),
            pos: pos, vel: new THREE.Vector3(),
            facing: dir * Math.PI / 2,
            stamina: 100, animPhase: Math.random() * 6, mesh: mesh,
            stun: 0, tackleT: 0, tackleCd: 0, tackleHit: false, tackleHuman: false,
            runToX: 0, runToZ: 0, runToT: 0, aiCd: Math.random() * 0.3,
            carry: 0.95, dribbling: false, dBall: 0, rank: 0, gkHold: 0, isCtl: false,
            tackleSlide: false, returnTo: null, returnT: 0, returnExp: 0,
            kickT: 0, kickHard: false, lungeT: 0, slideT: 0, fallT: 0, diveT: 0, diveRoll: 0, headT: 0, catchT: 0, ftT: 0,
            gkHands: false, diveCd: 0, diveHigh: false, mood: 0, celX: 0, celZ: 0, slid: false,
            fouls: 0, card: 0,
            throwIn: false, throwT: 0, shoulderT: 0, shoulderDir: 1, shCd: 0, offside: false, bumpT: 0, bumpK: 1,
            blockT: 0, blockCd: 0, blockSide: 1, touchT: 0, touchFoot: 1, foot: 'R', kickFoot: 1,
            fkSpot: null, fkPend: null, wall: false, wallT: 0,
            mark: null, icX: 0, icZ: 0, drX: 0, drZ: 0, runT: 0, runCd: 0, runX: 0, runZ: 0,
            aiT: 0, tgtX: 0, tgtZ: 0, tgtS: 8, gkRT: 0,
            st: null, mSpd: 1, drain: 1,
            // (fields the AI, the keeper and checkoAI fill in later: declared here so every player has the same hidden
            // shape and the hot code stays optimized; a player whose fields arrive in another order is a new shape)
            wX: 0, wZ: 0, wF: 0, slOn: false, slX: 0, slZ: 0, slRest: 0, slPick: false, cntRun: 0, ahead: 0, tmRecv: null, knockCd: 0,
            smotherT: 0, spreadT: 0, oneT: 0, aiv: null,
            // the player-ball contacts (js/game/touch.js): ratings, touch state, a kick waiting for the ball
            ctl: 0.6, agi: 0.6, bal: 0.6, wf: 0.5, touchKind: 0, tchCd: 0, balT: 0, inV: 0, inT: 9,
            cOwn: false, pvx: 0, pvz: 0, kq: null, kqA: null, kqT: 0, kqPow: -1, kqLob: false, kqHum: false, kqFol: 0
          });
          rate(World.players[World.players.length - 1], t === 0 ? homeT : awayT);
        }
      }
      rateTeams(); // Fixed: ensure team class modifiers are always initialized on match start
      NS.HUD.setTeams(homeT, awayT, kits.home.c1, kits.away.c1);
      World.kitColors = [kits.home.c1, kits.away.c1];
      if (ref) { NS.Scene.remove(ref.mesh.root); NS.Assets.disposePlayer(ref.mesh); }
      var rm = NS.Assets.createPlayer({ pattern: 'SOLID', c1: kits.ref, c2: kits.ref, shorts: 0x111111, skin: SKIN[1], gk: false, seed: 7 }, lit);
      NS.Scene.add(rm.root);
      ref = {
        mesh: rm, pos: rm.root.position, vel: new THREE.Vector3(), facing: 0, index: 0, animPhase: 0, mood: 0, stun: 0,
        kickT: 0, kickHard: false, lungeT: 0, slideT: 0, fallT: 0, diveT: 0, diveRoll: 0, diveHigh: false, headT: 0, catchT: 0, ftT: 0,
        gkHands: false, throwIn: false, throwT: 0, shoulderT: 0, shoulderDir: 1, blockT: 0, blockSide: 1, touchT: 0, touchFoot: 1,
        kickFoot: 1
      };
    },

    refreshFromSession: function () {
      var s = World.session;
      for (var i = 0; i < World.players.length; i++) {
        var p = World.players[i];
        var layout = layoutOf(p.team);
        var slot = layout[p.index];
        var dir = NS.attack(p.team);
        p.name = s.rosters[p.team][p.index] || ('PLAYER ' + slot.num);
        rate(p, NS.Teams.byId(p.team === 0 ? s.homeTeamId : s.awayTeamId));
        p.role = slot.role;
        p.num = slot.num;
        p.roleText = slot.role + ' #' + slot.num;
        p.homeX = slot.x * dir * SX();
        p.homeZ = slot.z * dir * SZ();
      }
      rateTeams();
    },

    resetKickoff: function () {
      var m = World.match;
      World.resetBall();
      for (var i = 0; i < World.players.length; i++) {
        var p = World.players[i];
        p.pos.set(p.homeX, 0, p.homeZ);
        p.vel.set(0, 0, 0);
        p.facing = NS.attack(p.team) * Math.PI / 2;
        p.stun = 0; p.tackleT = 0; p.tackleCd = 0; p.runToT = 0; p.returnTo = null; p.dribbling = false;
        p.kickT = 0; p.lungeT = 0; p.slideT = 0; p.fallT = 0; p.diveT = 0; p.headT = 0; p.catchT = 0; p.gkHands = false;
        p.smotherT = 0; p.spreadT = 0; p.oneT = 0; p.blockT = 0; p.blockCd = 0;
        p.fkSpot = null; p.fkPend = null; p.wall = false; p.wallT = 0;
        p.mood = 0; p.slid = false; p.throwIn = false; p.throwT = 0; p.shoulderT = 0; p.offside = false; p.bumpT = 0;
        animate(p, 0);
        p.mark = null; p.drX = 0; p.drZ = 0; p.runT = 0; p.runCd = 0; p.aiT = 0; p.gkRT = 0; p.stamina = Math.min(100, p.stamina + 30); p.gkHold = 0;
      }
      World.pressT[0] = 0;
      World.pressT[1] = 0;
      World.gkRush[0] = World.gkRush[1] = 0;
      walking = false;
      if (ref) { ref.pos.set(-3, 0, -12); ref.vel.set(0, 0, 0); ref.facing = 0; }
      m.setPieceTimer = 0; m.setPiece = 0; m.penalty = false; m.protectT = 0; m.restart = 0; m.setTaker = null;
      m.fkQuick = 0; m.fkSet = false; m.fkCam = 0; m.fkShooting = false;
      World.ball.offTeam = -1;
      var kicker = null;
      for (var k = 0; k < World.players.length; k++) {
        var cand = World.players[k];
        if (cand.team === World.kickoffTeam && cand.role === 'FWD') { kicker = cand; break; }
        if (cand.team === World.kickoffTeam && cand.role !== 'GK' && !kicker) kicker = cand;
      }
      if (kicker) {
        kicker.pos.set(-NS.attack(kicker.team) * 0.95, 0, 0);
        kicker.carry = 0.95;
        World.ball.owner = kicker;
        World.ball.lastTouchTeam = kicker.team;
        m.restart = 6;
        m.restartT = 0;
        m.setTaker = kicker;
        m.protectT = 99;
        kicker.aiT = 0;
        for (var kp = 0; kp < World.players.length; kp++) if (World.players[kp] !== kicker) keepKickoff(World.players[kp]);
      }
      assignKickoffCursors();
      lastOwner = World.ball.owner;
      NS.Input.clearEdges();
      m.kickoffTimer = 1.0;
      NS.Audio.whistle(0);
    },

    start: function () {
      var m = World.match;
      if (NS.TEAM_SIZE !== World.settings.teamSize) {
        NS.useTeamSize(World.settings.teamSize);
        this.refitRoster(0);
        this.refitRoster(1);
      }
      if (NS.stadiumId !== World.settings.stadium) {
        NS.usePitch(World.settings.stadium);
        NS.Scene.rebuildStadium();
      }
      if (!(NS.Debug && NS.Debug.running())) NS.Scene.newPitchDesign();
      configureSlots();
      m.dir[0] = World.settings.randomEnds && Math.random() < 0.5 ? -1 : 1; m.dir[1] = -m.dir[0];
      if (NS.Aima) NS.Aima.matchStart();
      this.rebuildTeams();
      if (NS.Stats) NS.Stats.begin();
      if (NS.Replay) {
        var films = [];
        for (var fi = 0; fi < World.players.length; fi++) films.push(World.players[fi].mesh);
        if (ref) films.push(ref.mesh);
        NS.Replay.begin(films, !(NS.Debug && NS.Debug.running()));
      }
      m.score[0] = 0; m.score[1] = 0;
      m.timeSeconds = 0;
      m.half = 1;
      m.so = null; m.pens = null;
      m.extra = 0;
      m.warned[0] = false; m.warned[1] = false;
      m.firstKick = Math.random() < 0.5 ? 0 : 1;
      World.kickoffTeam = m.firstKick;
      m.celebrationTimer = 0;
      m.fullTimeTimer = 0;
      breakKind = 0;
      scorer = null;
      NS.HUD.hideGoalFx();
      lastSecond = -1;
      this.resetKickoff();
      m.running = true;
      m.paused = false;
      NS.HUD.setComp(NS.I18n.t('comp.' + World.session.compType));
      NS.HUD.setScore(0, 0);
      NS.HUD.setClock(0, 0);
      NS.HUD.hideBanner();
      NS.HUD.hideHint();
      NS.HUD.show(true);
      NS.HUD.applySettings(World.settings);
      NS.Audio.crowd(true);
      if (NS.Commentary) { NS.Commentary.matchStart(); say('INTRO', 0); }
      commAttack[0] = commAttack[1] = false;
    },

    exitToMenu: function (finished) {
      var m = World.match;
      m.running = false;
      m.paused = true;
      m.fullTimeTimer = 0;
      m.celebrationTimer = 0;
      breakKind = 0;
      NS.Audio.crowd(false);
      if (NS.Commentary) NS.Commentary.matchEnd();
      NS.HUD.show(false);
      NS.HUD.hideGoalFx();
      NS.Scene.setRing(0, false, 0, 0);
      NS.Scene.setRing(1, false, 0, 0);
      NS.Scene.setRing(2, false, 0, 0);
      NS.Scene.setRing(3, false, 0, 0);
      hideAims();
      if (NS.Aima && finished !== true) NS.Aima.matchEnd(false);
      if (NS.Replay && NS.Replay.active()) NS.Replay.stop();
      var inComp = NS.Comp && NS.Comp.active();
      if (inComp && finished === true) NS.Comp.recordUserMatch(m.score[0], m.score[1], m.pens ? m.pens[0] : -1, m.pens ? m.pens[1] : -1);
      if (finished === true) NS.UI.show('RESULT');
      else NS.UI.show(inComp ? 'COMPHUB' : 'MAIN');
    },

    applySides: function () {
      configureSlots();
      assignKickoffCursors();
    },

    requestMenu: function () {
      var m = World.match;
      if (m.running && !m.paused) NS.UI.openPause();
    },

    // One fixed simulation step.
    update: function (dt) {
      var m = World.match;
      var ball = World.ball;
      var players = World.players;
      var settings = World.settings;
      var n = players.length;
      var i, j, p;
      if (!m.running) return;
      if (NS.Commentary) NS.Commentary.tick(dt);

      if (m.celebrationTimer > 0) {
        m.celebrationTimer -= dt;
        breakStep(dt, settings.cameraMode);
        if (m.celebrationTimer <= 0) {
          var goalBreak = breakKind === 1, self = this;
          NS.HUD.hideBanner(); NS.HUD.hideGoalFx(); breakKind = 0;
          if (!(goalBreak && NS.Replay && NS.Replay.afterGoal(function () {
            self.resetKickoff();
            if (m.running && !m.paused) NS.Audio.crowd(true);
          }))) this.resetKickoff();
        }
        return;
      }
      if (m.fullTimeTimer > 0) {
        m.fullTimeTimer -= dt;
        breakStep(dt, settings.cameraMode);
        if (m.fullTimeTimer <= 0) this.exitToMenu(true);
        return;
      }
      if (m.kickoffTimer > 0) {
        m.kickoffTimer -= dt;
        if (m.kickoffTimer <= 0) NS.Input.clearEdges();
        NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        return;
      }
      // The referee stopped play for a foul or out-of-bounds: frame-rate independent exponential damping
      if (m.setPieceTimer > 0) {
        m.setPieceTimer -= dt;
        var outK = m.setPiece >= 3 && m.setPiece <= 5;
        var damp = Math.exp(-(outK ? 2.2 : 5.5) * dt);
        for (i = 0; i < n; i++) {
          p = players[i]; p.vel.x *= damp; p.vel.z *= damp;
          p.pos.x = clamp(p.pos.x + p.vel.x * dt, -HALF_W - 0.3, HALF_W + 0.3);
          p.pos.z = clamp(p.pos.z + p.vel.z * dt, -HALF_H - 0.3, HALF_H + 0.3);
          animate(p, dt);
        }
        if (outK) rollOut(dt);
        refStep(dt);
        if (m.setPieceTimer <= 0) startSetPiece();
        if (outK) NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        else NS.Scene.followBall(dt, m.setX, m.setZ, settings.cameraMode);
        return;
      }
      if (walking) {
        hurryRestart();
        walkStep(dt);
        refStep(dt);
        NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        return;
      }
      refStep(dt);
      if (m.protectT > 0) m.protectT -= dt;
      if (m.restart === 1 && m.fkQuick > 0 && ball.owner === m.setTaker) {
        m.fkQuick -= dt;
        if (m.fkQuick <= 0 && m.fkShooting) fkSetup();
      }
      if (m.fkCam > 0 && !m.fkSet) m.fkCam -= dt;
      if (m.restart) {
        m.restartT += dt;
        if (ball.owner !== m.setTaker) {
          m.restart = 0;
          m.protectT = 0;
          hurried = false;
          m.fkQuick = 0;
        } else if (m.restartT > (m.fkSet ? 14 : 10)) {
          if (NS.dbg) NS.dbg('restart_auto_played_10s', m.setTaker.team, m.restart);
          Actions.kick(m.setTaker, m.restart === 5 ? ACT.LONG : ACT.PASS, 0.5, NS.attack(m.setTaker.team), 0, 1);
        }
      }
      if (m.penalty && ball.owner !== m.setTaker && (ball.owner === null || ball.owner.team !== m.setTeam)) {
        m.penalty = false;
        if (NS.dbg) NS.dbg('penalty_taken', m.setTeam);
        if (!ball.owner) penaltyGuess(m.setTeam);
      }

      // ----- clock -----
      if (m.so) { soStep(dt); if (!m.so) return; } // a shoot-out: the clock stands (over: full time is on)
      else if (!m.restart && !(m.penalty && ball.owner === m.setTaker)) m.timeSeconds += dt * (90 / settings.durationMins);
      var mins = Math.floor(m.timeSeconds / 60);
      var whole = Math.floor(m.timeSeconds);
      if (whole !== lastSecond) { lastSecond = whole; NS.HUD.setClock(mins, whole % 60); }
      // halves end at 45 and 90; a cup knockout still level at 90: extra time, 2 x 15 (105, 120), then penalties
      var over = !m.so && mins >= HALF_END[m.half];
      if (over && attackOn() && m.extra < EXTRA_MAX) { m.extra += dt; over = false; }
      if (over) m.extra = 0;
      if (over && (m.half === 2 || m.half === 4)) {
        if (m.score[0] === m.score[1] && NS.Comp && NS.Comp.active() && NS.Comp.knockout()) {
          if (m.half === 2) halfBreak('hud.extratime'); else startShootout();
          return;
        }
        finish();
        return;
      }
      if (over && (m.half === 1 || m.half === 3)) { halfBreak(m.half === 1 ? 'hud.halftime' : 'hud.ethalf'); return; }

      // ----- timers, distances, ranks -----
      for (i = 0; i < n; i++) {
        p = players[i];
        if (p.stun > 0) p.stun -= dt;
        if (p.tackleCd > 0) p.tackleCd -= dt;
        if (p.diveCd > 0) p.diveCd -= dt;
        if (p.blockT > 0) p.blockT -= dt;
        if (p.blockCd > 0) p.blockCd -= dt;
        if (p.wallT > 0) { p.wallT -= dt; if (p.wallT <= 0) p.wall = false; }
        var dx = p.pos.x - ball.pos.x;
        var dz = p.pos.z - ball.pos.z;
        p.dBall = dx * dx + dz * dz;
        p.isCtl = false;
      }
      for (i = 0; i < n; i++) {
        p = players[i];
        var r = 0;
        for (j = 0; j < n; j++) {
          var q = players[j];
          if (q !== p && q.team === p.team && q.role !== 'GK' && q.dBall < p.dBall) r++;
        }
        p.rank = r;
      }
      if (World.pressT[0] > 0) World.pressT[0] -= dt;
      if (World.pressT[1] > 0) World.pressT[1] -= dt;
      if (World.gkRush[0] > 0) World.gkRush[0] -= dt;
      if (World.gkRush[1] > 0) World.gkRush[1] -= dt;

      // ----- humans (and AI.MA, who plays like one) -----
      syncAiSlots();
      hurryRestart();
      if (NS.Aima) NS.Aima.poll(dt);
      if (ball.owner !== lastOwner) {
        lastOwner = ball.owner;
        Controls.claimBall(lastOwner);
      }
      Controls.autoAssign(dt, false);
      for (i = 0; i < 2; i++) {
        var slot = World.slots[i];
        if (!slot.active || !slot.player) continue;
        slot.player.isCtl = true;
        NS.Bindings.use(NS.Devices.mapOf(i));
        Controls.update(slot, dt);
        if (slot.player) slot.player.isCtl = true;
        if (NS.Aima) NS.Aima.observe(slot, dt);
      }
      NS.Bindings.use(0);
      if (NS.Aima) { NS.Aima.driveTeam(0, dt); NS.Aima.driveTeam(1, dt); }
      for (i = 0; i < 2; i++) {
        if (World.slots[i].active && World.slots[i].player) World.slots[i].player.isCtl = true;
      }

      // ----- everyone else, then movement -----
      var profs0 = profFor(0);
      var profs1 = profFor(1);
      AI.teamUpdate(dt, [profs0, profs1]);
      var stunDrag = Math.exp(-8.5 * dt);
      var diveSlideDrag = Math.exp(-3.2 * dt);
      for (i = 0; i < n; i++) {
        p = players[i];
        var prof = p.team === 0 ? profs0 : profs1;
        if (p.tackleT > 0) {
          Actions.updateTackle(p, dt, p.tackleHuman ? 0.75 : prof.tackle);
        } else if (p.diveT > 0) {
          p.vel.x *= diveSlideDrag;
          p.vel.z *= diveSlideDrag;
        } else if (p.stun > 0) {
          p.vel.x *= stunDrag;
          p.vel.z *= stunDrag;
        } else if (m.fkSet && p !== m.setTaker && p.role !== 'GK') {
          // a free kick set for a shot: everybody holds his place (the wall, the box) until it is struck
          p.vel.x = 0; p.vel.z = 0;
          if (p.wall) p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        } else if (p.blockT > 0 && !p.isCtl) {
          // a block (Actions.blockReact): planted, his leg out in the ball's way, until he gets his balance back
          p.vel.x *= stunDrag;
          p.vel.z *= stunDrag;
        } else if ((m.penalty || m.so) && p !== ball.owner && p.role !== 'GK') {
          p.vel.x = 0; p.vel.z = 0;
        } else if (!p.isCtl) {
          AI.step(p, dt, p.rank, prof, World.pressT[p.team] > 0);
        }
        // the same body and the same contacts with the ball for everybody (human, CPU, checkoAI): the carrier turns
        // as fast as he can, runs to the ball and touches it on (js/game/touch.js)
        Touch.carry(p, dt);

        // Fixed: both human and CPU players drain and recover stamina fairly; velocity is only scaled by fatigue/bump
        var run = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
        if (run > 6.5) p.stamina = Math.max(5, p.stamina - (run - 6.5) * 0.325 * dt * p.drain);
        else p.stamina = Math.min(100, p.stamina + 0.9 * dt * (1.6 - p.drain));

        if (p.fkPend) fkRun(p, dt);
        var moveScale = fatigue(p);
        if (p.bumpT > 0) { p.bumpT -= dt; moveScale *= p.bumpK; }
        // Only apply mSpd if not already baked into AI/Control target velocity, or softly blend it
        var stepScale = p.tackleT > 0 || p.diveT > 0 ? 1.0 : moveScale * (0.85 + 0.15 * p.mSpd);

        var nx = p.pos.x + p.vel.x * dt * stepScale;
        var nz = p.pos.z + p.vel.z * dt * stepScale;
        var over = p.isCtl ? 1.5 : 0.3;
        p.pos.x = clamp(nx, -HALF_W - over, HALF_W + over);
        p.pos.z = clamp(nz, -HALF_H - over, HALF_H + over);
        if (m.restart === 6 && p !== m.setTaker) keepKickoff(p);
        if (m.restart === 1 && p.team !== m.setTeam) keepAway(p, m.setX, m.setZ, FK_DIST);
        if (m.restart === 5 && p.team !== m.setTeam) {
          var ownX = -NS.attack(m.setTeam) * HALF_W;
          if (Math.abs(p.pos.x - ownX) < NS.BOX_D + 1 && Math.abs(p.pos.z) < NS.BOX_HW + 1) p.pos.x = ownX - (ownX > 0 ? 1 : -1) * (NS.BOX_D + 1);
        }
        p.mesh.root.rotation.y = p.facing;
        animate(p, dt);
      }

      // ----- bodies: impulse-momentum collision resolution so players jostle smoothly without jittering -----
      for (i = 0; i < n; i++) {
        p = players[i];
        for (j = i + 1; j < n; j++) {
          var q2 = players[j];
          var cx = q2.pos.x - p.pos.x;
          var cz = q2.pos.z - p.pos.z;
          var cd2 = cx * cx + cz * cz;
          var minSep = 1.12;
          if (cd2 >= minSep * minSep || cd2 < 1e-6) continue;
          var cd = Math.sqrt(cd2);
          var cnx = cx / cd, cnz = cz / cd;
          var overlap = minSep - cd;
          var push = overlap * (p.team !== q2.team ? 0.48 : 0.32);
          p.pos.x -= cnx * push; p.pos.z -= cnz * push;
          q2.pos.x += cnx * push; q2.pos.z += cnz * push;
          // Relative normal velocity exchange (elasticity = 0.15)
          var rvx = p.vel.x - q2.vel.x;
          var rvz = p.vel.z - q2.vel.z;
          var vn = rvx * cnx + rvz * cnz;
          if (vn > 0) {
            var imp = vn * 0.55;
            p.vel.x -= cnx * imp; p.vel.z -= cnz * imp;
            q2.vel.x += cnx * imp; q2.vel.z += cnz * imp;
          }
        }
      }

      // ----- loose ball: keeper saves, then the CLOSEST player in reach gets it (fair for both teams) -----
      if (!ball.owner) {
        var bs2 = ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z;
        var taker = null;
        var takerD = 1.35;
        var gkActed = false;
        if (ball.nutT > 0) ball.nutT -= dt;
        for (i = 0; i < n; i++) {
          p = players[i];
          if (p.stun > 0 || p.tackleT > 0) continue;
          if (p.ftT > 0) continue;
          if (p === ball.kicker && ball.kickerT > 0) continue;
          if (p === ball.nutThru && ball.nutT > 0) continue;
          var ddx = ball.pos.x - p.pos.x;
          var ddz = ball.pos.z - p.pos.z;
          var d2 = ddx * ddx + ddz * ddz;
          if (d2 < (p.role === 'GK' ? 3.8 : 1.35) && !(ball.nutP === p && ball.age >= ball.nutAge)) {
            ball.nutP = p; ball.nutAge = ball.age;
            if (throughLegs(p, ball)) {
              ball.nutThru = p;
              if (NS.dbg) NS.dbg(p.team === ball.lastTouchTeam ? 'dummy' : 'nutmeg', ball.lastTouchTeam);
              if (p.team !== ball.lastTouchTeam) { NS.Audio.ooh(); NS.HUD.hint(NS.I18n.t('hud.nutmeg'), 1.2); }
              continue;
            }
          }
          if (p.role === 'GK' && ball.lastTouchTeam !== p.team && inOwnBox(p.team)) {
            var gkReach = p.diveT > 0 ? 7.3 : 3.8;
            var rv = -(ddx * ball.vel.x + ddz * ball.vel.z);
            var passing = d2 < 2.2 || rv <= bs2 * dt * 1.5;
            // how high his hands get: a dive or a jump reaches the top corner (2.7 m), standing with arms up 2.25 m
            if (d2 < gkReach && passing && ball.pos.y < (p.diveT > 0 ? 2.7 * NS.M : 2.25 * NS.M) && !(ball.gkTried & (1 << p.team)) && ball.gkCd <= 0) {
              ball.gkTried |= 1 << p.team;
              ball.gkCd = 0.28;
              gkActed = true;
              var speed = Math.sqrt(bs2);
              var sdx = ball.pos.x - p.pos.x, sdz = ball.pos.z - p.pos.z;
              var sideX = sdx * Math.cos(p.facing) - sdz * Math.sin(p.facing);
              if (p.diveT <= 0 && speed >= 11 && (sideX > 0.65 || sideX < -0.65)) {
                p.diveT = 0.75;
                p.diveRoll = sideX > 0 ? -1.25 : 1.25;
                p.vel.z += clamp(sdz * 4.5, -7.5, 7.5);
              }
              var reach = Math.sqrt(d2) - (p.diveT > 0 ? 1.0 : 0);
              var place = reach <= 0.65 ? 0.14 : -(reach - 0.65) * 0.34;
              var keeper = gkSkill(p.team) * 0.5 + (0.25 + p.st.def / 99 * 0.75) * 0.5;
              var range = clamp(((ball.shotD || 0) - 13) * 0.02, 0, 0.25);
              if (ball.lastTouchTeam >= 0) range += clamp(0.07 * (teamQ[p.team] - teamQ[ball.lastTouchTeam]), -0.12, 0.12);
              var chance = speed < 11 ? 1 : clamp(keeper + 0.05 + place + range - Math.max(0, speed - 28) * 0.012, 0.12, 0.9);
              if (ball.chip) chance *= 0.55;
              if (ball.pen) chance *= 0.55;
              if (Math.random() < chance) {
                if (NS.Stats) NS.Stats.save(p.team);
                if (speed >= 14) say('SAVE', p.team);
                if (speed < (p.diveT > 0 ? 25 : 21) - (ball.pos.y > 2.2 ? 3.5 : 0)) {
                  if (NS.dbg) NS.dbg('gk_catch', p.team);
                  takeBall(p);
                  p.gkHands = true;
                  p.catchT = 0.4;
                  if (speed > 19) NS.Audio.ooh();
                } else {
                  NS.Audio.ooh();
                  Actions.touch(p);
                  ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
                  var wide = Math.abs(ball.pos.z) > 2.3 || ball.pos.y > 2.2;
                  if (NS.dbg) NS.dbg(wide ? 'gk_parry_wide_shot' : 'gk_parry_central_shot', p.team);
                  // Physics-based parry: deflects along the keeper's dive/hand direction with a fraction of shot speed
                  var deflectSpd = clamp(speed * 0.38, 6.5, 14.5);
                  var side = sdz > 0.15 ? 1 : (sdz < -0.15 ? -1 : (p.vel.z >= 0 ? 1 : -1));
                  if (Math.random() < (wide ? 0.72 : 0.35)) {
                    if (NS.dbg) NS.dbg('gk_tip_behind', p.team);
                    ball.vel.x = (ball.vel.x > 0 ? 1 : -1) * (2.5 + Math.random() * 2.5);
                    ball.vel.z = side * deflectSpd;
                    ball.vel.y = ball.pos.y > 2.1 ? 5.5 + Math.random() * 2.0 : 2.2 + Math.random() * 1.5;
                  } else {
                    ball.vel.x = -ball.vel.x * 0.36;
                    ball.vel.z = p.vel.z * 0.5 + side * (deflectSpd * 0.75) + (Math.random() - 0.5) * 3;
                    ball.vel.y = 2.0 + Math.random() * 2.2;
                  }
                  ball.hard = false;
                  ball.pickupCooldown = 0.22;
                  ball.lastTouchTeam = p.team;
                  NS.Audio.kick(false);
                }
              } else if (NS.dbg) NS.dbg('gk_beaten_in_reach', p.team);
              break;
            } else if (ball.pickupCooldown <= 0 && ball.pos.y < 1.9 && d2 < takerD) {
              takerD = d2;
              taker = p;
            }
          } else if (p.blockT > 0 && p.team !== ball.lastTouchTeam && ball.pos.y < 1.2 && d2 < Math.max(takerD, BLOCK_REACH2)) {
            // a blocking leg reaches further than a standing player (about 1 m): the shot / pass hits it
            takerD = d2;
            taker = p;
          } else if (p.wall && p.headT > 0 && ball.lastTouchTeam !== p.team && ball.pos.y < WALL_REACH && d2 < Math.max(takerD, 1.6)) {
            // the wall jumped: a free kick into it is blocked (deflected off a head or a body)
            takerD = d2;
            taker = p;
          } else if ((ball.pickupCooldown <= 0 || p === ball.receiver) && (ball.pos.y < (p === ball.receiver ? 2.3 : 1.9) ? d2 < takerD :
              (ball.pos.y < 2.6 && d2 < Math.min(takerD, 0.6)))) {
            takerD = d2;
            taker = p;
          }
        }
        // headers: CPU players head balls at head height
        if (!gkActed && ball.pos.y > 1.45 && ball.pos.y < 3.6 && ball.vel.y < 0) {
          for (i = 0; i < n; i++) {
            p = players[i];
            if (p.role === 'GK' || p.isCtl || humanTeam(p.team) || p.tackleT > 0) continue;
            if (!Actions.canHead(p)) continue;
            var att = NS.attack(p.team);
            var toGoal = Math.abs(att * HALF_W - p.pos.x) + Math.abs(p.pos.z) * 0.5;
            var shotOn = toGoal < 18 && p.role !== 'DEF';
            if (ball.lastTouchTeam === p.team && !shotOn) continue;
            var clear = ball.lastTouchTeam !== p.team && Math.abs(-att * HALF_W - p.pos.x) < 30;
            var byLine = Math.abs(-att * HALF_W - p.pos.x) < 11;
            if (clear && byLine && Math.random() < 0.45) {
              if (Actions.knockOff(p, false)) return;
              if (NS.dbg) NS.dbg('header_put_behind', p.team);
              ball.vel.set(-att * (5 + Math.random() * 5), 2.8 + Math.random() * 2.5, (p.pos.z >= 0 ? 1 : -1) * (2 + Math.random() * 5));
              p.headT = 0.55;
            } else if (clear) {
              if (NS.dbg) NS.dbg('cpu_header_clearance', p.team);
              Actions.header(p, false, ACT.LONG, att, p.pos.z >= 0 ? 0.9 : -0.9);
            } else {
              if (NS.dbg) NS.dbg(shotOn ? 'cpu_header_at_goal' : 'cpu_header_pass', p.team);
              Actions.header(p, shotOn, ACT.PASS, att, 0);
            }
            gkActed = true;
            taker = null;
            break;
          }
        }
        if (!gkActed && taker) {
          var hardHit = ball.hard && bs2 > 240;
          if (hardHit && NS.dbg) NS.dbg('shot_hit_outfield_player', taker.team);
          if (hardHit || !Actions.controls(taker)) {
            if (Actions.knockOff(taker, hardHit)) return;
          } else {
            var byHands = taker.role === 'GK' && ball.lastTouchTeam !== taker.team && inOwnBox(taker.team);
            if (takeBall(taker)) {
              if (byHands) { taker.gkHands = true; taker.catchT = 0.4; }
              else Touch.receive(taker); // the first touch: the ball is met, not caught by the feet
            }
          }
        }
      }

      // ----- keeper holding the ball: 5 seconds at most, then it goes long anyway -----
      var hold = ball.owner;
      if (hold && hold.role === 'GK') {
        hold.gkHold += dt;
        if (hold.gkHold > 5) {
          hold.gkHold = 0;
          Actions.kick(hold, ACT.LONG, 0.8, NS.attack(hold.team), 0, 1);
        }
      }

      // ----- ball, goal, camera -----
      if (NS.Stats) NS.Stats.tick(dt);
      var scored = World.stepBall(dt);
      NS.Scene.setBall(ball.pos, ball.vel, ball.spinY, dt, ball.owner ? !ball.owner.gkHands && !ball.owner.throwIn : ball.pos.y < R + 0.03);
      NS.Scene.trail(ball.hard && !ball.owner, ball.pos);
      if (World.netHit) { NS.Scene.netHit(World.netHit); World.netHit = 0; }
      if (scored >= 0) triggerGoal(scored);
      else if (scored <= -3) onOut(scored);

      dangerT -= dt;
      if (dangerT <= 0) {
        dangerT = 0.2;
        var toGoal = HALF_W - Math.abs(ball.pos.x);
        var danger = clamp(1 - toGoal / 32, 0, 1) * clamp(1.25 - Math.abs(ball.pos.z) / HALF_H, 0.35, 1);
        if (ball.hard && !ball.owner) danger = 1;
        NS.Audio.tick(0.2, danger);
        var ao = ball.owner;
        for (var at = 0; at < 2; at++) {
          var aGoal = ao && ao.team === at && !m.restart ? Math.abs(NS.attack(at) * HALF_W - ao.pos.x) : 99;
          if (aGoal < 25 && !commAttack[at]) { commAttack[at] = true; say('ATTACK', at); }
          else if (aGoal > 35) commAttack[at] = false;
        }
      }

      for (i = 0; i < 2; i++) {
        var sl = World.slots[i];
        if (sl.active && sl.player) NS.Scene.setRing(i, true, sl.player.pos.x, sl.player.pos.z,
          !ball.owner && (ball.receiver === sl.player || ball.contester === sl.player));
        else NS.Scene.setRing(i, false, 0, 0);
        var al = World.aiSlots[i];
        if (al.active && al.player) NS.Scene.setRing(2 + i, true, al.player.pos.x, al.player.pos.z, false);
        else NS.Scene.setRing(2 + i, false, 0, 0);
      }
      aimArrows(dt);
      if (m.fkCam > 0) NS.Scene.fkView(dt, m.setX, m.setZ, NS.attack(m.setTeam) * HALF_W, !m.fkSet);
      else NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
    },

    drawHud: function (dt) {
      var s0 = World.slots[0];
      var s1 = World.slots[1];
      var a0 = World.aiSlots[0], a1 = World.aiSlots[1];
      for (var t = 0; t < 2; t++) {
        var hs = s0.active && s0.team === t ? s0 : (s1.active && s1.team === t ? s1 : null);
        var as = t === 0 ? a0 : a1;
        if (hs) NS.HUD.plate(t, hs === s0 ? labels.p1 : labels.p2, hs.player, hs);
        else if (as.active && as.player) NS.HUD.plate(t, 'checkoAI', as.player, as.player.aiv || as);
        else NS.HUD.plate(t, labels.cpu, featured(t), null);
      }
      NS.HUD.aima(a0.active || a1.active);
      if (World.settings.showRadar) NS.HUD.radar(World.players, World.ball, World.slots);
      NS.Scene.project(World.ball.pos);
      NS.HUD.cover(NS.Scene.px, NS.Scene.py);
      NS.HUD.tick(dt);
    },

    syncBall: function () {
      NS.Scene.setBall(World.ball.pos, World.ball.vel, 0, 0, true);
    },

    restyle: function () {
      var lit = NS.Scene.lit(), want = NS.Assets.styleKey(lit), all = [], i;
      for (i = 0; i < World.players.length; i++) all.push(World.players[i]);
      for (i = 0; i < World.sentOff.length; i++) all.push(World.sentOff[i]);
      if (ref) all.push(ref);
      var stale = false;
      for (i = 0; i < all.length; i++) if (all[i].mesh.style !== want) stale = true;
      if (stale) {
        NS.Assets.dropBodyGeometry();
        for (i = 0; i < all.length; i++) { NS.Assets.restylePlayer(all[i].mesh, lit); animate(all[i], 0); }
      }
      NS.Scene.rebuildBall();
    }
  };

  Actions.onFoul = onFoul;
  Actions.onOffside = onOffside;
  NS.Match = Match;
})(window.RS6 = window.RS6 || {});
