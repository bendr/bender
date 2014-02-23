// Bender core, implementing only the processing model as defined in
// /spec/data-model.html and /spec/processing-model.html. See runtime.js for
// the runtime, XML serialization, and other sorts of syntactic sugar.
// Additional properties are introduced for implementation purposes.

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
  //   Node?   parent
  //   Node*   children
  //   string  name
  bender.Node = flexo._ext(bender.Base, {

    // Create a new node with no children and no parent.
    init: function () {
      this.children = [];
      return bender.Base.init.call(this);
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
      return this.add_child(child), this;
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
  flexo._accessor(bender.Node, "name", flexo.safe_trim);


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
      this.properties = "properties" in this ?
        Object.create(this.properties) : {};
      if (!view) {
        view = bender.View.default();
      } else if (view.component) {
        throw "View already in a component";
      }
      this.view = view;
      this.view.component = this;
      this.watches = [];
      this.__render_subgraph = true;        // delete when rendered
      this.property_vertices = {};          // property vertices indexed by name
      this.event_vertices = {};             // event vertices indexed by type
      return this.name(flexo.random_id());  // set a random name
    },

    // Add a property to the component and return the component. An initial
    // value can also be set.
    property: function (name, init_value) {
      return this.properties[name] = init_value, this;
    },

    // Add a watch to the component and return the component. If a Watch object
    // is passed as the first argument, add this watch; otherwise, create a new
    // watch with the contents passed as arguments.
    watch: function (watch) {
      if (watch.component) {
        console.error("Watch already in a component");
        return this;
      }
      this.watches.push(watch);
      watch.component = this;
      return this;
    },

    // If not already rendered, render the subgraph for this component in the
    // given WatchGraph. Render the subgraph of the prototype, then the subgraph
    // of the watches, then the subgraph of the children.
    // The component keeps track of the vertices that target it so that they can
    // easily be found when rendering the watches.
    render_subgraph: function (graph) {
      if (!this.__render_subgraph) {
        return;
      }
      delete this.__render_subgraph;
      var prototype = this.prototype;
      if (prototype) {
        this.prototype.render_subgraph(graph);
      }
      this.children.forEach(function (child) {
        child.render_subgraph(graph);
      });
      this.watches.forEach(function (watch) {
        watch.render_subgraph(graph);
      });
      return this;
    },

    // Render the view of the component in a DOM target.
    // Create the view stack and render it bottom-up. A fragment is created to
    // render the tree out of the main tree and add it all at once.
    render_view: function (target) {
      var fragment = target.ownerDocument.createDocumentFragment();
      var stack = this.view_stack();
      stack[0].render(target, stack, 0);
      target.appendChild(fragment);
    },

    // Create the view stack for the component from its prototype and its own
    // view. The views of the prototype are cloned.
    // TODO stack-order property for Views.
    view_stack: function () {
      for (var p = this.prototype; p; p = p.prototype) {
        stack.unshift(p.view.clone());
      }
      stack.push(this.view);
      return stack;
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
    clone: function (parent) {
      var clone = Object.create(this);
      clone.parent = parent;
      clone.children = this.children.map(function (child) {
        return child.clone(clone);
      });
      return clone;
    },

    render_children: function (target, stack, i) {
      this.children.forEach(function (child) {
        child.render(target, stack, i);
      });
    }
  });

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
    default: function () {
      var view = this.create();
      view.default = true;
      return view;
    },

    clone: function (parent) {
      console.log("+ Clone view of %0".fmt(this.component.name()));
      var clone = bender.Element.clone.call(this, parent);
      if (parent) {
        console.log("+ Clone component");
        clone.component = this.component.clone(clone);
      }
      return clone;
    },

    render: function (target, stack, i) {
      if (this == stack[i]) {
        console.log("+ [%0] View (top component)".fmt(this.component.name()));
        this.render_children(target, stack, i);
      } else {
        console.log("+ [%0] View (child component)".fmt(this.component.name()));
        this.component.render_view(target);
      }
    }
  });

  Object.defineProperty(bender.View, "view", {
    enumerable: true,
    get: flexo.self
  });


  // Content < Element
  bender.Content = flexo._ext(bender.Element, {
    render: function (target, stack, i) {
      console.log("+ [%0] Content".fmt(this.view.component.name()));
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
    init: function (ns, name, attributes) {
      this.namespace_uri = ns;
      this.local_name = name;
      this.attributes = attributes || {};
      this.event_vertices = {};
      return bender.Element.init.call(this);
    },

    clone: function (parent) {
      var clone = bender.Element.clone.call(this, parent);
      clone.event_vertices = Object.create(this.event_vertices);
      return clone;
    },

    render: function (target, stack, i) {
      console.log("+ [%0] DOMElement (%1)".fmt(this.view.component.name(),
          this.local_name), this.event_vertices);
      var element = target.ownerDocument.createElementNS(this.namespace_uri,
        this.local_name);
      Object.keys(this.attributes, function (ns) {
        Object.keys(this.attributes[ns], function (name) {
          element.setAttributeNS(ns, name, this.attributes[ns][name]);
        });
      });
      this.render_children(element, stack, i);
      target.appendChild(element);
    }
  });


  // Attribute < Element
  //   string  namespace-uri
  //   string  local-name
  bender.Attribute = flexo._ext(bender.Element, {
    init: function (ns, name) {
      this.namespace_uri = ns;
      this.local_name = name;
      return bender.Element.init.call(this);
    },

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
    text: function (text) {
      if (arguments.length === 0) {
        return this._text || "";
      }
      this._text = flexo.safe_string(text);
      return this;
    },

    render: function (target) {
      console.log("+ [%0] Text %1".fmt(this.view.component.name(),
          flexo.quote(this.text())));
      var node = target.ownerDocument.createTextNode(this.text());
      target.appendChild(node);
    }
  });


  // Watch < Object
  //   Component  component
  //   Get*       gets
  //   Set*       sets
  bender.Watch = flexo._ext(bender.Base, {
    init: function () {
      this.gets = [];
      this.sets = [];
      return bender.Base.init.call(this);
    },

    adapter: function (adapter, list) {
      if (adapter.watch) {
        console.error("Adapter already in a watch.");
        return this;
      }
      list.push(adapter);
      adapter.watch = this;
      return this;
    },

    get: function (get) {
      return this.adapter(get, this.gets);
    },

    set: function (set) {
      return this.adapter(set, this.sets);
    },

    // Render the subgraph for this watch by in the given WatchGraph.?
    render_subgraph: function (graph) {
      var vertex = graph.vertex(bender.WatchVertex.create(this));
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
  //   boolean   static
  //   Function  value = λx x
  //   Function  match = λx true
  //   number?   delay
  bender.Adapter = flexo._ext(bender.Base, {
    init: function (target) {
      this.target = target;
      return bender.Base.init.call(this);
    },

    vertex: function (graph, name, vertices_name, prototype) {
      var vertices = this.target[vertices_name];
      if (!vertices.hasOwnProperty(name)) {
        vertices[name] = graph.vertex(prototype.create(this));
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
                edge_.priority = -1;
                graph.edge(edge_);
              }
            });
          }
        }
      }
      return vertices[name];
    },

    static: false
  });

  flexo._accessor(bender.Adapter, "value", flexo.id, true);
  flexo._accessor(bender.Adapter, "match", flexo.funcify(true), true);


  // Get < Adapter
  bender.Get = flexo._ext(bender.Adapter);


  // GetProperty < Get
  //   Property  property
  bender.GetProperty = flexo._ext(bender.Get, {
    init: function (target, property) {
      this.property = property;
      return bender.Get.init.call(this, target);
    },

    vertex: function (graph) {
      return bender.Adapter.vertex.call(this, graph, this.property.name,
        "property_vertices", bender.PropertyVertex);
    }
  });


  // GetEvent < Get
  //   string  type
  bender.GetEvent = flexo._ext(bender.Get, {
    init: function (target, type) {
      this.type = type;
      return bender.Get.init.call(this, target);
    },

    vertex: function (graph) {
      return bender.Adapter.vertex.call(this, graph, this.type,
        "event_vertices", bender.EventVertex);
    }
  });


  // Set < Adapter
  bender.Set = flexo._ext(bender.Adapter, {
    vertex: function (graph) {
      return graph.vortex;
    }
  });


  // SetProperty < Set
  //   Property  property
  bender.SetProperty = flexo._ext(bender.Set, {
    init: function (target, property) {
      this.property = property;
      return bender.Set.init.call(this, target);
    },

    vertex: bender.GetProperty.vertex
  });


  // SetNodeProperty < Set
  //   string  name
  bender.SetNodeProperty = flexo._ext(bender.Set, {
    init: function (target, name) {
      this.name = name;
      return bender.Set.init.call(this, target);
    }
  });


  // SetAttribute < Set
  //   string?  ns
  //   string   name
  bender.SetAttribute = flexo._ext(bender.Set, {
    init: function (target, ns, name) {
      this.ns = ns;
      this.name = name;
      return bender.Set.init.call(this, target);
    }
  });


  // SetEvent < Set
  //   string  type
  bender.SetEvent = flexo._ext(bender.Set, {
    init: function (target, type) {
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
      this.vortex = this.vertex(bender.Vertex.create());
      return bender.Base.init.call(this);
    },

    vertex: function (vertex) {
      this.vertices.push(vertex);
      return vertex;
    },

    edge: function (edge) {
      this.__unsorted = true;
      return edge;
    },

    sort: function () {
      if (!this.__unsorted) {
        return;
      }
      delete this.__unsorted;
      this.edges = [];
      this.vertices.forEach(function (v, i) {
        v.__index = i;
        // flexo.push_all(this.edges, v.outgoing);
      }, this);
      // return this;
      var queue = this.vertices.filter(function (vertex) {
        vertex.__out = vertex.outgoing.filter(function (edge) {
          if (edge.delay >= 0) {
            edges.push(edge);
            return false;
          }
          return true;
        }).length;
        return vertex.__out === 0;
      });
      var incoming = function (edge) {
        console.log("Incoming edge: v%0 -> v%1"
            .fmt(edge.source.__index, edge.dest.__index));
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
        return !(edge.delay >= 0);
      };
      var prioritize = function (a, b) {
        return b.priority - a.priority;
      }
      while (queue.length > 0) {
        flexo.unshift_all(this.edges, queue.shift().incoming.filter(delayed)
            .map(incoming).sort(prioritize));
      }
      this.vertices.forEach(function (vertex) {
        if (vertex.__out !== 0) {
          console.error("sort_edges: unqueued vertex", vertex.__index);
        }
        delete vertex.__out;
      });
      return this;
    }
  });


  // Vertex < Object
  //   Edge*  incoming
  //   Edge*  outgoing
  bender.Vertex = flexo._ext(bender.Base, {
    init: function () {
      this.incoming = [];
      this.outgoing = [];
      return bender.Base.init.call(this);
    }
  });


  // WatchVertex < Vertex
  //   Watch  watch
  bender.WatchVertex = flexo._ext(bender.Vertex, {
    init: function (watch) {
      this.watch = watch;
      return bender.Vertex.init.call(this);
    }
  });


  // AdapterVertex < Vertex
  //   Adapter  adapter
  bender.AdapterVertex = flexo._ext(bender.Vertex, {
    init: function (adapter) {
      this.adapter = adapter;
      return bender.Vertex.init.call(this);
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
    init: function (source, dest) {
      this.source = source;
      this.dest = dest;
      this.source.outgoing.push(this);
      this.dest.incoming.push(this);
      return bender.Base.init.call(this);
    },

    priority: 0
  });

  // InheritEdge < Edge
  bender.InheritEdge = flexo._ext(bender.Edge, { priority: 1 });


  // AdapterEdge < Object:
  //   Adapter  adapter
  bender.AdapterEdge = flexo._ext(bender.Edge, {
    init: function (source, dest, adapter) {
      this.adapter = adapter;
      return bender.Edge.init.call(this, source, dest);
    }
  });

}());
