"use strict";

function _ext(Proto, properties) {
  var object = Object.create(Proto);
  for (var p in properties) {
    object[p] = properties[p];
  }
  return object;
}


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
        // TODO Update scope
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
    if (ref) {
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
    // update(this.current_component, { type: "add", target: child });
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
    this.scope = _ext(scope, { "@this": this, "#this": this });
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

  render: function (parent, ref) {
    if (!this.rendered) {
      if (this.scope.view) {
        this.scope.view.render(parent, ref);
        this.rendered = true;
      }
    }
  }
});

flexo.make_readonly(Component, "tag", "component");
flexo.make_readonly(Component, "component", flexo.self);


var View = _ext(Element, {
  render: function (parent, ref) {
    var fragment = parent.ownerDocument.createDocumentFragment();
    this.children.forEach(function (child) {
      child.render(fragment);
    });
    parent.insertBefore(fragment, ref);
  }
});

flexo.make_readonly(View, "tag", "view");


var DOMElement = _ext(Element, {
  init: function (ns, name) {
    this.namespace_uri = ns;
    this.local_name = name;
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

  render: function (parent, ref) {
    var elem = parent.ownerDocument.createElementNS(this.namespace_uri,
      this.local_name);
    this.children.forEach(function (child) {
      child.render(elem);
    });
    return parent.insertBefore(elem, ref);
  }
});

var TextNode = _ext(Element, {
  init: function () {
    this.parent = null;
    return this;
  },
  render: function (parent, ref) {
    return parent.insertBefore(parent.ownerDocument.createTextNode(this.text()),
      ref);
  }
});

flexo._accessor(TextNode, "text", "");


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


var scope = { document: window.document, environment: {} };
var c = Component.create(scope).child(View.create()
    .child(flexo.$p("Hello, world!")));
c.render(document.body);
