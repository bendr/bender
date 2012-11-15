(function (bender) {
  "use strict";

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // The context stores the definitions on the components, indexed by their URI,
  // as well as the instance hierarchy of rendered components.
  var context = {};

  // Initialize the context for the given host document
  context.init = function (host, instances, loaded) {
    this.host = host;
    this.instances = [];
    this.loaded = {};
    // Top component with the URI of the host document (for components created
    // programmatically)
    this.loaded[flexo.normalize_uri(host.baseURI, "")] =
      this.$("bender:component");
    return this;
  };

  // Create elements for the context by wrapping them with Bender functions
  // TODO bender namespace by default
  context.$ = function () {
    var e = wrap_element(flexo.create_element.apply(this.document,
          arguments));
    e.context = this;
    return e;
  };

  // Add a top-level instance to the context and render it in the given target
  // (inserted before the ref or appended)
  context.add_instance = function (instance, target, ref) {
    this.instances.push(instance);
    instance.render(target, ref);
  };

  // Load a component definition for an instanceI. While a file is being
  // loaded, store all instances that are requesting it; once it's loaded,
  // store the loaded component itself.
  context.load_component = function (instance) {
    var split = uri.split("#");
    var locator = flexo.normalize_uri(instance.uri, split[0]);
    // TODO keep track of id's to load components inside components
    // var id = split[1];
    if (loaded[locator] instanceof window.Node) {
      flexo.notify(instance, "@loaded", { uri: locator,
        definition: loaded[locator] });
    } else if (Array.isArray(loaded[locator])) {
      loaded[locator].push(instance);
    } else {
      loaded[locator] = [instance];
      flexo.ez_xhr(locator, { responseType: "document" }, function (req) {
        var ev = { uri: uri, req: req };
        if (req.status !== 0 && req.status !== 200) {
          ev.message = "HTTP error {0}".fmt(req.status);
          flexo.notify(instance, "@error", ev);
        } else if (!req.response) {
          ev.message = "could not parse response as XML";
          flexo.notify(instance, "@error", ev);
        } else {
          var c = context.import_node(req.response.documentElement, uri);
          if (is_bender_element(c, "component")) {
            ev.component = c;
            loaded[locator].forEach(function (i) {
              flexo.notify(i, "@loaded", ev);
            });
            loaded[locator] = c;
          } else {
            ev.message = "not a Bender component";
            flexo.notify(instance, "@error", ev);
          }
        }
      });
    }
  };

  // Import a node in the context (for loaded components)
  context.import_node = function (node, uri) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      var n = wrap_element(this.host.createElementNS(node.namespaceURI,
            node.localName));
      if (is_bender_element(n, "component")) {
        n.uri = uri;
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
        var ch_ = this.import_node(ch, uri);
        if (ch_) {
          n.appendChild(ch_);
        }
      }, this);
      return n;
    }
    if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      return this.host.createTextNode(node.textContent)
    }
  };

  // Create a new Bender context for the given host document (window.document by
  // default.)
  bender.create_context = function (host) {
    return Object.create(context).init(host || window.document);
  };


  // Instances
  var instance = {};

  instance.init = function (component) {
    this.component = component;
    return this;
  };

  // Render this instance in a fresh placeholder, and return the placeholder.
  // Actual rendering may be delayed if the component is not loaded yet but the
  // placeholder can be inserted in its place immediately. Send a notification
  // that rendering has started (@rendering); a notification that rendering has
  // ended will be sent as well (@rendered)
  instance.render = function (dest, ref) {
    this.views = {};
    this.instances = { $self: this };
    this.edges = [];
    this.properties = {};
    var placeholder = dest.ownerDocument.createElementNS(bender.ns,
        "placeholder");
    dest.insertBefore(placeholder, ref);
    flexo.notify(this, "@rendering");
    // Keep track of pending instances (see _finished_rendering below),
    // including self
    this.__pending = [this];
    var render = function () {
      this.setup_properties();
      if (this.component.view) {
        if (this.component.view.firstElementChild) {
          this.render_node(this.component.view.firstElementChild,
            placeholder);
          dest.insertBefore(placeholder.firstElementChild, placeholder);
        }
        dest.removeChild(placeholder);
      }
      this.finished_rendering(this);
    };
    if (this.component) {
      render.call(this);
    } else {
      this.load_component(render);
    }
    return this.placeholder;
  };

  instance.render_node = function (node, dest) {
    if node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        if (node.localName === "component") {
          this.render_child_instance(node, dest);
        } else if (node.localName === "content") {
          var from_element = this.parent && this.parent.element;
          if (from_element && from_element.childNodes.length > 0) {
            this.render_children(from_element, dest);
          } else {
            this.render_children(ch, dest, unique);
          }
        } else {
          console.warn("[render_node] Unexpected Bender element {0} in view"
              .fmt(node.localName);
        }
      } else {
        this.render_foreign(node, dest);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      this.render_text(node, dest);
    }
  };

  instance.render_foreign = function (elem, dest) {
    var d = dest.appendChild(
        dest.ownerDocument.createElementNS(elem.namespaceURI, elem.localName));
    A.forEach.call(elem.attributes, function (attr) {
      var val = attr.value;
      if ((attr.namespaceURI === flexo.ns.xml || !attr.namespaceURI) &&
        attr.localName === "id") {
        this.views[val.trim()] = d;
      } else if (attr.namespaceURI &&
        attr.namespaceURI !== node.namespaceURI) {
        if (!this.bind_attr(d, attr)) {
          d.setAttributeNS(attr.namespaceURI, attr.localName,
            flexo.format.call(this, val, this.properties));
        }
      } else {
        if (!this.bind_attr(d, attr)) {
          d.setAttribute(attr.localName,
            flexo.format.call(this, val, this.properties));
        }
      }
    }, this);
    this.render_children(elem, d);
  };

  instance.render_text = function (node, dest) {
    var d = dest
      .appendChild(dest.ownerDocument.createTextNode(node.textContent));
    if (!this.bind_text(d)) {
      d.textContent =
        flexo.format.call(this, node.textContent, this.properties);
    }
  };

  // Render child instances
  // TODO handle attributes beside href and id
  instance.render_child_instance = function (elem, dest) {
    var child_instance = this.add_child_instance(elem);

    this.__pending.push(child_instance);
    dest.appendChild(child_instance._render(dest));
    if (template._id) {
      this._instances[template._id] = child_instance;
    }
    Object.keys(template._values).forEach(function (p) {
      this._unprop_prop(child_instance, p, template._values[p]);
    }, this);
  };

  instance.render_children = function (node, dest) {
    A.forEach.call(node.childNodes, function (ch) {
      this.render_node(ch, dest);
    }, this);
  }

  // Bender elements overload some DOM methods in order to track changes to the
  // tree.

  var prototypes = {
    // Default overloaded DOM methods for Bender elements
    "": {
      // Make sure that an overloaded insertBefore() is called for appendChild()
      appendChild: function (ch) {
        return this.insertBefore(ch, null);
      },
    }
  };

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
    if (typeof e.init === "function") {
      e.init();
    }
    return e;
  }

  ["component"
  ].forEach(function (p) {
    prototypes[p] = {};
  });

  prototypes.component.init = function () {
    this.properties = [];  // child property elements; will add the view
    this.instance = [];    // instances of the component
  };

  prototypes.component.create_instance = function () {
    var instance = Object.create(instance).init(this);
    this.instances.push(instance);
    return this.instance;
  };

  prototypes.component.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch)) {
      if (ch.localName === "view") {
        if (this.view) {
          console.error("Multiple views for component", this);
        } else {
          this.view = ch;
        }
      } else if (ch.localName === "property") {
        this.properties.push(ch);
      }
    }
    return ch;
  };

  prototypes.component.removeChild = function (ch) {
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this.view === ch) {
          delete this._view;
        }
      } else if (ch.localName === "property") {
        flexo.remove_from_array(this.properties, ch);
      }
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };

  // Test whether the given node is an element in the Bender namespace with the
  // given name (or just a Bender node if no name is given)
  function is_bender_element(node, name) {
    return node instanceof window.Node &&
      node.nodeType === window.Node.ELEMENT_NODE &&
      node.namespaceURI === bender.ns &&
      (name === undefined || node.localName === name);
  }

  /*

  // Context element methods (the view at the top of the tree, not to be
  // confused with the context document)

  // Add instances to the context and render them in the context target
  prototypes.context.insertBefore = function (ch, ref) {
    if (is_bender_element(ch, "instance")) {
      Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
      ch._uri = this.ownerDocument._uri;
      var placeholder = ch._render(this._target);
      this._target.insertBefore(placeholder, ref && ref._placeholder);
      this.ownerDocument._instances.push(ch);
      return ch;
    } else {
      console.warn("Unexpected element in context:", ch);
    }
  };

  prototypes.context.removeChild = function (ch) {
    if (is_bender_element(ch, "instance")) {
      // TODO unrender
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };


  // Instance methods
  // Status of an instance:
  //   ._uri: base URI
  //   ._href: has a reference to a component
  //   ._component: if set, then loaded; otherwise, not ready

  prototypes.instance._init = function (component) {
    this._children = [];
    this._values = {};
    // Set the component: instantiate and render it (it is already loaded)
    Object.defineProperty(this, "_component", { enumerable: true,
      get: function () { return component; },
      set: function (c) {
        if (component !== c) {
          component = c;
        }
      }
    });
  };

  // Initialize properties defined by their <property> element
  // TODO <property> as children of the instance as well
  prototypes.instance._setup_properties = function () {
    this._set = {};
    this._component._properties.forEach(function (property) {
      var value;
      this._set[property._name] = function (v) {
        if (typeof v === "string") {
          v = property._get_value(v, this);
        }
        if (v !== value) {
          var prev = value;
          value = v;
        }
      };
      var instance = this;
      Object.defineProperty(this._properties, property._name, {
        enumerable: true,
        get: function () { return value; },
        set: function (v) {
          instance._set[property._name].call(instance, v);
          traverse_graph(instance._edges.filter(function (e) {
            return e.property === property._name;
          }));
        }
      });
      this._unprop_value(property);
    }, this);
  };

  // Extract properties from an attribute
  prototypes.instance._unprop_attr = function (node, attr) {
    var pattern = attr.value;
    var edge = {
      parent_instance: this,
      view: node,
      attr: attr.localName,
      value: pattern
    };
    if (attr.namespaceURI && attr.namespaceURI !== node.namespaceURI) {
      edge.ns = attr.namespaceURI;
    }
    return this._unprop(pattern, edge);
  };

  // Extract properties from a property value on an instance element
  prototypes.instance._unprop_prop = function (instance, property, value) {
    return this._unprop(value, {
      parent_instance: this,
      instance: instance,
      property: property,
      value: value
    });
  }

  // Extract properties from a text node
  prototypes.instance._unprop_text = function (node) {
    var pattern = node.textContent;
    return this._unprop(pattern,
        { parent_instance: this, view: node, value: pattern });
  };

  // Extract properties from the value of a property
  prototypes.instance._unprop_value = function (property) {
    var pattern = property._value;
    return this._unprop(pattern, {
      parent_instance: this,
      instance: this,
      property: property._name,
      value: pattern
    });
  };

  // Extract properties from a text node or an attribute given a pattern and the
  // corresponding set action. If properties are found in the pattern, then add
  // a new watch
  prototypes.instance._unprop = function (pattern, set_edge) {
    var props = this._extract_props(pattern);
    if (props.length > 0) {
      var watch = { enabled: true, edges: [set_edge] };
      props.forEach(function (p) {
        this._edges.push({ property: p, watch: watch, instance: this });
      }, this);
      return true;
    }
  };

  // Extract a list of properties for a pattern. Only properties that are
  // actually defined are extracted.
  prototypes.instance._extract_props = function (pattern) {
    var props = {};
    if (typeof pattern === "string") {
      var open = false;
      var prop;
      pattern.split(/(\{|\}|\\[{}\\])/).forEach(function (token) {
        if (token === "{") {
          prop = "";
          open = true;
        } else if (token === "}") {
          if (open) {
            if (this._properties.hasOwnProperty(prop)) {
              props[prop] = true;
            }
            open = false;
          }
        } else if (open) {
          prop += token.replace(/^\\([{}\\])/, "$1");
        }
      }, this);
    }
    return Object.keys(props);
  };

  // Initialize all non-dynamic properties
  // TODO sort edges to do initializations in the correct order
  prototypes.instance._init_properties = function () {
    var instance = this._template || this;
    this._component._properties.forEach(function (property) {
      if (instance._values.hasOwnProperty(property._name)) {
        this._properties[property._name] =
          flexo.format.call(this, instance._values[property._name],
            this._properties);
      } else if (property._value !== undefined) {
        if (property._type === "dynamic") {
          var props = this._extract_props(property._value);
          if (props.length > 0) {
            return;
          }
        }
        this._properties[property._name] =
          flexo.format.call(this, property._value, this._properties);
      }
    }, this);
  };

  // instance has finished rendering, so it can be removed from the current list
  // of pending instances. When the list is empty, the instance is completely
  // rendered so we can send the @rendered event, and tell the parent instance,
  // if any, to take it of its pending list.
  prototypes.instance._finished_rendering = function(instance) {
    var removed = flexo.remove_from_array(this.__pending, instance);
    if (this.__pending.length === 0) {
      delete this.__pending;
      this._views.$root = find_root(this._placeholder);
      this._views.$document = this._placeholder.ownerDocument;
      this._render_edges();
      this._init_properties();
      flexo.notify(this, "@rendered");
      if (this._parent) {
        this._parent._finished_rendering(this);
      }
    }
  };

  // Get the value for an edge given an instance and a default value (may be
  // undefined; e.g. for get edges.) The `set` flag indicates that this is a set
  // edge, which ignores the `property` property. Set the __value placeholder on
  // the edge to provide a value (it is then deleted); otherwise try the `value`
  // property, then the `property` property. String values are interpolated from
  // the instance properties.
  // TODO use type like properties
  function edge_value(edge, set, val) {
    if (edge.hasOwnProperty("__value")) {
      val = edge.__value;
      delete edge.__value;
    } else if (edge.hasOwnProperty("value")) {
      val = flexo.format.call(edge.parent_instance, edge.value,
          edge.parent_instance._properties);
    } else if (!set && edge.property) {
      val = edge.instance._properties[edge.property];
    }
    if (typeof edge.action === "function" && !edge.hasOwnProperty("value")) {
      val = edge.action.call(edge.parent_instance, val, edge);
    }
    return val;
  }

  // Follow a set edge from a get edge, and push all corresponding get edges for
  // the rest of the traversal
  function follow_set_edge(get, set, edges, get_value) {
    var delay = set.hasOwnProperty("delay") &&
      parseFloat(flexo.format.call(get.instance, set.delay,
            get.instance._properties));
    var follow = function () {
      var set_value = edge_value(set, true, get_value);
      if (set_value !== undefined) {
        if (set.instance) {
          if (set.property) {
            if (typeof delay === "number" && delay >= 0) {
              set.instance._properties[set.property] = set_value;
            } else {
              set.instance._set[set.property](set_value);
              A.push.apply(edges, set.instance._edges.filter(function (e) {
                return e.property === set.property && edges.indexOf(e) < 0;
              }));
            }
          }
        } else if (set.view) {
          if (set.attr) {
            if (set.ns) {
              set.view.setAttributeNS(set.ns, set.attr, set_value);
            } else {
              set.view.setAttribute(set.attr, set_value);
            }
          } else if (set.property) {
            set.view[set.property] = set_value;
          } else {
            set.view.textContent = set_value;
          }
        }
      }
      if (set.hasOwnProperty("event")) {
        if (get_value instanceof window.Event) {
          get_value = { dom_event: get_value };
        }
        flexo.notify(set.instance || set.view, set.event, get_value);
      }
    };
    if (typeof delay === "number" && delay >= 0) {
      if (get.instance.__timeout) {
        clearTimeout(get.instance.__timeout);
      }
      get.instance.__timeout = setTimeout(function () {
        follow();
        delete get.instance.__timeout;
      }, delay);
    } else {
      follow();
    }
  }

  // Traverse the graph of watches starting with an initial set of edges
  // TODO depth-first traversal of the graph?
  function traverse_graph(edges) {
    for (var i = 0; i < edges.length; ++i) {
      var get = edges[i];
      if (get.watch.enabled && !get.__active) {
        get.__active = true;
        var active = typeof get.when !== "function" ||
          get.when.call(get.instance);
        if (active) {
          get.cancel = function () {
            active = false;
          };
          var get_value = edge_value(get);
          if (active) {
            get.watch.edges.forEach(function (set) {
              follow_set_edge(get, set, edges, get_value);
            });
          }
          delete get.cancel;
        }
      }
    }
    edges.forEach(function (edge) {
      delete edge.__active;
    });
  }

  // When the instance has finished rendering, we render its edges
  prototypes.instance._render_edges = function (instance) {
    this._component._watches.forEach(function (watch) {
      // Create a watch node for this watch element
      var w = { enabled: true, edges: [] };
      watch._gets.forEach(function (get) {
        var edge = this._make_edge(get);
        if (!edge) {
          return;
        }
        edge.watch = w;
        if (!edge.instance) {
          edge.instance = this;
        }
        (edge.instance || this)._edges.push(edge);
        // Set the event listeners to start graph traversal. We don't need to
        // worry about properties because they initiate traversal on their own
        var h = function (e) {
          if (!edge.__active) {
            edge.__value = e;
            traverse_graph([edge]);
          }
        };
        if (edge.dom_event) {
          edge.view.addEventListener(edge.dom_event, h, false);
        } else if (edge.event) {
          flexo.listen(edge.view || edge.instance, edge.event, h);
        }
      }, this);
      watch._sets.forEach(function (set) {
        var edge = this._make_edge(set);
        if (edge) {
          w.edges.push(edge);
        }
      }, this);
    }, this);
  };

  // Make an edge for a get or set element
  prototypes.instance._make_edge = function (elem) {
    var edge = { parent_instance: this };
    if (elem._view) {
      edge.view = this._views[elem._view];
      if (!edge.view) {
        console.error("No view \"{0}\" for".fmt(elem._view), elem);
        return;
      }
    }
    if (elem._instance) {
      edge.instance = this._instances[elem._instance];
      if (!edge.instance) {
        console.error("No instance \"{0}\" for".fmt(elem._instance), elem);
        return;
      }
    } else {
      edge.instance = this;
    }
    ["action", "attr", "delay", "dom_event", "event", "property", "value",
      "when"
    ].forEach(function (p) {
      if (elem.hasOwnProperty("_" + p)) {
        edge[p] = elem["_" + p];
      }
    });
    if (edge.dom_event && !edge.view) {
      edge.view = this.$document;
    }
    return edge;
  };

  prototypes.instance._load_component = function (k) {
    if (this._href && !this._component) {
      flexo.listen_once(this, "@loaded", function (e) {
        e.source._component = e.component;
        k.call(e.source);
      });
      flexo.listen_once(this.ownerDocument, "@error", function (e) {
        console.error("Error loading component at {0}: {1}"
          .fmt(e.uri, e.message), e.source);
      });
      this.ownerDocument._load_component(this._href, this);
    }
  };

  prototypes.instance._add_child_instance = function(template) {
    var instance = this.ownerDocument.$("instance");
    instance._template = template;
    instance._parent = this;
    this._children.push(instance);
    instance._uri = component_of(template)._uri;
    instance._href = template._href;
    instance._component = template._component;
    return instance;
  };

  // Keep track of href and id; anything else is considered as a value for a
  // property
  prototypes.instance.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "href") {
      this._href = value.trim();
    } else if (name === "id") {
      this._id = value.trim();
    } else {
      this._values[name] = value;
    }
  };

  prototypes.instance.insertBefore = prototypes.component.insertBefore;

  // Return an absolute URI with this instance's component as the base for the
  // given URI
  prototypes.instance._absolute_uri = function (uri) {
    return flexo.absolute_uri(this._uri, uri);
  };


  // Properties

  // Property type map with the corresponding evaluation function
  var property_types = {
    "boolean": flexo.is_true,
    "dynamic": function (value) {
      try {
        if (!/\n/.test(value)) {
          value = "return " + value;
        }
        return new Function(value).call(this);
      } catch (e) {
        console.error("Error evaluating dynamic property \"{0}\": {1}"
            .fmt(value, e.message));
      }
    },
    "number": parseFloat,
    "object": function (value) {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.error("Could not parse \"{0}\" as JSON: {1}"
          .fmt(value, e.message));
      }
    },
    "string": flexo.id
  };


  prototypes.property._init = function () {
    this._value = "";
    this._type = "string";
  };

  prototypes.property.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      this._value = this.textContent;
    }
  };

  prototypes.property.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "name") {
      this._name = value.trim();
    } else if (name === "type") {
      this._set_type(value);
    } else if (name === "value") {
      this._value = value;
    }
  };

  prototypes.property._textContent = function (t) {
    this.textContent = t;
    this._value = t;
  };

  // Get the parsed value for the property
  prototypes.property._get_value = function (v, instance) {
    var that = this._type === "eval" || this._type === "dynamic" ?
      instance : instance._properties;
    return property_types[this._type]
      .call(that, v === undefined ? this._value : v);
  };

  prototypes.property._set_type = function (type) {
    type = type.trim().toLowerCase();
    if (type in property_types) {
      this._type = type;
    }
  }


  // Target methods

  prototypes.target.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "q") {
      this._q = value.trim();
    } else if (name === "unique") {
      this._unique = flexo.is_true(value);
    }
  };

  // Find the target element given the `q` attribute using querySelector on the
  // destination element. If no `q` is set, just return the dest. Be careful
  // that the target may not be found
  prototypes.target._find_target = function (dest) {
    if (this._q) {
      return dest.ownerDocument.querySelector(this._q);
    }
    return dest;
  };

  // Watch, get and set elements

  prototypes.watch._init = function () {
    this._gets = [];
    this._sets = [];
    this._watches = [];
  };

  prototypes.watch.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "get") {
        this._gets.push(ch);
      } else if (ch.localName === "set") {
        this._sets.push(ch);
      } else if (ch.localName === "watch") {
        this._watches.push(ch);
      }
    }
  };

  // Get and set

  prototypes.get.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      this._update_action();
    }
    return ch;
  };

  prototypes.get.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "event" || name === "instance" || name === "property" ||
        name === "view") {
      this["_" + name] = value.trim();
    } else if (name === "dom-event") {
      this._dom_event = value.trim();
    } else if (name === "once") {
      this._once = flexo.is_true(value);
    } else if (name === "when") {
      try {
        this._when = new Function("return " + value);
      } catch(e) {
        console.error("Could not compile when predicate for", this);
      }
    }
  };

  prototypes.get._textContent = function (t) {
    this.textContent = t;
    this._update_action();
  };

  // Update the action: make a new function from the text content of the
  // element. If it has no content or there were compilation errors, default
  // to the id function
  prototypes.get._update_action = function () {
    if (/\S/.test(this.textContent)) {
      try {
        this._action = new Function("value", "get", this.textContent);
      } catch (e) {
        console.error("Could not compile action \"{0}\": {1}"
            .fmt(this.textContent, e.message));
        delete this._action;
      }
    } else {
      delete this._action;
    }
  };

  prototypes.set.insertBefore = prototypes.get.insertBefore;
  prototypes.set._textContent = prototypes.get._textContent;
  prototypes.set._update_action = prototypes.get._update_action;

  prototypes.set.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "delay" || name === "event" || name === "instance" ||
        name === "property" || name === "view" || name === "value") {
      this["_" + name] = value.trim();
    } else if (name === "dom-event") {
      this._dom_event = value.trim();
    } else if (name === "when") {
      try {
        this._when = new Function("return " + value);
      } catch(e) {
        console.error("Could not compile when predicate for", this);
      }
    }
  };

  // Utility functions

  function find_root(elem) {
    var queue = [elem];
    while (queue.length > 0) {
      var e = queue.shift();
      if (e.nodeType === window.Node.ELEMENT_NODE &&
          e.namespaceURI !== bender.ns) {
        return e;
      }
      A.unshift.apply(queue, e.childNodes);
    }
  }

  function component_of(elem) {
    if (is_bender_element(elem, "component")) {
      return elem;
    }
    if (elem.parentNode) {
      return component_of(elem.parentNode);
    }
  }

*/
}(window.bender = {}))
