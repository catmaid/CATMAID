/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  Arbor,
  fetchSkeletons,
  InstanceRegistry,
  project,
  SkeletonAnnotations,
*/

(function(CATMAID) {

  "use strict";

  var MorphologyPlot = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.models = {};
    this.lines = {};
  };

  MorphologyPlot.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  MorphologyPlot.prototype.constructor = MorphologyPlot;

  $.extend(MorphologyPlot.prototype, new InstanceRegistry());

  MorphologyPlot.prototype.getName = function() {
    return "Morphology Plot " + this.widgetID;
  };

  MorphologyPlot.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'morphology_plot_buttons' + this.widgetID,
      contentID: 'morphology_plot_div' + this.widgetID,
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

        controls.appendChild(document.createTextNode(' - '));

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Export CSV");
        csv.onclick = this.exportCSV.bind(this);
        controls.appendChild(csv);

        var svg = document.createElement('input');
        svg.setAttribute("type", "button");
        svg.setAttribute("value", "Export SVG");
        svg.onclick = this.exportSVG.bind(this);
        controls.appendChild(svg);

        controls.appendChild(document.createElement('br'));

        CATMAID.DOM.appendSelect(controls, "function", null,
            ['Sholl analysis',
             'Radial density of cable',
             'Radial density of branch nodes',
             'Radial density of ends',
             'Radial density of input synapses',
             'Radial density of output synapses']);

        controls.appendChild(document.createTextNode(' Radius (nm): '));
        var radius = document.createElement('input');
        radius.setAttribute("id", "morphology_plot_step" + this.widgetID);
        radius.setAttribute("type", "text");
        radius.setAttribute("value", "1000");
        radius.style.width = "40px";
        controls.appendChild(radius);

        CATMAID.DOM.appendSelect(controls, "center", ' Center: ',
            ['First branch node',
             'Root node',
             'Active node',
             'Bounding box center',
             'Average node position',
             'Highest centrality node',
             'Highest signal flow centrality']);

        var redraw = document.createElement('input');
        redraw.setAttribute("type", "button");
        redraw.setAttribute("value", "Draw");
        redraw.onclick = this.redraw.bind(this);
        controls.appendChild(redraw);
      },
      createContent: function(content) {},
      helpText: [
        '<h1>Morphology Plot</h1>',
        '<p> This widget is a histogram based analysis tool which provides',
        'information on nodes with a similar distance to a reference location,',
        'which can be a specified in the user interface.',
        'Example choices are the root node or the average node position. Around',
        'this center, spheres are formed with an increasing radius that can be',
        'defined by the user and defaults to 1000nm per step. All nodes within',
        'the part of a sphere that doesn\'t overlap with the last smaller sphere',
        'is treated as one bin of a histogram. This is shown for three bins in',
        '2D below:</p>',
        '<p><svg height="100" with="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
        '<circle cx="50" cy="50" r="49" style="stroke: #000; fill: #fff"/>',
        '<circle cx="50" cy="50" r="30" style="stroke: #000; fill: #fff"/>',
        '<circle cx="50" cy="50" r="10" style="stroke: #000; fill: #fff"/>',
        '<text x="50" y="53" style="font-size: 10px; text-anchor: middle">1</text>',
        '<text x="31" y="53" style="font-size: 10px; text-anchor: middle">2</text>',
        '<text x="10" y="53" style="font-size: 10px; text-anchor: middle">3</text>',
        '</svg></p>',
        '<p>Which nodes are part of which bin depends heavily on the morphology',
        'of a neuron. The widget allows then to compute various metrics on those',
        'bins:',
        '<ul>',
        '<li><b>Sholl analysis:</b> The number of edges intersecting with the',
        'boundary of the smaller sphere. Notice that if parent-child segments are',
        'longer than radius-increment in the radial direction, some parent-child',
        'segments will be counted more than once, which is correct.</li>',
        '<li><b>Radial density of cable:</b> Approximate aggregated cable length',
        'per bin by adding the length of all child-parent edges of all child',
        'nodes in the bin.</li>',
        '<li><b>Radial density of branch nodes:</b>The number of branch nodes in',
        'a particular bin.</li>',
        '<li><b>Radial density of ends:</b> The number of end nodes in a',
        'particular bin.</li>',
        '<li><b>Radial density of input synapses:</b> The number of input',
        'synapses a particular bin.</li>',
        '<li><b>Radial density of output synapses:</b> The number of output',
        'synapses a particular bin.</li>',
        '</ul>',
        '</p>',
        '<p>The plot itself shows the distance from the selected center on',
        'the X axis and the bin value (e.g. the number of end nodes) is shown on',
        'the Y axis.<p>',
      ].join('\n')
    };
  };

  MorphologyPlot.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);

    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  MorphologyPlot.prototype.update = function() {
      this.append(this.models);
  };

  MorphologyPlot.prototype.updateModels = function(models) {
    this.append(models);
  };

  MorphologyPlot.prototype.hasSkeleton = function(skeleton_id) {
      return skeleton_id in this.models;
  };

  /** Returns a clone of all skeleton models, keyed by skeleton ID. */
  MorphologyPlot.prototype.getSelectedSkeletonModels = function() {
    return Object.keys(this.models).reduce((function(o, skid) {
      o[skid] = this.models[skid].clone();
      return o;
    }).bind(this), {});
  };

  MorphologyPlot.prototype.getSkeletonModels = function() {
      return Object.keys(this.models).reduce((function(o, skid) {
          o[skid] = this.models[skid].clone();
          return o;
      }).bind(this), {});
  };

  MorphologyPlot.prototype.highlight = function(skeleton_id) {
      // TODO
  };

  // TODO abstract from CircuitGraphPlot
  MorphologyPlot.prototype.resize = function() {
    var now = new Date();
    // Overwrite request log if any
    this.last_request = now;

    setTimeout((function() {
      if (this.last_request && now === this.last_request) {
        delete this.last_request;
        this.draw();
      }
    }).bind(this), 1000);
  };

  MorphologyPlot.prototype.clear = function() {
     this.models = {};
     this.lines = {};
     this.clearGUI();
  };

  MorphologyPlot.prototype.clearGUI = function() {
    this.selected = {};
    $('#morphology_plot_div' + this.widgetID).empty();
  };

  MorphologyPlot.prototype.append = function(models) {
    var newIDs = {};
    Object.keys(models).forEach(function(skid) {
      var model = models[skid];
      if (model.selected) {
        if (!(skid in this.models)) newIDs[skid] = true;
        this.models[skid] = model.clone();
      } else {
        // Won't fail when not present
        delete this.models[skid];
        delete this.lines[skid];
      }
    }, this);

    var skeleton_ids = Object.keys(newIDs);

    if (0 === skeleton_ids.length) {
      // Update colors, names, etc.
      this.draw();
      return;
    }

    fetchSkeletons(
        skeleton_ids,
        function(skeleton_id) {
          return CATMAID.makeURL(project.id + '/' + skeleton_id + '/1/0/compact-skeleton');
        },
        function(skeleton_id) { return {}; }, // post
        (function(skeleton_id, json) {
          this.lines[skeleton_id] = {nodes: json[0],
                                     connectors: json[1].filter(function(con) {
                                       // Filter out non-synaptic connections
                                       return con[2] === 0 || con[2] === 1;
                                     })};
        }).bind(this),
        (function(skeleton_id) {
          // Failed loading
          var model = this.models[skeleton_id];
          CATMAID.msg("ERROR", "Failed to fetch " + model.baseName + ' #' + skeleton_id);
        }).bind(this),
        (function() {
          // Done loading all
          this._populateLines(skeleton_ids);
          CATMAID.NeuronNameService.getInstance().registerAll(this, models, this.draw.bind(this));
        }).bind(this));
  };

  MorphologyPlot.prototype.redraw = function() {
    this.mode =  $('#morphology_plot_buttons' + this.widgetID + '_function option:selected').text();
    this.center_mode = $('#morphology_plot_buttons' + this.widgetID + '_center option:selected').text();
    this.radius_increment = Number($('#morphology_plot_step' + this.widgetID).val());

    this._populateLines(Object.keys(this.models));

    this.draw();
  };

  MorphologyPlot.prototype._populateLines = function(skeleton_ids) {
    if (!this.mode) {
      this.redraw();
      return;
    }

    skeleton_ids.forEach(this._populateLine.bind(this));
  };

  MorphologyPlot.prototype._populateLine = function(skeleton_id) {
    var line = this.lines[skeleton_id],
        positions = line.nodes.reduce(function(o, row) {
          o[row[0]] = new THREE.Vector3(row[3], row[4], row[5]);
          return o;
        }, {}),
        arbor = new Arbor();
    // Populate arbor
    line.nodes.forEach(function(row) {
      if (row[1]) {
        arbor.edges[row[0]] = row[1];
      } else {
        arbor.root = row[0];
      }
    });
    var center = this._computeCenter(this.center_mode, arbor, positions, line.connectors);
    if (center.error) {
      CATMAID.warn(center.error + " for " + CATMAID.NeuronNameService.getInstance().getName(skeleton_id));
      center = this._computeCenter(center.alternative_mode, arbor, positions, line.connectors);
    }

    if ('Sholl analysis' === this.mode) {
      var distanceToCenterFn = function(node) {
        return center.distanceTo(positions[node]);
      };
      var sholl = arbor.sholl(this.radius_increment, distanceToCenterFn);
      line.x = sholl.radius;
      line.y = sholl.crossings;
      return;
    }

    if (0 === this.mode.indexOf('Radial density')) {
      var endsWith = function(s, suffix) {
        return -1 !== s.indexOf(suffix, s.length - suffix.length);
      };

      var ps = positions;

      if (endsWith(this.mode, 'ends')) {
        ps = arbor.findEndNodes().reduce(function(o, node) {
          o[node] = positions[node];
          return o;
        }, {});
      } else if (endsWith(this.mode, 'branch nodes')) {
        ps = Object.keys(arbor.findBranchNodes()).reduce(function(o, node) {
          o[node] = positions[node];
          return o;
        }, {});
      } else if (endsWith(this.mode, 'input synapses')) {
        ps = line.connectors.reduce(function(o, row) {
          if (1 === row[2]) o[row[0]] = positions[row[0]];
          return o;
        }, {});
      } else if (endsWith(this.mode, 'output synapses')) {
        ps = line.connectors.reduce(function(o, row) {
          if (0 === row[2]) o[row[0]] = positions[row[0]];
          return o;
        }, {});
      }

      var fnCount;

      if (endsWith(this.mode, 'cable')) {
        // Approximate by assuming that parent and child fall within the same bin
        fnCount = function(node) {
          if (arbor.root === node) return 0;
          // distance from child to parent
          return positions[node].distanceTo(positions[arbor.edges[node]]);
        };
      } else {
        fnCount = function() { return 1; };
      }

      var density = arbor.radialDensity(center, this.radius_increment, ps, fnCount);
      line.x = density.bins;
      line.y = density.counts;
    }
  };

  MorphologyPlot.prototype._computeCenter = function(center_mode, arbor, positions, connectors) {
    if ('Root node' === center_mode) return positions[arbor.root];
    if ('Active node' === center_mode) return SkeletonAnnotations.getActiveNodeProjectVector3();
    if ('First branch node' === center_mode) {
      var node = arbor.nextBranchNode(arbor.root);
      return positions[null === node ? arbor.root : node];
    }
    if ('Bounding box center' === center_mode) {
      var b = Object.keys(positions).reduce(function(b, node) {
        var v = positions[node];
        b.xMin = Math.min(b.xMin, v.x);
        b.xMax = Math.max(b.xMax, v.x);
        b.yMin = Math.min(b.yMin, v.y);
        b.yMax = Math.max(b.yMax, v.y);
        b.zMin = Math.min(b.zMin, v.z);
        b.zMax = Math.max(b.zMax, v.z);
        return b;
      }, {xMin: Number.MAX_VALUE,
          xMax: 0,
          yMin: Number.MAX_VALUE,
          yMax: 0,
          zMin: Number.MAX_VALUE,
          zMax: 0});
      return new THREE.Vector3((b.xMax - b.xMin) / 2,
                               (b.yMax - b.yMin) / 2,
                               (b.zMax - b.zMin) / 2);
    }
    if ('Average node position' === center_mode) {
      var nodes = Object.keys(positions),
          len = nodes.length,
          c = nodes.reduce(function(c, node) {
            var v = positions[node];
            c.x += v.x / len;
            c.y += v.y / len;
            c.z += v.z / len;
            return c;
          }, {x: 0, y: 0, z: 0});
      return new THREE.Vector3(c.x, c.y, c.z);
    }
    if ('Highest centrality node' === center_mode) {
      var c = arbor.betweennessCentrality(true),
          sorted = Object.keys(c).sort(function(a, b) {
            var c1 = c[a],
                c2 = c[b];
            return c1 === c2 ? 0 : (c1 > c2 ? 1 : -1);
          }),
          highest = sorted[Math.floor(sorted.length / 2)];
      return positions[highest];
    }
    if ('Highest signal flow centrality' === center_mode) {
      var io = connectors.reduce(function(o, row) {
        var a = o[row[2]], // row[2] is 0 for pre, 1 for post
            node = row[0],
            count = a[node];
        if (undefined === count) a[node] = 1;
        else a[node] = count + 1;
        return o;
      }, [{}, {}]); // 0 for pre, 1 for post
      if (0 === Object.keys(io[0]).length || 0 === Object.keys(io[1]).length) {
        return {error: 'No input or output synapses',
                alternative_mode: 'First branch node'};
      }
      var fc = arbor.flowCentrality(io[0], io[1]),
          sorted = Object.keys(positions).sort(function(a, b) {
            var c1 = fc[a].sum,
                c2 = fc[b].sum;
            return c1 === c2 ? 0 : (c1 > c2 ? 1 : -1);
          }),
          highest = sorted[Math.floor(sorted.length / 2)],
          max = fc[highest].sum,
          identical = sorted.filter(function(node) {
            return max === fc[node].sum;
          });
      if (identical.length > 1) {
        // Pick the most central
        var bc = arbor.betweennessCentrality(true);
        identical.sort(function(a, b) {
          var c1 = bc[a],
              c2 = bc[b];
          // Sort descending
          return c1 == c2 ? 0 : (c1 < c2 ? 1 : -1);
        });
        highest = identical[0];
      }
      return positions[highest];
    }
  };

  MorphologyPlot.prototype.draw = function() {
    var containerID = '#morphology_plot_div' + this.widgetID,
        container = $(containerID);

    // Clear existing plot if any
    container.empty();

    var zip = function(xs, ys) {
      return xs.map(function(x, i) {
        return {x: x, y: ys[i]};
      });
    };

    // Package data
    var data = Object.keys(this.lines).map(function(id) {
          var line = this.lines[id];
          return {id: id,
                  name: CATMAID.NeuronNameService.getInstance().getName(id),
                  xy: zip(line.x, line.y),
                  color: '#' + this.models[id].color.getHexString(),
                  stroke_width: "2"};
    }, this);

    this.svg = CATMAID.svgutil.insertMultiLinePlot(container, containerID, "morphology_plot" + this.widgetID, data, "distance (nm)", "value");
  };

  MorphologyPlot.prototype.createCSV = function() {
    // Find minimum and maximum values in the X axis
    var skids = Object.keys(this.lines);
    if (0 === skids.length) return;

    var xs = skids.reduce((function(o, skid) {
      return this.lines[skid].x.reduce(function(o, v) {
        o[v] = true;
        return o;
      }, o);
    }).bind(this), {});

    var xAxis = Object.keys(xs).map(Number).sort(function(a, b) {
      return a === b ? 0 : (a < b ? -1 : 1);
    });

    var csv = [this.mode + ',' + xAxis.join(',')].concat(skids.map(
          function(skid) {
            var line = this.lines[skid],
                values = line.x.reduce(
                  function(v, x, i) {
                    v[x] = line.y[i];
                    return v;
                  }, {});
             return CATMAID.NeuronNameService.getInstance().getName(skid) + ',' + xAxis.map(
               function(x) {
                 var v = values[x];
                 return undefined === v ? 0 : v;
               }).join(',');
          }, this));
    return csv.join('\n');
  };

  MorphologyPlot.prototype.exportCSV = function() {
    var blob = new Blob([this.createCSV()], {type : 'text/plain'});
    saveAs(blob, this.mode.replace(/ /g, '_') + ".csv");
  };

  MorphologyPlot.prototype.exportSVG = function() {
    CATMAID.svgutil.saveDivSVG('morphology_plot_div' + this.widgetID,
        this.mode.replace(/ /g, '_') + ".svg");
  };

  /** Perform PCA on a vector for each neuron containing the concatenation of all the following measurements:
   *
   * - cable length (smoothed)
   * - cable length of the topological tree (sum of soma to branch, branch to branch and branch to end nodes).
   * - cable length of the principal branch (smoothed).
   * - tortuosity of the principal branch (length of the smoothed principal branch divided by the Euclidean distance between soma and the end node of the branch).
   * - sum of cable length of all terminal segments.
   * - number of input synapses
   * - number of output synapses
   * - segregation index (measures whether the arbor has cleanly separated input domains and output domains, or how mixed domains are).
   * - number of branch events (a binary split counts as 2; a trinary split as 3, etc.)
   * - number of terminal nodes
   * - sum of the volumes of the 3d convex hull of each synapse cluster for a given bandwidth value.
   * - centrifugal order: number of branch nodes between a node and the soma (using the topological copy of the tree, and binning the counts for an histogram of 64 bins.
   * - degree: number of end nodes downstream of a branch node (binning the counts for an histogram of 64 bins)
   * - tree asymmetry index (van Pelt, 1992): mean of all partition asymmetries at each branch node, assuming binary branches (will consider trinary and higher as nested binary branches, considering the smallest subtree as the closest to the soma.
   * - tree asymmetry index by taking the median rather than the mean of all partition asymmetries.
   * - Sholl analysis
   * - spatial density of cable
   * - spatial density of input synapses
   * - spatial density of output synapses
   *
   *
   * See: van Pelt et al., 1992
   *      Uylings and van Pelt, 2002
   *      Torben-Nielsen, 2014
   *
   */
  MorphologyPlot.prototype.PCA = function() {
  };

  // Export widget
  CATMAID.MorphologyPlot = MorphologyPlot;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Morphology Plot",
    description: "A histogram based analysis tool working on neuron intervals",
    key: "morphology-plot",
    creator: MorphologyPlot
  });

})(CATMAID);
