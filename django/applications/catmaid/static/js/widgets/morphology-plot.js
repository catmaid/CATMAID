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

    this.centerMode = 'first-branch';
    this.interpolationMode = 'basis';

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
             'Radial density of output synapses',
             'Radial density of gap junctions',
             'Radial density of desmosomes']);

        controls.appendChild(document.createTextNode(' Radius (nm): '));
        var radius = document.createElement('input');
        radius.setAttribute("id", "morphology_plot_step" + this.widgetID);
        radius.setAttribute("type", "text");
        radius.setAttribute("value", "1000");
        radius.style.width = "40px";
        controls.appendChild(radius);

        let centerModes = ['first-branch', 'root', 'active-node', 'bb-center',
            'tagged-closest-root', 'tagged-distal-root', 'average-node-position',
            'highest-centrality', 'highest-signal-flow'];
        CATMAID.DOM.appendElement(controls, {
          type: 'select',
          relativeId: "center",
          label: ' Center: ',
          entries: centerModes.map(cm => {
            return {
              title: MorphologyPlot.CenterModes[cm].name,
              value: cm,
            };
          }),
          title: "The strategy how to select the center node of a skeleton.",
          value: this.centerMode,
          onchange: e => {
            this.centerMode = e.target.value;
            let tagField = document.getElementById(`morphology-plot-center-tag-${this.widgetID}`);
            tagField.disabled = !(this.centerMode.startsWith('tagged') && tagField);
            this.redraw();
          },
        });

        CATMAID.DOM.appendElement(controls, {
          id: `morphology-plot-center-tag-${this.widgetID}`,
          type: 'text',
          label: 'Tag',
          title: 'The tag used for tag based center computation',
          value: this.centerTag,
          disabled: !this.centerMode.startsWith('tagged'),
          onchange: event => {
            this.centerTag = event.target.value.trim();
          },
          onenter: event => {
            this.redraw();
          },
        });

        CATMAID.DOM.appendElement(controls, {
          type: 'select',
          relativeId: "interpolation",
          label: 'Interpolation',
          entries: MorphologyPlot.InterpolationModes.map(cm => {
            return {
              title: cm.name,
              value: cm.value,
            };
          }),
          title: "The strategy how to interpolate between sample points. Chooise 'linear' for no interpolation.",
          value: this.interpolationMode,
          onchange: e => {
            this.interpolationMode = e.target.value;
            this.redraw();
          },
        });

        var redraw = document.createElement('input');
        redraw.setAttribute("type", "button");
        redraw.setAttribute("value", "Redraw");
        redraw.onclick = this.redraw.bind(this);
        controls.appendChild(redraw);
      },
      createContent: function(content) {},
      helpPath: 'morphology-plot.html',
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

  MorphologyPlot.prototype.removeSkeletons = function(skeletonIds) {
    skeletonIds.forEach(skeletonId => {
      delete this.models[skeletonId];
      delete this.lines[skeletonId];
    });
    this.redraw();
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
          return `${project.id}/${skeleton_id}/1/1/compact-skeleton`;
        },
        function(skeleton_id) { return {}; }, // post
        (function(skeleton_id, json) {
          this.lines[skeleton_id] = {nodes: json[0],
                                     connectors: json[1].filter(function(con) {
                                       // Keep only known connector types
                                       return con[2] === 0 || con[2] === 1 || con[2] === 2 || con[2] === 3;
                                     }),
                                     tags: json[2]};
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
    var center = this._computeCenter(this.centerMode, arbor, positions, line.connectors, line.tags);
    if (center.error) {
      CATMAID.warn(`${center.error} for ${CATMAID.NeuronNameService.getInstance().getName(skeleton_id)}`);
      center = this._computeCenter(center.alternative_mode, arbor, positions, line.connectors, line.tags);
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
      } else if (endsWith(this.mode, 'gap junctions')) {
        ps = line.connectors.reduce(function(o, row) {
          if (2 === row[2]) o[row[0]] = positions[row[0]];
          return o;
        }, {});
      } else if (endsWith(this.mode, 'desmosomes')) {
        ps = line.connectors.reduce(function(o, row) {
          if (3 === row[2]) o[row[0]] = positions[row[0]];
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

  MorphologyPlot.prototype._computeCenter = function(centerMode, arbor, positions, connectors, tags) {
    let centerStrategy = MorphologyPlot.CenterModes[centerMode];
    if (!centerStrategy) {
      throw new CATMAID.ValueError(`Unknown center mode: ${centerMode}`);
    }
    return centerStrategy.getCenter(this, arbor, positions, connectors, tags);
  };

  MorphologyPlot.CenterModes = {
    'root': {
      name: 'Root node',
      getCenter: (widget, arbor, positions, connectors) => {
        return positions[arbor.root];
      }
    },
    'active-node': {
      name: 'Active node',
      getCenter: (widget, arbor, positions, connectors) => {
        return SkeletonAnnotations.getActiveNodeProjectVector3();
      }
    },
    'first-branch': {
      name: 'First branch node',
      getCenter: (widget, arbor, positions, connectors) => {
        let node = arbor.nextBranchNode(arbor.root);
        return positions[null === node ? arbor.root : node];
      }
    },
    'bb-center': {
      name: 'Bounding box center',
      getCenter: (widget, arbor, positions, connectors) => {
        let b = Object.keys(positions).reduce(function(b, node) {
          let v = positions[node];
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
    },
    'average-node-position': {
      name: 'Average node position',
      getCenter: (widget, arbor, positions, connectors) => {
        let nodes = Object.keys(positions),
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
    },
    'highest-centrality': {
      name: 'Highest centrality node',
      getCenter: (widget, arbor, positions, connectors) => {
        let c = arbor.betweennessCentrality(true),
            sorted = Object.keys(c).sort(function(a, b) {
              var c1 = c[a],
                  c2 = c[b];
              return c1 === c2 ? 0 : (c1 > c2 ? 1 : -1);
            }),
            highest = sorted[Math.floor(sorted.length / 2)];
        return positions[highest];
      }
    },
    'highest-signal-flow': {
      name: 'Highest signal flow centrality',
      getCenter: (widget, arbor, positions, connectors) => {
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
                  alternative_mode: 'first-branch'};
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
    },
    'tagged-closest-root': {
      name: 'Tagged node closest to root',
      getCenter: (widget, arbor, positions, connectors, tags) => {
        let error;
        let taggedNodes = tags[widget.centerTag];
        let result = {};
        // We need a copy, because the distance computation involves rerooting.
        // Technically, we don't need this, because we compare against root, but to
        // avoid potential changes, a copy is safer to operate on and isn't expensive in
        // this context.
        let arborCopy = arbor.clone();

        if (taggedNodes && taggedNodes.length > 0) {
          if (taggedNodes.length === 1) {
            return positions[taggedNodes[0]];
          }
          let centerNodeId, minNode, minDistance = Infinity;
          for (let treenodeId of taggedNodes) {
            let distance = CATMAID.Skeletons.distanceBetweenNodesInArbor(arborCopy, positions,
                arbor.root, treenodeId);
            if (distance < minDistance) {
              minDistance = distance;
              minNode = treenodeId;
            }
          }
          if (minNode) {
            return positions[minNode];
          }
          error = 'Could not find minimum distance node';
        } else {
          error = 'No nodes with this tag found. Using root instead.';
        }
        return  {
          error: error,
          alternative_mode: 'root',
        };
      }
    },
    'tagged-distal-root': {
      name: 'Tagged node most distant from root',
      getCenter: (widget, arbor, positions, connectors, tags) => {
        let error;
        let taggedNodes = tags[widget.centerTag];
        let result = {};
        // We need a copy, because the distance computation involves rerooting.
        // Technically, we don't need this, because we compare against root, but to
        // avoid potential changes, a copy is safer to operate on and isn't expensive in
        // this context.
        let arborCopy = arbor.clone();

        if (taggedNodes && taggedNodes.length > 0) {
          if (taggedNodes.length === 1) {
            return positions[taggedNodes[0]];
          }
          let centerNodeId, maxNode, maxDistance = -Infinity;
          for (let treenodeId of taggedNodes) {
            let distance = CATMAID.Skeletons.distanceBetweenNodesInArbor(arborCopy, positions,
                arbor.root, treenodeId);
            if (distance > maxDistance) {
              maxDistance = distance;
              maxNode = treenodeId;
            }
          }
          if (maxNode) {
            return positions[maxNode];
          }
          error = 'Could not find maximum distance node';
        } else {
          error = 'No nodes with this tag found. Using root instead.';
        }
        return  {
          error: error,
          alternative_mode: 'root',
        };
      }
    },
  };

  MorphologyPlot.InterpolationModes = [{
    name: 'Basis spline',
    value: 'basis',
  }, {
    name: 'Linear',
    value: 'linear',
  }, {
    name: 'Cardinal spline',
    value: 'cardinal',
  }, {
    name: 'Monotone',
    value: 'monotone',
  }, {
    name: 'Step before',
    value: 'step-before',
  }, {
    name: 'Step after',
    value: 'step-after',
  }];

  MorphologyPlot.prototype.draw = function() {
    var containerID = '#morphology_plot_div' + this.widgetID,
        container = $(containerID);

    if (this.centerMode.startsWith('tagged') && (!this.centerTag || this.centerTag.length === 0)) {
      CATMAID.warn('A tag based center mode is selected, but no tag is provided');
      return;
    }

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

    this.svg = CATMAID.svgutil.insertMultiLinePlot(container, containerID,
      `morphology_plot${this.widgetID}`, data, "distance (nm)", "value",
      this.interpolationMode);
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
