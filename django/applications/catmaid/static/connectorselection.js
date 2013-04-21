
var ConnectorSelection = new function()
{

	var self = this;

	self.show_shared_connectors = function( pre, post )
	{
	    jQuery.ajax({
	      url: django_url + project.id + '/skeletongroup/all_shared_connectors',
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
	        type: 'connector'
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

	self.show_dialog = function( pre, post, connectordata )
	{

		var dialog = document.createElement('div');
		dialog.setAttribute("id", "dialog-connector-selection");
		dialog.setAttribute("title", "Connector Selection Table");

		$(dialog).dialog({
		  // height: 440,
		  modal: false,
		  buttons: {
		    "OK": function() {
		      $(this).dialog("close");
		      $('#dialog-connector-selection').remove();
		    }
		  }
		});

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
        row.append( $('<td />').text("creator") );
        thead.append( row );

		for( var connector_id in connectordata ) {
			if( connectordata.hasOwnProperty( connector_id )) {
		        row = $('<tr />')
		        row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.goto_connector(' + connector_id + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + connector_id + '</a>') );
		        row.append( $('<td />').text("") );            	
		        thead.append( row );
			}
		}

        $('#dialog-connector-selection').append( table );

	}

}