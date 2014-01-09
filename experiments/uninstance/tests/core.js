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
          expect(elem.children).toBeDefined();
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

      describe("create()", function () {
        it("is a shortcut for Object.create(elem).init(...), taking the same " +
          "arguments as init() for the given element", function () {
          var elem = Element.create();
          expect(elem.children).toBeDefined();
        });
      });

      describe("instantiate()", function () {
        it("is pending");
      });

      describe("id(id?)", function () {
        var a = Element.create().id("a");
        var b = Element.create();
        var c = Element.create();
        var c_ = c.id("c");
        it("sets the id of the element to “id”", function () {
          expect(c.id()).toBe("c");
        });
        it("does not set the id if it does not conform to a valid XML id",
          function () {
            var d = Element.create().id("123");
            expect(d.id()).toBe("");
          });
        it("returns the element when called with a parameter", function () {
          expect(c_).toBe(c);
        });
        it("returns the id of the element, or an empty string if the element " +
          "has no id, when called with no parameter", function () {
            expect(a.id()).toBe("a");
            expect(b.id()).toBe("");
          });
      });

      describe("insert_child(child, ref?)", function () {
        var parent = Element.create();
        var a = Element.create();
        var b = Element.create();
        it("inserts the child at the end of the list of children if no ref " +
          "parameter is given", function () {
            parent.insert_child(a);
            expect(parent.children.length).toBe(1);
            expect(parent.children[0]).toBe(a);
            expect(a.parent).toBe(parent);
            parent.insert_child(b);
            expect(parent.children.length).toBe(2);
            expect(parent.children[1]).toBe(b);
            expect(b.parent).toBe(parent);
          });
        it("inserts the child before the ref element", function () {
          var c = Element.create();
          parent.insert_child(c, b);
          expect(parent.children.length).toBe(3);
          expect(parent.children[0]).toBe(a);
          expect(parent.children[1]).toBe(c);
          expect(parent.children[2]).toBe(b);
        });
        it("inserts the child at index ref, if ref is a number", function () {
          var c = Element.create();
          parent.insert_child(c, 0);
          expect(parent.children.length).toBe(4);
          expect(parent.children[0]).toBe(c);
        });
        it("insert at the end when ref is negative", function () {
          var c = Element.create();
          parent.insert_child(c, -2);
          expect(parent.children.length).toBe(5);
          expect(parent.children[3]).toBe(c);
        });
        it("returns the insterted child", function () {
          var x = Element.create();
          expect(parent.insert_child(x)).toBe(x);
        });
      });
    });

    describe("child(child)", function () {
      it("is the same as insert_child(child) but returns the parent rather " +
        "than the child (for chaining)", function () {
        var p = Element.create();
        var ch = Element.create();
        expect(p.child(ch)).toBe(p);
        expect(ch.parent).toBe(p);
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

      describe("init_with_args(args)", function () {
        it("supports the “scope“ and “prototype” keys", function () {
          var a = bender.Component.create(env.scope);
          var b = Object.create(bender.Component);
          expect(b.init_with_args({ scope: env.scope, prototype: a })).toBe(b);
          expect(b.prototype()).toBe(a);
        });
      });

    });
  });

});
