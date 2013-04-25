(function (bender) {
  "use strict";

  bender.VERSION = "0.8.1";

  var filter = Array.prototype.filter;
  var foreach = Array.prototype.forEach;
  var push = Array.prototype.push;

  // The Bender namespace for (de)serialization to XML
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


  // Environment in which components run and the watch graph is built.
  bender.Environment = {};

  // Create a new environment with no loaded component and an empty watch graph
  // (consisting only of a vortex), then start the graph scheduler.
  bender.environment = function (document) {
    var e = Object.create(bender.Environment);
    e.document = document;
    e.scope = { $document: document, $__ENV: this, $__SERIAL: SERIAL++ };
    console.log("New scope for environment #%0".fmt(e.scope.$__SERIAL));
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
    env = env || bender.environment(target.ownerDocument);
    var args = flexo.get_args(defaults || { href: "app.xml" });
    if (args.href) {
      var url = flexo.absolute_uri(window.document.baseURI, args.href);
      env.load_component(url, function (component) {
        if (flexo.instance_of(component, bender.Component)) {
          console.log("* component at %0 loaded OK".fmt(url));
          var defined = component.defined_properties;
          var props = Object.keys(args).filter(function (p) {
            return defined.hasOwnProperty(p);
          }).map(function (p) {
            var prop = defined[p];
            return bender.property(prop.name, prop.as, args[prop.name]);
          });
          if (props.length > 0) {
            var d = bender.component(env);
            d.prototype = component;
            props.forEach(function (p) {
              d.own_properties[p.name] = p;
              p.component = d;
            });
            component = d;
          }
          component.render(target);
          console.log("* component rendered OK", component);
          k(component);
        } else {
          k(component);
        }
      });
    } else {
      k();
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
          var urscope = Object.create(this.scope, {
            $__SRC: { enumerable: true, value: req.response },
            $__URL: { enumerable: true, value: url },
            $__SERIAL: { enumerable: true, configurable: true, value: SERIAL++ }
          });
          console.log("New scope #%0 for URL %1".fmt(urscope.$__SERIAL, url));
          // Root “component” to initialize the scope
          var root = { scope: Object.create(urscope) };
          this.deserialize(req.response.documentElement, root, function (d) {
            if (flexo.instance_of(d, bender.Component)) {
              this.loaded[url] = d;
            } else if (typeof d === "string") {
              this.loaded[url] = d;
            } else {
              this.loaded[url] = "could not get a Bender component at %0"
                .fmt(url);
            }
            if (typeof this.loaded[url] === "string") {
              k(this.loaded[url]);
            } else {
              ks.forEach(function (k_) {
                k_(this.loaded[url]);
              }, this);
            }
          }.bind(this));
        } else {
          this.loaded[url] = "Got error %0 while loading %1"
            .fmt(req.status, url);
          k(this.loaded[url]);
        }
      }.bind(this));
    } else if (Array.isArray(this.loaded[url])) {
      this.loaded[url].push(k);
    } else {
      k(this.loaded[url]);
    }
  };

  // Deserialize `node` in the environment, within `component`; upon completion,
  // call k with the created object (if any) or an error message
  bender.Environment.deserialize = function (node, component, k) {
    if (node instanceof window.Node) {
      if (node.nodeType === window.Node.ELEMENT_NODE) {
        if (node.namespaceURI === bender.ns) {
          var f = bender.Environment.deserialize[node.localName];
          if (typeof f === "function") {
            f.call(this, node, component, k);
          } else {
            k("Unknown Bender element “%0” in %1"
                .fmt(node.localName, node.baseURI))
          }
        } else {
          var suggestion =
            bender.Environment.deserialize.hasOwnProperty(node.localName) ?
            "reminder: Bender’s namespace is %0".fmt(bender.ns) :
            "a Bender element was expected";
          k("Unknown element “%0” in %1 (%2)"
              .fmt(node.localName, node.baseURI, suggestion));
        }
      } else {
        k();
      }
    } else {
      k("Expected an element at URL %0: probably not well-formed XML"
          .fmt(node && node.baseURI || "unknown"));
    }
  };

  // Set default values for properties of a component from the attributes of the
  // element being deserialized (which are different from href, id, and on-...)
  function set_property_defaults(elem, component) {
    var defined = component.defined_properties;
    filter.call(elem.attributes, function (a) {
      return defined.hasOwnProperty(a.localName) && a.namespaceURI === null &&
        a.localName !== "href" && a.localName !== "id" &&
      !/^on-/.test(a.localName)
    }).forEach(function (a) {
      var prop = defined[a.localName];
      var p = bender.property(prop.name, prop.as, a.value);
      component.own_properties[p.name] = p;
      p.component = component;
    });
  }

  // Deserialize a Bender component element
  bender.Environment.deserialize.component = function (elem, parent, k) {
    var init_component = function (env, prototype) {
      var component = bender.component(env, parent);
      component.id = elem.getAttribute("id");
      if (elem.hasAttribute("on-render")) {
        component.on.__render = elem.getAttribute("on-render");
      }
      if (prototype) {
        component.prototype = prototype;
      }
      set_property_defaults(elem, component);
      var seq = flexo.seq();
      foreach.call(elem.childNodes, function (ch) {
        seq.add(function (k_) {
          env.deserialize(ch, component, function (d) {
            if (typeof d === "string") {
              k(d);
            } else {
              component.append_child(d);
              k_();
            }
          });
        });
      });
      seq.add(function () {
        k(component);
      });
      seq.flush();
    };
    if (elem.hasAttribute("href")) {
      this.load_component(
        flexo.absolute_uri(elem.baseURI, elem.getAttribute("href")),
        function (d) {
          if (typeof d === "string") {
            k(d);
          } else {
            init_component(this, d);
          }
        }.bind(this)
      );
    } else {
      init_component(this);
    }
  };

  // Deserialize a Bender link element. The link is rendered immediately in the
  // environment’s document (which, in the case of a script, may require script
  // loading.)
  bender.Environment.deserialize.link = function (elem, component, k) {
    var uri = flexo.absolute_uri(elem.baseURI, elem.getAttribute("href"));
    var link = bender.link(uri, elem.getAttribute("rel"));
    if (!this.loaded[uri]) {
      this.loaded[uri] = link;
      link.render(this.document, k);
    } else {
      k(link);
    }
  };

  // Deserialize a Bender property element.
  bender.Environment.deserialize.property = function (elem, _, k) {
    var value = elem.getAttribute("value");
    k(bender.property(elem.getAttribute("name"), elem.getAttribute("as"),
          elem.getAttribute("value")));
  };

  // Deserialize a Bender view element.
  bender.Environment.deserialize.view = function (elem, component, k) {
    this.deserialize_view_content(elem, component, function (d) {
      k(typeof d === "string" ? d :
        bender.view(elem.getAttribute("id"), elem.getAttribute("stack"),
          d));
    });
  };

  // Deserialize view content, which is either Bender elements that can appear
  // within a view, foreign elements, or text.
  bender.Environment.deserialize_view_content = function (elem, component, k) {
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
                component, function (d) {
                  if (typeof d === "string") {
                    k(d);
                  } else {
                    children.push(d);
                    k_();
                  }
                });
            }.bind(this));
          } else {
            console.warn("Unexpected Bender element “%0” in view"
              .fmt(ch.localName));
          }
        } else {
          seq.add(function (k_) {
            this.deserialize_dom_element(ch, component, function(d) {
              if (typeof d === "string") {
                k(d);
              } else {
                children.push(d);
                k_();
              }
            });
          }.bind(this));
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        seq.add(function (k_) {
          children.push(bender.dom_text_node(ch.textContent));
          k_();
        });
      }
    }, this);
    seq.add(function () {
      k(children);
    });
    seq.flush();
  };

  // Deserialize a foreign element.
  bender.Environment.deserialize_dom_element = function (elem, component, k) {
    this.deserialize_view_content(elem, component, function (d) {
      if (typeof d === "string") {
        k(d);
      } else {
        var attrs = {};
        foreach.call(elem.attributes, function (attr) {
          var nsuri = attr.namespaceURI || "";
          if (!(nsuri in attrs)) {
            attrs[nsuri] = {};
          }
          attrs[nsuri][attr.localName] = attr.value;
        });
        k(bender.dom_element(elem.namespaceURI, elem.localName, attrs, d));
      }
    });
  };

  // Deserialize a Bender content element.
  bender.Environment.deserialize.content = function (elem, component, k) {
    this.deserialize_view_content(elem, component, function (d) {
      k(typeof d === "string" ? d :
        bender.content(elem.getAttribute("id"), d));
    });
  };

  // Deserialize a Bender attribute element.
  bender.Environment.deserialize.attribute = function (elem, component, k) {
    var attr = bender.attribute(elem.getAttribute("id"),
        elem.getAttribute("ns"), elem.getAttribute("name"));
    foreach.call(elem.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE &&
        ch.namespaceURI === bender.ns && ch.localName === "text") {
        bender.Environment.deserialize.text.call(this, ch, component,
          function (d) {
            attr.append_child(d);
          });
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        attr.append_child(bender.dom_text_node(ch.textContent));
      }
    }, this);
    k(attr);
  };

  // Deserialize a Bender text element.
  bender.Environment.deserialize.text = function (elem, component, k) {
    k(bender.text(elem.getAttribute("id"), elem.textContent));
  };

  // Deserialize a Bender watch element.
  bender.Environment.deserialize.watch = function (elem, component, k) {
    var watch = bender.watch();
    var error = false;
    foreach.call(elem.childNodes, function (ch) {
      this.deserialize(ch, component, function (d) {
        if (typeof d === "object") {
          if (flexo.instance_of(d, bender.Get)) {
            watch.append_get(d);
          } else if (flexo.instance_of(d, bender.Set)) {
            watch.append_set(d);
          }
        } else if (!error) {
          error = d;
        }
      });
    }, this);
    k(error || watch);
  };

  // Deserialize a Bender get element.
  bender.Environment.deserialize.get = function (elem, _, k) {
    var value = elem.hasAttribute("value") ?
      "return " + elem.getAttribute("value") : elem.textContent;
    if (elem.hasAttribute("property")) {
      k(bender.get_property(elem.getAttribute("property"),
          elem.getAttribute("component"), value));
    } else if (elem.hasAttribute("dom-event")) {
      var get = bender.get_dom_event(elem.getAttribute("dom-event"),
          elem.getAttribute("elem"), value);
      get.prevent_default = flexo.is_true(elem.getAttribute("prevent-default"));
      get.stop_propagation =
        flexo.is_true(elem.getAttribute("stop-propagation"));
      k(get);
    } else if (elem.hasAttribute("event")) {
      k(bender.get_event(elem.getAttribute("event"),
          elem.getAttribute("component"), value));
    } else {
      k();
    }
  };

  // Deserialize a Bender set element.
  bender.Environment.deserialize.set = function (elem, _, k) {
    var value = elem.hasAttribute("value") ?
      "return " + elem.getAttribute("value") : elem.textContent;
    if (elem.hasAttribute("elem")) {
      if (elem.hasAttribute("attr")) {
        k(bender.set_dom_attribute(elem.getAttribute("ns"),
              elem.getAttribute("attr"), elem.getAttribute("elem"), value));
      } else if (elem.hasAttribute("dom-event")) {
        k(bender.set_dom_event(elem.getAttribute("dom-event"),
              elem.getAttribute("dom-event"), value));
      } else {
        k(bender.set_dom_property(elem.getAttribute("property"),
            elem.getAttribute("elem"), value));
      }
    } else if (elem.hasAttribute("property")) {
      k(bender.set_property(elem.getAttribute("property"),
          elem.getAttribute("component"), value));
    } else if (elem.hasAttribute("event")) {
      k(bender.set_event(elem.getAttribute("event"),
          elem.getAttribute("component"), value));
    } else {
      k(bender.set(value));
    }
  };


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

  // Add id to scope for object x
  function add_id_to_scope(scope, id, x) {
    if (id) {
      if (!scope.hasOwnProperty(id)) {
        console.log("+++ id %0 in scope %1".fmt(id, scope.$__SERIAL));
        scope[id] = x;
        return id;
      }
      console.warn("Redefining id %0 in scope %1"
          .fmt(id, scope.$__URL || "()"));
    }
  }

  var SERIAL = 0;

  bender.Component = {};

  // Initialize an empty component
  bender.component = function (environment, parent) {
    var c = Object.create(bender.Component);
    c.serial = SERIAL++;
    c.scope = Object.create(environment.scope);
    c.scope.$__SERIAL = SERIAL++;
    console.log("New component #%0 with scope %1 (%2)"
        .fmt(c.serial, c.scope.$__SERIAL, parent && parent.scope.$__SERIAL));
    c.scope.$that = c;
    if (parent) {
      if (parent.hasOwnProperty("children")) {
        parent.children.push(c);
        c.parent = parent;
      }
    }
    flexo.make_property(c, "id", function (id) {
      if (id) {
        console.log("New id for component: %0#%1 [scope %2]"
          .fmt(id, this.serial, this.scope.$__SERIAL));
        return add_id_to_scope(Object.getPrototypeOf(this.scope), id, this) ||
          flexo.cancel();
      }
    }, "");
    flexo.make_readonly(c, "defined_properties", function () {
      var properties = {};
      for (var component = this; component; component = component.prototype) {
        for (var p in component.own_properties) {
          if (!properties.hasOwnProperty(p)) {
            properties[p] = component.own_properties[p];
          }
        }
      }
      return properties;
    });
    c.environment = environment;
    environment.components.push(c);
    c.children = [];
    c.links = [];
    c.views = {};
    c.own_properties = {};
    c.watches = [];
    c.on = {};
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

  // Render properties for the chain of components. Because scope is irrelevant
  // for properties, the prototype of components in the chain is used.
  function render_properties(chain) {
    chain.forEach(function (c) {
      var c_ = Object.getPrototypeOf(c);
      var properties = flexo.values(c_.own_properties);
      if (!c_.hasOwnProperty("properties")) {
        c_.properties = {};
        c_.property_vertices = {};
        properties.forEach(function (property) {
          property.render(c_);
        });
      }
      properties.forEach(function (property) {
        if (!c.scope.$this.properties.hasOwnProperty(property.name)) {
          property.render_for_prototype(c_, c.scope.$this);
        }
      });
    });
  }

  // Render the view of a component in a target following the chain of
  // prototypes (starting from the furthest ancestor.)
  function render_view(target, chain) {
    var stack = [];
    flexo.hcaErof(chain, function (c) {
      var mode = c.views[""] ? c.views[""].stack : "top";
      if (mode === "replace") {
        stack = [c];
      } else if (mode === "top") {
        stack.push(c);
      } else {
        stack.unshift(c);
      }
    });
    stack.i = 0;
    for (var n = stack.length; stack.i < n && !stack[stack.i].views[""];
        ++stack.i);
    if (stack.i < n && stack[stack.i].views[""]) {
      var component = stack[stack.i++];
      component.views[""].render(target, stack);
    }
  }

  // Render watches for components along the chain (starting from the furthest
  // ancestor.)
  function render_watches(chain) {
    flexo.hcaErof(chain, function (c) {
      c.watches.forEach(function (watch) {
        watch.render(c);
      });
    });
  }

  function init_properties(chain) {
    chain.forEach(function (c) {
      var c_ = Object.getPrototypeOf(c);
      flexo.values(c_.own_properties).forEach(function (p) {
        p.init(c_);
      });
    });
  }

  function on_render(chain) {
    chain.forEach(function (c) {
      if (c.on.hasOwnProperty("__render")) {
        try {
          c.on.render = eval(c.on.__render);
        } catch (e) {
          console.error("Eval error for on-render=\"%0\""
            .fmt(c.on.__render, e));
        }
        delete c.on.__render;
      }
    });
    var on = chain.filter(function (c) {
      return typeof c.on.render === "function";
    }).map(function (c) {
      return c.on.render;
    });
    for (var i = on.length - 1; i >= 0; --i) {
      on[i] = on[i].bind(c.scope.$this, on[i + 1] || flexo.id);
    }
    if (on.length > 0) {
      on[0]();
    }
  }

  // Render the component by building the prototype chain, creating light-weight
  // copies of prototypes (to keep track of concrete nodes) along the way
  bender.Component.render = function (target, stack) {
    for (var chain = [], c = this; c; c = c.prototype) {
      var scope_ = Object.getPrototypeOf(c.scope);
      var c_ = Object.create(c, {
        scope: { enumerable: true, value: Object.create(scope_) }
      });
      c_.scope.$__SERIAL = SERIAL++;
      console.log("New scope %0 from %1"
          .fmt(c_.scope.$__SERIAL, c.scope.$__SERIAL));
      chain.push(c_);
      c_.scope.$this = this;
      c_.scope.$target = target;
      delete c_.scope.$root;
    }
    render_properties(chain);
    render_view(target, chain);
    render_watches(chain);
    init_properties(chain);
    flexo.notify(this, "!rendered");
    on_render(chain);
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

  // Render script links for HTML and SVG documents; overload this function to
  // handle other types of document. Scripts are handled synchronously.
  bender.Link.render.script = function (target, k) {
    if (target.documentElement.namespaceURI === flexo.ns.svg) {
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

  // Render stylesheet links for HTML documents; overload this function to
  // handle other types of document. Stylesheets are handled asynchronously.
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
  bender.link = function (uri, rel) {
    var r = (rel || "").trim().toLowerCase();
    if (r === "script" || r === "stylesheet") {
      var l = Object.create(bender.Link);
      l.uri = uri;
      l.rel = r;
      return l;
    }
  };


  bender.Property = {};

  // Define the getter/setter for a component’s own property named `name` with
  // a previously created vertex.
  function define_property(component, name, vertex) {
    Object.defineProperty(component.properties, name, {
      enumerable: true,
      get: function () {
        return vertex.value;
      },
      set: function (v) {
        vertex.value = v;
        component.environment.schedule_visit(vertex, v);
      }
    });
  }

  // Render the property for its parent component; this is its *own* property
  bender.Property.render = function (current) {
    var vertex = init_vertex(bender.PropertyVertex, { parent: current,
      component: current, property: this.name });
    current.property_vertices[this.name] = vertex;
    current.environment.add_vertex(vertex);
    define_property(current, this.name, vertex);
  };

  // Render a “pending” property vertex; it returns the value of the protovertex
  // (i.e., the vertex for the property defined on the prototype) until it is
  // set; then the outgoing edges of the protovertex that were meant for this
  // vertex are redirected and the vertex becomes acutually used.
  bender.Property.render_for_prototype = function (prototype, component) {
    var property = this;
    var vertex = init_vertex(bender.PropertyVertex, { parent: component,
      component: component, property: this.name,
      protovertex: prototype.property_vertices[this.name] });
    component.property_vertices[this.name] = vertex;
    component.environment.add_vertex(vertex);
    Object.defineProperty(component.properties, this.name, {
      enumerable: true,
      configurable: true,
      get: function () {
        return vertex.protovertex.value;
      },
      set: function (v) {
        var edges = flexo.partition(vertex.protovertex.out_edges,
          function (edge) {
            return edge.__source === vertex;
          });
        edges[0].forEach(function (edge) {
          edge.source === vertex;
          delete edge.__source;
          vertex.out_edges.push(edge);
        });
        vertex.protovertex.out_edges = edges[1];
        delete vertex.protovertex;
        define_property(component, property.name, vertex);
        component.properties[property.name] = v;
      }
    });
  };

  bender.Property.init = function (current) {
    if (this.__value) {
      current.properties[this.name] = this.__value.call(current);
      delete this.__value;
    }
  };

  bender.property = function (name, as, value) {
    var property = Object.create(bender.Property);
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

  bender.view = function (id, stack, children) {
    var s = (stack || "").trim().toLowerCase();
    var v = Object.create(bender.View);
    v.id = id || "";
    v.stack = s === "top" || s === "bottom" || s === "replace" ? s : "top";
    v.children = children || [];
    return v;
  };


  bender.Content = {};

  bender.Content.render = function (target, stack) {
    for (var i = stack.i, n = stack.length; i < n; ++i) {
      if (stack[i].views[this.id]) {
        var j = stack.i;
        stack.i = i + 1;
        stack[i].views[this.id].render(target, stack);
        stack.i = j;
        return;
      }
    }
    bender.View.render.call(this, target, stack);
  };

  bender.content = function (id, children) {
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
    target.setAttributeNS(this.attr.ns, this.attr.name,
        this.children.map(function (ch) { return ch.text; }).join(""));
  }

  bender.Attribute.render = function (target, stack) {
    var scope = stack[stack.i - 1].scope;
    var rendered = { attr: this, component: scope.$this };
    rendered.children = this.children.map(function (ch) {
      if (flexo.instance_of(ch, bender.Text)) {
        var ch_ = { text: ch.text };
        add_id_to_scope(scope, ch.id, ch_);
        Object.defineProperty(ch_, "textContent", {
          enumerable: true,
          set: function (t) {
            ch_.text = t;
            set_attribute_value.call(rendered, target);
          }
        });
        return ch_;
      }
      return ch;
    });
    Object.defineProperty(rendered, "textContent", {
      enumerable: true,
      set: function (t) {
        rendered.children = [bender.dom_text_node(t)];
        set_attribute_value.call(rendered, target);
      }
    });
    add_id_to_scope(scope, this.id, rendered);
    set_attribute_value.call(rendered, target);
  };

  bender.attribute = function (id, ns, name, children) {
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
    add_id_to_scope(stack[stack.i - 1].scope, this.id, e);
  };

  bender.text = function (id, text) {
    var t = Object.create(bender.Text);
    t.id = id || "";
    t.text = text || "";
    return t;
  };


  bender.DOMElement = {};

  bender.DOMElement.render = function (target, stack) {
    var scope = stack[stack.i - 1].scope;
    var e = target.appendChild(target.ownerDocument.createElementNS(this.nsuri,
          this.name));
    for (var nsuri in this.attrs) {
      for (var attr in this.attrs[nsuri]) {
        if (nsuri === "" && attr === "id") {
          add_id_to_scope(scope, this.attrs[""].id, e);
        } else {
          e.setAttributeNS(nsuri, attr, this.attrs[nsuri][attr]);
        }
      }
    }
    this.children.forEach(function (ch) {
      ch.render(e, stack);
    });
    if (!scope.$root && target === scope.$target) {
      scope.$root = e;
    }
  };

  bender.dom_element = function (nsuri, name, attrs, children) {
    var e = Object.create(bender.DOMElement);
    e.nsuri = nsuri;
    e.name = name;
    e.attrs = attrs || {};
    e.children = children || [];
    return e;
  };


  bender.DOMTextNode = {};

  bender.DOMTextNode.render = function (target) {
    var d = target.ownerDocument.createTextNode(this.text);
    target.appendChild(d);
    this.rendered.push(d);
  };

  bender.dom_text_node = function (text) {
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
    var protocomponent = Object.getPrototypeOf(component);
    this.gets.forEach(function (get) {
      var v = get.render(component);
      if (v) {
        var w = component.environment.add_vertex(init_vertex(bender.Vertex));
        make_edge(bender.Edge, v, w, get.value, protocomponent);
        this.sets.forEach(function (set) {
          set.render(w, component);
        }, this);
      }
    }, this);
  };

  bender.watch = function () {
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

  // The vertex for a property was already rendered when the vertex was
  // rendered.
  bender.GetProperty.render = function (component) {
    var c = component.scope[this.source];
    if (c) {
      var vertex = c.property_vertices[this.property];
      if (vertex) {
        return vertex;
      }
      console.warn("No property “%0” on component %1 (%2) for get property"
          .fmt(this.property, this.source, c.id));
    } else {
      console.warn("No component “%0” for get property %1"
          .fmt(this.source, this.property));
    }
  };

  // A DOM Event input is rendered to a DOMEventVertex, or nothing if the source
  // element could not be found. An event listener is added to this element to
  // schedule a visit.
  bender.GetDOMEvent.render = function (component) {
    var elem = component.scope[this.source];
    if (elem) {
      var vertex = init_vertex(bender.DOMEventVertex, {
        parent: Object.getPrototypeOf(component),
        elem: elem, event: this.event
      });
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
    var c = component.scope[this.source];
    if (c) {
      var vertex = init_vertex(bender.EventVertex, {
        parent: Object.getPrototypeOf(component),
        component: c, event: this.event
      });
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
      new Function(name, "cancel", "that", value) : flexo.id;
  }

  bender.get_property = function (property, source, value) {
    var g = Object.create(bender.GetProperty);
    g.property = property;
    g.source = source || "$this";
    g.value = init_get_value("property", value);
    return g;
  };

  bender.get_dom_event = function (event, source, value) {
    var g = Object.create(bender.GetDOMEvent);
    g.event = event;
    g.source = source;
    g.value = init_get_value("event", value);
    return g;
  };

  bender.get_event = function (event, source, value) {
    var g = Object.create(bender.GetEvent);
    g.event = event;
    g.source = source || "$this";
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
  function make_edge(prototype, source, dest, value, component, that) {
    var edge = Object.create(prototype);
    if (source.protovertex) {
      set_edge_source(edge, source.protovertex);
      edge.__source = source;
    } else {
      set_edge_source(edge, source);
    }
    set_edge_dest(edge, dest);
    edge.value = value;
    edge.context = component;
    edge.that = that;
    return edge;
  }

  // Initialize the value property of a watch output by creating a new function
  // from a value string. The corresponding function has two inputs named
  // `input` (the input value, obtained from the watch input) and `cancel` (a
  // function that cancels the action if it is called with no parameter, or a
  // falsy value)
  function init_set_value(value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function ("input", "cancel", "that", value) : flexo.id;
  }

  // Render a sink output edge to a regular Edge going to the Vortex.
  bender.Set.render = function (source, component) {
    return make_edge(bender.Edge, source, component.environment.vortex,
        this.value, Object.getPrototypeOf(component), this.watch.component);
  };

  // A regular edge executes its input and output functions for the side effects
  // only.
  bender.Edge.visit = function (input) {
    var v = this.value.call(this.context, input, flexo.cancel, this.that);
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.Edge.toString = function () {
    return "(Edge) -> %0".fmt(this.dest);
  };

  // Set a property on a component
  bender.SetProperty.render = function (source, component) {
    var c = component.scope[this.target];
    if (c) {
      var dest = c.property_vertices[this.property];
      if (dest) {
        var edge = make_edge(bender.PropertyEdge, source, dest, this.value,
            Object.getPrototypeOf(component), this.watch.component);
        edge.property = this.property;
        edge.component = c;
        return edge;
      }
      console.warn("No property “%0” to set on component “%1”"
          .fmt(this.target, this.property));
    } else {
      console.warn("No component “%0” for set property %1"
          .fmt(this.target, this.property));
    }
  };

  // A PropertyEdge sets a property
  bender.PropertyEdge.visit = function (input) {
    var v = this.value.call(this.context, input, flexo.cancel, this.that);
    this.component.properties[this.property] = v;
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.PropertyEdge.toString = function () {
    return "(PropertyEdge) %0.%1 -> %2".fmt(this.component.id, this.property,
        this.dest);
  };

  bender.SetEvent.render = function (source, component) {
    var c = component.scope[this.target];
    if (c) {
      var dest = component.environment.add_vertex(
          init_vertex(bender.EventVertex, { component: c, event: this.event }));
      var edge = make_edge(bender.EventEdge, source, dest, this.value,
          Object.getPrototypeOf(component), this.watch.component);
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
    var v = this.value.call(this.context, input, flexo.cancel, this.that);
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
    var r = component.scope[this.target];
    if (r) {
      var edge = make_edge(bender.DOMAttributeEdge, source,
          component.environment.vortex, this.value,
          Object.getPrototypeOf(component), this.watch.component);
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
  // If the value is null, the attribute is not set but removed.
  bender.DOMAttributeEdge.visit = function (input) {
    var v = this.value.call(this.context, input, flexo.cancel, this.that);
    if (v === null) {
      this.target.removeAttributeNS(this.ns, this.attr);
    } else {
      this.target.setAttributeNS(this.ns, this.attr, v);
    }
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.DOMAttributeEdge.toString = function () {
    return "(DOMAttributeEdge) %0{%1}%2 -> %3".fmt(this.target.localName,
        this.ns, this.attr, this.dest);
  };

  // Set a DOM property: no further effect, so make an edge to the Vortex.
  bender.SetDOMProperty.render = function (source, component) {
    var r = component.scope[this.target];
    if (r) {
      var edge = make_edge(bender.DOMPropertyEdge, source,
          component.environment.vortex, this.value,
          Object.getPrototypeOf(component), this.watch.component);
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
    var v = this.value.call(this.context, input, flexo.cancel, this.that);
    this.target[this.property] = v;
    // console.log("  - %0 = %1".fmt(this, v));
    return v;
  };

  bender.DOMPropertyEdge.toString = function () {
    return "(DOMPropertyEdge) %0.%1 -> %2"
      .fmt(this.target.localName || "text()", this.property, this.dest);
  };


  bender.set = function (value) {
    var s = Object.create(bender.Set);
    s.value = init_set_value(value);
    return s;
  };

  bender.set_property = function (property, target, value) {
    var s = Object.create(bender.SetProperty);
    s.property = property;
    s.target = target || "$this";
    s.value = init_set_value(value);
    return s;
  };

  bender.set_event = function (event, target, value) {
    var s = Object.create(bender.SetEvent);
    s.event = event;
    s.target = target || "$this";
    s.value = init_set_value(value);
    return s;
  };

  bender.set_dom_event = function (event, target, value) {
    var s = Object.create(bender.SetDOMEvent);
    s.event = event;
    s.target = target;
    s.value = init_set_value(value);
    return s;
  };

  bender.set_dom_attribute = function (ns, attr, target, value) {
    var s = Object.create(bender.SetDOMAttribute);
    s.ns = ns;
    s.attr = attr;
    s.target = target;
    s.value = init_set_value(value);
    return s;
  };

  bender.set_dom_property = function (property, target, value) {
    var s = Object.create(bender.SetDOMProperty);
    s.property = property || "textContent";
    s.target = target;
    s.value = init_set_value(value);
    return s;
  };

}(this.bender = {}));
