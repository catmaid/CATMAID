var postTable;
var asInitValsSyn = new Array();

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
		"sAjaxSource": 'model/connector.list.php?pid='+pid+'&pre='+prestr,
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
			
			selectedObjects[iId] = {'id': iId, 'tabledata':aData, 'type': stype};
			// console.log(selectedObjects);
			
		}
		$(this).toggleClass('row_selected');
	} );
	
}
