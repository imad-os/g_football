/* Shared game state (players, ball, controller slots, session, match) and the ball physics. */
(function (NS) {
  'use strict';

  var R = NS.BALL_R;
  var HALF_W = NS.PITCH_HALF_W;
  var HALF_H = NS.PITCH_HALF_H;
  NS.pitchHooks.push(function () { HALF_W = NS.PITCH_HALF_W; HALF_H = NS.PITCH_HALF_H; });
  var GOAL_HALF_W = NS.GOAL_HALF_W;
  var GOAL_HEIGHT = NS.GOAL_HEIGHT;

  // Ball physics constants (shared with Actions, which aims kicks with the same model).
  var G = 15.6;           // realistic broadcast-scale gravity (was 24.0, which made arcs fall like lead)
  var AIR_K = 0.16;       // quadratic-like air drag approximation on horizontal flight (1/s)
  var ROLL_K = 0.82;      // grass rolling decay (1/s)
  var ROLL_F = 1.35;      // continuous turf rolling resistance (m/s^2) so the ball comes to a natural stop
  var BOUNCE = 0.68;      // vertical restitution on grass (Settings > Dev mode > Ball bounce)
  var BOUNCE_GRIP = 0.88; // base horizontal speed kept on a grass bounce
  var MAGNUS = 0.042;     // curl from spin, perpendicular to the flight
  var POST_R = NS.POST_R; // goal posts and bar radius (12 cm wide, like a real goal)
  NS.PHYS = { G: G, AIR_K: AIR_K, ROLL_K: ROLL_K, ROLL_F: ROLL_F };

  // Scratch states (no allocation in the step): S = the live ball, P = the predictor, Q = kick planning.
  var S = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
  var P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
  var Q = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };

  // A ball struck along the ground (or skimmed off it with vertical speed vy) at horizontal speed v: its horizontal
  // speed once it has covered d (-1: it stops before), and the time it took (Q.t). Same physics as the play.
  function rollTo(v, vy, d) {
    Q.x = 0; Q.y = R; Q.z = 0; Q.vx = v; Q.vy = vy; Q.vz = 0; Q.spin = 0;
    var h = 1 / 60, t = 0;
    while (Q.x < d) {
      integrate(Q, h);
      t += h;
      if (Q.vx < 0.1 || t > 8) { Q.t = t; return -1; }
    }
    Q.t = t;
    return Q.vx;
  }

  function loadState(st) {
    st.x = ball.pos.x; st.y = ball.pos.y; st.z = ball.pos.z;
    st.vx = ball.vel.x; st.vy = ball.vel.y; st.vz = ball.vel.z;
    st.spin = ball.spinY;
  }

  // Free flight / bounce / roll for dt. Returns true when the ball hit the ground this step.
  function integrate(st, dt) {
    var bounced = false;
    var airborne = st.y > R + 0.015 || st.vy > 0.05;

    // Spin curls the ball sideways (Magnus effect, scaled by speed and air/ground state)
    if (st.spin > 0.01 || st.spin < -0.01) {
      var c = st.spin * MAGNUS * (airborne ? 1.0 : 0.28) * dt;
      var ax = -st.vz * c;
      st.vz += st.vx * c;
      st.vx += ax;
      st.spin *= Math.exp(-(airborne ? 1.4 : 5.5) * dt);
    }

    if (airborne) {
      // Velocity Verlet / midpoint integration for smooth parabolic arcs
      var vy0 = st.vy;
      st.vy -= G * dt;
      var air = Math.exp(-AIR_K * dt);
      st.vx *= air;
      st.vz *= air;
      st.x += st.vx * dt;
      st.y += (vy0 + st.vy) * 0.5 * dt;
      st.z += st.vz * dt;

      if (st.y <= R) {
        st.y = R;
        var impactVy = -st.vy;
        if (impactVy > 0.9) {
          // Restitution decreases slightly on very hard vertical impacts (turf absorption)
          var bk = World.settings && World.settings.ballBounce > 0 ? World.settings.ballBounce : BOUNCE;
          var rest = bk * (impactVy > 12 ? 0.9 : 1.0);
          st.vy = impactVy * rest;
          // Angle-dependent turf grip: steeper drops lose more horizontal speed than low skimmers
          var hSpd = Math.sqrt(st.vx * st.vx + st.vz * st.vz);
          var grip = BOUNCE_GRIP - Math.min(0.16, impactVy / (hSpd + 8.0) * 0.18);
          st.vx *= grip;
          st.vz *= grip;
          st.spin *= 0.65;
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
        // Combination of viscous grass drag at high speed and Coulomb rolling friction at low speed
        var ns = sp * Math.exp(-ROLL_K * dt) - ROLL_F * dt;
        if (ns < 0.08) ns = 0;
        var scale = ns / sp;
        st.vx *= scale;
        st.vz *= scale;
        st.x += st.vx * dt;
        st.z += st.vz * dt;
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
    if (vn < 0) {
      // Metallic cylindrical restitution (0.72) plus glancing spin induced by off-center hits
      var vt = -st.vx * nz + st.vz * nx;
      st.vx -= 1.72 * vn * nx;
      st.vz -= 1.72 * vn * nz;
      st.vx *= 0.92;
      st.vz *= 0.92;
      st.spin = (st.spin * 0.4) + vt * 0.35;
    }
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
    if (vn < 0) {
      st.vx -= 1.68 * vn * nx;
      st.vy -= 1.68 * vn * ny;
      st.vz *= 0.92; // tangential friction along the bar
      st.spin *= 0.5;
    }
    return true;
  }

  // Posts, bar and net. Returns the scoring team, -1, -2 (hit the woodwork), -3 (all of the ball over a touchline) or
  // -4 (over a goal line, not in the goal). Outside the goal there are no walls any more: the ball goes out of play.
  function collide(st, scoring, dt) {
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
    // Inside the goal: the net catches and cushions the ball (back, sides, roof)
    if ((st.x > HALF_W || st.x < -HALF_W) && az < GOAL_HALF_W && st.y < GOAL_HEIGHT) {
      var gs = st.x > 0 ? 1 : -1;
      var back = HALF_W + NS.GOAL_DEPTH - R;
      // Soft mesh drag as the ball pushes deep into the net
      var depthFrac = ((st.x * gs) - HALF_W) / NS.GOAL_DEPTH;
      if (depthFrac > 0.55 && dt) {
        var netDrag = Math.exp(-6.5 * (depthFrac - 0.55) * dt);
        st.vx *= netDrag;
        st.vy *= netDrag;
        st.vz *= netDrag;
      }
      if (st.x * gs > back) {
        st.x = gs * back;
        if (scoring && st.vx * gs > 2.2) World.netHit = gs;
        st.vx = -st.vx * 0.14;
        st.vz *= 0.45;
        st.vy *= 0.35;
        st.spin *= 0.2;
      }
      if (az > GOAL_HALF_W - R) {
        st.z = (st.z > 0 ? 1 : -1) * (GOAL_HALF_W - R);
        if (scoring && Math.abs(st.vz) > 3.5) World.netHit = gs;
        st.vz = -st.vz * 0.18;
        st.vx *= 0.65;
      }
      if (st.y > GOAL_HEIGHT - R) {
        st.y = GOAL_HEIGHT - R;
        st.vy = -st.vy * 0.15;
        st.vx *= 0.7;
      }
      // All of the ball over the line, between the posts and under the bar: goal
      if (scoring && st.x * gs > HALF_W + R && az < GOAL_HALF_W - POST_R) return NS.attack(0) === gs ? 0 : 1;
      return -1;
    }
    if (hit) return -2;
    if (az > HALF_H + R) return -3;
    if (st.x > HALF_W + R || st.x < -HALF_W - R) return -4;
    return -1;
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
    gkTried: 0,   // bit per team: that keeper already had his save attempt on this kick
    gkCd: 0,      // brief cooldown before a keeper can react to a second deflection
    chip: false, // lofted shot: the keeper is much less likely to save it
    pickupCooldown: 0,
    receiver: null,  // team-mate the last pass was played to (he runs onto it)
    contester: null, // the opponent nearest to that pass (he runs to it too)
    thru: false,     // the pass is a through ball: its receiver runs on to (thruX, thruZ) and waits for it there
    thruX: 0, thruZ: 0,
    pen: false,      // a penalty kick in flight
    shotD: 0,        // distance to goal the last shot was struck from
    fromX: 0, fromZ: 0, // where it was last played from (kick, header, deflection): the next player's reaction time
    age: 0,          // seconds since then
    headed: false,   // the last touch was a header
    nutThru: null, nutT: 0, // the player it just went through the legs of (he cannot touch it for nutT seconds)
    nutP: null, nutAge: 0, // the last player a through-the-legs check was made for, and when (ball.age)
    offTeam: -1,     // team whose last pass left some of its players offside (their p.offside flags), -1 none
    // the dribble (stepBall): the ball has its own place at the carrier's feet, at angle dA (world) and distance dR,
    // moving out at dV after each touch; dOwner: the carrier it was set up for (a new one starts where the ball is)
    dOwner: null, dA: 0, dR: 0, dV: 0, dY: 0
  };

  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  var TURN_RATE = 9;   // rad/s the ball goes round him when he turns (a turn is a touch to the new side, not a jump)
  var SETTLE = 7;      // how fast a received ball comes to his feet (1/s): it rolls in, it is not stuck to him

  function makeSlot(idx) {
    return {
      idx: idx, active: false, team: 0, player: null,
      chargeMove: -1, chargeFrac: -1, pressing: false, teamPress: false, evPlayer: null, burstT: 0, lockT: 0,
      sprPrev: false, sprTaps: 0, sprTapT: 9, knockT: 0, // knock-on: sprint taps on the ball
      evActive: false, evMask: 0, evT: 0, evSettle: 0, evCtx: 0, evMove: -1, evPrev: 0,
      gkLeft: 0, // keeper countdown shown (seconds left)
      manual: false, manualOwner: null, // switched by button: auto-switch waits until the ball changes hands
      rsOn: false, rsCd: 0, preT: 0, preX: 0, preZ: 0, // right stick: pushed, knock-on repeat, first-touch direction
      shCd: 0 // shoulder challenge while pressing
    };
  }

  var World = {
    ball: ball,
    players: [],
    sentOff: [],   // players sent off this match (out of World.players, meshes hidden; disposed with the teams)
    slots: [makeSlot(0), makeSlot(1)],
    aiSlots: [makeSlot(2), makeSlot(3)], // AI.MA: the learning player of team 0 / 1 (js/game/aima.js)
    allSlots: null,                      // the 2 human slots, then the 2 AI.MA slots
    pressT: [0, 0],
    gkRush: [0, 0], // > 0: a human holds the keeper button, that team's keeper rushes out (js/game/ai.js)
    kickoffTeam: 0,
    settings: null,
    session: {
      compType: 'EXHIBITION',
      sideMode: '1P_CPU', // 1P_CPU | 1P_2P | COOP_CPU | CPU_CPU (competitions) | CUSTOM (the sides screen: pads)
      pads: [0, -1],      // CUSTOM: the team of player 1 / player 2 (0 home, 1 away, -1 none: the CPU plays)
      padDev: [null, null], // CUSTOM: the device each of them plays with (NS.Devices, js/core/input.js)
      selStarter: [null, null], // the game plan: each side's starter picked for a swap
      cpuLevels: null,    // CPU v CPU (nobody on either team): each side's level ('EASY'..'LEGEND', 'AIMA_EASY'..'AIMA'); null = the setting
      cpuBrains: ['', ''], // ... and for a checkoAI side, its brain ('' = the active one)
      activeCategory: 'LEAGUE_MAR',
      homeTeamId: 'WAC',
      awayTeamId: 'RCA',
      formations: ['4-4-2', '4-4-2'], // both sides alike by default (4-3-3 is a strong attacking choice in 7-a-side)
      // Tactics per block (defence, midfield, attack): 0 defensive, 1 balanced, 2 attacking
      tactics: [[1, 1, 1, 1], [1, 1, 1, 1]], // defence, midfield, attack (0 defensive, 1 balanced, 2 attacking), counter (0 rarely, 1 when on, 2 always)
      awayCategory: 'LEAGUE_MAR', // the away side's league / group on the Teams screen
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
      protectT: 0,     // a free kick is being taken: nobody may tackle the taker yet
      sendOff: null,   // a player shown a red card: he leaves when play restarts
      dir: [1, -1],    // the way each team attacks (+1: towards +x); random ends, swapped at half time
      warned: [false, false], // the team had its verbal warning (its next foul is a yellow)
      restart: 0,      // 1 free kick, 3 throw-in, 4 corner, 5 goal kick, 6 kick-off: the taker has not played it yet
                       // (he stands at the ball and has to pass / shoot it, he cannot run with it)
      restartT: 0,
      extra: 0         // time played after 45 / 90 minutes while an attack is still on
    },

    resetBall: function () {
      ball.pos.set(0, R, 0);
      ball.vel.set(0, 0, 0);
      ball.spinY = 0;
      ball.owner = null;
      ball.receiver = null;
      ball.contester = null;
      ball.pickupCooldown = 0.25;
      ball.gkTried = 0;
      ball.gkCd = 0;
      ball.offTeam = -1;
      ball.nutThru = null; ball.nutT = 0; ball.nutP = null;
      ball.thrown = false;
    },

    // Advances the ball. Returns the scoring team (0 = home, +x goal; 1 = away) or -1.
    stepBall: function (dt) {
      if (ball.pickupCooldown > 0) ball.pickupCooldown -= dt;
      if (ball.kickerT > 0) ball.kickerT -= dt;
      if (ball.gkCd > 0) ball.gkCd -= dt;

      var o = ball.owner;
      if (o && (o.throwIn || o.gkHands)) {
        // in his hands: held where they are
        var carry = o.throwIn ? 0.2 : 0.55;
        ball.pos.x = o.pos.x + Math.sin(o.facing) * carry;
        ball.pos.y = o.throwIn ? 3.05 : 1.45;
        ball.pos.z = o.pos.z + Math.cos(o.facing) * carry;
        ball.vel.set(o.vel.x, 0, o.vel.z);
        ball.dOwner = null;
        return -1;
      }
      if (o) {
        // ---- the dribble. Nothing is stuck to his foot: the ball keeps its own place round him (angle dA, distance
        // dR). Running, he pushes it ahead with a touch (dV), it rolls out and he catches it up, touch after touch, in
        // the rhythm of his run (a sprint: longer touches, a looser ball). Turning, the ball goes round him at TURN_RATE
        // (a sharp turn is a touch to the side, shown as one). A ball he has just received comes in to his feet from
        // where it was (SETTLE), dropping to the grass if it came in the air.
        var sp = Math.sqrt(o.vel.x * o.vel.x + o.vel.z * o.vel.z);
        var ox = ball.pos.x, oz = ball.pos.z;
        if (ball.dOwner !== o) {
          ball.dOwner = o;
          var rx = ball.pos.x - o.pos.x, rz = ball.pos.z - o.pos.z;
          ball.dR = Math.min(Math.sqrt(rx * rx + rz * rz), 2.4);
          ball.dA = ball.dR > 0.05 ? Math.atan2(rx, rz) : o.facing;
          ball.dV = 0;
          ball.dY = ball.pos.y;
        }
        var want = o.carry, da = wrapA(o.facing - ball.dA), mt = World.match;
        if ((da > 0.6 || da < -0.6) && sp > 1 && !(o.touchT > 0)) { o.touchT = 0.2; o.touchFoot = da > 0 ? -1 : 1; } // the outside of the foot
        var turn = TURN_RATE * dt * (ball.dR > want + 0.4 ? 0.6 : 1); // (a ball out in front takes longer to bring round)
        ball.dA += da > turn ? turn : (da < -turn ? -turn : da);
        if (sp > 2.5 && !mt.restart && !mt.penalty) {
          if (ball.dR <= want && ball.dV <= 0) {
            // a touch: pushed out ahead, the longer the faster he runs (the ball is easier to win while it is out)
            ball.dV = 1.0 + sp * 0.22;
            if (!(o.touchT > 0)) { o.touchT = 0.2; o.touchFoot = o.foot === 'L' ? -1 : 1; }
          }
          ball.dV -= (5 + sp * 0.15) * dt; // he catches it up
          ball.dR += ball.dV * dt;
          if (ball.dR < want * 0.85) { ball.dR = want * 0.85; ball.dV = 0; }
        } else {
          // standing or walking: it comes to his feet and stays there
          ball.dR += (want - ball.dR) * Math.min(1, dt * SETTLE);
          ball.dV = 0;
        }
        ball.dY += (R - ball.dY) * Math.min(1, dt * 10);
        ball.pos.x = o.pos.x + Math.sin(ball.dA) * ball.dR;
        ball.pos.z = o.pos.z + Math.cos(ball.dA) * ball.dR;
        ball.pos.y = ball.dY;
        ball.vel.set((ball.pos.x - ox) / dt, 0, (ball.pos.z - oz) / dt); // (its roll is drawn from it)
        // He ran it over a line (not while he holds it for a throw-in / restart)
        if (!o.throwIn && !World.match.restart) {
          if (ball.pos.z > HALF_H + R || ball.pos.z < -HALF_H - R) return -3;
          if (ball.pos.x > HALF_W + R || ball.pos.x < -HALF_W - R) return -4;
        }
        return -1;
      }

      ball.dOwner = null;
      ball.age += dt;
      loadState(S);
      // 2 sub-steps per frame prevent fast shots from tunneling through posts or skipping ground bounces
      var h = dt * 0.5;
      var res = -1;
      for (var step = 0; step < 2; step++) {
        if (integrate(S, h)) { ball.hard = false; ball.chip = false; }
        var cRes = collide(S, true, h);
        if (cRes === -2) {
          NS.Audio.post();
          ball.hard = false;
          ball.gkTried = 0; // keeper can react to a rebound off the woodwork
        } else if (cRes >= 0 || cRes <= -3) {
          res = cRes;
          break;
        }
      }
      ball.pos.set(S.x, S.y, S.z);
      ball.vel.set(S.vx, S.vy, S.vz);
      ball.spinY = S.spin;
      return res;
    },

    // Predicted ball position after t seconds of free flight (same physics). Sets World.prX / prY / prZ.
    predict: function (t) {
      loadState(P);
      var h = 0.04;
      for (var k = t; k > 1e-4; k -= h) {
        var stepDt = k < h ? k : h;
        integrate(P, stepDt);
        collide(P, false, stepDt);
      }
      this.prX = P.x; this.prY = P.y; this.prZ = P.z;
    },
    prX: 0, prY: 0, prZ: 0,

    // The ball as it is now, flown (same physics, posts and bar ignored) until it crosses x = lineX: World.prZ / prY
    // where, World.prT when (or false when it does not get there within maxT seconds)
    crossAt: function (lineX, maxT) {
      loadState(P);
      var h = 0.02, s0 = P.x < lineX ? 1 : -1;
      for (var t = 0; t < maxT; t += h) {
        integrate(P, h);
        if ((P.x - lineX) * s0 >= 0) { this.prX = P.x; this.prY = P.y; this.prZ = P.z; this.prT = t + h; return true; }
      }
      return false;
    },
    prT: 0,

    // The horizontal launch speed for a ball played along the ground (vertical speed vy) to cover d and still roll on
    // at vEnd there. World.kickT: the time it takes to get there.
    speedFor: function (d, vEnd, vy) {
      var lo = 1, hi = 60, k;
      for (k = 0; k < 22; k++) {
        var mid = (lo + hi) * 0.5, ve = rollTo(mid, vy || 0, d);
        if (ve < vEnd) lo = mid; else hi = mid;
      }
      rollTo(hi, vy || 0, d);
      this.kickT = Q.t;
      return hi;
    },
    kickT: 0,

    // Earliest time player p (running at `speed`) can meet the ball at a height he can play (<= reachY).
    // Sets World.icX / icZ to the meeting point. For a lofted ball this is where it comes down.
    intercept: function (p, speed, reachY) {
      loadState(P);
      var h = 0.05;
      for (var i = 0; i <= 50; i++) {
        var t = i * h;
        if (i > 0) { integrate(P, h); collide(P, false, h); }
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

  World.aiSlots[0].team = 0;
  World.aiSlots[1].team = 1;
  World.allSlots = [World.slots[0], World.slots[1], World.aiSlots[0], World.aiSlots[1]];
  NS.World = World;
  // the way team t attacks: +1 towards +x, -1 towards -x (it changes at half time)
  NS.attack = function (t) { return World.match.dir[t]; };
  // the team of player 1 / player 2 for a side mode
  var MODE_PADS = { '1P_CPU': [0, -1], '1P_2P': [0, 1], 'COOP_CPU': [0, 0], 'CPU_CPU': [-1, -1] };
  NS.sidePads = function () {
    var s = World.session;
    return s.sideMode === 'CUSTOM' && s.pads ? s.pads : (MODE_PADS[s.sideMode] || MODE_PADS['1P_CPU']);
  };
})(window.RS6 = window.RS6 || {});
