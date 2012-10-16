/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

var SkeletonConnectivity = new function()
{
    var projectID, skeletonID;
    var self = this;

    this.init = function() {
        projectID = project.id;
    }

    this.fetchConnectivityForSkeleton = function() {
        // current neuron id
        var skeletonid = project.selectedObjects.selectedskeleton;

        if( skeletonid ) {
            jQuery.ajax({
                url: "dj/" + project.id + "/skeleton/" + skeletonid + '/info',
                type: "POST",
                dataType: "json",
                data : {
                  'threshold': $('#connectivity_count_threshold').val()
                },
                success: function (data) {
                    self.createConnectivityTable( data )
                }
            });
        }
    }

    this.createConnectivityTable = function( data ) {

        var bigtable, table, tbody, row;
        if( $('#connectivity_table').length > 0 ) {
            $('#connectivity_table').remove();
        }

        bigtable = $('<table />').attr('cellpadding', '0').attr('cellspacing', '0').attr('width', '100%').attr('id', 'connectivity_table').attr('border', '0');
        row = $('<tr />')
        var incoming = $('<td />').attr('id', 'incoming_field').attr('valign', 'top');
        row.append( incoming );
        var outgoing = $('<td />').attr('id', 'outgoing_field').attr('valign', 'top');
        row.append( outgoing );
        bigtable.append( row );
        $("#connectivity_widget").append( bigtable );

        table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'incoming_connectivity_table').attr('border', '1');
        // create header
        thead = $('<thead />');
        table.append( thead );
        row = $('<tr />')
        row.append( $('<td />').text("Upstream neuron") );
        row.append( $('<td />').text("syn count") );
        row.append( $('<td />').text("reviewed") );
        row.append( $('<td />').text("node count") );
        row.append( $('<td />').text("show") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['incoming'] ) {
            var skeleton_id = data['incoming'][e]['skeleton_id'];
            row = $('<tr />');
            row.append( $('<td />').text( data['incoming'][e]['name'] ) );
            row.append( $('<td />').text( data['incoming'][e]['synaptic_count'] ) );
            row.append( $('<td />').text( data['incoming'][e]['percentage_reviewed'] ) );
            row.append( $('<td />').text( data['incoming'][e]['node_count'] ) );
            row.append(
                $('<td />').append(
                    $(document.createElement("input")).attr({
                        id:    'incoming-show-skeleton-' + skeleton_id,
                        type:  'checkbox',
                        value:  skeleton_id,
                        checked: false
                    })
                        .click( function( event )
                        {
                            if( $( "#view_in_3d_webgl_widget").length ) {
                                var skelid = parseInt( event.target.value );
                                var vis = $('#incoming-show-skeleton-' + skelid).is(':checked');
                                if( vis ) {
                                    WebGLApp.addSkeletonFromID( project.id, skelid );
                                } else {
                                    WebGLApp.removeSkeleton( skelid );
                                }
                            }
                        } )
                ));
            tbody.append( row );
        }
        // empty row
        row = $('<tr />');
        tbody.append( row );
        table.append( $('<br /><br /><br /><br />') );
        incoming.append( table );

        table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'outgoing_connectivity_table').attr('border', '1');
        // create header
        thead = $('<thead />');
        table.append( thead );
        row = $('<tr />')
        row.append( $('<td />').text("Downstream neuron") );
        row.append( $('<td />').text("syn count") );
        row.append( $('<td />').text("reviewed") );
        row.append( $('<td />').text("node count") );
        row.append( $('<td />').text("show") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['outgoing'] ) {
            var skeleton_id = data['outgoing'][e]['skeleton_id'];
            row = $('<tr />');
            row.append( $('<td />').text( data['outgoing'][e]['name'] ) );
            row.append( $('<td />').text( data['outgoing'][e]['synaptic_count'] ) );
            row.append( $('<td />').text( data['outgoing'][e]['percentage_reviewed'] ) );
            row.append( $('<td />').text( data['outgoing'][e]['node_count'] ) );
            row.append(
                $('<td />').append(
                    $(document.createElement("input")).attr({
                        id:    'outgoing-show-skeleton-' + skeleton_id,
                        type:  'checkbox',
                        value:  skeleton_id,
                        checked: false
                    })
                        .click( function( event )
                        {
                            if( $( "#view_in_3d_webgl_widget").length ) {
                                var skelid = parseInt( event.target.value );
                                var vis = $('#outgoing-show-skeleton-' + skelid).is(':checked');
                                if( vis ) {
                                    WebGLApp.addSkeletonFromID( project.id, skelid );
                                } else {
                                    WebGLApp.removeSkeleton( skelid );
                                }
                            }
                        } )
                ));
            tbody.append( row );
        }
        // empty row
        row = $('<tr />');
        tbody.append( row );
        table.append( $('<br /><br /><br /><br />') );
        outgoing.append( table );

        $("#connectivity_table").prepend( $(document.createTextNode( $('#neuronName').text() )) );

    }

}
