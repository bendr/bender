/* global bender, Component, console, DOMEventListenerEdge, Element,
   Environment, flexo, GetDOMEvent, GetEvent, GetProperty, Set, SetAttribute,
   SetDOMAttribute, SetDOMEvent, SetDOMProperty, SetEvent, SetProperty, Watch,
   window */
// jshint -W097

"use strict";

(function () {
  var init = Environment.init;
  Environment.init = function () {
    this.vertices = [];
    this.scheduled = { now: false, later: [] };
    this.add_vertex(Vortex.create());
    return init.call(this);
  };
}());

flexo.make_readonly(Environment, "vortex", function () {
  return this.vertices[0];
});


// Add a vertex to the watch graph and return it. Vertices get an index (useful
// for debugging) and point back to the environment that they’re in. Adding a
// vertex marks the graph as being unsorted.
Environment.add_vertex = function (vertex) {
  vertex.index = this.vertices.length === 0 ?
    0 : (this.vertices[this.vertices.length - 1].index + 1);
  vertex.environment = this;
  this.vertices.push(vertex);
  this.unsorted = true;
  return vertex;
};

// Remove a vertex from the graph as well as all of its incoming and outgoing
// edges. Removing a vertex marks the graph as being unsorted.
Environment.remove_vertex = function (vertex) {
  flexo.remove_from_array(this.vertices, vertex);
  vertex.incoming.forEach(remove_edge);
  vertex.outgoing.forEach(remove_edge);
  this.unsorted = true;
  return vertex;
};

// Request the graph to be flushed (several requests in a row will result in
// flushing only once.) If q is passed, this a queue from a delayed call.
Environment.flush_graph = function (q) {
  if (this.scheduled.now) {
    if (q) {
      flexo.asap(this.flush_graph.bind(this, q));
    }
    return;
  }
  this.scheduled.now = true;
  if (q) {
    q.forEach(function (f) {
      f();
    });
  }
  flexo.asap(function () {
    if (this.unsorted) {
      this.edges = sort_edges(this.vertices);
      this.unsorted = false;
    }
    this.edges.forEach(function (edge) {
      edge.source.values.forEach(function (v) {
        var v_ = edge.follow.apply(edge, v);
        if (v_) {
          if (v_.multiple) {
            v_.forEach(function (v__) {
              edge.dest.push_value(v__);
            });
          } else {
            edge.dest.push_value(v_);
          }
        }
      });
    });
    this.vertices.forEach(function (vertex) {
      vertex.values.length = 0;
    });
    this.scheduled.now = false;
  }.bind(this));
};

// Schedule a graph flush *after* the currently scheduled flush has happened
// (for delayed edges.)
Environment.flush_graph_later = function (f, delay) {
  if (delay > 0) {
    var t = Date.now() + delay;
    var q;
    for (var i = 0, n = this.scheduled.later.length; i < n; ++i) {
      q = this.scheduled.later[i];
      if (t < q[0]) {
        break;
      }
      if (t === q[0]) {
        q.push(f);
        return;
      }
    }
    q = [t, f];
    this.scheduled.later.splice(i, 0, q);
    window.setTimeout(function () {
      flexo.remove_from_array(this.scheduled.later, q);
      q.shift();
      this.flush_graph(q);
    }.bind(this), delay);
  } else {
    this.flush_graph([f]);
  }
};


// Render the graph for the component by adding new watches for the property
// bindings, and then rendering all watches.
Component.render_graph = function () {
  flexo.values(this.own_properties).forEach(function (property) {
    if (property.hasOwnProperty("_value_string")) {
      property.value(property.value_from_string(property._value_string,
          property._value_string_needs_return, this.url()));
    }
    if (Object.keys(property.bindings).length > 0) {
      var watch = Watch.create().child(SetProperty.create(property.name,
          property.select()).value(property.value()));
      watch.bindings = true;
      Object.keys(property.bindings).forEach(function (id) {
        Object.keys(property.bindings[id]).forEach(function (prop) {
          watch.insert_child(GetProperty.create(prop).select(id));
        });
      });
      this.insert_child(watch);
    }
  }, this);
  this.watches.forEach(function (watch) {
    watch.render(this.scope);
  }, this);
};

