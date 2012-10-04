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
      it("the target parameter defaults to `document`", function () {
        assert.strictEqual(context.target, window.document);
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

}(window.chai.assert, window.flexo, window.bender));
