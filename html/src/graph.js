(function () {
  "use strict";

  /* global bender, console, require, window, $$push, $$unshift */

  var flexo = typeof require === "function" ? require("flexo") : window.flexo;
  var _class = flexo._class;


  // Add a vertex to the watch graph and return it.
  bender.Environment.prototype.add_vertex = function (vertex) {
    vertex.index = this.vertices.length === 0 ?
      0 : (this.vertices[this.vertices.length - 1].index + 1);
    vertex.environment = this;
    this.vertices.push(vertex);
    this.sorted = false;
    return vertex;
  };

  // Remove a vertex from the graph as well as all of its incoming and outgoing
  // edges.
  bender.Environment.prototype.remove_vertex = function (vertex) {
    flexo.remove_from_array(this.vertices, vertex);
    vertex.incoming.forEach(remove_edge);
    vertex.outgoing.forEach(remove_edge);
    delete vertex.index;
    delete vertex.environment;
    this.sorted = false;
    return vertex;
  };

  // Request the graph to be flushed (several requests in a row will result in
  // flushing only once.)
  // TODO allow delay (uses asap at the moment.)
  bender.Environment.prototype.flush_graph = function () {
    if (this.__will_flush) {
      bender.trace("(flush graph: already scheduled.)");
      return;
    }
    bender.trace("(flush graph: will flush ASAP.)");
    this.__will_flush = true;
    flexo.asap(function () {
      bender.trace("*** FLUSH GRAPH ***");
      if (this.unsorted) {
        this.edges = sort_edges(this.vertices);
        this.unsorted = false;
      }
      this.edges.forEach(function (edge, i) {
        bender.trace("flush graph: edge #%0: %1 -> %2"
          .fmt(i, edge.source.graph_name(), edge.dest.graph_name()));
        if (edge.source.__init) {
          edge.source.__init.forEach(function (v) {
            push_value(edge.source, v);
          });
          bender.trace("  init values: %0"
            .fmt(edge.source.__init.map(function (v) {
              return "%0/%1".fmt(v[0].$this.id(), v[1]);
            }).join(", ")));
          delete edge.source.__init;
        }
        if (edge.source.values.length) {
          bender.trace("  values: %0"
            .fmt(edge.source.values.map(function (v) {
              return "%0/%1".fmt(v[0].$this.id(), v[1]);
            }).join(", ")));
        }
        edge.source.values.forEach(function (v) {
          var v_ = edge.follow.apply(edge, v);
          if (v_) {
            bender.trace("  new value for v%0: %1/%2"
              .fmt(edge.dest.index, v_[0].$this.id(), v_[1]));
            push_value(edge.dest, v_);
          }
        });
      });
      this.vertices.forEach(function (vertex) {
        vertex.values = [];
      });
      delete this.__will_flush;
      if (this.__queue) {
        this.__queue.forEach(function (f) {
          f();
        });
        delete this.__queue;
        this.flush_graph();
      }
    }.bind(this));
  };

  // Schedule a graph flush *after* the currently scheduled flush has happened
  // (for delayed edges.)
  bender.Environment.prototype.flush_graph_later = function (f) {
    if (this.__will_flush) {
      if (!this.__queue) {
        this.__queue = [];
      }
      this.__queue.push(f);
    } else {
      f();
      this.flush_graph();
    }
  };


  // Render the graph for the component by rendering all watches.
  bender.Component.prototype.render_graph = function () {
    this.watches.forEach(function (watch) {
      watch.render(this.scope);
    }, this);
  };

  bender.Component.prototype.init_events = function () {
    // TODO
  };

  bender.Component.prototype.init_properties = function () {
    if (!this.not_ready) {
      return;
    }
    delete this.not_ready;
    var prototype = this._prototype;
    if (prototype) {
      prototype.init_properties();
    }
    flexo.values(this.property_definitions).forEach(function (property) {
      if (property.is_component_value) {
        this.init_property(property);
      }
    }, this);
  };

  // Get the init value from the property, along with a flag to determine
  // whether the property should actually be initialized.
  // TODO handle bindings properly for initial values (make a new property
  // element?)
  bender.Component.prototype.init_value = function (property) {
    var name = property.name;
    if (this.init_values.hasOwnProperty(name)) {
      /*property = new bender.Property(name, true);
      if (this.property_definitions.hasOwnProperty(name)) {
        prop.as(this.property_definitions[name].as());
      }
      this.append_child(property);
      property.set_value_from_string(this.init_values[name], true, this.url());
      */
      return [property.value_from_string(this.init_values[name], true,
          this.url()), true];
    }
    return !property.bindings && property.value() ?
      [property.value(), true] : [property.default_value(), !property.bindings];
  };

  // TODO inherit edges
  bender.Component.prototype.init_property = function (property) {
    var v = this.init_value(property);
    set_property_silent(this, property.name, v[0].call(this, this.scope));
    bender.trace("init #%0`%1=%2".fmt(this.id(), property.name,
          this.properties[property.name]));
    if (v[1]) {
      var queue = [this];
      var f = function (q, instance) {
        var scope = flexo.find_first(instance.scopes, function (scope) {
          return scope.$that === this;
        }, this);
        bender.trace("  +++ %0".fmt(instance.id()));
        push_value_init(q.vertices.property.instance[property.name],
          [scope, instance.properties[property.name]], !!property.value());
      };
      while (queue.length > 0) {
        var q = queue.shift();
        bender.trace("  ... %0".fmt(q.id()));
        if (q.vertices.property.component.hasOwnProperty(property.name)) {
          push_value_init(q.vertices.property.component[property.name],
              [this.scope, q.properties[property.name]], !!property.value());
        } else if (q.vertices.property.instance.hasOwnProperty(property.name)) {
          bender.trace("  !!! %0 (%1)"
              .fmt(q.vertices.property.instance[property.name].gv_label(),
                q.all_instances.length));
          q.all_instances.forEach(f.bind(this, q));
        } else {
          $$push(queue, this.derived);
        }
      }
    }
  };

  // Flush the graph after setting a property on a component.
  bender.Component.prototype.did_set_property = function (name, value) {
    var queue = [this];
    while (queue.length > 0) {
      var q = queue.shift();
      if (q.vertices.property.component.hasOwnProperty(name)) {
        push_value(q.vertices.property.component[name], [q.scope, value]);
      } else if (q.vertices.property.instance.hasOwnProperty(name)) {
        // jshint -W083
        $$push(q.vertices.property.instance[name].values,
            q.instances.map(function (instance) {
              return [instance.scope, value];
            }));
      } else {
        $$push(queue, q.derived);
      }
    }
    this.scope.$environment.flush_graph();
  };


  bender.Instance.prototype.init_events = function () {
    var component = this.scope.$that;
    component.init_events();
    flexo.values(component.vertices.event.instance).forEach(function (dest) {
      for (var p = component._prototype;
        p && !p.vertices.event.instance.hasOwnProperty(dest.name);
        p = p._prototype) {}
      if (p) {
        redirect(p.vertices.event.instance[dest.name], dest);
      }
    });
    this.children.forEach(function (child) {
      child.init_events();
    });
  };


  bender.Instance.prototype.init_properties = function () {
    var component = this.scope.$that;
    component.init_properties();
    for (var p in component.property_definitions) {
      var property = component.property_definitions[p];
      if (!property.is_component_value) {
        this.inherit_edge(property);
        this.init_property(property);
      }
    }
    this.children.forEach(function (child) {
      child.init_properties();
    });
    this.add_event_listeners();
    this.scope.$environment.unsorted = true;
    this.scope.$environment.flush_graph();
    this.notify({ type: "ready" });
  };

  bender.Instance.prototype.inherit_edge = function (property) {
    var p = this.scope.$that;
    if (p.vertices.property.instance.hasOwnProperty(property.name)) {
      var dest = p.vertices.property.instance[property.name];
      for (p = p._prototype;
          p && !(p.vertices.property.instance.hasOwnProperty(property.name));
          p = p._prototype) {}
      if (p) {
        redirect(p.vertices.property.instance[property.name], dest);
      }
    }
  };

  bender.Instance.prototype.init_property = function (property) {
    var v = this.scope.$that.init_value(property);
    set_property_silent(this, property.name, v[0].call(this, this.scope));
    bender.trace("init @%0`%1=%2".fmt(this.id(), property.name,
          this.properties[property.name]));
    if (v[1]) {
      for (var p = this.scope.$that;
          p && !(p.vertices.property.instance.hasOwnProperty(property.name));
          p = p._prototype) {}
      if (!p) {
        return;
      }
      var vertex = p.vertices.property.instance[property.name];
      var scope = flexo.find_first(this.scopes, function (scope) {
        return scope.$that === property.current_component;
      });
      push_value_init(vertex, [scope, this.properties[property.name]],
          !!property.value());
      bender.trace("    init value for vertex %0=%1"
        .fmt(vertex.gv_label(), this.properties[property.name]));
    }
  };

  // Flush the graph after setting a property on an instance.
  bender.Instance.prototype.did_set_property = function (name, value) {
    var queue = [this.scope.$that];
    while (queue.length > 0) {
      var q = queue.shift();
      if (name in q.vertices.property.instance) {
        push_value(q.vertices.property.instance[name], [this.scope, value]);
      } else {
        $$push(q, q.derived);
      }
    }
    this.scope.$environment.flush_graph();
  };


  // Render the watch and the corresponding get and set edges in the parent
  // component scope
  bender.Watch.prototype.render = function (scope) {
    var w = scope.$environment.add_vertex(new
        bender.WatchVertex(this, scope.$that));
    this.gets.forEach(function (get) {
      var v = get.render(scope);
      if (v) {
        v.add_outgoing(new bender.WatchEdge(get, w));
      }
      if (v instanceof bender.PropertyVertex && get.bindings) {
        Object.keys(get.bindings).forEach(function (select) {
          var target = scope[select];
          if (target) {
            for (var _ in get.bindings[select]) {  // jshint unused: false
              var u = vertex_property(target, scope);
              if (u) {
                u.add_outgoing(new bender.DependencyEdge(this, v));
              }
            }
          }
        }, this);
      }
    }, this);
    this.sets.forEach(function (set) {
      var edge = set.render(scope);
      if (edge) {
        w.add_outgoing(edge);
      }
    });
  };

  bender.Instance.prototype.notify = function (e) {
    for (var p = this.scope.$that;
        p && !(p.vertices.event.instance.hasOwnProperty(e.type));
        p = p._prototype) {}
    if (p) {
      var scope = this.scope;
      scope.$environment.flush_graph_later(function () {
        bender.trace("!!! notify %0 from %1".fmt(e.type, scope.$this.id()));
        push_value(p.vertices.event.instance[e.type], [scope, e]);
      });
    }
  };


  bender.GetDOMEvent.prototype.render = function (scope) {
    return vertex_dom_event(this, scope);
  };


  bender.GetEvent.prototype.render = function (scope) {
    return vertex_event(this, scope);
  };


  bender.GetProperty.prototype.render = function (scope) {
    return vertex_property(this, scope);
  };


  bender.SetDOMProperty.prototype.render = function (scope) {
    return render_edge(this, scope, scope.$environment.vortex,
        bender.DOMPropertyEdge);
  };


  bender.SetDOMAttribute.prototype.render = function (scope) {
    return render_edge(this, scope, scope.$environment.vortex,
        bender.DOMAttributeEdge);
  };


  bender.SetEvent.prototype.render = function (scope) {
    var dest = vertex_event(this, scope);
    if (!dest) {
      console.warn("No event %0 for component %1"
          .fmt(this.type, scope.$that.url()));
    }
    return render_edge(this, scope, dest, bender.EventEdge);
  };


  bender.SetProperty.prototype.render = function (scope) {
    var dest = vertex_property(this, scope);
    if (!dest) {
      console.warn("No property %0 for component %1"
          .fmt(this.name, scope.$that.url()));
      return;
    }
    return render_edge(this, scope, dest, bender.PropertyEdge);
  };


  bender.Instance.prototype.add_event_listeners = function () {
    var vertices = this.scope.$that.vertices.dom;
    for (var id in vertices) {
      for (var ev in vertices[id]) {
        var vertex = vertices[id][ev];
        vertex.add_event_listener(this.scope_of(vertex.element));
      }
    }
  };


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
            if (select === "$document") {
              return scopes[i];
            }
            var scope_ = scopes[i][""][j].scopes[k];
            if ((scope_[select || "$this"] === scope.$this) ||
                (select && scope_[select] === scope[select])) {
              // Check above
              return scope_;
            }
          }
        }
      }
    } else {
      for (i = 0, n = scope[""].length; i < n; ++i) {
        if (scope[""][i] === this.component) {
          return scope[""][i].scope;
        }
      }
    }
  };


  var dom_event_vertex =
  _class(bender.DOMEventVertex = function (component, select, type) {
    this.init();
    this.element = component;
    this.select = select;
    this.type = type;
  }, bender.Vertex);

  // Use the watch vertex
  dom_event_vertex.add_event_listener = function (scope) {
    var target = scope[this.select];
    if (target && typeof target.addEventListener === "function") {
      var id = flexo.random_id();
      bender.trace("New event listener for %0/%1: %2"
          .fmt(scope.$this.id(), this.type, id), target);
      target.addEventListener(this.type, function (e) {
        if (this.element.prevent_default) {
          e.preventDefault();
        }
        if (this.element.stop_propagation) {
          e.stopPropagation();
        }
        bender.trace("DOM event listener for %0/%1: %2"
          .fmt(scope.$this.id(), this.type, id), e);
        push_value(this, [scope, e]);
        scope.$environment.flush_graph();
      }.bind(this), false);
    }
  };


  // Simple super-class for “outlet” style vertex, i.e., component and event
  // vertex. An outlet vertex points back to the target component, has a name
  // property for the desired outlet, and a flag to distinguish component
  // outlets from instance outlets.
  var outlet_vertex =
    _class(bender.OutletVertex = function () {}, bender.Vertex);

  outlet_vertex.init = function (target, name, is_component) {
    vertex.init.call(this);
    this.target = target;
    this.name = name;
    this.is_component = !!is_component;
  };


  _class(bender.EventVertex = function (target, name, is_component) {
    this.init(target, name, is_component);
  }, bender.OutletVertex);


  _class(bender.PropertyVertex = function (target, name, is_component) {
    this.init(target, name, is_component);
  }, bender.OutletVertex);


  var edge = (bender.Edge = function () {}).prototype;

  edge.init = function (dest) {
    if (dest) {
      dest.add_incoming(this);
    }
    return this;
  };

  // Remove self from the list of outgoing edges of the source and the list of
  // incoming edges from the destination.
  edge.remove = function () {
    flexo.remove_from_array(this.source.outgoing);
    flexo.remove_from_array(this.dest.incoming);
    delete this.source;
    delete this.dest;
  };

  var remove_edge = Function.prototype.call.bind(edge.remove);

  // Follow an edge: return the scope for the destination vertex and the value
  // for that scope; or nothing at all.
  edge.follow = function (scope, input) {
    try {
      var new_scope = this.follow_scope(scope, input);
      if (new_scope) {
        var value = this.follow_value(new_scope, input);
        if (edge.delay >= 0) {
          bender.trace("Delayed edge (%0)".fmt(edge.delay));
        } else {
          return [new_scope, value];
        }
      }
    } catch (e) {
      if (e !== "fail") {
        console.warn("Exception while following edge:", e);
      }
    }
  };

  // Return the new scope for the destination of the edge
  edge.follow_scope = flexo.fst;

  // Return the new value for the destination of the edge
  edge.follow_value = flexo.snd;


  _class(bender.InheritEdge = function (dest) {
    this.init(dest);
  }, bender.Edge);


  var redirect_edge = _class(bender.RedirectEdge = function (edge) {
    this.init(edge.dest);
    this.original = edge;
  }, bender.Edge);

  redirect_edge.follow_scope = function (scope) {
    return this.original.follow_scope(scope);
  };

  redirect_edge.follow_value = function (scope, input) {
    return this.original.follow_value(scope, input);
  };


  // Edges that are tied to an element (e.g., watch, get, set) and a scope
  var element_edge = _class(bender.ElementEdge = function () {}, bender.Edge);

  element_edge.init = function (element, dest) {
    edge.init.call(this, dest);
    this.element = element;
    return this;
  };

  element_edge.follow_value = function (scope, input) {
    var f = this.element.value();
    return typeof f === "function" ? f.call(scope.$this, scope, input) : input;
  };


  // Edges to a watch vertex
  var watch_edge = _class(bender.WatchEdge = function (get, dest) {
    this.init(get, dest);
  }, bender.ElementEdge);

  // Follow a watch edge: shift the input scope to match that of the destination
  // watch node, and evaluate the value of the edge using the watch’s context.
  watch_edge.follow_scope = function (scope) {
    return this.dest.shift_scope(scope, this.element.select());
  };


  // Edges to a DOM node (so, as far as the graph is concerned, to the vortex.)
  // TODO with mutation events, we may have DOM property vertices as well.
  var dom_property_edge = _class(bender.DOMPropertyEdge = function (set) {
    this.init(set);
  }, bender.ElementEdge);

  dom_property_edge.follow_value = function (scope, input) {
    var value = element_edge.follow_value.call(this, scope, input);
    var target = scope[this.element.select()];
    if (target) {
      target[this.element.name] = value;
    }
    return value;
  };


  var dom_attribute_edge = _class(bender.DOMAttributeEdge = function (set) {
    this.init(set);
  }, bender.ElementEdge);
  
  dom_attribute_edge.follow_value = function (scope, input) {
    var value = element_edge.follow_value.call(this, scope, input);
    scope[this.element.select()].setAttributeNS(this.element.ns,
        this.element.name, value);
    return value;
  };


  var event_edge = _class(bender.EventEdge = function (set, target, dest) {
    this.init(set, dest);
    this.target = target;
    this.delay = 0;
  }, bender.ElementEdge);

  event_edge.follow_value = function (scope, input) {
    var value = element_edge.follow_value.call(this, scope, input);
    var target = scope[this.element.select()];
    target.notify({ type: this.element.type, value: value });
  };


  var property_edge =
  _class(bender.PropertyEdge = function (set, target, dest) {
    this.init(set, dest);
    this.target = target;
  }, bender.ElementEdge);

  property_edge.follow_value = function (scope, input) {
    var s = function (v) {
      return v[0].$this === scope.$this;
    };
    var init = flexo.find_first(this.dest.__init, s) ||
      flexo.find_first(this.dest.values, s);
    if (init) {
      return init[1];
    }
    var value = element_edge.follow_value.call(this, scope, input);
    var target = scope[this.element.select()];
    set_property_silent(target, this.element.name, value);
    return value;
  };


  // Push a value (really, a scope/value pair) to the values of a vertex in the
  // graph.
  function push_value(vertex, v) {
    flexo.remove_first_from_array(vertex.values, function (w) {
      return v[0].$this === w[0].$this;
    });
    vertex.values.push(v);
  }

  function push_value_init(vertex, v, p) {
    if (!p) {
      push_value(vertex, v);
    }
    if (vertex.__init) {
      flexo.remove_first_from_array(vertex.__init, function (w) {
        return v[0].$this === w[0].$this;
      });
    } else {
      vertex.__init = [];
    }
    vertex.__init.push(v);
  }

  // Create inherit and redirect edges from the `source` vertex to the `dest`
  // vertex (for outlet vertices.)
  function redirect(source, dest) {
    source.add_outgoing(new bender.InheritEdge(dest));
    console.log("  INHERIT EDGE v%0 -> v%1".fmt(source.index, dest.index));
    source.outgoing.forEach(function (edge) {
      if (edge instanceof bender.InheritEdge) {
        return;
      }
      var edge_ = dest.add_outgoing(new bender.RedirectEdge(edge));
      console.log("  REDIRECT EDGE v%0 -> v%1"
        .fmt(edge_.source.index, edge_.dest.index));
    });
  }

  // Render an edge from a set element.
  function render_edge(set, scope, dest, Constructor) {
    var target = scope[set.select()];
    if (target) {
      return new Constructor(set, target, dest);
    }
  }

  // Silently set a property value for a component.
  function set_property_silent(component, name, value) {
    for (var p = component.properties, descriptor; p && !descriptor;
        descriptor = Object.getOwnPropertyDescriptor(p, name),
        p = Object.getPrototypeOf(p)) {}
    if (descriptor) {
      descriptor.set.call(component.properties, value, true);
      return value;
    }
  }

  // Sort all edges in a graph from its set of vertices. Simply go through
  // the list of vertices, starting with the sink vertices (which have no
  // outgoing edge) and moving edges from the vertices to the sorted list of
  // edges.
  // TODO push delayed edges to the back of the list; ignore them for sorting
  // purposes so that they can be used to break cycles.
  function sort_edges(vertices) {
    var queue = vertices.filter(function (vertex) {
      vertex.__out = vertex.outgoing.length;
      return vertex.__out === 0;
    });
    var edges = [];
    var process_incoming_edge = function (edge) {
      if (edge.source.hasOwnProperty("__out")) {
        --edge.source.__out;
      } else {
        edge.source.__out = edge.source.outgoing.length - 1;
      }
      if (edge.source.__out === 0) {
        queue.push(edge.source);
      }
      return edge;
    };
    while (queue.length > 0) {
      $$unshift(edges, queue.shift().incoming.map(process_incoming_edge));
    }
    vertices.forEach(function (vertex) {
      if (vertex.__out !== 0) {
        console.error("sort_edges: unqueued vertex", vertex);
      }
      delete vertex.__out;
    });
    return edges;
  }

  // Get a DOM event vertex.
  function vertex_dom_event(element, scope) {
    var target = scope[element.select()];
    if (target) {
      var vertices = element.current_component.vertices.dom;
      var id = target === scope.$document ? "" : target.id();
      if (!vertices.hasOwnProperty(id)) {
        vertices[id] = {};
      }
      if (!vertices[id].hasOwnProperty(element.type)) {
        vertices[id][element.type] = scope.$environment.add_vertex(new
            bender.DOMEventVertex(element.current_component, element.select(),
              element.type));
      }
      return vertices[id][element.type];
    }
  }

  // Get a Bender event vertex.
  function vertex_event(element, scope) {
    var target = scope[element.select()];
    if (target) {
      var is_component = element.is_component_value;
      var vertices = target.vertices.event[is_component ?
        "component" : "instance"];
      if (!vertices.hasOwnProperty(element.type)) {
        vertices[element.type] = scope.$environment.add_vertex(new bender
            .EventVertex(target, element.type, is_component));
      }
      return vertices[element.type];
    }
  }

  // Get a vertex for a property from an element and its scope, creating it
  // first if necessary.
  function vertex_property(element, scope) {
    var target = scope[element.select()];
    if (target) {
      var is_component = element.is_component_value;
      var vertices = target.vertices.property[is_component ?
        "component" : "instance"];
      if (!vertices.hasOwnProperty(element.name)) {
        vertices[element.name] = scope.$environment.add_vertex(new bender
            .PropertyVertex(target, element.name, is_component));
      }
      return vertices[element.name];
    }
  }

}());
