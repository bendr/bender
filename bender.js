(function (bender) {
  "use strict";

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Extend this with custom instances, &c.
  bender.$ = {};

  // The context stores the definitions on the components, indexed by their URI,
  // as well as the instance hierarchy of rendered components.
  var context = {};

  // Initialize the context for the given host document (this.document); keep
  // track of instance tree roots (this.instance) and loaded URIs (this.loaded)
  context.init = function (host) {
    this.document = host;
    this.instances = [];
    this.loaded = {};
    return this;
  };

  // Add a top-level instance to the context and render it in the given target
  // (inserted before the ref or added as the last child)
  context.add_instance = function (instance, target, ref) {
    this.instances.push(instance);
    instance.render(target, ref);
  };

  // Create a new component element with some attributes
  context.create_component = function (attrs) {
    var component = this.wrap_element(this.document.createElementNS(bender.ns,
          "component"));
    component.uri = this.document.baseURI;
    if (typeof attrs === "object") {
      Object.keys(attrs).forEach(function (attr) {
        var a = attr.split(":");
        if (a[1]) {
          var ns = flexo.ns[a[0]];
          if (!ns) {
            console.error("Unknown namespace prefix {0} for {1}=\"{2}\""
              .fmt(a[0], attr, attrs[a]));
          } else {
            component.setAttributeNS(a[0], a[1], attrs[attr]);
          }
        }
        component.setAttribute(attr, attrs[attr]);
      });
    }
    return component;
  };

  // Call with keywords "reference", "template", or both
  bender.create_instance = function (args) {
    var instance = Object.create(bender.instance);
    for (var a in args) {
      if (args.hasOwnProperty(a)) {
        instance[a] = args[a];
      }
    }
    // TODO: keep track of instances
    return instance;
  };

  context.$ = function () {
    return this.wrap_element(flexo.create_element.apply(this.document,
          arguments));
  };

  // Load a component definition for an instanceI. While a file is being
  // loaded, store all instances that are requesting it; once it's loaded,
  // store the loaded component itself.
  context.load_component = function (uri, instance) {
    var split = uri.split("#");
    var locator = flexo.normalize_uri(instance.reference.uri, split[0]);
    // TODO keep track of id's to load components inside components
    // var id = split[1];
    if (this.loaded[locator] instanceof window.Node) {
      flexo.notify(instance, "@loaded", { uri: locator,
        component: this.loaded[locator] });
    } else if (Array.isArray(this.loaded[locator])) {
      this.loaded[locator].push(instance);
    } else {
      this.loaded[locator] = [instance];
      flexo.ez_xhr(locator, { responseType: "document" }, function (req) {
        var ev = { uri: locator, req: req };
        if (req.status !== 0 && req.status !== 200) {
          ev.message = "HTTP error {0}".fmt(req.status);
          flexo.notify(instance, "@error", ev);
        } else if (!req.response) {
          ev.message = "could not parse response as XML";
          flexo.notify(instance, "@error", ev);
        } else {
          var c = this.import_node(req.response.documentElement, locator);
          if (is_bender_element(c, "component")) {
            ev.component = c;
            this.loaded[locator].forEach(function (i) {
              flexo.notify(i, "@loaded", ev);
            });
            this.loaded[locator] = c;
          } else {
            ev.message = "not a Bender component";
            flexo.notify(instance, "@error", ev);
          }
        }
      }.bind(this));
    }
  };

  // Import a node in the context (for loaded components)
  context.import_node = function (node, uri) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      var n = this.wrap_element(this.document.createElementNS(node.namespaceURI,
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
      return this.document.createTextNode(node.textContent)
    }
  };

  // Update the URI of a component for the loaded map
  context.updated_uri = function (component, prev_uri) {
    if (component.uri !== prev_uri && this.loaded[prev_uri] === component) {
      delete this.loaded[prev_uri];
      if (!this.loaded[component.uri]) {
        this.loaded[component.uri] = component;
      }
    }
  };

  // Extend an element with Bender methods, calls its _init() method, and return
  // the wrapped element.
  context.wrap_element = function (e, proto) {
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
    e.context = this;
    if (typeof e.init === "function") {
      e.init();
    }
    return e;
  }

  // Create a new Bender context for the given host document (window.document by
  // default.)
  bender.create_context = function (host) {
    return Object.create(context).init(host || window.document);
  };

  bender.instance = {};

  // Add a new child instance
  // TODO check that the rendered instance is the same as the instance!
  bender.instance.add_child_instance = function(component) {
    var child_instance = bender.create_instance({ reference: component });
    child_instance.parent = this;
    this.children.push(child_instance);
    return child_instance;
  };

  // Render this instance in a fresh placeholder, and return the placeholder.
  // Actual rendering may be delayed if the component is not loaded yet but the
  // placeholder can be inserted in its place immediately. Send a notification
  // that rendering has started (@rendering); a notification that rendering has
  // ended will be sent as well (@rendered)
  bender.instance.render = function (dest, ref) {
    flexo.notify(this, "@rendering");
    this.__placeholder = dest.ownerDocument.createElementNS(bender.ns,
        "placeholder");
    dest.insertBefore(this.__placeholder, ref);
    var render = function (with_prototype) {
      if (!with_prototype) {
        var prototype =
          this.reference && this.reference.getAttribute("prototype") ||
          this.template.getAttribute("prototype");
        if (prototype) {
          try {
            var object = eval("Object.create({0})".fmt(prototype));
            if (!bender.instance.isPrototypeOf(object)) {
              throw "not a valid instance";
            }
            object.reference = this.reference;
            object.template = this.template;
            object.original_instance = this;
            object.__placeholder = this.__placeholder;
            if (this.parent) {
              object.parent = this.parent;
              flexo.replace_in_array(this.parent.children, this, object);
              flexo.replace_in_array(this.parent.__pending, this, object);
            }
            return render.call(object, true);
          } catch (e) {
            console.error("could not create instance for prototype \"{0}\""
                .fmt(prototype));
          }
        }
      }
      this.children = [];
      this.views = {};
      this.instances = { $self: this };
      this.edges = [];
      this.properties = {};
      this.init();
      this.setup_properties();
      this.__pending = [this];
      var view = (this.reference && this.reference.view) || this.template.view;
      if (view && view.firstElementChild) {
        this.render_node(view.firstElementChild, this.__placeholder);
      }
      this.finished_rendering(this);
    };
    if (this.template) {
      render.call(this);
    } else if (this.reference) {
      this.load_component(render);
    }
  };

  // Load the component for this instance
  bender.instance.load_component = function (k) {
    if (this.reference && this.reference.href) {
      flexo.listen_once(this, "@loaded", function (e) {
        e.source.template = e.component;
        k.call(e.source);
      });
      flexo.listen_once(this, "@error", function (e) {
        console.error("Error loading component at {0}: {1}"
          .fmt(e.uri, e.message), e.source);
      });
      this.reference.context.load_component(this.reference.href, this);
    }
  };

  // instance has finished rendering, so it can be removed from the current list
  // of pending instances. When the list is empty, the instance is completely
  // rendered so we can send the @rendered event, and tell the parent instance,
  // if any, to take it of its pending list.
  bender.instance.finished_rendering = function(pending) {
    flexo.remove_from_array(this.__pending, pending);
    if (this.__pending.length === 0) {
      delete this.__pending;
      this.views.$document = this.__placeholder.ownerDocument;
      var parent = this.__placeholder.parentNode;
      if (parent) {
        if (this.__placeholder.firstElementChild) {
          this.views.$root = this.__placeholder.firstElementChild;
          parent.insertBefore(this.views.$root, this.__placeholder);
        }
        parent.removeChild(this.__placeholder);
      }
      if (this.reference && this.reference.id) {
        this.reference_instance().instances[this.reference.id] = this;
      }
      this.rendering();
      this.render_edges();
      this.init_properties();
      this.rendered();
      if (this.original_instance) {
        var o = this.original_instance;
        delete this.original_instance;
        flexo.notify(o, "@rendered", { instance: this });
      }
      flexo.notify(this, "@rendered");
      if (this.parent) {
        this.parent.finished_rendering(this);
      }
      delete this.__reference_instance;
    }
  };

  bender.instance.reference_instance = function () {
    for (var top = this.reference; top && top.parentElement;
        top = top.parentElement) {}
    for (var ref = this; ref.template !== top; ref = ref.parent);
    return ref;
  };

  bender.instance.init = function () {};
  bender.instance.rendering = function () {};
  bender.instance.rendered = function () {};

  bender.instance.render_node = function (node, dest) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        if (node.localName === "component") {
          this.render_child_instance(node, dest);
        } else if (node.localName === "content") {
          if (this.reference && this.reference.childNodes.length > 0) {
            this.render_children(this.reference, dest);
          } else {
            this.render_children(node, dest);
          }
        } else {
          console.warn("[render_node] Unexpected Bender element {0} in view"
              .fmt(node.localName));
        }
      } else {
        this.render_foreign(node, dest);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      this.render_text(node, dest);
    }
  };

  bender.instance.render_foreign = function (elem, dest) {
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

  bender.instance.render_text = function (node, dest) {
    var d = dest
      .appendChild(dest.ownerDocument.createTextNode(node.textContent));
    if (!this.bind_text(d)) {
      d.textContent =
        flexo.format.call(this, node.textContent, this.properties);
    }
  };

  // Render child instances
  // TODO handle attributes beside href and id
  bender.instance.render_child_instance = function (component, dest) {
    var child_instance = this.add_child_instance(component);
    this.__pending.push(child_instance);
    child_instance.render(dest);
    if (component.values) {
      Object.keys(component.values).forEach(function (p) {
        this.bind_prop(child_instance, p, component.values[p]);
      }, this);
    }
  };

  bender.instance.render_children = function (node, dest) {
    A.forEach.call(node.childNodes, function (ch) {
      this.render_node(ch, dest);
    }, this);
  };

  // Initialize properties defined by their <property> element
  // TODO <property> as children of the instance as well
  bender.instance.setup_properties = function () {
    this.set_property = {};
    this.template.properties.forEach(this.setup_property, this);
  };

  bender.instance.setup_property = function (property) {
    var value;
    this.set_property[property.name] = function (v) {
      if (v !== value) {
        if (typeof v === "string") {
          v = property.parse_value(v, this);
        }
        var prev = value;
        value = v;
      }
    };
    var instance = this;
    Object.defineProperty(this.properties, property.name, { enumerable: true,
      get: function () { return value; },
      set: function (v) {
        instance.set_property[property.name].call(instance, v);
        traverse_graph(instance.edges.filter(function (e) {
          return e.property === property.name;
        }));
      }
    });
    this.bind_value(property);
  };

  // Extract properties from an attribute
  bender.instance.bind_attr = function (node, attr) {
    var pattern = attr.value;
    var set = {
      parent_instance: this,
      view: node,
      attr: attr.localName,
      value: pattern
    };
    if (attr.namespaceURI && attr.namespaceURI !== node.namespaceURI) {
      set.ns = attr.namespaceURI;
    }
    return this.bind(pattern, set);
  };

  // Extract properties from a property value on an instance element
  bender.instance.bind_prop = function (instance, property, value) {
    return this.bind(value, {
      parent_instance: this,
      instance: instance,
      property: property,
      value: value
    });
  }

  // Extract properties from a text node
  bender.instance.bind_text = function (node) {
    var pattern = node.textContent;
    return this.bind(pattern, {
      parent_instance: this,
      view: node,
      value: pattern
    });
  };

  // Extract properties from the value of a property
  bender.instance.bind_value = function (property) {
    var pattern = property.value;
    return this.bind(pattern, {
      parent_instance: this,
      instance: this,
      property: property.name,
      value: pattern
    });
  };

  // Extract properties from a text node or an attribute given a pattern and the
  // corresponding set action. If properties are found in the pattern, then add
  // a new watch to implement the binding and return true to indicate that a
  // binding was created
  bender.instance.bind = function (pattern, set_edge) {
    var props = this.extract_props(pattern);
    if (props.length > 0) {
      var watch = { edges: [set_edge] };
      props.forEach(function (p) {
        this.edges.push({ property: p, watch: watch, instance: this });
      }, this);
      return true;
    }
  };

  // Extract a list of properties for a pattern. Only properties that are
  // actually defined are extracted.
  bender.instance.extract_props = function (pattern) {
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
            if (this.properties.hasOwnProperty(prop)) {
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

  // When the instance has finished rendering, we render its edges
  // TODO add watches from reference
  bender.instance.render_edges = function (instance) {
    this.template.watches.forEach(function (watch) {
      var w = { edges: [] };
      watch.gets.forEach(function (get) {
        var edge = this.make_get_edge(get);
        if (!edge) {
          return;
        }
        edge.watch = w;
        if (!edge.instance) {
          edge.instance = this;
        }
        edge.instance.edges.push(edge);
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
      watch.sets.forEach(function (set) {
        var edge = this.make_set_edge(set);
        if (edge) {
          w.edges.push(edge);
        }
      }, this);
    }, this);
  };

  bender.instance.make_get_edge = function (elem) {
    var edge = this.make_edge(elem);
    if (edge) {
      if (elem.dom_event) {
        edge.dom_event = elem.dom_event;
        if (!edge.view) {
          edge.view = this.$document;
        }
        return edge;
      } else if (elem.event) {
        edge.event = elem.event;
        return edge;
      } else if (elem.property) {
        edge.property = elem.property;
        return edge;
      }
    }
  };

  bender.instance.make_set_edge = function (elem) {
    var edge = this.make_edge(elem);
    if (edge) {
      if (elem.attr) {
        edge.attr = elem.attr;
      } else if (elem.property) {
        edge.property = elem.property;
      } else if (elem.event) {
        edge.event = elem.event;
      }
    }
    return edge;
  };

  // Make an edge for a get or set element
  bender.instance.make_edge = function (elem) {
    var edge = { parent_instance: this };
    if (elem.view) {
      edge.view = this.views[elem.view];
      if (!edge.view) {
        console.error("No view \"{0}\" for".fmt(elem.view), elem);
        return;
      }
    }
    if (elem.instance) {
      edge.instance = this.instances[elem.instance];
      if (!edge.instance) {
        console.error("No instance \"{0}\" for".fmt(elem.instance), elem);
        return;
      }
    } else {
      edge.instance = this;
    }
    if (elem.action) {
      edge.action = elem.action;
    }
    return edge;
  };

  // Initialize all non-dynamic properties
  // TODO sort edges to do initializations in the correct order
  bender.instance.init_properties = function () {
    this.template.properties.forEach(function (property) {
      if (this.reference &&
        this.reference.values.hasOwnProperty(property.name)) {
        this.properties[property.name] =
          flexo.format.call(this, this.reference.values[property.name],
            this.properties);
      } else if (property.value !== undefined) {
        if (property.as === "dynamic") {
          var props = this.extract_props(property.value);
          if (props.length > 0) {
            return;
          }
        }
        this.properties[property.name] =
          flexo.format.call(this, property.value, this.properties);
      }
    }, this);
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
    }
  };

  ["component", "get", "property", "set", "watch"
  ].forEach(function (p) {
    prototypes[p] = {};
  });

  prototypes.component.init = function () {
    this.properties = [];  // child property elements
    this.watches = [];     // child watch elements
    this.instances = [];   // instances of the component
    this.values = {};      // values given as attributes (TODO properties?)
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
      } else if (ch.localName === "watch") {
        this.watches.push(ch);
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
      } else if (ch.localName === "watch") {
        flexo.remove_from_array(this.watches, ch);
      }
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };

  // TODO handle changes
  prototypes.component.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "href") {
      this.href = value.trim();
    } else if (name === "id") {
      this.id = value.trim();
      var prev_uri = this.uri;
      this.uri = this.uri.replace(/(#.*)?$/, "#" + this.id);
      this.context.updated_uri(this, prev_uri);
    } else if (name === "prototype") {
      this.prototype = value.trim();
    } else {
      this.values[name] = value;
    }
  };

  prototypes.component.removeAttribute = function (name) {
    if (name === "href") {
      delete this.href;
    } else if (name === "id") {
      delete this.id;
      var prev_uri = this.uri;
      this.uri = this.uri.replace(/(#.*)?$/, "");
      this.context.updated_uri(this, prev_uri);
    } else if (name === "prototype") {
      delete this.prototype;
    } else {
      delete this.values[name];
    }
  };

  // Test whether the given node is an element in the Bender namespace with the
  // given name (or just a Bender node if no name is given)
  function is_bender_element(node, name) {
    return node instanceof window.Node &&
      node.nodeType === window.Node.ELEMENT_NODE &&
      node.namespaceURI === bender.ns &&
      (name === undefined || node.localName === name);
  }


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

  prototypes.property.init = function () {
    this.value = "";
    this.as = "string";
  };

  prototypes.property.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "name") {
      this.name = value.trim();
    } else if (name === "as") {
      var as = value.trim().toLowerCase();
      if (as in property_types) {
        this.as = as;
      }
    } else if (name === "value") {
      this.value = value;
    }
  };

  // Get the parsed value for the property
  prototypes.property.parse_value = function (v, instance) {
    var that = this.as === "dynamic" ? instance : instance.properties;
    return property_types[this.as].call(that, v === undefined ? this.value : v);
  };


  prototypes.watch.init = function () {
    this.gets = [];
    this.sets = [];
  };

  prototypes.watch.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch)) {
      if (ch.localName === "get") {
        this.gets.push(ch);
      } else if (ch.localName === "set") {
        this.sets.push(ch);
      }
    }
  };

  prototypes.watch.removeChild = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch)) {
      if (ch.localName === "get") {
        flexo.remove_from_array(this.gets, ch);
      } else if (ch.localName === "set") {
        flexo.remove_from_array(this.sets, ch);
      }
    }
  };


  // Traverse the graph of watches starting with an initial set of edges
  // TODO depth-first traversal of the graph?
  function traverse_graph(edges) {
    for (var i = 0; i < edges.length; ++i) {
      var get = edges[i];
      if (!get.__active) {
        var active = true;
        get.__active = true;
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
    edges.forEach(function (edge) {
      delete edge.__active;
    });
  }

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
          edge.parent_instance.properties);
    } else if (!set && edge.property) {
      val = edge.instance.properties[edge.property];
    }
    if (typeof edge.action === "function" && !edge.hasOwnProperty("value")) {
      val = edge.action.call(edge.parent_instance, val, edge);
    }
    return val;
  }

  // Follow a set edge from a get edge, and push all corresponding get edges for
  // the rest of the traversal
  function follow_set_edge(get, set, edges, get_value) {
    var set_value = edge_value(set, true, get_value);
    if (set_value !== undefined) {
      if (set.instance) {
        if (set.property) {
          if (typeof delay === "number" && delay >= 0) {
            set.instance.properties[set.property] = set_value;
          } else {
            set.instance.set_property[set.property](set_value);
            A.push.apply(edges, set.instance.edges.filter(function (e) {
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
  }

  prototypes.get.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      this.update_action();
    }
    return ch;
  };

  prototypes.get.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "event" || name === "instance" || name === "property" ||
        name === "view" || name === "value") {
      this[name] = value.trim();
    } else if (name === "dom-event") {
      this.dom_event = value.trim();
    }
  };

  prototypes.get.set_textContent = function (t) {
    this.textContent = t;
    this.update_action();
  };

  // Update the action: make a new function from the text content of the
  // element. If it has no content or there were compilation errors, default
  // to the id function
  prototypes.get.update_action = function () {
    if (/\S/.test(this.textContent)) {
      try {
        this.action = new Function("value", "get", this.textContent);
      } catch (e) {
        console.error("Could not compile action \"{0}\": {1}"
            .fmt(this.textContent, e.message));
        delete this.action;
      }
    } else {
      delete this.action;
    }
  };

  prototypes.set.insertBefore = prototypes.get.insertBefore;
  prototypes.set.set_textContent = prototypes.get.set_textContent;
  prototypes.set.update_action = prototypes.get.update_action;

  prototypes.set.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "event" || name === "instance" || name === "property" ||
        name === "view" || name === "value") {
      this[name] = value.trim();
    }
  };

}(window.bender = {}))
