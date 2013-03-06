# The Bender Data Model


## Bender data types

### Components

A component is defined by:

  * an optional identifier (a component may be anonymous);
  * an optional URI (an URL if serialized to a file; may contain a fragment
    identifier if its has an id);
  * an optional prototype;
  * zero or more links;
  * an optional view;
  * zero or more properties;
  * zero or more watches.

The prototype of a component, if defined, is another component.
There can be no cycle in the graph of prototypes: a component may not inherit
directly or indirectly from itself.
The graph of components, where an nodes are components and edges are directed
and represent prototype to component relationships, constitutes a *forest*.
A component that has a prototype *derives* from that prototype.

The view of a component describes how it is rendered.
Despite the name “view,” the rendering of a component is not necessarily visual
(this could be audio, or simply contain data in memory with no representation of
any kind.)

The properties of a component are *name*, *value* pairs that can parametrize
the rendering and behavior of the component.

The watches of a component are *inputs*, *outputs* pairs that define the
behavior of a component with regards to the values of properties and the
occurrence of events.

#### XML serialization of components

A component is seralized as a `component` element.
The identifier is seralized as an `id` attribute.
The prototype of a component is serialized as an `href` attribute with the URI
of the prototype as its value.
Additional attributes (besides `id` and `href`) may be added to specify default
values for properties (see below.)
The links, view, properties and watches of an element are serialized as child
elements (see below for serialization details.)

#### The component element as a container

When serialized as XML, a component may have other component child elements.
Strictly speaking, these are not part of the data model: the component element
acts merely as a container for other components.
Although there is a structural, parent-child relationship between the component
*elements*, there is no relationship between the components themselves: the
“child” is not part of the “parent” in any way.

#### Component loading

Components are loaded asynchronously.
Loading a component starts when it is referred to through the `href` attribute
of a `component` element.
This prototype component finishes loading once the resources that describes it
is loaded, and all components in its view have finished loading.

### Links

A *link* establishes a relationship between a component and an external
resource, namely a script or a stylesheet.
A link is defined by:

  * the location of the resource, given by URI; and
  * its relationship with the component, *i.e.*, whether it is a script or a
    stylesheet.

#### Stylesheet links

Stylesheets are loaded asynchronously, and once *per component*.
The application of a stylesheet is dependent on the runtime.

#### Script links

Scripts are loaded synchronously: a script will block the loading process until
it is loaded and executed.
Consequently, order of execution is preserved within a component.
A script is guaranteed to run only once *per component*.

When a Javascript script is run, it is invoked with `this` set to the component.

#### XML serialization of links

A link is serialized as a `link` element, appearing as the child of a
`component` element.
The location is serialized as an `href` attribute.
The relationship is serialized as a `rel` attribute with value `stylesheet` for
a stylesheet and `script` for a script.

### The component view

A component has a view if and only if its view is specified, or it has a
prototype and its prototype has a view.
If a component has its own view and its prototype also has a view, the two views
can be combined by stacking them in one of three ways.
These three *stacking modes* are:

1. **top** mode: the own view of the component appears on top of the view of its
   prototype;
2. **bottom** mode: the view of the prototype appears on top of the own view of
   the component;
3. **replace** mode: the own view of the component replaces the view of the
   prototype; in other words, the view of the prototype is completely ignored.

A view may contain a *content slot*.
The use of the content slot is twofold:

1. the content slot defines the location where the “top view” appears;
2. the content slot provides default content when no “top view” appears
   (when a view *does* appear, then the contents of the content slot are
   replaced with the contents of the “top view.”)

It follows that when a view is supposed to appear “on top” of another view,
but that other view has no content slot, then the “top view” will not appear at
all.
The component author must be careful to provide a content slot if she is
planning for the view of the component to be extensible (when in top stacking
mode.)

#### XML serialization of a view

A component view is serialized as a `view` element, appearing as the child of
a `component` element.
The stacking mode of the view is serialized as a `stack` attribute with value
`top` (default), `bottom`, or `replace`.
Its contents are serialized as child elements and text nodes.

The content slot of the view is serialized as a `content` element.
Its contents are serialized as child elements and text nodes.

### Properties

A property is defined by:

  * a name, which must be unique within the component;
  * an optional value, which can be any Javascript value (`undefined` if no
    value is given for the property.)

The properties of a component is the union of its *own* properties, *i.e.*,
properties which are defined for the component, and the properties of its
prototype.
A component may redefine a value from its prototype.

### XML serialization of a property

A property is serialized as a `property` element, appearing as the child of a
`component` element.
The name of the property is serialized as a `name` attribute.
The value of the property, if defined, is serialized either as a `value`
attribute, or as a child text node.

Because the value can only be serialized as text (either as an attribute or a
text node), the attribute `as` may be added to the `property` element to
describe how the value should be parsed by the runtime.
Possible values of `as` are:

  * `string` (default): no additional parsing — the value is used as is;
  * `number`: the value is parsed as number (float in Javascript);
  * `boolean`: the value is parsed as a boolean (the string “true”, with or
    without extra white space, and regardless of case, maps to `true`; all other
    values map to `false`);
  * `json`: the value is parsed as JSON;
  * `dynamic`: the value is passed to `eval`, with `this` set to the component.

In addition to `property` child elements, a `component` element may have
attributes beside `id` and `href`.
Given such an attribute named *p* with value *v*, if the prototype of the
component has a property named *p*, then this property will have the value *v*
for the component.
The value *v* is parsed according to the `as` attribute of the prototype
property.
If there is no such property, this attribute is ignored (a warning may be issued
by the runtime.)

### Watches

#### Property bindings (forthcoming)

### Replication (forthcoming)

View elements (that is any element appearing inside the view of a component)
may be replicated.


## Rendering

## Updates
