/* global bender, console, exports, flexo, global, parse_string, parse_dynamic,
   require, window */
// jshint -W097

"use strict";

if (typeof window === "object") {
  // Looks like a browser
  window.bender = {};
} else {
  // Looks like node
  global.flexo = require("flexo");
  global.bender = exports;
}

bender.VERSION = "0.8.2-pre";
bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


var _trace = false;
Object.defineProperty(bender, "TRACE", {
  enumerable: true,
  get: function () {
    return _trace && _trace !== flexo.nop;
  },
  set: function (p) {
    _trace = p ? console.log.bind(console) : flexo.nop;
  }
});
Object.defineProperty(bender, "trace", {
  enumerable: true,
  get: function () {
    return _trace;
  }
});


// Prototype for Bender elements, similar to DOM elements. There are only
// elements and no other kind of node (see the Text element for instance, which
// does have text content in addition to children; there is no equivalent of
// document or document fragment, but there is the environment defined below.)
var Element = bender.Element = {

  // Initialize an element with no parent yet and an empty list of children and
  // instances.
  init: function () {
    this.children = [];
    this.instances = [];
    return this;
  },

  // Initialize an element from an arguments object (see create_element.) All
  // elements may have an id. Important: only additional initializations are
  // performed for abstract elements; concrete elements calling this method
  // should perform their basic initialization first, using some of the
  // arguments when appropriate.
  init_with_args: function (args) {
    if (args.id) {
      this.id(args.id);
    }
    return this;
  },

  // Create a new element from a prototype and additional arguments which get
  // passed to init (e.g., Component.create(scope)). Only derived objects are
  // created: Component, DOMElement, &c.
  create: function () {
    return this.init.apply(Object.create(this), arguments);
  },

  // Instantiate the element: create a clone of the object, and update the scope
  // as we go along. Unless the shallow flag is set, instantiate children as
  // well. Note that the instance is detached: it has no parent.
  instantiate: function (scope, shallow) {
    if (!this.hasOwnProperty("instances")) {
      throw "cannot instantiate an instance";
    }
    var instance = Object.create(this);
    this.instances.push(instance);
    delete instance.parent;
    if (scope && this._id) {
      scope["@" + this._id] = instance;
    }
    if (!shallow) {
      instance.children = this.children.map(function (ch) {
        var ch_ = ch.instantiate(scope);
        ch_.parent = instance;
        return ch_;
      });
    }
    return instance;
  },

  // Remove this instance from its prototype element’s list of instances.
  uninstantiate: function (scope) {
    var proto = Object.getPrototypeOf(this);
    if (!proto || !proto.hasOwnProperty("instances")) {
      throw "cannot uninstantiate non-instance";
    }
    if (scope && this._id) {
      var id = "@" + this._id;
      if (scope[id] === this) {
        delete_from_scope(scope, id);
      }
    }
    return flexo.remove_from_array(proto.instances, this);
  },

  // Get or set the id of the element. Don’t do anything if the ID was not a
  // valid XML id.
  id: function (id) {
    if (arguments.length === 0) {
      return this._id || "";
    }
    if (!this.hasOwnProperty("instances")) {
      throw "cannot change the id of an instance";
    }
    var _id = flexo.check_xml_id(id);
    // jshint -W041
    if (_id == null) {
      console.warn("“%0” is not a valid XML ID".fmt(id));
      return this;
    }
    if (_id !== this._id) {
      remove_id_from_scope(this, this._id);
      add_id_to_scope(this, _id);
      var update = { type: "id", target: this, before: this._id };
      this._id = _id;
      this.update(update);
    }
    return this;
  },

  // Insert a child element. If no ref is given, insert at the end of the list
  // of children. If ref is a child element, add the new child before the
  // ref child. Finally, if ref is a number, add the new child at the given
  // index, before the child previously at this index. If ref is a negative
  // number, then the index is taken from the end of the list of children (-1
  // adding at the end, -2 before the last element, &c.)
  // The child element may be a Bender element, a DOM element, or a text string.
  // In the last two cases, the argument is first converted into a DOMElement or
  // a Text element before being inserted.
  // This is the method to override for different types of elements.
  insert_child: function (child, ref) {
    child = convert_node(child);
    if (child.parent) {
      if (child.parent === this) {
        throw "hierarchy error: already a child of the parent";
      }
      child.remove_self();
    }
    if (ref && typeof ref === "object") {
      if (ref.parent !== this) {
        throw "hierarchy error: ref element is not a child of the parent";
      }
      ref = this.children.indexOf(ref);
    }
    var n = this.children.length;
    var index = flexo.clamp(ref >= 0 ? ref : ref < 0 ? n + 1 + ref : n, 0, n);
    this.children.splice(index, 0, child);
    child.parent = this;
    add_ids_to_scope(child);
    this.update({ type: "add", target: child });
    return child;
  },

  // Convenience method to chain child additions; this appends a child and
  // returns the parent rather than the child.
  child: function (child) {
    return this.insert_child(child), this;
  },

  // Remove the child element child from the list of child elements.
  remove_child: function (child) {
    if (child.parent !== this) {
      throw "hierarchy error: not a child of the parent";
    }
    remove_ids_from_scope(child);
    flexo.remove_from_array(this.children, child);
    this.update({ type: "remove", target: child, parent: this });
    delete child.parent;
  },

  // Remove self from the list of child elements.
  remove_self: function () {
    if (this.parent) {
      this.parent.remove_child(this);
    }
    return this;
  },

  // Stub for rendering (for reference purposes)
  render: function (/* stack, target, ref */) {
  },

  // Notify the runtime that an update was made for this element (the runtime
  // will decide what to with it.) Updates are handled at the component level.
  update: function (args) {
    var component = this.component;
    if (component) {
      args.scope = component.scope;
      component.scope.environment.update_component(args);
    }
  },

  // Updates handler; id is only a stub so far.
  updates: {
    id: function (update) {
      console.log("Updated id of %0 from %1 to %2"
          .fmt(update.target.__id, update.before, update.target._id));
    }
  }
};

