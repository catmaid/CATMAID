/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


function updateTreenodeTable() {
  //TreenodeTable.init( project.getId() );
  TreenodeTable.setSkeleton( -1 );
  TreenodeTable.oTable.fnClearTable( 0 );
  TreenodeTable.oTable.fnDraw();
}

function refreshTreenodeTable() {
  TreenodeTable.oTable.fnClearTable( 0 );
  TreenodeTable.oTable.fnDraw();
}

var TreenodeTable = new function()
{
  var ns = this; // reference to the namespace
  ns.oTable = null;
  var asInitVals = [];
  var skelid = -1;
  var last_displayed_skeletons = {};
  last_displayed_skeletons[0] = 'None';

  this.setSkeleton = function( skeleton_id ) {
    skelid = skeleton_id;
  }

  this.init = function (pid)
  {
    $("#treenodetable_lastskeletons").change(function() {
      skelid = parseInt( $('#treenodetable_lastskeletons').val() );
      refreshTreenodeTable();
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

        if( skelid === -1 ) {
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

        if( skelid && !(skelid in last_displayed_skeletons) ) {
          // check if skeleton id already in list, of so, do not add it
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
        //$('td:eq(7)', ns.oTable.fnGetNodes()).editable('model/treenode.table.update.php', {
        $('td:eq(7)', ns.oTable.fnGetNodes()).editable(django_url + project.id + '/treenode/table/update', {
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