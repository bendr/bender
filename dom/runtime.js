"use strict";

bender.Link.render.stylesheet = function (target) {
  target.ownerDocument.head.appendChild(flexo.$link({ rel: this.rel,
    href: this.uri }));
}

var env = bender.init_environment();
var args = flexo.get_args();
if (args.href) {
  var url = flexo.absolute_uri(window.document.baseURI, args.href);
  env.load_component(url, function (component) {
    env.render_component(component, document.body);
  });
} else {
  document.body.appendChild(flexo.$("p.bender--runtime-message",
    "Nothing to run. Please specify a Bender component to load with the ", 
    flexo.$code("href"), " URL parameter."));
}

