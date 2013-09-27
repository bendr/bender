// Graph visualization for Bender

(function (bender) {
  "use strict";

  function dot(vertices) {
    return "digraph bender {\n  node [fontname=\"Inconsolata\"];\n%0\n}\n"
      .fmt(vertices.map(function (vertex) {
        return vertex.dot().map(function (line) {
          return "  %0;".fmt(line);
        }).join("\n");
      }).join("\n"));
  }

  // Create a dot description of the watch graph as a string
  bender.Environment.prototype.dot = function () {
    return dot(this.vertices);
  };

  // Edge sort using a depth-first search traversal
  bender.Environment.prototype.dot_sort = function () {
    // TODO count down incoming edges from event vertices with no incoming edge
    // Then count down incoming edges from property vertices with no incoming
    // edge; visit protoedges first (or not at all?)
    var queue = this.vertices.filter(function (vertex) {
      return vertex.incoming.length === 0 &&
        !(vertex instanceof bender.PropertyVertex);
    });
    while (queue.length) {
      var vertex = queue.shift();
      vertex.outgoing.forEach(function (edge) {
        var dest = edge.dest;
        if (!dest.hasOwnProperty("__incoming")) {
          dest.__incoming = dest.incoming.length;
        }
        if (--dest.__incoming === 0) {
          queue.push(dest);
        }
      });
    }
    queue = this.vertices.filter(function (vertex) {
      return vertex.incoming.length === 0 &&
        vertex instanceof bender.PropertyVertex;
    });
    var edges = [];
    while (queue.length) {
      var vertex = queue.shift();
      vertex.outgoing.forEach(function (edge) {
        var dest = edge.dest;
        if (!dest.hasOwnProperty("__incoming")) {
          dest.__incoming = dest.incoming.length;
          if (dest.protoedge && dest.__incoming > 1) {
            dest.protoedge.__nofollow = true;
            --dest.__incoming;
          }
        }
        if (!edge.__nofollow) {
          edge.__init_order = edges.length;
          edges.push(edge);
          if (--dest.__incoming === 0) {
            queue.unshift(dest);
            delete dest.__incoming;
          }
        } else {
          delete edge.__nofollow;
        }
      });
    }
    return edges;

    /*
    var queue = this.vertices.filter(function (vertex) {
      return vertex instanceof bender.PropertyVertex &&
        vertex.incoming.length === 0;
    });
    var edges = [];
    while (queue.length) {
      var vertex = queue.shift();
      vertex.outgoing.forEach(function (edge) {
        var dest = edge.dest;
        if (edge !== dest.protoedge || dest.incoming.length === 1) {
          edge.__init_order = edges.length;
          edges.push(edge);
          if (!dest.__select) {
            dest.__select = true;
            queue.unshift(dest);
          }
        }
      });
    }
    return edges;
    */
  }

  // Create a dot description of the watch graph with pruning
  bender.Environment.prototype.dot_pruned = function () {
    var queue = [this.vortex];
    var vertices = [];
    while (queue.length) {
      var vertex = queue.shift();
      if (!vertex.__seen) {
        vertices.push(vertex);
        vertex.__seen = true;
        vertex.incoming.forEach(function (edge) {
          queue.push(edge.source);
        });
      }
    }
    return dot(vertices.map(function (vertex) {
      delete vertex.__seen;
      return vertex;
    }));
  };

  bender.Vertex.prototype.dot = function () {
    var self = this.dot_name();
    var desc = this.outgoing.map(function (edge) {
      return edge.hasOwnProperty("__init_order") ?
        "%0 -> %1 [label=\"%2\", color=red]".fmt(self, edge.dest.dot_name(), edge.__init_order) :
      edge.__unfollow ?
        "%0 -> %1 [color=blue]".fmt(self, edge.dest.dot_name()) :
        "%0 -> %1".fmt(self, edge.dest.dot_name());
    });
    var shape = this.dot_shape();
    if (shape) {
      desc.unshift("%0 [shape=%1]".fmt(self, shape));
    }
    var label = this.dot_label();
    if (label) {
      desc.unshift("%0 [label=\"%1\"]".fmt(self, label));
    }
    return desc;
  };

  bender.Vertex.prototype.unmark = function () {
    return this;
  };

  bender.Vertex.prototype.dot_name = function () {
    return "v%0".fmt(this.index);
  };

  bender.Vertex.prototype.dot_label = function () {};

  bender.Vertex.prototype.dot_shape = function () {};

  bender.EventVertex.prototype.dot_shape = function () {
    return "septagon";
  };

  bender.EventVertex.prototype.dot_label = function () {
    return this.get.type;
  };

  bender.DOMEventVertex.prototype.dot_shape = function () {
    return "house";
  };

  bender.DOMEventVertex.prototype.dot_label = function () {
    return this.get.type;
  }

  bender.PropertyVertex.prototype.dot_label = function () {
    return this.name;
  };

  bender.PropertyVertex.prototype.dot_shape = function () {
    return this.static ? "egg" : "oval";
  };

  bender.WatchVertex.prototype.dot_label = function () {
    return "w%0".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
