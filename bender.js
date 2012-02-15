// Bender core library

if (typeof require === "function") flexo = require("flexo");

(function(bender) {

  bender.VERSION = "0.3.2";

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
    // nothing, otherwise send a @loaded event on befalf of the given node
    // (normally the original component being loaded.)
    context.check_loaded = function(node)
    {
      for (var i in this.loaded) {
        if (this.loaded.hasOwnProperty(i) && !this.loaded[i]) return node;
      }
      setTimeout(function() { flexo.notify(node, "@loaded"); }, 0);
      return node;
    };

    // Import a node into the current context; if there is no outstanding
    // loading to be performed, send a @loaded notification
    context["import"] = function(node, uri)
    {
      return this.check_loaded(import_node(this.documentElement, node, false,
            uri || this.uri));
    };

    // Load a component at the given URI.
    // TODO where is this used?
    context.load_component = function(uri, f)
    {
      var u = uri.split("#");
      if (!(this.loaded.hasOwnProperty(u[0]))) {
        this.loaded[u[0]] = false;
        flexo.request_uri(uri, (function(req) {
            this.loaded[u[0]] = true;
            var component = context["import"](req.responseXML.documentElement,
              u[0]);
          }).bind(this));
      }
    };

    // Render global elements in the head of the target
    context.render_head = function(head, force)
    {
      this.stylesheets.forEach(function(stylesheet) {
          if (force) {
            flexo.safe_remove(stylesheet.target);
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
    context.gets = {};
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
          flexo.listen(this, type, listener);
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
          flexo.unlisten(this, type, listener);
        } else {
          this.super_removeEventListener(type, listener, useCapture);
        }
      },

      setAttribute: function(name, value)
      {
        var m = value.match(/\{\{([\w-]+)\}\}/);
        if (m) {
          if (!this.bindings) this.bindings = {};
          value = value.replace(/\{\{[\w-]+\}\}/, "{0}");
          this.bindings[name] = [m[1], value, true];
          // Don't set the attribute
          return;
        } else if (m = value.match(/\{([\w-]+)\}/)) {
          if (!this.bindings) this.bindings = {};
          value = value.replace(/\{[\w-]+\}/, "{0}");
          this.bindings[name] = [m[1], value];
        }
        return this.super_setAttribute(name, value);
      },

      setAttributeNS: function(ns, qname, value)
      {
        set_property(this, ns, qname, value);
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
    component:
    {
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
        instance.sets = [];
        instance.child_instances = [];
        instance.watch_instances = [];
        instance.watched_attributes = {};
        instance.watched_properties = {};
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

      // TODO "deactivate" after load
      // TODO error handling?
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
                var c = context["import"](req.responseXML.documentElement);
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
    // TODO href attribute
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
          flexo.safe_remove(this.target);
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
      init: function()
      {
        this.on = {};
      },

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
        if (name === "href") {
          this.set_uri(value);
        } else if (name.indexOf("on-") === 0) {
          this.on["@" + name.substr(3)] = value;
        }
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
                var c = context["import"](req.responseXML.documentElement, u[0]);
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
        this.gets = [];    // get child elements (inputs)
        this.sets = [];    // set child elements (outputs)
        this.nested = [];  // watch child elements
      },

      add_to_parent: function(parent)
      {
        if (parent.watches) {
          // Top-level watch
          parent.watches.push(this);
          this.component = parent;
        } else if (parent.nested) {
          // Parent is a watch: this is a nested watch
          parent.nested.push(this);
          this.watch = parent;
        }
      },

      remove_from_parent: function(parent)
      {
        flexo.remove_from_array(parent.watches, this) ||
          flexo.remove_from_array(parent.nested, this);
      },

      setAttribute: function(name, value)
      {
        if (name === "id") this.id = flexo.normalize(value);
        return this.super_setAttribute(name, value);
      },

      instantiate: function(component_instance)
      {
        var instance = flexo.create_object(watch_instance);
        flexo.hash(instance, "watch_instance");
        instance.node = this;
        instance.component_instance = component_instance;
        instance.enabled = !!this.component;  // top-level watches are enabled

        var context = this.ownerDocument;
        this.gets.forEach(function(get) {
            var target =
              get.dom_event ? (get.view ? component_instance.views[get.view] :
                component_instance.target.ownerDocument) :
              get.view ? component_instance.views[get.view] :
              get.use ? component_instance.uses[get.use] : component_instance;
            var h = function(e) {
              bender.log("get handler for {0} on".fmt(instance.hash),
                target.hash || target);
              if (instance.enabled) {
                var value = get.dom_event || get.event ? e : e.value;
                var v = get.transform.call(component_instance, value, e.prev,
                  target);
                if (v !== undefined) {
                  instance.got(v, e.prev, target, get.disable);
                } else {
                  bender.log("  cancelled (undefined value)");
                }
              }
            };
            if (get.dom_event) {
              target.addEventListener(get.dom_event, h, false);
            } else if (get.event) {
              flexo.listen(target, get.event, h);
            } else if (get.attr) {
              var ev = "@{0}@{1}".fmt(target.hash, get.attr);
              if (!target.watched_attributes) target.watched_attributes = {};
              if (!target.watched_attributes.hasOwnProperty(get.attr)) {
                bender.log("get attr: {0} for".fmt(ev), get);
                var super_setAttribute = target.setAttribute;
                target.setAttribute = function(name, value) {
                  var prev = this.getAttribute(name);
                  var attr = super_setAttribute.call(this, name, value);
                  if (name === get.attr) {
                    flexo.notify(this, ev, { value: value, prev: prev });
                  }
                };
                target.watched_attributes[get.attr] = true;
              }
              bender.log("{0}: listen to {1}".fmt(target.hash, ev));
              flexo.listen(target, ev, h);
            } else if (get.property) {
              var ev = "@{0}.{1}".fmt(target.hash, get.property);
              if (!target.watched_properties.hasOwnProperty(get.property)) {
                bender.log("get event: {0} for".fmt(ev), get);
                var value = target[get.property];
                flexo.getter_setter(target, get.property,
                    function() { return value; },
                    function(v) {
                      var prev = value;
                      value = v;
                      flexo.notify(this, ev, { value: v, prev: prev });
                    });
                target.watched_properties[get.property] = true;
              }
              bender.log("{0}: listen to {1}".fmt(target.hash, ev));
              flexo.listen(target, ev, h);
            }
        });

        // Instantiate nested watches
        instance.children = this.nested.map(function(watch) {
            var wi = watch.instantiate(component_instance);
            wi.parent = instance;
            return wi;
          }, this);

        return instance;
      },
    },

    // <get> element
    get:
    {
      init: function()
      {
        this.params = { value: "value", previous_value: "previous_value",
          target: "target" };
      },

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
        if (name === "attr") {
          this.attr = flexo.normalize(value);
        } else if (name === "dom-event") {
          this.dom_event = flexo.normalize(value);
        } else if (name === "event") {
          this.event = flexo.normalize(value);
        } if (name === "property") {
          this.property = property_name(flexo.normalize(value));
          bender.log("get: property={0}".fmt(this.property), this);
        } else if (name === "view") {
          this.view = flexo.undash(flexo.normalize(value));
        } else if (name === "use") {
          this.use = flexo.undash(flexo.normalize(value));
        } else if (name === "value" || name === "previous_value" ||
            name === "target") {
          this.params[name] = flexo.undash(flexo.normalize(value));
        } else if (name === "disable") {
          this.disable = flexo.is_true(value);
        }
        this.super_setAttribute(name, value);
      },

      set_text_content: function(text)
      {
        this.textContent = text;
        this.update_text();
      },

      transform: function(v) { return v; },

      update_text: function()
      {
        var text = this.textContent;
        if (/\S/.test(text)) {
          try {
            this.transform = new Function(this.params.value,
                this.params.previous_value, this.params.target, text);
          } catch (e) {
            bender.warn(e);
          }
        }
      },
    },

    // <set> element
    //   view="v": set the view.textContent property to the view v
    set:
    {
      init: function()
      {
        this.params = { value: "value", previous_value: "previous_value",
          target: "target" };
      },

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
        } else if (name === "css-property") {
          this.css = flexo.undash(flexo.normalize(value));
        } else if (name === "property") {
          this.property = flexo.normalize(value);
        } else if (name === "view") {
          this.view = flexo.undash(flexo.normalize(value));
        } else if (name === "use") {
          this.use = flexo.undash(flexo.normalize(value));
        } else if (name === "value" || name === "previous_value" ||
            name === "target") {
          this.params[name] = flexo.normalize(value);
        }
        return this.super_setAttribute(name, value);
      },

      setAttributeNS: function(ns, qname, value)
      {
        if (qname === "return") {
          if (ns === bender.NS_E) {
            this.transform = function(v) { return value.fmt(v); };
          } else if (ns === bender.NS_F) {
            this.transform = function() { return parseFloat(value); };
          } else if (ns === bender.NS_B) {
            this.transform = function() { return flexo.is_true(value); };
          }
        }
        return this.super_setAttributeNS(ns, qname, value);
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
            this.transform = new Function(this.params.value,
                this.params.previous_value, this.params.target, text);
          } catch (e) {
            bender.warn(e);
          }
        }
      },

      got: function(watch_instance, value, prev, target)
      {
        var instance = watch_instance.component_instance;
        if (prev === undefined && this.property) prev = instance[this.property];
        var v_ = this.transform.call(instance, value, prev, target);
        if (this.view) {
          if (this.attr) {
            if (v_ === null) {
              instance.views[this.view].removeAttribute(this.attr);
            } else {
              instance.views[this.view].setAttribute(this.attr, v_);
            }
          } else if (this.css) {
            instance.views[this.view].style[this.css] = v_;
          } else if (this.property) {
            instance.views[this.view][this.property] = v_;
          } else {
            instance.views[this.view].textContent = v_;
          }
        } else if (this.property) {
          instance[property_name(this.property)] = v_;
        }
      },

      transform: function(value) { return value; }
    },
  };

  // Watch instance associated with components
  var watch_instance =
  {
    got: function(value, prev, target, disable)
    {
      // TODO check activation status for loops
      this.node.sets.forEach(function(set) {
          set.got(this, value, prev, target);
        }, this);
      this.children.forEach(function(w) { w.enabled = true; });
      if (disable) {
        // Disable this watch, as well as its siblings if it is nested
        if (this.parent) {
          this.parent.children.forEach(function(w) { w.enabled = false; });
        } else {
          this.enabled = false;
        }
      }
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
  };

  // Component prototype for new instances
  var component =
  {
    init_properties: function()
    {
      this.child_instances.forEach(function(ch) { ch.init_properties(); });
      set_properties(this, this.node, this.parent_use);
      this.sets.forEach((function(set) {
          var v = (new Function(set.set.textContent)).call(this);
          if (v !== undefined) set.dest.textContent += v;
        }).bind(this));
      flexo.notify(this, "@initialized");
    },

    render: function(target, main, use)
    {
      if (!this.target && !target) return;
      if (!this.node.view) return;
      if ((this.target && !target) || this.target === target) {
        flexo.remove_children(this.target);
      } else {
        this.target = target;
      }
      var context = this.node.ownerDocument;
      if (main) {
        context.render_head(find_head(this.target.ownerDocument));
        if (context.main && context.main !== this) context.main.is_main = false;
        context.main = this;
        this.is_main = true;
        this.render_title();
      }
      var self = this;
      var unsolved = [];
      (function render(parent_instance, source, dest) {
        for (var ch = source.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 1) {
            if (ch.namespaceURI === bender.NS) {
              if (ch.localName === "use" && ch.href) {
                var component = ch.ownerDocument.definitions[ch.href];
                if (component) {
                  var instance = component.instantiate();
                  instance.parent_use = ch;
                  bender.log("!!! New instance {0} < {1}".fmt(instance.hash,
                      parent_instance.hash));
                  parent_instance.child_instances.push(instance);
                  instance.parent_instance = parent_instance;
                  var id = flexo.normalize(ch.getAttribute("id") || "");
                  if (id) self.views[flexo.undash(id)] = instance;
                  instance.render(dest, false, ch);
                } else {
                  bender.warn("No component for href=\"{0}\"".fmt(ch.href));
                }
              } else if (ch.localName === "content") {
                render(parent_instance, use.childNodes.length > 0 ? use : ch,
                  dest);
              } else if (ch.localName === "set") {
                parent_instance.sets.push({ set: ch, dest: dest });
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
              if (ch.bindings) {
                unsolved.push(ch);
                if (!ch.id) ch.id = flexo.random_id(6, ch.ownerDocument);
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
                } else if (attr.localName.substr(0, 2) === "on") {
                  // Hijack "on" attributes
                  d.addEventListener(attr.localName.substr(2),
                      (new Function("event", attr.nodeValue))
                        .bind(parent_instance), false);
                } else {
                  d.setAttribute(attr.localName, attr.nodeValue);
                }
              }
              dest.appendChild(d);
              render(parent_instance, ch, d);
            }
          } else if (ch.nodeType === 3 || ch.nodeType === 4) {
            dest.appendChild(dest.ownerDocument
              .createTextNode(ch.textContent));
          }
        }
      })(this, this.node.view, this.target);

      // Setup the watches

      // Setup watch nodes for on-event attributes
      // TODO maybe this is overkill? Let's keep the simple listener here
      if (this.parent_use) {
        for (var e in this.parent_use.on) {
          if (this.parent_use.on.hasOwnProperty(e)) {
            var on = this.parent_use.on[e];
            bender.log("*** on {0}: {1}".fmt(e, on));
            flexo.listen(this, e, new Function("event", on)
                .bind(this.parent_instance));
          }
        }
      }

      // Check for bindings
      unsolved.forEach(function(node) {
          if (node.bindings) {
            for (var attr in node.bindings) {
              if (node.bindings.hasOwnProperty(attr)) {
                var w = context.createElement("watch");
                var g = context.createElement("get");
                var s = context.createElement("set");
                g.setAttribute("property", node.bindings[attr][0]);
                w.appendChild(g);
                s.setAttribute("view", node.id);
                if (node.bindings[attr][2]) {
                  s.setAttribute("property", attr);
                } else {
                  s.setAttribute("attr", attr);
                }
                if (node.bindings[attr][1] !== "{0}") {
                  s.set_text_content("return \"{0}\".fmt(value);"
                    .fmt(node.bindings[attr][1]));
                }
                w.appendChild(s);
                self.node.appendChild(w);
              }
            }
            bender.log("Solved bindings for", node, self.node);
            delete node.bindings;
          }
        });

      bender.log("Watches to instantiate: {0}".fmt(this.node.watches.length));
      this.node.watch_instances = this.node.watches.map(function(watch) {
          return watch.instantiate(this);
        }, this);

      flexo.notify(this, "@rendered");
      return this.target;
    },

    render_title: function()
    {
      if (this.target && this.is_main && this.node.title) {
        find_title(this.target.ownerDocument).textContent =
          this.node.title.textContent;
      }
    },

    // Make an XMLHttpRequest; send Bender events while the request is being
    // made and when the result is obtained.
    xhr: function(uri, params)
    {
      if (typeof params !== "object") params = {};
      if (!params.hasOwnProperty("method")) params.method = "GET";
      if (!params.hasOwnProperty("data")) params.data = "";
      var req = new XMLHttpRequest();
      req._uri = uri;
      req.open(params.method, uri);
      if (params.responseType) req.responseType = params.responseType;
      req.onreadystatechange = (function()
      {
        flexo.notify(this, "@xhr-readystatechange", req);
        if (req.readyState === 4) {
          if (req.status >= 200 && req.status < 300) {
            flexo.notify(this, "@xhr-success", req);
          } else {
            flexo.notify(this, "@xhr-error", req);
          }
        }
      }).bind(this);
      req.send(params.data);
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

  // Set properties on an instance from the attributes of a node (in the b, e,
  // and f namespaces)
  function set_properties(instance, node, use)
  {
    bender.log("set_properties for {0}".fmt(instance.hash));
    for (var i = node.attributes.length - 1; i >= 0; --i) {
      var attr = node.attributes[i];
      var value = use && use.hasAttributeNS(attr.namespaceURI, attr.localName) ?
        use.getAttributeNS(attr.namespaceURI, attr.localName) : attr.nodeValue;
      set_property(instance, attr.namespaceURI, attr.localName, value);
    }
  }

  // Set one property
  function set_property(instance, ns, localname, value)
  {
    if (ns === bender.NS_E) {
      bender.log("set_property {0} to \"{1}\"".fmt(property_name(localname),
            value));
      instance[property_name(localname)] = value;
    } else if (ns === bender.NS_F) {
      bender.log("set_property {0} to {1} (float)".fmt(property_name(localname),
            parseFloat(value)));
      instance[property_name(localname)] = parseFloat(value);
    } else if (ns === bender.NS_B) {
      bender.log("set_property {0} to {1} (bool)".fmt(property_name(localname),
            flexo.is_true(value)));
      instance[property_name(localname)] = flexo.is_true(value);
    }
  }

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
