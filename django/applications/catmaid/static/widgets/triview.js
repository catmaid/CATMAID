/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var TriviewWidget = new function()
{

  var self = this;
  var stack = null;

 this.init = function(parentStack)
  {
  		stack = parentStack;

  		//wrapper around stack object to change the view from navigator to triviewXZ and triviewYZ
  		function stackMyViewCons(myView) {
  			this.getView = function(){
  				return myView;
  			};
  		};
  		stackMyViewCons.prototype = stack;
  		stackViewXZ = new stackMyViewCons( document.getElementById("triviewXZ") );
  		stackViewYZ = new stackMyViewCons( document.getElementById("triviewYZ") );

  		var parentTileLayer = stack.getLayer("TileLayer");
  		var tilesourceXZ = getTileSource( stack.tile_source_type, 
  											parentTileLayer.tileSource.getBaseURL(),
  											parentTileLayer.tileSource.getFileExtension() );
		self.tilelayerXZ = new TileLayer(
					stackViewXZ,
					parentTileLayer.getTileWidth(),
					parentTileLayer.getTileHeight(),
					tilesourceXZ);
		var tilesourceYZ = getTileSource( stack.tile_source_type, 
											parentTileLayer.tileSource.getBaseURL(),
											parentTileLayer.tileSource.getFileExtension() );
		self.tilelayerYZ = new TileLayer(
					stackViewYZ,
					parentTileLayer.getTileWidth(),
					parentTileLayer.getTileHeight(),
					tilesourceYZ);
  }


  //use this function when calling it after a clicking event. It can detect the correct coordinates automatically
  this.updateTriviewFromTracingNode = function(e, overlayParent)
  {
   //get coordinates from mouse click   
      var m = ui.getMouse(e, overlayParent.getView());

      // take into account current local offset coordinates and scale
      var pos_x = m.offsetX;
      var pos_y = m.offsetY;
      var pos_z = phys2pixZ(project.coordinates.z);

      self.updateTriviewFromXYZ(pos_x, pos_y, pos_z);
  }  

  this.updateTriviewFromXYZ = function(pos_x, pos_y, pos_z)
  {
	    //compensate for scale in X and Y
      var pos_s = project.getStackFirst().s;
      var mag = Math.pow(2,pos_s);
      pos_x *= mag;
      pos_y *= mag;

      /*
      // get physical coordinates for node position creation
      var phys_x = pix2physX(pos_x);
      var phys_y = pix2physY(pos_y);
      var phys_z = project.coordinates.z;

      var phys_t = project.coordinates.t;
      var phys_c = project.coordinates.c;
  		
  	  console.log("We are updating the triview at coordinates", pos_x, pos_y, pos_z, phys_t, phys_c);
  	  */

  	  self.tilelayerXZ.resizeNoRedraw(stackViewXZ.getView().offsetWidth, stackViewXZ.getView().offsetHeight);
  	  self.tilelayerXZ.drawTriview(pos_x, pos_y, pos_z,1);
  	  self.tilelayerYZ.resizeNoRedraw(stackViewYZ.getView().offsetWidth, stackViewYZ.getView().offsetHeight);
  	  self.tilelayerYZ.drawTriview(pos_x, pos_y, pos_z,2);
  }



  //copied from overlay.js
  var phys2pixX = function (x) {
      return (x - stack.translation.x) / stack.resolution.x * stack.scale;
    };
    
    var phys2pixY = function (y) {
      return (y - stack.translation.y) / stack.resolution.y * stack.scale;
    };
    
    var phys2pixZ = function (z) {
      return (z - stack.translation.z) / stack.resolution.z;
    };
    

    var pix2physX = function (x) {
      return stack.translation.x + ((x) / stack.scale) * stack.resolution.x;
    };
    var pix2physY = function (y) {
      return stack.translation.y + ((y) / stack.scale) * stack.resolution.y;
    };
    this.pix2physX = function (x) {
      return stack.translation.x + ((x) / stack.scale) * stack.resolution.x;
    };
    this.pix2physY = function (y) {
      return stack.translation.y + ((y) / stack.scale) * stack.resolution.y;
    };
    this.pix2physZ = function (z) {
      return z *stack.resolution.z + stack.translation.z;
    };
};
