
showTreenodeTable = function(pid) {

	document.getElementById( 'table_widget' ).style.display = 'block'; 				
	ui.onresize();
	$('#treenodetable').dataTable( {
		 "bDestroy": true,
		"bProcessing": true,
		"bServerSide": true,
		"sAjaxSource": 'http://catmaid/model/treenode.list.php?pid='+pid,
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"aoColumnDefs": [ 
		{ "sClass": "center", "aTargets": [ 2 ] },
		{ "sClass": "center", "aTargets": [ 4 ] },
		{ "sClass": "center", "aTargets": [ 5 ] }
		],
	} );
	
}