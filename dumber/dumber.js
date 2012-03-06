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
    context.createElementNS = function(ns, qname)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, ns, qname));
    };
    return wrap_element(context.documentElement);
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
        this.update_title();
        this.component._watches.forEach(function(watch) {
            var instance_ = Object.create(watch_instance).init(watch, this);
            instance_.render();
            this.rendered.push(instance_);
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
          this.use.parentNode === this.use.context.documentElement &&
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

      _textContent: function(t) { this.textContent = t; },

      _refresh: function(parent)
      {
        if (!parent) parent = this.parentNode;
        if (!parent) return;
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

    context:
    {
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
                elem.appendChild(document.createTextNode(ch));
              } else if (ch instanceof Node) {
                elem.appendChild(ch);
              }
            });
          return elem;
        }
      },
    },

    component:
    {
      _init: function()
      {
        this._components = {};  // child components
        this._watches = [];     // child watches
        this._rendered = [];    // rendered instances
      },

      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === dumber.NS) {
          if (ch.localName === "app" || ch.localName === "component") {
            this._add_component(ch);
          } else if (ch.localName === "title") {
            if (this._title) this.removeChild(this._title);
            this._title = ch;
            this._rendered.forEach(function(i) { i.update_title(); });
          } else if (ch.localName === "view") {
            if (this._view) this.removeChild(this._view);
            this._view = ch;
            this._refresh();
          } else if (ch.localName === "watch") {
            // TODO add watch
          }
        }
        return ch;
      },

      removeChild: function(ch)
      {
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        if (ch.namespaceURI === dumber.NS) {
          if (ch.localName === "app" || ch.localName === "component") {
            if (ch._id) delete this._components[ch._id];
          } else if (ch.localName === "title") {
            delete this._title;
          } else if (ch.localName === "view") {
            delete this._view;
            this._refresh();
          } else if (ch.localName === "watch") {
            // TODO remove watch
          }
        }
        return ch;
      },

      _add_component: function(component)
      {
        if (component._id) {
          // TODO check for duplicate id
          this._components[component._id] = component;
        }
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
        return Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },
    },

    get:
    {
      /*
      insertBefore: function(ch, ref)
      {
        var ch_ = Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this._update_action();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "event") {
          this._event = value.trim();
        } else if (name === "use") {
          this._use = value.trim();
        } else if (name === "view") {
          this._view = value.trim();
        }
        return Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },

      set_textContent: function(t)
      {
        this.textContent = t;
        this._update_action();
      },

      _add_to_parent: function()
      {
        if (this.parentNode._gets) this.parentNode._gets.push(this);
      },

      _remove_from_parent: function(parent)
      {
        if (parent._gets) flexo.remove_from_array(parent._gets, this);
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
      */
    },

    title:
    {
      // TODO add text nodes as well
      set_textContent: function(t)
      {
        this.textContent = t;
        this._refresh();
      },
    },

    use:
    {
      // Attributes interpreted by use
      _attributes: { id: true, q: true, ref: true },

      setAttribute: function(name, value)
      {
        if (this._attributes.hasOwnProperty(name)) this[name] = value.trim();
        return Object.getPrototypeOf(this).setAttribute.call(this, name, value);
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
        if (component) {
          var instance = Object.create(component_instance)
            .init(this, component);
          instance.target = target;
          return instance;
        } else {
          flexo.log("No component found for", this);
        }
      },

      _textContent: function(t)
      {
        this.textContent = t;
        this._refresh();
      }
    },

    view:
    {
      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
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
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        this._refresh();
      },

      _textContent: function(t)
      {
        this.textContent = t;
        this._refresh();
      }
    },

    watch:
    {
      _init: function()
      {
        this._gets = [];
        this._sets = [];
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

