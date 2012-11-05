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

// Icons from raphael.js

function directory_icon() {
  return morbo.$svg({ "class": "icon folder", "viewBox": "0 0 32 32" },
      morbo.$path({ d: "M28.625,26.75h-26.5V8.375h1.124c1.751,0,0.748-3.125,3-3.125c3.215,0,1.912,0,5.126,0c2.251,0,1.251,3.125,3.001,3.125h14.25V26.75z" }));
}

function file_icon() {
  return morbo.$svg({ "class": "icon file", "viewBox": "0 0 32 32" },
      morbo.$path({ d: "M23.024,5.673c-1.744-1.694-3.625-3.051-5.168-3.236c-0.084-0.012-0.171-0.019-0.263-0.021H7.438c-0.162,0-0.322,0.063-0.436,0.18C6.889,2.71,6.822,2.87,6.822,3.033v25.75c0,0.162,0.063,0.317,0.18,0.435c0.117,0.116,0.271,0.179,0.436,0.179h18.364c0.162,0,0.317-0.062,0.434-0.179c0.117-0.117,0.182-0.272,0.182-0.435V11.648C26.382,9.659,24.824,7.49,23.024,5.673zM22.157,6.545c0.805,0.786,1.529,1.676,2.069,2.534c-0.468-0.185-0.959-0.322-1.42-0.431c-1.015-0.228-2.008-0.32-2.625-0.357c0.003-0.133,0.004-0.283,0.004-0.446c0-0.869-0.055-2.108-0.356-3.2c-0.003-0.01-0.005-0.02-0.009-0.03C20.584,5.119,21.416,5.788,22.157,6.545zM25.184,28.164H8.052V3.646h9.542v0.002c0.416-0.025,0.775,0.386,1.05,1.326c0.25,0.895,0.313,2.062,0.312,2.871c0.002,0.593-0.027,0.991-0.027,0.991l-0.049,0.652l0.656,0.007c0.003,0,1.516,0.018,3,0.355c1.426,0.308,2.541,0.922,2.645,1.617c0.004,0.062,0.005,0.124,0.004,0.182V28.164z" }));
}

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
          var icon;
          if (stats.isDirectory()) {
            file += "/";
            icon = directory_icon();
          } else {
            icon = file_icon();
          }
          return morbo.$li(
            icon,
            morbo.$a({ href: path.join(p, file), "class": "path" },
              file));
        }).join("")
      );
    transaction.serve_html(morbo.html_page({ title: p },
          morbo.$$stylesheet("/morbo.css") + head, body));
  });
};
