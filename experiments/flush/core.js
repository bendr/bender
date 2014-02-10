/* global bender, console, exports, flexo, global, parse_dynamic, parse_string,
   require, window */
// jshint -W097

"use strict";

if (typeof window === "object") {
  // Looks like a browser, define the bender object acting as namespace
  window.bender = {};
} else {
  // Looks like node so require flexo and alias `exports`
  global.flexo = require("flexo");
  global.bender = exports;
}

bender.VERSION = "0.9.0";
bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


// Use bender.trace() for conditional trace messages; set bender.TRACE to true
// to enable tracing (set to false by default.)
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


// The global scope for components to inherit from
var Scope = bender.Scope = {};
Object.defineProperty(Scope, "type", { value: "global", configurable: true });
Object.defineProperty(Scope, "urls", { value: {} });


// Base for Bender objects (element, component)
var Base = bender.Base = {
  // Initialize a base object with no parent, an empty list of children, and an
  // empty list of instances.
  init: function () {
    this.instances = [];
    this.children = [];
    return this;
  },

  // Helper function to create objects, so that one can write X.create(...)
  // instead of Object.create(X).init(...)
  create: function () {
    return this.init.apply(Object.create(this), arguments);
  },

  // Get or set the id of the component or element. Don’t do anything if the ID
  // was not a valid XML id, or if it was the reserved keyword “this”.
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
    } else if (_id === "this") {
      console.warn("“this” is a reserved ID");
    } else {
      this._id = _id;
    }
    return this;
  },

  // Instantiate a base object.
  instantiate: function () {
    if (!this.hasOwnProperty("instances")) {
      throw "Cannot instantiate instance";
    }
    var instance = Object.create(this);
    this.instances.push(instance);
    return instance;
  },

};


