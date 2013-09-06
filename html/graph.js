// Graph visualization for Bender

(function (bender) {
  "use strict";

  // Create a dot description of the watch graph as a string
  bender.Environment.prototype.dot = function () {
    return "digraph bender {\n  rankdir=LR\n  node [fontname=\"Inconsolata\"];\n%0\n}\n"
      .fmt(this.vertices.map(function (vertex) {
      return vertex.dot().map(function (line) {
        return "  %0;".fmt(line);
      }).join("\n");
    }).join("\n"));
  };

  bender.Vertex.prototype.dot = function () {
    var self = this.dot_name();
    var desc = this.outgoing.map(function (edge) {
      return "%0 -> %1".fmt(self, edge.dest.dot_name());
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

  bender.Vertex.prototype.dot_name = function () {
    return "v%0".fmt(this.index);
  };

  bender.Vertex.prototype.dot_label = function () {};

  bender.Vertex.prototype.dot_shape = function () {
    if (this.outgoing.length === 0) {
      return "doublecircle";
    }
  };

  bender.PropertyVertex.prototype.dot_label = function () {
    return "%0%1`%2".fmt(this.component instanceof bender.Component ? "#" : "@",
        this.component.index, this.property.name);
  };

  bender.WatchVertex.prototype.dot_label = function () {
    return "w%0".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
