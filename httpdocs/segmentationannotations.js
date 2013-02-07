var SegmentationAnnotations = new function()
{
    var self = this;
    
    self.stack = null;

    // assembly information
    self.current_active_assembly = null;

    var current_active_slice;

    // the canvas layer using fabric.js
    
    var automatic_propagation = false, propagation_counter = 20;
    // more criteria, e.g. min_overlap_ratio_threshold=0.8

    // base url for slices, filename ending
    var slice_base_url = 'http://localhost/slices/',
        slice_filename_extension = '.png';

    // slices container

    // slices information
    // cytoscape graph object
    var cy;

    //var current_section = 0;

    this.set_stack = function( parentStack ) {
        console.log('SET STACK', parentStack );
        self.stack = parentStack;

        // TODO: assume graph widget open
        // $("#cyto").cytoscape({ zoom: 1});
        // cy = $("#cyto").cytoscape("get");

        // TODO: this needs to be called after fetching for an
        // assembly id from the database
        for(var i = 0; i < self.stack.slices.length; i++) {
            allvisible_slices[ self.stack.slices[i] ] = new Object();
        };
    }

    var get_current_stack = function() {
        return self.stack;
    }
    this.get_current_stack = get_current_stack;

    var update_stack = function() {
        self.stack.update();
    }

    self.save_assembly = function() {
        // update all slices and segment with assembly id
        var slices = [];
        for(var i = 0; i < self.stack.slices.length; i++) {
            for(var node_id in allvisible_slices[i]) {
                if(allvisible_slices[i].hasOwnProperty(node_id)) {
                    slices.push( node_id )
                }
            }
        };
        requestQueue.register(django_url + project.id + '/stack/' + get_current_stack().id + '/assembly/save', "POST", {
            assemblyid: self.current_active_assembly,
            slices: slices.join()
        }, function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            console.log('saved assembly!')  
                        }
                    }
                }
        });
        // TODO: update segments
        // TODO: end segments
    }

    self.load_assembly = function( assembly_id ) {
        // console.log('load assembly', assembly_id)
        self.set_current_assembly_id( assembly_id );
        // fetch assembly slices (and segments?) from db and add to view
        requestQueue.register(django_url + project.id + '/stack/' + get_current_stack().id + '/slices-of-assembly', "GET", {
            assemblyid: assembly_id
        }, function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            for(var idx=0; idx<e.length;idx++) {
                                if( idx == e.length-1)
                                    add_slice( e[ idx ], true, true, false, false );
                                else
                                    add_slice( e[ idx ], true, false, false, false );
                                activate_slice( e[idx] );
                                slices_grouping[ e[ idx ].node_id ] = {};
                                slices_grouping[ e[ idx ].node_id ]['slicelist'] = [];
                                slices_grouping[ e[ idx ].node_id ]['sliceindex'] = 0;
                                slices_grouping[ e[ idx ].node_id ]['slicelist'].push( [ e[ idx ].node_id ] );
                            }
                        }
                    }
                }
        });
    }

    self.has_current_assembly = function() {
        return (self.current_active_assembly !== null &&
            parseInt(self.current_active_assembly, 10) > 0 )
    }

    self.set_current_assembly_id = function( assembly_id ) {
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

    self.get_slice = function( node_id ) {
        // console.log('get slice in function', node_id);
        // TODO: check if existing
        return allslices[ node_id ];
    }

    self.get_current_active_slice = function() {
        return allslices[ current_active_slice ];
    }

    self.get_visible_slices = function( section_index ) {
        // console.log('get visible, current section', section_index);
        return allvisible_slices[section_index];
    }

    self.set_propagation_counter = function( counter ) {
        self.propagation_counter = counter;
    }

    self.toggle_automatic_propagation = function() {
        automatic_propagation = !automatic_propagation;
    }

    self.create_segments_table_for_current_active = function() {
        create_segments_table_for_slice( current_active_slice );
    }

    self.fetch_segments_right = function() {
        allslices[ current_active_slice ].fetch_slices_for_selected_segment( true );
    }

    self.fetch_segments_left = function() {
        allslices[ current_active_slice ].fetch_slices_for_selected_segment( false );
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

    var goto_slice = function( node_id, center_slice ) {
        if ( !allslices.hasOwnProperty( node_id ) ) {
            console.log('can not go to slice', node_id);
            return;
        }
        // self.slider_z.setByValue( current_section, true );
        self.stack.z = allslices[ node_id ].sectionindex;
        var x,y;
        if( center_slice ) {
            x = allslices[ node_id ].center_x;
            y = allslices[ node_id ].center_y;
        } else {
            x = self.stack.x;
            y = self.stack.y;
        }
        self.stack.moveToPixel(
            allslices[ node_id ].sectionindex,
            y, //self.stack.y,
            x, //self.stack.x,
            self.stack.s );
        update_stack();
    }
    this.goto_slice = goto_slice;



    var get_slice_image_url_from_section_and_slice = function( sectionindex, slice_id ) {
        return slice_base_url + 
            generate_path_for_slice( sectionindex, slice_id ) +
            slice_filename_extension;
    };

    var create_segments_table_for_slice = function( node_id ) {
        if( !allslices.hasOwnProperty( node_id ) ) {
            alert('Can not create segments table for slice. Not fetch slice!')
            return;
        }

        $('#segmentstable').empty();
        var right_segments = allslices[ node_id ].segments_right;
        $('#segmentstable').append('<tr>'+
            '<td>segments right</td>' +
            '<td>t</td>' +
            '<td>target ids</td>' +
            '<td>cost</td>' +
            '<td>center_distance</td>' +
            '<td>set_difference</td>' +
            '<td>set_difference_ratio</td>' +
            '<td>al_set_difference</td>' +
            '<td>al_set_difference_ratio</td>' +
            '<td>size</td>' +
            '<td>overlap</td>' +
            '<td>overlap_ratio</td>' +
            '<td>al_overlap</td>' +
            '<td>al_overlap_ratio</td>' +
            '</tr>');
        for(var i=0; i<right_segments.length; i++ ) {
            // only for continuations
            var sliceimage = '';
            if( right_segments[i].segmenttype === 2 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( right_segments[i].target_section,
                        right_segments[i].target1_slice_id) + '" >';
            } else if( right_segments[i].segmenttype === 3 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( right_segments[i].target_section,
                        right_segments[i].target1_slice_id) + '" ><br />' +
                    '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( right_segments[i].target_section,
                        right_segments[i].target2_slice_id) + '" >';
            }
            $('#segmentstable').append('<tr>'+
                //'<td>'+right_segments[i].segmentid+'</td>' +
                '<td style="background-color:#000000">'+sliceimage+'</td>' +
                '<td>'+right_segments[i].segmenttype+'</td>' +
                '<td>'+right_segments[i].target_section+'//'+right_segments[i].target1_slice_id+','+right_segments[i].target2_slice_id+'</td>' +
                '<td>'+right_segments[i].cost+'</td>' +
                '<td>'+right_segments[i].center_distance+'</td>' +
                '<td>'+right_segments[i].set_difference+'</td>' +
                '<td>'+right_segments[i].set_difference_ratio+'</td>' +
                '<td>'+right_segments[i].aligned_set_difference+'</td>' +
                '<td>'+right_segments[i].aligned_set_difference_ratio+'</td>' +
                '<td>'+right_segments[i].size+'</td>' +
                '<td>'+right_segments[i].overlap+'</td>' +
                '<td>'+right_segments[i].overlap_ratio+'</td>' +
                '<td>'+right_segments[i].aligned_overlap+'</td>' +
                '<td>'+right_segments[i].aligned_overlap_ratio+'</td>' +
                '</tr>');
        }

        var left_segments = allslices[ node_id ].segments_left;
        $('#segmentstable').append('<tr>'+
            '<td>segments left</td>' +
            '<td>t</td>' +
            '<td>target ids</td>' +
            '<td>cost</td>' +
            '<td>center_distance</td>' +
            '<td>set_difference</td>' +
            '<td>set_difference_ratio</td>' +
            '<td>al_set_difference</td>' +
            '<td>al_set_difference_ratio</td>' +
            '<td>size</td>' +
            '<td>overlap</td>' +
            '<td>overlap_ratio</td>' +
            '<td>al_overlap</td>' +
            '<td>al_overlap_ratio</td>' +
            '</tr>');
        for(var i=0; i<left_segments.length; i++ ) {
            // only for continuations
            var sliceimage = '';
            if( left_segments[i].segmenttype === 2 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( left_segments[i].target_section,
                        left_segments[i].target1_slice_id) + '" >';
            } else if( left_segments[i].segmenttype === 3 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( left_segments[i].target_section,
                        left_segments[i].target1_slice_id) + '" ><br />' +
                    '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( left_segments[i].target_section,
                        left_segments[i].target2_slice_id) + '" >';
            }
            $('#segmentstable').append('<tr>'+
                //'<td>'+left_segments[i].segmentid+'</td>' +
                '<td style="background-color:#000000">'+sliceimage+'</td>' +
                '<td>'+left_segments[i].segmenttype+'</td>' +
                '<td>'+left_segments[i].target_section+'//'+left_segments[i].target1_slice_id+','+left_segments[i].target2_slice_id+'</td>' +
                '<td>'+left_segments[i].cost+'</td>' +
                '<td>'+left_segments[i].center_distance+'</td>' +
                '<td>'+left_segments[i].set_difference+'</td>' +
                '<td>'+left_segments[i].set_difference_ratio+'</td>' +
                '<td>'+left_segments[i].aligned_set_difference+'</td>' +
                '<td>'+left_segments[i].aligned_set_difference_ratio+'</td>' +
                '<td>'+left_segments[i].size+'</td>' +
                '<td>'+left_segments[i].overlap+'</td>' +
                '<td>'+left_segments[i].overlap_ratio+'</td>' +
                '<td>'+left_segments[i].aligned_overlap+'</td>' +
                '<td>'+left_segments[i].aligned_overlap_ratio+'</td>' +
                '</tr>');
        }

    }

    this.visualize_assembly = function() {
        // need open 3d context

        if( !self.current_active_assembly ) {
            alert('Need to have an active assembly to visualize');
            return;
        }

        // generate assembly data structure to add
        var assembly_data = {
            assembly_id: self.current_active_assembly,
            slices: []
        }
        // loop through all sections to collect all visible slices
        // use slices_grouping
        var slice;
        for(var idx in slices_grouping) {
            if( slices_grouping.hasOwnProperty( idx ) ) {
                slice = allslices[ idx ];
                assembly_data.slices.push({
                    node_id: slice.node_id,
                    min_x: slice.min_x,
                    max_x: slice.max_x,
                    min_y: slice.min_y,
                    max_y: slice.max_y,
                    bb_center_x: slice.bb_center_x,
                    bb_center_y: slice.bb_center_y,
                    sectionindex: slice.sectionindex,
                    bbwidth: slice.max_x-slice.min_x,
                    bbheight: slice.max_y-slice.min_y,
                    url: slice.get_slice_image_url()
                })
            }
        }

        // pass it to webgl app (which adds the assembly to the scene)
        WebGLApp.addAssembly( assembly_data );
    }

    this.delete_active_slice = function() {
        //console.log('delete active slice', current_active_slice)
        // but leave the loaded in memory
        if( current_active_slice ) {
            self.remove_slice( current_active_slice );
            activate_slice( null );
        }
        update_stack();
    };

    this.previous_slice = function() {
        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if(!slices_grouping.hasOwnProperty( current_active_slice )) {
            console.log('slices grouping does not have group with key', current_active_slice);
            return;
        }

        if( slices_grouping[ current_active_slice ].slicelist.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        if( slices_grouping[ current_active_slice ].sliceindex-1 < 0 ) {
            return;
        };

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;

        var nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;
        for(var idx = 0; idx < nr_elements; idx++) {
            make_invisible( slices_grouping[ current_active_slice ].slicelist[ index ][ idx ] );
        }

        index--;

        // define the set of new slices visible
        nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;
        for(var idx = 0; idx < nr_elements; idx++) {
            var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ idx ];
            make_visible( new_active_slice, false );
        }

        // make the first one active and use it as prototype key for the grouping
        var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ 0 ];
        slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
        slices_grouping[ new_active_slice ].sliceindex = index;
        delete slices_grouping[ current_active_slice ];

        activate_slice( new_active_slice );
        make_visible( new_active_slice, true );
        update_stack();
    };

    this.next_slice = function() {

        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if(!slices_grouping.hasOwnProperty( current_active_slice )) {
            console.log('slices grouping does not have group with key', current_active_slice);
            return;
        }

        if( slices_grouping[ current_active_slice ].slicelist.length == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        var count = slices_grouping[ current_active_slice ].slicelist.length;
        if( slices_grouping[ current_active_slice ].sliceindex + 1 > count-1 ) {
            return;
        };

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;

        var nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;
        for(var idx = 0; idx < nr_elements; idx++) {
            make_invisible( slices_grouping[ current_active_slice ].slicelist[ index ][ idx ] );
        }

        index++;

        // define the set of new slices visible
        nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;
        for(var idx = 0; idx < nr_elements; idx++) {
            var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ idx ];
            make_visible( new_active_slice, false );
        }


        // make the first one active and use it as prototype key for the grouping
        var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ 0 ];
        slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
        slices_grouping[ new_active_slice ].sliceindex = index;
        delete slices_grouping[ current_active_slice ];

        activate_slice( new_active_slice );
        make_visible( new_active_slice, true );
        update_stack();
    }

    var add_slice = function( slice, is_visible, trigger_update, fetch_segments_for_slice, do_goto_slice ) {
        //console.log('add_slice', slice, is_visible, trigger_update, fetch_segments_for_slice, do_goto_slice);
        var slice = new Slice( slice );

        if( ! allslices.hasOwnProperty( slice.node_id ) ) {
            allslices[ slice.node_id ] = slice;
        } else {
            console.log('Slice already in allslices. do not add', slice);
        };

        slice.fetch_image( trigger_update, fetch_segments_for_slice, is_visible, do_goto_slice )
    }
    self.add_slice = add_slice;

    var make_visible = function( node_id, do_goto_slice ) {
        var nodeidsplit = inv_cc_slice( node_id );
        if( allslices.hasOwnProperty( node_id ) ) {
            if( ! allvisible_slices[ nodeidsplit.sectionindex ].hasOwnProperty( node_id ) ) {
                allvisible_slices[ nodeidsplit.sectionindex ][ node_id ] = null;
                if( do_goto_slice ) {
                    goto_slice( node_id, false );
                }
            } else {
                console.log('Slice already in allvisible_slices. do not add', node_id);
            };
         } else {
            // if it does not yet exist, create it and make it visible
            var nodeidsplit = inv_cc_slice( node_id );
            requestQueue.register(django_url + project.id + "/stack/" + get_current_stack().id + '/slice', "GET", {
                sectionindex: nodeidsplit.sectionindex,
                sliceid: nodeidsplit.sliceid
            }, function (status, text, xml) {
                    if (status === 200) {
                        if (text && text !== " ") {
                            var e = $.parseJSON(text);
                            if (e.error) {
                                alert(e.error);
                            } else {
                                if( e.length > 1) {
                                    alert('Should only have fetched one slice, but it fetched multiple.');
                                    return false;
                                }
                                self.add_slice( e[ 0 ], true, true, true );
                            }
                        }
                    }
            });
         }
    }

    var make_invisible = function( node_id ) {
        var nodeidsplit = inv_cc_slice( node_id );
        if( allvisible_slices[ nodeidsplit.sectionindex ].hasOwnProperty( node_id ) ) {
            delete allvisible_slices[ nodeidsplit.sectionindex ][ node_id ];
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
            // delete all associated slices
            for(var index = 0; index < slices_grouping[ node_id ].slicelist.length; index++) {
                for(var idx = 0; idx < slices_grouping[ node_id ].slicelist[ index ].length; idx++) {
                    var tmp_node_id = slices_grouping[ node_id ].slicelist[ index ][ idx ];
                    if( allslices.hasOwnProperty( tmp_node_id ) ) {
                        delete allslices[ tmp_node_id ];
                    }                     
                }
            }
            delete slices_grouping[ node_id ];
        }
    }

    var cc_slice = function( sectionindex, slice_id ) {
        return sectionindex + '_' + slice_id;
    }

    var inv_cc_slice = function( node_id ) {
        var nodesplit = node_id.split('_');
        return {
            sectionindex: parseInt(nodesplit[0]),
            sliceid: parseInt(nodesplit[1]) };
    }


    var add_slices_group_from_segments = function( segments, selected_segment_index ) {
        var prototype_slice = cc_slice(segments[ selected_segment_index ].target_section,
                segments[ selected_segment_index ].target1_slice_id);
        slices_grouping[ prototype_slice ] = {};
        slices_grouping[ prototype_slice ]['slicelist'] = [];
        slices_grouping[ prototype_slice ]['sliceindex'] = 0;
        slices_grouping[ prototype_slice ]['slicelist'].push( [ prototype_slice ] );
        var sslice = null;
        for (var sidx = 0; sidx < segments.length; sidx++) {
            if( sidx !== selected_segment_index ) {
                sslice = segments[ sidx ];
                if( segments[ sidx ].segmenttype === 2) {
                    slices_grouping[ prototype_slice ]['slicelist'].push( [ cc_slice( sslice.target_section, sslice.target1_slice_id) ] );
                } else if( segments[ sidx ].segmenttype === 3) {
                    slices_grouping[ prototype_slice ]['slicelist'].push( [ cc_slice( sslice.target_section, sslice.target1_slice_id),
                     cc_slice( sslice.target_section, sslice.target2_slice_id) ] );
                }
            } 
        }
        return prototype_slice;
    }

    var add_slices_group = function( result ) {
        var prototype_slice = null;
        for (var sidx in result) {
            if( sidx == 0 ) {
                // is_visible = trigger_update = fetch_segments = true
                self.add_slice( result[sidx], true, true, true );
                activate_slice( result[sidx] );
                prototype_slice = result[sidx].node_id;
                slices_grouping[ prototype_slice ] = {};
                slices_grouping[ prototype_slice ]['slicelist'] = [];
                slices_grouping[ prototype_slice ]['sliceindex'] = 0;
                slices_grouping[ prototype_slice ]['slicelist'].push( [ prototype_slice ] );
            } else {
                self.add_slice( result[sidx], false, false, true );
                slices_grouping[ prototype_slice ]['slicelist'].push( [ result[sidx].node_id ] );
            }
        }
    }
    self.add_slices_group = add_slices_group;

    var activate_slice = function( slice ) {
        if ( slice === null) {
            current_active_slice = null;
            statusBar.replaceLast("No active slice");
        } else if( typeof(slice) === "string" ) {
            current_active_slice = slice;
            statusBar.replaceLast("Activated slice with node id " + slice);
        } else {
            current_active_slice = slice.node_id;
            statusBar.replaceLast("Activated slice with node id " + slice.node_id);
        }        
    };
    self.activate_slice = activate_slice;

    var update_graph_widget_for_slice = function( node_id ) {
        var demoNodes = [];
        var demoEdges = [];

        for(var idx in allslices[ node_id ].segments) {
            var seg = allslices[ node_id ].segments[idx];
            if( seg.segmenttype == 2 ) {
                console.log('add continuation')
                    demoNodes.push({
                    data: {
                        id: "n" + seg.target_section + "_" + seg.target1_slice_id,
                        position: { x: 100+idx*60, y: 100+idx*60 }
                    },
                });
            }
        }

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
        this.bb_center_x = Math.round(self.min_x+(self.max_x-self.min_x)/2);
        this.bb_center_y = Math.round(self.min_y+(self.max_y-self.min_y)/2);

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

        this.fetch_image = function( trigger_update, fetch_segments_for_slice, is_visible, do_goto_slice ) {
            // console.log('fetch image', trigger_update, fetch_segments_for_slice)
            fabric.Image.fromURL(self.get_slice_image_url(), function(img)
            {
                //console.log('image fetched!', img)
                self.img = img;
                // TODO: does not work
                //self.img.perPixelTargetFind = true;
                //self.img.targetFindTolerance = 40;

                self.img.hasControls = false;
                self.img.hasBorders = false;
                self.img.set('selectable', true)
                self.img.lockMovementX = self.img.lockMovementY = true;
                // store a reference from the img to the slice
                self.img.slice = self;

                //if(callback != undefined && typeof callback == 'function')
                    //callback();

                if( is_visible ) {
                    make_visible( slice.node_id, do_goto_slice );
                }

                if ( trigger_update ) {
                    update_stack();
                }

                if( fetch_segments_for_slice ) {
                    self.fetch_segments( fetch_segments_for_slice )   
                }
                 
                    
            });
        };

        /*
        ** Fetch connected segments of this slices
        ** and initialize segments_{left|right} object
        */
        this.fetch_segments = function ( for_right ) {
            // console.log('fetch segments. trigger fetchingin slices for segment?', trigger_fetch_segment );
            // do not fetch segments if already fetched
            if(self.segments_right.length > 0 || self.segments_left.length > 0) {
                console.log('already existing segments');
                return;
            }

            requestQueue.register(django_url + project.id + "/stack/" + get_current_stack().id + '/segments-for-slice', "GET", {
                sliceid: self.slice_id,
                sectionindex: self.sectionindex
            }, function (status, text, xml) {
                    if (status === 200) {
                        if (text && text !== " ") {
                            var e = $.parseJSON(text, allow_nan=true);
                            if (e.error) {
                                alert(e.error);
                            } else {
                                //console.log('found segments', e);
                                for(var idx in e) {
                                    if( !e[idx].direction ) {
                                        self.segments_left.push( e[idx] );
                                        if( !self.selected_segment_left ) {
                                            self.selected_segment_left = 0;
                                        }
                                    } else {
                                        self.segments_right.push( e[idx] );
                                        if( !self.selected_segment_right ) {
                                            self.selected_segment_right = 0;
                                        }
                                    }
                                }

                                // if automated fetching is on and conditions hold, move to the next!
                                if( automatic_propagation && propagation_counter > 0 ) {
                                    propagation_counter--;
                                    console.log('propgation counter', propagation_counter, 'go with next!')
                                    self.fetch_slices_for_selected_segment( true );
                                    
                                }


                            }
                        }
                    }
            });
        };

        this.fetch_slices_for_selected_segment = function( for_right ) {
            var current_segment, proto_node_id;
            if ( for_right ) {
                if (self.segments_right.length == 0) {
                    $('#growl-alert').growlAlert({
                        autoShow: true,
                        content: "No more segments found to the right for slice " + self.node_id,
                        title: 'Warning',
                        position: 'top-right',
                        delayTime: 2000,
                        onComplete: function() {  }
                    });
                    return;
                } else {
                    current_segment = self.segments_right[ self.selected_segment_right ];
                }
                // create grouping for segments set
                proto_node_id = add_slices_group_from_segments( self.segments_right, self.selected_segment_right );

            } else {
                if (self.segments_left.length == 0) {
                    $('#growl-alert').growlAlert({
                        autoShow: true,
                        content: "No more segments found to the left for slice " + self.node_id,
                        title: 'Warning',
                        position: 'top-right',
                        delayTime: 2000,
                        onComplete: function() {  }
                    });
                    return;
                } else {
                    current_segment = self.segments_left[ self.selected_segment_left ];
                }
                proto_node_id = add_slices_group_from_segments( self.segments_left, self.selected_segment_left );
            }

            // we want to go directly to the newly fetched proto slice,
            // so we need to make it current first in order to
            // go to it after the fetch_image ajax call has returned
            activate_slice( proto_node_id );
            make_visible( proto_node_id, true );

        }

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

        this.get_slice_relative_image_url = function() {
            return generate_path_for_slice( this.sectionindex, this.slice_id ) +
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