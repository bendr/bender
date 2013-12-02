(function () {

  var lib = window.lib = { old_lib: window.lib, timer: {} };

  // TODO frame/asap
  lib.timer.tick = function (rate_ms) {
    lib.timer.cancel.call(this);
    var tick = (rate_ms >= 0 ?
      function () {
        this.notify("tick", { t: Date.now() });
        this.__timeout = window.setTimeout(tick, rate_ms);
      } : function () {
        this.notify("tick", { t: Date.now() });
        this.__frame = window.requestAnimationFrame(tick);
      }).bind(this);
    tick();
  };

  lib.timer.cancel = function () {
    if (this.__timeout) {
      window.clearTimeout(this.__timeout);
      delete this.__timeout;
    } else if (this.__frame) {
      window.cancelAnimationFrame(this.__frame);
      delete this.__frame;
    }
  };

}());
