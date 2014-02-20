// Bender core, implementing only the processing model as defined in
// /spec/data-model.html and /spec/processing-model.html. See runtime.js for
// the runtime, XML serialization, and other sorts of syntactic sugar.

/* global bender, console, exports, flexo, global, require, window */

(function () {
  "use strict";

  if (typeof window === "object") {
    window.bender = {};
  } else {
    global.flexo = require("flexo");
    global.bender = exports;
  }

  bender.version = "0.9";


  // Base for all objects
  bender.Base = {

    // The initializer must return the initialized object
    init: flexo.self,

    // Create a new object and initialize it
    create: function () {
      return this.init.apply(Object.create(this), arguments);
    }
  };


  // Node < Object
  //   Node?  parent
  //   Node*  children
  bender.Node = flexo._ext(bender.Base, {
    init: function () {
      this.children = [];
      return bender.Base.init.call(this);
    },

    add_child: function (child) {
      if (child.parent) {
        console.error("Child already has a parent");
        return this;
      }
      child.parent = this;
      this.children.push(child);
      return child;
    },

    child: function (child) {
      return this.add_child(child), this;
    }
  });


  // Component < Node
  //   Component?  prototype
  //   Property*   property-definitions
  //   data*       properties
  //   View?       view
  //   Watch*      watches
  bender.Component = flexo._ext(bender.Node, {
    init: function (view) {
      this.property_definitions = this.hasOwnProperty("property_definitions") ?
        Object.create(this.property_definitions) : {};
      this.properties = {};
      if (view) {
        if (view.component) {
          console.error("View already in a component".fmt(p.name));
        }
        this.view = view;
        this.view.component = this;
      }
      this.watches = [];
      return bender.Node.init.call(this);
    },

    // Add a property to the component and return the component.
    property: function (property) {
      if (property in this.properties) {
        console.error("Property %0 already defined".fmt(p.name));
        return this;
      }
      this.property_definitions[property.name] = property;
      property.component = this;
      return this;
    },

    // Add a watch to the component and return the component. If a Watch object
    // is passed as the first argument, add this watch; otherwise, create a new
    // watch with the contents passed as arguments.
    watch: function (watch) {
      if (watch.component) {
        console.error("Watch already in a component");
        return this;
      }
      this.watches.push(watch);
      watch.component = this;
      return this;
    }
  });

  Object.defineProperty(bender.Component, "prototype", {
    enumerable: true,
    get: function () {
      var prototype = Object.getPrototypeOf(this);
      if (prototype !== bender.Component) {
        return prototype;
      }
    }
  });


  // Property < Base
  //   Component  component
  //   string     name
  bender.Property = flexo._ext(bender.Base, {
    init: function (name) {
      this.name = name;
      return bender.Base.init.call(this);
    }
  });


  // Element < Node
  //   View  view
  bender.Element = flexo._ext(bender.Node);

  Object.defineProperty(bender.Element, "view", {
    enumerable: true,
    configurable: true,
    get: function () {
      return this.parent && this.parent.view;
    }
  });


  // View < Element
  //   Component  component
  bender.View = flexo._ext(bender.Element);

  Object.defineProperty(bender.View, "view", {
    enumerable: true,
    get: flexo.self
  });


  // Content < Element
  bender.Content = flexo._ext(bender.Element);


  // DOMElement < Element
  //   string  ns
  //   string  name
  //   data*   attributess
  bender.DOMElement = flexo._ext(bender.Element, {
    init: function (ns, name, attributes) {
      this.ns = ns;
      this.name = name;
      this.attributes = attributes || {};
      return bender.Element.init.call(this);
    }
  });


  // Attribute < Element
  //   string  ns
  //   string  name
  bender.Attribute = flexo._ext(bender.Element, {
    init: function (ns, name) {
      this.ns = ns;
      this.name = name;
      return bender.Element.init.call(this);
    }
  });


  // Text < Element
  //   string  text
  bender.Text = flexo._ext(bender.Element, {
    text: function (text) {
      if (arguments.length === 0) {
        return this._text || "";
      }
      this._text = flexo.safe_string(text);
      return this;
    }
  });


  // Watch < Object
  //   Component  component
  //   Get*       gets
  //   Set*       sets
  bender.Watch = flexo._ext(bender.Base, {
    init: function () {
      this.gets = [];
      this.sets = [];
      return this;
    },

    adapter: function (adapter, list) {
      if (adapter.watch) {
        console.error("Adatper already in a watch.");
        return this;
      }
      list.push(adapter);
      adapter.watch = this;
      return this;
    },

    get: function (get) {
      return this.adapter(get, this.gets);
    },

    set: function (get) {
      return this.adapter(set, this.sets);
    }
  });


  // Adapter < Object
  //   Watch     watch
  //   Node      target
  //   Function  value = λx x
  //   Function  match = λx true
  //   number?   delay
  bender.Adapter = flexo._ext(bender.Base, {
    init: function (target) {
      this.target = target;
      return bender.Base.init.call(this);
    }
  });


  // Get < Adapter
  bender.Get = flexo._ext(bender.Adapter);


  // GetProperty < Get
  //   Property  property
  bender.GetProperty = flexo._ext(bender.Get, {
    init: function (target, property) {
      this.property = property;
      return bender.Get.init.call(this, target);
    }
  });

  // GetEvent < Get
  //   string  type
  bender.GetEvent = flexo._ext(bender.Get, {
    init: function (target, type) {
      this.type = type;
      return bender.Get.init.call(this, target);
    }
  });


  // Set < Adapter
  bender.Set = flexo._ext(bender.Adapter);


  // SetProperty < Set
  //   Property  property
  bender.SetProperty = flexo._ext(bender.Set, {
    init: function (target, property) {
      this.property = property;
      return bender.Set.init.call(this, target);
    }
  });


  // SetNodeProperty < Set
  //   string  name
  bender.SetNodeProperty = flexo._ext(bender.Set, {
    init: function (target, name) {
      this.name = name;
      return bender.Set.init.call(this, target);
    }
  });


  // SetAttribute < Set
  //   string?  ns
  //   string   name
  bender.SetAttribute = flexo._ext(bender.Set, {
    init: function (target, ns, name) {
      this.ns = ns;
      this.name = name;
      return bender.Set.init.call(this, target);
    }
  });


  // SetEvent < Set
  //   string  type
  bender.SetEvent = flexo._ext(bender.Set, {
    init: function (target, type) {
      this.type = type;
      return bender.Set.init.call(this, target);
    }
  });

}());
