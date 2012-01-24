// Morbo HTTP server for use with Bender
var fs = require("fs");
var http = require("http");
var path = require("path");
var url = require("url");
var util = require("util");
var flexo = require("./flexo.js");


// These can (and sometime should) be overridden

// Default document root
exports.DOCUMENTS = require("path").join(process.cwd(), "documents");

// Default server name
exports.SERVER_NAME = "MORBO";

// Patterns for dispatch. A pattern has three parts:
//   * the method to match (e.g. "GET", "POST", etc.)
//   * the pathname to match as a regex
//   * the callback function for a succesful match f(transaction, matches)
//   * an optional name parameter so that the pattern can be overriden
exports.PATTERNS =
[
  // TODO default favicon
  ["GET", /^\/favicon\.ico$/, function(transaction) {
      transaction.serve_error(404, "No favicon");
    }, "favicon"],
  ["GET", /^\/flexo.js$/, function(transaction) {
      transaction.serve_file_from_path("./flexo.js");
    }, "flexo"]
];

// Known MIME types associated with file extensions
exports.TYPES =
{
  css: "text/css",
  es: "application/ecmascript",
  html: "text/html",
  jpg: "image/jpeg",
  js: "application/javascript",
  json: "application/json",
  m4v: "video/mp4",
  manifest: "text/cache-manifest",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  png: "image/png",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  ttf: "application/octet-stream",
  wav: "audio/x-wav",
  xml: "application/xml",
  xhtml: "application/xhtml+xml",
  xslt: "application/xslt+xml",
};

// Known error codes
exports.STATUS_CODES =
{
  // 1xx Informational
  100: "Continue", 101: "Switching Protocols",
  // 2xx Successful
  200: "OK", 201: "Created", 202: "Accepted",
  203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content",
  206: "Partial Content",
  // 3xx Redirection
  300: "Multiple Choices", 301: "Moved Permanently", 302: "Found",
  303: "See Other", 304: "See Other", 305: "Use Proxy", 306: "(Unused)",
  307: "Temporary Redirect",
  // 4xx Client error
  400: "Bad Request", 401: "Unauthorized", 402: "Payment Required",
  403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  406: "Not Acceptable", 407: "Proxy Authentication Required",
  408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required",
  412: "Precondition Failed", 413: "Request Entity Too Large",
  414: "Request-URI Too Long", 415: "Unsupported Media Type",
  416: "Request Range Not Satisfiable", 417: "Expectation Failed",
  // 5xx Server error
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
  505: "HTTP Version Not Supported"
};


// A transaction object so that we don't have to pass request/response
// everywhere
exports.TRANSACTION =
{
  init: function(server, request, response)
  {
    this.server = server;
    this.request = request;
    this.response = response;
    this.url = url.parse(request.url);
    return this;
  },

  // Serve data by writing the correct headers (plus the ones already given, if
  // any) and the data
  serve_data: function(code, type, data, params)
  {
    write_head(this, code, type, data, params);
    if (this.request.method.toUpperCase() === "HEAD") {
      this.response.end();
    } else {
      this.response.end(data);
    }
  },

  // Return an error as text with a code and an optional debug message
  // TODO provide a function to customize error pages
  serve_error: function(code, debug)
  {
    var msg = exports.STATUS_CODES[code] || "(unknown error code)";
    if (debug) util.log("error {0}: {1} ({2})".fmt(code, msg, debug));
    this.serve_data(code, "text/plain", "{0} {1}\n".fmt(code, msg));
  },

  // Serve file from a known pathname
  serve_file_from_path: function(path_)
  {
    fs.stat(path_, (function(error, stats) {
        if (error) {
          this.serve_error(500, "serve_file_from_path: " + error);
        } else if (!stats.isFile()) {
          this.serve_error(500,
            "serve_file_from_path: Expected a file at " + path_);
        } else {
          serve_file(this, path_, stats);
        }
      }).bind(this));
  },

  // Serve a string as an HTML document
  serve_html: function(html)
  {
    this.serve_data(200, exports.TYPES.html, html);
  },

  // Return a js value encoded as JSON.
  // Set the raw flag to prevent the data to be reencoded.
  serve_json: function(result, raw)
  {
    var data = raw ? result : JSON.stringify(result);
    this.serve_data(200, exports.TYPES.json, data);
  }
};


