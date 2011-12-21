// Bender core library


if (typeof require === "function") flexo = require("./flexo.js");

(function(bender) {

  bender.VERSION = "0.3.0";

  // Bender's namespaces
  bender.NS = "http://bender.igel.co.jp";  // Bender elements
  bender.NS_B = bender.NS + "/b";          // boolean variables
  bender.NS_E = bender.NS + "/e";          // scalar (string) variables
  bender.NS_F = bender.NS + "/f";          // float variables


  // Create a new context document for Bender with a <context> root element.
  // The URI is set to the target URI by default, unless an URI parameter is
  // passed, which is solved against the target URI if relative (used when
  // loading a file.)
  bender.create_context = function(target, uri)
  {
    if (!target) target = document;
    if (!uri) {
      uri = target.baseURI;
    } else {
      uri = flexo.absolute_uri(target.baseURI, uri);
    }
    var context = target.implementation.createDocument(bender.NS, "context",
      null);

    // createElement in context will create Bender elements by default
    // (otherwise just use createElementNS with a different namespace)
    // we add an extra uri parameter to set the base URI as well
    var super_createElementNS = context.createElementNS;
    context.createElement = function(name) {
      return wrap_element(super_createElementNS.call(this, bender.NS, name),
          this.uri);
    };
    context.createElementNS = function(nsuri, qname) {
      return wrap_element(super_createElementNS.call(this, nsuri, qname),
          this.uri);
    };

    // Check that there are no components left to load. If there are any do
    // nothing, othrwise send a @loaded event on befalf of the given node
    // (normally the original component being loaded.)
    context.check_loaded = function(node)
    {
      for (var i in this.loaded) {
        if (this.loaded.hasOwnProperty(i) && !this.loaded[i]) return node;
      }
      setTimeout(function() { bender.notify(node, "@loaded"); }, 0);
      return node;
    };

    // Import a node into the current context; if there is no outstanding
    // loading to be performed, send a @loaded notification
    context.import = function(node, uri)
    {
      return this.check_loaded(import_node(this.documentElement, node, false,
            uri || this.uri));
    };

    // Load a component at the given URI.
    context.load_component = function(uri, f)
    {
      var u = uri.split("#");
      if (!(this.loaded.hasOwnProperty(u[0]))) {
        this.loaded[u[0]] = false;
        flexo.request_uri(uri, (function(req) {
            this.loaded[u[0]] = true;
            var component = context.import(req.responseXML.documentElement,
              u[0]);
          }).bind(this));
      }
    };

    // Render global elements in the head of the target
    context.render_head = function(head, force)
    {
      this.stylesheets.forEach(function(stylesheet) {
          if (force) {
            safe_remove(stylesheet.target);
            delete stylesheet.target;
          }
          if (!stylesheet.target) {
            var ns = head.namespaceURI;
            if (stylesheet.href) {
              stylesheet.target = ns ?
                head.ownerDocument.createElementNS(ns, "link") :
                head.ownerDocument.createElement("link");
              stylesheet.target.setAttribute("rel", "stylesheet");
              stylesheet.target.setAttribute("href", stylesheet.href);
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
    var u = uri.split(/[#?]/);
    wrap_element(context.documentElement, u[0]);
    context.uri = u[0];
    context.loaded = {};
    context.loaded[context.uri] = true;
    context.definitions = {};
    context.stylesheets = [];
    return context;
  };

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
    "import": false,
    set: true,
    script: true,
    stylesheet: true,
    title: true,
    use: true,
    view: true,
    watch: false
  };

  // Overloading functions for Bender nodes
  var prototypes = {

    "": {
      addEventListener: function(type, listener, useCapture)
      {
        bender.log("+ add event listener {0} {1}".fmt(this.hash, type));
        if (type.substr(0, 1) === "@") {
          bender.listen(this, type, listener);
        } else {
          this.super_addEventListener(type, listener, useCapture);
        }
      },

      appendChild: function(ch) { return this.insertBefore(ch, null); },

      insertBefore: function(ch, ref)
      {
        ch.parent_component = this.uses ? this : this.parent_component;
        if (ch.nodeType === 1) {
          var indent = "";
          for (var p = this, indent = ""; p; p = p.parentNode, indent += "  ");
          bender.log("{0}+ {1}: {2}".fmt(indent, ch.hash,
                ch.parent_component ? ch.parent_component.hash : "(none)"));
        }
        if (ch.add_to_parent) ch.add_to_parent(this);
        var ch_ = this.super_insertBefore(ch, ref);
        this.update_view();
        return ch_;
      },

      removeChild: function(ch)
      {
        if (ch.remove_from_parent) ch.remove_from_parent(this);
        delete ch.parent_component;
        return this.super_removeChild(ch);
      },

      removeEventListener: function(type, listener, useCapture)
      {
        if (type.substr(0, 1) === "@") {
          bender.unlisten(this, type, listener);
        } else {
          this.super_removeEventListener(type, listener, useCapture);
        }
      },

      setAttribute: function(name, value)
      {
        return this.super_setAttribute(name, value);
      },

      setAttributeNS: function(ns, qname, value)
      {
        if (ns === bender.NS_E) {
          this[property_name(qname)] = value;
        } else if (ns === bender.NS_F) {
          this[property_name(qname)] = parseFloat(value);
        } else if (ns === bender.NS_B) {
          this[property_name(qname)] = flexo.is_true(value);
        }
        return this.super_setAttributeNS(ns, qname, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_view();
      },

      update_view: function()
      {
        if (this.parent_component) this.parent_component.update_view();
      },

      init: function() {},
    },

    // <component> element: a component definition (note that <app> is
    // synonymous with <component>)
    component: {
      init: function()
      {
        this.components = [];  // child components
        this.uses = [];        // child uses
        this.scripts = [];     // child scripts
        this.watches = [];     // child watches
        this.instances = {};   // instances of this component
      },

      add_to_parent: function(parent)
      {
        if (this.parent_component) this.parent_component.components.push(this);
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.uses, this);
        if (this.parent_component) {
          this.parent_component
            .remove_from_array(this.parent_component.components, this);
        }
      },

      setAttribute: function(name, value)
      {
        if (name === "id") {
          var id = flexo.normalize(value);
          if (this.id && this.id !== id) {
            delete this.ownerDocument.definitions[this.uri + "#" + this.id];
          }
          this.id = id;
          this.ownerDocument.definitions[this.uri + "#" + id] = this;
          bender.log("+++ New component: {0}: {1}".fmt(this.uri + "#" + id,
                this.hash));
        }
        return this.super_setAttribute(name, value);
      },

      instantiate: function()
      {
        var instance = flexo.create_object(component);
        flexo.hash(instance, "instance");
        this.instances[instance.hash] = instance;
        instance.node = this;
        instance.views = {};
        instance.uses = {};
        this.scripts.forEach(function(script) {
            (new Function("prototype", script.textContent))(instance);
          });
        this.uses.forEach(function(u) {
            if (u.href) {
              var component = u.ownerDocument.definitions[u.href];
              if (component) {
                var ch_instance = component.instantiate();
                var id = u.getAttribute("id");
                if (id) instance.uses[flexo.undash(id)] = ch_instance;
                set_properties(ch_instance, u);
              } else {
                bender.warn("No component for href=\"{0}\"".fmt(u.href));
              }
            }
          });
        return instance;
      },

      update_title: function()
      {
        for (h in this.hashes) this.hashes[h].render_title();
      },

      update_view: function()
      {
        for (h in this.hashes) this.hashes[h].render();
      }
    },

    // <desc> element; not really used for anything at the moment
    desc:
    {
      add_to_parent: function(parent)
      {
        if (parent.desc) {
          bender.warn("Redefinition of desc in {0}".fmt(parent.hash));
        }
        parent.desc = this;
      },

      remove_from_parent: function(parent)
      {
        if (parent.desc === this) delete parent.desc;
      }
    },

    // <import> element
    // Load a file at the given href and import its components in the parent
    // component
    "import":
    {
      add_to_parent: function()
      {
        this._import(this.getAttribute("href"));
      },

      setAttribute: function(name, value)
      {
        if (name === "href") this._import(value);
        return this.super_setAttribute(name, value);
      },

      _import: function(href)
      {
        var p = this.parent_component;
        if (p && href) {
          this.href = flexo.absolute_uri(p.uri, flexo.normalize(href));
          var u = this.href.split("#");
          var context = this.ownerDocument;
          if (!(context.loaded.hasOwnProperty(u[0]))) {
            context.loaded[u[0]] = false;
            flexo.request_uri(u[0], function(req) {
                context.loaded[u[0]] = true;
                var c = context.import(req.responseXML.documentElement);
                if (p) {
                  c.addEventListener("@loaded", function() {
                      context.check_loaded(p);
                    }, false);
                }
              });
          }
        }
      },
    },

    // <script> element
    script:
    {
      add_to_parent: function(parent)
      {
        if (parent.scripts) parent.scripts.push(this);
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.scripts, this);
      }
    },

    // <stylesheet> element
    stylesheet:
    {
      add_to_parent: function()
      {
        this.ownerDocument.stylesheets.push(this);
        this.update_href(this.getAttribute("href"));
      },

      setAttribute: function(name, value)
      {
        if (name === "href") this.update_href(value);
        return this.super_setAttribute(name, value);
      },

      remove_from_parent: function()
      {
        flexo.remove_from_array(this.ownerDocument.stylesheets, this);
        if (this.target) {
          safe_remove(this.target);
          delete this.target;
        }
      },

      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if ((ch.nodeType === 3 || ch.nodeType === 4) && this.target &&
            !this.getAttribute("href")) {
          this.target.textContent = this.textContent;
        }
        return ch_;
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        if (this.target && !this.href) this.target.textContent = text;
      },

      update_href: function(href)
      {
        if (this.parent_component && href) {
          this.href = flexo.absolute_uri(this.parent_component.uri,
              flexo.normalize(href));
          bender.log("Stylesheet: {0} {1} -> {2}".fmt(this.parent_component.uri,
                href, this.href));
          if (this.target) this.target.href = this.href;
        }
      }
    },

    // <title> element
    title:
    {
      add_to_parent: function(parent)
      {
        if (parent.title) {
          bender.warn("Redefinition of title in {0}".fmt(parent.hash));
        }
        parent.title = this;
        parent.update_title();
      },

      remove_from_parent: function(parent)
      {
        if (parent.title === this) delete parent.title;
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        if (this.parentNode && this.parentNode.update_title) {
          this.parentNode.update_title();
        }
      }
    },

    // <use> element: a component instance, can appear inside a view or another
    // component.
    use:
    {
      add_to_parent: function(parent)
      {
        if (parent.uses) parent.uses.push(this);
        this.set_uri(this.getAttribute("href"));
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.uses, this);
      },

      setAttribute: function(name, value)
      {
        if (name === "href") this.set_uri(value);
        return this.super_setAttribute(name, value);
      },

      set_uri: function(href)
      {
        var p = this.parent_component;
        if (p && href) {
          href = flexo.normalize(href);
          this.href = flexo.absolute_uri(p.uri, href);
          bender.log("{0} href={1} ({2})".fmt(this.hash, this.href, href));
          var u = this.href.split("#");
          var context = this.ownerDocument;
          if (!(context.loaded.hasOwnProperty(u[0]))) {
            context.loaded[u[0]] = false;
            var p = this.parent_component;
            flexo.request_uri(u[0], function(req) {
                context.loaded[u[0]] = true;
                bender.log("Import component from URI={0}".fmt(u[0]));
                var c = context.import(req.responseXML.documentElement, u[0]);
                if (p) {
                  c.addEventListener("@loaded", function() {
                      context.check_loaded(p);
                    }, false);
                }
              });
          }
        }
      },
    },

    // <view> element
    view:
    {
      add_to_parent: function(parent)
      {
        if (parent.view) {
          bender.warn("Redefinition of view in {0}".fmt(parent.hash));
        }
        parent.view = this;
      },

      remove_from_parent: function(parent)
      {
        if (parent.view === this) delete parent.view;
      }
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

      add_to_parent: function(parent)
      {
        if (parent.watches) {
          // Parent is a component: this is a topmost watch, active by default
          parent.watches.push(this);
          if (!(this.hasOwnProperty("active"))) this.active = true;
          this.component = parent;
        } else if (parent.nested) {
          // Parent is a watch: this is a nested watch
          parent.nested.push(this);
          this.watch = parent;
          this.active = false;
        }
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.watches, this) ||
          flexo.remove_from_array(parent.nested, this);
      },

      setAttribute: function(name, value)
      {
        if (name === "active") {
          this.active = flexo.is_true(value);
        } else if (name === "once") {
          this.once = flexo.is_true(value);
        } else if (name === "all") {
          this.all = flexo.is_true(value);
        }
        return this.super_setAttribute(name, value);
      },

      got: function(instance, get, value, prev)
      {
        if (this.active) {
          this.sets.forEach((function(set) {
              set.got(instance, get, value, prev);
            }).bind(this));
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
      add_to_parent: function(parent)
      {
        if (parent.gets) {
          parent.gets.push(this);
          this.watch = parent;
        }
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.gets, this);
      },

      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this.update_text();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "delay-ms") {
          var delay = parseFloat(value);
          if (delay >= 0) {
            var watch = this.watch;
            var get = this;
            this.watch_instance = function(instance) {
              setTimeout(function() { watch.got(instance, get); }, delay);
            };
          }
        } else if (name === "property") {
          this.watch_instance = function(instance) {
            var prop_name = property_name(flexo.normalize(value));
            this.watched_property = prop_name;
            var property = instance.node[prop_name];
            var watch = this.watch;
            var transform = this.transform;
            var get = this;
            flexo.getter_setter(instance, prop_name,
                function() { return property; },
                function(v) {
                  var v_ = transform.call(instance, get, v, property);
                  if (v_ !== undefined) {
                    var prev = property;
                    property = v_;
                    watch.got(instance, get, v_, prev);
                  }
                });
          };
        } else if (name === "dom-event" || name === "event") {
          var event_type = flexo.normalize(value);
          var dom_event = name === "dom-event";
          this.watch_instance = function(instance) {
            var source;
            if (this.source_view) {
              source = instance.views[this.source_view];
            } else if (this.source_instance) {
              source = instance.uses[this.source_instance];
            }
            if (!source) {
              source = dom_event ? instance.target.ownerDocument : instance;
            }
            var watch = this.watch;
            var transform = this.transform;
            var h = (function(e) {
              var v = transform.call(instance, this, e);
              if (v !== undefined) watch.got(instance, this, v);
            }).bind(this);
            if (typeof source.addEventListener === "function") {
              source.addEventListener(event_type, h, false);
            } else {
              bender.listen(source, event_type, h);
            }
          };
        } else if (name === "view") {
          this.source_view = flexo.undash(flexo.normalize(value));
        } else if (name === "instance") {
          this.source_instance = flexo.undash(flexo.normalize(value));
        }
        return this.super_setAttribute(name, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_text();
      },

      transform: function(_, v) { return v; },

      update_text: function()
      {
        var text = this.textContent;
        if (/\S/.test(text)) {
          try {
            this.transform = new Function("get", "value", "previous_value",
                text);
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
      add_to_parent: function(parent)
      {
        if (parent.sets) {
          parent.sets.push(this);
          this.watch = parent;
        }
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.sets, this);
      },

      insertBefore: function(ch, ref)
      {
        var ch_ = this.super_insertBefore(ch, ref);
        if (ch.nodeType === 3 || ch.nodeType === 4) this.update_text();
        return ch_;
      },

      setAttribute: function(name, value)
      {
        if (name === "attr") {
          this.attr = flexo.normalize(value);
        } else if (name === "property") {
          this.property = property_name(flexo.normalize(value));
        } else if (name === "view") {
          this.view = flexo.undash(flexo.normalize(value));
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
            this.transform = new Function("get", "value", "previous_value",
                text);
          } catch (e) {
            bender.warn(e);
          }
        }
      },

      got: function(instance, get, v, prev)
      {
        if (prev === undefined && this.property) prev = instance[this.property];
        var v_ = this.transform.call(instance, get, v, prev);
        if (this.view) {
          if (this.attr) {
            instance.views[this.view].setAttribute(this.attr, v_);
          } else {
            instance.views[this.view].textContent = v_;
          }
        } else if (this.property) {
          instance[this.property] = v_;
        }
      },

      transform: function(_, v) { return v; },
    },
  };

  // Component prototype for new instances
  var component = {
    render: function(target, main, use)
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
        if (context.main && context.main !== this) context.main.is_main = false;
        context.main = this;
        this.is_main = true;
        this.render_title();
      }
      var self = this;
      (function render(source, dest) {
        for (var ch = source.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 1) {
            if (ch.namespaceURI === bender.NS) {
              if (ch.localName === "use" && ch.href) {
                var component = ch.ownerDocument.definitions[ch.href];
                if (component) {
                  var instance = component.instantiate();
                  var id = flexo.normalize(ch.getAttribute("id") || "");
                  if (id) self.views[flexo.undash(id)] = instance;
                  instance.render(dest, false, ch);
                  set_properties(instance, ch);
                } else {
                  bender.warn("No component for href=\"{0}\"".fmt(ch.href));
                }
              } else if (ch.localName === "content") {
                render(use.childNodes.length > 0 ? use : ch, dest);
              }
            } else {
              var once =
                flexo.is_true(ch.getAttributeNS(bender.NS, "render-once"));
              var d = undefined;
              var reuse = flexo
                .normalize(ch.getAttributeNS(bender.NS, "reuse"));
              if (reuse.toLowerCase() === "any") {
                d = find_first_element(dest.ownerDocument.documentElement,
                    ch.namespaceURI, ch.localName);
              }
              if (!d) {
                d = dest.ownerDocument.createElementNS(ch.namespaceURI,
                    ch.localName);
              }
              for (var i = ch.attributes.length - 1; i >= 0; --i) {
                var attr = ch.attributes[i];
                if ((attr.namespaceURI === flexo.XML_NS || !attr.namespaceURI)
                  && attr.localName === "id") {
                  self.views[flexo.undash(flexo.normalize(attr.nodeValue))] = d;
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

  // Return the head element (for HTML documents) or by default the
  // documentElement (for SVG or generic documents)
  var find_head = function(doc) { return doc.head || doc.documentElement; };

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

  // Import a node from a document (e.g., as obtained by a FileReader or
  // XMLHttpRequest) into a Bender context. Parent is the parent in the Bender
  // tree, node is the current node to be imported, and in_view is a flag set
  // once we enter the scope of a view element so that we keep foreign nodes
  // (they are discarded otherwise.)
  function import_node(parent, node, in_view, uri)
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
      if (n.uses) n.uri = uri;
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
        import_node(n, ch, in_view, uri);
      }
      return n;
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      if (in_view || can_has_text_content[parent.localName]) {
        var n = parent.ownerDocument.importNode(node, false);
        parent.appendChild(n);
      }
    }
  }

  // Check whether the node is in the Bender namespace and has the requested
  // local name
  var is_bender_node = function(node, localname)
  {
    return node.namespaceURI === bender.NS && node.localName === localname;
  };

  // Transform an XML name into the actual property name (undash and prefix with
  // $, so that for instance "rate-ms" will become $rateMs.)
  var property_name = function(name) { return "$" + flexo.undash(name); };

  // Safe removal of a node; do nothing if the node did not exist or had no
  // parent
  var safe_remove = function(node)
  {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  };

  // Set properties on an instance from the attributes of a node (in the b, e,
  // and f namespaces)
  var set_properties = function(instance, node)
  {
    for (var i = node.attributes.length - 1; i >= 0; --i) {
      var attr = node.attributes[i];
      if (attr.namespaceURI === bender.NS_E) {
        instance[property_name(attr.localName)] = attr.nodeValue;
      } else if (attr.namespaceURI === bender.NS_F) {
        instance[property_name(attr.localName)] = parseFloat(attr.nodeValue);
      } else if (attr.namespaceURI === bender.NS_B) {
        instance[property_name(attr.localName)] = flexo.is_true(attr.nodeValue);
      }
    }
  };

  // Wrap a Bender node with its specific functions.
  function wrap_element(e, uri)
  {
    var name = e.localName === "app" ? "component" : e.localName;
    if (name === "component") e.uri = uri;
    flexo.hash(e, e.localName);
    var proto = prototypes[name] || {};
    for (var p in prototypes[""]) {
      e["super_" + p] = e[p];
      e[p] = proto.hasOwnProperty(p) ? proto[p] : prototypes[""][p];
    }
    for (var p in proto) if (!e.hasOwnProperty(p)) e[p] = proto[p];
    e.init();
    return e;
  }


  // Can be called as notify(e), notify(source, type) or notify(source, type, e
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
      e.source[e.type].forEach(function(listener) {
          if (typeof listener.handleEvent === "function") {
            listener.handleEvent.call(listener, e);
          } else {
            listener(e);
          }
        });
    }
  };

  // Listen to a Bender event
  bender.listen = function(target, type, listener)
  {
    if (!(target.hasOwnProperty(type))) target[type] = [];
    target[type].push(listener);
  };

  // Stop listening (using removeEventListener when available, just like
  // bender.listen)
  bender.unlisten = function(target, type, listener)
  {
    var i = target[type].indexOf(listener);
    if (i >= 0) target[type].splice(i, 1);
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

})(typeof exports === "object" ? exports : this.bender = {});
