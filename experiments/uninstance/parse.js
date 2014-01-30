/* global console, flexo, Property, ValueElement */
// jshint -W097

"use strict";

// Set match from a string, parsing it.
ValueElement.match_string = function (string) {
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
ValueElement.value_string = function (string, needs_return) {
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
  this._value_string_needs_return = !!needs_return;
  return this;
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
