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
    return this.replace(/\{([^}]*)\}/g, function (_, p) {
      return args[p] == null ? "" : args[p];
    });
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


  // Numbers

  // Return the value constrained between min and max. A NaN value is converted
  // to 0 before being clamped. min and max are assumed to be numbers such that
  // min <= max.
  flexo.clamp = function (value, min, max) {
    return Math.max(Math.min(isNaN(value) ? 0 : value, max), min);
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

  // Return a random element from an array
  flexo.random_element = function (a) {
    return a[flexo.random_int(a.length - 1)];
  };

  // Remove an item from an array
  flexo.remove_from_array = function (array, item) {
    if (array) {
      var index = array.indexOf(item);
      if (index >= 0) {
        return array.splice(index, 1)[0];
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

  // Get args from an URL
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

  // Known XML namespaces for use with create_element below. A variable of the
  // form flexo.{prefix}_NS will then be recognized when using {prefix} as the
  // tagname namespace prefix. For instance, "svg:g" will be recognized as an
  // element in the SVG namespace.
  flexo.HTML_NS = flexo.XHTML_NS = "http://www.w3.org/1999/xhtml";
  flexo.SVG_NS = "http://www.w3.org/2000/svg";
  flexo.XLINK_NS = "http://www.w3.org/1999/xlink";
  flexo.XML_NS = "http://www.w3.org/1999/xml";
  flexo.XMLNS_NS = "http://www.w3.org/2000/xmlns/";

  // Simple way to create elements, giving ns, id and classes directly within
  // the name of the element (e.g. svg:rect#background.test) If id is defined,
  // it must follow the element name and precede the class names; in this
  // shortcut syntax, the id cannot contain a period. The second argument may be
  // an object giving the attribute definitions (including id and class, if the
  // shortcut syntax is not suitable) Beware of calling this function with
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
      var ns = (m[1] && flexo["{0}_NS".fmt(m[1].toUpperCase())]) ||
        this.documentElement.namespaceURI;
      var elem = ns ? this.createElementNS(ns, m[2]) : this.createElement(m[2]);
      if (m[3]) {
        attrs.id = m[3];
      }
      Object.keys(attrs).forEach(function (a) {
        if (!!attrs[a] || attrs[a] === "") {
          var sp = a.split(":");
          var ns = sp[1] && flexo["{0}_NS".fmt(sp[0].toUpperCase())];
          if (ns) {
            elem.setAttributeNS(ns, sp[1], attrs[a]);
          } else {
            elem.setAttribute(a, attrs[a]);
          }
        }
      });
      contents.forEach(function (ch) {
        if (typeof ch === "string") {
          elem.appendChild(this.createTextNode(ch));
        } else if (ch instanceof Node) {
          elem.appendChild(ch);
        }
      }, this);
      return elem;
    }
  };

  // Shortcut to create elements, e.g. flexo.$("svg#main.zap-content")
  flexo.$ = function () {
    return flexo.create_element.apply(window.document, arguments);
  };

  if (browser) {
    // Shortcut for HTML elements: the element name prefixed by a $ sign
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
  }

  // Get clientX/clientY as an object { x: ..., y: ... } for events that may
  // be either a mouse event or a touch event, in which case the position of
  // the first touch is returned.
  flexo.event_client_pos = function (e) {
    return { x: e.targetTouches ? e.targetTouches[0].clientX : e.clientX,
      y: e.targetTouches ? e.targetTouches[0].clientY : e.clientY };
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

}(typeof exports === "object" ? exports : window.flexo = {}));
