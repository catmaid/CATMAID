/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SystemCheckWidget = function(options) {
    options = options || {};

    var sv = project.focusedStackViewer;
    if (!sv) {
      throw new CATMAID.ValueError("Need stack viewer for System Widget");
    }

    this.x = options.x || sv.x;
    this.y = options.y || sv.y;
    this.z = options.z || sv.z;
    this.s = options.s || sv.s;
    this.testNSections = 20;
    this.testDelay = 0;
    this.blockingRedraws = true;
  };

  SystemCheckWidget.prototype.getName = function() {
    return "System Check";
  };

  SystemCheckWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'system-widget-controls-' + this.widgetID,
      contentID: 'system-widget-' + this.widgetID,
      class: "system-check",
      createControls: function(controls) {
        var self = this;

        CATMAID.DOM.appendButton(controls,
            "Update", "Update server stats",
            function() {
              self.update();
            });

        CATMAID.DOM.appendButton(controls,
            "Run tests", "Run various system performance tests",
            function() {
              setTimeout(self.runTests.bind(self), self.testDelay);
            });

        CATMAID.DOM.appendButton(controls,
            "Current location", "Copy current location",
            function() {
              var sv = project.focusedStackViewer;
              self.x = sv.x;
              self.y = sv.y;
              self.z = sv.z;
              self.s = sv.s;
              $('input', self.xField).val(sv.x);
              $('input', self.yField).val(sv.y);
              $('input', self.zField).val(sv.z);
            });

        this.xField = CATMAID.DOM.appendNumericField(controls,
            "X", "The initial stack space X coordinate", this.x,
            null, function() {
              self.x = this.value;
            }, 7);

        this.yField = CATMAID.DOM.appendNumericField(controls,
            "Y", "The initial stack space Y coordinate", this.y,
            null, function() {
              self.y = this.value;
            }, 7);

        this.zField = CATMAID.DOM.appendNumericField(controls,
            "Z", "The initial stack space Z coordinate", this.z,
            null, function() {
              self.z = this.value;
            }, 7);

        CATMAID.DOM.appendNumericField(controls,
            "N sections", "The number of sections to test", this.testNSections,
            null, function() {
              self.testNSections = parseInt(this.value, 10);
            }, 7);

        CATMAID.DOM.appendCheckbox(controls,
            "Blocking redraws", "Redraws are performed in blocking mode if enabled",
            this.blockingRedraws, function() {
              self.blockingRedraws = this.checked;
            });

        this.delayField = CATMAID.DOM.appendNumericField(controls,
            "Test delay (ms)", "Test tests will be run after the specified delay",
            this.testDelay, null, function() {
              self.testDelay = this.value;
            }, 7, "ms");
      },
      createContent: function(content) {
        var fpsHeader = document.createElement('h2');
        fpsHeader.appendChild(document.createTextNode("Section loading"));
        content.appendChild(fpsHeader);
        this.fpsResult = document.createElement('p');
        content.appendChild(this.fpsResult);

        if (CATMAID.hasPermission(project.id, 'can_administer')) {
          let serverHeader = content.appendChild(document.createElement('h2'));
          serverHeader.appendChild(document.createTextNode("Server"));
          this.serverResults = content.appendChild(document.createElement('div'));
          let dbHeader = content.appendChild(document.createElement('h2'));
          dbHeader.appendChild(document.createTextNode("Database"));
          this.dbResults = content.appendChild(document.createElement('div'));
        }
      },
      init: function() {
        this.update();
      }
    };
  };

  SystemCheckWidget.prototype.runTests = function() {
    this.runFpsTests();
  };

	/*/
	 * Run FPS tests.
   */
  SystemCheckWidget.prototype.runFpsTests = function() {
    var sv = project.focusedStackViewer;
    var originalBlockingBehavior = sv.blockingRedraws;
    sv.blockingRedraws = this.blockingRedraws;
		var x = this.x;
		var y = this.y;
		var z = this.z;
		var s = this.s;
		var n = this.testNSections;
		var i = 0;

    var timings = new Array(n);
    var self = this;

    $(this.fpsResult).empty();

		function moveCompleted() {
			timings[i-1] = performance.now() - timings[i-1];
			if (i < n) {
				setTimeout(increment, 10);
			} else {
				var summedTime = timings.reduce(function(sum, t) {
					return sum + t;
				}, 0);
				var averageTime = summedTime / timings.length;
				var fps = 1.0 / (averageTime / 1000);
        $(self.fpsResult).empty();
        self.fpsResult.appendChild(document.createTextNode(
				    "Average: " + Number(averageTime).toFixed(2) + "ms FPS: " +
           Number(fps).toFixed(2)));
        sv.blockingRedraws = originalBlockingBehavior;
			}
		}

		function increment() {
			i = i + 1;
			timings[i-1] = performance.now();
			sv.moveToPixel(z + i, y, x, s, setTimeout.bind(window, moveCompleted, 0));
		}


		increment();
  };

  SystemCheckWidget.prototype.update = function() {
    if (CATMAID.hasPermission(project.id, 'can_administer')) {
      CATMAID.fetch(project.id + '/stats/server')
        .then(stats => {
          this.redrawServerStats(stats['server']);
          this.redrawDatabaseStats(stats['database']);
        });
    }
  };

  let serverStats = {
    'load_avg': {
      name: 'Load average',
      comment: 'Processes that want to run averaged over last 1, 5 and 15 min.',
      render: function(value) {
        return value.join(', ');
      },
    },
  };

  SystemCheckWidget.prototype.redrawServerStats = function(stats) {
    // Clear server stats
    while (this.serverResults.lastChild) {
      this.serverResults.removeChild(this.serverResults.lastChild);
    }

    if (!stats || CATMAID.tools.isEmpty(stats)) {
      this.serverResults.innerHTML = '<p><em>No data found</em></p>';
    }

    let table = document.createElement('table');
    table.appendChild(document.createElement('th'));
    table.appendChild(document.createElement('tbody'));
    this.serverResults.appendChild(table);

    let statsObjects = Object.keys(stats).map(statName => ({
      'name': statName,
      'value': stats[statName],
    }));

    let datatable = $(table).DataTable({
      data: statsObjects,
      dom: "lrfhtip",
      order: [],
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      columns: [{
        title: 'Name',
        data: 'name',
        width: '10em',
        class: 'cm-center',
        render: function(data, type, row, meta) {
          let stat = serverStats[data];
          return stat ? stat.name : data;
        }
      }, {
        title: 'Value',
        data: 'value',
        width: '10em',
        class: 'cm-center',
        render: function(data, type, row, meta) {
          let stat = serverStats[row.name];
          if (stat && CATMAID.tools.isFn(stat.render)) {
            return stat.render(data);
          }
          return data;
        }
      }, {
        title: 'Comment',
        render: function(data, type, row, meta) {
          let stat = serverStats[row.name];
          return stat ? (stat.comment || '') : '';
        }
      }],
    });
  };

  /**
   * Database stats. Most suggestions are taken as rough rule of thumb from the
   * talk "Deep Dive into Postgres Statistics" by Alexey Lesovsky.
   */
  let databaseStats = {
    'version': {
      name: 'PostgreSQL Version',
      comment: 'CATMAID requires at least version 10 of Postgres.',
    },
    'c_ratio': {
      name: 'Committed transactions ',
      comment: 'Percentage of committed versus rolled back transactions. Should be > 95%.',
      render: value => `${value}%`,
    },
    'deadlocks': {
      name: 'Deadlocks',
      comment: 'Number of deadlocks in system. Should be zero.',
    },
    'conflicts': {
      name: 'Conflicts',
      comment: 'Number of queries canceled due to conflicts with recovery. Should be < 10.',
    },
    'temp_files': {
      name: 'Temporary files',
      comment: 'Number of temporary files created by queries. Should be < 100.',
    },
    'temp_size': {
      name: 'Temp file size',
      comment: 'Total data written to temporary files. Should be below 10 GB.',
    },
    'blks_read': {
      name: 'Blocks read',
      comment: 'Number of disk blocks read in the database.',
    },
    'blks_hit': {
      name: 'Cached blocks read',
      comment: 'Number of times blocks were already found in buffer cache.',
    },
    'cache_hit_ratio': {
      name: 'Cache hit ratio',
      comment: 'Indicates what percentage of data reads hit the cache. Should be > 95%',
      render: (value) => `${Number(Number(value * 100)).toFixed(2)}%`,
    },
    'user_blks_read': {
      name: 'User blocks read',
      comment: 'Number of disk blocks read in the database from CATMAID\'s own tables only.',
    },
    'user_blks_hit': {
      name: 'Cached user blocks read',
      comment: 'Number of times blocks for CATMAID\'s own tables were already found in buffer cache.',
    },
    'user_cache_hit_ratio': {
      name: 'User cache hit ratio',
      comment: 'Indicates what percentage of data reads for CATMAID\'s own tables hit the cache. Should be > 95%',
      render: (value) => `${Number(Number(value) * 100).toFixed(2)}%`,
    },
    'idx_blks_read': {
      name: 'Index blocks read',
      comment: 'Number of disk blocks read in the database from table indices.',
    },
    'idx_blks_hit': {
      name: 'Cached index blocks read',
      comment: 'Number of times blocks of table indices were already found in buffer cache.',
    },
    'idx_cache_hit_ratio': {
      name: 'Index cache hit ratio',
      comment: 'Indicates what percentage of data reads for table indices that hit the cache. Should be > 95%',
      render: (value) => `${Number(Number(value) * 100).toFixed(2)}%`,
    },
    'checkpoints_req': {
      name: 'Requested checkpoins',
      comment: 'Number of times checkpoints have been requested. Should be < timed checkpoints.',
    },
    'checkpoints_timed': {
      name: 'Timed checkpoins',
      comment: 'Number of scheduled checkpoints have been performed. Should be > requested checkpoints.',
    },
    'buffers_clean': {
      name: 'Writter buffers',
      comment: 'Numbr of buffers written by background writer',
    },
    'maxwritten_clean': {
      name: 'Canceled buffer writes',
      comment: 'Number of times buffer writing was stopped, because too many buffers were written. Should be zero.',
    },
    'buffers_backend_fsync': {
      name: 'Own fsync calls by backend',
      comment: 'Number of times a backend had to to execute its own fsync call. Should be zero.',
    },
    'replication_lag': {
      name: 'Replication lag (sec)',
      comment: 'If replication is enabled, this shows how far behind this replica is (in seconds). Should be low.',
    }
  };

  SystemCheckWidget.prototype.redrawDatabaseStats = function(stats) {
    // Clear database stats
    while (this.dbResults.lastChild) {
      this.dbResults.removeChild(this.dbResults.lastChild);
    }

    if (!stats || CATMAID.tools.isEmpty(stats)) {
      this.dbResults.innerHTML = '<p><em>No data found</em></p>';
    }

    let table = document.createElement('table');
    table.appendChild(document.createElement('th'));
    table.appendChild(document.createElement('tbody'));
    this.dbResults.appendChild(table);

    let statsObjects = Object.keys(stats).map(statName => ({
      'name': statName,
      'value': stats[statName],
    }));

    let datatable = $(table).DataTable({
      data: statsObjects,
      dom: "lrfhtip",
      order: [],
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      columns: [{
        title: 'Name',
        data: 'name',
        width: '11em',
        class: 'cm-center',
        render: function(data, type, row, meta) {
          let stat = databaseStats[data];
          return stat ? stat.name : data;
        }
      }, {
        title: 'Value',
        data: 'value',
        width: '16em',
        class: 'cm-center',
        render: function(data, type, row, meta) {
          let stat = databaseStats[row.name];
          if (stat && CATMAID.tools.isFn(stat.render)) {
            return stat.render(data);
          }
          return data;
        }
      }, {
        title: 'Comment',
        render: function(data, type, row, meta) {
          let stat = databaseStats[row.name];
          return stat ? (stat.comment || '') : '';
        }
      }],
    });
  };

  CATMAID.SystemCheckWidget = SystemCheckWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "System check",
    description: "Developer widget with different metrics and tests",
    key: "system-check",
    creator: SystemCheckWidget
  });

})(CATMAID);
