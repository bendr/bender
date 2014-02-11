// jshint -W097

"use strict";


// Intialize the empty graph
bender.init_graph = function () {
  this.vertices = [];
  this.scheduled = { now: false, later: [] };
  var vortex = bender.add_vertex(Vortex.create());
  flexo.make_readonly(bender, "vortex", vortex);
};


// Add a vertex to the watch graph and return it. Vertices get an index (useful
// for debugging.) Adding a vertex marks the graph as being unsorted.
// TODO add vertices while keeping the graph sorted?
bender.add_vertex = function (vertex) {
  vertex.index = this.vertices.length === 0 ?
    0 : (this.vertices[this.vertices.length - 1].index + 1);
  this.vertices.push(vertex);
  this.unsorted = true;
  return vertex;
};

// Request the graph to be flushed (several requests in a row will result in
// flushing only once.) If q is passed, this a queue from a delayed call.
bender.flush_graph = function (q) {
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
bender.flush_graph_later = function (f, delay) {
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


// Amend component finalization to render the graph as well
(function () {
  var finalize = Component.finalize;
  Component.finalize = function () {
    if (this.__pending_finalize) {
      finalize.call(this).render_graph();
    }
    return this;
  };
}());

// Render the graph for the component by adding new watches for the property
// bindings, and then rendering all watches.
Component.render_graph = function () {
  var prototype = this.prototype;
  if (prototype) {
    prototype.render_graph();
  }
  this.children.forEach(function (ch) {
    ch.render_graph();
  });
  /*
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
  */
  this.watches.forEach(function (watch) {
    watch.render();
  }, this);
  return this.init_properties();
};

// Add event listeners for get edges to DOM element nodes
Component.add_event_listeners = function () {
  this.watches.forEach(function (watch) {
    watch.gets.forEach(function (get) {
      get.add_event_listener(this);
    }, this);
  }, this);
  return this;
};

// Add a Bender event listener for the component
Component.add_event_listener = function (scope, type, vertex) {
  flexo.listen(this, type, function (e) {
    vertex.push_value([scope, e]);
    bender.flush_graph();
  });
};

// Initialize component properties. For the component itself, it means
// initializing the properties of its prototype, then its children’s, then its
// own, then its instances’s. For an instance, initialize the properties only if
// the component was initialized (for instances created later on.)
Component.init_properties = function () {
  this.init_properties
    [this.hasOwnProperty("instances") ? "component" : "instance"].call(this);
  return this;
};

Component.init_properties.component = function () {
  var prototype = Object.getPrototypeOf(this);
  if (prototype.hasOwnProperty("instances")) {
    prototype.init_properties();
  }
  this.inherit_edges();
  this.children.forEach(function (ch) {
    ch.init_properties();
  });
  for (var name in this.property_definitions) {
    var property = this.property_definitions[name];
    property.init_value();
    if (property.select() === "#this") {
      this.init_property(property);
    }
  }
};

Component.init_properties.instance = function () {
  for (var name in this.property_definitions) {
    var property = this.property_definitions[name];
    if (property.select() === "@this") {
      this.init_property(property);
    }
  }
};

// Initialize a single property as long as it has no bindings (in which case it
// will be initialized through graph traversal.)
Component.init_property = function (property) {
  if (Object.keys(property.bindings).length > 0) {
    return;
  }
  try {
    if (property.match().call(this, this.scope)) {
      var value = this.init_values.hasOwnProperty(property.name) ?
        property.value_from_string(this.init_values[property.name], true) :
        property.value();
      this.properties[property.name] = value.call(this, this.scope);
    }
  } catch (e) {
    console.error("Could not initialize property");
  }
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
            if (!flexo.instance_of(edge, InheritEdge)) {
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
    bender.flush_graph();
  }
};

// Create a property vertex for the property with the given name.
Component.vertex_property = function (name) {
  var vertices = this.vertices.property;
  if (!(name in vertices)) {
    vertices[name] = bender.add_vertex(PropertyVertex.create(this, name));
  }
  return vertices[name];
};

// Set the property named `name` to `value` from an edge traversal
Component.edge_set_property = function (name, value) {
  set_property_silent(this, name, value);
};


DOMElement.vertex_property = Component.vertex_property;


// Create a property vertex for the text property
Text.vertex_property = function (name) {
  if (name !== "text") {
    console.warn("No property “%0” for text element".fmt(name));
  }
  if (!this.vertex) {
    for (var self = this; !self.hasOwnProperty("instances");
        self = Object.getPrototypeOf(self)) {}
    self.vertex = bender.add_vertex(PropertyVertex.create(self, name));
  }
  return this.vertex;
};

// Set the text property to `value` from an edge traversal
Text.edge_set_property = function (name, value) {
  if (name == null || name === "text") {
    this.text(value);
    if (this.first) {
      this.first.textContent = value;
    }
  }
};



// Render the watch and the corresponding get and set edges in the parent
// component scope
Watch.render = function () {
  var w = bender.add_vertex(WatchVertex.create(this));
  this.gets.forEach(function (get) {
    var v = get.render();
    if (v) {
      var edge = v.add_outgoing(WatchEdge.create(get, w));
      var delay = get.delay();
      if (delay >= 0) {
        edge.delay = delay;
      }
    }
  }, this);
  var scope = this.component.scope;
  this.sets.forEach(function (set) {
    w.add_outgoing(set.render(scope));
  });
};


Get.add_event_listener = flexo.nop;

// Add an event listener for this get for the given instance
GetEvent.add_event_listener = function (instance) {
  var target = instance.scope[this.select()];
  if (target) {
    target.add_event_listener(instance.scope, this.type, vertex_event(this));
  }
};

Element.add_event_listener = flexo.nop;

DOMElement.add_event_listener = function (scope, type, vertex) {
  if (this.first) {
    this.first.addEventListener(type, function (e) {
      vertex.push_value([scope, e]);
      bender.flush_graph();
    });
  }
};


// Render a <get event="..."> element
GetEvent.render = function () {
  return vertex_event(this);
};

// Render a <get property="..."> element
GetProperty.render = function () {
  return vertex_property(this);
};


// Render a <set> element with no property. If the target has a default property
// to be set, use this default, otherwise render an edge to the vortex.
bender.Set.render = function (scope) {
  var target = scope[this.select()];
  if (target && target.default_set_property) {
    return SetProperty.render.call(this, scope, target.default_set_property);
  }
  return Edge.create(bender.vortex);
};

Text.default_set_property = "text";

SetProperty.render = function (scope, property) {
  var dest = vertex_property(this, scope, property);
  if (dest) {
    return PropertyEdge.create(this, dest);
  }
  console.warn("No property %0".fmt(this.name));
};


// The basic vertex keeps track of incoming and outgoing edges. During traversal
// it stores associated values.
var Vertex = bender.Vertex = {
  init: function () {
    this.incoming = [];
    this.outgoing = [];
    this.values = [];
    return this;
  },

  create: Base.create,

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
      edge.dest = bender.vortex;
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
  init: function (watch) {
    this.watch = watch;
    return Vertex.init.call(this);
  }
});


// Simple super-class for “outlet” style vertex, i.e., property and event
// vertex. An outlet vertex points back to the target component and has a name
// property for the desired outlet.
var OutletVertex = bender.OutletVertex = flexo._ext(Vertex, {
  init: function (target, name) {
    this.target = target;
    this.name = name;
    return Vertex.init.call(this);
  }
});


var EventVertex = bender.EventVertex = flexo._ext(OutletVertex);
var PropertyVertex = bender.PropertyVertex = flexo._ext(OutletVertex);


// Edges

var Edge = bender.Edge = {
  init: function (dest) {
    if (dest) {
      dest.add_incoming(this);
    }
    return this;
  },

  create: Base.create,

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
    return this.element.value().call(scope["#this"], scope, input);
  }
});

