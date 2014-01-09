describe("Rendering to HTML", function () {

  var env = bender.environment();
  var A = env.$component({ id: "A" }).view(env.$content());
  var B = env.$component({ id: "B", prototype: A }, env.$view(env.$p("Hello")));
  var B_ = B.render_instance(flexo.$div());

  it("has the right id", function () {
    expect(A.id()).toBe("A");
  });
  it("has the right @this", function () {
    expect(B_.scope_of(A)["@this"]).toBe(B_);
  });

});
