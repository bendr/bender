"use strict";

var draw = Object.create(bender.instance);

draw.rendering = function () {
  this.context = this.views.$root.getContext("2d");
}

draw.rendered = function () {
  this.context.lineJoin = "round";
  this.context.lineCap = "round";
  this.context.beginPath();
  this.down = false;
};

draw.start_dragging = function (e) {
  e.preventDefault();
  var p = flexo.event_offset_pos(e, this.views.$root);
  this.context.moveTo(p.x, p.y);
  this.down = true;
};

draw.keep_dragging = function (e) {
  if (this.down) {
    var p = flexo.event_offset_pos(e, this.views.$root);
    this.context.clearRect(0, 0, this.context.canvas.width,
        this.context.canvas.height);
    this.context.lineTo(p.x, p.y);
    this.context.stroke();
  }
};

draw.stop_dragging = function (e) {
  this.down = false;
};
