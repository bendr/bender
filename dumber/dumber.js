(function(dumber) {

  dumber.NS = "http://dumber.igel.co.jp";

  dumber.create_context = function(target)
  {
    if (target === undefined) target = document;
    var context = (target.ownerDocument || target).implementation
      .createDocument(dumber.NS, "context", null);
    context.createElement = function(name)
    {
      return wrap_element(Document.prototype.createElementNS
        .call(this, dumber.NS, name));
    };
    context.createElementNS = function(ns, qname)
    {
      return wrap_element(Document.prototype.createElementNS
        .call(this, ns, qname));
    };
    var root = wrap_element(context.documentElement);
    root.target = target;
    return root;
  };

  var component_instance =
  {
    init: function(use, component)
    {
      this.use = use;
      this.component = component;
      component._rendered.push(this);
      this.views = {};     // rendered views by id
      this.uses = {};      // rendered uses by id
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
          flexo.remove_from_array(r.component._rendered, r);
          r.unrender();
        }
      }, this);
      this.rendered = [];
    },

    render: function()
    {
      if (this.target) {
        this.unrender();
        if (this.component._view) {
          this.render_children(this.component._view, this.target);
        }
        this.component._watches.forEach(function(watch) {
            var instance = Object.create(watch_instance).init(watch, this);
            instance.render();
            this.rendered.push(instance);
          }, this);
      }
    },

    render_children: function(node, dest)
    {
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 1) {
          if (ch.namespaceURI === dumber.NS) {
            if (ch.localName === "use") {
              var u = ch._render(dest);
              this.rendered.push(u);
              if (ch.id) this.uses[ch.id] = u;
            } else if (ch.localName === "content") {
              this.render_children(this.use.childNodes.length > 0 ?
                this.use: ch, dest);
            }
          } else {
            this.render_foreign(ch, dest);
          }
        } else if (ch.nodeType === 3 || ch.nodeType === 4) {
          var d = dest.ownerDocument.createTextNode(ch.textContent);
          dest.appendChild(d);
          if (dest === this.target) this.rendered.push(d);
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
            this.views[attr.value.trim()] = d;
          } else if (attr.namespaceURI) {
            d.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
          } else {
            d.setAttribute(attr.localName, attr.value);
          }
        }, this);
      dest.appendChild(d);
      if (dest === this.target) {
        [].forEach.call(this.use.attributes, function(attr) {
            if (!this.use._attributes.hasOwnProperty(attr.localName)) {
              d.setAttribute(attr.name, attr.value);
            }
          }, this);
        this.rendered.push(d);
      }
      this.render_children(node, d);
    },

    update_title: function()
    {
      if (this.target && this.component.localName === "app" &&
          this.use.parentNode === this.use.ownerDocument.documentElement &&
          this.component._title) {
        this.target.ownerDocument.title = this.component._title.textContent;
      }
    },
  };

  var watch_instance =
  {
    init: function(watch, component_instance)
    {
      this.watch = watch;
      this.component_instance = component_instance;
      this.component = this.component_instance.component;
      this.ungets = [];
      return this;
    },

    render: function()
    {
      this.watch._gets.forEach(function(get) {
          if (get._event) {
            var component_instance = this.component_instance;
            var listener = function(e) {
              flexo.log(get);
              return (get._action || flexo.id).call(component_instance, e);
            };
            if (get._view) {
              // DOM event from a view
              var target = this.component_instance.views[get._view];
              target.addEventListener(get._event, listener, false);
              this.ungets.push(function() {
                  target.removeEventListener(get._event, listener, false);
                });
            } else if (get._use) {
              var target = this.component_instance.uses[get._use];
              flexo.listen(target, get._event, listener);
              this.ungets.push(function() {
                  flexo.unlisten(target, get._event, listener);
                });
            }
          }
        }, this);
    },

    unrender: function()
    {
      this.ungets.forEach(function(unget) { unget(); });
    }
  };

  var prototypes =
  {
    "":
    {
      appendChild: function(ch) { return this.insertBefore(ch, null); },

      insertBefore: function(ch, ref)
      {
        Node.prototype.insertBefore.call(this, ch, ref);
        this._refresh();
        return ch;
      },

      removeChild: function(ch)
      {
        var parent = this.parentNode;
        Node.protoype.removeChild.call(this, ch);
        this._refresh(parent);
        return ch;
      },

      _textContent: function(t)
      {
        this.textContent = t;
        this._refresh();
      },

      _refresh: function(parent)
      {
        if (!parent) parent = this.parentNode;
        var component = component_of(parent);
        if (component) {
          component._rendered.forEach(function(i) { i.render(); });
        }
      },

      _serialize: function()
      {
        return (new XMLSerializer).serializeToString(this);
      }
    },

    component:
    {
      _init: function()
      {
        this._components = {};  // child components
        this._watches = [];     // child watches
        this._rendered = [];    // rendered instances
        flexo.getter_setter(this, "_is_component", function() { return true; });
      },

      // TODO allow class/id in any order
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
                elem.insertBefore(this.ownerDocument.createTextNode(ch));
              } else if (ch instanceof Node) {
                elem.insertBefore(ch);
              }
            }, this);
          return elem;
        }
      },

      insertBefore: function(ch, ref)
      {
        Node.prototype.insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === dumber.NS) {
          if (ch.localName === "app" || ch.localName === "component") {
            this._add_component(ch);
          } else if (ch.localName === "desc") {
            if (this._desc) Node.prototype.removeChild.call(this, this._desc);
            this._desc = ch;
          } else if (ch.localName === "title") {
            if (this._title) Node.prototype.removeChild.call(this, this._title);
            this._title = ch;
            this._rendered.forEach(function(i) { i.update_title(); });
          } else if (ch.localName === "view") {
            if (this._view) Node.prototype.removeChild.call(this, this._view);
            this._view = ch;
            this._refresh();
          } else if (ch.localName === "use") {
            this._rendered.push(ch._render(this.target));
          } else if (ch.localName === "watch") {
            this._watches.push(ch);
            this._refresh();
          }
        }
        return ch;
      },

      removeChild: function(ch)
      {
        Node.prototype.removeChild.call(this, ch);
        if (ch._id && this._components[ch._id]) {
          delete this._components[ch._id];
        } else if (ch === this._desc) {
          delete this._desc;
        } else if (ch === this._title) {
          delete this._title;
        } else if (ch === this._view) {
          delete this._view;
          this._refresh();
        } else if (ch._unrender) {
          flexo.remove_from_array(this._rendered, ch._instance);
          ch._unrender();
        }
        return ch;
      },

      // TODO support xml:id?
      setAttribute: function(name, value)
      {
        if (name === "id") {
          this._id = value.trim();
          if (this.parentNode && this.parentNode._add_component) {
            this.parentNode._add_component(this);
          }
        }
        return Element.prototype.setAttribute.call(this, name, value);
      },

      _add_component: function(component)
      {
        if (component._id) {
          // TODO check for duplicate id
          this._components[component._id] = component;
        }
      },

      _render_in: function(target)
      {
        return render_component(this, target,
            this.ownerDocument.createElement("use"));
      },
    },

    get:
    {
      insertBefore: function(ch, ref)
      {
        Node.prototype.insertBefore.call(this, ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this._update_action();
        return ch;
      },

      setAttribute: function(name, value)
      {
        Element.prototype.setAttribute.call(this, name, value);
        if (name === "event" || name === "use" || name === "view") {
          this["_" + name] = value.trim();
        }
      },

      _textContent: function(t)
      {
        this.textContent = t;
        this._update_action();
      },

      _update_action: function()
      {
        if (/\S/.test(this.textContent)) {
          // TODO handle errors
          this._action = new Function("value", this.textContent);
        } else {
          delete this._action;
        }
      }
    },

    use:
    {
      // Attributes interpreted by use
      _attributes: { id: true, q: true, ref: true },

      setAttribute: function(name, value)
      {
        Element.prototype.setAttribute.call(this, name, value);
        if (this._attributes.hasOwnProperty(name)) this[name] = value.trim();
        this._refresh();
      },

      _find_component: function()
      {
        var component = undefined;
        if (this.ref) {
          var parent_component = component_of(this);
          while (!component && parent_component) {
            component = parent_component._components[this.ref];
            parent_component = component_of(parent_component.parentNode);
          }
        } else if (this.q) {
          component = this.parentNode && this.parentNode.querySelector(this.q);
        }
        return component;
      },

      _render: function(target)
      {
        var component = this._find_component();
        var instance = render_component(this._find_component(), target, this);
        if (instance) {
          this._instance = instance;
          return instance;
        } else {
          flexo.log("No component found for", this);
        }
      },

      _unrender: function()
      {
        if (this._instance) {
          this._instance.unrender();
          delete this._instance;
        }
      },
    },

    view:
    {
      insertBefore: function(ch, ref)
      {
        Node.prototype.insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === dumber.NS) {
          if (ch.localName === "use") {
            this._refresh();
          }
        } else {
          this._refresh();
        }
        return ch;
      },

      removeChild: function(ch)
      {
        Node.prototype.removeChild.call(this, ch);
        this._refresh();
        return ch;
      },
    },

    watch:
    {
      _init: function()
      {
        this._gets = [];
        this._sets = [];
        this._watches = [];
      },

      insertBefore: function(ch, ref)
      {
        Node.prototype.insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === dumber.NS) {
          if (ch.localName === "get") {
            this._gets.push(ch);
          } else if (ch.localName === "set") {
            this._sets.push(ch);
          } else if (ch.localName === "watch") {
            this._watches.push(ch);
          }
        }
      },
    }
  };

  prototypes.app = prototypes.component;
  prototypes.context = prototypes.component;

  // The component of a node is itself if it is a component node (or app or
  // context), or the component of its parent
  function component_of(node)
  {
    return node ? node._is_component ? node : component_of(node.parentNode) :
      null;
  }

  function render_component(component, target, use)
  {
    if (!component) return;
    var instance = Object.create(component_instance).init(use, component);
    instance.target = target;
    return instance;
  }

  function wrap_element(e)
  {
    var proto = prototypes[e.localName] || {};
    for (var p in proto) e[p] = proto[p];
    for (var p in prototypes[""]) {
      if (!e.hasOwnProperty(p)) e[p] = prototypes[""][p];
    }
    if (e._init) e._init();
    return e;
  }

})(typeof exports === "object" ? exports : this.dumber = {});
