/* global Attribute, bender, Component, Content, DOMElement, flexo, on, Text,
   View, ViewElement, window */
// jshint -W097

"use strict";


// In a browser, the environment has a host document as well (which defaults to
// the current document.)
bender.DocumentEnvironment = flexo._ext(bender.Environment, { 

  // Init an environment with the given document
  init: function (document) {
    bender.Environment.init.call(this);
    this.scope.document = document || window.document;
    return this;
  },

  // Create a DOM element in the document of the scope (using
  // flexo.create_element)
  dom: function () {
    return flexo.create_element.apply(this.scope.document, arguments);
  }

});


// Create a new environment for the given document
bender.environment = function (document) {
  return Object.create(bender.DocumentEnvironment).init(document);
};


Object.defineProperty(ViewElement, "last", {
  enumerable: true,
  configurable: true,
  get: function () {
    return this.first;
  }
});

// Render an instance of the component as a child of the DOM target, before an
// optional ref node. Return the new, rendered instance. This is the method to
// call to render a component explicitely.
Component.render_instance = function (target, ref) {
  var instance = this.instantiate();
  if (arguments.length === 0) {
    target = this.scope.document.body || this.scope.document.documentElement;
  }
  instance.render(null, target, ref);
  return instance;
};

// on-render
Component.on_handlers.render = flexo.nop;

// Render the component. This is the internal method called from
// render_instance(), which should not be called directly.
// A new render stack is built, replacing the stack passed as parameter, built
// of render scopes (see render_scope below.)
Component.render = function (stack, target, ref) {
  var scope = this.scope = this.render_scope();
  stack = scope.stack = [];
  for (; scope; scope = scope["#this"]._prototype &&
      scope["#this"]._prototype.render_scope()) {
    if (scope.view) {
      scope["@this"] = this;
      var mode = scope.view.stack();
      delete scope["#this"].__pending_render;
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
    scope.view.parent = this;
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
  this.first = fragment.firstChild;
  Object.defineProperty(this, "last", { enumerable: true, configurable: true,
    writable: true, value: fragment.lastChild });
  target.insertBefore(fragment, ref);
};




// Update the rendered DOM element after a child has been added. If the update
// is made to an instance, then update that instance; when made to a component,
// apply the update to all instances.
ViewElement.render_update_add = Attribute.render_update_add =
function (update) {
  if (update.scope.stack) {
    if (!this.parent.first) {
      return;
    }
    var stack = update.scope.stack;
    for (stack.i = 0; stack[stack.i]["@this"] !== update.scope["@this"];
        ++stack.i) {}
    update.target.render(stack, update.target.parent.first,
        update.target.next_sibling && update.target.next_sibling.first);
    delete stack.i;
  } else {
    var sibling = update.target.next_sibling;
    this.instances.forEach(function (instance) {
      var component = instance.component;
      var ref = sibling && flexo.find_first(instance.children, function (ch) {
        return Object.getPrototypeOf(ch) === sibling;
      });
      var child = instance.insert_child(update.target.instantiate(), ref);
    });
  }
};

// Update a text element depending on its parent (either view element or
// attribute)
Text.render_update_text = function (update) {
  var f = this.parent && this.parent.render_update_text;
  if (f) {
    f.call(this, update);
  }
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
  var elem = target.ownerDocument.createElementNS(this.ns, this.name);
  this.first = elem;
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

DOMElement.render_update_remove_self = function () {
  if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      instance.remove_self();
    });
  } else {
    var n = this.first;
    var m = this.last.nextSibling;
    var p = n.parentNode;
    while (n !== m) {
      var n_ = n.nextSibling;
      p.removeChild(n);
      n = n_;
    }
    delete this.first;
    delete this.last;
    this.uninstantiate();
  }
};

DOMElement.render_update_attribute = function (update) {
  if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      instance.render_update_attribute(update);
    });
  } else if (update.hasOwnProperty("value")) {
    this.first.setAttributeNS(update.ns, update.name, update.value);
  } else {
    this.first.removeAttributeNS(update.ns, update.name);
  }
};


Attribute.render = function (_, target) {
  // jshint unused: true
  if (this.ns) {
    target.setAttributeNS(this.ns, this.name, this.shallow_text);
  } else {
    target.setAttribute(this.name, this.shallow_text);
  }
};

Attribute.update_text = function (update) {
  update.target = this.parent;
  update_stacks(update, function (stack) {
    update.target.render(stack, find_dom_parent(update, stack));
  });
};


Text.render = function (_, target, ref) {
  // jshint unused: true, -W093
  var node = target.ownerDocument.createTextNode(this.text());
  node.__bender = this;
  return this.target = target.insertBefore(node, ref);
};

