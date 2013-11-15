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

  this.names_visible = true;

  // Skeleton ID vs true
  this.selected = {};
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
  
  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

CircuitGraphPlot.prototype.updateModels = function(models) {
	this.append(models);
};

/** Returns a clone of all skeleton models, keyed by skeleton ID. */
CircuitGraphPlot.prototype.getSelectedSkeletonModels = function() {
  if (!this.svg) return {};
	var skeletons = this.skeletons;
	return Object.keys(this.selected).reduce(function(o, skid) {
		o[skid] = skeletons[skid].clone();
		return o;
	}, {});
};

CircuitGraphPlot.prototype.getSkeletonModels = CircuitGraphPlot.prototype.getSelectedSkeletonModels;

CircuitGraphPlot.prototype.hasSkeleton = function(skeleton_id) {
  return skeleton_id in this.skeleton_ids;
};

CircuitGraphPlot.prototype.clear = function() {
	this.skeletons = {};
  this.skeleton_ids = [];
  this.selected = {};
  this.redraw();
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
  this.selected = {};

  // Compute signal flow and eigenvectors
  try {
    var cga = new CircuitGraphAnalysis(AdjM);
  } catch (e) {
    this.clear();
    console.log(e, e.stack);
    alert("Failed to compute the adjacency matrix: \n" + e + "\n" + e.stack);
    return;
  }

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
  var containerID = '#circuit_graph_plot_div' + this.widgetID,
      container = $(containerID);

  // Clear existing plot if any
  container.empty();

  if (!this.skeleton_ids || 0 === this.skeleton_ids.length) return;

  // Recreate plot
  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = container.width() - margin.left - margin.right,
      height = container.height() - margin.top - margin.bottom;

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

  // Create a 'g' group for each skeleton, containing a circle and the neuron name
  var elems = svg.selectAll(".state").data(data).enter()
    .append('g')
    .attr('transform', function(d) { return "translate(" + xR(d.x) + "," + yR(d.y) + ")"; });

  var setSelected = (function(skid, b) {
    if (b) this.selected[skid] = true;
    else delete this.selected[skid];
  }).bind(this);

  var selected = this.selected;

  elems.append('circle')
     .attr('class', 'dot')
     .attr('r', function(d) { return selected[d.skid] ? 6 : 3; })
     .style('fill', function(d) { return d.hex; })
     .style('stroke', function(d) { return selected[d.skid] ? 'black' : 'grey'; })
     .on('click', function(d) {
       // Toggle selected:
       var c = d3.select(this);
       if (3 === Number(c.attr('r'))) {
         c.attr('r', 6).style('stroke', 'black');
         setSelected(d.skid, true);
       } else {
         c.attr('r', 3).style('stroke', 'grey');
         setSelected(d.skid, false);
       }
     })
   .append('svg:title')
     .text(function(d) { return d.name; });

  elems.append('text')
     .text(function(d) { return d.name; })
     .attr('id', 'name')
     .attr('display', this.names_visible ? '' : 'none')
     .attr('dx', function(d) { return 5; });

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

  this.svg = svg;
};

/** Redraw only the last request, where last is a period of about 1 second. */
CircuitGraphPlot.prototype.resize = function() {
  var now = new Date();
  // Overwrite request log if any
  this.last_request = now;

  setTimeout((function() {
    if (this.last_request && now === this.last_request) {
      delete this.last_request;
      this.redraw();
    }
  }).bind(this), 1000);
};

CircuitGraphPlot.prototype.setNamesVisible = function(v) {
  if (this.svg) {
    this.svg.selectAll('text#name').attr('display', v ? '' : 'none');
  }
};

CircuitGraphPlot.prototype.toggleNamesVisible = function(checkbox) {
  this.names_visible = checkbox.checked;
  this.setNamesVisible(this.names_visible);
};

CircuitGraphPlot.prototype.update = function() {
  this.append(this.skeletons);
};

CircuitGraphPlot.prototype.highlight = function() {
  // TODO
};
