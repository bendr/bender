(function (bender) {
  "use strict";

  var A = Array.prototype;

  // Bender namespace (added to the flexo module for create_element to work as
  // expected with the "bender" namespace prefix, e.g. flexo.$("bender:app")
  bender.NS = flexo.ns.bender = "http://bender.igel.co.jp";

  // The component of a node is itself if it is a component node (or app or
  // context), or the component of its parent
  function component_of(node) {
    return node ?
      node._is_component ?
        node :
        component_of(node.parentNode) :
      null;
  }

  // TODO document this
  function find_elem(x) {
    if (x instanceof Element) {
      return x;
    }
    if (x && x.rendered) {
      var elem;
      for (var i = x.rendered.length - 1; i >= 0 && !elem; --i) {
        if (x.rendered[i] instanceof Element) {
          elem = x.rendered[i];
        } else if (x.rendered[i].rendered) {
          elem = find_elem(x.rendered[i]);
        }
      }
      return elem;
    }
  }

  // Import a node and its children from a foreign document and add it as a
  // child of the parent element
  function import_node(parent, node, uri) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      var n = parent.ownerDocument.createElementNS(node.namespaceURI,
          node.localName);
      if (n._is_component) {
        n._uri = uri;
      }
      parent.appendChild(n);
      for (var i = 0, m = node.attributes.length; i < m; ++i) {
        var attr = node.attributes[i];
        if (attr.namespaceURI) {
          if (attr.namespaceURI === flexo.XMLNS_NS &&
              attr.localName !== "xmlns") {
            n.setAttribute("xmlns:" + attr.localName, attr.nodeValue);
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
    } else if (node.nodeType === Node.TEXT_NODE ||
        node.nodeType === Node.CDATA_SECTION_NODE) {
      return parent.appendChild(parent.ownerDocument.importNode(node, false));
    }
  }

  function parent_of(n) {
    return (n.__instance && n) || parent_of(n.parentNode);
  }

  // Create a placeholder node to mark the right location in the render tree for
  // a component. This placeholder can be replaced by the component's tree when
  // it becomes available.
  function placeholder(dest, ref, use) {
    var p = dest.ownerDocument.createComment(" placeholder ");
    flexo.safe_remove(use.__placeholder);
    return dest.insertBefore(p, ref);
  }

  // Extend an element with Bender methods, calls its _init() method, and return
  // the wrapped element.
  function wrap_element(e) {
    var proto = PROTOTYPES[e.localName];
    if (proto) {
      for (var p in proto) {
        if (proto.hasOwnProperty(p)) {
          e[p] = proto[p];
        }
      }
    }
    for (p in PROTOTYPES[""]) {
      if (PROTOTYPES[""].hasOwnProperty(p) && !e.hasOwnProperty(p)) {
        e[p] = PROTOTYPES[""][p];
      }
    }
    e._init();
    return e;
  }

  // Create a Bender context for the given target (host document root element or
  // body by default.) All Bender applications run in a context, which is itself
  // a document that can be represented as:
  //
  //   <bender xmlns="http://bender.igel.co.jp">
  //     <context/>
  //     <use q="context"/>
  //   </bender>
  //
  // The <context> element is returned; this is a Bender component that acts as
  // root of the context tree. The target of the context is the root of the host
  // document subtree where rendering happens. The <use> element initiates the
  // rendering process if the target is an element, making the context live.
  bender.create_context = function (target) {
    target = target || document.body || document.documentElement;
    var doc = target.ownerDocument || target;
    var context = doc.implementation.createDocument(bender.NS, "bender", null);

    // Wrap all new elements created in this context
    context.createElement = function (name) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            bender.NS, name));
    };
    context.createElementNS = function (ns, qname) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            ns, qname));
    };

    // Manage the render queue specific to this context. The purpose of the
    // render queue is to gather refresh requests from different instances
    // (including multiple requests frome the same instance) before doing the
    // actual rendering in order to avoid multiple refreshes and cycles (as
    // rendering requests are ignored while the queue is being flushed.)
    var render_queue = [];
    var timeout = null;
    var flushing = false;

    // Flush the queue: actually do the rendering for the instances in the queue
    // TODO use a generator here?
    var flush_queue = function () {
      flushing = true;
      for (var i = 0; i < render_queue.length; ++i) {
        render_queue[i].refresh_component_instance();
      }
      timeout = null;
      flushing = false;
    };

    // Unqueue an instance that was just refreshed and send a notification from
    // the context
    context._refreshed_instance = function (instance) {
      flexo.remove_from_array(render_queue, instance);
      flexo.notify(this, "@refreshed", { instance: instance });
    };

    // Method called by instances to request a refresh
    // TODO can we end up in a situation where an instance wants another refresh
    // in the same flush cycle and this request should *not* be ignored? e.g.
    // during an animation?
    context._refresh_instance = function (instance) {
      if (render_queue.indexOf(instance) >= 0) {
        return;
      }
      render_queue.push(instance);
      if (!timeout) {
        timeout = setTimeout(flush_queue, 0);
      }
    };

    // Create a root context element and initiate rendering
    var component = context.createElement("context");
    Object.defineProperty(component, "target", { enumerable: true,
      get: function () { return target; }
    });
    context.documentElement.appendChild(component);
    var use = component.$("use", { q: "context" });
    context.documentElement.appendChild(use);
    use._render(target);

    // The context keeps track of loaded URIs and catalogues all components
    var loaded = {};      // loaded URIs
    var components = {};  // known components by URI/id
    loaded[flexo.normalize_uri(doc.baseURI, "")] = component;

    // Keep track of uri/id pairs to find components with the href attribute
    context._add_component = function (component) {
      var uri = flexo.normalize_uri(doc.baseURI,
          component._uri + "#" + component._id);
      components[uri] = component;
    };

    // Request for a component to be loaded. If the component was already
    // loaded, return the component node, otherwise return the requested URI
    // normalized. In that situation, a "@loaded" event will be sent when
    // loading has finished with a uri parameter corresponding to the returned
    // URI and the loaded component; an "@error" event will be sent with the
    // same URI parameter in case of error.
    context._load_component = function (uri) {
      var split = uri.split("#");
      var locator = flexo.normalize_uri(doc.baseURI, split[0]);
      var id = split[1];
      if (typeof loaded[locator] === "object") {
        return id ? components[locator + "#" + id] : loaded[locator];
      } else {
        if (!loaded[locator]) {
          loaded[locator] = true;
          flexo.ez_xhr(locator, { responseType: "document" }, function (req) {
            if (!req.response) {
              flexo.notify(context, "@error", { uri: locator, req: req });
            } else {
              loaded[locator] =
                import_node(component, req.response.documentElement, locator);
              flexo.notify(context, "@loaded",
                { component: loaded[locator], uri: locator });
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
  var component_instance = {

    // Initialize the instance from a <use> element given a <component>
    // description node.
    init: function (use, parent, target) {
      this.use = use;
      this.component = this.use._component;
      this.target = target;
      this.views = {};       // rendered views by id
      this.uses = {};        // rendered uses by id
      this.rendered = [];    // root DOM nodes and use instances
      this.watchers = [];    // instances that have watches on this instance
      this.properties = {};  // properties defined by <property> elements
      this.watched = {};     // watched properties
      Object.keys(this.component._properties).forEach(function (k) {
        if (!use._properties.hasOwnProperty(k)) {
          this.init_property(this.component._properties[k],
            this.component._properties[k]._get_value());
        }
      }, this);
      Object.keys(use._properties).forEach(function (k) {
        this.init_property(use._properties[k],
          this.component._properties[k]._get_value());
      }, this);
      this.component._instances.push(this);
      this.uses.$self = this;
      this.uses.$parent = parent;
      this.uses.$context = use.ownerDocument;
      return this;
    },

    // Initialize a property for the instance defined by a <property> element
    // (either from the original component or from the <use> element that
    // instantiated it.)
    // TODO proper initialization
    init_property: function (property, value) {
      Object.defineProperty(this.properties, property._name, { enumerable: true,
        get: function () { return value; },
        set: function (v) {
          if (typeof v === "string") {
            v = property._get_value(v);
          }
          if (v !== value) {
            var prev = value;
            value = v;
            flexo.notify(this, "@property-change",
              { name: property._name, prev: prev });
          }
        }
      });
    },

    // Find the nearest instance in the ancestor list that has the given
    // property, if any
    find_instance_with_property: function (name) {
      if (this.properties.hasOwnProperty(name)) {
        return this;
      }
      if (this.uses.$parent) {
        return this.uses.$parent.find_instance_with_property(name);
      }
    },

    // Unrender, then render the view when the target is an Element.
    refresh_component_instance: function () {
      this.component.ownerDocument._refreshed_instance(this);
      var last = this.unrender();
      if (flexo.root(this.use) !== this.use.ownerDocument) {
        return;
      }
      this.component.__instance = this;
      if (this.use.__placeholder) {
        this.target = this.use.__placeholder.parentNode;
      }
      if (this.target instanceof Element) {
        this.views.$document = this.target.ownerDocument;
        this.pending = 0;
        // Render the <use> elements outside of the view
        this.component._uses.forEach(function (u) {
          this.render_use(u, this.target, this.use.__placeholder || last);
        }, this);
        // Render the <view> element
        if (this.component._view) {
          this.render_children(this.component._view, this.target,
              this.use.__placeholder || last);
        }
        flexo.safe_remove(this.use.__placeholder);
        delete this.use.__placeholder;
        this.update_title();
        if (this.pending === 0) {
          this.render_watches();
        }
      }
    },

    // Render the child nodes of `node` (in the Bender tree) as children of
    // `dest` (in the target tree) using `ref` as the reference child before
    // which to add the nodes (`ref` points to a placeholder node that will be
    // removed afterwards; this is so that loading and rendering can be done
    // asynchronously.) Return the last rendered element (text nodes are not
    // returned.)
    render_children: function (node, dest, ref) {
      var ch, d, r;
      for (ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === Node.ELEMENT_NODE) {
          if (ch.namespaceURI === bender.NS) {
            if (ch.localName === "use") {
              r = this.render_use(ch, dest, ref);
            } else if (ch.localName === "target") {
              // `target` ignores ref
              if (ch._once) {
                if (!ch._rendered) {
                  r = this.render_children(ch, ch._find_target(dest));
                  ch._rendered = true;
                }
              } else {
                r = this.render_children(ch, ch._find_target(dest));
              }
            } else if (ch.localName === "content") {
              // <content> renders either the contents of the <use> node or its
              // own by default.
              if (this.use.childNodes.length > 0) {
                r = parent_of(node).__instance
                  .render_children(this.use, dest, ref);
              } else {
                r = this.render_children(ch, dest, ref);
              }
              this.render_use_params(r, ch);
            }
          } else {
            r = this.render_foreign(ch, dest, ref);
          }
        } else if (ch.nodeType === Node.TEXT_NODE ||
            ch.nodeType === Node.CDATA_SECTION_NODE) {
          this.render_text(ch, dest, ref);
        }
      }
      return r;
    },

    // Render foreign nodes within a view; arguments and return value are the
    // same as render_children() above.
    render_foreign: function (node, dest, ref) {
      var d = dest.ownerDocument.createElementNS(node.namespaceURI,
          node.localName);
      A.forEach.call(node.attributes, function (attr) {
        var val = attr.value;
        if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI) &&
            attr.localName === "id") {
          this.views[val.trim()] = d;
        } else if (attr.namespaceURI &&
            attr.namespaceURI !== node.namespaceURI) {
          d.setAttributeNS(attr.namespaceURI, attr.localName, val);
        } else {
          d.setAttribute(attr.localName, val);
        }
      }, this);
      dest.insertBefore(d, ref);
      if (dest === this.target) {
        A.forEach.call(this.use.attributes, function (attr) {
          if (!this.use._attributes.hasOwnProperty(attr.localName)) {
            // TODO check attributes for properties
            d.setAttribute(attr.name, attr.value);
          }
        }, this);
        this.rendered.push(d);
      }
      this.render_children(node, d);
      return d;
    },

    // Render a text node (or CDATA node)
    render_text: function (node, dest, ref) {
      var d = dest.ownerDocument.createTextNode(node.textContent);
      dest.insertBefore(d, ref);
      if (dest === this.target) {
        this.rendered.push(d);
      }
    },

    // Render a use node, return either the instance or the promise of a future
    // instance.
    render_use: function (use, dest, ref) {
      use.__placeholder = placeholder(dest, ref, use);
      var instance = use._render(dest, this);
      if (instance === true) {
        this.__pending = true;
        this.pending += 1;
        flexo.listen(use, "@loaded", function () {
          this.rendered_use(use);
          this.pending -= 1;
          if (this.pending === 0) {
            this.render_watches();
          }
        }.bind(this));
      } else if (instance) {
        this.rendered_use(use);
      }
      return instance;
    },

    // Set the parameters of a <use> node on its root rendered node r (if any);
    // set content_id as well.
    render_use_params: function (r, content) {
      var elem = find_elem(r);
      if (elem) {
        if (content._contentId) {
          this.views[this.unparam(content._contentId).trim()] = elem;
        }
        // TODO add attributes from <use> or <content>
      }
    },

    // After a <use> was rendered, keep track of its instance.
    rendered_use: function (use) {
      if (use._instance) {
        this.rendered.push(use._instance);
        if (use._id) {
          this.uses[use._id] = use._instance;
        }
      } else {
        console.warn("rendered_use: no instance for", use);
      }
    },

    render_watches: function () {
      var instances = [], pending = function (instance) {
        var i, n;
        // TODO improve this
        // The point is that we should not render watches before any of the
        // instances down the tree are done rendering themselves
        if (!instance.rendered) {
          return false;
        }
        for (i = 0, n = instance.rendered.length; i < n; i += 1) {
          if (instance.rendered[i].pending > 0) {
            return true;
          }
        }
        for (i = 0; i < n; i += 1) {
          if (pending(instance.rendered[i])) {
            return true;
          }
        }
        return false;
      };
      this.__pending_watches = pending(this);
      if (this.__pending_watches) {
        return;
      }
      delete this.__pending_watches;
      this.component._watches.forEach(function (watch) {
        var instance = Object.create(watch_instance).init(watch, this);
        instance.render_watch_instance();
        this.rendered.push(instance);
        instances.push(instance);
      }, this);
      instances.forEach(function (instance) { instance.pull_gets(); });
      flexo.notify(this, "@rendered");
      if (this.uses.$parent && this.uses.$parent.__pending_watches) {
        this.uses.$parent.render_watches();
      }
      delete this.component.__instance;
    },

    // Unrender this instance, returning the next sibling of the last of the
    // rendered node (if any) so that re-rendering will happen at the right
    // place.
    unrender: function () {
      var ref;
      flexo.notify(this, "@unrender");
      this.rendered.forEach(function (r) {
        if (r instanceof Node) {
          ref = r;
          r.parentNode.removeChild(r);
        } else {
          flexo.remove_from_array(r.component._instances, r);
          ref = r.unrender();
        }
      });
      this.rendered = [];
      return ref && ref.nextSibling;
    },

    update_title: function () {
      if (this.target instanceof Element &&
          this.component.localName === "app" && this.component._title) {
        this.target.ownerDocument.title = this.component._title.textContent;
      }
    }
  };

  var watch_instance = {

    init: function (watch, component_instance) {
      this.watch = watch;
      this.component_instance = component_instance;
      this.component = this.component_instance.component;
      this.enabled = this.watch.parentNode &&
        this.watch.parentNode._is_component;
      this.ungets = [];
      return this;
    },

    got: function (value) {
      this.watch._sets.forEach(function (set) {
        var target, _view, _use, _property, val = set._action ?
            set._action.call(this.component_instance, value) : value;
        _property = this.component_instance.unparam(set._property);
        if (set._view) {
          _view = this.component_instance.unparam(set._view);
          target = this.component_instance.views[_view];
          if (!target) {
            console.warn("No view for \"{0}\" in".fmt(_view), set);
          } else {
            if (set._attr) {
              target.setAttribute(this.component_instance.unparam(set._attr),
                val);
            } else {
              target[_property || "textContent"] = val;
            }
          }
        } else if (_property) {
          _use = this.component_instance.unparam(set._use);
          target = _use ? this.component_instance.uses[_use] :
              this.component_instance
                .find_instance_with_property(_property);
          if (!target) {
            console.warn("(got) No use for \"{0}\" in".fmt(_property), set);
          } else if (val !== undefined) {
            target.properties[_property] = val;
          }
        }
      }, this);
    },

    // Utility function to create listener functions for get elements
    make_listener: function (get, target) {
      var enabled = true, active = false, that = this;
      return function (value, prev) {
        var watch, prev_get, prev_target;
        if (that.enabled && !active && enabled) {
          active = true;
          enabled = !get._once;
          watch = that.component_instance.watch;
          that.component_instance.watch = that;
          prev_get = that.get;
          that.get = get;
          prev_target = that.target;
          that.target = target;
          that.got((get._action || flexo.id).call(that.component_instance,
              value, prev));
          if (watch) {
            that.component_instance.watch = watch;
          } else {
            delete that.component_instance.watch;
          }
          if (prev_get) {
            that.get = prev_get;
          } else {
            delete that.get;
          }
          if (prev_target) {
            that.target = prev_target;
          } else {
            delete that.target;
          }
          active = false;
        }
      };
    },

    render_watch_instance: function () {
      this.gets = [];
      this.watch._gets.forEach(function (get) {
        var _event, _view, listener, target, _use, _property, h;
        if (get._event) {
          _event = this.component_instance.unparam(get._event);
          if (get._view) {
            // DOM event
            _view = this.component_instance.unparam(get._view);
            target = this.component_instance.views[_view];
            if (!target) {
              console.warn("render_watch_instance: No view for \"{0}\" in"
                .fmt(get._view), get);
            } else {
              listener = this.make_listener(get, target);
              target.addEventListener(_event, listener, false);
              this.ungets.push(function () {
                target.removeEventListener(_event, listener, false);
              });
            }
          } else if (get._use) {
            _use = this.component_instance.unparam(get._use);
            // Custom event
            target = this.component_instance.uses[_use];
            if (!target) {
              console.warn("(render get/use) No use for \"{0}\" in".fmt(_use),
                  get);
            } else {
              listener = this.make_listener(get, target);
              flexo.listen(target, get._event, listener);
              this.ungets.push(function () {
                flexo.unlisten(target, get._event, listener);
              });
            }
          }
        } else if (get._property) {
          _use = this.component_instance.unparam(get._use);
          _property = this.component_instance.unparam(get._property);
          // Property change
          target = _use ? this.component_instance.uses[_use] :
              this.component_instance.find_instance_with_property(_property);
          if (!target) {
            console.warn("(render get/property) No use for \"{0}\""
                .fmt(_property));
          } else {
            h = this.make_listener(get, target);
            h._watch = this;
            target.watch_property(_property, h);
            this.gets.push(function () { h(target.property(_property)); });
            this.ungets.push(function () {
              target.unwatch_property(_property, h);
            });
          }
        }
      }, this);
    },

    pull_gets: function () {
      this.gets.forEach(function (get) { get(); });
    },

    unrender: function () {
      this.ungets.forEach(function (unget) { unget(); });
    }
  };

  // Property type map with the corresponding parsing function
  var PROPERTY_TYPES = {
    "boolean": flexo.is_true,
    "dynamic": function (value) {
      try {
        if (!/\n/.test(value)) {
          value = "return " + value;
        }
        return new Function(value).call(this);
      } catch (e) {
        console.warn("Error evaluating dynamic property \"{0}\": {1}"
            .fmt(value, e.message));
      }
    },
    "number": parseFloat,
    "object": function (value) {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn("Could not parse \"{0}\" as JSON: {1}"
          .fmt(value, e.message));
      }
    },
    "string": flexo.id
  };

  // Note: we extend DOM objects and overload some of their methods here. When
  // adding a custom method or property, we prefix it with `_` (e.g., _init(),
  // _refresh(), _components, &c.) to distinguish them from regular DOM methods.
  // _setTextContent() is necessary because we cannot override the textContent
  // property for setting.
  // TODO replace overloaded methods with Mutation Observers?
  var PROTOTYPES = {

    "": {
      appendChild: function (ch) { return this.insertBefore(ch, null); },

      cloneNode: function (deep) {
        var clone =
          wrap_element(Object.getPrototypeOf(this).cloneNode.call(this, false)),
          component, uri;
        if (deep) {
          component = component_of(this)._uri;
          uri = component ? component._uri : "";
          A.forEach.call(this.childNodes, function (ch) {
            import_node(clone, ch);
          });
        }
        return clone;
      },

      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        this._refresh();
        return ch;
      },

      removeChild: function (ch) {
        var parent = this.parentNode;
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        this._refresh(parent);
        return ch;
      },

      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        this._refresh();
      },

      setAttributeNS: function (ns, name, value) {
        Object.getPrototypeOf(this).setAttributeNS.call(this, ns, name, value);
        this._refresh();
      },

      removeAttribute: function (name, value) {
        Object.getPrototypeOf(this).removeAttribute.call(this, name, value);
        this._refresh();
      },

      removeAttributeNS: function (ns, name, value) {
        Object.getPrototypeOf(this).removeAttributeNS.call(this, ns, name,
            value);
        this._refresh();
      },

      _textContent: function (t) {
        this.textContent = t;
        this._refresh();
      },

      _init: function () {},

      $: function () {
        return flexo.create_element.apply(this.ownerDocument, arguments);
      },

      // The node was modified (a child was added or removed, text content
      // changed, or an attribute was set.) Instances of the component that the
      // node is part of (if any) will be scheduled for refresh. A @refresh
      // event is sent.
      _refresh: function () {
        var component = component_of(this);
        if (component) {
          component._instances.forEach(function (i) {
            component.ownerDocument._refresh_instance(i);
          });
        }
        flexo.notify(this, "@refresh");
      },

      // TODO make a smarter serializer
      _serialize: function () {
        return new XMLSerializer().serializeToString(this);
      }
    },

    component: {

      _init: function () {
        this._components = {};       // child components
        this._watches = [];          // child watches
        this._properties = {};       // properties map (elements)
        this._uses = [];             // use children (outside of a view)
        this._instances = [];        // instances of this component
        this._uri = "";
        Object.defineProperty(this, "_is_component", { enumerable: true,
          get: function () { return true; }
        });
      },

      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "app" || ch.localName === "component") {
            this._add_component(ch);
          } else if (ch.localName === "desc") {
            if (this._desc) {
              Object.getPrototypeOf(this).removeChild.call(this, this._desc);
            }
            this._desc = ch;
          } else if (ch.localName === "property") {
            this._properties[ch._name] = ch;
          } else if (ch.localName === "script") {
            ch._run();
          } else if (ch.localName === "title") {
            if (this._title) {
              Object.getPrototypeOf(this).removeChild.call(this, this._title);
            }
            this._title = ch;
            this._instances.forEach(function (i) {
              i.update_title();
            });
          } else if (ch.localName === "use") {
            this._uses.push(ch);
            this._refresh();
          } else if (ch.localName === "view") {
            if (this._view) {
              Object.getPrototypeOf(this).removeChild.call(this, this._view);
            }
            this._view = ch;
            this._refresh();
          } else if (ch.localName === "watch") {
            this._watches.push(ch);
            this._refresh();
          }
        }
        return ch;
      },

      removeChild: function (ch) {
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
        } else if (ch.hasOwnProperty("_value") && ch.hasOwnProperty("_name")) {
          delete this._properties[ch._name];
        } else if (ch._render) {   // use node
          flexo.remove_from_array(this._uses, ch);
          this._refresh();
        } else if (ch._watches) {  // watch node
          flexo.remove_from_array(this._watches, ch);
          this._refresh();
        }
        return ch;
      },

      setAttribute: function (name, value) {
        if (name === "id") {
          this._id = value.trim();
          if (this.parentNode && this.parentNode._add_component) {
            this.parentNode._add_component(this);
          }
        }
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
      },

      // Add a new sub-component
      _add_component: function (component) {
        if (component._id) {
          // TODO check for duplicate id
          this._components[component._id] = component;
          this.ownerDocument._add_component(component);
        }
      },

      _find_by_id: function (id) {
        var q = A.slice.call(this.childNodes);
        while (q.length) {
          var elem = q.shift();
          if (elem.nodeType === Node.ELEMENT_NODE &&
              (elem.getAttribute("id") === id ||
               elem.getAttributeNS(flexo.XML_NS, "id") === id)) {
            return elem;
          }
          A.push.apply(q, elem.childNodes);
        }
      },
    },

    // The content element is a placeholder for contents to be added at
    // instantiation time. When a component is instantiated with a <use>
    // element, the contents of the <use> element are inserted in place of the
    // <content> element. When the <use> element has no content, then the
    // contents of the <content> element are used by default.
    // Attributes of the <content> element are copied to its top-level element
    // children (in most case, there would be only one element child, such as a
    // <div> or <g> to avoid ambiguity), with the exception of `id` and
    // `content-id`. `content-id` will be used as the id of the instantiated
    // content.
    // TODO use `id` to provide different named content slots for instantiation:
    // <component>                    <use>
    //   <view>                         <content ref="a">A</content>
    //     <content id="a"/>   -->      <content ref="b">B</content>
    //     <content id="b"/>          </use>
    //   </view>
    // </component>
    content: {
      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "content-id" || name === "id") {
          this["_" + name.replace(/-i/, "I")] = value.trim();
        }
        this._refresh();
      }
    },

    get: {
      _init: function () {
        Object.defineProperty(this, "_content", { enumerable: true,
          get: function () { return this._action; },
          set: function (f) {
            if (typeof f === "function") {
              this._action = f;
            }
          }
        });
        return this;
      },

      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === Node.TEXT_NODE ||
            ch.nodeType === Node.CDATA_SECTION_NODE) {
          this._update_action();
        }
        return ch;
      },

      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "event" || name === "property" ||
            name === "use" || name === "view") {
          this["_" + name] = value.trim();
        } else if (name === "once") {
          this._once = flexo.is_true(value);
        }
      },

      _textContent: function (t) {
        this.textContent = t;
        this._update_action();
      },

      _update_action: function () {
        if (/\S/.test(this.textContent)) {
          // TODO handle errors
          this._action = new Function("value", this.textContent);
        } else {
          delete this._action;
        }
      }
    },

    // Declares and/or sets the value of a property
    //   * `name` is the name of the property (mandatory)
    //   * `value` is the value of the property (defaults to "")
    //   * `type` is the type of the value, i.e., how the argument string should
    //   be parsed (defaults to "string"; see PROPERTY_TYPES for legal types)
    property: {
      _init: function () {
        this._value = "";
        this._type = "string";
      },

      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === Node.TEXT_NODE ||
            ch.nodeType === Node.CDATA_SECTION_NODE) {
          this._value = this.textContent;
        }
      },

      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "name") {
          if (this.hasOwnProperty(name) && value !== this._name) {
            if (this.parentNode) {
              if (typeof this.parentNode._properties === "object") {
                delete this.parentNode._properties[this._name];
              }
              if (typeof this.parentNode._property_values === "object") {
                delete this.parentNode._property_values;
              }
            }
          }
          this._name = value.trim();
          if (this.parentNode &&
              typeof this.parentNode._property_values === "object") {
            this.parentNode._property_values[this._name] = this._get_value();
          }
        } else if (name === "type") {
          this._set_type(value);
        } else if (name === "value") {
          this._value = value;
        }
      },

      _textContent: function (t) {
        this.textContent = t;
        this._value = t;
      },

      // Get the parsed value for the property
      _get_value: function (v) {
        return PROPERTY_TYPES[this._type](v === undefined ? this._value : v);
      },

      _set_type: function (type) {
        type = type.trim().toLowerCase();
        if (type in PROPERTY_TYPES) {
          this._type = type;
        }
      }
    },

    script: {
      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === Node.TEXT_NODE ||
            ch.nodeType === Node.CDATA_SECTION_NODE) {
          this._run();
        }
        return ch;
      },

      // TODO setAttribute: href for script file location

      _textContent: function (t) {
        this.textContent = t;
        this._run();
      },

      _run: function () {
        if (!this.parentNode || this._ran || !/\S/.test(this.textContent)) {
          return;
        }
        if (!this.parentNode._prototype) {
          this.parentNode._prototype = Object.create(component_instance);
        }
        new Function(this.textContent).call(this.parentNode);
        this._ran = true;
      }
    },

    set: {
      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.nodeType === Node.TEXT_NODE ||
            ch.nodeType === Node.CDATA_SECTION_NODE) {
          this._update_action();
        }
        return ch;
      },

      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "attr" || name === "property" ||
            name === "use" || name === "view") {
          this["_" + name] = value.trim();
        }
      },

      _textContent: function (t) {
        this.textContent = t;
        this._update_action();
      },

      _update_action: function () {
        if (/\S/.test(this.textContent)) {
          // TODO handle errors
          this._action = new Function("value", this.textContent);
        } else {
          delete this._action;
        }
      }
    },

    target: {
      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (name === "q" || name === "ref") {
          this["_" + name] = value.trim();
          this._refresh();
        } else if (name === "once") {
          this._once = value.trim().toLowerCase() === "true";
          this._refresh();
        }
      },

      _find_target: function (dest) {
        if (this._q) {
          return dest.ownerDocument.querySelector(this._q);
        }
        if (this._ref) {
          return dest.ownerDocument.getElementById(this._ref);
        }
        return dest;
      }
    },

    use: {
      _init: function () {
        this._properties = {};
      },

      // Attributes interpreted by use
      _attributes: { href: true, id: true, q: true, ref: true },

      // Handle property elements
      insertBefore: function (ch, ref) {
        Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
        if (ch.namespaceURI === bender.NS &&  ch.localName === "property") {
          this._properties[ch._name] = ch;
        }
        return ch;
      },

      // Handle property elements
      removeChild: function (ch) {
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        if (ch.hasOwnProperty("_value") && ch.hasOwnProperty("_name")) {
          delete this._properties[ch._name];
        }
        return ch;
      },

      setAttribute: function (name, value) {
        Object.getPrototypeOf(this).setAttribute.call(this, name, value);
        if (this._attributes.hasOwnProperty(name)) {
          this["_" + name] = value.trim();
        }
        this._refresh();
      },

      // Find the component referred to by the node (through the ref, q or href
      // attribute, checked in that order.) Return the component node or its URI
      // if it needs loading.
      _find_component: function () {
        var component;
        if (this._ref) {
          var parent_component = component_of(this);
          while (!component && parent_component) {
            component = parent_component._components[this._ref];
            parent_component = component_of(parent_component.parentNode);
          }
          return component;
        }
        if (this._q) {
          return this.ownerDocument.querySelector(this._q);
        }
        if (this._href) {
          var href = (this._href.indexOf("#") === 0 ? component_of(this)._uri :
              "") + this._href;
          return this.ownerDocument._load_component(href);
        }
      },

      // Render the node in the given target and parent instance; return the new
      // instance or true to mark a promise that this component will be
      // rendered. TODO: dummy instance?
      _render: function (target, parent) {
        var component = this._find_component();
        if (typeof component === "string") {
          flexo.listen_once(this.ownerDocument, "@loaded", function (e) {
            if (e.uri === component) {
              flexo.notify(this, "@loaded", { instance: this
                ._render_component(e.component, target, parent) });
            }
          }.bind(this));
          return true;
        }
        if (component) {
          return this._render_component(component, target, parent);
        }
        console.warn("use._render: No component for", this);
      },

      _render_component: function (component, target, parent) {
        this._component = component;
        this._instance =
          Object.create(component._prototype || component_instance)
            .init(this, parent, target);
        if (this._instance.instantiated) {
          this._instance.instantiated();
        }
        flexo.notify(this, "@instance", { instance: this._instance });
        this._instance.refresh_component_instance();
        return this._instance;
      },

      _unrender: function () {
        if (this._instance) {
          this._instance.unrender();
          delete this._instance;
        }
      }
    },

    view: {
      insertBefore: function (ch, ref) {
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

      removeChild: function (ch) {
        Object.getPrototypeOf(this).removeChild.call(this, ch);
        this._refresh();
        return ch;
      }
    },

    watch: {
      _init: function () {
        this._gets = [];
        this._sets = [];
        this._watches = [];
      },

      insertBefore: function (ch, ref) {
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
      }
    }
  };

  // Specific functions to create get, set and script attributes with an actual
  // function rather than a string to create a function for the action
  ["get", "set", "script"].forEach(function (name) {
    PROTOTYPES.component["$" + name] = function (attrs, action) {
      var elem = action ? this.$(name, attrs) : this.$(name);
      if (typeof action === "function") {
        elem._action = action;
      } else if (typeof attrs === "function") {
        elem._action = attrs;
      }
      return elem;
    };
  });

  PROTOTYPES.app = PROTOTYPES.component;
  PROTOTYPES.context = PROTOTYPES.component;

}(typeof exports === "object" ? exports : window.bender = {}));
