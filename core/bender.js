// Bender core library


if (typeof require === "function") flexo = require("./flexo.js");

(function(bender) {

  bender.VERSION = "0.3.0";

  // Bender's namespaces
  bender.NS = "http://bender.igel.co.jp";  // Bender elements
  bender.NS_B = bender.NS + "/b";          // boolean variables
  bender.NS_E = bender.NS + "/e";          // scalar (string) variables
  bender.NS_F = bender.NS + "/f";          // float variables


  // Create a new context document for Bender with a <context> root element
  bender.create_context = function(target)
  {
    if (!target) target = document;
    var context = target.implementation.createDocument(bender.NS, "context",
      null);

    // createElement in context will create Bender elements by default
    // (otherwise just use createElementNS with a different namespace)
    var super_createElementNS = context.createElementNS;
    context.createElement = function(name) {
      return wrap_element(super_createElementNS.call(this, bender.NS, name));
    };
    context.createElementNS = function(nsuri, qname) {
      var e = super_createElementNS.call(this, nsuri, qname);
      if (nsuri === bender.NS) wrap_element(e);
      return e;
    };

    // Render global elements in the head of the target
    context.render_head = function(head, force)
    {
      this.stylesheets.forEach(function(stylesheet) {
          if (force) delete stylesheet.target;
          if (!stylesheet.target) {
            var ns = head.namespaceURI;
            var href = stylesheet.getAttribute("href");
            if (href) {
              stylesheet.target = ns ?
                head.ownerDocument.createElementNS(ns, "link") :
                head.ownerDocument.createElement("link");
              stylesheet.target.setAttribute("rel", "stylesheet");
              stylesheet.target.setAttribute("href", href);
            } else {
              stylesheet.target = ns ?
                head.ownerDocument.createElementNS(ns, "style") :
                head.ownerDocument.createElement("style");
              stylesheet.target.textContent = stylesheet.textContent;
            }
            head.appendChild(stylesheet.target);
          }
        });
    };

    // Unfortunately it doesn't seem that we can set the baseURI of the new
    // document, so we have to have a different property
    wrap_element(context.documentElement);
    context.documentElement.uri = target.baseURI;

    context.uri = target.baseURI;
    context.components = {};
    context.stylesheets = [];
    context.import = import_node.bind(context, context.documentElement);
    return context;
  };

  // Import a node from a document (e.g., as obtained by a FileReader or
  // XMLHttpRequest) into a Bender context. Parent is the parent in the Bender
  // tree, node is the current node to be imported, and in_view is a flag set
  // once we enter the scope of a view element so that we keep foreign nodes
  // (they are discarded otherwise.)
  function import_node(parent, node, in_view)
  {
    if (node.nodeType === 1) {
      if (node.namespaceURI !== bender.NS) {
        if (!in_view) return;
      } else {
        if (!can_has_text_content.hasOwnProperty(node.localName)) {
          bender.warn("Unknown bender element {0}".fmt(node.localName));
          return;
        }
        if (node.localName === "view") in_view = true;
      }
      var n = parent.ownerDocument
        .createElementNS(node.namespaceURI, node.localName);
      parent.appendChild(n);
      for (var i = 0, m = node.attributes.length; i < m; ++i) {
        var attr = node.attributes[i];
        if (attr.namespaceURI) {
          if (attr.namespaceURI === flexo.XMLNS_NS &&
              attr.localName !== "xmlns") {
            n.setAttribute("xmlns:{0}".fmt(attr.localName), attr.nodeValue);
          } else {
            n.setAttributeNS(attr.namespaceURI, attr.localName, attr.nodeValue);
          }
        } else {
          n.setAttribute(attr.localName, attr.nodeValue);
        }
      }
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        import_node(n, ch, in_view);
      }
      return n;
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      if (in_view || can_has_text_content[parent.localName]) {
        var n = parent.ownerDocument.importNode(node, false);
        parent.appendChild(n);
      }
    }
  }

  // If the value is true then nodes with that name (in the Bender namespace)
  // allow text content, otherwise it is simply discarded and only element
  // nodes are kept
  var can_has_text_content =
  {
    app: false,
    component: false,
    content: true,
    desc: true,
    get: true,
    // include: false,
    "local-script": true,
    // script: true,
    set: true,
    stylesheet: true,
    title: true,
    view: true,
    watch: false
  };

  // Wrap a Bender node with its specific functions, and keep track of nodes
  // with global scope (stylesheet for now; later: script, include)
  function wrap_element(e)
  {
    var name = e.localName === "app" ? "component" : e.localName;
    flexo.hash(e, e.localName);
    var proto = prototypes[name] || {};
    for (var p in prototypes[""]) {
      e["super_" + p] = e[p];
      e[p] = proto.hasOwnProperty(p) ? proto[p] : prototypes[""][p];
    }
    for (var p in proto) if (!e.hasOwnProperty(p)) e[p] = proto[p];
    if (e.localName === "stylesheet") e.ownerDocument.stylesheets.push(e);
    e.uri = e.ownerDocument.uri;
    e.init();
    return e;
  }

  // Overloading functions for Bender nodes
  var prototypes = {

    "": {
      appendChild: function(ch) { return this.insertBefore(ch, null); },

      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        this.update_view();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        return this.super_setAttribute(name, value);
      },

      setAttributeNS: function(ns, qname, value)
      {
        return this.super_setAttributeNS(ns, qname, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_view();
      },

      update_view: function()
      {
        var component = get_view_parent(this);
        if (component) component.update_view();
      },

      init: function() {},
    },

    // <component> element
    component: {
      init: function()
      {
        this.instances = {};
        this.watches = [];
        this.scripts = [];
      },

      insertBefore: function(ch, ref)
      {
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "desc") {
            if (this.desc) {
              bender.warn("Redefinition of desc in {0}".fmt(this.hash));
            }
            this.desc = ch;
          } else if (ch.localName === "local-script") {
            ch.component = this;
            this.scripts.push(ch);
          } else if (ch.localName === "title") {
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
          } else if (ch.localName === "watch") {
            this.watches.push(ch);
            // topmost watches are active by default, whereas nested watches
            // are inactive by default
            if (!(ch.hasOwnProperty("active"))) ch.active = true;
            ch.component = this;
          }
        }
        return this.super_insertBefore(ch, ref);
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
        return this.super_setAttribute(name, value);
      },

      setAttributeNS: function(ns, qname, value)
      {
        if (ns === bender.NS_E) {
          this[property_name(qname)] = value;
          flexo.log("* set property {0} to {1} for {2}"
              .fmt(property_name(qname), value, this.hash));
        } else if (ns === bender.NS_F) {
          this[property_name(qname)] = parseFloat(value);
          flexo.log("* set float property {0} to {1} for {2}"
              .fmt(property_name(qname), this[property_name(qname)], this.hash));
        } else if (ns === bender.NS_B) {
          this[property_name(qname)] = is_true(value);
          flexo.log("* set boolean property {0} to {1} for {2}"
              .fmt(property_name(qname), this[property_name(qname)], this.hash));
        }
        return this.super_setAttributeNS(ns, qname, value);
      },

      instantiate: function()
      {
        var instance = flexo.create_object(component);
        this.scripts.forEach(function(script) {
            (new Function("prototype", script.textContent))(instance);
          });
        flexo.hash(instance, "instance");
        instance.node = this;
        instance.views = {};
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
    },

    // <stylesheet> element
    stylesheet:
    {
      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if ((ch.nodeType === 3 || ch.nodeType === 4) && this.target &&
            !this.getAttribute("href")) {
          this.target.textContent = this.textContent;
        }
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "href" && this.target) {
          this.target.href = value;
        }
        return this.super_setAttribute(name, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        if (this.target && !this.getAttribute("href")) {
          this.target.textContent = text;
        }
      }
    },

    title:
    {
      set_text_content: function(text)
      {
        this.textContent = text;
        if (this.parentNode && this.parentNode.update_title) {
          this.parentNode.update_title();
        }
      },
    },

    // <watch> element
    watch:
    {
      init: function()
      {
        this.gets = [];            // get child elements (inputs)
        this.sets = [];            // set child elements (outputs)
        this.nested = [];  // watch child elements
      },

      insertBefore: function(ch, ref)
      {
        if (ch.namespaceURI === bender.NS) {
          if (ch.localName === "get") {
            this.gets.push(ch);
            ch.watch = this;
          } else if (ch.localName === "set") {
            this.sets.push(ch);
            ch.watch = this;
          } else if (ch.localName === "watch") {
            this.nested.push(ch);
            ch.watch = this;
            ch.active = false;
          }
        }
        return this.super_insertBefore(ch, ref);
      },

      setAttribute: function(name, value)
      {
        if (name === "active") {
          this.active = is_true(value);
        } else if (name === "once") {
          this.once = is_true(value);
        } else if (name === "all") {
          this.all = is_true(value);
        }
        return this.super_setAttribute(name, value);
      },

      got: function(get, instance, value, prev)
      {
        if (this.active) {
          this.sets.forEach(function(set) { set.got(instance, value, prev); });
          this.nested.forEach(function(w) { w.active = true; });
          if (this.once) {
            // Make this watch inactive, as well as its siblings if it is a
            // nested watch
            this.active = false;
            if (this.parentNode &&
                this.parentNode.hasOwnProperty("nested")) {
              this.parentNode.nested.forEach(function(w) { w.active = false; });
            }
          }
        } else {
          flexo.log("got ({0}, {1}) for {2} but watch is not active."
              .fmt(value, prev, instance.hash));
        }
      },

      // Watch the given instance
      watch_instance: function(instance)
      {
        this.gets.forEach(function(get) { get.watch_instance(instance); });
        this.nested.forEach(function(w) { w.watch_instance(instance); });
      },

      // Initialize the watched properties for the given instance
      init_properties: function(instance)
      {
        this.gets.forEach(function(get) {
          if (get.watched_property) {
            instance[get.watched_property] = instance[get.watched_property];
          }
        });
      }
    },

    // <get> element
    //   property="p": watch property "p" in the instance
    //   event="e": watch event of type e, by default from the instance
    //   dom-event="e": watch DOM event of type e, by default from the document
    //   view="v": element with id="v" in the view is the source
    //   component="c": sub-component with the id="c" is the source (TODO)
    //   text content: transform the value for the set elements
    get:
    {
      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this.update_text();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "property") {
          this.watch_instance = function(instance) {
            var prop_name = property_name(flexo.normalize(value));
            this.watched_property = prop_name;
            var property = instance.node[prop_name];
            var watch = this.watch;
            var transform = this.transform;
            flexo.getter_setter(instance, prop_name,
                function() { return property; },
                function(v) {
                  var v_ = transform.call(instance, v, property);
                  flexo.log("? set {0}/{1} to {2} ({3}) (from {4})"
                    .fmt(instance.hash, prop_name, v, v_, property))
                  if (v_ !== undefined) {
                    var prev = property;
                    property = v_;
                    watch.got(this, instance, v_, prev);
                  }
                });
            flexo.log("* watching {0}/{1} (init value from {2}: {3})"
                .fmt(instance.hash, prop_name, instance.node.hash, property));
          };
        } else if (name === "dom-event" || name === "event") {
          var event_type = flexo.normalize(value);
          this.watch_instance = function(instance) {
            var source;
            if (this.source_view) {
              source = instance.views[this.source_view];
            } else if (this.source_component) {
              source = instance.views[this.source_component];
            }
            if (!source) {
              source = name === "dom-event" ?
                instance.target.ownerDocument : instance;
            }
            var watch = this.watch;
            var transform = this.transform;
            bender.listen(source, event_type, function(e) {
                var v = transform.call(instance, e);
                if (v !== undefined) watch.got(this, instance, v);
              });
            flexo.log("* watching {0}/{1}"
                .fmt(instance.hash, event_type));
          };
        } else if (name === "view") {
          this.source_view = flexo.normalize(value);
        } else if (name === "component") {
          this.source_component = flexo.normalize(value);
        }
        return this.super_setAttribute(name, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_text();
      },

      transform: function(value) { return value; },

      update_text: function()
      {
        var text = this.textContent;
        if (/\S/.test(text)) {
          try {
            this.transform = new Function("value", "previous_value", text);
          } catch (e) {
            bender.warn(e);
          }
        }
      },

      watch_instance: function() {},
    },

    // <set> element
    //   view="v": set the view.textContent property to the view v
    set:
    {
      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this.update_text();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "attr") {
          this.attr = value;
        } else if (name === "view") {
          this.got = function(instance, v, prev) {
            var v_ = this.transform.call(instance, v, prev);
            if (this.attr) {
              instance.views[value].setAttribute(this.attr, v_);
            } else {
              instance.views[value].textContent = v_;
            }
          };
        }
        return this.super_setAttribute(name, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_text();
      },

      update_text: function()
      {
        var text = this.textContent;
        if (/\S/.test(text)) {
          try {
            this.transform = new Function("value", "previous_value", text);
          } catch (e) {
            bender.warn(e);
          }
        }
      },

      got: function(instance, v, prev)
      {
        return this.transform.call(instance, v, prev);
      },

      transform: function(v) { return v; },
    },
  };

  // Component prototype for new instances
  var component = {
    render: function(target, main, component)
    {
      if (!this.target && !target) return;
      if (!this.node.view) return;
      if ((this.target && !target) || this.target === target) {
        flexo.remove_children(this.target);
      } else {
        this.target = target;
      }
      if (main) {
        var context = this.node.ownerDocument;
        context.render_head(find_head(this.target.ownerDocument));
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
                if (def) {
                  var instance = def.instantiate();
                  var id = ch.getAttribute("id");
                  if (id) self.views[id] = instance;
                  instance.render(dest, false, ch);
                }
              } else if (ch.localName === "content") {
                render(component.childNodes.length > 0 ? component : ch, dest);
              }
            } else {
              var once = is_true(ch.getAttributeNS(bender.NS, "render-once"));
              var d = undefined;
              var reuse = flexo
                .normalize(ch.getAttributeNS(bender.NS, "reuse"));
              if (reuse.toLowerCase() === "any") {
                d = find_first_element(dest.ownerDocument.documentElement,
                    ch.namespaceURI, ch.localName);
                flexo.log("!reuse={0}".fmt(reuse));
              }
              if (!d) {
                d = dest.ownerDocument.createElementNS(ch.namespaceURI,
                    ch.localName);
              }
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
      this.node.watches.forEach(function(w) {
          w.watch_instance.call(w, self);
        });
      this.node.watches.forEach(function(w) {
          w.init_properties.call(w, self);
        });
      bender.notify(this, "@rendered");
      return this.target;
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

  var find_first_element = function(node, ns, name)
  {
    // Use depth-first search to find the first element in document order
    (function find(n) {
      if (n.namespaceURI === ns && n.localName === name) return n;
      for (var ch = n.firstElementChild; ch; ch = ch.nextElementSibling) {
        var found = find(ch);
        if (found) return found;
      }
    })(node);
  }

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

  // Get a true or false value from a string; true if the string matches "true"
  // in case-insensitive, whitespace-tolerating way
  var is_true = function(string)
  {
    return flexo.normalize(string).toLowerCase() === "true";
  };

  // Transform an XML name into the actual property name (undash and prefix with
  // $, so that for instance "rate-ms" will become $rateMs.)
  var property_name = function(name) { return "$" + flexo.undash(name); };

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