flexo.make_readonly(Element, "is_bender_element", true);
flexo.make_readonly(Element, "next_sibling", function () {
  return this.parent &&
    this.parent.children[this.parent.children.indexOf(this) + 1];
});
flexo.make_readonly(Element, "shallow_text", function () {
  return this.children.reduce(function (text, elem) {
    return text + (typeof elem.text === "function" ? elem.text() : "");
  }, "");
});
flexo.make_readonly(Element, "component", function () {
  return this.parent && this.parent.component;
});


var Component = bender.Component = flexo._ext(Element, {

  // Initialize a component from either an environment scope (if it has no
  // parent yet) or the parent component’s scope.
  // Derived components extend the property object of their prototype.
  init: function (scope) {
    this.scope = flexo._ext(get_abstract_scope(scope), {
      "@this": this,
      "#this": this,
      children: []    // child components; scope.parent is the parent component
    });
    Object.defineProperty(this.scope, "type", { value: "component" });
    this.scope.components.push(this);
    this.derived = [];
    this.own_properties = {};
    this.properties = this.properties ? Object.create(this.properties) : {};
    Object.defineProperty(this.properties, "", { value: this });
    this.events = Object.create(this.events);
    this.vertices = this.vertices ?
      { dom: Object.create(this.vertices.dom),
        event: Object.create(this.vertices.event),
        property: Object.create(this.vertices.property) } :
      { dom: {}, event: {}, property: {} };
    this.init_values = {};
    this.watches = [];
    this.links = [];
    this.on_handlers = Object.create(this.on_handlers);
    var id = flexo.random_id(3);
    this.__id = this.__id ? "%0>%1".fmt(this.__id, id) : id;
    global["$" + id] = this;
    this.__pending_render = true;
    this.__pending_init = true;
    this.__pending_ready = true;
    flexo.asap(function () {
      if (this.__pending_init) {
        delete this.__pending_init;
        this.on_handlers.init.call(this);
      }
    }.bind(this));
    return Element.init.call(this);
  },

  // Initialize a component with arguments
  init_with_args: function (args) {
    var self;
    if (args.prototype) {
      if (Object.getPrototypeOf(this) === args.prototype) {
        self = this;
      } else {
        self = args.prototype.derive(args.scope);
      }
    } else {
      self = this.init(args.scope);
    }
    return Element.init_with_args.call(self, args);
  },

  // Create a new component with this component as a prototype
  derive: function (scope) {
    var derived = Object.create(this).init(scope);
    this.derived.push(derived);
    return derived;
  },

  // Default handlers for on-init, on-instantiate, and on-render
  on_handlers: {
    init: flexo.nop,
    instantiate: flexo.nop,
    render: flexo.nop
  },

  // Set the handler for on-init/on-instantiate/on-render
  on: function (type, handler) {
    if (type in this.on_handlers && typeof handler === "function") {
      this.on_handlers[type] = handler;
    }
    return this;
  },

  // Instantiate is shallow for components. On rendering, a stack of views will
  // be created.
  instantiate: function (concrete_scope) {
    var instance = Element.instantiate.call(this, concrete_scope, true);
    var id = flexo.random_id(3);
    instance.__id = this.__id + "/" + id;
    global["$" + id] = instance;
    instance.scope = Object.create(concrete_scope);
    Object.defineProperty(instance.scope, "type", { value: "instance" });
    instance.scope["#this"] = this;
    instance.scope["@this"] = instance;
    concrete_scope.instances.push(instance);
    instance.properties = Object.create(this.properties,
        { "": { value: instance } });
    if (this.scope.parent) {
      // Recreate the parent/child relationship between instances by finding the
      // instance for the parent component, and adding the new instance as its
      // child.
      var parent_instance = flexo.find_first(concrete_scope.derived,
          function (scope) {
            return scope["#this"] === this.scope.parent;
          }, this)["@this"];
      instance.scope.parent = parent_instance;
      if (!parent_instance.scope.hasOwnProperty("children")) {
        parent_instance.scope.children = [];
      }
      parent_instance.scope.children.push(instance);
    }
    instance.scope.stack = instance.create_render_stack();
    on(this, "instantiate", instance);
    return instance;
  },

  // Create a new concrete scope from the current abstract scope. Do this only
  // for components that do not have a parent. The concrete scope gets added to
  // the list of abstract scopes, and has two additional “hidden” fields for
  // instances and derived scopes in this scope.
  create_concrete_scope: function () {
    if (this.scope.parent) {
      throw "Concrete scopes should be created from top-level components";
    }
    var abstract_scope = Object.getPrototypeOf(this.scope);
    var concrete_scope = Object.create(abstract_scope);
    Object.defineProperty(concrete_scope, "type",
        { value: "concrete", configurable: true });
    abstract_scope.concrete.push(concrete_scope);
    Object.defineProperty(concrete_scope, "instances", { value: [] });
    Object.defineProperty(concrete_scope, "derived", { value: [] });
    return concrete_scope;
  },

  // Make sure that children are added to the original component, and not the
  // instantiated component. Then handle known contents (view, property, watch,
  // &c.) accordingly.
  insert_child: function (child, ref) {
    if (!this.hasOwnProperty("children")) {
      return Object.getPrototypeOf(this).insert_child(child, ref);
    }
    child = Element.insert_child.call(this, child, ref);
    if (child.tag === "view") {
      this.add_view(child);
    } else if (child.tag === "event") {
      this.add_event(child);
    } else if (child.tag === "property") {
      this.add_property(child);
    } else if (child.tag === "link") {
      this.links.push(child);
    } else if (child.tag === "script") {
      child.apply();
    } else if (child.tag === "watch") {
      this.watches.push(child);
    }
    return child;
  },

  // Add a new event child
  add_event: function (child) {
    if (this.events.hasOwnProperty(child.name)) {
      console.error("Redefinition of event %0 in %1"
          .fmt(child.name, this.id() || this.__id));
      return;
    }
    this.events[child.name] = child;
  },

  // Add a new property child
  add_property: function (child) {
    if (this.own_properties.hasOwnProperty(child.name)) {
      console.error("Redefinition of property %0 in %1"
          .fmt(child.name, this.id() || this.__id));
      return;
    }
    this.own_properties[child.name] = child;
    define_js_property(this, child.name);
  },

  add_view: function (child) {
    if (this.scope.hasOwnProperty("view")) {
      console.error("Component %0 already has a view"
          .fmt(this.id() || this.__id));
    }
    this.scope.view = child;
    flexo.beach(child, function (ch) {
      if (ch.tag === "component") {
        add_descendant_component(this, ch);
      }
      return ch.children;
    }.bind(this));
  },

  // Load all links of a component
  load_links: function () {
    var links = [];
    for (var p = this; p.links; p = Object.getPrototypeOf(p)) {
      flexo.unshift_all(links, p.links);
    }
    return flexo.collect_promises(links.map(function (link) {
      return link.load();
    }, this)).then(flexo.self.bind(this));
  },

  // Add a new link and return the component.
  link: function (rel, href) {
    return this.child(Link.create(rel, href));
  },

  // Add an event element with that name and return the component.
  "event": function (name) {
    this.insert_child(Event.create(name));
    return this;
  },

  // Add a property element with that name and return the component.
  property: function (name) {
    this.insert_child(Property.create(name));
    return this;
  },

  // Get the view (if no argument is given), or add contents to the view,
  // creating the view if necessary.
  view: function () {
    if (arguments.length === 0) {
      return this.scope.view;
    }
    var view = this.scope.view || this.insert_child(View.create());
    flexo.foreach(arguments, insert_children.bind(null, view));
    return this;
  },

  // Get or set the URL of the component (from the XML file of its description,
  // or the environment document if created programmatically.) Return the
  // component for chaining.
  url: function (url) {
    if (arguments.length === 0) {
      if (this._url) {
        return this._url;
      }
      url = flexo.normalize_uri((this.scope.parent &&
          this.scope.parent.url()) || (this.scope.document &&
          this.scope.document.location.href));
      if (this._id) {
        var u = flexo.split_uri(url);
        u.fragment = this._id;
        return flexo.unsplit_uri(u);
      }
      return url;
    }
    this._url = url;
    return this;
  },

  updates: flexo._ext(Element.updates, {
    add: function (update) {
      update.scope.view.render_update(update);
    }
  }),

  // Pseudo-element for the ready event
  events: { "ready": { name: "ready" } }

});

