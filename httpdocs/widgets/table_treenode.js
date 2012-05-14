/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


function updateTreenodeTable() {
  //TreenodeTable.init( project.getId() );
  TreenodeTable.oTable.fnClearTable( 0 );
  TreenodeTable.oTable.fnDraw();
}

var TreenodeTable = new function()
{
  var ns = this; // reference to the namespace
  ns.oTable = null;
  var asInitVals = [];
  var skelid;

  this.init = function (pid)
  {
    ns.pid = pid;
    ns.oTable = $('#treenodetable').dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": true,
      "bAutoWidth": false,
      "sAjaxSource": 'model/treenode.table.list.php',
      "fnServerData": function (sSource, aoData, fnCallback) {
        var key;
        // remove all selected elements in table
        for (var key in project.selectedObjects.table_treenode) {
          if (project.selectedObjects.table_treenode.hasOwnProperty(key)) {
            // FIXME: use splice(1,1) instead
            delete project.selectedObjects.table_treenode[key];
          }
        }

        skelid = SkeletonAnnotations.getActiveSkeletonId();
        if (skelid !== null) {
          // give priority to showing treenodes
          aoData.push({
            "name": "skeleton_0",
            "value": skelid
          });
          aoData.push({
            "name": "skeleton_nr",
            "value": 1
          });
        } else {
          // check if a treenode is active
          // send active treenode when set
          var atnID = SkeletonAnnotations.getActiveNodeId();
          if (atnID && SkeletonAnnotations.getActiveNodeType() === "treenode") {
            aoData.push({
              "name": "atnid",
              "value": atnID
            });
          }
        }

        aoData.push({
          "name": "pid",
          "value": pid
        });
        aoData.push({
          "name": "stack_id",
          "value": project.focusedStack.id
        });


        $.ajax({
          "dataType": 'json',
          "type": "POST",
          "cache": false,
          "url": sSource,
          "data": aoData,
          "success": fnCallback
        });
      },
      "iDisplayLength": -1,
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
      "bJQueryUI": true,
      "fnDrawCallback": function () {
        $('td:eq(6)', ns.oTable.fnGetNodes()).editable('model/treenode.table.update.php', {
          "callback": function (sValue, y) {},
          "submitdata": function (value, settings) {
            var aPos = ns.oTable.fnGetPosition(this);
            var aData = ns.oTable.fnGetData(aPos[0]);
            return {
              "id": aData[0],
              "type": "radius",
              "pid": project.id
            };
          },
          "height": "14px"
        });
      },
/*      "fnRowCallback": function (nRow, aData, iDisplayIndex) {

        if (aData[1] === "R") {
          $(nRow).addClass('root_node');
        }
        if (aData[1] === "L") {
          $(nRow).addClass('leaf_node');
        }

        var atnID = SkeletonAnnotations.getActiveNodeId();
        if (atnID) {
          if (parseInt(aData[0], 10) === atnID) {
            // just to be sure
            $(nRow).removeClass('root_node');
            $(nRow).removeClass('leaf_node');
            // highlight row of active treenode
            $(nRow).addClass('highlight_active');
          }
        }
        return nRow;
      },*/
      "aoColumns": [{
        "sClass": "center",
        "bSearchable": false,
        "bSortable": true,
        "bVisible": false
      }, // id
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": false,
        "sWidth": "50px"
      }, // type
      {
        "bSearchable": true,
        "bSortable": false,
        "sWidth": "150px"
      }, // labels
      {
        "sClass": "center",
        "bSearchable": false,
        "sWidth": "50px"
      }, // confidence
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
        "bSortable": false
      }, // section index
      {
        "sClass": "center",
        "bSearchable": false
      }, // radius
      {
        "bSearchable": false
      }, // username
      {
        "bSearchable": false,
        "bSortable": true
      }, // last modified
      {
          "bSearchable": false,
          "bSortable": true
      } // reviewer
      ]
    });

    // filter table
    $.each(asInitVals, function(index, value) {
      if(value==="Search")
        return;
      if(value) {
        ns.oTable.fnFilter(value, index);
      }
    });

    $("#treenodetable thead input").keyup(function () { /* Filter on the column (the index) of this element */
      var i = $("thead input").index(this) + 2;
      asInitVals[i] = this.value;
      ns.oTable.fnFilter(this.value, i);
    });

    $("#treenodetable thead input").each(function (i) {
      asInitVals[i+2] = this.value;
    });

    $("#treenodetable thead input").focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    $("#treenodetable thead input").blur(function (event) {
      if (this.value === "") {
        this.className = "search_init";
        this.value = asInitVals[$("thead input").index(this)+2];
      }
    });

    $('select#search_type').change( function() {
      ns.oTable.fnFilter( $(this).val(), 1 );
      asInitVals[1] = $(this).val();
    });

    $("#treenodetable tbody tr").live('dblclick', function () {

      var aData = ns.oTable.fnGetData(this);
      // retrieve coordinates and moveTo
      var x = parseFloat(aData[4]);
      var y = parseFloat(aData[5]);
      var z = parseFloat(aData[6]);
      var id = parseInt(aData[0], 10);
      project.moveTo(z, y, x, undefined,
                     function () {
                       SkeletonAnnotations.staticSelectNode(id);
                     });
    });
  };
}