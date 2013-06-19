(function (bender) {

  // Promise
  flexo.Promise = function () {
    this._then = [];
  };

  flexo.Promise.prototype.then = function (on_fulfilled, on_rejected) {
    var p = new flexo.Promise;
    this._then.push(p);
    p._on_fulfilled = on_fulfilled;
    p._on_rejected = on_rejected;
    if (this.hasOwnProperty("value") || this.hasOwnProperty("reason")) {
      this._resolved.bind(this).delay();
    }
    return p;
  };

  flexo.Promise.prototype.fulfill = function (value) {
    if (!this.hasOwnProperty("value") && !this.hasOwnProperty("reason")) {
      this.value = value;
      this._resolved();
    }
    return this;
  };

  flexo.Promise.prototype.reject = function (reason) {
    if (!this.hasOwnProperty("value") && !this.hasOwnProperty("reason")) {
      this.reason = reason;
      this._resolved();
    }
    return this;
  };

  flexo.Promise.prototype._resolved = function () {
    var resolution = this.hasOwnProperty("value") ? "value" : "reason";
    var on = this.hasOwnProperty("value") ? "_on_fulfilled" : "_on_rejected";
    this._then.forEach(function (p) {
      if (typeof p[on] == "function") {
        try {
          var v = p[on](this[resolution]);
          if (v && typeof v.then == "function") {
            v.then(p.fulfill.bind(p), p.reject.bind(p));
          } else {
            p.fulfill(v);
          }
        } catch (e) {
          p.reject(e);
        }
      } else if (resolution == "value") {
        p.fulfill(this.value);
      } else {
        p.reject(this.reason);
      }
    }, this);
    this._then = [];
  };

  // Redefine flexo.ez_xhr to return a promise
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
      promise.fulfill(req.response);
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

  bender.Environment.prototype.deserialize = function (node, parent) {
    console.log("Deserialize {%0}%1".fmt(node.namespaceURI, node.localName));
    if (node instanceof window.Node) {
      if (node.nodeType == window.Node.ELEMENT_NODE) {
        if (node.namespaceURI == bender.ns) {
          var f = bender.Environment.prototype.deserialize[node.localName];
          if (typeof f == "function") {
            return f.call(this, node, parent);
          }
        } else {
          console.log("Foreign content");
        }
      } else {
        console.log("Text");
      }
    } else {
      throw "Deseralization error: expected an element; got: %0".fmt(node);
    }
  };

  var foreach = Array.prototype.forEach;
  var push = Array.prototype.push;

  bender.Environment.prototype.deserialize.component = function (elem, parent) {
    console.log("Deserialize component", elem);
    var component = new bender.Component(this, parent);
    var deserialize_children = function (promise) {
      console.log("Deserialize child nodes (%0)".fmt(elem.childNodes.length));
      foreach.call(elem.childNodes, function (ch) {
        promise = promise.then(function () {
          this.deserialize(ch, component);
          return component;
        }.bind(this));
      }, this);
      return promise;
    }.bind(this);
    if (elem.hasAttribute("href")) {
      var url = flexo.absolute_uri(elem.baseURI, elem.getAttribute("href"));
      var promise = bender.load_component(url, this).then(function (response) {
        console.log("Loaded href=%0 (%1)".fmt(elem.getAttribute("href"), url));
        return this.deserialize(response)
      }.bind(this)).then(function (proto) {
        component.$prototype = proto;
        return deserialize_children(promise);
      });
    } else {
      return deserialize_children(new flexo.Promise().fulfill());
    }
  };

  // Load a component and return a promise.
  bender.load_component = function (defaults, env) {
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
      { href: defaults });
    if (args.href) {
      return flexo.ez_xhr(args.href, { responseType: "document" })
        .then(function (response) {
          if (!env) {
            env = new bender.Environment;
            return env.deserialize(response.documentElement);
          }
        });
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

  bender.Component = function (environment, parent) {
    this.environment = environment;
    this.children = [];
    if (parent) {
      this.parent = parent;
      this.parent.children.push(this);
    }
  };

}(this.bender = {}));
