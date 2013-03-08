# The Bender processing model

Bender v0.8, 8 March 2013

A Bender component (see data model for the formal definition of a component) is
processed by a _runtime_.
In this document a DOM-based runtime is assumed where rendering is performed by
outputting a DOM tree in a target element.
Future versions of Bender will allow other types of rendering.

## Component loading

Components can be referred to by an URI, which must be resolvable to an XML
document containing the description of the component following the Bender XML
syntax as described by the Relax NG grammar.
A component is loaded by loading the XML file corresponding to the URI.
Loading finishes when the XML file has been loaded and parsed into the data
model, *and* all child components that require loading have been loaded.


---

Everything below this point needs reviewing.


Components are loaded asynchronously.
Loading a component starts when it is referred to through the `href` attribute
of a `component` element.
This prototype component finishes loading once the resources that describes it
is loaded, and all components in its view have finished loading.

## Rendering and mutations

Rendering is the operation of rendering a component in the target application.
Rendering occurs when:

* the component is created;
* the view of the component is set, unset or modified;
* the prototype of the component is set, unset or modified.

Once the component is rendered, mutations, that is changes to its own DOM
(adding or removing elements, changing attribute values, &c.) and of its
properties, are mirrored in the rendering.


### Stylesheet links

Stylesheets are loaded asynchronously, and once *per component*.
The application of a stylesheet is dependent on the runtime.

### Script links

Scripts are loaded synchronously: a script will block the loading process until
it is loaded and executed.
Consequently, order of execution is preserved within a component.
A script is guaranteed to run only once *per component*.

When a Javascript script is run, it is invoked with `this` set to the component.



## View

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
A view may have only one content slot.

### View content and rendered nodes

The content of the view is XML markup, consisting of *foreign elements*
(elements not in the Bender namespace), text nodes, as well as the following
Bender elements:

* `component` (child components)
* `content` (content slot)
* `text` (addressable text node)

When the view of the component is rendered by the runtime, new _rendered nodes_
are created, corresponding to the view nodes.

* foreign elements and text nodes are rendered as is;
* `component` elements are rendered by rendering the view of the components;
* the `content` is rendered by rendering the top view, if any, or the default
  contents;
* `text` elements are rendered by rendering a text node.

Any element in the view may have an `id` attribute.
This id is **not** rendered, but the component keeps a map of view ids to
rendered nodes.
These ids are used for watch inputs and outputs as described below.

## Properties

The properties of a component is the union of its *own* properties, *i.e.*,
properties which are defined for the component, and the properties of its
prototype.
A component may redefine a value from its prototype.


## Watch

A watch is not activated by default.
A watch is activated when it is not already activated and one of its output is
activated, as described below.
Once a watch is activated, it will stay activated until the runtime deactivates
it.
Upon being activated, the outputs of the watch are applied.
This may cause other watches to be activated, and their outputs to be applied.
Once there are no more new activations, all activated watches become
deactivated.

### Input activation

There are three kinds of inputs:

1. a **property input** monitors the change of a property of a component;
2. an **event input** listens to a Bender event from a component;
3. a **DOM event input** listens to a DOM event from a rendered element.

An input has an associated value, which goes through a transformation to produce
the final activation value.
The default transform is the identity function that returns the input value
unchanged.

A property input is activated when the value of the property of a component
changes.
The initial value of the property input is the new value of the property.

An event input is activated when an event notification is sent by a component.
The initial value of the event input is the event arguments object.

A DOM event input is activated when a DOM event notification is sent by a
rendered element.
The initial value of the event input is the event argument object.

### Output application

There are four kinds of outputs:

1. a **property output** sets the value of a property of a component;
2. a **DOM output** sets an attribute or property of a view element;
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

              initial value
                   ↓
    ────┐ ┌─────────────────┐ ┌────
    ... │ │ activated input │ │ ...
    ────┘ └─────────────────┘ └────
                   ↓
            activation value
          ↙        ↓        ↘
    ┌────────┐ ┌────────┐ ┌────────┐
    │ output │ │ output │ │ output │
    └────────┘ └────────┘ └────────┘
        ↓          ↓          ↓
      output     output     output
      value      value      value

A property output is applied by setting the value of the property to the output
value.

A DOM output is applied by setting the attribute, property or text content of a
rendered node to the output value.

An event output is applied by sending an event notification on behalf of a
component.
The event argument is the output value.

A custom output does nothing and relies only on the side effects of the output
value transformation.

### XML serialization of a watch

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

The `$root` meta-value can be used to refer to the root of the rendered view of
the component.


