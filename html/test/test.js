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

  describe("bender.Component", function () {
    var env = new bender.Environment;
    var proto = env.component();
    proto.append_child(new bender.Property("a"));
    proto.append_child(new bender.Property("b"));
    var component = env.component();
    var watch = new bender.Watch;
    watch.id = "watch-1";
    describe("environment.component()", function () {
      it("creates a new component in the scope of its environment", function () {
        assert.ok(proto instanceof bender.Component);
        assert.ok(component instanceof bender.Component);
        assert.strictEqual(component.scope.$environment, env);
        assert.strictEqual(env.scope,
          Object.getPrototypeOf(Object.getPrototypeOf(component.scope)));
      });
    });
    describe("component.set_prototype()", function () {
      var c = component.set_prototype(proto);
      it("sets the $prototype property of a component", function () {
        assert.strictEqual(component.$prototype, proto);
      });
      it("adds the component to the list of derived components of its prototype", function () {
        assert.ok(component.$prototype.derived.indexOf(component) >= 0);
      });
      it("returns the component itself (for chaining)", function () {
        assert.strictEqual(c, component);
      });
      it("the component inherits the properties of its prototype", function () {
        assert.ok(proto.properties.hasOwnProperty("a"), "Proto has property a");
        assert.ok(component.properties.hasOwnProperty("a"),
          "Component inherits property a");
        assert.ok(proto.properties.hasOwnProperty("b"), "Proto has property b");
        assert.ok(component.properties.hasOwnProperty("b"),
          "Component inherits property b");
      });
    });
    describe("component.append_child()", function () {
      var link_script = new bender.Link(env, "script", "test-link.js");
      var link_stylesheet = new bender.Link(env, "stylesheet", "test-link.css");
      var view = new bender.View;
      var property_x = new bender.Property("x");
      describe("append a link", function () {
        it("adds to the .links array of the component", function () {
          component.append_child(link_script);
          component.append_child(link_stylesheet);
          assert.ok(component.links.indexOf(link_script) >= 0);
          assert.ok(component.children.indexOf(link_script) >= 0);
          assert.ok(component.links.indexOf(link_stylesheet) >= 0);
          assert.ok(component.children.indexOf(link_stylesheet) >= 0);
        });
      });
      describe("append a view", function () {
        it("sets the view of the component when adding a view", function () {
          component.append_child(view);
          assert.strictEqual(component.scope.$view, view);
        });
        it("the view can be set only once (setting another view is ignored with a warning)", function () {
          var view = new bender.View;
          component.append_child(view);
          assert.ok(component.scope.$view, view);
        });
      });
      describe("append a property", function () {
        it("creates a new property vertex when a property child is added", function () {
          component.append_child(property_x);
          assert.strictEqual(component.own_properties.x, property_x);
          assert.ok(component.properties.hasOwnProperty("x"));
          assert.ok(property_x.vertex instanceof bender.PropertyVertex);
        });
        it("creates property vertices for the derived components as well", function () {
          proto.append_child(new bender.Property("c"));
          assert.ok(component.properties.hasOwnProperty("c"),
            "new prototype property c is inherited by the component");
        });
      });
      describe("append a watch", function () {
        it("is added to the list of watches", function () {
          component.append_child(watch);
          assert.ok(component.watches.indexOf(watch) >= 0);
        });
      });
      describe("effects", function () {
        it("sets the parent property of the added child", function () {
          assert.strictEqual(link_script.parent, component);
          assert.strictEqual(link_stylesheet.parent, component);
          assert.strictEqual(view.parent, component);
          assert.strictEqual(property_x.parent, component);
          assert.strictEqual(watch.parent, component);
        });
        it("adds children with id (and their descendants with id) to the scope of the component", function () {
          assert.ok(Object.getPrototypeOf(component.scope)
            .hasOwnProperty("#watch-1"));
          assert.ok("#watch-1" in component.scope);
          assert.strictEqual(component.scope["#watch-1"], watch);
        });
      });
    });
  });

  describe("bender.View", function () {
    describe("new bender.View", function () {
      it("creates a new view, with no children and no id", function () {
        var v = new bender.View;
        assert.ok(v instanceof bender.View);
        assert.deepEqual(v.children, []);
        assert.strictEqual(v.id, "");
      });
    });
    describe("view.append_child", function () {
      it("appends child components to the parent component of the view, if any", function () {
        var env = new bender.Environment;
        var ch1 = env.component();
        var ch2 = env.component();
        var parent = env.component();
        var view = new bender.View;
        view.append_child(ch1);
        assert.strictEqual(ch1.parent, view);
        assert.strictEqual(ch1.parent_component, undefined);
        parent.append_child(view);
        assert.strictEqual(view.parent, parent);
        assert.strictEqual(ch1.parent_component, parent);
        view.append_child(ch2);
        assert.strictEqual(ch2.parent, view);
        assert.strictEqual(ch2.parent_component, parent);
        assert.strictEqual(parent.child_components.length, 2);
      });
    });
  });

  function test_render(component) {
    var promises = {
      before_render: new flexo.Promise,
      after_render: new flexo.Promise,
      before_init: new flexo.Promise,
      after_init: new flexo.Promise,
      ready: new flexo.Promise
    };
    component.on["before-render"] = function () {
      promises.before_render.fulfill("ok");
    };
    component.on["after-render"] = function () {
      if (promises.before_render.value == "ok") {
        promises.after_render.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on["before-init"] = function () {
      if (promises.after_render.value == "ok") {
        promises.before_init.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on["after-init"] = function () {
      if (promises.before_init.value == "ok") {
        promises.after_init.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on.ready = function () {
      if (promises.after_init.value == "ok") {
        promises.ready.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.render(flexo.$div());
    it("render links (todo)");
    it("send a before-render notification", function (done) {
      promises.before_render.then(flexo.discard(done), done);
    });
    it("send an after-render notification", function (done) {
      promises.after_render.then(flexo.discard(done), done);
    });
    it("send a before-init notification", function (done) {
      promises.before_init.then(flexo.discard(done), done);
    });
    it("send an after-init notification", function (done) {
      promises.after_init.then(flexo.discard(done), done);
    });
    it("send a ready notification", function (done) {
      promises.ready.then(flexo.discard(done), done);
    });
    return promises;
  }

  describe("Rendering process", function () {
    var env = new bender.Environment;
    describe("empty component", function () {
      test_render(env.component());
    });
    describe("component with a simple view", function () {
      var component = env.component();
      component.append_child(new bender.View);
      it("the component has a view", function () {
        assert.ok(component.scope.$view instanceof bender.View);
      });
      component.scope.$view
        .append_child(new bender.DOMTextNode("Hello, world!"));
      test_render(component);
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
