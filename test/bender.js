(function (assert, flexo, bender) {
  "use strict";

  describe("Bender context", function () {

    var context = bender.create_context();

    describe("bender.create_context(target?)", function () {
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
        assert.strictEqual(title.namespaceURI, flexo.BENDER_NS);
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

  describe("Test applications", function () {

    it("Hello, world! (create a component with only a view programmatically)", function (done) {
      var div = window.document.createElement("div");
      var context = bender.create_context(div);
      var component = context.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:p", "Hello, world!"))));
      context.appendChild(context.$("use", { q: "component" }));
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
        context.$("component",
          context.$("view", "Hello, world!")));
      context.appendChild(context.$("use", { q: "component" }));
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
          context.$("component",
            context.$("view", "Simple component")));
        context.appendChild(context.$("use", { q: "component" }));
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

  });

}(window.chai.assert, window.flexo, window.bender));
