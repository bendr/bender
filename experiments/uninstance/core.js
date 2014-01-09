/* global console, exports, flexo, global, $foreach, $$push, $slice, window */
// jshint -W097

"use strict";

if (typeof window === "object") {
  // Looks like a browser
  window.global = window;
  global.bender = {};
} else {
  // Looks like node
  global.flexo = require("flexo");
  global.bender = exports;
}

bender.VERSION = "0.8.2-pre";


// Prototype for Bender elements, similar to DOM elements. There are only
// elements and no other kind of node (see the Text element for instance, which
// does have text content instead of children; there is no equivalent of
// document or document fragment.)
var Element = bender.Element = {

  // Initialize an element with no parent yet and an empty list of children.
  init: function () {
    this.children = [];
    return this;
  },

  // Initialize an element from an arguments object (see create_element)
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
  // well.
  instantiate: function (scope, shallow) {
    var instance = Object.create(this);
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

  // Get or set the id of the element. Don’t do anything if the ID was not a
  // valid XML id.
  // TODO update
  id: function (id) {
    if (arguments.length > 0) {
      var _id = flexo.check_xml_id(id);
      // jshint -W041
      if (_id == null) {
        console.warn("“%0” is not a valid XML ID".fmt(id));
        return this;
      }
      if (_id !== this._id) {
        this._id = _id;
      }
      return this;
    }
    return this._id || "";
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
        throw "hierarchy error: already a child of the parent.";
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
    update(this.component, { type: "add", target: child });
    return child;
  },

  // Convenience method to chain child additions; this appends a child and
  // returns the parent rather than the child.
  child: function (child) {
    return this.insert_child(child), this;
  }
};

flexo.make_readonly(Element, "is_bender_element", true);

// The closest component ancestor element.
flexo.make_readonly(Element, "component", function () {
  return this.parent && this.parent.component;
});


var Component = bender.Component = flexo._ext(Element, {

  // Initialize a component from either an environment scope (if it has no
  // parent yet) or the parent component’s scope.
  init: function (scope) {
    if (scope.hasOwnProperty("environment")) {
      scope = Object.create(scope);
    }
    this.instances = [];
    this.derived = [];
    this.scope = flexo._ext(scope, { "@this": this, "#this": this,
      children: [] });
    this.on_handlers = Object.create(this.on_handlers);
    this.___ = flexo.random_id();
    this.__pending_render = true;
    this.__pending_init = true;
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
    this.init(args.scope);
    if (args.prototype) {
      this.prototype(args.prototype);
    }
    return Element.init_with_args.call(this, args);
  },

  // Default handlers for on-init and on-instantiate
  on_handlers: {
    init: flexo.nop,
    instantiate: flexo.nop
  },

  // Set the handler for on-init/on-instantiate
  on: function (type, handler) {
    if (type in this.on_handlers && typeof handler === "function") {
      this.on_handlers[type] = handler;
    }
    return this;
  },

  // Instantiate is shallow for components; when rendering, the view and stack
  // will be created for the instance.
  instantiate: function (scope) {
    var instance = Element.instantiate.call(this, scope, true);
    instance.___ = this.___ + "/" + flexo.random_id();
    this.instances.push(instance);
    on(this, "instantiate", instance);
    return instance;
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
      if (!this.scope.hasOwnProperty("view")) {
        this.scope.view = child;
        flexo.beach(child, function (ch) {
          if (ch.tag === "component") {
            this.scope.children.push(ch);
            ch.scope.parent = this;
          } else {
            return ch.children;
          }
        }.bind(this));
      }
    }
    return child;
  },

  // Get the view (if no argument is given), or add contents to the view,
  // creating the view if necessary.
  view: function () {
    if (arguments.length === 0) {
      return this.scope.view;
    }
    var view = this.scope.view || this.insert_child(View.create().init());
    $foreach(arguments, insert_children.bind(null, view));
    return this;
  }

});

flexo._accessor(Component, "prototype", function (p) {
  if (p) {
    // TODO update when prototype changes
    p.derived.push(this);
  }
  return p;
});

flexo.make_readonly(Component, "tag", "component");
flexo.make_readonly(Component, "component", flexo.self);
flexo.make_readonly(Component, "all_instances", function () {
  return flexo.bfold(this, function (instances, component) {
    return $$push(instances, component.instances), instances;
  }, flexo.property("derived"), []);
});


// View elements are View, and elements that can occur in View, except for
// Component: DOMElement, Text, and Content.
var ViewElement = bender.ViewElement = flexo._ext(Element, {

  init_with_args: function (args) {
    this.init();
    if (args.renderId || args["render-id"]) {
      this.renderId(args.renderId || args["render-id"]);
    }
    return Element.init_with_args.call(this, args);
  },

  insert_child: function (child, ref) {
    if (child.tag === "component") {
      var component = this.component;
      if (component) {
        component.scope.children.push(child);
        child.scope.parent = component;
      }
    }
    return Element.insert_child.call(this, child, ref);
  }
});


var View = bender.View = flexo._ext(bender.ViewElement, {
  init_with_args: function (args) {
    if (args.stack) {
      this.stack(args.stack);
    }
    return ViewElement.init_with_args.call(this, args);
  }
});

