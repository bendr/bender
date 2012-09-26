(function () {
  "use strict";

  var http = require("http");
  var fs = require("fs");
  var url = require("url");
  var util = require("util");

  // Simple format function for messages and templates. Use {0}, {1}...
  // as slots for parameters. Null and undefined are replaced by an empty
  // string.
  String.prototype.fmt = function () {
    var args = arguments;
    return this.replace(/\{(\d+)\}/g, function (_, p) {
      return args[p] == null ? "" : args[p];
    });
  };


  // Make a (text) HTML tag; the first argument is the tag name. Following
  // arguments are the contents (as text; must be properly escaped.) If the last
  // argument is a boolean, it is treated as a flag to *not* close the element
  // when true (i.e. for elements that are incomplete or HTML elements that do not
  // need to be closed)
  // TODO handle encoding (at least of attribute values)
  function html_tag(tag) {
    var attrs, a, v, keep_open,
      out = "<" + tag,
      contents = [].slice.call(arguments, 1);
    if (typeof contents[0] === "object") {
      attrs = contents.shift();
      for (a in attrs) {
        if (attrs.hasOwnProperty(a)) {
          v = attrs[a];
          // true and false act as special values: when true, just output the
          // attribute name (without any value); when false, skip the attribute
          // altogether
          if (v !== false) {
            out += (v === true ? " {0}" : " {0}=\"{1}\"").fmt(a, v);
          }
        }
      }
    }
    out += ">";
    keep_open = typeof contents[contents.length - 1] === "boolean" ?
        contents.pop() : false;
    out += contents.join("");
    if (!keep_open) {
      out += "</{0}>".fmt(tag);
    }
    return out;
  }

  // Shortcut for HTML and SVG elements: the element name prefixed by a $ sign
  // See http://dev.w3.org/html5/spec/Overview.html#elements-1 (HTML)
  // and http://www.w3.org/TR/SVG/eltindex.html (SVG, excluding names using -)
  ["a", "abbr", "address", "altGlyph", "altGlyphDef", "altGlyphItem", "animate",
    "animateColor", "animateMotion", "animateTransform", "area", "article",
    "aside", "audio", "b", "base", "bdi", "bdo", "blockquote", "body", "br",
    "button", "canvas", "caption", "circle", "cit", "clipPath", "code", "col",
    "colgroup", "command", "cursor", "datalist", "dd", "defs", "del", "desc",
    "details", "dfn", "div", "dl", "dt", "ellipse", "em", "embed", "feBlend",
    "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
    "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood",
    "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage",
    "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
    "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "fieldset",
    "figcaption", "figure", "filter", "font", "footer", "foreignObject", "form",
    "g", "glyph", "glyphRef", "h1", "h2", "h3", "h4", "h5", "h6", "head",
    "header", "hgroup", "hkern", "hr", "html", "i", "iframe", "image", "img",
    "input", "ins", "kbd", "keygen", "label", "legend", "li", "line",
    "linearGradient", "link", "map", "mark", "marker", "mask", "menu", "meta",
    "metadata", "meter", "mpath", "nav", "noscript", "object", "ol", "optgroup",
    "option", "output", "p", "param", "path", "pattern", "polygon", "polyline",
    "pre", "progress", "q", "radialGradient", "rect", "rp", "rt", "ruby", "s",
    "samp", "script", "section", "select", "set", "small", "source", "span",
    "stop", "strong", "style", "sub", "summary", "sup", "svg", "switch",
    "symbol", "table", "tbody", "td", "text", "textarea", "textPath", "tfoot",
    "th", "thead", "time", "title", "tr", "tref", "tspan", "track", "u", "ul",
    "use", "var", "video", "view", "vkern", "wbr"].forEach(function (tag) {
    global["$" + tag] = html_tag.bind(global, tag);
  });

  // Params should include at least "title"; "lang" and "charset" have default
  // values. DOCTYPE can be overridden with the DOCTYPE parameter.
  function html_header(params, head) {
    if (typeof params !== "object") {
      params = {};
    }
    if (head === undefined || head === null) {
      head = "";
    }
    if (!params.DOCTYPE) {
      params.DOCTYPE = "<!DOCTYPE html>";
    }
    if (!params.title) {
      params.title = "Untilted";
    }
    if (!params.charset) {
      params.charset = "UTF-8";
    }
    return params.DOCTYPE  + "\n" +
      $html({ lang: params.lang },
        $head(
          $title(params.title),
          $meta({ charset: params.charset }, true),
          head),
        $body(true), true);
  };

  function html_footer() {
    return "</body></html>";
  };

  function html_page(params, head, body) {
    return html_header(params, head) + body + html_footer();
  };

  // Known error codes
  var STATUS_CODES = {
    // 1xx Informational
    100: "Continue",
    101: "Switching Protocols",
    // 2xx Successful
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    // 3xx Redirection
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "See Other",
    305: "Use Proxy",
    307: "Temporary Redirect",
    // 4xx Client error
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Request Entity Too Large",
    414: "Request-URI Too Long",
    415: "Unsupported Media Type",
    416: "Request Range Not Satisfiable",
    417: "Expectation Failed",
    // 5xx Server error
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported"
  };

  function output_error(response, code) {
    response.writeHead(code, { "Content-Type": "text/html" });
    response.end(html_page({ title: "Error {0}".fmt(code), lang: "en" }, "",
          $pre("Error {0}: {1}".fmt(code, STATUS_CODES[code] || "unknown"))));
  }
  
  function output_form(response, title, content) {
    var body = $form({ method: "POST", enctype: "multipart/form-data" },
        $textarea({ rows: 42, cols: 80, name: "content" }, content || title),
        $br(),
        $input({ type: "submit", value: "Save" }));
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(html_page({ title: title, lang: "en" },
          $style("textarea { white-space: pre; font-family: monospace; font-size: larger; }"),
          body));
  }

  // Get or create new content
  function wiki_get(response, path, title) {
    util.log("GET {0}".fmt(path));
    fs.stat(path, function (error, stats) {
      if (error) {
        util.log("{0}: new file `{1}`".fmt(error.message, title));
        output_form(response, title);
      } else {
        fs.readFile(path, function (error, data) {
          if (error) {
            util.log("{0}: cannot read file".fmt(error.message));
            output_error(response, 500);
          } else {
            util.log("read file OK");
            output_form(response, title, data.toString());
          }
        });
      }
    });
  }

  // Save data
  function wiki_post(response, path, title, data) {
    util.log("POST {0} ({1})".fmt(path, data.length));
    fs.writeFile(path, data, function (error) {
      if (error) {
        util.log("{0}: cannot save file".fmt(error.message));
      } else {
        util.log("wrote file OK");
        output_form(response, title, data);
      }
    });
  }

  function decode_form_data(data) {
    data = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var m = data.match(/^--\S+/);
    if (m) {
      var sep = m[0];
      var from = m.index + sep.length;
      m = data.substr(from).match(/\n\n/);
      if (m) {
        from += m.index + m[0].length;
        m = data.substr(from).match(sep);
        if (m) {
          return data.substr(from, m.index);
        }
      }
    }
    return data;
  }

  // Run the wiki
  function wiki(ip, port, dir) {
    http.createServer(function (request, response) {
      var u = url.parse(request.url);
      var path = dir + decodeURIComponent(u.pathname);
      var title = u.pathname.substr(1);
      if (request.method.toUpperCase() === "GET") {
        wiki_get(response, path);
      } else if (request.method.toUpperCase() === "POST") {
        var data = "";
        request.on("data", function (chunk) {
          data += chunk.toString();
        });
        request.on("error", function () {
          util.log("Could not get data for POST request?!");
          output_error(response, 500);
        });
        request.on("end", function () {
          wiki_post(response, path, title, decode_form_data(data));
        });
      } else {
        output_error(response, 405);
      }
    }).listen(port, ip, function () {
      util.log("http://{0}:{1} ready ({2})".fmt(ip || "localhost", port, dir));
    });
  };

  // Show help info and quit
  function show_help(node, name) {
    console.log("\nUsage: {0} {1} [options]\n\nOptions:".fmt(node, name));
    console.log("  help:                 show this help message");
    console.log("  ip=<ip address>:      IP address to listen to");
    console.log("  port=<port number>:   port number for the server");
    console.log("");
    process.exit(0);
  }

  if (require.main === module) {
    var port = 2888;
    var ip = "";
    var help = false;
    (function (args) {
      var m;
      args.forEach(function (arg) {
        if (m = arg.match(/^port=(\d+)/)) {
          port = parseInt(m[1], 10);
        } else if (m = arg.match(/^ip=(\S*)/)) {
          ip = m[1];
        } else if (arg.match(/^h(elp)?$/i)) {
          help = true;
        }
      });
    }(process.argv.slice(2)));
    if (help) {
      show_help.apply(null, process.argv);
    }
    wiki(ip, port, require("path").join(process.cwd(), "files"));
  }

}.call(exports));