// Component
var Component = bender.Component = flexo._ext(Base, {

  // Initialize a new component. The scope should be either a global scope for a
  // Bender component, or a component scope for the parent of the component.
  init: function (scope) {
    var abstract_scope = scope && scope.hasOwnProperty("#this") ?
      Object.getPrototypeOf(scope) :
      Object.create(scope || Scope, {
        type: { value: "abstract", configurable: true }
      });
    this.scope = Object.create(abstract_scope, {
      type: { value: "component" },
      "#this": { value: this, enumerable: true },
      "@this": { value: this, enumerable: true }
    });
    this.styles = [];
    this.scripts = [];
    this.links = [];
    this.events = {};
    this.own_properties = {};
    this.init_values = {};
    this.watches = [];
    this._view = View.create();
    this._view._component = this;
    this.properties = create_properties(this);
    this.vertices = this.vertices ?
      { event: Object.create(this.vertices.event),
        property: Object.create(this.vertices.property) } :
      {  event: {}, property: {} };
    if (scope && scope.hasOwnProperty("#this")) {
      this.parent = scope["#this"];
      this.parent.children.push(this);
    }
    this.__pending_finalize = true;
    return Base.init.call(this);
  },

  // Create a concrete for an instance from the parent scope
  create_concrete_scope: function (parent) {
    return parent ?
      Object.getPrototypeOf(parent.scope) :
      Object.create(this.scope, {
        type: { value: "concrete", configurable: true },
        derived: { value: [] }
      });
  },

  did_set_property: flexo.nop,

  // Finalize the component: setup scope and relationships
  finalize: function () {
    if (this.__pending_finalize) {
      delete this.__pending_finalize;
      flexo.beach_all(this._view.children.slice(), function (element) {
        if (flexo.instance_of(element, View)) {
          var child = element.component.finalize();
          child.parent = this;
          this.children.push(child);
          this.add_element_to_scope(child);
          // don’t go deeper; IDs are added when the child is finalized.
        } else {
          this.add_element_to_scope(element);
          return element.children;
        }
      }, this);
    }
    return this;
  },

  // Instantiate a component.
  instantiate: function (parent) {
    var instance = Base.instantiate.call(this);
    var concrete_scope = this.create_concrete_scope(parent);
    instance.scope = Object.create(concrete_scope, {
      type: { value: "instance" },
      "#this": { value: this, enumerable: true },
      "@this": { value: instance, enumerable: true }
    });
    instance.properties = create_properties(instance);
    instance._view = this._view.instantiate(concrete_scope);
    if (parent) {
      instance.parent = parent;
      parent.children.push(instance);
    }
    return instance;
  },

  // Set the handler for on-init/on-instantiate/on-render
  // TODO
  on: function (/*type, handler*/) {
    return this;
  },

  // Add a link to the component
  link: function (rel, href) {
    this.links.push(Link.create(rel, href, this));
  },

  // Get a property definition (when called with a single argument) or add a
  // property and return the component
  property: function (property, args) {
    if (!args) {
      if (flexo.instance_of(property, Property)) {
        if (this.own_properties.hasOwnProperty(property.name)) {
          console.warn("Property “%0” is already defined".fmt(property.name));
          return;
        }
        if (property.component && property.component !== this) {
          throw "Property already in a component";
        }
        this.own_properties[property.name] = property;
        property.component = this;
        define_js_property(this, property.name);
        return this;
      } else {
        return this.own_properties[property];
      }
    }
    property = Property.create(property, this)
      .as(args.as)
      .delay(args.delay)
      .select(args.select);
    if (args.hasOwnProperty("match")) {
      property.match(args.match);
    } else if (args.hasOwnProperty("match_string")) {
      property.match(args.match_string);
    }
    if (args.hasOwnProperty("value")) {
      property.value(args.value);
    } else if (args.hasOwnProperty("value_string")) {
      property.value(args.value_string);
    }
    return this.property(property);
  },

  // Add an inline script element to the component
  script: function (text) {
    this.styles.push(Script.create(text, this));
  },

  // Add an inline style element to the component
  style: function (text) {
    this.styles.push(Style.create(text, this));
  },

  // Default title for a component
  title: function (title) {
    if (arguments.length === 0) {
      if (!this._title) {
        var prototype = Object.getPrototypeOf(this);
        if (prototype && prototype.title) {
          return prototype.title();
        }
      }
      return this._title;
    }
    this._title = flexo.safe_trim(title);
  },

  // Get or set the URL of the component (from the XML file of its description,
  // or the environment document if created programmatically.) Return the
  // component for chaining.
  url: function (url) {
    if (arguments.length === 0) {
      if (!this._url) {
        url = flexo.normalize_uri((this.parent && this.parent.url()) ||
            (this.scope.document && this.scope.document.location.href));
        if (this._id) {
          var u = flexo.split_uri(url);
          u.fragment = this._id;
          return flexo.unsplit_uri(u);
        }
        this._url = url;
      }
      return this._url;
    }
    this._url = url;
    return this;
  },

  // Return the view when called with no arguments; otherwise add contents to
  // the view and return the component. If the first and only argument is a view
  // element, it becomes the view of this component (as long as its view had no
  // contents yet.)
  view: function (view) {
    if (arguments.length === 0) {
      return this._view;
    }
    if (arguments.length === 1 && flexo.instance_of(view, View)) {
      if (this._view.children.length > 0) {
        console.warn("Cannot replace non-empty view");
      }
      return this.view.apply(this, view.children)
    } else {
      flexo.foreach(arguments, function (argument) {
        delete argument.parent;
        this._view.insert_child(argument);
      }, this);
    }
    return this;
  },

  // Add a new watch with the given contents
  watch: function () {
    var watch = Watch.create(this);
    flexo.foreach(arguments, function (argument) {
      if (flexo.instance_of(argument, Get)) {
        watch.get(argument);
      } else if (flexo.instance_of(argument, bender.Set)) {
        watch.set(argument);
      }
    });
    this.watches.push(watch);
    return this;
  },

  // Add the element
  add_element_to_scope: function (element) {
    var id = element.id();
    if (id) {
      var scope = Object.getPrototypeOf(this.scope);
      scope["@" + id] = element;
      if (this.hasOwnProperty("instances")) {
        scope["#" + id] = element;
      }
    }
    return element;
  }

});

// Get the prototype component, if any; not the prototype object.
flexo.make_readonly(Component, "prototype", function () {
  var p = Object.getPrototypeOf(this);
  return p.instances && p;
});


// Bender view element hierarchy:
// + Element (all view elements)
//   + ViewElement (view and view contents)
//     + View <view>
//     + Content <content>
//     + DOMElement (foreign element)
//   + Attribute <attribute>
//   + Text <text>


