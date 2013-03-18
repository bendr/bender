# The Bender processing model

Bender v0.8, 19 March 2013

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

1. render the links of *C*;
2. render the view of *C*;
3. render the watches of *C*.

### Links rendering

Links are rendered in order. For every link *L* of *C*:

* if the link was already loaded in *X*, do nothing;
* otherwise, load the resource at the URI given by *L*. The actual rendering of
  the resource is left to the implementation; for instance, if the run-time runs
  in a HTML document, a stylesheet link should be rendered as a HTML `link`
  element in the head of the document, and a script link should be rendered as a
  `script` element.

### View rendering



### Watches rendering
