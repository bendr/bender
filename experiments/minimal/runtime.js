// HTML runtime for Bender, based on the functional core.

// TODO 
// [ ] select="*" for GetEvent: listen to notifications from anyone. Create an
//       EventVertex that anyone can inherit from.
// [ ] message="foo" for GetEvent, same as event="foo" delay="0"

/* global console, flexo */

(function (bender) {
  "use strict";

  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";
  bender.namespaces = {};  // Custom namespace URIs

  var urls = {};  // URL map for loaded resources

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
      return deserialize_text(node.textContent);
    }
  }

  function deserialize_text(content) {
    var text = bender.Text.create();
    var chunks = chunk_string(content);
    if (typeof chunks === "string") {
      text.text(chunks);
    } else {
      text.__chunks = chunks;
    }
    return text;
  }

  // Deserialize a component from an element. If the component element has a
  // href attribute, first deserialize that component then use it as the
  // prototype for this component, otherwise create a new component.
  deserialize.component = function (elem) {
    var base_uri = flexo.base_uri(elem);
    return (function () {
      if (elem.hasAttribute("href")) {
        var url = flexo.normalize_uri(base_uri, elem.getAttribute("href"));
        return bender.load_component(url, base_uri)
          .then(function (prototype) {
            return deserialize_component(elem, prototype.create(), base_uri);
          });
      } else {
        return deserialize_component(elem, bender.Component.create(), base_uri);
      }
    }()).then(function (component) {
      // component.on_handlers.init.call(component);
      return load_links(component);
    });
  };

  // Deserialize the view element
  deserialize.view = function (elem) {
    return deserialize_children(bender.View.create(), elem);
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
  };
    

  // Deserialize the contents of the component created
  function deserialize_component(elem, component, url) {
    deserialize_component_attributes(elem, component, url);
    component.__links = [];
    component.__properties = {};
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
    // delete component.__pending_init;
    // Attributes of the component element
    flexo.foreach(elem.attributes, function (attr) {
      if (attr.namespaceURI === null) {
        if (attr.localName.indexOf("on-") === 0) {
          component.on(attr.localName.substr(3), attr.value);
        } else if (attr.localName === "name") {
          component.name(attr.value);
        } else if (attr.localName !== "href" || custom) {
          component.properties[attr.localName] = attr.value;
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

  // Component title
  deserialize_component.title = function (component, elem) {
    return component.title(shallow_text(elem));
  };

  // Deserialize a property element in a component
  deserialize_component.property = function (component, elem) {
    var name = elem.getAttribute("name");
    if (!name) {
      console.error("Property with no name");
      return;
    }
    var as = normalize_as(elem.getAttribute("as"));
    var value = elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem, true);
    var parse_value = {
      boolean: flexo.is_true,
      dynamic: function (v) {
        if (elem.hasAttribute("value")) {
          v = "return " + v;
        }
        try {
          return new Function(v);
        } catch (_) {
          console.log("Error parsing Javascript function: “%0”".fmt(v));
        }
      },
      json: function (v) {
        try {
          return JSON.parse(v);
        } catch (_) {
          console.log("Error parsing JSON string: “%0”".fmt(v));
        }
      },
      number: flexo.to_number,
      string: flexo.id
    };
    component.__properties[name] = flexo.funcify(parse_value[as](value));
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
    return deserialize_adapter(elem, elem.hasAttribute("event") ?
      bender.GetEvent.create(elem.getAttribute("event")) :
      bender.GetProperty.create(elem.getAttribute("property")));
  }

  // Deserialize a set element
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

  function deserialize_adapter(elem, adapter) {
    var as = normalize_as(elem.getAttribute("as"));
    var parse_value = {
      boolean: flexo.is_true,
      dynamic: function (v) {
        if (elem.hasAttribute("value")) {
          v = "return " + v;
        }
        try {
          return new Function(v);
        } catch (_) {
          console.log("Error parsing Javascript function: “%0”".fmt(v));
        }
      },
      json: function (v) {
        try {
          return JSON.parse(v);
        } catch (_) {
          console.log("Error parsing JSON string: “%0”".fmt(v));
        }
      },
      number: flexo.to_number,
      string: flexo.id
    };
    var value = elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem, true);
    if (value) {
      adapter.value(parse_value[as](value));
    }
    if (elem.hasAttribute("match")) {
      adapter.match(parse_value.dynamic(elem.getAttribute("match")));
    }
    adapter.__select = flexo.safe_trim(elem.getAttribute("select"));
    // return adapter.delay(elem.getAttribute("delay"));
    return adapter;
  }

  // Normalize the `as` parameter to be one of dynamic (default), boolean,
  // json, number, or string.
  function normalize_as(as) {
    as = flexo.safe_trim(as).toLowerCase();
    return as === "boolean" || as === "json" || as === "number" ||
      as === "string" ? as : "dynamic";
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
        // } else if (attr.localName === "render-id") {
        //   e.renderId(attr.value);
        } else {
          add_attribute(e, ns, attr.localName, attr.value);
        }
      } else {
        add_attribute(e, ns, attr.localName, attr.value);
      }
    }
    return deserialize_children(e, elem);
  }

  function add_attribute(elem, ns, name, value) {
    elem.insert_child(bender.Attribute.create(ns, name)
        .child(deserialize_text(value)));
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
    bender.trace("Custom component: {%0}:%1 -> %2"
        .fmt(elem.namespaceURI, elem.localName, url));
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
    for (var p in this.__properties) {
      this.property(p, this.__properties[p].call(this));
    }
    delete this.__properties;
    return this;
  };

  // Return the targets (with a static flag) for the given selector
  bender.Component.select = function (select) {
    select = flexo.safe_trim(select);
    var target;
    if (select[0] === "@" || select[0] === "#") {
      target = this.names[select.substr(1)];
    } else if (select[0] === ":document") {
      target = bender.DocumentElement;
    }
    return [[target || this, select[0] === "#"]];
  };

  // Title is just a string (should be any foreign content later)
  flexo._accessor(bender.Component, "title", flexo.safe_trim);

  // While the scope is updated, also make the watches the bindings
  (function () {
    var $super = bender.Component.update_scope;
    bender.Component.update_scope = function (node) {
      $super.call(this, node);
      if (node.__chunks) {
        var watch = bender.Watch.create();
        node.view.component.watch(watch);
        var bindings = {};
        node.__chunks.forEach(function (chunk) {
          if (Array.isArray(chunk)) {
            if (!bindings.hasOwnProperty(chunk[0])) {
              bindings[chunk[0]] = {};
            }
            bindings[chunk[0]][chunk[1]] = true;
          }
        });
        var set = watch.set(bender.SetNodeProperty.create("text", node));
        Object.keys(bindings).forEach(function (select) {
          Object.keys(bindings[select]).forEach(function (name) {
            var get = bender.GetProperty.create(name);
            get.__select = select;
            watch.get(get);
          });
        });
        watch.__chunks = node.__chunks;
        delete node.__chunks;
      }
    }
  }());


  // Overload render_subgraph for watches to get the actual target of adapters
  // from the __select property (i.e., select attribute)
  (function () {
    var set_target = function (adapter) {
      if (adapter.target) {
        return;
      }
      var component = adapter._watch.component;
      var targets = component.select(adapter.__select);
      adapter.target = targets[0][0];
      adapter.static = targets[0][1];
      delete adapter.__select;
    };
    var $super = bender.Watch.render_subgraph;
    bender.Watch.render_subgraph = function (graph) {
      this.gets.forEach(set_target);
      this.sets.forEach(set_target);
      if (this.__chunks) {
        var f = "return " + this.__chunks.map(function (chunk) {
            if (typeof chunk === "string") {
              return flexo.quote(chunk);
            }
            var target = this.component.select(chunk[0])[0];
            return "%0.properties[%1]"
              .fmt((target[1] ? "this.names[%0]" : "$scope[%0]")
                .fmt(flexo.quote(target[0].__id)), flexo.quote(chunk[1]));
          }, this).join("+");
        this.sets[0].value(new Function("_", "$scope", f));
        delete this.__chunks;
      }
      return $super.call(this, graph);
    };
  }());


  bender.Link = flexo._ext(bender.Base, {
    init: function (rel, href) {
      this.rel = flexo.safe_trim(rel).toLowerCase();
      this.href = flexo.safe_trim(href);
      return this;
    },

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
      var link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", this.href);
      document.head.appendChild(link);
      this.loaded = link;
    } else {
      console.warn("Cannot render stylesheet link for namespace %0"
          .fmt(window.document.documentElement.namespaceURI));
    }
  };



  bender.WatchGraph.dump = function () {
    this.vertices.forEach(function (vertex, i) {
      vertex.__index = i;
    });
    if (!this.edges) {
      return;
    }
    console.log(this.edges.map(function (edge, i) {
      return "%0. %1 -> %2 = %3 (%4)"
        .fmt(i + 1, edge.source.desc(), edge.dest.desc(), edge.priority,
          edge.delay);
    }).join("\n"));
    this.vertices.forEach(function (vertex) {
      delete vertex.__index;
    });
  };

  bender.Vertex.desc = function () {
    return "v%0".fmt(this.__index);
  };

  bender.WatchVertex.desc = function () {
    return "v%0 [watch of %1]".fmt(this.__index, this._watch.component.name());
  };

  bender.PropertyVertex.desc = function () {
    return "v%0 [%1`%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.name);
  };

  bender.EventVertex.desc = function () {
    return "v%0 [%1!%2]".fmt(this.__index, this.adapter.target.name(),
        this.adapter.type);
  };


  // Bindings

  // Chunk a value string into a list of chunks and property, component or
  // instance references. For instance, this turns “Status: `status” into
  // ["Status: ", ["", "status"]]. Return a simple string if there are no
  // bindings in that string.
  function chunk_string(value) {
    var state = "";      // Current state of the tokenizer
    var chunk = "";      // Current chunk
    var chunks = [];     // List of chunks
    var escape = false;  // Escape flag (following a \)

    var rx_start = new RegExp("^[$A-Z_a-z\x80-\uffff]$");
    var rx_cont = new RegExp("^[$0-9A-Z_a-z\x80-\uffff]$");

    // Change to state s and start a new chunk with `c` (or "")
    var start = function (s, c) {
      if (chunk) {
        chunks.push(chunk);
      }
      chunk = c || "";
      state = s;
    };

    // Change to state s and end the current chunk with `c` (or "")
    var end = function (s, c) {
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
      // Regular code, look for new quoted string, comment, id or property
      "": function (c, d) {
        switch (c) {
          case "'": start("q", c); break;
          case '"': start("qq", c); break;
          case "/":
            switch (d) {
              case "/": start("comment", c); break;
              case "*": start("comments", c); break;
              default: chunk += c;
            }
            break;
          case "@": case "#":
            if (d === "(") {
              start("idp", [c]);
              return 1;
            } else if (rx_start.test(d)) {
              start("id", [c + d]);
              return 1;
            } else {
              chunk += c;
            }
            break;
          case "`":
            if (d === "(") {
              start("propp", ["", ""]);
              return 1;
            } else if (rx_start.test(d)) {
              start("prop", ["", d]);
              return 1;
            } else {
              chunk += c;
            }
            break;
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

      // Component or instance identifier, starting with # or @
      id: function (c, d) {
        if (c === "\\") {
          escape = true;
        } else if (c === "`") {
          if (d === "(") {
            chunk.push("");
            state = "propp";
            return 1;
          } else if (rx_start.test(d)) {
            chunk.push(d);
            state = "prop";
            return 1;
          }
          start("", c);
        } else if (rx_cont.test(c)) {
          chunk[0] += c;
        } else {
          start("", c);
        }
      },

      // Quoted identifier (between parentheses)
      idp: function (c, d, e) {
        if (c === "\\") {
          escape = true;
        } else if (c === ")") {
          if (d === "`") {
            if (e === "(") {
              chunk.push("");
              state = "propp";
              return 2;
            } else if (rx_start.test(e)) {
              chunk.push(e);
              state = "prop";
              return 2;
            }
          }
          start("", c);
        } else {
          chunk[0] += c;
        }
      },

      // Property name
      prop: function (c) {
        if (c === "\\") {
          escape = true;
        } else if (rx_cont.test(c)) {
          chunk[1] += c;
        } else {
          start("", c);
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
      }
    };

    for (var i = 0, n = value.length; i < n; ++i) {
      if (escape) {
        escape = false;
        if (typeof chunk === "string") {
          chunk += value[i];
        } else {
          chunk[chunk.length - 1] += value[i];
        }
      } else {
        i += advance[state](value[i], value[i + 1] || "", value[i + 2] || "") ||
          0;
      }
    }
    if (chunk) {
      chunks.push(chunk);
    }
    return chunks.length > 1 || Array.isArray(chunks[0]) ? chunks : chunks[0];
  }

}(this.bender));
