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
    var proto = env.component().property("a").property("b");
    var component = env.component();
    var watch = new bender.Watch().id("watch-1");
    describe("environment.component()", function () {
      it("creates a new component in the scope of its environment", function () {
        assert.ok(proto instanceof bender.Component);
        assert.ok(component instanceof bender.Component);
        assert.ok(component instanceof bender.Element);
        assert.strictEqual(component.scope.$environment, env);
        assert.strictEqual(env.scope,
          Object.getPrototypeOf(Object.getPrototypeOf(component.scope)));
      });
    });
    describe("component.extends()", function () {
      var c = component.extends(proto);
      it("sets the prototype of a component", function () {
        assert.strictEqual(component.extends(), proto);
      });
      it("adds the component to the list of derived components of its prototype", function () {
        assert.ok(component.extends().derived.indexOf(component) >= 0);
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
          assert.strictEqual(component.property_vertices[property_x.name],
            property_x.vertex);
        });
        it("creates property vertices for the derived components as well", function () {
          proto.append_child(new bender.Property("c"));
          assert.ok(component.properties.hasOwnProperty("c"),
            "new prototype property c is inherited by the component");
          assert.ok(component.property_vertices.c instanceof
            bender.PropertyVertex);
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
    describe("Scope", function () {
      it("contains all ids in the scope of a component", function () {
        var parent = env.component().id("A");
        assert.strictEqual(parent.scope["#A"], parent);
        var child = env.component().id("B");
        assert.strictEqual(child.scope["#B"], child);
        var view = new bender.View;
        view.append_child(child);
        parent.append_child(view);
        assert.strictEqual(parent.scope.$view, view);
        assert.strictEqual(parent.scope["#A"], parent);
        assert.strictEqual(parent.scope["#B"], child);
        assert.strictEqual(child.scope.$view, undefined);
        assert.strictEqual(child.scope["#A"], parent);
        assert.strictEqual(child.scope["#B"], child);
        var sibling = env.component().id("C");
        view.append_child(sibling);
        assert.strictEqual(sibling.scope.$view, undefined);
        assert.strictEqual(sibling.scope["#A"], parent);
        assert.strictEqual(sibling.scope["#B"], child);
        assert.strictEqual(parent.scope["#C"], sibling);
        assert.strictEqual(child.scope["#C"], sibling);
        assert.strictEqual(sibling.scope["#C"], sibling);
      });
    });
    describe("component.render_component(target[, ref])", function () {
      var env = new bender.Environment;
      var component = env.component();
      var instance;
      it("renders the component in the target", function (done) {
        component.id("k");
        var fragment = component.scope.$document.createDocumentFragment();
        component.on["did-render"] = function (i) {
          assert.ok(i instanceof bender.ConcreteInstance);
          instance = i;
        };
        component.on.ready = flexo.discard(done);
        component.render_component(fragment).then(null, done);
      });
      it("renders links (scripts and stylesheets) first", function () {
        var env = new bender.Environment;
        var a = env.component();
      });
      it("sets the ids for the concrete instance", function () {
        assert.strictEqual(component.instances.length, 1);
        assert.strictEqual(component.instances[0], instance);
        assert.strictEqual(instance.scope["@k"], instance);
      });
      it("renders property vertices", function (done) {
        var env = new bender.Environment;
        var a = env.component().child(new bender.Property("x"));
        var b = env.component().extends(a).child(new bender.Property("y"));
        var c = env.component().extends(b).child(new bender.Property("x"));
        var d = env.component().extends(c);
        d.on["did-render"] = function (r) {
          assert.ok(a.property_vertices.x instanceof bender.PropertyVertex);
          assert.ok(b.property_vertices.x instanceof bender.PropertyVertex);
          assert.ok(b.property_vertices.y instanceof bender.PropertyVertex);
          assert.ok(c.property_vertices.x instanceof bender.PropertyVertex);
          assert.ok(c.property_vertices.y instanceof bender.PropertyVertex);
          assert.ok(d.property_vertices.x instanceof bender.PropertyVertex);
          assert.ok(d.property_vertices.y instanceof bender.PropertyVertex);
          assert.ok(r.property_vertices.x instanceof bender.PropertyVertex);
          assert.ok(r.property_vertices.y instanceof bender.PropertyVertex);
          assert.strictEqual(r.property_vertices.x.protovertices.length, 3);
          assert.strictEqual(r.property_vertices.y.protovertices.length, 5);
        };
        d.on.ready = flexo.discard(done);
        d.render_component(d.scope.$document.createDocumentFragment());
      });
      it("parent/child components relationships are maintained in concrete components", function (done) {
        var env = new bender.Environment;
        var d = env.component().id("D");
        var c = env.component().id("C").view(new bender.View().child(d));
        var b = env.component().id("B");
        var a = env.component().id("A").view().view(b, c);
        assert.ok(a.scope.$view instanceof bender.View);
        assert.strictEqual(a.child_components.length, 2);
        assert.strictEqual(b.child_components.length, 0);
        assert.strictEqual(c.child_components.length, 1);
        a.on["did-render"] = function (r) {
          try {
            assert.strictEqual(r.component, a);
            assert.strictEqual(r.child_components.length, 2);
          } catch (e) {
            done(e);
          }
        };
        a.on.ready = flexo.discard(done);
        a.render_component(a.scope.$document.createDocumentFragment());
      });
    });
  });

  describe("bender.Link", function () {
    var env = new bender.Environment;
    describe("new bender.Link(environment, rel, href)", function () {
      it("creates a new link in the environment", function () {
        var l = new bender.Link(env, "script", "a1.js");
        assert.ok(l instanceof bender.Link);
        assert.strictEqual(l.rel, "script");
      });
    });
  });

  describe("bender.View", function () {
    describe("new bender.View", function () {
      it("creates a new view, with no children and no id", function () {
        var v = new bender.View;
        assert.ok(v instanceof bender.View);
        assert.deepEqual(v.children, []);
        assert.strictEqual(v.id(), "");
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

  describe("bender.DOMElement", function () {
    describe("new bender.DOMElement(ns, name)", function () {
      it("creates a new element node with the given namespace and local name", function () {
        var elem = new bender.DOMElement(flexo.ns.html, "p");
        assert.ok(elem instanceof bender.DOMElement);
        assert.deepEqual(elem.children, []);
        assert.strictEqual(elem.id(), "");
        assert.strictEqual(elem.ns, flexo.ns.html);
        assert.strictEqual(elem.name, "p");
      });
    });
    describe("elem.append_child", function () {
      it("appends child components to the parent component, if any", function () {
        var env = new bender.Environment;
        var a = env.component().id("a");
        var b = env.component().id("b");
        var c = env.component();
        var div = new bender.DOMElement(flexo.ns.html, "div");
        var view = new bender.View;
        view.append_child(div);
        div.append_child(b);
        a.append_child(view);
        div.append_child(c);
        c.id("c");
        assert.strictEqual(b.parent, div);
        assert.strictEqual(b.parent_component, a);
        assert.strictEqual(c.parent, div);
        assert.strictEqual(c.parent_component, a);
        assert.strictEqual(a.scope["#b"], b);
        assert.strictEqual(b.scope["#c"], c);
        assert.strictEqual(c.scope["#a"], a);
      });
    });
  });

  function test_render(component) {
    var promises = {
      will_render: new flexo.Promise,
      did_render: new flexo.Promise,
      will_init: new flexo.Promise,
      did_init: new flexo.Promise,
      ready: new flexo.Promise
    };
    component.on["will-render"] = function () {
      promises.will_render.fulfill("ok");
    };
    component.on["did-render"] = function () {
      if (promises.will_render.value == "ok") {
        promises.did_render.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on["will-init"] = function () {
      if (promises.did_render.value == "ok") {
        promises.will_init.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on["did-init"] = function () {
      if (promises.will_init.value == "ok") {
        promises.did_init.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.on.ready = function () {
      if (promises.did_init.value == "ok") {
        promises.ready.fulfill("ok");
      } else {
        promises.ready.reject("not ready");
      }
    };
    component.render_component(flexo.$div());
    it("render links (todo)");
    it("send a will-render notification", function (done) {
      promises.will_render.then(flexo.discard(done), done);
    });
    it("send a did-render notification", function (done) {
      promises.did_render.then(flexo.discard(done), done);
    });
    it("send a will-init notification", function (done) {
      promises.will_init.then(flexo.discard(done), done);
    });
    it("send a did-init notification", function (done) {
      promises.did_init.then(flexo.discard(done), done);
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
        component.render_component(flexo.$div());
      });
    });
  });

}());
