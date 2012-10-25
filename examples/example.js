(function (example) {
  "use strict";

  var testing = document.body.appendChild(flexo.$("div.testing", "Testing..."));
  var timeout = setTimeout(function () {
    testing.classList.add("error");
    testing.textContent = "Timeout";
  }, 2000);

  example.ok = function (p) {
    var p = testing.parentNode;
    var ref = testing.nextSibling;
    p.removeChild(testing);
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (p === undefined) {
      p = true;
    }
    testing.classList.add("pulse");
    if (p) {
      testing.classList.add("ok");
      testing.textContent = "OK";
    } else {
      testing.classList.add("error");
      testing.textContent = "Error";
    }
    p.insertBefore(testing, ref);
  };

}(window.example = {}));
