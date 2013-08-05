"use strict";

var assert = chai.assert;

var env = new bender.Environment();

function ok(src, f) {
  it(src, function (done) {
    var div = document.getElementById("targets")
      .appendChild(flexo.$div());
    bender.load_component(src, env).then(function (component) {
      assert.ok(component instanceof bender.Component);
      component.render_component(div).then(function (instance) {
        assert.strictEqual(instance.component, component);
        if (f) {
          try {
            f(instance);
            done();
          } catch (e) {
            done(e);
          }
        } else {
          done();
        }
      }, done);
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
    ok("hello.xml");
    ok("will-render.xml", function () {
      assert.strictEqual(window.__WILL_RENDER, true);
      delete window.__WILL_RENDER;
    });
  });

  describe("Failure", function () {
    fail_load("wrong-ill-formed.xml");
    fail_load("wrong-not-component.xml");
    fail_load("wrong-self-prototype.xml");
  });

});
