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
        var neuronid = project.selectedObjects.selectedneuron,
            skeletonid = project.selectedObjects.selectedskeleton;
        if( skeletonid ) {
            jQuery.ajax({
                url: "dj/" + project.id + "/skeleton/" + skeletonid + '/info',
                type: "POST",
                dataType: "json",
                data: { neuron_id: neuronid },
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
        row.append( $('<td />').text("Presynaptic") );
        row.append( $('<td />').text("count") );
        row.append( $('<td />').text("show") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['incoming'] ) {
            row = $('<tr />');
            row.append( $('<td />').text( data['incoming'][e]['name'] ) );
            row.append( $('<td />').text( data['incoming'][e]['id__count'] ) );
            row.append(
                $('<td />').append(
                    $(document.createElement("input")).attr({
                        id:    'incoming-show-skeleton-' + data['incoming'][e]['skeleton_id'],
                        type:  'checkbox',
                        checked: false
                    })
                        .click( function( event )
                        {
                            if( $( "#view_in_3d_webgl_widget").length ) {
                                var vis = $('#incoming-show-skeleton-' + data['incoming'][e]['skeleton_id']).is(':checked');
                                if( vis ) {
                                    WebGLApp.addSkeletonFromID( project.id, data['incoming'][e]['skeleton_id'] );
                                } else {
                                    WebGLApp.removeSkeleton( data['incoming'][e]['skeleton_id'] );
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
        row.append( $('<td />').text("Postsynaptic") );
        row.append( $('<td />').text("count") );
        row.append( $('<td />').text("show") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['outgoing'] ) {
            row = $('<tr />');
            row.append( $('<td />').text( data['outgoing'][e]['name'] ) );
            row.append( $('<td />').text( data['outgoing'][e]['id__count'] ) );
            row.append(
                $('<td />').append(
                    $(document.createElement("input")).attr({
                        id:    'outgoing-show-skeleton-' + data['outgoing'][e]['skeleton_id'],
                        type:  'checkbox',
                        checked: false
                    })
                        .click( function( event )
                        {
                            if( $( "#view_in_3d_webgl_widget").length ) {
                                var vis = $('#outgoing-show-skeleton-' + data['outgoing'][e]['skeleton_id']).is(':checked');
                                if( vis ) {
                                    WebGLApp.addSkeletonFromID( project.id, data['outgoing'][e]['skeleton_id'] );
                                } else {
                                    WebGLApp.removeSkeleton( data['outgoing'][e]['skeleton_id'] );
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

    }

}