flexo.make_readonly(Component, "tag", "component");
flexo.make_readonly(Component, "component", flexo.self);
flexo.make_readonly(Component, "all_instances", function () {
  return flexo.bfold(this, function (instances, component) {
    return flexo.push_all(instances, component.instances), instances;
  }, flexo.property("derived"), []);
});


// View elements are View, and elements that can occur in View, except for
// Component: DOMElement, Text, and Content.
var ViewElement = bender.ViewElement = flexo._ext(Element, {

  // All view elements may have a render-id property
  init_with_args: function (args) {
    this.renderId(args.renderId || args["render-id"]);
    return Element.init_with_args.call(this, args);
  },

  // Set the parent component of an added component
  insert_child: function (child, ref) {
    if (child.tag === "component") {
      add_descendant_component(this.component, child);
    }
    return Element.insert_child.call(this, child, ref);
  }
});

flexo._accessor(ViewElement, "renderId", normalize_renderId);


var View = bender.View = flexo._ext(bender.ViewElement, {
  init_with_args: function (args) {
    ViewElement.init_with_args.call(this.init(), args);
    if (args.stack) {
      this.stack(args.stack);
    }
    return this;
  }
});

flexo._accessor(View, "stack", normalize_stack);
flexo.make_readonly(View, "view", flexo.self);
flexo.make_readonly(View, "tag", "view");


