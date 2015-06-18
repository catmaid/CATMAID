/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */

/** orientations */
Stack.ORIENTATION_XY = 0;
Stack.ORIENTATION_XZ = 1;
Stack.ORIENTATION_ZY = 2;

/**
 * A Stack is created with a given pixel resolution, pixel dimension, a
 * translation relative to the project and lists of planes to be excluded
 * (e.g. missing sections in serial section microscopy and missing frames in a
 * time series).
 */
function Stack(
		id,							//!< {Integer} the stack's id
		title,						//!< {String} the stack's title
		dimension,					//!< {Array} pixel dimensions [x, y, z, ...]
		resolution,					//!< {Array} physical resolution in units/pixel [x, y, z, ...]
		translation,				//!< @todo replace by an affine transform
		skip_planes,				//!< {Array} planes to be excluded from the stack's view [[z,t,...], [z,t,...], ...]
		trakem2_project,			//!< {boolean} that states if a TrakEM2 project is available for this stack
		num_zoom_levels,			//!< {int} that defines the number of available non-artificial zoom levels
		max_zoom_level,				//!< {int} that defines the maximum available zoom level
		labelupload_url,			//!< {String} that defines the label upload URL for labels (for tile_source_type==2)
		metadata,					//!< {String} of arbitrary meta data
		orientation					//!< {Integer} orientation (0: xy, 1: xz, 2: yz)
	) {

	// initialize
	var self = this;

	self.id = id;
	self.title = title;
	self.resolution = resolution;
	self.translation = translation;
	self.dimension = dimension;

	// all possible slices
	self.slices = [];
	self.broken_slices = [];
	for ( var i = 0; i < dimension.z; ++i )
	{
		if ( !skip_planes[ i ] )
			self.slices.push( i );
		else
			self.broken_slices.push( i );
	}

	var MAX_X = dimension.x - 1;   //!< the last possible x-coordinate
	var MAX_Y = dimension.y - 1;   //!< the last possible y-coordinate
	var MAX_Z = dimension.z - 1;   //!< the last possible z-coordinate
	self.MAX_X = MAX_X;
	self.MAX_Y = MAX_Y;
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

	self.is_trackem2_stack = trakem2_project;
	self.labelupload_url = labelupload_url;
	this.metadata = metadata;
	self.orientation = orientation;

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
	 * Project x-resolution for a given zoom level.
	 */
	this.stackToProjectSX = function (s) {
		return this.resolution.x * Math.pow(2, s);
	};

	/**
	 * Stack zoom level for a given x-resolution.
	 */
	this.projectToStackSX = function (res) {
		return Math.log(res / this.resolution.x) / Math.LN2;
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

		return projectBox;
	};


	/**
	 * Create a new box from an orthogonal box by transferring its limiting
	 * coordinates from stack to project coordinates.
	 *
	 *  @param stackBox {min {x, y, z}, max{x, y, z}}
	 */
	this.createStackToProjectBox = function( stackBox )
	{
		return this.stackToProjectBox(stackBox, {min: {}, max: {}});
	};
}

/**
 * StackViewer is the core data viewer and interaction element.  It displays a
 * list of layers of an x,y-plane in an n-dimensional data set, tracks the
 * navigation/edit mode and organizes access to user interface elements such
 * as navigation sliders and buttons.  x, y dimensions are shown in the plane,
 * for all other dimensions, a slider is used.
 *
 * Layers can be images, text, SVG or arbitrary other overlays.
 *
 * Properties of the primary stack limit the field of view and the slider
 * ranges.
 */
