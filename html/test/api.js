"use strict";

var assert = typeof require == "function" && require("chai").assert ||
  window.chai.assert;
var flexo = typeof require == "function" && require("flexo") || window.flexo;

describe("Javascript API", function () {

  describe("bender.Element", function() {

    it("is the base class for all Bender elements that have content (i.e., all elements except Link)", flexo.nop);

    it("has an id property", function () {
      var elem = new bender.Element;
      assert.strictEqual(elem.id(), "");
    });

    it("should be init()ed before use", function () {
      var elem = new bender.Element().init();
      assert.deepEqual(elem._children, []);
    });

    it("can have Element children, added with append_child(child) which returns the child element", function () {
      var parent = new bender.Element().init();
      var ch1 = parent.append_child(new bender.Element().init());
      var ch2 = parent.append_child(new bender.Element().init());
      assert.deepEqual(parent._children, [ch1, ch2]);
      assert.strictEqual(ch1._parent, parent);
      assert.strictEqual(ch2._parent, parent);
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
    });

    it("is created with a local name and no namespace URI with new bender.Attribute(name)", function () {
      var attr = new bender.Attribute("foo");
      assert.deepEqual(attr._children, []);
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

});
