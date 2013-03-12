/** An object that encapsulates functions for the skeleton analytics widget. */
var SkeletonAnalytics = new function()
{
	var table = null;
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
			"sAjaxDataProp": 'issues',
      "fnServerData": function (sSource, aoData, fnCallback) {
				// skeletons: WebGLApp.getListOfSkeletonIDs(true)
				var skid = SkeletonAnnotations.getActiveSkeletonId();
				if (!skid) {
					growlAlert("Oops", "Select a skeleton first!");
					return;
				}
				requestQueue.replace(sSource, 'POST',
					{skeleton_ids: [skid]},
					function(status, text, xml) {
						if (200 === status) return;
						var json = $.parseJSON(text);
						if (json.issues) {
							json.issues.forEach(function (row) {
								// Convert type number to type string
								row[0] = json.issues[row[0]];
							});
							fnCallback(json);
						}
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
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
      { // Treenode ID
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true,
      },
      { // Skeleton ID
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      }
      ]
		});
	};

  this.update = function() {
    if (table) {
      table.fnClearTable( 0 );
      table.fnDraw();
    }
  };

}();
