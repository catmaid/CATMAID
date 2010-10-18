initObjectTree = function(pid) {

	// id of object tree
	object_tree_id = "#tree_object";
	
	$("#refresh_object_tree").click(function () {
		$("#tree_object").jstree("refresh", -1);
	});
	
	$("#simaddtn").click(function () {
		// simulate adding a treenode in the stack widget
		
		var skelid = 0;
		// retrieve skeleton id currently selected
		for(key in project.selectedObjects['tree_object'])
			skelid = key;
		
		if(!skelid) {
			return;
		} else {
		// console.log("adding treenode (root) for skeleton id", skelid);
		
		requestQueue.replace(
				"model/treenode.create.php",
				"POST",
				{
				   'pid' : pid,
				   'skeleton_id': skelid,
				   'parent_id': 0,
				   'x' : 1000,
				   'y' : 1234,
				   'z' : 1,
				   'radius' : 3,
				   'confidence' : 5
				},
				function( status, text, xml )
				{
					if ( status == 200 )
					{
						if ( text && text != " " )
						{
							var jso = $.parseJSON(text);
							
							if ( jso.error )
							{
								alert( jso.error );
							}
							else
							{
								// make treenode_id active
								if ( jso.treenode_id ) {
									project.active_treenode = jso.treenode_id;
								}
								// add it to the visualized objects in the stack
								// i.e. volumetric treenode.list and update view
							}
						}
					}
					return true;
				});
			
		}
		
		
		
		
	});
	
	$(object_tree_id).jstree({
		"core" : { "html_titles" : false},
		"plugins" : [ "themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
		"json_data" : { 
			"ajax" : {
				"url" : "model/tree.object.list.php",
				"data" : function (n) {
					// depending on which type of node it is, display those
					// the result is fed to the AJAX request `data` option
					return { 
						"pid" : pid,
						"parentid" : n.attr ? n.attr("id").replace("node_","") : 0,						
					}; 
				}
			},
			"progressive_render" : true
		},
		"ui" : {
			"select_limit" : 1,
			"select_multiple_modifier" : "ctrl",
			"selected_parent_close" : "deselect",
		},
		"themes" : {
			"theme" : "apple",
			"url" : "widgets/themes/kde/jsTree/neuron/style.css",
			"dots" : true,
			"icons" : true
		},
		"contextmenu" : {
			
			"items" : function(obj) {
			var id_of_node = obj.attr("id");
			var type_of_node = obj.attr("rel");
			var menu = {};
			if (type_of_node == "root" ){
				menu = {
						"create_group" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Create group",
							"action"			: function (obj) {
								att = { "state": "open", 
										"data": "group",
										"attr" : {"rel" : "group", "relname" : "part_of" }
									};
								this.create(obj, "inside", att, null, true); 
							}
						},
						"create_neurongroup" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Create neurongroup",
							"action"			: function (obj) {
								att = { "state": "open", 
										"data": "neurongroup",
										"attr" : {"rel" : "neurongroup", "relname" : "part_of" }
									};
								this.create(obj, "inside", att, null, true); 
							}
						},
						"rename_root" : {
							"separator_before"	: true,
							"separator_after"	: false,
							"label"				: "Rename root",
							"action"			: function (obj) { this.rename(obj); }						
						}
				}
			} else if (type_of_node == "group" ){
				menu = {
						"create_group" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Create group",
							"action"			: function (obj) {
								att = { "state": "open", 
										"data": "group",
										"attr" : {"rel" : "group", "relname" : "part_of" }
									};
								this.create(obj, "inside", att, null, true); 
							}
						},
						"create_neurongroup" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Create neurongroup",
							"action"			: function (obj) {
								att = { "state": "open", 
										"data": "neurongroup",
										"attr" : {"rel" : "neurongroup", "relname" : "part_of" }
									};
								this.create(obj, "inside", att, null, true); 
							}
						},
						"rename_group" : {
							"separator_before"	: true,
							"separator_after"	: false,
							"label"				: "Rename group",
							"action"			: function (obj) { this.rename(obj); }						
						}
				}
			} else if (type_of_node == "neurongroup" ){
				menu = {
						"create_neuron" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Create neuron",
							"action"			: function (obj) {
								att = { "state": "open", 
										"data": "neuron",
										"attr" : {"rel" : "neuron", "relname" : "part_of" }
									};
								this.create(obj, "inside", att, null, true); 
							}
						},
						"rename_neurongroup" : {
							"separator_before"	: true,
							"separator_after"	: false,
							"label"				: "Rename neurongroup",
							"action"			: function (obj) { this.rename(obj); }						
						}
				}
			} else if(type_of_node == "neuron") {
				menu = {
					"create_skeleton" : {
						"separator_before"	: false,
						"separator_after"	: false,
						"label"				: "Create skeleton",
						"action"			: function (obj) {
							att = { "state": "open", 
									"data": "skeleton",
									"attr" : {"rel" : "skeleton", "relname" : "model_of" }
								};
							this.create(obj, "inside", att, null, true); 
						}
					},
					"rename_neuron" : {
						"separator_before"	: true,
						"separator_after"	: false,
						"label"				: "Rename neuron",
						"action"			: function (obj) { this.rename(obj); }						
					},
					"remove_neuron" : {
						"separator_before"	: false,
						"icon"				: false,
						"separator_after"	: false,
						"label"				: "Remove neuron",
						"action"			: function (obj) { this.remove(obj); }
					},
					"ccp" : false
				}
			} else if (type_of_node == "skeleton" ) {
				menu = {
						"rename_skeleton" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Rename skeleton",
							"action"			: function (obj) { this.rename(obj); }						
						},
						"show_treenode" : {
							"separator_before"	: false,
							"separator_after"	: false,
							"label"				: "Show treenodes in table",
							"action"			: function (obj) {
													// deselect all (XXX: only skeletons? context?)
													this.deselect_all();
													// select the node
													this.select_node( obj );
													// datatables grabs automatically the selected skeleton
													oTable.fnDraw();
												  }
						}
				}
			}
			return menu;
		}

		},
		"crrm" : {
			"move" : {
				"always_copy" : false,
				"check_move" : function (m) { 
			
					// valid moves (class - class)
					valid_moves = {
							"group" : ["root", "group"], // part_of
							"neurongroup" : ["root", "group"], // part_of
							"neuron" : ["neurongroup"], // part_of
							"skeleton" : ["neuron"] // model_of
					};
					
					// http://snook.ca/archives/javascript/testing_for_a_v
					function oc(a)
					{
					  var o = {};
					  for(var i=0;i<a.length;i++)
					  {
					    o[a[i]]='';
					  }
					  return o;
					}
					
					srcrel = m.o.attr("rel"); // the node being moved
					dstrel = m.r.attr("rel"); // the node moved to
					
					if( dstrel in oc(valid_moves[srcrel]) )
						return true;
					else
						return false;
					
				}
			}
		},
		/*
		"dnd" : {
			"drag_check" : true,
			/*
			"drop_finish" : function () { 
				console.log("DROP"); 
			},
			"drag_check" : function (data) {
				console.log(data);
				
				if(data.r.attr("rel") == "neuron") {
					return { 
						after : false, 
						before : false, 
						inside : true 
					};
				}
				return false;
			},
			"drag_finish" : function (data) {
				console.log(data.o);
				console.log(data.r);
				console.log("DRAG OK"); 
			}
		},*/
		"types" : {
			"max_depth" : -2,
			"max_children" : -2,
			"valid_children" : [ "group" ],
			"types" : {
				// the default type
				"default" : {
					"valid_children": "none",
					//"select_node"	: false,
					//"open_node"	: true,
					//"close_node"	: true,
					//"create_node"	: true,
					//"delete_node"	: true
				},
				"root" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/root.png"
					},
					"valid_children" : [ "group" ],
					"start_drag" : false,
					"select_node" : false,
					"delete_node" : false,
					"remove" : false
				},
				"group" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/group.png"
					},
					"valid_children" : [ "group", "neurongroup" ],
					"start_drag" : true,
					"select_node" : false,
				},
				"neurongroup" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neurongroup.png"
					},
					"valid_children" : [ "neuron" ],
					"start_drag" : true,
					"select_node" : false,
				},
				"neuron" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neuron.png"
					},
					// XXX: need to discuss
					// "valid_children" : [ "modelof", "presynaptic", "postsynaptic" ],
					"valid_children" : [ "skeleton", "synapse" ],
					"start_drag" : true,
					"select_node" : false,
				},
				"skeleton" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/skeleton.png"
					},
					"valid_children" : [ "none" ],
					 "start_drag" : true,
					 "select_node" : true,
				},
				"synapse" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/synapse.png"
					},
					"valid_children" : [ "none" ],
					"start_drag" : false,
					"select_node" : true,
				},
				"modelof" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/modelof.png"
					},
					"select_node" : function () { return false; },
					"valid_children" : [ "skeleton" ],
					"start_drag" : false,
				},
				"presynaptic" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/presynapse.png"
					},
					"select_node" : function () { return false; },
					"valid_children" : [ "synapse" ],
					"start_drag" : false,
				},
				"postsynaptic" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/postsynapse.png"
					},
					"select_node" : function () { return false; },
					"valid_children" : [ "synapse" ],
					"start_drag" : false,
				}
			}
		}
	});
	
	// handlers
	//	"inst" : /* the actual tree instance */, 
	//	"args" : /* arguments passed to the function */, 
	//	"rslt" : /* any data the function passed to the event */, 
	//	"rlbk" : /* an optional rollback object - it is not always present */
	
	$(object_tree_id).bind("loaded.jstree", function (event, data) {
		console.log("Object tree loaded.");
	});
	
	$(object_tree_id).bind("deselect_node.jstree", function (event, data) {
		// deselection only works when explicitly done by ctrl
		// we get into a bad state when it gets deselected by selecting another node
		
		console.log("deselect node", data);
		
		// remove all previously selected nodes (or push it to the history)
		for(key in project.selectedObjects['tree_object'])
			delete project.selectedObjects['tree_object'][key];
	});
	
	$(object_tree_id).bind("select_node.jstree", function (event, data) {
		
		console.log("select node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		type = data.rslt.obj.attr("rel");
		
		// remove all previously selected nodes (or push it to the history)
		for(key in project.selectedObjects['tree_object'])
			delete project.selectedObjects['tree_object'][key];
		
		project.selectedObjects['tree_object'][id] = {'id': id, 'type' : type};

	});
	
	$(object_tree_id).bind("create.jstree", function (e, data) {

		mynode = data.rslt.obj;
		data = {
			"operation" : "create_node",
			"parentid" : data.rslt.parent.attr("id").replace("node_",""),
			"classname" : data.rslt.obj.attr("rel"),
			"relationname" : data.rslt.obj.attr("relname"),
			"objname" : data.rslt.name,
			"pid" : pid
		};
		
		$.ajax({
			async : false,
			type: 'POST',
			url: "/model/instance.operation.php",
			data : data,
			dataType : 'json',
			success : function (data2) {
				// update node id
				mynode.attr("id", "node_" + data2['class_instance_id']);
			}
		});
		
	});
	
	$(object_tree_id).bind("rename.jstree", function (e, data) {
		
		console.log("rename");
		console.log(data.rslt.obj.attr("id"));
		
		$.post(
			"/model/instance.operation.php", 
			{ 
				"operation" : "rename_node", 
				"id" : data.rslt.obj.attr("id").replace("node_",""),
				"title" : data.rslt.new_name,
				"pid" : pid
			}, null
		);
	});

	$(object_tree_id).bind("remove.jstree", function (e, data) {
		
		treebefore = data.rlbk;
		
		if( confirm('Really remove node?') )
		{
			// XXX: remove node depending on its type?
			// issue 34
			// recursively remove? e.g. group and neurongroup
			// remove treenodes when removing skeleton?
			// what about removing synapses (which are relational?)
			$.post(
					"/model/instance.operation.php", 
					{ 
						"operation" : "remove_node", 
						"id" : data.rslt.obj.attr("id").replace("node_",""),
						"title" : data.rslt.new_name,
						"pid" : pid
					}, null
				);
		} else {
			 $.jstree.rollback(treebefore);
			 return false;
		}
	});
	
	$(object_tree_id).bind("move_node.jstree", function (e, data) {
		
		src = data.rslt.o;
		ref = data.rslt.r;
		
		// the relationship stays the same (otherwise it would not be
		// a valid move), thus we only have to change the parent
		
		$.ajax({
			async : false,
			type: 'POST',
			url: "/model/instance.operation.php",
			data : { 
				"operation" : "move_node", 
				"src" : src.attr("id").replace("node_",""), 
				"ref" : ref.attr("id").replace("node_",""), 
				"pid" : pid
			},
			success : function (r, status) {
				if(r != "True") {
					$.jstree.rollback(data.rlbk);
					// console.log("rollback");
				}
			}
		});
	});
		
}



