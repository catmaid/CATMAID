/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * The tracing layer that hosts the tracing data
 */
function TracingLayer( stack )
{

  var self = this;

  self.opacity = 1.0; // in the range [0,1]
  this.svgOverlay = new SkeletonAnnotations.SVGOverlay(stack);

  /**
   * Return friendly name of this layer.
   */
  this.getLayerName = function()
  {
    return "Neuron tracing";
  };

  this.resize = function ( width, height )
  {
    self.svgOverlay.redraw( stack );
    return;
  }


  this.beforeMove = function (completionCallback) {
    this.svgOverlay.updateNodeCoordinatesinDB(completionCallback);
  }

  this.getOpacity = function()
  {
    return self.opacity;
  }

  this.setOpacity = function ( val )
  {
    self.opacity = val;
    self.svgOverlay.view.style.opacity = val+"";
  };

  /** */
  this.redraw = function( completionCallback )
  {
    // should never update from database - is called frequently
    // on dragging

    // TODO: only move the nodes in the Raphael paper
    // will only update them when releasing the mouse when navigating.

    self.svgOverlay.redraw( stack, completionCallback );
    return;
  };

  /*
  this.update = function()
  {
    // this fetches from the database, e.g. after deleting a node in the object tree
    self.svgOverlay.updateNodes();
    self.svgOverlay.redraw( stack );
  }
  */

  this.unregister = function()
  {
    this.svgOverlay.destroy();
    // TODO Remove the SVG raphael object from the DOM
  };

  this.isolateTileLayer = function()
  {
    // TODO: implement removal
    // see tilelayer.js
  }

  this.reattachTileLayer = function()
  {
    // TODO: implement readding of the layer
    // see tilelayer.js
  }

}
