/* global Attribute, bender, console, Component, Content, DOMElement, flexo,
   GetEvent, GetProperty, Property, SetAttribute, SetEvent, SetProperty, Text,
   Value, View, Watch, window */
// jshint -W097

"use strict";

// Load a component from an URL and return a promise which is fulfilled once the
// component has been loaded and deserialized (which may lead to loading
// additional components, for its prototype, and its children.)
bender.load_component = function (scope, url, origin) {
  url = flexo.normalize_uri(flexo.base_uri(scope.document), url);
  if (origin && scope.urls[origin]) {
    scope.urls[origin].__prototype = url;
    for (var u = url; scope.urls[u]; u = scope.urls[u].__prototype) {
      if (u === origin) {
        throw "cycle in prototype chain for %0".fmt(url);
      }
    }
  }
  if (scope.urls[url]) {
    return scope.urls[url];
  }
  var response_;
  var promise = scope.urls[url] = flexo.ez_xhr(url, {
    responseType: "document", mimeType: "text/xml"
  }).then(function (response) {
    response_ = response;
    return deserialize(scope, response.documentElement);
  }.bind(scope)).then(function (component) {
    if (flexo.instance_of(component, bender.Component)) {
      return component.url(url).loaded();
    } else {
      throw { message: "not a Bender component", response: response_ };
    }
  });
  return promise;
};

// Deserialize an XML node. Unknown nodes (non-Bender elements, or nodes other
// than element, text and CDATA) are simply skipped, with a warning in the case
// of unknown Bender elements (as it probably means that another namespace was
// meant, or that a deprecated tag was used.) Deserializing a component that was
// just loaded should set the component field of the promise that was created to
// load this component so it passed as an extra parameter to deserialize.
function deserialize(scope, node) {
  if (node.nodeType === window.Node.ELEMENT_NODE) {
    if (node.namespaceURI === bender.ns) {
      var f = deserialize[node.localName];
      if (typeof f === "function") {
        return f(scope, node);
      } else {
        console.warn("Unknow element in Bender namespace: “%0” in %1"
            .fmt(node.localName, flexo.base_uri(node)));
      }
    } else {
      return deserialize_foreign(scope, node);
    }
  } else if (node.nodeType === window.Node.TEXT_NODE ||
      node.nodeType === window.Node.CDATA_SECTION_NODE) {
    return Text.create().text(node.textContent);
  }
}

// Deserialize the view element
deserialize.view = function (elem) {
  return this.deserialize_children(View.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id")), elem);
};

// Deserialize the content element
deserialize.content = function (elem) {
  return this.deserialize_children(Content.create()
      .id(elem.getAttribute("id"))
      .renderId(elem.getAttribute("render-id")), elem);
};

// Deserialize the attribute element
deserialize.attribute = function (elem) {
  return this.deserialize_children(Attribute
      .create(elem.getAttribute("ns"), elem.getAttribute("name"))
      .id(elem.getAttribute("id")), elem);
};

// Deserialize the text element
deserialize.text = function (elem) {
  return Text.create().text(shallow_text(elem));
};


// Deserialize a component from an element. If the component element has a href
// attribute, first deserialize that component then use it as the prototype for
// this component, otherwise create a new component.
deserialize.component = function (scope, elem) {
  var base_uri = flexo.base_uri(elem);
  return (function () {
    if (elem.hasAttribute("href")) {
      var url = flexo.normalize_uri(base_uri, elem.getAttribute("href"));
      return bender.load_component(scope, url, base_uri)
        .then(function (prototype) {
          return deserialize_component(scope, elem,
            Object.create(prototype).init(), base_uri);
        });
    } else {
      return deserialize_component(scope, elem,
        bender.Component.create().init(), base_uri);
    }
  }.call(this)).then(function (component) {
    // component.on_handlers.init.call(component);
    return component.load_links();
  });
};

// Deserialize the contents of the component created
function deserialize_component(scope, elem, component, url) {
  component.url(url);
  delete component.__pending_init;
  // Attributes of the component element
  flexo.foreach(elem.attributes, function (attr) {
    if (attr.namespaceURI === null) {
      if (attr.localName.indexOf("on-") === 0) {
        component.on(attr.localName.substr(3), attr.value);
      } else if (attr.localName === "id") {
        component.id(attr.value);
      } else if (attr.localName !== "href") {
        component.init_values[attr.localName] = attr.value;
      }
    } else if (attr.namespaceURI === bender.ns) {
      component.init_values[attr.localName] = attr.value;
    }
  });
  var view;
  flexo.foreach(elem.childNodes, function (ch) {
    if (ch.nodeType !== window.Node.ELEMENT_NODE ||
      ch.namespaceURI !== bender.ns) {
      return;
    }
    if (ch.localName === "view") {
      view = deserialize.view(scope, ch);
    } else {
      var f = deserialize_component[ch.localName];
      if (typeof f === "function") {
        f(component, ch);
      }
    }
  });
  return view ? view.then(flexo.funcify(component)) : component;
}

// Deserialize a property element in a component
deserialize_component.property = function (component, elem) {
  return component.property(elem.getAttribute("name"), {
    as: elem.getAttribute("as"),
    delay: elem.getAttriute("delay"),
    select: elem.getAttribute("select"),
    match_string: elem.getAttribute("match"),
    value_string: elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem)
  });
};

