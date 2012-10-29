(function (assert, flexo, bender) {
  "use strict";

  describe("Bender namespace ({0})".fmt(flexo.ns.bender), function () {
    it("extends flexo to create elements in the Bender namespace with the \"bender\" prefix", function () {
      var app = flexo.$("bender:app");
      assert.strictEqual(app.namespaceURI, bender.NS);
      assert.strictEqual(app.localName, "app");
    });
  });

  describe("Bender context", function () {

    var context = bender.create_context();

    describe("bender.create_context(target=document.body || document.documentElement)", function () {
      it("creates a Bender context for the target element and returns a <context> element", function () {
        var div = window.document.createElement(div);
        var context = bender.create_context(div);
        assert.strictEqual(context.target, div);
        assert.strictEqual(context.tagName, "context");
        assert.strictEqual(context.parentNode.tagName, "bender");
        assert.strictEqual(context.parentNode,
          context.ownerDocument.documentElement);
      });
      it("the target parameter defaults to the host document root element, or body if any (e.g. <body> for HTML, <svg> for SVG, &c.)", function () {
        assert.strictEqual(context.target, window.document.body);
      });
    });

    describe("context.ownerDocument.createElement(name)", function () {
      it("creates new elements in the Bender namespace", function () {
        var title = context.ownerDocument.createElement("title");
        assert.strictEqual(title.namespaceURI, flexo.ns.bender);
      });
      it("wraps new elements by extending them with Bender methods", function () {
        var title = context.ownerDocument.createElement("title");
        assert.strictEqual(typeof title._init, "function");
      });
    });

    describe("context.ownerDocument.createElementNS(ns, qname)", function () {
      it("wraps new elements by extending them with Bender methods", function () {
        var title = context.ownerDocument.createElementNS("title");
        assert.strictEqual(typeof title._init, "function");
      });
    });

  });

  describe("Component rendering", function () {

    it("Set view.$root to the first rendered element in the view", function (done) {
      var context = bender.create_context(flexo.$div());
      var component = context.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:p#root", "Root ", context.$("html:em", "element")),
            context.$("html:p", "Not the root element"))));
      var use = context.appendChild(context.$("use"));
      use._component = component;
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === context) {
          setTimeout(function () {
            assert.strictEqual(use._instance.views.$root,
              use._instance.views.root);
            done();
          }, 0);
        }
      });
    });

    it("Load several components in the same component", function (done) {
      var context = bender.create_context(flexo.$div());
      var a = context.$("use", { href: "../examples/rendering/a.xml" });
      var b = context.$("use", { href: "../examples/rendering/b.xml",
        transform: "translate(100)" });
      var c = context.$("use", { href: "../examples/rendering/c.xml",
        transform: "translate(0, 100)" });
      var d = context.$("use", { href: "../examples/rendering/d.xml",
        transform: "translate(100, 100)" });
      var main = context.appendChild(
          context.$("component",
            context.$("view",
              context.$("svg:svg", { viewBox: "0 0 200 200" }, a, b, c, d))));
      var use = context.appendChild(context.$("use"));
      use._component = main;
      var refreshes = 0;
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.use === a || e.instance.use === b ||
          e.instance.use == c || e.instance.use === d) {
          if (++refreshes === 4) {
            done();
          }
        }
      });
    });

    it("Preserve ids for target/unique", function (done) {
      var div = document.body.appendChild(flexo.$div());
      var context = bender.create_context(div);
      var main = context.appendChild(
          context.$("component",
            context.$("component", { id: "box-gradient" },
              context.$("view",
                context.$("target", { q: "defs", unique: "true" },
                  context.$("svg:linearGradient#gradient", { y2: "100%",
                    x2: "0%" },
                    context.$("svg:stop", { offset: "0%", "stop-color":
                      "#00e390" }),
                    context.$("svg:stop", { offset: "100%",
                      "stop-color": "#f79767" }))),
                context.$("svg:rect", { x: 10, y: 10, width: 80, height: 80,
                  fill: "url(#gradient)" }))),
            context.$("view",
              context.$("svg:svg", { viewBox: "0 0 200 200" },
                context.$("svg:defs", { id: "defs" }),
                context.$("use", { href: "#box-gradient" }),
                context.$("use", { href: "#box-gradient",
                  transform: "translate(100)" }),
                context.$("use", { href: "#box-gradient",
                  transform: "translate(0, 100)" }),
                context.$("use", { href: "#box-gradient",
                  transform: "translate(100, 100)" })))));
      var use = context.appendChild(context.$("use"));
      use._component = main;
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.use === use) {
          setTimeout(function () {
            var defs = document.querySelector("defs");
            assert.strictEqual(defs.childNodes.length, 1);
            assert.strictEqual(defs.childNodes[0].id, "gradient");
            assert.ok(!defs.id);
            flexo.safe_remove(div);
            done();
          }, 0);
        }
      });
    });

  });


  describe("Tree modifications", function () {

    it("Update instances of a component when its view changes", function (done) {
      var context = bender.create_context(flexo.$div());
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("view",
            context.$("html:p", "Hello, world!"))));
      var u = context.appendChild(context.$("use", { href: "#c" }));
      var v = context.appendChild(context.$("use", { href: "#c" }));
      var both = false;
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === context) {
          setTimeout(function () {
            component.querySelector("p")._textContent("Hello again");
          }, 0);
        } else if (e.instance.component === component) {
          setTimeout(function () {
            if (!both &&
              u._instance.views.$root.textContent === "Hello again" &&
              v._instance.views.$root.textContent === "Hello again") {
              both = true;
              done();
            }
          }, 0);
        }
      });
    });

  });


  describe("Watches", function () {

    it("Simply watch a DOM event (with an associated action)", function (done) {
      var context = bender.create_context(flexo.$div());
      var main = context.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:div", "Click me")),
          context.$("watch",
            context.$("get", { view: "$root", "dom-event": "click" },
              "flexo.notify(this.use.ownerDocument, '@done')"))));
      var use = context.appendChild(context.$("use"));
      use._component = main;
      flexo.listen(context.ownerDocument, "@done", function () { done(); });
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === main) {
          setTimeout(function () {
            var ev = document.createEvent("MouseEvent");
            ev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
              false, false, false, false, 0, null);
            use._instance.views.$root.dispatchEvent(ev);
          }, 0);
        }
      });
    });

    it("Watch a DOM event and send a notification as a result", function (done) {
      var context = bender.create_context(flexo.$div());
      var main = context.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:div.button", "Click me")),
          context.$("watch",
            context.$("get", { view: "$root", "dom-event": "click" }),
            context.$("set", { use: "$context", event: "@done" }))));
      var u = context.appendChild(context.$("use"));
      u._component = main;
      flexo.listen(context.ownerDocument, "@done", function (e) { done(); });
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === main) {
          setTimeout(function () {
            var ev = document.createEvent("MouseEvent");
            ev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
              false, false, false, 0, null);
            u._instance.views.$root.dispatchEvent(ev);
          }, 0);
        }
      });
    });

    it("Watch a DOM event and update a property as a result", function (done) {
      var context = bender.create_context(flexo.$div());
      var main = context.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:p.button", "Click me"),
            context.$("html:p", "Clicks: {clicks}")),
          context.$("property", { name: "clicks", type: "number", value: "0" }),
          context.$("watch",
            context.$("get", { view: "$root", "dom-event": "click" }),
            context.$("set", { use: "$self", property: "clicks",
              value: "{{ {clicks} + 1 }}" }))));
      var u = context.appendChild(context.$("use"));
      u._component = main;
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === main) {
          setTimeout(function () {
            var ev = document.createEvent("MouseEvent");
            ev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
              false, false, false, false, 0, null);
            u._instance.views.$root.dispatchEvent(ev);
            assert.ok(u._instance.properties.clicks === 1);
            done();
          }, 0);
        }
      });
    });

  });


  describe("Properties", function () {

    var context = bender.create_context();
    var empty = context.$("property", { name: "empty" });
    var component = context.appendChild(context.$("component", { id: "c" },
        empty));

    it("<property name=\"n\"> child of <component> defines a property", function () {
      assert.strictEqual(component._properties.empty, empty);
    });

    var string = context.$("property", { name: "string", type: "string" });
    component.appendChild(string);
    var boolean = context.$("property", { name: "boolean", type: "boolean" });
    component.appendChild(boolean);
    var number = context.$("property", { name: "number", type: "number" });
    component.appendChild(number);
    var object = context.$("property", { name: "object", type: "object" });
    component.appendChild(object);
    var dynamic = context.$("property", { name: "dynamic", type: "dynamic" });
    component.appendChild(dynamic);
    var wrong = context.$("property", { name: "wrong", type: "wrong" });
    component.appendChild(wrong);
    var foo = component.appendChild(context.$("property", { name: "foo",
      value: "bar" }));
    var flag = component.appendChild(context.$("property", { name: "flag",
      type: "boolean", value: "true" }));
    var x = component.appendChild(context.$("property", { name: "x",
      type: "number", value: "42" }));
    var y = component.appendChild(context.$("property", { name: "y",
      type: "dynamic", value: "{x} - 5" }));
    var array = component.appendChild(context.$("property", { name: "array",
      type: "object", value: "[1, 2, 3, 4]" }));
    var random = component.appendChild(context.$("property", { name: "random",
      type: "dynamic", value: "flexo.random_int(1, 10)" }));
    var multiline = component.appendChild(context.$("property",
          { name: "multiline", type: "dynamic" },
          "var x = 6;\nvar y = 7;\nreturn x * y"));


    it("the type attribute sets the type of the value; can be \"string\" (by default), \"boolean\", \"number\", \"object\" (using JSON notation), or \"dynamic\" (Javascript code)", function () {
      assert.strictEqual(component._properties.string, string);
      assert.strictEqual(component._properties.string._type, "string");
      assert.strictEqual(component._properties.boolean, boolean);
      assert.strictEqual(component._properties.boolean._type, "boolean");
      assert.strictEqual(component._properties.number, number);
      assert.strictEqual(component._properties.number._type, "number");
      assert.strictEqual(component._properties.object, object);
      assert.strictEqual(component._properties.object._type, "object");
      assert.strictEqual(component._properties.dynamic, dynamic);
      assert.strictEqual(component._properties.dynamic._type, "dynamic");
      assert.strictEqual(component._properties.wrong, wrong);
      assert.strictEqual(component._properties.wrong._type, "string");
      assert.strictEqual(component._properties.foo, foo);
      assert.strictEqual(component._properties.foo._type, "string");
      assert.strictEqual(component._properties.flag, flag);
      assert.strictEqual(component._properties.flag._type, "boolean");
      assert.strictEqual(component._properties.x, x);
      assert.strictEqual(component._properties.x._type, "number");
      assert.strictEqual(component._properties.y, y);
      assert.strictEqual(component._properties.y._type, "dynamic");
      assert.strictEqual(component._properties.array, array);
      assert.strictEqual(component._properties.array._type, "object");
      assert.strictEqual(component._properties.random, random);
      assert.strictEqual(component._properties.random._type, "dynamic");
      assert.strictEqual(component._properties.multiline, multiline);
      assert.strictEqual(component._properties.multiline._type, "dynamic");
    });

    it("the properties are initialized with given values for instances of the component", function (done) {
      var use = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            assert.strictEqual(e.instance.properties.string, "");
            assert.strictEqual(e.instance.properties.boolean, false);
            assert.ok(isNaN(e.instance.properties.number));
            assert.strictEqual(e.instance.properties.object);
            assert.strictEqual(e.instance.properties.dynamic);
            assert.strictEqual(e.instance.properties.wrong, "");
            assert.strictEqual(e.instance.properties.foo, "bar");
            assert.strictEqual(e.instance.properties.flag, true);
            assert.strictEqual(e.instance.properties.x, 42);
            assert.strictEqual(e.instance.properties.y, 37);
            assert.deepEqual(e.instance.properties.array, [1, 2, 3, 4]);
            assert.ok(e.instance.properties.random >= 1 &&
              e.instance.properties.random <= 10);
            assert.strictEqual(e.instance.properties.multiline, 42);
            done();
          }, 0);
        }
      });
    });

    /*
    it("the properties are initialized with given values for instances of the component", function (done) {
      var use = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            assert.strictEqual(e.instance.properties.x, 42);
            assert.strictEqual(e.instance.properties.y, 37);
            done();
          }, 0);
        }
      });
    });
    */

  });


  describe("Error handling", function () {

    it("Error loading component (HTTP 404 error)", function (done) {
      var context = bender.create_context();
      var use = context.appendChild(context.$("use", { href: "errorzzz.xml" }));
      flexo.listen(context.ownerDocument, "@error", function (e) {
        assert.ok(e.message);
        assert.ok(/HTTP error/i.test(e.message));
        done();
      });
    });

    it("Error loading component (not an XML document)", function (done) {
      var context = bender.create_context();
      var use = context.appendChild(context.$("use", { href: "bender.js" }));
      flexo.listen(context.ownerDocument, "@error", function (e) {
        assert.ok(e.message);
        assert.ok(/could not parse document as XML/i.test(e.message));
        done();
      });
    });

    it("Error loading component (not a Bender component)", function (done) {
      var context = bender.create_context();
      var use = context.appendChild(context.$("use", { href: "flexo.html" }));
      flexo.listen(context.ownerDocument, "@error", function (e) {
        assert.ok(e.message);
        assert.ok(/not a Bender component/i.test(e.message));
        done();
      });
    });

    // Pending: this involves recursive component instances
    it("Error loading component (trying to load the target document)");

    /*
    it("Error loading component (trying to load the target document)", function (done) {
      var context = bender.create_context();
      var use = context.appendChild(context.$("use", { href: "bender.html" }));
      flexo.listen(context.ownerDocument, "@error", function (e) {
        done();
      });
    });
    */

  });


  describe("Test applications", function () {

    it("Hello, world! (create a component with only a view programmatically)", function (done) {
      var div = window.document.createElement("div");
      var context = bender.create_context(div);
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("view",
            context.$("html:p", "Hello, world!"))));
      context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            if (div.textContent === "Hello, world!") {
              done();
            }
          }, 0);
        }
      });
    });

    it("Hello, world! (load a component with only a view)", function (done) {
      var div = window.document.createElement("div");
      var context = bender.create_context(div);
      var use = context.appendChild(context.$("use",
          { href: "hello-world.xml" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.use === use) {
          setTimeout(function () {
            if (div.textContent.trim() === "Hello, world!") {
              done();
            }
          }, 0);
        }
      });
    });

    it("Text-only view", function (done) {
      var p = window.document.createElement("p");
      var context = bender.create_context(p);
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("view", "Hello, world!")));
      context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          done();
        }
      });
    });

    it("Several contexts in the same target document", function (done) {
      var make_component = function () {
        var p = window.document.createElement("p");
        var context = bender.create_context(p);
        var component = context.appendChild(
          context.$("component", { id: "c" },
            context.$("view", "Simple component")));
        context.appendChild(context.$("use", { href: "#c" }));
        flexo.listen(context.ownerDocument, "@refreshed", function (e) {
          if (e.instance.component === component) {
            if (++j === n) {
              done();
            }
          }
        });
      };
      for (var i = 0, j = 0, n = 3; i < n; ++i) {
        make_component();
      }
    });

    it("Simple content", function (done) {
      var div = window.document.createElement("div");
      var context = bender.create_context(div);
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("view",
            context.$("html:p",
              context.$("content", "Some default content")))));
      var u = context.appendChild(context.$("use", { href: "#c" }, "Hello, world!"));
      var v = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.use === u) {
          setTimeout(function () {
            assert.strictEqual(u._instance.views.$root.textContent,
              "Hello, world!");
            assert.strictEqual(v._instance.views.$root.textContent,
              "Some default content");
            done();
          }, 0);
        }
      });
    });

    it("Use property values in attributes", function (done) {
      var context = bender.create_context(flexo.$svg());
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("property", { name: "x", type: "number", value: "100" }),
          context.$("property", { name: "y", type: "number", value: "50" }),
          context.$("property", { name: "sz", type: "number", value: "200" }),
          context.$("property", { name: "color", value: "#ff4040" }),
          context.$("view",
            context.$("svg:rect#r", { x: "{x}", y: "{y}", width: "{sz}",
              height: "{sz}", fill: "{color}" }))));
      var u = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            assert.strictEqual(e.instance.views.r.getAttribute("x"), "100");
            assert.strictEqual(e.instance.views.r.getAttribute("y"), "50");
            assert.strictEqual(e.instance.views.r.getAttribute("width"), "200");
            assert.strictEqual(e.instance.views.r.getAttribute("height"),
              "200");
            assert.strictEqual(e.instance.views.r.getAttribute("fill"),
              "#ff4040");
            done();
          }, 0);
        }
      });

    });

    it("Show a property value in a text node", function (done) {
      var context = bender.create_context(flexo.$div());
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("property", { name: "foo", value: "bar" }),
          context.$("view",
            context.$("html:p#out", "foo = {foo}"))));
      context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            if (e.instance.views.out.textContent === "foo = bar") {
              done();
            }
          }, 0);
        }
      });
    });

    it("Show a live computed value in a text node", function (done) {
      var p = flexo.$p();
      var context = bender.create_context(p);
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("property", { name: "n", type: "number", value: "2012" }),
          context.$("view", "n = {{flexo.to_roman({n})}} ({n})")));
      var u = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            assert.strictEqual(p.textContent, "n = mmxii (2012)");
            done();
          }, 0);
        }
      });
    });

    it("Chain properties", function (done) {
      var p = flexo.$p();
      var context = bender.create_context(p);
      var component = context.appendChild(
        context.$("component", { id: "c" },
          context.$("property", { name: "x", type: "number", value: 1 }),
          context.$("property", { name: "y", type: "number",
            value: "{{{x} + 1}}" }),
          context.$("property", { name: "z", type: "dynamic",
            value: "{x} + {y}" }),
          context.$("property", { name: "t", type: "dynamic",
            value: "{z} * 2" }),
          context.$("view", "{x} {y} {z} {t}")));
      var u = context.appendChild(context.$("use", { href: "#c" }));
      flexo.listen(context.ownerDocument, "@refreshed", function (e) {
        if (e.instance.component === component) {
          setTimeout(function () {
            assert.strictEqual(p.textContent, "1 2 3 6");
            done();
          }, 0);
        }
      });
    });

  });

}(window.chai.assert, window.flexo, window.bender));
