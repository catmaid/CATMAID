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
		"sAjaxSource": 'model/treenode.table.list.php',
		"fnServerData": function ( sSource, aoData, fnCallback ) {
		
			// remove all selected elements in table
			for(key in project.selectedObjects['table_treenode'])
				delete project.selectedObjects['table_treenode'][key];
			
			// add list of skeleton ids to draw
			// retrieve vom selected object_tree objects
			i = 0;
			for(key in project.selectedObjects['tree_object'])
			{
				if( project.selectedObjects['tree_object'][key]['type'] == 'skeleton' )
				{
					aoData.push( { "name" : "skeleton_" + i, "value" : key } );
					i = i + 1;
				}
			}
			aoData.push( { "name" : "skeleton_nr", "value" : i } );
			aoData.push( { "name" : "pid", "value" : pid } );
			
			// send active treenode when set
			if( atn != null && atn.type == "treenode") {
        aoData.push( { "name" : "atnid", "value" : atn.id } );
			}
			
			$.ajax( {
				"dataType": 'json', 
				"type": "POST", 
				"url": sSource, 
				"data": aoData, 
				"success": fnCallback
			} );
		},
		"aLengthMenu": [[10, 100, 200, -1], [10, 100, 200, "All"]],
		"bJQueryUI": true,
		"fnDrawCallback" : function() {
        $('td:eq(5)', oTable.fnGetNodes()).editable( 'model/treenode.table.update.php', {
          "callback": function( sValue, y ) {
          },
          "submitdata": function ( value, settings ) {
            var aPos = oTable.fnGetPosition( this );
            var aData = oTable.fnGetData( aPos[0] );
            return {
              "id" : aData[0],
              "type" : "confidence",
              "pid" : project.id
            };
          },
          "height": "14px"
        } );      
		},
		"fnRowCallback": function( nRow, aData, iDisplayIndex ) {
		  
      if ( aData[4] == "R" )
        $(nRow).addClass('root_node');
      if ( aData[4] == "L" )
        $(nRow).addClass('leaf_node');
      
      if(atn != null) {
        if ( parseInt(aData[0]) == atn.id ) {
          // just to be sure
          $(nRow).removeClass('root_node');
          $(nRow).removeClass('leaf_node');
          // highlight row of active treenode
          $(nRow).addClass('highlight_active');
        }
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
		              {"bSearchable": false, "bSortable" : true} // last modified
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
	  console.log("focus");
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
	
  $("#treenodetable tbody tr").live('dblclick', function() {

    var aData = oTable.fnGetData( this );
    // retrieve coordinates and moveTo
    var x = parseFloat(aData[1]);
    var y = parseFloat(aData[2]);
    var z = parseFloat(aData[3]);
    project.moveTo(z,y,x);
    // XXX: want to active the node, but how? we know the id
    // and register a request that activates the node because
    // it should be retrieved
  });
		
}
