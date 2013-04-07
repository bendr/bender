# The Bender data model

Bender v0.8, 7 April 2013

Bender describes Web applications through the combination of *components*.
Running a Bender application requires a runtime, which renders the component
describing the application, and runs an event loop for user interactions.

## Data model specification

### Components

A Bender **component** consists of:

* an identifier string;
* an optional prototype component;
* zero or more links;
* zero or more properties;
* an optional view;
* zero ore more content views;
* zero or more watches.

The identifier is a string, possibly empty (a component may be anonymous.)

The prototype of a component, if defined, is another component.
There can be no cycle in the graph of prototypes: a component may not inherit
directly or indirectly from itself.
The graph of components, where nodes are components and edges are directed and
represent prototype to component relationships, constitutes a *forest*.
A component that has a prototype *derives* from that prototype.

Additional resources may be linked to a component.

The properties of a component are *name* and *value* pairs that can parametrize
the rendering and behavior of the component.

The view of a component, along with its content views, describe how the
component is rendered.
The actual rendering of the component will depend on its own view, as well as
the view of its prototype (if any.)
Despite the name “view,” the rendering of a component is not necessarily visual
(this could be audio, or simply contain data in memory with no representation of
any kind.)

The watches of a component are *inputs* and *outputs* pairs that define the
behavior of a component with regards to the values of properties and the
occurrence of events.

### Links

A **link** consists of:

* an URI identifying an external resource;
* the relationship between the resource and the component; which can either be
  “script” or “stylesheet.”

A link establishes a relationship between a component and an external script
or stylesheet.

### Views, content slots and content views

A **view** consists of:

* a stacking mode, which can be one of “top”, “bottom” or “replace”;
* a list of children, which may each be one of:
  * an DOM text node;
  * a DOM element that is not in the Bender XML namespace;
  * a component;
  * **TODO**: a Bender element node;
  * a Bender attribute node;
  * a Bender text node;
  * a content slot.

A **content view** is defined just like a view, with the addition of an
identifier string, which must be unique within the component.

There is a parent-child relationship between the component of a view or content
view and components that appear within the view.

A **Bender attribute node** consists of:

* an identifier string, which may be empty and must be unique within the
  component;
* an optional namespace URI;
* a name;
* a list of child nodes, which may be DOM text nodes or Bender text nodes.

Bender attribute nodes are placeholders for attributes on elements that can be
referred to by their id (attribute nodes in the DOM do not have an id.)

A **Bender text node** consists of:

* an identifier string, which may be empty and must be unique within the
  component;
* a text string.

Bender text nodes are placeholders for DOM text nodes that can referred to by
their id (text nodes in the DOM do not have an id.)

A **content slot** consists of:

* an identifier string, which may be empty and must be unique within the
  component;
* a list of child DOM nodes, following the same specification as the view.

### Properties

A **property** consists of:

* a name, which must be unique within the component;
* a value, which can be any Javascript value (`undefined` if no value is given
  for the property.)

### Watches

A **watch** consists of:

* one or more inputs;
* zero or more outputs.

An **input** or **output** consists of:

* an incoming value;
* an outgoing value;
* additional traits depending on the kind of input or output.

There are three kinds of inputs:

1. a **property input** consists of:
   * a source component;
   * a property name;
2. a **DOM event input** consists of:
   * a source DOM element;
   * an event type;
3. an **event input** consists of:
   * a source component;
   * an event type.

There are six kinds of outputs:

1. a **sink output**;
2. a **property output** consists of:
   * a target component;
   * a property name;
3. a **DOM event output** consists of:
   * a target element;
   * an event type;
4. an **event output** consists of:
   * a target component;
   * an event type;
5. a **DOM attribute output** consists of:
   * a target element;
   * an attribute namespace;
   * an attribute name;
6. a **DOM property output** consists of:
   * a target element;
   * an DOM property name;

### Events

In addition to DOM events, which originate from DOM nodes, Bender also provides
custom events, consisting of:

* a source object;
* an event type;
* any number of additional arguments.

## Example

A simple example of a Bender component, using the XML serialization:

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="count" as="number" value="0"/>
  <view xmlns:html="http://www.w3.org/1999/xhtml">
    <html:p>
      Number of clicks: <text id="clicks"/>
    </html:p>
    <html:p>
      <component href="button.xml" id="button">
        <view>
          +1
        </view>
      </component>
    </html:p>
  </view>
  <watch>
    <get property="count"/>
    <set elem="clicks"/>
  </watch>
  <watch>
    <get component="button" event="!pushed"/>
    <set property="count" value="this.properties.count + 1"/>
  </watch>
</component>
```

This XML document describes a component *C* with

* a property with
  * name `count`
  * value *0* (note: the `as` attribute of the `value` element defines how the
    attribute value, which in XML is always a string, should be parsed)
* a view with
  * **top** stacking mode (note: this is the default in the absence of a
    `stack` attribute)
  * two content nodes (note: whitespace-only text nodes have been omitted)
      * an HTML `p` element with
          * a DOM text node
          * a Bender `text` node *T* with
              * identifier `clicks`
      * an HTML `p` element with
          * a component *B* with
              * identifier `button`
              * a prototype defined by the XML document at the URL `button.xml`
              * a view with
                  * no identifier
                  * **top** stacking mode
                  * a DOM text node
* a watch with
  * a property input with
      * source component *C* (note: the parent component is the default
        component in the absence of a `component` attribute)
      * property name `count`
      * both incoming and outgoing value are the value of the *count* property
        on *C*
  * a DOM property output with
      * target element *T*
      * DOM property `textContent` (note: this is the default)
      * both incoming and outgoing value are the value of the *count* property
        on *C*
* a watch with
  * an event input with
      * source component *B*
      * event type `!pushed`
      * both incoming and outgoing value are an event object *E*
  * a property output with
      * target component *C*
      * incoming value *E*
      * outgoing value *count* + 1, where *count* is the current value of the
        property named `count` on component *C*.
