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
			if ( rootWindow.getChild() == null )
				rootWindow.replaceChild( stack.getWindow() );
			else
				rootWindow.replaceChild( new CMWHSplitNode( rootWindow.getChild(), stack.getWindow() ) );
			
			stack.getWindow().focus();	
			ui.onresize();
		}
		if ( stacks.length > 1 )
			self.moveTo( self.coordinates.z, self.coordinates.y, self.coordinates.x );
		else
		{
			var c = stack.projectCoordinates();
			self.moveTo( c.z, c.y, c.x );
		}
		
		self.setFocusedStack( stack );
		
		if ( !tool )
			tool = new Navigator();
		self.setTool( tool );
		
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
				stacks.splice( i, 1 );
				if ( stacks.length == 0 )
					self.unregister();
				else
					stacks[ ( i + 1 ) % stacks.length ].getWindow().focus();
			}
		}
		ui.onresize();
		return;
	}
	
	/**
	 * focus a stack and blur the rest
	 */
	this.setFocusedStack = function( stack )
	{
		self.focusedStack = stack;
		if ( tool )
			self.focusedStack.setTool( tool );
		window.onresize();
		return;
	}
	
	/**
	 * focus the next or prior stack
	 */
	this.switchFocus = function( s )
	{
		var i;
		for ( i = 0; i < stacks.length; ++i )
			if ( self.focusedStack == stacks[ i ] ) break;
			
		stacks[ ( i + stacks.length + s ) % stacks.length ].getWindow().focus();
		return;
	}
	

	//!< Associative array of selected objects
	// in the Treenode Table and Object Tree.
	// I.e. enables communication between the Object Tree and the Table of Nodes.
	this.selectedObjects = {
		'tree_object': {},
		'table_treenode': {},
		'selectedneuron': null,
		'selectedskeleton': null
	};
	
	this.hideToolbars = function()
	{
		document.getElementById( "toolbar_nav" ).style.display = "none";
		document.getElementById( "toolbar_text" ).style.display = "none";
		document.getElementById( "toolbar_crop" ).style.display = "none";
		document.getElementById( "toolbar_trace" ).style.display = "none";
	}
	
	
	this.setTool = function( newTool )
	{
		if ( tool )
			tool.destroy();
		tool = newTool;
		
		if ( !self.focusedStack && stacks.length > 0 )
			self.focusedStack = stacks[ 0 ];
		
		if ( self.focusedStack )
			self.focusedStack.getWindow().focus();

		window.onresize();
		return;
	}

    this.getTool = function( ) {
	return tool;
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
		if ( tool ) tool.unregister();
		
		//! close all windows
		//rootWindow.closeAllChildren();
		rootWindow.close();
			
		ui.removeEvent( "onresize", resize );
		try
		{
			document.body.removeChild( view );
		}
		catch ( error ) {}
		self.id = 0;
		document.onkeydown = null;
		document.getElementById( "content" ).style.display = "block";
		
		project = null;

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
		if ( tool && tool.redraw )
			tool.redraw();
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
				url += "&sid" + i + "=" + stacks[ i ].id + "&s" + i + "=" + stacks[ i ].s;
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

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */

    this.handleKeyPress = function( e ) {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
	    keyAction.run(e || event);
	    return true;
	} else {
            return false;
	}
    }

	var onkeydown = function( e )
	{
	    var projectKeyPress;
		var key;
		var target;
		var shift;
		var alt;
		var ctrl;
	    var keyAction;
		if ( e )
		{
			if ( e.keyCode ) key = e.keyCode;
			else if ( e.charCode ) key = e.charCode;
			else key = e.which;
		    e.keyCode = key;
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
	    var fromATextField = false;
	    if (n == "input") {
		var inputType = target.type.toLowerCase();
		if (inputType == "text" || inputType == "password") {
		    fromATextField = true;
		}
	    }
	    if (!(fromATextField || n == "textarea" || n == "area")) //!< @todo exclude all useful keyboard input elements e.g. contenteditable...
	    {
		if (tool && tool.handleKeyPress(e || event)) {
		    return false;
		} else {
		    projectKeyPress = self.handleKeyPress(e || event);
		    return ! projectKeyPress;
		}
	    } else
		return true;
	}
	
	/**
	 * Get project ID.
	 */
	this.getId = function(){ return pid; }
	
	// initialise
	var self = this;
	this.id = pid;
	if ( typeof ui == "undefined" ) ui = new UI();
	if ( typeof requestQueue == "undefined" ) requestQueue = new RequestQueue();
	
	var tool = null;
	
	var view = rootWindow.getFrame();
	view.className = "projectView";
	
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

    /** The only actions that should be added to Project are those
	that should be run regardless of the current tool, such as
	actions that switch tools. */

    var actions = [];

    this.addAction = function ( action ) {
	actions.push( action );
    }

    this.getActions = function () {
	return actions;
    }

    /** FIXME: also add F1 to open the key shortcuts help?

        FIXME: 1 is a bad shortcut to switch tool (1-5 should be used
        for setting confidences instead) */

    this.addAction( new Action({
	helpText: "Switch to skeleton tracing mode",
	buttonIDs: [ 'trace_button_skeleton' ],
	keyShortcuts: {
	    '1': [ 49 ]
	},
	run: function (e) {
	    project.setTool( new TracingTool() );
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Switch to the next open stack (or the previous with Shift+Tab)",
	keyShortcuts: {
	    'Tab': [ 9 ]
	},
	run: function (e) {
	    if (e.shiftKey) {
		project.switchFocus(-1);
	    } else {
		project.switchFocus(1);
	    }
	    //e.stopPropagation();
	    return false;
	}
    }) );

    var keyCodeToAction = getKeyCodeToActionMap(actions);

    setButtonClicksFromActions(actions);

}