var Content = bender.Content = flexo._ext(ViewElement, {
  init_with_args: function (args) {
    return ViewElement.init_with_args.call(this.init(), args);
  }
});

flexo.make_readonly(Content, "view", find_view);
flexo.make_readonly(Content, "tag", "content");


var DOMElement = bender.DOMElement = flexo._ext(ViewElement, {
  init: function (ns, name) {
    this.ns = ns;
    this.name = name;
    this.attrs = {};
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    ViewElement.init_with_args.call(this.init(), args);
    this.ns = args.ns;
    this.name = args.name;
    var skip = { id: true, renderId: true, "render-id": true, ns: true,
      name: true };
    this.attrs = {};
    // TODO known namespace prefixes from Flexo
    for (var p in args) {
      if (!(p in skip)) {
        this.attr("", p, args[p]);
      }
    }
    return this;
  },

  // Get or set the attribute {ns}:name. Use a null value to remove the
  // attribute.
  attr: function (ns, name, value) {
    if (arguments.length > 2) {
      var args = value === null ? delete_attribute(this, ns, name) :
        set_attribute(this, ns, name, value);
      if (args) {
        args.target = this;
        args.type = "attr";
        args.ns = ns;
        args.name = name;
        this.update(args);
      }
      return this;
    }
    return (this.attrs[ns] && this.attrs[ns][name]) || null;
  },

  unattr: function (ns, name) {
    return this.attr(ns, name, null);
  },

  updates: flexo._ext(ViewElement.updates, {
    add: function (update) {
      update.target.parent.render_update_add(update);
    },
    remove: function (update) {
      update.target.render_update_remove_self();
    },
    attr: function (update) {
      update.target.render_update_attribute(update);
    }
  })
});

flexo.make_readonly(DOMElement, "tag", "dom");
flexo.make_readonly(DOMElement, "view", find_view);


var Attribute = bender.Attribute = flexo._ext(Element, {
  init: function (ns, name) {
    this.ns = ns;
    this.name = name;
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(args.ns || "", args.name),
      args);
  },

  updates: flexo._ext(Element.updates, {
    add: function (update) {
      update.target.parent.render_update_add(update);
    },
    remove: function (update) {
      update.target.render_update_remove_self();
    }
  })
});

flexo.make_readonly(Attribute, "tag", "attribute");
flexo.make_readonly(Attribute, "view", find_view);


var Text = bender.Text = flexo._ext(Element, {
  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(), args);
  },

  instantiate: function (scope) {
    return Element.instantiate.call(this, scope, true);
  },

  text: function (text) {
    if (arguments.length === 0) {
      return this._text || "";
    }
    text = flexo.safe_string(text);
    this.bindings = {};
    var f = parse_string(text, this.bindings);
    this._text = Object.keys(this.bindings).length === 0 ? text : f;
    this.update({ type: "text", target: this });
    return this;
  },

  updates: flexo._ext(ViewElement.updates, {
    add: function (update) {
      update.target.parent.render_update_add(update);
    },
    remove: function (update) {
      update.target.render_update_remove_self();
    },
    text: function (update) {
      update.target.render_update_text();
    }
  })
});

flexo.make_readonly(Text, "view", find_view);
flexo.make_readonly(Text, "tag", "text");


// Links to scripts and stylesheets
var Link = bender.Link = flexo._ext(Element, {
  init: function (rel, href) {
    Object.defineProperty(this, "rel", {
      enumerable: true,
      value: flexo.safe_trim(rel).toLowerCase()
    });
    Object.defineProperty(this, "href", {
      enumerable: true,
      value: flexo.safe_string(href)
    });
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(args.rel, args.href), args);
  },

  // Load links according to their rel attribute. If a link requires delaying
  // the rest of the loading, return a promise then fulfill it with a value to
  // resume loading (see script rendering in render.js)
  load: function () {
    var component = this.component;
    if (!component) {
      console.warn("cannot load link: no environment.");
    }
    var env = component.scope.environment;
    var url = flexo.normalize_uri(component.url(), this.href);
    if (env.urls[url]) {
      return env.urls[url];
    }
    env.urls[url] = this;
    var load = this.load[this.rel];
    if (typeof load === "function") {
      return load.call(this, url, component);
    }
    console.warn("cannot load “%0” link (unsupported value for rel)"
        .fmt(this.rel));
  }
});

