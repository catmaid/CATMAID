/**
* Volume tracing tool
* 
* Note that at this early stage in development, nomenclature has not 
* yet been settled. As such, you will find references to Volume Tracing,
* Area Tracing and Area Segmentation, which are all subtle variations on
* the same concept. IE, they all relate here.
*/




var traceBrushSize = 16;
var VolumeTraceLastID = 0; 
function VolumeTracingTool()
{
    this.prototype = new Navigator();
    
    var self = this;
    var canvasLayer = null;
    var isDragging = false;    
    var enabled = false;
    
    this.stack = null;
    this.toolname = "Volume Tracing Tool";
    //var canvasLayer = null;
    this.brush = null;
    
    this.volumeAnnotation = VolumeTracingAnnotations;
    this.currentTrace = null;
    this.traces = [];
    
    this.lastPos = null;
    this.lastScale = 1;
    this.lastZ = 0;
    
    this.proto_mouseup = null;
    
    this.registerToolbar = function()
    {
        if (VolumeTracingPalette.isWindowClosed())
        {
            /*
             * If the tool button is clicked when this tool is already active,
             * the window will be closed when we reach this point in execution,
             * causing things to break in a kind-of-gross way.
            */
            WindowMaker.show('volume-tracing');
        }

        self.brush_slider = new Slider(SLIDER_HORIZONTAL, true, 1, 100, 100, traceBrushSize,
            self.changeSlice);
        var nav = self.prototype;

        //document.getElementById("toolbar_volseg").style.display = "block";
        $("#toolbar_volseg")[0].style.display = "block";
        //var slider_box = document.getElementById("volseg_radius_box");
        var slider_box = $("#volseg_radius_box")[0];
        
        while (slider_box.firstChild)
        {
            slider_box.removeChild(slider_box.firstChild);
        }
        
        var slider_b_box = document.createElement("div");
        slider_b_box.className = "box";
        slider_b_box.id = "volseg_b_box";
        var slider_b_box_label = document.createElement("p");
        slider_b_box_label.appendChild(document.createTextNode("Paintbrush size" + "     "))
        slider_b_box.appendChild(slider_b_box_label);
        slider_b_box.appendChild(self.brush_slider.getView());
        slider_b_box.appendChild(self.brush_slider.getInputView());
        slider_box.appendChild(slider_b_box);
    };
    
    this.setViewProps = function(vp)
    {
        var tid = VolumeTracingPalette.trace_id;        
        var traces = self.getTracesByInstance(tid);
                
        self.brush.fill = vp.color;
        if (enabled)
        {
            self.brush.opacity = vp.opacity;
        }

        for (var i = 0; i < traces.length; i++)
        {
            traces[i].setViewProps(vp);
        }
        
        canvasLayer.canvas.renderAll();
    }
    
    var bringActiveTracesForward = function()
    {
        var tid = VolumeTracingPalette.trace_id;
        var activeTraces = self.getTracesByInstance(tid);
        for (var i = 0; i < activeTraces.length; i++)
        {
            activeTraces[i].bringToFront();
        }
    }
    
    this.enable = function()
    {
        self.brush.set({'opacity' : .5});
        enabled = true;
        bringActiveTracesForward();
        self.brush.bringToFront();
        canvasLayer.canvas.renderAll();
    }
    
    this.disable = function()
    {
        self.brush.set({'opacity' : 0});
        enabled = false;
    }
    
    
    this.redraw = function()
    {
        var currPos = self.stack.screenPosition();
        var scale = self.stack.scale;
        var lastScale = self.lastScale;
        var lastPos = self.lastPos;
        var dZ = self.currentZ() - self.lastZ;
        var lastMouseXY = null;

        
        self.cacheScreen();
        
        if (scale == lastScale && dZ == 0)
        {
            for (var i = 0; i < self.traces.length; i++)
            {
                self.traces[i].translate(currPos, lastPos, scale);
            }
        }
        else
        {
            var oldTraces = self.traces;
            // If we switched sections, remove the old traces after adding the new ones, to avoid
            // flickering.
            var callfun = dZ ? 
                function(data){
                    self.pullTraces(data);
                    for (var i = 0; i < oldTraces.length; i++)
                    {
                            oldTraces[i].setObjects([]);
                    }
                } : self.pullTraces;
            
            if (dZ)
            {
                self.traces = [];            
            }
            
            self.cacheScreen();
            self.volumeAnnotation.retrieveAllTraces(callfun);
                     
        }
        
        canvasLayer.canvas.renderAll();        
    }
    
    this.pullTraces = function(data)
    {
        //console.log(data);
        
        for (var ii = 0; ii < data.i.length; ii++)
        {
            var id = data.i[ii];
            var trace = self.getTraceByID(id);
            var objects = [];
            var svg = data.svg[ii];
            var vp = data.vp[ii];
            var trace_id = data.tid[ii];
            
            if (trace == null)
            {
                trace = self.createNewTrace();
                trace.id = id;                
            }
            
            trace.trace_id = trace_id;
            trace.populateSVG(svg);
            trace.setViewProps(vp);
            trace.sendToBack();
        }
        bringActiveTracesForward();
        self.brush.bringToFront();
        canvasLayer.canvas.renderAll();
    }
    
    this.pullNewTraces = function(data)
    {
        for (var ii = 0; ii < data.i.length; ii++)
        {
            var id = data.i[ii];
            var trace = self.getTraceByID(id);
            var objects = [];
            var svg = data.svg[ii];
            var trace_id = data.tid[ii];
            var vp = data.vp[ii];
            
            if (trace == null)
            {
                trace = self.createNewTrace();
                trace.id = id;
                trace.populateSVG(svg);
                trace.trace_id = trace_id;
                trace.setViewProps(vp);
                trace.sendToBack();
            }
        }
        bringActiveTracesForward();
        self.brush.bringToFront();
        canvasLayer.canvas.renderAll();
    }
    
    this.getTraceByID = function(id)
    {
        for (var i = 0; i < self.traces.length; i++)
        {
            if (self.traces[i].id == id)
            {
                return self.traces[i];
            }
        }
        return null;
    }
    
    this.getTracesByInstance = function(trace_id)
    {
        traces = [];
        for (var i = 0; i < self.traces.length; i++)
        {
            if (self.traces[i].trace_id == trace_id)
            {
                traces.push(self.traces[i]);
            }
        }
        return traces;
    }
    
    this.createNewTrace = function()
    {
        VolumeTraceLastID--;        
        var trace = new fabricTrace(
            self.stack,
            canvasLayer, 
            VolumeTraceLastID,
            self.brush_slider.val,
            VolumeTracingPalette.trace_id,
            VolumeTracingPalette.view_props);
        self.traces.push(trace);
        return trace;
    }
    
    this.cacheScreen = function()
    {
        self.lastPos = self.stack.screenPosition();
        self.lastScale = self.stack.scale;
        self.lastZ = self.currentZ();
    }
    
    this.currentZ = function()
    {
        return self.stack.z * self.stack.resolution.z + self.stack.translation.z;
    }
    
    /**
     * Create the canvas layer using fabric.js
     */
    this.createCanvasLayer = function ()
    {
        canvasLayer = new CanvasLayer( self.stack, self );        
        canvasLayer.setOpacity(1);
        
        var h = canvasLayer.canvas.getHeight();
        var w = canvasLayer.canvas.getWidth();
        self.brush = new fabric.Circle({top: 200, left: 200, radius: self.brush_slider.val,
            fill: VolumeTracingPalette.view_props.color, opacity: 0});        
        self.brush.setActive(false);
        canvasLayer.canvas.add(self.brush);
        self.brush.bringToFront();
        canvasLayer.canvas.interactive = true;
        
        
        self.stack.addLayer("VolumeCanvasLayer", canvasLayer);
        self.stack.resize();
    }
    
    var onmouseup = function(e)
    {        
        if (isDragging)
        {
            isDragging = false;
            if (enabled)
            {
                self.currentTrace.addObject(self.brush.clone());
                self.volumeAnnotation.pushTrace(self.currentTrace);
            }
        }
        else
        {
            self.proto_mouseup(e);
        }
    }
    
    
    
    var onmousemove = 
    {
        pos: function(e)
        {
            var m = ui.getMouse(e, self.stack.getView());
            if (m)
            {
                var xp = self.stack.translation.x + ( self.stack.x + ( m.offsetX - 
                    self.stack.viewWidth / 2 ) / self.stack.scale );
                var yp = self.stack.translation.y + ( self.stack.y + ( m.offsetY - 
                    self.stack.viewHeight / 2 ) / self.stack.scale );
                var pos_x = xp * self.stack.resolution.x;
                var pos_y = yp * self.stack.resolution.y;
                statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 
                    3 ) + " nm] = [" + xp + ", " + yp + " px]" + ", mx = " + m.offsetX + ", my = " + m.offsetY);
                
                self.brush.set({'left': m.offsetX, 'top': m.offsetY});
                
                if (isDragging && enabled)
                {
                    var minSqR = Math.pow(self.brush_slider.val / 2, 2);
                    if (Math.pow(e.offsetX - self.lastMouseXY.x, 2) +
                        Math.pow(e.offsetY - self.lastMouseXY.y, 2) >= minSqR)
                    {
                        var spot = self.brush.clone();
                        self.currentTrace.addObject(spot);
                        self.lastMouseXY = {"x": m.offsetX, "y": m.offsetY};
                    }
                }
                
                canvasLayer.canvas.renderAll();

            }
            return false;
        }        
    };
    
    var onmousedown = function(e)
    {
        if (enabled)
        {
            self.lastMouseXY = {"x": e.offsetX, "y": e.offsetY};
            self.currentTrace = self.createNewTrace();        
            isDragging = true;
            var spot = self.brush.clone();
            self.currentTrace.addObject(spot);
        }
    }

    var onmousewheel = function(e)
    {
        var w = ui.getMouseWheel( e );
        if ( w )
        {
            w = self.stack.inverse_mouse_wheel * w;
            if ( w > 0 )
            {
                if( e.shiftKey ) {
                    self.brush_slider.move(1);
                } else if (e.altKey) {
                    var clOpacity = canvasLayer.getOpacity() / 100 + .1;
                    if (clOpacity > 1)
                    {
                        clOpacity = 1;
                    }
                    canvasLayer.setOpacity(clOpacity);
                    self.stack.overviewlayer.refresh();
                } else {
                    self.prototype.slider_z.move( 1 );
                }
            }            
            else
            {
                if( e.shiftKey ) {
                    self.brush_slider.move(-1);
                } else if (e.altKey) {
                    var clOpacity = canvasLayer.getOpacity() / 100 - .1;
                    if (clOpacity < 0)
                    {
                        clOpacity = 0;
                    }
                    canvasLayer.setOpacity(clOpacity);
                    self.stack.overviewlayer.refresh();
                } else {
                    self.prototype.slider_z.move( -1 );
                }

            }
        }
        return false;
    }
    
    this.prototype.onmousewheel.zoom = onmousewheel;
    
    this.register = function(parentStack)
    {
        self.stack = parentStack;
        self.registerToolbar();
        self.createCanvasLayer();
        
        //document.getElementById("toolbar_volseg").style_display = "block";
        $("#toolbar_volseg")[0].style_display = "block";
        
        self.prototype.setMouseCatcher( canvasLayer.view );
        self.prototype.register( parentStack, "volume_tracing_button" );
        
        var proto_mousedown = canvasLayer.view.onmousedown;
        self.proto_mouseup = canvasLayer.view.onmouseup ? canvasLayer.view.onmouseup : function(e){};
        
        canvasLayer.view.onmousemove = onmousemove.pos;
        canvasLayer.view.onmousedown = function(e)
        {
            switch (ui.getMouseButton(e))
            {
                case 1:
                    onmousedown(e);                    
                    break;
                case 2:
                    proto_mousedown(e);
                    break;
            }
            return ;
        }
        canvasLayer.view.onmouseup = onmouseup;
        
        self.createNewTrace();
        
        self.stack.getView().appendChild(canvasLayer.view);
        self.volumeAnnotation.setStack(self.stack);
        self.volumeAnnotation.tool = self;
        
        self.volumeAnnotation.retrieveAllTraces(self.pullTraces);
        self.cacheScreen();
        
        return;
    };
    
    this.unregister = function()
    {
        
        if (self.stack && canvasLayer.view.parentNode == self.stack.getView())
        {
            self.stack.getView().removeChild(canvasLayer.view);
        }
        return;
    };
    
    this.destroyToolbar = function()
    {
        var toolbar = $("#toolbar_volseg");
        if (toolbar.length)
        {
            $("#toolbar_volseg")[0].style.display = "none";
        }
        
        traceBrushSize = self.brush_slider.val;
        self.brush_slider.update(0, 1, undefined, 0, null);
    };
    
    this.destroy = function()
    {
        self.stack.removeLayer( "VolumeCanvasLayer" );
        self.prototype.destroy( "volume_tracing_button" );
        canvasLayer.canvas.clear();

        self.destroyToolbar();
        VolumeTracingPalette.closeWindow();

        self.unregister();

        canvasLayer = null;
        self.volumeAnnotation.tool = null;
        self.stack = null;

        return;
    };

    this.handleKeyPress = function(e)
    {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
            //tracingLayer.svgOverlay.ensureFocused();
            return keyAction.run(e);
        } else {
            return false;
        }
    };
    
    this.changeSlice = function(val)
    {
        statusBar.replaceLast("VRad: " + val);
        self.brush.set({'radius': val});
        canvasLayer.canvas.renderAll();
        //self.brush.setCoords();
        return;
    };

    this.resize = function(width, height)
    {
        canvasLayer.view.style.width = width + "px";
        canvasLayer.view.style.height = height + "px";
        return;
    };
        
    var actions = [];

    this.addAction = function ( action ) {
        actions.push( action );
    };

    this.getActions = function () {
        return actions;
    };

    
    var clearTraces = function(traceList)
    {
        for (var i = 0; i < traceList; i++)
        {
            self.traces[i].setObjects([]);            
        }        
    }


    var arrowKeyCodes = {
        left: 37,
        up: 38,
        right: 39,
        down: 40
    };

    this.addAction(
        new Action({helpText: "Zoom in",
                    keyShortcuts: {'+': [ 43, 107, 61, 187 ]},
                    run: function (e) {self.prototype.slider_s.move(1); return true;}
                    }));

    this.addAction( new Action({helpText: "Zoom out",
                                keyShortcuts: {'-': [ 45, 109, 189 ]},
                                run: function (e) { self.prototype.slider_s.move(-1); return true;}
                                }));

    this.addAction( new Action({
        helpText: "Move up 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            ',': [ 44, 188 ]
        },
        run: function (e) {
            self.prototype.slider_z.move(-(e.shiftKey ? 10 : 1));
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move down 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            '.': [ 46, 190 ]
        },
        run: function (e) {
            self.prototype.slider_z.move((e.shiftKey ? 10 : 1));
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move left (towards negative x)",
        keyShortcuts: {
            "\u2190": [ arrowKeyCodes.left ]
        },
        run: function (e) {
            self.prototype.input_x.value = parseInt(self.prototype.input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
            self.prototype.input_x.onchange(e);
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move right (towards positive x)",
        keyShortcuts: {
            "\u2192": [ arrowKeyCodes.right ]
        },
        run: function (e) {
            self.prototype.input_x.value = parseInt(self.prototype.input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
            self.prototype.input_x.onchange(e);
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move up (towards negative y)",
        keyShortcuts: {
            "\u2191": [ arrowKeyCodes.up ]
        },
        run: function (e) {
            self.prototype.input_y.value = parseInt(self.prototype.input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
            self.prototype.input_y.onchange(e);
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move down (towards positive y)",
        keyShortcuts: {
            "\u2193": [ arrowKeyCodes.down ]
        },
        run: function (e) {
            self.prototype.input_y.value = parseInt(self.prototype.input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
            self.prototype.input_y.onchange(e);
            return true;
        }
    }) );
    
    var keyCodeToAction = getKeyCodeToActionMap(actions);
}

function displayPxToStackPxX(x, stack)
{
    return stack.translation.x +
        ( stack.x + ( x - stack.viewWidth / 2 ) / stack.scale );
}

function displayPxToStackPxY(y, stack)
{
    return stack.translation.y +
        ( stack.y + ( y - stack.viewHeight / 2 ) / stack.scale );
}

function displayPxToStackPxXArray(x, stack)
{
    for (var i = 0; i < x.length; i++)
    {
        x[i] = displayPxToStackPxX(x[i], stack);
    }
}

function displayPxToStackPxYArray(y, stack)
{
    for (var i = 0; i < y.length; i++)
    {
        y[i] = displayPxToStackPxY(y[i], stack);
    }
}

function displayPxToStackNmArrayX(x, stack)
{
    for (var i = 0; i < x.length; i++)
    {
        x[i] = displayPxToStackPxX(x[i]) * stack.resolution.x;
    }
}

function displayPxToStackNmArrayY(y, stack)
{
    for (var i = 0; i < y.length; i++)
    {
        y[i] = displayPxToStackPxY(y[i]) * stack.resolution.y;
    }
}


function stackPxToDisplayPxX(x, stack)
{
    return stack.scale * (x - stack.translation.x - stack.x) + 
        stack.viewWidth / 2;
}

function stackPxToDisplayPxY(y, stack)
{
    return stack.scale * (y - stack.translation.y - stack.y) + 
        stack.viewHeight / 2;
}

function stackPxToDisplayPxXArray(x, stack)
{
    for (var i = 0; i < x.length; i++)
    {
        x[i] = stackPxToDisplayPxX(x[i], stack);
    }
}

function stackPxToDisplayPxYArray(y, stack)
{
    for (var i = 0; i < y.length; i++)
    {
        y[i] = stackPxToDisplayPxY(y[i], stack);
    }
}



function fabricTrace(stack, cl, objid, r, instanceid, vp)
{
    var self = this;
    this.canvasLayer = cl;
    this.objectList = []; //List of fabric.js Objects
    this.r = r / stack.scale;
    this.x = []; // x,y trace in stack pixel coordinates
    this.y = [];
    this.stack = stack;
    this.trace_id = instanceid;
    // vp should be a js object like 
    // vp = {'color': '#00ffff', 'opacity': 0.5}
    this.view_props = vp;
    
    /**
     * A fabricTrace's ID will be negative if it has not yet been synced
     * with the database. If it overlaps an existing trace, it gets 
     * erased and merged with that one. If it is nonoverlapping, it 
     * gets an objectID from the database, which will be positive.
     */
    this.id = objid;
    
    this.addToCanvas = function()
    {
        var canvas = self.canvasLayer.canvas;
        for (var i = 0; i < self.objectList.length; i++)
        {
            canvas.add(self.objectList[i]);
        }
        self.canvasLayer.canvas.renderAll();
    }
    
    this.removeFromCanvas = function()
    {
        for (var i = 0; i < self.objectList.length; i++)
        {
            self.objectList[i].remove();
        }
        self.canvasLayer.canvas.renderAll();
    }
    
    this.addObject = function(obj)
    {
        //obj.set(self.view_props);
        obj.setActive(false);
        obj.fill = self.view_props.color;
        obj.opacity = self.view_props.opacity;
        self.objectList.push(obj);
        self.canvasLayer.canvas.add(obj);
        self.x.push(displayPxToStackPxX(obj.left, self.stack));
        self.y.push(displayPxToStackPxY(obj.top, self.stack));
    }
    
    this.clear = function()
    {
        self.x = [];
        self.y = [];
        self.objectList = [];    
    }
    
    /**
     * setObject(inObj) is called with a fabric.js object generated from
     * server-side SVG. This replaces the current object list with a
     * single object.
     */
    this.setObject = function(inObj)
    {
        /*self.removeFromCanvas();
        self.objectList = [inObj];
        self.addToCanvas();*/
        self.setObjects([inObj]);
    }
    
    this.setObjects = function(inObjList)
    {
        for (var i = 0; i < inObjList.length; i++)
        {
            inObjList[i].fill = self.view_props.color;
            inObjList[i].opacity = self.view_props.opacity;
        }
        self.removeFromCanvas();
        self.clear();
        self.objectList = inObjList;
        
        self.addToCanvas();
    }
    
    this.setOpacity = function(opc)
    {
        o = {opacity: opc};
        for (var i = 0; i < self.objectList.length; i++)
        {
            self.objectList[i].set(o);
        }
    }
    
    this.bringToFront = function()
    {
        for (var i = 0; i < self.objectList.length; i++)
        {
            self.objectList[i].bringToFront();
        }
    }
    
    this.sendToBack = function()
    {
        for (var i = 0; i < self.objectList.length; i++)
        {
            self.objectList[i].sendToBack();
        }
    }
    
    this.setViewProps = function(vp)
    {
        self.view_props = vp;
        for (var i = 0; i < self.objectList.length; i++)
        {
            self.objectList[i].fill = vp.color;
            self.objectList[i].opacity = vp.opacity;
        }
    }
    
    this.translate = function(currPos, lastPos, scale)
    {
        dLeft = (currPos.left - lastPos.left) * scale;
        dTop = (currPos.top - lastPos.top) * scale;
        var l = null;
        var t = null;
        for (var i = 0; i < self.objectList.length; i++)
        {
            l = self.objectList[i].left;
            t = self.objectList[i].top;
            self.objectList[i].set({'top' : t - dTop, 'left' : l - dLeft});
        }
    }
    
    this.populateSVG = function(svg)
    {
        if (svg == '')
        {
            self.setObjects([]);
        }
        else
        {
            var objects = [];
            fabric.loadSVGFromString(svg,
                function(obj, opt)
                {
                    //var widget = new fabric.PathGroup(obj, opt).toObject();
                    var widget = fabric.util.groupSVGElements(obj, opt);
                    //widget.set(self.view_props);
                    widget.fill = VolumeTracingPalette.view_props.color;
                    widget.opacity =  VolumeTracingPalette.view_props.opacity;
                    objects.push(widget);
                });

            self.setObjects(objects);
        }
    }
}

	
