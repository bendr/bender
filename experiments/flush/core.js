/* global bender, console, exports, flexo, global, require, window */
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

  // Instantiate a base object.
  instantiate: function () {
    if (!this.hasOwnProperty("instances")) {
      throw "Cannot instantiate instance";
    }
    var instance = Object.create(this);
    this.instances.push(instance);
    return instance;
  },

  // Stub for rendering
  render: function (/* stack, target, ref */) {
  }
};


// Component
var Component = bender.Component = flexo._ext(Base, {

  // Initialize a new component.
  init: function (parent) {
    var abstract_scope = parent ?
      Object.getPrototypeOf(parent.scope) :
      Object.create(Scope, {
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
    this.view = View.create();
    this.view._component = this;
    this.properties = create_properties(this);
    this.vertices = this.vertices ?
      { dom: Object.create(this.vertices.dom),
        event: Object.create(this.vertices.event),
        property: Object.create(this.vertices.property) } :
      { dom: {}, event: {}, property: {} };
    if (parent) {
      this.parent = parent;
      parent.children.push(this);
    }
    return Base.init.call(this);
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
    instance.view = this.view.instantiate(concrete_scope);
    if (parent) {
      instance.parent = parent;
      parent.children.push(instance);
    }
    return instance;
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

  // Set the handler for on-init/on-instantiate/on-render
  // TODO
  on: function (type, handler) {
    return this;
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
  }

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

  // Get or set the id of the element. Don’t do anything if the ID was not a
  // valid XML id, or if it was the reserved keyword “this”.
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
      add_id_to_scope(this);
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
    if (!child) {
      throw "cannot add a non-Bender element";
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
    return add_ids_to_scope(child);
  },

  // Convenience method to chain child additions; this appends a child and
  // returns the parent rather than the child.
  child: function (child) {
    return this.insert_child(child), this;
  }
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
    this.ns = ns;
    this.name = name;
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


// Add an ID to the abstract scope of a component (i.e., the prototype of its
// scope) for an element. Since this is the abstract scope, add both # and @
// forms of the ID. If the element is not in a component yet, do nothing.
function add_id_to_scope(element) {
  var component = element.component;
  if (component) {
    var scope = Object.getPrototypeOf(component.scope);
    scope["@" + element._id] = element;
    if (component.hasOwnProperty("instances")) {
      scope["#" + element._id] = element;
    }
  }
}

// Add all IDs in the subtree at root to the scope of the component in which
// root is and return the root.
function add_ids_to_scope(root) {
  var component = root.component;
  if (component) {
    var scope = Object.getPrototypeOf(component.scope);
    flexo.beach(root, function (element) {
      if (element._id) {
        scope["@" + element._id] = element;
        if (component.hasOwnProperty("instances")) {
          scope["#" + element._id] = element;
        }
      }
      return element.children;
    });
  }
  return root;
}

// Convert an object to a Bender element. This can be a DOM node, a text string
// (which becomes a Text element), or a plain old Bender element, which is
// returned unchanged. Return undefined for any other input.
function convert_node(node) {
  return node.nodeType ? convert_dom_node(node) :
    typeof node === "string" ? Text.create().text(node) :
    flexo.instance_of(node, Element) && node;
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
