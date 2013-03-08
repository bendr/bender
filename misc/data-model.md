# The Bender Data Model

Bender describes Web applications through the combination of _components_.
Running a Bender application requires a runtime, which renders the component
describing the application, and runs the event loop for user interaction.

## Data model specification

### Components

A Bender **component** consists of:

* an optional identifier string (a component may be anonymous);
* an optional prototype component;
* zero or more links;
* zero or more views;
* zero or more properties;
* zero or more watches.

The identifier is a string.

The prototype of a component, if defined, is another component.
There can be no cycle in the graph of prototypes: a component may not inherit
directly or indirectly from itself.
The graph of components, where nodes are components and edges are directed and
represent prototype to component relationships, constitutes a *forest*.
A component that has a prototype *derives* from that prototype.

The view of a component describes how it is rendered.
Despite the name “view,” the rendering of a component is not necessarily visual
(this could be audio, or simply contain data in memory with no representation of
any kind.)

The properties of a component are *name* and *value* pairs that can parametrize
the rendering and behavior of the component.

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

### Views and content slots

A **view** consists of:

* an optional identifier string, which must be unique within the component;
* a stacking mode, which can be one of “top”, “bottom” or “replace”;
* a forest of DOM nodes, where a DOM can be one of:
  * an text node;
  * a CDATA section node;
  * a foreign element (not in the Bender namespace);
  * a Bender `component` element;
  * a Bender `text` element;
  * a Bender `content` element.

Component elements are XML representations of components as described above.
Text elements are placeholders for text nodes that can referred to by their id.
Content elements are XML representations of content slots.

A **content slot** consists of:

* an optional identifier string, which must be unique within the component;
* a forest of DOM dones, following the same specification as the view.

### Properties

A **property** consists of:

* a name, which must be unique within the component;
* an optional value, which can be any Javascript value (`undefined` if no value
  is given for the property.)

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

There are three kinds of outputs:

1. a **property output** consists of:
   * a target component;
   * a property name;
2. an **event output** consists of:
   * an event type;
3. a **DOM output** consists of:
   * a target element;
   * one of:
     * an attribute name;
     * an DOM property name;
     * an action, which can be one of “append”, “prepend” or “remove”;
     * an insertion point, which can be one of “before”, “after” or “instead.”

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
    <get component="button" event="@pushed"/>
    <set property="count" value="count + 1"/>
  </watch>
</component>
```

* A component *C* with
  * no identifier
  * no prototype
  * a property, which has
    * name `count`
    * value *0* (note: the `as` attribute of the `value` element defines how the
      attribute value, which in XML is always a string, should be parsed)
  * a view with
    * no identifier
    * **top** stacking mode (note: this is the default in the absence of a
      `stack` attribute)
    * an HTML `p` element
      * a text node
      * a Bender `text` element *T* with
        * identifier `clicks`
      * a text node
    * an HTML `p` element
      * a component element *B* with
        * identifier `button`
        * a prototype defined by the XML document at the URL `button.xml`
        * a view with
          * no identifier
          * **top** stacking mode
          * a text node
  * a watch with
    * a property input with
      * source component *C* (note: the parent component is the default
        component in the absence of a `component` attribute)
      * property name `count`
      * both incoming and outgoing value are the value of the *count* property
        on *C*
    * a DOM output with
      * target element *T*
      * DOM property `textContent` (note: this is the default)
      * both incoming and outgoing value are the value of the *count* property
        on *C*
  * a watch with
    * an event input with
      * source component *B*
      * event type `@pushed`
      * both incoming and outgoing value are an event object *E*
    * a property output with
      * target component *C*[^component-footnote]
      * incoming value *E*
      * outgoing value *count* + 1
