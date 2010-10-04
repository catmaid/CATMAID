instance_selection = {};

initObjectTree = function(pid) {

	// id of object tree
	object_tree_id = "#tree_object";
	
	$("#refresh").click(function () {
		// how to refresh the whole tree?
		console.log("refresh tree"); 
	});

	$("#show_treenodes").click(function () { 
		// call treenode table for selected objects
		
		selectedObjects['instance_tree'] = instance_selection;
		console.log("Updated selected objects", selectedObjects);
		
		// XXX: here comes the invocation of the data table in another widget
	});
	
	$(object_tree_id).jstree({
		"core" : { "html_titles" : false},
		"plugins" : [ "themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
		"json_data" : {
			"ajax" : {
				"url" : 'model/tree.object.list.php?pid='+pid,
				},
			"progressive_render" : true
		},
		"ui" : {
			"select_limit" : -1,
			"select_multiple_modifier" : "ctrl",
			"selected_parent_close" : "deselect",
		},
		"themes" : {
			"theme" : "apple",
			"url" : "widgets/themes/kde/jsTree/apple/style.css",
			"dots" : true,
			"icons" : true
		},
		"contextmenu" : {
			
			"items" : function(obj) {
			var id_of_node = obj.attr("id");
			var type_of_node = obj.attr("rel");
			var menu = {};
			if(type_of_node == "neuron") {
				menu = {
					"create" : {
						"separator_before"	: false,
						"separator_after"	: true,
						"label"				: "Create skeleton",
						"action"			: function (obj) { this.create(obj); }
					},
					"rename" : {
						"separator_before"	: false,
						"separator_after"	: false,
						"label"				: "Rename neuron",
						"action"			: function (obj) { this.rename(obj); }						
					},
					"remove" : {
						"separator_before"	: false,
						"icon"				: false,
						"separator_after"	: false,
						"label"				: "Remove neuron",
						"action"			: function (obj) { this.remove(obj); }
					},
					"ccp" : false
				}
			} else if (type_of_node == "root" ){
				menu = {
						"create" : {
							"separator_before"	: false,
							"separator_after"	: true,
							"label"				: "Create neuron",
							"action"			: function (obj) { this.create(obj); }
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
			"valid_children" : [ "all" ],
			"types" : {
				// the default type
				"default" : {
					"max_children"	: -1,
					"max_depth"		: -1,
					"valid_children": "all",
	
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
					//"valid_children" : [ "all" ],
					"start_drag" : false,
					"select_node" : false,
					"delete_node" : false,
					"remove" : false

				},
				"neuron" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neuron.png"
					},
					"valid_children" : [ "modelof", "skeleton" ],
					"start_drag" : false,
					
				},
				"skeleton" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/skeleton.png"
					},
					"valid_children" : [ "all" ]
				},
				"synapse" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/synapse.png"
					},
					"valid_children" : [ "all" ],
					"start_drag" : false,
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
		
		if ( id in instance_selection )
		{
			console.log("delete id", id);
			delete instance_selection[id];
		}
		
	});
	
	$(object_tree_id).bind("select_node.jstree", function (event, data) {
		
		console.log("select node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		type = data.rslt.obj.attr("rel");
		
		instance_selection[id] = {'id': id, 'type' : type};

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



