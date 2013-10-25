/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var SkeletonConnectivity = function() {
  this.skeletons = {}; // skeletonID, skeletonTitle;
  this.widgetID = this.registerInstance();
  this.registerSource();
};

SkeletonConnectivity.prototype = {};
$.extend(SkeletonConnectivity.prototype, new InstanceRegistry());
$.extend(SkeletonConnectivity.prototype, new SkeletonSource());

/** Appends only to the top list, that is, the set of seed skeletons
 *  for which all pre- and postsynaptic partners are listed. */
SkeletonConnectivity.prototype.append = function(models) {
  var skeletons = this.skeletons,
      count = 0,
      widgetID = this.widgetID;
  var new_skeletons = Object.keys(models).reduce(function(o, skid) {
    if (skid in skeletons) {
      $('#a-connectivity-table-' + widgetID + '-' + skid).html(models[skid].baseName + ' #' + skid);
    } else {
      o[skid] = models[skid].baseName;
      ++count;
    }
    return o;
  }, {});
  if (0 === count) return;
  // Update existing ones and add new ones
  $.extend(this.skeletons, new_skeletons);
  this.update();
};

SkeletonConnectivity.prototype.getName = function() {
  return "Connectivity " + this.widgetID;
};

SkeletonConnectivity.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();
};

SkeletonConnectivity.prototype.clear = function() {
  this.skeletons = {};
  this.update();
};

SkeletonConnectivity.prototype.updateModel = function(model, source_chain) {
  if (source_chain && (this in source_chain)) return; // break propagation loop
  source_chain[this] = this;

  console.log("Ignoring updateModel", model);
};

SkeletonConnectivity.prototype.highlight = function(skeleton_id) {
  // TODO color the table row in green if present, clear all others
};

SkeletonConnectivity.prototype.getSelectedSkeletons = function() {
  return Object.keys(this.skeletons).map(Number);
};

SkeletonConnectivity.prototype.getSkeletonModel = function(skeleton_id) {
    var e_name = $('#a-connectivity-table-' + this.widgetID + '-' + skeleton_id);
    if (0 === e_name.length) return null;
    var name = e_name.text();
    name = name.substring(0, name.lastIndexOf(' '));

    var pre = $("#presynaptic_to-show-skeleton-" + this.widgetID + "-" + skeleton_id);
    var post = $("#postsynaptic_to-show-skeleton-" + this.widgetID + "-" + skeleton_id);

    var color = new THREE.Color();
    if (pre.length > 0) {
      if (post.length > 0) color.setRGB(0.8, 0.6, 1); // both
      else color.setRGB(1, 0.4, 0.4); // pre
    } else if (post.length > 0) color.setRGB(0.5, 1, 1); // post

    var model = new SelectionTable.prototype.SkeletonModel(skeleton_id, name, color);
    model.selected = pre.is(':checked') || post.is(':checked');
    return model;
};

SkeletonConnectivity.prototype.getSelectedSkeletonModels = function() {
  var skeletons = this.skeletons;
  var models = Object.keys(this.skeletons).reduce(function(o, skid) {
    var name = skeletons[skid];
    name = name.substring(0, name.lastIndexOf(' '));
    o[skid] = new SelectionTable.prototype.SkeletonModel(skid, skeletons[skid], new THREE.Color().setRGB(1, 1, 0));
    return o;
  }, {});

  var widgetID = this.widgetID;
  var colors = [new THREE.Color().setRGB(1, 0.4, 0.4),
                new THREE.Color().setRGB(0.5, 1, 1),
                new THREE.Color().setRGB(0.8, 0.6, 1)];
  // Read out all skeletons
  var sks = {};
  ['presynaptic_to', 'postsynaptic_to'].forEach(function(relation, index) {
    $("input[id^='" + relation + "-show-skeleton-" + widgetID + "-']").each(function(i, e) {
      var skid = parseInt(e.value);
      if (!(skid in sks)) sks[skid] = {};
      sks[skid][index] = e.checked;
    });
  });
  // Pick those for which at least one checkbox is checked (if they have more than one)
  Object.keys(sks).forEach(function(skid) {
    var sk = sks[skid];
    if (true === sk[0] || true === sk[1]) {
      var index = -1;
      if (0 in sk) {
        if (1 in sk) index = 2; // exists in both pre and post
        else index = 0;
      } else if (1 in sk) index = 1;
      var name = $('#a-connectivity-table-' + widgetID + '-' + skid).text();
      name = name.substring(0, name.lastIndexOf(' '));
      models[skid] = new SelectionTable.prototype.SkeletonModel(skid, name, colors[index].clone());
    }
  });

  return models;
};

