/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


/** Namespace TreenodeTable */
var TreenodeTable = new function()
{
  var ns = this; // reference to the namespace
  ns.oTable = null;
  var skelid = -1; // Skeleton currently shown
  var last_displayed_skeletons = {};
  last_displayed_skeletons[0] = 'None';

  var filter_nodetype = 'LR', filter_searchtag = '';

  this.setSkeleton = function( skeleton_id ) {
    skelid = parseInt(skeleton_id, 10);
  };

  /** Update the table to list the nodes of the active skeleton. */
  this.update = function() {
    var skid = SkeletonAnnotations.getActiveSkeletonId();
    if (skid) {
      ns.setSkeleton( skid ); // -1 means: trigger picking the selected skeleton
      $('#search_labels').val( filter_searchtag );
      ns.oTable.fnClearTable( 0 );
      ns.oTable.fnDraw();
    } else {
      // Nothing selected, or a connector
      alert("Select a skeleton first!");
    }
  };

  /** Update the table to list the nodes of the skeleton currently being listed. */
  this.refresh = function() {
    if (ns.oTable && skelid > 0) {
      $('#search_labels').val( filter_searchtag );
      ns.oTable.fnClearTable( 0 );
      ns.oTable.fnDraw();
    }
  };

  this.init = function (pid)
  {
    $("#treenodetable_lastskeletons").change(function() {
      skelid = parseInt( $('#treenodetable_lastskeletons').val() );
      ns.refresh();
    });

    ns.pid = pid;
    ns.oTable = $('#treenodetable').dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": true,
      "bAutoWidth": false,
      // "sAjaxSource": 'model/treenode.table.list.php',
      "sAjaxSource": django_url + project.id + '/treenode/table/list',
      "fnServerData": function (sSource, aoData, fnCallback) {

        if( -1 === skelid ) {
          skelid = SkeletonAnnotations.getActiveSkeletonId();
        }
        aoData.push({
          "name": "skeleton_0",
          "value": skelid
        });
        aoData.push({
          "name": "skeleton_nr",
          "value": 1
        });
        aoData.push({
          "name": "pid",
          "value": pid
        });
        aoData.push({
          "name": "stack_id",
          "value": project.focusedStack.id
        });

        // set type to bSearch_0
        for( var i = 0; i < aoData.length; i++ ) {
          if( aoData[i]['name'] === 'sSearch_1' ) {
            aoData[i]['value'] = filter_nodetype;
          }
          if( aoData[i]['name'] === 'sSearch_2' ) {
            aoData[i]['value'] = filter_searchtag;
          }
        }

        if( skelid && !(skelid in last_displayed_skeletons) ) {
          // check if skeleton id already in list, and if so, do not add it
          last_displayed_skeletons[ skelid ] = $('#neuronName').text();
          var new_skeletons = document.getElementById("treenodetable_lastskeletons");
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
        $('#treenodetable_lastskeletons').val( skelid );

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
        //$('td:eq(7)', ns.oTable.fnGetNodes()).editable('model/treenode.table.update.php',
        $('td:eq(7)', ns.oTable.fnGetNodes()).editable(django_url + project.id + '/treenode/table/update', {
          "submitdata": function (value, settings) {
            var aPos = ns.oTable.fnGetPosition(this);
            var aData = ns.oTable.fnGetData(aPos[0]); // checks for valid numeric value
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
      }, // section index: not sortable due to the index being computed after sorting
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
          "bSortable": false
      } // reviewer
      ]
    });

    $("#treenodetable thead input").keydown(function (event) { /* Filter on the column (the index) of this element */
      // filter table on hit enter
      if( event.which == 13 ) {
        filter_searchtag = $('#search_labels').val();
        TreenodeTable.refresh();
      }
    });

    // remove the 'Search' string when first focusing the search box
    $("#treenodetable thead input").focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    $('select#search_type').change( function() {
      filter_nodetype = $(this).val();
      TreenodeTable.refresh();
    });

    $("#treenodetable tbody tr").live('dblclick', function () {
      var aData = ns.oTable.fnGetData(this);
      // retrieve coordinates and moveTo
      var x = parseFloat(aData[4]);
      var y = parseFloat(aData[5]);
      var z = parseFloat(aData[6]);
      var id = parseInt(aData[0], 10);
      SkeletonAnnotations.staticMoveTo(z, y, x,
                     function () {
                       SkeletonAnnotations.staticSelectNode(id, skelid);
                     });
    });

  };
}
