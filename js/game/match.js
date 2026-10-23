/* Match flow: team meshes, kickoff, the fixed-step update, goals, full time and the per-frame HUD refresh. */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var Controls = NS.Controls;
  var AI = NS.AI;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });

  var SKIN = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xc68642];
  var ballRotX = 0;
  var ballRotZ = 0;
  var labels = { p1: 'P1', p2: 'P2', cpu: 'CPU' };
  var lastSecond = -1;
  var lastOwner = null;
  // breaks without freezing: 1 = goal celebration, 2 = half time, 3 = full time
  var breakKind = 0;
  // ball out of play: the players walk to their places for the throw-in / corner / goal kick (no frozen screen)
  var walking = false, walkT = 0, walkBallY = 0;
  // the referee (not one of World.players: he never touches the ball)
  var ref = null;
  var scorer = null;
  var breakClock = 0;
  var dangerT = 0;
  var R = NS.BALL_R;
  var PI = Math.PI;

  function ease(u) { return u < 0 ? 0 : (u > 1 ? 1 : u * u * (3 - 2 * u)); }

  // Pose of one player for this step (rotations only, no allocation). Priority: dive, header, catch, throw, slide, fall,
  // shoulder, lunge, kick, run. HIP = height of the hips (the body pivots there, legs hang from it).
  var HIP = NS.Assets.HIP;
  // formation spots are given for a 105 x 68 pitch
  function SX() { return HALF_W / 52.5; }
  function SZ() { return HALF_H / 34; }

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
    var lean = 0.18 * run;
    var roll = 0;
    var hipY = HIP + Math.abs(Math.cos(p.animPhase)) * 0.09 * run;
    var u, b;

    if (p.diveT > 0) {
      // keeper dive: whole body falls to the side, arms stretched over the head (higher for a high shot)
      u = 1 - p.diveT / 0.8;
      b = ease(u / 0.25) * (1 - ease((u - 0.75) / 0.25));
      roll = p.diveRoll * b;
      hipY = HIP - 0.5 * b + (p.diveHigh ? 0.8 * Math.sin(clamp(u, 0, 1) * PI) : 0);
      armL = armR = -2.9 * b;
      outL = outR = 0.25 * b;
      legL = 0.2 * b; legR = -0.2 * b; lean = 0;
    } else if (p.headT > 0) {
      // header: a crouch, a real jump (the whole body leaves the grass), arch back, snap the head through the ball
      u = 1 - p.headT / 0.55;
      var crouch = u < 0.15 ? Math.sin(u / 0.15 * PI) : 0;
      b = u < 0.15 ? 0 : Math.sin((u - 0.15) / 0.85 * PI);
      hipY = HIP - 0.25 * crouch + 0.85 * b;
      lean = u < 0.5 ? -0.4 * clamp((u - 0.1) / 0.4, 0, 1) : -0.4 + 0.95 * ((u - 0.5) / 0.5);
      lean *= u < 0.15 ? 0 : 1;
      legL = 0.45 * b - 0.3 * crouch; legR = -0.35 * b - 0.3 * crouch;
      armL = armR = -1.1 * b;
      outL = outR = 0.08 + 0.6 * b;
    } else if (p.catchT > 0) {
      // keeper catch: both hands up to the ball
      u = 1 - p.catchT / 0.4;
      b = Math.sin(clamp(u * 1.6, 0, 1) * PI * 0.5);
      armL = armR = -2.1 * b - 1.3 * (1 - b);
      outL = outR = 0.12;
      lean = -0.1 * b;
    } else if (p.throwIn && World.ball.owner === p) {
      // ready to throw in: both hands over the head holding the ball
      armL = armR = -2.95; outL = outR = 0.12; lean = -0.12;
    } else if (p.throwT > 0) {
      // the throw: arms come over from behind the head
      u = 1 - p.throwT / 0.4;
      armL = armR = -3.3 + u * 2.2; outL = outR = 0.12; lean = -0.2 + u * 0.45;
    } else if (p.slideT > 0) {
      // slide tackle: lean far back, hips near the grass, front leg out, back leg folded
      u = 1 - p.slideT / 0.85;
      b = ease(u / 0.15) * (1 - ease((u - 0.75) / 0.25));
      lean = -1.15 * b;
      hipY = HIP - 0.72 * b;
      legR = legR * (1 - b) - 0.35 * b;
      legL = legL * (1 - b) + 0.75 * b;
      armL = armL * (1 - b) - 0.5 * b; armR = armR * (1 - b) - 0.2 * b;
      outL = 0.08 + 0.9 * b; outR = 0.08 + 0.6 * b;
    } else if (p.fallT > 0) {
      // lost the ball in a tackle: knocked off balance
      u = 1 - p.fallT / 0.55;
      b = Math.sin(clamp(u, 0, 1) * PI);
      lean = -0.45 * b;
      roll = 0.35 * b;
      hipY = HIP - 0.2 * b;
      outL = outR = 0.08 + 0.9 * b;
      legL = 0.3 * b; legR = -0.4 * b;
    } else if (p.shoulderT > 0) {
      // shoulder to shoulder: leans sideways into the other player, arm tucked in
      u = 1 - p.shoulderT / 0.32;
      b = Math.sin(clamp(u, 0, 1) * PI);
      roll = -0.35 * b * p.shoulderDir;
      if (p.shoulderDir > 0) outR = 0.02; else outL = 0.02;
    } else if (p.lungeT > 0) {
      // standing tackle: lunge, front leg stretched to the ball
      u = 1 - p.lungeT / 0.36;
      b = Math.sin(clamp(u * 1.4, 0, 1) * PI * 0.5) * (1 - ease((u - 0.7) / 0.3));
      lean = 0.2 + 0.25 * b;
      legR = legR * (1 - b) - 1.15 * b;
      legL = legL * (1 - b) + 0.45 * b;
      hipY = HIP - 0.16 * b;
      outL = outR = 0.08 + 0.55 * b;
    } else if (p.kickT > 0) {
      // kick: back-swing then strike through the ball (bigger swing and lean-back for shots and long balls)
      var dur = p.kickHard ? 0.36 : 0.28;
      u = 1 - p.kickT / dur;
      var reach = p.kickHard ? 1.45 : 0.95;
      var k = u < 0.25 ? 0.5 + u / 0.25 * 0.5 : 1 - (u - 0.25) / 0.5 * (1 + reach);
      if (u > 0.75) k = -reach * (1 - (u - 0.75) / 0.25);
      legR = k;
      legL = 0.15;
      lean = p.kickHard ? (u < 0.25 ? 0.15 : -0.22) : 0.08;
      armL = 0.4; armR = -0.3;
      outL = 0.95; outR = 0.45;
      hipY = HIP;
    } else if (p.mood === 1 || (p.mood === 4 && sp < 2.5)) {
      // celebrating: jumping, both arms up, waving
      b = Math.abs(Math.sin(breakClock * 7 + p.index));
      hipY = HIP + 0.45 * b;
      armL = -2.75 + Math.sin(breakClock * 9 + p.index) * 0.3;
      armR = -2.75 - Math.sin(breakClock * 9 + p.index) * 0.3;
      outL = outR = 0.35;
      lean = -0.1;
      legL = 0.25 * b; legR = -0.25 * b;
    } else if (p.mood === 4) {
      // the scorer's run to the corner: arms spread like wings
      outL = outR = 1.45; armL = armR = 0; lean = 0.25;
    } else if (p.mood === 2) {
      // dejected: head down, arms hanging, slow walk
      lean = 0.38; outL = outR = 0.02; armL *= 0.3; armR *= 0.3; hipY -= 0.05;
    } else if (p.mood === 3) {
      // on the knees
      hipY = HIP * 0.56; lean = 0.25; legL = -1.45; legR = -1.45; armL = armR = 0.15; outL = outR = 0.12;
    } else if (p.stun > 0) {
      lean = 0.3; outL = outR = 0.4;
    } else if (p.gkHands && World.ball.owner === p) {
      armL = armR = -1.3; outL = outR = 0.1; // ball held in front
    }

    mesh.body.position.y = hipY;
    mesh.body.rotation.x = lean;
    mesh.body.rotation.z = roll;
    mesh.leftLeg.rotation.x = legL;
    mesh.rightLeg.rotation.x = legR;
    mesh.leftArm.rotation.x = armL;
    mesh.rightArm.rotation.x = armR;
    mesh.leftArm.rotation.z = -outL;
    mesh.rightArm.rotation.z = outR;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function layoutOf(teamIdx) { return NS.FORMATIONS[World.session.formations[teamIdx]]; }

  // A player's ratings and what they do in play (computed when the teams are built or the squad changes).
  //   mSpd  pace factor from Speed (~0.84 .. 1.10)        drain  how fast he tires, from Stamina
  function rate(p, teamObj) {
    var st = NS.Players.statsFor(teamObj, p.name);
    p.st = st;
    p.mSpd = 0.84 + st.spd / 99 * 0.26;
    p.drain = 1.5 - st.sta / 99;
  }

  // tired players slow down (below a third of the tank)
  function fatigue(p) { return p.stamina >= 35 ? 1 : 0.86 + 0.14 * p.stamina / 35; }

  function humanTeam(team) {
    return (World.slots[0].active && World.slots[0].team === team) || (World.slots[1].active && World.slots[1].team === team);
  }

  // World.levels = ["HARD", "EASY"] lets each CPU team play at its own level (used by the balancing tests).
  function levelOf(team) { return World.levels ? World.levels[team] : World.settings.difficulty; }

  // AI.MA: a CPU team on the AI.MA level has its learning player (js/game/aima.js) on the selected player; the rest of
  // the team is the Legend CPU
  function syncAiSlots() {
    for (var t = 0; t < 2; t++) {
      var s = World.aiSlots[t];
      var on = !!NS.Aima && !humanTeam(t) && levelOf(t) === 'AIMA';
      if (on !== s.active) {
        s.active = on; s.player = null; s.evActive = false; s.lockT = 0; s.manual = false;
        if (s.pad) { s.pad.cur = 0; s.pad.x = 0; s.pad.y = 0; }
      }
      if (on && !s.player) s.player = Actions.nearestToBall(t, null, null);
    }
  }

  function profFor(team) {
    return humanTeam(team) ? AI.profiles.NORMAL : AI.profile(levelOf(team));
  }

  function configureSlots() {
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
    // AI.MA starts on a forward too
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
    if (Actions.touch(p)) return false; // he was offside when it was played
    if (NS.Stats) NS.Stats.gain(p);
    ball.owner = p;
    ball.lastTouchTeam = p.team;
    ball.lastToucher = p.name;
    ball.pickupCooldown = 0.2;
    ball.hard = false;
    ball.chip = false;
    ball.gkTried = 0;
    ball.receiver = null;
    ball.contester = null;
    ball.pen = false;
    p.gkHands = false;
    p.gkHold = 0;
    if (p.returnTo) p.returnT = 0.28; // one-two: play it back
    p.dribbling = false;
    return true;
  }

  // The ball is in `team`'s own penalty area (where its keeper may use his hands).
  function inOwnBox(team) {
    var ball = World.ball;
    var goalX = -NS.attack(team) * HALF_W;
    return Math.abs(ball.pos.x - goalX) < NS.BOX_D + 0.5 && Math.abs(ball.pos.z) < NS.BOX_HW + 0.5;
  }

  function gkSkill(team) {
    return humanTeam(team) ? 0.7 : AI.profile(levelOf(team)).gkSave;
  }

  // Moods for the breaks: 1 celebrate, 2 dejected walk, 3 on the knees, 4 the scorer's run, 5 walk off.
  function setMoods(kind, team) {
    var players = World.players;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      p.stun = 0; p.tackleT = 0; p.slid = false;
      if (kind === 2) p.mood = 5;
      else if (kind === 1) p.mood = p.team === team ? 1 : (p.role === 'GK' ? 3 : 2);
      else if (team < 0) p.mood = 5; // a draw: everybody walks off
      else p.mood = p.team === team ? 1 : (Math.random() < 0.4 ? 3 : 2);
    }
  }

  function triggerGoal(team) {
    var m = World.match;
    var ball = World.ball;
    m.score[team]++;
    World.kickoffTeam = 1 - team; // the team that conceded restarts
    m.celebrationTimer = 4.6;
    breakKind = 1;
    breakClock = 0;
    setMoods(1, team);
    // the scorer (an own goal: the attacker nearest the ball celebrates it)
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
    NS.HUD.setScore(m.score[0], m.score[1]);
    var who = k ? k.name : ball.lastToucher;
    var mins = Math.min(90, Math.floor(m.timeSeconds / 60) + 1);
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
    ball.vel.multiplyScalar(0.7); // it carries on into the net
  }

  // every player's formation place on his team's new end (second half)
  function swapHomes() {
    for (var i = 0; i < World.players.length; i++) {
      var p = World.players[i], sl = layoutOf(p.team)[p.index], d = NS.attack(p.team);
      if (!sl) continue;
      p.homeX = sl.x * d * SX(); p.homeZ = sl.z * d * SZ();
    }
  }

  function finish() {
    var m = World.match;
    m.fullTimeTimer = 5.0;
    breakKind = 3;
    breakClock = 0;
    scorer = null;
    setMoods(3, m.score[0] > m.score[1] ? 0 : (m.score[1] > m.score[0] ? 1 : -1));
    NS.Audio.whistle(2);
    NS.HUD.banner(NS.I18n.t('hud.fulltime'), m.score[0] + ' - ' + m.score[1], 0);
    if (NS.Aima) NS.Aima.matchEnd(true);
    if (World.slots[0].active) {
      var mt = World.slots[0].team;
      var won = m.score[mt] > m.score[1 - mt] ? 1 : 0;
      var cup = 0; // cups are counted when a competition is won (NS.Comp)
      NS.Storage.addResult(won, 0, cup);
      NS.Storage.submitMatchScore(m.score[mt], m.score[1 - mt], cup);
      MyPC.announce(NS.I18n.t('hud.fulltime') + ' ' + m.score[0] + ' - ' + m.score[1]);
    }
  }

  // One step of a break (goal, half time, full time): nothing freezes. The ball rolls on into the net, the scorer
  // runs to the corner flag and slides, his team-mates chase him, the other team walks back heads down, the keeper
  // kneels; at half / full time the players walk off (winners celebrate, losers drop to their knees).
  function breakStep(dt, camMode) {
    var ball = World.ball;
    var players = World.players;
    breakClock += dt;
    if (World.stepBall(dt) <= -3) ball.vel.set(0, 0, 0); // out of play: it stops there
    ballRotX += ball.vel.z * dt / R;
    ballRotZ -= ball.vel.x * dt / R;
    NS.Scene.setBall(ball.pos, ballRotX, ballRotZ);
    NS.Scene.trail(false, ball.pos);
    if (World.netHit) { NS.Scene.netHit(World.netHit); World.netHit = 0; }
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var tx = p.pos.x, tz = p.pos.z, sp = 0, stop = 0.6;
      if (p.mood === 4) { tx = p.celX; tz = p.celZ; sp = 11.5; stop = 1.2; }
      else if (p.mood === 1 && breakKind === 1 && scorer) { tx = scorer.pos.x; tz = scorer.pos.z; sp = 10.5; stop = 2.2; }
      else if (p.mood === 2) { tx = p.homeX * 0.6; tz = p.homeZ; sp = 3.2; }
      else if (p.mood === 5) { tx = p.pos.x * 0.6; tz = -HALF_H - 3; sp = 3.4; }
      if (p.mood === 3 && breakClock > 2.6 && breakKind === 1) p.mood = 2; // the keeper gets up
      var dx = tx - p.pos.x, dz = tz - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var k = Math.min(1, 6 * dt);
      if (sp > 0 && d > stop) {
        var s = d < 3 ? sp * (0.4 + d * 0.2) : sp;
        p.vel.x += (dx / d * s - p.vel.x) * k;
        p.vel.z += (dz / d * s - p.vel.z) * k;
        p.facing = Math.atan2(p.vel.x, p.vel.z);
      } else {
        p.vel.x *= 0.85; p.vel.z *= 0.85;
        if (p.mood === 4 && !p.slid) { p.slid = true; p.slideT = 0.85; } // knee slide at the flag
        if (p.mood === 1 && scorer) p.facing = Math.atan2(scorer.pos.x - p.pos.x, scorer.pos.z - p.pos.z);
      }
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, -HALF_W - 2, HALF_W + 2);
      p.pos.z = clamp(p.pos.z + p.vel.z * dt, -HALF_H - 4, HALF_H + 2);
      p.mesh.root.rotation.y = p.facing;
      animate(p, dt);
    }
    for (var j = 0; j < 2; j++) NS.Scene.setRing(j, false, 0, 0);
    if (breakKind === 1 && scorer) NS.Scene.followBall(dt, scorer.pos.x, scorer.pos.z, camMode);
    else NS.Scene.followBall(dt, ball.pos.x * 0.5, 0, camMode);
  }

  // ---------------------------------------------------------------- fouls, free kicks, penalties
  // A tackle from behind (Actions.onFoul): play stops; a free kick where it happened, or a penalty when it happened in
  // the fouling team's own penalty area.
  var CARD_COLOR = [0, 0, 0xfacc15, 0xef4444];
  var CARD_KEY = ['card.warn', '', 'card.yellow', 'card.red'];

  // The scoreboard cards of team t (every booking of the match, sent-off players included).
  function refreshCards(t) {
    var list = [];
    var all = World.players.concat(World.sentOff);
    for (var i = 0; i < all.length; i++) if (all[i].team === t && all[i].card) list.push(all[i].card);
    list.sort();
    NS.HUD.setCards(t, list);
  }

  // The referee's bookings: the first foul of a team gets a word (a warning for the whole team, no card); after that
  // any foul by that team is a yellow card, and a player's second yellow is a red (sent off when play restarts).
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

  // Off he goes: out of the match (his team plays one short), his mesh hidden, nobody controls him any more.
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
    if (NS.dbg) NS.dbg(inBox ? 'penalty_won' : 'free_kick_won', victim.team);
    m.setTeam = victim.team;
    m.setX = clamp(victim.pos.x, -HALF_W + 2, HALF_W - 2);
    m.setZ = clamp(victim.pos.z, -HALF_H + 2, HALF_H - 2);
    m.setTaker = victim;
    m.setPieceTimer = 1.6;
    stopPlay();
    ball.vel.set(0, 0, 0);
    NS.Audio.whistle(0);
    // the banner: the free kick / penalty, then the booking and who got it
    NS.HUD.banner(NS.I18n.t(inBox ? 'hud.penalty' : 'hud.foul'),
      NS.I18n.t(CARD_KEY[card]) + ' - ' + tackler.name + '  •  ' + NS.I18n.t(inBox ? 'hud.penalty.sub' : 'hud.freekick'), 1.5);
    if (card === 3) m.setPieceTimer = 2.2; // a little longer: he walks off
  }

  // At a penalty the keeper cannot react in time: he picks a side (left, right, or stays in the middle) as it is struck
  // and dives there. He saves it only when he guessed right (or it is badly placed / too soft).
  function penaltyGuess(shootingTeam) {
    var players = World.players;
    var gk = null;
    for (var i = 0; i < players.length; i++) if (players[i].role === 'GK' && players[i].team !== shootingTeam) gk = players[i];
    if (!gk) return;
    var r = Math.random();
    var side = r < 0.43 ? -1 : (r < 0.86 ? 1 : 0);
    gk.diveCd = 1.6; // no other dive: he is committed
    World.ball.pen = true; // a struck penalty is harder to keep out even when he guesses right
    if (!side) return;
    gk.facing = NS.attack(gk.team) * Math.PI / 2;
    gk.vel.z = side * 13;
    gk.diveT = 0.8;
    gk.diveHigh = Math.random() < 0.3;
    gk.diveRoll = -side * Math.sin(gk.facing) > 0 ? -1.25 : 1.25;
  }

  // The referee keeps up with play from ~14 m, on the far side of the ball (where the camera sees him), out of the way.
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

  // The ball runs on after it went out (no freeze): it rolls / drops and stops at the advertising boards.
  function rollOut(dt) {
    var ball = World.ball;
    ball.vel.y -= 19.6 * dt;
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    ball.pos.z += ball.vel.z * dt;
    if (ball.pos.y < R) { ball.pos.y = R; ball.vel.y = -ball.vel.y * 0.4; ball.vel.x *= 0.92; ball.vel.z *= 0.92; }
    ball.vel.x *= 0.99; ball.vel.z *= 0.99;
    var lx = HALF_W + 3.5, lz = HALF_H + 3.5;
    if (Math.abs(ball.pos.x) > lx) { ball.pos.x = ball.pos.x > 0 ? lx : -lx; ball.vel.x *= -0.3; }
    if (Math.abs(ball.pos.z) > lz) { ball.pos.z = ball.pos.z > 0 ? lz : -lz; ball.vel.z *= -0.3; }
  }

  // Walk-up for a throw-in / corner / goal kick: everybody jogs to his place, the taker to the ball; it is taken when
  // he is there (the others arrive by then, or are put in place).
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
    if (!(takerIn && (done || walkT > 1.2)) && walkT < 3.2) return;
    // everybody in place: the restart is on
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

  // Play stops (foul, offside, ball out): nobody has the ball, no pass is on its way, the offside snapshot is gone.
  function stopPlay() {
    var ball = World.ball;
    ball.owner = null;
    ball.receiver = null;
    ball.contester = null;
    ball.hard = false;
    ball.offTeam = -1;
  }

  // The ball went out of play: code -3 over a touchline (throw-in to the other team), -4 over a goal line (a corner
  // when the defending team touched it last, otherwise a goal kick).
  function onOut(code) {
    var m = World.match;
    var ball = World.ball;
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
    var defending = NS.attack(0) === gs ? 1 : 0; // the team defending that goal
    m.setX = gs * HALF_W;
    if (last === defending) {
      m.setPiece = 4;
      m.setTeam = 1 - defending;
      m.setPieceTimer = 0.8;
      if (NS.dbg) NS.dbg('corner_won', m.setTeam);
      if (NS.Stats) NS.Stats.corner(m.setTeam);
      NS.Audio.whistle(0);
      NS.HUD.banner(NS.I18n.t('hud.corner'), '', 1.0);
    } else {
      m.setPiece = 5;
      m.setTeam = defending;
      m.setPieceTimer = 0.6;
      if (NS.dbg) NS.dbg('goal_kick_won', m.setTeam);
    }
  }

  // An offside player played the ball: an indirect free kick to the other team where he was.
  function onOffside(q) {
    var m = World.match;
    if (m.setPieceTimer > 0 || breakKind || m.penalty) return;
    stopPlay();
    if (NS.dbg) NS.dbg('offside_caught', q.team);
    if (NS.Stats) NS.Stats.offside(q.team);
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

  // The outfield player of team t nearest to (x, z), skipping `skip`.
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

  // Corner kick: the taker at the flag, the best headers in the box with a marker each, the keeper on his line.
  var CORNER_SPOTS = [[6, -1.5], [8.5, 3], [11, -0.5], [5, 5.5], [13, -6], [14.5, 5]];
  function setupCorner(t, taker) {
    var m = World.match;
    var players = World.players;
    var gs = m.setX > 0 ? 1 : -1;      // the goal being attacked
    var sz = m.setZ > 0 ? 1 : -1;      // the corner's side
    var goalX = gs * HALF_W;
    var cx = gs * (HALF_W - 0.3), cz = sz * (HALF_H - 0.3);
    // taker just outside the corner, the ball at his feet on the arc
    taker.pos.set(cx + gs * 0.7, 0, cz + sz * 0.7);
    taker.facing = Math.atan2(-gs, -sz);
    taker.carry = Math.sqrt(0.98);
    // attackers into the box: forwards first, then by heading ability; two stay back
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
        p.pos.set(gs * (HALF_W - 32 - (i % 2) * 10), 0, (i % 2 ? 1 : -1) * 9); // the ones staying back
      }
      p.facing = Math.atan2(cx - p.pos.x, cz - p.pos.z);
    }
    // defenders: one goal-side of each attacker in the box, one at the near post, the rest at the edge of the box
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
      if (edge === 0) p.pos.set(goalX - gs * 1.2, 0, sz * 4.4); // near post
      else p.pos.set(goalX - gs * (NS.BOX_D + 1 + (edge % 2) * 3), 0, ((edge * 7) % 24) - 12);
      p.facing = Math.atan2(cx - p.pos.x, cz - p.pos.z);
      edge++;
    }
  }

  // Sets the restart up when the referee has stopped play: free kick, penalty, throw-in, corner, goal kick, offside.
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
      p.wX = p.pos.x; p.wZ = p.pos.z; // where he is now (the walk starts here)
      p.vel.set(0, 0, 0);
      p.stun = 0; p.tackleT = 0; p.slideT = 0; p.lungeT = 0; p.runToT = 0; p.throwIn = false; p.gkHands = false;
    }
    var taker = m.setTaker;
    var bx = m.setX, bz = m.setZ;
    m.restart = 0;
    m.restartT = 0;
    if (kind === 2) {
      // penalty: the spot 11 m out, the taker behind the ball, the keeper on his line, everybody else outside the box
      var goalX = a * HALF_W;
      bx = goalX - a * NS.PEN_D;
      bz = 0;
      var best = null;
      for (i = 0; i < players.length; i++) { p = players[i]; if (p.team === t && p.role === 'FWD') { best = p; break; } }
      taker = best || taker;
      var k = 0;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p === taker) continue;
        if (p.role === 'GK' && p.team !== t) { p.pos.set(goalX - a * 0.6, 0, 0); p.facing = a > 0 ? -Math.PI / 2 : Math.PI / 2; continue; }
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
      // throw-in: from the touchline where it went out, the ball over the taker's head, facing into the pitch
      var sz = bz > 0 ? 1 : -1;
      bz = sz * HALF_H;
      taker = nearestOf(t, bx, bz, null);
      taker.pos.set(bx, 0, sz * (HALF_H + 0.45));
      taker.facing = sz > 0 ? Math.PI : 0;
      m.restart = 3;
    } else if (kind === 4) {
      taker = nearestOf(t, bx, bz, null);
      setupCorner(t, taker);
      m.restart = 4;
    } else if (kind === 5) {
      // goal kick: from the edge of the goal area, taken by the keeper; the opponents leave the box
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
      // free kick (a foul, or offside): opponents at least 9 m from the ball
      taker = taker || nearestOf(t, bx, bz, null);
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.team === t) continue;
        var dx = p.pos.x - bx, dz = p.pos.z - bz;
        var dd = Math.sqrt(dx * dx + dz * dz);
        if (dd < 9) {
          if (dd < 0.1) { dx = -a; dz = 0; dd = 1; }
          p.pos.x = clamp(bx + dx / dd * 9, -HALF_W + 1, HALF_W - 1);
          p.pos.z = clamp(bz + dz / dd * 9, -HALF_H + 1, HALF_H - 1);
        }
      }
      m.restart = 1; // he has to play it (pass or shot), not run with it
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
    if (m.restart) m.protectT = 99; // nobody comes near the taker until he has played it
    m.setPiece = 0;
    NS.HUD.hideBanner();
    NS.Input.clearEdges();
    if (walk) {
      // the places just set up are where they walk to: everybody starts from where he was
      for (i = 0; i < players.length; i++) {
        p = players[i];
        var fx = p.wX, fz = p.wZ;
        p.wX = p.pos.x; p.wZ = p.pos.z; p.wF = p.facing;
        p.pos.x = fx; p.pos.z = fz;
      }
      walkBallY = ball.pos.y;
      ball.pos.y = R; // the ball waits on the ground at the spot
      walking = true;
      walkT = 0;
    }
    for (i = 0; i < players.length; i++) { players[i].mesh.root.rotation.y = players[i].facing; animate(players[i], 0); }
  }

  // At the end of a half the referee lets an attack finish: the ball with a team in its last third, a shot or a
  // pass on its way there, a corner or penalty still to be taken (up to EXTRA_MAX seconds).
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

    // The squads for the next match: the team size from the settings, each slot filled by a player of that position.
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

    // Builds the 14 player meshes for the selected teams (only at match start).
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
      var kits = NS.Teams.matchKits(homeT, awayT); // away kit when the colours clash
      for (var t = 0; t < 2; t++) {
        var dir = NS.attack(t);
        var td = t === 0 ? kits.home : kits.away;
        var layout = layoutOf(t);
        var names = s.rosters[t];
        for (i = 0; i < layout.length; i++) {
          var slot = layout[i];
          var gk = slot.role === 'GK';
          var mesh = NS.Assets.createPlayer(gk ? 'SOLID' : td.pattern, gk ? kits.gk[t] : td.c1, td.c2,
            td.shorts, SKIN[(i + t) % SKIN.length], lit);
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
            // animation timers
            kickT: 0, kickHard: false, lungeT: 0, slideT: 0, fallT: 0, diveT: 0, diveRoll: 0, headT: 0, catchT: 0,
            gkHands: false, diveCd: 0, diveHigh: false, mood: 0, celX: 0, celZ: 0, slid: false,
            fouls: 0, card: 0, // yellow cards, and the card shown: 2 yellow, 3 red (sent off)
            throwIn: false, throwT: 0, shoulderT: 0, shoulderDir: 1, shCd: 0, offside: false,
            // AI brain state
            mark: null, icX: 0, icZ: 0, drX: 0, drZ: 0, runT: 0, runCd: 0, runX: 0, runZ: 0,
            aiT: 0, tgtX: 0, tgtZ: 0, tgtS: 8, gkRT: 0,
            st: null, mSpd: 1, drain: 1
          });
          rate(World.players[World.players.length - 1], t === 0 ? homeT : awayT);
        }
      }
      NS.HUD.setTeams(homeT, awayT, kits.home.c1, kits.away.c1);
      World.kitColors = [kits.home.c1, kits.away.c1]; // (the full-time screen)
      if (ref) { NS.Scene.remove(ref.mesh.root); NS.Assets.disposePlayer(ref.mesh); }
      var rm = NS.Assets.createPlayer('SOLID', kits.ref, kits.ref, 0x111111, SKIN[1], lit);
      NS.Scene.add(rm.root);
      ref = {
        mesh: rm, pos: rm.root.position, vel: new THREE.Vector3(), facing: 0, index: 0, animPhase: 0, mood: 0, stun: 0,
        kickT: 0, kickHard: false, lungeT: 0, slideT: 0, fallT: 0, diveT: 0, diveRoll: 0, diveHigh: false, headT: 0, catchT: 0,
        gkHands: false, throwIn: false, throwT: 0, shoulderT: 0, shoulderDir: 1
      };
    },

    // Roster / formation edits during a match: update data in place, players keep their position.
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
        p.mood = 0; p.slid = false; p.throwIn = false; p.throwT = 0; p.shoulderT = 0; p.offside = false;
        animate(p, 0);
        p.mark = null; p.drX = 0; p.drZ = 0; p.runT = 0; p.runCd = 0; p.aiT = 0; p.gkRT = 0; p.stamina = Math.min(100, p.stamina + 30); p.gkHold = 0;
      }
      World.pressT[0] = 0;
      World.pressT[1] = 0;
      walking = false;
      if (ref) { ref.pos.set(-3, 0, -12); ref.vel.set(0, 0, 0); ref.facing = 0; }
      m.setPieceTimer = 0; m.setPiece = 0; m.penalty = false; m.protectT = 0; m.restart = 0; m.setTaker = null;
      World.ball.offTeam = -1;
      // the kicking-off team starts with the ball in the centre circle
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
        // the kick-off is played like a real one: he stands at the ball and passes it (nobody comes in before)
        m.restart = 6;
        m.restartT = 0;
        m.setTaker = kicker;
        m.protectT = 99;
        kicker.aiT = 0;
      }
      assignKickoffCursors();
      lastOwner = World.ball.owner;
      NS.Input.clearEdges();
      m.kickoffTimer = 1.0;
      NS.Audio.whistle(0);
    },

    start: function () {
      var m = World.match;
      // the team size of the settings (squads re-picked when it changed since they were made)
      if (NS.TEAM_SIZE !== World.settings.teamSize) {
        NS.useTeamSize(World.settings.teamSize);
        this.refitRoster(0);
        this.refitRoster(1);
      }
      // the stadium of the settings (its pitch size)
      if (NS.stadiumId !== World.settings.stadium) {
        NS.usePitch(World.settings.stadium);
        NS.Scene.rebuildStadium();
      }
      if (!(NS.Debug && NS.Debug.running())) NS.Scene.newPitchDesign(); // a different grass pattern every match
      configureSlots();
      // ends: home on the left in the first half, or drawn at random (Gameplay setting); the teams swap them at half time
      m.dir[0] = World.settings.randomEnds && Math.random() < 0.5 ? -1 : 1; m.dir[1] = -m.dir[0];
      if (NS.Aima) NS.Aima.matchStart();
      this.rebuildTeams();
      // the match's statistics, and its replays (not in debug matches: they are never watched)
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
      m.extra = 0;
      m.warned[0] = false; m.warned[1] = false;
      // coin toss: either team may kick off; the other one kicks off the second half
      m.firstKick = Math.random() < 0.5 ? 0 : 1;
      World.kickoffTeam = m.firstKick;
      m.celebrationTimer = 0;
      m.fullTimeTimer = 0;
      breakKind = 0; // a restart from the pause menu during a goal / half-time break
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
      NS.HUD.hideHint(); // nothing written over the play: only goals, fouls and half / full time when play stops
      NS.HUD.show(true);
      NS.HUD.applySettings(World.settings);
      NS.Audio.crowd(true);
    },

    // Back to the main menu (abandon or after full time).
    // finished = the match went the distance (a competition records it); otherwise it was abandoned.
    exitToMenu: function (finished) {
      var m = World.match;
      m.running = false;
      m.paused = true;
      m.fullTimeTimer = 0;
      m.celebrationTimer = 0;
      breakKind = 0;
      NS.Audio.crowd(false);
      NS.HUD.show(false);
      NS.HUD.hideGoalFx();
      NS.Scene.setRing(0, false, 0, 0);
      NS.Scene.setRing(1, false, 0, 0);
      NS.Scene.setRing(2, false, 0, 0);
      NS.Scene.setRing(3, false, 0, 0);
      if (NS.Aima && finished !== true) NS.Aima.matchEnd(false);
      if (NS.Replay && NS.Replay.active()) NS.Replay.stop();
      var inComp = NS.Comp && NS.Comp.active();
      if (inComp && finished === true) NS.Comp.recordUserMatch(m.score[0], m.score[1]);
      // full time: the result and the match's statistics (then the competition / the main menu from there)
      if (finished === true) NS.UI.show('RESULT');
      else NS.UI.show(inComp ? 'COMPHUB' : 'MAIN');
    },

    // Controller sides changed from the pause menu: apply to the running match.
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

      if (m.celebrationTimer > 0) {
        m.celebrationTimer -= dt;
        breakStep(dt, settings.cameraMode);
        if (m.celebrationTimer <= 0) {
          var goalBreak = breakKind === 1, self = this;
          NS.HUD.hideBanner(); NS.HUD.hideGoalFx(); breakKind = 0;
          // the goal again (Settings > Goal replays), then the kick-off
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
      // the referee stopped play for a foul: players slow down, then the free kick / penalty is set up
      if (m.setPieceTimer > 0) {
        m.setPieceTimer -= dt;
        // ball out: it runs on and the players jog on; a foul / offside: everybody stops for the whistle
        var outK = m.setPiece >= 3 && m.setPiece <= 5;
        var damp = outK ? 0.97 : 0.9;
        for (i = 0; i < n; i++) {
          p = players[i]; p.vel.x *= damp; p.vel.z *= damp;
          // (they stop at the lines: nobody jogs on off the pitch after the ball)
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
        walkStep(dt);
        refStep(dt);
        NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        return;
      }
      refStep(dt);
      if (m.protectT > 0) m.protectT -= dt;
      if (m.restart) {
        m.restartT += dt;
        if (ball.owner !== m.setTaker) {
          m.restart = 0;
          m.protectT = 0;
        } else if (m.restartT > 10) {
          if (NS.dbg) NS.dbg('restart_auto_played_10s', m.setTaker.team, m.restart);
          Actions.kick(m.setTaker, m.restart === 5 ? ACT.LONG : ACT.PASS, 0.5, NS.attack(m.setTaker.team), 0, 1);
        }
      }
      // the penalty has been struck: the keeper has to guess, then everybody plays on
      if (m.penalty && ball.owner !== m.setTaker && (ball.owner === null || ball.owner.team !== m.setTeam)) {
        m.penalty = false;
        if (NS.dbg) NS.dbg('penalty_taken', m.setTeam);
        if (!ball.owner) penaltyGuess(m.setTeam);
      }

      // ----- clock -----
      m.timeSeconds += dt * (90 / settings.durationMins);
      var mins = Math.floor(m.timeSeconds / 60);
      var whole = Math.floor(m.timeSeconds);
      if (whole !== lastSecond) { lastSecond = whole; NS.HUD.setClock(mins, whole % 60); }
      var over = mins >= (m.half === 1 ? 45 : 90);
      if (over && attackOn() && m.extra < EXTRA_MAX) { m.extra += dt; over = false; }
      if (over) m.extra = 0;
      if (over && m.half === 2) { finish(); return; }
      if (over && m.half === 1) {
        m.half = 2;
        m.dir[0] = -m.dir[0]; m.dir[1] = -m.dir[1]; // the teams change ends
        swapHomes();
        World.kickoffTeam = 1 - m.firstKick;
        m.celebrationTimer = 3.4; // the players walk off, then the second-half kickoff
        breakKind = 2;
        breakClock = 0;
        scorer = null;
        setMoods(2, -1);
        NS.Audio.whistle(1);
        NS.HUD.banner(NS.I18n.t('hud.halftime'), m.score[0] + ' - ' + m.score[1], 0);
        return;
      }

      // ----- timers, distances, ranks -----
      for (i = 0; i < n; i++) {
        p = players[i];
        if (p.stun > 0) p.stun -= dt;
        if (p.tackleCd > 0) p.tackleCd -= dt;
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

      // ----- humans (and AI.MA, who plays like one) -----
      syncAiSlots();
      if (NS.Aima) NS.Aima.poll(dt);
      // the ball changed hands: a human team takes control of its new carrier straight away
      if (ball.owner !== lastOwner) {
        lastOwner = ball.owner;
        Controls.claimBall(lastOwner);
      }
      Controls.autoAssign(dt, false);
      for (i = 0; i < 2; i++) {
        var slot = World.slots[i];
        if (!slot.active || !slot.player) continue;
        slot.player.isCtl = true;
        Controls.update(slot, dt);
        if (slot.player) slot.player.isCtl = true;
        if (NS.Aima) NS.Aima.observe(slot, dt); // the trainer's play teaches AI.MA
      }
      // checkoAI: its network plays every outfield player of its team (each one with his own virtual controller)
      if (NS.Aima) { NS.Aima.driveTeam(0, dt); NS.Aima.driveTeam(1, dt); }
      for (i = 0; i < 2; i++) {
        if (World.slots[i].active && World.slots[i].player) World.slots[i].player.isCtl = true;
      }

      // ----- everyone else, then movement -----
      var profs0 = profFor(0);
      var profs1 = profFor(1);
      AI.teamUpdate(dt, [profs0, profs1]);
      for (i = 0; i < n; i++) {
        p = players[i];
        var prof = p.team === 0 ? profs0 : profs1;
        if (p.tackleT > 0) {
          Actions.updateTackle(p, dt, p.tackleHuman ? 0.75 : prof.tackle);
        } else if (p.stun > 0) {
          p.vel.x *= 0.85;
          p.vel.z *= 0.85;
        } else if (m.penalty && p !== ball.owner && p.role !== 'GK') {
          p.vel.x = 0; p.vel.z = 0; // a penalty: everybody waits outside the box
        } else if (!p.isCtl) {
          AI.step(p, dt, p.rank, prof, World.pressT[p.team] > 0);
        }

        // pace from his Speed rating, less when he is tired; stamina drains when he runs hard (his Stamina rating)
        var pace = p.mSpd * fatigue(p);
        if (!p.isCtl) {
          var run = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
          if (run > 6.5) p.stamina = Math.max(5, p.stamina - (run - 6.5) * 0.325 * dt * p.drain);
          else p.stamina = Math.min(100, p.stamina + 0.9 * dt * (1.6 - p.drain));
        }
        var nx = p.pos.x + p.vel.x * dt * pace;
        var nz = p.pos.z + p.vel.z * dt * pace;
        // (a CPU player stays inside the lines; a human may run a step over them)
        var over = p.isCtl ? 1.5 : 0.3;
        p.pos.x = clamp(nx, -HALF_W - over, HALF_W + over);
        p.pos.z = clamp(nz, -HALF_H - over, HALF_H + over);
        // a goal kick: the opponents stay out of the box until it is taken
        if (m.restart === 5 && p.team !== m.setTeam) {
          var ownX = -NS.attack(m.setTeam) * HALF_W;
          if (Math.abs(p.pos.x - ownX) < NS.BOX_D + 1 && Math.abs(p.pos.z) < NS.BOX_HW + 1) p.pos.x = ownX - (ownX > 0 ? 1 : -1) * (NS.BOX_D + 1);
        }
        p.mesh.root.rotation.y = p.facing;
        animate(p, dt);
      }

      // ----- bodies: players cannot run through each other (defenders really block the carrier) -----
      for (i = 0; i < n; i++) {
        p = players[i];
        for (j = i + 1; j < n; j++) {
          var q2 = players[j];
          var cx = q2.pos.x - p.pos.x;
          var cz = q2.pos.z - p.pos.z;
          var cd2 = cx * cx + cz * cz;
          if (cd2 >= 1.44 || cd2 < 1e-6) continue;
          var cd = Math.sqrt(cd2);
          var nx = cx / cd, nz = cz / cd;
          var push = (1.2 - cd) * (p.team !== q2.team ? 0.5 : 0.3);
          p.pos.x -= nx * push; p.pos.z -= nz * push;
          q2.pos.x += nx * push; q2.pos.z += nz * push;
          // the one running into the other loses that part of its speed
          var vp = p.vel.x * nx + p.vel.z * nz;
          if (vp > 0) { p.vel.x -= nx * vp * 0.6; p.vel.z -= nz * vp * 0.6; }
          var vq = -(q2.vel.x * nx + q2.vel.z * nz);
          if (vq > 0) { q2.vel.x += nx * vq * 0.6; q2.vel.z += nz * vq * 0.6; }
        }
      }

      // ----- loose ball: keeper saves, then the CLOSEST player in reach gets it (fair for both teams) -----
      if (!ball.owner) {
        var bs2 = ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z;
        var taker = null;
        var takerD = 1.35;
        var gkActed = false;
        for (i = 0; i < n; i++) {
          p = players[i];
          if (p.stun > 0 || p.tackleT > 0) continue;
          if (p === ball.kicker && ball.kickerT > 0) continue;
          var ddx = ball.pos.x - p.pos.x;
          var ddz = ball.pos.z - p.pos.z;
          var d2 = ddx * ddx + ddz * ddz;
          if (p.role === 'GK' && ball.lastTouchTeam !== p.team && inOwnBox(p.team)) {
            // a diving keeper reaches much further (full stretch, hands up to the top corner)
            var gkReach = p.diveT > 0 ? 7.3 : 3.8; // squared: ~1.95 standing, ~2.7 at full stretch
            // the save is decided when the ball passes him (its closest point), or at once when it is on top of him
            var rv = -(ddx * ball.vel.x + ddz * ball.vel.z);
            var passing = d2 < 2.2 || rv <= bs2 * dt * 1.5; // rv > 0 while it still comes closer
            if (d2 < gkReach && passing && ball.pos.y < (p.diveT > 0 ? 3.9 : 3.4) && !(ball.gkTried & (1 << p.team))) {
              ball.gkTried |= 1 << p.team;
              gkActed = true;
              var speed = Math.sqrt(bs2);
              // a shot wide of the keeper: he dives to that side
              var sdx = ball.pos.x - p.pos.x, sdz = ball.pos.z - p.pos.z;
              var sideX = sdx * Math.cos(p.facing) - sdz * Math.sin(p.facing); // + = his local +x side
              if (p.diveT <= 0 && speed >= 12 && (sideX > 0.7 || sideX < -0.7)) {
                p.diveT = 0.75;
                p.diveRoll = sideX > 0 ? -1.25 : 1.25;
                p.vel.z += clamp(sdz * 5, -8, 8);
              }
              // placement matters most: at the keeper = nearly always kept out, the corners are hard
              // (a dive covers part of the distance); pace above 30 makes every save harder
              var reach = Math.sqrt(d2) - (p.diveT > 0 ? 1.0 : 0);
              var place = reach <= 0.65 ? 0.14 : -(reach - 0.65) * 0.34;
              var keeper = gkSkill(p.team) * 0.5 + (0.4 + p.st.def / 99 * 0.5) * 0.5;
              // from range he has time to see it and get across: the further out it was struck, the likelier the save
              // (never quite certain: even a great keeper lets one in now and then)
              var range = clamp(((ball.shotD || 0) - 13) * 0.02, 0, 0.25);
              // (a human keeper: even a shot at him is not always kept out, a good one in the corner usually goes in)
              var chance = speed < 12 ? 1 : clamp(keeper + 0.05 + place + range - Math.max(0, speed - 34) * 0.01, 0.12, 0.9);
              if (ball.chip) chance *= 0.4;
              if (ball.pen) chance *= 0.55;
              if (Math.random() < chance) {
                if (NS.Stats) NS.Stats.save(p.team);
                if (speed < (p.diveT > 0 ? 30 : 25) - (ball.pos.y > 2.3 ? 4 : 0)) { // a diving keeper holds on to harder shots; high ones are tipped
                  if (NS.dbg) NS.dbg('gk_catch', p.team);
                  takeBall(p);
                  p.gkHands = true; // caught: held in the hands
                  p.catchT = 0.4;
                  if (speed > 22) NS.Audio.ooh();
                } else {
                  NS.Audio.ooh();
                  Actions.touch(p);
                  ball.fromX = ball.pos.x; ball.fromZ = ball.pos.z; ball.age = 0; ball.headed = false;
                  // parried: tipped round the post / over the bar (a corner) when it was heading for a corner of the
                  // goal, otherwise pushed back out in front of him
                  var wide = Math.abs(ball.pos.z) > 2.5 || ball.pos.y > 2.3;
                  if (NS.dbg) NS.dbg(Math.abs(ball.pos.z) > 2.5 || ball.pos.y > 2.3 ? 'gk_parry_wide_shot' : 'gk_parry_central_shot', p.team);
                  if (Math.random() < (wide ? 0.7 : 0.35)) {
                    if (NS.dbg) NS.dbg('gk_tip_behind', p.team);
                    var side = ball.pos.z > 0.2 ? 1 : (ball.pos.z < -0.2 ? -1 : (Math.random() < 0.5 ? -1 : 1));
                    ball.vel.x = (ball.vel.x > 0 ? 1 : -1) * (2.5 + Math.random() * 2); // slowly on, well wide of the post
                    ball.vel.z = side * (8 + Math.random() * 4);
                    ball.vel.y = ball.pos.y > 2.3 ? 7 : 2.5;
                  } else {
                    ball.vel.x = -ball.vel.x * 0.4;
                    ball.vel.z += (Math.random() - 0.5) * 9;
                    ball.vel.y = 3;
                  }
                  ball.pickupCooldown = 0.2;
                  ball.lastTouchTeam = p.team;
                  NS.Audio.kick(false);
                }
              } else if (NS.dbg) NS.dbg('gk_beaten_in_reach', p.team);
              break;
            }
          } else if (ball.pickupCooldown <= 0 && (ball.pos.y < 1.9 ? d2 < takerD : (ball.pos.y < 2.6 && d2 < Math.min(takerD, 0.6)))) {
            // at his feet, or a ball at chest height that hits his body
            takerD = d2;
            taker = p;
          }
        }
        // headers: CPU players head balls at head height (clear the opponents' balls, attack near the goal);
        // a ball from a team-mate is brought down instead
        if (!gkActed && ball.pos.y > 1.5 && ball.pos.y < 3.6 && ball.vel.y < 0) {
          for (i = 0; i < n; i++) {
            p = players[i];
            // humans head the ball themselves (their team-mates never do it for them)
            if (p.role === 'GK' || p.isCtl || humanTeam(p.team) || p.tackleT > 0) continue;
            if (!Actions.canHead(p)) continue; // in reach, and nobody closer to the ball
            var att = NS.attack(p.team);
            var toGoal = Math.abs(att * HALF_W - p.pos.x) + Math.abs(p.pos.z) * 0.5;
            var shotOn = toGoal < 18 && p.role !== 'DEF';
            if (ball.lastTouchTeam === p.team && !shotOn) continue;
            var clear = ball.lastTouchTeam !== p.team && Math.abs(-att * HALF_W - p.pos.x) < 30;
            var byLine = Math.abs(-att * HALF_W - p.pos.x) < 11;
            if (clear && byLine && Math.random() < 0.45) {
              // under pressure at his own goal line he can only get a touch on it: it goes behind (a corner)
              if (Actions.knockOff(p, false)) return;
              if (NS.dbg) NS.dbg('header_put_behind', p.team);
              ball.vel.set(-att * (5 + Math.random() * 6), 3 + Math.random() * 3, (p.pos.z >= 0 ? 1 : -1) * (2 + Math.random() * 6));
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
          // a hard shot is not controlled by an outfield player: it hits him and deflects; anything else is a first
          // touch that can go wrong (Actions.controls)
          var hardHit = ball.hard && bs2 > 324;
          if (hardHit && NS.dbg) NS.dbg('shot_hit_outfield_player', taker.team);
          if (hardHit || !Actions.controls(taker)) {
            if (Actions.knockOff(taker, hardHit)) return;
          } else {
            takeBall(taker);
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
      // rolling without slipping: angle = distance / radius
      ballRotX += ball.vel.z * dt / R;
      ballRotZ -= ball.vel.x * dt / R;
      NS.Scene.setBall(ball.pos, ballRotX, ballRotZ);
      NS.Scene.trail(ball.hard && !ball.owner, ball.pos); // streak behind a shot
      if (World.netHit) { NS.Scene.netHit(World.netHit); World.netHit = 0; }
      if (scored >= 0) triggerGoal(scored);
      else if (scored <= -3) onOut(scored);

      // crowd: louder and brighter the closer the ball is to a goal, flat out on a shot
      dangerT -= dt;
      if (dangerT <= 0) {
        dangerT = 0.2;
        var toGoal = HALF_W - Math.abs(ball.pos.x);
        var danger = clamp(1 - toGoal / 32, 0, 1) * clamp(1.25 - Math.abs(ball.pos.z) / HALF_H, 0.35, 1);
        if (ball.hard && !ball.owner) danger = 1;
        NS.Audio.tick(0.2, danger);
      }

      for (i = 0; i < 2; i++) {
        var sl = World.slots[i];
        // the arrow blinks while the player is receiving a pass (the receive assist is on)
        if (sl.active && sl.player) NS.Scene.setRing(i, true, sl.player.pos.x, sl.player.pos.z,
          !ball.owner && (ball.receiver === sl.player || ball.contester === sl.player));
        else NS.Scene.setRing(i, false, 0, 0);
        // AI.MA's arrow (violet)
        var al = World.aiSlots[i];
        if (al.active && al.player) NS.Scene.setRing(2 + i, true, al.player.pos.x, al.player.pos.z, false);
        else NS.Scene.setRing(2 + i, false, 0, 0);
      }
      NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
    },

    // Per rendered frame (not per step): plates, power bar, radar.
    drawHud: function (dt) {
      var s0 = World.slots[0];
      var s1 = World.slots[1];
      var a0 = World.aiSlots[0], a1 = World.aiSlots[1];
      // each team's box: its player (P1 / P2), else its checkoAI, else the CPU
      for (var t = 0; t < 2; t++) {
        var hs = s0.active && s0.team === t ? s0 : (s1.active && s1.team === t ? s1 : null);
        var as = t === 0 ? a0 : a1;
        if (hs) NS.HUD.plate(t, hs === s0 ? labels.p1 : labels.p2, hs.player, hs);
        else if (as.active && as.player) NS.HUD.plate(t, 'checkoAI', as.player, as.player.aiv || as);
        else NS.HUD.plate(t, labels.cpu, featured(t), null);
      }
      NS.HUD.aima(a0.active || a1.active);
      if (World.settings.showRadar) NS.HUD.radar(World.players, World.ball, World.slots);
      // the ball behind a player box or the radar: fade that box out
      NS.Scene.project(World.ball.pos);
      NS.HUD.cover(NS.Scene.px, NS.Scene.py);
      NS.HUD.tick(dt);
    },

    // Static meshes need to match the ball after a rebuild-less reset (menu background).
    syncBall: function () {
      NS.Scene.setBall(World.ball.pos, ballRotX, ballRotZ);
    }
  };

  Actions.onFoul = onFoul;
  Actions.onOffside = onOffside;
  NS.Match = Match;
})(window.RS6 = window.RS6 || {});
