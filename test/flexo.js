var assert = require("assert");
var flexo = require("flexo");

describe("String", function () {

  describe(".fmt(...)", function () {
    it("replaces its arguments when specified", function () {
      assert.equal("foo = 1", "foo = {0}".fmt(1));
      assert.equal("foo = 1, bar = 2", "foo = {0}, bar = {1}".fmt(1, 2));
      assert.equal("bar = 2", "bar = {1}".fmt(1, 2, 3));
    });
    it("replaces null or undefined values with the empty string", function () {
      assert.equal("foo = ", "foo = {0}".fmt());
      assert.equal("foo = ", "foo = {0}".fmt(undefined));
      assert.equal("foo = ", "foo = {0}".fmt(null));
    });
  });

  describe(".format(obj)", function () {
    var x = { foo: 1, bar: 2, fum: undefined, baz: null };
    it("replaces its arguments when specified", function () {
      assert.equal("foo = 1, bar = 2", "foo = {foo}, bar = {bar}".format(x));
    });
    it("replaces null or undefined values with the empty string", function () {
      assert.equal("fum = ", "fum = {fum}".format(x));
      assert.equal("baz = ", "baz = {baz}".format(x));
      assert.equal("quux = ", "quux = {quux}".format(x));
    });
  });

});

describe("URIs", function () {

  var test_uris = [{
    full: "foo://example.com:8042/over/there?name=ferret#nose",
    scheme: "foo",
    authority: "example.com:8042",
    path: "/over/there",
    query: "name=ferret",
    fragment: "nose"
  }, {
    full: "urn:example:animal:ferret:nose",
    scheme: "urn",
    path: "example:animal:ferret:nose",
  }, {
    full: "http://www.ics.uci.edu/pub/ietf/uri/#Related",
    scheme: "http",
    authority: "www.ics.uci.edu",
    path: "/pub/ietf/uri/",
    fragment: "Related"
  }];

  describe("flexo.split_uri(uri)", function () {
    it("splits an URI into its base components", function () {
      test_uris.forEach(function (uri) {
        var split = flexo.split_uri(uri.full);
        ["scheme", "authority", "path", "query", "fragment"]
          .forEach(function (k) {
            assert.equal(uri[k], split[k]);
          });
      });
    });
    it("always returns a path (may be empty, but not undefined)", function () {
      assert.equal("", flexo.split_uri("foo:").path);
    });
  });

  describe("flexo.unsplit_uri(uri_object)", function () {
    it("outputs a URI from its base components", function () {
      test_uris.forEach(function (uri) {
        assert.equal(uri.full, flexo.unsplit_uri(uri));
      });
    });
  });

  describe("flexo.absolute_uri(base, ref)", function () {
    var base = "http://a/b/c/d;p?q";
    it("works for normal examples from RFC3986", function () {
      assert.equal("g:h", flexo.absolute_uri(base, "g:h"));
      assert.equal("http://a/b/c/g", flexo.absolute_uri(base, "g"));
      assert.equal("http://a/b/c/g", flexo.absolute_uri(base, "./g"));
      assert.equal("http://a/b/c/g/", flexo.absolute_uri(base, "g/"));
      assert.equal("http://a/g", flexo.absolute_uri(base, "/g"));
      assert.equal("http://g", flexo.absolute_uri(base, "//g"));
      assert.equal("http://a/b/c/d;p?y", flexo.absolute_uri(base, "?y"));
      assert.equal("http://a/b/c/g?y", flexo.absolute_uri(base, "g?y"));
      assert.equal("http://a/b/c/d;p?q#s", flexo.absolute_uri(base, "#s"));
      assert.equal("http://a/b/c/g#s", flexo.absolute_uri(base, "g#s"));
      assert.equal("http://a/b/c/g?y#s", flexo.absolute_uri(base, "g?y#s"));
      assert.equal("http://a/b/c/;x", flexo.absolute_uri(base, ";x"));
      assert.equal("http://a/b/c/g;x", flexo.absolute_uri(base, "g;x"));
      assert.equal("http://a/b/c/g;x?y#s", flexo.absolute_uri(base, "g;x?y#s"));
      assert.equal("http://a/b/c/d;p?q", flexo.absolute_uri(base, ""));
      assert.equal("http://a/b/c/", flexo.absolute_uri(base, "."));
      assert.equal("http://a/b/c/", flexo.absolute_uri(base, "./"));
      assert.equal("http://a/b/", flexo.absolute_uri(base, ".."));
      assert.equal("http://a/b/", flexo.absolute_uri(base, "../"));
      assert.equal("http://a/b/g", flexo.absolute_uri(base, "../g"));
      assert.equal("http://a/", flexo.absolute_uri(base, "../.."));
      assert.equal("http://a/", flexo.absolute_uri(base, "../../"));
      assert.equal("http://a/g", flexo.absolute_uri(base, "../../g"));
    });
    it("works for abnormal examples from RFC3986", function () {
      assert.equal("http://a/g", flexo.absolute_uri(base, "../../../g"));
      assert.equal("http://a/g", flexo.absolute_uri(base, "../../../../g"));
      assert.equal("http://a/g", flexo.absolute_uri(base, "/./g"));
      assert.equal("http://a/g", flexo.absolute_uri(base, "/../g"));
      assert.equal("http://a/b/c/g.", flexo.absolute_uri(base, "g."));
      assert.equal("http://a/b/c/.g", flexo.absolute_uri(base, ".g"));
      assert.equal("http://a/b/c/g..", flexo.absolute_uri(base, "g.."));
      assert.equal("http://a/b/c/..g", flexo.absolute_uri(base, "..g"));
      assert.equal("http://a/b/g", flexo.absolute_uri(base, "./../g"));
      assert.equal("http://a/b/c/g/", flexo.absolute_uri(base, "./g/."));
      assert.equal("http://a/b/c/g/h", flexo.absolute_uri(base, "g/./h"));
      assert.equal("http://a/b/c/h", flexo.absolute_uri(base, "g/../h"));
      assert.equal("http://a/b/c/g;x=1/y",
        flexo.absolute_uri(base, "g;x=1/./y"));
      assert.equal("http://a/b/c/y", flexo.absolute_uri(base, "g;x=1/../y"));
      assert.equal("http://a/b/c/g?y/./x", flexo.absolute_uri(base, "g?y/./x"));
      assert.equal("http://a/b/c/g?y/../x",
        flexo.absolute_uri(base, "g?y/../x"));
      assert.equal("http://a/b/c/g#s/./x", flexo.absolute_uri(base, "g#s/./x"));
      assert.equal("http://a/b/c/g#s/../x",
        flexo.absolute_uri(base, "g#s/../x"));
    });
  });

  describe("flexo.get_args(defaults, argstr)", function () {
    it("parses the given argument string", function () {
      var argstr = "href=../apps/logo.xml&x=1";
      var args = flexo.get_args({}, argstr);
      assert.equal("../apps/logo.xml", args.href);
      assert.equal("1", args.x);
    });
    it("replaces defaults with values from the arg string", function () {
      var argstr = "href=../apps/logo.xml&x=2&y=4";
      var args = flexo.get_args({ x: 1 }, argstr);
      assert.equal("../apps/logo.xml", args.href);
      assert.equal("2", args.x);
      assert.equal("4", args.y);
    });
  });

});
