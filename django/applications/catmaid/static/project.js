/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
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
	 * Add a stack to the project. The stack reference is returned. In
	 * case a stack with the same ID is already loaded, a reference to
	 * this existing stack is returned.
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

		// Only set focus if stack isn't already in focus
		if ( stack !== self.focusedStack )
		    self.setFocusedStack( stack );
		
		// only set the tool for the first stack
		if ( stacks.length == 1 )
		{
			if ( !tool )
				tool = new Navigator();
			self.setTool( tool );
			// self.focusedStack.setTool( tool );

		}

		// return the (possibly updated) stack reference
		return stack;
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
	 * get all the currently opened stacks
	 */
	this.getStacks = function()
	{
		return stacks;
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
					self.destroy();
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
		'selectedskeleton': null,
        'selectedassembly': null
	};

    this.setSelectObject = function( type, id ) {
        this.selectedObjects.selectedneuron = null;
        this.selectedObjects.selectedskeleton = null;
        this.selectedObjects.selectedassembly = null;
        if( type == "neuron" ) {
            this.selectedObjects.selectedneuron = id;
        } else if( type == "skeleton" ) {
            this.selectedObjects.selectedskeleton = id;
        } else if( type == "assembly" ) {
            this.selectedObjects.selectedassembly = id;
        }
        // if the segmentation tool is select, we need to update
        // the assembly id
        if( self.getTool().toolname === 'segmentationtool' ) {
            SegmentationAnnotations.set_current_assembly_id( this.selectedObjects.selectedassembly );
        }

    };

    this.hideToolbars = function()
	{
		document.getElementById( "toolbar_nav" ).style.display = "none";
		document.getElementById( "toolbar_text" ).style.display = "none";
		document.getElementById( "toolbar_trace" ).style.display = "none";
	}
	
    this.hideToolboxes = function()
	{
		document.getElementById( "toolbox_segmentation" ).style.display = "none";
		document.getElementById( "toolbox_data" ).style.display = "none";
	}
	
	this.setTool = function( newTool )
	{
		if ( tool )
			tool.destroy();
		tool = newTool;
		
		self.hideToolboxes();

		if ( !self.focusedStack && stacks.length > 0 ) {
			self.setFocusedStack( stacks[ 0 ] )
		} 

		self.focusedStack.setTool( tool )

		if ( self.focusedStack ) {
			if (!self.focusedStack.getWindow().hasFocus())
				self.focusedStack.getWindow().focus();
		}
		window.onresize();
		WindowMaker.setKeyShortcuts();
		return;
	}

	this.getTool = function( )
	{
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
		document.getElementById("toolbox_edit").style.display = "block";
		document.getElementById( "content" ).style.display = "none";
		document.body.appendChild( view );
		ui.registerEvent( "onresize", resize );
		//window.onresize();
		
		document.onkeydown = onkeydown;
		
		return;
	}
	
	/**
	 * unregister and remove all stacks, free the event-handlers, hide the stack-toolbar
	 *
	 * @todo: should not the stack handle the navigation toolbar?
	 */
	this.destroy = function()
	{
		if ( tool ) tool.destroy();
		
		//! Close all windows. There is no need to explicitely call close()
		//! on the root window as this done by the last child.
		rootWindow.closeAllChildren();
			
		ui.removeEvent( "onresize", resize );
		try
		{
			document.body.removeChild( view );
		}
		catch ( error ) {}
		self.id = 0;
		document.onkeydown = null;
		document.getElementById( "content" ).style.display = "block";
		document.getElementById( "stackmenu_box" ).style.display = "none";
		document.getElementById( "stack_menu" ).style.display = "none";
		// TODO: bars should be unset by tool on unregister
		document.getElementById("toolbox_edit").style.display = "none";
		document.getElementById("toolbox_data").style.display = "none";
		document.getElementById("toolbox_segmentation").style.display = "none";
		document.getElementById( "toolbox_project" ).style.display = "none";
		document.getElementById( "toolbar_nav" ).style.display = "none";

		project = null;

		return;
	}

	/**
	 * This is a helper function for the moveTo() API function. It moves each
	 * stack in <stacks> to the physical location given. It passes itself as
	 * callback to the moveTo() API function of each stack. This is done to give
	 * each stack the chance to wait for asynchronous calls to be finished before
	 * the next stack is moved. After the last stack has been moved, the actual
	 * <completionCallback> is executed. Using a loop to call moveTo() for each
	 * stack wouldn't allow to account for asynchronous calls during moving a
	 * stack.
	 */
	this.moveToInStacks = function(
		zp,
		yp,
		xp,
		sp,
		stacks,
		completionCallback)
	{
		var stackToMove;
		if (stacks.length === 0) {
			// FIXME: do we need a callback for tool.redraw as well?
			if ( tool && tool.redraw )
				tool.redraw();
			if (typeof completionCallback !== "undefined") {
				completionCallback();
			}
		} else {
			// Move current stack and continue with next one (or the completion
			// callback) as a continuation of the moveTo() call on the current stack.
			stackToMove = stacks.shift();
			stackToMove.moveTo( zp,
					    yp,
					    xp,
					    sp,
					    function () {
						    self.moveToInStacks( zp, yp, xp, sp, stacks, completionCallback );
					    });
		}
	}

	/**
	 * Move all stacks to the physical coordinates and execute a completion
	 * callback when everything is done. One stack is moved as a continuation
	 * of the stack before (except first stack, which is moved directly). This
	 * makes sure we also wait for asynchronous requests to finish, that a stack
	 * move might imply (e.g. requesting more treenodes for the tracing tool).
	 */
	this.moveTo = function(
		zp,
		yp,
		xp,
		sp,
		completionCallback)
	{
		var stacksToMove = [];
		self.coordinates.x = xp;
		self.coordinates.y = yp;
		self.coordinates.z = zp;

		
		for ( var i = 0; i < stacks.length; ++i )
		{
			stacksToMove.push( stacks[ i ] );
		}

		// Call recursive moving function which executes the completion callback as
		// a continuation after the last stack has been moved.
		self.moveToInStacks( zp, yp, xp, sp, stacksToMove, completionCallback );
	};

  this.updateTool = function()
  {
		if ( tool && tool.updateLayer )
			tool.updateLayer();
  };

  // Need to add this "tool-specific" function
  // to project because need to call it from the
  // object tree widget
  this.deselectActiveNode = function()
  {
		if ( tool && tool.deselectActiveNode )
			tool.deselectActiveNode();
  };

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
			url += "&tool=" + project.getTool().toolname;
      if( project.getTool().toolname === 'tracingtool' ) {
        var active_skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
        if( active_skeleton_id ) {
          url += "&active_skeleton_id=" + active_skeleton_id;
          url += "&active_node_id=" + SkeletonAnnotations.getActiveNodeId();
        }
      }
			for ( var i = 0; i < stacks.length; ++i )
			{
				url += "&sid" + i + "=" + stacks[ i ].id + "&s" + i + "=" + stacks[ i ].s;
			}
		}
		return url;
	}

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */

	this.handleKeyPress = function( e ) {
		var keyAction = keyCodeToAction[e.keyCode];
		if (keyAction) {
			return keyAction.run(e);
		} else {
			return false;
		}
	}

	var onkeydown = function( e )
	{
		var projectKeyPress;
		var key;
		var shift;
		var alt;
		var ctrl;
		var meta;
		var keyAction;

		/* The code here used to modify 'e' and pass it
		   on, but Firefox no longer allows this.  So, create
		   a fake event object instead, and pass that down. */
		var fakeEvent = {};

		if ( e )
		{
			if ( e.keyCode ) {
				key = e.keyCode;
			} else if ( e.charCode ) {
				key = e.charCode;
			} else {
				key = e.which;
			}
			fakeEvent.keyCode = key;
			fakeEvent.shiftKey = e.shiftKey;
			fakeEvent.altKey = e.altKey;
			fakeEvent.ctrlKey = e.ctrlKey;
			fakeEvent.metaKey = e.metaKey;
			shift = e.shiftKey;
			alt = e.altKey;
			ctrl = e.ctrlKey;
			meta = e.metaKey;
		}
		else if ( event && event.keyCode )
		{
			fakeEvent.keyCode = event.keyCode;
			fakeEvent.shiftKey = event.shiftKey;
			fakeEvent.altKey = event.altKey;
			fakeEvent.ctrlKey = event.ctrlKey;
			fakeEvent.metaKey = event.metaKey;
			shift = event.shiftKey;
			alt = event.altKey;
			ctrl = event.ctrlKey;
			meta = event.metaKey;
		}
		fakeEvent.target = UI.getTargetElement(e || event);
		var n = fakeEvent.target.nodeName.toLowerCase();
		var fromATextField = false;
		if (n == "input") {
			var inputType = fakeEvent.target.type.toLowerCase();
			if (inputType == "text" || inputType == "password") {
				fromATextField = true;
			}
		}
		if (meta) {
			// Don't intercept command-key events on Mac.
			return true;
		}
		if (!(fromATextField || n == "textarea" || n == "area")) //!< @todo exclude all useful keyboard input elements e.g. contenteditable...
		{
			/* Note that there are two different
			   conventions for return values here: the
			   handleKeyPress() methods return true if the
			   event has been dealt with (i.e. it should
			   not be propagated) but the onkeydown
			   function should only return true if the
			   event should carry on for default
			   processing. */
			if (tool && tool.handleKeyPress(fakeEvent)) {
				return false;
			} else {
				projectKeyPress = self.handleKeyPress(fakeEvent);
				return ! projectKeyPress;
			}
		} else {
			return true;
		}
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
	
	var mode = "move";
	var show_textlabels = true;
	
	var icon_text_apply = document.getElementById( "icon_text_apply" );

	/** The only actions that should be added to Project are those
	    that should be run regardless of the current tool, such as
	    actions that switch tools. */

	var actions = toolActions.concat(editToolActions);

	this.getActions = function () {
		return actions;
	}

	var keyCodeToAction = getKeyCodeToActionMap(actions);
}
