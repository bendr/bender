// Graph visualization for Bender

(function (bender) {
  "use strict";

  function dot(vertices) {
    return "digraph bender {\n  node [fontname=\"Helvetica\"];\n  edge [fontname=\"Helvetica\"]\n%0\n}\n"
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
      var out = "%0 -> %1".fmt(name, edge.dest.dot_name());
      if (edge.element && edge.element.select !== "$this") {
        out += " [label=\"%0\"]".fmt(edge.element.select);
      }
      return out;
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
    return "label=\"%0\\n%1/%2\",shape=septagon"
      .fmt(this.element.select, this.element.type, this.index);
  };

  bender.DOMEventVertex.prototype.dot_properties = function () {
    return "label=\"%0\\n%1/%2\",shape=hexagon"
      .fmt(this.get.select, this.get.type, this.index);
  };

  function instances_of(component) {
    var instances = component.instances.slice();
    component.derived.forEach(function (derived) {
      Array.prototype.push.apply(instances, instances_of(derived));
    });
    return instances;
  }

  bender.PropertyVertex.prototype.dot_properties = function () {
    var instances = instances_of(this.element.parent);
    var should_init = instances.reduce(function (acc, instance) {
      return acc + (this.should_init(instance) ? 1 : 0);
    }.bind(this), 0);
    bender._trace("should_init(%0): %1/%2"
        .fmt(this.name, should_init, instances.length));
    return (should_init === instances.length ?
        "label=\"%0/%2\",style=\"filled\",color=\"%1\",fontcolor=white" :
        should_init === 0 ?
          "label=\"%0/%2\",style=\"dashed\",color=\"%1\",fontcolor=\"%1\"" :
          "label=\"%0/%2\",style=\"bold\",color=\"%1\",fontcolor=\"%1\"")
      .fmt(this.name, this.element.select() === "$that" ? "#9e0b46" : "#4dbce9",
          this.index);
  };

  bender.WatchVertex.prototype.dot_properties = function () {
    return "label=\"w%0\",shape=square,fontsize=10".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
