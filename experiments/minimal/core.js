// Bender core, implementing only the processing model as defined in
// /spec/data-model.html and /spec/processing-model.html. See runtime.js for
// the runtime, XML serialization, and other sorts of syntactic sugar.

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


  // Base for all objects
  bender.Base = {

    // The initializer must return the initialized object
    init: flexo.self,

    // Create a new object and initialize it
    create: function () {
      return this.init.apply(Object.create(this), arguments);
    }
  };


  // Node < Object
  //   Node?  parent
  //   Node*  children
  bender.Node = flexo._ext(bender.Base, {
    init: function () {
      this.children = [];
      return bender.Base.init.call(this);
    },

    add_child: function (child) {
      if (child.parent) {
        console.error("Child already has a parent");
        return this;
      }
      child.parent = this;
      this.children.push(child);
      return child.added();
    },

    added: flexo.self,

    child: function (child) {
      return this.add_child(child), this;
    }
  });

  flexo._accessor(bender.Node, "name", flexo.safe_trim);


  // Component < Node
  //   Component?  prototype
  //   Property*   property-definitions
  //   data*       properties
  //   View?       view
  //   Watch*      watches
  bender.Component = flexo._ext(bender.Node, {
    init: function (view) {
      this._name = flexo.random_id();
      bender.Node.init.call(this);
      this.property_definitions = "property_definitions" in this ?
        Object.create(this.property_definitions) : {};
      this.properties = {};
      if (!view) {
        view = bender.View.create(true);
      }
      if (view.component) {
        console.error("View already in a component");
      }
      this.view = view;
      this.view.component = this;
      this.view.add_child_components();
      this.watches = [];
      this.__render_subgraph = true;
      this.property_vertices = {};
      this.event_vertices = {};
      return this;
    },

    // Add a property to the component and return the component.
    property: function (property) {
      if (property in this.properties) {
        console.error("Property %0 already defined".fmt(property.name));
        return this;
      }
      this.property_definitions[property.name] = property;
      property.component = this;
      return this;
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
    }
  });

  Object.defineProperty(bender.Component, "prototype", {
    enumerable: true,
    get: function () {
      var prototype = Object.getPrototypeOf(this);
      if (prototype !== bender.Component) {
        return prototype;
      }
    }
  });


  // Property < Base
  //   Component  component
  //   string     name
  bender.Property = flexo._ext(bender.Base, {
    init: function (name) {
      this.name = name;
      return bender.Base.init.call(this);
    }
  });


  // Element < Node
  //   View  view
  bender.Element = flexo._ext(bender.Node);

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
    init: function (_default) {
      this.default = !!_default;
      return bender.Element.init.call(this);
    },

    add_child: function (child) {
      if (this.default) {
        console.error("Cannot add children to a default view");
        return;
      }
      if (this.component) {
        this.add_child_components(child);
      }
      return bender.Element.add_child.call(this, child);
    },

    add_child_components: function (child) {
      flexo.beach_all(child ? [child] : this.children, function (element) {
        if (element.component) {
          this.component.add_child(element.component);
        } else {
          return element.children;
        }
      }, this);
    },

    added: function () {
      var parent_component = this.parent && this.parent.component;
      if (parent_component) {
        parent_component.add_child(this.component);
      }
      return this;
    }
  });

  Object.defineProperty(bender.View, "view", {
    enumerable: true,
    get: flexo.self
  });


  // Content < Element
  bender.Content = flexo._ext(bender.Element);


  // DOMElement < Element
  //   string  ns
  //   string  name
  //   data*   attributess
  bender.DOMElement = flexo._ext(bender.Element, {
    init: function (ns, name, attributes) {
      this.namespace_uri = ns;
      this.local_name = name;
      this.attributes = attributes || {};
      this.event_vertices = {};
      return bender.Element.init.call(this);
    }
  });


  // Attribute < Element
  //   string  ns
  //   string  name
  bender.Attribute = flexo._ext(bender.Element, {
    init: function (ns, name) {
      this.ns = ns;
      this.name = name;
      return bender.Element.init.call(this);
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
      return this;
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
              if (edge.priority === 1) {
                var edge_ = Object.create(edge);
                edge_.source = vertices[name];
                vertices[name].outgoing.push(edge_);
                edge_.dest.incoming.push(edge_);
                edge_.priority = 0;
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
        console.log("Incoming: v%0 -> v%1"
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
        console.log("Queue:", queue.map(function (v) {
          return "v%0 (%1)".fmt(v.__index, v.__out);
        }).join(" "));
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

    priority: 1
  });

  // InheritEdge < Edge
  bender.InheritEdge = flexo._ext(bender.Edge, { priority: 2 });


  // AdapterEdge < Object:
  //   Adapter  adapter
  bender.AdapterEdge = flexo._ext(bender.Edge, {
    init: function (source, dest, adapter) {
      this.adapter = adapter;
      return bender.Edge.init.call(this, source, dest);
    }
  });

}());
