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

  describe("Runtime API", function () {
    describe("bender.load_app(target, url, env, k)", function () {
      it("Loads a Bender application from an XML file at url into the target", function (done) {
        var target = flexo.$div();
        var env = bender.load_app(target, flexo.discard(done));
      });
    });
  });

}());
