/** An object that encapsulates functions for the skeleton analytics widget. */
var SkeletonAnalytics = function() {
	this.widgetID = this.registerInstance();
};

SkeletonAnalytics.prototype = new InstanceRegistry();

SkeletonAnalytics.prototype.destroy = function() {
	this.unregisterInstance();
	delete this.widgetID;
};

SkeletonAnalytics.prototype.getName = function() {
	return "Skeleton Analytics " + this.widgetID;
};

SkeletonAnalytics.prototype.load = function() {
	if (this.table) {
		this.table.fnClearTable( 0 );
		this.loadData();
	}
};

SkeletonAnalytics.prototype.getTable = function() {
	return this.table;
};

SkeletonAnalytics.prototype.init = function() {
	this.table = $('#skeletonanalyticstable' + this.widgetID).dataTable({
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

	var getTable = this.getTable.bind(this);

	/** Make rows double-clickable to go to the treenode location and select it. */
	$("#skeletonanalyticstable" + this.widgetID + " tbody tr").live('dblclick', function () {
		var aData = getTable().fnGetData(this);
		var tnid = parseInt(aData[2]);
		var skeleton_id = parseInt(aData[3]);
		requestQueue.replace(
			django_url + project.id + "/node/get_location",
			"POST",
			{tnid: tnid},
			function(status, text) {
				if (200 !== status || 'REPLACED' === text) return;
				var json = $.parseJSON(text);
				if (!json) {
					alert("Could not find node #" + tnid);
					return;
				}
				if (json.error) {
					alert("Could not retrieve node location: " + json.error);
					return;
				}
				SkeletonAnnotations.staticMoveTo(json[3], json[2], json[1],
					function() {
						SkeletonAnnotations.staticSelectNode(tnid, skeleton_id);
					});
			},
			"skeleton_analytics_go_to_node");
	});
};

SkeletonAnalytics.prototype.loadData = function () {
	var skids = CATMAID.skeletonListSources.getSelectedSource(this).getSelectedSkeletons();
	if (!skids || !skids[0]) {
		growlAlert("Oops", "Select skeleton(s) first!");
		return;
	}
	var table = this.table;
	// sSource is the sAjaxSource
	requestQueue.replace(django_url + project.id + '/skeleton/analytics', 'POST',
		{skeleton_ids: skids,
		 extra: $('#skeleton_analytics_extra' + this.widgetID).val(),
		 adjacents: $('#skeleton_analytics_adjacents' + this.widgetID).val()},
		 CATMAID.jsonResponseHandler(function(json) {
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

			table.fnAddData(rows);
		}), 'skeleton_analytics_update');
};
