/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var AnalyzeArbor = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.table = null;
  this.skeleton_ids = [];
  this.arbor_stats = [];

  this.pie_radius = 100;
  this.plot_width = 300;
  this.plot_height = 300;
};

AnalyzeArbor.prototype = {};
$.extend(AnalyzeArbor.prototype, new InstanceRegistry());
$.extend(AnalyzeArbor.prototype, new SkeletonSource());

AnalyzeArbor.prototype.getName = function() {
  return "Analyze Arbor " + this.widgetID;
};

AnalyzeArbor.prototype.destroy = function() {
  delete this.linkTarget;
  this.clear(); // clear after clearing linkTarget, so it doesn't get cleared
  this.unregisterInstance();
  this.unregisterSource();
  NeuronNameService.getInstance().unregister(this);
};

AnalyzeArbor.prototype.update = function() {
  var skids = this.skeleton_ids,
      models = this.getSelectedSkeletonModels();
  this.clear();
  this.appendOrdered(skids, models);
};

AnalyzeArbor.prototype.clear = function() {
  this.table.fnClearTable();
  $('#analyze_widget_charts_div' + this.widgetID).empty();
  this.skeleton_ids = [];
  this.arbor_stats = [];
};

AnalyzeArbor.prototype.removeSkeletons = function() {};
AnalyzeArbor.prototype.updateModels = function() {};
AnalyzeArbor.prototype.highlight = function(skeleton_id) {
  // TODO highlight row
};

AnalyzeArbor.prototype.getSelectedSkeletons = function() {
  return this.skeleton_ids.slice(0);
};

AnalyzeArbor.prototype.getSkeletonColor = function() {
  return ActiveSkeleton.prototype.getSkeletonColor();
};

AnalyzeArbor.prototype.hasSkeleton = function(skeleton_id) {
  return -1 !== this.skeleton_ids.indexOf(skeleton_id);
};

AnalyzeArbor.prototype.createModel = function(skeleton_id) {
  var name = NeuronNameService.getInstance().getName(skeleton_id);
  return new SelectionTable.prototype.SkeletonModel(skeleton_id, name, this.getSkeletonColor());
};

AnalyzeArbor.prototype.getSelectedSkeletonModels = function() {
  return this.skeleton_ids.reduce((function(o, skid) {
    o[skid] = this.createModel(skid);
    return o;
  }).bind(this), {});
};

AnalyzeArbor.prototype.getSkeletonModels = AnalyzeArbor.prototype.getSelectedSkeletonModels;

AnalyzeArbor.prototype.updateNeuronNames = function() {
  this.skeleton_ids.forEach(function(skid, i) {
    this.table.fnUpdate(NeuronNameService.getInstance().getName(skid), i, 0);
  }, this);
};


AnalyzeArbor.prototype.init = function() {
  this.table = $('#analyzearbor' + this.widgetID).dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": false, // Enable sorting locally, and prevent sorting from calling the fnServerData to reload the table -- an expensive and undesirable operation.
      "bAutoWidth": false,
      "iDisplayLength": -1,
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
      //"aLengthChange": false,
      "bJQueryUI": true,
      "aoColumns": [{bSearchable: true, bSortable: true}].concat((function() {
        var a = [];
        for (var i=0; i<20; ++i) a.push({bSearchable: true, bSortable: true});
        return a;
      })()),
  });

  this.table.fnClearTable();

  // Fix CSS
  $("#analyzearbor" + this.widgetID + "_wrapper")[0].style.minHeight = "0px";
};

AnalyzeArbor.prototype.append = function(models) {
  this.appendOrdered(Object.keys(models), models);
};

AnalyzeArbor.prototype.appendOrdered = function(skids, models) {
  NeuronNameService.getInstance().registerAll(this, models, (function() {
    fetchSkeletons(
        skids,
        function(skid) { return django_url + project.id + '/' + skid + '/1/1/1/compact-arbor-with-minutes'; },
        function(skid) { return {}; },
        this.appendOne.bind(this),
        function(skid) { growlAlert("ERROR", "Failed to load skeleton #" + skid); },
        this.updateCharts.bind(this))
  }).bind(this));
};