function StackViewer(
		project,					//!< {Project} reference to the parent project
		primaryStack,
		inverse_mouse_wheel 		//!< {boolean} Whether to inverse mouse wheel for changing sections
)
{
	this._project = project;
	this.primaryStack = primaryStack;
	this._stacks = [primaryStack];

	this._widgetId = this.registerInstance();

	// take care, that all values are within a proper range
	// Declare the x,y,z,s as coordinates in pixels
	this.z = 0;
	this.y = Math.floor( primaryStack.MAX_Y / 2 );
	this.x = Math.floor( primaryStack.MAX_X / 2 );
	this.s = primaryStack.MAX_S;

	this.old_z = -1;
	this.old_y = this.y;
	this.old_x = this.x;
	this.old_s = this.s;

	this.yc = 0;
	this.xc = 0;

	this.scale = 1 / Math.pow( 2, this.s );
 	this.old_scale = this.scale;

	this.navigateWithProject = true;

	this._tool = null;
	this._layers = {};
	this._layerOrder = [];

	//-------------------------------------------------------------------------

	this._stackWindow = new CMWWindow( primaryStack.title );
	this._view = this._stackWindow.getFrame();
	this._layersView = document.createElement("div");
	this._view.appendChild(this._layersView);

	this.viewWidth = this._stackWindow.getFrame().offsetWidth;
	this.viewHeight = this._stackWindow.getFrame().offsetHeight;

	var self = this;
	this._stackWindow.addListener(
		function( callingWindow, signal )
		{
			switch ( signal )
			{
			case CMWWindow.CLOSE:
				self._project.removeStackViewer( self.getId() );
				break;
			case CMWWindow.RESIZE:
				self.resize();
				self.redraw();
				break;
			case CMWWindow.FOCUS:
				self.overview.getView().style.zIndex = "6";
				self._project.setFocusedStackViewer( self );
				break;
			case CMWWindow.BLUR:
				self.overview.getView().style.zIndex = "5";
				if ( self._tool )
					self._tool.unregister();
				self._tool = null;
				break;
			}
			return true;
		} );

	this.overview = new Overview( this );
	this._view.appendChild( this.overview.getView() );

	this.tilelayercontrol = new CATMAID.TilelayerControl( this );
	$(this.tilelayercontrol.getView()).hide();
	this._view.appendChild( this.tilelayercontrol.getView() );

	// Ask for confirmation before closing the stack via the close button
	$(this._view).find('.stackClose').get(0).onmousedown = function (e) {
		if (self._project.getStackViewers().length > 1 || confirm('Closing this window will exit the project. Proceed?'))
			self._stackWindow.close(e);
		else e.stopPropagation();
	};

	this._scaleBar = document.createElement( "div" );
	this._scaleBar.className = "sliceBenchmark";
	this._scaleBar.appendChild( document.createElement( "p" ) );
	this._scaleBar.firstChild.appendChild( document.createElement( "span" ) );
	this._scaleBar.firstChild.firstChild.appendChild( document.createTextNode( "test" ) );
	this._view.appendChild( this._scaleBar );

	var controlToggle = document.createElement( "div" );
	controlToggle.className = "stackControlToggle_hidden";
	controlToggle.title = "show/hide layer controls";
	controlToggle.onmousedown = function(e) {
		if ( typeof event != "undefined" && event )
			event.cancelBubble = true;
		if ( e && e.stopPropagation )
			e.stopPropagation();
		var state = $(this).siblings('.TilelayerControl').toggle().is(':visible');
		$(this).attr('class', state ? 'stackControlToggle' : 'stackControlToggle_hidden');
	};
	this._view.appendChild( controlToggle );

	if ( primaryStack.metadata.length > 0 ) {
		var metadataDisplay = document.createElement( "div" );
		metadataDisplay.className = "metadata";
		metadataDisplay.appendChild( document.createElement( "p" ) );
		metadataDisplay.firstChild.appendChild( document.createElement( "span" ) );
		metadataDisplay.firstChild.firstChild.appendChild( document.createTextNode( metadata ) );
		this._view.appendChild( metadataDisplay );
	}

	if( inverse_mouse_wheel === 0 )
		this.inverse_mouse_wheel = 1;
	else
		this.inverse_mouse_wheel = -1;

	var indicatorbar = document.createElement( "div" );
	indicatorbar.className = "indicatorbar";
	this._view.appendChild( indicatorbar );

	// Display horizontal and vertical reference lines if wanted.
	this._vert = document.createElement( "div" );
	this._horr = document.createElement( "div" );
	this._vert.style.height = this._horr.style.width = "100%";
	this._vert.style.width = this._horr.style.height = "1px";
	this._vert.style.position = this._horr.style.position = "absolute";
	this._vert.style.top = this._horr.style.left = "0px";
	this._vert.style.left = this._horr.style.top = "50%";
	this._vert.style.zIndex = this._horr.style.zIndex = "1";
	this._vert.style.backgroundColor = this._horr.style.backgroundColor = "#ffffff";
	this._vert.style.opacity = this._horr.style.opacity = "0.5";
	this._view.appendChild( this._vert );
	this._view.appendChild( this._horr );
	this.showReferenceLines( userprofile ? userprofile.display_stack_reference_lines : false );
}

StackViewer.prototype = {};
$.extend(StackViewer.prototype, new InstanceRegistry());
StackViewer.prototype.constructor = StackViewer;

/**
 * update the scale bar (x-resolution) to a proper size
 */
