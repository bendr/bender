// Bender core, implementing only the processing model as defined in
// /doc/data-model.html and /doc/processing-model.html. See runtime.js for
// the runtime, XML serialization, and other sorts of syntactic sugar.
// Additional properties are introduced for implementation purposes.

// TODO
// [/] remove component removes the view; unrender view; unrender from graph.
// [ ] remove any node (not just component and view.)
// [ ] persistence of property values
// [ ] match then, compute value then, apply value in traverse edge; get rid of
//     ordered_values
// [ ] do not traverse edges for static values when the component has its own
//     value (in match)
// [ ] review delay
// [ ] view-less components
// [ ] InertEdges

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

  var flags = {
    dont_create: true,
    flush: true,
    no_concrete: true,
    silent: true
  };

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


  // Node < Object
  //   Node?    parent
  //   Node*    children
  //   string?  name
  bender.Node = flexo._ext(flexo.Object, {

    // Create a new node with no children and no parent.
    init: function () {
      flexo.Object.init.call(this);
      this.children = [];
      this.__clones = [];
      this.__concrete = [];
      this.__set_id();
    },

    // Set a unique id on the node (for debugging purposes)
    __set_id: function (protoid) {
      var id = (bender.Node.__id++).toString(36).toUpperCase();
      this.__id = protoid ? "%1_%0".fmt(id, protoid) : id;
      this.__nodes[id] = this;
    },

    // Id number for nodes (used for debugging)
    __id: 0,

    // Find node by ID
    __nodes: {},

    // Make the node concrete
    make_concrete: function () {
      this.__concrete.push(this);
      this.concrete = true;
      return this;
    },

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
          !flexo.remove_from_array(this.children, child.is_removed())) {
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
      delete this._all;
      this.__render_subgraph = 0;  // number of rendering requests
      this.__on_init = true;       // delete when init is called
      flexo.asap(function () {
        if (this.__on_init) {
          delete this.__on_init;
          this.on("init").call(this);
        }
      }.bind(this));
      return this.name(flexo.random_id());  // set a random name
    },

    // Shallow clone of a component with its own children, properties, and view.
    clone: function (view) {
      delete this._all;
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

    // Default handlers
    handlers: {
      "init": flexo.nop,
      "render": flexo.nop
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
      this.handlers = Object.create(this.handlers);
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

    // Get, add, or remove a known handler.
    on: function (type, handler) {
      if (!(type in this.handlers)) {
        return;
      }
      if (arguments.length === 1) {
        return this.handlers[type];
      }
      if (typeof handler === "function") {
        this.handlers[type] = handler;
      } else if (typeof handler === "string") {
        try {
          this.handlers[type] = new Function(handler);
        } catch (_) {
          console.error("Could not compile handler “%0” for on-%1"
              .fmt(handler, type));
        }
      } else {
        delete this.handlers[type];
      }
      return this;
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
            this[""].property_vertices[name]
              .value(this[""], value, flags.flush);
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

    // Remove a watch and return the component
    unwatch: function (watch) {
      watch = flexo.remove_from_array(this.watches, watch);
      if (!watch) {
        console.error("Watch was not removed");
        return;
      }
      delete watch.component;
      return this;
      // TODO flush if watch was rendered
    },

    // Render the complete component graph in the target and a new graph. Return
    // the graph that was created. This is called for the main component only.
    render: function (target) {
      var graph = this.render_subgraph(bender.WatchGraph.create())
        .sort().minimize();
      this.target = target;
      this.render_view(target || window.document.body);
      graph.flush();
      this.ready();
      return graph;
    },

    // Unrender the component. TODO update the scope.
    unrender: function () {
      if (this.view.stack) {
        this.view.stack[0].unrender();
      }
      this.unrender_subgraph();
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
      if (this.__render_subgraph++ > 0) {
        return graph;
      }
      var prototype = this.prototype;
      if (prototype) {
        this.prototype.render_subgraph(graph);
      }
      if (!this.view.scope) {
        this.names = {};
        this.view.scope = {};
        var document_element = this.view.document_element(flags.dont_create);
        if (document_element) {
          this.view.scope[document_element.__id] = document_element;
        }
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

    unrender_subgraph: function () {
      // Prototype should keep track of how many subgraphs are rendered for it
      if (--this.__render_subgraph > 0) {
        return;
      }
      var prototype = this.prototype;
      if (prototype) {
        prototype.unrender_subgraph();
      }
      this.children.forEach(function (child) {
        child.unrender_subgraph();
      });
      this.watches.forEach(function (watch) {
        watch.unrender_subgraph();
      });
    },

    // Update the scope (and name map) of the component for the given node.
    update_scope: function (node) {
      var name = node.name();
      if (name) {
        this.names[name] = node;
      }
      this.view.scope[node.__id] = node;
    },

    // Render the view of the component in a DOM target.
    // Create the view stack and render it bottom-up. A fragment is created to
    // render the tree out of the main tree and add it all at once.
    render_view: function (target) {
      var fragment = target.ownerDocument.createDocumentFragment();
      var stack = this.view_stack();
      stack[0].render(fragment, stack, 0);
      target.appendChild(fragment);
      this.on("render").call(this);
    },

    // Create the view stack for the component from its prototype and its own
    // view. The views of the prototype are cloned and are now owned by this
    // component. The dynamic scope is created through the clone() calls.
    // TODO stack-order property for Views.
    view_stack: function () {
      delete this._all;
      this.__concrete.push(this);
      this.concrete = true;
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
    },

    // Removing a component removes its view from the hierarchy as well.
    was_removed: function () {
      this.view.remove_self();
      this.unrender();
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
    },

    unrender: flexo.nop,

    // Unrender the node and its children.
    unrender_children: function () {
      this.children.forEach(function (child) {
        child.unrender();
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
      if (this.__document_element) {
        v.__document_element = this.__document_element.clone(scope);
        Object.defineProperty(v.__document_element, "view", {
          enumerable: true,
          value: v
        });
      }
      return v;
    },

    // Get the document element for this component, creating it if necessary.
    document_element: function (dont_create) {
      if (!this.__document_element && !dont_create) {
        this.__document_element = bender.DocumentElement.create();
        Object.defineProperty(this.__document_element, "view", {
          enumerable: true,
          configurable: true,
          value: this
        });
        this.scope[this.__document_element.__id] = this.__document_element;
      }
      return this.__document_element;
    },

    // Render the child elements when at the root of the tree, and the view of
    // component otherwise (this is a placeholder for that component.)
    render: function (target, stack, i) {
      if (this.__document_element) {
        this.__document_element.render();
      }
      var first = target.firstChild;
      if (this === stack[i]) {
        this.render_children(target, stack, i);
      } else {
        this.component.render_view(target);
      }
      this.span = [first ? first.nextSibling : target.firstChild,
        target.lastChild];
    },

    // Remove the elements from the span, but also unrender the children so that
    // event listeners are handled correctly.
    unrender: function () {
      if (this.span) {
        var node = this.span[0];
        var parent = node.parentNode;
        while (node !== this.span[1]) {
          var next = node.nextSibling;
          parent.removeChild(node);
          node = next;
        }
        parent.removeChild(node);
      }
      if (this.__document_element) {
        flexo.remove_from_array(this.__document_element.__clones,
            this.__document_element);
        this.__document_element.unrender();
        delete this.__document_element;
      }
      this.unrender_children();
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
        this.__next_view = stack[j];
        stack[j].render(target, stack, j);
      } else {
        this.render_children(target, stack, i);
      }
    },

    // Unrender either the children or the next view that was rendered above.
    unrender: function () {
      if (this.__next_view) {
        this.__next_view.unrender();
      } else {
        this.unrender_children();
      }
    }
  });


  // DOMElement < Element
  //   string  namespace-uri
  //   string  local-name
  bender.DOMElement = flexo._ext(bender.Element, {

    // Attributes are index by namespace URI, then by local name.
    init: function (ns, name) {
      bender.Element.init.call(this);
      this.namespace_uri = ns;
      this.local_name = name;
      this.event_vertices = {};
      this.event_listeners = [];
    },

    // Keep track of the original set of vertices when cloned.
    clone: function (scope, parent) {
      var clone = bender.Element.clone.call(this, scope, parent);
      clone.event_vertices = Object.create(this.event_vertices);
      return clone;
    },

    // Render in the target element.
    render: function (target, stack, i) {
      this.make_concrete();
      this.element = target.ownerDocument.createElementNS(this.namespace_uri,
        this.local_name);
      this.render_children(this.element, stack, i);
      for (var type in this.event_vertices) {
        this.event_vertices[type].outgoing.forEach(this.render_event_listener
            .bind(this, stack.component, type));
      }
      target.appendChild(this.element);
    },

    // Remove all event listeners (stored as [type, listener] pairs)
    unrender: function () {
      this.event_listeners.forEach(function (l) {
        this.element.removeEventListener(l[0], l[1]);
      }, this);
      this.event_listeners = [];
      this.unrender_children();
    },

    // Render an event listener of the given type on the concrete node. Store
    // the pair (type, listener) in the list of listeners for unrendering later.
    render_event_listener: function (component, type, edge) {
      var listener = function (e) {
        if (edge.adapter.prevent_default()) {
          e.preventDefault();
        }
        if (edge.adapter.stop_propagation()) {
          e.stopPropagation();
        }
        edge.source.value(component, e, flags.flush);
      };
      this.element.addEventListener(type, listener);
      this.event_listeners.push([type, listener]);
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

    element: window.document,

    // Render the event listeners once, but dispatch a new value for all
    // concrete renderings.
    render: function (no_concrete) {
      if (!this.hasOwnProperty("__clones")) {
        this.make_concrete();
        return Object.getPrototypeOf(this).render(flags.no_concrete);
      }
      if (!no_concrete) {
        this.make_concrete();
      }
      for (var type in this.event_vertices) {
        // jshint -W083
        this.event_vertices[type].outgoing.forEach(function (edge) {
          if (++edge.__rendered > 0) {
            return;
          }
          edge.__rendered = 1;
          var listener = function (e) {
            if (edge.adapter.prevent_default()) {
              e.preventDefault();
            }
            if (edge.adapter.stop_propagation()) {
              e.stopPropagation();
            }
            edge.source.value(this.view.component, e, flags.flush);
            console.log("document element: clones:",
              this.__clones.map(function (clone) {
                return clone.__id;
              }));
            this.__clones.forEach(function (clone) {
              edge.source.value(clone.view.component, e, flags.flush);
            });
          }.bind(this);
          this.element.addEventListener(type, listener);
          this.event_listeners.push([type, listener]);
        }, this);
      }
    },

    unrender: function () {
      // TODO decrement count
    },

    attr: flexo.discard(flexo.fail),

  });


  // Attribute < Element
  //   string  namespace-uri
  //   string  local-name
  bender.Attribute = flexo._ext(bender.Element, {

    init: function (ns, name) {
      bender.Element.init.call(this);
      this.namespace_uri = ns;
      this.local_name = name;
    },

    // Call render when one of the children changes.
    render: function (target) {
      this.node = target;
      this.text_children = this.children.filter(function (child) {
        return typeof child.text === "function";
      }).map(function (text) {
        return text.make_concrete();
      });
      this.update_value();
    },

    // Update the value of the attribute when one of its text node has changed
    update_value: function () {
      if (this.node) {
        this.node.setAttributeNS(this.namespace_uri, this.local_name,
          this.text_children.map(function (child) {
            return child.text();
          }).join(""));
      }
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
      } else if (this.parent && typeof
        this.parent.update_value === "function") {
        this.parent.update_value();
      }
      return this;
    },

    // Keep track of the node for updates.
    render: function (target) {
      this.make_concrete();
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
  bender.Watch = flexo._ext(flexo.Object, {

    // Initialize an empty watch.
    init: function () {
      flexo.Object.init.call(this);
      this.gets = [];
      this.sets = [];
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
      if (this.gets.length === 0) {
        return;
      }
      this.vertex = graph.vertex(bender.WatchVertex.create(this, graph));
      this.gets.forEach(function (get) {
        graph.edge(bender.AdapterEdge.create(get.vertex(graph), this.vertex,
            get));
      }, this);
      this.sets.forEach(function (set) {
        graph.edge(bender.AdapterEdge.create(this.vertex, set.vertex(graph),
            set));
      }, this);
    },

    // Remove the watch vertex, which causes the removal of its incoming and
    // outgoing edges, and in turn the removal of more vertices.
    unrender_subgraph: function () {
      if (this.vertex) {
        this.vertex.remove_self();
        delete this.vertex;
      }
    }
  });


  // InitWatch < Watch
  bender.InitWatch = flexo._ext(bender.Watch, {

    render_subgraph: function (graph) {
      if (this.sets.length === 0) {
        return;
      }
      this.vertex = graph.vertex(bender.WatchVertex.create(this));
      this.vertex.value(this.component);
      this.sets.forEach(function (set) {
        graph.edge(bender.InitEdge.create(this.vertex, set.vertex(graph), set));
      }, this);
    }
  });


  // Adapter < Object
  //   Watch     watch
  //   Node      target
  //   boolean   static = false
  //   boolean   match(Node T, data V) = true
  //   data      value(Node T, data V) = V
  //   number?   delay
  bender.Adapter = flexo._ext(flexo.Object, {

    // Initialize the adapter for the given static target.
    init: function (target) {
      flexo.Object.init.call(this);
      this.target = target;
    },

    vertex: function (graph, name, vertices_name, prototype_vertex) {
      var vertices = this.target[vertices_name];
      if (!vertices) {
        return graph.vortex;
      } else if (!vertices.hasOwnProperty(name)) {
        vertices[name] = graph.vertex(prototype_vertex.create(this));
        var prototype = Object.getPrototypeOf(this.target);
        if (vertices_name in prototype) {
          var protovertex = prototype[vertices_name][name];
          if (protovertex) {
            graph.edge(bender.InheritEdge.create(protovertex, vertices[name]));
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
  flexo._accessor(bender.Adapter, "delay", flexo.to_number);


  // Get < Adapter
  bender.Get = flexo._ext(bender.Adapter);


  // GetProperty < Get
  //   string  name
  bender.GetProperty = flexo._ext(bender.Get, {
    init: function (name, target) {
      bender.Get.init.call(this, target);
      this.name = name;
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
      bender.Get.init.call(this, target);
      this.type = type;
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
      bender.Set.init.call(this, target);
      this.name = name;
    },

    vertex: bender.GetProperty.vertex,

    apply_value: function (target, value) {
      var p, descriptor;
      for (p = target.properties,
        descriptor = Object.getOwnPropertyDescriptor(p, this.name);
        p && !descriptor;
        p = Object.getPrototypeOf(p),
        descriptor = Object.getOwnPropertyDescriptor(p, this.name)) {}
      descriptor.set.call(target.properties, value, flags.silent);
      bender.trace("    set property %0`%1=<%2>"
        .fmt(target.__id, this.name, value));
    }
  });


  // SetNodeProperty < Set
  //   string  name
  bender.SetNodeProperty = flexo._ext(bender.Set, {
    init: function (name, target) {
      bender.Set.init.call(this, target);
      this.name = name;
    },

    apply_value: function (target, value) {
      if (typeof target.set_property === "function") {
        target.set_property(this.name, value);
      }
    }
  });


  // SetEvent < Set
  //   string  type
  bender.SetEvent = flexo._ext(bender.Set, {
    init: function (type, target) {
      bender.Set.init.call(this, target);
      this.type = type;
    },

    vertex: bender.GetEvent.vertex
  });


  // WatchGraph < Object
  //   Vertex+  vertices
  //   Vertex   vortex
  //   Edges*   edges
  bender.WatchGraph = flexo._ext(flexo.Object, {

    init: function () {
      flexo.Object.init.call(this);
      this.vertices = [];
      this.vortex = this.vertex(bender.Vertex.create(this));
      this.schedule = [];
    },

    vertex: function (vertex) {
      this.vertices.push(vertex);
      vertex.graph = this;
      return vertex;
    },

    remove_vertex: function (vertex) {
      vertex = flexo.remove_from_array(this.vertices, vertex);
      if (vertex) {
        delete vertex.graph;
      }
      return vertex;
    },

    edge: function (edge) {
      this.__unsorted = true;
      edge.graph = this;
      return edge;
    },

    remove_edge: function (edge) {
      edge = flexo.remove_from_array(this.edges, edge);
      if (edge) {
        delete edge.graph;
      }
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
  bender.Vertex = flexo._ext(flexo.Object, {

    init: function () {
      flexo.Object.init.call(this);
      this.incoming = [];
      this.outgoing = [];
      this.values = {};
      this.ordered_values = [];
    },

    // Set a value for a target. If the flush flag is set, schedule a graph
    // flush as well.
    value: function (target, value, flush) {
      if (target.__id in this.values) {
        return false;
      }
      this.values[target.__id] = true;
      this.ordered_values.push([target, value]);
      if (flush) {
        this.graph.flush();
      }
      return true;
    },

    // Clear all values (TODO remove ordered_values)
    clear_values: function () {
      this.values = {};
      this.ordered_values = [];
    },

    // Request the graph to remove this vertex, as well as all of its incoming
    // and outgoing edges.
    remove_self: function () {
      if (this.graph) {
        var remove_edge = flexo.call.bind(bender.Edge.remove_self);
        this.incoming.forEach(remove_edge);
        this.outgoing.forEach(remove_edge);
        this.graph.remove_vertex(this);
      }
    },

    remove_edge: function (from, edge) {
      this.graph.remove_edge(edge);
      flexo.remove_from_array(from, edge);
      if (this.incoming.length === 0 && this.outgoing.length === 0) {
        this.graph.remove_vertex(this);
      }
    },

    remove_incoming: function (edge) {
      this.remove_edge(this.incoming, edge);
    },

    remove_outgoing: function (edge) {
      this.remove_edge(this.outoing, edge);
    },
  });


  bender.InitVertex = flexo._ext(bender.Vertex);


  // WatchVertex < Vertex
  //   Watch  watch
  bender.WatchVertex = flexo._ext(bender.Vertex, {
    init: function (watch) {
      bender.Vertex.init.call(this);
      this._watch = watch;
    }
  });


  // AdapterVertex < Vertex
  //   Adapter  adapter
  bender.AdapterVertex = flexo._ext(bender.Vertex, {
    init: function (adapter) {
      bender.Vertex.init.call(this);
      this.adapter = adapter;
    }
  });


  // PropertyVertex < AdapterVertex
  bender.PropertyVertex = flexo._ext(bender.AdapterVertex);


  // EventVertex < AdapterVertex
  bender.EventVertex = flexo._ext(bender.AdapterVertex);


  // Edge < Object
  //   Vertex  source
  //   Vertex  dest
  bender.Edge = flexo._ext(flexo.Object, {

    // Initialize the edge with both source and destination, and add the edge to
    // the incoming and outoing list of source and dest.
    init: function (source, dest) {
      flexo.Object.init.call(this);
      this.source = source;
      this.dest = dest;
      this.source.outgoing.push(this);
      this.dest.incoming.push(this);
    },

    // InheritEdge have a lower priority, while
    priority: 0,

    // Edges not tied to an adapter have no delay
    delay: NaN,

    traverse: function () {
      this.source.ordered_values.forEach(function (w) {
        this.dest.value.apply(this.dest, w);
      }, this);
    },

    remove_self: function () {
      this.source.remove_outgoing(this);
      this.dest.remove_incoming(this);
    }
  });

  flexo._get(bender.Edge, "__index", function () {
    return this.graph.edges.indexOf(this) + 1;
  });

  // InheritEdge < Edge
  //   number priority = -1
  bender.InheritEdge = flexo._ext(bender.Edge, {

    // Give low priority during edge sort
    priority: -1,

    // An edge is static iff it is an adapter edge and its adapter is static
    static: false,

    // Filter out input targets that do not conform to the target of the
    // destination vertex.
    traverse: function () {
      this.source.ordered_values.forEach(function (w) {
        if (this.dest.adapter.target.conforms(w[0])) {
          this.dest.value.apply(this.dest, w);
        }
      }, this);
    }
  });


  // An inert edge is just used for sorting and has zero effect.
  bender.InertEdge = flexo._ext(bender.Edge, {
    traverse: flexo.nop
  });


  // AdapterEdge < Edge:
  //   Adapter  adapter
  bender.AdapterEdge = flexo._ext(bender.Edge, {
    init: function (source, dest, adapter) {
      bender.Edge.init.call(this, source, dest);
      this.adapter = adapter;
    },

    // Find the runtime target of the adapter and the runtime component of its
    // watch from the input component. If they are found, attempt to match the
    // input value. If there is a match, get the output value and apply it.
    // The runtime target is found by find the static target id in the view
    // stack. If there is no match, fallback to the static scope of the
    // component of the watch.
    traverse: function () {
      this.source.ordered_values.forEach(function (w) {
        var component = this.adapter._watch.component;
        var target = this.adapter.target;
        var scope = find_scope(w[0], target);
        var target_runtime = scope[target.__id];
        var component_runtime = scope[component.__id] || component;
        bender.trace("#%0: %1=<%2> target %3<%4 in %5<%6"
          .fmt(this.graph.edges.indexOf(this) + 1, w[0].__id, w[1],
            target_runtime.__id, target.__id, component_runtime.__id,
            component.__id));
        try {
          if (this.adapter.match().call(component_runtime, w[1], scope)) {
            var t = function () {
              var value = this.adapter.value();
              if (this.adapter.static || target_runtime.concrete) {
                var v = value.call(component_runtime, w[1], scope);
                bender.trace("  (%0) <%1>"
                  .fmt(this.adapter.static ? "static" : "concrete", v));
                if (this.dest.value(target_runtime, v)) {
                  this.adapter.apply_value(target_runtime, v);
                }
              } else {
                target_runtime.__concrete.forEach(function (concrete) {
                  if (concrete === target_runtime ||
                    !this.source.values.hasOwnProperty(concrete.__id)) {
                    scope = find_scope(concrete, target);
                    target_runtime = scope[target.__id];
                    component_runtime = scope[component.__id];
                    var v = value.call(component_runtime, w[1], scope);
                    bender.trace("  (concrete) %0 in %1=<%2>"
                      .fmt(target_runtime.__id, component_runtime.__id, v));
                    if (this.dest.value(target_runtime, v)) {
                      this.adapter.apply_value(target_runtime, v);
                    }
                  }
                }, this);
              }
            }.bind(this);
            if (this.adapter.delay() >= 0) {
              this.graph.flush_later(t, this.adapter.delay())
            } else {
              t();
            }
          } else {
            bender.trace("  (no match)");
          }
        } catch(_) {}
      }, this);
    },

  });

  flexo._get(bender.AdapterEdge, "delay", function () {
    return this.adapter.delay();
  });

  function find_scope(input, target) {
    return (flexo.find_first(input.view.stack, function (view) {
      return target.__id in view.scope;
    }) || input.view).scope;
  }


  // InitEdge < AdapterEdge
  //   number  priority = -0.5
  bender.InitEdge = flexo._ext(bender.AdapterEdge, {
    priority: -0.5
  });

}());
