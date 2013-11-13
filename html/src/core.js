(function () {
  "use strict";

  /* global console, exports, require, window, $foreach, $$push, $$unshift */
  // Disable warnings about new Function()
  // jshint -W054

  var bender, flexo;
  if (typeof require === "function") {
    flexo = require("flexo");
    bender = exports;
  } else {
    flexo = window.flexo;
    bender = window.bender = {};
  }

  bender.version = "0.8.2.6";

  var _class = flexo._class;


  // Base for Bender elements.
  var element = (bender.Element = function () {}).prototype;

  // Initialize a new element with its basic properties.
  element.init = function () {
    this.children = [];
    return this;
  };

  // Generic append child method, should be overloaded to manage contents.
  // Return the appended child (similar to the DOM appendChild method.)
  // TODO if the child is a DOM node, transform it (and its children) into a
  // Bender DOMElement or DOMTextNode.
  element.append_child = function (child) {
    if (!(child instanceof bender.Element)) {
      return;
    }
    if (child.parent && child.parent !== this) {
      child.parent.remove_child(child);
    }
    if (!child.parent) {
      this.children.push(child);
      child.parent = this;
      return child;
    }
  };

  // Same but return the element rather than the child for chainability.
  element.child = function (child) {
    return this.append_child(child), this;
  };

  // Generic remove child method, should be overloaded to manage contents.
  // Return the removed child.
  // TODO [mutations] handle child removal for all elements.
  element.remove_child = function (child) {
    if (child.parent !== this) {
      throw "Cannot remove child: hierarchy error";
    }
    delete child.parent;
    return flexo.remove_from_array(this.children, child);
  };

  // Get the current component of any Bender element, i.e., the closest
  // component ancestor of the element, if it exists. For a component element,
  // it will be itself.
  Object.defineProperty(element, "current_component", { enumerable: true,
    get: function () {
      return this.parent && this.parent.current_component;
    }
  });

  // All elements may have an id. If the id is modified, the scope for this
  // element gets updated.
  // TODO limit the range of ids? Currently any string goes.
  // TODO [mutations] remove old ids when changing the id.
  element.id = function (id) {
    if (arguments.length > 0) {
      id = flexo.safe_string(id);
      if (id !== this._id) {
        this._id = id;
        var p = this.current_component;
        if (p) {
          p.update_id_for_element_in_scope(this, id);
        }
      }
      return this;
    }
    return this._id || "";
  };

  // Add a concrete node to the scope when the element is rendered.
  // TODO handle render_id for the component’s own id.
  // TODO [mutations] remove id from scope.
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
    element.init.call(this);
    var parent_scope = scope.hasOwnProperty("$environment") ?
      Object.create(scope) : scope;
    if (!parent_scope.hasOwnProperty("")) {
      parent_scope[""] = [];
    }
    this.scope = Object.create(parent_scope, {
      $this: { enumerable: true, writable: true, value: this },
      $that: { enumerable: true, writable: true, value: this }
    });
    parent_scope[""].push(this.scope);
    this.vertices = {
      property: { component: {}, instance: {} },
      event: { component: {}, instance: {} },
      dom: {}
    };
    this._on = {};                   // on-* attributes
    this.links = [];                 // link nodes
    this.property_definitions = {};  // property nodes
    this.properties = this.init_properties_object({});  // values
    this.init_values = {};           // initial property values from attributes
    this.event_definitions = {};     // event nodes
    this.child_components = [];      // all child components
    this.derived = [];               // derived components
    this.instances = [];             // rendered instances
    this.watches = [];               // watch nodes
    this.not_ready = true;           // not ready
    this.event("ready");             // every component has a “ready” event
  }, bender.Element);

  // Get or set the prototype of the component (must be another component.)
  // TODO [mutations] what happens to the old prototype if there was one?
  component.prototype = function (prototype) {
    if (arguments.length === 0) {
      return this._prototype;
    }
    if (!(prototype instanceof bender.Component)) {
      throw "The prototype of a component must be a component";
    }
    if (this._prototype === prototype) {
      return;
    }
    this.__visited = true;
    var visited = [this];
    for (var p = prototype; p && !p.__visited; p = p._prototype) {}
    visited.forEach(function (v) {
      delete v.__visited;
    });
    if (p) {
      throw "Cycle in prototype chain";
    }
    this._prototype = prototype;
    prototype.derived.push(this);
    this.init_values = flexo.replace_prototype(prototype.init_values,
        this.init_values);
    this.vertices = {
      property: {
        component: flexo.replace_prototype(
                       prototype.vertices.property.component,
                       this.vertices.property.component),
        instance: flexo.replace_prototype(prototype.vertices.property.instance,
                       this.vertices.property.instance)
      },
      event: {
        component: flexo.replace_prototype(prototype.vertices.event.component,
                       this.vertices.event.component),
        instance: flexo.replace_prototype(prototype.vertices.event.instance,
                       this.vertices.event.instance)
      },
      dom: flexo.replace_prototype(prototype.vertices.dom, this.vertices.dom)
    };
    for (var id in prototype.vertices.dom) {
      this.vertices[id] = flexo.replace_prototype(prototype.vertices.dom[id],
          this.vertices.dom[id]);
    }
    this.properties = flexo.replace_prototype(prototype.properties,
        this.properties);
    this.property_definitions = flexo.replace_prototype(
        prototype.property_definitions, this.property_definitions);
    this.event_definitions = flexo.replace_prototype(
        prototype.event_definitions, this.event_definitions);
    return this;
  };

  // Initialize the properties object for a component or instance, setting the
  // hidden epsilon meta-property to point back to the component that owns it.
  // The property is made configurable for inherited components and instances.
  component.init_properties_object = function (properties) {
    Object.defineProperty(properties, "", { value: this, configurable: true });
    return properties;
  };

  Object.defineProperty(component, "current_component", { enumerable: true,
    get: flexo.self });

  Object.defineProperty(component, "all_instances", {
    enumerable: true,
    get: function () {
      var queue = [this];
      var instances = [];
      while (queue.length > 0) {
        var q = queue.shift();
        $$push(instances, q.instances);
        $$push(queue, q.derived);
      }
      return instances;
    }
  });

  // TODO [mutations] remove the old id when it changes
  component.update_id_for_element_in_scope = function (element, id) {
    var scope = Object.getPrototypeOf(this.scope);
    var key = "#" + id;
    if (key in scope) {
      console.error("Id %0 already in scope".fmt(key));
    } else {
      scope[key] = element;
      scope["@" + id] = element;
    }
  };

  // Get or set the URL of the component (from the XML file of its description,
  // or the environment document if created programmatically.) Return the
  // component for chaining.
  component.url = function (url) {
    if (arguments.length === 0) {
      if (this._url) {
        return this._url;
      }
      url = flexo.normalize_uri((this.parent_component &&
          this.parent_component.url()) || this.scope.$document.baseURI);
      if (this._id) {
        var u = flexo.split_uri(url);
        u.fragment = this._id;
        return flexo.unsplit_uri(u);
      }
      return url;
    }
    this._url = url;
    return this;
  };

  // Handle new link, view, property, event, and watch children for a component.
  component.append_child = function (child) {
    element.append_child.call(this, child);
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
      return child;
    }
    this.add_descendants(child);
    return child;
  };

  // Add a new property to the component, if no property with the same name was
  // already defined in the same component.
  component.add_property = function (child) {
    if (!child.init_value) {
      if (this.property_definitions.hasOwnProperty(child.name)) {
        console.error("Redefinition of property %0 in component %1"
            .fmt(child.name, this.url()));
        return;
      }
      this.property_definitions[child.name] = child;
    }
    this.define_js_property(child.name);
    if (child.bindings) {
      var set = new bender.SetProperty(child.name, child.select());
      if (typeof child.bindings[""].value === "string") {
        set.set_value_from_string(child.bindings[""].value, true, this.url());
      } else {
        set.value(child.bindings[""].value);
      }
      var watch = new bender.Watch().child(set);
      watch.bindings = true;
      Object.keys(child.bindings).forEach(function (id) {
        Object.keys(child.bindings[id]).forEach(function (prop) {
          watch.append_child(new bender.GetProperty(prop).select(id));
        });
      });
      this.append_child(watch);
    }
  };

  // Define a Javascript property to store the value of a property in a Bender
  // component’s properties object. Setting a property triggers a visit of the
  // corresponding vertex in the graph; however, a silent flag can be set to
  // prevent this (used during graph traversal.)
  component.define_js_property = function(name, value) {
    Object.defineProperty(this.properties, name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return value;
      },
      set: function (v, silent) {
        if (this.hasOwnProperty(name)) {
          this[""].scope.$that.property_definitions[name].check_value(v);
          value = v;
        } else {
          this[""].define_js_property(name, v);
        }
        if (!silent) {
          this[""].did_set_property(name, v);
        }
      }
    });
  };

  // Add a new event to the component (just declare a name.)
  // TODO give more information about the event, such as <value> children?
  component.add_event = function (child) {
    if (this.event_definitions.hasOwnProperty(child.name)) {
      console.warn("Redefinition of event %0 in component %1"
          .fmt(child.name, this.url()));
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
    var child_scope = Object.getPrototypeOf(child.scope);
    if (scope[""] && child_scope[""]) {
      $$push(scope[""], child_scope[""]);
      delete child_scope[""];
    }
    Object.keys(child_scope).forEach(function (key) {
      if (key in scope && scope[key] !== child_scope[key]) {
        console.error("Redefinition of %0 in scope".fmt(key));
      } else {
        scope[key] = child_scope[key];
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
          console.warn("Id %0 already defined in the scope of %1"
              .fmt(e._id, this.url()));
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

  // Append a new link and return the component for easy chaining.
  component.link = function (rel, href) {
    return this.child(new bender.Link(this.scope.$environment, rel, href));
  };

  // Create a new property with the given name and value (the value is set
  // directly and not interpreted in any way)
  component.property = function (name, value) {
    return this.child(new bender.Property(name).value(flexo.funcify(value)));
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

  // Add a watch to the component and return the component. If a watch is given,
  // it is append to the component. If the first argument is not a watch, then
  // the arguments list is interpreted as contents of the watch; a new watch is
  // created and appended, then all arguments are appended as children of the
  // watch.
  component.watch = function (watch) {
    if (!(watch instanceof bender.Watch)) {
      watch = new bender.Watch();
      $foreach(arguments, watch.append_child.bind(watch));
    }
    return this.child(watch);
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


  _class(bender.Link = function (environment, rel, href) {
    this.init();
    this.environment = environment;
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = href;
  }, bender.Element);


  // View of a component
  var view = _class(bender.View = function () {
    this.init();
  }, bender.Element);

  flexo._accessor(bender.View, "render_id", normalize_render_id);
  flexo._accessor(bender.View, "stack", normalize_stack);

  // Append child for view and its children; needs to keep track of components
  // that are added of child components of the current component (if any.)
  view.append_child = function (child) {
    if (child instanceof bender.Component) {
      var component = this.current_component;
      if (component) {
        component.add_child_component(child);
      }
    }
    return element.append_child.call(this, child);
  };


  _class(bender.Content = function () {
    this.init();
  }, bender.Element);


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

  // Only add text content (DOM text nodes or bender Text elements)
  attribute.append_child = function (child) {
    if (child instanceof bender.DOMTextNode || child instanceof bender.Text) {
      return element.append_child.call(this, child);
    }
  };


  // Bender Text element. Although it can only contain text, it can also have an
  // id so that it can be referred to by a watch.
  _class(bender.Text = function (text) {
    this.init();
    this._text = flexo.safe_string(text);
  }, bender.Element);

  flexo._accessor(bender.Text, "text", flexo.safe_string);


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
      var bindings = bindings_string(value);
      if (typeof bindings === "string") {
        this.attrs[ns][name] = value;
      } else {
        bindings[""].set = new bender.SetDOMAttribute(ns, name);
        var parent = this.current_component;
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
        var parent = this.current_component;
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


  _class(bender.Event = function (name) {
    this.init();
    this.name = name;
  }, bender.Element);


  var watch = _class(bender.Watch = function () {
    this.init();
    this.gets = [];
    this.sets = [];
  }, bender.Element);

  flexo._accessor(bender.Watch, "match");

  // Append Get and Set children to the respective arrays
  watch.append_child = function (child) {
    if (child instanceof bender.Get) {
      this.gets.push(child);
    } else if (child instanceof bender.Set) {
      this.sets.push(child);
    }
    return element.append_child.call(this, child);
  };


  // Base class for elements that have a value (property, get, set)
  var value_element =
    _class(bender.ValueElement = function () {}, bender.Element);

  flexo._accessor(bender.ValueElement, "as", normalize_as);
  flexo._accessor(bender.ValueElement, "select", normalize_select);
  flexo._accessor(bender.ValueElement, "match");
  flexo._accessor(bender.ValueElement, "value");

  Object.defineProperty(value_element, "is_component_value", {
    enumerable: true,
    get: function () {
      var select = this.select();
      return select === "$that" || (select && select[0] === "#");
    }
  });

  // Check that a value is set to the type of its property
  value_element.check_value = function (v) {
    var as = this.resolve_as();
    if ((as === "boolean" || as === "number" || as === "string") &&
        typeof v !== as) {
      console.warn("%0Setting property %1 to %2: expected a %3, got %4 instead."
          .fmt(this.__loc, this.name, v, as, typeof(v)));
    }
    delete this.__loc;
  };

  // Resolve the “inherit” value for `as`
  value_element.resolve_as = function () {
    var as = this.as();
    if (as !== "inherit") {
      return as;
    }
    for (var p = this.current_component; p; p = p._prototype) {
      if (p.property_definitions.hasOwnProperty(this.name)) {
        as = p.property_definitions[this.name].as();
        if (as !== "inherit") {
          return as;
        }
      }
    }
    return "dynamic";
  };

  // Set a default value depending on the as attribute
  value_element.default_value = function () {
    return flexo.funcify({
      "boolean": false,
      number: 0,
      string: "",
      dynamic: flexo.snd
    }[this.resolve_as()]);
  };

  // Set the value of an object that has a value/as pair of attributes.
  value_element.value_from_string = function (value, needs_return, loc) {
    var bindings;
    var as = this.resolve_as();
    if (as === "boolean") {
      value = flexo.is_true(value);
    } else if (as === "number") {
      value = flexo.to_number(value);
    } else {
      if (as === "json") {
        try {
          value = JSON.parse(flexo.safe_string(value));
        } catch (e) {
          console.error("%0: Could not parse “%2” as JSON".fmt(loc, value));
          value = undefined;
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
          value = new Function("$scope", "$in", value);
          push_bindings(this.current_component, this, bindings);
        } catch (e) {
          console.error("%0: Could not parse “%1” as Javascript"
              .fmt(loc, value));
          value = flexo.snd;
        }
      } else { // if (as === "string") {
        var safe = flexo.safe_string(value);
        bindings = bindings_string(safe);
        if (typeof bindings === "object") {
          this.bindings = bindings;
          value = bindings[""].value;
          push_bindings(this.current_component, this, bindings);
        } else {
          value = safe;
        }
      }
    }
    return flexo.funcify(value);
  };

  value_element.set_value_from_string = function (value, needs_return, loc) {
    this._value = this.value_from_string(value, needs_return, loc);
    delete this._value.__bindings;
    return this;
  };


  _class(bender.Property = function (name, init_value) {
    this.init();
    this.name = flexo.safe_string(name);
    this.init_value = !!init_value;
  }, bender.ValueElement);

  flexo._accessor(bender.Property, "select", normalize_property_select);


  _class(bender.Get = function () {}, bender.ValueElement);


  _class(bender.GetDOMEvent = function (type, property) {
    init_event.call(this, type);
    if (property) {
      this.property = property;
    }
  }, bender.Get);

  flexo._accessor(bender.GetDOMEvent, "stop_propagation");
  flexo._accessor(bender.GetDOMEvent, "prevent_default");


  _class(bender.GetEvent = function (type) {
    init_event.call(this, type);
  }, bender.Get);


  _class(bender.GetProperty = function (name) {
    this.init();
    this.name = name;
  }, bender.Get);


  _class(bender.GetAttribute = function (name) {
    this.init();
    this.name = name;
  }, bender.Get);


  _class(bender.Set = function () {
    this.init();
  }, bender.ValueElement);


  _class(bender.SetDOMEvent = function (type) {
    init_event.call(this, type);
  }, bender.Set);


  _class(bender.SetEvent = function (type) {
    init_event.call(this, type);
  }, bender.Set);


  _class(bender.SetDOMProperty = function (name, element) {
    this.init();
    this.name = name;
    this.element = element;
  }, bender.Set);


  _class(bender.SetProperty = function (name) {
    this.init();
    this.name = name;
  }, bender.Set);


  _class(bender.SetDOMAttribute = function (ns, name) {
    this.init();
    this.ns = ns;
    this.name = name;
  }, bender.Set);


  _class(bender.SetAttribute = function (name) {
    this.init();
    this.name = name;
  }, bender.Set);


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

  // Initializer for both Bender and DOM event properties
  function init_event(type) {
    // jshint validthis: true
    this.init();
    this.type = type;
  }

  // Make a watch for a set of bindings: add the set element created for the
  // bindings (e.g., SetDOMProperty to set the text content or SetDOMAttribute
  // to set an attribute) then a get element for each bound property.
  function make_watch_for_bindings(parent, bindings, target) {
    bindings[""].set._select = target;
    var watch = new bender.Watch()
      .child(bindings[""].set.value(bindings[""].value));
    watch.bindings = true;
    Object.keys(bindings).forEach(function (id) {
      Object.keys(bindings[id]).forEach(function (prop) {
        watch.append_child(new bender.GetProperty(prop).select(id));
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
    select = flexo.safe_trim(select).toLowerCase();
    return select === "$that" ? select : "$this";
  }

  // Normalize the `render-id` property of a view element so that it matches a
  // known value. Set to “inherit” by default, which ends up defaulting to
  // “none.”
  function normalize_render_id(render_id) {
    render_id = flexo.safe_trim(render_id).toLowerCase();
    return render_id === "class" || render_id === "id" ||
      render_id === "none" ? render_id : "inherit";
  }

  function normalize_select(select) {
    return typeof select === "string" ? select : "$this";
  }

  // Normalize the `stack` property of an element so that it matches a known
  // value. Set to “top” by default.
  function normalize_stack(stack) {
    stack = flexo.safe_trim(stack).toLowerCase();
    return stack === "bottom" || stack === "replace" ? stack : "top";
  }

  // Push a bindings object in the bindings scope of a component
  // TODO check whether the same element can be used as a target more than once
  function push_bindings(parent, element, bindings, name) {
    if (!parent || typeof bindings !== "object" ||
        element.parent instanceof bender.Get ||
        element.parent instanceof bender.Set) {
      return;
    }
    var target = "$%0".fmt(parent.scope.$environment.bindings++);
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

  // Translate bindings from Javascript code (e.g., translate `x into
  // this.properties["x"] or @foo into $scope["@foo"]), taking care of not
  // replacing anything that is quoted or between parentheses.
  function translate_bindings(value) {
    var bindings = {};
    var state = "";
    var chunk = "";
    var v = "";
    var id, prop, ch;
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
            ch = "$scope[\"" + c;
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
            ch = "$scope.$this.properties[\"";
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
      // It is OK to fall back to default after reading a backslash
      q: function (c) {
        switch (c) {
          case "'": end("", c); break;
          case "\\": escape = true;  // jshint -W086
          default: chunk += c;
        }
      },

      // Double-quoted string
      // It is OK to fall back to default after reading a backslash
      qq: function (c) {
        switch (c) {
          case '"': end("", c); break;
          case "\\": escape = true;  // jshint -W086
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

}());
