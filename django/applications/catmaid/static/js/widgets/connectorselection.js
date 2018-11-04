/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var table = null;

  /** Represents a table listing the synapses between the active or the selected skeletons vs a specific partner skeleton. */
  var ConnectorSelection = function() {};

  ConnectorSelection.prototype.show_shared_connectors = function(skids1, skids2, relation) {
    return new CATMAID.fetch(project.id + '/connector/list/many_to_many', 'POST', {
        skids1: skids1,
        skids2: skids2,
        relation: relation
      })
      .then(function(json) {
        var text;
        if ('presynaptic_to' === relation) {
          text = 'Synapses postsynaptic to';
        } else if ('postsynaptic_to' === relation) {
          text = 'Synapses presynaptic to';
        } else if ('gapjunction_with' === relation) {
          text = 'Gap junctions with';
        } else if ('tightjunction_with' === relation) {
          text = 'Tight junction with';
        } else if ('desmosome_with' === relation) {
          text = 'Desmosome with';
        }
        if (text !== undefined) {
          text += ' neuron' + (skids1.length > 1 ? 's' : '') + ' '
               + skids1.map(CATMAID.NeuronNameService.getInstance().getName).join(', ');
          show_table(text, json, relation);
        } else {
          throw new CATMAID.ValueError('Unsupported relation: ' + relation);
        }
      })
      .catch(CATMAID.handleError);
  };

  ConnectorSelection.prototype.getName = function() {
    return 'Connector Selection Table';
  };

  ConnectorSelection.prototype.getWidgetConfiguration = function() {
    return {
      contentID: 'connector_selection_widget',
      createContent: function(content) {
        var div = document.createElement('div');
        div.setAttribute('id', 'connector-selection-label');
        content.appendChild(div);

        var container = document.createElement('div');
        container.setAttribute("id", "connector_selection_widget");
        content.appendChild(container);

        container.innerHTML =
          '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectorselectiontable">' +
            '<thead>' +
              '<tr>' +
                '<th>Connector</th>' +
                '<th>Node 1</th>' +
                '<th class="preheader">Presyn. neuron</th>' +
                '<th>C 1</th>' +
                '<th>Creator 1</th>' +
                '<th>Node 2</th>' +
                '<th class="postheader">Postsyn. neuron</th>' +
                '<th>C 2</th>' +
                '<th>Creator 2</th>' +
              '</tr>' +
            '</thead>' +
            '<tfoot>' +
              '<tr>' +
                '<th>Connector</th>' +
                '<th>Node 1</th>' +
                '<th class="preheader">Presyn. neuron</th>' +
                '<th>C 1</th>' +
                '<th>Creator 1</th>' +
                '<th>Node 2</th>' +
                '<th class="postheader">Postsyn. neuron</th>' +
                '<th>C 2</th>' +
                '<th>Creator 2</th>' +
              '</tr>' +
            '</tfoot>' +
            '<tbody>' +
              '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
            '</tbody>' +
          '</table>';
      },
      init: function() {
        CATMAID.ConnectorSelection.init();
      }
    };
  };

  /**
   * Load all connectors in the passed in list and display a connector selcetion
   * for the result.
   */
  ConnectorSelection.prototype.showConnectors = function(connectorIds, skeletonIds) {
    if ((!connectorIds || !connectorIds.length) && (!skeletonIds || !skeletonIds.length)) {
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
    WindowMaker.show('connector-selection');
    // Write the label
    $('#connector-selection-label').text(header);

    // Set proper table titles
    var titles;
    if (relation == 'presynaptic_to') {
      titles = ['Presyn. neuron', 'Postsyn. neuron'];
    } else if (relation == 'postsynaptic_to') {
      titles = ['Postsyn. neuron', 'Presyn. neuron'];
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
      SkeletonAnnotations.staticMoveTo(loc[2], loc[1], loc[0])
          .then(function() {
            return SkeletonAnnotations.staticSelectNode(nid);
          })
          .catch(CATMAID.handleError);
    });
  };

  // Make widget available in CATMAID namespace
  CATMAID.ConnectorSelection = new ConnectorSelection();

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Connector Selection",
    description: "A simple connector table",
    key: "connector-selection",
    creator: ConnectorSelection
  });

})(CATMAID);
