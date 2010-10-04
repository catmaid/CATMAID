var treeview_loaded;
myselection = {};

initObjectTree = function(pid) {

	// id of object tree
	object_tree_id = "#tree_object";
	
	$("#add_neuron").click(function () { 
		console.log("add neuron");
		//$(object_tree_id).jstree("create","#rootnode","first","NeuronX <neuron>",false,false); 
	});

	$("#rename").click(function () { 
		$(object_tree_id).jstree("rename"); 
	});
	
	$("#remove").click(function () { 
		$(object_tree_id).jstree("remove"); 
	});

	$("#show_treenodes").click(function () { 
		// call treenode table for selected objects
		
		selectedObjects['treeview'] = myselection;
		
		// XXX: here comes the invocatiodn of the data table
		initDatatable( "treenode", pid);
		showTreenodeTable();
	});

	
	$(object_tree_id).jstree({
		"core" : { "html_titles" : false},
		"plugins" : [ "themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
		"json_data" : {
			"ajax" : {
				"url" : 'model/treeview.list.php?pid='+pid,
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
		"dnd" : {
			"drag_check" : function (data) {
			
			
			console.log(data);
			/*
			if(data.r.attr("rel") == "neuron") {
				return { 
					after : false, 
					before : false, 
					inside : true 
				};
			}*/
			return true;
			},
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
			*/
		},
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
					"valid_children" : [ "neuron", "skeleton" ],
					"start_drag" : false,
					"select_node" : false,
					"delete_node" : false,
					"remove" : false

				},
				"neuron" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neuron.png"
					},
					"valid_children" : [ "relation", "skeleton" ],
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
				"relation" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/relation.png"
					},
					"select_node" : function () { return false; },
					"valid_children" : [ "neuron", "skeleton", "synapse" ],
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
		console.log("Treeview loaded");
	});
	
	$(object_tree_id).bind("deselect_node.jstree", function (event, data) {
		console.log("Deselect node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		
		if ( id in myselection )
		{
			console.log("delete id", id);
			delete myselection[id];
		}
		
	});
	
	$(object_tree_id).bind("select_node.jstree", function (event, data) {
		
		console.log("select node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		type = data.rslt.obj.attr("rel");
		
		myselection[id] = {'id': id, 'type' : type};

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
		
		if( src.attr("rel") == "skeleton" )
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



