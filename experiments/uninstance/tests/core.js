describe("Bender core", function () {

  it("is currently at version %0".fmt(bender.VERSION), flexo.nop);

  var env = bender.environment();

  describe("Bender environment (bender.Environment)", function () {

    describe("init()", function () {
      it("initializes an environment with a top-level scope", function () {
        var e = Object.create(bender.Environment).init();
        expect(e.scope.environment).toBe(e);
      });
    });

    describe("component(component?)", function () {
      it("adds a component to the environment", function () {
        var c = bender.Component.create(env.scope);
        env.component(c);
        expect(env.components).toContain(c);
      });
      it("creates a new component beofre adding it if none is given",
        function () {
          expect(env.component().tag).toBe("component");
        });
      it("returns the added component", function () {
        var c = bender.Component.create(env.scope);
        expect(env.component(c)).toBe(c);
      });
      it("throws if the component belongs to a different environment",
        function () {
          var fail = function () {
            var e = bender.environment();
            env.component(e.component());
          };
          expect(fail).toThrow();
        });
    });

    describe("$(tag, args?, contents?)", function () {
      it("is a convenience methods to create elements from a tag name (like " +
        "component, view, &c.)", function () {
         //  expect(env.$("view");
        });
    });

    describe("$component(args?, contents?)", function () {
      it("creates a new component (same as $(\"component\", ...))", function () {
        var a = env.$component();
        var b = env.$component({ id: "b", prototype: a });
        expect(a.tag).toBe("component");
        expect(b.id()).toBe("b");
        expect(b.prototype()).toBe(a);
      });
    });

    describe("bender.environment()", function () {
      it("creates a new environment (same as create(...).init())", function () {
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
          expect(elem.instances).toBeDefined();
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
          var elem = bender.Element.create();
          expect(elem.children).toBeDefined();
        });
      });

      describe("instantiate(scope?, shallow?)", function () {
        var elem = bender.Element.create();
        var instance = elem.instantiate();
        it("creates a new instance of the element", function () {
          expect(Object.getPrototypeOf(instance)).toBe(elem);
        });
        it("adds the instance to the list of instances", function () {
          expect(elem.instances).toContain(instance);
        });
        it("throws when trying to instantiate an instance", function() {
          expect(function () {
            instance.instantiate();
          }).toThrow();
        });
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
        it("inserts at the end when ref is negative", function () {
          var c = Element.create();
          parent.insert_child(c, -2);
          expect(parent.children.length).toBe(5);
          expect(parent.children[3]).toBe(c);
        });
        it("converts a DOM element into a Bender DOMElement", function () {
          var p = env.scope.document.createElement("p");
          var p_ = parent.insert_child(p);
          expect(p.nodeType).toBe(window.Node.ELEMENT_NODE);
          expect(p.localName).toBe("p");
          expect(p_.tag).toBe("dom");
          expect(p_.name).toBe("p");
        });
        it("converts a text string into a Bender Text element", function () {
          var text = "O HAI";
          var t = parent.insert_child(text);
          expect(t.tag).toBe("text");
          expect(t.text()).toBe(text);
        });
        it("returns the insterted child", function () {
          var x = Element.create();
          expect(parent.insert_child(x)).toBe(x);
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

      describe("component", function () {
        it("is the closest component element ancestor of the element, if any",
          function () {
            var component = env.component();
            var child = component.insert_child(Element.create());
            var grand_child = child.insert_child(Element.create());
            var orphan = Element.create();
            expect(component.component).toBe(component);
            expect(child.component).toBe(component);
            expect(grand_child.component).toBe(component);
            expect(orphan.component).toBeUndefined();
          });
      });

      describe("next_sibling", function () {
        var p = Element.create();
        var a = p.insert_child(Element.create());
        var b = p.insert_child(Element.create());
        it("is a read-only property pointing to the next sibling of the " +
          "element", function () {
            expect(a.next_sibling).toBe(b);
          });
        it("is undefined for the last child element", function () {
          expect(b.next_sibling).toBeUndefined();
        });
        it("is also undefined for elements that have no parent", function () {
          expect(p.next_sibling).toBeUndefined();
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

      describe("init_with_args(args)", function () {
        it("supports the additional “scope” (mandatory) and “prototype” keys",
          function () {
            var a = bender.Component.create(env.scope);
            var b = Object.create(bender.Component);
            expect(b.init_with_args({ scope: env.scope, prototype: a }))
              .toBe(b);
            expect(b.prototype()).toBe(a);
          });
      });
    });

    describe("bender.ViewElement", function () {
      it("is the basis for elements that appear inside a component view " +
        "(DOMElement, Text and Content)", flexo.nop);
      describe("init_with_args(args)", function () {
        it("supports the additional “renderId”/“render-id” key", function () {
          var v = Object.create(bender.ViewElement)
            .init_with_args({ renderId: "id" });
          expect(v.renderId()).toBe("id");
        });
      });
      describe("renderId(renderId?)", function () {
        it("sets the value of renderId to renderId; legal values are " + 
          "“class”, “id”, “none”, and “inherit”", function () {
            var v = Object.create(bender.ViewElement)
              .init_with_args({ renderId: "class" });
            var w = Object.create(bender.ViewElement)
              .init_with_args({ renderId: "none" });
            var x = Object.create(bender.ViewElement)
              .init_with_args({ renderId: "inherit" });
            expect(v.renderId()).toBe("class");
            expect(w.renderId()).toBe("none");
            expect(x.renderId()).toBe("inherit");
          });
        it("defaults to “inherit”", function () {
          var v = bender.ViewElement.create();
          var w = Object.create(bender.ViewElement)
            .init_with_args({ renderId: "foo" });
          expect(v.renderId()).toBe("inherit");
          expect(w.renderId()).toBe("inherit");
        });
      });
      describe("insert_child(child)", function () {
        it("sets the parent of a component to the component of the view for " +
          "child component elements", function () {
            var c = env.component();
            var d = env.component();
            c.view(d);
            expect(d.scope.parent).toBe(c);
          });
      });
    });

    describe("bender.Text", function () {
      it("represents an explicit text node that can also have an id attribute" +
        " (as well as metadata)", flexo.nop);
      describe("env.$text(attrs?, contents)", function () {
        it("behaves differently from other $ functions in that text string " +
          "arguments are used to set the text property of the element",
          function () {
            var t = env.$text("foo");
            var u = env.$text("bar", "baz");
            var v = env.$text({ id: "v" }, "bar", env.$p("hello"), "baz");
            expect(t.text()).toBe("foo");
            expect(u.text()).toBe("barbaz");
            expect(v.text()).toBe("barbaz");
            expect(v.id()).toBe("v");
            expect(v.children.length).toBe(1);
          });
      });
    });

    describe("bender.Attribute", function () {
      it("represents an attribute of its parent element (note: this is not a " +
        "ViewElement though!)", function () {
          expect(bender.Attribute.renderId).toBeUndefined();
        });
      describe("init(ns, name)", function () {
        it("initializes the attribute with a namespace URI and local name",
          function () {
            var a = bender.Attribute.create("", "class");
            expect(a.tag).toBe("attribute");
            expect(a.ns).toBe("");
            expect(a.name).toBe("class");
          });
      });
      describe("init_with_args(args)", function () {
        it("supports the additional ns (optional) and name (mandatory) arguments",
          function () {
            var a = Object.create(bender.Attribute)
              .init_with_args({ name: "class" });
            expect(a.tag).toBe("attribute");
            expect(a.ns).toBe("");
            expect(a.name).toBe("class");
          });
        it("is called by env.$attribute(args, children)", function () {
          var a = env.$attribute({ name: "class", id: "class-attr" }, "test");
          expect(a.tag).toBe("attribute");
          expect(a.ns).toBe("");
          expect(a.name).toBe("class");
          expect(a.shallow_text).toBe("test");
        });
      });
    });

  });

});
