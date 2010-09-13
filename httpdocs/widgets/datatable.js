var oTable;
var asInitVals = new Array();

showTreenodeTable = function(pid) {

	document.getElementById( 'table_widget' ).style.display = 'block'; 				
	ui.onresize();
	oTable = $('#treenodetable').dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"sAjaxSource": 'http://catmaid/model/treenode.list.php?pid='+pid,
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"oLanguage": {
			"sSearch": "Search all columns:"
		},
		"aoColumns": [
		              {"sClass": "center", "bSearchable": false, "bSortable" : false}, // id
		              {"sClass": "center", "bSearchable": false}, // x
		              {"sClass": "center", "bSearchable": false}, // y
		              {"sClass": "center", "bSearchable": false}, // z
		              {"sClass": "center", "bSearchable": true, "bSortable" : false}, // type
		              {"sClass": "center", "bSearchable": false}, // confidence
		              {"sClass": "center", "bSearchable": false}, // radius
		              {"bSearchable": false}, // username
		              {"bSearchable": true, "bSortable" : false}, // labels
		              ]
	} );
	
	$("tfoot input").keyup( function () {
		/* Filter on the column (the index) of this element */
		oTable.fnFilter( this.value, $("tfoot input").index(this) );
	} );

	/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in 
	 * the footer
	 */

	$("tfoot input").each( function (i) {
		asInitVals[i] = this.value;
	} );

	$("tfoot input").focus( function () {
		if ( this.className == "search_init" )
		{
			this.className = "";
			this.value = "";
		}
	} );

	$("tfoot input").blur( function (i) {
		if ( this.value == "" )
		{
			this.className = "search_init";
			this.value = asInitVals[$("tfoot input").index(this)];
		}
	} );
	
};