flexo.make_readonly(Link, "tag", "link");


// Inline elements (script, style) similar to links. Can be applied only once.
var InlineElement = bender.InlineElement = flexo._ext(Element, {
  init: function () {
    this.__pending = true;
    return Element.init.call(this);
  },

  // Set the text content of the element, but warn if the script is no longer
  // pending. No update is generated of course.
  text: function (text) {
    if (arguments.length === 0) {
      return this._text || "";
    }
    if (!this.__pending) {
      console.warn("updating applied %0.".fmt(this.tag));
    }
    this._text = flexo.safe_string(text);
    // No update notification
    return this;
  },

  // Stub for applying (for documentation purposes)
  apply: flexo.nop
});

// Inline scripting. A script element has text content and is executed once.
var Script = bender.Script = flexo._ext(InlineElement, {
  // Run the script with the given arguments and the component as `this`,
  // clearing the pending flag. Exceptions are caught.
  apply: function () {
    if (!this.__pending) {
      return;
    }
    delete this.__pending;
    try {
      // jshint -W054
      new Function(this.text()).apply(this.component, arguments);
    } catch (e) {
      console.error("could not run script:", e);
    }
    return this;
  }
});

flexo.make_readonly(Script, "tag", "script");


// Inline style element—apply depends on the rendering so it is left out.
var Style = bender.Style = Object.create(InlineElement);
flexo.make_readonly(Style, "tag", "style");


var Watch = bender.Watch = flexo._ext(Element, {
  init: function () {
    this.gets = [];
    this.sets = [];
    return Element.init.call(this);
  },

  insert_child: function (child, ref) {
    child = Element.insert_child.call(this, child, ref);
    if (child.tag === "get") {
      this.gets.push(child);
    } else if (child.tag === "set") {
      this.sets.push(child);
    }
  }
});

flexo.make_readonly(Watch, "tag", "watch");


// Elements that have a value, as text content or as a value attribute. This
// means property, gets and sets.
var ValueElement = bender.ValueElement = flexo._ext(Element, {
  resolve_as: function () {
    var as = this.as();
    if (as !== "inherit") {
      return as;
    }
    for (var p = this.component; p.hasOwnProperty("own_properties");
      p = Object.getPrototypeOf(p)) {
      if (p.own_properties.hasOwnProperty(this.name)) {
        as = p.own_properties[this.name].as();
        if (as !== "inherit") {
          return as;
        }
      }
    }
    return "dynamic";
  },

  // Set the value of an object that has a value/as pair of attributes.
  value_from_string: function (value, needs_return, loc) {
    var as = this.resolve_as();
    if (as === "boolean") {
      value = flexo.is_true(value);
    } else if (as === "number") {
      value = flexo.to_number(value);
    } else {
      if (as === "json") {
        try {
          value = JSON.parse(value);
        } catch (e) {
          console.error("%0: Could not parse “%2” as JSON".fmt(loc, value));
          value = undefined;
        }
      } else if (as === "dynamic") {
        value = parse_dynamic(value, needs_return, this.bindings, loc);
      } else { // if (as === "string") {
        value = parse_string(value, this.bindings, loc);
      }
    }
    return flexo.funcify(value);
  }

});

flexo._accessor(ValueElement, "select", normalize_select);
flexo._accessor(ValueElement, "as", normalize_as);
flexo._accessor(ValueElement, "delay", normalize_delay);
flexo._accessor(ValueElement, "match", flexo.funcify(true));
flexo._accessor(ValueElement, "value", flexo.snd);


// Base for all get elements
var Get = bender.Get = Object.create(ValueElement);
flexo.make_readonly(Get, "tag", "get");


// Get a DOM event according to its type, on behalf of a property of the target
// or the target itself.
var GetDOMEvent = bender.GetDOMEvent = flexo._ext(Get, {
  init: function (type, property) {
    this.type = flexo.safe_trim(type);  // dom-event attribute in XML
    if (property) {
      this.property = flexo.safe_trim(property);
    }
    return Get.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.type, args.property), args);
  }
});

flexo._accessor(bender.GetDOMEvent, "stopPropagation", normalize_boolean);
flexo._accessor(bender.GetDOMEvent, "preventDefault", normalize_boolean);


// Get a Bender event
var GetEvent = bender.GetEvent = flexo._ext(Get, {
  init: function (type) {
    this.type = flexo.safe_trim(type);  // event attribute in XML
    return Get.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.type), args);
  }
});


