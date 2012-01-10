// Simple Bender server based off SPQR

var server = require("./spqr.js");
var flexo = require("../flexo.js");

var PORT = 8910;
var IP = "";
var HELP = false;
server.DOCUMENTS = process.cwd();

// Parse arguments from the command line
function parse_args(args)
{
  var m;
  args.forEach(function(arg) {
      if (m = arg.match(/^port=(\d+)/)) {
        PORT = m[1];
      } else if (m = arg.match(/^ip=(\S*)/)) {
        IP = m[1];
      } else if (arg.match(/^h(elp)?$/i)) {
        HELP = true;
      } else if (m = arg.match(/^documents=(\S+)/)) {
        server.DOCUMENTS = m[1];
      }
    });
}

// Show help info and quit
function show_help(node, name)
{
  console.log("\nUsage: {0} {1} [options]\n\nOptions:".fmt(node, name));
  console.log("  help:                 show this help message");
  console.log("  ip=<ip address>:      IP address to listen to");
  console.log("  port=<port number>:   port number for the server");
  console.log("  documents=<apps dir>: path to the documents directory");
  console.log("");
  process.exit(0);
}

parse_args(process.argv.slice(2));
if (HELP) show_help.apply(null, process.argv);
server.run(IP, PORT, server.make_dispatcher([
    ["GET", /^\/favicon\.ico$/, function(req, response) {
        server.serve_error(req, response, 404, "Not found");
      }],
  ]));
