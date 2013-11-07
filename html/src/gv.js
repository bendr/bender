(function (bender) {
  "use strict";

  /* global window */

  bender.Environment.prototype.to_gv = function () {
    if (!this.edges) {
      this.flush_graph();
    }
    this.vortex.__incoming = this.vortex.incoming.length;
    window.open("data:text/vnd.graphviz;base64," +
        window.btoa(to_gv(this.vertices, this.edges)), "Graph");
  };


  bender.Component.prototype.to_gv = function () {
    return this.scope.$environment.to_gv();
  };


  bender.Vertex.prototype.to_gv = function () {
    return this.graph_name();
  };

  bender.Vertex.prototype.graph_name = function () {
    return "v%0".fmt(this.index);
  };

  bender.Vortex.prototype.to_gv = function () {
    var comment_out = this.__incoming === 0;
    delete this.__incoming;
    return "%0%1 [label=\"\",shape=doublecircle]"
      .fmt(comment_out ? "// " : "", this.graph_name());
  };


  bender.PropertyVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1%2`%3/%4\"]"
      .fmt(this.graph_name(), this.element.is_component_value ? "#" : "@",
          this.component.id() || this.component.index, this.element.name,
          this.index);
  };

  /*
  bender.EventVertex.prototype.graph = function () {
    return "%0 [label=\"%1\\n%2/%3\",shape=septagon]"
      .fmt(this.graph_name(), this.element.select, this.element.type,
          this.index);
  };

  bender.DOMEventVertex.prototype.graph = function () {
    return "%0 [label=\"%1\\n%2/%3\",shape=hexagon]"
      .fmt(this.graph_name(), this.get.select, this.get.type, this.index,
          this.index);
  };
  */

  bender.WatchVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1\",%2shape=square,fixedsize=true,width=0.3]"
      .fmt(this.graph_name(), this.index,
          this.watch.bindings ? "style=filled," : "");
  };


  bender.Edge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\"]"
      .fmt(this.source.graph_name(), this.dest.graph_name(), i);
  };


  var target_vertex = (bender.TargetVertex = function (index, target) {
    this.index = index;
    this.target = target;
  }).prototype;

  target_vertex.graph_name = function () {
    return "w%0".fmt(this.index);
  };

  target_vertex.to_gv = function () {
    return "%0 [label=\"%1\",shape=triangle,fixedsize=true,width=0.6]"
      .fmt(this.graph_name(), this.target);
  };



  function to_gv(vertices, edges) {
    var dom_vertices = [];

    // bender.DOMAttributeEdge.prototype.to_gv = 
    bender.DOMPropertyEdge.prototype.to_gv = function (i) {
      var dest = new bender.TargetVertex(dom_vertices.length,
          this.element.select());
      dom_vertices.push(dest);
      --this.dest.__incoming;
      return "%0 -> %1 [label=\"%2\"]"
        .fmt(this.source.graph_name(), dest.graph_name(), i);
    };

    var gv = function (xs) {
      return xs.map(function (x, i) {
        return "  %0;".fmt(x.to_gv(i));
      }).join("\n");
    };

    return (
      "digraph bender {\n" +
      "  node [fontname=\"Avenir Next\"];\n" +
      "  edge [fontname=\"Avenir Next\"];\n" +
      "%0\n" +
      "%1\n" +
      "%2\n" +
      "}\n").fmt(gv(edges), gv(vertices), gv(dom_vertices));
  }

}(window.bender));
