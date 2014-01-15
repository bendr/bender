/* global Attribute, bender, Component, Content, DOMElement, flexo, on, Text */
/* global View, window */
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
  stack[stack.i].first = fragment.firstChild;
  stack[stack.i].last = fragment.lastChild;
  target.insertBefore(fragment, ref);
};

// Update the view, either for an instance (the scope points to the stack for
// the instance) or for the component, i.e., all instances (then apply to all
// stacks.)
View.render_update = function (update) {
  update_stacks(update, function (stack) {
    var target = find_dom_parent(update, stack);
    var ref = find_dom_ref(update, stack, target);
    var update_last = !ref && target === stack[stack.i].target;
    if (update_last) {
      ref = stack[stack.i].last.nextSibling;
    }
    update.target.render(stack, target, ref);
    if (update_last) {
      stack[stack.i].last = stack[stack.i].last.nextSibling;
    }
  });
};

// Update the text of a view element
ViewElement.update_text = function (update) {
  update_stacks(update, function (stack) {
    find_dom(update, stack).textContent = update.target.text();
  });
}

// Update a text element depending on its parent (either view element or
// attribute)
Text.render_update = function (update) {
  var f = this.parent && this.parent.update_text;
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

DOMElement.update_attribute = function (update) {
  update_stacks(update, function (stack) {
    var dom = find_dom(update, stack);
    var value = this.attrs[update.ns][update.name];
    if (update.ns) {
      dom.setAttributeNS(update.ns, update.name, value);
    } else {
      dom.setAttribute(update.name, value);
    }
  }.bind(this));
};


Attribute.render = function (_, target) {
  // jshint unused: true
  if (this.namespace_uri) {
    target.setAttributeNS(this.namespace_uri, this.local_name,
        this.shallow_text);
  } else {
    target.setAttribute(this.local_name, this.shallow_text);
  }
};

Attribute.update_text = function (update) {
  update.target = this.parent;
  update_stacks(update, function (stack) {
    update.target.render(stack, find_dom_parent(update, stack));
  });
}


Text.render = function (_, target, ref) {
  // jshint unused: true, -W093
  var node = target.ownerDocument.createTextNode(this.text());
  node.__bender = this;
  return this.target = target.insertBefore(node, ref);
};


function find_dom(update, stack) {
  return flexo.bfirst(stack[stack.i].target,
    update.target.hasOwnProperty("target") ? function (p) {
      return p.__bender && p.__bender === update.target || p.childNodes;
    } : function (p) {
      return p.__bender &&
        Object.getPrototypeOf(p.__bender) === update.target &&
        p.__bender.view === stack[stack.i].view || p.childNodes;
    });
}

// TODO store instances of view nodes?
function find_dom_parent(update, stack) {
  var parent = update.target.parent;
  var target = stack[stack.i].target;
  if (parent.view === parent) {
    return target;
  }
  return flexo.bfirst(target, parent.hasOwnProperty("target") ?
      function (p) {
        return p.__bender && p.__bender === parent || p.childNodes;
      } : function (p) {
        return p.__bender && Object.getPrototypeOf(p.__bender) === parent &&
          p.__bender.view === stack[stack.i].view || p.childNodes;
      });
}

function find_dom_ref(update, stack, target) {
  var parent = update.target.parent;
  var ref = parent.children[parent.children.indexOf(update.target) + 1];
  return ref && flexo.find_first(target.childNodes,
      parent.hasOwnProperty("target") ?  function (p) {
        return p.__bender && p.__bender === ref;
      } : function (p) {
        return p.__bender && Object.prototype(p.__bender) === ref &&
          p.__bender.view === stack[stack.i].view;
      });
}

// Update all stacks for a given update
function update_stacks(update, f) {
  var update_stack = function (stack) {
    for (stack.i = 0; stack[stack.i]["#this"] !== update.scope["#this"];
      ++stack.i) {}
    f(stack);
    delete stack.i;
  };
  if (update.scope.stack) {
    update_stack(update.scope.stack);
  } else {
    update.scope["#this"].all_instances.map(flexo.property("scope", "stack"))
      .forEach(update_stack);
  }
}
