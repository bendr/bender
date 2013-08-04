function will_render(instance) {
  console.log("will-render: on %0/%1"
      .fmt(instance.component.index, instance.index));
}
console.log("will-render: loaded");