// Run the server on the given port/ip, using the patterns list for dispatch
// (default is simply to serve a file in the DOCUMENTS directory with the given
// pathname)
// TODO instead of passing the match object, pass the matched items as
// additional arguments
exports.run = function(ip, port)
{
  http.createServer(function(request, response) {
      var transaction = Object.create(exports.TRANSACTION)
        .init(exports, request, response);
      var pathname = decodeURIComponent(transaction.url.pathname);
      var method = request.method.toUpperCase();
      if (method === "HEAD") method = "GET";
      var m;
      for (var i = 0, n = exports.PATTERNS.length; i < n; ++i) {
        if (method === exports.PATTERNS[i][0].toUpperCase() &&
          (m = pathname.match(exports.PATTERNS[i][1]))) {
          var args = m.slice(1);
          args.unshift(transaction);
          return exports.PATTERNS[i][2].apply(exports, args);
        }
      }
      if (method === "GET") {
        serve_file_or_index(transaction, pathname);
      } else {
        util.log("Method {0} not allowed for {1}".fmt(method, pathname));
        // TODO find out all allowed methods
        transaction.response.setHeader("Allow", "GET, HEAD");
        transaction.serve_error(405);
      }
    }).listen(port, ip, function() {
      util.log("http://{0}:{1} ready".fmt(ip || "localhost", port));
    });
};

// Utility functions used internally

// Check that path p is rooted at root
function check_path(path_, root)
{
  root = path.normalize(root);
  var abs = path.normalize(path_);
  var ok = abs.substr(0, root.length) === root;
  return ok;
}

// Serve a file from its actual path after we checked that it is indeed a file.
// Pass the stats result along to fill out the headers, and the URI if it was a
// directory request to set the Content-Location header
function serve_file(transaction, path_, stats, uri)
{
  var type = exports.TYPES[path.extname(path_).substr(1).toLowerCase()] || "";
  var params = { "Last-Modified": stats.mtime.toUTCString(),
    ETag: "\"{0}-{1}-{2}\"".fmt(stats.ino.toString(16),
      stats.size.toString(16), stats.mtime.valueOf().toString(16)) };
  if (uri) params["Content-Location"] = uri;
  if (transaction.request.headers.hasOwnProperty("range")) {
    var m = (transaction.request.headers.range.match(/^bytes=(\d+)\-(\d*)/));
    if (m) {
      var from = parseInt(m[1], 10);
      var to = m[2] ? parseInt(m[2], 10) : stats.size - 1;
      var size = to - from + 1;
      params["Accept-Ranges"] = "bytes";
      if (size < stats.size) {
        var buffers = [];
        var length = 0;
        var file = fs.createReadStream(path_);
        file.on("data", function(chunk) {
            buffers.push(chunk);
            length += chunk.length;
          });
        file.on("end", function() {
            var buffer = new Buffer(length);
            var pos = 0;
            buffers.forEach(function(b) {
                b.copy(buffer, pos);
                pos += b.length;
              });
            params["Content-Length"] = size;
            params["Content-Range"] = "bytes {0}-{1}/{2}"
              .fmt(from, to, stats.size);
            write_head(transaction, 206, type, null, params);
            if (transaction.request.method.toUpperCase() === "HEAD") {
              transaction.response.end();
            } else {
              transaction.response.write(buffer.slice(from, size));
            }
          });
        return;
      }
    } else {
      transaction.serve_error(416, "Unsupported range request \"{0}\""
          .fmt(transaction.request.headers.range));
      return;
    }
  }
  params["Content-Length"] = stats.size;
  write_head(transaction, 200, type, null, params);
  if (transaction.request.method.toUpperCase() === "HEAD") {
    transaction.response.end();
  } else {
    util.pump(fs.createReadStream(path_), transaction.response);
  }
}

// Simply serve the requested file if found, otherwise return a 404/500 error
// or a 403 error if it's not a file. The index parameter is set to true when
// we're looking for the index page of a directory. No directory listing at the
// moment.
// TODO optionally allow directory listing
// TODO alternatives for index page
function serve_file_or_index(transaction, uri, index)
{
  var path_ = path.join(exports.DOCUMENTS, uri);
  if (!check_path(path_, exports.DOCUMENTS)) {
    transaction.serve_error(403, "Path \"{0}\" is out of bounds".fmt(path_));
  }
  path.exists(path_, function(exists) {
      if (!exists) {
        if (index) {
          return transaction.serve_error(403,
            "serve_file_or_index: Index page \"{0}\" not found".fmt(path_));
        } else {
          return transaction.serve_error(404,
            "serve_file_or_index: File \"{0}\" not found".fmt(path_));
        }
      }
      fs.stat(path_, function(error, stats) {
          if (error) {
            return transaction.serve_error(500,
              "serve_file_or_index: " + error);
          }
          if (stats.isFile()) {
            serve_file(transaction, path_, stats, index ? uri : undefined);
          } else if (stats.isDirectory() && /\/$/.test(path_)) {
            serve_file_or_index(transaction, path.join(uri, "index.html"),
                true);
          } else {
            transaction.serve_error(403,
              "serve_file_or_directory: no access to \"{0}\"".fmt(path_));
          }
        });
    });
}

