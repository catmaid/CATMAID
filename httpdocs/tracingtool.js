/**
 * tracingtool.js
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
 * Tracing tool.
 */
function TracingTool()
{

  this.prototype = new Navigator();
  
	var self = this;

	if ( !ui ) ui = new UI();

	//! mouse catcher
	var mouseCatcher = document.createElement( "div" );
	mouseCatcher.className = "sliceMouseCatcher";
	mouseCatcher.style.cursor = "default";



	this.resize = function( width, height )
	{
		mouseCatcher.style.width = width + "px";
		mouseCatcher.style.height = height + "px";
		return;
	}


	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
    self.prototype.register( parentStack, "edit_button_trace" );
    var box = $( '<div class="box" id="tracingbuttons"></div>' );
    ["skeleton", "synapse", "goactive", "skelsplitting", "skelrerooting", "togglelabels", "3dview"].map(
      function( name ) {
        box.append( $('<a href="#" class="button" id="trace_button_' + name + '"><img src="widgets/themes/kde/trace_' + name + '.png"/></a>' ) );
      }
    );
    $( "#toolbar_nav" ).prepend( box );
    var tracinglayer = new TracingLayer( parentStack );
    parentStack.addLayer( "TracingLayer", tracinglayer );

		return;
	}

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
    // do it before calling the prototype destroy that sets stack to null
    if (self.prototype.stack)
      self.prototype.stack.removeLayer( "TracingLayer" );
    self.prototype.unregister();
		return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
    // TODO: synchronize data with database


    // the prototype destroy calls the prototype's unregister, not self.unregister
    // do it before calling the prototype destroy that sets stack to null
    self.prototype.stack.removeLayer( "TracingLayer" );
    self.prototype.destroy( "edit_button_trace" );
    $( "#tracingbuttons" ).remove();

    return;
	}
}

