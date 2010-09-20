var oTable;
var sTable;
var asInitVals = new Array();
var asInitValsSyn = new Array();

showTreenodeTable = function(pid) {

	$('#treenodetable_container').show();
	$('#presynapsetable_container').hide();
	$('#postsynapsetable_container').hide();

	oTable = $('#treenodetable').dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
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
		console.log("tree");
		var aData = oTable.fnGetData( this );
		
		var iId = parseInt(aData[0]);
		
		if ( iId in selectedObjects )
		{
			console.log("remove", iId);
			delete selectedObjects[iId];
		}
		else
		{
			console.log("add data", iId);
			selectedObjects[iId] = {tabledata:aData, 'type' : 'treenode'};
		}
		
		$(this).toggleClass('row_selected');
		console.log(selectedObjects);
	} );

	
};


showSynapseTable = function(pid, pre) {
	
	$('#treenodetable_container').hide();
	if( pre )
	{
		$('#presynapsetable_container').show();
		$('#postsynapsetable_container').hide();
	}
	else
	{
		$('#presynapsetable_container').hide();
		$('#postsynapsetable_container').show();
	}
	
	if(pre)
	{
		prestr = '1';
		tableid = '#presynapsetable';
		stype = 'presynaptic';
	}
	else
	{
		prestr = '0';
		tableid = '#postsynapsetable';
		stype = 'postsynaptic';
	}
	
	sTable = $(tableid).dataTable( {
		// http://www.datatables.net/usage/options
		"bDestroy": true,
		"sDom" : '<"H"lr>t<"F"ip>', // default: <"H"lfr>t<"F"ip>
		"bProcessing": true,
		"bServerSide": true,
		"sAjaxSource": 'model/synapse.list.php?pid='+pid+'&pre='+prestr,
		"aLengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
		"bJQueryUI": true,
		"fnRowCallback": function( nRow, aData, iDisplayIndex ) {
		console.log("key in ", parseInt(aData[5]) in selectedObjects);
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
		sTable.fnFilter( this.value, $("tfoot input").index(this) );
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
		console.log("syn");
		var aData = sTable.fnGetData( this );
		// grab last element, the hidden instance_id
		
		var iId = parseInt(aData[5]);
		
		if ( iId in selectedObjects)
		{
			console.log("remove data", iId);
			delete selectedObjects[iId];
		}
		else
		{
			console.log("add data", iId);
			selectedObjects[iId] = {'tabledata':aData, 'type': stype};

		}
		
		console.log(selectedObjects);
		
		$(this).toggleClass('row_selected');
	} );
	
};