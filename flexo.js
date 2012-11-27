// General purpose Javascript support library; as used by Bender

(function (flexo) {
  "use strict";

  var A = Array.prototype;
  var browser = typeof window === "object";

  // Strings

  // Simple format function for messages and templates. Use {0}, {1}...
  // as slots for parameters. Null and undefined are replaced by an empty
  // string.
  String.prototype.fmt = function () {
    var args = arguments;
    return this.replace(/\{(\d+)\}/g, function (_, p) {
      return args[p] == null ? "" : args[p];
    });
  };

  // Another format function for messages and templates; this time, the only
  // argument is an object and string parameters are keys.
  String.prototype.format = function (args) {
    return flexo.format.call(args, this, args);
  };

  // Can be called as flexo.format as well, giving the string and the arguments
  // object as parameters.
  flexo.format = function (string, args) {
    var stack = [""];
    var current = stack;
    if (typeof string !== "string") {
      string = string.toString();
    }
    string.split(/(\{|\}|\\[{}\\])/).forEach(function (token) {
      if (token === "{") {
        var chunk = [""];
        chunk.__parent = current;
        current.push(chunk);
        current = chunk;
      } else if (token === "}") {
        var parent = current.__parent;
        if (parent) {
          var p = parent.pop();
          if (args && args.hasOwnProperty(p)) {
            if (args[p] != null) {
              parent[0] += args[p];
            }
          } else {
            try {
              var v = new Function("return " + p).call(this);
              if (v != null) {
                parent[0] += v;
              }
            } catch (e) {
            }
          }
          current = parent;
        } else {
          if (typeof current[current.length - 1] !== "string") {
            current.push(token);
          } else {
            current[current.length - 1] += token;
          }
        }
      } else {
        token = token.replace(/^\\([{}\\])/, "$1");
        if (typeof current[current.length - 1] !== "string") {
          current.push(token);
        } else {
          current[current.length - 1] += token;
        }
      }
    }, this);
    while (current.__parent) {
      current = current.__parent;
      current[0] += "{" + current.pop();
    }
    return stack.join();
  }

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

  // Find the first item x in a such that p(x) is true
  flexo.find_first = function (a, p) {
    for (var i = 0, n = a.length; i < n && !p(a[i], i, a); ++i) {}
    return a[i];
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

  // Listen to a custom event. Listener is a function or an object whose
  // "handleEvent" function will then be invoked.
  flexo.listen = function (target, type, listener) {
    if (!(target.hasOwnProperty(type))) {
      target[type] = [];
    }
    target[type].push(listener);
  };

  // Listen to an event only once
  flexo.listen_once = function (target, type, listener) {
    var h = function (e) {
      flexo.unlisten(target, type, h);
      if (typeof listener.handleEvent === "function") {
        listener.handleEvent.call(listener, e);
      } else {
        listener(e);
      }
    };
    flexo.listen(target, type, h);
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
        if (typeof listener.handleEvent === "function") {
          listener.handleEvent.call(listener, e);
        } else {
          listener(e);
        }
      });
    }
  };

  // Stop listening
  flexo.unlisten = function (target, type, listener) {
    flexo.remove_from_array(target[type], listener);
  };


  // Functions and Asynchronicity

  // Identity function
  flexo.id = function (x) { return x; };

  // Seq object for chaining asynchronous calls
  var seq = {
    _init: function () {
      this._queue = [];
      this._flushing = false;
      return this;
    },

    _flush: function () {
      var f = this._queue.shift();
      if (f) {
        f(this._flush.bind(this));
      } else {
        this._flushing = false;
        flexo.notify(this, "@done");
      }
    },

    add: function(f) {
      this._queue.push(f);
      if (!this._flushing) {
        this._flushing = true;
        this._flush();
      }
    }
  };

  flexo.seq = function () {
    return Object.create(seq)._init();
  };


  // DOM

  // Known XML namespaces and their prefixes for use with create_element below.
  // For convenience both "html" and "xhtml" are defined as prefixes for XHTML.
  flexo.ns = {
    html: "http://www.w3.org/1999/xhtml",
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
  }

  // Simple way to create elements, giving ns, id and classes directly within
  // the name of the element (e.g. svg:rect#background.test) If id is defined,
  // it must follow the element name and precede the class names; in this
  // shorthand syntax, the id cannot contain a period. The second argument may
  // be an object giving the attribute definitions (including id and class, if
  // the shorthand syntax is not suitable) Beware of calling this function with
  // `this` set to the target document.
  flexo.create_element = function (name, attrs) {
    var contents;
    if (typeof attrs === "object" && !(attrs instanceof Node)) {
      contents = A.slice.call(arguments, 2);
    } else {
      contents = A.slice.call(arguments, 1);
      attrs = {};
    }
    var classes = name.trim().split(".");
    name = classes.shift();
    if (classes.length > 0) {
      attrs["class"] =
        (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "")
        + classes.join(" ");
    }
    var m = name.match(/^(?:([^:]+):)?([^#]+)(?:#(.+))?$/);
    if (m) {
      var ns = (m[1] && flexo.ns[m[1].toLowerCase()]) ||
        this.documentElement.namespaceURI;
      var elem = ns ? this.createElementNS(ns, m[2]) : this.createElement(m[2]);
      if (m[3]) {
        attrs.id = m[3];
      }
      Object.keys(attrs).forEach(function (a) {
        if (attrs[a] !== null && attrs[a] !== undefined && attrs[a] !== false) {
          var sp = a.split(":");
          var ns = sp[1] && flexo.ns[sp[0].toLowerCase()];
          if (ns) {
            elem.setAttributeNS(ns, sp[1], attrs[a]);
          } else {
            elem.setAttribute(a, attrs[a]);
          }
        }
      });
      contents.forEach(function (ch) {
        flexo.append_child(elem, ch);
      });
      return elem;
    }
  };

  // Shorthand to create elements, e.g. flexo.$("svg#main.content")
  flexo.$ = function () {
    return flexo.create_element.apply(window.document, arguments);
  };

  // Shorthand to create a document fragment
  flexo.$$ = function () {
    var fragment = window.document.createDocumentFragment();
    A.forEach.call(arguments, function (ch) {
      flexo.append_child(fragment, ch);
    });
    return fragment;
  }

  if (browser) {
    // Shorthand for HTML elements: the element name prefixed by a $ sign
    // Cf. http://dev.w3.org/html5/spec/section-index.html#elements-1
    ["a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
      "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
      "cite", "code", "col", "colgroup", "command", "datalist", "dd", "del",
      "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
      "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
      "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
      "input", "ins", "kbd", "keygen", "label", "legend", "li", "link", "map",
      "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol",
      "optgroup", "option", "output", "p", "param", "pre", "progress", "q",
      "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small",
      "source", "span", "strong", "style", "sub", "summary", "sup", "table",
      "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
      "tref", "track", "u", "ul", "var", "video", "wbr"
    ].forEach(function (tag) {
      flexo["$" + tag] = flexo.create_element.bind(window.document, tag);
    });

    // SVG elements (a, color-profile, font-face, font-face-format,
    // font-face-name, font-face-src, font-face-uri, missing-glyph, script,
    // style, and title are omitted because of clashes with the HTML namespace
    // or lexical issues with Javascript)
    // Cf. http://www.w3.org/TR/SVG/eltindex.html
    ["altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor",
      "animateMotion", "animateTransform", "circle", "clipPath", "cursor",
      "defs", "desc", "ellipse", "feBlend", "feColorMatrix",
      "feComponentTransfer", "feComposite", "feConvolveMatrix",
      "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood",
      "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage",
      "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
      "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter",
      "font", "foreignObject", "g", "glyph", "glyphRef", "hkern", "image",
      "line", "linearGradient", "marker", "mask", "metadata", "mpath", "path",
      "pattern", "polygon", "polyline", "radialGradient", "rect", "set", "stop",
      "svg", "switch", "symbol", "text", "textPath", "tref", "tspan", "use",
      "view", "vkern"
    ].forEach(function (tag) {
      flexo["$" + tag] = flexo.create_element.bind(window.document,
        "svg:" + tag);
    });

    // TODO MathML
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
    return "#" + A.map.call(arguments,
      function (x) {
        return flexo.pad(flexo.clamp(Math.floor(x), 0, 255).toString(16), 2);
      }).join("");
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

  // Create a regular polygon with the number of sides inscribed in a circle of
  // the given radius, with an optional starting phase (use Math.PI / 2 to have
  // it pointing up at all times)
  flexo.svg_polygon = function (sides, radius, phase) {
    return $polygon({ points: flexo.svg_polygon_points(sides, radius, phase) });
  };

  flexo.svg_polygon_points = function (sides, radius, phase) {
    if (phase === undefined) {
      phase = 0;
    }
    var points = [];
    for (var i = 0, ph = 2 * Math.PI / sides; i < sides; ++i) {
      points.push(radius * Math.cos(phase + ph * i));
      points.push(-radius * Math.sin(phase + ph * i));
    }
    return points.join(" ");
  };

  // Same as above but create a star with the given inner radius
  flexo.svg_star = function (sides, ro, ri, phase) {
    return $polygon({ points: flexo.svg_star_points(sides, ro, ri, phase) });
  };

  flexo.svg_star_points = function (sides, ro, ri, phase) {
    if (phase === undefined) {
      phase = 0;
    }
    sides *= 2;
    var points = [];
    for (var i = 0, ph = 2 * Math.PI / sides; i < sides; ++i) {
      var r = i % 2 === 0 ? ro : ri;
      points.push(r * Math.cos(phase + ph * i));
      points.push(-r * Math.sin(phase + ph * i));
    }
    return points.join(" ");
  };

}(typeof exports === "object" ? exports : window.flexo = {}));
