var oTable;
var asInitVals = new Array();

initTreenodeTable = function(pid) {
	
	oTable = $('#treenodetable').dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"bAutoWidth": false,
		"sAjaxSource": 'model/treenode.list.php',
		"fnServerData": function ( sSource, aoData, fnCallback ) {
			
			// add list of skeleton ids to draw
			// retrieve vom selected instance_tree objects
			i = 0;
			for(key in selectedObjects['instance_tree'])
			{
				if( selectedObjects['instance_tree'][key]['type'] == 'skeleton' )
				{
					aoData.push( { "name" : "skeleton_" + i, "value" : key } );
					i = i + 1;
				}
			}
			aoData.push( { "name" : "skeleton_nr", "value" : i } );
			aoData.push( { "name" : "pid", "value" : pid } );
			$.ajax( {
				"dataType": 'json', 
				"type": "POST", 
				"url": sSource, 
				"data": aoData, 
				"success": fnCallback
			} );
		},
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"fnRowCallback": function( nRow, aData, iDisplayIndex ) {
			if ( parseInt(aData[0]) in selectedObjects)
			{
				$(nRow).addClass('row_selected');
			}
			return nRow;
		},
		"aoColumns": [
		              {"sClass": "center", "bSearchable": false, "bSortable" : true}, // id
		              {"sClass": "center", "bSearchable": false}, // x
		              {"sClass": "center", "bSearchable": false}, // y
		              {"sClass": "center", "bSearchable": false}, // z
		              {"sClass": "center", "bSearchable": true, "bSortable" : false}, // type
		              {"sClass": "center", "bSearchable": false}, // confidence
		              {"sClass": "center", "bSearchable": false}, // radius
		              {"bSearchable": false}, // username
		              {"bSearchable": true, "bSortable" : false}, // labels
		              {"bSearchable": false, "bSortable" : true}, // last modified
		              ]
	} );
	
	$("#treenodetable tfoot input").keyup( function () {
		/* Filter on the column (the index) of this element */
		oTable.fnFilter( this.value, $("tfoot input").index(this) );
	} );

	/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in 
	 * the footer
	 */

	$("#treenodetable tfoot input").each( function (i) {
		asInitVals[i] = this.value;
	} );

	$("#treenodetable tfoot input").focus( function () {
		if ( this.className == "search_init" )
		{
			this.className = "";
			this.value = "";
		}
	} );

	$("#treenodetable tfoot input").blur( function (i) {
		if ( this.value == "" )
		{
			this.className = "search_init";
			this.value = asInitVals[$("tfoot input").index(this)];
		}
	} );
	
	$('#treenodetable tbody tr').live('click', function () {

		var aData = oTable.fnGetData( this );
		
		var iId = parseInt(aData[0]);
		
		if ( iId in selectedObjects )
		{
			delete selectedObjects[iId];
		}
		else
		{
			selectedObjects[iId] = {'id': iId, 'tabledata':aData, 'type' : 'treenode'};
			for(key in selectedObjects)
				console.log(key);

		}			
		$(this).toggleClass('row_selected');
	} );
		
}
