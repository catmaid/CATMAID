/**
 * stack.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 */

/**
 */

/**
 * Stack is the core data viewer and interaction element.  It displays a list
 * of layers of an x,y-plane in an n-dimensional data set, tracks the
 * navigation/edit mode and organizes access to user interface elements such
 * as navigation sliders and buttons.  x, y dimensions are shown in the plane,
 * for all other dimensions, a slider is used.
 * 
 * Layers can be images, text, SVG or arbitrary other overlays.
 * 
 * A Stack is created with a given pixel resolution, pixel dimension, a
 * translation relative to the project and lists of planes to be excluded
 * (e.g. missing sections in serial section microscopy and missing frames in a
 * time series).  These properties limit the field of view and the slider
 * ranges.  
 */
function Stack(
		project,					//!< {Project} reference to the parent project
		id,							//!< {Integer} the stack's id
		title,						//!< {String} the stack's title
		dimension,					//!< {Array} pixel dimensions [x, y, z, ...]
		resolution,					//!< {Array} physical resolution in units/pixel [x, y, z, ...]
		translation,				//!< @todo replace by an affine transform
		// TODO: Do we need this here? (Tobias)
		// overviewName,				//!< {String} file name of the overview image (e.g. 'overview.jpg')
		skip_planes,				//!< {Array} planes to be excluded from the stack's view [[z,t,...], [z,t,...], ...]
		trakem2_project				//!< {boolean} that states if a TrakEM2 project is available for this stack
)
{
	var n = dimension.length;
	
	/**
	 * update the scale bar (x-resolution) to a proper size
	 */
	var updateScaleBar = function()
	{
		var meter = self.scale / resolution[ 0 ];
		var width = 0;
		var text = "";
		for ( var i = 0; i < Stack.SCALE_BAR_SIZES.length; ++i )
		{
			text = Stack.SCALE_BAR_SIZES[ i ];
			width = Stack.SCALE_BAR_SIZES[ i ] * meter;
			if ( width > Math.min( 192, self.viewWidth / 5 ) )
				break;
		}
		var ui = 0;
		while ( text >= 1000 && ui < Stack.SCALE_BAR_UNITS.length - 1 )
		{
			text /= 1000;
			++ui;
		}
		scaleBar.style.width = width + "px";
		scaleBar.firstChild.firstChild.replaceChild(
			document.createTextNode( text + " " + Stack.SCALE_BAR_UNITS[ ui ] ),
			scaleBar.firstChild.firstChild.firstChild );
		return;
	}
	
	/**
	 * update all state informations and the screen content
	 */
	var update = function( now )
	{
		overview.update( self.z, self.y, self.x, self.s, self.viewHeight, self.viewWidth );
		updateScaleBar();
		
		//statusBar.replaceLast( "[" + ( Math.round( x * 10000 * resolution.x ) / 10000 ) + ", " + ( Math.round( y * 10000 * resolution.y ) / 10000 ) + "]" );
		
		if ( !transition.queued( redraw ) )
		{
			if ( now )
				transition.register( redraw );
			else
				redraw();
		}
		
		return
	}
	
	/**
	 * Get stack coordinates of the current view's top left corner.
	 * These values might be used as an offset to get the stack coordinates of a
	 * mouse event handled by the stack.
	 */
	this.screenPosition = function()
	{
		var width = self.viewWidth / self.scale;
		var height = self.viewHeight / self.scale;
		var l =
		{
			top : Math.floor( self.y - height / 2 ),
			left : Math.floor( self.x - width / 2 )
		};
		return l;
	}
	
	/**
	 * Get the project coordinates of the current view.
	 */
	this.projectCoordinates = function()
	{
		var l =
		{
			z : self.z * resolution.z + translation.z,
			s : self.s,
			scale : self.scale,
			y : self.y * resolution.y + translation.y,
			x : self.x * resolution.x + translation.x
		};
		return l;
	}
	
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	var redraw = function()
	{
		self.yc = Math.floor( self.y * self.scale - ( self.viewHeight / 2 ) );
		self.xc = Math.floor( self.x * self.scale - ( self.viewWidth / 2 ) );

		for ( var key in layers )
			layers[ key ].redraw();
			
		//----------------------------------------------------------------------
		/**
		 * This question is completely useless but without asking it, Firefox on
		 * Linux systems will not redraw the screen properly.  Took me ... to
		 * find this out.
		 */
		var a = view.offsetWidth;
		//----------------------------------------------------------------------
			
		self.old_z = self.z;
		self.old_y = self.y;
		self.old_x = self.x;
		self.old_s = self.s;
		self.old_scale = self.scale;
		self.old_yc = self.yc;
		self.old_xc = self.xc
		
		return 2;
	}
	
	/**
	 * get the view element
	 */
	this.getView = function()
	{
		return view;
	}
	
	/**
	 * move to project-coordinates
	 */
	this.moveTo = function( zp, yp, xp, sp )
	{
		//alert( "moveTo" );
		
		if ( typeof sp == "number" )
		{
			self.s = Math.max( 0, Math.min( self.MAX_S, Math.round( sp ) ) );
			self.scale = 1 / Math.pow( 2, self.s );
		}
		
		self.x = Math.max( 0, Math.min( MAX_X, Math.round( ( xp - translation.x ) / resolution.x ) ) );
		self.y = Math.max( 0, Math.min( MAX_Y, Math.round( ( yp - translation.y ) / resolution.y ) ) );
		
		var z1;
		var z2;
		z1 = z2 = Math.round( ( zp - translation.z ) / resolution.z );
		while ( skip_planes[ z1 ] && skip_planes[ z2 ] )
		{
			z1 = Math.max( 0, z1 - 1 );
			z2 = Math.min( MAX_Z, z2 + 1 );
		}
		if ( !skip_planes[ z1 ] ) self.z = z1;
		else self.z = z2;
		self.z = Math.max( 0, Math.min( MAX_Z, self.z ) );
		
		update();
		
		return;
	}
	
	/**
	 * move to pixel coordinates
	 */
	this.moveToPixel = function( zp, yp, xp, sp )
	{
		self.s = Math.max( 0, Math.min( self.MAX_S, sp ) );

		self.scale = 1 / Math.pow( 2, self.s );
		
		project.moveTo(
			zp * resolution.z + translation.z,
			yp * resolution.y + translation.y,
			xp * resolution.x + translation.x );
		
		return true;
	}
	
	var resize = function()
	{
		self.viewWidth = stackWindow.getFrame().offsetWidth;
		self.viewHeight = stackWindow.getFrame().offsetHeight;
		
		for ( var key in layers )
			layers[ key ].resize( self.viewWidth, self.viewHeight );
		
		return;
	}
	
	/**
	 * Get the stack window.
	 */
	this.getWindow = function() { return stackWindow; }
	
	/**
	 * Get the project.
	 */
	this.getProject = function(){ return project; }
	
	/**
	 * Get stack ID.
	 */
	this.getId = function(){ return id; }
	
	/**
	 * Get the stack dimension.
	 * 
	 * @return a copy of the private dimension parameter
	 * @todo that's not a copy!
	 */
	this.dimension = function()
	{
		return dimension;
	}
	
	/**
	 * Get the stack resolution.
	 * 
	 * @return a copy of the private resolution parameter
	 * @todo that's not a copy!
	 */
	this.resolution = function()
	{
		return resolution;
	}
	
	/**
	 * Get the stack translation relative to the project.
	 * 
	 * @return a copy of the private translation parameter
	 */
	this.translation = function()
	{
		return {
			x : translation.x,
			y : translation.y,
			z : translation.z
		};
	}
	
	this.addLayer = function( key, layer )
	{
		if ( layers[ key ] )
			layers[ key ].unregister();
		layers[ key ] = layer;
		return;
	}
	
	this.removeLayer = function( key )
	{
		var layer = layers[ key ];
		if ( layer )
			layer.unregister();
		layers[ key ] = null;
		return layer;
	}
	
	
	/**
	 * Register a tool at this stack.  Unregisters the current tool and then
	 * makes the tool working.
	 */
	this.setTool = function( tool )
	{
		if ( self.tool != null )
			self.tool.unregister();
		self.tool = tool;
		tool.register( self );
	}
	
	var tool;
	
	
	
	// initialise
	var self = this;
	if ( !ui ) ui = new UI();
	
	self.id = id;
	
	var layers = {};
	
	
	var MAX_X = dimension.x - 1;   //!< the last possible x-coordinate
	var MAX_Y = dimension.y - 1;   //!< the last possible y-coordinate
	var MAX_Z = dimension.z - 1;   //!< the last possible z-coordinate
	
	//! estimate the zoom levels
	self.MAX_S = 0;
	var min_max = Math.min( MAX_X, MAX_Y );
	var min_size = 256;
	while ( min_max / Math.pow( 2, self.MAX_S ) / min_size > 4 )
		++self.MAX_S;
	
	//! all possible slices
	self.slices = new Array();
	for ( var i = 0; i < dimension.z; ++i )
	{
		if ( !skip_planes[ i ] )
			self.slices.push( i );
	}
	
	//-------------------------------------------------------------------------
	
	var transition = new Transition();
	
	// extract the borders of the viewer window from CSS rules
	var viewTop    = parseInt( getPropertyFromCssRules( 3, 0, "top" ) );
	var viewBottom = parseInt( getPropertyFromCssRules( 3, 0, "bottom" ) );
	var viewLeft   = parseInt( getPropertyFromCssRules( 3, 0, "left" ) );
	var viewRight  = parseInt( getPropertyFromCssRules( 3, 0, "right" ) );
	
	var stackWindow = new CMWWindow( title );
	var view = stackWindow.getFrame();

	var viewWidth = stackWindow.getFrame().offsetWidth;
	var viewHeight = stackWindow.getFrame().offsetHeight;
	
	stackWindow.addListener(
		function( callingWindow, signal )
		{
			//alert( signal );
			switch ( signal )
			{
			case CMWWindow.CLOSE:
				project.removeStack( id );
				break;
			case CMWWindow.RESIZE:
				resize();
				break;
			}
			return true;
		} );
	
	var overview = new Overview( self, MAX_Y, MAX_X );
	view.appendChild( overview.getView() );
	
	var scaleBar = document.createElement( "div" );
	scaleBar.className = "sliceBenchmark";
	scaleBar.appendChild( document.createElement( "p" ) );
	scaleBar.firstChild.appendChild( document.createElement( "span" ) );
	scaleBar.firstChild.firstChild.appendChild( document.createTextNode( "test" ) );
	view.appendChild( scaleBar );
	
	// take care, that all values are within a proper range
	self.z = 1;
	self.y = Math.floor( MAX_Y / 2 );
	self.x = Math.floor( MAX_X / 2 );
	self.s = self.MAX_S;
	
	self.old_z = -1;
	self.old_y = self.y;
	self.old_x = self.x;
	self.old_s = self.s;
	
	self.scale = 1 / Math.pow( 2, self.s );
	self.old_scale = self.scale;
}

//!< in nanometers
Stack.SCALE_BAR_SIZES = new Array(
			10,
			20,
			25,
			50,
			100,
			200,
			250,
			500,
			1000,
			2000,
			2500,
			5000,
			10000,
			20000,
			25000,
			50000,
			100000,
			200000,
			250000,
			500000,
			1000000,
			2000000,
			2500000,
			5000000,
			10000000,
			20000000,
			25000000,
			50000000,
			100000000,
			200000000,
			250000000,
			500000000,
			1000000000,
			2000000000,
			2500000000,
			5000000000,
			10000000000,
			20000000000,
			25000000000,
			50000000000,
			100000000000,
			200000000000,
			250000000000,
			500000000000 );
Stack.SCALE_BAR_UNITS = new Array(
			"nm",
			unescape( "%u03BCm" ),
			"mm",
			"m" );
