(function (bender) {

  bender.version = "0.8.2-h";
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Load a component and return a promise. The defaults object should contain
  // the defaults, including a href property for the URL of the component to
  // load; alternatively, a URL as string may be provided. If no environment
  // parameter is passed, a new one is created for the current document.
  bender.load_component = function (defaults, env) {
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
      { href: defaults });
    if (args.href) {
      if (!env) {
        env = new bender.Environment;
      }
      return env
        .load_component(flexo.absolute_uri(env.document.baseURI, args.href));
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

  // Create a new environment in a document, or window.document by default.
  bender.Environment = function (document) {
    this.document = document || window.document;
    this.urls = {};
  };

  // Load a component from an URL in the environment and return a promise. If
  // loading fails, return an object with a reason, the current environment, and
  // possibly the original XHMLHttpRequest or the response from said request.
  bender.Environment.prototype.load_component = function (url) {
    var response_;
    return this.urls[url] || flexo.ez_xhr(url, { responseType: "document" })
      .then(function (response) {
        response_ = response;
        return this.deserialize(response.documentElement);
      }.bind(this)).then(function (d) {
        if (d instanceof bender.Component) {
          this.urls[url] = new flexo.Promise().fulfill(d);
          d.url = url;
          return d;
        } else {
          var reason = { response: response_, reason: "not a Bender component",
            environment: this };
          this.urls[url] = new flexo.Promise().reject(reason);
          throw reason;
        }
      }.bind(this), function (reason) {
        this.urls[url] = new flexo.Promise().reject(reason);
        reason.environment = this;
        throw reason;
      }.bind(this));
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than elements, text and CDATA) are simply skipped, possibly with a warning
  // in the case of unknown Bender elements (as it probably means that another
  // namespace was meant; or a deprecated tag was used.)
  bender.Environment.prototype.deserialize = function (node) {
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node);
          } else {
            console.warn("Unknow element in Bender namespace: %0"
                .fmt(node.localName));
          }
        } else {
          return this.deserialize_foreign(node);
        }
      } else if (node.nodeType == window.Node.TEXT_NODE ||
          node.nodeType == window.Node.CDATA_SECTION_NODE) {
        return new bender.DOMTextNode(node.textContent);
      }
    } else {
      throw "Deseralization error: expected a node; got: %0".fmt(node);
    }
  };

  // Deserialize a foreign element and its contents (attribute and children),
  // creating a generic DOM element object.
  bender.Environment.prototype.deserialize_foreign = function (elem) {
    var attrs = {};
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (!attrs.hasOwnProperty(ns)) {
        attrs[ns] = {};
      }
      attrs[ns][attr.localName] = attr.value;
    }
    var e = new bender.DOMElement(elem.namespaceURI, elem.localName, attrs);
    return new flexo.Promise().fulfill(e).append_children(elem, this);
  };

  // Helper function for deserialize to handle all children of `elem` in the
  // environment `env`, whether the result of deserialization is a promise
  // (e.g., a component) or an immediate value (a Bender object.)
  flexo.Promise.prototype.append_children = function (elem, env) {
    return this.each(elem.childNodes, function (ch, parent) {
      var p = env.deserialize(ch);
      if (p instanceof flexo.Promise) {
        return p.then(function (d) {
          parent.append_child(d);
          return parent;
        });
      } else {
        parent.append_child(p);
        return parent;
      }
    });
  };

  bender.Component = function (environment) {
    this.environment = environment;
    this.links = [];
    this.children = [];
  };

  bender.Environment.prototype.deserialize.component = function (elem) {
    var component = new bender.Component(this);
    // TODO attributes
    // TODO check the prototype chain for loops
    return (elem.hasAttribute("href") ?
      this.load_component(flexo.absolute_uri(elem.baseURI,
          elem.getAttribute("href")))
        .then(function (prototype) {
          component.$prototype = prototype;
          return component;
        }) : new flexo.Promise().fulfill(component))
      .append_children(elem, this);
  };

  bender.Component.prototype.append_child = function (child) {
    if (!child) {
      return;
    }
    if (child instanceof bender.Link) {
      this.links.push(child);
      child.parent = this;
    } else if (child instanceof bender.View) {
      if (this.view) {
        console.warn("Component already has a view");
        return;
      } else {
        this.view = child;
      }
    }
    child.parent = this;
    return child;
  };

  // Render the links, then the view. Link rendering may delay rendering the
  // view (e.g., scripts need to finish loading before the view can be rendered)
  bender.Component.prototype.render = function (target) {
    var pending_links = 0;
    var render_view = function () {
      if (arguments.length > 0) {
        --pending_links;
      }
      if (pending_links == 0) {
        if (this.view) {
          this.view.render(target);
        }
      }
    }.bind(this);
    this.links.forEach(function (link) {
      var p = link.render(target);
      if (p) {
        p.then(render_view);
      }
    });
    render_view();
  };

  bender.Link = function (rel, href) {
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = href;
  };

  bender.Environment.prototype.deserialize.link = function (elem) {
    return new bender.Link(elem.getAttribute("rel"),
        flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")));
  };

  // Render links according to their rel attribute. If a link requires delaying
  // the rest of the rendering, return a promise then fulfill it with a value to
  // resume rendering (see script rendering below.)
  bender.Link.prototype.render = function (target) {
    var render = bender.Link.prototype.render[this.rel];
    if (typeof render == "function") {
      render.call(this, target);
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
    }
  };

  bender.Link.prototype.render.script = function (target) {
    var document = target.ownerDocument;
    var ns = document.documentElement.namespaceURI;
    if (ns == flexo.ns.html) {
      var script = target.ownerDocument.createElement("script");
      script.src = this.href;
      script.async = false;
      var promise = new flexo.Promise;
      script.onload = function () {
        promise.fulfill(script);
      }
      document.head.appendChild(script);
      return promise;
    } else {
      console.warn("Cannot render script link for namespace %0".fmt(ns));
    }
  };

  bender.Link.prototype.render.stylesheet = function () {
    var document = target.ownerDocument;
    var ns = document.documentElement.namespaceURI;
    if (ns == flexo.ns.html) {
      var link = target.ownerDocument.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      document.head.appendChild(script);
    } else {
      console.warn("Cannot render stylesheet link for namespace %0".fmt(ns));
    }
  };

  bender.View = function () {
    this.children = [];
  };

  bender.Environment.prototype.deserialize.view = function (elem) {
    return new flexo.Promise().fulfill(new bender.View).append_children(elem,
        this);
  };

  bender.View.prototype.append_child = function (child) {
    if (child instanceof bender.DOMElement ||
        child instanceof bender.DOMTextNode) {
      this.children.push(child);
      child.parent = this;
    }
  };

  bender.View.prototype.render = function (target) {
    this.children.forEach(function (ch) {
      ch.render(target);
    });
  };

  bender.DOMElement = function (ns, name, attrs, children) {
    this.ns = ns;
    this.name = name;
    this.attrs = attrs || {};
    this.children = children || [];
  };

  bender.DOMElement.prototype.render = function (target) {
    var elem = target.ownerDocument.createElementNS(this.ns, this.name);
    for (var ns in this.attrs) {
      for (var a in this.attrs[ns]) {
        elem.setAttributeNS(ns, a, this.attrs[ns][a]);
      }
    }
    this.children.forEach(function (ch) {
      ch.render(elem);
    });
    target.appendChild(elem);
  };

  bender.DOMElement.prototype.append_child = bender.View.prototype.append_child;

  bender.DOMTextNode = function (text) {
    Object.defineProperty(this, "text", { enumerable: true,
      get: function () {
        return text;
      },
      set: function (new_text) {
        new_text = flexo.safe_string(new_text);
        if (new_text != text) {
          text = new_text;
          this.rendered.forEach(function (d) {
            d.textContent = new_text;
          });
        }
      }
    });
    this.rendered = [];
  };

  bender.DOMTextNode.prototype.render = function (target) {
    var t = target.ownerDocument.createTextNode(this.text);
    target.appendChild(t);
    this.rendered.push(t);
  };

}(this.bender = {}));
