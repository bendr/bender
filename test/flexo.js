(function () {
  "use strict";

  var assert = typeof require === "function" && require("chai").assert ||
    window.chai.assert;
  var flexo = typeof require === "function" && require("flexo") || window.flexo;

  describe("String", function () {

    describe(".fmt(...)", function () {
      it("replaces its arguments when specified", function () {
        assert.strictEqual("foo = 1", "foo = {0}".fmt(1));
        assert.strictEqual("foo = 1, bar = 2",
          "foo = {0}, bar = {1}".fmt(1, 2));
        assert.strictEqual("bar = 2", "bar = {1}".fmt(1, 2, 3));
        assert.strictEqual("2012年8月30日", "{2}年{1}月{0}日".fmt(30, 8, 2012));
      });
      it("outputs an empty string for null, undefined or missing values",
        function () {
          assert.strictEqual("foo = ", "foo = {0}".fmt());
          assert.strictEqual("foo = ", "foo = {0}".fmt(undefined));
          assert.strictEqual("foo = ", "foo = {0}".fmt(null));
        });
    });

    describe(".format(obj)", function () {
      var x = { foo: 1, bar: 2, fum: undefined, baz: null };
      it("replaces its arguments when specified", function () {
        assert.strictEqual("foo = 1, bar = 2",
          "foo = {foo}, bar = {bar}".format(x));
      });
      it("outputs an empty string for null, undefined or missing values",
        function () {
          assert.strictEqual("fum = ", "fum = {fum}".format(x));
          assert.strictEqual("baz = ", "baz = {baz}".format(x));
          assert.strictEqual("quux = ", "quux = {quux}".format(x));
        });
    });

  });


  describe("URIs", function () {
    var test_uris = [{
      unparsed: "foo://example.com:8042/over/there?name=ferret#nose",
      parsed: {
        scheme: "foo",
        authority: "example.com:8042",
        path: "/over/there",
        query: "name=ferret",
        fragment: "nose"
      }
    }, {
      unparsed: "urn:example:animal:ferret:nose",
      parsed: {
        scheme: "urn",
        authority: undefined,
        path: "example:animal:ferret:nose",
        query: undefined,
        fragment: undefined
      }
    }, {
      unparsed: "http://www.ics.uci.edu/pub/ietf/uri/#Related",
      parsed: {
        scheme: "http",
        authority: "www.ics.uci.edu",
        path: "/pub/ietf/uri/",
        query: undefined,
        fragment: "Related"
      }
    }];

    describe("flexo.split_uri(uri)", function () {
      it("splits an URI into its base components", function () {
        test_uris.forEach(function (uri) {
          assert.deepEqual(uri.parsed, flexo.split_uri(uri.unparsed));
        });
      });
      it("always returns a path (may be empty, but not undefined)", function () {
        assert.strictEqual("", flexo.split_uri("foo:").path);
      });
    });

    describe("flexo.unsplit_uri(uri_object)", function () {
      it("outputs a URI from its base components", function () {
        test_uris.forEach(function (uri) {
          assert.strictEqual(uri.unparsed, flexo.unsplit_uri(uri.parsed));
        });
      });
    });

    describe("flexo.absolute_uri(base, ref)", function () {
      var base = "http://a/b/c/d;p?q";
      it("works for normal examples from RFC3986", function () {
        assert.strictEqual("g:h", flexo.absolute_uri(base, "g:h"));
        assert.strictEqual("http://a/b/c/g", flexo.absolute_uri(base, "g"));
        assert.strictEqual("http://a/b/c/g", flexo.absolute_uri(base, "./g"));
        assert.strictEqual("http://a/b/c/g/", flexo.absolute_uri(base, "g/"));
        assert.strictEqual("http://a/g", flexo.absolute_uri(base, "/g"));
        assert.strictEqual("http://g", flexo.absolute_uri(base, "//g"));
        assert.strictEqual("http://a/b/c/d;p?y",
          flexo.absolute_uri(base, "?y"));
        assert.strictEqual("http://a/b/c/g?y", flexo.absolute_uri(base, "g?y"));
        assert.strictEqual("http://a/b/c/d;p?q#s",
          flexo.absolute_uri(base, "#s"));
        assert.strictEqual("http://a/b/c/g#s", flexo.absolute_uri(base, "g#s"));
        assert.strictEqual("http://a/b/c/g?y#s",
          flexo.absolute_uri(base, "g?y#s"));
        assert.strictEqual("http://a/b/c/;x", flexo.absolute_uri(base, ";x"));
        assert.strictEqual("http://a/b/c/g;x", flexo.absolute_uri(base, "g;x"));
        assert.strictEqual("http://a/b/c/g;x?y#s",
          flexo.absolute_uri(base, "g;x?y#s"));
        assert.strictEqual("http://a/b/c/d;p?q", flexo.absolute_uri(base, ""));
        assert.strictEqual("http://a/b/c/", flexo.absolute_uri(base, "."));
        assert.strictEqual("http://a/b/c/", flexo.absolute_uri(base, "./"));
        assert.strictEqual("http://a/b/", flexo.absolute_uri(base, ".."));
        assert.strictEqual("http://a/b/", flexo.absolute_uri(base, "../"));
        assert.strictEqual("http://a/b/g", flexo.absolute_uri(base, "../g"));
        assert.strictEqual("http://a/", flexo.absolute_uri(base, "../.."));
        assert.strictEqual("http://a/", flexo.absolute_uri(base, "../../"));
        assert.strictEqual("http://a/g", flexo.absolute_uri(base, "../../g"));
      });
      it("works for abnormal examples from RFC3986", function () {
        assert.strictEqual("http://a/g",
          flexo.absolute_uri(base, "../../../g"));
        assert.strictEqual("http://a/g",
          flexo.absolute_uri(base, "../../../../g"));
        assert.strictEqual("http://a/g", flexo.absolute_uri(base, "/./g"));
        assert.strictEqual("http://a/g", flexo.absolute_uri(base, "/../g"));
        assert.strictEqual("http://a/b/c/g.", flexo.absolute_uri(base, "g."));
        assert.strictEqual("http://a/b/c/.g", flexo.absolute_uri(base, ".g"));
        assert.strictEqual("http://a/b/c/g..", flexo.absolute_uri(base, "g.."));
        assert.strictEqual("http://a/b/c/..g", flexo.absolute_uri(base, "..g"));
        assert.strictEqual("http://a/b/g", flexo.absolute_uri(base, "./../g"));
        assert.strictEqual("http://a/b/c/g/",
          flexo.absolute_uri(base, "./g/."));
        assert.strictEqual("http://a/b/c/g/h",
          flexo.absolute_uri(base, "g/./h"));
        assert.strictEqual("http://a/b/c/h",
          flexo.absolute_uri(base, "g/../h"));
        assert.strictEqual("http://a/b/c/g;x=1/y",
          flexo.absolute_uri(base, "g;x=1/./y"));
        assert.strictEqual("http://a/b/c/y",
          flexo.absolute_uri(base, "g;x=1/../y"));
        assert.strictEqual("http://a/b/c/g?y/./x",
            flexo.absolute_uri(base, "g?y/./x"));
        assert.strictEqual("http://a/b/c/g?y/../x",
          flexo.absolute_uri(base, "g?y/../x"));
        assert.strictEqual("http://a/b/c/g#s/./x",
            flexo.absolute_uri(base, "g#s/./x"));
        assert.strictEqual("http://a/b/c/g#s/../x",
          flexo.absolute_uri(base, "g#s/../x"));
      });
    });

    describe("flexo.get_args(defaults, argstr)", function () {
      it("parses the given argument string", function () {
        var argstr = "href=../apps/logo.xml&x=1";
        var args = flexo.get_args({}, argstr);
        assert.strictEqual("../apps/logo.xml", args.href);
        assert.strictEqual("1", args.x);
      });
      it("replaces defaults with values from the arg string", function () {
        var argstr = "href=../apps/logo.xml&x=2&y=4";
        var args = flexo.get_args({ x: 1 }, argstr);
        assert.strictEqual("../apps/logo.xml", args.href);
        assert.strictEqual("2", args.x);
        assert.strictEqual("4", args.y);
      });
      if (typeof window === "object") {
        it("uses the location search value by default", function () {
          assert.ok(flexo.get_args());
        });
      }
    });

  });


  if (typeof window === "object") {
    describe("Element creation", function () {

      describe("flexo.create_element(description, [attrs], [contents...])",
        function () {
          it("is called with the target document as `this` for new elements",
            function () {
              var e = document.createElement("p");
              var e_ = flexo.create_element.call(document, "p");
              assert.deepEqual(e, e_);
            });
          it("allows namespace prefixes (e.g., \"svg:g\")", function () {
            // Introduce a custom namespace
            flexo.BENDER_NS = "http://bender.igel.co.jp";
            [
              [document.createElementNS("http://www.w3.org/1999/xhtml", "p"),
              flexo.create_element.call(document, "p")],
              [document.createElementNS("http://www.w3.org/1999/xhtml", "p"),
              flexo.create_element.call(document, "html:p")],
              [document.createElementNS("http://www.w3.org/1999/xhtml", "p"),
              flexo.create_element.call(document, "xhtml:p")],
              [document.createElementNS("http://www.w3.org/2000/svg", "g"),
              flexo.create_element.call(document, "svg:g")],
              [document.createElementNS("http://bender.igel.co.jp", "app"),
              flexo.create_element.call(document, "bender:app")],
            ].forEach(function (pair) {
              assert.deepEqual(pair[0], pair[1]);
            });
          });
          it("allows the inline definition of id and classes with # and .",
            function () {
              var foo = flexo.create_element.call(document, "p#foo");
              assert.strictEqual("foo", foo.id);
              var bar = flexo.create_element.call(document, "p#bar.baz");
              assert.strictEqual("bar", bar.id);
              assert.strictEqual("baz", bar.className);
              var p = flexo.create_element.call(document, "p.a.b.c");
              assert.ok(p.classList.contains("a"));
              assert.ok(p.classList.contains("b"));
              assert.ok(p.classList.contains("c"));
              assert.ok(!p.classList.contains("a.b.c"));
              var g = flexo.create_element.call(document, "svg:g#x.y.z");
              assert.strictEqual("http://www.w3.org/2000/svg", g.namespaceURI);
              assert.strictEqual("g", g.tagName.toLowerCase());
              assert.strictEqual("x", g.id);
              assert.ok(g.classList.contains("y"));
              assert.ok(g.classList.contains("z"));
              // Be careful of ordering id and classes: id must come first
              var wrong = flexo.create_element.call(document, "p.a#b.c")
              assert.notStrictEqual("b", wrong.id);
              assert.ok(wrong.classList.contains("a#b"));
              assert.ok(wrong.classList.contains("c"));
            });
          it("takes an object as a second argument for attribute definitions",
            function () {
              var p = flexo.create_element.call(document, "p", { id: "bar",
                "class": "baz", contenteditable: "" });
              assert.strictEqual("bar", p.id);
              assert.strictEqual("baz", p.className);
              assert.ok(true, !!p.contentEditable);
            });
          it("allows namespace-prefixed attribute names just like tag names",
            function () {
              var use = flexo.create_element.call(document, "svg:use",
                { "xlink:href": "#t" });
              assert.strictEqual("#t",
                use.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
            });
          it("skips undefined, null, and false-valued attributes", function () {
            var p = flexo.create_element.call(document, "p", { x: null,
              y: undefined, z: false });
            assert.strictEqual(null, p.getAttribute("x"));
            assert.strictEqual(null, p.getAttribute("y"));
            assert.strictEqual(null, p.getAttribute("z"));
          });
          it("allows any number of text (string) and element child nodes",
            function () {

            });
        });

      describe("flexo.$(description, [attrs], [contents...])", function () {
        it("is a shortcut bound to window.document", function () {
          var foo = flexo.$("p#bar.baz");
          var bar = flexo.create_element.call(document, "p#bar.baz");
          assert.strictEqual(foo.ownerDocument, bar.ownerDocument);
          assert.strictEqual(foo.tagName, bar.tagName);
          assert.strictEqual(foo.id, bar.id);
          assert.strictEqual(foo.className, bar.className);
        });
      });

    });
  }

}());
