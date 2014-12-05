/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
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

/** orientations */
Stack.ORIENTATION_XY = 0;
Stack.ORIENTATION_XZ = 1;
Stack.ORIENTATION_ZY = 2;

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
		skip_planes,				//!< {Array} planes to be excluded from the stack's view [[z,t,...], [z,t,...], ...]
		trakem2_project,			//!< {boolean} that states if a TrakEM2 project is available for this stack
		num_zoom_levels,			//!< {int} that defines the number of available non-artificial zoom levels
		max_zoom_level,				//!< {int} that defines the maximum available zoom level
		tile_source_type,			//!< {int} that defines the tile source type
		labelupload_url,			//!< {String} that defines the label upload URL for labels (for tile_source_type==2)
		metadata,					//!< {String} of arbitrary meta data
		inverse_mouse_wheel,		//!< {boolean} Whether to inverse mouse wheel for changing sections
		orientation					//!< {Integer} orientation (0: xy, 1: xz, 2: yz)
)
{
	var n = dimension.length;

	/**
	 * update the scale bar (x-resolution) to a proper size
	 */
	var updateScaleBar = function()
	{
		var meter = self.scale / resolution.x;
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
	};


	/**
	 * update all state informations and the screen content
	 */
	var update = function( completionCallback )
	{
		
		self.overview.redraw();
		updateScaleBar();

		//statusBar.replaceLast( "[" + ( Math.round( x * 10000 * resolution.x ) / 10000 ) + ", " + ( Math.round( y * 10000 * resolution.y ) / 10000 ) + "]" );

		self.redraw(completionCallback);

		if( tool ) {
			tool.redraw();
		}

		return;
	};
	this.update = update;

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
	};

	/**
	 * Project x-coordinate for stack coordinates
	 */
	switch ( orientation )
	{
	case Stack.ORIENTATION_ZY:
		this.stackToProjectX = function( zs, ys, xs )
		{
			return zs * resolution.z + translation.x;
		};
		break;
	default:
		this.stackToProjectX = function( zs, ys, xs )
		{
			return xs * resolution.x + translation.x;
		};
	}

	/**
	 * Project y-coordinate for stack coordinates
	 */
	switch ( orientation )
	{
	case Stack.ORIENTATION_XZ:
		this.stackToProjectY = function( zs, ys, xs )
		{
			return zs * resolution.z + translation.y;
		};
		break;
	default:
		this.stackToProjectY = function( zs, ys, xs )
		{
			return ys * resolution.y + translation.y;
		};
	}

	/**
	 * Project z-coordinate for stack coordinates
	 */
	switch ( orientation )
	{
	case Stack.ORIENTATION_XZ:
		this.stackToProjectZ = function( zs, ys, xs )
		{
			return ys * resolution.y + translation.z;
		};
		break;
	case Stack.ORIENTATION_ZY:
		this.stackToProjectZ = function( zs, ys, xs )
		{
			return xs * resolution.x + translation.z;
		};
		break;
	default:
		this.stackToProjectZ = function( zs, ys, xs )
		{
			return zs * resolution.z + translation.z;
		};
	}

	/**
	 * Project coordinates of the current view.
	 */
	this.projectCoordinates = function()
	{
		var l =
		{
			z : self.stackToProjectZ( self.z, self.y, self.x ),
			s : self.s,
			scale : self.scale,
			y : self.stackToProjectY( self.z, self.y, self.x ),
			x : self.stackToProjectX( self.z, self.y, self.x )
		};
		return l;
	};


	/**
	 * Transfer the limiting coordinates of an orthogonal box from stack to
	 * project coordinates.  Transferred coordinates are written into
	 * projectBox.  This method is faster than createStackToProjectBox because
	 * it does not generate new objects (Firefox 20%, Chromium 100% !)
	 *
	 *  @param stackBox {min {x, y, z}, max{x, y, z}}
	 *  @param projectBox {min {x, y, z}, max{x, y, z}}
	 */
	this.stackToProjectBox = function( stackBox, projectBox )
	{
		projectBox.min.x = self.stackToProjectX( stackBox.min.z, stackBox.min.y, stackBox.min.x );
		projectBox.min.y = self.stackToProjectY( stackBox.min.z, stackBox.min.y, stackBox.min.x );
		projectBox.min.z = self.stackToProjectZ( stackBox.min.z, stackBox.min.y, stackBox.min.x );

		projectBox.max.x = self.stackToProjectX( stackBox.max.z, stackBox.max.y, stackBox.max.x );
		projectBox.max.y = self.stackToProjectY( stackBox.max.z, stackBox.max.y, stackBox.max.x );
		projectBox.max.z = self.stackToProjectZ( stackBox.max.z, stackBox.max.y, stackBox.max.x );
	};


	/**
	 * Create a new box from an orthogonal box by transferring its limiting
	 * coordinates from stack to project coordinates.
	 *
	 *  @param stackBox {min {x, y, z}, max{x, y, z}}
	 */
	this.createStackToProjectBox = function( stackBox )
	{
		return {
			min : {
				x : self.stackToProjectX( stackBox.min.z, stackBox.min.y, stackBox.min.x ),
				y : self.stackToProjectY( stackBox.min.z, stackBox.min.y, stackBox.min.x ),
				z : self.stackToProjectZ( stackBox.min.z, stackBox.min.y, stackBox.min.x )
			},
			max : {
				x : self.stackToProjectX( stackBox.max.z, stackBox.max.y, stackBox.max.x ),
				y : self.stackToProjectY( stackBox.max.z, stackBox.max.y, stackBox.max.x ),
				z : self.stackToProjectZ( stackBox.max.z, stackBox.max.y, stackBox.max.x )
			}
		};
	};


	/**
	 * Write the limiting coordinates of the current stack view's bounding box
	 * into stackBox.  Faster tthan creating an ew box.
	 *
	 *  @param stackBox {min {x, y, z}, max{x, y, z}}
	 */
	this.stackViewBox = function( stackBox )
	{
		var w2 = self.viewWidth / self.scale / 2;
		var h2 = self.viewHeight / self.scale / 2;

		stackBox.min.x = self.x - w2;
		stackBox.min.y = self.y - h2;
		stackBox.min.z = self.z - 0.5;

		stackBox.max.x = self.x + w2;
		stackBox.max.y = self.y + h2;
		stackBox.max.z = self.z + 0.5;
	};


	/**
	 * Create the bounding box of the current stack view.
	 *
	 *  @return {min {x, y, z}, max{x, y, z}}
	 */
	this.createStackViewBox = function()
	{
		var w2 = self.viewWidth / self.scale / 2;
		var h2 = self.viewHeight / self.scale / 2;

		return {
			min : {
				x : self.x - w2,
				y : self.y - h2,
				z : self.z - 0.5
			},
			max : {
				x : self.x + w2,
				y : self.y + h2,
				z : self.z + 0.5
			}
		};
	};


	/**
	 * Write the limiting coordinates of the current stack view's bounding box
	 * plus some excess padding space into stackBox.  Faster than creating a
	 * new box.
	 *
	 *  @param stackBox {min {x, y, z}, max{x, y, z}}
	 *  @param padScreenX x-padding in screen coordinates
	 *  @param padScreenY y-padding in screen coordinates
	 *  @param padScreenZ z-padding in screen coordinates (==stack coordinates as z is not scaled)
	 */
	this.paddedStackViewBox = function( stackBox, padScreenX, padScreenY, padScreenZ )
	{
		var w2 = ( self.viewWidth / 2 + padScreenX ) / self.scale;
		var h2 = ( self.viewHeight / 2 + padScreenY ) / self.scale;
		var d2 = 0.5 + padScreenZ;

		stackBox.min.x = self.x - w2;
		stackBox.min.y = self.y - h2;
		stackBox.min.z = self.z - d2;

		stackBox.max.x = self.x + w2;
		stackBox.max.y = self.y + h2;
		stackBox.max.z = self.z + d2;
	};


	/**
	 * Create the bounding box of the current stack view plus some excess
	 * padding space.
	 *
	 *  @param padScreenX x-padding in screen coordinates
	 *  @param padScreenY y-padding in screen coordinates
	 *  @param padScreenZ z-padding in screen coordinates (==stack coordinates as z is not scaled)
	 */
	this.createPaddedStackViewBox = function( padScreenX, padScreenY, padScreenZ )
	{
		var w2 = ( self.viewWidth / 2 + padScreenX ) / self.scale;
		var h2 = ( self.viewHeight / 2 + padScreenY ) / self.scale;
		var d2 = 0.5 + padScreenZ;

		return {
			min : {
				x : self.x - w2,
				y : self.y - w2,
				z : self.z - d2
			},
			max : {
				x : self.x + w2,
				y : self.y + w2,
				z : self.z + d2
			}
		};
	};


	/**
	 * Get the top and left coordinates in physical project coordinates of
	 * stack's window
	 *
	 * TODO This method doesn't conceptually conform with coordinate transforms
	 */
	this.getWorldTopLeft = function()
	{
		return {
			worldTop : ( ( self.y - self.viewHeight / self.scale / 2 ) ) * self.resolution.y + self.translation.y,
			worldLeft : ( ( self.x - self.viewWidth / self.scale / 2 ) ) * self.resolution.x + self.translation.x,
			scale : self.scale };
	};

  /**
   * Get stacks width and height
   *
   * TODO This method doesn't conceptually conform with coordinate transforms
   */
  this.getFieldOfViewInPixel = function()
  {
    var l =
	{
	    stackDivWidth : self.viewWidth,
		stackDivHeight : self.viewHeight,
        stackScaledWidth : Math.floor(self.dimension.x * self.scale ),
        stackScaledHeight : Math.floor(self.dimension.y * self.scale ),
        worldTop : ( ( self.y - self.viewHeight / self.scale / 2 ) ),
        worldLeft : ( ( self.x - self.viewWidth / self.scale / 2 ) ),
        scale : self.scale,
        worldTopC : self.yc,
        worldLeftC : self.xc
    };
    return l;
  };

	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	this.redraw = function(completionCallback)
	{
		var allQueued = false, semaphore = 0, layer,
                onAnyCompletion = function () {
			-- semaphore;
			if (allQueued && semaphore === 0) {
				if (typeof completionCallback !== "undefined") {
					completionCallback();
				}
			}
		};

		self.yc = Math.floor( self.y * self.scale - ( self.viewHeight / 2 ) );
		self.xc = Math.floor( self.x * self.scale - ( self.viewWidth / 2 ) );


		// Semaphore pattern from: http://stackoverflow.com/a/3709809/223092
		for ( var key in layers ) {
			if (layers.hasOwnProperty(key)) {
				layer = layers[key];
				// If a layer is invisble, continue with the next one.
				if (layer.hasOwnProperty('visible') && !layer.visible) {
					continue;
				}
				++ semaphore;
				layer.redraw(onAnyCompletion);
			}
		}

		allQueued = true;
		/* Also check at the end, in case none of these
		   redraws invovled an AJAX call: */
		if (semaphore === 0) {
			if (typeof completionCallback !== "undefined") {
				completionCallback();
			}
		}

		self.old_z = self.z;
		self.old_y = self.y;
		self.old_x = self.x;
		self.old_s = self.s;
		self.old_scale = self.scale;
		self.old_yc = self.yc;
		self.old_xc = self.xc;

		return 2;
	};

	/**
	 * Get the view element
	 */
	this.getView = function()
	{
		return view;
	};

    /**
     * Get layers
     */
    this.getLayers = function()
    {
        return layers;
    };


    /**
	 * Stack x-coordinate from project coordinates
	 */
	switch ( orientation )
	{
	case Stack.ORIENTATION_ZY:
		this.projectToStackX = function( zp, yp, xp )
		{
			return Math.max( 0, Math.min( MAX_X, ( zp - translation.z ) / resolution.x ) );
		};
		break;
	default:
		this.projectToStackX = function( zp, yp, xp )
		{
			return Math.max( 0, Math.min( MAX_X, ( xp - translation.x ) / resolution.x ) );
		};
	}

	/**
	 * Stack y-coordinate from project coordinates
	 */
	switch ( orientation )
	{
	case Stack.ORIENTATION_XZ:
		this.projectToStackY = function( zp, yp, xp )
		{
			return Math.max( 0, Math.min( MAX_Y, ( zp - translation.z ) / resolution.y ) );
		};
		break;
	default:	// xy
		this.projectToStackY = function( zp, yp, xp )
		{
			return Math.max( 0, Math.min( MAX_Y, ( yp - translation.y ) / resolution.y ) );
		};
	}


	var projectToStackZ;
	switch ( orientation )
	{
	case Stack.ORIENTATION_XZ:
		projectToStackZ = function( zp, yp, xp )
		{
			return Math.round( ( yp - translation.y ) / resolution.z );
		};
		break;
	case Stack.ORIENTATION_ZY:
		projectToStackZ = function( zp, yp, xp )
		{
			return Math.round( ( xp - translation.x ) / resolution.z );
		};
		break;
	default:
		projectToStackZ = function( zp, yp, xp )
		{
			return Math.round( ( zp - translation.z ) / resolution.z );
		};
	}


	/**
	 * Stack z-coordinate from project coordinates
	 */
	this.projectToStackZ = function( zp, yp, xp )
	{
		var z1, z2;
		z1 = z2 = projectToStackZ( zp, yp, xp );
		while ( skip_planes[ z1 ] && skip_planes[ z2 ] )
		{
			z1 = Math.max( 0, z1 - 1 );
			z2 = Math.min( MAX_Z, z2 + 1 );
		}
		var z3 = skip_planes[ z1 ] ? z2 : z1;
		return Math.max( 0, Math.min( MAX_Z, z3 ) );
	};

	/**
	 * Move this stack to the given project coordinates and call the completion
	 * callback as a continuation of the update() call. Before the actual move,
	 * all layers in <layersWithBeforeMove> are notified about the upcoming move
	 * with the help of their beforeMove() function. When doing so, this function
	 * passes a call to itself as a continuation to beforeMove(). That is to wait
	 * for the return of potential asynchronous calls during beforeMove().
	 * Similar to the moveTo functionality in project.js, this wouldn't be
	 * possible to do with loops.
	 */
	this.moveToAfterBeforeMoves = function( zp, yp, xp, sp, completionCallback, layersWithBeforeMove )
	{
		var layerWithBeforeMove;

		if ( layersWithBeforeMove.length == 0 )
		{
			// Then carry on to the actual move:

			if ( typeof sp == "number" )
			{
				self.s = Math.max( self.MIN_S, Math.min( self.MAX_S, sp ) );
				self.scale = 1.0 / Math.pow( 2, self.s );
			}

			self.x = this.projectToStackX( zp, yp, xp );
			self.y = this.projectToStackY( zp, yp, xp );
			self.z = this.projectToStackZ( zp, yp, xp );

			update( completionCallback );

		}
		else
		{
			// Otherwise do the next layer's beforeMove() and call self recursively as
			// a continuation of it.
			layerWithBeforeMove = layersWithBeforeMove.shift();
			layerWithBeforeMove.beforeMove( function() {
				self.moveToAfterBeforeMoves( zp, yp, xp, sp, completionCallback, layersWithBeforeMove );
			} );
		}
	};

	/**
	 * Move to project-coordinates and execute a completion callback when
	 * finished.
	 */
	this.moveTo = function( zp, yp, xp, sp, completionCallback )
	{
		// Collect all layers in this stack that require a call before the stack is
		// moved (that is all the layers that have a beforeMove() function).
		var layersWithBeforeMove = [], l;
		for ( var key in layers ) {
			if (layers.hasOwnProperty(key)) {
				l = layers[key];
				// if (l.beforeMove) {
				if( typeof l.beforeMove === 'function') {
					layersWithBeforeMove.push(l);
				}
			}
		}

		self.moveToAfterBeforeMoves( zp, yp, xp, sp, completionCallback, layersWithBeforeMove );
	};

	/**
	 * move to pixel coordinates
	 */
	this.moveToPixel = function( zs, ys, xs, ss )
	{
		project.moveTo(
			self.stackToProjectZ( zs, ys, xs ),
			self.stackToProjectY( zs, ys, xs ),
			self.stackToProjectX( zs, ys, xs ),
			ss );

		return true;
	};

	var resize = function()
	{
		self.viewWidth = stackWindow.getFrame().offsetWidth;
		self.viewHeight = stackWindow.getFrame().offsetHeight;

		for ( var key in layers ) {
			if( layers.hasOwnProperty( key )) {
				layers[ key ].resize( self.viewWidth, self.viewHeight );
			}
		}

		self.overview.redraw();

		return;
	};
	this.resize = resize;

	/**
	 * Get the stack window.
	 */
	this.getWindow = function() { return stackWindow; };

	/**
	 * Get the project.
	 */
	this.getProject = function(){ return project; };

	/**
	 * Get stack ID.
	 */
	this.getId = function(){ return id; };

	/**
	 * Determines whether this stack is semantically equal to the provided stack.
	 */
	this.isEqual = function (otherStack) {
		return id === otherStack.id;
	};

	/**
	 * Get a layer. Layers are associated by a unique key.
	 *
	 * @param key
	 */
	this.getLayer = function( key )
	{
		if ( layers[ key ] )
			return layers[key];
        return;
	};

	/**
	 * Add a layer.  Layers are associated by a unique key.
	 * If a layer with the passed key exists, then this layer will be replaced.
	 *
	 * @param key
	 * @param layer
	 */
	this.addLayer = function( key, layer )
	{
		if ( layers[ key ] )
			layers[ key ].unregister();
		layers[ key ] = layer;
		self.tilelayercontrol.refresh();
		return;
	};

	/**
	 * Remove a layer specified by its key.  If no layer with this key exists,
	 * then nothing will happen.  The layer is returned;
	 *
	 */
	this.removeLayer = function( key )
	{
		var layer = layers[ key ];
		if ( typeof layer != "undefined" && layer )
		{
			layer.unregister();
			delete layers[ key ];
			self.tilelayercontrol.refresh();
			return layer;
		}
		else
			return null;
	};


	/**
	 * Register a tool at this stack.  Unregisters the current tool and then
	 * makes the tool working.
	 */
	this.setTool = function( newTool )
	{
//		if ( typeof tool != "undefined" && tool )
//			tool.unregister();
		tool = newTool;
		if ( typeof tool != "undefined" && tool )
			tool.register( self );
	};

	/** Return the current tool. */
	this.getTool = function()
	{
		return tool;
	};

	/**
	 * Shows and hides reference lines that meet on the center of each slice.
	 */
	this.showReferenceLines = function( show )
	{
		vert.style.visibility = show ? "visible" : "hidden";
		horr.style.visibility = show ? "visible" : "hidden";
	};

	// initialize
	var self = this;
	if ( typeof ui == "undefined" ) ui = new UI();

	self.id = id;

	self.resolution = resolution;
	self.translation = translation;
	self.dimension = dimension;

	self.tile_source_type = tile_source_type;
	self.labelupload_url = labelupload_url;

	var tool = null;
	var layers = {};

	var MAX_X = dimension.x - 1;   //!< the last possible x-coordinate
	var MAX_Y = dimension.y - 1;   //!< the last possible y-coordinate
	var MAX_Z = dimension.z - 1;   //!< the last possible z-coordinate
	self.MAX_Z = MAX_Z;

	//! estimate the zoom levels
	if ( num_zoom_levels < 0 ) {
		self.MAX_S = 0;
		var max_dim = Math.max( MAX_X, MAX_Y );
		var min_size = 1024;
		while ( max_dim / Math.pow( 2, self.MAX_S ) > min_size )
			++self.MAX_S;
	} else {
		self.MAX_S = num_zoom_levels;
	}
	self.MIN_S = max_zoom_level;

	//! all possible slices
	self.slices = new Array();
	self.broken_slices = new Array();
	for ( var i = 0; i < dimension.z; ++i )
	{
		if ( !skip_planes[ i ] )
			self.slices.push( i );
		else
			self.broken_slices.push( i );
	}

	//-------------------------------------------------------------------------

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
				self.redraw();
				break;
			case CMWWindow.FOCUS:
				self.overview.getView().style.zIndex = "6";
				// FIXME: explicitly defocus the search field in the
				// treenode table. setting the focus to a dummy
				// href element does not work
				$('#search_labels').blur();
				// only update the project's focused stack if the stack
				// isn't already focused
				if ( self !== project.focusedStack )
					project.setFocusedStack( self );
				break;
			case CMWWindow.BLUR:
				self.overview.getView().style.zIndex = "5";
				if ( tool )
					tool.unregister();
				tool = null;
				// window.onresize();
        // stackWindow.redraw();
				break;
			}
			return true;
		} );

	self.overview = new Overview( self );
	view.appendChild( self.overview.getView() );

	self.tilelayercontrol = new TilelayerControl( self );
	view.appendChild( self.tilelayercontrol.getView() );

	var scaleBar = document.createElement( "div" );
	scaleBar.className = "sliceBenchmark";
	scaleBar.appendChild( document.createElement( "p" ) );
	scaleBar.firstChild.appendChild( document.createElement( "span" ) );
	scaleBar.firstChild.firstChild.appendChild( document.createTextNode( "test" ) );
	view.appendChild( scaleBar );

	var controlToggle = document.createElement( "div" );
	controlToggle.className = "stackControlToggle";
	controlToggle.title = "show/hide slice controls";
	controlToggle.onmousedown = function(e) {
		if ( typeof event != "undefined" && event )
			event.cancelBubble = true;
		if ( e && e.stopPropagation )
			e.stopPropagation();
		var state = $(this).siblings('.TilelayerControl, .sliceBenchmark').toggle().is(':visible');
		$(this).attr('class', state ? 'stackControlToggle' : 'stackControlToggle_hidden');
	};
	view.appendChild( controlToggle );

	self.metadata = metadata;
	if ( metadata.length > 0 ) {
		var metadataDisplay = document.createElement( "div" );
		metadataDisplay.className = "metadata";
		metadataDisplay.appendChild( document.createElement( "p" ) );
		metadataDisplay.firstChild.appendChild( document.createElement( "span" ) );
		metadataDisplay.firstChild.firstChild.appendChild( document.createTextNode( metadata ) );
		view.appendChild( metadataDisplay );
	}

	if( inverse_mouse_wheel === 0 )
		self.inverse_mouse_wheel = 1;
	else
		self.inverse_mouse_wheel = -1;

	var indicatorbar = document.createElement( "div" );
	indicatorbar.className = "indicatorbar";
	indicatorbar.id = "indicatorbar";
	view.appendChild( indicatorbar );

	// Display horizontal and vertical reference lines if wanted.
	var vert = document.createElement( "div" );
	var horr = document.createElement( "div" );
	vert.style.height = horr.style.width = "100%";
	vert.style.width = horr.style.height = "1px";
	vert.style.position = horr.style.position = "absolute";
	vert.style.top = horr.style.left = "0px";
	vert.style.left = horr.style.top = "50%";
	vert.style.zIndex = horr.style.zIndex = "1";
	vert.style.backgroundColor = horr.style.backgroundColor = "#ffffff";
	vert.style.opacity = horr.style.opacity = "0.5";
	view.appendChild( vert );
	view.appendChild( horr );
	self.showReferenceLines( userprofile ? userprofile.display_stack_reference_lines : false );

	// take care, that all values are within a proper range
	// Declare the x,y,z,s as coordinates in pixels
	self.z = 0;
	self.y = Math.floor( MAX_Y / 2 );
	self.x = Math.floor( MAX_X / 2 );
	self.s = self.MAX_S;

	self.old_z = -1;
	self.old_y = self.y;
	self.old_x = self.x;
	self.old_s = self.s;

	self.yc = 0;
	self.xc = 0;

	self.scale = 1 / Math.pow( 2, self.s );
	self.old_scale = self.scale;

	self.is_trackem2_stack = trakem2_project;
	self.orientation = orientation;
}

/** known scale bar sizes in nanometers */
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

/** known scale bar units */
Stack.SCALE_BAR_UNITS = new Array(
			"nm",
			unescape( "%u03BCm" ),
			"mm",
			"m" );