// Write the correct headers (plus the ones already given, if any)
// TODO don't replace headers that have already been set
function write_head(transaction, code, type, data, params)
{
  if (typeof params !== "object") params = {};
  if (!params.hasOwnProperty("Content-Length")) {
    params["Content-Length"] = data ? Buffer.byteLength(data.toString()) : 0;
  }
  if (type && !params.hasOwnProperty("Content-Type")) {
    /*if (!(/\bcharset=/.test(type)) &&
        (/^(audio|image|video)\//.test(type) ||
         type === "application/octet-stream")) {
      type += "; charset=utf-8";
    }*/
    params["Content-Type"] = type;
  }
  params.Date = (new Date()).toUTCString();  // works in V8; should be stricter
  params.Server = exports.SERVER_NAME;
  transaction.response.writeHead(code, params);
}


// HTML creation

// Shortcut for HTML elements: the element name prefixed by a $ sign
// See http://dev.w3.org/html5/spec/Overview.html#elements-1
["a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
  "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
  "cit", "code", "col", "colgroup", "command", "datalist", "dd", "del",
  "details", "dfn", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins",
  "kbd", "keygen", "label", "legend", "li", "link", "map", "mark", "menu",
  "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option",
  "output", "p", "param", "pre", "progress", "q", "rp", "rt", "ruby", "s",
  "samp", "script", "section", "select", "small", "source", "span", "strong",
  "style", "sub", "summary", "sup", "table", "tbody", "td", "textarea",
  "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var",
  "video", "wbr"].forEach(function(tag) {
    this["$" + tag] = html_tag.bind(this, tag);
  });

// Make a (text) HTML tag; the first argument is the tag name. Following
// arguments are the contents (as text; must be properly escaped.) If the last
// argument is a boolean, it is treated as a flag to *not* close the element
// when true (i.e. for elements that are incomplete or HTML elements that do not
// need to be closed)
// TODO handle encoding (at least of attribute values)
function html_tag(tag)
{
  var out = "<" + tag;
  var contents = [].slice.call(arguments, 1);
  if (typeof contents[0] === "object") {
    var attrs = contents.shift();
    for (a in attrs) {
      var v = attrs[a];
      // true and false act as special values: when true, just output the
      // attribute name (without any value); when false, skip the attribute
      // altogether
      if (v !== false) {
        out += (v === true ? " {0}" : " {0}=\"{1}\"").fmt(a, v);
      }
    }
  }
  out += ">";
  var keep_open = typeof contents[contents.length - 1] === "boolean" ?
    contents.pop() : false;
  out += contents.join("");
  if (!keep_open) out += "</{0}>".fmt(tag);
  return out;
}


// Run the server

var APPS = [];
var PORT = 8910;
var REDIS_PORT;
var IP = "";
var HELP = false;

// Parse arguments from the command line
function parse_args(args)
{
  var m;
  args.forEach(function(arg) {
      if (m = arg.match(/^port=(\d+)/)) {
        PORT = parseInt(m[1], 10);
      } else if (m = arg.match(/^redis=(\d+)/)) {
        REDIS_PORT = parseInt(m[1], 10);
      } else if (m = arg.match(/^ip=(\S*)/)) {
        IP = m[1];
      } else if (arg.match(/^h(elp)?$/i)) {
        HELP = true;
      } else if (m = arg.match(/^documents=(\S+)/)) {
        exports.DOCUMENTS = m[1];
      } else if (m = arg.match(/^app=(\S+)/)) {
        APPS.push(m[1]);
      }
    });
}

// Show help info and quit
function show_help(node, name)
{
  console.log("\nUsage: {0} {1} [options]\n\nOptions:".fmt(node, name));
  console.log("  app=<app.js>:         path to application file");
  console.log("  documents=<apps dir>: path to the documents directory");
  console.log("  help:                 show this help message");
  console.log("  ip=<ip address>:      IP address to listen to");
  console.log("  port=<port number>:   port number for the server");
  console.log("  redis=<port number>:  port number for the Redis server");
  console.log("");
  process.exit(0);
}

parse_args(process.argv.slice(2));
if (HELP) show_help.apply(null, process.argv);

APPS.forEach(function(a) {
    var app = require(a);
    [].push.apply(exports.PATTERNS, app.PATTERNS);
  });

if (REDIS_PORT) {
  var redis = require("redis").createClient(REDIS_PORT);
  exports.TRANSACTION.redis = redis;
  exports.TRANSACTION.rwrap = function(f)
  {
    var transaction = this;
    return function(err) {
        if (err) {
          transaction.serve_error(500, "Redis error: " + err);
        } else {
          f.apply(transaction, [].slice.call(arguments, 1));
        }
      };
  };
  redis.on("error", function(err) {
      util.log("Redis error:", err);
      process.exit(1);
    });
  redis.on("ready", function() {
      util.log("redis ready ({0})".fmt(redis.port));
      exports.run(IP, PORT);
    });
} else {
  exports.run(IP, PORT);
}
