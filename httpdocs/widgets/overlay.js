// active treenode or connectornode
var atn = null;
// TODO:
// - join existing nodes together with shift
// - add backend logic
// - delete node from svgoverlay nodes upon delete
var r;

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

Node = function(
  id, // unique id for the node from the database
  paper, // the raphael paper this node is drawn to
  parent, // the parent node
  x, // the x coordinate in pixel coordinates
  y) // the y coordinate in pixel coordiantes
{ 
  self = this;
  self.id = id;
  // state variable whether this node is already synchronized with the database
  var needsync = false;
  
  // local screen coordinates relative to the div
  self.x = x;
  self.y = y;
  self.r = r;
  
  var setSync = function( bo ) { needsync = bo; }
  this.setSync = setSync;
  var getSync = function( ) { return needsync; }
  this.getSync = getSync;
  
  this.getX = function() { return x };
  this.getY = function() { return y };
  
  this.setXY = function(xnew, ynew)
  {
    x = xnew;
    y = ynew;
    c.attr({cx: x,cy: y});
    mc.attr({cx: x,cy: y});
    draw();
  }
  
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
	  /*console.log("activated node", id);
	  console.log("its parent is", parent);
	  console.log("its children", children);
	  console.log("its coords", x, y);
	  */
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
		x = ox + dx;
    y = oy + dy;
		c.attr({cx: x,cy: y});
		mc.attr({cx: x,cy: y});
    draw();
	}
	mc.up = function()
	{
		c.attr({opacity:1});
		setSync(true); 
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
		dimension, // dimension of the stack
		current_scale // current scale of the stack
)
{

  self = this;
  var nodes = Array();
  
  var createNode = function( parentid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y )
  {
    if(!parentid)
      var parid = -1;
    else
      var parid = parentid.id;
      
    requestQueue.register(
      "model/treenode.create.php",
      "POST",
      {
        pid : project.id,
        parent_id : parid,
        x : phys_x,
        y : phys_y,
        z : phys_z,
        radius : radius,
        confidence : confidence
        },
      function(status, text, xml)
      {
        if ( status == 200 )
        {
          if ( text && text != " " )
          {
            var e = eval( "(" + text + ")" );
            if ( e.error )
            {
              alert( e.error );
            }
            else
            {
              // add treenode to the display and update it
              var jso = $.parseJSON(text);
              var nn = new Node( jso.treenode_id, r, atn, pos_x, pos_y); 
              nodes.push(nn);
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
        }
        return true;
  });
    return;
  }

  
  var updateNodePosition = function( id, phys_x, phys_y, phys_z )
  {
    requestQueue.register(
      "model/treenode.update.php",
      "POST",
      {
        pid : project.id,
        tnid : id,
        x : phys_x,
        y : phys_y,
        z : phys_z
        },
      function( status, text, xml )
      {
        if ( status == 200 )
        {
          if ( text && text != " " )
          {
            var e = eval( "(" + text + ")" );
            if ( e.error )
            {
              alert( e.error );
            }
            else
            {
              console.log("updated phys coordinates");
            }
          }
        }
        return true;
      });
    return;
  }

  var updateNodeCoordinatesinDB = function()
  {
    for ( var i = 0; i < nodes.length; ++i )
    {
      if(nodes[i].getSync())
      {
        // get physical
        var phys_x = pix2physX(nodes[i].x);
        var phys_y = pix2physY(nodes[i].y);
        var phys_z = project.coordinates.z;
        console.log("update required for ",nodes[i].id,phys_x,phys_y,phys_z);
        nodes[i].setSync(false);
        updateNodePosition(nodes[i].id,phys_x,phys_y,phys_z)
      }
    }
  }

  var updateNodeCoordinates = function(newscale)
  {
    // depending on the scale, update all the node coordinates
    // loop over all nodes
    for ( var i = 0; i < nodes.length; ++i )
    {
      var x = nodes[i].getX();
      var y = nodes[i].getY();
      var fact = newscale / s;
      xnew = Math.floor(x * fact);
      ynew = Math.floor(y * fact);
      nodes[i].setXY(xnew, ynew); 
    }
  }
  
  var refreshNodes = function( jso )
  {
    // retrieve all the nodes from the database in a given
    // bounding volume, map physical coordinates to screen coordinates
    // given the current scale
    nodes = Array();
    
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

    // check if new scale changed, if so, update all node coordinates
    if(ns!=s)
    {
      updateNodeCoordinates(ns);
    }
    // update the scale of the internal scale variable    
    s = ns;
    // pl/pt are in physical coordinates
    view.style.left = Math.floor(-pl/resolution.x*s) + "px";
    view.style.top = Math.floor(-pt/resolution.y*s) + "px";
    updateDimension(s);
    updateNodeCoordinatesinDB();
  };
	
  this.getView = function()
  {
    return view;
  }
  
  this.onclick = function( e )
  {   
    //console.log("mouse down event in overlay", e);
    //console.log("current coordinates in physical space:");
    //console.log(project.coordinates.z);
    
    var m = ui.getMouse( e );
    
    // take into account current local offset coordinates and scale
    var pos_x = m.offsetX;
    var pos_y = m.offsetY;
    
    // XXX: get physical coordinates for database
    var phys_x = pix2physX(pos_x);
    var phys_y = pix2physY(pos_y);
    var phys_z = project.coordinates.z;
    console.log("physical coordinates", phys_x, phys_y, phys_z);
    
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
      var sn = new ConnectorNode( randomid, r, atn, pos_x, pos_y);
      sn.parent.getChildren().push( sn );
      nodes.push(sn);
      sn.draw();
      activateNode( sn );
      
    } else {
      // create a new treenode,
      // either root node if atn is null, or has parent 
      createNode(atn, phys_x, phys_y, phys_z, 3, 5, pos_x, pos_y);
      // display node creation is done in event handler
    }
  }


  self.resolution = resolution;
  self.translation = translation;
  self.dimension = dimension;
  
  var view = document.createElement( "div" );
  view.className = "sliceSVGOverlay";
  view.onclick = self.onclick;
  view.style.zIndex = 5;
  view.style.cursor = "crosshair";
  
  var s = current_scale;
  var r = Raphael(view, Math.floor(dimension.x*s), Math.floor(dimension.y*s));
  self.r = r;

  if ( !ui ) ui = new UI();

  this.hide = function() 
  {
    view.style.display = "none";
    /*
    try
    {
      view.removeEventListener( "DOMMouseScroll", onmousewheel, false );
    }
    catch ( error )
    {
      try
      {
        view.onmousewheel = null;
      }
      catch ( error ) {}
    }
      */
  }


  this.onmousewheel = function( e )
  {
    var w = ui.getMouseWheel( e );
    if ( w )
    {
      if ( w > 0 )
      {
        slider_z.move( -1 );
      }
      else
      {
        slider_z.move( 1 );
      }
    }
    return false;
  }

  var pix2physX = function( x )
  { return translation.x + ( ( x ) / s ) * resolution.x; }
  self.pix2physX = pix2physX;
  
  var phys2pixX = function( x )
  { return  ( x - translation.x ) / resolution.x * s; }
  self.phys2pixX = phys2pixX;
  
  var pix2physY = function( y )
  { return translation.y + ( ( y ) / s ) * resolution.y; }
  self.pix2physY = pix2physY;
  
  var phys2pixY = function( y )
  { return  ( y - translation.y ) / resolution.y * s; }
  self.phys2pixY = phys2pixY;
  
  var pix2physZ = function( z )
  { return z * resolution.z + translation.z; }
  self.pix2physZ = pix2physZ;
  
  var phys2pixZ = function( z )
  { return (z - translation.z) / resolution.z; }
  self.phys2pixZ = phys2pixZ;
  
  var getPhysCoordinatesOfCursor = function( e )
  {
      var m = ui.getMouse( e );
      // compute absolute coordinates
      var pos_x = phys2pixX(m.offsetX);
      var pos_y = phys2pixY(m.offsetY);
      var pos_z = phys2pixZ(slider_z.val);
      console.log('pos',pos_x, pos_y, pos_z);
      // XXX write it to the database
  }

  this.show = function() 
  {
    view.style.display = "block";
  }

  try
  {
    view.addEventListener( "DOMMouseScroll", self.onmousewheel, false );
    /* Webkit takes the event but does not understand it ... */
    view.addEventListener( "mousewheel", self.onmousewheel, false );
  }
  catch ( error )
  {
    try
    {
      view.onmousewheel = self.onmousewheel;
    }
    catch ( error ) {}
  }
  
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
  
};