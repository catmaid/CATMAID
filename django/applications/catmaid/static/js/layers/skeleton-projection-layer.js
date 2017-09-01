/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This layer can project a complete skeleton into own tracing layer.
   */
  var SkeletonProjectionLayer = function(stackViewer, options) {
    this.stackViewer = stackViewer;
    CATMAID.PixiLayer.call(this);
    this.isHideable = true;
    // The currently displayed skeleton, node and arbor parser
    this.currentProjections = new Map();
    this.currentReferenceNodes = new Map();

    // Make sure there is an options object
    this.options = {};
    this.updateOptions(options, true);
    this.opacity = 1.0;

    // This layer has its own skeleton source, which is used to subscribe to
    // other sources. The local skeleton source is configured to override its
    // skeleton models with subscription input.
    this.useSourceColors = false;
    this.selectionBasedSource = true;
    this.skeletonSource = new CATMAID.BasicSkeletonSource('Skeleton projection layer', {
      owner: this,
      handleAddedModels: this.update.bind(this),
      handleRemovedModels: this.update.bind(this),
      handleChangedModels: this._updateModels.bind(this),
    });
    this.skeletonSource.ignoreLocal = true;

    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
    this.graphics = CATMAID.SkeletonElementsFactory.createSkeletonElements(
      {pixiLayer: this},
      this.batchContainer);

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);

    // Subscribe to active skeleton by default
    var initialSource = (options && options.source) ? options.source : SkeletonAnnotations.activeSkeleton;
    if (initialSource) {
      this.replaceSupscription(initialSource);
      this.update();
    }
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
    downstreamColor: 0x000000,
    // Color of upstream nodes and edges
    upstreamColor: 0xFFFFFF,
    // Use source skeleton model colors
    preferSourceColor: true,
    // Limiting Strahler number for Strahler based shading.
    strahlerShadingMin: 1,
    strahlerShadingMax: -1,
    // Distance reduction per section for distance based shading
    distanceFalloff: 0.001,
    // Last used available source
    source: null
  };

  /**
   * Update default options
   */
  SkeletonProjectionLayer.updateDefaultOptions = function(options) {
    mergeOptions(SkeletonProjectionLayer.options, options || {},
        SkeletonProjectionLayer.options, true);
  };

  SkeletonProjectionLayer.prototype = Object.create(CATMAID.PixiLayer.prototype);
  SkeletonProjectionLayer.prototype.constructor = SkeletonProjectionLayer;

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
    // Replace source subscription only if source isn't part of current
    // subscriptions or if there is no subscribed source at the moment.
    var source = options ? options.source : null;
    var subscribedSource = this.getSubscribedSource();
    if (this.skeletonSource && source) {
      if (!subscribedSource || (subscribedSource && subscribedSource !== source)) {
        this.replaceSupscription(source);
      }
      // Re-create graphics
      this.update();
    }
  };

  var hasSource = function(subscription) {
    return subscription.source === this;
  };

  /**
   * Reset the default and instance source to the active skeleton.
   */
  SkeletonProjectionLayer.prototype._resetSource = function() {
    var options = {
      source: SkeletonAnnotations.activeSkeleton
    };
    CATMAID.SkeletonProjectionLayer.updateDefaultOptions(options);
    this.updateOptions(options);
  };

  /**
   * Replace the current subsciption with a new one to the given source.
   *
   * @param {Object} source The source to subscribe to now
   */
  SkeletonProjectionLayer.prototype.replaceSupscription = function(source) {
    if (source) {
      // Remove existing subscriptions, but silent removal fall-back to not add
      // the active skeleton as source just before we add a new one.
      this.skeletonSource.off(this.skeletonSource.EVENT_SUBSCRIPTION_REMOVED, this._resetSource, this);
      this.skeletonSource.removeAllSubscriptions();
      // Add new subscription
      this.skeletonSource.addSubscription(new CATMAID.SkeletonSourceSubscription(
            source, this.useSourceColors, this.selectionBasedSource, CATMAID.UNION));
      // If the subscription gets removed, reset to the default active skeleton
      this.skeletonSource.on(this.skeletonSource.EVENT_SUBSCRIPTION_REMOVED,
          this._resetSource, this);
    } else {
      this.skeletonSource.removeAllSubscriptions();
    }
  };

  /**
   * Get source the projection layer is currently subscribed to.
   */
  SkeletonProjectionLayer.prototype.getSubscribedSource = function() {
    if (this.skeletonSource) {
      // Expect exatly one subscription
      var subscription = this.skeletonSource.getSourceSubscriptions()[0];
      if (subscription) {
        return subscription.source;
      }
    }
    // Default to active skeleton
    return null;
  };

  /* Iterface methods */

  SkeletonProjectionLayer.prototype.getLayerName = function() {
    return "Skeleton projection";
  };

  SkeletonProjectionLayer.prototype.resize = function(width, height) {
    this.redraw();
  };

  /**
   * Adjust rendering to current field of view. No projections are added or
   * removed.
   */
  SkeletonProjectionLayer.prototype.redraw = function(completionCallback) {

    // Get current field of view in stack space
    var stackViewBox = this.stackViewer.createStackViewBox();
    var projectViewBox = this.stackViewer.primaryStack.createStackToProjectBox(stackViewBox);

    var screenScale = SkeletonAnnotations.TracingOverlay.Settings.session.screen_scaling;
    // All graphics elements scale automatcally.
    // If in screen scale mode, where the size of all elements should
    // stay the same (regardless of zoom level), counter acting this is required.
    var resScale = Math.max(this.stackViewer.primaryStack.resolution.x,
       this.stackViewer.primaryStack.resolution.y);
    var dynamicScale = screenScale ? (1 / this.stackViewer.scale) : false;

    this.graphics.scale(
        SkeletonAnnotations.TracingOverlay.Settings.session.scale,
        resScale,
        dynamicScale);

    // In case of a zoom level change and screen scaling is selected, update
    // edge width.
    if (this.currentProjections.size > 0 && this.stackViewer.s !== this.lastScale) {
      // Remember current zoom level
      this.lastScale = this.stackViewer.s;
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

    this.batchContainer.scale.set(this.stackViewer.scale);
    this.batchContainer.position.set(
        -stackViewBox.min.x*this.stackViewer.scale,
        -stackViewBox.min.y*this.stackViewer.scale);

    this._renderIfReady();

    if (CATMAID.tools.isFn(completionCallback)) {
      completionCallback();
    }
  };

  SkeletonProjectionLayer.prototype.unregister = function() {
    CATMAID.PixiLayer.prototype.unregister.call(this);
    this.skeletonSource.destroy();

    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };


  /* Non-interface methods */

  var removeKnownFromMap = function(list, value, key) {
    if (-1 === list.indexOf(key)) {
      this.delete(key);
    }
  };

  var hasNot = function(item) {
    return !this.has(item);
  };

  /**
   * Update the internal representation of all projections. Missing projections
   * will be created (e.g. when new skeletons have been added to the source) and
   * obsolete ones will be removed.
   */
  SkeletonProjectionLayer.prototype.update = function() {
    var self = this;
    // To unify tests below, we make sure all skeleton IDs are strings
    var currentSkeletons = this.skeletonSource.getSelectedSkeletonModels();
    var currentSkeletonIds = Object.keys(currentSkeletons);

    if (0 === currentSkeletonIds.length) {
      this.currentProjections.clear();
      this.clear();
      this.redraw();
    } else {
      // Remove obsolete projections
      this.currentProjections.forEach(
          removeKnownFromMap.bind(this.currentProjections, currentSkeletonIds));
      // Find new skeletons
      var added = currentSkeletonIds.filter(hasNot.bind(this.currentProjections));

      // If possible, use cached skeletons to avoid requesting them with every
      // display update.
      var prepare = (0 === added.length) ? Promise.resolve(self.currentProjections) :
        this.loadSkeletons(added).then(function(apMap) {
          var projections = self.currentProjections;
          apMap.forEach(setMapReverse.bind(projections));
          return projections;
        });

      // If there is an active node, use it as reference for its skeleton
      this.currentReferenceNodes.clear();
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      if (!SkeletonAnnotations.isRealNode(activeNodeId)) {
        // Use parent in case of a virtual node. This isn't ideal as long
        // as edge coloring can't be split between two vertices. It is however
        // consistent behavior.
        activeNodeId = SkeletonAnnotations.getParentOfVirtualNode(activeNodeId);
      }
      if (activeNodeId) {
        this.currentReferenceNodes.set(
            // We normalize all IDs to strings in this module
            String(SkeletonAnnotations.getActiveSkeletonId()),
            String(activeNodeId));
      }

      prepare
        .then(this.createProjections.bind(this, currentSkeletons))
        .then(this.redraw.bind(this))
        .catch(CATMAID.error);
    }
  };

  var setMapReverse = function(value, key) {
    this.set(key, value);
  };

  /**
   * Redraw the skeleton if the active node changed.
   */
  SkeletonProjectionLayer.prototype.handleActiveNodeChange = function(node, skeletonChanged) {
    var nReferenceNodes = this.currentReferenceNodes.size,
        replacesSelection = node && (nReferenceNodes > 0),
        firstSelection = node && (nReferenceNodes === 0),
        lastSelection = !node && (nReferenceNodes > 0),
        referenceNode = replacesSelection ?
            this.currentReferenceNodes.entries().next().value : null,
        differentSkeleton = replacesSelection && node.skeleton_id === referenceNode[0];

    if ((firstSelection || lastSelection || differentSkeleton) ||
        (replacesSelection && node.id !== referenceNode[1])) {
      this.update();
    }
    // TODO: Update colors
  };

  /**
   * Reload skeleton properties if skeleton models changed.
   */
  SkeletonProjectionLayer.prototype._updateModels = function(models) {
    // TODO: If source colors should be used, update coloring
  };

  /**
   * Return promise to load all requested skeletons. If the skeleton is already
   * loaded, the back-end does't have to be asked.
   */
  SkeletonProjectionLayer.prototype.loadSkeletons = function(skeletonIds) {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (!skeletonIds) reject("No skeletons provided");

      var failed = false, targetMap = new Map();
      fetchSkeletons(
          skeletonIds,
          function(skid) {
            // Get arbor with nodes and connectors, but without tags
            return django_url + project.id + '/' + skid + '/1/1/0/compact-arbor';
          },
          function(skid) { return {}; },
          function(skid, json) {
            var ap = new CATMAID.ArborParser().init('compact-arbor', json);
            // Trasnform positons into stack space. This makes lookup later on
            // quicker.
            var stack = self.stackViewer.primaryStack;
            for (var nodeID in ap.positions) {
              var pos = ap.positions[nodeID];
              pos.set(stack.projectToStackX(pos.z, pos.y, pos.x),
                      stack.projectToStackY(pos.z, pos.y, pos.x),
                      stack.projectToStackZ(pos.z, pos.y, pos.x));
            }
            targetMap.set(skid, ap);
          },
          function(skid) {
            failed = true;
          },
          function() {
            if (failed) {
              reject("Skeletons that failed to load: " + failed);
            } else {
              resolve(targetMap);
            }
          });
        });
  };

  /**
   * Empty canvas.
   */
  SkeletonProjectionLayer.prototype.clear = function() {
    if (this.graphics) {
      this.graphics.containers.nodes.children.forEach(function (child) {
        if (child) {
          child.destroy();
        }
      });
      this.graphics.containers.nodes.removeChildren();
      this.graphics.containers.lines.children.forEach(function (child) {
        if (child) {
          child.destroy();
        }
      });
      this.graphics.containers.lines.removeChildren();
    }
  };

  /**
   * Recreate the graphics display.
   *
   * @param {Object} arborParserMap Maps skeleton IDs to arbor parser instances.
   */
  SkeletonProjectionLayer.prototype.createProjections = function(skeletonModels, arborParserMap) {
    // Empty space
    this.clear();

    // Return, if there is no node
    if (!arborParserMap) return;

    var currentStackZ = this.stackViewer.z;
    arborParserMap.forEach(function(ap, skid) {
      // Find a good reference node for current Z. Take the closest node to the
      // current section.
      var nodeId = this.currentReferenceNodes.has(skid) ?
        this.currentReferenceNodes.get(skid) : getClosestNodeInZ(ap, currentStackZ);
      if (null !== nodeId) {
        // Add projection to D3 paper
        this._createProjection(nodeId, ap, skeletonModels[skid]);
      }
    }, this);
  };

  /**
   * Render graphics output for a given skeleton, represented by an arbor
   * parser with respect to a given node in this skeleton.
   *
   * @param {ArborParser} arborParser An arbor parser for a given skeleton
   */
  SkeletonProjectionLayer.prototype._createProjection = function(nodeId, arborParser, skeletonModel) {

    // Get nodes
    var arbor = arborParser.arbor;
    var split = {};
    split[nodeId] = true;
    var fragments = arbor.split(split);
    var downstream = fragments[0];
    var upstream = fragments[1];

    var material = SkeletonProjectionLayer.shadingModes[this.options.shadingMode];
    if (!material) {
      throw new CATMAID.ValueError("Couldn't find material method " + this.shadingMode);
    }

    // Allow opacity-only definitions for simplicity
    if (CATMAID.tools.isFn(material)) {
      material = {
        opacity: material,
        color: function(layer, color) {
          return function() { return color; };
        }
      };
    }

    var downstreamColor = this.options.preferSourceColor && skeletonModel ?
      skeletonModel.color.getHex() : this.options.downstreamColor;

    // Construct rendering option context
    var renderOptions = {
      positions: arborParser.positions,
      edges: arbor.edges,
      stackViewer: this.stackViewer,
      graphics: this.graphics,
      color: material.color(this, downstreamColor),
      opacity: material.opacity(this, arbor, downstream),
      edgeWidth: this.graphics.Node.prototype.EDGE_WIDTH || 2,
      showEdges: this.options.showEdges,
      showNodes: this.options.showNodes
    };

    // Render downstream nodes
    downstream.nodesArray().forEach(renderNodes, renderOptions);

    // If there is also an upstream part, show it as well
    if (upstream) {
      // Get *real* parent node of reference node
      var parentId = arbor.edges[nodeId];
      // Make sure we look at upstream like we look at downstream
      upstream = upstream.reroot(parentId);

      var upstreamColor = this.options.preferSourceColor && skeletonModel ?
        skeletonModel.color.getHex() : this.options.upstreamColor;

      // Update render options with upstream color
      renderOptions.color = material.color(this, upstreamColor);
      renderOptions.opacity = material.opacity(this, arbor, upstream);

      // Render downstream nodes
      upstream.nodesArray().forEach(renderNodes, renderOptions);
    }
  };

  /**
   * Render nodes in a Pixi context.
   */
  function renderNodes(n, i, nodes) {
    /* jshint validthis: true */ // `this` is bound to a set of options above

    // render node that are not in this layer
    var stack = this.stackViewer.primaryStack;
    // Positions are already transformed into stack space
    var pos = this.positions[n];
    var opacity = this.opacity(n, pos, pos.z);
    var color = this.color(n, pos, pos.z);

    // Display only nodes and edges not on the current section
    if (pos.z !== this.stackViewer.z) {
      if (this.showNodes) {
        var c = new PIXI.Sprite(this.graphics.Node.prototype.NODE_TEXTURE);
        c.anchor.set(0.5);
        c.x = pos.x;
        c.y = pos.y;
        c.scale.set(this.graphics.Node.prototype.stackScaling);
        c.tint = color;
        c.alpha = opacity;
        this.graphics.containers.nodes.addChild(c);
      }

      if (this.showEdges) {
        var e = this.edges[n];
        if (e) {
          var pos2 = this.positions[e];
          var edge = new PIXI.Graphics();
          edge.lineStyle(this.edgeWidth, 0xFFFFFF, opacity);
          edge.moveTo(pos.x, pos.y);
          edge.lineTo(pos2.x, pos2.y);
          edge.tint = color;
          this.graphics.containers.lines.addChild(edge);
        }
      }
    }
  }

  /**
   * Get the node closest to the given position in a certain radius around it,
   * if any.
   */
  SkeletonProjectionLayer.prototype.getClosestNode = function(x, y, radius) {
    var nearestnode = null;
    var nearestpos = null;
    var mindistsq = radius * radius;
    // Find a node close to this location
    this.currentProjections.forEach(function(ap, skid) {
      var positions = ap.positions;
      for (var nodeID in positions) {
        var pos = positions[nodeID];
        var xdiff = x - pos.x;
        var ydiff = y - pos.y;
        var distsq = xdiff*xdiff + ydiff*ydiff;
        if (distsq < mindistsq) {
          mindistsq = distsq;
          nearestnode = nodeID;
          nearestpos = pos;
        }
      }
    });
    return nearestnode ?
        {id: nearestnode,
         node: {x: nearestpos.x, y: nearestpos.y, z: nearestpos.z},
         distsq: mindistsq} :
        null;
  };

  /**
   * Starting from the root, get the closest node to a given Z. Nodes in the
   * given arbor parser have to be in stack space already.
   */
  var getClosestNodeInZ = function(arborParser, z) {
    var nearestnode = null;
    var mindist = Number.MAX_VALUE;
    // Find a node close to this location
    var positions = arborParser.positions;
    for (var nodeID in positions) {
      var pos = positions[nodeID];
      var zdiff = Math.abs(z - pos.z);
      if (zdiff < mindist) {
        mindist = zdiff;
        nearestnode = nodeID;
        // Stop if distance is zero
        if (mindist < 0.0001) {
          break;
        }
      }
    }
    return nearestnode;
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
    },

    /**
     * Change skeleton color towards plain colors with increasing Z distance.
     */
    "skeletoncolorgradient": {
      "opacity": function(layer, arbor, subarbor) {
        return function(node, pos, zStack) {
          return 1;
        };
      },
      "color": function(layer, color) {
        var falloff = layer.options.distanceFalloff;
        var stackViewer = layer.stackViewer;
        var from = CATMAID.tools.cssColorToRGB(
            SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color);
        var to = CATMAID.tools.cssColorToRGB(color);
        return function(node, pos, zStack) {
          // Merge colors
          var zDist = Math.abs(zStack - stackViewer.z);
          var factor = Math.max(0, 1 - falloff * zDist);
          var invFactor = 1 - factor;
          var r = Math.round((from.r * factor + to.r * invFactor) * 255);
          var g = Math.round((from.g * factor + to.g * invFactor) * 255);
          var b = Math.round((from.b * factor + to.b * invFactor) * 255);
          return "rgb(" + r + "," + g + "," + b + ")";
        };
      }
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
