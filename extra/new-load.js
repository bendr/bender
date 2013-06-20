(function (bender) {

  var reduce = Array.prototype.reduce;

  flexo.Promise = function (id) {
    this._then = [];
  };

  flexo.Promise.prototype.then = function (on_fulfilled, on_rejected) {
    var p = new flexo.Promise;
    this._then.push([p, on_fulfilled, on_rejected]);
    if (this.hasOwnProperty("value") || this.hasOwnProperty("reason")) {
      this._resolved.bind(this).delay();
    }
    return p;
  };

  flexo.Promise.prototype.fulfill = function (value) {
    if (this.hasOwnProperty("value")) {
      console.error("Cannot fulfill promise: already fulfilled:", this.value);
    } else if (this.hasOwnProperty("reason")) {
      console.error("Cannot fulfill promise: already rejected:", this.reason);
    } else {
      this.value = value;
      this._resolved();
    }
    return this;
  };

  flexo.Promise.prototype.reject = function (reason) {
    if (this.hasOwnProperty("value")) {
      console.error("Cannot reject promise: already fulfilled:", this.value);
    } else if (this.hasOwnProperty("reason")) {
      console.error("Cannot reject promise: already rejected:", this.reason);
    } else {
      this.reason = reason;
      this._resolved();
    }
    return this;
  };

  flexo.Promise.prototype._resolved = function () {
    var resolution = this.hasOwnProperty("value") ? "value" : "reason";
    var on = this.hasOwnProperty("value") ? 1 : 2;
    this._then.forEach(function (p) {
      if (typeof p[on] == "function") {
        try {
          var v = p[on](this[resolution]);
          if (v && typeof v.then == "function") {
            v.then(function (value) {
              p[0].fulfill(value);
            }, function (reason) {
              p[0].reject(reason);
            });
          } else {
            p[0].fulfill(v);
          }
        } catch (e) {
          p[0].reject(e);
        }
      } else {
        p[0][resolution == "value" ? "fulfill" : "reject"](this[resolution]);
      }
    }, this);
    this._then = [];
  };


  flexo.ez_xhr = function (uri, params) {
    var req = new XMLHttpRequest;
    if (!params) {
      params = {};
    }
    req.open(params.method || "GET", uri);
    if ("responseType" in params) {
      req.responseType = params.responseType;
    }
    if (typeof params.headers == "object") {
      for (var h in params.headers) {
        req.setRequestHeader(h, params.headers[h]);
      }
    }
    var promise = new flexo.Promise;
    req.onload = function () {
      if (req.response != null) {
        promise.fulfill(req.response);
      } else {
        promise.reject(req);
      }
    };
    req.onerror = promise.reject.bind(promise, req);
    req.send(params.data || "");
    return promise;
  };


  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.Environment = function (document) {
    this.document = document || window.document;
    this.urls = [];
  };

  bender.Environment.prototype.deserialize = function (node) {
    console.log("Deserialize node {%0}%1".fmt(node.namespaceURI, node.localName));
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node, parent);
          } else {
            console.log("Unknown bender element %0 (skipped)"
                .fmt(node.localName));
          }
        } else {
          console.log("Foreign content (skipped)");
        }
      } else {
        console.log("Text (skipped)");
      }
    } else {
      throw "Deseralization error: expected an element; got: %0".fmt(node);
    }
  };

  bender.Environment.prototype.deserialize.component = function (elem) {
    console.log("Deserialize component", elem);
    var component = new bender.Component(this);
    // Deserialize the prototype of the component (from the href attribute),
    // then all child nodes. At every step, a promise handles the content and
    // return the component itself so that it can be safely returned regardless
    // of the presence of a prototype or children. The reduce function iterates
    // over all children and is initialized with the result of getting the
    // prototype for the component.
    // TODO attributes
    // TODO check the prototype chain for loops
    return reduce.call(elem.childNodes, function (p, ch) {
      return p.then(function (component) {
        var p = component.environment.deserialize(ch);
        if (p instanceof flexo.Promise) {
          return p.then(function (d) {
            component.append_child(d);
            return component;
          });
        } else {
          component.append_child(p);
          return component;
        }
      });
    }, elem.hasAttribute("href") ?
      flexo.ez_xhr(flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")),
        { responseType: "document" }).then(function (response) {
          return component.environment.deserialize(response.documentElement);
        }).then(function (prototype) {
          component.$prototype = prototype;
          return component;
        }) : new flexo.Promise().fulfill(component));
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
      return flexo.ez_xhr(args.href, { responseType: "document" })
        .then(function (response) {
          return env.deserialize(response.documentElement);
        });
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

  bender.Component = function (environment) {
    this.environment = environment;
    this.children = [];
  };

  bender.Component.prototype.append_child = function (child) {
    console.log("+ add child", child);
    // TODO
    return child;
  };

}(this.bender = {}));
