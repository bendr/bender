/* global bender, $call, console, flexo, $foreach, $map, window */
// jshint -W097

"use strict";

bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


// Load a component from an URL in the environment and return a promise which is
// fulfilled once the component has been loaded and deserialized (which may lead
// to loading additional components for its prototype and its children.) Once
// the component is loaded and deserialization starts, store the incomplete
// component in the promise so that it can already be referred to (e.g., to
// check for cycles in the prototype chain.)
bender.Environment.load_component = function (url) {
  url = flexo.normalize_uri(url);
  if (this.urls[url]) {
    return this.urls[url];
  }
  var response_;
  var promise = this.urls[url] = flexo.ez_xhr(url, {
    responseType: "document", mimeType: "text/xml"
  }).then(function (response) {
    response_ = response;
    promise.url = url;
    return this.deserialize(response.documentElement, promise);
  }.bind(this)).then(function (component) {
    if (component && component.tag === "component") {
      delete promise.component;
      return component.url(url).loaded();
    } else {
      throw { message: "not a Bender component", response: response_ };
    }
  });
  return promise;
};

// Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
// than element, text and CDATA) are simply skipped, with a warning in the case
// of unknown Bender elements (as it probably means that another namespace was
// meant, or that a deprecated tag was used.) Deserializing a component that was
// just loaded should set the component field of the promise that was created to
// load this component so it passed as an extra parameter to deserialize.
// TODO keep original attributes for deserialized elements so that they can be
// serialized back.
bender.Environment.deserialize = function (node, promise) {
  if (node.nodeType === window.Node.ELEMENT_NODE) {
    if (node.namespaceURI === bender.ns) {
      var f = this.deserialize[node.localName];
      if (typeof f === "function") {
        return f.call(this, node, promise);
      } else {
        console.warn("Unknow element in Bender namespace: “%0” in %1"
            .fmt(node.localName, node.baseURI));
      }
    } else {
      return this.deserialize_foreign(node);
    }
  } else if (node.nodeType === window.Node.TEXT_NODE ||
      node.nodeType === window.Node.CDATA_SECTION_NODE) {
    return bender.Text.create().text(node.textContent);
  }
};

// Deserialize then add every child of a parent node `p` in the list of children
// to the Bender element `e`, then return `e`.
bender.Environment.deserialize_children = function (e, p) {
  return flexo.fold_promises($map(p.childNodes, function (ch) {
      return this.deserialize(ch);
    }, this), $call.bind(function (child) {
      return child && bender.Component.child.call(this, child) || this;
    }), e);
};

// Deserialize a foreign element and its contents (attributes and children),
// creating a generic DOM element object.
bender.Environment.deserialize_foreign = function (elem) {
  var e = bender.DOMElement.create(elem.namespaceURI, elem.localName);
  for (var i = 0, n = elem.attributes.length; i < n; ++i) {
    var attr = elem.attributes[i];
    var ns = attr.namespaceURI || "";
    if (ns === "") {
      if (attr.localName === "id") {
        e.id(attr.value);
      } else if (attr.localName === "render-id") {
        e.renderId(attr.value);
      } else {
        e.attr(ns, attr.localName, attr.value);
      }
    } else {
      e.attr(ns, attr.localName, attr.value);
    }
  }
  return this.deserialize_children(e, elem);
};

// Deserialize a component from an element. A component is created and, if the
// second parameter promise is passed, its component property is set to the
// newly created component, so that further references can be made before the
// component is fully deserialized.
bender.Environment.deserialize.component = function (elem, promise) {
  var component = this.component();
  if (promise) {
    promise.component = component;
  }
  $foreach(elem.attributes, function (attr) {
    if (attr.namespaceURI === null) {
      if (attr.localName.indexOf("on-") === 0) {
        component.on(attr.localName.substr(3), attr.value);
      } else if (attr.localName === "id") {
        component.id(attr.value);
      } else if (attr.localName !== "href") {
        component.init_values[attr.localName] = attr.value;
      }
    } else if (attr.namespaceURI === bender.ns) {
      component.init_values[attr.localName] = attr.value;
    }
  });
  return (function () {
    var children = this.deserialize_children(component, elem);
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"));
      var promise = this.urls[url];
      if (promise) {
        if (promise.value) {
          component.prototype(promise.value);
        } else if (promise.component) {
          component.prototype(promise.component);
          return flexo.collect_promises([promise, children]);
        } else {
          return flexo.collect_promises([promise.then(function (prototype) {
            component.prototype(prototype);
          }), children]);
        }
      } else {
        return flexo.collect_promises([this.load_component(url)
          .then(function (prototype) {
            component.prototype(prototype);
          }), children]);
      }
    }
    return children;
  }.call(this)).then(function () {
    return component.load_links();
  });
};

bender.Environment.deserialize.view = function (elem) {
  return this.deserialize_children(bender.View.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id"))
      .stack(elem.getAttribute("stack")), elem);
};

bender.Environment.deserialize.content = function (elem) {
  return this.deserialize_children(bender.Content.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id")), elem);
};

bender.Environment.deserialize.attribute = function (elem) {
  return this.deserialize_children(bender.Attribute
      .create(flexo.safe_string(elem.getAttribute("ns")),
        flexo.safe_string(elem.getAttribute("name")))
      .id(elem.getAttribute("id")), elem);
};

bender.Environment.deserialize.text = function (elem) {
  return this.deserialize_children(bender.Text.create().text(shallow_text(elem))
      .id(elem.getAttribute("id")), elem);
};


var loaded = bender.Component.loaded = function () {
  this.scope.children.forEach($call.bind(loaded));
  // this.render_graph();
  return this;
};


// Return the concatenation of all text children (and only children) of elem.
// Any other content (including child elements) is skipped.
function shallow_text(elem) {
  var text = "";
  for (var ch = elem.firstChild; ch; ch = ch.nextSibling) {
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      text += ch.textContent;
    }
  }
  return text;
}
