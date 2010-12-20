
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
      this.removeLine();
      // remove this node from parent's children list
      for ( var i in self.parent.children) {
        if(self.parent.children[i].id == id)
         delete self.parent.children[i];
      }
    }
  }
  // make this function accessible
  this.deletenode = function()
  {
    
    requestQueue.register(
      "model/treenode.delete.php",
      "POST",
      {
        pid : project.id,
        tnid : this.id
      },
      function(status, text, xml)
      {
        if ( status != 200 )
        {
          console.log("an error occured while deleting the treenodes", text);
        }
        return true;
      });
        
    // remove the parent of all the children
    for ( var i in this.children) {
      console.log("we have children", this.children[i]);
      this.children[ i ].removeLine();
      this.children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
    c.remove();
    mc.remove();
    line.remove();
    
    if(this.parent != null) {
      // remove this node from parent's children list
      for ( var i in this.parent.children) {
        if(this.parent.children[i].id == id)
         delete this.parent.children[i];
      }
    }
  }
  
  this.removeLine = function()
  {
    line.remove();
  }
  // remove the parent node
  this.removeParent = function()
  { 
    delete this.parent;
    this.parent = null;
  }
  
  this.updateParent = function(par)
  {
    // par must be a Node object
    this.parent = par;
    // update reference to oneself
    this.parent.children[id] = this;
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
    
    console.log("----------");
    console.log("correct id", this.parentnode.id);
    console.log("activated node", this.parentnode);
    console.log("handler object", this);
    console.log("its children", this.parentnode.children);
    console.log("its coords", this.parentnode.x, this.parentnode.y, this.parentnode.z);
    console.log("-----------");
    
    if(e.ctrlKey && e.shiftKey ){
      console.log("should invoke delete node of this", this);
      this.parentnode.deletenode();
      
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