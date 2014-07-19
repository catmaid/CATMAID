/***

SVGEvent.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

***/


////////////////////////////
//  Setup
////////////////////////////

if (typeof(dojo) != 'undefined') {
    dojo.require("SVGKit");
}
if (typeof(JSAN) != 'undefined') {
    JSAN.use("MochiKit.Iter", []);
}

try {
    if (typeof(SVGKit) == 'undefined') {
        throw "";
    }
} catch (e) {
    throw "SVGKitEvents depends on SVGKit!";
}


////////////////////////////
// Mouse Interaction
////////////////////////////

/*
    Events give the mouse coordinates as ineger number of pixels from the top left.
    SVG coordinates are different becuase elements can be transformed.
    This should be taken in to account.
    Currently Firefox seems to be broken here.
    http://www.kevlindev.com/tutorials/basics/transformations/toUserSpace/index.htm
*/

SVGKit.prototype.enableDrag = function(element, 
                                       downCallback /* optional */, 
                                       dragCallback /* optional */, 
                                       upCallback /* optional */, 
                                       elementsToMove /* = [ element ] */) {
    /***
        Enable element to be dragged when mouse moves.
        * element could have arbitrary transformation, and this
          appends translate transformation to it.
        * Eventually we should compensate for an SVG transformation
    ***/
    elementsToMove = SVGKit.firstNonNull(elementsToMove, [ element ]);
    
    var drag = {
        'element': element,
        'elementsToMove': elementsToMove,
        'downCallback': downCallback,
        'dragCallback': dragCallback,
        'upCallback': upCallback,
        'moving': false,
        'svg': this,
        'svgPosition': null,
        'original_transforms': [],  // The transformations elements had before the drag
        'setOriginalTransforms': function(elements) {
            for (var i=0; i<elements.length; i++) {
                this.original_transforms[i] = getNodeAttribute(elements[i], 'transform');
            }
        },
        'mousedown': function(e) {
            // Calculate the position (in windows coordinates) of the svg element
            // TODO:  MochiKit.Style.getElementPosition(this.htmlElement) doesn't work, 
            //        but the parentNode might not always give the same.
            // You have to do this in mouedown because the svg has to already be displayed.
            //this.svgPosition = MochiKit.Style.getElementPosition(this.svg.htmlElement.parentNode)
            var ctm = this.svg.htmlElement.getScreenCTM();
            this.svgPosition = new MochiKit.Style.Coordinates(ctm.e, ctm.f);
            this.setOriginalTransforms(this.elementsToMove);
            //this.svgPosition = MochiKit.Style.getElementPosition(this.svg.htmlElement)
            this.coords = e.mouse().client;  // Initial coordinates for later comparison.
            this.page = e.mouse().page;  // Initial page coordinates (we don't use)
            this.mousemove_signal =  MochiKit.Signal.connect(window, 'onmousemove', this, 'mousemove');
            this.mouseup_signal   =  MochiKit.Signal.connect(window, 'onmouseup',   this, 'mouseup');
            if (typeof(this.downCallback)=='function') {
                this.downCallback(e, this)
            }
            this.moving = true;
            e.stop();
        },
        'mousemove': function(e) {
            var dx = e.mouse().client.x - this.coords.x;
            var dy = e.mouse().client.y - this.coords.y;
            for (var i=0; i<elementsToMove.length; i++) {
                //log('original_transforms:', this.original_transforms[i])
                var new_transform = this.svg.translate(this.original_transforms[i], dx, dy);
                //log('new_transform:', new_transform)
                this.elementsToMove[i].setAttribute('transform', new_transform);
            }
            if (typeof(this.dragCallback)=='function') {
                this.dragCallback(e, this)
            }
            e.stop();
            //log('transform = ' + getNodeAttribute(this.element, 'transform'));
        },
        'mouseup': function(e) {
            MochiKit.Signal.disconnect(this.mousemove_signal);
            MochiKit.Signal.disconnect(this.mouseup_signal);
            if (typeof(this.upCallback)=='function') {
                this.upCallback(e, this)
            }
            this.moving = false;
            e.stop();
        }
    };
    drag.mousedown_signal =  MochiKit.Signal.connect(element, 'onmousedown', drag, 'mousedown');
    return drag
}

