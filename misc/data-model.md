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

#### Foreign content; text and attribute elements

[TODO]

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

#### XML serialization of a property

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

A watch is defined by:

  * one or more _inputs_;
  * zero or more _outputs_.

A watch is activated when it is not activated and one of its output is
activated, as described below.
Once a watch is activated, it will stay activated until the runtime deactivates
it.
Upon being activated, the outputs of the watch are applied.
This may cause other watches to be activated, and their outputs to be applied.
Once there are no more new activations, all activated watches become
deactivated.

#### Input activation

There are three kinds of inputs:

  1. a **property input** monitors the change of a property of a component;
  2. an **event input** listens to an event from a component;
  3. a **DOM event input** listens to a DOM event from a rendered element.

An input has an associated value, which goes through a transformation to produce
the final activation value.
The default transform is the identity function that returns the input value
unchanged.

A property input is activated when the value of the property of a component
changes.
The intial value of the property input is the new value of the property.

An event input is activated when an event notification is sent by a component.
The initial value of the event input is the event arguments object.

A DOM event input is activated when a DOM event notification is sent by a
rendered element.
The initial value of the event input is the event argument object.


#### Output application

There are four kinds of outputs:

  1. a **property output** sets the value of a property of a component;
  2. a **DOM output** sets the value of a DOM node (attribute, property, or
     text content);
  3. an **event output** generates an event notification;
  4. a **custom output** does nothing on its own but can be customized through
     Javascript.

After a watch has been activated through one of its ouputs being activated, all
outputs are applied in sequence.
Every output receives a value which is the transformed value of the input that
was activated.
The input value is then transformed before the output is applied.
The default output transformation is the identity function that returns the
input value unchanged.

A property output is applied by setting the value of the property to the output
value.

A DOM output is applied by setting the attribute, property or text content of a
rendered node to the output value.

An event output is applied by sending an event notification on behalf of a
component.
The event argument is the output value.

A custom output does nothing and relies only on the side effects of the output
value transformation.

#### XML serialization of a watch

A watch is serialized as a `watch` element.

The inputs of a watch are serialized as child `get` elements.
The outputs of a watch are serialized as child `set` elements.
The transform function of a `get` or `set` element (that is, of a watch input or
output), is a Javascript function contained in a text child node of the element,
or a `value` attribute.
Empty or whitespace-only content is ignored.

A property input is serialized as a `get` element with the following attributes:

  * the `property` attribute is the name of the watched property;
  * the `component` attribute is the id of the component being watched (default
    is `$self`, which is a special value indicating the component of the watch.)

An event input is serialized as a `get` element with the following attributes:

  * the `event` attribute is the name of the event to listen to;
  * the `component` attribute is the id of the component being watched (default
    is `$self`, which is a special value indicating the component of the watch.)

An DOM event input is serialized as a `get` element with the following
attributes:

  * the `dom-event` attribute is the name of the event to listen to;
  * the `view` attribute is the id of the view element being watched.

A property output is serialized as a `set` element with the following
attributes:

  * the `property` attribute is the name of the property to set;
  * the `component` attribute is the id of the target component (default is
    `$self`, which is a special value indicating the component of the watch.)

A DOM output is serialized as a `set` element with the following attributes:

  * the `view` attribute is the id of the target view element;
  * the `attr` attribute is the name of the attribute to set, or
  * the `property` attribute is the name of the DOM property to set (default is
    `textContent`, so the text content of the element is set.)

An event ouput is serialized as a `set` element with the following attribute:

  * the `event` attribute is the name of the event to send (default is to use
    the `type` property of the output value.)

#### Property bindings (forthcoming)

### Replication (forthcoming)

View elements (that is any element appearing inside the view of a component)
may be replicated.


## Rendering

Rendered nodes, ids, &c.

## Updates
