"use strict";

if (window.document.documentElement.namespaceURI === flexo.ns.svg) {
  var no_href = function () {
    console.warn("Nothing to run. Please specify a Bender component to load " +
        "with the `href` URL parameter.");
  };
  var error_loading = function (url) {
    console.error("Could not load component at " + url);
  };
  var target = window.document.documentElement;
} else {
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

var ENV = bender.load_app(target, {}, function (component) {
  if (!component) {
    no_href();
  } else if (typeof component === "string") {
    error_loading(component);
  }
});
