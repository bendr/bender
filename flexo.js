// General purpose Javascript support library; as used by Bender


// Simple format function for messages and templates. Use {0}, {1}...
// as slots for parameters. Missing parameters are replaced with the empty
// string.
String.prototype.fmt = function()
{
  var args = [].slice.call(arguments);
  return this.replace(/{(\d+)}/g, function(_, p) {
      return args[p] === undefined ? "" : args[p];
    });
};

String.prototype.format = function(params)
{
  return this.replace(/{(\w+)}/g, function(str, p) {
      return params[p] === undefined ? "" : params[p];
    });
};

// Wrap a string to fit with the given width
String.prototype.wrap = function(width)
{
  var w = width + 1;
  return this.trim().split(/\s+/).map(function(word, i) {
      w -= (word.length + 1);
      if (w < 0) {
        w = width - word.length;
        return (i === 0 ? "" : "\n") + word;
      } else {
        return (i === 0 ? "" : " ") + word;
      }
    }).join("");
  return out;
};


// Bind the function f to the object x. Additional arguments can be provided to
// specialize the bound function.
if (typeof Function.prototype.bind !== "function") {
  Function.prototype.bind = function(x)
  {
    var f = this;
    var args = [].slice.call(arguments, 1);
    return function() { return f.apply(x, [].concat.apply(args, arguments)); };
  };
}

// Shim for forEach since we use it extensively (from MDN)
if (typeof Array.prototype.forEach !== "function") {
  Array.prototype.forEach = function(f, self)
  {
    if (!this) throw new TypeError("Null or undefined array for forEach");
    if (!self) self = this;
    var o = Object(this);
    var n = o.length >>> 0;
    for (var i = 0; i < n; ++i) {
      if (i in o) f.call(self, o[i.toString()], i, o);
    }
  };
}


// Trampoline calls, adapted from
// http://github.com/spencertipping/js-in-ten-minutes

// Use a trampoline to call a function; we expect a thunk to be returned
// through the get_thunk() function below. Return nothing to step off the
// trampoline (e.g. to wait for an event before continuing.)
Function.prototype.trampoline = function()
{
  var c = [this, arguments];
  var esc = arguments[arguments.length - 1];
  while (c && c[0] !== esc) c = c[0].apply(this, c[1]);
  if (c) return esc.apply(this, c[1]);
};

// Return a thunk suitable for the trampoline function above.
Function.prototype.get_thunk = function() { return [this, arguments]; };


