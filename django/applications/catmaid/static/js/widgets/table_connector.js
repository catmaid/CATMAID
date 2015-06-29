/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ConnectorTable = function(optionalSkid)
{
  this.widgetID = this.registerInstance();

  /** Pointer to the existing instance of table. */
  this.connectorTable = null;

  var self = this;
  var asInitValsSyn = [];
  var skeletonID = optionalSkid ? optionalSkid : -1;
  var possibleLengths = [25, 100, -1];
  var possibleLengthsLabels = possibleLengths.map(
    function (n) { return (n === -1) ? "All" : n.toString(); });

  this.updateConnectorTable = function() {
    self.setSkeleton( -1 );
    self.connectorTable.fnClearTable( 0 );
    self.connectorTable.fnDraw();
  };

  this.refreshConnectorTable = function() {
    self.connectorTable.fnClearTable( 0 );
    self.connectorTable.fnDraw();
  };

  this.setSkeleton = function( skeleton_id ) {
    skeletonID = skeleton_id;
  };
  
  this.init = function (pid) {
    var widgetID = this.widgetID;
    var tableid = '#connectortable' + widgetID;
    
    self.connectorTable = $(tableid).dataTable(
      {
        "bDestroy": true,
        "sDom": '<"H"lr>t<"F"ip>',
        "bProcessing": true,
        "bServerSide": true,
        "bAutoWidth": false,
        "iDisplayLength": possibleLengths[0],
        "sAjaxSource": django_url + project.id + '/connector/table/list',
        "fnServerData": function (sSource, aoData, fnCallback) {

          if( skeletonID === -1 ) {
            skeletonID = SkeletonAnnotations.getActiveSkeletonId();
          }

          if (!skeletonID) {
            CATMAID.msg('BEWARE', 'You need to activate a treenode to display ' +
                'the connector table of its skeleton.');
            skeletonID = 0;
          }

          aoData.push({
            "name": "relation_type",
            "value" : $('#connector_relation_type' + widgetID + ' :selected').attr("value")
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
            "value": project.focusedStackViewer.primaryStack.id
          });

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
          }, // confidence
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
      if (this.value == "") { // jshint ignore:line
        this.className = "search_init";
        this.value = asInitValsSyn[$("tfoot input").index(this)];
      }
    });

    $(tableid + " tbody").on('dblclick', 'tr', function () {
      var idToActivate, skeletonID;
      var aData = self.connectorTable.fnGetData(this);
      // retrieve coordinates and moveTo
      var x = parseFloat(aData[2]);
      var y = parseFloat(aData[3]);
      var z = parseFloat(aData[4]);

      // If there is a partner treenode, activate that - otherwise
      // activate the connector itself:
      if (aData[10]) {
        idToActivate = parseInt(aData[10], 10);
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

    $('#connector_relation_type' + widgetID).change(function() {
      var numberOfNodesText, otherSkeletonText, otherTreenodeText, adjective;
      self.connectorTable.fnDraw();
      if ($('#connector_relation_type' + widgetID + ' :selected').attr("value") === "0") {
        adjective = "source";
      } else {
        adjective = "target";
      }
      numberOfNodesText = "# nodes in " + adjective + " skeleton";
      otherSkeletonText = adjective + " skeleton ID";
      otherTreenodeText = adjective + " treenode ID";
      $("#connector_nr_nodes_top" + widgetID).text(numberOfNodesText);
      $("#connector_nr_nodes_bottom" + widgetID).text(numberOfNodesText);
      $("#other_skeleton_top" + widgetID).text(otherSkeletonText);
      $("#other_skeleton_bottom" + widgetID).text(otherSkeletonText);
      $("#other_treenode_top" + widgetID).text(otherTreenodeText);
      $("#other_treenode_bottom" + widgetID).text(otherTreenodeText);
    });

  };
};

ConnectorTable.prototype = {};
$.extend(ConnectorTable.prototype, new InstanceRegistry());

ConnectorTable.prototype.getName = function() {
  return "Connector table " + this.widgetID;
};

ConnectorTable.prototype.destroy = function() {
  this.unregisterInstance();
};
