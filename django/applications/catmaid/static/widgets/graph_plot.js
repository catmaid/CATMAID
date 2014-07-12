/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var CircuitGraphPlot = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

	// Each entry has an array of one or more SkeletonModel instances
	this.models = [];

  // Node ids, each has one or more models in this.models
  // and the order corresponds with that of the adjacency matrix.
  this.ids = [];

  // Name of each node
  this.names = [];

  this.AdjM = null;

	// From CircuitGraphAnalysis, first array entry is Signal Flow, rest are
	// the sorted pairs of [eigenvalue, eigenvector].
	this.vectors = null;

  // Array of arrays, containing anatomical measurements
  this.anatomy = null;

  // Array of arrays, containing centrality measures
  this.centralities = [null];

  this.names_visible = true;

  // Node ID vs true
  this.selected = {};

  // Parameters for anatomy
  this.sigma = 200; // nm
  this.bandwidth = 8000; // nm

  this.pca_parameters = {graph: false,
                         'arbor morphology': true,
                         'synaptic counts': true,
                         'synaptic distribution': true,
                         'with asymmetry histograms': true};

  // Array of pairs of [single value, principal component vector]
  this.pca = null;
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
  neuronNameService.unregister(this);
  
  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

CircuitGraphPlot.prototype.updateModels = function(models) {
	this.append(models);
};

/** Returns a clone of all skeleton models, keyed by skeleton ID. */
CircuitGraphPlot.prototype.getSelectedSkeletonModels = function() {
  if (!this.svg) return {};
  var models = this.models,
      selected = this.selected;
	return this.ids.reduce(function(o, id, i) {
    if (selected[id]) {
      return models[i].reduce(function(o, model) {
        o[model.id] = model.clone();
        return o;
      }, o);
    }
    return o;
  }, {});
};

CircuitGraphPlot.prototype.getSelectedSkeletons = function() {
  if (!this.svg) return [];
  var models = this.models,
      selected = this.selected;
	return this.ids.reduce(function(a, id, i) {
    if (selected[id]) {
      return a.concat(models[i].map(function(model) { return model.id; }));
    }
    return a;
  }, []);
};

CircuitGraphPlot.prototype.getSkeletons = function() {
  if (!this.svg) return [];
  var models = this.models;
	return this.ids.reduce(function(a, id, i) {
    return a.concat(models[i].map(function(model) { return model.id; }));
  }, []);
};

CircuitGraphPlot.prototype.getSkeletonModels = function() {
  if (!this.svg) return {};
  return this.models.reduce(function(o, ms) {
    return ms.reduce(function(o, model) {
      o[model.id] = model;
      return o;
    }, o);
  }, {});
};

CircuitGraphPlot.prototype.getSkeletonModel = function(skeleton_id) {
  for (var i=0; i<this.models.length; ++i) {
    if (skeleton_id === this.models[i].id) return this.models[i].clone();
  }
  return null;
};

CircuitGraphPlot.prototype.hasSkeleton = function(skeleton_id) {
  return this.models.some(function(ms) {
    return ms.some(function(model) {
      return skeleton_id === model.id;
    });
  });
};

CircuitGraphPlot.prototype.clear = function() {
	this.models = [];
  this.ids = [];
  this.names = [];
  this.selected = {};
  this.clearGUI();
  this.vectors = null;
  this.anatomy = null;
  this.centralities = [null];
  this.pca = null;
};

