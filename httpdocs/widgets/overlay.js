// active treenode or connectornode
var atn = null;

var atn_fillcolor = "rgb(0, 255, 0)";
// TODO:
// - join existing nodes together with shift
// - add backend logic
// - delete node from svgoverlay nodes upon delete
// keep atn - works, but what if there are big z jumps. how to handle these?
// add dragging
// delete


function activateNode( node ) {
    // changes the color attributes of the newly activated node
    if ( atn != null ) {
      if(atn instanceof Node) {
        atn.setDefaultColor();
      }
    };
    // if node == null, just deactivate
    if( node == null ) {
      atn = null;
      return;
    }
    atn = node;
    atn.getC().attr({
          fill: atn_fillcolor });
};

Node = function(
  id, // unique id for the node from the database
  paper, // the raphael paper this node is drawn to
  parent, // the parent node
  r, // the radius
  x, // the x coordinate in pixel coordinates
  y, // y coordinates 
  z, // z coordinates
  zdiff) // the different from the current slices
{ 
  self = this;
  self.id = id;
  
  // state variable whether this node is already synchronized with the database
  self.needsync = false;
  
  // local screen coordinates relative to the div
  self.x = x;
  self.y = y;
  self.z = z;
  self.zdiff = zdiff;
  
  this.parent = parent;
  self.r = r;
  if(self.zdiff == 0)
    this.rcatch = r + 8;
  else
    this.rcatch = 0; 
  self.paper = paper;
  
  this.setXY = function(xnew, ynew)
  {
    this.x = xnew;
    this.y = ynew;
    c.attr({cx: this.x,cy: this.y});
    mc.attr({cx: this.x,cy: this.y});
    this.draw();
  }
  
  // local variables, only valid in the scope of a node
  // and not accessible to the outisde
	var ox = 0, oy = 0;
	
	var fillcolor;
	if(zdiff == 0)
	 fillcolor = "rgb(255, 255, 0)";
  else if(zdiff == 1)
   fillcolor = "rgb(0, 0, 255)";
  else if(zdiff == -1)
   fillcolor = "rgb(255, 0, 0)";
  
  this.setDefaultColor = function()
  {
      c.attr({fill: fillcolor});
  }
  
          
  // the accessor method
  this.getC = function(){ return c; }
  var c, mc;
  

  this.recreateNodeCircles = function(myfill) {
    
      // create a raphael circle object
        c = this.paper.circle( this.x, this.y, this.r ).attr({
              fill: myfill,
              stroke: "none",
              opacity: 1.0
              });
    
        
      // a raphael circle oversized for the mouse logic
        mc = this.paper.circle( this.x, this.y, this.rcatch).attr({
              fill: "rgb(0, 1, 0)",
              stroke: "none",
              opacity: 0
              });     
  }
  this.recreateNodeCircles(fillcolor);
  			
	// add a reference to the parent container node in the
	// raphael object in order to get the drag event handler
	// doing something
	mc.parentnode = this;
	
	// an array storing the children objects of the node
	this.children = new Object();
	
	// delete all objects relevant to this node
	// such as raphael DOM elements and node references
	// javascript's garbage collection should do the rest
	this.deleteall = function()
	{
	  // test if there is any child of type ConnectorNode
	  // if so, it is not allowed to remove the treenode
    /*for ( var i = 0; i < children.length; ++i ) {
      if( children[i] instanceof ConnectorNode ) {
        console.log("not allowed to delete treenode with connector attached. first remove connector.")
        return;
      }
    }
    */
    // remove the parent of all the children
    for ( var i = 0; i < this.children.length; ++i ) {
      this.children[ i ].line.remove();
      this.children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
	  c.remove();
	  mc.remove();
	  if(self.parent != null) {
	    line.remove();
	    // remove this node from parent's children list
	    for ( var i in self.parent.children) {
	      if(self.parent.children[i].id == id)
	       delete self.parent.children[i];
	    }
	  }
	}
	// make this function accessible
	
  // remove the parent node
  this.removeParent = function()
  { 
    delete self.parent;
    self.parent = null;
  }
  this.updateParent = function(par)
  {
    // par must be a Node object
    self.parent = par;
    // update reference to oneself
    self.parent.children[id] = self;
  }
  
  // the line that is drawn to its parent
	var line = this.paper.path();
  //self.line = line;
  // from the function invocation
	if ( parent != null ) {
	  // if parent exists, update it
	  this.updateParent(parent);
	}
	
	// updates the raphael path coordinates
	this.drawLine = function()
	{  
	  if(this.parent != null) {
	    var strokecolor; 
	    if(this.parent.zdiff < 0)
	       strokecolor = "rgb(255, 0, 0)";
	    else if (this.parent.zdiff > 0)
	       strokecolor = "rgb(0, 0, 255)";
	    else
         strokecolor = "rgb(255, 255, 0)";
         
      line.attr( {path: [ [ "M", c.attrs.cx, c.attrs.cy ], 
                          [ "L", this.parent.getC().attrs.cx, this.parent.getC().attrs.cy ] ],
                  stroke: strokecolor} );
      //line.toBack();
    }
	}
  
  // draw function to update the paths from the children
  // and to its parent	
	this.draw = function() {
	  // draws/updates path to parent and children
    for ( var i in this.children ) {
      if(this.children[i].parent != null) {
        //console.log("XXXX:parent should not be null", children[i].parent);
        this.children[ i ].drawLine();
      }
    }
    if ( this.parent != null )
      this.drawLine();
	}
	mc.dblclick(function (e) {
	  console.log("node dblclick");
	});
	mc.click(function (e) {
	  // return some log information when clicked on the node
	  // this usually refers here to the mc object
	  
	  console.log("----------")
	  console.log("correct id", this.parentnode.id);
	  console.log("activated node", this.parentnode);
	  console.log("handler object", this);
	  console.log("its children", this.parentnode.children);
	  console.log("its coords", this.parentnode.x, this.parentnode.y, this.parentnode.z);
	   
	  if(e.ctrlKey && e.shiftKey ){
      console.log("should invoke delete node of this", this);
      //deleteall();
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
	  this.parentnode.x = ox + dx;
    this.parentnode.y = oy + dy;
    c.attr({cx: this.parentnode.x,cy: this.parentnode.y});
    mc.attr({cx: this.parentnode.x,cy: this.parentnode.y});
    this.parentnode.draw();
	}
	mc.up = function()
	{
		c.attr({opacity:1});
		this.parentnode.needsync = true;
	}
	mc.start = function()
	{
	  //console.log("in mc start, this:", this);
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
  var nodes = new Object();
  
  var createNode = function( parentid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z )
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
              if(parid == -1) {
                var nn = new Node( jso.treenode_id, r, null, radius, pos_x, pos_y, pos_z, 0);
              } else {
                var nn = new Node( jso.treenode_id, r, nodes[parid], radius, pos_x, pos_y, pos_z, 0);
              }
  
              nodes[jso.treenode_id] = nn;
              nn.draw();
              activateNode( nn );
              
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
              console.log("Coordinates updated for treenode ", id, " to ", phys_x, phys_y, phys_z);
            }
          }
        }
        return true;
      });
    return;
  }
  
  this.updateNodeCoordinatesinDB = function()
  {
    console.log("synchronising with database");
    for (var i in nodes)
    {
      if(nodes[i].needsync)
      {
        // get physical
        var phys_x = pix2physX(nodes[i].x);
        var phys_y = pix2physY(nodes[i].y);
        var phys_z = pix2physZ(nodes[i].z);
        console.log("Update required for treenode",nodes[i].id, " with ", phys_x,phys_y,phys_z);
        nodes[i].needsync = false;
        updateNodePosition(nodes[i].id,phys_x,phys_y,phys_z)
      }
    }
  }

  var updateNodeCoordinates = function(newscale)
  {
    console.log("in updatenodecoordinates for new scale function");
    // depending on the scale, update all the node coordinates
    // loop over all nodes
    for ( var i = 0; i < nodes.length; ++i )
    {
      var x = nodes[i].x;
      var y = nodes[i].y;
      var fact = newscale / s;
      xnew = Math.floor(x * fact);
      ynew = Math.floor(y * fact);
      // use call to get the function working on this
      this.setXY.call(nodes[i], xnew, ynew);
      // nodes[i].setXY(xnew, ynew); 
    }
  }
  
  this.refreshNodes = function( jso )
  {
    this.paper.clear();
    nodes = new Object();
    
    for (var i in jso) {
        var id = parseInt(jso[i].tlnid);
        var pos_x = phys2pixX(jso[i].x);
        var pos_y = phys2pixY(jso[i].y);
        var pos_z = phys2pixZ(jso[i].z);
        var zdiff = Math.floor(parseFloat(jso[i].z_diff) / resolution.z);
        //console.log("zdiff", zdiff);
        if(zdiff == 0)
          var rad = parseFloat(jso[i].radius);
        else
          var rad = 0;
        var nn = new Node( id, this.paper, null, rad, pos_x, pos_y, pos_z, zdiff);    
        nodes[id] = nn;
    }
    // loop again and add correct parent objects and parent's children update
    for (var i in jso)
    {
       var parid = parseInt(jso[i].parentid);
       var nid = parseInt(jso[i].tlnid);
       if(nodes[parid]) {
         // if parent is existing, update the references
         nodes[nid].parent = nodes[parid];
         // update the parents children
         nodes[nid].parent.children[nid] = nodes[nid];
       } else {
         //console.log("no parent (rootnode?)", nodes[nid]);
       }
      // draw nodes    
      for (var i in nodes) {
        nodes[i].draw();
      }      
    }

    if(atn != null) {
      // draw active node in any case
      // but without event handling
      atn.recreateNodeCircles(atn_fillcolor);
    }
    //console.log("all nodes", nodes);
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
    //updateNodeCoordinatesinDB();
  };
	
  this.getView = function()
  {
    return view;
  }
  
  this.onclick = function( e )
  {   
    //console.log("mouse down event in overlay", e);
    //console.log("current coordinates in physical space:");
    //console.log(project.coordinates.z, "pix", phys2pixZ(project.coordinates.z));
    
    var m = ui.getMouse( e );
    
    // take into account current local offset coordinates and scale
    var pos_x = m.offsetX;
    var pos_y = m.offsetY;
    var pos_z = phys2pixZ(project.coordinates.z);
    
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
      createNode(atn, phys_x, phys_y, phys_z, 4, 5, pos_x, pos_y, pos_z);
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
  this.paper = r;
  
  this.hide = function() 
  {
    view.style.display = "none";
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
  
  this.show = function() 
  {
    view.style.display = "block";
  }

  try
  {
    view.addEventListener( "DOMMouseScroll", this.onmousewheel, false );
    /* Webkit takes the event but does not understand it ... */
    view.addEventListener( "mousewheel", this.onmousewheel, false );
  }
  catch ( error )
  {
    try
    {
      view.onmousewheel = this.onmousewheel;
    }
    catch ( error ) {}
  }
  
  
};