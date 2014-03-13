/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ProjectStatistics = new function()
{
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
      entry += ' ' + data['new_reviewed_nodes'] + ' /';
      points += data['new_reviewed_nodes'];
    } else {
      entry += ' 0';
    };
    return {'entry': entry, 'points': points};
  }

  var update_user_history = function(data) {
    $('#project_stats_history_table').empty();
    var header = '';
    header += '<tr>';
    header += '<th>username</th>';
    for(var i = 0; i < data['days'].length; i++ ) {
      header += '<th>'+data['daysformatted'][i]+'</th>';
    }
    header += '</tr>';
    $('#project_stats_history_table').append( header );
    var odd_row = true;
    for(var username in data['stats_table']) {
      var row = '', weekpointcount = 0;
      row += '<tr class="' + (odd_row ? "odd" : "") + '">';
      if( data['stats_table'].hasOwnProperty( username ) ) {
        row += '<td>' + username + '</td>';
        for(var i = 0; i < data['days'].length; i++ ) {
          var datekey = data['days'][i],
              formated = get_formated_entry( data['stats_table'][ username ][ datekey ] );
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
        shift_y = shift_y - (i + 1) * line_height;
      }

      var color = pie.series[i].attrs.fill;
      // Draw leading color circle
      var circle = rpie.circle(l_x + circ_r, l_y + circ_r, circ_r)
          .attr({
              'stroke': color,
              'fill': color,
          });
      // Draw label
      var text = rpie.text(l_x + 2 * circ_r + 10, l_y + circ_r, data.users[i])
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
    // requestQueue.register(django_url + project.id + '/stats-summary', "GET", {
    // }, function (status, text, xml) {
    //   if (status == 200) {
    //     if (text && text != " ") {
    //       var jso = $.parseJSON(text);
    //       if (jso.error) {
    //         alert(jso.error);
    //       }
    //       else {
    //         update_stats_fields(jso);
    //       }
    //     }
    //   }
    //   return true;
    // });

    requestQueue.register(django_url + project.id + '/stats', "GET", {
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

    // requestQueue.register(django_url + project.id + '/stats-editor', "GET",{
    // }, function (status, text, xml) {
    //   if (status == 200) {
    //     if (text && text != " ") {
    //       var jso = $.parseJSON(text);
    //       if (jso.error) {
    //         alert(jso.error);
    //       } else {
    //         update_piechart(jso, "piechart_editor_holder");
    //       }
    //     }
    //   }
    //   return true;
    // });

    requestQueue.register(django_url + project.id + '/stats-reviewer', "GET", {
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            update_piechart(jso, "piechart_reviewer_holder");
          }
        }
      }
      return true;
    });

    requestQueue.register(django_url + project.id + '/stats-user-history', "POST", {
      "pid": project.id
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            update_user_history(jso);
          }
        }
      }
      return true;
    });
    
    // d3.json(django_url + project.id + '/stats-history', update_linegraph);
  }

  this.init = function () {

    $('#project_stats_widget').load( django_url + project.id + '/statisticswidget' )

    refresh_project_statistics();

  };
};
