// Graph visualization for Bender

(function (bender) {
  "use strict";

  function dot(vertices) {
    return "digraph bender {\n  node [fontname=\"Helvetica\"];\n%0\n}\n"
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

  // Create a dot representation of the graph
  bender.Vertex.prototype.dot = function () {
    var name = this.dot_name();
    var desc = this.outgoing.map(function (edge) {
      return "%0 -> %1".fmt(name, edge.dest.dot_name());
    });
    var props = this.dot_properties();
    if (props) {
      desc.unshift("%0 [%1]".fmt(name, props));
    }
    return desc;
  };

  bender.Vertex.prototype.dot_name = function () {
    return "v%0".fmt(this.index);
  };

  bender.Vertex.prototype.dot_properties = function () {
    return "shape=" + (this.outgoing.length === 0 ? "doublecircle" : "circle");
  };

  bender.EventVertex.prototype.dot_properties = function () {
    return "label=\"%0\\n%1\",shape=septagon"
      .fmt(this.get.select, this.get.type);
  };

  bender.DOMEventVertex.prototype.dot_properties = function () {
    return "label=\"%0\\n%1\",shape=invtrapezium"
      .fmt(this.get.select, this.get.type);
  };

  bender.PropertyVertex.prototype.dot_properties = function () {
    return (this.should_init() ?
        "label=\"%0\",style=\"filled\",color=\"%1\",fontcolor=white" :
        "label=\"%0\",style=\"bold\",color=\"%1\",fontcolor=\"%1\"")
      .fmt(this.name, this.static ? "#603018" : "#790f5b");
  };

  bender.WatchVertex.prototype.dot_properties = function () {
    return "label=\"w%0\",shape=square,fontsize=10".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
