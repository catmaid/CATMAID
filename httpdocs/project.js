/**
 * project.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 request.js
 *
 */
 
/**
 */

/**
 * A TrakEM2 Web project.
 *
 * - contains abstract objects on top of a common project-specific semantic framework
 * - is related to one ore more stacks of statically aligned layers
 *   ( all stacks of a project are related by translation using physical dimensions )
 */
function Project( pid )
{
	this.getView = function()
	{
		return view;
	}
	
	/**
	 * add a stack to the project
	 */
	this.addStack = function( stack )
	{
		var opened = false;
		for ( var i = 0; i < stacks.length; ++i )
		{
			if ( stacks[ i ].id == stack.id )
			{
				stack = stacks[ i ];
				opened = true;
				break;
			}
		}
		if ( !opened )
		{
			stacks.push( stack );
			view.appendChild( stack.getView() );
			ui.onresize();
		}
		if ( stacks.length > 1 )
		{
			var message_widget_resize_handle = new ResizeHandle( "h" );
			stacks[ stacks.length - 2 ].getView().insertBefore( message_widget_resize_handle.getView(), stacks[ stacks.length - 2 ].getView().firstChild );
			self.moveTo( self.coordinates.z, self.coordinates.y, self.coordinates.x );
		}
		else
		{
			var c = stack.projectCoordinates();
			self.moveTo( c.z, c.y, c.x );
		}
		
		self.setMode( mode );
		
		stack.focus();
		return;
	}
	
	/**
	 * get one of the projects currently opened stacks
	 */
	this.getStack = function( sid )
	{
		for ( var i = 0; i < stacks.length; ++i )
		{
			if ( stacks[ i ].id == sid ) return stacks[ i ];
		}
		return false;
	}
	
	/**
	 * remove a stack from the list
	 */
	this.removeStack = function( sid )
	{
		for ( var i = 0; i < stacks.length; ++i )
		{
			if ( stacks[ i ].id == sid )
			{
				stacks[ i ].unregister();
				view.removeChild( stacks[ i ].getView() );
				stacks.splice( i, 1 );
				if ( stacks.length == 0 )
					self.unregister();
				else
				{
					if ( stacks[ stacks.length - 1 ].getView().firstChild.className.match( /resize_handle/ ) )
						stacks[ stacks.length - 1 ].getView().removeChild( stacks[ stacks.length - 1 ].getView().firstChild );
					stacks[ ( i + 1 ) % stacks.length ].focus();
				}
			}
		}
		ui.onresize();
		return;
	}
	
	/**
	 * focus one stack and blur the rest
	 */
	this.focusStack = function( stack )
	{
		self.focusedStack = stack;
		for ( var i = 0; i < stacks.length; ++i )
		{
			if ( stack != stacks[ i ] )
				stacks[ i ].blur();
		}
		return;
	}
	
	/**
	 * focus the next or prior stack
	 */
	this.switchFocus = function( s )
	{
		var i;
		for ( i = 0; i < stacks.length; ++i )
		{
			if ( self.focusedStack == stacks[ i ] ) break;
		}
		stacks[ ( i + stacks.length + s ) % stacks.length ].focus();
		return;
	}
	
	
	/*
	* resize the view and its content on window.onresize event
	*/
	var resize = function( e )
	{
		var top = document.getElementById( "toolbar_container" ).offsetHeight;
		if ( message_widget.offsetHeight ) top += message_widget.offsetHeight;
		//var bottom = document.getElementById( 'console' ).offsetHeight;
		var bottom = 64;
		var height = Math.max( 0, ui.getFrameHeight() - top - bottom );
		var left = 0;
		var width = ui.getFrameWidth();
		if ( table_widget.offsetWidth )
		{
			width -= table_widget.offsetWidth;
			left += table_widget.offsetWidth;
		}
		if ( project_stats_widget.offsetWidth )
		{
			if ( table_widget.offsetWidth )
				project_stats_widget.style.left = left + "px";
			else
				project_stats_widget.style.left = "0px";
			width -= project_stats_widget.offsetWidth;
			left += project_stats_widget.offsetWidth;
		}
		if ( object_tree_widget.offsetWidth )
		{
			if ( project_stats_widget.offsetWidth )
				object_tree_widget.style.left = left + "px";
			else
				object_tree_widget.style.left = "0px";
			width -= object_tree_widget.offsetWidth;
			left += object_tree_widget.offsetWidth;
		}
		if ( class_tree_widget.offsetWidth )
		{
			if ( object_tree_widget.offsetWidth )
				class_tree_widget.style.left = left + "px";
			else
				class_tree_widget.style.left = "0px";
			width -= class_tree_widget.offsetWidth;
			left += class_tree_widget.offsetWidth;
		}
		var old_width = 0;
		for ( var i = 0; i < stacks.length; ++i )
		{
			old_width += stacks[ i ].getView().offsetWidth;
		}
		var width_ratio = width / old_width;
		
		//var stack_view_width = Math.floor( width / stacks.length );
		
		view.style.left = left + "px";
		left = 0;
		for ( var i = 0; i < stacks.length; ++i )
		{
			//stacks[ i ].resize( i * stack_view_width, 0, stack_view_width, height );
			var stack_view_width = Math.floor( stacks[ i ].getView().offsetWidth * width_ratio );
			stacks[ i ].resize( left, 0, stack_view_width, height );
			left += stack_view_width;
		}
		
		view.style.top = top + "px";
		view.style.width = width + "px";
		view.style.height = height + "px";
	
		return true;
	}
	
	this.getMode = function()
	{
		return mode;
	}
	

	/*
	 * Shows the tree view for the loaded project
	 */
	this.showTreeviewWidget = function ( m )
	{
		switch ( m )
		{
		case "entities":
			var tw_status = document.getElementById( 'object_tree_widget' ).style.display;
			// check if not opened before to prevent messing up with event handlers
			if ( tw_status != 'block' )
			{
				document.getElementById( 'object_tree_widget' ).style.display = 'block';
				ui.onresize();			
				initObjectTree( this.id );
			}
			break;
		case "classes":
			var tw_status = document.getElementById( 'class_tree_widget' ).style.display;
			// check if not opened before to prevent messing up with event handlers
			if ( tw_status != 'block' )
			{
				document.getElementById( 'class_tree_widget' ).style.display = 'block';
				ui.onresize();			
				initClassTree( this.id );
			}
			break;
		}
		return;
	}
	
	/*
	 * Shows the datatable for the loaded project
	 */
	this.showDatatableWidget = function ( m )
	{
		document.getElementById( 'treenode_table_widget' ).style.display = 'block';
		ui.onresize();	
		switch ( m )
		{
		case "treenode":
			initTreenodeTable( this.id );
			break;
		case "presynapse":
			initPreSynapseTable( this.id );
			break;
		case "postsynapse":
			initPostSynapseTable( this.id );
			break;
		}
		return;
	}
	
	
	/*
	 * Shows the project statistics widget
	 */
	this.showStatisticsWidget = function (  )
	{
		document.getElementById( 'project_stats_widget' ).style.display = 'block';
		ui.onresize();	
		initProjectStats();
		return;
	}
	
	this.setMode = function( m )
	{
		document.getElementById( "edit_button_select" ).className = "button";
		document.getElementById( "edit_button_move" ).className = "button";
		document.getElementById( "edit_button_text" ).className = "button";
		document.getElementById( "edit_button_crop" ).className = "button";
		//document.getElementById( "edit_button_profile" ).className = "button";
		document.getElementById( "toolbar_nav" ).style.display = "none";
		document.getElementById( "toolbar_text" ).style.display = "none";
		document.getElementById( "toolbar_crop" ).style.display = "none";
		switch ( m )
		{
		case "select":
			break;
		case "move":
			document.getElementById( "toolbar_nav" ).style.display = "block";
			break;
		case "text":
			document.getElementById( "toolbar_text" ).style.display = "block";
			if ( !show_textlabels ) self.toggleShow( "text" );
			break;
		case "crop":
			document.getElementById( "toolbar_crop" ).style.display = "block";
			break;
		case "trace":
      document.getElementById( "toolbar_trace" ).style.display = "block";
      if ( !show_traces ) self.toggleShow( "trace" );
      break;
		}
		
		mode = m;
		document.getElementById( "edit_button_" + mode ).className = "button_active";
		
		for ( var i = 0; i < stacks.length; ++i )
		{
			stacks[ i ].setMode( mode );
			if ( stacks[ i ] != self.focusedStack )
				stacks[ i ].blur();
		}
		
		window.onresize();
		return;
	}
	
	this.toggleShow = function( m )
	{
		switch ( m )
		{
		case "text":
			if ( show_textlabels && mode != "text" )
			{
				show_textlabels = false;
				document.getElementById( "show_button_text" ).className = "button";
				for ( var i = 0; i < stacks.length; ++i )
					stacks[ i ].showTextlabels( false );
			}
			else
			{
				show_textlabels = true;
				for ( var i = 0; i < stacks.length; ++i )
					stacks[ i ].showTextlabels( true );
				document.getElementById( "show_button_text" ).className = "button_active";
			}
		}
		return;
	}
	
	/**
	 * register all GUI elements
	 */
	this.register = function()
	{
		document.getElementById( "content" ).style.display = "none";
		document.body.appendChild( view );
		ui.registerEvent( "onresize", resize );
		window.onresize();
		
		document.onkeydown = onkeydown;
		
		return;
	}
	
	/**
	 * unregister and remove all stacks, free the event-handlers, hide the stack-toolbar
	 *
	 * @todo: should not the stack handle the navigation toolbar?
	 */
	this.unregister = function()
	{
		//! close all stacks
		for ( var i = 0; i < stacks.length; ++i )
		{
			stacks[ i ].unregister();
			view.removeChild( stacks[ i ].getView() );
			stacks.splice( i, 1 );
		}
		
		ui.removeEvent( "onresize", resize );
		try
		{
			document.body.removeChild( view );
			document.getElementById( "toolbar_nav" ).style.display = "none";
			document.getElementById( "toolbar_text" ).style.display = "none";
			document.getElementById( "toolbox_project" ).style.display = "none";
			document.getElementById( "toolbox_edit" ).style.display = "none";
			document.getElementById( "toolbox_data" ).style.display = "none";
			document.getElementById( "toolbox_show" ).style.display = "none";
			document.getElementById( "toolbar_crop" ).style.display = "none";
			
			// hide data table and tree view widgets
			// in order to reload the data for a new project
			document.getElementById( "treenode_table_widget" ).style.display = "none";
			document.getElementById( "tree_widget" ).style.display = "none";
			
		}
		catch ( error ) {}
		self.id = 0;
		document.onkeydown = null;
		document.getElementById( "content" ).style.display = "block";
		return;
	}
	
	/**
	 * set the project to be editable or not
	 */
	this.setEditable = function(bool)
	{
		editable = bool;
		if (editable) {
			document.getElementById("toolbox_edit").style.display = "block";
			document.getElementById("toolbox_data").style.display = "block";
		}
		else 
		{
			document.getElementById("toolbox_edit").style.display = "none";
			document.getElementById("toolbox_data").style.display = "none";
		}
		window.onresize();
		
		return;
	}
	
	/**
	 * move all stacks to the physical coordinates
	 */
	this.moveTo = function(
		zp,
		yp,
		xp,
		sp )
	{
		self.coordinates.x = xp;
		self.coordinates.y = yp;
		self.coordinates.z = zp;
		
		for ( var i = 0; i < stacks.length; ++i )
		{
			stacks[ i ].moveTo( zp, yp, xp, sp );
		}
		return;
	}
	
	/**
	 * create a URL to the current view
	 */
	this.createURL = function()
	{
		var coords;
		var url="?pid=" + self.id;
		if ( stacks.length > 0 )
		{
			//coords = stacks[ 0 ].projectCoordinates();		//!< @todo get this from the SELECTED stack to avoid approximation errors!
			url += "&zp=" + self.coordinates.z + "&yp=" + self.coordinates.y + "&xp=" + self.coordinates.x;
			for ( var i = 0; i < stacks.length; ++i )
			{
				url += "&sid" + i + "=" + stacks[ i ].id + "&s" + i + "=" + stacks[ i ].screenCoordinates().s;
			}
		}
		return url;
	}
	
	/**
	 * create a textlabel on the server
	 */
	this.createTextlabel = function( tlx, tly, tlz, tlr, scale )
	{
		icon_text_apply.style.display = "block";
		requestQueue.register(
			'model/textlabel.create.php',
			'POST',
			{
				pid : project.id,
				x : tlx,
				y : tly,
				z : tlz,
				r : parseInt( document.getElementById( "fontcolourred" ).value ) / 255,
				g : parseInt( document.getElementById( "fontcolourgreen" ).value ) / 255,
				b : parseInt( document.getElementById( "fontcolourblue" ).value ) / 255,
				a : 1,
				type : "text",
				scaling : ( document.getElementById( "fontscaling" ).checked ? 1 : 0 ),
				fontsize : ( document.getElementById( "fontscaling" ).checked ?
							Math.max( 16 / scale, parseInt( document.getElementById( "fontsize" ).value ) ) :
							parseInt( document.getElementById( "fontsize" ).value ) ) * tlr,
				fontstyle : ( document.getElementById( "fontstylebold" ).checked ? "bold" : "" )
			},
			function( status, text, xml )
			{
				statusBar.replaceLast( text );
				
				if ( status == 200 )
				{
					icon_text_apply.style.display = "none";
					for ( var i = 0; i < stacks.length; ++i )
					{
						stacks[ i ].updateTextlabels();
					}
					if ( text && text != " " )
					{
						var e = eval( "(" + text + ")" );
						if ( e.error )
						{
							alert( e.error );
						}
						else
						{
						}
					}
				}
				return true;
			} );
		return;
	}
	
	var onkeydown = function( e )
	{
		var key;
		var target;
		var shift;
		var alt;
		var ctrl;
		if ( e )
		{
			if ( e.keyCode ) key = e.keyCode;
			else if ( e.charCode ) key = e.charCode;
			else key = e.which;
			target = e.target;
			shift = e.shiftKey;
			alt = e.altKey;
			ctrl = e.ctrlKey;
		}
		else if ( event && event.keyCode )
		{
			key = event.keyCode;
			target = event.srcElement;
			shift = event.shiftKey;
			alt = event.altKey;
			ctrl = event.ctrlKey;
		}
		var n = target.nodeName.toLowerCase();
		if ( !( n == "input" || n == "textarea" || n == "area" ) )		//!< @todo exclude all useful keyboard input elements e.g. contenteditable...
		{
			switch( key )
			{
			case 61:		//!< +
			case 107:
			case 187:		//!< for IE only---take care what this is in other platforms...
				slider_s.move( 1 );
				return false;
			case 109:		//!< -
			case 189:		//!< for IE only---take care what this is in other platforms...
				slider_s.move( -1 );
				return false;
			case 188:		//!< ,
				slider_z.move( -( shift ? 10 : 1 ) );
				return false;
			case 190:		//!< .
				slider_z.move( ( shift ? 10 : 1 ) );
				return false;
			case 37:		//!< cursor left
				input_x.value = parseInt( input_x.value ) - ( shift ? 100 : ( alt ? 1 : 10 ) );
				input_x.onchange( e );
				return false;
			case 39:		//!< cursor right
				input_x.value = parseInt( input_x.value ) + ( shift ? 100 : ( alt ? 1 : 10 ) );
				input_x.onchange( e );
				return false;
			case 38:		//!< cursor up
				input_y.value = parseInt( input_y.value ) - ( shift ? 100 : ( alt ? 1 : 10 ) );
				input_y.onchange( e );
				return false;
			case 40:		//!< cursor down
				input_y.value = parseInt( input_y.value ) + ( shift ? 100 : ( alt ? 1 : 10 ) );
				input_y.onchange( e );
				return false;
			case 9:			//!< tab
				if ( shift ) project.switchFocus( -1 );
				else project.switchFocus( 1 );
				//e.stopPropagation();
				return false;
			case 13:		//!< return
				break;
			/*
			default:
				alert( key );
			*/
			}
			return true;
		}
		else return true;
	}
	
	// initialise
	var self = this;
	this.id = pid;
	if ( typeof ui == "undefined" ) ui = new UI();
	if ( typeof requestQueue == "undefined" ) requestQueue = new RequestQueue();
	
	var view = document.createElement( "div" );
	view.className = "projectView";
	
	var templateView = document.createElement( "div" );
	templateView.className = "projectTemplateView";
	
	var dataView = document.createElement( "div" );
	templateView.className = "projectDataView";
	
	var editToolbar = document.getElementById( "" );
	
	/*
	view.appendChild( templateView );
	view.appendChild( dataView );
	*/
	
	this.coordinates = 
	{
		x : 0,
		y : 0,
		z : 0
	};
	
	var template;				//!< DTD like abstract object tree (classes)
	var data;					//!< instances in a DOM representation
	
	var stacks = new Array();	//!< a list of stacks related to the project
	this.focusedStack;
	
	var editable = false;
	var mode = "move";
	var show_textlabels = true;
	
	var icon_text_apply = document.getElementById( "icon_text_apply" );
	
	//!< associative array of selected objects like class_instances, treenodes etc.
	var selectedObjects = { 'tree_object' : {},
							'table_treenode' : {},
						  };
	this.selectedObjects = selectedObjects;
	
	// handling all the currently existing objects
	var existingObjects = {};
	this.existingObjects = existingObjects;
	
	// history of activated objects in the past
	var history = [];
	this.history = history;
	
	// currently active treenode
	// includes id and skeleton id
	var active_treenode = {};
	this.active_treenode = active_treenode;
	
	// currently active synapse
	// includes id
	var active_synapse = {};
	this.active_synapse = active_synapse;
	
}
