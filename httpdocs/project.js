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

/* Define any new keybindings here.

   There's a helpful page with the different key codes for different
   browsers here:

     http://unixpapa.com/js/key.html
 */

var arrowKeyCodes = {
  left: 37,
  up: 38,
  right: 39,
  down: 40
};

// TODO big assumption below: that there is only one SVGOverlay instance.
// So instead the function should look for the active window in the window manager,
// figure out if it contains a tracing layer, and if so, call the function on its svgoverlay
// by altering the meaning of the word 'this' to point to the SVGOverlay instance. Below, 'this' should replace 'project' everywhere.

var stringToKeyAction = {
  "A": {
    helpText: "Go to active node",
    buttonID: 'trace_button_goactive',
    run: function (e) {
      project.tracingCommand('goactive');
      return false;
    }
  },
  "J": {
    helpText: "Nothing right now",
    run: function (e) {
      alert("J was pressed");
      return false;
    }
  },
  "+": {
    helpText: "Zoom in",
    specialKeyCodes: [107, 61, 187],
    run: function (e) {
      slider_s.move(1);
      slider_trace_s.move(1);
      return false;
    }
  },
  "-": {
    helpText: "Zoom out",
    specialKeyCodes: [109, 189, 45],
    run: function (e) {
      slider_s.move(-1);
      slider_trace_s.move(-1);
      return false;
    }
  },
  ",": {
    helpText: "Move up 1 slice in z (or 10 with Shift held)",
    specialKeyCodes: [188, 44],
    run: function (e) {
      slider_z.move(-(e.shiftKey ? 10 : 1));
      slider_trace_z.move(-(e.shiftKey ? 10 : 1));
      return false;
    }
  },
  ".": {
    helpText: "Move down 1 slice in z (or 10 with Shift held)",
    specialKeyCodes: [190, 46],
    run: function (e) {
      slider_z.move((e.shiftKey ? 10 : 1));
      slider_trace_z.move((e.shiftKey ? 10 : 1));
      return false;
    }
  },
  "\u2190": {
    helpText: "Move left (towards negative x)",
    specialKeyCodes: [arrowKeyCodes.left],
    run: function (e) {
      input_x.value = parseInt(input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_x.onchange(e);
      return false;
    }
  },
  "\u2192": {
    helpText: "Move right (towards positive x)",
    specialKeyCodes: [arrowKeyCodes.right],
    run: function (e) {
      input_x.value = parseInt(input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_x.onchange(e);
      return false;
    }
  },
  "\u2191": {
    helpText: "Move up (towards negative y)",
    specialKeyCodes: [arrowKeyCodes.up],
    run: function (e) {
      input_y.value = parseInt(input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_y.onchange(e);
      return false;
    }
  },
  "\u2193": {
    helpText: "Move down (towards positive y)",
    specialKeyCodes: [arrowKeyCodes.down],
    run: function (e) {
      input_y.value = parseInt(input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_y.onchange(e);
      return false;
    }
  },
  "1": {
    helpText: "Switch to skeleton tracing mode",
    buttonID: 'trace_button_skeleton',
    run: function (e) {
      project.tracingCommand('skeletontracing');
      return false;
    }
  },
  "2": {
    helpText: "Switch to synapse dropping mode",
    buttonID: 'trace_button_synapse',
    run: function (e) {
      project.tracingCommand('synapsedropping');
      return false;
    }
  },
  "M": {
    helpText: "Deselect the active node",
    run: function (e) {
      activateNode(null);
      return false;
    }
  },
  "P": {
    helpText: "Go to the parent of the active node (?)",
    run: function (e) {
      project.tracingCommand('goparent');
      return false;
    }
  },
  "E": {
    helpText: "Go to last edited node in this skeleton",
    run: function (e) {
      project.tracingCommand('golastedited');
      return false;
    }
  },
  "5": {
    helpText: "Split this skeleton at the active node",
    buttonID: 'trace_button_skelsplitting',
    run: function (e) {
      project.tracingCommand('skeletonsplitting');
      return false;
    }
  },
  "6": {
    helpText: "Re-root this skeleton at the active node",
    buttonID: 'trace_button_skelrerooting',
    run: function (e) {
      project.tracingCommand('skeletonreroot');
      return false;
    }
  },
  "7": {
    helpText: "Toggle the display of labels",
    buttonID: 'trace_button_togglelabels',
    run: function (e) {
      project.tracingCommand('togglelabels');
      return false;
    }
  },
  "S": {
    helpText: "Export to SWC",
    buttonID: 'trace_button_exportswc',
    run: function (e) {
      project.tracingCommand('exportswc');
      return false;
    }
  },
  "T": {
    helpText: "Tag the active node",
    run: function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
        project.tracingCommand('tagging');
      }
      return true;
    }
  },
  "G": {
    helpText: "Select the nearest node to the mouse cursor",
    run: function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
        project.activateNearestNode();
      }
      return true;
    }
  },
  "Tab": {
    helpText: "Switch to the next open stack (or the previous with Shift+Tab)",
    specialKeyCodes: [9],
    run: function (e) {
      if (e.shiftKey) {
        project.switchFocus(-1);
      } else {
        project.switchFocus(1);
      }
      //e.stopPropagation();
      return false;
    }
  }
};

var withAliases = jQuery.extend({}, stringToKeyAction);
withAliases["4"] = withAliases["A"];

/* We now turn that structure into an object for
   fast lookups from keyCodes */

var keyCodeToKeyAction = {};

{
  var i;
  for (i in withAliases) {
    var keyCodeFromKey = null;
/* If the string representation of the key is a single upper case
       letter or a number, we just use its ASCII value as the key
       code */
    if (i.length === 1) {
      k = i.charCodeAt(0);
      if ((k >= 65 && k <= 90) || (k >= 48 && k <= 57)) {
        keyCodeFromKey = k;
      }
    }
    var o = withAliases[i]; /* Add any more unusual key codes for that action */
    var allKeyCodes = o.specialKeyCodes || [];
    if (keyCodeFromKey && $.inArray(keyCodeFromKey, allKeyCodes) < 0) {
      allKeyCodes.push(keyCodeFromKey);
    }

    /* Now add to the keyCodeToKeyAction object */
    var ki, k;
    for (ki in allKeyCodes) {
      k = allKeyCodes[ki];
      if (keyCodeToKeyAction[k]) {
        alert("Attempting to define a second action for keyCode " + k + " via '" + i + "'");
      } else {
        keyCodeToKeyAction[k] = o;
      }
    }
  }
}

/** Updates the 'alt' and 'title' attributes on the toolbar
 icons that are documented with help text and key presses.
 Also bind the onClick action for the link that contains
 those icons to the corresponding function */

function setButtons() {
  for (var i in stringToKeyAction) {
    var o = stringToKeyAction[i];
    if (o.buttonID) {
      var link = $('#' + o.buttonID);
      link.attr('href', 'foo');
      link.click(o.run);
      var img = link.find('img');
      img.attr('alt', o.helpText);
      var title = i + ': ' + o.helpText;
      img.attr('title', title);
    }
  }
}

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
