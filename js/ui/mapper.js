/* Button capture for the mapping screen. It listens to the controller buttons (js/core/gamepad.js: every button of a
 * game controller or a phone controller, by its standard position), so one map works for all of them.
 * The player presses the button (or two buttons together); the result is the button combination (how long it was held
 * does not matter: holding only changes the power of a pass / shot or keeps a press going).
 * No button cancels a capture (any button may be the one to map): it ends by itself after TIMEOUT seconds without a press. */
(function (NS) {
  'use strict';

  var TIMEOUT = 5;

  var on = false;
  var cbDone = null;
  var cbLive = null;
  var cbTick = null;
  var held = 0;
  var peak = 0;
  var firstAt = 0;
  var startAt = 0;
  var ignore = 0;       // buttons already down when capture started (the OK that opened it)
  var timer = 0;
  var left = 0;

  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  function finish(mask, dur) {
    on = false;
    stopTimer();
    var cb = cbDone;
    cbDone = null;
    cbLive = null;
    cbTick = null;
    if (cb) cb(mask);
  }

  // one-second countdown while nothing is pressed; at 0 the capture gives up
  function tick() {
    timer = 0;
    if (!on) return;
    if (held) { timer = setTimeout(tick, 1000); return; } // a button is down: wait for its release
    left--;
    if (left <= 0) { finish(0, 0); return; }
    if (cbTick) cbTick(left);
    timer = setTimeout(tick, 1000);
  }

  NS.Mapper = {
    TIMEOUT: TIMEOUT,
    active: function () { return on; },

    // onDone(mask) (mask 0 = nothing detected in time), onLive(mask) while buttons are down, onTick(secondsLeft).
    start: function (onDone, onLive, onTick) {
      on = true;
      held = 0;
      peak = 0;
      ignore = 0;
      cbDone = onDone;
      cbLive = onLive;
      cbTick = onTick;
      startAt = performance.now();
      left = TIMEOUT;
      stopTimer();
      timer = setTimeout(tick, 1000);
      if (cbTick) cbTick(left);
    },

    // only when the whole game is paused or closed (My PC's menu), never from a button
    cancel: function () {
      if (!on) return;
      on = false;
      stopTimer();
      cbDone = null;
      cbLive = null;
      cbTick = null;
    },

    // Fed by NS.Input for every button press / release while capturing.
    button: function (bit, pressed) {
      if (!on) return;
      if (pressed) {
        if (performance.now() - startAt < 300) { ignore |= bit; return; }
        if (!held) { firstAt = performance.now(); peak = 0; }
        held |= bit;
        peak |= bit;
        left = TIMEOUT;
        if (cbLive) cbLive(peak);
      } else {
        if (ignore & bit) { ignore &= ~bit; return; }
        held &= ~bit;
        if (!held && peak) finish(peak, (performance.now() - firstAt) / 1000);
      }
    }
  };
})(window.RS6 = window.RS6 || {});
