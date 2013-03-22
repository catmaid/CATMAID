/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * triviewtool.js
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
 * Constructor for the triview tool. Inherits from navigator
 */
function TriviewTool()
{
  this.prototype = new Navigator();
  var self = this;
  var stack = null;
  this.toolname = "triviewtool";

  WindowMaker.show('triview');

  var winTriview = WindowMaker.getWindow('triview');

  if ( !ui ) 
  	ui = new UI();

  /**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
		self.prototype.register( parentStack );

		ui.registerEvent( "onmousemove", onmousemove );
		return;
	}

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
		ui.removeEvent( "onmousemove", onmousemove );
		self.prototype.unregister( );
		return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
		self.prototype.unregister();		
		return;
	}

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */
	this.handleKeyPress = function( e ) {
		return self.prototype.handleKeyPress(e);
	}


	
	var onmousemove = function( e )
	{
		
		console.log("We pass the test");
		if( winTriview )
			TriviewWidget.updateTriviewFromTracingActiveNode();
		return true;
	}
};