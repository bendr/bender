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

  describe("Rendering process", function () {
    var env = new bender.Environment;
    var component = env.component();
    var before_render = new flexo.Promise();
    component.on["before-render"] = function () {
      flexo.listen(component, "before-render!", function () {
        before_render.fulfill("ok");
      });
    };
    var after_render = new flexo.Promise();
    component.on["after-render"] = function () {
      flexo.listen(component, "after-render!", function () {
        if (before_render.value == "ok") {
          after_render.fulfill("ok");
        } else {
          ready.reject("not ready");
        }
      });
    };
    var before_init = new flexo.Promise();
    component.on["before-init"] = function () {
      flexo.listen(component, "before-init!", function () {
        if (after_render.value == "ok") {
          before_init.fulfill("ok");
        } else {
          ready.reject("not ready");
        }
      });
    };
    var after_init = new flexo.Promise();
    component.on["after-init"] = function () {
      flexo.listen(component, "after-init!", function () {
        if (before_init.value == "ok") {
          after_init.fulfill("ok");
        } else {
          ready.reject("not ready");
        }
      });
    };
    var ready = new flexo.Promise();
    component.on.ready = function () {
      flexo.listen(component, "ready!", function () {
        if (after_init.value == "ok") {
          ready.fulfill("ok");
        } else {
          ready.reject("not ready");
        }
      });
    };
    component.render(document.createDocumentFragment());
    it("render links (todo)");
    it("send a before-render notification", function (done) {
      before_render.then(flexo.discard(done), done);
    });
    it("send an after-render notification", function (done) {
      after_render.then(flexo.discard(done), done);
    });
    it("send a before-init notification", function (done) {
      before_init.then(flexo.discard(done), done);
    });
    it("send an after-init notification", function (done) {
      after_init.then(flexo.discard(done), done);
    });
    it("send a ready notification", function (done) {
      ready.then(flexo.discard(done), done);
    });
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
