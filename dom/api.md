# The Bender Javascript API

Bender v0.8, 8 April 2013

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

## Javascript in Bender components

Bender component may include Javascript code that is interpreted by the runtime.
Javascript code may appear in:

* `value` attribute of `property`, `get` or `set` elements;
* text content of `get` or `set` elements.

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

In all cases, a `cancel` argument also gets passed. It is a function that can be
called with either no argument or a true value to cancel the execution of the
value function altogether.

When the value of a `get` or `set` element is specified as the text content of
the element, then no implicit return is added.
More complex functions with multiple statements can then be specified, which
must be careful to return a value.

**TODO** Example

## Bender API Reference

The Bender DOM runtime described here is implemented by `dom/bender.js`.

**TODO**
