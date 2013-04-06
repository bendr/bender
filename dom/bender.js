(function (bender) {
  "use strict";

  var foreach = Array.prototype.forEach;
  var push = Array.prototype.push;

  // The Bender namespace for (de)serialization to XML
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


  // Environment in which components run and the watch graph is built.
  bender.Environment = {};

  // Create a new environment with no loaded component and an empty watch graph
  // (consisting only of a vortex), then start the graph scheduler.
  bender.init_environment = function (document) {
    var e = Object.create(bender.Environment);
    e.document = document;
    e.loaded = {};
    e.components = [];
    e.vertices = [];
    e.vortex = init_vertex(bender.Vortex);
    e.add_vertex(e.vortex);
    e.scheduled = [];
    e.traverse_graph = traverse_graph.bind(e);
    e.traverse_graph();
    return e;
  };

  // Load an application from a component to be rendered in the given target.
  // The defaults object contains default values for the properties of the
  // component, and should have a `href` property for the URL of the application
  // component. If no environent is given, a new one is created for the target
  // element document. When done or in case of error, call the continuation k.
  bender.load_app = function (target, defaults, env, k) {
    if (typeof env === "function") {
      k = env;
      env = undefined;
    }
    if (typeof k !== "function") {
      k = flexo.nop;
    }
    env = env || bender.init_environment(target.ownerDocument);
    var args = flexo.get_args(defaults || { href: "app.xml" });
    if (args.href) {
      var url = flexo.absolute_uri(window.document.baseURI, args.href);
      env.load_component(url, function (component) {
        if (flexo.instance_of(component, bender.Component)) {
          console.log("* component at %0 loaded OK".fmt(url));
          var props = Object.keys(component.own_properties)
            .filter(function (p) {
              return args.hasOwnProperty(p);
            }).map(function (p) {
              var prop = component.own_properties[p];
              return bender.init_property(prop.name, prop.as, args[prop.name]);
            });
          if (props.length > 0) {
            var d = bender.init_component(env);
            d.prototype = component;
            props.forEach(function (p) {
              d.own_properties[p.name] = p;
              p.component = d;
            });
            component = d;
          }
          var then = Date.now();
          component.render(target);
          console.log("* component rendered OK (%0)".fmt(Date.now() - then),
            component);
          return component;
        } else {
          return url;
        }
      });
    }
    return env;
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

  // This function gets passed to input and output value functions so that the
  // input or output can be cancelled. If called with no parameter or a single
  // parameter evaluating to a truthy value, throw a cancel exception;
  // otherwise, return false.
  function cancel(p) {
    if (p === undefined || !!p) {
      throw "cancel";
    }
    return false;
  }

  // Traverse the graph for all scheduled vertex/value pairs. The traversal is
  // breadth-first. If a vertex was already visited, check the old value with
  // the new value: when they are equal, just stop; otherwise, re-schedule the
  // vertex with the new value for traversal. Traversing an edge returns the
  // value for its destination vertex; when the edge wants to cancel the
  // traversal, it sends a "cancel" exception which stops the traversal at this
  // point. This function must be bound to an environment.
  function traverse_graph() {
    if (this.scheduled.length > 0) {
      // console.log("> start graph traversal");
      this.__schedule_next = [];
      var visited = [];
      for (var i = 0; i < this.scheduled.length; ++i) {
        var q = this.scheduled[i];
        var vertex = q[0];
        // console.log("* visit %0 (value: %1)".fmt(q[0], q[1]));
        if (vertex.hasOwnProperty("__value")) {
          if (vertex.__value !== q[1]) {
            this.schedule_visit(vertex, q[1]);
          }
        } else {
          vertex.__value = q[1];
          visited.push(vertex);
          vertex.out_edges.forEach(function (edge) {
            try {
              this.scheduled.push([edge.dest, edge.visit(q[1])]);
            } catch (e) {
              if (e !== "cancel") {
                throw e;
              }
            }
          }, this);
        }
      }
      // console.log("< finished graph traversal (visited: %0)"
      //     .fmt(visited.length));
      visited.forEach(function (v) {
        delete v.__value;
      });
      this.scheduled = this.__schedule_next;
      delete this.__schedule_next;
    }
    flexo.request_animation_frame(this.traverse_graph);
  }

  // Schedule a visit of the vertex for a given value. If the same vertex is
  // already scheduled, discard the old value.
  bender.Environment.schedule_visit = function (vertex, value) {
    var q = flexo.find_first(this.scheduled, function (q) {
      return q[0] === vertex;
    });
    if (q) {
      if (q[0].hasOwnProperty("__value")) {
        if (value !== q[0].__value) {
          this.__schedule_next.push([vertex, value]);
        }
      } else {
        q[1] = value;
      }
    } else {
      this.scheduled.push([vertex, value]);
    }
  };

  // Add a vertex to the watch graph and return it. If a matching vertex was
  // found, just return the previous vertex.
  bender.Environment.add_vertex = function (v) {
    var v_ = flexo.find_first(this.vertices, function (w) {
      return v.match(w);
    });
    if (v_) {
      return v_;
    }
    v.index = this.vertices.length;
    this.vertices.push(v);
    return v;
  };

  // Debugging: output the watch graph
  bender.Environment.dump_graph = function () {
    this.vertices.forEach(function (vertex) {
      console.log(vertex.toString());
      vertex.out_edges.forEach(function (edge) {
        console.log("  - %0".fmt(edge));
      });
    });
  };

  bender.Environment.clear = function () {
    this.scheduled = [];
  };

  bender.Environment.deserialize.component = function (elem, k) {
    var init_component = function (env, prototype) {
      var component = bender.init_component(env);
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
    var link = bender.init_link(uri, elem.getAttribute("rel"));
    if (!this.loaded[uri]) {
      this.loaded[uri] = link;
      link.render(this.document, k);
    } else {
      k(link);
    }
  };

  bender.Environment.deserialize.property = function (elem, k) {
    var value = elem.getAttribute("value");
    k(bender.init_property(elem.getAttribute("name"), elem.getAttribute("as"),
          elem.getAttribute("value")));
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
    var watch = bender.init_watch();
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
      var get = bender.init_get_dom_event(elem.getAttribute("dom-event"),
          elem.getAttribute("elem"), value);
      get.prevent_default = flexo.is_true(elem.getAttribute("prevent-default"));
      get.stop_propagation =
        flexo.is_true(elem.getAttribute("stop-propagation"));
      k(get);
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
      } else if (elem.hasAttribute("dom-event")) {
        k(bender.init_set_dom_event(elem.getAttribute("dom-event"),
              elem.getAttribute("dom-event"), value));
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
  bender.init_component = function (environment) {
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
    c.environment = environment;
    environment.components.push(c);
    c.links = [];
    c.views = {};
    c.own_properties = {};
    c.watches = [];
    return c;
  };

  bender.Component.append_child = function (ch) {
    if (ch) {
      if (flexo.instance_of(ch, bender.Link)) {
        this.links.push(ch);
      } else if (flexo.instance_of(ch, bender.Property)) {
        ch.component = this;
        this.own_properties[ch.name] = ch;
      } else if (flexo.instance_of(ch, bender.View)) {
        ch.component = this;
        this.views[ch.id] = ch;
      } else if (flexo.instance_of(ch, bender.Watch)) {
        ch.component = this;
        this.watches.push(ch);
      }
    }
  };

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
      var properties = flexo.values(c.own_properties);
      if (!c.hasOwnProperty("properties")) {
        c.properties = {};
        properties.forEach(function (property) {
          property.render(component);
        });
      }
      properties.forEach(function (property) {
        if (!component.properties.hasOwnProperty(property.name)) {
          property.render_for_prototype(component);
        }
      });
    }
  }

  bender.Component.render = function (target, stack) {
    if (stack && this.id) {
      stack.component.components[this.id] = this;
    }
    stack = [];
    for (var queue = [], c = this; c; c = c.prototype) {
      queue.push(c);
    }
    for (var i = queue.length; i > 0; --i) {
      var c = queue[i - 1];
      var mode = c.views[""] ? c.views[""].stack : "top";
      if (mode === "replace") {
        stack = [c];
      } else if (mode === "top") {
        stack.push(c);
      } else {
        stack.unshift(c);
      }
    }
    // TODO distinguish between $self/$prototype (or something else) for setters
    // $self sets the own property; $prototype sets the prototype property (and
    // thus all derived); $self remains the default
    this.components = { $self: this };
    stack.i = 0;
    stack.component = this;
    this.rendered = { $document: target.ownerDocument };
    for (var n = stack.length; stack.i < n && !stack[stack.i].views[""];
        ++stack.i);
    if (stack.i < n && stack[stack.i].views[""]) {
      stack[stack.i++].views[""].render(target, stack);
    }
    render_watches(queue);
    flexo.notify(this, "@rendered");
    render_properties(queue);
  };


  bender.Link = {};

  // Link rendering is called when deserializing the link; target is a document
  bender.Link.render = function (target, k) {
    var render = bender.Link.render[this.rel];
    if (typeof render === "function") {
      render.call(this, target, k);
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
      k(this);
    }
  }

  bender.Link.render.script = function (target, k) {
    if (target.documentElement.namspaceURI === flexo.ns.svg) {
      var script = flexo.$("svg:script", { "xlink:href": this.uri });
      script.addEventListener("load", k, false);
      target.documentElement.appendChild(script);
    } else
      if (target.documentElement.namespaceURI === flexo.ns.html) {
      var script = flexo.$script({ src: this.uri });
      script.addEventListener("load", k, false);
      target.head.appendChild(script);
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
      k(this);
    }
  };

  bender.Link.render.stylesheet = function (target, k) {
    if (target.documentElement.namespaceURI === flexo.ns.html) {
      target.head.appendChild(flexo.$link({ rel: this.rel,
        href: this.uri }));
    } else {
      console.warn("Cannot render “%0” link".fmt(this.rel));
    }
    k(this);
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

  // Define own property p
  function define_property(p) {
    Object.defineProperty(p.component.properties, p.name, {
      enumerable: true,
      get: function () { return p.value; },
      set: function (v) {
        delete p.__unset;
        p.value = v;
        p.vertices.forEach(function (vertex) {
          p.component.environment.schedule_visit(vertex, v);
        });
      }
    });
    p.__unset = true;
  }

  bender.Property.render = function () {
    define_property(this);
    if (this.__value) {
      this.component.properties[this.name] = this.__value.call(this.component);
      delete this.__value;
    }
  };

  bender.Property.render_for_prototype = function (component) {
    var p = this;
    Object.defineProperty(component.properties, p.name, {
      enumerable: true,
      configurable: true,
      get: function () { return p.value; },
      set: function (v) {
        var p_ = Object.create(p);
        var vertex = flexo.find_first(p.vertices, function (w) {
          return w.component === component;
        });
        if (vertex) {
          flexo.remove_from_array(p.vertices, vertex);
          p_.vertices = [vertex];
        } else {
          p_.vertices = [];
        }
        p_.component = component;
        define_property(p_);
        component.properties[p_.name] = v;
      }
    });
    if (!p.__unset) {
      p.vertices.forEach(function (vertex) {
        p.component.environment.schedule_visit(vertex, p.value);
      });
    }
  };

  bender.init_property = function (name, as, value) {
    var property = Object.create(bender.Property);
    property.vertices = [];
    property.as = (as || "").trim().toLowerCase();
    property.name = name;
    if (as === "boolean") {
      property.__value = function () {
        return flexo.is_true(value);
      };
    } else if (as === "number") {
      property.__value = function () {
        return parseFloat(value);
      };
    } else if (typeof value === "string") {
      if (as === "dynamic") {
        property.__value = new Function("return " + value);
      } else if (as === "json") {
        property.__value = function () {
          try {
            return JSON.parse(value);
          } catch (e) {
            console.log("Error parsing JSON string “%0”: %1".fmt(value, e));
          }
        };
      } else {
        property.__value = function () {
          return value;
        }
      }
    }
    return property;
  };


  bender.View = {};

  bender.View.render = function (target, stack) {
    this.children.forEach(function (ch) {
      ch.render(target, stack);
    });
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

  bender.Content.render = function (target, stack) {
    for (var i = stack.i, n = stack.length; i <n; ++i) {
      if (stack[i].views[this.id]) {
        var j = stack.i;
        stack.i = i;
        stack[i].views[this.id].render(target, stack);
        stack.i = j;
        return;
      }
    }
    bender.View.render.call(this, target, stack);
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
    target.setAttributeNS(this.ns, this.name, this.children.map(function (ch) {
      return ch.text;
    }).join(""));
  }

  bender.Attribute.render = function (target, stack) {
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

  bender.Text.render = function (target, stack) {
    var e = target.appendChild(target.ownerDocument.createTextNode(this.text));
    if (this.id) {
      stack.component.rendered[this.id] = e;
    }
  };

  bender.init_text = function (id, text) {
    var t = Object.create(bender.Text);
    t.id = id || "";
    t.text = text || "";
    return t;
  };


  bender.Element = {};

  bender.Element.render = function (target, stack) {
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
    this.children.forEach(function (ch) {
      ch.render(e, stack);
    });
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

  bender.DOMTextNode.render = function (target, stack) {
    var d = target.ownerDocument.createTextNode(this.text);
    target.appendChild(d);
    this.rendered.push(d);
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
    this.gets.forEach(function (get) {
      var v = get.render(component);
      var w = component.environment.add_vertex(init_vertex(bender.Vertex));
      make_edge(bender.Edge, v, w, get.value, component);
      this.sets.forEach(function (set) {
        set.render(w, component);
      }, this);
    }, this);
  };

  bender.init_watch = function () {
    var w = Object.create(bender.Watch);
    w.gets = [];
    w.sets = [];
    return w;
  };


  // Watch inputs (three different kinds)
  bender.Get = {};
  bender.GetProperty = Object.create(bender.Get);
  bender.GetDOMEvent = Object.create(bender.Get);
  bender.GetEvent = Object.create(bender.Get);

  // Corresponding vertex objects for the watch graph. The Vortex should be
  // unique in the graph and is a sink vertex with no outputs.
  bender.Vortex = {};
  bender.Vertex = Object.create(bender.Vortex);
  bender.PropertyVertex = Object.create(bender.Vertex);
  bender.DOMEventVertex = Object.create(bender.Vertex);
  bender.EventVertex = Object.create(bender.Vertex);

  // Initialize a vertex of the given prototype with the given arguments (e.g.
  // component/property for a property vertex, &c.)
  function init_vertex(prototype, args) {
    var v = Object.create(prototype);
    v.in_edges = [];
    v.out_edges = [];
    if (typeof args === "object") {
      for (var a in args) {
        v[a] = args[a];
      }
    }
    return v;
  }

  // Match functions to find equivalent vertices
  bender.Vortex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.Vortex;
  };

  bender.Vortex.toString = function () {
    return "v%0 [Vortex]".fmt(this.index);
  };

  bender.Vertex.match = function (v) {
    return false;
  };

  bender.Vertex.toString = function () {
    return "v%0 [Vertex]".fmt(this.index);
  };

  bender.PropertyVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.PropertyVertex &&
      v.component === this.component && v.property === this.property;
  };

  bender.PropertyVertex.toString = function () {
    return "v%0 [PropertyVertex] %1.%2%3".fmt(this.index, this.component.id,
        this.property, this.__value ? "=" + this.value : "");
  };

  bender.DOMEventVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.DOMEventVertex &&
      v.elem === this.elem && v.event === this.event;
  };

  bender.DOMEventVertex.toString = function () {
    return "v%0 [DOMEventVertex] %1!%2%3".fmt(this.index, this.elem.localName,
        this.event, this.__value ? "=" + this.value : "");
  };

  bender.EventVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.EventVertex &&
      v.component === this.component && v.event === this.event;
  };

  bender.EventVertex.toString = function () {
    return "v%0 [EventVertex] %1!%2%3".fmt(this.index, this.component.id,
        this.event, this.__value ? "=" + this.value : "");
  };

  // A property input is rendered to a PropertyVertex, or nothing if the source
  // component could not be found. The component keeps track of the vertex so
  // that it can be visited when the property is set.
  bender.GetProperty.render = function (component) {
    var c = component.components[this.source];
    if (c) {
      for (var k = c; k && !k.own_properties.hasOwnProperty(this.property);
          k = k.prototype);
      if (k) {
        var vertex = init_vertex(bender.PropertyVertex,
            { parent: component, component: c, property: this.property });
        var v = component.environment.add_vertex(vertex);
        if (v === vertex) {
          k.own_properties[this.property].vertices.push(vertex);
        }
        return v;
      } else {
        console.warn("No property “%0” on component %1 for get property"
            .fmt(this.property, this.source));
      }
    } else {
      console.warn("No component “%0” for get property %1"
          .fmt(this.source, this.property));
    }
  };

  // A DOM Event input is rendered to a DOMEventVertex, or nothing if the source
  // element could not be found. An event listener is added to this element to
  // schedule a visit.
  bender.GetDOMEvent.render = function (component) {
    var elem = component.rendered[this.source];
    if (elem) {
      var vertex = init_vertex(bender.DOMEventVertex, { parent: component,
        elem: elem, event: this.event });
      var v = component.environment.add_vertex(vertex);
      if (v === vertex) {
        elem.addEventListener(v.event, function (e) {
          if (this.prevent_default) {
            e.preventDefault();
          }
          if (this.stop_propagation) {
            e.stopPropagation();
          }
          component.environment.schedule_visit(v, e);
        }.bind(this), false);
      }
      return v;
    } else {
      console.warn("No component “%0” for get DOM event %1"
          .fmt(this.source, this.event));
    }
  };

  // An event input is rendered to an EventVertex, or nothing if the source
  // ocmponent could not be found. An event listener is added to this component
  // to schedule a visit.
  bender.GetEvent.render = function (component) {
    var c = component.components[this.source];
    if (c) {
      var vertex = init_vertex(bender.EventVertex, { parent: component,
        component: c, event: this.event });
      var v = component.environment.add_vertex(vertex);
      if (v === vertex) {
        flexo.listen(c, this.event, function (e) {
          component.environment.schedule_visit(v, e);
        });
      }
      return v;
    } else {
      console.warn("No component “%0” for get event %1"
          .fmt(this.source, this.event));
    }
  };

  // Initialize the value property of a watch input by creating a new function
  // from a value string. The corresponding function has two inputs named
  // name (`event` for event inputs, `property` for property inputs; the input
  // value, obtained from the watch input) and `cancel` (a function that cancels
  // the action if it is called with no parameter, or a falsy value)
  function init_get_value(name, value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function(name, "cancel", value) : flexo.id;
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


  // Set (watch output) and Edge
  bender.Set = {};
  bender.SetProperty = Object.create(bender.Set);
  bender.SetEvent = Object.create(bender.Set);
  bender.SetDOMEvent = Object.create(bender.Set);
  bender.SetDOMAttribute = Object.create(bender.Set);
  bender.SetDOMProperty = Object.create(bender.Set);

  bender.Edge = {};
  bender.PropertyEdge = Object.create(bender.Edge);
  bender.EventEdge = Object.create(bender.Edge);
  bender.DOMEventEdge = Object.create(bender.Edge);
  bender.DOMAttributeEdge = Object.create(bender.Edge);
  bender.DOMPropertyEdge = Object.create(bender.Edge);

  // Set the source of an edge and add it to the list of out edges for the
  // source vertex.
  function set_edge_source(edge, source) {
    source.out_edges.push(edge);
    edge.source = source;
  }

  // Set the destination of an edge and add it to the list of in edges for the
  // destination vertex.
  function set_edge_dest(edge, dest) {
    dest.in_edges.push(edge);
    edge.dest = dest;
  }

  // Create an edge of the given prototype between a source and a destination
  // vertex with a value for its label.
  // original inputs and outputs (for their value), the parent component, and
  // the destination vertex (defaults to Vortex; otherwise, the destination is
  // added to the watch graph.)
  function make_edge(prototype, source, dest, value, component) {
    var edge = Object.create(prototype);
    set_edge_source(edge, source);
    set_edge_dest(edge, dest);
    edge.value = value;
    edge.context = component;
    return edge;
  }

  // Initialize the value property of a watch output by creating a new function
  // from a value string. The corresponding function has two inputs named
  // `input` (the input value, obtained from the watch input) and `cancel` (a
  // function that cancels the action if it is called with no parameter, or a
  // falsy value)
  function init_set_value(value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function ("input", "cancel", value) : flexo.id;
  }

  // Render a sink output edge to a regular Edge going to the Vortex.
  bender.Set.render = function (source, component) {
    return make_edge(bender.Edge, source, component.environment.vortex,
        this.value, component);
  };

  // A regular edge executes its input and output functions for the side effects
  // only.
  bender.Edge.visit = function (input) {
    var v = this.value.call(this.context, input, cancel);
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.Edge.toString = function () {
    return "(Edge) -> %0".fmt(this.dest);
  };

  // Set a property on a component
  bender.SetProperty.render = function (source, component) {
    var c = component.components[this.target];
    if (c) {
      var dest = component.environment.add_vertex(
          init_vertex(bender.PropertyVertex,
            { component: c, property: this.property }));
      var edge = make_edge(bender.PropertyEdge, source, dest, this.value,
          component);
      edge.property = this.property;
      edge.component = c;
      return edge;
    } else {
      console.warn("No component “%0” for set property %1"
          .fmt(this.target, this.property));
    }
  };

  // A PropertyEdge sets a property
  bender.PropertyEdge.visit = function (input) {
    var v = this.value.call(this.context, input, cancel);
    this.component.properties[this.property] = v;
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.PropertyEdge.toString = function () {
    return "(PropertyEdge) %0.%1 -> %2".fmt(this.component.id, this.property,
        this.dest);
  };

  bender.SetEvent.render = function (source, component) {
    var c = component.components[this.target];
    if (c) {
      var dest = component.environment.add_vertex(
          init_vertex(bender.EventVertex, { component: c, event: this.event }));
      var edge = make_edge(bender.EventEdge, source, dest, this.value,
          component);
      edge.component = c;
      edge.event = this.event;
      return edge;
    } else {
      console.warn("No component “%0” for set event %1"
          .fmt(this.target, this.event));
    }
  };

  // An EventEdge sends an event notification
  bender.EventEdge.visit = function (input) {
    var v = this.value.call(this.context, input, cancel);
    flexo.notify(this.component, this.event, v);
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.EventEdge.toString = function () {
    return "(EventEdge) %0%1 -> %2".fmt(this.component.id, this.event,
        this.dest);
  };

  // Set a DOM attribute: no further effect, so make an edge to the Vortex.
  bender.SetDOMAttribute.render = function (source, component) {
    var r = component.rendered[this.target];
    if (r) {
      var edge = make_edge(bender.DOMAttributeEdge, source,
          component.environment.vortex, this.value, component);
      edge.target = r;
      edge.ns = this.ns;
      edge.attr = this.attr;
      return edge;
    } else {
      console.warn("No element “%0” for set DOM attribute {%1}%2"
          .fmt(this.target, this.ns, this.attr));
    }
  };

  // A DOMAttribute edge sets an attribute, has no other effect.
  bender.DOMAttributeEdge.visit = function (input) {
    var v = this.value.call(this.context, input, cancel);
    this.target.setAttributeNS(this.ns, this.attr, v);
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.DOMAttributeEdge.toString = function () {
    return "(DOMAttributeEdge) %0{%1}%2 -> %3".fmt(this.target.localName,
        this.ns, this.attr, this.dest);
  };

  // Set a DOM property: no further effect, so make an edge to the Vortex.
  bender.SetDOMProperty.render = function (source, component) {
    var r = component.rendered[this.target];
    if (r) {
      var edge = make_edge(bender.DOMPropertyEdge, source,
          component.environment.vortex, this.value, component);
      edge.target = r;
      edge.property = this.property;
      return edge;
    } else {
      console.warn("No element “%0” for set DOM property %1"
          .fmt(this.target, this.property));
    }
  };

  // A DOMAttribute edge sets a property, has no other effect.
  bender.DOMPropertyEdge.visit = function (input) {
    var v = this.value.call(this.context, input, cancel);
    this.target[this.property] = v;
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.DOMPropertyEdge.toString = function () {
    return "(DOMPropertyEdge) %0.%1 -> %2"
      .fmt(this.target.localName || "text()", this.property, this.dest);
  };


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

  bender.init_set_dom_event = function (event, target, value) {
    var s = Object.create(bender.SetDOMEvent);
    s.event = event;
    s.target = target;
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
