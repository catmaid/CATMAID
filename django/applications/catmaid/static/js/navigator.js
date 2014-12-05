/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
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
	this.stack = null;
	this.toolname = "navigator";

	if ( !ui ) ui = new UI();

	var sliders_box = document.getElementById( "sliders_box" );
	this.input_x = document.getElementById( "x" );		//!< x_input
	this.input_y = document.getElementById( "y" );		//!< y_input
	this.checkbox_reflines = document.getElementById( "displayreflines" );

	// Last mouse position for proper zoom with + and -
	var lastX = 0, lastY = 0;
	
	/* remove all existing dimension sliders */
	while ( sliders_box.firstChild )
		sliders_box.removeChild( sliders_box.firstChild );
	
	this.slider_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			388,
			388,
			1,
			function( val ){ statusBar.replaceLast( "z: " + val ); return; } );
	
	this.slider_s = new Slider(
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
			function( val ){ statusBar.replaceLast( "s: " + val ); },
			undefined,
			false );
	
	var slider_z_box = document.createElement( "div" );
	slider_z_box.className = "box";
	slider_z_box.id = "slider_z_box";
	var slider_z_box_label = document.createElement( "p" );
	slider_z_box_label.appendChild( document.createTextNode( "z-index" ) );
    slider_z_box.appendChild( slider_z_box_label );
	slider_z_box.appendChild( self.slider_z.getView() );
	slider_z_box.appendChild( self.slider_z.getInputView() );
	
	sliders_box.appendChild( slider_z_box );
	
	var slider_s_view = self.slider_s.getView();
	slider_s_view.id = "slider_s";
	document.getElementById( "slider_s" ).parentNode.replaceChild(
			slider_s_view,
			document.getElementById( "slider_s" ) );
	document.getElementById( "slider_s" ).parentNode.replaceChild(
			self.slider_s.getInputView(),
			slider_s_view.nextSibling );
			
	//! mouse catcher
	this.mouseCatcher = document.createElement( "div" );
	self.mouseCatcher.className = "sliceMouseCatcher";

	this.setMouseCatcher = function( mc )
	{
		self.mouseCatcher = mc;
	};
	
	this.updateControls = function()
	{
		self.slider_s.setByValue( self.stack.s, true );
		self.slider_z.setByValue( self.stack.z, true );

		self.input_x.value = self.stack.x;
		self.input_y.value = self.stack.y;
		
		return;
	};
	
	this.resize = function( width, height )
	{
		self.mouseCatcher.style.width = width + "px";
		self.mouseCatcher.style.height = height + "px";
		return;
	};
	
	this.redraw = function()
	{
		self.updateControls();
	};
	
	var onmousemove = function( e )
	{
		self.lastX = self.stack.x + ui.diffX; // TODO - or + ?
		self.lastY = self.stack.y + ui.diffY;
		self.stack.moveToPixel(
			self.stack.z,
			self.stack.y - ui.diffY / self.stack.scale,
			self.stack.x - ui.diffX / self.stack.scale,
			self.stack.s );
		return true;
	};
	
	var onmouseup = function( e )
	{
		ui.releaseEvents(); 
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
				self.slider_z.move( 1 );
			}
			else
			{
				self.slider_z.move( -1 );
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
        		w = self.stack.inverse_mouse_wheel * w;
				if ( w > 0 )
				{
          if( e.shiftKey ) {
            self.slider_z.move( 10 );
          } else {
            self.slider_z.move( 1 );
          }
				}
				else
				{
          if( e.shiftKey ) {
            self.slider_z.move( -10 );
          } else {
            self.slider_z.move( -1 );
          }

				}
			}
			return false;
		},
		move : function( e )
		{
			var xp = self.stack.x;
			var yp = self.stack.y;
			var m = ui.getMouse( e, self.stack.getView() );
			var w = ui.getMouseWheel( e );
			if ( m )
			{
				xp = m.offsetX - self.stack.viewWidth / 2;
				yp = m.offsetY - self.stack.viewHeight / 2;
				//statusBar.replaceLast( ( m.offsetX - viewWidth / 2 ) + " " + ( m.offsetY - viewHeight / 2 ) );
			}
			if ( w )
			{
				if ( w > 0 )
				{
					if ( self.stack.s < self.stack.MAX_S )
					{
						self.stack.moveToPixel(
							self.stack.z,
							self.stack.y - Math.floor( yp / self.stack.scale ),
							self.stack.x - Math.floor( xp / self.stack.scale ),
							self.stack.s + 1 );
					}
				}
				else
				{
					if ( self.stack.s > 0 )
					{
						var ns = self.stack.scale * 2;
						self.moveToPixel(
							self.stack.z,
							self.stack.y + Math.floor( yp / ns ),
							self.stack.x + Math.floor( xp / ns ),
							self.stack.s - 1 );
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
	};
	
	this.changeSliceDelayed = function( val )
	{
		if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
		changeSliceDelayedParam = { z : val };
		changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
	};
	
	this.changeSlice = function( val )
	{
		self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
		return;
	};
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
	};
	
	this.changeScaleDelayed = function( val )
	{
		if ( changeScaleDelayedTimer ) window.clearTimeout( changeScaleDelayedTimer );
		changeScaleDelayedParam = { s : val };
		changeScaleDelayedTimer = window.setTimeout( changeScaleDelayedAction, 100 );
	};
	
	this.changeScale = function( val )
	{
		self.stack.moveToPixel( self.stack.z, self.stack.y, self.stack.x, val );
		return;
	};

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
	};

	//--------------------------------------------------------------------------
	
	var changeXByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = self.stack.x;
		else self.stack.moveToPixel( self.stack.z, self.stack.y, val, self.stack.s );
		return;
	};
	
	var changeYByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = self.stack.y;
		else self.stack.moveToPixel( self.stack.z, val, self.stack.x, self.stack.s );
		return;
	};
	
	var YXMouseWheel = function( e )
	{
		var w = ui.getMouseWheel( e );
		if ( w )
		{
			this.value = parseInt( this.value ) - w;
			this.onchange();
		}
		return false;
	};

	this.getActions = function () {
		return actions;
	};

	var arrowKeyCodes = {
		left: 37,
		up: 38,
		right: 39,
		down: 40
	};

	var actions = [

		new Action({
			helpText: "Zoom in (smaller increments with Shift held)",
			keyShortcuts: {
				'+': [ 43, 107, 61, 187 ]
			},
			run: function (e) {
				self.slider_s.move(1, !e.shiftKey);
				return true;
			}
		}),

		new Action({
			helpText: "Zoom out (smaller increments with Shift held)",
			keyShortcuts: {
				'-': [ 45, 109, 173, 189 ]
			},
			run: function (e) {
				self.slider_s.move(-1, !e.shiftKey);
				return true;
			}
		}),

		new Action({
			helpText: "Move up 1 slice in z (or 10 with Shift held)",
			keyShortcuts: {
				',': [ 44, 188 ]
			},
			run: function (e) {
				self.slider_z.move(-(e.shiftKey ? 10 : 1));
				return true;
			}
		}),

		new Action({
			helpText: "Move down 1 slice in z (or 10 with Shift held)",
			keyShortcuts: {
				'.': [ 190 ]
			},
			run: function (e) {
				self.slider_z.move((e.shiftKey ? 10 : 1));
				return true;
			}
		}),
		
		new Action({
			helpText: "Move left (towards negative x, faster with Shift held)",
			keyShortcuts: {
				"\u2190": [ arrowKeyCodes.left ]
			},
			run: function (e) {
				self.input_x.value = parseInt(self.input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
				self.input_x.onchange(e);
				return true;
			}
		}),

		new Action({
			helpText: "Move right (towards positive x, faster with Shift held)",
			keyShortcuts: {
				"\u2192": [ arrowKeyCodes.right ]
			},
			run: function (e) {
				self.input_x.value = parseInt(self.input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
				self.input_x.onchange(e);
				return true;
			}
		}),

		new Action({
			helpText: "Move up (towards negative y, faster with Shift held)",
			keyShortcuts: {
				"\u2191": [ arrowKeyCodes.up ]
			},
			run: function (e) {
				self.input_y.value = parseInt(self.input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
				self.input_y.onchange(e);
				return true;
			}
		}),

		new Action({
			helpText: "Move down (towards positive y, faster with Shift held)",
			keyShortcuts: {
				"\u2193": [ arrowKeyCodes.down ]
			},
			run: function (e) {
				self.input_y.value = parseInt(self.input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
				self.input_y.onchange(e);
				return true;
			}
		}),

		new Action({
			helpText: "Hide all layers except image tile layer (while held)",
			keyShortcuts: {
				"SPACE": [ 32 ]
			},
			run: function (e) {
				// Avoid repeated onkeydown events in some browsers.
				if (self.hideLayersHeld) return;
				self.hideLayersHeld = true;

				// Hide any visible layers (besides the tile layer).
				var layers = self.stack.getLayers();
				var layerOpacities = Object.keys(layers).reduce(function (opacities, k) {
					if (k !== 'TileLayer') {
						opacities[k] = layers[k].getOpacity();
						layers[k].setOpacity(0);
					}
					return opacities;
				}, {});

				// Set a key up a listener to make these layers visible again
				// when the key is released.
				var target = e.target;
				var oldListener = target.onkeyup;
				target.onkeyup = function (e) {
					if (e.keyCode == 32) {
						Object.keys(layerOpacities).forEach(function (k) {
							layers[k].setOpacity(layerOpacities[k]);
						});
						target.onkeyup = oldListener;
						self.hideLayersHeld = false;
					} else if (oldListener) oldListener(e);
				};
				return true;
			}
		})];

	var keyCodeToAction = getKeyCodeToActionMap(actions);

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack, buttonName )
	{
		document.getElementById( typeof buttonName == "undefined" ? "edit_button_move" : buttonName ).className = "button_active";
		document.getElementById( "toolbar_nav" ).style.display = "block";
		
		self.stack = parentStack;

		self.mouseCatcher.onmousedown = onmousedown;
		try
		{
			self.mouseCatcher.addEventListener( "DOMMouseScroll", onmousewheel.zoom, false );
			/* Webkit takes the event but does not understand it ... */
			self.mouseCatcher.addEventListener( "mousewheel", onmousewheel.zoom, false );
		}
		catch ( error )
		{
			try
			{
				self.mouseCatcher.onmousewheel = onmousewheel.zoom;
			}
			catch ( error ) {}
		}
		
		self.stack.getView().appendChild( self.mouseCatcher );

		self.slider_s.update(
			self.stack.MAX_S,
			self.stack.MIN_S,
			{ major: (Math.abs(self.stack.MAX_S) + Math.abs(self.stack.MIN_S)) + 1,
			  minor: (Math.abs(self.stack.MAX_S) + Math.abs(self.stack.MIN_S))*10 + 1 },
			self.stack.s,
			self.changeScaleDelayed,
			-0.01);
		
		if ( self.stack.slices.length < 2 )	//!< hide the self.slider_z if there is only one slice
		{
			self.slider_z.getView().parentNode.style.display = "none";
		}
		else
		{
			self.slider_z.getView().parentNode.style.display = "block";
		}
		self.slider_z.update(
			undefined,
			undefined,
			{ major: self.stack.slices.filter(function(el,ind,arr) { return (ind % 10) === 0; }),
			  minor: self.stack.slices },
			self.stack.z,
			self.changeSliceDelayed );
		
		self.input_x.onchange = changeXByInput;
		try
		{
			self.input_x.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				self.input_x.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}
		
		self.input_y.onchange = changeYByInput;
		try
		{
			self.input_y.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				self.input_y.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}

		self.checkbox_reflines.checked = userprofile.display_stack_reference_lines;
		self.checkbox_reflines.onchange = function( e )
		{
			// Save current user profile state
			userprofile.display_stack_reference_lines = this.checked;
			userprofile.saveAll(
					(function() {
						// Success, toggle lines
						self.stack.showReferenceLines( this.checked );
					}).bind(this),
					(function() {
						// Error, reset checkbox
						this.checked = !this.checked;
					}).bind(this));

			return true;
		};
		
		self.updateControls();
		
		return;
	};
	
	
	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
		if ( self.stack && self.mouseCatcher.parentNode == self.stack.getView() )
			self.stack.getView().removeChild( self.mouseCatcher );
		return;
	};
	
	
	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function( buttonName )
	{
		self.unregister();
		
		document.getElementById( typeof buttonName == "undefined" ? "edit_button_move" : buttonName ).className = "button";
		document.getElementById( "toolbar_nav" ).style.display = "none";
		
		self.slider_s.update(
			0,
			1,
			undefined,
			0,
			null );
		
		self.slider_z.update(
			0,
			1,
			undefined,
			0,
			null );
		
		self.input_x.onchange = null;
		try
		{
			self.input_x.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				self.input_x.onmousewheel = null;
			}
			catch ( error ) {}
		}
		
		self.input_y.onchange = null;
		try
		{
			self.input_y.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				self.input_y.onmousewheel = null;
			}
			catch ( error ) {}
		}
		
		self.checkbox_reflines.onchange = null;

		self.stack = null;
		
		return;
	};

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */

	this.handleKeyPress = function( e ) {
		var keyAction = keyCodeToAction[e.keyCode];
		if (keyAction) {
			keyAction.run(e);
			return true;
		} else {
			return false;
		}
	};
}
