describe("Watch graph", function () {

  describe("Empty graph", function () {
    var env = bender.environment();
    it("has a single Vortex (sink vertex)", function () {
      expect(env.vertices.length).toBe(1);
      expect(Object.getPrototypeOf(env.vertices[0])).toBe(bender.Vortex);
    });
  });

  describe("Component with no watch", function () {
    var env = bender.environment();
    var A = env.component();
    A.render_graph();
    it("does not create any additional vertex", function () {
      expect(env.components).toContain(A);
      expect(env.vertices.length).toBe(1);
      expect(Object.getPrototypeOf(env.vertices[0])).toBe(bender.Vortex);
    });
  });

  describe("Component with a single get/property", function () {
    var env = bender.environment();
    var A = env.component()
      .property({ name: "x" })
    //.watch(env.$get({ property: "x" }))
      .watch(bender.GetProperty.create("x"));
    A.render_graph();
    it("creates a property and a watch vertex", function () {
      expect(env.vertices.length).toBe(3);
      expect(Object.getPrototypeOf(env.vertices[0])).toBe(bender.Vortex);
      expect(Object.getPrototypeOf(env.vertices[1])).toBe(bender.WatchVertex);
      expect(Object.getPrototypeOf(env.vertices[2]))
        .toBe(bender.PropertyVertex);
    });
    it("creates a single edge between the property and watch " +
      "vertex", function () {
        expect(env.vertices[0].incoming.length).toBe(0);
        expect(env.vertices[1].incoming.length).toBe(1);
        expect(env.vertices[1].outgoing.length).toBe(0);
        expect(env.vertices[2].incoming.length).toBe(0);
        expect(env.vertices[2].outgoing.length).toBe(1);
        expect(env.vertices[2].outgoing[0]).toBe(env.vertices[1].incoming[0]);
        expect(Object.getPrototypeOf(env.vertices[2].outgoing[0]))
          .toBe(bender.WatchEdge);
      });
  });

  describe("Component with two watches and the same get/property", function () {
    var env = bender.environment();
    var A = env.component()
      .property({ name: "x" })
      .watch(bender.GetProperty.create("x"))
      .watch(bender.GetProperty.create("x"));
    A.render_graph();
    it("reuses the same property vertex", function () {
      expect(env.vertices.length).toBe(4);
    });
  });

  describe("Inheriting a property reuses the property vertex", function () {
    var env = bender.environment();
    var A = env.component()
      .property({ name: "x" })
      .watch(bender.GetProperty.create("x"))
    A.render_graph();
    var B = env.component(A)
      .watch(bender.GetProperty.create("x"))
    B.render_graph();
    it("reuses the same property vertex", function () {
      expect(env.vertices.length).toBe(4);
    });
  });

});
