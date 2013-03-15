(function () {
  "use strict";

  var assert = typeof require === "function" && require("chai").assert ||
    window.chai.assert;
  var flexo = typeof require === "function" && require("flexo") || window.flexo;

  describe("Sanity tests", function () {
    describe("Bender", function () {
      it("is defined", function () {
        assert.isObject(bender);
      });
    });
  });

}());
