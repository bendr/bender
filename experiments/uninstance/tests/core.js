describe("Bender core", function () {

  it("is currently at version %0".fmt(bender.VERSION), flexo.nop);

  var env = bender.environment();

  describe("Bender environment (bender.Environment)", function () {

    describe("bender.environment()", function () {
      it("creates a new environment", function () {
        expect(env.scope.environment).toBe(env);
      });
    });

  });

  describe("Bender elements", function () {
    
    describe("bender.Element", function () {
      it("is the base for Bender elements", function () {
        expect(bender.Element.is_bender_element).toBe(true);
      });

      describe("init()", function () {
        var elem = Object.create(bender.Element);
        var inited = elem.init();
        it("initializes the element", function () {
          expect(elem.children).toBeDefined;
        });
        it("returns the element", function () {
          expect(inited).toBe(elem);
        });
      });

      describe("init_with_args(args)", function () {
        var elem = Object.create(bender.Element);
        var inited = elem.init_with_args({ id: "foo" });
        it("allows to pass arguments for initialization as an object",
          flexo.nop);
        it("supports the “id” key for all elements", function () {
          expect(elem.id()).toBe("foo");
        });
        it("returns the element", function () {
          expect(inited).toBe(elem);
        });
      });
    });

    describe("bender.Component", function () {
      it("has a “component” tag", function () {
        expect(bender.Component.tag).toBe("component");
      });

      describe("init(scope)", function () {
        var elem = Object.create(bender.Component);
        var inited = elem.init(env.scope);
        it("initializes the component element with the given scope (from the " +
          "environment or a parent component)", function () {
          expect(elem.children).toBeDefined;
          expect(Object.getPrototypeOf(Object.getPrototypeOf(elem.scope)))
            .toBe(env.scope);
          expect(elem.scope["@this"]).toBe(elem);
          expect(elem.scope["#this"]).toBe(elem);
        });
        it("returns the component element", function () {
          expect(inited).toBe(elem);
        });
      });
    });
  });

});
