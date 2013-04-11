### Changes in v0.8.1 (forthcoming)

* Improved error reporting somewhat.
* Attributes of **component** to set property defaults.
* Components have a **children** property to access all child components.
* Add classes from the id of components to the $root element automatically (in
  the HTML runtime only.)
* Set **$root** pseudo-id for the first element rendered for a component (if
  any.)
* Renamed **$self** to **$this**, and added **$that** for a lexical binding of
  the parent component (versus dynamic binding.) Also **that** in value
  transforms.
* lib/check-box.xml: check box component.
* Setting a DOM attribute to null removes it.
* Improved deserialization by calling seq.flush() immediately.
* **on-render** attribute for **component** (see JS API.)
* Fixed warning when no `href` parameter is given in the runtime.
* Fixed argument passing in `bender.load_app`; `component.defined_properties`
  is a dictionary of all properties defined for a component (the union of its
  `own_properties` with the `defined_properties` of its prototype.)
