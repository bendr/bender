(function (bender) {
  "use strict";

  /* global console, flexo, window */
  // jshint -W054

  bender.version = "0.8.2.6";
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Set up tracing, turned on/off with setting bender.TRACE to true or false
  var _trace;
  Object.defineProperty(bender, "TRACE", {
    enumerable: true,
    get: function () { return _trace !== flexo.nop; },
    set: function (p) { _trace = p ? console.log.bind(console) : flexo.nop; }
  });
  Object.defineProperty(bender, "_trace", {
    enumerable: true,
    get: function () { return _trace; }
  });


  // Create a new environment in a document, or window.document by default.
  var environment = (bender.Environment = function (document) {
    this.scope = { $document: document || window.document, $environment: this };
    this.urls = {};
    this.components = [];
    this.vertices = [];
    this.vortex = this.add_vertex(new bender.Vortex());
    this.bindings = 0;
  }).prototype;

  // Add a component or instance to the environment
  environment.add_component = function (component) {
    component.index = this.components.length;
    this.components.push(component);
    return component;
  };

  // Add a vertex to the watch graph and return it.
  environment.add_vertex = function (vertex) {
    vertex.index = this.vertices.length === 0 ?
      0 : (this.vertices[this.vertices.length - 1].index + 1);
    vertex.environment = this;
    this.vertices.push(vertex);
    return vertex;
  };

  // Create a new Bender component in this environment and return it.
  environment.component = function (scope) {
    return this.add_component(new bender.Component(scope || this.scope));
  };


  // Regular expressions to match property bindings, broken into smaller pieces
  // for legibility
  var RX_ID =
    "(?:[$A-Z_a-z\x80-\uffff]|\\\\.)(?:[$0-9A-Z_a-z\x80-\uffff]|\\\\.)*";
  var RX_PAREN = "\\(((?:[^\\\\\\)]|\\\\.)*)\\)";
  var RX_CONTEXT = "(?:([#@])(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_TICK = "(?:`(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_PROP = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_CONTEXT, RX_TICK));

  // Indentify property bindings for a string property value string (e.g. from a
  // literal attribute or text node.)
  // TODO refactor with translate_bindings
  bender.bindings_string = function (value) {
    var strings = [];
    var bindings = {};
    // jshint -W084
    for (var remain = value, m; m = remain.match(RX_PROP);
        remain = m.input.substr(m.index + m[0].length)) {
      var q = m.input.substr(0, m.index) + m[1];
      if (q) {
        strings.push(flexo.quote(q));
      }
      var id = (m[2] || "") + (m[3] || m[4] || "$this").replace(/\\(.)/g, "$1");
      if (!bindings.hasOwnProperty(id)) {
        bindings[id] = {};
      }
      var prop = (m[5] || m[6]).replace(/\\(.)/g, "$1");
      bindings[id][prop] = true;
      strings.push("flexo.safe_string($scope[%0].properties[%1])"
          .fmt(flexo.quote(id), flexo.quote(prop)));
    }
    if (Object.keys(bindings).length === 0) {
      return value;
    }
    if (remain) {
      strings.push(flexo.quote(remain));
    }
    var f = "return " + strings.join("+");
    try {
      Object.defineProperty(bindings, "",
          { value: { value: new Function("$scope", "$in", f) } });
      return bindings;
    } catch (e) {
      console.error("Could not parse “%0” as Javascript".fmt(f));
      return value;
    }
  };

  

}(this.bender = {}));
