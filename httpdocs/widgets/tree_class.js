initClassTree = function(pid) {

	// id of object tree
	object_tree_id = "#tree_class";

	$(object_tree_id).jstree({
		"core" : { "html_titles" : false},
		"plugins" : [ "themes", "json_data", "ui", "types", "dnd", "crrm"],
		"json_data" : {
			"ajax" : {
				"url" : 'model/tree.class.list.php?pid='+pid,
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
			"drop_finish" : function (data) {
				console.log("tree_class: node dropped.");
			},
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
					"valid_children" : [ "modelof", "skeleton" ],
					
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
		console.log("Class tree loaded.");
	});
	
}



