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

  var SKIN = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xc68642];
  var ballRotX = 0;
  var ballRotZ = 0;
  var labels = { p1: 'P1', p2: 'P2', cpu: 'CPU' };
  var lastSecond = -1;
  var lastOwner = null;
  // breaks without freezing: 1 = goal celebration, 2 = half time, 3 = full time
  var breakKind = 0;
  var scorer = null;
  var breakClock = 0;
  var dangerT = 0;
  var R = NS.BALL_R;
  var PI = Math.PI;

  function ease(u) { return u < 0 ? 0 : (u > 1 ? 1 : u * u * (3 - 2 * u)); }

  // Pose of one player for this step (rotations only, no allocation). Priority: dive, slide, fall, lunge, kick, run.
  function animate(p, dt) {
    var mesh = p.mesh;
    if (p.kickT > 0) p.kickT -= dt;
    if (p.lungeT > 0) p.lungeT -= dt;
    if (p.slideT > 0) p.slideT -= dt;
    if (p.fallT > 0) p.fallT -= dt;
    if (p.diveT > 0) p.diveT -= dt;
    if (p.headT > 0) p.headT -= dt;
    if (p.catchT > 0) p.catchT -= dt;

    var sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    var run = sp > 0.5 ? clamp(sp / 12, 0, 1) : 0;
    if (sp > 0.5) p.animPhase += dt * (5 + sp * 0.75);
    var sw = Math.sin(p.animPhase);
    var legL = sw * 0.8 * run;
    var legR = -legL;
    var armL = -legL * 0.85;
    var armR = -armL;
    var outL = 0.08, outR = 0.08;
    var lean = 0.2 * run;
    var roll = 0;
    var hipY = 0.9 + Math.abs(Math.cos(p.animPhase)) * 0.07 * run;
    var u, b;

    if (p.diveT > 0) {
      // keeper dive: whole body falls to the side, arms stretched over the head (higher for a high shot)
      u = 1 - p.diveT / 0.8;
      b = ease(u / 0.25) * (1 - ease((u - 0.75) / 0.25));
      roll = p.diveRoll * b;
      hipY = 0.9 - 0.35 * b + (p.diveHigh ? 0.75 * Math.sin(clamp(u, 0, 1) * PI) : 0);
      armL = armR = -2.9 * b;
      outL = outR = 0.25 * b;
      legL = 0.2 * b; legR = -0.2 * b; lean = 0;
    } else if (p.headT > 0) {
      // header: jump, arch back, snap the head through the ball
      u = 1 - p.headT / 0.4;
      b = Math.sin(u * PI);
      hipY = 0.9 + 0.45 * b;
      lean = u < 0.45 ? -0.35 * (u / 0.45) : -0.35 + 0.85 * ((u - 0.45) / 0.55);
      lean *= b > 0.2 ? 1 : b / 0.2;
      legL = 0.35 * b; legR = 0.15 * b;
      armL = armR = -0.5 * b;
      outL = outR = 0.08 + 0.7 * b;
    } else if (p.catchT > 0) {
      // keeper catch: both hands up to the ball
      u = 1 - p.catchT / 0.4;
      b = Math.sin(clamp(u * 1.6, 0, 1) * PI * 0.5);
      armL = armR = -2.1 * b - 1.3 * (1 - b);
      outL = outR = 0.12;
      lean = -0.1 * b;
    } else if (p.slideT > 0) {
      // slide tackle: lean far back, hips near the grass, front leg out, back leg folded
      u = 1 - p.slideT / 0.85;
      b = ease(u / 0.15) * (1 - ease((u - 0.75) / 0.25));
      lean = -1.15 * b;
      hipY = 0.9 - 0.5 * b;
      legR = legR * (1 - b) - 0.35 * b;
      legL = legL * (1 - b) + 0.75 * b;
      armL = armL * (1 - b) - 0.5 * b; armR = armR * (1 - b) - 0.2 * b;
      outL = 0.08 + 0.9 * b; outR = 0.08 + 0.6 * b;
    } else if (p.fallT > 0) {
      // lost the ball in a tackle: knocked off balance
      u = 1 - p.fallT / 0.55;
      b = Math.sin(u * PI);
      lean = -0.45 * b;
      roll = 0.35 * b;
      hipY = 0.9 - 0.15 * b;
      outL = outR = 0.08 + 0.9 * b;
      legL = 0.3 * b; legR = -0.4 * b;
    } else if (p.lungeT > 0) {
      // standing tackle: lunge, front leg stretched to the ball
      u = 1 - p.lungeT / 0.36;
      b = Math.sin(clamp(u * 1.4, 0, 1) * PI * 0.5) * (1 - ease((u - 0.7) / 0.3));
      lean = 0.2 + 0.25 * b;
      legR = legR * (1 - b) - 1.15 * b;
      legL = legL * (1 - b) + 0.45 * b;
      hipY = 0.9 - 0.12 * b;
      outL = outR = 0.08 + 0.55 * b;
    } else if (p.kickT > 0) {
      // kick: back-swing then strike through the ball (bigger swing and lean-back for shots and long balls)
      var dur = p.kickHard ? 0.36 : 0.28;
      u = 1 - p.kickT / dur;
      var reach = p.kickHard ? 1.55 : 1.0;
      var k = u < 0.25 ? 0.5 + u / 0.25 * 0.5 : 1 - (u - 0.25) / 0.5 * (1 + reach);
      if (u > 0.75) k = -reach * (1 - (u - 0.75) / 0.25);
      legR = k;
      legL = 0.15;
      lean = p.kickHard ? (u < 0.25 ? 0.15 : -0.22) : 0.08;
      armL = 0.4; armR = -0.3;
      outL = 0.95; outR = 0.45;
      hipY = 0.9;
    } else if (p.mood === 1 || (p.mood === 4 && sp < 2.5)) {
      // celebrating: jumping, both arms up, waving
      b = Math.abs(Math.sin(breakClock * 7 + p.index));
      hipY = 0.9 + 0.38 * b;
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
      lean = 0.38; outL = outR = 0.02; armL *= 0.3; armR *= 0.3; hipY -= 0.04;
    } else if (p.mood === 3) {
      // on the knees
      hipY = 0.5; lean = 0.25; legL = -1.45; legR = -1.45; armL = armR = 0.15; outL = outR = 0.12;
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

  function humanTeam(team) {
    return (World.slots[0].active && World.slots[0].team === team) || (World.slots[1].active && World.slots[1].team === team);
  }

  // World.levels = ["HARD", "EASY"] lets each CPU team play at its own level (used by the balancing tests).
  function levelOf(team) { return World.levels ? World.levels[team] : World.settings.difficulty; }

  function profFor(team) {
    return humanTeam(team) ? AI.profiles.NORMAL : AI.profile(levelOf(team));
  }

  function configureSlots() {
    var mode = World.session.sideMode;
    var s0 = World.slots[0];
    var s1 = World.slots[1];
    s0.active = mode !== 'CPU_CPU';
    s0.team = 0;
    s1.active = mode === '1P_2P' || mode === 'COOP_CPU';
    s1.team = mode === '1P_2P' ? 1 : 0;
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
  }

  function featured(team) {
    var ball = World.ball;
    if (ball.owner && ball.owner.team === team) return ball.owner;
    return Actions.nearestToBall(team, null, null);
  }

  function takeBall(p) {
    var ball = World.ball;
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
  }

  // The ball is in `team`'s own penalty area (where its keeper may use his hands).
  function inOwnBox(team) {
    var ball = World.ball;
    var goalX = team === 0 ? -HALF_W : HALF_W;
    return Math.abs(ball.pos.x - goalX) < 18 && Math.abs(ball.pos.z) < 15.5;
  }

  function gkSkill(team) {
    return humanTeam(team) ? 0.74 : AI.profile(levelOf(team)).gkSave;
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
      var a = team === 0 ? 1 : -1;
      scorer.mood = 4;
      scorer.celX = a * (HALF_W - 2.5);
      scorer.celZ = (scorer.pos.z >= 0 ? 1 : -1) * (HALF_H - 2.5);
    }
    NS.Audio.goal();
    NS.HUD.setScore(m.score[0], m.score[1]);
    var who = k ? k.name : ball.lastToucher;
    var mins = Math.min(90, Math.floor(m.timeSeconds / 60) + 1);
    NS.HUD.goalFx(NS.I18n.t('hud.goalword'), (own ? NS.I18n.t('hud.owngoal') + ' ' : '') + who + '  ' + mins + "'", team);
    if (team === 0 && World.slots[0].active) NS.Storage.addResult(0, 1, 0);
    ball.owner = null;
    ball.receiver = null;
    ball.contester = null;
    ball.vel.multiplyScalar(0.7); // it carries on into the net
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
    if (World.slots[0].active) {
      var won = m.score[0] > m.score[1] ? 1 : 0;
      var cup = 0; // cups are counted when a competition is won (NS.Comp)
      NS.Storage.addResult(won, 0, cup);
      NS.Storage.submitMatchScore(m.score[0], m.score[1], cup);
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
    World.stepBall(dt);
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
  function onFoul(tackler, victim) {
    var m = World.match;
    var ball = World.ball;
    if (m.setPieceTimer > 0 || m.penalty || breakKind) return;
    var ownGoalX = tackler.team === 0 ? -HALF_W : HALF_W;
    var inBox = Math.abs(victim.pos.x - ownGoalX) < 18 && Math.abs(victim.pos.z) < 15.5;
    m.setPiece = inBox ? 2 : 1;
    m.setTeam = victim.team;
    m.setX = clamp(victim.pos.x, -HALF_W + 2, HALF_W - 2);
    m.setZ = clamp(victim.pos.z, -HALF_H + 2, HALF_H - 2);
    m.setTaker = victim;
    m.setPieceTimer = 1.6;
    ball.owner = null;
    ball.receiver = null;
    ball.contester = null;
    ball.vel.set(0, 0, 0);
    ball.hard = false;
    NS.Audio.whistle(0);
    NS.HUD.banner(NS.I18n.t(inBox ? 'hud.penalty' : 'hud.foul'), NS.I18n.t(inBox ? 'hud.penalty.sub' : 'hud.freekick'), 1.5);
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
    gk.facing = gk.team === 0 ? Math.PI / 2 : -Math.PI / 2;
    gk.vel.z = side * 13;
    gk.diveT = 0.8;
    gk.diveHigh = Math.random() < 0.3;
    gk.diveRoll = -side * Math.sin(gk.facing) > 0 ? -1.25 : 1.25;
  }

  // Sets the free kick / penalty up when the referee has stopped play.
  function startSetPiece() {
    var m = World.match;
    var ball = World.ball;
    var players = World.players;
    var t = m.setTeam;
    var a = t === 0 ? 1 : -1;
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.vel.set(0, 0, 0);
      p.stun = 0; p.tackleT = 0; p.slideT = 0; p.lungeT = 0; p.runToT = 0;
    }
    var taker = m.setTaker;
    if (m.setPiece === 2) {
      // penalty: the spot 11 m out, the taker behind the ball, the keeper on his line, everybody else outside the box
      var goalX = a * HALF_W;
      m.setX = goalX - a * 11;
      m.setZ = 0;
      var best = null;
      for (i = 0; i < players.length; i++) { p = players[i]; if (p.team === t && p.role === 'FWD') { best = p; break; } }
      taker = best || taker;
      var k = 0;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p === taker) continue;
        if (p.role === 'GK' && p.team !== t) { p.pos.set(goalX - a * 0.6, 0, 0); p.facing = a > 0 ? -Math.PI / 2 : Math.PI / 2; continue; }
        if (p.role === 'GK') continue;
        p.pos.set(goalX - a * (20 + (k % 3) * 1.5), 0, -12 + (k * 2.2) % 24);
        k++;
      }
      m.penalty = true;
      taker.aiT = 0;
    } else {
      // free kick: opponents at least 8 m from the ball
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.team === t) continue;
        var dx = p.pos.x - m.setX, dz = p.pos.z - m.setZ;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 8) {
          if (d < 0.1) { dx = -a; dz = 0; d = 1; }
          p.pos.x = clamp(m.setX + dx / d * 8, -HALF_W + 1, HALF_W - 1);
          p.pos.z = clamp(m.setZ + dz / d * 8, -HALF_H + 1, HALF_H - 1);
        }
      }
      m.protectT = 2.2;
    }
    taker.pos.set(m.setX - a * 0.95, 0, m.setZ);
    taker.facing = a > 0 ? Math.PI / 2 : -Math.PI / 2;
    taker.carry = 0.95;
    ball.pos.set(m.setX, R, m.setZ);
    takeBall(taker);
    ball.pickupCooldown = 0.3;
    m.setPiece = 0;
    NS.HUD.hideBanner();
    NS.Input.clearEdges();
  }

  var Match = {
    labels: function (l) { labels = l; },

    syncRosters: function () {
      var s = World.session;
      s.rosters[0] = NS.Teams.byId(s.homeTeamId).players.slice();
      s.rosters[1] = NS.Teams.byId(s.awayTeamId).players.slice();
    },

    // Builds the 14 player meshes for the selected teams (only at match start).
    rebuildTeams: function () {
      var i;
      for (i = 0; i < World.players.length; i++) {
        NS.Scene.remove(World.players[i].mesh.root);
        NS.Assets.disposePlayer(World.players[i].mesh);
      }
      World.players.length = 0;
      var s = World.session;
      var homeT = NS.Teams.byId(s.homeTeamId);
      var awayT = NS.Teams.byId(s.awayTeamId);
      var lit = NS.Scene.lit();
      var kits = NS.Teams.matchKits(homeT, awayT); // away kit when the colours clash
      for (var t = 0; t < 2; t++) {
        var dir = t === 0 ? 1 : -1;
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
          pos.set(slot.x * dir, 0, slot.z * dir);
          World.players.push({
            team: t, index: i, name: names[i] || ('PLAYER ' + slot.num), role: slot.role, num: slot.num,
            roleText: slot.role + ' #' + slot.num,
            homeX: slot.x * dir, homeZ: slot.z * dir,
            pos: pos, vel: new THREE.Vector3(),
            facing: t === 0 ? Math.PI / 2 : -Math.PI / 2,
            stamina: 100, animPhase: Math.random() * 6, mesh: mesh,
            stun: 0, tackleT: 0, tackleCd: 0, tackleHit: false, tackleHuman: false,
            runToX: 0, runToZ: 0, runToT: 0, aiCd: Math.random() * 0.3,
            carry: 0.95, dribbling: false, dBall: 0, rank: 0, gkHold: 0, isCtl: false,
            tackleSlide: false, returnTo: null, returnT: 0, returnExp: 0,
            // animation timers
            kickT: 0, kickHard: false, lungeT: 0, slideT: 0, fallT: 0, diveT: 0, diveRoll: 0, headT: 0, catchT: 0,
            gkHands: false, diveCd: 0, diveHigh: false, mood: 0, celX: 0, celZ: 0, slid: false,
            // AI brain state
            mark: null, icX: 0, icZ: 0, drX: 0, drZ: 0, runT: 0, runCd: 0, runX: 0, runZ: 0,
            aiT: 0, tgtX: 0, tgtZ: 0, tgtS: 8, gkRT: 0
          });
        }
      }
      NS.HUD.setTeams(homeT, awayT, kits.home.c1, kits.away.c1);
    },

    // Roster / formation edits during a match: update data in place, players keep their position.
    refreshFromSession: function () {
      var s = World.session;
      for (var i = 0; i < World.players.length; i++) {
        var p = World.players[i];
        var layout = layoutOf(p.team);
        var slot = layout[p.index];
        var dir = p.team === 0 ? 1 : -1;
        p.name = s.rosters[p.team][p.index] || ('PLAYER ' + slot.num);
        p.role = slot.role;
        p.num = slot.num;
        p.roleText = slot.role + ' #' + slot.num;
        p.homeX = slot.x * dir;
        p.homeZ = slot.z * dir;
      }
    },

    resetKickoff: function () {
      var m = World.match;
      World.resetBall();
      for (var i = 0; i < World.players.length; i++) {
        var p = World.players[i];
        p.pos.set(p.homeX, 0, p.homeZ);
        p.vel.set(0, 0, 0);
        p.facing = p.team === 0 ? Math.PI / 2 : -Math.PI / 2;
        p.stun = 0; p.tackleT = 0; p.tackleCd = 0; p.runToT = 0; p.returnTo = null; p.dribbling = false;
        p.kickT = 0; p.lungeT = 0; p.slideT = 0; p.fallT = 0; p.diveT = 0; p.headT = 0; p.catchT = 0; p.gkHands = false;
        p.mood = 0; p.slid = false;
        animate(p, 0);
        p.mark = null; p.drX = 0; p.drZ = 0; p.runT = 0; p.runCd = 0; p.aiT = 0; p.gkRT = 0; p.stamina = 100; p.gkHold = 0;
      }
      World.pressT[0] = 0;
      World.pressT[1] = 0;
      m.setPieceTimer = 0; m.setPiece = 0; m.penalty = false; m.protectT = 0;
      // the kicking-off team starts with the ball in the centre circle
      var kicker = null;
      for (var k = 0; k < World.players.length; k++) {
        var cand = World.players[k];
        if (cand.team === World.kickoffTeam && cand.role === 'FWD') { kicker = cand; break; }
      }
      if (kicker) {
        kicker.pos.set(kicker.team === 0 ? -0.95 : 0.95, 0, 0);
        kicker.carry = 0.95;
        World.ball.owner = kicker;
        World.ball.lastTouchTeam = kicker.team;
      }
      assignKickoffCursors();
      lastOwner = World.ball.owner;
      NS.Input.clearEdges();
      m.kickoffTimer = 1.0;
      NS.Audio.whistle(0);
    },

    start: function () {
      var m = World.match;
      configureSlots();
      this.rebuildTeams();
      m.score[0] = 0; m.score[1] = 0;
      m.timeSeconds = 0;
      m.half = 1;
      // coin toss: either team may kick off; the other one kicks off the second half
      m.firstKick = Math.random() < 0.5 ? 0 : 1;
      World.kickoffTeam = m.firstKick;
      m.celebrationTimer = 0;
      m.fullTimeTimer = 0;
      lastSecond = -1;
      this.resetKickoff();
      m.running = true;
      m.paused = false;
      NS.HUD.setComp(NS.I18n.t('comp.' + World.session.compType));
      NS.HUD.setScore(0, 0);
      NS.HUD.setClock(0, 0);
      NS.HUD.hideBanner();
      NS.HUD.show(true);
      NS.HUD.hint(NS.I18n.t('hud.hint'), 7);
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
      if (NS.Comp && NS.Comp.active()) {
        if (finished === true) NS.Comp.recordUserMatch(m.score[0], m.score[1]);
        NS.UI.show('COMPHUB');
      } else {
        NS.UI.show('MAIN');
      }
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
        if (m.celebrationTimer <= 0) { NS.HUD.hideBanner(); NS.HUD.hideGoalFx(); breakKind = 0; this.resetKickoff(); }
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
        for (i = 0; i < n; i++) { p = players[i]; p.vel.x *= 0.9; p.vel.z *= 0.9; p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; animate(p, dt); }
        if (m.setPieceTimer <= 0) startSetPiece();
        NS.Scene.followBall(dt, m.setX, m.setZ, settings.cameraMode);
        return;
      }
      if (m.protectT > 0) m.protectT -= dt;
      // the penalty has been struck: the keeper has to guess, then everybody plays on
      if (m.penalty && ball.owner !== m.setTaker && (ball.owner === null || ball.owner.team !== m.setTeam)) {
        m.penalty = false;
        if (!ball.owner) penaltyGuess(m.setTeam);
      }

      // ----- clock -----
      m.timeSeconds += dt * (90 / settings.durationMins);
      var mins = Math.floor(m.timeSeconds / 60);
      var whole = Math.floor(m.timeSeconds);
      if (whole !== lastSecond) { lastSecond = whole; NS.HUD.setClock(mins, whole % 60); }
      if (mins >= 90) { finish(); return; }
      if (mins >= 45 && m.half === 1) {
        m.half = 2;
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

      // ----- humans -----
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
        slot.player.isCtl = true;
      }
      for (i = 0; i < 2; i++) {
        if (World.slots[i].active && World.slots[i].player) World.slots[i].player.isCtl = true;
      }

      // ----- everyone else, then movement -----
      AI.teamUpdate(dt);
      var profs0 = profFor(0);
      var profs1 = profFor(1);
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

        var nx = p.pos.x + p.vel.x * dt;
        var nz = p.pos.z + p.vel.z * dt;
        p.pos.x = clamp(nx, -HALF_W + 1, HALF_W - 1);
        p.pos.z = clamp(nz, -HALF_H + 1, HALF_H - 1);
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
            var gkReach = p.diveT > 0 ? 7.3 : 4.4; // squared: ~2.1 standing, ~2.7 at full stretch
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
              var place = reach <= 0.7 ? 0.15 : -(reach - 0.7) * 0.28;
              var chance = speed < 12 ? 1 : clamp(gkSkill(p.team) + 0.04 + place - Math.max(0, speed - 30) * 0.012, 0.15, 0.96);
              if (ball.chip) chance *= 0.4;
              if (ball.pen) chance *= 0.55;
              if (Math.random() < chance) {
                if (speed < (p.diveT > 0 ? 34 : 28)) { // a diving keeper holds on to harder shots
                  takeBall(p);
                  p.gkHands = true; // caught: held in the hands
                  p.catchT = 0.4;
                  if (speed > 22) NS.Audio.ooh();
                } else {
                  NS.Audio.ooh();
                  ball.vel.x = -ball.vel.x * 0.4;
                  ball.vel.z += (Math.random() - 0.5) * 9;
                  ball.vel.y = 3;
                  ball.pickupCooldown = 0.2;
                  ball.lastTouchTeam = p.team;
                  NS.Audio.kick(false);
                }
              }
              break;
            }
          } else if (ball.pickupCooldown <= 0 && ball.pos.y < 1.9 && d2 < takerD) {
            takerD = d2;
            taker = p;
          }
        }
        // headers: CPU players head balls at head height (clear the opponents' balls, attack near the goal);
        // a ball from a team-mate is brought down instead
        if (!gkActed && ball.pos.y > 1.5 && ball.pos.y < 3.3 && ball.vel.y < 0) {
          for (i = 0; i < n; i++) {
            p = players[i];
            // humans head the ball themselves (their team-mates never do it for them)
            if (p.role === 'GK' || p.isCtl || humanTeam(p.team) || p.tackleT > 0) continue;
            if (!Actions.canHead(p)) continue; // in reach, and nobody closer to the ball
            var att = p.team === 0 ? 1 : -1;
            var toGoal = Math.abs(att * HALF_W - p.pos.x) + Math.abs(p.pos.z) * 0.5;
            var shotOn = toGoal < 18 && p.role !== 'DEF';
            if (ball.lastTouchTeam === p.team && !shotOn) continue;
            Actions.header(p, shotOn, ACT.PASS, att, 0);
            gkActed = true;
            taker = null;
            break;
          }
        }
        if (!gkActed && taker) {
          if (ball.hard && bs2 > 324) {
            // a hard shot is not controlled by an outfield player: it hits him and deflects
            ball.vel.x = -ball.vel.x * 0.25 + (Math.random() - 0.5) * 8;
            ball.vel.z = ball.vel.z * 0.35 + (Math.random() - 0.5) * 10;
            ball.vel.y = 1 + Math.random() * 4;
            ball.hard = false;
            ball.pickupCooldown = 0.2;
            ball.lastTouchTeam = taker.team;
            ball.kicker = taker;
            ball.kickerT = 0.25;
            NS.Audio.tackle();
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
          Actions.kick(hold, ACT.LONG, 0.8, hold.team === 0 ? 1 : -1, 0, 1);
        }
      }

      // ----- ball, goal, camera -----
      var scored = World.stepBall(dt);
      // rolling without slipping: angle = distance / radius
      ballRotX += ball.vel.z * dt / R;
      ballRotZ -= ball.vel.x * dt / R;
      NS.Scene.setBall(ball.pos, ballRotX, ballRotZ);
      NS.Scene.trail(ball.hard && !ball.owner, ball.pos); // streak behind a shot
      if (World.netHit) { NS.Scene.netHit(World.netHit); World.netHit = 0; }
      if (scored >= 0) { triggerGoal(scored); }

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
      }
      NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
    },

    // Per rendered frame (not per step): plates, power bar, radar.
    drawHud: function (dt) {
      var s0 = World.slots[0];
      var s1 = World.slots[1];
      if (s0.active) NS.HUD.plate(0, labels.p1, s0.player, s0);
      else NS.HUD.plate(0, labels.cpu, featured(0), null);
      if (s1.active) NS.HUD.plate(1, labels.p2, s1.player, s1);
      else NS.HUD.plate(1, labels.cpu, featured(1), null);
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
  NS.Match = Match;
})(window.RS6 = window.RS6 || {});
