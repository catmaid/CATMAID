var treeview_loaded;

showTreeview = function() {
	

	$("#treeview")
		.bind("open_node.jstree close_node.jstree", function (e) {
			console.log("Last operation: " + e.type);
		})
		.jstree({
			core : { html_titles : false},
			plugins : [ "themes", "html_data"],
			"themes" : {
				"theme" : "apple",
				"url" : "widgets/themes/kde/jsTree/apple/style.css",
				"dots" : false,
				"icons" : false
			},
		});
		
	
	$("#toggle_node").click(function () { 
		$("#treeview").jstree("toggle_node","#phtml_1");
	});

	
}



