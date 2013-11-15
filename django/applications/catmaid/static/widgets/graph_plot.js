/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var CircuitGraphPlot = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

	// SkeletonModel instances
	this.skeletons = {};
  // Skeleton IDs, each has a model in this.skeletons
  // and the order corresponds with that of the adjacency matrix.
  this.skeleton_ids = [];

	// From CircuitGraphAnalysis, first array entry is Signal Flow, rest are
	// the sorted pairs of [eigenvalue, eigenvector].
	this.vectors = null;
};

CircuitGraphPlot.prototype = {};
$.extend(CircuitGraphPlot.prototype, new InstanceRegistry());
$.extend(CircuitGraphPlot.prototype, new SkeletonSource());

CircuitGraphPlot.prototype.getName = function() {
	return "Circuit Graph Plot " + this.widgetID;
};

CircuitGraphPlot.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();
};

CircuitGraphPlot.prototype.updateModels = function(models) {
	this.append(models);
};

/** Returns a clone of all skeleton models, keyed by skeleton ID. */
CircuitGraphPlot.prototype.getSelectedSkeletonModels = function() {
	var skeletons = this.skeletons;
	return Object.keys(skeletons).reduce(function(o, skid) {
		o[skid] = skeletons[skid].clone();
		return o;
	}, {});
};

CircuitGraphPlot.prototype.getSkeletonModels = CircuitGraphPlot.prototype.getSelectedSkeletonModels;

CircuitGraphPlot.prototype.hasSkeleton = function(skeleton_id) {
  return skeleton_id in this.skeleton_ids;
};

CircuitGraphPlot.prototype.clear = function() {
	// TODO
};

CircuitGraphPlot.prototype.append = function(models) {
	// Update names and colors if present, remove when deselected
	Object.keys(this.skeletons).forEach(function(skid) {
		var model = models[skid];
		if (model) {
			if (model.selected) {
				this.skeletons[skid] = model;
			} else {
				delete this.skeletons[skid];
			}
		}
	}, this);

  Object.keys(models).forEach(function(skid) {
    if (skid in this.skeletons) return;
    var model = models[skid];
    if (model.selected) {
      this.skeletons[skid] = model.clone();
    }
  }, this);

	this.skeleton_ids = Object.keys(this.skeletons);

	// fetch connectivity data, create adjacency matrix and plot it
	requestQueue.register(django_url + project.id + '/skeletongroup/skeletonlist_confidence_compartment_subgraph', 'POST',
			{skeleton_list: this.skeleton_ids},
			(function(status, text) {
				if (200 !== status) return;
				var json = $.parseJSON(text);
				if (json.error) { alert(json.error); return; }
				// Create adjacency matrix
				var AdjM = this.skeleton_ids.map(function(skid) { return this.skeleton_ids.map(function(skid) { return 0; }); }, this);
				// Populate adjacency matrix
				var indices = this.skeleton_ids.reduce(function(o, skid, i) { o[skid] = i; return o; }, {});
				json.edges.forEach(function(edge) {
					AdjM[indices[edge[0]]][indices[edge[1]]] = edge[2];
				});
        // Update data and GUI
        this.plot(this.skeleton_ids, this.skeletons, AdjM);
			}).bind(this));
};

/** Takes an array of skeleton IDs, a map of skeleton ID vs SkeletonModel,
 * and an array of arrays representing the adjacency matrix where the order
 * in rows and columns corresponds to the order in the array of skeleton IDs.
 * Clears the existing plot and replaces it with the new data. */
CircuitGraphPlot.prototype.plot = function(skeleton_ids, models, AdjM) {
  // Set the new data
  this.skeleton_ids = skeleton_ids;
  this.skeletons = models;

  // Compute signal flow and eigenvectors
  var cga = new CircuitGraphAnalysis(AdjM);

  console.log(cga);

  // Store for replotting later
  this.vectors = [[-1, cga.z]];
  for (var i=0; i<10 && i <cga.e.length; ++i) {
    this.vectors.push(cga.e[i]);
  }

  // Reset pulldown menus
  var updateSelect = function(select) {
    select.options.length = 0;
    select.options.add(new Option('Signal Flow', 0));
    for (var i=0; i<10 && i <cga.e.length; ++i) {
      select.options.add(new Option('Eigenvalue ' + Number(cga.e[i][0]).toFixed(2), i+1));
    }
    return select;
  };
  updateSelect($('#circuit_graph_plot_X_' + this.widgetID)[0]).selectedIndex = 1;
  updateSelect($('#circuit_graph_plot_Y_' + this.widgetID)[0]).selectedIndex = 0;

  this.redraw();
};

CircuitGraphPlot.prototype.redraw = function() {
  // Data
  $('#circuit_graph_plot_X_' + this.widgetID)[0]

  var containerID = '#circuit_graph_plot_div' + this.widgetID;

  // Clear existing plot if any
  $(containerID).empty();

  // Recreate plot
  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = 960 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

  var svg = d3.select(containerID).append("svg")
    .attr("id", "circuit_graph_plot" + this.widgetID)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

  var xSelect = $('#circuit_graph_plot_X_' + this.widgetID)[0],
      ySelect = $('#circuit_graph_plot_Y_' + this.widgetID)[0];

  var xVector = this.vectors[xSelect.selectedIndex][1],
      yVector = this.vectors[ySelect.selectedIndex][1];

  // Package data
  var data = this.skeleton_ids.map(function(skid, i) {
    var model = this.skeletons[skid];
    return {skid: skid,
            name: model.baseName,
            hex: '#' + model.color.getHexString(),
            x: xVector[i],
            y: yVector[i]};
  }, this);

  // Define the ranges of the axes
  var xR = d3.scale.linear().domain(d3.extent(xVector)).nice().range([0, width]);
  var yR = d3.scale.linear().domain(d3.extent(yVector)).nice().range([height, 0]);

  // Define the data domains/axes
  var xAxis = d3.svg.axis().scale(xR)
                           .orient("bottom")
                           .ticks(10);
  var yAxis = d3.svg.axis().scale(yR)
                           .orient("left")
                           .ticks(10);
                           //.tickFormat(d3.format("r")); // "r" means rounded, see https://github.com/mbostock/d3/wiki/Formatting#wiki-d3_format

  // Insert the data
  var state = svg.selectAll(".state").data(data)
    .enter().append('circle')
      .attr('class', 'dot')
      .attr('r', 3)
      .attr('cx', function(d) { return xR(d.x); })
      .attr('cy', function(d) { return yR(d.y); })
      .style('fill', function(d) { return d.hex; })
      .style('stroke', 'grey')
      .append('text').text(function(d) { return d.name; })
      .attr('dx', function(d) { return 5; })
      .attr('dy', function(d) { return 0; })
      .on('click', function(d) { alert('clicked: ' + d); });

  // Insert the graphics for the axes (after the data, so that they draw on top)
  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis)
    .append("text")
      .attr("x", width)
      .attr("y", -6)
      .style("text-anchor", "end")
      .text(xSelect.options[xSelect.selectedIndex].text);

  svg.append("g")
      .attr("class", "y axis")
      .call(yAxis)
    .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text(ySelect.options[ySelect.selectedIndex].text);

};

CircuitGraphPlot.prototype.resize = function() {
  // TODO
};

CircuitGraphPlot.prototype.update = function() {
  this.append(this.skeletons);
};

CircuitGraphPlot.prototype.highlight = function() {
  // TODO
};
