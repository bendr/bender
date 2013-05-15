function rendered($super, scope) {
  $super();
  scope.t.textContent = this.properties.message;
}

function rendered_derived_derived($super, scope) {
  $super();
}

console.log("Defined rendered:", rendered);
console.log("Defined rendered_derived_derived:", rendered_derived_derived);
