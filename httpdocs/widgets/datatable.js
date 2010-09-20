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
			if ( aData[0] in selectedObjects == true)
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
	
	$('tbody tr').live('click', function () {
		
		var aData = oTable.fnGetData( this );
		var iId = aData[0];
		
		console.log(aData);
		
		if ( iId in selectedObjects == false)
		{
			selectedObjects[iId] = {tabledata:aData,
									type = 'treenode'};
		}
		else
		{
			delete selectedObjects[iId];
		}
		
		$(this).toggleClass('row_selected');
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
	}
	else
	{
		prestr = '0';
		tableid = '#postsynapsetable';
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
		"aoColumns": [
		              {"bSearchable": false, "bSortable" : true}, // name
		              {"bSearchable": false, "bSortable" : true, "sClass": "center"}, // syn to treenodeid
		              {"bSearchable": false}, // username
		              {"bSearchable": true, "bSortable" : false}, // labels
		              {"bSearchable": false, "bSortable" : true}, // last modified
		              ]
	} );

	
	$("tfoot input").keyup( function () {
		/* Filter on the column (the index) of this element */
		sTable.fnFilter( this.value, $("tfoot input").index(this) );
	} );

	/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in 
	 * the footer
	 */
	$("tfoot input").each( function (i) {
		asInitValsSyn[i] = this.value;
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
			this.value = asInitValsSyn[$("tfoot input").index(this)];
		}
	} );
	
};