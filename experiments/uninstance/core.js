/* global console, flexo, window, $$push */
// jshint -W097

"use strict";


// Bender elements
var Element = {

  // Initialize an element with no parent yet and an empty list of children.
  init: function () {
    this.parent = null;
    this.children = [];
    return this;
  },

  // Create a new element from a template and additional arguments which get
  // passed to init (e.g., Component.create(scope)). Normally no Elements are
  // created, only derived objects (Component, DOMElement, &c.)
  create: function () {
    return this.init.apply(Object.create(this), arguments);
  },

  // Instantiate the element, updating the scope as we go along.
  instantiate: function (scope, shallow) {
    var instance = Object.create(this);
    if (this._id) {
      scope["@" + this._id] = instance;
    }
    if (shallow) {
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
        return;
      }
      if (_id !== this._id) {
        this._id = _id;
      }
      return this;
    }
    return this._id || "";
  },

  // Add a child element.
  add_child: function (child, ref) {
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
      ref = this.children.indexOf(ref) + 1;
    }
    var n = this.children.length;
    var index = ref >= 0 ? ref : ref < 0 ? n + 1 + ref : n;
    if (index < 0 || index > n) {
      throw "hierarchy error: index out of bounds";
    }
    this.children.splice(index, 0, child);
    child.parent = this;
    add_ids_to_scope(child);
    update(this.component, { type: "add", target: child });
    return child;
  },

  child: function (child) {
    return this.add_child(child), this;
  }
};

flexo.make_readonly(Element, "component", function () {
  return this.parent && this.parent.component;
});


var Component = flexo._ext(Element, {
  init: function (scope) {
    if (scope.hasOwnProperty("environment")) {
      scope = Object.create(scope);
    }
    this.scope = flexo._ext(scope, { "@this": this, "#this": this,
      render: [] });
    console.log("init", this);
    return Element.init.call(this);
  },

  instantiate: function (scope) {
    return Element.instantiate.call(this, scope, true);
  },

  // Make sure that children are added to the original component, and not the
  // instantiated component. Then handle known contents (view, property, watch,
  // &c.) accordingly.
  add_child: function (child, ref) {
    if (!this.hasOwnProperty("children")) {
      return Object.getPrototypeOf(this).add_child(child, ref);
    }
    child = Element.add_child.call(this, child, ref);
    if (child.tag === "view") {
      if (!this.scope.hasOwnProperty("view")) {
        this.scope.view = child;
      }
    }
  },
});

flexo._accessor(Component, "prototype");
flexo.make_readonly(Component, "tag", "component");
flexo.make_readonly(Component, "component", flexo.self);

var View = flexo._ext(Element, {
  instantiate: function (scope) {
    var v = Element.instantiate.call(this, scope);
    console.log("instantiate", v.component._id || v, scope);
    return v;
  }
});

flexo._accessor(View, "renderId", normalize_renderId);
flexo._accessor(View, "stack", normalize_stack);

flexo.make_readonly(View, "view", flexo.self);
flexo.make_readonly(View, "tag", "view");


var Content = Object.create(View);

flexo.make_readonly(Content, "view", find_view);
flexo.make_readonly(Content, "tag", "content");


var DOMElement = flexo._ext(Element, {
  init: function (ns, name) {
    this.namespace_uri = ns;
    this.local_name = name;
    this.attrs = {};
    return Element.init.call(this);
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


var TextNode = flexo._ext(Element, {
  init: function () {
    return this.parent = null, this;
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

flexo.make_readonly(TextNode, "view", find_view);


function add_ids_to_scope(root) {
  var component = root.component;
  if (component) {
    var queue = [root];
    while (queue.length > 0) {
      var element = queue.shift();
      if (element._id) {
        component.scope["@" + element._id] =
        component.scope["#" + element._id] = element;
      }
      $$push(queue, element.children);
    }
  }
}

function convert_node(node) {
  if (node.nodeType) {
    return convert_dom_node(node);
  }
  if (typeof node === "string") {
    return TextNode.create().text(node);
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
        elem.add_child(ch);
      }
    }
    return elem;
  } else if (node.nodeType === window.Node.TEXT_NODE ||
      node.nodeType === window.Node.CDATA_SECTION_NODE) {
    return TextNode.create().text(node.textContent);
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

function update(component, args) {
  if (component) {
    component.scope.render.forEach(function (scope) {
      args.scope = scope;
      scope.environment.update_component(args);
    });
  }
}
