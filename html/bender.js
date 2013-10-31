(function (bender) {
  "use strict";

  /* global flexo, window, console */
  // jshint noempty: false
  // jshint forin: false
  // jshint -W054

  bender.version = "0.8.2.5";
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

  bender.TRACE = true;     // show tracing messages

  var _class = flexo._class;  // kludge for Chrome to display class names

  // Load a component and return a promise. The defaults object should contain
  // the defaults, including a href property for the URL of the component to
  // load; alternatively, a URL as string may be provided. If no environment
  // parameter is passed, a new one is created for the current document.
  bender.load_component = function (defaults, env) {
    var args = flexo.get_args(typeof defaults === "object" ? defaults :
      { href: defaults });
    if (!args.href) {
      return new flexo.Promise().reject("No href argument for component.");
    }
    if (!(env instanceof bender.Environment)) {
      env = new bender.Environment();
    }
    return env.load_component(
      flexo.absolute_uri(env.scope.$document.baseURI, args.href)
    );
  };

  // Load, then render a component from the given href. Return a promise of the
  // instance of the rendered component.
  bender.render_component = function (href, target, ref, env) {
    if (!(env instanceof bender.Environment)) {
      env = new bender.Environment();
    }
    if (!target) {
      target = env.scope.$document.body || env.scope.$document.documentElement;
    }
    return env.load_component(
        flexo.absolute_uri(env.scope.$document.baseURI, href)
      ).then(function (component) {
        return component.render_component(target, ref);
      });
  };


  // Create a new environment in a document, or window.document by default.
  var environment = (bender.Environment = function (document) {
    this.scope = { $document: document || window.document, $environment: this };
    this.urls = {};
    this.components = [];
    this.vertices = [];
    this.vortex = this.add_vertex(new bender.Vortex());
    this.bindings_count = 0;
  }).prototype;

  // Add a component or instance to the environment
  environment.add_component = function (component) {
    component.index = this.components.length;
    this.components.push(component);
    return component;
  }

  // Create a new Bender component in this environment and return it.
  environment.component = function (scope) {
    return this.add_component(new bender.Component(scope || this.scope));
  };

  // Create a new instance for a component and an optional parent instance, add
  // it to the environment and return it.
  environment.instance = function (component, parent) {
    return this.add_component(new bender.Instance(component, parent));
  };

  // Load a component from an URL in the environment and return a promise which
  // is fulfilled once the component has been loaded and deserialized (which may
  // lead to load additional components, for its prototype as well as its
  // children.) Once the component is loaded and deserialization starts, store
  // the incomplete component in the promise so that it can already be referred
  // to (e.g., to check for cycles in the prototype chain.)
  environment.load_component = function (url) {
    url = flexo.normalize_uri(url);
    if (this.urls[url]) {
      return this.urls[url];
    }
    var response_;
    var promise = this.urls[url] = flexo.ez_xhr(url, {
      responseType: "document", mimeType: "text/xml"
    }).then(function (response) {
      response_ = response;
      promise.url = url;
      return this.deserialize(response.documentElement, promise);
    }.bind(this)).then(function (d) {
      if (d instanceof bender.Component) {
        delete promise.component;
        d.url(url);
        d.loaded();
        return d;
      } else {
        throw { message: "not a Bender component", response: response_ };
      }
    });
    return promise;
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than elements, text and CDATA) are simply skipped, possibly with a warning
  // in the case of unknown Bender elements (as it probably means that another
  // namespace was meant; or a deprecated tag was used.) Deserializing a
  // component that was just loaded should set the component field of the
  // promise that was created to load this component so it passed as an extra
  // parameter to deserialize.
  environment.deserialize = function (node, promise) {
    if (node instanceof window.Node) {
      if (node.nodeType === window.Node.ELEMENT_NODE) {
        if (node.namespaceURI === bender.ns) {
          var f = environment.deserialize[node.localName];
          if (typeof f === "function") {
            return f.call(this, node, promise);
          } else {
            console.warn("Unknow element in Bender namespace: %0"
                .fmt(node.localName));
          }
        } else {
          return this.deserialize_foreign(node);
        }
      } else if (node.nodeType === window.Node.TEXT_NODE ||
          node.nodeType === window.Node.CDATA_SECTION_NODE) {
        return new bender.DOMTextNode().text(node.textContent);
      }
    } else {
      throw "Deserialization error: expected a node; got: %0".fmt(node);
    }
  };

  // Deserialize then add every child of p in the list of children to the Bender
  // element e, then return e
  environment.deserialize_children = function (e, p) {
    return flexo.fold_promises($map(p.childNodes, function (ch) {
        return this.deserialize(ch);
      }, this), $call.bind(component.child), e);
  };

  // Deserialize common properties and contents for objects that have a value
  // (property, get, set): handles id, as, match, and value (either attribute
  // or text content.)
  environment.deserialize_element_with_value = function (object, elem) {
    object.as(elem.getAttribute("as")).id(elem.getAttribute("id"))
      .match(elem.getAttribute("match"));
    if (elem.hasAttribute("value")) {
      set_value_from_string.call(object, elem.getAttribute("value"), true,
          elem.baseURI);
    } else {
      var t = shallow_text(elem);
      if (/\S/.test(t)) {
        set_value_from_string.call(object, t, false, elem.baseURI);
      } else {
        set_default_value.call(object);
      }
    }
    return this.deserialize_children(object, elem);
  };

  // Deserialize a foreign element and its contents (attribute and children),
  // creating a generic DOM element object.
  environment.deserialize_foreign = function (elem) {
    var e = new bender.DOMElement(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns === "" && attr.localName === "id") {
        e.id(attr.value);
      } else {
        e.attr(ns, attr.localName, attr.value);
      }
    }
    return this.deserialize_children(e, elem);
  };

  // Add a vertex to the watch graph and return it.
  environment.add_vertex = function (vertex) {
    vertex.index = this.vertices.length === 0 ?
      0 : (this.vertices[this.vertices.length - 1].index + 1);
    vertex.environment = this;
    this.vertices.push(vertex);
    return vertex;
  };

  environment.remove_vertex = function (vertex) {
    flexo.remove_from_array(this.vertices, vertex);
    vertex.incoming.forEach(function (edge) {
      flexo.remove_from_array(edge.source.outgoing, edge);
    });
    vertex.outgoing.forEach(function (edge) {
      flexo.remove_from_array(edge.dest.incoming, edge);
    });
  };

  // Flush the graph to initialize properties of rendered components so far
  environment.flush_graph = function () {
    _trace("flush graph");
    var start_vertices = this.vertices.filter(function (vertex) {
      return vertex.incoming.length === 0;
    });
    this.edges = sort_edges(this.vertices);
    this.components.forEach(function (component) {
      component.init_properties();
    });

    // New visit graph
    // TODO factor out the visit part; just initialize the value of vertices
    // first. But then we have no explicit vertex?
    this.edges.forEach(function (edge, i) {
      console.log("[%0] v%1 -> v%2".fmt(i, edge.source.index, edge.dest.index));
      if (edge.source.__init && !edge.source.__values) {
        edge.source.__values = edge.source.__init.map(function (init) {
          var r = [init[0], set_property_silent(init[0].$this,
            edge.source.element.name, init[1].call(init[0].$this, init[0]))];
          console.log("  (init v%0=%1)".fmt(edge.source.index, r[1]));
          return r;
        });
        delete edge.source.__init;
      }
      if (edge.source.__values) {
        if (!edge.dest.__values) {
          edge.dest.__values = [];
        }
        edge.source.__values.forEach(function (v) {
          var v_ = edge.follow.apply(edge, v);
          if (v_) {
            flexo.remove_first_from_array(edge.dest.__values, function (v__) {
              return v_[0] === v__[0];
            });
            console.log("  %0".fmt(v_[1]));
            edge.dest.__values.push(v_);
          }
        });
      }
    });
    this.vertices.forEach(function (v) {
      delete v.__values;
    });
  };

  environment.visit_edges = function () {
    this.edges.forEach(function (edge) {
      edge.source.values.forEach(function (v) {
        var v_ = edge.follow.apply(edge, v);
        if (v_) {
          edge.dest.values.push(v_);
        }
      }
    });
  };


  // Base for Bender elements.
  var element = (bender.Element = function () {}).prototype;

  // All elements may have an id. If the id is modified, the scope for this
  // element gets updated.
  // TODO limit the range of ids? Currently any string goes.
  // TODO remove old ids when changing the id
  element.id = function (id) {
    if (arguments.length > 0) {
      id = flexo.safe_string(id);
      if (id !== this._id) {
        this._id = id;
        update_scope(this, id);
      }
      return this;
    }
    return this._id || "";
  };

  // Initialize a new element with its basic properties (only children so far;
  // id is set when needed.)
  element.init = function () {
    this.children = [];
    return this;
  };

  // Generic append child method, should be overloaded to manage contents.
  // Return the appended child (similar to the DOM appendChild method.)
  // TODO if the child is a DOM node, transform it (and its children) into a
  // Bender DOMElement or DOMTextNode.
  element.append_child = function (child) {
    if (child instanceof bender.Element) {
      this.children.push(child);
      child.parent = this;
      return child;
    }
  };

  // Convenience method for chaining calls to append_child; do not return the
  // appended child but the parent element.
  element.child = function (child) {
    this.append_child(child);
    return this;
  };

  // Add a concrete node to the scope when the element is rendered.
  // TODO handle render_id for the component’s own id
  // TODO render_id="inherit"
  element.add_id_to_scope = function (node, stack, output) {
    if (this._id) {
      Object.getPrototypeOf(stack[stack.i])["@" + this._id] = node;
      if (output) {
        set_id_or_class(node, stack, this._id);
      }
    }
    if (output && !stack[stack.i].$first) {
      stack[stack.i].$first = node;
      if (this._id) {
        set_id_or_class(node, stack, this._id);
      }
    }
  };


  // Create a new component in a scope (either the environment scope for
  // top-level components, or the abstract scope of the parent component.)
  var component = _class(bender.Component = function (scope) {
    this.init(scope);
  }, bender.Element);

  component.init = function (scope) {
    element.init.call(this);
    var parent_scope = scope.hasOwnProperty("$environment") ?
      Object.create(scope) : scope;
    if (!parent_scope.hasOwnProperty("")) {
      parent_scope[""] = [];
    }
    parent_scope[""].push(this);
    this.scope = Object.create(parent_scope, {
      $this: { enumerable: true, writable: true, value: this },
      $that: { enumerable: true, writable: true, value: this }
    });
    this.vertices = {
      property: { component: {}, instance: {} },
      event: { component: {}, instance: {} },
    };
    this._on = {};                   // on-* attributes
    this.links = [];                 // link nodes
    this.property_definitions = {};  // property nodes
    this.properties = init_properties_object(this, {});  // values
    this.init_values = {};           // initial property values from attributes
    this.event_definitions = {};     // event nodes
    this.child_components = [];      // all child components
    this.derived = [];               // derived components
    this.instances = [];             // rendered instances
    this.watches = [];               // watch nodes
    this.not_ready = true;           // not ready
  };

  component.url = function (url) {
    if (arguments.length === 0) {
      url = this._url || (this.parent_component &&
          flexo.normalize_uri(this.parent_component.url())) ||
        flexo.normalize_uri(this.scope.$document.baseURI);
      if (this._id) {
        url += "#" + this._id;
      }
      return url;
    }
    this._url = url;
  };

  component.init_properties = function () {
    /* TODO review this
    var init = function (component, property, value) {
      component.property_vertices[property.name].__init =
        property.select === "$that" ?
          [[component.scope, value]] :
          component.instances.map(function (instance) {
            return [flexo.find_first(instance.scopes, function (scope) {
              return scope.$that === component;
            }), value];
          });
    }
    for (var p in this.property_vertices) {
      var property = this.init_values[p] || this.property_definitions[p];
      if (!property.bindings) {
        init(this, property, property.value());
      }
    }
    */
  };

  component.on = function (type, handler) {
    if (typeof handler === "string") {
      try {
        var source = handler;
        handler = new Function("instance", "type", handler);
        handler.__source = source;
      } catch (e) {
        console.error("Could not handler for:", handler);
      }
    }
    if (typeof handler === "function") {
      if (!this._on.hasOwnProperty(type)) {
        this._on[type] = [];
      }
      this._on[type].push(handler);
    }
    return this;
  };

  component.off = function (type, handler) {
    if (typeof handler === "function") {
      flexo.remove_from_array(this._on[type], handler);
    } else {
      flexo.remove_first_from_array(this._on[type], function (f) {
        return f.__source === handler;
      });
    }
    return this;
  };

  // Deserialize a component from an element. A component is created and, if the
  // second parameter promise is passed, its component property is set to the
  // newly created component, so that further references can be made before the
  // component is fully deserialized.
  environment.deserialize.component = function (elem, promise) {
    var component = this.component();
    if (promise) {
      promise.component = component;
    }
    $foreach(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.indexOf("on-") === 0) {
          component.on(attr.localName.substr(3), attr.value);
        } else if (attr.localName === "id") {
          component.id(attr.value);
        } else if (attr.localName !== "href") {
          component.init_values[attr.localName] = attr.value;
        }
      } else if (attr.namespaceURI === bender.ns) {
        component.init_values[attr.localName] = attr.value;
      }
    });
    return (function () {
      var children = this.deserialize_children(component, elem);
      if (elem.hasAttribute("href")) {
        var url = flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"));
        var promise = this.urls[url];
        if (promise) {
          if (promise.value) {
            component.prototype(promise.value);
          } else if (promise.component) {
            component.prototype(promise.component);
            return flexo.collect_promises([promise, children]);
          } else {
            return flexo.collect_promises([promise.then(function (prototype) {
              component.prototype(prototype);
            }), children]);
          }
        } else {
          return flexo.collect_promises([this.load_component(url)
            .then(function (prototype) {
              component.prototype(prototype);
            }), children]);
        }
      }
      return children;
    }.call(this)).then(function () {
      for (var p in component.init_values) {
        var property = component.append_child(new bender.Property(p, true));
        set_value_from_string.call(property, component.init_values[p], true,
            component.url());
        component.init_values[p] = property;
      }
      return component.load_links();
    });
  };

  // Render the basic graph for this component
  component.render_graph = function () {
    this.watches.forEach(function (watch) {
      watch.render(this.scope);
    }, this);
  };

  // Append a new link and return the component for easy chaining.
  component.link = function (rel, href) {
    return this.child(new bender.Link(this.scope.$environment, rel, href));
  };

  // Create a new property with the given name and value (the value is set
  // directly and not interpreted in any way)
  component.property = function (name, value) {
    return this.child(new bender.Property(name).value(value));
  };

  // Create a new event with the given name
  component.event = function (name) {
    return this.child(new bender.Event(name));
  };

  // Set the view of the component and return the component. If a view is given,
  // it is set as the view. If the first argument is not a view, then the
  // arguments list is interpreted as contents of the view of the component; a
  // new view is created and added if necessary, then all arguments are appended
  // as children of the view.
  component.view = function (view) {
    if (!(view instanceof bender.View)) {
      view = this.scope.$view || new bender.View();
      $foreach(arguments, view.append_child.bind(view));
    }
    if (!this.scope.$view) {
      this.append_child(view);
    }
    return this;
  };

  // Set a watch for the component and return the component. If a watch is
  // given, it is append to the component. If the first argument is not a watch,
  // then the arguments list is interpreted as contents of the watch; a new
  // watch is created and appended, then all arguments are appended as children
  // of the watch.
  component.watch = function (watch) {
    if (!(watch instanceof bender.Watch)) {
      watch = new bender.Watch();
      $foreach(arguments, watch.append_child.bind(watch));
    }
    return this.child(watch);
  };

  // Render and initialize the component, returning the promise of a concrete
  // instance.
  component.render_component = function (target, ref) {
    var fragment = target.ownerDocument.createDocumentFragment();
    var instance = this.render(fragment);
    instance.add_event_listeners();
    this.scope.$environment.flush_graph();
    target.insertBefore(fragment, ref);
    return instance;
  };

  component.loaded = function () {
    this.child_components.forEach(function (child) {
      child.loaded();
    });
    _trace("loaded %0/%1".fmt(this.id(), this.index));
    this.render_graph();
  };

  // Render this component to a concrete instance for the given target.
  component.render = function (target, stack) {
    var instance = this.scope.$environment.instance(this,
        stack && stack[stack.i].$this);
    on(instance, "will-render");
    return instance.render_view(target);
  };

  // Load all links for the component, from the further ancestor down to the
  // component itself. Return a promise that is fulfilled once all
  // links have been loaded in sequence.
  component.load_links = function () {
    var links = [];
    for (var p = this; p; p = p._prototype) {
      $$unshift(links, p.links);
    }
    var component = this;
    return flexo.collect_promises(links.map(function (link) {
      return link.load(component.scope.$document);
    })).then(function () {
      return component;
    });
  };

  // Get or set the prototype of the component (must be another component.)
  component.prototype = function (prototype) {
    if (arguments.length > 0) {
      if (prototype instanceof bender.Component) {
        if (this._prototype !== prototype ) {
          this.__visited = true;
          var visited = [this];
          for (var p = prototype; p && !p.__visited; p = p._prototype) {}
          visited.forEach(function (v) {
            delete v.__visited;
          });
          if (!p) {
            this._prototype = prototype;
            prototype.derived.push(this);
            this.vertices = {
              property: {
                component: extend(prototype.vertices.property.component,
                               this.vertices.property.component),
                instance: extend(prototype.vertices.property.instance,
                               this.vertices.property.instance)
              },
              event: {
                component: extend(prototype.vertices.event.component,
                               this.vertices.event.component),
                instance: extend(prototype.vertices.event.instance,
                               this.vertices.event.instance)
              }
            };
            this.properties = extend(prototype.properties, this.properties);
            this.property_definitions = extend(prototype.property_definitions,
                this.property_definitions);
            this.event_definitions = extend(prototype.event_definitions,
                this.event_definitions);
          } else {
            throw "Cycle in prototype chain";
          }
        }
        return this;
      }
    }
    return this._prototype;
  };

  // Handle new link, view, property and watch children for a component
  component.append_child = function (child) {
    if (child instanceof bender.Link) {
      this.links.push(child);
    } else if (child instanceof bender.View) {
      if (this.scope.$view) {
        console.error("Component already has a view");
      } else {
        this.scope.$view = child;
      }
    } else if (child instanceof bender.Property) {
      this.add_property(child);
    } else if (child instanceof bender.Event) {
      this.add_event(child);
    } else if (child instanceof bender.Watch) {
      this.watches.push(child);
    } else {
      return;
    }
    this.add_descendants(child);
    return element.append_child.call(this, child);
  };

  // Add a new property to the component, if no property with the same name was
  // already defined in the same component.
  component.add_property = function (child) {
    if (!child.init_value) {
      if (this.property_definitions.hasOwnProperty(child.name)) {
        console.error("Redefinition of property %0 in component %1"
            .fmt(child.name, this.index));
        return;
      }
      this.property_definitions[child.name] = child;
    }
    render_property_js(this.properties, child.name);
    if (child.bindings) {
      var set = new bender.SetProperty(child.name, child.select());
      if (typeof child.bindings[""].value === "string") {
        set_value_from_string.call(set, child.bindings[""].value, true,
            this.url());
      } else {
        set.value(child.bindings[""].value);
      }
      var watch = new bender.Watch().child(set);
      watch.bindings = true;
      Object.keys(child.bindings).forEach(function (id) {
        Object.keys(child.bindings[id]).forEach(function (prop) {
          watch.append_child(new bender.GetProperty(prop, id));
        });
      });
      this.append_child(watch);
    }
  };

  // Add a new event to the component
  component.add_event = function (child) {
    if (this.event_definitions.hasOwnProperty(child.name)) {
      console.warn("Redefinition of event %0 in component %1"
          .fmt(child.name, this.index));
      return;
    }
    this.event_definitions[child.name] = child;
  };

  // Component children of the view are added as child components with a
  // parent_component link; scopes are merged.
  component.add_child_component = function (child) {
    child.parent_component = this;
    this.child_components.push(child);
    var scope = Object.getPrototypeOf(this.scope);
    var old_scope = Object.getPrototypeOf(child.scope);
    if (scope[""] && old_scope[""]) {
      $$push(scope[""], old_scope[""]);
      delete old_scope[""];
    }
    Object.keys(old_scope).forEach(function (key) {
      if (key in scope && scope[key] !== old_scope[key]) {
        console.error("Redefinition of %0 in scope".fmt(key));
      } else {
        scope[key] = old_scope[key];
      }
    });
    var new_scope = Object.create(scope);
    Object.keys(child.scope).forEach(function (key) {
      new_scope[key] = child.scope[key];
    });
    child.scope = new_scope;
  };

  // Add ids to scope when a child is added, and add top-level components as
  // child components (other already have these components as parents so they
  // don’t get added)
  // TODO check this
  component.add_descendants = function (elem) {
    var scope = Object.getPrototypeOf(this.scope);
    var queue = [elem];
    while (queue.length > 0) {
      var e = queue.shift();
      if (e._id) {
        var id = "#" + e._id;
        if (!scope.hasOwnProperty(id)) {
          scope[id] = e;
          scope["@" + e._id] = e;
        } else {
          console.warn("Id %0 already defined in scope".fmt(e._id));
        }
      }
      if (e instanceof bender.Component && !e.parent_component) {
        this.add_child_component(e);
      }
      if (e.__bindings) {
        push_bindings(this, e, e.__bindings);
        delete e.__bindings;
      }
      $$unshift(queue, e.children);
    }
  };

  // Send an event notification for this component.
  component.notify = function (type, value) {
    var vertex = this.event_vertices[type];
    if (vertex) {
      vertex.visit(this.scope, value);
    }
  };


  // A component instance
  var instance = (bender.Instance = function (component, parent) {
    component.instances.push(this);
    this.properties = init_properties_object(this,
      Object.create(component.properties));
    this.event_vertices = Object.create(component.event_vertices);
    this.document_vertices = Object.create(component.document_vertices);
    this.scopes = [];
    for (var p = component; p; p = p._prototype) {
      var scope = get_instance_scope(p, parent);
      if (!scope.hasOwnProperty("")) {
        scope[""] = [];
      }
      scope[""].push(this);
      if (p._id) {
        var key = "@" + p._id;
        if (scope.hasOwnProperty(key)) {
          console.error("Id %0 already in scope".fmt(key));
        } else {
          scope[key] = this;
        }
      }
      var new_scope = this.scopes.push(Object.create(scope, {
        $that: { enumerable: true, value: p },
        $this: { enumerable: true, value: this }
      }));
    }
    this.children = [];
    if (parent) {
      this.parent = parent;
      parent.children.push(this);
    }
  }).prototype;

  instance.init_properties = flexo.nop;

  // Find the current property definition (i.e. Bender property node) for the
  // property of an instance
  instance.find_property_definition = function (name) {
    if (name in this.properties) {
      var scope = flexo.find_first(this.scopes, function (scope) {
        return scope.$that.property_definitions.hasOwnProperty(name);
      });
      if (scope) {
        return scope.$that.property_definitions[name];
      }
    }
  };

  Object.defineProperty(instance, "scope", {
    enumerable: true,
    get: function () {
      return this.scopes[0];
    }
  });

  instance.id = function () {
    return "%0:%1".fmt(this.scopes.map(function (scope) {
      return "%0,%1".fmt(scope.$that.id(), scope.$that.index);
    }).join(";"), this.index);
  };

  instance.add_event_listeners = function () {
    var type;
    for (var i = 0, n = this.scopes.length; i < n; ++i) {
      var scope = this.scopes[i];
      for (type in scope.$that.event_vertices) {
        if (scope.$that.event_vertices.hasOwnProperty(type)) {
          scope.$that.event_vertices[type].add_event_listener(scope);
        }
      }
    }
    for (type in this.document_vertices) {
      var vertex = this.document_vertices[type];
      var component = parent_component(vertex.get);
      vertex.add_event_listener(flexo.find_first(this.scopes, function (s) {
        return s.$that === component;
      }));
    }
    this.children.forEach(function (ch) {
      ch.add_event_listeners();
    });
  };

  // Send an event notification for this concrete instance only.
  instance.notify = component.notify;

  // Send a ready notification for this instance, as well as its children (and
  // so on recursively.)
  instance.ready = function () {
    this.children.forEach(function (child) {
      child.ready();
    });
    _trace("ready! %0".fmt(this.id()));
    this.notify("ready");
  };

  // Render the view and return itself
  instance.render_view = function (target) {
    var stack = [];
    flexo.hcaErof(this.scopes, function (scope) {
      if (scope.$that.scope.$view) {
        var mode = scope.$that.scope.$view._stack;
        if (mode === "replace") {
          stack = [scope];
        } else if (mode === "top") {
          stack.push(scope);
        } else {
          stack.unshift(scope);
        }
      }
    });
    stack.i = 0;
    stack.bindings = stack.map(function () { return []; });
    for (var n = stack.length; stack.i < n && !stack[stack.i].$that.scope.$view;
        ++stack.i) {}
    if (stack.i < n && stack[stack.i].$that.scope.$view) {
      stack[stack.i].$that.scope.$view.render(target, stack);
    }
    return this;
  };


  var link = _class(bender.Link = function (environment, rel, href) {
    this.init();
    this.environment = environment;
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = href;
  }, bender.Element);

  environment.deserialize.link = function (elem) {
    return this.deserialize_children(new bender.Link(this,
          elem.getAttribute("rel"),
          flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"))), elem);
  };

  // Load links according to their rel attribute. If a link requires delaying
  // the rest of the loading, return a promise then fulfill it with a value to
  // resume loading (see script rendering below.)
  link.load = function (document) {
    if (this.environment.urls[this.href]) {
      return this.environment.urls[this.href];
    }
    this.environment.urls[this.href] = this;
    var load = link.load[this.rel];
    if (typeof load === "function") {
      return load.call(this, document);
    }
    console.warn("Cannot load “%0” link".fmt(this.rel));
  };

  // Scripts are handled for HTML only by default. Override this method to
  // handle other types of documents.
  link.load.script = function (document) {
    var ns = document.documentElement.namespaceURI;
    if (ns === flexo.ns.html) {
      return flexo.promise_script(this.href, document.head)
        .then(function (script) {
          this.loaded = script;
          return this;
        }.bind(this));
    }
    console.warn("Cannot render script link for namespace %0".fmt(ns));
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  link.load.stylesheet = function (document) {
    var ns = document.documentElement.namespaceURI;
    if (ns === flexo.ns.html) {
      var link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      document.head.appendChild(link);
      this.loaded = link;
    } else {
      console.warn("Cannot render stylesheet link for namespace %0".fmt(ns));
    }
  };

  // View of a component
  var view = _class(bender.View = function () {
    this.init();
  }, bender.Element);

  flexo._accessor(bender.View, "render_id", normalize_render_id);
  flexo._accessor(bender.View, "stack", normalize_stack);

  environment.deserialize.view = function (elem) {
    return this.deserialize_children(new bender.View()
        .id(elem.getAttribute("id"))
        .render_id(elem.getAttribute("render-id"))
        .stack(elem.getAttribute("stack")), elem);
  };

  // Append child for view and its children
  view.append_child = function (child) {
    if (child instanceof bender.Component) {
      var p = parent_component(this);
      if (p) {
        p.add_child_component(child);
      }
    }
    return element.append_child.call(this, child);
  };

  // Render the contents of the view by appending into the target, passing the
  // stack of views further down for the <content> element.
  view.render = function (target, stack) {
    this.children.forEach(function (ch) {
      ch.render(target, stack);
    });
  };

  var content = _class(bender.Content = function () {
    this.init();
  }, bender.Element);

  environment.deserialize.content = function (elem) {
    return this.deserialize_children(new bender.Content()
        .id(elem.getAttribute("id")), elem);
  };

  content.render = function (target, stack) {
    var indices = [];
    for (var i = stack.i + 1, n = stack.length; i < n; ++i) {
      if (stack[i].$that.scope.$view) {
        indices.push(i);
      }
    }
    if (indices.length) {
      indices.forEach(function (i) {
        var j = stack.i;
        stack.i = i;
        stack[i].$that.scope.$view.render(target, stack);
        stack.i = j;
      });
    } else {
      view.render.call(this, target, stack);
    }
  };

  // Create a new attribute with an optional namespace and a name
  var attribute = _class(bender.Attribute = function (ns, name) {
    this.init();
    if (arguments.length < 2) {
      this._name = flexo.safe_string(ns);
    } else {
      this._ns = flexo.safe_string(ns);
      this._name = flexo.safe_string(name);
    }
  }, bender.Element);

  flexo._accessor(bender.Attribute, "name", flexo.safe_string);
  flexo._accessor(bender.Attribute, "ns", flexo.safe_string);

  environment.deserialize.attribute = function (elem) {
    var attr = new bender.Attribute(elem.getAttribute("ns"),
        elem.getAttribute("name")).id(elem.getAttribute("id"));
    return this.deserialize_children(attr, elem);
  };

  // Only add text content (DOM text nodes or bender Text elements)
  attribute.append_child = function (child) {
    if (child instanceof bender.DOMTextNode || child instanceof bender.Text) {
      return element.append_child.call(this, child);
    }
  };

  // Render as an attribute of the target
  attribute.render = function (target, stack) {
    if (target.nodeType === window.Node.ELEMENT_NODE) {
      var contents = this.children.reduce(function (t, node) {
        return t + node.text ? node.text() : node.textContent;
      }, "");
      var attr = target.setAttributeNS(this.ns(), this.name(), contents);
      this.add_id_to_scope(attr, stack);
    }
  };

  // Bender Text element. Although it can only contain text, it can also have an
  // id so that it can be referred to by a watch.
  var text = _class(bender.Text = function (text) {
    this.init();
    this._text = flexo.safe_string(text);
  }, bender.Element);

  flexo._accessor(bender.Text, "text", flexo.safe_string);

  environment.deserialize.text = function (elem) {
    return this.deserialize_children(new bender.Text(shallow_text(elem))
        .id(elem.getAttribute("id")), elem);
  };

  text.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this._text);
    this.add_id_to_scope(node, stack);
    target.appendChild(node);
  };

  var dom_element = _class(bender.DOMElement = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = flexo.safe_string(name);
    this.attrs = {};
    this.event_vertices = {};
  }, bender.Element);

  dom_element.attr = function (ns, name, value) {
    if (arguments.length > 2) {
      if (!this.attrs.hasOwnProperty(ns)) {
        this.attrs[ns] = {};
      }
      var bindings = bindings_string(value);
      if (typeof bindings === "string") {
        this.attrs[ns][name] = value;
      } else {
        bindings[""].set = new bender.SetDOMAttribute(ns, name);
        var parent = parent_component(this);
        if (parent) {
          push_bindings(parent, this, bindings);
        } else {
          if (!this.__bindings) {
            this.__bindings = [];
          }
          this.__bindings.push(bindings);
        }
      }
      return this;
    }
    return this.attrs[ns] && this.attrs[ns][name];
  };

  dom_element.append_child = view.append_child;

  dom_element.render = function (target, stack) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    if (this.fake_id) {
      stack[stack.i][this.fake_id] = elem;
    }
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    this.add_id_to_scope(elem, stack, true);
    view.render.call(this, elem, stack);
    for (var type in this.event_vertices) {
      this.event_vertices[type].add_event_listener(stack[stack.i]);
    }
    target.appendChild(elem);
  };

  dom_element.text = function (text) {
    return this.child(new bender.DOMTextNode().text(text));
  };

  var dom_text = _class(bender.DOMTextNode = function () {
    this.init();
  }, bender.Element);

  dom_text.text = function (text) {
    if (arguments.length > 0) {
      text = flexo.safe_string(text);
      var bindings = bindings_string(text);
      if (typeof bindings === "string") {
        this._text = text;
      } else {
        var parent = parent_component(this);
        bindings[""].set = new bender.SetDOMProperty("textContent");
        if (parent) {
          push_bindings(parent, this, bindings);
        } else {
          this.__bindings = bindings;
        }
      }
      return this;
    }
    return this._text || "";
  };

  dom_text.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this.text());
    target.appendChild(node);
    if (this.fake_id) {
      stack[stack.i][this.fake_id] = node;
    }
  };


  var property = _class(bender.Property = function (name, init_value) {
    this.init();
    this.name = flexo.safe_string(name);
    this.init_value = !!init_value;
  }, bender.Element);

  flexo._accessor(bender.Property, "as", normalize_as);
  flexo._accessor(bender.Property, "select", normalize_property_select);
  flexo._accessor(bender.Property, "match");
  flexo._accessor(bender.Property, "value");

  environment.deserialize.property = function (elem) {
    return this.deserialize_element_with_value(new
        bender.Property(elem.getAttribute("name"))
      .select(elem.getAttribute("select")), elem);
  };


  var event = _class(bender.Event = function (name) {
    this.init();
    this.name = flexo.safe_string(name);
  }, bender.Element);

  environment.deserialize.event = function (elem) {
    return new bender.Event(elem.getAttribute("name"));
  };


  var watch = _class(bender.Watch = function () {
    this.init();
    this.gets = [];
    this.sets = [];
  }, bender.Element);

  flexo._accessor(bender.Watch, "match");

  environment.deserialize.watch = function (elem) {
    return this.deserialize_children(new bender.Watch()
        .id(elem.getAttribute("id"))
        .match(elem.getAttribute("match")), elem);
  };

  // Append Get and Set children to the respective arrays
  watch.append_child = function (child) {
    if (child instanceof bender.Get) {
      this.gets.push(child);
    } else if (child instanceof bender.Set) {
      this.sets.push(child);
    }
    return element.append_child.call(this, child);
  };

  // Render the watch and the corresponding get and set edges in the parent
  // component scope
  watch.render = function (scope) {
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
            for (var p in get.bindings[select]) {
              var u = target.property_vertices[p];
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

  var get_set = _class(bender.GetSet = function () {}, bender.Element);

  flexo._accessor(bender.GetSet, "as", normalize_as);
  flexo._accessor(bender.GetSet, "match");
  flexo._accessor(bender.GetSet, "value");

  _class(bender.Get = function () {}, bender.GetSet);


  var get_dom_event =
    _class(bender.GetDOMEvent = function (type, select, property) {
      init_event.call(this, type, select);
      if (property) {
        this.property = property;
      }
    }, bender.Get);

  flexo._accessor(bender.Get, "stop_propagation");
  flexo._accessor(bender.Get, "prevent_default");

  get_dom_event.render = function (scope) {
    return vertex_event(this, scope, bender.DOMEventVertex);
  };


  var get_event = _class(bender.GetEvent = function (type, select) {
    init_event.call(this, type, select);
  }, bender.Get);

  get_event.render = function (scope) {
    return vertex_event(this, scope, bender.EventVertex);
  };


  var get_property = _class(bender.GetProperty = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Get);

  get_property.render = function (scope) {
    return vertex_property(element, scope);
  };

  _class(bender.GetAttribute = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Get);

  // TODO


  environment.deserialize.get = function (elem) {
    var get;
    var select = elem.getAttribute("select") || "$this";
    if (elem.hasAttribute("dom-event")) {
      get = new bender.GetDOMEvent(elem.getAttribute("dom-event"), select,
          elem.getAttribute("property"))
        .prevent_default(flexo.is_true(elem.getAttribute("prevent-default")))
        .stop_propagation(flexo.is_true(elem.getAttribute("stop-propagation")));
    } else if (elem.hasAttribute("event")) {
      get = new bender.GetEvent(elem.getAttribute("event"), select);
    } else if (elem.hasAttribute("property")) {
      get = new bender.GetProperty(elem.getAttribute("property"), select);
    } else if (elem.hasAttribute("attr")) {
      get = new bender.GetAttribute(elem.getAttribute("attr"), select);
    }
    return this.deserialize_element_with_value(get, elem);
  };

  var set = _class(bender.Set = function () {
    this.init();
  }, bender.GetSet);

  set.render = function (scope) {
    return new bender.DummyEdge().init(this, scope.$environment.vortex);
  };


  // TODO synthesize DOM event
  _class(bender.SetDOMEvent = function (type, select) {
    init_event.call(this, type, select);
  }, bender.Set);


  var set_event = _class(bender.SetEvent = function (type, select) {
    init_event.call(this, type, select);
  }, bender.Set);

  set_event.render = function (scope) {
    var vertex = vertex_event(this, scope, bender.EventVertex);
    if (vertex) {
      return new bender.EventEdge(this, vertex);
    }
  };

  var set_dom_property = _class(bender.SetDOMProperty = function (name, element) {
    this.init();
    this.name = name;
    this.element = element;
  }, bender.Set);

  set_dom_property.render = function (scope) {
    var dest = vertex_property(this.select, scope, 
    return render_edge(this, scope, bender.DOMPropertyEdge);
  };

  var set_property = _class(bender.SetProperty = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Set);

  set_property.render = function (scope) {
    return render_edge(this, scope, bender.PropertyEdge);
  };

  var set_dom_attribute =
    _class(bender.SetDOMAttribute = function (ns, name, select) {
    this.init();
    this.ns = ns;
    this.name = name;
    this.select = select;
  }, bender.Set);

  set_dom_attribute.render = function (scope) {
    return render_edge(this, scope, bender.DOMAttributeEdge);
  };

  _class(bender.SetAttribute = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Set);

  environment.deserialize.set = function (elem) {
    var set;
    var select = elem.getAttribute("select") || "$this";
    if (elem.hasAttribute("dom-event")) {
      set = new bender.SetDOMEvent(elem.getAttribute("dom-event"), select);
    } else if (elem.hasAttribute("event")) {
      set = new bender.SetEvent(elem.getAttribute("event"), select);
    } else if (elem.hasAttribute("dom-property")) {
      set = new bender.SetDOMProperty(elem.getAttribute("dom-property"),
          select);
    } else if (elem.hasAttribute("property")) {
      set = new bender.SetProperty(elem.getAttribute("property"), select);
    } else if (elem.hasAttribute("dom-attr")) {
      set = new bender.SetDOMAttribute(
          flexo.safe_string(elem.getAttribute("ns")),
          elem.getAttribute("dom-attr"), select);
    } else if (elem.hasAttribute("attr")) {
      set = new bender.SetAttribute(elem.getAttribute("attr"), select);
    } else {
      set = new bender.Set();
    }
    return this.deserialize_element_with_value(set, elem);
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

  Object.defineProperty(property_vertex, "is_component_vertex", {
    get: function () {
      var select = this.element.select();
      return select === "$that" || select[0] === "#";
    }
  });


  // We give the vortex its own class for graph reasoning purposes
  _class(bender.Vortex = function () {
    this.init();
  }, bender.Vertex);

  // Watch vertex corresponding to a watch element, gathers the inputs and
  // outputs of the watch
  var watch_vertex = _class(bender.WatchVertex = function (watch, component) {
    this.init();
    this.watch = watch;
    this.component = component;
  }, bender.Vertex);

  // Shift the input dynamic scope to the new scope for the watch
  watch_vertex.shift_scope = function (scope, select) {
    if (scope.$this.scopes) {
      var scopes = scope.$this.scopes;
      for (var i = 0, n = scopes.length; i < n; ++i) {
        for (var j = 0, m = scopes[i][""].length; j < m; ++j) {
          for (var k = 0, l = scopes[i][""][j].scopes.length;
              k < l && scopes[i][""][j].scopes[k].$that !== this.component; ++k)
            {}
          if (k < l) {
            var scope_ = scopes[i][""][j].scopes[k];
            if (scope_[select || "$this"] === scope.$this) {
              return scope_;
            }
          }
        }
      }
    } else {
      for (var i = 0, n = scope.$this[""].length; i < n; ++i) {
        if (scope.$this[""][i] === this.component) {
          return scope.$this[""][i].scope;
        }
      }
    }
  };


  // DOM event vertex
  var dom_event_vertex = _class(bender.DOMEventVertex =
      function (component, element) {
        this.init();
        this.element = element;
      }, bender.Vertex);

  dom_event_vertex.add_event_listener = function (scope, target) {
    if (arguments.length === 1) {
      target = scope[this.element.select];
      if (target && this.element.property) {
        var v;
        if (target.scopes) {
          var scope_ = flexo.find_first(target.scopes, function (s) {
            return s.$that.property_vertices.hasOwnProperty(this.element.property);
          }, this);
          if (scope_) {
            v = scope_.$that.property_vertices[this.element.property];
          }
        } else if (target.property_vertices.hasOwnProperty(this.element.property)) {
          v = target.property_vertices[this.element.property];
        }
        if (v) {
          v.add_outgoing(new bender.EventListenerEdge(this, scope, target));
          target = target.properties[this.element.select];
        }
      }
      this.add_event_listener(scope, target)
    } else if (target && typeof target.addEventListener === "function") {
      target.addEventListener(this.element.type, function (e) {
        if (this.element.prevent_default) {
          e.preventDefault();
        }
        if (this.element.stop_propagation) {
          e.stopPropagation();
        }
        this.visit(scope, e);
      }.bind(this), false);
    }
  };


  var event_vertex = _class(bender.EventVertex = function (component, element) {
    this.init();
    this.element = element;
  }, bender.Vertex);

  // TODO only for delayed events
  event_vertex.add_event_listener = function (scope) {
    var target = scope[this.element.select];
    if (target) {
      flexo.listen(target, this.element.type, function (e) {
        this.visit(scope, e);
      });
    }
  };


  // Create a new property vertex for a component (or instance) and property
  // definition pair.
  var property_vertex = _class(bender.PropertyVertex =
      function (component, element) {
        this.init();
        this.component = component;
        this.element = element;
      }, bender.Vertex);


  // TODO Attribute vertex
  _class(bender.AttributeVertex = function (component, attribute) {
    this.init(component);
    this.attribute = attribute;
  }, bender.Vertex);


  // Simple edge between two vertices (source and dest)
  // Instance edges have an additional instance property
  var edge = (bender.Edge = function () {}).prototype;

  edge.init = function (dest) {
    if (dest) {
      dest.add_incoming(this);
    }
    return this;
  };

  // Remove an edge from its source vertex’s outgoing list and its destination
  // vertex’s incoming list.
  edge.remove = function () {
    flexo.remove_from_array(this.source.outgoing, this);
    flexo.remove_from_array(this.dest.incoming, this);
    this.source = null;
    this.dest = null;
  };

  edge.follow = function (scope, input) {
    try {
      return [scope, this.followed(scope, this.element.value() ?
        this.element.value().call(scope.$this, scope, input) : input)];
    } catch (e) {
    }
  };

  edge.followed = snd;


  // TODO review
  var event_listener_edge =
    _class(bender.EventListenerEdge = function (dest, scope, target) {
      this.init(dest);
      this.scope = scope;
      this.target = target;
    }, bender.Edge);


  // Edges that are tied to an element (e.g., watch, get, set) and a scope
  var element_edge = _class(bender.ElementEdge = function () {}, bender.Edge);

  element_edge.init = function (element, dest) {
    edge.init.call(this, dest);
    this.element = element;
    return this;
  };


  // Edges with no target
  var dummy_edge = _class(bender.DummyEdge = function (element, dest) {
    this.init(element, dest);
  }, bender.ElementEdge);


  // Edges to a watch vertex
  var watch_edge = _class(bender.WatchEdge = function (get, dest) {
    this.init(get, dest);
  }, bender.ElementEdge);

  // Follow a watch edge: shift the input scope to match that of the destination
  // watch node, and evaluate the value of the edge using the watch’s context.
  watch_edge.follow = function (scope, input) {
    try {
      var scope_ = this.dest.shift_scope(scope, this.element.select);
      return [scope_, this.element.value() ?
        this.element.value().call(scope_.$this, scope_, input) : input];
    } catch (e) {
      console.warn("Error following watch edge v%0 -> v%1: %2"
          .fmt(this.source.index, this.dest.index, e));
    }
  };


  // Edges for a Bender event
  var event_edge = _class(bender.EventEdge = function (set, target) {
    var dest = vertex_event(this.element
    this.init(set, dest);
  }, bender.ElementEdge);

  event_edge.followed = function (scope, value) {
    return { type: this.element.type, value: value };
  };


  // A DOM property edge is associated to a set element and always goes to the
  // vortex
  var dom_property_edge = _class(bender.DOMPropertyEdge = function (set, target) {
    this.init(set);
    this.target = target;
  }, bender.ElementEdge);

  dom_property_edge.followed = function (scope, value) {
    var target = scope[this.element.select];
    if (target instanceof window.Node) {
      target[this.element.name] = value;
    }
    return value;
  };


  // Set a Bender property
  var property_edge = _class(bender.PropertyEdge = function (set, target) {
    var dest = target.property_vertices[set.name];
    if (!dest) {
      console.warn("No property %0 for component %1"
        .fmt(set.name, target.index));
      return;
    }
    this.init(set, dest);
    this.target = target;
  }, bender.ElementEdge);

  property_edge.follow = function (scope, input) {
    if (scope.$this !== scope.$that || this.element.select === "$that") {
      var value = this.element.value() ?
        this.element.value().call(scope.$this, scope, input) : input;
      set_property_silent(scope[this.element.select], this.element.name, value);
      return [scope, value];
    }
  };


  // Set a DOM attribute
  var dom_attribute_edge = _class(bender.DOMAttributeEdge = function (set, target) {
    this.init(set);
    this.target = target;
  }, bender.ElementEdge);

  dom_attribute_edge.followed = function (scope, value) {
    var target = scope[this.element.select];
    if (target instanceof window.Node) {
      target.setAttributeNS(this.element.ns, this.element.name, value);
    }
  };


  // Dependency edge
  var dependency_edge = _class(bender.DependencyEdge = function (watch, dest) {
    this.init(watch, dest);
  }, bender.ElementEdge);

  dependency_edge.follow = flexo.nop;




  // Identify property bindings for a dynamic property value string. When there
  // are none, return the string unchanged; otherwise, return the dictionary of
  // bindings (indexed by id, then property); bindings[""] will be the new value
  // for the set element of the watch to create.
  function bindings_dynamic(value) {
    var bindings = translate_bindings(value);
    return Object.keys(bindings).length === 0 ? bindings[""].value : bindings;
  }


  // Regular expressions to match property bindings, broken into smaller pieces
  // for legibility
  var RX_ID =
    "(?:[$A-Z_a-z\x80-\uffff]|\\\\.)(?:[$0-9A-Z_a-z\x80-\uffff]|\\\\.)*";
  var RX_PAREN = "\\(((?:[^\\\\\\)]|\\\\.)*)\\)";
  var RX_CONTEXT = "(?:([#@])(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_TICK = "(?:`(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_PROP = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_CONTEXT, RX_TICK));
  var RX_PROP_G = new RegExp("(^|[^\\\\])(?:%0(?:%1)?|%1)"
      .fmt(RX_CONTEXT, RX_TICK), "g");

  // Indentify property bindings for a string property value string (e.g. from a
  // literal attribute or text node.)
  function bindings_string(value) {
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
  }

  // Check that a value is set to the type of its property
  function check_value(v, property) {
    var as = resolve_as.call(property);
    if ((as === "boolean" && typeof v !== "boolean") ||
        (as === "number" && typeof v !== "number") ||
        (as === "string" && typeof v !== "string")) {
      console.warn("%0Setting property %1 to %2: expected a %3, got %4 instead."
          .fmt(property.__loc, property.name, v, as, typeof(v)));
    }
    delete property.__loc;
  }

  // Extend the proto object with properties of the ext object
  function extend(proto, ext) {
    var object = Object.create(proto);
    Object.getOwnPropertyNames(ext).forEach(function (key) {
      Object.defineProperty(object, key,
        Object.getOwnPropertyDescriptor(ext, key));
    });
    return object;
  }

  // Find all explicit vertices of the given kind (“property,” “event” or
  // “document”) and level (“component” or “instance”) with the given name for a
  // component.
  function find_vertices(component, kind, level, name) {
    var queue = [component];
    var vertices = [];
    while (queue.length > 0) {
      var q = queue.shift();
      if (name in q.vertices[kind][level]) {
        vertices.push(q.vertices[kind][level][name]);
      }
      $$push(queue, q.derived);
    }
    if (level === "component") {
      $$push(vertices, find_vertices(component, kind, "instance", name));
    }
    return vertices;
  }

  // Get the instance scope for an instance from its parent instance, i.e. the
  // scope in the parent instance pointing to the parent component. If either
  // instance or component has no parent, simply create a new scope from the
  // abstract scope, that is, the prototype of the component scope.
  function get_instance_scope(component, parent) {
    if (!parent || !component.parent_component) {
      return Object.create(Object.getPrototypeOf(component.scope));
    }
    var scope = flexo.find_first(parent.scopes, function (scope) {
      return scope.$that === component.parent_component;
    });
    if (scope) {
      return Object.getPrototypeOf(scope);
    }
  }

  // Initializer for both Bender and DOM event properties
  function init_event(type, select) {
    // jshint validthis: true
    this.init();
    this.type = type;
    this.select = select;
  }

  // Initialize the properties object for a component or instance, setting the
  // hidden epsilon meta-property to point back to the component that owns it.
  // The property is made configurable for inherited components and instances.
  function init_properties_object(component, properties) {
    Object.defineProperty(properties, "", {
      value: component,
      configurable: true
    });
    return properties;
  }

  function init_property(property, vertex) {
    // jshint validthis: true
    if (property._select === "$this") {
      this.properties[property.name] = property.value().call(this, this.scope);
    } else {
      vertex.visit(this.scope);
    }
  }

  // Make a watch for a set of bindings: add the set element created for the
  // bindings (e.g., SetDOMProperty to set the text content or SetDOMAttribute
  // to set an attribute) then a get element for each bound property.
  function make_watch_for_bindings(parent, bindings, target) {
    bindings[""].set.select = target;
    var watch = new bender.Watch()
      .child(bindings[""].set.value(bindings[""].value));
    watch.bindings = true;
    Object.keys(bindings).forEach(function (id) {
      Object.keys(bindings[id]).forEach(function (prop) {
        watch.append_child(new bender.GetProperty(prop, id));
      });
    });
    parent.append_child(watch);
  }

  // Normalize the `as` property of an element so that it matches a known value.
  // Set to “dynamic” by default.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as === "string" || as === "number" || as === "boolean" ||
      as === "json" || as === "dynamic" ? as : "inherit";
  }

  // Normalize the `select` property of a property element so that it matches a
  // known value. Set to “$this” by default.
  function normalize_property_select(select) {
    select = flexo.safe_trim(select);
    return select === "$that" ? select : "$this";
  }

  // Normalize the `render-id` property of a view element so that it matches a
  // known value. Set to “none” by default.
  function normalize_render_id(render_id) {
    render_id = flexo.safe_trim(render_id).toLowerCase();
    return render_id === "class" || render_id === "id" ? render_id : "none";
  }

  // Normalize the `stack` property of an element so that it matches a known
  // value. Set to “top” by default.
  function normalize_stack(stack) {
    stack = flexo.safe_trim(stack).toLowerCase();
    return stack === "bottom" || stack === "replace" ? stack : "top";
  }

  function on(component, type) {
    var prototype = component.scope.$that || component;
    if (prototype._on.hasOwnProperty(type)) {
      try {
        prototype._on[type].forEach(function (handler) {
          handler(component, type);
        });
      } catch (e) {
      }
    }
  }

  // Find the closest ancestor of node (including self) that is a component and
  // return it if found
  function parent_component(node) {
    for (; node && !(node instanceof bender.Component); node = node.parent) {}
    if (node) {
      return node;
    }
  }

  // Push a bindings object in the bindings scope of a component
  function push_bindings(parent, element, bindings) {
    // jshint validthis:true
    if (element.parent instanceof bender.Get ||
        element.parent instanceof bender.Set) {
      return;
    }
    var target = "$%0".fmt(parent.scope.$environment.bindings_count++);
    element.fake_id = target;
    Object.getPrototypeOf(parent.scope)[target] = element;
    if (Array.isArray(bindings)) {
      bindings.forEach(function (b) {
        make_watch_for_bindings(parent, b, target);
      });
    } else {
      make_watch_for_bindings(parent, bindings, target);
    }
  }

  function render_edge(set, scope, Constructor) {
    var target = scope[set.select];
    if (target) {
      return new Constructor(set, target, dest);
    }
  }

  // Render a Javascript property in the properties object.
  function render_property_js(properties, name, value) {
    Object.defineProperty(properties, name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return value;
      },
      set: function (v, silent) {
        if (this.hasOwnProperty(name)) {
          check_value(v, this[""].scope.$that.property_definitions[name]);
          value = v;
        } else {
          render_property_js(this[""].properties, name, v);
        }
        if (!silent) {
          visit_vertices(this[""].scope, "property", name, v);
        }
      }
    });
  }

  // Resolve the “inherit” value for `as`
  function resolve_as() {
    var as = this.as();
    if (as !== "inherit") {
      return as;
    }
    for (var p = parent_component(this); p; p = p._prototype) {
      if (p.property_definitions.hasOwnProperty(this.name)) {
        as = p.property_definitions[this.name].as();
        if (as !== "inherit") {
          return as;
        }
      }
    }
    return "dynamic"
  };

  function select_level(select) {
    return select === "$that" || (select && select[0] === "#") ?
      "component" : "instance";
  }

  // Set a default value depending on the as attribute
  function set_default_value() {
    // jshint validthis:true
    this._value = flexo.funcify({
      "boolean": false,
      number: 0,
      string: "",
      dynamic: snd
    }[resolve_as.call(this)]);
    return this;
  }

  // Set id or class for an output node based on the render-id attribute
  function set_id_or_class(node, stack, id) {
    var render = stack[stack.i].$that.scope.$view._render_id;
    if (render === "id") {
      node.setAttribute("id", id);
    } else if (render === "class" && node.classList) {
      node.classList.add(id);
    }
  }

  // Silently set a property value for a component
  function set_property_silent(component, property, value) {
    for (var p = component.properties, descriptor; p && !descriptor;
        descriptor = Object.getOwnPropertyDescriptor(p, property),
        p = Object.getPrototypeOf(p)) {}
    if (descriptor) {
      descriptor.set.call(component.properties, value, true);
      return value;
    }
  }

  // Set the value of an object that has a value/as pair of attributes. Only for
  // deserialized values.
  function set_value_from_string(value, needs_return, loc) {
    // jshint validthis:true
    var bindings;
    var as = resolve_as.call(this);
    if (as === "boolean") {
      this._value = flexo.is_true(value);
    } else if (as === "number") {
      this._value = flexo.to_number(value);
    } else {
      if (as === "json") {
        try {
          this._value = JSON.parse(flexo.safe_string(value));
        } catch (e) {
          console.error("%0: Could not parse “%2” as JSON".fmt(loc, value));
          this._value = undefined;
        }
      } else if (as === "dynamic") {
        bindings = bindings_dynamic(flexo.safe_string(value));
        if (typeof bindings === "object") {
          this.bindings = bindings;
          value = bindings[""].value;
        } else {
          value = bindings;
        }
        if (needs_return) {
          value = "return " + value;
        }
        try {
          this._value = new Function("$scope", "$in", value);
        } catch (e) {
          console.error("%0: Could not parse “%1” as Javascript"
              .fmt(loc, value));
          this._value = snd;
        }
      } else { // if (as === "string") {
        var safe = flexo.safe_string(value);
        bindings = bindings_string(safe);
        if (typeof bindings === "object") {
          this.bindings = bindings;
          this._value = bindings[""].value;
        } else {
          this._value = safe;
        }
      }
    }
    this._value = flexo.funcify(this._value);
    return this;
  }

  // Return the concatenation of all text children (and only children) of elem
  function shallow_text(elem) {
    var text = "";
    for (var ch = elem.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType === window.Node.TEXT_NODE ||
          ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        text += ch.textContent;
      }
    }
    return text;
  }

  function snd(_, y) {
    // jshint unused: true
    return y;
  }

  // Sort all edges in a graph from its set of vertices. Simply go through
  // the list of vertices, starting with the sink vertices (which have no
  // outgoing edge) and moving edges from the vertices to the sorted list of
  // edges.
  function sort_edges(vertices) {
    var queue = vertices.filter(function (vertex) {
      if (vertex instanceof bender.PropertyVertex &&
        vertex.outgoing.length === 0) {
        vertex.add_outgoing(new bender.Edge().init(vertex.environment.vortex));
      }
      vertex.__out = vertex.outgoing.length;
      return vertex.__out === 0;
    });
    var edges = [];
    while (queue.length) {
      var v = queue.shift();
      $$unshift(edges, v.incoming.map(function (edge) {
        if (edge.source.hasOwnProperty("__out")) {
          --edge.source.__out;
        } else {
          edge.source.__out = edge.source.outgoing.length - 1;
        }
        if (edge.source.__out === 0) {
          queue.push(edge.source);
        }
        return edge;
      }));
    }
    vertices.forEach(function (vertex) {
      if (vertex.__out !== 0) {
        console.error("sort_edges: unqueued vertex", vertex);
      }
      delete vertex.__out;
    });
    return edges;
  }

  function should_init_component_property(queue, component) {
    while (queue.length) {
      var edge = queue.shift();
      if (edge.source instanceof bender.EventVertex ||
          edge.source instanceof bender.DOMEventVertex) {
        break;
      }
      if (edge instanceof bender.PropertyEdge && edge.target !== component) {
        break;
      }
      if (edge.source instanceof bender.PropertyVertex) {
        return false;
      }
      $$push(queue, edge.source.incoming);
    }
    return true;
  }

  function should_init_instance_property(queue, instance) {
    while (queue.length) {
      var edge = queue.shift();
      if (edge.source instanceof bender.EventVertex ||
          edge.source instanceof bender.DOMEventVertex) {
        break;
      }
      if (edge instanceof bender.PropertyEdge &&
          !flexo.find_first(instance.scopes, function (s) {
            return s.$that === edge.target;
           })) {
        break;
      }
      if (edge.source instanceof bender.PropertyVertex) {
        return false;
      }
      $$push(queue, edge.source.incoming);
    }
    return true;
  };

  // Translate bindings from Javascript code (e.g., translate `x into
  // this.properties["x"] or @foo into $scope["@foo"]), taking care of not
  // replacing anything that is quoted or between parentheses.
  function translate_bindings(value) {
    var bindings = {};
    var state = "";
    var chunk = "";
    var v = "";
    var id, prop;
    var escape = false;
    var rx_start = new RegExp("^[$A-Z_a-z\x80-\uffff]$");
    var rx_cont = new RegExp("^[$0-9A-Z_a-z\x80-\uffff]$");

    function bind_prop() {
      if (!bindings.hasOwnProperty(id)) {
        bindings[id] = {};
      }
      bindings[id][prop] = true;
    }

    function start(s, c) {
      if (chunk) {
        v += chunk;
      }
      chunk = c || "";
      state = s;
    }

    function end(s, c) {
      if (c) {
        chunk += c;
      }
      if (chunk) {
        v += chunk;
      }
      chunk = "";
      state = s;
    }

    var advance = {

      // Regular code, look for new quoted string, comment, id or property
      "": function (c, d) {
        switch (c) {
          case "'":
            start("q", c);
            break;
          case '"':
            start("qq", c);
            break;
          case "/":
            switch (d) {
              case "/": start("comment", c); break;
              case "*": start("comments", c); break;
              default: chunk += c;
            }
            break;
          case "@": case "#":
            var ch = "$scope[\"" + c;
            if (rx_start.test(d)) {
              id = c + d;
              start("id", ch + d);
              return 1;
            } else if (d === "(") {
              id = c;
              start("idp", ch);
              return 1;
            } else {
              chunk += c;
            }
            break;
          case "`":
            var ch = "$scope.$this.properties[\"";
            if (rx_start.test(d)) {
              id = "$this";
              prop = d;
              start("prop", ch + d);
              return 1;
            } else if (d === "(") {
              id = "$this";
              prop = "";
              start("propp", ch);
              return 1;
            } else {
              chunk += c;
            }
            break;
          default:
            chunk += c;
        }
      },

      // Single-quoted string
      q: function (c) {
        switch (c) {
          case "'": end("", c); break;
          case "\\": escape = true;
          default: chunk += c;
        }
      },

      // Double-quoted string
      qq: function (c) {
        switch (c) {
          case '"': end("", c); break;
          case "\\": escape = true;
          default: chunk += c;
        }
      },

      // Single-line comment
      comment: function (c) {
        if (c === "\n") {
          end("", c);
        } else {
          chunk += c;
        }
      },

      // Multi-line comment:
      comments: function (c, d) {
        if (c === "*" && d === "/") {
          end("", "*/");
          return 1;
        } else {
          chunk += c;
        }
      },

      // Component or instance identifier, starting with # or @
      id: function (c, d) {
        if (rx_cont.test(c)) {
          chunk += c;
          id += c;
        } else if (c === "\\") {
          escape = true;
          if (d === '"') {
            chunk += c;
            id += c;
          }
        } else if (c === "`") {
          prop = "";
          start("prop", "\"].properties[\"");
        } else {
          chunk += "\"]";
          start("", c);
          id = "";
        }
      },

      // Quoted identifier (between parentheses)
      idp: function (c, d, e) {
        if (c === "\\") {
          escape = true;
          if (d === '"') {
            chunk += c;
            id += c;
          }
        } else if (c === '"') {
          chunk += "\\\"";
          id += c;
        } else if (c === ")") {
          if (d === "`") {
            if (e === "(") {
              prop = "";
              start("propp", "\"].properties[\"");
              return 2;
            } else if (rx_start.test(e)) {
              prop = e;
              start("prop", "\"].properties[\"" + e);
              return 2;
            }
          }
          id = "";
          chunk += "\"]";
          start("");
        } else {
          chunk += c;
          id += c;
        }
      },

      // Property name
      prop: function (c, d) {
        if (rx_cont.test(c)) {
          chunk += c;
          prop += c;
        } else if (c === "\\") {
          escape = true;
          if (d === '"') {
            chunk += c;
            prop += c;
          }
        } else {
          bind_prop();
          chunk += "\"]";
          start("", c);
        }
      },

      // Quoted property name (between parentheses)
      propp: function (c, d) {
        if (c === "\\") {
          escape = true;
          if (d === '"') {
            chunk += c;
            prop += c;
          }
        } else if (c === '"') {
          chunk += "\\\"";
          prop += c;
        } else if (c === ")") {
          bind_prop();
          chunk += "\"]";
          start("");
        } else {
          chunk += c;
          prop += c;
        }
      }
    };

    for (var i = 0, n = value.length; i < n; ++i) {
      if (escape) {
        escape = false;
        chunk += value[i];
      } else {
        var p = advance[state](value[i], value[i + 1] || "", value[i + 2] || "");
        if (p > 0) {
          i += p;
        }
      }
    }
    if (chunk) {
      v += chunk;
      if (state === "prop" || state === "propp") {
        v += "\"]";
        bind_prop();
      } else if (state === "id" || state === "idp") {
        v += "\"]";
      }
    }
    Object.defineProperty(bindings, "", { value: { value: v }});
    return bindings;
  }

  // Update the scope of the parent component of node (if any)
  // TODO remove the id when it changes
  function update_scope(node, id) {
    var p = parent_component(node);
    if (p) {
      var scope = Object.getPrototypeOf(p.scope);
      var key = "#" + id;
      if (key in scope) {
        console.error("Id %0 already in scope".fmt(key));
      } else {
        scope[key] = node;
        scope["@" + id] = node;
      }
    }
  }

  function vertex_event(element, scope, Constructor) {
    var target = scope[element.select];
    if (target) {
      var vertices = target.vertices.events[select_level(element.select)];
      if (!vertices.hasOwnProperty(element.type)) {
        vertices[element.type] = scope.$environment
          .add_vertex(new Constructor(scope.$that, element));
      }
      return vertices[element.type];
    }
  }

  function vertex_property(element, scope) {
    var target = scope[element.select];
    if (target) {
      var vertices = target.vertices.property[select_level(element.select)];
      if (vertices.hasOwnProperty(element.name)) {
        vertices[element.name] = scope.$environment.add_vertex(new
            bender.PropertyVertex(scope.$that, element));
      }
      return vertices[element.name];
    }
  }

  function visit_vertices(scope, kind, name, value) {
    var level = scope.$this === scope.$that ? "component" : "instance";
    var v = [scope, value];
    for (var p = scope.$that; p; p = p.prototype) {
      if (name in p.vertices[kind][level]) {
        p.vertices[kind][level][name].values.push(v);
      }
      if (level === "component") {
        if (name in p.vertices[kind].instances) {
          p.vertices[kind].instances[name].values.push(v);
        }
      }
    }
    scope.$environment.visit_edges();
  }

}(this.bender = {}));
