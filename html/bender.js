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
      if (!env) {
        env = new bender.Environment;
      }
      return env
        .load_component(flexo.absolute_uri(env.document.baseURI, args.href));
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

  // Create a new environment in a document, or window.document by default.
  bender.Environment = function (document) {
    this.document = document || window.document;
    this.scope = { $document: this.document, $environment: this };
    this.urls = {};
    this.vertices = [];
    this.add_vertex(new bender.Vortex().init());
    this.queue = [];
    this.traverse_graph_bound = this.traverse_graph.bind(this);
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
      if (!e.attrs.hasOwnProperty(ns)) {
        e.attrs[ns] = {};
      }
      e.attrs[ns][attr.localName] = attr.value;
    }
    return new flexo.Promise().fulfill(e).append_children(elem, this);
  };

  bender.Environment.prototype.visit = function (vertex, value) {
    if (!this.visit_timeout) {
      this.visit_timeout = setTimeout(this.traverse_graph_bound, 0);
    }
    this.queue.push([vertex, value]);
  };

  bender.Environment.prototype.traverse_graph = function () {
    var queue = this.queue.slice();
    this.queue = [];
    delete this.visit_timeout;
    for (var visited = [], i = 0; i < queue.length; ++i) {
      var q = queue[i];
      var vertex = q[0];
      var value = q[1];
      if (vertex.hasOwnProperty("__visited_value")) {
        if (vertex.__visited_value !== value) {
          this.visit(vertex, value);
        }
      } else {
        vertex.__visited_value = value;
        visited.push(vertex);
        vertex.outgoing.forEach(function (edge) {
          try {
            queue.push([edge.dest, edge.visit(value)]);
          } catch (e) {
            if (e !== "fail") {
              throw e;
            }
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
      return v.match(w);
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
    this.id = "";
  };

  bender.Element.prototype.append_child = function (child) {
    if (child instanceof bender.Element) {
      this.children.push(child);
      child.parent = this;
      return child;
    }
  };

  bender.Component = function (environment) {
    this.init();
    this.environment = environment;
    this.own_properties = {};
    this.properties = {};
    this.links = [];
    this.watches = [];
  };

  bender.Component.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.component = function (elem) {
    var component = new bender.Component(this);
    // TODO attributes to set properties; enabled/id?
    // TODO make a list of dependencies so that we don’t block if there is a
    // loop (loop in content should be OK once there is <replicate>; for
    // prototypes that’s still an error.)
    return (elem.hasAttribute("href") ?
      this.load_component(flexo.absolute_uri(elem.baseURI,
          elem.getAttribute("href")))
        .then(function (prototype) {
          component.$prototype = prototype;
          return component;
        }) : new flexo.Promise().fulfill(component))
      .append_children(elem, this);
  };

  bender.Component.prototype.append_child = function (child) {
    if (child instanceof bender.Link) {
      this.links.push(child);
      child.parent = this;
    } else if (child instanceof bender.View) {
      if (this.view) {
        console.warn("Component already has a view");
        return;
      } else {
        this.view = child;
      }
    } else if (child instanceof bender.Property) {
      this.own_properties[child.name] = child;
    } else if (child instanceof bender.Watch) {
      this.watches.push(child);
    } else {
      return;
    }
    child.parent = this;
    return child;
  };

  // Render the links, then the view. Link rendering may delay rendering the
  // view (e.g., scripts need to finish loading before the view can be rendered)
  bender.Component.prototype.render = function (target) {
    var pending_links = 0;
    var render_next = function () {
      if (arguments.length > 0) {
        --pending_links;
      }
      if (pending_links == 0) {
        this.render_properties();
        this.render_view(target);
        this.render_watches();
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

  // Render the properties of the prototype of this component, then this
  // component’s properties
  bender.Component.prototype.render_properties = function () {
    var components = [];
    for (var c = this; c; c = c.$prototype) {
      components.push(c);
    }
    for (var i = components.length - 1; i >= 0; --i) {
      for (var property in components[i].own_properties) {
        this.render_property(components[i].own_properties[property]);
      }
    }
  };

  // Render a property for this component
  bender.Component.prototype.render_property = function (property) {
    property.vertex = this.environment
      .add_vertex(new bender.PropertyVertex(this, property));
    define_own_property(this, property.vertex);
  };

  bender.Component.prototype.render_view = function (target) {
    if (this.view) {
      this.view.render(target);
    }
  };

  bender.Component.prototype.render_watches = function () {
    this.watches.forEach(function (watch) {
      watch.render(this);
    }, this);
  };

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

  bender.View.prototype.render = function (target) {
    this.children.forEach(function (ch) {
      ch.render(target);
    });
  };

  bender.DOMElement = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = name;
    this.attrs = {};
  };

  bender.DOMElement.prototype = new bender.Element;

  bender.DOMElement.prototype.render = function (target) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    this.children.forEach(function (ch) {
      ch.render(elem);
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

  bender.DOMTextNode.prototype.render = function (target) {
    var t = target.ownerDocument.createTextNode(this.text);
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

  bender.Vortex = function () {};

  bender.Vortex.prototype.init = function () {
    this.incoming = [];
    this.outgoing = [];
    return this;
  };

  bender.Vortex.prototype.match = function () {
    return false;
  };

  bender.PropertyVertex = function (component, property) {
    this.init();
    this.component = component;
    this.name = property.name;
    if (property.hasOwnProperty("value")) {
      this.value = property.value;
    }
  };

  bender.PropertyVertex.prototype = new bender.Vortex;

  bender.PropertyVertex.prototype.match = function (v) {
    return (v instanceof bender.PropertyVertex) &&
      (this.component == v.component) && (this.name == v.name);
  };

  bender.DOMEventVertex = function (get) {
    this.init();
    this.get = get;
    target.addEventListener(get.type, this, false);
  };

  bender.DOMEventVertex.handleEvent = function (e) {
    if (this.get.prevent_default) {
      e.preventDefault();
    }
    if (this.get.stop_propagation) {
      e.stopPropagation();
    }
    this.environment.visit(this, e);
  };

  bender.DOMEventVertex.prototype = new bender.Vortex;

  bender.DOMEventVertex.prototype.match = function (v) {
    return (v instanceof bender.DOMEventVertex) &&
      (this.target == v.target) && (this.type == v.type);
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
    return flexo.Promise().fulfill(component).append_children(elem, this);
  };

  bender.Watch.prototype.append_child = function (child) {
    if (child instanceof bender.Get) {
      this.gets.push(child);
    } else if (child instanceof bender.Set) {
      this.sets.push(child);
    }
  };

  bender.Watch.prototype.render = function (component) {
    this.gets.forEach(function (get) {
      get.render(component);
    });
    this.sets.forEach(function (set) {
      set.render(component);
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
    component.environment.add_vertex(new bender.DOMEventVertex(this));
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

  bender.Environment.prototype.deserialize.get = function (elem) {
    var get;
    if (elem.hasAttribute("dom-event")) {
      get = new GetDOMEvent(elem.getAttribute("dom-event"));
      get.prevent_default = flexo.is_true(elem.getAttribute("prevent-default"));
      get.stop_propagation =
        flexo.is_true(elem.getAttribute("stop-propagation"));
    } else if (elem.hasAttribute("event")) {
      get = new GetEvent(elem.getAttribute("dom-event"));
    } else if (elem.hasAttribute("property")) {
      get = new GetProperty(elem.getAttribute("property"));
    }
    if (get) {
      get.as = normalize_as(elem.getAttribute("as"));
      get.select = elem.getAttribute("select");
      return flexo.Promise().fulfill(get).append_children(elem, this);
    }
  };

  bender.Set = function () {};

  bender.Set.prototype = new bender.Element;

  bender.Environment.prototype.deserialize.set = function (elem) {
  };

  // Add id to scope for abstract element (and possibly concrete element too)
  function add_id_to_scope(scope, id, abstract, concrete) {
    if (id) {
      scope = Object.getPrototypeOf(scope);
      var aid = "#" + id;
      if (!scope.hasOwnProperty(aid)) {
        scope[aid] = abstract;
        if (concrete) {
          scope["@" + id] = concrete;
        }
        return;
      }
      console.warn("Id %0 already defined in scope".fmt(id));
    }
  }

  // Define the getter/setter for a component’s own property with a previously
  // created PropertyVertex.
  function define_own_property(component, vertex) {
    Object.defineProperty(component.properties, vertex.name, {
      enumerable: true,
      get: function () {
        return vertex.value;
      },
      set: function (value) {
        if (value !== vertex.value) {
          vertex.value = value;
          component.environment.visit(vertex, value);
        }
      }
    });
  }

  // Normalize the “as” property of an element so that it matches a known value.
  // Set to “dynamic” as default.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as == "string" || as == "number" || as == "boolean" ||
      as == "json" || as == "xml" ? as : "dynamic";
  }

}(this.bender = {}));
