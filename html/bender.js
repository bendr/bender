(function (bender) {

  bender.version = "0.8.2/h"

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.Environment = function (document) {
    this.document = document || window.document;
    this.urls = {};
  };

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

  bender.Environment.prototype.deserialize = function (node) {
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node, parent);
          } else {
            // Unknown Bender element
            console.warn("Unknow element in Bender namespace: %0"
                .fmt(node.localName));
          }
        } else {
          // Foreign content
        }
      } else if (node.nodeType == window.Node.TEXT_NODE ||
          node.nodeType == window.Node.CDATA_SECTION_NODE) {
        return new bender.DOMTextNode(node.textContent);
      }
    } else {
      throw "Deseralization error: expected a node; got: %0".fmt(node);
    }
  };

  // Load a component and return a promise.
  // TODO cache the deserialized result.
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

  bender.Component = function (environment) {
    this.environment = environment;
    this.links = [];
    this.children = [];
  };

  bender.Environment.prototype.deserialize.component = function (elem) {
    var component = new bender.Component(this);
    // TODO attributes
    // TODO check the prototype chain for loops
    return append_children(elem.hasAttribute("href") ?
      this.load_component(flexo.absolute_uri(elem.baseURI,
          elem.getAttribute("href")))
        .then(function (prototype) {
          component.$prototype = prototype;
          return component;
        }) : new flexo.Promise().fulfill(component), elem, this);
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

  // TODO wait for scripts to finish before rendering the view
  bender.Component.prototype.render = function (target) {
    this.links.forEach(function (link) {
      link.render(target);
    });
    if (this.view) {
      this.view.render(target);
    }
  };

  bender.Link = function (rel, href) {
    this.rel = flexo.safe_trim(rel).toLowerCase();
    this.href = href;
  };

  bender.Environment.prototype.deserialize.link = function (elem) {
    return new bender.Link(elem.getAttribute("rel"),
        flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")));
  };

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
      document.head.appendChild(script);
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
    return append_children(new flexo.Promise().fulfill(new bender.View), elem,
        this);
  };

  bender.View.prototype.append_child = function (child) {
    if (child instanceof bender.DOMTextNode) {
      this.children.push(child);
      child.parent = this;
    }
  };

  bender.View.prototype.render = function (target) {
    this.children.forEach(function (ch) {
      ch.render(target);
    });
  };

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

  function append_children(promise, elem, env) {
    return promise.each(elem.childNodes, function (ch, parent) {
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
  }

  bender.DOMTextNode.prototype.render = function (target) {
    var t = target.ownerDocument.createTextNode(this.text);
    target.appendChild(t);
    this.rendered.push(t);
  };

}(this.bender = {}));
