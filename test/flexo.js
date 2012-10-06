(function () {
  "use strict";

  var assert = typeof require === "function" && require("chai").assert ||
    window.chai.assert;
  var flexo = typeof require === "function" && require("flexo") || window.flexo;

  describe("Strings", function () {

    describe("String.fmt(...)", function () {
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

    describe("String.format(obj)", function () {
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

    describe("flexo.pad(string, length, padding=\"0\")", function () {
      it("pads a string to the given length with `padding`, assuming the padding string is one character long", function () {
        assert.strictEqual(flexo.pad("2", 2), "02");
        assert.strictEqual(flexo.pad("right-aligned", 16, " "),
          "   right-aligned");
      });
      it("converts the first argument to a string (useful for numbers)",
        function () {
          assert.strictEqual(flexo.pad(2, 2), "02");
        });
      it("is useful to create strings with a repeated pattern", function () {
        assert.strictEqual(flexo.pad("", 10, "*"), "**********");
        assert.strictEqual(flexo.pad("", 10, "**"), "********************");
      });
    });

  });

  
  describe("Numbers", function () {

    describe("flexo.clamp(n, min, max)", function () {
      it("clamps the value of n between min and max, assuming min <= max",
        function () {
          assert.strictEqual(flexo.clamp(0, 1, 1), 1);
          assert.strictEqual(flexo.clamp(1, 1, 1), 1);
          assert.strictEqual(flexo.clamp(1, 1, 10), 1);
          assert.strictEqual(flexo.clamp(10, 1, 10), 10);
          assert.strictEqual(flexo.clamp(0, 1, 10), 1);
          assert.strictEqual(flexo.clamp(100, 1, 10), 10);
          assert.strictEqual(flexo.clamp(1, -Infinity, +Infinity), 1);
        });
      it("treats NaN as 0 for the n parameter", function () {
        assert.strictEqual(flexo.clamp("Not a number!", -10, 10), 0);
        assert.strictEqual(flexo.clamp("Not a number!", 1, 10), 1);
      });
    });

    describe("flexo.random_int(min=0, max)", function () {
      it("returns an integer in the [min, max] range, assuming min <= max",
        function () {
          for (var i = 0; i < 100; ++i) {
            var r = flexo.random_int(-10, 10);
            assert.ok(r >= -10 && r <= 10 && Math.round(r) === r);
          }
        });
      it("defaults to 0 for min if only `max` is given", function () {
        for (var i = 0; i < 100; ++i) {
          var r = flexo.random_int(10);
          assert.ok(r >= 0 && r <= 10 && Math.round(r) === r);
        }
      });
    });

    describe("flexo.remap(value, istart, istop, ostart, ostop)", function () {
      it("remaps a value from an input range to an output range", function () {
        assert.strictEqual(flexo.remap(5, 0, 10, 10, 20), 15);
        assert.strictEqual(flexo.remap(5, 0, 10, 0, 20), 10);
        assert.strictEqual(flexo.remap(60, 0, 360, 0, 2 * Math.PI),
          Math.PI / 3);
      });
    });
  });


  describe("Arrays", function () {

    describe("flexo.random_element(array)", function () {
      it("returns a random element from an array", function () {
        var a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        for (var i = 0; i < 100; ++i) {
          var r = flexo.random_element(a);
          assert.ok(a.indexOf(r) >= 0);
        }
      });
    });

    describe("flexo.remove_from_array(array, item)", function () {
      it("removes the first occurrence of the item from the array, if present and returns it",
        function () {
          var a = [1, 2, 3, 4, 2];
          assert.strictEqual(flexo.remove_from_array(a, 1), 1);
          assert.deepEqual(a, [2, 3, 4, 2]);
          assert.strictEqual(flexo.remove_from_array(a, 2), 2);
          assert.deepEqual(a, [3, 4, 2]);
          assert.strictEqual(flexo.remove_from_array(a, 5));
          assert.deepEqual(a, [3, 4, 2]);
          assert.strictEqual(flexo.remove_from_array(null, 5));
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

    describe("flexo.get_args(defaults={}, argstr=window.location.search.substr(1))", function () {
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

    /*
       Test along with Morbo for params
    describe("flexo.ez_xhr(uri, params={}, f)", function () {
      it("makes an XMLHttpRequest to `uri` parametrized by the `params` object and calls `f` on completion", function () {
        
      });
    });
    */

  });


  describe("Custom events", function () {
    var source = {};

    describe("flexo.listen(target, type, listener)", function () {
      it("listens to events of `type` from `target` and executes the listener function", function () {
        var tests = 0;
        flexo.listen(source, "@test-listen", function () {
          ++tests;
        });
        flexo.notify(source, "@test-listen");
        flexo.notify(source, "@test-listen");
        assert.strictEqual(tests, 2);
      });
      it("accepts an object as the listener parameter, whose `handleEvent` method is invoked on notifications", function () {
        var listener = {
          tests: 0,
          handleEvent: function () {
            ++this.tests;
          }
        };
        flexo.listen(source, "@test-handleEvent", listener);
        flexo.notify(source, "@test-handleEvent");
        flexo.notify(source, "@test-handleEvent");
        assert.strictEqual(listener.tests, 2);
      });
    });

    describe("flexo.listen_once(target, type, listener)", function () {
      it("listens to events of `type` from `target` and executes the listener, then immediately stops listening", function () {
        var tests = 0;
        flexo.listen_once(source, "@test-once", function () {
          ++tests;
        });
        flexo.notify(source, "@test-once");
        flexo.notify(source, "@test-once");
        assert.strictEqual(tests, 1);
      });
    });

    describe("flexo.notify(source, type, arguments={})", function () {
      it("sends an event notification of `type` on behalf of `source`", function (done) {
        flexo.listen(source, "@test-notify", function () {
          done();
        });
        flexo.notify(source, "@test-notify");
      });
      it("sends additional arguments through the `arguments` object", function () {
        flexo.listen(source, "@test-args", function (e) {
          assert.strictEqual(e.source, source);
          assert.strictEqual(e.type, "@test-args");
          assert.strictEqual(e.foo, 1);
          assert.strictEqual(e.bar, 2);
        });
        flexo.notify(source, "@test-args", { foo: 1, bar: 2 });
      });
    });

    describe("flexo.notify(e)", function () {
      it("sends an event notification of `e.type` on behalf of `e.source` with additional arguments from `e`", function () {
        flexo.listen(source, "@test-e", function (e) {
          assert.strictEqual(e.source, source);
          assert.strictEqual(e.type, "@test-e");
          assert.strictEqual(e.foo, 1);
          assert.strictEqual(e.bar, 2);
        });
        flexo.notify({ source: source, type: "@test-e", foo: 1, bar: 2 });
      });
    });

    describe("flexo.unlisten(target, type, listener)", function () {
      it("removes `listener` for events of `type` from `target`", function () {
        var tests = 0;
        var h = function () {
          ++tests;
        };
        flexo.listen(source, "@test-unlisten", h);
        flexo.notify(source, "@test-unlisten");
        flexo.unlisten(source, "@test-unlisten", h);
        flexo.notify(source, "@test-unlisten");
        assert.strictEqual(tests, 1);

        flexo.listen(source, "@test-unlisten2", h);
        flexo.listen(source, "@test-unlisten2", function () {
          ++tests;
        });
        flexo.notify(source, "@test-unlisten2");
        flexo.unlisten(source, "@test-unlisten2", h);
        flexo.notify(source, "@test-unlisten2");
        assert.strictEqual(tests, 4);
      });
    });
  });

  describe("Functions and Asynchronicity", function () {

    describe("flexo.id", function () {
      it("returns its first argument unchanged", function () {
        assert.strictEqual(flexo.id(1), 1);
        assert.strictEqual(flexo.id("test"), "test");
      });
    });

    describe("flexo.seq", function () {
      it("executes asynchronous commands in sequence", function (done) {
        var seq = flexo.seq();
        var timeout = function (k) {
          setTimeout(k, 10);
        };
        flexo.listen(seq, "@done", function () {
          done();
        });
        for (var i = 0; i < 10; ++i) {
          seq.add(timeout);
        }
      });
    });
  });


  if (typeof window === "object") {
    describe("DOM", function () {

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
              var q = flexo.create_element.call(document, "html:p#x.y.z");
              assert.strictEqual("http://www.w3.org/1999/xhtml", q.namespaceURI);
              assert.strictEqual("p", q.tagName.toLowerCase());
              assert.strictEqual("x", q.id);
              // An earlier version of this test used an svg element but SVG and
              // classList don't play well together (this failed in Chrome)
              assert.ok(q.classList.contains("y"));
              assert.ok(q.classList.contains("z"));
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

      describe("flexo.event_client_pos(e)", function () {
        it("returns an { x: e.clientX, y: e.clientY } object for a mouse event", function (done) {
          var div = document.createElement("div");
          div.addEventListener("mousedown", function (e) {
            var p = flexo.event_client_pos(e);
            assert.equal(p.x, 10);
            assert.equal(p.y, 20);
            done();
          }, false);
          var e = document.createEvent("MouseEvent");
          e.initMouseEvent("mousedown", true, true, window, 0, 0, 0, 10, 20,
            false, false, false, false, 0, null);
          div.dispatchEvent(e);
        });

        // TODO: Test touch event
      });

      describe("flexo.remove_children(node)", function () {
        it("removes all child nodes of `node`", function () {
          var p = flexo.$p(
            "This is a paragraph ",
            flexo.$("strong", "with mixed content"),
            " which will be removed.");
          assert.strictEqual(p.childNodes.length, 3);
          assert.strictEqual(p.textContent,
            "This is a paragraph with mixed content which will be removed.");
          flexo.remove_children(p);
          assert.strictEqual(p.childNodes.length, 0);
        });
      });

      var p = flexo.$p();

      describe("flexo.root(node)", function () {
        it("finds the furthest ancestor of `node` in the DOM tree, returning `node` if it has no parent", function () {
          assert.strictEqual(flexo.root(p), p);
          var span = p.appendChild(flexo.$span());
          assert.strictEqual(flexo.root(span), p);
        });
        it("returns `document` if the node is in the main document", function () {
          document.body.appendChild(p);
          assert.strictEqual(flexo.root(p), document);
        });
        it("is safe to use with null or undefined values", function () {
          assert.strictEqual(flexo.root());
          assert.strictEqual(flexo.root(null), null);
        });
      });

      describe("flexo.safe_remove(node)", function () {
        it("removes a node from its parent", function () {
          flexo.safe_remove(p);
          assert.equal(flexo.parentNode, null);
        });
        it("is safe to use when the node is null or undefined, or has no parent", function () {
          flexo.safe_remove();
          flexo.safe_remove(null);
          flexo.safe_remove(p);
          assert.equal(flexo.parentNode, null);
        });
      });

      describe("flexo.set_class_iff(element, class, p)", function () {
        it("sets `class` on `element` if `p` is true, and removes it otherwise", function () {
          var div = flexo.$("div.test");
          assert.ok(div.classList.contains("test"));
          flexo.set_class_iff(div, "addl", true);
          assert.ok(div.classList.contains("addl"));
          flexo.set_class_iff(div, "test", false);
          assert.ok(!div.classList.contains("test"));
        });
      });

    });
  }

}());
