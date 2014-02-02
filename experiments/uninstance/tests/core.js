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
      var c = bender.Component.create(env.scope);
      it("adds a component to the environment", function () {
        env.component(c);
        expect(env.components).toContain(c);
      });
      it("creates a new component before adding it if none is given",
        function () {
          expect(env.component().tag).toBe("component");
        });
      it("creates a derived component from `component` in the environment " +
        "scope if it was already in the environment", function () {
          expect(Object.getPrototypeOf(env.component(c))).toBe(c);
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
        expect(Object.getPrototypeOf(b)).toBe(a);
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
        var elem = Object.create(bender.Element).init();
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

      describe("instantiate(scope, shallow?)", function () {
        var scope = {};
        var elem = bender.Element.create()
          .id("foo")
          .child(bender.Element.create().id("bar"));
        var instance = elem.instantiate(scope);
        it("creates a new instance of the element", function () {
          expect(Object.getPrototypeOf(instance)).toBe(elem);
        });
        it("adds the instance to the list of instances", function () {
          expect(elem.instances).toContain(instance);
        });
        it("throws when trying to instantiate an instance", function() {
          expect(function () {
            instance.instantiate(scope);
          }).toThrow();
        });
        it("updates the scope with @ ids", function () {
          expect(scope["@foo"]).toBe(instance);
          expect(Object.getPrototypeOf(scope["@foo"])).toBe(elem);
          expect(scope["@bar"]).toBe(instance.children[0]);
        });
        it("instantiates child elements as well...", function () {
          var instance = elem.instantiate(scope);
          expect(instance.children.length).toBe(elem.children.length);
          expect(Object.getPrototypeOf(instance.children[0]))
            .toBe(elem.children[0]);
          expect(instance.children[0].parent).toBe(instance);
        });
        it("... unless the shallow flag is set; in which case the children " + 
            "of the instances are the same as the original element.",
            function () {
              var scope = {};
              var instance = elem.instantiate(scope, true);
              expect(instance.children.length).toBe(elem.children.length);
              expect(instance.children[0]).toBe(elem.children[0]);
              expect(instance.children[0].parent).toBe(elem);
              expect(scope["@foo"]).toBe(instance);
              expect(Object.getPrototypeOf(scope["@foo"])).toBe(elem);
              expect(scope["@bar"]).toBeUndefined();
            });
      });

      describe("uninstantiate(scope?)", function () {
        var scope = {};
        var elem = bender.Element.create().id("foo");
        var instance = elem.instantiate(scope);
        var uninstance;
        it("removes the instance from its prototype’s list of instances",
          function () {
            expect(Object.getPrototypeOf(instance)).toBe(elem);
            expect(elem.instances).toContain(instance);
            expect(scope["@foo"]).toBe(instance);
            uninstance = instance.uninstantiate(scope);
            expect(elem.instances).not.toContain(instance);
          });
        it("removes the @ attribute from the scope", function () {
          expect(scope["@foo"]).toBeUndefined();
        });
        it("returns the instance", function () {
          expect(uninstance).toBe(instance);
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
        it("does not set the id if it is the reserved keyword “this”",
          function () {
            var e = Element.create().id("this");
            expect(e.id()).toBe("");
            var f = Element.create().id("  THIS  ");
            expect(f.id()).toBe("THIS");
          });
        it("returns the element when called with a parameter", function () {
          expect(c_).toBe(c);
        });
        it("returns the id of the element, or an empty string if the element " +
          "has no id, when called with no parameter", function () {
            expect(a.id()).toBe("a");
            expect(b.id()).toBe("");
          });
        it("adds the ID to the scope of the containing component, if any",
            function () {
              var id = "rnd-" + flexo.random_id();
              var component = env.component().id(id);
              expect(component.id()).toBe(id);
              expect(component.scope["#" + id]).toBe(component);
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

      describe("remove_child(child)", function () {
        // TODO
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
        it("creates an abstract scope if created from the environment scope",
          function () {
            expect(Object.getPrototypeOf(elem.scope)
              .hasOwnProperty("components")).toBe(true);
            expect(elem.scope.components).toContain(elem);
            expect(Object.getPrototypeOf(elem.scope).hasOwnProperty("concrete"))
              .toBe(true);
          });
      });

      describe("init_with_args(args)", function () {
        it("supports the additional “scope” (mandatory) and “prototype” keys",
          function () {
            var a = bender.Component.create(env.scope);
            var b = Object.create(bender.Component)
              .init_with_args({ scope: env.scope, prototype: a });
            expect(Object.getPrototypeOf(b)).toBe(a);
          });
      });

      describe("events", function () {
        var c = env.component();
        it("is the dictionary of events of the component", function () {
          expect("ready" in c.events).toBe(true);
        });
        it("is updated when event children are added", function () {
          var nm = "hi";
          c.event(nm);
          expect(c.events.hasOwnProperty(nm)).toBe(true);
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

    describe("bender.Content", function () {
      it("represents an extension point for a view, as well as provide " +
        "default content", function () {
          var c = env.$content();
          expect(c.tag).toBe("content");
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

    describe("Scopes (abstract)", function () {
      var C = env.component().id("C");
      var C1 = env.component(C).id("C1");
      var C2 = env.component(C).id("C2");
      var B = env.component().id("B").view(C1, C2);
      var b_scope = Object.getPrototypeOf(B.scope);
      var B1 = env.component(B).id("B1");
      var B2 = env.component(B).id("B2");
      var A = env.component().id("A").view(B1, B2);
      var a_scope = Object.getPrototypeOf(A.scope);
      var Z = env.component();
      var Y = env.component().view(Z);
      var v = bender.View.create().child(Y);
      var X = env.component().child(v);
      var x_scope = Object.getPrototypeOf(X.scope);
      describe("scope.parent", function () {
        it("points to the parent component of a component", function () {
          expect(B1.scope.parent).toBe(A);
          expect(B2.scope.parent).toBe(A);
          expect(C1.scope.parent).toBe(B);
          expect(C2.scope.parent).toBe(B);
          expect(Y.scope.parent).toBe(X);
          expect(Z.scope.parent).toBe(Y);
          expect(A.scope.parent).toBeUndefined();
        });
      });
      describe("scope.children", function () {
        it("contains the list of child components of a component", function () {
          expect(A.scope.children).toContain(B1);
          expect(A.scope.children).toContain(B2);
          expect(B.scope.children).toContain(C1);
          expect(B.scope.children).toContain(C2);
          expect(X.scope.children).toContain(Y);
          expect(Y.scope.children).toContain(Z);
        });
        it("child components are added to the abstract scope of their parent",
          function () {
            expect(Object.getPrototypeOf(C1.scope)).toBe(b_scope);
            expect(Object.getPrototypeOf(C2.scope)).toBe(b_scope);
            expect(b_scope["#B"]).toBe(B);
            expect(b_scope["#C1"]).toBe(C1);
            expect(b_scope["#C2"]).toBe(C2);
            expect(Object.getPrototypeOf(Y.scope)).toBe(x_scope);
            expect(Object.getPrototypeOf(Z.scope)).toBe(x_scope);
        });
      });
      describe("scope.components", function () {
        it("contains all components within an abstract scope", function () {
          expect(b_scope.components).toContain(B);
          expect(b_scope.components).toContain(C1);
          expect(b_scope.components).toContain(C2);
          expect(x_scope.components).toContain(X);
          expect(x_scope.components).toContain(Y);
          expect(x_scope.components).toContain(Z);
        });
      });
    });

  });

});
