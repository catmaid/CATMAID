/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CircuitGraphAnalysis,
  fetchSkeletons,
  InstanceRegistry,
  project,
  SynapseClustering
*/

(function(CATMAID) {

  "use strict";

  var CircuitGraphPlot = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

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
    this.reroot_at_soma = true;
    this.sigma = 200; // nm
    //this.bandwidth = 8000; // nm
    this.prune_bare_terminal_segments = false;

    this.pca_graph = {
      'Graph': false,
      'Betweenness centrality': false
    };

    this.pca_anatomy_absolute = {
      'Cable length': true,
      'Cable minus principal branch': false,
      'Histogram of asymmetry index': false,
      'Histogram of cable asymmetry index': false,
      'Cable of terminal segments': false,
      'Num. terminal segments': false,
      'Num. of branches': false
    };

    this.pca_anatomy_relative = {
      'Asymmetry index': false,
      'Normalized histogram of asymmetry index': false,
      'Cable asymmetry index': false,
      'Normalized histogram of cable asymmetry index': false,
      'Normalized cable of terminal segments': false
    };

    this.pca_synapses_absolute = {
      'Num. of inputs': false,
      'Num. of outputs': false,
      'Histogram of output asymmetry index': false,
      'Histogram of input asymmetry index': false,
      'Cable of hillock': true,
      'Cable of main dendritic shaft': true
    };

    this.pca_synapses_relative = {
      'Segregation index': true,
      'Ratio (I - O) / (I + O)': false,
      'Output asymmetry index': true,
      'Normalized histogram of output asymmetry index': true,
      'Input asymmetry index': true,
      'Normalized histogram of input asymmetry index': true,
    };


    // Array of pairs of [single value, principal component vector]
    this.pca = null;
  };

  CircuitGraphPlot.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  CircuitGraphPlot.prototype.constructor = CircuitGraphPlot;

  $.extend(CircuitGraphPlot.prototype, new InstanceRegistry());

  CircuitGraphPlot.prototype.getName = function() {
    return "Circuit Graph Plot " + this.widgetID;
  };

  CircuitGraphPlot.prototype.getWidgetConfiguration = function() {
    return {
      contentID: "circuit_graph_plot_div" + this.widgetID,
      createControls: function(controls) {
        controls.appendChild(document.createTextNode('From'));
        controls.appendChild(CATMAID.skeletonListSources.createSelect(this));

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = this.loadSource.bind(this);
        controls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        controls.appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = this.update.bind(this);
        controls.appendChild(update);

        var annotate = document.createElement('input');
        annotate.setAttribute("type", "button");
        annotate.setAttribute("value", "Annotate");
        annotate.onclick = this.annotate_skeleton_list.bind(this);
        controls.appendChild(annotate);

        var options = document.createElement('input');
        options.setAttribute("type", "button");
        options.setAttribute("value", "Options");
        options.onclick = this.adjustOptions.bind(this);
        controls.appendChild(options);


        controls.appendChild(document.createTextNode(' - X:'));

        var axisX = document.createElement('select');
        axisX.setAttribute('id', 'circuit_graph_plot_X_' + this.widgetID);
        controls.appendChild(axisX);

        controls.appendChild(document.createTextNode(' Y:'));

        var axisY = document.createElement('select');
        axisY.setAttribute('id', 'circuit_graph_plot_Y_' + this.widgetID);
        controls.appendChild(axisY);

        var redraw = document.createElement('input');
        redraw.setAttribute("type", "button");
        redraw.setAttribute("value", "Draw");
        redraw.onclick = this.redraw.bind(this);
        controls.appendChild(redraw);

        controls.appendChild(document.createTextNode(" Names:"));
        var toggle = document.createElement('input');
        toggle.setAttribute("type", "checkbox");
        toggle.checked = true;
        toggle.onclick = this.toggleNamesVisible.bind(this, toggle);
        controls.appendChild(toggle);

        var xml = document.createElement('input');
        xml.setAttribute("type", "button");
        xml.setAttribute("value", "Export SVG");
        xml.onclick = this.exportSVG.bind(this);
        controls.appendChild(xml);

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Export CSV");
        csv.onclick = this.exportCSV.bind(this);
        controls.appendChild(csv);

        var csva = document.createElement('input');
        csva.setAttribute("type", "button");
        csva.setAttribute("value", "Export CSV (all)");
        csva.onclick = this.exportCSVAll.bind(this);
        controls.appendChild(csva);

        controls.appendChild(document.createTextNode(' - '));

        var deselect = document.createElement('input');
        deselect.setAttribute("type", "button");
        deselect.setAttribute("value", "Deselect all");
        deselect.onclick = this.clearSelection.bind(this);
        controls.appendChild(deselect);
      },
      createContent: function(content) {
        content.style.overflow = 'hidden';

        var plot = document.createElement('div');
        plot.setAttribute('id', 'circuit_graph_plot' + this.widgetID);
        plot.style.width = "100%";
        plot.style.height = "100%";
        plot.style.backgroundColor = "#FFFFF0";
      },
      subscriptionSource: this
    };
  };

  CircuitGraphPlot.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    
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
    if (!this.models) return [];
    var models = this.models;
    return this.ids.reduce(function(a, id, i) {
      return a.concat(models[i].map(function(model) { return model.id; }));
    }, []);
  };

  CircuitGraphPlot.prototype.getSkeletonModels = function() {
    if (!this.models) return {};
    return this.models.reduce(function(o, ms) {
      return ms.reduce(function(o, model) {
        o[model.id] = model;
        return o;
      }, o);
    }, {});
  };

  CircuitGraphPlot.prototype.getSkeletonModel = function(skeleton_id) {
    for (var i=0; i<this.models.length; ++i) {
      var modelSet = this.models[i];
      for (var j=0; j<modelSet.length; ++j) {
        if (skeleton_id === modelSet[j].id) {
          return modelSet[j].clone();
        }
      }
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

  CircuitGraphPlot.prototype.removeSkeletons = function(skeletonIds) {
    var removed = {};
    skeletonIds.forEach(function(skid) {
      var nSkid = parseInt(skid, 10);
      var idx = this.ids.indexOf(nSkid);
      // Remove model
      if (-1 !== idx) {
        var models = this.models[idx];
        for (var i=0; i<models.length; ++i) {
          removed[skid] = models[i];
        }
        this.ids.splice(idx, 1);
        this.models.splice(idx, 1);
        this.names.splice(idx, 1);
      }
    }, this);

    if (!CATMAID.tools.isEmpty(removed)) {
      this.trigger(this.EVENT_MODELS_REMOVED, removed);
      this.update();
    }
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
        this.ids.splice(i, 1);
        this.names.splice(i, 1);
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

    if (skids.length < 2) {
      this.clearGUI();
      CATMAID.msg('Need more than one', 'Need at least two neurons!');
      return;
    }

    // fetch connectivity data, create adjacency matrix and plot it
    // register with name service before we go about the plot
    CATMAID.fetch(project.id + '/skeletons/confidence-compartment-subgraph',
        'POST', {skeleton_ids: skids})
      .then((function(json) {
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
          AdjM[indices[edge[0]]][indices[edge[1]]] += edge[2].reduce(function (s, c) { return s + c; }, 0);
        });
        // Update data and GUI
        this.plot(this.ids, this.names, this.models, AdjM);
      }).bind(this))
      .catch(CATMAID.handleError);
  };

  /**
   * This method is called from the neuron name service, if neuron names are
   * changed.
   */
  CircuitGraphPlot.prototype.updateNeuronNames = function() {
    this.redraw();
  };


  CircuitGraphPlot.prototype._add_graph_partition = function(mirror) {
    // Potentially disjoint if there are least two network components,
    // detectable by finding out whether the first non-zero eigenvalue has zeros where the next one doesn't.
    var epsilon = 0.00000001,
        clean = function(v) { return Math.abs(v) < epsilon ? 0 : v; },
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
  };

  /** Takes an array of skeleton IDs, a map of skeleton ID vs SkeletonModel,
   * and an array of arrays representing the adjacency matrix where the order
   * in rows and columns corresponds to the order in the array of skeleton IDs.
   * Clears the existing plot and replaces it with the new data. */
  CircuitGraphPlot.prototype.plot = function(ids, names, models, AdjM) {
    // Set the new data
    this.ids = ids;
    this.names = names;
    this.models = models;
    this.AdjM = AdjM;
    this.selected = {};

    CATMAID.NeuronNameService.getInstance().registerAll(this,
        this.getSkeletonModels(),
        (function() { this._plot(); }).bind(this));
  };

  CircuitGraphPlot.prototype._plot = function() {
    // Compute signal flow and eigenvectors
    try {
      var cga = new CircuitGraphAnalysis().init(this.AdjM, 100000, 0.0000000001);
    } catch (e) {
      this.clear();
      console.log(e, e.stack);
      alert("Failed to compute the adjacency matrix: \n" + e + "\n" + e.stack);
      return;
    }

    // Reset data
    this.vectors = [];
    this.anatomy = null;
    this.centralities = [null];
    this.pca = null;

    // Can be null when not computable
    if (cga && cga.e && cga.z) {
      // Store for replotting later
      this.vectors = [[-1, cga.z]];
      for (var i=0; i<10 && i <cga.e.length; ++i) {
        this.vectors.push(cga.e[i]);
      }

      if (cga.e.length > 2) {
        this._add_graph_partition(false);
        this._add_graph_partition(true);
      }
    }

    this.updatePulldownMenus(false);

    this.redraw();
  };

  CircuitGraphPlot.prototype.updatePulldownMenus = function(preserve_indices) {
    // Reset pulldown menus
    var updateSelect = (function(select) {
      var index = select.selectedIndex;
      select.options.length = 0;

      if (this.vectors.length > 0) {
        // Will be zero when neurons don't connect to each other
        select.options.add(new Option('Signal Flow', 0));
        var i = 1;
        for (; i<11 && i<this.vectors.length; ++i) {
          if (-1 === this.vectors[i][0]) break; // graph partitions
          select.options.add(new Option('Eigenvalue ' + Number(this.vectors[i][0]).toFixed(2), i+1));
        }

        select.options.add(new Option('Graph partition (cell types)', i));
        select.options.add(new Option('Graph partition (cell types) mirror', i + 1));

        ['Betweenness centrality'].forEach(function(name, k) {
          select.options.add(new Option(name, 'c' + k));
        });
      }

      ['Cable length (nm)',
       'Cable w/o principal branch (nm)',
       'Num. input synapses',
       'Num. output synapses',
       'Ratio (I - O) / (I + O)',
       'Segregation index',
       'Asymmetry index',
       'Cable asymmetry index',
       'Output asymmetry index',
       'Input asymmetry index'].forEach(function(name, k) {
         select.options.add(new Option(name, 'a' + k));
       });

      select.options.add(new Option('Cable of terminal segments (nm)', 'a50'));
      select.options.add(new Option('Norm. cable of terminal segments (nm)', 'a51'));
      select.options.add(new Option('Num. terminal segments', 'a52'));
      select.options.add(new Option('Num. branches', 'a53'));
      select.options.add(new Option('Cable of hillock (nm)', 'a54'));
      select.options.add(new Option('Cable of main dendritic shaft (nm)', 'a55'));

      if (this.pca) {
        for (var i=0; i<this.pca.length; ++i) {
          select.options.add(new Option('PC ' + (i+1) + ' - ' + Number(this.pca[i][0]).toFixed(2), 'p' + i));
        }
      } else {
        for (var i=0; i<2; ++i) {
          select.options.add(new Option('PC ' + (i+1), 'p' + i));
        }
      }

      if (preserve_indices) select.selectedIndex = index;

      return select;
    }).bind(this);

    var sel1 = updateSelect($('#circuit_graph_plot_X_' + this.widgetID)[0]),
        sel2 = updateSelect($('#circuit_graph_plot_Y_' + this.widgetID)[0]);
   
    if (!preserve_indices) {
      if (this.vectors.length > 0) {
        sel1.selectedIndex = 1;
        sel2.selectedIndex = 0;
      } else {
        // Choose most discerning anatomical measurements
        sel1.selectedIndex = 5; // Segregation index
        sel2.selectedIndex = 14; // Cable of hillock
      }
    }
  };

  CircuitGraphPlot.prototype.clearGUI = function() {
    this.selected = {};
    $('#circuit_graph_plot_div' + this.widgetID).empty();

    $('#circuit_graph_plot_X_' + this.widgetID)[0].options.length = 0;
    $('#circuit_graph_plot_Y_' + this.widgetID)[0].options.length = 0;
  };

  CircuitGraphPlot.prototype.getVectors = function() {
    if (!this.ids || 0 === this.ids.length) return;
    
    var xSelect = $('#circuit_graph_plot_X_' + this.widgetID)[0],
        ySelect = $('#circuit_graph_plot_Y_' + this.widgetID)[0];

    var f = (function(select) {
      var index = select.selectedIndex;
      if (this.vectors && index < this.vectors.length) {
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
        reroot_at_soma = this.reroot_at_soma,
        sigma = this.sigma,
        //bandwidth = this.bandwidth,
        prune = this.prune_bare_terminal_segments;

    fetchSkeletons(
        Object.keys(this.getSkeletonModels()).map(Number),
        function(skid) {
          return CATMAID.makeURL(project.id + '/' + skid + '/1/1/' + (reroot_at_soma ? 1 : 0) + '/compact-arbor');
        },
        function(skid) { return {}; },
        function(skid, json) {
          var ap = new CATMAID.ArborParser().init('compact-arbor', json),
              arbor = ap.arbor;

          // Reroot at soma if possible and necessary
          if (reroot_at_soma) {
            var soma = json[2]['soma'];
            if (soma && 1 === soma.length && soma[0] !== arbor.soma) {
              arbor.reroot(soma[0]);
            }
          }

          // Prune away terminal branches labeled at the end node with "not a branch",
          // reassigning any synapses to the nearest branch node.
          ap.collapseArtifactualBranches(json[2]);

          // Remove empty terminal branches that could introduce noise into asymmetry measurements. Many of these should have already been eliminated by collapseArtifactualBranches if they were appropriately labeled with "not a branch".
          if (prune) {
            arbor.pruneBareTerminalSegments($.extend({}, ap.inputs, ap.outputs));
          }


          // Cache functions that are invoked multiple times
          ap.cache(['childrenArray', 'allSuccessors', 'findBranchAndEndNodes', 'partitionSorted']);

          // Hack: replace by native ints
          ap.arbor.__cache__['childrenArray'] = new Uint32Array(ap.arbor.__cache__['childrenArray']);

          var smooth_positions = arbor.smoothPositions(ap.positions, sigma),
              smooth_cable = Math.round(arbor.cableLength(smooth_positions, sigma)) | 0,
              n_inputs = ap.n_inputs,
              n_outputs = ap.n_outputs;

          // Release
          delete ap.positions;

          // Compute amount of cable of the terminal segments
          var terminal = arbor.terminalCableLength(smooth_positions),
              terminal_cable = terminal.cable,
              n_branches = terminal.n_branches, // total branches, not just terminal
              n_terminal_segments = terminal.n_ends;

          // Compute length of hillock: part of the cable with maximum flow centrality.
          // Increase robustness to occasional synapse on the hillock or small side branch, by using cable with more than 75% of the max value.
          var flow_based = (function(ap, positions) {
            var flow_centrality = ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs),
                hillock_cable = 0,
                main_dendritic_shaft_cable = 0,
                segregationIndex = 0;
            if (flow_centrality) {
              var nodes = Object.keys(flow_centrality),
                  maxF = 0,
                  maxP = 0;
              for (var i=0; i<nodes.length; ++i) {
                var node = nodes[i],
                    fc = flow_centrality[node].centrifugal,
                    fp = flow_centrality[node].centripetal;
                if (fc > maxF) maxF = fc;
                if (fp > maxP) maxP = fp;
              }

              var thresholdF1 = 0.8 * maxF,
                  thresholdP1 = 0.8 * maxP,
                  above = [],
                  thresholdF2 = 0.9 * maxF;
              for (var i=0; i<nodes.length; ++i) {
                var node = nodes[i],
                    cf = flow_centrality[node].centrifugal,
                    cp = flow_centrality[node].centripetal;
                if (cf > thresholdF1) {
                  if (cf > thresholdF2) above.push(node);
                  var paren = arbor.edges[node];
                  if (undefined === paren) continue;
                  hillock_cable += positions[node].distanceTo(positions[paren]);
                }
                if (cp > thresholdP1) {
                  var paren = arbor.edges[node];
                  if (undefined === paren) continue;
                  main_dendritic_shaft_cable += positions[node].distanceTo(positions[paren]);
                }
              }

              var cut = SynapseClustering.prototype.findAxonCut(arbor, ap.outputs, above, positions);
              if (cut) {
                var cluster1 = arbor.subArbor(cut).nodes(),
                    cluster2 = arbor.nodesArray().filter(function(node) {
                      return undefined === cluster1[node];
                    });
                segregationIndex = SynapseClustering.prototype.segregationIndex({0: Object.keys(cluster1), 1: cluster2}, ap.outputs, ap.inputs);
              }
            }
            return {hillock_cable: hillock_cable,
                    main_dendritic_shaft_cable: main_dendritic_shaft_cable,
                    segregationIndex: segregationIndex};
          })(ap, smooth_positions);

          // Compute length of principal branch
          var plen = (function(arbor, positions) {
            var principal = (function(ps) { return ps[ps.length -1]; })(arbor.partitionSorted()),
                pCable = 0,
                loc1 = positions[principal[0]];
            for (var i=1, l=principal.length; i<l; ++i) {
              var loc2 = positions[principal[i]];
              pCable += loc1.distanceTo(loc2);
              loc1 = loc2;
            }
            return pCable;
          })(arbor, smooth_positions);

          /*
          // Compute synapse segregation index
          // Most costly operation of all, consumes about 40% of the anatomy time
          var segIndex = (function(arbor, positions, outputs, inputs, bandwidth) {
            var synapse_map = Object.keys(outputs).reduce(function(m, node) {
              var no = outputs[node],
                  ni = m[node];
              if (ni) m[node] = ni + no;
              else m[node] = no;
              return m;
            }, $.extend({}, inputs));
            var sc = new SynapseClustering(arbor, positions, synapse_map, bandwidth);
            return sc.segregationIndex(
              sc.clusters(sc.densityHillMap()),
              outputs,
              inputs);
          })(arbor, smooth_positions, ap.outputs, ap.inputs, bandwidth);
          */

          // Compute subtree asymmetries
          var asymIndex = arbor.asymmetryIndex(),
              cableAsymIndex = arbor.cableAsymmetryIndex(smooth_positions),
              outputAsymIndex = arbor.loadAsymmetryIndex(ap.outputs),
              inputAsymIndex = arbor.loadAsymmetryIndex(ap.inputs);

          measurements[skid] = [smooth_cable,
                                plen,
                                ap.n_inputs,
                                ap.n_outputs,
                                flow_based.segregationIndex,
                                asymIndex,
                                cableAsymIndex,
                                outputAsymIndex,
                                inputAsymIndex,
                                terminal_cable,
                                n_terminal_segments,
                                n_branches,
                                flow_based.hillock_cable,
                                flow_based.main_dendritic_shaft_cable];
        },
        function(skid) {
          // Failed to load
          CATMAID.msg("ERROR", "Skeleton #" + skid + " failed to load.");
          measurements[skid] = null;
        },
        (function() {
          // Done loading all
          // 0: smooth cable length
          // 1: smooth cable length minus principal branch length
          // 2: number of inputs
          // 3: number of outputs
          // 4: ratio (I - O) / (I + O)
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
          // 51: Normalized cable of terminal segments
          // 52: number of terminal segments
          // 53: number of total branches
          // 54: length of the hillock cable
          // 55: length of main dendritic shaft cable
          var n = this.models.length,
              vs = [];
          for (var i=0; i<56; ++i) vs[i] = new Float64Array(n);

          this.models.forEach(function(models, k) {
            var len = models.length;
            if (1 === len) {
              var m = measurements[models[0].id];
              if (!m) return;
              vs[0][k] = m[0];
              vs[1][k] = m[0] - m[1];
              vs[2][k] = m[2];
              vs[3][k] = m[3];
              vs[4][k] = 0 === (m[2] + m[3]) ? 0 : ((m[2] - m[3]) / (m[2] + m[3]));
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
              }
              vs[50][k] = m[9];
              vs[51][k] = m[9] / m[0];
              vs[52][k] = m[10];
              vs[53][k] = m[11];
              vs[54][k] = m[12];
              vs[55][k] = m[13];
            } else {
              models.forEach(function(model) {
                var m = measurements[model.id];
                if (!m) return;
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
                }
                vs[50][k] += m[9];
                // vs[51] taken care of at the end
                vs[52][k] += m[10];
                vs[53][k] += m[11];
                vs[54][k] += m[12];
                vs[55][k] += m[13];
              });

              // Compute I/O ratio
              var sum = vs[2][k] + vs[3][k];
              vs[4][k] = 0 === sum ? 0 : (vs[2][k] - vs[3][k]) / sum;
              // Divide those that are weighted by cable
              for (var i=5, v0=vs[0][k]; i<10; ++i) vs[i][k] /= v0;
              // Compute normalized cable of terminal segments
              vs[51][k] = vs[50][k] / vs[0][k];
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

      if (0 === graph.number_of_edges()) {
        this.centralities[0] = new Uint8Array(this.ids.length);
        return;
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
              name: (models.length > 1 ? this.names[i] : CATMAID.NeuronNameService.getInstance().getName(id)), // groups retain their name
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
    var zoom = d3.behavior.zoom().x(xR).y(yR).on("zoom", zoomed);

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
        .style("shape-rendering", "crispEdges")
        .call(xAxis);
    xg.selectAll("path")
        .attr("fill", "none")
        .attr("stroke", "black");
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
        .style("shape-rendering", "crispEdges")
        .call(yAxis);
    yg.selectAll("path")
        .attr("fill", "none")
        .attr("stroke", "black");
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
    CATMAID.svgutil.saveDivSVG('circuit_graph_plot_div' + this.widgetID,
        "circuit_plot.svg");
  };

  CircuitGraphPlot.prototype.exportCSV = function() {
    // TODO this.getVectors could launch a continuation
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

  CircuitGraphPlot.prototype.loadAll = function(callback) {
    var pairs = [[this.anatomy, 'loadAnatomy'],
                 [this.centralities[0], 'loadBetweennessCentrality'],
                 [this.pca, 'loadPCA']];

    for (var i=0; i<pairs.length; ++i) {
      if (!pairs[i][0]) {
        return this[pairs[i][1]]((function() {
          this.loadAll(callback);
        }).bind(this));
      }
    }
    if (callback) callback();
  };

  CircuitGraphPlot.prototype.exportCSVAll = function() {
    if (!this.ids || 0 === this.ids.length) return;
    // Load everything if not there yet
    this.loadAll((function() {
      var m = [],
          i = 1;
      // Neuron names
      m.push(this.names.map(function(name) { return name.replace(/,/g, ";"); }));
      m.push(this.ids);
      // Signal flow
      m.push(this.vectors[0][1]);
      // Eigenvectors
      for (; i<11 && i<this.vectors.length; ++i) {
        if (-1 === this.vectors[i][0]) break; // graph partitions
        m.push(this.vectors[i][1]);
      }
      // Graph partitions
      m.push(this.vectors[i][1]);
      m.push(this.vectors[i+1][1]);
      // Betweenness centrality
      m.push(this.centralities[0]);
      // Anatomy without the histograms
      m = m.concat(this.anatomy.slice(0, 10))
           .concat(this.anatomy.slice(50, 56));
      // PCA
      for (i=0; i<this.pca.length; ++i) {
        m.push(this.pca[i][1]);
      }

      var csv = numeric.transpose(m).map(function(row) { return row.join(','); }).join('\n');

      // Pulldown menus to grab titles
      var xSelect = $('#circuit_graph_plot_X_' + this.widgetID)[0],
          titles = [];
      for (var i=0; i<xSelect.length; ++i) titles.push(xSelect[i].text);
      var blob = new Blob(["neuron,skeleton_id," + titles.join(',') + "\n", csv], {type :'text/plain'});
      saveAs(blob, "circuit_plot_all.csv");
    }).bind(this));
  };

  CircuitGraphPlot.prototype.adjustOptions = function() {
    var od = new CATMAID.OptionsDialog("Parameters");
    od.appendField(
        "Smooth skeletons by Gaussian convolution with sigma (nm): ",
        "CGP-sigma" + this.widgetID,
        this.sigma);
    //od.appendField(
    //    "Bandwidth for synapse clustering (nm): ",
    //    "CGP-bandwidth" + this.widgetID,
    //    this.bandwidth);
    od.appendCheckbox(
        "Reroot at soma (if soma tag present)",
        "CGP-reroot-" + this.widgetID,
        this.reroot_at_soma);
    od.appendCheckbox(
        "Prune synapse-less terminal segments",
        "CGP-prune-" + this.widgetID,
        this.prune_bare_terminal_segments);
    od.appendMessage('Measurements for PCA:');

    var update_pca = false;

    ['pca_graph',
     'pca_anatomy_relative',
     'pca_anatomy_absolute',
     'pca_synapses_relative',
     'pca_synapses_absolute'].forEach(function(group) {
       var name = group.substring(4).replace(/_/, ' ');
       od.appendMessage(name[0].toUpperCase() + name.substring(1) + ' parameters:');
       var params = this[group],
           cb = od.appendCheckbox('ALL', name + this.widgetID, Object.keys(params).reduce(function(o, key) { return o && params[key]; }, true)),
           cbs = Object.keys(params).map(function(p) {
         var c = od.appendCheckbox(p, p.replace(/ /g, '-') + this.widgetID, params[p]);
         c.onchange = function() {
           params[p] = c.checked;
           update_pca = true;
         };
         return c;
       }, this);

       cb.onchange = function() {
         cbs.forEach(function(c) { c.checked = cb.checked; });
         Object.keys(params).forEach(function(key) { params[key] = cb.checked; });
         update_pca = true;
       };
     }, this);

    // May end up updating PCA more than necessary, but it does not matter.

    od.onOK = (function() {
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
          //update2 = read('bandwidth'),
          reroot = $('#CGP-reroot-' + this.widgetID)[0].checked,
          prune = $('#CGP-prune-' + this.widgetID)[0].checked;

      // Label for reloading upon redraw
      if (update1 || /*update2 ||*/ prune != this.prune_bare_terminal_segments || reroot != this.reroot_at_soma) {
        this.anatomy = null;
        update_pca = true;
      }

      this.prune_bare_terminal_segments = prune;
      this.reroot_at_soma = reroot;

      if (update_pca) this.pca = null;

      if (update1 || /*update2 ||*/ update_pca) this.redraw();


    }).bind(this);

    od.show(300, 400, true);
  };

  /** Perform PCA on a set of parameters based on morphology only, rather than connectivity. */
  CircuitGraphPlot.prototype.loadPCA = function(callback) {
    var any = function(params) {
      return Object.keys(params).some(function(key) {
        return params[key];
      });
    };

    if ( (   any(this.pca_anatomy_absolute)
          || any(this.pca_anatomy_relative)
          || any(this.pca_synapses_absolute)
          || any(this.pca_synapses_relative))
        && !this.anatomy) {
      return this.loadAnatomy(this.loadPCA.bind(this, callback));
    }
    if (this.pca_graph['Betweenness centrality'] && !this.centralities[0]) {
      return this.loadBetweennessCentrality(this.loadPCA.bind(this, callback));
    }

    // Normalize histograms spread across multiple arrays
    var normalize = function(a, first, last) {
      var n_rows = last - first + 1,
          n_cols = a[first].length,
          vs = new Array(n_rows);
      for (var i=0; i<n_rows; ++i) vs[i] = new Float64Array(n_cols);
      // For every column, add up all the rows, and divide
      for (var col=0; col<n_cols; ++col) {
        var sum = 0;
        for (var row=0; row<n_rows; ++row) {
          sum += a[first + row][col];
        }
        for (var row=0; row<n_rows; ++row) {
          vs[row][col] = a[first + row][col] / sum;
        }
      }
      return vs;
    };

    var M = [];
    if (this.pca_graph['Graph']) {
      // signal flow
      // eigenvalues of the graph Laplacian of the adjacency matrix
      for (var i=0; i<this.vectors.length; ++i) M.push(this.vectors[i][1]);
    }

    if (this.pca_graph['Betweenness centrality']) {
      // betweenness centrality
      for (var i=0; i<this.centralities.length; ++i) M.push(this.centralities[i]);
    }

    if (this.pca_anatomy_absolute['Cable length']) M.push(this.anatomy[0]);
    if (this.pca_anatomy_absolute['Cable minus principal branch']) M.push(this.anatomy[1]);
    if (this.pca_anatomy_relative['Asymmetry index']) M.push(this.anatomy[6]);
    if (this.pca_anatomy_absolute['Histogram of asymmetry index']) {
      for (var i=10; i<20; ++i) {
        M.push(this.anatomy[i]);
      }
    }
    if (this.pca_anatomy_relative['Normalized histogram of asymmetry index']) {
      normalize(this.anatomy, 10, 19).forEach(function(v) { M.push(v); });
    }
    if (this.pca_anatomy_relative['Cable asymmetry index']) M.push(this.anatomy[7]);
    if (this.pca_anatomy_absolute['Histogram of cable asymmetry index']) {
      for (var i=20; i<30; ++i) {
        M.push(this.anatomy[i]);
      }
    }
    if (this.pca_anatomy_relative['Normalized histogram of cable asymmetry index']) {
      normalize(this.anatomy, 20, 29).forEach(function(v) { M.push(v); });
    }
    if (this.pca_anatomy_absolute['Cable of terminal segments']) M.push(this.anatomy[50]);
    if (this.pca_anatomy_relative['Normalized cable of terminal segments']) M.push(this.anatomy[51]);
    if (this.pca_anatomy_absolute['Num. terminal segments']) M.push(this.anatomy[52]);
    if (this.pca_anatomy_absolute['Num. of branches']) M.push(this.anatomy[53]);

    if (this.pca_synapses_absolute['Num. of inputs']) M.push(this.anatomy[2]);
    if (this.pca_synapses_absolute['Num. of outputs']) M.push(this.anatomy[3]);
    if (this.pca_synapses_relative['Ratio (I - O) / (I + O)']) M.push(this.anatomy[4]);

    if (this.pca_synapses_relative['Segregation index']) M.push(this.anatomy[5]);
    if (this.pca_synapses_relative['Output asymmetry index']) M.push(this.anatomy[8]);
    if (this.pca_synapses_absolute['Histogram of output asymmetry index']) {
        for (var i=30; i<40; ++i) {
          M.push(this.anatomy[i]);
        }
    }
    if (this.pca_anatomy_relative['Normalized histogram of output asymmetry index']) {
      normalize(this.anatomy, 30, 39).forEach(function(v) { M.push(v); });
    }
    if (this.pca_synapses_relative['Input asymmetry index']) M.push(this.anatomy[9]);
    if (this.pca_synapses_absolute['Histogram of input asymmetry index']) {
        for (var i=40; i<50; ++i) {
          M.push(this.anatomy[i]);
        }
    }
    if (this.pca_anatomy_relative['Normalized histogram of input asymmetry index']) {
      normalize(this.anatomy, 40, 49).forEach(function(v) { M.push(v); });
    }
    if (this.pca_synapses_absolute['Cable of hillock']) M.push(this.anatomy[54]);
    if (this.pca_synapses_absolute['Cable of main dendritic shaft']) M.push(this.anatomy[55]);

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

    var variance = svd.S.reduce(function(sum, s) { return sum + s; }),
        cutoff = svd.S.reduce(function(o, s, i) {
          if (o.index) return o;
          o.sum += s;
          if (o.sum / variance > 0.98) o.index = i;
          return o;
        }, {sum: 0}).index + 1,
        n_pc = cutoff < 2 ? 2 : cutoff;

    this.pca = numeric.dot(svd.U.slice(0, n_pc), M.slice(0, n_pc)).map(function(v, i) {
      return [svd.S[i], v];
    });

    // Restore default
    //numeric.epsilon = epsilon;

    this.updatePulldownMenus(true);

    if ('function' === typeof callback) callback();
  };

  CircuitGraphPlot.prototype.clearSelection = function() {
    this.selected = {};
    this.redraw();
  };

  // Export circuit graph plot
  CATMAID.CircuitGraphPlot = CircuitGraphPlot;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Circuit Graph Plot",
    key: "circuit-graph-plot",
    creator: CATMAID.CircuitGraphPlot,
    description: "Plot various skeleton properties with respect to each other"
  });

})(CATMAID);
