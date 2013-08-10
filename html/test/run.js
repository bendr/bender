"use strict";

var assert = chai.assert;

var env = new bender.Environment();

function contains(str, sub) {
  return flexo.safe_string(str).trim().replace(/\s+/g, " ").indexOf(sub) >= 0;
}

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
          return f(instance);
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
      assert.strictEqual(instance.component.id(), "hello");
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
    ok("sub-component-inline.xml", function (instance) {
      assert.ok(instance.scope.$target.textContent.match(/hello, world/i));
    });
    ok("content.xml", function (instance) {
      assert.ok(instance.scope.$target.textContent
        .match(/not always the same/));
    });
    ok("content-twice.xml", function (instance) {
      assert.ok(instance.scope.$target.textContent
        .match(/not always the same/));
      assert.ok(instance.scope.$target.textContent
        .match(/quite different!/));
    });
    ok("show-property.xml", function (instance) {
      return flexo.promise_delay(function () {
        assert.ok(contains(instance.scope.$target.textContent, "x = ✌✌✌"));
      });
    });
    ok("binding-watch.xml", function (instance) {
      return flexo.promise_delay(function () {
        assert.ok(contains(instance.scope.$target.textContent, "6 × 7 = 42"));
        assert.ok(instance.scope.$target.querySelector(".hidden"));
      });
    });
  });

  describe("Failure", function () {
    fail_load("wrong-ill-formed.xml");
    fail_load("wrong-not-component.xml");
    fail_load("wrong-self-prototype.xml");
  });

});
