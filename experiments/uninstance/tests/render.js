describe("Rendering to HTML", function () {

  var env = bender.environment();

  describe("bender.DocumentEnvironment", function () {
    it("is an environment bound to a DOM document in which to render",
      function () {
        expect(env.scope.document).toBe(window.document);
      });
  });

  describe("Scopes (concrete)", function () {
    describe("Test case: A inherit from B, both have a view", function () {
      var bar = env.$text({ id: "bar" }, "Bar");
      var B = env.component().id("B").view(env.$content(bar));
      var abstract_B = Object.getPrototypeOf(B.scope);
      var foo = env.$text({ id: "foo" }, "Foo");
      var A = env.component(B).id("A").view(foo);
      var abstract_A = Object.getPrototypeOf(A.scope);
      it("check abstract scopes for A and B", function () {
        expect(B.scope.view).toBeDefined();
        expect(B.scope.components).toContain(B);
        expect(B.scope["#this"]).toBe(B);
        expect(B.scope["@this"]).toBe(B);
        expect(abstract_B["#B"]).toBe(B);
        expect(abstract_B["@B"]).toBe(B);
        expect(abstract_B["#bar"]).toBe(bar);
        expect(abstract_B["@bar"]).toBe(bar);
      });
      it("check abstract scope of A", function () {
        expect(A.scope.components).toContain(A);
        expect(Object.getPrototypeOf(A)).toBe(B);
        expect(A.scope.view).toBeDefined();
        expect(A.scope["#this"]).toBe(A);
        expect(A.scope["@this"]).toBe(A);
        expect(abstract_A["#A"]).toBe(A);
        expect(abstract_A["@A"]).toBe(A);
        expect(abstract_A["#foo"]).toBe(foo);
        expect(abstract_A["@foo"]).toBe(foo);
      });
      var concrete_A = A.create_concrete_scope();
      var A_ = A.instantiate(concrete_A);
      it("check for basic concrete scope of A (before the stack is built)",
        function () {
          expect(Object.getPrototypeOf(concrete_A))
            .toBe(Object.getPrototypeOf(A.scope));
          expect(Object.getPrototypeOf(A_)).toBe(A);
          expect(Object.getPrototypeOf(A_.scope)).toBe(concrete_A);
          expect(concrete_A.instances).toContain(A_);
          expect(concrete_A.derived.length).toBe(0);
          expect(A_.scope["#this"]).toBe(A);
          expect(A_.scope["@this"]).toBe(A_);
          expect(A_.scope["#A"]).toBe(A);
          expect(A_.scope["@A"]).toBe(A_);
          expect(A_.scope["#foo"]).toBe(foo);
          expect(A_.scope["@foo"]).toBe(foo);  // not instantiated yet
        });
      it("check the render stack of A’", function () {
        var stack = A_.create_render_stack();
        expect(stack.instance).toBe(A_);
        expect(stack.length).toBe(2);
        expect(stack[1]).toBe(A_.scope);
        expect(Object.getPrototypeOf(stack[1]).derived).toContain(stack[1]);
        expect(Object.getPrototypeOf(concrete_A["@foo"])).toBe(foo);
        expect(Object.getPrototypeOf(Object.getPrototypeOf(stack[0])))
          .toBe(abstract_B);
        expect(stack[0]["@this"]).toBe(A_);
        expect(stack[0]["#this"]).toBe(B);
        expect(Object.getPrototypeOf(Object.getPrototypeOf(stack[0])["@bar"]))
          .toBe(bar);
        expect(Object.getPrototypeOf(stack[0]).derived).toContain(stack[0]);
      });
    });

    describe("Test case: X has children Y1<Y and Y2<Y", function () {
    });

  });

});
