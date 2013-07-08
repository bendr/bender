(function (bender) {
  "use strict";

  bender.version = "0.8.2-h";
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Load a component and return a promise. The defaults object should contain
  // the defaults, including a href property for the URL of the component to
  // load; alternatively, a URL as string may be provided. If no environment
  // parameter is passed, a new one is created for the current document.
  bender.load_component = function (defaults, env) {
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
      { href: defaults });
    if (args.href) {
      if (!(env instanceof bender.Environment)) {
        env = new bender.Environment;
      }
      var url = flexo.absolute_uri(env.document.baseURI, args.href);
      return env.load_component(url);
    }
    return new flexo.Promise().reject("No href argument for component.");
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
    component.environment = this;
    component.index = this.components.length;
    this.components.push(this);
    return component;
  };

  // Load a component from an URL in the environment and return a promise. If
  // loading fails, return an object with a reason, the current environment, and
  // possibly the original XHMLHttpRequest or the response from said request.
  bender.Environment.prototype.load_component = function (url) {
    if (this.urls[url]) {
      return this.urls[url];
    }
    var response_;
    this.urls[url] = new flexo.Promise;
    return flexo.ez_xhr(url, { responseType: "document" })
      .then(function (response) {
        response_ = response;
        return this.deserialize(response.documentElement);
      }.bind(this)).then(function (d) {
        if (d instanceof bender.Component) {
          d.url = url;
          this.urls[url].fulfill(d);
          return d;
        } else {
          var reason = { response: response_, reason: "not a Bender component",
            environment: this };
          this.urls[url].reject(reason);
          throw reason;
        }
      }.bind(this), function (reason) {
        reason.environment = this;
        this.urls[url].reject(reason);
        throw reason;
      }.bind(this));
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than elements, text and CDATA) are simply skipped, possibly with a warning
  // in the case of unknown Bender elements (as it probably means that another
  // namespace was meant; or a deprecated tag was used.)
  bender.Environment.prototype.deserialize = function (node) {
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node);
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

  // Deserialize a foreign element and its contents (attribute and children),
  // creating a generic DOM element object.
  bender.Environment.prototype.deserialize_foreign = function (elem) {
    var e = new bender.DOMElement(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns == "" && attr.localName == "id") {
        e.id = attr.value;
      } else {
        if (!e.attrs.hasOwnProperty(ns)) {
          e.attrs[ns] = {};
        }
        e.attrs[ns][attr.localName] = attr.value;
      }
    }
    return new flexo.Promise().fulfill(e).append_children(elem, this);
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

  // Helper function for deserialize to handle all children of `elem` in the
  // environment `env`, whether the result of deserialization is a promise
  // (e.g., a component) or an immediate value (a Bender object.)
  flexo.Promise.prototype.append_children = function (elem, env) {
    return this.each(elem.childNodes, function (ch, parent) {
      var p = env.deserialize(ch);
      if (p instanceof flexo.Promise) {
        return p.then(function (d) {
          parent.append_child(d);
          return parent;
        });
      } else {
        parent.append_child(p);
        return parent;
      }
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
    flexo.make_property(this, "id", function (id, cancel) {
      cancel(typeof id != "string" || id == this.id);
      update_scope(this, id);
      return id;
    }, "");
  };

  bender.Element.prototype.append_child = function (child) {
    this.children.push(child);
    child.parent = this;
    return child;
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
    this.on = {};                // on-* attributes
    this.own_properties = {};    // property nodes
    this.links = [];             // link nodes
    this.watches = [];           // watch nodes
    this.child_components = [];  // all child components (in views/properties)
    this.properties = {};        // property values (with associated vertices)
    this.derived = [];           // derived components
  };

  bender.Component.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.component = function (elem) {
    var component = this.component();
    // TODO attributes to set properties; enabled/id?
    // TODO make a list of dependencies so that we don’t block if there is a
    // loop (loop in content should be OK once there is <replicate>; for
    // prototypes that’s still an error.)
    return (elem.hasAttribute("href") ?
      this.load_component(flexo.absolute_uri(elem.baseURI,
          elem.getAttribute("href")))
        .then(function (prototype) {
          return component.set_prototype(prototype);
        }) : new flexo.Promise().fulfill(component))
      .append_children(elem, this);
  };

  bender.Component.prototype.set_prototype = function (prototype) {
    this.$prototype = prototype;
    prototype.derived.push(this);
    render_inherited_properties(this);
    return this;
  };

  function render_inherited_properties(component) {
    for (var c = component.$prototype; c; c = c.$prototype) {
      for (var p in c.own_properties) {
        if (!component.properties.hasOwnProperty(p)) {
          render_inherited_property(component, c.own_properties[p]);
        }
      }
    }
  }

  bender.Component.prototype.append_child = function (child) {
    if (child instanceof bender.Link) {
      this.links.push(child);
    } else if (child instanceof bender.View) {
      if (this.scope.$view) {
        console.warn("Component already has a view");
        return;
      } else {
        // TODO import child components and merge scopes
        this.scope.$view = child;
      }
    } else if (child instanceof bender.Property) {
      this.own_properties[child.name] = child;
      render_own_property(this, child);
      this.derived.forEach(function (derived) {
        render_inherited_property(derived, child);
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
      if (key in scope) {
        // TODO check why this occurs in a test
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
      if (e.id) {
        var id = "#" + e.id;
        if (!scope.hasOwnProperty(id)) {
          scope[id] = e;
        } else {
          console.warn("Id %0 already defined in scope".fmt(e.id));
        }
      }
      if (e instanceof bender.Component && !e.parent_component) {
        this.add_child_component(e);
      }
      Array.prototype.unshift.apply(queue, e.children);
    }
  };

  // Render the links, then the view. Link rendering may delay rendering the
  // view (e.g., scripts need to finish loading before the view can be rendered)
  bender.Component.prototype.render = function (target, ref) {
    var pending_links = 0;
    var render_next = function () {
      if (arguments.length > 0) {
        --pending_links;
      }
      if (pending_links == 0) {
        this.render_component(target);
      }
    }.bind(this);
    this.links.forEach(function (link) {
      var p = link.render(target);
      if (p) {
        ++pending_links;
        p.then(render_next);
      }
    });
    render_next();
  };

  // Render this component to a concrete component for the given target
  bender.Component.prototype.render_component = function (target, ref) {
    this.handle_on("before-render", target);
    // render component bottom-up
    for (var chain = [], prev, p = this; p; prev = p, p = p.$prototype) {
      var r = new bender.RenderedComponent(p);
      chain.push(r);
      if (prev) {
        prev.$prototype = r;
      }
    }
    // render properties
    var fragment = this.scope.$document.createDocumentFragment();
    this.render_view(chain, fragment);
    // render watches
    this.handle_on("after-render");
    // init properties top-down
    this.handle_on("before-init");
    this.handle_on("after-init");
    target.insertBefore(fragment, ref);
    this.handle_on("ready");
  };

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
      var rendered = stack[stack.i];
      rendered.scope.$target = target;
      rendered.scope.$view.render(stack, target);
    }
  };

  bender.RenderedComponent = function (component) {
    this.component = component;
    this.scope = Object.create(component.scope, {
      $that: { enumerable: true, value: component }
    });
    this.properties = {};
  };

  var slice = Array.prototype.slice;

  function handle_on(on, type, args) {
    if (type in on) {
      on[type].apply(this, args);
    }
    notify(this, type, args.length > 0 && { args: args });
  }

  // TODO use the watch graph directly for notifications
  function notify(source, type, e) {
  }

  bender.Component.prototype.handle_on = function (type) {
    handle_on.call(this, this.on, type, slice.call(arguments, 1));
  };

  bender.RenderedComponent.prototype.handle_on = function (type) {
    handle_on.call(this, this.component.on, type, slice.call(arguments, 1));
  };

  // Render the properties of a concrete component
  function render_properties(concrete) {
    var own = concrete.component.own_properties;
    for (var property in concrete.own) {
      render_own_property(concrete, own[property]);
    }
  }

  // Render a property for a component (either abstract or concrete)
  function render_own_property(component, property) {
    var vertex = property.vertex = component.scope.$environment.add_vertex(new
        bender.PropertyVertex(component, property));
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

  // Render an inherited property [need the original component]
  function render_inherited_property(component, property) {
    var vertex = component.scope.$environment.add_vertex(new
        bender.PropertyVertex(component, property));
    Object.defineProperty(component.properties, property.name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return property.vertex.value;
      },
      set: function (value) {
        var edges = flexo.partition(property.vertex.out_edges, function (edge) {
          return edge.__vertex == vertex;
        });
        property.vertex.out_edges = edges[1];
        edges[0].forEach(function (edge) {
          delete edge.__vertex;
          propert.vertex.add_edge(edge);
        });
        render_own_property(component, property);
      }
    });
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
    var document = target.ownerDocument;
    var ns = document.documentElement.namespaceURI;
    if (ns == flexo.ns.html) {
      var script = target.ownerDocument.createElement("script");
      script.src = this.href;
      script.async = false;
      var promise = new flexo.Promise;
      script.onload = function () {
        promise.fulfill(script);
      }
      document.head.appendChild(script);
      return promise;
    } else {
      console.warn("Cannot render script link for namespace %0".fmt(ns));
    }
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.prototype.render.stylesheet = function () {
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
    return new flexo.Promise().fulfill(new bender.View).append_children(elem,
        this);
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

  bender.View.prototype.render = function (stack, target) {
    this.children.forEach(function (ch) {
      ch.render(stack, target);
    });
  };

  bender.View.prototype.inserted_children = function (elem, index, count) {
    if (this.parent) {
      var path = [];
      for (var e = elem; e != this; e = e.parent) {
        path.push(e.parent.children.indexOf(e));
      }
      this.parent.concrete.forEach(function (concrete) {
        var target = concrete.scope.$first;
        for (var i = path.length - 1; i >= 0; --i) {
          for (var j = 0; j < path[i]; ++j) {
            target = target.nextSibling;
          }
          target = target.firstChild;
        }
        for (var i = 0; i < count; ++i) {
          elem.children[index + i].render(target, concrete.scope);
        }
      });
    }
  };

  bender.DOMElement = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = name;
    this.attrs = {};
  };

  bender.DOMElement.prototype = new bender.Element;

  bender.DOMElement.prototype.append_child = append_view_child;

  bender.DOMElement.prototype.render = function (stack, target) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    if (this.id) {
      stack[stack.i].scope["@" + this.id] = elem;
    }
    if (!stack[stack.i].scope.$first) {
      stack[stack.i].scope.$first = elem;
    }
    this.children.forEach(function (ch) {
      ch.render(stack, elem);
    });
    target.appendChild(elem);
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
          this.rendered.forEach(function (d) {
            d.textContent = new_text;
          });
        }
      }
    });
    this.rendered = [];
  };

  bender.DOMTextNode.prototype = new bender.Element;

  bender.DOMTextNode.prototype.render = function (stack, target) {
    var t = target.ownerDocument.createTextNode(this.text);
    if (this.id) {
      stack[stack.i].scope["@" + this.id] = t;
    }
    if (!stack[stack.i].scope.$first) {
      stack[stack.i].scope.$first = t;
    }
    target.appendChild(t);
    this.rendered.push(t);
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
      } else if (this.as == "string") {
        this.value = value;
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
      watch.id = elem.getAttribute("id");
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
  // from the watch vertex for all set elements
  bender.Watch.prototype.render = function (component) {
    var watch_vertex = new bender.WatchVertex(this, component);
    var get_vertices = [];
    this.gets.forEach(function (get) {
      var vertex = get.render(component);
      if (vertex) {
        vertex.add_edge(new bender.WatchEdge(get, component, watch_vertex));
        get_vertices.push(vertex);
      }
    });
    this.sets.forEach(function (set) {
      var edge = set.render(component);
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
  // Set to “dynamic” as default.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as == "string" || as == "number" || as == "boolean" ||
      as == "json" || as == "xml" ? as : "dynamic";
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
