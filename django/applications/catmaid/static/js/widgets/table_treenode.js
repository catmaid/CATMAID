/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


var TreenodeTable = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.models = {};
  this.ranges = {};
  this.oTable = null;
  this.filter_nodetype = 'L';
  this.filter_searchtag = '';
};

TreenodeTable.prototype = {};
$.extend(TreenodeTable.prototype, new InstanceRegistry());
$.extend(TreenodeTable.prototype, new CATMAID.SkeletonSource());

TreenodeTable.prototype.getName = function() {
  return "Treenode table " + this.widgetID;
};

TreenodeTable.prototype.destroy = function() {
  this.unregisterSource();
  this.unregisterInstance();
};

TreenodeTable.prototype.append = function(models) {
  var skids = [];
  var current = Object.keys(models);
  if (0 === current.length) {
    // Remove bogus first row needed for init
    this.oTable.fnClearTable( 0 );
  }
  current.forEach(function(skid) {
    if (this.models[skid]) return;
    this.models[skid] = models[skid].clone();
    skids.push(skid);
  }, this);

  this._appendSkeletons(skids);
};

TreenodeTable.prototype.clear = function() {
  this.models = {};
  this.ranges = {};
  this.oTable.fnClearTable( 0 );
  this.oTable.fnDraw();
};

TreenodeTable.prototype._removeRangeOfRows = function(start, length) {
  for (var i=0; i<length; ++i) {
    // Remove row without redrawing
    this.oTable.fnDeleteRow(start, null, false);
  }
};

TreenodeTable.prototype.removeSkeletons = function(skeleton_ids) {
  // Drop ranges
  skeleton_ids.forEach(function(skid) {
    var range = this.ranges[skid];
    if (!range) return; // ignore: not present
    this._removeRangeOfRows(range.start, range.length);
    delete this.ranges[skid];
    delete this.models[skid];
  }, this);
  // Refresh table
  this.oTable.fnDraw();
};

TreenodeTable.prototype.updateModels = function(models) {
  // Drop rows for skeletons to update
  var skids = [];
  Object.keys(models).forEach(function(skid) {
    var range = this.ranges[skid];
    if (!range) return; // not present
    skids.push(skid);
    this._removeRangeOfRows(range.start, range.end);
  }, this);
  // Refresh table
  this.oTable.fnDraw();
  // Append newly fetched data at the end
  this._appendSkeletons(skids);
};

TreenodeTable.prototype.getSelectedSkeletons = function() {
  return Object.keys(this.models).map(Number);
};

TreenodeTable.prototype.hasSkeleton = function(skeleton_id) {
  return this.models[skeleton_id];
};

TreenodeTable.prototype.highlight = function(skeleton_id) {};

TreenodeTable.prototype.getSkeletonColor = function(skeleton_id) {
  var model = this.models[skeleton_id];
  return model ? model.color.clone() : new THREE.Color().setRGB(1, 1, 0);
};

TreenodeTable.prototype.getSelectedSkeletonModels = function() {
  return Object.keys(this.models).reduce((function(o, skid) {
    o[skid] = this.models[skid].clone();
    return o;
  }).bind(this), {});
};

TreenodeTable.prototype.getSkeletonModels = TreenodeTable.prototype.getSelectedSkeletonModels;

TreenodeTable.prototype.refresh = function() {
  var skeleton_ids = Object.keys(this.models);
  if (skeleton_ids.length > 0) {
    this.oTable.fnClearTable( 0 );
    this._appendSkeletons(skeleton_ids);
  } else {
    CATMAID.msg("Add a skeleton first!");
  }
};

