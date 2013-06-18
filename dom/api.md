# The Bender Javascript API

Bender v0.8.1, 17 June 2013

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

* `string`: no parsing is done, the property value is the same text string as
  the attribute value;
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

The default value is `dynamic`.


### Get and set values

The `value` attribute of a `get` or `set` element is handled similarly to the
`value` attribute of a `property` element, except that there is no `as`
attribute: it defaults to `dynamic`.
(_Note_: there will be an `as` attribute in the near future.)

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
2. `scope` is a pointer to the scope of the components so that elements with ids
   can be accessed by their id, including some meta-ids such as `$that`.

When the value of a `get` or `set` element is specified as the text content of
the element, then no implicit return is added.
More complex functions with multiple statements can then be specified, which
must be careful to return a value.

**TODO** Example

### The `scope` object

The `scope` object is a mapping between identifiers in the component tree and
**concrete** nodes in the running application, or other Bender components.
For example, if the view of a component contains an HTML paragraph element with
the id _p_, then `scope.p` will point to the concrete HTML paragraph element
that gets rendered for this component.

All identifiers defined inside a component and the components in its view are in
the scope of the component.

There are several meta identifiers in a scope object:

* `$this` is the current component;
* `$that` is the parent component of the watch. It may differ from `$this` if
  the current component is derived from that component;
* `$document` is the current document;
* `$target` is the current target for the rendering.

These meta identifiers may also be used as values of the `elem` or `component`
attributes in `get` and `set` elements.

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

## Bindings

Bindings are special syntax that reduces the amount of markup necessary to
create watches. Text content (the value of properties, as well as attributes and
text nodes in a view) may contain direct reference to properties, which then get
rendered as watches in the following manner.

### Binding syntax

Bindings use two special characters, \` and \#. The backtick (\`) is the mark of
a property name. By default, this refers to a property of the parent component;
but the property name may be prefixed by an id name marked with a sharp sign
(\#) to point to a component or element in the scope of the parent component.

Example:

```xml
<component xmlns="http://bender.igel.co.jp" id="sample">
  <property name="count" as="number" value="0"/>
  <property name="roman" value="flexo.to_roman(`count).toUpperCase()"/>

  ...

      <component href="../lib/button.xml" id="button-minus" class="red">
        <property name="enabled" value="#sample`count &gt; 0"/>
```

In the fragment above, the **roman** property of the **sample** component makes
a reference to the **count** property of the same component.
Then, in the **button-minus** component below, another reference is made to the
**count** property of the **sample** component; this time, the component
referred to needs to be named explicitly.

### Property bindings

A *property binding* is a binding inside the value of a property (the example
above shows two such bindings) interpreted dynamically.
A watch is created for every property that has at least one occurrence of a
bound property, which corresponds to a watch input.
A single output is created for a watch, setting the value of the property.

In the above example, two new watches are created:

```xml
<watch>
  <get property="count"/>
  <set property="roman"
    value="flexo.to_roman(this.properties.count).toUpperCase()"/>
</watch>
```

and

```xml
<watch>
  <get component="sample" property="count"/>
  <set property="enabled" value="scope.sample.properties.count) &gt; 0"/>
</watch>
```

### Text bindings

A *text* binding is a binding inside the value of a property interpreted as a
string, or inside a literal attribute or text node in the view of a component.
Text bindings differ from property bindings in that they are simple string
replacements, and are not evaluted as Javascript.

## Bender API Reference

The Bender DOM runtime described here is implemented by `dom/bender.js`.

### The Bender environment

**TODO**