// Setup inheritance edges: if B inherits from A and both have vertex for e.g.
// a property x, make an inheritance edge from A`x to B`x. Then for all outgoing
// edges of A that are not inheritance edges, add a cloned edge from B.
// TODO this could be avoided by looking up inheritance edge during traversal
Component.inherit_edges = function () {
  ["event", "property"].forEach(function (kind) {
    var p = Object.getPrototypeOf(this);
    if (p.hasOwnProperty("vertices")) {
      Object.keys(this.vertices[kind]).forEach(function (name) {
        if (name in p.vertices[kind]) {
          var source = p.vertices[kind][name];
          var dest = this.vertices[kind][name];
          source.add_outgoing(InheritEdge.create(dest));
          source.outgoing.forEach(function (edge) {
            if (Object.getPrototypeOf(edge) !== InheritEdge) {
              dest.add_outgoing(edge.redirect());
            }
          });
        }
      }, this);
    }
  }, this);
};

// Flush the graph after setting a property on a component.
Component.did_set_property = function (name, value) {
  var vertex = this.vertices.property[name];
  if (vertex) {
    vertex.push_value([this.scope, value]);
    this.scope.environment.flush_graph();
  }
};


// Render the watch and the corresponding get and set edges in the parent
// component scope
Watch.render = function (scope) {
  var w = scope.environment
    .add_vertex(WatchVertex.create(this, scope["#this"]));
  this.gets.forEach(function (get) {
    var v = get.render(scope);
    if (v) {
      var edge = v.add_outgoing(WatchEdge.create(get, w));
      var delay = get.delay();
      if (delay >= 0) {
        edge.delay = delay;
      }
    }
  }, this);
  this.sets.forEach(function (set) {
    w.add_outgoing(set.render(scope));
  });
};

// Render a GetDOMEvent element into the corresponding DOMEventVertex.
GetDOMEvent.render = function (scope) {
  return vertex_dom_event(this, scope);
};

// Render a GetEvent element into the corresponding EventVertex.
GetEvent.render = function (scope) {
  return vertex_event(this, scope);
};

// Render a GetProperty element into the corresponding GetProperty vertex.
GetProperty.render = function (scope) {
  return vertex_property(this, scope);
};

// TODO GetAttribute.render


Set.render = function (scope) {
  return ElementEdge.create(this, scope.environment.vortex);
};

SetDOMEvent.render = function (scope) {
};

SetEvent.render = function (scope) {
};

SetDOMProperty.render = function (scope) {
};

SetProperty.render = function (scope) {
};

SetDOMAttribute.render = function (scope) {
};

SetAttribute.render = function (scope) {
};


// Vertices

// The basic vertex keeps track of incoming and outgoing edges. During traversal
// it stores associated values.
var Vertex = bender.Vertex = {
  init: function () {
    this.incoming = [];
    this.outgoing = [];
    this.values = [];
    return this;
  },

  create: Element.create,

  // Add an incoming edge to the vertex, setting the destination of the edge at
  // the same time.
  add_incoming: function (edge) {
    edge.dest = this;
    this.incoming.push(edge);
    return edge;
  },

  // Add an outgoing edge to the vertex, setting the source of the edge at the
  // same time.
  add_outgoing: function (edge) {
    if (!edge) {
      return;
    }
    edge.source = this;
    this.outgoing.push(edge);
    if (!edge.dest) {
      edge.dest = this.environment.vortex;
      edge.dest.incoming.push(edge);
    }
    return edge;
  },

  // Push a value (really, a scope/value pair) to the values of a vertex in the
  // graph. If a value for the same component is already in the list of values,
  // the value is updated (TODO check this with priorities.)
  push_value: function (v) {
    if (!flexo.find_first(this.values, function (w) {
      if (v[0]["@this"] === w[0]["@this"]) {
        w[1] = v[1];
        return true;
      }
    })) {
      this.values.push(v);
    }
  }
};