flexo.make_readonly(ElementEdge, "match", function () {
  return this.element.match();
});



// Edges to a watch vertex
var WatchEdge = bender.WatchEdge = flexo._ext(ElementEdge, {
  push_scope: true,

  enter_scope: function (scope) {
    if (scope["@this"] === scope["#this"]) {
      return scope;
    }
    var component = this.element.watch.component;
    var select = this.element.select();
    for (var i = 0, n = scope["@this"].stack.length; i < n; ++i) {
      var s = scope["@this"].stack[i].scope;
      if (s["#this"] === component) {
        return s;
      }
      for (var j = 0, m = s.derived.length; j < m; ++j) {
        var s_ = s.derived[j];
        if (s["#this"] === component && s[select] === scope["@this"]) {
          return s;
        }
      }
    }
  }

});


var PropertyEdge = bender.PropertyEdge = flexo._ext(ElementEdge, {
  pop_scope: true,

  apply_value: function (scope, value) {
    var target = scope[this.element.select()];
    if (target && typeof target.edge_set_property === "function") {
      target.edge_set_property(this.element.name, value);
    }
  },

  exit_scope: function (inner_scope, outer_scope) {
    var target = inner_scope[this.element.select()];
    outer_scope = exit_scope(this, outer_scope);
    var s = function (v) {
      return v[0]["@this"] === outer_scope["@this"];
    };
    return outer_scope;
  }
});


// TODO multiple scopes (from component to instances)
function exit_scope(edge, scope) {
  if (scope["@this"] === scope["#this"]) {
    return scope;
  }
  var component = edge.dest.target;
  var select = edge.element.select();
  return flexo.find_first(scope.derived, function (s) {
    return s["#this"] === component && s[select] === s["@this"];
  }) || scope;
}

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

// Get an event vertex, either returning an already existing vertex or creating
// a new one.
function vertex_event(element) {
  var target = element.watch.component.scope[element.select()];
  if (!target) {
    console.warn("No target for event vertex; select=“%0” in scope"
        .fmt(element.select()), element.watch.component.scope);
    return;
  }
  var vertices = target.vertices.event;
  if (!vertices) {
    console.warn("Wrong target for event %0; select=“%1” in scope"
        .fmt(element.type, element.select()), element.watch.component.scope);
  }
  if (!vertices.hasOwnProperty(element.type)) {
    vertices[element.type] = bender.add_vertex(EventVertex.create(target,
          element.type));
  }
  return vertices[element.type];
}

// Get a vertex for a property from an element, creating it first if necessary.
// Note that this can be called for a property vertex, but also from an event
// vertex (when introducing event listener edges.)
function vertex_property(element, scope, property) {
  var target = element.watch.component.scope[element.select()];
  if (!target) {
    console.warn("No target for property vertex; select=\"%0\" in scope"
        .fmt(element.select()), element.watch.component.scope);
    return;
  }
  if (typeof target.vertex_property === "function") {
    return target.vertex_property.call(target,
        property || element.name || element.property());
  }
}


bender.init_graph();
