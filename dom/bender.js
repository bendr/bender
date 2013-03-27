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
        if (!edge.watch.__activated) {
          edge.watch.__activated = true;
          push.apply(this.activation_queue, edge.watch.sets);
        }
      } else {
        // output edge: execute it from the activation values
        var vals = edge.watch.gets.map(function (g) {
          return g.__value;
        });
        edge.activate(vals.length < 2 ? vals[0] : vals);
      }
    }
    this.activation_queue.forEach(function (edge) {
      delete edge.__value;
      delete edge.watch.__activated;
    });
    this.activation_queue = [];
  }

  // Activate an edge in the watch graph; in a sort of breadth-first traversal.
  // Set the activation value on the edge as well; if it was already set, then
  // the edge was already activated once so do nothing except update the
  // activation value.
  bender.Environment.activate = function (edge, value) {
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

  // TODO delay evaluation of the value to *after* rendering!
  bender.Environment.deserialize.property = function (elem, k) {
    var value = elem.getAttribute("value");
    var as = (elem.getAttribute("as") || "").trim().toLowerCase();
    if (as === "boolean") {
      value = flexo.is_true(value);
    } else if (as === "dynamic") {
      value = eval(value);
    } else if (as === "json") {
      try {
        value = JSON.parse(value);
      } catch (e) {
      }
    } else if (as === "number") {
      value = parseFloat(value);
    }
    k(bender.init_property(elem.getAttribute("name"), value));
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
    c.properties = {};
    c.watches = [];
    return c;
  };

  bender.Component.append_child = function (ch) {
    if (ch) {
      if (flexo.instance_of(ch, bender.Link)) {
        this.links.push(ch);
      } else if (flexo.instance_of(ch, bender.Property)) {
        var component = this;
        Object.defineProperty(this.properties, ch.name, { enumerable: true,
          get: function () { return ch.value; },
          set: function (v) {
            ch.value = v;
            flexo.notify(component, "@set-property",
              { name: ch.name, value: v });
          }
        });
      } else if (flexo.instance_of(ch, bender.View)) {
        ch.component = this;
        this.views[ch.id] = ch;
      } else if (flexo.instance_of(ch, bender.Watch)) {
        ch.component = this;
        this.watches.push(ch);
      }
    }
  };

  bender.Component.get_property = function (name) {
    if (this.properties.hasOwnProperty(name)) {
      return this.properties[name];
    }
    if (this.prototype) {
      return this.prototype.get_property(name);
    }
  };

  function find_component_with_property(component, name) {
    if (component.properties.hasOwnProperty(name)) {
      return component;
    }
    if (component.prototype) {
      return find_component_with_property(component.prototype, name);
    }
  }

  bender.Component.set_property = function (name, value) {
    if (!this.properties.hasOwnProperty(name)) {
      var c = find_component_with_property(this, name);
      if (c) {
        var component = this;
        Object.defineProperty(this.properties, name, { enumerable: true,
          get: function () { return value; },
          set: function (v) {
            value = v;
            flexo.notify(component, "@set-property", { name: name, value: v });
          }
        });
      }
    }
    this.properties[name] = value;
  };

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
    for (var i = queue.length; i > 0; --i) {
      queue[i - 1].watches.forEach(function (watch) {
        seq.add(function (k_) {
          var w = watch.render(stack.component);
          if (w) {
            stack.component.watches.push(w);
          }
          k_();
        });
      });
    }
    for (var i = queue.length; i > 0; --i) {
      queue[i - 1].watches.forEach(function (watch) {
        seq.add(function (k_) {
          watch.init();
          k_();
        });
      });
    }
    seq.add(function () {
      flexo.notify(this, "@rendered");
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
      }
    }
  }

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

  bender.init_property = function (name, value) {
    var property = Object.create(bender.Property);
    property.name = name;
    property.value = value;
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

  function set_attribute_value(target) {
    target.setAttributeNS(this.ns, this.name,
        this.children.reduce(function (acc, ch) { return acc + ch.text; }, ""));
  }

  bender.Attribute.render = function (target, stack, k) {
    if (this.id) {
      stack.component.rendered[this.id] = {};
      Object.defineProperty(stack.component.rendered[this.id], "textContent", {
        enumerable: true,
        set: function (t) {
          this.remove_children();
        }
      });
    }
    var attr = this;
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

  bender.Watch.init = function () {
    this.gets.forEach(function (get) {
      get.activate();
    });
  };

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

  bender.Get.activate = function () {};

  bender.GetProperty.activate = function () {
    if (this.source_component) {
      this.watch.environment.activate(this,
          this.value.call(this.watch.component,
            this.source_component.get_property(this.property)));
    }
  };

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
            get.value.call(get.watch.component,
              e.source.get_property(e.name)));
        }
      });
    } else {
      delete get.source_component;
      console.warn("No component “%0” for get/property “%1”"
          .fmt(get.source, get.property));
    }
    return get;
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
      console.warn("No element “%0” for get/dom-event “%1”"
          .fmt(get.source, get.event));
    }
    return get;
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
      console.warn("No component “%0” for get/event “%1”"
          .fmt(get.source, get.event));
    }
    return get;
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

  // Set a property on a component
  bender.SetProperty.activate = function (v) {
    var c = this.watch.component.components[this.target];
    if (c) {
      c.set_property(this.property, this.value.call(this.watch.component, v));
    } else {
      console.warn("No component “%0” for set/property “%1”"
          .fmt(this.target, this.property));
    }
  };

  // Send an event notification
  bender.SetEvent.activate = function (v) {
    var c = this.watch.component.components[this.target];
    if (c) {
      flexo.notify(c, this.event, this.value.call(this.watch.component, v));
    } else {
      console.warn("No component “%0” for set/event “%1”"
          .fmt(this.target, this.event));
    }
  };

  // Set a DOM attribute on a rendered element
  bender.SetDOMAttribute.activate = function (v) {
    var r = this.watch.component.rendered[this.target];
    if (r) {
      r.setAttributeNS(this.ns, this.attr,
          this.value.call(this.watch.component, v));
    } else {
      console.warn("No element “%0” for set/dom-attribute “{%1}%2”"
          .fmt(this.target, this.ns, this.attr));
    }
  };

  bender.SetDOMProperty.activate = function (v) {
    var r = this.watch.component.rendered[this.target];
    if (r) {
      r[this.property] = this.value.call(this.watch.component, v);
    } else {
      console.warn("No element “%0” for set/dom-property “%1”"
          .fmt(this.target, this.property));
    }
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