// The vortex is a sink and cannot have outgoing edges. Normally, there is only
// one vortex in the graph. Because it is a sink, it does not store values
// either.
var Vortex = bender.Vortex = flexo._ext(Vertex, {
  add_outgoing: flexo.nop,
  push_value: flexo.nop
});


// A watch vertex corresponds to a watch element and is the interface between
// get and set elements of the watch.
var WatchVertex = bender.WatchVertex = flexo._ext(Vertex, {
  init: function (watch, component) {
    this.watch = watch;
    this.component = component;
    return Vertex.init.call(this);
  }
});


var DOMEventVertex = bender.DOMEventVertex = flexo._ext(Vertex, {
  init: function (component, select, type) {
    this.element = component;
    this.select = select;
    this.type = type;
    return Vertex.init.call(this);
  },

  /* TODO
  add_event_listener: function (scope, edge) {
    var target = scope[edge.element.select()];
    if (edge.element.property) {
      var vertex = vertex_property(edge.element, scope["#this"].scope);
      if (vertex) {
        vertex.add_outgoing(DOMEventListenerEdge.create(this, scope, edge));
      }
    } else {
      this.add_event_listener_to_target(scope, edge, target);
    }
  },

  add_event_listener_to_target: function (scope, edge, target) {
    if (!target || typeof target.addEventListener !== "function") {
      console.warn("No target %0 for event listener %1"
          .fmt(edge.element.select(), edge.element.type));
      return;
    }
    var listener = function (e) {
      if (edge.element.preventDefault()) {
        e.preventDefault();
      }
      if (edge.element.stopPropagation()) {
        e.stopPropagation();
      }
      this.push_value([scope, e]);
      scope.environment.flush_graph();
    }.bind(this);
    target.addEventListener(edge.element.type, listener, false);
    return function () {
      target.removeEventListener(edge.element.type, listener, false);
    };
  }
  */
});


// Simple super-class for “outlet” style vertex, i.e., component and event
// vertex. An outlet vertex points back to the target component and has a name
// property for the desired outlet.
var OutletVertex = bender.OutletVertex = flexo._ext(Vertex, {
  init: function (target, name) {
    this.target = target;
    this.name = name;
    return Vertex.init.call(this);
  }
});


var EventVertex = bender.EventVertex = Object.create(OutletVertex);
var PropertyVertex = bender.PropertyVertex = Object.create(OutletVertex);


// Edges

var Edge = bender.Edge = {
  init: function (dest) {
    if (dest) {
      dest.add_incoming(this);
    }
    return this;
  },

  create: Element.create,

  // Make a copy of this edge to be added to a new source vertex (the source
  // will be rewritten once the cloned edge is added to its new source.)
  redirect: function (dest) {
    var edge = Object.create(this);
    edge.dest = dest;
    dest.add_incoming(edge);
  },

  // Remove self from the list of outgoing edges of the source and the list of
  // incoming edges of the destination.
  remove: function () {
    flexo.remove_from_array(this.source.outgoing);
    flexo.remove_from_array(this.dest.incoming);
    delete this.source;
    delete this.dest;
  },

  // Follow an edge: return the scope for the destination vertex and the value
  // for that scope; or nothing at all.
  follow: function (scope, input, prev_scope) {
    try {
      var inner_scope = this.enter_scope(scope);
      if (inner_scope) {
        var outer_scope = inner_scope;
        if (this.pop_scope) {
          outer_scope = prev_scope;
        }
        outer_scope = this.exit_scope(inner_scope, outer_scope);
        if (!outer_scope || !this.match(inner_scope, input)) {
          return;
        }
        var v = [outer_scope, this.follow_value(inner_scope, input)];
        if (this.push_scope) {
          v.push(inner_scope);
        }
        if (this.delay >= 0) {
          scope.environment.flush_graph_later(function () {
            // TODO check that there are no side effects here
            this.apply_value.apply(this, v);
            this.dest.push_value(v);
          }.bind(this), this.delay);
          return;
        }
        this.apply_value.apply(this, v);
        return v;
      }
    } catch (e) {
      if (e !== "fail") {
        console.warn("Exception while following edge:", e.message || e);
      }
    }
  },

  enter_scope: flexo.fst,
  exit_scope: flexo.snd,
  match: flexo.funcify(true),
  follow_value: flexo.snd,
  apply_value: flexo.nop,

};

