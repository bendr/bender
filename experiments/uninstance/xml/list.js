"use strict";

var fs = require("fs");
var path = require("path");
var flexo = require("flexo");

exports.init = function (morbo) {

  var list_xml = function (tr, pathname) {
    try {
      var dirname = tr.local_path(pathname);
      morbo.promisify(fs.readdir, dirname).then(function (files) {
        return flexo.collect_promises(files.map(function (filename) {
          var filepath = path.normalize(path.join(dirname, filename));
          return morbo.promisify(fs.lstat, filepath).then(function (stat) {
            var a = {};
            if (stat.isFile()) {
              var m = filename.match(/\.xml$/);
              if (m) {
                return flexo.$li(flexo.$a({ href: filename }, filename), " ",
                  flexo.$a({ href: "/bender.html?href=%0/%1"
                    .fmt(pathname, filename), "class": "bender" }, "run"));
              }
            } else if (stat.isDirectory()) {
              filename += "/";
              a["class"] = "dir";
            } else if (stat.isSymbolicLink()) {
              a["class"] = "link";
            }
            a.href = filename;
            return flexo.$li(flexo.$a(a, filename));
          });
        }));
      }).then(function (files) {
        files.unshift(flexo.$li(flexo.$a({ "class": "dir", href: "../" },
              "parent directory")));
        var relative = path.relative(tr.root, dirname);
        tr.serve_html(morbo.html({ title: "Directory listing of %0/"
          .fmt(relative) },
          flexo.$style(
            flexo.css("body", { "font-family": "Univers, Avenir, sans-serif" }),
            flexo.css("a", { "text-decoration": "none", color: "#ff4040" }),
            flexo.css("ul", { "list-style-type": "none", padding: 0 }),
            flexo.css(".bender", { color: "#0b486b", "font-weight": "bold" }),
            flexo.css(".dir", { "font-weight": "bold" }),
            flexo.css(".link", { "font-style": "italic" })),
          flexo.$ul(files.join(""))));
      }).then(flexo.nop, function (err) {
        console.log(err);
        tr.serve_error(500);
      });
    } catch (e) {
      console.log(e);
      tr.serve_error(403);
    }
  };

  exports.routes = [
    ["^(/xml)/$", { GET: list_xml }]
  ];

};