StackViewer.prototype.updateScaleBar = function () {
	var meter = this.scale / this.primaryStack.resolution.x;
	var width = 0;
	var text = "";
	for ( var i = 0; i < StackViewer.SCALE_BAR_SIZES.length; ++i )
	{
		text = StackViewer.SCALE_BAR_SIZES[ i ];
		width = StackViewer.SCALE_BAR_SIZES[ i ] * meter;
		if ( width > Math.min( 192, this.viewWidth / 5 ) )
			break;
	}
	var ui = 0;
	while ( text >= 1000 && ui < StackViewer.SCALE_BAR_UNITS.length - 1 )
	{
		text /= 1000;
		++ui;
	}
	this._scaleBar.style.width = width + "px";
	this._scaleBar.firstChild.firstChild.replaceChild(
		document.createTextNode( text + " " + StackViewer.SCALE_BAR_UNITS[ ui ] ),
		this._scaleBar.firstChild.firstChild.firstChild );
};


/**
 * update all state informations and the screen content
 */
StackViewer.prototype.update = function (completionCallback) {
	this.overview.redraw();
	if (this.s !== this.old_s) this.updateScaleBar();

	this.redraw(completionCallback);

	if( this._tool ) {
		this._tool.redraw();
	}
};

/**
 * Get inclusive zoom level extents for all stacks in the viewer.
 */
StackViewer.prototype.getZoomExtents = function () {
	var extents = this._stacks.reduce(function (extents, stack) {
		extents.min = Math.min(extents.min, stack.stackToProjectSX(stack.MIN_S));
		extents.max = Math.max(extents.max, stack.stackToProjectSX(stack.MAX_S));
		return extents;
	}, {min: Infinity, max: -Infinity});

	return {
		min: this.primaryStack.projectToStackSX(extents.min),
		max: this.primaryStack.projectToStackSX(extents.max)
	};
};

/**
 * Get stack coordinates of the current view's top left corner.
 * These values might be used as an offset to get the stack coordinates of a
 * mouse event handled by the stack.
 */
StackViewer.prototype.screenPosition = function () {
	var width = this.viewWidth / this.scale;
	var height = this.viewHeight / this.scale;
	var l =
	{
		top : Math.floor( this.y - height / 2 ),
		left : Math.floor( this.x - width / 2 )
	};
	return l;
};

/**
 * Project coordinates of the current view.
 */
StackViewer.prototype.projectCoordinates = function () {
	var l =
	{
		z : this.primaryStack.stackToProjectZ( this.z, this.y, this.x ),
		s : this.s,
		scale : this.scale,
		y : this.primaryStack.stackToProjectY( this.z, this.y, this.x ),
		x : this.primaryStack.stackToProjectX( this.z, this.y, this.x )
	};
	return l;
};

/**
 * Scaled stack coordinates of the current view's top left corner for the given
 * stack.
 *
 * @param  {Stack} stack  Target stack for the scaled view coordinates.
 * @return {xc, yc, z, s} Top left view scaled coordinates in the target stack.
 */
StackViewer.prototype.scaledPositionInStack = function (stack) {
	if (stack.id === this.primaryStack.id) {
		return {
			xc: this.xc,
			yc: this.yc,
			z: this.z,
			s: this.s
		};
	} else {
		var px = this.primaryStack.stackToProjectX(this.z, this.y, this.x),
			py = this.primaryStack.stackToProjectY(this.z, this.y, this.x),
			pz = this.primaryStack.stackToProjectZ(this.z, this.y, this.x),
			stackS = stack.projectToStackSX(this.primaryStack.stackToProjectSX(this.s));
		return {
			xc: Math.floor(stack.projectToStackX(pz, py, px) / Math.pow(2, stackS) - this.viewWidth / 2),
			yc: Math.floor(stack.projectToStackY(pz, py, px) / Math.pow(2, stackS) - this.viewHeight / 2),
			z:  stack.projectToStackZ(pz, py, px),
			s:  stackS
		};
	}
};


/**
 * Write the limiting coordinates of the current stack view's bounding box
 * into stackBox.  Faster than creating a new box.
 *
 *  @param stackBox {min {x, y, z}, max{x, y, z}}
 */
StackViewer.prototype.stackViewBox = function (stackBox) {
	var w2 = this.viewWidth / this.scale / 2;
	var h2 = this.viewHeight / this.scale / 2;

	stackBox.min.x = this.x - w2;
	stackBox.min.y = this.y - h2;
	stackBox.min.z = this.z - 0.5;

	stackBox.max.x = this.x + w2;
	stackBox.max.y = this.y + h2;
	stackBox.max.z = this.z + 0.5;

	return stackBox;
};


