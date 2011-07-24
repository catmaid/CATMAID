/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ConnectorTable = new function()
{
  /** Pointer to the existing instance of table. */
  this.connectorTable = null;

  var self = this;
  var asInitValsSyn = new Array();

  this.init = function (pid) {
    var tableid = '#connectortable';
    var atn = SkeletonAnnotations.getActiveNode();

    self.connectorTable = $(tableid).dataTable(
      {
        // http://www.datatables.net/usage/options
        "bDestroy": true,
        "sDom": '<"H"lr>t<"F"ip>',
        // default: <"H"lfr>t<"F"ip>
        "bProcessing": true,
        "bServerSide": true,
        "bAutoWidth": false,
        "sAjaxSource": 'model/connector.list.php',
        "fnServerData": function (sSource, aoData, fnCallback) {

          var skeletonid;
          if (atn !== null) {
            skeletonid = atn.skeleton_id;
          } else {
            var g = $('body').append('<div id="growl-alert" class="growl-message"></div>').find('#growl-alert');
            g.growlAlert({
              autoShow: true,
              content: 'You need to activate a treenode to display the connector table of its skeleton.',
              title: 'BEWARE',
              position: 'top-right',
              delayTime: 2500,
              onComplete: function() {
                g.remove();
              }
            });
            skeletonid = 0;
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
            "value" : skeletonid
          });
          $.ajax({
            "dataType": 'json',
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": fnCallback
          });

        },
        "aLengthMenu": [
          [10, 25, 50, -1],
          [10, 25, 50, "All"]
        ],
        "bJQueryUI": true,
        "aoColumns": [
          {
            "bSearchable": false,
            "bSortable": true
          },
          // connector id
          {
            "sClass": "center",
            "bSearchable": false
          },
          // x
          {
            "sClass": "center",
            "bSearchable": false
          },
          // y
          {
            "sClass": "center",
            "bSearchable": false
          },
          // z
          {
            "bSearchable": false,
            "bSortable": true
          },
          // connectortags
          {
            "bSearchable": false,
            "bSortable": true
          },
          // number of nodes
          {
            "bVisible": true,
            "bSortable": true
          },
          // username
          {
            "bSearchable": false,
            "bSortable": true,
            "bVisible": false
          } // treenodes
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

      var aData = self.connectorTable.fnGetData(this);
      // retrieve coordinates and moveTo
      var x = parseFloat(aData[1]);
      var y = parseFloat(aData[2]);
      var z = parseFloat(aData[3]);
      project.moveTo(z, y, x);

      // activate the treenode with a delay
      var id = parseInt(aData[7], 10);
      window.setTimeout("SkeletonAnnotations.getSVGOverlay(project.getStack()).selectNode( " + id + " )", 1000);

    });

    $('#connector_relation_type').change(function() {
      self.connectorTable.fnDraw();
      if ($('#connector_relation_type :selected').attr("value")) {
        $("#connector_nr_nodes_top").text("# nodes for source(s)");
      } else {
        $("#connector_nr_nodes_top").text("# nodes for target(s)");
      }

    });

  }
}