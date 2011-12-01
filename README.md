# Bender; or, a declarative Web application framework.

Copyright © 2011, [IGEL Co., Ltd.](http://www.igel.co.jp/bender/)


Bender is a declarative framework to build web applications and reusable
components. It is free software and is released under the Apache License v2.0
(see included [LICENSE](LICENSE) file.) The goal of Bender is to make authoring
Web applications easier through better and higher level abstractions, and being
itself a foundation for more powerful authoring tools.

The Bender framework consists of:

  1. a markup language based on XML for application and component description;
  2. Javascript support libraries;
  3. runtimes for different Web browsers and SVG players.

The design and implementation of Bender are currently evolving very quickly.
When a more stable specification is reached, a component library and authoring
tools will be added.


### Bender Basics

The basic building block in Bender is the _component_. Components are meant to
be reusable, composable and extensible. A component has _properties_, may have
a _view_ describing how it gets rendered, and may be scripted to define its
behavior. Components are defined in terms of other components, and communicate
with each other through events. A Bender application is itself a component.

Here is the complete XML _description_ of a Bender application. It shows a
message ("Welcome to Bender!") and a button labeled "Thanks". When the user
clicks the button, an alert box pops up with the message "You're welcome!".

```xml
<app xmlns="http://bender.igel.co.jp" xmlns:html="http://www.w3.org/1999/xhtml">
  <title>Welcome to Bender!</title>
  <view>
    <html:p>
      Welcome to Bender!
    </html:p>
    <html:p>
      <component href="../lib/button.xml" id="button">Thanks</component>
    </html:p>
  </view>
  <watch>
    <get view="button" event="@pushed">
      alert("You're welcome!");
    </get>
  </watch>
</app>
```

This application is a single component. It has a view that describes its
rendering using HTML; it includes another component, the button, and _watches_
changes of the `@pushed` event of that button.


#### The `app` element

The `app` element introduces a component that is meant to be run as a
standalone application. This element and other elements of the Bender
vocabulary are in the `http://bender.igel.co.jp` namespace. The contents of
this element (or the synonymous `component` element) is the _definition_ of the
component.

The `title` child element is metadata. Its role is similar to that of the
[`title` element in
SVG](http://www.w3.org/TR/SVG/struct.html#DescriptionAndTitleElements) and can
be added to any component. _Note_: indeed, we may also add a `desc` element as
well.


#### The `view` element

A component may have a `view` child element that describes the rendering of
that element. Bender applications are rendered by a host runtime, such as a Web
browser running the Bender Javascript runtime, so the view may contain any XML
markup that the host runtime is able to display. This means that HTML (using
an XML serialization), SVG, MathML, or any other language may be used.

The view here mixes HTML elements (using a namespace prefix) and a Bender
`component` element. When a `component` element contains a `ref` or `href`
attribute that points to the ID or the URL of a component definition, its role
is to create a new _instance_ of that component. In the context of view, this
also means that the view of the new instance gets rendered in place of the
`component` element.

Here we have an URL reference to a file that contains the definition of an HTML
button component. Let's have a look at its view:

```xml
<view>
  <html:div class="bender-button" id="b" aria-role="button">
    <content/>
  </html:div>
</view>
```

Once again this is a mix of HTML and Bender elements. The `content` element can
only appear in a view and describes an insertion point for additional content,
being the content of the `component` element that was used for its
instantiation. Since the instantiating element was:

```xml
<component href="../lib/button.xml" id="button">Thanks</component>
```

the contents of which is a text node ("Thanks"), the resulting view will be:

```html
<p>
  Welcome to Bender!
</p>
<p>
  <div class="bender-button" aria-role="button">
    Thanks
  </div>
</html:p>
```

The mysterious disappearance of the id attribute of the button's `div` as well
as the inclusion of the button's stylesheet will be discussed in more details
later on.


#### The `watch` element

Now we know how the application needs to be displayed. The component
abstraction allows us to not have to worry about how the button works; we just
need to know that when it is activated, by a mouse click, or a tap on a touch
screen, or by a key event when focused, it sends a `@pushed` _event_. Bender
has a custom eventing system; by convention, event names start with @.

In a typical Web application environment, we would listen to `@pushed` events
from that button instance and call a handler function (displaying the alert
box) accordingly. In Bender, this approach is generalized through _watches_. A
watch has one or more inputs and zero or more output. In this application, we
see the simplest sort of watch with a single input and no output:

```xml
<watch>
  <get view="button" event="@pushed">
    alert("You're welcome!");
  </get>
</watch>
```

The `watch` element introduces a new watch; its children are either `get`
(resp. `set`) elements, for inputs (resp. outputs.) An input can be a Bender
event from a component, or an event from a DOM node, or a component property
change. Outputs can be event properties or DOM node attributes. When an input
is received, the outputs are activated. **Note**: there are more complex rules
for multiple inputs.

The `get` event here describes the single input for our watch: the `@pushed`
event from the element with id `button` in the view of the component. A `get`
or `set` element may have text content which is interpreted as Javascript and
can transform the value getting in or going out. In this specific case, the
value getting in (the event object) is ignored and since there no output, there
is no value getting out. However, a side effect of the script inside the `get`
element is that an alert box shows up. **Note**: we could also have used a
`set` element as follows:

```xml
<watch>
  <get view="button" event="@pushed"/>
  <set>
    alert("You're welcome!");
  </set>
</watch>
```

To illustrate the versatility of watches, here is a different kind of watch:

```xml
<watch>
  <get property="n"/>
  <set view="arabic"/>
  <set view="roman">
    return flexo.to_roman(value) || "unknown";
  </set>
</watch>
```

Here we monitor the property `n` of a component (presumably a number) through
the `get` element. We have two outputs in the form of `set` elements that set
the content of two different view elements. In the first case (`arabic`), the
value received in input (_i.e._, the value of the `n` property) is copied as
is. In the second case, the value is first transformed to roman numerals before
being displayed. This watches allows two different displays of the same value
to be kept in sync and uses only a single line of Javascript.
