// Bender core library


if (typeof require === "function") flexo = require("./flexo.js");

(function(bender) {

  bender.VERSION = "0.3.0";

  // Bender's namespaces
  bender.NS = "http://bender.igel.co.jp";
  bender.NS_B = bender.NS + "/b";
  bender.NS_E = bender.NS + "/e";
  bender.NS_F = bender.NS + "/f";


  // Create a new context for Bender and add its node to the given document
  bender.create_context = function()
  {
    var context = document.implementation.createDocument(bender.NS, "context");
    context.createElement = function(name) {
      return wrap_element(Document.prototype.createElementNS.call(context,
          bender.NS, name));
    };
    context.createElementNS = function(nsuri, qname) {
      var e = Document.prototype.createElementNS.call(context, nsuri, qname);
      if (nsuri === bender.NS) wrap_element(e);
      return e;
    };
    wrap_element(context.documentElement);
    context.components = {};
    return context;
  };

  // Wrap a Bender node
  var wrap_element = function(e)
  {
    var name = e.localName === "app" ? "component" : e.localName;
    flexo.hash(e, e.localName);
    var proto = prototypes[name] || {};
    for (var p in prototypes[""]) {
      e[p] = proto.hasOwnProperty(p) ? proto[p] : prototypes[""][p];
    }
    for (var p in proto) if (!e.hasOwnProperty(p)) e[p] = proto[p];
    return e;
  };

  // Overloading functions for Bender nodes
  var prototypes = {

    "": {
      appendChild: function(ch) { return this.insertBefore(ch, null); },
      insertBefore: function(ch, ref) {
        var ch_ = Element.prototype.insertBefore.call(this, ch, ref);
        this.update_view();
        return ch_;
      },
      setAttribute: function(name, value) {
        return Element.prototype.setAttribute.call(this, name, value);
      },

      set_text_content: function(text) {
        this.textContent = text;
        this.update_view();
      },

      update_view: function()
      {
        var component = get_view_parent(this);
        if (component) component.update_view();
      },
    },

    title:
    {
      set_text_content: function(text) {
        this.textContent = text;
        if (this.parentNode && this.parentNode.update_title) {
          this.parentNode.update_title();
        }
      },
    },

    component: {
      insertBefore: function(ch, ref) {
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "title") {
            if (this.title) {
              bender.warn("Redefinition of title in {0}".fmt(this.hash));
            }
            this.title = ch;
            this.update_title();
          } else if (ch.localName === "view") {
            if (this.view) {
              bender.warn("Redefinition of view in {0}".fmt(this.hash));
            }
            this.view = ch;
          }
        }
        return Element.prototype.insertBefore.call(this, ch, ref);
      },

      setAttribute: function(name, value)
      {
        if (name === "id") {
          var id = this.getAttribute("id");
          if (id && id !== value) delete this.ownerDocument.components[value];
          this.ownerDocument.components[value] = this;
        } else if (name === "ref") {
          this.is_definition = false;
          this.ref = value;
        }
        Element.prototype.setAttribute.call(this, name, value);
      },

      instantiate: function()
      {
        var instance = flexo.create_object(component);
        flexo.hash(instance, "instance");
        instance.node = this;
        instance.views = {};
        if (!this.instances) this.instances = {};
        this.instances[instance.hash] = instance;
        return instance;
      },

      update_title: function()
      {
        if (this.instances) {
          for (h in this.instances) this.instances[h].render_title();
        }
      },

      update_view: function()
      {
        if (this.instances) {
          for (h in this.instances) this.instances[h].render();
        }
      }
    }
  };

  // Component prototype for new instances
  var component = {
    render: function(target, main)
    {
      if (!this.target && !target) return;
      if (!this.node.view) return;
      if ((this.target && !target) || this.target === target) {
        bender.log("--- {0}: clearing".fmt(this.hash), this.target);
        flexo.remove_children(this.target);
      } else {
        this.target = target;
      }
      if (main) {
        var context = this.node.ownerDocument;
        if (context.main && context.main === this) context.is_main = false;
        context.main = this;
        this.is_main = true;
        this.render_title();
      }
      var self = this;
      (function render(source, dest) {
        for (var ch = source.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 1) {
            if (ch.namespaceURI === bender.NS) {
              if (ch.localName === "component" && ch.ref) {
                var def = ch.ownerDocument.components[ch.ref];
                if (def) def.instantiate().render(dest);
              } else if (ch.localName === "content") {
                render(ch, dest);
              }
            } else {
              var d = dest.ownerDocument
                .createElementNS(ch.namespaceURI, ch.localName);
              for (var i = ch.attributes.length - 1; i >= 0; --i) {
                var attr = ch.attributes[i];
                if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI)
                  && attr.localName === "id") {
                  self.views[attr.nodeValue] = d;
                  flexo.hash(d, d.localName);
                  d.setAttribute("id", d.hash);
                } else if (attr.namespaceURI) {
                  d.setAttributeNS(attr.namespaceURI, attr.localName,
                    attr.nodeValue);
                } else {
                  d.setAttribute(attr.localName, attr.nodeValue);
                }
              }
              dest.appendChild(d);
              render(ch, d);
            }
          } else if (ch.nodeType === 3 || ch.nodeType === 4) {
            dest.appendChild(dest.ownerDocument
              .createTextNode(ch.textContent));
          }
        }
      })(this.node.view, this.target);
    },

    render_title: function()
    {
      if (this.target && this.is_main && this.node.title) {
        find_title(this.target.ownerDocument).textContent =
          this.node.title.textContent;
      }
    }
  };


  // Utility functions

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
      var ch = children_or_text(node);
      if (typeof ch === "object" && ch.length) {
        q.push.apply(q, children_or_text(node));
      }
    }
  };

  // If this node is a descendant of a view element, get the parent component
  // of said view
  var get_view_parent = function(node)
  {
    var view = (function get_view(n) {
      return n ? is_bender_node(n, "view") ? n : get_view(n.parentNode) : null;
    })(node);
    if (view && view.parentNode && view.parentNode.view === view) {
      return view.parentNode;
    }
  };

  // Check whether the node is in the Bender namespace and has the requested
  // local name
  var is_bender_node = function(node, localname)
  {
    return node.namespaceURI === bender.NS && node.localName === localname;
  };


  // Warning (at development time, throw an error)
  // TODO depending on debug level: ignore, log, die
  bender.warn = function(msg) { flexo.log("!!! WARNING: " + msg); }

  // Log messages only in debug mode; same as bender.debug(1, ...)
  bender.log = function()
  {
    if (bender.DEBUG_LEVEL > 0) flexo.log.apply(flexo, arguments);
  };

  // Conditional debug messages following the current debug level
  bender.debug = function(level)
  {
    if (bender.DEBUG_LEVEL > level) {
      flexo.log.apply(flexo, [].slice.call(arguments, 1));
    }
  };


  // Can be called as notify(e), notify(source, type) or notify(source, type, e)
  bender.notify = function(source, type, e)
  {
    if (e) {
      e.source = source;
      e.type = type;
    } else if (type) {
      e = { source: source, type: type };
    } else {
      e = source;
      if (!e.source) bender.warn("No source field for event");
      if (!e.type) bender.warn("No type field for event");
    }
    if (e.type in e.source) {
      e.source[e.type].forEach(function(handler) {
          if (handler.handleEvent) {
            handler.handleEvent(e);
          } else {
            handler(e);
          }
        });
    }
  };

  // Listen to a notification using addEventListener when available (usually
  // for DOM nodes), or custom Bender events.
  bender.listen = function(listener, type, handler, once)
  {
    var h = once ? function(e) {
        bender.unlisten(listener, type, h);
        if (handler.handleEvent) {
          handler.handleEvent(e);
        } else {
          handler(e);
        }
      } : handler;
    if (listener.addEventListener) {
      listener.addEventListener(type, h, false);
    } else {
      if (!(type in listener)) listener[type] = [];
      listener[type].push(h);
    }
  };

  // Stop listening (using removeEventListener when available, just like
  // bender.listen)
  bender.unlisten = function(listener, type, handler)
  {
    if (listener.removeEventListener) {
      listener.removeEventListener(type, handler, false);
    } else if (type in listener) {
      var i = listener[type].indexOf(handler);
      if (i >= 0) listener[type].splice(i, 1);
    }
  };


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
    bender.DEBUG_LEVEL = args.debug;
    return args;
  };

  // Load and initialize an application from a URL into a destination body,
  // optionally calling the function f with the result app instance when done,
  // and then sending a @ready notification on behalf of the main controller.
  // The destination is obtained from the args object, which contains all the
  // default and user-defined arguments for the application.
  bender.init_app = function(url, args, f)
  {
    if (!args.dest) args.dest = find_body(document);
    load_uri(url, args.dest, function(prototype) {
        var app = prototype.instantiate_and_render();
        set_parameters_from_args(app, args);
        build_watch_graph(app);
        if (f) f(app);
        bender.notify(app.controllers[""], "@ready");
      });
  };

  // Base prototype for app and component objects
  // Fields:
  //   * children: list of child components
  //   * controllers: map of id to controllers, the main controller has no id
  //       (i.e. main controller is component.controllers[""])
  //   * views: map of id of view nodes to instances and concrete DOM nodes
  bender.component =
  {
    // Find an id in the id map designated by map_name (e.g., "components",
    // "views" or "controllers")
    find: function(id, map_name)
    {
      if (!id) return;
      return id in this[map_name] ? this[map_name][id] :
        this.parent ? this.parent.find(id, map_name) : undefined;
    },

    // Get an absolute URI by solving relative paths to the app path
    get_absolute_uri: function(p)
    {
      // This is usually called with getAttribute("href") so there may be no
      // value
      if (!p) return;
      // The path is absolute if it starts with a scheme and an authority (the
      // scheme comes before the : and the authority follows //) or with a
      // slash; otherwise it is relative and is resolved
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+/.test(p) || /^\//.test(p)) return p;
      var url = this.root_node.ownerDocument.baseURI.replace(/(\/?)[^\/]*$/,
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
        this.find(node.getAttribute("ref"), "components");
    },

    // Instantiate a new component from this prototype
    instantiate: function()
    {
      var instance = flexo.create_object(this);
      instance.hash = flexo.hash("instance");
      instance.children = [];
      instance.controllers = {};
      instance.views = {};
      return instance;
    },

    // Render the component to a new instance in the destination element
    instantiate_and_render: function(parent_id)
    {
      var instance = this.instantiate();
      if (typeof parent_id === "string") instance.parent_id = parent_id;
      render_component(instance.root_node, instance);
      return instance;
    }
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
    c.root_node = node;       // root node of the component
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

  // Base controller to be derived by custom controllers
  // Default handling of event is to just ignore them
  bender.controller =
  {
    handleEvent: function() {},
    init: function() {},
    notify: function(type, e) { bender.notify(this.component, type, e); },
    forward_event: function(e) { bender.notify(this.component, e.type, e); }
  };

  // Base delegate for controller nodes. The init() method can be overridden to
  // perform custom initialization and set default parameters; parameter values
  // are provided through attribute in the e/f namespace (e for string values,
  // f for float values.)
  bender.create_controller = function(node, instance, prototype)
  {
    var c = flexo.create_object(prototype);
    c.hash = flexo.hash("controller");
    c.node = node;
    c.component = instance;
    c.init();
    set_parameters_from_attributes(node, c);
    return c;
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
        load_async.trampoline(prototype.root_node, prototype,
          function(error) {
            if (error) throw error;
            f(prototype);
          });
      });
  };

  // Load the current node--there might be nothing to do, loading may be
  // immediate, or there might be a delay in which case the tree traversal
  // stops until a loaded event resumes it. Only handle loading; we'll
  // render and connect components later
  var load_async = function(node, prototype, k)
  {
    if (!node) return k.get_thunk();
    if (node.namespaceURI === bender.NS &&
        will_load_element.hasOwnProperty(node.localName)) {
      if (!will_load_element[node.localName](node, prototype)) {
        bender.listen(prototype, "@bender-load", function() {
            k.trampoline();
          }, true);
        bender.listen(prototype, "@bender-error", function() {
            throw "Failed to load {0} element at {1}".fmt(node.localName,
              prototype.get_absolute_uri(node.getAttribute("href")));
          }, true);
        return;
      }
    }
    var load_child = function(ch) {
      if (!ch) {
        if (node.namespaceURI === bender.NS &&
            did_load_element.hasOwnProperty(node.localName)) {
          did_load_element[node.localName](node, prototype);
        }
        return k.get_thunk();
      }
      return load_async.get_thunk(ch, prototype,
          function() { return load_child.get_thunk(ch.nextElementSibling); });
    }
    return load_child.get_thunk(node.firstElementChild);
  };

  // A component was loaded: setup the relationship with the parent and app,
  // and send a loaded event (delayed for inline components)
  var loaded_component = function(prototype, parent)
  {
    prototype.parent = parent;
    if (prototype.id) parent.components[prototype.id] = prototype.uri;
    prototype.app.uri_map[prototype.uri] = prototype;
    if (prototype.uri_) {
      prototype.app.uri_map[prototype.uri_] = prototype;
      delete prototype.uri_;
    }
    setTimeout(function() { bender.notify(parent, "@bender-load"); }, 0);
  };

  // Include an external component from an href value
  var include_href = function(href, prototype)
  {
    var uri = href.replace(/#.*$/, "");
    if (uri in prototype.app.loaded_uris) return true;
    load_uri(uri, prototype.app.dest_body, function(prototype_) {
        prototype.app.loaded_uris[uri] = true;
        loaded_component(prototype_, prototype);
      }, prototype.app);
    return false;
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
        // If this is node the root node, then it is an inline component
        // definition
        if (node !== prototype.root_node) {
          var prototype_ = bender.create_component(node, prototype.dest_body,
              prototype.app);
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

    // Store the help node in the component prototype
    help: function(node, prototype)
    {
      prototype.metadata.help = node;
      return true;
    },

    // Include an external component. Do not load an URI that has already been
    // loaded
    include: function(node, prototype)
    {
      return include_href(prototype.get_absolute_uri(node.getAttribute("href")),
          prototype);
    },

    // Script may defer loading: if there is an href attribute, then pause
    // loading of the document until the script has been run, since later
    // scripts may depend on this one.
    // Local scripts (children of controller nodes) are skipped and only
    // executed when rendering.
    script: function(node, prototype)
    {
      if (is_bender_node(node.parentNode, "controller")) {
        // Set the local scripts flag, so that we know to create a specific
        // prototype for this controller
        node.parentNode.local_scripts = true;
        return true;
      }
      var uri = prototype.get_absolute_uri(node.getAttribute("href"));
      var content = uri ? "" : node.textContent;
      var elem = prototype.dest_body.ownerDocument.createElement("script");
      if (uri) {
        elem.onload = function() { bender.notify(prototype, "@bender-load"); };
        elem.onerror = function(e) {
          bender.notify(prototype, "@bender-error", e);
        };
        elem.setAttribute("src", uri);
      } else {
        elem.textContent = content;
      }
      find_body(prototype.dest_body.ownerDocument).appendChild(elem);
      return !uri;
    },

    // We don't wait for stylesheets to load; we'll let the host application
    // handle that.
    stylesheet: function(node, prototype)
    {
      var uri = prototype.get_absolute_uri(node.getAttribute("href"));
      var elem = uri ?
        flexo.elem(prototype.dest_body.namespaceURI, "link",
            { rel: "stylesheet", type: "text/css", href: uri }) :
        flexo.elem(prototype.dest_body.namespaceURI, "style", {},
            node.textContent);
      find_head(prototype.dest_body.ownerDocument).appendChild(elem);
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
      if (prototype.view_node) throw "Redefinition of view";
      prototype.view_node = node;
      return true;
    },

    // Prepare the watch nodes
    watch: function(node, prototype)
    {
      var w = { node: node, hash: flexo.hash("watch"), children: [], get: [],
        set: [], parent: prototype };
      if (is_bender_node(node.parentNode, "watch")) {
        var p = prototype.watches[prototype.watches.length - 1];
        w.parent = p.node === node.parentNode ? p : p.parent;
        w.parent.children.push(w);
      }
      prototype.watches.push(w);
      return true;
    },

    get: function(node, prototype)
    {
      var p = prototype.watches[prototype.watches.length - 1];
      if (p) p.get.push(node);
      return true;
    },

    set: function(node, prototype)
    {
      var p = prototype.watches[prototype.watches.length - 1];
      if (p) p.set.push(node);
      return true;
    },

  };

  var did_load_element =
  {
    // Setup the default view and main controller nodes if they haven't
    // been explicitely set
    app: function(node, prototype)
    {
      if (!prototype.view_node) prototype.view_node = node;
      set_parameters_from_attributes(node, prototype);
    },

    // Definition nodes behave like app
    component: function(node, prototype)
    {
      if (node._is_definition) did_load_element.app(node, prototype);
    }
  };

  // Return the body element (for HTML documents) or by default the
  // documentElement (for SVG or generic documents)
  var find_body = function(doc) { return doc.body || doc.documentElement; };

  // Return the head element (for HTML documents) or by default the
  // documentElement (for SVG or generic documents)
  var find_head = function(doc) { return doc.head || doc.documentElement; };

  // Render the different elements; this means creating component objects,
  // controller delegates, and DOM nodes for concrete nodes.
  // The node argument is the current node in the XML definition; the instance
  // argument is the current component instance.
  // We may want to skip rendering, e.g. for inline component definitions, so
  // we check the result of will_render_element() calls to see if we should
  // proceed with the contents of the current node or not.
  var render_component = function(node, instance)
  {
    if (node.namespaceURI === bender.NS &&
        will_render_element.hasOwnProperty(node.localName)) {
      if (!will_render_element[node.localName](node, instance)) return;
    }
    for (var ch = node.firstElementChild; ch; ch = ch.nextElementSibling) {
      render_component(ch, instance);
    }
    if (node.namespaceURI === bender.NS &&
        did_render_element.hasOwnProperty(node.localName)) {
      did_render_element[node.localName](node, instance);
    }
  };

  var will_render_element =
  {
    // Create new component instances for references; don't do rendering for
    // definitions
    component: function(node, instance)
    {
      if (node._is_definition && node !== instance.root_node) {
        return false;
      } else if (!node._is_definition) {
        var uri = instance.get_uri_for_node(node);
        if (!uri) {
          var href = node.getAttribute("href");
          if (href) throw "Could not get URI for href=\"{0}\"".fmt(href);
          throw "Could not get URI for ref=\"{0}\""
            .fmt(node.getAttribute("ref"));
        }
        var prototype = instance.app.uri_map[uri];
        if (!prototype) throw "No prototype for component at URI {0}".fmt(uri);
        var id = node.getAttribute("id");
        if (typeof node._instances !== "object") node._instances = [];
        var instance_ = prototype.instantiate_and_render(id);
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
        flexo.remove_children(instance.dest_body);
        render_metadata(instance);
        render_content(instance.view_node, instance.dest_body, instance);
      }
    },

    // Make sure that a component has a default controller
    component: function(node, instance)
    {
      if (!instance.controllers[""]) {
        did_render_element.controller(node, instance, true);
      }
    },

    // Create new delegates for controllers.
    controller: function(node, instance, skip_id)
    {
      var prototype = node_prototype(node, bender.controller);
      var delegate = bender.create_controller(node, instance, prototype);
      var id = !skip_id && node.getAttribute("id") || "";
      if (instance.controllers[id]) {
        throw "Redefinition of {0}controller{1}"
          .fmt(id ? "main " : "", id ? " " + id : "");
      }
      instance.controllers[id] = delegate;
    }
  };


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
      p = typeof p === "object" && derefs[i] in p ? p[derefs[i]] : "";
    }
    if (!p) bender.warn("No prototype found for \"{0}\"".fmt(name));
    return p || default_prototype;
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
      source = instance.find(view, "views");
      if (!source) bender.warn("No source view for \"{0}\"".fmt(view));
    } else if (controller) {
      source = instance.find(controller, "controllers");
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

})(typeof exports === "object" ? exports : this.bender = {});
