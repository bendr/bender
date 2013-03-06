# The Bender Data Model


## Components

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
and represent prototype to component relationships, constitutes a _forest_.
A component that has a prototype _derives_ from this prototype.

The view of a component describes how it is rendered.
Despite the name “view,” the rendering of a component is not necessarily visual
(this could be audio, or simply contain data in memory with no representation of
any kind.)

The properties of a component are (_name_, _value_) pairs that can parametrize
the rendering and behavior of the component.

The watches of a component are (_inputs_, _outputs_) pairs that define the
behavior of a component with regards to the values of properties and the
occurrence of events.


### XML serialization

A component is seralized as a `component` element.
The identifier is seralized as an `id` attribute.
The prototype of a component is serialized as an `href` attribute with the URI
of the prototype as its value.
Additional attributes (besides `id` and `href`) may be added to specify default
values for properties (see below.)
The links, view, properties and watches of an element are serialized as child
elements (see below for serialization details.)


### The component element as a container

When serialized as XML, a component may have other component child elements.
Strictly speaking, these are not part of the data model: the component element
acts merely as a container for other components.
Although there is a parent-child relationship between the component _elements_,
there is no relationship between the components themselves: the “child” is not
part of the “parent.”


### Component loading

Components are loaded asynchronously.
A component is loaded when it is referred to through the `href` attribute of a
`component` element.



## Links

A _link_ established a relationship between a component and an external
resource, namely a script or a stylesheet.
A link is defined by:

  * the location of the resource (given by URI), and
  * its relationship with the component (_i.e._, whether it is a script or a
    stylesheet.)


### Stylesheets

Stylesheets are loaded asynchronously, and once _per component_.


### Scripts

Scripts are loaded synchronously: a script will block the loading process until
it is loaded and executed.
Consequently, order of execution is preserved within a component.
A script is guaranteed to run only once _per component_.

When a Javascript script is run, it is invoked with `this` set to the component.


### XML serialization

A link is serialized as a `link` attribute.
The location is serialized as an `href` attribute.
The relationship is serialized as a `rel` attribute with value `stylesheet` for
a stylesheet and `script` for a script.


## The component view

A component has a view if and only if its view is defined, or it has a prototype
and its prototype has a view.
If a component has its own view and its prototype also has a view, the two views
can be combined in one of three ways.
These three _display modes_ are:

1. **top** mode: the view of the component appears “on top” of the view of its
   prototype;
2. **bottom** mode: the view of the prototype appears “on top” of the view of
   the component;
3. **replace** mode: the view of the component replaces the view of the
   prototype.

By default, a view is displayed in top mode.

A view may contain a _content slot_.
The use of the content slot is twofold:

1. the content slot defines the location where the “top view” appears;
2. the content slot provides default content when no “top view” appears
   (when a view _does_ appear, then the contents of the content slot are
   replaced with the contents of the “top view.”)

It follows that when a view is supposed to appear “on top” of another view,
but that other view has no content slot, then the “top view” will not appear at
all.
The component author **must** be careful to provide a content slot if she is
planning for the view of the component to be extensible.


### XML serialization

A view is serialized as a `view` attribute.
The display mode of the view is serialized as a `display` attribute with value
`top` (default), `bottom`, or `replace`.
Its contents are serialized as child elements and text nodes.



## Properties

A component inherits the properties of its prototypes.
A component may have its own value for a property that is inherited from its
prototype.
A component may have additional properties.

## Watches

A component inherits the watches of its prototype.
A component may have additional watches.


## Replication

View elements (that is any element appearing inside the view of a component)
may be replicated.
