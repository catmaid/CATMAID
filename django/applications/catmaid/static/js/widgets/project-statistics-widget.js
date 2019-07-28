/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  project,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var ProjectStatistics = function()
  {
    // Store retrieved data locally to change time unit on the fly
    var statisticsData = null;
    // The time interval for the contribution table, default to days
    var timeUnit = "day";
    // The users that are currently aggregated
    var aggregatedUsers = new Set();

    // Whether import activity should be included in the displayed statistics.
    this.includeImports = false;

    // How many largest neurons should be displayed
    this.displayTopN = 10;

    // An optional text pattern that the largest neurons need to have
    this.topNNameFilter = '';

    var update_stats_fields = function(data) {
      $("#skeletons_created").text(data.skeletons_created);
      $("#treenodes_created").text(data.treenodes_created);
      $("#connectors_created").text(data.connectors_created);
    };

    var get_formated_entry = function(data) {
      function wrapWithLink(num, type) {
        // Create a new link that retrieves the required information.
        var link = '<a href="#" data-from="' + data.from + '" data-to="' +
            data.to + '" data-type="' + type +'" data-user="' + data.user + '">' + num + '</a>';
        return link;
      }

      var entry = '', points = 0;
      if( data.hasOwnProperty('new_cable_length') && data['new_cable_length'] > 0 ) {
        entry += wrapWithLink(data['new_cable_length'].toLocaleString(), 'created') + ' /';
        points += data['new_cable_length'];
      } else {
        entry += '0 /';
      }
      if( data.hasOwnProperty('new_treenodes') && data['new_treenodes'] > 0 ) {
        entry += wrapWithLink(data['new_treenodes'].toLocaleString(), 'created') + ' /';
        points += data['new_treenodes'];
      } else {
        entry += ' 0 /';
      }
      if( data.hasOwnProperty('new_connectors') && data['new_connectors'] > 0 ) {
        entry += ' ' + wrapWithLink(data['new_connectors'].toLocaleString(), 'connectors') + ' /';
        points += data['new_connectors'];
      } else {
        entry += ' 0 /';
      }
      if( data.hasOwnProperty('new_reviewed_nodes') && data['new_reviewed_nodes'] > 0 ) {
        entry += ' ' + wrapWithLink(data['new_reviewed_nodes'].toLocaleString(), 'reviewed');
        points += data['new_reviewed_nodes'];
      } else {
        entry += ' 0';
      }
      return {'entry': entry, 'points': points};
    };

    /**
     * (Re)creates the summary table at the top of the widget, based on the data
     * object passed as parameter. The <timeinterval> parameter allows to
     * summarize multiple days, e.g. in weeks when <timeinterval> is 7. For
     * displaying days, it has to be 1.
     */
    var update_user_history = function(data, timeunit) {
      // Select time interval, default to days
      var timeinterval;
      if ("year" === timeunit) {
        timeinterval = 365;
      } else if ("month" === timeunit) {
        timeinterval = 30;
      } else if ("week" === timeunit) {
        timeinterval = 7;
      } else if ("day" === timeunit) {
        timeinterval = 1;
      } else if ("all" === timeunit) {
        timeinterval = data['days'].length;
      } else {
        throw new CATMAID.ValueError("Unknown time unit: " + timeunit);
      }
      // Find interval remainder of timespan in days
      var intervalRemainder = data['days'].length % timeinterval;

      var usernamesToIds = Object.keys(data['stats_table']).reduce(function(o, id) {
        var u = CATMAID.User.all()[id];
        o[u ? u.login : id] = id;
        return o;
      }, {});
      var userNames = Object.keys(usernamesToIds).sort();
      var userIds = userNames.map(function(userName) {
        return parseInt(usernamesToIds[userName], 10);
      });
      var unselectedIds = userIds.filter(function(userId) {
        return !aggregatedUsers.has(userId);
      });

      // Draw table header, showing only the first day of each interval
      $('#project_stats_history_table').empty();
      var header = '<thead>';
      header += '<tr>';
      let selectAllChecked = unselectedIds.length === 0 ? 'checked' : '';
      header += '<th><input type="checkbox" data-role="select-all" ' + selectAllChecked + ' /></th>';
      header += '<th>username</th>';
      for(var i = 0; i < data['days'].length; i=i+timeinterval ) {
        // Add interval start date as column header, add "+ X days" if
        // interval is > 1.
        var text = data['daysformatted'][i];
        if (timeunit === "all") {
          text = "All since " + text;
        } else if (timeinterval > 1) {
          // Show remainder instead of full interval on last column, but only if
          // there is more than one day shown.
          if (i + timeinterval < data['days'].length) {
            text += " + " + (timeinterval - 1) + " days";
          } else if (intervalRemainder > 1) {
            text += " + " + (intervalRemainder - 1) + " days";
          }
        }
        header += '<th>' + text + '</th>';
      }
      header += '</tr></thead>';
      $('#project_stats_history_table').append( header );

      // Sort by username
      var odd_row = true;
      // Draw table body, add up numbers for each interval
      let tbody = $('<tbody />');
      var showUserAnalytics = userAnalyticsAccessible(project.id);
      let intervals = userNames.map(function(username, i) {
        var uid = userIds[i];
        var row = '', weekpointcount = 0;
        row += '<tr class="' + (odd_row ? "odd" : "") + '" data-user-id="' + uid + '" >';
        let userIntervals = [];
        if( data['stats_table'].hasOwnProperty( uid ) ) {
          let selected = aggregatedUsers.has(uid) ? 'checked' : '';
          row += '<td><input type="checkbox" data-role="user-select" ' + selected + ' /></td>';
          if (showUserAnalytics) {
            row += '<td><a href="#" data-user-id="' + uid + '">' + username + '</a></td>';
          } else {
            row += '<td>' + username + '</td>';
          }
          // Print statistics cells, wrt. time interval
          for (var i = 0; i < data['days'].length; i=i+timeinterval) {
            var intervalData = {
              new_cable_length: 0,
              new_treenodes: 0,
              new_connectors: 0,
              new_reviewed_nodes: 0,
              user: uid,
              from: data['days'][i],
              to: data['days'][i + timeinterval - 1] || data['days'][data['days'].length - 1],
            };
            // Aggregate statistics for current time interval
            for (var j = 0; j< timeinterval; ++j) {
                // Cancel iteration after last entry
                if (i + j > data['days'].length - 1) {
                  break;
                }
                // Add current day's data
                var datekey = data['days'][i + j];
                var stats = data['stats_table'][uid][datekey];
                intervalData.new_cable_length += stats.new_cable_length || 0;
                intervalData.new_treenodes += stats.new_treenodes || 0;
                intervalData.new_connectors += stats.new_connectors || 0;
                intervalData.new_reviewed_nodes += stats.new_reviewed_nodes || 0;
            }
            // Print table cell
            var formated = get_formated_entry(intervalData);
            row += '<td>'+ formated['entry'] +'</td>';
            weekpointcount += formated['points'];
            userIntervals.push(intervalData);
          }
        }
        row += '</tr>';
        if( weekpointcount > 0 ) {
          // Flip odd row marker
          odd_row = !odd_row;
          // Add row
          tbody.append( row );
        }

        return [uid, userIntervals];
      });
      $('#project_stats_history_table').append(tbody);

      // Add footer for aggregate stats of selected users
      if (aggregatedUsers.size > 0) {
        let aggData = new Array(Math.ceil(data['days'].length / timeinterval));
        for (let i=0; i<intervals.length; ++i) {
          let userId = intervals[i][0];
          let intervalData = intervals[i][1];
          if (!aggregatedUsers.has(userId)) {
            continue;
          }
          for (let j=0; j<intervalData.length; ++j) {
            let interval = intervalData[j];
            let currentIntervalAgg = aggData[j];
            if (currentIntervalAgg === undefined) {
              currentIntervalAgg = {
                new_cable_length: 0,
                new_treenodes: 0,
                new_connectors: 0,
                new_reviewes: 0
              };
              aggData[j] = currentIntervalAgg;
            }

            currentIntervalAgg.new_cable_length += interval.new_cable_length;
            currentIntervalAgg.new_treenodes += interval.new_treenodes;
            currentIntervalAgg.new_connectors += interval.new_connectors;
            currentIntervalAgg.new_reviewed_nodes += interval.new_reviewed_nodes;
          }
        }
        let footer = $('<tfoot />');
        let row = '<tr><th></th><th>Selected users</th>';
        for (let i=0; i<aggData.length; ++i) {
          // Print table cell
          var formated = get_formated_entry(aggData[i]);
          row += '<td>'+ formated['entry'] +'</td>';
        }

        row += '</tr>';
        footer.append(row);
        $('#project_stats_history_table').append(footer);
      }

      // Add handler for user aggregation toggles
      $('#project_stats_history_table').on('change','input[data-role=user-select]', function(e) {
        let userId = parseInt($(this).closest('tr').get(0).dataset.userId, 10);
        if (this.checked) {
          aggregatedUsers.add(userId);
        } else {
          aggregatedUsers.delete(userId);
        }
        update_user_history(statisticsData, timeUnit);
      });
      $('#project_stats_history_table').on('change','input[data-role=select-all]', function(e) {
        if (this.checked) {
          for (var i=0; i<userNames.length; ++i) {
            var uid = parseInt(usernamesToIds[userNames[i]], 10);
            aggregatedUsers.add(uid);
          }
        } else {
          aggregatedUsers.clear();
        }
        $('#project_stats_history_table').find('input[data-role=user-select]').prop('checked', this.checked);
        update_user_history(statisticsData, timeUnit);
      });

      if (showUserAnalytics) {
        // Add user analytics link handler
        $('#project_stats_history_table').find('a[data-user-id]').click(function(e) {
          var userId = this.getAttribute('data-user-id');
          openUserAnalytics({
            userId: userId,
            startDate: $("#stats-history-start-date").val(),
            endDate: $("#stats-history-end-date").val()
          });
        });
      }

      // Add handler for embedded links
      $('#project_stats_history_table').find('a[data-type]').click(function(e) {
        var type = this.getAttribute('data-type');
        var user_id = this.getAttribute('data-user');
        var from = this.getAttribute('data-from');
        var to = this.getAttribute('data-to');

        switch (type)
        {

          case 'created':
          case 'reviewed':
            var params = {
              'from': from,
              'to': to,
              'nodecount_gt': 1,
            };
            if (type === 'created') {
              params['created_by'] = user_id;
            } else {
              params['reviewed_by'] = user_id;
            }

            // Query all neurons reviewed by the given user in the given timeframe
            CATMAID.fetch(project.id + '/skeletons/', 'GET', params)
              .then(function(skeleton_ids) {
                // Open a new selection table with the returned set of
                // skeleton IDs, if any.
                if (0 === skeleton_ids.length) {
                  CATMAID.info('No skeletons found for your selection');
                  return;
                }
                var models = skeleton_ids.reduce(function(o, skid) {
                  o[skid] = new CATMAID.SkeletonModel(skid, "",
                      new THREE.Color(1, 1, 0));
                  return o;
                }, {});
                var widget = WindowMaker.create('selection-table').widget;
                if (widget) {
                  widget.append(models);
                } else {
                  CATMAID.warn('Couldn\'t open selection table');
                }
              })
              .catch(CATMAID.handleError);
            break;
          case 'connectors':
            // Query all connectors created by the given user in the given
            // timeframe and open the connector selection table
            CATMAID.fetch(project.id + '/connector/list/completed', 'GET', {
                completed_by: user_id,
                from: from,
                to: to,
              })
              .then(function(connectors) {
                if (0 === connectors.length) {
                  CATMAID.info('No connectors found for your selection');
                  return;
                }

                CATMAID.ConnectorSelection.show_connectors(connectors);
              })
              .catch(CATMAID.handleError);
            break;
          default:
            return;
        }
      });
    };

    /**
     * Update the pie chart with the passed in <chart_name> with the passed in
     * <data>. The data maps user IDs to values.
     */
    var update_piechart = function(data, chart_name) {
      var userIds = Object.keys(data);
      var userNodeCounts = userIds.map(function(userId) {
        var count = this[userId];
        // Due to the way Raphael renders a single 100% user, no pie chart
        // unless there is at least one other value > 0. Therefore, zero is not
        // represented as zero for Raphael, but almost zero.
        return count === 0 ? 0.00001 : count;
      }, data);

      if (userNodeCounts.length === 1) {
        userIds.push("Anonymous");
        userNodeCounts.push(0.00001);
      }

      $('#' + chart_name).empty();

      var x = 90, y = 100, radius = 80, height = 200;
      // Create basic pie chart without any labels
      var rpie = Raphael(chart_name, '100%', height);
      var colorizer = d3.scale.category10();
      // WARNING: Raphael will change the data.values array in place, shortening it
      // and replacing the long tail of low values to a single entry that
      // is annotated with the boolean flag "others".
      // The parameter maxSlices should be accepted but it is ignored.
      var pie = rpie.piechart(x, y, radius, userNodeCounts, {
          colors: userNodeCounts.map(function(v, i) { return colorizer(i);}),
      });

      /* Manually draw labels, because the legend can easily grow to large and
       * Raphael has no way of dealing with this properly. Therefore, name columns
       * are created manually if the list grows too long in Y. Of course, also the
       * X can be maxed out and this is the reason the SVG's width is set to 100%.
       */
      pie.labels = rpie.set();
      // Top left corner of the whole lefend
      var legend_x = x + radius + 16;
      var legend_y = y - radius;
      // The height of one legend line
      var line_height = 17;
      // Shifting is needed for making columns if the list grows to long
      var shift_x = 0, shift_y = 0;
      // The current maximum label lengths, can increase over time
      var max_label_width = 0;
      // Draw all labels, including a colored circle in front of it
      userNodeCounts.forEach(function(e, i) {
        var userId = userIds[e.order];
        var circ_r = 5;
        var text_indent = 2 * circ_r + 10;
        var l_x = legend_x + shift_x;
        var l_y = legend_y + i * line_height + shift_y;
        // Make name columns if names don't fit under below each other
        if (l_y + line_height > y + radius) {
          shift_x = shift_x + max_label_width + text_indent + 16;
          shift_y = -1 * (i + 1) * line_height;
        }

        var color = pie.series[i].attrs.fill;
        // Draw leading color circle
        var circle = rpie.circle(l_x + circ_r, l_y + circ_r, circ_r)
            .attr({
                'stroke': color,
                'fill': color,
            });
        // Draw label, the rounding is needed to to a corner case with a single
        // 100% users with other zero contribution users, for which we set the
        // zero values to 0.00001 above.
        var labelText = (e.others ? "Others" : CATMAID.User.safe_get(userId).login) +
            " (" + Math.round(e.value) + ")";
        var text = rpie.text(l_x + 2 * circ_r + 10, l_y + circ_r, labelText)
          .attr({
            'text-anchor': 'start',
            'font': '12px Arial, sans-serif',
          });
        // Find maximum text width
        var bb = text.getBBox();
        if (bb.width > max_label_width) {
            max_label_width = bb.width;
        }
        // Remember label
        pie.labels.push(rpie.set());
        pie.labels[i].push(circle);
        pie.labels[i].push(text);
      });

      // Add hover functionality
      var current_label = null;
      pie.hover(
        function () {
          // Scale everything up
          this.sector.stop();
          this.sector.scale(1.1, 1.1, this.cx, this.cy);
          if (this.label) {
            this.label[0].stop();
            this.label[0].attr({ r: 7.5 });
            this.label[1].attr({"font-weight": 800});
          }
        },
        function () {
          // Scale everything back to normal
          this.sector.animate({ transform: "s1 1 " + this.cx + " " + this.cy }, 500, "bounce");
          if (this.label) {
            this.label[0].animate({ r: 5 }, 500, "bounce");
            this.label[1].attr({"font-weight": 400});
          }
        });
    };

    var parseDate = function(d) {
      var d_s = d.toString();
      var year = d_s.substring(0, 4);
      var month = d_s.substring(4, 6);
      var day = d_s.substring(6, 8);
      return new Date(year + '-' + month + '-' + day);
    };

    Date.prototype.addDays = function(days){
      var msPerDay = 1000 * 60 * 60 * 24;
      var ms = this.getTime() + (msPerDay * days);
      var added = new Date(ms);
      return added;
    };

    var update_linegraph = function(data) {
      $("#linechart_treenode_holder").empty();

      var w = 600, h = 400, wPadding = 40, hPadding = 65;
      var legendW = 100;
      var endDate = new Date();
      var startDate = endDate.addDays(-30);
      var msPerDay = 1000 * 60 * 60 * 24;

      // Create zero-filled arrays for each user spanning the full date range.
      var dateRange = (endDate - startDate) / msPerDay;
      var counts = {};
      var name, i;
      for (var d in data) {
        var date = parseDate(data[d].date);
        name = data[d].name;
        var dayIndex = Math.round((date - startDate) / msPerDay);
        if (!(name in counts)) {
          counts[name] = [];
          for (i = 0; i < dateRange; i++) {
            counts[name][i] = 0;
          }
        }
        counts[name][dayIndex] = data[d].count;
      }

      // Set up scales to map dates and counts to pixels.
      var dateScale = d3.time.scale()
        .domain([startDate, endDate])
        .range([wPadding, w - wPadding]);
      var countScale = d3.scale.linear()
        .domain([0, d3.max(data.map(function(x) { return x.count; }))])
        .range([h - hPadding, hPadding]);

      // Create a generator that will produce the x,y points defining each line given a count and a day index.
      var lineGen = d3.svg.line()
        .x(function(d, i) { return dateScale(startDate.addDays(i)); })
        .y(countScale);

      // Create the chart
      var chart = d3.select("div#linechart_treenode_holder").append("svg")
        .attr("class", "chart")
        .attr("width", w)
        .attr("height", h);

      // Add a line for each user.
      var lineGroup = chart.append("g")
        .attr("class", "linegroup");
      var colors = ['red', 'blue', 'green', 'yellow', 'orange', 'black', 'gray'];
      i = 0;
      for (name in counts) {
        lineGroup.append("svg:path")
          .attr("d", lineGen(counts[name]))
          .attr("stroke", colors[i]);
        i = i + 1;
      }

      // Add the x axis.
      var xAxis = d3.svg.axis()
        .scale(dateScale)
        .orient("bottom");
      var xAxisGroup = chart.append("g")
        .attr("class", "axis")
          .attr("transform", "translate(0, " + (h - hPadding) + ")")
        .call(xAxis);
      xAxisGroup.selectAll("text")
        .attr("text-anchor", "start")
        .attr("transform", function(d) {return "rotate(90) translate(8, -" + this.getBBox().height + ")";});

      // Add the y axis.
      var yAxis = d3.svg.axis()
        .scale(countScale)
        .orient("right");
      chart.append("g")
        .attr("class", "axis")
          .attr("transform", "translate(" + (w - wPadding) + ", 0)")
        .call(yAxis);

      // Add the y-axis label.
      chart.append("text")
        .attr("class", "y-label")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", 0)
        .attr("transform", "translate(" + (w - 12) + ", " + (h / 2) + ") rotate(90)")
        .text("Nodes edited");
    };

    this.refresh_project_statistics = function() {
      this.refresh_history();
      this.refreshNodecount();
      this.refreshLargestNeurons();
    };

    this.refreshNodecount = function() {
      return CATMAID.fetch({
          url: project.id + '/stats/nodecount',
          data: {
            with_imports: this.includeImports,
          },
          parallel: true,
        })
        .then(function(response) {
          // The respose maps user IDs to number of nodes
          update_piechart(response, "piechart_treenode_holder");
        })
        .catch(CATMAID.handleError);
    };

    this.refreshLargestNeurons = function() {
      let self = this;
      return CATMAID.fetch({
          url: project.id + '/stats/cable-length',
          data: {
            'n_skeletons': this.displayTopN,
            'name_pattern': this.topNNameFilter,
          },
          parallel: true,
        })
        .then(function(result) {
          let models = result.reduce(function(o, si) {
            o[si[0]] = new CATMAID.SkeletonModel(si[0]);
            return o;
          }, {});
          return CATMAID.NeuronNameService.getInstance().registerAll(self, models)
            .then(function() {
              return result;
            });
        })
        .then(function(result) {
          let target = document.getElementById("project-stats-largest-neurons");
          if (!target) {
            CATMAID.warn("Could not find target element");
            return;
          }
          // Clear target container
          while (target.lastChild) {
            target.removeChild(target.lastChild);
          }
          // Add numeric field to change number of displayed elements
          CATMAID.DOM.appendElement(target, {
            type: 'numeric',
            label: 'Top N',
            title: 'The number of largest neurons to be displayed.',
            value: self.displayTopN,
            min: 1,
            step: 1,
            onchange: (e) => {
              self.displayTopN = parseInt(e.target.value, 10);
              self.refreshLargestNeurons();
            },
          });
          CATMAID.DOM.appendElement(target, {
            type: 'text',
            label: 'Name filter',
            title: 'Only retrieve skeletons that match this name pattern.',
            placeholder: 'Use / for RegEx',
            value: self.topNNameFilter,
            onchange: (e) => {
              self.topNNameFilter = e.target.value;
              self.refreshLargestNeurons();
            },
          });

          // Add top ten
          let NNS = CATMAID.NeuronNameService.getInstance();
          let ul = target.appendChild(document.createElement('ul'));
          for (let i=0; i<result.length; ++i) {
            let li = ul.appendChild(document.createElement('li'));
            let liKey = li.appendChild(document.createElement('span'));
            liKey.appendChild(document.createTextNode((i+1) + '.'));
            let liLink = li.appendChild(document.createElement('a'));
            liLink.href = '#';
            liLink.dataset.skeletonId = result[i][0];
            liLink.dataset.role = 'select-skeleton';
            liLink.appendChild(document.createTextNode(NNS.getName(result[i][0])));
            let scoreSpan = li.appendChild(document.createElement('span'));
            scoreSpan.classList.add('cable-length');
            scoreSpan.appendChild(document.createTextNode(' (' + Math.round(result[i][1]) + 'nm)'));
          }
        });
    };

    this.refresh_history = function() {
      // disable the refresh button until finished
      $(".stats-history-setting").prop('disabled', true);
      CATMAID.fetch({
          url: project.id + '/stats/user-history',
          data: {
            "pid": project.id,
            "start_date": $("#stats-history-start-date").val(),
            "end_date": $("#stats-history-end-date").val(),
          },
          parallel: true,
        })
        .then(function(jso) {
          $(".stats-history-setting").prop('disabled', false);
          statisticsData = jso || null;
          update_user_history(jso, timeUnit);
        })
        .catch(CATMAID.handleError);
      return true;
    };

    var refresh_editors = function() {
      CATMAID.fetch(project.id + '/stats/editor')
        .then(function(response) {
          update_piechart(response, "piechart_editor_holder");
        })
        .catch(CATMAID.handleError);
      return true;
    };

    var refresh_summary = function() {
      CATMAID.fetch(project.id + '/stats/summary')
        .then(function(response) {
          update_stats_fields(jso);
        })
        .catch(CATMAID.handleError);
      return true;
    };

    /**
     * Recreates the summary table based on the selected time unit. It can be
     * one of "day", "week", "month" or "year".
     */
    this.refresh_timeunit = function(unit) {
      timeUnit = unit;
      update_user_history(statisticsData, timeUnit);
    };
  };

  ProjectStatistics.prototype.getName = function() {
    return "Statistics";
  };

  ProjectStatistics.prototype.getWidgetConfiguration = function() {
    var config = {
      contentID: "project_stats_widget",
      controlsID: "project_stats_controls",
      createControls: function(controls) {
        var self = this;

        let refresh = controls.appendChild(document.createElement('input'));
        refresh.setAttribute('type', 'button');
        refresh.setAttribute('value', 'Refresh');
        refresh.onclick = function() {
          self.refresh_project_statistics();
        };

        // If this user has has can_administer permissions in this project,
        // buttons to access additional tools are addeed.
        if (userAnalyticsAccessible(project.id)) {
          var userAnalytics = document.createElement('input');
          userAnalytics.setAttribute("type", "button");
          userAnalytics.setAttribute("value", "User Analytics");
          userAnalytics.onclick = function() {
            openUserAnalytics({
              startDate: $("#stats-history-start-date").val(),
              endDate: $("#stats-history-end-date").val()
            });
          };
          controls.appendChild(userAnalytics);
        }
      },
      createContent: function(container) {
        container.innerHTML =
          '<div class="project-stats">' +
          '<h3>Contribution Record</h3>' +
          '<p>' +
            '<div class="left">' +
            'beween <input type="text" class="stats-history-setting"' +
                'id="stats-history-start-date" />' +
            'and <input type="text" class="stats-history-setting"' +
                'id="stats-history-end-date" />' +
            '<input type="button" class="stats-history-setting"' +
                'id="stats-history-refresh" value="Refresh" />' +
            '</div>' +
            '<div class="right">' +
              'Time unit' +
              '<select id="stats-time-unit" class="stats-history-setting">' +
                '<option value="day">Day</option>' +
                '<option value="week">Week</option>' +
                '<option value="month">Month</option>' +
                '<option value="year">Year</option>' +
                '<option value="all">All</option>' +
              '</select>' +
            '</div>' +
          '</p>' +
          '<div class="clear">' +
            '<br />' +
            'per cell values: new cable length (nm) / new nodes / completed connector links / reviewed nodes' +
            '<table cellpadding="0" cellspacing="0" border="1" class="project-stats"' +
                'id="project_stats_history_table">' +
            '</table>' +
          '</div>' +
          '<br clear="all" />' +
          '<h3>Nodes created by user</h3>' +
          '<div class="buttonpanel" data-role="piechart_treenode_controls"></div>' +
          '<div id="piechart_treenode_holder"></div>' +
          '<br clear="all" />' +
          '<h3>Largest neurons</h3>' +
          '<div id="project-stats-largest-neurons"></div>' +
          '</div>';

        $(container).on('click', 'a[data-role=select-skeleton]', function() {
          let skeletonId = parseInt(this.dataset.skeletonId, 10);
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
        });

        var self = this;

        var includeImports = document.createElement('label');
        includeImports.title = "If checked, all statistics will also include " +
            "import activity. Is only precise if history tracking is enabled.";
        var includeImportsCb = document.createElement('input');
        includeImportsCb.setAttribute('type', 'checkbox');
        includeImportsCb.checked = this.includeImports;
        includeImportsCb.onchange = function() {
          self.includeImports = this.checked;
          self.refreshNodecount();
        };
        includeImports.appendChild(includeImportsCb);
        includeImports.appendChild(document.createTextNode('Include imports'));

        $('div[data-role=piechart_treenode_controls]', container).append(includeImports);
      },
      init: function() {
        var self = this;
        // Make the contribution record input fields date selectors
        $("#stats-history-start-date")
          .datepicker({ dateFormat: "yy-mm-dd", defaultDate: -10 })
          .datepicker('setDate', "-10");
        $("#stats-history-end-date")
          .datepicker({ dateFormat: "yy-mm-dd", defaultDate: 0 })
          .datepicker('setDate', "0");
        // Attach handler to history refresh button
        $("#stats-history-refresh").click(function() {
          self.refresh_history();
        });
        // Attach handler to time unit selector
        $("#stats-time-unit").change(function() {
          self.refresh_timeunit(this.options[this.selectedIndex].value);
        });

        // Updae the actual statistics
        this.refresh_project_statistics();
      }
    };

    return config;
  };

  var userAnalyticsAccessible = function(projectId) {
    return CATMAID.hasPermission(projectId, 'can_browse');
  };

  var openUserAnalytics = function(options) {
    var ui = WindowMaker.show('user-analytics', {
      'initialUpdate': false
    });
    var widget = ui.widget;
    widget.setUserId(options.userId);
    widget.setStartDate(options.startDate);
    widget.setEndDate(options.endDate);
    widget.refresh();
  };

  var openUserProficiency = function() {
    WindowMaker.show('user-analytics');
  };

  // Export statistics widget
  CATMAID.ProjectStatistics = ProjectStatistics;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Project Statistics",
    description: "Show user statistics for this project",
    key: "statistics",
    creator: ProjectStatistics,
    state: {
      getState: function(widget) {
        return {
          includeImports: widget.includeImports
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, "includeImports");
      }
    }
  });

})(CATMAID);
