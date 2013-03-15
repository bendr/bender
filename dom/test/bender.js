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
      it("is deserialized into a component", function (done) {
        bender.init_environment().load_component("hello.xml", function (d) {
          assert.isObject(d);
          console.log(d);
          done();
        });
      });
    });
    describe("sample.xml", function () {
      it("is deserialized into a component", function (done) {
        bender.init_environment().load_component("sample.xml", function (d) {
          assert.isObject(d);
          console.log(d);
          done();
        });
      });
    });
  });

}());
