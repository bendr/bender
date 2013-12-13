/* global Component, console, Content, DOMElement, flexo, TextNode, View, $$push */
// jshint -W097

"use strict";


// An environment in which to render Bender components.
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


Component.render_scope = function () {
  var scope = Object.create(this.scope);
  if (this.scope.view) {
    scope.view = this.scope.view.instantiate(scope);
  }
  this.scope.render.push(scope);
  return scope;
};

Component.render = function (stack, target, ref) {
  console.log("render", this._id || this);
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
  if (stack.length) {
    stack.i = 0;
    stack[stack.i].view.render(stack, target, ref);
    delete stack.i;
  }
  return stack;
};

View.render = function (stack, target, ref) {
  stack[stack.i].target = target;
  var fragment = target.ownerDocument.createDocumentFragment();
  this.children.forEach(function (child) {
    child.render(stack, fragment);
  });
  target.insertBefore(fragment, ref);
};

View.render_update = function (update) {
  var stack = update.scope.stack;
  for (stack.i = 0; stack[stack.i]["#this"] !== update.scope["#this"];
    ++stack.i) {}
  var target = find_dom_parent(update, stack);
  update.target.render(stack, target, find_dom_ref(update, target));
  delete stack.i;
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


TextNode.render = function (_, target, ref) {
  // jshint unused: true, -W093
  return this.dom = target.insertBefore(target.ownerDocument
      .createTextNode(this.text()), ref);
};

TextNode.render_update = function () {
  this.dom.textContent = this.text();
};

function find_dom_parent(update, stack) {
  var p = update.target.parent;
  var t = stack[stack.i].target;
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
