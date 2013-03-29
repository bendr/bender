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

  var env = bender.init_environment();
  var hello, sample;

  describe("Deserialization", function () {
    describe("hello.xml", function () {
      it("is deserialized into a component", function (done) {
        env.load_component("hello.xml", function (d) {
          assert.isObject(d);
          hello = d;
          done();
        });
      });
    });
    describe("sample.xml", function () {
      it("is deserialized into a component", function (done) {
        env.load_component("sample.xml", function (d) {
          assert.isObject(d);
          sample = d;
          done();
        });
      });
    });
  });

  describe("Rendering", function () {
    describe("hello.xml", function () {
      it("is rendered correctly", function (done) {
        var div = document.createElement("div");
        env.render_component(hello, div, function () {
          assert.strictEqual(div.textContent.trim(), "Hello, world!");
          done();
        });
      });
    });
    describe("sample.xml", function () {
      it("is rendered correctly", function (done) {
        var div = document.createElement("div");
        env.render_component(sample, div, function () {
          assert.strictEqual(div.textContent.trim().replace(/\s+/g, " "),
            "Number of clicks: +1 -1");
          done();
        });
      });
    });
  });

}());
