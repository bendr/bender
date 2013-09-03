(function () {

  var lib = window.lib = { old_lib: window.lib, timer: {} };

  lib.timer.tick = function (rate_ms) {
    lib.timer.cancel.call(this);
    var tick = typeof rate_ms !== "number" || isNaN(rate_ms) || rate_ms <= 0 ?
      function () {
        this.scope.$this.notify("tick", Date.now());
        this.__frame = window.requestAnimationFrame(tick);
      }.bind(this) : function () {
        this.scope.$this.notify("tick", Date.now());
        this.__timeout = window.setTimeout(tick, rate_ms);
      }.bind(this);
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
