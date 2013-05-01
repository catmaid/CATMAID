
var ConnectorSelection = new function()
{

	var self = this;

	self.show_shared_connectors = function( pre, post )
	{
	    jQuery.ajax({
	      url: django_url + project.id + '/connector/list/graphedge',
	      data: { skeletonlist: [pre, post] },
	      type: "POST",
	      dataType: "json",
	      success: function ( data ) {
	      	self.show_dialog( pre, post, data );
	      }
	    });
	}

	self.goto_connector = function( connectorid )
	{
		requestQueue.register(django_url + project.id + '/node/get_location', "POST", {
	        tnid: connectorid,
	        type: "connector"
        }, function (status, text, xml) {
	        if (status === 200) {
	          if (text && text != " ") {
	            var jso = $.parseJSON(text);
	            if (jso.error) {
	              alert(jso.error);
	            } else {
	              project.moveTo(jso[3], jso[2], jso[1], undefined, function() { 
	              	SkeletonAnnotations.staticSelectNode(jso[0], null);
	              });
	            }
	          }
	        }
	      });
	}

	self.goto_treenode = function( treenodeid )
	{
		requestQueue.register(django_url + project.id + '/node/get_location', "POST", {
	        tnid: treenodeid,
	        type: "treenode"
        }, function (status, text, xml) {
	        if (status === 200) {
	          if (text && text != " ") {
	            var jso = $.parseJSON(text);
	            if (jso.error) {
	              alert(jso.error);
	            } else {
	              project.moveTo(jso[3], jso[2], jso[1], undefined, function() { 
	              	SkeletonAnnotations.staticSelectNode(jso[0], jso[4]);	
	              });
	            }
	          }
	        }
	      });
	}

	self.show_dialog = function( pre, post, connectordata )
	{

		WindowMaker.show('create-connector-selection');


		$('#dialog-connector-selection').empty();

		$('#dialog-connector-selection').append(
			$(document.createTextNode( 'From skeleton ' + pre + ' to skeleton ' + post ))
		)
		$('#dialog-connector-selection').append( '<br /><br />' )

        var table = $('<table />').attr('width', '100%').attr('id', 'connector-selection-connectors').attr('border', '0');
        // create header
        thead = $('<thead />');
        table.append( thead );
        row = $('<tr />')
        row.append( $('<td />').text("connector id") );
        row.append( $('<td />').text("pre node id") );
        row.append( $('<td />').text("post node id") );
        row.append( $('<td />').text("x") );
        row.append( $('<td />').text("y") );
        row.append( $('<td />').text("z") );
        row.append( $('<td />').text("created by") );
        thead.append( row );

		for( var idx = 0; idx < connectordata.length; idx++ ) {
	        row = $('<tr />')
	        row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.goto_connector(' + connectordata[idx]['connector_id'] + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + connectordata[idx]['connector_id'] + '</a>') );
	        row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.goto_treenode(' + connectordata[idx]['pretreenode'] + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + connectordata[idx]['pretreenode'] + '</a>') );
	        row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.goto_treenode(' + connectordata[idx]['posttreenode'] + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + connectordata[idx]['posttreenode'] + '</a>') );
	        row.append( $('<td />').text( connectordata[idx]['x']) );
	        row.append( $('<td />').text( connectordata[idx]['y']) );
	        row.append( $('<td />').text( connectordata[idx]['z']) );
	        row.append( $('<td />').text( connectordata[idx]['user']) );
	        thead.append( row );
		}

        $('#dialog-connector-selection').append( table );

	}

}