// Get a Bender property
var GetProperty = bender.GetProperty = flexo._ext(Get, {
  init: function (name) {
    this.name = flexo.safe_trim(name);  // property attribute in XML
    return Get.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.name), args);
  }
});


// Get a Bender Attribute
var GetAttribute = bender.GetAttribute = flexo._ext(Get, {
  init: function (name) {
    this.name = flexo.safe_trim(name);  // attr attribute in XML
    return Get.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.name), args);
  }
});


var Set = bender.Set = Object.create(ValueElement);
flexo.make_readonly(bender.Set, "tag", "set");


// Set a DOM event
var SetDOMEvent = bender.SetDOMEvent = flexo._ext(bender.Set, {
  init: function (type, property) {
    this.type = flexo.safe_trim(type);  // dom-event attribute in XML
    if (property) {
      this.property = property;
    }
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.type, args.property), args);
  }
});


// Set a Bender event
var SetEvent = bender.SetEvent = flexo._ext(bender.Set, {
  init: function (type) {
    this.type = flexo.safe_trim(type);  // event attribute in XML
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.type), args);
  }
});


// Set a DOM property
var SetDOMProperty = bender.SetDOMProperty = flexo._ext(bender.Set, {
  init: function (name) {
    this.name = flexo.safe_trim(name);  // dom-property attribute in XML
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.name), args);
  }
});


// Set a Bender property
var SetProperty = bender.SetProperty = flexo._ext(bender.Set, {
  init: function (name) {
    this.name = flexo.safe_trim(name);  // property attribute in XML
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.name), args);
  }
});


// Set a DOM attribute
var SetDOMAttribute = bender.SetDOMAttribute = flexo._ext(bender.Set, {
  init: function (ns, name) {
    this.ns = flexo.safe_trim(ns);
    this.name = flexo.safe_trim(name);  // dom-attr attribute in XML
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.ns, args.name), args);
  }
});


var SetAttribute = bender.SetAttribute = flexo._ext(bender.Set, {
  init: function (name) {
    this.name = flexo.safe_trim(name);  // attr attribute in XML
    return bender.Set.init.call(this);
  },

  init_with_args: function (args) {
    return Get.init_with_args.call(this.init(args.name), args);
  }
});


var Event = bender.Event = flexo._ext(Element, {
  init: function (name) {
    this.name = name;
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(args.name), args);
  },
});

flexo.make_readonly(Event, "tag", "event");


var Property = bender.Property = flexo._ext(ValueElement, {
  init: function (name) {
    this.name = name;
    this.bindings = {};
    return ValueElement.init.call(this);
  },

  init_with_args: function (args) {
    return ValueElement.init_with_args.call(this.init(args.name), args);
  },

});

flexo.make_readonly(Property, "tag", "property");
flexo._accessor(Property, "select", function (select) {
  return flexo.safe_trim(select).toLowerCase === "#this" ? "#this" : "@this";
});


// An environment in which to render Bender components.
var Environment = bender.Environment = {

  // Initialize the environment with a top-level scope.
  init: function () {
    this.scope = { environment: this };
    Object.defineProperty(this.scope, "type", { value: "environment",
      configurable: true });
    this.components = [];
    this.urls = {};
    return this;
  },

  // Add a component (creating it if necessary) to this environment. If the
  // component was already in the environment, create a derived component with
  // the environment scope.
  component: function (component) {
    if (!component) {
      component = Component.create(this.scope);
    } else if (component.scope.environment !== this) {
      throw "hierarchy error: component from a different environment";
    } else if (this.components.indexOf(component) >= 0) {
      component = component.derive(this.scope);
    }
    return this.components.push(component), component;
  },

  remove_component: function (component) {
    if (component.scope.environment !== this) {
      throw "hierarchy error: component from a different environment";
    }
    // TODO unrender
    return flexo.remove_from_array(component);
  },

  // Push an update to the update queue, creating the queue if necessary.
  update_component: function (update) {
    if (update.scope["@this"].__pending_render) {
      return;
    }
    if (!this.update_queue) {
      this.update_queue = [];
      flexo.asap(this.flush_update_queue.bind(this));
    }
    this.update_queue.push(update);
  },

  // Flush the update queue
  flush_update_queue: function () {
    var queue = this.update_queue.slice();
    delete this.update_queue;
    for (var i = 0, n = queue.length; i < n; ++i) {
      var update = queue[i];
      var f = update.target.updates && update.target.updates[update.type];
      if (typeof f === "function") {
        f(update);
      }
    }
  },

  // Convenience method to create Bender elements by their tag name, with
  // optional arguments and child contents. An id can also be given as part of
  // the tag name, with a # separator (e.g., "component#foo".)
  $: function (tag, args) {
    var index = 2;
    if (typeof args !== "object" || Array.isArray(args) ||
        args.is_bender_element ||
        (flexo.browserp && args instanceof window.Node)) {
      args = {};
      index = 1;
    }
    var t = tag.split("#");
    if (t[1]) {
      args.id = t[1];
    }
    if (t[0] === "component") {
      args.scope = this.scope;
    }
    var elem = Object.create(bender[flexo.ucfirst(t[0])]).init_with_args(args);
    for (var i = index, n = arguments.length; i < n; ++i) {
      insert_children(elem, arguments[i]);
    }
    return elem;
  },

  $text: function () {
    var text = "";
    var args = flexo.filter(arguments, function (arg) {
      if (typeof arg === "string") {
        text += arg;
        return false;
      }
      return true;
    });
    args.unshift("text");
    return this.$.apply(this, args).text(text);
  }

};

