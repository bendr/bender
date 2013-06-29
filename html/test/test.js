(function () {
  "use strict";

  var assert = typeof require == "function" && require("chai").assert ||
    window.chai.assert;
  var flexo = typeof require == "function" && require("flexo") || window.flexo;

  describe("Bender", function () {
    it("is defined", function () {
      assert.isObject(bender);
    });
    it("is version %0".fmt(bender.version), flexo.nop);
    it("defines the namespace %0".fmt(bender.ns), flexo.nop);
  });

  describe("Runtime", function () {
    describe("bender.load_component([defaults, [env]])", function () {
      it("loads a component with the given defaults in the given environment", flexo.nop);
      it("uses the window’s parameters if no defaults are given", flexo.nop);
      it("creates a new environment if necessary", flexo.nop);
      var promise = bender.load_component({});
      it("returns a promise to be fulfilled with the loaded component", function () {
        assert.ok(promise instanceof flexo.Promise);
      });
      it("rejects the promise if no href property was given", function (done) {
        promise.then(done, flexo.discard(done));
      });
    });
  });

  describe("bender.Environment", function () {
  });

  describe("Test components", function () {
    describe("Empty component (empty.xml)", function () {
      var component;
      it("loads OK", function (done) {
        bender.load_component("empty.xml").then(function (c) {
          assert.ok(c instanceof bender.Component);
          component = c;
          done();
        }, done);
      });
      it("renders OK", function (done) {
        assert.ok(component instanceof bender.Component);
        component.on.ready = function () {
          done();
        };
        component.render(flexo.$div());
      });
    });
  });

}());
