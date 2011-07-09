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
 * Navigator tool.  Moves the stack around 
 */
function NavigatorLayer(
		stack						//!< reference to the parent stack
		)
{
	var self = this;
	if ( !ui ) ui = new UI();
	
	var sliders_box = document.getElementById( "sliders_box" );
	var input_x = document.getElementById( "x" );		//!< x_input
	var input_y = document.getElementById( "y" );		//!< y_input
	
	/* remove all existing dimension sliders */
	while ( sliders_box.firstChild )
		sliders_box.removeChild( sliders_box.firstChild );
	
	var slider_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			388,
			388,
			1,
			function( val ){ statusBar.replaceLast( "z: " + val ); return; } );
	
	var slider_s = new Slider(
			SLIDER_HORIZONTAL,
			true,
			undefined,
			undefined,
			new Array(
				0,
				1,
				2,
				4,
				8 ),
			8,
			function( val ){ statusBar.replaceLast( "s: " + val ); } );
	
	var slider_z_box = document.createElement( "div" );
	slider_z_box.className = "box";
	slider_z_box.id = "slider_z_box";
	var slider_z_box_label = document.createElement( "p" );
	slider_z_box_label.appendChild( document.createTextNode( "z-index&nbsp;&nbsp;" ) );
	slider_z_box.appendChild( slider_z.getView() );
	slider_z_box.appendChild( slider_z.getInputView() );
	
	sliders_box.appendChild( slider_z_box );
	
	var slider_s_view = slider_s.getView();
	slider_s_view.id = "slider_s";
	document.getElementById( "slider_s" ).parentNode.replaceChild(
			slider_s_view,
			document.getElementById( "slider_s" ) );
	document.getElementById( "slider_s" ).parentNode.replaceChild(
			slider_s.getInputView(),
			slider_s_view.nextSibling );
			
	//! mouse catcher
	var mouseCatcher = document.createElement( "div" );
	mouseCatcher.className = "sliceMouseCatcher";
	stack.getView().appendChild( mouseCatcher );
	
	var updateControls = function()
	{
		slider_s.setByValue( s, true );
		slider_z.setByValue( z, true );

		input_x.value = x;
		input_y.value = y;
		
		return;
	}
	
	this.resize = function( width, height )
	{
		mouseCatcher.style.width = width + "px";
		mouseCatcher.style.height = height + "px";
		return;
	}
	
	this.redraw = function()
	{
		updateControls();
	}
	
	var onmousemove = function( e )
	{
		self.moveToPixel( z, y - ui.diffY / scale, x - ui.diffX / scale, s );
		return false;
	};
	
	var onmouseup = function( e )
	{
		ui.releaseEvents()
		ui.removeEvent( "onmousemove", onmousemove );
		ui.removeEvent( "onmouseup", onmouseup );
		return false;
	};
	
	var onmousedown = function( e )
	{
		ui.registerEvent( "onmousemove", onmousemove );
		ui.registerEvent( "onmouseup", onmouseup );
		ui.catchEvents( "move" );
		ui.onmousedown( e );
		
		ui.catchFocus();
		
		return false;
	};
	
	var onmousewheel = function( e )
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
	};

/*	
	var onmousewheel = function( e )
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
	};
*/
	
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
		stack.moveToPixel( val, y, x, s );
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
		stack.moveToPixel( z, y, x, val );
		return;
	}
	//--------------------------------------------------------------------------
	
	var changeXByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = stack.x;
		else stack.moveToPixel( stack.z, stack.y, val, stack.s );
		return;
	}
	
	var changeYByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = stack.y;
		else stack.moveToPixel( stack.z, val, stack.x, stack.s );
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
			stack.MAX_S,
			0,
			stack.MAX_S + 1,
			stack.s,
			this.changeScaleDelayed );
		
		if ( stack.slices.length < 2 )	//!< hide the slider_z if there is only one slice
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
			stack.slices,
			stack.z,
			this.changeSliceDelayed );
		slider_crop_top_z.update(
			0,
			0,
			stack.slices,
			stack.z,
			this.changeSliceDelayed );
		slider_crop_bottom_z.update(
			0,
			0,
			stack.slices,
			stack.z,
			this.changeSliceDelayed );
		
		/**
		 * Cropping is possible with an attached TrakEM2 project only.
		 */
		if ( stack.trakem2_project )
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
}