SkeletonConnectivity.prototype._clearGUI = function() {
  // Clear table and plots
  ["_table", "_plot_Upstream", "_plot_Downstream"].forEach(function(name) {
      var s = $('#connectivity' + name + this.widgetID);
      if (s.length > 0) s.remove();
  }, this);
};

SkeletonConnectivity.prototype.update = function() {
  var skids = Object.keys(this.skeletons);
  if (0 === skids.length) {
    this._clearGUI();
    return;
  };

  // Record the state of checkboxes
  var checkboxes = [{}, {}],
      widgetID = this.widgetID,
      relations = ['presynaptic_to', 'postsynaptic_to'];
  relations.forEach(function(relation, index) {
    $("[id^='" + relation + "-show-skeleton-" + widgetID + "-']").each(function(_, checkbox) {
      checkboxes[index][checkbox.value] = checkbox.checked;
    });
  });

  var createConnectivityTable = this.createConnectivityTable.bind(this);

  requestQueue.replace(
          django_url + project.id + '/skeleton/connectivity',
          'POST',
          {'source': skids,
           'threshold': $('#connectivity_count_threshold' + this.widgetID).val(),
           'boolean_op': $('#connectivity_operation' + this.widgetID).val()},
          function(status, text) {
            createConnectivityTable(status, text);
            // Restore checkbox state
            checkboxes.forEach(function(c, i) {
              var relation = relations[i];
              Object.keys(c).forEach(function(skeleton_id) {
                $('#' + relation + '-show-skeleton-' + widgetID + '-' + skeleton_id).attr('checked', c[skeleton_id]);
              });
            });
          },
          'update_connectivity_table');
};

