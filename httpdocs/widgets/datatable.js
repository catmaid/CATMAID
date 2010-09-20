var oTable;
var preTable;
var postTable;

var tn_table_loaded;
var pre_table_loaded;
var post_table_loaded;

var asInitVals = new Array();
var asInitValsSyn = new Array();

initDatatable = function (table, pid) {
	
	switch ( table )
	{
	case "treenode":
		if ( !tn_table_loaded )
		{
			initTreenodeTable( pid );
			tn_table_loaded = true;
		}
		showTreenodeTable();
		break;
	case "presynapse":
		if ( !pre_table_loaded )
		{
			initPreSynapseTable( pid );
			pre_table_loaded = true;
		}
		showPreSynapseTable();
		break;
	case "postsynapse":
		if ( !post_table_loaded )
		{
			initPostSynapseTable( pid );
			post_table_loaded = true;
		}
		showPostSynapseTable();
		break;
	}
	
}

showTreenodeTable = function() {
	$('#treenodetable_container').show();
	$('#presynapsetable_container').hide();
	$('#postsynapsetable_container').hide();
};

showPreSynapseTable = function() {
	$('#treenodetable_container').hide();
	$('#presynapsetable_container').show();
	$('#postsynapsetable_container').hide();	
}

showPostSynapseTable = function() {	
	$('#treenodetable_container').hide();
	$('#presynapsetable_container').hide();
	$('#postsynapsetable_container').show();
}

initTreenodeTable = function(pid) {

	oTable = $('#treenodetable').dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"bAutoWidth": false,
		"sAjaxSource": 'model/treenode.list.php?pid='+pid,
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
			selectedObjects[iId] = {tabledata:aData, 'type' : 'treenode'};
		}			
		$(this).toggleClass('row_selected');
	} );
		
}

initPreSynapseTable = function(pid) {
	
	prestr = '1';
	tableid = '#presynapsetable';
	stype = 'presynaptic';

	preTable = $(tableid).dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"bAutoWidth": false,
		"sAjaxSource": 'model/synapse.list.php?pid='+pid+'&pre='+prestr,
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"fnRowCallback": function( nRow, aData, iDisplayIndex ) {
		
			if ( parseInt(aData[5]) in selectedObjects)
			{
				$(nRow).addClass('row_selected');
			}
			return nRow;
		},
		"aoColumns": [
		              {"bSearchable": false, "bSortable" : true}, // name
		              {"bSearchable": false, "bSortable" : true, "sClass": "center"}, // syn to treenodeid
		              {"bSearchable": false}, // username
		              {"bSearchable": true, "bSortable" : false}, // labels
		              {"bSearchable": false, "bSortable" : true}, // last modified
		              {"bVisible": false} // instance_id
		              ]
	} );
	
	$(tableid+" tfoot input").keyup( function () {
		/* Filter on the column (the index) of this element */
		preTable.fnFilter( this.value, $("tfoot input").index(this) );
	} );

	/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in 
	 * the footer
	 */
	$(tableid+" tfoot input").each( function (i) {
		asInitValsSyn[i] = this.value;
	} );

	$(tableid+" tfoot input").focus( function () {
		if ( this.className == "search_init" )
		{
			this.className = "";
			this.value = "";
		}
	} );

	$(tableid+" tfoot input").blur( function (i) {
		if ( this.value == "" )
		{
			this.className = "search_init";
			this.value = asInitValsSyn[$("tfoot input").index(this)];
		}
	} );
	
	$(tableid+" tbody tr").live('click', function () {
		var aData = preTable.fnGetData( this );
		// grab last element, the hidden instance_id
		var iId = parseInt(aData[5]);
		
		if ( iId in selectedObjects)
		{
			delete selectedObjects[iId];
		}
		else
		{
			selectedObjects[iId] = {'tabledata':aData, 'type': stype};
		}
		$(this).toggleClass('row_selected');
	} );
	
}

initPostSynapseTable = function(pid) {

	prestr = '0';
	tableid = '#postsynapsetable';
	stype = 'postsynaptic';

	postTable = $(tableid).dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"bAutoWidth": false,
		"sAjaxSource": 'model/synapse.list.php?pid='+pid+'&pre='+prestr,
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"fnRowCallback": function( nRow, aData, iDisplayIndex ) {

			if ( parseInt(aData[5]) in selectedObjects)
			{
				$(nRow).addClass('row_selected');
			}
			return nRow;
		},
		"aoColumns": [
		              {"bSearchable": false, "bSortable" : true}, // name
		              {"bSearchable": false, "bSortable" : true, "sClass": "center"}, // syn to treenodeid
		              {"bSearchable": false}, // username
		              {"bSearchable": true, "bSortable" : false}, // labels
		              {"bSearchable": false, "bSortable" : true}, // last modified
		              {"bVisible": false} // instance_id
		              ]
	} );
	
	$(tableid+" tfoot input").keyup( function () {
		/* Filter on the column (the index) of this element */
		postTable.fnFilter( this.value, $("tfoot input").index(this) );
	} );

	/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in 
	 * the footer
	 */
	$(tableid+" tfoot input").each( function (i) {
		asInitValsSyn[i] = this.value;
	} );

	$(tableid+" tfoot input").focus( function () {
		if ( this.className == "search_init" )
		{
			this.className = "";
			this.value = "";
		}
	} );

	$(tableid+" tfoot input").blur( function (i) {
		if ( this.value == "" )
		{
			this.className = "search_init";
			this.value = asInitValsSyn[$("tfoot input").index(this)];
		}
	} );
	
	$(tableid+" tbody tr").live('click', function () {
		var aData = postTable.fnGetData( this );
		// grab last element, the hidden instance_id
		var iId = parseInt(aData[5]);
		
		if ( iId in selectedObjects)
		{
			delete selectedObjects[iId];
		}
		else
		{
			selectedObjects[iId] = {'tabledata':aData, 'type': stype};
		}
		$(this).toggleClass('row_selected');
	} );
	
}



