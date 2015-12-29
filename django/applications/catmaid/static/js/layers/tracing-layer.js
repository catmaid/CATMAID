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
  function TracingLayer( stackViewer, options )
  {
    options = options || {};

    var self = this;

    self.opacity = options.opacity || 1.0; // in the range [0,1]
    this.tracingOverlay = new SkeletonAnnotations.TracingOverlay(stackViewer, options);

    /**
     * Return friendly name of this layer.
     */
    this.getLayerName = function()
    {
      return "Neuron tracing";
    };

    this.resize = function ( width, height )
    {
      self.tracingOverlay.redraw();
    };


    this.beforeMove = function (completionCallback) {
      this.tracingOverlay.updateNodeCoordinatesInDB(completionCallback);
    };

    this.getOpacity = function()
    {
      return self.opacity;
    };

    this.setOpacity = function ( val )
    {
      self.opacity = val;
      self.tracingOverlay.view.style.opacity = val+"";
    };

    /** */
    this.redraw = function( completionCallback )
    {
      self.tracingOverlay.redraw(false, completionCallback);
    };

    /**
     * Force redrwar of the tracing layer.
     */
    this.forceRedraw = function(completionCallback)
    {
      self.tracingOverlay.redraw(true, completionCallback);
    };

    this.unregister = function()
    {
      // Remove from DOM, if attached to it
      var parentElement = this.tracingOverlay.view.parentNode;
      if (parentElement) {
        parentElement.removeChild(this.tracingOverlay.view);
      }

      this.tracingOverlay.destroy();
    };
  }

  CATMAID.TracingLayer = TracingLayer;

})(CATMAID);
