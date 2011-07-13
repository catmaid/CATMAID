/**
 * navigator.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 *   stack.js
 */

/**
 */

/**
 * Navigator tool.  Moves the stack around 
 */
function Navigator()
{
	var self = this;
	var stack = null;

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
	
	var updateControls = function()
	{
		slider_s.setByValue( stack.s, true );
		slider_z.setByValue( stack.z, true );

		input_x.value = stack.x;
		input_y.value = stack.y;
		
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
		stack.moveToPixel( stack.z, stack.y - ui.diffY / stack.scale, stack.x - ui.diffX / stack.scale, stack.s );
		updateControls();
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
			var xp = stack.x;
			var yp = stack.y;
			var m = ui.getMouse( e );
			var w = ui.getMouseWheel( e );
			if ( m )
			{
				xp = m.offsetX - stack.viewWidth / 2;
				yp = m.offsetY - stack.viewHeight / 2;
				//statusBar.replaceLast( ( m.offsetX - viewWidth / 2 ) + " " + ( m.offsetY - viewHeight / 2 ) );
			}
			if ( w )
			{
				if ( w > 0 )
				{
					if ( stack.s < stack.MAX_S )
					{
						stack.moveToPixel(
							stack.z,
							stack.y - Math.floor( yp / stack.scale ),
							stack.x - Math.floor( xp / stack.scale ),
							stack.s + 1 );
					}
				}
				else
				{
					if ( stack.s > 0 )
					{
						var ns = stack.scale * 2;
						self.moveToPixel(
							stack.z,
							stack.y + Math.floor( yp / ns ),
							stack.x + Math.floor( xp / ns ),
							stack.s - 1 );
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
		stack.moveToPixel( val, stack.y, stack.x, stack.s );
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
		stack.moveToPixel( stack.z, stack.y, stack.x, val );
    return;
	}

  /**
   * change the scale, making sure that the point keep_[xyz] stays in
   * the same position in the view
   */
  this.scalePreservingLastPosition = function (keep_x, keep_y, sp) {
    var old_s = stack.s;
    var old_scale = stack.scale;
    var new_s = Math.max(0, Math.min(stack.MAX_S, Math.round(sp)));
    var new_scale = 1 / Math.pow(2, new_s);

    if (old_s == new_s) return;

    var dx = keep_x - stack.getProject().coordinates.x;
    var dy = keep_y - stack.getProject().coordinates.y;

    var new_centre_x = keep_x - dx * (old_scale / new_scale);
    var new_centre_y = keep_y - dy * (old_scale / new_scale);

    stack.moveTo(stack.getProject().coordinates.z, new_centre_y, new_centre_x, sp);
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
	
	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
		document.getElementById( "edit_button_move" ).className = "button_active";
		document.getElementById( "toolbar_nav" ).style.display = "block";
		
		stack = parentStack;

		mouseCatcher.onmousedown = onmousedown;
		try
		{
			mouseCatcher.addEventListener( "DOMMouseScroll", onmousewheel.zoom, false );
			/* Webkit takes the event but does not understand it ... */
			mouseCatcher.addEventListener( "mousewheel", onmousewheel.zoom, false );
		}
		catch ( error )
		{
			try
			{
				mouseCatcher.onmousewheel = onmousewheel.zoom;
			}
			catch ( error ) {}
		}
		
		stack.getView().appendChild( mouseCatcher );

		slider_s.update(
			stack.MAX_S,
			0,
			stack.MAX_S + 1,
			stack.s,
			self.changeScaleDelayed );
		
		if ( stack.slices.length < 2 )	//!< hide the slider_z if there is only one slice
		{
			slider_z.getView().parentNode.style.display = "none";
		}
		else
		{
			slider_z.getView().parentNode.style.display = "block";
		}
		slider_z.update(
			0,
			0,
			stack.slices,
			stack.z,
			self.changeSliceDelayed );
		
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
		
		updateControls();
		
		return;
	}
	
	/**
	 * unregister all GUI control connections and event handlers
	 */
	this.unregister = function()
	{
		document.getElementById( "edit_button_move" ).className = "button";
		document.getElementById( "toolbar_nav" ).style.display = "none";
		
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

		try { stack.getView().removeChild( mouseCatcher ); } catch ( error ) {}

		return;
	}
}

