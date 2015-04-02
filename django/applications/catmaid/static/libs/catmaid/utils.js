/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  Arbor,
  CATMAID,
  growlAlert,
  project,
  requestQueue
  */

"use strict";

var InstanceRegistry = function() {
  this.instances = {};
};

InstanceRegistry.prototype = {};

/** Return an array of open instances, sorted from oldest to newest. */
InstanceRegistry.prototype.getInstances = function() {
	return Object.keys(this.instances).map(function(key) {
		return [Number(key), this.instances[key]];
	}, this).sort(function(a, b) {
		return a[0] > b[0];
	}).map(function(a) { return a[1]; });
};

InstanceRegistry.prototype.noInstances = function() {
	return 0 === this.getInstances().length;
};

InstanceRegistry.prototype.registerInstance = function() {
  var pids = Object.keys(this.instances).map(Number);
  if (0 === pids.length) {
    this.instances[1] = this;
    return 1;
  }

  // Find lowest unused number
  var max = Math.max.apply(Math, pids.map(Number)),
      pid = max + 1;
  for (var i = 0; i < max; ++i) {
    if (typeof(pids[i]) === 'undefined') {
      pid = i;
      break;
    }
  }
  this.instances[pid] = this;
  return pid;
};

InstanceRegistry.prototype.unregisterInstance = function() {
  delete this.instances[this.widgetID];
};

InstanceRegistry.prototype.getFirstInstance = function() {
	var keys = Object.keys(this.instances);
	if (0 === keys.length) return null;
	return this.instances[Math.min.apply(Math, keys.map(Number))];
};

InstanceRegistry.prototype.getLastInstance = function() {
	var a = this.getInstances();
	return a[a.length-1];
};


/**
 * The annotation cache provides annotation names and their IDs.
 */
var AnnotationCache = function() {
  // Map of annotation name vs its ID and vice versa
  this.annotation_ids = {};
  this.annotation_names = {};
};

AnnotationCache.prototype.getName = function(id) {
  return this.annotation_names[id];
};

AnnotationCache.prototype.getAllNames = function() {
  return Object.keys(this.annotation_ids);
};

AnnotationCache.prototype.getID = function(name) {
  return this.annotation_ids[name];
};

AnnotationCache.prototype.getAllIDs = function() {
  return Object.keys(this.annotation_names);
};

AnnotationCache.prototype.update = function(callback) {
  requestQueue.register(django_url + project.id + '/annotations/list',
      'POST', {}, (function (status, data, text) {
        var e = $.parseJSON(data);
        if (status !== 200) {
            alert("The server returned an unexpected status (" +
              status + ") " + "with error message:\n" + text);
        } else {
          if (e.error) {
            new CATMAID.ErrorDialog(e.error, e.detail).show();
          } else {
            // Empty cache
            this.annotation_ids = {};
            this.annotation_names = {};
            // Populate cache
            e.annotations.forEach((function(a) {
             this.annotation_ids[a.name] = a.id;
             this.annotation_names[a.id] = a.name;
            }).bind(this));
            // Call back, if requested
            if (callback) {
              callback();
            }
          }
        }
      }).bind(this));
};

/**
 * Adds new annotations from the given list to the cache. The list should
 * contain objects, each with an 'id' and a 'name' field.
 */
AnnotationCache.prototype.push = function(annotationList) {
  annotationList.forEach(function(a) {
    var known_id = this.annotation_ids.hasOwnProperty(a.name) === -1;
    var known_name = this.annotation_names.hasOwnProperty(a.id) === -1;
    if (!known_id && !known_name) {
      // Add annotation if it isn't already contained in the list.
      this.annotation_ids[a.name] = a.id;
      this.annotation_names[a.id] = a.name;
    } else if (known_id && known_name) {
      // Nothing to do, if the annotation is already known.
    } else {
      // If only the ID or the name is known, something is odd.
      throw "Annotation already known with different id/name";
    }
  }, this);
};

var annotations = new AnnotationCache();


/**
 * This a convience constructor to make it very easy to use the neuron name
 * service.
 */
var NameServiceClient = function()
{

};


/** Adds ability to pick colors almost randomly, keeping state. */
var Colorizer = function() {};

Colorizer.prototype = {};

Colorizer.prototype.COLORS = [[1, 1, 0], // yellow
                              [1, 0, 1], // magenta
                              [0, 0, 1], // blue
                              [0, 1, 0], // green
                              [1, 1, 1], // white
                              [0, 1, 1], // cyan
                              [1, 0.5, 0], // orange
                              [0.5, 1, 0], // light green
                              [0.5, 0.5, 0.5], // grey
                              [0, 1, 0.5], // pale green
                              [1, 0, 0], // red
                              [0.5, 0.5, 1], // light blue
                              [0.75, 0.75, 0.75], // silver
                              [1, 0.5, 0.5], // pinkish
                              [0.5, 1, 0.5], // light cyan
                              [1, 0, 0.5], // purplish
                              [0.5, 0, 0], // maroon
                              [0.5, 0, 0.5], // purple
                              [0, 0, 0.5], // navy blue
                              [1, 0.38, 0.28], // tomato
                              [0.85, 0.64, 0.12], // gold
                              [0.25, 0.88, 0.82], // turquoise
                              [1, 0.75, 0.79]]; // pink