// Create a new environment
bender.environment = function () {
  return Object.create(bender.Environment).init();
};

// Shortcuts for the $ function: env.$foo === env.$("foo")
// (note that $text is handled differently, see above.)
["attribute", "component", "content", "get", "link", "script", "set", "style",
  "view", "watch"].forEach(function (tag) {
  Environment["$" + tag] = function () {
    var args = [tag];
    flexo.push_all(args, arguments);
    return this.$.apply(this, args);
  };
});

// Create DOMElement from known HTML tags.
// TODO get all elements from flexo; skip the ones that are defined above.
["p", "div"].forEach(function (tag) {
  Environment["$" + tag] = function (args) {
    var args_ = ["DOMElement"];
    if (typeof args !== "object" || Array.isArray(args) ||
        args.is_bender_element ||
        (flexo.browserp && args instanceof window.Node)) {
      args = {};
      args_.push(args);
    }
    args.ns = flexo.ns.html;
    args.name = tag;
    flexo.push_all(args_, arguments);
    return this.$.apply(this, args_);
  };
});


// Add a descendant component to a component. This is called when adding a child
// to a view, or adding a view to a component (where all component descendants
// of the view are added.) When adding a child component, the scope of the child
// is updated to extend the abstract scope of the component (so that both have
// the same abstract scope.) Note that when adding to a view the view may not be
// in a component yet, so `component` may be undefined. In this case, there is
// no effect.
// TODO adding components to instance (mutation)
function add_descendant_component(component, descendant) {
  if (!component) {
    return;
  }
  // Merge the abstract scopes
  var parent_scope = Object.getPrototypeOf(component.scope);
  var descendant_scope = Object.getPrototypeOf(descendant.scope);
  Object.keys(descendant_scope).forEach(function (key) {
    if (key in parent_scope && parent_scope[key] !== descendant_scope[key]) {
      console.error("Redefinition of %0 in scope".fmt(flexo.quote(key)));
    } else {
      parent_scope[key] = descendant_scope[key];
    }
  });
  // Replace the component and concrete prototypes of all the descendant scopes
  descendant_scope.components.forEach(function (component) {
    component.scope = flexo.replace_prototype(parent_scope, component.scope);
    parent_scope.components.push(component);
  });
  descendant_scope.concrete.forEach(function (scope) {
    parent_scope.concrete.push(flexo.replace_prototype(parent_scope, scope));
  });
  // Set the parent/child link if necessary
  if (!descendant.scope.parent) {
    descendant.scope.parent = component;
    component.scope.children.push(descendant);
  }
}

function add_id_to_scope(element, id) {
  var component = element.component;
  if (component) {
    var scope = Object.getPrototypeOf(component.scope);
    scope["#" + id] = element;
    scope["@" + id] = element;
  }
}


function add_ids_to_scope(root) {
  var component = root.component;
  if (component) {
    flexo.beach(root, function (element) {
      if (element._id) {
        var scope = Object.getPrototypeOf(component.scope);
        scope["@" + element._id] = element;
        if (component.hasOwnProperty("instances")) {
          scope["#" + element._id] = element;
        }
      }
      return element.children;
    });
  }
}

// TODO review this and make sure that IDs are removed from the right scope
// (i.e. top-component scope)
function remove_ids_from_scope(root) {
  var component = root.component;
  if (component) {
    var ids = flexo.bfold(root, function (ids, element) {
      if (element._id) {
        ids.push(element._id);
      }
      return ids;
    }, flexo.property("children"), []);
    var instances = component.all_instances;
    instances.push(component);
    instances.forEach(function (instance) {
      ids.forEach(function (id) {
        delete instance.scope["@" + id];
        delete instance.scope["#" + id];
      });
    });
  }
}

function delete_from_scope(scope, id) {
  if (id in scope) {
    while (!scope.hasOwnProperty(id)) {
      scope = Object.getPrototypeOf(scope);
    }
    delete scope[id];
  }
}

function convert_node(node) {
  if (node.nodeType) {
    return convert_dom_node(node);
  }
  if (typeof node === "string") {
    return Text.create().text(node);
  }
  return node;
}

