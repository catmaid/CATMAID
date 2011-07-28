/**
 * The tracing layer that hosts the tracing data
 */
function TracingLayer( stack )
{

  var self = this;

  this.svgOverlay = new SkeletonAnnotations.SVGOverlay( stack );

  this.resize = function ( width, height )
  {
    self.svgOverlay.redraw( stack );
    return;
  }


  /** */
	this.redraw = function()
	{
    // should never update from database - is called frequently
    // on dragging

    // TODO: only move the nodes in the Raphael paper
    // will only update them when releasing the mouse when navigating.

    self.svgOverlay.redraw( stack );
    return;
  };

	this.unregister = function()
	{
        // TODO Remove the SVG raphael object from the DOM
	};


}
