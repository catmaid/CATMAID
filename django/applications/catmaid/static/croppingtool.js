/**
 * croptool.js
 *
 * requirements:
 *	 tools.js
 *	 boxselectiontool.js
 *	 slider.js
 *	 stack.js
 */

/**
 * Cropping tool. It adds some GUI components to the box
 * selection tool and allows to crop the selected region.
 */
function CroppingTool() {
	// call super constructor
	BoxSelectionTool.call( this );

	var self = this;
	this.toolname = "croppingtool";

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

	//! stacks menu
	this.stacks_menu = new Menu();
	this.stacks_to_crop = null;

	//! RGB slices/single channel checkbox
	this.check_rgb_slices = document.getElementById( "check_crop_rgb_slices" );

	this.button_crop_apply = document.getElementById( "button_crop_apply" );

	//! mouse catcher
	this.mouseCatcher = document.createElement( "div" );
	this.mouseCatcher.className = "sliceMouseCatcher";
	this.mouseCatcher.style.cursor = "default";

	/**
	 * Creates the URL that invokes the cropping job.
	 */
	this.get_crop_url = function()
	{
		var stacks = "";
		var nStacks = 0;
		for (var s in self.stacks_to_crop)
		{
			var stack = self.stacks_to_crop[ s ];
			if ( stack.marked )
			{
				if ( nStacks > 0 )
					stacks += ","
				stacks += stack.data.id.toString()
				nStacks++;
			}
		}

		var zoom_level = self.slider_crop_s.val;
		var scale = 1 / Math.pow( 2, zoom_level );
		var stack = self.stack;
		var cb = self.getCropBox();
		var numSections = Math.max( self.slider_crop_top_z.val, self.slider_crop_bottom_z.val ) - Math.min( self.slider_crop_top_z.val, self.slider_crop_bottom_z.val ) + 1;
		var pixelWidth = Math.round( ( Math.max( cb.left, cb.right ) - Math.min( cb.left, cb.right ) ) / stack.resolution.x * scale );
		var pixelHeight = Math.round( ( Math.max( cb.top, cb.bottom ) - Math.min( cb.top, cb.bottom ) ) / stack.resolution.y * scale );
		var z_min = self.slider_crop_top_z.val * stack.resolution.z + stack.translation.z;
		var z_max = self.slider_crop_bottom_z.val * stack.resolution.z + stack.translation.z;
		var zoom_level = self.slider_crop_s.val;
		var single_channels = self.check_rgb_slices.val ? 0 : 1;

		var str = "The generated stack will have " + nStacks + " channel(s) with " + numSections + " section(s) each.\n";
		str += "Each section will have a size of " + pixelWidth + "x" + pixelHeight + "px.\n";
		str += "Do you really want to crop this microstack?";

		if ( !window.confirm( str ) ) return false;

		var url = django_url + project.id + '/stack/' + stacks + '/crop/' + cb.left + "," + cb.right + "/" + cb.top + "," + cb.bottom + "/" + z_min + "," + z_max + '/' + zoom_level + '/' + single_channels + '/';
		return url;
	}

	/**
	 * crop a microstack by initiating a server backend
	 * @todo which has to be built
	 */
	var crop = function()
	{
		var url = self.get_crop_url();
		if (url)
		{
			requestQueue.register(url, 'GET', {}, handle_crop );
		}
		return false;
	}

	/**
	 * Handle the response of a microstack crop request. This answer is not the
	 * ready made microstack itself but a confirmation that the cropping
	 * process was invoked
	 */
	var handle_crop = function( status, text, xml )
	{
		if ( status == 200 )
		{
			var e = $.parseJSON(text);

			if (e.error)
			{
				alert( e.error );
			}
			else
			{
				statusBar.replaceLast( text );
				alert( "Cropping the microstack...\nThis operation may take some time, you will be notified as soon as the cropped stack is ready." );
			}
		} else {
			alert( "The server returned an unexpected response (status: " + status + "):\n" + text );
		}
		return;
	}

	// Updates UI elements like the the crop box input boxes.
	this.updateControls = function()
	{
		if ( self.getCropBox() )
		{
			var cropBoxBB = self.getCropBoxBoundingBox();
			self.box_crop_x.value = cropBoxBB.left_px;
			self.box_crop_y.value = cropBoxBB.top_px;
			self.box_crop_w.value = cropBoxBB.width_px;
			self.box_crop_h.value = cropBoxBB.height_px;
		}

		return;
	}

	this.redraw = function()
	{
		// call register of super class
		CroppingTool.superproto.redraw.call( self );
		self.updateControls();
	}

	/**
	 * This methods gets the related stacks of the current project and creates
	 * a menu if there is more than one stack in total. The menu is meant to
	 * select the stacks that get cropped to the output file.
	 */
	this.updateStacksMenu = function()
	{
		// only create and show the menu when there is more than one stack
		if (self.stacks_to_crop.length > 1)
		{
			var current_menu_content = new Array();
			for (var s in self.stacks_to_crop)
			{
				var stack = self.stacks_to_crop[ s ];
				var stack_title = stack.data.title;
				if ( stack.marked )
				{
					// mark a stack to crop with a check
					var check_sym = unescape( "%u2714" );
					stack_title = check_sym + " " + stack_title;
				}
				else
				{
					// Two EN-Spaces are used to fill the space where
					// the check could reside.
					var space_sym = unescape( "%u2002" );
					stack_title = space_sym + space_sym + stack_title;
				}
				current_menu_content.push(
					{
						id : stack.data.id,
						title : stack_title,
						note : "", // alternative: stack.note
						action : (function(curr_stack) { return function()
							{
								// Toggle the check state. To do this, two
								// closures had to be used.
								curr_stack.marked = ! curr_stack.marked;
								self.updateStacksMenu();
							}
						})(stack)
					}
				);
			}
			self.stacks_menu.update( current_menu_content );
			document.getElementById( "crop_stacks_menu_box" ).style.display = "block";
		}
		else
		{
			self.stacks_menu.update();
			document.getElementById( "crop_stacks_menu_box" ).style.display = "none";
		}
		document.getElementById( "crop_stacks_menu" ).appendChild( self.stacks_menu.getView() );
	}

	this.resize = function( width, height )
	{
		self.mouseCatcher.style.width = width + "px";
		self.mouseCatcher.style.height = height + "px";
		return;
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
		//self.stack.moveToPixel( self.stack.z, self.stack.y, self.stack.x, val );
		if ( self.getCropBox() )
			self.updateCropBox();
		statusBar.replaceLast( "crop s: " + val );
		self.zoomlevel = val;
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
		var cropBox = self.getCropBox();

		if ( isNaN( val ) )
		{
			this.value = self.toPx( cropBox.left, self.stack.resolution.x );
		}
		else
		{
			var screen_left = self.getScreenLeft();
			var width_world = cropBox.right - cropBox.left;
			cropBox.left = self.toWorld( val, self.stack.resolution.x ) + screen_left;
			cropBox.right = cropBox.left + width_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxYByInput = function( e )
	{
		var val = parseInt( this.value );
		var cropBox = self.getCropBox();

		if ( isNaN( val ) )
		{
			this.value = self.toPx( cropBox.left, self.stack.resolution.y );
		}
		else
		{
			var screen_top = self.getScreenTop();
			var height_world = cropBox.bottom - cropBox.top;
			cropBox.top = self.toWorld( val, self.stack.resolution.y ) + screen_top;
			cropBox.bottom = cropBox.top + height_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxWByInput = function( e )
	{
		var val = parseInt( this.value );
		var cropBox = self.getCropBox();

		if ( isNaN( val ) )
		{
			var width_world = cropBox.right - cropBox.left;
			this.value = self.toPx( width_world, self.stack.resolution.x );
		}
		else
		{
			var width_world = self.toWorld( val, self.stack.resolution.x );
			cropBox.right = cropBox.left + width_world;
			self.updateCropBox();
			self.updateControls();
		}
		return;
	}

	var changeCropBoxHByInput = function( e )
	{
		var val = parseInt( this.value );
		var cropBox = self.getCropBox();

		if ( isNaN( val ) )
		{
			var height_world = cropBox.bottom - cropBox.top;
			this.value = self.toPx( height_world, self.stack.resolution.y );
		}
		else
		{
			var height_world = self.toWorld( val, self.stack.resolution.y );
			cropBox.bottom = cropBox.top + height_world;
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
			var m = ui.getMouse( e, self.stack.getView() );
			self.createCropBox( m.offsetX, m.offsetY );

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
				statusBar.replaceLast( "[" + self.convertWorld( pos_x ).toFixed( 3 ) + ", " + self.convertWorld( pos_y ).toFixed( 3 ) + "]" );
			}
			return false;
		},
		crop : function( e )
		{
			var cropBox = self.getCropBox();

			if ( cropBox )
			{
				// adjust left and rigt component
				cropBox.xdist += ui.diffX;
				var xdist_world = self.toWorld( cropBox.xdist, self.stack.resolution.x );
				if ( cropBox.xdist > 0 )
				{
					cropBox.left = cropBox.xorigin;
					cropBox.right = cropBox.xorigin + xdist_world;
				}
				else
				{
					cropBox.left = cropBox.xorigin + xdist_world;
					cropBox.right = cropBox.xorigin;
				}

				// adjust top and bottom component
				cropBox.ydist += ui.diffY;
				var ydist_world = self.toWorld( cropBox.ydist, self.stack.resolution.y );
				if ( cropBox.ydist > 0 )
				{
					cropBox.top = cropBox.yorigin;
					cropBox.bottom = cropBox.yorigin + ydist_world;
				}
				else
				{
					cropBox.top = cropBox.yorigin + ydist_world;
					cropBox.bottom = cropBox.yorigin;
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
		// call register of super class (updates also stack member)
		CroppingTool.superproto.register.call( self, parentStack );

		// initialize the stacks we offer to crop
		var project = self.stack.getProject();
		var stacks = projects_available[project.id];
		self.stacks_to_crop = new Array();
		for ( var s in stacks )
		{
			// By default, mark only the current stack to be cropped
			self.stacks_to_crop.push(
				{
					data : stacks[ s ],
					marked : ( s == self.stack.getId() )
				}
			);
		}

		document.getElementById( "edit_button_crop" ).className = "button_active";
		document.getElementById( "toolbar_crop" ).style.display = "block";

		self.mouseCatcher.style.cursor = "crosshair";
		self.mouseCatcher.onmousedown = onmousedown;
		self.mouseCatcher.onmousemove = onmousemove.pos;

		try
		{
			self.mouseCatcher.addEventListener( "DOMMouseScroll", onmousewheel, false );
			/* Webkit takes the event but does not understand it ... */
			self.mouseCatcher.addEventListener( "mousewheel", onmousewheel, false );
		}
		catch ( error )
		{
			try
			{
				self.mouseCatcher.onmousewheel = onmousewheel;
			}
			catch ( error ) {}
		}

		self.stack.getView().appendChild( self.mouseCatcher );

		self.box_crop_x.onchange = changeCropBoxXByInput;
		self.addMousewheelListener( self.box_crop_x, cropBoxMouseWheel );
		self.box_crop_y.onchange = changeCropBoxYByInput;
		self.addMousewheelListener( self.box_crop_y, cropBoxMouseWheel );
		self.box_crop_w.onchange = changeCropBoxWByInput;
		self.addMousewheelListener( self.box_crop_w, cropBoxMouseWheel );
		self.box_crop_h.onchange = changeCropBoxHByInput;
		self.addMousewheelListener( self.box_crop_h, cropBoxMouseWheel );

		self.box_crop_x.parentNode.parentNode.style.display = "block";
		self.box_crop_y.parentNode.parentNode.style.display = "block";
		self.box_crop_w.parentNode.parentNode.style.display = "block";
		self.box_crop_h.parentNode.parentNode.style.display = "block";

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
			self.changeScale,
			-1);

		// initialize the stacks menu
		self.updateStacksMenu();

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
		if ( self.stack && self.mouseCatcher.parentNode == self.stack.getView() )
			self.stack.getView().removeChild( self.mouseCatcher );

		return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
		self.unregister();

		document.getElementById( "edit_button_crop" ).className = "button";
		document.getElementById( "toolbar_crop" ).style.display = "none";

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

		self.stacks_menu.update();

		self.button_crop_apply.onclick = null;

		// call destroy of super class
		CroppingTool.superproto.destroy.call( self );

		return;
	}

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */
	this.handleKeyPress = function( e ) {
		return false;
	}
}
extend( CroppingTool, BoxSelectionTool );