/** json: from URL compact-arbor (nodes, synapses and tags). */
AnalyzeArbor.prototype.appendOne = function(skid, json) {
  var tags = json[2],
      microtubules_end = tags['microtubules end'],
      mitochondrium = tags['mitochondrium'];

  if (!microtubules_end || 0 === microtubules_end.length) {
    return alert("Skeleton #" + skid + " does not have any node tagged 'microtubules end'.");
  }

  if (!mitochondrium) mitochondrium = [];

  var ap = new ArborParser(json).init('compact-arbor', json);
  // Collapse "not a branch"
  ap.collapseArtifactualBranches(tags);
  // Cache functions that are called many times
  ap.cache(["childrenArray", "allSuccessors"]);

  var minutes = json[3],
      inv_minutes = {};
  Object.keys(minutes).forEach(function(min) {
    minutes[min].forEach(function(nodeID) {
      inv_minutes[nodeID] = min;
    });
  });
  var countMinutes = function(nodes) {
    var mins = {};
    nodes.forEach(function(nodeID) { mins[inv_minutes[nodeID]] = true; });
    return Object.keys(mins).length;
  };
  var subtract = function(o1, o2) {
    var o = {};
    Object.keys(o1).forEach(function(key) {
      if (o2[key]) return;
      o[key] = o1[key];
    });
    return o;
  };

  var smooth_positions = ap.arbor.smoothPositions(ap.positions, 200, null),
      cable = ap.arbor.cableLength(smooth_positions),
      microtubules_end_nodes = microtubules_end.reduce(function(o, nodeID) { o[nodeID] = true; return o; }, {}),
      outputs = Object.keys(ap.outputs),
      inputs = Object.keys(ap.inputs),
      count = function(sum, nodeID) { return sum + this[nodeID]; },
      countOutputs = count.bind(ap.outputs),
      countInputs = count.bind(ap.inputs);

  // Detect and measure the backbone
  var backbone = ap.arbor.upstreamArbor(microtubules_end_nodes),
      bb_cable = backbone.cableLength(smooth_positions),
      bb_f = function(nodeID) { return backbone.contains(nodeID); },
      bb_n_outputs = outputs.filter(bb_f).reduce(countOutputs, 0),
      bb_n_inputs = inputs.filter(bb_f).reduce(countInputs, 0),
      bb_minutes = countMinutes(backbone.nodesArray()),
      bb_n_mitochondria = mitochondrium.filter(bb_f).length;

  var ad;

  var seen = {};

  var analyze_subs = function(subarbor) {
    // Detect and measure terminal subarbors of each kind (axonic and dendritic)
    var subs = [];
    microtubules_end.forEach(function(mend) {
      if (subarbor.contains(mend)) {
        var sub = subarbor.subArbor(mend),
            nodes = sub.nodesArray();
        // Check if any overlap due to mistakenly placing a tag in an already existing subarbor
        if (nodes.some(function(node) { return seen[node]; })) {
          // Error: subarbor has nodes that have already been seen
          var msg = "Subarbor rooted at node #" + sub.root + " shares nodes with other subarbors. Check the dendrogram.";
          growlAlert("WARNING", msg);
          console.log("WARNING", msg);
        }
        // Add the subarbor in any case
        nodes.forEach(function(node) { seen[node] = true; });
        subs.push(sub);
      }
    });
    var stats = {cables: [], depths: [], inputs: [], outputs: [], branches: [], ends: [], roots: [], n_subs: subs.length, input_depths: [], output_depths: []},
        edgeLength = function(child, paren) {
          return smooth_positions[child].distanceTo(smooth_positions[paren]);
        };
    subs.forEach(function(sub) {
      var nodes = sub.nodesArray(),
          be = sub.findBranchAndEndNodes();
      stats.cables.push(sub.cableLength(smooth_positions));
      var in_synapses = nodes.filter(function(node) { return ap.inputs[node]; }),
          out_synapses = nodes.filter(function(node) { return ap.outputs[node]; });
      stats.inputs.push(in_synapses.length);
      stats.outputs.push(out_synapses.length);
      stats.branches.push(Object.keys(be.branches).length);
      stats.ends.push(Object.keys(be.ends).length);
      var distance_to_root = sub.nodesDistanceTo(sub.root, edgeLength);
      stats.depths.push(distance_to_root.max);
      stats.roots.push(Number(sub.root));
      in_synapses.forEach(function(syn_node) {
        stats.input_depths.push(distance_to_root.distances[syn_node]);
      });
      out_synapses.forEach(function(syn_node) { 
        stats.output_depths.push(distance_to_root.distances[syn_node]);
      });
    });
    return stats;
  };

  // Measure minimal distances from each synapse to the nearest mitochondrium
  var analyze_synapse_mitochondrium = function() {
    if (mitochondrium.length > 0) {
      var mit = {};
      for (var k=0; k<mitochondrium.length; ++k) mit[mitochondrium[k]] = true;
      var distanceFn = function(child, paren) {
        return smooth_positions[child].distanceTo(smooth_positions[paren]);
      };
      return {pre: ap.arbor.minDistancesFromTo(ap.outputs, mit, distanceFn),
              post: ap.arbor.minDistancesFromTo(ap.inputs, mit, distanceFn)};
    }
    return {pre: {}, post: {}};
  };

  var can_split = false,
      axon_terminals = null;

  // Split by synapse flow centrality
  if (0 !== ap.n_outputs && 0 !== ap.n_inputs) {
    var fc = ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs),
        fc_max = Object.keys(fc).reduce(function(max, nodeID) {
          var c = fc[nodeID].centrifugal;
          return c > max ? c : max;
        }, 0),
        fc_plateau = Object.keys(fc).filter(function(nodeID) { return fc[nodeID].centrifugal === fc_max; }),
        cut = SynapseClustering.prototype.findAxonCut(ap.arbor, ap.outputs, fc_plateau, smooth_positions);
    if (cut) axon_terminals = ap.arbor.subArbor(cut);
  }

  if (axon_terminals) {
    // Detect and measure the axon
    var axon_terminals = ap.arbor.subArbor(cut),
        at_backbone = axon_terminals.upstreamArbor(microtubules_end_nodes),
        at_backbone_cable = at_backbone.cableLength(smooth_positions),
        at_cable = axon_terminals.cableLength(smooth_positions) - at_backbone_cable,
        at_f = function(nodeID) { return axon_terminals.contains(nodeID) && !at_backbone.contains(nodeID); },
        at_n_outputs = outputs.filter(at_f).reduce(countOutputs, 0),
        at_n_inputs = inputs.filter(at_f).reduce(countInputs, 0),
        at_minutes = countMinutes(Object.keys(subtract(axon_terminals.nodes(), at_backbone.nodes()))),
        at_n_mitochondria = mitochondrium.filter(at_f).length;

    // Detect and measure the dendrites
    var dendrites = ap.arbor.clone();
    axon_terminals.nodesArray().forEach(function(nodeID) {
      delete dendrites.edges[nodeID];
    });
    var d_backbone = dendrites.upstreamArbor(microtubules_end_nodes),
        d_backbone_cable = d_backbone.cableLength(smooth_positions),
        d_cable = dendrites.cableLength(smooth_positions) - d_backbone_cable,
        d_f = function(nodeID) { return dendrites.contains(nodeID) && !d_backbone.contains(nodeID); },
        d_n_outputs = outputs.filter(d_f).reduce(countOutputs, 0),
        d_n_inputs = inputs.filter(d_f).reduce(countInputs, 0),
        d_minutes = countMinutes(Object.keys(subtract(dendrites.nodes(), d_backbone.nodes()))),
        d_n_mitochondria = mitochondrium.filter(d_f).length;


    this.arbor_stats[skid] = {axonal: analyze_subs(axon_terminals),
                              dendritic: analyze_subs(dendrites),
                              syn_mit: analyze_synapse_mitochondrium()};

    ad = [Math.round(d_cable) | 0,
          d_n_inputs,
          d_n_outputs,
          d_minutes,
          d_n_mitochondria,
          Math.round(at_cable) | 0,
          at_n_inputs,
          at_n_outputs,
          at_minutes,
          at_n_mitochondria];
  } else {
    // Consider non-backbone parts as "dendrites"
    ad = [Math.round(cable - bb_cable) | 0,
          ap.n_inputs - bb_n_inputs,
          ap.n_outputs - bb_n_outputs,
          countMinutes(Object.keys(subtract(ap.arbor.nodes(), backbone.nodes()))),
          mitochondrium.length - bb_n_mitochondria,
          0,
          0,
          0,
          0,
          0];

    this.arbor_stats[skid] = {axonal: null,
                              dendritic: analyze_subs(ap.arbor),
                              syn_mit: analyze_synapse_mitochondrium()};
  }

  var row = [NeuronNameService.getInstance().getName(skid),
             Math.round(cable) | 0,
             ap.n_inputs,
             ap.n_outputs,
             Object.keys(minutes).length,
             mitochondrium.length,
             Math.round(bb_cable) | 0,
             bb_n_inputs,
             bb_n_outputs,
             bb_minutes,
             bb_n_mitochondria].concat(ad);


  this.table.fnAddData(row);
  this.skeleton_ids.push(Number(skid));
};

