(function(dumber) {

  dumber.NS = "http://dumber.igel.co.jp";

  dumber.create_context = function(target)
  {
    if (target === undefined) target = document;
    var context = target.implementation.createDocument(dumber.NS, "context",
      null);

    context.createElement = function(name)
    {
      return wrap_element(Object.getPrototypeOf(this).createElement
        .call(this, name));
    };

    context.createElementNS = function(ns, name)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, ns, name));
    };

    context.$ = function(name)
    {
      var argc = 1;
      var attrs = {};
      if (typeof arguments[1] === "object" && !(arguments[1] instanceof Node)) {
        attrs = arguments[1];
        argc = 2;
      }
      var classes = name.split(".");
      name = classes.shift();
      if (classes.length > 0) {
        attrs["class"] =
          (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "")
          + classes.join(" ");
      }
      var m = name.match(/^(?:(\w+):)?([\w\-]+)(?:#(.+))?$/);
      if (m) {
        var ns = m[1] && flexo["{0}_NS".fmt(m[1].toUpperCase())];
        var elem = ns ? this.createElementNS(ns, m[2]) :
          this.createElement(m[2]);
        if (m[3]) attrs.id = m[3];
        for (a in attrs) {
          if (attrs.hasOwnProperty(a) &&
              attrs[a] !== undefined && attrs[a] !== null) {
            var split = a.split(":");
            ns = split[1] && (bender["NS_" + split[0].toUpperCase()] ||
                flexo["{0}_NS".fmt(split[0].toUpperCase())]);
            if (ns) {
              elem.setAttributeNS(ns, split[1], attrs[a]);
            } else {
              elem.setAttribute(a, attrs[a]);
            }
          }
        }
        [].slice.call(arguments, argc).forEach(function(ch) {
            if (typeof ch === "string") {
              elem.appendChild(document.createTextNode(ch));
            } else if (ch instanceof Node) {
              elem.appendChild(ch);
            }
          });
        return elem;
      }
    };

    wrap_element(context.documentElement);
    return context;
  };

  var prototypes =
  {
    "":
    {
      appendChild: function(ch) { return this.insertBefore(ch, null); },

      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.add_to_parent) ch.add_to_parent(this);
        return;
      },

      removeChild: function(ch)
      {
        if (ch.remove_from_parent) ch.remove_from_parent();
        return Object.getPrototypeOf(this).removeChild.call(this, ch);
      },

      init: function() {},
    },

    component:
    {
    },

    use:
    {
      render: function(target) {},
    },

    view:
    {
    }
  };

  prototypes.app = prototypes.component;

  function wrap_element(e)
  {
    e.context = e.ownerDocument;
    var proto = prototypes[e.localName] || {};
    for (var p in proto) e[p] = proto[p];
    for (var p in prototypes[""]) {
      if (!e.hasOwnProperty(p)) e[p] = prototypes[""][p];
    }
    e.init();
    return e;
  }

})(typeof exports === "object" ? exports : this.dumber = {});
