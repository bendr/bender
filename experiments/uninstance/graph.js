/* global bender, Element, flexo */
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

flexo.make_readonly(bender.Environment, "vortex", function () {
  return this.vertices[0];
});


// Add a vertex to the watch graph and return it.
bender.Environment.add_vertex = function (vertex) {
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
