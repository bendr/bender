(function (bender) {
  "use strict";

  /* global console, flexo, window, $call, $map */

  var environment = bender.Environment.prototype;
  var component = bender.Component.prototype;
  var property = bender.Property.prototype;

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than elements, text and CDATA) are simply skipped, possibly with a warning
  // in the case of unknown Bender elements (as it probably means that another
  // namespace was meant; or a deprecated tag was used.) Deserializing a
  // component that was just loaded should set the component field of the
  // promise that was created to load this component so it passed as an extra
  // parameter to deserialize.
  environment.deserialize = function (node, promise) {
    if (node instanceof window.Node) {
      if (node.nodeType === window.Node.ELEMENT_NODE) {
        if (node.namespaceURI === bender.ns) {
          var f = this.deserialize[node.localName];
          if (typeof f === "function") {
            return f.call(this, node, promise);
          } else {
            console.warn("Unknow element in Bender namespace: %0 in %1"
                .fmt(node.localName, node.baseURI));
          }
        } else {
          return this.deserialize_foreign(node);
        }
      } else if (node.nodeType === window.Node.TEXT_NODE ||
          node.nodeType === window.Node.CDATA_SECTION_NODE) {
        return new bender.DOMTextNode().text(node.textContent);
      }
    } else {
      throw "Deserialization error: expected a node; got: %0 in %1"
        .fmt(node, node.baseURI);
    }
  };

  // Deserialize then add every child of p in the list of children to the Bender
  // element e, then return e.
  environment.deserialize_children = function (e, p) {
    return flexo.fold_promises($map(p.childNodes, function (ch) {
        return this.deserialize(ch);
      }, this), $call.bind(component.child), e);
  };

  // Deserialize a foreign element and its contents (attributes and children),
  // creating a generic DOM element object.
  environment.deserialize_foreign = function (elem) {
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

  environment.deserialize.link = function (elem) {
    return this.deserialize_children(new bender.Link(this,
          elem.getAttribute("rel"),
          flexo.normalize_uri(elem.baseURI, elem.getAttribute("href"))), elem);
  };

  environment.deserialize.event = function (elem) {
    return new bender.Event(elem.getAttribute("name"));
  };

  environment.deserialize.view = function (elem) {
    return this.deserialize_children(new bender.View()
        .id(elem.getAttribute("id"))
        .render_id(elem.getAttribute("render-id"))
        .stack(elem.getAttribute("stack")), elem);
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

  component.serialize = function () {
    var document = this.scope.$document.implementation.createDocument(bender.ns,
        this.element_name);
    this.serialize_children(this
        .serialize_attributes(document.documentElement));
    return document;
  };

  var serializer;

  component.as_xml = function () {
    if (!serializer) {
      serializer = new flexo.global.XMLSerializer();
    }
    return serializer.serializeToString(this.serialize());
  };

  component.serialize_attributes = function (element) {
    if (this._prototype) {
      element.setAttribute("href", this._prototype.url());
    }
    return bender.Element.prototype.serialize_attributes.call(this, element);
  };

  Object.defineProperty(component, "element_name", { enumerable: true,
    value: "component" });

  Object.defineProperty(property, "element_name", { enumerable: true,
    value: "property" });

  property.serialize_attributes = function (element) {
    element.setAttribute("name", this.name);
    element.setAttribute("as", this.as());
    return bender.Element.prototype.serialize_attributes.call(this, element);
  };

  Object.defineProperty(bender.View.prototype, "element_name",
      { enumerable: true, value: "view" });

}(this.bender));