CircuitGraphPlot.prototype.append = function(models) {
	// Update names and colors when already present, or remove when deselected
  var skeleton_ids = {};
	this.models = this.models.filter(function(ms, i) {
    var ms2 = ms.filter(function(m, k) {
      skeleton_ids[m.id] = true;
      //
      var model = models[m.id];
      if (!model) return true;
      if (model.selected) {
        ms[k] = model.clone(); // replace first
        if (1 === ms.length) this.names[i] = model.baseName;
        return true;
      }
      return false; // remove skeleton from group
    }, this);
    if (0 === ms2.length) {
      // Remove group
      this.ids.splice(k, 1);
      this.names.splice(k, 1);
      return false; // removes from this.models
    }
    return true;
  }, this);

  // Add new ones
  Object.keys(models).forEach(function(skid) {
    if (skid in skeleton_ids) return;
    var model = models[skid];
    if (model.selected) {
      skeleton_ids[model.id] = true;
      //
      this.ids.push(model.id);
      this.names.push(model.baseName);
      this.models.push([model]);
    }
  }, this);

  var skids = Object.keys(skeleton_ids);

  if (1 === skids.length) {
    this.clearGUI();
    growlAlert('Need more than one', 'Add at least another skeleton!');
    return;
  }

	// fetch connectivity data, create adjacency matrix and plot it
  // register with name service before we go about the plot
  requestQueue.register(django_url + project.id + '/skeletongroup/skeletonlist_confidence_compartment_subgraph', 'POST',
			{skeleton_list: skids},
			(function(status, text) {
				if (200 !== status) return;
				var json = $.parseJSON(text);
				if (json.error) { alert(json.error); return; }
				// Create adjacency matrix
				var AdjM = this.ids.map(function(id) { return new Uint32Array(this.ids.length); }, this);
        // Create indices from skeleton ID to group index in this.ids array
				var indices = this.models.reduce(function(o, ms, i) {
          return ms.reduce(function(o, model) {
            o[model.id] = i;
            return o;
          }, o);
        }, {});
				// Populate adjacency matrix, accumulating edge synapse counts for groups
				json.edges.forEach(function(edge) {
					AdjM[indices[edge[0]]][indices[edge[1]]] += edge[2];
				});
        // Update data and GUI
        this.plot(this.ids, this.names, this.models, AdjM);
		}).bind(this));
};

/**
 * This method is called from the neuron name service, if neuron names are
 * changed.
 */
CircuitGraphPlot.prototype.updateNeuronNames = function() {
  this.redraw();
};


CircuitGraphPlot.prototype._add_graph_partition = function(mirror) {
  if (this.vectors.length > 2) {
    // Potentially disjoint if there are least two network components,
    // detectable by finding out whether the first non-zero eigenvalue has zeros where the next one doesn't.
    var epsilon = 0.00000001,
        clean = function(v) { return Math.abs(v) < epsilon ? 0 : v},
        ev2 = this.vectors[1][1].map(clean),
        ev3 = this.vectors[2][1].map(clean);

    if (mirror) {
      ev3 = ev3.map(function(v) { return -v; });
    }

    if (ev2.some(function(v2, i) {
      var v3 = ev3[i];
      return (0 === v2 && 0 !== v3) || (0 === v3 && 0 !== v2);
    })) {
      this.vectors.push([-1, ev2.map(function(v2, i) {
        return 0 === v2 ? ev3[i] : v2;
      })]);
    } else if (this.vectors.length > 3) {
      // Not disjoint: combine the third and fourth eigenvectors
      // as a function of the second eigenvector, according to the sign in the latter.
      
      var ev4 = this.vectors[3][1].map(clean),
          vs = [ev3, ev4];

      // Pick all indices for positive values in the second (1) eigenvector
      var positive = ev2.reduce(function(a, v, i) { if (v > 0) a.push(i); return a; }, []);

      // For the positive indices, find out if the std dev is larger in the third
      // or the fourth eigenvectors
      var indices = [0, 1].map(function(k) {
        var v = vs[k],
            mean = positive.reduce(function(sum, i) { return sum + v[i];}, 0) / positive.length,
            stdDev = positive.reduce(function(sum, i) { return sum + Math.pow(v[i] - mean, 2); }, 0) / positive.length;
        return [k, stdDev];
      }, this).sort(function(a, b) {
        return a[1] < b[1];
      }).map(function(a) { return a[0]; });

      // Create a new vector with the most signal from both the third (2) and fourth (3) eigenvectors
      this.vectors.push([-1, ev2.map(function(v, i) {
        return vs[v > 0 ? indices[0] : indices[1]][i]; 
      }, this)]);
    } else {
      this.vectors.push([-1, this.ids.map(function() { return 0; })]);
    }
  } else {
    this.vectors.push([-1, this.ids.map(function() { return 0; })]);
  }

};

/** Takes an array of skeleton IDs, a map of skeleton ID vs SkeletonModel,
 * and an array of arrays representing the adjacency matrix where the order
 * in rows and columns corresponds to the order in the array of skeleton IDs.
 * Clears the existing plot and replaces it with the new data. */
CircuitGraphPlot.prototype.plot = function(ids, names, models, AdjM) {
  neuronNameService.registerAll(this, models, (function() {
    this._plot(ids, names, models, AdjM);
  }).bind(this));
};

