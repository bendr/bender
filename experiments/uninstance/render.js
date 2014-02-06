/* global Attribute, bender, Component, console, Content, DOMElement, flexo,
   Link, on, Style, Text, View, ViewElement, window */
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
  var instance = this.instantiate(this.create_concrete_scope());
  if (arguments.length === 0) {
    target = this.scope.document.body || this.scope.document.documentElement;
  }
  instance.render(null, target, ref);
  return instance;
};

// Create the render stack for a component instance by going through the
// prototype chain and adding a new scope for each prototype component. When a
// prototype has a view, the view is also instantiated and pushed 
Component.create_render_stack = function () {
  var stack = [];
  stack.instance = this;
  for (var prototype = Object.getPrototypeOf(this), scope = this.scope; scope;
      prototype = Object.getPrototypeOf(prototype), scope = prototype.scope &&
      Object.create(prototype.create_concrete_scope())) {
    if (!scope.hasOwnProperty("type")) {
      Object.defineProperty(scope, "type", { value: "view" });
    }
    var concrete_scope = Object.getPrototypeOf(scope);
    concrete_scope.derived.push(scope);
    scope["#this"] = prototype;
    scope["@this"] = this;
    var mode = "top";
    if (prototype.scope.view && !stack.__locked) {
      scope.view = prototype.scope.view.instantiate(concrete_scope);
      delete prototype.__pending_render;
      mode = scope.view.stack();
    }
    if (mode === "top") {
      stack.unshift(scope);
    } else {
      stack.push(scope);
      if (mode === "replace") {
        stack.__locked = true;
      }
    }
  }
  delete stack.__locked;
  return stack;
};

// Render the component. This is the internal method called from
// render_instance(), which should not be called directly.
// A new render stack is built, replacing the stack passed as parameter, built
// of render scopes (see render_scope below.)
Component.render = function (stack, target, ref) {
  stack = this.scope.stack;
  on(this, "render");
  var head = target.ownerDocument.head || target.ownerDocument.documentElement;
  var apply_style = function (ch) {
    if (ch.tag === "style") {
      ch.apply(head);
    }
  };
  for (var i = 0, n = stack.length; i < n; ++i) {
    stack[i]["#this"].children.forEach(apply_style);
    if (stack[i].view && !stack.hasOwnProperty("i")) {
      stack.i = i;
    }
  }
  if (stack[stack.i]) {
    stack[stack.i].view.render(stack, target, ref);
    delete stack.i;
  }
  this.init_properties();
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
  var j = stack.i++;
  for (var n = stack.length; stack.i < n && !stack[stack.i].view; ++stack.i) {}
  if (stack[stack.i]) {
    stack[stack.i].view.render(stack, target, ref);
    stack.i = j;
  } else {
    stack.i = j;
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


// Link rendering, i.e., loading

// Scripts are handled for HTML only by default. Override this method to handle
// other types of documents.
Link.load.script = function (url, component) {
  var document = component.scope.document;
  if (document.documentElement.namespaceURI === flexo.ns.html) {
    return flexo.promise_script(url, document.head)
      .then(function (script) {
        Object.defineProperty(this, "loaded", {
          enumerable: true,
          value: script
        });
        return this;
      }.bind(this));
  }
  console.warn("Cannot render script link for namespace %0"
      .fmt(document.documentElement.namespaceURI));
};

// Stylesheets are handled for HTML only by default. Override this method to
// handle other types of documents.
Link.load.stylesheet = function (url, component) {
  var document = component.environment.document;
  if (document.documentElement.namespaceURI === flexo.ns.html) {
    var link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", url);
    document.head.appendChild(link);
    Object.defineProperty(this, "loaded", { enumerable: true, value: link });
    return this;
  } 
  console.warn("Cannot render stylesheet link for namespace %0"
      .fmt(document.documentElement.namespaceURI));
};


// Applying a style element is adding a style element to the head of the target
// document when rendering the component
Style.apply = function (head) {
  if (!this.__pending) {
    return;
  }
  delete this.__pending;
  head.appendChild(flexo.$style(this.text));
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
DOMElement.render_update_remove_self = function (update) {
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
    // TODO check scope
    this.uninstantiate(update.scope);
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
Text.render_update_remove_self = function (update) {
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
    this.uninstantiate(update.scope);
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
