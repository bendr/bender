# The Bender Data Model


## Components

A component is defined by:

  * an optional URI (an URL if serialized to a file);
  * an optional identifier (a component may be anonymous);
  * an optional prototype;
  * an optional view;
  * zero or more properties;
  * zero or more watches.

The prototype of a component, if defined, is another component.
There can be no cycle in the graph of prototypes: a component may not inherit
directly or indirectly from itself.
The graph of prototypes constitutes a _forest_.

The view of a component describes how it is rendered.
Despite the name “view,” the rendering of a component is not necessarily visual
(this could be audio, or simply contain data in memory with no representation of
any kind.)

The properties of a component are (_name_, _value_) pairs that can parametrize
the rendering and behavior of the component.

The watches of a component are (_inputs_, _outputs_) pairs that define the
behavior of a component with regards to the values of properties and the
occurrence of events.


## View and content slot

A component has a view if and only if its view is defined, or it has a prototype
and its prototype has a view.
If a component has its own view and its prototype also has a view, the two views
can be combined in one of three ways:

1. the view of the component appears “on top” of the view of its prototype;
2. the view of the prototype appears “on top” of the view of the component;
3. the view of the component replaces the view of the prototype.

A view may contain a _content slot_.
The use of the content slot is twofold:

1. the content slot defines the location where the “top view” appears;
2. the content slot provides default content when no “top view” appears
   (when a view _does_ appear, then the contents of the content slot are
   replaced with the contents of the “top view.”)

It follows that when a view is supposed to appear “on top” of another view,
but that other view has no content slot, then the “top view” will not appear at
all.
The component author __must__ be careful to provide a content slot if she is
planning for the view of the component to be extensible.

## Properties

A component inherits the properties of its prototypes.
A component may have its own value for a property that is inherited from its
prototype.
A component may have additional properties.

### Watches

A component inherits the watches of its prototype.
A component may have additional watches.


## Replication

View elements (that is any element appearing inside the view of a component)
may be replicated.
