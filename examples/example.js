(function (example) {
  "use strict";

  var testing = document.body.appendChild(flexo.$("div.testing", "Testing..."));
  var timeout = setTimeout(function () {
    testing.classList.add("error");
    testing.textContent = "Timeout";
  }, 2000);

  example.ok = function (p) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (p === undefined) {
      p = true;
    }
    if (p) {
      testing.classList.add("ok");
      testing.textContent = "OK";
    } else {
      testing.classList.add("error");
      testing.textContent = "Error";
    }
  };

}(window.example = {}));
