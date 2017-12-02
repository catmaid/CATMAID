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
    if (!Detector.webgl) {
      throw new CATMAID.NoWebGLAvailableError("WebGL is required by the tracing layer, but not available");
    }

    this.stackViewer = stackViewer;
    CATMAID.PixiLayer.call(this);

    options = options || {};

    this.opacity = options.opacity || 1.0; // in the range [0,1]

    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
    this.tracingOverlay = new SkeletonAnnotations.TracingOverlay(stackViewer, this, options);
    this.isHideable = true;

    // If the tracing layer state should be updated even though it is hidden
    this.updateHidden = false;

    if (!this.stackViewer.getLayersView().contains(this.renderer.view)) {
      this.stackViewer.getLayersView().appendChild(this.renderer.view);
      this.renderer.view.className = 'sliceTiles';
    }

    this.renderer.plugins.interaction.autoPreventDefault = false;

    Object.defineProperty(this, 'binaryTracingData', {
      get: function() {
        return this.tracingOverlay.binaryTracingData;
      },
      set: function(value) {
        this.tracingOverlay.binaryTracingData = value;
      }
    });
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
    CATMAID.PixiLayer.prototype.resize.call(this, width, height);
    this.tracingOverlay.redraw();
  };

  TracingLayer.prototype.beforeMove = function () {
    return this.tracingOverlay.updateNodeCoordinatesInDB();
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

  /**
   * Execute the passed in function, optionally asyncronously as a promise,
   * while making sure nodes get updated even though this layer might not be
   * visible.
   */
  TracingLayer.prototype.withHiddenUpdate = function(isPromise, fn) {
    // Explicitly reset this value to false, because executing many requests in
    // a row won't have individual requests wait until the previous one finishes
    // and resets this value. Therefore, reading out the original value isn't
    // necessarily reliable.
    return CATMAID.with(this, 'updateHidden', true, isPromise, fn, false);
  };

  TracingLayer.prototype.getLayerSettings = function() {
    return [{
      name: 'binaryTracingData',
      displayName: 'Transfer tracing data binarily',
      type: 'checkbox',
      value: this.binaryTracingData,
      help: 'Transferring tracing data as binary data can reduce its size and loading time.'
    }];
  };

  TracingLayer.prototype.setLayerSetting = function(name, value) {
    if ('binaryTracingData' === name) {
      this.binaryTracingData = value;
    }
  };

  TracingLayer.prototype.redraw = function() {
    this.tracingOverlay.redraw();
  };

  CATMAID.TracingLayer = TracingLayer;

})(CATMAID);
