// General purpose Javascript support library; as used by Bender
/*jslint browser: true, maxerr: 50, nomen: true, regexp: true, indent: 2 */
/*global Node, exports */

(function (flexo) {
  "use strict";

  // Simple format function for messages and templates. Use {0}, {1}...
  // as slots for parameters. Missing parameters are note replaced.
  String.prototype.fmt = function () {
    var args = [].slice.call(arguments);
    return this.replace(/\{(\d+)\}/g, function (s, p) {
      return args[p] === undefined ? s : args[p];
    });
  };

  // Useful XML namespaces
  flexo.SVG_NS = "http://www.w3.org/2000/svg";
  flexo.XHTML_NS = "http://www.w3.org/1999/xhtml";
  flexo.XLINK_NS = "http://www.w3.org/1999/xlink";
  flexo.XML_NS = "http://www.w3.org/1999/xml";
  flexo.XMLNS_NS = "http://www.w3.org/2000/xmlns/";
  flexo.HTML_NS = flexo.XHTML_NS;

  // Utility function for absolute_uri
  function remove_dot_segments(path) {
    var input = path, output = "", m;
    while (input) {
      m = input.match(/^\.\.?\//);
      if (m) {
        input = input.substr(m[0].length);
      } else {
        m = input.match(/^\/\.\/|\/\.$/);
        if (m) {
          input = "/" + input.substr(m[0].length);
        } else {
          m = input.match(/^\/\.\.\/|\/\.\.$/);
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
    var b, r = flexo.split_uri(ref);
    if (r.scheme) {
      r.path = remove_dot_segments(r.path);
    } else {
      b = flexo.split_uri(base);
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

  // Return the value constrained between min and max.
  flexo.clamp = function (value, min, max) {
    if (isNaN(value)) {
      value = 0;
    }
    return Math.max(Math.min(value, max), min);
  };

  // Simple way to create elements, giving ns id and class directly within the
  // name of the element (e.g. svg:rect#background.test) Beware of calling this
  // function with `this` set to the target document.
  flexo.create_element = function (name, maybe_attrs) {
    var m, ns, name_, elem, split, classes, a, argc = 1, attrs = {};
    if (typeof maybe_attrs === "object" && !(maybe_attrs instanceof Node)) {
      attrs = maybe_attrs;
      argc = 2;
    }
    classes = name.split(".");
    name_ = classes.shift();
    if (classes.length > 0) {
      attrs["class"] =
        (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "")
        + classes.join(" ");
    }
    m = name_.match(/^(?:(\w+):)?([\w.\-]+)(?:#([\w:.\-]+))?$/);
    if (m) {
      ns = (m[1] && flexo["{0}_NS".fmt(m[1].toUpperCase())]) ||
        this.documentElement.namespaceURI;
      elem = ns ? this.createElementNS(ns, m[2]) : this.createElement(m[2]);
      if (m[3]) {
        attrs.id = m[3];
      }
      for (a in attrs) {
        if (attrs.hasOwnProperty(a) &&
            attrs[a] !== undefined && attrs[a] !== null) {
          split = a.split(":");
          ns = split[1] && flexo["{0}_NS".fmt(split[0].toUpperCase())];
          if (ns) {
            elem.setAttributeNS(ns, split[1], attrs[a]);
          } else {
            elem.setAttribute(a, attrs[a]);
          }
        }
      }
      [].forEach.call(arguments, function (ch, i) {
        if (i >= argc) {
          if (typeof ch === "string") {
            elem.appendChild(this.createTextNode(ch));
          } else if (ch instanceof Node) {
            elem.appendChild(ch);
          }
        }
      }, this);
      return elem;
    }
  };

  flexo.elem = function () {
    return flexo.create_element.apply(document, arguments);
  };

  // Get clientX/clientY as an object { x: ..., y: ... } for events that may
  // be either a mouse event or a touch event, in which case the position of
  // the first touch is returned.
  flexo.event_client_pos = function (e) {
    return { x: e.targetTouches ? e.targetTouches[0].clientX : e.clientX,
      y: e.targetTouches ? e.targetTouches[0].clientY : e.clientY };
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
    req.onload = function () { f(req); };
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

  // Define a getter/setter for a property, using Object.defineProperty if
  // available, otherwise the deprecated __defineGetter__/__defineSetter__
  flexo.getter_setter = function (o, prop, getter, setter) {
    var props;
    if (typeof Object.defineProperty === "function") {
      props = { enumerable: true, configurable: true };
      if (getter) {
        props.get = getter;
      }
      if (setter) {
        props.set = setter;
      }
      Object.defineProperty(o, prop, props);
    } else {
      if (getter) {
        o.__defineGetter__(prop, getter);
      }
      if (setter) {
        o.__defineSetter__(prop, setter);
      }
    }
  };

  // Identity function
  flexo.id = function (x) { return x; };

  // Return a random element from an array
  flexo.random_element = function (a) {
    return a[flexo.random_int(a.length - 1)];
  };

  // Return a random integer in the [min, max] range
  flexo.random_int = function (min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max + 1 - min));
  };

  // Remap a value from a given range to another range (from Processing)
  flexo.remap = function (value, istart, istop, ostart, ostop) {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
  };

  // Remove all children of an element
  flexo.remove_children = function (elem) {
    while (elem.firstChild) {
      elem.removeChild(elem.firstChild);
    }
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

  // Split an URI into an object with the five parts scheme, authority, path,
  // query, and fragment (without the extra punctuation; i.e. query does not
  // have a leading "?")
  flexo.split_uri = function (uri) {
    var m = uri.match(/^(?:([a-zA-Z](?:[a-zA-Z0-9+.\-]*)):(?:\/\/([^\/]*))?)?([^#?]*)(?:\?([^#]*))?(?:#(.*))?$/),
      u = {};
    ["scheme", "authority", "path", "query", "fragment"]
      .forEach(function (k, i) {
        if (m && m[i + 1]) {
          u[k] = m[i + 1];
        }
      });
    return u;
  };

  // Rebuild an URI string from an object as split by flexo.split_uri
  flexo.unsplit_uri = function (r) {
    return (r.scheme ? r.scheme + ":" : "") +
      "//" + (r.authority || "") +
      r.path +
      (r.query ? "?" + r.query : "") +
      (r.fragment ? "#" + r.fragment : "");
  };


  // Custom events

  // Listen to a custom event
  flexo.listen = function (target, type, listener) {
    if (!(target.hasOwnProperty(type))) {
      target[type] = [];
    }
    target[type].push(listener);
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

}(typeof exports === "object" ? exports : this.flexo = {}));
