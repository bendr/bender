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

    var context = bender.create_context();

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

    it("_add_instance(instance) adds an instance to the view of the main instance in the context");

    it("_add_instance_of(component) creates a new instance of the given component element and add it to the view of the main instance in the context", function () {
      var instance = context._add_instance_of(component);
      assert.strictEqual(instance.namespaceURI, bender.ns);
      assert.strictEqual(instance.localName, "instance");
      assert.strictEqual(instance._component, component);
      assert.strictEqual(instance,
        context.querySelector("view").querySelector("instance"));
    });

    it("_add_instance_of(uri) creates a new instance of the component loaded from the given URI and add it to the view of the main instance in the context");

  });

}(window.chai.assert, window.flexo, window.bender));
