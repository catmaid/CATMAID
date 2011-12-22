/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 */

/**
 * Constructor for the Canvas tool.
 */
function CanvasTool()
{
    this.prototype = new Navigator();

    var self = this;
    var canvasLayer = null;
    var controls = null;
    var stack = null;
    this.toolname = "canvastool";

    this.resize = function( width, height )
    {
        self.prototype.resize( width, height );
        return;
    };


    var createControlBox = function() {
        console.log('stack', stack)
        controls = document.createElement("div");
        controls.className = "canvasControls";
        controls.id = "canvasControlsId";
        controls.style.zIndex = 6;
        controls.style.width = "250px";
        controls.style.height = "300px";

        // more: http://kangax.github.com/fabric.js/kitchensink/

        var button_rasterize = document.createElement("button");
        button_rasterize.appendChild( document.createTextNode('Rasterize canvas!') );
        button_rasterize.onclick = function() {
            console.log('button click')
            if (!fabric.Canvas.supports('toDataURL')) {
                alert('This browser doesn\'t provide means to serialize canvas to an image');
            }
            else {
                window.open(canvasLayer.canvas.toDataURL('png'));
            }
        };
        controls.appendChild( button_rasterize );

        var button = document.createElement("button");
        button.appendChild( document.createTextNode('Clear canvas') );
        button.onclick = function() {
            if (confirm('Are you sure?')) {
                canvasLayer.canvas.clear();
            }
        };
        controls.appendChild( button );

        /*
         * Brush properties
         */

        var brush = document.createElement("div");
        var html = '<button id="drawing-mode">Enter drawing mode</button>' +
            '<div style="display:none;" id="drawing-mode-options">' +
            'Width: <input value="10" id="drawing-line-width" size="2">' +
            'Color: <input type="color" value="rgb(0,0,0)" id="drawing-color" size="15"></div>';
        brush.innerHTML = html;
        controls.appendChild( brush );

        // ******************
        stack.getView().appendChild( controls );
        // ******************

        var drawingModeEl = document.getElementById('drawing-mode'),
            drawingOptionsEl = document.getElementById('drawing-mode-options'),
            drawingColorEl = document.getElementById('drawing-color'),
            drawingLineWidthEl = document.getElementById('drawing-line-width');

        drawingModeEl.onclick = function() {
            canvasLayer.canvas.isDrawingMode = !canvasLayer.canvas.isDrawingMode;
            if (canvasLayer.canvas.isDrawingMode) {
                drawingModeEl.innerHTML = 'Cancel drawing mode';
                drawingModeEl.className = 'is-drawing';
                drawingOptionsEl.style.display = '';
            }
            else {
                drawingModeEl.innerHTML = 'Enter drawing mode';
                drawingModeEl.className = '';
                drawingOptionsEl.style.display = 'none';
            }
        };

        drawingColorEl.onchange = function() {
            canvasLayer.canvas.freeDrawingColor = drawingColorEl.value;
        };
        drawingLineWidthEl.onchange = function() {
            canvasLayer.canvas.freeDrawingLineWidth = parseInt(drawingLineWidthEl.value, 10) || 1; // disallow 0, NaN, etc.
        };

        canvasLayer.canvas.freeDrawingColor = drawingColorEl.value;
        canvasLayer.canvas.freeDrawingLineWidth = parseInt(drawingLineWidthEl.value, 10) || 1;

        // **************



    };

    this.removeControlBox = function() {
        // TODO: remove control box
    };

    var createCanvasLayer = function( parentStack )
    {
        stack = parentStack;
        canvasLayer = new CanvasLayer( parentStack );
        //this.prototype.mouseCatcher = tracingLayer.svgOverlay.getView();

        self.prototype.setMouseCatcher( canvasLayer.view );
        parentStack.addLayer( "CanvasLayer", canvasLayer );

        // TODO: no zooming or coordinates, but want customized
        // changing of sections
        // self.prototype.register( parentStack, "edit_button_trace" );

        // view is the mouseCatcher now
        var view = canvasLayer.view;

        /*
        var proto_onmousedown = view.onmousedown;
        view.onmousedown = function( e ) {
            console.log("onmouse down", ui.getMouseButton( e ) );
            return;
        };*/

        var proto_changeSlice = self.prototype.changeSlice;
        self.prototype.changeSlice =
            function( val ) {
                console.log('change slice');
                proto_changeSlice( val );
            };
    };

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {
        if (canvasLayer && stack) {
            if (stack !== parentStack) {
                // If the tracing layer exists and it belongs to a different stack, replace it
                stack.removeLayer( canvasLayer );
                createCanvasLayer( parentStack );
                createControlBox();
            } else {
                // reactivateBindings();
            }
        } else {
            createCanvasLayer( parentStack );
            createControlBox();
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
        console.log("destroy canvas");
        self.prototype.stack.removeLayer( "CanvasLayer" );

        // TODO: $( "#canvasControlsId" ).remove();

        canvasLayer.destroy();
        return;
    };

    this.redraw = function()
    {
        self.prototype.redraw();
    };

    /*
     * Keyboard actions
     */

    var actions = [

        new Action({
            helpText: "Blubb",
            keyShortcuts: {
                '+': [ 43, 107, 61, 187 ]
            },
            run: function (e) {
                //self.prototype.slider_s.move(1);
                return false;
            }
        }),

    ];

    var keyCodeToAction = getKeyCodeToActionMap(actions);

    /** This function should return true if there was any action
     linked to the key code, or false otherwise. */

    this.handleKeyPress = function( e ) {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
            keyAction.run(e);
            return true;
        } else {
            return false;
        }
    };

}
