// HTML runtime for Bender, based on the functional core.

// TODO
// [/] render-name
// [ ] link rel="component" (link rel="watch"? rel="view"?)

/* global console, flexo, window */

(function (bender) {
  "use strict";

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";
  bender.namespaces = {};  // Custom namespace URIs

  var urls = {};  // URL map for loaded resources

  var flags = {
    as_is: true,
    dynamic: true,
    dynamic_string: false,
    gets: true,
    needs_return: true,
    normalize_space: true,
    set_unfinished: true,
    store_as: true
  };

  // Load a component from an URL and return a promise which is fulfilled once
  // the component has been loaded and deserialized (which may lead to loading
  // additional components, for its prototype, and its children.) Origin is an
  // origin URL (i.e. the URL of a component that requires the loading of
  // another component) to check for dependency cycles.
  bender.load_component = function (url, origin) {
    url = flexo.normalize_uri(flexo.base_uri(window.document), url);
    if (origin && urls[origin]) {
      urls[origin].__prototype = url;
      for (var u = url; urls[u]; u = urls[u].__prototype) {
        if (u === origin) {
          throw "cycle in prototype chain for %0".fmt(url);
        }
      }
    }
    if (urls[url]) {
      return urls[url];
    }
    var response_;
    var promise = urls[url] = flexo.ez_xhr(url, {
      responseType: "document", mimeType: "text/xml"
    }).then(function (response) {
      response_ = response;
      return deserialize(response.documentElement);
    }).then(function (component) {
      if (component &&
        typeof component.url === "function" &&
        typeof component.finalize === "function") {
        return component.url(url).finalize();
      } else {
        throw { message: "not a Bender component", response: response_ };
      }
    });
    return promise;
  };

  // Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
  // than element, text and CDATA) are simply skipped, with a warning in the
  // case of unknown Bender elements (as it probably means that another
  // namespace was meant, or that a deprecated tag was used.)
  function deserialize(node) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        var f = deserialize[node.localName];
        if (typeof f === "function") {
          return f(node);
        } else {
          console.warn("Unknow element in Bender namespace: “%0” in %1"
              .fmt(node.localName, flexo.base_uri(node)));
        }
      } else if (node.namespaceURI in bender.namespaces) {
        return deserialize_custom(node);
      } else {
        return deserialize_foreign(node);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      if (!/\S/.test(node.textContent)) {
        for (var n = node.parentNode; n &&
            typeof n.hasAttributeNS === "function" &&
            !n.hasAttributeNS(flexo.ns.xml, "space"); n = n.parentNode) {}
        if (!(n && typeof n.getAttributeNS === "function" &&
            flexo.safe_trim(n.getAttributeNS(flexo.ns.xml, "space"))
              .toLowerCase() === "preserve")) {
          return;
        }
      }
      if (/\S/.test(node.textContent)) {
        return deserialize_text(node.textContent, node.parentNode &&
            node.parentNode.namespaceURI === bender.ns &&
            node.parentNode.localName === "text");
      }
    }
  }

  // Deserialize a text string, either from a text node or an element value.
  // If bindings were found in the string, set the parsed chunks as a temporary
  // __text property on the text element, unless the as_is flag is set (e.g.,
  // do not interpret text in <text> nodes.)
  function deserialize_text(content, as_is) {
    var text = bender.Text.create();
    var chunks = as_is ? content : chunk_string(content);
    if (typeof chunks === "string") {
      text.text(chunks);
    } else {
      text.__text = chunks;
    }
    return text;
  }

  // Deserialize a component from an element. If the component element has a
  // href attribute, first deserialize that component then use it as the
  // prototype for this component, otherwise create a new component. When the
  // component is deserialized, load its link and call the init handler.
  deserialize.component = function (elem) {
    return create_component(elem).then(load_links).then(function (component) {
      component.on("init").call(component);
      return component;
    });
  };

  // Create a new component for a <component> element, with or with prototype,
  // depending on the href attribute.
  function create_component(elem) {
    var base_uri = flexo.base_uri(elem);
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(base_uri, elem.getAttribute("href"));
      return bender.load_component(url, base_uri)
        .then(function (prototype) {
          return deserialize_component(elem, prototype.create(), base_uri);
        });
    } else {
      return deserialize_component(elem, bender.Component.create(), base_uri);
    }
  }

  // Deserialize the view element
  deserialize.view = function (elem) {
    return deserialize_children(bender.View.create()
        .render_name(elem.getAttribute("render-name")), elem);
  };

  // Deserialize the content element
  deserialize.content = function (elem) {
    return deserialize_children(bender.Content.create(), elem);
  };

  // Deserialize the attribute element
  deserialize.attribute = function (elem) {
    return deserialize_children(bender.Attribute
        .create(elem.getAttribute("ns"), elem.getAttribute("name")), elem);
  };

  // Deserialize the text element
  deserialize.text = function (elem) {
    return bender.Text.create().name(elem.getAttribute("name"))
      .text(shallow_text(elem));
  };

  // Return the concatenation of all text children (and only children) of elem.
  // Any other content (including child elements) is skipped.
  function shallow_text(elem, strict) {
    var text = "";
    var has_text = !strict;
    for (var ch = elem.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType === window.Node.TEXT_NODE ||
          ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        text += ch.textContent;
        has_text = true;
      }
    }
    return has_text && text;
  }

  // Load all links for a component.
  function load_links(component) {
    var links = [];
    for (var p = component; p.__links; p = Object.getPrototypeOf(p)) {
      flexo.unshift_all(links, p.__links);
    }
    return flexo.collect_promises(links.map(function (link) {
      return link.load();
    })).then(flexo.self.bind(component));
  }

  // Deserialize the contents of the component created
  function deserialize_component(elem, component, url) {
    delete component.__on_init;
    component.__links = [];
    component.watch(component.__init_watch = bender.InitWatch.create());
    component.__as = {};
    deserialize_component_attributes(elem, component, url);
    var view;
    flexo.foreach(elem.childNodes, function (ch) {
      if (ch.nodeType !== window.Node.ELEMENT_NODE ||
        ch.namespaceURI !== bender.ns) {
        return;
      }
      if (ch.localName === "view") {
        view = deserialize.view(ch);
      } else {
        var f = deserialize_component[ch.localName];
        if (typeof f === "function") {
          f(component, ch);
        } else {
          console.warn("Unknown component element: %0".fmt(ch.localName));
        }
      }
    });
    return view ?
      view.then(component.set_view.bind(component)) :
      new flexo.Promise().fulfill(component);
  }

  // Deserialize the attributes of the component element
  function deserialize_component_attributes(elem, component, url, custom) {
    component.url(url);
    flexo.foreach(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.indexOf("on-") === 0) {
          component.on(attr.localName.substr(3), attr.value);
        } else if (attr.localName === "name") {
          var name = flexo.safe_string(attr.value);
          if (name === "") {
            throw "Name cannot be empty.";
          } else if (name.toLowerCase() === "this") {
            throw "Name cannot be “this”.";
          }
          component.name(attr.value);
        } else if (attr.localName !== "href" || custom) {
          var set = parse_init_value(component, attr.localName, attr.value);
          if (set) {
            // TODO: bindings
          }
        }
      } else if (attr.namespaceURI === bender.ns) {
        component.properties[attr.localName] = attr.value;
      }
    });
  }

  // Link
  deserialize_component.link = function (component, elem) {
    if (!elem.hasAttribute("href")) {
      console.error("Link with no href attribute");
      return;
    }
    component.__links.push(bender.Link.create(elem.getAttribute("rel"),
          flexo.normalize_uri(component.url(), elem.getAttribute("href"))));
  };

  // Inline style is like a link
  deserialize_component.style = function (component, elem) {
    component.__links.push(bender.Style.create(elem));
  };

  // Inline script is like a link
  deserialize_component.script = function (component, elem) {
    component.__links.push(bender.Script.create(elem));
  };

  // Component title
  deserialize_component.title = function (component, elem) {
    return component.title(shallow_text(elem));
  };

  // Deserialize a property element in a component, remembering the as attribute
  // as well as the initial value added as a SetProperty on the InitWatch of the
  // component.
  deserialize_component.property = function (component, elem) {
    var name = elem.getAttribute("name");
    if (!name) {
      console.error("Property with no name");
      return;
    }
    var set = deserialize_adapter(elem, bender.SetProperty.create(name),
        flags.store_as);
    component.__as[name] = set.__as;
    delete set.__as;
    component.property(name).__init_watch.set(set);
  };

  // Deserialize a watch and its content for a component
  deserialize_component.watch = function (component, elem) {
    var watch = bender.Watch.create();
    flexo.foreach(elem.childNodes, function (ch) {
      if (ch.namespaceURI === bender.ns) {
        if (ch.localName === "get") {
          watch.get(deserialize_get(ch));
        } else if (ch.localName === "set") {
          watch.set(deserialize_set(ch));
        }
      }
    });
    return component.watch(watch);
  };

  // Deserialize a get element
  function deserialize_get(elem) {
    var get = elem.hasAttribute("event") ?
      bender.GetEvent.create(elem.getAttribute("event")) :
      bender.GetProperty.create(elem.getAttribute("property"));
    if (typeof get.prevent_default === "function") {
      get.prevent_default(flexo.is_true(elem.getAttribute("prevent-default")));
    }
    if (typeof get.stop_propagation === "function") {
      get
        .stop_propagation(flexo.is_true(elem.getAttribute("stop-propagation")));
    }
    return deserialize_adapter(elem, get);
  }

  // Deserialize a set element. The actual kind of set cannot be determined yet
  // as the target needs to be resolved first, so we make a first guess and may
  // need to revise it later.
  function deserialize_set(elem) {
    return deserialize_adapter(elem, elem.hasAttribute("event") ?
          bender.SetEvent.create(elem.getAttribute("event")) :
        elem.hasAttribute("property") ?
          bender.SetProperty.create(elem.getAttribute("property")) :
        elem.hasAttribute("attr") ?
          bender.SetAttribute.create(elem.getAttribute("ns"),
            elem.getAttribute("attr")) :
          bender.Set.create());
  }

  // Functions to parse a value depending on the `as` parameter.
  var parse_value = {
    boolean: flexo.is_true,
    dynamic: parse_value_dynamic,
    "dynamic-string": parse_value_dynamic_string,
    number: flexo.to_number,
    string: flexo.id
  };

  // Deserialize an adapter (get, set, property)
  function deserialize_adapter(elem, adapter, store_as) {
    var as = normalize_as(elem.getAttribute("as"));
    var value = elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem, true);
    if (value) {
      var parsed_value = parse_value[as](value, elem.hasAttribute("value"),
          adapter);
      // jshint -W041
      if (parsed_value != null) {
        adapter.value(flexo.funcify(parsed_value));
      }
    }
    if (elem.hasAttribute("match")) {
      var match = parse_match(elem.getAttribute("match"), adapter);
      if (typeof match === "function") {
        adapter.match(match);
      }
    }
    adapter.__select = flexo.safe_trim(elem.getAttribute("select"));
    if (store_as) {
      adapter.__as = as;
    }
    return adapter.delay(elem.getAttribute("delay"));
  }

  // Parse an initial value for a component.
  function parse_init_value(component, name, value, as) {
    for (var p = component; p && !as; as = p.__as[name], p = p.prototype) {}
    if (as) {
      var set = bender.SetProperty.create(name, component);
      var parsed_value = parse_value[as](value, true, set);
      // jshint -W041
      if (parsed_value != null) {
        set.value(flexo.funcify(parsed_value));
      }
      component.__init_watch.set(set);
      return set;
    }
  }

  // Normalize the `as` parameter to be one of dynamic (default), boolean,
  // number, or string.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as === "boolean" || as === "number" || as === "string" ||
      as === "dynamic-string" ? as : "dynamic";
  }

  // Parse a value string into chunks and set the dynamic/needs_return flags
  // (for match, these are always true.)
  function parse_value_chunks(value, needs_return, adapter, dynamic) {
    adapter.__value = chunk_string(value, dynamic);
    adapter.__dynamic = dynamic;
    adapter.__needs_return = needs_return;
  }

  // Parse a value string for a given adapter as “dynamic.”
  function parse_value_dynamic(value, needs_return, adapter) {
    return parse_value_chunks(value, needs_return, adapter, flags.dynamic);
  }

  // Parse a value string for a given adapter as “dynamic-string.”
  function parse_value_dynamic_string(value, needs_return, adapter) {
    return parse_value_chunks(value, needs_return, adapter,
        flags.dynamic_string);
  }

  // Parse a match string for a given adapter as “dynamic.” (There is no
  // “dynamic-string” for match.)
  function parse_match(value, adapter) {
    adapter.__match = chunk_string(value, flags.dynamic);
  }

  // Deserialize a foreign element and its contents (attributes and children),
  // creating a DOMElement node.
  function deserialize_foreign(elem) {
    var e = bender.DOMElement.create(elem.namespaceURI, elem.localName);
    for (var i = 0, n = elem.attributes.length; i < n; ++i) {
      var attr = elem.attributes[i];
      var ns = attr.namespaceURI || "";
      if (ns === "") {
        if (attr.localName === "name") {
          e.name(attr.value);
        } else {
          add_attribute(e, ns, attr.localName, attr.value);
        }
      } else {
        add_attribute(e, ns, attr.localName, attr.value);
      }
    }
    return deserialize_children(e, elem);
  }

  // Add an attribute to a foreign element by creating an attribute child
  // element with a text element with the value of the attribute as text.
  function add_attribute(elem, ns, name, value) {
    elem.insert_child(bender.Attribute.create(ns, name)
        .child(deserialize_text(value, !flags.as_is)));
  }

  // Deserialize then add every child of a parent node `parent` in the list of
  // children to the Bender element `elem`, then return `elem`.
  function deserialize_children(elem, parent) {
    return flexo.fold_promises(flexo.map(parent.childNodes, function (child) {
        return deserialize(child);
      }), flexo.call.bind(function (child) {
        return child &&
          this.child(child.hasOwnProperty("view") ? child.view : child) || this;
      }), elem);
  }

  // Deserialize a custom element by creating a component and adding the
  // contents to the view (no other customization is possible.)
  function deserialize_custom(elem) {
    var base_uri = flexo.base_uri(elem);
    var url = flexo.normalize_uri(base_uri,
      "%0/%1.xml".fmt(bender.namespaces[elem.namespaceURI], elem.localName));
    return bender.load_component(url, base_uri)
      .then(function (prototype) {
        return deserialize_children(bender.View.create(), elem)
          .then(function (view) {
            var component = prototype.create(view);
            deserialize_component_attributes(elem, component, url, true);
            return component;
          });
      });
  }


  // Finalize the component after loading is finished
  bender.Component.finalize = function () {
    this.children.forEach(function (child) {
      child.finalize();
    });
    delete this.__links;
    delete this.__init_watch;
    return this;
  };

  // Return the targets (with a static flag) for the given selector. At the
  // moment, only a single target is returned; in the future, there will be zero
  // or more.
  bender.Component.select = function (select) {
    select = flexo.safe_trim(select);
    var target;
    var static_ = false;
    var is_dom = false;
    if (select[0] === "@" || select[0] === "#") {
      target = this.names[select.substr(1)];
      static_ = select[0] === "#";
    } else if (select[0] === "^") {
      target = this.names[select.substr(1)];
      is_dom = !!target;
    } else if (select === ":document") {
      target = this.view.document_element();
    }
    return [[target || this, static_, is_dom]];
  };

  // Title is just a string (should be any foreign content later)
  flexo._accessor(bender.Component, "title", flexo.safe_trim);

  // While the scope is updated, also make the watches for text bindings
  (function () {
    var $super = bender.Component.update_scope;
    bender.Component.update_scope = function (node) {
      $super.call(this, node);
      if (node.__text) {
        var watch = bender.Watch.create();
        node.view.component.watch(watch);
        gets_for_chunks(node.__text).forEach(watch.get.bind(watch));
        watch.set(bender.SetNodeProperty.create("text", node));
        watch.__text = node.__text;
        delete node.__text;
      }
    };
  }());


  // render-name attribute for <view>: use the name of the component on the
  // first rendered element.

  flexo._accessor(bender.View, "render_name", function (render_name) {
      render_name = flexo.safe_trim(render_name).toLowerCase();
      return render_name === "class" || render_name === "id" ? render_name :
        "none";
    });

  (function () {
    var $super = bender.View.render;
    bender.View.render = function (target, stack, i) {
      $super.call(this, target, stack, i);
      var name = this.component.name();
      if (name && this.render_name() !== "none") {
        for (var n = this.span[0], m = this.span[1].nextSibling;
          n.nodeType !== window.Node.ELEMENT_NODE && n !== m;
          n = n.nextSibling) {}
        if (n !== m) {
          n.setAttribute(this.render_name(), name);
        }
      }
    };
  }());


  // Link is not part of the core of Bender and is added as a runtime utility to
  // include external resources such as scripts and stylesheets, as well as
  // bringin external (static) components into scope (TODO)
  bender.Link = flexo._ext(flexo.Object, {

    // Initialize a new link with rel and href properties.
    init: function (rel, href) {
      flexo.Object.init.call(this);
      this.rel = flexo.safe_trim(rel).toLowerCase();
      this.href = flexo.safe_trim(href);
    },

    // Load a link once. Loading depends on the rel property.
    load: function () {
      if (urls[this.href]) {
        return urls[this.href];
      }
      var f = this.load[this.rel];
      if (typeof f === "function") {
        // jshint -W093
        return urls[this.href] = f.call(this);
      }
      console.warn("Cannot load “%0” link (unsupported value for rel)"
          .fmt(this.rel));
    }
  });


  // Inline links: similar to link but the content is inline and they do not
  // need loading. There is no rel or href since the data is inline, and its
  // type depends on the actual object (since below.)
  bender.Inline = flexo._ext(flexo.Object, {

    // Set an __unloaded flag to make sure that it gets “loaded” only once.
    init: function (elem) {
      flexo.Object.init.call(this);
      this.elem = elem;
      this.__unloaded = true;
    }
  });


  // Inline style element.
  bender.Style = flexo._ext(bender.Inline, {

    // Load: add a style element to the head of the target document.
    load: function () {
      if (this.__unloaded) {
        delete this.__unloaded;
        window.document.head.appendChild(flexo.$style(shallow_text(this.elem)));
      }
    }
  });

  // Inline script element.
  bender.Script = flexo._ext(bender.Inline, {

    // Load: add a script element to the head of the target document.
    load: function () {
      if (this.__unloaded) {
        delete this.__unloaded;
        window
          .document.head.appendChild(flexo.$script(shallow_text(this.elem)));
      }
    }
  });


  // Resolve the select attribute of adapter elements to the actual target
  // node(s).
  function resolve_select(adapter) {
    if (adapter.target) {
      return adapter;
    }
    var component = adapter._watch.component;
    var targets = component.select(adapter.__select);
    adapter.target = targets[0][0];
    adapter.static = targets[0][1];
    delete adapter.__select;
    return adapter.resolved();
  }


  bender.Adapter.resolved = flexo.self;

  bender.Text.default_property = "text";

  bender.Set.resolved = function () {
    if (this.target.default_property) {
      return bender.SetNodeProperty.create(this.target.default_property,
          this.target);
    }
    return this;
  };

  bender.DOMElement.set_node_property = true;
  bender.Text.set_node_property = true;

  bender.SetProperty.resolved = function () {
    if (this.target.set_node_property) {
      return bender.SetNodeProperty.create(this.property, this.target);
    }
    return this;
  };

  function resolve_value(adapter, gets) {
    if (adapter.__value) {
      var chunks = adapter.__value;
      var source = (adapter.__needs_return ? "return " : "") +
        (adapter.__dynamic ?
         unchunk_dynamic(adapter, chunks) : unchunk_string(adapter, chunks));
      delete adapter.__value;
      delete adapter.__dynamic;
      delete adapter.__needs_return;
      try {
        // jshint -W054
        adapter.value(new Function("$in", "$scope", source));
        if (gets) {
          return gets_for_chunks(chunks);
        }
      } catch (e) {
        console.warn("Could not compile “%0”".fmt(source));
      }
    }
    return [];
  }

  function resolve_match(adapter) {
    if (adapter.__match) {
      var source = "return " + unchunk_dynamic(adapter, adapter.__match);
      delete adapter.__match;
      try {
        // jshint -W054
        adapter.match(new Function("$in", "$scope", source));
      } catch (e) {
        console.warn("Could not compile “%0” for match".fmt(source));
      }
    }
  }

  function resolve_adapter(adapter) {
    var resolved = resolve_select(adapter);
    resolve_value(adapter);
    resolve_match(adapter);
    if (resolved !== adapter) {
      resolved.value(adapter.value());
      resolved.match(adapter.match());
      resolved.delay(adapter.delay());
      resolved.static = adapter.static;
      resolved._watch = adapter._watch;
      delete adapter._watch;
      bender.trace("Replacing adapter:", adapter, resolved);
    }
    return resolved;
  }

  function resolve_adapter_gets(adapter) {
    resolve_select(adapter);
    var gets = resolve_value(adapter, flags.gets);
    resolve_match(adapter);
    return gets;
  }

  function unchunk_idprop(adapter, chunk) {
    var target = adapter._watch.component.select(chunk[0])[0];
    var t = (target[1] ? "this.names[%0]" : "$scope[%0]")
      .fmt(flexo.quote(target[0].__id));
    if (target[2]) {
      t += ".element";
    }
    if (chunk[1]) {
      t += ".properties[%0]".fmt(flexo.quote(chunk[1]));
    }
    return t;
  }

  function unchunk_string(adapter, value) {
    return (typeof value === "string" ? [value] : value).map(function (chunk) {
      if (typeof chunk === "string") {
        return flexo.quote(chunk);
      }
      if (chunk.block) {
        return "(%0)".fmt(unchunk_dynamic(adapter, chunk));
      }
      return unchunk_idprop(adapter, chunk);
    }).join("+");
  }

  function unchunk_dynamic(adapter, value) {
    return typeof value === "string" ? value : value.map(function (chunk) {
      if (typeof chunk === "string") {
        return chunk;
      }
      return unchunk_idprop(adapter, chunk);
    }).join("");
  }

  function gets_for_chunks(chunks) {
    var bindings = {};
    var gets = [];
    var add_get = function (chunk) {
      if (Array.isArray(chunk)) {
        if (chunk.block) {
          chunk.forEach(add_get);
        } else {
          if (!bindings.hasOwnProperty(chunk[0])) {
            bindings[chunk[0]] = {};
          }
          bindings[chunk[0]][chunk[1]] = true;
          var get = bender.GetProperty.create(chunk[1]);
          get.__select = chunk[0];
          gets.push(get);
        }
      }
    };
    if (Array.isArray(chunks)) {
      chunks.forEach(add_get);
    }
    return gets;
  }

  // Overload render_subgraph for watches to get the actual target of adapters
  // from the __select property (i.e., select attribute)
  (function () {
    var $super = bender.Watch.render_subgraph;
    bender.Watch.render_subgraph = function (graph) {
      var resolve__bound = resolve_adapter.bind(this);
      this.gets.forEach(resolve__bound);
      this.sets = this.sets.map(resolve__bound);
      if (this.__text) {
        // jshint -W054
        var source = "return " + unchunk_string(this.sets[0], this.__text);
        this.sets[0].value(new Function("_", "$scope", source));
        delete this.__text;
      }
      return $super.call(this, graph);
    };
  }());

  (function () {
    var $super = bender.InitWatch.render_subgraph;
    bender.InitWatch.render_subgraph = function (graph) {
      this.sets = this.sets.filter(function (set) {
        resolve_select(set);
        var gets = resolve_adapter_gets(set);
        if (gets.length > 0) {
          var watch = bender.Watch.create();
          this.component.watch(watch);
          gets.forEach(function (get) {
            watch.get(get);
            resolve_select(get);
          });
          delete set._watch;
          watch.set(set);
          watch.render_subgraph(graph);
          return false;
        }
        return true;
      }, this);
      $super.call(this, graph);
    }
  }());

  // Scripts are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.load.script = function () {
    if (window.document.documentElement.namespaceURI === flexo.ns.html) {
      return flexo.promise_script(this.href, window.document.head)
        .then(function (script) {
          return this.loaded = script, this;
        }.bind(this));
    }
    console.warn("Cannot render script link for namespace %0"
        .fmt(window.document.documentElement.namespaceURI));
  };

  // Stylesheets are handled for HTML only by default. Override this method to
  // handle other types of documents.
  bender.Link.load.stylesheet = function () {
    if (window.document.documentElement.namespaceURI === flexo.ns.html) {
      var link = window.document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      window.document.head.appendChild(link);
      this.loaded = link;
    } else {
      console.warn("Cannot render stylesheet link for namespace %0"
          .fmt(window.document.documentElement.namespaceURI));
    }
  };


  // Dump the graph to Graphviz
  bender.WatchGraph.dump = function () {
    if (!this.edges) {
      return;
    }
    var vertices = this.vertices.map(function (vertex, i) {
      vertex.__index = i;
      return vertex.desc();
    }).join("\n");
    var edges = this.edges.map(function (edge, i) {
      var color = edge.priority === bender.InheritEdge.priority ?
        "#f94179" : edge.priority < 0 ? "#ff6a4d" :
        edge.priority > 0 ? "#f8ca00" : "#000000";
      return "v%0 -> v%1 [label=\" %2\", color=\"%3\"]"
        .fmt(edge.source.__index, edge.dest.__index, i + 1, color);
    }).join("\n");
    var components = "";
    var component_boxes = {};
    var queue = [bender.Node.__nodes["0"]];
    var push = function (child) {
      components += "k_%0 -> k_%1\n".fmt(child.parent.__id, child.__id);
      queue.push(child);
    };
    while (queue.length > 0) {
      var q = queue.shift();
      if (!component_boxes[q.__id]) {
        component_boxes[q.__id] = "%0[%1]".fmt(q.name(), q.__id);
        components += "k_%0 [label=\"%1\", shape=box];\n"
          .fmt(q.__id, component_boxes[q.__id]);
        var prototype = q.prototype;
        if (prototype) {
          components += "k_%0 -> k_%1 [color=\"#f94179\", dir=back]\n"
            .fmt(prototype.__id, q.__id);
          queue.push(prototype);
        }
        q.children.forEach(push);
      }
    }
    var gv = "digraph bender {\n" +
      "node [fontname=\"Avenir Next\"]\n" +
      "edge [fontname=\"Avenir Next\"]\n" +
      components + "\n" + vertices + "\n" + edges + "\n}";
    this.vertices.forEach(function (vertex) {
      delete vertex.__index;
    });
    window.open("data:text/vnd.graphviz;base64," +
        window.btoa(gv), "Graph");
  };

  bender.Vertex.desc = function () {
    return "v%0 [shape=triangle, label=\"\"]".fmt(this.__index);
  };

  bender.InitVertex.desc = function () {
    return "v%0 [shape=point, label=\"\", color=\"#ff6a4d\"]".fmt(this.__index);
  };

  bender.WatchVertex.desc = function () {
    return "v%0 [%1]".fmt(this.__index, this._watch.desc());
  };

  bender.Watch.desc = function () {
    return "label=\"%0\", shape=square, fixedsize=true, width=0.4"
      .fmt(this.component.__id);
  };

  bender.InitWatch.desc = function () {
    return "label=\"\", shape=square, fixedsize=true, width=0.3, " +
      "color=\"#ff6a4d\"";
  };

  bender.PropertyVertex.desc = function () {
    return "v%0 [label=\"%1`%2\"]"
      .fmt(this.__index, this.adapter.target.__id, this.adapter.name);
  };

  bender.EventVertex.desc = function () {
    return "v%0 [label=\"%1!%2\", shape=septagon]"
      .fmt(this.__index, this.adapter.target.__id, this.adapter.type);
  };


  // Chunk a value string into a list of strings, property or component
  // references, and code blocks (delimited by {{ }}). For instance, this turns
  // “Status: `status” into ["Status: ", ["", "status"]]. Return a string if
  // there are no bindings.
  function chunk_string(value, dynamic) {
    try {
      var chunks = chunk_string__unsafe(value, dynamic);
      return chunks.length > 1 || Array.isArray(chunks[0]) ? chunks : chunks[0];
    } catch (e) {
      return value;
    }
  }

  // Chunk the value string, 
  function chunk_string__unsafe(value, dynamic) {
    var state = "";          // Current state of the tokenizer
    var chunk = "";          // Current chunk
    var chunks = [];         // List of chunks
    var escape = false;      // Escape flag (following a \)
    var unfinished = false;  // Unfinished chunk

    var rx_start = new RegExp("^[$A-Z_a-z\x80-\uffff]$");
    var rx_cont = new RegExp("^[$0-9A-Z_a-z\x80-\uffff]$");

    function push_chunk() {
      if (typeof chunk === "string" &&
          typeof chunks[chunks.length - 1] === "string") {
        chunks[chunks.length - 1] += chunk;
      } else {
        chunks.push(chunk);
      }
    }

    // Change to state s and start a new chunk with `c` (or "")
    var start = function (s, c, set_unfinished) {
      if (chunk) {
        push_chunk();
        unfinished = false;
      }
      chunk = c || "";
      if (set_unfinished) {
        unfinished = true;
      }
      state = s;
    };

    // Change to state s and end the current chunk with `c` (or "")
    var end = function (s, c) {
      unfinished = false;
      if (c) {
        if (typeof chunk === "string") {
          chunk += c;
        } else if (Array.isArray(chunk)) {
          chunk[chunk.length - 1] += c;
        }
      }
      start(s);
    };

    var advance = {
      // Regular code, look for new quoted string, comment, id, property, or
      // block
      "": function (c, d) {
        switch (c) {
          case "'": start("q", c, flags.set_unfinished); break;
          case '"': start("qq", c, flags.set_unfinished); break;
          case "/":
            switch (d) {
              case "/": start("comment", c); break;
              case "*": start("comments", c, flags.set_unfinished); break;
              default: chunk += c;
            }
            break;
          case "@":
          case "#":
            start("id_start", [c], flags.set_unfinished);
            break;
          case "`": start("prop_start", ["", ""], flags.set_unfinished); break;
          case "\\":
            escape = true;
            break;
          case "{":
            if (d === "{" && !dynamic) {
              start("block", "", flags.set_unfinished);
              return 1;
            }
            // jshint -W086
          default:
            chunk += c;
        }
      },

      // Single-quoted string
      // It is OK to fall back to default after reading a backslash
      q: function (c) {
        switch (c) {
          case "'": end("", c); break;
          case "\\": escape = true;  // jshint -W086
          default: chunk += c;
        }
      },

      // Double-quoted string
      // It is OK to fall back to default after reading a backslash
      qq: function (c) {
        switch (c) {
          case '"': end("", c); break;
          case "\\": escape = true;  // jshint -W086
          default: chunk += c;
        }
      },

      // Single-line comment
      comment: function (c) {
        if (c === "\n") {
          end("", c);
        } else {
          chunk += c;
        }
      },

      // Multi-line comment:
      comments: function (c, d) {
        if (c === "*" && d === "/") {
          end("", "*/");
          return 1;
        } else {
          chunk += c;
        }
      },

      // Start of an identifier (from @ or #)
      id_start: function (c, d) {
        if (c === "\\") {
          escape = true;
          if (d !== "") {
            unfinished = false;
          }
        } else if (c === "@" && chunk[0] === "@") {
          chunk[0] = "^";
        } else if (c === "(") {
          state = "idp";
        } else if (rx_start.test(c)) {
          chunk[0] += c;
          unfinished = false;
          state = "id";
        } else {
          flexo.fail();
        }
      },

      // Component or instance identifier, starting with # or @
      id: function (c) {
        if (c === "\\") {
          escape = true;
        } else if (c === "`") {
          chunk.push("");
          unfinished = false;
          state = "prop_start";
        } else if (rx_cont.test(c)) {
          chunk[0] += c;
        } else {
          start("");
          return -1;
        }
      },

      // Quoted identifier (between parentheses)
      idp: function (c, d) {
        if (c === "\\") {
          escape = true;
        } else if (c === ")") {
          if (d === "`") {
            chunk.push("");
            unfinished = true;
            state = "prop_start";
            return 1;
          }
          start("");
          return -1;
        } else {
          chunk[0] += c;
        }
      },

      // Look for the start of a property
      prop_start: function (c, d) {
        if (c === "\\") {
          escape = true;
          if (d) {
            unfinished = false;
          }
        } else if (c === "(") {
          state = "propp";
        } else if (rx_start.test(c)) {
          chunk[1] += c;
          unfinished = false;
          state = "prop";
        } else {
          flexo.fail();
        }
      },

      // Property name
      prop: function (c) {
        if (c === "\\") {
          escape = true;
        } else if (rx_cont.test(c)) {
          chunk[1] += c;
        } else {
          start("");
          return -1;
        }
      },

      // Quoted property name (between parentheses)
      propp: function (c) {
        if (c === "\\") {
          escape = true;
        } else if (c === ")") {
          start("");
        } else {
          chunk[1] += c;
        }
      },

      // Block delimited by {{ }}: find the end of the block, then parse it.
      block: function (c, d) {
        if (c === "}" && d === "}") {
          chunk = chunk_string__unsafe(chunk, flags.dynamic);
          chunk.block = true;
          end("");
          return 1;
        }
        chunk += c;
      },
    };

    for (var i = 0, n = value.length; i < n; ++i) {
      if (escape) {
        escape = false;
        state = state.replace(/_start$/, "");
        if (typeof chunk === "string") {
          chunk += value[i];
        } else {
          chunk[chunk.length - 1] += value[i];
        }
      } else {
        i += advance[state](value[i], value[i + 1] || "") || 0;
      }
    }
    if (chunk) {
      flexo.fail(unfinished);
      push_chunk();
    }
    return chunks;
  }

  // For testing purposes only
  bender.__chunk_string = chunk_string;

}(this.bender));
