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

    describe("Test case: K(L0<L)", function () {
      var L = env.component().view("Hi!");
      var L0 = env.component(L).id("L0");
      var K = env.component().view(L0);
      var K_ = K.instantiate(K.create_concrete_scope());
      it("check K and K’", function () {
        expect(K.scope.components.length).toBe(2);
        expect(K.scope.components).toContain(K);
        expect(K.scope.components).toContain(L0);
        expect(K.scope.children.length).toBe(1);
        expect(K.scope.children[0]).toBe(L0);
        expect(K.scope.concrete.length).toBe(1);
        expect(K.scope.concrete[0]).toBe(Object.getPrototypeOf(K_.scope));
        expect(K_.scope.children.length).toBe(1);
        expect(Object.getPrototypeOf(K_.scope.children[0])).toBe(L0);
        expect(K_.scope["#L0"]).toBe(L0);
        expect(K_.scope["@L0"]).toBe(K_.scope.children[0]);
        expect(K_.scope.instances.length).toBe(2);
        expect(K_.scope.instances).toContain(K_);
        expect(K_.scope.instances).toContain(K_.scope.children[0]);
        expect(K_.scope.derived.length).toBe(2);
        expect(K_.scope.derived).toContain(K_.scope);
        expect(K_.scope.derived).toContain(K_.scope.children[0].scope);
      });
      it("check L", function () {
        expect(L.scope.components.length).toBe(1);
        expect(L.scope.components[0]).toBe(L);
        expect(L.scope.concrete.length).toBe(1);
        expect(L.scope.concrete[0].instances.length).toBe(0);
        expect(L.scope.concrete[0].derived.length).toBe(1);
      });
      it("check stack of K and L0", function () {
        expect(K_.scope.stack.length).toBe(1);
        expect(K_.scope.stack[0]).toBe(K_.scope);
        expect(K_.scope["@L0"].scope.stack.length).toBe(2);
        expect(K_.scope["@L0"].scope.stack[0])
          .toBe(L.scope.concrete[0].derived[0]);
        expect(K_.scope["@L0"].scope.stack[1]).toBe(K_.scope["@L0"].scope);
      });
    });

    describe("Test case: K(L0<L(M0<M))", function () {
      var fum = env.$text({ id: "fum" }, "fum");
      var M = env.component().view(fum);
      var M0 = env.component(M).id("M0");
      var L = env.component().view(M0);
      var L0 = env.component(L).id("L0");
      var K = env.component().view(L0);
      var K_ = K.instantiate(K.create_concrete_scope());
      it("check K and K’", function () {
        expect(K.scope.components.length).toBe(2);
        expect(K.scope.components).toContain(K);
        expect(K.scope.components).toContain(L0);
        expect(K.scope.children.length).toBe(1);
        expect(K.scope.children[0]).toBe(L0);
        expect(K.scope.concrete.length).toBe(1);
        expect(K.scope.concrete[0]).toBe(Object.getPrototypeOf(K_.scope));
        expect(K_.scope.children.length).toBe(1);
        expect(Object.getPrototypeOf(K_.scope.children[0])).toBe(L0);
        expect(K_.scope["#L0"]).toBe(L0);
        expect(K_.scope["@L0"]).toBe(K_.scope.children[0]);
        expect(K_.scope.instances.length).toBe(2);
        expect(K_.scope.instances).toContain(K_);
        expect(K_.scope.instances).toContain(K_.scope.children[0]);
        expect(K_.scope.derived.length).toBe(2);
        expect(K_.scope.derived).toContain(K_.scope);
        expect(K_.scope.derived).toContain(K_.scope.children[0].scope);
      });
      it("check L", function () {
        expect(L.scope.components.length).toBe(2);
        expect(L.scope.components[0]).toBe(L);
        expect(L.scope.concrete.length).toBe(1);
        expect(L.scope.concrete[0].instances.length).toBe(1);
        expect(L.scope.concrete[0].derived.length).toBe(2);
        expect(Object.getPrototypeOf(L.scope.concrete[0]["@M0"])).toBe(M0);
      });
      it("check M", function () {
        expect(M.scope.components.length).toBe(1);
        expect(M.scope.components[0]).toBe(M);
        expect(M.scope.concrete.length).toBe(1);
        expect(M.scope.concrete[0].instances.length).toBe(0);
        expect(M.scope.concrete[0].derived.length).toBe(1);
        expect(Object.getPrototypeOf(M.scope.concrete[0]["@fum"])).toBe(fum);
      });
      it("check stack of K and L0", function () {
        expect(K_.scope.stack.length).toBe(1);
        expect(K_.scope.stack[0]).toBe(K_.scope);
        expect(K_.scope["@L0"].scope.stack.length).toBe(2);
        var L_ = K_.scope["@L0"].scope.stack[0];
        expect(L_).toBe(L.scope.concrete[0].derived[0]);
        var L0_ = K_.scope["@L0"].scope.stack[1];
        expect(L0_).toBe(K_.scope["@L0"].scope);
        expect(L0_.children.length).toBe(1);
        var M0_ = L0_.children[0];
        expect(M0_).toBe(L.scope.concrete[0].instances[0]);
        expect(M0_.scope.stack.length).toBe(2);
        expect(M0_.scope.stack[0]["#this"]).toBe(M);
        expect(Object.getPrototypeOf(M0_.scope.stack[0]["@fum"])).toBe(fum);
        expect(M0_.scope.stack[1]["#this"]).toBe(M0);
      });
    });

    describe("Test case: K(L1<L, L2<L), L(M1<M, M2<M)", function () {
      var fum = env.$text({ id: "fum" }, "fum");
      var M = env.component().view(fum);
      var M1 = env.component(M).id("M1");
      var M2 = env.component(M).id("M2");
      var L = env.component().view(M1, M2);
      var L1 = env.component(L).id("L1");
      var L2 = env.component(L).id("L2");
      var K = env.component().view(L1, L2);
      var K_ = K.instantiate(K.create_concrete_scope());
      it("check everything", function () {
        expect(K.scope.concrete.length).toBe(1);
        expect(L.scope.concrete.length).toBe(2);
        expect(M.scope.concrete.length).toBe(4);
      });
    });

  });

});
