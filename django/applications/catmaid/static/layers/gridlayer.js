/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * A GridLayer object can render a SVG grid to a view. Its offset is relative to
 * the project's origin.
 */
var GridLayer = function(stack, options) {
  this.stack = stack;
  // Make sure there is an options object
  options = options || {};
  this.opacity = 1;
  this.lineColor = options.lineColor || '#FFFFFF';
  this.lineWidth = options.lineWidth || 2;
  // Cell width and cell height in nanometers
  this.cellWidth = options.cellWidth || 1000;
  this.cellHeight = options.cellHeight || 1000;
  this.xOffset = options.xOffset || 0;
  this.yOffset = options.yOffset || 0;

  // Create grid view, aligned to the upper left
  this.view = document.createElement("div");
  this.view.style.position = "absolute";
  this.view.style.left = 0;
  this.view.style.top = 0;

  // Append it to DOM
  stack.getView().appendChild(this.view);

  // Create SVG
  this.paper = Raphael(this.view,
      Math.floor(stack.dimension.x * stack.scale),
      Math.floor(stack.dimension.y * stack.scale));
};

GridLayer.prototype = {};

GridLayer.prototype.getLayerName = function()
{
  return "Grid";
};

GridLayer.prototype.setOpacity = function( val )
{
    this.view.style.opacity = val;
    this.opacity = val;
}

GridLayer.prototype.getOpacity = function()
{
    return this.opacity;
}

/**
 * Allows to set all grid options at once
 */
GridLayer.prototype.setOptions = function(cellWidth, cellHeight, xOffset, yOffset, lineWidth)
{
  if (cellWidth) this.cellWidth = cellWidth;
  if (cellHeight) this.cellHeight = cellHeight;
  if (xOffset) this.xOffset = xOffset;
  if (yOffset) this.yOffset = yOffset;
  if (lineWidth) this.lineWidth = lineWidth;
};

GridLayer.prototype.resize = function()
{
  this.redraw();
};

GridLayer.prototype.redraw = function(completionCallback)
{
  // Get view box in local/stack and world/project coordinates
  var localViewBox = this.stack.createStackViewBox();
  var worldViewBox = this.stack.createStackToProjectBox(localViewBox);

  // Find first horizontal and vertical start coordinate for grid, in
  // world/project coordinates.
  var xGridStartW = this.cellWidth - (worldViewBox.min.x - this.xOffset) % this.cellWidth;
  var yGridStartW = this.cellHeight - (worldViewBox.min.y - this.yOffset) % this.cellHeight;

  // TODO: Make this work with different orientations
  // The drawing math should be done in local/stack coordinates to avoid a
  // performance hit.
  var xGridStartL = (xGridStartW - this.stack.translation.x) * (this.stack.scale / this.stack.resolution.x);
  var yGridStartL = (yGridStartW - this.stack.translation.y) * (this.stack.scale / this.stack.resolution.y);
  // Round later to not let rounding errors add up
  var cellWidthL = (this.cellWidth * this.stack.scale) / this.stack.resolution.x;
  var cellHeightL = (this.cellHeight * this.stack.scale) / this.stack.resolution.y;

  // Number of cells and grid height/width
  var numHCells = Math.ceil((worldViewBox.max.x - worldViewBox.min.x - xGridStartW) / this.cellWidth) + 1;
  var numVCells = Math.ceil((worldViewBox.max.y - worldViewBox.min.y - yGridStartW) / this.cellHeight) + 1;
  var width = localViewBox.max.x - localViewBox.min.x;
  var height = localViewBox.max.y - localViewBox.min.y;

  // Clean paper
  this.paper.clear();
  // Horizontal lines
  for (var r=0; r<numVCells; ++r) {
    var yFrom = Math.round(yGridStartL +  r * cellHeightL);
    var line = this.paper.path("M0," + yFrom + "H" + width + "Z");
    line.attr('stroke', this.lineColor);
    line.attr('stroke-width', this.lineWidth);
  }
  // Vertical lines
  for (var c=0; c<numHCells; ++c) {
    var xFrom = Math.round(xGridStartL + c * cellWidthL);
    var line = this.paper.path("M" + xFrom + ",0V" + height + "Z");
    line.attr('stroke', this.lineColor);
    line.attr('stroke-width', this.lineWidth);
  }

  if (completionCallback) {
      completionCallback();
  }

  return;
};

GridLayer.prototype.unregister = function()
{
  this.stack.getView().removeChild(this.view);
};
