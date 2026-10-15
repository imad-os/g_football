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
    if (p.returnTo) p.returnT = 0.28; // one-two: play it back
    p.dribbling = false;
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
      for (var t = 0; t < 2; t++) {
        var dir = t === 0 ? 1 : -1;
        var td = t === 0 ? homeT : awayT;
        var layout = layoutOf(t);
        var names = s.rosters[t];
        for (i = 0; i < layout.length; i++) {
          var slot = layout[i];
          var gk = slot.role === 'GK';
          var mesh = NS.Assets.createPlayer(gk ? 'SOLID' : td.pattern, gk ? (t === 0 ? 0x10b981 : 0xf59e0b) : td.c1, td.c2,
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
            // AI brain state
            mark: null, icX: 0, icZ: 0, drX: 0, drZ: 0, runT: 0, runCd: 0, runX: 0, runZ: 0,
            aiT: 0, tgtX: 0, tgtZ: 0, tgtS: 8, gkRT: 0
          });
        }
      }
      NS.HUD.setTeams(homeT, awayT);
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
          Actions.updateTackle(p, dt, p.tackleHuman ? 0.88 : prof.tackle);
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

        var sp = p.vel.x * p.vel.x + p.vel.z * p.vel.z;
        if (sp > 0.5) {
          p.animPhase += dt * 13;
          var swing = Math.sin(p.animPhase) * 0.55;
          p.mesh.leftLeg.rotation.x = swing;
          p.mesh.rightLeg.rotation.x = -swing;
        } else {
          p.mesh.leftLeg.rotation.x = 0;
          p.mesh.rightLeg.rotation.x = 0;
        }
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
          if (p.role === 'GK') {
            if (d2 < 7.5 && ball.pos.y < 3.4 && !(ball.gkTried & (1 << p.team))) {
              ball.gkTried |= 1 << p.team;
              gkActed = true;
              var speed = Math.sqrt(bs2);
              var chance = speed < 12 ? 1 : clamp(gkSkill(p.team) - (speed - 20) * 0.01, 0.2, 0.92);
              if (ball.chip) chance *= 0.4;
              // placement: a shot away from where the keeper stands is harder to keep out
              var reach = Math.abs(ball.pos.z - p.pos.z);
              if (speed >= 12 && reach > 1) chance *= clamp(1.25 - reach * 0.22, 0.35, 1);
              if (Math.random() < chance) {
                if (speed < 28) {
                  takeBall(p);
                  p.gkHold = 0;
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

      // ----- ball, goal, camera -----
      var scored = World.stepBall(dt);
      ballRotX += ball.vel.z * dt * 0.5;
      ballRotZ -= ball.vel.x * dt * 0.5;
      NS.Scene.setBall(ball.pos, ballRotX, ballRotZ);
      if (scored >= 0) { triggerGoal(scored); }

      for (i = 0; i < 2; i++) {
        var sl = World.slots[i];
        if (sl.active && sl.player) NS.Scene.setRing(i, true, sl.player.pos.x, sl.player.pos.z);
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
      NS.HUD.tick(dt);
    },

    // Static meshes need to match the ball after a rebuild-less reset (menu background).
    syncBall: function () {
      NS.Scene.setBall(World.ball.pos, ballRotX, ballRotZ);
    }
  };

  NS.Match = Match;
})(window.RS6 = window.RS6 || {});
