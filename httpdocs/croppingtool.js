/**
 * croptool.js
 *
 * requirements:
 *	 tools.js
 *	 slider.js
 *	 stack.js
 */

/**
 * Crop tool. Allows cropping out a selected part of the stack.
 */
function CroppingTool()
{
	var self = this;
	this.stack = null;
	this.toolname = "croppingtool";
	this.topSlice = 0;
	this.bottomSlice = 0;
	this.cropBox = false;

	if ( !ui ) ui = new UI();

	// inputs for x, y, width and height of the crop box
	this.box_crop_x = document.getElementById( "box_crop_x" );
	this.box_crop_y = document.getElementById( "box_crop_y" );
	this.box_crop_w = document.getElementById( "box_crop_w" );
	this.box_crop_h = document.getElementById( "box_crop_h" );

	this.slider_crop_top_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ statusBar.replaceLast( "crop top z: " + val ); return; } );

	this.slider_crop_bottom_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ statusBar.replaceLast( "crop bottom z: " + val ); return; } );

	this.slider_crop_s = new Slider(
			SLIDER_HORIZONTAL,
			true,
			5,
			0,
			6,
			5,
			function( val ){ statusBar.replaceLast( "crop s: " + val ); } );

	var slider_crop_top_z_view = self.slider_crop_top_z.getView();
	slider_crop_top_z_view.id = "slider_crop_top_z";
	document.getElementById( "slider_crop_top_z" ).parentNode.replaceChild(
			slider_crop_top_z_view,
			document.getElementById( "slider_crop_top_z" ) );
	document.getElementById( "slider_crop_top_z" ).parentNode.replaceChild(
			self.slider_crop_top_z.getInputView(),
			slider_crop_top_z_view.nextSibling );

	var slider_crop_bottom_z_view = self.slider_crop_bottom_z.getView();
	slider_crop_bottom_z_view.id = "slider_crop_bottom_z";
	document.getElementById( "slider_crop_bottom_z" ).parentNode.replaceChild(
			slider_crop_bottom_z_view,
			document.getElementById( "slider_crop_bottom_z" ) );
	document.getElementById( "slider_crop_bottom_z" ).parentNode.replaceChild(
			self.slider_crop_bottom_z.getInputView(),
			slider_crop_bottom_z_view.nextSibling );

	var slider_crop_s_view = self.slider_crop_s.getView();
	slider_crop_s_view.id = "slider_crop_s";
	document.getElementById( "slider_crop_s" ).parentNode.replaceChild(
			slider_crop_s_view,
			document.getElementById( "slider_crop_s" ) );
	document.getElementById( "slider_crop_s" ).parentNode.replaceChild(
			self.slider_crop_s.getInputView(),
			slider_crop_s_view.nextSibling );

	this.button_crop_apply = document.getElementById( "button_crop_apply" );

	//! mouse catcher
	var mouseCatcher = document.createElement( "div" );
	mouseCatcher.className = "sliceMouseCatcher";
	mouseCatcher.style.cursor = "default";

	this.toPx = function( world_coord, resolution )
	{
		return world_coord / resolution * self.stack.scale;
	}

	this.toWorld = function( px_coord, resolution )
	{
		return px_coord / self.stack.scale * resolution;
	}

	this.getScreenLeft = function()
	{
		var stack = self.stack;
		return ( ( stack.x - stack.viewWidth / stack.scale / 2 ) + stack.translation.x ) * stack.resolution.x;
	}

	this.getScreenTop = function()
	{
		var stack = self.stack;
		return ( ( stack.y - stack.viewHeight / stack.scale / 2 ) + stack.translation.y ) * stack.resolution.y;
	}

	// Gets the bounding box of the current crop box in world
	// and pixel coordinates.
	this.getCropBoxBoundingBox = function()
	{
		var t = Math.min( self.cropBox.top, self.cropBox.bottom );
		var b = Math.max( self.cropBox.top, self.cropBox.bottom );
		var l = Math.min( self.cropBox.left, self.cropBox.right );
		var r = Math.max( self.cropBox.left, self.cropBox.right );
		var width = r - l;
		var height = b - t;
		//! left-most border of the view in physical project coordinates
		var screen_left = self.getScreenLeft();
		var screen_top = self.getScreenTop();

		var rx = self.stack.resolution.x / self.stack.scale;
		var ry = self.stack.resolution.y / self.stack.scale;

		var left_px = Math.floor( ( l - screen_left ) / rx );
		var top_px = Math.floor( ( t - screen_top ) / ry );
		var width_px = Math.floor( ( r - l ) / rx );
		var height_px = Math.floor( ( b - t ) / ry );
		var right_px = left_px + width_px;
		var bottom_px = top_px + height_px;

		return { left_world : l, top_world : t, right_world : r, bottom_world : b, width_world : width, height_world : height,
				 left_px : left_px, top_px : top_px, right_px : right_px, bottom_px : bottom_px, width_px : width_px, height_px : height_px }
	}

	// Updates the actual crop box.
	this.updateCropBox = function()
	{
		var cropBoxBB = self.getCropBoxBoundingBox();

		self.cropBox.view.style.left = cropBoxBB.left_px + "px";
		self.cropBox.view.style.top = cropBoxBB.top_px + "px";
		self.cropBox.view.style.width = cropBoxBB.width_px	+ "px";
		self.cropBox.view.style.height = cropBoxBB.height_px  + "px";

		statusBar.replaceLast( cropBoxBB.left_world.toFixed( 3 ) + ", " + cropBoxBB.top_world.toFixed( 3 ) + " -> " + cropBoxBB.right_world.toFixed( 3 ) + "," + cropBoxBB.bottom_world.toFixed( 3 ) );

		self.cropBox.text.replaceChild( document.createTextNode( cropBoxBB.width_world.toFixed( 3 ) + " x " + cropBoxBB.height_world.toFixed( 3 ) ), self.cropBox.text.firstChild );

		return;
	}

	// Updates UI elements like the the crop box input boxes.
	this.updateControls = function()
	{
		if ( self.cropBox )
		{
			var cropBoxBB = self.getCropBoxBoundingBox();
			self.box_crop_x.value = cropBoxBB.left_px;
			self.box_crop_y.value = cropBoxBB.top_px;
			self.box_crop_w.value = cropBoxBB.width_px;
			self.box_crop_h.value = cropBoxBB.height_px;
		}

		return;
	}

	this.resize = function( width, height )
	{
		self.mouseCatcher.style.width = width + "px";
		self.mouseCatcher.style.height = height + "px";
		return;
	}

	this.redraw = function()
	{
		// update crop box if available
		if ( self.cropBox )
			self.updateCropBox();
		self.updateControls();
	}

	var onmousedown = function( e )
	{
		var b = ui.getMouseButton( e );
		switch ( b )
		{
		case 2:
			ui.removeEvent( "onmousemove", onmousemove.crop );
			ui.removeEvent( "onmouseup", onmouseup );
			break;
		default:
			view = self.stack.getView();
			stack = self.stack;
			if ( self.cropBox )
			{
				view.removeChild( self.cropBox.view );
				delete self.cropBox;
				self.cropBox = false;
			}
			var m = ui.getMouse( e, self.stack.getView() );
			self.cropBox = {
				left : (stack.x + ( m.offsetX - stack.viewWidth / 2 ) / stack.scale ) * stack.resolution.x + stack.translation.x,
				top : (stack.y + ( m.offsetY - stack.viewHeight / 2 ) / stack.scale ) * stack.resolution.y + stack.translation.y
			};
			self.cropBox.right = self.cropBox.left;
			self.cropBox.bottom = self.cropBox.top;
			self.cropBox.view = document.createElement( "div" );
			self.cropBox.view.className = "cropBox";
			self.cropBox.text = document.createElement( "p" );
			self.cropBox.text.appendChild( document.createTextNode( "0 x 0" ) );
			self.cropBox.xdist = 0;
			self.cropBox.ydist = 0;
			self.cropBox.xorigin = self.cropBox.left;
			self.cropBox.yorigin = self.cropBox.top;

			self.cropBox.view.appendChild( self.cropBox.text );
			view.appendChild( self.cropBox.view );

			ui.registerEvent( "onmousemove", onmousemove.crop );
			ui.registerEvent( "onmouseup", onmouseup );
			ui.catchEvents( "crosshair" );
		}
		ui.onmousedown( e );

		//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
		document.body.firstChild.focus();

		return false;
	}

	var onmousemove =
	{
		pos : function ( e )
		{
			var xp;
			var yp;
			var m = ui.getMouse( e, self.stack.getView() );
			if ( m )
			{
				var s = self.stack;
				var pos_x = s.translation.x + ( s.x + ( m.offsetX - s.viewWidth / 2 ) / s.scale ) * s.resolution.x;
				var pos_y = s.translation.x + ( s.y + ( m.offsetY - s.viewHeight / 2 ) / s.scale ) * s.resolution.y;
				statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 3 ) + "]" );
			}
			return false;
		},
		crop : function( e )
		{
			if ( self.cropBox )
			{
				// adjust left and rigt component
				self.cropBox.xdist += ui.diffX;
				var xdist_world = self.toWorld( self.cropBox.xdist, self.stack.resolution.x );
				if (self.cropBox.xdist > 0)
				{
					self.cropBox.left = self.cropBox.xorigin;
					self.cropBox.right = self.cropBox.xorigin + xdist_world;
				}
				else
				{
					self.cropBox.left = self.cropBox.xorigin + xdist_world;
					self.cropBox.right = self.cropBox.xorigin;
				}

				// adjust top and bottom component
				self.cropBox.ydist += ui.diffY;
				var ydist_world = self.toWorld( self.cropBox.ydist, self.stack.resolution.y );
				if (self.cropBox.ydist > 0)
				{
					self.cropBox.top = self.cropBox.yorigin;
					self.cropBox.bottom = self.cropBox.yorigin + ydist_world;
				}
				else
				{
					self.cropBox.top = self.cropBox.yorigin + ydist_world;
					self.cropBox.bottom = self.cropBox.yorigin;
				}

				self.updateCropBox();
			}
			self.updateControls();
		}
	};

	var onmouseup = function ( e )
	{
		ui.releaseEvents();
		ui.removeEvent( "onmousemove", onmousemove.crop );
		ui.removeEvent( "onmouseup", onmouseup );
		self.updateControls();
	}

	var onmousewheel = function( e )
	{

	}

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
		self.topSlice = val;
		self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
		return;
	}

	this.changeBottomSlice = function( val )
	{

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
		self.stack.moveToPixel( self.stack.z, self.stack.y, self.stack.x, val );
		return;
	}

	/**
	 * change the scale, making sure that the point keep_[xyz] stays in
	 * the same position in the view
	 */
	this.scalePreservingLastPosition = function (keep_x, keep_y, sp) {
		var old_s = self.stack.s;
		var old_scale = self.stack.scale;
		var new_s = Math.max(0, Math.min(self.stack.MAX_S, Math.round(sp)));
		var new_scale = 1 / Math.pow(2, new_s);

		if (old_s == new_s)
			return;

		var dx = keep_x - self.stack.getProject().coordinates.x;
		var dy = keep_y - self.stack.getProject().coordinates.y;

		var new_centre_x = keep_x - dx * (old_scale / new_scale);
		var new_centre_y = keep_y - dy * (old_scale / new_scale);

		self.stack.moveTo(self.stack.getProject().coordinates.z, new_centre_y, new_centre_x, sp);
	}

	//--------------------------------------------------------------------------

	var changeCropBoxXByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) )
		{
			this.value = self.toPx( self.cropBox.left, self.stack.resolution.x );
		}
		else
		{
			var screen_left = self.getScreenLeft();
			var width_world = self.cropBox.right - self.cropBox.left;
			self.cropBox.left = self.toWorld( val, self.stack.resolution.x ) + screen_left;
			self.cropBox.right = self.cropBox.left + width_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxYByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) )
		{
			this.value = self.toPx( self.cropBox.left, self.stack.resolution.y );
		}
		else
		{
			var screen_top = self.getScreenTop();
			var height_world = self.cropBox.bottom - self.cropBox.top;
			self.cropBox.top = self.toWorld( val, self.stack.resolution.y ) + screen_top;
			self.cropBox.bottom = self.cropBox.top + height_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxWByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) )
		{
			var width_world = self.cropBox.right - self.cropBox.left;
			this.value = self.toPx( width_world, self.stack.resolution.x );
		}
		else
		{
			var width_world = self.toWorld( val, self.stack.resolution.x );
			self.cropBox.right = self.cropBox.left + width_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxHByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) )
		{
			var height_world = self.cropBox.bottom - self.cropBox.top;
			this.value = self.toPx( height_world, self.stack.resolution.y );
		}
		else
		{
			var height_world = self.toWorld( val, self.stack.resolution.y );
			self.cropBox.bottom = self.cropBox.top + height_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var cropBoxMouseWheel = function( e )
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
	 * crop a microstack by initiating a server backend
	 * @todo which has to be built
	 */
	var crop = function()
	{
		var zoom_level = self.slider_crop_s.val;
		var scale = 1 / Math.pow( 2, zoom_level );
		var stack = self.stack;
		var cb = self.cropBox;
		var numSections = Math.max( self.slider_crop_top_z.val, self.slider_crop_bottom_z.val ) - Math.min( self.slider_crop_top_z.val, self.slider_crop_bottom_z.val ) + 1;
		var pixelWidth = Math.round( ( Math.max( cb.left, cb.right ) - Math.min( cb.left, cb.right ) ) / stack.resolution.x * scale );
		var pixelHeight = Math.round( ( Math.max( cb.top, cb.bottom ) - Math.min( cb.top, cb.bottom ) ) / stack.resolution.y * scale );
		var z_min = self.slider_crop_top_z.val * stack.resolution.z + stack.translation.z;
		var z_max = self.slider_crop_bottom_z.val * stack.resolution.z + stack.translation.z;
		var zoom_level = self.slider_crop_s.val;
		var str = "The generated stack will have " + numSections + " sections.\n";
		str += "Each section will have a size of " + pixelWidth + "x" + pixelHeight + "px.\n";
		str += "Do you really want to crop this microstack?";

		if ( !window.confirm( str ) ) return false;

		var url = django_url + project.id + '/stack/' + stack.id + '/crop/' + cb.left + "," + cb.right + "/" + cb.top + "," + cb.bottom + "/" + z_min + "," + z_max + '/' + zoom_level + '/';
		requestQueue.register(url, 'GET', {}, handle_crop );
		return false;
	}

	/**
	 * handle the answer of a microstack crop request
	 * this answer is not the ready made microstack itself but a confirmation that the cropping process was invoked
	 */
	var handle_crop = function( status, text, xml )
	{
		if ( status = 200 )
		{
			statusBar.replaceLast( text );

			try
			{
				eval( "(" + text + ")" );
				alert( "Cropping the microstack...\nThis operation may take some time, you will be notified as soon as the cropped stack is ready." );
			}
			catch (e)
			{
				alert(e.message);
			}
		}
		return;
	}

	// Adds a mouse wheel listener to a component.
	this.addMousewheelListener = function( component, handler )
	{
		try
		{
			component.addEventListener( "DOMMouseScroll", handler, false );
		}
		catch ( error )
		{
			try
			{
				component.onmousewheel = handler;
			}
			catch ( error ) {}
		}

	}

	// Removes a mouse wheel listener from a component.
	this.removeMousewheelListener = function( component, handler )
	{
		try
		{
			component.removeEventListener( "DOMMouseScroll", handler, false );
		}
		catch ( error )
		{
			try
			{
				component.onmousewheel = null;
			}
			catch ( error ) {}
		}
	}

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
		/* It could happen that register is called on a different stack than
		the one the tool is currently installed for. In that case we need
		to destroy the previous link to a stack. */
		if ( self.stack )
			self.destroy();

		document.getElementById( "edit_button_crop" ).className = "button_active";
		document.getElementById( "toolbar_crop" ).style.display = "block";

		self.stack = parentStack;

		mouseCatcher.style.cursor = "crosshair";
		mouseCatcher.onmousedown = onmousedown;
		mouseCatcher.onmousemove = onmousemove.pos;

		try
		{
			mouseCatcher.addEventListener( "DOMMouseScroll", onmousewheel, false );
			/* Webkit takes the event but does not understand it ... */
			mouseCatcher.addEventListener( "mousewheel", onmousewheel, false );
		}
		catch ( error )
		{
			try
			{
				mouseCatcher.onmousewheel = onmousewheel;
			}
			catch ( error ) {}
		}

		self.stack.getView().appendChild( mouseCatcher );

		self.box_crop_x.onchange = changeCropBoxXByInput;
		self.addMousewheelListener( self.box_crop_x, cropBoxMouseWheel );
		self.box_crop_y.onchange = changeCropBoxYByInput;
		self.addMousewheelListener( self.box_crop_y, cropBoxMouseWheel );
		self.box_crop_w.onchange = changeCropBoxWByInput;
		self.addMousewheelListener( self.box_crop_w, cropBoxMouseWheel );
		self.box_crop_h.onchange = changeCropBoxHByInput;
		self.addMousewheelListener( self.box_crop_h, cropBoxMouseWheel );

		// initialize top and bottom z-index slider
		if ( self.stack.slices.length < 2 )	//!< hide the self.slider_z if there is only one slice
		{
			self.slider_crop_top_z.getView().parentNode.style.display = "none";
			self.slider_crop_bottom_z.getView().parentNode.style.display = "none";
		}
		else
		{
			self.slider_crop_top_z.getView().parentNode.style.display = "block";
			self.slider_crop_bottom_z.getView().parentNode.style.display = "block";
		}
		self.slider_crop_top_z.update(
			0,
			0,
			self.stack.slices,
			self.stack.z,
			self.changeSliceDelayed );

		self.slider_crop_bottom_z.update(
			0,
			0,
			self.stack.slices,
			self.stack.z,
			self.changeBottomSlice );

		// initialize zoom-level slider
		self.slider_crop_s.update(
			self.stack.MAX_S,
			0,
			(Math.abs(self.stack.MAX_S) + 1),
			self.stack.s,
			function( val ){ statusBar.replaceLast( "crop s: " + val ); },
			-1 );

		// initialize crop button
		self.button_crop_apply.onclick = crop;

		self.updateControls();

		return;
	}

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
		if ( self.stack && mouseCatcher.parentNode == self.stack.getView() )
			self.stack.getView().removeChild( mouseCatcher );

		document.getElementById( "edit_button_crop" ).className = "button";
		document.getElementById( "toolbar_crop" ).style.display = "none";

		return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
		self.unregister();

		if ( self.cropBox )
		{
			self.stack.getView().removeChild( self.cropBox.view );
			delete self.cropBox;
			self.cropBox = false;
		}

		self.box_crop_x.onchange = null;
		self.removeMousewheelListener( self.box_crop_x, cropBoxMouseWheel );
		self.box_crop_y.onchange = null;
		self.removeMousewheelListener( self.box_crop_y, cropBoxMouseWheel );
		self.box_crop_w.onchange = null;
		self.removeMousewheelListener( self.box_crop_w, cropBoxMouseWheel );
		self.box_crop_h.onchange = null;
		self.removeMousewheelListener( self.box_crop_h, cropBoxMouseWheel );

		self.slider_crop_top_z.update(
			0,
			1,
			undefined,
			0,
			null );

		self.slider_crop_bottom_z.update(
			0,
			1,
			undefined,
			0,
			null );

		self.slider_crop_s.update(
			0,
			1,
			undefined,
			0,
			null );

		self.stack = null;
		self.button_crop_apply.onclick = null;

		return;
	}

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */
	this.handleKeyPress = function( e ) {
		return false;
	}
}

