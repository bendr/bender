// HTML runtime for Bender, based on the functional core.

// TODO 
// [ ] select="*" for GetEvent: listen to notifications from anyone. Create an
//       EventVertex that anyone can inherit from.
// [ ] message="foo" for GetEvent, same as event="foo" delay="0"

/* global console, flexo */

(function (bender) {
  "use strict";

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  var urls = {};  // URL map for loaded resources

  // Load a component from an URL and return a promise which is fulfilled once
  // the component has been loaded and deserialized (which may lead to loading
  // additional components, for its prototype, and its children.) Origin is an
  // origin URL (i.e. the URL of a component that requires the loading of
  // another component) to check for dependency cycles.
  bender.load_component = function (url, origin) {
    url = flexo.normalize_uri(flexo.base_uri(window.document), url);
    if (origin && urls[origin]) {
      urls[origin].__prototype = url;
      for (var u = url; urls[u]; u = urls[u].__prototype) {
        if (u === origin) {
          throw "cycle in prototype chain for %0".fmt(url);
        }
      }
    }
    if (urls[url]) {
      return urls[url];
    }
    var response_;
    var promise = urls[url] = flexo.ez_xhr(url, {
      responseType: "document", mimeType: "text/xml"
    }).then(function (response) {
      response_ = response;
      return deserialize(response.documentElement);
    }).then(function (component) {
      if (component &&
        typeof component.url === "function" &&
        typeof component.finalize === "function") {
        return component.url(url).finalize();
      } else {
        throw { message: "not a Bender component", response: response_ };
      }
    });
    return promise;
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than element, text and CDATA) are simply skipped, with a warning in the
  // case of unknown Bender elements (as it probably means that another
  // namespace was meant, or that a deprecated tag was used.)
  function deserialize(node) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        var f = deserialize[node.localName];
        if (typeof f === "function") {
          return f(node);
        } else {
          console.warn("Unknow element in Bender namespace: “%0” in %1"
              .fmt(node.localName, flexo.base_uri(node)));
        }
      // } else if (node.namespaceURI in scope.ns) {
      //   return deserialize_custom(node);
      } else {
        return deserialize_foreign(node);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      return bender.Text.create().text(node.textContent);
    }
  }

  // Deserialize a component from an element. If the component element has a
  // href attribute, first deserialize that component then use it as the
  // prototype for this component, otherwise create a new component.
  deserialize.component = function (elem) {
    var base_uri = flexo.base_uri(elem);
    return (function () {
      if (elem.hasAttribute("href")) {
        var url = flexo.normalize_uri(base_uri, elem.getAttribute("href"));
        return bender.load_component(url, base_uri)
          .then(function (prototype) {
            return deserialize_component(elem, prototype.create(), base_uri);
          });
      } else {
        return deserialize_component(elem, bender.Component.create(), base_uri);
      }
    }()).then(function (component) {
      // component.on_handlers.init.call(component);
      return load_links(component);
    });
  };

  // Deserialize the view element
  deserialize.view = function (elem) {
    return deserialize_children(bender.View.create(), elem);
  };

  // Load all links for a component.
  function load_links(component) {
    return;
    var links = [];
    for (var p = component; p.links; p = Object.getPrototypeOf(p)) {
      flexo.unshift_all(links, p.links);
    }
    return flexo.collect_promises(links.map(function (link) {
      return link.load();
    })).then(flexo.self.bind(component));
  };
    

  // Deserialize the contents of the component created
  function deserialize_component(elem, component, url) {
    deserialize_component_attributes(elem, component, url);
    var view;
    flexo.foreach(elem.childNodes, function (ch) {
      if (ch.nodeType !== window.Node.ELEMENT_NODE ||
        ch.namespaceURI !== bender.ns) {
        return;
      }
      if (ch.localName === "view") {
        view = deserialize.view(ch);
      } else {
        var f = deserialize_component[ch.localName];
        if (typeof f === "function") {
          f(component, ch);
        }
      }
    });
    return view ?
      view.then(component.set_view.bind(component)) :
      new flexo.Promise().fulfill(component);
  }

  // Deserialize the attributes of the component element
  function deserialize_component_attributes(elem, component, url, custom) {
    component.url(url);
    // delete component.__pending_init;
    // Attributes of the component element
    flexo.foreach(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.indexOf("on-") === 0) {
          component.on(attr.localName.substr(3), attr.value);
        } else if (attr.localName === "name") {
          component.name(attr.value);
        } else if (attr.localName !== "href" || custom) {
          component.init_values[attr.localName] = attr.value;
        }
      } else if (attr.namespaceURI === bender.ns) {
        component.properties[attr.localName] = attr.value;
      }
    });
  }

  // Deserialize a foreign element and its contents (attributes and children),
  // creating a DOMElement node.
  function deserialize_foreign(elem) {
    var e = bender.DOMElement.create(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns === "") {
        if (attr.localName === "name") {
          e.name(attr.value);
        // } else if (attr.localName === "render-id") {
        //   e.renderId(attr.value);
        } else {
          e.attr(ns, attr.localName, attr.value);
        }
      } else {
        e.attr(ns, attr.localName, attr.value);
      }
    }
    return deserialize_children(e, elem);
  }

  // Deserialize then add every child of a parent node `parent` in the list of
  // children to the Bender element `elem`, then return `elem`.
  function deserialize_children(elem, parent) {
    return flexo.fold_promises(flexo.map(parent.childNodes, function (child) {
        return deserialize(child);
      }), flexo.call.bind(function (child) {
        return child && this.child(child) || this;
      }), elem);
  }


  bender.WatchGraph.dump = function () {
    this.vertices.forEach(function (vertex, i) {
      vertex.__index = i;
    });
    this.edges.forEach(function (edge, i) {
      console.log("%0. %1 -> %2 = %3"
        .fmt(i + 1, edge.source.desc(), edge.dest.desc(), edge.priority));
    });
    this.vertices.forEach(function (vertex) {
      delete vertex.__index;
    });
  };

  bender.Vertex.desc = function () {
    return "v%0".fmt(this.__index);
  };

  bender.WatchVertex.desc = function () {
    return "v%0 [watch of %1]".fmt(this.__index, this.watch.component.name());
  };

  bender.PropertyVertex.desc = function () {
    return "v%0 [%1`%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.name);
  };

  bender.EventVertex.desc = function () {
    return "v%0 [%1!%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.type);
  };

}(this.bender));
