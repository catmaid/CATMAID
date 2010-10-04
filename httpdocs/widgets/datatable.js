// To REMOVE. 

var tn_table_loaded;
var pre_table_loaded;
var post_table_loaded;


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



