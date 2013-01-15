/**
 * segmentationtool.js
 *
 * requirements:
 *   tools.js
 *
 */
var allslices = new Object(), slices_grouping = new Object();
function SegmentationTool()
{
    var self = this;
    this.stack = null;
    this.toolname = "segmentationtool";

    // assembly information
    this.current_active_assembly = null;

    // the canvas layer using fabric.js
    var canvasLayer = null;

    // base url for slices, filename ending
    var slice_base_url = 'http://localhost/slices/',
        slice_filename_extension = '.png';

    // slices container

    // slices information
    var current_active_slice = null;

    // cytoscape graph object
    var cy;
    
    if (!ui) ui = new UI();

    this.on_assembly_id_change = function( assembly_id ) {
        console.log('on assembly change. new assembly id: ', assembly_id);
        if (isNaN(assembly_id)) {
            alert('Selected assemblyID is not a number.');
            self.current_active_assembly = null;
            return;
        }
        // only update if assembly id has changed
        if ( assembly_id !== self.current_active_assembly) {
            self.current_active_assembly = assembly_id;
            // TODO: save current, remove all related data, init or a new
        }
    };

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

        // remove the view element from the DOM
        canvasLayer.unregister();

        self.stack.removeLayer( "CanvasLayer" );

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
        console.log('SegmentationTool register');
        self.stack = parentStack;
        if (canvasLayer && self.stack) {
            if (self.stack !== parentStack) {
                self.stack.removeLayer( canvasLayer );
                self.createCanvasLayer( parentStack );
            }
        } else {
            self.createCanvasLayer( parentStack );
        }
        self.createToolbar();
        // TODO: assume graph widget open
        $("#cyto").cytoscape({ zoom: 1});
        cy = $("#cyto").cytoscape("get");
    }

    /*
    ** Create the segmentation toolbar
    */
    this.createToolbar = function ()
    {
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
        canvasLayer = new CanvasLayer( self.stack );
        canvasLayer.canvas.interactive = false;
        canvasLayer.canvas.selection = false;

        canvasLayer.canvas.on({
          'object:selected': function(e) {
            // console.log('object selected',e);
            // TODO:
            // fetch segments for selected slice
            // e.target.slice.fetch_segments();
            // - global variable of active slice: setActiveSlice
            // - change slice appareance with a filter
            activate_slice( e.target.slice.node_id );
            
            e.e.stopPropagation();
            e.e.preventDefault();
            return false;
          },
          /*'object:moving': function(e) {
            console.log('object moving', e);
            e.target.opacity = 0.5;
          },
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

        // register mouse events
        canvasLayer.view.onmousedown = function( e ) {
            if (self.ensureFocused()) {
                console.log('ensure focused');
                e.stopPropagation();
                return;
            }
            switch ( ui.getMouseButton( e ) )
            {
                case 1:
                    self.clickXY( e );
                    break;
                case 2:
                    onmousedown(e);
                    /*ui.registerEvent( "onmousemove", updateStatusBar );
                    ui.registerEvent( "onmouseup",
                    function onmouseup (e) {
                      ui.releaseEvents();
                      ui.removeEvent( "onmousemove", updateStatusBar );
                      ui.removeEvent( "onmouseup", onmouseup );
                      // Recreate nodes by feching them from the database for the new field of view
                      tracingLayer.svgOverlay.updateNodes();
                    });
                    */
                    break;
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        };
        canvasLayer.view.onmousewheel = onmousewheel; // function(e){self.mousewheel(e);};
    }

    var onmousewheel = function( e )
    {
        console.log('onmousewheel', e);
    }

    var onmousemove = function( e )
    {
        console.log('onmousemove');
        self.lastX = self.stack.x + ui.diffX; // TODO - or + ?
        self.lastY = self.stack.y + ui.diffY;
        self.stack.moveToPixel(
            self.stack.z,
            self.stack.y - ui.diffY / self.stack.scale,
            self.stack.x - ui.diffX / self.stack.scale,
            self.stack.s );
        // loop over all visible slices and update their left,top coordinates
        for( var node_id in slices_grouping ) {
            if( slices_grouping.hasOwnProperty( node_id ) ) {
                allslices[ node_id ].center_on_canvas();
            }
        }

        return true;
    };

    var onmouseup = function( e )
    {
        console.log('onmouseup');
        ui.releaseEvents();
        ui.removeEvent( "onmousemove", onmousemove );
        ui.removeEvent( "onmouseup", onmouseup );
        return false;
    };

    var onmousedown = function( e )
    {
        console.log('onmousedown');
        ui.registerEvent( "onmousemove", onmousemove );
        ui.registerEvent( "onmouseup", onmouseup );
        ui.catchEvents( "move" );
        ui.onmousedown( e );

        ui.catchFocus();

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
        if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
        changeSliceDelayedParam = { z : val };
        changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
    }
    
    this.changeSlice = function( val )
    {
        self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
        return;
    }
    
    this.move_up = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move(-(e.shiftKey ? 10 : 1));
        // TODO: readd existing slices
    };
    
    this.move_down = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move((e.shiftKey ? 10 : 1));
        // TODO: readd existing slices
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
            self.next_slice();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Previous slice",
        keyShortcuts: {
            'M': [ 77 ]
        },
        run: function (e) {
            self.previous_slice();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Delete slice group",
        keyShortcuts: {
            'B': [ 66 ]
        },
        run: function (e) {
            self.delete_active_slice_group();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Fetch segments for active slice",
        keyShortcuts: {
            'J': [ 74 ]
        },
        run: function (e) {
            self.fetch_segments_for_active_slice();
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

    var generate_path_for_slice = function( sectionindex, slice_id )
    {
        var result = '';
        result += sectionindex + '';
        var sliceid_string = slice_id + '';
        for ( var i = 0; i < sliceid_string.length-1; i++ )
        {
            result += '/' + sliceid_string.charAt(i);
        }
        result += '/' + sliceid_string.charAt(sliceid_string.length-1);
        return result;
    }

    this.fetch_segments_for_active_slice = function() {
        console.log('fetch segments for active slice')
        allslices[ current_active_slice ].fetch_segments();
    };

    this.delete_active_slice_group = function() {
        // but leave the loaded in memory
        remove_slice_from_canvas( current_active_slice );
        delete slices_grouping[ current_active_slice ];
        activate_slice( null );
    };

    this.previous_slice = function() {
        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if( slices_grouping[ current_active_slice ].slicelist.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;
        index--;

        if( index < 0 ) {
            index = slices_grouping[ current_active_slice ].slicelist.length-1;
        };
        var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ];
        slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
        delete slices_grouping[ current_active_slice ];
        remove_slice_from_canvas( current_active_slice );

        current_active_slice = new_active_slice;
        slices_grouping[ current_active_slice ].sliceindex = index;
        add_slice_to_canvas( new_active_slice );
    };

    this.next_slice = function() {

        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if( slices_grouping[ current_active_slice ].slicelist.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;
        index++;

        if( index > slices_grouping[ current_active_slice ].slicelist.length-1 ) {
            index = 0;
        };
        var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ];
        slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
        delete slices_grouping[ current_active_slice ];
        remove_slice_from_canvas( current_active_slice );

        current_active_slice = new_active_slice;
        slices_grouping[ current_active_slice ].sliceindex = index;
        add_slice_to_canvas( new_active_slice );
    }

    var get_current_stack_id = function() {
        return self.stack.id;
    }

    this.clickXY = function( e ) {

        // TODO: enable again
        // require a number as assembly id
        /*if (!self.current_active_assembly || !parseInt(self.current_active_assembly, 10) > 0) {
            alert('Please select an assembly!');
            return;
        }*/
        var fieldOfView = canvasLayer.getFieldOfViewParameters(),
            x = e.offsetX,
            y = e.offsetY;

        var url = django_url + project.id + "/stack/" + self.stack.id + '/slices-at-location'+ "?" + $.param({
            x: getStackXFromCanvasX(x),
            y: getStackYFromCanvasY(y),
            scale : 0.5, // defined as 1/2**zoomlevel
            z : self.stack.z});

        $.getJSON(url, function(result){
            // console.log('found slices', result);
            var prototype_slice = null;
            for (var sidx in result) {

                var slice = new Slice( result[sidx] );
                if( sidx == 0 ) {
                    prototype_slice = slice.node_id;
                    current_active_slice = slice.node_id;
                    slices_grouping[ prototype_slice ] = {};
                    slices_grouping[ prototype_slice ]['slicelist'] = [];
                    slices_grouping[ prototype_slice ]['sliceindex'] = 0;
                    slices_grouping[ prototype_slice ]['slicelist'].push ( prototype_slice );
                } else {
                    slices_grouping[ prototype_slice ]['slicelist'].push ( slice.node_id );
                }
                
                //console.log('slice', slice);
                if( ! allslices.hasOwnProperty( slice.node_id ) ) {
                    allslices[ slice.node_id ] = slice;
                } else {
                    console.log('slice already in allslices. do not add', slice);
                }

                slice.fetch_image();
            }
        });

        return;
    }

    var activate_slice = function( node_id ) {
        current_active_slice = node_id;
    };

    var add_slice_to_canvas = function( node_id ) {
        allslices[ node_id ].img.setActive( true );
        allslices[ node_id ].center_on_canvas();
        canvasLayer.canvas.add( allslices[ node_id ].img );
    };

    var update_graph_widget_for_slice = function( node_id ) {
        console.log('update graph widget for slice');
        
        var demoNodes = [];
        var demoEdges = [];

        for(var idx in allslices[ node_id ].segments) {
            var seg = allslices[ node_id ].segments[idx];
            if( seg.segmenttype == 2 ) {
                console.log('add continuation')
                    demoNodes.push({
                    data: {
                        id: "n" + seg.target1_section + "_" + seg.target1_slice_id,
                        position: { x: 100+idx*60, y: 100+idx*60 }
                    },
                });
            }
        }
        console.log(demoNodes);

        cy.style()
            .selector("node")
                .css({
                    "content": "data(id)",
                    "shape": "data(shape)",
                    "border-width": 3,
                    "background-color": "#DDD",
                    "border-color": "#555"
                });

        cy.add({
            nodes: demoNodes,
            //edges: demoEdges
        });
        //cy.add({ group: "nodes", data: { id: "n0" } });
    }

    var remove_slice_from_canvas = function( node_id ) {
        canvasLayer.canvas.remove( allslices[ node_id ].img );
    };

    var getCanvasXFromStackX = function( stackX )
    {
        return stackX - canvasLayer.getFieldOfViewParameters().x;
    };

    var getCanvasYFromStackY = function( stackY )
    {
        return stackY - canvasLayer.getFieldOfViewParameters().y;
    };

    var getStackYFromCanvasY = function( canvasY )
    {
        return canvasLayer.getFieldOfViewParameters().y + canvasY;
    };

    var getStackXFromCanvasX = function( canvasX )
    {
        return canvasLayer.getFieldOfViewParameters().x + canvasX;
    };

    function Segment()
    {
        this.id = null;
    }

    function Slice( slice )
    {
        var self = this;
        // this.id = null;
        this.assembly_id = slice.assembly_id;
        this.sectionindex = slice.sectionindex;
        this.slice_id = slice.slice_id; // int id local to the section
        this.node_id = slice.node_id; // convention: {sectionindex}_{slide_id}
   
        this.min_x = slice.min_x;
        this.min_y = slice.min_y;
        this.max_x = slice.max_x;
        this.max_y = slice.max_y;
        // slice center
        this.center_x = slice.center_x;
        this.center_y = slice.center_y;
        // bb center
        var bb_center_x = Math.round(self.min_x+(self.max_x-self.min_x)/2);
        var bb_center_y = Math.round(self.min_y+(self.max_y-self.min_y)/2);

        this.threshold = slice.threshold;
        this.size = slice.threshold;
        this.status = slice.status;

        this.img = null;

        // TODO: do i need a reference to the currently selected?
        this.segments = new Object();

        this.segments_left = new Object();
        this.selected_segment_left = null;

        this.segments_right = new Object();
        this.selected_segment_right = null;

/*
        this.visible = false;

        this.show = function() {
            this.img.visible = true;
            this.visible = true;
        };

        this.hide = function() {
            this.img.visible = false;
            this.visible = false;
        };
*/

        this.center_on_canvas = function() {
            console.log('center on canvas. sliceid', self.node_id)
            
            console.log('bounding box computed centers', bb_center_x, bb_center_y )
            console.log('center of slice', self.center_x, self.center_y )
            console.log('get canvas coordinates relative', getCanvasXFromStackX(bb_center_x), getCanvasYFromStackY(bb_center_y) )
            console.log('minx/y', self.min_x, self.min_y)
            self.img.set({
                left: getCanvasXFromStackX(bb_center_x),
                top: getCanvasYFromStackY(bb_center_y)
            });
        };

        this.fetch_image = function() {            
            fabric.Image.fromURL(self.get_slice_image_url(), function(img)
            {
                // TODO: ask if this is the way to keep store the reference
                // in the callback
                self.img = img;
                /*self.img.set({
                    left: getCanvasXFromStackX(bb_center_x),
                    top: getCanvasYFromStackY(bb_center_y),
                    angle: 0,
                    clipTo: self.img }).scale(1);
*/
                self.img.perPixelTargetFind = true;
                self.img.targetFindTolerance = 4;
                self.img.hasControls = false;
                self.img.hasBorders = false;
                self.img.lockMovementX = self.img.lockMovementY = true;
                // store a reference from the img to the slice
                self.img.slice = self;
                if( current_active_slice === self.node_id ) {
                    add_slice_to_canvas( self.node_id );
                }
            });
        };

        /*
        ** Fetch connected segments of this slices
        ** and initialize segments_{left|right} object
        */
        this.fetch_segments = function () {
            var url = django_url + project.id + "/stack/" + get_current_stack_id() + '/segments-at-location'+ "?" + $.param({
                sliceid: self.slice_id,
                sectionindex: self.sectionindex
            });

            $.getJSON(url, function(result) {
                console.log('found segments', result);
                self.segments = result;
                update_graph_widget_for_slice( self.node_id )
            });
        };

        /*
        ** Generate the absolute URL to the slice image
        ** using the sectionindex and slice id convention
        */
        this.get_slice_image_url = function() {
            return slice_base_url + 
                generate_path_for_slice( this.sectionindex, this.slice_id ) +
                slice_filename_extension;
        };

        this.width = function() {
            return this.max_x - this.min_x; };

        this.height = function() {
            return this.max_y - this.min_y; };

        this.centerX = function() {
            return Math.round(this.min_x + (this.max_x - this.min_x) / 2); };

        this.centerY = function() {
            return Math.round(this.min_y + (this.max_y - this.min_y) / 2); };

    }

}