"use strict";

var flexo = require("flexo");
var bender = exports;



// Create a new environment in a document, or window.document by default.
var environment = (bender.Environment = function () {
  this.scope = { environment: this };
  this.urls = {};
  this.components = [];
  this.vertices = [];
  this.vortex = this.add_vertex(new bender.Vortex());
}).prototype;

// Add a vertex to the watch graph and return it.
environment.add_vertex = function (vertex) {
  vertex.index = this.vertices.length === 0 ?
    0 : (this.vertices[this.vertices.length - 1].index + 1);
  vertex.environment = this;
  this.vertices.push(vertex);
  return vertex;
};


// Base for Bender elements.
var element = (bender.Element = function () {}).prototype;


// Simple vertex, simply has incoming and outgoing edges.
var vertex = (bender.Vertex = function () {}).prototype;

vertex.init = function () {
  this.incoming = [];
  this.outgoing = [];
  return this;
};

// We give the vortex its own class for graph reasoning purposes
flexo._class(bender.Vortex = function () {
  this.init();
}, bender.Vertex);
