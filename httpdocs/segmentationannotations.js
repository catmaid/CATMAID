var allslices = new Object(), slices_grouping = new Object();

// all selected slices per section
var allvisible_slices = new Object();
var current_active_slice = null;
var allsegments = new Object();

function DiGraph() {

    var self = this;
    self.graph = {};
    self.node = {};
    self.adj = {};
    self.pred = {};
    self.succ = self.adj;
    self.edge=self.adj;

    self.add_node = function(n, data) {
        if( !self.succ.hasOwnProperty(n) ) {
            self.succ[ n ] = {};
            self.pred[ n ] = {};
            self.node[ n ] = data;
        } else {
            self.node[ n ] = data;
        }
    }

    self.remove_node = function(n) {
        if( !self.node.hasOwnProperty(n)) {
            console.log('Graph does not have node', n);
        }
        delete self.node[ n ];
        var nbrs = self.succ[ n ];
        for( var u in nbrs) {
            if( nbrs.hasOwnProperty(u)) {
                delete self.pred[u][n];
            }
        }
        delete self.succ[n];
        for( var u in self.pred[n]) {
            if( self.pred[n].hasOwnProperty(u)) {
                delete self.succ[u][n];
            }
        }
        delete self.pred[n];
    }

    self.add_edge = function(u, v, data) {
        if(!self.succ.hasOwnProperty(u)) {
            self.succ[u]={};
            self.pred[u]={};
            self.node[u]={};
        }
        if(!self.succ.hasOwnProperty(v)) {
            self.succ[v]={};
            self.pred[v]={};
            self.node[v]={};
        }
        self.succ[u][v]=data;
        self.pred[v][u]=data;
    }

}

