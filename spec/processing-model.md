# The Bender processing model

Bender v0.8.2, 10 Sep 2013

## An informal sketch of the operational semantics of Bender

### Scopes

The hierarchy of scopes is:

* The *environment scope*, which points to the current environment
(`$environment`) and its document (`$document`.)
    * The *abstract scope*, which contains all abstract IDs for a component and
    its descendants, and is shared by these components. Abstract IDs are
    prefixed with a `#` sign in `select` attributes.
        * The *component scope*, which is the scope of a component, and points
        to that component’s self (`$this`) and its view (`$view`.)
        * The *concrete scope*, which contains all the concrete IDs for an
        instance of a component and the instances of its descendants. Concrete
        IDs are prefixed with a `@` sign in `select` attributes.
            * The *instance scope*, which is one of the scopes of an instance,
            and points to that instance’s self (`$this`), the component that it
            is an instance of (`$that`), and the first rendered node (`$first`.)

**TODO** add an example here.


## The following is outdated and needs review

The *Bender runtime* has a single core functionality, which is the *rendering*
of components.
Once the component is rendered, including its watches, the host application of
the runtime is in charge of managing the layout and user interactions of the
running components.
The role of the runtime is to maintain the consistency of the rendered
components when their data changes.

The runtime maintains an *environment*, which keeps track of loaded components
and external resources, as they should both be loaded only once.
In a DOM-based runtime, the environment is hosted by a DOM document, and renders
components in an element node of this document.

The environment manages a *render tree* (more acurately, a forest; but it is
simpler to consider a single tree without any loss of generality) and a *watch
graph*.
The render tree represents the output of the views of the component that is to
be displayed by the runtime, while the watch graph is the internal
representation of the watches of all the rendered components.

A component *C* is rendered in the environment *E* in the following manner:

1. the links of *C* are rendered;
2. *C* sends a **before-render** notification;
3. the properties of *C* are rendered into the watch graph *E*;
4. the view of *C* and its child components are rendered into the render tree of
   *C*;
5. the watches of *C* and its child components are rendered into the watch graph
   of *E*;
6. *C* sends an **after-render** notification;
7. the properties of *C* are initialized;
8. *C* sends a **before-init** notification;
9. the properties of the child components of *C* are initialized;
10. *C* sends an **after-init** notification.
11. Lastly, if *C* is a top-level component, its render tree is added to the
    target, as well as the render tree of *E*; then *C* and its child components
    each send a **ready** notification.

These steps mean that the render tree and watch graph are built *bottom-up*,
while the properties of the components are initialized *top-down*.

### Links rendering

If *C* has a prototype *P*, then the links of the prototype *P* are rendered
first.
Then, for every link *L* of *C*:

* if the link was already loaded in *E*, do nothing;
* otherwise, load the resource identified by the URI of *L*.
  The actual rendering of the resource is implementation-dependent.
  For instance, if the run-time runs in a HTML document, a stylesheet link
  should be rendered as a HTML `link` element in the head of the document, and a
  script link should be rendered as a `script` element.
  The scripts are executed in order of loading, which means that the scripts of
  *P* are guaranteed to have run when the scripts of *C* run.
  Order of execution is not guaranteed when it comes to child components, so a
  component should not rely on any other component’s scripts beside its own and
  those of its prototype.
  The run-time environment may provide scripts that are guaranteed to have run
  when the component is rendered; these are implementation-dependent.

### View rendering

Rendering the view of *C* is done by creating the *view stack* of *C*,
depending on *C* and the view stack of its prototype, and then rendering the
result stack in *E*, matching content slots and content views in the process.

#### The view stack

The view stack of *C* is constructed by the following steps:

1. Get the view stack *S* of the prototype *P* of *C*. If *C* has no prototype,
   then the stack *S* is empty.
2. add *C* to the stack *S*, taking into account the stacking mode of its view:
     * if *C* has no view, or its view has the “top” stacking mode, then add *C*
       at the end of *S*;
     * if the view of *C* has the “bottom” stacking mode, then add *C* at the
       beginning of *S*;
     * if the view of *C* has the “replace” stacking mode, then replace the
       contents of the stack with *C*.

#### Rendering the view stack

Let *i* be the index of the first component in the view stack such that the
component *C<sub>i</sub>* has a view *V<sub>i</sub>*.
This view is rendered into *E* by rendering its children in order in *E*.

* A DOM text node *T* is rendered by appending a new text node with the text
  content of *T* to the target element *E*.
* A DOM element node *N* is rendered by appending a new DOM element *N’* with
  the same namespace URI and local name as *E*.
  The attributes of *E’* are the same as *E*, with the exception of the **id**
  attribute, which is not rendered.
  The children of *E* are then rendered into *E’*.
* A child component is rendered by the component rendering rule.
* A Bender attribute node *A* is rendered by setting an attribute on the target
  element *E*.
  The local name and namespace URI of the attributes are given by the
  corresponding properties of *A*.
  The value of the attribute is a concatenation of the renderings of the child
  nodes.
* A Bender text node *T* is rendered by appending a new text node with the text
  content of *T* to the target element *E*.
  This differs from a regular text node only in the fact that a Bender text node
  may have an identifier so that it can be referred to by watches, as described
  below.
  Note that if *T* is a child of a Bender attribute node *A*, then instead of a
  DOM text node, a string is built.
* A content slot *S* is rendered according to the contents of the view stack.
  Let *j* be the index of the first component in the view stack such that *j* >
  *i* and component *C<sub>j</sub>* has a view *V<sub>j</sub>*.
    * If such a *j* exists, then render the children of *V<sub>j</sub>* in *E*.
    * Otherwise, render the children of *S* in *E*.


### Properties and watches rendering

Properties and watches of a component are rendered into the environment’s *watch
graph*.
A watch, along with its inputs and outputs, is rendered into *vertices* and
*edges* in this graph.

#### Vertices

Vertices represent properties, watch inputs and watch themselves.

#### Edges

Edges represent the outputs of watches.


#### Properties rendering

The set of properties of a component is the union of the component’s own
properties and the set of properties of its prototype (or the empty set if the
component has no prototype.)

If a property with the same name appears in both sets, then the component’s own
property takes precedence.
