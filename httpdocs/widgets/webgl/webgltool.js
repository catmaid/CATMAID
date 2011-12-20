/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 */

/**
 * Constructor for the WebGL tool.
 */
function WebGLTool()
{
    this.prototype = new Navigator();

    var self = this;
    var webglLayer = null;
    var stack = null;
    this.toolname = "webgltool";

    this.resize = function( width, height )
    {
        self.prototype.resize( width, height );
        return;
    };

    var createWebGLLayer = function( parentStack )
    {
        stack = parentStack;
        webglLayer = new WebGLLayer( parentStack );
        //this.prototype.mouseCatcher = tracingLayer.svgOverlay.getView();
        console.log("webglayer viewer", webglLayer.view );
        self.prototype.setMouseCatcher( webglLayer.view );
        parentStack.addLayer( "WebGLLayer", webglLayer );

        // view is the mouseCatcher now
        var view = webglLayer.view;

        var proto_onmousedown = view.onmousedown;
        view.onmousedown = function( e ) {
            console.log("onmouse down", ui.getMouseButton( e ) );
            return;
        };

        var proto_changeSlice = self.prototype.changeSlice;
        self.prototype.changeSlice =
            function( val ) {
                proto_changeSlice( val );
            };
    };

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {

        if (webglLayer && stack) {
            if (stack !== parentStack) {
                // If the tracing layer exists and it belongs to a different stack, replace it
                stack.removeLayer( webglLayer );
                createWebGLLayer( parentStack );
            } else {
                // reactivateBindings();
            }
        } else {
            createWebGLLayer( parentStack );
        }

        return;
    };

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {
        return;
    }

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
        console.log("destroy webgl");
        self.prototype.stack.removeLayer( "WebGLLayer" );
        webglLayer.destroy();
        return;
    };

    this.redraw = function()
    {
        self.prototype.redraw();
    };

}
