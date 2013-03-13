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

    });
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
