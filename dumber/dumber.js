// TODO
// [ ] watch nesting, and, etc.
// [ ] properties -> signals?
// [ ] XML import
// [ ] script
// [ ] delegates for objects

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
      flexo.hash(this, "instance");
      this.use = use;
      this.component = component;
      component._instances.push(this);
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
          flexo.remove_from_array(r.component._instances, r);
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
              var u = dumber.render(ch, dest);
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
    init: function(watch, instance)
    {
      this.watch = watch;
      this.instance = instance;
      this.component = this.instance.component;
      this.ungets = [];
      return this;
    },

    render: function()
    {
      this.watch._gets.forEach(function(get) {
          if (get._event) {
            var instance = this.instance;
            var listener = function(e) {
              flexo.log(get);
              return (get._action || flexo.id).call(instance, e);
            };
            if (get._view) {
              // DOM event from a view
              var target = this.instance.views[get._view];
              target.addEventListener(get._event, listener, false);
              this.ungets.push(function() {
                  target.removeEventListener(get._event, listener, false);
                });
            } else if (get._use) {
              var target = this.instance.uses[get._use];
              flexo.listen(target, get._event, listener);
              this.ungets.push(function() {
                  flexo.log("Unget", get);
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
        this._watches = [];     // child watches
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

    get:
    {
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
      // Attributes interpreted by use
      _attributes: { id: true, q: true, ref: true },

      setAttribute: function(name, value)
      {
        if (this._attributes.hasOwnProperty(name)) this[name] = value.trim();
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
      },
    },

    view:
    {
      _add_to_parent: function()
      {
        this.parentNode._view = this;
      },
    },

    watch:
    {
      _init: function()
      {
        this._gets = [];
      },

      _add_to_parent: function()
      {
        if (this.parentNode._watches) {
          this.parentNode._watches.push(this);
          this.parentNode._refresh(this.parentNode);
        }
      }
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

