"use strict";

var bender = require("bender");

// Params should include at least "title"; "lang" and "charset" have default
// values. DOCTYPE can be overridden with the DOCTYPE parameter.
function html_top(params, head) {
  if (head == null) {
    head = "";
  }
  if (!params.DOCTYPE) {
    params.DOCTYPE = "<!DOCTYPE html>";
  }
  if (!params.title) {
    params.title = "Untilted";
  }
  if (!params.charset) {
    params.charset = "UTF-8";
  }
  return params.DOCTYPE + "\n" +
    flexo.$html({ lang: params.lang },
      flexo.$head(
        flexo.$title(params.title),
        flexo.$meta({ charset: params.charset }, true),
        head),
      flexo.$body(true),
      true);
}


bender.Component.html = function () {
  var stack = this.view_stack();
  return stack[0].html(stack, 0);
};

bender.Element.html_children = function (stack, i) {
  return this.children.map(function (child) {
    return child.html(stack, i);
  }).join("");
};

bender.View.html = function (stack, i) {
  return this === stack[i] ?
    this.html_children(stack, i) :
    this.component.html();
};

bender.Content.html = function (stack, i) {
  var j = i + 1;
  var n = stack.length;
  for (; j < n && stack[j].default; ++j) {}
  return j < n ? stack[j].html(stack, j) : this.html_children(stack, i);
};

// TODO namespace management
// TODO event handlers
bender.DOMElement.html = function (stack, i) {
  return flexo.html_tag(this.local_name, this.attributes[""],
      this.html_children(stack, i));
};

bender.Text.html = function () {
  return this.text();
};

// TODO Attribute

var hello = bender.Component.create(bender.View.create()
    .child(bender.DOMElement.create(flexo.ns.html, "p")
      .child(bender.Text.create().text("Hello, world!"))))
  .name("Hello");

process.stdout
  .write(html_top({ title: "Bender" },
        flexo.$script({ src: "flexo.js" }) +
        flexo.$script({ src: "bender.js" })) +
      hello.html() +
      "</body></html>\n");