TreenodeTable.prototype._appendSkeletons = function(skeleton_ids) {

  if (!this.oTable || 0 === skeleton_ids.length) return;

  var formatTime = function(seconds_since_epoch) {
    var d = new Date(0);
    d.setUTCSeconds(seconds_since_epoch);
    var day = d.getDate();
    if (day < 10) day = '0' + day;
    var month = d.getUTCMonth() + 1; // 0-based
    if (month < 10) month = '0' + month;
    return day + '-' + month + '-' + d.getUTCFullYear() +
      ' ' + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
  };

  var stack = project.focusedStackViewer.primaryStack,
      users = CATMAID.User.all(),
      n_rows = this.oTable.fnSettings().fnRecordsTotal(),
      all_rows = [];

  fetchSkeletons(
      skeleton_ids,
      function(skid) {
        return django_url + project.id + '/treenode/table/' + skid + '/content';
      },
      function(skid) { return {}; }, // post
      (function(skid, json) {
        var rows = json[0],
            review_rows = json[1],
            tag_rows = json[2];
        // Find out the type of each treenode
        var arbor = new Arbor();
        for (var i=0; i<rows.length; ++i) {
          var row = rows[i];
          if (!row[1]) arbor.root = row[0];
          else arbor.edges[row[0]] = row[1];
        }
        // Create a map of treenode_id vs list of reviewers' login
        var counts = arbor.allSuccessorsCount(),
            reviews = {};
        for (var i=0; i<review_rows.length; ++i) {
          var pair = review_rows[i],
              reviewer = users[pair[1]].login,
              reviewers = reviews[pair[0]];
          if (reviewers) reviewers.push(reviewer);
          else reviews[pair[0]] = [reviewer];
        }
        // Create a map of treenode_id vs tags
        var tags = {};
        for (var i=0; i<tag_rows.length; ++i) {
          var pair = tag_rows[i],
              list = tags[pair[0]];
          if (list) list.push(pair[1]);
          else tags[pair[0]] = [pair[1]];
        }
        // Edit the arrays
        for (var i=0; i<rows.length; ++i) {
          // Replace parent_id with type
          var row = rows[i];
          if (row[0] === arbor.root) row[1] = 'R'; // root
          else {
            switch (counts[row[0]]) {
              case 0:  row[1] = 'L'; break; // leaf
              case 1:  row[1] = 'S'; break; // slab
              default: row[1] = 'B'; break; // branch
            }
          }
          // Insert tags
          var tag = tags[row[0]];
          row.splice(2, 0, tag ? tag.join(', ') : '');
          // Insert section number
          row.splice(7, 0, (row[6] - stack.translation.z) / stack.resolution.z);
          // Replace user_id with username
          row[9] = users[row[9]].login;
          // Replace epoch seconds with date
          row[10] = formatTime(row[10]);
          //var d = new Date(0);
          //d.setUTCSeconds(row[10]);
          //row[10] = d.toLocaleDateString('en-GB');
          // Append reviewers' names
          var reviewers = reviews[row[0]];
          row.push(reviewers ? reviewers.join(', ') : 'None');
        }
        // david tata
        // g;[hcbfvged

        this.ranges[skid] = {start: n_rows,
                             length: rows.length};

        n_rows += rows.length;
        all_rows = all_rows.concat(rows);
      }).bind(this),
      (function(skid) {
        // Failed loading
        CATMAID.warn("Failed to load skeleton #" + skid);
        delete this.models[skid];
        delete this.ranges[skid];
      }).bind(this),
      (function() {
        this.oTable.fnAddData(all_rows);
        this.filter_nodetype = $('select#search_type' + this.widgetID).val();
        // fnFilter will call fnDraw
        this.oTable.fnFilter(this.filter_nodetype, 1);
      }).bind(this));
};

TreenodeTable.prototype.init = function() {
  var tableSelector = "#treenodetable" + this.widgetID;
  var widgetID = this.widgetID;

  this.oTable = $(tableSelector).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lrp>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": false,
    "bPaginate": true,
    "bLengthChange": true,
    "bAutoWidth": false,
    "iDisplayLength": 30,
    "aLengthMenu": [
      [30, 50, 100, -1],
      [30, 50, 100, "All"]
    ],
    "bJQueryUI": true,
    "aoColumns": [{
      "sClass": "center",
      "bSearchable": true,
      "bSortable": true,
    }, // id
    {
      "sClass": "center",
      "bSearchable": true,
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
    },
    {
      "sClass": "center",
      "bSearchable": false
    }, // radius
    {
      "bSearchable": true
    }, // username
    {
      "bSearchable": false,
      "bSortable": true
    }, // last modified
    {
        "bSearchable": true,
        "bSortable": true
    } // reviewer
    ]
  });

  $(tableSelector + " thead input").keydown((function (event) {
    // filter table on hit enter
    if (event.which == 13) {
      // Filter with a regular expression
      this.filter_searchtag = $('#search_labels' + this.widgetID).val();
      this.oTable.fnFilter(this.filter_searchtag, 2, true);
    }
  }).bind(this));

  // remove the 'Search' string when first focusing the search box
  $(tableSelector + " thead input").focus(function () {
    if (this.className === "search_init") {
      this.className = "";
      this.value = "";
    }
  });

  $('select#search_type' + this.widgetID).change((function() {
    this.filter_nodetype = $('select#search_type' + this.widgetID).val();
    this.oTable.fnFilter(this.filter_nodetype, 1);
  }).bind(this));

  // TODO: remove the need for closing over oTable
  var oTable = this.oTable;

  $(tableSelector).on("dblclick", "tbody tr", function() {
    var aData = oTable.fnGetData(this);
    // retrieve coordinates and moveTo
    var id = parseInt(aData[0], 10);
    var x = parseFloat(aData[4]);
    var y = parseFloat(aData[5]);
    var z = parseFloat(aData[6]);
    SkeletonAnnotations.staticMoveTo(z, y, x,
      function () {
        SkeletonAnnotations.staticSelectNode(id);
      });
  });
};

TreenodeTable.prototype.updateNeuronNames = function() {};