var remove_edge = Function.prototype.call.bind(Edge.remove);


// Inherit edges (cf. Component.inherit_edges)
var InheritEdge = bender.InheritEdge = flexo._ext(Edge);


// Edges that are tied to an element (e.g., watch, get, set)
var ElementEdge = bender.ElementEdge = flexo._ext(Edge, {
  init: function (element, dest) {
    this.element = element;
    return Edge.init.call(this, dest);
  },

  follow_value: function (scope, input) {
    var f = this.element.value();
    return typeof f === "function" ?
      f.call(scope["#this"], scope, input) : input;
  }
});

flexo.make_readonly(ElementEdge, "match", function () {
  return this.element.match_function;
});


// Edges to a watch vertex
var WatchEdge = bender.WatchEdge = flexo._ext(ElementEdge, {
  push_scope: true,
});


// Sort all edges in a graph from its set of vertices. Simply go through the
// list of vertices, starting with the sink vertices (which have no outgoing
// edge) and moving edges from the vertices to the sorted list of edges.
function sort_edges(vertices) {
  var edges = [];
  var queue = vertices.filter(function (vertex) {
    vertex.__out = vertex.outgoing.filter(function (edge) {
      if (edge.delay >= 0) {
        edges.push(edge);
        return false;
      }
      return true;
    }).length;
    return vertex.__out === 0;
  });
  var process_incoming_edge = function (edge) {
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
    // jshint -W018
    // this handles NaN as well as negative values
    return !(edge.delay >= 0);
  };
  while (queue.length > 0) {
    flexo.unshift_all(edges,
        queue.shift().incoming.filter(delayed).map(process_incoming_edge));
  }
  vertices.forEach(function (vertex) {
    if (vertex.__out !== 0) {
      console.error("sort_edges: unqueued vertex", vertex);
    }
    delete vertex.__out;
  });
  return edges;
}

// Get a DOM event vertex, either returning an already existing vertex or
// creating a new one.
function vertex_dom_event(element, scope) {
  var target = scope[element.select()];
  if (!target) {
    // TODO pending vertices should be rendered and then be updated when the
    // target appears (and conversely, when the target disappears, it should go
    // into a pending state.)
    console.warn("No target for DOM event vertex; select=\"%0\" in scope"
        .fmt(element.select()), scope);
  }
  var vertices = element.component.vertices.dom;
  var id = target === scope.document ? "" : target.id();
  if (!vertices.hasOwnProperty(id)) {
    vertices[id] = {};
  }
  if (!vertices[id].hasOwnProperty(element.type)) {
    vertices[id][element.type] = scope.environment.add_vertex(DOMEventVertex
        .create(element.component, element.select(), element.type));
  }
  return vertices[id][element.type];
}

// Get an event vertex, either returning an already existing vertex or creating
// a new one.
function vertex_event(element, scope) {
  var target = scope[element.select()];
  if (!target) {
    // TODO pending vertices
    console.warn("No target for event vertex; select=\"%0\" in scope"
        .fmt(element.select()), scope);
    return;
  }
  var vertices = target.vertices.event;
  if (!vertices.hasOwnProperty(element.type)) {
    vertices[element.type] = scope.environment.add_vertex(EventVertex
        .create(target, element.type));
  }
  return vertices[element.type];
}

// Get a vertex for a property from an element and its scope, creating it
// first if necessary. Note that this can be called for a property vertex,
// but also from an event vertex (when introducing event listener edges.)
function vertex_property(element, scope) {
  var target = scope[element.select()];
  if (!target) {
    // TODO pending vertices
    console.warn("No target for property vertex; select=\"%0\" in scope"
        .fmt(element.select()), scope);
    return;
  }
  var vertices = target.vertices.property;
  var name = element.name || element.property;
  if (!vertices.hasOwnProperty(name)) {
    vertices[name] = scope.environment.add_vertex(PropertyVertex
        .create(target, name));
  }
  return vertices[name];
}
