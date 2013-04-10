# The Bender Javascript API

Bender v0.8.1, 10 April 2013

## Using the standard runtime

There are two flavors of the standard runtime: one is a HTML host document, the
other is an SVG document.
One main difference is that the SVG flavor of the runtime cannot handle
stylesheet links.
The runtime documents are located in the repository in `dom/runtime.html` and
`dom/runtime.svg`. 

To run a Bender component in a browser, open either document.
The component to run is specified with the `href` attribute, for instance:

    dom/runtime.html?href=test/sample.xml

will load the component at URL `test/sample.xml`, relative to the location of
`runtime.html`.
You may need to set specific flags or serve contents from a Web server for
loading with XMLHttpRequest to work.

Custom values can be set for the properties of the top-level component by
passing additional parameters in the URL.
For instance:

    dom/runtime.html?href=test/sample.xml&count=5

will set the `count` property of the component described in `sample.xml` to 5.
Arguments other than `href` that do not map to defined properties are ignored.
Values are parsed as specified by the `as` parameter of the property (see
below.)

## Javascript objects

### Components

A Bender component is represented by a **bender.Component** object.

**TODO** properties and methods

A *rendered* component has the following additional properties:

* **rendered** is a dictionary of concrete DOM nodes, indexed by the id of
  their counterpart in the view of the component (including text and attribute
  nodes.) There are three meta-ids: **$root** is the first concrete DOM element
  for the view in document order; **$document** is the host document;
  **$target** is the target in which the component was rendered (and thus should
  be the parent of **$root**.) There ids are the same that are used in the
  **elem** attribute of watches.
* **components** is a dictionary of components in scope, indexed by their id.
  Only components with a non-empty id are listed. There are two meta-ids,
  **$this** and **$that** which are defined to be respectively dynamic and
  lexical references to the component. These ids are the same that are used in
  the **component** attribute of watches.
* **children** is the list of all child components, including those that do not
  have an id.
* **parent** is the parent component (if any.)
* **properties** is a dictionary of properties for the component.

## Javascript in Bender components

Bender component may include Javascript code that is interpreted by the runtime.
Javascript code may appear in:

* `value` attribute of `property`, `get` or `set` elements;
* text content of `get` or `set` elements;
* `on-render` attribute of `component`.

### Property values

The `value` attribute of a `property` element gives an initial value to a
property.
Because XML attribute values are text strings, an additional attribute `as` may
be specified to define how that text string should be parsed.
The legal values of `as` are:

* `string` (which is the default): no parsing is done, the property value is the
  same text string as the attribute value;
* `boolean`: if the attribute value matches the string “true” (after trimming
  leading and trailing whitespace and converting to lowercase), then the
  property value is the boolean `true`, otherwise it is the boolean `false`;
* `dynamic`: the attribute value is evaluated as Javascript by creating a new
  anonymous function and prepending the string “return ” to the attribute value;
  therefore, the value should be a valid Javascript _expression_. This function
  is then called with `this` set to the component and the return value is used
  as the property value;
* `json`: the attribute value is parsed as a JSON string, and the property value
  is the result Javascript object;
* `number`: the attribute value is parsed as a Javascript number, using the
  `parseFloat` function.


### Get and set values

The `value` attribute of a `get` or `set` element is handled similarly to the
`value` attribute of a `property` element, except that there is no `as`
attribute: it defaults to `dynamic`.

Additionally, the Javascript function that is compiled gets called with
additional arguments:

* `get` elements with an `event` or `dom-event` attribute have an `event`
  parameter that is the event object;
* `get` elements with a `property` attribute have a `property` argument that is
  the value of the property;
* `set` elements have an `input` argument that is the value of the previous
  `get`.

In all cases, two other arguments get also passed:

1. `cancel` is a function that can be called with either no argument or a true
   value to cancel the execution of the value function altogether;
2. `that` is a pointer to the component *in which the watch was defined*, which
   which may be different from this.

When the value of a `get` or `set` element is specified as the text content of
the element, then no implicit return is added.
More complex functions with multiple statements can then be specified, which
must be careful to return a value.

**TODO** Example

### `on-render`

This attribute is defined on the component element and defines a function to be
called when the component is completely rendered (after the initial propagation
of properties.) The function is called with `this` set to the current component.
Only the function of the nearest component in the prototype chain is called, but
it also receives a `$super` parameter (note: this can be named to anything as
long as it is the first parameter of the function; also note that `super` is a
reserved word in Javascript) which is the next such function in the prototype
chain, already bound to the current component so that it can be simply called by
`$super()`.

## Bender API Reference

The Bender DOM runtime described here is implemented by `dom/bender.js`.

**TODO**
