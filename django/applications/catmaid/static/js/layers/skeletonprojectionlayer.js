/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This layer can project a complete skeleton into own SVG layer.
   */
  var SkeletonProjectionLayer = function(stackViewer, options) {
    this.stackViewer = stackViewer;
    // The currently displayed skeleton, node and arbor parser
    this.currentNodeID = null;
    this.currentSkeletonID = null;
    this.currentArborParser = null;

    // Make sure there is an options object
    this.options = {};
    this.updateOptions(options, true);

    // Create grid view, aligned to the upper left
    this.view = document.createElement("div");
    this.view.style.position = "absolute";
    this.view.style.left = 0;
    this.view.style.top = 0;

    // Append it to DOM
    stackViewer.getView().appendChild(this.view);

    // Create SVG
    this.paper = d3.select(this.view)
        .append('svg')
        .attr({
          width: stackViewer.viewWidth,
          height: stackViewer.viewHeight,
          style: 'overflow: hidden; position: relative;'});

    this.graphics = CATMAID.SkeletonElementsFactory.createSkeletonElements(
        this.paper, '-p' + this.stackViewer.getId());

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.update, this);

    if (options.initialNode) this.update(options.initialNode);
  };

  /**
   * The set of options and defaults.
   */
  SkeletonProjectionLayer.options = {
    opacity: 1.0,
    // Indicate if skeleton should be simplified
    simplify: false,
    // Indicate coloiring mode
    shadingMode: "plain",
    // Indicate if edges should be rendered
    showEdges: true,
    // Indicate if nodes should be rendered
    showNodes: false,
    // Color of downstream nodes and edges
    downstreamColor: "rgb(0,0,0)",
    // Color of upstream nodes and edges
    upstreamColor: "rgb(255,255,255)",
    // Limiting Strahler number for Strahler based shading.
    strahlerShadingMin: 1,
    strahlerShadingMax: -1,
    // Distance reduction per section for distance based shading
    distanceFalloff: 0.001
  };

  /**
   * Update default options
   */
  SkeletonProjectionLayer.updateDefaultOptions = function(options) {
    mergeOptions(SkeletonProjectionLayer.options, options || {},
        SkeletonProjectionLayer.options, true);
  };

  SkeletonProjectionLayer.prototype = {};

  SkeletonProjectionLayer.prototype.treenodeReference = 'treenodeCircle';
  SkeletonProjectionLayer.prototype.NODE_RADIUS = 8;

  /**
   * Update options of this layer, giving preference to option fields in the
   * passed in object. If a known object key isn't available, the default can
   * optionally be set.
   */
  SkeletonProjectionLayer.prototype.updateOptions = function(options, setDefaults) {
    mergeOptions(this.options, options || {}, SkeletonProjectionLayer.options,
        setDefaults);
  };

  /* Iterface methods */

  SkeletonProjectionLayer.prototype.getLayerName = function() {
    return "Skeleton projection";
  };

  SkeletonProjectionLayer.prototype.setOpacity = function( val ) {
      this.view.style.opacity = val;
      this.opacity = val;
  };

  SkeletonProjectionLayer.prototype.getOpacity = function() {
      return this.opacity;
  };

  SkeletonProjectionLayer.prototype.resize = function(width, height) {
    this.redraw();
  };

  SkeletonProjectionLayer.prototype.redraw = function(completionCallback) {
    // Get current field of view in stack space
    var stackViewBox = this.stackViewer.createStackViewBox();
    var projectViewBox = this.stackViewer.primaryStack.createStackToProjectBox(stackViewBox);

    var screenScale = userprofile.tracing_overlay_screen_scaling;
    this.paper.classed('screen-scale', screenScale);
    // All SVG elements scale automatcally, if the viewport on the SVG data
    // changes. If in screen scale mode, where the size of all elements should
    // stay the same (regardless of zoom level), counter acting this is required.
    var resScale = Math.max(this.stackViewer.primaryStack.resolution.x,
       this.stackViewer.primaryStack.resolution.y);
    var dynamicScale = screenScale ? (1 / (this.stackViewer.scale * resScale)) : false;

    this.graphics.scale(userprofile.tracing_overlay_scale, resScale, dynamicScale);

    // Use project coordinates for the SVG's view box
    this.paper.attr({
        viewBox: [
            stackViewBox.min.x,
            stackViewBox.min.y,
            stackViewBox.max.x - stackViewBox.min.x,
            stackViewBox.max.y - stackViewBox.min.y].join(' '),
        width: this.stackViewer.viewWidth,     // Width and height only need to be updated on
        height: this.stackViewer.viewHeight}); // resize.

    if (CATMAID.tools.isFn(completionCallback)) {
      completionCallback();
    }
  };

  SkeletonProjectionLayer.prototype.unregister = function() {
    this.stackViewer.getView().removeChild(this.view);

    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.update, this);
  };


  /* Non-interface methods */

  /**
   * Handle update of active node by redrawing.
   */
  SkeletonProjectionLayer.prototype.update = function(node) {
    var self = this;
    var newSkeleton = null;
    if (node && node.id) {
      // If possible, use a cached skeleton to avoid requesting it with every
      // node change.
      var cached = (node.skeleton_id === this.currentSkeletonID) &&
          this.currentArborParser;
      var prepare = cached ? Promise.resolve(this.currentArborParser) :
          this.loadSkeletonOfNode(node);

      prepare
        .then(this.createProjection.bind(this, node))
        .then(this.redraw.bind(this))
        .catch(CATMAID.error);
    } else {
     this.redraw();
    }
  };

  /**
   * Return promise to load the skeleton of which the given node is part of. If
   * the skeleton is already loaded, the back-end does't have to be asked.
   */
  SkeletonProjectionLayer.prototype.loadSkeletonOfNode = function(node) {
    return new Promise(function(resolve, reject) {
      if (!node) reject("No node provided");
      if (!node.skeleton_id) reject("Node has no skeleton");

      var self = this, failed = false, ap;
      fetchSkeletons(
          [node.skeleton_id],
          function(skid) {
            // Get arbor with node and connectors, but without tags
            return django_url + project.id + '/' + skid + '/1/1/0/compact-arbor';
          },
          function(skid) { return {}; },
          function(skid, json) {
            ap = new CATMAID.ArborParser().init('compact-arbor', json);
          },
          function(skid) {
            failed = true;
          },
          function() {
            if (failed) {
              reject("Skeletons that failed to load: " + failed);
            } else {
              resolve(ap);
            }
          });
        });
  };

  /**
   * Empty canvas.
   */
  SkeletonProjectionLayer.prototype.clear = function() {
    this.paper.selectAll('use').remove();
    this.paper.selectAll('line').remove();
  };

  /**
   * Recreate the SVG display.
   */
  SkeletonProjectionLayer.prototype.createProjection = function(node, arborParser) {
    // Empty space
    this.clear();

    // Return, if there is no node
    if (!arborParser) return;

    // Make sure we deal with a real node
    var nodeID = SkeletonAnnotations.isRealNode(node.id) ? node.id :
      SkeletonAnnotations.getParentOfVirtualNode(node.id);

    // Store current targets
    this.currentSkeletonID = node.skeleton_id;
    this.currentArborParser = arborParser;
    this.currentNodeID = nodeID;

    // Get nodes
    var arbor = arborParser.arbor;

    var split = {};
    split[nodeID] = true;
    var fragments = arbor.split(split);
    var downstream = fragments[0];
    var upstream = fragments[1];

    var createShading = SkeletonProjectionLayer.shadingModes[this.options.shadingMode];
    if (!createShading) {
      throw new CATMAID.ValueError("Couldn't find shading method " +
          this.shadingMode);
    }

    // Construct rendering option context
    var renderOptions = {
      positions: arborParser.positions,
      edges: arbor.edges,
      stackViewer: this.stackViewer,
      paper: this.paper,
      ref: this.graphics.Node.prototype.USE_HREF + this.graphics.USE_HREF_SUFFIX,
      color: this.options.downstreamColor,
      shade: createShading(this, arbor, downstream),
      edgeWidth: this.graphics.ArrowLine.prototype.EDGE_WIDTH || 2,
      showEdges: this.options.showEdges,
      showNodes: this.options.showNodes
    };

    // Render downstream nodes
    downstream.nodesArray().forEach(renderNodes, renderOptions);

    // If there is also an upstream part, show it as well
    if (upstream) {
      var parentID = SkeletonAnnotations.isRealNode(node.parent_id) ?
        node.parent_id : SkeletonAnnotations.getParentOfVirtualNode(node.parent_id);
      // Make sure we look at upstream like we look at downstream
      upstream = upstream.reroot(parentID);

      // Update render options with upstream color
      renderOptions.color = this.options.upstreamColor;
      renderOptions.shade = createShading(this, arbor, upstream);

      // Render downstream nodes
      upstream.nodesArray().forEach(renderNodes, renderOptions);
    }

    /**
     * Render nodes on a D3 paper.
     */
    function renderNodes(n, i, nodes) {
      /* jshint validthis: true */ // `this` is bound to a set of options above

      // render node that are not in this layer
      var stack = this.stackViewer.primaryStack;
      var pos = this.positions[n];
      var xs = stack.projectToStackX(pos.z, pos.y, pos.x);
      var ys = stack.projectToStackY(pos.z, pos.y, pos.x);
      var zs = stack.projectToStackZ(pos.z, pos.y, pos.x);
      var opacity = this.shade(n, pos, zs);

      // Display only nodes and edges not on the current section
      if (zs !== this.stackViewer.z) {
        if (this.showNodes) {
          var c = this.paper.select('.nodes').append('use')
            .attr({
              'xlink:href': '#' + this.ref,
              'x': xs,
              'y': ys,
              'fill': this.color,
              'opacity': opacity})
            .classed('overlay-node', true);
        }

        if (this.showEdges) {
          var e = this.edges[n];
          if (e) {
            var pos2 = this.positions[e];
            var xs2 = stack.projectToStackX(pos2.z, pos2.y, pos2.x);
            var ys2 = stack.projectToStackY(pos2.z, pos2.y, pos2.x);
            var edge = this.paper.select('.lines').append('line');
            edge.toBack();
            edge.attr({
                x1: xs, y1: ys,
                x2: xs2, y2: ys2,
                stroke: this.color,
                'stroke-width': this.edgeWidth,
                'opacity': opacity
            });
          }
        }
      }
    }
  };

  /**
   * A set of shading modes for the projected skeleton parts. Each function
   * returns a color based on a node distance and world position.
   */
  SkeletonProjectionLayer.shadingModes = {

    /**
     * Shade a skeleton with a plain color for upstream and downstream nodes.
     */
    "plain": function(layer, arbor, subarbor) {
      return function (node, pos, zStack) {
        return 1;
      };
    },

    /**
     * Shade a skeleton with increasing transparency based on Strahler numbers.
     */
    "strahlergradient": function(layer, arbor, subarbor) {
      var strahler = arbor.strahlerAnalysis();
      var minStrahler = layer.options.strahlerShadingMin;
      var maxStrahler = layer.options.strahlerShadingMax;

      // Clamp min Strahler to lowest possible Strahler, if it is disabled
      if (minStrahler < 0) minStrahler = 1;

      // Find maximum available Strahler and set max Strahler to it, if disabled
      var maxAvailableStrahler =  Object.keys(strahler).reduce((function(max, n) {
        var s = this[n];
        return s > max ? s : max;
      }).bind(strahler), 0);

      if (maxStrahler < 0 || maxStrahler > maxAvailableStrahler) {
        maxStrahler = maxAvailableStrahler;
      }

      var relMaxStrahler = maxStrahler - minStrahler + 1;

      return function(node, pos, zStack) {
        // Normalize Strahler to min/max range
        var s = strahler[node] - minStrahler + 1;
        return (s > 0 &&  s <= relMaxStrahler) ? s / maxStrahler: 0;
      };
    },

    /**
     * Shade a skeleton with increasing transparency based on Strahler numbers.
     * This variant works relative to the current node.
     */
    "relstrahlergradient": function(layer, arbor, subarbor) {
      var absStrahler = SkeletonProjectionLayer.shadingModes['strahlergradient'];
      return absStrahler(layer, subarbor, subarbor);
    },

    /**
     * Display only part of a skeleton based on Strahler numbers.
     */
    "strahlercut": function(layer, arbor, subarbor) {
      var strahler = arbor.strahlerAnalysis();
      var minStrahler = layer.options.strahlerShadingMin;
      var maxStrahler = layer.options.strahlerShadingMax;

      // Clamp min Strahler to lowest possible Strahler, if it is disabled
      if (minStrahler < 0) minStrahler = 1;

      // Set max allowed Strahler to infinity, if disabled
      if (maxStrahler < 0) maxStrahler = Number.POSITIVE_INFINITY;

      var relMaxStrahler = maxStrahler - minStrahler + 1;

      return function(node, pos, zStack) {
        // Normalize Strahler to min/max range
        var s = strahler[node] - minStrahler + 1;
        return (s > 0 && s <= relMaxStrahler) ? 1 : 0;
      };
    },

    /**
     * Shade a skeleton with increasing transparency based on Strahler numbers.
     * This variant works relative to the current node.
     */
    "relstrahlercut": function(layer, arbor, subarbor) {
      var absStrahler = SkeletonProjectionLayer.shadingModes['strahlercut'];
      return absStrahler(layer, subarbor, subarbor);
    },

    /**
     * Reduce opacity linearly with increasing Z distance.
     */
    "zdistance": function(layer, arbor, subarbor) {
      var falloff = layer.options.distanceFalloff;
      var stackViewer = layer.stackViewer;
      return function(node, pos, zStack) {
        var zDist = Math.abs(zStack - stackViewer.z);
        return Math.max(0, 1 - falloff * zDist);
      };
    }
  };

  /**
   * Merge source fields into key if they appear in defaults, if a default does
   * not exist in the source, set it optionally to the default.
   */
  var mergeOptions = function(target, source, defaults, setDefaults) {
    // Only allow options that are defined in the default option list
    for (var key in defaults) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      } else if (setDefaults &&
          defaults.hasOwnProperty(key)) {
        target[key] = defaults[key];
      }
    }
  };

  // Make layer available in CATMAID namespace
  CATMAID.SkeletonProjectionLayer = SkeletonProjectionLayer;

})(CATMAID);
