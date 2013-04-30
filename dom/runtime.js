"use strict";

(function () {

  if (window.document.documentElement.namespaceURI === flexo.ns.svg) {
    var no_href = function () {
      console.warn("Nothing to run. Please specify a Bender component to load " +
          "with the `href` URL parameter.");
    };
    var error_loading = function (err) {
      console.error(err);
    };
    var target = window.document.documentElement;
  } else {
    var no_href = function () {
      document.body.appendChild(flexo.$("p.bender--runtime-message",
          "Nothing to run. Please specify a Bender component to load with the ",
          flexo.$code("href"), " URL parameter."));
    };
    var error_loading = function (err) {
      document.body.appendChild(flexo.$("p.bender--runtime-error", err));
    };
    var target = window.document.body;

    // Add classes based on id
    (function ($super) {
      bender.Component.render = function () {
        var rendered = $super.apply(this, arguments);
        if (rendered.scope.$root) {
          for (var c = rendered; c; c = c.prototype) {
            if (c.id) {
              rendered.scope.$root.classList.add(c.id);
            }
          }
        }
      };
    }(bender.Component.render));
  }

  this.ENV = bender.load_app(target, function (component) {
    if (!component) {
      no_href();
    } else if (typeof component === "string") {
      error_loading(component);
    }
  });

}.call(this));
