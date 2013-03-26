# The Bender processing model

Bender v0.8, 26 March 2013

## An informal sketch of the operational semantics of Bender

The *Bender runtime* has a single core functionality, which is the *rendering*
of components.
Once the component is rendered, including its watches, the host application of
the runtime is in charge of managing the layout and user interactions of the
running components.
The role of the runtime is to maintain the consistency of the rendered
components when their data changes.

The runtime maintains an *environment*, which keeps track of loaded components
and external resources, which should both be loaded only once.
In a DOM-based runtime, the environment is hosted by a document, and renders
components in an element node of this document.

The steps of rendering a component *C* in the environment *E* in an element node
*N* are:

1. render the links of *C*;
2. render the view of *C*;
3. setup the properties of *C*;
4. render the watches of *C*;
5. send a `@rendered` event notification.

### Links rendering

If *C* has a prototype *P*, then the links of the prototype *P* are rendered.
Then, for every link *L* of *C*:

* if the link was already loaded in *E*, do nothing;
* otherwise, load the resource identified by the URI of *L*.
  The actual rendering of the resource is implementation-dependent.
  For instance, if the run-time runs in a HTML document, a stylesheet link
  should be rendered as a HTML `link` element in the head of the document, and a
  script link should be rendered as a `script` element.

### View rendering

Rendering the view of *C* is done by creating the *view stack* of *C*,
depending on *C* and the view stack of its prototype, and then rendering the
result stack in *E*, matching content slots and content views in the process.

#### The view stack

The view stack of *C* is constructed by the following steps:

1. Get the view stack *S* of the prototype *P* of *C*. If *C* has no prototype,
   then the stack *S* is empty.
2. add *C* to the stack *S*, taking into account the stacking mode of its view:
     * if *C* has no view, or its view has the “top” stacking mode, then add it
       at the end of *S*;
     * if the view of *C* has the “bottom” stacking mode, then add *C* at the
       beginning of *S*;
     * if the view of *C* has the “replace” stacking mode, then replace the
       contents of the stack with *C*.

#### Rendering the view stack

Let *i* be the index of the first component in the view stack such that the
component *C<sub>i</sub>* has a view *V<sub>i</sub>* with an empty identifier.
This view is rendered into *E* by rendering its children in order in *E*.

* A DOM text node *T* is rendered by appending a new text node with the text
  content of *T* to the target element *E*.
* A DOM element node *N* is rendered by appending a new DOM element *N’* with
  the same namespace URI and local name as *E*. The attributes of *E’* are the
  same as *E*, with the exception of the `id` attribute which is not rendered.
  The children of *E* are then rendered into *E’*.
* A child component is rendered by the component rendering rule.
* A Bender attribute node *A* is rendered by setting an attribute on the target
  element *E*. The local name and namespace URI of the attributes are given by
  the corresponding properties of *A*. The value of the attribute is a
  concatenation of the renderings of the child nodes.
* A Bender text node *T* is rendered by appending a new text node with the text
  content of *T* to the target element *E*. This differs from a regular text
  node only in the fact that a Bender text node may have an identifier so that
  it can be referred to by watches, as described below. Note that if *T* is a
  child of a Bender attribute node *A*, then instead of a DOM text node, a
  string is built.
* A content slot *S* with identifier *I* is rendered according to the contents
  of the view stack. Let *j* be the index of the first component in the view
  stack such that *j* > *i* and component *C<sub>j</sub>* has a view
  *V<sub>j</sub>* with identifier *I*.
    * If such a *j* exists, then render the children of *V<sub>j</sub>* in *E*.
    * Otherwise, render the children of *S* in *E*.

**TODO** describe main scenarios for using views: framing, spit view, &c.


### Properties setup

The set of properties of a component is the union of the component’s own
properties and the set of properties of its prototype (or the empty set if the
component has no prototype.)

If a property with the same name appears in both sets, then the component’s own
property takes precedence.


### Watches rendering

Bender renders watches for components as vertices in a *watch graph*. Other
vertices in the watch graph are components and rendered DOM nodes. Edges in the
graph correspond to watch inputs and outputs. Edges are directed and labeled.

#### Edges in the watch graph

A watch input is rendered as an incoming edge of its parent watch in the watch
graph. The source vertex and label of the edge depend on the type of the input:

* for a property input, the source vertex is the source component and the label
  is the property name;
* for a DOM event input, the source vertex is the element rendered in the target
  document for the input DOM element, and the label is the DOM event type;
* for an event input, the source vertex is the source component and the label is
  the event type.

A watch output is rendered as an outgoing edge of its parent watch in the watch
graph. The destination vertex and label of the edge depend on the type of the
output:

* for a property output, the destination vertex is the target component, and the
  label is the property name;
* for an event output, the destination vertex is the target component, and the
  label is the event type;
* for a DOM attribute output, the destination vertex is the element rendered in
  the target document for the target DOM element, and the label is the attribute
  name;
* for a DOM property output, the destination vertex is the element rendered in
  the target document for the target DOM element, and the label is the property
  name;
* for an action output, the destination vertex is either the element rendered in
  the target document for the target element if it is a DOM element or Bender
  text element, and the target node otherwise; and the label is the action;
* for an insertion point output, the destination vertex is either the element
  rendered in the target document for the target element if it is a DOM element
  or Bender text element, and the target node otherwise; and the label is the
  insert point.

#### Edge and watch activation

Edges and watch vertices in this graph can be *activated* or not. Initially, all
vertices and edges are non-activated. When an edge becomes activated, its
*activation value* is set.

An incoming edge *E* with label *L* from vertex *V* to watch vertex *W* becomes
activated when it is not already activated, and its destination vertex *W* is
not activated, and:

* the property with the name *L* on component *V* changes, and the edge was
  rendered from a property input: the activation value is the value of the
  property;
* the DOM element *V* sends an event notification of type *L*, and the edge was
  rendered from a DOM event input: the activation value is the event as
  described in the data model;
* the component *V* sends an event notification of type *L*, and the edge was
  rendered from an event input: the activation value is the event as described
  in the data model.

After the edge *E* becomes activated, the watch vertex *W* is activated itself.
All of its outgoing edges are then activated. Two things happen when an outgoing
edge is activated:

1. the corresponding output takes effect;
2. the outgoing edges of the destination vertex are activated.

For an outgoing edege *E* with label *L* and activation value *v*, the effects
of the outputs are as follows:

* for a property output: let *P* be the property with name *L* of the target
  component *C*. If *P* is the own property of *C*, then set its value to *v*.
  If *P* is a property of the prototype of *C*, add a new property *P’* with
  name *L* and value *v* to *C*. Otherwise, there is no effect;
* for an event output, a new event notification with type *L* and additional
  arguments given by *v* is sent by the destination component;
* for a DOM attribute output, the attribute name *L* of the destination DOM
  element is set to value *v*.

Transforming values is dependent on the runtime and is not covered here.

After an outgoing edge *E* to vertex *V* has been activated, new edges from *V*
to some watch *W* may be activated, leading to new watch activations, and so on.
(integrate this in the descriptions above.)

When no new activation happens, all activated edges and watches are reset to a
non-activated state.
