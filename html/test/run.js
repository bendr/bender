"use strict";

var assert = chai.assert;

var env = new bender.Environment();

function ok(src, f) {
  it(src, function (done) {
    var div = document.getElementById("targets").appendChild(flexo.$div(
        flexo.$div(
          flexo.$a({ href: "../runtime.html?href=test/%0".fmt(src) }, src))));
    bender.load_component(src, env).then(function (component) {
      assert.ok(component instanceof bender.Component);
      component.render_component(div).then(function (instance) {
        assert.strictEqual(instance.component, component);
        assert.strictEqual(instance.scope.$target, div);
        if (f) {
          f(instance);
        }
      }).then(flexo.discard(done), done);
    }, function (reason) {
      done(reason.message || reason);
    });
  });
}

function fail_load(src, f) {
  it(src, function (done) {
    bender.load_component(src, env).then(done, function (reason) {
      if (f) {
        try {
          f(reason);
          done();
        } catch (e) {
          done(e);
        }
      } else {
        done();
      }
    });
  });
}

describe("Bender tests", function () {

  describe("Success", function () {
    ok("empty.xml");
    ok("hello.xml", function (instance) {
      assert.ok(instance.scope.$target.textContent.match(/hello, world/i));
    });
    ok("hello-derived.xml");
    ok("will-render.xml", function () {
      assert.strictEqual(window.__WILL_RENDER, true);
      delete window.__WILL_RENDER;
    });
    ok("sub-component.xml", function (instance) {
      assert.ok(instance.scope.$target.textContent.match(/hello, world/i));
    });
  });

  describe("Failure", function () {
    fail_load("wrong-ill-formed.xml");
    fail_load("wrong-not-component.xml");
    fail_load("wrong-self-prototype.xml");
  });

});
