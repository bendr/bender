(function (bender) {
  "use strict";

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Extend this with custom instances, &c.
  bender.$ = {};


  bender.context = {};

  // Initialize the context for the given host document (this.document); keep
  // track of instance tree roots (this.instance) and loaded URIs (this.loaded)
  bender.context.init = function (host) {
    this.document = host;
    this.loaded = {};
    // These are mostly for debugging purposes
    this.components = [];
    this.instances = [];
    this.invalidated = [];
    this.request_update_delay = 0;
    return this;
  };

  // Create a new Bender context for the given host document (window.document by
  // default.)
  bender.create_context = function (host) {
    return Object.create(bender.context).init(host || window.document);
  };

  // Wrap new elements
  bender.context.$ = function (name, attrs) {
    var contents;
    if (typeof attrs === "object" && !(attrs instanceof Node)) {
      contents = A.slice.call(arguments, 2);
    } else {
      contents = A.slice.call(arguments, 1);
      attrs = {};
    }
    var classes = name.trim().split(".");
    name = classes.shift();
    if (classes.length > 0) {
      attrs["class"] =
        (attrs.hasOwnProperty("class") ? attrs["class"] + " " : "")
        + classes.join(" ");
    }
    var m = name.match(/^(?:([^:]+):)?([^#]+)(?:#(.+))?$/);
    if (m) {
      var ns = (m[1] && flexo.ns[m[1].toLowerCase()]) || bender.ns;
      var elem = this.wrap_element(ns ?
          this.document.createElementNS(ns, m[2]) :
          this.document.createElement(m[2]));
      if (m[3]) {
        attrs.id = m[3];
      }
      Object.keys(attrs).forEach(function (a) {
        if (attrs[a] !== null && attrs[a] !== undefined && attrs[a] !== false) {
          var sp = a.split(":");
          var ns = sp[1] && flexo.ns[sp[0].toLowerCase()];
          if (ns) {
            elem.setAttributeNS(ns, sp[1], attrs[a]);
          } else {
            elem.setAttribute(a, attrs[a]);
          }
        }
      });
      contents.forEach(function (ch) {
        flexo.append_child(elem, ch);
      });
      return elem;
    }
  };

  // Load a component prototype for a component using its href attribute.
  // While a file is being loaded, store all components that are requesting it;
  // once it is loaded, store the loaded component prototype itself.
  bender.context.load_component = function (component) {
    var uri = flexo.normalize_uri(component.uri, component.href);
    if (this.loaded[uri] instanceof window.Node) {
      flexo.notify(component, "@loaded",
          { uri: uri, component: this.loaded[uri] });
    } else if (Array.isArray(this.loaded[uri])) {
      this.loaded[uri].push(component);
    } else {
      this.loaded[uri] = [component];
      flexo.ez_xhr(uri, { responseType: "document" }, function (req) {
        var ev = { uri: uri, req: req };
        if (req.status !== 0 && req.status !== 200) {
          ev.message = "HTTP error {0}".fmt(req.status);
          flexo.notify(component, "@error", ev);
        } else if (!req.response) {
          ev.message = "could not parse response as XML";
          flexo.notify(component, "@error", ev);
        } else {
          var c = this.import_node(req.response.documentElement, uri);
          if (is_bender_element(c, "component")) {
            ev.component = c;
            var cs = this.loaded[uri].slice();
            this.loaded[uri] = c;
            cs.forEach(function (k) {
              flexo.notify(k, "@loaded", ev);
            });
          } else {
            ev.message = "not a Bender component";
            flexo.notify(component, "@error", ev);
          }
        }
      }.bind(this));
    }
  };

  // Import a node in the context (for loaded components)
  bender.context.import_node = function (node, uri) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      var n = this.wrap_element(this.document.createElementNS(node.namespaceURI,
            node.localName));
      if (is_bender_element(n, "component")) {
        n.uri = uri;
      }
      A.forEach.call(node.attributes, function (attr) {
        if (attr.namespaceURI) {
          if (attr.namespaceURI === flexo.ns.xmlns &&
              attr.localName !== "xmlns") {
            n.setAttribute("xmlns:" + attr.localName, attr.nodeValue);
          } else {
            n.setAttributeNS(attr.namespaceURI, attr.localName,
              attr.nodeValue);
          }
        } else {
          n.setAttribute(attr.localName, attr.nodeValue);
        }
      });
      A.forEach.call(node.childNodes, function (ch) {
        var ch_ = this.import_node(ch, uri);
        if (ch_) {
          n.appendChild(ch_);
        }
      }, this);
      return n;
    }
    if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      return this.document.createTextNode(node.textContent)
    }
  };

  bender.context.link = function (link) {
    if (link.done || !link.href || !link.rel || !link.parentElement) {
      return;
    }
    // Mark link as being done so we don't try to load anything anymore
    link.done = true;
    var uri = flexo.absolute_uri(link.parentElement.uri, link.href);
    if (this.loaded[uri]) {
      return;
    }
    this.loaded[uri] = true;
    console.log("[link]", uri);
    this["link_" + link.rel](uri, link);
  };

  bender.context.link_script = function (uri, link) {
    if (link.parentElement.__pending) {
      link.parentElement.__pending.push(uri);
    }
    flexo.ez_xhr(uri, { responseType: "text" }, function (req) {
      try {
        eval(req.responseText);
      } catch (e) {
        console.error("Error loading script {0}: {1}".fmt(uri, e.message));
      }
      link.parentElement.clear_pending(uri);
    });
  };

  bender.context.link_stylesheet = function () {};

  // Request an update. If there are no pending updates, create a new queue and
  // set a timeout so that additional updates can be queued up as well,
  // otherwise just add this update to the queue.
  // Send an @update notification every time the queue has been emptied with the
  // list of updates.
  // TODO sort updates
  bender.context.request_update = function (update) {
    if (!this.__update_queue) {
      this.__update_queue = [];
      var pending = [];
      setTimeout(function () {
        var updates = this.__update_queue.slice();
        delete this.__update_queue;
        updates.forEach(function (update, i) {
          if (typeof update === "function") {
            update();
            update.skipped = true;
          } else {
            if (update.source && update.source.__pending) {
              pending.push(update.source);
            }
            if (update.source &&
              typeof update.source[update.action] === "function") {
              update.source[update.action].call(update.source, update);
            } else {
              update.skipped = true;
            }
          }
        });
        pending.forEach(function (p) {
          // TODO: the component is ready, but not its prototype :(
          prototypes.component.clear_pending.call(p, p);
        });
        flexo.notify(context, "@update", { updates: updates });
      }.bind(this), this.request_update_delay);
    }
    this.__update_queue.push(update);
  };

  // Update the URI of a component for the loaded map (usually when the id is
  // set, so the fragment identifier changes)
  bender.context.updated_uri = function (component, prev_uri) {
    if (component.uri !== prev_uri && this.loaded[prev_uri] === component) {
      delete this.loaded[prev_uri];
      if (!this.loaded[component.uri]) {
        this.loaded[component.uri] = component;
      }
    } else if (!this.loaded[component.uri]) {
      this.loaded[component.uri] = component;
    }
  };

  // Extend an element with Bender methods, calls its init() method, and return
  // the wrapped element.
  bender.context.wrap_element = function (e, proto) {
    if (typeof proto !== "object") {
      proto = prototypes[e.localName];
    }
    if (proto) {
      for (var p in proto) {
        if (proto.hasOwnProperty(p)) {
          e[p] = proto[p];
        }
      }
    }
    for (p in prototypes[""]) {
      if (prototypes[""].hasOwnProperty(p) && !e.hasOwnProperty(p)) {
        e[p] = prototypes[""][p];
      }
    }
    e.context = this;
    e.init();
    return e;
  };


  bender.instance = {};

  // Dummy methods to be overloaded by custom instances
  bender.instance.init = function () {};
  bender.instance.ready = function () {};
  bender.instance.will_render = function () {};
  bender.instance.did_render = function () {};

  bender.instance.invalidate = function (reason) {
    if (!this.__invalidated) {
      this.__invalidated = true;
      this.component.context.invalidated.push(this);
      this.component.context.request_update(function () {
        delete this.__invalidated;
        flexo.remove_from_array(this.component.context.invalidated, this);
        this.unrender_view();
        if (this.component.view) {
          this.will_render();
          this.roots = this.render_children(this.component.view, this.target);
          // Find the first child element or non-empty text node which will act
          // as the $root view node
          // TODO should be virtual so that even if there is no view it can
          // still be created
          for (var i = 0, n = this.roots.length; i < n; ++i) {
            var ch = this.roots[i];
            if (ch.nodeType === window.Node.ELEMENT_NODE ||
                ((ch.nodeType === window.Node.TEXT_NODE ||
                  ch.nodeType === window.Node.CDATA_SECTION_NODE) &&
                 /\S/.test(ch.textContent))) {
               this.views.$root = ch;
               break;
             }
          }
          this.component.watches.forEach(function (watch) {
            this.setup_watch(watch);
          }, this);
          if (this.__pending_edges) {
            var edges = this.__pending_edges.slice();
            delete this.__pending_edges;
            edges.forEach(function (f) {
              f.call(this);
            }, this);
          }
          this.did_render();
          if (!this.__pending_edges && !this.__running) {
            console.log("[invalidate] no more pending, running");
            this.__running = true;
            flexo.notify(this, "@running");
          }
        }
      }.bind(this));
    }
  };

  bender.instance.render_children = function (node, target) {
    var roots = [];
    A.forEach.call(Array.isArray(node) ? node : node.childNodes, function (ch) {
      var r = this.render_node(ch, target);
      if (r) {
        roots.push(r);
      }
    }, this);
    return roots;
  };

  bender.instance.find_instance_for_content = function (node) {
    for (var id = this.component.id, p = this.parent;
        p && !p.component.has_content_for(id); p = p.parent);
    return p;
  };

  bender.instance.render_node = function (node, target) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        if (node.localName === "component") {
          return this.render_component(node, target);
        } else if (node.localName === "content") {
          var instance = this.find_instance_for_content(node);
          if (instance) {
            return this.render_children(instance.component
                .content_for(this.component.id), target);
          } else {
            return this.render_children(this.component.content || node, target);
          }
        } else {
          console.warn("[render_node] Unexpected Bender element {0} in view"
              .fmt(node.localName));
        }
      } else {
        return this.render_foreign(node, target);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      return this.render_text(node, target);
    }
  };

  bender.instance.render_component = function (component, target) {
    component.create_instance(target, this);
    return target;
  };

  bender.instance.render_text = function (node, target) {
    var d = target.appendChild(
        this.component.context.document.createTextNode(node.textContent));
    this.bind_text(d);
    d.textContent =
      flexo.format.call(this, node.textContent, this.properties);
    return d;
  };

  bender.instance.render_foreign = function (elem, target) {
    // TODO wrap the element
    var d = target.appendChild(
        this.component.context.document.createElementNS(elem.namespaceURI,
          elem.localName));
    A.forEach.call(elem.attributes, function (attr) {
      var val = attr.value;
      if ((attr.namespaceURI === flexo.ns.xml || !attr.namespaceURI) &&
        attr.localName === "id") {
        this.views[val.trim()] = d;
      } else if (attr.namespaceURI &&
        attr.namespaceURI !== elem.namespaceURI) {
        this.bind_attr(d, attr);
        d.setAttributeNS(attr.namespaceURI, attr.localName,
          flexo.format.call(this, val, this.properties));
      } else {
        this.bind_attr(d, attr);
        d.setAttribute(attr.localName,
          flexo.format.call(this, val, this.properties));
      }
    }, this);
    A.forEach.call(elem.childNodes, function (ch) {
      this.render_node(ch, d);
    }, this);
    return d;
  };

  bender.instance.unrender_view = function () {
    this.children.forEach(function (ch) {
      if (ch.component.parentElement !== this.component) {
        this.remove_child(ch);
      }
    }, this);
    if (this.roots) {
      this.roots.forEach(function (r) {
        flexo.safe_remove(r);
      });
      delete this.roots;
    }
    var d = this.views.$document;
    this.views = { $document: d };
  };

  bender.instance.setup_property = function (property) {
    var value;
    var set = false;
    this.set_property[property.name] = function (v) {
      value = v;
      set = true;
      return value;
    };
    var instance = this.find_instance_with_property(property.name);
    if (instance === this) {
      Object.defineProperty(this.properties, property.name, {
        enumerable: true,
        configurable: true,
        get: function () {
          if (set) {
            return value;
          } else {
            var prop = instance.component.get_property(property.name);
            return prop &&
              instance.set_property[property.name](prop.parse_value(instance));
          }
        },
        set: function (v) {
          instance.set_property[property.name].call(instance, v);
          traverse_graph(instance.edges.filter(function (e) {
            return e.property === property.name;
          }));
        }
      });
    } else if (instance) {
      Object.defineProperty(this.properties, property.name, {
        enumerable: true,
        configurable: true,
        get: function () {
          return instance.properties[property.name];
        }
      });
    }
    this.bind_value(property);
  };

  // Extract properties from an attribute
  bender.instance.bind_attr = function (node, attr) {
    var pattern = attr.value;
    var set = {
      parent_instance: this,
      view: node,
      attr: attr.localName,
      value: pattern
    };
    if (attr.namespaceURI && attr.namespaceURI !== node.namespaceURI) {
      set.ns = attr.namespaceURI;
    }
    return this.bind(pattern, set);
  };

  // Extract properties from a property value on an instance element
  bender.instance.bind_prop = function (instance, property, value) {
    return this.bind(value, {
      parent_instance: this,
      instance: instance,
      property: property,
      value: value
    });
  }

  // Extract properties from a text node
  bender.instance.bind_text = function (node) {
    var pattern = node.textContent;
    return this.bind(pattern, {
      parent_instance: this,
      view: node,
      value: pattern
    });
  };

  // Extract properties from the value of a property
  bender.instance.bind_value = function (property) {
    var pattern = property.value;
    return this.bind(pattern, {
      parent_instance: this,
      instance: this,
      property: property.name,
      value: pattern
    });
  };

  bender.instance.find_instance_with_property = function (p) {
    return (this.component._has_own_property(p, true) && this) ||
      (this.parent && this.parent.find_instance_with_property(p));
  };

  // Extract properties from a text node or an attribute given a pattern and the
  // corresponding set action. If properties are found in the pattern, then add
  // a new watch to implement the binding and return true to indicate that a
  // binding was created
  bender.instance.bind = function (pattern, set_edge) {
    var props = this.match_properties(pattern);
    var keys = Object.keys(props);
    if (keys.length > 0) {
      var watch = { edges: [set_edge] };
      keys.forEach(function (p) {
        props[p].edges.push({ property: p, watch: watch, instance: props[p] });
      }, this);
      return true;
    }
  };

  // Match all properties inside a pattern
  bender.instance.match_properties = function (pattern) {
    var props = {};
    if (typeof pattern === "string") {
      var open = false;
      var prop;
      pattern.split(/(\{|\}|\\[{}\\])/).forEach(function (token) {
        if (token === "{") {
          prop = "";
          open = true;
        } else if (token === "}") {
          if (open) {
            if (!(props.hasOwnProperty(prop))) {
              var instance = this.properties.hasOwnProperty(prop) &&
                this.find_instance_with_property(prop);
              if (instance) {
                props[prop] = instance;
              }
            }
            open = false;
          }
        } else if (open) {
          prop += token.replace(/^\\([{}\\])/, "$1");
        }
      }, this);
    }
    return props;
  };


  // Bender elements overload some DOM methods in order to track changes to the
  // tree.

  var prototypes = {
    // Default overloaded DOM methods for Bender elements
    "": {
      // Make sure that an overloaded insertBefore() is called for appendChild()
      appendChild: function (ch) {
        return this.insertBefore(ch, null);
      },
      init: function () {}
    }
  };

  ["component", "content", "content-of", "get", "link", "property", "set",
    "view", "watch"
  ].forEach(function (p) {
    prototypes[p] = {};
  });

  prototypes["content-of"].setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "instance") {
      this.instance = value.trim();
      if (this.parentElement &&
          typeof this.parentElement.update_add_content_of === "function") {
        this.parentElement.update_add_content_of({ child: this });
      }
    }
  };

  prototypes["content-of"].removeAttribute = function () {
    Object.getPrototypeOf(this).removeAttribute.call(this, name);
    if (name === "instance") {
      delete this.instance;
      // TODO
    }
  };

  prototypes.component.init = function () {
    this.__pending = [this];
    this.__pending_instances = [];
    this.seqno = this.context.components.length;
    this.context.components.push(this);
    this.derived = [];       // components that derive from this one
    this.components = [];    // component children (outside of view)
    this.instances = [];     // instances of the component
    this.uri = this.context.document.baseURI;

    // parent component
    Object.defineProperty(this, "parent_component", { enumerable: true,
      get: function () {
        for (var p = this.parentElement;
          p && !is_bender_element(p, "component"); p = p.parentElement);
        return p;
      }
    });

    // property values passed as arguments
    var values = {};
    this._add_value = function (name, value) {
      values[name] = value;
    };
    this._delete_value = function (name) {
      delete values[name];
    }
    Object.defineProperty(this, "values", { enumerable: true,
      get: function () {
        if (this.prototype) {
          var vals = Object.create(this.prototype.values);
          for (var v in values) {
            if (values.hasOwnProperty(v)) {
              vals[v] = values[v];
            }
          }
          return vals;
        } else {
          return values;
        }
      }
    });

    // instance prototype
    var instance_prototype;
    Object.defineProperty(this, "instance_prototype", { enumerable: true,
      get: function () {
        return instance_prototype ||
          (this.prototype && this.prototype.instance_prototype) ||
          "bender.instance";
      },
      set: function (p) {
        instance_prototype = p;
      }
    });

    // href property: this component inherits from that component
    // may require loading
    var href;
    this._set_href = function (h) {
      href = h;
      if (h) {
        this.context.request_update({ action: "set_component_prototype",
          source: this });
      }
    };
    Object.defineProperty(this, "href", { enumerable: true,
      get: function () { return href; },
      set: function (h) {
        if (h !== href) {
          if (h) {
            this.setAttribute("href", h);
          } else {
            this.removeAttribute("href");
          }
        }
      }
    });

    var content_of = {};
    this.has_content_for = function (id) {
      return content_of.hasOwnProperty(id) ||
        (this.prototype && this.prototype.has_content_for(id));
    };
    this.add_content_for = function (id, content) {
      content_of[id] = content;
    };
    this.content_for = function (id) {
      return (content_of.hasOwnProperty(id) && content_of[id]) ||
        (this.prototype && this.prototype.content_for(id));
    };


    // content can be a node, or can be inferred from everything that is not
    // content. Content is *not* inherited!
    var content;
    this.has_content_element = function() {
      return !!content;
    };
    this._set_content = function (element) {
      content = element;
      this.instances.forEach(function (instance) {
        instance.set_content(content);
      });
    };
    this._remove_content = function (element) {
      content = null;
      this.instances.forEach(function (instance) {
        instance.set_content(this.content);
      }, this);
    };
    Object.defineProperty(this, "content", { enumerable: true,
      get: function () {
        if (content) {
          return content;
        } else {
          var c = [];
          A.forEach.call(this.childNodes, function (ch) {
            if (ch.nodeType === window.Node.ELEMENT_NODE) {
              if (ch.namespaceURI === bender.ns) {
                if (ch.localName === "component") {
                  c.push(ch);
                }
              } else {
                c.push(ch);
              }
            } else if (ch.nodeType === window.Node.TEXT_NODE ||
              ch.nodeType === window.Node.CDATA_SECTION_NODE) {
              if (/\S/.test(ch.textContent)) {
                c.push(ch);
              }
            }
          });
          if (c.length > 0) {
            return c;
          } else if (this.prototype) {
            return this.prototype.content;
          }
        }
      },
      set: function (c) {
        if (content) {
          this.removeChild(content);
        }
        if (c) {
          this.appendChild(c);
        }
      }
    });

    // properties property
    var properties = {};
    this._has_own_property = function (name, inherited) {
      return properties.hasOwnProperty(name) ||
        (inherited && this.prototype && this.prototype._has_own_property(name));
    };
    this._add_property = function (property) {
      properties[property.name] = property;
      this.instances.forEach(function (instance) {
        instance.setup_property(property);
      });
      this.derived.forEach(function (component) {
        if (!component._has_own_property(property.name)) {
          component.instances.forEach(function (instance) {
            instance.setup_property(property);
          });
        }
      });
    };
    this._remove_property = function (property) {
      if (typeof property === "string") {
        property = properties[property];
      }
      delete properties[property.name];
    };
    this.get_property = function (name) {
      return (properties.hasOwnProperty(name) && properties[name]) ||
        (this.prototype && this.prototype.get_property(name)) ||
        (this.parent_component && this.parent_component.get_property(name));
    };
    Object.defineProperty(this, "properties", { enumerable: true,
      get: function () {
        var props = (this.prototype && this.prototype.properties) || {};
        Object.keys(properties).forEach(function (p) {
          props[p] = properties[p];
        });
        return props;
      }
    });

    // watches property
    var watches = [];
    this._add_watch = function (watch) {
      watches.push(watch);
      this.instances.forEach(function (instance) {
        instance.setup_watch(watch);
      });
      this.derived.forEach(function (component) {
        component.instances.forEach(function (instance) {
          instance.setup_watch(watch);
        });
      });
    };
    Object.defineProperty(this, "watches", { enumerable: true,
      get: function () {
        var w = (this.prototype && this.prototype.watches) || [];
        w.push.apply(w, watches);
        return w;
      }
    });

    // view property
    var view;
    this._set_view = function (v) {
      view = v;
      this.refresh_view();
    };
    this.has_own_view = function () {
      return !!view;
    };
    Object.defineProperty(this, "view", { enumerable: true,
      get: function () {
        return view || (this.prototype && this.prototype.view);
      },
      set: function (v) {
        if (v !== view) {
          if (view) {
            this.removeChild(view);
          }
          if (v) {
            this.appendChild(v);
          }
        }
      }
    });
  };

  prototypes.component.has_property = function (name) {
    return this._has_own_property(name, true) ||
      (this.parent_component && this.parent_component.has_property(name));
  };

  // Remove `p` from the list of pending items. If p is a string (an URI),
  // replace it with the actual component that was loaded
  prototypes.component.clear_pending = function (pending) {
    if (this.__pending) {
      flexo.remove_from_array(this.__pending, pending);
      if (typeof pending === "string") {
        pending = this.context.loaded[pending];
        if (typeof pending === "object" && pending.__pending) {
          this.__pending.push(pending);
        }
      }
      if (this.__pending.length === 0) {
        delete this.__pending;
        if (this.instances) {
          this.instances.forEach(function (instance) {
            instance.component_ready();
          });
        }
        for (var p = this.parentElement;
            p && !(typeof p.clear_pending === "function");
            p = p.parentElement);
        if (p) {
          p.clear_pending(this);
        }
        if (this.derived) {
          this.derived.forEach(function (d) {
            d.clear_pending(this);
          }, this);
        }
      }
      if (this.__pending_instances) {
        var still_pending = flexo.find_first(this.__pending, function (p) {
          return p === this || p === this.prototype || typeof p === "string";
        }, this);
        if (!still_pending) {
          this.__pending_instances.forEach(function (p) {
            p.call(this);
          }, this);
          delete this.__pending_instances;
        }
      }
    }
  };

  // Add a property element to the component, provided that it has a name.
  prototypes.component.add_property = function (property) {
    if (property.name) {
      if (this._has_own_property(property.name)) {
        this._remove_property(property.name);
      }
      this.appendChild(property);
    } else {
      console.warn("Not adding property without a name.", property);
    }
  };

  // Remove a property from the component.
  prototypes.component.remove_property = function (property) {
    if (property.name && this.properties[property.name] === property) {
      this.removeChild(property);
    } else {
      console.warn("Not a property of component", this);
    }
  };

  prototypes.component.refresh_view = function () {
    this.instances.forEach(function (instance) {
      instance.invalidate("refresh_view on component {0}".fmt(this.seqno));
    }, this);
    this.derived.forEach(function (component) {
      if (!component.has_own_view()) {
        component.refresh_view();
      }
    });
  };

  // Create a new instance with a target element to render in and optionally a
  // parent instance
  prototypes.component.create_instance = function (target, parent, k) {
    console.log("[create_instance]", this);
    var placeholder = target.appendChild(this.context.$("placeholder"));
    if (this.__pending_instances) {
      this.__pending_instances.push(function () {
        this.create_instance_(placeholder, parent, k);
      });
    } else {
      this.create_instance_(placeholder, parent, k);
    }
  };

  prototypes.component.create_instance_ = function (placeholder, parent, k) {
    try {
      var instance = eval("Object.create({0})".fmt(this.instance_prototype));
    } catch (e) {
      console.error("[create_instance] could not create object \"{0}\""
          .fmt(this.instance_prototype));
      instance = Object.create(bender.instance);
    }
    this.instances.push(instance);
    instance.seqno = this.context.instances.length;
    this.context.instances.push(instance);
    instance.component = this;
    instance.target = placeholder;
    instance.__placeholder = placeholder;
    instance.children = [];
    instance.instances = { $self: instance };
    instance.views = { $document: this.context.document };
    instance.properties = {};
    instance.set_property = {};
    instance.edges = [];
    instance.init();
    if (parent) {
      parent.add_child(instance);
    }
    if (!this.__pending) {
      instance.component_ready();
    }
    if (k) {
      k(instance);
    }
  };

  bender.instance.setup_properties = function (component) {
    var props = component.properties;
    Object.keys(props).forEach(function (p) {
      if (!this.hasOwnProperty(p)) {
        this.setup_property(props[p]);
      }
    }, this);
    component = component.parent_component;
    if (component) {
      this.setup_properties(component);
    }
  };

  bender.instance.component_ready = function () {
    this.ready();
    this.setup_properties(this.component);
    if (!this.roots) {
      this.invalidate("component {0} ready".fmt(this.component.seqno));
    }
    if (this.__placeholder) {
      var placeholder = this.__placeholder;
      var f = function () {
        var parent = placeholder.parentElement;
        A.slice.call(placeholder.childNodes).forEach(function (ch) {
          parent.insertBefore(ch, placeholder);
        });
        parent.removeChild(placeholder);
      };
      f.action = "remove_placeholder";
      this.component.context.request_update(f);
    }
  };

  bender.instance.add_child = function (instance) {
    this.children.push(instance);
    instance.parent = this;
    if (instance.component.id) {
      for (var p = this; p; p = p.component.parentElement && p.parent) {
        p.instances[instance.component.id] = instance;
        var pending = p.__pending_edges &&
          flexo.extract_from_array(p.__pending_edges, function (f) {
            return f.instance === instance.component.id;
          });
        if (pending) {
          if (p.__pending_edges.length === 0) {
            delete p.__pending_edges;
            if (!p.__running) {
              console.log("[add_child] no more pending, running");
              p.__running = true;
              flexo.notify(p, "@running");
            }
          }
          pending.forEach(function (f) {
            f.call(p);
          });
        }
      }
    }
  };

  // TODO not really tested
  bender.instance.remove_child = function (instance) {
    instance.unrender_view();
    flexo.remove_from_array(this.children, instance);
    if (instance.component.id) {
      for (var p = this; p; p = p.component.parentElement && p.parent) {
        delete p.instances[instance.component.id];
      }
    }
    delete instance.parent;
  };

  bender.instance.remove_child = function (instance) {
    flexo.remove_from_array(this.children, instance);
    delete instance.parent;
  };

  bender.instance.setup_watch = function (watch) {
    var w = { edges: [] };
    var add_get_edge = function (get) {
      var edge = this.make_get_edge(get);
      if (!edge) {
        this.add_pending_edge(function () {
          console.log("[setup_watch] add pending get edge", get);
          add_get_edge.call(this, get);
        }, get.instance);
        return;
      }
      edge.watch = w;
      if (!edge.instance) {
        edge.instance = this;
      }
      edge.instance.edges.push(edge);
      // Set the event listeners to start graph traversal. We don't need to
      // worry about properties because they initiate traversal on their own
      var h = function (e) {
        if (!edge.__active) {
          edge.__value = e;
          traverse_graph([edge]);
        }
      };
      if (edge.dom_event) {
        edge.view.addEventListener(edge.dom_event, h, false);
      } else if (edge.event) {
        flexo.listen(edge.view || edge.instance, edge.event, h);
      }
    };
    watch.gets.forEach(function (get) {
      add_get_edge.call(this, get);
    }, this);
    var add_set_edge = function (set) {
      var edge = this.make_set_edge(set);
      if (edge) {
        w.edges.push(edge);
      } else {
        this.add_pending_edge(function () {
          console.log("[setup_watch] add pending set edge", set);
          add_set_edge.call(this, set);
        }, set.instance);
      }
    };
    watch.sets.forEach(function (set) {
      add_set_edge.call(this, set);
    }, this);
  };

  bender.instance.make_get_edge = function (elem) {
    var edge = this.make_edge(elem);
    if (edge) {
      if (elem.dom_event) {
        edge.dom_event = elem.dom_event;
        if (!edge.view) {
          edge.view = this.$document;
        }
      } else if (elem.event) {
        edge.event = elem.event;
      } else if (elem.property) {
        edge.property = elem.property;
      }
    }
    return edge;
  };

  bender.instance.make_set_edge = function (elem) {
    var edge = this.make_edge(elem);
    if (edge) {
      if (elem.attr) {
        edge.attr = elem.attr;
      } else if (elem.property) {
        edge.property = elem.property;
      } else if (elem.event) {
        edge.event = elem.event;
      }
    }
    return edge;
  };

  bender.instance.add_pending_edge = function (f, instance) {
    if (!this.hasOwnProperty("__pending_edges")) {
      this.__pending_edges = [];
    }
    if (instance) {
      f.instance = instance;
      console.log("+++ pending edge for {0}/{1}".fmt(this.seqno, instance));
    }
    this.__pending_edges.push(f);
  };

  // Make an edge for a get or set element
  bender.instance.make_edge = function (elem) {
    var edge = { parent_instance: this };
    if (elem.view) {
      edge.view = this.views[elem.view];
      if (!edge.view) {
        console.error("[make_edge] No view \"{0}\" (#{1}) for"
            .fmt(elem.view, this.seqno), elem);
        return;
      }
    }
    if (elem.instance) {
      edge.instance = this.instances[elem.instance];
      if (!edge.instance) {
        console.error("[make_edge] No instance \"{0}\" for"
            .fmt(elem.instance), elem);
        return;
      }
    } else {
      edge.instance = this;
    }
    if (elem.action) {
      edge.action = elem.action;
    }
    return edge;
  };

  prototypes.component.remove_component = function (update) {
    flexo.remove_from_array(this.components, update.child);
    for (var i = 0, n = this.instances.length; i < n; ++i) {
      var instance = flexo.find_first(this.instances[i].children,
          function (inst) {
            return inst.component === update.child;
          });
      this.instances[i].remove_child(instance);
    }
  };

  prototypes.component.remove_view = function (update) {
    this._set_view();
  };

  prototypes.component.update_view = function (update) {
  };

  prototypes.component.set_instance_prototype = function () {
    this.instances.forEach(function (instance, i, instances) {
      var prototype = this.instance_prototype || "bender.instance";
      try {
        var proto = eval(prototype);
        var new_instance = Object.create(proto);
        for (var p in instance) {
          if (instance.hasOwnProperty(p) && !proto.hasOwnProperty(p)) {
            new_instance[p] = instance[p];
          }
        }
        new_instance.__previous_instance = instance;
        instances[i] = new_instance;
        new_instance.init();
      } catch (e) {
        console.error("[set_instance_prototype] could not create object {0}"
            .fmt(prototype));
      }
    }, this);
    this.derived.forEach(function (component) {
      if (!component.hasOwnProperty("instance_prototype")) {
        component.set_instance_prototype();
      }
    });
  };

  // TODO
  // Replace this component everywhere?
  prototypes.component.set_component_prototype = function () {
    var uri = flexo.absolute_uri(this.uri, this.href);
    var loaded = function (e) {
      var re_render = !e.source.has_own_view() && !e.component.__pending;
      if (e.source.prototype) {
        flexo.remove_from_array(e.source.prototype.derived, e.source);
      }
      e.source.prototype = e.component;
      e.source.prototype.derived.push(e.source);
      if (re_render) {
        e.source.instances.forEach(function (instance) {
          instance.invalidate("rerender after prototype is set for component {0}".fmt(this.seqno));
        });
      }
      if (this.__pending) {
        this.context.request_update(function () {
          this.clear_pending(uri);
        }.bind(this));
      }
    }.bind(this);
    if (this.context.loaded[uri] instanceof window.Node) {
      loaded({ source: this, component: this.context.loaded[uri] });
    } else {
      if (this.__pending) {
        this.__pending.push(uri);
      }
      flexo.listen_once(this, "@loaded", loaded);
      flexo.listen_once(this, "@error", function (e) {
        console.error("Error loading component at {0}: {1}"
          .fmt(e.uri, e.message), e.source);
      });
      this.context.load_component(this);
    }
  };

  prototypes.component.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "component" || ch.localName === "content" ||
          ch.localName === "property" || ch.localName === "view" ||
          ch.localName === "watch") {
        this.context.request_update({ action: "update_add_" + ch.localName,
          source: this, child: ch });
      } else if (ch.localName === "content-of") {
        this.context.request_update({ action: "update_add_content_of",
          source: this, child: ch });
      } else if (ch.localName === "link") {
        this.context.link(ch);
      }
    }
    return ch;
  };

  prototypes.component.update_add_component = function (update) {
    this.components.push(update.child);
    if (this.__pending) {
      this.__pending.push(update.child);
    }
    this.instances.forEach(function (instance) {
      update.child.create_instance(instance.target, instance,
        function (child_instance) {
          instance.add_child(child_instance);
        });
    });
  };

  prototypes.component.update_add_content = function (update) {
    if (this._has_own_content()) {
      console.error("Component already has content", this);
    } else {
      this._set_content(update.child);
    }
  };

  prototypes.component.update_add_content_of = function (update) {
    if (update.child.instance) {
      this.add_content_for(update.child.instance, update.child);
      // TODO update rendering
    }
  };

  prototypes.component.update_add_property = function (update) {
    if (update.child.name) {
      if (this._has_own_property(update.child.name)) {
        console.error("Component already has a property named \"{0}\""
          .fmt(update.child.name, this));
      } else {
        this._add_property(update.child);
      }
    }
  };

  prototypes.component.update_add_view = function (update) {
    if (this.has_own_view()) {
      console.error("Component already has a view", this);
    } else {
      if (this.__pending && update.child.__pending) {
        A.push.apply(this.__pending, update.child.__pending);
        delete update.child.__pending;
      }
      this._set_view(update.child);
    }
  };

  prototypes.component.update_add_watch = function (update) {
    this._add_watch(update.child);
  };

  prototypes.component.removeChild = function (ch) {
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "component") {
        context.request_update({ action: "remove_component", source: this,
          child: ch });
      } else if (ch.localName === "view") {
        context.request_update({ action: "remove_view", source: this,
          child: ch });
      } else if (ch.localName === "property") {
        this._remove_property(ch);
      } else if (ch.localName === "watch") {
        flexo.remove_from_array(this.watches, ch);
      }
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };

  prototypes.component.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "href") {
      this._set_href(value.trim());
    } else if (name === "id") {
      this.id = value.trim();
      var prev_uri = this.uri;
      this.uri = this.uri.replace(/(#.*)?$/, "#" + this.id);
      this.context.updated_uri(this, prev_uri);
    } else if (name === "prototype") {
      this.instance_prototype = value.trim();
      this.context.request_update({ action: "set_instance_prototype",
        source: this });
    } else {
      this._add_value(name, value);
    }
  };

  prototypes.component.removeAttribute = function (name) {
    Object.getPrototypeOf(this).removeAttribute.call(this, name);
    if (name === "href") {
      this._set_href();
    } else if (name === "id") {
      delete this.id;
      var prev_uri = this.uri;
      this.uri = this.uri.replace(/(#.*)?$/, "");
      this.context.updated_uri(this, prev_uri);
    } else if (name === "prototype") {
      delete this.prototype;
    } else {
      this._delete_value(name);
    }
  };

  // Test whether the given node is an element in the Bender namespace with the
  // given name (or just a Bender node if no name is given)
  function is_bender_element(node, name) {
    return node instanceof window.Node &&
      node.nodeType === window.Node.ELEMENT_NODE &&
      node.namespaceURI === bender.ns &&
      (name === undefined || node.localName === name);
  }

  prototypes.view.init = function () {
    this.__pending = [];
  };

  prototypes.view.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    this.inserted(ch);
  };

  prototypes.view.inserted = function (ch) {
    if (ch.nodeType === window.Node.ELEMENT_NODE) {
      if (ch.namespaceURI !== bender.ns) {
        this.context.wrap_element(ch, prototypes.view);
        A.forEach.call(ch.childNodes, ch.inserted.bind(ch));
      }
    }
    for (var e = this; e.parentElement && !e.__pending; e = e.parentElement);
    if (e.__pending) {
      if (is_bender_element(ch, "component")) {
        e.__pending.push(ch);
      } else if (ch.__pending) {
        A.push.apply(e.__pending, ch.__pending);
        ch.__pending = [];
      }
    }
    this.context.request_update({ action: "update_view", source: this })
  };


  // Property type map with the corresponding evaluation function
  var property_types = {
    "boolean": flexo.is_true,
    "dynamic": function (value) {
      try {
        if (!/\n/.test(value)) {
          value = "return " + value;
        }
        return new Function(value).call(this);
      } catch (e) {
        console.error("Error evaluating dynamic property \"{0}\": {1}"
            .fmt(value, e.message));
      }
    },
    "number": parseFloat,
    "string": flexo.id
  };

  prototypes.property.init = function () {
    this.value = "";
    var as;
    Object.defineProperty(this, "as", { enumerable: true,
      get: function () {
        return as || (this.parentElement && this.parentElement.prototype &&
          this.parentElement.prototype.properties[this.name] &&
          this.parentElement.prototype.properties[this.name].as) || "string";
      },
      set: function (a) {
        if (a != null) {
          a = a.trim().toLowerCase();
          if (!property_types.hasOwnProperty(a)) {
            return;
          }
        }
        as = a;
      }
    });
  };

  prototypes.property.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "name") {
      var n = value.trim();
      if (this.name !== n) {
        this.name = n;
        if (this.parentNode &&
            typeof this.parentNode.add_property === "function") {
          this.context.request_update({ source: this.parentNode,
            action: "update_add_property", child: this, target: this });
        }
      }
    } else if (name === "as") {
      this.as = value;
    } else if (name === "value") {
      this.value = value;
      if (this.parentNode &&
          typeof this.parentNode.init_property === "function") {
        this.context.request_update({ source: this.parentNode,
          action: "init_property", child: this });
      }
    }
  };

  prototypes.property.removeAttribute = function (name) {
    Object.getPrototypeOf(this).removeAttribute.call(this, name);
    if (name === "name") {
      delete this.name;
    } else if (name === "as") {
      this.as = "string";
    } else if (name === "value") {
      this.value = "";
    }
  };

  // TODO get the value from the instance's component!
  prototypes.property.get_value = function (instance) {
    return (instance.component.values.hasOwnProperty(this.name) &&
        instance.component.values[this.name]) ||
      (this.parentElement &&
        this.parentElement.values.hasOwnProperty(this.name) &&
        this.parentElement.values[this.name]) || this.value;
  };

  // Get the parsed value for the property
  prototypes.property.parse_value = function (instance, v) {
    var that = this.as === "dynamic" ? instance : instance.properties;
    var val = (v === undefined ? this.get_value(instance) : v).format(that);
    return property_types[this.as].call(that, val);
  };


  prototypes.watch.init = function () {
    this.gets = [];
    this.sets = [];
  };

  prototypes.watch.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch)) {
      if (ch.localName === "get") {
        this.gets.push(ch);
      } else if (ch.localName === "set") {
        this.sets.push(ch);
      }
    }
  };

  prototypes.watch.removeChild = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (is_bender_element(ch)) {
      if (ch.localName === "get") {
        flexo.remove_from_array(this.gets, ch);
      } else if (ch.localName === "set") {
        flexo.remove_from_array(this.sets, ch);
      }
    }
  };


  // Traverse the graph of watches starting with an initial set of edges
  // TODO depth-first traversal of the graph?
  function traverse_graph(edges) {
    for (var i = 0; i < edges.length; ++i) {
      var get = edges[i];
      if (!get.__active) {
        var active = true;
        get.__active = true;
        get.cancel = function () {
          active = false;
        };
        var get_value = edge_value(get);
        if (active) {
          get.watch.edges.forEach(function (set) {
            follow_set_edge(get, set, edges, get_value);
          });
        }
        delete get.cancel;
      }
    }
    edges.forEach(function (edge) {
      delete edge.__active;
    });
  }

  // Get the value for an edge given an instance and a default value (may be
  // undefined; e.g. for get edges.) The `set` flag indicates that this is a set
  // edge, which ignores the `property` property. Set the __value placeholder on
  // the edge to provide a value (it is then deleted); otherwise try the `value`
  // property, then the `property` property. String values are interpolated from
  // the instance properties.
  // TODO use type like properties
  function edge_value(edge, set, val) {
    if (edge.hasOwnProperty("__value")) {
      val = edge.__value;
      delete edge.__value;
    } else if (edge.hasOwnProperty("value")) {
      // console.log("[edge_value]", edge.value);
      val = flexo.format.call(edge.parent_instance, edge.value,
          edge.parent_instance.properties);
    } else if (!set && edge.property) {
      val = edge.instance.properties[edge.property];
    }
    if (typeof edge.action === "function" && !edge.hasOwnProperty("value")) {
      val = edge.action.call(edge.parent_instance, val, edge);
    }
    return val;
  }

  // Follow a set edge from a get edge, and push all corresponding get edges for
  // the rest of the traversal
  function follow_set_edge(get, set, edges, get_value) {
    var set_value = edge_value(set, true, get_value);
    if (set_value !== undefined) {
      if (set.instance) {
        if (set.property) {
          if (typeof delay === "number" && delay >= 0) {
            set.instance.properties[set.property] = set_value;
          } else {
            set.instance.set_property[set.property](set_value);
            A.push.apply(edges, set.instance.edges.filter(function (e) {
              return e.property === set.property && edges.indexOf(e) < 0;
            }));
          }
        }
      } else if (set.view) {
        if (set.attr) {
          if (set.ns) {
            set.view.setAttributeNS(set.ns, set.attr, set_value);
          } else {
            set.view.setAttribute(set.attr, set_value);
          }
        } else if (set.property) {
          set.view[set.property] = set_value;
        } else {
          set.view.textContent = set_value;
        }
      }
    }
    if (set.hasOwnProperty("event")) {
      if (get_value instanceof window.Event) {
        get_value = { dom_event: get_value };
      }
      flexo.notify(set.instance || set.view, set.event, get_value);
    }
  }

  prototypes.get.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      this.update_action();
    }
    return ch;
  };

  prototypes.get.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "event" || name === "instance" || name === "property" ||
        name === "view" || name === "value") {
      this[name] = value.trim();
    } else if (name === "dom-event") {
      this.dom_event = value.trim();
    }
  };

  prototypes.get.set_textContent = function (t) {
    this.textContent = t;
    this.update_action();
  };

  // Update the action: make a new function from the text content of the
  // element. If it has no content or there were compilation errors, default
  // to the id function
  prototypes.get.update_action = function () {
    if (/\S/.test(this.textContent)) {
      try {
        this.action = new Function("value", "get", this.textContent);
      } catch (e) {
        console.error("Could not compile action \"{0}\": {1}"
            .fmt(this.textContent, e.message));
        delete this.action;
      }
    } else {
      delete this.action;
    }
  };

  prototypes.set.insertBefore = prototypes.get.insertBefore;
  prototypes.set.set_textContent = prototypes.get.set_textContent;
  prototypes.set.update_action = prototypes.get.update_action;

  prototypes.set.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "event" || name === "instance" || name === "property" ||
        name === "view" || name === "value") {
      this[name] = value.trim();
    }
  };


  prototypes.link.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "rel") {
      var v = value.trim().toLowerCase();
      if (v === "script" || v === "stylesheet") {
        this.rel = v;
        this.context.link(this);
      } else {
        console.error("rel attribute for link must be one of \"script\" or \"stylesheet\", not \"{0}\""
            .fmt(value));
      }
    } else if (name === "href") {
      this.href = value;
      this.context.link(this);
    }
  };

}(window.bender = {}))
