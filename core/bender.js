// Bender core library

if (typeof require === "function") flexo = require("./flexo.js");

(function(bender) {

  bender.VERSION = "0.2.0";

  // Bender's namespaces
  bender.NS = "http://bender.igel.co.jp";
  bender.NS_B = bender.NS + "/b";
  bender.NS_E = bender.NS + "/e";
  bender.NS_F = bender.NS + "/f";

  // Warning (at development time, throw an error)
  // TODO depending on debug level: ignore, log, die
  bender.warn = function(msg) { throw msg; };


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
      e.source[e.type].forEach(function(x) {
          if (x.handlEvent) {
            // used to be x.handleEvent.call(x, e), but that seems unnecessary
            x.handleEvent(e);
          } else {
            x(e);
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


  // Get the arguments from the query string
  // Default arguments are:
  //   * app: required; path to the app to run
  //   * path: default path (../)
  //   * suffix: default suffix (.xml)
  //   * dest: id of the destination element for rendering; document if none
  //   * debug: debug level (0, 1, etc.)
  bender.get_args = function()
  {
    var args = { dest: "dest-body", debug: 0, path: "../", suffix: ".xml" };
    window.location.search.substring(1).split("&").forEach(function(q) {
        var sep = q.indexOf("=");
        args[q.substr(0, sep)] = q.substr(sep + 1);
      });
    args.debug = Math.max(parseInt(args.debug, 10), 0);
    args.dest = document.getElementById(args.dest);
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
        var app = prototype.instantiate_and_render(prototype.root_node);
        app.args = args;
        connect(app);
        if (f) f(app);
        bender.notify(app.controllers[""], "@ready");
      });
  };

  // Base prototype for app and component objects
  // Fields:
  //   * instance_id: unique id
  //   * children: list of child components
  //   * controllers: map of id to controllers, the main controller has no id
  //       (i.e. main controller is component.controllers[""])
  //   * views: map of id of view nodes to instances and concrete DOM nodes
  bender.component =
  {
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

    // Find an id in the id map designated by map_name (e.g., "components",
    // "views" or "controllers")
    find: function(id, map_name)
    {
      if (!id) return;
      return id in this[map_name] ? this[map_name][id] :
        this.parent ? this.parent.find(id, map_name) : undefined;
    },

    // Get an URI for a component node, looking up its href or ref attribute
    get_uri_for_node: function(node)
    {
      return node.hasAttribute("href") ?
        this.get_absolute_uri(node.getAttribute("href")) :
        this.find(node.getAttribute("ref"), "components");
    },

    // Instantiate a new component from this prototype
    instantiate: function()
    {
      var instance = flexo.create_object(this);
      instance.instance_id = flexo.random_id(6);
      instance.children = [];
      instance.controllers = {};
      instance.views = {};
      return instance;
    },

    // Render the component to a new instance in the destination element
    instantiate_and_render: function()
    {
      var instance = this.instantiate();
      render_component(instance.root_node, instance);
      return instance;
    }

  };

  // Setup the object for a new component (before loading)
  bender.create_component = function(node, dest_body, app)
  {
    var c = flexo.create_object(bender.component);
    c.app = app || c;         // the current app
    c.bindings = [];          // should be {}, indexed by values
    c.dest_body = dest_body;  // body element for rendering
    c.components = {};        // map ids to loaded component prototypes
    c.metadata = {};          // component metadata
    c.root_node = node;       // root node of the component
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
    c.node = node;
    c.component = instance;
    c.outlets = {};
    c.init();
    set_parameters_from_attributes(node, c);
    return c;
  };

  // Set parameters on the object o frome the e/f/b attributes of the node
  var set_parameters_from_attributes = function(node, o)
  {
    [].forEach.call(node.attributes, function(attr) {
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
      });
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
    var req = new XMLHttpRequest();
    req.open("GET", uri);
    req.onreadystatechange = function()
    {
      if (req.readyState === 4) {
        if (req.status === 200 || req.status === 0) {
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
        } else {
          throw "load_uri() failed to get {0}: {1}".fmt(uri, req.status);
        }
      }
    };
    req.send("");
  };

  // Load the current node--there might be nothing to do, loading may be
  // immediate, or there might be a delay in which case the tree traversal
  // stops until a loaded event resumes it. Only handle loading; we'll
  // render and connect components later
  var load_async = function(node, prototype, k)
  {
    if (!node) return k.get_thunk();
    if (node.namespaceURI === bender.NS &&
        node.localName in will_load_element) {
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
            node.localName in did_load_element) {
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
    // Store the bind node for later (rendering)
    bind: function(node, prototype)
    {
      prototype.bindings.push(node);
      return true;
    },

    // At the loading stage, treat <component href="..."> in the same manner as
    // <include href="..."> (instantation will differ though.) For component
    // definitions, update the URI of the prototype.
    // Also flag definition nodes so that we can distinguish them from
    // instanciation nodes easily
    component: function(node, prototype)
    {
      if (node.hasAttribute("href")) {
        return will_load_element.include(node, prototype);
      } else if (!node.hasAttribute("ref")) {
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

    // Script may defer loading: if there is an href attribute, then pause
    // loading of the document until the script has been run, since later
    // scripts may depend on this one.
    // Local scripts (children of controller nodes) are skipped and only
    // executed when rendering.
    script: function(node, prototype)
    {
      if (is_controller_node(node.parentNode)) {
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
    }
  };

  var did_load_element =
  {
    // Setup the default view and main controller nodes if they haven't
    // been explicitely set
    app: function(node, prototype)
    {
      if (!prototype.view_node) prototype.view_node = node;
      if (!prototype.main_controller_node) {
        prototype.main_controller_node = node;
      }
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

  // Return true for <controller> nodes
  var is_controller_node = function(node)
  {
    return node.namespaceURI === bender.NS && node.localName === "controller";
  };

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
        node.localName in will_render_element) {
      if (!will_render_element[node.localName](node, instance)) return;
    }
    for (var ch = node.firstElementChild; ch; ch = ch.nextElementSibling) {
      render_component(ch, instance);
    }
    if (node.namespaceURI === bender.NS &&
        node.localName in did_render_element) {
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
        var prototype = instance.app.uri_map[uri];
        if (!prototype) throw "No prototype for component at URI {0}".fmt(uri);
        node._instance = prototype.instantiate_and_render();
        node._instance.parent = instance;
        instance.children.push(node._instance);
        var id = node.getAttribute("id");
        if (id) {
          instance.views[id] = node._instance;
          node._instance.instance_id += "--" + id;
        }
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
      if (is_controller_node(p)) {
        var prototype = node_prototype(p, bender.controller);
        (new Function("$_", node.textContent))(prototype);
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

    component: function(node, instance)
    {
      if (!node._is_definition) {
        if (!instance.controllers[""]) {
          did_render_element.controller(node, instance);
        }
      }
    },

    // Create new delegates for controllers.
    controller: function(node, instance)
    {
      var prototype = node_prototype(node, bender.controller);
      var delegate = bender.create_controller(node, instance, prototype);
      var id = node.getAttribute("id") || "";
      if (instance.controllers[id]) {
        throw "Redefinition of {0}controller{1}"
          .fmt(id ? "main " : "", id ? " " + id : "");
      }
      if (id) instance.main_controller_node = node;
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
      node.__prototype = node.local_scripts ? flexo.create_object(prototype) :
        prototype;
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
      app.dest_body.insertBefore(title, app.dest_body.firstChild);
    }
    if (app.metadata.title) {
      title.textContent = app.metadata.title.textContent;
    } else {
      title.textContent = "Bender";
    }
    // TODO render language attribute rather than language metadata property
    if (app.metadata.language) {
      var e = app.dest_body.ownerDocument.documentElement;
      if (e.namespaceURI && !e.hasAttribute("lang")) {
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

  var find_content = function(node, id)
  {
    if (!node) return;
    for (var ch = node.firstElementChild; ch; ch = ch.nextElementSibling) {
      if (ch.namespaceURI === bender.NS && ch.localName === "content" &&
          ch.getAttribute("ref") === id) return ch;
    }
  }

  var render_view =
  {

    // Render the view of the component; keep track of the component node so
    // that the <content> element can access it
    component: function(node, target, instance)
    {
      if (node._instance) {
        node._instance.__component = node;
        set_parameters_from_attributes(node, node._instance);
        render_content(node._instance.view_node, target, node._instance);
        delete node._instance.__component;
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
          var content = find_content(instance.parent.__component, id);
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
        return node.localName in render_view ?
          render_view[node.localName](node, target, instance) : undefined;
      }
      var target = instance.app.dest_body.ownerDocument.
        createElementNS(node.namespaceURI, node.localName);
      var id = node.getAttribute("id");
      if (id) {
        if (instance.views[id]) throw "Redefinition of id {0}".fmt(id);
        instance.views[id] = target;
      }
      [].forEach.call(node.attributes, function(attr) {
          if (attr.namespaceURI === flexo.XML_NS && !target.namespaceURI) {
            target.setAttribute(attr.localName, attr.nodeValue);
          } else {
            target.setAttributeNS(attr.namespaceURI, attr.localName,
              attr.nodeValue);
          }
        });
      render_content(node, target, instance);
      return target;
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
    if (node.childNodes) return [].slice.call(node.childNodes);
    var children = [];
    for (var ch = node.firstElementChild; ch; ch = ch.nextElementSibling) {
      children.push(ch);
    }
    if (children.length === 0 && node.textContent) return node.textContent;
    return children;
  };


  // Establish connections between outlets and nodes, as well as Bender and DOM
  // event listeners
  var connect = function(instance)
  {
    instance.children.forEach(connect);
    for (var id in instance.controllers) {
      var controller = instance.controllers[id];
      for (var ch = controller.node.firstElementChild; ch;
          ch = ch.nextElementSibling) {
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "listen") {
            // <listen> node
            var view = ch.getAttribute("view");
            var controller_ = ch.getAttribute("controller");
            var source = view ? instance.find(view, "views") :
              controller_ ? instance.find(controller_, "controllers") :
              undefined;
            if (view && !source) throw "No source view for {0}".fmt(view);
            if (controller_ && !source) {
              throw "No source controller for {0}".fmt(controller_);
            }
            var once = ch.getAttribute("once") === "true";
            var ev = ch.getAttribute("event");
            var h = ch.getAttribute("handler");
            var handler;
            if (h) {
              handler = controller[h].bind(controller);
            } else {
              h = ch.textContent;
              handler = (h ? new Function("event", h) : controller.handleEvent)
                .bind(controller);
            }
            if (ev) {
              if (!source) source = controller;
            } else {
              ev = ch.getAttribute("dom-event");
              if (!ev) throw "Listen with no event or dom-event attribute";
              if (!source) source = instance.dest_body.ownerDocument;
            }
            bender.listen(source, ev, handler, once);
          } else if (ch.localName === "connect") {
            // <connect> node
            var view = ch.getAttribute("view");
            var controller_ = ch.getAttribute("controller");
            if (view && controller_) throw "Ambiguous target for outlet";
            var outlet = ch.getAttribute("outlet") || view || controller_;
            if (!outlet) throw "No outlet for connect element";
            if (outlet in controller.outlets) {
              throw "Outlet {0} already exists".fmt(outlet);
            }
            controller.outlets[outlet] = view ? instance.find(view, "views") :
              instance.find(controller_, "controller");
          }
        }
      }
      bind(instance);
      bender.notify(controller, "@rendered");
    }
  };

  // Implement the bindings by changing the plain values to properties with
  // getter/setter
  var bind = function(instance)
  {
    instance.bindings.forEach(function(b) {
      var value = b.getAttribute("value");
      var view = instance.find(b.getAttribute("view"), "views");
      var v = instance[value];
      instance.__defineGetter__(value, function() { return v; });
      instance.__defineSetter__(value, function(v_) {
          v = v_;
          view.textContent = v_;
        });
      instance[value] = v;
    });
}

})(typeof exports === "object" ? exports : this.bender = {});
