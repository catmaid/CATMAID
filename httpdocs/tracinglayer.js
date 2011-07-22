/**
 * The tracing layer that hosts the tracing data
 */
function TracingLayer( stack )
{

  var self = this;

  this.svgOverlay = new SVGOverlay(stack.resolution, stack.dimension, stack.translation, stack.scale);

  this.resize = function ( width, height )
  {

  //    pl, //!< float left-most coordinate of the parent DOM element in nanometer
  //pt, //!< float top-most coordinate of the parent DOM element in nanometer
  //ns //!< scale factor to be applied to resolution [and fontsize]

    var c = stack.getWorldTopLeft();
    var pl = c.windowLeft,
        pt = c.windowTop,
        ns = c.scale;

    // check if new scale changed, if so, update all node coordinates
    if (ns !== stack.s) {
        self.svgOverlay.updateNodeCoordinates(ns);
    }

    self.svgOverlay.view.style.left = Math.floor(-pl / stack.resolution.x * stack.s) + "px";
    self.svgOverlay.view.style.top = Math.floor(-pt / stack.resolution.y * stack.s) + "px";

    self.svgOverlay.updateDimension(stack);

    return;
  }


  /** */
	this.redraw = function()
	{
    // should never update from database - is called frequently
    // on dragging
  };

	this.unregister = function()
	{
	};
  
}
