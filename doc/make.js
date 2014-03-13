var exec = require("child_process").exec;
var util = require("util");
var chokidar = require("chokidar");

chokidar.watch(".", { persistent: true }).on("add", make).on("change", make);

function make(path) {
  if (path.match(/\.xml$/)) {
    var d = new Date();
    var date = util.format("%s %s %s %s",
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
        d.getDate(),
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Sep", "Oct", "Nov",
        "Dec"][d.getMonth()],
        d.getFullYear());
    var cmd = util.format("xsltproc --stringparam date \"%s\" -o %s doc.xslt %s",
        date, path.replace(/\.xml$/, ".html"), path
      );
    console.log(cmd);
    exec(cmd, function (error, stdout, stderr) {
      if (error) {
        console.error("Error:", error);
      }
    });
  }
}
