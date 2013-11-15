(function () {
  "use strict";

  /* global bender, console, require, window, $$unshift */
  var flexo = typeof require === "function" ? require("flexo") : window.flexo;

  // Set up tracing, turned on/off with setting bender.TRACE to true or false
  var _trace;
  Object.defineProperty(bender, "TRACE", {
    enumerable: true,
    get: function () { return _trace !== flexo.nop; },
    set: function (p) { _trace = p ? console.log.bind(console) : flexo.nop; }
  });
  Object.defineProperty(bender, "trace", {
    enumerable: true,
    get: function () { return _trace; }
  });


  // Load, then render a component from the given href. Return a promise of the
  // instance of the rendered component.
  bender.render_href = function (href, target, ref, env) {
    if (!(env instanceof bender.Environment)) {
      env = new bender.Environment();
    }
    if (!target) {
      target = env.scope.$document.body || env.scope.$document.documentElement;
    }
    return env.load_component(
        flexo.absolute_uri(env.scope.$document.baseURI, href)
      ).then(function (component) {
        return env.render_component(component, target, ref);
      });
  };


  // Create a new environment in a document, or window.document by default.
  var environment = (bender.Environment = function (document) {
    this.scope = {
      $document: document || (typeof window === "object" && window.document),
      $environment: this
    };
    this.urls = {};
    this.components = [];
    this.vertices = [];
    this.vortex = this.add_vertex(new bender.Vortex());
    this.bindings = 0;
  }).prototype;

  // Add a component or instance to the environment.
  // TODO [mutations] Remove a component or instance from the environment.
  environment.add_component = function (component) {
    component.index = this.components.length;
    this.components.push(component);
    return component;
  };

  // Create a new Bender component in this environment and return it.
  environment.component = function (scope) {
    return this.add_component(new bender.Component(scope || this.scope));
  };

  // Create a new instance for a component and an optional parent instance, add
  // it to the environment and return it.
  environment.instance = function (component, parent) {
    return this.add_component(new bender.Instance(component, parent));
  };

  // Render and initialize the component, returning the promise of a concrete
  // instance.
  environment.render_component = function (component, target, ref) {
    var fragment = target.ownerDocument.createDocumentFragment();
    var instance = component.render(fragment);
    instance.init_events();
    instance.init_properties();
    target.insertBefore(fragment, ref);
    return instance;
  };


  // Render this component to a concrete instance for the given target.
  bender.Component.prototype.render = function (target, stack) {
    var instance = this.scope.$environment.instance(this,
        stack && stack[stack.i].$this);
    on(instance, "will-render");
    return instance.render_view(target);
  };

  // Load all links for the component, from the further ancestor down to the
  // component itself. Return a promise that is fulfilled once all
  // links have been loaded in sequence.
  bender.Component.prototype.load_links = function () {
    var links = [];
    for (var p = this; p; p = p._prototype) {
      $$unshift(links, p.links);
    }
    return flexo.collect_promises(links.map(function (link) {
      return link.load(this.scope.$document);
    }, this)).then(flexo.self.bind(this));
  };


  // An instance of `component`, may have a parent instance (from the parent
  // component of `component`.)
  var instance = (bender.Instance = function (component, parent) {
    component.instances.push(this);
    this.properties = component._init_properties_object.call(this,
      Object.create(component.properties));
    this.scopes = [];
    for (var p = component; p; p = p._prototype) {
      var scope = get_instance_scope(p, parent);
      if (p._id) {
        var key = "@" + p._id;
        if (scope.hasOwnProperty(key)) {
          console.error("Id %0 already in scope for new instance of %0"
              .fmt(key, component.url()));
        } else {
          scope[key] = this;
        }
      }
      var s = Object.create(scope, {
        $that: { enumerable: true, value: p },
        $this: { enumerable: true, value: this }
      });
      this.scopes.push(s);
      Object.getPrototypeOf(scope)[""].push(s);
    }
    this.children = [];
    if (parent) {
      this.parent = parent;
      parent.children.push(this);
    }
  }).prototype;

  instance._define_js_property = bender.Component.prototype._define_js_property;

  // By default, the scope of the instance is the lowest scope in the chain.
  Object.defineProperty(instance, "scope", {
    enumerable: true,
    get: function () {
      return this.scopes[0];
    }
  });

  // Get the dynamic scope matching the static scope of a given element.
  instance.scope_of = function (element) {
    var component = element.current_component;
    return flexo.find_first(this.scopes, function (scope) {
      return scope.$that === component;
    }, this);
  };

  // Used mostly for debugging.
  instance.id = function () {
    return "%0:%1".fmt(this.scopes.map(function (scope) {
      return "%0,%1".fmt(scope.$that.id(), scope.$that.index);
    }).join(";"), this.index);
  };

  // Render the instance’s stack of views and return itself.
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


  // Load links according to their rel attribute. If a link requires delaying
  // the rest of the loading, return a promise then fulfill it with a value to
  // resume loading (see script rendering below.)
  bender.Link.prototype.load = function (document) {
    if (this.environment.urls[this.href]) {
      return this.environment.urls[this.href];
    }
    this.environment.urls[this.href] = this;
    var load = bender.Link.prototype.load[this.rel];
    if (typeof load === "function") {
      return load.call(this, document);
    }
    console.warn("Cannot load “%0” link".fmt(this.rel));
  };

  // Scripts are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.prototype.load.script = function (document) {
    var ns = document.documentElement.namespaceURI;
    if (ns === flexo.ns.html) {
      return flexo.promise_script(this.href, document.head)
        .then(function (script) {
          return this.loaded = script, this;
        }.bind(this));
    }
    console.warn("Cannot render script link for namespace %0".fmt(ns));
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.prototype.load.stylesheet = function (document) {
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


  // Render the contents of the view by appending into the target, passing the
  // stack of views further down for the <content> element.
  bender.View.prototype.render = function (target, stack) {
    this.children.forEach(function (ch) {
      ch.render(target, stack);
    });
  };


  // Render the next view in the stack if any, otherwise the contents of the
  // element are rendered as if it were a view element.
  // TODO select attribute (using query selectors)
  bender.Content.prototype.render = function (target, stack) {
    for (var i = stack.i + 1, n = stack.length;
        i < n && !stack[i].$that.scope.$view; ++i) {}
    if (i < n) {
      var j = stack.i;
      stack.i = i;
      stack[i].$that.scope.$view.render(target, stack);
      stack.i = j;
    } else {
      bender.View.prototype.render.call(this, target, stack);
    }
  };


  // Render as an attribute of the target.
  bender.Attribute.prototype.render = function (target, stack) {
    if (target.nodeType === window.Node.ELEMENT_NODE) {
      var contents = this.children.reduce(function (t, node) {
        return t + node.text ? node.text() : node.textContent;
      }, "");
      var attr = target.setAttributeNS(this.ns(), this.name(), contents);
      add_id_to_scope(this, attr, stack);
    }
  };


  // Render as a text node in the target.
  bender.Text.prototype.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this._text);
    add_id_to_scope(this, node, stack);
    target.appendChild(node);
  };


  // Render as a DOM element with the same name and attributes.
  bender.DOMElement.prototype.render = function (target, stack) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    if (this.fake_id) {
      stack[stack.i][this.fake_id] = elem;
    }
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    add_id_to_scope(this, elem, stack, true);
    bender.View.prototype.render.call(this, elem, stack);
    target.appendChild(elem);
  };


  // Render as a DOM text node with the same text content.
  bender.DOMTextNode.prototype.render = function (target, stack) {
    var node = target.ownerDocument.createTextNode(this.text());
    target.appendChild(node);
    if (this.fake_id) {
      stack[stack.i][this.fake_id] = node;
    }
  };


  // Add a concrete node to the scope when the element is rendered.
  // TODO handle render_id for the component’s own id.
  // TODO [mutations] remove id from scope.
  function add_id_to_scope(element, node, stack, output) {
    if (element._id) {
      Object.getPrototypeOf(stack[stack.i])["@" + element._id] = node;
      if (output) {
        set_id_or_class(node, stack, element._id);
      }
    }
    if (output && !stack[stack.i].$first) {
      stack[stack.i].$first = node;
      if (element._id) {
        set_id_or_class(node, stack, element._id);
      }
    }
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

  // Set id or class for an output node based on the render-id attribute
  // TODO render-id="inherit"
  function set_id_or_class(node, stack, id) {
    var render = stack[stack.i].$that.scope.$view._render_id;
    if (render === "id") {
      node.setAttribute("id", id);
    } else if (render === "class" && node.classList) {
      node.classList.add(id);
    }
  }

}());
