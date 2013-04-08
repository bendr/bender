(function (flexo) {
  "use strict";

  var foreach = Array.prototype.forEach;
  var map = Array.prototype.map;
  var slice = Array.prototype.slice;
  var splice = Array.prototype.splice;

  var browser = typeof window === "object";

  if (typeof Function.prototype.bind !== "function") {
    Function.prototype.bind = function (x) {
      var f = this;
      var args = slice.call(arguments, 1);
      return function () {
        return f.apply(x, args.concat(slice.call(arguments)));
      };
    };
    Function.prototype.bind.native = false;
  }


  // Objects

  // Test whether x is an instance of y (i.e. y is the prototype of x, or the
  // prototype of its prototype, or...)
  flexo.instance_of = function (x, y) {
    var proto = typeof x === "object" && Object.getPrototypeOf(x);
    return !!proto && (proto === y || flexo.instance_of(proto, y));
  };

  // Define a property named `name` on object `obj` and make it read-only (i.e.
  // it only has a get.)
  flexo.make_readonly = function (obj, name, get) {
    Object.defineProperty(obj, name, { enumerable: true,
      get: typeof get === "function" ? get : function () { return get; }
    });
  };

  // Define a property named `name` on object `obj` with the custom setter `set`
  // The setter gets three parameters (<new value>, <current value>, <cancel>)
  // and returns the new value to be set. If cancel is called with no value or a
  // true value, there is no update.
  flexo.make_property = function (obj, name, set) {
    var value;
    Object.defineProperty(obj, name, { enumerable: true,
      get: function () { return value; },
      set: function (v) {
        try {
          value = set.call(this, v, value, flexo.cancel);
        } catch (e) {
          if (e !== "cancel") {
            throw e;
          }
        }
      }
    });
  };


  // Strings

  // Simple format function for messages and templates. Use %0, %1... as slots
  // for parameters. %% is also replaced by %. Null and undefined are replaced
  // by an empty string.
  String.prototype.fmt = function () {
    var args = arguments;
    return this.replace(/%(\d+|%)/g, function (_, p) {
      return p === "%" ? "%" : args[p] == null ? "" : args[p];
    });
  };

  // Chop the last character of a string iff it's a newline
  flexo.chomp = function(string) {
    return string.replace(/\n$/, "");
  };

  // Get a true or false value from a string; true if the string matches "true"
  // in case-insensitive, whitespace-tolerating way
  flexo.is_true = function (string) {
    return typeof string === "string" && string.trim().toLowerCase() === "true";
  };

  // Pad a string to the given length with the given padding (defaults to 0)
  // if it is shorter. The padding is added at the beginning of the string.
  flexo.pad = function(string, length, padding) {
    if (typeof padding !== "string") {
      padding = "0";
    }
    if (typeof string !== "string") {
      string = string.toString();
    }
    var l = length + 1 - string.length;
    return l > 0 ? (Array(l).join(padding)) + string : string;
  };

  // Convert a number to roman numerals (integer part only; n must be positive
  // or zero.) Now that's an important function to have in any framework.
  flexo.to_roman = function(n) {
    var unit = function (n, i, v, x) {
      var r = "";
      if (n % 5 === 4) {
        r += i;
        ++n;
      }
      if (n === 10) {
        r += x;
      } else {
        if (n >= 5) {
          r += v;
        }
        for (var j = 0; j < n % 5; ++j) {
          r += i;
        }
      }
      return r;
    }
    if (typeof n === "number" && n >= 0) {
      n = Math.floor(n);
      if (n === 0) {
        return "nulla";
      }
      var r = "";
      for (var i = 0; i < Math.floor(n / 1000); ++i) r += "m";
      return r +
        unit(Math.floor(n / 100) % 10, "c", "d", "m") +
        unit(Math.floor(n / 10) % 10, "x", "l", "c") +
        unit(n % 10, "i", "v", "x");
    }
  };

  // Convert a string with dash to camel case: remove dashes and capitalize the
  // following letter (e.g., convert foo-bar to fooBar)
  flexo.undash = function (s) {
    return s.replace(/-+(.?)/g, function (_, p) {
      return p.toUpperCase();
    });
  };


  // Numbers

  // Return the value constrained between min and max. A NaN value is converted
  // to 0 before being clamped. min and max are assumed to be numbers such that
  // min <= max.
  flexo.clamp = function (value, min, max) {
    return Math.max(Math.min(isNaN(value) ? 0 : value, max), min);
  };

  // Linear interpolation
  flexo.lerp = function(from, to, ratio) {
    return from + (to - from) * ratio;
  };

  // Remap a value from a given range to another range (from Processing)
  flexo.remap = function (value, istart, istop, ostart, ostop) {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
  };

  // Return a random integer in the [min, max] range, assuming min <= max.
  // The min parameter may be omitted and defaults to zero.
  flexo.random_int = function (min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max + 1 - min));
  };


  // Arrays

  // Return a new array without the given item
  flexo.array_without = function (array, item) {
    var a = array.slice();
    flexo.remove_from_array(a, item);
    return a;
  };

  flexo.extract_from_array = function (array, p, that) {
    var extracted = [];
    var original = slice.call(array);
    for (var i = array.length - 1; i >= 0; --i) {
      if (p.call(that, array[i], i, original)) {
        extracted.unshift(array[i]);
        splice.call(array, i, 1);
      }
    }
    return extracted;
  };

  // Drop elements of an array while the predicate is true
  flexo.drop_while = function (a, p, that) {
    for (var i = 0, n = a.length; i < n && p.call(that, a[i], i, a); ++i);
    return slice.call(a, i);
  };

  // Find the first item x in a such that p(x) is true
  flexo.find_first = function (a, p, that) {
    if (!Array.isArray(a)) {
      return;
    }
    for (var i = 0, n = a.length; i < n && !p.call(that, a[i], i, a); ++i);
    return a[i];
  };

  // Partition `a` according to predicate `p` and return and array of two arrays
  // (first one is the array of elements for which p is true.)
  flexo.partition = function (a, p, that) {
    var ins = [];
    var outs = [];
    for (var i = 0, n = a.length; i < n; ++i) {
      (p.call(that, a[i], i, a) ? ins : outs).push(a[i]);
    }
    return [ins, outs];
  };

  // Return a random element from an array
  flexo.random_element = function (a) {
    return a[flexo.random_int(a.length - 1)];
  };

  // Remove an item from an array
  flexo.remove_from_array = function (array, item) {
    if (array && item != null) {
      var index = array.indexOf(item);
      if (index >= 0) {
        return array.splice(index, 1)[0];
      }
    }
  };

  // Replace the first instance of old_item in array with new_item, and return
  // old_item on success
  flexo.replace_in_array = function (array, old_item, new_item) {
    if (array && old_item != null) {
      var index = array.indexOf(old_item);
      if (index >= 0) {
        array[index] = new_item;
        return old_item;
      }
    }
  };

  // Shuffle the array into a new array (the original array is not changed and
  // the new, shuffled array is returned.)
  flexo.shuffle_array = function (array) {
    var shuffled = slice.call(array);
    for (var i = shuffled.length - 1; i > 0; --i) {
      var j = flexo.random_int(i);
      var x = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = x;
    }
    return shuffled;
  };

  // Return all the values of an object (presumably used as a dictionary)
  flexo.values = function (object) {
    return Object.keys(object).map(function (key) {
      return object[key];
    });
  };


  // URIs: parsing and resolving relative URIs (e.g. to load resources)

  // Split an URI into an object with the five parts scheme, authority, path,
  // query, and fragment (without the extra punctuation; i.e. query does not
  // have a leading "?") Fields not in the URI are undefined.
  flexo.split_uri = function (uri) {
    var m = uri.match(/^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/);
    if (m) {
      var u = {};
      ["scheme", "authority", "path", "query", "fragment"]
        .forEach(function (k, i) {
          u[k] = m[i + 1];
        });
      return u;
    }
  };

  // Rebuild an URI string from an object as split by flexo.split_uri
  flexo.unsplit_uri = function (r) {
    return (r.scheme ? r.scheme + ":" : "") +
      (r.authority ? "//" + r.authority : "") +
      r.path +
      (r.query ? "?" + r.query : "") +
      (r.fragment ? "#" + r.fragment : "");
  };

  // Utility function for absolute_uri
  function remove_dot_segments(path) {
    var input = path;
    var output = "";
    while (input) {
      var m = input.match(/^\.\.?\//);
      if (m) {
        input = input.substr(m[0].length);
      } else {
        m = input.match(/^\/\.(?:\/|$)/);
        if (m) {
          input = "/" + input.substr(m[0].length);
        } else {
          m = input.match(/^\/\.\.(:?\/|$)/);
          if (m) {
            input = "/" + input.substr(m[0].length);
            output = output.replace(/\/?[^\/]*$/, "");
          } else if (input === "." || input === "..") {
            input = "";
          } else {
            m = input.match(/^\/?[^\/]*/);
            input = input.substr(m[0].length);
            output += m[0];
          }
        }
      }
    }
    return output;
  }

  // Return an absolute URI for the reference URI for a given base URI
  flexo.absolute_uri = function (base, ref) {
    var r = flexo.split_uri(ref);
    if (r.scheme) {
      r.path = remove_dot_segments(r.path);
    } else {
      var b = flexo.split_uri(base);
      r.scheme = b.scheme;
      if (r.authority) {
        r.path = remove_dot_segments(r.path);
      } else {
        r.authority = b.authority;
        if (!r.path) {
          r.path = b.path;
          if (!r.query) {
            r.query = b.query;
          }
        } else {
          if (r.path.substr(0, 1) === "/") {
            r.path = remove_dot_segments(r.path);
          } else {
            r.path = b.authority && !b.path ? "/" + r.path :
                remove_dot_segments(b.path.replace(/\/[^\/]*$/, "/") + r.path);
          }
        }
      }
    }
    return flexo.unsplit_uri(r);
  };

  // Return an absolute, normalized URI:
  //   * scheme and host are converted to lowercase
  //   * escape sequences are converted to uppercase
  //   * escaped letters, digits, hyphen, period and underscore are unescaped
  //   * remove port 80 from authority
  flexo.normalize_uri = function (base, ref) {
    var uri = flexo.split_uri(flexo.absolute_uri(base, ref)
      .replace(/%([0-9a-f][0-9a-f])/gi, function (m, n) {
        n = parseInt(n, 16);
        return (n >= 0x41 && n <= 0x5a) || (n >= 0x61 && n <= 0x7a) ||
          (n >= 0x30 && n <= 0x39) || n === 0x2d || n === 0x2e ||
          n === 0x5f || n === 0x7e ? String.fromCharCode(n) : m.toUpperCase();
      }));
    if (uri.scheme) {
      uri.scheme = uri.scheme.toLowerCase();
    }
    if (uri.authority) {
      uri.authority = uri.authority.replace(/:80$/, "").toLowerCase();
    }
    return flexo.unsplit_uri(uri);
  };

  // Make an XMLHttpRequest with optional params and a callback when done
  flexo.ez_xhr = function (uri, params, f) {
    var req = new XMLHttpRequest();
    if (f === undefined) {
      f = params;
      params = {};
    }
    req.open(params.method || "GET", uri);
    if (params.hasOwnProperty("responseType")) {
      req.responseType = params.responseType;
    }
    if (params.hasOwnProperty("headers")) {
      for (var h in params.headers) {
        req.setRequestHeader(h, params.headers[h]);
      }
    }
    req.onload = req.onerror = function () { f(req); };
    req.send(params.data || "");
  };

  // Get args from an URI
  flexo.get_args = function (defaults, argstr) {
    var sep, args = defaults || {};
    if (!argstr) {
      argstr = typeof window === "object" &&
        typeof window.location === "object" &&
        typeof window.location.search === "string" ?
            window.location.search.substring(1) : "";
    }
    argstr.split("&").forEach(function (q) {
      if (!q) {
        return;
      }
      sep = q.indexOf("=");
      args[q.substr(0, sep)] = decodeURIComponent(q.substr(sep + 1));
    });
    return args;
  };


  // Custom events

  function call_listener(listener, e) {
    if (typeof listener.handleEvent === "function") {
      listener.handleEvent.call(listener, e);
    } else {
      listener(e);
    }
  }

  // Listen to a custom event. Listener is a function or an object whose
  // "handleEvent" function will then be invoked. The listener is returned.
  flexo.listen = function (target, type, listener) {
    if (!(target.hasOwnProperty(type))) {
      target[type] = [];
    }
    target[type].push(listener);
    return listener;
  };

  // Listen to an event only once. The listener is returned.
  flexo.listen_once = function (target, type, listener) {
    var h = function (e) {
      flexo.unlisten(target, type, h);
      call_listener(listener, e);
    };
    return flexo.listen(target, type, h);
  };

  // Can be called as notify(e), notify(source, type) or notify(source, type, e)
  flexo.notify = function (source, type, e) {
    if (e) {
      e.source = source;
      e.type = type;
    } else if (type) {
      e = { source: source, type: type };
    } else {
      e = source;
    }
    if (e.source.hasOwnProperty(e.type)) {
      e.source[e.type].slice().forEach(function (listener) {
        call_listener(listener, e);
      });
    }
  };

  // Stop listening and return the removed listener. If the listener was not set
  // in the first place, do and return nothing.
  flexo.unlisten = function (target, type, listener) {
    return flexo.remove_from_array(target[type], listener);
  };


  // Functions and Asynchronicity

  // This function gets passed to input and output value functions so that the
  // input or output can be cancelled. If called with no parameter or a single
  // parameter evaluating to a truthy value, throw a cancel exception;
  // otherwise, return false.
  flexo.cancel = function (p) {
    if (arguments.length === 0 || !!p) {
      throw "cancel";
    }
    return false;
  };

  // No-op function, returns nothing
  flexo.nop = function () {
  };

  // Identity function
  flexo.id = function (x) {
    return x;
  };


  // Seq object for chaining asynchronous calls
  flexo.Seq = {};

  flexo.Seq.add = function (f) {
    if (typeof f === "function") {
      this.queue.push(f);
      if (!this.flushing) {
        this.flushing = true;
        setTimeout(this.flush.bind(this), 0);
      }
    }
  };

  flexo.Seq.flush = function () {
    var f = this.queue.shift();
    if (f) {
      f(this.flush.bind(this));
    } else {
      delete this.flushing;
    }
  };

  flexo.seq = function () {
    var seq = Object.create(flexo.Seq);
    seq.queue = [];
    return seq;
  };


  if (browser) {
    flexo.request_animation_frame = (window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame || function (f) {
        return window.setTimeout(function () {
          f(Date.now());
        }, 16);
      }).bind(window);
    flexo.cancel_animation_frame = (window.cancelAnimationFrame ||
      window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame ||
      window.msCancelAnimationFrame || window.clearTimeout).bind(window);
  }


  // DOM

  // Make a (text) HTML tag; the first argument is the tag name. Following
  // arguments are the contents (as text; must be properly escaped.) If the last
  // argument is a boolean, it is treated as a flag to *not* close the element
  // when true (i.e. for elements that are incomplete or HTML elements that do
  // not need to be closed)
  // TODO handle encoding (at least of attribute values)
  flexo.html_tag = function (tag) {
    var out = "<" + tag;
    var contents = slice.call(arguments, 1);
    if (typeof contents[0] === "object" && !Array.isArray(contents[0])) {
      var attrs = contents.shift();
      for (var a in attrs) {
        if (attrs.hasOwnProperty(a)) {
          var v = attrs[a];
          // true and false/null/undefined act as special values: when true,
          // just output the attribute name (without any value); when false,
          // null or undefined, skip the attribute altogether
          if (v != null && v !== false) {
            out += (v === true ? " %0" : " %0=\"%1\"").fmt(a, v);
          }
        }
      }
    }
    out += ">";
    var keep_open = typeof contents[contents.length - 1] === "boolean" ?
        contents.pop() : false;
    out += contents.join("");
    if (!keep_open) {
      out += "</%0>".fmt(tag);
    }
    return out;
  };

  // Known XML namespaces and their prefixes for use with create_element below.
  // For convenience both "html" and "xhtml" are defined as prefixes for XHTML.
  flexo.ns = {
    html: "http://www.w3.org/1999/xhtml",
    m: "http://www.w3.org/1998/Math/MathML",
    svg: "http://www.w3.org/2000/svg",
    xhtml: "http://www.w3.org/1999/xhtml",
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/1999/xml",
    xmlns: "http://www.w3.org/2000/xmlns/"
  };

  // Append a child node `ch` to `node`. If it is a string, create a text
  // node with the string as content; if it is an array, append all elements of
  // the array; if it is not a Node, then simply ignore it.
  flexo.append_child = function (node, ch) {
    if (typeof ch === "string") {
      node.appendChild(node.ownerDocument.createTextNode(ch));
    } else if (ch instanceof Array) {
      ch.forEach(function (ch_) {
        flexo.append_child(node, ch_);
      });
    } else if (ch instanceof window.Node) {
      node.appendChild(ch);
    }
  };

  // Simple way to create elements. The first argument is a string with the name
  // of the element (e.g., "rect"), and may also contain a namespace prefix as
  // defined in flexo.ns (e.g., "html:p"; the default is the namespace URI of
  // the document), class names, using "." as a separator similarly to CSS
  // (e.g., "html:p.important.description") and an id preceded by # (e.g.,
  // "html:p.important.description#rule; not that this id may not contain a .)
  // The second argument is optional and is an object defining attributes of the
  // element; its properties are names of attributes, and the values are the
  // values for the attribute. Note that a false, null or undefined value will
  // *not* set the attribute. Attributes may have namespace prefixes so that we
  // can use "xlink:href" for instance (e.g., flexo.create_element("svg:use",
  // { "xlink:href": "#foo" });) Beware of calling this function with `this` set
  // to the target document.
  flexo.create_element = function (name, attrs) {
    var contents;
    if (typeof attrs === "object" && !(attrs instanceof Node) &&
        !Array.isArray(attrs)) {
      contents = slice.call(arguments, 2);
    } else {
      contents = slice.call(arguments, 1);
      attrs = {};
    }
    var classes = name.trim().split(".").map(function (x) {
      var m = x.match(/#(.*)$/);
      if (m) {
        attrs.id = m[1];
        return x.substr(0, m.index);
      }
      return x;
    });
    name = classes.shift();
    if (classes.length > 0) {
      attrs["class"] =
        (typeof attrs["class"] === "string" ? attrs["class"] + " " : "")
        + classes.join(" ");
    }
    var m = name.match(/^(?:([^:]+):)?/);
    var ns = (m[1] && flexo.ns[m[1].toLowerCase()]) ||
      this.documentElement.namespaceURI;
    var elem = this.createElementNS(ns, m[1] ? name.substr(m[0].length) : name);
    for (var a in attrs) {
      if (attrs[a] != null && attrs[a] !== false) {
        var sp = a.split(":");
        ns = sp[1] && flexo.ns[sp[0].toLowerCase()];
        if (ns) {
          elem.setAttributeNS(ns, sp[1], attrs[a]);
        } else {
          elem.setAttribute(a, attrs[a]);
        }
      }
    }
    contents.forEach(function (ch) {
      flexo.append_child(elem, ch);
    });
    return elem;
  };

  flexo.tags = {
    html: ["a", "abbr", "address", "area", "article", "aside", "audio", "b",
      "base", "bdi", "bdo", "blockquote", "body", "br", "button", "canvas",
      "caption", "cite", "code", "col", "colgroup", "command", "datalist", "dd",
      "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed",
      "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
      "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe",
      "img", "input", "ins", "kbd", "keygen", "label", "legend", "li", "link",
      "map", "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol",
      "optgroup", "option", "output", "p", "param", "pre", "progress", "q",
      "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small",
      "source", "span", "strong", "style", "sub", "summary", "sup", "table",
      "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
      "tref", "track", "u", "ul", "var", "video", "wbr"],
    svg: ["altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor",
      "animateMotion", "animateTransform", "circle", "clipPath",
      "color-profile", "cursor", "defs", "desc", "ellipse", "feBlend",
      "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
      "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood",
      "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage",
      "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
      "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter",
      "font", "font-face", "font-face-format", "font-face-name",
      "font-face-src", "font-face-uri", "foreignObject", "g", "glyph",
      "glyphRef", "hkern", "image", "line", "linearGradient", "marker", "mask",
      "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon",
      "polyline", "radialGradient", "rect", "set", "stop", "svg", "switch",
      "symbol", "text", "textPath", "tref", "tspan", "use", "view", "vkern"],
    m: ["abs", "and", "annotation", "annotation-xml", "apply", "approx",
      "arccos", "arccosh", "arccot", "arccoth", "arccsc", "arccsch", "arcsec",
      "arcsech", "arcsin", "arcsinh", "arctan", "arctanh", "arg", "bind",
      "bvar", "card", "cartesianproduct", "cbytes", "ceiling", "cerror", "ci",
      "cn", "codomain", "complexes", "compose", "condition", "conjugate", "cos",
      "cosh", "cot", "coth", "cs", "csc", "csch", "csymbol", "curl", "declare",
      "degree", "determinant", "diff", "divergence", "divide", "domain",
      "domainofapplication", "el", "emptyset", "eq", "equivalent", "eulergamma",
      "exists", "exp", "exponentiale", "factorial", "factorof", "false",
      "floor", "fn", "forall", "gcd", "geq", "grad", "gt", "ident", "imaginary",
      "imaginaryi", "implies", "in", "infinity", "int", "integers", "intersect",
      "interval", "inverse", "lambda", "laplacian", "lcm", "leq", "limit",
      "list", "ln", "log", "logbase", "lowlimi", "lt", "maction", "malign",
      "maligngroup", "malignmark", "malignscope", "math", "matrix", "matrixrow",
      "max", "mean", "median", "menclose", "merror", "mfenced", "mfrac",
      "mfraction", "mglyph", "mi", "minus", "mlabeledtr", "mlongdiv",
      "mmultiscripts", "mn", "mo", "mode", "moment", "momentabout", "mover",
      "mpadded", "mphantom", "mprescripts", "mroot", "mrow", "ms", "mscarries",
      "mscarry", "msgroup", "msline", "mspace", "msqrt", "msrow", "mstack",
      "mstyle", "msub", "msubsup", "msup", "mtable", "mtd", "mtext", "mtr",
      "munder", "munderover", "naturalnumbers", "neq", "none", "not",
      "notanumber", "note", "notin", "notprsubset", "notsubset", "or",
      "otherwise", "outerproduct", "partialdiff", "pi", "piece", "piecewise",
      "plus", "power", "primes", "product", "prsubset", "quotient", "rationals",
      "real", "reals", "reln", "rem", "root", "scalarproduct", "sdev", "sec",
      "sech", "selector", "semantics", "sep", "setdiff", "share", "sin",
      "subset", "sum", "tan", "tanh", "tendsto", "times", "transpose", "true",
      "union", "uplimit", "variance", "vector", "vectorproduct", "xor"]
  };

  if (browser) {

    // Shorthand to create elements, e.g. flexo.$("svg#main.content")
    flexo.$ = function () {
      return flexo.create_element.apply(window.document, arguments);
    };

    // Shorthand to create a document fragment
    flexo.$$ = function () {
      var fragment = window.document.createDocumentFragment();
      foreach.call(arguments, function (ch) {
        flexo.append_child(fragment, ch);
      });
      return fragment;
    };

    // Make shorthands for known HTML, SVG and MathML elements, e.g. flexo.$p,
    // flexo.$fontFaceFormat (for svg:font-face-format), &c.
    for (var ns in flexo.tags) {
      flexo.tags[ns].forEach(function (tag) {
        flexo["$" + flexo.undash(tag)] = flexo.create_element
          .bind(window.document, "%0:%1".fmt(ns, tag));
      });
    }
  } else {
    for (var ns in flexo.tags) {
      flexo.tags[ns].forEach(function (tag) {
        flexo["$" + flexo.undash(tag)] = flexo.html_tag.bind(this, tag);
      });
    }
  }

  // Get clientX/clientY as an object { x: ..., y: ... } for events that may
  // be either a mouse event or a touch event, in which case the position of
  // the first touch is returned.
  flexo.event_client_pos = function (e) {
    return { x: e.targetTouches ? e.targetTouches[0].clientX : e.clientX,
      y: e.targetTouches ? e.targetTouches[0].clientY : e.clientY };
  };

  // Get the offset position of the mouse event e relative to the element `elem`
  // (defaults to e.target)
  flexo.event_offset_pos = function (e, elem) {
    var p = flexo.event_client_pos(e);
    var bbox = (elem || e.target).getBoundingClientRect();
    p.x -= bbox.left;
    p.y -= bbox.top;
    return p;
  };

  // Remove all children of an element
  flexo.remove_children = function (elem) {
    while (elem.firstChild) {
      elem.removeChild(elem.firstChild);
    }
  };

  // Root of a node: the furthest node up the tree.
  flexo.root = function (node) {
    return node && node.parentNode ? flexo.root(node.parentNode) : node;
  };

  // Safe removal of a node; do nothing if the node did not exist or had no
  // parent.
  flexo.safe_remove = function (node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  };

  // Add or remove the class c on elem according to the value of predicate p
  // (add if true, remove if false)
  flexo.set_class_iff = function (elem, c, p) {
    if (p) {
      elem.classList.add(c);
    } else {
      elem.classList.remove(c);
    }
  };


  // Graphics

  // Color

  // Convert a color from hsv space (hue in radians, saturation and brightness
  // in the [0, 1] interval) to RGB, returned as an array of RGB values in the
  // [0, 256[ interval.
  flexo.hsv_to_rgb = function(h, s, v) {
    s = flexo.clamp(s, 0, 1);
    v = flexo.clamp(v, 0, 1);
    if (s === 0) {
      var v_ = Math.round(v * 255);
      return [v_, v_, v_];
    } else {
      h = (((h * 180 / Math.PI) + 360) % 360) / 60;
      var i = Math.floor(h);
      var f = h - i;
      var p = v * (1 - s);
      var q = v * (1 - (s * f));
      var t = v * (1 - (s * (1 - f)));
      return [Math.round([v, q, p, p, t, v][i] * 255),
        Math.round([t, v, v, q, p, p][i] * 255),
        Math.round([p, p, t, v, v, q][i] * 255)];
    }
  };

  // Convert a color from hsv space (hue in degrees, saturation and brightness
  // in the [0, 1] interval) to an RGB hex value
  flexo.hsv_to_hex = function(h, s, v) {
    return flexo.rgb_to_hex.apply(this, flexo.hsv_to_rgb(h, s, v));
  };

  // Convert an RGB color (3 values in the [0, 256[ interval) to a hex value
  flexo.rgb_to_hex = function() {
    return "#" + map.call(arguments,
      function (x) {
        return flexo.pad(flexo.clamp(Math.floor(x), 0, 255).toString(16), 2);
      }).join("");
  };

  // Convert a number to a color hex string. Use only the lower 24 bits.
  flexo.num_to_hex = function (n) {
    return "#" +  flexo.pad((n & 0xffffff).toString(16), 6);
  };


  // SVG

  // Get an SVG point for the event in the context of an SVG element (or the
  // closest svg element by default)
  flexo.event_svg_point = function(e, svg) {
    if (!svg) {
      svg = flexo.find_svg(e.target);
    }
    if (!svg) {
      return;
    }
    var p = svg.createSVGPoint();
    p.x = e.targetTouches ? e.targetTouches[0].clientX : e.clientX;
    p.y = e.targetTouches ? e.targetTouches[0].clientY : e.clientY;
    try {
      return p.matrixTransform(svg.getScreenCTM().inverse());
    } catch(e) {}
  };

  // Find the closest <svg> ancestor for a given element
  flexo.find_svg = function(elem) {
    if (!elem) {
      return;
    }
    if (elem.correspondingElement) {
      elem = elem.correspondingElement;
    }
    return elem.namespaceURI === flexo.ns.svg &&
      elem.localName === "svg" ? elem : flexo.find_svg(elem.parentNode);
  };

  flexo.deg2rad = function (degrees) {
    return degrees * Math.PI / 180;
  };

  // Make a list of points for a regular polygon with `sides` sides (should be
  // at least 3) inscribed in a circle of radius `r`. The first point is at
  // angle `phase`, which defaults to 0. The center of the circle may be set
  // with `x` and `y` (both default to 0.)
  flexo.poly_points = function (sides, r, phase, x, y) {
    phase = phase || 0;
    x = x || 0;
    y = y || 0;
    var points = [];
    for (var i = 0, ph = 2 * Math.PI / sides; i < sides; ++i) {
      points.push(x + r * Math.cos(phase + ph * i));
      points.push(y - r * Math.sin(phase + ph * i));
    }
    return points.join(" ");
  };

  // Create a regular polygon with the `sides` sides (should be at least 3),
  // inscribed in a circle of radius `r`, with an optional starting phase
  // (in degrees)
  flexo.$poly = function (attrs) {
    var sides = parseFloat(attrs.sides) || 0;
    var r = parseFloat(attrs.r) || 0;
    var phase = flexo.deg2rad(parseFloat(attrs.phase || 0));
    var x = parseFloat(attrs.x) || 0;
    var y = parseFloat(attrs.y) || 0;
    delete attrs.sides;
    delete attrs.r;
    delete attrs.phase;
    delete attrs.x;
    delete attrs.y;
    attrs.points = flexo.poly_points(sides, r, phase, x, y);
    return flexo.$polygon.apply(this, arguments);
  };

  // Create a star with `branches` branches inscribed in a circle of radius `r`,
  // with an optional starting phase (in degrees)
  flexo.$star = function (attrs) {
    var branches = parseFloat(attrs.branches) || 0;
    var r = parseFloat(attrs.r) || 0;
    var phase = parseFloat(attrs.phase || 0);
    var x = parseFloat(attrs.x) || 0;
    var y = parseFloat(attrs.y) || 0;
    delete attrs.branches;
    delete attrs.r;
    delete attrs.phase;
    delete attrs.x;
    delete attrs.y;
    var points = [];
    if (branches % 2 === 0) {
      var sides = branches / 2;
      return flexo.$g(attrs,
          flexo.$poly({ sides: sides, x: x, y: y, r: r, phase: phase }),
          flexo.$poly({ sides: sides, x: x, y: y, r: r,
            phase: phase + 360 / branches }));
    }
    phase = flexo.deg2rad(phase);
    for (var i = 0, ph = 4 * Math.PI / branches; i < branches; ++i) {
      points.push(x + r * Math.cos(phase + ph * i));
      points.push(y - r * Math.sin(phase + ph * i));
    }
    points.push(points[0]);
    points.push(points[1]);
    attrs.points = points.join(" ");
    return flexo.$polyline.apply(this, arguments);
  };

  // Triangle strips. The list of points should be at least 6 long (i.e. 3 pairs
  // of coordinates)
  flexo.$strip = function (attrs) {
    var points = (attrs.points || "").split(/\s*,\s*|\s+/);
    delete attrs.points;
    var g = flexo.$g.apply(this, arguments);
    for (var i = 0, n = points.length / 2 - 2; i < n; ++i) {
      g.appendChild(flexo.$polygon({ points:
        [points[2 * i], points[2 * i + 1],
         points[2 * i + 2], points[2 * i + 3],
         points[2 * i + 4], points[2 * i + 5],
         points[2 * i], points[2 * i + 1]
        ].join(" ")
      }));
    }
    return g;
  };

}(typeof exports === "object" ? exports : this.flexo = {}));
