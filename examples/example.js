(function (example) {
  "use strict";

  var testing = document.body.appendChild(flexo.$("div.testing", "Testing..."));

  example.ok = function () {
    testing.classList.add("ok");
    testing.textContent = "OK";
  };

}(window.example = {}));
