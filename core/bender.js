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
    app: function(node, context)
    {
      did_create_node.component(node, context);
    },

    component: function(node, context)
    {
      var ref = node.getAttribute("ref");
      var href = node.getAttribute("href");
      if (!ref && !href) {
        node._is_definition = true;
        node._component = context.create_component(node);
      }
    },
  };

  var did_add_child =
  {
    view: function(node)
    {
      if (is_bender_node(node.parentNode, "component") ||
          is_bender_node(node.parentNode, "app")) {
        node.parentNode._component.view = node;
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
        did_add_child[n](child, context);
      }
    },

    // Setup the object for a new component (before loading)
    create_component: function(node)
    {
      var component = flexo.create_object(bender.component);
      flexo.hash(component, "component");
      component.context = this;    // current context
      component.definitions = {};  // map ids to loaded component prototypes
      component.metadata = {};     // component metadata
      component.node = node;       // root node of the component
      component.uri = node.ownerDocument.baseURI;
      component.watches = [];      // watch nodes

      var target;
      var view;

      flexo.getter_setter(bender.component, "target",
        function() { return target; },
        function(t) {
          target = t;
          if (view) this.render_view();
        });

      flexo.getter_setter(bender.component, "view",
        function() { return view; },
        function(v) {
          view = v;
          if (target) this.render_view();
        });

      bender.log("+ Created component {0} at {1}"
          .fmt(component.hash, component.uri));
      return component;
    },

    // Create a bender node of the given name
    create_element: function(name, attrs, contents)
    {
      var node = flexo.elem(bender.NS, name, attrs, contents);
      if (did_create_node.hasOwnProperty(name)) {
        did_create_node[name](node, context);
      }
      return node;
    },

    // Include an external component from an href value; return true if the
    // URI was already loaded (for use with load_async.)
    include: function(href, prototype)
    {
      var uri = href.replace(/#.*$/, "");
      if (this.loaded.hasOwnProperty(uri)) return true;
      this.load_component(uri, (function(prototype_) {
          this.loaded[uri] = true;
          loaded_component(prototype_, prototype);
        }).bind(this));
      return false;
    },

    // Initialize a new component from its URI and an optional target. The
    // third argument is an optioanl callback function that gets called with the
    // created instance just before a "@ready" event is dispatched from this
    // instance.
    init_component: function(uri, target, f)
    {
      this.load_component(uri, (function(prototype) {
          /*var instance = prototype.instantiate();
          instance.render_component(instance.node, target || this.target);
          instance.setup_watches();
          if (typeof f === "function") f(instance);
          bender.notify(instance, "@ready");*/
          if (typeof f === "function") f(prototype);
        }).bind(this));
    },

    // Load a component from its URI into its target calling a continuation
    // function on success or error.
    load_component: function(uri, f)
    {
      flexo.request_uri(uri, (function(req) {
          if (!req.responseXML) throw "Could not get XML for URI {0}".fmt(uri);
          var node = req.responseXML.documentElement;
          var prototype = this.create_component(node);
          load_async.trampoline(node, prototype, function(error) {
              if (error) throw error;
              f(prototype);
            });
        }).bind(this));
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


  bender.component =
  {
    // Find an id in the id map designated by map_name ("components" or "views")
    find_id: function(id, map_name)
    {
      if (!id) return;
      return id in this[map_name] ? this[map_name][id] :
        this.parent ? this.parent.find(id, map_name) : undefined;
    },

    // Get an absolute URI by solving relative paths to the component path
    get_absolute_uri: function(p)
    {
      // Often called with getAttribute("href") so there may be no value
      if (!p) return;
      // The path is absolute if it starts with a scheme and an authority (the
      // scheme comes before the : and the authority follows //) or with a
      // slash; otherwise it is relative and is resolved
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p) || /^\//.test(p)) return p;
      var url = this.node.ownerDocument.baseURI.replace(/(\/?)[^\/]*$/,
          "$1" + p);
      var m;
      while (m = /[^\/]+\/\.\.\//.exec(url)) {
        url = url.substr(0, m.index) + url.substr(m.index + m[0].length);
      }
      return url;
    },

    // Get an URI for a component node, looking up its href or ref attribute
    get_uri_for_node: function(node)
    {
      return node.getAttribute("href") ?
        this.get_absolute_uri(node.getAttribute("href")) :
        this.find_id(node.getAttribute("ref"), "components");
    },

    // Stub for event handling
    handleEvent: function() {},

    // Instantiate a new component from this prototype
    instantiate: function()
    {
      var instance = flexo.create_object(this);
      flexo.hash(instance, "instance");
      instance.children = [];
      instance.views = {};
      return instance;
    },

    // Render the different elements; this means creating component objects,
    // delegates, and DOM nodes for concrete nodes. The node argument is the
    // current node in the XML definition. We may want to skip rendering, e.g.
    // for inline component definitions, so we check the result of
    // will_render_element() calls to see if we should proceed with the contents
    // of the current node or not.
    render_component: function(node, target)
    {
      var n = node.localName;
      if (node.namespaceURI === bender.NS &&
          will_render_element.hasOwnProperty(n)) {
        if (!will_render_element[n](node, this, target)) return;
      }
      for (var ch = node.firstElementChild; ch; ch = ch.nextElementSibling) {
        this.render_component(ch, target);
      }
      if (node.namespaceURI === bender.NS &&
          did_render_element.hasOwnProperty(n)) {
        did_render_element[n](node, this, target);
      }
    },

    // Render the view node in the target node
    render_view: function()
    {
      flexo.remove_children(this.target);
      (function render(view, target) {
        for (var ch = view.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 1) {
            var t = target.ownerDocument
              .createElementNS(ch.namespaceURI, ch.localName);
            for (var i = 0, n = ch.attributes.length; i < n; ++i) {
              var attr = ch.attributes[i];
              if ((attr.namspaceURI === flexo.XML_NS || !attr.namespaceURI) &&
                attr.localName === "id") {
                t.setAttribute("id", flexo.random_id(6));
              } else if (attr.namespaceURI === flexo.XML_NS && !t.namespaceURI) {
                t.setAttribute(attr.localName, attr.nodeValue);
              } else if (attr.namespaceURI) {
                t.setAttributeNS(attr.namespaceURI, attr.localName,
                  attr.nodeValue);
              } else {
                t.setAttribute(attr.localName, attr.nodeValue);
              }
            }
            target.appendChild(t);
            render(ch, t);
          } else if (ch.nodeType === 3 || ch.nodeType === 4) {
            target.appendChild(target.ownerDocument
                .createTextNode(ch.textContent));
          }
        }
      })(this.view, this.target);
    },

    // Setup watches after rendering was done
    setup_watches: function()
    {
      bender.log("setup_watches {0}".fmt(this.hash));
    }
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


  // Load the current node--there might be nothing to do, loading may be
  // immediate, or there might be a delay in which case the tree traversal
  // stops until a loaded event resumes it. Only handle loading; we'll
  // render and connect components later
  var load_async = function(node, prototype, k)
  {
    if (!node) return k.get_thunk();
    var n = node.localName;
    if (node.namespaceURI === bender.NS &&
        will_load_element.hasOwnProperty(n)) {
      if (!will_load_element[n](node, prototype, k)) {
        bender.listen(prototype, "@bender-load", function() { k.trampoline(); },
            true);
        bender.listen(prototype, "@bender-error", function() {
            throw "Failed to load {0} element at {1}"
              .fmt(n, prototype.get_absolute_uri(node.getAttribute("href")));
          }, true);
        return;
      }
    }
    var load_child = function(ch) {
      if (!ch) {
        if (node.namespaceURI === bender.NS &&
            did_load_element.hasOwnProperty(n)) {
          did_load_element[n](node, prototype);
        }
        return k.get_thunk();
      }
      return load_async.get_thunk(ch, prototype,
          function() { return load_child.get_thunk(ch.nextElementSibling); });
    }
    return load_child.get_thunk(node.firstElementChild);
  };

  // Specific load functions for various elements. Return true if loading can
  // continue immediately, false otherwise. Default is thus to do nothing and
  // return true.
  var will_load_element =
  {
    // At the loading stage, treat <component href="..."> in the same manner as
    // <include href="..."> (instantation will differ though.) For component
    // definitions, update the URI of the prototype.
    // Also flag definition nodes so that we can distinguish them from
    // instanciation nodes easily
    component: function(node, prototype)
    {
      if (node.getAttribute("href")) {
        return will_load_element.include(node, prototype);
      } else if (!node.getAttribute("ref")) {
        // If this is not the root node, then it is an inline component
        // definition
        if (node !== prototype.node) {
          var prototype_ = prototype.context.create_component(node);
          load_async.trampoline(node, prototype_, function(error) {
              if (error) throw error;
              loaded_component(prototype_, prototype);
            });
          return false;
        }
        node._is_definition = true;
        // The component may not have an id, in which case its URI is that of
        // the document that it is inside (there should be only one component
        // in that document.)
        var id = node.getAttribute("id");
        if (id) {
          if (node === node.ownerDocument.documentElement) {
            prototype.uri_ = prototype.uri;
          }
          prototype.id = id;
          prototype.uri += "#" + id;
        }
      }
      return true;
    },

    // Add the get to the current watch (if any)
    get: function(node, prototype)
    {
      var p = prototype.watches[prototype.watches.length - 1];
      if (p) p.get.push(node);
      return true;
    },

    // Include an external component. Do not load an URI that has already been
    // loaded
    include: function(node, prototype)
    {
      return prototype.context
        .include(prototype.get_absolute_uri(node.getAttribute("href")),
            prototype);
    },

    // Local script; loaded later
    local: function(node, prototype)
    {
      node.parentNode.local_scripts = true;
      return true;
    },

    // Script may defer loading: if there is an href attribute, then pause
    // loading of the document until the script has been run, since later
    // scripts may depend on this one.
    // Local scripts (children of controller nodes) are skipped and only
    // executed when rendering.
    script: function(node, prototype)
    {
      var uri = prototype.get_absolute_uri(node.getAttribute("href"));
      var content = uri ? "" : node.textContent;
      var elem = prototype.context.document.createElement("script");
      if (uri) {
        elem.onload = function() { bender.notify(prototype, "@bender-load"); };
        elem.onerror = function(e) {
          bender.notify(prototype, "@bender-error", e);
        };
        elem.setAttribute("src", uri);
      } else {
        elem.textContent = content;
      }
      prototype.context.document.appendChild(elem);
      return !uri;
    },

    // Add the set to the current watch (if any)
    set: function(node, prototype)
    {
      var p = prototype.watches[prototype.watches.length - 1];
      if (p) p.set.push(node);
      return true;
    },

    // We don't wait for stylesheets to load; we'll let the host application
    // handle that.
    stylesheet: function(node, prototype)
    {
      var uri = prototype.get_absolute_uri(node.getAttribute("href"));
      var head = find_head(prototype.context.document);
      head.appendChild(uri ?
        flexo.elem(head.namespaceURI, "link",
            { rel: "stylesheet", type: "text/css", href: uri }) :
        flexo.elem(head.namespaceURI, "style", {}, node.textContent));
      return true;
    },

    // Store the title node in the component prototype
    title: function(node, prototype)
    {
      prototype.metadata.title = node;
      return true;
    },

    // Keep track of the view node
    view: function(node, prototype)
    {
      if (!prototype.view_node) prototype.view_node = node;
      return true;
    },

    // Prepare the watch nodes
    watch: function(node, prototype)
    {
      var w = { node: node, children: [], get: [], set: [], parent: prototype };
      flexo.hash(w, "watch");
      if (is_bender_node(node.parentNode, "watch")) {
        var p = prototype.watches[prototype.watches.length - 1];
        w.parent = p.node === node.parentNode ? p : p.parent;
        w.parent.children.push(w);
      }
      prototype.watches.push(w);
      return true;
    }
  };

  var did_load_element = {};

  var will_render_element =
  {
    // Create new component instances for references; don't do rendering for
    // definitions
    component: function(node, instance)
    {
      if (node._is_definition && node !== instance.node) {
        return false;
      } else if (!node._is_definition) {
        var uri = instance.get_uri_for_node(node);
        if (!uri) {
          var href = node.getAttribute("href");
          if (href) throw "Could not get URI for href=\"{0}\"".fmt(href);
          throw "Could not get URI for ref=\"{0}\""
            .fmt(node.getAttribute("ref"));
        }
        var prototype = instance.context.prototypes[uri];
        if (!prototype) throw "No prototype for component at URI {0}".fmt(uri);
        var id = node.getAttribute("id");
        if (typeof node._instances !== "object") node._instances = [];
        // TODO
        //var instance_ = prototype.instantiate();
        // _and_render(id);
        instance_.parent = instance;
        instance.children.push(instance_);
        node._instances.push(instance_);
        if (id) instance.views[id] = instance_;
      }
      return true;
    },

    // Local scripts are executed in the context of the parent delegate:
    // the text content is wrapped into a function binding the special variable
    // $_ to the prototype of the controller delegate, thus allowing to
    // redefine methods; e.g., $_.handleEvent = function(e) { ... };
    script: function(node, instance)
    {
      var p = node.parentNode;
      if (is_bender_node(p, "controller")) {
        var prototype = node_prototype(p, bender.controller);
        (new Function("$_", node.textContent)).call(instance, prototype);
      }
      return true;
    }
  };

  var did_render_element =
  {
    app: function(node, instance)
    {
      did_render_element.component(node, instance);
      // Render metadata and view to the output document only for the main
      // app (i.e. not for components or included app)
      if (!instance.parent) {
        //flexo.remove_children(instance.);
        //render_metadata(instance);
        //render_content(instance.view_node, instance.dest_body, instance);
      }
    },

    // Create new delegates for controllers.
    component: function(node, instance)
    {
      /*var prototype = node_prototype(node, bender.controller);
      var delegate = bender.create_controller(node, instance, prototype);
      var id = !skip_id && node.getAttribute("id") || "";
      if (instance.controllers[id]) {
        throw "Redefinition of {0}controller{1}"
          .fmt(id ? "main " : "", id ? " " + id : "");
      }
      instance.controllers[id] = delegate;*/
    }
  };

  // Return the head element (for HTML documents) or by default the
  // documentElement (for SVG or generic documents)
  var find_head = function(doc) { return doc.head || doc.documentElement; };

  // Find the prototype for the name of an instance
  // i.e. "bender.controller" -> bender.controller
  // Use the default_prototype argument if not found (or if there was no
  // instance-of argument to start with)
  // This is used to instantiate controller nodes with the correct prototype
  var find_prototype = function(name, default_prototype)
  {
    if (!name) return default_prototype;
    var p = flexo.global_object();
    var derefs = name.split(".");
    for (var i = 0, n = derefs.length; i < n && p; ++i) {
      p = typeof p === "object" && p.hasOwnProperty(derefs[i]) ?
        p[derefs[i]] : "";
    }
    if (!p) bender.warn("No prototype found for \"{0}\"".fmt(name));
    return p || default_prototype;
  };

  // Check whether the node is in the Bender namespace and has the requested
  // local name
  var is_bender_node = function(node, localname)
  {
    return node.namespaceURI === bender.NS && node.localName === localname;
  };

  // A component was loaded: setup the relationship with the parent and app,
  // and send a loaded event (delayed for inline components)
  var loaded_component = function(prototype, parent)
  {
    prototype.parent = parent;
    if (prototype.id) parent.definitions[prototype.id] = prototype.uri;
    prototype.context.prototypes[prototype.uri] = prototype;
    if (prototype.uri_) {
      prototype.context.prototypes[prototype.uri_] = prototype;
      delete prototype.uri_;
    }
    setTimeout(function() { bender.notify(parent, "@bender-load"); }, 0);
  };

  /*

  // Get the arguments from the query string, or a custom string to use its
  // stead. Default arguments are:
  //   * app: required; path to the app to run
  //   * path: default path (../)
  //   * suffix: default suffix (.xml)
  //   * dest: id of the destination element for rendering; document if none
  //   * debug: debug level (0, 1, etc.)
  bender.get_args = function(argstr)
  {
    var args = { dest: "dest-body", debug: 0, path: "../", suffix: ".xml" };
    if (!argstr) {
      argstr = typeof window === "object" &&
        typeof window.location === "object" &&
        typeof window.location.search === "string" ?
        window.location.search.substring(1) : "";
    }
    argstr.split("&").forEach(function(q) {
        var sep = q.indexOf("=");
        args[q.substr(0, sep)] = unescape(q.substr(sep + 1));
      });
    args.debug = Math.max(parseInt(args.debug, 10), 0);
    args.dest = document.getElementById(args.dest);
    ARGS.debug = args.debug;
    return args;
  };

  // Return the body element (for HTML documents) or by default the
  // documentElement (for SVG or generic documents)
  var find_body = function(doc) { return doc.body || doc.documentElement; };

  // Base prototype for component objects (including app)
  bender.component =
  {

  };

  // Setup the object for a new component (before loading)
  bender.create_component = function(node, dest_body, app)
  {
    var c = flexo.create_object(bender.component);
    c.hash = flexo.hash(app ? "component" : "app");
    c.app = app || c;         // the current app
    c.dest_body = dest_body;  // body element for rendering
    c.components = {};        // map ids to loaded component prototypes
    c.metadata = {};          // component metadata
    c.root = node;            // root node of the component
    c.watches = [];           // watch nodes
    c.uri = node.ownerDocument.baseURI;
    return c;
  };

  // Setup the object for the app (a special case of component)
  // Initialize the map of loaded URIs. We keep two maps; one for document
  // URIs (absolute URIs with no fragment identifier) and one for loaded
  // instances (absolute URIs with fragment identifier.) The first one acts
  // as a set; the second one maps URIs to (prototype) instances.
  bender.create_app = function(node, dest_body)
  {
    var app = bender.create_component(node, dest_body);
    app.uri_map = {};
    app.loaded_uris = {};
    app.loaded_uris[app.uri] = true;
    return app;
  };

  // Set parameters on the object o frome the e/f/b attributes of the node
  var set_parameters_from_attributes = function(node, o)
  {
    for (var i = 0, n = node.attributes.length; i < n; ++i) {
      var attr = node.attributes[i];
      if (attr.namespaceURI === bender.NS_E) {
        o[attr.localName] = attr.nodeValue;
      } else if (attr.namespaceURI === bender.NS_F) {
        var v = parseFloat(attr.nodeValue);
        if (isNaN(v)) {
          throw "Not a float value for attribute {0}: {1}"
            .fmt(attr.localName, attr.nodeValue);
        }
        o[attr.localName] = v;
      } else if (attr.namespaceURI === bender.NS_B) {
        o[attr.localName] = attr.nodeValue.toLowerCase() === "true";
      }
    }
  };

  // Set application parameters from the arguments passed
  var set_parameters_from_args = function(app, args)
  {
    for (var param in args) {
      var val = args[param];
      var m;
      if (m = param.match(/^e:/)) {
        app[param.substr(2)] = val;
      } else if (m = param.match(/^f:/)) {
        var v = parseFloat(val);
        if (isNaN(v)) {
          throw "Not a float value for attribute {0}: {1}".fmt(param, val);
        }
        app[param.substr(2)] = v;
      } else if (m = param.match(/^b:/)) {
        app[param.substr(2)] = val.toLowerCase() === "true";
      }
    }
  };

  // Load URL using XMLHttpRequest. The dest_body element is used as
  // destination for rendering (for applications) and f is called with the
  // resulting component prototype after loading has finished.
  // Although we don't render yet, we create <script> and <stylesheet> elements
  // in the target document so we need the dest_body element.
  // This is used to load an app or component document (from a loader
  // application or through <include>)
  // TODO req.status === 0 allows to load from file rather than HTTP (but works
  // only in Safari), and is only for development versions
  var load_uri = function(uri, dest_body, f, app)
  {
    flexo.request_uri(uri, function(req) {
        if (!req.responseXML) throw "Could not get XML for URI {0}".fmt(uri);
        var node = req.responseXML.documentElement;
        var prototype = app ?
          bender.create_component(node, dest_body, app) :
          bender.create_app(node, dest_body);
        load_async.trampoline(prototype.root, prototype,
          function(error) {
            if (error) throw error;
            f(prototype);
          });
      });
  };



  // Find the prototype for a node using its "instance-of" attribute (and
  // calling find_prototype above), but memoize it on the node.
  var node_prototype = function(node, default_prototype)
  {
    if (!node.__prototype) {
      var prototype = find_prototype(node.getAttribute("instance-of"),
          default_prototype);
      if (node.local_scripts) {
        node.__prototype = flexo.create_object(prototype);
        node.__prototype.hash = flexo.hash("controller");
      } else {
        node.__prototype = prototype;
      }
    }
    return node.__prototype;
  };

  // Render the application metadata:
  // * title in the outermost title element of the destination document
  //   (a new title element is created if necessary)
  var render_metadata = function(app)
  {
    var title = find_title(app.dest_body.ownerDocument);
    if (!title) {
      title = flexo.elem(app.dest_body.namespaceURI, "title", {});
      app.dest_body.appendChild(title);
    }
    if (app.metadata.title) {
      title.textContent = app.metadata.title.textContent;
    } else {
      title.textContent = "Bender";
    }
    // TODO render language attribute rather than language metadata property
    if (app.metadata.language) {
      var e = app.dest_body.ownerDocument.documentElement;
      if (e.namespaceURI && !e.getAttribute("lang")) {
        e.setAttributeNS(flexo.XML_NS, "lang", app.metadata.language);
      } else {
        e.setAttribute("lang", app.metadata.language);
      }
    }
  };

  // Find the outermost <title> element of the (presumably) destination
  // document
  var find_title = function(doc)
  {
    // Use breadth-first search since we want the outermost title element
    var q = [doc.documentElement];
    while (q.length > 0) {
      var node = q.shift();
      if (typeof node !== "object") continue;
      if (node.namespaceURI === doc.documentElement.namespaceURI &&
          node.localName === "title") return node;
      q.push.apply(q, children_or_text(node));
    }
  };

  // Find the first content child with the given id. If not found in this
  // instance's component, search the parent.
  var find_content = function(instance, id)
  {
    if (!instance.__component) return;
    for (var ch = instance.__component.firstElementChild; ch;
        ch = ch.nextElementSibling) {
      if (is_bender_node(ch, "content") && ch.getAttribute("ref") === id) {
        return ch;
      }
    }
    return find_content(instance.parent, id);
  }

  var render_view =
  {
    // Render the view of the component; keep track of the component node so
    // that the <content> element can access it
    component: function(node, target, instance)
    {
      if (typeof node._instances === "object") {
        var instance_ = node._instances.shift();
        instance_.__component = node;
        set_parameters_from_attributes(node, instance_);
        render_content(instance_.view_node, target, instance_);
        delete instance_.__component;
      }
    },

    // Render the content of the original component element. A default content
    // can be specified inside the <content> element in case there is no
    // available content in the current context (i.e. there is no including
    // component, or no match for the content id.)
    content: function(node, target, instance)
    {
      if (instance.__component) {
        var id = node.getAttribute("id");
        if (id) {
          var content = find_content(instance, id);
          if (content) {
            render_content(content, target, instance);
          } else {
            render_content(node, target, instance);
          }
        } else {
          render_content(instance.__component, target, instance);
        }
      } else {
        render_content(node, target, instance);
      }
    }
  };

  // Render the view of a component to a target node
  var render_content = function(node, target, instance)
  {
    var contents = children_or_text(node);
    if (typeof contents === "string") {
      target.textContent = contents;
    } else {
      contents.forEach(function(ch) {
          var rendered = render_node(ch, target, instance);
          if (rendered) target.appendChild(rendered);
        });
    }
  };

  // Render a node (text or element) and return the rendered node (if any; we
  // only render element and text nodes, so comments for instance are skipped)
  var render_node = function(node, target, instance)
  {
    if (node.nodeType === 1) {
      if (node.namespaceURI === bender.NS) {
        return render_view.hasOwnProperty(node.localName) ?
          render_view[node.localName](node, target, instance) : undefined;
      }
      var target_ = instance.app.dest_body.ownerDocument.
        createElementNS(node.namespaceURI, node.localName);
      var id = node.getAttribute("id");
      if (id) {
        if (instance.views[id]) {
          bender.warn("Redefinition of id {0} in {1}".fmt(id, instance.hash));
        } else {
          instance.views[id] = target_;
        }
      }
      for (var i = 0, n = node.attributes.length; i < n; ++i) {
        var attr = node.attributes[i];
        if (attr.namespaceURI === flexo.XML_NS && !target_.namespaceURI) {
          target_.setAttribute(attr.localName, attr.nodeValue);
        } else if (attr.namespaceURI) {
          target_.setAttributeNS(attr.namespaceURI, attr.localName,
            attr.nodeValue);
        } else {
          target_.setAttribute(attr.localName, attr.nodeValue);
        }
      }
      render_content(node, target_, instance);
      return target_;
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      return instance.app.dest_body.ownerDocument
        .createTextNode(node.textContent);
    }
  };

  // Return children as an array. In full DOM this is just the arrayfication of
  // childNodes; in µDOM context, this is either the array of element children,
  // or if there are no children elements but text content, the text content
  // of the node is returned as a string
  var children_or_text = function(node)
  {
    var children = [];
    for (var ch = node.firstChild; ch; ch = ch.nextSibling) children.push(ch);
    return children.length === 0 && /\S/.test(node.textContent) ?
      node.textContent : children;
  };

  // Get source view or controller from the node attributes "view" or
  // "controller" in the context of a component instance
  var view_or_controller = function (instance, node_or_view, controller)
  {
    var view, source;
    if (node_or_view && typeof node_or_view.getAttribute === "function") {
      view = node_or_view.getAttribute("view");
      controller = node_or_view.getAttribute("controller");
    } else {
      view = node_or_view;
    }
    if (view) {
      if (controller) {
        throw "Ambiguous source: view \"{0}\" or controller \"{1}\"?"
          .fmt(view, controller);
      }
      source = instance.find_id(view, "views");
      if (!source) bender.warn("No source view for \"{0}\"".fmt(view));
    } else if (controller) {
      source = instance.find_id(controller, "controllers");
      if (!source) {
        bender.warn("No source controller for \"{0}\"".fmt(controller));
      }
    }
    return source;
  }

  // Build the watch graph for this instance
  var build_watch_graph = function(instance)
  {
    instance.children.forEach(build_watch_graph);
    instance.watches.forEach(function(watch) {
        var active = watch.parent === instance.__proto__;
        watch.__active = active;
        var setters = watch.set.map(function(set) {
            var view = set.getAttribute("view");
            var controller = set.getAttribute("controller");
            var dest = view_or_controller(instance, view, controller);
            var property = set.getAttribute("property");
            var attr = set.getAttribute("attr");
            if (!attr && !property) property = "textContent";
            var get_v = /\S/.test(set.textContent) ?
              (new Function("value", set.textContent)).bind(instance) :
              flexo.id;
            return function(v) {
              var v_ = get_v(v);
              if (typeof v_ !== "undefined") {
                if (dest) {
                  if (attr) {
                    dest.setAttribute(attr, v_);
                  } else {
                    dest[property] = v_;
                  }
                } else {
                  instance[property] = v_;
                }
              }
            };
          });
        watch.get.forEach(function(get) {
            var view = get.getAttribute("view");
            var controller = get.getAttribute("controller");
            var source = view_or_controller(instance, view, controller);
            var property = get.getAttribute("property");
            var event = get.getAttribute("event");
            var domevent = get.getAttribute("dom-event");
            if (controller || event) {
              if (!event) event = "@change";
              if (!source) source = instance.controllers[""];
              bender.listen(source, event, function(e) {
                  var get_v = /\S/.test(get.textContent) ?
                    (new Function("value", get.textContent)).bind(instance) :
                    flexo.id;
                  var e_ = get_v(e);
                  setters.forEach(function(f) { f.call(instance, e_); });
                });
            } else if (view || domevent) {
              if (!property) property = "textContent";
              if (domevent) {
                if (!source) source = instance.app.dest_body.ownerDocument;
                bender.listen(source, domevent, function(e) {
                    if (!watch.__active) return;
                    if (!active) {
                      watch.parent.children.forEach(function(w) {
                          w.__active = false;
                        });
                    }
                    watch.children.forEach(function(w) { w.__active = true; });
                    var get_v = /\S/.test(get.textContent) ?
                      (new Function("value", get.textContent)).bind(instance) :
                      flexo.id;
                    var e_ = get_v(e);
                    setters.forEach(function(f) { f.call(instance, e_); });
                  });
              }
              // else monitor property
            } else {
              if (!property) throw "No property for watch/get on instance";
              var init = instance[property];
              (function() {
                var p;
                flexo.getter_setter(instance, property,
                  function() { return p; },
                  function(x) {
                    p = x;
                    setters.forEach(function(f) { f.call(instance, x); });
                  });
              })();
              if (typeof init !== "undefined") instance[property] = init;
            }
          });
      });
    bender.notify(instance.controllers[""], "@rendered");
  };

  */

})(typeof exports === "object" ? exports : this.bender = {});
