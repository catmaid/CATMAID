console.log("Overlay loading...");


Node = function( paper, parent, x, y, r )
{
	var ox = 0, oy = 0;
	
	var c = paper.circle( x, y, r ).attr({
					fill: "hsb(.8, 1, 1)",
					stroke: "none",
					opacity: .5
					});
	this.getC = function(){ return c; }
	
	var mc = paper.circle( x, y, r + 8 ).attr({
					fill: "rgb(0, 1, 0)",
					stroke: "none",
					opacity: 0
					});
	
	var children = new Array();
	this.getChildren = function(){ return children; }
	
	this.parent = parent;
	var l;
	if ( parent != null )
		l = paper.path();
	
	var drawLine = function()
	{
		l.attr( {path: [ [ "M", c.attrs.cx, c.attrs.cy ], [ "L", parent.getC().attrs.cx, parent.getC().attrs.cy ] ] } );
		l.toBack();
	}
	
	this.drawLine = drawLine;
	
	mc.move = function( dx, dy )
	{
		var x = ox + dx;
    	var y = oy + dy;
		c.attr({cx: x,cy: y});
		mc.attr({cx: x,cy: y});
		for ( var i = 0; i < children.length; ++i )
			children[ i ].drawLine();
		drawLine();
	}
	mc.up = function()
	{
		c.attr({opacity:.5});
	}
	mc.start = function()
	{
		ox = mc.attr("cx");
		oy = mc.attr("cy");
		c.attr({opacity:1});
	}
	mc.drag( mc.move, mc.start, mc.up );
}

SVGOverlay = function(
		resolution,			//!< object {x, y, z} resolution of the parent DOM element in nanometer/pixel
		translation
)
{

  this.createdata = function() 
  {
    // storing original coordinates
    
    var ln = null;
    
    var x = r.width / 2;
    var y = r.height / 2;
    
    for (var i = 0; i < 100; ++i)
    {
      x = Math.min( r.width, Math.max( 0, x + ( .5 - Math.random() ) * 100 ) );
      y = Math.min( r.height, Math.max( 0, y + ( .5 - Math.random() ) * 100 ) );
      ln = new Node( r, ln, x, y, 8 );
    }
    
    while ( ln.parent != null )
    {
      ln.parent.getChildren().push( ln );
      ln.drawLine();
      ln = ln.parent;
    }
  }

	this.update = function(width, height)
	{
	  view.style.width = width + "px";
    view.style.height = height + "px";
		r.setSize(width, height);
	}
	
  this.getView = function()
  {
    return view;
  }
  
	self = this;
	self.resolution = resolution;
	self.translation = translation;
  
  var view = document.createElement( "div" );
  view.className = "sliceSVGOverlay";
  view.style.zIndex = 4;
  
	var r = Raphael(view, 1000, 400);


};