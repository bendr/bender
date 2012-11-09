"use strict";

var A = Array.prototype;

var context = bender.create_context(document.querySelector(".live-view"));
var instance = context.documentElement.appendChild(
  context.$("component",
    context.$("property", { name: "x" }),
    context.$("view",
      context.$("html:p", "Hello, world!"),
      context.$("html:p", "x = {x}"))
  )._create_instance());


show_tree(instance._component);

function show_tree(tree) {
  var show = function (node, ul) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      var name = node.localName;
      if (node.namespaceURI !== bender.ns) {
        var prefix = Object.keys(flexo.ns).reduce(function (p, v) {
          return p || flexo.ns[v] === node.namespaceURI && v;
        });
        name = (prefix || node.namespaceURI) + ":" + name;
      }
      var li = ul.appendChild(flexo.$("li.elem-node",
            flexo.$("span.elem-name", name)));
      A.forEach.call(node.attributes, function (attr) {
        li.appendChild(flexo.$("span.attr",
            flexo.$("span.name", attr.name), "=",
            flexo.$("span.value", attr.value)));
      });
      if (node.childNodes.length > 0) {
        var ul = li.appendChild(flexo.$ul());
        A.forEach.call(node.childNodes, function (ch) {
          show(ch, ul);
        });
      }
    } else if (node.nodeType === window.Node.TEXT_NODE ||
        node.nodeType === window.Node.CDATA_SECTION_NODE) {
      ul.appendChild(flexo.$("li.text-node", node.textContent));
    }
  };
  var dest = document.querySelector(".tree-view");
  flexo.remove_children(dest);
  show(tree, dest.appendChild(flexo.$ul()));
}
