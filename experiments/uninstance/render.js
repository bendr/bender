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
  delete this.__pending_render;
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