CircuitGraphPlot.prototype._plot = function(ids, names, models, AdjM) {
  // Set the new data
  this.ids = ids;
  this.names = names;
  this.models = models;
  this.AdjM = AdjM;
  this.selected = {};

  // Compute signal flow and eigenvectors
  try {
    var cga = new CircuitGraphAnalysis().init(AdjM, 100000, 0.0000000001);
  } catch (e) {
    this.clear();
    console.log(e, e.stack);
    alert("Failed to compute the adjacency matrix: \n" + e + "\n" + e.stack);
    return;
  }

  // Reset data
  this.vectors = null;
  this.anatomy = null;
  this.centralities = [null];
  this.pca = null;

  // Store for replotting later
  this.vectors = [[-1, cga.z]];
  for (var i=0; i<10 && i <cga.e.length; ++i) {
    this.vectors.push(cga.e[i]);
  }

  this._add_graph_partition(false);
  this._add_graph_partition(true);

  this.updatePulldownMenus(false);

  this.redraw();
};

CircuitGraphPlot.prototype.updatePulldownMenus = function(preserve_indices) {
  // Reset pulldown menus
  var updateSelect = (function(select) {
    var index = select.selectedIndex;
    select.options.length = 0;

    select.options.add(new Option('Signal Flow', 0));
    for (var i=1; i<11 && i<this.vectors.length; ++i) {
      select.options.add(new Option('Eigenvalue ' + Number(this.vectors[i][0]).toFixed(2), i+1));
    }

    select.options.add(new Option('Graph partition (cell types)', 11));
    select.options.add(new Option('Graph partition (cell types) mirror', 12));

    ['Betweenness centrality'].forEach(function(name, k) {
       select.options.add(new Option(name, 'c' + k));
     });

    ['Cable length (nm)',
     'Cable length w/o principal branch (nm)',
     'Num. input synapses',
     'Num. output synapses',
     'Num. input - Num. output',
     'Segregation index',
     'Asymmetry index',
     'Cable asymmetry index',
     'Output asymmetry index',
     'Input asymmetry index'].forEach(function(name, k) {
       select.options.add(new Option(name, 'a' + k));
     });

    select.options.add(new Option('Cable of terminal segments (nm)', 'a50'));
    select.options.add(new Option('Num. terminal segments (nm)', 'a51'));
    select.options.add(new Option('Cable of hillock (nm)', 'a52'));

    if (this.pca) {
      for (var i=0; i<this.pca.length; ++i) {
        select.options.add(new Option('PC ' + (i+1) + ' - ' + Number(this.pca[i][0]).toFixed(2), 'p' + i));
      }
    } else {
      for (var i=0; i<5; ++i) {
        select.options.add(new Option('PC ' + (i+1), 'p' + i));
      }
    }

    if (preserve_indices) select.selectedIndex = index;

    return select;
  }).bind(this);

  var sel1 = updateSelect($('#circuit_graph_plot_X_' + this.widgetID)[0]),
      sel2 = updateSelect($('#circuit_graph_plot_Y_' + this.widgetID)[0]);
 
  if (!preserve_indices) {
    sel1.selectedIndex = 1;
    sel2.selectedIndex = 0;
  }
};

CircuitGraphPlot.prototype.clearGUI = function() {
  this.selected = {};
  $('#circuit_graph_plot_div' + this.widgetID).empty();

  $('#circuit_graph_plot_X_' + this.widgetID)[0].options.length = 0;
  $('#circuit_graph_plot_Y_' + this.widgetID)[0].options.length = 0;
};

CircuitGraphPlot.prototype.getVectors = function() {
  if (!this.ids || 0 === this.ids.length || !this.vectors) return;
  
  var xSelect = $('#circuit_graph_plot_X_' + this.widgetID)[0],
      ySelect = $('#circuit_graph_plot_Y_' + this.widgetID)[0];

  var f = (function(select) {
    var index = select.selectedIndex;
    if (index < this.vectors.length) {
      return this.vectors[index][1];
    } else if ('a' === select.value[0]) {
      if (!this.anatomy) {
        return this.loadAnatomy(this.redraw.bind(this));
      }
      return this.anatomy[parseInt(select.value.slice(1))];
    } else if ('c' === select.value[0]) {
      var i = parseInt(select.value.slice(1));
      if (!this.centralities[i]) {
        return this.loadBetweennessCentrality(this.redraw.bind(this));
      }
      return this.centralities[i];
    } else if ('p' === select.value[0]) {
      if (!this.pca) {
        return this.loadPCA(this.redraw.bind(this));
      }
      return this.pca[parseInt(select.value.slice(1))][1];
    }
  }).bind(this);

  var xVector = f(xSelect),
      yVector = f(ySelect);

  if (!xVector || !yVector) return;

  return {x: xVector, x_name: xSelect[xSelect.selectedIndex].text,
          y: yVector, y_name: ySelect[ySelect.selectedIndex].text};
};