/** Must run after the table is filled in. */
AnalyzeArbor.prototype.updateCharts = function() {
  // Prepare
  var divID = '#analyze_widget_charts_div' + this.widgetID;
  $(divID).empty();
  if (!this.table) return;
  var rows = this.table.fnGetData();
  if (rows.length < 1) return;
  
  // Create pie charts: summary of total each kind (cable, input, output) separated by region
  var rows = this.table.fnGetData(),
      sums = rows[0].map(function() { return 0; });
  for (var k=0; k<rows.length; ++k) {
    var row = rows[k];
    for (var i=1; i<sums.length; ++i) sums[i] += row[i];
  }

  var titles = ["Backbone", "Dendritic terminals", "Axon terminals"],
      colors = ["#aaaaaa", "#00ffff", "#ff0000"];

  var makePie = (function(offset, title) {
    var entries = [];
    [6, 11, 16].forEach(function(k, i) {
      var sum = sums[k + offset];
      if (sum > 0) entries.push({name: titles[i], value: sum, color: colors[i]});
    });
    if (entries.length > 0) {
      SVGUtil.insertPieChart(divID, this.pie_radius, entries, title);
    }
  }).bind(this);

  var pie_cable = makePie(0, "Cable (nm)"),
      pie_inputs = makePie(1, "# Inputs"),
      pie_outputs = makePie(2, "# Outputs"),
      pie_mitochondria = makePie(4, "# mitochondria");


  // Create histograms of terminal subarbors:
  var skids = Object.keys(this.arbor_stats);

  // Create a pie with the number of terminal subarbors
  var n_subs = ["dendritic", "axonal"].map(function(type) {
    return skids.reduce((function(sum, skid) {
      var s = this.arbor_stats[skid][type];
      return sum + (s ? s.n_subs : 0);
    }).bind(this), 0);
  }, this);

  var pie_n_subarbors = SVGUtil.insertPieChart(
      divID,
      this.pie_radius,
      [{name: titles[1] + "(" + n_subs[0] + ")", value: n_subs[0], color: colors[1]}].concat(0 === n_subs[1] ? [] : [{name: titles[2] + "(" + n_subs[1] + ")", value: n_subs[1], color: colors[2]}]), // there could be no axonal terminals
      "# Subarbors (" + (n_subs[0] + n_subs[1]) + ")");

  if (skids.length > 1) {
    var colors = d3.scale.category10();
    SVGUtil.insertPieChart(
        divID,
        this.pie_radius,
        skids.map(function(skid, i) {
          var e = this.arbor_stats[skid],
              sum = e.dendritic.n_subs + (e.axonal ? e.axonal.n_subs : 0);
          return {name: NeuronNameService.getInstance().getName(skid) + " (" + sum + ")",
                  value: sum,
                  color: colors(i)};
        }, this),
        "# Subarbors");
  }

  // Binarize two arrays simultaneously
  var binarizeTwo = function(a1, a2, inc) {
    var max = 0,
        binarize = function(bins, v) {
          max = Math.max(max, v);
          var bin = bins[v];
          if (bin) bins[v] += 1;
          else bins[v] = 1;
          return bins;
        };
    var bins1 = a1.reduce(binarize, {}),
        bins2 = a2.reduce(binarize, {});
    // Add missing bins and populate axis
    var axis = [];
    for (var bin=0; bin<=max; bin+=inc) {
      var b1 = bins1[bin],
          b2 = bins2[bin];
      if (!b1) bins1[bin] = 0;
      if (!b2) bins2[bin] = 0;
      axis.push(bin);
    }
    return {axis: axis,
            bins1: bins1,
            bins2: bins2,
            max: max};
  };

  (function() {
    // Histograms of total [cables, inputs, outputs, branches, ends] for axonal vs dendritic terminal subarbors, and histograms of depth of individual synapses in the terminal subarbors.
    var hists = ['cables', 'depths', 'inputs', 'outputs', 'branches', 'ends', 'input_depths', 'output_depths'],
        axonal = hists.reduce(function(o, label) { o[label] = []; return o}, {}),
        dendritic = hists.reduce(function(o, label) { o[label] = []; return o}, {}), // needs deep copy
        cable_labels = ["cables", "depths", "input_depths", "output_depths"];
    skids.forEach(function(skid) {
      var e = this.arbor_stats[skid];
      hists.forEach(function(label) {
        // axonal won't exist for a neuron without outputs like a motor neuron or a dendritic fragment
        if (e.axonal) axonal[label] = axonal[label].concat(e.axonal[label]);
        dendritic[label] = dendritic[label].concat(e.dendritic[label]);
      }, this);
    }, this);
    hists.forEach(function(label) {
      var a = axonal[label],
          d = dendritic[label],
          inc = 1;
      if (-1 !== cable_labels.indexOf(label)) {
        // round to 1 micron increments
        inc = 1000;
        var round = function(v) { return v - v % inc; }; 
        a = a.map(round);
        d = d.map(round);
      }
      // Binarize
      var b = binarizeTwo(d, a, inc),
          data = [b.bins1, b.bins2],
          x_axis = b.axis,
          max = b.max;
      //
      var rotate_x_axis_labels = false;
      if (-1 !== cable_labels.indexOf(label)) {
        // From nanometers to microns
        x_axis = x_axis.map(function(bin) { return bin/1000 + "-" + (bin + inc)/1000; });
        label = label + " (µm)";
        rotate_x_axis_labels = true;
      }

      // Prettify label
      label = label.replace(/_/g, ' ');

      SVGUtil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label,
        this.plot_width, this.plot_height,
        label, "counts",
        data,
        ["dendritic", "axonal"],
        ["#00ffff", "#ff0000"],
        x_axis, rotate_x_axis_labels,
        false);

      // Turn data into cummulative
      var cummulative = data.map(function(a, i) {
        var b = {},
            total = n_subs[i];
        // Hack: these are not by terminal subarbor
        if (0 === label.indexOf("input depths") || 0 === label.indexOf("output depths")) {
          total = 0;
          for (var bin=0; bin<=max; bin+=inc) total += a[bin];
        }

        if (0 === total) return a;
        b[0] = a[0] / total;
        for (var bin=inc; bin<=max; bin+=inc) b[bin] = b[bin - inc] + a[bin] / total;
        return b;
      });

      SVGUtil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label + ' cummulative',
        this.plot_width, this.plot_height,
        label, "cummulative counts (%)",
        cummulative,
        ["dendritic", "axonal"],
        ["#00ffff", "#ff0000"],
        x_axis, rotate_x_axis_labels,
        false);
    }, this);
  }).bind(this)();

  (function() {
    // Add XY scatterplots of:
    // * cable vs depth
    // * cable vs inputs
    var colors = d3.scale.category10();
    var cable_vs_depth = [],
        cable_vs_inputs = [],
        series = [];
    skids.forEach(function(skid, k) {
      var stats = this.arbor_stats[skid],
          Entry = function(x, y, root) { this.x = x; this.y = y; this.root = root},
          neuron = {color: colors(k),
                    name : NeuronNameService.getInstance().getName(skid)};
      Entry.prototype = neuron;
      series.push(neuron);
      ["dendritic", "axonal"].forEach(function(type) {
        var s = stats[type];
        if (s) {
          s.cables.forEach(function(cable, i) {
            cable /= 1000; // in microns
            cable_vs_depth.push(new Entry(cable, s.depths[i] / 1000, s.roots[i])); // depth in microns
            cable_vs_inputs.push(new Entry(cable, s.inputs[i], s.roots[i]));
          });
        }
      });
    }, this);

    SVGUtil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-cable_vs_depth',
        550, 470,
        'cable (µm)', 'depth (µm)',
        cable_vs_depth,
        function(d) {
          SkeletonAnnotations.staticMoveToAndSelectNode(d.root);
        },
        series,
        false, true);

    SVGUtil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-cable_vs_inputs',
        550, 470,
        'cable (µm)', 'inputs',
        cable_vs_inputs,
        function(d) {
          SkeletonAnnotations.staticMoveToAndSelectNode(d.root);
        },
        series,
        false, true);
  }).bind(this)();

  (function() {
    // Histogram of distances from pre or post to a mitochondrium
    var pre = [],
        post = [],
        inc = 1000, // 1 micron
        round1 = function(o) {
          return Object.keys(o).map(function(node) {
            var v = o[node];
            return v - v % inc;
          });
        };

    skids.forEach(function(skid) {
      var stats = this.arbor_stats[skid];
      pre = pre.concat(round1(stats.syn_mit.pre));
      post = post.concat(round1(stats.syn_mit.post));
    }, this);

    // Binarize
    var b = binarizeTwo(pre, post, inc),
        data = [b.bins2, b.bins1],
        x_axis = b.axis.map(function(bin) { return bin/1000 + "-" + (bin + inc)/1000; }), // in microns rather than nanometers
        max = b.max,
        label = "Distance to nearest mitochondrium (µm)";

    SVGUtil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label,
      this.plot_width, this.plot_height,
      label, "counts",
      data,
      ["postsynaptic", "presynaptic"],
      ["#00ffff", "#ff0000"],
      x_axis, true,
      true);

    // As cummulative
    var cummulative = data.map(function(a, i) {
      var b = {},
          total = Object.keys(a).reduce(function(sum, bin) { return sum + a[bin]; }, 0);
      if (0 === total) return a;
      b[0] = a[0] / total;
      for (var bin=inc; bin<=max; bin+=inc) b[bin] = b[bin - inc] + a[bin] / total;
      return b;
    });

    SVGUtil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label + ' cummulative',
      this.plot_width, this.plot_height,
      label, "cummulative counts (%)",
      cummulative,
      ["postsynaptic", "presynaptic"],
      ["#00ffff", "#ff0000"],
      x_axis, true,
      true);
  }).bind(this)();
};

AnalyzeArbor.prototype.exportSVG = function() {
  var div = document.getElementById("analyze_widget_charts_div" + this.widgetID);
  if (!div) return;
  var svg = div.getElementsByTagName('svg');
  if (svg && svg.length > 0) {
    var xmlns = "http://www.w3.org/2000/svg";
    var all = document.createElementNS(xmlns, 'svg');
    var dx = 0,
        max_height = 0;
    for (var i=0; i<svg.length; ++i) {
      var g = document.createElementNS(xmlns, "g");
      g.setAttributeNS(null, "transform", "translate(" + dx + ", 0)");
      g.appendChild(svg[i].children[0].cloneNode(true));
      all.appendChild(g);
      dx += Number(svg[i].getAttributeNS(null, "width"));
      max_height = Math.max(max_height, Number(svg[i].getAttributeNS(null, "height")));
    }
    all.setAttributeNS(null, "width", dx);
    all.setAttributeNS(null, "height", max_height);
    var xml = new XMLSerializer().serializeToString(all);
    var blob = new Blob([xml], {type: 'text/xml'});
    saveAs(blob, "analyze_arbor_pie_charts.svg");
  }
};
