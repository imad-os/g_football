/* Human control: movement, dribble, the action button (pass / through / long / shot / tackle / press) and player switching.
 *
 * One button is enough (TV remote: arrows + OK):
 *   with the ball  : tap OK = pass, hold a little = through ball, longer = long ball, longest = shot (power grows)
 *                    OK + RUN (B / Shift / X) = shot straight away, RUN alone = dribble sprint
 *   without ball   : tap OK = tackle (if an opponent carries the ball close), otherwise switch player
 *                    hold OK = press the ball carrier (team-mates close in too)
 *   CANCEL (C / Backspace) = switch player, hold CANCEL = open the game menu
 *   double-tap a direction = sprint burst
 */
(function (NS) {
  'use strict';

  var World = NS.World;
  var ACT = NS.ACT;
  var Z = NS.ZONES;
  var Actions = NS.Actions;
  var Input = NS.Input;

  function otherPlayer(slot) {
    var o = World.slots[1 - slot.idx];
    return o.active ? o.player : null;
  }

  function zoneType(t, direct) {
    if (direct) return ACT.SHOOT;
    if (t < Z.PASS_MAX) return ACT.PASS;
    if (t < Z.THROUGH_MAX) return ACT.THROUGH;
    if (t < Z.LONG_MAX) return ACT.LONG;
    return ACT.SHOOT;
  }

  function shotPower(t, direct) {
    var v;
    if (direct) v = 0.3 + t / 0.9 * 0.7;
    else v = 0.4 + (t - Z.LONG_MAX) / (Z.SHOOT_FULL - Z.LONG_MAX) * 0.6;
    return v < 0.3 ? 0.3 : (v > 1 ? 1 : v);
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

  function tackleOrSwitch(slot) {
    var p = slot.player;
    var c = World.ball.owner;
    if (c && c.team !== p.team && p.tackleCd <= 0) {
      var dx = c.pos.x - p.pos.x;
      var dz = c.pos.z - p.pos.z;
      if (dx * dx + dz * dz < 17.6) { Actions.startTackle(p, c, true); return; }
    }
    switchCursor(slot);
  }

  function resetCharge(slot) {
    slot.charging = false;
    slot.pressing = false;
    slot.holdArmed = false;
    slot.chargeType = 0;
    slot.chargeFrac = 0;
  }

  var assignT = 0;

  NS.Controls = {
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
        if (s.lockT > 0 && !o) continue;
        if (o && o.team === s.team) {
          if (auto && o !== cur && o !== other) s.player = o;
        } else if (auto) {
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

      // cancel: tap = switch player, hold = game menu
      if (pad.cancelHeld) {
        pad.cancelT += dt;
        // gamepad B sends RUN + CANCEL together: holding it to sprint must not open the menu
        if (pad.run) pad.cancelFired = true;
        else if (pad.cancelT > 0.6 && !pad.cancelFired) { pad.cancelFired = true; NS.Match.requestMenu(); }
      }
      if (pad.cancelUp) {
        pad.cancelUp = false;
        if (!pad.cancelFired && pad.cancelT < 0.35 && ball.owner !== p) { switchCursor(slot); p = slot.player; }
        pad.cancelT = 0;
      }

      if (p.stun > 0 || p.tackleT > 0) {
        pad.okDown = false;
        if (pad.okUp) { pad.okUp = false; resetCharge(slot); }
        return;
      }

      var has = ball.owner === p;

      if (pad.okDown) {
        pad.okDown = false;
        slot.okT = 0;
        slot.pressing = false;
        if (has) {
          slot.charging = true;
          slot.direct = pad.run;
          slot.holdArmed = false;
        } else {
          slot.charging = false;
          slot.holdArmed = true;
          tackleOrSwitch(slot);
          p = slot.player;
          has = ball.owner === p;
          if (p.tackleT > 0) return;
        }
      }

      if (pad.ok) {
        slot.okT += dt;
        if (!has && slot.holdArmed && slot.okT > 0.28) slot.pressing = true;
      }
      if (has) slot.pressing = false;

      if (slot.charging) {
        if (!has) {
          resetCharge(slot);
        } else {
          slot.chargeType = zoneType(slot.okT, slot.direct);
          slot.chargeFrac = slot.direct ? 0.45 + 0.55 * Math.min(1, slot.okT / 0.9) : Math.min(1, slot.okT / Z.SHOOT_FULL);
        }
      }

      if (pad.okUp) {
        pad.okUp = false;
        if (slot.charging && has) {
          var type = zoneType(slot.okT, slot.direct);
          var power = type === ACT.SHOOT ? shotPower(slot.okT, slot.direct) : 0.6;
          Actions.kick(p, type, power, pad.x, pad.y, 1);
          var target = Actions.lastTarget;
          if (target && type !== ACT.SHOOT && World.settings.switchMode === 'AUTO' && target !== otherPlayer(slot)) {
            slot.player = target;
            slot.lockT = 1.2; // stay on the receiver while the ball travels
          }
        }
        resetCharge(slot);
        p = slot.player;
        has = ball.owner === p;
      }

      // ---- movement ----
      if (pad.burst) { pad.burst = false; if (p.stamina > 20) slot.burstT = 0.8; }
      if (slot.burstT > 0) slot.burstT -= dt;

      var mx = pad.x;
      var mz = pad.y;
      var len = Math.sqrt(mx * mx + mz * mz);
      var sprint = pad.run && p.stamina > 8;
      var dribbling = has && pad.run;
      var burst = slot.burstT > 0;
      var speed;
      var drain = 0;
      if (has) {
        if (dribbling) { speed = 12.2; drain = 12; }
        else if (burst) { speed = 12.8; drain = 9; }
        else speed = 9.4;
        if (slot.charging) speed *= 0.6;
      } else {
        if (slot.pressing) speed = 12.4;
        else if (sprint) { speed = 13.4; drain = 14; }
        else if (burst) { speed = 13.0; drain = 9; }
        else speed = 10.8;
      }

      // pressing: lean towards the ball carrier even without input
      var carrier = ball.owner;
      if (slot.pressing && carrier && carrier.team !== p.team) {
        var cx = carrier.pos.x - p.pos.x;
        var cz = carrier.pos.z - p.pos.z;
        var cl = Math.sqrt(cx * cx + cz * cz) || 1;
        if (len > 0.1) { mx = mx / len * 0.5 + cx / cl * 0.5; mz = mz / len * 0.5 + cz / cl * 0.5; }
        else { mx = cx / cl; mz = cz / cl; }
        len = Math.sqrt(mx * mx + mz * mz) || 1;
        World.pressT[p.team] = 0.3;
      }

      // no stick input but a pass was played into space for this player: run onto it
      if (len <= 0.1 && !has && p.runToT > 0) {
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
