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

    var context = bender.create_context(flexo.$div());

    it("bender.create_context() creates a new Bender context, which is a document that will contain instances", function () {
      assert.ok(context instanceof window.Document);
      assert.strictEqual(context.documentElement.namespaceURI, bender.ns);
      assert.strictEqual(context.documentElement.localName, "context");
    });

    var component = context.$("component");

    it("$() is a binding of flexo.create_element to a context", function () {
      assert.strictEqual(component.ownerDocument, context);
      assert.strictEqual(component.namespaceURI, bender.ns);
      assert.strictEqual(component.localName, "component");
    });

    it("Add an instance to the document element of the context to render it", function () {
      var instance = component._create_instance();
      context.documentElement.appendChild(instance);
      assert.strictEqual(instance.namespaceURI, bender.ns);
      assert.strictEqual(instance.localName, "instance");
      assert.strictEqual(instance._component, component);
      assert.strictEqual(instance, context.querySelector("instance"));
    });

  });

  describe("Rendering", function () {

    var div = flexo.$div();
    var context = bender.create_context(div);
    var text = "Hello, world!";
    var hello = context.documentElement.appendChild(
      context.$("component",
        context.$("view",
          context.$("html:p", text)))._create_instance());

    it("Hello world!", function () {
      assert(context.querySelector("instance")._target.textContent === text);
      assert(div.textContent === text);
    });

    it("Remove an instance", function () {
      flexo.safe_remove(hello);
      assert(div.textContent === "");
    });
  });

}(window.chai.assert, window.flexo, window.bender));