SkeletonConnectivity.prototype.createConnectivityTable = function(status, text) {
    if (200 !== status) { return; }
    var json = $.parseJSON(text);
    if (json.error) {
        alert(json.error);
        return;
    }

    var widgetID = this.widgetID;
    var getLinkTarget = this.getLinkTarget.bind(this);
    var getSkeletonModel = this.getSkeletonModel.bind(this);

    // Clear table and plots
    this._clearGUI();

    var bigtable = $('<table />').attr('cellpadding', '0').attr('cellspacing', '0').attr('width', '100%').attr('id', 'connectivity_table' + widgetID).attr('border', '0');
    var row = $('<tr />')
    var incoming = $('<td />').attr('id', 'incoming_field').attr('valign', 'top');
    row.append( incoming );
    var outgoing = $('<td />').attr('id', 'outgoing_field').attr('valign', 'top');
    row.append( outgoing );
    bigtable.append( row );
    $("#connectivity_widget" + widgetID).append( bigtable );

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

    var createNameElement = function(name, skeleton_id) {
        var a = document.createElement('a');
        a.innerText = name + ' #' + skeleton_id;
        a.setAttribute('href', '#');
        a.setAttribute('id', 'a-connectivity-table-' + widgetID + '-' + skeleton_id);
        a.onclick = function() {
            TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
            return false;
        };
        a.onmouseover = onmouseover;
        a.onmouseout = onmouseout;
        a.style.color = 'black';
        a.style.textDecoration = 'none';
        return a;
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

      var set_as_selected = function(ev) {
        var skelid = parseInt( ev.target.value );
        var checked = $('#' + relation + '-show-skeleton-' + widgetID + '-' + skelid).is(':checked');
        // Update the checkbox for the same skeleton on the other table, if any
        var r = {presynaptic_to: 'postsynaptic_to',
                 postsynaptic_to: 'presynaptic_to'}[relation];
        $('#' + r + '-show-skeleton-' + widgetID + '-' + skelid).attr('checked', checked);

        var linkTarget = getLinkTarget();
        if (!linkTarget) return;

        var model = linkTarget.getSkeletonModel(skelid);
        if (checked) {
          if (!model) model = getSkeletonModel(skelid);
          model.selected = true;
          var models = {};
          models[skelid] = model;
          linkTarget.append(models);
        } else {
          if (model) {
            model.selected = false;
            linkTarget.updateModel(model);
          }
        }
      };

        var table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'incoming_connectivity_table' + widgetID).attr('border', '1');
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
        row.append( $('<td />').text("ALL (" + partners.length + " neurons)") );
        row.append( $('<td />').text(partners.reduce(function(sum, partner) { return sum + partner.synaptic_count; }, 0) ));
        var average = (partners.reduce(function(sum, partner) { return sum + partner.reviewed; }, 0 ) / partners.length) | 0;
        row.append( $('<td />').text(average).css('background-color', getBackgroundColor(average)));
        row.append( $('<td />').text(partners.reduce(function(sum, partner) { return sum + partner.num_nodes; }, 0) ));
        var el = $('<input type="checkbox" id="' + title.toLowerCase() + 'stream-selectall' +  widgetID + '" />');
        row.append( $('<td />').append( el ) );
        thead.append( row );
        var tbody = $('<tbody />');
        table.append( tbody );

        partners.forEach(function(partner) {
            var tr = document.createElement('tr');
            tbody.append(tr);

            // Cell with partner neuron name
            var td = document.createElement('td');
            var a = createNameElement(partner.name, partner.id);
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
            a.onclick = ConnectorSelection.show_shared_connectors.bind(ConnectorSelection, partner.id, Object.keys(partner.skids), relation); //showSharedConnectorsFn(partner.id, Object.keys(partner.skids), relation);
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

            // Cell with number of nodes of partner neuron
            var td = document.createElement('td');
            td.innerText = partner.num_nodes;
            tr.appendChild(td);

            // Cell with checkbox for adding to Selection Table
            var td = document.createElement('td');
            var input = document.createElement('input');
            input.setAttribute('id', relation + '-show-skeleton-' + widgetID + '-' + partner.id);
            input.setAttribute('type', 'checkbox');
            input.setAttribute('value', partner.id);
            input.onclick = set_as_selected;
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
         $('#' + name + 'stream-selectall' + widgetID).click( function( event ) {
             var rows = table[0].childNodes[1].childNodes; // all tr elements
             var linkTarget = getLinkTarget();

            if($('#' + name + 'stream-selectall' + widgetID).is(':checked') ) {
                var skids = [];
                for (var i=rows.length-1; i > -1; --i) {
                    var checkbox = rows[i].childNodes[4].childNodes[0];
                    checkbox.checked = true;
                    skids.push(checkbox.value);
                };
                if (linkTarget) {
                  linkTarget.append(skids.reduce(function(o, skid) {
                    // See if the target has the model and update only its selection state
                    var model = linkTarget.getSkeletonModel(skid);
                    if (model) model.selected = true;
                    else model = getSkeletonModel(skid); // otherwise add new
                    o[skid] = model;
                    return o;
                  }, {}));
                }
            } else {
                var skids = [];
                for (var i=rows.length-1; i > -1; --i) {
                    var checkbox = rows[i].childNodes[4].childNodes[0];
                    checkbox.checked = false;
                    skids.push(checkbox.value);
                };
                if (linkTarget) {
                  skids.forEach(function(skid) {
                    var model = linkTarget.getSkeletonModel(skid);
                    if (model) {
                      model.selected = false;
                      linkTarget.updateModel(model);
                    }
                  });
                }
            }
        });
    };

    add_select_all_fn('up', table_incoming);
    add_select_all_fn('down', table_outgoing);

    var neuronList = document.createElement("ul");
    neuronList.setAttribute('id', 'connectivity_widget_name_list' + widgetID);
    Object.keys(this.skeletons).forEach(function(skid) {
        var li = document.createElement("li");
        li.appendChild(createNameElement(this.skeletons[skid], skid));
        neuronList.appendChild(li);
    }, this);

    $("#connectivity_table" + widgetID).prepend(neuronList);
            
    this.createSynapseDistributionPlots(json);
};

SkeletonConnectivity.prototype.createSynapseDistributionPlots = function(json) {
    // A grouped bar chart plot from d3.js
    
    var skeletons = this.skeletons;

    /** Generate a distribution of number of Y partners that have X synapses,
     * for each partner. The distribution then takes the form of an array of blocks,
     * where every block is an array of objects like {skid: <skeleton_id>, count: <partner count>}.
     * The skeleton_node_count_threshold is used to avoid skeletons whose node count is too small, like e.g. a single node. */
    var distribution = function(partners, skeleton_node_count_threshold) {
        var d = Object.keys(partners)
            .reduce(function(ob, partnerID) {
                var props = partners[partnerID];
                if (props.num_nodes < skeleton_node_count_threshold) {
                    return ob;
                }
                var skids = props.skids;
                return Object.keys(skids)
                    .reduce(function(ob, skid) {
                        if (!ob.hasOwnProperty(skid)) ob[skid] = [];
                        var synapse_count = skids[skid];
                        if (!ob[skid].hasOwnProperty(synapse_count)) ob[skid][synapse_count] = 1;
                        else ob[skid][synapse_count] += 1;
                        return ob;
                    }, ob);
                }, {});

        // Find out which is the longest array
        var max_length = Object.keys(d).reduce(function(length, skid) {
            return Math.max(length, d[skid].length);
        }, 0);

        // Reformat to an array of arrays where the index of the array is the synaptic count minus 1 (arrays are zero-based), and each inner array has objects with {skid, count} keys
        var a = [];
        var skids = Object.keys(d);
        for (var i = 1; i < max_length; ++i) {
            a[i-1] = skids.reduce(function(block, skid) {
                var count = d[skid][i];
                if (count) block.push({skid: skid, count: count});
                return block;
            }, []);
        }

        return a;
    };

    /** A multiple bar chart that shows the number of synapses vs the number of partners that receive/make that many synapses from/onto the skeletons involved (the active or the selected ones). */
    var makeMultipleBarChart = function(partners, container, title) {
        if (0 === Object.keys(partners).length) return null;

        // Prepare data: (skip skeletons with less than 2 nodes)
        var a = distribution(partners, 2);

        // The skeletons involved (the active, or the selected and visible)
        var skids = Object.keys(a.reduce(function(unique, block) {
            if (block) block.forEach(function(ob) { unique[ob.skid] = null; });
            return unique;
        }, {}));

        if (0 === skids.length) return null;

        // Colors: an array of hex values
        var zeroPad = function(s) { return ("0" + s).slice(-2); }
        var colors = skids.reduce(function(array, skid, i) {
            // Start at Red 255, decrease towards 0
            //          Green 100, increase towards 255
            //          Blue 200, decrease towards 50
            var ratio = (skids.length - i) / skids.length;
            var red = 255 * ratio;
            var green = 100 + 155 * (1 - ratio);
            var blue = 50 + 150 * ratio;
            array.push("#"
                + zeroPad(Number(red | 0).toString(16))
                + zeroPad(Number(green | 0).toString(16))
                + zeroPad(Number(blue | 0).toString(16))); // as hex
            return array;
        }, []);

        // The SVG element representing the plot
        var margin = {top: 20, right: 20, bottom: 30, left: 40},
            width = 960 - margin.left - margin.right,
            height = 500 - margin.top - margin.bottom;

        var svg = d3.select(container).append("svg")
            .attr("id", "connectivity_plot_" + title)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Define the data domains/axes
        var x0 = d3.scale.ordinal().rangeRoundBands([0, width], .1);
        var x1 = d3.scale.ordinal();
        var y = d3.scale.linear().range([height, 0]);
        var xAxis = d3.svg.axis().scale(x0)
                                 .orient("bottom");
        var yAxis = d3.svg.axis().scale(y)
                                 .orient("left")
                                 .tickFormat(d3.format("d")); // "d" means integer, see https://github.com/mbostock/d3/wiki/Formatting#wiki-d3_format


        // Define the ranges of the axes
        // x0: For the counts of synapses
        x0.domain(a.map(function(block, i) { return i+1; }));
        // x1: For the IDs of the skeletons within each synapse count bin
        x1.domain(skids).rangeRoundBands([0, x0.rangeBand()]);
        // y: the number of partners that have that number of synapses
        var max_count = a.reduce(function(c, block) {
            return block.reduce(function(c, sk) {
                return Math.max(c, sk.count);
            }, c);
        }, 0);
        y.domain([0, max_count]);

        // Color for the bar chart bars
        var color = d3.scale.ordinal().range(colors);

        // Insert the data
        var state = svg.selectAll(".state")
            .data(a)
          .enter().append('g')
            .attr('class', 'g')
            .attr('transform', function(a, i) { return "translate(" + x0(i+1) + ", 0)"; }); // x0(i+1) has a +1 because the array is 0-based

        // Define how each bar of the bar chart is drawn
        state.selectAll("rect")
            .data(function(block) { return block; })
          .enter().append("rect")
            .attr("width", x1.rangeBand())
            .attr("x", function(sk) { return x1(sk.skid); })
            .attr("y", function(sk) { return y(sk.count); })
            .attr("height", function(sk) { return height - y(sk.count); })
            .style("fill", function(sk) { return color(sk.skid); });

        // Insert the graphics for the axes (after the data, so that they draw on top)
        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis)
          .append("text")
            .attr("x", width)
            .attr("y", -6)
            .style("text-anchor", "end")
            .text("N synapses");

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
          .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
            .text("N " + title + " Partners");

        // The legend: which skeleton is which
        var legend = svg.selectAll(".legend")
            .data(skids.map(function(skid) { return skeletons[skid]; } ))
          .enter().append("g")
            .attr("class", "legend")
            .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

        legend.append("rect")
            .attr("x", width - 18)
            .attr("width", 18)
            .attr("height", 18)
            .style("fill", color);

        legend.append("text")
            .attr("x", width - 24)
            .attr("y", 9)
            .attr("dy", ".35em")
            .style("text-anchor", "end")
            .text(function(d) { return d; });
    };

    makeMultipleBarChart(json.incoming, "#connectivity_widget" + this.widgetID, "Upstream" + this.widgetID);
    makeMultipleBarChart(json.outgoing, "#connectivity_widget" + this.widgetID, "Downstream" + this.widgetID);
};
