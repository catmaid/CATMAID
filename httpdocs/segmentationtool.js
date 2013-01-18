/**
 * segmentationtool.js
 *
 * requirements:
 *   tools.js
 *
 */
var allslices = new Object(), slices_grouping = new Object();

    // all selected slices per section
    var allvisible_slices = new Object();
    var current_active_slice = null;

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


    // cytoscape graph object
    var cy;

    var current_section = 0;
    
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
        // $("#cyto").cytoscape({ zoom: 1});
        // cy = $("#cyto").cytoscape("get");
        // TODO: this needs to be called after fetching for an
        // assembly id from the database
        for(var i = 0; i < self.stack.slices.length; i++) {
            allvisible_slices[ self.stack.slices[i] ] = new Object();
        };
    }

    /*
    ** Create the segmentation toolbar
    */
    this.createToolbar = function ()
    {
        console.log('create toolbar')
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
            //console.log('object selected',e);
            // TODO:
            // - global variable of active slice: setActiveSlice
            // - change slice appareance with a filter
            activate_slice( e.target.slice.node_id );
            update();
            e.e.stopPropagation();
            e.e.preventDefault();
            return false;
          },
          'mouse:move': function(e) {
            //console.log('mouse move on canvas', e);
          }
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
        update();
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
    
    this.move_up = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move(-(e.shiftKey ? 10 : 1));
        update();
    };
    
    this.move_down = function( e ) {
        canvasLayer.canvas.clear();
        self.slider_z.move((e.shiftKey ? 10 : 1));
        update();
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
            self.delete_active_slice();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Retrieve slice(s) from segments of the current active slice",
        keyShortcuts: {
            'H': [ 72 ]
        },
        run: function (e) {
            self.fetch_slices_from_segments_for_active_slice();
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

    // ----------------------------------------------------------------

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


    // clears the canvas and adds selected slices in the section
    // and eventually activates the current active slice
    var update = function() {
        canvasLayer.canvas.clear();
        for (var node_id in allvisible_slices[current_section]) {
            if( allslices[ node_id ].img.filters.length > 0) {
                allslices[ node_id ].img.filters = new Array();
                allslices[ node_id ].img.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));
            }
            allslices[ node_id ].center_on_canvas();
            canvasLayer.canvas.add( allslices[ node_id ].img );
        }
        if( current_active_slice ) {
            allslices[ current_active_slice ].img.filters[0] = new fabric.Image.filters.Sepia2();
            allslices[ current_active_slice ].img.applyFilters(canvasLayer.canvas.renderAll.bind(canvasLayer.canvas));
        }
    }


    this.fetch_slices_from_segments_for_active_slice = function() {
        // console.log('fetch slices');
        if( current_active_slice ) {
            
            // TODO: continue. get-slice-set from the segments list, and add it to the grouping
            
            // console.log('current section', self.stack.z, allslices[ current_active_slice ].sectionindex )
            if( current_section - allslices[ current_active_slice ].sectionindex > 0 ) {
                // go down (higher section index) into the stack, i.e. 
                // SOPNET's right direction, i.e. true
                var current_segment = allslices[ current_active_slice ].get_current_right_segment();
                // console.log('current active', current_active_slice, allslices[ current_active_slice ]);
                // console.log('current segment', current_segment);
                if( current_segment.segmenttype == 1 ) {
                    // end segment
                    console.log('end segment');

                } else if( current_segment.segmenttype == 2 ) {
                    console.log('continuation');
                    // fetch target1 slice
                    var url = django_url + project.id + "/stack/" + self.stack.id + '/slice'+ "?" + $.param({
                        sectionindex: current_segment.target1_section,
                        sliceid: current_segment.target1_slice_id
                    });
                    $.getJSON(url, function(result){
                        self.add_slices_group( result, true, true );
                    });
                } else if( current_segment.segmenttype == 3 ) {
                    console.log('branch');
                }
            } else if( self.stack.z - allslices[ current_active_slice ].sectionindex < 0 ) {
                // go up, i.e. left
                var current_segment = allslices[ current_active_slice ].get_current_left_segment();

            }  {
                console.log('current active slice in current section');
            }
        }
    }

    this.delete_active_slice = function() {
        //console.log('delete active slice', current_active_slice)
        // but leave the loaded in memory
        if( current_active_slice ) {
            self.remove_slice( current_active_slice );
            activate_slice( null );
        }
        update();
    };

    this.previous_slice = function() {
        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if( slices_grouping[ current_active_slice ].sliceset.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }
        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;
        index--;
        var count = 0;
        for (k in slices_grouping[ current_active_slice ].sliceset) {
          if (slices_grouping[ current_active_slice ].sliceset.hasOwnProperty(k)) count++;  
        } 
        if( index < 0 ) {
            index = 0;
            return;
        };
        make_invisible( current_active_slice );
        for(var idx in slices_grouping[ current_active_slice ].sliceset[ index ]) {
            var new_active_slice = slices_grouping[ current_active_slice ].sliceset[ index ][idx];
            slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
            delete slices_grouping[ current_active_slice ];
            current_active_slice = new_active_slice;
            slices_grouping[ current_active_slice ].sliceindex = index;
        }
        make_visible( new_active_slice );
        activate_slice( new_active_slice );
        update();
    };

    this.next_slice = function() {

        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if( slices_grouping[ current_active_slice ].sliceset.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;
        index++;
        
        var count = 0;
        for (k in slices_grouping[ current_active_slice ].sliceset) {
          if (slices_grouping[ current_active_slice ].sliceset.hasOwnProperty(k)) count++;  
        } 
        if( index > count-1 ) {
            index = count;
            return;
        };
        make_invisible( current_active_slice );
        for(var idx in slices_grouping[ current_active_slice ].sliceset[ index ]) {
            var new_active_slice = slices_grouping[ current_active_slice ].sliceset[ index ];
            slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
            delete slices_grouping[ current_active_slice ];
            current_active_slice = new_active_slice;
            slices_grouping[ current_active_slice ].sliceindex = index;
        }
        make_visible( new_active_slice );
        activate_slice( new_active_slice );
        update();
    }

    var get_current_stack = function() {
        return self.stack;
    }

    this.add_slice = function( slice, is_visible, trigger_update ) {

        var slice = new Slice( slice );

        if( ! allslices.hasOwnProperty( slice.node_id ) ) {
            allslices[ slice.node_id ] = slice;
        } else {
            console.log('Slice already in allslices. do not add', slice);
        };

        if( is_visible ) {
            if( ! allvisible_slices[ current_section ].hasOwnProperty( slice.node_id ) ) {
                allvisible_slices[ current_section ][ slice.node_id ] = null;
            } else {
                console.log('Slice already in allvisible_slices. do not add', slice);
            };            
        }

        slice.fetch_image( trigger_update )

        slice.fetch_segments();
    }

    var make_visible = function( node_id ) {
        if( allslices.hasOwnProperty( node_id ) ) {
            if( ! allvisible_slices[ current_section ].hasOwnProperty( node_id ) ) {
                allvisible_slices[ current_section ][ node_id ] = null;
            } else {
                console.log('Slice already in allvisible_slices. do not add', slice);
            };            
        }
    }

    var make_invisible = function( node_id ) {
        if( allslices.hasOwnProperty( node_id ) ) {
            delete allvisible_slices[ current_section ][ node_id ];
        }
    }


    this.remove_slice = function( node_id ) {

        // remove from allslices
        if( allslices.hasOwnProperty( node_id ) ) {
            delete allslices[ node_id ];
        } 

        // remove from allvisible_slices if existing
        for( var idx in allvisible_slices ) {
            if( allvisible_slices[ idx ].hasOwnProperty( node_id ) ) {
                delete allvisible_slices[ idx ][ node_id ];
            }             
        }

        if( slices_grouping.hasOwnProperty( node_id ) ) {
            delete slices_grouping[ node_id ];
        }
    }

    this.add_slices_group = function( result ) {
        var prototype_slice = null;
        for (var sidx in result) {
            if( sidx == 0 ) {
                self.add_slice( result[sidx], true, true );
                activate_slice( result[sidx].node_id );
                prototype_slice = result[sidx].node_id;
                slices_grouping[ prototype_slice ] = {};
                slices_grouping[ prototype_slice ]['sliceset'] = new Object();
                slices_grouping[ prototype_slice ]['sliceindex'] = 0;
                slices_grouping[ prototype_slice ]['sliceset'][0] = [ prototype_slice ];
            } else {
                self.add_slice( result[sidx], false, false );
                slices_grouping[ prototype_slice ]['sliceset'][sidx] = [ result[sidx].node_id ];
            }
        }
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
            console.log('clickXY: found slices', result);
            self.add_slices_group( result );
        });

        return;
    }

    var activate_slice = function( node_id ) {
        // console.log('activate slice', node_id);
        current_active_slice = node_id;
        // TODO: do i need to add it to slice groupings?
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

        this.segments_left = new Array();
        this.selected_segment_left = null;

        this.segments_right = new Array();
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
            //console.log('center on canvas. sliceid', self.node_id)
            /*console.log('bounding box computed centers', bb_center_x, bb_center_y )
            console.log('center of slice', self.center_x, self.center_y )
            console.log('get canvas coordinates relative', getCanvasXFromStackX(bb_center_x), getCanvasYFromStackY(bb_center_y) )
            console.log('minx/y', self.min_x, self.min_y)
            */
            self.img.set({
                left: getCanvasXFromStackX(bb_center_x),
                top: getCanvasYFromStackY(bb_center_y)
            });
        };

        this.fetch_image = function( trigger_update ) {
            // console.log('fetch image', trigger_update)
            fabric.Image.fromURL(self.get_slice_image_url(), function(img)
            {
                self.img = img;
                // TODO: does not work
                //self.img.perPixelTargetFind = true;
                //self.img.targetFindTolerance = 4;
                self.img.hasControls = false;
                self.img.hasBorders = false;
                self.img.set('selectable', true)
                self.img.lockMovementX = self.img.lockMovementY = true;
                // store a reference from the img to the slice
                self.img.slice = self;
  
                if( trigger_update ) {
                    //console.log('trigger update for slice', self.node_id);
                    update();
                }
            });
        };

        /*
        ** Fetch connected segments of this slices
        ** and initialize segments_{left|right} object
        */
        this.fetch_segments = function () {

            // do not fetch segments if already fetched
            if(self.segments_right.length > 0 || self.segments_left.length > 0) {
                console.log('already existing segments');
                return;
            }

            var url = django_url + project.id + "/stack/" + get_current_stack().id + '/segments-at-location'+ "?" + $.param({
                sliceid: self.slice_id,
                sectionindex: self.sectionindex
            });
            $.getJSON(url, function(result) {
                // console.log('found segments', result);
                for(var idx in result) {
                    if( !result[idx].direction ) {
                        self.segments_left.push( result[idx] );
                        if( !self.selected_segment_left ) {
                            self.selected_segment_left = 0;
                        }
                    } else {
                        self.segments_right.push( result[idx] );
                        if( !self.selected_segment_right ) {
                            self.selected_segment_right = 0;
                        }
                    }
                }
                // console.log('segments right', self.segments_right);
                // console.log('segments left', self.segments_left);
                // self.segments = result;
                // update_graph_widget_for_slice( self.node_id );
            });
        };

        this.next_left_segment = function() {
            // TODO
        }

        this.get_current_right_segment = function() {
            return self.segments_right[ self.selected_segment_right ]
        }

        this.get_current_left_segment = function() {
            return self.segments_left[ self.selected_segment_left ]
        }

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