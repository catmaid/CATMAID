// active treenode or connectornode
var atn = null;
// TODO:
// - join existing nodes together with shift
// - add backend logic

function activateNode( node ) {
    // activate new node, i.e. first deactivate old one
    if ( atn != null ) {
      if(atn instanceof Node) {
        atn.getC().attr({
              fill: "rgb(0, 0, 255)" });
      } else if(atn instanceof ConnectorNode) {
        atn.getC().attr({
              fill: "rgb(255, 0, 0)" });
      }
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


ConnectorNode = function(
  id, // unique id for the node from the database
  paper, // the raphael paper this node is drawn to
  parent, // the parent node
  x, // the x coordinate in pixel coordinates
  y) // the y coordinate in pixel coordiantes
{ 
  self = this;
  self.id = id;
  
  // local variables, only valid in the scope of a node
  // and not accessible to the outisde
  var ox = 0, oy = 0, r = 6;
  
  // create a raphael circle object
  var c = paper.circle( x, y, r ).attr({
          fill: "rgb(255, 0, 0  )",
          stroke: "none",
          opacity: 1.0
          });
  // the accessor method
  this.getC = function(){ return c; }
    
  // a raphael circle oversized for the mouse logic
  var mc = paper.circle( x, y, r + 8 ).attr({
          fill: "rgb(0, 1, 0)",
          stroke: "none",
          opacity: 0
          });
          
  // add a reference to the parent container node
  // in order to get active nodes working from inside
  // mc eventhandlers
  mc.parentnode = self;
  
  // an array storing the children objects of the node
  var children = new Array();
  this.getChildren = function(){ return children; }
  // remove the ith element of the array
  this.removeChild = function(i) { children.splice(i,1); }
  
  // delete all objects relevant to this node
  // such as raphael DOM elements and node references
  // javascript's garbage collection should do the rest
  var deleteall = function()
  {
    // remove the parent of all the children
    for ( var i = 0; i < children.length; ++i ) {
      children[ i ].line.remove();
      children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
    c.remove();
    mc.remove();
    if(parent != null) {
      line.remove();
      // remove this node from parent's children list
      var nodeschild = parent.getChildren();
      for ( var i = 0; i < nodeschild.length; ++i ) {
        if(nodeschild[i].id == id)
          parent.removeChild(i);
      }
    }
  }
  
  // make this function accessible
  this.deleteall = deleteall;
  
  this.parent = parent;
  // remove the parent node
  this.removeParent = function()
  { 
    delete parent;
    parent = null;
  }
  
  // the line that is drawn to its parent
  var line;
  if ( parent != null ) {
    line = paper.path();
    self.line = line;
  }
  
  // updates the raphael path coordinates
  var drawLine = function()
  {  
    line.attr( {path: [ [ "M", c.attrs.cx, c.attrs.cy ], [ "L", parent.getC().attrs.cx, parent.getC().attrs.cy ] ] } );
    line.toBack();
  }
  this.drawLine = drawLine;
  
  // draw function to update the paths from the children
  // and to its parent  
  var draw = function() {
    // draws/updates path to parent and children
    for ( var i = 0; i < children.length; ++i )
      children[ i ].drawLine();
    if ( parent != null )
      drawLine();
  }
  // make the function accessible
  this.draw = draw;
  
  mc.click(function (e) {
    // return some log information when clicked on the node
    console.log("activated node", id);
    console.log("its parent is", parent);
    console.log("its children", children);
    
    if(e.ctrlKey && e.shiftKey ){
      deleteall();
    } else if (e.shiftKey) {
      if(atn != null) {
        // connected activated treenode or connectornode
        // to existing treenode or connectornode
        console.log('need to implement join operation');
      }
    }
    else {
      // activate this node
      activateNode( this.parentnode );
      // stop propagation of the event
      e.stopPropagation();      
    }
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


Node = function(
  id, // unique id for the node from the database
  paper, // the raphael paper this node is drawn to
  parent, // the parent node
  x, // the x coordinate in pixel coordinates
  y) // the y coordinate in pixel coordiantes
{ 
  self = this;
  self.id = id;
  
  // local variables, only valid in the scope of a node
  // and not accessible to the outisde
	var ox = 0, oy = 0, r = 4;
	
	// create a raphael circle object
	var c = paper.circle( x, y, r ).attr({
					fill: "rgb(0, 0, 255)",
					stroke: "none",
					opacity: 1.0
					});
	// the accessor method
	this.getC = function(){ return c; }
		
	// a raphael circle oversized for the mouse logic
	var mc = paper.circle( x, y, r + 8 ).attr({
					fill: "rgb(0, 1, 0)",
					stroke: "none",
					opacity: 0
					});
					
	// add a reference to the parent container node
  // in order to get active nodes working from inside
  // mc eventhandlers
	mc.parentnode = self;
	
	// an array storing the children objects of the node
	var children = new Array();
	this.getChildren = function(){ return children; }
	// remove the ith element of the array
	this.removeChild = function(i) { children.splice(i,1); }
	
	// delete all objects relevant to this node
	// such as raphael DOM elements and node references
	// javascript's garbage collection should do the rest
	var deleteall = function()
	{
	  // test if there is any child of type ConnectorNode
	  // if so, it is not allowed to remove the treenode
    for ( var i = 0; i < children.length; ++i ) {
      if( children[i] instanceof ConnectorNode ) {
        console.log("not allowed to delete treenode with connector attached. first remove connector.")
        return;
      }
    }
    
    // remove the parent of all the children
    for ( var i = 0; i < children.length; ++i ) {
      children[ i ].line.remove();
      children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
	  c.remove();
	  mc.remove();
	  if(parent != null) {
	    line.remove();
	    // remove this node from parent's children list
	    var nodeschild = parent.getChildren();
      for ( var i = 0; i < nodeschild.length; ++i ) {
        if(nodeschild[i].id == id)
          parent.removeChild(i);
      }
	  }
	}
	// make this function accessible
	this.deleteall = deleteall;
	
	this.parent = parent;
  // remove the parent node
  this.removeParent = function()
  { 
    delete parent;
    parent = null;
  }
  
  // the line that is drawn to its parent
	var line;
	if ( parent != null ) {
	  line = paper.path();
	  self.line = line;
	}
	
	// updates the raphael path coordinates
	var drawLine = function()
	{  
    line.attr( {path: [ [ "M", c.attrs.cx, c.attrs.cy ], [ "L", parent.getC().attrs.cx, parent.getC().attrs.cy ] ] } );
    line.toBack();
	}
  this.drawLine = drawLine;
  
  // draw function to update the paths from the children
  // and to its parent	
	var draw = function() {
	  // draws/updates path to parent and children
    for ( var i = 0; i < children.length; ++i )
      children[ i ].drawLine();
    if ( parent != null )
      drawLine();
	}
	// make the function accessible
	this.draw = draw;
	
	mc.click(function (e) {
	  // return some log information when clicked on the node
	  console.log("activated node", id);
	  console.log("its parent is", parent);
	  console.log("its children", children);
	  
	  if(e.ctrlKey && e.shiftKey ){
      deleteall();
	  } else if (e.shiftKey) {
      if(atn != null) {
        // connected activated treenode or connectornode
        // to existing treenode or connectornode
        console.log('need to implement join operation');
      }
	  }
	  else {
      // activate this node
      activateNode( this.parentnode );
      // stop propagation of the event
      e.stopPropagation();	    
	  }
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
		translation,
		dimension // dimension of the stack
)
{

  // creating some test data
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
      ln.draw();
      ln = ln.parent;
    }
  }

  var updateDimension = function()
  {
    wi = Math.floor(dimension.x*s);
    he = Math.floor(dimension.y*s);
    // update width/height with the dimension from the database, which is in pixel unit
    view.style.width =  wi + "px";
    view.style.height = he + "px";
    // update the raphael canvas as well
    r.setSize(wi, he);
  }
  

  this.redraw = function(
      pl,           //!< float left-most coordinate of the parent DOM element in nanometer
      pt,           //!< float top-most coordinate of the parent DOM element in nanometer
      ns              //!< scale factor to be applied to resolution [and fontsize],
  )
  {
    // update the scale of the internal scale variable
    s = ns;
    // pl/pt are in physical coordinates
    view.style.left = Math.floor(-pl/resolution.x*s) + "px";
    view.style.top = Math.floor(-pt/resolution.y*s) + "px";
    updateDimension(s);
  };
	
  this.getView = function()
  {
    return view;
  }
  
  this.onclick = function( e )
  {   
    console.log("mouse down event in overlay", e);
    console.log("current coordinates in physical space:");
    console.log(project.coordinates.z);
    
    var m = ui.getMouse( e );
    // it is relative to mouse catcher right now
    console.log("offx", m.offsetX, "offy", m.offsetY, "x", m.x, "y", m.y);
    
    // if ctrl is pressed and clicked, deselect atn
    if( e.ctrlKey ) {
      activateNode( null );
    } else if( e.shiftKey ) {
      if(atn == null || atn instanceof ConnectorNode) {
        console.log("can not add a connector without an active treenode");
        return;
      }
      // XXX: create a random id for now
      randomid = Math.floor( Math.random() * 1000);
      // emulating synapse creation mode!
      var sn = new ConnectorNode( randomid, r, atn, m.offsetX, m.offsetY);
      sn.parent.getChildren().push( sn );
      sn.draw();
      activateNode( sn );
      
    } else {
      // XXX: create a random id for now
      randomid = Math.floor( Math.random() * 1000);
      var nn = new Node( randomid, r, atn, m.offsetX, m.offsetY); 
      nn.draw();

      // if the parent (i.e. active node is not null) we need to
      // add the newly created treenode as a child
      if(atn != null) {
        // check the selected node type
        if(atn instanceof Node) {
          activateNode( nn );
          if(nn.parent!=null)
            nn.parent.getChildren().push( nn );
        } else if(atn instanceof ConnectorNode) {
          // if it is a connector, do not change selection, but just add children
          if(nn.parent!=null)
            nn.parent.getChildren().push( nn );
        }
        
      } else {
        // by default, select the newly added node without children
          activateNode( nn );
      }
        
    }
  }
  
	self = this;
  //if ( !ui ) ui = new UI();
  //if ( !requestQueue ) requestQueue = new RequestQueue();
  
	self.resolution = resolution;
	self.translation = translation;
	self.dimension = dimension;
  
  var view = document.createElement( "div" );
  view.className = "sliceSVGOverlay";
  //view.onclick = onclick;
  //view.onmousedown = tracemousedown;
  view.style.zIndex = 4;
  
  var s = 1.0;
  //$('#sliceSVGOverlay').hide();
	var r = Raphael(view, Math.floor(dimension.x*s), Math.floor(dimension.y*s));
  self.r = r;
  //$('#sliceSVGOverlay').show();

  //self.r.canvas.style.position = "absolute";
  //self.r.canvas.style.zIndex = "4"; 
  //self.r.canvas.style.background =  "#00FFFF";
  //view.style.background =  "#FF00FF";
  // do i need them?
  var screen =
  {
    x : 0,
    y : 0,
    width : 0,
    height : 0,
    s : 0,
    scale : 1
  };          //!< screen coordinates
  
/*
  this.onmousedown = function( e )
  {
    console.log("mouse down event in overlay", e);
    return;
  }

  var tracemousemove = function( e )
  {
    console.log("trace mouse move");
    return false;
  }
  
  var tracemousedown = function( e )
  {
    console.log("trace mouse down");
    
    ui.registerEvent( "onmousemove", tracemousemove );
    ui.registerEvent( "onmouseup", tracemouseup );
    ui.catchEvents( "trace" );
    ui.onmousedown( e );
    
    //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
    document.body.firstChild.focus();
    
    return false;
  }
  
  var tracemouseup = function( e )
  {
    console.log("trace mouse up");
    ui.releaseEvents()
    ui.removeEvent( "onmousemove", tracemousemove );
    ui.removeEvent( "onmouseup", tracemouseup );
    return false;
  }*/

};