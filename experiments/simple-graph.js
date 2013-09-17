(function () {
  "use strict";

  var _class = flexo._class;  // kludge for Chrome to display class names

  function test() {
    var env = window.ENV = new bender.Environment();
    var A = env.component().property("x");
    A.properties.x = 1;
    show();
    var B = A.component().property("y");
    show();
    A.properties.x = 2;
    show();
    B.properties.x = 3;
    B.properties.y = "foo";
    show();
    var C = A.component();
    show();
    A.properties.x = 4;
    B.properties.x = 5;
    show();

    var A1 = A.instance();
    show();
    A.properties.x = 6;
    show();
    A1.properties.x = 7;
    show();
    A.properties.x = 8;
    show();
  }

  function show() {
    console.log(ENV.components.map(function (c) {
      var props = [];
      for (var p in c.properties) {
        props.push("%0`%1=%2".fmt(c.index, p, c.properties[p]));
      }
      return props.join(", ");
    }).join("; "));
  }

  bender.Component.prototype.init = function (scope) {
    bender.Element.prototype.init.call(this);
    var parent_scope = scope.hasOwnProperty("$environment") ?
      Object.create(scope) : scope;
    this.scope = Object.create(parent_scope, {
      $this: { enumerable: true, writable: true, value: this }
    });
    this.property_definitions = {};  // property nodes
    this.properties = init_properties(this, {});
    this.property_vertices = {};     // property vertices (for reuse)
  };

  // Create a new instance of the component
  bender.Component.prototype.instance = function () {
    var instance = new bender.SimpleInstance(this);
    instance.index = this.scope.$environment.components.length;
    this.scope.$environment.components.push(instance);
    return instance;
  };

  bender.Component.prototype.add_property = function (child) {
    if (this.property_definitions.hasOwnProperty(child.name)) {
      console.error("Redefinition of property %0 in component %1"
          .fmt(child.name, this.index));
    } else {
      this.property_definitions[child.name] = child;
      var vertex = render_property(child, this);
    }
  };

  bender.Component.prototype.component = function () {
    var component = this.scope.$environment.component(); 
    component.properties = init_properties(component,
        Object.create(this.properties));
    return component;
  };

  var instance = (bender.SimpleInstance = function (component) {
    this.component = component;
    this.properties = init_properties(this,
      Object.create(component.properties));
    this.property_vertices = {};
  }).prototype;

  _class(bender.SimplePropertyVertex = function (name) {
    this.init();
    this.name = name;
  }, bender.Vertex);

  bender.SimplePropertyVertex.prototype.visit = function (properties) {
    console.log("Set %0`%1=%2"
        .fmt(properties[""].index, this.name, properties[this.name]));
  };

  function init_properties(component, properties) {
    Object.defineProperty(properties, "", {
      value: component,
      configurable: true
    });
    return properties;
  };

  function render_property(property, component, value) {
    console.log("Render property %0`%1".fmt(component.index, property.name));
    var vertex = new bender.SimplePropertyVertex(property.name);
    component.property_vertices[property.name] = vertex;
    if (component) {
      Object.defineProperty(component.properties, property.name, {
        enumerable: true,
        configurable: true,
        get: function () { return value; },
        set: function (v) {
          if (value !== v) {
            if (this.hasOwnProperty(property.name)) {
              value = v;
            } else {
              vertex = render_property(property, this[""], v);
            }
            vertex.visit(this);
          }
        }
      });
    }
    return vertex;
  }

  test();

}());
