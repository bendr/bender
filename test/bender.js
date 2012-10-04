(function (assert, flexo, bender) {
  "use strict";

  describe("Bender context", function () {

    describe("bender.create_context(target?)", function () {
      it("creates a Bender context for the target element", function () {
        var div = document.createElement(div);
        var context = bender.create_context(div);
        assert.strictEqual(context.tagName, "context");
      });
      it("the target parameter defaults to document", function () {
        var context = bender.create_context();
        assert.strictEqual(context.tagName, "context");
      });
    });

  });

}(window.chai.assert, window.flexo, window.bender));
