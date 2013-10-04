var SkeletonMeasurementsTable = new function() {
  var self = this;
  var table = null;

  this.init = function() {
    if (table) {
      table.remove();
    }
    table = $('#skeleton_measurements_table').dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": 'T<"clear"><"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": false, // Enable sorting locally, and prevent sorting from calling the fnServerData to reload the table -- an expensive and undesirable operation.
      "bAutoWidth": false,
      "iDisplayLength": -1,
      "oTableTools": {
        "sSwfPath": STATIC_URL_JS + "libs/tabletools/swf/copy_csv_xls_pdf.swf",
        "aButtons": [ "copy", "csv" ]
      },
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
      //"aLengthChange": false,
      "bJQueryUI": true,
      "aoColumns": [
      { // Neuron name
        "bSearchable": true,
        "bSortable": true
      },
      { // Skeleton ID
        "bSearchable": true,
        "bSortable": true
      },
      { // Raw cable length
        "bSearchable": true,
        "bSortable": true,
      },
      { // Smooth cable length
        "bSearchable": true,
        "bSortable": true
      },
      { // N inputs
        "bSearchable": true,
        "bSortable": true
      },
      { // N outputs
        "bSearchable": true,
        "bSortable": true
      },
      { // N nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // N branch nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // N end nodes
        "bSearchable": true,
        "bSortable": true,
      },
      ]
    });
  };

  this.populate = function(rows) {
    WindowMaker.show('skeleton-measurements-table');
    table.fnClearTable(0);
    table.fnAddData(rows);

    // Specify what happens on double click
    $('#skeleton_measurements_table tbody tr').on('dblclick', function(evt) {
      var aData = table.fnGetData(this);
      var skeleton_id = parseInt(aData[1]);
      TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
    });
  };
};
