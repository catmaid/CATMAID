/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  fetchSkeletons,
  InstanceRegistry,
  project,
  SkeletonAnnotations,
  SynapseClustering,
*/

(function(CATMAID) {

  "use strict";

  var AnalyzeArbor = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.table = null;
    this.skeleton_ids = [];
    this.arbor_stats = {};

    this.pie_radius = 100;
    this.plot_width = 300;
    this.plot_height = 300;
    this.strahler_cut = 2; // to approximate twigs
    this.scatterplot_width = 650;
    this.scatterplot_height = 470;
    this.override_microtubules_end = false;
  };

  AnalyzeArbor.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  AnalyzeArbor.prototype.constructor = AnalyzeArbor;

  $.extend(AnalyzeArbor.prototype, new InstanceRegistry());

  AnalyzeArbor.prototype.getName = function() {
    return "Analyze Arbor " + this.widgetID;
  };

  AnalyzeArbor.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "table_analyze_arbor_widget_controls" + this.widgetID,
      contentID: "table_analyze_arbor_widget" + this.widgetID,
      createControls: function(controls) {
        controls.appendChild(document.createTextNode('From'));
        controls.appendChild(CATMAID.skeletonListSources.createSelect(this));

        var load = document.createElement('input');
        load.setAttribute("type", "button");
        load.setAttribute("value", "Append");
        load.onclick = this.loadSource.bind(this);
        controls.appendChild(load);

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

        var options = document.createElement('input');
        options.setAttribute("type", "button");
        options.setAttribute("value", "Options");
        options.onclick = this.adjustOptions.bind(this);
        controls.appendChild(options);

        var pies = document.createElement('input');
        pies.setAttribute("type", "button");
        pies.setAttribute("value", "Export charts as SVG");
        pies.onclick = this.exportSVG.bind(this);
        controls.appendChild(pies);
      },
      createContent: function(content) {
        content.innerHTML =
          '<table cellpadding="0" cellspacing="0" border="0" class="display" id="analyzearbor' + this.widgetID + '">' +
            '<thead>' +
              '<tr>' +
                '<th rowspan="2">Neuron name</th>' +
                '<th colspan="5">Arbor</th>' +
                '<th colspan="5">Backbone</th>' +
                '<th colspan="5">Dendrites</th>' +
                '<th colspan="5">Axon terminals</th>' +
              '</tr>' +
              '<tr>' +
                '<th>Cable (nm)</th>' +
                '<th>Inputs</th>' +
                '<th>Outputs</th>' +
                '<th>Time (min)</th>' +
                '<th>Mito -chondria</th>' +
                '<th>Cable (nm)</th>' +
                '<th>Inputs</th>' +
                '<th>Outputs</th>' +
                '<th>Time (min)</th>' +
                '<th>Mito -chondria</th>' +
                '<th>Cable (nm)</th>' +
                '<th>Inputs</th>' +
                '<th>Outputs</th>' +
                '<th>Time (min)</th>' +
                '<th>Mito -chondria</th>' +
                '<th>Cable (nm)</th>' +
                '<th>Inputs</th>' +
                '<th>Outputs</th>' +
                '<th>Time (min)</th>' +
                '<th>Mito -chondria</th>' +
              '</tr>' +
            '</thead>' +
          '</table>';

        content.appendChild(document.createElement('br'));

        var resultContainer = document.createElement('div');
        resultContainer.setAttribute('id', 'analyze_widget_charts_div' + this.widgetID);
        content.appendChild(resultContainer);
      },
      init: function() {
        this.init();
      }
    };
  };

  AnalyzeArbor.prototype.adjustOptions = function() {
    var params = ["strahler_cut",
                  "pie_radius",
                  "plot_width",
                  "plot_height",
                  "scatterplot_width",
                  "scatterplot_height"],
        titles = ["Approximate twigs by Strahler number: ",
                  "Pie radius: ",
                  "Histogram width: ",
                  "Histogram height: ",
                  "Scatterplot width: ",
                  "Scatterplot height: "];

    var od = new CATMAID.OptionsDialog("Parameters");
    params.forEach(function(param, i) {
      od.appendField(titles[i], "AA-" + param + "-" + this.widgetID, this[param]);
    }, this);

    od.appendCheckbox("Override 'microtubules end' and use Strahler number", "AA-override-" + this.widgetID, this.override_microtubules_end);

    od.onOK = (function() {
      var natural = (function(param) {
        var field = $("#AA-" + param + "-" + this.widgetID);
        try {
          var v = parseInt(field.val()) | 0;
          if (v < 0) return param.replace(/_/, " ") + " must be larger than zero.";
          return v;
        } catch (e) {
          return "Invalid value for " + param.replace(/_/, " ") + ": " + field.val();
        }
      }).bind(this);

      // Read values
      var values = params.map(natural);

      // Cancel if any was invalid
      var msgs = values.filter(function(v) { return !Number.isInteger(v); });
      if (msgs.length > 0) return alert("Errors:\n" + msgs.join('\n'));

      // Set new values
      var prev_strahler_cut = this.strahler_cut;
      params.forEach((function(param, i) { this[param] = values[i]; }), this);

      // Refresh or redraw
      var override = $('#AA-override-' + this.widgetID).prop('checked');
      if (override !== this.override_microtubules_end) {
        this.override_microtubules_end = override;
        this.update();
      } else {
        if (prev_strahler_cut !== this.strahler_cut) this.update();
        else this.updateCharts();
      }

    }).bind(this);

    od.show(400, 400, true);
  };

  AnalyzeArbor.prototype.destroy = function() {
    this.clear();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
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
    this.arbor_stats = {};
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
    return CATMAID.ActiveSkeleton.prototype.getSkeletonColor();
  };

  AnalyzeArbor.prototype.hasSkeleton = function(skeleton_id) {
    return -1 !== this.skeleton_ids.indexOf(skeleton_id);
  };

  AnalyzeArbor.prototype.createModel = function(skeleton_id) {
    var name = CATMAID.NeuronNameService.getInstance().getName(skeleton_id);
    return new CATMAID.SkeletonModel(skeleton_id, name, this.getSkeletonColor());
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
      this.table.fnUpdate(CATMAID.NeuronNameService.getInstance().getName(skid), i, 0);
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
        "aLengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
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
    CATMAID.NeuronNameService.getInstance().registerAll(this, models, (function() {
      fetchSkeletons(
          skids,
          function(skid) { return CATMAID.makeURL(project.id + '/' + skid + '/1/1/1/compact-arbor-with-minutes'); },
          function(skid) { return {}; },
          this.appendOne.bind(this),
          function(skid) { CATMAID.msg("ERROR", "Failed to load skeleton #" + skid); },
          this.updateCharts.bind(this));
    }).bind(this));
  };

  /** json: from URL compact-arbor (nodes, synapses and tags). */
  AnalyzeArbor.prototype.appendOne = function(skid, json) {
    var tags = json[2],
        microtubules_end = tags['microtubules end'],
        mitochondrium = tags['mitochondrium'];

    if (!mitochondrium) mitochondrium = [];

    var ap = new CATMAID.ArborParser(json).init('compact-arbor', json);
    // Collapse "not a branch"
    ap.collapseArtifactualBranches(tags);
    // Cache functions that are called many times
    ap.cache(["childrenArray", "allSuccessors", "findBranchAndEndNodes"]);

    var twigs_approx_by_strahler = false;

    if (!microtubules_end || 0 === microtubules_end.length || this.override_microtubules_end) {
      twigs_approx_by_strahler = true;
      microtubules_end = ap.arbor.approximateTwigRoots(this.strahler_cut);
    }

    if (!microtubules_end || 0 === microtubules_end.length) {
      return alert("Skeleton #" + skid + " does not have any node tagged 'microtubules end', nor can twigs be approximated by a Strahler number of " + this.strahler_cut);
    }

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
            var msg = "Twig rooted at node #" + sub.root + " of skeleton #" + skid + " shares nodes with other subarbors. Check the dendrogram.";
            CATMAID.msg("WARNING", msg);
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

    var axon_terminals = null,
        regions = null;

    // Split by synapse flow centrality
    if (0 !== ap.n_outputs && 0 !== ap.n_inputs) {
      regions = SynapseClustering.prototype.findArborRegions(
          ap.arbor,
          ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs),
          0.9);
      if (regions) {
        var cut = SynapseClustering.prototype.findAxonCut(ap.arbor, ap.outputs, regions.above, smooth_positions);
        if (cut) axon_terminals = ap.arbor.subArbor(cut);
      }
    }

    if (axon_terminals) {
      // Detect and measure the axon
      var axon_terminals = ap.arbor.subArbor(cut),
          at_backbone = axon_terminals.upstreamArbor(microtubules_end_nodes),
          at_backbone_cable = at_backbone.cableLength(smooth_positions) + smooth_positions[axon_terminals.root].distanceTo(smooth_positions[ap.arbor.edges[axon_terminals.root]]), // plus the edge to the parent node
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
          d_broad_backbone_cable = d_backbone.cableLength(smooth_positions),
          d_cable = dendrites.cableLength(smooth_positions) - d_broad_backbone_cable,
          d_f = function(nodeID) { return dendrites.contains(nodeID) && !d_backbone.contains(nodeID); },
          d_n_outputs = outputs.filter(d_f).reduce(countOutputs, 0),
          d_n_inputs = inputs.filter(d_f).reduce(countInputs, 0),
          d_minutes = countMinutes(Object.keys(subtract(dendrites.nodes(), d_backbone.nodes()))),
          d_n_mitochondria = mitochondrium.filter(d_f).length;

      this.arbor_stats[skid] = {axonal: analyze_subs(axon_terminals),
                                dendritic: analyze_subs(dendrites),
                                syn_mit: analyze_synapse_mitochondrium()};

      if (regions) {
        // Measure the true dendritic backbone length, which is the d_backbone minus the flow centrality plateau and zeros (aka the linker between dendrite and axon and the linker to the soma)
        var d_backbone_cable = 0,
            nodes = d_backbone.nodesArray(),
            outside = {},
            add = (function(node) { this[node] = true; }).bind(outside);
        regions.plateau.forEach(add);
        regions.zeros.forEach(add);
        for (var i=0; i<nodes.length; ++i) {
          var node = nodes[i];
          if (!outside[node]) {
            var paren = ap.arbor.edges[node];
            if (paren) d_backbone_cable += smooth_positions[node].distanceTo(smooth_positions[paren]);
          }
        }
        this.arbor_stats[skid].dendritic.backbone_cable = d_backbone_cable;
        console.log("true dendritic backbone cable", d_backbone_cable);
      } else {
        // Strangely rooted arbors may result in regions not being computable
        this.arbor_stats[skid].dendritic.backbone_cable = 0;
      }

      /* Tests
      console.log("arbor cable: ", cable);
      console.log("backbone cable + axonic twigs cable + dendritic twigs cable: ", bb_cable + at_cable + d_cable);
      console.log("backbone cable: ", bb_cable);
      console.log("axon backbone + broad dendrite backbone: ", at_backbone_cable + d_broad_backbone_cable);
      console.log("broad axon + broad dendrite: ", axon_terminals.cableLength(smooth_positions) + dendrites.cableLength(smooth_positions));
      console.log("broad dendrite backbone: ", d_broad_backbone_cable);
      var sumCable = function(sum, node) {
        var paren = ap.arbor.edges[node];
        if (paren) return sum + smooth_positions[node].distanceTo(smooth_positions[paren]);
        return sum;
      };
      console.log("true dendrite backbone + dendritic backbone zeros + plateau", this.arbor_stats[skid].dendritic.backbone_cable + regions.zeros.filter(function(node) { return d_backbone.contains(node); }).reduce(sumCable, 0) + regions.plateau.reduce(sumCable, 0));
      */


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

      // Approximate with total backbone cable minus regions without synapses
      var pruned = backbone.clone();
      var root_succ = pruned.successors(pruned.root);
      if (1 === root_succ.length) pruned.reroot(pruned.nextBranchNode(root_succ[0]));
      // Preserve backbone parts with synapses or twig roots
      var pins = {};
      [].concat(inputs, outputs, this.arbor_stats[skid].dendritic.roots).forEach(function(node) {
        this[node] = true;
      }, pins);
      pruned.pruneBareTerminalSegments(pins);
      this.arbor_stats[skid].dendritic.backbone_cable = pruned.cableLength(smooth_positions);
    }

    var row = [CATMAID.NeuronNameService.getInstance().getName(skid) + (twigs_approx_by_strahler ? " (twigs as Strahler<=" + this.strahler_cut + ")" : ""),
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
        CATMAID.svgutil.insertPieChart(divID, this.pie_radius, entries, title);
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

    var pie_n_subarbors = CATMAID.svgutil.insertPieChart(
        divID,
        this.pie_radius,
        [{name: titles[1] + "(" + n_subs[0] + ")", value: n_subs[0], color: colors[1]}].concat(0 === n_subs[1] ? [] : [{name: titles[2] + "(" + n_subs[1] + ")", value: n_subs[1], color: colors[2]}]), // there could be no axonal terminals
        "# Subarbors (" + (n_subs[0] + n_subs[1]) + ")");

    if (skids.length > 1) {
      var colors = d3.scale.category10();
      CATMAID.svgutil.insertPieChart(
          divID,
          this.pie_radius,
          skids.map(function(skid, i) {
            var e = this.arbor_stats[skid],
                sum = e.dendritic.n_subs + (e.axonal ? e.axonal.n_subs : 0);
            return {name: CATMAID.NeuronNameService.getInstance().getName(skid) + " (" + sum + ")",
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
          axonal = hists.reduce(function(o, label) { o[label] = []; return o; }, {}),
          dendritic = hists.reduce(function(o, label) { o[label] = []; return o; }, {}), // needs deep copy
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

        CATMAID.svgutil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label,
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

        CATMAID.svgutil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label + ' cummulative',
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
      // * twig cable vs depth
      // * twig cable vs inputs
      // * total cable vs number of twigs
      var colors = d3.scale.category10();
      var cable_vs_depth = [],
          cable_vs_inputs = [],
          series = [],
          neuron_colors = {};
      skids.forEach(function(skid, k) {
        var stats = this.arbor_stats[skid],
            Entry = function(x, y, root) { this.x = x; this.y = y; this.root = root; },
            neuron = {color: colors(k),
                      name : CATMAID.NeuronNameService.getInstance().getName(skid)};
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
        neuron_colors[skid] = neuron.color;
      }, this);

      var total_cable_vs_n_twigs = [],
          total_dendritic_backbone_cable_vs_dendritic_twigs = [];
      rows.forEach(function(row, i) {
        var skid = this.skeleton_ids[i],
            stats = this.arbor_stats[skid];
        total_cable_vs_n_twigs.push(
          {x: row[1] / 1000,
           y: stats.dendritic.n_subs + (stats.axonal ? stats.axonal.n_subs : 0),
           color: neuron_colors[skid],
           name: CATMAID.NeuronNameService.getInstance().getName(skid),
           skid: skid
          });
        total_dendritic_backbone_cable_vs_dendritic_twigs.push(
          {x: stats.dendritic.backbone_cable / 1000,
           y: stats.dendritic.n_subs,
           color: neuron_colors[skid],
           name: CATMAID.NeuronNameService.getInstance().getName(skid),
           skid: skid
          });
      }, this);

      CATMAID.svgutil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-cable_vs_depth',
          this.scatterplot_width, this.scatterplot_height,
          'cable (µm)', 'depth (µm)',
          cable_vs_depth,
          function(d) {
            SkeletonAnnotations.staticMoveToAndSelectNode(d.root);
          },
          series,
          false, true);

      CATMAID.svgutil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-cable_vs_inputs',
          this.scatterplot_width, this.scatterplot_height,
          'cable (µm)', 'inputs',
          cable_vs_inputs,
          function(d) {
            SkeletonAnnotations.staticMoveToAndSelectNode(d.root);
          },
          series,
          false, true);

      // Create plot of total cable length vs number of twigs
      CATMAID.svgutil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-cable_length_vs_n_twigs',
        this.scatterplot_width, this.scatterplot_height,
        'arbor cable (µm)', '# twigs',
        total_cable_vs_n_twigs,
        function(d) {
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', d.skid);
        },
        rows.map((function(row, i) { return {name: row[0] + ' (' + total_cable_vs_n_twigs[i].y  + ' twigs)', color: this(i)}; }).bind(d3.scale.category10())),
        true, true
      );

      // Create plot of total dendritic cable length vs number of dendritic twigs
      CATMAID.svgutil.insertXYScatterPlot(divID, 'AA-' + this.widgetID + '-dendritic_cable_length_vs_n_dendritic_twigs',
        this.scatterplot_width, this.scatterplot_height,
        'dendritic backbone cable (µm)', '# dendritic twigs',
        total_dendritic_backbone_cable_vs_dendritic_twigs,
        function(d) {
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', d.skid);
        },
        rows.map((function(row, i) { return {name: row[0] + ' (' + total_dendritic_backbone_cable_vs_dendritic_twigs[i].y  + ' twigs)', color: this(i)}; }).bind(d3.scale.category10())),
        true, true
      );

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

      CATMAID.svgutil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label,
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

      CATMAID.svgutil.insertMultipleBarChart2(divID, 'AA-' + this.widgetID + '-' + label + ' cummulative',
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

  // Export widget
  CATMAID.AnalyzeArbor = AnalyzeArbor;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Analyze Arbor",
    description: "Metrics for different parts of a neuron",
    key: "analyze-arbor",
    creator: AnalyzeArbor
  });

})(CATMAID);
