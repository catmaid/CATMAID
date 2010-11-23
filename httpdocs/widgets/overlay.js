// active treenode
var atn = null;

function activateNode( node ) {
    // activate new node, i.e. first deactivate old one
    if ( atn != null ) {
      atn.getC().attr({
            fill: "rgb(0, 0, 255)" });
    };
    // if node == null, just deactivate
    if( node == null ) {
      atn = null;
      return;
    }
    atn = node;
    atn.getC().attr({
          fill: "rgb(0, 255, 0)" });
};

Node = function( id, paper, parent, x, y, r )
{ 
  self = this;
  self.id = id;
  
	var ox = 0, oy = 0;
	
	var c = paper.circle( x, y, r ).attr({
					fill: "rgb(0, 0, 255)",
					stroke: "none",
					opacity: 1
					});
	this.getC = function(){ return c; }
	
	var mc = paper.circle( x, y, r + 8 ).attr({
					fill: "rgb(0, 1, 0)",
					stroke: "none",
					opacity: 0
					});
	// add a reference to the parent container node
  // in order to get active treenode working
	mc.parentnode = self;
	
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
	
	var draw = function() {

	  // draws/updates path to parent and children
    for ( var i = 0; i < children.length; ++i )
      children[ i ].drawLine();
    if ( parent != null )
      drawLine();
	}
	this.draw = draw;
	
	mc.click(function (e) {
	  // activate this node
	  activateNode( this.parentnode );
	  // stop propagation of the event
	  e.stopPropagation();
  });

	mc.move = function( dx, dy )
	{
		var x = ox + dx;
    	var y = oy + dy;
		c.attr({cx: x,cy: y});
		mc.attr({cx: x,cy: y});
    draw();
	}
	mc.up = function()
	{
		c.attr({opacity:1});
	}
	mc.start = function()
	{
	  // as soon you do something with the node, activate it
	  activateNode( this.parentnode );
		
		ox = mc.attr("cx");
		oy = mc.attr("cy");
		c.attr({opacity:0.7});
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
    
    for (var i = 0; i < 10; ++i)
    {
      x = Math.min( r.width, Math.max( 0, x + ( .5 - Math.random() ) * 100 ) );
      y = Math.min( r.height, Math.max( 0, y + ( .5 - Math.random() ) * 100 ) );      
      ln = new Node( i, r, ln, x, y, 4 );
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
  
  var onclick = function( e )
  {    
    var m = ui.getMouse( e );
    // if ctrl is pressed and clicked, deselect atn
    if( e.ctrlKey ) {
      activateNode( null );
    } else {
      var nn = new Node( 100, r, atn, m.offsetX, m.offsetY, 4 ); 
      nn.draw(); 
      activateNode( nn );
      // if the parent (i.e. active node is not null) we need to
      // add the newly created treenode as a child
      if(atn != null) {
        if(nn.parent!=null)
          nn.parent.getChildren().push( nn );
      }
        
    }           
    //return true;
  }
  
	self = this;
	self.resolution = resolution;
	self.translation = translation;
  
  var view = document.createElement( "div" );
  view.className = "sliceSVGOverlay";
  view.onclick = onclick;
  view.style.zIndex = 7;
  
	var r = Raphael(view, 1000, 400);
  self.r = r;

};