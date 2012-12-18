(function () {
  "use strict";

  var assert = typeof require === "function" && require("chai").assert ||
    window.chai.assert;
  var flexo = typeof require === "function" && require("flexo") || window.flexo;

  describe("Function.prototype.bind", function () {
    it("is defined", function () {
      assert.isFunction(Function.prototype.bind, "bind is a function");
    });
    var that = { x: 1, y: 2 };
    var f = function (a, b) {
      return this.x + this.y + a + b;
    }.bind(that, 3);
    if (Function.prototype.bind.native === false) {
      it("is overridden by flexo", function () {
        assert.strictEqual(f(4), 10, "bound to the right parameters");
      });
    } else {
      it("is native", function () {
        assert.strictEqual(f(4), 10, "bound to the right parameters");
      });
    }
  });

  describe("Objects", function () {

    describe("flexo.instance_of(x, y)", function () {
      var a = {};
      var b = Object.create(a);
      var c = Object.create(b);
      var d = {};
      it("tests whether x is an instance of y (simplest case: y is the prototype of x)", function () {
        assert.strictEqual(Object.getPrototypeOf(b), a,
          "a is the prototype of b (Object.getPrototypeOf)");
        assert.isTrue(flexo.instance_of(b, a),
          "a is the prototype of b (instance_of)");
      });
      it("general case: x and y are further apart in the prototype chain", function () {
        assert.notStrictEqual(Object.getPrototypeOf(c), a,
          "a is not the prototype of c");
        assert.isTrue(flexo.instance_of(c, a),
          "c is an instance of a (instance_of)");
      });
      it("fails when x and y are not in the same prototype chain", function () {
        assert.isFalse(flexo.instance_of(c, d), "c is not an instance of d");
      });
    });

  });

  describe("Strings", function () {

    describe("String.fmt(...)", function () {
      it("replaces occurrences of {0}, {1}, &c. in the string with the corresponding arguments", function () {
        assert.strictEqual("foo = 1", "foo = {0}".fmt(1));
        assert.strictEqual("foo = 1, bar = 2",
          "foo = {0}, bar = {1}".fmt(1, 2));
        assert.strictEqual("bar = 2", "bar = {1}".fmt(1, 2, 3));
        assert.strictEqual("2012年8月30日", "{2}年{1}月{0}日".fmt(30, 8, 2012));
      });
      it("returns an empty string for null and undefined values",
        function () {
          assert.strictEqual("foo = ", "foo = {0}".fmt());
          assert.strictEqual("foo = ", "foo = {0}".fmt(undefined));
          assert.strictEqual("foo = ", "foo = {0}".fmt(null));
        });
    });

    describe("String.format(object)", function () {
      var x = { foo: 1, bar: 2, fum: undefined, baz: null };
      it("replaces occurrences of {<property>} in the string with object.<property>", function () {
        assert.strictEqual("foo = 1, bar = 2",
          "foo = {foo}, bar = {bar}".format(x));
      });
      it("outputs an empty string for null, undefined or missing values",
        function () {
          assert.strictEqual("fum = ", "fum = {fum}".format(x));
          assert.strictEqual("baz = ", "baz = {baz}".format(x));
          assert.strictEqual("quux = ", "quux = {quux}".format(x));
        });
      it("allows escaping of \\, { and } with \\", function () {
        assert.strictEqual("{foo} = 1", "\\{foo} = {foo}".format(x));
        assert.strictEqual("{foo} = \\1", "\\{foo} = \\\\{foo}".format(x));
        assert.strictEqual("...{{{foo} = 1", "...{{{foo\\} = {foo}".format(x));
      });
      it("evaluates the contents of { ... } as a Javascript expression if it does not match a property in args", function () {
        assert.strictEqual("6 * 7 = 42", "6 * 7 = { 6 * 7 }".format());
      });
      it("uses args as this when evaluating an expression", function () {
        assert.strictEqual("6 * 7 = 42", "6 * 7 = { this.multiply(6, 7) }"
          .format({ multiply: function (x, y) { return x * y; } }));
      });
      it("evaluates the innermost expression first, then enclosing expressions", function () {
        assert.strictEqual("6 * 7 = 42", "6 * 7 = { this.multiply({a}, {b}) }"
          .format({ multiply: function (x, y) { return x * y; }, a: 6, b: 7 }));
      });
    });

    describe("flexo.chomp(string)", function () {
      it("chops the last character of a string if and only if it is a newline (\\n)", function () {
        assert.strictEqual(flexo.chomp("Test\n"), "Test");
        assert.strictEqual(flexo.chomp(flexo.chomp("Test\n")), "Test");
      });
    });

    describe("flexo.is_true(string)", function () {
      it("returns true for strings that equal \"true\", regardless of trailing and leading whitespace, and case", function () {
        assert.strictEqual(true, flexo.is_true("true"));
        assert.strictEqual(true, flexo.is_true("TRUE"));
        assert.strictEqual(true, flexo.is_true("True"));
        assert.strictEqual(true, flexo.is_true("    true"));
        assert.strictEqual(true, flexo.is_true("TRUE     "));
        assert.strictEqual(true, flexo.is_true("     tRuE     "));
        assert.strictEqual(false, flexo.is_true("false"));
        assert.strictEqual(false, flexo.is_true("yes"));
        assert.strictEqual(false, flexo.is_true(""));
        assert.strictEqual(false, flexo.is_true(""));
      });
      it("returns false if the argument is not a string", function () {
        assert.strictEqual(false, flexo.is_true());
        assert.strictEqual(false, flexo.is_true(true));
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
        assert.strictEqual(flexo.pad("", 8, "xo"), "xoxoxoxoxoxoxoxo");
      });
    });

    describe("flexo.to_roman(n)", function () {
      it("returns `n` in roman numerals (in lowercase)", function () {
        assert.strictEqual(flexo.to_roman(1), "i");
        assert.strictEqual(flexo.to_roman(2), "ii");
        assert.strictEqual(flexo.to_roman(3), "iii");
        assert.strictEqual(flexo.to_roman(4), "iv");
        assert.strictEqual(flexo.to_roman(5), "v");
        assert.strictEqual(flexo.to_roman(6), "vi");
        assert.strictEqual(flexo.to_roman(7), "vii");
        assert.strictEqual(flexo.to_roman(8), "viii");
        assert.strictEqual(flexo.to_roman(9), "ix");
        assert.strictEqual(flexo.to_roman(10), "x");
        assert.strictEqual(flexo.to_roman(50), "l");
        assert.strictEqual(flexo.to_roman(100), "c");
        assert.strictEqual(flexo.to_roman(500), "d");
        assert.strictEqual(flexo.to_roman(1000), "m");
        assert.strictEqual(flexo.to_roman(1888), "mdccclxxxviii");
        assert.strictEqual(flexo.to_roman(1999), "mcmxcix");
        assert.strictEqual(flexo.to_roman(2012), "mmxii");
        assert.strictEqual(flexo.to_roman(10000), "mmmmmmmmmm");
      });
      it("considers the integer part of `n` only", function () {
        assert.strictEqual(flexo.to_roman(123.45), "cxxiii");
        assert.strictEqual(flexo.to_roman(Math.E), "ii");
        assert.strictEqual(flexo.to_roman(Math.PI), "iii");
      });
      it("returns \"nulla\" for zero", function () {
        assert.strictEqual(flexo.to_roman(0), "nulla");
      });
      it("returns nothing if `n` is not a positive number", function () {
        assert.strictEqual(flexo.to_roman(-1));
        assert.strictEqual(flexo.to_roman(true));
        assert.strictEqual(flexo.to_roman("mmxii"));
        assert.strictEqual(flexo.to_roman());
        assert.strictEqual(flexo.to_roman(null));
        assert.strictEqual(flexo.to_roman({ n: 123 }));
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

    describe("flexo.lerp(from, to, ratio)", function () {
      it("returns the linear interpolation between `from` and `to` for `ratio`", function () {
        assert.strictEqual(flexo.lerp(0, 1, 0), 0);
        assert.strictEqual(flexo.lerp(0, 1, 1), 1);
        assert.strictEqual(flexo.lerp(0, 1, 0.5), 0.5);
        assert.strictEqual(flexo.lerp(0, 1, 2), 2);
        assert.strictEqual(flexo.lerp(10, -10, 0), 10);
        assert.strictEqual(flexo.lerp(10, -10, 0.25), 5);
        assert.strictEqual(flexo.lerp(10, -10, 1), -10);
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

    describe("flexo.find_first(array, p)", function () {
      it("finds the first item x in array such that p(x) is true", function () {
        var a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        assert.strictEqual(flexo.find_first(a, function (x) {
          return x > 3;
        }), 4, "First x > 3");
      });
      it("predicate takes three parameters: the item, the index of the item in array, and the array itself", function () {
        var a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        assert.strictEqual(flexo.find_first(a, function (x, i, a) {
          return x > 4 && (a.length - i) < 4;
        }), 8, "First x > 4 less than 4 items from the end");
      });
    });

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

    describe("flexo.replace_in_array(array, old_item, new_item)", function () {
      it("replaces the first instance of old_item in the array with new_item, and return old_item if it was present");
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

    describe("flexo.normalize_uri(base, ref)", function () {
      var base = "http://a/b/c/d;p?q";
      it("converts scheme and host to lowercase", function () {
        assert.strictEqual("http://a/b/c/d",
          flexo.normalize_uri(base, "HTTP://A/b/c/d"));
      });
      it("converts escape sequences to uppercase", function () {
        assert.strictEqual("http://a/b/c/a%C2%B1b",
          flexo.normalize_uri(base, "a%c2%b1b"));
      });
      it("unescapes letters, digits, hypen, period, underscore, tilde", function () {
        assert.strictEqual("http://a/b/c/~a%C2%B1z09-._",
          flexo.normalize_uri(base, "%7e%61%c2%b1%7a%30%39%2d%2e%5f"));
      });
      it("removes the default port", function () {
        assert.strictEqual("http://a/b/c/d",
          flexo.normalize_uri(base, "HTTP://A:80/b/c/d"));
        assert.strictEqual("http://a:8910/b/c/d",
          flexo.normalize_uri(base, "HTTP://A:8910/b/c/d"));
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
        var args = flexo.get_args({ x: 1, z: 6 }, argstr);
        assert.strictEqual("../apps/logo.xml", args.href);
        assert.strictEqual("2", args.x);
        assert.strictEqual("4", args.y);
        assert.strictEqual(6, args.z);
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

    describe("flexo.request_animation_frame", function () {
      it("binds the prefixed requestAnimationFrame or uses setTimeout as fallback");
      it("also flexo.cancel_animation_frame");
    });
  });


  if (typeof window === "object") {
    describe("DOM", function () {

      describe("flexo.create_element(description, attrs={}, [contents...])",
        function () {
          it("is called with the target document as `this` for new elements",
            function () {
              var e = document.createElementNS("http://www.w3.org/1999/xhtml",
                "p");
              var e_ = flexo.create_element.call(document, "p");
              assert.deepEqual(e, e_);
            });
          it("allows namespace prefixes (e.g., \"svg:g\")", function () {
            // Introduce a custom namespace
            flexo.ns.bender = "http://bender.igel.co.jp";
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
          it("allows namespace-prefixed attribute names just like tag names",
            function () {
              var use = flexo.create_element.call(document, "svg:use",
                { "xlink:href": "#t" });
              assert.strictEqual("#t",
                use.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
            });
          it("takes an object as a second argument for attribute definitions", function () {
            var p = flexo.create_element.call(document, "p", { id: "b.a.r",
              "class": "baz", contenteditable: "" });
            assert.strictEqual("b.a.r", p.id);
            assert.strictEqual("baz", p.className);
            assert.ok(true, !!p.contentEditable);
          });
          it("skips undefined, null, and false-valued attributes", function () {
            var p = flexo.create_element.call(document, "p", { x: null,
              y: undefined, z: false, t: 0 });
            assert.strictEqual(null, p.getAttribute("x"));
            assert.strictEqual(null, p.getAttribute("y"));
            assert.strictEqual(null, p.getAttribute("z"));
            assert.equal(0, p.getAttribute("t"));
          });
          it("allows the use of namespace prefixes for attributes", function () {
            var u = flexo.create_element.call(document, "svg:use",
              { "xlink:href": "#foo" });
            assert.strictEqual(u.href.baseVal, "#foo");
          });
          it("adds the value of `class` to class names given in the description, but does not replace `id` if it was given in the description", function () {
            var p = flexo.create_element.call(document, "p#x.y.z",
              { "class": "t u", id: "v" });
            assert.ok(p.classList.contains("y"));
            assert.ok(p.classList.contains("z"));
            assert.ok(p.classList.contains("t"));
            assert.ok(p.classList.contains("u"));
            assert.strictEqual(p.id, "x");
          });
          it("adds DOM nodes, strings (creating a text node) and arrays of contents, skipping all other types of values", function () {
            var lorem = "Lorem ipsum dolor...";
            var p = flexo.create_element.call(document, "p", lorem);
            assert.strictEqual(p.textContent, lorem);
            assert.strictEqual(p.childNodes.length, 1);
            assert.strictEqual(p.childNodes[0].nodeType, Node.TEXT_NODE);
            assert.strictEqual(p.childNodes[0].textContent, lorem);
            // Using shorthand here for convenience (also tested below)
            var ol = flexo.$ol(flexo.$li("one"), flexo.$li("two"));
            assert.strictEqual(ol.childNodes.length, 2);
            assert.strictEqual(ol.childNodes[0].textContent, "one");
            assert.strictEqual(ol.childNodes[1].textContent, "two");
            var predicate = false;
            var ul2 = flexo.$ul(flexo.$li("definitely"),
              predicate && [flexo.$li("maybe"), flexo.$li("perhaps")],
              flexo.$li("assuredly"));
            assert.strictEqual(ul2.childNodes.length, 2);
            assert.strictEqual(ul2.childNodes[0].textContent, "definitely");
            assert.strictEqual(ul2.childNodes[1].textContent, "assuredly");
            predicate = true;
            var ul4 = flexo.$ul(flexo.$li("definitely"),
              predicate && [flexo.$li("maybe"), flexo.$li("perhaps")],
              flexo.$li("assuredly"));
            assert.strictEqual(ul4.childNodes.length, 4);
            assert.strictEqual(ul4.childNodes[0].textContent, "definitely");
            assert.strictEqual(ul4.childNodes[1].textContent, "maybe");
            assert.strictEqual(ul4.childNodes[2].textContent, "perhaps");
            assert.strictEqual(ul4.childNodes[3].textContent, "assuredly");
          });
        });

      describe("flexo.$(description, attrs={}, [contents])", function () {
        it("is a shorthand bound to window.document", function () {
          var foo = flexo.$("p#bar.baz");
          var bar = flexo.create_element.call(document, "p#bar.baz");
          assert.strictEqual(foo.ownerDocument, bar.ownerDocument);
          assert.strictEqual(foo.tagName, bar.tagName);
          assert.strictEqual(foo.id, bar.id);
          assert.strictEqual(foo.className, bar.className);
        });
      });

      describe("flexo.$<tagname>(attrs={}, [contents])", function () {
        it("is a shorthand for HTML and (most) SVG elements, such as flexo.$div(), flexo.$rect(), &c. ", function () {
          var div = flexo.$div();
          var rect = flexo.$rect();
          assert.strictEqual(div.localName, "div");
          assert.strictEqual(rect.localName, "rect");
          assert.strictEqual(rect.namespaceURI, flexo.ns.svg);
        });
      });

      describe("flexo.$$(contents)", function () {
        it("creates a document fragment in `window.document`, handling contents in the same way as flexo.$()", function () {
          var fragment = flexo.$$("lorem ", [flexo.$strong("ipsum"), " dolor"]);
          assert.strictEqual(fragment.childNodes.length, 3);
          assert.strictEqual(fragment.childNodes[1].textContent, "ipsum");
        });
      });

      describe("flexo.append_child(node, ch)", function() {
        it("appends a child node to a node if ch is a node");
        it("appends a text node to a node if ch is a string");
        it("appends all elements of ch if ch is an array");
        it("ignores any other content");
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

  describe("Color", function () {

    describe("flexo.hsv_to_rgb(h, s, v)", function () {
      it("converts a color in HSV (hue in radian, saturation and value/brightness between 0 and 1) to RGB (array of three integer values in the [0, 256[ interval)", function () {
        assert.deepEqual(flexo.hsv_to_rgb(Math.random(), 0, 1),
          [255, 255, 255]);
        assert.deepEqual(flexo.hsv_to_rgb(Math.random(), 0, 0.5),
          [128, 128, 128]);
        assert.deepEqual(flexo.hsv_to_rgb(Math.random(), Math.random(), 0),
          [0, 0, 0]);
        assert.deepEqual(flexo.hsv_to_rgb(0, 1, 1), [255, 0, 0]);
        assert.deepEqual(flexo.hsv_to_rgb(Math.PI / 3, 1, 0.75), [191, 191, 0]);
        assert.deepEqual(flexo.hsv_to_rgb(2 * Math.PI / 3, 1, 0.5), [0, 128, 0]);
        assert.deepEqual(flexo.hsv_to_rgb(Math.PI, 0.5, 1), [128, 255, 255]);
      });
    });

    describe("flexo.hsv_to_hex(h, s, v)", function () {
      it("converts a color in HSV (hue in radian, saturation and value/brightness between 0 and 1) to hex (#rrggbb)", function () {
        assert.strictEqual(flexo.hsv_to_hex(Math.random(), 0, 1), "#ffffff");
        assert.strictEqual(flexo.hsv_to_hex(Math.random(), 0, 0.5), "#808080");
        assert.strictEqual(flexo.hsv_to_hex(Math.random(), Math.random(), 0),
          "#000000");
        assert.strictEqual(flexo.hsv_to_hex(0, 1, 1), "#ff0000");
        assert.strictEqual(flexo.hsv_to_hex(Math.PI / 3, 1, 0.75), "#bfbf00");
        assert.strictEqual(flexo.hsv_to_hex(2 * Math.PI / 3, 1, 0.5),
          "#008000");
        assert.strictEqual(flexo.hsv_to_hex(Math.PI, 0.5, 1), "#80ffff");
      });
    });

    describe("flexo.rgb_to_hex(r, g, b)", function () {
      it("formats an array of RGB values (clamped to the [0, 256[ interval) to a hex value (#rrggbb)", function () {
        assert.strictEqual(flexo.rgb_to_hex(255, 255, 255), "#ffffff");
        assert.strictEqual(flexo.rgb_to_hex(128, 128, 128), "#808080");
        assert.strictEqual(flexo.rgb_to_hex(0, 0, 0), "#000000");
        assert.strictEqual(flexo.rgb_to_hex(255, 0, 0), "#ff0000");
        assert.strictEqual(flexo.rgb_to_hex(191, 191, 0), "#bfbf00");
        assert.strictEqual(flexo.rgb_to_hex(0, 128, 0), "#008000");
        assert.strictEqual(flexo.rgb_to_hex(128, 255, 255), "#80ffff");
      });
    });

  });

}());
