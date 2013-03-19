# The Bender processing model

Bender v0.8, 19 March 2013

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
3. render the watches of *C*.

### Links rendering

Links are rendered in order. For every link *L* of *C*:

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
* A Bender text node *T* is rendered by appending a new text node with the text
  content of *T* to the target element *E*. This differs from a regular text
  node only in the fact that a Bender text node may have an identifier so that
  it can be referred to by watches, as described below.
* A content slot *S* with identifier *I* is rendered according to the contents
  of the view stack. Let *j* be the index of the first component in the view
  stack such that *j* > *i* and component *C<sub>j</sub>* has a view
  *V<sub>j</sub>* with identifier *I*.
    * If such a *j* exists, then render the children of *V<sub>j</sub>* in *E*.
    * Otherwise, render the children of *S*.

**TODO** describe main scenarios for using views: framing, spit view, &c.

### Watches rendering


