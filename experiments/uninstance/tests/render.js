describe("Rendering to HTML", function () {

  var env = bender.environment();

  describe("bender.DocumentEnvironment", function () {
    it("is an environment bound to a DOM document in which to render",
      function () {
        expect(env.scope.document).toBe(window.document);
      });
  });

  describe("Component.render_instance(target?, ref?)", function () {
    it("returns the rendered instance", function () {
      var c = env.component();
      var div = env.dom("div");
      var c_ = c.render_instance(div);
      expect(c.instances).toContain(c_);
      expect(div.nodeType).toBe(window.Node.ELEMENT_NODE);
      expect(div.localName).toBe("div");
      expect(Object.getPrototypeOf(c_)).toBe(c);
    });
  });

  /*
  var A = env.$component({ id: "A" }).view(env.$content());
  var B = env.$component({ id: "B", prototype: A }, env.$view(env.$p("Hello")));
  var B_ = B.render_instance(flexo.$div());

  it("has the right id", function () {
    expect(A.id()).toBe("A");
  });
  it("has the right @this", function () {
    expect(B_.scope_of(A)["@this"]).toBe(B_);
  });
  */

});
