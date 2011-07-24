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
}
