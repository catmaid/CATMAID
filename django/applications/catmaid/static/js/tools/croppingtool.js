/**
 * croptool.js
 *
 * requirements:
 *	 tools.js
 *	 roitool.js
 *	 slider.js
 *	 stack.js
 */

/**
 * Cropping tool. It adds some GUI components to the roi tool
 * and allows to crop the selected region.
 */
function CroppingTool() {
	// call super constructor
	RoiTool.call( this );

	var self = this;
	this.toolname = "croppingtool";

	this.slider_crop_top_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ CATMAID.statusBar.replaceLast( "crop top z: " + val ); return; } );

	this.slider_crop_bottom_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ CATMAID.statusBar.replaceLast( "crop bottom z: " + val ); return; } );

	this.slider_crop_s = new Slider(
			SLIDER_HORIZONTAL,
			true,
			5,
			0,
			6,
			5,
			function( val ){ CATMAID.statusBar.replaceLast( "crop s: " + val ); } );

	// Obtain a reference to the RoiTool toolbar button
	var toolbar = document.getElementById("toolbar_roi");
	var toolbar_button = document.getElementById("button_roi_apply").parentNode;

	// Keep a list of added elements
	var added_elements = [];

	// A procedure to create a toolbar box
	var create_tb_box = function()
	{
		var container = document.createElement("div");
		container.setAttribute("class", "box");
		return container;
	};

	// A procedure to add containers for extra sliders
	var create_slider_box = function(name, text, slider) {
		var p = document.createElement("p");
		p.innerHTML = text;
		// fill container
		var container = create_tb_box();
		container.appendChild(p);
		container.appendChild(slider.getView());
		container.appendChild(slider.getInputView());
		// add container to the toolbar
		toolbar.insertBefore(container, toolbar_button);
		added_elements.push(container);
	};

	create_slider_box( "slider_crop_top_z", "top z-index",
		this.slider_crop_top_z );
	create_slider_box( "slider_crop_bottom_z", "bottom z-index",
		this.slider_crop_bottom_z );
	create_slider_box( "slider_crop_s", "zoom-level",
		this.slider_crop_s );

	// Make sliders a bit smaller to save space
	var new_width = 80;
	this.slider_crop_top_z.resize(new_width);
	this.slider_crop_bottom_z.resize(new_width);
	this.slider_crop_s.resize(new_width);

	//! stacks menu
	this.stacks_menu = new Menu();
	this.stacks_to_crop = null;
	var stacks_container = create_tb_box();
	stacks_container.setAttribute("id", "crop_stacks_menu_box");
	var stacks_menu_item = document.createElement("div");
	stacks_menu_item.setAttribute("class", "menu_item");
	stacks_menu_item.setAttribute("style", "float:left");
	stacks_menu_item.onmouseover = function() {
		this.lastChild.style.display = 'block';
	};
	stacks_menu_item.onmouseout = function() {
		this.lastChild.style.display = 'none';
	};
	var stacks_p = document.createElement("p");
	var stacks_a = document.createElement("a");
	stacks_a.innerHTML = "Stacks";
	var stacks_menu_pulldown = document.createElement("div");
	stacks_menu_pulldown.setAttribute("class", "pulldown");
	stacks_menu_pulldown.setAttribute("id", "crop_stacks_menu");
	// fill containers
	stacks_p.appendChild(stacks_a);
	stacks_menu_item.appendChild(stacks_p);
	stacks_menu_item.appendChild(stacks_menu_pulldown);
	stacks_container.appendChild(stacks_menu_item);
	// add container to the toolbar
	toolbar.insertBefore(stacks_container, toolbar_button);
	added_elements.push(stacks_container);

	//! RGB slices/single channel checkbox
	var rgb_slices_container = create_tb_box();
	var rgb_slices_p1 = document.createElement("p");
	var rgb_slices_label = document.createElement("label");
	rgb_slices_label.setAttribute("for", "check_crop_rgb_slices");
	rgb_slices_label.innerHTML = "RGB slices";
	rgb_slices_p1.appendChild(rgb_slices_label);
	this.check_rgb_slices = document.createElement("input");
	this.check_rgb_slices.setAttribute("type", "checkbox");
	this.check_rgb_slices.setAttribute("id", "check_crop_rgb_slices");
	var rgb_slices_p2 = document.createElement("p");
	rgb_slices_p2.appendChild(this.check_rgb_slices);
	// fill containers
	rgb_slices_container.appendChild(rgb_slices_p2);
	rgb_slices_container.appendChild(rgb_slices_p1);
	// add container to the toolbar
	toolbar.insertBefore(rgb_slices_container, toolbar_button);
	added_elements.push(rgb_slices_container);

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
					stacks += ",";
				stacks += stack.data.id.toString();
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
		var single_channels = self.check_rgb_slices.checked ? 0 : 1;

		var str = "The generated stack will have " + nStacks + " channel(s) with " + numSections + " section(s) each.\n";
		str += "Each section will have a size of " + pixelWidth + "x" + pixelHeight + "px.\n";
		str += "Do you really want to crop this microstack?";

		if ( !window.confirm( str ) ) return false;

		var url = django_url + project.id + '/stack/' + stacks + '/crop/' + cb.left + "," + cb.right + "/" + cb.top + "," + cb.bottom + "/" + z_min + "," + z_max + '/' + zoom_level + '/' + single_channels + '/';
		return url;
	};

	/**
	 * crop a microstack by initiating a server backend call
	 */
	var crop = function()
	{
		var url = self.get_crop_url();
		var cb = self.getCropBox();
		var data = {'rotationcw': cb.rotation_cw};
		if (url)
		{
			requestQueue.register(url, 'GET', data, handle_crop );
		}
		return false;
	};

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
				CATMAID.statusBar.replaceLast( text );
				alert( "Cropping the microstack...\nThis operation may take some time, you will be notified as soon as the cropped stack is ready." );
			}
		} else {
			alert( "The server returned an unexpected response (status: " + status + "):\n" + text );
		}
		return;
	};

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
			var current_menu_content = [];
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
							};
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

	this.changeBottomSlice = function( val )
	{

	};

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
		//self.stack.moveToPixel( self.stack.z, self.stack.y, self.stack.x, val );
		if ( self.getCropBox() )
			self.updateCropBox();
		CATMAID.statusBar.replaceLast( "crop s: " + val );
		self.zoomlevel = val;
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

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
		// call register of super class (updates also stack member)
		CroppingTool.superproto.register.call( self, parentStack );

		// initialize the stacks we offer to crop
		getStackMenuInfo(project.id, function(stacks) {
			self.stacks_to_crop = [];
			$.each(stacks, function(index, value) {
				// By default, mark only the current stack to be cropped
				self.stacks_to_crop.push(
					{
						data : value,
						marked : ( value.id == self.stack.getId() )
					});
			 });

			// initialize the stacks menu
			self.updateStacksMenu();
		});

		document.getElementById( "edit_button_crop" ).className = "button_active";

		self.stack.getView().appendChild( self.mouseCatcher );

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

		// initialize crop button
		self.button_roi_apply.onclick = crop;

		self.updateControls();

		return;
	};

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
		// call register of super class (updates also stack member)
		CroppingTool.superproto.unregister.call( self );

		return;
	};

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
		self.unregister();

		document.getElementById( "edit_button_crop" ).className = "button";

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

		self.button_roi_apply.onclick = null;

		// remove added elements from toolbar
		var toolbar = document.getElementById("toolbar_roi");
		$.each(added_elements, function(i, val) {
			toolbar.removeChild(val);
		});

		// call destroy of super class
		CroppingTool.superproto.destroy.call( self );

		return;
	};
}
CATMAID.tools.extend( CroppingTool, RoiTool );