SVGKit.prototype.enableRotate = function(element, 
                                         pivot /* {x:0, y:0} */,
                                         downCallback /* optional */, 
                                         dragCallback /* optional */, 
                                         upCallback /* optional */, 
                                         elementsToMove /* = [ element ] */) {
    /***
        Enable element to be dragged when mouse moves.
        * element could have arbitrary transformation, and this
          appends translate transformation to it.
        * Eventually we should compensate for an SVG transformation
    ***/
    pivot = SVGKit.firstNonNull(pivot, new MochiKit.Style.Coordinates(0,0));
    elementsToMove = SVGKit.firstNonNull(elementsToMove, [ element ]);
    
    var rotate = {
        'pivot': pivot,
        'elementsToMove': elementsToMove,
        'downCallback': downCallback,
        'dragCallback': dragCallback,
        'upCallback': upCallback,
        'th0': 0, // Initial angle of the mouse with respect to pivot (radians)
        'th': 0, // Current angle of the mouse with respect to pivot (radians)
        'radians': 0, // Radians of rotation of the mouse around the pivot since mouseDown 
        'degrees': 0, // Degrees of rotation of the mouse around the pivot since mouseDown 
        'myDownCallback' : function(e, drag) {
            drag.setOriginalTransforms(this.elementsToMove);
            drag.rotate = this;
            
            // Initial mouse coordinates
            var mx = e.mouse().client.x
            var my = e.mouse().client.y
            // Find initial mouse angle with respect to the pivot.
            drag2 = drag;
            var x0 = mx - drag.svgPosition.x - this.pivot.x
            var y0 = my - drag.svgPosition.y - this.pivot.y
            this.th0 = Math.atan2(y0, x0)
            
            this.last_rotate = 0
            
            if (typeof(this.downCallback)=='function') {
                this.downCallback(e, drag)
            }
        },
        
        'myDragCallback' : function(e, drag) {
            var rotate = drag.rotate
        
            // Current mouse coordinates
            var mx = e.mouse().client.x
            var my = e.mouse().client.y
            // Find current mouse angle with respect to the pivot.
            var dx = mx - drag.svgPosition.x - this.pivot.x
            var dy = my - drag.svgPosition.y - this.pivot.y
            this.th = Math.atan2(dy, dx)

            this.radians = this.th - this.th0
            this.degrees = this.radians * 180 / Math.PI
            //var total_rotate = -this.last_rotate + angle
            /*
            log("svg:", drag.svgPosition,"pivot",this.pivot,
               "initial coords:", drag.coords, "coords:", e.mouse().client, 
               //"initial page:", drag.page, "page:", e.mouse().page, 
               "d:", new MochiKit.Style.Coordinates(dx, dy),
               "th0:",(this.th0/Math.PI*180).toPrecision(4), "th:",(this.th/Math.PI*180).toPrecision(4),
               "degrees:", this.degrees.toPrecision(4))
               */

            for (var i=0; i<elementsToMove.length; i++) {
                // TODO:  Rotate element around pivot given it's own transform.
                var original = SVGKit.firstNonNull(drag.original_transforms[i], '');
                var new_transform =  original
                new_transform = drag.svg.translate(new_transform, this.pivot.x, this.pivot.y);
                new_transform = drag.svg.rotate(new_transform, this.degrees);
                new_transform = drag.svg.translate(new_transform, -this.pivot.x, -this.pivot.y);
                //log('new_transform:',new_transform);
                this.elementsToMove[i].setAttribute('transform', new_transform);
            }
            
            if (typeof(this.dragCallback)=='function') {
                this.dragCallback(e, drag)
            }
        }
    }
    this.enableDrag(element, bind(rotate.myDownCallback, rotate),
                             bind(rotate.myDragCallback, rotate), 
                             upCallback,
                             [])
}

SVGKit.prototype.enableFollow = function(element) {
    /***
        Enable element to follow mouse.
    ***/
}

SVGKit.prototype.enablePan = function(element) {
    /***
        Enable content wthin element to be panned.  element should be a <g> element.
    ***/
}

SVGKit.prototype.enableZoom = function(element) {
    /***
        Enable content wthin element to be zoomed.  element should be a <g> element.
    ***/
}



SVGKit.down = function(self, evt) {
    log("mouse down", evt.clientX, evt.clientY);
    self.clientX = evt.clientX;
    self.clientY = evt.clientY;
    self.moving = true;
}

SVGKit.move = function(self, evt) {
    if (self.moving) {
        self.translate(evt.clientX-self.clientX, evt.clientY-self.clientY);
        self.clientX = evt.clientX;
        self.clientY = evt.clientY;
    }
}

SVGKit.up = function(self, evt) {
    log("mouse up", evt.clientX, evt.clientY);
    self.clientX = evt.clientX;
    self.clientY = evt.clientY;
    self.moving = false;
    self.loadStars()
    StarChart.svg.svgElement.forceRedraw()
}


SVGKit.prototype.enablePanZoomImmunity = function(element) {
    /***
        SVG Viewers should allow panning and zooming.  Simetimes
        you want most of your content to be panned and zoomed, but something
        like status information should stay constant.
    ***/
}


