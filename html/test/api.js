"use strict";

var assert = window.chai.assert;

describe("Javascript API", function () {

  describe("Environment", function () {

    describe("new bender.Environment([document])", function () {

      it("creates a new Bender environment in the given document", function () {
        var doc = document.implementation.createDocument(flexo.ns.html, "html",
          null);
        var env = new bender.Environment(doc);
        assert.strictEqual(env.scope.$document, doc);
      });

      it("creates a new Bender environment in the current document by default", function () {
        var env = new bender.Environment();
        assert.strictEqual(env.scope.$document, window.document);
      });

    });

  });

  describe("Elements", function () {

    describe("bender.Element", function() {

      it("is the base class for all Bender elements that have content (i.e., all elements except Link and Text)", function () {
        assert.strictEqual(typeof bender.Element, "function");
      });

      it("must be init()ed before use", function () {
        var elem = new bender.Element().init();
        assert.deepEqual(elem.children, []);
      });

      it("has an id property with accessor id([value])", function () {
        var elem = new bender.Element();
        assert.strictEqual(elem.id(), "");
        assert.strictEqual(elem.id("x"), elem);
        assert.strictEqual(elem.id(), "x");
      });

      it("can have Element or Text children, added with append_child(child) which returns the child element", function () {
        var parent = new bender.Element().init();
        var ch1 = parent.append_child(new bender.Element().init());
        var ch2 = parent.append_child(new bender.Element().init());
        var t = parent.append_child(new bender.Text("foo"));
        assert.deepEqual(parent.children, [ch1, ch2, t]);
        assert.strictEqual(ch1._parent, parent);
        assert.strictEqual(ch2._parent, parent);
        assert.strictEqual(t._parent, parent);
      });

      it("can have Element children, added with child(child) which returns the element itself (for chaining)", function () {
        var ch1 = new bender.Element().init();
        var ch2 = new bender.Element().init();
        var parent = new bender.Element().init().child(ch1).child(ch2);
        assert.deepEqual(parent.children, [ch1, ch2]);
        assert.strictEqual(ch1._parent, parent);
        assert.strictEqual(ch2._parent, parent);
      });
    });

    describe("bender.Attribute", function () {

      it("inherits from bender.Element", function () {
        var attr = new bender.Attribute;
        assert.ok(attr instanceof bender.Attribute);
        assert.ok(attr instanceof bender.Element);
        assert.strictEqual(typeof attr.id, "function");
      });

      it("is created with a local name and no namespace URI with new bender.Attribute(name)", function () {
        var attr = new bender.Attribute("foo");
        assert.deepEqual(attr.children, []);
        assert.strictEqual(attr.id(), "");
        assert.strictEqual(attr.ns(), "");
        assert.strictEqual(attr.name(), "foo");
      });

      it("is created with a namespace URI and a local name with new bender.Attribute(ns, name)", function () {
        var attr = new bender.Attribute(bender.ns, "bar");
        assert.deepEqual(attr.children, []);
        assert.strictEqual(attr.ns(), bender.ns);
        assert.strictEqual(attr.name(), "bar");
      });
    });

    describe("bender.Component", function () {

      var env = new bender.Environment;

      it("can define new properties with component.property(name[, value])", function () {
        var component = env.component().property("x");
        assert.ok(component.own_properties.x instanceof bender.Property);
        assert.strictEqual(component.own_properties.x.value());
      });

    });

    describe("bender.Content", function () {

      it("is created with new bender.Content()", function () {
        var view = new bender.Content();
        assert.ok(view instanceof bender.Content);
        assert.deepEqual(view.children, []);
        assert.strictEqual(view.id(), "");
      });

      it("all its children are its content (even though some Bender content may have no effect on rendering)", function () {
        var view = new bender.View()
          .child(new bender.DOMElement(flexo.ns.html, "p"))
          .child(new bender.Element());
        assert.strictEqual(view.children.length, 2);
      });

    });

    describe("bender.DOMElement", function () {

      it("is created with a namespace and a name with new bender.DOMElement(ns, name)", function () {
        var elem = new bender.DOMElement(flexo.ns.html, "p");
        assert.ok(elem instanceof bender.DOMElement);
        assert.strictEqual(elem.ns, flexo.ns.html);
        assert.strictEqual(elem.name, "p");
        assert.deepEqual(elem.attrs, {});
      });

      it("sets attributes with elem.attr(ns, name, value)", function () {
        var elem = new bender.DOMElement(flexo.ns.html, "p")
          .attr("", "class", "foo")
          .attr("", "data-baz", "fum");
        assert.ok(typeof elem.attrs[""] === "object");
        assert.strictEqual(elem.attrs[""].class, "foo");
        assert.strictEqual(elem.attr("", "data-baz"), "fum");
        assert.ok(!elem.attrs[""].hasOwnProperty("id"));
      });

    });

    describe("bender.DOMTextNode", function () {

      it("is created with no text with new bender.DOMTextNode()", function () {
        var node = new bender.DOMTextNode();
        assert.ok(node instanceof bender.DOMTextNode);
        assert.strictEqual(node._text);
        assert.strictEqual(node.text(), "");
      });

      it("set text with node.text()", function () {
        var node = new bender.DOMTextNode().text("Hello there");
        assert.strictEqual(node.text(), "Hello there");
      });

    });

    describe("bender.Get", function () {
      it("is pending");
    });

    describe("bender.Link", function () {
      it("is pending");
    });

    describe("bender.Property", function () {

      it("is created with a name with new bender.Property(name); defaults to a property with no (undefined) value", function () {
        var prop = new bender.Property("x");
        assert.strictEqual(prop.name, "x");
        assert.strictEqual(prop.value());
      });

      it("can get/set the value property.value([value])", function () {
        var prop = new bender.Property("x").value(42);
        assert.strictEqual(prop.name, "x");
        assert.strictEqual(prop.value(), 42);
      });

    });

    describe("bender.Set", function () {
      it("is pending");
    });

    describe("bender.Text", function () {

      it("is created with text content with new bender.Text(text)", function () {
        var text = new bender.Text("hello");
        assert.ok(text instanceof bender.Text);
        assert.strictEqual(text.text(), "hello");
        assert.strictEqual(text.id(), "");
      });

      it("can get/set an id with text.id([value])", function () {
        var text = new bender.Text;
        assert.strictEqual(text.text(), "");
        assert.strictEqual(text.id(), "");
        assert.strictEqual(text.id("hi"), text);
        assert.strictEqual(text.id(), "hi");
      });

      it("can get/set the text content with text.text([value])", function () {
        var text = new bender.Text;
        assert.strictEqual(text.text(), "");
        assert.strictEqual(text.text("new text"), text);
        assert.strictEqual(text.text(), "new text");
      });

    });

    describe("bender.View", function () {

      it("is created with new bender.View()", function () {
        var view = new bender.View();
        assert.ok(view instanceof bender.View);
        assert.deepEqual(view.children, []);
        assert.strictEqual(view.id(), "");
      });

      it("all its children are its content (even though some Bender content may have no effect on rendering)", function () {
        var view = new bender.View()
          .child(new bender.DOMElement(flexo.ns.html, "p"))
          .child(new bender.Content());
        assert.strictEqual(view.children.length, 2);
      });

      it("has a stack attribute with values “top” (default), “bottom” and “replace”", function () {
        var view = new bender.View();
        assert.strictEqual(view.stack(), "top");
        assert.strictEqual(view.stack("bottom")._stack, "bottom");
        assert.strictEqual(view.stack("replace")._stack, "replace");
        assert.strictEqual(view.stack(42)._stack, "top");
      });

    });

    describe("bender.Watch", function () {

      it("is created with an empty list of gets and sets", function () {
        var watch = new bender.Watch();
        assert.ok(watch instanceof bender.Watch);
        assert.strictEqual(watch.gets.length, 0);
        assert.strictEqual(watch.sets.length, 0);
        assert.strictEqual(watch.id(), "");
      });

      it("adds get or set children in the right list", function () {
        var watch = new bender.Watch().child(new bender.GetProperty("x"))
          .child(new bender.SetDOMProperty("textContent", "$first"));
        assert.ok(watch instanceof bender.Watch);
        assert.strictEqual(watch.gets.length, 1);
        assert.ok(watch.gets[0] instanceof bender.GetProperty);
        assert.strictEqual(watch.sets.length, 1);
        assert.ok(watch.sets[0] instanceof bender.SetDOMProperty);
      });

    });

  });

  describe("Rendering", function () {

    var env = new bender.Environment();

    describe("Rendering links", function () {

      describe("bender.Link.prototype.render(target)", function () {

        it("renders a script link into a HTML target as a <script> element and return a promise", function (done) {
          var link = new bender.Link(env, "script", "a1.js");
          link.render(document.head).then(function (link_) {
            assert.strictEqual(link_, link);
            assert.ok(link.rendered instanceof window.Node);
            assert.strictEqual(link.rendered.localName, "script");
            assert.strictEqual(window.a1, "a1");
            delete window.a1;
          }).then(flexo.discard(done), done);
        });

        it("renders a stylesheet link into a HTML target as a <link> element", function () {
          var link = new bender.Link(env, "stylesheet", "test-link.css");
          var link_ = link.render(document.head);
          assert.strictEqual(link_, link);
          assert.ok(link.rendered instanceof window.Node);
          assert.strictEqual(link.rendered.localName, "link");
          assert.strictEqual(link.rendered.rel, link.rel);
        });

      });

      describe("bender.Component.prototype.render_links(chain, target)", function () {

        it("renders all links of the component chain ancestor-first (then in document order)", function (done) {
          var env = new bender.Environment();
          var a = env.component().link("script", "a1.js");
          var b = env.component().extends(a).link("script", "b1.js");
          b.render_links(b.chain(), document.body).then(function () {
            assert.ok(a.links[0] instanceof bender.Link);
            assert.ok(a.links[0].rendered instanceof window.Node);
            assert.strictEqual(a.links[0].rendered.localName, "script");
            assert.ok(b.links[0] instanceof bender.Link);
            assert.ok(b.links[0].rendered instanceof window.Node);
            assert.strictEqual(b.links[0].rendered.localName, "script");
            assert.strictEqual(window.a1, "a1");
            assert.strictEqual(window.b1, "a1/b1");
          }).then(flexo.discard(done), done);
        });

      });

    });

    describe("Rendering properties", function () {

      it("own properties are rendered to a vertex as soon as the property is added to a component", function () {
        var a = env.component().property("x", 1);
        assert.ok(a.own_properties.x instanceof bender.Property);
        assert.strictEqual(a.own_properties.x.value(), 1);
        var v = a.property_vertices.x;
        assert.ok(v instanceof bender.PropertyVertex);
        assert.strictEqual(v.property.name, "x");
        assert.strictEqual(a.properties.hasOwnProperty("x"), true);
      });

      describe("bender.Component.prototype.render_properties(chain)", function () {

        it("render properties for the derived instance", function () {
          var a = env.component().property("x", 1);
          var chain = a.chain();
          a.render_properties(chain);
          assert.strictEqual(chain[0].properties.hasOwnProperty("x"), true);
        });

      });

    });

  });

});
