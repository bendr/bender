# TODO List

Bender v0.8.1, 9 April 2013

## Semantic extensions

These extensions add actual features to Bender.

* Element replication: elements can be replicated zero or more times. This can
  be used to instantiate multiple copies of a single element, or select whether
  an element appears or not (by replicating zero or one time), even for
  recursive elements (such as recursive drawing.) Replication can be controlled
  by some number or a list of values.

* Manipulating component *traits* with watches: traits are similar to attributes
  and properties, and are features of the component tree itself, such as the
  *prototype* of a component, the *id* of a view, &c. These need to be
  accessible through watch inputs and outputs just like attributes and
  properties.

* Manipulating tree structure with watches: adding, removing and replacing
  nodes in the application tree. Structured values in watches and properties.
  (Action output: append/prepend/remove; insertion point output:
  before/after/replace.)

* Watch composition and input pattern matching: enabling and disabling watch
  depending on other watches (for instance: dragging.) Activating watches
  conditionally using pattern matching. Pause propagation to solve the turtle
  problem?

* Inline scripts, API for re/de-rendering when scripts appear in a view.

* DSL for value transformation: use a special-purpose purely function DSL for
  value transformations with (G)ADTs (or dependent types?) for pattern matching.


## Syntactic sugar

These extensions do not change the semantics of Bender in any way but enhance
the expressivity of the language by allowing complex constructs to be rendered
more briefly. These can be implemented by transformations of the input to a
simplified form, in the manner of the Relax NG simplification process.

* Property bindings: simple syntax to access properties (prefixed with ^) and
  rendered nodes (prefixed with #) within text contents of a document. When used
  in property value attribute or withing a view, create watches to *bind* the
  values together.

* ~~`$prototype` pseudo-component, as opposed to `$self`. `$self` is always the
  final component, whereas `$prototype` is the component currently defined.~~
  (Changed to **$this** and **$that**.) Also **own** attribute (or something
  similar) on properties to describe whether a property is defined on the final
  component or the prototype.

* Property getters and setters: similar to Javascript getter and setter.

* Default property values for components: attributes which are not `id` and
  `href` should be treated as property values for properties with the name of
  the attribute.

* Custom elements: give element names to components so that they can be referred
  to by a custom element name. Their content is only view content; their
  attribute only property values.

* Javascript properties: allow `<set property="context.fillStroke" ...>` where
  `context` is a Javascript object


## Meta features

* Persistence: deserialize components and maintain their state so that it can be
  retrieved from session to session.

* Inspector: inspect the tree at runtime. Allow editing as well.

* Foreign content in Bender documents: the runtime does not care but the schema
  does. Convetions for embedding documentation in components (or the other way
  around, see below.)

* Bender in foreign content: Bender components should be embeddable in any XML
  content. Multiple components can be contained in a single document, &c.

* Literate Bender: allow Bender components to be split in different parts so
  that they can be organized around their documentation, not the other way
  around.

* Metadata: more data about properties (e.g. private, read-only, &c.) and
  general information about components.

* Alternate renderers.


## Bugs and optimizations

* Scope of id for nested views: the element is stored in the wrong component.

* Error handling for ill-formed components.

* **on-render** only takes a function and should be able to take an object with
  a `handleEvent` method.

* Pull initial property values as necessary during rendering to render with the
  right values immediately.

* `lib/button.xml` does not behave well if the mouseup/mousedown events are too
  close to one another.

* Class attribute view of `lib/ui-elem.xml` should render properly.

* Simplify the watch graph: remove dead-ends, consolidate edges with id values,
  &c. Precompute path?

* JIT compilation: compile rendering/graph directly to Javascript? Handle
  changes in the graph.
