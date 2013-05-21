/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

var SkeletonConnectivity = new function()
{
    var projectID, skeletonID, skeletonTitle;
    var self = this;
    var data = null; // hold the table data in order to select/deselect all skeletons

    this.init = function() {
        projectID = project.id;
    };

    this.fetchConnectivityForSkeleton = function() {
        // current neuron id
        var skeletonid = project.selectedObjects.selectedskeleton;

        if( skeletonid ) {
            skeletonID = skeletonid;
            skeletonTitle = $('#neuronName').text();
            self.refresh();
        }
    };

    this.refresh = function() {
        if (!skeletonID) { return };
        requestQueue.replace(
                django_url + project.id + '/skeleton/' + skeletonID + '/info',
                'POST',
                {'threshold': $('#connectivity_count_threshold').val()},
                self.createConnectivityTable,
                'update_connectivity_table');
    };

    this.createConnectivityTable = function( status, text ) {

        if (200 !== status) { return; }
        data = $.parseJSON(text);
        if (data.error) {
            alert(data.error);
            return;
        }

        var bigtable, table, thead, tbody, row;
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
        row.append( $('<td />').text("select") );
        thead.append( row );
        row = $('<tr />')
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        var el = $('<input type="checkbox" id="upstream-selectall' + '" />');
        row.append( $('<td />').append( el ) );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['incoming'] ) {
            var skeleton_id = data['incoming'][e]['skeleton_id'];
            row = $('<tr />');
            row.append( $('<td />').html( '<a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\', ' + skeleton_id + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + data['incoming'][e]['name'] + '</a>') );
            row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.show_shared_connectors(' + skeleton_id + ',' + skeletonID + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + data['incoming'][e]['synaptic_count'] + '</a>' ) );

            var cell = $('<td />');
            if( data['incoming'][e]['percentage_reviewed'] == 100 ) {
                cell.css('background-color', '#6fff5c');
            } else if ( ( data['incoming'][e]['percentage_reviewed'] > 0 ) ) {
                cell.css('background-color', '#ffc71d');
            } else {
                cell.css('background-color', '#ff8c8c');
            }

            row.append( cell.text( data['incoming'][e]['percentage_reviewed'] ) );
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
                            if( $( "#neuron_staging_table").length ) {
                                var skelid = parseInt( event.target.value );
                                var vis = $('#incoming-show-skeleton-' + skelid).is(':checked');
                                if( vis ) {
                                    NeuronStagingArea.add_skeleton_to_stage_without_name( skelid );
                                } else {
                                    NeuronStagingArea.remove_skeleton( skelid );
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
        row.append( $('<td />').text("select") );
        thead.append( row );
        row = $('<tr />')
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("") );
        var el = $('<input type="checkbox" id="downstream-selectall' + '" />');
        row.append( $('<td />').append( el ) );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in data['outgoing'] ) {
            var skeleton_id = data['outgoing'][e]['skeleton_id'];
            row = $('<tr />');
            row.append( $('<td />').html( '<a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\', ' + skeleton_id + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + data['outgoing'][e]['name'] + '</a>') );
            // row.append( $('<td />').text( data['outgoing'][e]['synaptic_count'] ) );
            row.append( $('<td />').html( '<a href="#" onclick="ConnectorSelection.show_shared_connectors(' + skeletonID + ',' + skeleton_id + '); return false;" style="text-decoration:none; color: black;" onmouseover="this.style.textDecoration=\'underline\';" onmouseout="this.style.textDecoration=\'none\';">' + data['outgoing'][e]['synaptic_count'] + '</a>' ) );

            var cell = $('<td />');
            if( data['outgoing'][e]['percentage_reviewed'] == 100 ) {
                cell.css('background-color', '#6fff5c');
            } else if ( ( data['outgoing'][e]['percentage_reviewed'] > 0 ) ) {
                cell.css('background-color', '#ffc71d');
            } else {
                cell.css('background-color', '#ff8c8c');
            }
            
            row.append( cell.text( data['outgoing'][e]['percentage_reviewed'] ) );
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
                            if( $( "#neuron_staging_table").length ) {
                                var skelid = parseInt( event.target.value );
                                var vis = $('#outgoing-show-skeleton-' + skelid).is(':checked');
                                if( vis ) {
                                    NeuronStagingArea.add_skeleton_to_stage_without_name( skelid );
                                } else {
                                    NeuronStagingArea.remove_skeleton( skelid );
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

        $('#downstream-selectall').click( function( event ) {
            if( $( "#neuron_staging_table").length && $('#downstream-selectall').is(':checked') ) {
                for(var e in data['outgoing'] ) {
                    var skeleton_id = data['outgoing'][e]['skeleton_id'];
                    $('#outgoing-show-skeleton-' + skeleton_id).attr('checked', true);
                    NeuronStagingArea.add_skeleton_to_stage_without_name( skeleton_id );
                }
            } else {
                for(var e in data['outgoing'] ) {
                    var skeleton_id = data['outgoing'][e]['skeleton_id'];
                    $('#outgoing-show-skeleton-' + skeleton_id).attr('checked', false);
                    NeuronStagingArea.remove_skeleton( skeleton_id );
                }
            }
        });

        $('#upstream-selectall').click( function( event ) {
            if( $( "#neuron_staging_table").length && $('#upstream-selectall').is(':checked') ) {
                for(var e in data['incoming'] ) {
                    var skeleton_id = data['incoming'][e]['skeleton_id'];
                    $('#incoming-show-skeleton-' + skeleton_id).attr('checked', true);
                    NeuronStagingArea.add_skeleton_to_stage_without_name( skeleton_id );
                }
            } else {
                for(var e in data['incoming'] ) {
                    var skeleton_id = data['incoming'][e]['skeleton_id'];
                    $('#incoming-show-skeleton-' + skeleton_id).attr('checked', false);
                    NeuronStagingArea.remove_skeleton( skeleton_id );
                }
            }
        });

        $("#connectivity_table").prepend( $(document.createTextNode( skeletonTitle )) );

    };
};
