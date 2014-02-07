var fs = require("fs");
var http = require("http");
var url = require("url");

var expat = require("node-expat");

var bender = require("bender");

bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


function start_element(name, attrs) {
  this.__nsmap = Object.create(this.__nsmap);
  for (var attr in attrs) {
    if (attr.substr(0, 6) === "xmlns:") {
      this.__nsmap[attr.substr(6)] = attrs[attr];
    } else if (attr === "xmlns") {
      this.__nsmap[""] = attrs[attr];
    }
  }
  var nm = name.split(":");
  name = nm.pop();
  var nsuri = this.__nsmap[nm[0] || ""];
  if (nsuri === bender.ns) {
    var f = start_element[name];
    if (typeof f === "function") {
      this.__stack.push(f.call(this, attrs));
    } else {
      console.warn("Unknow element in Bender namespace: “%0” in %1"
          .fmt(name, this.__uri));
      this.__stack.push(bender.DOMElement.create(nsuri, name));
    }
  } else {
    this.__stack.push(bender.DOMElement.create(nsuri, name));
  }
  var n = this.__stack.length - 1;
  if (n > 0) {
    this.__stack[n - 1].insert_child(this.__stack[n]);
  }
}

start_element.attribute = function (attrs) {
  return bender.Attribute.create(flexo.safe_string(attrs.ns),
      flexo.safe_string(attrs.name)).id(attrs.id);
};

start_element.component = function (attrs) {
  // TODO: href, &c.
  return this.__environment.component().id(attrs.id);
};

start_element.content = function (attrs) {
  return bender.Content.create().id(attrs.id)
    .renderId(attrs["render-id"] || attrs.renderId);
};

start_element.text = function (attrs) {
  return bender.Text.create().id(attrs.id);
};

start_element.view = function (attrs) {
  return bender.View.create().id(attrs.id);
};


function end_element(name) {
  this.__nsmap = Object.getPrototypeOf(this.__nsmap);
  var elem = this.__stack.pop();
  if (this.__stack.length === 0) {
    this.__promise.fulfill(elem);
  }
}

function text(t) {
  var parent = this.__stack[this.__stack.length - 1];
  var f = parent && text[parent.tag];
  if (f) {
    f.call(parent, t);
  }
}

text.attribute = bender.Attribute.insert_child;
text.content = bender.Content.insert_child;
text.dom = bender.DOMElement.insert_child;
text.view = bender.View.insert_child;
text.text = bender.Text.text;


bender.NodeEnvironment = flexo._ext(bender.Environment, {
  init: function () {
    bender.Environment.init.call(this);
    this.cwd = process.cwd() + require("path").sep;
    return this;
  },
  
  load_component: function (href) {
    href = url.resolve(this.cwd, href);
    if (this.urls[href]) {
      return this.urls[href];
    }
    var promise = this.urls[href] = new flexo.Promise();
    var protocol = url.parse(href).protocol;
    var parser = new expat.Parser("UTF-8");
    parser.on("startElement", start_element);
    parser.on("endElement", end_element);
    parser.on("text", text);
    var parse = function (data) {
      parser.__stack = [];
      parser.__nsmap = { "": "" };
      parser.__promise = promise;
      parser.__environment = this;
      parser.__uri = href;
      parser.write(data);
    }.bind(this);
    if (protocol === "http:") {
      http.get(href, function (response) {
        var data = "";
        response.on("data", function (chunk) {
          data += chunk.toString();
        });
        response.on("end", function () {
          parse(data);
        });
      });
    } else if (protocol === "file:" || protocol == null) {
      fs.readFile(href, function (error, data) {
        if (error) {
          return promise.reject(error);
        }
        parse(data);
      });
    }
    return promise;
  },

  deserialize: function (node, promise) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      if (node.namespaceURI === bender.ns) {
        var f = this.deserialize[node.localName];
        if (typeof f === "function") {
          return f.call(this, node, promise);
        } else {
          console.warn("Unknow element in Bender namespace: “%0” in %1"
              .fmt(node.localName, node.baseURI));
        }
      } else {
        return this.deserialize_foreign(node);
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      return bender.Text.create().text(node.textContent);
    }
  }

});

var env = Object.create(bender.NodeEnvironment).init();
env.load_component(process.argv[2]).then(function (parsed) {
  console.log(require("util").inspect(parsed, false, null));
}, function (error) {
  console.error(error);
});
