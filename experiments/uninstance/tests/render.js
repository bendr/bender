describe("Rendering to HTML", function () {

  var env = bender.environment();

  describe("bender.DocumentEnvironment", function () {
    it("is an environment bound to a DOM document in which to render",
      function () {
        expect(env.scope.document).toBe(window.document);
      });
  });

  /*
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

  describe("Render scope", function () {
    var A = env.component();
    var B = env.component(A);
    var B_ = B.render_instance();
    it("...", function () {
      expect(Object.getPrototypeOf(B)).toBe(A);
      expect(Object.getPrototypeOf(B_)).toBe(B);
    });
  });
  */

});