CircuitGraphPlot.prototype.redraw = function() {
  if (!this.ids || 0 === this.ids.length) return;

  var vs = this.getVectors();

  if (!vs) return;

  this.draw(vs.x, vs.x_name,
            vs.y, vs.y_name);
};

CircuitGraphPlot.prototype.loadAnatomy = function(callback) {
  $.blockUI();

  var measurements = {},
      sigma = this.sigma,
      bandwidth = this.bandwidth;

  fetchSkeletons(
      Object.keys(this.getSkeletonModels()).map(Number),
      function(skid) {
        return django_url + project.id + '/' + skid + '/1/0/compact-skeleton';
      },
      function(skid) { return {}; },
      function(skid, json) {
        var ap = parseArbor(json),
            arbor = ap.arbor,
            smooth_positions = arbor.smoothPositions(ap.positions, sigma),
            smooth_cable = Math.round(arbor.cableLength(smooth_positions, sigma)) | 0,
            n_inputs = ap.n_inputs,
            n_outputs = ap.n_outputs;

        // Compute amount of cable of the terminal segments
        var terminal = arbor.terminalCableLength(smooth_positions),
            terminal_cable = terminal.cable,
            n_terminal_segments = terminal.n_ends;

        // Compute length of hillock: part of the cable with maximum flow centrality.
        // Increase robustness to occasional synapse on the hillock or small side branch, by using cable with more than 75% of the max value.
        var flow_centrality = arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs),
            hillock_cable = 0;
        if (flow_centrality) {
          var nodes = Object.keys(flow_centrality),
              max = nodes.reduce(function(max, node) {
            return Math.max(max, flow_centrality[node]);
          }, 0),
              max75 = 0.75 * max;
          hillock_cable = nodes.reduce(function(sum, node) {
            if (flow_centrality[node] > max75) {
              var paren = arbor.edges[node];
              return sum + (paren ? smooth_positions[node].distanceTo(smooth_positions[paren]) : 0);
            }
            return sum;
          }, 0);
        }

        // Compute length of principal branch
        var principal = (function(ps) { return ps[ps.length -1]; })(arbor.partitionSorted()),
            plen = 0,
            loc1 = smooth_positions[principal[0]];
        for (var i=1, l=principal.length; i<l; ++i) {
          var loc2 = smooth_positions[principal[i]];
          plen += loc1.distanceTo(loc2);
          loc1 = loc2;
        }

        // Compute synapse segregation index
        var synapse_map = json[1].reduce(function(o, row) {
          var list = o[row[0]],
              entry = {type: row[2],
                       connector_id: row[1]};
          if (list) list.push(entry);
          else o[row[0]] = [entry];
          return o;
        }, {}),
            sc = new SynapseClustering(arbor, smooth_positions, synapse_map),
            segIndex = sc.segregationIndex(sc.clusters(sc.densityHillMap(bandwidth)));

        // Compute subtree asymmetries
        var asymIndex = arbor.asymmetryIndex(),
            cableAsymIndex = arbor.cableAsymmetryIndex(smooth_positions),
            io = json[1].reduce(function(a, row) {
              var node = row[0],
                  type = row[2],
                  count = a[type][node];
              a[type][node] = (undefined === count ? 0 : count) + 1;
              return a;
            }, [{}, {}]),
            outputAsymIndex = arbor.loadAsymmetryIndex(io[0]),
            inputAsymIndex = arbor.loadAsymmetryIndex(io[1]);

        measurements[skid] = [smooth_cable,
                              plen,
                              ap.n_inputs,
                              ap.n_outputs,
                              segIndex,
                              asymIndex,
                              cableAsymIndex,
                              outputAsymIndex,
                              inputAsymIndex,
                              terminal_cable,
                              n_terminal_segments,
                              hillock_cable];
      },
      function(skid) {
        // Failed to load
        growlAlert("ERROR", "Skeleton #" + skid + " failed to load.");
        measurements[skid] = new Uint8Array(9);
      },
      (function() {
        // Done loading all
        // 0: smooth cable length
        // 1: smooth cable length minus principal branch length
        // 2: number of inputs
        // 3: number of outputs
        // 4: inputs minus outputs
        // 5: segregation index
        // 6: topological asymmetry index
        // 7: cable asymmetry index
        // 8: output asymmetry index
        // 9: input asymmetry index
        // 10-19: topological asymmetry histogram bins
        // 20-29: cable asymmetry histogram bins
        // 30-39: output asymmetry histogram bins
        // 40-49: input asymmetry histogram bins
        // 50: cable length of the terminal segments
        // 51: number of terminal segments
        // 52: length of the hillock cable
        var n = this.models.length,
            vs = [];
        for (var i=0; i<53; ++i) vs[i] = new Float64Array(n);

        this.models.forEach(function(models, k) {
          var len = models.length;
          if (1 === len) {
            var m = measurements[models[0].id];
            vs[0][k] = m[0];
            vs[1][k] = m[0] - m[1];
            vs[2][k] = m[2];
            vs[3][k] = m[3];
            vs[4][k] = m[2] - m[3];
            vs[5][k] = m[4];
            vs[6][k] = m[5].mean;
            vs[7][k] = m[6].mean;
            vs[8][k] = m[7].mean;
            vs[9][k] = m[8].mean;
            for (var i=1; i<5; ++i) {
              var histogram = m[i+4].histogram,
                  offset = 10 * i;
              for (var b=0; b<10; ++b) {
                vs[offset + b][k] = histogram[b];
              }
            };
            vs[50][k] = m[9];
            vs[51][k] = m[10];
            vs[52][k] = m[11];
          } else {
            models.forEach(function(model) {
              var m = measurements[model.id];
              vs[0][k] += m[0];
              vs[1][k] += m[0] - m[1];
              vs[2][k] += m[2];
              vs[3][k] += m[3];
              // v[4] taken care of at the end
              vs[5][k] += m[4] * m[0]; // weighed by cable
              vs[6][k] += m[5].mean * m[0]; // weighed by cable
              vs[7][k] += m[6].mean * m[0]; // weighed by cable
              vs[8][k] += m[7].mean * m[0]; // weighed by cable
              vs[9][k] += m[8].mean * m[0]; // weighed by cable
              //
              for (var i=1; i<5; ++i) {
                var histogram = m[i+4].histogram,
                    offset = 10 * i;
                for (var b=0; b<10; ++b) {
                  vs[offset + b][k] += histogram[b];
                }
              };
              vs[50][k] += m[9];
              vs[51][k] += m[10];
              vs[52][k] += m[11];
            });

            // Compute inputs minuts outputs
            vs[4][k] = vs[2][k] - vs[3][k];
            // Divide those that are weighted by cable
            for (var i=5, v0=vs[0][k]; i<10; ++i) vs[i][k] /= v0;
          }
        });

        this.anatomy = vs;

        if (typeof(callback) === 'function') callback();
      }).bind(this));
};