// Deserialize a link element in a component
deserialize_component.link = function (component, elem) {
  return component.link(elem.getAttribute("rel"), elem.getAttribute("href"));
};


// Deserialize an inline script element in a component
deserialize_component.script = function (component, elem) {
  return component.script(shallow_text(elem));
};

// Deserialize an inline style element in a component
deserialize_component.style = function (component, elem) {
  return component.style(shallow_text(elem));
};

// Deserialize a watch and its content for a component
deserialize_component.watch = function (component, elem) {
  var watch = Watch.create(component);
  component.watches.push(watch);
  flexo.foreach(elem.childNodes, function (ch) {
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "get") {
        watch.get(deserialize_get(elem));
      } else if (ch.localName === "set") {
        watch.set(deserialize_set(elem));
      }
    }
  });
  return component;
};

// Deserialize a get element
function deserialize_get(elem) {
  return (elem.hasAttribute("event") ?
      GetEvent.create(elem.getAttribute("event")) : GetProperty.create())
    .as(elem.getAttribute("as"))
    .delay(elem.getAttribute("delay"))
    .match_string(elem.getAttribute("match"))
    .property(elem.getAttribute("property"))
    .select(elem.getAttribute("select"))
    .value_string(elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem));
}

// Deserialize a set element
function deserialize_set(elem) {
  return (elem.hasAttribute("event") ?
      SetEvent.create(elem.getAttribute("event"))
        .property(elem.getAttribute("property")) :
    elem.hasAttribute("property") ?
      SetProperty.create().property(elem.getAttribute("property")) :
    elem.hasAttribute("attr") ?
      SetAttribute.create(elem.getAttribute("attr")) :
      bender.Set.create())
    .as(elem.getAttribute("as"))
    .delay(elem.getAttribute("delay"))
    .match_string(elem.getAttribute("match"))
    .select(elem.getAttribute("select"))
    .value_string(elem.hasAttribute("value") ? elem.getAttribute("value") :
      shallow_text(elem));
}


// Deserialize then add every child of a parent node `p` in the list of children
// to the Bender element `e`, then return `e`.
function deserialize_children(scope, e, p) {
  return flexo.fold_promises(flexo.map(p.childNodes, function (ch) {
      return deserialize(scope, ch);
    }), flexo.call.bind(function (child) {
      return child && Component.child.call(this, child) || this;
    }), e);
}

