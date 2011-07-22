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
    var tracingLayer = null;
    var stack = null;

	this.resize = function( width, height )
	{
        self.prototype.resize( width, height );
		return;
	}

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{

    if ( self.prototype.stack == null ) {
      var box = $( '<div class="box" id="tracingbuttons"></div>' );
      [ { name : "skeleton", alt : "skeleton" },
        { name : "synapse", alt : "synapse" },
        { name : "goactive", alt : "go to active element" },
        { name : "skelsplitting", alt : "split skeleton" },
        { name : "skelrerooting", alt : "reroot skeleton" },
        { name : "togglelabels", alt : "toggle labels" },
        { name : "3dview", alt : "3d view" } ].map(
        function( button ) {
          box.append( $('<a href="#" class="button" id="trace_button_' + button.name + '"><img src="widgets/themes/kde/trace_' + button.name + '.png" title="'+ button.alt + '" alt="'+ button.alt + '" /></a>' ) );
        }
      );
      $( "#toolbar_nav" ).prepend( box );
    }

    // If the tracing layer exists and it belongs to a different stack, remove it
    if (tracingLayer && stack && stack !== parentStack) {
      stack.removeLayer( tracingLayer );
    }
    tracingLayer = new TracingLayer( parentStack );
    //this.prototype.mouseCatcher = tracingLayer.svgOverlay.getView();
    this.prototype.setMouseCatcher( tracingLayer.svgOverlay.getView() );
    parentStack.addLayer( "TracingLayer", tracingLayer );

    // Call register AFTER changing the mouseCatcher
    self.prototype.register( parentStack, "edit_button_trace" );

    // NOW set the mode TODO cleanup this initialization problem
    tracingLayer.svgOverlay.set_tracing_mode( "skeletontracing" );
    tracingLayer.svgOverlay.updateNodes();

	return;
	}

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
        // do it before calling the prototype destroy that sets stack to null
        if (self.prototype.stack) {
            self.prototype.stack.removeLayer( "TracingLayer" );
        }
        self.prototype.unregister();
        return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
        // Synchronize data with database
        tracingLayer.svgOverlay.updateNodeCoordinatesinDB();

        // the prototype destroy calls the prototype's unregister, not self.unregister
        // do it before calling the prototype destroy that sets stack to null
        self.prototype.stack.removeLayer( "TracingLayer" );
        self.prototype.destroy( "edit_button_trace" );
        $( "#tracingbuttons" ).remove();
        return;
	}
}

