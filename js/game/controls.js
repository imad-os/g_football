/* Human control: movement, dribble sprint, player switching and the button-map gesture engine.
 *
 * A "press event" starts when a button that takes part in a move goes down (a second button within 60 ms joins it as a
 * combination). The buttons alone decide the move (NS.Bindings, remappable); holding never turns it into another move:
 *   with the ball     the move fires on release; the hold time is its power (passes get firmer, shots harder)
 *   without the ball  tackle / slide / switch fire on press; press and team press last while the button is held
 * Played with game controllers and phone controllers only (one shared map). Defaults (PES): A pass, Y through, B long,
 * X shoot, R sprint; without the ball A press, B tackle, X slide, Y team press, L switch. Start = game menu.
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var Input = NS.Input;
  var B = NS.Bindings;

  var I_LOW = B.index('lowpass');
  var I_THR = B.index('through');
  var I_LONG = B.index('long');
  var I_SHOOT = B.index('shoot');
  var I_CURVE = B.index('curve');
  var I_CHIP = B.index('chip');
  var I_ONETWO = B.index('onetwo');
  var I_TACKLE = B.index('tackle');
  var I_SLIDE = B.index('slide');
  var I_TEAM = B.index('teampress');
  var I_SWITCH = B.index('switch');
  var I_LOB = B.index('lobthrough'); // long through pass: lands over the defenders (checkoAI has it too since v1.51)
  var I_KEEP = B.index('keeper');    // held: the keeper rushes out (js/game/ai.js aiGoalkeeper; humans only)

  // seconds to fill the power bar (shot gauge, pass power): Settings > Gameplay > Power bar speed
  function fullCharge() { var t = World.settings && World.settings.gaugeTime; return t > 0 ? t : 0.5; }

  function otherPlayer(slot) {
    if (slot.ai) return null; // AI.MA plays alone on its team
    var o = World.slots[1 - slot.idx];
    return o.active ? o.player : null;
  }

  function switchCursor(slot) {
    var ball = World.ball;
    var p = slot.player;
    var other = otherPlayer(slot);
    var o = ball.owner;
    if (o && o.team === slot.team && o !== p && o !== other) { slot.player = o; return; }
    if (o && o.team !== slot.team) {
      // defending: the man between the carrier and our goal (pressed again: the next best placed one)
      var gs = lastManPick(slot.team, other, p, o);
      if (gs) { slot.player = gs; slot.manual = true; slot.manualOwner = o; return; }
    }
    var n = fastestToBall(slot.team, other);
    if (n === p) n = Actions.nearestToBall(slot.team, p, other);
    if (n) {
      slot.player = n;
      // the player chose: auto-switch keeps his choice while the same opponent keeps the ball
      slot.manual = true;
      slot.manualOwner = o;
    }
  }

  // Defending: how well q stands between the opponent carrier c and q's own goal (lower = better, -1 = not goal-side).
  // Distance to the carrier plus how far he is off the line carrier -> goal.
  function goalSideCost(q, c) {
    var att = NS.attack(q.team);
    if ((c.pos.x - q.pos.x) * att < -0.5) return -1;
    var lx = -att * NS.PITCH_HALF_W - c.pos.x, lz = -c.pos.z;
    var ll = Math.sqrt(lx * lx + lz * lz) || 1;
    var vx = q.pos.x - c.pos.x, vz = q.pos.z - c.pos.z;
    if ((vx * lx + vz * lz) / ll < -1) return -1;
    var d = Math.sqrt(vx * vx + vz * vz);
    return d > 45 ? -1 : d + Math.abs(vx * lz - vz * lx) / ll * 1.5;
  }
  // The team-mate best placed between the carrier c and the goal he defends (not ex1 / ex2, not the keeper), or null.
  function lastManPick(team, ex1, ex2, c) {
    var players = World.players;
    var best = null, bc = 1e9;
    for (var i = 0; i < players.length; i++) {
      var q = players[i];
      if (q.team !== team || q.role === 'GK' || q === ex1 || q === ex2 || q.stun > 0) continue;
      var cost = goalSideCost(q, c);
      if (cost >= 0 && cost < bc) { bc = cost; best = q; }
    }
    return best;
  }

  // Right stick without the ball: the team-mate nearest in the direction it points, seen from the current player.
  function stickSwitch(slot, dx, dz) {
    var p = slot.player;
    var other = otherPlayer(slot);
    var l = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= l; dz /= l;
    var players = World.players;
    var best = null, bc = 1e9;
    for (var i = 0; i < players.length; i++) {
      var q = players[i];
      if (q.team !== p.team || q === p || q === other || q.role === 'GK' || q.stun > 0) continue;
      var vx = q.pos.x - p.pos.x, vz = q.pos.z - p.pos.z;
      var d = Math.sqrt(vx * vx + vz * vz);
      if (d < 0.5 || d > 50) continue;
      var dot = (vx * dx + vz * dz) / d;
      if (dot < 0.35) continue; // within ~70 degrees of where the stick points
      var cost = d * (1.8 - dot);
      if (cost < bc) { bc = cost; best = q; }
    }
    if (!best) return;
    slot.player = best;
    slot.manual = true; // auto-switch leaves the choice alone until the ball changes hands
    slot.manualOwner = World.ball.owner;
    slot.lockT = 0;
    endEvent(slot);
  }

  // Tackle when an opponent carries the ball close, otherwise switch to the player nearest the ball.
  function tackleOrSwitch(slot, slide) {
    var p = slot.player;
    var c = World.ball.owner;
    if (c && c.team !== p.team && !c.gkHands && p.tackleCd <= 0 && World.match.protectT <= 0) {
      var dx = c.pos.x - p.pos.x;
      var dz = c.pos.z - p.pos.z;
      if (dx * dx + dz * dz < (slide ? 30 : 9)) { Actions.startTackle(p, c, true, slide); return; }
    }
    switchCursor(slot);
  }

  function endEvent(slot) {
    slot.evActive = false;
    slot.evMove = -1;
    slot.chargeMove = -1;
    slot.chargeFrac = -1;
    slot.pressing = false;
    slot.teamPress = false;
    slot.keeper = false;
    slot.blockCued = false;
  }

  // power 0..1 from the hold time for curve / chip shots (a tap is a soft one; full power with a full bar)
  function holdPower(d) {
    var v = 0.35 + 0.65 * d / fullCharge();
    return v > 1 ? 1 : v;
  }

  function fireAttack(slot, p, mi, d, pad) {
    var type;
    var follow = true;
    var lob = false;
    var full = fullCharge();
    var power = d / full > 1 ? 1 : d / full; // passes: a longer hold = a firmer pass
    if (mi === I_LOW) type = ACT.PASS;
    else if (mi === I_THR) type = ACT.THROUGH;
    else if (mi === I_LONG) type = ACT.LONG;
    else if (mi === I_LOB) { type = ACT.THROUGH; lob = true; }
    else if (mi === I_SHOOT) { type = ACT.SHOOT; follow = false; } // the gauge (same power as the bar)
    else if (mi === I_CURVE) { type = ACT.CURVE; power = holdPower(d); follow = false; }
    else if (mi === I_CHIP) { type = ACT.CHIP; power = holdPower(d); follow = false; }
    else if (mi === I_ONETWO) { if (NS.Aima) NS.Aima.humanMove(slot, mi, d); Actions.oneTwo(p, pad.x, pad.y); slot.lockT = 1.4; return; }
    else return;
    if (NS.Aima) NS.Aima.humanMove(slot, mi, d);
    Actions.passPower = follow ? power : -1;
    Actions.lob = lob;
    Actions.human = true;
    NS.Touch.deferred = false;
    Actions.kick(p, type, power, pad.x, pad.y, 1);
    Actions.human = false;
    Actions.lob = false;
    Actions.passPower = -1;
    // the ball was not at his foot yet: the pass is played when he gets to it (js/game/touch.js), and followed then
    if (NS.Touch.deferred) { if (follow) p.kqFol = type === ACT.LONG || lob ? 2.2 : 1.6; return; }
    var target = Actions.lastTarget;
    // the receiver is the human's player right away (both switch modes): he goes to meet the ball
    if (follow && target && target !== otherPlayer(slot)) {
      slot.player = target;
      slot.lockT = type === ACT.LONG || lob ? 2.2 : 1.6; // stay on the receiver while the ball travels
    }
  }

  // A pass is on its way and this player runs to it: the receiver, or the opponent nearest to it (until somebody has
  // the ball). Only this case moves a controlled player on his own (his arrow blinks).
  function receiving(p) {
    var ball = World.ball;
    return !ball.owner && (ball.receiver === p || ball.contester === p);
  }

  // A loose ball in the air right next to this player, coming down to him (a header is possible, nothing else).
  function airNear(p) {
    var ball = World.ball;
    if (ball.owner || ball.pos.y < 1.3 || ball.pos.y > 6) return false;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    return dx * dx + dz * dz < 16;
  }

  // A ball in the air on its way to this player: the pass is for him (or he contests it), or it comes towards him
  // from up to 14 m. A pass / shot button pressed now waits for it at head height (a header), like in FIFA / PES.
  function airComing(p) {
    var ball = World.ball;
    if (ball.owner || (ball.pos.y < 0.9 && ball.vel.y < 2)) return false;
    if (airNear(p)) return true;
    var dx = p.pos.x - ball.pos.x, dz = p.pos.z - ball.pos.z, d2 = dx * dx + dz * dz;
    if (ball.receiver === p || ball.contester === p) return d2 < 40 * 40;
    return d2 < 14 * 14 && dx * ball.vel.x + dz * ball.vel.z > 0;
  }

  // A ball played to this player (or coming back to him from his own side) on the ground / low: a pass or shot button
  // pressed now is played first time, without controlling it.
  function ftComing(p) {
    var ball = World.ball;
    if (ball.owner) return false;
    if (ball.receiver === p) return true;
    var dx = p.pos.x - ball.pos.x, dz = p.pos.z - ball.pos.z;
    return ball.lastTouchTeam === p.team && dx * dx + dz * dz < 196 && dx * ball.vel.x + dz * ball.vel.z > 0;
  }
  // The ball is within a stride of him and low enough to strike with the foot.
  function ftReach(p) {
    var ball = World.ball;
    if (ball.owner || ball.pos.y > 1.6) return false;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    return dx * dx + dz * dz < 4;
  }
  // The queued move is played now, straight off the pass / bounce (offside is called first, as for a first touch).
  function playFirstTime(slot, p, mv, power, pad) {
    if (Actions.touch(p)) return;
    fireAttack(slot, p, mv, power * fullCharge(), pad);
  }

  // The ball is at head height, in reach, and this player is the closest one to it.
  function inHeadZone(p) { return Actions.canHead(p); }

  // Pass / through / long = headed pass; shot / curve / chip = headed shot.
  function header(slot, p, mi, pad) {
    var shot = mi === I_SHOOT || mi === I_CURVE || mi === I_CHIP;
    if (NS.Aima) NS.Aima.humanMove(slot, mi, slot.evT);
    var type = mi === I_THR || mi === I_LOB ? ACT.THROUGH : (mi === I_LONG ? ACT.LONG : ACT.PASS);
    Actions.header(p, shot, type, pad.x, pad.y);
    var t = Actions.lastTarget;
    if (!shot && t && t !== otherPlayer(slot)) { slot.player = t; slot.lockT = 1.6; }
  }

  function fireDefense(slot, mi) {
    if (NS.Aima) NS.Aima.humanMove(slot, mi, 0);
    if (mi === I_TACKLE) tackleOrSwitch(slot, false);
    else if (mi === I_SLIDE) tackleOrSwitch(slot, true);
    else if (mi === I_SWITCH) switchCursor(slot);
  }

  var assignT = 0;

  // Seconds p needs to reach the ball (at a run, where the ball will be in a moment).
  function timeTo(p) {
    var ball = World.ball;
    var bx = ball.owner ? ball.pos.x : ball.pos.x + ball.vel.x * 0.4;
    var bz = ball.owner ? ball.pos.z : ball.pos.z + ball.vel.z * 0.4;
    var dx = bx - p.pos.x, dz = bz - p.pos.z;
    return Math.sqrt(dx * dx + dz * dz) / 11 + (p.stun > 0 ? p.stun : 0);
  }
  function fastestToBall(team, ex) {
    var players = World.players;
    var best = null, bt = 1e9;
    for (var i = 0; i < players.length; i++) {
      var q = players[i];
      if (q.team !== team || q.role === 'GK' || q === ex) continue;
      var t = timeTo(q);
      if (t < bt) { bt = t; best = q; }
    }
    return best;
  }

  NS.Controls = {
    // A human's pass kept until the ball was in reach (Touch.fire) has just been played: his cursor goes to the
    // receiver, as for a pass played at once
    follow: function (p, target, lock) {
      if (!target) return;
      for (var i = 0; i < 2; i++) {
        var s = World.slots[i];
        if (s.active && s.player === p && target !== otherPlayer(s)) { s.player = target; s.lockT = lock; return; }
      }
    },

    // The ball changed hands: a human team always controls its ball carrier (any switch mode), and a team that just
    // lost the ball may switch to a defender at once.
    claimBall: function (o) {
      if (!o) return;
      var pick = null;
      for (var i = 0; i < 4; i++) {
        var s = World.allSlots[i];
        if (!s.active) continue;
        if (s.team !== o.team) { s.lockT = 0; continue; }
        if (s.player === o) return; // already controlled
        var other = otherPlayer(s);
        if (other === o) return;    // co-op: the other human has him
        if (!pick) { pick = s; continue; }
        // co-op: the human who passed it keeps the ball, else the one whose player is nearer
        if (s.player && s.player === World.ball.kicker) pick = s;
        else if (pick.player !== World.ball.kicker && s.player && pick.player &&
          s.player.dBall < pick.player.dBall) pick = s;
      }
      if (!pick) return;
      pick.player = o;
      pick.lockT = 0;
      endEvent(pick);
      o.runToT = 0;
    },

    // Cursor selection. AUTO follows the ball; MANUAL only changes on the switch button.
    autoAssign: function (dt, force) {
      assignT -= dt;
      if (assignT > 0 && !force) return;
      assignT = 0.12;
      var autoSet = World.settings.switchMode === 'AUTO';
      var ball = World.ball;
      var o = ball.owner;
      for (var i = 0; i < 4; i++) {
        var s = World.allSlots[i];
        if (!s.active) continue;
        var auto = autoSet || s.ai; // AI.MA: auto switching (plus its own switch button)
        var other = otherPlayer(s);
        var cur = s.player;
        if (!cur) { s.player = Actions.nearestToBall(s.team, other, null); continue; }
        if (o && o.team === s.team) {
          // our ball: the carrier is always ours (any mode, even mid-gesture)
          if (o !== cur && o !== other) { s.player = o; s.lockT = 0; }
          continue;
        }
        // a pass on its way: our receiver, or our player nearest to it when the opponents passed, is the one to control
        var rcv = null;
        if (!o) {
          if (ball.receiver && ball.receiver.team === s.team) rcv = ball.receiver;
          else if (ball.contester && ball.contester.team === s.team) rcv = ball.contester;
        }
        if (rcv && rcv !== cur && rcv !== other) {
          // the receiver, unless a team-mate gets to the ball much sooner (a pass cut out, a deflection)
          var nr = fastestToBall(s.team, other);
          if (!nr || nr === rcv || timeTo(nr) > timeTo(rcv) * 0.6 - 0.2) { s.player = rcv; continue; }
        }
        // a lock waits for the pass he made: over as soon as that ball is no longer coming to him
        if (s.lockT > 0 && (o || ball.receiver !== cur)) s.lockT = 0;
        if (s.lockT > 0 || (s.evActive && s.evCtx !== 2)) continue; // never in the middle of a pass / shot gesture
        if (s.knockT > 0 && !o) continue; // running onto his own knock-on: he keeps the ball's chase
        // after a switch by button: nothing changes until something happens (the ball changes hands, a pass, a shot)
        if (s.manual) {
          if (o && o === s.manualOwner) continue;
          s.manual = false;
        }
        if (auto) {
          // the team-mate who gets to the ball first (where it is going, not only where it is)
          var dm = o && o.team !== s.team ? lastManPick(s.team, other, null, o) : null;
          if (dm) {
            // defending: the man between the carrier and our goal; kept while he is still goal-side and not much worse
            if (dm !== cur) {
              var cc = goalSideCost(cur, o);
              if (cur.stun > 0 || cc < 0 || goalSideCost(dm, o) < cc - 5) s.player = dm;
            }
          } else {
            var n = fastestToBall(s.team, other);
            if (n && n !== cur) {
              var tn = timeTo(n), tc = timeTo(cur);
              if (cur.stun > 0 || tn < tc * 0.75 - 0.15) s.player = n;
            }
          }
        }
      }
    },

    update: function (slot, dt) {
      var pad = slot.pad || Input.pads[slot.idx]; // AI.MA: its virtual controller
      var p = slot.player;
      if (!p) return;
      var ball = World.ball;
      if (slot.lockT > 0) slot.lockT -= dt;
      if (p.ftT > 0) p.ftT -= dt;

      var rel = B.relevant();
      var cur = pad.cur & rel;
      var held = (pad.cur | pad.latch) & rel;
      pad.latch = 0;
      var rising = held & ~slot.evPrev;
      slot.evPrev = cur;

      if (slot.evActive && slot.evPlayer !== p) {
        if (slot.evCtx === 2) slot.evPlayer = p; // a held press / team press goes on with the new player
        else endEvent(slot);
      }

      if (p.stun > 0 || p.tackleT > 0) {
        endEvent(slot);
        return;
      }

      var has = ball.owner === p;

      // ---- gesture engine ----
      // a fake shot: a shot (shoot / curve / chip) being charged, then the pass button: the shot is off, he swings over
      // the ball and steps it the way the stick points (Actions.fakeShot); the defenders who bit are left planted
      if (rising && has && slot.evActive && slot.evCtx === 1 && slot.evSettle <= 0 && B.resolve(1, rising) === I_LOW) {
        var fm0 = B.resolve(1, slot.evMask);
        if (fm0 >= 0 && B.MOVES[fm0].kind === 1 && !World.match.restart && !World.match.penalty) {
          Actions.fakeShot(p, pad.x, pad.y);
          endEvent(slot);
          rising = 0;
          has = ball.owner === p;
        }
      }
      if (rising) {
        if (slot.evActive && slot.evSettle > 0) {
          slot.evMask |= held;
        } else {
          slot.evActive = true;
          slot.evMask = held;
          slot.evT = 0;
          slot.evMove = -1;
          // 1 = with the ball, 3 = a pass / shot button pressed while a ball in the air is right next to us (header
          // only), 2 = everything else without the ball
          var fm = has ? -1 : B.resolve(1, held);
          if (fm === I_ONETWO) fm = -1;
          slot.evCtx = has ? 1 : (fm >= 0 && airComing(p) ? 3 : (fm >= 0 && ftComing(p) ? 4 : 2));
          slot.ftPow = 0;
          slot.evPlayer = p;
          slot.evSettle = B.needsSettle(held) ? 0.06 : 0;
        }
      }

      if (slot.evActive) {
        var ended = (cur & slot.evMask) !== slot.evMask;
        if (slot.evSettle > 0) slot.evSettle -= dt;
        else slot.evT += dt;
        var mv;
        if (slot.evCtx === 1) {
          if (!has) {
            endEvent(slot);
          } else {
            mv = B.resolve(1, slot.evMask);
            slot.chargeMove = mv;
            slot.chargeFrac = mv >= 0 && slot.evT > 0.06 ? Math.min(1, slot.evT / fullCharge()) : -1;
            // the shot is being shaped (the wind-up shows): the defenders near him throw a leg out (Actions.blockReact)
            if (mv >= 0 && B.MOVES[mv].kind === 1 && slot.evT > 0.12 && !slot.blockCued && !World.match.restart) {
              slot.blockCued = true;
              Actions.blockReact(p);
            }
            if (ended) {
              if (mv >= 0) fireAttack(slot, p, mv, slot.evT, pad);
              endEvent(slot);
              p = slot.player;
              has = ball.owner === p;
            }
          }
        } else if (slot.evCtx === 3) {
          mv = B.resolve(1, slot.evMask);
          if (mv < 0) mv = I_LOW;
          slot.chargeMove = mv;
          // the ball no longer comes to him in the air (or too long since the press): the header is off
          if (!airComing(p) || slot.evT > 1.6) { endEvent(slot); mv = -1; }
          slot.chargeFrac = slot.evT > 0.06 ? Math.min(1, slot.evT / fullCharge()) : -1;
          // The press is kept (held or not) until the ball is at head height next to him: then he heads it. The ball
          // came to his feet instead = no action (press again to play).
          if (mv < 0) {
            // ended above
          } else if (has || ball.owner) {
            endEvent(slot);
          } else if (inHeadZone(p)) {
            header(slot, p, mv, pad);
            endEvent(slot);
            p = slot.player;
            has = false;
          } else if (ftReach(p)) {
            // a dropping ball at foot height: volley it
            playFirstTime(slot, p, mv, Math.min(1, slot.evT / fullCharge()), pad);
            endEvent(slot);
            p = slot.player;
            has = ball.owner === p;
          }
        } else if (slot.evCtx === 4) {
          // a first-time pass / shot: the press is kept until the ball is in reach (the hold so far is its power, even
          // if the button is let go before)
          mv = B.resolve(1, slot.evMask);
          if (mv < 0) mv = I_LOW;
          if (!ended) slot.ftPow = Math.min(1, slot.evT / fullCharge());
          slot.chargeMove = mv;
          slot.chargeFrac = slot.ftPow > 0.06 ? slot.ftPow : -1;
          if (ball.owner || !ftComing(p) || slot.evT > 2.5) {
            endEvent(slot);
          } else if (ftReach(p)) {
            playFirstTime(slot, p, mv, slot.ftPow, pad);
            endEvent(slot);
            p = slot.player;
            has = ball.owner === p;
          } else {
            p.ftT = 0.2; // he does not take the ball in the meantime
          }
        } else if (has) {
          endEvent(slot);
        } else {
          if (slot.evSettle <= 0 || ended) {
            mv = B.resolve(2, slot.evMask);
            if (mv !== slot.evMove) {
              slot.evMove = mv;
              if (mv >= 0 && B.MOVES[mv].kind === 0) {
                fireDefense(slot, mv);
                p = slot.player;
                slot.evPlayer = p; // a switch keeps the press gesture going
                has = ball.owner === p;
                if (p.tackleT > 0) return;
              }
            }
            slot.keeper = mv === I_KEEP && !slot.ai;
            slot.pressing = mv >= 0 && B.MOVES[mv].kind === 2 && mv !== I_KEEP;
            slot.teamPress = mv === I_TEAM;
          }
          if (ended) endEvent(slot);
        }
      }
      // the keeper's button held: he keeps coming out while it is (and his own team has not got the ball)
      if (slot.keeper && !has) World.gkRush[p.team] = 0.15;

      // a penalty: nobody runs; the taker aims with the stick and shoots (the gauge sets height and pace)
      // a throw-in / corner / goal kick: the taker stands still, the stick aims the ball
      if (p.fkPend) return; // a free kick's run-up (js/game/match.js fkRun moves him)
      if (World.match.fkSet && p !== World.match.setTaker && p.role !== 'GK') { p.vel.x = 0; p.vel.z = 0; pad.burst = false; return; }
      if (World.match.penalty || (World.match.restart && has)) { p.vel.x = 0; p.vel.z = 0; pad.burst = false; return; }

      // ---- movement ----
      if (pad.burst) { pad.burst = false; if (p.stamina > 20) slot.burstT = 0.8; }
      if (slot.burstT > 0) slot.burstT -= dt;

      // right stick (human pads only): without the ball it picks the team-mate in its direction (seen from the current
      // player); with the ball it pushes it ~2 m that way (a knock-on, repeated while held); while a pass is coming to
      // him it sets the direction of his first touch (the ball is pushed that way as soon as he has it)
      if (!slot.ai) {
        var rsx = pad.rx || 0, rsz = pad.ry || 0;
        var rsOn = rsx * rsx + rsz * rsz > 0.36;
        var rise = rsOn && !slot.rsOn;
        slot.rsOn = rsOn;
        if (slot.rsCd > 0) slot.rsCd -= dt;
        if (slot.preT > 0) slot.preT -= dt;
        if (rsOn && has) {
          if ((rise || slot.rsCd <= 0) && p.stamina > 10 && !World.match.restart) {
            Actions.knockOn(p, rsx, rsz);
            slot.knockT = 1.0;
            slot.rsCd = 0.5;
            has = false;
          }
        } else if (rsOn && ball.receiver === p && !ball.owner) {
          slot.preX = rsx; slot.preZ = rsz; slot.preT = 1.5;
        } else if (rise) {
          stickSwitch(slot, rsx, rsz);
          p = slot.player;
          has = ball.owner === p;
        }
        if (has && slot.preT > 0 && !World.match.restart) {
          slot.preT = 0;
          if (p.stamina > 10) { Actions.knockOn(p, slot.preX, slot.preZ); slot.knockT = 1.0; has = false; }
        }
      }

      // knock-on (FIFA / PES): sprint tapped again and again on the ball: every second tap he pushes it a few metres
      // ahead (where the stick points) and runs onto it, faster than dribbling
      var sDown = B.sprintDown(pad.cur);
      if (sDown && !slot.sprPrev) {
        slot.sprTaps = slot.sprTapT < 0.45 ? slot.sprTaps + 1 : 1;
        slot.sprTapT = 0;
        if (has && slot.sprTaps >= 2 && p.stamina > 15 && pad.x * pad.x + pad.y * pad.y > 0.1 && !World.match.restart) {
          slot.sprTaps = 0;
          Actions.knockOn(p, pad.x, pad.y);
          slot.knockT = 1.3;
          has = false;
        }
      }
      slot.sprPrev = sDown;
      if (slot.sprTapT < 9) slot.sprTapT += dt;
      if (has) slot.knockT = 0;
      else if (slot.knockT > 0) slot.knockT -= dt;

      var mx = pad.x;
      var mz = pad.y;
      var len = Math.sqrt(mx * mx + mz * mz);
      var sprint = B.sprintDown(pad.cur) && p.stamina > 8;
      var dribbling = has && sprint;
      var burst = slot.burstT > 0;
      var charging = slot.evActive && slot.evCtx === 1 && slot.chargeMove >= 0 && slot.evT > 0.06; // not plain sprint
      var speed;
      var drain = 0;
      if (has) {
        if (dribbling) { speed = 12.2; drain = 12; }
        else if (burst) { speed = 12.8; drain = 9; }
        else speed = 9.4;
        if (charging) speed *= 0.6;
      } else {
        if (slot.pressing) speed = 12.4;
        else if (slot.knockT > 0) { speed = 14.4; drain = 10; } // running onto his knock-on
        else if (sprint) { speed = 13.4; drain = 14; }
        else if (burst) { speed = 13.0; drain = 9; }
        else speed = 10.8;
      }

      // pressing: lean towards the ball carrier even without input; team press brings the team-mates too
      var carrier = ball.owner;
      if (slot.pressing && carrier && carrier.team !== p.team) {
        var cx = carrier.pos.x - p.pos.x;
        var cz = carrier.pos.z - p.pos.z;
        var cl = Math.sqrt(cx * cx + cz * cz) || 1;
        if (len > 0.1) { mx = mx / len * 0.5 + cx / cl * 0.5; mz = mz / len * 0.5 + cz / cl * 0.5; }
        else { mx = cx / cl; mz = cz / cl; }
        len = Math.sqrt(mx * mx + mz * mz) || 1;
        if (slot.teamPress) World.pressT[p.team] = 0.3;
        // close enough: lean in with the shoulder and try to take it (every half second or so while pressing)
        if (slot.shCd > 0) slot.shCd -= dt;
        if (cl < 1.45 && slot.shCd <= 0) {
          slot.shCd = 0.55;
          if (Actions.shoulder(p, carrier, 0.4)) return;
        }
      }

      // a pass is on its way to this player: he goes to meet it (a lofted ball: where it comes down, or at head
      // height when a header was asked for). The stick is ignored until somebody has the ball.
      if (!has && receiving(p)) {
        var chase = slot.knockT > 0 ? 14.4 : 0; // his own knock-on: flat out after it
        World.intercept(p, chase || (sprint ? 12.5 : 11), slot.evActive && slot.evCtx === 3 ? 3.1 : 1.9);
        // a through ball: he sprints on into the space it is played into and meets it there (only once it is close to
        // him does he go to the ball itself)
        if (Actions.runOn(p)) { World.icX = ball.thruX; World.icZ = ball.thruZ; chase = 12.8; }
        var ix = World.icX - p.pos.x;
        var iz = World.icZ - p.pos.z;
        var il = Math.sqrt(ix * ix + iz * iz);
        if (il > 0.45) {
          mx = ix / il; mz = iz / il; len = 1;
          var arrive = 2 + il * 4; // slow down on arrival instead of overshooting
          speed = Math.min(chase || (sprint ? 13.4 : 11.6), arrive);
        } else {
          len = 0;
          p.facing = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
        }
        p.runToT = 0;
      } else if (len <= 0.1 && !has && p.runToT > 0) {
        // no stick input and a run was asked for (one-two): run into the space
        p.runToT -= dt;
        var rx = p.runToX - p.pos.x;
        var rz = p.runToZ - p.pos.z;
        var rl = Math.sqrt(rx * rx + rz * rz);
        if (rl > 0.8) { mx = rx / rl; mz = rz / rl; len = 1; speed = 11; }
      }

      var accel = dribbling ? 15 : 11;
      var k = Math.min(1, accel * dt);
      if (len > 0.1) {
        p.vel.x += (mx / len * speed - p.vel.x) * k;
        p.vel.z += (mz / len * speed - p.vel.z) * k;
        p.facing = Math.atan2(mx, mz);
        if (drain > 0) p.stamina = Math.max(5, p.stamina - drain * 0.5 * dt * p.drain); // his Stamina rating (x0.5: a full bar lasts two long runs)
        else p.stamina = Math.min(100, p.stamina + 3 * dt);
      } else {
        p.vel.x *= Math.max(0, 1 - 12 * dt);
        p.vel.z *= Math.max(0, 1 - 12 * dt);
        p.stamina = Math.min(100, p.stamina + 6 * dt);
      }
      p.dribbling = dribbling;
      p.carry = dribbling ? 0.7 + 0.45 * Math.abs(Math.sin(p.animPhase * 0.5)) : 0.95;
    }
  };
})(window.RS6 = window.RS6 || {});
