function will_render(instance) {
  window.__WILL_RENDER = true;
  console.log("will-render: %0/%1"
      .fmt(instance.scope.$that.index, instance.index));
}
console.log("will-render: loaded");
