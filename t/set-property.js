bender.$.x = Object.create(bender.instance);

bender.$.x.init = function () {
  console.log("[init]", this);
  window.x = this;
};

bender.$.x.will_set_property = function (name, value) {
  console.log("[will_set_property] {0}: {1} -> {2}"
    .fmt(name, this.properties[name], value));
};

bender.$.x.did_set_property = function (name, value) {
  console.log("[did_set_property] {0} = {1}".fmt(name, this.properties[name]));
};

bender.$.x.did_render = function () {
  this.properties.clicks = 0;
};
