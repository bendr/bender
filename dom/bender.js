(function (bender) {
  "use strict";

  var foreach = Array.prototype.forEach;
  var push = Array.prototype.push;

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.Environment = {};

  bender.init_environment = function () {
    var e = Object.create(bender.Environment);
    e.loaded = {};
    return e;
  };

  // Render `component` in the target element
  bender.Environment.render_component = function (component, target) {
    component.render(target);
  };

  // Load a component at the given URL and call k with the loaded component (or
  // an error object [TODO])
  // TODO load components only once
  bender.Environment.load_component = function (url, k) {
    flexo.ez_xhr(url, { responseType: "document" }, function (req) {
      if (req.response) {
        this.deserialize(req.response.documentElement, function (d) {
          if (d && flexo.instance_of(d, bender.Component)) {
            this.loaded[url] = d;
            k(d);
          } else {
            k();
          }
        }.bind(this));
      } else {
        k();
      }
    }.bind(this));
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
      var component = bender.init_component(elem.id, prototype);
      var seq = flexo.seq();
      foreach.call(elem.childNodes, function (ch) {
        seq.add(function (k_) {
          env.deserialize(ch, function (d) {
            if (d) {
              if (flexo.instance_of(d, bender.Link)) {
                component.links.push(d);
              } else if (flexo.instance_of(d, bender.Property)) {
                component.properties[d.name] = d.value;
              } else if (flexo.instance_of(d, bender.View)) {
                component.views[d.id] = d;
              } else if (flexo.instance_of(d, bender.Watch)) {
                component.watches.push(d);
              }
            }
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
    k(bender.init_link(elem.getAttribute("href"), elem.getAttribute("rel")));
  };

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
      k(bender.init_view(elem.id, elem.getAttribute("stack"), d));
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
            ch.localName === "text") {
            seq.add(function (k_) {
              bender.Environment.deserialize[ch.localName].call(this, ch,
                function (d) {
                  children.push(d);
                  k_();
                });
            }.bind(this));
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
      k(bender.init_content(elem.id, d));
    });
  };

  bender.Environment.deserialize.text = function (elem, k) {
    k(bender.init_text(elem.id, elem.textContent));
  };

  bender.Environment.deserialize.watch = function (elem, k) {
    var gets = [];
    var sets = [];
    var seq = flexo.seq();
    foreach.call(elem.childNodes, function (ch) {
      seq.add(function (k_) {
        this.deserialize(ch, function (d) {
          if (d) {
            if (flexo.instance_of(d, bender.Get)) {
              gets.push(d);
            } else if (flexo.instance_of(d, bender.Set)) {
              sets.push(d);
            }
          }
          k_();
        });
      }.bind(this));
    }, this);
    seq.add(function () {
      k(bender.init_watch(gets, sets));
    });
  };

  bender.Environment.deserialize.get = function (elem, k) {
    if (elem.hasAttribute("property")) {
      k(bender.init_get_property(elem.getAttribute("property"),
          elem.getAttribute("component"), elem.getAttribute("value")));
    } else if (elem.hasAttribute("dom-event")) {
      k(bender.init_get_dom_event(elem.getAttribute("dom-event"),
          elem.getAttribute("elem"), elem.getAttribute("value")));
    } else if (elem.hasAttribute("event")) {
      k(bender.init_get_event(elem.getAttribute("event"),
          elem.getAttribute("component"), elem.getAttribute("value")));
    }
  };

  bender.Environment.deserialize.set = function (elem, k) {
    if (elem.hasAttribute("elem")) {
      if (elem.hasAttribute("attr")) {
        k(bender.init_set_dom_attribute(elem.getAttribute("attr"),
            elem.getAttribute("elem"), elem.getAttribute("value")));
      } else if (elem.hasAttribute("action")) {
        k(bender.init_set_action(elem.getAttribute("action"),
            elem.getAttribute("elem"), elem.getAttribute("value")));
      } else if (elem.hasAttribute("insert")) {
        k(bender.init_set_insert(elem.getAttribute("insert"),
            elem.getAttribute("elem"), elem.getAttribute("value")));
      } else {
        k(bender.init_set_dom_property(elem.getAttribute("property"),
            elem.getAttribute("elem"), elem.getAttribute("value")));
      }
    } else if (elem.hasAttribute("property")) {
      k(bender.init_set_property(elem.getAttribute("property"),
          elem.getAttribute("component"), elem.getAttribute("value")));
    } else if (elem.hasAttribute("event")) {
      k(bender.init_set_event(elem.getAttribute("event"),
          elem.getAttribute("component"), elem.getAttribute("value")));
    }
  };


  bender.Component = {};

  bender.init_component = function (id, proto, links, views, props, watches) {
    var c = Object.create(bender.Component);
    c.id = id || "";
    c.prototype = proto;
    c.links = links || [];
    c.views = views || {};
    c.properties = props || {};
    c.watches = watches || [];
    return c;
  };

  bender.Component.render = function (target) {
    for (var stack = [], c = this; c; c = c.prototype) {
      stack.push(c);
    }
    stack.direction = -1;
    for (var i = 0, n = stack.length; i < n; ++i) {
      if (stack[i].views[""]) {
        stack.i = i;
        if (stack[i].views[""] === "bottom") {
          stack.direction = 1;
          break;
        }
      }
    }
    if (stack.i >= 0) {
      stack[stack.i].views[""].render(target, stack);
    }
  };


  bender.Link = {};

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
    for (var i = stack.i + stack.direction, n = stack.length; i >= 0 && i < n;
        i += stack.direction) {
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


  bender.Text = {};

  // TODO handle id
  bender.Text.render = function (target) {
    target.appendChild(target.ownerDocument.createTextNode(this.text));
  };

  bender.init_text = function (id, text) {
    var t = Object.create(bender.Text);
    t.id = id || "";
    t.text = text || "";
    return t;
  };


  bender.Element = {};

  // TODO handle id
  bender.Element.render = function (target, stack) {
    var e = target.appendChild(
      target.ownerDocument.createElementNS(this.nsuri, this.name)
    );
    for (var nsuri in this.attrs) {
      for (var attr in this.attrs[nsuri]) {
        e.setAttributeNS(nsuri, attr, this.attrs[nsuri][attr]);
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

  bender.DOMTextNode.render = function (target) {
    target.appendChild(target.ownerDocument.createTextNode(this.text));
  };

  bender.init_dom_text_node = function (text) {
    var t = Object.create(bender.DOMTextNode);
    t.text = text;
    return t;
  };


  bender.Watch = {};

  bender.init_watch = function (gets, sets) {
    var w = Object.create(bender.Watch);
    w.gets = gets || [];
    w.sets = sets || [];
    return w;
  };

  bender.Get = {};
  bender.GetProperty = Object.create(bender.Get);
  bender.GetDOMEvent = Object.create(bender.Get);
  bender.GetEvent = Object.create(bender.Get);

  bender.init_get_property = function (property, source, value) {
    var g = Object.create(bender.GetProperty);
    g.property = property;
    g.source = source || "$self";
    g.value = value;
    return g;
  };

  bender.init_get_dom_event = function (event, source, value) {
    var g = Object.create(bender.GetDOMEvent);
    g.event = event;
    g.source = source;
    g.value = value;
    return g;
  };

  bender.init_get_event = function (event, source, value) {
    var g = Object.create(bender.GetEvent);
    g.event = event;
    g.source = source || "$self";
    g.value = value;
    return g;
  };

  bender.Set = {};
  bender.SetProperty = Object.create(bender.Set);
  bender.SetEvent = Object.create(bender.Set);
  bender.SetDOMAttribute = Object.create(bender.Set);
  bender.SetDOMProperty = Object.create(bender.Set);
  bender.SetAction = Object.create(bender.Set);
  bender.SetInsert = Object.create(bender.Set);

  bender.init_set_property = function (property, target, value) {
    var s = Object.create(bender.SetProperty);
    s.property = property;
    s.target = target || "$self";
    s.value = value;
    return s;
  };

  bender.init_set_event = function (event, target, value) {
    var s = Object.create(bender.SetEvent);
    s.event = event;
    s.target = target || "$self";
    s.value = value;
    return s;
  };

  bender.init_set_dom_attribute = function (attr, target, value) {
    var s = Object.create(bender.SetDOMAttribute);
    s.attr = attr;
    s.target = target;
    s.value = value;
    return s;
  };

  bender.init_set_dom_property = function (property, target, value) {
    var s = Object.create(bender.SetDOMProperty);
    s.property = property || "textContent";
    s.target = target;
    s.value = value;
    return s;
  };

  bender.init_set_action = function (action, target, value) {
    var a = (action || "").trim().toLowerCase();
    if (a === "append" || a === "prepend" || a === "remove") {
      var s = Object.create(bender.SetAction);
      s.action = a;
      s.target = target;
      s.value = value;
      return s;
    }
  };

  bender.init_set_insert = function (insert, target, value) {
    var i = (insert || "").trim().toLowerCase();
    if (i === "before" || i === "after" || i === "replace") {
      var s = Object.create(bender.SetInsert);
      s.insert = i;
      s.target = target;
      s.value = value;
      return s;
    }
  };


}(this.bender = {}));
