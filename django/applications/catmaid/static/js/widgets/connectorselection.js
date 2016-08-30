/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var table = null;

  /** Represents a table listing the synapses between the active or the selected skeletons vs a specific partner skeleton. */
  var ConnectorSelection = function() {};

  ConnectorSelection.prototype.show_shared_connectors = function(skids1, skids2, relation) {
    requestQueue.register(django_url + project.id + '/connector/list/many_to_many', 'POST',
        {skids1: skids1,
        skids2: skids2,
        relation: relation},
        function(status, text) {
          if (200 !== status) return;
          var json = JSON.parse(text);
          if (json.error) {
            alert(json.error);
            return;
          }
          var text;
          if ('presynaptic_to' === relation) {
            text = 'Synapses presynaptic to';
          } else if ('postsynaptic_to' === relation) {
            text = 'Synapses postsynaptic to';
          } else if ('gapjunction_with' === relation) {
            text = 'Gap junctions with';
          }
          if (text !== undefined) {
            text += ' neuron' + (skids1.length > 1 ? 's' : '') + ' '
                 + skids1.map(CATMAID.NeuronNameService.getInstance().getName).join(', ');
            show_table(text, json, relation);
          } else {
            alert('Unsupported relation: ' + relation);
          }
        });
  };

  /**
   * Load all connectors in the passed in list and display a connector selcetion
   * for the result.
   */
  ConnectorSelection.prototype.showConnectors = function(connectorIds, skeletonIds) {
    if ((!connectorIds || !connectorId.length) && (!skeletonIds || !skeletonIds.length)) {
      CATMAID.warn("No skeletons or connectors provided");
      return;
    }
    CATMAID.Connectors.list(project.id, connectorIds, skeletonIds)
      .then(function(result) {
        show_table("", result.connectors, null);
      });
  };

  /**
  * Display a list of already aquired connector links. A list of lists
  * (connectors) is expected, each connector has entries that correspond to the
  * displayed table: connector id, connector X, Y, Z, node 1, skeleton 1,
  * confidence 1, creator 1, node 1 X, Y, Y, node 2, skeleton 2, confidence 2,
  * creator 2, node 2 X, Y, Z.
  */
  ConnectorSelection.prototype.show_connectors = function(connectors) {
    show_table("", connectors);
  };

  ConnectorSelection.prototype.init = function() {
    if (table) {
      table.remove();
    }

    table = $('#connectorselectiontable').dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": false, // Enable sorting locally, and prevent sorting from calling the fnServerData to reload the table -- an expensive and undesirable operation.
      "bAutoWidth": false,
      "iDisplayLength": -1,
      "aLengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      //"aLengthChange": false,
      "bJQueryUI": true,
      "aoColumns": [
      { // Connector
        "bSearchable": true,
        "bSortable": true
      },
      { // Treenode 1
        "bSearchable": true,
        "bSortable": true
      },
      { // Skeleton 1
        "bSearchable": true,
        "bSortable": true,
      },
      { // Confidence 1
        "bSearchable": true,
        "bSortable": true
      },
      { // Creator 1
        "bSearchable": true,
        "bSortable": true
      },
      { // Treenode 2
        "bSearchable": true,
        "bSortable": true
      },
      { // Skeleton 2
        "bSearchable": true,
        "bSortable": true,
      },
      { // Confidence 2
        "bSearchable": true,
        "bSortable": true
      },
      { // Creator 2
        "bSearchable": true,
        "bSortable": true
      }
      ]
    });
  };

  var show_table = function(header, connectors, relation) {
    if (!connectors || 0 === connectors.length) {
      CATMAID.warn("No connectors to show");
      return;
    }
    WindowMaker.show('create-connector-selection');
    // Write the label
    $('#connector-selection-label').text(header);
    
    // Set proper table titles
    var titles;
    if (relation == 'presynaptic_to' || relation == 'postsynaptic_to' || relation === undefined) {
      titles = ['Presyn. neuron', 'Postsyn. neuron'];
    } else {
      titles = ['Neuron 1', 'Neuron 2'];
    }
    $('#connectorselectiontable thead th.preheader div').html(function() {
      return titles[0] + $(this).children()[0].outerHTML;
    });
    $('#connectorselectiontable thead th.postheader div').html(function() {
      return titles[1] + $(this).children()[0].outerHTML;
    });
    $('#connectorselectiontable tfoot th.preheader').html(titles[0]);
    $('#connectorselectiontable tfoot th.postheader').html(titles[1]);


    // Split up the JSON reply
    var locations = {}; // keys are connector IDs
    var rows = [];

    connectors.forEach(function(row) {
      rows.push([row[0],
                row[2], CATMAID.NeuronNameService.getInstance().getName(row[3]),
                row[4], CATMAID.User.safe_get(row[5]).login,
                row[7], CATMAID.NeuronNameService.getInstance().getName(row[8]),
                row[9], CATMAID.User.safe_get(row[10]).login]);
      // Store all locations (overwriting can be ignored, it is the same data)
      locations[row[0]] = row[1];
      locations[row[2]] = row[6];
      locations[row[7]] = row[11];
    });

    // Populate the table
    table.fnClearTable(0);
    table.fnAddData(rows);

    // Specify what happens on double click
    $('#connectorselectiontable tbody tr').on('dblclick', function(evt) {
      var aData = table.fnGetData(this);
      var cell = $(evt.target).closest('td').index();
      var nid;
      if (0 === cell) {
        nid = aData[0];
      } else if (cell < 5) {
        nid = aData[1];
      } else {
        nid = aData[5];
      }
      var loc = locations[nid];
      SkeletonAnnotations.staticMoveTo(loc[2], loc[1], loc[0],
        function() {
          SkeletonAnnotations.staticSelectNode(nid);
        });
    });
  };

  // Make widget available in CATMAID namespace
  CATMAID.ConnectorSelection = new ConnectorSelection();

})(CATMAID);
