/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* global
 project,
 fetchSkeletons,
 InstanceRegistry,
 SkeletonAnnotations,
 SynapseClustering,
 colorbrewer,
 d3
*/

// TODO to be opened from the connectivity widget

(function(CATMAID) {

  "use strict";

  var SynapseFractions = function() {
    this.widgetID = this.registerInstance();
    this.registerSource();

    // Appended neurons
    this.models = {};

    // Neurons receiving less than this number of synapses get stashed into the 'others' heap.
    this.threshold = 5;

    // Restrict partners to only these, stash all others to 'others' 
    this.only = null;

    // Whether to show the 'others' heap
    this.show_others = true;

    // Color partner skeletons using these colors
    this.partner_colors = {};

    // Function to generate default colors
    this.colorFn = d3.scale.category20();

    // The loaded data for each arbor
    this.morphologies = {};

    // The data for redrawing
    this.fractions = null;

    // Map of group ID vs object with keys: id, name, color, and map of skids vs true
    this.groups = {};
    // Group IDs count towards minus inifinity
    this.next_group_id = -1;
    // Map from skeleton ID to group ID
    this.groupOf = {};

    this.mode = this.DOWNSTREAM;

    this.confidence_threshold = 0; // TODO add UI

    this.other_source = new CATMAID.BasicSkeletonSource(this.getName() + ' partners');
  };

  SynapseFractions.prototype = {};
  $.extend(SynapseFractions.prototype, new InstanceRegistry());
  $.extend(SynapseFractions.prototype, new CATMAID.SkeletonSource());

  SynapseFractions.prototype.MODES = ["Downstream", "Upstream"];
  SynapseFractions.prototype.DOWNSTREAM = 1;
  SynapseFractions.prototype.UPSTREAM = 2;

  SynapseFractions.prototype.getName = function() {
    return "Synapse Fractions " + this.widgetID;
  };

  SynapseFractions.prototype.destroy = function() {
    this.clear();
    this.other_source.destroy();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  SynapseFractions.prototype.getSelectedSkeletons = function() {
    return Object.keys(this.models);
  };

  SynapseFractions.prototype.getSkeletons = SynapseFractions.prototype.getSelectedSkeletons;

  SynapseFractions.prototype.getSkeletonColor = function(skid) {
    var skeleton = this.models[skid];
    if (skeleton) return skeleton.color.clone();
    return new THREE.Color();
  };

  SynapseFractions.prototype.hasSkeleton = function(skid) {
    return this.models.hasOwnProperty(skid);
  };

  SynapseFractions.prototype.getSkeletonModel = function(skid) {
    var model = this.models[skid];
    if (model) return model.clone();
  };

  SynapseFractions.prototype.getSkeletonModels = function() {
    return Object.keys(this.models).reduce((function(m, skid) {
      m[skid] = this[skid].clone();
      return m;
    }).bind(this.models), {});
  };

  SynapseFractions.prototype.getSelectedSkeletonModels = SynapseFractions.prototype.getSkeletonModels;

  SynapseFractions.prototype.update = function() {
    var models = this.models;
    var morphologies = {};
    var fractions = null;
    this.append(models);
  };

  SynapseFractions.prototype.resize = function() {
    this.redraw();
  };

  SynapseFractions.prototype.updateNeuronNames = function() {
    this.redraw();
  };

  SynapseFractions.prototype.clear = function() {
    this.models = {};
    this.only = null;
    this.morphologies = {};
    this.fractions = null;
    this.other_source.clear();
    this.partner_colors = {};
    this.groups = {};
    this.groupOf = {};
    this.redraw();
  };

  SynapseFractions.prototype.append = function(models) {
    CATMAID.NeuronNameService.getInstance().registerAll(this, models,
        (function() { this._append(models); }).bind(this));
  };

  SynapseFractions.prototype._append = function(models) {
    var existing = this.models;
    var updated = false;

    var to_add = Object.keys(models).reduce(function(o, skid) {
      if (existing.hasOwnProperty(skid)) {
        updated = true;
        existing[skid] = models[skid]; // update: might make it invisible, change color, etc
      } else {
        o[skid] = models[skid];
      }
      return o;
    }, {});

    var skids = Object.keys(to_add);
    if (0 === skids.length) {
      if (updated) this.redraw(); // not really necessary
      return;
    }

    fetchSkeletons(
        skids,
        function(skid) { return django_url + project.id + '/' + skid + '/1/1/1/compact-arbor'; },
        function(skid) { return {}; }, // POST
        (function(skid, json) {
          // register
          this.models[skid] = models[skid];
          this.morphologies[skid] = {nodes: json[0],
                                     synapses: json[1],
                                     tags: json[2]};
        }).bind(this),
        (function(skid) {
          // Failed to load
          delete this.models[skid];
          delete this.morphologies[skid];
        }).bind(this),
        (function() { this.updateGraph(); }).bind(this));
  };

  SynapseFractions.prototype.createPartnerGroup = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "group");
    if (source) {
      var gid = this.next_group_id--;
      var name = prompt("Group name", "group" + gid);
      if (!name) return; // cancelled
      var skids = source.getSelectedSkeletons().filter(function(skid) {
        // Check that it doesn't belong to a group already
        return !this.groupOf[skid];
      }, this);
      if (0 === skids.length) {
        CATMAID.msg("WARNING", "All skeleton IDs already belong to an existing group.");
        return;
      }
      this.groups[gid] = {
        id: gid,
        skids: skids.reduce(function(o, skid) { o[skid] = true; return o; }, {}),
        name: name,
        autocolor: true,
        color: '#' + source.getSkeletonModel(skids[0]).color.getHexString()};
      skids.forEach(function(skid) { this.groupOf[skid] = gid; }, this);
    }
    this.updateGraph();
  };

  SynapseFractions.prototype.updateGraph = function() {
    if (0 === Object.keys(this.models)) return;

    var skids2 = {};
    this.fractions = {};

    Object.keys(this.morphologies).forEach(function(skid) {
      // TODO split into e.g. axon and dendrite
      var morphology = this.morphologies[skid];
      // Collect counts of synapses with partner neurons
      var type = this.mode === this.DOWNSTREAM ? 0 : 1; // 0 is pre, 1 is post
      var partners = morphology.synapses.reduce((function(o, row) {
        // compact-arbor indices:
        // 1: confidence of synaptic relation between skid and connector
        // 3: confidence of synaptic relation between connector and other skid
        // 5: skeleton ID of the other skeleton
        // 6: relation_id for skid to connector
        if (row[6] === type && Math.min(row[1], row[3]) >= this.confidence_threshold) {
          var skid2 = row[5],
              count = o[skid2];
          o[skid2] = count ? count + 1 : 1;
        }
        return o;
      }).bind(this), {});
      // Filter partners
      this.fractions[skid] = Object.keys(partners).reduce((function(o, skid2) {
        var count = partners[skid2];
        if (count < this.threshold
          || (this.only && !this.only[skid2])) {
          o.others += count;
        } else {
          // Place either into a group or by itself
          var gid = this.groupOf[skid2];
          if (gid) {
            var gcount = o[gid];
            o[gid] = (gcount ? gcount : 0) + count;
          } else {
            o[skid2] = count;
          }
          skids2[skid2] = true; // SIDE EFFECT: accumulate unique skeleton IDs
        }
        return o;
      }).bind(this), {others: 0});
    }, this);

    this.other_source.clear();
    var models = Object.keys(skids2).reduce(function(o, skid2) {
      o[skid2] = new CATMAID.SkeletonModel(skid2, "", new THREE.Color(1, 1, 1));
      return o;
    }, {});
    this.other_source.append(models);

    this.redraw();
  };

  SynapseFractions.prototype.redraw = function() {
    var containerID = '#synapse_fractions' + this.widgetID,
        container = $(containerID);

    // Clear prior graph if any
    container.empty();

    // Stop if empty
    if (!this.fractions || 0 === Object.keys(this.fractions)) return;

    // Load names of both pre and post skids
    CATMAID.NeuronNameService.getInstance().registerAll(
        this, this.other_source.getSkeletonModels(),
        (function() { this._redraw(container, containerID); }).bind(this));
  };

  SynapseFractions.prototype._redraw = function(container, containerID) {

    // Map of partners vs counts of synapses across all models
    var partners = Object.keys(this.fractions).reduce((function(o, skid) {
      var counts = this.fractions[skid];
      return Object.keys(counts).reduce(function(o, id) {
        var sum = o[id];
        o[id] = (sum ? sum : 0) + counts[id];
        return o;
      }, o);
    }).bind(this), {});

    // List of partner skeleton IDs, sorted from most synapses to least
    // with 'other' always at the end
    var other = partners['others'];
    delete partners['others'];
    var order = Object.keys(partners)
      .map(function(id) { return [id, partners[id]]; })
      .sort(function(a, b) { return a[1] < b[1] ? 1 : -1; }) // Descending
      .map(function(pair) { return pair[0]; });

    if (this.show_others) {
      order.push('others');
    }

    var sorted_skids = Object.keys(this.models)
      .map(function(skid) { return [skid, CATMAID.NeuronNameService.getInstance().getName(skid)]; })
      .sort(function(a, b) { return a[1] > b[1]; })
      .map(function(pair) { return pair[0]; });

    var colors = (function(partner_colors, colorFn, groups) {
          var i = 0;
          return order.reduce(function(o, id) {
            var c = id < 0 ? (groups[id].autocolor ? colorFn(i++) : groups[id].color) : partner_colors[id];
            o[id] = c ? c : colorFn(i++);
            return o;
          }, {});
        })(this.partner_colors, this.colorFn, this.groups);

    var margin = {top: 20, right: 100, bottom: 50, left: 40},
        width = container.width() - margin.left - margin.right,
        height = container.height() - margin.top - margin.bottom;

    var x = d3.scale.ordinal().rangeRoundBands([0, width], 0.1);
    x.domain(sorted_skids);
    var y = d3.scale.linear().rangeRound([height, 0]);

    var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom")
      .tickFormat(function(skid) { return CATMAID.NeuronNameService.getInstance().getName(skid); });

    var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left")
      .tickFormat(d3.format(".0%"));

    var svg = d3.select(containerID).append("svg")
            .attr("id", 'svg_' + containerID)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var state = svg.selectAll(".state")
      .data(sorted_skids)
      .enter()
      .append('g')
      .attr("class", "state")
      .attr("transform", function(d) { return "translate(" + x(d) + ",0)"; });

    // Sort according to order and compute cumulatives
    var prepare = function(fractions) {
      var total = 0;
      var data = order.reduce(function(a, id) {
        var count = fractions[id];
        if (!count) return a; // skid2 is not a partner
        total += count; // SIDE EFFECT
        a.push({id: id, // skid or gid
                counts: count,
                cumulative: 0, // for offset
                total: 0}); // to normalize
        return a;
      }, []);
      for (var i=0, cumulative = 0; i<data.length; ++i) {
        var d = data[i];
        d.cumulative += cumulative;
        cumulative += d.counts;
        d.total = total;
      }
      return data;
    };

    state.selectAll("rect")
      .data((function(skid) {
        return prepare(this.fractions[skid]);
      }).bind(this))
      .enter()
        .append('rect')
        .attr('width', x.rangeBand())
        .attr('y', function(d) {
          return y((d.cumulative + d.counts) / d.total);
        })
        .attr('height', function(d) {
          return y(d.cumulative / d.total) - y((d.cumulative + d.counts) / d.total);
        })
        .style("fill", function(d, i) {
          return colors[d.id];
        })
        .on('click', function(d) {
          if ("others" === d.id || d.id < 0) return; // negative when it is a group
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', d.id);
        })
        .append('svg:title') // on mouse over
          .text((function(d) {
            var title = "";
            if (d.id == "others") title = d.id;
            else if (d.id < 0) title = this.groups[d.id].name;
            else title = CATMAID.NeuronNameService.getInstance().getName(d.id);
            return title + ": " + d.counts + " synapses";
          }).bind(this));

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

      var yg = svg.append("g")
          .attr("class", "y axis")
          .attr("fill", "none")
          .attr("stroke", "black")
          .style("shape-rendering", "crispEdges")
          .call(yAxis);
      yg.selectAll("text")
          .attr("fill", "black")
          .attr("stroke", "none");

    var legend = svg.selectAll(".legend")
      .data(order.map(function(a) { return a;}).reverse()) // no clone method
      .enter()
        .append("g")
        .attr("class", "legend")
        .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; })
        .on("click", (function(id) {
          if ("others" === id) return;
          // negative when it is a group
          if (id < 0) {
            this.groupEditor(id);
            return;
          }
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
        }).bind(this));

    legend.append("rect")
      .attr("x", width + 80)
      .attr("width", 18)
      .attr("height", 18)
      .style("fill", function(id) { return colors[id]; });

    legend.append("text")
      .attr("x", width + 74)
      .attr("y", 9)
      .attr("dy", ".35em")
      .style("text-anchor", "end")
      .text((function(id) {
        if ("others" === id) return id;
        if (id < 0) return this.groups[id].name;
        return CATMAID.NeuronNameService.getInstance().getName(id);
      }).bind(this));

  };

  /** Launch properties editor for the group. */
  SynapseFractions.prototype.groupEditor = function(id) {
    var group = this.groups[id];
    if (!group) {
      CATMAID.msg("WARNING", "Unknown group with id: " + id);
      return;
    }
    var od = new CATMAID.OptionsDialog("Edit group");

    od.appendMessage("The group '" + group.name + "' contains " + Object.keys(group.skids).length + " neurons.");

    // Edit title
    var title = od.appendField("Edit title: ", "group-title-synapse-fraction" + this.widgetID, group.name, true);

    // Edit color
    var color = null;
    var colorButton = document.createElement('button');
    colorButton.appendChild(document.createTextNode('Group color'));
    CATMAID.ColorPicker.enable(colorButton, {
      initialColor: group.color,
      onColorChange: (function(rgb, alpha, colorChanged, alphaChanged) {
        if (colorChanged) {
          color = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
                                         Math.round(rgb.g * 255),
                                         Math.round(rgb.b * 255));
        }
      }).bind(this)
    });

    var auto = od.appendCheckbox("Automatic color", "group-autocolor-synapse-fraction" + this.widgetID, group.autocolor);

    var p = document.createElement('p');
    p.appendChild(colorButton);
    od.dialog.appendChild(p);

    // Enable deleting the group
    var remove = od.appendCheckbox("Remove group", "group-remove-synapse-fraction" + this.widgetID, false);

    od.onOK = (function() {
      if ($(remove).prop('checked')) {
        Object.keys(group.skids).forEach(function(skid) { delete this.groupOf[skid]; }, this);
        delete this.groups[id];
        this.updateGraph(); // remake this.fractions
        return;
      }
      group.name = title.value;
      if (color) group.color = color;
      group.autocolor = $(auto).prop('checked');

      this.redraw();

    }).bind(this);

    od.show('auto', 'auto');
    return;
  };

  SynapseFractions.prototype.toggleOthers = function() {
    this.show_others = !this.show_others;
    this.redraw();
  };

  SynapseFractions.prototype.onchangeMode = function(choice) {
    var mode = choice.selectedIndex + 1;
    if (mode === this.mode) return;
    this.mode = mode;
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeFilterPartnerSkeletons = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "filter");
    if (source) {
      this.only = source.getSelectedSkeletons().reduce(function(o, skid) { o[skid] = true; return o; }, {});
    } else {
      this.only = null;
    }
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeColorPartnerSkeletons = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "color");
    if (source) {
      var models = source.getSelectedSkeletonModels();
      this.partner_colors = Object.keys(models).reduce(function(o, skid) {
        o[skid] = '#' + models[skid].color.getHexString();
        return o;
      }, {});
    } else {
      this.partner_colors = {};
    }
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeSynapseThreshold = function(ev) {
    // Get the number from the event soure, which is a textField
    var val = Number(ev.srcElement.value);
    if (Number.isNaN(val)) {
      CATMAID.msg("Warning", "Invalid threshold value: not a number.");
      return;
    }

    if (val !== this.threshold) {
      this.threshold = val;
      this.updateGraph();
    }
  };

  SynapseFractions.prototype.onchangeColorScheme = function(c) {
    var scheme = c.options[c.selectedIndex].text;
    if (0 === scheme.indexOf('category')) {
      this.colorFn = d3.scale[scheme]();
    } else if (colorbrewer.hasOwnProperty(scheme)) {
      this.colorFn = (function(sets) {
        // circular indexing
        var keys = Object.keys(sets),
            largest = sets[keys.sort(function(a, b) { return a < b ? 1 : -1; })[0]];
        return (function(largest, i) { return largest[i % largest.length]; }).bind(null, largest);
      })(colorbrewer[scheme]);
    }
    this.redraw();
  };

  SynapseFractions.prototype.exportCSV = function() {
    // TODO
  };

  SynapseFractions.prototype.exportSVG = function() {
    CATMAID.svgutil.saveDivSVG('synapse_fractions_widget' + this.widgetID, "synapse_fractions.svg");
  };

  SynapseFractions.prototype.highlight = function(skid) {
    // TODO
  };

  // Export synapse plot into CATMAID namespace
  CATMAID.SynapseFractions = SynapseFractions;

})(CATMAID);
