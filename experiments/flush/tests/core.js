describe("Bender core", function () {

  it("is currently at version %0".fmt(bender.VERSION), flexo.nop);

  describe("bender.Scope", function () {
    it("is the global scope for Bender components and instances", function () {
      expect(Object.keys(bender.Scope).length).toBe(0);
      expect(bender.Scope.type).toBe("global");
    });
  })

  describe("bender.Component", function () {
    it("is a Bender component", function () {
      var component = bender.Component.create();
      expect(Object.getPrototypeOf(component)).toBe(bender.Component);
      expect(component.children.length).toBe(0);
      expect(component.instances.length).toBe(0);
      expect(component.parent).toBeUndefined();
      expect(component.scope.type).toBe("component");
      expect(Object.getPrototypeOf(component.scope).type).toBe("abstract");
      expect(Object.getPrototypeOf(Object.getPrototypeOf(component.scope)).type)
        .toBe("global");
      expect(component.scope["#this"]).toBe(component);
      expect(component.scope["@this"]).toBe(component);
      expect(Object.getPrototypeOf(component.view())).toBe(bender.View);
      expect(component.properties[""]).toBe(component);
      expect(Object.keys(component.properties).length).toBe(0);
    });

    it("can inherit from another component", function () {
      var A = bender.Component.create();
      var B = Object.create(A).init();
      expect(B.scope).not.toBe(A.scope);
      expect(Object.getPrototypeOf(B.scope))
        .not.toBe(Object.getPrototypeOf(A.scope));
      expect(Object.getPrototypeOf(B.properties)).toBe(A.properties);
      expect(B.properties[""]).toBe(B);
    });

    describe("bender.Component.finalize()", function () {
      it("finalizes the component after it was populated, and before it is " +
        "rendered", function () {
        var A = bender.Component.create();
        A.finalize();
        expect(A.__pending_finalize).toBeUndefined();
      });
      it("returns the component", function () {
        var A = bender.Component.create();
        expect(A.finalize()).toBe(A);
      });
      it("adds IDs to the scope of the component", function () {
        var A = bender.Component.create();
        var div = A.view().insert_child(flexo.$div({ id: "div" }));
        var p = div.insert_child(flexo.$p({ id: "p" }));
        var div2 = A.view().insert_child(flexo.$div());
        var q = div2.insert_child(flexo.$p({ id: "q" }));
        A.finalize();
        expect(A.scope["#div"]).toBe(div);
        expect(A.scope["@div"]).toBe(div);
        expect(A.scope["#p"]).toBe(p);
        expect(A.scope["@p"]).toBe(p);
        expect(A.scope["#q"]).toBe(q);
        expect(A.scope["@q"]).toBe(q);
      });
    });
  })

});
