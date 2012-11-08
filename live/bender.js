(function (bender) {
  "use strict";

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Create a rendering contest given a target element in a host document (using
  // the document element as a default.)
  bender.create_context = function (target) {
    target = target || document.documentElement;
    var host_doc = target.ownerDocument;
    var context = host_doc.implementation.createDocument(bender.ns, "context",
      null);
    context._uri = host_doc.baseURI;

    // Wrap all new elements created in this context
    context.createElement = function (name) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            bender.NS, name));
    };
    context.createElementNS = function (ns, qname) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            ns, qname));
    };

    // Loaded URI's
    var loaded = {};
    loaded[flexo.normalize_uri(context._uri, "")] = context.documentElement;

    // Load the component at the given URI for the instance
    context._load_component = function (uri, instance) {
      var split = uri.split("#");
      var locator = flexo.normalize_uri(instance._uri, split[0]);
      var id = split[1];
      if (loaded[locator]) {
        flexo.notify(context, "@loaded", { uri: locator,
          component: loaded[locator] });
      } else {
        flexo.ez_xhr(uri, { responseType: "document" }, function (req) {
          var ev = { uri: locator, req: req };
          if (req.status !== 0 && req.status !== 200) {
            ev.message = "HTTP error {0}".fmt(req.status);
            flexo.notify(instance, "@error", ev);
          } else if (!req.response) {
            ev.message = "could not parse response as XML";
            flexo.notify(instance, "@error", ev);
          } else {
            var c = context._import_node(req.response.documentElement, locator);
            if (is_bender_element(c, "component")) {
              loaded[locator] = c;
              ev.component = c;
              flexo.notify(instance, "@loaded", ev);
            } else {
              ev.message = "not a Bender component";
              flexo.notify(instance, "@error", ev);
            }
          }
        });
      }
    };

    // Import a node in the context (for loaded components)
    context._import_node = function (node, uri) {
      if (node.nodeType === window.Node.ELEMENT_NODE) {
        var n = this.createElementNS(node.namespaceURI, node.localName);
        if (is_bender_element(n, "component")) {
          n._uri = uri;
        }
        A.forEach.call(node.attributes, function (attr) {
          if (attr.namespaceURI) {
            if (attr.namespaceURI === flexo.ns.xmlns &&
                attr.localName !== "xmlns") {
              n.setAttribute("xmlns:" + attr.localName, attr.nodeValue);
            } else {
              n.setAttributeNS(attr.namespaceURI, attr.localName,
                attr.nodeValue);
            }
          } else {
            n.setAttribute(attr.localName, attr.nodeValue);
          }
        });
        A.forEach.call(node.childNodes, function (ch) {
          var ch_ = this._import_node(ch, uri);
          if (ch_) {
            n.appendChild(ch_);
          }
        }, this);
        return n;
      }
      if (node.nodeType === window.Node.TEXT_NODE ||
          node.nodeType === window.Node.CDATA_SECTION_NODE) {
        return this.createTextNode(node.textContent)
      }
    };

    context.$ = flexo.create_element.bind(context);
    var view = wrap_element(context.documentElement);
    view._target = target;
    return context;
  };


  // Bender elements overload some DOM methods in order to track changes to the
  // tree.

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


  // Component methods

  prototypes.component._init = function () {
    this._properties = [];
    this._instances = [];
    this._url = "";
  };

  // Convenience method to create a new instance of that component
  prototypes.component._create_instance = function () {
    var instance = this.ownerDocument.$("instance");
    instance._component = this;
    return instance;
  };

  prototypes.component.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this._view) {
          console.error("Multiple views for component", this);
        } else {
          this._view = ch;
          this._instances.forEach(function (instance) {
            instance._view = ch;
          });
        }
      } else if (ch.localName === "property") {
        this._properties.push(ch);
      }
    }
    return ch;
  };

  prototypes.component.removeChild = function (ch) {
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this._view === ch) {
          delete this._view;
          this._instances.forEach(function (instance) {
            delete instance._view;
          });
        }
      } else if (ch.localName === "property") {
        flexo.remove_from_array(this._properties, ch);
      }
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };


  // Context methods

  // Add instances to the context and render them in the target
  prototypes.context.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch, "instance")) {
      ch._uri = this.ownerDocument._uri;
      ch._target = this._target;
    }
    return ch;
  };

  prototypes.context.removeChild = function (ch) {
    if (is_bender_element(ch, "instance")) {
      ch._target = null;
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
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
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "href") {
      this._href = value;
      this._load_component();
    }
  };

  prototypes.instance.insertBefore = prototypes.component.insertBefore;

  prototypes.instance._load_component = function () {
    if (this._uri && this._href && !this._component) {
      flexo.listen_once(this, "@loaded", function (e) {
        this._component = e.component;
      }.bind(this));
      flexo.listen_once(this.ownerDocument, "@error", function (e) {
        console.error("Error loading component at {0}: {1}"
          .fmt(e.uri, e.message));
      });
      this._component = this.ownerDocument._load_component(this._href, this);
    }
  };

  // Instantiate the component that the `instance` object points to
  // Copy properties, view and watches; the copy will really just be a pointer
  // until the instance itself changes it.
  function instantiate_component(instance) {
    instance._properties = instance._component._properties.slice();
    instance._view = instance._component._view;
    instance._component._instances.push(instance);
    instance._roots = [];
  }

  // Render instance to its current target; if the target is null, unrender it.
  function render_instance(instance) {
    instance._load_component();
    if (instance._view && instance._target) {
      A.push.apply(instance._roots,
          render_children(instance._view, instance._target));
    } else if (instance._target == null) {
      instance._roots.forEach(flexo.safe_remove);
      instance._roots = [];
    }
  }

  function render_children(view, target) {
    var roots = [];
    A.forEach.call(view.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE) {
        if (ch.namespaceURI === bender.ns) {
          if (ch.localName === "instance") {
            ch._target = target;
            A.push.apply(roots, ch._target.roots);
          } else {
            console.warn("Unexpected Bender element {0} in view; skipped."
              .fmt(ch.localName));
          }
        } else {
          var t = target.appendChild(
            target.ownerDocument.createElementNS(ch.namespaceURI,
              ch.localName));
          A.forEach.call(ch.attributes, function (attr) {
            t.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
          });
          render_children(ch, t);
          roots.push(t);
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        var t = target.appendChild(
          target.ownerDocument.createTextNode(ch.textContent));
        roots.push(t);
      }
    });
    return roots;
  }


  // View methods

  prototypes.view.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "instance" && this.parentNode) {
        ch._target = this.parentNode._target;
      }
      return ch;
    }
    return wrap_element(ch, prototypes.view);
  };

  prototypes.view.removeChild = function (ch) {
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };


  // Utility functions

  // Test whether the given node is an element in the Bender namespace with the
  // given name
  function is_bender_element(node, name) {
    return node instanceof window.Node &&
      node.nodeType === window.Node.ELEMENT_NODE &&
      node.namespaceURI === bender.ns &&
      node.localName === name;
  }

  // Extend an element with Bender methods, calls its _init() method, and return
  // the wrapped element.
  function wrap_element(e, proto) {
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

}(window.bender = {}))
