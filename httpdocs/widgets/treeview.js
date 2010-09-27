var treeview_loaded;

initTreeview = function(pid) {

	$("#add_neuron").click(function () { 
		$("#treeview").jstree("create",null,false,"No rename",false,true); 
	});

	
	$("#treeview").jstree({
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
		"core" : { "html_titles" : false,
					"initially_open" : ["phtml_1"]},
		"plugins" : [ "themes", "json_data", "ui", "crrm"],
		"themes" : {
			"theme" : "apple",
			"url" : "widgets/themes/kde/jsTree/apple/style.css",
			"dots" : true,
			"icons" : true
		},
	});
	

	// handlers


}



