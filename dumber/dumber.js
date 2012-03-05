(function(dumber) {

  dumber.NS = "http://dumber.igel.co.jp";

  dumber.create_context = function(target)
  {
    if (target === undefined) target = document;
    var context = target.implementation.createDocument(dumber.NS, "context",
      null);

    context.createElement = function(name)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, dumber.NS, name));
    };

    context.createElementNS = function(ns, name)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, ns, name));
    };

    return wrap_element(context.documentElement);
  };

  dumber.render =  function(use, target)
  {
    var template = use._find_template();
    if (template) {
      var instance_ = Object.create(instance).init(use, template);
      instance_.target = target;
      return instance_;
    } else {
      flexo.log("No template found for", use);
    }
  };

  var instance =
  {
    init: function(use, component)
    {
      this.use = use;
      this.component = component;
      component._instances.push(this);
      this.views = {};
      this.rendered = [];  // root DOM nodes and use instances
      var target = undefined;
      Object.defineProperty(this, "target", { enumerable: true,
        get: function() { return target; },
        set: function(t) { target = t; this.render(); } });
      return this;
    },

    unrender: function()
    {
      this.rendered.forEach(function(r) {
        if (r instanceof Node) {
          r.parentNode.removeChild(r);
        } else {
          flexo.remove_from_array(r.component._instances, r);
          r.unrender();
        }
      }, this);
      this.rendered = [];
    },

    render: function()
    {
      if (this.target && this.component._view) {
        this.unrender();
        this.render_children(this.component._view, this.target);
        this.update_title();
      }
    },

    render_children: function(node, dest)
    {
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 1) {
          if (ch.namespaceURI === dumber.NS) {
            if (ch.localName === "use") {
              this.rendered.push(dumber.render(ch, dest));
            } else if (ch.localName === "content") {
              this.render_children(this.use.childNodes.length > 0 ?
                this.use :ch, dest);
            }
          } else {
            this.render_foreign(ch, dest);
          }
        } else if (ch.nodeType === 3 || ch.nodeType === 4) {
          dest.appendChild(dest.ownerDocument.createTextNode(ch.textContent));
        }
      }
    },

    render_foreign: function(node, dest)
    {
      var d = dest.ownerDocument
                .createElementNS(node.namespaceURI, node.localName);
      [].forEach.call(node.attributes, function(attr) {
          if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI) &&
            attr.localName === "id") {
            this.views[flexo.undash(attr.value.trim())] = d;
          } else if (attr.namespaceURI) {
            d.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
          } else {
            d.setAttribute(attr.localName, attr.value);
          }
        }, this);
      dest.appendChild(d);
      if (dest === this.target) this.rendered.push(d);
      this.render_children(node, d);
    },

    update_title: function()
    {
      if (this.target && this.component.localName === "app" &&
          this.use.parentNode === this.use.context.documentElement &&
          this.component._title) {
        this.target.ownerDocument.title = this.component._title.textContent;
      }
    },
  };

  var prototypes =
  {
    "":
    {
      appendChild: function(ch) { return this.insertBefore(ch, null); },

      insertBefore: function(ch, ref)
      {
        var ch_ = Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch._add_to_parent) ch._add_to_parent();
        return ch_;
      },

      removeChild: function(ch)
      {
        var ch_ = Object.getPrototypeOf(this).removeChild.call(this, ch);
        if (ch._remove_from_parent) ch._remove_from_parent(this);
        return ch_;
      },

      _refresh: function(parent)
      {
        var component = component_of(parent);
        if (component) {
          component._instances.forEach(function(instance_) {
              instance_.render();
            });
        }
      },

      _add_to_parent: function() { this._refresh(this.parentNode); },

      _remove_from_parent: function(parent) { this._refresh(parent); },

      set_textContent: function(t)
      {
        this.textContent = t;
        if (this.parentNode) this._refresh(this.parentNode);
      }
    },

    context:
    {
      $: function(name)
      {
        var argc = 1;
        var attrs = {};
        if (typeof arguments[1] === "object" &&
            !(arguments[1] instanceof Node)) {
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
          var elem = ns ? this.ownerDocument.createElementNS(ns, m[2]) :
            this.ownerDocument.createElement(m[2]);
          if (m[3]) attrs.id = m[3];
          for (a in attrs) {
            if (attrs.hasOwnProperty(a) &&
                attrs[a] !== undefined && attrs[a] !== null) {
              var split = a.split(":");
              ns = split[1] && (dumber["NS_" + split[0].toUpperCase()] ||
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
      }
    },

    component:
    {
      _init: function()
      {
        this._instances = [];   // rendered instances
        this._components = {};  // child components
      },

      _add_to_parent: function()
      {
        if (this.id && this.parentNode._components) {
          this.parentNode._components[this.id] = this;
        }
      },

      setAttribute: function(name, value)
      {
        if (name === "id") {
          this.id = value;
          if (this.parentNode && this.parentNode._components) {
            this.parentNode._components[value] = this;
          }
        }
        return Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },
    },

    title:
    {
      _add_to_parent: function()
      {
        if (this.parentNode._title) {
          this.parentNode.removeChild(this.parentNode._title);
        }
        this.parentNode._title = this;
        prototypes[""]._add_to_parent.call(this);
      },

      _remove_from_parent: function()
      {
        this.parentNode._title = undefined;
      },
    },

    use:
    {
      setAttribute: function(name, value)
      {
        if (name === "q") {
          if (value) {
            this.q = value.trim();
          } else {
            delete this.q;
          }
        } else if (name === "ref") {
          if (value) {
            this.ref = value.trim();
          } else {
            delete this.ref;
          }
        }
        return Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },

      _find_template: function()
      {
        var template = undefined;
        if (this.ref) {
          var component = component_of(this);
          while (!template && component) {
            template = component._components[this.ref];
            component = component_of(component.parentNode);
          }
        } else if (this.q) {
          template = this.parentNode && this.parentNode.querySelector(this.q);
        }
        return template;
      }
    },

    view:
    {
      _add_to_parent: function()
      {
        this.parentNode._view = this;
      },
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
    if (e._init) e._init();
    return e;
  }

})(typeof exports === "object" ? exports : this.dumber = {});



  function component_of(node)
  {
    return node ?
      node.namespaceURI === dumber.NS &&
        (node.localName === "component" || node.localName === "app") ?
        node : component_of(node.parentNode) : null;
  }
