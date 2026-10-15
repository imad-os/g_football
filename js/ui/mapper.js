/* Button capture for the mapping screen. It listens to the real presses My PC delivers (OK = jump, RUN, CANCEL):
 * the player presses the button (or two buttons together) and holds it for as long as the gesture needs.
 * The result is the button combination plus the gesture tier, taken from how long it was held. */
(function (NS) {
  'use strict';

  var on = false;
  var cbDone = null;
  var cbLive = null;
  var held = 0;
  var peak = 0;
  var firstAt = 0;
  var startAt = 0;
  var ignore = 0;       // buttons already down when capture started (the OK that opened it)
  var timer = 0;
  var sprintOnly = false;

  function finish(mask, dur) {
    on = false;
    clearTimeout(timer);
    var cb = cbDone;
    cbDone = null;
    cbLive = null;
    if (cb) cb(mask, mask ? NS.Bindings.tierOf(dur) : 0);
  }

  NS.Mapper = {
    active: function () { return on; },

    // onDone(mask, tier) (mask 0 = nothing detected), onLive(mask) while buttons are down.
    start: function (isSprint, onDone, onLive) {
      sprintOnly = isSprint;
      on = true;
      held = 0;
      peak = 0;
      ignore = 0;
      cbDone = onDone;
      cbLive = onLive;
      startAt = performance.now();
      clearTimeout(timer);
      timer = setTimeout(function () { if (on && !held) finish(0, 0); }, 15000);
    },

    cancel: function () {
      if (!on) return;
      on = false;
      clearTimeout(timer);
      cbDone = null;
      cbLive = null;
    },

    // Fed by NS.Input for every button press / release while capturing.
    button: function (bit, pressed) {
      if (!on) return;
      if (pressed) {
        if (performance.now() - startAt < 300) { ignore |= bit; return; }
        if (!held) { firstAt = performance.now(); peak = 0; }
        held |= bit;
        peak |= bit;
        if (cbLive) cbLive(peak);
      } else {
        if (ignore & bit) { ignore &= ~bit; return; }
        held &= ~bit;
        if (!held && peak) finish(peak, (performance.now() - firstAt) / 1000);
      }
    },
    isSprintCapture: function () { return sprintOnly; }
  };
})(window.RS6 = window.RS6 || {});
