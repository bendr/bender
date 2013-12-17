/* global bender, Component, Content, Element, DOMElement, flexo, on, $$push, Text, View, ViewElement, window */
// jshint -W097

"use strict";


// An environment in which to render Bender components.
var Environment = bender.Environment = {
  init: function (document) {
    this.scope = { document: document, environment: this };
    this.components = [];
    this.urls = {};
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
  },

  $: function (tag, args) {
    var index = 2;
    if (typeof args !== "object" || Array.isArray(args) ||
        args.is_bender_element ||
        (window.Node && args instanceof window.Node)) {
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
      add_children(elem, arguments[i]);
    }
    return elem;
  }

};

["component", "content", "text", "view"].forEach(function (tag) {
  Environment["$" + tag] = function () {
    var args = [tag];
    $$push(args, arguments);
    return this.$.apply(this, args);
  };
});

["p", "div"].forEach(function (tag) {
  Environment["$" + tag] = function (args) {
    var args_ = ["DOMElement"];
    if (typeof args !== "object" || Array.isArray(args) ||
        args.is_bender_element ||
        (window.Node && args instanceof window.Node)) {
      args = {};
      args_.push(args);
    }
    args.namespace_uri = flexo.ns.html;
    args.local_name = tag;
    $$push(args_, arguments);
    return this.$.apply(this, args_);
  };
});


// Initialize an element from an arguments object (see create_element)
Element.init_with_args = function (args) {
  if (args.id) {
    this.id(args.id);
  }
  return this;
};


Component.init_with_args = function (args) {
  this.init(args.scope);
  if (args.prototype) {
    this.prototype(args.prototype);
  }
  return Element.init_with_args.call(this, args);
};

// Get the scope for the given component (for an rendered instance.)
Component.scope_of = function (component) {
  var scope = component.scope;
  return flexo.find_first(this.scope.stack, function (instance) {
    return Object.getPrototypeOf(instance) === scope;
  });
};

Component.render_instance = function (target, ref) {
  var instance = this.instantiate();
  instance.render(null, target, ref);
  return instance;
};

Component.render_scope = function () {
  var scope = Object.create(this.scope);
  if (this.scope.view) {
    scope.view = this.scope.view.instantiate(scope);
    if (scope.parent) {
      var index = scope.parent.scope.children.indexOf(Object
          .getPrototypeOf(this));
      scope.parent.scope.children[index] = this;
    }
    scope.children.forEach(function (ch) {
      ch.scope.parent = this;
    }, this);
    on(this, "instantiate", scope.view);
  }
  return scope;
};

Component.on_handlers.render = flexo.nop;

Component.render = function (stack, target, ref) {
  var scope = this.scope = this.render_scope();
  stack = scope.stack = [];
  for (; scope; scope = scope["#this"]._prototype &&
      scope["#this"]._prototype.render_scope()) {
    if (scope.view) {
      var mode = scope.view.stack();
      if (mode === "top") {
        stack.unshift(scope);
      } else {
        stack.push(scope);
        if (mode === "replace") {
          break;
        }
      }
    }
  }
  on(this, "render", stack);
  if (stack.length) {
    stack.i = 0;
    stack[stack.i].view.render(stack, target, ref);
    delete stack.i;
  }
};

ViewElement.init_with_args = function (args) {
  this.init();
  if (args.renderId || args["render-id"]) {
    this.renderId(args.renderId || args["render-id"]);
  }
  return Element.init_with_args.call(this, args);
};

View.init_with_args = function (args) {
  if (args.stack) {
    this.stack(args.stack);
  }
  return ViewElement.init_with_args.call(this, args);
};

View.render = function (stack, target, ref) {
  stack[stack.i].target = target.__target || target;
  var fragment = target.ownerDocument.createDocumentFragment();
  fragment.__target = target.__target || target;
  this.children.forEach(function (child) {
    child.render(stack, fragment);
  });
  delete target.__target;
  target.insertBefore(fragment, ref);
};

View.render_update = function (update) {
  (update.scope.stack ? [update.scope.stack] :
    update.scope["#this"].all_instances.map(function (instance) {
      return instance.scope.stack;
    })).forEach(function (stack) {
    for (stack.i = 0; stack[stack.i]["#this"] !== update.scope["#this"];
      ++stack.i) {}
    var target = find_dom_parent(update, stack);
    update.target.render(stack, target, find_dom_ref(update, target));
    delete stack.i;
  });
};


Content.render = function (stack, target, ref) {
  if (stack.i < stack.length - 1) {
    ++stack.i;
    stack[stack.i].view.render(stack, target, ref);
    --stack.i;
  } else {
    View.render.call(this, stack, target, ref);
  }
};


DOMElement.init_with_args = function (args) {
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
};

DOMElement.render = function (stack, target, ref) {
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
};


Text.render = function (_, target, ref) {
  // jshint unused: true, -W093
  return this.dom = target.insertBefore(target.ownerDocument
      .createTextNode(this.text()), ref);
};

Text.render_update = function () {
  this.dom.textContent = this.text();
};


function find_dom_parent(update, stack) {
  var p = update.target.parent;
  var t = stack[stack.i].target;
  if (p.view === p) {
    return t;
  }
  return flexo.bfirst(t, function (q) {
    return q.__bender === p || q.childNodes;
  });
}

function find_dom_ref(update, target) {
  var p = update.target.parent;
  var ref = p.children[p.children.indexOf(update.target) + 1];
  return ref && flexo.find_first(target.childNodes, function (n) {
    return n.__bender === ref;
  });
}
