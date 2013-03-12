# The Bender processing model

Bender v0.8, 12 March 2013

## An informal sketch of the operational semantics of Bender

The Bender runtime has only one core functionality, which is the *rendering* of
components, and maintaining the consistency of the rendering when the component
is modified. Once the component is rendered, including its watches, the host
application of the runtime is in charge of managing the layout and user
interactions of the running components.

The runtime maintains a context, which keeps track of loaded components and
external resources (which should both be loaded only once.) In a DOM-based
runtime, the context is hosted by a document, and renders components in an
element of this document.

The steps of rendering a component *C* in the context *X* under element *E* are:

1. render the properties of *C*;
2. render the links of *C*;
3. render the views of *C*;
4. render the watches of *C*.

### Properties rendering

Properties rendering consists in “filling in” the default values for the
component properties. For every default value *D* of *C*:

* if *C* has a property *P* with the same name as *D*, then set the value of *P*
  to the value of *D*;
* otherwise, if the prototype of *C*, or its prototype (and so on) has a
  property *P*, then add a new property *P’* copied from *P* to *C* and set its
  value to the value of *D*. If no such property can be found, the default value
  is ignored.

### Links rendering

Links are rendered in order. For every link *L* of *C*:

* if the link was already loaded in *X*, do nothing;
* otherwise, load the resource at the URI given by *L*. The actual rendering of
  the resource is left to the implementation; for instance, if the run-time runs
  in a HTML document, a stylesheet link should be rendered as a HTML `link`
  element in the head of the document, and a script link should be rendered as a
  `script` element.

### Views rendering

Rendering of the views of *C* is done by first building a *view template* from
its views and the *view template* of its prototype. Once the template is built,
it is copied to the target element. The view nodes must 

#### View template

The view template of *C* is defined by the following rules:

* if *C* has no prototype, its view template is the list of its views;
* else, if *C* has no views, its view template is the view template of its
  prototype;
* otherwise, its view template is the merging of the view template of its
  prototype and its list of views.

#### 

### Watches rendering


## Example

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
