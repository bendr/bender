(function (bender) {
  "use strict";

  bender.version = "0.8.2";
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Load a component and return a promise. The defaults object should contain
  // the defaults, including a href property for the URL of the component to
  // load; alternatively, a URL as string may be provided. If no environment
  // parameter is passed, a new one is created for the current document.
  bender.load_component = function (defaults, env) {
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
      { href: defaults });
    if (!args.href) {
      return new flexo.Promise().reject("No href argument for component.");
    }
    if (!(env instanceof bender.Environment)) {
      env = new bender.Environment;
    }
    return env.load_component(
      flexo.absolute_uri(env.document.baseURI, args.href)
    );
  };

  // Create a new environment in a document, or window.document by default.
  bender.Environment = function (document) {
    this.document = document || window.document;
    this.scope = { $document: this.document, $environment: this };
    this.urls = {};
    this.components = [];
    this.vertices = [];
    this.vortex = this.add_vertex(new bender.Vortex().init());
    this.queue = [];
    this.traverse_graph_bound = this.traverse_graph.bind(this);
  };

  // Create a new Bender component
  bender.Environment.prototype.component = function () {
    var component = new bender.Component(this.scope);
    component.index = this.components.length;
    this.components.push(this);
    return component;
  };

  // Load a component from an URL in the environment and return a promise which
  // is fulfilled once the component has been loaded and deserialized (which may
  // lead to load additional components, for its prototype as well as its
  // children.) Once the component is loaded and deserialization starts, store
  // the incomplete component in the promise so that it can already be referred
  // to (e.g., to check for cycles in the prototype chain.)
  bender.Environment.prototype.load_component = function (url) {
    url = flexo.normalize_uri(url);
    if (this.urls[url]) {
      return this.urls[url];
    }
    var response_;
    var promise = this.urls[url] = new flexo.Promise;
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
  bender.Environment.prototype.deserialize = function (node, promise) {
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node, promise);
          } else {
            console.warn("Unknow element in Bender namespace: %0"
                .fmt(node.localName));
          }
        } else {
          return this.deserialize_foreign(node);
        }
      } else if (node.nodeType == window.Node.TEXT_NODE ||
          node.nodeType == window.Node.CDATA_SECTION_NODE) {
        return new bender.DOMTextNode(node.textContent);
      }
    } else {
      throw "Deseralization error: expected a node; got: %0".fmt(node);
    }
  };

  // Deserialize then add every child in the list of children to the Bender
  // element e, then return e
  bender.Environment.prototype.deserialize_children = function (e, children) {
    var append = e.append_child.bind(e);
    return flexo.promise_each(children, function (child) {
      flexo.then(this.deserialize(child), append);
    }, this, e);
  }

  // Deserialize a foreign element and its contents (attribute and children),
  // creating a generic DOM element object.
  bender.Environment.prototype.deserialize_foreign = function (elem) {
    var e = new bender.DOMElement(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns == "" && attr.localName == "id") {
        e.id(attr.value);
      } else {
        if (!e.attrs.hasOwnProperty(ns)) {
          e.attrs[ns] = {};
        }
        e.attrs[ns][attr.localName] = attr.value;
      }
    }
    return this.deserialize_children(e, elem.childNodes);
  };

  bender.Environment.prototype.visit_vertex = function (vertex, value) {
    if (!this.scheduled) {
      this.scheduled = true;
      flexo.asap(this.traverse_graph_bound);
    }
    this.queue.push([vertex, value]);
  };

  bender.Environment.prototype.traverse_graph = function () {
    var queue = this.queue.slice();
    this.queue = [];
    this.scheduled = false;
    for (var visited = [], i = 0; i < queue.length; ++i) {
      var q = queue[i];
      var vertex = q[0];
      var value = q[1];
      if (vertex.hasOwnProperty("__visited_value")) {
        if (vertex.__visited_value !== value) {
          this.visit_vertex(vertex, value);
        }
      } else {
        vertex.__visited_value = value;
        visited.push(vertex);
        vertex.outgoing.forEach(function (edge) {
          var output = edge.follow(value);
          if (output) {
            queue.push(output);
          }
        }, this);
      }
    }
    visited.forEach(function (vertex) {
      delete vertex.__visited_value;
    });
  };

  // Add a vertex to the watch graph and return it. If a matching vertex was
  // found, just return the previous vertex.
  bender.Environment.prototype.add_vertex = function (v) {
    var v_ = flexo.find_first(this.vertices, function (w) {
      return v.match_vertex(w);
    });
    if (v_) {
      return v_;
    }
    v.index = this.vertices.length;
    v.environment = this;
    this.vertices.push(v);
    return v;
  };

  // Base for Bender content elements (except Link)
  bender.Element = function () {};

  bender.Element.prototype.init = function () {
    this.children = [];
    this.enabled = true;
    this._id = "";
  };

  bender.Element.prototype.id = function (id) {
    if (typeof id == "string") {
      if (id != this._id) {
        this._id = id;
        update_scope(this, id);
      }
      return this;
    }
    return this._id;
  };

  bender.Element.prototype.render_id = function (node, stack) {
    if (this._id) {
      stack[stack.i].scope["@" + this._id] = node;
    }
    if (!stack[stack.i].scope.$first) {
      stack[stack.i].scope.$first = node;
    }
  };

  bender.Element.prototype.append_child = function (child) {
    if (typeof child == "object") {
      this.children.push(child);
      child.parent = this;
      return child;
    }
  };

  bender.Element.prototype.child = function (child) {
    this.append_child(child);
    return this;
  };

  bender.Element.prototype.remove_children = function () {
    this.children.forEach(function (ch) {
      delete ch.parent;
    });
    this.children = [];
  };

  // Insert the list of children at the given index (may be negative to start
  // from the end; e.g., -1 to append)
  bender.Element.prototype.insert_children = function (children, index) {
    if (index == null) {
      index = 0;
    } else if (index < 0) {
      index += this.children.length + 1;
    }
    for (var i = children.length - 1; i >= 0; --i) {
      children[i].parent = this;
      this.children.splice(index, 0, children[i]);
    }
    for (var p = this; p && typeof p.inserted_children != "function";
        p = p.parent);
    if (p && typeof p.inserted_children == "function") {
      p.inserted_children(this, index, children.length);
    }
  };

  // Create a new component in a scope
  bender.Component = function (scope) {
    this.init();
    var parent_scope = scope.hasOwnProperty("$environment") ?
      Object.create(scope) : scope;
    this.scope = Object.create(parent_scope, {
      $this: { enumerable: true, writable: true, value: this }
    });
    this.on = {};                 // on-* attributes
    this.own_properties = {};     // property nodes
    this.links = [];              // link nodes
    this.watches = [];            // watch nodes
    this.child_components = [];   // all child components (in views/properties)
    this.property_vertices = {};  // property vertices for each property
    this.properties = {};         // property values (with associated vertices)
    this.derived = [];            // derived components
    this.instances = [];          // rendered instances
  };

  bender.Component.prototype = new bender.Element;

  var foreach = Array.prototype.forEach;

  // Deserialize a component from an element. A component is created and, if the
  // second parameter p (which is a promise) is passed, its component property
  // is set to the newly created component, so that further references can be
  // made before the component is fully deserialized.
  bender.Environment.prototype.deserialize.component = function (elem, p) {
    var component = this.component();
    if (p) {
      p.component = component;
    }
    foreach.call(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.substr(0, 3) == "on-") {
          component.on[attr.localName.substr(3)] = attr.value;
        } else if (attr.localName != "href") {
          // set property values
        }
      } else if (attr.namespaceURI == bender.ns) {
        // set property values
      }
    });
    var children = this.deserialize_children(component, elem.childNodes);
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"));
      var promise = this.urls[url];
      if (promise) {
        if (promise.value) {
          try {
            component.extends(promise.value);
          } catch (e) {
            return new flexo.Promise.reject(e);
          }
        } else if (promise.component) {
          try {
            component.extends(promise.component);
            return flexo.promise_each([promise, children]);
          } catch (e) {
            return promise.reject(e);
          }
        } else {
          return flexo.promise_each([promise.then(function (prototype) {
            component.extends(prototype);
          }), children]);
        }
      } else {
        return flexo.promise_each([
          this.load_component(url).then(function (prototype) {
            component.extends(prototype);
          }), children]);
      }
    }
    return children;
  };

  // Append a new link and return the component for easy chaining.
  bender.Component.prototype.link = function (rel, href) {
    this.append_child(new bender.Link(this.scope.$environment, rel, href));
    return this;
  };

  // Create a new property with the given name and value (the value is set
  // directly and not interpreted in any way)
  bender.Component.prototype.property = function (name, value) {
    var property = new bender.Property(name);
    property.as = "";
    property.value = value;
    this.append_child(property);
    return this;
  };

  // Set the view of the component and return the component. If a view is given,
  // it is set as the view. If the first argument is not a view, then the
  // arguments list is interpreted as contents of the view of the component; a
  // new view is created and added if necessary, then all arguments are appended
  // as children of the view.
  bender.Component.prototype.view = function (view) {
    if (!(view instanceof bender.View)) {
      view = this.scope.$view || new bender.View;
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
  bender.Component.prototype.watch = function (watch) {
    if (!(watch instanceof bender.Watch)) {
      watch = new bender.Watch;
      foreach.call(arguments, watch.append_child.bind(watch));
    }
    this.append_child(watch);
    return this;
  };

  // Render and initialize the component, returning the promise of a concrete
  // instance.
  bender.Component.prototype.render_component = function (target, ref) {
    var fragment = target.ownerDocument.createDocumentFragment();
    return this.render(fragment).then(function (instance) {
      instance.component.initialize(instance);
      target.insertBefore(fragment, ref);
      return instance;
    });
  };

  // Render this component to a concrete instance for the given target
  bender.Component.prototype.render = function (target, stack) {
    for (var chain = [], p = this; p; p = p._prototype) {
      var r = new bender.ConcreteInstance(p);
      if (chain.length > 0) {
        chain[chain.length - 1]._prototype = r;
      }
      chain.push(r);
    }
    chain[0].__chain = chain;
    if (stack) {
      chain[0].parent_component = stack[stack.i];
      stack[stack.i].child_components.push(chain[0]);
    }
    console.log("[%0] Render links".fmt(this.index));
    return this.render_links(chain, target).then(function () {
      console.log("[%0] Render properties".fmt(this.index));
      this.render_properties(chain);
      console.log("[%0] Render view".fmt(this.index));
      return this.render_view(chain, target).then(function () {
        console.log("[%0] Render watches; done".fmt(this.index));
        return this.render_watches(chain);
      }.bind(this));
    }.bind(this));
  };

  var push = Array.prototype.push;

  // Render all links for the chain, from the further ancestor down to the
  // component instance itself. Return a promise that is fulfilled once all
  // links have been loaded in sequence.
  bender.Component.prototype.render_links = function (chain, target) {
    var promises = [];
    flexo.hcaErof(chain, function (instance) {
      push.apply(promises, instance.component.links.map(function (link) {
        return link.render(target);
      }));
    });
    return new flexo.Seq(promises);
  };

  // Render all properties for the chain, from the furthest ancestor down to the
  // component instance itself.
  bender.Component.prototype.render_properties = function (chain) {
    flexo.hcaErof(chain, function (instance) {
      on(instance, "will-render");
      for (var p in instance.component.properties) {
        if (p in instance.component.own_properties) {
          render_derived_property(instance,
            instance.component.own_properties[p]);
        } else {
          var pv = instance._prototype.property_vertices[p];
          var v = render_derived_property(instance, pv.property, pv);
          v.protovertices
            .push(instance._prototype.component.property_vertices[p]);
          push.apply(v.protovertices, pv.protovertices);
        }
      }
    });
  };

  // Build the stack from the chain into the target (always appending) and
  // return a promise (the value is irrelevant.)
  bender.Component.prototype.render_view = function (chain, target) {
    var stack = [];
    flexo.hcaErof(chain, function (c) {
      var mode = c.scope.$view ? c.scope.$view.stack : "top";
      if (mode == "replace") {
        stack = [c];
      } else if (mode == "top") {
        stack.push(c);
      } else {
        stack.unshift(c);
      }
    });
    stack.i = 0;
    for (var n = stack.length; stack.i < n && !stack[stack.i].scope.$view;
        ++stack.i);
    if (stack.i < n && stack[stack.i].scope.$view) {
      var instance = stack[stack.i];
      instance.scope.$target = target;
      return instance.scope.$view.render(target, stack);
    }
    return new flexo.Promise().fulfill();
  };

  // Render watches from the chain
  bender.Component.prototype.render_watches = function (chain) {
    flexo.hcaErof(chain, function (instance) {
      instance.component.watches.forEach(function (watch) {
        watch.render(instance);
      });
      on(instance, "did-render");
    });
    return chain[0];
  };

  function on(instance, type) {
    if (typeof instance.component.on[type] == "string") {
      try {
        instance.component.on[type] = new Function("instance", "type",
          instance.component.on[type]);
      } catch (e) {
        console.error("Cannot create handler for on-%0:".fmt(type), e);
        delete instance.component.on[type];
      }
    }
    if (typeof instance.component.on[type] == "function") {
      instance.component.on[type](instance, type);
    }
  }

  // Initialize the component properties after it has been rendered
  bender.Component.prototype.initialize = function (instance) {
    flexo.hcaErof(instance.__chain, function (i) {
      on(i, "will-init");
      // init properties
      on(i, "did-init");
    });
    instance.child_components.forEach(function (ch) {
      ch.component.initialize(ch);
    });
    flexo.hcaErof(instance.__chain, function (i) {
      on(i, "ready");
    });
    delete instance.__chain;
  };

  // Set the prototype of this component (the component extends its prototype)
  // TODO find a better name?
  bender.Component.prototype.extends = function (prototype) {
    if (prototype instanceof bender.Component) {
      if (this._prototype != prototype ) {
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
    return this._prototype;
  };

  function render_derived_properties(component) {
    for (var c = component._prototype; c; c = c._prototype) {
      for (var p in c.own_properties) {
        if (!component.properties.hasOwnProperty(p)) {
          render_derived_property(component, c.own_properties[p]);
        }
      }
    }
  }

  bender.Component.prototype.append_child = function (child) {
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
      this.own_properties[child.name] = child;
      render_own_property(this, child);
      this.derived.forEach(function (derived) {
        render_derived_property(derived, child);
      });
    } else if (child instanceof bender.Watch) {
      this.watches.push(child);
    } else {
      return;
    }
    this.add_descendants(child);
    return bender.Element.prototype.append_child.call(this, child);
  };

  // Component children of the view are added as child components with a
  // parent_component link; scopes are merged.
  bender.Component.prototype.add_child_component = function (child) {
    child.parent_component = this;
    this.child_components.push(child);
    var scope = Object.getPrototypeOf(this.scope);
    var old_scope = Object.getPrototypeOf(child.scope);
    Object.keys(old_scope).forEach(function (key) {
      if (key in scope && scope[key] != old_scope[key]) {
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
  bender.Component.prototype.add_descendants = function (elem) {
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
      Array.prototype.unshift.apply(queue, e.children);
    }
  };

  bender.ConcreteInstance = function (component) {
    this.component = component;
    component.instances.push(this);
    this.scope = Object.create(component.scope, {
      $that: { enumerable: true, value: component }
    });
    if (component._id) {
      this.scope["@" + component._id] = this;
    }
    this.child_components = [];
    this.property_vertices = {};
    this.properties = {};
    this.index = this.scope.$environment.components.length;
    this.scope.$environment.components.push(this);
  };

  // Render the properties of a concrete instance
  function render_properties(instance) {
    var own = instance.component.own_properties;
    for (var property in instance.own) {
      render_own_property(instance, own[property]);
    }
  }

  // Render a property for a component (either abstract or concrete)
  function render_own_property(component, property) {
    var vertex = property.vertex = component.scope.$environment.add_vertex(new
        bender.PropertyVertex(component, property));
    render_property_property(component, property, vertex);
  }

  // Render a Javascript property with Object.defineProperty for a Bender
  // property
  function render_property_property(component, property, vertex) {
    Object.defineProperty(component.properties, property.name, {
      enumerable: true,
      get: function () {
        return vertex.value;
      },
      set: function (value) {
        if (value !== vertex.value) {
          vertex.value = value;
          component.scope.$environment.visit_vertex(vertex, value);
        }
      }
    });
  }

  // Render a derived property for a component (*not* the parent of the
  // property, obviously) and a protovertex, which is the vertex of the property
  // by default. The protovertex is used for the value of the property until it
  // is set for the component, in which case the link with the protovertex is
  // severed and edges are redirected (and a new vertex is created.)
  function render_derived_property(component, property, protovertex) {
    if (!protovertex) {
      protovertex = property.vertex;
    }
    var vertex = component.scope.$environment.add_vertex(new
        bender.PropertyVertex(component, property));
    vertex.protovertices = [protovertex];
    Object.defineProperty(component.properties, property.name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return protovertex.value;
      },
      set: function (value) {
        vertex.protovertices.forEach(function (v) {
          v.out_edges = v.out_edges.filter(function (edge) {
            return edge.__vertex != vertex;
          });
        });
        delete vertex.protovertices;
        render_property_property(component, property, vertex);
        component.properties[property.name] = value;
      }
    });
    return vertex;
  }

  // Link is not a content element
  bender.Link = function (environment, rel, href) {
    this.environment = environment;
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = href;
  };

  bender.Environment.prototype.deserialize.link = function (elem) {
    return new bender.Link(this, elem.getAttribute("rel"),
        flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")));
  };

  // Render links according to their rel attribute. If a link requires delaying
  // the rest of the rendering, return a promise then fulfill it with a value to
  // resume rendering (see script rendering below.)
  bender.Link.prototype.render = function (target) {
    if (this.environment.urls[this.href]) {
      return;
    }
    this.environment.urls[this.href] = this;
    var render = bender.Link.prototype.render[this.rel];
    if (typeof render == "function") {
      return render.call(this, target);
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
    }
  };

  // Scripts are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.prototype.render.script = function (target) {
    var ns = target.ownerDocument.documentElement.namespaceURI;
    if (ns == flexo.ns.html) {
      return flexo.promise_script(this.href, target.ownerDocument.head);
    } else {
      console.warn("Cannot render script link for namespace %0".fmt(ns));
    }
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.prototype.render.stylesheet = function (target) {
    var document = target.ownerDocument;
    var ns = document.documentElement.namespaceURI;
    if (ns == flexo.ns.html) {
      var link = target.ownerDocument.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      document.head.appendChild(script);
    } else {
      console.warn("Cannot render stylesheet link for namespace %0".fmt(ns));
    }
  };

  bender.View = function () {
    this.init();
  };

  bender.View.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.view = function (elem) {
    return this.deserialize_children(new
        bender.View().stack(elem.getAttribute("stack")), elem.childNodes);
  };

  bender.View.prototype.stack = function (stack) {
    if (arguments.length > 0) {
      this._stack = normalize_stack(stack);
      return this;
    }
    return this._stack || "top";
  };

  // Append child for view and its children
  function append_view_child(child) {
    if (child instanceof bender.Component) {
      var p = parent_component(this);
      if (p) {
        p.add_child_component(child);
      }
    }
    return bender.Element.prototype.append_child.call(this, child);
  }

  bender.View.prototype.append_child = append_view_child;

  // Render the contents of the view by appending into the target, passing the
  // stack of views further down for the <content> element. Return a
  // promise-like Seq object.
  bender.View.prototype.render = function (target, stack) {
    return new flexo.Seq(this.children.map(function (ch) {
      ch.render(target, stack);
    }));
  };

  bender.View.prototype.inserted_children = function (elem, index, count) {
    if (this.parent) {
      var path = [];
      for (var e = elem; e != this; e = e.parent) {
        path.push(e.parent.children.indexOf(e));
      }
      this.parent.instance.forEach(function (instance) {
        var target = instance.scope.$first;
        for (var i = path.length - 1; i >= 0; --i) {
          for (var j = 0; j < path[i]; ++j) {
            target = target.nextSibling;
          }
          target = target.firstChild;
        }
        for (var i = 0; i < count; ++i) {
          elem.children[index + i].render(target, instance.scope);
        }
      });
    }
  };

  bender.Content = function () {
    this.init();
  };

  bender.Content.prototype = new bender.Element();

  bender.Environment.prototype.deserialize.content = function (elem) {
    return this.deserialize_children(new bender.Content()
        .id(elem.getAttribute("id")), elem.childNodes);
  };

  bender.Content.prototype.render = function (target, stack) {
    for (var i = stack.i, n = stack.length; i < n; ++i) {
      if (stack[i].scope.$view) {
        var j = stack.i;
        stack.i = i + 1;
        var render = stack[i].scope.$view.render(target, stack);
        stack.i = j;
        return render;
      }
    }
    return bender.View.prototype.render.call(this, target, stack);
  };

  bender.Attribute = function (ns, name) {
    this.init();
    this.ns = flexo.safe_string(ns);
    this.name = name;
  };

  bender.Attribute.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.attribute = function (elem) {
    var attr = new bender.Attribute(elem.getAttribute(ns),
        elem.getAttribute(name)).id(elem.getAttribute(id));
    return this.deserialize_children(attr, elem.childNodes);
  };

  bender.Attribute.prototype.append_child = function (child) {
    if (child instanceof bender.DOMTextNode || child instanceof bender.Text) {
      bender.Element.appendChild.call(this, child);
    }
  };

  bender.Attribute.prototype.render = function (target, stack) {
    if (target.nodeType == window.Node.ELEMENT_NODE) {
      var contents = this.children.reduce(function (t, node) {
        t += node.textContent;
      }, "");
      var attr = target.createAttributeNS(this.ns, this.name, contents);
      this.render_id(attr, stack);
      return target.appendChild(attr);
    }
  };

  // Bender Text element. Although it can only contain text, it can also have an
  // id so that it can be referred to by a watch.
  bender.Text = function (text) {
    this._id = "";
    this._text = text;
  };

  bender.Environment.prototype.deserialize.text = function (elem) {
    return new bender.Text(elem.textContent).id(elem.getAttribute("id"));
  };

  bender.Text.prototype.id = bender.Element.prototype.id;
  bender.Text.prototype.render_id = bender.Element.prototype.render_id;

  bender.Text.prototype.text = function (text) {
    if (arguments.length > 0) {
      this._text = flexo.safe_string(text);
      return this;
    }
    return this._text;
  };

  bender.Text.prototype.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this._text);
    this.render_id(node, stack);
    return target.appendChild(node);
  };

  bender.DOMElement = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = name;
    this.attrs = {};
  };

  bender.DOMElement.prototype = new bender.Element;

  bender.DOMElement.prototype.append_child = append_view_child;

  // Render this element and its children in the target. Return a promise-like
  // Seq object.
  bender.DOMElement.prototype.render = function (target, stack) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    this.render_id(elem, stack);
    return new flexo.Seq(this.children.map(function (ch) {
      return ch.render(elem, stack);
    })).then(function () {
      target.appendChild(elem);
    });
  };

  bender.DOMTextNode = function (text) {
    this.init();
    Object.defineProperty(this, "text", { enumerable: true,
      get: function () {
        return text;
      },
      set: function (new_text) {
        new_text = flexo.safe_string(new_text);
        if (new_text != text) {
          text = new_text;
          this.instances.forEach(function (d) {
            d.textContent = new_text;
          });
        }
      }
    });
    this.instances = [];
  };

  bender.DOMTextNode.prototype = new bender.Element;

  bender.DOMTextNode.prototype.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this.text);
    target.appendChild(node);
    this.instances.push(node);
    return node;
  };

  bender.Property = function (name, as) {
    this.init();
    this.name = name;
    this.as = normalize_as(as);
  };

  bender.Property.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.property = function (elem) {
    var name = elem.getAttribute("name");
    if (!name) {
      console.warn("Property with no name:", elem);
      return;
    }
    var property = new bender.Property(name, elem.getAttribute("as"));
    return new flexo.Promise().fulfill(property).append_children(elem, this)
      .then(function (p) {
        p.set_declared_value(elem.getAttribute("value"));
        return p;
      });
  };

  // TODO merge this with get_set_value
  bender.Property.prototype.set_declared_value = function (value) {
    if (this.as == "xml") {
      this.value = this.children;
    } else if (typeof value == "string") {
      if (this.as == "boolean") {
        this.value = flexo.is_true(value);
      } else if (this.as == "number") {
        this.value = flexo.to_number(value);
      } else if (this.as == "json") {
        try {
          this.value = JSON.parse(value);
        } catch (e) {
          console.warn("Could not parse “%0” as JSON for property %1"
              .fmt(value, this.name));
        }
      } else if (this.as == "dynamic") {
        try {
          this.value = new Function("return " + value);
        } catch (e) {
          console.warn("Could not parse “%0” as Javascript for property %1"
              .fmt(value, this.name));
        }
      } else {  // "string"
        this.value == value;
      }
    }
  };

  bender.Watch = function () {
    this.init();
    this.gets = [];
    this.sets = [];
  };

  bender.Watch.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.watch = function (elem) {
    var watch = new bender.Watch;
    if (elem.hasAttribute("id")) {
      watch.id(elem.getAttribute("id"));
    }
    if (elem.hasAttribute("enabled")) {
      watch.enabled = flexo.is_true(elem.getAttribute("enabled"));
    }
    return new flexo.Promise().fulfill(watch).append_children(elem, this);
  };

  bender.Watch.prototype.append_child = function (child) {
    if (child instanceof bender.Get) {
      this.gets.push(child);
    } else if (child instanceof bender.Set) {
      this.sets.push(child);
    }
  };

  // Render the watch by rendering a vertex for the watch, then a vertex for
  // each of the get elements with an edge to the watch vertex, then an edge
  // from the watch vertex for all set elements for a concrete component
  bender.Watch.prototype.render = function (instance) {
    var watch_vertex = new bender.WatchVertex(this, instance);
    var get_vertices = [];
    this.gets.forEach(function (get) {
      var vertex = get.render(instance);
      if (vertex) {
        vertex.add_edge(new bender.WatchEdge(get, instance, watch_vertex));
        get_vertices.push(vertex);
      }
    });
    this.sets.forEach(function (set) {
      var edge = set.render(instance);
      if (edge) {
        watch_vertex.add_edge(edge);
      }
    });
    get_vertices.forEach(function (v) {
      v.added();
    });
  };

  bender.Get = function () {};

  bender.Get.prototype = new bender.Element;

  bender.GetDOMEvent = function (type) {
    this.init();
    this.type = type;
  };

  bender.GetDOMEvent.prototype = new bender.Get;

  bender.GetDOMEvent.prototype.render = function (component) {
    var target = component.scope[this.select];
    if (target) {
      return component.scope.$environment
        .add_vertex(new bender.DOMEventVertex(this, target));
    }
  };

  bender.GetEvent = function (event) {
    this.init();
    this.event = event;
  };

  bender.GetEvent.prototype = new bender.Get;

  bender.GetProperty = function (property) {
    this.init();
    this.property = property;
  };

  bender.GetProperty.prototype = new bender.Get;

  // Render can be called from within a watch, with the first parameter being a
  // component, or from within a view, with the first parameter actually being a
  // scope
  bender.GetProperty.prototype.render = function (component, elem, ref) {
    var target = (component.scope || component)[this.select];
    if (target) {
      var properties = target.own_properties || target.component.own_properties;
      var vertex = flexo.find_first(properties[this.property].vertices,
          function (v) { return v.component == target; })
      if (!elem) {
        return vertex;
      }
      var env = vertex.component.scope.$environment;
      vertex.add_edge(new bender.InlinePropertyEdge(elem, ref, env));
      env.visit_vertex(vertex, vertex.value);
    }
  };

  bender.Environment.prototype.deserialize.get = function (elem) {
    var get;
    if (elem.hasAttribute("dom-event")) {
      get = new bender.GetDOMEvent(elem.getAttribute("dom-event"));
      get.prevent_default = flexo.is_true(elem.getAttribute("prevent-default"));
      get.stop_propagation =
        flexo.is_true(elem.getAttribute("stop-propagation"));
    } else if (elem.hasAttribute("event")) {
      get = new bender.GetEvent(elem.getAttribute("dom-event"));
    } else if (elem.hasAttribute("property")) {
      get = new bender.GetProperty(elem.getAttribute("property"));
    }
    return get_set_attributes(get, elem);
  };

  bender.Set = function () {};

  bender.Set.prototype = new bender.Element;

  bender.SetDOMProperty = function (property) {
    this.init();
    this.property = property;
  };

  bender.SetDOMProperty.prototype = new bender.Set;

  bender.SetDOMProperty.prototype.render = function (component) {
    var target = component.scope[this.select];
    if (target) {
      var edge = new bender.DOMPropertyEdge(this, target, component);
      if (this.match) {
        edge.match = this.match;
      }
      if (this.value) {
        edge.value = this.value;
      }
      return edge;
    }
  };

  bender.SetInsert = function (insert) {
    this.init();
    this.insert = insert == "first" || insert == "last" || insert == "fill"
      || insert == "before" || insert == "after" ? insert : "replace";
  };

  bender.SetInsert.prototype = new bender.Set;

  bender.SetInsert.prototype.render = function (component) {
    var target = component.scope[this.select];
    if (target) {
      return new bender.InsertEdge(target, this.insert,
          component.scope.$environment);
    }
  };

  bender.Environment.prototype.deserialize.set = function (elem) {
    var set;
    if (elem.hasAttribute("dom-property")) {
      set = new bender.SetDOMProperty(elem.getAttribute("dom-property"));
    } else if (elem.hasAttribute("insert")) {
      set = new bender.SetInsert(elem.getAttribute("insert"));
    }
    return get_set_attributes(set, elem);
  };

  bender.Vortex = function () {};

  bender.Vortex.prototype.init = function () {
    this.incoming = [];
    this.outgoing = [];
    return this;
  };

  bender.Vortex.prototype.added = function () {};

  bender.Vortex.prototype.match_vertex = function () {
    return false;
  };

  bender.Vortex.prototype.add_edge = function (edge) {
    this.outgoing.push(edge);
    edge.source = this;
  };

  bender.WatchVertex = function (watch, component) {
    this.init();
    this.watch = watch;
    this.component = component;
    this.enabled = watch.enabled;
  };

  bender.WatchVertex.prototype = new bender.Vortex;

  bender.WatchVertex.prototype.match_vertex = function (v) {
    return v instanceof bender.WatchVertex && v.watch == this.watch;
  };

  // Create a new property vertex; component and value are set later when adding
  // the property to a component or rendering that component.
  bender.PropertyVertex = function (component, property) {
    this.init();
    this.component = component;
    this.property = property;
    component.property_vertices[property.name] = this;
  };

  bender.PropertyVertex.prototype = new bender.Vortex;

  bender.PropertyVertex.prototype.added = function () {
    var v = this.component.properties[this.name];
    if (v != null) {
      this.environment.visit_vertex(this, v);
    }
  };

  bender.PropertyVertex.prototype.match_vertex = function (v) {
    return (v instanceof bender.PropertyVertex) &&
      (this.component == v.component) && (this.property == v.property);
  };

  bender.DOMEventVertex = function (get, target) {
    this.init();
    this.get = get;
    target.addEventListener(get.type, this, false);
  };

  bender.DOMEventVertex.prototype = new bender.Vortex;

  bender.DOMEventVertex.prototype.handleEvent = function (e) {
    if (this.get.prevent_default) {
      e.preventDefault();
    }
    if (this.get.stop_propagation) {
      e.stopPropagation();
    }
    this.environment.visit_vertex(this, e);
  };

  bender.DOMEventVertex.prototype.match_vertex = function (v) {
    return (v instanceof bender.DOMEventVertex) &&
      (this.target == v.target) && (this.type == v.type);
  };

  bender.Edge = function () {};

  bender.Edge.prototype.set_dest = function (dest) {
    this.dest = dest;
    dest.incoming.push(this);
  };

  // Edge from the vertex rendered for a get for a component
  bender.WatchEdge = function (get, component, dest) {
    this.get = get;
    this.enabled = get.enabled;
    this.component = component;
    this.set_dest(dest);
  };

  bender.WatchEdge.prototype = new bender.Edge;

  // Follow a watch edge, provided that:
  //   * the parent watch is enabled;
  //   * the associated get is enabled;
  //   * the input value passes the match function of the get (if any)
  bender.WatchEdge.prototype.follow = function (input) {
    if (this.dest.enabled && this.enabled &&
        (!this.get.match || this.get.match.call(this.component, input))) {
      return [this.dest,
        this.get.value && this.get.value.call(this.component, input) || input];
    }
  };

  bender.DOMPropertyEdge = function (set, target, component) {
    this.set = set;
    this.target = target;
    this.property = set.property;
    this.component = component;
    this.enabled = this.set.enabled;
    this.set_dest(component.scope.$environment.vortex);
  };

  bender.DOMPropertyEdge.prototype = new bender.Edge;

  bender.DOMPropertyEdge.prototype.follow = function (input) {
    if (this.enabled && (!this.set.match || this.set.match.call(input))) {
      var value = this.set.value && this.set.value.call(component, input) ||
        input;
      this.target[this.property] = value;
      return [this.dest, value];
    }
  };

  bender.InsertEdge = function (target, insert, environment) {
    this.target = target;
    this.insert = insert;
    this.set_dest(environment.vortex);
  };

  bender.InsertEdge.prototype = new bender.Edge;

  bender.InsertEdge.prototype.follow = function (input) {
    if (this.insert == "first") {
      this.target.insert_children(input);
    } else if (this.insert == "last") {
      this.target.insert_children(input, -1);
    } else if (this.insert == "fill") {
      this.target.remove_children();
      this.target.insert_children(input);
    } else {
      var parent = this.target.parent;
      if (this.insert == "replace") {
        parent.remove_children();
        parent.insert_children(input);
      } else {
        var index = parent.children.indexOf(this.target);
        if (this.insert == "before") {
          parent.insert_children(input, index);
        } else if (this.insert == "after") {
          parent.insert_children(input, index + 1);
        }
      }
    }
  };

  bender.InlinePropertyEdge = function (target, ref, environment) {
    this.target = target;
    this.ref = ref;
    this.last = ref && ref.precedingSibling || target.lastChild;
    this.set_dest(environment.vortex);
  };

  bender.InlinePropertyEdge.prototype = new bender.Edge;

  bender.InlinePropertyEdge.prototype.follow = function (input) {
    input.forEach(function (ch) {
      ch.render(this.source.component.scope, this.target, this.ref);
    }, this);
  };


  function get_set_attributes(gs, elem) {
    if (!gs) {
      return;
    }
    gs.as = normalize_as(elem.getAttribute("as"));
    if (elem.hasAttribute("match")) {
      var src = "return " + elem.getAttribute("match");
      try {
        gs.match = new Function("input", src);
      } catch (e) {
        console.warn("Cannot compile match function \"%0\":".fmt(src), e);
      }
    }
    if (elem.hasAttribute("value") && gs.as != "xml") {
      var value = get_set_value(elem.getAttribute("value"), gs.as);
      if (typeof value == "function") {
        gs.value = value;
      }
    }
    gs.select = elem.hasAttribute("select") ? elem.getAttribute("select") :
      "$this";
    return new flexo.Promise().fulfill(gs).append_children(elem, this);
  }

  // Parse a value attribute for a get or set given its `as` attribute
  function get_set_value(value, as) {
    try {
      return as == "string" ? flexo.funcify(value) :
        as == "number" ? flexo.funcify(flexo.to_number(value)) :
        as == "boolean" ? flexo.funcify(flexo.is_true(value)) :
        as == "json" ? flexo.funcify(JSON.parse(value)) :
          new Function("input", "return " + value);
    } catch (e) {
      console.log("Could not parse value \"%0\" as %1".fmt(value, as));
    }
  }

  // Normalize the `as` property of an element so that it matches a known value.
  // Set to “dynamic” by default.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as == "string" || as == "number" || as == "boolean" ||
      as == "json" || as == "xml" ? as : "dynamic";
  }

  // Normalize the `stack` property of an element so that it matches a known
  // value. Set to “top” by default.
  function normalize_stack(stack) {
    stack = flexo.safe_trim(stack).toLowerCase();
    return stack == "bottom" || stack == "replace" ? stack : "top";
  }

  // Find the closest ancestor of node (including self) that is a component and
  // return it if found
  function parent_component(node) {
    for (; node && !(node instanceof bender.Component); node = node.parent);
    if (node) {
      return node;
    }
  }

  // Update the scope of the parent component of node (if any)
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
