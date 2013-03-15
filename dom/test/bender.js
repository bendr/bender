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

  describe("Deserialization", function () {
    describe("hello.xml", function () {
      var env = bender.init_environment();
      var component;
      it("is deserialized into a component", function (done) {
        env.load_component("hello.xml", function (d) {
          assert.isObject(d);
          component = d;
          done();
        });
      });
      it("is rendered correctly", function () {
        var div = document.createElement("div");
        env.render_component(component, div);
        assert.strictEqual(div.textContent.trim(), "Hello, world!");
      });
    });
    describe("sample.xml", function () {
      it("is deserialized into a component", function (done) {
        bender.init_environment().load_component("sample.xml", function (d) {
          assert.isObject(d);
          done();
        });
      });
    });
  });

}());
