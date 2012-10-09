var fs = require("fs");
var path = require("path");
var md = require("github-flavored-markdown");

var WIKI_PATH = "../wiki";

exports.PATTERNS = [
  [/^\/wiki\/$/, {
    GET: function(transaction) {
      fs.readdir(WIKI_PATH, function(error, filenames) {
          if (error) {
            transaction.serve_error(500, "wiki: " + error);
          } else {
            transaction.serve_html(head() +
              $h1("Bender Wiki") +
              $ul(
                filenames.filter(function(name) { return /\.md$/.test(name); })
                  .map(function(name) {
                      return $ul($a({ href: "/wiki/" + name }, name));
                    }).join("")) +
              tail());
          }
        });
    }} ],
  [/^\/wiki\/(.*)$/, { GET: function(transaction, p) {
      fs.readFile(path.join(WIKI_PATH, p), function(error, data) {
          if (error) {
            transaction.serve_error(500, "wiki: " + error);
          } else {
            transaction.serve_html(head() + md.parse(data.toString()) + tail());
          }
        });
    }} ]
];
