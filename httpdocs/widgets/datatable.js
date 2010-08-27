
showTable = function() {

	document.getElementById( 'table_widget' ).style.display = 'block'; 				
	ui.onresize();
	$('#exampletable').dataTable( {
		"bProcessing": true,
		"bServerSide": true,
		"sAjaxSource": 'http://catmaid/model/treenode.list.php?pid=1',
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"aoColumnDefs": [ 
		{ "sClass": "center", "aTargets": [ 2 ] },
		{ "sClass": "center", "aTargets": [ 4 ] },
		{ "sClass": "center", "aTargets": [ 5 ] }
		],
	} );
	
}