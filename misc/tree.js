var selection = null;
var tree = document.implementation.createDocument("", "context", null);
var context = document.querySelector(".bender_tree")
  .appendChild(create_element(tree.documentElement));
var app_e = tree.createElement("app");
var app = add_child(context, tree.documentElement, app_e);
var title_e = tree.createElement("title");
var title = add_child(app, app_e, title_e);
var title_text = add_text(title, title_e, "Untitled Bender application");
add_child(app, app_e, tree.createElement("view"));
title_text.selected = true;

function select(li)
{
  if (selection && selection !== li) selection.selected = false;
  selection = li;
}

document.addEventListener("click", function() { select(null); }, false);

function add_child(li, element, e)
{
  if (!e) e = tree.createElement("default");
  var ch = element.appendChild(e);
  var ch_li = create_element(ch);
  li.insert_before(ch_li);
  ch_li.selected = true;
  return ch_li;
}

function insert_sibling(li, element)
{
  var ch = element.parentNode.insertBefore(tree.createElement("default"),
    element);
  var ch_li = create_element(ch);
  li.parentNode.parentNode.insert_before(ch_li, li);
  ch_li.selected = true;
  return ch_li;
}

function add_text(li, element, text)
{
  var ch = element.appendChild(tree.createTextNode(text || "New text content"));
  var ch_li = create_text(ch);
  li.insert_before(ch_li);
  ch_li.selected = true;
  return ch_li;
}

function add_attr(li, element)
{
  var a = element.setAttribute("attr", "value");
  var a_li = create_attr("attr", "value");
  li.set_attribute(a_li);
  return a_li;
}

function create_attr(n, v)
{
  var name = flexo.ez_elem("span.attr-name", n);
  var value = flexo.ez_elem("span.attr-value", v);
  var span = flexo.ez_elem("span.attr", name, " = ", value);
  var selected = false;
  flexo.getter_setter(span, "selected", function() { return selected; },
    function(p) {
      if (p) {
        select(span);
      }
      selected = p;
      flexo.set_class_iff(span, "__selected", selected);
    });
  name.addEventListener("click", function(e) {
      span.selected = true;
      e.stopPropagation();
    }, false);
  value.addEventListener("click", function(e) {
      span.selected = true;
      e.stopPropagation();
    }, false);
  return span;
}

function create_text(element)
{
  var div = flexo.ez_elem("div.text", element.textContent);
  var textarea = flexo.ez_elem("textarea", { autofocus: true });
  var del = flexo.ez_elem("span.delete", "-delete");
  var actions = flexo.ez_elem("div.actions", del);
  del.addEventListener("click", function(e) {
      element.parentNode.removeChild(element);
      li.parentNode.removeChild(li);
      e.stopPropagation();
    }, false);
  var li = flexo.ez_elem("li.text", div, textarea, actions);
  var selected = false;
  flexo.getter_setter(li, "selected", function() { return selected; },
    function(p) {
      if (p) {
        select(li);
        textarea.value = element.textContent;
      }
      selected = p;
      flexo.set_class_iff(li, "__selected", selected);
    });
  div.addEventListener("click", function(e) {
      li.selected = true;
      e.stopPropagation();
    }, false);
  textarea.addEventListener("click", function(e) { e.stopPropagation(); },
    false);
  textarea.addEventListener("focus", function(e) { textarea.select(); },
    false);
  textarea.addEventListener("change", function(e) {
      div.textContent =
      element.textContent = textarea.value;
    }, false);
  return li;
}

function create_element(element)
{
  var li = flexo.ez_elem("li");
  var ul = null;
  li.insert_before = function(ch, ref)
  {
    if (!ul) {
      ul = flexo.ez_elem("ul");
      li.appendChild(ul);
    }
    ul.insertBefore(ch, ref);
  };
  var disclosure = flexo.ez_elem("span.disclosure");
  var collapsed;
  flexo.getter_setter(li, "collapsed", function() { return collapsed; },
    function(p) {
      collapsed = p;
      disclosure.textContent = collapsed ? "▸" : "▾";
      if (ul) flexo.set_class_iff(ul, "__collapsed", collapsed);
    });
  li.collapsed = false;
  disclosure.addEventListener("click", function() {
      li.collapsed = !collapsed;
    }, false);
  var tag = flexo.ez_elem("span.tag", element.localName);
  var actions = flexo.ez_elem("div.actions");
  var child = flexo.ez_elem("span", "+child");
  actions.appendChild(child);
  child.addEventListener("click", function(e) {
      add_child(li, element);
      e.stopPropagation();
    }, false);
  if (element.parentElement) {
    var tagname = flexo.ez_elem("input",
      { type: "text", autofocus: true });
    actions.insertBefore(tagname, child);
    tagname.addEventListener("click", function(e) { e.stopPropagation(); },
      false);
    tagname.addEventListener("focus", function(e) { tagname.select(); },
      false);
    tagname.addEventListener("change", function(e) {
        e.preventDefault();
        e.stopPropagation();
        var n = element.ownerDocument.createElement(tagname.value.trim());
        element.parentNode.replaceChild(n, element);
        element = n;
        tag.textContent = n.localName;
        // TODO deal with attributes
        [].forEach.call(element.childNodes, function(ch) {
            element.removeChild(ch);
            n.appendChild(ch);
          });
      }, false);
    var sibling = flexo.ez_elem("span", "+sibling");
    sibling.addEventListener("click", function(e) {
        insert_sibling(li, element);
        e.stopPropagation();
      }, false);
    actions.appendChild(sibling);
    var text = flexo.ez_elem("span", "+text");
    actions.appendChild(text);
    text.addEventListener("click", function(e) {
        add_text(li, element);
        e.stopPropagation();
      }, false);
    var del = flexo.ez_elem("span.delete", "-delete");
    del.addEventListener("click", function(e) {
        element.parentNode.removeChild(element);
        li.parentNode.removeChild(li);
        e.stopPropagation();
      }, false);
    actions.appendChild(del);
    var attr = flexo.ez_elem("span", "+attr");
    attr.addEventListener("click", function(e) {
        add_attr(li, element);
        e.stopPropagation();
      }, false);
    actions.appendChild(attr);
  } else {
    flexo.add_class(tag, "fixed");
  }
  var attrs = flexo.ez_elem("span.attrs");
  li.set_attribute = function(a) { attrs.appendChild(a); };
  var div = flexo.ez_elem("div.elem", disclosure, " ", tag, actions,
    attrs);
  var selected = false;
  flexo.getter_setter(li, "selected", function() { return selected; },
    function(p) {
      if (p) {
        select(li);
        if (tagname) tagname.value = element.localName;
      }
      selected = p;
      flexo.set_class_iff(div, "__selected", selected);
    });
  tag.addEventListener("click", function(e) {
      li.selected = !selected;
      e.stopPropagation();
    }, false);
  li.appendChild(div);
  return li;
}
