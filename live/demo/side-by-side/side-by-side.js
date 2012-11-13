"use strict";

function init_clicks() {
  var button = make_button("Click me");
  document.querySelector("p").appendChild(button);
  var clicks = 0;
  var show_clicks = function () {
    document.getElementById("clicks").textContent = clicks.toString();
  };
  flexo.listen(button, "@pushed", function () {
    ++clicks;
    show_clicks();
  });
  show_clicks();
}
