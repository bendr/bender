"use strict";

bender.$.draw = Object.create(bender.instance);

bender.$.draw.did_render = function () {
  this.context = this.views.$root.getContext("2d");
  this.context.lineJoin = "round";
  this.context.lineCap = "round";
  this.context.beginPath();
  this.down = false;
};

bender.$.draw.start_dragging = function (e) {
  e.preventDefault();
  var p = flexo.event_offset_pos(e, this.views.$root);
  this.context.moveTo(p.x, p.y);
  this.down = true;
};

bender.$.draw.keep_dragging = function (e) {
  if (this.down) {
    var p = flexo.event_offset_pos(e, this.views.$root);
    this.context.clearRect(0, 0, this.context.canvas.width,
        this.context.canvas.height);
    this.context.lineTo(p.x, p.y);
    this.context.stroke();
  }
};

bender.$.draw.stop_dragging = function (e) {
  this.down = false;
};
