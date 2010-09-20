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
		svgView,
		resolution,			//!< object {x, y, z} resolution of the parent DOM element in nanometer/pixel
		translation
)
{
		
	console.log("svg overlay...");
	console.log("resolution", resolution);
	console.log("translation", translation);
	
	this.updatePaper = function(
			left, top, viewWidth, viewHeight
			)
	{
		// you need not to update the tracingContainer's style
		/*
		tracingContainer.style.left = left + "px";
		tracingContainer.style.top = top + "px";
		tracingContainer.style.width = viewWidth + "px";
		tracingContainer.style.height = viewHeight + "px";
		*/
		
		// update paper size
		r.setSize(viewWidth, viewHeight);
		
	}
	
	self = this;
	self.resolution = resolution;
	self.translation = translation;
	self.svgView = svgView;
	
	var r = Raphael(self.svgView, 1000, 200);
	console.log("raph", r);
	
	// storing original coordinates
	
	var ln = null;
	
	var x = r.width / 2;
	var y = r.height / 2;
	
	for (var i = 0; i < 100; ++i)
	{
		x = Math.min( r.width, Math.max( 0, x + ( .5 - Math.random() ) * 100 ) );
		y = Math.min( r.height, Math.max( 0, y + ( .5 - Math.random() ) * 100 ) );
		ln = new Node( r, ln, x, y, 2 );
	}
	
	while ( ln.parent != null )
	{
		ln.parent.getChildren().push( ln );
		ln.drawLine();
		ln = ln.parent;
	}

};