(function (flexo)
{
  // Useful XML namespaces
  flexo.SVG_NS = "http://www.w3.org/2000/svg";
  flexo.XHTML_NS = "http://www.w3.org/1999/xhtml";
  flexo.XLINK_NS = "http://www.w3.org/1999/xlink";
  flexo.XML_NS = "http://www.w3.org/1999/xml";
  flexo.XMLNS_NS = "http://www.w3.org/2000/xmlns/";
  flexo.HTML_NS = flexo.XHTML_NS;


  // Return an absolute URI for the reference URI for a given base URI
  flexo.absolute_uri = function(base, ref)
  {
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
          r.path = b.path
          if (!r.query) r.query = b.query;
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

  // Utility function for absolute_uri above
  function remove_dot_segments(path)
  {
    for (var input = path, output = "", m; input;) {
      if (m = input.match(/^\.\.?\//)) {
        input = input.substr(m[0].length);
      } else if (m = input.match(/^\/\.\/|\/\.$/)) {
        input = "/" + input.substr(m[0].length);
      } else if (m = input.match(/^\/\.\.\/|\/\.\.$/)) {
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
    return output;
  }

  // Identity function
  flexo.id = function(x) { return x; };

  // Safe log function
  flexo.log = function()
  {
    if (typeof console === "undefined") {
      if (typeof opera !== "undefined") {
        opera.postError.apply(this, arguments);
      }
    } else if (typeof console.log === "function") {
      console.log.apply(console, arguments);
    } else if (typeof console.log === "object") {
      (Function.prototype.bind.call(console.log, console))
        .apply(console, arguments);
    }
  };

  // Chop the last character of a string if it's a newline
  flexo.chomp = function(string) { return string.replace(/\n$/, ""); };

  // Object.create replacement; necessary for Opera or Vidualize.
  // Extra arguments are definitions of additional properties.
  flexo.create_object = function(o)
  {
    var f = function() {};
    f.prototype = o;
    var f_ = new f;
    for (var i = 1; i < arguments.length; ++i) {
      for (var a in arguments[i]) f_[a] = arguments[i][a];
    }
    return f_;
  };

  // Dump any value to a string with an optional maximum depth parameter
  flexo.dump = function(value, max_depth)
  {
    var seen = [];
    if (max_depth === undefined) max_depth = Infinity;
    var dump = function(value, d)
    {
      if (d > max_depth) return "...";
      if (typeof value === undefined) return "undefined";
      if (typeof value === "number" || typeof value === "boolean") return value;
      if (typeof value === "string") return "\"{0}\"".fmt(value);
      if (typeof value === "function") return value.toString();
      if (typeof value === "object") {
        if (value === null) {
          return "null";
        } else if (seen.indexOf(value) >= 0) {
          return "(circular reference)";
        } else if (Array.isArray(value)) {
          seen.push(value);
          return "[{0}]"
            .fmt(value.map(function(v) { return dump(v, d + 1); }).join(", "));
        } else {
          seen.push(value);
          var pairs = [];
          for (var i in value) {
            pairs.push("{0}: {1}".fmt(i, dump(value[i], d + 1)));
          }
          return "{ {0} }".fmt(pairs.join(", "));
        }
      }
    };
    return dump(value, 0);
  };

  // Get args from an URL (can be overridden with a given string)
  flexo.get_args = function(defaults, argstr)
  {
    if (!argstr) {
      argstr = typeof window === "object" &&
        typeof window.location === "object" &&
        typeof window.location.search === "string" ?
        window.location.search.substring(1) : "";
    }
    var args = defaults || {};
    argstr.split("&").forEach(function(q) {
        var sep = q.indexOf("=");
        args[q.substr(0, sep)] = decodeURIComponent(q.substr(sep + 1));
      });
    return args;
  };

  // Define a getter/setter for a property, using Object.defineProperty if
  // available, otherwise the deprecated __defineGetter__/__defineSetter__
  flexo.getter_setter = function(o, prop, getter, setter)
  {
    if (typeof Object.defineProperty === "function") {
      var props = { enumerable: true, configurable: true };
      if (getter) props.get = getter;
      if (setter) props.set = setter;
      Object.defineProperty(o, prop, props);
    } else {
      if (getter) o.__defineGetter__(prop, getter);
      if (setter) o.__defineSetter__(prop, setter);
    }
  }

  // Find the current global object
  flexo.global_object = function() { return (function() { return this; })(); };

  flexo.hashes = {};

  // Return a hash string and store the object in the tracked hashes object.
  // Use a prefix and a counter for simple hash codes.
  flexo.hash = (function() {
    var counter = 0;
    return function(obj, prefix)
    {
      obj.hash = "{0}_{1}".fmt(prefix || "object", counter++);
      flexo.hashes[obj.hash] = obj;
    };
  })();

  // Get a true or false value from a string; true if the string matches "true"
  // in case-insensitive, whitespace-tolerating way
  flexo.is_true = function(string)
  {
    return string.trim().toLowerCase() === "true";
  };

  // Listen to a custom event
  flexo.listen = function(target, type, listener)
  {
    if (!(target.hasOwnProperty(type))) target[type] = [];
    target[type].push(listener);
  };

  // Linear interpolation
  flexo.lerp = function(from, to, ratio) { return from + (to - from) * ratio; };

  // Normalize whitespace in a string
  flexo.normalize = function(string)
  {
    return string ? string.replace(/\s+/, " ").trim() : "";
  };

  // Can be called as notify(e), notify(source, type) or notify(source, type, e)
  flexo.notify = function(source, type, e)
  {
    if (e) {
      e.source = source;
      e.type = type;
    } else if (type) {
      e = { source: source, type: type };
    } else {
      e = source;
    }
    if (e.type in e.source) {
      var listeners = e.source[e.type].slice();
      listeners.forEach(function(listener) {
          if (typeof listener.handleEvent === "function") {
            listener.handleEvent.call(listener, e);
          } else {
            listener(e);
          }
        });
    }
  };


  // Pad a string to the given length
  flexo.pad = function(string, length, padding)
  {
    if (typeof padding !== "string") padding = "0";
    if (typeof string !== "string") string = string.toString();
    var l = length + 1 - string.length;
    return l > 0 ? (Array(l).join(padding)) + string : string;
  };

  // Remove an item from an array
  flexo.remove_from_array = function(array, item)
  {
    if (array) {
      var index = array.indexOf(item);
      if (index >= 0) return array.splice(index, 1)[0];
    }
  };

  // Make an XMLHttpRequest with params and a callback when done
  flexo.ez_xhr = function(uri, params, f)
  {
    if (f === undefined) {
      f = params;
      params = {};
    }
    if (!params.hasOwnProperty("method")) params.method = "GET";
    if (!params.hasOwnProperty("data")) params.data = "";
    var req = new XMLHttpRequest();
    req.open(params.method, uri);
    if (params.responseType) req.responseType = params.responseType;
    req.onload = function() { f(req); };
    req.send(params.data);
  };

  // Simple wrapper for XMLHttpRequest GET request with no data; call back with
  // the request object on success, throw an exception on error.
  flexo.request_uri = function(uri, f)
  {
    var req = new XMLHttpRequest();
    req.open("GET", uri);
    req.onreadystatechange = function()
    {
      if (req.readyState === 4) {
        if (req.status === 200 || req.status === 0) {
          f(req);
        } else {
          throw "flexo.request_uri failed for {0}: {1}".fmt(uri, req.status);
        }
      }
    };
    req.send("");
  };

  // Split an URI into an object with the five parts scheme, authority, path,
  // query, and fragment (without the extra punctuation; i.e. query does not
  // have a leading "?")
  flexo.split_uri = function(uri)
  {
    var m = uri.match(/^(?:([a-zA-Z](?:[a-zA-Z0-9+.-]*)):(?:\/\/([^\/]*))?)?([^#?]*)(?:\?([^#]*))?(?:#(.*))?$/);
    var u = {};
    ["scheme", "authority", "path", "query", "fragment"].forEach(function(k, i) {
        if (m && m[i + 1]) u[k] = m[i + 1];
      });
    return u;
  };

  // Rebuild an URI string from an object as split above
  flexo.unsplit_uri = function(r)
  {
    return (r.scheme ? r.scheme + ":" : "") +
      "//" + (r.authority ? r.authority : "") +
      r.path +
      (r.query ? "?" + r.query : "") +
      (r.fragment ? "#" + r.fragment : "");
  };

  flexo.sys_uuid = function(f)
  {
    var p = require("child_process").spawn("uuidgen");
    var uuid = "";
    p.stdout.on("data", function(chunk) { uuid += chunk.toString(); });
    p.on("exit", function(code) {
        uuid = uuid.toLowerCase().replace(/[^0-9a-f]/g, "");
        f(uuid);
      });
  };

  // Convert a string with dashes (as used in XML attributes) to camel case (as
  // used for property names)
  flexo.undash = function(string)
  {
    return string.replace(/-(\w)/, function(_, w) { return w.toUpperCase(); });
  };

  // Stop listening
  flexo.unlisten = function(target, type, listener)
  {
    var i = target[type].indexOf(listener);
    if (i >= 0) target[type].splice(i, 1);
  };

  // Get the path from a URI
  flexo.uri_path = function(uri)
  {
    return uri.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/*[^\/]+/, "")
        .replace(/^\/+/, "/");
  };


  // Randomness
  // TODO drunk

  // Return a random element from an array
  flexo.random_element = function(a)
  {
    return a[flexo.random_int(0, a.length - 1)];
  };

  // Generate a random id of the given length. If a document node is passed as
  // a second parameter, check that the id is unique in that document.
  flexo.random_id = function(n, doc)
  {
    var first = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm:_";
    var all = first + "1234567890-.";
    var id = flexo.random_element(first);
    for (var i = 1; i < n; ++i) id += flexo.random_element(all);
    return doc && doc.getElementById(id) ? flexo.random_id(n, doc) : id;
  };

  // Generate a random variable name of the given length.
  flexo.random_var = function(n, ns)
  {
    if (!ns) ns = flexo.global_object();
    var first = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm$_";
    var all = first + "1234567890";
    var name = flexo.random_element(first);
    for (var i = 1; i < n; ++i) name += flexo.random_element(all);
    return name in ns ? flexo.random_var(n, ns) : name;
  };

  // Return a random integer in the [min, max] range
  flexo.random_int = function(min, max)
  {
    return min + Math.floor(Math.random() * (max + 1 - min));
  };

  // Return a random number in the [min, max[ range
  flexo.random_number = function(min, max)
  {
    return min + Math.random() * (max - min);
  };

  // times(n, f) = [0, ..., n].apply(f)
  flexo.times = function(n, f)
  {
    var array = new Array(n);
    for (var i = 0; i < n; ++i) array[i] = f(i);
    return array;
  };


  // Transforming values

  // Asynchronous foldl
  flexo.async_foldl = function(f, z, a, k)
  {
    var n = a.length;
    return (function iter(i) {
      return i < n ? f.get_thunk(function(v) {
          z = v;
          return iter.get_thunk(i + 1);
        }, z, a[i], i, a) : k.get_thunk(z);
    }).get_thunk(0);
  };

  // Asynchronous foreach
  flexo.async_foreach = function(f, a, k)
  {
    var n = a.length;
    var i = 0;
    return (function iter() {
      return i < n ? f.get_thunk(iter, a[i], i++, a) : k.get_thunk();
    }).get_thunk();
  };

  // Asynchronous map
  flexo.async_map = function(f, a, k)
  {
    return flexo.async_foldl.get_thunk(function(k_, m, x, i, a_) {
        return f.get_thunk(function(v) { m[i] = v; return k_.get_thunk(m); },
          x, i, a_);
      }, [], a, k);
  };

  // Return the value constrained between min and max.
  flexo.clamp = function(value, min, max)
  {
    if (isNaN(value)) value = 0;
    return Math.max(Math.min(value, max), min);
  };

  // Left linear fold
  flexo.foldl = function(f, z, a)
  {
    for (var i = 0, n = a.length; i < n; ++i) z = f(z, a[i]);
    return z;
  };

  // Right linear fold
  flexo.foldr = function(f, z, a)
  {
    for (var i = a.length - 1; i >= 0; --i) z = f(a[i], z);
    return z;
  };

  flexo.range = function(from, to, step)
  {
    if (step === undefined) step = 1;
    if (to === undefined) {
      to = from;
      from = 0;
    }
    var r = [];
    for (var i = from; i <= to; i += step) r.push(i);
    return r;
  };

  // Remap a value from a given range to another range (from Processing)
  flexo.remap = function(value, istart, istop, ostart, ostop)
  {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
  };

  // Shuffle an array and return a new array
  flexo.shuffle = function(a)
  {
    var shuffled = typeof a === "string" ? a : a.slice(0);
    for (var i = shuffled.length - 1; i > 0; --i) {
      var j = flexo.random_int(0, i);
      var x = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = x;
    }
    return shuffled;
  };


  // Convert a number to roman numerals (integer part only; n must be positive
  // or zero.) Now that's an important function to have in any framework.
  flexo.to_roman = function(n)
  {
    function unit(n, i, v, x)
    {
      var r = "";
      if (n % 5 === 4) {
        r += i;
        n += 1;
      }
      if (n === 10) {
        r += x;
      } else {
        if (n >= 5) r += v;
        for (var j = 0; j < n % 5; ++j) r += i;
      }
      return r;
    }
    if (typeof n === "number" && n >= 0) {
      n = Math.floor(n);
      if (n === 0) return "nulla";
      var r = "";
      for (var i = 0; i < Math.floor(n / 1000); ++i) r += "m";
      return r +
        unit(Math.floor(n / 100) % 10, "c", "d", "m") +
        unit(Math.floor(n / 10) % 10, "x", "l", "c") +
        unit(n % 10, "i", "v", "x");
    }
  };

  flexo.yyyymmdd = function(date)
  {
    if (!date) date = new Date;
    return "{0}{1}{2}".fmt(1900 + date.getYear(),
        flexo.pad(1 + date.getMonth(), 2), flexo.pad(date.getDate(), 2));
  };

  // DOM related functions

  // Append a class to an element (if it does not contain it already)
  flexo.add_class = function(elem, c)
  {
    var k = elem.getAttribute("class") || "";
    if (!flexo.has_class(elem, c)) {
      elem.className = "{0}{1}{2}".fmt(k, k ? " " : "", c);
    }
  };

  // Wrapper for createObjectURL, since different browsers have different
  // namespaces for it
  flexo.create_object_url = function(file)
  {
    return window.webkitURL ? window.webkitURL.createObjectURL(file) :
      window.URL ? window.URL.createObjectURL(file) :
      createObjectURL(file);
  };

  // Create a dataset attribute if not present
  flexo.dataset = function(elem)
  {
    if (typeof elem.dataset === "object") return;
    elem.dataset = {};  // TODO create a DOMStringMap?
    [].forEach.call(elem.attributes, function(attr) {
        if (!attr.namespaceURI && attr.localName.indexOf("data-") === 0) {
          elem.dataset[flexo.undash(attr.localName.substr(5))] = attr.value;
        }
      });
  };

  // Make a DOM Element node in the current document
  flexo.elem = function(ns, name, attrs, contents)
  {
    var elem = ns ? document.createElementNS(ns, name) :
      document.createElement(name);
    for (attr in attrs) {
      if (attrs.hasOwnProperty(attr) && attrs[attr] !== undefined) {
        elem.setAttribute(attr, attrs[attr]);
      }
    }
    if (typeof contents === "string") {
      elem.textContent = contents;
    } else if (contents && contents.forEach) {
      contents.forEach(function(ch) { elem.appendChild(ch); });
    }
    return elem;
  };

  // Get clientX/clientY as an object { x: ..., y: ... } for events that may
  // be either a mouse event or a touch event, in which case the position of
  // the first touch is returned.
  flexo.event_client_pos = function(e)
  {
    return { x: e.targetTouches ? e.targetTouches[0].clientX : e.clientX,
      y: e.targetTouches ? e.targetTouches[0].clientY : e.clientY };
  };

  // Get pageX/pageY as an object { x: ..., y: ... } for events that may be
  // either a mouse event or a touch event, in which case the position of the
  // first touch is returned. This is client position (clientX/clientY) offset
  // by the document body scroll position
  // TODO check whether this is always correct
  flexo.event_page_pos = function(e)
  {
    var p = flexo.event_client_pos(e);
    return { x: p.x + window.pageXOffset, y: p.y + window.pageYOffset };
  };

  // Simpler way to create elements, giving ns id and class directly within the
  // name of the element (e.g. svg:rect#background.test)
  flexo.ez_elem = function(name)
  {
    var argc = 1;
    var attrs = {};
    if (typeof arguments[1] === "object" && !(arguments[1] instanceof Node)) {
      attrs = arguments[1];
      argc = 2;
    }
    var classes = name.split(".");
    name = classes.shift();
    if (classes.length > 0) {
      attrs["class"] =
        (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "")
        + classes.join(" ");
    }
    var m = name.match(/^(?:(\w+):)?([\w\-]+)(?:#(.+))?$/);
    if (m) {
      var ns = m[1] && flexo["{0}_NS".fmt(m[1].toUpperCase())];
      var elem = ns ?
        document.createElementNS(ns, m[2]) : document.createElement(m[2]);
      if (m[3]) attrs.id = m[3];
      for (a in attrs) {
        if (attrs.hasOwnProperty(a) &&
            attrs[a] !== undefined && attrs[a] !== null) {
          var split = a.split(":");
          ns = split[1] && flexo["{0}_NS".fmt(split[0].toUpperCase())];
          if (ns) {
            elem.setAttributeNS(ns, split[1], attrs[a]);
          } else {
            elem.setAttribute(a, attrs[a]);
          }
        }
      }
      [].slice.call(arguments, argc).forEach(function(ch) {
          if (typeof ch === "string") {
            elem.appendChild(document.createTextNode(ch));
          } else if (ch instanceof Node) {
            elem.appendChild(ch);
          }
        });
      return elem;
    }
  }

  // Shortcut for flexo.html: no namespace; text content is interpreted as
  // innerHTML instead of textContent. Attributes are optional as well.
  flexo.ez_html = function(name)
  {
    var elem = document.createElement(name);
    var args = 1;
    if (arguments.length > 1 && typeof arguments[1] === "object" &&
        !(arguments[1] instanceof Node)) {
      for (a in arguments[1]) elem.setAttribute(a, arguments[1][a]);
      args = 2;
    }
    [].slice.call(arguments, args).forEach(function(ch) {
        if (typeof ch === "string") {
          elem.innerHTML += ch;
        } else {
          elem.appendChild(ch);
        }
      });
    return elem;
  };

  // Test whether an element has the given class
  flexo.has_class = function(elem, c)
  {
    return (new RegExp("\\b{0}\\b".fmt(c)))
      .test(elem.getAttribute("class") || "");
  };

  // Make an HTML element (without namespace) in the current document
  flexo.html = function(name, attrs, contents)
  {
    return flexo.elem(null, name, attrs, contents);
  };

  // Check whether a node is in a document
  flexo.in_document = function(node)
  {
    return !!node &&
      (node instanceof Document || flexo.in_document(node.parentNode));
  };

  // Remove all children of an element
  flexo.remove_children = function(elem)
  {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
  };

  // Root of a node: the furthest node up the tree.
  flexo.root = function(node)
  {
    return node && node.parentNode ? flexo.root(node.parentNode) : node;
  };

  // requestAnimationFrame
  if (typeof window !== "undefined" &&
      typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame =
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      function(f) {
        return setTimeout(function() { f(Date.now()); }, 1000 / 60);
      };
  }

  // Remove the given class from an element and return it. If it did not have
  // the class to start with, return an empty string.
  flexo.remove_class = function(elem, c)
  {
    var removed = "";
    var k = (elem.getAttribute("class") || "")
      .replace(new RegExp("\\s*{0}\\b".fmt(c)),
          function(str) { removed = str; return ""; });
    if (/\S/.test(k)) {
      elem.className = k;
    } else {
      elem.className = "";
    }
    return removed;
  };

  // Safe removal of a node; do nothing if the node did not exist or had no
  // parent
  flexo.safe_remove = function(node)
  {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  };

  // Add or remove the class c on elem according to the value of predicate p
  // (add if true, remove if false)
  flexo.set_class_iff = function(elem, c, p)
  {
    flexo[(p ? "add" : "remove") + "_class"](elem, c);
  };

  // Split a QName string into a [prefix, localname] array. Prefix may be empty
  // of course.
  flexo.split_qname = function(qname)
  {
    var i = qname.indexOf(":");
    if (i >= 0) return [qname.substr(0, i), qname.substr(i + 1)];
    return ["", qname];
  };


  // SVG specific functions
  // TODO these work in the SVG namespace, what about inline SVG in HTML5?

  // Get an SVG point for the event in the context of an SVG element (or the
  // closest svg element by default)
  flexo.event_svg_point = function(e, svg)
  {
    if (!svg) svg = flexo.find_svg(e.target);
    var p = svg.createSVGPoint();
    p.x = e.targetTouches ? e.targetTouches[0].clientX : e.clientX;
    p.y = e.targetTouches ? e.targetTouches[0].clientY : e.clientY;
    try {
      return p.matrixTransform(svg.getScreenCTM().inverse());
    } catch(e) {}
  };

  // Find the closest <svg> ancestor for a given element
  flexo.find_svg = function(elem)
  {
    if (elem.correspondingElement) elem = elem.correspondingElement;
    return elem.namespaceURI === flexo.SVG_NS &&
      elem.localName === "svg" ? elem : flexo.find_svg(elem.parentNode);
  };

  // Get an attribute as a trait with a default value if not present
  // The default default value is the empty string
  flexo.get_trait = function(elem, attr, default_)
  {
    var a = elem.getAttribute(attr);
    return a === null ? default_ || "" : a;
  };

  // Get an attribute as a float with a default value if not present
  // The default default value is 0
  flexo.get_float_trait = function(elem, attr, default_)
  {
    var a = parseFloat(elem.getAttribute(attr));
    return isNaN(a) ? default_ || 0 : a;
  };

  // True if rects ra and rb intersect
  flexo.intersect_rects = function(ra, rb)
  {
    return ((ra.x + ra.width) >= rb.x) && (ra.x <= (rb.x + rb.width)) &&
      ((ra.y + ra.height) >= rb.y) && (ra.y <= (rb.y + rb.height));
  };

  // Make an SVG element in the current document
  flexo.svg = function(name, attrs, contents)
  {
    return flexo.elem(flexo.SVG_NS, name, attrs, contents);
  };

  // Make an SVG element with an xlink:href attribute
  flexo.svg_href = function(name, href, attrs, contents)
  {
    var elem = flexo.elem(flexo.SVG_NS, name, attrs, contents);
    elem.setAttributeNS(flexo.XLINK_NS, "href", href);
    return elem;
  };

  flexo.svg_polygon_points = function(sides, radius, phase)
  {
    if (!phase) phase = 0;
    var points = [];
    for (var i = 0; i < sides; ++i) {
      points.push(radius * Math.cos(phase));
      points.push(-radius * Math.sin(phase));
      phase += 2 * Math.PI / sides;
    }
    return points.join(" ");
  };

  // Create a regular polygon with the number of sides inscribed in a circle of
  // the given radius, with an optional starting phase (use Math.PI / 2 to have
  // it pointing up at all times)
  flexo.svg_polygon = function(sides, radius, phase)
  {
    return flexo.svg("polygon",
        { points: flexo.svg_polygon_points(sides, radius, phase) });
  };

  flexo.svg_star_points = function(sides, ro, ri, phase)
  {
    if (!phase) phase = 0;
    sides *= 2;
    var points = [];
    for (var i = 0; i < sides; ++i) {
      var r = i % 2 === 0 ? ro : ri;
      points.push(r * Math.cos(phase));
      points.push(-r * Math.sin(phase));
      phase += 2 * Math.PI / sides;
    }
    return points.join(" ");
  }

  // Same as above but create a star with the given inner radius
  flexo.svg_star = function(sides, ro, ri, phase)
  {
    return flexo.svg("polygon",
        { points: flexo.svg_star_points(sides, ro, ri, phase) });
  };


  // Color functions

  // Yes, these are the colors from d3.js in case anybody asks
  // https://github.com/mbostock/d3/wiki/Ordinal-Scales#wiki-category10
  flexo.get_color_10 = function(n)
  {
    var colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
      "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
    if (!n) n = flexo.random_int(0, colors.length);
    return colors[Math.abs(n % colors.length)];
  };

  flexo.get_color_20 = function(n)
  {
    var colors = ["#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c",
      "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b",
      "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22",
      "#dbdb8d", "#17becf", "#9edae5"];
    if (!n) n = flexo.random_int(0, colors.length);
    return colors[Math.abs(n % colors.length)];
  };

  // Convert a color from hsv space (hue in radians, saturation and brightness
  // in the [0, 1] range) to RGB, returned as an array in the [0, 256[ range.
  flexo.hsv_to_rgb = function(h, s, v)
  {
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
  // in the [0, 1] range) to an RGB hex value
  flexo.hsv_to_hex = function(h, s, v)
  {
    return flexo.rgb_to_hex.apply(this, flexo.hsv_to_rgb(h, s, v));
  };

  // Convert an RGB color (3 values in the 0..255 range) to a hex value
  flexo.rgb_to_hex = function(r, g, b)
  {
    return "#" + [].map.call(arguments,
      function(x) { return flexo.pad(x.toString(16), 2, "0"); }).join("");
  };

  // Convert an sRGB color (3 values in the 0..1 range) to a hex value
  flexo.srgb_to_hex = function(r, g, b)
  {
    return "#" + [].map.call(arguments,
      function(x) {
        return flexo.pad(Math.floor(x * 255).toString(16), 2, "0");
      }).join("");
  };


  // Some canvas stuff

  // Draw an SVG path (i.e. the d attribute from a path element) to a canvas
  // (or more acurately its 2D drawing context.)
  flexo.draw_path = function(path, context)
  {
    // Return the tokens (commands and parameters) for path data, everything
    // else is ignored (no error reporting is done.) The token list has a
    // next_p method to get the next parameter, or 0 if there is none.
    var tokenize_path_data = function(d)
    {
      var tokenizer = /([chlmqstvz]|(?:\-?\d+\.?\d*)|(?:\-?\.\d+))/i;
      var tokens = [];
      tokens.next_p = function() { return parseFloat(this.shift()) || 0; };
      var match;
      while (match = tokenizer.exec(d)) {
        tokens.push(match[1]);
        d = d.substr(match.index + match[0].length);
      }
      return tokens;
    };

    // Parse the d attribute of an SVG path element and returns a list of
    // commands. Always return absolute commands.
    // Cf. http://www.w3.org/TR/SVGMobile12/paths.html
    var parse_path_data = function(d, splits)
    {
      var tokens = tokenize_path_data(d);
      var commands = [];
      var token;
      var x = 0;
      var y = 0;
      while (token = tokens.shift()) {
        if (token == "z" || token == "Z") {
          // Close path; no parameter
          commands.push(["Z"]);
        } else if (token == "M" || token == "L") {
          x = tokens.next_p();
          y = tokens.next_p();
          commands.push([token, x, y]);
        } else if (token == "m" || token == "l") {
          x += tokens.next_p();
          y += tokens.next_p();
          commands.push([token == "m" ? "M" : "L", x, y]);
        } else if (token == "C") {
          // Cubic curveto (6 params)
          var x1 = tokens.next_p();
          var y1 = tokens.next_p();
          var x2 = tokens.next_p();
          var y2 = tokens.next_p();
          var x3 = tokens.next_p();
          var y3 = tokens.next_p();
          commands = commands
            .concat(split_C(["C", x1, y1, x2, y2, x3, y3], x, y, splits));
          x = x3;
          y = y3;
        } else if (token == "c") {
          var x1 = tokens.next_p() + x;
          var y1 = tokens.next_p() + y;
          var x2 = tokens.next_p() + x;
          var y2 = tokens.next_p() + y;
          var x3 = tokens.next_p() + x;
          var y3 = tokens.next_p() + y;
          commands = commands
            .concat(split_C(["C", x1, y1, x2, y2, x3, y3], x, y, splits));
          x = x3;
          y = y3;
        } else if (token == "S") {
          // Smooth curveto where the two middle control points are the same
          // we expand it to a regular curveto and split it just the same
          var x1 = tokens.next_p();
          var y1 = tokens.next_p();
          var x2 = tokens.next_p();
          var y2 = tokens.next_p();
          commands = commands
            .concat(split_C(["C", x1, y1, x1, y1, x2, y2], x, y, splits));
          x = x2;
          y = y2;
        } else if (token == "s") {
          var x1 = tokens.next_p() + x;
          var y1 = tokens.next_p() + y;
          var x2 = tokens.next_p() + x;
          var y2 = tokens.next_p() + y;
          commands = commands
            .concat(split_C(["C", x1, y1, x1, y1, x2, y2], x, y, splits));
          x = x2;
          y = y2;
        } else {
          // Additional parameters, depending on the previous command
          var prev = commands[commands.length - 1];
          if (prev === undefined || prev == "Z") {
            tokens.unshift("M");
          } else if (prev == "M") {
            tokens.unshift("L");
          } else {
            tokens.unshift(prev);
          }
        }
      }
      return commands;
    };

    var commands = parse_path_data(path);
    context.beginPath();
    commands.forEach(function(c) {
        if (c[0] === "M") {
          context.moveTo(c[1], c[2]);
        } else if (c[0] === "L") {
          context.lineTo(c[1], c[2]);
        } else if (c[0] === "C") {
          context.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        } else if (c[0] === "Z") {
          context.closePath();
        }
      });
  };

})(typeof exports === "object" ? exports : this.flexo = {});
