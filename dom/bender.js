(function (bender) {
  "use strict";

  bender.VERSION = "0.8.1";

  var __SERIAL = 0;  // Counter for serial numbers, should be removed in the end

  var filter = Array.prototype.filter;
  var foreach = Array.prototype.forEach;

  // The Bender namespace for (de)serialization to XML
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Set properties for the loaded component from the arguments. If properties
  // were set, return the new component with the set properties, otherwise the
  // original component unchanged.
  function set_properties_from_args(component, args) {
    var defined = component.all_properties;
    var props = Object.keys(args).filter(function (p) {
      return p !== "href" && p in defined;
    }).map(function (p) {
      return bender.property(p, defined[p].as, args[p]);
    });
    if (props.length > 0) {
      var c = bender.component(component.environment);
      c.prototype = component;
      props.forEach(function (prop) {
        c.own_properties[prop.name] = prop;
        prop.component = c;
      });
      return c;
    }
    return component;
  }

  // Load an application from a component to be rendered in the given target.
  // The defaults object contains default values for the properties of the
  // component, and should have a `href` property for the URL of the application
  // component; alternatively, a URL can be passed as a string (it then becomes
  // the `href` property of the defaults object.) If no environent is given, a
  // new one is created for the target element document. The environment is
  // returned immediately. When done or in case of error, call the continuation
  // k with either the created component, or an error message, or nothing if
  // there was nothing to load in the first place (e.g., no href argument.)
  bender.load_app = function (target, defaults, env, k) {
    if (typeof env == "function") {
      k = env;
      env = undefined;
    } else if (typeof k != "function") {
      k = flexo.nop;
    }
    target = target || window.document.body || window.document.documentElement;
    env = env || bender.environment(target.ownerDocument);
    var args = flexo.get_args(typeof defaults == "object" ? defaults :
        { href: defaults });
    if (args.href) {
      var url = flexo.absolute_uri(window.document.baseURI, args.href);
      env.load_component(url, function (component) {
        if (flexo.instance_of(component, bender.Component)) {
          component = set_properties_from_args(component, args);
          component.render(target);
        }
        k(component);
      });
    } else {
      k();
    }
    return env;
  };

  bender.Environment = {};

  // Create a new environment with its environment scope, no loaded component,
  // and an empty watch graph (consisting only of a vortex.) Then start the
  // graph scheduler.
  bender.environment = function (document) {
    var e = Object.create(bender.Environment);
    e.document = document;
    e.scope = { $document: document, $__ENV: this, $__SERIAL: __SERIAL++ };
    e.loaded = {};
    e.components = [];
    e.vertices = [];
    e.vortex = make_vertex(bender.Vortex);
    e.add_vertex(e.vortex);
    e.scheduled = [];
    (e.traverse_graph = traverse_graph.bind(e))();
    return e;
  };

  // Load a component at the given URL and call k with the loaded component (or
  // an error)
  bender.Environment.load_component = function (url, k) {
    if (!this.loaded.hasOwnProperty(url)) {
      this.loaded[url] = [k];
      flexo.ez_xhr(url, { responseType: "document" }, function (req) {
        var ks = this.loaded[url];
        if (req.response) {
          this.deserialize(req.response.documentElement, null, function (d) {
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
    var defined = component.all_properties;
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
      this.__schedule_next = [];
      var visited = [];
      for (var i = 0; i < this.scheduled.length; ++i) {
        var q = this.scheduled[i];
        var vertex = q[0];
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


  // Add id to scope for object x (actually, to the parent scope!)
  function add_id_to_scope(scope, id, x) {
    if (id) {
      scope = Object.getPrototypeOf(scope);
      if (!scope.hasOwnProperty(id)) {
        scope[id] = x;
        return id;
      }
      console.warn("Redefining id %0 in scope %1".fmt(id, scope.$__SERIAL));
    }
  }


  bender.Component = {};

  // Initialize an empty component with an initial scope
  bender.component = function (environment, parent) {
    var c = Object.create(bender.Component);
    c.$__SERIAL = __SERIAL++;
    if (parent) {
      parent.children.push(c);
      c.parent = parent;
    }
    flexo.make_readonly(c, "all_properties", function () {
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

  function render_property(property, component, prototype) {
    if (!component.properties.hasOwnProperty(property.name)) {
      property.render(component, prototype);
    }
  }

  // Render properties for the chain of components. The parallel chain of the
  // corresponding abstract components (each item in the chain is a rendering of
  // an abstract component) must be handled as well.
  function render_properties(chain) {
    chain.forEach(function (c, i) {
      c.properties = {};
      c.property_vertices = {};
      var c_ = Object.getPrototypeOf(c);
      if (!c_.properties) {
        c_.properties = {};
        c_.property_vertices = {};
      }
      for (var j = i; j >= 0; --j) {
        var d = chain[j];
        var d_ = Object.getPrototypeOf(d);
        for (var p in c_.own_properties) {
          render_property(c_.own_properties[p], d_, c_);
          render_property(c_.own_properties[p], d, c_);
        }
      }
    });
  };

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
    chain.forEach(function (c) {
      c.__watches = c.watches.slice();
      // Render dynamic bindings
      // TODO check bug in logo.xml where `palette && `sides || ... does not
      // work, but `sides || (`palette && ...) does
      flexo.values(c.own_properties).forEach(function (property) {
        if (property.hasOwnProperty("__bindings")) {
          var watch = bender.watch();
          watch.append_set(bender.set_property(property.name, chain[0],
              property.__bindings[""].value));
          Object.keys(property.__bindings).forEach(function (id) {
            if (id) {
              Object.keys(property.__bindings[id]).forEach(function (prop) {
                watch.append_get(bender.get_property(prop, id));
              });
            }
          });
          c.__watches.push(watch);
        }
      });
      // Render string bindings
      c.__bindings.forEach(function (bindings) {
        var watch = bender.watch();
        if (bindings[""].hasOwnProperty("attr")) {
          watch.append_set(bender.set_dom_attribute(bindings[""].ns,
              bindings[""].attr, bindings[""].target, bindings[""].value));
        } else {
          watch.append_set(bender.set_dom_property("textContent",
              bindings[""].target, bindings[""].value));
        }
        Object.keys(bindings).forEach(function (id) {
          if (id) {
            Object.keys(bindings[id]).forEach(function (prop) {
              watch.append_get(bender.get_property(prop, id));
            });
          }
        });
        c.__watches.push(watch);
      });
    });
    flexo.hcaErof(chain, function (c) {
      c.__watches.forEach(function (watch) {
        watch.render(c);
      });
      delete c.__watches;
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

  // TODO this is broken; must be fixed!
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
    var cs = chain.filter(function (c) {
      return typeof c.on.render === "function";
    });
    for (var i = cs.length - 1; i >= 0; --i) {
      cs[i] = cs[i].on.render.bind(cs[i].scope.$this, cs[i + 1] || flexo.id,
          cs[i].scope.$that.scope);
    }
    if (cs.length > 0) {
      cs[0]();
    }
  }

  // Render the component by building the prototype chain, creating light-weight
  // copies of prototypes (to keep track of concrete nodes) along the way. We
  // name those scopes as they mostly map element ids in XML to rendered
  // components.
  bender.Component.render = function (target, stack) {
    // console.log("Render component %0#%1".fmt(this.id, this.$__SERIAL));
    for (var chain = [], c = this; c; c = c.prototype) {
      var component_scope = c.parent ?
        Object.getPrototypeOf(c.parent.__scopes[c.parent.__scopes.length - 1]) :
        Object.create(c.environment.scope);
      var c_ = Object.create(c, {
        scope: { enumerable: true, value: Object.create(component_scope) },
        $__SERIAL: { enumerable: true, value: __SERIAL++ }
      });
      // console.log("  add %0#%1 (for %2#%3) to the chain".fmt(c_.id, c_.$__SERIAL, c.id, c.$__SERIAL));
      if (!c.__scopes) {
        c.__scopes = [];
      }
      c.__scopes.push(c_.scope);
      chain.push(c_);
      c_.scope.$this = chain[0];
      c_.scope.$that = c_;
      c_.scope.$component = c;
      c_.scope.$prototype = c.prototype;
      c_.scope.$target = target;
      c_.__bindings = [];
      add_id_to_scope(c_.scope, c.id, c.parent ? c_ : chain[0]);
    }
    render_properties(chain);
    render_view(target, chain);
    render_watches(chain);
    init_properties(chain);
    flexo.notify(chain[0], "!rendered");
    on_render(chain);
    chain.forEach(function (c) {
      c.__scopes.pop();
      if (c.__scopes.length === 0) {
        delete c.__scopes;
      }
    });
    return chain[0];
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
  };

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

  // Define the getter/setter for a component’s own property with a previously
  // created vertex. The name of the property is given by the `property`
  // property of the vertex.
  function define_own_property(component, vertex) {
    Object.defineProperty(component.properties, vertex.property, {
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

  // Render the property from the prototype to a component. If the prototype and
  // the component are the same, then this is the component’s own property.
  bender.Property.render = function (component, prototype) {
    var vertex = make_vertex(bender.PropertyVertex, { component: component,
      property: this.name });
    component.property_vertices[this.name] = vertex;
    component.environment.add_vertex(vertex);
    if (component === prototype) {
      define_own_property(component, vertex);
    } else {
      vertex.protovertex = prototype.property_vertices[this.name];
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
          define_own_property(component, vertex);
          component.properties[vertex.property] = v;
        }
      });
    }
  };

  bender.Property.init = function (component) {
    if (this.__value) {
      component.properties[this.name] = this.__value.call(component);
      delete this.__value;
    }
  };

  // Regular expressions to match property bindings
  var RX_ID =
    "(?:[$A-Z_a-z\x80-\uffff]|\\\\.)(?:[$0-9A-Z_a-z\x80-\uffff]|\\\\.)*";
  var RX_PAREN = "\\(((?:[^\\\\\\)]|\\\\.)*)\\)";
  var RX_HASH = "(?:#(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_TICK = "(?:`(?:(%0)|%1))".fmt(RX_ID, RX_PAREN);
  var RX_PROP = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_HASH, RX_TICK));
  var RX_PROP_G = new RegExp("(^|[^\\\\])%0?%1".fmt(RX_HASH, RX_TICK), "g");

  // Identify property bindings for a dynamic property value string. When there
  // are none, return the string unchanged; otherwise, return the dictionary of
  // bindings (indexed by id, then property). bindings[""] will be the new value
  // for the set element of the watch to create.
  function property_binding_dynamic(value) {
    var bindings = {};
    var r = function (_, b, id, id_p, prop, prop_p) {
      var i = (id || id_p || "$this").replace(/\\(.)/g, "$1");
      if (!bindings.hasOwnProperty(i)) {
        bindings[i] = {};
      }
      var p = (prop || prop_p).replace(/\\(.)/g, "$1");
      bindings[i][p] = true;
      return "%0scope[%1].properties[%2]"
        .fmt(b, flexo.quote(i), flexo.quote(p));
    };
    var v = value.replace(RX_PROP_G, r).replace(/\\(.)/g, "$1");
    if (Object.keys(bindings).length === 0) {
      return value;
    }
    bindings[""] = { value: "return " + v };
    return bindings;
  }

  // Indentify property bindings for a string property value string (e.g. from a
  // literal attribute or text node.)
  function property_binding_string(value) {
    var strings = [];
    var bindings = {};
    for (var remain = value, m; m = remain.match(RX_PROP);
        remain = m.input.substr(m.index + m[0].length)) {
      var q = m.input.substr(0, m.index) + m[1];
      if (q) {
        strings.push(flexo.quote(q));
      }
      var id = (m[2] || m[3] || "$this").replace(/\\(.)/g, "$1");
      if (!bindings.hasOwnProperty(id)) {
        bindings[id] = {};
      }
      var prop = (m[4] || m[5]).replace(/\\(.)/g, "$1");
      bindings[id][prop] = true;
      strings.push("flexo.safe_string(scope[%0].properties[%1])"
          .fmt(flexo.quote(id), flexo.quote(prop)));
    }
    if (Object.keys(bindings).length === 0) {
      return value;
    }
    if (remain) {
      strings.push(flexo.quote(remain));
    }
    bindings[""] = { value: "return " + strings.join("+") };
    return bindings;
  }

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
      if (as === "string") {
        var bindings = property_binding_string(value);
        if (typeof bindings === "string") {
          property.__value = flexo.funcify(value);
        } else {
          property.__bindings = bindings;
        }
      } else if (as === "json") {
        property.__value = function () {
          try {
            return JSON.parse(value);
          } catch (e) {
            console.error("Error parsing JSON string “%0”: %1".fmt(value, e));
          }
        };
      } else {
        var bindings = property_binding_dynamic(value);
        if (typeof bindings === "string") {
          property.__value = new Function("return " + value);
        } else {
          property.__bindings = bindings;
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
        } else if (nsuri !== flexo.ns.xmlns) {
          var bindings = property_binding_string(this.attrs[nsuri][attr]);
          if (typeof bindings === "string") {
            e.setAttributeNS(nsuri, attr, bindings);
          } else {
            bindings[""].target = e;
            bindings[""].ns = nsuri;
            bindings[""].attr = attr;
            stack[stack.i - 1].__bindings.push(bindings);
          }
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

  bender.DOMTextNode.render = function (target, stack) {
    var d = target.appendChild(target.ownerDocument.createTextNode(""));
    var bindings = property_binding_string(this.text);
    if (typeof bindings === "string") {
      d.textContent = bindings;
    } else {
      bindings[""].target = d;
      stack[stack.i - 1].__bindings.push(bindings);
    }
    this.rendered.push(d);
  };

  bender.dom_text_node = function (text) {
    var t = Object.create(bender.DOMTextNode);
    Object.defineProperty(t, "text", { enumerable: true,
      get: function () {
        return text;
      },
      set: function (new_text) {
        new_text = flexo.safe_string(new_text);
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
    var scope = component.scope;
    var context = scope.$this;
    this.gets.forEach(function (get) {
      var v = get.render(component);
      if (v) {
        var w = component.environment.add_vertex(make_vertex(bender.Vertex));
        make_edge(bender.Edge, v, w, get.value, context, scope);
        this.sets.forEach(function (set) {
          set.render(w, component, scope);
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

  // Make a vertex of the given prototype with the given arguments (e.g.,
  // component/property for a property vertex, &c.)
  function make_vertex(prototype, args) {
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
    return "Vortex".fmt(this.index);
  };

  bender.Vertex.match = function (v) {
    return false;
  };

  bender.Vertex.toString = function () {
    return "v%0".fmt(this.index);
  };

  bender.PropertyVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.PropertyVertex &&
      v.component === this.component && v.property === this.property;
  };

  bender.PropertyVertex.toString = function () {
    return "p%0 %1#%2.%3%4".fmt(this.index,
        this.component.id, this.component.$__SERIAL,
        this.property, this.__value ? "=" + this.value : "");
  };

  bender.DOMEventVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.DOMEventVertex &&
      v.elem === this.elem && v.event === this.event;
  };

  bender.DOMEventVertex.toString = function () {
    return "d%0 %1!%2%3".fmt(this.index, this.elem.localName,
        this.event, this.__value ? "=" + this.value : "");
  };

  bender.EventVertex.match = function (v) {
    return Object.getPrototypeOf(v) === bender.EventVertex &&
      v.component === this.component && v.event === this.event;
  };

  bender.EventVertex.toString = function () {
    return "e%0 %1!%2%3".fmt(this.index, this.component.$__SERIAL,
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
      var vertex = make_vertex(bender.DOMEventVertex, { elem: elem,
        event: this.event });
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
      var vertex = make_vertex(bender.EventVertex, { component: c,
        event: this.event });
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
      new Function(name, "cancel", "scope", value) : flexo.id;
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
  function make_edge(prototype, source, dest, value, context, scope) {
    var edge = Object.create(prototype);
    if (source.protovertex) {
      set_edge_source(edge, source.protovertex);
      edge.__source = source;
    } else {
      set_edge_source(edge, source);
    }
    set_edge_dest(edge, dest);
    edge.value = value;
    edge.context = context;
    edge.scope = scope;
    return edge;
  }

  // Initialize the value property of a watch output by creating a new function
  // from a value string. The corresponding function has two inputs named
  // `input` (the input value, obtained from the watch input) and `cancel` (a
  // function that cancels the action if it is called with no parameter, or a
  // falsy value)
  function init_set_value(value) {
    return typeof value === "string" && /\S/.test(value) ?
      new Function("input", "cancel", "scope", value) : flexo.id;
  }

  // Render a sink output edge to a regular Edge going to the Vortex.
  bender.Set.render = function (source, component, scope) {
    return make_edge(bender.Edge, source, component.environment.vortex,
        this.value, component.scope.$this, scope);
  };

  // A regular edge executes its input and output functions for the side effects
  // only.
  bender.Edge.visit = function (input) {
    var v = this.value.call(this.context, input, flexo.cancel,
        this.scope.$that.scope);
    return v;
  };

  bender.Edge.toString = function () {
    return "-> %0".fmt(this.dest);
  };

  // Set a property on a component
  bender.SetProperty.render = function (source, component, scope) {
    var c = typeof this.target === "string" ? component.scope[this.target] :
      this.target;
    if (c) {
      var dest = c.property_vertices[this.property];
      if (dest) {
        var edge = make_edge(bender.PropertyEdge, source, dest, this.value,
            component.scope.$this, scope);
        edge.property = this.property;
        edge.component = c;
        return edge;
      }
      console.warn("No property “%0” to set on component “%1”"
          .fmt(this.property, this.target));
    } else {
      console.warn("No component “%0” for set property %1"
          .fmt(this.target, this.property));
    }
  };

  // A PropertyEdge sets a property
  bender.PropertyEdge.visit = function (input) {
    var v = this.value.call(this.context, input, flexo.cancel,
        this.scope.$that.scope);
    this.component.properties[this.property] = v;
    return v;
  };

  bender.PropertyEdge.toString = function () {
    return "(Property) %0#%1.%2 -> %3"
      .fmt(this.component.id, this.component.$__SERIAL, this.property,
          this.dest);
  };

  bender.SetEvent.render = function (source, component, scope) {
    var c = component.scope[this.target];
    if (c) {
      var dest = component.environment.add_vertex(
          make_vertex(bender.EventVertex, { component: c, event: this.event }));
      var edge = make_edge(bender.EventEdge, source, dest, this.value,
          component.scope.$this, scope);
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
    var v = this.value.call(this.context, input, flexo.cancel,
        this.scope.$that.scope);
    flexo.notify(this.component, this.event, v);
    return v;
  };

  bender.EventEdge.toString = function () {
    return "(Event) %0#%1%2 -> %2".fmt(this.component.id,
        this.component.$__SERIAL, this.event, this.dest);
  };

  // Set a DOM attribute: no further effect, so make an edge to the Vortex.
  bender.SetDOMAttribute.render = function (source, component, scope) {
    var r = typeof this.target === "string" ? component.scope[this.target] :
      this.target;
    if (r) {
      var edge = make_edge(bender.DOMAttributeEdge, source,
          component.environment.vortex, this.value, component.scope.$this,
          scope);
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
    var v = this.value.call(this.context, input, flexo.cancel,
        this.scope.$that.scope);
    if (v === null) {
      this.target.removeAttributeNS(this.ns, this.attr);
    } else {
      this.target.setAttributeNS(this.ns, this.attr, v);
    }
    return v;
  };

  bender.DOMAttributeEdge.toString = function () {
    return "(Attribute) %0{%1}%2 -> %3".fmt(this.target.localName,
        this.ns, this.attr, this.dest);
  };

  // Set a DOM property: no further effect, so make an edge to the Vortex.
  bender.SetDOMProperty.render = function (source, component, scope) {
    var r = typeof this.target === "string" ? component.scope[this.target] :
      this.target;
    if (r) {
      var edge = make_edge(bender.DOMPropertyEdge, source,
          component.environment.vortex, this.value, component.scope.$this,
          scope);
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
    var v = this.value.call(this.context, input, flexo.cancel,
        this.scope.$that.scope);
    this.target[this.property] = v;
    return v;
  };

  bender.DOMPropertyEdge.toString = function () {
    return "(DOMProperty) %0.%1 -> %2"
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
