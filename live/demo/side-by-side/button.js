"use strict;"

function make_button(content) {
  var elem = flexo.$("div.ui-button", { "aria-role": "button" }, content);

  var down = false;
  var timeout;
  var delay = 50;

  var start = function (e) {
    e.preventDefault();
    down = true;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(function () {
      elem.classList.add("ui--down");
      timeout = null;
    }, delay);
  };

  var stop = function () {
    if (down) {
      down = false;
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(function () {
        elem.classList.remove("ui--down");
        timeout = null;
      }, delay);
    }
  };

  var end = function () {
    if (down) {
      stop();
      flexo.notify(elem, "@pushed");
    }
  };

  elem.addEventListener("mousedown", start, false);
  elem.addEventListener("touchstart", start, false);
  document.addEventListener("mousemove", stop, false);
  elem.addEventListener("touchmove", stop, false);
  document.addEventListener("mouseup", end, false);
  elem.addEventListener("touchend", end, false);

  return elem;
}