function convert_dom_node(node) {
  if (node.nodeType === window.Node.ELEMENT_NODE) {
    var elem = DOMElement.create(node.namespaceURI, node.localName);
    for (var i = 0, n = node.attributes.length; i < n; ++i) {
      var attr = node.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns === "" && attr.localName === "id") {
        elem.id(attr.value);
      } else {
        elem.attr(ns, attr.localName, attr.value);
      }
    }
    for (i = 0, n = node.childNodes.length; i < n; ++i) {
      var ch = convert_dom_node(node.childNodes[i]);
      if (ch) {
        elem.insert_child(ch);
      }
    }
    return elem;
  } else if (node.nodeType === window.Node.TEXT_NODE ||
      node.nodeType === window.Node.CDATA_SECTION_NODE) {
    return Text.create().text(node.textContent);
  }
}

// Define a Javascript property to store the value of a property in a Bender
// component’s properties object. Setting a property triggers a visit of the
// corresponding vertex in the graph; however, a silent flag can be set to
// prevent this (used during graph traversal.)
function define_js_property(component, name, value) {
  Object.defineProperty(component.properties, name, {
    enumerable: true,
    configurable: true,
    get: function () {
      return value;
    },
    set: function (v, silent) {
      if (this.hasOwnProperty(name)) {
        // this[""].own_properties[name].check_value(v);
        value = v;
      } else {
        define_js_property(this[""], name, v);
      }
      if (!silent) {
        this[""].did_set_property(name, v);
      }
    }
  });
}

// Delete the attribute {ns}name from elem; return an empty object (no value)
// if the attribute was actually deleted
function delete_attribute(elem, ns, name) {
  if (elem.attrs.hasOwnProperty(ns) && elem.attrs[ns].hasOwnProperty(name)) {
    delete elem.attrs[ns][name];
    if (Object.keys(elem.attrs[ns]).length === 0) {
      delete elem.attrs[ns];
    }
    return {};
  }
}

// Implementation of the view property for view elements and elements in views
// (Text and Attribute.)
function find_view() {
  // jshint -W040
  return this.parent && this.parent.view;
}

// Get or create the abstract scope for a component scope. An abstract scope has
// two “hidden” fields for components within the scope (the scope of which all
// derive from this abstract scope) and concrete scopes deriving from this
// scope.
function get_abstract_scope(scope) {
  var abstract_scope = scope.hasOwnProperty("environment") ?
    Object.create(scope) : scope;
  if (!abstract_scope.hasOwnProperty("components")) {
    Object.defineProperty(abstract_scope, "type",
        { value: "abstract", configurable: true });
    Object.defineProperty(abstract_scope, "components",
        { value: [], configurable: true });
    Object.defineProperty(abstract_scope, "concrete", { value: [] });
  }
  return abstract_scope;
}

// Insert children into an element; this can handle a single as well as a list
// of children
function insert_children(elem, children) {
  if (Array.isArray(children)) {
    children.forEach(insert_children.bind(null, elem));
  } else {
    elem.insert_child(children);
  }
}

// Remove the id (if any) from the element’s component’s abstract scope.
function remove_id_from_scope(element, id) {
  if (id) {
    var component = element.component;
    if (component) {
      delete Object.getPrototypeOf(component.scope)["#" + id];
    }
  }
}

// Normalize the `as` property of an element so that it matches a known value.
// Set to “dynamic” by default.
function normalize_as(as) {
  as = flexo.safe_trim(as).toLowerCase();
  return as === "string" || as === "number" || as === "boolean" ||
    as === "json" || as === "dynamic" ? as : "inherit";
}

// Normalize a boolean attribute
function normalize_boolean(attr) {
  return flexo.is_true(flexo.safe_string(attr));
}

// Normalize the `delay` property of an element so that it matches a legal value
// (a number of milliseconds >= 0, “never”, “none”, or the empty string by
// default.)
function normalize_delay(delay) {
  delay = flexo.safe_trim(delay).toLowerCase();
  var d = flexo.to_number(delay);
  return d >= 0 ? d : delay === "never" ? Infinity : "none";
}

// Normalize the render-id/renderId attribute
function normalize_renderId(renderId) {
  renderId = flexo.safe_trim(renderId).toLowerCase();
  return renderId === "class" || renderId === "id" || renderId === "none" ?
    renderId : "inherit";
}

// Normalize the select attribute, defaulting to "@this"
function normalize_select(select) {
  return typeof select === "string" && select || "@this";
}

// Normalize the stack attribute
function normalize_stack(stack) {
  stack = flexo.safe_trim(stack).toLowerCase();
  return stack === "bottom" || stack === "replace" ? stack : "top";
}

function on(component, type) {
  if (component.__pending_init) {
    delete component.__pending_init;
    component.on_handlers.init.call(component);
  }
  component.on_handlers[type].apply(component, flexo.slice(arguments, 2));
}

// Set the attribute {ns}name to value on the element
function set_attribute(elem, ns, name, value) {
  if (!elem.attrs.hasOwnProperty(ns)) {
    elem.attrs[ns] = {};
  }
  if (!elem.attrs[ns].hasOwnProperty(name) || elem.attrs[ns][name] !== value) {
    elem.attrs[ns][name] = value;
    return { value: value };
  }
}