CircuitGraphPlot.prototype.loadBetweennessCentrality = function(callback) {
  try {
    var graph = jsnx.DiGraph();
    this.AdjM.forEach(function(row, i) {
      var source = this.ids[i];
      for (var j=0; j<row.length; ++j) {
        if (0 === row[j]) continue;
        var target = this.ids[j];
        graph.add_edge(source, target, {weight: row[j]});
      }
    }, this);

    if (this.ids.length > 10) {
      $.blockUI();
    }

    var bc = jsnx.betweenness_centrality(graph, {weight: 'weight',
                                                 normalized: true});
    var max = Object.keys(bc).reduce(function(max, nodeID) {
      return Math.max(max, bc[nodeID]);
    }, 0);

    // Handle edge case
    if (0 === max) max = 1;

    this.centralities[0] = this.ids.map(function(id) {
      return bc[id] / max;
    });

    if (typeof(callback) === 'function') callback();
  } catch (e) {
    console.log(e, e.stack);
    alert("Error: " + e);
  } finally {
    $.unblockUI();
  }
};

CircuitGraphPlot.prototype.draw = function(xVector, xTitle, yVector, yTitle) {
  var containerID = '#circuit_graph_plot_div' + this.widgetID,
      container = $(containerID);

  // Clear existing plot if any
  container.empty();

  // Recreate plot
  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = container.width() - margin.left - margin.right,
      height = container.height() - margin.top - margin.bottom;

  // Package data
  var data = this.ids.map(function(id, i) {
    var models = this.models[i];
    return {id: id,
            name: (models.length > 1 ? this.names[i] : neuronNameService.getName(id)), // groups retain their name
            hex: '#' + this.models[i][0].color.getHexString(),
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

  var svg = d3.select(containerID).append("svg")
      .attr("id", "circuit_graph_plot" + this.widgetID)
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
  var transform = function(d) { return "translate(" + xR(d.x) + "," + yR(d.y) + ")"; };

  // Create a 'g' group for each skeleton, containing a circle and the neuron name
  var elems = svg.selectAll(".state").data(data).enter()
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

  // Variables exist throughout the scope of the function, so zoom is reachable from zoomed
  var zoom = d3.behavior.zoom().x(xR).y(yR).scaleExtent([1, 100]).on("zoom", zoomed);

  // Assign the zooming behavior to the encapsulating root group
  svg.call(zoom);

  var setSelected = (function(id, b) {
    if (b) this.selected[id] = true;
    else delete this.selected[id];
  }).bind(this);

  var selected = this.selected;

  elems.append('circle')
     .attr('class', 'dot')
     .attr('r', function(d) { return selected[d.id] ? 6 : 3; })
     .style('fill', function(d) { return d.hex; })
     .style('stroke', function(d) { return selected[d.id] ? 'black' : 'grey'; })
     .on('click', function(d) {
       // Toggle selected:
       var c = d3.select(this);
       if (3 === Number(c.attr('r'))) {
         c.attr('r', 6).style('stroke', 'black');
         setSelected(d.id, true);
       } else {
         c.attr('r', 3).style('stroke', 'grey');
         setSelected(d.id, false);
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

/** Implements the refresh button. */
CircuitGraphPlot.prototype.update = function() {
  this.append(this.getSkeletonModels());
};

CircuitGraphPlot.prototype.highlight = function() {
  // TODO
};

CircuitGraphPlot.prototype.exportSVG = function() {
  saveDivSVG('circuit_graph_plot_div' + this.widgetID, "circuit_plot.svg");
};

CircuitGraphPlot.prototype.exportCSV = function() {
  var vs = this.getVectors();
  if (!vs) return;
  var csv = this.ids.map(function(id, i) {
    return [this.names[i].replace(/,/g, ";"),
            id,
            vs.x[i],
            vs.y[i]].join(',');
  }, this).join('\n');
  var blob = new Blob(["neuron,skeleton_id," + vs.x_name + "," + vs.y_name + "\n", csv], {type :'text/plain'});
  saveAs(blob, "circuit_plot.csv");
};

CircuitGraphPlot.prototype.adjustOptions = function() {
  var od = new OptionsDialog("Parameters");
  od.appendField(
      "Smooth skeletons by Gaussian convolution with sigma (nm): ",
      "CGP-sigma" + this.widgetID,
      this.sigma);
  od.appendField(
      "Bandwidth for synapse clustering (nm): ",
      "CGP-bandwidth" + this.widgetID,
      this.bandwidth);
  od.appendMessage('Groups of measurements for PCA:');
  Object.keys(this.pca_parameters).forEach(function(key) {
    var id = key.replace(/ /g, '-') + this.widgetID;
    od.appendCheckbox(key, id, this.pca_parameters[key]);
  }, this);

  od.onOK = (function() {
    var b = false,
        update_pca = false;
    Object.keys(this.pca_parameters).forEach(function(key) {
      var id = key.replace(/ /g, '-') + this.widgetID,
          val = $('#' + id)[0].checked;
      if (!update_pca) update_pca = this.pca_parameters[key] !== val;
      this.pca_parameters[key] = val;
      if (val) b = true;
    }, this);

    if (!b) {
      alert("At least one of the four parameter groups should be selected: selecting 'graph'");
      this.pca_parameters.graph = true;
    }

    var read = (function(name) {
      var field = $('#CGP-' + name + this.widgetID);
      try {
        var value = parseInt(field.val());
        if (value < 0) return alert(name + " must be larger than zero.");
        var old_value = this[name];
        this[name] = value;
        return old_value !== value;
      } catch (e) {
        alert("Invalid value for sigma: " + field.val());
        return false;
      }
    }).bind(this);

    var update1 = read('sigma'),
        update2 = read('bandwidth');

    // Label for reloading upon redraw
    if (update1 || update2) {
      this.anatomy = null;
      update_pca = true;
    }

    if (update_pca) this.pca = null;

    if (update1 || update2 || update_pca) this.redraw();


  }).bind(this);

  od.show(300, 400, true);
};

/** Perform PCA on a set of parameters based on morphology only, rather than connectivity. */
CircuitGraphPlot.prototype.loadPCA = function(callback) {
  var p = this.pca_parameters;
  if ((p['arbor morphology'] || p['synaptic counts'] || p['synaptic distribution']) && !this.anatomy) {
    return this.loadAnatomy(this.loadPCA.bind(this, callback));
  }
  if (p.graph && !this.centralities[0]) {
    return this.loadBetweennessCentrality(this.loadPCA.bind(this, callback));
  }

  var M = [];
  if (p.graph) {
    // signal flow
    // eigenvalues of the graph Laplacian of the adjacency matrix
    // betweenness centrality
    for (var i=0; i<this.vectors.length; ++i) M.push(this.vectors[i][1]);
    for (var i=0; i<this.centralities.length; ++i) M.push(this.centralities[i]);
  }
  if (p['arbor morphology']) {
    M.push(this.anatomy[0]); // cable
    M.push(this.anatomy[1]); // cable minus principal branch
    M.push(this.anatomy[6]); // asymmetry index
    M.push(this.anatomy[7]); // cable asymmetry index
    if (p['with asymmetry histograms']) {
      // Append 2 * 10 bins of histograms of both asymmetry index and cable asymmetry index
      for (var i=10; i<30; ++i) {
        M.push(this.anatomy[i]);
      }
    }
    M.push(this.anatomy[50]); // cable of terminal segments
    M.push(this.anatomy[51]); // N terminal segments
  }
  if (p['synaptic counts']) {
    M.push(this.anatomy[2]);  // N inputs
    M.push(this.anatomy[3]);  // N outputs
    M.push(this.anatomy[4]);  // N inputs minus N outputs
  }
  if (p['synaptic distribution']) {
    M.push(this.anatomy[5]);  // segregation index
    M.push(this.anatomy[8]);  // output asymmetry index
    M.push(this.anatomy[9]);  // input asymmetry index
    if (p['with asymmetry histograms']) {
      // Append 2 * 10 bins of histograms of both output asymmetry index and input asymmetry index
      for (var i=30; i<50; ++i) {
        M.push(this.anatomy[i]);
      }
    }
    M.push(this.anatomy[52]); // cable of hillock
    // TODO test without cable of hillock
  }

  // Normalize the standard deviations
  M = M.map(function(v) {
    var sum = 0;
    for (var i=0; i<v.length; ++i) sum += v[i];
    var mean = sum / v.length;
    var s = 0;
    for (var i=0; i<v.length; ++i) s += Math.pow(v[i] - mean, 2);
    var stdDev = Math.sqrt(s / v.length),
        v2 = new Float64Array(v.length);
    if (0 === stdDev) stdDev = 1;
    for (var i=0; i<v.length; ++i) v2[i] = (v[i] - mean) / stdDev;
    return v2;
  });

  // M is in a transposed state
  //var pca = numeric.svd(numeric.div(numeric.dot(numeric.transpose(M), M), M.length)).U;
  // Instead, compute in reverse
  
  // Adjust error to prevent lack of convergence
  //var epsilon = numeric.epsilon;
  //numeric.epsilon = 0.0000000001;

  var svd = numeric.svd(numeric.div(numeric.dot(M, numeric.transpose(M)), M[0].length));

  this.pca = numeric.dot(svd.U.slice(0, 5), M).map(function(v, i) {
    return [svd.S[i], v];
  });

  // Restore default
  //numeric.epsilon = epsilon;

  this.updatePulldownMenus(true);

  if ('function' === typeof callback) callback();
};
