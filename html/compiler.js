"use strict";

var fs = require("fs");
var http = require("http");
var https = require("https");
var url = require("url");
var expat = require("node-expat");
var flexo = require("flexo");

function die(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}

function warn(message) {
  process.stderr.write(message + "\n");
}

var bender = exports;
bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


var environment = (bender.Environment = function () {
  this.scope = { environment: this };
  this.urls = {};
  this.components = [];
  // this.vertices = [];
  // this.vortex = this.add_vertex(new bender.Vortex());
}).prototype;

environment.start_element = function (nsuri, name, attrs, loc) {
  if (nsuri === bender.ns) {
    var f = environment.start_element[name];
    if (typeof f === "function") {
      return f.call(this, loc, attrs);
    }
    warn("%0: Unknown element “%1” in Bender namespace".fmt(loc, name));
  }
  return new bender.ForeignElement(loc, nsuri, name, attrs);
};

environment.start_element.component = function (loc, attrs) {
  return new bender.Component(this.scope, loc);
};

environment.start_element.view = function (loc) {
  return new bender.View(loc);
};


var element = (bender.Element = function () {}).prototype;

element.init = function (loc) {
  this.loc = loc;
  this.children = [];
  return this;
};

element.append_child = function (child) {
  if (child instanceof bender.Element) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
};


var component = flexo._class(bender.Component = function (scope, loc) {
  return element.init.call(this, loc).init(scope);
}, bender.Element);

component.init = function(scope) {
  if (scope.hasOwnProperty("environment")) {
    scope = Object.create(scope);
  }
  if (!scope.hasOwnProperty("")) {
    scope[""] = [];
  }
  scope[""].push(this);
  this.scope = Object.create(scope, {
    "#this": { enumerable: true, value: this },
    "@this": { enumerable: true, value: this }
  });
  return this;
};

component.append_child = function (child) {
  /*if (child instanceof bender.Link) {
    this.links.push(child);
  } else if (child instanceof bender.View) {
    if (this.scope.$view) {
      console.error("Component already has a view");
    } else {
      this.scope.$view = child;
    }
  } else if (child instanceof bender.Property) {
    this.add_property(child);
  } else if (child instanceof bender.Watch) {
    this.watches.push(child);
  } else {
    return;
  }
  this.add_descendants(child);*/
  if (child instanceof bender.View) {
    if (this.scope.view) {
      warn("%0: Component already has a view".fmt(child.loc));
    } else {
      this.scope.view = child;
    }
  }
  return element.append_child.call(this, child);
};


var view = flexo._class(bender.View = function(loc) {
  return element.init.call(this, loc);
}, bender.Element);


var foreign_element = flexo._class(bender.ForeignElement = function (loc,
      nsuri, name, attrs) {
  element.init.call(this, loc);
  this.nsuri = nsuri;
  this.name = name;
  this.attrs = attrs;
}


function parse(environment, text, href) {
  var parser = new expat.Parser();
  var element = new bender.Element().init();
  element._nsmap = { "": "" };
  parser.on("startElement", function (name, attrs) {
    var loc = "%0:%1".fmt(href, parser.getCurrentLineNumber());
    var prefixes = [];
    for (var attr in attrs) {
      if (attr === "xmlns") {
        prefixes.push(["", attrs[attr]]);
        delete attrs[attr];
      } else if (attr === "xmlns:") {
        die("%0: Namespace error: empty prefix".fmt(loc));
      } else if (attr.substr(0, 6) === "xmlns:") {
        prefixes.push([attr.substr(6), attrs[attr]]);
        delete attrs[attr];
      }
    }
    var nsmap = prefixes.length > 0 ?
      Object.create(element._nsmap) : element._nsmap;
    prefixes.forEach(function (p) {
      nsmap[p[0]] = p[1];
    });
    var nm = name.split(":");
    var nsuri = nsmap[nm[1] ? nm[0] : ""];
    if (typeof nsuri === "undefined") {
      die("%0: Namespace error: unknown prefix “%1”".fmt(loc, nm[0]));
    }
    name = nm[1] || nm[0];
    element = element.append_child(environment.start_element(nsuri,
        nm[1] || nm[0], attrs, loc));
    element._nsmap = nsmap;
  });
  parser.on("endElement", function (name) {
    delete element._nsmap;
    element = element.parent;
  });
  parser.on("text", function (text) {
  });
  if (!parser.parse(text)) {
    die("%0:%1: Parse error: %2"
        .fmt(href, parser.getCurrentLineNumber(), parser.getError()));
  }
  element = element.children[0];
  delete element.parent;
  return element;
}

function load(environment, uri_string) {
  var uri = url.parse(url.resolve("file://%0/".fmt(process.cwd()), uri_string));
  if (uri.protocol === "file:") {
    fs.readFile(uri.path, function (err, data) {
      if (err) {
        die(err);
      }
      parse(environment, data, uri.path);
    });
  } else if (uri.protocol === "http:") {
    load_req(environment, http.request, uri.href);
  } else if (uri.protocol === "https:") {
    load_req(environment, https.request, uri.href);
  } else {
    die("Unsupported protocol: %0".fmt(uri.protocol));
  }
}

function load_req(environment, f, href) {
  var req = f(href, function (response) {
    var chunks = [];
    response.on("data", function (chunk) {
      chunks.push(chunk);
    });
    response.on("end", function () {
      parse(environment, Buffer.concat(chunks).toString(), href);
    });
  });
  req.on("error", function (e) {
    die(e);
  });
  req.end();
}

if (require.main === module) {
  var environment = new bender.Environment();
  var argv = process.argv.slice(2);
  if (argv.length > 0) {
    load(environment, argv[0]);
  }
}
