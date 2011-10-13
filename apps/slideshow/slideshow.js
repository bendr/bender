slideshow = flexo.create_object(bender.controller, {

  init: function()
  {
    this.slide = -1;
    bender.listen(this, "@rendered", (function(e) {
        this.slides = this.component.children.filter(function(ch) {
            return /#slide$/.test(ch.uri);
          });
        this.slides.forEach((function(slide, i) {
            bender.listen(slide, "@next", this.show_slide.bind(this, i + 1));
            bender.listen(slide, "@prev", this.show_slide.bind(this, i - 1));
            slide.controllers[""].set_num(i + 1, this.slides.length);
          }).bind(this));
        this.show_slide("slide" in this.component.args ?
          parseInt(this.component.args.slide, 10) : 0);
      }).bind(this));
    bender.listen(this.component.dest_body.ownerDocument, "keydown",
      this.handleEvent.bind(this));
  },

  handleEvent: function(e)
  {
    if ("type" in e) {
      if (e.type === "keydown") {
        if (e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 39) {
          e.preventDefault();
          this.show_slide(this.slide + 1);
        } else if (e.keyCode === 8 || e.keyCode === 37) {
          e.preventDefault();
          this.show_slide(this.slide - 1);
        } else if (e.keyCode === 27) {
          e.preventDefault();
          this.show_slide(0);
        }
      }
    }
  },

  show_slide: function(i)
  {
    i = flexo.constrain_value(i, 0, this.slides.length - 1);
    flexo.log("Show slide #{0}".fmt(i));
    if (i !== this.slide) {
      if (this.slides[this.slide]) this.slides[this.slide].hidden = "hidden";
      this.slide = i;
      this.slides[this.slide].hidden = undefined;
    }
  },

});
