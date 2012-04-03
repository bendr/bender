(function(bender)
{
  bender.NS = "http://bender.igel.co.jp";      // Bender namespace
  bender.NS_E = "http://bender.igel.co.jp/e";  // Properties namespace
  bender.NS_F = "http://bender.igel.co.jp/f";  // Float properties namespace
  bender.NS_B = "http://bender.igel.co.jp/b";  // Boolean properties namespace

  //bender.die = true;
  bender.warn = function()
  {
    flexo.log.apply(this, arguments);
    if (bender.die) throw "Died :(";
  };

  // Create a Bender context for the given target (host document by default.)
  // Elements created in this context will be extended with the Bender
  // prototypes.
  bender.create_context = function(target)
  {
    if (!target) target = document;
    var doc = target.ownerDocument || target;
    var context = doc.implementation.createDocument(bender.NS, "bender", null);

    // Wrap all new elements
    context.createElement = function(name)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, bender.NS, name));
    };
    context.createElementNS = function(ns, qname)
    {
      return wrap_element(Object.getPrototypeOf(this).createElementNS
        .call(this, ns, qname));
    };

    // Manage the render queue specific to this context
    var render_queue = [];
    var timeout = null;
    var flushing = false;
    var flush_queue = function()
    {
      flushing = true;
      while (render_queue[0]) render_queue[0].refresh_component_instance();
      timeout = null;
      flushing = false;
    };
    context._refreshed_instance = function(instance)
    {
      flexo.remove_from_array(render_queue, instance);
    };
    context._refresh_instance = function(instance)
    {
      if (flushing) return;
      if (render_queue.indexOf(instance) >= 0) return;
      render_queue.push(instance);
      if (!timeout) timeout = setTimeout(flush_queue, 0);
    };

    // Create a root context element and initiate rendering
    var component = context.createElement("context");
    context.documentElement.appendChild(component);
    component._insert_use.call(context.documentElement, { q: "context" },
        target);

    var loaded = {};      // loaded URIs
    var components = {};  // known components by URI/id
    loaded[normalize_url(doc.baseURI, "")] = component;

    // Keep track of uri/id pairs to find components with the href attribute
    context._add_component = function(component)
    {
      var uri = normalize_url(doc.baseURI,
          component._uri + "#" + component._id);
      components[uri] = component;
    };

    // Create a deep clone of the given node with parameters for text/attributes
    context._clone_node = function(prototype, params)
    {
      var doc = this;
      var clone_node = function(node)
      {
        if (node.nodeType === 1) {
          var n = doc.createElementNS(node.namespaceURI, node.localName);
          for (var i = 0, m = node.attributes.length; i < m; ++i) {
            var attr = node.attributes[i];
            var value = attr.value.format(params);
            if (attr.namespaceURI) {
              if (attr.namespaceURI === flexo.XMLNS_NS &&
                  attr.localName !== "xmlns") {
                n.setAttribute("xmlns:{0}".fmt(attr.localName), value);
              } else {
                n.setAttributeNS(attr.namespaceURI, attr.localName, value);
              }
            } else {
              n.setAttribute(attr.localName, value);
            }
          }
          for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
            n.appendChild(clone_node(ch));
          }
          return n;
        } else if (node.nodeType === 3 || node.nodeType === 4) {
          return doc.createTextNode(node.textContent.format(params));
        }
      };
      var clone = clone_node(prototype);
      return clone;
    },

    // Request for a component to be loaded. If the component was already
    // loaded, return the component node, otherwise return the normalized URL
    // requested. In that situation, a "@loaded" event will be sent when loading
    // has finished with a url parameter corresponding to the returned URL and
    // the loaded component; an "@error" event will be sent with the same URL
    // parameter in case of error.
    context._load_component = function(url, use)
    {
      var split = url.split("#");
      var locator = normalize_url(doc.baseURI, split[0]);
      var id = split[1];
      if (typeof loaded[locator] === "object") {
        return id ? components[locator + "#" + id] : loaded[locator];
      } else {
        if (!loaded[locator]) {
          loaded[locator] = true;
          flexo.ez_xhr(locator, { responseType: "document" }, function(req) {
              if (!req.response) {
                flexo.notify(context, "@error", { url: locator });
              } else {
                loaded[locator] = import_node(component,
                  req.response.documentElement, locator);
                flexo.notify(context, "@loaded",
                  { component: loaded[locator], url: locator });
              }
            });
        }
        return locator;
      }
    };

    return component;
  };

  // Prototype for a component instance. Prototypes may be extended through the
  // <script> element.
  var component_instance =
  {
    // Initialize the instance from a <use> element given a <component>
    // description node.
    init: function(use, parent, target)
    {
      this.use = use;
      this.component = this.use._component;
      this.target = target;
      this.views = {};       // rendered views by id
      this.uses = {};        // rendered uses by id
      this.rendered = [];    // root DOM nodes and use instances
      this.watchers = [];    // instances that have watches on this instance
      this.properties = {};  // watchable properties
      this.watched = {};     // watched properties
      Object.keys(this.component._properties).forEach(function(k) {
          if (!use._properties.hasOwnProperty(k)) {
            this.properties[k] = this.component._properties[k];
          }
        }, this);
      Object.keys(use._properties).forEach(function(k) {
          this.properties[k] = use._properties[k];
        }, this);
      this.component._instances.push(this);
      this.uses.$self = this;
      this.uses.$parent = parent;
      return this;
    },

    // Find the value of a property in scope
    // Create a new property on the top-level instance if not found
    find_instance_with_property: function(name)
    {
      if (this.properties.hasOwnProperty(name)) return this;
      if (this.uses.$parent) {
        return this.uses.$parent.find_instance_with_property(name);
      } else {
        this.properties[name] = undefined;
        return this;
      }
    },

    // Get or set a property in self or nearest ancestor
    property: function(name, value)
    {
      var instance = this.find_instance_with_property(name);
      if (value) {
        if (!instance) instance = this;
        instance.properties[name] = value;
      }
      if (instance) return instance.properties[name];
    },

    // Unrender, then render the view when the target is an Element.
    refresh_component_instance: function()
    {
      this.component.ownerDocument._refreshed_instance(this);
      this.unrender();
      if (flexo.root(this.use) !== this.use.ownerDocument) return;
      if (this.use.__placeholder) {
        this.target = this.use.__placeholder.parentNode;
      }
      if (this.target instanceof Element) {
        this.views.$document = this.target.ownerDocument;
        this.pending = 0;
        this.component._uses.forEach(function(u) {
            this.render_use(u, this.target, this.use.__placeholder);
          }, this);
        if (this.component._view) {
          this.render_children(this.component._view, this.target,
              this.use.__placeholder);
        }
        flexo.safe_remove(this.__placeholder);
        this.update_title();
        if (this.pending === 0) this.render_watches();
      }
    },

    render_children: function(node, dest, ref)
    {
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 1) {
          if (ch.namespaceURI === bender.NS) {
            if (ch.localName === "use") {
              this.render_use(ch, dest, ref);
            } else if (ch.localName === "target") {
              if (ch._once) {
                if (!ch._rendered) {
                  this.render_children(ch, ch._find_target(dest));
                  ch._rendered = true;
                }
              } else {
                this.render_children(ch, ch._find_target(dest));
              }
            } else if (ch.localName === "content") {
              this.render_children(this.use.childNodes.length > 0 ?
                this.use : ch, dest, ref);
            }
          } else {
            this.render_foreign(ch, dest, ref);
          }
        } else if (ch.nodeType === 3 || ch.nodeType === 4) {
          var d = dest.ownerDocument.createTextNode(ch.textContent);
          dest.insertBefore(d, ref);
          if (dest === this.target) this.rendered.push(d);
        }
      }
    },

    render_foreign: function(node, dest, ref)
    {
      var d = dest.ownerDocument.createElementNS(node.namespaceURI,
          node.localName);
      [].forEach.call(node.attributes, function(attr) {
          if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI) &&
            attr.localName === "id") {
            this.views[attr.value.trim()] = d;
          } else if (attr.namespaceURI &&
            attr.namespaceURI !== node.namespaceURI) {
            d.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
          } else {
            d.setAttribute(attr.localName, attr.value);
          }
        }, this);
      dest.insertBefore(d, ref);
      if (dest === this.target) {
        [].forEach.call(this.use.attributes, function(attr) {
            if (!(this.use._attributes.hasOwnProperty(attr.localName) ||
                attr.namespaceURI === bender.NS_E ||
                attr.namespaceURI === bender.NS_F ||
                attr.namespaceURI === bender.NS_B)) {
              d.setAttribute(attr.name, attr.value);
            }
          }, this);
        this.rendered.push(d);
      }
      this.render_children(node, d);
    },

    render_use: function(use, dest, ref)
    {
      use.__placeholder = placeholder(dest, ref, use);
      if (use.__pending) {
        ++this.pending;
        return;
      }
      var instance = use._render(dest, this);
      if (instance === true) {
        this.__pending = true;
        ++this.pending;
        flexo.listen(use, "@loaded", (function() {
            delete use.__pending;
            this.rendered_use(use);
            if (--this.pending === 0) this.render_watches();
          }).bind(this));
      } else if (instance) {
        this.rendered_use(use);
      }
    },

    rendered_use: function(use)
    {
      if (use._instance) {
        this.rendered.push(use._instance);
        if (use._id) this.uses[use._id] = use._instance;
      } else {
        bender.warn("rendered_use: no instance for", use);
      }
    },

    render_watches: function()
    {
      this.component._watches.forEach(function(watch) {
          var instance = Object.create(watch_instance).init(watch, this);
          instance.render_watch_instance();
          this.rendered.push(instance);
        }, this);
      for (var p in this.watched) this.properties[p] = this.properties[p];
      flexo.notify(this, "@rendered");
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

    update_title: function()
    {
      if (this.target instanceof Element &&
          this.component.localName === "app" && this.component._title) {
        this.target.ownerDocument.title = this.component._title.textContent;
      }
    },

    watch_property: function(property, handler)
    {
      if (!(this.watched.hasOwnProperty(property))) {
        this.watched[property] = [];
        var p = this.properties[property];
        var that = this;
        flexo.getter_setter(this.properties, property, function() { return p; },
            function(p_) {
              var prev = p;
              p = p_;
              that.watched[property].slice().forEach(function(h) {
                  h.call(that, p, prev);
                });
            });
      }
      this.watched[property].push(handler);
    },

    unwatch_property: function(property, handler)
    {
      flexo.remove_from_array(this.watched[property], handler);
      if (this.watched[property] && this.watched[property].length === 0) {
        delete this.watched[property];
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
      this.enabled = this.watch.parentNode &&
        this.watch.parentNode._is_component;
      this.ungets = [];
      return this;
    },

    got: function(value)
    {
      this.watch._sets.forEach(function(set) {
          var val = set._action ?
            set._action.call(this.component_instance, value) : value;
          if (set._view) {
            var target = this.component_instance.views[set._view];
            if (!target) {
              bender.warn("No view for \"{0}\" in".fmt(set._view), set);
            } else {
              if (set._attr) {
                target.setAttribute(set._attr, val);
              } else {
                target[set._property || "textContent"] = val;
              }
            }
          } else if (set._property) {
            var target = set._use ? this.component_instance.uses[set._use] :
              this.component_instance
                .find_instance_with_property(set._property);
            if (!target) {
              bender.warn("(got) No use for \"{0}\" in".fmt(set._property), set);
            } else if (val !== undefined) {
              target.properties[set._property] = val;
            }
          }
        }, this);
    },

    render_watch_instance: function()
    {
      this.watch._gets.forEach(function(get) {
          var active = false;
          var that = this;
          if (get._event) {
            var listener = function(e) {
              if (that.enabled && !active) {
                active = true;
                that.got((get._action || flexo.id).call(that.component_instance,
                    e));
                active = false;
              }
            };
            if (get._view) {
              // DOM event
              var target = this.component_instance.views[get._view];
              if (!target) {
                bender.warn("render_watch_instance: No view for \"{0}\" in"
                  .fmt(get._view), get);
              } else {
                target.addEventListener(get._event, listener, false);
                this.ungets.push(function() {
                    target.removeEventListener(get._event, listener, false);
                  });
              }
            } else if (get._use) {
              // Custom event
              var target = this.component_instance.uses[get._use];
              if (!target) {
                bender.warn("(render get/use) No use for \"{0}\" in"
                  .fmt(get._use), get);
              } else {
                flexo.listen(target, get._event, listener);
                this.ungets.push(function() {
                    flexo.unlisten(target, get._event, listener);
                  });
              }
            }
          } else if (get._property) {
            // Property change
            var target = get._use ? this.component_instance.uses[get._use] :
              this.component_instance
                .find_instance_with_property(get._property);
            if (!target) {
              bender.warn("(render get/property) No use for \"{0}\""
                  .fmt(get._property));
            } else {
              var h = function(p, prev)
              {
                if (that.enabled && !active) {
                  active = true;
                  that.got((get._action || flexo.id)
                      .call(that.component_instance, p, prev));
                  active = false;
                }
              };
              h._watch = this;
              target.watch_property(get._property, h);
              this.ungets.push(function() {
                  target.unwatch_property(get._property, h);
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

      cloneNode: function(deep)
      {
        var clone =
          wrap_element(Object.getPrototypeOf(this).cloneNode.call(this, false));
        if (deep) {
          var component = component_of(this)._uri;
          var uri = component ? component._uri : "";
          [].forEach.call(this.childNodes, function(ch) {
              import_node(clone, ch);
            });
        }
        return clone;
      },

      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        this._refresh();
        return ch;
      },

      removeChild: function(ch)
      {
        var parent = this.parentNode;
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        this._refresh(parent);
        return ch;
      },

      setAttribute: function(name, value)
      {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        this._refresh();
      },

      setAttributeNS: function(ns, name, value)
      {
        Object.getPrototypeOf(this).setAttributeNS.call(this, ns, name, value);
        this._refresh();
      },

      _textContent: function(t)
      {
        this.textContent = t;
        this._refresh();
      },

      $: function(name)
      {
        var argc = 1;
        var attrs = {};
        if (typeof arguments[1] === "object" &&
            !(arguments[1] instanceof Node)) {
          argc = 2;
          attrs = arguments[1];
        }
        var m = name.match(
            // 1: prefix 2: name  3: classes    4: id        5: more classes
            /^(?:(\w+):)?([\w\-]+)(?:\.([^#]+))?(?:#([^.]+))?(?:\.(.+))?$/
          );
        if (m) {
          var ns = m[1] && flexo[m[1].toUpperCase() + "_NS"];
          var elem = ns ? this.ownerDocument.createElementNS(ns, m[2]) :
            this.ownerDocument.createElement(m[2]);
          var classes = m[3] ? m[3].split(".") : [];
          if (m[5]) [].push.apply(classes, m[5].split("."));
          if (m[4]) attrs.id = m[4];
          if (classes.length > 0) {
            attrs["class"] =
              (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "") +
              classes.join(" ");
          }
          for (a in attrs) {
            if (attrs.hasOwnProperty(a) &&
                attrs[a] !== undefined && attrs[a] !== null) {
              var split = a.split(":");
              ns = split[1] && (bender["NS_" + split[0].toUpperCase()] ||
                  flexo[split[0].toUpperCase() + "_NS"]);
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

      _refresh: function()
      {
        // if (!parent) parent = this.parentNode;
        var component = component_of(this);
        if (component) {
          component._instances.forEach(function(i) {
              component.ownerDocument._refresh_instance(i);
            });
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
        this._instances = [];   // instances of this component
        this._properties = {};  // properties map
        this._uses = [];        // use children (outside of a view)
        this._uri = "";
        flexo.getter_setter(this, "_is_component", function() { return true; });
      },

      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "app" || ch.localName === "component") {
            this._add_component(ch);
          } else if (ch.localName === "desc") {
            if (this._desc) {
              Object.getPrototypeOf(this).removeChild.call(this, this._desc);
            }
            this._desc = ch;
          } else if (ch.localName === "script") {
            ch._run();
          } else if (ch.localName === "title") {
            if (this._title) {
              Object.getPrototypeOf(this).removeChild.call(this, this._title);
            }
            this._title = ch;
            this._instances.forEach(function(i) { i.update_title(); });
          } else if (ch.localName === "view") {
            if (this._view) {
              Object.getPrototypeOf(this).removeChild.call(this, this._view);
            }
            this._view = ch;
            this._refresh();
          } else if (ch.localName === "use") {
            this._uses.push(ch);
            this._refresh();
          } else if (ch.localName === "watch") {
            this._watches.push(ch);
            this._refresh();
          }
        }
        return ch;
      },

      removeChild: function(ch)
      {
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        if (ch._id && this._components[ch._id]) {
          delete this._components[ch._id];
        } else if (ch === this._desc) {
          delete this._desc;
        } else if (ch === this._title) {
          delete this._title;
        } else if (ch === this._view) {
          delete this._view;
          this._refresh();
        } else if (ch._render) {  // use node
          flexo.remove_from_array(this._uses, ch);
          this._refresh();
        } else if (ch._watches) {   // watch node
          flexo.remove_from_array(this._watches, ch);
          this._refresh();
        }
        return ch;
      },

      setAttribute: function(name, value)
      {
        if (name === "id") {
          this._id = value.trim();
          if (this.parentNode && this.parentNode._add_component) {
            this.parentNode._add_component(this);
          }
        }
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },

      // TODO support xml:id?
      setAttributeNS: function(ns, name, value)
      {
        if (ns === bender.NS_E) {
          this._properties[name] = value;
        } else if (ns === bender.NS_F) {
          this._properties[name] = parseFloat(value);
        } else if (ns === bender.NS_B) {
          this._properties[name] = value.trim().toLowerCase() === "true";
        }
        Object.getPrototypeOf(this).setAttributeNS.call(this, ns, name, value);
      },

      _add_component: function(component)
      {
        if (component._id) {
          // TODO check for duplicate id
          this._components[component._id] = component;
          this.ownerDocument._add_component(component);
        }
      },
    },

    get:
    {
      _init: function()
      {
        flexo.getter_setter(this, "_content",
            function() { return this._action; },
            function(f) { if (typeof f === "function") this._action = f; });
        return this;
      },

      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this._update_action();
        return ch;
      },

      setAttribute: function(name, value)
      {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "event" || name === "property" ||
            name === "use" || name === "view") {
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

    script:
    {
      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this._run();
        return ch;
      },

      // TODO setAttribute: href for script file location

      _textContent: function(t)
      {
        this.textContent = t;
        this._run();
      },

      _run: function()
      {
        if (!this.parentNode || this._ran || !/\S/.test(this.textContent)) {
          return;
        }
        if (!this.parentNode._prototype) {
          this.parentNode._prototype = Object.create(component_instance);
        }
        (new Function(this.textContent)).call(this.parentNode);
        this._ran = true;
      }
    },

    set:
    {
      insertBefore: function(ch, ref)
      {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this._update_action();
        return ch;
      },

      setAttribute: function(name, value)
      {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "attr" || name === "property" ||
            name === "use" || name === "view") {
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

    target:
    {
      setAttribute: function(name, value)
      {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "q" || name === "ref") {
          this["_" + name] = value.trim();
          this._refresh();
        } else if (name === "once") {
          this._once = value.trim().toLowerCase() === "true";
          this._refresh();
        }
      },

      _find_target: function(dest)
      {
        if (this._q) {
          return dest.ownerDocument.querySelector(this._q);
        } else if (this._ref) {
          return dest.ownerDocument.getElementById(this._ref);
        } else {
          return dest;
        }
      }
    },

    use:
    {
      _init: function()
      {
        this._properties = {};
      },

      // Attributes interpreted by use
      _attributes: { href: true, id: true, q: true, ref: true },

      setAttribute: function(name, value)
      {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (this._attributes.hasOwnProperty(name)) {
          this["_" + name] = value.trim();
        }
        this._refresh();
      },

      setAttributeNS: function(ns, name, value)
      {
        if (ns === bender.NS_E) {
          this._properties[name] = value;
        } else if (ns === bender.NS_F) {
          this._properties[name] = parseFloat(value);
        } else if (ns === bender.NS_B) {
          this._properties[name] = value.trim().toLowerCase() === "true";
        }
        Object.getPrototypeOf(this).setAttributeNS.call(this, ns, name, value);
      },

      _find_component: function()
      {
        var component = undefined;
        if (this._ref) {
          var parent_component = component_of(this);
          while (!component && parent_component) {
            component = parent_component._components[this._ref];
            parent_component = component_of(parent_component.parentNode);
          }
          return component;
        } else if (this._q) {
          return this.ownerDocument.querySelector(this._q);
        } else if (this._href) {
          var href =
            (this._href.indexOf("#") === 0 ? component_of(this)._uri : "") +
            this._href;
          return this.ownerDocument._load_component(href, this);
        }
      },

      _render: function(target, parent)
      {
        var component = this._find_component();
        if (typeof component === "string") {
          this.__target = target;
          this.__parent = parent;
          if (this.__loading) return;
          this.__loading = (function(e) {
            if (e.url === component) {
              flexo.notify(this, "@loaded", { instance: this
                ._render_component(e.component, this.__target, this.__parent) });
              flexo.unlisten(this.ownerDocument, "@loaded", this.__loading);
              delete this.__loading;
              delete this.__target;
              delete this.__parent;
            }
          }).bind(this);
          flexo.listen(this.ownerDocument, "@loaded", this.__loading);
          return true;
        } else if (component) {
          return this._render_component(component, target, parent);
        } else {
          bender.warn("use._render: No component for", this);
        }
      },

      _render_component: function(component, target, parent)
      {
        this._component = component;
        this._instance =
          Object.create(component._prototype || component_instance)
            .init(this, parent, target);
        if (this._instance.instantiated) this._instance.instantiated();
        this._instance.refresh_component_instance();
        return this._instance;
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
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === bender.NS) {
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
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === bender.NS) {
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

  // Specific functions to create get, set and script attributes with an actual
  // function rather than a string to create a function for the action
  ["get", "set", "script"].forEach(function(name) {
      prototypes.component["$" + name] = function(attrs, action)
      {
        var elem = action ? this.$(name, attrs) : this.$(name);
        if (typeof action === "function") {
          elem._action = action;
        } else if (typeof attrs === "function") {
          elem._action = attrs;
        }
        return elem;
      };
    });

  prototypes.app = prototypes.component;
  prototypes.context = prototypes.component;

  // Insert a newly created use element (using the attributes passed as first
  // argument) in the context and render it to the given target
  prototypes.context._insert_use = function(attrs, target)
  {
    var use = prototypes[""].$.call(this, "use", attrs);
    this.appendChild(use);
    use._render(target);
    return use;
  };

  // The component of a node is itself if it is a component node (or app or
  // context), or the component of its parent
  function component_of(node)
  {
    return node ? node._is_component ? node : component_of(node.parentNode) :
      null;
  }

  function import_node(parent, node, uri)
  {
    if (node.nodeType === 1) {
      var n = parent.ownerDocument
        .createElementNS(node.namespaceURI, node.localName);
      if (n._is_component) n._uri = uri;
      parent.appendChild(n);
      for (var i = 0, m = node.attributes.length; i < m; ++i) {
        var attr = node.attributes[i];
        if (attr.namespaceURI) {
          if (attr.namespaceURI === flexo.XMLNS_NS &&
              attr.localName !== "xmlns") {
            n.setAttribute("xmlns:{0}".fmt(attr.localName), attr.nodeValue);
          } else {
            n.setAttributeNS(attr.namespaceURI, attr.localName, attr.nodeValue);
          }
        } else {
          n.setAttribute(attr.localName, attr.nodeValue);
        }
      }
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        import_node(n, ch, uri);
      }
      return n;
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      var n = parent.ownerDocument.importNode(node, false);
      parent.appendChild(n);
    }
  }

  function normalize_url(base, ref)
  {
    var url = flexo.split_uri(flexo.absolute_uri(base, ref)
      .replace(/%([0-9a-f][0-9a-f])/gi,
        function(m, n) {
          n = parseInt(n, 16);
          return (n >= 0x41 && n <= 0x5a) || (n >= 0x61 && n <= 0x7a) ||
            (n >= 0x30 && n <= 0x39) || n === 0x2d || n === 0x2e ||
            n === 0x5f || n == 0x7e ? String.fromCharCode(n) : m.toUpperCase();
        }));
    if (url.scheme) url.scheme = url.scheme.toLowerCase();
    if (url.authority) url.authority = url.authority.toLowerCase();
    return flexo.unsplit_uri(url);
  }

  // Create a placeholder node for components to be rendered
  function placeholder(dest, ref, use)
  {
    flexo.safe_remove(use.__placeholder);
    var p = dest.ownerDocument.createComment(" placeholder ");
    dest.insertBefore(p, ref);
    return p;
  }

  // Extend an element with Bender methods and call the _init() method on the
  // node if it exists.
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

})(typeof exports === "object" ? exports : this.bender = {});
