### Changes in v0.8.1 (forthcoming)

* lib/check-box.xml: check box component.
* Setting a DOM attribute to null removes it.
* Improved deserialization by calling seq.flush() immediately.
* **on-render** attribute for **component** (see JS API.)
* Fixed warning when no `href` parameter is given in the runtime.
* Fixed argument passing in `bender.load_app`; `component.defined_properties`
  is a dictionary of all properties defined for a component (the union of its
  `own_properties` with the `defined_properties` of its prototype.)