/**
 * Create the bounding box of the current stack view.
 *
 *  @return {min {x, y, z}, max{x, y, z}}
 */
StackViewer.prototype.createStackViewBox = function () {
	return this.stackViewBox({min: {}, max: {}});
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
StackViewer.prototype.paddedStackViewBox = function (stackBox, padScreenX, padScreenY, padScreenZ) {
	var w2 = ( this.viewWidth / 2 + padScreenX ) / this.scale;
	var h2 = ( this.viewHeight / 2 + padScreenY ) / this.scale;
	var d2 = 0.5 + padScreenZ;

	stackBox.min.x = this.x - w2;
	stackBox.min.y = this.y - h2;
	stackBox.min.z = this.z - d2;

	stackBox.max.x = this.x + w2;
	stackBox.max.y = this.y + h2;
	stackBox.max.z = this.z + d2;

	return stackBox;
};


/**
 * Create the bounding box of the current stack view plus some excess
 * padding space.
 *
 *  @param padScreenX x-padding in screen coordinates
 *  @param padScreenY y-padding in screen coordinates
 *  @param padScreenZ z-padding in screen coordinates (==stack coordinates as z is not scaled)
 */
StackViewer.prototype.createPaddedStackViewBox = function (padScreenX, padScreenY, padScreenZ) {
	return this.paddedStackViewBox({min: {}, max: {}}, padScreenX, padScreenY, padScreenZ);
};


/**
 * align and update the tiles to be ( x, y ) in the image center
 */
StackViewer.prototype.redraw = function (completionCallback) {
	var allQueued = false, semaphore = 0, layer,
            onAnyCompletion = function () {
		-- semaphore;
		if (allQueued && semaphore === 0) {
			if (typeof completionCallback !== "undefined") {
				completionCallback();
			}
		}
	};

	this.yc = Math.floor( this.y * this.scale - ( this.viewHeight / 2 ) );
	this.xc = Math.floor( this.x * this.scale - ( this.viewWidth / 2 ) );


	// Semaphore pattern from: http://stackoverflow.com/a/3709809/223092
	for (var i = 0; i < this._layerOrder.length; i++) {
		layer = this._layers[this._layerOrder[i]];
		// If a layer is invisble, continue with the next one.
		if (layer.hasOwnProperty('visible') && !layer.visible) {
			continue;
		}
		++ semaphore;
		layer.redraw(onAnyCompletion);
	}

	allQueued = true;
	/* Also check at the end, in case none of these
	   redraws invovled an AJAX call: */
	if (semaphore === 0) {
		if (typeof completionCallback !== "undefined") {
			completionCallback();
		}
	}

	this.old_z = this.z;
	this.old_y = this.y;
	this.old_x = this.x;
	this.old_s = this.s;
	this.old_scale = this.scale;
	this.old_yc = this.yc;
	this.old_xc = this.xc;
};

/**
 * Get the view element
 */
StackViewer.prototype.getView = function () {
	return this._view;
};

/**
 * Get the view element containing layer views.
 * @return {Element} An element whose children are layer views.
 */
StackViewer.prototype.getLayersView = function () {
	return this._layersView;
};

/**
 * Get layers
 */
StackViewer.prototype.getLayers = function () {
    return this._layers;
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
StackViewer.prototype.moveToAfterBeforeMoves = function (
		zp, yp, xp, sp, completionCallback, layersWithBeforeMove) {
	var layerWithBeforeMove;

	if ( layersWithBeforeMove.length === 0 )
	{
		// Then carry on to the actual move:

		if ( typeof sp == "number" )
		{
			var sExtents = this.getZoomExtents();
			this.s = Math.max( sExtents.min, Math.min( sExtents.max, sp ) );
			this.scale = 1.0 / Math.pow( 2, this.s );
		}

		this.x = this.primaryStack.projectToStackX( zp, yp, xp );
		this.y = this.primaryStack.projectToStackY( zp, yp, xp );
		this.z = this.primaryStack.projectToStackZ( zp, yp, xp );

		this.update( completionCallback );

	}
	else
	{
		// Otherwise do the next layer's beforeMove() and call self recursively as
		// a continuation of it.
		layerWithBeforeMove = layersWithBeforeMove.shift();
		layerWithBeforeMove.beforeMove(
			this.moveToAfterBeforeMoves.bind(this, zp, yp, xp, sp, completionCallback, layersWithBeforeMove)
		);
	}
};

/**
 * Move to project-coordinates and execute a completion callback when
 * finished.
 *
 * @Deprecated Do not use this method as it mixes project coordinates with a stack-dependent scale level parameter
 */
StackViewer.prototype.moveTo = function (zp, yp, xp, sp, completionCallback) {
	// Collect all layers in this stack that require a call before the stack is
	// moved (that is all the layers that have a beforeMove() function).
	var layersWithBeforeMove = [], l;
	for ( var key in this._layers ) {
		if (this._layers.hasOwnProperty(key)) {
			l = this._layers[key];
			// if (l.beforeMove) {
			if( typeof l.beforeMove === 'function') {
				layersWithBeforeMove.push(l);
			}
		}
	}

	this.moveToAfterBeforeMoves( zp, yp, xp, sp, completionCallback, layersWithBeforeMove );
};

/**
 * move to project-coordinates passing project coordinates and resolution
 *
 * This assumes that all layers have identical scale levels and
 * resolution, i.e. that of the stack, fix as needed.
 *
 * @param res spatial resolution in units per pixel
 */
StackViewer.prototype.moveToProject = function (zp, yp, xp, res, completionCallback) {
	var sp = this.primaryStack.projectToStackSX( res );
	var layersWithBeforeMove = [], l;
	for ( var key in this._layers ) {
		if (this._layers.hasOwnProperty(key)) {
			l = this._layers[key];
			// if (l.beforeMove) {
			if( typeof l.beforeMove === 'function') {
				layersWithBeforeMove.push(l);
			}
		}
	}

	this.moveToAfterBeforeMoves( zp, yp, xp, sp, completionCallback, layersWithBeforeMove );
};

/**
 * move to pixel coordinates
 */
StackViewer.prototype.moveToPixel = function (zs, ys, xs, ss) {
	if (this.navigateWithProject) {
		this._project.moveToProject(
			this.primaryStack.stackToProjectZ( zs, ys, xs ),
			this.primaryStack.stackToProjectY( zs, ys, xs ),
			this.primaryStack.stackToProjectX( zs, ys, xs ),
			this.primaryStack.stackToProjectSX( ss ));
	} else {
		this.moveTo(
			this.primaryStack.stackToProjectZ( zs, ys, xs ),
			this.primaryStack.stackToProjectY( zs, ys, xs ),
			this.primaryStack.stackToProjectX( zs, ys, xs ),
			ss);
	}

	return true;
};

StackViewer.prototype.resize = function () {
	this.viewWidth = this._stackWindow.getFrame().offsetWidth;
	this.viewHeight = this._stackWindow.getFrame().offsetHeight;

	for ( var key in this._layers ) {
		if( this._layers.hasOwnProperty( key )) {
			this._layers[ key ].resize( this.viewWidth, this.viewHeight );
		}
	}

	this.updateScaleBar();

	this.overview.redraw();
};

/**
 * Get the stack window.
 */
StackViewer.prototype.getWindow = function () { return this._stackWindow; };

/**
 * Get the project.
 */
StackViewer.prototype.getProject = function () { return this._project; };

/**
 * Get unique stack viewer identifier.
 */
StackViewer.prototype.getId = function () { return this._widgetId; };

/**
 * Determines whether this stack is semantically equal to the provided stack.
 */
StackViewer.prototype.isEqual = function (otherStack) {
	return this.getId() === otherStack.getId();
};

/**
 * Get a layer. Layers are associated by a unique key.
 *
 * @param key
 */
StackViewer.prototype.getLayer = function (key) {
	if ( this._layers[ key ] )
		return this._layers[key];
};

/**
 * Get an array of layer keys in their rendering order (back to front).
 * @return {[]} An array of layer keys.
 */
StackViewer.prototype.getLayerOrder = function () {
	return this._layerOrder;
};

/**
 * Add a layer.  Layers are associated by a unique key.
 * If a layer with the passed key exists, then this layer will be replaced.
 *
 * @param key
 * @param layer
 */
StackViewer.prototype.addLayer = function (key, layer) {
	if ( this._layers[ key ] )
		this._layers[ key ].unregister();
	this._layers[ key ] = layer;
	if (this._layerOrder.indexOf(key) === -1) this._layerOrder.push(key);
	this.tilelayercontrol.refresh();
};

/**
 * Remove a layer specified by its key.  If no layer with this key exists,
 * then nothing will happen.  The layer is returned;
 *
 */
StackViewer.prototype.removeLayer = function (key) {
	var layer = this._layers[ key ];
	if ( typeof layer !== "undefined" && layer )
	{
		layer.unregister();
		delete this._layers[ key ];
		this._layerOrder.splice(this._layerOrder.indexOf(key), 1);

		if (layer instanceof CATMAID.TileLayer) {
			var self = this;
			var otherStackLayers = Object.keys(this._layers).some(function (key) {
				var otherLayer = self._layers[key];
				return otherLayer instanceof CATMAID.TileLayer && otherLayer.stack.id === layer.stack.id;
			});

			// If this was the last tile layer for a particular stack...
			if (!otherStackLayers) {
				// Remove that stack from this stack viewer and update the tool.
				this._stacks = this._stacks.filter(function (s) { return s.id !== layer.stack.id; });
				if (this._tool) {
					this._tool.unregister(this);
					this._tool.register(this);
				}
			}
		}

		this.tilelayercontrol.refresh();
		return layer;
	}
	else
		return null;
};

/**
 * Detemines whether a layer can be removed from this stack viewer.
 * @param  {*} key      Key of the layer to test.
 * @return {Boolean}    Whether the layer is removable.
 */
StackViewer.prototype.isLayerRemovable = function (key) {
	if (this._layers.length === 1) return false;

	var layer = this._layers[ key ];
	if ( typeof layer !== "undefined" && layer && layer instanceof CATMAID.TileLayer ) {
		return layer.stack.id !== this.primaryStack.id;
	}
	else
		return false;
};

/**
 * Move a layer to a new position in the layer order.
 * @param {*} key       Key of the layer to move.
 * @param {*} beforeKey Key of the layer to move the layer before or null to
 *                      move to the end.
 */
StackViewer.prototype.moveLayer = function (key, beforeKey) {
	var currIndex = this._layerOrder.indexOf(key);
	var newIndex = beforeKey === null ? this._layerOrder.length - 1 : this._layerOrder.indexOf(beforeKey);

	if (currIndex === -1 || newIndex === -1) return; // Invalid arguments.

	var layerA = this._layers[key],
		layerB = beforeKey === null ? null : this._layers[beforeKey];

	if (layerB !== null && layerB.getView) {
		var viewA = layerA.getView(),
			viewB = layerB.getView();
		if (!this._layersView.contains(viewA) || !this._layersView.contains(viewB)) return;
		this._layersView.insertBefore(viewA, viewB);
	} else this._layersView.appendChild(layerA.getView());

	if (typeof layerA.notifyReorder !== 'undefined')
		layerA.notifyReorder(layerB);

	this._layerOrder.splice(newIndex, 0, this._layerOrder.splice(currIndex, 1)[0]);
	this.tilelayercontrol.refresh();
};

/**
 * Add a tile layer for a stack to this stack viewer.
 * @param {Stack} stack The stack associated with this layer.
 * @param {Object} layer The layer to add.
 */
StackViewer.prototype.addStackLayer = function (stack, layer) {
	if (stack.orientation !== this.primaryStack.orientation) {
		throw new Error('Stacks must have the same orientation as the primary stack');
	}

	this._stacks.push(stack);
	this.addLayer('TileLayer' + stack.id, layer);
	if (this._tool) {
		this._tool.unregister(this);
		this._tool.register(this);
	}
	this.resize();
};

/**
 * Register a tool at this stack.  Unregisters the current tool and then
 * makes the tool working.
 */
StackViewer.prototype.setTool = function (newTool) {
//		if ( typeof tool != "undefined" && tool )
//			tool.unregister();
	// If this tool is already registered to this stack, do nothing.
	if ( this._tool === newTool ) return;
	this._tool = newTool;
	if ( typeof this._tool != "undefined" && this._tool )
		this._tool.register( this );
};

/** Return the current tool. */
StackViewer.prototype.getTool = function () {
	return this._tool;
};

/**
 * Shows and hides reference lines that meet on the center of each slice.
 */
StackViewer.prototype.showReferenceLines = function (show) {
	this._vert.style.visibility = show ? "visible" : "hidden";
	this._horr.style.visibility = show ? "visible" : "hidden";
};

/** known scale bar sizes in nanometers */
StackViewer.SCALE_BAR_SIZES = [
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
			500000000000];

/** known scale bar units */
StackViewer.SCALE_BAR_UNITS = [
			"nm",
			unescape( "%u03BCm" ),
			"mm",
			"m"];
