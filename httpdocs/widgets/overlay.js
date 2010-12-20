// active treenode or connectornode
var atn = null;
var atn_fillcolor = "rgb(0, 255, 0)";

// TODO:
// - join existing nodes together with shift
// - problem of tracing perpendicular processes (active node is in the way)

// node dblclick and zoom


function activateNode( node ) {
//  console.trace();
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
              // console.log("Coordinates updated for treenode ", id, " to ", phys_x, phys_y, phys_z);
            }
          }
        }
        return true;
      });
    return;
  }
  
  this.updateNodeCoordinatesinDB = function()
  {
    // console.log("synchronising with database");
    for (var i in nodes)
    {
      if(nodes[i].needsync)
      {
        // get physical
        var phys_x = pix2physX(nodes[i].x);
        var phys_y = pix2physY(nodes[i].y);
        var phys_z = pix2physZ(nodes[i].z);
        // console.log("Update required for treenode",nodes[i].id, " with ", phys_x,phys_y,phys_z);
        nodes[i].needsync = false;
        updateNodePosition(nodes[i].id,phys_x,phys_y,phys_z)
      }
    }
  }

  var updateNodeCoordinates = function(newscale)
  {
    // console.log("in updatenodecoordinates for new scale function");
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
    var active_selected = false;
    
    for (var i in jso) {
        var id = parseInt(jso[i].tlnid);
        var pos_x = phys2pixX(jso[i].x);
        var pos_y = phys2pixY(jso[i].y);
        var pos_z = phys2pixZ(jso[i].z);
        var zdiff = Math.floor(parseFloat(jso[i].z_diff) / resolution.z);
        if(zdiff == 0)
          var rad = parseFloat(jso[i].radius);
        else
          var rad = 0;
          
        // if retrieved node matches current active node
        // create the node and set it to active
        if(atn == null)
        {
          // just add the node and make no check for the active node
          var nn = new Node( id, this.paper, null, rad, pos_x, pos_y, pos_z, zdiff);    
          nodes[id] = nn;          
        } else {
          // there is an active node
          if(atn.id == id) {
            // check if the active node matches the id
            // if so, do not recreate but only set it and keep
            // the radius of the active node
            var nn = new Node( id, this.paper, null, atn.r, pos_x, pos_y, pos_z, 0);    
            nodes[id] = nn;
            activateNode(nn);
            active_selected = true;
          } else {
            // the atn does not match but we still need to add the node
            var nn = new Node( id, this.paper, null, rad, pos_x, pos_y, pos_z, zdiff);    
            nodes[id] = nn;            
          }
        }
    }
    // if active node is not retrieved in current slice
    // add it to the nodes list to keep it active
    if(!active_selected && atn != null) {
      // console.log("active must be in another slice far away");
      // recreate active node with no parent an no children
      // XXX: when creating a new node given an active node in a slice
      // far away (not retrieved by the current query), because there are
      // not lines drawn (e.g to parent or children), it can lead to
      // some unintuitive display of the nodes
      var nn = new Node( atn.id, this.paper, null, atn.r, atn.x, atn.y, atn.z, 0);    
      nodes[atn.id] = nn;
      activateNode(nn);          
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
    // console.log("clicked on physical coordinates", phys_x, phys_y, phys_z, "this", this);
    
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


  this.resolution = resolution;
  this.translation = translation;
  this.dimension = dimension;
  
  var view = document.createElement( "div" );
  view.className = "sliceSVGOverlay";
  view.onclick = this.onclick;
  view.style.zIndex = 5;
  view.style.cursor = "crosshair";
  
  var s = current_scale;
  var r = Raphael(view, Math.floor(dimension.x*s), Math.floor(dimension.y*s));
  this.paper = r;

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
  
  var pix2physX = function( x ) { return translation.x + ( ( x ) / s ) * resolution.x; }
  var phys2pixX = function( x )  { return  ( x - translation.x ) / resolution.x * s; }
  var pix2physY = function( y )  { return translation.y + ( ( y ) / s ) * resolution.y; }
  var phys2pixY = function( y )  { return  ( y - translation.y ) / resolution.y * s; }
  var pix2physZ = function( z )  { return z * resolution.z + translation.z; }
  var phys2pixZ = function( z )  { return (z - translation.z) / resolution.z; }
  
  this.show = function()   { view.style.display = "block"; }
  this.hide = function() { view.style.display = "none"; }
  
};