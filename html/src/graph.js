(function (bender) {
  "use strict";

  /* global console, flexo */

  var _class = flexo._class;


  // Add a vertex to the watch graph and return it.
  // TODO [mutations] Remove a vertex from the watch graph.
  bender.Environment.prototype.add_vertex = function (vertex) {
    vertex.index = this.vertices.length === 0 ?
      0 : (this.vertices[this.vertices.length - 1].index + 1);
    vertex.environment = this;
    this.vertices.push(vertex);
    return vertex;
  };

  // TODO Flush the graph to initialize properties of rendered components so far
  bender.Environment.prototype.flush_graph = function () {
  };


  bender.Instance.prototype.add_event_listeners = function () {};


  // Simple vertex, simply has incoming and outgoing edges.
  var vertex = (bender.Vertex = function () {}).prototype;

  vertex.init = function () {
    this.incoming = [];
    this.outgoing = [];
    this.values = [];
    return this;
  };

  vertex.add_incoming = function (edge) {
    edge.dest = this;
    this.incoming.push(edge);
    return edge;
  };

  vertex.add_outgoing = function (edge) {
    edge.source = this;
    this.outgoing.push(edge);
    if (!edge.dest) {
      edge.dest = this.environment.vortex;
      edge.dest.incoming.push(edge);
    }
    return edge;
  };


  // We give the vortex its own class for graph reasoning purposes
  var vortex = _class(bender.Vortex = function () {
    this.init();
  }, bender.Vertex);

  vortex.add_outgoing = function () {
    throw "Cannot add outgoing edge to vortex";
  };


  // Watch vertex corresponding to a watch element, gathers the inputs and
  // outputs of the watch
  var watch_vertex = _class(bender.WatchVertex = function (watch, component) {
    this.init();
    this.watch = watch;
    this.component = component;
  }, bender.Vertex);

  // Shift the input dynamic scope to the new scope for the watch
  watch_vertex.shift_scope = function (scope, select) {
    var i, n;
    if (scope.$this.scopes) {
      var scopes = scope.$this.scopes;
      for (i = 0, n = scopes.length; i < n; ++i) {
        for (var j = 0, m = scopes[i][""].length; j < m; ++j) {
          for (var k = 0, l = scopes[i][""][j].scopes.length;
              k < l && scopes[i][""][j].scopes[k].$that !== this.component; ++k)
            {}
          if (k < l) {
            var scope_ = scopes[i][""][j].scopes[k];
            if (scope_[select || "$this"] === scope.$this) {
              return scope_;
            }
          }
        }
      }
    } else {
      for (i = 0, n = scope.$this[""].length; i < n; ++i) {
        if (scope.$this[""][i] === this.component) {
          return scope.$this[""][i].scope;
        }
      }
    }
  };




  var edge = (bender.Edge = function () {}).prototype;

  edge.init = function (dest) {
    if (dest) {
      dest.add_incoming(this);
    }
    return this;
  };

  // Follow an edge: return the scope for the destination vertex and the value
  // for that scope; or nothing at all.
  edge.follow = function (scope, input) {
    try {
      return [scope, this.followed(scope, this.element.value() ?
        this.element.value().call(scope.$this, scope, input) : input)];
    } catch (e) {
    }
  };


  // Edges that are tied to an element (e.g., watch, get, set) and a scope
  var element_edge = _class(bender.ElementEdge = function () {}, bender.Edge);

  element_edge.init = function (element, dest) {
    edge.init.call(this, dest);
    this.element = element;
    return this;
  };


  // Edges to a watch vertex
  var watch_edge = _class(bender.WatchEdge = function (get, dest) {
    this.init(get, dest);
  }, bender.ElementEdge);

  // Follow a watch edge: shift the input scope to match that of the destination
  // watch node, and evaluate the value of the edge using the watch’s context.
  watch_edge.follow = function (scope, input) {
    try {
      var scope_ = this.dest.shift_scope(scope, this.element.select);
      return [scope_, this.element.value() ?
        this.element.value().call(scope_.$this, scope_, input) : input];
    } catch (e) {
      console.warn("Error following watch edge v%0 -> v%1: %2"
          .fmt(this.source.index, this.dest.index, e));
    }
  };





  
}(this.bender));
