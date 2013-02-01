/**
 * The Canvas layer that hosts the tracing data
 */


function CanvasLayer( stack, tool )
{
    // define the x,y location and width and height of the
    // current field of view of the canvas in bitmap pixel
    var xindex, yindex, width, height;

    this.setOpacity = function( val )
    {
        self.view.style.opacity = val;
        opacity = val;
    }

    this.getOpacity = function()
    {
        return opacity;
    }

    this.redraw = function()
    {
        self.setFieldOfView();

        return;
    }

    this.resize = function( width, height )
    {
        // TODO: Resize is called too much
        //this.setFieldOfView();
        self.redraw();
        if( tool ) {
            tool.update();
        }
            
        return;
    }

    this.getFieldOfViewParameters = function()
    {
        var wc = stack.getWorldTopLeft();
        var pl = wc.worldLeft,
            pt = wc.worldTop,
            new_scale = wc.scale;
        var l = {
            x: xindex,
            y: yindex,
            width: width,
            height: height
        };
        return l;
    }

    this.setFieldOfView = function()
    {
        var fv = stack.getFieldOfViewInPixel(),
            canvasleft, canvastop, leftbar, topbar;

        if( fv.worldLeftC < 0 ) {
            // left black bar exists
            xindex = 0;
            canvasleft = Math.abs( fv.worldLeftC );
            leftbar = true;
        } else {
            // no left black bar exists
            xindex = Math.floor( fv.worldLeft );
            canvasleft = 0;
            leftbar = false;
        }

        if( fv.worldTopC < 0 ) {
            yindex = 0;
            canvastop = Math.abs( fv.worldTopC );
            topbar = true;
        } else {
            yindex = Math.floor( fv.worldTop );
            canvastop = 0;
            topbar = false;
        }

        if( !leftbar ) {
            // no left bar exists, we need to check whether the stack
            // width in the current scale is smaller than the currently
            // displayed div width
            if( (fv.stackScaledWidth - Math.abs(fv.worldLeftC) ) < fv.stackDivWidth ) {
                // right black bar exists
                width = fv.stackScaledWidth - Math.abs(fv.worldLeftC) ;
            } else {
                // no right bar exists
                width = fv.stackDivWidth;
            }
        } else {
            // left bar exists
            if( (fv.stackScaledWidth + Math.abs(fv.worldLeftC) ) < fv.stackDivWidth ) {
                // right bar exists
                width = fv.stackScaledWidth;
            } else {
                // no right bar exits
                width = fv.stackDivWidth - Math.abs(fv.worldLeftC) ;
            }
        }

        if( !topbar ) {
            if( (fv.stackScaledHeight - Math.abs(fv.worldTopC) ) < fv.stackDivHeight ) {
                // bottom black bar exists
                height = fv.stackScaledHeight - Math.abs(fv.worldTopC) ;
            } else {
                // no bottom bar exists
                height = fv.stackDivHeight;
            }
        } else {
            if( (fv.stackScaledHeight + Math.abs(fv.worldTopC) ) < fv.stackDivHeight ) {
                // bottom bar exists
                height = fv.stackScaledHeight;
            } else {
                // no botttom bar exits
                height = fv.stackDivHeight - Math.abs(fv.worldTopC) ;
            }
        }
        //console.log('new canvas dimension',canvasleft, canvastop,width, height )
        self.updateCanvasLeftTop( canvasleft, canvastop );
        self.updateCanvasWidthHeight( width, height );
    }

    this.updateCanvasWidthHeight = function( width, height )
    {
        view.style.width = width + "px";
        view.style.height = height + "px";

        canvashtml.style.width = width + "px";
        canvashtml.style.height = height + "px";

        canvas.setWidth( width );
        canvas.setHeight( height );
    }

    this.updateCanvasLeftTop = function( left, top )
    {
        self.view.style.left = left + "px";
        self.view.style.top = top + "px";
    }

    this.show = function () {
        view.style.display = "block";
    };
    this.hide = function () {
        view.style.display = "none";
    };

    var self = this;

    // internal opacity variable
    var opacity = 50;

    var view = document.createElement("div");
    view.className = "canvasOverlay";
    view.id = "canvasOverlayId";
    // view.style.zIndex = 5;
    view.style.opacity = 0.5;
    //view.style.border = "solid red 4px";
    //view.style.position = 'absolute';
    self.view = view;

    // XXX: add it here to DOM
    stack.getView().appendChild( view );

    var canvashtml = document.createElement("canvas");
    canvashtml.id = "myCanvas";
    canvashtml.style.border = "0px";
    self.view.appendChild( canvashtml );

    // CURSOR: "url(widgets/themes/kde/svg-circle.cur) 15 15, crosshair"
    var canvas = new fabric.Canvas( 'myCanvas' , 
        {interactive: true,
         defaultcursor: 'pointer',
         hoverCursor: 'crosshair' });

    canvas.isDrawingMode = false;
    self.canvas = canvas;
    self.setFieldOfView();

    this.unregister = function()
    {
        //self.stack.getView().removeChild( view );
    };

}
