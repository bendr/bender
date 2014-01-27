/* global Attribute, bender, Component, console, Content, DOMElement,
   Environment, flexo, Link, Property, Script, Style, Text, View, window */
// jshint -W097

"use strict";


// Load a component from an URL in the environment and return a promise which is
// fulfilled once the component has been loaded and deserialized (which may lead
// to loading additional components, for its prototype, and its children.)
Environment.load_component = function (url, origin) {
  url = flexo.normalize_uri(flexo.base_uri(this.scope.document), url);
  if (origin && this.urls[origin]) {
    this.urls[origin].__prototype = url;
    for (var u = url; this.urls[u]; u = this.urls[u].__prototype) {
      if (u === origin) {
        throw "cycle in prototype chain for %0".fmt(url);
      }
    }
  }
  if (this.urls[url]) {
    return this.urls[url];
  }
  var response_;
  var promise = this.urls[url] = flexo.ez_xhr(url, {
    responseType: "document", mimeType: "text/xml"
  }).then(function (response) {
    response_ = response;
    return this.deserialize(response.documentElement);
  }.bind(this)).then(function (component) {
    if (component && component.tag === "component") {
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
Environment.deserialize = function (node) {
  if (node.nodeType === window.Node.ELEMENT_NODE) {
    if (node.namespaceURI === bender.ns) {
      var f = this.deserialize[node.localName];
      if (typeof f === "function") {
        return f.call(this, node);
      } else {
        console.warn("Unknow element in Bender namespace: “%0” in %1"
            .fmt(node.localName, flexo.base_uri(node)));
      }
    } else {
      return this.deserialize_foreign(node);
    }
  } else if (node.nodeType === window.Node.TEXT_NODE ||
      node.nodeType === window.Node.CDATA_SECTION_NODE) {
    return Text.create().text(node.textContent);
  }
};

// Deserialize then add every child of a parent node `p` in the list of children
// to the Bender element `e`, then return `e`.
Environment.deserialize_children = function (e, p) {
  return flexo.fold_promises(flexo.map(p.childNodes, function (ch) {
      return this.deserialize(ch);
    }, this), flexo.call.bind(function (child) {
      return child && Component.child.call(this, child) || this;
    }), e);
};

// Deserialize a foreign element and its contents (attributes and children),
// creating a generic DOM element object.
Environment.deserialize_foreign = function (elem) {
  var e = DOMElement.create(elem.namespaceURI, elem.localName);
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

// Deserialize common properties and contents for elements that have a value
// (property, get, set): handles id, as, match, and value (either attribute
// or text content.)
Environment.deserialize_element_with_value = function (e, elem) {
  e.id(elem.getAttribute("id"))
    // .as(elem.getAttribute("as"))
    // .match_string(elem.getAttribute("match"))
    .delay(elem.getAttribute("delay"));
  /*if (elem.hasAttribute("value")) {
    e.set_value_from_string(elem.getAttribute("value"), true, elem.baseURI);
  } else {
    var t = shallow_text(elem);
    if (/\S/.test(t)) {
      e.set_value_from_string(t, false, elem.baseURI);
    }
  }*/
  return this.deserialize_children(e, elem);
};

// Deserialize a component from an element.
// TODO handle cycle detection since we don’t have a temporary component
// anymore?
Environment.deserialize.component = function (elem) {
  var base_uri = flexo.base_uri(elem);
  var component;
  var fill_component = function () {
    component.url(base_uri);
    delete component.__pending_init;
    flexo.foreach(elem.attributes, function (attr) {
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
    return this.deserialize_children(component, elem);
  }.bind(this);
  return (function () {
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(base_uri, elem.getAttribute("href"));
      return this.load_component(url, base_uri).then(function (prototype) {
        component = this.component(prototype);
        return fill_component.call();
      }.bind(this));
    } else {
      component = this.component();
      return fill_component();
    }
  }.call(this)).then(function () {
    component.on_handlers.init.call(component);
    return component.load_links();
  });
};

Environment.deserialize.view = function (elem) {
  return this.deserialize_children(View.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id"))
      .stack(elem.getAttribute("stack")), elem);
};

Environment.deserialize.content = function (elem) {
  return this.deserialize_children(Content.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id")), elem);
};

Environment.deserialize.attribute = function (elem) {
  return this.deserialize_children(Attribute
      .create(flexo.safe_string(elem.getAttribute("ns")),
        flexo.safe_string(elem.getAttribute("name")))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.link = function (elem) {
  return this.deserialize_children(Link.create(elem.getAttribute("rel"),
        elem.getAttribute("href"))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.script = function (elem) {
  return this.deserialize_children(Script.create()
      .text(shallow_text(elem))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.style = function (elem) {
  return this.deserialize_children(Style.create()
      .text(shallow_text(elem))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.text = function (elem) {
  return this.deserialize_children(Text.create().text(shallow_text(elem))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize["event"] = function (elem) {
  return this.deserialize_children(Event.create(elem.getAttribute("name"))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.property = function (elem) {
  return this.deserialize_children(Property
      .create(elem.getAttribute("name"))
      .id(elem.getAttribute("id")), elem);
};

Environment.deserialize.watch = function (elem) {
  return this.deserialize_children(Watch.create().id(elem.getAttribute("id")),
      elem);
};

Environment.deserialize.get = function (elem) {
  var get;
  if (elem.hasAttribute("dom-event")) {
    get = GetDOMEvent.create(elem.getAttribute("dom-event"),
        elem.getAttribute("property"))
      .select(elem.getAttribute("select"))
      .preventDefault(elem.getAttribute("prevent-default") ||
          elem.getAttribute("preventDefault"))
      .stopPropagation(elem.getAttribute("stop-propagation") ||
          elem.getAttribute("stopPropagation"));
  /*} else if (elem.hasAttribute("event")) {
    get = new bender.GetEvent(elem.getAttribute("event"))
        .select(elem.getAttribute("select"));*/
  } else if (elem.hasAttribute("property")) {
    get = GetProperty.create(elem.getAttribute("property"))
        .select(elem.getAttribute("select"));
  /*} else if (elem.hasAttribute("attr")) {
    get = new bender.GetAttribute(elem.getAttribute("attr"))
        .select(elem.getAttribute("select"));*/
  }
  return this.deserialize_element_with_value(get, elem);
};


var loaded = Component.loaded = function () {
  this.scope.children.forEach(flexo.call.bind(loaded));
  this.render_graph();
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
