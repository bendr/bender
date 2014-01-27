/* global console, process, require */
// jshint -W097

"use strict";

var flexo = require("flexo");
var bender = require("../core.js");

function get_args(argv, args) {
  var m;
  argv.forEach(function (arg) {
    if ((m = arg.match(/^-?-?h(?:elp)?$/i))) {
      args.help = true;
    } else if ((m = arg.match(/^-?-?href=(\S+)$/i))) {
      args.href = m[1];
    } else if ((m = arg.match(/^-?-?id=(\S+)$/i))) {
      args.id = m[1];
    } else if ((m = arg.match(/^-?-?v(?:iew)?=(\S*)$/i))) {
      var v = flexo.safe_trim(m[1]).toLowerCase();
      args.view = v === "html" || v === "svg" ? v : false;
    }
  });
  return args;
}

// Show help info and quit.
function show_help(node, name) {
  console.log("\nUsage: %0 %1 [options]\n\nOptions:".fmt(node, name));
  console.log("  help:        show this help message");
  console.log("  href=<href>: href argument");
  console.log("  id=<id>:     ID of the component");
  console.log("  view=<ns>:   namespace for the view (none, html, or svg)");
  console.log("");
  process.exit(0);
}

var args = get_args(process.argv.slice(2), {
  view: "html",
});
if (args.help) {
  show_help.apply(null, process.argv);
}

var view = "";
if (args.view) {
  var attrs = {};
  attrs["xmlns:" + args.view] = flexo.ns[args.view];
  view = flexo.xml_tag("view", attrs, "\n  \n  ");
}
console.log(flexo.xml_tag("component", { xmlns: bender.ns, href: args.href,
  id: args.id }, view));

