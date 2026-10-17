/* Human control: movement, dribble sprint, player switching and the button-map gesture engine.
 *
 * A "press event" starts when a button that takes part in a move goes down (a second button within 60 ms joins it as a
 * combination). With the ball the move is chosen by the button(s) and how long they were held and fires on release
 * (shots get their power from the hold time). Without the ball the move starts as soon as its gesture is reached
 * (tackle on press, press / team press while held). All of it comes from NS.Bindings, so the player can remap it.
 * Defaults: OK tap = low pass / tackle, OK hold = through ball / press, longer = long ball, longest = shot / team press,
 * CANCEL + OK = curve shot / slide tackle, CANCEL = one-two / switch player, RUN = sprint (with the ball: dribble sprint).
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Actions = NS.Actions;
  var Input = NS.Input;
  var B = NS.Bindings;
  var TH = B.TH;

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

  var MENU_HOLD = 1.0;
  var FULL_CHARGE = 1.28;

  function otherPlayer(slot) {
    var o = World.slots[1 - slot.idx];
    return o.active ? o.player : null;
  }

  function switchCursor(slot) {
    var ball = World.ball;
    var p = slot.player;
    var other = otherPlayer(slot);
    var o = ball.owner;
    if (o && o.team === slot.team && o !== p && o !== other) { slot.player = o; return; }
    var n = Actions.nearestToBall(slot.team, p, other);
    if (n) slot.player = n;
  }

  // Tackle when an opponent carries the ball close, otherwise switch to the player nearest the ball.
  function tackleOrSwitch(slot, slide) {
    var p = slot.player;
    var c = World.ball.owner;
    if (c && c.team !== p.team && !c.gkHands && p.tackleCd <= 0) {
      var dx = c.pos.x - p.pos.x;
      var dz = c.pos.z - p.pos.z;
      if (dx * dx + dz * dz < (slide ? 56 : 17.6)) { Actions.startTackle(p, c, true, slide); return; }
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
  }

  function shotPower(mi, d) {
    var v = 0.35 + (d - TH[B.lastTier]) * 0.9;
    return v < 0.35 ? 0.35 : (v > 1 ? 1 : v);
  }

  function fireAttack(slot, p, mi, d, pad) {
    var type;
    var follow = true;
    var power = 0.6;
    if (mi === I_LOW) type = ACT.PASS;
    else if (mi === I_THR) type = ACT.THROUGH;
    else if (mi === I_LONG) type = ACT.LONG;
    else if (mi === I_SHOOT) { type = ACT.SHOOT; power = shotPower(mi, d); follow = false; }
    else if (mi === I_CURVE) { type = ACT.CURVE; power = shotPower(mi, d); follow = false; }
    else if (mi === I_CHIP) { type = ACT.CHIP; power = shotPower(mi, d); follow = false; }
    else if (mi === I_ONETWO) { Actions.oneTwo(p, pad.x, pad.y); slot.lockT = 1.4; return; }
    else return;
    Actions.kick(p, type, power, pad.x, pad.y, 1);
    var target = Actions.lastTarget;
    // the receiver is the human's player right away (both switch modes): he goes to meet the ball
    if (follow && target && target !== otherPlayer(slot)) {
      slot.player = target;
      slot.lockT = type === ACT.LONG ? 2.2 : 1.6; // stay on the receiver while the ball travels
    }
  }

  // A pass is on its way and this player runs to it: the receiver, or the opponent nearest to it (until somebody has
  // the ball). Only this case moves a controlled player on his own (his arrow blinks).
  function receiving(p) {
    var ball = World.ball;
    return !ball.owner && (ball.receiver === p || ball.contester === p);
  }

  // A loose ball in the air right next to this player (a header is possible, nothing else).
  function airNear(p) {
    var ball = World.ball;
    if (ball.owner || ball.pos.y < 1.3) return false;
    var dx = ball.pos.x - p.pos.x, dz = ball.pos.z - p.pos.z;
    return dx * dx + dz * dz < 25;
  }

  // The ball is at head height, in reach, and this player is the closest one to it.
  function inHeadZone(p) { return Actions.canHead(p); }

  // Pass / through / long = headed pass; shot / curve / chip = headed shot.
  function header(slot, p, mi, pad) {
    var shot = mi === I_SHOOT || mi === I_CURVE || mi === I_CHIP;
    var type = mi === I_THR ? ACT.THROUGH : (mi === I_LONG ? ACT.LONG : ACT.PASS);
    Actions.header(p, shot, type, pad.x, pad.y);
    var t = Actions.lastTarget;
    if (!shot && t && t !== otherPlayer(slot)) { slot.player = t; slot.lockT = 1.6; }
  }

  function fireDefense(slot, mi) {
    if (mi === I_TACKLE) tackleOrSwitch(slot, false);
    else if (mi === I_SLIDE) tackleOrSwitch(slot, true);
    else if (mi === I_SWITCH) switchCursor(slot);
  }

  var assignT = 0;

  NS.Controls = {
    // The ball changed hands: a human team always controls its ball carrier (any switch mode), and a team that just
    // lost the ball may switch to a defender at once.
    claimBall: function (o) {
      if (!o) return;
      var pick = null;
      for (var i = 0; i < 2; i++) {
        var s = World.slots[i];
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
      var auto = World.settings.switchMode === 'AUTO';
      var ball = World.ball;
      var o = ball.owner;
      for (var i = 0; i < 2; i++) {
        var s = World.slots[i];
        if (!s.active) continue;
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
        if (rcv && rcv !== cur && rcv !== other) { s.player = rcv; continue; }
        if (s.lockT > 0 || s.evActive) continue; // never change player in the middle of a button gesture
        if (auto) {
          var n = Actions.nearestToBall(s.team, other, null);
          if (n && n !== cur) {
            var dn = (n.pos.x - ball.pos.x) * (n.pos.x - ball.pos.x) + (n.pos.z - ball.pos.z) * (n.pos.z - ball.pos.z);
            var dc = (cur.pos.x - ball.pos.x) * (cur.pos.x - ball.pos.x) + (cur.pos.z - ball.pos.z) * (cur.pos.z - ball.pos.z);
            if (cur.stun > 0 || dn < dc * 0.6 - 2) s.player = n;
          }
        }
      }
    },

    update: function (slot, dt) {
      var pad = Input.pads[slot.idx];
      var p = slot.player;
      if (!p) return;
      var ball = World.ball;
      if (slot.lockT > 0) slot.lockT -= dt;

      // hold CANCEL alone for a second: game menu (remote / keyboard; a gamepad has Start for that)
      if (pad.cur === NS.BTN.CANCEL) {
        pad.menuT += dt;
        if (pad.menuT > MENU_HOLD && !pad.menuFired) {
          pad.menuFired = true;
          endEvent(slot);
          NS.Match.requestMenu();
          return;
        }
      } else {
        pad.menuT = 0;
        pad.menuFired = false;
      }

      var rel = B.relevant();
      var cur = pad.cur & rel;
      var held = (pad.cur | pad.latch) & rel;
      pad.latch = 0;
      var rising = held & ~slot.evPrev;
      slot.evPrev = cur;

      if (slot.evActive && slot.evPlayer !== p) endEvent(slot);

      if (p.stun > 0 || p.tackleT > 0) {
        endEvent(slot);
        return;
      }

      var has = ball.owner === p;

      // ---- gesture engine ----
      if (rising) {
        if (slot.evActive && slot.evSettle > 0) {
          slot.evMask |= held;
        } else {
          slot.evActive = true;
          slot.evMask = held;
          slot.evT = 0;
          slot.evMove = -1;
          // 1 = with the ball, 3 = a ball in the air coming to us / next to us (header only), 2 = defending
          slot.evCtx = has ? 1 : ((receiving(p) || airNear(p)) ? 3 : 2);
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
            mv = B.resolve(1, slot.evMask, slot.evT);
            slot.chargeMove = mv;
            slot.chargeFrac = slot.evT > 0.06 ? Math.min(1, slot.evT / FULL_CHARGE) : -1;
            if (ended) {
              if (mv >= 0) fireAttack(slot, p, mv, slot.evT, pad);
              endEvent(slot);
              p = slot.player;
              has = ball.owner === p;
            }
          }
        } else if (slot.evCtx === 3) {
          mv = B.resolve(1, slot.evMask, slot.evT);
          if (mv < 0) mv = I_LOW;
          slot.chargeMove = mv;
          slot.chargeFrac = slot.evT > 0.06 ? Math.min(1, slot.evT / FULL_CHARGE) : -1;
          // A header happens only while the button is down and the ball is at head height next to him. Nothing is
          // ever stored for later: released early, or the ball came to his feet = no action (press again to play).
          if (has || ball.owner) {
            endEvent(slot);
          } else if (inHeadZone(p)) {
            header(slot, p, mv, pad);
            endEvent(slot);
            p = slot.player;
            has = false;
          } else if (ended) {
            endEvent(slot);
          }
        } else if (has) {
          endEvent(slot);
        } else {
          if (slot.evSettle <= 0 || ended) {
            mv = B.resolve(2, slot.evMask, slot.evT);
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
            slot.pressing = mv >= 0 && B.MOVES[mv].kind === 2;
            slot.teamPress = mv === I_TEAM;
          }
          if (ended) endEvent(slot);
        }
      }

      // keeper holding the ball: count down the 5 seconds he may keep it
      if (has && p.gkHands && p.gkHold > 2) {
        var left = Math.ceil(5 - p.gkHold);
        if (left !== slot.gkLeft) { slot.gkLeft = left; NS.HUD.hint(NS.I18n.t('hud.gk5').replace('%s', left), 1.1); }
      } else {
        slot.gkLeft = 0;
      }

      // ---- movement ----
      if (pad.burst) { pad.burst = false; if (p.stamina > 20) slot.burstT = 0.8; }
      if (slot.burstT > 0) slot.burstT -= dt;

      var mx = pad.x;
      var mz = pad.y;
      var len = Math.sqrt(mx * mx + mz * mz);
      var sprint = B.sprintDown(pad.cur) && p.stamina > 8;
      var dribbling = has && sprint;
      var burst = slot.burstT > 0;
      var charging = slot.evActive && slot.evCtx === 1 && slot.evT > 0.06;
      var speed;
      var drain = 0;
      if (has) {
        if (dribbling) { speed = 12.2; drain = 12; }
        else if (burst) { speed = 12.8; drain = 9; }
        else speed = 9.4;
        if (charging) speed *= 0.6;
      } else {
        if (slot.pressing) speed = 12.4;
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
      }

      // a pass is on its way to this player: he goes to meet it (a lofted ball: where it comes down, or at head
      // height when a header was asked for). The stick is ignored until somebody has the ball.
      if (!has && receiving(p)) {
        World.intercept(p, sprint ? 12.5 : 11, slot.evActive && slot.evCtx === 3 ? 3.1 : 1.9);
        var ix = World.icX - p.pos.x;
        var iz = World.icZ - p.pos.z;
        var il = Math.sqrt(ix * ix + iz * iz);
        if (il > 0.45) {
          mx = ix / il; mz = iz / il; len = 1;
          var arrive = 2 + il * 4; // slow down on arrival instead of overshooting
          speed = Math.min(sprint ? 13.4 : 11.6, arrive);
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
        if (drain > 0) p.stamina = Math.max(5, p.stamina - drain * dt);
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
