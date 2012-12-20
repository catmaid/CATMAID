/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * Constructor for the Canvas tool.
 */
function CanvasTool()
{
    var self = this;
    var canvasLayer = null;
    var controls = null;
    var controlsBackground=null;
    this.stack = null;
    this.toolname = "canvastool";
    this.componentColor = [0,255,255,255];
    this.lastPosition = null;
    var enumFactory = new EnumFactory();
    this.layerStore = new LayerStore();
    this.slider_z = null;
    this.lastAssemblyId=null;

    if ( !ui ) ui = new UI();

    /*
     * Keyboard actions
     */

    var actions = [

        new Action({
            helpText: "Move up 1 slice in z (or 10 with Shift held)",
            keyShortcuts: {
                ',': [ 188 ]
            },
            run: function (e) {
                self.slider_z.move(-(e.shiftKey ? 10 : 1));
                return true;
            }
        }),

        new Action({
            helpText: "Move down 1 slice in z (or 10 with Shift held)",
            keyShortcuts: {
                '.': [ 190 ]
            },
            run: function (e) {
                self.slider_z.move((e.shiftKey ? 10 : 1));
                return true;
            }
        }),
        new Action({
            helpText: "Delete component group",
            keyShortcuts: {
                'delete': [ 46 ]
            },
            run: function (e)
            {
                self.deleteElement()
                return true;
            }
        })

    ];
    var keyCodeToAction = getKeyCodeToActionMap(actions);

    this.stateEnum = enumFactory.defineEnum({
        COMPONENTVIEW : {
            value : 1,
            string : 'componentview'
        },
        COMPONENTDRAW : {
            value : 2,
            string : 'componentdraw'
        },
        FREEDRAWING : {
            value : 3,
            string : 'segementationdraw'
        }
    });

    this.state = this.stateEnum.COMPONENTVIEW;
    this.drawingTypeEnum = null;
    this.drawingType = null;


    //
    //
    //Startup functions
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {
        document.getElementById( "edit_button_canvas" ).className = "button_active";
        document.getElementById( "toolbar_seg" ).style.display = "block";

        if (canvasLayer && self.stack) {
            if (self.stack !== parentStack) {
                // If the tracing layer exists and it belongs to a different stack, replace it
                self.stack.removeLayer( canvasLayer );

                self.initialize(parentStack);


            } else {
                // reactivateBindings();
            }
        } else {
            self.initialize(parentStack);
        }

        if ( self.stack.slices.length < 2 )	//!< hide the self.slider_z if there is only one slice
        {
            self.slider_z.getView().parentNode.style.display = "none";
        }
        else
        {
            self.slider_z.getView().parentNode.style.display = "block";
        }
        self.slider_z.update(
            0,
            0,
            self.stack.slices,
            self.stack.z,
            self.changeSlice );

        return;
    };


    this.initialize=function(parentStack)
    {
        createCanvasLayer( parentStack );
        self.getDrawingEnum();
        createControlBox();
        self.generateLayer();
        canvasLayer.canvas.observe('path:created',function(path){self.onPathCreated(path)});
        canvasLayer.canvas.observe('mouse:up',function(e){self.mouseup(e)});
        canvasLayer.canvas.observe('after:render',function(e){self.afterRender(e)});

        canvasLayer.view.onmousedown = function(e) {
            // if middle mouse, propagate to onmousedown
            if( e.button === 1)
            {
                onmousedown(e);
            }
        };
        canvasLayer.view.onmousewheel=function(e){self.mousewheel(e);};
        canvasLayer.canvas.freeDrawingLineWidth=15;
        canvasLayer.canvas.freeDrawingColor ="rgb(0, 255, 255)";
        this.lastPosition=canvasLayer.getFieldOfViewParameters();

        self.switchToComponentMode();
        self.loadElements();
    };

    this.getDrawingEnum=function()
    {
        var url= django_url + project.id + "/stack/" + self.stack.id + '/get-drawing-enum'
        var response=$.ajax(
            {
                url: url,
                async: false,
                dataType: 'json'
            }
        ).responseText;

            var result=$.parseJSON(response);

          self.drawingTypeEnum=enumFactory.defineEnum(result);
          self.drawingType=self.drawingTypeEnum.getByValue('value',300);

    };


    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {
        return;
    };

    var createControlBox = function() {

        self.slider_z=new Slider(
            SLIDER_HORIZONTAL,
            true,
            1,
            388,
            388,
            1,
            function( val )
            { statusBar.replaceLast( "z: " + val );  return; } );


        $('#button_save_components').click(function() {
            self.putComponents();
        });

        $('#button_clear_canvas').click(function() {
            //self.generateSegmentationFile();
            if (confirm('Are you sure?')) {
                self.clearCanvas();

            }
        });


        $('#button_init_components').click(function() {
            self.initSkeleton();
        });

        $('#button_init_hdf').click(function() {
            self.generateSegmentationFile();
        });
        $('#button_mesh').click(function() {
            self.generateMesh();
        });




        self.removeElement("div_color_wheel_box");

        var colorWheelBox = document.createElement("div");
        colorWheelBox.id = "div_color_wheel_box";
        colorWheelBox.className = "colorWheelCanvas";
        colorWheelBox.style.zIndex = 6;
        colorWheelBox.style.display = "none";
        colorWheelBox.style.backgroundColor='rgba(255,255,255,1)';

        var colorWheelDiv = document.createElement("div");
        colorWheelDiv.id = "div_color_wheel";
        colorWheelBox.appendChild(colorWheelDiv);
        self.stack.getView().appendChild( colorWheelBox );


        $('#button_color_wheel').click(function()
        {
            var myLayer = document.getElementById('div_color_wheel_box');
            if(myLayer.style.display=="none" || myLayer.style.display==""){
                myLayer.style.display="block";
            } else {
                myLayer.style.display="none";
            }


        });

        var cw = Raphael.colorwheel($("#div_color_wheel")[0],250);
        cw.color("#00ffff");
        document.getElementById('button_color_wheel').style.backgroundColor="#00ffff";

        cw.onchange(function(color)
        {
            self.componentColor=[parseInt(color.r),parseInt(color.g),parseInt(color.b),255];
            document.getElementById('button_color_wheel').style.backgroundColor=color.hex;
            canvasLayer.canvas.freeDrawingColor = 'rgb('+Math.round(color.r)+','+Math.round(color.g)+','+Math.round(color.b)+')';
            event.stopPropagation();
        });

        $('#button_drawing_mode').click(function() {

            if(project.selectedObjects.selectedskeleton==null)
            {
                window.alert('Please select a skeleton!');
                return
            }

            canvasLayer.canvas.isDrawingMode = !canvasLayer.canvas.isDrawingMode;


            if (canvasLayer.canvas.isDrawingMode) {
                $('#button_drawing_mode').text('Stop Correction');
                $('#sliders_box_brush_size').show();

                self.state=self.stateEnum.COMPONENTDRAW;

            }
            else {
                $('#button_drawing_mode').text('Correction Mode');
                $('#sliders_box_brush_size').hide();
                self.state=self.stateEnum.COMPONENTVIEW;
                canvasLayer.canvas.interactive=false;
                canvasLayer.canvas.selection=false;
            }

        });

        $('#button_mode_free_drawing').click(function()
        {
            this.style.selected=true;
            self.switchToFreeDrawingMode();

        });
        $('#button_mode_component').click(function()
        {

            this.style.selected=true;
            self.switchToComponentMode();

        });

        $('#free_drawing_controls').hide();
        $('#sliders_box_brush_size').hide();


        var selectDrawing=$('#select_drawing_type');

        self.drawingTypeEnum.forEach(function(drawingType)
        {
            var option=new Option(drawingType.string, drawingType.value, false, false);
            option.title="widgets/icons/icon_cd.gif";
            option.style.backgroundColor='#'+self.rgbToHex(drawingType.color[0],drawingType.color[1],drawingType.color[2]);

            selectDrawing.append(option);

        });

        //TODO:Add msdropdown to select box with nice icons of mitochondria, membranes etc.
        //selectDrawing.msDropDown(); //dd is default;

        selectDrawing.change(function () {
            $("#select_drawing_type option:selected").each(function ()
            {
                document.getElementById('select_drawing_type').style.backgroundColor=this.style.backgroundColor;
                self.drawingType=self.drawingTypeEnum.getByName(this.text);
                canvasLayer.canvas.freeDrawingColor =self.rgbArrayToRgbString(self.drawingType.color,false);


            });

        })
            .trigger('change');



        //Create Z slider controls:
        var sliders_box = document.getElementById( "sliders_box_seg" );

        /* remove all existing dimension sliders */
        while ( sliders_box.firstChild )
            sliders_box.removeChild( sliders_box.firstChild );

        var slider_z_box = document.createElement( "div" );
        slider_z_box.className = "box";
        slider_z_box.id = "slider_z_box";
        var slider_z_box_label = document.createElement( "p" );
        slider_z_box_label.appendChild( document.createTextNode( "z-index&nbsp;&nbsp;" ) );
        slider_z_box.appendChild( self.slider_z.getView() );
        slider_z_box.appendChild( self.slider_z.getInputView() );

        sliders_box.appendChild( slider_z_box );




        //Create brush size slider
        var sliders_brush_size_box = document.getElementById( "sliders_box_brush_size" );

        // remove all existing dimension sliders
        while ( sliders_brush_size_box.firstChild )
            sliders_brush_size_box.removeChild( sliders_brush_size_box.firstChild );

        var slider_brush_size = new Slider(
            SLIDER_HORIZONTAL,
            true,
            1,
            40,
            40,
            15,
            function( val )
            {
                canvasLayer.canvas.freeDrawingLineWidth = parseInt(val, 10) || 1; // disallow 0, NaN, etc.

            });

        var slider_brush_size_box = document.createElement( "div" );
        slider_brush_size_box.className = "box";
        slider_brush_size_box.id = "slider_brush_size_box";
        var slider_brush_size_box_label = document.createElement( "p" );
        slider_brush_size_box.appendChild( slider_brush_size.getView() );
        slider_brush_size_box.appendChild( slider_brush_size.getInputView() );
        sliders_brush_size_box.appendChild( slider_brush_size_box );





    };

    this.removeControlBox = function() {
        // TODO: remove control box
    };

    var createCanvasLayer = function( parentStack )
    {
        self.stack = parentStack;
        canvasLayer = new CanvasLayer( parentStack );
        canvasLayer.canvas.interactive=false;
        canvasLayer.canvas.selection=false;

        // TODO: Layer is added to the parent stack, but the view
        // is not inserted in the DOM - this has to be done manually
        // in the canvaslayer.js. Is this by design?
        parentStack.addLayer( "CanvasLayer", canvasLayer );

        // view is the mouseCatcher now
        var view = canvasLayer.view;

    };

    this.generateLayer=function()
    {

        if(self.layerStore.componentLayers[self.stack.z]==undefined)
        {
            self.layerStore.componentLayers[self.stack.z]=new ComponentLayer();
        }
        if(self.layerStore.drawingLayers[self.stack.z]==undefined)
        {
            self.layerStore.drawingLayers[self.stack.z]=new DrawingLayer();
        }

    };


    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
        document.getElementById( "toolbar_seg" ).style.display = "none";
        document.getElementById('div_color_wheel_box').style.display="none";
        $('#select_drawing_type').empty();
        $('#button_mode_component').off('click');
        $('#button_mode_free_drawing').off('click');
        $('#button_clear_canvas').off('click');
        $('#button_color_wheel').off('click');
        $('#div_color_wheel_box').off('click');
        $('#button_save_components').off('click');
        $('#button_init_components').off('click');
        $('#button_drawing_mode').off('click');
        $('#button_init_hdf').off('click');
        $('#button_mesh').off('click');

        // remove the canvasLayer with the official API
        self.stack.removeLayer( "CanvasLayer" );

        // canvas tool responsability to remove the controls
        // stack.getView().removeChild( controls );

        return;
    };

    this.redraw = function()
    {
        // update slider
        self.slider_z.setByValue( self.stack.z, true );
    };


    //
    //
    //EVENTS
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    this.on_assembly_id_change = function( assembly_id ) {
        if(self.lastAssemblyId != null) {
            self.putComponents(self.lastAssemblyId);
        }
        self.lastAssemblyId = assembly_id;
        self.layerStore = new LayerStore();
        self.loadElements();
    };

    this.afterRender=function(event)
    {
        var newPosition=canvasLayer.getFieldOfViewParameters();
        if(newPosition.x!=self.lastPosition.x || newPosition.y!=self.lastPosition.y)
        {
            self.lastPosition=newPosition;
            self.showActiveElements(true);

        }


    };

    this.generateSegmentationFile=function()
    {
        var url=  django_url+ project.id + "/stack/" + self.stack.id + '/generate-segmentation-file';

        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:project.selectedObjects.selectedskeleton },
            dataType: "json",
            beforeSend: function(x)
            {
                //Log before send
            },
            success: function(result)
            {

            }
        });

    };

    this.resize = function( width, height )
    {
        // self.prototype.resize( width, height );
        console.log('resize'    , width, height);
        return;
    };


    this.mousewheel=function(e)
    {
        if(project.selectedObjects.selectedskeleton==null||self.state!=self.stateEnum.COMPONENTVIEW || self.layerStore.componentLayers.length==0)
        {
            return;
        }

        var up=true;
        if(e.wheelDelta<0){up=false;}

        var currentComponentLayer=self.layerStore.componentLayers[self.stack.z];
        var currentComponentGroup=currentComponentLayer.componentGroups[currentComponentLayer.activeGroupIndex];
        var index=currentComponentGroup.selectedComponentIndex;
        if(index==0&&up){return;}
        var componentGroupLength=0;
        for (var componentCountId in currentComponentGroup.components){componentGroupLength+=1;}
        if(index==(componentGroupLength-1)&&!up){return;}

        var component=currentComponentGroup.components[index];
        component.visible=false;
        component.unsetActive();

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
        newComponent.setActive();
        self.refreshFilters(newComponent);
        newComponent.visible=true;
        currentComponentGroup.selectedComponentIndex=newIndex;
        self.showActiveElements();


    };

    this.onPathCreated=function(object)
    {
        var path=object.path;
        var drawing=new Drawing();
        drawing.minX=self.getStackXFromCanvasX( path.left-Math.floor(path.width/2));
        drawing.minY=self.getStackYFromCanvasY(path.top-Math.floor(path.height/2));
        drawing.maxX=drawing.minX+path.width;
        drawing.maxY= drawing.minY+path.height;
        drawing.drawingObject=path;
        drawing.skeletonId=project.selectedObjects.selectedskeleton;
        canvasLayer.canvas.bringToFront(path);

        var currentComponentLayer=self.layerStore.componentLayers[self.stack.z];
        if(self.state==self.stateEnum.COMPONENTDRAW && currentComponentLayer.activeGroupIndex!=-1)
        {
            var currentGroup=currentComponentLayer.componentGroups[currentComponentLayer.activeGroupIndex];
            drawing.componentId=currentGroup.components[currentGroup.selectedComponentIndex].id;
            drawing.type=100;

        }
        else if(self.state==self.stateEnum.FREEDRAWING)
        {
           drawing.type=self.drawingType.value;
        }
        else
        {
            alert('Drawing in an unknown state!')
        }

        var drawings=self.layerStore.drawingLayers[self.stack.z].drawings;
        drawings[drawings.length]=drawing;
        self.putDrawing(drawing);

        var index=canvasLayer.canvas._objects.length;
        if(index!=0){index-=1;}
        var componentItem=canvasLayer.canvas.item(index);
        componentItem.selectable = false;
    };

    /* Mouseup */
    this.mouseup = function (event)
    {
        if(self.state==self.stateEnum.FREEDRAWING)
        {
            return
        }

        x = event.e.offsetX;
        y = event.e.offsetY;

        if(self.started)
        {
            self.started = false;
        }
        self.deselectAllPaths();
        self.deselectAllComponents();
        var intersectingPath=self.CheckForIntersectingPath(x,y);
        if(intersectingPath!=null)
        {
            //check
            self.invertPath(self.layerStore.drawingLayers[self.stack.z].drawings[intersectingPath],true);
            canvasLayer.canvas.renderAll(false);
            return;
        }

        if(self.state==self.stateEnum.COMPONENTVIEW && project.selectedObjects.selectedskeleton==null)
        {
            window.alert('Please select a skeleton!');
            return
        }

        var intersectingComponentGroupId=self.CheckForIntersectingGroup(x,y);
        if(intersectingComponentGroupId!=null)
        {

            self.layerStore.componentLayers[self.stack.z].activeGroupIndex=intersectingComponentGroupId;

            var activeGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[intersectingComponentGroupId];
            if(!activeGroup.groupLoaded)
            {
                self.getComponents(activeGroup.components[activeGroup.selectedComponentIndex].centerX(),activeGroup.components[activeGroup.selectedComponentIndex].centerY(),intersectingComponentGroupId)
            }
            activeGroup.components[activeGroup.selectedComponentIndex].setActive();
            self.refreshFilters(activeGroup.components[activeGroup.selectedComponentIndex]);

        }
        else
        {
            self.deselectAllPaths();
            self.deselectAllComponents();
            this.getComponents(x,y);
        }

    };

    var onmousemove = function( e )
    {
        self.lastX = self.stack.x + ui.diffX; // TODO - or + ?
        self.lastY = self.stack.y + ui.diffY;
        self.stack.moveToPixel(
            self.stack.z,
            self.stack.y - ui.diffY / self.stack.scale,
            self.stack.x - ui.diffX / self.stack.scale,
            self.stack.s );
        return true;
    };

    var onmouseup = function( e )
    {
        ui.releaseEvents();
        ui.removeEvent( "onmousemove", onmousemove );
        ui.removeEvent( "onmouseup", onmouseup );
        return false;
    };

    var onmousedown = function( e )
    {
        ui.registerEvent( "onmousemove", onmousemove );
        ui.registerEvent( "onmouseup", onmouseup );
        ui.catchEvents( "move" );
        ui.onmousedown( e );

        ui.catchFocus();

        return false;
    };

    //--------------------------------------------------------------------------
    /**
     * Slider commands for changing the slice come in too frequently, thus the
     * execution of the actual slice change has to be delayed slightly.  The
     * timer is overridden if a new action comes in before the last had time to
     * be executed.
     */
    var changeSliceDelayedTimer = null;
    var changeSliceDelayedParam = null;

    var changeSliceDelayedAction = function()
    {
        window.clearTimeout( changeSliceDelayedTimer );
        self.changeSlice( changeSliceDelayedParam.z );
        changeSliceDelayedParam = null;
        return false;
    };

    this.changeSliceDelayed = function( val )
    {
        if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
        changeSliceDelayedParam = { z : val };
        changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
    };

    this.changeSlice = function( val )
    {
        if(self.stack.z==val)
        {return;}
        //Save current component groups & drawings
        self.putComponents();

        canvasLayer.canvas.clear();

        self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );

        //Load saved component groups
        self.loadElements();


        return;
    }



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


    //
    //
    //Element loading functions
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    this.loadElements=function()
    {
        self.loadUnassociatedDrawings();
        self.loadComponents();
    };

    this.loadUnassociatedDrawings=function()
    {
        if(self.layerStore.drawingLayers[self.stack.z]==undefined)
        {
            self.layerStore.drawingLayers[self.stack.z]=new DrawingLayer();
        }
        var fieldOfView=canvasLayer.getFieldOfViewParameters();


        var url= django_url + project.id + "/stack/" + self.stack.id + '/get-saved-drawings-by-view'+ "?" + $.param({
            x: fieldOfView.x,
            y: fieldOfView.y,
            height:fieldOfView.height ,
            width:fieldOfView.width,
            z : self.stack.z});


        $.getJSON(url,function(result)
        {
            self.parseDrawingList(result,true);

        });
    };

    this.loadComponents=function()
    {
        if(self.layerStore.componentLayers[self.stack.z]==undefined)
        {
            self.layerStore.componentLayers[self.stack.z]=new ComponentLayer();
        }

        if(project.selectedObjects.selectedskeleton==null||self.state!=self.stateEnum.COMPONENTVIEW )
        {
            self.showActiveElements();
            return;
        }

        var url= django_url + project.id + "/stack/" + self.stack.id + '/get-saved-components'+ "?" + $.param({
            skeleton_id:project.selectedObjects.selectedskeleton,
            z : self.stack.z});

        $.getJSON(url,function(result)
        {
            //TODO: Load only not already loaded components!!!
            self.layerStore.componentLayers[self.stack.z]=new ComponentLayer();
            var currentComponentGroups=self.layerStore.componentLayers[self.stack.z].componentGroups;

            for (var componentResultId in result)
            {
                if(result.hasOwnProperty(componentResultId))
                {

                    var componentGroupNew=new ComponentGroup();
                    componentGroupNew.active=true;
                    componentGroupNew.groupLoaded=false;

                    var componentResult=result[componentResultId];

                    var components=componentGroupNew.components;
                    var component=new Component();
                    components[components.length]=component;
                    component.id=componentResultId;
                    component.maxX=componentResult.maxX;
                    component.minX=componentResult.minX;
                    component.maxY=componentResult.maxY;
                    component.minY=componentResult.minY;
                    component.threshold=componentResult.threshold;

                    componentGroupNew.selectedComponentIndex=0;
                    var currentComponentLayer=self.layerStore.componentLayers[self.stack.z];
                    if(currentComponentLayer.activeGroupIndex!=-1)
                    {
                        currentComponentGroups[currentComponentLayer.activeGroupIndex].active=false;
                    }
                    var componentGroupIdNew=currentComponentGroups.length;
                    currentComponentGroups[componentGroupIdNew]=componentGroupNew;
                    currentComponentLayer.activeGroupIndex=currentComponentGroups.length-1;
                    self.loadDrawingsByComponentId(component.id);

                    self.getComponentImage(componentGroupNew.components[0],x,y, self.stack.z,0.5,true,false);

                }

            }

            self.showActiveElements(false);

        });
    };


    this.loadDrawingsByComponentId=function(componentId)
    {

        var url= django_url + project.id + "/stack/" + self.stack.id + '/get-saved-drawings-by-component-id'+ "?" + $.param({
            z : self.stack.z,
            skeleton_id:project.selectedObjects.selectedskeleton,
            component_id: componentId});

        $.getJSON(url,function(result)
        {
            self.parseDrawingList(result,false);
            self.showDrawingsByComponentId(componentId,false);

        });
    };

    this.parseDrawingList=function(result,showOnCanvas)
    {
        for (var componentDrawingId in result)
        {
            if(result.hasOwnProperty(componentDrawingId))
            {
                var componentDrawing=result[componentDrawingId];

                if(self.checkIfDrawingIsLoaded(componentDrawingId)){continue;}

                var newComponentDrawing=new Drawing();
                newComponentDrawing.id=componentDrawing.id;
                newComponentDrawing.componentId=componentDrawing.componentId;
                newComponentDrawing.minX=componentDrawing.minX;
                newComponentDrawing.minY=componentDrawing.minY;
                newComponentDrawing.maxX=componentDrawing.maxX;
                newComponentDrawing.maxY=componentDrawing.maxY;
                newComponentDrawing.type=componentDrawing.type;
                fabric.loadSVGFromString(componentDrawing.svg,function(elements,options)
                {
                    var drawingObject=elements[0];
                    drawingObject.set({ left: self.getCanvasXFromStackX(newComponentDrawing.centerX()), top: self.getCanvasYFromStackY(newComponentDrawing.centerY()), angle: 0 }).scale(1)
                    newComponentDrawing.drawingObject=drawingObject;
                    if(showOnCanvas)
                    {
                        canvasLayer.canvas.add(drawingObject);
                    }

                });

                self.layerStore.drawingLayers[self.stack.z].drawings[self.layerStore.drawingLayers[self.stack.z].drawings.length]=newComponentDrawing;
            }
        }
    }

    this.checkIfDrawingIsLoaded=function(drawingIdToCheck)
    {
        var alreadyLoaded=false;
        for (var drawingId in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingId))
            {
                var drawing=self.layerStore.drawingLayers[self.stack.z].drawings[drawingId];
                if(drawing.id==drawingIdToCheck)
                {
                    alreadyLoaded=true;
                    break;
                }
            }
        }
        return alreadyLoaded;

    };

    this.clearCanvas=function()
    {
        canvasLayer.canvas.clear();
        //delete components
        var newLayer=new ComponentLayer();
        for (var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                //Delete component drawings
                var componentGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                for(var componentId in componentGroup.components)
                {
                    if(componentGroup.components.hasOwnProperty(componentId))
                    {
                        self.deleteDrawingByComponentId(componentGroup.components[componentId].id);
                    }
                }
            }

        }
        newLayer.activeGroupIndex=-1;
        self.layerStore.componentLayers[self.stack.z]=newLayer;
        self.putComponents();

        //delete drawings
        for (var drawingIndex in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingIndex))
            {
                    var url= django_url + project.id + "/stack/" + self.stack.id + '/delete-drawing'+ "?" + $.param({
                        id: self.layerStore.drawingLayers[self.stack.z].drawings[drawingIndex].id
                    });

                    $.getJSON(url,function(result)
                    {
                        //Log
                    });
            }
        }
        self.layerStore.drawingLayers[self.stack.z]=new DrawingLayer();

    };

    this.switchToComponentMode=function()
    {
        self.state=self.stateEnum.COMPONENTVIEW;
        canvasLayer.canvas.isDrawingMode = false;
        $('#button_drawing_mode').text('Correction Mode');
        $('#sliders_box_brush_size').hide();
        $('#component_controls').show();
        $('#free_drawing_controls').hide();
        $('#sliders_box_brush_size').hide();
    };

    this.switchToFreeDrawingMode=function()
    {
        self.state=self.stateEnum.FREEDRAWING;
        canvasLayer.canvas.isDrawingMode = true;
        canvasLayer.canvas.freeDrawingColor =self.rgbArrayToRgbString(self.drawingType.color,false);
        $('#component_controls').hide();
        $('#free_drawing_controls').show();
        $('#sliders_box_brush_size').show();
    };

    //
    //
    //Saving functions
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    this.generateMesh=function()
    {

        var url=  django_url+ project.id + "/stack/" + self.stack.id + '/get-mesh';
        var viewState=canvasLayer.getFieldOfViewParameters();

        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:project.selectedObjects.selectedskeleton,z:self.stack.z,x:viewState.x,y:viewState.y,width:viewState.width,height:viewState.height },
            dataType: "json",
            beforeSend: function(x)
            {
                //Log before send
            },
            success: function(result)
            {


            }
        });

    };


    this.putDrawing=function(drawing)
    {
        var url=  django_url+ project.id + "/stack/" + self.stack.id + '/put-drawing';
        var drawingToJson ={id:drawing.id,minX:drawing.minX,minY:drawing.minY,maxX:drawing.maxX,maxY:drawing.maxY,svg:drawing.svg(),type:drawing.type,componentId:drawing.componentId};
        var viewState=canvasLayer.getFieldOfViewParameters();


        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:project.selectedObjects.selectedskeleton,z:self.stack.z,x:viewState.x,y:viewState.y,width:viewState.width,height:viewState.height,drawing: JSON.stringify(drawingToJson) },
            dataType: "json",
            beforeSend: function(x)
            {
                //Log before send
            },
            success: function(result)
            {
                drawing.id=result;

            }
        });

    };


    this.putComponents=function(skeletonID)
    {
        if(project.selectedObjects.selectedskeleton==null||!(self.state==self.stateEnum.COMPONENTVIEW||self.state==self.stateEnum.COMPONENTDRAW) || self.layerStore.componentLayers.length==0)
        {
            return 0;
        }
        if(skeletonID==undefined || skeletonID==null)
        {
            skeletonID=project.selectedObjects.selectedskeleton;
        }

        //TODO:remove debug url
        //var url= "dj/" + project.id + "/stack/" + self.stack.id + "/put-components";

        var url= django_url + project.id + "/stack/" + self.stack.id + '/put-components';
        var jsonObjects ={};

        for (var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                var component=componentGroup.components[componentGroup.selectedComponentIndex];
                jsonObjects[component.id]={id:component.id,minX:component.minX,minY:component.minY,maxX:component.maxX,maxY:component.maxY,threshold:component.threshold};

            }
        }

        var viewstate=canvasLayer.getFieldOfViewParameters();

        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:skeletonID,z:self.stack.z,x:viewstate.x,y:viewstate.y,width:viewstate.width,height:viewstate.height,components: JSON.stringify(jsonObjects) },
            dataType: "json",
            beforeSend: function(x) {
                //Log before send
            },
            success: function(result)
            {
                //Log result, report on error

                }
            });

    };

    //
    //
    //Element handling & display functions
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    this.initSkeleton=function()
    {
        if(project.selectedObjects.selectedskeleton==null){return;}


        $.blockUI({ message: '<h2><img src="widgets/busy.gif" /> Initializing skeleton. Just a moment...</h2>' });
        requestQueue.register(

            django_url + project.id + "/stack/" + self.stack.id + '/initialize_components',
            "POST", {
                skeleton_id:project.selectedObjects.selectedskeleton
            }, function (status, text, xml) {
                $.unblockUI();
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            // just redraw all for now
                            self.loadElements();
                        }
                    }
                }
            });


    };

    this.showActiveElements=function(updatePosition)
    {
        canvasLayer.canvas.clear();
        self.showActiveComponents(updatePosition);
        self.showUnassociatedDrawings(updatePosition);

    };


    this.showDrawingsByComponentId=function(componentId,updatePosition)
    {
        for (var drawingId in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingId))
            {
                var drawing=self.layerStore.drawingLayers[self.stack.z].drawings[drawingId];
                if(drawing.componentId==componentId)
                {
                    if(updatePosition)
                    {
                        drawing.drawingObject.set({ left: self.getCanvasXFromStackX(drawing.centerX()), top: self.getCanvasYFromStackY(drawing.centerY())});
                    }
                    canvasLayer.canvas.add(drawing.drawingObject);
                    canvasLayer.canvas.bringToFront(drawing.drawingObject);
                }

            }
        }
    };

    this.showUnassociatedDrawings=function(updatePosition)
    {
        for (var drawingId in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingId))
            {
                var drawing=self.layerStore.drawingLayers[self.stack.z].drawings[drawingId];
                if(drawing.componentId==null)
                {
                    if(updatePosition)
                    {
                        self.loadUnassociatedDrawings();
                        drawing.drawingObject.set({ left: self.getCanvasXFromStackX(drawing.centerX()), top: self.getCanvasYFromStackY(drawing.centerY())});
                    }
                    canvasLayer.canvas.add(drawing.drawingObject);
                }

            }
        }
    };


    this.showActiveComponents=function(updatePosition)
    {
        if(project.selectedObjects.selectedskeleton==null ||self.layerStore.componentLayers[self.stack.z]==undefined)
        {
            return;
        }

        //redraw all
        for (var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                var component=componentGroup.components[componentGroup.selectedComponentIndex];
                self.showDrawingsByComponentId(component.id,updatePosition);
                if(component.image==null){continue;}

                //update position
                if(updatePosition)
                {
                    componentGroup.components[componentGroup.selectedComponentIndex].image.set({ left: self.getCanvasXFromStackX(component.centerX()), top: self.getCanvasYFromStackY(component.centerY())});

                }


                canvasLayer.canvas.add(component.image);
                var index=canvasLayer.canvas._objects.length;
                if(index!=0){index-=1;}
                var componentItem=canvasLayer.canvas.item(index);
               /* componentItem.lockRotation = true;
                componentItem.lockScalingX = componentItem.lockScalingY = true;
                componentItem.lockMovementX = true;
                componentItem.lockMovementY = true;*/
                componentItem.selectable = false;


            }
        }


    };

    this.deselectAllComponents=function()
    {
        for(var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var component = self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].components[self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].selectedComponentIndex];
                component.unsetActive();
                self.refreshFilters( component );

            }
        }

    };
    this.deselectAllPaths=function()
    {
        for(var pathIndex in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(pathIndex))
            {
                var drawing = self.layerStore.drawingLayers[self.stack.z].drawings[pathIndex];
                self.invertPath(drawing,false);

            }
        }

    };

    this.refreshFilters=function(component)
    {
        component.image.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));
    }

    this.invertComponent=function(component,invert)
    {
        component.image.filters[0]=invert && new fabric.Image.filters.Invert();
        component.image.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));
    };

    this.invertPath=function(path,invert)
    {
        if(path.type==100)
        {
            path.drawingObject.stroke=self.rgbArrayToRgbString(self.componentColor,invert);
        }
        else
        {
            path.drawingObject.stroke=self.rgbArrayToRgbString(self.drawingTypeEnum.getByValue('value',path.type).color,invert);
        }

        path.inverted=invert;
        canvasLayer.canvas.renderAll.bind(canvasLayer.canvas);
    };


    this.CheckForIntersectingPath=function(x,y)
    {
        var returnPath=null;
        if(self.layerStore.drawingLayers[self.stack.z]!=undefined)
        {
            //make all invisible
            canvasLayer.canvas.clear();

            var counter=-1;
            for(var drawingIndex in self.layerStore.drawingLayers[self.stack.z].drawings)
            {
                if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingIndex))
                {
                    counter+=1;
                    var drawing = self.layerStore.drawingLayers[self.stack.z].drawings[drawingIndex];

                    canvasLayer.canvas.add(drawing.drawingObject);

                    var pixelvalue=canvasLayer.canvas.contextContainer.getImageData(x,y,1,1);
                    if(pixelvalue.data[3]==0){continue;}

                    returnPath=drawingIndex;
                    break;

                }

            }
            //make all visible
            self.showActiveElements(false);

        }

        return returnPath;
    };


    this.CheckForIntersectingGroup=function(x,y)
    {
        var stackX=self.getStackXFromCanvasX(x);
        var stackY=self.getStackYFromCanvasY(y);

        var returnGroup=null;
        if(self.layerStore.componentLayers[self.stack.z]!=undefined)
        {
            //make all invisible
           canvasLayer.canvas.clear();

            var counter=-1;
            for(var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
            {
                if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
                {
                    counter+=1;
                    var component = self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].components[self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].selectedComponentIndex];
                    if((component.minX)>stackX){continue;}
                    if((component.maxX)<stackX){continue;}
                    if((component.minY)>stackY){continue;}
                    if((component.maxY)<stackY){continue;}

                    var componentGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                    canvasLayer.canvas.add(componentGroup.components[componentGroup.selectedComponentIndex].image);

                    var pixelvalue=canvasLayer.canvas.contextContainer.getImageData(x,y,1,1);
                    if(pixelvalue.data[3]==0){continue;}

                    returnGroup=componentGroupId;
                    break;

                }

            }
            //make all visible
            self.showActiveElements(false);
        }

        return returnGroup;
    };


    this.deleteElement=function()
    {
        if(self.deleteComponentGroup())
        {
            //Log
        }
        else if(self.deleteDrawing())
        {
            //Log
        }
        else
        {
            return;
        }
        self.showActiveElements(false);
    };

    this.deleteDrawing=function()
    {
        var match=false;
        var newLayer=new DrawingLayer();
        for (var drawingIndex in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingIndex))
            {
                if(self.layerStore.drawingLayers[self.stack.z].drawings[drawingIndex].inverted)
                {
                    //TODO:remove debug url
                    //django_url

                    var url= django_url + project.id + "/stack/" + self.stack.id + '/delete-drawing'+ "?" + $.param({
                        id: self.layerStore.drawingLayers[self.stack.z].drawings[drawingIndex].id
                       });


                    $.getJSON(url,function(result)
                    {
                        //Log

                    });
                    match=true;
                }
                else
                {
                    newLayer.drawings[drawingIndex]=self.layerStore.drawingLayers[self.stack.z].drawings[drawingIndex];
                }
            }


        }

        if(match)
        {
            self.layerStore.drawingLayers[self.stack.z]=newLayer;
        }
        return match;
    };

    this.deleteDrawingByComponentId=function(componentId)
    {
        self.deselectAllPaths();
        for (var drawingId in self.layerStore.drawingLayers[self.stack.z].drawings)
        {
            if(self.layerStore.drawingLayers[self.stack.z].drawings.hasOwnProperty(drawingId))
            {
                var drawing=self.layerStore.drawingLayers[self.stack.z].drawings[drawingId];
                if(drawing.componentId==componentId)
                {
                    self.invertPath(drawing,true);
                    self.deleteDrawing();

                }

            }
        }
    };


    this.deleteComponentGroup=function()
    {
        var match=false;
        if(self.state==self.stateEnum.COMPONENTVIEW&&self.layerStore.componentLayers[self.stack.z]!=undefined)
        {
            var newLayer=new ComponentLayer();
            var countGroups=-1;
            for (var componentGroupId in self.layerStore.componentLayers[self.stack.z].componentGroups)
            {
                if(self.layerStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId) &&
                    self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].components[self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId].selectedComponentIndex].active==false)
                {
                    countGroups+=1;
                    newLayer.componentGroups[countGroups]=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                }
                else
                {
                    //Delete component drawings
                    var componentGroup=self.layerStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                    for(var componentId in componentGroup.components)
                    {
                        if(componentGroup.components.hasOwnProperty(componentId))
                        {
                            self.deleteDrawingByComponentId(componentGroup.components[componentId].id);
                        }
                    }
                    match=true;
                }
            }
            newLayer.activeGroupIndex=countGroups;
            if(match){self.layerStore.componentLayers[self.stack.z]=newLayer;}

        }
        return match;

    };


    this.getComponents= function(x,y,activeGroupIndex)
    {
        if(self.state!=self.stateEnum.COMPONENTVIEW)
        {
            return 0;
        }
        var fieldOfView=canvasLayer.getFieldOfViewParameters();

        var url= django_url + project.id + "/stack/" + self.stack.id + '/components-for-point'+ "?" + $.param({
            x: self.getStackXFromCanvasX(x),
            y: self.getStackYFromCanvasY(y),
            scale : 0.5, // defined as 1/2**zoomlevel
            z : self.stack.z});


        $.getJSON(url,function(result){

            var currentComponentGroups=self.layerStore.componentLayers[self.stack.z].componentGroups;

            var componentGroupIdNew=currentComponentGroups.length;
            var componentGroupNew=null;
            if(activeGroupIndex!=undefined)
            {
                componentGroupNew=self.layerStore.componentLayers[self.stack.z].componentGroups[activeGroupIndex];
            }
            else{componentGroupNew=new ComponentGroup();}


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
                        components[componentGroupNew.components.length]=component;
                        component.id=componentResultId;
                        component.maxX=componentResult.maxX;
                        component.minX=componentResult.minX;
                        component.maxY=componentResult.maxY;
                        component.minY=componentResult.minY;
                        component.threshold=componentResult.threshold;

                        self.loadDrawingsByComponentId(component.id);

                    }
                }

            }

            if((componentGroupNew.components != undefined) && componentGroupNew.components.length>0)
            {
                componentGroupNew.active=true;
                componentGroupNew.groupLoaded=true;

                var currentComponentLayer=self.layerStore.componentLayers[self.stack.z];
                if(currentComponentLayer.activeGroupIndex!=-1)
                {
                    currentComponentGroups[currentComponentLayer.activeGroupIndex].active=false;
                }

                var visible=false;

                if(activeGroupIndex==undefined)
                {
                    currentComponentGroups[componentGroupIdNew]=componentGroupNew;
                    currentComponentLayer.activeGroupIndex=currentComponentGroups.length-1;

                    componentGroupNew.components=componentGroupNew.components.sort(function(a,b){return a.threshold- b.threshold;});
                    componentGroupNew.selectedComponentIndex=0;
                    visible=true;
                }
                else
                {
                    var currentComponent=componentGroupNew.components[0];
                    componentGroupNew.components=componentGroupNew.components.sort(function(a,b){return a.threshold- b.threshold;});
                    componentGroupNew.selectedComponentIndex=componentGroupNew.components.indexOf(currentComponent);
                }


                for(var componentToLoadId in componentGroupNew.components)
                {
                    if(componentGroupNew.components.hasOwnProperty(componentToLoadId)&&componentGroupNew.components[componentToLoadId].image==null)
                    {
                        self.getComponentImage(componentGroupNew.components[componentToLoadId],x,y, self.stack.z,0.5,visible,true);
                        visible=false;

                    }
                }


            }


        });

    };

    this.removeElement= function(id)
    {
        var elem=document.getElementById(id);
        if(elem!=null){return elem.parentNode.removeChild(elem);}

    };


    this.getComponentImage= function(component,x,y,z,scale,visible,active)
    {

         var url=django_url + project.id + "/stack/" + self.stack.id + '/componentimage'+ "?" + $.param({
                    id: component.id,
                    z:z,
                    scale : scale, // defined as 1/2**zoomlevel
                    red:self.componentColor[0],
                    green:self.componentColor[1],
                    blue:self.componentColor[2],
                    alpha:self.componentColor[3]
                    });

        component.visible=visible;

        fabric.Image.fromURL(url, function(img)
        {
            component.image = img.set({ left: self.getCanvasXFromStackX(component.centerX()), top: self.getCanvasYFromStackY(component.centerY()), angle: 0,clipTo:img }).scale(1);
            if(visible)
            {
                canvasLayer.canvas.add(component.image);
                var item=canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1);

                canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1).selectable=false;
                if(active) {
                   component.setActive();
                } else {
                   component.unsetActive();
                }
                self.refreshFilters(component);

            }
        });
    };


    //
    //
    //Helper functions
    //@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    this.getCanvasXFromStackX=function(stackX)
    {

        return stackX-canvasLayer.getFieldOfViewParameters().x;

    };

    this.getCanvasYFromStackY=function(stackY)
    {
        return stackY-canvasLayer.getFieldOfViewParameters().y;
    };

    this.getStackYFromCanvasY=function(canvasY)
    {
        return canvasLayer.getFieldOfViewParameters().y+canvasY;
    };

    this.getStackXFromCanvasX=function(canvasX)
    {
        return canvasLayer.getFieldOfViewParameters().x+canvasX;
    };

    var setColor = function( color ) {
        canvasLayer.canvas.freeDrawingColor = color;
    };

    this.rgbToHex=function(R,G,B) {return self.toHex(R)+self.toHex(G)+self.toHex(B)}
    this.toHex=function(n) {
        n = parseInt(n,10);
        if (isNaN(n)) return "00";
        n = Math.max(0,Math.min(n,255));
        return "0123456789ABCDEF".charAt((n-n%16)/16)
            + "0123456789ABCDEF".charAt(n%16);
    }

    this.rgbArrayToRgbString=function(array,invert){
        if(invert) {
            //return "rgb("+(255-array[0]).toString()+","+(255-array[1]).toString()+","+(255-array[2]).toString()+")"
            return "rgb("+(0).toString()+","+(255).toString()+","+(0).toString()+")"
        };
        return "rgb("+array[0]+","+array[1]+","+array[2]+")"};


}

