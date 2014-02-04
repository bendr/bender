"use strict";

var path = require("path");
var flexo = require("flexo");

exports.init = function (morbo) {

  var item = morbo.dir.item;
  morbo.dir.item = function (transaction, dirname, filename, stat) {
    if (stat.isFile()) {
      var m = filename.match(/\.xml$/);
      if (m) {
        dirname = path.relative(transaction.root, dirname);
        return flexo.$li(flexo.$a({ href: filename }, filename), " ",
          flexo.$a({ href: "/bender.html?href=%0/%1&trace=true"
            .fmt(dirname, filename), "class": "bender" }, "⚑ run"));
      }
    }
    return item(transaction, dirname, filename, stat);
  };

  var style = morbo.dir.style;
  morbo.dir.style = function (transaction) {
    var css = style(transaction);
    css.push(flexo.css(".bender", { color: "#a61416" }));
    return css;
  }

};