// Prototype for Bender elements, similar to DOM elements. There are only
// elements and no other kind of node (see the Text element for instance, which
// does have text content in addition to children; there is no equivalent of
// document or document fragment, but there is the environment defined below.)
var Element = bender.Element = flexo._ext(Base, {

  // Initialize an element from an arguments object (see create_element.) All
  // elements may have an id. Important: only additional initializations are
  // performed for abstract elements; concrete elements calling this method
  // should perform their basic initialization first, using some of the
  // arguments when appropriate.
  init_with_args: function (args) {
    return this.id(args.id);
  },

  // Instantiate the element: create a clone of the object using Object.create.
  // A scope is necessary for deep instantiation of elements that may contain a
  // component descendant, and the scope is also updated when the element has an
  // id. The instance is attached to its new parent `parent`.
  instantiate: function (scope, parent) {
    var instance = Base.instantiate.call(this);
    var id = this.id();
    if (id) {
      scope["@" + id] = instance;
    }
    instance.parent = parent;
    instance.children = this.children.map(function (ch) {
      return ch.instantiate(scope, instance);
    });
    return instance;
  },

  // Insert a child element. If no ref is given, insert at the end of the list
  // of children. If ref is a child element, add the new child before the
  // ref child. Finally, if ref is a number, add the new child at the given
  // index, before the child previously at this index. If ref is a negative
  // number, then the index is taken from the end of the list of children (-1
  // adding at the end, -2 before the last element, &c.)
  // The child element may be a Bender element, a component, a DOM element, or a
  // text string. In the last two cases, the argument is first converted into a
  // DOMElement or a Text element before being inserted. In the case of a
  // component, the view gets added.
  insert_child: function (child, ref) {
    child = convert_node(child);
    if (!child) {
      throw "cannot add a non-Bender element";
    }
    if (flexo.instance_of(child, Component)) {
      child = child.view();
    }
    if (child.parent) {
      throw "cannot remove child from parent yet";
      // TODO check parent: remove child from its previous parent
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
    return child;
  },

  // Convenience method to chain child additions; this appends a child and
  // returns the parent rather than the child.
  child: function (child) {
    return this.insert_child(child), this;
  },
});

// Shallow text is the concatenation of the text value of all children, skipping
// non-text elements.
flexo.make_readonly(Element, "shallow_text", function () {
  return this.children.reduce(function (text, elem) {
    return text + (typeof elem.text === "function" ? elem.text() : "");
  }, "");
});

// Component in which the element occurs (if any.)
flexo.make_readonly(Element, "component", function () {
  return this.parent && this.parent.component;
});


// View elements are View, and elements that can occur in View, except for
// Component: DOMElement, Text, and Content.
var ViewElement = bender.ViewElement = flexo._ext(Element, {
  // All view elements may have a render-id property
  init_with_args: function (args) {
    this.renderId(args.renderId || args["render-id"]);
    return Element.init_with_args.call(this, args);
  }
});

flexo._accessor(ViewElement, "renderId", normalize_renderId);


var View = bender.View = flexo._ext(bender.ViewElement, {
  init_with_args: function (args) {
    return ViewElement.init_with_args.call(this.init(), args);
  }
});

flexo.make_readonly(View, "component", function () {
  return this._component;
});


var Content = bender.Content = flexo._ext(ViewElement, {
  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(), args);
  }
});


var DOMElement = bender.DOMElement = flexo._ext(ViewElement, {
  init: function (ns, name) {
    this.ns = ns;
    this.name = name;
    this.attrs = {};
    this.vertices = this.vertices ?
      { event: Object.create(this.vertices.event),
        property: Object.create(this.vertices.property) } :
      {  event: {}, property: {} };
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    this.init(args.ns || "", args.name);
    var skip = { id: true, renderId: true, "render-id": true, ns: true,
      name: true };
    // TODO known namespace prefixes from Flexo
    for (var p in args) {
      if (!(p in skip)) {
        this.attr("", p, args[p]);
      }
    }
    return ViewElement.init_with_args.call(this, args);
  },

  // Get or set the attribute {ns}:name. Use a null value to remove the
  // attribute.
  attr: function (ns, name, value) {
    if (arguments.length > 2) {
      return value === null ? delete_attribute(this, ns, name) :
        set_attribute(this, ns, name, value);
    }
    return (this.attrs[ns] && this.attrs[ns][name]) || null;
  },

  unattr: function (ns, name) {
    return this.attr(ns, name, null);
  }
});


