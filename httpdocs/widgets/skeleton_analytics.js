/** An object that encapsulates functions for the skeleton analytics widget. */
var SkeletonAnalytics = new function()
{
  var table = null;

  /** Generate a function to sort an array of arrays
   * by comparing values of an index inside the inner arrays. */
  var sorterFn = function(iCol, direction) {
    var sort_asc = function(a, b) {
      if (a[iCol] < b[iCol]) return -1;
      if (a[iCol] > b[iCol]) return 1;
      return 0;
    };
    return 'asc' === direction ?
        sort_asc
      : function(a, b) { return sort_asc(b, a); };
  };

  this.init = function(pid) {
    table = $('#skeletonanalyticstable').dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": true,
      "bAutoWidth": false,
      "sAjaxSource": django_url + project.id + '/skeleton/analytics',
      "sAjaxDataProp": 'rows',
      "fnServerData": function (sSource, aoData, fnCallback) {
				if (table) table.fnClearTable(0);
        var skids = null;
        switch ($('#skeleton_analytics_source').val()) {
          case "0":
            skids = [SkeletonAnnotations.getActiveSkeletonId()];
            break;
          case "1":
            skids = WebGLApp.getListOfSkeletonIDs(true);
            break;
        }
				console.log(skids);
        if (!skids) {
          growlAlert("Oops", "Select skeleton(s) first!");
          return;
        }
        // sSource is the sAjaxSource
        // aoData is the table properties, e.g. which column to sort, etc.
        requestQueue.replace(sSource, 'POST',
          {skeleton_ids: skids,
           extra: $('#skeleton_analytics_extra').val()},
          function(status, text, xml) {
            if (200 !== status) return;
            var json = $.parseJSON(text);
            var rows = [];
            json.issues.forEach(function (sk) {
              // sk[0]: skeleton ID
              // sk[1]: array of pairs like [issue ID, treenode ID]
              var name = json.names[sk[0]];
              sk[1].forEach(function(p) {
                rows.push([json[p[0]], // issue name
                           name, // neuron name
                           p[1], // treenode ID
                           sk[0]]); // skeleton ID
              });
            });

            //rows.sort(sorterFn(aoData[24], aoData[25]));

            fnCallback({rows: rows});
          }, 'skeleton_analytics_update');
      },
      "iDisplayLength": -1,
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
      "bJQueryUI": true,
      "aoColumns": [
      { // Type
        "bSearchable": true,
        "bSortable": true
      },
      { // Neuron name
        "bSearchable": true,
        "bSortable": true
      },
      { // Treenode ID
        "bSearchable": true,
        "bSortable": true,
      },
      { // Skeleton ID
        "bSearchable": true,
        "bSortable": true
      }
      ]
    });

		/** Make rows double-clickable to go to the treenode location and select it. */
    $("#skeletonanalyticstable tbody tr").live('dblclick', function () {
      var aData = table.fnGetData(this);
			var tnid = parseInt(aData[2]);
			var skeleton_id = parseInt(aData[3]);
			requestQueue.replace(
				django_url + project.id + "/node/get_location",
				"POST",
				{tnid: tnid},
				function(status, text) {
					if (200 !== status) return;
					var json = $.parseJSON(text);
					if (json.error) {
						alert("Could not retrieve node location: " + json.error);
						return;
					}
					project.moveTo(json[3], json[2], json[1], undefined,
						function() {
							SkeletonAnnotations.staticSelectNode(tnid, skeleton_id);
						});
				},
				"skeleton_analytics_go_to_node");
    });
  };

  this.update = function() {
    if (table) {
      table.fnClearTable( 0 );
      table.fnDraw();
    }
  };

}();
