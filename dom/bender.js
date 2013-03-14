(function (bender) {
  "use strict";

  var foreach = Array.prototype.forEach;

  bender.Environment = {};

  bender.init_environment = function () {
    var e = Object.create(bender.Environment);
    e.loaded = {};
    return e;
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

  bender.deserialize.component = function (elem) {
    var component = bender.init_component(elem.id);
    // TODO handle href -> require environment here
    foreach.call(elem.childNodes, function (ch) {
      var d = bender.deserialize(ch);
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
    });
    return component;
  };


  bender.Link = {};

  bender.init_link = function (uri, rel) {
    var r = rel.trim().toLowerCase();
    if (r === "script" || r === "stylesheet") {
      var l = Object.create(bender.Link);
      l.uri = uri;
      l.rel = r;
      return l;
    }
  };

  bender.deserialize.link = function (elem) {
    return bender.init_link(elem.getAttribute("href"),
        elem.getAttribute("rel"));
  };


  bender.Property = {};

  bender.init_property = function (name, value) {
    var property = Object.create(bender.Property);
    property.name = name;
    property.value = value;
    return property;
  };

  bender.deserialize.property = function (elem) {
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
    return bender.init_property(elem.getAttribute("name"), value);
  };


  bender.View = {};

  bender.init_view = function (id, stack, nodes) {
    var s = stack.trim().toLowerCase();
    var v = Object.create(bender.View);
    v.id = id || "";
    v.stack = s === "top" || s === "bottom" || s === "replace" ? s : "top";
    v.nodes = nodes || [];
    return v;
  };

  bender.deserialize.view = function (elem) {
    return bender.init_view(elem.id, elem.getAttribute("stack"),
        bender.deserialize_view_content(elem));
  };

  bender.deserialize_view_content = function (elem) {
    var nodes = [];
    foreach.call(elem.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE) {
        if (ch.namespaceURI === bender.ns) {
          if (ch.localName === "component" ||
            ch.localName === "content" ||
            ch.localName === "text") {
            nodes.push(bender.deserialize[ch.localName](ch));
          }
        } else {
          nodes.push(bender.deserialize_element(ch));
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        nodes.push(ch.textContent);
      }
    });
    return nodes;
  };


  bender.Content = {};

  bender.init_content = function (id, nodes) {
    var c = Object.create(bender.Content);
    c.id = id || "";
    c.nodes = nodes || [];
    return c;
  };

  bender.deserialize.content = function (elem) {
    return bender.init_content(elem.id, bender.deserialize_view_content(elem));
  };


  bender.Text = {};

  bender.init_text = function (id, text) {
    var t = Object.create(bender.Text);
    t.id = id || "";
    t.text = text || "";
    return t;
  };

  bender.deserialize_text = function (elem) {
    return bender.init_text(elem.id, elem.textContent);
  };


  bender.Element = {};

  bender.init_element = function (nsuri, name, attrs, children) {
    var e = Object.create(bender.Element);
    e.nsuri = nsuri;
    e.name = name;
    e.attrs = attrs || {};
    e.children = children || [];
    return e;
  };

  bender.deserialize_element = function (elem) {
    var attrs = {};
    foreach.call(elem.attributes, function (attr) {
      var nsuri = attr.namespaceURI || "";
      if (!(nsuri in attrs)) {
        attrs[nsuri] = {};
      }
      attrs[nsuri][attr.localName] = attr.value;
    });
    return bender.init_element(elem.namespaceURI, elem.localName, attrs,
        bender.deserialize_view_content(elem));
  };


  bender.Watch = {};

  bender.init_watch = function (gets, sets) {
    var w = Object.create(bender.Watch);
    w.gets = gets || [];
    w.sets = sets || [];
    return w;
  };

  bender.deserialize.watch = function (elem) {
    var gets = [];
    var sets = [];
    foreach.call(elem.childNodes, function (ch) {
      var d = bender.deserialize(ch);
      if (d) {
        if (flexo.instance_of(d, bender.Get)) {
          gets.push(d);
        } else if (flexo.instance_of(d, bender.Set)) {
          sets.push(d);
        }
      }
    });
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

  bender.deserialize.get = function (elem) {
    if (elem.hasAttribute("property")) {
      return bender.init_get_property(elem.getAttribute("property"),
          elem.getAttribute("component"), elem.getAttribute("value"));
    } else if (elem.hasAttribute("dom-event")) {
      return bender.init_get_dom_event(elem.getAttribute("dom-event"),
          elem.getAttribute("elem"), elem.getAttribute("value"));
    } else if (elem.hasAttribute("event")) {
      return bender.init_get_event(elem.getAttribute("event"),
          elem.getAttribute("component"), elem.getAttribute("value"));
    }
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

  bender.deserialize.set = function (elem) {
    if (elem.hasAttribute("elem")) {
      if (elem.hasAttribute("attr")) {
        return bender.init_set_dom_attribute(elem.getAttribute("attr"),
            elem.getAttribute("elem"), elem.getAttribute("value"));
      } else if (elem.hasAttribute("action")) {
        return bender.init_set_action(elem.getAttribute("action"),
            elem.getAttribute("elem"), elem.getAttribute("value"));
      } else if (elem.hasAttribute("insert")) {
        return bender.init_set_insert(elem.getAttribute("insert"),
            elem.getAttribute("elem"), elem.getAttribute("value"));
      } else {
        return bender.init_set_dom_property(elem.getAttribute("property"),
            elem.getAttribute("elem"), elem.getAttribute("value"));
      }
    } else if (elem.hasAttribute("property")) {
      return bender.init_set_property(elem.getAttribute("property"),
          elem.getAttribute("component"), elem.getAttribute("value"));
    } else if (elem.hasAttribute("event")) {
      return bender.init_set_event(elem.getAttribute("event"),
          elem.getAttribute("component"), elem.getAttribute("value"));
    }
  };


  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  bender.deserialize = function (node) {
    if (node.nodeType === window.Node.ELEMENT_NODE &&
        node.namespaceURI === bender.ns) {
      var f = bender.deserialize[node.localName];
      if (typeof f === "function") {
        return f(node);
      }
    }
  };

  bender.load_component = function (environment, href, k) {
    flexo.ez_xhr(href, { responseType: "document" }, function (req) {
      if (req.response) {
        var d = bender.deserialize(req.response.documentElement);
        if (d && flexo.instance_of(d, bender.Component)) {
          environment.loaded[href] = d;
          return k(d);
        }
      }
      k();
    });
  };

}(this.bender = {}));
