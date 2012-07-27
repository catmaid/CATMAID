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


    var componentThreshold=0.02;
    var enumFactory=new EnumFactory();
    this.componentStore=new ComponentStore();

    this.stateEnum=enumFactory.defineEnum({
        COMPONENTVIEW : {
            value : 1,
            string : 'componentview'
        },
        COMPONENTDRAW : {
            value : 2,
            string : 'componentdraw'
        },
        SEGMENTATIONDRAW : {
            value : 3,
            string : 'segementationdraw'
        }
    });

    this.state=this.stateEnum.COMPONENTVIEW;

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
        getCompButton.appendChild( document.createTextNode('Save Components') );
        getCompButton.onclick = function() {
            self.putComponents();
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
        view.onmousewheel=function(e){self.mousewheel(e);};

    };

    this.mousewheel=function(e)
    {
        var up=true;
        if(e.wheelDelta<0){up=false;}

        var currentComponentLayer=self.componentStore.componentLayers[stack.z];
        var currentComponentGroup=currentComponentLayer.componentGroups[currentComponentLayer.activeGroupIndex];
        var index=currentComponentGroup.selectedComponentIndex;
        if(index==0&&up){return;}
        var componentGroupLength=0;
        for (var componentCountId in currentComponentGroup.components){componentGroupLength+=1;}
        if(index==(componentGroupLength-1)&&!up){return;}

        var component=currentComponentGroup.components[index];
        component.visible=false;

        canvasLayer.canvas.clear();

        var newComponent=null;
        var newIndex=null;

        if(up)
        {
            newIndex=index-1;

        }
        else
        {
            newIndex=index+1;
        }
        newComponent=currentComponentGroup.components[newIndex];
        newComponent.visible=true;
        currentComponentGroup.selectedComponentIndex=newIndex;
        self.showActiveComponents();



        /*for (var componentGroupId in self.componentGroups)
        {
            if(self.componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.componentGroups[componentGroupId];
                if(componentGroup["active"]==false){continue;}

                var index=componentGroup["index"];
                if(index==0&&up){break;}

                var componentGroupLength=0;
                for (var componentCountId in componentGroup.components){componentGroupLength+=1;}

                if(index==(componentGroupLength-1)&&!up){break;}

                var component=componentGroup.components[index];
                component.visible=false;

                canvasLayer.canvas.clear();

                var newComponent=null;
                var newIndex=null;

                if(up)
                {
                    newIndex=index-1;

                }
                else
                {
                    newIndex=index+1;
                }
                newComponent=componentGroup.components[newIndex];
                newComponent.visible=true;
                componentGroup["index"]=newIndex;
                componentGroup['minX']=newComponent.minX;
                componentGroup['minX']=newComponent.maxX;
                componentGroup['minX']=newComponent.minY;
                componentGroup['minX']=newComponent.maxY;
                self.showActiveComponents();




            }
        }*/
    };

    this.putComponents=function()
    {
        if(self.state!=self.stateEnum.COMPONENTVIEW)
        {
            return 0;
        }

        var url='http://localhost:8000/1/stack/3/put-components';
        var jsonObjects ={};

        for (var componentGroupId in self.componentStore.componentLayers[stack.z].componentGroups)
        {
            if(self.componentStore.componentLayers[stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.componentStore.componentLayers[stack.z].componentGroups[componentGroupId];
                var component=componentGroup.components[componentGroup.selectedComponentIndex];
                jsonObjects[component.id]={id:component.id,minX:component.minX,minY:component.minY,maxX:component.maxX,maxY:component.maxY,threshold:component.threshold};

            }
        }

        var viewstate=canvasLayer.getFieldOfViewParameters();

        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:61,z:stack.z,x:viewstate.x,y:viewstate.y,width:viewstate.width,height:viewstate.height,components: JSON.stringify(jsonObjects) },
            dataType: "json",
            beforeSend: function(x) {
                //Log before send
            },
            success: function(result)
            {
                //Log result, report on error

                }
            });


    }



    this.showActiveComponents=function()
    {
        for (var componentGroupId in self.componentStore.componentLayers[stack.z].componentGroups)
        {
            if(self.componentStore.componentLayers[stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.componentStore.componentLayers[stack.z].componentGroups[componentGroupId];
                canvasLayer.canvas.add(componentGroup.components[componentGroup.selectedComponentIndex].image);
                var index=canvasLayer.canvas._objects.length;
                if(index!=0){index-=1;}
                canvasLayer.canvas.item(index).selectable=false;
            }
        }


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

        var intersectingComponentGroupId=self.CheckForIntersectingGroup(x,y);
        if(intersectingComponentGroupId!=null)
        {
            self.componentStore.componentLayers[stack.z].activeGroupIndex=intersectingComponentGroupId;

        }
        else
        {
            this.getComponents(x,y);
        }

    };

    /* Mousedown */
    this.mousedown=function(e) {
        //var mouse = canvasLayer.canvas.getPointer(e.memo.e);
        self.started = true;

    }


    this.CheckForIntersectingGroup=function(x,y)
    {
        if(self.componentStore.componentLayers[stack.z]!=undefined)
        {
            for(var componentGroupId in self.componentStore.componentLayers[stack.z].componentGroups)
            {
                if(self.componentStore.componentLayers[stack.z].componentGroups.hasOwnProperty(componentGroupId))
                {
                    var component = self.componentStore.componentLayers[stack.z].componentGroups[componentGroupId].components[self.componentStore.componentLayers[stack.z].componentGroups[componentGroupId].selectedComponentIndex];
                    if(component.minX>x){continue;}
                    if(component.maxX<x){continue;}
                    if(component.minY>y){continue;}
                    if(component.maxY<y){continue;}

                    var pixelvalue=canvasLayer.canvas.contextContainer.getImageData(x,y,1,1);
                    if(pixelvalue.data[3]==0){continue;}

                    return componentGroupId;
                }

            }
        }

        return null;
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
                self.generateComponentLayer();

            } else {
                // reactivateBindings();
            }
        } else {
            createCanvasLayer( parentStack );
            createControlBox();
            self.generateComponentLayer();
        }
        console.log(canvasLayer.getFieldOfViewParameters())



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
                console.log('one up');
				return true;
			}
		}),

		new Action({
			helpText: "Move down 1 slice in z (or 10 with Shift held)",
			keyShortcuts: {
				'.': [ 46, 190 ]
			},
			run: function (e) {
                console.log('one down');
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
        if(self.state!=self.stateEnum.COMPONENTVIEW)
        {
            return 0;
        }

        var url='http://localhost:8000/1/stack/3/components-for-point'+ "?" + $.param({
            x: x,
            y: y,
            scale : 0.5, // defined as 1/2**zoomlevel
            z : stack.z});




        $.getJSON(url,function(result){

            var currentComponentGroups=self.componentStore.componentLayers[stack.z].componentGroups;

            var componentGroupIdNew=currentComponentGroups.length;
            var componentGroupNew=new ComponentGroup();

            for (var componentResultId in result)
            {
                if(result.hasOwnProperty(componentResultId))
                {
                    var componentResult=result[componentResultId];
                    var add=true;

                    for (var componentGroupId in currentComponentGroups)
                    {
                        if(currentComponentGroups.hasOwnProperty(componentGroupId))
                        {
                            var componentGroup=currentComponentGroups[componentGroupId];

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
                        var components=componentGroupNew.components;
                        var component=new Component();
                        components[componentResultId]=component;
                        component.id=componentResultId;
                        component.maxX=componentResult.maxX;
                        component.minX=componentResult.minX;
                        component.maxY=componentResult.maxY;
                        component.minY=componentResult.minY;
                        component.threshold=componentResult.threshold;

                    }
                }

            }

            if((componentGroupNew.components != undefined) && componentGroupNew.components.length>0)
            {
                componentGroupNew.active=true;
                componentGroupNew.groupLoaded=true;

                var currentComponentLayer=self.componentStore.componentLayers[stack.z];
                if(currentComponentLayer.activeGroupIndex!=-1)
                {
                    currentComponentGroups[currentComponentLayer.activeGroupIndex].active=false;
                }

                currentComponentGroups[componentGroupIdNew]=componentGroupNew;
                currentComponentLayer.activeGroupIndex=currentComponentGroups.length-1;

                componentGroupNew.components=componentGroupNew.components.sort(function(a,b){return a.threshold- b.threshold;});
                componentGroupNew.selectedComponentIndex=0;

                var visible=true;
                for(var componentToLoadId in componentGroupNew.components)
                {
                    if(componentGroupNew.components.hasOwnProperty(componentToLoadId))
                    {

                        self.getComponentImage(componentGroupNew.components[componentToLoadId],x,y, stack.z,0.5,visible);
                        visible=false;

                    }
                }

            }



        });

    };

    this.getComponentImage= function(component,x,y,z,scale,visible)
    {
                //var canvasPos=$('canvas').offset();

         var url='http://localhost:8000/1/stack/3/componentimage'+ "?" + $.param({
                    id: component.id,
                    z:z,
                    scale : scale // defined as 1/2**zoomlevel
                    });

        component.visible=visible;

        fabric.Image.fromURL(url, function(img)
        {

                    component.image = img.set({ left: component.centerX(), top: component.centerY(), angle: 0 }).scale(1);
                    if(visible)
                    {
                        canvasLayer.canvas.add(component.image);
                        var item=canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1);

                        canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1).selectable=false;
                    }


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
        this.image=null;
        this.visible=false;

        this.width=function(){return this.maxX-this.minX; };
        this.height=function(){return this.maxY-this.minY; };
        this.centerX=function(){return this.minX+(this.maxX-this.minX)/2; };
        this.centerY=function(){return this.minY+(this.maxY-this.minY)/2; };
    }

    function ComponentGroup()
    {
        this.selectedComponentIndex=-1;
        this.components=[];
        this.active=false;
        this.groupLoaded=false;
    }

    function ComponentLayer()
    {
        this.activeGroupIndex=-1;
        this.componentGroups=[];
    }

    function ComponentStore()
    {
        this.componentLayers=[];
    }

    this.generateComponentLayer=function()
    {

        if(self.componentStore.componentLayers[stack.z]==undefined)
        {
            self.componentStore.componentLayers[stack.z]=new ComponentLayer();
        }



    }




}

function EnumFactory()
{
    function Enum() {
        this._enums = [];
        this._lookups = {};
    }

    Enum.prototype.getEnums = function() {
        return _enums;
    }

    Enum.prototype.forEach = function(callback){
        var length = this._enums.length;
        for (var i = 0; i < length; ++i){
            callback(this._enums[i]);
        }
    }

    Enum.prototype.addEnum = function(e) {
        this._enums.push(e);
    }

    Enum.prototype.getByName = function(name) {
        return this[name];
    }

    Enum.prototype.getByValue = function(field, value) {
        var lookup = this._lookups[field];
        if(lookup) {
            return lookup[value];
        } else {
            this._lookups[field] = ( lookup = {});
            var k = this._enums.length - 1;
            for(; k >= 0; --k) {
                var m = this._enums[k];
                var j = m[field];
                lookup[j] = m;
                if(j == value) {
                    return m;
                }
            }
        }
        return null;
    }

    this.defineEnum=function(definition) {
        var k;
        var e = new Enum();
        for(k in definition) {
            var j = definition[k];
            e[k] = j;
            e.addEnum(j)
        }
        return e;
    }

}


