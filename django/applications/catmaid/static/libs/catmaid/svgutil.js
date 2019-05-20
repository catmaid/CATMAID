/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
  */

(function(CATMAID) {

  var SVGUtil = {};

  /** Insert a pie chart into the div.
   * title (optional): the text to place on top.
   * entries: an array of key/value maps. Order matters. Like:
   * [{name: "Apples", value: 10},
   *  {name: "Pears", value: 15},
   *  {name: "Oranges", value: 3}].
   */
  SVGUtil.insertPieChart = function(divID, radius, entries, title) {
      var extra = title ? 30 : 0;
    var arc = d3.svg.arc()
      .outerRadius(radius - 10)
      .innerRadius(0);
    var pie = d3.layout.pie()
      .sort(null)
      .value(function(d) { return d.value; });
    var svg = d3.select(divID).append("svg")
      .attr("width", radius * 2)
      .attr("height", radius * 2 + extra)
      .append("g")
      .attr("transform", "translate(" + radius + "," + (radius + extra) + ")");
    svg.selectAll(".arc")
      .data(pie(entries))
      .enter()
      .append("g")
      .attr("class", "arc")
      .append("path")
      .attr("d", arc)
      .style("fill", function(d) { return d.data.color; });
    // Prevent arcs from clipping text labels by creating new 'g' elements for each label
    svg.selectAll(".arc-label")
      .data(pie(entries))
      .enter()
      .append("g")
      .attr("class", "arc-label")
      .append("text")
      .attr("transform", function(d) { return "translate(" + arc.centroid(d) + ")"; })
      .attr("dy", ".35em")
      .style("text-anchor", "middle")
      .text(function(d) { return d.data.name; });
      if (title) {
          svg.append("text")
              .attr("x", 0)
              .attr("y", -radius)
              .style("text-anchor", "middle")
              .style("font-size", "16px")
              .style("text-decoration", "underline")
              .text(title);
      }

    return svg;
  };

  /** names: an array of names.
   *  data: an array of arrays of {series: <name>, count: <number>}.
   *  colors: an array of hex strings. */
  SVGUtil.insertMultipleBarChart = function(
          container, id,
          cwidth, cheight,
          x_label, y_label,
          names, nameMap, data,
          colors, x_axis_labels) {
      // The SVG element representing the plot
      var margin = {top: 20, right: 20, bottom: 30, left: 40},
              width = cwidth - margin.left - margin.right,
              height = cheight - margin.top - margin.bottom;

      var svg = d3.select(container).append("svg")
              .attr("id", id) // already has widgetID in it
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom)
              .append("g")
              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      // Define the data domains/axes
      var x0 = d3.scale.ordinal().rangeRoundBands([0, width], 0.1);
      var x1 = d3.scale.ordinal();
      var y = d3.scale.linear().range([height, 0]);
      var xAxis = d3.svg.axis().scale(x0)
                                                       .orient("bottom");
      // "d" means integer, see
      // https://github.com/mbostock/d3/wiki/Formatting#wiki-d3_format
      var yAxis = d3.svg.axis().scale(y)
                                                       .orient("left")
                                                       .tickFormat(d3.format("d"));

      // Define the ranges of the axes
      // x0: For the counts
      x0.domain(x_axis_labels);
      // x1: For the indices of the series within count bin
      x1.domain(names).rangeRoundBands([0, x0.rangeBand()]);
      // y: up to the maximum bin count
      var max_count = data.reduce(function(c, block) {
          return block.reduce(function(c, d) {
              return Math.max(c, d.count);
          }, c);
      }, 0);
      y.domain([0, max_count]);

      // Color for the bar chart bars
      var color = d3.scale.ordinal().range(colors);

      // Insert the data
      var state = svg.selectAll(".state")
              .data(data)
          .enter().append('g')
              .attr('class', 'g')
              // x0(i+1) has d +1 because the array is 0-based
              .attr('transform', function(d, i) { return "translate(" + x0(i+1) + ", 0)"; });

      // Define how each bar of the bar chart is drawn
      state.selectAll("rect")
              .data(function(block) { return block; })
          .enter().append("rect")
              .attr("width", x1.rangeBand())
              .attr("x", function(d) { return x1(nameMap[d.series.id]); })
              .attr("y", function(d) { return y(d.count); })
              .attr("height", function(d) { return height - y(d.count); })
              .style("fill", function(d, i) { return colors[i]; /*color(d.series);*/ });

      // Insert the graphics for the axes (after the data, so that they draw on top)
      var callx = svg.append("g")
              .attr("class", "x axis")
              .attr("transform", "translate(0," + height + ")")
              .call(xAxis);

    SVGUtil.setAxisProperties(callx);

    callx.append("text")
              .attr("x", width)
              .attr("y", -6)
              .style("text-anchor", "end")
              .text(x_label);

      var cally = svg.append("g")
              .attr("class", "y axis")
              .call(yAxis);

    SVGUtil.setAxisProperties(cally);

    cally.append("text")
              .attr("transform", "rotate(-90)")
              .attr("y", 6)
              .attr("dy", ".71em")
              .style("text-anchor", "end")
              .text(y_label);

      // The legend: which series is which
      var legend = svg.selectAll(".legend")
              .data(names)
          .enter().append("g")
              .attr("class", "legend")
              .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

      legend.append("rect")
              .attr("x", width - 18)
              .attr("width", 18)
              .attr("height", 18)
              .style("fill", color);

      legend.append("text")
              .attr("x", width - 24)
              .attr("y", 9)
              .attr("dy", ".35em")
              .style("text-anchor", "end")
              .text(function(d) { return d; });
  };

  /** Fix export formatting issues by explicitly defining SVG properties. */
  SVGUtil.setAxisProperties = function(c) {
      c.selectAll("path")
          .attr("fill", "none")
          .attr("stroke", "black")
          .attr("stroke-width", "1");
      c.selectAll("line")
          .attr("fill", "none")
          .attr("stroke", "black")
          .attr("stroke-width", "1");
  };

  /** As many names|colors|x_axis_labels as data. */
  SVGUtil.insertMultipleBarChart2 = function(
      container, id,
      cwidth, cheight,
      x_label, y_label,
      data,
      names, colors,
      x_axis_labels, rotate_x_axis_labels,
      show_legend) {

    var n = data.length,
        layers = data.map(function(series, i) {
          return Object.keys(series).map(function(key, k) {
            return {x: k, y: series[key]};
          });
        }),
        m = layers[0].length,
        yGroupMax = d3.max(layers, function(layer) { return d3.max(layer, function(d) { return d.y; }); });

    var margin = {top: 20, right: 20, bottom: 50, left: 40},
        width = cwidth - margin.left - margin.right,
        height = cheight - margin.top - margin.bottom;

    var x = d3.scale.ordinal()
      .domain(d3.range(m))
      .rangeRoundBands([0, width], 0.08);

    var y = d3.scale.linear()
      .domain([0, yGroupMax])
      .range([height, 0]);

    var xAxis = d3.svg.axis()
      .scale(x)
      .tickFormat(function(d, i) { return x_axis_labels[i]; })
      .orient("bottom");

    var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left")
      .tickFormat(d3.format("d"));

    var svg = d3.select(container).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var layer = svg.selectAll(".layer")
        .data(layers)
      .enter().append("g")
        .attr("class", "layer")
        .style("fill", function(d, i) { return colors[i]; });

    var rect = layer.selectAll("rect")
        .data(function(series) { return series; })
      .enter().append("rect")
        .attr("x", function(d, i, j) { return x(d.x) + x.rangeBand() / n * j; })
        .attr("width", x.rangeBand() / n)
        .attr("y", function(d) { return y(d.y); })
        .attr("height", function(d) { return height - y(d.y); });

    // Insert the graphics for the axes (after the data, so that they draw on top)
    var callx = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    if (rotate_x_axis_labels) {
      callx.selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", function(d) { return "rotate(-65)"; });
    }

      SVGUtil.setAxisProperties(callx);

    // Append after having transformed the tick labels
    callx.append("text")
        .attr("x", width)
        .attr("y", -6)
        .style("text-anchor", "end")
        .text(x_label);

    var cally = svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

      SVGUtil.setAxisProperties(cally);

    cally.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(y_label);

    // The legend: which series is which
      if (show_legend) {
          var legend = svg.selectAll(".legend")
                  .data(names)
              .enter().append("g")
                  .attr("class", "legend")
                  .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

          legend.append("rect")
                  .attr("x", width - 18)
                  .attr("width", 18)
                  .attr("height", 18)
                  .style("fill", function(d, i) { return colors[i]; });

          legend.append("text")
                  .attr("x", width - 24)
                  .attr("y", 9)
                  .attr("dy", ".35em")
                  .style("text-anchor", "end")
                  .text(function(d) { return d; });
      }
  };

  /** entries: array of {x: 10, y: 20, color: "#123456", name: "aha"} where "name" is optional--signal so by making with_names true.
   * onclick: a function that gets a single entry as argument, called when a circle is clicked.
   * series: an array of {name: "neuron name", color: "#123456"} to show as legend. */
  SVGUtil.insertXYScatterPlot = function(
      container, id,
      width, height,
      xTitle, yTitle,
      entries,
      onclick,
      series,
      with_names, with_tooltip_text) {

    var margin = {top: 20, right: 200, bottom: 50, left: 50},
        width = width - margin.left - margin.right,
        height = height - margin.top - margin.bottom;

    var extract = function(key) {
      return function(e) { return e[key]; };
    };
    var xR = d3.scale.linear()
      .domain(d3.extent(entries.map(extract('x'))))
      .nice()
      .range([0, width]);
    var yR = d3.scale.linear()
      .domain(d3.extent(entries.map(extract('y'))))
      .nice()
      .range([height, 0]);
    var xAxis = d3.svg.axis()
      .scale(xR)
      .orient("bottom")
      .ticks(10);
    var yAxis = d3.svg.axis()
      .scale(yR)
      .orient("left")
      .ticks(10);

    var svg = d3.select(container).append("svg")
        .attr("id", id)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

    // Add an invisible layer to enable triggering zoom from anywhere, and panning
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("opacity", "0");

    // Function that maps from data domain to plot coordinates
    var transform = function(d) {
      return "translate(" + xR(d.x) + "," + yR(d.y) + ")";
    };

    var elems = svg.selectAll(".state")
      .data(entries).enter()
      .append('g')
      .attr('transform', transform);

    var zoomed = function() {
      // Prevent panning beyond limits
      var translate = zoom.translate(),
          scale = zoom.scale(),
          tx = Math.min(0, Math.max(width * (1 - scale), translate[0])),
          ty = Math.min(0, Math.max(height * (1 - scale), translate[1]));

      zoom.translate([tx, ty]);

      // Scale as well the axes
      svg.select(".x.axis").call(xAxis);
      svg.select(".y.axis").call(yAxis);

      elems.attr('transform', transform);
    };

    var zoom = d3.behavior.zoom().x(xR).y(yR).scaleExtent([1, 100]).on("zoom", zoomed);
    // Assign the zooming behavior to the encapsulating root group
    svg.call(zoom);

    elems.append('circle')
      .attr('class', 'dot')
      .attr('r', '3')
      .style('fill', function(d) { return d.color; })
      .style('stroke', 'grey');

    if (onclick) elems.on('click', function(d) { if (onclick) onclick(d); });

    if (with_names) {
      elems.append('text')
        .text(function(d) { return d.name; })
        .attr('id', 'name')
        .attr('dx', '5');
    }
    if (with_tooltip_text) {
       elems.append('svg:title')
       .text(function(d) { return d.name; });
    }

    // Insert the graphics for the axes (after the data, so that they draw on top)
    var xg = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(xAxis);
    xg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    xg.append("text")
        .attr("x", width)
        .attr("y", -6)
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .style("text-anchor", "end")
        .text(xTitle);

    var yg = svg.append("g")
        .attr("class", "y axis")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(yAxis);
    yg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    yg.append("text")
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("transform", "rotate(-90)")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(yTitle);

    // The legend: which series is which
    var legend = svg.selectAll(".legend")
        .data(series)
      .enter().append("g")
        .attr("class", "legend")
        .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

    legend.append("rect")
        .attr("x", width + 10)
        .attr("width", 18)
        .attr("height", 18)
        .style("fill", function(d) { return d.color; });

    legend.append("text")
        .attr("x", width + 34)
        .attr("y", 9)
        .attr("dy", ".35em")
        .style("text-anchor", "left")
        .text(function(d) { return d.name; });
  };

  /**
   * Simplify style representations of a SVG element. All style tags are replaced
   * by classes, which refer to the same style properties. An object containing
   * the styles as keys and the class names as values is returned.
   */
  SVGUtil.classifyStyles = function(svg, precision, attrsToRemove)
  {
    var styleCount = 0;
    var foundStyles = {};

    // Iterate all elements that have a style attribute
    SVGUtil.map(svg, function(node) {
      if (node.nodeType !== 1 || !node.hasAttribute("style")) {
        return;
      }

      // Replace style with class
      var style = node.getAttribute('style');
      node.removeAttribute('style');
      var cls = foundStyles[style];
      if (!cls) {
        styleCount++;
        cls = "style" + styleCount;
        foundStyles[style] = cls;
      }
      var existingClasses = node.getAttribute('class');
      if (existingClasses) {
        cls = existingClasses + " " + cls;
      }
      node.setAttribute('class', cls);
    });

    return foundStyles;
  };

  /**
   * Reduce the precision of the 'stroke-width' style property to the number of
   * given decimals.
   */
  SVGUtil.reduceStylePrecision = function(svg, precision)
  {
    /**
     * Change the precision of a style property of a given object.
     */
    function changePrecision(e, a, d) {
      var w = $(e).css(a);
      if (w.length > 0) {
        $(e).css(a, parseFloat(w).toFixed(d));
      }
    }

    /**
     * Create a function to update the precision of the stroke-width style
     * property of an element, if this is requested.
     */
    var updatePrecision = (function(p) {
      if (p) {
        return function(e) {
          changePrecision(e, 'stroke-width', p);
        };
      } else {
        return function() {};
      }
    })(precision);

    // Iterate all elements that have a style attribute
    SVGUtil.map(svg, function(node) {
      if (node.nodeType !== 1 || !node.hasAttribute("style")) {
        return;
      }

      // Update precision
      updatePrecision(node);
    });

    return svg;
  };

  /**
   * All attributes in the 'properties' list will be discarded from the parsed
   * styles.
   */
  SVGUtil.stripStyleProperties = function(svg, properties)
  {
    if (properties !== undefined) {
      /**
       * Remove a style property from the context object.
       */
      var removeStyleProperty = function(e, p, val) {
        // Don't check the type for the value comparison, because it is probably
        // more robust (here!).
        if (val === undefined || $(e).css(p) == val) {
          $(e).css(p, "");
        }
      };

      /**
       * Remove all unwanted styles from an element.
       */
      var removeStylesToDiscard = (function(props) {
        return function(e) {
          for (var p in props) {
            removeStyleProperty(e, p, props[p]);
          }
        };
      })(properties);

      // Iterate all elements that have a style attribute
      SVGUtil.map(svg, function(node) {
        if (node.nodeType !== 1 || node.hasAttribute("style")) {
          return;
        }

        // Discard unwanted styles
        removeStylesToDiscard(node);
      });
    }

    return svg;
  };

  /**
   * Reduce the precision of coordinates used in the given SVG to the number of
   * decimal digits requested. Currently, only the precision of lines is reduced.
   */
  SVGUtil.reduceCoordinatePrecision = function(svg, digits)
  {
    /**
     * Create a function to read attribute 'attr' of element 'e' and change its
     * precision
     */
    var reducePrecision = (function(nDigits) {
      return function (e, attr) {
        e.setAttribute(attr, parseFloat(e.getAttribute(attr)).toFixed(nDigits));
      };
    })(digits);

    // Change precision of lines
    SVGUtil.map(svg, function(node) {
      if (node.nodeType !== 1 || node.nodeName !== "line") {
        return;
      }

      reducePrecision(node, 'x1');
      reducePrecision(node, 'y1');
      reducePrecision(node, 'x2');
      reducePrecision(node, 'y2');
    });

    return svg;
  };

  /**
   * Execute a function on every element of the given SVG.
   */
  SVGUtil.map = function(root, fn)
  {
    for (var node = root; node; ) {
      // Call mapped function in context of node
      fn(node);

      // Find next
      var next = null;
      // Depth first iteration
      if (node.hasChildNodes()) {
        next = node.firstChild;
      } else {
        while (!(next = node.nextSibling)) {
          node = node.parentNode;
          if (!node) {
            break;
          }
          if (root == node) {
            break;
          }
        }
      }
      node = next;
    }
  };

  /**
   * Adds a CDATA section to the given XML document that contains the given
   * styles. The XML document is *not* a regular SVG DOM element, but one that can
   * be created from such an element as following:
   *
   * var xml = $.parseXML(new XMLSerializer().serializeToString(svg));
   */
  SVGUtil.addStyles = function(xml, styles)
  {
    // Create style tag with same namesapce as input XML.
    var styleTag = xml.createElementNS(xml.firstChild.namespaceURI, 'style');
    styleTag.setAttribute('type', 'text/css');

    // Prepend CSS embedded in CDATA section.
    styleTag.appendChild(xml.createCDATASection(styles));

    // Add style tag to SVG node in XML document (first child if there are
    // elements already)
    if (0 === xml.firstChild.childElementCount) {
      xml.firstChild.appendChild(styleTag);
    } else {
      xml.firstChild.insertBefore(styleTag, xml.firstChild.firstChild);
    }
    return xml;
  };

  /**
   * Save a DIV element with the given ID to the given filename.
   */
  SVGUtil.saveDivSVG = function(divID, filename) {
    var div = document.getElementById(divID);
    if (!div) return;
    var svg = div.getElementsByTagName('svg');
    if (svg && svg.length > 0) {
      var xml = new XMLSerializer().serializeToString(svg[0]);
      var blob = new Blob([xml], {type : 'text/xml'});
      saveAs(blob, filename);
    }
  };

  /**
   * @param lines An array of objects, each with a name field, a color field, and an xy zipped x,y array of objects with x,y values. like:
   *
   * lines = [{name: "The name",
   *           color: "#FF0000",
   *           xy: [{x: 0, y: 5}, {x: 1, y: 10}, ...]},
   *          ...,
   *          ...];
   */
  SVGUtil.insertMultiLinePlot = function(container, containerID, plot_id, lines, x_label, y_label) {

    // Dimensions and padding
    var margin = {top: 20, right: 20, bottom: 30, left: 40},
        width = container.width() - margin.left - margin.right,
        height = container.height() - margin.top - margin.bottom;

    // Define the ranges of the axes
    var xMin = Number.MAX_VALUE,
        xMax = 0,
        yMin = Number.MAX_VALUE,
        yMax = 0;
    lines.forEach(function(line) {
      line.xy.forEach(function(point) {
        xMin = Math.min(xMin, point.x);
        xMax = Math.max(xMax, point.x);
        yMin = Math.min(yMin, point.y);
        yMax = Math.max(yMax, point.y);
      });
    });

    var xR = d3.scale.linear().domain(d3.extent([xMin, xMax])).nice().range([0, width]);
    var yR = d3.scale.linear().domain(d3.extent([yMin, yMax])).nice().range([height, 0]);

    // Define the data domains/axes
    var xAxis = d3.svg.axis().scale(xR)
                             .orient("bottom");
    var yAxis = d3.svg.axis().scale(yR)
                             .orient("left");

    var svg = d3.select(containerID).append("svg")
        .attr("id", plot_id)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

    // Add an invisible layer to enable triggering zoom from anywhere, and panning
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("opacity", "0");

    // Create a line function
    var line = d3.svg.line()
        .interpolate("basis")
        .x(function(d) { return xR(d.x); })
        .y(function(d) { return yR(d.y); });

    // Create a 'g' group for each line
    var elems = svg.selectAll(".state").data(lines).enter()
      .append("g")
      .append("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("d", function(d) { return line(d.xy); })
      .style("stroke", function(d) { return d.color; })
      .style("stroke-width", function(d) { return d.stroke_width; });

    // Insert the graphics for the axes (after the data, so that they draw on top)
    var xg = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(xAxis);
    xg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    xg.append("text")
        .attr("x", width)
        .attr("y", -6)
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .style("text-anchor", "end")
        .text(x_label);

    var yg = svg.append("g")
        .attr("class", "y axis")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(yAxis);
    yg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    yg.append("text")
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("transform", "rotate(-90)")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(y_label);

    return svg;
  };

  // Export SVG utility functions in CATMAID.svgutil sub-namespace
  CATMAID.svgutil = SVGUtil;

})(CATMAID);
