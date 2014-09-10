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
          show_table(skid, relation, json);
        });
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

  var show_table = function(skid, relation, json) {
    WindowMaker.show('create-connector-selection');
    // Write the label
    var text = 'Synapses ' + ('presynaptic_to' === relation ? 'post' : 'pre') + 'synaptic to skeleton #' + skid;
    $('#connector-selection-label').text(text);

    // Split up the JSON reply
    var locations = {}; // keys are connector IDs
    var rows = [];

    json.forEach(function(row) {
      rows.push([row[0],
                 row[2], row[3], row[4], row[5],
                 row[7], row[8], row[9], row[10]]);
      locations[row[0]] = {connector: row[1],
                           treenode1: row[6],
                           treenode2: row[11]};
    });

    // Populate the table
    table.fnClearTable(0);
    table.fnAddData(rows);

    // Specify what happens on double click
    $('#connectorselectiontable tbody tr').on('dblclick', function(evt) {
      var aData = table.fnGetData(this);
      var cell = $(evt.target).closest('td').index();
      var loc = locations[aData[0]];
      var tnid;
      if (0 === cell) {
        loc = loc.connector;
        tnid = aData[0];
      } else if (cell < 5) {
        loc = loc.treenode1;
        tnid = aData[1];
      } else {
        loc = loc.treenode2;
        tnid = aData[5];
      }
      SkeletonAnnotations.staticMoveTo(loc[2], loc[1], loc[0],
        function() {
          SkeletonAnnotations.staticSelectNode(tnid);
        });
    });
  };
}();
