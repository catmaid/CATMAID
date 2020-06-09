(function(CATMAID) {

  "use strict";

  /**
   * Show reconstruction progress of individual neuron over time, making use of
   * history information if available.
   */
  var NeuronHistoryWidget = function() {
    this.widgetID = this.registerInstance();
    var refresh = this.refresh.bind(this);
    var refreshSkeletons = this.refreshSkeletons.bind(this);
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this,
      handleAddedModels: refreshSkeletons,
      handleChangedModels: refresh,
      handleRemovedModels: refreshSkeletons
    });
    this.skeletonSource.highlight = this.highlight.bind(this);
    // The maximum allowed inacitivty time (minutes)
    this.maxInactivityTime = 3;
    // All components that constitute the tracing time
    this.tracingTimeComponents = new Set(["nodes", "connectors", "tags", "annotations"]);
    // The time components the tracing time is represented with
    this.timeUnits = new Set(["sec", "min", "hours", "days"]);
    // Which users to respect, if empty all users will be respected
    this.userFilter = new Set();
    // Whether user information should be ignored (deflates times, because
    // parallel user activities are not looked at separately).
    this.mergeUsers = false;
    // Will store a datatable instance
    this.table = null;
    // Optional start of time window for changes to respect
    this.timeWindowStart = null;
    // Optional end of time window for changes to respect
    this.timeWindowEnd = null;
  };

  NeuronHistoryWidget.prototype = new InstanceRegistry();
  NeuronHistoryWidget.prototype.constructor = NeuronHistoryWidget;

  NeuronHistoryWidget.prototype.getName = function() {
    return "Neuron History " + this.widgetID;
  };

  NeuronHistoryWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.skeletonSource.destroy();
  };

  NeuronHistoryWidget.prototype.getWidgetConfiguration = function() {
    return {
      createControls: function(controls) {
        var self = this;
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this.skeletonSource);
        controls.appendChild(sourceSelect);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = this.skeletonSource.loadSource.bind(this.skeletonSource);
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

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Export CSV");
        csv.onclick = this.exportCSV.bind(this);
        controls.appendChild(csv);

        var maxInactivityTime = document.createElement('input');
        maxInactivityTime.setAttribute("type", "number");
        maxInactivityTime.setAttribute("min", "0");
        maxInactivityTime.style.width = "4em";
        maxInactivityTime.setAttribute("value", this.maxInactivityTime);
        maxInactivityTime.onclick = function() {
          self.maxInactivityTime = parseInt(this.value, 10);
          self.refresh();
        };
        var maxInactivityTimeLabel = document.createElement('label');
        maxInactivityTimeLabel.appendChild(document.createTextNode('Max. inactivity time (minutes)'));
        maxInactivityTimeLabel.appendChild(maxInactivityTime);
        controls.appendChild(maxInactivityTimeLabel);

        var tracingEvents = CATMAID.DOM.createCheckboxSelect("Tracing time", [{
          title: "Skeleton nodes", value: "nodes"}, {
          title: "Connector links", value: "connectors"}, {
          title: "Tags", value: "tags"}, {
          title: "Annotations", value: "annotations"}
        ], Array.from(this.tracingTimeComponents));
        tracingEvents.onchange = function(e) {
          var checked = e.target.checked;
          var component = e.target.value;
          if (checked) {
            self.tracingTimeComponents.add(component);
          } else {
            self.tracingTimeComponents.delete(component);
          }
          self.refresh();
        };
        controls.append(tracingEvents);

        var timeUnits = CATMAID.DOM.createCheckboxSelect("Tracing time units", [{
          title: "Seconds", value: "sec"}, {
          title: "Minutes", value: "min"}, {
          title: "Hours", value: "hours"}, {
          title: "Days", value: "days"}
        ], Array.from(this.timeUnits));
        timeUnits.onchange = function(e) {
          var checked = e.target.checked;
          var component = e.target.value;
          if (checked) {
            self.timeUnits.add(component);
          } else {
            self.timeUnits.delete(component);
          }
          self.refresh();
        };
        controls.append(timeUnits);

        let users = CATMAID.User.all();
        let userOptions = Object.keys(users).sort(function(a, b) {
          return CATMAID.tools.compareStrings(a, b);
        }).map(function(u) {
          return {
            title: users[u].login,
            value: u
          };
        });
        let userFilterSelect = CATMAID.DOM.createCheckboxSelect("User filter",
            userOptions, Array.from(this.userFilter), true);
        userFilterSelect.onchange = function(e) {
          var checked = e.target.checked;
          var component = parseInt(e.target.value, 10);
          if (checked) {
            self.userFilter.add(component);
          } else {
            self.userFilter.delete(component);
          }
          self.refresh();
        };
        controls.append(userFilterSelect);

        var clearUserFilter = document.createElement('input');
        clearUserFilter.setAttribute("type", "button");
        clearUserFilter.setAttribute("value", "Clear user filter");
        clearUserFilter.onclick = function(e) {
          self.userFilter.clear();
          self.refresh();
          $('input[type=checkbox]', userFilterSelect).prop('checked', false);
        };
        controls.appendChild(clearUserFilter);

        var mergeUsers = document.createElement('input');
        mergeUsers.setAttribute("type", "checkbox");
        mergeUsers.checked = this.mergeUsers;
        mergeUsers.onchange = function() {
          self.mergeUsers = this.checked;
          self.refresh();
        };
        var mergeUsersLabel = document.createElement('label');
        mergeUsersLabel.appendChild(mergeUsers);
        mergeUsersLabel.appendChild(document.createTextNode('Merge parallel events'));
        mergeUsersLabel.setAttribute('title', 'If true, parallel user activity won\'t be counted separately.');
        controls.appendChild(mergeUsersLabel);

        var startDateField = CATMAID.DOM.createDateField(null, 'Start (UTC)',
            'No change before this date will be respected. If empty, all changes are respected.',
            '', false, function() {
              self.timeWindowStart = this.value.length > 0 ?
                  new Date(Date.parse(this.value)) : null;
            }, null, 'YYYY-MM-DD hh:mm', true);
        controls.appendChild(startDateField);

        var endDateField = CATMAID.DOM.createDateField(null, 'End (UTC)',
            'No change after this date will be respected. If empty, all changes are respected.',
            '', false, function() {
              self.timeWindowEnd = this.value.length > 0 ?
                  new Date(Date.parse(this.value)) : null;
            }, null, 'YYYY-MM-DD hh:mm', true);
        controls.appendChild(endDateField);
      },
      createContent: function(content) {
        var self = this;
        var container = document.createElement('div');
        content.appendChild(container);

        var message = document.createElement('p');
        message.appendChild(document.createTextNode("This widget shows " +
          "information on the reconstruction progress of individual neurons " +
          "over time. Some information (splits and merges) is only available " +
          "if history tracking was enabled during reconstruction."));

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        this.table = $(table).DataTable({
          dom: "lrphtip",
          paging: true,
          autoWidth: false,
          order: [],
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          processing: true,
          ajax: function(data, callback, settings) {
            // Compile skeleton statistics and call datatables with results.
            self.getNeuronStatistics(function(nLoaded, nTotal) {
              // Updatethe table processing display
              $('.dataTables_wrapper .dataTables_processing', content).text(
                "Loaded statistics for " + nLoaded + " of " + nTotal + " skeletons. Please wait.");
            }).then(function(data) {
                callback({
                  draw: data.draw,
                  recordsTotal: data.length,
                  recordsFiltered: data.length,
                  data: data
                });
              })
              .catch(CATMAID.handleError);
          },
          "headerCallback": function( nHead, aData, iStart, iEnd, aiDisplay ) {
            var datatable = $(table).DataTable();
            datatable.columns().iterator('column', function ( settings, column) {
              if (settings.aoColumns[ column ].help!== undefined) {
                $(datatable.column(column).header()).attr('title', settings.aoColumns[ column ].help);
              }
            });
          },
          createdRow: function(row, data, index) {
            var tds = $('td', row);
            // Store skeleton ID in row
            $(row).attr('data-skeleton-id', data.skeletonId);
          },
          columns: [
            {
              title: "",
              className: "cm-center",
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a data-action="remove" href="#"><i class="fa fa-close" title="Remove neuron"></i></a>';
              }
            },
            {
              className: "cm-center",
              title: "Neuron",
              data: "skeletonId",
              render: function(data, type, row, meta) {
                var name = CATMAID.NeuronNameService.getInstance().getName(data);
                return '<a href="#" class="neuron-selection-link action-select">' +
                  (name ? name : "(undefined)") + '</a>';
              }
            },
            {className: "cm-center", title: "Tracing time", data: "tracingTime"},
            {className: "cm-center", title: "Review time", data: "reviewTime"},
            {className: "cm-center", title: "Total time", data: "totalTime"},
            {title: "Cable before review", data: "cableBeforeReview",
                help: "Unsmoothed cable length before first review, measured in nanometers."},
            {title: "Cable after review", data: "cableAfterReview",
                help: "Unsmoothed cable length after last review, measured in nanometers."},
            {title: "Connectors before review", data: "connBeforeReview",
                help: "Number of synaptic connections to partners before first review."},
            {title: "Connectors after review", data: "connAfterReview",
                help: "Number of synaptic connections to partners after last review."},
            {className: "cm-center", title: "First Tracing", data: "firstTracingTime"},
            {className: "cm-center", title: "Last Tracing", data: "lastTracingTime"},
            {className: "cm-center", title: "First Review", data: "firstReviewTime"},
            {className: "cm-center", title: "Last Review", data: "lastReviewTime"}
          ],
          language: {
            processing: "Compiling statistics. Please wait."
          }
        }).on("click", "td .action-select", this, function(e) {
          var skeletonId = $(this).closest("tr").attr("data-skeleton-id");
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
        }).on("click", "a[data-action=remove]", this, function(e) {
          var skeletonId = $(this).closest("tr").attr("data-skeleton-id");
          self.skeletonSource.removeSkeletons([skeletonId]);
        });
      },
      helpText: [
        '<p>This widget shows statistics on reconstruction and review of ',
        'neurons over time. To do this, it groups at all events that are either ',
        'part of the reconstruction or the review process of the input neurons. Events ',
        'that are seen as reconstruction events are <em>Node creation/update/',
        'deletion, connector creation/update/deletion as well as tag creation/',
        'update/deletion</em>. </em>Reconstruction events</em> are only represented by ',
        'themselves. Both lists of events are then used to create lists of so ',
        'called active bouts, a sorted series of events where the time ',
        'between two successive events isn\'t larger than a defined ',
        '<em>maximum inactivity time</em>. The default length of this time is ',
        '3 minutes. Based on these lists of bouts, the widget calculates the ',
        'following for each input skeleton:',
        '<dl>',
        '<dt>Tracing time</dt><dd>The sum of all active tracing bouts by all users.</dt>',
        '<dt>Review time</dt><dd>The sum of all active review bouts by all users.</dt>',
        '<dt>Total time</dt><dd>The sum of all active bouts (tracing and review) by all users.</dt>',
        '<dt>Cable before review</dt><dd>Cable length before first review event.</dt>',
        '<dt>Cable after review</dt><dd>Cable length after last review event.</dt>',
        '<dt>Connectors before review</dt><dd>The number of connectors before first review event.</dt>',
        '<dt>Connectors after review</dt><dd>The number of connectors after last review event</dt>',
        '</dl></p>',
        '<p>All values are calulate per skeleton and depending on the skeleton\'s ',
        'size, it is possivle this takes a few minutes.</p>',
      ].join('\n')
    };
  };

  function compareCompactTreenodes(a, b) {
    return a[8] < a[9];
  }

  function compareCompactConnectors(a, b) {
    return a[6] < a[6];
  }

  function cableLength(arbor, positions) {
    var children = arbor.childrenArray(),
        sum = 0;
    for (var i=0; i<children.length; ++i) {
      var node = children[i];
      var parentPos = positions[arbor.edges[node]];
      if (!parentPos) {
        parentPos = positions[node];
      }
      sum += positions[node].distanceTo(parentPos);
    }
    return sum;
  }

  /**
   * Return a promise that resolves with a list of objects, where each
   * represents a set of statistics for a neuron. These statistics are:
   *
   * Tracing time:  sum of all active bouts of create/edit events by all users
   * Review time:   sum of all active bouts of review events by all users
   * Cable before:  cable length before first review event
   * Cable after:   cable length after last review event
   * Conn. before:  number of connectors before first review event
   * Conn. after:   number of connectors after last review event
   * Review splits: Number of splits between first and last review event
   * Review merges: Number of merges between first and last review event
   *
   * @param {Function} tick Optional, called each time a skeleton was loaded.
   * @returns Promise instance resolving in above statistics for each skeleton
   *          in this widget's skeleton source.
   */
  NeuronHistoryWidget.prototype.getNeuronStatistics = function(tick) {
    // For each neuron, get each node along with its history
    var models = this.skeletonSource.getSkeletonModels();
    var skeletonIds = Object.keys(models);

    if (skeletonIds.length === 0) {
      return Promise.resolve([]);
    }

    var loadedSkeletons = 0;
    var maxInactivityTime = this.maxInactivityTime;
    var tracingTimeComponents = this.tracingTimeComponents;
    var timeUnits = this.timeUnits;
    var mergeUsers = this.mergeUsers;
    var onlyUsers = this.userFilter;
    var timeWindowStart = this.timeWindowStart;
    var timeWindowEnd = this.timeWindowEnd;
    var skeletonPromises = skeletonIds.map(function(skeletonId, i, ids) {
      return CATMAID.fetch(project.id + "/skeletons/" + skeletonId + "/compact-detail", "GET", {
        with_user_info: true,
        with_connectors: true,
        with_tags: true,
        with_history: true,
        with_merge_history: true,
        with_reviews: true,
        with_annotations: true
      })
      .then(function(skeletonDetail) {
        if (!skeletonDetail) {
          CATMAID.warn("No skeleton details on " + skeletonId);
          return null;
        }

        loadedSkeletons++;
        CATMAID.tools.callIfFn(tick, loadedSkeletons, ids.length);

        var resultComponents = new Set(['tracingTime', 'reviewTime',
          'totalTime', 'firstTracing', 'lastTracing', 'firstReview',
          'lastReview', 'cableBeforeAfterReview',
          'connectorBeftorAfterReview']);

        return NeuronHistoryWidget.skeletonDetailToStats(skeletonId,
            skeletonDetail, maxInactivityTime, tracingTimeComponents, timeUnits,
            mergeUsers, onlyUsers, resultComponents, timeWindowStart,
            timeWindowEnd);
      });
    });

    return Promise.all(skeletonPromises)
      .then(function(skeletonStats) {
        return skeletonStats.filter(function(s) {
          return !!s;
        });
      })
      .catch(CATMAID.handleError);
  };

  NeuronHistoryWidget.prototype.clear = function() {
    this.skeletonSource.clear();
    this.refresh();
  };

  NeuronHistoryWidget.skeletonDetailToStats = function(skeletonId,
      skeletonDetail, maxInactivityTime, tracingTimeComponents, timeUnits,
      mergeUsers, onlyUsers, resultComponents, timeWindowStart, timeWindowEnd) {
    var result = {
      skeletonId: skeletonId
    };
    var inputTagLists = [];
    var tagMap = skeletonDetail[2];
    for (var tag in tagMap) {
      inputTagLists.push(tagMap[tag]);
    }
    var tags = Array.prototype.concat.apply([], inputTagLists);

    var TS = CATMAID.TimeSeries;
    var availableEvents = {
      nodes: new TS.EventSource(skeletonDetail[0], 8, 2),
      connectors: new TS.EventSource(skeletonDetail[1], 6, 8),
      tags: new TS.EventSource(tags, 1, 2),
      reviews: new TS.EventSource(skeletonDetail[3], 3, 2),
      annotations: new TS.EventSource(skeletonDetail[4], 1, 2)
    };

    if (resultComponents.has('tracingTime')) {
      // Get sorted tracing events
      // TODO: count all writes
      var tracingEvents = TS.mergeEventSources(availableEvents,
          Array.from(tracingTimeComponents), 'asc', false, onlyUsers,
          timeWindowStart, timeWindowEnd);
      // Calculate tracing time by finding active bouts. Each bout consists of
      // a lists of events that contribute to the reconstruction of a neuron.
      // These events are currently node edits and connector edits.
      var activeTracingBouts = TS.getActiveBouts(tracingEvents,
          maxInactivityTime, mergeUsers);
      var tracingTime = TS.getTotalTime(activeTracingBouts);
      result.tracingTime = tracingTime ?
          CATMAID.tools.humanReadableTimeInterval(tracingTime, timeUnits) : "0";
    }

    if (resultComponents.has('reviewTime')) {
      // Get sorted review events
      var reviewEvents = TS.mergeEventSources(availableEvents, ["reviews"],
          'asc', false, onlyUsers, timeWindowStart, timeWindowEnd);
      var activeReviewBouts = TS.getActiveBouts(reviewEvents, maxInactivityTime,
          mergeUsers);
      var reviewTime = TS.getTotalTime(activeReviewBouts);
      result.reviewTime = reviewTime ?
          CATMAID.tools.humanReadableTimeInterval(reviewTime, timeUnits) : "0";
    }

    if (resultComponents.has('totalTime')) {
      var totalTimeComponents = new Set(tracingTimeComponents);
      totalTimeComponents.add('reviews');
      var totalEvents = TS.mergeEventSources(availableEvents,
          Array.from(totalTimeComponents), 'asc', false, onlyUsers,
          timeWindowStart, timeWindowEnd);
      var activeTotalBouts = TS.getActiveBouts(totalEvents, maxInactivityTime,
          mergeUsers);
      var totalTime = TS.getTotalTime(activeTotalBouts);
      result.totalTime = totalTime ?
          CATMAID.tools.humanReadableTimeInterval(totalTime, timeUnits) : "0";
    }

    // Get first and last review event. Bouts are sorted already, which
    // makes it easy to get min and max time.
    var firstReviewTime = null, lastReviewTime = null;
    if (activeReviewBouts.length > 0) {
      firstReviewTime = activeReviewBouts[0].minDate;
      lastReviewTime = activeReviewBouts[activeReviewBouts.length -1].maxDate;
    }
    var reviewAvailable = !!firstReviewTime && !!lastReviewTime;

    if (resultComponents.has('connectorBeftorAfterReview') ||
        resultComponents.has('cableBeforeAfterReview') ||
        resultComponents.has('splitMergeBeforeAfterReview')) {
      // History index creation works currently only for connectors and nodes,
      // which is also what we need for the before/after review computations.
      // Therefore, a new event source description is created.
      var beforeAfterEventSources = {
        nodes: availableEvents.nodes,
        connectors: availableEvents.connectors
      };

      // Get the sorted history of each node
      var history = TS.makeHistoryIndex(beforeAfterEventSources, true);
      // Set parent ID of parent nodes that are not available from the index
      // null. This essentially makes them root nodes. Which, however, for a
      // the given point in time is correct.
      TS.setUnavailableReferencesNull(beforeAfterEventSources.nodes,
          history.nodes, 1);

      // Review relative arbors
      var arborParserBeforeReview, arborParserAfterReview;
      if (reviewAvailable) {
        // The firstReviewTime parameter is already limited by timeWindowStart
        // and timeWindowEnd
        arborParserBeforeReview = TS.getArborBeforePointInTime(history.nodes,
            history.connectors, timeWindowStart, firstReviewTime);
        // TODO: Is it okay to take "now" as reference or do we need the last
        // review time? I.e. is the final arbor the interesting one or the one
        // right after review?
        arborParserAfterReview = TS.getArborBeforePointInTime(history.nodes, history.connectors,
            timeWindowStart, timeWindowEnd);
      } else {
        // Without reviews, the arbor at its current state is the one before
        // reviews.
        arborParserBeforeReview = TS.getArborBeforePointInTime(history.nodes, history.connectors,
            timeWindowStart, timeWindowEnd);
      }

      // Cable length information
      var cableBeforeReview = "N/A", cableAfterReview = "N/A";
      if (reviewAvailable) {
        cableBeforeReview = Math.round(cableLength(arborParserBeforeReview.arbor,
            arborParserBeforeReview.positions));
        cableAfterReview = Math.round(cableLength(arborParserAfterReview.arbor,
            arborParserAfterReview.positions));
      } else {
        cableBeforeReview = Math.round(cableLength(arborParserBeforeReview.arbor,
            arborParserBeforeReview.positions));
      }

      // Connector information
      var connectorsBeforeReview = "N/A", connectorsAfterReview = "N/A";
      if (reviewAvailable) {
        connectorsBeforeReview = arborParserBeforeReview.n_inputs +
            arborParserBeforeReview.n_presynaptic_sites;
        connectorsAfterReview = arborParserAfterReview.n_inputs +
            arborParserAfterReview.n_presynaptic_sites;
      } else {
        connectorsBeforeReview = arborParserBeforeReview.n_inputs +
            arborParserBeforeReview.n_presynaptic_sites;
      }

      result.cableBeforeReview = cableBeforeReview;
      result.cableAfterReview = cableAfterReview;
      result.connBeforeReview = connectorsBeforeReview;
      result.connAfterReview = connectorsAfterReview;
      result.splitsDuringReview = "?";
      result.mergesDuringReview = "?";
    }

    let hasActiveTotalBouts = activeTracingBouts && activeTracingBouts.length > 0;
    if (resultComponents.has('firstTracing')) {
      result.firstTracingTime = hasActiveTotalBouts ?
          activeTracingBouts[0].minDate : "N/A";
    }
    if (resultComponents.has('lastTracing')) {
      result.lastTracingTime = hasActiveTotalBouts ?
          activeTracingBouts[activeTracingBouts.length - 1].maxDate : "N/A";
    }
    if (resultComponents.has('firstReview')) {
      result.firstReviewTime = reviewAvailable ? firstReviewTime : "N/A";
    }
    if (resultComponents.has('lastReview')) {
      result.lastReviewTime = reviewAvailable ? lastReviewTime : "N/A";
    }

    return result;
  };

  /**
   * Update neuron name service and refresh widget.
   */
  NeuronHistoryWidget.prototype.refreshSkeletons = function() {
    var self = this;
    var nns = CATMAID.NeuronNameService.getInstance();
    nns.unregister(this);
    nns.registerAll(this, this.skeletonSource.getSkeletonModels())
      .then(function() {
        self.refresh();
      })
      .catch(CATMAID.handleError);
  };

  NeuronHistoryWidget.prototype.refresh = function() {
    if (this.table) {
      this.table.ajax.reload();
    }
  };

  NeuronHistoryWidget.prototype.updateNeuronNames = function() {
    if (this.table) {
      this.table.rows().invalidate('data');
      this.table.draw(false);
    }
  };

  NeuronHistoryWidget.prototype.highlight = function(skeletonId) {
    if (this.table) {
      var allRows = this.table.rows().nodes().to$();
      allRows.removeClass('highlight');
      if (skeletonId) {
        allRows.filter('tr[data-skeleton-id=' + skeletonId + ']').addClass('highlight');
      }
    }
  };

  NeuronHistoryWidget.prototype.exportCSV = function() {
    if (!this.table) return;
    var data = this.table.buttons.exportData({
      modifier: {
        search: 'applied'
      }
    });
    if (0 === data.body.length) {
      CATMAID.warn("Please load at least one skeleton first");
      return;
    }
    var csv = data.header.join(',') + '\n' + data.body.map(function(row) {
      return '"' + row[0] + '","' + row[1] + '","' + row[2] + '",' +
          row.slice(3).join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, 'catmaid-neuron-history-' + CATMAID.tools.getDateSuffix() + '.csv');
  };

  // Export widget
  CATMAID.NeuronHistoryWidget = NeuronHistoryWidget;

  function toSet(array) {
    return new Set(array);
  }

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron History Widget",
    description: "List time information regarding reconstruction and review",
    key: 'neuron-history',
    creator: NeuronHistoryWidget,
    state: {
      getState: function(widget) {
        return {
          maxInactivityTime: widget.maxInactivityTime,
          tracingTimeComponents: Array.from(widget.tracingTimeComponents),
          timeUnits: Array.from(widget.timeUnits),
          mergeUsers: widget.mergeUsers
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'maxInactivityTime');
        CATMAID.tools.copyIfDefined(state, widget, 'tracingTimeComponents',
            'tracingTimeComponents', toSet);
        CATMAID.tools.copyIfDefined(state, widget, 'timeUnits', 'timeUnits',
            toSet);
        CATMAID.tools.copyIfDefined(state, widget, 'mergeUsers');
      }
    }
  });

})(CATMAID);
