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
		overviewName,				//!< {String} file name of the overview image (e.g. 'overview.jpg')
		skip_planes,				//!< {Array} planes to be excluded from the stack's view [[z,t,...], [z,t,...], ...]
		trakem2_project				//!< {boolean} that states if a TrakEM2 project is available for this stack
)
{
	var n = dimension.length;
	
	/**
	 * update the benchmark (x-resolution) to a proper size
	 */
	var updateScaleBar = function()
	{
		var meter = scale / resolution[ 0 ];
		var width = 0;
		var text = "";
		for ( var i = 0; i < Stack.SCALE_BAR_SIZES.length; ++i )
		{
			text = Stack.SCALE_BAR_SIZES[ i ];
			width = Stack.SCALE_BAR_SIZES[ i ] * meter;
			if ( width > Math.min( 192, viewWidth / 5 ) )
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
	
	var updateControls = function()
	{
		if ( registered )
		{
			if ( slider_s ) slider_s.setByValue( s, true );
			if ( slider_z ) slider_z.setByValue( z, true );

			if ( input_x ) input_x.value = x;
			if ( input_y ) input_y.value = y;
		}
		
		return;
	}
	
	/**
	 * update all state informations and the screen content
	 */
	var update = function( now )
	{
		overview.update( this.z, this.y, this.x, this.s, this.viewHeight, this.viewWidth );
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
	 * get the pixel coordinates of the current view's top left corner
	 */
	this.screenCoordinates = function()
	{
		var width : this.viewWidth / this.scale,
		var height : this.viewHeight / this.scale,
		return
		{
			y : Math.floor( this.y - height / 2 ),
			x : Math.floor( this.x - width / 2 )
		};
	}
	
	/**
	 * get the physical project-coordinates to the current view
	 */
	this.projectCoordinates = function()
	{
		var l =
		{
			z : this.z * resolution.z + translation.z,
			s : this.s,
			scale : this.scale,
			y : this.y * resolution.y + translation.y,
			x : this.x * resolution.x + translation.x
		};
		return l;
	}
	
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	var redraw = function()
	{
		this.yc = Math.floor( y * scale - ( viewHeight / 2 ) );
		this.xc = Math.floor( x * scale - ( viewWidth / 2 ) );

		for ( var i = 0; i < layers.length; ++i )
			layers[ i ].redraw();
			
		//----------------------------------------------------------------------
		/**
		 * This question is completely useless but without asking it, Firefox on
		 * Linux systems will not redraw the screen properly.  Took me ... to
		 * find this out.
		 */
		var a = view.offsetWidth;
		//----------------------------------------------------------------------
			
		this.old_z = this.z;
		this.old_y = this.y;
		this.old_x = this.x;
		this.old_s = this.s;
		this.old_scale = this.scale;
		this.old_yc = this.yc;
		this.old_xc = this.xc
		
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
	 * move to physical project-coordinates in nanometer
	 */
	this.moveTo = function( zp, yp, xp, sp )
	{
		alert( "moveTo" );
		
		if ( typeof sp == "number" )
		{
			s = Math.max( 0, Math.min( MAX_S, Math.round( sp ) ) );
			scale = 1 / Math.pow( 2, s );
		}
		
		LAST_XT = Math.floor( MAX_X * scale / X_TILE_SIZE );
		LAST_YT = Math.floor( MAX_Y * scale / Y_TILE_SIZE );
		
		x = Math.max( 0, Math.min( MAX_X, Math.round( ( xp - translation.x ) / resolution.x ) ) );
		y = Math.max( 0, Math.min( MAX_Y, Math.round( ( yp - translation.y ) / resolution.y ) ) );
		
		var z1;
		var z2;
		z1 = z2 = Math.round( ( zp - translation.z ) / resolution.z );
		while ( broken_slices[ z1 ] && broken_slices[ z2 ] )
		{
			z1 = Math.max( 0, z1 - 1 );
			z2 = Math.min( MAX_Z, z2 + 1 );
		}
		if ( !broken_slices[ z1 ] ) z = z1;
		else z = z2;
		z = Math.max( 0, Math.min( MAX_Z, z ) );
		
		update();
		
		return;
	}
	
	/**
	 * move to pixel coordinates
	 */
	this.moveToPixel = function( zp, yp, xp, sp )
	{
		s = Math.max( 0, Math.min( MAX_S, sp ) );

		scale = 1 / Math.pow( 2, s );
		
		project.moveTo(
			zp * resolution.z + translation.z,
			yp * resolution.y + translation.y,
			xp * resolution.x + translation.x );
		
		updateControls();
		
		return true;
	}
	
	
	var onmousemove = 
	{
		pos : function( e )
		{
			var xp;
			var yp;
			var m = ui.getMouse( e );
			if ( m )
			{
				var pos_x = translation.x + ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x;
				var pos_y = translation.x + ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y;
				statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 3 ) + "]" );
			}
			return false;
		},
		move : function( e )
		{
			self.moveToPixel( z, y - ui.diffY / scale, x - ui.diffX / scale, s );
			return false;
		},
		crop : function( e )
		{
			if ( cropBox )
			{
				cropBox.right += ui.diffX / scale * resolution.x;
				cropBox.bottom += ui.diffY / scale * resolution.y;
				updateCropBox();
			}
		}
	};
	
	var onmouseup =
	{
		move : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", onmousemove.move );
			ui.removeEvent( "onmouseup", onmouseup.move );
			return false;
		},
		edit : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", profiles[ spi ].onmousemove );
			ui.removeEvent( "onmouseup", onmouseup.edit );
			
			return false;
		},
		crop : function( e )
		{
			ui.releaseEvents();
			ui.removeEvent( "onmousemove", onmousemove.crop );
			ui.removeEvent( "onmouseup", onmouseup.crop );
		}
	};
	
	var onmousedown =
	{
		move : function( e )
		{
			ui.registerEvent( "onmousemove", onmousemove.move );
			ui.registerEvent( "onmouseup", onmouseup.move );
			ui.catchEvents( "move" );
			ui.onmousedown( e );
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		},
		edit : function( e )
		{
			var m = ui.getMouse( e );
			if ( m )
			{
				var pos_x = Math.round( x + ( m.offsetX - viewWidth / 2 ) / scale );
				var pos_y = Math.round( y + ( m.offsetY - viewHeight / 2 ) / scale );
				var spi = -1;
				for ( var i = 0; i < profiles.length; ++i )
				{
					if ( profiles[ i ].isInside( pos_x, pos_y ) )
					{
						spi = i;
						break;
					}
				}
				if ( spi >= 0 )
				{
					profiles[ spi ].onmousedown( e );
					profiles[ spi ].clearCanvas();
					profiles[ spi ].drawOutline();
					profiles[ spi ].drawHandles();
					ui.registerEvent( "onmousemove", profiles[ spi ].onmousemove );
					ui.registerEvent( "onmouseup", onmouseup.edit );
					ui.catchEvents();
					ui.onmousedown( e );
				}
			}
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		},
		text : function( e )
		{
			var b = ui.getMouseButton( e );
			switch ( b )
			{
			case 2:
				ui.registerEvent( "onmousemove", onmousemove.move );
				ui.registerEvent( "onmouseup", onmouseup.move );
				ui.catchEvents( "move" );
				ui.onmousedown( e );

				//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
				document.body.firstChild.focus();
				break;
			default:
				var m = ui.getMouse( e );
				var tlx = ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x + translation.x;
				var tly = ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y + translation.y;
				var tlz = z * resolution.z + translation.z;
			
				project.createTextlabel( tlx, tly, tlz, resolution.y, scale );
			}
			
			return false;
		},
		crop : function( e )
		{
			var b = ui.getMouseButton( e );
			switch ( b )
			{
			case 2:
				ui.registerEvent( "onmousemove", onmousemove.move );
				ui.registerEvent( "onmouseup", onmouseup.move );
				ui.catchEvents( "move" );
				break;
			default:
				if ( cropBox )
				{
					view.removeChild( cropBox.view );
					delete cropBox;
					cropBox = false;
				}
				var m = ui.getMouse( e );
				cropBox = {
					left : ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x + translation.x,
					top : ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y + translation.y
				};
				cropBox.right = cropBox.left;
				cropBox.bottom = cropBox.top;
				cropBox.view = document.createElement( "div" );
				cropBox.view.className = "cropBox";
				cropBox.text = document.createElement( "p" );
				cropBox.text.appendChild( document.createTextNode( "0 x 0" ) );
				
				cropBox.view.appendChild( cropBox.text );				
				view.appendChild( cropBox.view );
				
				ui.registerEvent( "onmousemove", onmousemove.crop );
				ui.registerEvent( "onmouseup", onmouseup.crop );
				ui.catchEvents( "crosshair" );
			}
			ui.onmousedown( e );
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		}
	};
	
	var onmousewheel = 
	{
		zoom : function( e )
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
		},
		move : function( e )
		{
			var xp = x;
			var yp = y;
			var m = ui.getMouse( e );
			var w = ui.getMouseWheel( e );
			if ( m )
			{
				xp = m.offsetX - viewWidth / 2;
				yp = m.offsetY - viewHeight / 2;
				//statusBar.replaceLast( ( m.offsetX - viewWidth / 2 ) + " " + ( m.offsetY - viewHeight / 2 ) );
			}
			if ( w )
			{
				if ( w > 0 )
				{
					if ( s < MAX_S )
					{
						self.moveToPixel(
							z,
							y - Math.floor( yp / scale ),
							x - Math.floor( xp / scale ),
							s + 1 );
					}
				}
				else
				{
					if ( s > 0 )
					{
						var ns = scale * 2;
						self.moveToPixel(
							z,
							y + Math.floor( yp / ns ),
							x + Math.floor( xp / ns ),
							s - 1 );
					}
				}
			}
			return false;
		}
	};
	
	//--------------------------------------------------------------------------
	/**
	 * Slider commands for changing the slice come in too frequently, thus the
	 * execution of the actual slice change has to be delayed slightly.  The
	 * timer is overridden if a new action comes in before the last had time to
	 * be executed.
	 */
	var changeSliceDelayedTimer = null;
	var changeSliceDelayedParam = null;
	
	var changeSliceDelayedAction = function()
	{
		window.clearTimeout( changeSliceDelayedTimer );
		self.changeSlice( changeSliceDelayedParam.z );
		changeSliceDelayedParam = null;
		return false;
	}
	
	this.changeSliceDelayed = function( val )
	{
		if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
		changeSliceDelayedParam = { z : val };
		changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
	}
	
	this.changeSlice = function( val )
	{
		self.moveToPixel( val, y, x, s );
		return;
	}
	//--------------------------------------------------------------------------
	
	//--------------------------------------------------------------------------
	/**
	 * ... same as said before for scale changes ...
	 */
	var changeScaleDelayedTimer = null;
	var changeScaleDelayedParam = null;
	
	var changeScaleDelayedAction = function()
	{
		window.clearTimeout( changeScaleDelayedTimer );
		self.changeScale( changeScaleDelayedParam.s );
		changeScaleDelayedParam = null;
		return false;
	}
	
	this.changeScaleDelayed = function( val )
	{
		if ( changeScaleDelayedTimer ) window.clearTimeout( changeScaleDelayedTimer );
		changeScaleDelayedParam = { s : val };
		changeScaleDelayedTimer = window.setTimeout( changeScaleDelayedAction, 100 );
	}
	
	this.changeScale = function( val )
	{
		self.moveToPixel( z, y, x, val );
		return;
	}
	//--------------------------------------------------------------------------
	
	var changeXByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = x;
		else self.moveToPixel( z, y, val, s );
		return;
	}
	
	var changeYByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = y;
		self.moveToPixel( z, val, x, s );
		return;
	}
	
	var YXMouseWheel = function( e )
	{
		var w = ui.getMouseWheel( e );
		if ( w )
		{
			this.value = parseInt( this.value ) - w;
			this.onchange();
		}
		return false
	}
	
	var resize = function()
	{
		alert( "resize stack " + id );
		
		var width = stackWindow.getFrame().offsetWidth;
		var height = stackWindow.getFrame().offsetHeight;
		
		for ( var i = 0; i < layers.length; ++i )
			layers[ i ].resize( width, height );
		
		return;
	}
	
	this.registerZoomControl = function( c )
	{
		slider_s = c;
		return;
	}
	
	this.registerSliceControl = function( c )
	{
		slider_z = c;
		return;
	}
	
	this.registerXControl = function( c )
	{
		input_x = c;
		return;
	}
	
	this.registerYControl = function( c )
	{
		input_y = c;
		return;
	}
	
	/**
	 * register all GUI control elements and event handlers
	 */
	this.register = function()
	{
		registered = true;
		slider_s.update(
			MAX_S,
			0,
			MAX_S + 1,
			s,
			this.changeScaleDelayed );
		
		if ( slices.length < 2 )	//!< hide the slider_z if there is only one slice
		{
			slider_z.getView().parentNode.style.display = "none";
			slider_crop_top_z.getView().parentNode.style.display = "none";
			slider_crop_bottom_z.getView().parentNode.style.display = "none";
		}
		else
		{
			slider_z.getView().parentNode.style.display = "block";
			slider_crop_top_z.getView().parentNode.style.display = "block";
			slider_crop_bottom_z.getView().parentNode.style.display = "block";
		}
		slider_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
		slider_crop_top_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
		slider_crop_bottom_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
		
		/**
		 * Cropping is possible with an attached TrakEM2 project only.
		 */
		if ( trakem2_project )
		{
			document.getElementById( "edit_button_crop" ).style.display = "block";	
			button_crop_apply.onclick = crop;
		}
		else
		{
			document.getElementById( "edit_button_crop" ).style.display = "none";
		}
		
		input_x.onchange = changeXByInput;
		try
		{
			input_x.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}
		
		input_y.onchange = changeYByInput;
		try
		{
			input_y.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}
		return;
	}
	
	/**
	 * unregister all GUI control connections and event handlers
	 */
	this.unregister = function()
	{
		registered = false;
		slider_s.update(
			0,
			1,
			undefined,
			0,
			null );
		
		slider_z.update(
			0,
			1,
			undefined,
			0,
			null );
		
		input_x.onchange = null;
		try
		{
			input_x.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = null;
			}
			catch ( error ) {}
		}
		
		input_y.onchange = null;
		try
		{
			input_y.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = null;
			}
			catch ( error ) {}
		}
		return;
	}
	
	
	/**
	 * set the GUI focus to the stack
	 */
	this.focus = function()
	{
		project.setFocusedStack( self );
		
		smallMap.focus();
		self.setMode( mode );
		self.register();
		self.moveToPixel( z, y, x, s );
		
		if ( cropBox ) cropBox.view.style.display = "block";
		
		return;
	}
	
	/**
	 * remove the GUI focus from the stack
	 */
	this.blur = function()
	{
		self.unregister();
		mouseCatcher.style.cursor = "default";
		mouseCatcher.style.zIndex = 7;
		
		if ( cropBox ) cropBox.view.style.display = "none";
		
		return;
	}
	
	/**
	 * Get the stack window.
	 */
	this.getWindow = function() { return stackWindow; }
	
	/**
	 * Get the width of an image tile.
	 */
	this.getTileWidth = function(){ return X_TILE_SIZE; }
	
	/**
	 * Get the height of an image tile.
	 */
	this.getTileHeight = function(){ return Y_TILE_SIZE; }
	
	/**
	 * Get the current (x,y)-scale factor of the stack.
	 */
	this.getScale = function(){ return scale; }
	
	/**
	 * Get the number of tile columns.
	 */
	this.numTileColumns = function()
	{
		if ( tiles.length == 0 )
			return 0;
		else
			return tiles[ 0 ].length;
	}
	
	/**
	 * Get the number of tile rows.
	 */
	this.numTileColumns = function(){ return tiles.length; }
	
	/**
	 * Get the project.
	 */
	this.getProject = function(){ return project; }
	
	/**
	 * Get stack ID.
	 */
	this.getId = function(){ return id; }
	
	/**
	 * Get the stack resolution.
	 * 
	 * @return a copy of the private resolution parameter
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
	
	// initialise
	var self = this;
	if ( !ui ) ui = new UI();
	
	this.id = id;
	
	
	
	
	//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	// these parameters should be get dynamically from the server,
	// they define the size and resolution properties of the slice stack
	//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	
	//var Y_TILE_SIZE = parseInt( getPropertyFromCssRules( 3, 2, "height" ) );
	//var X_TILE_SIZE = parseInt( getPropertyFromCssRules( 3, 2, "width" ) );
	var Y_TILE_SIZE = 256;
	var X_TILE_SIZE = 256;
	
	var MAX_X = dimension.x - 1;   //!< the last possible x-coordinate
	var MAX_Y = dimension.y - 1;   //!< the last possible y-coordinate
	var MAX_Z = dimension.z - 1;   //!< the last possible z-coordinate
	
	//! estimate the zoom levels
	var MAX_S = 0;
	var min_max = Math.min( MAX_X, MAX_Y );
	var tile_size = Y_TILE_SIZE;
	if ( min_max == MAX_X ) tile_size = X_TILE_SIZE;
	while ( min_max / Math.pow( 2, MAX_S ) / tile_size > 3 )
		++MAX_S;
	
	//! all possible slices
	var slices = new Array();
	for ( var i = 0; i < dimension.z; ++i )
	{
		if ( !skip_planes[ i ] )
			slices.push( i );
	}
	
	//profiles have to be requested from the server as well
	var profiles = new Array();					//!< list of recent profiles
	//profiles[ 0 ] = new Profile();
	var spi = 0;								//!< selected profile index
	
	//-------------------------------------------------------------------------
	
	var transition = new Transition();
	
	// extract the borders of the viewer window from CSS rules
	var viewTop    = parseInt( getPropertyFromCssRules( 3, 0, "top" ) );
	var viewBottom = parseInt( getPropertyFromCssRules( 3, 0, "bottom" ) );
	var viewLeft   = parseInt( getPropertyFromCssRules( 3, 0, "left" ) );
	var viewRight  = parseInt( getPropertyFromCssRules( 3, 0, "right" ) );
	
	var tiles = new Array();
	
	var stackWindow = new CMWWindow( title );
	var view = stackWindow.getFrame();
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";
	view.appendChild( tilesContainer );
	
	//! mouse catcher
	var mouseCatcher = document.createElement( "div" );
	mouseCatcher.className = "sliceMouseCatcher";
	view.appendChild( mouseCatcher );
	
	stackWindow.addListener(
		function( callingWindow, signal )
		{
			alert( signal );
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
	
	var smallMap = new Overview( self, MAX_Y, MAX_X );
	view.appendChild( smallMap.getView() );
	
	var benchmark = document.createElement( "div" );
	benchmark.className = "sliceBenchmark";
	benchmark.appendChild( document.createElement( "p" ) );
	benchmark.firstChild.appendChild( document.createElement( "span" ) );
	benchmark.firstChild.firstChild.appendChild( document.createTextNode( "test" ) );
	view.appendChild( benchmark );
	
	var textlabels = new Array();
	
	var cropBox = false;
	
	// take care, that all values are within a proper range
	var z = 1;
	var y = Math.floor( MAX_Y / 2 );
	var x = Math.floor( MAX_X / 2 );
	var s = MAX_S;
	
	var old_z = -1;
	var old_y = y;
	var old_x = x;
	var old_s = s;
	
	var viewWidth;
	var viewHeight;
	
	var scale = 1 / Math.pow( 2, s );
	var old_scale = scale;
	
	var LAST_XT = Math.floor( MAX_X * scale / X_TILE_SIZE );
	var LAST_YT = Math.floor( MAX_Y * scale / Y_TILE_SIZE );
	
	var mode = "move";
	var show_textlabels = true;
	
	var registered = false;
	
	var slider_s;
	var slider_z;
	var input_x;
	var input_y;
	
	var slider_crop_top_z;
	var slider_crop_bottom_z;
	var slider_crop_s;
	var button_crop_apply;

	//self.setMode( "move" );
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
