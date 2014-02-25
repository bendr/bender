// HTML runtime for Bender, based on the functional core.

// TODO 
// [ ] select="*" for GetEvent: listen to notifications from anyone. Create an
//       EventVertex that anyone can inherit from.
// [ ] message="foo" for GetEvent, same as event="foo" delay="0"

(function (bender) {
  "use strict";

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.WatchGraph.dump = function () {
    this.vertices.forEach(function (vertex, i) {
      vertex.__index = i;
    });
    this.edges.forEach(function (edge, i) {
      console.log("%0. %1 -> %2 = %3"
        .fmt(i + 1, edge.source.desc(), edge.dest.desc(), edge.priority));
    });
    this.vertices.forEach(function (vertex) {
      delete vertex.__index;
    });
  };

  bender.Vertex.desc = function () {
    return "v%0".fmt(this.__index);
  };

  bender.WatchVertex.desc = function () {
    return "v%0 [watch of %1]".fmt(this.__index, this.watch.component.name());
  };

  bender.PropertyVertex.desc = function () {
    return "v%0 [%1`%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.property.name);
  };

  bender.EventVertex.desc = function () {
    return "v%0 [%1!%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.type);
  };

}(this.bender));
