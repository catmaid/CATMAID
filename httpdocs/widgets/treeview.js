var treeview_loaded;

initTreeview = function(pid) {

	$("#treeview").jstree({
		"json_data" : {
			"ajax" : {
				"url" : 'model/skeleton.list.php?pid='+pid,
				},
			"progressive_render" : true
		},
		"ui" : {
			"select_limit" : -1,
			"select_multiple_modifier" : "ctrl",
			"selected_parent_close" : "deselect",
		},
		"core" : { html_titles : false},
		"plugins" : [ "themes", "json_data", "ui"],
		"themes" : {
			"theme" : "apple",
			"url" : "widgets/themes/kde/jsTree/apple/style.css",
			"dots" : true,
			"icons" : true
		},
	});
	

	// handlers


}



