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

  function triggerGoal(team) {
    var m = World.match;
    var ball = World.ball;
    m.score[team]++;
    World.kickoffTeam = 1 - team; // the team that conceded restarts
    m.celebrationTimer = 2.6;
    NS.Audio.goal();
    NS.HUD.setScore(m.score[0], m.score[1]);
    NS.HUD.banner(NS.I18n.t('hud.goal'), ball.lastToucher + ' (' + m.score[0] + ' - ' + m.score[1] + ')', 0);
    if (team === 0 && World.slots[0].active) NS.Storage.addResult(0, 1, 0);
    ball.owner = null;
    ball.vel.set(0, 0, 0);
  }

  function finish() {
    var m = World.match;
    m.fullTimeTimer = 3.6;
    NS.Audio.whistle();
    NS.HUD.banner(NS.I18n.t('hud.fulltime'), m.score[0] + ' - ' + m.score[1], 0);
    if (World.slots[0].active) {
      var won = m.score[0] > m.score[1] ? 1 : 0;
      var cup = (won && World.session.compType === 'CONTINENTAL_CUP') ? 1 : 0;
      NS.Storage.addResult(won, 0, cup);
      NS.Storage.submitMatchScore(m.score[0], m.score[1], cup);
      MyPC.announce(NS.I18n.t('hud.fulltime') + ' ' + m.score[0] + ' - ' + m.score[1]);
    }
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
            gkHands: false, diveCd: 0, diveHigh: false,
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
        animate(p, 0);
        p.mark = null; p.drX = 0; p.drZ = 0; p.runT = 0; p.runCd = 0; p.aiT = 0; p.gkRT = 0; p.stamina = 100; p.gkHold = 0;
      }
      World.pressT[0] = 0;
      World.pressT[1] = 0;
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
      NS.Audio.whistle();
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
    },

    // Back to the main menu (abandon or after full time).
    exitToMenu: function () {
      var m = World.match;
      m.running = false;
      m.paused = true;
      m.fullTimeTimer = 0;
      m.celebrationTimer = 0;
      NS.HUD.show(false);
      NS.Scene.setRing(0, false, 0, 0);
      NS.Scene.setRing(1, false, 0, 0);
      NS.UI.show('MAIN');
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
        if (m.celebrationTimer <= 0) { NS.HUD.hideBanner(); this.resetKickoff(); }
        NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        return;
      }
      if (m.fullTimeTimer > 0) {
        m.fullTimeTimer -= dt;
        if (m.fullTimeTimer <= 0) this.exitToMenu();
        return;
      }
      if (m.kickoffTimer > 0) {
        m.kickoffTimer -= dt;
        if (m.kickoffTimer <= 0) NS.Input.clearEdges();
        NS.Scene.followBall(dt, ball.pos.x, ball.pos.z, settings.cameraMode);
        return;
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
        m.celebrationTimer = 2.2; // same pause as after a goal, then the second-half kickoff
        NS.Audio.whistle();
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
            var gkReach = p.diveT > 0 ? 13 : 7.5;
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
              var reach = Math.sqrt(d2) - (p.diveT > 0 ? 1.4 : 0);
              var place = reach <= 0.9 ? 0.2 : -(reach - 0.9) * 0.2;
              var chance = speed < 12 ? 1 : clamp(gkSkill(p.team) + 0.04 + place - Math.max(0, speed - 30) * 0.012, 0.15, 0.96);
              if (ball.chip) chance *= 0.4;
              if (Math.random() < chance) {
                if (speed < (p.diveT > 0 ? 34 : 28)) { // a diving keeper holds on to harder shots
                  takeBall(p);
                  p.gkHands = true; // caught: held in the hands
                  p.catchT = 0.4;
                } else {
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
          if (ball.hard && bs2 > 676 && Math.random() < 0.5) {
            ball.vel.x *= 0.55;
            ball.vel.z += (Math.random() - 0.5) * 6;
            ball.pickupCooldown = 0.15;
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
      if (scored >= 0) { triggerGoal(scored); }

      for (i = 0; i < 2; i++) {
        var sl = World.slots[i];
        // the arrow blinks while the player is receiving a pass (the receive assist is on)
        if (sl.active && sl.player) NS.Scene.setRing(i, true, sl.player.pos.x, sl.player.pos.z, !ball.owner && ball.receiver === sl.player);
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

  NS.Match = Match;
})(window.RS6 = window.RS6 || {});
