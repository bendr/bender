// General purpose Javascript support library; as used by Bender
/*jslint browser: true, maxerr: 50, indent: 2 */
/*global exports */

(function (flexo) {
  "use strict";

  flexo.magnitude = function (x, y) {
    return Math.sqrt(x * x + y * y);
  };

  // TODO flag for closed/open path (right now closed) and default for smoothing
  flexo.path_from_points = function (points, smoothing) {
    var i, n, d, x0, y0, x1, y1, tx, ty, l, x2, y2, xa, ya, xb, yb;
    d = "M{0},{1}".fmt(points[0].x, points[0].y);
    for (i = 0, n = points.length; i < n; i += 1) {
      x0 = points[(i + n - 1) % n].x;
      y0 = points[(i + n - 1) % n].y;
      x1 = points[i].x;
      y1 = points[i].y;
      x2 = points[(i + 1) % n].x;
      y2 = points[(i + 1) % n].y;
      tx = x2 - x0;
      ty = y2 - y0;
      l = Math.sqrt(tx * tx + ty * ty);
      tx = tx / l;
      ty = ty / l;
      xa = x1 - smoothing * tx * flexo.magnitude(x1 - x0, y1 - y0);
      ya = y1 - smoothing * ty * flexo.magnitude(x1 - x0, y1 - y0);
      xb = x1 + smoothing * tx * flexo.magnitude(x1 - x2, y1 - y2);
      yb = y1 + smoothing * ty * flexo.magnitude(x1 - x2, y1 - y2);
      d += "C{0},{1} {2},{3} {4},{5}".fmt(xa, ya, x1, y1, xb, yb);
    }
    return d;
  };

  flexo.point_from_event = function (e, svg) {
    var p;
    if (!svg) {
      svg = document.querySelector("svg");
    }
    p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };

  // Create a regular polygon with the number of sides inscribed in a circle of
  // the given radius, with an optional starting phase (use Math.PI / 2 to have
  // it pointing up at all times)
  flexo.polygon = function (sides, radius, phase) {
    return flexo.elem("svg:polygon",
        { points: flexo.polygon_points(sides, radius, phase) });
  };

  flexo.polygon_points = function (sides, radius, phase) {
    var i, points = [];
    if (phase === undefined) {
      phase = 0;
    }
    for (i = 0; i < sides; i += 1) {
      points.push(radius * Math.cos(phase));
      points.push(-radius * Math.sin(phase));
      phase += 2 * Math.PI / sides;
    }
    return points.join(" ");
  };

  // Same as above but create a star with the given inner radius
  flexo.star = function (sides, ro, ri, phase) {
    return flexo.svg("polygon",
        { points: flexo.svg_star_points(sides, ro, ri, phase) });
  };

  flexo.star_points = function (sides, ro, ri, phase) {
    var i, r, points = [];
    if (phase === undefined) {
      phase = 0;
    }
    sides *= 2;
    for (i = 0; i < sides; i += 1) {
      r = i % 2 === 0 ? ro : ri;
      points.push(r * Math.cos(phase));
      points.push(-r * Math.sin(phase));
      phase += 2 * Math.PI / sides;
    }
    return points.join(" ");
  };

}(typeof exports === "object" ? exports : this.flexo));
