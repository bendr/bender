"use strict";

Array.prototype.forEach.call("abcde", function (x) {
  bender.$[x] = Object.create(bender.instance);
  bender.$[x].did_render = function () {
    console.log("[{0}#{1}] did_render".fmt(x, this.seqno));
  };
});