var SegmentationAnnotations = new function()
{
    var self = this;
    
    self.stack = null;

    // assembly information
    self.current_active_assembly = null;

    // the canvas layer using fabric.js
    // , 
    var automatic_propagation = false, propagation_counter = 20;
    // more criteria, e.g. min_overlap_ratio_threshold=0.8

    // base url for slices, filename ending
    var slice_base_url, slice_filename_extension;

    var cygraph;

    var canvas;

    // slices centers
    var cogs = new Array();

    var slices_todo = [], slices_todo_selected = null;
    
    this.reset_all = function() {
        self.current_active_assembly = null
        allslices = new Object();
        slices_grouping = new Object();
        allvisible_slices = new Object();
        current_active_slice = null;
    }
/*
    this.test_graph = function() {

        var obj = new Object();
        obj.me = 'he';
        cygraph.add([
          { group: "nodes", data: { id: "n0", slice: obj, blub:{test:123} }, position: { x: 100, y: 100 } },
          { group: "nodes", data: { id: "n1" }, position: { x: 200, y: 200 } },
          { group: "nodes", data: { id: "n2" }, position: { x: 200, y: 200 } },
          { group: "edges", data: { id: "e0", source: "n0", target: "n1" } },
          { group: "edges", data: { id: "e1", source: "n0", target: "n2" } }
        ]);
        // cygraph.elements("node[id = 'n0']")
        /*
        var n = SegmentationAnnotations.cygraph.nodes("[id = 'n0']")
        n.data()
        var e = g.edges("[source='n0']");
        $.each(e, function(id, element){
            console.log('id', id, element.data() );
        });

        
        console.log( cygraph.nodes() )
    }*/

    this.init_graph = function() {
        console.log($('#cytograph'))
        var options = {
            ready: function(){
              console.log('cytoscape ready')
            },
            style: cytoscape.stylesheet()
              .selector("node")
                  .css({
                    "content": "data(label)",
                    "shape": "data(shape)",
                    "border-width": 1,
                    "background-color": "data(color)", //#DDD",
                    "border-color": "#555",
                  })
                .selector("edge")
                  .css({
                    "content": "data(label)",
                    "width": "data(weight)", //mapData(weight, 0, 100, 10, 50)",
                    "target-arrow-shape": "triangle",
                    // "source-arrow-shape": "circle",
                    "line-color": "#444",
                    "opacity": 0.4,
                    
                  })
                .selector(":selected")
                  .css({
                    "background-color": "#000",
                    "line-color": "#000",
                    "source-arrow-color": "#000",
                    "target-arrow-color": "#000",
                    "text-opacity": 1.0
                  })
        }
        $('#cytograph').cytoscape(options);
        cygraph = $('#cytograph').cytoscape("get");
        console.log('cygraph', cygraph)
        self.cygraph = cygraph;
        g = cygraph;
        //self.test_graph();
    }

    this.init_allvisible_slices = function() {
        // TODO: this needs to be called after fetching for an
        // assembly id from the database
        for(var i = 0; i < self.stack.slices.length; i++) {
            allvisible_slices[ self.stack.slices[i] ] = new Object();
        };
    }

    this.set_automatic_propagation = function( shiftKey ) {
        automatic_propagation = shiftKey
    }

    this.set_stack_and_layer = function( parentStack, canvas ) {
        // console.log('SET STACK', parentStack, canvas );
        self.stack = parentStack;
        self.canvas = canvas;

        requestQueue.register(django_url + project.id + '/stack/' + get_current_stack().id + '/slice-info', "POST", {},
         function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            slice_base_url = e.slice_base_url;
                            slice_filename_extension = e.slice_filename_extension;
                        }
                    }
                }
        });
    }

    this.show_slices_tiles = function() {
        var wc = self.stack.getFieldOfViewInPixel();
        self.canvas.clear();        
        var fetchurl = django_url + project.id + '/stack/' + get_current_stack().id + '/slices-tiles?' + $.param({
            sectionindex: get_current_stack().z,
            x: wc.worldLeftC,
            y: wc.worldTopC,
            width: self.canvas.width,
            height: self.canvas.height
        });
        fabric.Image.fromURL(fetchurl, function(img)
        {
            img.left = self.canvas.width/2.;
            img.top = self.canvas.height/2.;
            img.hasControls = false;
            img.hasBorders = false;
            img.set('selectable', false)
            img.lockMovementX = img.lockMovementY = true;
            self.canvas.add( img );
        });
    }

    this.show_slices_cogs = function() {
        var wc = self.stack.getFieldOfViewInPixel();
        self.canvas.clear();
        cogs = new Array();
        requestQueue.register(django_url + project.id + '/stack/' + get_current_stack().id + '/slices-cog', "GET", {
            z: get_current_stack().z,
            x: wc.worldLeftC,
            y: wc.worldTopC,
            width: self.canvas.width,
            height: self.canvas.height
        },
         function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            for(var i = 0; i < e.length; i++) {
                                var circ = new fabric.Circle({ 
                                    top: e[i].center_y - self.stack.getFieldOfViewInPixel().worldTopC, 
                                    left: e[i].center_x - self.stack.getFieldOfViewInPixel().worldLeftC, radius: 5, fill: 'green' })
                                circ.hasControls = false;
                                circ.hasBorders = false;
                                circ.set('selectable', false)
                                circ.lockMovementX = circ.lockMovementY = true;
                                self.canvas.add( circ );
                                cogs.push( e[i] );
                            }

                        }
                    }
                }
        });
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
        var result = self.find_loose_ends();
        console.log('save', result)
        /*if( slices.length == 0)
            return;*/
        //requestQueue.register does not encode json object properly for django backend
        $.ajax({
          "dataType": 'json',
          "type": "POST",
          "cache": false,
          "url": django_url + project.id + '/stack/' + get_current_stack().id + '/assembly/save',
          "data": {
            assemblyid: self.current_active_assembly,
            // slices: slices.join()
            slices: result['slices'],
            segments: result['segments'],
            slices_left_flags: result['slices_left_flags'],
            slices_right_flags: result['slices_right_flags'],
        },
          "success": function(data) {
             console.log('returned', data)
          }
        });
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
                            console.log('load segments ....')
                            requestQueue.register(django_url + project.id + '/stack/' + get_current_stack().id + '/segments-of-assembly', "GET", {
                                assemblyid: assembly_id
                            }, function (status, text, xml) {
                                    if (status === 200) {
                                        if (text && text !== " ") {
                                            var e = $.parseJSON(text);
                                            if (e.error) {
                                                alert(e.error);
                                            } else {
                                                for(var idx=0; idx<e.length;idx++) {
                                                    var newsegment = new Segment( e[idx] );
                                                    add_segment_instance( newsegment );
                                                    // TODO: associate origin/target slice (selected slice) for existing slices
                                                }
                                                update_stack();
                                            }
                                        }
                                    }
                            });

                        }
                    }
                }
        });
    }

    self.create_new_assembly = function() {
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
                                    }
                                }
                            }
                    });
    }

    self.updateNeuronName = function() {
          if( self.has_current_assembly() ) {
            requestQueue.register(django_url + project.id + '/assembly/' + SegmentationAnnotations.current_active_assembly + '/neuronname', "POST", {}, function (status, text, xml) {
              var e;
              if (status === 200) {
                if (text && text !== " ") {
                  e = $.parseJSON(text);
                  if (e.error) {
                    alert(e.error);
                  }
                  var new_neuronname = prompt("Change neuron name (assembly ID:" + SegmentationAnnotations.current_active_assembly + ")", e['neuronname']);
                  if (new_neuronname != '' && new_neuronname != null) {
                      $.post(django_url + project.id + '/object-tree/instance-operation', {
                        "operation": "rename_node",
                        "id": e['neuronid'],
                        "title": new_neuronname,
                        "classname": "neuron",
                        "pid": project.id
                      }, function (r) {
                          r = $.parseJSON(r);
                          if(r['error']) {
                              alert(r['error']);
                          }
                      });
                  }
                }
              }
            });
          }
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
            self.save_assembly();
            self.reset_all();
            self.current_active_assembly = assembly_id;
            self.load_assembly( self.current_active_assembly );
            openAssemblyInObjectTree();
        }
    };

    var openAssemblyInObjectTree = function( ) {
        console.log('try to open in object tree', self.current_active_assembly);
        // Check if the Object Tree div is visible
        if ($('#object_tree_widget').css('display') === "none" || ! $('#synchronize_object_tree').attr('checked')) {
            return;
        }
        // Else, synchronize:
        if( self.current_active_assembly )
            ObjectTree.requestOpenTreePath( self.current_active_assembly );
    };

    var get_slice = function( node_id ) {
        // console.log('get slice in function', node_id);
        // TODO: check if existing
        return allslices[ node_id ];
    }
    self.get_slice = get_slice;

    self.get_current_active_slice = function() {
        return allslices[ current_active_slice ];
    }

    self.get_all_visible_slices = function( section_index ) {
        if( allvisible_slices.hasOwnProperty(section_index) )
            return allvisible_slices[section_index];
    }

    var is_slice_visible = function( section_index, node_id ) {
        if( !allvisible_slices.hasOwnProperty(section_index)) 
            allvisible_slices[ section_index ] = {};
        if( ! allvisible_slices[ section_index ].hasOwnProperty( node_id ) ) {
            return false;
        } else {
            return true;
        };
    }

    var have_slice = function( node_id ) {
        // var nodeidsplit = inv_cc_slice( node_id );
        if( ! allslices.hasOwnProperty( node_id ) ) {
            return false;
        } else {
            return true;
        };
    }

    var make_slice_visible = function( node_id ) {
        var nodeidsplit = inv_cc_slice( node_id );
        if( !allvisible_slices.hasOwnProperty(nodeidsplit.sectionindex)) 
            allvisible_slices[ nodeidsplit.sectionindex ] = {};
        allvisible_slices[ nodeidsplit.sectionindex ][ node_id ] = null;
    }

    self.mark_as_end_for_current = function( to_right ) {
        if( to_right ) {
            allslices[ current_active_slice ].flag_right = 1;
        } else {
            allslices[ current_active_slice ].flag_left = 1;
        }
    }

    self.set_propagation_counter = function( counter ) {
        console.log('reset counter', counter)
        propagation_counter = counter;
    }

    self.toggle_automatic_propagation = function() {
        automatic_propagation = !automatic_propagation;
        console.log('automatic propagation', automatic_propagation)
    }

    self.create_segments_table_for_current_active = function() {
        create_segments_table_for_slice( current_active_slice );
    }

    self.fetch_segments_right = function() {
        console.log('fetch segments right');
        allslices[ current_active_slice ].fetch_segments( true );
    }

    var fetch_allsegments_current = function() {
        console.log('fetch segments right and left');
        fetch_all_segments( current_active_slice );
    }
    self.fetch_allsegments_current = fetch_allsegments_current;


    self.fetch_slicegroup_from_selected_segment_current_slice = function( to_right ) {
        allslices[ current_active_slice ].add_slicesgroup_for_selected_segment( to_right );
    }

    self.fetch_segments_left = function() {
        allslices[ current_active_slice ].fetch_segments( false );
        //allslices[ current_active_slice ].fetch_slices_for_selected_segment( false );
    }

    self.next_slice_todo = function() {
        self.find_loose_ends();
        if( slices_todo.length == 0) {
            $('#growl-alert').growlAlert({
                autoShow: true,
                content: "No slice TODO is left.",
                title: 'Warning',
                position: 'top-right',
                delayTime: 2000,
                onComplete: function() {  }
            });
            return;
        }
        if( slices_todo_selected >= slices_todo.length - 1)
            slices_todo_selected = 0;
        else {
            slices_todo_selected++;
        }
        var slice = get_slice( slices_todo[ slices_todo_selected ] ), msg = null;
        // TODO: the msg is wrong if we move through the stack with Y
        // the backassociated of the selected target slice is not made
        if( slice.flag_left == 0 && slice.selected_segment_left == null ) {
            msg = "Slice partner to the left is undefined.";
        } else if ( slice.flag_right == 0 && slice.selected_segment_right == null ) {
            msg = "Slice partner to the right is undefined.";
        }
        if( msg !== null ) {
            $('#growl-alert').growlAlert({
                autoShow: true,
                content: msg,
                title: 'Info',
                position: 'top-right',
                delayTime: 2000,
            });            
        }
        goto_slice( slices_todo[ slices_todo_selected ], true);
    }

    self.find_loose_ends = function() {
        /*var tmp_allsegments = {}, tmp_segment;
        for(var idx in allsegments) {
            if( allsegments.hasOwnProperty( idx )) {
                var orig = allsegments[ idx ].origin_section,
                    target = allsegments[ idx ].target_section;
                if(!tmp_allsegments.hasOwnProperty( orig )) {
                    tmp_allsegments[ orig ] = {};
                    tmp_allsegments[ orig ][ target ] = {};
                }
                if(!tmp_allsegments[ orig ].hasOwnProperty( target )) {
                    tmp_allsegments[ orig ][ target ] = {};
                }
                tmp_allsegments[ orig ][ target ][ idx ] = allsegments;
            }
        }*/

        // loop through all the visible sections
        // for each slice, print out left and right selected segments and left/right flags
        var result_slices = {}, result_segments = {}, slices_to_check = {};
        for( var idx in allvisible_slices ) {
            if( allvisible_slices.hasOwnProperty( idx ) ) {
                for( var node_id in allvisible_slices[ idx ]) {
                    if( allvisible_slices[ idx ].hasOwnProperty( node_id )) {
                        result_slices[ node_id ] = { // information i wanna save later
                            flag_left: allslices[ node_id ].flag_left,
                            flag_right: allslices[ node_id ].flag_right
                        }
                    }
                }
            }
        };
        var flags_left = [], flags_right = [];
        var slicelist = Object.keys( result_slices );
        for(var idx = 0; idx < slicelist.length; idx++ ) {
            flags_left.push( allslices[ slicelist[ idx ] ].flag_left );
            flags_right.push( allslices[ slicelist[ idx ] ].flag_right );
        }

        var result_slices_count = {};
        for(var idx in result_slices) {
            if( result_slices.hasOwnProperty( idx )) {
                result_slices_count[ idx ] = 0;
            }
        }

        var slice, segmentnodeid, tmp_segment;
        for(var idx in result_slices) {
            if( result_slices.hasOwnProperty( idx )) {

                slice = get_slice( idx );
                if( slice.selected_segment_right !== null ) {
                    segmentnodeid = slice.get_current_right_segment()
                    tmp_segment = get_segment( segmentnodeid );
                    // info i wanna save later
                    result_segments[ segmentnodeid ] = {}; // tmp_segment; 
                }

                if( slice.selected_segment_left !== null ) {
                    segmentnodeid = slice.get_current_left_segment()
                    tmp_segment = get_segment( segmentnodeid );
                    // info i wanna save later
                    result_segments[ segmentnodeid ] = {}; // tmp_segment;
                }

                // increase counter if left or right flags are set
                if( slice.flag_left > 0 && slice.selected_segment_left == null) {
                    result_slices_count[ slice.node_id ] += 1;
                }
                    
                if( slice.flag_right > 0 && slice.selected_segment_right == null) {
                    result_slices_count[ slice.node_id ] += 1;
                }
                    
            }
        }

        for(var idx in result_segments) {
            if( result_segments.hasOwnProperty( idx )) {
                tmp_segment = get_segment( idx );
                if( result_slices.hasOwnProperty( tmp_segment.origin_node_id ) )
                    result_slices_count[ tmp_segment.origin_node_id ] += 1;
                if( tmp_segment.segmenttype == 2 ) {
                    if( result_slices.hasOwnProperty( tmp_segment.target1_node_id ) )
                        result_slices_count[ tmp_segment.target1_node_id ] += 1;
                } else if ( tmp_segment.segmenttype == 3 ) {
                    if( result_slices.hasOwnProperty( tmp_segment.target1_node_id ) )
                        result_slices_count[ tmp_segment.target1_node_id ] += 1;
                    if( result_slices.hasOwnProperty( tmp_segment.target2_node_id ) )
                        result_slices_count[ tmp_segment.target2_node_id ] += 1;
                }
            }
        }

        slices_todo = [];
        for(var idx in result_slices_count) {
            if( result_slices_count.hasOwnProperty( idx )) {
                if( result_slices_count[idx] < 2) {
                    slices_todo.push( idx );
                }
            }
        }

        return {
            'slices': slicelist,
            'segments': Object.keys( result_segments ),
            'slices_left_flags': flags_left,
            'slices_right_flags': flags_right
        }
    }

    self.constraints_for_selected_segment_of_active_slice = function() {
        var slice = self.get_current_active_slice();
        console.log('slice', slice)
        if( slice ) {
            var segmentnodeid = slice.get_current_right_segment();
            console.log('segmentndoeid', segmentnodeid);
            // var segment = get_segment( segmentnodeid );
            requestQueue.register(django_url + project.id + "/stack/" + get_current_stack().id + '/constraint/constraintset-for-segment', "GET", {
                segmentnodeid: segmentnodeid,
            }, function (status, text, xml) {
                    if (status === 200) {
                        if (text && text !== " ") {
                            var e = $.parseJSON(text);
                            if (e.error) {
                                alert(e.error);
                            } else {
                                console.log('constraints returned', e);
                            }
                        }
                    }
            });            
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

    var goto_slice = function( node_id, center_slice ) {
        if ( !have_slice( node_id ) ) {
            console.log('Do not have slice and can not go to slice', node_id);
            return;
        }
        activate_slice( node_id );
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


    var fetch_all_segments = function( node_id ) {
        if( have_slice(node_id) ) {
            console.log('fetch all segments of slice', node_id);
            allslices[ node_id ].fetch_segments( true );
            allslices[ node_id ].fetch_segments( false );
        }
    }

    var get_slice_image_url_from_section_and_slice = function( sectionindex, slice_id ) {
        return slice_base_url + 
            generate_path_for_slice( sectionindex, slice_id ) + '.' +
            slice_filename_extension;
    };

    var add_slice_instance = function( slice ) {
        if( ! allslices.hasOwnProperty( slice.node_id ) ) {
            allslices[ slice.node_id ] = slice;
        } else {
            console.log('Slice already in allslices. do not add', slice);
        };
    }

    var remove_slice_instance = function( node_id ) {
        if( ! allslices.hasOwnProperty( node_id ) ) {
            delete allslices[ node_id ];
        } else {
            console.log('Cannot remove slice instance ', node_id, '. It does not exist');
        };
    }

    var get_segment = function( node_id ) {
        if( allsegments.hasOwnProperty(node_id)) {
            return allsegments[ node_id ];
        } else {
            return undefined;
        }
    }

    var add_segment_instance = function( segment ) {
        if( ! allsegments.hasOwnProperty( segment.node_id )) {
            allsegments[ segment.node_id ] = segment;
        } else {
            console.log('Segment already in allsegments. Do not add.', segment.node_id );
        }
    }

    var create_segments_table_for_slice = function( node_id ) {
        if( !allslices.hasOwnProperty( node_id ) ) {
            alert('Can not create segments table for slice. Not fetch slice!')
            return;
        }
        $('#segmentstable').empty();
        var right_segments = allslices[ node_id ].segments_right;
        $('#segmentstable').append('<tr>'+
            '<td>segments right</td>' +
            '<td>origin</td>' +
            '<td>id</td>' +
            '<td>t</td>' +
            '<td>dir</td>' +
            '<td>target ids</td>' +
            '<td>cost</td>' +
            '<td>center_distance</td>' +
            '<td>set_difference</td>' +
            '<td>set_difference_ratio</td>' +
            '<td>aligned_set_difference</td>' +
            '<td>aligned_set_difference_ratio</td>' +
            '<td>size</td>' +
            '<td>overlap</td>' +
            '<td>overlap_ratio</td>' +
            '<td>aligned_overlap</td>' +
            '<td>aligned_overlap_ratio</td>' +
            '<td>average_slice_distance</td>' +
            '<td>max_slice_distance</td>' +
            '<td>aligned_average_slice_distance</td>' +
            '<td>aligned_max_slice_distance</td>' +
            '<td>histogram_0</td>' +
            '<td>histogram_1</td>' +
            '<td>histogram_2</td>' +
            '<td>histogram_3</td>' +
            '<td>histogram_4</td>' +
            '<td>histogram_5</td>' +
            '<td>histogram_6</td>' +
            '<td>histogram_7</td>' +
            '<td>histogram_8</td>' +
            '<td>histogram_9</td>' +
            '<td>normalized_histogram_0</td>' +
            '<td>normalized_histogram_1</td>' +
            '<td>normalized_histogram_2</td>' +
            '<td>normalized_histogram_3</td>' +
            '<td>normalized_histogram_4</td>' +
            '<td>normalized_histogram_5</td>' +
            '<td>normalized_histogram_6</td>' +
            '<td>normalized_histogram_7</td>' +
            '<td>normalized_histogram_8</td>' +
            '<td>normalized_histogram_9</td>' +
            '</tr>');

        for(var i=0; i<right_segments.length; i++ ) {
            // only for continuations
            var sliceimage = '';
            var segment = get_segment( right_segments[i] );
            if( segment.segmenttype === 2 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.target_section,
                        segment.target1_slice_id) + '" >';
            } else if( segment.segmenttype === 3 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.target_section,
                        segment.target1_slice_id) + '" ><br />' +
                    '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.target_section,
                        segment.target2_slice_id) + '" >';
            }
            var star = "";
            if( i == allslices[ node_id ].selected_segment_right )
                star = "(*)";
            $('#segmentstable').append('<tr>'+
                //'<td>'+segment.segmentid+'</td>' +
                '<td style="background-color:#000000">'+sliceimage+'</td>' +
                '<td>'+segment.origin_section+'//'+segment.origin_slice_id+'</td>' +
                '<td>'+segment.segmentid+star+'</td>' +
                '<td>'+segment.segmenttype+'</td>' +
                '<td>'+segment.direction+'</td>' +
                '<td>'+segment.target_section+'//'+segment.target1_slice_id+','+segment.target2_slice_id+'</td>' +
                '<td>'+segment.cost+'</td>' +
                '<td>'+segment.center_distance+'</td>' +
                '<td>'+segment.set_difference+'</td>' +
                '<td>'+segment.set_difference_ratio+'</td>' +
                '<td>'+segment.aligned_set_difference+'</td>' +
                '<td>'+segment.aligned_set_difference_ratio+'</td>' +
                '<td>'+segment.size+'</td>' +
                '<td>'+segment.overlap+'</td>' +
                '<td>'+segment.overlap_ratio+'</td>' +
                '<td>'+segment.aligned_overlap+'</td>' +
                '<td>'+segment.aligned_overlap_ratio+'</td>' +
                '<td>'+segment.average_slice_distance+'</td>' +
                '<td>'+segment.max_slice_distance+'</td>' +
                '<td>'+segment.aligned_average_slice_distance+'</td>' +
                '<td>'+segment.aligned_max_slice_distance+'</td>' +
                '<td>'+segment.histogram_0+'</td>' +
                '<td>'+segment.histogram_1+'</td>' +
                '<td>'+segment.histogram_2+'</td>' +
                '<td>'+segment.histogram_3+'</td>' +
                '<td>'+segment.histogram_4+'</td>' +
                '<td>'+segment.histogram_5+'</td>' +
                '<td>'+segment.histogram_6+'</td>' +
                '<td>'+segment.histogram_7+'</td>' +
                '<td>'+segment.histogram_8+'</td>' +
                '<td>'+segment.histogram_9+'</td>' +
                '<td>'+segment.normalized_histogram_0+'</td>' +
                '<td>'+segment.normalized_histogram_1+'</td>' +
                '<td>'+segment.normalized_histogram_2+'</td>' +
                '<td>'+segment.normalized_histogram_3+'</td>' +
                '<td>'+segment.normalized_histogram_4+'</td>' +
                '<td>'+segment.normalized_histogram_5+'</td>' +
                '<td>'+segment.normalized_histogram_6+'</td>' +
                '<td>'+segment.normalized_histogram_7+'</td>' +
                '<td>'+segment.normalized_histogram_8+'</td>' +
                '<td>'+segment.normalized_histogram_9+'</td>' +
                '</tr>');
        }

        var left_segments = allslices[ node_id ].segments_left;
        $('#segmentstable').append('<tr>'+
            '<td>segments left</td>' +
            '<td>origin_section</td>' +
            '<td>id</td>' +
            '<td>t</td>' +
            '<td>dir</td>' +
            '<td>target ids</td>' +
            '<td>cost</td>' +
            '<td>center_distance</td>' +
            '<td>set_difference</td>' +
            '<td>set_difference_ratio</td>' +
            '<td>aligned_set_difference</td>' +
            '<td>aligned_set_difference_ratio</td>' +
            '<td>size</td>' +
            '<td>overlap</td>' +
            '<td>overlap_ratio</td>' +
            '<td>aligned_overlap</td>' +
            '<td>aligned_overlap_ratio</td>' +
            '<td>average_slice_distance</td>' +
            '<td>max_slice_distance</td>' +
            '<td>aligned_average_slice_distance</td>' +
            '<td>aligned_max_slice_distance</td>' +
            '<td>histogram_0</td>' +
            '<td>histogram_1</td>' +
            '<td>histogram_2</td>' +
            '<td>histogram_3</td>' +
            '<td>histogram_4</td>' +
            '<td>histogram_5</td>' +
            '<td>histogram_6</td>' +
            '<td>histogram_7</td>' +
            '<td>histogram_8</td>' +
            '<td>histogram_9</td>' +
            '<td>normalized_histogram_0</td>' +
            '<td>normalized_histogram_1</td>' +
            '<td>normalized_histogram_2</td>' +
            '<td>normalized_histogram_3</td>' +
            '<td>normalized_histogram_4</td>' +
            '<td>normalized_histogram_5</td>' +
            '<td>normalized_histogram_6</td>' +
            '<td>normalized_histogram_7</td>' +
            '<td>normalized_histogram_8</td>' +
            '<td>normalized_histogram_9</td>' +
            '</tr>');
        for(var i=0; i<left_segments.length; i++ ) {
            // only for continuations
            var sliceimage = '';
            var segment = get_segment( left_segments[i] );

            if( segment.segmenttype === 2 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.origin_section,
                        segment.origin_slice_id) + '" >';
            } else if( segment.segmenttype === 3 ) {
                 sliceimage = '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.target_section,
                        segment.target1_slice_id) + '" ><br />' +
                    '<img style="width: 100%;" src="' +
                    get_slice_image_url_from_section_and_slice( segment.target_section,
                        segment.target2_slice_id) + '" >';
            }
            var star = "";
            if( i == allslices[ node_id ].selected_segment_left )
                star = "(*)";
            $('#segmentstable').append('<tr>'+
                //'<td>'+segment.segmentid+'</td>' +
                '<td style="background-color:#000000">'+sliceimage+'</td>' +
                '<td>'+segment.origin_section+'//'+segment.origin_slice_id+'</td>' +
                '<td>'+segment.segmentid+star+'</td>' +
                '<td>'+segment.segmenttype+'</td>' +
                '<td>'+segment.direction+'</td>' +
                '<td>'+segment.target_section+'//'+segment.target1_slice_id+','+segment.target2_slice_id+'</td>' +
                '<td>'+segment.cost+'</td>' +
                '<td>'+segment.center_distance+'</td>' +
                '<td>'+segment.set_difference+'</td>' +
                '<td>'+segment.set_difference_ratio+'</td>' +
                '<td>'+segment.aligned_set_difference+'</td>' +
                '<td>'+segment.aligned_set_difference_ratio+'</td>' +
                '<td>'+segment.size+'</td>' +
                '<td>'+segment.overlap+'</td>' +
                '<td>'+segment.overlap_ratio+'</td>' +
                '<td>'+segment.aligned_overlap+'</td>' +
                '<td>'+segment.aligned_overlap_ratio+'</td>' +
                '<td>'+segment.average_slice_distance+'</td>' +
                '<td>'+segment.max_slice_distance+'</td>' +
                '<td>'+segment.aligned_average_slice_distance+'</td>' +
                '<td>'+segment.aligned_max_slice_distance+'</td>' +
                '<td>'+segment.histogram_0+'</td>' +
                '<td>'+segment.histogram_1+'</td>' +
                '<td>'+segment.histogram_2+'</td>' +
                '<td>'+segment.histogram_3+'</td>' +
                '<td>'+segment.histogram_4+'</td>' +
                '<td>'+segment.histogram_5+'</td>' +
                '<td>'+segment.histogram_6+'</td>' +
                '<td>'+segment.histogram_7+'</td>' +
                '<td>'+segment.histogram_8+'</td>' +
                '<td>'+segment.histogram_9+'</td>' +
                '<td>'+segment.normalized_histogram_0+'</td>' +
                '<td>'+segment.normalized_histogram_1+'</td>' +
                '<td>'+segment.normalized_histogram_2+'</td>' +
                '<td>'+segment.normalized_histogram_3+'</td>' +
                '<td>'+segment.normalized_histogram_4+'</td>' +
                '<td>'+segment.normalized_histogram_5+'</td>' +
                '<td>'+segment.normalized_histogram_6+'</td>' +
                '<td>'+segment.normalized_histogram_7+'</td>' +
                '<td>'+segment.normalized_histogram_8+'</td>' +
                '<td>'+segment.normalized_histogram_9+'</td>' +
                '</tr>');
        }

    }

    this.visualize_assembly = function( high_res ) {
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
                    bb_center_x: slice.bb_center_x(),
                    bb_center_y: slice.bb_center_y(),
                    sectionindex: slice.sectionindex,
                    bbwidth: slice.max_x-slice.min_x,
                    bbheight: slice.max_y-slice.min_y,
                    url: slice.get_slice_image_url()
                })
            }
        }

        // pass it to webgl app (which adds the assembly to the scene)
        WebGLApp.addAssembly( assembly_data, high_res );
    }

    this.delete_active_slice = function( status ) {
        //console.log('delete active slice', current_active_slice)
        // but leave the loaded in memory
        var current_active = self.get_current_active_slice();
        if( !current_active ) {
            console.log('No current active slice to delete');
            return;
        }
        // TODO: update assembly id of associated segments?
        requestQueue.register(django_url + project.id + "/stack/" + get_current_stack().id + '/slice/delete-slice-from-assembly', "GET", {
            sectionindex: current_active.sectionindex,
            sliceid: current_active.slice_id,
            assemblyid: self.current_active_assembly,
            nevershow: status ? 0 : 1
        }, function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {

                            if (e.error) {
                                alert(e.error);
                            } else {
                                self.remove_slice( current_active.node_id );
                                activate_slice( null );
                                update_stack();
                            }
                        }
                    }
                }
        });
    };

    this.next_slice = function( direction ) {
        console.log('next slice', direction)
        if( current_active_slice === null ) {
            console.log('currently no active slice.return');
            return;
        }

        if(!slices_grouping.hasOwnProperty( current_active_slice )) {
            console.log('slices grouping does not have group with key', current_active_slice);
            return;
        }

        var slicelistlength = slices_grouping[ current_active_slice ].slicelist.length
        if( slicelistlength == 1 ) {
            console.log('slice group only contains one element');
            return;
        }

        // increment the iterator index of the group
        var index = slices_grouping[ current_active_slice ].sliceindex;

        var nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;

        for(var idx = 0; idx < nr_elements; idx++) {
            make_invisible( slices_grouping[ current_active_slice ].slicelist[ index ][ idx ] );
        }
        if( direction )
            index++;
        else
            index--;

        if( index < 0) {
            index = 0;
            return;
        } else if( index > slicelistlength - 1 ) {
            index = slicelistlength - 1;
            return;
        }

        if( slices_grouping[ current_active_slice ].segmentslist_fromleft.length > 0 ) {
            // console.log('use segment (fromleft)', slices_grouping[ current_active_slice ].segmentslist_fromleft[ index ] )
            // update the selected_segment_right of the origin slice of this segment
            var tmp_segment = get_segment( slices_grouping[ current_active_slice ].segmentslist_fromleft[ index ] );
            var tmp_slice = get_slice( tmp_segment.origin_node_id );
            // console.log('update slice', tmp_slice.node_id, ' and set selected right segment to', tmp_slice.segments_right.indexOf( tmp_segment.node_id ) );
            tmp_slice.selected_segment_right = tmp_slice.segments_right.indexOf( tmp_segment.node_id );
        }
        
        if( slices_grouping[ current_active_slice ].segmentslist_fromright.length > 0 ) {
            // console.log('use segment (fromright)', slices_grouping[ current_active_slice ].segmentslist_fromright[ index ] )
            var tmp_segment = get_segment( slices_grouping[ current_active_slice ].segmentslist_fromright[ index ] );
            var tmp_slice;
            if( tmp_segment.segmenttype == 2) {
                tmp_slice = get_slice( tmp_segment.target1_node_id );
            } else { // branch segments
                tmp_slice = get_slice( tmp_segment.origin_node_id );
            }
            // console.log('update slice', tmp_slice.node_id, ' and set selected right segment to', tmp_slice.segments_right.indexOf( tmp_segment.node_id ) );
            tmp_slice.selected_segment_left = tmp_slice.segments_left.indexOf( tmp_segment.node_id );
        }

        // define the set of new slices visible
        nr_elements = slices_grouping[ current_active_slice ].slicelist[ index ].length;
        console.log('slicesgrouping for current slice. try to make it visible', slices_grouping[ current_active_slice ], 'index', index);
        for(var idx = 0; idx < nr_elements; idx++) {
            var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ idx ];
            if( idx == 0)
                fetch_slice( new_active_slice, true, true );
            else
                fetch_slice( new_active_slice, false, false );
        }


        // make the first one active and use it as prototype key for the grouping
        var new_active_slice = slices_grouping[ current_active_slice ].slicelist[ index ][ 0 ];
        slices_grouping[ new_active_slice ] = slices_grouping[ current_active_slice ];
        slices_grouping[ new_active_slice ].sliceindex = index;
        delete slices_grouping[ current_active_slice ];

        //activate_slice( new_active_slice );
        //fetch_slice( new_active_slice, true, true )
        update_stack();
    }

    var add_slice = function( slice, is_visible, trigger_update, fetch_segments_for_slice, do_goto_slice ) {
        // console.log('add_slice', slice, is_visible, trigger_update, fetch_segments_for_slice, do_goto_slice);
        var slice = new Slice( slice );
        add_slice_instance( slice );
        slice.fetch_image( trigger_update, fetch_segments_for_slice, is_visible, do_goto_slice )
    }
    self.add_slice = add_slice;

    var fetch_slice = function( node_id, do_goto_slice, fetch_segments_for_slice) {
        // console.log('fetch slide', node_id, '; goto:', do_goto_slice, '; fetch segments', fetch_segments_for_slice);
        var nodeidsplit = inv_cc_slice( node_id );
        // if it does not yet exist, create it and make it visible
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
                            self.add_slice( e[ 0 ], true, true, fetch_segments_for_slice, do_goto_slice );
                        }
                    }
                }
        });

    }

    var make_visible = function( node_id, do_goto_slice ) {
        console.log('make visible', node_id, '; gotoslice', do_goto_slice);
        var nodeidsplit = inv_cc_slice( node_id );
        if( have_slice( node_id ) ) {
            if( !is_slice_visible( nodeidsplit.sectionindex, node_id ) ) {
                make_slice_visible( node_id );
            } else {
                console.log('Slice already in allvisible_slices. do not add', node_id);
            };

            if( do_goto_slice ) {
                goto_slice( node_id, false );
            }

         } else {
            console.log('Slices', node_id, ' does not exist. Cannot make it visible');
         }
    }

    var make_invisible = function( node_id ) {
        var nodeidsplit = inv_cc_slice( node_id );
        if( allvisible_slices[ nodeidsplit.sectionindex ].hasOwnProperty( node_id ) ) {
            delete allvisible_slices[ nodeidsplit.sectionindex ][ node_id ];
        }
    }

    this.remove_slice = function( node_id ) {
        // TODO: updating selected segments to this slice

        // remove from allslices
        if( allslices.hasOwnProperty( node_id ) ) {
            delete allslices[ node_id ];
        } 
        var nodeindex = inv_cc_slice( node_id );
        // remove from allvisible_slices if existing
        if( allvisible_slices.hasOwnProperty( nodeindex.sectionindex )) {
            if( allvisible_slices[ nodeindex.sectionindex].hasOwnProperty(node_id)) {
                delete allvisible_slices[ nodeindex.sectionindex ][ node_id ];
            }
        }
        /*for( var idx in allvisible_slices ) {
            if( allvisible_slices[ idx ].hasOwnProperty( node_id ) ) {
                delete allvisible_slices[ idx ][ node_id ];
            }             
        }*/
        // TODO: for a branch node with 2 slices, do not delete both, only the selected on
        // from all groupings. caveat: node_id might not be the prototype key on with
        // the groupings is based, so we need to iterate all to make sure we delete it
        // (this changes the semantic if it was selected based on a branch segment, thus
        // we need to make sure that the branch segment becomes invalid later), i.e.
        // in find_loose end the condition that all exists should hold for all associated slices
        // of a segment in order to keep it!
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
        slices_grouping[ prototype_slice ]['segmentslist_fromleft'] = [];
        slices_grouping[ prototype_slice ]['segmentslist_fromright'] = [];
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
                self.add_slice( result[sidx], true, true, false, false );
                activate_slice( result[sidx] );
                prototype_slice = result[sidx].node_id;
                slices_grouping[ prototype_slice ] = {};
                slices_grouping[ prototype_slice ]['slicelist'] = [];
                slices_grouping[ prototype_slice ]['sliceindex'] = 0;
                slices_grouping[ prototype_slice ]['slicelist'].push( [ prototype_slice ] );
                slices_grouping[ prototype_slice ]['segmentslist_fromleft'] = [];
                slices_grouping[ prototype_slice ]['segmentslist_fromright'] = [];
            } else {
                self.add_slice( result[sidx], false, false, false, false );
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

    function Segment( segment )
    {
        var self = this;

        this.segmentid = segment.segmentid;
        this.node_id = ""+segment.origin_section+"_"+segment.target_section+"-"+segment.segmentid;
        this.origin_node_id = ""+segment.origin_section+"_"+segment.origin_slice_id;
        this.target1_node_id = ""+segment.target_section+"_"+segment.target1_slice_id;
        if( segment.target2_slice_id )
            this.target2_node_id = ""+segment.target_section+"_"+segment.target2_slice_id;
        this.assembly_id = segment.assembly_id;
        this.segmenttype = segment.segmenttype;
        this.origin_section = segment.origin_section;
        this.origin_slice_id = segment.origin_slice_id;
        this.target_section = segment.target_section;
        this.target1_slice_id = segment.target1_slice_id;
        this.target2_slice_id = segment.target2_slice_id;
        this.direction = segment.direction;

        // TODO: simplify with a for loop
        this.cost= segment.cost;
        this.center_distance= segment.center_distance;
        this.set_difference= segment.set_difference;
        this.set_difference_ratio= segment.set_difference_ratio;
        this.aligned_set_difference= segment.aligned_set_difference;
        this.aligned_set_difference_ratio= segment.aligned_set_difference_ratio;
        this.size= segment.size;
        this.overlap= segment.overlap;
        this.overlap_ratio= segment.overlap_ratio;
        this.aligned_overlap= segment.aligned_overlap;
        this.aligned_overlap_ratio= segment.aligned_overlap_ratio;
        this.average_slice_distance= segment.average_slice_distance;
        this.max_slice_distance= segment.max_slice_distance;
        this.aligned_average_slice_distance= segment.aligned_average_slice_distance;
        this.aligned_max_slice_distance= segment.aligned_max_slice_distance;
        this.histogram_0= segment.histogram_0;
        this.histogram_1= segment.histogram_1;
        this.histogram_2= segment.histogram_2;
        this.histogram_3= segment.histogram_3;
        this.histogram_4= segment.histogram_4;
        this.histogram_5= segment.histogram_5;
        this.histogram_6= segment.histogram_6;
        this.histogram_7= segment.histogram_7;
        this.histogram_8= segment.histogram_8;
        this.histogram_9= segment.histogram_9;
        this.normalized_histogram_0= segment.normalized_histogram_0;
        this.normalized_histogram_1= segment.normalized_histogram_1;
        this.normalized_histogram_2= segment.normalized_histogram_2;
        this.normalized_histogram_3= segment.normalized_histogram_3;
        this.normalized_histogram_4= segment.normalized_histogram_4;
        this.normalized_histogram_5= segment.normalized_histogram_5;
        this.normalized_histogram_6= segment.normalized_histogram_5;
        this.normalized_histogram_7= segment.normalized_histogram_6;
        this.normalized_histogram_8= segment.normalized_histogram_7;
        this.normalized_histogram_9= segment.normalized_histogram_8;

    }

    function Slice( slice )
    {
        var self = this;

        this.assembly_id = slice.assembly_id;
        this.sectionindex = slice.sectionindex;
        this.slice_id = slice.slice_id; // int id is a zero-based index relative to the section
        this.node_id = slice.node_id; // convention: {sectionindex}_{slide_id}
        this.min_x = slice.min_x;
        this.min_y = slice.min_y;
        this.max_x = slice.max_x;
        this.max_y = slice.max_y;
        this.center_x = slice.center_x; // actual pixel-based slice center, different from bounding box center
        this.center_y = slice.center_y;
        this.threshold = slice.threshold;
        this.size = slice.threshold;
        this.status = slice.status;
        this.flag_left = slice.flag_left;
        this.flag_right = slice.flag_right;
        this.img = null;
        this.segments_left = new Array();
        this.selected_segment_left = null;
        this.segments_right = new Array();
        this.selected_segment_right = null;

        this.fetch_image = function( trigger_update, fetch_segments_for_slice, is_visible, do_goto_slice ) {
            // console.log('fetch image: trigger_update:', trigger_update, 'fetch_segments_for_slice', fetch_segments_for_slice, 'is_visible', is_visible, 'do_goto_slice', do_goto_slice)
            fabric.Image.fromURL(self.get_slice_image_url(), function(img)
            {
                self.img = img;
                self.img.perPixelTargetFind = true;
                self.img.targetFindTolerance = 4;
                self.img.hasControls = false;
                self.img.hasBorders = false;
                self.img.set('selectable', true)
                self.img.lockMovementX = self.img.lockMovementY = true;
                self.img.slice = self; // store a reference from the img to the slice

                if( is_visible ) {
                    make_visible( slice.node_id, do_goto_slice );
                }

                if( fetch_segments_for_slice ) {
                    fetch_all_segments( self.node_id );
                }

                if ( trigger_update ) {
                    update_stack();
                }                 
                    
            });
        };

        /*
        ** Fetch connected segments of this slices
        ** and initialize segments_{left|right} object
        */
        this.fetch_segments = function ( for_right, callback ) {
            // console.log('fetch segments:', for_right, callback );
            // do not fetch segments if already fetched
            if(self.segments_right.length > 0 || self.segments_left.length > 0) {
                console.log('already existing segments', self.segments_right, self.selected_segment_right, self.segments_left, self.selected_segment_left);
                if (callback && typeof(callback) === "function") {
                    // execute the callback, passing parameters as necessary
                    callback();
                }
                return;
            }
            var fetchurl;
            if( for_right )
                fetchurl = django_url + project.id + "/stack/" + get_current_stack().id + '/segments-for-slice-right';
            else
                fetchurl = django_url + project.id + "/stack/" + get_current_stack().id + '/segments-for-slice-left';
            requestQueue.register(fetchurl, "GET", {
                sliceid: self.slice_id,
                sectionindex: self.sectionindex
            }, function (status, text, xml) {
                    if (status === 200) {
                        if (text && text !== " ") {
                            var e = $.parseJSON(text, allow_nan=true);
                            if (e.error) {
                                alert(e.error);
                            } else {
                                console.log('found segments (for right:', for_right, ') :', e);
                                if( e.length == 0 ) {
                                    
                                    if( for_right ) {
                                        self.flag_right = 2;
                                        console.log('flag right with 2')
                                    } else {
                                        self.flag_left = 2;
                                        console.log('flag left with 2')
                                    }
                                        
                                }
                                for(var idx in e) {

                                    var newsegment = new Segment( e[idx] );
                                    add_segment_instance( newsegment );

                                    if( for_right ) {
                                        console.log('push to right', newsegment.node_id )
                                        self.segments_right.push( newsegment.node_id );
                                        // not automatically select segmetn
                                        /*if( !self.selected_segment_right ) {
                                            self.selected_segment_right = 0;
                                        } */                                           
                                    } else {
                                        console.log('push to left', newsegment.node_id )
                                        self.segments_left.push( newsegment.node_id );
                                        /*if( !self.selected_segment_left )
                                            self.selected_segment_left = 0;*/
                                    }
                                }

                                if (callback && typeof(callback) === "function") {
                                    // execute the callback, passing parameters as necessary
                                    callback();
                                } 
                                
                                self.automatic_propagate( for_right );

                            }
                        }
                    }
            });
        };

        this.automatic_propagate = function( for_right ) {
                // if automated fetching is on and conditions hold, move to the next!
                if( self.segments_right.length > 0) {
                    // if there are segments to the right, select the first one
                    self.selected_segment_right = 0;
                }
                if( automatic_propagation && propagation_counter > 0 && self.segments_right.length > 0 && for_right ) {
                    console.log('automatic propagation!')
                    var seg = get_segment( self.get_current_right_segment() );
                    console.log('along selected segment: ', seg)
                    if( seg !== undefined ) { 
                        // undefined should never happen because we check in the if statement whether
                        // there are right segments at all
                        console.log('choosen segment to propagate to right is', seg );
                        propagation_counter--;
                        console.log('propgation counter: ', propagation_counter)
                        if( seg.cost < 10 ) {
                            // arbitrary tests can be incorporated here or directly in the
                            // backend functions in slice.py where we filter the fetched segments
                            self.add_slicesgroup_for_selected_segment( true, 0 );
                        }
                    }
                }
        }

        this.add_slices_group_from_segments_new = function( to_right, selected_segment_index ) {
            var selected_segment_index, segments;

            if( to_right ) {
                if( selected_segment_index === undefined ) {
                    selected_segment_index = self.selected_segment_right;
                    console.log('use selected segment right', selected_segment_index);
                }
                segments = self.segments_right;
            } else {
                if( selected_segment_index === undefined ) {
                    selected_segment_index = self.selected_segment_right;
                    console.log('use selected segment left', selected_segment_index);
                }
                // selected_segment_index = self.selected_segment_left;
                segments = self.segments_left;
            }
            var selected_segment = get_segment( segments[ selected_segment_index ] );
            if( selected_segment === undefined ) {
                console.log('no segments found, cannot add');
                return [];
            }
            var prototype_slice, slices_to_add;
            if( to_right ) {
                prototype_slice = selected_segment.target1_node_id;
                if( selected_segment.segmenttype == 2 ) {
                    slices_to_add = [ prototype_slice ];
                } else {
                    slices_to_add = [ selected_segment.target1_node_id, selected_segment.target2_node_id ];
                }
                
            } else {
                console.log('!!!slices group is to the left. type is', selected_segment.segmenttype, selected_segment);
                if( selected_segment.segmenttype == 2 ) {
                    prototype_slice = selected_segment.origin_node_id;
                    slices_to_add = [ prototype_slice ]
                } else {
                    // it is a branch segment that has the origin section lower than target section
                    prototype_slice = selected_segment.target1_node_id;
                    slices_to_add = [ selected_segment.target1_node_id, selected_segment.target2_node_id ];
                }
            }
            // console.log('is it equal?', prototype_slice, cc_slice(selected_segment.target_section,selected_segment.target1_slice_id) )
            // TODO: also add the corresponding edges
            slices_grouping[ prototype_slice ] = {};
            slices_grouping[ prototype_slice ]['slicelist'] = [];
            slices_grouping[ prototype_slice ]['sliceindex'] = 0;
            slices_grouping[ prototype_slice ]['slicelist'].push( slices_to_add );
            slices_grouping[ prototype_slice ]['segmentslist_fromright'] = [];
            slices_grouping[ prototype_slice ]['segmentslist_fromleft'] = [];
            if( to_right )
                slices_grouping[ prototype_slice ]['segmentslist_fromleft'].push( selected_segment.node_id );
            else
                slices_grouping[ prototype_slice ]['segmentslist_fromright'].push( selected_segment.node_id );

            var tmp_segment;
            for (var sidx = 0; sidx < segments.length; sidx++) {
                if( sidx !== selected_segment_index ) {
                    tmp_segment = get_segment( segments[ sidx ] )
                    if( to_right ) {
                        // add the associated segment to be able to update the selected segment of the original slice
                        slices_grouping[ prototype_slice ]['segmentslist_fromleft'].push( tmp_segment.node_id );
                        if( tmp_segment.segmenttype === 2) {
                            slices_grouping[ prototype_slice ]['slicelist'].push( [ tmp_segment.target1_node_id ] );
                        } else if( tmp_segment.segmenttype === 3) {
                            slices_grouping[ prototype_slice ]['slicelist'].push( [ tmp_segment.target1_node_id, tmp_segment.target2_node_id ] );
                        } else {
                            console.log('unknown segment type');
                        }
                    } else {
                        slices_grouping[ prototype_slice ]['segmentslist_fromright'].push( tmp_segment.node_id );
                        if( tmp_segment.segmenttype === 2) {
                            slices_grouping[ prototype_slice ]['slicelist'].push( [ tmp_segment.origin_node_id ] );
                        } else if( tmp_segment.segmenttype === 3) {
                            slices_grouping[ prototype_slice ]['slicelist'].push( [ tmp_segment.target1_node_id, tmp_segment.target2_node_id ] );
                        } else {
                            console.log('unknown segment type');
                        }
                    }
                } 
            }
            return slices_to_add;
        }

       /* this.add_slicesgroup_for_selected_segment = function( for_right, selected_segment ) {
            console.log('add slicesgroup for selected segment',selected_segment, ' to right: ', for_right);
            if( for_right ) {
                console.log('toright call fetch segments')
                self.fetch_segments( for_right, function() {
                    console.log('callbackfunction after fetch segments to right');
                })
            } else {
                self.fetch_segments( for_right, function() {
                    console.log('callbackfunction after fetch segments to left');
                })
            }
            return;
            var proto_node_id;
            if ( for_right ) {
                if( self.flag_right === 2 ) {
                    console.log('no segment exist to the right. press "e" (added continuation/branch TODO) to mark as end to the right and add a new slice');
                    return;
                }
                // select the segment
                self.selected_segment_right = selected_segment;
                slices_to_add = self.add_slices_group_from_segments_new( true );

            } else {
                if( self.flag_left === 2 ) {
                    console.log('no segment exist to the left. press "w" (added continuation/branch TODO) to mark as end to the left and add a new slice');
                    return;
                }
                self.selected_segment_left = selected_segment;
                slices_to_add = self.add_slices_group_from_segments_new( false );

            }
            if( slices_to_add.length == 1 ) {
                fetch_slice( slices_to_add[0], true, true); // goto and fetch segments
            } else {
                // if a branch segment is the continuation
                fetch_slice( slices_to_add[0], true, true); // goto and fetch segments
                fetch_slice( slices_to_add[1], false, true); // goto and fetch segments
            }            
            
        }*/

        this.add_slicesgroup_for_selected_segment = function( for_right ) {
            console.log('add slicesgroup for selected segment to right: ', for_right);
            if( for_right ) {
                if( self.flag_right === 2 ) {
                    console.log('no segment exist to the right. press "e" (added continuation/branch TODO) to mark as end to the right and add a new slice');
                    return;
                }
                if( self.selected_segment_right === null ) {
                    self.fetch_segments( for_right, function() {
                        console.log('callbackfunction after fetch segments to right', self);
                        slices_to_add = self.add_slices_group_from_segments_new( true, 0 ); // select the segment 0
                        if( slices_to_add == 0 ) {
                            console.log('do not add a new slice group because no segments available')
                        } else if( slices_to_add.length == 1 ) {
                            fetch_slice( slices_to_add[0], true, false); // goto and fetch segments
                        } else {
                            // if a branch segment is the continuation
                            fetch_slice( slices_to_add[0], true, false); // goto and fetch segments
                            fetch_slice( slices_to_add[1], false, false); // goto and fetch segments
                        }
                    })                    
                } else {
                    console.log('right segment already selected', self.selected_segment_right)
                    // select the segment
                    // self.selected_segment_right = selected_segment;
                    slices_to_add = self.add_slices_group_from_segments_new( true ); // right segment already selected, not overwrite
                    // console.log('automatic propgation is', automatic_propagation)
                    if( slices_to_add == 0 ) {
                        console.log('do not add a new slice group because no segments available')
                    } else if( slices_to_add.length == 1 ) {
                        fetch_slice( slices_to_add[0], true, automatic_propagation); // goto and fetch segments
                    } else {
                        // if a branch segment is the continuation
                        fetch_slice( slices_to_add[0], true, automatic_propagation); // goto and fetch segments
                        fetch_slice( slices_to_add[1], false, automatic_propagation); // goto and fetch segments
                    }     
                }
            } else {
                if( self.flag_left === 2 ) {
                    console.log('no segment exist to the left. press "w" (added continuation/branch TODO) to mark as end to the left and add a new slice');
                    return;
                }
                if( self.selected_segment_left === null ) {
                  self.fetch_segments( for_right, function() {
                        console.log('callbackfunction after fetch segments to left', self);
                        slices_to_add = self.add_slices_group_from_segments_new( false, 0 );
                        if( slices_to_add == 0 ) {
                            console.log('do not add a new slice group because no segments available')
                        } else if( slices_to_add.length == 1 ) {
                            fetch_slice( slices_to_add[0], true, true); // goto and fetch segments
                        } else {
                            // if a branch segment is the continuation
                            fetch_slice( slices_to_add[0], true, true); // goto and fetch segments
                            fetch_slice( slices_to_add[1], false, true); // goto and fetch segments
                        }
                    })
                } else {
                    slices_to_add = self.add_slices_group_from_segments_new( false );
                    if( slices_to_add == 0 ) {
                            console.log('do not add a new slice group because no segments available')
                    } else if( slices_to_add.length == 1 ) {
                        fetch_slice( slices_to_add[0], true, automatic_propagation); // goto and fetch segments
                    } else {
                        // if a branch segment is the continuation
                        fetch_slice( slices_to_add[0], true, automatic_propagation); // goto and fetch segments
                        fetch_slice( slices_to_add[1], false, automatic_propagation); // goto and fetch segments
                    }
                }                
            }
            return;
            var proto_node_id;
            if ( for_right ) {

            } else {


            }
       
            
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
                generate_path_for_slice( this.sectionindex, this.slice_id ) + '.' +
                slice_filename_extension;
        };

        this.get_slice_relative_image_url = function() {
            return generate_path_for_slice( this.sectionindex, this.slice_id ) + '.' +
                slice_filename_extension;
        };

        this.width = function() {
            return this.max_x - this.min_x; };

        this.height = function() {
            return this.max_y - this.min_y; };

        this.bb_center_x = function() {
            return Math.round(this.min_x + (this.max_x - this.min_x) / 2); };

        this.bb_center_y = function() {
            return Math.round(this.min_y + (this.max_y - this.min_y) / 2); };

    }

}