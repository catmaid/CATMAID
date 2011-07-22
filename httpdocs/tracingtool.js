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

    // TODO given that the function adds nothing relative to the prototype, it is not necessary to declare it
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
        self.prototype.register( parentStack, "edit_button_trace" );
        var box = $('<div class="box" id="tracingbuttons"></div>');
        ["skeleton", "synapse", "goactive", "skelsplitting", "skelrerooting", "togglelabels", "3dview"].map(
            function(name) {
                box.append($('<a href="#" class="button" id="trace_button_' + name + '"><img src="widgets/themes/kde/trace_' + name + '.png"/></a>'));
            }
        );
        $("#toolbar_nav").prepend(box);
        self.tracingLayer = new TracingLayer(parentStack);
        parentStack.addLayer("TracingLayer", self.tracingLayer);

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
        self.tracingLayer.svgOverlay.updateNodeCoordinatesinDB();

        // the prototype destroy calls the prototype's unregister, not self.unregister
        // do it before calling the prototype destroy that sets stack to null
        self.prototype.stack.removeLayer( "TracingLayer" );
        self.prototype.destroy( "edit_button_trace" );
        $( "#tracingbuttons" ).remove();
        return;
	}
}

