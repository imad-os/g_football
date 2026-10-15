/* Shared game state (players, ball, controller slots, session, match) and the ball physics. */
(function (NS) {
  'use strict';

  var R = NS.BALL_R;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var GOAL_HEIGHT = NS.GOAL_HEIGHT;

  var ball = {
    pos: new THREE.Vector3(0, R, 0),
    vel: new THREE.Vector3(0, 0, 0),
    spinY: 0,
    owner: null,
    lastTouchTeam: 0,
    lastToucher: '',
    hard: false, // true after a shot: fast enough to be deflected
    kicker: null, kickerT: 0, // the last kicker cannot take the ball straight back
    chip: false, // lofted shot: the keeper is much less likely to save it
    pickupCooldown: 0
  };

  function makeSlot(idx) {
    return {
      idx: idx, active: false, team: 0, player: null,
            chargeMove: -1, chargeFrac: -1, pressing: false, teamPress: false, evPlayer: null, burstT: 0, lockT: 0,
      evActive: false, evMask: 0, evT: 0, evSettle: 0, evCtx: 0, evMove: -1, evPrev: 0
    };
  }

  var World = {
    ball: ball,
    players: [],
    slots: [makeSlot(0), makeSlot(1)],
    pressT: [0, 0],
    kickoffTeam: 0,
    settings: null,
    session: {
      compType: 'EXHIBITION',
      sideMode: '1P_CPU', // 1P_CPU | 1P_2P | COOP_CPU | CPU_CPU
      activeCategory: 'LEAGUE_MAR',
      homeTeamId: 'WAC',
      awayTeamId: 'RCA',
      formations: ['4-4-2', '4-3-3'],
      rosters: [[], []],
      editingSquadIdx: 0,
      selectedStarterIdx: null
    },
    match: {
      running: false, paused: true,
      score: [0, 0], timeSeconds: 0,
      celebrationTimer: 0, fullTimeTimer: 0, kickoffTimer: 0
    },

    resetBall: function () {
      ball.pos.set(0, R, 0);
      ball.vel.set(0, 0, 0);
      ball.spinY = 0;
      ball.owner = null;
      ball.pickupCooldown = 0.25;
    },

    // Advances the ball. Returns the scoring team (0 = home, +x goal; 1 = away) or -1.
    stepBall: function (dt) {
      if (ball.pickupCooldown > 0) ball.pickupCooldown -= dt;
      if (ball.kickerT > 0) ball.kickerT -= dt;

      var o = ball.owner;
      if (o) {
        ball.pos.x = o.pos.x + Math.sin(o.facing) * o.carry;
        ball.pos.y = R;
        ball.pos.z = o.pos.z + Math.cos(o.facing) * o.carry;
        ball.vel.set(o.vel.x, 0, o.vel.z);
        return -1;
      }

      ball.pos.x += ball.vel.x * dt;
      ball.pos.y += ball.vel.y * dt;
      ball.pos.z += ball.vel.z * dt;

      if (ball.spinY > 0.01 || ball.spinY < -0.01) {
        ball.vel.z += ball.spinY * ball.vel.x * 0.04 * dt;
        ball.spinY *= 0.96;
      }

      if (ball.pos.y > R) {
        ball.vel.y -= 24.0 * dt;
      } else {
        ball.pos.y = R;
        if (ball.vel.y < -2.0) { ball.vel.y = -ball.vel.y * 0.52; ball.vel.x *= 0.6; ball.vel.z *= 0.6; ball.hard = false; ball.chip = false; } else ball.vel.y = 0;
        var drag = Math.pow(0.28, dt);
        ball.vel.x *= drag;
        ball.vel.z *= drag;
      }

      var az = ball.pos.z < 0 ? -ball.pos.z : ball.pos.z;
      if (az < GOAL_HALF_W && ball.pos.y < GOAL_HEIGHT) {
        if (ball.pos.x > HALF_W + 0.4) return 0;
        if (ball.pos.x < -HALF_W - 0.4) return 1;
      }

      if (ball.pos.z > HALF_H) { ball.pos.z = HALF_H; ball.vel.z = -ball.vel.z * 0.7; }
      else if (ball.pos.z < -HALF_H) { ball.pos.z = -HALF_H; ball.vel.z = -ball.vel.z * 0.7; }

      // Goal line: wall everywhere except inside the goal mouth under the bar.
      if (ball.pos.x > HALF_W && (az >= GOAL_HALF_W || ball.pos.y >= GOAL_HEIGHT)) {
        ball.pos.x = HALF_W; ball.vel.x = -ball.vel.x * 0.7;
      } else if (ball.pos.x < -HALF_W && (az >= GOAL_HALF_W || ball.pos.y >= GOAL_HEIGHT)) {
        ball.pos.x = -HALF_W; ball.vel.x = -ball.vel.x * 0.7;
      }
      return -1;
    }
  };

  NS.World = World;
})(window.RS6 = window.RS6 || {});
