// Simple HTTP server for Bender

var HOST = "127.0.0.1";
var PORT = 8910;
var TYPES = {
  "": "text/plain",
  "css": "text/css",
  "html": "text/html",
  "js": "application/javascript",
  "svg": "image/svg+xml",
  "xml": "text/xml",
};

var fs = require("fs");
var http = require("http");
var url = require("url");
var util = require("util");
var flexo = require("../core/flexo.js");

function ok()
{
  process.stdout.write("\033[0;42m\033[1;33mOK\033[0m\t");
  console.log.apply(console, arguments);
}

function warn()
{
  process.stdout.write("\033[0;43m\033[1;31mWARNING\033[0m\t");
  console.log.apply(console, arguments);
}

function error()
{
  process.stdout.write("\033[0;41m\033[1;33mERROR\033[0m\t");
  console.log.apply(console, arguments);
}

function debug(what)
{
  process.stdout.write("\033[0;44m\033[1;37m{0}\033[0m\t".fmt(what));
  console.log.apply(console, [].slice.call(arguments, 1));
}

function solve_path(path)
{
  try {
    var real = fs.realpathSync(process.cwd() + "/" + path);
    debug("path", "{0} -> {1}".fmt(path, real));
    return real;
  } catch(e) {
    error("no path for {0}?!".fmt(path));
  }
}

function serve_file(path, res)
{
  var stats = fs.statSync(path);
  if (stats.isFile()) {
    var m = path.match(/\.([^.]+)$/);
    var type = TYPES[m && m[1]] || TYPES[""];
    res.writeHead(200, { "Content-Type": type,
      "Content-Length": stats.size });
    var stream = fs.createReadStream(path);
    util.pump(stream, res);
    ok("200 {0} {1} {2}".fmt(path, type, stats.size));
    return true;
  }
}

http.createServer(function (req, res) {
    debug("req", "{0} {1}".fmt(req.method, req.url));
    for (var h in req.headers) {
      debug("req", "  {0}: {1}".fmt(h, req.headers[h]));
    }
    if (req.method === "GET") {
      var url_ = url.parse(req.url);
      var path = solve_path(url_.pathname);
      if (path) {
        if (!serve_file(path, res)) {
          var index = solve_path(url_.pathname + "index.html");
          if (!index || !serve_file(index, res)) {
            warn("403 Forbidden");
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("403 Forbidden\n");
          }
        }
      } else {
        warn("404 Not Found");
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found\n");
      }
    } else {
      error("501 Not Implemented");
      res.writeHead(501, { "Content-Type": "text/plain" });
      res.end("501 Not Implemented\n");
    }
  }).listen(PORT, HOST);

ok("Server running on {0}:{1}".fmt(HOST, PORT));
debug("info", "current directory: {0}".fmt(process.cwd()));
