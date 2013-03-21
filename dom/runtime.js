"use strict";

bender.Link.render.stylesheet = function (target, k) {
  target.ownerDocument.head.appendChild(flexo.$link({ rel: this.rel,
    href: this.uri }));
  k();
};

bender.Link.render.script = function (target, k) {
  var script = flexo.$script({ src: this.uri });
  script.addEventListener("load", k, false);
  target.ownerDocument.head.appendChild(script);
};

var env = bender.init_environment();
var args = flexo.get_args();
var $;
if (args.href) {
  var url = flexo.absolute_uri(window.document.baseURI, args.href);
  env.load_component(url, function (component) {
    $ = component;
    console.log("Component at %0 loaded OK".fmt(url));
    env.render_component(component, document.body, function () {
      console.log("Component rendered OK", component);
    });
  });
} else {
  document.body.appendChild(flexo.$("p.bender--runtime-message",
    "Nothing to run. Please specify a Bender component to load with the ", 
    flexo.$code("href"), " URL parameter."));
}

