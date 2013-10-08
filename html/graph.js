// Graph visualization for Bender

(function (bender) {
  "use strict";

  var colors = {
    world: "#ff6a4d",
    browser: "#5eb26b",
    componentprop: "#0b486b",
    instanceprop: "#4dbce9",
    dependency: "#f8ca00",
    dummy: "#f94179"
  };

  function dot(vertices) {
    return "digraph bender {\n  node [fontname=\"Helvetica\"];\n  edge [fontname=\"Helvetica\"]\n%0\n}\n"
      .fmt(vertices.map(function (vertex) {
        return (vertex.dot && vertex.dot() || vertex).map(function (line) {
          return "  %0;".fmt(line);
        }).join("\n");
      }).join("\n"));
  }

  // Create a dot description of the watch graph as a string
  bender.Environment.prototype.dot = function () {
    var vertices = this.vertices.slice();
    var world = ["z [label=\"world\",shape=egg,style=\"filled\",color=\"%0\",fontcolor=white]".fmt(colors.world)];
    this.vertices.forEach(function (v) {
      if (v instanceof bender.DOMEventVertex ||
        v instanceof bender.EventVertex ||
        v instanceof bender.PropertyVertex) {
        world.push("z -> %0 [color=\"%1\"]".fmt(v.dot_name(), colors.world));
      }
    }, this);
    vertices.push(world);
    return dot(vertices);
  };

  // Create a dot representation of the graph
  bender.Vertex.prototype.dot = function () {
    var name = this.dot_name();
    var desc = this.outgoing.map(function (edge) {
      var out = "%0 -> %1".fmt(name, edge.dest.dot_name());
      if (edge instanceof bender.DependencyEdge) {
        out += " [color=\"%0\",style=dashed]".fmt(colors.dependency);
      } else if (edge instanceof bender.DummyEdge) {
        out += " [color=\"%0\",style=dashed]".fmt(colors.dummy);
      } else if (edge.element && edge.element.select !== "$this") {
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

  // Vortex becomes the “browser” state, and points back to DOM events
  bender.Vortex.prototype.dot = function () {
    var desc = ["v%0 [label=\"browser/%0\",shape=egg,style=\"filled\",color=\"%1\",fontcolor=white]".fmt(this.index, colors.browser)];
    this.environment.vertices.forEach(function (v) {
      if (v instanceof bender.DOMEventVertex) {
        desc.push("v%0 -> %1 [color=\"%2\"]"
          .fmt(this.index, v.dot_name(), colors.browser));
      }
    }, this);
    return desc;
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
    return (should_init === instances.length ?
        "label=\"%0/%2\",style=\"filled\",color=\"%1\",fontcolor=white" :
        should_init === 0 ?
          "label=\"%0/%2\",style=\"dashed\",color=\"%1\",fontcolor=\"%1\"" :
          "label=\"%0/%2\",style=\"bold\",color=\"%1\",fontcolor=\"%1\"")
      .fmt(this.name, this.element.select() === "$that" ?
          colors.componentprop : colors.instanceprop, this.index);
  };

  bender.WatchVertex.prototype.dot_properties = function () {
    return "label=\"%0\",shape=square,fixedsize=true,width=0.3".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
