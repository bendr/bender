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
      it("check abstract scope of B", function () {
        expect(B.scope.view).toBeDefined();
        expect(B.scope.components).toContain(B);
        expect(B.scope["#this"]).toBe(B);
        expect(B.scope["@this"]).toBe(B);
        expect(abstract_B["#B"]).toBe(B);
        expect(abstract_B["@B"]).toBe(B);
        expect(abstract_B["#bar"]).toBe(bar);
        expect(abstract_B["@bar"]).toBe(bar);
      });
      var concrete_A = A.create_concrete_scope();
      var A_ = A.instantiate(concrete_A);
      it("check the concrete scope of A’", function () {
        expect(Object.getPrototypeOf(concrete_A))
          .toBe(Object.getPrototypeOf(A.scope));
        expect(Object.getPrototypeOf(A_)).toBe(A);
        expect(Object.getPrototypeOf(A_.scope)).toBe(concrete_A);
        expect(concrete_A.instances).toContain(A_);
        expect(concrete_A.derived.length).toBe(1);
        expect(A_.scope["#this"]).toBe(A);
        expect(A_.scope["@this"]).toBe(A_);
        expect(A_.scope["#A"]).toBe(A);
        expect(A_.scope["@A"]).toBe(A_);
        expect(A_.scope["#foo"]).toBe(foo);
        var stack = A_.scope.stack;
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
      var baz = env.$text({ id: "baz" }, "Baz");
      var Y = env.component().id("Y").view(baz);
      var Y1 = env.component(Y).id("Y1");
      var Y2 = env.component(Y).id("Y2");
      var X = env.component().id("X").view(Y1, Y2);
      var abstract_X = Object.getPrototypeOf(X.scope);
      it("check abstract scope of X", function () {
        expect(X.scope.components).toContain(X);
        expect(X.scope.view).toBeDefined();
        expect(X.scope["#this"]).toBe(X);
        expect(X.scope["@this"]).toBe(X);
        expect(X.scope["#X"]).toBe(X);
        expect(X.scope["@X"]).toBe(X);
        expect(X.scope["#Y1"]).toBe(Y1);
        expect(X.scope["@Y1"]).toBe(Y1);
        expect(X.scope["#Y2"]).toBe(Y2);
        expect(X.scope["@Y2"]).toBe(Y2);
        expect(Object.getPrototypeOf(Y1.scope)).toBe(abstract_X);
        expect(Y1.scope["#this"]).toBe(Y1);
        expect(Y1.scope["@this"]).toBe(Y1);
        expect(Y1.scope["#X"]).toBe(X);
        expect(Y1.scope["@X"]).toBe(X);
        expect(Y1.scope["#Y1"]).toBe(Y1);
        expect(Y1.scope["@Y1"]).toBe(Y1);
        expect(Y1.scope["#Y2"]).toBe(Y2);
        expect(Y1.scope["@Y2"]).toBe(Y2);
        expect(Object.getPrototypeOf(Y2.scope)).toBe(abstract_X);
        expect(Y2.scope["#this"]).toBe(Y2);
        expect(Y2.scope["@this"]).toBe(Y2);
        expect(Y2.scope["#X"]).toBe(X);
        expect(Y2.scope["@X"]).toBe(X);
        expect(Y2.scope["#Y1"]).toBe(Y1);
        expect(Y2.scope["@Y1"]).toBe(Y1);
        expect(Y2.scope["#Y2"]).toBe(Y2);
        expect(Y2.scope["@Y2"]).toBe(Y2);
      });
      it("check abstract scope of Y", function () {
        expect(Y.scope.view).toBeDefined();
        expect(Y.scope["#this"]).toBe(Y);
        expect(Y.scope["@this"]).toBe(Y);
        expect(Y.scope["#Y"]).toBe(Y);
        expect(Y.scope["@Y"]).toBe(Y);
        expect(Y.scope["#baz"]).toBe(baz);
        expect(Y.scope["@baz"]).toBe(baz);
      });
      it("check the render stack of X’", function () {
        var X_ = X.instantiate(X.create_concrete_scope());
        var stack = X_.scope.stack;
        expect(stack.instance).toBe(X_);
        expect(stack.length).toBe(1);
        expect(stack[0]["@this"]).toBe(X_);
        expect(stack[0]["#this"]).toBe(X);
        expect(Object.getPrototypeOf(Object.getPrototypeOf(stack[0])["@Y1"]))
          .toBe(Y1);
        expect(Object.getPrototypeOf(Object.getPrototypeOf(stack[0])["@Y2"]))
          .toBe(Y2);
        expect(Object.getPrototypeOf(stack[0]).derived).toContain(stack[0]);
        var abstract_Y = Object.getPrototypeOf(X_.scope["@Y1"].scope);
        expect(Object.getPrototypeOf(X_.scope["@Y2"].scope)).toBe(abstract_Y);
        expect(X_.scope["@Y1"].scope.stack.length).toBe(2);
        expect(X_.scope["@Y2"].scope.stack.length).toBe(2);
        expect(Y.scope.concrete.length).toBe(2);
        expect(Object.getPrototypeOf(X_.scope["@Y1"].scope.stack[0]))
          .toBe(Y.scope.concrete[0]);
        expect(Object.getPrototypeOf(X_.scope["@Y2"].scope.stack[0]))
          .toBe(Y.scope.concrete[1]);
      });
    });

  });

});
