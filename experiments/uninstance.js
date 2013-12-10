"use strict";

function _ext(Proto, properties) {
  var object = Object.create(Proto);
  for (var p in properties) {
    object[p] = properties[p];
  }
  return object;
}


var Environment = {
  init: function (document) {
    this.scope = { document: document, environment: this };
    this.components = [];
    return this;
  },

  component: function (component) {
    if (!component) {
      component = Component.create(this.scope);
    }
    this.components.push(component);
    return component;
  },

  update_component: function (update) {
    if (!this.update_queue) {
      this.update_queue = [];
      flexo.asap(this.flush_update_queue.bind(this));
    }
    this.update_queue.push(update);
  },

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
  }

};


var Element = {
  init: function () {
    this.parent = null;
    this.children = [];
    return this;
  },

  create: function () {
    return this.init.apply(Object.create(this), arguments);
  },

  id: function (id) {
    if (arguments.length > 0) {
      id = flexo.safe_string(id);
      if (id !== this._id) {
        this._id = id;
      }
      return this;
    }
    return this._id || "";
  },

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


var Component = _ext(Element, {
  init: function (scope) {
    if (scope.hasOwnProperty("environment")) {
      scope = Object.create(scope);
    }
    this.scope = _ext(scope, { "@this": this, "#this": this, derived: [] });
    return Element.init.call(this);
  },

  add_child: function (child, ref) {
    child = Element.add_child.call(this, child, ref);
    if (child.tag === "view") {
      if (!this.scope.hasOwnProperty("view")) {
        this.scope.view = child;
      }
    }
  },

  prototype: function (component) {
    this.scope.prototype = component;
    return this;
  },

  derive: function () {
    var derived = this.scope.environment.component(Object.create(this));
    derived.parent = null;
    derived.scope = _ext(this.scope, { "@this": derived, derived: [] });
    this.scope.derived.push(this.scope.environment.component(derived));
    return this;
  },

  render: function (stack, target, ref) {
    if (!this.scope.stack) {
      stack = this.scope.stack = [];
      for (var p = this; p;
          p = p.scope.prototype && p.scope.prototype.derive()) {
        if (p.scope.view) {
          var mode = p.scope.view.stack();
          if (mode === "top") {
            stack.unshift(p);
          } else {
            stack.push(p);
            if (mode === "replace") {
              break;
            }
          }
        }
      }
      if (stack.length) {
        stack.i = 0;
        stack[stack.i].scope.view.render(stack, target, ref);
        delete stack.i;
      }
    }
  },
});

flexo.make_readonly(Component, "tag", "component");
flexo.make_readonly(Component, "component", flexo.self);

var View = _ext(Element, {
  render: function (stack, target, ref) {
    stack[stack.i].scope.target = target;
    var fragment = target.ownerDocument.createDocumentFragment();
    this.children.forEach(function (child) {
      child.render(stack, fragment);
    });
    target.insertBefore(fragment, ref);
  },

  render_update: function (update) {
    var stack = update.scope["#this"].scope.stack;
    for (stack.i = 0; stack[stack.i].scope["#this"] !== update.scope["#this"];
      ++stack.i) {}
    var target = find_dom_parent(update, stack);
    update.target.render(stack, target, find_dom_ref(update, target));
    delete stack.i;
  }
});

flexo._accessor(View, "renderId", normalize_renderId);
flexo._accessor(View, "stack", normalize_stack);

flexo.make_readonly(View, "view", flexo.self);
flexo.make_readonly(View, "tag", "view");


var Content = _ext(View, {
  render: function (stack, target, ref) {
    if (stack.i < stack.length - 1) {
      ++stack.i;
      stack[stack.i].scope.view.render(stack, target, ref);
      --stack.i;
    } else {
      View.render.call(this, stack, target, ref);
    }
  }
});

flexo.make_readonly(Content, "view", find_view);
flexo.make_readonly(Content, "tag", "content");


var DOMElement = _ext(Element, {
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

  render: function (stack, target, ref) {
    var elem = target.ownerDocument.createElementNS(this.namespace_uri,
      this.local_name);
    elem.__bender = this;
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    this.children.forEach(function (child) {
      child.render(stack, elem);
    });
    return target.insertBefore(elem, ref);
  },

  update: {
    add: function (update) {
      update.scope.view.render_update(update);
    },
  }
});

flexo.make_readonly(DOMElement, "view", find_view);


var TextNode = _ext(Element, {
  init: function () {
    this.parent = null;
    return this;
  },
  render: function (stack, target, ref) {
    return target.insertBefore(target.ownerDocument.createTextNode(this.text()),
      ref);
  }
});

flexo._accessor(TextNode, "text", "");
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

function find_dom_parent(update, stack) {
  var p = update.target.parent;
  var t = stack[stack.i].scope.target;
  if (p.view === p) {
    return t;
  }
  var queue = [t];
  while (queue.length > 0) {
    var q = queue.shift();
    if (q.__bender === p) {
      return q;
    }
    $$push(queue, q.childNodes);
  }
}

function find_dom_ref(update, target) {
  var p = update.target.parent;
  var ref = p.children[p.children.indexOf(update.target) + 1];
  return ref && flexo.find_first(target.childNodes, function (n) {
    return n.__bender === ref;
  });
}

function find_view() {
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
  if (component && component.scope.stack) {
    args.scope = component.scope;
    component.scope.environment.update_component(args);
  }
}
