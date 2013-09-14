(function () {
  "use strict";

  // Pre-render the view into an actual DOM tree, keeping track of ids and
  // bender elements along the way
  bender.View.prototype.prerender = function (scope) {
    var paths = {};
    scope.$0 = scope.$document.createDocumentFragment();
    var queue = this.children.map(function (child, i) {
      return [child, scope.$0, [i]];
    });
    while (queue.length) {
      var q = queue.shift();
      var ch = q[0];
      var parent = q[1];
      var path = q[2];
      var node = parent.appendChild(ch.prerender(scope.$document));
      if (ch._id) {
        scope["#" + ch._id] = ch;
        scope["@" + ch._id] = path;
      }
      Array.prototype.push.apply(queue, ch.children.map(function (child, i) {
        var path_ = path.slice();
        path_.push(i);
        return [child, node, path_];
      }));
    }
    return scope;
  };

  bender.DOMElement.prototype.prerender = function (document) {
    var elem = document.createElementNS(this.ns, this.name);
    return elem;
  };

  bender.DOMTextNode.prototype.prerender = function (document) {
    return document.createTextNode(this._text);
  };

  var env = window.env = new bender.Environment();
  var A = env.component().view(
      new bender.DOMElement(flexo.ns.html, "p")
        .child(new bender.DOMTextNode().text("X = "))
        .child(new bender.DOMElement(flexo.ns.html, "span").id("x")
          .child(new bender.DOMTextNode().text("(undefined)")))
    );

  A.scope.$view.prerender(A.scope);
  A.scope.$index = document.body.childNodes.length;
  document.body.appendChild(A.scope.$0);
  A.scope.$0 = document.body;

  (function () {
    var node = A.scope.$0;
    var index = A.scope.$index;
    A.scope["@x"].forEach(function (i) {
      node = node.childNodes[i + index];
      index = 0;
    });
    Object.defineProperty(A.properties, "x", {
      enumerable: true,
      get: function () {
        return node.textContent;
      },
      set: function (x) {
        node.textContent = x;
      }
    });
  }());

}());
