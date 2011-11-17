// Build a TOC inside a parent node for a context node; use the level for
// heading level (e.g. level 2 is h2.) Assume that the headings are children of
// the section elements.
function build_toc(parent, context, level)
{
  var headings = context.querySelectorAll("section > h{0}".fmt(level));
  if (headings.length > 0) {
    var ul = flexo.html("ul");
    parent.appendChild(ul);
    [].forEach.call(headings, function(heading) {
        var title = heading.textContent;
        var section = heading.parentNode;
        var li = flexo.html("li", {});
        ul.appendChild(li);
        if (section.id) {
          li.appendChild(flexo.html("a", { href: "#" + section.id }, title));
        } else {
          li.textContent = title;
        }
        build_toc(li, section, level + 1);
      });
  }
}

function build_examples_list(ul)
{
  [].forEach.call(document.querySelectorAll(".include-src"), function(div) {
      var id = div.id || flexo.random_id(6, document);
      div.id = id;
      flexo.dataset(div);
      var a = flexo.html("a", { href: "#{0}".fmt(id) });
      a.innerHTML = div.innerHTML;
      var li = flexo.html("li", {}, [a]);
      if (flexo.has_class(div, "check")) li.className = "check";
      ul.appendChild(li);
    });
}

function link_elements(template)
{
  [].forEach.call(document.querySelectorAll(".elem"), function(elem) {
      var next = elem.nextSibling;
      var parent = elem.parentNode;
      elem.parentNode.removeChild(elem);
      var a = flexo.html("a", { href: template.fmt(elem.textContent) },
        [elem]);
      parent.insertBefore(a, next);
    });
}


// TODO add parameters
// TODO highlight with data-hl
// TODO make links for href attributes; syntax highlighting?
function get_examples(debug)
{
  debug = debug || 0;
  [].forEach.call(document.querySelectorAll(".include-src"), function(p) {
      flexo.dataset(p);
      // Add a run flag unless the data-component attribute is set (do not run
      // components)
      var component = typeof p.dataset.component === "string" &&
        p.dataset.component;
      if (!component) {
        var src = p.dataset.src.replace(/^\.\.\//, "").replace(/\.xml$/, "");
        var suffix = p.dataset.suffix || "html";
        var href = "../core/bender.{0}?app={1}".fmt(suffix, src);
        if (debug) href += "&debug={0}".fmt(debug);
        p.insertBefore(flexo.html("a", { href: href }, "⚐ "), p.firstChild);
      }
      // Add an expand button and auto-expand if data-expand is set
      var expand = flexo.html("span", { "class": "expand" });
      p.insertBefore(expand, p.firstChild);
      expand.addEventListener("click", expand_example, false);
      expand_example(expand);
  });
}

// Toggle the expanded/unexpanded status of an example
function expand_example(e)
{
  var span = e.target || e;
  var p = span.parentNode;
  var expanded = typeof p.dataset.expanded === "string" && p.dataset.expanded;
  if (expanded) {
    var req = new XMLHttpRequest();
    req.open("GET", p.dataset.src);
    req.onreadystatechange = function() {
      if (req.readyState === 4) {
        if (req.status === 200 || req.status === 0) {
          p.appendChild(flexo.html("pre", {}, req.responseText));
        } else {
          flexo.add_class(p, "error");
          p.textContent = "Could not get {0} application file {1} ({2})"
            .fmt(suffix, p.dataset.src, req.status);
        }
      }
    };
    req.send("");
    span.textContent = "▾ ";
    p.dataset.expanded = "";
  } else {
    if (p.lastElementChild.localName === "pre") {
      p.removeChild(p.lastElementChild);
    }
    span.textContent = "▸ ";
    p.dataset.expanded = "true";
  }
}
