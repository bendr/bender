"use strict";

var component;
var kanji;

var speed = 144;   // units per second
var op_speed = 5;
var pause = 0.3;  // pause between strokes in seconds

var map = Array.prototype.map;

var Kanji = {};

// Initialize a new kanji from an XML element containing kanji elements and
// paths.
function init_kanji(xml) {
  var k = Object.create(Kanji);
  k.paths = map.call(xml.querySelectorAll("path"), function (path) {
    var p = flexo.$path({ d: path.getAttribute("d"), "stroke-opacity": 0 });
    p._length = p.getTotalLength();
    p.setAttribute("stroke-dasharray", "%0,%0".fmt(p._length));
    p.setAttribute("stroke-dashoffset", p._length);
    return p;
  });
  return k;
}

function animate() {
  var p = kanji.paths[kanji.path];
  var dt = (Date.now() - kanji.start) / 1000;
  if (dt > 0) {
    var offset = p._length - speed * dt;
    var op = flexo.clamp(dt * op_speed, 0, 1);
    if (offset < 0) {
      offset = 0;
      op = 1;
      ++kanji.path;
      kanji.start = Date.now() + pause * 1000;
    }
    p.setAttribute("stroke-dashoffset", offset);
    p.setAttribute("stroke-opacity", op);
  }
  if (!kanji.paused && kanji.path < kanji.paths.length) {
    kanji.frame = requestAnimationFrame(animate);
  } else {
    component.properties.status = "stopped";
  }
}

function play_pause() {
  if (!kanji) {
    return;
  }
  if (component.properties.status === "paused") {
    kanji.start = Date.now() + kanji.paused;
    delete kanji.paused;
    component.properties.status = "playing";
    animate();
  } else if (kanji.path < kanji.paths.length) {
    kanji.paused = kanji.start - Date.now();
    component.properties.status = "paused";
    if (kanji.frame) {
      cancelAnimationFrame(kanji.frame);
    }
  } else {
    component.properties.status = "playing";
    kanji.start = Date.now();
    kanji.path = 0;
    kanji.paths.forEach(function (p) {
      p.setAttribute("stroke-opacity", 0);
    });
    animate();
  }
}

function stop() {
  if (kanji) {
    delete kanji.paused;
    kanji.path = 0;
    if (kanji.frame) {
      cancelAnimationFrame(kanji.frame);
    }
    kanji.paths.forEach(function (p) {
      p.setAttribute("stroke-opacity", 0);
    });
    component.properties.status = "stopped";
  }
}

function get_kanji(response) {
  if (response && response.data && response.data.content) {
    var parser = new DOMParser();
    var svg = window.atob(response.data.content.replace(/\s/g, ""));
    kanji = init_kanji(parser.parseFromString(svg, "application/xml"));
    flexo.remove_children(component.rendered.silhouette);
    flexo.remove_children(component.rendered.strokes);
    kanji.paths.forEach(function (p) {
      component.rendered.silhouette
        .appendChild(flexo.$path({ d: p.getAttribute("d") }));
      component.rendered.strokes.appendChild(p);
    });
    component.properties.status = "stopped";
    component.properties.strokes = kanji.paths.length;
  } else {
    component.properties.status = "none";
  }
}

function setup(c) {
  component = c;
}
