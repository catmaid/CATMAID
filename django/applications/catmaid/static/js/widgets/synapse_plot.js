/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* global
 project,
 fetchSkeletons,
 InstanceRegistry,
 SkeletonAnnotations,
 SynapseClustering
*/

(function(CATMAID) {

  "use strict";

  var SynapsePlot = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    // Each entry has an array of unique skeleton ids
    this.pre = {};
    this.post = {};

    // skeleton_id vs SkeletonModel, for postsynaptic neurons added via "append"
    this.models = {};

    // Skeleton data for skeletons in this.models, including the arbor and the "ais_node" marking the axon initial segment
    this.morphologies = {};

    // List skeletons for which there are at least these many synapses
    this.threshold = 1;

    // List of presynaptic skeletons to show. When null, show all.
    this.only = null;

    // Method for finding the skeleton treenode where the axon starts
    this.ais_method = this.AIS_COMPUTED;
    this.ais_tag = "";

    // The processed but unfiltered data to show in the plot, stored so that redraws for resizing are trivial.
    this.rows = null;

    // In percent of the row height
    this.jitter = 0.25;

    // Whether to plot the distribution for axon or dendrite
    this.compartment = this.UPSTREAM;

    // For coloring according to pre_skids
    this.pre_models = {};

    // For smoothing the arbor with a Gaussian convolution
    this.sigma = 200;

    // Maintain a skeleton source for neurons in the plot
    this.preSource = new CATMAID.BasicSkeletonSource(this.getName() + ' Presynaptics', {
      owner: this
    });
  };

  SynapsePlot.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  SynapsePlot.prototype.constructor = SynapsePlot;

  $.extend(SynapsePlot.prototype, new InstanceRegistry());

  SynapsePlot.prototype.getWidgetConfiguration = function() {
    return {
      contentID: "synapse_plot_widget" + this.widgetID,
      createControls: function(controls) {
        var tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID, ['Main', 'Options']);

        var compartment = CATMAID.DOM.createSelect("synapse_plot_compartment" + this.widgetID, this.COMPARTMENTS);
        compartment.onchange = this.onchangeCompartment.bind(this, compartment);

        CATMAID.DOM.appendToTab(tabs['Main'],
            [[document.createTextNode('From')],
             [CATMAID.skeletonListSources.createSelect(this)],
             ['Append', this.loadSource.bind(this)],
             ['Clear', this.clear.bind(this)],
             ['Refresh', this.update.bind(this)],
             [document.createTextNode(" - Compartment: ")],
             [compartment],
             [document.createTextNode(" - ")],
             ['Export SVG', this.exportSVG.bind(this)],
             ['Export CSV', this.exportCSV.bind(this)]]);

        var nf = CATMAID.DOM.createNumericField("synapse_count_threshold" + this.widgetID, // id
                                    "Synapse count threshold: ",             // label
                                    "Synapse count threshold",               // title
                                    this.threshold,                            // initial value
                                    undefined,                               // postlabel
                                    this.onchangeSynapseThreshold.bind(this),    // onchange
                                    5);                                      // textfield length in number of chars

        var filter = CATMAID.skeletonListSources.createPushSelect(this, "filter");
        filter.onchange = this.onchangeFilterPresynapticSkeletons.bind(this);

        var ais_choice = CATMAID.DOM.createSelect("synapse_plot_AIS_" + this.widgetID, ["Computed", "Node tagged with..."], "Computed");

        var tag = CATMAID.DOM.createTextField("synapse_count_tag" + this.widgetID,
                                     "Tag",
                                     "",
                                     "",
                                     undefined,
                                     undefined,
                                     10);
        tag.onchange = this.onchangeAxonInitialSegmentTag.bind(this, tag);

        ais_choice.onchange = this.onchangeChoiceAxonInitialSegment.bind(this, ais_choice, tag);

        var jitter = CATMAID.DOM.createNumericField("synapse_plot_jitter" + this.widgetID,
                                       undefined,
                                       "Jitter",
                                       this.jitter,
                                       undefined,
                                       undefined,
                                       5);

        jitter.onchange = this.onchangeJitter.bind(this, jitter);

        var choice_coloring = CATMAID.skeletonListSources.createPushSelect(this, "coloring");
        choice_coloring.onchange = this.onchangeColoring.bind(this);

        var sigma = CATMAID.DOM.createNumericField("synapse_plot_smooth" + this.widgetID,
                                       "Arbor smoothing: ",
                                       "Gaussian smoothing sigma",
                                       this.sigma,
                                       " nm",
                                       this.onchangeSigma.bind(this),
                                       5);

        CATMAID.DOM.appendToTab(tabs['Options'],
            [[nf],
             [document.createTextNode(' Only in: ')],
             [filter],
             [document.createTextNode(' Axon initial segment: ')],
             [ais_choice],
             [tag],
             [document.createTextNode(' Jitter: ')],
             [jitter],
             [document.createTextNode(' Color by: ')],
             [choice_coloring],
             [sigma]]);

        $(controls).tabs();
      },
      createContent: function(content) {
        content.style.overflow = 'hidden';

        var graph = document.createElement('div');
        graph.setAttribute("id", "synapse_plot" + this.widgetID);
        graph.style.width = "100%";
        graph.style.height = "100%";
        graph.style.backgroundColor = "#ffffff";
        content.appendChild(graph);
      }
    };
  };

  SynapsePlot.prototype.getName = function() {
    return "Synapse Distribution Plot " + this.widgetID;
  };

  SynapsePlot.prototype.AIS_COMPUTED = 1;
  SynapsePlot.prototype.AIS_TAG = 2;

  SynapsePlot.prototype.DOWNSTREAM = 0; // axon
  SynapsePlot.prototype.UPSTREAM = 1; // dendrite
  SynapsePlot.prototype.MOST_POSTSYNAPTIC = 2; // generally the dendrite
  SynapsePlot.prototype.LEAST_POSTSYNAPTIC = 3; // generally the axon

  SynapsePlot.prototype.COMPARTMENTS =
    ["upstream (e.g. dendrite)",
    "downstream (e.g. axon)",
    "most postsynaptic",
    "least presynaptic"];

  SynapsePlot.prototype.destroy = function() {
    this.clear();
    this.preSource.destroy();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  SynapsePlot.prototype.getSelectedSkeletons = function() {
    return Object.keys(this.models);
  };

  SynapsePlot.prototype.getSkeletons = SynapsePlot.prototype.getSelectedSkeletons;

  SynapsePlot.prototype.getSkeletonColor = function(skid) {
    var skeleton = this.models[skid];
    if (skeleton) return skeleton.color.clone();
    return new THREE.Color();
  };

  SynapsePlot.prototype.hasSkeleton = function(skid) {
    return this.models.hasOwnProperty(skid);
  };

  SynapsePlot.prototype.getSkeletonModel = function(skid) {
    var model = this.models[skid];
    if (model) return model.clone();
  };

  SynapsePlot.prototype.getSkeletonModels = function() {
    return Object.keys(this.models).reduce((function(m, skid) {
      m[skid] = this[skid].clone();
      return m;
    }).bind(this.models), {});
  };

  SynapsePlot.prototype.getSelectedSkeletonModels = SynapsePlot.prototype.getSkeletonModels;

  SynapsePlot.prototype.update = function() {
    var models = this.models;
    this.clear();
    this.append(models);
  };

  SynapsePlot.prototype.resize = function() {
    this.redraw();
  };

  SynapsePlot.prototype.updateNeuronNames = function() {
    this.redraw();
  };

  SynapsePlot.prototype.clear = function() {
    this.models = {};
    this.morphologies = {};
    this.pre = {};
    this.post = {};
    this.rows = null;
    this.pre_models = {};
    this.only = null;
    this.preSource.clear();
    this.redraw();
  };

  SynapsePlot.prototype.append = function(models) {
    CATMAID.NeuronNameService.getInstance().registerAll(this, models,
        (function() { this._append(models); }).bind(this));
  };

  SynapsePlot.prototype._append = function(models) {
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
      if (updated) this.redraw(); // recolor
      return;
    }

    this.morphologies = {};

    fetchSkeletons(
        skids,
        function(skid) { return CATMAID.makeURL(project.id + '/' + skid + '/1/1/1/compact-arbor'); },
        function(skid) { return {}; }, // POST
        (function(post_skid, json) {
          // register
          this.models[post_skid] = models[post_skid];
          // Parse arbor and positions
          var ap = new CATMAID.ArborParser().init("compact-arbor", json);
          // Parse synapses
          // 1. Map of postsynaptic treenode ID vs (map of presynaptic skeleton IDs vs true).
          var posts = {};
          // 2. Map of skeleton ID vs number of presynaptic synapses onto post_skid, to be used for filtering.
          var counts = {};
          var cs = json[1];
          for (var i=0; i<cs.length; ++i) {
            var c = cs[i]; // one connection
            if (0 === c[6]) continue; // presynaptic
            var treenodeID = c[0];
            var pre_skid = c[5];
            // Get the map of skeleton ID vs number of synaptic relations at treenodeID
            var uskids = posts[treenodeID];
            if (!uskids) {
              uskids = {};
              posts[treenodeID] = uskids;
            }
            // A skeleton could be making from than one synapse at the same treenodeID
            var num = uskids[pre_skid];
            uskids[pre_skid] = (num ? num : 0) + 1;
            // Count the total number of synapses from the pre_skid
            var count = counts[pre_skid];
            counts[pre_skid] = (count ? count : 0) + 1;
          }

          this.morphologies[post_skid] = {ap: ap,
                                          positions: ap.positions,
                                          posts: posts,
                                          counts: counts,
                                          tags: json[2]};
        }).bind(this),
        (function(skid) {
          // Failed to load
          delete this.models[skid];
          delete this.morphologies[skid];
        }).bind(this),
        (function() { this.updateGraph(); }).bind(this));
  };

  SynapsePlot.prototype.onchangeSynapseThreshold = function(ev) {
    // Get the number from the event soure, which is a textfield
    var val = Number(ev.target.value);
    if (Number.isNaN(val)) {
      CATMAID.msg("Warning", "Invalid threshold value: not a number.");
      return;
    }

    if (val !== this.threshold) {
      this.threshold = val;
      this.updateGraph();
    }
  };

  SynapsePlot.prototype.onchangeFilterPresynapticSkeletons = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "filter");
    if (source) {
      this.only = source.getSelectedSkeletons().reduce(function(o, skid) { o[skid] = true; return o; }, {});
    } else {
      this.only = null;
    }
    this.updateGraph();
  };

  SynapsePlot.prototype.onchangeChoiceAxonInitialSegment = function(select, field) {
    if ("Computed" === select.value) {
      // Compute by synapse flow centrality, and take the most proximal node
      this.ais_method = this.AIS_COMPUTED;
      this.updateGraph();
    } else if ("Node tagged with..." === select.value) {
      // Ask for a choice of tag
      this.ais_method = this.AIS_TAG;
      this.onchangeAxonInitialSegmentTag(field);
    }
  };

  SynapsePlot.prototype.onchangeAxonInitialSegmentTag = function(field) {
    this.ais_tag = field.value.trim();
    if (this.ais_method === this.AIS_TAG) {
      if ("" === this.ais_tag) {
        CATMAID.msg("Information", "Write in the name of a tag");
        return;
      }
      this.updateGraph();
    }
  };

  SynapsePlot.prototype.onchangeJitter = function(field) {
    var jitter = Number(field.value.trim());
    if (Number.isNaN(jitter)) {
      CATMAID.msg("Warning", "Invalid jitter value");
      return;
    }
    if (this.jitter === jitter) return;
    // Clamp to range [0, 0.5]
    if (jitter > 0.5) {
      jitter = 0.5;
    } else if (jitter < 0) {
      jitter = 0;
    }
    $("#synapse_plot_jitter" + this.widgetID).val(jitter);
    this.jitter = jitter;
    this.redraw();
  };

  SynapsePlot.prototype.onchangeColoring = function(select) {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "coloring");
    this.pre_models = source ? source.getSelectedSkeletonModels() : {};
    this.redraw();
  };

  SynapsePlot.prototype.onchangeCompartment = function(select) {
    var index = this.COMPARTMENTS.indexOf(select.value);
    if (-1 === index) return;
    this.compartment = index;
    this.updateGraph();
  };

  SynapsePlot.prototype.onchangeSigma = function(ev) {
    var sigma = Number(ev.target.value);
    if (!Number.isNaN(sigma) && sigma !== this.sigma && sigma > 0) {
      this.sigma = sigma;
      this.updateGraph();
    }
  };

  /** Return the treenode ID of the most proximal node of the axon initial segment, or null if not findable. */
  SynapsePlot.prototype.findAxonInitialSegment = function(morphology) {
    // Method 1:
    if (this.AIS_COMPUTED === this.ais_method) {
      // Same algorithm as in the 3D Viewer
      var axon = SynapseClustering.prototype.findAxon(
          morphology.ap,
          0.9,
          morphology.positions);
      if (axon) return axon.root;
      return null;
    }

    // Method 2:
    if (this.AIS_TAG === this.ais_method) {
      var nodes = morphology.tags[this.ais_tag];
      if (nodes) {
        if (1 === nodes.length) return nodes[0];
        CATMAID.msg("Warning", "More than one node tagged with '" + this.ais_tag + "'");
        return null;
      } else {
        CATMAID.msg("Warning", "Could not find a node tagged with '" + this.ais_tag + "'");
        return null;
      }
    }
  };

  SynapsePlot.prototype.updateGraph = function() {
    if (0 === Object.keys(this.models)) return;

    // For filtering
    var accept = (function(pre_skid, counts) {
      if (!this.only || this.only[pre_skid]) {
        if (counts >= this.threshold) {
          return true;
        }
      }
      return false;
    }).bind(this);

    // Compute distances to the axon initial segment of the postsynaptic neurons
    // Map of presynaptic skeleton IDs vs postsynaptic sites on postsynaptic neurons
    var postsynaptic_sites = {};

    Object.keys(this.morphologies).forEach(function(post_skid) {
      var morphology = this.morphologies[post_skid];
      var ais_node = this.findAxonInitialSegment(morphology);
      morphology.ais_node = ais_node; // store even if null
      if (!ais_node) {
        CATMAID.msg("Warning", "Could not find the axon initial segment for " + CATMAID.NeuronNameService.getInstance().getName(post_skid));
        return;
      }
      // Choose the compartment: upstream or downstream of the ais_node
      var arbor = morphology.ap.arbor.clone();
      var sub = arbor.subArbor(ais_node);

      var compartment = this.compartment;

      if ( this.MOST_POSTSYNAPTIC  === this.compartment
        || this.LEAST_POSTSYNAPTIC === this.compartment) {
        // Count postsynaptic sites in the subarbor
        var ap = morphology.ap;
        var n_axon_posts = sub.nodesArray().reduce(function(sum, node) {
          return sum + (ap.inputs[node] ? 1 : 0);
        }, 0);
        // Chose between UPSTREAM and DOWNSTREAM
        var fraction = n_axon_posts / ap.n_inputs;
        switch (this.compartment) {
          case this.MOST_POSTSYNAPTIC:  compartment = fraction < 0.5 ? this.UPSTREAM   : this.DOWNSTREAM; break;
          case this.LEAST_POSTSYNAPTIC: compartment = fraction < 0.5 ? this.DOWNSTREAM : this.UPSTREAM;   break;
        }
      }

      if (this.UPSTREAM === compartment) {
        // Remove the subarbor
        Object.keys(sub.edges).forEach(function(node) { delete arbor.edges[node]; });
      } else if (this.DOWNSTREAM === compartment) {
        // Keep only the subarbor
        arbor = sub;
      } else {
        CATMAID.msg("ERROR", "Invalid compartment.");
        return;
      }

      // Make measurements relative to the cut point (the axon initial segment)
      arbor.reroot(ais_node);
      //
      var positions = this.sigma > 0 ? arbor.smoothPositions(morphology.positions, this.sigma)
                                     : morphology.positions;
      var distances = arbor.nodesDistanceTo(ais_node,
        (function(child, paren) {
          return this[child].distanceTo(this[paren]);
        }).bind(positions)).distances;
      // Define synapses
      // for each treenodeID in the post_skid
      Object.keys(morphology.posts).forEach(function(treenodeID) {
        var distance = distances[treenodeID];
        if (!distance) return; // not part of the dendrite
        var pre_skids = morphology.posts[treenodeID];
        // for each pre_skid that synapses onto post_skid at treenodeID
        Object.keys(pre_skids).forEach(function(pre_skid) {
          // Filter
          if (!accept(pre_skid, morphology.counts[pre_skid])) return;
          //
          var p = postsynaptic_sites[pre_skid];
          if (!p) {
            p = [];
            postsynaptic_sites[pre_skid] = p;
          }
          // for each synapse that pre_skid makes onto post_skid at treenodeID
          // (could be more than 1, but most will be just 1)
          for (var i=0, count=pre_skids[pre_skid]; i<count; i++) {
            p.push({distance: distance,
                    treenodeID: treenodeID,
                    post_skid: post_skid,
                    pre_skid: pre_skid});
          }
        });
      });
    }, this);

    // For each pre_skid in postsynaptic_sites, make a row in the graph.
    // First, sort descending from more to less synapses onto the post_skids
    var sorted = Object.keys(postsynaptic_sites).map(function(pre_skid) {
      return {pre_skid: pre_skid,
              posts: postsynaptic_sites[pre_skid]};
    }).sort(function(a, b) {
      var al = a.posts.length,
          bl = b.posts.length;
      return al === bl ? 0 : (al < bl ? 1 : -1);
    });

    this.rows = sorted;

    // Update plot skeleton source
    this.preSource.clear();
    var models = this.rows.reduce(function(o, r) {
      o[r.pre_skid] = new CATMAID.SkeletonModel(r.pre_skid);
      return o;
    }, {});
    this.preSource.append(models);

    this.redraw();
  };

  SynapsePlot.prototype.redraw = function() {
    var containerID = '#synapse_plot' + this.widgetID,
        container = $(containerID);

    // Clear prior graph if any
    container.empty();

    // Stop if empty
    if (!this.rows || 0 === this.rows.length) return;

    // Load names of pre_skids
    CATMAID.NeuronNameService.getInstance().registerAll(
        this, this.preSource.getSkeletonModels(),
        (function() { this._redraw(container, containerID); }).bind(this));
  };

  SynapsePlot.prototype._redraw = function(container, containerID) {
    // Upper bound of the X axis range
    var max_dist = 0;
    this.rows.forEach(function(pre) {
      pre.posts.forEach(function(post) {
        max_dist = Math.max(max_dist, post.distance);
      });
    });

    var margin = {top: 20, right: 20, bottom: 50, left: 150},
        width = container.width() - margin.left - margin.right,
        height = container.height() - margin.top - margin.bottom;

    var svg = d3.select(containerID).append("svg")
            .attr("id", 'svg_' + containerID)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var xaxis = d3.svg.axis();
    var yaxis = d3.svg.axis();
    var xscale = d3.scale.linear();
    var yscale = d3.scale.linear();

    var xyzoom = d3.behavior.zoom()
      .x(xscale)
      .y(yscale)
      .on("zoom", draw);
    var xzoom = d3.behavior.zoom()
      .x(xscale)
      .on("zoom", draw);
    var yzoom = d3.behavior.zoom()
      .y(yscale)
      .on("zoom", draw);

    svg.append("svg:rect")
      .attr("class", "zoom xy box")
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .style("visibility", "hidden")
      .attr("pointer-events", "all")
      .call(xyzoom);

    svg.append("svg:rect")
      .attr("class", "zoom x box")
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .attr("transform", "translate(" + 0 + "," + (height - margin.top - margin.bottom) + ")")
      .style("visibility", "hidden")
      .attr("pointer-events", "all")
      .call(xzoom);

    svg.append("svg:rect")
      .attr("class", "zoom y box")
      .attr("width", margin.left)
      .attr("height", height - margin.top - margin.bottom)
      .attr("transform", "translate(" + -margin.left + "," + 0 + ")")
      .style("visibility", "hidden")
      .attr("pointer-events", "all")
      .call(yzoom);

    // Set up x axis
    xscale.domain([0, max_dist])
      .range([0, width]);
    xaxis.scale(xscale)
      .orient("bottom");

    // Set up y axis. Explicit tick values are needed or otherwise d3 will
    // remove ticks when zooming out.
    var tickValues = new Array(this.rows.length);
    for (var i=0; i<tickValues.length; ++i) {
      tickValues[i] = i;
    }
    yscale.domain([0, this.rows.length -1])
      .range([height, 0]); // domain starts at 1
    yaxis.scale(yscale)
      .ticks(this.rows.length + 1)
      .tickValues(tickValues)
      .tickFormat((function(i) {
        if (!this.rows[i] || !this.rows[i].pre_skid) {
          return "";
        }
        return CATMAID.NeuronNameService.getInstance().getName(this.rows[i].pre_skid);
      }).bind(this))
      .orient("left");

    // State
    var state = svg.selectAll(".state")
                   .data(this.rows)
                   .enter()
                   .append('g')
                     .attr('class', 'g') // one row, representing one pre_skid
                     .attr('transform', function(d, i) {
                       return "translate(0," + yscale(i) + ")";
                     });

    state.selectAll("circle")
         .data(function(pre) { // for each pre_skid
           return pre.posts;
         })
         .enter() // for each postsynaptic site
           .append("circle")
           .attr('class', 'dot')
           .attr('r', '3')
           .attr("cx", function(post) {
             return xscale(post.distance);
           })
           .attr("cy", (function(post) {
             // y(1) - y(0) gives the height of the horizonal row used for a pre_skid,
             // then jitter takes a fraction of that, and Math.random spreads the value within that range.
             post.jitter = this.jitter;
             post.offset = Math.random();
             return ((yscale(1) - yscale(0)) * post.jitter) * (post.offset - 0.5);
           }).bind(this))
           .style('fill', (function(post) {
             // Default is to color according to post_skid,
             // but will color according to pre_skid if present in this.pre_models.
             // (see this.onchangeColoring)
             var pre_model = this.pre_models[post.pre_skid];
             var model = pre_model ? pre_model : this.models[post.post_skid];
             return '#' + model.color.getHexString();
           }).bind(this))
           .style('stroke', 'black')
           .on('click', function(post) {
             SkeletonAnnotations.staticMoveToAndSelectNode(post.treenodeID);
           })
           .append('svg:title') // on mouse over
             .text(function(post) {
               return CATMAID.NeuronNameService.getInstance().getName(post.post_skid);
             });

      var xg = svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + (height + 10) + ")") // translated down a bit
          .attr("fill", "none")
          .attr("stroke", "black")
          .style("shape-rendering", "crispEdges")
          .call(xaxis);
      xg.append("text")
          .attr("x", width)
          .attr("y", -6)
          .attr("fill", "black")
          .attr("stroke", "none")
          .attr("font-family", "sans-serif")
          .attr("font-size", "11px")
          .style("text-anchor", "end")
          .text("distance (nm)");

      var yg = svg.append("g")
          .attr("class", "y axis")
          .attr("fill", "none")
          .attr("stroke", "black")
          .style("shape-rendering", "crispEdges")
          .call(yaxis);
      yg.append("text")
          .attr("fill", "black")
          .attr("stroke", "none")
          .attr("transform", "rotate(-90)")
          .attr("font-family", "sans-serif")
          .attr("font-size", "11px")
          .attr("y", 6)
          .attr("dy", ".71em")
          .style("text-anchor", "end");

      var legend = svg.selectAll(".legend")
        .data(Object.keys(this.models))
        .enter()
          .append("g")
          .attr("class", "legend")
          .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; })
          .on("click", (function(skid) {
            var ais_node = this.morphologies[skid].ais_node;
            if (!ais_node) {
              CATMAID.msg("Warning", "No axon initial segment found for " + CATMAID.NeuronNameService.getInstance().getName(skid));
            } else {
              SkeletonAnnotations.staticMoveToAndSelectNode(ais_node);
            }
          }).bind(this));

      legend.append("rect")
        .attr("x", width - 18)
        .attr("width", 18)
        .attr("height", 18)
        .style("fill", (function(skid) { return '#' + this.models[skid].color.getHexString(); }).bind(this));

      legend.append("text")
        .attr("x", width - 24)
        .attr("y", 9)
        .attr("dy", ".35em")
        .style("text-anchor", "end")
        .text(function(skid) { return CATMAID.NeuronNameService.getInstance().getName(skid); });

      function transform(d, i) {
        //return "translate(" + xscale(d.distance) + "," + yscale(0) + ")";
        let x = xscale(d.distance);
        let y = ((yscale(1) - yscale(0)) * d.jitter) * (d.offset - 0.5);
        return "translate(" + x + "," + y + ")";
      }

      function zoomUpdate() {
        xyzoom = d3.behavior.zoom()
          .x(xscale)
          .y(yscale)
          .on("zoom", draw);
        xzoom = d3.behavior.zoom()
          .x(xscale)
          .on("zoom", draw);
        yzoom = d3.behavior.zoom()
          .y(yscale)
          .on("zoom", draw);

        svg.select('rect.zoom.xy.box').call(xyzoom);
        svg.select('rect.zoom.x.box').call(xzoom);
        svg.select('rect.zoom.y.box').call(yzoom);

        xg.selectAll("text")
          .attr("fill", "black")
          .attr("stroke", "none");
        yg.selectAll("text")
          .attr("fill", "black")
          .attr("stroke", "none");
      }

      function draw() {
        svg.select('g.x.axis').call(xaxis);
        svg.select('g.y.axis').call(yaxis);

        // Update location of displayed data
        state.attr('transform', function(d, i) {
           return "translate(0," + yscale(i) + ")";
         });
        state.selectAll("circle")
          //.attr('transform', transform);
          .attr("cx", function(post) {
           return xscale(post.distance);
          });

        zoomUpdate();
      }

      draw();
  };

  SynapsePlot.prototype.highlight = function(skid) {
    // TODO
  };

  SynapsePlot.prototype.exportCSV = function() {
    if (!this.rows) {
      CATMAID.msg("Warning", "Nothing to export to CSV.");
      return;
    }
    var csv = ["post_skeletonID,pre_skeletonID,post_treenodeID,distance_to_AIS"]
      .concat(this.rows.reduce(function(a, pre) {
      return pre.posts.reduce(function(a, post) {
        return a.concat([post.post_skid, post.pre_skid, post.treenodeID, post.distance].join(","));
      }, a);
    }, [])).join('\n');
    saveAs(new Blob([csv], {type: "text/csv"}), "synapse_distribution.csv");
  };

  SynapsePlot.prototype.exportSVG = function() {
    CATMAID.svgutil.saveDivSVG('synapse_plot_widget' + this.widgetID, "synapse_distribution_plot.svg");
  };

  // Export synapse plot into CATMAID namespace
  CATMAID.SynapsePlot = SynapsePlot;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Synapse Plot",
    description: "Plot synapse distribution of multiple skeletons",
    key: "synapse-plot",
    creator: CATMAID.SynapsePlot
  });

})(CATMAID);
