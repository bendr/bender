/* global bender, console, exports, flexo, global, require, window */
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


// Prototype for Bender elements, similar to DOM elements. There are only
// elements and no other kind of node (see the Text element for instance, which
// does have text content instead of children; there is no equivalent of
// document or document fragment.)
var Element = bender.Element = {

  // Initialize an element with no parent yet and an empty list of children and
  // instances.
  init: function () {
    Object.defineProperty(this, "children", {
      enumerable: true,
      configurable: true,  // this can be redefined by instances
      value: []
    });
    Object.defineProperty(this, "instances", { enumerable: true, value: [] });
    return this;
  },

  // Initialize an element from an arguments object (see create_element.) All
  // elements may have an id.
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
      Object.defineProperty(instance, "children", {
        enumerable: true,
        value: this.children.map(function (ch) {
          var ch_ = ch.instantiate(scope);
          ch_.parent = instance;
          return ch_;
        })
      });
    }
    return instance;
  },

  // Remove this instance from its prototype element’s list of instances.
  uninstantiate: function () {
    var proto = Object.getPrototypeOf(this);
    if (!proto || !proto.hasOwnProperty("instances")) {
      throw "cannot uninstantiate non-instance";
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
  init: function (scope) {
    if (scope.hasOwnProperty("environment")) {
      scope = Object.create(scope);
    }
    Object.defineProperty(this, "derived", { enumerable: true, value: [] });
    Object.defineProperty(this, "own_properties", {
      enumerable: true,
      value: {}
    });
    Object.defineProperty(this, "properties", {
      enumerable: true,
      configurable: true,
      value: {}
    });
    Object.defineProperty(this.properties, "", { value: this });
    Object.defineProperty(this, "scope", {
      enumerable: true,
      configurable: true,
      value: flexo._ext(scope, { "@this": this, "#this": this, children: [] })
    });
    this.on_handlers = Object.create(this.on_handlers);
    this.__id = flexo.random_id();
    global["$" + this.__id] = this;
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
    Element.init_with_args.call(this.init(), args);
    if (args.prototype) {
      this.prototype(args.prototype);
    }
    return this;
  },

  load_links: function () {
    // TODO
    return this;
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

  // Instantiate is shallow for components; when rendering, the view and stack
  // will be created for the instance.
  instantiate: function (scope) {
    var instance = Element.instantiate.call(this, scope, true);
    var id = flexo.random_id();
    instance.__id = this.__id + "/" + id;
    global["$" + id] = instance;
    Object.defineProperty(instance, "properties", {
      enumerable: true,
      value: Object.create(this.properties, {
        "": { value: instance }
      })
    });
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
    } else if (child.tag === "property") {
      this.own_properties[child.name] = child;
      define_js_property(this, child.name);
    } else if (child.tag === "script") {
      child.apply();
    }
    return child;
  },

  // Add a property element with that name
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
          this.scope.parent.url()) || (this.scope.$document &&
          this.scope.$document.baseURI));
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
  })

});

flexo._accessor(Component, "prototype", function (p) {
  if (p) {
    if (!p.hasOwnProperty("instances")) {
      throw "cannot set prototype of instance";
    }
    if (p.instances.length > 0 || p.derived.length > 0) {
      console.warn("changing the prototype of a component that was " +
        "instantiated or derived");
    }
    p.derived.push(this);
    Object.defineProperty(this, "properties", {
      enumerable: true,
      configurable: true,
      value: flexo.replace_prototype(p.properties, this.properties)
    });
  }
  return p;
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
    if (args.renderId || args["render-id"]) {
      this.renderId(args.renderId || args["render-id"]);
    }
    return Element.init_with_args.call(this, args);
  },

  // Set the parent component of an added component
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


var Content = bender.Content = Object.create(ViewElement);

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


var Text = bender.Text = flexo._ext(ViewElement, {
  instantiate: function (scope) {
    return Element.instantiate.call(this, scope, true);
  },

  text: function (text) {
    if (arguments.length === 0) {
      return this._text || "";
    }
    this._text = flexo.safe_string(text);
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
    Object.defineProperty(this, "gets", { enumerable: true, value: [] });
    Object.defineProperty(this, "sets", { enumerable: true, value: [] });
  },
});

flexo.make_readonly(Watch, "tag", "watch");


var ValueElement = bender.ValueElement = flexo._ext(Element, {});


var Property = bender.Property = flexo._ext(ValueElement, {
  init: function (name) {
    this.name = name;
    return ValueElement.init.call(this);
  },

  init_with_args: function (args) {
    return ValueElement.init_with_args.call(this.init(args.name), args);
  },
});

flexo.make_readonly(Property, "tag", "property");


// An environment in which to render Bender components.
var Environment = bender.Environment = {

  // Initialize the environment with a top-level scope.
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
    if (component.scope.environment !== this) {
      throw "hierarchy error: component from a different environment";
    }
    this.components.push(component);
    return component;
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
["attribute", "component", "content", "view"].forEach(function (tag) {
  Environment["$" + tag] = function () {
    var args = [tag];
    flexo.push_all(args, arguments);
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
    args.ns = flexo.ns.html;
    args.name = tag;
    flexo.push_all(args_, arguments);
    return this.$.apply(this, args_);
  };
});


function add_ids_to_scope(root) {
  var component = root.component;
  if (component) {
    flexo.beach(root, function (element) {
      if (element._id) {
        component.scope["@" + element._id] = element;
        if (component.hasOwnProperty("instances")) {
          component.scope["#" + element._id] = element;
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
        did_set_property(this[""], name, v);
      }
    }
  });
}

function did_set_property(component, name, value) {
  console.log("=== Did set property %0`%1 to %2"
      .fmt(component.__id, name, value));
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

function find_view() {
  // jshint -W040
  return this.parent && this.parent.view;
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

// Normalize the render-id/renderId attribute
function normalize_renderId(renderId) {
  renderId = flexo.safe_trim(renderId).toLowerCase();
  return renderId === "class" || renderId === "id" || renderId === "none" ?
    renderId : "inherit";
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
