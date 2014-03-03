"use strict";

var foreach = Function.prototype.call.bind(Array.prototype.forEach);

// TODO references (figures, definitions, &c.)
// Table of contents and figures
(function (nav) {
  if (!nav) {
    return;
  }
  var item = function (ul, h, i, j) {
    var li = ul.appendChild(document.createElement("li"));
    var a = li.appendChild(document.createElement("a"));
    var id = h.parentNode.id;
    if (!id) {
      id = h.parentNode.id = "id-" + (Math.random().toString(36).substr(2));
    }
    a.setAttribute("href", "#" + h.parentNode.id);
    h.insertBefore(document.createTextNode(i + "." + (j > 0 ? (j + ". ") : " ")),
      h.firstChild);
    foreach(h.childNodes, function (ch) {
      a.appendChild(ch.cloneNode(true));
    });
    return li;
  };
  var h2s = document.querySelectorAll("h2");
  var figures = document.querySelectorAll("figcaption");
  if (h2s.length > 0 || figures.length > 0) {
    nav.appendChild(document.createElement("h2"))
      .textContent = nav.dataset.title;
    var ul = nav.appendChild(document.createElement("ul"));
    foreach(h2s, function (h2, i) {
      var li = item(ul, h2, i + 1);
      var h3s = h2.parentNode.querySelectorAll("h3");
      if (h3s.length > 0) {
        var ul_ = li.appendChild(document.createElement("ul"));
        foreach(h3s, function (h3, j) {
          item(ul_, h3, i + 1, j + 1);
        });
      }
    });
    if (figures.length > 0) {
      nav.appendChild(document.createElement("h3"))
        .textContent = nav.dataset.figures;
      var ul = nav.appendChild(document.createElement("ul"));
      ul.classList.add("figures");
      foreach(figures, function (fig, i) {
        item(ul, fig, nav.dataset.figurePrefix, " " + (i + 1));
      });
    }
  }
}(document.getElementById("toc")));