flexo._accessor(View, "renderId", normalize_renderId);
flexo._accessor(View, "stack", normalize_stack);
flexo.make_readonly(View, "view", flexo.self);
flexo.make_readonly(View, "tag", "view");


var Content = bender.Content = Object.create(ViewElement);

flexo.make_readonly(Content, "view", find_view);
flexo.make_readonly(Content, "tag", "content");


var DOMElement = bender.DOMElement = flexo._ext(ViewElement, {
  init: function (ns, name) {
    this.namespace_uri = ns;
    this.local_name = name;
    this.attrs = {};
    return Element.init.call(this);
  },

  init_with_args: function (args) {
    ViewElement.init_with_args.call(this, args);
    this.namespace_uri = args.namespace_uri || args.namespaceURI;
    this.local_name = args.local_name || args.localName;
    var skip = { id: true, renderId: true, "render-id": true, namespace_uri: true,
      namespaceURI: true, local_name: true, localName: true };
    this.attrs = {};
    // TODO known namespace prefixes from Flexo
    for (var p in args) {
      if (!(p in skip)) {
        this.attr("", p, args[p]);
      }
    }
    return this;
  },

  attr: function (ns, name, value) {
    if (arguments.length > 2) {
      if (!this.attrs.hasOwnProperty(ns)) {
        this.attrs[ns] = {};
      }
      // TODO bindings
      this.attrs[ns][name] = value;
      return this;
    }
    return (this.attrs[ns] && this.attrs[ns][name]) || null;
  },

  update: {
    add: function (update) {
      update.scope.view.render_update(update);
    },
  }
});

flexo.make_readonly(DOMElement, "view", find_view);
flexo.make_readonly(DOMElement, "tag", "dom");


var Text = bender.Text = flexo._ext(ViewElement, {
  init: function () {
    return this.parent = null, this;
  },

  insert_child: function (child) {
    this.text(this.text() + child);
  },

  instantiate: function (scope) {
    return Element.instantiate.call(this, scope, true);
  },

  text: function (text) {
    if (arguments.length === 0) {
      return this._text || "";
    }
    this._text = flexo.safe_string(text);
    update(this.component, { type: "text", target: this });
    return this;
  },

  update: {
    text: function (update) {
      update.target.render_update();
    }
  }
});

function insert_children(elem, children) {
  if (Array.isArray(children)) {
    children.forEach(insert_children.bind(null, elem));
  } else {
    elem.insert_child(children);
  }
}

flexo.make_readonly(Text, "view", find_view);
flexo.make_readonly(Text, "tag", "text");


// An environment in which to render Bender components.
var Environment = bender.Environment = {

  // Initialize the environment
  init: function () {
    this.scope = { environment: this };
    this.components = [];
    this.urls = {};
    return this;
  },

  // Add a component (creating it if necessary) to this environment.
  component: function (component) {
    if (!component) {
      component = Component.create(this.scope);
    }
    this.components.push(component);
    return component;
  },

  // Push an update to the update queue, creating the queue if necessary.
  update_component: function (update) {
    if (update.target.component.__pending_render) {
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
      var f = update.target.update && update.target.update[update.type];
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
  }

};

// Create a new environment
bender.environment = function () {
  return Object.create(bender.Environment).init();
};

// Shortcuts for the $ function: env.$foo === env.$("foo")
["component", "content", "text", "view"].forEach(function (tag) {
  Environment["$" + tag] = function () {
    var args = [tag];
    $$push(args, arguments);
    return this.$.apply(this, args);
  };
});

// Create DOMElement from known HTML tags.
["p", "div"].forEach(function (tag) {
  Environment["$" + tag] = function (args) {
    var args_ = ["DOMElement"];
    if (typeof args !== "object" || Array.isArray(args) ||
        args.is_bender_element ||
        (flexo.browserp && args instanceof window.Node)) {
      args = {};
      args_.push(args);
    }
    args.namespace_uri = flexo.ns.html;
    args.local_name = tag;
    $$push(args_, arguments);
    return this.$.apply(this, args_);
  };
});


function add_ids_to_scope(root) {
  var component = root.component;
  if (component) {
    flexo.beach(root, function (element) {
      if (element._id) {
        component.scope["@" + element._id] =
        component.scope["#" + element._id] = element;
      }
      return element.children;
    });
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

function find_view() {
  // jshint -W040
  return this.parent && this.parent.view;
}

function normalize_renderId(renderId) {
  renderId = flexo.safe_trim(renderId).toLowerCase();
  return renderId === "class" || renderId === "id" || renderId === "none" ?
    renderId : "inherit";
}

function normalize_stack(stack) {
  stack = flexo.safe_trim(stack).toLowerCase();
  return stack === "bottom" || stack === "replace" ? stack : "top";
}

function on(component, type) {
  if (component.__pending_init) {
    delete component.__pending_init;
    component.on_handlers.init.call(component);
  }
  component.on_handlers[type].apply(component, $slice(arguments, 2));
}

function update(component, args) {
  if (component) {
    args.scope = component.scope;
    component.scope.environment.update_component(args);
  }
}
