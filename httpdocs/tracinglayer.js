/**
 * The tracing layer that hosts the tracing data
 */
function TracingLayer( stack )
{

  var self = this;
  
	//! create the svg overlay
  var view = document.createElement("div");
  view.className = "sliceSVGOverlay";
  view.id = "sliceSVGOverlayId";
  view.style.zIndex = 6;
  // Custom cursor for tracing
  view.style.cursor ="url(widgets/themes/kde/svg-circle.cur) 15 15, crosshair";

  this.paper = Raphael(view, Math.floor(stack.dimension.x * stack.s), Math.floor(stack.dimension.y * stack.s));

  var updateDimension = function () {
    var wi = Math.floor(stack.dimension.x * stack.s);
    var he = Math.floor(stack.dimension.y * stack.s);
    // update width/height with the dimension from the database, which is in pixel unit
    view.style.width = wi + "px";
    view.style.height = he + "px";
    // update the raphael canvas as well
    self.paper.setSize(wi, he);
  };

  var updateNodeCoordinates = function (newscale) {
    var i, x, y, fact, xnew, ynew;
    // depending on the scale, update all the node coordinates
    for (i = 0; i < nodes.length; ++i) {
      x = nodes[i].x;
      y = nodes[i].y;
      fact = newscale / stack.s;
      xnew = Math.floor(x * fact);
      ynew = Math.floor(y * fact);
      // use call to get the function working on this
      this.setXY.call(nodes[i], xnew, ynew);
    }
  };

  this.resize = function ( width, height )
  {

  //    pl, //!< float left-most coordinate of the parent DOM element in nanometer
  //pt, //!< float top-most coordinate of the parent DOM element in nanometer
  //ns //!< scale factor to be applied to resolution [and fontsize]

    var c = stack.getWorldTopLeft();
    var pl = c.windowLeft, pt = c.windowTop, ns = c.scale;

    // check if new scale changed, if so, update all node coordinates
    if (ns !== stack.s) {
     // updateNodeCoordinates(ns);
    }

    view.style.left = Math.floor(-pl / stack.resolution.x * stack.s) + "px";
    view.style.top = Math.floor(-pt / stack.resolution.y * stack.s) + "px";

    updateDimension(stack.s);

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