Colorizer.prototype.pickColor = function() {
	if (undefined === this.next_color_index) this.next_color_index = 0;

  var c = this.COLORS[this.next_color_index % this.COLORS.length];
  var color = new THREE.Color().setRGB(c[0], c[1], c[2]);
  if (this.next_color_index < this.COLORS.length) {
    this.next_color_index += 1;
    return color;
  }
  // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
  var hsl = color.getHSL();
  color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
               Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
               hsl.l);
  this.next_color_index += 1;
  return color;
};

/** Parse into a THREE.Color the color object returned from a Raphael color wheel. */
var parseColorWheel = function(color) {
  return new THREE.Color().setRGB(parseInt(color.r) / 255.0,
                                  parseInt(color.g) / 255.0,
                                  parseInt(color.b) / 255.0);
};

/** Load each skeleton from the skeleton_ids array one by one, invoking the fnLoadedOne
 * with the ID and the corresponding JSON.
 * If some skeletons fail to load (despite existing), the fnFailedLoading will be invoked with the ID.
 * Finally when all are loaded, fnDone is invoked without arguments.
 * Note that fnDone is invoked even when the given skeleton_ids array is empty.
 *
 * Additionally, when done if any skeletons don't exist anymore, a dialog will ask to remove them from all widgets that are skeleton sources.*/
var fetchSkeletons = function(skeleton_ids, fnMakeURL, fnPost, fnLoadedOne, fnFailedLoading, fnDone) {
  var i = 0,
      missing = [],
      unloadable = [],
      fnMissing = function() {
        if (missing.length > 0 && confirm("Skeletons " + missing.join(', ') + " do not exist. Remove them from selections?")) {
          CATMAID.skeletonListSources.removeSkeletons(missing);
        }
        if (unloadable.length > 0) {
          alert("Could not load skeletons: " + unloadable.join(', '));
        }
      },
      finish = function() {
        $.unblockUI();
        fnMissing();
      },
      loadOne = function(skeleton_id) {
        requestQueue.register(fnMakeURL(skeleton_id), 'POST', fnPost(skeleton_id),
            function(status, text) {
              try {
                if (200 === status) {
                  var json = $.parseJSON(text);
                  if (json.error) {
                    if (0 === json.error.indexOf("Skeleton #" + skeleton_id + " doesn't exist")) {
                      missing.push(skeleton_id);
                    } else {
                      unloadable.push(skeleton_id);
                    }
                    fnFailedLoading(skeleton_id);
                  } else {
                    fnLoadedOne(skeleton_id, json);
                  }
                } else {
                  unloadable.push(skeleton_id);
                  fnFailedLoading(skeleton_id);
                }
                // Next iteration
                i += 1;
                $('#counting-loaded-skeletons').text(i + " / " + skeleton_ids.length);
                if (i < skeleton_ids.length) {
                  loadOne(skeleton_ids[i]);
                } else {
                  finish();
                  fnDone();
                }
              } catch (e) {
                finish();
                console.log(e, e.stack);
                growlAlert("ERROR", "Problem loading skeleton " + skeleton_id);
              }
            });
      };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS + 'images/busy.gif" /> <h2>Loading skeletons <div id="counting-loaded-skeletons">0 / ' + skeleton_ids.length + '</div></h2>'});
  }
  if (skeleton_ids.length > 0) {
    loadOne(skeleton_ids[0]);
  } else {
    fnDone();
  }
};

var saveDivSVG = function(divID, filename) {
  var div = document.getElementById(divID);
  if (!div) return; 
  var svg = div.getElementsByTagName('svg');
  if (svg && svg.length > 0) {
    var xml = new XMLSerializer().serializeToString(svg[0]);
    var blob = new Blob([xml], {type : 'text/xml'});
    saveAs(blob, filename);
  }
};

/** Parse JSON data from compact-skeleton and compact-arbor into an object
 * that contains an Arbor instance and a number of measurements related
 * to synapses and synaptic partners. */
var ArborParser = function() {
    this.arbor = null;
    this.inputs = null;
    this.outputs = null;
    this.n_inputs = null;
    // Number of post targets of pre connectors
    this.n_outputs = null;
    // Number of pre connectors
    this.n_presynaptic_sites = null;
    this.input_partners = null;
    this.output_partners = null;
};

ArborParser.prototype = {};

ArborParser.prototype.init = function(url, json) {
    this.tree(json[0]);
    switch (url) {
        case 'compact-skeleton':
            this.connectors(json[1]);
            break;
        case 'compact-arbor':
            this.synapses(json[1]);
            break;
    }
    return this;
};

