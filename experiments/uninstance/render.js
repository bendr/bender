/* global Attribute, bender, Component, Content, DOMElement, flexo, on, Style,
   Text, View, ViewElement, window */
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


// Most elements will be rendered to a single DOM element or text node, so last
// returns first by default.
[ViewElement, Text].forEach(function (elem) {
  Object.defineProperty(elem, "last", {
    enumerable: true,
    configurable: true,
    get: function () {
      return this.first;
    }
  });
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

// Render the component. This is the internal method called from
// render_instance(), which should not be called directly.
// A new render stack is built, replacing the stack passed as parameter, built
// of render scopes (see render_scope below.)
Component.render = function (stack, target, ref) {
  var head = target.ownerDocument.head || target.ownerDocument.documentElement;
  this.children.forEach(function (ch) {
    if (ch.tag === "style") {
      ch.apply(head);
    }
  });
  Object.defineProperty(this, "scope", {
    enumerable: true,
    value: this.render_scope()
  });
  var scope = this.scope;
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


// Render as an attribute of the target element, the value of which is the
// shallow text content (concatenation of the text of all text child elements.)
// Remember the target so that further re-renders do not need to pass it as an
// argument. No need to use the stack since attributes are shallow.
Attribute.render = function (_, target) {
  // jshint unused: true
  if (target) {
    this.target = target;
  }
  this.target.setAttributeNS(this.ns, this.name, this.shallow_text);
};


// Render the text element into a DOM text node. This is only done for children
// of ViewElement, not for children of Attribute, where the text goes into the
// attribute value and this function is not called.
Text.render = function (_, target, ref) {
  // jshint unused: true, -W093
  return this.first = target.insertBefore(target.ownerDocument
      .createTextNode(this.text()), ref);
};


// Applying a style element is adding a style element to the head of the target
// document when rendering the component
Style.apply = function (head) {
  if (!this.__pending) {
    return;
  }
  delete this.__pending;
  head.appendChild(flexo.$style(this.text()));
  return this;
};


// Render updates after adding a child element

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
      var ref = sibling && flexo.find_first(instance.children, function (ch) {
        return Object.getPrototypeOf(ch) === sibling;
      });
      instance.insert_child(update.target.instantiate(), ref);
    });
  }
};


// Render updates after removing a child element

// Remove all elements from first to last.
DOMElement.render_update_remove_self = function () {
  if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      instance.remove_self();
    });
  } else {
    var n = this.first;
    var m = this.last && this.last.nextSibling;
    var p = n.parentNode;
    while (p && n !== m) {
      var n_ = n.nextSibling;
      p.removeChild(n);
      n = n_;
    }
    delete this.first;
    delete this.last;
    this.uninstantiate();
  }
};

// Update the attribute after a text child was removed
Attribute.render_update_remove_child = function (child) {
  if (this.hasOwnProperty("instances")) {
    child.instances.forEach(function (instance) {
      this.remove_child(flexo.find_first(instance.children, function (ch) {
        return Object.getPrototypeOf(ch) === child;
      }));
    });
  } else {
    this.render();
  }
};

// Remove the text node from its parent if it was actually rendered, otherwise
// tell the parent about the removal.
Text.render_update_remove_self = function () {
  var f = this.parent && this.parent.render_update_remove_child;
  if (f) {
    f.call(this.parent, this);
  } else if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      instance.remove_self();
    });
  } else {
    flexo.safe_remove(this.first);
    delete this.first;
    this.uninstantiate();
  }
};


// Render updates after changing an attribute

// Only DOM elements have DOM attributes. Update has a value field if a value is
// set or modified, and no value field if the attribute is removed.
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


// Render updates after changing the text property of a text element

// Re-render the attribute when one of its text child node changes.
Attribute.render_update_text = function () {
  if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      instance.render();
    });
  } else {
    this.render();
  }
};

// Udpate text when the text was actually rendered, otherwise tell the parent
// about the update.
Text.render_update_text = function () {
  var f = this.parent && this.parent.render_update_text;
  if (f) {
    f.call(this.parent);
  } else if (this.hasOwnProperty("instances")) {
    this.instances.forEach(function (instance) {
      // Instances use the text property from their prototype; do not set the
      // text property for instances and avoid updating instances that have
      // their own text.
      if (!instance.hasOwnProperty("_text")) {
        instance.render_update_text();
      }
    });
  } else if (this.first) {
    this.first.textContent = this.text();
  }
};