var Attribute = bender.Attribute = flexo._ext(Element, {
  init: function (ns, name) {
    this.ns = flexo.safe_string(ns);
    this.name = flexo.safe_string(name);
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    return Element.init_with_args.call(this.init(args.ns || "", args.name),
      args);
  }
});


var Text = bender.Text = flexo._ext(Element, {
  init_with_args: function (args) {
    this._text = flexo.safe_string(args.text);
    return Element.init_with_args.call(this.init(), args);
  },

  text: function (text) {
    if (arguments.length === 0) {
      return this._text || "";
    }
    text = flexo.safe_string(text);
    // TODO bindings
    // this.bindings = {};
    // var f = parse_string(text, this.bindings);
    // this._text = Object.keys(this.bindings).length === 0 ? text : f;
    this._text = text;
    return this;
  }
});

bender.$text = function (text) {
  return Text.create().text(text);
};


var Value = bender.Value = {
  init: flexo.self,
  create: Base.create,

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

  // Check that a value is set to the type of its property
  check_value: function (v) {
    var as = this.resolve_as();
    if ((as === "boolean" || as === "number" || as === "string") &&
        typeof v !== as) {
      console.warn(("Setting property `%0 to “%1”: expected %2, but " +
          "got %3 instead").fmt(this.name, v, as, typeof(v)));
    }
  },

  // Set the value of an object that has a value/as pair of attributes.
  value_from_string: function (value, needs_return) {
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
          console.error("Could not parse “%1” as JSON".fmt(value));
          value = undefined;
        }
      } else if (as === "dynamic") {
        value = parse_dynamic(value, needs_return, this.bindings);
      } else {
        value = parse_string(value, this.bindings);
      }
    }
    return flexo.funcify(value);
  }

};

flexo._accessor(Value, "select", normalize_select);
flexo._accessor(Value, "as", normalize_as);
flexo._accessor(Value, "delay", normalize_delay);
flexo._accessor(Value, "match", flexo.funcify(true), true);
flexo._accessor(Value, "value", flexo.snd, true);


// Property definition
var Property = bender.Property = flexo._ext(Value, {
  init: function (name, component) {
    this.name = name;
    this.bindings = {};
    this.component = component;
    return this;
  },
});

flexo._accessor(Property, "select", function (select) {
  return flexo.safe_trim(select).toLowerCase() === "#this" ? "#this" : "@this";
});


var Get = bender.Get = flexo._ext(Value, {
  init: function (watch) {
    this.watch = watch;
    return this;
  }
});

flexo._accessor(Get, "property", flexo.safe_trim);


var GetEvent = bender.GetEvent = flexo._ext(Get, {
  init: function (type, watch) {
    this.type = flexo.safe_trim(type);
    return Get.init.call(this, watch);
  }
});


var GetProperty = bender.GetProperty = flexo._ext(Get);


bender.Set = flexo._ext(Value, {});

flexo._accessor(bender.Set, "property", flexo.safe_trim);


var SetEvent = bender.SetEvent = flexo._ext(bender.Set, {
  init: function (type, watch) {
    this.type = flexo.safe_trim(type);
    return bender.Set.init.call(this, watch);
  }
});


var SetProperty = bender.SetProperty = flexo._ext(bender.Set);


var SetAttribute = bender.SetAttribute = flexo._ext(bender.Set, {
  init: function (attr, watch) {
    this.attr = flexo.safe_trim(attr);
    return bender.Set.init.call(this, watch);
  }
});


// Watch is a container for gets and sets
var Watch = bender.Watch = {
  init: function (component) {
    this.component = component;
    this.gets = [];
    this.sets = [];
    return this;
  },

  create: Base.create,

  get: function (get) {
    this.gets.push(get);
    get.watch = this;
  },

  set: function (set) {
    this.sets.push(set);
    set.watch = this;
  }
};


