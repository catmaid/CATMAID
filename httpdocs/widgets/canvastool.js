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
    var controlsBackground=null;
    var stack = null;
    this.toolname = "canvastool";

    this.componentGroups=[];
    var componentThreshold=0.02;


    var started = false;
    var x = 0;
    var y = 0;


    this.resize = function( width, height )
    {
        self.prototype.resize( width, height );
        return;
    };



    var createControlBox = function() {

        controls = document.createElement("div");
        controls.className = "canvasControls";
        controls.id = "canvasControlsId";
        controls.style.zIndex = 6;
        controls.style.width = "250px";
        controls.style.height = "300px";
        controls.style.backgroundColor='rgba(255,255,255,0.3)';


        // more: http://kangax.github.com/fabric.js/kitchensink/

        var button_rasterize = document.createElement("button");
        button_rasterize.appendChild( document.createTextNode('Push labels') );
        button_rasterize.onclick = function() {
            console.log('button click')
            if (!fabric.Canvas.supports('toDataURL')) {
                alert('This browser doesn\'t provide means to serialize canvas to an image');
            }
            else {
                //window.open(canvasLayer.canvas.toDataURL('png'));
                //return;
                // POST request to server
                var data=canvasLayer.canvas.toDataURL('png'),
                    output=data.replace(/^data:image\/(png|jpg);base64,/, ""),
                    fieldofview=canvasLayer.getFieldOfViewParameters(),
                    senddata = {};
                data = data.substr(22, data.length);
                senddata['x'] = fieldofview.x;
                senddata['y'] = fieldofview.y;
                senddata['z'] = stack.z; // TODO
                senddata['scale'] = stack.s;
                senddata['row'] = 'y';
                senddata['col'] = 'x';
                senddata['width'] = fieldofview.width;
                senddata['height'] = fieldofview.height;
                senddata['image'] = output;
                senddata['metadata'] = self.labels;
                console.log('send data', senddata, stack);
                if( stack.tile_source_type == 2 ) {
                    if( stack.labelupload_url === '' ) {
                      alert('Push labels not enabled for this stack');
                      return;
                    }
                    // z, t
                    jQuery.ajax({
                        url: stack.labelupload_url, // "dj/" + project.id + "/stack/" + stack.id + "/push_image", // stack.labelUploadURL
                        type: "POST",
                        dataType: "json",
                        data: senddata,
                        success: function (data) {
                          console.log('return', data);
                        }
                      });
                } else if ( stack.tile_source_type === 3 ) {
                    console.log('tile source type 3')
                    jQuery.ajax({
                        //url: stack.labelupload_url, // "dj/" + project.id + "/stack/" + stack.id + "/push_image", // stack.labelUploadURL
                        url: "dj/" + project.id + "/stack/" + stack.id + "/put_tile", // stack.labelUploadURL
                        type: "POST",
                        dataType: "json",
                        data: senddata,
                        success: function (data) {
                          console.log('return', data);
                        }
                      });

                }

            }
        };
        controls.appendChild( button_rasterize );


        var getCompButton = document.createElement("button");
        getCompButton.appendChild( document.createTextNode('Get Components') );
        getCompButton.onclick = function() {
            self.getComponents();
        };
        controls.appendChild( getCompButton );


        var button = document.createElement("button");
        button.appendChild( document.createTextNode('Clear canvas') );
        button.onclick = function() {
            if (confirm('Are you sure?')) {
                canvasLayer.canvas.clear();
            }
        };
        controls.appendChild( button );

        var brush = document.createElement("div");
        var html = '<div style="display:none;" id="drawing-mode-options">';
        // '<button id="drawing-mode">Cancel drawing mode</button>' +
        brush.innerHTML = html;
        controls.appendChild( brush );

        // color wheel
        //var chweel = document.createElement("div");
        //chweel.id = "color-wheel-canvas";
        //controls.appendChild( chweel );

        // slider for brush size
        var widthSlider = document.createElement("div");
        widthSlider.id = "width-slider-canvas";
        controls.appendChild( widthSlider );

        var widthSliderField = document.createElement("input");
        widthSliderField.id = "width-slider-field";
        widthSliderField.size = "3";
        controls.appendChild( widthSliderField );

        var labelList = document.createElement("ul");
        labelList.id = "labellist-canvas";
        controls.appendChild( labelList );

        // ******************
        stack.getView().appendChild( controls );
        // ******************

        var drawingOptionsEl = document.getElementById('drawing-mode-options'),
            drawingColorEl = document.getElementById('drawing-color'),
            drawingLineWidthEl = document.getElementById('drawing-line-width');

        /*
        var drawingModeEl = document.getElementById('drawing-mode');
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
        };*/

        /*
        var cw = Raphael.colorwheel($("#color-wheel-canvas")[0],150);
        cw.color("#000000");
        cw.onchange(function(color)
        {
          canvasLayer.canvas.freeDrawingColor = 'rgb('+parseInt(color.r)+','+parseInt(color.g)+','+parseInt(color.b)+')';
        });
        */

        // append jquery elements
        var widthslider = $("#width-slider-canvas").slider({
                  value: 11,
                  min: 1,
                  max: 20,
                  step: 2,
                  slide: function(event, ui) {
                    canvasLayer.canvas.freeDrawingLineWidth = ui.value;
                    widthSliderField.value = "" + ui.value;
                  }
          });
        canvasLayer.canvas.freeDrawingLineWidth = 11;
        widthSliderField.value = "11";

        // labels
        createLabels( );
        setColor( 'rgba(255,0,0,1.0)' );


    };

    this.removeControlBox = function() {
        // TODO: remove control box
    };

    var createCanvasLayer = function( parentStack )
    {
        stack = parentStack;
        canvasLayer = new CanvasLayer( parentStack );

        self.prototype.setMouseCatcher( canvasLayer.view );
        // TODO: Layer is added to the parent stack, but the view
        // is not inserted in the DOM - this has to be done manually
        // in the canvaslayer.js. Is this by design?
        parentStack.addLayer( "CanvasLayer", canvasLayer );

        // view is the mouseCatcher now
        var view = canvasLayer.view;

        var proto_changeSlice = self.prototype.changeSlice;
        self.prototype.changeSlice =
            function( val ) {
                console.log('change slice');
                proto_changeSlice( val );
            };

        view.onmouseup= function(e) { self.mouseup(e); };
        view.onmousedown=function(e) { self.mousedown(e); };
        view.onmousemove= function(e) { self.mousemove(e); };

    };

    /* Mouseup */
    this.mouseup = function (e)
    {
        x = e.layerX;
        y = e.layerY;

        if(self.started)
        {
            self.started = false;
        }
        this.getComponents(x,y);


    }

    /* Mousedown */
    this.mousedown=function(e) {
        //var mouse = canvasLayer.canvas.getPointer(e.memo.e);
        self.started = true;

    }


    /* Mousemove */
    this.mousemove=function(e) {
        if(!self.started) {
            return false;
        }

        var mouse = canvasLayer.canvas.getPointer(e.memo.e);

        var w = Math.abs(mouse.x - x),
            h = Math.abs(mouse.y - y);

        if (!w || !h) {
            return false;
        }


    }



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

        // remove the canvasLayer with the official API
        stack.removeLayer( "CanvasLayer" );

        // canvas tool responsability to remove the controls
        stack.getView().removeChild( controls );

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
                console.log('+');
                //self.prototype.slider_s.move(1);
                return false;
            }
        }),

		new Action({
			helpText: "Move up 1 slice in z (or 10 with Shift held)",
			keyShortcuts: {
				',': [ 44, 188 ]
			},
			run: function (e) {
                console.log('one up')
				return true;
			}
		}),

		new Action({
			helpText: "Move down 1 slice in z (or 10 with Shift held)",
			keyShortcuts: {
				'.': [ 46, 190 ]
			},
			run: function (e) {
                console.log('one down')
				return true;
			}
		})

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

    this.labels = [
        {
            "name": "eraser",
            "color": 'rgba(255,255,255,1.0)',
            "id": 0
        },
        {
            "name": "cell membrane",
            "color": 'rgb(255,0,0)',
            "id": 1
        },
        {
            "name": "cell interior",
            "color": 'rgb(0,255,0)',
            "id": 2
        },
        {
            "name": "mitochondria",
            "color": 'rgb(0,0,255)',
            "id": 3
        }

    ];

    var setColor = function( color ) {
        canvasLayer.canvas.freeDrawingColor = color;
    };

    this.addLabelToDiv = function( label ) {
        var labellistdiv = $("#labellist-canvas");
        var newElement = $('<li/>');
        newElement.attr('id', 'label-object-' + label["name"]);
        newElement.text( label["id"] + ": " + label["name"] );
        linkElement = $('<a/>');
        linkElement.attr('href', '#');
        linkElement.text("select");
        linkElement.click(function (e) {
            setColor( label["color"] );
        });
        newElement.append(linkElement);
        newElement.css('color', "#FFFFFF");
        labellistdiv.append(newElement);

    };

    /* Create a set of labels */
    var createLabels = function( ) {
        for( j = 0; j < self.labels.length; ++j ) {
            self.addLabelToDiv( self.labels[j] );
        }
    };

    this.getComponents= function(x,y)
    {
        var url='http://localhost:8000/1/stack/3/components-for-point'+ "?" + $.param({
            x: x,
            y: y,
            scale : 0.5, // defined as 1/2**zoomlevel
            z : 0});




        $.getJSON(url,function(result){

            var componentGroupIdNew=self.componentGroups.length;
            var componentGroupNew=[];
            componentGroupNew['id']=componentGroupId;
            componentGroupNew['components']=[];

            for (var componentResultId in result)
            {
                if(result.hasOwnProperty(componentResultId))
                {
                    var componentResult=result[componentResultId];
                    var add=true;

                    for (var componentGroupId in self.componentGroups)
                    {
                        if(self.componentGroups.hasOwnProperty(componentGroupId))
                        {
                            var componentGroup=self.componentGroups[componentGroupId];

                            for (var componentEntryId in componentGroup.components)
                            {
                                if(componentGroup.components.hasOwnProperty(componentEntryId))
                                {
                                    var componentEntry=componentGroup.components[componentEntryId];
                                    if(componentEntry.id==componentResultId){add=false;break;}
                                }

                            }
                            if(!add){break;}
                        }


                    }
                    if(add)
                    {
                        var components=componentGroupNew['components'];
                        var component=new Component();
                        components[componentResultId]=component;
                        component.id=componentResultId;
                        component.maxX=componentResult.maxX;
                        component.threshold=componentResult.threshold;

                    }
                }

            }

            if((componentGroupNew['components'] != undefined) && componentGroupNew['components'].length>0)
            {
                self.componentGroups[componentGroupIdNew]=componentGroupNew;

            }



        });

    };

    this.getComponentImage= function(id,x,y,z,width,height,scale)
    {
                var canvasPos=$('canvas').offset();

         var url='http://localhost:8000/1/stack/3/componentimage'+ "?" + $.param({
                    id: id,
                    scale : scale // defined as 1/2**zoomlevel
                    });

         fabric.Image.fromURL(url, function(img) {
                    var oImg = img.set({ left: x, top: y, angle: 0 });
                    canvasLayer.canvas.add(oImg).renderAll();
                });

    };

    function Component()
    {
        this.id=NaN;
        this.minX=null;
        this.minY=null;
        this.maxX=null;
        this.maxY=null;
        this.threshold=null;

    }


}
