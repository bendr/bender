/* global Attribute, Component, console, Content, DOMElement, flexo, Link,
   Scope, Style, Text, View, window */
// jshint -W097

"use strict";

Scope.document = window.document;


// Render an instance of the component as a child of the DOM target, before an
// optional ref node. Return the new, rendered instance. This is the method to
// call to render a component explicitely.
Component.render_instance = function (target, ref) {
  var instance = this.instantiate();
  if (arguments.length === 0) {
    target = this.scope.document.body || this.scope.document.documentElement;
  }
  return instance.render(null, target, ref);
};


// Render the component. This is the internal method called from
// render_instance(), which should not be called directly. A new stack of views
// is built (replacing the stack passed as parameter.)
Component.render = function (stack, target, ref) {
  // on(this, "render");
  stack = this.stack = this.create_render_stack();
  stack.i = 0;
  stack[stack.i].render(stack, target, ref);
  delete stack.i;
  return this;
};


// Create the render stack by instantiating views along the prototype chain.
Component.create_render_stack = function () {
  var stack = [];
  stack.instance = this;
  for (var prototype = Object.getPrototypeOf(this), scope = this.scope; scope;
      prototype = Object.getPrototypeOf(prototype), scope = prototype.scope &&
      Object.create(prototype.create_concrete_scope(),
        { type: { value: "view" },
          "#this": { value: prototype, enumerable: true },
          "@this": { value: this, enumerable: true } })) {
    var concrete_scope = Object.getPrototypeOf(scope);
    concrete_scope.derived.push(scope);
    var view = prototype._view.instantiate(concrete_scope);
    view.scope = scope;
    stack.unshift(view);
  }
  return stack;
};


// Render a view, i.e., render the contents of the view.
View.render = function (stack, target, ref) {
  var fragment = target.ownerDocument.createDocumentFragment();
  this.target = fragment.__target = target.__target || target;
  stack[stack.i].scope["#this"].styles.forEach(function (style) {
    style.apply();
  });
  this.children.forEach(function (child) {
    child.render(stack, fragment);
  });
  delete target.__target;
  this.first = fragment.firstChild;
  Object.defineProperty(this, "last", { enumerable: true, configurable: true,
    writable: true, value: fragment.lastChild });
  target.insertBefore(fragment, ref);
  return this;
};


// Render content, which means either the next non-empty view on the stack, or
// if we’are at the bottom, the contents of the element itself.
Content.render = function (stack, target, ref) {
  var n = stack.length;
  var i;
  for (i = stack.i + 1; i < n && stack[i].children.length === 0; ++i) {}
  if (i < n) {
    var j = stack.i;
    stack.i = i;
    stack[stack.i].render(stack, target, ref);
    stack.i = j;
  } else {
    View.render.call(this, stack, target, ref);
  }
};


// Render a DOMElement to a DOM element
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
    this.target.setAttributeNS(this.ns, this.name, this.shallow_text);
  }
};


// Render the text element into a DOM text node. This is only done for children
// of ViewElement, not for children of Attribute, where the text goes into the
// attribute value and this function is not called.
Text.render = function (_, target, ref) {
  // jshint unused: true, -W093
  return this.first = target.insertBefore(target.ownerDocument
      .createTextNode(this.text()), ref);
};


// Scripts are handled for HTML only by default. Override this method to
// handle other types of documents.
Link.load.script = function () {
  var document = this.component.scope.document;
  if (document.documentElement.namespaceURI === flexo.ns.html) {
    return flexo.promise_script(this.href, document.head)
      .then(function (script) {
        return this.loaded = script, this;
      }.bind(this));
  }
  console.warn("Cannot render script link for namespace %0"
      .fmt(document.documentElement.namespaceURI));
};

// Stylesheets are handled for HTML only by default. Override this method to
// handle other types of documents.
Link.load.stylesheet = function () {
  var document = this.component.scope.document;
  if (document.documentElement.namespaceURI === flexo.ns.html) {
    var link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", this.href);
    document.head.appendChild(link);
    this.loaded = link;
  } else {
    console.warn("Cannot render stylesheet link for namespace %0"
        .fmt(document.documentElement.namespaceURI));
  }
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
