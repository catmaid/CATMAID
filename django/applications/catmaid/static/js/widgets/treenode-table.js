/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var TreenodeTable = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.idPrefix = `treenode-table${this.widgetID}-`;

    this.models = {};
    this.ranges = {};
    this.oTable = null;
    this.filter_nodetype = 'L';
    this.filter_searchtag = '';
    this.filter_nodeids = new Set();

    this.treenodeViewer = null;
  };

  TreenodeTable.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  TreenodeTable.prototype.constructor = TreenodeTable;

  $.extend(TreenodeTable.prototype, new InstanceRegistry());

  TreenodeTable.prototype.getName = function() {
    return "Treenode table " + this.widgetID;
  };

  TreenodeTable.prototype.getWidgetConfiguration = function() {
    var self = this;
    return {
      controlsID: this.idPrefix + 'controls',
      contentID: this.idPrefix + 'content',
      createControls: function(controls) {
        controls.appendChild(document.createTextNode('From'));
        controls.appendChild(CATMAID.skeletonListSources.createSelect(this));

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = this.loadSource.bind(this);
        controls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        controls.appendChild(clear);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = this.refresh.bind(this);
        controls.appendChild(refresh);

        var openViewer = document.createElement('input');
        openViewer.setAttribute('id', self.idPrefix + 'viewer-button');
        openViewer.setAttribute('type', 'button');
        openViewer.setAttribute('value', 'Open Viewer');
        openViewer.onclick = function() {
          if (!self.treenodeViewer) {
            self.treenodeViewer = WindowMaker.create('treenode-viewer', self).widget;
            this.value = 'Refresh ' + self.treenodeViewer.getName();
          }

          self.treenodeViewer.stackViewerGrid.setTargets(self.getFilteredTargets());
        };
        controls.appendChild(openViewer);
      },
      createContent: function(content) {
        content.innerHTML = `
          <table cellpadding="0" cellspacing="0" border="0" class="display" id="${self.idPrefix}datatable"> 
            <thead> 
              <tr> 
                <th>id</th> 
                <th>type 
                  <select id="${self.idPrefix}search-type" class="search_init"> 
                    <option value="">Any</option> 
                    <option value="R">Root</option>   
                    <option value="L" selected="selected">Leaf</option> 
                    <option value="B">Branch</option> 
                    <option value="S">Slab</option>   
                  </select> 
                </th> 
                <th>tags<input type="text" id="${self.idPrefix}search-labels" value="Search" class="search_init" /></th> 
                <th>c <br>
                  <div style="white-space: nowrap">
                    <select id="${self.idPrefix}conf-operator" class="search_init conf_filter">
                      <option value="none" selected></option>
                      <option value="eq">&equals;</option>
                      <option value="lt">&lt;</option>
                      <option value="gt">&gt;</option>
                    </select>
                    <select id="${self.idPrefix}conf-number" class="search_init conf_filter">
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5" selected>5</option>
                    </select>
                  </div>
                </th> 
                <th>x</th> 
                <th>y</th> 
                <th>z</th> 
                <th>s</th> 
                <th>r</th> 
                <th>user<input type="text" id="${self.idPrefix}search-user" value="Search" class="search_init" /></th> 
                <th>last modified</th> 
                <th>reviewer
                  <input type="text" id="${self.idPrefix}search-reviewer" value="Search" class="search_init"/>
                </th> 
              </tr> 
            </thead> 
            <tfoot> 
              <tr> 
                <th>id</th> 
                <th>type</th> 
                <th>tags</th> 
                <th>c</th> 
                <th>x</th> 
                <th>y</th> 
                <th>z</th> 
                <th>s</th> 
                <th>r</th> 
                <th>user</th> 
                <th>last modified</th> 
                <th>reviewer</th> 
              </tr> 
            </tfoot> 
            <tbody> 
            </tbody> 
          </table>`;

        $("select#" + this.idPrefix + "search-type").val(this.filter_nodetype);
      },
      init: function() {
        this.init(project.getId());
      }
    };
  };

  TreenodeTable.prototype.destroy = function() {
    if (this.treenodeViewer) {
      document.getElementById(this.treenodeViewer.idPrefix + 'node-source').innerText = 'Treenode source CLOSED';
      this.treenodeViewer.treenodeTable = null;
    }

    this.unregisterSource();
    this.unregisterInstance();
  };

  var nodeTypes = new Map([
    ['', 'none'],
    ['R', 'root'],
    ['L', 'leaf'],
    ['B', 'branch'],
    ['S', 'slab']
  ]);

  TreenodeTable.prototype.getFilteredTargets = function() {
    var targets = [];
    var rowIdx = 1;
    this.oTable.rows({search: 'applied'}).every(function() {
      var [id, type, tags, c, x, y, z, s, r, user, lastModified, reviewer] = this.data();
      targets.push({
        'coords': {
          'x': x, 'y': y, 'z': z
        },
        'title': 'treenode ' + id,
        'sortVal': 'Row index: ' + rowIdx,
        'note': 'Type: ' + nodeTypes.get(type)
      });
      rowIdx += 1;
    });
    return targets;
  };

  TreenodeTable.prototype.append = function(models) {
    var skids = [];
    var current = Object.keys(models);
    if (0 === current.length) {
      // Remove bogus first row needed for init
      this.oTable.clear();
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
    this.filter_nodeids.clear();
    this.oTable.clear();
    this.oTable.draw();
  };

  TreenodeTable.prototype._removeRangeOfRows = function(start, length) {
    var deleteIdxs = [];
    for (var i=0; i<length; ++i) {
      deleteIdxs.push(start + i);
    }

    // Remove rows without redrawing
    this.oTable.rows(deleteIdxs).remove();
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
    this.oTable.draw();
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
    this.oTable.draw();
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
    return model ? model.color.clone() : new THREE.Color(1, 1, 0);
  };

  TreenodeTable.prototype.getSelectedSkeletonModels = function() {
    return Object.keys(this.models).reduce((function(o, skid) {
      o[skid] = this.models[skid].clone();
      return o;
    }).bind(this), {});
  };

  TreenodeTable.prototype.getSkeletonModels = TreenodeTable.prototype.getSelectedSkeletonModels;

  TreenodeTable.prototype.getSkeletonModel = function(id) {
    if (id in this.models) {
      return this.models[id].clone();
    }
  };

  TreenodeTable.prototype.refresh = function() {
    var skeleton_ids = Object.keys(this.models);
    if (skeleton_ids.length > 0) {
      this.oTable.clear();
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
      return CATMAID.tools.dateToString(d);
    };

    var stack = project.focusedStackViewer.primaryStack,
        users = CATMAID.User.all(),
        n_rows = this.oTable.page.info().recordsTotal,
        all_rows = [];

    fetchSkeletons(
        skeleton_ids,
        function(skid) {
          return CATMAID.makeURL(project.id + '/skeletons/' + skid + '/node-overview');
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
            row.splice(2, 0, tag ? tag.sort().join(', ') : '');
            // Insert section number
            row.splice(7, 0, (row[6] - stack.translation.z) / stack.resolution.z);
            // Replace user_id with username
            row[9] = users[row[9]].login;
            // Replace epoch seconds with date
            row[10] = formatTime(row[10]);
            // Append reviewers' names
            var reviewers = reviews[row[0]];
            row.push(reviewers ? reviewers.join(', ') : 'None');
          }

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
          this.oTable.rows.add(all_rows);
          this.filter_nodetype = $('select#' + this.idPrefix + 'search-type').val();
          this.oTable.columns(1).search(this.filter_nodetype).draw();

          if (this.filter_nodeids.size > 0) {
            let idRegEx = '^(' + Array.from(this.filter_nodeids).join('|') + ')$';
            this.oTable.columns(0).search(idRegEx, true, false, true).draw();
            //this.oTable.columns(0).search('^(8995095|999)', true, false, true).draw();
          } else {
            this.oTable.columns(0).search('').draw();
          }
        }).bind(this),
        'GET');
  };

  TreenodeTable.prototype.init = function() {
    var tableSelector = $(`#${this.idPrefix}datatable`);
    var self = this;

    this.oTable = tableSelector.DataTable({
      // http://www.datatables.net/usage/options
      "destroy": true,
      "dom": '<"H"lrp>t<"F"ip>',
      "processing": true,
      "serverSide": false,
      "paging": true,
      "lengthChange": true,
      "autoWidth": false,
      "pageLength": 30,
      "lengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      "jQueryUI": true,
      "deferRender": true,
      "columns": [{
        "className": "center",
        "searchable": true,
        "orderable": true,
      }, // id
      {
        "className": "center",
        "searchable": true,
      }, // type
      {
        "searchable": true,
        "orderable": true,
        "sWidth": "150px"
      }, // labels
      {
        "className": "center",
        "searchable": true,
        "sWidth": "50px"
      }, // confidence
      {
        "className": "center",
        "searchable": false
      }, // x
      {
        "className": "center",
        "searchable": false
      }, // y
      {
        "className": "center",
        "searchable": false
      }, // z
      {
        "className": "center",
        "searchable": false,
      },
      {
        "className": "center",
        "searchable": false
      }, // radius
      {
        "searchable": true
      }, // username
      {
        "searchable": false,
        "orderable": true
      }, // last modified
      {
          "searchable": true,
          "orderable": true
      } // reviewer
      ]
    });

    var tableHeadInputSelector = tableSelector.find("thead input");

    tableHeadInputSelector.keydown(function (event) {
      // filter table on hit enter
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        var searchVal = event.target.value;

        if (event.target.id.endsWith('user')) {
          self.filter_searchtag = searchVal;
        }

        self.oTable
          .column(event.target.closest('th'))
          .search(searchVal, true)  // as regex
          .draw();
      }
    });

    // don't sort when clicking on the input
    tableHeadInputSelector.click(function (event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    tableHeadInputSelector.focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    $('select#' + this.idPrefix + 'search-type').change((function() {
      this.filter_nodetype = $('select#' + this.idPrefix + 'search-type').val();
      this.oTable.column(1).search(this.filter_nodetype).draw();
    }).bind(this));

    var confFilterSelector = $('.conf_filter');

    confFilterSelector.change(function() {
      var numbers = [1, 2, 3, 4, 5];
      var number = document.getElementById(self.idPrefix + 'conf-number').value;
      var operator = document.getElementById(self.idPrefix + 'conf-operator').value;

      var regex;

      switch (operator) {
        case 'none': regex = '.*'; break;
        case 'eq': regex = String(number); break;
        case 'lt': regex = numbers.filter(function(item) {return item < number;}).join('|'); break;
        case 'gt': regex = numbers.filter(function(item) {return item > number;}).join('|'); break;
      }

      self.oTable.column(3).search(regex, true).draw();
    });

    confFilterSelector.click(function(event) {
      event.stopPropagation();
    });

    // TODO: remove the need for closing over oTable
    var oTable = this.oTable;

    tableSelector.on("dblclick", "tbody tr", function() {
      var aData = oTable.row(this).data();
      // retrieve coordinates and moveTo
      var id = parseInt(aData[0], 10);
      var x = parseFloat(aData[4]);
      var y = parseFloat(aData[5]);
      var z = parseFloat(aData[6]);
      SkeletonAnnotations.staticMoveTo(z, y, x)
          .then(function () {
            return SkeletonAnnotations.staticSelectNode(id);
          })
          .catch(CATMAID.handleError);
    });
  };

  TreenodeTable.prototype.updateNeuronNames = function() {};

  TreenodeTable.prototype.setNodeTypeFilter = function(value) {
    this.filter_nodetype = value;
    $("select#" + this.idPrefix + "search-type").val(this.filter_nodetype);
  };

  // Export widget
  CATMAID.TreenodeTable = TreenodeTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Treenode table",
    description: "List all treenodes of a skeleton",
    key: "treenode-table",
    creator: TreenodeTable
  });

})(CATMAID);
