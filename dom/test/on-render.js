function rendered() {
  this.rendered.t.textContent = this.properties.message;
}

function rendered_derived($super) {
  $super();
  this.rendered.t.textContent += " (really)";
}

function rendered_derived_derived($super) {
  $super();
  this.rendered.t.textContent += " (yes, really!)";
}

console.log("Defined rendered:", rendered);
console.log("Defined rendered_derived:", rendered_derived);
console.log("Defined rendered_derived_derived:", rendered_derived_derived);
