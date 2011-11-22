// Bender core library
if (typeof require === "function") flexo = require("./flexo.js");

(function(bender)
{
  bender.VERSION = "0.3.0";

  // Bender's namespaces
  bender.NS = "http://bender.igel.co.jp";
  bender.NS_B = bender.NS + "/b";
  bender.NS_E = bender.NS + "/e";
  bender.NS_F = bender.NS + "/f";


  var did_create_node =
  {
    app: function(node, context) { did_create_node.component(node, context); },

    component: function(node, context)
    {
      var ref = node.getAttribute("ref");
      if (node.getAttribute("ref")) return;
      var href = node.getAttribute("href");
      if (href) {
        // TODO make sure that the component is loaded
      } else {
        node._is_definition = true;
        node._component = context.create_component(node);
      }
    }
  };

  var did_add_child =
  {
    view: function(node)
    {
      if (is_bender_node(node.parentNode, "component") ||
          is_bender_node(node.parentNode, "app")) {
        node.parentNode._component.view = node;
        flexo.log("*** Set view for {0}".fmt(node.parentNode._component.hash),
            node.parentNode._component.view);
      }
    }
  };

  // Context in which components are created and run
  bender.context =
  {
    append_child: function(parent, child)
    {
      parent.appendChild(child);
      var n = child.localName;
      if (child.namespaceURI === bender.NS && did_add_child.hasOwnProperty(n)) {
        did_add_child[n](child);
      }
    },

    // Setup the object for a new component (before loading)
    create_component: function(node)
    {
      var component = flexo.create_object(bender.component);
      flexo.hash(component, node.localName);
      component.context = this;    // current context
      component.definitions = {};  // map ids to loaded component prototypes
      component.metadata = {};     // component metadata
      component.node = node;       // root node of the component
      component.uri = node.ownerDocument.baseURI;
      component.watches = [];      // watch nodes
      var view;
      flexo.getter_setter(bender.component, "view",
        function() { return view; },
        function(v) { view = v; this.render_view(); });
      bender.log("+ Created component {0} at {1}"
          .fmt(component.hash, component.uri));
      return component;
    },

    // Create a bender node of the given name
    create_element: function(name, attrs, contents)
    {
      var node = flexo.elem(bender.NS, name, attrs, contents);
      (function create(node) {
        if (node.nodeType !== 1) return;
        var n = node.localName;
        if (node.namespaceURI === bender.NS &&
          did_create_node.hasOwnProperty(n)) {
          did_create_node[n](node, context);
        }
        if (node.parentNode && node.namespaceURI === bender.NS &&
          did_add_child.hasOwnProperty(n)) {
          did_add_child[n](node);
        }
        for (var ch = node.firstChild; ch; ch = ch.nextSibling) create(ch);
      })(node);
      return node;
    },
  };

  // Create a new context for a document
  bender.create_context = function(doc)
  {
    var context = flexo.create_object(bender.context);
    flexo.hash(context, "context");
    context.document = doc;
    context.loaded = {};      // loaded URIs
    context.prototypes = {};  // component prototypes indexed by URI
    bender.log("+ Created context {0} for".fmt(context.hash), context.document);
    return context;
  };


  var will_render_view =
  {
    app: function(view, target, instance)
    {
      will_render_view.component(view, target, instance);
    },

    component: function(view, target, instance)
    {
      if (!instance.node.is_definition) {
        var instance_ = view._component.instantiate();
        instance_.target = target;
      }
    },
  };

  bender.component =
  {
    instantiate: function()
    {
      var instance = flexo.create_object(this);
      flexo.hash(instance, "instance");
      instance.views = {};
      var target;
      flexo.getter_setter(instance, "target",
        function() { return target; },
        function(t) {
          if (target) bender.warn("Target changed from", target, "to", t);
          target = t; this.render_view();
        });
      bender.log("+ Created instance {0} from {1}"
          .fmt(instance.hash, this.hash));
      return instance;
    },

    // Render the view node in the target node
    render_view: function()
    {
      bender.log("? render view {0}/{1}".fmt(this.target, this.view));
      if (!this.target || !this.view) return;
      flexo.remove_children(this.target);
      (function render(view, target, instance) {
        for (var ch = view.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 1) {
            var n = ch.localName;
            if (ch.namespaceURI === bender.NS &&
              will_render_view.hasOwnProperty(n)) {
              will_render_view[n](view, target, instance);
            }
            var t = target.ownerDocument
              .createElementNS(ch.namespaceURI, ch.localName);
            for (var i = ch.attributes.length - 1; i >= 0; --i) {
              var attr = ch.attributes[i];
              if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI) &&
                attr.localName === "id") {
                instance.views[attr.nodeValue] = t;
                t.setAttribute("id", flexo.random_id(6));
              } else if (attr.namespaceURI) {
                t.setAttributeNS(attr.namespaceURI, attr.localName,
                  attr.nodeValue);
              } else {
                t.setAttribute(attr.localName, attr.nodeValue);
              }
            }
            target.appendChild(t);
            render(ch, t, instance);
          } else if (ch.nodeType === 3 || ch.nodeType === 4) {
            target.appendChild(target.ownerDocument
                .createTextNode(ch.textContent));
          }
        }
      })(this.view, this.target, this);
    },
  };


  // Check whether the node is in the Bender namespace and has the requested
  // local name
  var is_bender_node = function(node, localname)
  {
    return node.namespaceURI === bender.NS && node.localName === localname;
  };


  // TODO depending on debug level: ignore, log, die
  bender.warn = function(msg) { flexo.log("!!! WARNING: " + msg); }

  bender.DEBUG_LEVEL = 0;

  // Log messages only in debug mode; same as bender.debug(1, ...)
  bender.log = function()
  {
    if (bender.DEBUG_LEVEL > 0) flexo.log.apply(flexo, arguments);
  };

  // Conditional debug messages following the current debug level
  bender.debug = function(level)
  {
    if (BENDER_DEBUG_LEVEL > level) {
      flexo.log.apply(flexo, [].slice.call(arguments, 1));
    }
  };


  // Send a Bender event of a given type with optional arguments on behalf of a
  // source object by notifying all listeners. Can be called as notify(e),
  // where e must have a "source" and "type" property, or notify(source, type)
  // or notify(source, type, e)
  bender.notify = function(source, type, e)
  {
    if (e) {
      e.source = source;
      e.type = type;
    } else if (type) {
      e = { source: source, type: type };
    } else {
      e = source;
    }
    if (!e.source) bender.warn("No source for event", e);
    if (!e.type) bender.warn("No type for event", e);
    if (e.source.hasOwnProperty(e.type)) {
      e.source[e.type].forEach(function(handler) {
          if (handler.handleEvent) {
            handler.handleEvent(e);
          } else {
            handler(e);
          }
        });
    }
  };

  // Listen to notifications of a certain type from a source. addEventListener
  // is used for DOM events (when the source supports it), otherwise a custom
  // Bender listener is setup. The handler can be an object supporting the
  // handleEvent() function or a function. The once flag may be set to remove
  // the listener automatically after the first notification has been received.
  bender.listen = function(source, type, handler, once)
  {
    var h = once ? function(e) {
        bender.unlisten(source, type, h);
        if (handler.handleEvent) {
          handler.handleEvent(e);
        } else {
          handler(e);
        }
      } : handler;
    if (source.addEventListener) {
      source.addEventListener(type, h, false);
    } else {
      if (!(source.hasOwnProperty(type))) source[type] = [];
      source[type].push(h);
    }
  };

  // Stop listening (using removeEventListener when available)
  bender.unlisten = function(source, type, handler)
  {
    if (source.removeEventListener) {
      source.removeEventListener(type, handler, false);
    } else if (source.hasOwnProperty(type)) {
      var i = source[type].indexOf(handler);
      if (i >= 0) {
        source[type].splice(i, 1);
        if (source[type].length === 0) delete source[type];
      }
    }
  };

})(typeof exports === "object" ? exports : this.bender = {});
