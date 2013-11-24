(function () {

  /* global bender, require, window */
  var flexo = typeof require === "function" ? require("flexo") : window.flexo;

  function value_as_dynamic(value, needs_return, bindings) {
    return chunks_to_value(needs_return ? ("return " : "") + chunk_value(value)
      .map(function (chunk) {
        return chunk_to_js(chunk, bindings);
      }).join(""), bindings);
  }

  function value_as_string(value, bindings) {
    return chunks_to_value("return " + chunk_value(value).map(function (chunk) {
      return chunk_to_js(chunk, bindings, true);
    }).join("+"), bindings);
  }

  function chunk_to_js(chunk, bindings, quote) {
    if (Array.isArray(chunk)) {
      var id = chunk[0] || "$this";
      var ch = "$scope[\"" + id.replace(/\"/g, "\\\"");
      if (bindings && chunk.length === 2) {
        if (!bindings.hasOwnProperty(id)) {
          bindings[id] = {};
        }
        bindings[id][chunk[1]] = true;
        ch += "\"]properties[\"" + chunk[1].replace(/\"/g, "\\\"");
      }
      return ch + "\"]";
    }
    return quote ? flexo.quote(chunk) : chunk;
  }

  function chunks_to_value(string_value, bindings) {
    if (bindings && Object.keys(bindings).length > 0) {
      Object.defineProperty(bindings, "", { value: string_value });
      return bindings;
    }
    return string_value;
  }

  // Chunk a value string into a list of chunks and property, component or
  // instance references. For instance, this turns “Status: `status” into
  // ["Status: ", ["$this", "status"]]. This can then be turned into a bindings
  // object.
  function chunk_value(value) {
    var state = "";      // Current state of the tokenizer
    var chunk = "";      // Current chunk
    var chunks = [];     // List of chunks
    var escape = false;  // Escape flag (following a \)

    var rx_start = new RegExp("^[$A-Z_a-z\x80-\uffff]$");
    var rx_cont = new RegExp("^[$0-9A-Z_a-z\x80-\uffff-]$");

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

}());
