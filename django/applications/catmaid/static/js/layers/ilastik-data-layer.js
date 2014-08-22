/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  function IlastikDataLayer(stackViewer, data)
  {
    this.stackViewer = stackViewer;
    this.opacity = 1;
    this.radius = 3;

    // Pre-process the data to map rows to z indices
    this.data = data.reduce(function(o, r) {
      var z = r[3];
      if (! (z in o)) {
        o[z] = [];
      }
      o[z].push(r);

      return o;
    }, {});

    // Create container, aligned to the upper left
    this.view = document.createElement("div");
    this.view.style.position = "absolute";
    this.view.style.left = 0;
    this.view.style.top = 0;

    // Append it to DOM
    stackViewer.getView().appendChild(this.view);

    // Create SVG
    this.paper = Raphael(this.view, stackViewer.viewWidth, stackViewer.viewHeight);
  }

  IlastikDataLayer.prototype = {};

  IlastikDataLayer.prototype.getLayerName = function()
  {
    return "Ilastik data";
  };

  IlastikDataLayer.prototype.setOpacity = function( val )
  {
      this.view.style.opacity = val;
      this.opacity = val;
  };

  IlastikDataLayer.prototype.getOpacity = function()
  {
      return this.opacity;
  };

  IlastikDataLayer.prototype.resize = function(width, height)
  {
    this.paper.setSize(width, height);
    this.redraw();
  };

  IlastikDataLayer.prototype.redraw = function(completionCallback)
  {
    // Clean paper
    this.paper.clear();

    // Get view box in local/stack and world/project coordinates
    var localViewBox = this.stackViewer.createStackViewBox();
    var worldViewBox = this.stackViewer.primaryStack.createStackToProjectBox(localViewBox);

    // Find data points on current slice
    var z = this.stackViewer.z;
    var stackPositions = this.data[z] || [];

    // Translate the stack positions found to screen space
    // TODO: Expect project coordinates to handle different stacks
    // TODO: Handle orthogonal views
    var screenPositions = stackPositions.map((function(p) {
      var s = this.stackViewer;
      return [
        (p[1] - s.x) * s.scale + s.viewWidth * 0.5,
        (p[2] - s.y) * s.scale + s.viewHeight * 0.5,
        (p[8] - s.x) * s.scale + s.viewWidth * 0.5,
        (p[9] - s.y) * s.scale + s.viewHeight * 0.5
      ];
    }).bind(this));

    // Draw synapses and lines to referred node (if they are in view)
    screenPositions.forEach((function(p) {
      var sVisible = p[0] >= 0 && p[0] < this.paper.width &&
                     p[1] >= 0 && p[1] < this.paper.height;
      var nVisible = p[2] >= 0 && p[2] < this.paper.width &&
                     p[3] >= 0 && p[3] < this.paper.height;

      if (sVisible || nVisible) {
        var line = this.paper.path(['M', p[0], p[1], 'L', p[2], p[3]]);
        line.attr('stroke', '#0ff');
      }
      if (sVisible) {
        var circle = this.paper.circle(p[0], p[1], this.radius);
        circle.attr('fill', '#00f');
        circle.attr('stroke', '#0ff');
      }
    }).bind(this));

    if (completionCallback) {
        completionCallback();
    }
  };

  IlastikDataLayer.prototype.unregister = function()
  {
    this.stackViewer.getView().removeChild(this.view);
  };

  // Export layer
  CATMAID.IlastikDataLayer = IlastikDataLayer;

})(CATMAID);
