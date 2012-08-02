/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 */

/**
 * Constructor for the Canvas tool.
 */
function CanvasTool()
{
    // this.prototype = new Navigator();

    var self = this;
    var canvasLayer = null;
    var controls = null;
    var controlsBackground=null;
    this.stack = null;
    this.toolname = "canvastool";
    this.componentColor=[0,255,255,255];

	  if ( !ui ) ui = new UI();

    //Create Z slider controls:
    var sliders_box = document.getElementById( "sliders_box_seg" );

    /* remove all existing dimension sliders */
    while ( sliders_box.firstChild )
      sliders_box.removeChild( sliders_box.firstChild );

    this.slider_z = new Slider(
        SLIDER_HORIZONTAL,
        true,
        1,
        388,
        388,
        1,
        function( val )
        { statusBar.replaceLast( "z: " + val );  return; } );

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

    this.slider_brush_size = new Slider(
        SLIDER_HORIZONTAL,
        true,
        1,
        30,
        30,
        1,
        function( val )
        { return;});

    var slider_brush_size_box = document.createElement( "div" );
    slider_brush_size_box.className = "box";
    slider_brush_size_box.id = "slider_brush_size_box";
    var slider_brush_size_box_label = document.createElement( "p" );
    slider_brush_size_box_label.appendChild( document.createTextNode( "brush size&nbsp;&nbsp;" ) );
    slider_brush_size_box.appendChild( self.slider_brush_size.getView() );
    slider_brush_size_box.appendChild( self.slider_brush_size.getInputView() );

    sliders_brush_size_box.appendChild( slider_brush_size_box );




    var enumFactory=new EnumFactory();
    this.componentStore=new ComponentStore();

    this.stateEnum=enumFactory.defineEnum({
        COMPONENTVIEW : {
            value : 1,
            string : 'componentview'
        },
        NOSKELETONSELECTED : {
            value : 1,
            string : 'noskeletonselected'
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

    this.resize = function( width, height )
    {
        // self.prototype.resize( width, height );
        console.log('resize', width, height);
        return;
    };

    this.initskeleton=function()
    {
        if(project.selectedObjects.selectedskeleton==null){return;}

        //TODO:Remove debug URL

        $.blockUI({ message: '<h2><img src="widgets/busy.gif" /> Initializing skeleton. Just a moment...</h2>' });
        requestQueue.register(
            'http://localhost:8000/' + project.id + "/stack/" + self.stack.id + '/initialize_components',
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
                            self.loadComponents();
                        }
                    }
                }
            });

    };



    this.loadComponents=function()
    {
        if(project.selectedObjects.selectedskeleton==null)
        {
            return;
        }
        //Load components from DB
        if(self.state!=self.stateEnum.COMPONENTVIEW  || self.componentStore.componentLayers[self.stack.z]!=undefined)
        {
            self.showActiveComponents();
            return 0;
        }

        //TODO:remove debug url

        //var url= "dj/" + project.id + "/stack/" + self.stack.id + "/get-saved-components";

        var url='http://localhost:8000/' + project.id + "/stack/" + self.stack.id + '/get-saved-components'+ "?" + $.param({
            skeleton_id:project.selectedObjects.selectedskeleton,
            z : self.stack.z});


        $.getJSON(url,function(result)
        {
            self.componentStore.componentLayers[self.stack.z]=new ComponentLayer();
            var currentComponentGroups=self.componentStore.componentLayers[self.stack.z].componentGroups;

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
                    var currentComponentLayer=self.componentStore.componentLayers[self.stack.z];
                    if(currentComponentLayer.activeGroupIndex!=-1)
                    {
                        currentComponentGroups[currentComponentLayer.activeGroupIndex].active=false;
                    }
                    var componentGroupIdNew=currentComponentGroups.length;
                    currentComponentGroups[componentGroupIdNew]=componentGroupNew;
                    currentComponentLayer.activeGroupIndex=currentComponentGroups.length-1;


                    self.getComponentImage(componentGroupNew.components[0],x,y, self.stack.z,0.5,true);

                }

            }

            self.showActiveComponents();

        });
    };


    this.pushLabels = function() {
        
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
            senddata['z'] = self.stack.z; // TODO
            senddata['scale'] = self.stack.s;
            senddata['row'] = 'y';
            senddata['col'] = 'x';
            senddata['width'] = fieldofview.width;
            senddata['height'] = fieldofview.height;
            senddata['image'] = output;
            senddata['metadata'] = self.labels;
            // console.log('send data', senddata, self.stack);
            if( self.stack.tile_source_type == 2 ) {
                if( self.stack.labelupload_url === '' ) {
                  alert('Push labels not enabled for this stack');
                  return;
                }
                // z, t
                jQuery.ajax({
                    url: self.stack.labelupload_url, // "dj/" + project.id + "/stack/" + stack.id + "/push_image", // stack.labelUploadURL
                    type: "POST",
                    dataType: "json",
                    data: senddata,
                    success: function (data) {
                      console.log('return', data);
                    }
                  });
            } else if ( self.stack.tile_source_type === 3 ) {
                console.log('tile source type 3');
                jQuery.ajax({
                    //url: stack.labelupload_url, // "dj/" + project.id + "/stack/" + stack.id + "/push_image", // stack.labelUploadURL
                    url: "dj/" + project.id + "/stack/" + self.stack.id + "/put_tile", // stack.labelUploadURL
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

    var createControlBox = function() {

        $('#button_push_labels').click(function() {
            self.pushLabels();
        });

        $('#button_save_components').click(function() {
            self.putComponents();
        });

        $('#button_clear_canvas').click(function() {
            if (confirm('Are you sure?')) {
                canvasLayer.canvas.clear();

            }
        });
        $('#button_init_components').click(function() {

            self.initskeleton();
        });

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

        canvasLayer.canvas.freeDrawingLineWidth = 11;


        /*controls = document.createElement("div");
         controls.className = "canvasControls";
         controls.id = "canvasControlsId";
         controls.style.zIndex = 6;
         controls.style.width = "250px";
         controls.style.height = "300px";
         controls.style.backgroundColor='rgba(255,255,255,0.3)';*/

        /*var widthslider = $("#sliders_box_brush_size").slider({
            value: 11,
            min: 1,
            max: 20,
            step: 2,
            slide: function(event, ui) {
                canvasLayer.canvas.freeDrawingLineWidth = ui.value;
                widthSliderField.value = "" + ui.value;
            }
        });*/

        //widthSliderField.value = "11";

        /*var brush = document.createElement("div");
        var html = '<div style="display:none;" id="drawing-mode-options">';
        // '<button id="drawing-mode">Cancel drawing mode</button>' +
        brush.innerHTML = html;
        controls.appendChild( brush );

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
        controls.appendChild( labelList );*/


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
            event.stopPropagation();
        });

        $('#button_drawing_mode').click(function() {

           canvasLayer.canvas.isDrawingMode = !canvasLayer.canvas.isDrawingMode;

            if (canvasLayer.canvas.isDrawingMode) {
              $('#button_drawing_mode').text('Cancel drawing mode');
              // TODO: hide drawing mode options
              // drawingOptionsEl.style.display = '';
                self.state=self.stateEnum.COMPONENTDRAW;
            }
            else {
              $('#button_drawing_mode').text('Drawing mode');
              // TODO: show drawing mode options
              // drawingOptionsEl.style.display = 'none';
                self.state=self.stateEnum.COMPONENTVIEW;
                canvasLayer.canvas.interactive=false;
                canvasLayer.canvas.selection=false;
            }

        });
        



        // ******************
        // self.stack.getView().appendChild( controls );
        // ******************

       /* var drawingOptionsEl = document.getElementById('drawing-mode-options'),
            drawingColorEl = document.getElementById('drawing-color'),
            drawingLineWidthEl = document.getElementById('drawing-line-width');*/

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


        // append jquery elements


        // labels
        /*createLabels( );
        setColor( 'rgba(255,0,0,1.0)' );*/


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

		    //self.mouseCatcher.onmousedown = onmousedown;
        //self.stack.getView().appendChild( self.mouseCatcher );

        // self.prototype.setMouseCatcher( canvasLayer.view );
        // TODO: Layer is added to the parent stack, but the view
        // is not inserted in the DOM - this has to be done manually
        // in the canvaslayer.js. Is this by design?
        parentStack.addLayer( "CanvasLayer", canvasLayer );

        // view is the mouseCatcher now
        var view = canvasLayer.view;

        view.onmouseup= function(e) { self.mouseup(e); };
        view.onmousedown=function(e) {
          // if middle mouse, propagate to onmousedown
          if( e.button === 1) {
            onmousedown(e);
          } else {
            self.mousedown(e);
          }
        };
        view.onmousewheel=function(e){self.mousewheel(e);};

    };

    this.mousewheel=function(e)
    {
        if(project.selectedObjects.selectedskeleton==null||self.state!=self.stateEnum.COMPONENTVIEW || self.componentStore.componentLayers.length==0)
        {
            return;
        }

        var up=true;
        if(e.wheelDelta<0){up=false;}

        var currentComponentLayer=self.componentStore.componentLayers[self.stack.z];
        var currentComponentGroup=currentComponentLayer.componentGroups[currentComponentLayer.activeGroupIndex];
        var index=currentComponentGroup.selectedComponentIndex;
        if(index==0&&up){return;}
        var componentGroupLength=0;
        for (var componentCountId in currentComponentGroup.components){componentGroupLength+=1;}
        if(index==(componentGroupLength-1)&&!up){return;}

        var component=currentComponentGroup.components[index];
        component.visible=false;

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
        if(project.selectedObjects.selectedskeleton==null||self.state!=self.stateEnum.COMPONENTVIEW || self.componentStore.componentLayers.length==0)
        {
            return 0;
        }

        //TODO:remove debug url

        //var url= "dj/" + project.id + "/stack/" + self.stack.id + "/put-components";

        var url='http://localhost:8000/' + project.id + "/stack/" + self.stack.id + '/put-components';
        var jsonObjects ={};

        for (var componentGroupId in self.componentStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.componentStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                var component=componentGroup.components[componentGroup.selectedComponentIndex];
                jsonObjects[component.id]={id:component.id,minX:component.minX,minY:component.minY,maxX:component.maxX,maxY:component.maxY,threshold:component.threshold};

            }
        }

        var viewstate=canvasLayer.getFieldOfViewParameters();

        //TODO:Only save array if not empty

        $.ajax({
            url: url,
            type: "POST",
            data: {skeleton_id:project.selectedObjects.selectedskeleton,z:self.stack.z,x:viewstate.x,y:viewstate.y,width:viewstate.width,height:viewstate.height,components: JSON.stringify(jsonObjects) },
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



    this.showActiveComponents=function()
    {
        if(self.state!=self.stateEnum.COMPONENTVIEW ||project.selectedObjects.selectedskeleton==null ||self.componentStore.componentLayers[self.stack.z]==undefined)
        {
            return;
        }
        canvasLayer.canvas.clear();

        //redraw all
        for (var componentGroupId in self.componentStore.componentLayers[self.stack.z].componentGroups)
        {
            if(self.componentStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
            {
                var componentGroup=self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
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
        if(project.selectedObjects.selectedskeleton==null)
        {
            window.alert('Please select a skeleton!')
            return
        }

        if(self.state!=self.stateEnum.COMPONENTVIEW)
        {
            return;
        }

        x = e.offsetX;
        y = e.offsetY;

        if(self.started)
        {
            self.started = false;
        }

        var intersectingComponentGroupId=self.CheckForIntersectingGroup(x,y);
        if(intersectingComponentGroupId!=null)
        {
            self.componentStore.componentLayers[self.stack.z].activeGroupIndex=intersectingComponentGroupId;

            var activeGroup=self.componentStore.componentLayers[self.stack.z].componentGroups[intersectingComponentGroupId];
            if(!activeGroup.grouploaded)
            {
                self.getComponents(activeGroup.components[activeGroup.selectedComponentIndex].centerX(),activeGroup.components[activeGroup.selectedComponentIndex].centerY(),intersectingComponentGroupId)
            }

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

    };


    this.CheckForIntersectingGroup=function(x,y)
    {
        var returnGroup=null;
        if(self.componentStore.componentLayers[self.stack.z]!=undefined)
        {
            //make all invisible
           canvasLayer.canvas.clear();

            var fieldOfView=canvasLayer.getFieldOfViewParameters();

            var counter=-1;
            for(var componentGroupId in self.componentStore.componentLayers[self.stack.z].componentGroups)
            {
                if(self.componentStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId))
                {
                    counter+=1;
                    var component = self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId].components[self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId].selectedComponentIndex];
                    if((component.minX)>x){continue;}
                    if((component.maxX)<x){continue;}
                    if((component.minY)>y){continue;}
                    if((component.maxY)<y){continue;}

                    var componentGroup=self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                    canvasLayer.canvas.add(componentGroup.components[componentGroup.selectedComponentIndex].image);
                    var index=canvasLayer.canvas._objects.length;
                    if(index!=0){index-=1;}
                    canvasLayer.canvas.item(index).selectable=false;

                    var pixelvalue=canvasLayer.canvas.contextContainer.getImageData(x,y,1,1);
                    if(pixelvalue.data[3]==0){continue;}

                    returnGroup=componentGroupId;
                    break;

                }

            }
            //make all visible
            self.showActiveComponents();
        }

        return returnGroup;
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


    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {
        document.getElementById( "toolbar_seg" ).style.display = "block";

        if (canvasLayer && self.stack) {
            if (self.stack !== parentStack) {
                // If the tracing layer exists and it belongs to a different stack, replace it
                self.stack.removeLayer( canvasLayer );
                createCanvasLayer( parentStack );
                createControlBox();
                self.generateComponentLayer();

            } else {
                // reactivateBindings();
            }
        } else {
            createCanvasLayer( parentStack );
            createControlBox();
        }
        // console.log('field of view parameters', canvasLayer.getFieldOfViewParameters())

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

        self.loadComponents();


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
        document.getElementById( "toolbar_seg" ).style.display = "none";

        // remove the canvasLayer with the official API
        self.stack.removeLayer( "CanvasLayer" );

        // canvas tool responsability to remove the controls
        // stack.getView().removeChild( controls );

        return;
    };

    this.redraw = function()
    {
        // self.prototype.redraw();

        // update slider
      	self.slider_z.setByValue( self.stack.z, true );
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
                console.log('+ sali!');
                //self.prototype.slider_s.move(1);
                return false;
            }
        }),

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
            run: function (e) {
                self.deleteComponentGroup();
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

    this.deleteComponentGroup=function()
    {
        if(self.state==self.stateEnum.COMPONENTVIEW&&self.componentStore.componentLayers[self.stack.z]!=undefined)
        {
            var newLayer=new ComponentLayer();
            var countGroups=-1;
            for (var componentGroupId in self.componentStore.componentLayers[self.stack.z].componentGroups)
            {
                if(self.componentStore.componentLayers[self.stack.z].componentGroups.hasOwnProperty(componentGroupId) && componentGroupId!=self.componentStore.componentLayers[self.stack.z].activeGroupIndex)
                {
                    countGroups+=1;
                    newLayer.componentGroups[countGroups]=self.componentStore.componentLayers[self.stack.z].componentGroups[componentGroupId];
                }
            }
            newLayer.activeGroupIndex=countGroups;
            self.componentStore.componentLayers[self.stack.z]=newLayer;

            self.showActiveComponents();

        }

    };


    this.getComponents= function(x,y,activeGroupIndex)
    {
        if(self.state!=self.stateEnum.COMPONENTVIEW)
        {
            return 0;
        }
        var fieldOfView=canvasLayer.getFieldOfViewParameters();

        //TODO:remove debug url

        //var url= "dj/" + project.id + "/stack/" + self.stack.id + "/components-for-point";

        var url='http://localhost:8000/' + project.id + "/stack/" + self.stack.id + '/components-for-point'+ "?" + $.param({
            x: x,
            y: y,
            scale : 0.5, // defined as 1/2**zoomlevel
            z : self.stack.z});


        $.getJSON(url,function(result){

            var currentComponentGroups=self.componentStore.componentLayers[self.stack.z].componentGroups;

            var componentGroupIdNew=currentComponentGroups.length;
            var componentGroupNew=null;
            if(activeGroupIndex!=undefined)
            {
                componentGroupNew=self.componentStore.componentLayers[self.stack.z].componentGroups[activeGroupIndex];
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

                    }
                }

            }

            if((componentGroupNew.components != undefined) && componentGroupNew.components.length>0)
            {
                componentGroupNew.active=true;
                componentGroupNew.groupLoaded=true;

                var currentComponentLayer=self.componentStore.componentLayers[self.stack.z];
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
                        self.getComponentImage(componentGroupNew.components[componentToLoadId],x,y, self.stack.z,0.5,visible);
                        visible=false;

                    }
                }

            }


        });

    };

    this.getComponentImage= function(component,x,y,z,scale,visible)
    {
        //TODO:remove debug url

        //var url= "dj/" + project.id + "/stack/" + self.stack.id + "/componentimage";

         var url='http://localhost:8000/' + project.id + "/stack/" + self.stack.id + '/componentimage'+ "?" + $.param({
                    id: component.id,
                    z:z,
                    scale : scale, // defined as 1/2**zoomlevel
                    red:self.componentColor[0],
                    green:self.componentColor[1],
                    blue:self.componentColor[2],
                    alpha:self.componentColor[3]
                    });

        component.visible=visible;
        var fieldOfView=canvasLayer.getFieldOfViewParameters();

        fabric.Image.fromURL(url, function(img)
        {
                    component.image = img.set({ left: component.displayPositionX(), top: component.displayPositionY(), angle: 0 }).scale(1);
                    if(visible)
                    {
                        canvasLayer.canvas.add(component.image);
                        var item=canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1);

                        canvasLayer.canvas.item(canvasLayer.canvas._objects.length-1).selectable=false;
                    }

                });

    };



    this.generateComponentLayer=function()
    {

        if(self.componentStore.componentLayers[self.stack.z]==undefined)
        {
            self.componentStore.componentLayers[self.stack.z]=new ComponentLayer();
        }

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
        //Save current component groups
        self.putComponents();

        canvasLayer.canvas.clear();

		self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );

        //Load saved component groups
        self.loadComponents();


		return;
	}


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

    this.width=function(){return this.maxX-this.minX; };
    this.height=function(){return this.maxY-this.minY; };
    this.centerX=function(){return Math.round(this.minX+(this.maxX-this.minX)/2); };
    this.centerY=function(){return Math.round(this.minY+(this.maxY-this.minY)/2); };
    this.displayPositionX=function(){return Math.round((this.minX+(this.maxX-this.minX)/2)); };
    this.displayPositionY=function(){return Math.round((this.minY+(this.maxY-this.minY)/2)); };
}

function ComponentGroup()
{
    this.selectedComponentIndex=-1;
    this.components=[];
    this.active=false;
    this.grouploaded=false;
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


