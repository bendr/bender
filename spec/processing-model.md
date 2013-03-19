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

Rendering the view of *C* is done by:

1. creating the *view stack* of *C*, depending on the view of *C* and the view
   stack of its prototype;
2. matching content slots and content views in the view stack;
3. rendering the result stack in the environment *E*.

#### The view stack

The view stack of *C* is constructed by the following steps:

1. Get the view stack *S* of the prototype *P* of *C*. If *C* has no prototype,
   then the stack *S* is empty.
2. If *C* has a view, add it to the stack *S*, taking into account its stacking
   mode:
     * if *C* has the “top” stacking mode, then add it at the end of *S*;
     * if *C* has the “bottom” stacking mode, then add it at the beginning of
       *S*;
     * if *C* has the “replace” stacking mode, then replace the contents of the
       stack with *C*.

```haskell
stack_views :: Component -> [Component]
stack_views c@(Component _ p _ vs _ _) =
  let v = view_for_id vs Nothing
      stack = case p of
                Nothing -> []
                Just p' -> stack_views p'
  in case v of
       Nothing -> stack
       Just (View _ Top _) -> stack ++ [c]
       Just (View _ Bottom _) -> c:stack
       Just (View _ Replace _) -> [c]
    
view_for_id :: [View] -> Maybe String -> Maybe View
view_for_id [] _ = Nothing
view_for_id (v@(View i _ _):vs) j
  | i == j = Just v
  | otherwise = view_for_id vs j
```

### Watches rendering
