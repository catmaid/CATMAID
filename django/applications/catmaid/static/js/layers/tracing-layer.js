/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The tracing layer that hosts the tracing data
   */
  function TracingLayer( stack, options )
  {
    options = options || {};

    var self = this;

    self.opacity = options.opacity || 1.0; // in the range [0,1]
    this.svgOverlay = new SkeletonAnnotations.TracingOverlay(stack, options);

    /**
     * Return friendly name of this layer.
     */
    this.getLayerName = function()
    {
      return "Neuron tracing";
    };

    this.resize = function ( width, height )
    {
      self.svgOverlay.redraw();
    };


    this.beforeMove = function (completionCallback) {
      this.svgOverlay.updateNodeCoordinatesInDB(completionCallback);
    };

    this.getOpacity = function()
    {
      return self.opacity;
    };

    this.setOpacity = function ( val )
    {
      self.opacity = val;
      self.svgOverlay.view.style.opacity = val+"";
    };

    /** */
    this.redraw = function( completionCallback )
    {
      self.svgOverlay.redraw(false, completionCallback);
    };

    /**
     * Force redrwar of the tracing layer.
     */
    this.forceRedraw = function(completionCallback)
    {
      self.svgOverlay.redraw(true, completionCallback);
    };

    this.unregister = function()
    {
      // Remove from DOM, if attached to it
      var parentElement = this.svgOverlay.view.parentNode;
      if (parentElement) {
        parentElement.removeChild(this.svgOverlay.view);
      }

      this.svgOverlay.destroy();
    };
  }

  CATMAID.TracingLayer = TracingLayer;

})(CATMAID);
