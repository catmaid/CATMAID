/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This layer can project a complete skeleton into own SVG layer.
   */
  var SkeletonProjectionLayer = function(stackViewer, options) {
    this.stackViewer = stackViewer;

    // Make sure there is an options object
    options = options || {};
    this.opacity = options.opacity || 1.0;

    // The currently displayed skeleton arbor instance
    this.currentSkeleton = null;
    // Indicate if skeleton should be simplified
    this.simplify = false;

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

  SkeletonProjectionLayer.prototype = {};

  SkeletonProjectionLayer.prototype.treenodeReference = 'treenodeCircle';
  SkeletonProjectionLayer.prototype.NODE_RADIUS = 8;

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
    var dynamicScale = screenScale ? (1 / this.stackViewer.scale) : false;

    this.graphics.scale(userprofile.tracing_overlay_scale, resScale, dynamicScale);

    // Use project coordinates for the SVG's view box
    this.paper.attr({
        viewBox: [
            projectViewBox.min.x,
            projectViewBox.min.y,
            projectViewBox.max.x - projectViewBox.min.x,
            projectViewBox.max.y - projectViewBox.min.y].join(' '),
        width: this.stackViewer.viewWidth,     // Width and height only need to be updated on
        height: this.stackViewer.viewHeight}); // resize.
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
    if (node && node.skeleton_id !== this.curentSkeletonID) {
      this.loadSkeletonOfNode(node)
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
      if (!node) reject("No node provided")
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

    // Get coordinates of node in stack space
    //var stack = self.stackViewer.primaryStack;

    var arbor = arborParser.arbor;
    var nodesToOrder = arbor.nodesOrderFrom(node.id);

    if (this.simplify) {
      var keepers = {};
      arbor = arbor.simplify(keepers);
    }

    var nodes = arbor.nodesArray();
    nodes.forEach(function(n, i, nodes) {
      // render node that are not in this layerA
      var pos = this.positions[n];
      var zs = this.stackViewer.primaryStack.projectToStackZ(pos.z, pos.y, pos.x);
      if (zs !== this.stackViewer.z) {
        var c = this.paper.select('.nodes').append('use')
          .attr({
            'xlink:href': '#' + this.ref,
            'x': pos.x,
            'y': pos.y,
            'fill': this.fillColor})
          .classed('overlay-node', true);

        var e = this.edges[n];
        if (e) {
          var pos2 = this.positions[e];
          var edge = this.paper.select('.lines').append('line');
          edge.toBack();
          edge.attr({
              x1: pos.x, y1: pos.y,
              x2: pos2.x, y2: pos2.y,
              stroke: this.fillColor,
              'stroke-width': this.edgeWidth
          });
        }
      }
    }, {
      positions: arborParser.positions,
      edges: arbor.edges,
      stackViewer: this.stackViewer,
      paper: this.paper,
      ref: this.graphics.Node.prototype.USE_HREF + this.graphics.USE_HREF_SUFFIX,
      fillColor: "rgb(128,0,200)",
      edgeWidth: this.graphics.ArrowLine.prototype.EDGE_WIDTH || 2
    });
  };

  // Make layer available in CATMAID namespace
  CATMAID.SkeletonProjectionLayer = SkeletonProjectionLayer;

})(CATMAID);
