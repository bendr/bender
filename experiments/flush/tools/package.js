/* global console, process, require */
// jshint -W097

"use strict";

var fs = require("fs");
var path = require("path");
var util = require("util");
var uglify = require("uglify-js");
var flexo = require("flexo");
var bender = require("../core.js");

var files = {
  node: ["core", "s11n"],
  html: ["core", "html", "s11n"]
};

function get_args(argv, args) {
  var m;
  argv.forEach(function (arg) {
    if ((m = arg.match(/^-?-?h(?:elp)?$/i))) {
      args.help = true;
    } else if ((m = arg.match(/^-?-?m(?:in(?:imized?)?)?(?:=(\S+))$/i))) {
      args.minimized = !m[1] || flexo.is_true(m[1]);
    } else if ((m = arg.match(/^-?-?n(?:ode)?$/i))) {
      args.node = true;
    } else if ((m = arg.match(/^-?-?o(?:ut)?=(\S+)$/i))) {
      args.out = m[1];
    } else if ((m = arg.match(/^-?-?p(?:ath)?=(\S+)$/i))) {
      args.path = m[1];
    }
  });
  return args;
}

// Show help info and quit.
function show_help(node, name) {
  console.log("\nUsage: %0 %1 [options]\n\nOptions:".fmt(node, name));
  console.log("  help:                   show this help message");
  console.log("  minimized=<true|false>: minimize the output");
  console.log("  node:                   build for node rather than browser");
  console.log("  out=<file>              output file");
  console.log("  path=<path>             path to source files");
  console.log("");
  process.exit(0);
}

var args = get_args(process.argv.slice(2), {
  minimized: true,
  node: false,
  out: "bender-%s",
  path: "."
});
if (args.help) {
  show_help.apply(null, process.argv);
}
args.path = path.resolve(process.cwd(), args.path);

var cat = "(function(){";
files[args.node ? "node" : "html"].forEach(function (file) {
  var filename = path.join(args.path, file) + ".js";
  console.log(filename);
  var code = fs.readFileSync(filename, "utf8");
  cat += code;
});
cat += "}());";
try {
  var ast = uglify.parse(cat);
  if (args.minimized) {
    ast.figure_out_scope();
    ast = ast.transform(uglify.Compressor());
    ast.figure_out_scope();
    ast.compute_char_frequency();
    ast.mangle_names();
  }
  var out = ast.print_to_string();
  if (args.out === "-") {
    console.log(out);
  } else {
    fs.writeFileSync(util.format(args.out + ".js", bender.VERSION), out);
  }
} catch (e) {
  console.error(e);
}
