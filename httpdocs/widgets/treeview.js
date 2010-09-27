var treeview_loaded;
myselection = {};

initTreeview = function(pid) {

	$("#add_neuron").click(function () { 
		$("#treeview").jstree("create","#rootnode","first","NeuronX <neuron>",false,false); 
	});

	$("#rename").click(function () { 
		$("#treeview").jstree("rename"); 
	});
	
	$("#remove").click(function () { 
		$("#treeview").jstree("remove"); 
	});

	$("#show_treenodes").click(function () { 
		// call treenode table for selected objects
		
		selectedObjects['treeview'] = myselection;
		
		// XXX: here comes the invocation of the data table
		initDatatable( "treenode", pid);
		showTreenodeTable();
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
					//"select_node"	: false,
					//"open_node"	: true,
					//"close_node"	: true,
					//"create_node"	: true,
					//"delete_node"	: true
				},
				"root" : {
					"valid_children" : [ "neuron", "skeleton" ]
				},
				"neuron" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/neuron.png"
					},
					"valid_children" : [ "relation" ]					
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
					"valid_children" : [ "all" ]
				},
				"relation" : {
					"icon" : {
						"image" : "widgets/themes/kde/jsTree/neuron/relation.png"
					},
					"select_node" : function () {return false;},
					"valid_children" : [ "neuron", "skeleton", "synapse" ]
				}
			}
		}

	});
	

	// handlers
	$("#treeview").bind("loaded.jstree", function (event, data) {
		console.log("Treeview loaded");
	});
	
	$("#treeview").bind("deselect_node.jstree", function (event, data) {
		console.log("Deselect node");
		
		id = data.rslt.obj.attr("id").replace("node_","");
		
		if ( id in myselection )
		{
			delete myselection[id];
		}
		
	});
	
	$("#treeview").bind("select_node.jstree", function (event, data) {
		
		id = data.rslt.obj.attr("id").replace("node_","");
		type = data.rslt.obj.attr("rel");
		
		myselection[id] = {'id': id, 'type' : type};

	});

	
//		"inst" : /* the actual tree instance */, 
//		"args" : /* arguments passed to the function */, 
//		"rslt" : /* any data the function passed to the event */, 
//		"rlbk" : /* an optional rollback object - it is not always present */
	
	$("#treeview").bind("rename.jstree", function (e, data) {
		
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

	$("#treeview").bind("remove.jstree", function (e, data) {
		
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
	
}



