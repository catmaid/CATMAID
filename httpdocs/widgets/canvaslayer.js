/**
 * The Canvas layer that hosts the tracing data
 */
function CanvasLayer( stack )
{

    this.setOpacity = function( val )
    {
        self.view.style.opacity = val+"";
        opacity = val;
    }

    this.getOpacity = function()
    {
        return opacity;
    }

    this.redraw = function()
    {
        //var pixelPos = [ stack.x, stack.y, stack.z ];
        //console.log("redraw pixel pos", pixelPos);
        this.updateDimension();
        return;
    }

    this.resize = function( width, height )
    {
        //console.log("new siye", width, height);
        self.redraw();
        return;
    }

    this.updateDimension = function()
    {
        // console.log("update dimension");
        var wi = Math.floor(stack.dimension.x * stack.scale);
        var he = Math.floor(stack.dimension.y * stack.scale);
        view.style.width = wi + "px";
        view.style.height = he + "px";

        canvashtml.style.width = wi + "px";
        canvashtml.style.height = he + "px";

        var wc = stack.getWorldTopLeft();
        var pl = wc.worldLeft,
            pt = wc.worldTop,
            new_scale = wc.scale;

        self.view.style.left = Math.floor((-pl / stack.resolution.x) * new_scale) + "px";
        self.view.style.top = Math.floor((-pt / stack.resolution.y) * new_scale) + "px";

    }

    this.show = function () {
        view.style.display = "block";
    };
    this.hide = function () {
        view.style.display = "none";
    };

    var self = this;

    // internal opacity variable
    var opacity = 100;

    var view = document.createElement("div");
    view.className = "canvasOverlay";
    view.id = "canvasOverlayId";
    view.style.zIndex = 6;
    view.style.opacity = 1.0;
    self.view = view;

    // XXX: add it here to DOM?
    stack.getView().appendChild( view );


/*
    view.onmousemove = function( e ) {
        console.log("onmouse move");
        var wc;
        var worldX, worldY;
        var stackX, stackY;
        m = ui.getMouse(e, stack.getView(), true);
        if (m) {
            wc = stack.getWorldTopLeft();
            worldX = wc.worldLeft + ((m.offsetX / stack.scale) * stack.resolution.x);
            worldY = wc.worldTop + ((m.offsetY / stack.scale) * stack.resolution.y);
            lastX = worldX;
            lastY = worldY;
            statusBar.replaceLast('['+worldX+', '+worldY+', '+project.coordinates.z+']');
            self.offsetXPhysical = worldX;
            self.offsetYPhysical = worldY;
        }
    }
*/
    var canvashtml = document.createElement("canvas")
    canvashtml.id = "myCanvas"
    canvashtml.style.border = "1px";
    this.view.appendChild( canvashtml );
    self.updateDimension();



/*
    var context;

    // Check the element is in the DOM and the browser supports canvas
    if(canvashtml.getContext) {
        // Initaliase a 2-dimensional drawing context
        context = canvashtml.getContext('2d');
    } else {
        alert('Canvas not supported by browser!');
    }

    var img = new Image;
    // Important to have the onload
    // http://stackoverflow.com/questions/4773966/drawing-an-image-from-a-data-url-to-a-canvas
    img.onload = function(){
        console.log('onload');
        var wi = Math.floor(stack.dimension.x * stack.scale);
        var he = Math.floor(stack.dimension.y * stack.scale);
        context.drawImage(img,0,0, wi, he); // Or at whatever offset you like
    };
    // TODO: hardcoded url
    // img.src = "http://localhost/catmaid-test/dj/3/stack/3/z/0/png";
*/
    // add red rectangle

    var canvas = new fabric.Canvas( 'myCanvas' , {'interactive':true} );

    var wi = Math.floor(stack.dimension.x * stack.scale);
    var he = Math.floor(stack.dimension.y * stack.scale);
    canvas.setWidth( wi );
    canvas.setHeight( he );

    canvas.add(
        new fabric.Rect({ top: 50, left: 50, width: 50, height: 50, fill: '#f55' })
    );
    self.canvas = canvas;


    var rect = new fabric.Rect({
        top: 100,
        left: 100,
        width: 60,
        height: 70,
        fill: 'red'
    });
    canvas.add(rect);

    this.destroy = function()
    {
        console.log("destroy canvas layer");
    };

    /*
    this.webglOverlay = new WebGL.WebGLOverlay( stack );

    this.resize = function ( width, height )
    {
        //console.log("resize (redraw) webgllayer");
        self.webglOverlay.redraw( stack );
        return;
    }

    this.setOpacity = function ( val )
    {
        self.webglOverlay.view.style.opacity = val+"";
    };

    this.redraw = function()
    {
        // console.log("redraw webgllayer");
        self.webglOverlay.redraw( stack );
        return;
    };

    this.unregister = function()
    {
        console.log("unregister webgllayer");
    };

    this.destroy = function()
    {
        console.log("destroy webgl layer");
    };

*/

}
