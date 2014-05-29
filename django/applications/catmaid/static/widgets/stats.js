/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var ProjectStatistics = new function()
{
  // Store retrieved data locally to change time unit on the fly
  var statisticsData = null;
  // The time interval for the contribution table, default to days
  var timeUnit = "day";

  var update_stats_fields = function(data) {
    $("#skeletons_created").text(data.skeletons_created);
    $("#treenodes_created").text(data.treenodes_created);
    $("#connectors_created").text(data.connectors_created);
  }

  var get_formated_entry = function(data) {
    var entry = '', points = 0;
    if( data.hasOwnProperty('new_treenodes') ) {
      entry += data['new_treenodes'] + ' /';
      points += data['new_treenodes'];
    } else {
      entry += '0 /';
    };
    if( data.hasOwnProperty('new_connectors') ) {
      entry += ' ' + data['new_connectors'] + ' /';
      points += data['new_connectors'];
    } else {
      entry += ' 0 /';
    };
    if( data.hasOwnProperty('new_reviewed_nodes') ) {
      entry += ' ' + data['new_reviewed_nodes'];
      points += data['new_reviewed_nodes'];
    } else {
      entry += ' 0';
    };
    return {'entry': entry, 'points': points};
  }

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
      timeinterval = 365
    } else if ("month" === timeunit) {
      timeinterval = 30
    } else if ("week" === timeunit) {
      timeinterval = 7
    } else {
      timeinterval = 1
    }
    // Find interval remainder of timespan in days
    var intervalRemainder = data['days'].length % timeinterval;

    // Draw table header, showing only the first day of each interval
    $('#project_stats_history_table').empty();
    var header = '';
    header += '<tr>';
    header += '<th>username</th>';
    for(var i = 0; i < data['days'].length; i=i+timeinterval ) {
      // Add interval start date as column header, add "+ X days" if
      // interval is > 1.
      var text = data['daysformatted'][i];
      if (timeinterval > 1) {
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
    header += '</tr>';
    $('#project_stats_history_table').append( header );

    // Draw table body, add up numbers for each interval
    var odd_row = true;
    for(var username in data['stats_table']) {
      var row = '', weekpointcount = 0;
      row += '<tr class="' + (odd_row ? "odd" : "") + '">';
      if( data['stats_table'].hasOwnProperty( username ) ) {
        row += '<td>' + username + '</td>';
        // Print statistics cells, wrt. time interval
        for (var i = 0; i < data['days'].length; i=i+timeinterval) {
          var intervalData = {
            new_treenodes: 0,
            new_connectors: 0,
            new_reviewed_nodes: 0,
          }
          // Aggregate statistics for current time interval
          for (var j = 0; j< timeinterval; ++j) {
              // Cancel iteration after last entry
              if (i + j > data['days'].length - 1) {
                break;
              }
              // Add current day's data
              var datekey = data['days'][i + j];
              var stats = data['stats_table'][username][datekey];
              intervalData.new_treenodes += stats.new_treenodes || 0;
              intervalData.new_connectors += stats.new_connectors || 0;
              intervalData.new_reviewed_nodes += stats.new_reviewed_nodes || 0;
          }
          // Print table cell
          var formated = get_formated_entry(intervalData);
          row += '<td>'+ formated['entry'] +'</td>';
          weekpointcount += formated['points'];
        }
      }
      row += '</tr>';
      if( weekpointcount === 0 ) {
        continue;
      } else {
        // Flip odd row marker
        odd_row = !odd_row;
        // Add row
        $('#project_stats_history_table').append( row );
      }
    }
  }

  var update_piechart = function(data, chart_name) {
    $(chart_name).empty();
    var x = 90, y = 100, radius = 80, height = 200;
    // Create basic pie chart without any labels
    var rpie = Raphael(chart_name, '100%', height);
    var pie = rpie.piechart(x, y, radius, data.values, {
        colors: ['red', 'blue', 'green', 'yellow', 'orange', 'black', 'gray'],
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
    data.values.forEach(function(e, i, values) {
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
      // Draw label
      var text = rpie.text(l_x + 2 * circ_r + 10, l_y + circ_r,
          e.others ? "Others" : data.users[e.order])
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
  }
  
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
    for (d in data) {
      date = parseDate(data[d].date);
      name = data[d].name;
      dayIndex = Math.round((date - startDate) / msPerDay);
      if (!(name in counts)) {
        counts[name] = [];
        for (var i = 0; i < dateRange; i++) {
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
    var i = 0;
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
  }
  
  var refresh_project_statistics = function() {
    refresh_nodecount();
    refresh_history();

    // d3.json(django_url + project.id + '/stats/history', update_linegraph);
  }

  var refresh_history = function() {
    // disable the refresh button until finished
    $(".stats-history-setting").prop('disabled', true);
    requestQueue.register(django_url + project.id + '/stats/user-history', "GET", {
      "pid": project.id,
      "start_date": $("#stats-history-start-date").val(),
      "end_date": $("#stats-history-end-date").val(),
    }, function (status, text, xml) {
      $(".stats-history-setting").prop('disabled', false);
      statisticsData = null;
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            statisticsData = jso;
            update_user_history(jso, timeUnit);
          }
        }
      }
      return true;
    });
  };

  var refresh_editors = function() {
    requestQueue.register(django_url + project.id + '/stats/editor', "GET",{
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            update_piechart(jso, "piechart_editor_holder");
          }
        }
      }
      return true;
    });
  };

  var refresh_nodecount = function() {
    requestQueue.register(django_url + project.id + '/stats/nodecount', "GET", {
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            update_piechart(jso, "piechart_treenode_holder");
          }
        }
      }
      return true;
    });
  };

  var refresh_summary = function() {
    requestQueue.register(django_url + project.id + '/stats/summary', "GET", {
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            update_stats_fields(jso);
          }
        }
      }
      return true;
    });
  };

  /**
   * Recreates the summary table based on the selected time unit. It can be
   * one of "day", "week", "month" or "year".
   */
  var refresh_timeunit = function(unit) {
    timeUnit = unit;
    update_user_history(statisticsData, timeUnit)
  };

  /**
   * Initialized the statistics widget by asking the backend to create the basic
   * layout.
   */
  this.init = function () {
    $('#project_stats_widget').load(django_url + project.id + '/stats', null,
        function() {
          // Make the contribution record input fields date selectors
          $("#stats-history-start-date")
              .datepicker({ dateFormat: "yy-mm-dd", defaultDate: -10 })
              .datepicker('setDate', "-10");
          $("#stats-history-end-date")
              .datepicker({ dateFormat: "yy-mm-dd", defaultDate: 0 })
              .datepicker('setDate', "0");
          // Attach handler to history refresh button
          $("#stats-history-refresh").click(function() {
              refresh_history();
          });
          // Attach handler to time unit selector
          $("#stats-time-unit").change(function() {
            refresh_timeunit(this.options[this.selectedIndex].value);
          });

          // Updae the actual statistics
          refresh_project_statistics();
        });
  };
};
