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
  };

  flexo.Promise.prototype.reject = function (reason) {
    if (!this.hasOwnProperty("value") && !this.hasOwnProperty("reason")) {
      this.reason = reason;
      this._resolved();
    }
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
    var promise = new flexo.Promise;
    promise.fulfill("...");
    return promise;
  };

  // Load a component and return a promise.
  bender.load_component = function (defaults, env) {
    var promise = new flexo.Promise;
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
      { href: defaults });
    if (args.href) {
      if (!env) {
        return flexo.ez_xhr(args.href).then(function (response) {
          env = new bender.Environment;
          return env.deserialize(response);
        });
      }
    }
    return new flexo.Promise().reject("No href argument for component.");
  };

}(this.bender = {}));
