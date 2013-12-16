"use strict";

var drag = {
  init: function (element) {
    return this.element = element, this;
  },

  enable: function (p) {
    if (p) {
      this.element.addEventListener("mousedown", this);
      this.element.addEventListener("touchstart", this);
    } else {
      this.element.removeEventListener("mousedown", this);
      this.element.removeEventListener("touchstart", this);
    }
  },

  // Handle mouse and touch events
  handleEvent: function (e) {
    if (e.type === "mousedown" && e.button === 0) {
      this.start(this.mousedrag(e));
    } else if (e.type === "touchstart") {
      this.start(this.touchdrag(e));
    } else if (e.type === "mousemove" || e.type === "touchmove") {
      this.move(flexo.event_svg_point(e, this.svg));
    } else if (e.type === "mouseup") {
      this.stop();
      this.mousedrag();
    } else if (e.type === "touchend") {
      this.stop();
      this.touchdrag();
    }
  },

  // Start dragging using mouse events
  mousedrag: function (e) {
    if (!e) {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", this);
      document.removeEventListener("mouseup", this);
      delete this.svg;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener("mousemove", this);
    document.addEventListener("mouseup", this);
    this.svg = flexo.find_svg(e.target);
    return flexo.event_svg_point(e, this.svg);
  },

  // Start dragging using touch events
  touchdrag: function (e) {
    if (!e) {
      document.body.style.cursor = "";
      this.element.removeEventListener("touchmove", this);
      this.element.removeEventListener("touchend", this);
      delete this.svg;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.element.addEventListener("touchmove", this);
    this.element.addEventListener("touchend", this);
    this.svg = flexo.find_svg(e.target);
    return flexo.event_svg_point(e, this.svg);
  },

  // Stubs for event handling
  start: function (p) {},
  move: function (p) {},
  stop: function () {
    flexo.notify(this, "dragstop");
  }
};


var drag_area = flexo._ext(drag, {
  init: function (elem, f) {
    this.f = f;
    return drag.init.call(this, elem);
  },

  start: function (p) {
    this.shape = this.f.call(this, p);
    this.x0 = this.x = p.x;
    this.y0 = this.y = p.y;
  },

  move: function (p) {
    this.shape.setAttribute("x", Math.min(this.x0, p.x));
    this.shape.setAttribute("y", Math.min(this.y0, p.y));
    this.shape.setAttribute("width", Math.abs(p.x - this.x0));
    this.shape.setAttribute("height", Math.abs(p.y - this.y0));
  }
});


var canvas = {
  init: function () {
    this.svg = document.querySelector("svg");
    this.bg = this.svg.querySelector("rect");
    this.g = this.svg.querySelector("g");
    this.frame = this.g.querySelector("rect");
    this.grid = document.getElementById("grid-pattern");
    this.grid_lines = $slice(this.grid.querySelectorAll("line"));
    this.settings = {
      zoom: 1,
    };
    (window.onresize = function () {
      var bbox = this.frame.getBBox();
      var mw = 4 * parseFloat(this.grid.getAttribute("width"));
      var mh = 4 * parseFloat(this.grid.getAttribute("height"));
      var Wz = Math.max((bbox.width + mw) * this.settings.zoom,
        window.innerWidth);
      var Hz = Math.max((bbox.height + mh) * this.settings.zoom,
        window.innerHeight);
      var W = Math.max(bbox.width + mw, window.innerWidth / this.settings.zoom);
      var H = Math.max(bbox.height + mh,
        window.innerHeight / this.settings.zoom);
      this.svg.setAttribute("width", Wz);
      this.svg.setAttribute("height", Hz);
      var x = (bbox.width - W) / 2;
      var y = (bbox.height - H) / 2;
      this.svg.setAttribute("viewBox", "%0 %1 %2 %3".fmt(x, y, W, H));
      this.bg.setAttribute("x", x);
      this.bg.setAttribute("y", y);
    }.bind(this))();

    this.drag = Object.create(drag_area).init(this.svg, function (p) {
      return this.g.appendChild(flexo.$rect({ x: p.x, y: p.y, fill: "none",
          stroke: "black", "stroke-dasharray": "3 3", "stroke-width": .5 }));
    }.bind(this));
    flexo.listen(this.drag, "dragstop", function (e) {
      flexo.safe_remove(e.source.shape);
    });
    this.drag.enable(true);
  }
};

Object.defineProperty(canvas, "locked", {
  enumerable: true,
  get: function () {
    return window.document.body.classList.contains("locked");
  },
  set: function (p) {
    if (p && !this.locked) {
      window.document.body.classList.add("locked");
      this.drag.enable(false);
      this.grid_was_visible = this.grid_is_visible;
      this.grid_is_visible = false;
      this.scrollx = window.scrollX;
      this.scrolly = window.scrollY;
      var bbox = this.frame.getBBox();
      this.svg.setAttribute("viewBox", "0 0 %0 %1"
        .fmt(bbox.width, bbox.height));
      this.svg.setAttribute("width", "100%");
      this.svg.setAttribute("height", "100%");
      this.bg.removeAttribute("x");
      this.bg.removeAttribute("y");
      this.frame.setAttribute("stroke-opacity", 0);
    } else {
      window.document.body.classList.remove("locked");
      this.drag.enable(true);
      this.grid_is_visible = this.grid_was_visible;
      window.onresize();
      window.scroll(this.scrollx, this.scrolly);
      delete this.grid_was_visible;
      delete this.scrollx;
      delete this.scrolly;
      this.frame.removeAttribute("stroke-opacity");
    }
  }
});

Object.defineProperty(canvas, "size", {
  enumerable: true,
  get: function () {
    return [parseFloat(this.frame.getAttribute("width")),
      parseFloat(this.frame.getAttribute("height"))];
  },
  set: function (sz) {
    if (typeof sz === "number") {
      this.frame.setAttribute("width", sz);
      this.frame.setAttribute("height", sz);
      window.onresize();
    } else if (Array.isArray(sz) && sz.length > 0) {
      this.frame.setAttribute("width", sz[0]);
      this.frame.setAttribute("height", sz.length > 1 ? sz[1] : sz[0]);
      window.onresize();
    }
  }
});

Object.defineProperty(canvas, "grid_opacity", {
  enumerable: true,
  get: function () {
    return parseFloat(this.bg.getAttribute("fill-opacity"));
  },
  set: function (op) {
    if (typeof op !== "number") {
      op = parseFloat(op);
    }
    this.bg.setAttribute("fill-opacity", flexo.clamp(op, 0, 1));
  }
});

Object.defineProperty(canvas, "grid_color", {
  enumerable: true,
  get: function () {
    return this.grid_lines[0].getAttribute("stroke");
  },
  set: function (color) {
    this.grid_lines.forEach(function (line) {
      line.setAttribute("stroke", color);
    });
  }
});

Object.defineProperty(canvas, "grid_is_visible", {
  enumerable: true,
  get: function () {
    return this.bg.getAttribute("fill") !== "none";
  },
  set: function (p) {
    this.bg.setAttribute("fill", p ? "url(#grid-pattern)" : "none");
  }
});

Object.defineProperty(canvas, "grid_size", {
  enumerable: true,
  get: function () {
    return [parseFloat(this.grid.getAttribute("width")),
      parseFloat(this.grid.getAttribute("height"))];
  },
  set: function (sz) {
    if (typeof sz === "number") {
      this.grid.setAttribute("width", sz);
      this.grid.setAttribute("height", sz);
    } else if (Array.isArray(sz) && sz.length > 0) {
      this.grid.setAttribute("width", sz[0]);
      this.grid.setAttribute("height", sz.length > 1 ? sz[1] : sz[0]);
    }
  }
});

Object.defineProperty(canvas, "zoom", {
  enumerable: true,
  get: function () {
    return this.settings.zoom;
  },
  set: function (z) {
    this.settings.zoom = Math.max(0.1, z);
    var stroke = 1 / Math.max(1, z);
    this.grid_lines.forEach(function (line) {
      line.setAttribute("stroke-width", stroke);
    });
    this.frame.setAttribute("stroke-width", stroke);
    window.onresize();
  }
});

canvas.init();
document.addEventListener("keyup", function (e) {
  if (e.keyCode === 27) {
    canvas.locked = !canvas.locked;
  }
});
