/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** A namespace to contain the current state of skeleton annotations. */
var WebGL = new function()
{
    var WebGLOverlays = {};

    this.getWebGLOverlay = function ( stack ) {
        return WebGLOverlays[stack];
    }

    this.WebGLOverlay = function ( stack )
    {
        var self = this;

        // Register instance: only one per stack allowed
        WebGLOverlays[stack] = this;

        this.whenclicked = function (e) {
            var m = ui.getMouse(e, self.view);
            console.log("whenclicked webgl", e);
        }

        /** Unregister the WebGLOverlays instance and perform cleanup duties. */
        this.destroy = function() {
            if (self === WebGLOverlays[stack]) {
                delete WebGLOverlays[stack];
            }
        };

        // Initialize to the value of stack.scale at instantiation of SVGOverlay
        var old_scale = stack.scale;

        this.redraw = function( stack ) {
            console.log("redraw", stack);
            var wc = stack.getWorldTopLeft();
            var pl = wc.worldLeft,
                pt = wc.worldTop,
                new_scale = wc.scale;
            console.log("redrawW ", stack, wc);
            self.view.style.left = Math.floor((-pl / stack.resolution.x) * new_scale) + "px";
            self.view.style.top = Math.floor((-pt / stack.resolution.y) * new_scale) + "px";

            var wi = Math.floor(stack.dimension.x * stack.scale);
            var he = Math.floor(stack.dimension.y * stack.scale);
            console.log(self.view.style.left, wi,he);
            view.style.width = wi + "px";
            view.style.height = he + "px";

        }

        // offset of stack in physical coordinates
        this.offleft = 0;
        this.offtop = 0;
        this.offsetXPhysical = 0;
        this.offsetYPhysical = 0;

        var view = document.createElement("div");
        view.className = "sliceWebGLOverlay";
        view.id = "sliceWebGLOverlayId";
        view.style.zIndex = 5;
        // Custom cursor for tracing
        //view.style.cursor ="url(../themes/kde/svg-circle.cur) 15 15, crosshair";
        // make view accessible from outside for setting additional mouse handlers
        this.view = view;


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

        this.show = function () {
            view.style.display = "block";
        };
        this.hide = function () {
            view.style.display = "none";
        };

    }

}