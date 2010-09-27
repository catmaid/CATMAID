var treeview_loaded;

initTreeview = function(pid) {

	$("#add_neuron").click(function () { 
		$("#treeview").jstree("create","#rootnode","first","NeuronX <neuron>",false,false); 
	});

	$("#rename").click(function () { 
		$("#treeview").jstree("rename"); 
	});
	
	$("#treeview").jstree({
		"core" : { "html_titles" : false,
				  "initially_open" : ["#rootnode"]},
		"plugins" : [ "themes", "json_data", "ui", "crrm", "types"],
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
		"types" : {
			"valid_children" : [ "all" ],
			"types" : {
				// the default type
				"default" : {
					"max_children"	: -1,
					"max_depth"		: -1,
					"valid_children": "all",
	
					// Bound functions - you can bind any other function here (using boolean or function)
					"select_node"	: false,
					//"open_node"	: true,
					//"close_node"	: true,
					//"create_node"	: true,
					//"delete_node"	: true
				},
				"neuron" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neuron.png"
					},
					"valid_children" : [ "relation" ]
				},
				"skeleton" : {
					"valid_children" : [ "all" ]
				},
				"relation" : {
					"select_node" : function () {return false;},
					"valid_children" : [ "neuron", "skeleton" ]
				}
			}
		}

	});
	

	// handlers
	$("#treeview").bind("loaded.jstree", function (event, data) {
		console.log("Treeview loaded");
	})
 
//		"inst" : /* the actual tree instance */, 
//		"args" : /* arguments passed to the function */, 
//		"rslt" : /* any data the function passed to the event */, 
//		"rlbk" : /* an optional rollback object - it is not always present */
	
	$("#treeview").bind("rename.jstree", function (e, data) {
		console.log(e, data);
		console.log(data.rslt.obj.attr("id"));
		
		$.post(
			"/model/instance_operation.php", 
			{ 
				"operation" : "rename_node", 
				"id" : data.rslt.obj.attr("id").replace("node_",""),
				"title" : data.rslt.new_name,
				"pid" : pid
			}, null
			/*
			function (r) {
				if(!r.status) {
					$.jstree.rollback(data.rlbk);
				}
			}*/
		);
		
	});

}



