/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This layer display landmark information, which are semantically annotated
   * points, grouped into landmark groups.
   */
  var LandmarkLayer = function(stackViewer, options) {
    this.stackViewer = stackViewer;
    this.isHideable = true;

    this.nodes = new Map();
    this.options = {};
    this.updateOptions(options, true);
    this.opacity = 1.0;

    this._loading = false;
    this._currentZIndex = new Map();

    CATMAID.PixiLayer.call(this);
    this.displayTransformations = [];

    // A set of custom models that allows custom coloring of nodes
    this.skeletonDisplayModels = new Map();

    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
    this.graphics = CATMAID.SkeletonElementsFactory.createSkeletonElements({
        pixiLayer: this,
        stackViewer: stackViewer,
        skeletonDisplayModels: this.skeletonDisplayModels
      },
      this.batchContainer);
  };

  LandmarkLayer.prototype = Object.create(CATMAID.PixiLayer.prototype);
  LandmarkLayer.prototype.constructor = LandmarkLayer;

  /**
   * The set of options and defaults.
   */
  LandmarkLayer.options = {
    // A color that is used instead of a skeleton color
    overrideColor: false,
    // An extra scaling factor to apply to nodes and edge.
    scale: 1.0,
    // A color map of skeleton IDs vs. skeleton models
    colorMap: false,
  };

  /**
   * Update current node coloring.
   */
  LandmarkLayer.prototype.initColors = function() {
    if (this.options.overrideColor) {
      this.skeletonDisplayModels = new Map();
      if (this.graphics) {
        this.graphics.overlayGlobals.skeletonDisplayModels = this.skeletonDisplayModels;
      }
      for (let node of this.nodes.values()) {
        let model = this.skeletonDisplayModels.get(node.skeleton_id);
        if (!model) {
          this.skeletonDisplayModels.set(node.skeleton_id, new CATMAID.SkeletonModel(
              node.skeleton_id, '', new THREE.Color(this.options.overrideColor)));
        }
      }
    } else if (this.options.colorMap) {
      this.skeletonDisplayModels = this.options.colorMap;
      if (this.graphics) {
        this.graphics.overlayGlobals.skeletonDisplayModels = this.skeletonDisplayModels;
      }
    } else {
      // Reset color override models
      this.skeletonDisplayModels = new Map();
      if (this.graphics) {
        this.graphics.overlayGlobals.skeletonDisplayModels = this.skeletonDisplayModels;
      }
    }
  };

  /**
   * Update options of this layer, giving preference to option fields in the
   * passed in object. If a known object key isn't available, the default can
   * optionally be set.
   */
  LandmarkLayer.prototype.updateOptions = function(options, setDefaults, redraw) {
    let overrideColorsChanged = this.options.overrideColor !== options.overrideColor;
    let overrideColorsEnabled = overrideColorsChanged && !this.options.overrideColor;
    let overrideColorsDisabled = overrideColorsChanged && !options.overrideColor;

    CATMAID.mergeOptions(this.options, options || {}, LandmarkLayer.options,
        setDefaults);

    if (options.colorMap) {
      this.initColors(options);

      // Update colors
      for (let node of this.nodes.values()) {
        node.updateColors();
      }
    } else if (overrideColorsChanged) {
      if (overrideColorsEnabled || overrideColorsDisabled) {
        this.initColors(options);
      } else {
        // Update color
        for (let m of this.skeletonDisplayModels.values()) {
          m.color.setStyle(options.overrideColor);
        }
      }

      // Update colors
      for (let node of this.nodes.values()) {
        node.updateColors();
      }
    }

    if (redraw) {
      this.redraw();
    }
  };

  /* Iterface methods */

  LandmarkLayer.prototype.getLayerName = function() {
    return "Landmarks";
  };

  LandmarkLayer.prototype.resize = function(width, height) {
    this.redraw();
  };

  /**
   * Remove all currently displayed transformations.
   */
  LandmarkLayer.prototype.clearTransformations = function() {
    this.displayTransformations.length = 0;
  };

  /**
   * Add a display transformation to the layer.
   */
  LandmarkLayer.prototype.showLandmarkTransform = function(transformation) {
    this.displayTransformations.push(transformation);
  };

  /**
   * Adjust rendering to current field of view.
   */
  LandmarkLayer.prototype.redraw = function(completionCallback) {
    // Get current field of view in stack space
    var stackViewBox = this.stackViewer.createStackViewBox();
    var projectViewBox = this.stackViewer.primaryStack.createStackToProjectBox(stackViewBox);

    // If there are nodes available, find the ones on the current section
    if (this._currentZIndex.size > 0) {
      let zIndex = this._currentZIndex;
      let currentZ = this.stackViewer.z;
      let nextZ = this.stackViewer.z + 1;
      let primaryStack = this.stackViewer.primaryStack;
      // Render intersection of each available skeleton with the current
      // section.
      let nodesOnSection = zIndex.get(this.stackViewer.z);

      if (nodesOnSection && nodesOnSection.size > 0) {
        this.nodes = new Map();
        // Prepare existing Node and ConnectorNode instances for reuse
        this.graphics.resetCache();
        var addedNodes = [];

        // Add regular nodes
        for (let a of nodesOnSection) {
          // Add all nodes along with their parents and children
          // [id, parent_id, user_id, location_x, location_y, location_z, radius, confidence].
          var stackZ = primaryStack.projectToUnclampedStackZ(a[5], a[4], a[3]);
          let newNode = this.graphics.newNode(a[0], null, a[1], a[6],
              a[3], a[4], a[5], stackZ - currentZ, a[7], a[8],
              0, a[2]);
          this.nodes.set(a[0], newNode);
          addedNodes.push(newNode);
        }

        // Add virtual nodes and link parent with children
        for (let b of nodesOnSection) {
          var n = this.nodes.get(b[0]);
          var pn = this.nodes.get(b[1]); // parent Node

          // Neither virtual nodes or other parent/child links need to be created if
          // there is no parent node.
          if (!pn) {
            continue;
          }

          // Virtual nodes can only exists if both parent and child are not on the
          // current section and not both above or below.
          if ((n.zdiff < 0 && pn.zdiff > 0) || (n.zdiff > 0 && pn.zdiff < 0)) {
            var vn = CATMAID.createVirtualNode(this.graphics, n, pn, this.stackViewer);
            if (vn) {
              n.parent = vn;
              n.parent_id = vn.id;
              pn.addChildNode(vn);
              vn.addChildNode(n);
              this.nodes.set(vn.id, vn);
              addedNodes.push(vn);
              continue;
            }
          }

          // If no virtual node was inserted, link parent and child normally.
          n.parent = pn;
          // update the parent's children
          pn.addChildNode(n);
        }

        // Disable most unused node instances, keeping a small caching buffer.
        this.graphics.disableBeyond(addedNodes.length, 0);

        this.initColors();

        // Draw node edges and circles, including the ones for virtual nodes.
        for (var i=0, imax=addedNodes.length; i<imax; ++i) {
          addedNodes[i].createGraphics();
        }

        // Update colors
        for (let node of this.nodes.values()) {
          node.updateColors();
        }
      } else {
        for (let node of this.nodes.values()) {
          node.disable();
        }
        this.nodes = new Map();
      }

      var screenScale = CATMAID.TracingOverlay.Settings.session.screen_scaling;
      // All graphics elements scale automatcally.
      // If in screen scale mode, where the size of all elements should
      // stay the same (regardless of zoom level), counter acting this is required.
      var dynamicScale = screenScale ? (1 / this.stackViewer.scale) : false;

      let userScaleFactor = this.options.scale;
      this.graphics.scale(
          CATMAID.TracingOverlay.Settings.session.scale * userScaleFactor,
          this.stackViewer.primaryStack.minPlanarRes,
          dynamicScale);

      // In case of a zoom level change and screen scaling is selected, update
      // edge width.
      if (this.displayTransformations.length > 0 && (userScaleFactor * this.stackViewer.s) !== this.lastScale) {
        // Remember current zoom level
        this.lastScale = userScaleFactor * this.stackViewer.s;
        // Update edge width
        var edgeWidth = this.graphics.Node.prototype.EDGE_WIDTH || 2;
        this.graphics.containers.lines.children.forEach(function (line) {
          line.graphicsData[0].lineWidth = edgeWidth;
          line.dirty++;
          line.clearDirty++;
        });
        this.graphics.containers.nodes.children.forEach(function (c) {
          c.scale.set(this.graphics.Node.prototype.stackScaling);
        }, this);
      }
    }

    var planeDims = this.stackViewer.primaryStack.getPlaneDimensions();
    this.batchContainer.scale.set(this.stackViewer.pxPerNm());
    this.batchContainer.position.set(
        -projectViewBox.min[planeDims.x] * this.stackViewer.pxPerNm(),
        -projectViewBox.min[planeDims.y] * this.stackViewer.pxPerNm());

    this._renderIfReady();

    if (CATMAID.tools.isFn(completionCallback)) {
      completionCallback();
    }
  };

  /**
   * Virtual skeleton nodes can't be selected at the moment. Instead a short
   * message is displayed.
   */
  LandmarkLayer.prototype.getClosestNode = function(xs, ys, zs, radius,
      respectVirtualNodes) {
    var xdiff,
        ydiff,
        zdiff,
        distsq,
        mindistsq = radius * radius,
        nearestnode = null,
        node,
        nodeid;

    var x = this.stackViewer.primaryStack.stackToProjectX(zs, ys, xs),
        y = this.stackViewer.primaryStack.stackToProjectY(zs, ys, xs),
        z = this.stackViewer.primaryStack.stackToProjectZ(zs, ys, xs);

    if (typeof respectVirtualNodes === 'undefined') respectVirtualNodes = true;

    // Add an virual node check, if wanted
    var nodeIsValid = SkeletonAnnotations.validNodeTest(respectVirtualNodes);

    for (let nodeid of this.nodes.keys()) {
      if (nodeIsValid(this.nodes, nodeid)) {
        node = this.nodes.get(nodeid);
        xdiff = x - node.x;
        ydiff = y - node.y;
        zdiff = z - node.z;
        // Must discard those not within current z
        if (!node.isVisible()) continue;
        distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
        if (distsq < mindistsq) {
          mindistsq = distsq;
          nearestnode = node;
        }
      }
    }

    if (nearestnode) {
      CATMAID.msg("Virtual skeleton",
          "Landmark layer skeleton nodes can't be selected. Mapped node #" +
          nearestnode.id + " is closest.");
    }

    return null;
  };

  function makeDataPromise(context, skeleton) {
    // The context 'this' is expected to be a LandmarkSkeletonTransformation.
    context.target.push(context.transform.nodeProvider.get(skeleton.id));
    return context;
  }

  /**
   * Update the internal representations of virtual skeletons.
   */
  LandmarkLayer.prototype.update = function() {
    if (this._loading) {
      return;
    }
    let dataRetrievalJobs = [];
    // Find intersections with current stack Z and
    for (let i=0; i<this.displayTransformations.length; ++i) {
      let transform = this.displayTransformations[i];
      if (!transform.nodeProvider) {
        continue;
      }
      transform.skeletons.reduce(makeDataPromise, {
        target: dataRetrievalJobs,
        transform: transform
      });
    }

    if (dataRetrievalJobs.length > 0) {
      this._loading = true;
    }

    let self = this;
    let availableSkeletonData = new Map();
    Promise.all(dataRetrievalJobs)
      .then(function(results) {
        self._loading = false;

        // Build stack Z based index
        let zIndex = self._currentZIndex;
        let stack = self.stackViewer.primaryStack;
        zIndex.clear();

        for (let i=0; i<self.displayTransformations.length; ++i) {
          let transform = self.displayTransformations[i];
          let skeletonIds = transform.skeletons.map(m => m.id);

          for (let j=0; j<skeletonIds.length; ++j) {
            let skeletonId = skeletonIds[j];
            let skeletonData = transform.skeletonCache ? transform.skeletonCache[skeletonId] : null;
            if (!skeletonData) {
              CATMAID.warn("Couldn't find data for skeleton " + skeletonId);
              continue;
            }

            let ap = new CATMAID.ArborParser().init('compact-skeleton', skeletonData);
            let stackZMap = new Map();
            let nodeMap = new Map();
            let successors = ap.arbor.allSuccessors();
            availableSkeletonData.set(skeletonId, {
              arborParser: ap,
              nodes: nodeMap,
              successorMap: successors,
              stackZMap: stackZMap
            });

            // Get stack Z of each node
            let nodes = skeletonData[0];
            for (let k=0, kmax=nodes.length; k<kmax; ++k) {
              // We need the skeleton ID for rendering
              let node = nodes[k].concat(parseInt(skeletonId, 10));
              let nodeX = node[3],
                  nodeY = node[4],
                  nodeZ = node[5];
              let nodeStackZ = stack.projectToUnclampedStackZ(nodeZ, nodeY, nodeX);
              stackZMap.set(node[0], nodeStackZ);
              nodeMap.set(node[0], node);
            }

            // Put it in Z index.
            for (let k=0, kmax=nodes.length; k<kmax; ++k) {
              let node = nodeMap.get(nodes[k][0]);
              let nodeStackZ = stackZMap.get(node[0]);

              if (!(node && nodeStackZ !== undefined)) {
                throw new CATMAID.ValueError("Could not find node or its stack space Z coordinate");
              }

              // Add node to Z index
              let zBucket = zIndex.get(nodeStackZ);
              if (!zBucket) {
                zBucket = new Set();
                zIndex.set(nodeStackZ, zBucket);
              }
              zBucket.add(node);

              // Add all children
              let children = successors[node[0]];
              for (let c=0; c<children.length; ++c) {
                zBucket.add(nodeMap.get(parseInt(children[c], 10)));
              }

              // Add parent node, if this is no root
              let parentId = node[1];
              if (parentId) {
                let parentNode = nodeMap.get(parentId);
                zBucket.add(parentNode);
                // Add parent and this node also to every section between them.
                let parentStackZ = stackZMap.get(parentId);
                let zDiff = nodeStackZ - parentStackZ;
                let zStep = zDiff > 0 ? -1 : 1;
                for (let z=nodeStackZ; z !== parentStackZ; z += zStep) {
                  let isectZBucket = zIndex.get(z);
                  if (!isectZBucket) {
                    isectZBucket = new Set();
                    zIndex.set(z, isectZBucket);
                  }
                  isectZBucket.add(node);
                  isectZBucket.add(parentNode);
                }
              }
            }
          }
        }

        self.redraw();
      })
      .catch(CATMAID.handleError);
  };

  LandmarkLayer.prototype.unregister = function() {
    CATMAID.PixiLayer.prototype.unregister.call(this);
  };

  // Export layer
  CATMAID.LandmarkLayer = LandmarkLayer;

})(CATMAID);
