"use strict";

var fs = require("fs");
var path = require("path");
var morbo = require("morbo");

exports.PATTERNS = [
  [/^\/morbo.css/, { GET: function(tr) {
    tr.serve_file_from_path(path.join(path.dirname(module.filename),
          "morbo.css"));
  } }]
];

// List contents of directory given its path
morbo.list_directory = function (transaction, dir_path) {
  fs.readdir(dir_path, function (err, files) {
    if (err) {
      return transaction.serve_error(500,
        "list_directory: {0}".fmt(err.message));
    }
    var p = dir_path.substr(morbo.DOCUMENTS.length);
    if (p !== "/") {
      files.unshift("..");
    }
    var head = "";
    var body =
      morbo.$h1({ "class": "path" }, p) +
      morbo.$ul({ "class": "directories" },
        files.map(function (file) {
          var stats = fs.statSync(path.join(dir_path, file));
          if (stats.isDirectory()) {
            file += "/";
          }
          return morbo.$li(
            morbo.$a({ href: path.join(p, file), "class": "path" },
              file));
        }).join("")
      );
    transaction.serve_html(morbo.html_page({ title: p },
          morbo.$$stylesheet("/morbo.css") + head, body));
  });
};
