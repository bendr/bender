"use strict";

if (window.document.documentElement.namespaceURI === flexo.ns.svg) {

  bender.Link.render.stylesheet = function (target, k) {
    console.warn("Loading stylesheets is not supported in SVG yet");
    k();
  };

  bender.Link.render.script = function (target, k) {
    var script = flexo.$("svg:script", { "xlink:href": this.uri });
    script.addEventListener("load", k, false);
    target.ownerDocument.documentElement.appendChild(script);
  };

  var no_href = function () {
    console.warn("Nothing to run. Please specify a Bender component to load " +
        "with the `href` URL parameter.");
  };

  var error_loading = function (url) {
    console.error("Could not load component at " + url);
  };

  var target = window.document.documentElement;

} else {

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

  var no_href = function () {
    document.body.appendChild(flexo.$("p.bender--runtime-message",
        "Nothing to run. Please specify a Bender component to load with the ",
        flexo.$code("href"), " URL parameter."));
  };

  var error_loading = function (url) {
    document.body.appendChild(flexo.$("p.bender--runtime-error",
          "Could not load component at ", flexo.$code(url)));
  };

  var target = window.document.body;

}

// Create the environment for this runtime
var ENV = bender.init_environment();

// Load the component at the given href parameter
(function (env) {
  var args = flexo.get_args();
  if (args.href) {
    var url = flexo.absolute_uri(window.document.baseURI, args.href);
    env.load_component(url, function (component) {
      if (flexo.instance_of(component, bender.Component)) {
        console.log("Component at %0 loaded OK".fmt(url));
        env.render_component(component, target, function () {
          for (var p in args) {
            if (p !== "href") {
              component.properties[p] = args[p];
            }
          }
          console.log("Component rendered OK", component);
        });
      } else {
        error_loading(url);
      }
    });
  } else {
    no_href();
  }
}(ENV));
