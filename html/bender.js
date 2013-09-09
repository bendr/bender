(function (bender) {
  "use strict";

  /* global flexo, window, console */
  // jshint -W054

  bender.version = "0.8.2";
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Set up tracing, turned on/off with setting bender.TRACE to true or false
  var _trace;
  Object.defineProperty(bender, "TRACE", {
    enumerable: true,
    get: function () { return _trace !== flexo.nop; },
    set: function (p) { _trace = p ? console.log.bind(console) : flexo.nop; }
  });

  bender.TRACE = true;     // show tracing messages
  bender.MAX_VISITS = 10;  // maximum number of visits for a vertex

  var _class = flexo._class;  // kludge for Chrome to display class names
  var foreach = Array.prototype.forEach;
  var unshift = Array.prototype.unshift;


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


  // Create a new environment in a document, or window.document by default.
  var environment = (bender.Environment = function (document) {
    this.scope = { $document: document || window.document, $environment: this };
    this.urls = {};
    this.components = [];
    this.vertices = [];
    this.vortex = this.add_vertex(new bender.Vertex().init());
    this.queue = [];
    this.traverse_graph_bound = this.traverse_graph.bind(this);
  }).prototype;

  // Create a new Bender component
  environment.component = function () {
    return add_component_to_environment(this, new bender.Component(this.scope));
  };

  // Create a new instance for a component and an optional parent instance
  environment.instance = function (component, parent) {
    return add_component_to_environment(this,
        new bender.Instance(component, parent));
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
    var promise = this.urls[url] = new flexo.Promise();
    flexo.ez_xhr(url, { responseType: "document", mimeType: "text/xml" })
      .then(function (response) {
        response_ = response;
        return this.deserialize(response.documentElement, promise);
      }.bind(this), function (reason) {
        promise.reject(reason);
      }).then(function (d) {
        if (d instanceof bender.Component) {
          delete promise.component;
          promise.fulfill(d);
          return d;
        } else {
          promise.reject({ response: response_,
            message: "not a Bender component" });
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
      throw "Deseralization error: expected a node; got: %0".fmt(node);
    }
  };

  // Deserialize then add every child of p in the list of children to the Bender
  // element e, then return e
  environment.deserialize_children = function (e, p) {
    var append = e.child.bind(e);
    return flexo.promise_fold(p.childNodes, function (_, ch) {
      // jshint unused: false
      return flexo.then(this.deserialize(ch), append);
    }, e, this);
  };

  // Deserialize common properties and contents for objects that have a value
  // (property, get, set): handles id, as, value (attribute or text content)
  environment.deserialize_element_with_value = function (object, elem) {
    object.as(elem.getAttribute("as")).id(elem.getAttribute("id"))
      .match(elem.getAttribute("match"));
    // TODO change to $scope; use select for this or that
    var scope = object instanceof bender.Property ?
      "this.scope" : "this.scope.$that.scope";
    if (elem.hasAttribute("value")) {
      set_value_from_string.call(object, elem.getAttribute("value"), true,
          scope);
    } else {
      var t = shallow_text(elem);
      if (/\S/.test(t)) {
        set_value_from_string.call(object, t, false, scope);
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

  // Schedule a new graph traversal when necessary (non-empty queue; no ongoing
  // traversal)
  environment.schedule_traversal = function () {
    if (this.queue.length > 0 &&
        (!this.scheduled || this.scheduled.hasOwnProperty("value"))) {
      this.scheduled = new flexo.Promise();
      this.scheduled.id = Math.random().toString(36).substr(2, 6).toUpperCase();
      _trace("[%0] +++ Will traverse watch graph".fmt(this.scheduled.id));
      flexo.asap(this.traverse_graph_bound);
      return this.scheduled;
    }
  };

  // Visit a vertex by adding it to the queue and scheduling a traversal.
  environment.visit_vertex = function (vertex, value) {
    this.queue.push([vertex, value]);
    this.schedule_traversal();
  };

  environment.schedule_next = function (f) {
    if (this.scheduled && !this.scheduled.resolved) {
      this.scheduled.then(f);
    } else {
      f();
    }
  };

  // Traverse the graph breadth-first, starting from the queued vertices.
  environment.traverse_graph = function () {
    _trace("[%0] >>> Traverse watch graph (vertices in queue: %1)"
        .fmt(this.scheduled.id, this.queue.length));
    // Don’t cache the length of the queue as it grows during the traversal
    for (var visited = [], i = 0; i < this.queue.length; ++i) {
      var q = this.queue[i];
      var vertex = q[0];
      var value = q[1];
      if (vertex.hasOwnProperty("__visited_value")) {
        if (vertex.__visited_value !== value) {
          if (++vertex.__visited_times < bender.MAX_VISITS) {
            this.queue.push([vertex, value]);
          }
        }
      } else {
        vertex.__visited_value = value;
        vertex.__visited_times = 1;
        visited.push(vertex);
        for (var j = 0, n = vertex.outgoing.length; j < n; ++j) {
          var output = vertex.outgoing[j].follow(value);
          if (output) {
            this.queue.push(output);
          }
        }
      }
    }
    visited.forEach(function (vertex) {
      delete vertex.__visited_value;
      delete vertex.__visited_times;
    });
    this.queue = [];
    this.scheduled.fulfill(this.scheduled.id);
    _trace("[%0] <<< Done traversing watch graph".fmt(this.scheduled.id));
  };

  // Add a vertex to the watch graph and return it.
  environment.add_vertex = function (vertex) {
    vertex.index = this.vertices.length;
    vertex.environment = this;
    this.vertices.push(vertex);
    return vertex;
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
    this.init();
    var parent_scope = scope.hasOwnProperty("$environment") ?
      Object.create(scope) : scope;
    this.scope = Object.create(parent_scope, {
      $this: { enumerable: true, writable: true, value: this }
    });
    this.not_ready = true;           // not rendered yet
    this._on = {};                   // on-* attributes
    this.links = [];                 // link nodes
    this.property_definitions = {};  // property nodes
    this.properties = {};            // property values
    this.property_vertices = {};     // property vertices (for reuse)
    this.init_values = {};           // initial property values from attributes
    this.child_components = [];      // all child components
    this.derived = [];               // derived components
    this.instances = [];             // rendered instances
    this.watches = [];               // watch nodes
    this.event_vertices = {};        // event vertices (for reuse)
  }, bender.Element);

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
  // second parameter p (which is a promise) is passed, its component property
  // is set to the newly created component, so that further references can be
  // made before the component is fully deserialized.
  environment.deserialize.component = function (elem, p) {
    var component = this.component();
    if (p) {
      p.component = component;
    }
    foreach.call(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.indexOf("on-") === 0) {
          component.on(attr.localName.substr(3), attr.value);
        } else if (attr.localName === "id") {
          component.id(attr.value);
        } else if (attr.localName !== "href") {
          // TODO use init_values for initialization
          component.init_values[attr.localName] = attr.value;
        }
      } else if (attr.namespaceURI === bender.ns) {
        component.init_values[attr.localName] = attr.value;
      }
    });
    var children = this.deserialize_children(component, elem);
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"));
      var promise = this.urls[url];
      if (promise) {
        if (promise.value) {
          try {
            component.prototype(promise.value);
          } catch (e) {
            return new flexo.Promise().reject(e);
          }
        } else if (promise.component) {
          try {
            component.prototype(promise.component);
            return flexo.promise_each([promise, children]);
          } catch (e) {
            return promise.reject(e);
          }
        } else {
          return flexo.promise_each([promise.then(function (prototype) {
            component.prototype(prototype);
          }), children]);
        }
      } else {
        return flexo.promise_each([
          this.load_component(url).then(function (prototype) {
            component.prototype(prototype);
          }), children]);
      }
    }
    return children;
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

  // Set the view of the component and return the component. If a view is given,
  // it is set as the view. If the first argument is not a view, then the
  // arguments list is interpreted as contents of the view of the component; a
  // new view is created and added if necessary, then all arguments are appended
  // as children of the view.
  component.view = function (view) {
    if (!(view instanceof bender.View)) {
      view = this.scope.$view || new bender.View();
      foreach.call(arguments, view.append_child.bind(view));
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
      foreach.call(arguments, watch.append_child.bind(watch));
    }
    return this.child(watch);
  };

  // Render and initialize the component, returning the promise of a concrete
  // instance.
  component.render_component = function (target, ref) {
    var fragment = target.ownerDocument.createDocumentFragment();
    _trace("[%0] render".fmt(this.index));
    return this.render(fragment).then(function (instance) {
      return flexo.then(instance.init_properties(), function () {
        target.insertBefore(fragment, ref);
        on(instance, "did-render");
        return instance;
      });
    });
  };

  // Render this component to a concrete instance for the given target.
  component.render = function (target, stack) {
    var instance = this.scope.$environment.instance(this,
        stack && stack[stack.i].$this);
    if (stack) {
      instance.parent = stack[stack.i].$this;
      stack[stack.i].$this.children.push(instance);
    }
    return this.render_links(instance, target).then(function () {
      on(instance, "will-render");
      instance.render_properties();
      return instance.render_view(target);
    }).then(function () {
      instance.render_watches();
      return instance;
    });
  };

  // Render all links for the instance, from the further ancestor down to the
  // component instance itself. Return a promise that is fulfilled once all
  // links have been loaded in sequence.
  component.render_links = function (instance, target) {
    var links = [];
    for (var p = instance.scope.$that; p; p = p._prototype) {
      unshift.apply(links, p.links);
    }
    return flexo.promise_fold(links, function (_, link) {
      // jshint unused: false
      return link.render(target);
    });
  };

  // Initialize the component properties after it has been rendered.
  component.init_properties = function () {
    if (this.not_ready) {
      _trace("[%0] init properties".fmt(this.index));
      if (this._prototype) {
        this._prototype.init_properties();
      }
      for (var p in this.property_vertices) {
        var property = this.property_vertices[p].property;
        if (!property.hasOwnProperty("bindings")) {
          if (typeof property._value === "function") {
            var v = property._value.call(this);
            _trace("  * %0 =".fmt(p), v);
            this.properties[p] = v;
          }
        }
      }
      this.child_components.forEach(function (ch) {
        ch.init_properties();
      });
      this.scope.$environment.schedule_next(function () {
        _trace("[%0] ready!".fmt(this.index));
        this.notify("ready");
      }.bind(this));
      delete this.not_ready;
    }
  };

  // Get or set the prototype of the component (must be another component.)
  component.prototype = function (prototype) {
    if (arguments.length > 0) {
      if (prototype instanceof bender.Component) {
        if (this._prototype !== prototype ) {
          this.__visited = true;
          var visited = [this];
          for (var p = prototype; p && !p.__visited; p = p._prototype);
          visited.forEach(function (v) {
            delete v.__visited;
          });
          if (!p) {
            this._prototype = prototype;
            prototype.derived.push(this);
            render_derived_properties(this);
          } else {
            throw "Cycle in prototype chain";
          }
        }
        return this;
      }
    }
    return this._prototype;
  };

  function render_derived_properties(component) {
    for (var p in component._prototype.property_vertices) {
      var vertex = component._prototype.property_vertices[p];
      render_derived_property(component, vertex);
    }
  }

  component.append_child = function (child) {
    if (child instanceof bender.Link) {
      this.links.push(child);
    } else if (child instanceof bender.View) {
      if (this.scope.$view) {
        console.error("Component already has a view");
        return;
      } else {
        // TODO import child components and merge scopes
        this.scope.$view = child;
      }
    } else if (child instanceof bender.Property) {
      if (this.property_definitions.hasOwnProperty(child.name)) {
        console.error("Redefinition of property %0 in component %1"
            .fmt(child.name, this.index));
      } else {
        this.property_definitions[child.name] = child;
        var vertex = render_own_property(this, child);
        render_derived_property_derived(this, vertex);
      }
    } else if (child instanceof bender.Watch) {
      this.watches.push(child);
    } else {
      return;
    }
    this.add_descendants(child);
    return element.append_child.call(this, child);
  };

  // Component children of the view are added as child components with a
  // parent_component link; scopes are merged.
  component.add_child_component = function (child) {
    child.parent_component = this;
    this.child_components.push(child);
    var scope = Object.getPrototypeOf(this.scope);
    var old_scope = Object.getPrototypeOf(child.scope);
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
        } else {
          console.warn("Id %0 already defined in scope".fmt(e._id));
        }
      }
      if (e instanceof bender.Component && !e.parent_component) {
        this.add_child_component(e);
      }
      unshift.apply(queue, e.children);
    }
  };

  // Send an event notification for this component only.
  component.notify = function (type, value) {
    var vertex = this.event_vertices[type];
    if (vertex) {
      vertex.visit(value);
    }
  };


  // Concrete instance getting rendered for a given component and a parent
  // instance (if any)
  var instance = (bender.Instance = function (component, parent) {
    component.instances.push(this);
    if (component._id) {
      // TODO improve this part
      Object.getPrototypeOf(get_concrete_scope(component, parent))
        ["@" + component._id] = this;
    }
    this.scopes = [];
    for (var p = component; p; p = p._prototype) {
      var scope = get_concrete_scope(p, parent);
      this.scopes.push(Object.create(scope, {
        $that: { enumerable: true, value: p },
        $this: { enumerable: true, value: this }
      }));
    }
    this.scope = this.scopes[0];
    this.children = [];
    this.properties = {};
    this.property_vertices = {};
    this.event_vertices = {};
    this.bindings = [];
  }).prototype;

  // Send an event notification for this concrete instance only.
  instance.notify = component.notify;

  // Render the properties of this instance from the properties of the component
  // that it is an instance of
  instance.render_properties = function () {
    _trace("[%0] (%1) render properties"
        .fmt(this.scope.$that.index, this.index));
    for (var p in this.scope.$that.property_vertices) {
      _trace("  * render property %0".fmt(p));
      render_derived_property(this, this.scope.$that.property_vertices[p]);
    }
  };

  // Render the view and return a promise (if there are no views in the stack,
  // immediately fulfill that promise.)
  instance.render_view = function (target) {
    _trace("[%0] (%1) render view; scopes: %2"
        .fmt(this.scope.$that.index, this.index, this.scopes.map(function (s) {
          return s.$that.index;
        }).join(", ")));
    var stack = [];
    stack.i = 0;
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
    for (var n = stack.length; stack.i < n && !stack[stack.i].$that.scope.$view;
        ++stack.i);
    if (stack.i < n && stack[stack.i].$that.scope.$view) {
      console.log("  * render view %0".fmt(stack[stack.i].$that.index));
      return stack[stack.i].$that.scope.$view.render(target, stack);
    }
    return new flexo.Promise().fulfill();
  };

  instance.render_watches = function () {
    _trace("[%0] (%1) render watches".fmt(this.scope.$that.index, this.index));
    this.scopes.forEach(function (scope) {
      scope.$that.watches.forEach(function (watch) {
        watch.render(scope);
      });
    });
    return this;
  };

  instance.init_properties = function () {
    this.scope.$that.init_properties();
    _trace("[%0] (%1) init properties".fmt(this.scope.$that.index, this.index));
    on(this, "will-init");
    this.scope.$environment.schedule_next(function () {
      _trace("[%0] (%1) ready!".fmt(this.scope.$that.index, this.index));
      this.notify("ready");
    }.bind(this));
    on(this, "did-init");
  };

  // Render watches from the chain
  component.render_watches = function (chain) {
    chain.forEach(function (instance) {
      instance.watches = instance.scope.$that.watches.slice();
      // Render property bindings
      instance.property_nodes.forEach(function (prop) {
        if (prop.bindings) {
          var set = new bender.SetProperty(prop.name, "$this");
          set_value_from_string.call(set, prop.bindings[""].value, true);
          var watch = new bender.Watch().child(set);
          Object.keys(prop.bindings).forEach(function (id) {
            if (id) {
              Object.keys(prop.bindings[id]).forEach(function (prop) {
                watch.append_child(new bender.GetProperty(prop, id));
              });
            }
          });
          instance.watches.push(watch);
        }
      });
      // Render string bindings
      instance.bindings.forEach(function (bindings) {
        var watch = new bender.Watch();
        if (bindings[""].hasOwnProperty("attr")) {
          watch.append_child(new bender.SetDOMAttribute(bindings[""].ns,
              bindings[""].attr, bindings[""].target)
            .value(bindings[""].value));
        } else {
          watch.append_child(new bender.SetDOMProperty("textContent",
              bindings[""].target).value(bindings[""].value));
        }
        Object.keys(bindings).forEach(function (id) {
          if (id) {
            Object.keys(bindings[id]).forEach(function (prop) {
              watch.append_child(new bender.GetProperty(prop, id));
            });
          }
        });
        instance.watches.push(watch);
      });
    });
    flexo.hcaErof(chain, function (instance) {
      if (instance.watches.length > 0) {
      }
      instance.watches.forEach(function (watch) {
        watch.render(instance);
      });
      delete instance.watches;
      instance.bindings = [];
      on(instance, "did-render");
    });
    return chain[0];
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

  // Render links according to their rel attribute. If a link requires delaying
  // the rest of the rendering, return a promise then fulfill it with a value to
  // resume rendering (see script rendering below.)
  link.render = function (target) {
    if (this.environment.urls[this.href]) {
      return this.environment.urls[this.href];
    }
    this.environment.urls[this.href] = this;
    var render = link.render[this.rel];
    if (typeof render === "function") {
      return render.call(this, target);
    }
    console.warn("Cannot render “%0” link".fmt(this.rel));
    return this;
  };

  // Scripts are handled for HTML only by default. Override this method to
  // handle other types of documents.
  link.render.script = function (target) {
    var ns = target.ownerDocument.documentElement.namespaceURI;
    if (ns === flexo.ns.html) {
      return flexo.promise_script(this.href, target.ownerDocument.head)
        .then(function (script) {
          this.rendered = script;
          return this;
        }.bind(this));
    }
    console.warn("Cannot render script link for namespace %0".fmt(ns));
    return this;
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  link.render.stylesheet = function (target) {
    var document = target.ownerDocument;
    var ns = document.documentElement.namespaceURI;
    if (ns === flexo.ns.html) {
      var link = target.ownerDocument.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      document.head.appendChild(link);
      this.rendered = link;
    } else {
      console.warn("Cannot render stylesheet link for namespace %0".fmt(ns));
    }
    return this;
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
  // stack of views further down for the <content> element. Return a promise.
  view.render = function (target, stack) {
    return flexo.promise_fold(this.children, function (_, ch) {
      // jshint unused: false
      return ch.render(target, stack);
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
      return flexo.promise_each(indices, function (i) {
        var j = stack.i;
        stack.i = i;
        return stack[i].$that.scope.$view.render(target, stack).then(function () {
          stack.i = j;
        });
      });
    }
    return view.render.call(this, target, stack);
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
      return target;
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
    return target.appendChild(node);
  };

  var dom_element = _class(bender.DOMElement = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = flexo.safe_string(name);
    this.attrs = {};
  }, bender.Element);

  dom_element.attr = function (ns, name, value) {
    if (arguments.length > 2) {
      if (!this.attrs.hasOwnProperty(ns)) {
        this.attrs[ns] = {};
      }
      this.attrs[ns][name] = value;
      return this;
    }
    return this.attrs[ns] && this.attrs[ns][name];
  };

  dom_element.append_child = view.append_child;

  dom_element.render = function (target, stack) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        var bindings = bindings_string(this.attrs[ns][a]);
        if (typeof bindings === "string") {
          elem.setAttributeNS(ns, a, bindings);
        } else {
          bindings[""].target = elem;
          bindings[""].ns = ns;
          bindings[""].attr = a;
          stack[stack.i].bindings.push(bindings);
        }
      }
    }
    this.add_id_to_scope(elem, stack, true);
    return view.render.call(this, elem, stack).then(function () {
      target.appendChild(elem);
    });
  };

  var dom_text = _class(bender.DOMTextNode = function () {
    this.init();
    this.instances = [];
  }, bender.Element);

  dom_text.text = function (text) {
    if (arguments.length > 0) {
      text = flexo.safe_string(text);
      if (text !== this._text) {
        this._text = text;
        this.instances.forEach(function (d) {
          d.textContent = text;
        });
      }
      return this;
    }
    return this._text || "";
  };

  dom_text.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode("");
    var bindings = bindings_string(this._text);
    if (typeof bindings === "string") {
      node.textContent = bindings;
    } else {
      bindings[""].target = node;
      stack[stack.i].bindings.push(bindings);
    }
    target.appendChild(node);
    this.instances.push(node);
    return node;
  };

  _class(bender.Property = function (name) {
    this.init();
    this.name = flexo.safe_string(name);
  }, bender.Element);

  flexo._accessor(bender.Property, "as", normalize_as);
  flexo._accessor(bender.Property, "select", "$this");
  flexo._accessor(bender.Property, "match");
  flexo._accessor(bender.Property, "value");

  environment.deserialize.property = function (elem) {
    return this.deserialize_element_with_value(new
        bender.Property(elem.getAttribute("name"))
        .select(elem.getAttribute("select")), elem);
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

  // Render the watch by rendering a vertex for the watch, then a vertex for
  // each of the get elements with an edge to the watch vertex, then an edge
  // from the watch vertex for all set elements for a concrete component
  watch.render = function (scope) {
    _trace("  watch for %0 in scope %1"
        .fmt(scope.$this.index, scope.$that.index));
    var watch_vertex = scope.$environment.add_vertex(new
        bender.WatchVertex(this, scope.$this));
    this.gets.forEach(function (get) {
      var vertex = get.render(scope);
      if (vertex) {
        vertex.add_outgoing(new
          bender.WatchEdge(get, scope.$this, watch_vertex));
      }
    });
    this.sets.forEach(function (set) {
      var edge = set.render(scope);
      if (Array.isArray(edge)) {
        edge.forEach(function (e) {
          watch_vertex.add_outgoing(e);
        });
      } else if (edge) {
        watch_vertex.add_outgoing(edge);
      }
    });
  };

  _class(bender.GetSet = function () {}, bender.Element);
  flexo._accessor(bender.GetSet, "as", normalize_as);
  flexo._accessor(bender.GetSet, "match");
  flexo._accessor(bender.GetSet, "value");

  _class(bender.Get = function () {}, bender.GetSet);

  var get_dom_event = _class(bender.GetDOMEvent = function (type, select) {
    this.init();
    this.type = type;
    this.select = select;
  }, bender.Get);

  flexo._accessor(bender.Get, "stop_propagation");
  flexo._accessor(bender.Get, "prevent_default");

  get_dom_event.render = function (scope) {
    var target = scope[this.select];
    if (target) {
      return scope.$environment.add_vertex(new
          bender.DOMEventVertex(this, target));
    }
  };

  var get_event = _class(bender.GetEvent = function (type, select) {
    this.init();
    this.type = type;
    this.select = select;
  }, bender.Get);

  get_event.render = function (scope) {
    return get_event_vertex(scope[this.select], this);
  };

  var get_property = _class(bender.GetProperty = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Get);

  get_property.render = function (scope) {
    var target = scope[this.select];
    if (target) {
      return target.property_vertices[this.name];
    }
  };

  _class(bender.GetAttribute = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Get);

  environment.deserialize.get = function (elem) {
    var get;
    var select = elem.getAttribute("select") || "$this";
    if (elem.hasAttribute("dom-event")) {
      get = new bender.GetDOMEvent(elem.getAttribute("dom-event"), select)
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
    var target = scope[this.select];
    if (target) {
      return new bender.Edge().init(this, target, scope.$environment.vortex);
    }
  };

  _class(bender.SetDOMEvent = function (type, select) {
    this.init();
    this.type = type;
    this.select = select;
  }, bender.Set);

  var set_event = _class(bender.SetEvent = function (type, select) {
    this.init();
    this.type = type;
    this.select = select;
  }, bender.Set);

  set_event.render = function (scope) {
    var edges = [];
    for (var target = scope[this.select]; target; target = target._prototype) {
      var vertex = get_event_vertex(target, this);
      if (vertex) {
        edges.push(new bender.EventEdge(this, scope.$this, vertex));
      }
    }
    return edges;
  };

  var set_dom_property = _class(bender.SetDOMProperty = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Set);

  set_dom_property.render = function (scope) {
    var target = typeof this.select === "string" ?
      scope[this.select] : this.select;
    if (target) {
      var edge = new bender.DOMPropertyEdge(this, scope.$this, target);
      if (this.match) {
        edge.match = this.match;
      }
      if (this.value) {
        edge.value = this.value;
      }
      return edge;
    }
  };

  var set_property = _class(bender.SetProperty = function (name, select) {
    this.init();
    this.name = name;
    this.select = select;
  }, bender.Set);

  set_property.render = function (scope) {
    var target = typeof this.select === "string" ?
      scope[this.select] : this.select;
    if (target) {
      return new bender.PropertyEdge(this, scope.$this, target);
    }
  };

  var set_dom_attribute =
    _class(bender.SetDOMAttribute = function (ns, name, select) {
    this.init();
    this.ns = ns;
    this.name = name;
    this.select = select;
  }, bender.Set);

  set_dom_attribute.render = function (scope) {
    var target = typeof this.select === "string" ?
      scope[this.select] : this.select;
    if (target) {
      var edge = new bender.DOMAttributeEdge(this, scope.$this, target);
      return edge;
    }
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
    return this;
  };

  vertex.add_incoming = function (edge) {
    edge.dest = this;
    this.incoming.push(edge);
  };

  vertex.add_outgoing = function (edge) {
    edge.source = this;
    this.outgoing.push(edge);
  };

  vertex.visit = function (value) {
    this.environment.visit_vertex(this, value);
  };


  // Watch vertex corresponding to a watch element, gathers the inputs and
  // outputs of the watch
  _class(bender.WatchVertex = function (watch, component) {
    this.init();
    this.watch = watch;
    this.component = component;
  }, bender.Vertex);


  // DOM event vertex
  var dom_event_vertex = _class(bender.DOMEventVertex = function (get, target) {
    this.init();
    this.get = get;
    this.target = target;
    target.addEventListener(get.type, this, false);
  }, bender.Vertex);

  // Event handler for DOM events causes a visit of the vertex. Although the
  // visit is delayed, prevetDefault() and stopPropagation() need to be called
  // immediately.
  dom_event_vertex.handleEvent = function (e) {
    if (this.get.prevent_default) {
      e.preventDefault();
    }
    if (this.get.stop_propagation) {
      e.stopPropagation();
    }
    this.visit(e);
  };


  // TODO Event vertex for a <get event="..."> element
  _class(bender.EventVertex = function (target, get) {
    this.init();
    this.get = get;
    this.target = target;
  }, bender.Vertex);


  // Create a new property vertex for a component (or instance) and property
  // definition pair.
  _class(bender.PropertyVertex = function (component, property) {
    this.init();
    this.component = component;
    this.property = property;
  }, bender.Vertex);


  // TODO Attribute vertex
  _class(bender.AttributeVertex = function (component, attribute) {
    this.init(component);
    this.attribute = attribute;
  }, bender.Vertex);


  // Simple edge between two vertices (source and dest)
  var edge = (bender.Edge = function () {}).prototype;

  edge.init = function (dest) {
    dest.add_incoming(this);
    return this;
  };

  edge.follow = function (input) {
    return [this.dest, input];
  };

  // Remove an edge from its source vertex’s outgoing list and its destination
  // vertex’s incoming list.
  edge.remove = function () {
    flexo.remove_from_array(this.source.outgoing, this);
    flexo.remove_from_array(this.dest.incoming, this);
    this.source = null;
    this.dest = null;
  };


  // Edges that are tied to an element (e.g., watch, get, set) and a component
  var element_edge = _class(bender.ElementEdge = function () {}, bender.Edge);

  element_edge.init = function (element, component, dest) {
    edge.init.call(this, dest);
    this.element = element;
    this.component = component;
  };

  element_edge.follow = function (input) {
    var value = this.element.value();
    try {
      return [this.dest, value ? value.call(this.component, input) : input];
    } catch (e) {
    }
  };


  // Edges to a watch vertex
  _class(bender.WatchEdge = function (get, component, dest) {
    this.init(get, component, dest);
  }, bender.ElementEdge);


  _class(bender.EventEdge = function (set, component, dest) {
    this.init(set, component, dest);
  }, bender.ElementEdge);


  // A DOM property edge is associated to a set element and always goes to the
  // vortex
  _class(bender.DOMPropertyEdge = function (set, component, target) {
    this.init(set, component, component.scope.$environment.vortex);
    this.target = target;
  }, bender.ElementEdge);

  bender.DOMPropertyEdge.prototype.follow = function (input) {
    try {
      var value = this.element.value() ?
        this.element.value().call(this.component, input) : input;
      this.target[this.element.name] = value;
      return [this.dest, value];
    } catch (e) {
    }
  };


  // Set a Bender property
  _class(bender.PropertyEdge = function (set, component, target) {
    var dest = target.property_vertices[set.name];
    if (!dest) {
      console.warn("No property %0 for component %1"
        .fmt(set.name, target.index));
    }
    this.init(set, component, dest);
    this.target = target;
  }, bender.ElementEdge);

  bender.PropertyEdge.prototype.follow = function (input) {
    try {
      var value = this.element.value() ?
        this.element.value().call(this.component, input) : input;
      this.target.properties[this.element.name] = value;
      return [this.dest, value];
    } catch (e) {
    }
  };


  // Set a DOM attribute
  _class(bender.DOMAttributeEdge = function (set, component, target) {
    this.init(set, component, component.scope.$environment.vortex);
    this.target = target;
  }, bender.ElementEdge);

  bender.DOMAttributeEdge.prototype.follow = function (input) {
    try {
      var value = this.set.value() ?
        this.set.value().call(this.component, input) : input;
      this.target.setAttributeNS(this.set.ns, this.set.name, value);
      return [this.dest, value];
    } catch (e) {
    }
  };



  // Add a component or instance to the environment
  function add_component_to_environment(environment, component) {
    component.index = environment.components.length;
    environment.components.push(component);
    return component;
  }

  // Regular expressions to match property bindings, broken into smaller pieces
  // for legibility
  var RX_ID =
    "(?:[$A-Z_a-z\x80-\uffff]|\\\\.)(?:[$0-9A-Z_a-z\x80-\uffff]|\\\\.)*";
  var RX_PAREN = "\\(((?:[^\\\\\\)]|\\\\.)*)\\)";
  var RX_CONTEXT = "(?:([#@])(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_TICK = "(?:`(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_PROP = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_CONTEXT, RX_TICK));
  var RX_PROP_G = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_CONTEXT, RX_TICK), "g");

  // Identify property bindings for a dynamic property value string. When there
  // are none, return the string unchanged; otherwise, return the dictionary of
  // bindings (indexed by id, then property); bindings[""] will be the new value
  // for the set element of the watch to create.
  function bindings_dynamic(value, scope) {
    var bindings = {};
    var r = function (_, b, sigil, id, id_p, prop, prop_p) {
      // jshint unused: false
      var i = (sigil || "") + (id || id_p || "$this").replace(/\\(.)/g, "$1");
      if (!bindings.hasOwnProperty(i)) {
        bindings[i] = {};
      }
      var p = (prop || prop_p).replace(/\\(.)/g, "$1");
      bindings[i][p] = true;
      return "%0%1[%2].properties[%3]"
        .fmt(b, id || id_p ? scope : "this.scope", flexo.quote(i),
            flexo.quote(p));
    };
    var v = value.replace(RX_PROP_G, r).replace(/\\(.)/g, "$1");
    if (Object.keys(bindings).length === 0) {
      return value;
    }
    bindings[""] = { value: v };
    return bindings;
  }

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
      strings.push("flexo.safe_string(this.scope[%0].properties[%1])"
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
      bindings[""] = { value: new Function("$in", f) };
    } catch (e) {
      console.warn("Could not parse “%0” as Javascript".fmt(f));
      bindings[""] = { value: flexo.id };
    }
    return bindings;
  }

  // Get the concrete scope for an instance from its parent instance, i.e. the
  // scope in the parent instance pointing to the parent component. If either
  // instance or component has no parent, there is, simply create a new scope
  // from the abstract scope, that is the prototype of the component scope.
  function get_concrete_scope(component, parent) {
    if (!parent || !component.parent_component) {
      return Object.create(Object.getPrototypeOf(component.scope));
    }
    return flexo.find_first(parent.scopes, function (scope) {
      return scope.$that === component.parent_component;
    });
  }

  // Get the event vertex for the component/type pair, returning the existing
  // one if it was already created, or creating a new one if not. Return nothing
  // if the component is not found, or not really a component or instance.
  function get_event_vertex(component, get) {
    if (component && component.event_vertices) {
      if (!component.event_vertices.hasOwnProperty(get.type)) {
        component.event_vertices[get.type] = component.scope.$environment
          .add_vertex(new bender.EventVertex(component, get));
      }
      return component.event_vertices[get.type];
    }
  }

  // Get the property vertex for the component/property pair, returning the
  // existing one if it was already created, or creating a new one if not.
  // Return nothing if the component is not found, or not really a component or
  // instance.
  function get_property_vertex(component, property) {
    if (component && component.property_vertices) {
      if (!component.property_vertices.hasOwnProperty(property.name)) {
        component.property_vertices[property.name] =
          component.scope.$environment.add_vertex(new
              bender.PropertyVertex(component, property));
      }
      return component.property_vertices[property.name];
    }
  }

  // Normalize the `as` property of an element so that it matches a known value.
  // Set to “dynamic” by default.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as === "string" || as === "number" || as === "boolean" ||
      as === "json" ? as : "dynamic";
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
      prototype._on[type].forEach(function (handler) {
        handler(component, type);
      });
    }
  }

  // Find the closest ancestor of node (including self) that is a component and
  // return it if found
  function parent_component(node) {
    for (; node && !(node instanceof bender.Component); node = node.parent);
    if (node) {
      return node;
    }
  }

  // Render a property from a component for an instance or a derived component.
  // A new property vertex and Javascript property is created with an edge from
  // the prototype vertex to the new vertex so that changes to the original
  // property are propagated. When the derived property gets set, the edge is
  // removed.
  function render_derived_property(derived, protovertex) {
    var property = protovertex.property;
    if (!derived.properties.hasOwnProperty(property.name)) {
      var vertex = derived.property_vertices[property.name] =
        get_property_vertex(derived, property);
      vertex.protoedge =
        protovertex.add_outgoing(new bender.Edge().init(vertex));
      Object.defineProperty(derived.properties, property.name, {
        enumerable: true,
        configurable: true,
        get: function () {
          return protovertex.value;
        },
        set: function (value) {
          var v = render_own_property(derived, property, value);
          v.value = value;
          v.visit(value);
        }
      });
    }
  }

  // Call render_derived_property for derived components and instances
  function render_derived_property_derived(component, vertex) {
    var i, n;
    for (i = 0, n = component.derived.length; i < n; ++i) {
      render_derived_property(component.derived[i], vertex);
      render_derived_property_derived(component.derived[i], vertex);
    }
    for (i = 0, n = component.instances.length; i < n; ++i) {
      render_derived_property(component.instances[i], vertex);
    }
  }

  // Render a component (or an instance)’s own property, i.e., a property
  // unconnected from its prototype or component. There may already be a vertex
  // if it is a derived property, in which case the corresponding incoming edge
  // is removed. A Javascript property is also added to the component’s
  // properties property.
  // Component properties are rendered as soon as the property is defined;
  // instance properties are rendered when the instance property is first set.
  function render_own_property(component, property) {
    var vertex = get_property_vertex(component, property);
    if (vertex.protoedge) {
      vertex.protoedge.remove();
      delete vertex.protoedge;
    }
    Object.defineProperty(component.properties, property.name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return vertex.value;
      },
      set: function (value) {
        if (value !== vertex.value) {
          vertex.value = value;
          vertex.visit(value);
        }
      }
    });
    return vertex;
  }

  // Set a default value depending on the as attribute
  function set_default_value() {
    // jshint validthis:true
    this._value = flexo.funcify({
      boolean: false,
      number: 0,
      string: "",
      dynamic: flexo.id
    }[this.as()]);
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

  // Set the value of an object that has a value/as pair of attributes. Only for
  // deserialized values.
  function set_value_from_string(value, needs_return, scope) {
    // jshint validthis:true
    var as = this.as();
    if (as === "boolean") {
      this._value = flexo.is_true(value);
    } else if (as === "number") {
      this._value = flexo.to_number(value);
    } else {
      if (as === "json") {
        try {
          this._value = JSON.parse(flexo.safe_string(value));
        } catch (e) {
          console.warn("Could not parse “%0” as JSON".fmt(value));
          this._value = undefined;
        }
      } else if (as === "dynamic") {
        var bindings = bindings_dynamic(flexo.safe_string(value), scope);
        if (typeof bindings === "object") {
          this.bindings = bindings;
          value = bindings[""].value;
        }
        if (needs_return) {
          value = "return " + value;
        }
        try {
          this._value = new Function("$in", value);
        } catch (e) {
          console.warn("Could not parse “%0” as Javascript".fmt(value));
          this._value = flexo.id;
        }
      } else {
        // this._as === "string"
        // TODO string bindings
        this._value = flexo.safe_string(value);
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

  // Update the scope of the parent component of node (if any)
  // TODO remove the id when it changes
  function update_scope(node, id) {
    var p = parent_component(node);
    if (p) {
      var scope = Object.getPrototypeOf(p.scope);
      var h = "#" + id;
      if (h in scope) {
        console.error("Id %0 already in scope".fmt(h));
      } else {
        scope[h] = node;
      }
    }
  }

}(this.bender = {}));
