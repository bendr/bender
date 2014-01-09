/* global bender, Component, Content, DOMElement, flexo, on, Text, View, window */
// jshint -W097

"use strict";


// In a browser, the environment has a host document as well (which defaults to
// the current document.)
bender.DocumentEnvironment = flexo._ext(bender.Environment, { 
  init: function (document) {
    var env = bender.Environment.init.call(this);
    env.scope.document = document || window.document;
    return env;
  }
});

// Create a new environment for the given document
bender.environment = function (document) {
  return Object.create(bender.DocumentEnvironment).init(document);
};


// Render an instance of the component as a child of the DOM target, before an
// optional ref node. Return the new, rendered instance. This is the method to
// call to render a component explicitely.
Component.render_instance = function (target, ref) {
  var instance = this.instantiate();
  instance.render(null, target, ref);
  return instance;
};

// on-render
Component.on_handlers.render = flexo.nop;

// Render the component. This is the internal method called from
// render_instance(), which should not be called directly.
// A new render stack is built, replacing the stack passed as parameter.
Component.render = function (stack, target, ref) {
  for (var component = this; component && component.__pending_render;
      component = component._prototype) {
    if (Object.getPrototypeOf(component).hasOwnProperty("__pending_render")) {
      component = Object.getPrototypeOf(component);
    }
    delete component.__pending_render;
  }
  var scope = this.scope = this.render_scope();
  stack = scope.stack = [];
  for (; scope; scope = scope["#this"]._prototype &&
      scope["#this"]._prototype.render_scope()) {
    if (scope.view) {
      scope["@this"] = this;
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

// Create a new scope for rendering, instantiating the view.
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

// Get the scope for the given component (for a rendered instance.)
Component.scope_of = function (component) {
  var scope = component.scope;
  return flexo.find_first(this.scope.stack, function (instance) {
    return Object.getPrototypeOf(instance) === scope;
  });
};


// Render a view, i.e., render the contents of the view.
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

// Update the view, either for an instance (the scope points to the stack for
// the instance) or for the component, i.e., all instances (then apply to all
// stacks.)
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


DOMElement.render = function (stack, target, ref) {
  var elem = target.ownerDocument.createElementNS(this.namespace_uri,
    this.local_name);
  this.target = elem;
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
  return this.target = target.insertBefore(target.ownerDocument
      .createTextNode(this.text()), ref);
};

Text.render_update = function () {
  this.target.textContent = this.text();
};


function find_dom_parent(update, stack) {
  var p = update.target.parent;
  var t = stack[stack.i].target;
  if (p.view === p) {
    return t;
  }
  return flexo.bfirst(t, function (q) {
    return q.__bender === p || Object.getPrototypeOf(q.__bender) === p ||
      q.childNodes;
  });
}

function find_dom_ref(update, target) {
  var p = update.target.parent;
  var ref = p.children[p.children.indexOf(update.target) + 1];
  return ref && flexo.find_first(target.childNodes, function (n) {
    return n.__bender === ref;
  });
}
