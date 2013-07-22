"use strict";

var assert = typeof require == "function" && require("chai").assert ||
  window.chai.assert;
var flexo = typeof require == "function" && require("flexo") || window.flexo;

describe("Loading components", function () {
  describe("bender.load_component(href | defaults[, env])", function () {
    it("loads a component at href (if the first parameter is a string) in a new environment", function (done) {
      bender.load_component("empty.xml").then(flexo.discard(done), done);
    });
    it("loads a component at defaults.href (if the first parameter is an object) in a new environment", function (done) {
      bender.load_component({ href: "empty.xml" }).then(flexo.discard(done), done);
    });
  });
});
