var assert = require("assert");
var flexo = require("flexo");

describe("String", function () {

  describe("#fmt()", function () {
    it("should replace its arguments when specified", function () {
      assert.equal("foo = 1", "foo = {0}".fmt(1));
      assert.equal("foo = 1, bar = 2", "foo = {0}, bar = {1}".fmt(1, 2));
      assert.equal("bar = 2", "bar = {1}".fmt(1, 2, 3));
    });
    it("should replace null or undefined values with the empty string",
      function () {
        assert.equal("foo = ", "foo = {0}".fmt());
        assert.equal("foo = ", "foo = {0}".fmt(undefined));
        assert.equal("foo = ", "foo = {0}".fmt(null));
      });
  });

  describe("#format()", function () {
    var x = { foo: 1, bar: 2, fum: undefined, baz: null };
    it("should replace its arguments when specified", function () {
      assert.equal("foo = 1, bar = 2", "foo = {foo}, bar = {bar}".format(x));
    });
    it("should replace null or undefined values with the empty string",
      function () {
        assert.equal("fum = ", "fum = {fum}".format(x));
        assert.equal("baz = ", "baz = {baz}".format(x));
        assert.equal("quux = ", "quux = {quux}".format(x));
      });
  });

});
