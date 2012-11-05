(function (bender) {
  "use strict";

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp/live";

  // Create a rendering contest given a target element in a host document (using
  // the document element as a default.)
  // The context maintains a map of loaded components indexed by their absolute
  // URI (generating one if necessary.) The components themselves are not added
  // to the tree; only instances are.
  bender.create_context = function (target) {
    target = target || document.documentElement;
    var host_doc = target.ownerDocument;
    var context = host_doc.implementation.createDocument(bender.ns, "context",
      null);

    // Wrap all new elements created in this context
    context.createElement = function (name) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            bender.NS, name));
    };
    context.createElementNS = function (ns, qname) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            ns, qname));
    };

    context.$ = flexo.create_element.bind(context);

    var root = wrap_element(context.documentElement);
    root._target = target;
    var instance = root.appendChild(context.$("instance"));
    instance._component = context.$("component", context.$("view"));

    // Add a child instance to the view of the context instance
    context._add_instance = function (ch) {
      instance._view.appendChild(ch);
      return ch;
    };

    // Create a new child instance for the given component and add it to the
    // context instance
    context._add_instance_of = function (component) {
      var ch = this.$("instance");
      ch._component = component;
      return this._add_instance(ch);
    };

    return context;
  };

  // Extend an element with Bender methods, calls its _init() method, and return
  // the wrapped element.
  function wrap_element(e, proto) {
    if (e.__wrapped) {
      return;
    }
    e.__wrapped = true;
    if (typeof proto !== "object") {
      proto = prototypes[e.localName];
    }
    if (proto) {
      for (var p in proto) {
        if (proto.hasOwnProperty(p)) {
          e[p] = proto[p];
        }
      }
    }
    for (p in prototypes[""]) {
      if (prototypes[""].hasOwnProperty(p) && !e.hasOwnProperty(p)) {
        e[p] = prototypes[""][p];
      }
    }
    if (typeof e._init === "function") {
      e._init();
    }
    return e;
  }

  var prototypes = {
    // Default overloaded DOM methods for Bender elements
    "": {
      // Make sure that an overloaded insertBefore() is called for appendChild()
      appendChild: function (ch) {
        return this.insertBefore(ch, null);
      },

      cloneNode: function (deep) {
        var clone = wrap_element(
            Object.getPrototypeOf(this).cloneNode.call(this, false));
        if (deep) {
          // TODO keep track of URI for component
          A.forEach.call(this.childNodes, function (ch) {
            clone.appendChild(ch.cloneNode(true));
          });
        }
        return clone;
      }
    }
  };

  ["(foreign)", "component", "context", "instance", "view"
  ].forEach(function (p) {
    prototypes[p] = {};
  });


  // Foreign node methods
  prototypes["(foreign)"].insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
    }
  };


  // Component methods

  prototypes.component.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this._view) {
          console.error("Multiple views for component", this);
        }
        this._view = ch;
      }
    }
    return ch;
  };


  // Context methods

  // Add instances to the context and render them in the target
  prototypes.context.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "instance") {
        ch._target = this._target;
      }
    }
    return ch;
  };


  // Instance methods

  prototypes.instance._init = function (component, target) {
    Object.defineProperty(this, "_component", { enumerable: true,
      get: function () { return component; },
      set: function (c) {
        if (component !== c) {
          component = c;
          instantiate_component(this);
          render_instance(this);
        }
      }
    });
    Object.defineProperty(this, "_target", { enumerable: true,
      get: function () { return target; },
      set: function (t) {
        if (target !== t) {
          target = t;
          render_instance(this);
        }
      }
    });
    return this;
  };

  prototypes.instance.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute(name, value);
    if (name === "href") {
      this._component = this.ownerDocument.load_component(value);
    }
  };

  prototypes.instance.insertBefore = function (ch, ref) {
    prototypes.component.insertBefore.call(this, ch, ref);
  };

  // Instantiate the component that the `instance` object points to
  // Copy properties, view and watches
  function instantiate_component(instance) {
    console.log("Instantiate", instance._component);
    if (instance._component._view) {
      console.log("  copy view", instance._component._view);
      instance.appendChild(instance._component._view.cloneNode(true));
      console.log("  view =", instance._view);
    }
  }

  function render_instance(instance) {
    if (instance._view && instance._target) {
      console.log("Render", instance);
      instance._view._roots = render_children(instance._view, instance._target)
        .filter(function (ch) { ch != null });
    }
  }

  function render_children(view, target) {
    return A.map.call(view.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE) {
        if (ch.namespaceURI === bender.ns) {
          if (ch.localName === "instance") {
            instance._target = target;
          } else {
            console.warn("Unexpected Bender element {0} in view; skipped."
              .fmt(ch.localName));
          }
        } else {
          var t = target.appendChild(
            target.ownerDocument.createElementNS(ch.namespaceURI,
              ch.localName));
          render_children(ch, t);
          return t;
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        return target.appendChild(
          target.ownerDocument.createTextNode(ch.textContent));
      }
    });
  }


  // View methods

  prototypes.view.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "instance") {
        ch._target = this.parentNode._target;
      }
    }
    return wrap_element(ch, prototypes.view);
  };

}(window.bender = {}))
