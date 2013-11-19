(function (bender) {
  "use strict";

  /* global console, flexo, window, $call, $foreach, $map */

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  var serializer;


  // Load a component from an URL in the environment and return a promise which
  // is fulfilled once the component has been loaded and deserialized (which may
  // lead to loading additional components for its prototype and its children.)
  // Once the component is loaded and deserialization starts, store the
  // incomplete component in the promise so that it can already be referred to
  // (e.g., to check for cycles in the prototype chain.)
  bender.Environment.prototype.load_component = function (url) {
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
      if (component instanceof bender.Component) {
        delete promise.component;
        return component.url(url).loaded();
      } else {
        throw { message: "not a Bender component", response: response_ };
      }
    });
    return promise;
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than element, text and CDATA) are simply skipped, with a warning in the
  // case of unknown Bender elements (as it probably means that another
  // namespace was meant, or that a deprecated tag was used.) Deserializing a
  // component that was just loaded should set the component field of the
  // promise that was created to load this component so it passed as an extra
  // parameter to deserialize.
  // TODO keep original attributes for deserialized elements so that they can be
  // serialized back.
  bender.Environment.prototype.deserialize = function (node, promise) {
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
      return new bender.DOMTextNode().text(node.textContent);
    }
  };

  // Deserialize then add every child of a parent node `p` in the list of
  // children to the Bender element `e`, then return `e`.
  bender.Environment.prototype.deserialize_children = function (e, p) {
    return flexo.fold_promises($map(p.childNodes, function (ch) {
        return this.deserialize(ch);
      }, this), $call.bind(bender.Component.prototype.child), e);
  };

  // Deserialize common properties and contents for elements that have a value
  // (property, get, set): handles id, as, match, and value (either attribute
  // or text content.)
  bender.Environment.prototype.deserialize_element_with_value = function (e, elem) {
    e.as(elem.getAttribute("as")).id(elem.getAttribute("id"))
      .match(elem.getAttribute("match")).delay(elem.getAttribute("delay"));
    if (elem.hasAttribute("value")) {
      e.set_value_from_string(elem.getAttribute("value"), true, elem.baseURI);
    } else {
      var t = shallow_text(elem);
      if (/\S/.test(t)) {
        e.set_value_from_string(t, false, elem.baseURI);
      }
    }
    return this.deserialize_children(e, elem);
  };

  // Deserialize a foreign element and its contents (attributes and children),
  // creating a generic DOM element object.
  bender.Environment.prototype.deserialize_foreign = function (elem) {
    var e = new bender.DOMElement(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns === "" && attr.localName === "id") {
        e.id(attr.value);
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
  bender.Environment.prototype.deserialize.component = function (elem, promise) {
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

  bender.Environment.prototype.deserialize.link = function (elem) {
    return this.deserialize_children(new bender.Link(elem.getAttribute("rel"),
          flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"))), elem);
  };

  bender.Environment.prototype.deserialize.view = function (elem) {
    return this.deserialize_children(new bender.View()
        .id(elem.getAttribute("id"))
        .render_id(elem.getAttribute("render-id"))
        .stack(elem.getAttribute("stack")), elem);
  };

  bender.Environment.prototype.deserialize.content = function (elem) {
    return this.deserialize_children(new bender.Content()
        .id(elem.getAttribute("id")), elem);
  };

  bender.Environment.prototype.deserialize.attribute = function (elem) {
    var attr = new bender.Attribute(elem.getAttribute("ns"),
        elem.getAttribute("name")).id(elem.getAttribute("id"));
    return this.deserialize_children(attr, elem);
  };

  bender.Environment.prototype.deserialize.text = function (elem) {
    return this.deserialize_children(new bender.Text(shallow_text(elem))
        .id(elem.getAttribute("id")), elem);
  };

  bender.Environment.prototype.deserialize.property = function (elem) {
    return this.deserialize_element_with_value(new
        bender.Property(elem.getAttribute("name"))
      .select(elem.getAttribute("select")), elem);
  };

  bender.Environment.prototype.deserialize.event = function (elem) {
    return new bender.Event(elem.getAttribute("name"));
  };

  bender.Environment.prototype.deserialize.watch = function (elem) {
    return this.deserialize_children(new bender.Watch()
        .id(elem.getAttribute("id"))
        .match(elem.getAttribute("match")), elem);
  };

  bender.Environment.prototype.deserialize.get = function (elem) {
    var get;
    if (elem.hasAttribute("dom-event")) {
      get = new bender.GetDOMEvent(elem.getAttribute("dom-event"),
          elem.getAttribute("property"))
        .select(elem.getAttribute("select"))
        .prevent_default(flexo.is_true(elem.getAttribute("prevent-default")))
        .stop_propagation(flexo.is_true(elem.getAttribute("stop-propagation")));
    } else if (elem.hasAttribute("event")) {
      get = new bender.GetEvent(elem.getAttribute("event"))
          .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("property")) {
      get = new bender.GetProperty(elem.getAttribute("property"))
          .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("attr")) {
      get = new bender.GetAttribute(elem.getAttribute("attr"))
          .select(elem.getAttribute("select"));
    }
    return this.deserialize_element_with_value(get, elem);
  };

  bender.Environment.prototype.deserialize.set = function (elem) {
    var set;
    if (elem.hasAttribute("dom-event")) {
      set = new bender.SetDOMEvent(elem.getAttribute("dom-event"))
            .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("event")) {
      set = new bender.SetEvent(elem.getAttribute("event"))
          .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("dom-property")) {
      set = new bender.SetDOMProperty(elem.getAttribute("dom-property"))
          .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("property")) {
      set = new bender.SetProperty(elem.getAttribute("property"))
          .select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("dom-attr")) {
      set = new bender.SetDOMAttribute(
        flexo.safe_string(elem.getAttribute("ns")),
        elem.getAttribute("dom-attr")).select(elem.getAttribute("select"));
    } else if (elem.hasAttribute("attr")) {
      set = new bender.SetAttribute(elem.getAttribute("attr"))
          .select(elem.getAttribute("select"));
    } else {
      set = new bender.Set();
    }
    return this.deserialize_element_with_value(set, elem);
  };


  bender.Element.prototype.serialize_element = function (document) {
    return this.serialize_children(this.serialize_attributes(document
        .createElementNS(bender.ns, this.element_name)));
  };

  bender.Element.prototype.serialize_attributes = function (element) {
    Object.keys(this.attributes).forEach(function (ns) {
      Object.keys(this.attributes[ns]).forEach(function (name) {
        element.setAttributeNS(ns, name, this.attributes[ns][name]);
      }, this);
    }, this);
    if (this._id) {
      element.setAttribute("id", this._id);
    }
    return element;
  };

  bender.Element.prototype.serialize_children = function (element) {
    this.children.forEach(function (ch) {
      element.appendChild(ch.serialize_element(element.ownerDocument));
    });
    return element;
  };


  var loaded = bender.Component.prototype.loaded = function () {
    this.child_components.forEach($call.bind(loaded));
    this.render_graph();
    return this;
  };

  bender.Component.prototype.serialize = function () {
    var document = this.scope.$document.implementation.createDocument(bender.ns,
        this.element_name);
    this.serialize_children(this
        .serialize_attributes(document.documentElement));
    return document;
  };

  bender.Component.prototype.as_xml = function () {
    if (!serializer) {
      serializer = new flexo.global.XMLSerializer();
    }
    return serializer.serializeToString(this.serialize());
  };

  bender.Component.prototype.serialize_attributes = function (element) {
    if (this._prototype) {
      element.setAttribute("href", this._prototype.url());
    }
    return bender.Element.prototype.serialize_attributes.call(this, element);
  };

  Object.defineProperty(bender.Component.prototype, "element_name",
      { enumerable: true, value: "component" });


  Object.defineProperty(bender.Property.prototype, "element_name",
      { enumerable: true, value: "property" });

  bender.Property.prototype.serialize_attributes = function (element) {
    element.setAttribute("name", this.name);
    element.setAttribute("as", this.as());
    return bender.Element.prototype.serialize_attributes.call(this, element);
  };


  Object.defineProperty(bender.View.prototype, "element_name",
      { enumerable: true, value: "view" });


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

}(this.bender));
