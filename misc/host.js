var fs = require("fs");
var url = require("url");

exports.PATTERNS =
[
  ["GET", "^\/fs\/readdir$", readdir],
  ["GET", "^\/fs\/readFile$", readFile],
  ["PUT", "^\/fs\/writeFile$", writeFile],
];

function get_params(transaction, required)
{
  var params = url.parse(transaction.request.url, true).query;
  var missing = required ?
    required.filter(function(p) { return !params.hasOwnProperty(p); }) : [];
  if (missing.length > 0) {
    transaction.serve_error(400, "Missing parameter{0} for {1}: {2}"
        .fmt(missing.length > 1 ? "s" : "", transaction.request.url,
          missing.join(", ")));
  } else {
    return params;
  }
}

function readdir(transaction)
{
  var params = get_params(transaction, ["path"]);
  if (params) {
    fs.readdir(params.path, function() {
        transaction.serve_json([].slice.call(arguments));
      });
  }
}

function readFile(transaction)
{
  var params = get_params(transaction, ["filename"]);
  if (params) {
    if (!params.hasOwnProperty("encoding")) params.encoding = "utf8";
    fs.readFile(params.filename, params.encoding, function() {
        transaction.serve_json([].slice.call(arguments));
      });
  }
}

function writeFile(transaction)
{
  var data = "";
  transaction.request.on("data", function(chunk) { data += chunk.toString(); });
  transaction.request.on("error", function(exception) {
      transaction.serve_error(500, exception);
    });
  transaction.request.on("end", function() {
      var params = get_params(transaction, ["filename"]);
      if (params) {
        if (!params.hasOwnProperty("encoding")) params.encoding = "utf8";
        fs.writeFile(params.filename, data, params.encoding, function() {
            transaction.serve_json([].slice.call(arguments));
          });
      }
    });
}
