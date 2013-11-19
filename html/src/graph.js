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
        if (edge.source.values.length) {
          bender.trace("  values: %0"
            .fmt(edge.source.values.map(function (v) {
              return "%0=%1%2".fmt(idx(v[0]), v[1],
                v[2] ? " (%0)".fmt(idx(v[2])) : "");
            }).join(", ")));
        }
        edge.source.values.forEach(function (v) {
          var v_ = edge.follow.apply(edge, v);
          if (v_) {
            if (v_.multiple) {
              bender.trace("  new values for v%0: %1".fmt(edge.dest.index,
                  v_.map(function (v__) {
                    return "%0=%1".fmt(idx(v__[0]), v__[1]);
                  }).join(" ")));
              v_.forEach(function (v__) {
                push_value(edge.dest, v__);
              });
            } else {
              bender.trace("  new value for v%0: %1=%2%3"
                .fmt(edge.dest.index, idx(v_[0]), v_[1],
                  v_[2] ? " (%0)".fmt(idx(v_[2])) : ""));
              push_value(edge.dest, v_);
            }
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

  // Setup inheritance edges
  bender.Component.prototype.inherit_edges = function () {
    Object.keys(this.vertices.property.component).forEach(function (name) {
      if (this.vertices.property.instance.hasOwnProperty(name)) {
        this.vertices.property.component[name].add_outgoing(new
          bender.InstanceEdge(this.vertices.property.instance[name]));
      }
    }, this);
    var p = this.prototype();
    if (p) {
      Object.keys(this.vertices.property.instance).forEach(function (name) {
        if (name in p.vertices.property.instance) {
          var source = p.vertices.property.instance[name];
          var dest = this.vertices.property.instance[name];
          source.add_outgoing(new bender.InheritEdge(dest));
          source.outgoing.forEach(function (edge) {
            if (edge instanceof bender.InheritEdge) {
              return;
            }
            var edge_ = dest.add_outgoing(new bender.RedirectEdge(edge));
          });
        }
      }, this);
    }
    // TODO event edges
  };

  bender.Component.prototype.init_events = function () {
    // TODO
  };

  bender.Component.prototype.init_properties = function () {
    bender.trace("### Init properties: %0".fmt(this.id()));
    if (!this.not_ready) {
      bender.trace("  ready, no init.");
      return;
    }
    delete this.not_ready;
    var prototype = this._prototype;
    if (prototype) {
      prototype.init_properties();
    }
    this.inherit_edges();
    flexo.values(this.property_definitions).forEach(function (property) {
      if (property.is_component_value) {
        this.init_property(property);
      }
    }, this);
  };

  // Get the init value from the property, along with the original scope (or
  // false if there should not be any further initialization, i.e., if the
  // property is bound.)
  // TODO switch order so it matches the scope/value pairs in the graph
  bender.Component.prototype.init_value = function (property) {
    var name = property.name;
    for (var p = this; p; p = p._prototype) {
      if (p.init_values.hasOwnProperty(name)) {
        return [property.value_from_string(p.init_values[name], true,
            this.url()), p.scope];
      }
      if (p.property_definitions.hasOwnProperty(name) &&
          p.property_definitions[name].value() &&
          !p.property_definitions[name].bindings) {
        return [p.property_definitions[name].value(), p.scope];
      }
    }
    return !property.bindings && property.value() ?
      [property.value(), this.scope] :
      [property.default_value(),
        !property.bindings && property.value() && this.scope];
  };

  // TODO inherit edges
  bender.Component.prototype.init_property = function (property) {
    var v = this.init_value(property);
    set_property_silent(this, property.name, v[0].call(this, this.scope));
    bender.trace("init #%0`%1: %2=%3".fmt(this.scope._idx, property.name,
          v[1] ? idx(v[1]) : "_", this.properties[property.name]));
    if (v[1]) {
      var queue = [this];
      var f = function (q, instance) {
        var scope = flexo.find_first(instance.scopes, function (scope) {
          return scope.$that === v[1].$this;
        });
        bender.trace("  +++ %0".fmt(instance.id()));
        push_value(q.vertices.property.instance[property.name],
          [scope, instance.properties[property.name]]);
      };
      while (queue.length > 0) {
        var q = queue.shift();
        bender.trace("  ... %0".fmt(q.id()));
        if (q.vertices.property.component.hasOwnProperty(property.name)) {
          push_value(q.vertices.property.component[property.name],
              [v[1], q.properties[property.name]]);
        } else if (q.vertices.property.instance.hasOwnProperty(property.name)) {
          bender.trace("  !!! %0 (%1)"
              .fmt(q.vertices.property.instance[property.name].gv_label(),
                q.all_instances.length));
          q.all_instances.forEach(f.bind(this, q));
        } else {
          $$push(queue, q.derived);
        }
      }
    }
  };

  // Flush the graph after setting a property on a component.
  bender.Component.prototype.did_set_property = function (name, value) {
    var queue = [this];
    while (queue.length > 0) {
      var q = queue.shift();
      if (name in q.vertices.property.component) {
        push_value(q.vertices.property.component[name], [q.scope, value]);
      } else if (name in q.vertices.property.instance) {
        // jshint -W083
        $$push(q.vertices.property.instance[name].values,
            q.all_instances.map(function (instance) {
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
    // TODO at component level
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
    bender.trace("@@@ Init properties: %0".fmt(this.id()));
    var component = this.scope.$that;
    this.add_event_listeners();
    component.init_properties();
    for (var p in component.property_definitions) {
      var property = component.property_definitions[p];
      if (!property.is_component_value) {
        this.init_property(property);
      }
    }
    this.children.forEach(function (child) {
      child.init_properties();
    });
    this.scope.$environment.unsorted = true;
    this.scope.$environment.flush_graph();
    component.notify({ type: "ready" });
    this.notify({ type: "ready" });
  };

  bender.Instance.prototype.init_property = function (property) {
    var v = this.scope.$that.init_value(property);
    set_property_silent(this, property.name, v[0].call(this, this.scope));
    bender.trace("init @%0`%1: %2=%3".fmt(this._idx, property.name,
          v[1] ? idx(v[1]) : "_", this.properties[property.name]));
    if (v[1]) {
      for (var p = this.scope.$that;
          p && !(p.vertices.property.instance.hasOwnProperty(property.name));
          p = p._prototype) {}
      if (!p) {
        return;
      }
      var vertex = p.vertices.property.instance[property.name];
      var scope = flexo.find_first(this.scopes, function (scope) {
        return scope.$that === v[1].$this;
      });
      push_value(vertex, [scope, this.properties[property.name]]);
      bender.trace("  init value for vertex %0: %1=%2"
        .fmt(vertex.gv_label(), idx(scope), this.properties[property.name]));
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
    }, this);
    this.sets.forEach(function (set) {
      w.add_outgoing(set.render(scope));
    });
  };

  bender.Component.prototype.notify = function (e) {
    e.source = this;
    if (e.type in this.vertices.event.component) {
      this.scope.$environment.flush_graph_later(function () {
        push_value(this.vertices.event.component[e.type], [this.scope, e]);
      }.bind(this));
    }
  };

  bender.Instance.prototype.notify = function (type, e) {
    if (typeof type === "object") {
      e = type;
    } else {
      e.type = type;
    }
    e.source = this;
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


  bender.Set.prototype.render = function (scope) {
    return new bender.ElementEdge().init(this, vortex(scope));
  };


  bender.SetDOMProperty.prototype.render = function (scope) {
    return render_edge(this, scope, vortex(scope), bender.DOMPropertyEdge);
  };


  bender.SetDOMAttribute.prototype.render = function (scope) {
    return render_edge(this, scope, vortex(scope), bender.DOMAttributeEdge);
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


  // TODO fix jshint warning
  bender.Instance.prototype.add_event_listeners = function () {
    // jshint -W083
    var vertices = this.scope.$that.vertices.dom;
    for (var id in vertices) {
      for (var ev in vertices[id]) {
        var vertex = vertices[id][ev];
        var scope = this.scope_of(vertex.element);
        vertex.outgoing.forEach(function (edge) {
          vertex.add_event_listener(scope, edge);
        });
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
    if (!edge) {
      return;
    }
    edge.source = this;
    this.outgoing.push(edge);
    if (!edge.dest) {
      edge.dest = vortex(this.environment.scope);
      edge.dest.incoming.push(edge);
    }
    return edge;
  };


  // We give the vortex its own class for graph reasoning purposes
  _class(bender.Vortex = function () {
    this.init();
  }, bender.Vertex);

  bender.Vortex.prototype.add_outgoing = function () {
    throw "Cannot add outgoing edge to vortex";
  };


  // Watch vertex corresponding to a watch element, gathers the inputs and
  // outputs of the watch
  _class(bender.WatchVertex = function (watch, component) {
    this.init();
    this.watch = watch;
    this.component = component;
  }, bender.Vertex);


  var dom_event_vertex =
  _class(bender.DOMEventVertex = function (component, select, type) {
    this.init();
    this.element = component;
    this.select = select;
    this.type = type;
  }, bender.Vertex);

  // Use the watch vertex
  dom_event_vertex.add_event_listener = function (scope, edge) {
    var target = scope[edge.element.select()];
    if (edge.element.property) {
      var vertex = vertex_property(edge.element, scope.$that.scope);
      if (vertex) {
        vertex.add_outgoing(new bender.DOMEventListenerEdge(this, scope, edge));
      }
    } else {
      this.add_event_listener_to_target(scope, edge, target);
    }
  };

  dom_event_vertex.add_event_listener_to_target = function (scope, edge, target) {
    if (!target || typeof target.addEventListener !== "function") {
      console.warn("No target %0 for event listener %1"
          .fmt(edge.element.select(), edge.element.type));
      return;
    }
    var id = flexo.random_id();
    bender.trace("New event listener for %0/%1: %2"
        .fmt(scope.$this.id(), edge.element.type, id), target);
    var listener = function (e) {
      if (edge.element.prevent_default) {
        e.preventDefault();
      }
      if (edge.element.stop_propagation) {
        e.stopPropagation();
      }
      bender.trace("DOM event listener for %0/%1: %2"
        .fmt(scope.$this.id(), edge.element.type, id), e);
      push_value(this, [scope, e]);
      scope.$environment.flush_graph();
    }.bind(this);
    target.addEventListener(edge.element.type, listener, false);
    return function () {
      bender.trace("--- remove event listener %0".fmt(id));
      target.removeEventListener(edge.element.type, listener, false);
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
  edge.follow = function (scope, input, prev_scope) {
    try {
      var inner_scope = this.enter_scope(scope);
      if (inner_scope) {
        var outer_scope = inner_scope;
        if (this.pop_scope) {
          if (prev_scope) {
            bender.trace("    pop scope %0 <<< %1"
                .fmt(idx(inner_scope), idx(prev_scope)));
            outer_scope = prev_scope;
          } else {
            console.warn("    pop scope: no scope to pop?!");
          }
        }
        outer_scope = this.exit_scope(inner_scope, outer_scope);
        if (!outer_scope) {
          return;
        }
        var v = [outer_scope, this.follow_value(inner_scope, input)];
        bender.trace("  value for edge=%0".fmt(v[1]));
        if (this.push_scope) {
          bender.trace("    push scope %0 >>> %1"
              .fmt(idx(inner_scope), idx(scope)));
          v.push(inner_scope);
        }
        this.apply_value.apply(this, v);
        if (this.delay >= 0 || this.delay === "never") {
          bender.trace("    delayed edge (%0)".fmt(this.delay));
          return;
        }
        return v;
      }
    } catch (e) {
      if (e !== "fail") {
        console.warn("Exception while following edge:", e);
      }
    }
  };

  // Return the new scope for the destination of the edge
  edge.follow_scope = flexo.fst;
  edge.enter_scope = flexo.fst;
  edge.exit_scope = flexo.snd;

  // Return the new value for the destination of the edge
  edge.follow_value = flexo.snd;
  edge.apply_value = flexo.nop;


  _class(bender.InheritEdge = function (dest) {
    this.init(dest);
  }, bender.Edge);


  var instance_edge = _class(bender.InstanceEdge = function (dest) {
    this.init(dest);
  }, bender.Edge);

  // An instance edge between a component vertex and an instance vertex requires
  // to return multiple values, for all instances of the component.
  // TODO skip instances that have their own property value
  instance_edge.follow = function (scope, input) {
    var vs = scope.$that.all_instances.map(function (instance) {
      return [instance.scope_of(scope.$that), input];
    });
    vs.multiple = true;
    return vs;
  };


  var redirect_edge = _class(bender.RedirectEdge = function (edge) {
    this.init(edge.dest);
    this.original = edge;
  }, bender.Edge);

  redirect_edge.enter_scope = function (scope) {
    return this.original.enter_scope(scope);
  };

  redirect_edge.follow_value = function (scope, input) {
    return this.original.follow_value(scope, input);
  };

  Object.defineProperty(redirect_edge, "push_scope", {
    get: function () {
      return this.original.push_scope;
    }
  });


  var dom_event_listener_edge =
  _class(bender.DOMEventListenerEdge = function (dest, scope, edge) {
    this.init(dest);
    this.scope = scope;
    this.edge = edge;
    this.delay = "never";
  }, bender.Edge);

  // TODO remove previous event listener
  dom_event_listener_edge.follow_value = function (_, input) {
    // jshint unused: true
    if (this.remove_listener) {
      this.remove_listener();
    }
    this.remove_listener =
      this.dest.add_event_listener_to_target(this.scope, this.edge, input);
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

  Object.defineProperty(watch_edge, "push_scope", { value: true });

  watch_edge.enter_scope = function (scope) {
    var component = this.element.current_component;
    if (scope.$this === scope.$that) {
      return component.scope;
    }
    var select = this.element.select();
    for (var i = 0, n = scope.$this.scopes.length; i < n; ++i) {
      var s = scope.$this.scopes[i];
      if (s.$that === component) {
        return s;
      }
      for (var j = 0, m = s[""].length; j < m; ++j) {
        var s_ = s[""][j];
        if (s_.$that === component && s_[select] === scope.$this) {
          return s_;
        }
      }
    }
  };


  // Edges to a DOM node (so, as far as the graph is concerned, to the vortex.)
  // TODO with mutation events, we may have DOM property vertices as well.
  var dom_property_edge = _class(bender.DOMPropertyEdge = function (set) {
    this.init(set);
  }, bender.ElementEdge);

  Object.defineProperty(dom_property_edge, "pop_scope", { value: true });

  dom_property_edge.apply_value = function (scope, value) {
    var target = scope[this.element.select()];
    if (target) {
      target[this.element.name] = value;
    }
  };


  var dom_attribute_edge = _class(bender.DOMAttributeEdge = function (set) {
    this.init(set);
  }, bender.ElementEdge);

  Object.defineProperty(dom_attribute_edge, "pop_scope", { value: true });

  dom_attribute_edge.apply_value = function (scope, value) {
    scope[this.element.select()].setAttributeNS(this.element.ns,
        this.element.name, value);
  };


  var event_edge = _class(bender.EventEdge = function (set, target, dest) {
    this.init(set, dest);
    this.target = target;
    this.delay = 0;
  }, bender.ElementEdge);

  Object.defineProperty(event_edge, "pop_scope", { value: true });

  event_edge.exit_scope = function (inner_scope, outer_scope) {
    return exit_scope(this, inner_scope, outer_scope);
  };

  event_edge.apply_value = function (scope, value) {
    var target = scope[this.element.select()];
    target.notify({ type: this.element.type, value: value });
  };


  var property_edge =
  _class(bender.PropertyEdge = function (set, target, dest) {
    this.init(set, dest);
    this.target = target;
  }, bender.ElementEdge);

  Object.defineProperty(property_edge, "pop_scope", { value: true });

  property_edge.apply_value = function (scope, value) {
    var target = scope[this.element.select()];
    set_property_silent(target, this.element.name, value);
  };

  property_edge.exit_scope = function (inner_scope, outer_scope) {
    var target = inner_scope[this.element.select()];
    outer_scope = exit_scope(this, outer_scope);
    var s = function (v) {
      return v[0].$this === outer_scope.$this;
    };
    var init = flexo.find_first(this.dest.values, s);
    if (init && !outer_scope.$that.is_descendant_or_self(init[0].$that)) {
      bender.trace("<<< not overriding property %0 set from %1 (tried %2)"
          .fmt(this.element.name, idx(init[0]), idx(outer_scope)));
      return;
    }
    return outer_scope;
  };


  function exit_scope(edge, scope) {
    var component = edge.dest.target;
    if (scope.$this === scope.$that) {
      return component.scope;
    }
    var select = edge.element.select();
    return flexo.find_first(scope[""], function (s) {
      return s.$that === component && s[select] === s.$this;
    }) || scope;
  }

  // Detail id for a component or instance (used for debugging.)
  function idx(scope) {
    return scope.$this === scope.$that ? scope.$this._idx :
      "%0[%1]".fmt(scope.$this._idx, scope.$that._idx);
  }

  // Push a value (really, a scope/value pair) to the values of a vertex in the
  // graph.
  function push_value(vertex, v) {
    flexo.remove_first_from_array(vertex.values, function (w) {
      return v[0].$this === w[0].$this;
    });
    vertex.values.push(v);
  }

  // Create inherit and redirect edges from the `source` vertex to the `dest`
  // vertex (for outlet vertices.)
  function redirect(source, dest) {
    if (!source) {
      return;
    }
    source.add_outgoing(new bender.InheritEdge(dest));
    bender.trace("  INHERIT EDGE v%0 -> v%1".fmt(source.index, dest.index));
    source.outgoing.forEach(function (edge) {
      if (edge instanceof bender.InheritEdge) {
        return;
      }
      var edge_ = dest.add_outgoing(new bender.RedirectEdge(edge));
      bender.trace("  REDIRECT EDGE v%0 -> v%1"
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
  // first if necessary. Note that this can be called for a property vertex,
  // but also from an event vertex (when introducing event listener edges.)
  function vertex_property(element, scope) {
    var target = scope[element.select()];
    if (target) {
      var is_component = element.is_component_value;
      var vertices = target.vertices.property[is_component ?
        "component" : "instance"];
      var name = element.name || element.property;
      if (!vertices.hasOwnProperty(name)) {
        vertices[name] = scope.$environment.add_vertex(new bender
            .PropertyVertex(target, name, is_component));
      }
      return vertices[name];
    }
  }

  // Get the vortex for this environment
  // TODO create it on demand
  function vortex(scope) {
    return scope.$environment.vertices[0];
  }

}());
