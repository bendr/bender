(function (bender) {

  flexo.Promise = function () {
    this._then = [];
  };

  var foreach = Array.prototype.forEach

  flexo.Promise.prototype.then = function (on_fulfilled, on_rejected) {
    var p = new flexo.Promise;
    this._then.push([p, on_fulfilled, on_rejected]);
    if (this.hasOwnProperty("value") || this.hasOwnProperty("reason")) {
      this._resolved.bind(this).delay();
    }
    return p;
  };

  var reduce = Array.prototype.reduce;

  flexo.Promise.prototype.seq = function (xs, f) {
    return reduce.call(xs, function (p, x) {
      return p.then(function (v) {
        return f(x, v);
      });
    }, this);
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

  // Make an asynchronous XMLHttpRequest for `uri`, with optional parameters
  // `params` (known parameters: method, responseType, headers, data.) Return a
  // promise which will be fulfilled with the result response, or rejected with
  // an object containing a reason and the request that was made.
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
        promise.reject({ reason: "missing response", request: req });
      }
    };
    req.onerror = promise.reject.bind(promise,
        { reason: "XHR error", request: req });
    req.send(params.data || "");
    return promise;
  };


  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.Environment = function (document) {
    this.document = document || window.document;
    this.urls = {};
  };

  bender.Environment.prototype.load = function (url) {
    return this.urls[url] || flexo.ez_xhr(url, { responseType: "document" })
      .then(function (response) {
        return this.deserialize(response.documentElement);
      }.bind(this)).then(function (d) {
        this.urls[url] = new flexo.Promise().fulfill(d);
        d.url = url;
        return d;
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
        // Text node
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
      return env.load(flexo.absolute_uri(env.document.baseURI, args.href));
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

  bender.Component = function (environment) {
    this.environment = environment;
    this.children = [];
  };

  bender.Environment.prototype.deserialize.component = function (elem) {
    var component = new bender.Component(this);
    // TODO attributes
    // TODO check the prototype chain for loops
    return (elem.hasAttribute("href") ?
      this.load(flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")))
        .then(function (prototype) {
          component.$prototype = prototype;
          return component;
        }) : new flexo.Promise().fulfill(component))
    .seq(elem.childNodes, function (ch) {
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
  };

  bender.Component.prototype.append_child = function (child) {
    // TODO
    this.children.push(child);
    return child;
  };

  bender.View = function () {};

  bender.Environment.prototype.deserialize.view = function (elem) {
    return new bender.View;
  };

}(this.bender = {}));
