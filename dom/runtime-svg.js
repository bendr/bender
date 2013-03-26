"use strict";

// Runtime-specific rendering for stylesheet links
bender.Link.render.stylesheet = function (target, k) {
  // TODO
  k();
};

// Runtime-specific rendering for script links
bender.Link.render.script = function (target, k) {
  var script = flexo.$("svg:script", { "xlink:href": this.uri });
  script.addEventListener("load", k, false);
  target.ownerDocument.documentElement.appendChild(script);
};

// Show a warning/message
function message(msg) {
  document.body.appendChild(flexo.$("p.bender--runtime-message", msg));
}

// Show an error message
function error(msg) {
  document.body.appendChild(flexo.$("p.bender--runtime-error", msg));
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
        env.render_component(component, document.documentElement, function () {
          console.log("Component rendered OK", component);
        });
      } else {
        console.error("Could not load component at %0 (%1)"
          .fmt(url, component.toString));
      }
    });
  } else {
    console.error("Nothing to run. Please specify a Bender component to load " +
      "with the `href` URL parameter.");
  }
}(ENV));
