/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ConnectorTable = new function()
{
  /** Pointer to the existing instance of table. */
  this.connectorTable = null;

  var self = this;
  var asInitValsSyn = new Array();
  var skeletonID = -1;
  var last_displayed_skeletons = {};
  last_displayed_skeletons[0] = 'None';
  var possibleLengths = [25, 100, -1];
  var possibleLengthsLabels = possibleLengths.map(
    function (n) { return (n === -1) ? "All" : n.toString() });

  this.updateConnectorTable = function() {
    self.setSkeleton( -1 );
    self.connectorTable.fnClearTable( 0 );
    self.connectorTable.fnDraw();
  }

  this.refreshConnectorTable = function() {
    self.connectorTable.fnClearTable( 0 );
    self.connectorTable.fnDraw();
  }

  this.setSkeleton = function( skeleton_id ) {
    skeletonID = skeleton_id;
  }
  
  this.init = function (pid) {
    var tableid = '#connectortable';

    $("#connectortable_lastskeletons").change(function() {
      skeletonID = parseInt( $('#connectortable_lastskeletons').val() );
      self.refreshConnectorTable();
    });
    
    self.connectorTable = $(tableid).dataTable(
      {
        // http://www.datatables.net/usage/options
        "bDestroy": true,
        "sDom": '<"H"lr>t<"F"ip>',
        // default: <"H"lfr>t<"F"ip>
        "bProcessing": true,
        "bServerSide": true,
        "bAutoWidth": false,
        "iDisplayLength": possibleLengths[0],
        // "sAjaxSource": 'model/connector.list.php',
        "sAjaxSource": django_url + project.id + '/connector/table/list',
        "fnServerData": function (sSource, aoData, fnCallback) {

          if( skeletonID === -1 ) {
            skeletonID = SkeletonAnnotations.getActiveSkeletonId();
          }

          if (!skeletonID) {
            $('#growl-alert').growlAlert({
              autoShow: true,
              content: 'You need to activate a treenode to display the connector table of its skeleton.',
              title: 'BEWARE',
              position: 'top-right',
              delayTime: 2500,
              onComplete: function() {
                g.remove();
              }
            });
            skeletonID = 0;
          }

          aoData.push({
            "name": "relation_type",
            "value" : $('#connector_relation_type :selected').attr("value")
          });
          aoData.push({
            "name" : "pid",
            "value" : pid
          });
          aoData.push({
            "name" : "skeleton_id",
            "value" : skeletonID
          });
          aoData.push({
            "name": "stack_id",
            "value": project.focusedStack.id
          });

          if( skeletonID && !(skeletonID in last_displayed_skeletons) ) {
            // check if skeleton id already in list, of so, do not add it
            last_displayed_skeletons[ skeletonID ] = $('#neuronName').text();
            var new_skeletons = document.getElementById("connectortable_lastskeletons");
            while (new_skeletons.length > 0)
                new_skeletons.remove(0);
            for (var skid in last_displayed_skeletons) {
              if (last_displayed_skeletons.hasOwnProperty(skid)) {
                var option = document.createElement("option");
                option.text = last_displayed_skeletons[ skid ];
                option.value = skid;
                new_skeletons.appendChild(option);
              }
            }
          }
          $('#connectortable_lastskeletons').val( skeletonID );

          $.ajax({
            "dataType": 'json',
            "cache": false,
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": fnCallback
          });

        },
        "aLengthMenu": [
          possibleLengths,
          possibleLengthsLabels
        ],
        "bJQueryUI": true,
        "aoColumns": [
          {
            "bSearchable": false,
            "bSortable": true
          }, // connector id
          {
            "sClass": "center",
            "bSearchable": false
          }, // other skeleton id
          {
            "sClass": "center",
            "bSearchable": false
          }, // x
          {
            "sClass": "center",
            "bSearchable": false
          }, // y
          {
            "sClass": "center",
            "bSearchable": false
          }, // z
          {
            "sClass": "center",
            "bSearchable": false,
            "bSortable": true
          }, // section index
          {
            "bSearchable": false,
            "bSortable": true
          }, // connectortags
          {
            "bSearchable": false,
            "bSortable": true
          }, // number of nodes
          {
            "bVisible": true,
            "bSortable": true
          }, // username
          {
            "bSearchable": false,
            "bSortable": true,
            "bVisible": true
          }, // treenodes
          {
            "bSearchable": false,
            "bSortable": true,
            "bVisible": true
          } // last modified
        ]
      });

    $(tableid + " tfoot input").keyup(function () { /* Filter on the column (the index) of this element */
      self.connectorTable.fnFilter(this.value, $("tfoot input").index(this));
    });

    /*
     * Support functions to provide a little bit of 'user friendlyness' to the textboxes in
     * the footer
     */
    $(tableid + " tfoot input").each(function (i) {
      asInitValsSyn[i] = this.value;
    });

    $(tableid + " tfoot input").focus(function () {
      if (this.className == "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    $(tableid + " tfoot input").blur(function (i) {
      if (this.value == "") {
        this.className = "search_init";
        this.value = asInitValsSyn[$("tfoot input").index(this)];
      }
    });

    $(tableid + " tbody tr").live('dblclick', function () {
      var idToActivate, skeletonID;
      var aData = self.connectorTable.fnGetData(this);
      // retrieve coordinates and moveTo
      var x = parseFloat(aData[2]);
      var y = parseFloat(aData[3]);
      var z = parseFloat(aData[4]);

      // If there is a partner treenode, activate that - otherwise
      // activate the connector itself:
      if (aData[9]) {
        idToActivate = parseInt(aData[9], 10);
        skeletonID = parseInt(aData[1], 10);
      } else {
        idToActivate = parseInt(aData[0], 10);
        skeletonID = null;
      }

      SkeletonAnnotations.staticMoveTo(z, y, x,
        function () {
          SkeletonAnnotations.staticSelectNode(idToActivate, skeletonID);
        });
    });

    $('#connector_relation_type').change(function() {
      var numberOfNodesText, otherSkeletonText, otherTreenodeText, adjective;
      self.connectorTable.fnDraw();
      if ($('#connector_relation_type :selected').attr("value") === "0") {
        adjective = "source";
      } else {
        adjective = "target";
      }
      numberOfNodesText = "# nodes in " + adjective + " skeleton"
      otherSkeletonText = adjective + " skeleton ID";
      otherTreenodeText = adjective + " treenode ID";
      $("#connector_nr_nodes_top").text(numberOfNodesText);
      $("#connector_nr_nodes_bottom").text(numberOfNodesText);
      $("#other_skeleton_top").text(otherSkeletonText);
      $("#other_skeleton_bottom").text(otherSkeletonText);
      $("#other_treenode_top").text(otherTreenodeText);
      $("#other_treenode_bottom").text(otherTreenodeText);
    });

  }
}
