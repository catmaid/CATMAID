/**
 * segmentationtool.js
 *
 * requirements:
 *   tools.js
 *
 */

function SegmentationTool()
{
    var self = this;
    this.stack = null;
    this.toolname = "segmentationtool";

    var canvasLayer = null;
    
    if (!ui) ui = new UI();

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {

    }

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
        self.unregister();

        self.destroyToolbar();

        // $('#cytograph').remove();

        // remove the view element from the DOM
        // canvasLayer.unregister();

        self.stack.removeLayer( "CanvasLayer" );

        canvasLayer = null;

        self.stack = null;
    }

    /*
    ** Destroy the tool bar elements
    */
    this.destroyToolbar = function ()
    {
        // disable button and toolbar
        document.getElementById( "edit_button_segmentation" ).className = "button";
        document.getElementById( "toolbar_segmentation" ).style.display = "none";

        self.slider_z.update(
            0,
            1,
            undefined,
            0,
            null );
    }

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {
        console.log('SegmentationTool register', parentStack);
        self.stack = parentStack;
        self.createCanvasLayer();
        self.createToolbar();

        // add a dummy div to hold the graph
        /*var graph = document.createElement("div");
        graph.id = "cytograph";
        graph.style.width = "0px";
        graph.style.height = "0px";
        graph.style.display = "none";
        self.stack.getView().appendChild( graph );*/

        SegmentationAnnotations.set_stack_and_layer( parentStack, canvasLayer.canvas );

        SegmentationAnnotations.init_graph( );

    }

    /*
    ** Create the segmentation toolbar
    */
    this.createToolbar = function ()
    {
        //console.log('create toolbar')
        // enable button and toolbar
        document.getElementById( "edit_button_segmentation" ).className = "button_active";
        document.getElementById( "toolbar_segmentation" ).style.display = "block";

        self.slider_z = new Slider(
            SLIDER_HORIZONTAL,
            true,
            0,
            self.stack.slices,
            self.stack.slices,
            self.stack.z,
            self.changeSliceDelayed );

        var sliders_box = document.getElementById( "sliders_box_segmentation" );
        
        /* remove all existing dimension sliders */
        while ( sliders_box.firstChild )
            sliders_box.removeChild( sliders_box.firstChild );
            
        var slider_z_box = document.createElement( "div" );
        slider_z_box.className = "box";
        slider_z_box.id = "slider_z_box";
        var slider_z_box_label = document.createElement( "p" );
        slider_z_box_label.appendChild( document.createTextNode( "z-index" + "   " ) );
        slider_z_box.appendChild( slider_z_box_label );
        slider_z_box.appendChild( self.slider_z.getView() );
        slider_z_box.appendChild( self.slider_z.getInputView() );
        sliders_box.appendChild( slider_z_box );
    }

    /*
    ** Create the canvas layer using fabric.js
    */
    this.createCanvasLayer = function ()
    {
        canvasLayer = new CanvasLayer( self.stack, self );

        canvasLayer.canvas.on({
          'mouse:down': function(e) {
            var target = canvasLayer.canvas.findTarget( e.e );
            if( target ) {
                SegmentationAnnotations.activate_slice( target.slice )
                self.redraw();
                // not propagate to view
                e.e.stopPropagation();
                e.e.preventDefault();
                return false;
            } else {
                self.clickXY( e.e );
            }
            return true;
          },
          'mouse:move': function(e) {
            //console.log('mouse move', e);
            //e.target.opacity = 0.5;
          },/*
          'object:modified': function(e) {
            console.log('object modified');
            e.target.opacity = 1;
          },
          'object:added': function(e) {
            console.log('object added', e);
          },*/
          
        });

        // add the layer to the stack, and implicitly
        // add the view element to the DOM
        self.stack.addLayer( "CanvasLayer", canvasLayer );

        self.stack.resize();


        /*canvasLayer.canvas.findTarget = (function(originalFn) {
          return function() {
            // console.log('in find targets', this, arguments, arguments[0].offsetY, arguments[0].clientY)
            var target = originalFn.apply(this, arguments);
            return target;
          };
        })(canvasLayer.canvas.findTarget);*/


        // register mouse events
        canvasLayer.view.onmousedown = function( e ) {
/*              if (self.ensureFocused()) {
                e.stopPropagation();
                return;
              }*/
            
                switch ( ui.getMouseButton( e ) )
                {
                    case 2:
                        onmousedown(e);
                        break;
                }
            
            /*
            console.log('canvas view onmouse down')
            if (self.ensureFocused()) {
                console.log('ensure focused');
                e.stopPropagation();
                return;
            }
            switch ( ui.getMouseButton( e ) )
            {
                case 1:
                    if( e.ctrlKey ) {
                        self.clickXY( e );
                    }
                    break;
                case 2:
                    onmousedown(e);
                    break;
            }
            e.preventDefault();
            e.stopPropagation();
            return;*/
        };
        // canvasLayer.view.onmousewheel = onmousewheel; // function(e){self.mousewheel(e);};
        
    }

    var onmousewheel = function( e )
    {
        //console.log('onmousewheel', e);
    }

    var onmousemove = function( e )
    {
        self.lastX = self.stack.x + ui.diffX; // TODO - or + ?
        self.lastY = self.stack.y + ui.diffY;
        self.stack.moveToPixel(
            self.stack.z,
            self.stack.y - ui.diffY / self.stack.scale,
            self.stack.x - ui.diffX / self.stack.scale,
            self.stack.s );
        self.redraw();
        return true;
    };

    var onmouseup = function( e )
    {
        //console.log('onmouseup');
        ui.releaseEvents();
        ui.removeEvent( "onmousemove", onmousemove );
        ui.removeEvent( "onmouseup", onmouseup );
        return false;
    };

    var onmousedown = function( e )
    {
        //console.log('onmousedown');
        ui.registerEvent( "onmousemove", onmousemove );
        ui.registerEvent( "onmouseup", onmouseup );
        ui.catchEvents( "move" );
        ui.onmousedown( e );

        //ui.catchFocus();

        return false;
    };

    /** This returns true if focus had to be switched; typically if
        the focus had to be switched, you should return from any event
        handling, otherwise all kinds of surprising bugs happen...  */
    this.ensureFocused = function() {
        
      var window = self.stack.getWindow();
      if (window.hasFocus()) {
        return false;
      } else {
        window.focus();
        return true;
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
    }
    
    this.changeSliceDelayed = function( val )
    {
        current_section = val;
        if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
        changeSliceDelayedParam = { z : val };
        changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
    }
    
    this.changeSlice = function( val )
    {
        self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
        return;
    }

    var updateControls = function()
    {
        // var z = SegmentationAnnotations.get_current_section();
        self.slider_z.setByValue( self.stack.z, true );
        return;
    }
    
    this.move_up = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move(-(e.shiftKey ? 10 : 1));
        self.redraw();
    };
    
    this.move_down = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move((e.shiftKey ? 10 : 1));
        self.redraw();
    };

    var actions = [];

    this.addAction = function ( action ) {
        actions.push( action );
    };

    this.getActions = function () {
        return actions;
    };

    this.addAction( new Action({
        helpText: "Move up 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            ',': [ 44, 188 ]
        },
        run: function (e) {
            self.move_up( e );
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move down 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            '.': [ 46, 190 ]
        },
        run: function (e) {
            self.move_down( e );
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Next slice",
        keyShortcuts: {
            'N': [ 78 ]
        },
        run: function (e) {
            SegmentationAnnotations.next_slice();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Previous slice",
        keyShortcuts: {
            'M': [ 77 ]
        },
        run: function (e) {
            SegmentationAnnotations.previous_slice();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Visualize assembly",
        keyShortcuts: {
            'U': [ 85 ]
        },
        run: function (e) {
            SegmentationAnnotations.visualize_assembly();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Reset propagation counter",
        keyShortcuts: {
            'R': [ 82 ]
        },
        run: function (e) {
            SegmentationAnnotations.set_propagation_counter( 20 );
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Toggle propagation",
        keyShortcuts: {
            'T': [ 84 ]
        },
        run: function (e) {
            SegmentationAnnotations.toggle_automatic_propagation();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Delete slice group",
        keyShortcuts: {
            'B': [ 66 ]
        },
        run: function (e) {
            SegmentationAnnotations.delete_active_slice();
            return true;
        }
    }) );


    this.addAction( new Action({
        helpText: "Fetch slices group for selected segments to the right",
        keyShortcuts: {
            'Y': [ 89 ]
        },
        run: function (e) {
            SegmentationAnnotations.fetch_slicegroup_from_selected_segment_current_slice_right();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Fetch slices for segments right",
        keyShortcuts: {
            'H': [ 72 ]
        },
        run: function (e) {
            SegmentationAnnotations.fetch_segments_right();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Goto active",
        keyShortcuts: {
            'A': [ 65 ]
        },
        run: function (e) {
            SegmentationAnnotations.goto_slice( 
                SegmentationAnnotations.get_current_active_slice().node_id, true );
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Save assembly",
        keyShortcuts: {
            'S': [ 83 ]
        },
        run: function (e) {
            SegmentationAnnotations.save_assembly();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Fetch slices for segments left",
        keyShortcuts: {
            'G': [ 71 ]
        },
        run: function (e) {
            SegmentationAnnotations.fetch_segments_left();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Show segments",
        keyShortcuts: {
            'J': [ 74 ]
        },
        run: function (e) {
            SegmentationAnnotations.create_segments_table_for_current_active();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Toggle slices centers",
        keyShortcuts: {
            'P': [ 80 ]
        },
        run: function (e) {
            SegmentationAnnotations.show_slices_cogs();
            return true;
        }
    }) );

    var keyCodeToAction = getKeyCodeToActionMap(actions);

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */
    this.handleKeyPress = function( e )
    {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
          return keyAction.run(e);
        } else {
          return false;
        }
    }

    this.clickXY = function( e ) {
        var wc = self.stack.getFieldOfViewInPixel();
        requestQueue.register(django_url + project.id + "/stack/" + self.stack.id + '/slices-at-location', "GET", {
            x: wc.worldLeftC + e.offsetX,
            y: wc.worldTopC + e.offsetY,
            scale : 0.5, // defined as 1/2**zoomlevel
            z : self.stack.z}, function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            // loop through slices and check whether one has an assembly id set
                            for(var idx in e) {
                                if(e.hasOwnProperty( idx )) {
                                    console.log(e[idx]);
                                    if( e[idx].assembly_id ) {
                                        console.log('found assembly id of one slcie', e[idx].assembly_id  )
                                        SegmentationAnnotations.load_assembly( e[idx].assembly_id )
                                        return;
                                    }
                                }
                            }

                            if( SegmentationAnnotations.has_current_assembly() ) {
                                console.log('already have current assembly set')
                                SegmentationAnnotations.add_slices_group( e );

                            } else {
                                console.log('need to create new assembly')

                                // no assembly found, create one
                                requestQueue.register(django_url + project.id + '/assembly/create-assembly-and-neuron', "GET", {},
                                                function (status, text, xml) {
                                                    if (status === 200) {
                                                        if (text && text !== " ") {
                                                            var eb = $.parseJSON(text);
                                                            if (eb.error) {
                                                                alert(eb.error);
                                                            } else {
                                                                $('#growl-alert').growlAlert({
                                                                    autoShow: true,
                                                                    content: "Created a new assembly and neuron" + eb.assembly_id,
                                                                    title: 'Warning',
                                                                    position: 'top-right',
                                                                    delayTime: 2000,
                                                                    onComplete: function() {  }
                                                                });
                                                                SegmentationAnnotations.set_current_assembly_id( eb.assembly_id );
                                                                SegmentationAnnotations.add_slices_group( e );
                                                            }
                                                        }
                                                    }
                                            });

                            }


                        }
                    }
                }
        });

        return;
    }

    var add_slice_to_canvas = function( node_id ) {
        var slice = SegmentationAnnotations.get_slice( node_id );
        // console.log('add slice', node_id, slice.bb_center_x)
        slice.img.setActive( true );
        slice.img.set({
                left: slice.bb_center_x - self.stack.getFieldOfViewInPixel().worldLeftC,
                top: slice.bb_center_y - self.stack.getFieldOfViewInPixel().worldTopC - 1,
            });
        canvasLayer.canvas.add( slice.img );
    };

    var remove_slice_from_canvas = function( node_id ) {
        var slice = SegmentationAnnotations.get_slice( node_id );
        canvasLayer.canvas.remove( slice.img );
    };

    this.redraw = function() {
        updateControls();
        canvasLayer.canvas.clear();

        var allvisible = SegmentationAnnotations.get_visible_slices( self.stack.z ),
            current_active_slice = SegmentationAnnotations.get_current_active_slice();

        for (var node_id in allvisible) {
            if( allvisible.hasOwnProperty( node_id ) ) {
                    var slice = SegmentationAnnotations.get_slice( node_id );
                    if( current_active_slice && node_id === current_active_slice.node_id) {
                        current_active_slice.img.filters[0] = new fabric.Image.filters.Sepia2();
                        current_active_slice.img.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));                            
                    } else {
                        if( slice.img.filters.length > 0) {
                            slice.img.filters = new Array();
                            slice.img.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));
                        }
                    }
                    add_slice_to_canvas( node_id );
            }
        }
    }

}