// Link to an external resource
var Link = bender.Link = {
  init: function (rel, href, component) {
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = flexo.safe_trim(href);
    this.component = component;
    return this;
  },

  create: Base.create,

  load: function () {
    if (!this.component) {
      console.warn("Cannot load link: no environment.");
      return;
    }
    if (this.component.scope.urls[this.href]) {
      return this.component.scope.urls[this.href];
    }
    var f = this.load[this.rel];
    if (typeof f === "function") {
      // jshint -W093
      return this.component.scope.urls[this.href] = f.call(this);
    }
    console.warn("Cannot load “%0” link (unsupported value for rel)"
        .fmt(this.rel));
  }
};


// Inline elements (script and style)
var Inline = bender.Inline = {
  init: function (text, component) {
    this.text = flexo.safe_string(text);
    this.component = component;
    this.__pending = true;
    return this;
  },

  create: Base.create
};

var Script = bender.Script = flexo._ext(Inline, {
  apply: function () {
    if (!this.__pending) {
      return;
    }
    delete this.__pending;
    try {
      // jshint -W054
      new Function(this.text).apply(this.component, arguments);
    } catch (e) {
      console.error("could not run script:", e);
    }
    return this;
  }
});

var Style = bender.Style = Object.create(Inline);


// Convert an object to a Bender element. This can be a DOM node, a text string
// (which becomes a Text element), or a plain old Bender element, which is
// returned unchanged. Return undefined for any other input.
function convert_node(node) {
  return node.nodeType ? convert_dom_node(node) :
    typeof node === "string" ? Text.create().text(node) :
    flexo.instance_of(node, Base) && node;
}

// Create a properties object for a component, which maps property names to
// their runtime value. The object keeps a hidden back-pointer to its owner
// component.
function create_properties (component) {
  var properties = component.properties ?
    Object.create(component.properties) : {};
  return Object.defineProperty(properties, "",
      { value: component, configurable: true });
}

// Convert a DOM node to a Bender element. Element nodes become DOMElements,
// text and CDATA section nodes become text. Any other kind of node is ignored.
// TODO document fragment could be a list of nodes?
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
      var property = this[""].own_properties[name];
      var match = !silent && property.match()(this.scope, v);
      if (match) {
        if (this.hasOwnProperty(name)) {
          property.check_value(this[""], v);
          value = v;
        } else {
          define_js_property(this[""], name, v);
        }
        if (!silent) {
          this[""].did_set_property(name, v);
        }
      }
    }
  });
}

// Delete the attribute {ns}name from elem and return elem.
function delete_attribute(elem, ns, name) {
  if (elem.attrs.hasOwnProperty(ns) && elem.attrs[ns].hasOwnProperty(name)) {
    delete elem.attrs[ns][name];
    if (Object.keys(elem.attrs[ns]).length === 0) {
      delete elem.attrs[ns];
    }
  }
  return elem;
}

// Normalize the render-id/renderId attribute
function normalize_renderId(renderId) {
  renderId = flexo.safe_trim(renderId).toLowerCase();
  return renderId === "class" || renderId === "id" || renderId === "none" ?
    renderId : "inherit";
}

// Normalize the `as` property of an element so that it matches a known value.
// Set to “dynamic” by default.
function normalize_as(as) {
  as = flexo.safe_trim(as).toLowerCase();
  return as === "string" || as === "number" || as === "boolean" ||
    as === "json" || as === "dynamic" ? as : "inherit";
}

// Normalize the `delay` property of an element so that it matches a legal value
// (a number of milliseconds >= 0, “never”, “none”, or the empty string by
// default.)
function normalize_delay(delay) {
  delay = flexo.safe_trim(delay).toLowerCase();
  var d = flexo.to_number(delay);
  return d >= 0 ? d : delay === "never" ? Infinity : "none";
}

// Normalize the select attribute, defaulting to "@this"
function normalize_select(select) {
  return typeof select === "string" && select || "@this";
}

// Set the attribute {ns}name to value on the element and return it.
function set_attribute(elem, ns, name, value) {
  if (!elem.attrs.hasOwnProperty(ns)) {
    elem.attrs[ns] = {};
  }
  if (!elem.attrs[ns].hasOwnProperty(name) || elem.attrs[ns][name] !== value) {
    elem.attrs[ns][name] = value;
  }
  return elem;
}
