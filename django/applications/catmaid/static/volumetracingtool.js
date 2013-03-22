/**
* Volume tracing tool
* 
* Note that at this early stage in development, nomenclature has not 
* yet been settled. As such, you will find references to Volume Tracing,
* Area Tracing and Area Segmentation, which are all subtle variations on
* the same concept. IE, they all relate here.
*/


var canvasLayer;
var traceBrushSize = 16;
var VolumeTraceLastID = 0; 
function VolumeTracingTool()
{
    var self = this;
    
    this.stack = null;
    this.toolname = "Volume Tracing Tool";
    //var canvasLayer = null;
    this.brush = null;
    this.isDragging = false;    
    this.volumeAnnotation = VolumeTracingAnnotations;
    this.currentTrace = null;
    this.traces = [];
    this.enabled = false;
    
    this.registerToolbar = function()
    {
        self.brush_slider = new Slider(SLIDER_HORIZONTAL, true, 1, 100, 100, traceBrushSize,
            self.changeSlice);
        document.getElementById("toolbar_volseg").style.display = "block";    
        var slider_box = document.getElementById("volseg_radius_box");
        
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
        
        self.mouseCatcher = document.createElement("div");
        self.mouseCatcher.className = "sliceMouseCatcher";
        self.mouseCatcher.style.cursor = "default";
    };
    
     /*
    ** Create the canvas layer using fabric.js
    */
    this.createCanvasLayer = function ()
    {
        canvasLayer = new CanvasLayer( self.stack, self );
        
        var h = canvasLayer.canvas.getHeight();
        var w = canvasLayer.canvas.getWidth();
        self.brush = new fabric.Circle({top: 200, left: 200, radius: self.brush_slider.val,
            fill: 'blue'});
        canvasLayer.canvas.add(self.brush);
        canvasLayer.canvas.interactive = true;
        
        self.stack.addLayer("VolumeCanvasLayer", canvasLayer);
        self.stack.resize();
        
        /*canvasLayer.canvas.on({
            'mouse:down' : function(e) {
                self.isDragging = true;
            },
            'mouse:up' : function(e) {
                self.isDragging = false;
            }
        });*/
        
    }
    
    this.enable = function()
    {
        self.enabled = true;
    }
    
    this.disable = function()
    {
        self.enabled = false;
    }
    
    
    this.redraw = function()
    {
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
    
    this.destroyToolbar = function()
    {
        traceBrushSize = self.brush_slider.val;
        document.getElementById("toolbar_volseg").style.display = "none";        
        self.brush_slider.update(0, 1, undefined, 0, null);
    };
    
    this.createNewTrace = function()
    {
        VolumeTraceLastID--;
        var trace = new fabricTrace(self.stack, canvasLayer, 
            VolumeTraceLastID, self.brush_slider.val);
        self.traces.push(trace);
        return trace;
    }
    
    this.register = function(parentStack)
    {
        self.stack = parentStack;
        self.registerToolbar();
        self.createCanvasLayer();
        self.createNewTrace();
        
        document.getElementById("toolbar_volseg").style_display = "block";        
        self.mouseCatcher.onmousemove = onmousemove.pos;
        self.mouseCatcher.onmousedown = onmousedown;
        self.mouseCatcher.onmouseup = onmouseup;
        self.stack.getView().appendChild(self.mouseCatcher);
        self.volumeAnnotation.setStack(self.stack);
        self.volumeAnnotation.tool = self;
        self.volumeAnnotation.retrieveAllTraces();
        
        //alert('Registered Volume Tool');
        return;
    };
    
    this.unregister = function()
    {
        
        if (self.stack && self.mouseCatcher.parentNode == self.stack.getView())
        {
            self.stack.getView().removeChild(self.mouseCatcher);
        }
        //alert('Unregistered Volume Tool');
        return;
    };
    
    this.destroy = function()
    {
        document.getElementById("toolbar_volseg").style.display = "none";  
        self.stack.removeLayer( "VolumeCanvasLayer" );
        canvasLayer.canvas.clear();

        canvasLayer = null;

        self.volumeAnnotation.tool = null;
        self.stack = null;
        self.unregister();
        self.destroyToolbar();
        //alert('Destroyed Volume Tool');
        return;
    };

    this.handleKeyPress = function(e)
    {
        return false;
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
        self.mouseCatcher.style.width = width + "px";
        self.mouseCatcher.style.height = height + "px";
        return;
    };
    
    var onmousedown = function(e)
    {
        self.currentTrace = self.createNewTrace();
        self.isDragging = true;        
    }
    
    var onmouseup = function(e)
    {
        self.isDragging = false;
        if (self.enabled)
        {
            self.currentTrace.addObject(self.brush.clone());
            self.volumeAnnotation.pushTrace(self.currentTrace);
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
                
                if (self.isDragging && self.enabled)
                {
                    var spot = self.brush.clone();
                    self.currentTrace.addObject(spot);
                }
                
                canvasLayer.canvas.renderAll();

            }
            return false;
        }        
    };
    
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



function fabricTrace(stack, cl, objid, r)
{
    var self = this;
    this.canvasLayer = cl;
    this.objectList = []; //List of fabric.js Objects
    this.r = r / stack.scale;
    this.x = []; // x,y trace in stack pixel coordinates
    this.y = [];
    this.stack = stack;
    
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
        canvasLayer.canvas.renderAll();
    }
    
    this.addObject = function(obj)
    {
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
        self.removeFromCanvas();
        self.clear();
        self.objectList = inObjList;
        
        self.addToCanvas();
    }
    
}

