/**
 * The WebGL layer that hosts the tracing data
 */
function WebGLLayer( stack )
{

    this.setOpacity = function( val )
    {
        console.log("opacity", val);
        self.view.style.opacity = val+"";
        opacity = val;
    }

    this.getOpacity = function()
    {
        return opacity;
    }

    this.redraw = function()
    {
        var pixelPos = [ stack.x, stack.y, stack.z ];
        console.log("redraw pixel pos", pixelPos);
        this.updateDimension();
        return;
    }

    this.resize = function( width, height )
    {
        console.log("new siye", width, height);
        self.redraw();
        return;
    }

    this.updateDimension = function()
    {
        console.log("update dimension");
        var wi = Math.floor(stack.dimension.x * stack.scale);
        var he = Math.floor(stack.dimension.y * stack.scale);
        view.style.width = wi + "px";
        view.style.height = he + "px";

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
    view.className = "webGLOverlay";
    view.id = "webGLOverlayId";
    view.style.zIndex = 6;
    view.style.opacity = 1.0;
    self.view = view;

    var button = document.createElement("img");
    button.src = "http://www.google.ch/images/nav_logo99.png";

    view.appendChild(button);

    // XXX: add it here to DOM?
    stack.getView().appendChild( view );

    this.destroy = function()
    {
        console.log("destroy webgl layer");
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