ArborParser.prototype.tree = function(rows) {
  var arbor = new Arbor(),
      positions = {};
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        node = row[0],
        paren = row[1];
    if (paren) arbor.edges[node] = paren;
    else arbor.root = node;
    positions[node] = new THREE.Vector3(row[3], row[4], row[5]);
  }

  this.arbor = arbor;
  this.positions = positions;
  return this;
};

/** Parse connectors from compact-skeleton.
 */
ArborParser.prototype.connectors = function(rows) {
  var io = [{count: 0},
            {count: 0}];
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        t = io[row[2]], // 2: type: 0 for pre, 1 for post
        node = row[0], // 0: ID
        count = t[node];
    if (count) t[node] = count + 1;
    else t[node] = 1;
    t.count += 1;
  }
  this.n_presynaptic_sites = io[0].count;
  this.n_inputs = io[1].count;
  delete io[0].count;
  delete io[1].count;
  this.outputs = io[0];
  this.inputs = io[1];
  return this;
};

/** Parse connectors from compact-arbor.
 */
ArborParser.prototype.synapses = function(rows) {
  var io = [{partners: {},
             count: 0,
             connectors: {}},
            {partners: {},
             count: 0,
             connectors: {}}];
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        t = io[row[6]], // 6: 0 for pre, 1 for post
        node = row[0], // 0: treenode ID
        count = t[node];
    if (count) t[node] = count + 1;
    else t[node] = 1;
    t.count += 1;
    t.partners[row[5]] = true;
    t.connectors[row[2]] = true; // 2: connector ID
  }
  this.n_outputs = io[0].count;
  this.n_inputs = io[1].count;
  this.output_partners = io[0].partners;
  this.input_partners = io[1].partners;
  this.n_output_connectors = Object.keys(io[0].connectors).length;
  this.n_input_connectors = Object.keys(io[1].connectors).length;
  ['count', 'partners', 'connectors'].forEach(function(key) {
      delete io[0][key];
      delete io[1][key];
  });
  this.outputs = io[0];
  this.inputs = io[1];
  return this;
};

/** Depends on having called this.synapses before to populate the maps. */
ArborParser.prototype.createSynapseMap = function() {
  var outputs = this.outputs;
  return Object.keys(this.outputs).reduce(function(m, node) {
    var no = outputs[node],
        ni = m[node];
    if (ni) m[node] = ni + no;
      else m[node] = no;
      return m;
  }, $.extend({}, this.inputs));
};

/** Replace in this.arbor the functions defined in the fnNames array by a function
 * that returns a cached version of their corresponding return values.
 * Order matters: later functions in the fnNames array will already be using
 * cached versions of earlier ones.
 * Functions will be invoked without arguments. */
ArborParser.prototype.cache = function(fnNames) {
    if (!this.arbor.__cache__) this.arbor.__cache__ = {};
    fnNames.forEach(function(fnName) {
        this.__cache__[fnName] = Arbor.prototype[fnName].bind(this)();
        this[fnName] = new Function("return this.__cache__." + fnName);
    }, this.arbor);
};

/** Will find terminal branches whose end node is tagged with "not a branch"
 * and remove them from the arbor, transferring any synapses to the branch node.
 * tags: a map of tag name vs array of nodes with that tag, as retrieved by compact-arbor or compact-skeleton.
 * Assumes that this.arbor, this.inputs and this.outputs exist. */
ArborParser.prototype.collapseArtifactualBranches = function(tags) {
    var notabranch = tags['not a branch'];
    if (undefined === notabranch) return;
    var be = this.arbor.findBranchAndEndNodes(),
        ends = be.ends,
        branches = be.branches,
        edges = this.arbor.edges,
        tagged = {};
    for (var i=0; i<notabranch.length; ++i) {
        tagged[notabranch[i]] = true;
    }
    for (var i=0; i<ends.length; ++i) {
        var node = ends[i];
        if (tagged[node]) {
            var n_inputs = 0,
                n_outputs = 0;
            while (node && !branches[node]) {
                var nI = this.inputs[node],
                    nO = this.outputs[node];
                if (nI) {
                    n_inputs += nI;
                    delete this.inputs[node];
                }
                if (nO) {
                    n_outputs += nO;
                    delete this.outputs[node];
                }
                // Continue to parent
                var paren = edges[node];
                delete edges[node];
                node = paren;
            }
            // node is now the branch node, or null for a neuron without branches
            if (!node) node = this.arbor.root;
            if (n_inputs > 0) this.inputs[node] = n_inputs;
            if (n_outputs > 0) this.outputs[node] = n_outputs;
        }
    }
};


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
		names, data,
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
			.attr("x", function(d) { return x1(d.series); })
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
  // Prepend CSS embedded in CDATA section
  var styleTag = xml.createElement('style');
  styleTag.setAttribute('type', 'text/css');
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
