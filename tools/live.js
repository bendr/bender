"use strict";

var context = bender.create_context();

function use(component) {
  var u = context.$("use");
  u._component = component;
  return u;
}

var tree_use = context.appendChild(use(context.appendChild(
  context.$("component",
    context.$("view",
      context.$("html:ul"))))));

var app_use = context.appendChild(use(context.appendChild(
  context.$("component"))));

var live_use = context.appendChild(use(context.appendChild(
  context.$("app",
    context.$("view",
      context.$("html:div",
        context.$("html:div#tree",
          tree_use),
        context.$("html:div#app",
          app_use)))))));

flexo.listen(context.ownerDocument, "@refreshed", function (e) {
  if (e.instance.use === tree_use) {
    update_tree(e.instance);
  } else if (e.instance.use === app_use) {
    update_app(e.instance);
  }
});

var node_component = context.appendChild(context.$("component",
  context.$("view",
    context.$("html:li"))));

function update_tree(tree) {
  console.log("* Update tree");
  flexo.remove_children(tree.views.$root);
  tree.views.$root.appendChild(use(node_component));
}

function update_app(instance) {
  console.log("* Update app");
}