function Drawing()
{
    this.id=null;
    this.componentId=null;
    this.minX=null;
    this.minY=null;
    this.maxX=null;
    this.maxY=null;
    this.svg=function(){return this.drawingObject.toSVG();};
    this.drawingObject=null;
    this.type=null;
    this.inverted=false;

    this.width=function(){return this.maxX-this.minX; };
    this.height=function(){return this.maxY-this.minY; };
    this.centerX=function(){return Math.round(this.minX+(this.maxX-this.minX)/2); };
    this.centerY=function(){return Math.round(this.minY+(this.maxY-this.minY)/2); };
}


function DrawingLayer()
{
    this.drawings=[];
}


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
    this.active=true;

    this.width=function(){return this.maxX-this.minX; };
    this.height=function(){return this.maxY-this.minY; };
    this.centerX=function(){return Math.round(this.minX+(this.maxX-this.minX)/2); };
    this.centerY=function(){return Math.round(this.minY+(this.maxY-this.minY)/2); };

    this.setActive = function() {
        if(this.image!==null) {
            this.active = true;
            this.image.filters[0]=this.active && new fabric.Image.filters.Sepia2();
        }
    }

    this.unsetActive = function() {
        this.active = false;
        this.image.filters[0]=this.active && new fabric.Image.filters.Sepia2();
    }

    this.toggleActive = function() {
        this.active = !this.active;
    }
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

function LayerStore()
{
    this.componentLayers=[];
    this.drawingLayers=[];
}


function EnumFactory()
{
    function Enum() {
        this._enums = [];
        this._lookups = {};
    }

    Enum.prototype.getEnums = function() {
        return _enums;
    };

    Enum.prototype.forEach = function(callback){
        var length = this._enums.length;
        for (var i = 0; i < length; ++i){
            callback(this._enums[i]);
        }
    };

    Enum.prototype.addEnum = function(e) {
        this._enums.push(e);
    };

    Enum.prototype.getByName = function(name) {
        return this[name];
    };

    Enum.prototype.getByValue = function(field, value) {
        var lookup = this._lookups[field];
        if(lookup) {
            return lookup[value];
        } else {
            this._lookups[field] = ( lookup = {});
            var k = this._enums.length - 1;
            var returnValue=null;
            for(; k >= 0; --k) {
                var m = this._enums[k];
                var j = m[field];
                lookup[j] = m;
                if(j == value) {
                    returnValue=m;
                }
            }
            return returnValue;
        }
        return null;
    };

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