// Deserialize a foreign element and its contents (attributes and children),
// creating a generic DOM element object.
function deserialize_foreign(scope, elem) {
  var e = DOMElement.create(elem.namespaceURI, elem.localName);
  for (var i = 0, n = elem.attributes.length; i < n; ++i) {
    var attr = elem.attributes[i];
    var ns = attr.namespaceURI || "";
    if (ns === "") {
      if (attr.localName === "id") {
        e.id(attr.value);
      } else if (attr.localName === "render-id") {
        e.renderId(attr.value);
      } else {
        e.attr(ns, attr.localName, attr.value);
      }
    } else {
      e.attr(ns, attr.localName, attr.value);
    }
  }
  return deserialize_children(scope, e, elem);
}


// Set match from a string, parsing it.
Value.match_string = function (string) {
  if (arguments.length === 0) {
    return this._match_string || "";
  }
  string = flexo.safe_string(string);
  var f = parse_dynamic(string, true, this.bindings);
  if (f) {
    this._match = f;
    this._match_string = string;
  }
  return this;
};

// Set value from a string, parsing it.
Value.value_string = function (string, needs_return) {
  if (arguments.length === 0) {
    return this._value_string || "";
  }
  string = flexo.safe_string(string);
  var f = parse_dynamic(string, needs_return, this.bindings);
  if (f) {
    this._value = f;
    this._value_string = string;
  }
  return this;
};


// Don’t parse property values yet, as we will need `as` to solve the value.
Property.value_string = function (string, needs_return) {
  if (arguments.length === 0) {
    return this._value_string || "";
  }
  this._value_string = flexo.safe_string(string);
  this.__needs_return = !!needs_return;
  return this;
};

// Initialize the value function of a property from its string value
Property.init_value = function () {
  if (this.hasOwnProperty("__needs_return")) {
    this.value(this.value_from_string(this._value_string, this.__needs_return));
    delete this.__needs_return;
  }
  return this.value();
};


// Parse a value or match string as dynamic (i.e. compile a Javascript function
// from the text.) Replace bound values and update the bindings object, if any.
// Prepend “return ” if the needs_return flag is set (for attribute values.)
function parse_dynamic(string, needs_return, bindings, loc) {
  try {
    // jshint -W054
    return new Function("$scope", "$in",
        chunk_string(string).reduce(function (v, ch) {
          return v + (typeof ch === "string" ? ch : chunk_to_js(ch, bindings));
        }, needs_return ? "return " : ""));
  } catch (e) {
    console.error("Cannot compile %0 at %1".fmt(flexo.quote(string), loc));
  }
}

// Parse a value string as a string
function parse_string(string, bindings, loc) {
  var src = "return " + chunk_string(string).map(function (ch) {
    return typeof ch === "string" ? flexo.quote(ch) : chunk_to_js(ch, bindings);
  }).join("+");
  try {
    // jshint -W054
    return new Function("$scope", "$in", src);
  } catch (e) {
    console.error("Cannot compile %0 at %1".fmt(flexo.quote(string), loc));
  }
}

// Return the concatenation of all text children (and only children) of elem.
// Any other content (including child elements) is skipped.
function shallow_text(elem) {
  var text = "";
  for (var ch = elem.firstChild; ch; ch = ch.nextSibling) {
    if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
      text += ch.textContent;
    }
  }
  return text;
}

// Convert a chunk containing an id/property pair to the right string form and
// update the bindings along the way.
function chunk_to_js(ch, bindings) {
  var id = ch[0] || "@this";
  var v = "$scope[" + flexo.quote(id);
  if (ch.length === 2) {
    if (bindings) {
      if (!bindings.hasOwnProperty(id)) {
        bindings[id] = {};
      }
      bindings[id][ch[1]] = true;
    }
    v += "].properties[" + flexo.quote(ch[1]);
  }
  return v + "]";
}

// Chunk a value string into a list of chunks and property, component or
// instance references. For instance, this turns “Status: `status” into
// ["Status: ", ["", "status"]].
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
  return chunks;
}
