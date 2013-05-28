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
    header += '<td>username</td>';
    for(var i = 0; i < data['days'].length; i++ ) {
      header += '<td>'+data['daysformatted'][i]+'</td>';
    }
    header += '</tr>';
    $('#project_stats_history_table').append( header );
    for(var username in data['stats_table']) {
      var row = '', weekpointcount = 0;
      row += '<tr>';
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
        $('#project_stats_history_table').append( row );
      }
    }
  }

  var update_piechart = function(data, chart_name) {
    $(chart_name).empty();
    var rpie = Raphael(chart_name, 500, 200);
    var pie = rpie.piechart(90, 100, 80, data.values, { legend: data.users, legendpos: "east", colors:['red', 'blue', 'green', 'yellow', 'orange', 'black', 'gray']});
    pie.hover(function () {
      // scale everything up
      this.sector.stop();
      this.sector.scale(1.1, 1.1, this.cx, this.cy);
      if (this.label) {
        this.label[0].stop();
        this.label[0].attr({ r: 7.5 });
        this.label[1].attr({"font-weight": 800});
      }
    }, function () {
      this.sector.animate({ transform: "s1 1 " + this.cx + " " + this.cy }, 500, "bounce");
      if (this.label) {
        this.label[0].animate({ r: 5 }, 500, "bounce");
        this.label[1].attr({"font-weight": 400});
      }
    });
  }
  
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
