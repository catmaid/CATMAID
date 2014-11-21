/** Represents a table listing the synapses between the active or the selected skeletons vs a specific partner skeleton. */
var ConnectorSelection = new function()
{
  var self = this;
  var table = null;

  this.show_shared_connectors = function(skid, skids, relation) {
    requestQueue.register(django_url + project.id + '/connector/list/one_to_many', 'POST',
        {skid: skid,
         skids: skids,
         relation: relation}, 
        function(status, text) {
          if (200 !== status) return;
          var json = $.parseJSON(text);
          if (json.error) {
            alert(json.error);
            return;
          }
          var text = 'Synapses ' + ('presynaptic_to' === relation ? 'post' : 'pre') + 'synaptic to skeleton #' + skid;
          show_table(text, json);
        });
  };

  /**
   * Display a list of already aquired connector links. A list of lists
   * (connectors) is expected, each connector has entries that correspond to the
   * displayed table: connector id, connector X, Y, Z, node 1, skeleton 1,
   * confidence 1, creator 1, node 1 X, Y, Y, node 2, skeleton 2, confidence 2,
   * creator 2, node 2 X, Y, Z.
   */
  this.show_connectors = function(connectors) {
    show_table("", connectors);
  };

  this.init = function() {
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
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
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

  var show_table = function(header, connectors) {
    WindowMaker.show('create-connector-selection');
    // Write the label
    $('#connector-selection-label').text(header);

    // Split up the JSON reply
    var locations = {}; // keys are connector IDs
    var rows = [];

    connectors.forEach(function(row) {
      rows.push([row[0],
                 row[2], row[3], row[4], User.safe_get(row[5]).login,
                 row[7], row[8], row[9], User.safe_get(row[10]).login]);
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
}();
