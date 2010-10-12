initObjectTree = function(pid) {

	// id of object tree
	object_tree_id = "#tree_object";
	
	$("#refresh").click(function () {
		// how to refresh the whole tree?
		console.log("refresh tree"); 
	});
	
	$("#simaddtn").click(function () {
		// simulate adding a treenode in the stack widget
		// thus needs to add a new dangling skeleton
		console.log("simulate adding a new treenode");
		
		$.ajax({
			  url: 'model/treenode.create.php',
			  data : { 'pid' : pid,
					   // 'skeleton_id': 69,
					   'parent_id': 50,
					   'x' : 1000,
					   'y' : 1234,
					   'z' : 1,
					   'radius' : 3,
					   'confidence' : 5},
			  dataType : 'json',
			  success: function(data) {
			  	console.log("ajax returned.");
			  }
			});
		
	});

	$("#show_treenodes").click(function () { 
		// call treenode table for selected objects
		// selectedObjects['tree_object'] = instance_selection;
		// datatables grabs automatically the selected skeletons
		oTable.fnDraw();
		
	});
	
	$(object_tree_id).jstree({
		"core" : { "html_titles" : false},
		"plugins" : [ "themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
		"json_data" : { 
			// I chose an ajax enabled tree - again - as this is most common, and maybe a bit more complex
			// All the options are the same as jQuery's except for `data` which CAN (not should) be a function
			"ajax" : {
				// the URL to fetch the data
				"url" : "model/tree.object.list.php",
				// this function is executed in the instance's scope (this refers to the tree instance)
				// the parameter is the node being loaded (may be -1, 0, or undefined when loading the root nodes)
				"data" : function (n) {
					// depending on which type of node it is, display those
					// the result is fed to the AJAX request `data` option
					return { 
						"pid" : pid,
						"parentid" : n.attr ? n.attr("id").replace("node_","") : 0,
						
					}; 
				}
			},
			//"progressive_render" : true
		},
		"ui" : {
			"select_limit" : -1,
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
						}
				}
			}
			return menu;
		}

		},
		"crrm" : {
			"move" : {
				"always_copy" : true,
				"check_move" : function (m) { 
					
					// allow neuron (class) -> root (object tree)
					// add to database
					// .o (the node being moved) -> id => class_id
					// .r (the node moved to, root in this case), later can be any "part-of" node?
					
					if( m.o.attr("rel") == "neuron" )
					{
						//console.log("original node is neuron");
						
						// target node has to be root
						if( m.r.attr("rel") == "root")
						{
							// neuron -> root
							return true;
						}
						return false;
						
					} else if ( m.o.attr("rel") == "skeleton" )
					{
						// console.log("original node is skeleton");
						return false;
					} 
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
	
					// Bound functions - you can bind any other function here (using boolean or function)
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
		console.log("Deselect node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		
		if ( id in project.selectedObjects['tree_object'] )
		{
			console.log("delete id", id);
			delete project.selectedObjects['tree_object'][id];
		}
		
	});
	
	$(object_tree_id).bind("select_node.jstree", function (event, data) {
		
		console.log("select node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		type = data.rslt.obj.attr("rel");
		
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
		
		console.log("moved"); 
		
		// update skeleton in database, relating it to its neuron
		console.log(data.rslt.o.attr("id"));
		console.log(data.rslt.r.attr("id"));
		
		src = data.rslt.o;
		ref = data.rslt.r;
		
		if( src.attr("rel") == "neuron" )
		{
			// neuron -> root
			if( ref.attr("rel") == "root" )
			{
				// XXX: next: instance.operation.php
				
				// class_id, pid, userid, src
				// automatically generate a name?
				// callback: 1) what is the id, 2) the name?
				
			}
		}
		else if( src.attr("rel") == "skeleton" )
		{
			$.ajax({
				async : false,
				type: 'POST',
				url: "/model/instance.operation.php",
				data : { 
					"operation" : "move_skeleton", 
					"src" : src.attr("id").replace("node_",""), 
					"ref" : ref.attr("id").replace("node_",""), 
					"pid" : pid
				},
				success : function (r) {
					if(!r.status) {
						$.jstree.rollback(data.rlbk);
						console.log("rollback");
					}
					else {
						console.log("ok");
						// XXX: we should refresh the table here!
						// move node to has models
						/*
						$(data.rslt.oc).attr("id", "node_" + r.id);
						if(data.rslt.cy && $(data.rslt.oc).children("UL").length) {
							data.inst.refresh(data.inst._get_parent(data.rslt.oc));
						}*/
					}
				}
			});
		}
		
	});
		
}



