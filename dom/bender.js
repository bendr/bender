(function (bender) {
  "use strict";

  var foreach = Array.prototype.forEach;
  var push = Array.prototype.push;

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


  bender.Environment = {};

  bender.init_environment = function () {
    var e = Object.create(bender.Environment);
    e.loaded = {};
    e.activation_queue = [];
    return e;
  };

  // Render `component` in the target element and call the continuation `k` when
  // finished.
  bender.Environment.render_component = function (component, target, k) {
    component.render(target, k);
  };

  function dequeue() {
    for (var i = 0; i < this.activation_queue.length; ++i) {
      var edge = this.activation_queue[i];
      if (edge.hasOwnProperty("__value")) {
        // input edge: activate its watch
        console.log("! activate %0 = “%1”".fmt(edge, edge.__value));
        if (!edge.watch.__activated) {
          edge.watch.__activated = true;
          push.apply(this.activation_queue, edge.watch.sets);
        }
      } else {
        // output edge: execute it from the activation values
        var vals = edge.watch.gets.map(function (g) {
          return g.__value;
        });
        console.log("! activate %0 = %1".fmt(edge, vals));
        edge.activate(vals.length < 2 ? vals[0] : vals);
      }
    }
    this.activation_queue.forEach(function (edge) {
      delete edge.__value;
      delete edge.watch.__activated;
    });
    console.log("! clear activation queue");
    this.activation_queue = [];
  }

  // Activate an edge in the watch graph; in a sort of breadth-first traversal.
  // Set the activation value on the edge as well; if it was already set, then
  // the edge was already activated once so do nothing except update the
  // activation value.
  bender.Environment.activate = function (edge, value) {
    console.log("! enqueue %0".fmt(edge));
    if (!edge.hasOwnProperty("__value")) {
      this.activation_queue.push(edge);
      if (!this.activation_queue.timer) {
        this.activation_queue.timer = window.setTimeout(dequeue.bind(this), 0);
      }
    }
    edge.__value = value;
  };

  // Load a component at the given URL and call k with the loaded component (or
  // an error)
  bender.Environment.load_component = function (url, k) {
    if (!this.loaded.hasOwnProperty(url)) {
      this.loaded[url] = [k];
      flexo.ez_xhr(url, { responseType: "document" }, function (req) {
        var ks = this.loaded[url];
        if (req.response) {
          this.deserialize(req.response.documentElement, function (d) {
            if (flexo.instance_of(d, bender.Component)) {
              this.loaded[url] = d;
            } else {
              this.loaded[url] = "not a component";
            }
            ks.forEach(function (k_) {
              k_(this.loaded[url]);
            }, this);
          }.bind(this));
        } else {
          this.loaded[url] = req.status;
          ks.forEach(function (k_) {
            k_(this.loaded[url]);
          }, this);
        }
      }.bind(this));
    } else if (Array.isArray(this.loaded[url])) {
      this.loaded[url].push(k);
    } else {
      k(this.loaded[url]);
    }
  };

  // Deserialize `node` in the environment; upon completion, call k with the
  // created object (if any)
  bender.Environment.deserialize = function (node, k) {
    if (node.nodeType === window.Node.ELEMENT_NODE &&
        node.namespaceURI === bender.ns) {
      var f = bender.Environment.deserialize[node.localName];
      if (typeof f === "function") {
        return f.call(this, node, k);
      }
    }
    // TODO error handling
    // TODO find Bender elements in the document
    k();
  };

  bender.Environment.deserialize.component = function (elem, k) {
    var init_component = function (env, prototype) {
      var component = bender.init_component();
      component.id = elem.getAttribute("id");
      if (prototype) {
        component.prototype = prototype;
      }
      var seq = flexo.seq();
      foreach.call(elem.childNodes, function (ch) {
        seq.add(function (k_) {
          env.deserialize(ch, function (d) {
            component.append_child(d);
            k_();
          });
        });
      });
      seq.add(function () {
        k(component);
      });
    };
    if (elem.hasAttribute("href")) {
      this.load_component(
        flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")),
        function (d) {
          init_component(this, d);
        }.bind(this)
      );
    } else {
      init_component(this);
    }
  };

  bender.Environment.deserialize.link = function (elem, k) {
    var uri = flexo.absolute_uri(elem.baseURI, elem.getAttribute("href"));
    k(bender.init_link(uri, elem.getAttribute("rel")));
  };

  bender.Environment.deserialize.property = function (elem, k) {
    var value = elem.getAttribute("value");
    var v;
    if (value !== null) {
      var as = (elem.getAttribute("as") || "").trim().toLowerCase();
      if (as === "boolean") {
        v = function () {
          return flexo.is_true(value);
        };
      } else if (as === "dynamic") {
        v = new Function ("return " + value);
      } else if (as === "json") {
        v = function () {
          try {
            return JSON.parse(value);
          } catch (e) {
            console.log("Error parsing JSON string “%0”: %1".fmt(value, e));
          }
        };
      } else if (as === "number") {
        v = function () {
          return parseFloat(value);
        };
      } else {
        v = function () {
          return value;
        };
      }
    }
    k(bender.init_property(elem.getAttribute("name"), v));
  };

  bender.Environment.deserialize.view = function (elem, k) {
    this.deserialize_view_content(elem, function (d) {
      k(bender.init_view(elem.getAttribute("id"), elem.getAttribute("stack"),
          d));
    });
  };

  bender.Environment.deserialize_view_content = function (elem, k) {
    var children = [];
    var seq = flexo.seq();
    foreach.call(elem.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE) {
        if (ch.namespaceURI === bender.ns) {
          if (ch.localName === "component" ||
            ch.localName === "content" ||
            ch.localName === "attribute" ||
            ch.localName === "text") {
            seq.add(function (k_) {
              bender.Environment.deserialize[ch.localName].call(this, ch,
                function (d) {
                  children.push(d);
                  k_();
                });
            }.bind(this));
          } else {
            console.warn("Unexpected Bender element <%0> in view"
              .fmt(ch.localName));
          }
        } else {
          seq.add(function (k_) {
            this.deserialize_element(ch, function(d) {
              children.push(d);
              k_();
            });
          }.bind(this));
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        seq.add(function (k_) {
          children.push(bender.init_dom_text_node(ch.textContent));
          k_();
        });
      }
    }, this);
    seq.add(function () {
      k(children);
    });
  };

  bender.Environment.deserialize_element = function (elem, k) {
    this.deserialize_view_content(elem, function (d) {
      var attrs = {};
      foreach.call(elem.attributes, function (attr) {
        var nsuri = attr.namespaceURI || "";
        if (!(nsuri in attrs)) {
          attrs[nsuri] = {};
        }
        attrs[nsuri][attr.localName] = attr.value;
      });
      k(bender.init_element(elem.namespaceURI, elem.localName, attrs, d));
    });
  };

  bender.Environment.deserialize.content = function (elem, k) {
    this.deserialize_view_content(elem, function (d) {
      k(bender.init_content(elem.getAttribute("id"), d));
    });
  };

  bender.Environment.deserialize.attribute = function (elem, k) {
    var attr = bender.init_attribute(elem.getAttribute("id"),
        elem.getAttribute("ns"), elem.getAttribute("name"));
    var seq = flexo.seq();
    foreach.call(elem.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE &&
        ch.namespaceURI === bender.ns && ch.localName === "text") {
        seq.add(function (k_) {
          bender.Environment.deserialize.text.call(this, ch, function (d) {
            attr.append_child(d);
            k_();
          });
        }.bind(this));
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        seq.add(function (k_) {
          attr.append_child(bender.init_dom_text_node(ch.textContent));
          k_();
        });
      }
    }, this);
    seq.add(function () {
      k(attr);
    });
  };

  bender.Environment.deserialize.text = function (elem, k) {
    k(bender.init_text(elem.getAttribute("id"), elem.textContent));
  };

  bender.Environment.deserialize.watch = function (elem, k) {
    var watch = bender.init_watch(this);
    var seq = flexo.seq();
    foreach.call(elem.childNodes, function (ch) {
      seq.add(function (k_) {
        this.deserialize(ch, function (d) {
          if (d) {
            if (flexo.instance_of(d, bender.Get)) {
              watch.append_get(d);
            } else if (flexo.instance_of(d, bender.Set)) {
              watch.append_set(d);
            }
          }
          k_();
        });
      }.bind(this));
    }, this);
    seq.add(function () {
      k(watch);
    }.bind(this));
  };

  bender.Environment.deserialize.get = function (elem, k) {
    var value = elem.hasAttribute("value") ?
      "return " + elem.getAttribute("value") : elem.textContent;
    if (elem.hasAttribute("property")) {
      k(bender.init_get_property(elem.getAttribute("property"),
          elem.getAttribute("component"), value));
    } else if (elem.hasAttribute("dom-event")) {
      k(bender.init_get_dom_event(elem.getAttribute("dom-event"),
          elem.getAttribute("elem"), value));
    } else if (elem.hasAttribute("event")) {
      k(bender.init_get_event(elem.getAttribute("event"),
          elem.getAttribute("component"), value));
    } else {
      k();
    }
  };

  bender.Environment.deserialize.set = function (elem, k) {
    var value = elem.hasAttribute("value") ?
      "return " + elem.getAttribute("value") : elem.textContent;
    if (elem.hasAttribute("elem")) {
      if (elem.hasAttribute("attr")) {
        k(bender.init_set_dom_attribute(elem.getAttribute("ns"),
              elem.getAttribute("attr"), elem.getAttribute("elem"), value));
      } else {
        k(bender.init_set_dom_property(elem.getAttribute("property"),
            elem.getAttribute("elem"), value));
      }
    } else if (elem.hasAttribute("property")) {
      k(bender.init_set_property(elem.getAttribute("property"),
          elem.getAttribute("component"), value));
    } else if (elem.hasAttribute("event")) {
      k(bender.init_set_event(elem.getAttribute("event"),
          elem.getAttribute("component"), value));
    } else {
      k(bender.init_set(value));
    }
  };


  bender.Component = {};

  // Initialize an empty component
  bender.init_component = function () {
    var c = Object.create(bender.Component);
    var id = "";
    Object.defineProperty(c, "id", { enumerable: true,
      get: function () { return id; },
      set: function (new_id) {
        if (new_id !== id) {
          if (this.parent) {
            if (id) {
              delete this.parent.components[id];
            }
            if (new_id) {
              this.parent.components[new_id] = this;
            }
          }
          var prev_id = id;
          id = new_id;
          flexo.notify(this, "@id-change", { prev: prev_id });
        }
      }
    });
    c.links = [];
    c.views = {};
    c.own_properties = [];
    c.watches = [];
    return c;
  };

  bender.Component.append_child = function (ch) {
    if (ch) {
      if (flexo.instance_of(ch, bender.Link)) {
        this.links.push(ch);
      } else if (flexo.instance_of(ch, bender.Property)) {
        ch.component = this;
        this.own_properties.push(ch);
      } else if (flexo.instance_of(ch, bender.View)) {
        ch.component = this;
        this.views[ch.id] = ch;
      } else if (flexo.instance_of(ch, bender.Watch)) {
        ch.component = this;
        this.watches.push(ch);
      }
    }
  };

  function find_component_with_property(component, name) {
    if (component.own_properties.hasOwnProperty(name)) {
      return component;
    }
    if (component.prototype) {
      return find_component_with_property(component.prototype, name);
    }
  }

  function render_watches(queue) {
    var component = queue[0];
    for (var i = queue.length; i > 0; --i) {
      queue[i - 1].watches.forEach(function (watch) {
        watch.render(component);
      });
    }
  }

  function render_properties(queue) {
    var component = queue[0];
    for (var n = queue.length, i = 0; i < n; ++i) {
      var c = queue[i];
      if (!c.hasOwnProperty("properties")) {
        c.properties = {};
        c.own_properties.forEach(function (property) {
          property.render(component);
        });
      }
      c.own_properties.forEach(function (property) {
        if (!component.properties.hasOwnProperty(property.name)) {
          property.render_for_prototype(component);
        }
      });
    }
  }

  bender.Component.render = function (target, stack, k) {
    if (typeof stack === "function") {
      k = stack;
    } else if (this.id) {
      stack.component.components[this.id] = this;
    }
    stack = [];
    for (var queue = [], c = this; c; c = c.prototype) {
      queue.push(c);
    }
    var seq = flexo.seq();
    for (var i = queue.length; i > 0; --i) {
      var c = queue[i - 1];
      c.links.forEach(function (link) {
        seq.add(function (k_) {
          link.render(target, k_);
        });
      });
      var mode = c.views[""] ? c.views[""].stack : "top";
      if (mode === "replace") {
        stack = [c];
      } else if (mode === "top") {
        stack.push(c);
      } else {
        stack.unshift(c);
      }
    }
    this.components = { $self: this };
    stack.i = 0;
    stack.component = this;
    this.rendered = { $document: target.ownerDocument };
    for (var n = stack.length; stack.i < n && !stack[stack.i].views[""];
        ++stack.i);
    if (stack.i < n && stack[stack.i].views[""]) {
      seq.add(function (k_) {
        stack[stack.i++].views[""].render(target, stack, k_);
      });
    }
    seq.add(function () {
      render_watches(queue);
      flexo.notify(this, "@rendered");
      render_properties(queue);
      k();
    }.bind(this));
  };


  bender.Link = {};

  bender.Link.render = function (target, k) {
    if (this.rendered) {
      k();
    } else {
      this.rendered = true;
      var f = bender.Link.render[this.rel];
      if (typeof f === "function") {
        f.call(this, target, k);
      } else {
        console.warn("Cannot render “%0” link".fmt(this.rel));
        k();
      }
    }
  }

  bender.Link.render.script = function (target, k) {
    if (target.ownerDocument.documentElement.namspaceURI === flexo.ns.svg) {
      var script = flexo.$("svg:script", { "xlink:href": this.uri });
      script.addEventListener("load", k, false);
      target.ownerDocument.documentElement.appendChild(script);
    } else
      if (target.ownerDocument.documentElement.namespaceURI === flexo.ns.html) {
      var script = flexo.$script({ src: this.uri });
      script.addEventListener("load", k, false);
      target.ownerDocument.head.appendChild(script);
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
      k();
    }
  };

  bender.Link.render.stylesheet = function (target, k) {
    if (target.ownerDocument.documentElement.namespaceURI === flexo.ns.html) {
      target.ownerDocument.head.appendChild(flexo.$link({ rel: this.rel,
        href: this.uri }));
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
    }
    k();
  };

  // A runtime should overload this so that links can be handled accordingly.
  // TODO scoped stylesheets (render style links then)
  bender.init_link = function (uri, rel) {
    var r = (rel || "").trim().toLowerCase();
    if (r === "script" || r === "stylesheet") {
      var l = Object.create(bender.Link);
      l.uri = uri;
      l.rel = r;
      return l;
    }
  };


  bender.Property = {};

  function define_property(p) {
    console.log("= Render own property %0 on “%1”".fmt(p.name, p.component.id));
    Object.defineProperty(p.component.properties, p.name, {
      enumerable: true,
      get: function () { return p.value; },
      set: function (v) {
        delete p.__unset;
        p.value = v;
        console.log("= set %0 to %1 on %2".fmt(p.name, v, p.component.id));
        flexo.notify(p.component, "@set-property", { name: p.name, value: v });
      }
    });
  }

  bender.Property.render = function () {
    define_property(this);
    if (this.__value) {
      var v = this.__value.call(this.component);
      console.log("= set initial value %0=“%1”".fmt(this.name, v));
      this.component.properties[this.name] = v;
      // this.component.properties[this.name] = this.__value();
      delete this.__value;
    }
  };

  bender.Property.render_for_prototype = function (component) {
    var p = this;
    console.log("~ Render property %0 on “%1”".fmt(p.name, component.id));
    console.log("+ Listen to %0/@set-property for %1"
        .fmt(p.component.id, p.name));
    var listener = flexo.listen(p.component, "@set-property", function (e) {
      if (e.name === p.name) {
        flexo.notify(component, "@set-property", e);
      }
    });
    Object.defineProperty(component.properties, p.name, {
      enumerable: true,
      configurable: true,
      get: function () { return p.value; },
      set: function (v) {
        flexo.unlisten(p.component, "@set-property", listener);
        var p_ = Object.create(p);
        p_.component = component;
        define_property(p_);
        component.properties[p_.name] = v;
      }
    });
    if (!p.__unset) {
      listener({ name: p.name, value: p.value });
    }
  };

  bender.init_property = function (name, value) {
    var property = Object.create(bender.Property);
    property.name = name;
    property.__value = value;
    property.__unset = true;
    return property;
  };


  bender.View = {};

  bender.View.render = function (target, stack, k) {
    var seq = flexo.seq();
    this.children.forEach(function (ch) {
      seq.add(function (k_) {
        ch.render(target, stack, k_);
      });
    });
    seq.add(k);
  };

  bender.init_view = function (id, stack, children) {
    var s = (stack || "").trim().toLowerCase();
    var v = Object.create(bender.View);
    v.id = id || "";
    v.stack = s === "top" || s === "bottom" || s === "replace" ? s : "top";
    v.children = children || [];
    return v;
  };


  bender.Content = {};

  bender.Content.render = function (target, stack, k) {
    for (var i = stack.i, n = stack.length; i <n; ++i) {
      if (stack[i].views[this.id]) {
        var j = stack.i;
        stack.i = i;
        stack[i].views[this.id].render(target, stack, function () {
          stack.i = j;
          k();
        });
        return;
      }
    }
    bender.View.render.call(this, target, stack, k);
  };

  bender.init_content = function (id, children) {
    var c = Object.create(bender.Content);
    c.id = id || "";
    c.children = children || [];
    return c;
  };


  bender.Attribute = {};

  bender.Attribute.append_child = function (ch) {
    if (flexo.instance_of(ch, bender.Text)) {
      this.children.push(ch);
      ch.parent = this;
    } else if (flexo.instance_of(ch, bender.DOMTextNode)) {
      this.children.push(ch);
    }
  };

  bender.Attribute.remove_children = function () {
    this.children.forEach(function (ch) {
      if (flexo.instance_of(ch, bender.Text)) {
        delete ch.parent;
      }
    });
    this.children = [];
  };

  function set_attribute_value(target) {
    target.setAttributeNS(this.ns, this.name,
        this.children.reduce(function (acc, ch) { return acc + ch.text; }, ""));
  }

  bender.Attribute.render = function (target, stack, k) {
    var attr = this;
    if (this.id) {
      stack.component.rendered[this.id] = {};
      Object.defineProperty(stack.component.rendered[this.id], "textContent", {
        enumerable: true,
        set: function (t) {
          attr.remove_children();
          attr.append_child(bender.init_dom_text_node(t));
          set_attribute_value.call(attr, target);
        }
      });
    }
    this.children.forEach(function (ch) {
      if (flexo.instance_of(ch, bender.Text) && ch.id) {
        stack.component.rendered[ch.id] = {};
        Object.defineProperty(stack.component.rendered[ch.id], "textContent", {
          enumerable: true,
          set: function (t) {
            ch.text = t;
            set_attribute_value.call(attr, target);
          }
        });
      }
    });
    set_attribute_value.call(this, target);
    k();
  };

  bender.init_attribute = function (id, ns, name, children) {
    var a = Object.create(bender.Attribute);
    a.id = id || "";
    a.ns = ns || "";
    a.name = name;
    a.children = children || [];
    return a;
  };


  bender.Text = {};

  bender.Text.render = function (target, stack, k) {
    var e = target.appendChild(target.ownerDocument.createTextNode(this.text));
    if (this.id) {
      stack.component.rendered[this.id] = e;
    }
    k();
  };

  bender.init_text = function (id, text) {
    var t = Object.create(bender.Text);
    t.id = id || "";
    t.text = text || "";
    return t;
  };


  bender.Element = {};

  bender.Element.render = function (target, stack, k) {
    var e = target.appendChild(
      target.ownerDocument.createElementNS(this.nsuri, this.name)
    );
    for (var nsuri in this.attrs) {
      for (var attr in this.attrs[nsuri]) {
        if (nsuri === "" && attr === "id") {
          stack.component.rendered[this.attrs[""].id] = e;
        } else {
          e.setAttributeNS(nsuri, attr, this.attrs[nsuri][attr]);
        }
      }
    }
    var seq = flexo.seq();
    this.children.forEach(function (ch) {
      seq.add(function (k_) {
        ch.render(e, stack, k_);
      });
    });
    seq.add(k);
  };

  bender.init_element = function (nsuri, name, attrs, children) {
    var e = Object.create(bender.Element);
    e.nsuri = nsuri;
    e.name = name;
    e.attrs = attrs || {};
    e.children = children || [];
    return e;
  };


  bender.DOMTextNode = {};

  bender.DOMTextNode.render = function (target, stack, k) {
    var d = target.ownerDocument.createTextNode(this.text);
    target.appendChild(d);
    this.rendered.push(d);
    k();
  };

  bender.init_dom_text_node = function (text) {
    var t = Object.create(bender.DOMTextNode);
    Object.defineProperty(t, "text", { enumerable: true,
      get: function () {
        return text;
      },
      set: function (new_text) {
        new_text = new_text != null && new_text.toString() || "";
        if (new_text !== text) {
          text = new_text;
          this.rendered.forEach(function (d) {
            d.textContent = new_text;
          });
        }
      }
    });
    t.rendered = [];
    return t;
  };


  bender.Watch = {};

  bender.Watch.append_get = function (get) {
    this.gets.push(get);
    get.watch = this;
  };

  bender.Watch.append_set = function (set) {
    this.sets.push(set);
    set.watch = this;
  };

  bender.Watch.render = function (component) {
    if (component !== this.component) {
      var w = Object.create(this);
      w.component = component;
      w.gets = this.gets.map(function (get) {
        return get.render(w);
      });
      w.sets = this.sets.map(function (set) {
        var set = Object.create(set);
        set.watch = w;
        return set;
      });
      return w;
    } else {
      this.gets.forEach(function (get) {
        get.render(this);
      }, this);
    }
  };

  bender.init_watch = function (environment) {
    var w = Object.create(bender.Watch);
    w.environment = environment;
    w.gets = [];
    w.sets = [];
    return w;
  };


  // Watch inputs (three different kinds)
  bender.Get = {};
  bender.GetProperty = Object.create(bender.Get);
  bender.GetDOMEvent = Object.create(bender.Get);
  bender.GetEvent = Object.create(bender.Get);

  // Render the get element in the given watch, if it differs from its
  // prototypal parent
  function render_get(get, watch) {
    if (get.watch !== watch) {
      get = Object.create(get);
      get.watch = watch;
    }
    return get;
  }

  // Render a property input: listen for @set-property events from the source
  // component and activate the edge if it matches the property name. The input
  // value is the value of the property.
  bender.GetProperty.render = function (watch) {
    var get = render_get(this, watch);
    get.source_component = get.watch.component.components[get.source];
    if (typeof get.source_component === "object") {
      flexo.listen(get.source_component, "@set-property", function (e) {
        if (e.name === get.property) {
          get.watch.environment.activate(get,
            get.value.call(get.watch.component, e.source.properties[e.name]));
        }
      });
    } else {
      delete get.source_component;
      console.warn("No component for %0".fmt(get));
    }
    return get;
  };

  bender.GetProperty.toString = function () {
    return "get/property(%0, %1)".fmt(this.source, this.property);
  };

  // Render a DOM event input: listen for the event on the source element.
  bender.GetDOMEvent.render = function (watch) {
    var get = render_get(this, watch);
    var r = get.watch.component.rendered[get.source];
    if (r) {
      r.addEventListener(get.event, function (e) {
        get.watch.environment.activate(get,
          get.value.call(get.watch.component, e));
      }, false);
    } else {
      console.warn("No element for %0".fmt(get));
    }
    return get;
  };

  bender.GetDOMEvent.toString = function () {
    return "get/dom-event(%0, %1)".fmt(this.source, this.event);
  };

  // Render an event input: listen for the event on the source component
  bender.GetEvent.render = function (watch) {
    var get = render_get(this, watch);
    var c = get.watch.component.components[get.source];
    if (c) {
      flexo.listen(c, get.event, function (e) {
        get.watch.environment.activate(get,
          get.value.call(get.watch.component, e));
      });
    } else {
      console.warn("No component for %0".fmt(get));
    }
    return get;
  };

  bender.GetEvent.toString = function () {
    return "get/event(%0, %1)".fmt(this.source, this.event);
  };

  // Compile a function for the value of the input, or use the id function
  function init_get_value(name, value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function(name, value) : flexo.id;
  }

  bender.init_get_property = function (property, source, value) {
    var g = Object.create(bender.GetProperty);
    g.property = property;
    g.source = source || "$self";
    g.value = init_get_value("property", value);
    return g;
  };

  bender.init_get_dom_event = function (event, source, value) {
    var g = Object.create(bender.GetDOMEvent);
    g.event = event;
    g.source = source;
    g.value = init_get_value("event", value);
    return g;
  };

  bender.init_get_event = function (event, source, value) {
    var g = Object.create(bender.GetEvent);
    g.event = event;
    g.source = source || "$self";
    g.value = init_get_value("event", value);
    return g;
  };

  bender.Set = {};
  bender.SetProperty = Object.create(bender.Set);
  bender.SetEvent = Object.create(bender.Set);
  bender.SetDOMAttribute = Object.create(bender.Set);
  bender.SetDOMProperty = Object.create(bender.Set);

  // Just execute the value function
  bender.Set.activate = function (v) {
    this.value.call(this.watch.component, v);
  };

  bender.Set.toString = function () {
    return "set/sink";
  };

  // Set a property on a component
  bender.SetProperty.activate = function (v) {
    var c = this.watch.component.components[this.target];
    if (c) {
      c.properties[this.property] = this.value.call(this.watch.component, v);
    } else {
      console.warn("No component for %0".fmt(this));
    }
  };

  bender.SetProperty.toString = function () {
    return "set/property(%0, %1)".fmt(this.target, this.property);
  };

  // Send an event notification
  bender.SetEvent.activate = function (v) {
    var c = this.watch.component.components[this.target];
    if (c) {
      flexo.notify(c, this.event, this.value.call(this.watch.component, v));
    } else {
      console.warn("No component for %0".fmt(this));
    }
  };

  bender.SetProperty.toString = function () {
    return "set/property(%0, %1)".fmt(this.target, this.property);
  };

  // Set a DOM attribute on a rendered element
  bender.SetDOMAttribute.activate = function (v) {
    var r = this.watch.component.rendered[this.target];
    if (r) {
      r.setAttributeNS(this.ns, this.attr,
          this.value.call(this.watch.component, v));
    } else {
      console.warn("No element for %0".fmt(this));
    }
  };

  bender.SetDOMAttribute.toString = function () {
    return "set/dom-attribute(%0, {%1}%2)".fmt(this.target, this.ns, this.attr);
  };

  bender.SetDOMProperty.activate = function (v) {
    var r = this.watch.component.rendered[this.target];
    if (r) {
      r[this.property] = this.value.call(this.watch.component, v);
    } else {
      console.warn("No element for %0".fmt(this));
    }
  };

  bender.SetDOMProperty.toString = function () {
    return "set/dom-property(%0, %1)".fmt(this.target, this.property);
  };

  function init_set_value(value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function ("input", value) : flexo.id;
  }

  bender.init_set = function (value) {
    var s = Object.create(bender.Set);
    s.value = init_set_value(value);
    return s;
  };

  bender.init_set_property = function (property, target, value) {
    var s = Object.create(bender.SetProperty);
    s.property = property;
    s.target = target || "$self";
    s.value = init_set_value(value);
    return s;
  };

  bender.init_set_event = function (event, target, value) {
    var s = Object.create(bender.SetEvent);
    s.event = event;
    s.target = target || "$self";
    s.value = init_set_value(value);
    return s;
  };

  bender.init_set_dom_attribute = function (ns, attr, target, value) {
    var s = Object.create(bender.SetDOMAttribute);
    s.ns = ns;
    s.attr = attr;
    s.target = target;
    s.value = init_set_value(value);
    return s;
  };

  bender.init_set_dom_property = function (property, target, value) {
    var s = Object.create(bender.SetDOMProperty);
    s.property = property || "textContent";
    s.target = target;
    s.value = init_set_value(value);
    return s;
  };

}(this.bender = {}));
