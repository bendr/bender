(function (assert, flexo, bender) {
  "use strict";

  describe("Bender namespace ({0})".fmt(bender.ns), function () {
    it("extends flexo to create elements in the Bender namespace with the \"bender\" prefix", function () {
      var app = flexo.$("bender:component");
      assert.strictEqual(app.namespaceURI, bender.ns, "Element is in Bender namespace");
      assert.strictEqual(app.localName, "component", "Element is named component");
    });
  });


  var context = bender.create_context();

  describe("Bender context", function () {

    it("bender.create_context() creates a new Bender context for the given document", function () {
      assert.isObject(context, "The context is an object");
    });

  });

}(window.chai.assert, window.flexo, window.bender));
