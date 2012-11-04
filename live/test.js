(function (assert, flexo, bender) {
  "use strict";

  describe("Bender namespace ({0})".fmt(bender.ns), function () {
    it("extends flexo to create elements in the Bender namespace with the \"bender\" prefix", function () {
      var app = flexo.$("bender:app");
      assert.strictEqual(app.namespaceURI, bender.ns);
      assert.strictEqual(app.localName, "app");
    });
  });

  describe("Bender context", function () {
    it("bender.create_context() creates a new Bender context, which is a document that will contain instances", function () {
      var context = bender.create_context();
      assert.ok(context instanceof window.Document);
      assert.strictEqual(context.documentElement.namespaceURI, bender.ns);
      assert.strictEqual(context.documentElement.localName, "context");
    });
  });

}(window.chai.assert, window.flexo, window.bender));
