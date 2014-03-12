// Bender core, implementing only the processing model as defined in
// /spec/data-model.html and /spec/processing-model.html. See runtime.js for
// the runtime, XML serialization, and other sorts of syntactic sugar.
// Additional properties are introduced for implementation purposes.

// TODO
// [ ] stack-order for View
// [ ] advanced selectors
// [ ] component.notify()/.message(); node.notify() too?
// [ ] minimize graph
// [ ] compile graph to Javascript
// [ ] pure property on adapters (no side effect); help minimization/compilation

/* global bender, console, exports, flexo, global, require, window */

(function () {
  "use strict";

  if (typeof window === "object") {
    window.bender = {};
  } else {
    global.flexo = require("flexo");
    global.bender = exports;
  }

  bender.version = "0.9";

  // Use bender.trace() for conditional trace messages; set bender.TRACE to true
  // to enable tracing (set to false by default.)
  var _trace = false;
  Object.defineProperty(bender, "TRACE", {
    enumerable: true,
    get: function () {
      return _trace && _trace !== flexo.nop;
    },
    set: function (p) {
      _trace = p ? console.log.bind(console) : flexo.nop;
    }
  });
  Object.defineProperty(bender, "trace", {
    enumerable: true,
    get: function () {
      return _trace;
    }
  });


  // Base for all objects (init and create.)
  bender.Base = {

    // The initializer for a Base object must return the initialized object.
    init: flexo.self,

    // A convenience method to create a new object and initialize it by calling
    // init with the given arguments
    create: function () {
      return this.init.apply(Object.create(this), arguments);
    }
  };


  // Node < Object
  //   Node?    parent
  //   Node*    children
  //   string?  name
  bender.Node = flexo._ext(bender.Base, {

    // Create a new node with no children and no parent.
    init: function () {
      this.children = [];
      this.__clones = [];
      this.__set_id();
      return bender.Base.init.call(this);
    },

    // Set a unique id on the node (for debugging purposes)
    __set_id: function (protoid) {
      var id = (bender.Node.__id++).toString(36).toUpperCase();
      this.__id = protoid ? "%0(%1)".fmt(id, protoid) : id;
      this.__nodes[id] = this;
    },

    // Id number for nodes (used for debugging)
    __id: 0,

    // Find node by ID
    __nodes: {},

    // Insert a child at the end of the list of children and return the added
    // child, or before the ref node if given.
    insert_child: function (child, ref) {
      if (child.parent) {
        throw "Child already has a parent";
      }
      var index = ref && this.children.indexOf(ref) || this.children.length;
      if (index < 0) {
        throw "Reference node wat not found";
      }
      this.children.splice(index, 0, child.is_inserted());
      child.parent = this;
      return child.was_inserted();
    },

    // A convenience method to add a child but return the parent (i.e. self)
    // for easy chaining.
    child: function (child) {
      return this.insert_child(child), this;
    },

    is_inserted: flexo.self,   // called before insertion
    was_inserted: flexo.self,  // called after insertion

    // Remove the given child and unset its parent property. Return the removed
    // child.
    remove_child: function (child) {
      if (child.parent !== this ||
          !flexo.remove_from_array(child.is_removed())) {
        throw "Not a child node";
      }
      delete child.parent;
      return child.was_removed();
    },

    // Remove self from parent and return self.
    remove_self: function () {
      if (!this.parent) {
        throw "No parent to remove from";
      }
      return this.parent.remove_child(this);
    },

    is_removed: flexo.self,   // called before removal
    was_removed: flexo.self,  // called after removal
  });

  // The name accessor gets or set a name for the node. The default name is the
  // empty string. Return the Node when setting, the name when getting.
  flexo._accessor(bender.Node, "name", flexo.safe_string);


  // Component < Node
  //   Component?  prototype
  //   data*       properties
  //   View?       view
  //   Watch*      watches
  bender.Component = flexo._ext(bender.Node, {

    // Initialize a component with an optional view (create a new default view
    // if no view is given) and no watches. The properties are inherited from
    // the prototype (if any.)
    init: function (view) {
      bender.Node.init.call(this);
      this.create_objects();
      this.watches = [];
      this.set_view(view);
      this.__concrete = [];
      this.__render_subgraph = true;        // delete when rendered
      this.__render_subgraph_init = true;   // likewise
      return this.name(flexo.random_id());  // set a random name
    },

    // Shallow clone of a component with its own children, properties, and view.
    clone: function (view) {
      var c = Object.create(this);
      this.__clones.push(c);
      c.__set_id(this.__id);
      c.parent = null;
      c.children = [];
      c.create_objects();
      c.set_view(view);
      return c;
    },

    // Return true iff the component argument conforms to the prototype of this
    // component.
    conforms: function (component) {
      return component &&
        (component === this || this.conforms(component.prototype));
    },

    // Create the properties object for the component, which maps property names
    // to their runtime value. The object keeps a hidden back-pointer to its
    // owner component in the “hidden” (i.e., non-enumerable) "" property (which
    // is not a valid property name.)
    create_objects: function () {
      this.properties = "properties" in this ?
        Object.create(this.properties) : {};
      Object.defineProperty(this.properties, "",
          { value: this, configurable: true });
      this.property_vertices = "property_vertices" in this ?
        Object.create(this.property_vertices) : {};
      this.event_vertices = "event_vertices" in this ?
        Object.create(this.event_vertices) : {};
    },

    // Set the view of the component, and add the child components from the
    // view descendants of the new view.
    set_view: function (view) {
      if (view && this.hasOwnProperty(view)) {
        if (this.view.default) {
          delete this.view.component;
        } else {
          throw "Cannot replace non-default view";
        }
      }
      if (!view) {
        view = bender.View.create();
        view.default = true;
      } else if (view.hasOwnProperty("component") && view.component) {
        throw "View already in a component";
      }
      this.view = view;
      this.view.component = this;
      this.add_child_components(view);
      return this;
    },

    // Add the child components from going down the view tree and adding the
    // components of View elements found along the way.
    add_child_components: function (view) {
      flexo.beach_all(view.children, function (element) {
        if (element.component) {
          this.insert_child(element.component);
          return;
        }
        return element.children;
      }, this);
    },

    // Add a property to the component and return the component. An initial
    // value can also be set.
    property: function (name, init_value) {
      return this.property_js(name, init_value);
    },

    // Define a Javascript property to store the value of a property in the
    // component’s properties object. Setting a property triggers a visit of the
    // corresponding vertex in the graph; however, a “silent” flag can be set to
    // prevent this, which is used during the graph traversal.
    property_js: function (name, value) {
      Object.defineProperty(this.properties, name, {
        enumerable: true,
        configurable: true,
        get: function () {
          return value;
        },
        set: function (v, silent) {
          if (this.hasOwnProperty(name)) {
            value = v;
          } else {
            this[""].property_js(name);
            Object.getOwnPropertyDescriptor(this, name).set.call(this, v,
              silent);
          }
          if (!silent && name in this[""].property_vertices) {
            this[""].property_vertices[name].value(this[""], value, true);
          }
        }
      });
      return this;
    },

    // Add a watch to the component and return the component.
    // TODO pass the contents of the watch as arguments and create a new watch
    // instead of the watch.
    watch: function (watch) {
      if (watch.component) {
        console.error("Watch already in a component");
        return this;
      }
      this.watches.push(watch);
      watch.component = this;
      return this;
    },

    // Render the complete component graph in the target and a new graph. Return
    // the graph that was created. This is called for the main component only.
    render: function (target) {
      var graph = this
        .render_subgraph_init(this.render_subgraph(bender.WatchGraph.create()))
        .sort().minimize();
      this.render_view(target || window.document.body);
      bender.DocumentElement.render_event_listeners();
      this.init_properties();
      this.ready();
      return graph;
    },

    // Send a ready notification
    ready: function () {
      this.notify("ready");
      this.children.forEach(function (child) {
        child.ready();
      });
    },

    // Send an event notification
    notify: function (type, args) {
      if (type in this.event_vertices) {
        if (typeof args !== "object") {
          args = {};
        }
        args.type = type;
        args.source = this;
        this.event_vertices[type].value(this, args);
      }
    },

    // If not already rendered, render the subgraph for this component in the
    // given WatchGraph. Render the subgraph of the prototype, then the subgraph
    // of the children, then the subgraph of the watches. Return the graph.
    // Note also that this is a place as good as any to build the static scope
    // of the component (later, we might save the scope on vertices?)
    render_subgraph: function (graph) {
      console.log("Render subgraph %0".fmt(this.__id));
      if (!this.__render_subgraph) {
        return graph;
      }
      delete this.__render_subgraph;
      var prototype = this.prototype;
      if (prototype) {
        this.prototype.render_subgraph(graph);
      }
      if (!this.view.scope) {
        this.names = {};
        this.view.scope = {};
        this.update_scope(bender.DocumentElement);
        flexo.beach(this.view, function (elem) {
          this.update_scope(elem);
          return elem.children;
        }, this);
      }
      this.update_scope(this);
      this.children.forEach(function (child) {
        child.names = this.names;
        child.view.scope = this.view.scope;
        child.render_subgraph(graph);
      }, this);
      this.watches.forEach(function (watch) {
        watch.render_subgraph(graph);
      });
      return graph;
    },

    render_subgraph_init: function (graph) {
      if (!this.__render_subgraph_init) {
        return graph;
      }
      delete this.__render_subgraph_init;
      var prototype = this.prototype;
      if (prototype) {
        this.prototype.render_subgraph_init(graph);
      }
      this.children.forEach(function (child) {
        child.render_subgraph_init(graph);
      }, this);
      Object.keys(this.properties).forEach(function (property) {
        console.log("Render subgraph %0: property %1".fmt(this.__id, property));
        var vertex = this.property_vertices[property];
        if (!vertex) {
          return;
        }
        if (!vertex.__init_vertex) {
          vertex.__init_vertex = graph.vertex(bender.Vertex.create());
          graph.edge(bender.InitEdge.create(vertex.__init_vertex, vertex));
        }
      }, this);
      return graph;
    },

    // Update the scope (and name map) of the component for the given node.
    update_scope: function (node) {
      var name = node.name();
      if (name) {
        this.names[name] = node;
      }
      this.view.scope[node.__id] = node;
    },

    // Initialize properties of the component, its prototype and its children.
    init_properties: function () {
      this.children.forEach(function (child) {
        child.init_properties();
      });
      for (var property in this.properties) {
        var vertex = this.property_vertices[property];
        if (!vertex || !vertex.__init_vertex) {
          return;
        }
        vertex.__init_vertex.value(this, this.properties[property], true);
      }
    },

    // Render the view of the component in a DOM target.
    // Create the view stack and render it bottom-up. A fragment is created to
    // render the tree out of the main tree and add it all at once.
    render_view: function (target) {
      var fragment = target.ownerDocument.createDocumentFragment();
      var stack = this.view_stack();
      stack[0].render(fragment, stack, 0);
      target.appendChild(fragment);
    },

    // Create the view stack for the component from its prototype and its own
    // view. The views of the prototype are cloned and are now owned by this
    // component. The dynamic scope is created through the clone() calls.
    // TODO stack-order property for Views.
    view_stack: function () {
      this.__concrete.push(this);
      this.view.stack = [this.view];
      this.view.stack.component = this;
      for (var p = this.prototype; p; p = p.prototype) {
        p.__concrete.push(this);
        var scope = {};
        scope[p.__id] = this;
        var v = p.view.clone(scope);
        if (p.children.length > 0) {
          this.add_child_components(v);
        }
        v.stack = this.view.stack;
        this.view.stack.unshift(v);
      }
      return this.view.stack;
    },

    // Get or set the URL of the component (from the XML file of its
    // description, or the environment document if created programmatically.)
    // Return the component for chaining.
    url: function (url) {
      if (arguments.length === 0) {
        if (!this._url) {
          url = flexo.normalize_uri((this.parent && this.parent.url()) ||
              (window.document && window.document.location.href));
          if (this._id) {
            var u = flexo.split_uri(url);
            u.fragment = this._id;
            return flexo.unsplit_uri(u);
          }
          this._url = url;
        }
        return this._url;
      }
      this._url = url;
      return this;
    }
  });

  // Return the prototype component of the component, or undefined.
  // Because we use prototype inheritance, a component with no component
  // prototype still has bender.Component as its object prototype. Moreover, a
  // clone component inherits from the component its is cloned from, so its
  // component prototype is the object prototype of its object prototype.
  Object.defineProperty(bender.Component, "prototype", {
    enumerable: true,
    get: function () {
      var p = Object.getPrototypeOf(this);
      if (p !== bender.Component) {
        if (!p.hasOwnProperty("watches")) {
          return Object.getPrototypeOf(p);
        }
        return p;
      }
    }
  });


  // Element < Node
  //   View  view
  bender.Element = flexo._ext(bender.Node, {

    // Deep clone of the element, attached to the cloned parent. Update the
    // scope as elements are cloned.
    clone: function (scope, parent) {
      var e = Object.create(this);
      this.__clones.push(e);
      scope[this.__id] = e;
      e.__set_id(this.__id);
      e.parent = parent;
      e.children = this.children.map(function (child) {
        return child.clone(scope, e);
      });
      return e;
    },

    // Render the children of this node to the target, passing the target and
    // index along.
    render_children: function (target, stack, i) {
      this.children.forEach(function (child) {
        child.render(target, stack, i);
      });
    }
  });

  // The view of an element is the view of its parent.
  Object.defineProperty(bender.Element, "view", {
    enumerable: true,
    configurable: true,
    get: function () {
      return this.parent && this.parent.view;
    }
  });


  // View < Element
  //   Component  component
  bender.View = flexo._ext(bender.Element, {

    // Add the component of the view to the component of the parent.
    was_inserted: function () {
      if (this.component) {
        var parent_component = this.parent.component;
        if (parent_component) {
          parent_component.insert_child(this.component);
        }
      }
      return this;
    },

    // Clone the view, and if not the view of a top-level component (i.e. this
    // node is the root of its tree), then clone the component as well. The
    // clone of the component becomes a child of the parent component.
    clone: function (scope, parent) {
      var v = bender.Element.clone.call(this, scope, parent);
      v.scope = scope;
      if (parent) {
        this.component.clone(v);
        scope[this.component.__id] = v.component;
      }
      return v;
    },

    // Render the child elements when at the root of the tree, and the view of
    // component otherwise (this is a placeholder for that component.)
    render: function (target, stack, i) {
      if (this === stack[i]) {
        this.render_children(target, stack, i);
      } else {
        this.component.render_view(target);
      }
    }
  });

  // The view of the view is itself and cannot be anything else.
  Object.defineProperty(bender.View, "view", {
    enumerable: true,
    get: flexo.self
  });


  // Content < Element
  bender.Content = flexo._ext(bender.Element, {

    // Find the next view in the stack that is not a default view and render it.
    // Otherwise, render the contents as default.
    // TODO selector in the next view.
    render: function (target, stack, i) {
      var j = i + 1;
      var n = stack.length;
      for (; j < n && stack[j].default; ++j) {}
      if (j < n) {
        stack[j].render(target, stack, j);
      } else {
        this.render_children(target, stack, i);
      }
    }
  });


  // DOMElement < Element
  //   string  namespace-uri
  //   string  local-name
  //   data*   attributess
  bender.DOMElement = flexo._ext(bender.Element, {

    // Attributes are index by namespace URI, then by local name.
    init: function (ns, name, attributes) {
      this.namespace_uri = ns;
      this.local_name = name;
      this.attributes = attributes || {};
      this.event_vertices = {};
      return bender.Element.init.call(this);
    },

    // Keep track of the original set of vertices when cloned.
    clone: function (parent) {
      var clone = bender.Element.clone.call(this, parent);
      clone.event_vertices = Object.create(this.event_vertices);
      return clone;
    },

    // Render in the target element.
    render: function (target, stack, i) {
      this.element = target.ownerDocument.createElementNS(this.namespace_uri,
        this.local_name);
      Object.keys(this.attributes).forEach(function (ns) {
        Object.keys(this.attributes[ns]).forEach(function (name) {
          this.element.setAttributeNS(ns, name, this.attributes[ns][name]);
        }, this);
      }, this);
      this.render_children(this.element, stack, i);
      for (var type in this.event_vertices) {
        this.event_vertices[type].outgoing.forEach(this.render_event_listener
            .bind(this, stack.component, type));
      }
      target.appendChild(this.element);
    },

    render_event_listener: function (component, type, edge) {
      this.element.addEventListener(type, function (e) {
        if (edge.adapter.prevent_default()) {
          e.preventDefault();
        }
        if (edge.adapter.stop_propagation()) {
          e.stopPropagation();
        }
        edge.dest.value(component, e, true);
      });
    },

    attr: function (ns, name, value) {
      if (arguments.lenght === 2) {
        return this.attributes[ns] && this.attributes[ns][name];
      }
      if (!this.attributes[ns]) {
        this.attributes[ns] = {};
      }
      this.attributes[ns][name] = value;
      return this;
    },

    // Set an attribute on the target element.
    // Should it be different from attr?
    set_attribute: function (ns, name, value) {
      this.attr(ns, name, value);
      if (this.element && typeof this.element.setAttributeNS === "function") {
        this.element.setAttributeNS(ns, name, value);
      }
    },

    // Set a DOM property on the target element.
    set_property: function (name, value) {
      if (this.element) {
        this.element[name] = value;
      }
    }
  });


  // DocumentElement < DOMElement
  bender.DocumentElement = flexo._ext(bender.DOMElement, {

    init: function() {
      this.element = window.document;
      return bender.DOMElement.init.call(this, "", ":document");
    },

    render_event_listeners: function () {
      for (var type in this.event_vertices) {
        this.event_vertices[type].outgoing.forEach(function (edge) {
          edge.adapter._watch.component.__concrete.forEach(function (component) {
            this.render_event_listener(component, type, edge);
          }, this);
        }, this);
      }
    },

    // There are no attributes to this node
    attr: flexo.discard(flexo.fail),

  }).init();


  // Attribute < Element
  //   string  namespace-uri
  //   string  local-name
  bender.Attribute = flexo._ext(bender.Element, {

    init: function (ns, name) {
      this.namespace_uri = ns;
      this.local_name = name;
      return bender.Element.init.call(this);
    },

    // Call render when one of the children changes.
    render: function (target) {
      target.setAttributeNS(this.namespace_uri, this.local_name,
        this.children.reduce(function (text, child) {
          return text + (typeof child.text === "function" ? child.text() : "");
        }, ""));
    }
  });


  // Text < Element
  //   string  text
  bender.Text = flexo._ext(bender.Element, {

    // Get or set the text content of the element.
    text: function (text) {
      if (arguments.length === 0) {
        return this._text || "";
      }
      this._text = flexo.safe_string(text);
      if (this.node) {
        this.node.textContent = this._text;
      }
      return this;
    },

    // Keep track of the node for updates.
    render: function (target) {
      this.node = target.ownerDocument.createTextNode(this.text());
      target.appendChild(this.node);
    },

    // Set the text property of the element.
    set_property: function (name, value) {
      if (name !== "text") {
        throw "Unknown property for %0 for Text.".fmt(name);
      }
      this.text(value);
    }
  });


  // Watch < Object
  //   Component  component
  //   Get*       gets
  //   Set*       sets
  bender.Watch = flexo._ext(bender.Base, {

    // Initialize an empty watch.
    init: function () {
      this.gets = [];
      this.sets = [];
      return bender.Base.init.call(this);
    },

    // Add a new adapter (get or set) to the corresponding list.
    adapter: function (adapter, list) {
      if (adapter._watch) {
        console.error("Adapter already in a watch.");
        return this;
      }
      list.push(adapter);
      adapter._watch = this;
      return this;
    },

    // Add a new get to this watch.
    get: function (get) {
      return this.adapter(get, this.gets);
    },

    // Add a new set to this watch.
    set: function (set) {
      return this.adapter(set, this.sets);
    },

    // Render the subgraph for this watch by in the given WatchGraph.
    render_subgraph: function (graph) {
      if (this.gets.length === 0 && this.sets.length === 0) {
        return;
      }
      var vertex = graph.vertex(bender.WatchVertex.create(this, graph));
      this.gets.forEach(function (get) {
        graph.edge(bender.AdapterEdge.create(get.vertex(graph), vertex, get));
      });
      this.sets.forEach(function (set) {
        graph.edge(bender.AdapterEdge.create(vertex, set.vertex(graph), set));
      });
    },
  });


  // Adapter < Object
  //   Watch     watch
  //   Node      target
  //   boolean   static = false
  //   boolean   match(Node T, data V) = true
  //   data      value(Node T, data V) = V
  //   number?   delay
  bender.Adapter = flexo._ext(bender.Base, {

    // Initialize the adapter for the given static target.
    init: function (target) {
      this.target = target;
      return bender.Base.init.call(this);
    },

    vertex: function (graph, name, vertices_name, prototype_vertex) {
      var vertices = this.target[vertices_name];
      if (!vertices.hasOwnProperty(name)) {
        vertices[name] = graph.vertex(prototype_vertex.create(this, graph));
        var prototype = Object.getPrototypeOf(this.target);
        if (vertices_name in prototype) {
          var protovertex = prototype[vertices_name][name];
          if (protovertex) {
            graph.edge(bender.InheritEdge.create(protovertex, vertices[name]));
            if (protovertex.__init_vertex) {
              vertices[name].__init_vertex = protovertex.__init_vertex;
            }
            protovertex.outgoing.forEach(function (edge) {
              if (edge.priority === 0) {
                var edge_ = Object.create(edge);
                edge_.source = vertices[name];
                vertices[name].outgoing.push(edge_);
                edge_.dest.incoming.push(edge_);
                edge_.priority = 1;
                graph.edge(edge_);
              }
            });
          }
        }
      }
      return vertices[name];
    },

    apply_value: flexo.nop
  });

  flexo._accessor(bender.Adapter, "value", flexo.id, true);
  flexo._accessor(bender.Adapter, "match", flexo.funcify(true), true);
  flexo._accessor(bender.Adapter, "delay");


  // Get < Adapter
  bender.Get = flexo._ext(bender.Adapter);


  // GetProperty < Get
  //   Property  property
  bender.GetProperty = flexo._ext(bender.Get, {
    init: function (name, target) {
      this.name = name;
      return bender.Get.init.call(this, target);
    },

    vertex: function (graph) {
      return bender.Adapter.vertex.call(this, graph, this.name,
        "property_vertices", bender.PropertyVertex);
    }
  });


  // GetEvent < Get
  //   string  type
  bender.GetEvent = flexo._ext(bender.Get, {
    init: function (type, target) {
      this.type = type;
      return bender.Get.init.call(this, target);
    },

    vertex: function (graph) {
      return bender.Adapter.vertex.call(this, graph, this.type,
        "event_vertices", bender.EventVertex);
    }
  });

  flexo._accessor(bender.GetEvent, "prevent_default", normalize_boolean);
  flexo._accessor(bender.GetEvent, "stop_propagation", normalize_boolean);

  function normalize_boolean(b) {
    return b === true;
  }


  // Set < Adapter
  bender.Set = flexo._ext(bender.Adapter, {
    vertex: function (graph) {
      return graph.vortex;
    }
  });


  // SetProperty < Set
  //   Property  property
  bender.SetProperty = flexo._ext(bender.Set, {
    init: function (name, target) {
      this.name = name;
      return bender.Set.init.call(this, target);
    },

    vertex: bender.GetProperty.vertex,

    apply_value: function (target, value) {
      var p, descriptor;
      for (p = target.properties,
        descriptor = Object.getOwnPropertyDescriptor(p, this.name);
        p && !descriptor;
        p = Object.getPrototypeOf(p),
        descriptor = Object.getOwnPropertyDescriptor(p, this.name)) {}
      descriptor.set.call(target.properties, value, true);
    }
  });


  // SetNodeProperty < Set
  //   string  name
  bender.SetNodeProperty = flexo._ext(bender.Set, {
    init: function (name, target) {
      this.name = name;
      return bender.Set.init.call(this, target);
    },

    apply_value: function (target, value) {
      if (typeof target.set_property === "function") {
        target.set_property(this.name, value);
      }
    }
  });


  // SetAttribute < Set
  //   string?  ns
  //   string   name
  bender.SetAttribute = flexo._ext(bender.Set, {
    init: function (ns, name, target) {
      this.ns = ns;
      this.name = flexo.safe_trim(name);
      return bender.Set.init.call(this, target);
    },

    apply_value: function (target, value) {
      if (typeof target.set_attribute === "function") {
        target.set_attribute(this.ns, this.name, value);
      }
    }
  });


  // SetEvent < Set
  //   string  type
  bender.SetEvent = flexo._ext(bender.Set, {
    init: function (type, target) {
      this.type = type;
      return bender.Set.init.call(this, target);
    },

    vertex: bender.GetEvent.vertex
  });


  // WatchGraph < Object
  //   Vertex+  vertices
  //   Vertex   vortex
  //   Edges*   edges
  bender.WatchGraph = flexo._ext(bender.Base, {

    init: function () {
      this.vertices = [];
      this.vortex = this.vertex(bender.Vertex.create(this));
      this.schedule = [];
      return bender.Base.init.call(this);
    },

    vertex: function (vertex) {
      this.vertices.push(vertex);
      vertex.graph = this;
      return vertex;
    },

    edge: function (edge) {
      this.__unsorted = true;
      edge.graph = this;
      return edge;
    },

    // Sort the edges for deterministic graph traversal. Delayed edges come
    // last, then edges to sink states, and so on. Outgoing edges from a vertex
    // are sorted using their priority (the priorities in increasing order are
    // InheritEdge, AdapterEdge, cloned edge.)
    sort: function () {
      if (!this.__unsorted) {
        return this;
      }
      delete this.__unsorted;
      this.edges = [];
      var queue = this.vertices.filter(function (vertex) {
        vertex.__out = vertex.outgoing.filter(function (edge) {
          if (edge.delay >= 0) {
            this.edges.push(edge);
            return false;
          }
          return true;
        }, this).length;
        return vertex.__out === 0;
      }, this);
      var incoming = function (edge) {
        if (edge.source.hasOwnProperty("__out")) {
          --edge.source.__out;
        } else {
          edge.source.__out = edge.source.outgoing.length - 1;
        }
        if (edge.source.__out === 0) {
          queue.push(edge.source);
        }
        return edge;
      };
      var delayed = function (edge) {
        // This matches edges that have no delay
        // jshint -W018
        return !(edge.delay >= 0);
      };
      var prioritize = function (a, b) {
        return b.priority - a.priority;
      };
      while (queue.length > 0) {
        flexo.unshift_all(this.edges, queue.shift().incoming.filter(delayed)
            .map(incoming).sort(prioritize));
      }
      var remaining = [];
      this.vertices.forEach(function (vertex) {
        if (vertex.__out !== 0) {
          remaining.push(vertex);
        }
        delete vertex.__out;
      });
      if (remaining.length > 0) {
        console.error("sort_edges: remaining vertices", remaining);
      }
      return this;
    },

    // Minimize the watch graph by removing InheritEdges and copy edges and
    // merging the corresponding vertices, and removing watch vertices when
    // possible. Return the graph after it was minimized.
    minimize: flexo.self,

    // Schedule a new graph traversal after a value was set on a vertex. If a
    // traversal was already scheduled, just return. Values are cleared after
    // the traversal finishes.
    flush: function (queue) {
      if (this.__scheduled) {
        if (queue) {
          flexo.asap(this.flush.bind(this, queue));
        }
        return;
      }
      if (queue) {
        queue.forEach(function (f) {
          f();
        });
      }
      this.__scheduled = flexo.asap(function () {
        delete this.__scheduled;
        this.edges.forEach(function (edge) {
          edge.traverse();
        });
        this.vertices.forEach(function (vertex) {
          vertex.clear_values();
        });
      }.bind(this));
    },

    // Flush a thunk at a later time.
    flush_later: function (f, delay) {
      var t = Date.now() + delay;
      var q;
      for (var i = 0, n = this.schedule.length; i < n; ++i) {
        q = this.schedule[i];
        if (t < q[0]) {
          break;
        }
        if (t === q[0]) {
          q.push(f);
          return;
        }
      }
      q = [t, f];
      this.schedule.splice(i, 0, q);
      var flush = function() {
        flexo.remove_from_array(this.schedule, q);
        q.shift();
        this.flush(q);
      }.bind(this);
      if (delay === 0) {
        flexo.asap(flush);
      } else {
        window.setTimeout(flush, delay);
      }
    }
  });


  // Vertex < Object
  //   Edge*  incoming
  //   Edge*  outgoing
  //   data*  values
  bender.Vertex = flexo._ext(bender.Base, {

    init: function (graph) {
      this.graph = graph;
      this.incoming = [];
      this.outgoing = [];
      this.values = {};
      return bender.Base.init.call(this);
    },

    // Set a value for a target. If the flush flag is set, schedule a graph
    // flush as well.
    value: function (target, value, flush) {
      if (target.__id in this.values) {
        return;
      }
      this.values[target.__id] = [target, value];
      if (flush) {
        this.graph.flush();
      }
    },

    clear_values: function () {
      this.values = {};
    }
  });


  // WatchVertex < Vertex
  //   Watch  watch
  bender.WatchVertex = flexo._ext(bender.Vertex, {
    init: function (watch) {
      this._watch = watch;
      return bender.Vertex.init.call(this);
    }
  });


  // AdapterVertex < Vertex
  //   Adapter  adapter
  bender.AdapterVertex = flexo._ext(bender.Vertex, {
    init: function (adapter, graph) {
      this.adapter = adapter;
      return bender.Vertex.init.call(this, graph);
    }
  });


  // PropertyVertex < AdapterVertex
  bender.PropertyVertex = flexo._ext(bender.AdapterVertex);


  // EventVertex < AdapterVertex
  bender.EventVertex = flexo._ext(bender.AdapterVertex);


  // Edge < Object
  //   Vertex  source
  //   Vertex  dest
  bender.Edge = flexo._ext(bender.Base, {

    // Initialize the edge with both source and destination, and add the edge to
    // the incoming and outoing list of source and dest.
    init: function (source, dest) {
      this.source = source;
      this.dest = dest;
      this.source.outgoing.push(this);
      this.dest.incoming.push(this);
      return bender.Base.init.call(this);
    },

    // InheritEdge have a lower priority, while
    priority: 0,

    traverse: function () {
      Object.keys(this.source.values).forEach(function (id) {
        this.dest.value.apply(this.dest, this.source.values[id]);
      }, this);
    }
  });

  flexo._get(bender.Edge, "delay", flexo.nop);


  // InheritEdge < Edge
  bender.InheritEdge = flexo._ext(bender.Edge, {
    // Give low priority during edge sort
    priority: -1,

    // Filter out input targets that do not conform to the target of the
    // destination vertex.
    traverse: function () {
      Object.keys(this.source.values).forEach(function (id) {
        var w = this.source.values[id];
        if (this.dest.adapter.target.conforms(w[0])) {
          this.dest.value.apply(this.dest, w);
        }
      }, this);
    }
  });


  // InitEdge < Edge
  bender.InitEdge = flexo._ext(bender.Edge, {
    priority: -0.5
  });


  // An inert edge is just used for sorting and has zero effect.
  bender.InertEdge = flexo._ext(bender.Edge, {
    traverse: flexo.nop
  });


  // AdapterEdge < Object:
  //   Adapter  adapter
  bender.AdapterEdge = flexo._ext(bender.Edge, {
    init: function (source, dest, adapter) {
      this.adapter = adapter;
      return bender.Edge.init.call(this, source, dest);
    },

    // Find the runtime target of the adapter and the runtime component of its
    // watch from the input component. If they are found, attempt to match the
    // input value. If there is a match, get the output value and apply it.
    // The runtime target is found by find the static target id in the view
    // stack. If there is no match, fallback to the static scope of the
    // component of the watch.
    // TODO test static adapters.
    traverse: function () {
      Object.keys(this.source.values).forEach(function (id) {
        var w = this.source.values[id];
        var component = this.adapter._watch.component;
        var target = this.adapter.target;
        var scope = component.scope;
        if (w[0].view.stack && !this.adapter.static) {
          var i;
          for (i = w[0].view.stack.length - 1;
            i >= 0 && !(target.__id in w[0].view.stack[i].scope); i--) {}
          if (i >= 0) {
            scope = w[0].view.stack[i].scope;
          }
        }
        var that = scope[component.__id];
        var rtarget = scope[target.__id];
        try {
          if (that && rtarget && this.adapter.match().call(that, w[1], scope)) {
            if (this.adapter.delay() >= 0) {
              this.dest.graph.flush_later(function () {
                this.traverse_matched.bind(this, that, rtarget, w[1], scope);
              }, false);
            } else {
              this.traverse_matched(that, rtarget, w[1], scope);
            }
          }
        } catch (_) {}
      }, this);
    },

    traverse_matched: function (that, target, v, scope) {
      try {
        var value = this.adapter.value().call(that, v, scope);
        this.adapter.apply_value(target, value);
        this.dest.value(target, value);
        if (this.adapter.static) {
          this.adapter.target.__clones.forEach(function (clone) {
            this.dest.value(clone, value);
          }, this);
        }
      } catch (_) {}
    }
  });

  flexo._get(bender.AdapterEdge, "delay", function () {
    return this.adapter.delay();
  });

}());
