"use strict";

var assert = typeof require == "function" && require("chai").assert ||
  window.chai.assert;
var flexo = typeof require == "function" && require("flexo") || window.flexo;

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
        assert.deepEqual(elem._children, []);
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
        assert.deepEqual(parent._children, [ch1, ch2, t]);
        assert.strictEqual(ch1._parent, parent);
        assert.strictEqual(ch2._parent, parent);
        assert.strictEqual(t._parent, parent);
      });

      it("can have Element children, added with child(child) which returns the element itself (for chaining)", function () {
        var ch1 = new bender.Element().init();
        var ch2 = new bender.Element().init();
        var parent = new bender.Element().init().child(ch1).child(ch2);
        assert.deepEqual(parent._children, [ch1, ch2]);
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
        assert.deepEqual(attr._children, []);
        assert.strictEqual(attr.id(), "");
        assert.strictEqual(attr.ns(), "");
        assert.strictEqual(attr.name(), "foo");
      });

      it("is created with a namespace URI and a local name with new bender.Attribute(ns, name)", function () {
        var attr = new bender.Attribute(bender.ns, "bar");
        assert.deepEqual(attr._children, []);
        assert.strictEqual(attr.ns(), bender.ns);
        assert.strictEqual(attr.name(), "bar");
      });
    });

    describe("bender.Component", function () {

      var env = new bender.Environment;

      it("can define new properties with component.property(name[, value])", function () {
        var component = env.component().property("x");
        assert.ok(component._own_properties.x instanceof bender.Property);
        assert.strictEqual(component._own_properties.x.value());
      });

    });

    describe("bender.Content", function () {
      it("is pending");
    });

    describe("bender.DOMElement", function () {
      it("is pending");
    });

    describe("bender.DOMTextNode", function () {
      it("is pending");
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
        assert.deepEqual(view._children, []);
        assert.strictEqual(view.id(), "");
      });

      it("all its children are its content (even though some Bender content may have no effect on rendering)", function () {
        var view = new bender.View()
          .child(new bender.DOMElement(flexo.ns.html, "p"))
          .child(new bender.Content());
        assert.strictEqual(view._children.length, 2);
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

      it("is created with an empty list of gets and sets, and is initially enabled (i.e., not disabled)", function () {
        var watch = new bender.Watch();
        assert.ok(watch instanceof bender.Watch);
        assert.strictEqual(watch.gets.length, 0);
        assert.strictEqual(watch.sets.length, 0);
        assert.strictEqual(watch.disabled(), false);
        assert.strictEqual(watch.id(), "");
      });

      it("adds get or set children in the right list", function () {
        // var watch = new bender.Watch().child(new bender.
      });

    });

  });

});
