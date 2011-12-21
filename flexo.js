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

  // Solve a relative URI and return an absolute URI
  flexo.absolute_uri = function(base_uri, uri)
  {
    if (!base_uri) base_uri = "";
    // Start with a scheme: return as is
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+/.test(uri)) return uri;
    base_uri = base_uri.split(/[#?]/)[0];
    // Absolute path: resolve with current host
    if (/^\//.test(uri)) {
      return base_uri.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+[^\/]*/) + uri;
    }
    // Relative path; split into path/fragment identifier
    var abs = base_uri.replace(/#.*$/, "");
    var p = uri.split("#");
    if (p[0]) abs = abs.replace(/(\/?)[^\/]*$/, "$1" + p[0]);
    var m;
    while (m = /[^\/]+\/\.\.\//.exec(abs)) {
      abs = abs.substr(0, m.index) + abs.substr(m.index + m[0].length);
    }
    if (p[1]) abs += "#" + p[1];
    return abs;
  };

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

  // Get args from an URL (can be overridden with a given string)
  flexo.get_args = function(defaults, argstr)
  {
    if (!argstr) {
      argstr =  typeof window === "object" &&
        typeof window.location === "object" &&
        typeof window.location.search === "string" ?
        window.location.search.substring(1) : "";
    }
    var args = defaults || {};
    argstr.split("&").forEach(function(q) {
        var sep = q.indexOf("=");
        args[q.substr(0, sep)] = unescape(q.substr(sep + 1));
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
    return flexo.normalize(string).toLowerCase() === "true";
  };

  // Normalize whitespace in a string
  flexo.normalize = function(string)
  {
    return string ?
      string.replace(/\s+/, " ").replace(/^ /, "").replace(/ $/, "") : "";
  };

  // Pad a string to the given length
  flexo.pad = function(string, length, padding)
  {
    if (typeof padding !== "string") padding = "0";
    var l = length + 1 - string.length;
    return l > 0 ? (Array(l).join(padding)) + string : string;
  };

  // Remove an item from an array
  flexo.remove_from_array = function(array, item)
  {
    if (array) {
      var index = array.indexOf(item);
      if (index >= 0) return array.splice(item, 1);
    }
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

  // Convert a string with dashes (as used in XML attributes) to camel case (as
  // used for property names)
  flexo.undash = function(string)
  {
    return string.replace(/-(\w)/, function(_, w) { return w.toUpperCase(); });
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


  // Transforming values

  // Return the value constrained between min and max.
  flexo.clamp = function(value, min, max)
  {
    if (isNaN(value)) value = 0;
    return Math.max(Math.min(value, max), min);
  };

  // Remap a value from a given range to another range (from Processing)
  flexo.remap = function(value, istart, istop, ostart, ostop)
  {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
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


  // DOM related functions

  // Append a class to an element (if it does not contain it already)
  flexo.add_class = function(elem, c)
  {
    var k = elem.getAttribute("class") || "";
    if (!flexo.has_class(elem, c)) {
      elem.setAttribute("class", "{0}{1}{2}".fmt(k, k ? " " : "", c));
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
    for (attr in attrs) elem.setAttribute(attr, attrs[attr]);
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
    return { x: p.x + document.body.scrollLeft,
      y: p.y + document.body.scrollTop };
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

  // Remove all children of an element
  flexo.remove_children = function(elem)
  {
    var child = elem.firstElementChild;
    while (child) {
      var next = child.nextElementSibling;
      elem.removeChild(child);
      child = next;
    }
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
      elem.setAttribute("class", k);
    } else {
      elem.removeAttribute("class");
    }
    return removed;
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
    if (!svg) svg = flexo.find_svg(e);
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
    return elem.namespaceURI === flexo.SVG_NS &&
      elem.localName === "svg" ? elem : flexo.find_svg(elem.parentNode);
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


  // Color functions

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

  // Convert an RGB color (3 values) to a hex value
  flexo.rgb_to_hex = function(r, g, b)
  {
    return "#" + [].map.call(arguments,
      function(x) { return flexo.pad(x.toString(16), 2, "0"); }).join("");
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


  // Basic handler for pointing, with a mouse or touch
  flexo.point_handler =
  {
    watch: function(elem, p)
    {
      if (!p) {
        p = elem;
        elem.addEventListener("mouseout", this, false);
      }
      elem.addEventListener("mousedown", this, false);
      p.addEventListener("mousemove", this, false);
      p.addEventListener("mouseup", this, false);
      elem.addEventListener("touchstart", this, false);
      elem.addEventListener("touchmove", this, false);
      elem.addEventListener("touchend", this, false);
    },

    unwatch: function(elem, p)
    {
      if (!p) {
        p = elem;
        elem.removeEventListener("mouseout", this, false);
      }
      elem.removeEventListener("mousedown", this, false);
      p.removeEventListener("mousemove", this, false);
      p.removeEventListener("mouseup", this, false);
      elem.removeEventListener("touchstart", this, false);
      elem.removeEventListener("touchmove", this, false);
      elem.removeEventListener("touchend", this, false);
    },

    // Convenience method to create a new handler watching an element
    new_handler_for: function(elem)
    {
      var h = flexo.create_object(this);
      h.watch(elem);
      return h;
    },

    handleEvent: function(e)
    {
      e.preventDefault();
      if (e.type === "mousedown" || e.type === "touchstart") {
        this.is_down = true;
        this.down(e);
      } else if (e.type === "mousemove" || e.type === "touchmove") {
        this.move(e);
      } else if (e.type === "mouseup" || e.type === "touchend") {
        this.up(e);
        this.is_down = false;
      } else if (e.type === "mouseout" || e.type === "touchcancel") {
        this.is_down = false;
        this.out(e);
      }
    },

    down: function(e) {},
    up: function(e) {},
    move: function(e) {},
    out: function(e) {}

  };

  // Basic drag and drop handler
  flexo.dnd_handler =
  {
    // Attach this handler to an element
    watch: function(elem)
    {
      elem.addEventListener("dragenter", this, false);
      elem.addEventListener("dragover", this, false);
      elem.addEventListener("dragleave", this, false);
      elem.addEventListener("drop", this, false);
    },

    // Detach this handler from an element
    unwatch: function(elem)
    {
      elem.removeEventListener("dragenter", this, false);
      elem.removeEventListener("dragover", this, false);
      elem.removeEventListener("dragleave", this, false);
      elem.removeEventListener("drop", this, false);
    },

    // Convenience method to create a new handler watching an element
    new_handler_for: function(elem)
    {
      var h = flexo.create_object(this);
      h.watch(elem);
      return h;
    },

    // Handle the drag and drop events
    handleEvent: function(e)
    {
      e.preventDefault();
      if (e.type === "dragover") {
        this.dragover(e);
      } else if (e.type === "dragenter") {
        flexo.add_class(e.target, "drag");
        this.dragenter(e);
      } else if (e.type === "dragleave") {
        flexo.remove_class(e.target, "drag");
        this.dragleave(e);
      } else if (e.type === "drop") {
        flexo.remove_class(e.target, "drag");
        this.drop(e);
      }
    },

    // Customize the behavior of the handler
    dragover: function(e) {},
    dragenter: function(e) {},
    dragleave: function(e) {},
    drop: function(e) {}
  };

})(typeof exports === "object" ? exports : this.flexo = {});
