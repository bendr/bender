"use strict";

var fs = require("fs");
var path = require("path");
var morbo = require("morbo");

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
      morbo.$h1(p) +
      morbo.$ul(
        files.map(function (file) {
          var stats = fs.statSync(path.join(dir_path, file));
          if (stats.isDirectory()) {
            file += "/";
          }
          return morbo.$li(morbo.$a({ href: path.join(p, file) }, file));
        }).join("")
      );
    transaction.serve_html(morbo.html_page({ title: p }, head, body));
  });
};
