(function (bender) {
  "use strict";

  /* global window */

  bender.Environment.prototype.to_gv = function () {
    if (!this.edges) {
      this.update_graph();
    }
    this.vertices[0].__incoming = this.vertices[0].incoming.length;
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


  bender.PropertyVertex.prototype.gv_label = function () {
    return "%0%1`%2/%3"
      .fmt(this.is_component ? "#" : "@", this.target.id() || this.target.index,
          this.name, this.index);
  };

  bender.PropertyVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1\"]".fmt(this.graph_name(), this.gv_label());
  };


  bender.EventVertex.prototype.gv_label = function () {
    return "%0%1!%2/%3"
      .fmt(this.is_component ? "#" : "@", this.target.id() || this.target.index,
          this.name, this.index);
  };

  bender.EventVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1\",shape=septagon]"
      .fmt(this.graph_name(), this.gv_label());
  };


  bender.DOMEventVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1\\n%2/%3\",shape=pentagon]"
      .fmt(this.graph_name(), this.select, this.type, this.index);
  };

  bender.WatchVertex.prototype.to_gv = function () {
    return "%0 [label=\"%1\",%2shape=square,fixedsize=true,width=0.3]"
      .fmt(this.graph_name(), this.index,
          this.watch.bindings ? "style=filled," : "");
  };


  bender.Edge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\"%3]"
      .fmt(this.source.graph_name(), this.dest.graph_name(), i,
          this.delay >= 0 ? ",color=\"#4dbce9\"" : "");
  };

  bender.InheritEdge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\",color=\"#f8ca00\"]"
      .fmt(this.source.graph_name(), this.dest.graph_name(), i);
  };

  bender.InstanceEdge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\",color=\"#ff6a4d\",arrowhead=inv]"
      .fmt(this.source.graph_name(), this.dest.graph_name(), i);
  };

  bender.RedirectEdge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\",color=\"#f94179\"]"
      .fmt(this.source.graph_name(), this.dest.graph_name(), i);
  };

  bender.DOMEventListenerEdge.prototype.to_gv = function (i) {
    return "%0 -> %1 [label=\"%2\",color=\"#5eb26b\"]"
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
    return "%0 [label=\"%1\",shape=triangle]"
      .fmt(this.graph_name(), this.target);
  };



  function to_gv(vertices, edges) {
    var dom_vertices = [];

    bender.DOMAttributeEdge.prototype.to_gv = 
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
