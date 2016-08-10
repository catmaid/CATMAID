/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The tracing layer that hosts the tracing data
   *
   * @param {StackViewer} stackViewer Stack viewer containing this layer.
   * @param {Object=}     options     Options passed to the tracing overlay.
   */
  function TracingLayer(stackViewer, options) {
    this.stackViewer = stackViewer;
    CATMAID.PixiLayer.call(this);

    options = options || {};

    this.opacity = options.opacity || 1.0; // in the range [0,1]

    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
    this.tracingOverlay = new SkeletonAnnotations.TracingOverlay(stackViewer, this, options);
    this.isHideable = true;

    if (!this.stackViewer.getLayersView().contains(this.renderer.view)) {
      this.stackViewer.getLayersView().appendChild(this.renderer.view);
      this.renderer.view.className = 'sliceTiles';
    }

    this.renderer.plugins.interaction.autoPreventDefault = false;
  }

  TracingLayer.prototype = Object.create(CATMAID.PixiLayer.prototype);
  TracingLayer.prototype.constructor = TracingLayer;

  /**
   * Return friendly name of this layer.
   */
  TracingLayer.prototype.getLayerName = function () {
    return "Neuron tracing";
  };

  TracingLayer.prototype.resize = function (width, height) {
    this.tracingOverlay.redraw();
  };

  TracingLayer.prototype.beforeMove = function (completionCallback) {
    this.tracingOverlay.updateNodeCoordinatesInDB(completionCallback);
  };

  TracingLayer.prototype.getClosestNode = function (x, y, radius, respectVirtualNodes) {
    return this.tracingOverlay.getClosestNode(x, y, radius, respectVirtualNodes);
  };

  TracingLayer.prototype.setOpacity = function (val) {
    CATMAID.PixiLayer.prototype.setOpacity.call(this, val);

    this.tracingOverlay.paper.style('display', this.visible ? 'inherit' : 'none');
  };

  /** */
  TracingLayer.prototype.redraw = function (completionCallback) {
    this.tracingOverlay.redraw(false, completionCallback);
  };

  /**
   * Force redraw of the tracing layer.
   */
  TracingLayer.prototype.forceRedraw = function (completionCallback) {
    this.tracingOverlay.redraw(true, completionCallback);
  };

  TracingLayer.prototype.unregister = function () {
    this.tracingOverlay.destroy();

    CATMAID.PixiLayer.prototype.unregister.call(this);
  };

  CATMAID.TracingLayer = TracingLayer;

})(CATMAID);
