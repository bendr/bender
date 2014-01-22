/* global bender, Component, console, Element, Environment, flexo, window */
// jshint -W097

"use strict";

(function () {
  var init = bender.Environment.init;
  bender.Environment.init = function () {
    Object.defineProperty(this, "vertices", { enumerable: true, value: [] });
    Object.defineProperty(this, "scheduled", {
      enumerable: true,
      value: { now: false, later: [] }
    });
    this.add_vertex(Vortex.create());
    return init.call(this);
  };
}());

flexo.make_readonly(Environment, "vortex", function () {
  return this.vertices[0];
});


// Add a vertex to the watch graph and return it.
Environment.add_vertex = function (vertex) {
  Object.defineProperty(vertex, "index", {
    enumberable: true,
    value: this.vertices.length === 0 ?
      0 : (this.vertices[this.vertices.length - 1].index + 1)
  });
  Object.defineProperty(vertex, "environment", {
    enumerable: true,
    value: this
  });
  this.vertices.push(vertex);
  this.sorted = false;
  return vertex;
};

// Remove a vertex from the graph as well as all of its incoming and outgoing
// edges.
Environment.remove_vertex = function (vertex) {
  flexo.remove_from_array(this.vertices, vertex);
  vertex.incoming.forEach(remove_edge);
  vertex.outgoing.forEach(remove_edge);
  this.sorted = false;
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


// Render the graph for the component by rendering all watches.
Component.render_graph = function () {
  this.watches.forEach(function (watch) {
    watch.render(this.scope);
  }, this);
};

// Setup inheritance edges
Component.inherit_edges = function () {
  ["event", "property"].forEach(function (kind) {
    Object.keys(this.vertices[kind].component).forEach(function (name) {
      if (this.vertices[kind].instance.hasOwnProperty(name)) {
        this.vertices[kind].component[name].add_outgoing(new
          InstanceEdge(this.vertices[kind].instance[name]));
      }
    }, this);
    var p = this.prototype();
    if (p) {
      Object.keys(this.vertices[kind].instance).forEach(function (name) {
        if (name in p.vertices[kind].instance) {
          var source = p.vertices[kind].instance[name];
          var dest = this.vertices[kind].instance[name];
          source.add_outgoing(new bender.InheritEdge(dest));
          source.outgoing.forEach(function (edge) {
            if (Object.getPrototypeOf(edge) === InheritEdge) {
              return;
            }
            dest.add_outgoing(new RedirectEdge(edge));
          });
        }
      }, this);
    }
  }, this);
};

// Flush the graph after setting a property on a component.
Component.did_set_property = function (name, value) {
  var queue = [this];
  while (queue.length > 0) {
    var q = queue.shift();
    if (name in q.vertices.property.component) {
      q.vertices.property.component[name].push_value([q.scope, value]);
    } else if (name in q.vertices.property.instance) {
      // jshint -W083
      flexo.push_all(q.vertices.property.instance[name].values,
          q.all_instances.map(function (instance) {
            return [instance.scope, value];
          }));
    } else {
      flexo.push_all(queue, q.derived);
    }
  }
  this.scope.environment.flush_graph();
};


var Vertex = bender.Vertex = {
  init: function () {
    Object.defineProperty(this, "incoming", { enumerable: true, value: [] });
    Object.defineProperty(this, "outgoing", { enumerable: true, value: [] });
    Object.defineProperty(this, "values", { enumerable: true, value: [] });
    return this;
  },

  create: Element.create,

  add_incoming: function (edge) {
    edge.dest = this;
    this.incoming.push(edge);
    return edge;
  },

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
  // graph.
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

var Vortex = bender.Vortex = flexo._ext(Vertex, {
  add_outgoing: flexo.nop,
  add_incoming: flexo.nop
});

// var remove_edge = Function.prototype.call.bind(Edge.remove);

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
