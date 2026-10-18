/* Shared game state (players, ball, controller slots, session, match) and the ball physics. */
(function (NS) {
  'use strict';

  var R = NS.BALL_R;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var GOAL_HEIGHT = NS.GOAL_HEIGHT;

  // Ball physics constants (shared with Actions, which aims kicks with the same model).
  var G = 24.0;          // gravity
  var AIR_K = 0.1;       // air drag on the horizontal speed (1/s)
  var ROLL_K = 0.95;     // rolling drag (1/s)
  var ROLL_F = 1.1;      // rolling resistance (constant deceleration)
  var BOUNCE = 0.55;     // vertical restitution on the grass
  var BOUNCE_GRIP = 0.84; // horizontal speed kept on a bounce
  var MAGNUS = 0.035;    // curl from spin, perpendicular to the flight
  var POST_R = 0.14;     // goal posts and bar radius
  NS.PHYS = { G: G, AIR_K: AIR_K, ROLL_K: ROLL_K, ROLL_F: ROLL_F };

  // Scratch states (no allocation in the step): S = the live ball, P = the predictor.
  var S = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
  var P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };

  function loadState(st) {
    st.x = ball.pos.x; st.y = ball.pos.y; st.z = ball.pos.z;
    st.vx = ball.vel.x; st.vy = ball.vel.y; st.vz = ball.vel.z;
    st.spin = ball.spinY;
  }

  // Free flight / bounce / roll for dt. Returns true when the ball hit the ground this step.
  function integrate(st, dt) {
    var bounced = false;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.z += st.vz * dt;
    var airborne = st.y > R + 0.01 || st.vy > 0;

    // spin curls the ball sideways (perpendicular to its horizontal velocity)
    if (st.spin > 0.01 || st.spin < -0.01) {
      var c = st.spin * MAGNUS * (airborne ? 1 : 0.25) * dt;
      var ax = -st.vz * c;
      st.vz += st.vx * c;
      st.vx += ax;
      st.spin *= Math.exp(-(airborne ? 1.8 : 7) * dt);
    }

    if (airborne) {
      st.vy -= G * dt;
      var air = Math.exp(-AIR_K * dt);
      st.vx *= air;
      st.vz *= air;
      if (st.y <= R) {
        st.y = R;
        if (st.vy < -1.5) {
          st.vy = -st.vy * BOUNCE;
          st.vx *= BOUNCE_GRIP;
          st.vz *= BOUNCE_GRIP;
          st.spin *= 0.5;
          bounced = true;
        } else {
          st.vy = 0;
        }
      }
    } else {
      st.y = R;
      st.vy = 0;
      var sp = Math.sqrt(st.vx * st.vx + st.vz * st.vz);
      if (sp > 0) {
        var ns = sp * Math.exp(-ROLL_K * dt) - ROLL_F * dt;
        if (ns < 0.15) ns = 0;
        st.vx *= ns / sp;
        st.vz *= ns / sp;
      }
    }
    return bounced;
  }

  // Bounce off an upright goal post standing at (px, pz).
  function hitPost(st, px, pz) {
    var dx = st.x - px;
    var dz = st.z - pz;
    var min = POST_R + R;
    var d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-8) return false;
    var d = Math.sqrt(d2);
    var nx = dx / d, nz = dz / d;
    st.x = px + nx * min;
    st.z = pz + nz * min;
    var vn = st.vx * nx + st.vz * nz;
    if (vn < 0) { st.vx -= 1.65 * vn * nx; st.vz -= 1.65 * vn * nz; }
    return true;
  }

  // Bounce off the crossbar of the goal on the line x = bx.
  function hitBar(st, bx) {
    var dx = st.x - bx;
    var dy = st.y - GOAL_HEIGHT;
    var min = POST_R + R;
    var d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-8) return false;
    var d = Math.sqrt(d2);
    var nx = dx / d, ny = dy / d;
    st.x = bx + nx * min;
    st.y = GOAL_HEIGHT + ny * min;
    var vn = st.vx * nx + st.vy * ny;
    if (vn < 0) { st.vx -= 1.6 * vn * nx; st.vy -= 1.6 * vn * ny; }
    return true;
  }

  // Touchlines, goal lines, posts and bar. Returns the scoring team or -1.
  function collide(st, scoring) {
    var az = st.z < 0 ? -st.z : st.z;
    var hit = false;
    if (st.y < GOAL_HEIGHT + POST_R + R) {
      for (var e = -1; e <= 1; e += 2) {
        var gx = e * HALF_W;
        if ((st.x - gx) * (st.x - gx) > 4) continue;
        if (st.y < GOAL_HEIGHT) {
          if (hitPost(st, gx, GOAL_HALF_W)) hit = true;
          if (hitPost(st, gx, -GOAL_HALF_W)) hit = true;
        }
        if (az < GOAL_HALF_W && hitBar(st, gx)) hit = true;
      }
    }
    az = st.z < 0 ? -st.z : st.z;
    // inside the goal: the net catches the ball (back, sides, roof)
    if ((st.x > HALF_W || st.x < -HALF_W) && az < GOAL_HALF_W && st.y < GOAL_HEIGHT) {
      var gs = st.x > 0 ? 1 : -1;
      var back = HALF_W + NS.GOAL_DEPTH - R;
      if (st.x * gs > back) {
        st.x = gs * back;
        if (scoring && st.vx * gs > 3) World.netHit = gs;
        st.vx *= -0.12; st.vz *= 0.5; st.vy *= 0.5;
      }
      if (az > GOAL_HALF_W - R) { st.z = (st.z > 0 ? 1 : -1) * (GOAL_HALF_W - R); st.vz *= -0.2; }
      if (st.y > GOAL_HEIGHT - R) { st.y = GOAL_HEIGHT - R; st.vy *= -0.2; }
      // all of the ball over the line, between the posts and under the bar: goal
      if (scoring && st.x * gs > HALF_W + R && az < GOAL_HALF_W - POST_R) return gs > 0 ? 0 : 1;
      return -1;
    }
    if (st.z > HALF_H) { st.z = HALF_H; st.vz = -st.vz * 0.6; }
    else if (st.z < -HALF_H) { st.z = -HALF_H; st.vz = -st.vz * 0.6; }
    // goal line: wall everywhere except inside the goal mouth under the bar
    if (st.x > HALF_W && (az >= GOAL_HALF_W || st.y >= GOAL_HEIGHT)) { st.x = HALF_W; st.vx = -st.vx * 0.6; }
    else if (st.x < -HALF_W && (az >= GOAL_HALF_W || st.y >= GOAL_HEIGHT)) { st.x = -HALF_W; st.vx = -st.vx * 0.6; }
    return hit ? -2 : -1;
  }

  var ball = {
    pos: new THREE.Vector3(0, R, 0),
    vel: new THREE.Vector3(0, 0, 0),
    spinY: 0,
    owner: null,
    lastTouchTeam: 0,
    lastToucher: '',
    hard: false, // true after a shot: fast enough to be deflected
    kicker: null, kickerT: 0, // the last kicker cannot take the ball straight back
    gkTried: 0,   // bit per team: that keeper already had his one save attempt on this kick
    chip: false, // lofted shot: the keeper is much less likely to save it
    pickupCooldown: 0,
    receiver: null,  // team-mate the last pass was played to (he runs onto it)
    contester: null, // the opponent nearest to that pass (he runs to it too)
    pen: false       // a penalty kick in flight
  };

  function makeSlot(idx) {
    return {
      idx: idx, active: false, team: 0, player: null,
            chargeMove: -1, chargeFrac: -1, pressing: false, teamPress: false, evPlayer: null, burstT: 0, lockT: 0,
      evActive: false, evMask: 0, evT: 0, evSettle: 0, evCtx: 0, evMove: -1, evPrev: 0,
      gkLeft: 0, // keeper countdown shown (seconds left)
      manual: false, manualOwner: null // switched by button: auto-switch waits until the ball changes hands
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
      celebrationTimer: 0, fullTimeTimer: 0, kickoffTimer: 0, half: 1, firstKick: 0,
      setPieceTimer: 0, setPiece: 0, setTeam: 0, setX: 0, setZ: 0, setTaker: null, // 1 free kick, 2 penalty
      penalty: false,  // a penalty is being taken: only the taker and the keeper move until the kick
      protectT: 0      // a free kick is being taken: nobody may tackle the taker yet
    },

    resetBall: function () {
      ball.pos.set(0, R, 0);
      ball.vel.set(0, 0, 0);
      ball.spinY = 0;
      ball.owner = null;
      ball.receiver = null;
      ball.contester = null;
      ball.pickupCooldown = 0.25;
    },

    // Advances the ball. Returns the scoring team (0 = home, +x goal; 1 = away) or -1.
    stepBall: function (dt) {
      if (ball.pickupCooldown > 0) ball.pickupCooldown -= dt;
      if (ball.kickerT > 0) ball.kickerT -= dt;

      var o = ball.owner;
      if (o) {
        var carry = o.gkHands ? 0.55 : o.carry; // a keeper holds it in his hands, at chest height
        ball.pos.x = o.pos.x + Math.sin(o.facing) * carry;
        ball.pos.y = o.gkHands ? 1.45 : R;
        ball.pos.z = o.pos.z + Math.cos(o.facing) * carry;
        ball.vel.set(o.vel.x, 0, o.vel.z);
        return -1;
      }

      loadState(S);
      if (integrate(S, dt)) { ball.hard = false; ball.chip = false; }
      var res = collide(S, true);
      if (res === -2) { NS.Audio.post(); ball.hard = false; res = -1; }
      ball.pos.set(S.x, S.y, S.z);
      ball.vel.set(S.vx, S.vy, S.vz);
      ball.spinY = S.spin;
      return res;
    },

    // Predicted ball position after t seconds of free flight (same physics). Sets World.prX / prY / prZ.
    predict: function (t) {
      loadState(P);
      var h = 0.05;
      for (var k = t; k > 1e-4; k -= h) {
        integrate(P, k < h ? k : h);
        collide(P, false);
      }
      this.prX = P.x; this.prY = P.y; this.prZ = P.z;
    },
    prX: 0, prY: 0, prZ: 0,

    // Earliest time player p (running at `speed`) can meet the ball at a height he can play (<= reachY).
    // Sets World.icX / icZ to the meeting point. For a lofted ball this is where it comes down.
    intercept: function (p, speed, reachY) {
      loadState(P);
      var h = 0.05;
      for (var i = 0; i <= 50; i++) {
        var t = i * h;
        if (i > 0) { integrate(P, h); collide(P, false); }
        if (P.y > reachY) continue;
        var dx = P.x - p.pos.x;
        var dz = P.z - p.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz) - 1.0;
        if (d <= speed * t || d <= 0) { this.icX = P.x; this.icZ = P.z; return t; }
      }
      this.icX = P.x; this.icZ = P.z;
      return 99;
    },
    icX: 0, icZ: 0,
    netHit: 0 // goal whose net the ball just hit (+1 / -1), read and cleared by the match
  };

  NS.World = World;
})(window.RS6 = window.RS6 || {});
