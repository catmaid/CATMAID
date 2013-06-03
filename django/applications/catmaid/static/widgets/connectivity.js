/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

var SkeletonConnectivity = new function()
{
    var projectID;
    var skeletons = {}; // skeletonID, skeletonTitle;
    var self = this;

    this.init = function() {
        projectID = project.id;
    };

    this.fetchConnectivityForSkeleton = function() {
        skeletons = {};
        if ('Active neuron' === $('#connectivity_source').val()) {
            var skid = project.selectedObjects.selectedskeleton;
            if (null === skid) return; // nothing selected
            skeletons[skid] = $('#neuronName').text();
        } else {
            skeletons = NeuronStagingArea.get_selected_skeletons_data();
            if (0 === Object.keys(skeletons).length) {
                return; // nothing selected
            }
        }
        self.refresh();
    };

    this.refresh = function() {
        var skids = Object.keys(skeletons); 
        if (0 === skids.length) { return };
        requestQueue.replace(
                django_url + project.id + '/skeleton/connectivity',
                'POST',
                {'source': skids,
                 'threshold': $('#connectivity_count_threshold').val(),
                 'boolean_op': $('#connectivity_operation').val()},
                self.createConnectivityTable,
                'update_connectivity_table');
    };

    /** @param relation Either 'presynaptic_to' or 'postsynaptic_to'. */
    var showSharedConnectorsFn = function(partnerID, skids, relation) {
        return function() {
            ConnectorSelection.show_shared_connectors(partnerID, skids, relation);
            return false;
        };
    };

    this.createConnectivityTable = function( status, text ) {
        if (200 !== status) { return; }
        var json = $.parseJSON(text);
        if (json.error) {
            alert(json.error);
            return;
        }

        if( $('#connectivity_table').length > 0 ) {
            $('#connectivity_table').remove();
        }

        var bigtable = $('<table />').attr('cellpadding', '0').attr('cellspacing', '0').attr('width', '100%').attr('id', 'connectivity_table').attr('border', '0');
        var row = $('<tr />')
        var incoming = $('<td />').attr('id', 'incoming_field').attr('valign', 'top');
        row.append( incoming );
        var outgoing = $('<td />').attr('id', 'outgoing_field').attr('valign', 'top');
        row.append( outgoing );
        bigtable.append( row );
        $("#connectivity_widget").append( bigtable );

        var synaptic_count = function(skids_dict) {
            return Object.keys(skids_dict).reduce(function(sum, skid) {
                return sum + skids_dict[skid];
            }, 0);
        };

        var to_sorted_array = function(partners) {
            return Object.keys(partners).reduce(function(list, skid) {
                var partner = partners[skid];
                partner['id'] = parseInt(skid);
                partner['synaptic_count'] = synaptic_count(partner.skids);
                list.push(partner);
                return list;
            }, []).sort(function(a, b) {
                return b.synaptic_count - a.synaptic_count;
            });
        };

        var onmouseover = function() { this.style.textDecoration = 'underline'; }
        var onmouseout = function() { this.style.textDecoration = 'none'; };

        var add_to_selection_table = function(ev) {
            if( 0 === $( "#neuron_staging_table").length ) return;
            var skelid = parseInt( ev.target.value );
            if ($('#incoming-show-skeleton-' + skelid).is(':checked')) {
                NeuronStagingArea.add_skeleton_to_stage_without_name( skelid );
            } else {
                NeuronStagingArea.remove_skeleton( skelid );
            }
        };

        var getBackgroundColor = function(reviewed) {
            if (100 === reviewed) {
                return '#6fff5c';
            } else if (0 === reviewed) {
                return '#ff8c8c';
            } else {
                return '#ffc71d';
            }
        };

        var create_table = function(partners, title, relation) {
            var table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'incoming_connectivity_table').attr('border', '1');
            // create header
            var thead = $('<thead />');
            table.append( thead );
            var row = $('<tr />')
            row.append( $('<td />').text(title + "stream neuron") );
            row.append( $('<td />').text("syn count") );
            row.append( $('<td />').text("reviewed") );
            row.append( $('<td />').text("node count") );
            row.append( $('<td />').text("select") );
            thead.append( row );
            row = $('<tr />')
            row.append( $('<td />').text("ALL") );
            row.append( $('<td />').text(partners.reduce(function(sum, partner) { return sum + partner.synaptic_count; }, 0) ));
            var average = (partners.reduce(function(sum, partner) { return sum + partner.reviewed; }, 0 ) / partners.length) | 0;
            row.append( $('<td />').text(average).css('background-color', getBackgroundColor(average)));
            row.append( $('<td />').text(partners.reduce(function(sum, partner) { return sum + partner.num_nodes; }, 0) ));
            var el = $('<input type="checkbox" id="' + title.toLowerCase() + 'stream-selectall' + '" />');
            row.append( $('<td />').append( el ) );
            thead.append( row );
            var tbody = $('<tbody />');
            table.append( tbody );

            partners.forEach(function(partner) {
                var tr = document.createElement('tr');
                tbody.append(tr);

                // Cell with partner neuron name
                var td = document.createElement('td');
                var a = document.createElement('a');
                a.innerText = partner.name;
                a.setAttribute('href', '#');
                a.onclick = function() {
                    console.log(partner, partner.id);
                    TracingTool.goToNearestInNeuronOrSkeleton('skeleton', partner.id);
                    return false;
                };
                a.onmouseover = onmouseover;
                a.onmouseout = onmouseout;
                a.style.color = 'black';
                a.style.textDecoration = 'none';
                td.appendChild(a);
                tr.appendChild(td);

                // Cell with synapses with partner neuron
                var td = document.createElement('td');
                var a = document.createElement('a');
                td.appendChild(a);
                a.innerText = partner.synaptic_count;
                a.setAttribute('href', '#');
                a.style.color = 'black';
                a.style.textDecoration = 'none';
                a.onclick = showSharedConnectorsFn(partner.id, Object.keys(partner.skids), relation);
                a.onmouseover = function() {
                    a.style.textDecoration = 'underline';
                    // TODO should show a div with the list of partners, with their names etc.
                };
                a.onmouseout = onmouseout;
                tr.appendChild(td);

                // Cell with percent reviewed of partner neuron
                var td = document.createElement('td');
                td.innerText = partner.reviewed;
                td.style.backgroundColor = getBackgroundColor(partner.reviewed);
                tr.appendChild(td);

                // Cell with numnber of nodes of partner neuron
                var td = document.createElement('td');
                td.innerText = partner.num_nodes;
                tr.appendChild(td);

                // Cell with checkbox for adding to Selection Table
                var td = document.createElement('td');
                var input = document.createElement('input');
                input.setAttribute('id', 'incoming-show-skeleton-' + partner.id);
                input.setAttribute('type', 'checkbox');
                input.setAttribute('value', partner.id);
                input.onclick = add_to_selection_table;               
                td.appendChild(input);
                tr.appendChild(td);
            });

            return table;
        };


        var table_incoming = create_table(to_sorted_array(json.incoming), 'Up', 'presynaptic_to');
        var table_outgoing = create_table(to_sorted_array(json.outgoing), 'Down', 'postsynaptic_to');

        incoming.append(table_incoming);
        outgoing.append(table_outgoing);

        var add_select_all_fn = function(name, table) {
             $('#' + name + 'stream-selectall').click( function( event ) {
                 var rows = table[0].childNodes[1].childNodes; // all tr elements

                if( $( "#neuron_staging_table").length && $('#' + name + 'stream-selectall').is(':checked') ) {
                    for (var i=rows.length-1; i > -1; --i) {
                        var checkbox = rows[i].childNodes[4].childNodes[0];
                        checkbox.checked = true;
                        NeuronStagingArea.add_skeleton_to_stage_without_name( checkbox.value );
                    };
                } else {
                    for (var i=rows.length-1; i > -1; --i) {
                        var checkbox = rows[i].childNodes[4].childNodes[0];
                        checkbox.checked = false;
                        NeuronStagingArea.remove_skeleton( checkbox.value );
                    };
                }
            });
        };

        add_select_all_fn('up', table_incoming);
        add_select_all_fn('down', table_outgoing);

        $("#connectivity_table").prepend( $(document.createTextNode( Object.keys(skeletons).reduce(function(list, skid) {
            list.push(skeletons[skid]);
            return list;
        }, []).join(', '))));

    };
};
