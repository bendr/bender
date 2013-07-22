"use strict";

var assert = typeof require == "function" && require("chai").assert ||
  window.chai.assert;
var flexo = typeof require == "function" && require("flexo") || window.flexo;

describe("Loading components", function () {

  var env;

  describe("bender.load_component([href | defaults[, env]])", function () {
    it("loads a component at href (if the first parameter is a string) in a new environment", function (done) {
      var p = bender.load_component("empty.xml");
      p.then(function (component) {
        assert.ok(component instanceof bender.Component);
        env = component.scope.$environment;
        done();
      }, done);
    });
    it("loads a component at defaults.href (if the first parameter is an object) in a new environment", function (done) {
      bender.load_component({ href: "empty.xml" }).then(flexo.discard(done), done);
    });
    it("uses the URL arguments if no defaults object is given", flexo.nop);
    it("creates a new environment for the current document is no environment argument is given", flexo.nop);
    it("uses the given environment otherwise", function (done) {
      var href = flexo.normalize_uri(document.baseURI, "empty.xml");
      var p = env.urls[href];
      assert.ok(p instanceof flexo.Promise);
      assert.ok(p.value instanceof bender.Component);
      bender.load_component(href, env).then(function (component) {
        assert.strictEqual(component, p.value);
        done();
      }, done);
    });
    it("returns the promise of a component which gets fulfilled once the component is loaded and fully deserialized", function (done) {
      var p = bender.load_component("empty.xml", env);
      assert.ok(p instanceof flexo.Promise);
      p.then(flexo.discard(done), done);
    });
    it("rejects the returned promise if no href parameter is given", function (done) {
      bender.load_component().then(done, flexo.discard(done));
    })
  });

  describe("bender.Environment.load_component(url)", function () {
    it("does the actual loading of the component at url", function (done) {
      var href = flexo.normalize_uri(document.baseURI, "empty.xml");
      var p = env.urls[href];
      env.load_component(href).then(function (component) {
        assert.strictEqual(component, p.value);
        done();
      }, done);
    });
    it("rejects the promise if loading fails with the message “XHR error”", function (done) {
      env.load_component(flexo.normalize_uri(document.baseURI, "nothing here"))
        .then(done, function (reason) {
          assert.strictEqual(reason.message, "XHR error");
          assert.ok("request" in reason);
          done();
        });
    });
    it("rejects the promise if the resource was loaded but is not a well-formed XML document with the message “missing response”", function (done) {
      var f = function (_, url) {
        return env.load_component(flexo.normalize_uri(document.baseURI, url))
          .then(done, function (reason) {
            assert.strictEqual(reason.message, "missing response");
            assert.ok("request" in reason);
          });
      };
      flexo.promise_fold(["test.js", "wrong-ill-formed.xml"], f)
        .then(flexo.discard(done));
    });
    it("rejects the promise if an XML resource was loaded but is not a Bender component", function (done) {
      env.load_component(flexo.normalize_uri(document.baseURI, "wrong-not-component.xml"))
        .then(done, function (reason) {
          assert.strictEqual(reason.message, "not a Bender component");
          assert.ok("response" in reason);
          done();
        });
    });
  });

});

describe("Deserialization", function () {

});
