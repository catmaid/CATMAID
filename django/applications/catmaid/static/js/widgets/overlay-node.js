/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  project,
  SkeletonAnnotations,
*/


(function(CATMAID) {

  "use strict";

  var lineNormal = function (x1, y1, x2, y2) {
    return setLineNormal(x1, y1, x2, y2, [null, null]);
  };

  let setLineNormal = function(x1, y1, x2, y2, target) {
    var xdiff = x2 - x1,
        ydiff = y2 - y1,
        length = Math.sqrt(xdiff*xdiff + ydiff*ydiff),
        // Compute normal of edge from edge. If node and parent are at
        // the same location, hardwire to offset vertically to prevent NaN x, y.
        nx = length === 0 ? 0 : -ydiff / length,
        ny = length === 0 ? 1 : xdiff / length;

    target[0] = nx;
    target[1] = ny;
    return target;
  };

  var RADII_VISIBILITY = ['none', 'active-node', 'active-skeleton', 'all'];

  /**
   * Construct new SkeletonElement instances with this factory.
   */
  CATMAID.SkeletonElementsFactory = (function() {
    return {
      /**
       * Create a new SkeletonInstance and return it.
       */
      createSkeletonElements: function(tracingOverlay, pixiContainer, skeletonDisplayModels) {
        // Add prototype
        SkeletonElements.prototype = createSkeletonElementsPrototype(tracingOverlay);

        return new SkeletonElements(tracingOverlay, pixiContainer, skeletonDisplayModels);
      }
    };
  })();

  var NODE_PARAMS = {
    ringWeightPx: 2,
    crossWeightPx: 2,
    crossRadiusPx: 3,
    bullseyeRadiusPx: 1,
    innerRingPpn: 0.4
  };

  /**
   * Create a white disc/spot
   *
   * @param radius
   */
  var makeDisc = function(radius) {
    return new PIXI.Graphics()
      .beginFill(0xFFFFFF)
      .drawCircle(0, 0, radius)
      .endFill();
  };

  /**
   * Create a white ring
   *
   * @param radius
   * @param ringWeight
   */
  var makeRing = function(radius, ringWeight) {
    return new PIXI.Graphics()
      .lineStyle(ringWeight, 0xFFFFFF)
      .drawCircle(0, 0, radius);
  };

  /**
   * Create a white target (2 concentric rings). If innerRingPpn is falsey, 0.5 will be used.
   *
   * @param radius
   * @param ringWeight
   * @param innerRingPpn : 0 < innerPpn <= 1; radius of the inner ring, as a proportion of the outer.
   */
  var makeTarget = function(radius, ringWeight, innerRingPpn) {
    innerRingPpn = innerRingPpn || 0.5;

    return makeRing(radius, ringWeight)
      .drawCircle(0, 0, radius * innerRingPpn);
  };

  /**
   * Create a white crosshair. If crossRadius is falsey, radius is used.
   *
   * @param radius
   * @param ringWeight
   * @param crossWeight
   * @param crossRadius
   */
  var makeCrosshair = function(radius, ringWeight, crossWeight, crossRadius) {
    crossRadius = crossRadius || radius;
    return makeRing(radius, ringWeight)
      .lineStyle(crossWeight, 0xFFFFFF)
      .moveTo(-crossRadius, 0)
      .lineTo(crossRadius, 0)
      .moveTo(0, -crossRadius)
      .lineTo(0, crossRadius);
  };

  /**
   * Create a white bullseye
   *
   * @param radius
   * @param ringWeight
   * @param bullseyeRadius
   */
  var makeBullseye = function(radius, ringWeight, bullseyeRadius) {
    return makeRing(radius, ringWeight)
      .beginFill(0xFFFFFF)
      .drawCircle(0, 0, bullseyeRadius)
      .endFill();
  };

  /** Namespace where graphics element instances are created, cached and edited. */
  var SkeletonElements = function (tracingOverlay, pixiContainer, skeletonDisplayModels) {
    this.overlayGlobals = {
      tracingOverlay: tracingOverlay,
      skeletonElements: this,
      skeletonDisplayModels: skeletonDisplayModels || new Map(),
      hideOtherSkeletons: false
    };

    // Let (concrete) element classes initialize any shared resources
    // required by their instances. Even though called statically, initDefs is an
    // instance (prototype) method so that we can get overriding inheritance of
    // pseudo-static variables.
    var concreteElements = [
      SkeletonElements.prototype.Node.prototype,
      SkeletonElements.prototype.ConnectorNode.prototype,
      SkeletonElements.prototype.ArrowLine.prototype,
    ];

    this.initTextures = function(force) {
        concreteElements.forEach(function (klass) {
          klass.overlayGlobals = this.overlayGlobals;
          klass.initTextures(force);
        }, this);
    };

    this.initTextures();

    // Create element groups to enforce drawing order: lines, arrows, nodes, labels
    this.containers = ['lines', 'arrows', 'nodes', 'labels'].reduce(function (o, name) {
      o[name] = pixiContainer.addChild(new PIXI.Container());
      return o;
    }, {});

    this.cache = {
      nodePool: new ElementPool(100, 1.2),
      connectorPool: new ElementPool(20, 1.2),
      arrowPool: new ElementPool(50, 1.2),

      clear: function() {
        this.nodePool.clear();
        this.connectorPool.clear();
        this.arrowPool.clear();
      },

      reset: function() {
        this.nodePool.reset();
        this.connectorPool.reset();
        this.arrowPool.reset();
      }
    };


////// Definition of classes used in SkeletonElements

    this.destroy = function() {
      this.cache.clear();
      Object.keys(this.containers).forEach(function (name) {
        var container = this.containers[name];
        container.parent.removeChild(container);
        container.destroy();
      }, this);
    };

    this.scale = function(baseScale, resScale, dynamicScale) {
      // Check for unchanged scale to prevent unnecessary SVG manipulation.
      if (this.scales &&
          this.scales.base === baseScale &&
          this.scales.res === resScale &&
          this.scales.dyn == dynamicScale) return;
      this.scales = {base: baseScale, res: resScale, dyn: dynamicScale};

      concreteElements.forEach(function (klass) {
        klass.scale(baseScale, resScale, dynamicScale);
      });
    };

    this.setNodeRadiiVisibility = function (visibility) {
      SkeletonElements.prototype.Node.prototype.radiiVisibility = RADII_VISIBILITY.indexOf(visibility);
    };

    /** Invoked at the start of the continuation that updates all nodes. */
    this.resetCache = function() {
      this.cache.reset();
    };

    this.init = function(dToSecBefore, dToSecAfter) {
      dToSecBefore = (null === dToSecBefore) ? -1 : dToSecBefore;
      dToSecAfter = (null === dToSecAfter) ? 1 : dToSecAfter;
      this.NodePrototype.dToSecBefore = dToSecBefore;
      this.NodePrototype.dToSecAfter = dToSecAfter;
    };

    /** Disable all cached Node instances at or beyond the cutoff index,
     * preserving up to 100 disabled nodes and 20 disabled connector nodes,
     * and removing the rest from the cache.
     * Invoked at the end of the continuation that updates all nodes. */
    this.disableBeyond = function(nodeCuttoff, connectorCuttoff) {
      this.cache.nodePool.disableBeyond(nodeCuttoff);
      this.cache.connectorPool.disableBeyond(connectorCuttoff);
    };

    this.disableRemainingArrows = function() {
      // Cut cache array beyond used arrows plus 50, and obliterate the rest
      this.cache.arrowPool.disableBeyond(this.cache.arrowPool.nextIndex);
    };

    this.createArrow = (function(arrowPool, ArrowLine) {
      return function(connector, node, confidence, relationId, relationName, outwards) {
        var arrow = arrowPool.next();
        if (!arrow) {
          arrow = new ArrowLine();
          arrowPool.push(arrow);
        }
        arrow.init(connector, node, confidence, relationId, relationName, outwards);
        return arrow;
      };
    })(this.cache.arrowPool, this.ArrowLine);

    /** Surrogate constructor that may reuse an existing, cached Node instance currently not in use.
     * Appends any newly created instances to the pool. */
    this.newNode = function(
      id,         // unique id for the node from the database
      parent,     // the parent node, if present within the subset of nodes retrieved for display; otherwise null.
      parent_id,  // the id of the parent node, or null if it is root
      radius,
      x,          // the x coordinate in project coordinates
      y,          // the y coordinate in project coordinates
      z,          // the z coordinate in project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence,
      skeleton_id,// the id of the skeleton this node is an element of
      edition_time, // The last time this node was edited by a user
      user_id)   // id of the user who owns the node
    {
      var node = this.cache.nodePool.next();
      if (node) {
        node.reInit(id, parent, parent_id, radius, x, y, z, zdiff, confidence,
            skeleton_id, edition_time, user_id);
      } else {
        node = new this.Node(id, parent, parent_id, radius,
            x, y, z, zdiff, confidence, skeleton_id, edition_time, user_id);
        this.cache.nodePool.push(node);
      }
      return node;
    };

    /** Surrogate constructor for ConnectorNode.
     * See "newNode" for explanations. */
    this.newConnectorNode = function(
      id,         // unique id for the node from the database
      x,          // the x coordinate in project coordinates
      y,          // the y coordinate in project coordinates
      z,          // the z coordinate in project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence,
      subtype,
      edition_time, // last time this connector wsa edited by a user
      user_id)   // id of the user who owns the node
    {
      var connector = this.cache.connectorPool.next();
      if (connector) {
        connector.reInit(id, x, y, z, zdiff, confidence, subtype, edition_time, user_id);
      } else {
        connector = new this.ConnectorNode(id, x, y, z,
            zdiff, confidence, subtype, edition_time, user_id);
        connector.createArrow = this.createArrow;
        this.cache.connectorPool.push(connector);
      }
      return connector;
    };

    this.newLinkNode = function(id, node, relation_id, relation_name, confidence, edition_time, outwards) {
      return new this.ConnectorLink(id, node, relation_id, relation_name, confidence, edition_time, outwards);
    };
  };

  ////// Definition of classes used in SkeletonElements

  var createSkeletonElementsPrototype = function(tracingOverlay) {
    var ptype = {};

    /**
     * Add a epoch based time field and a corresponding _iso_str version to a
     * <target>.
     */
    var addIsoTimeAccessor = function(target, fieldName) {
      // Create accessor for a string version of the edition time, which is
      // internally stored as a second based epoch time number (which is how
      // Postgres stores is). It has to be multiplied by 1000 to work with
      // JavaScript's millisecond based Date.
      Object.defineProperty(target, fieldName + '_iso_str', {
        get: function() {
          return (new Date(this[fieldName] * 1000)).toISOString();
        },
        set: function(value) {
          this[fieldName] = (new Date(value)).getTime() / 1000.0;
        }
      });
    };


    /** A prototype for both Treenode and Connector. */
    ptype.NodePrototype = new (function() {
      this.CONFIDENCE_FONT_PT = 15;
      this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      this.scaledConfidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      // Store current node scaling factor
      this.scaling = 1.0;
      this.baseScale = 1.0;
      this.stackScaling = 1.0;
      // this.resolutionScale = 1.0;
      this.radiiVisibility = RADII_VISIBILITY.indexOf('none');
      // Store current section distance to next and previous sections. These can
      // be changed to correct for broken nodes.
      this.dToSecBefore = -1;
      this.dToSecAfter = 1;

      this.markerType = 'disc';

      // Compute the planar X, Y and Z dimensions in stack space for the tracing
      // overlay of this prototype hierarchy. We don't expect this to change
      // during the lifetime of a SkeletonElements instance.

      this.planeX = (function () {
        switch (tracingOverlay.stackViewer.primaryStack.orientation) {
          case CATMAID.Stack.ORIENTATION_ZY:
            return 'z';
          default:
            return 'x';
        }
      })();

      this.planeY = (function () {
        switch (tracingOverlay.stackViewer.primaryStack.orientation) {
          case CATMAID.Stack.ORIENTATION_XZ:
            return 'z';
          default:
            return 'y';
        }
      })();

      this.planeZ = (function () {
        switch (tracingOverlay.stackViewer.primaryStack.orientation) {
          case CATMAID.Stack.ORIENTATION_XZ:
            return 'y';
          default:
            return 'z';
        }
      })();

      /**
       * Create the node graphics elements.
       */
      this.createCircle = function() {
        if (!this.shouldDisplay()) {
          return;
        }
        // c may already exist if the node is being reused
        if (!this.c) {
          // create a circle object
          this.c = new PIXI.Sprite(this.NODE_TEXTURE);
          this.c.anchor.set(0.5);
          this.c.interactive = true;
          this.c.hitArea = new PIXI.Circle(0, 0, this.NODE_RADIUS + this.CATCH_RADIUS);
          this.c.node = this;

          this.overlayGlobals.skeletonElements.containers.nodes.addChild(this.c);

          ptype.pointerEventManager.attach(this.c, this.type);
        }

        this.c.x = this[this.planeX];
        this.c.y = this[this.planeY];
        this.c.scale.set(this.stackScaling);

        this.c.tint = this.color();

        this.c.visible = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups(false));
      };

      this.createRadiusGraphics = function () {
        var shouldDrawRadius = false;
        if (this.radiiVisibility &&
            this.shouldDisplay() &&
            this.radius > 0) {
          if (this.radiiVisibility === 1) {
            // Active node
            shouldDrawRadius = SkeletonAnnotations.getActiveNodeId() === this.id;
          } else if (this.radiiVisibility === 2) {
            // Active skeleton
            shouldDrawRadius = SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id;
          } else {
            // All
            shouldDrawRadius = true;
          }
        }

        if (shouldDrawRadius) {
          if (!this.radiusGraphics) {
            this.radiusGraphics = new PIXI.Graphics();
            this.overlayGlobals.skeletonElements.containers.lines.addChild(this.radiusGraphics);
          }

          this.radiusGraphics.clear();
          this.radiusGraphics.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
          this.radiusGraphics.drawCircle(0, 0, this.radius);
          this.radiusGraphics.tint = this.c.tint;
          this.radiusGraphics.visible = this.c.visible;
          this.radiusGraphics.x = this[this.planeX];
          this.radiusGraphics.y = this[this.planeY];
        } else if (this.radiusGraphics) {
          this.radiusGraphics.parent.removeChild(this.radiusGraphics);
          this.radiusGraphics.destroy();
          this.radiusGraphics = null;
        }
      };

      /** Recreate the GUI components, namely the circle and edges.
       *  This is called only when creating a single node. */
      this.createGraphics = function() {
        this.createCircle();
        this.createRadiusGraphics();
        this.drawEdges(false);
      };

      this.shouldDisplay = function() {
        return this.id !== this.DISABLED && this.zdiff >= 0 && this.zdiff < 1;
      };

      this.isVisible = function () {
        return this.shouldDisplay() &&
            SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups(false));
      };

      this.updateVisibility = function (noCache) {
        if (this.c) {
          var visible = this.isVisible();
          this.c.visible = visible;
          if (this.radiusGraphics) {
            this.radiusGraphics.visible = visible;
          }
        }
        if (this.line) {
          this.line.visible = this.parent &&
            this.mustDrawLineWith(this.parent) &&
            !this.line.tooShort &&
            SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups(noCache));
        }
      };

      /** Whether the user has edit permissions for this node. */
      this.canEdit = function () {
        return CATMAID.session.is_superuser || CATMAID.session.domain.has(this.user_id);
      };

      /** Draw a line with the other node if this or the other should be displayed. */
      this.mustDrawLineWith = function(node) {
        return this.shouldDisplay()
            || (node && node.shouldDisplay())
            || (node && (Math.sign(this.zdiff) * Math.sign(node.zdiff) === -1));
      };

      this.scale = function(baseScale, resScale, dynamicScale) {
        var oldScaling = this.scaling;
        // this.resolutionScale = resScale;
        this.baseScale = baseScale;
        this.stackScaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        this.scaling = baseScale * (dynamicScale ? dynamicScale : 1);
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * this.stackScaling;//baseScale * (dynamicScale ? 1 : resScale);
        this.scaledConfidenceFontSize = this.CONFIDENCE_FONT_PT * this.stackScaling + 'pt';
        this.textResolution = resScale;

        this.pixelsPerUnitSq = 1 / (this.stackScaling * this.stackScaling);

        if (oldScaling !== this.scaling) this.initTextures();
      };

      /**
       * Generic constructor for node marker of various types
       */
      this.makeMarker = function() {
        var args = NODE_PARAMS;
        var radiusPx = this.NODE_RADIUS * this.baseScale;
        switch (this.markerType) {
          case 'crosshair':
            return makeCrosshair(radiusPx, args.ringWeightPx, args.crossWeightPx, args.crossRadiusPx);
          case 'ring':
            return makeRing(radiusPx, args.ringWeightPx);
          case 'target':
            return makeTarget(radiusPx, args.ringWeightPx, args.innerRingPpn);
          case 'bullseye':
            return makeBullseye(radiusPx, args.ringWeightPx, args.bullseyeRadiusPx);
          default:
            return makeDisc(radiusPx);
        }
      };

      this.initTextures = function () {
        var g = this.makeMarker();

        var tracingOverlay = this.overlayGlobals.tracingOverlay;
        var texture = tracingOverlay.pixiLayer._context.renderer.generateTexture(g, PIXI.settings.SCALE_MODES, 1);

        if (this.NODE_TEXTURE) {
          var oldBaseTexture = this.NODE_TEXTURE.baseTexture;
          this.NODE_TEXTURE.baseTexture = texture.baseTexture;
          oldBaseTexture.destroy();
        } else {
          this.NODE_TEXTURE = texture;
        }

        // this.NODE_TEXTURE.update();
      };

      addIsoTimeAccessor(this, 'edition_time');
    })();

    ptype.AbstractTreenode = function() {
      // For drawing:
      this.NODE_RADIUS = 3; // In nm stack size (or fixed screen size at scale 0).
      this.CATCH_RADIUS = 6;
      this.BASE_EDGE_WIDTH = 2;
      this.MIN_EDGE_LENGTH_SQ = 4; // Minimum size in px for edges to be drawn.

      // ID of the disabled nodes
      this.DISABLED = -1;

      this.type = SkeletonAnnotations.TYPE_NODE;

      this.addChildNode = function(childNode) {
        this.children.set(childNode.id, childNode);
      };

      this.removeChildNode = function (childNode) {
        this.children.delete(childNode.id);
      };

      this.linkConnector = function(connectorId, link) {
        this.connectors.set(connectorId, link);
      };

      this.shouldDisplay = function () {
        return this.id !== this.DISABLED && this.zdiff >= 0 && this.zdiff < 1 &&
            (!this.overlayGlobals.hideOtherSkeletons ||
             this.overlayGlobals.skeletonDisplayModels.has(this.skeleton_id));
      };

      // A shared empty list to indicate the absence of associated visibility
      // groups to save memory in situations with many treenodes.
      let _emptyVisibilityGroupList = [];

      /**
       * Set and returns the list of visibility groups associated with this
       * treenode. If there are no visibility groups associated, a sharead empty
       * list is returned.
       */
      this.getVisibilityGroups = function (noCache) {
        if (this.visibilityGroups && !noCache) return this.visibilityGroups;

        let visibilityGroups;
        for (var groupID = SkeletonAnnotations.VisibilityGroups.groups.length - 1; groupID >= 0; groupID--) {
          if (SkeletonAnnotations.VisibilityGroups.isNodeInGroup(groupID, this)) {
            if (!visibilityGroups) visibilityGroups = [];
            visibilityGroups.push(groupID);
          }
        }

        this.visibilityGroups = visibilityGroups ? visibilityGroups : _emptyVisibilityGroupList;
        return this.visibilityGroups;
      };

      /**
       * Return the node color depending on its distance from the current slice,
       * whether it's the active node, the root node, a leaf node, or in
       * an active skeleton.
       *
       * @return {number}           Hex color.
       */
      this.color = function() {
        var model = this.overlayGlobals.skeletonDisplayModels.get(this.skeleton_id);
        if (model) return this.colorCustom(model.color);
        var color;
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            color = CATMAID.TracingOverlay.Settings.session.active_node_color;
          } else {
            if (this.overlayGlobals.tracingOverlay.isVirtualNodeSuppressed(this.id)) {
              color = CATMAID.TracingOverlay.Settings.session.active_suppressed_virtual_node_color;
            } else {
              color = CATMAID.TracingOverlay.Settings.session.active_virtual_node_color;
            }
          }
        } else if (null === this.parent_id) {
          // The root node should be colored red unless it's active:
          color = CATMAID.TracingOverlay.Settings.session.root_node_color;
        } else if (0 === this.children.size) {
          color = CATMAID.TracingOverlay.Settings.session.leaf_node_color;
        } else {
          // If none of the above applies, just colour according to the z difference.
          color = this.colorFromZDiff();
        }

        return color;
      };

      /**
       * Return the node color as a function of its skeleton model's color
       * depending on its distance from the current slice, whether it is the
       * active node, the root node, a leaf node, or in an active skeleton.
       *
       * @param  {THREE.Color} baseColor Node's skeleton model base color.
       * @return {number}                Hex color.
       */
      this.colorCustom = function (baseColor) {
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            return CATMAID.TracingOverlay.Settings.session.active_node_color;
          } else {
            if (this.overlayGlobals.tracingOverlay.isVirtualNodeSuppressed(this.id)) {
              return CATMAID.TracingOverlay.Settings.session.active_suppressed_virtual_node_color;
            } else {
              return CATMAID.TracingOverlay.Settings.session.active_virtual_node_color;
            }
          }
        } else if (null === this.parent_id) {
          return baseColor.clone().offsetHSL(0, 0, 0.25).getHex();
        } else if (0 === this.children.size) {
          return baseColor.clone().offsetHSL(0, 0, -0.25).getHex();
        } else {
          // If none of the above applies, just colour according to the z difference.
          return this.colorCustomFromZDiff(baseColor);
        }
      };

      /**
       * Return a color depending upon some conditions, such as whether the
       * zdiff with the current section is positive, negative, or zero, and
       * whether the node belongs to the active skeleton.
       *
       * @return {number}                Hex color.
       */
      this.colorFromZDiff = function() {
        var model = this.overlayGlobals.skeletonDisplayModels.get(this.skeleton_id);
        if (model) return this.colorCustomFromZDiff(model.color);
        // zdiff is in sections, therefore the current section is at [0, 1) --
        // notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color_above;
        } else if (this.zdiff < 0) {
          return CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color_below;
        } else if (SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            return CATMAID.TracingOverlay.Settings.session.active_skeleton_color;
          } else {
            return CATMAID.TracingOverlay.Settings.session.active_skeleton_color_virtual;
          }
        } else if (SkeletonAnnotations.isRealNode(this.id)) {
          return CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color;
        } else {
          return CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color_virtual;
        }
      };

      /**
       * Return a color as a function of the node's skeleton model's color
       * depending upon some conditions, such as whether the zdiff with the
       * current section is positive, negative, or zero, and whether the node
       * belongs to the active skeleton.
       *
       * @param  {THREE.Color} baseColor Node's skeleton model base color.
       * @return {number}                Hex color.
       */
      this.colorCustomFromZDiff = function (baseColor) {
        // zdiff is in sections, therefore the current section is at [0, 1) --
        // notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return baseColor.clone().offsetHSL(0.1, 0, 0).getHex();
        } else if (this.zdiff < 0) {
          return baseColor.clone().offsetHSL(-0.1, 0, 0).getHex();
        } else if (SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            return CATMAID.TracingOverlay.Settings.session.active_skeleton_color;
          } else {
            return CATMAID.TracingOverlay.Settings.session.active_skeleton_color_virtual;
          }
        } else if (SkeletonAnnotations.isRealNode(this.id)) {
          return baseColor.getHex();
        } else {
          return baseColor.getHex();
        }
      };

      this.updateColors = function() {
        if (this.c) {
          this.c.tint = this.color();
          this.createRadiusGraphics();
        }
        if (this.line) {
          var linecolor = this.colorFromZDiff();
          this.line.tint = linecolor;
          if (this.number_text) {
            this.number_text.tint = linecolor;
          }
        }
      };

      // Looked up to prevent frequent namespace lookups.
      let intersectLineWithPlane = CATMAID.tools.intersectLineWithPlane;
      let intersectionTarget = new THREE.Vector3();
      let intersectionWorkingLine = new THREE.Line3(new THREE.Vector3(),
          new THREE.Vector3());
      let intersectionWorkingPlane = new THREE.Plane();

      /**
       * Get the intersection X and Y coordinate between node and and two with the
       * plane that is @zDiff units above node two. If it happens that there is no
       * difference in Z, node one's X and Y coordinate are returned. The target
       * parameter is expected to be a two element list, into which the result
       * is copied.
       */
      this.getIntersection = function(node1, node2, zDiff, target) {
        if (0 === zDiff) {
          target[0] = node1[node1.planeX];
          target[1] = node1[node1.planeY];
        } else {
          let sv = this.overlayGlobals.tracingOverlay.stackViewer;
          intersectionWorkingPlane.copy(sv.plane);
          intersectionWorkingPlane.constant += sv.primaryStack.resolution.z *
            (sv.primaryStack.projectToStackZ(node2.z, node2.y, node2.x)
            - sv.z + zDiff);
          intersectionWorkingLine.start.set(node1.x, node1.y, node1.z);
          intersectionWorkingLine.end.set(node2.x, node2.y, node2.z);
          let intersection = intersectionWorkingPlane.intersectLine(intersectionWorkingLine,
              intersectionTarget);
          if (!intersection) {
            return null;
          } else {
            target[0] = intersection[node1.planeX];
            target[1] = intersection[node1.planeY];
          }
        }

        return target;
      };

      // A shared inersection target to avoid creating new objects when
      // redrawing a line to a parent node. These variables are internal to
      // drawLineToParent().
      let _parentIntersectionTarget = [null, null];
      let _childIntersectionTarget = [null, null];
      let _normTarget = [null, null];

      /** Updates the coordinates of the line from the node to the parent. Is
       * called frequently. */
      this.drawLineToParent = function() {
        if (!this.parent) {
          return;
        }
        if (!this.mustDrawLineWith(this.parent)) {
          return;
        }

        // If the parent or this itself is more than one slice away from the current
        // Z, draw the line only until it meets with the next non-boken slice,
        // in direction of the child or the parent, respectively.
        var childLocation = this.getIntersection(this, this.parent,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.zdiff)),
            _parentIntersectionTarget);
        var parentLocation = this.getIntersection(this.parent, this,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.parent.zdiff)),
            _childIntersectionTarget);

        // If no intersection was found between the child-parent edge and the
        // plane, don't draw the line.
        if (!(childLocation && parentLocation)) {
          return;
        }

        var lengthSq = (parentLocation[0] - childLocation[0]) *
                       (parentLocation[0] - childLocation[0]) +
                       (parentLocation[1] - childLocation[1]) *
                       (parentLocation[1] - childLocation[1]);
        if (lengthSq * this.pixelsPerUnitSq < this.MIN_EDGE_LENGTH_SQ) {
          if (this.line) this.line.tooShort = true;
          return;
        }

        let line = this.line;
        if (!line) {
          line = this.line = new PIXI.Graphics();
          this.overlayGlobals.skeletonElements.containers.lines.addChild(this.line);
          line.node = this;
          line.interactive = true;
          line.on('pointerupoutside', ptype.pointerEventManager.edge_mc_click);
          line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
          line.moveTo(0, 0);
          line.lineTo(0, 0);
          line.hitArea = new PIXI.Polygon(0, 0, 0, 0, 0, 0, 0, 0);
        }

        this.line.tooShort = false;

        // Rather than clear and re-draw the line, modify the PIXI.Graphics and
        // GraphicsData directly to avoid needless allocation.
        // Note: aliasing this.line.currentPath.shape.points with a local
        // var prevents Chrome 55 from optimizing this function.
        let linePath = line.currentPath;
        linePath.lineWidth = this.EDGE_WIDTH;
        linePath.shape.points[0] = childLocation[0];
        linePath.shape.points[1] = childLocation[1];
        linePath.shape.points[2] = parentLocation[0];
        linePath.shape.points[3] = parentLocation[1];
        line.dirty++;
        line.clearDirty++;
        line._spriteRect = null;
        var lineColor = this.colorFromZDiff();
        line.tint = lineColor;

        var norm = setLineNormal(childLocation[0], childLocation[1],
            parentLocation[0], parentLocation[1], _normTarget);
        var s = this.BASE_EDGE_WIDTH * 2.0;
        norm[0] *= s;
        norm[1] *= s;
        // Assign hit area to existing points array to avoid allocation.
        let lineHitAreaPoints = line.hitArea.points;
        lineHitAreaPoints[0] = childLocation[0]  + norm[0];
        lineHitAreaPoints[1] = childLocation[1]  + norm[1];
        lineHitAreaPoints[2] = parentLocation[0] + norm[0];
        lineHitAreaPoints[3] = parentLocation[1] + norm[1];
        lineHitAreaPoints[4] = parentLocation[0] - norm[0];
        lineHitAreaPoints[5] = parentLocation[1] - norm[1];
        lineHitAreaPoints[6] = childLocation[0]  - norm[0];
        lineHitAreaPoints[7] = childLocation[1]  - norm[1];

        this.line.visible = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups(false));

        if (this.confidence < 5) {
          // Create new or update
          this.number_text = this.updateConfidenceText(
              childLocation[0], childLocation[1],
              parentLocation[0], parentLocation[1],
              lineColor,
              this.confidence,
              this.number_text);
        } else if (this.number_text) {
          this.number_text.parent.removeChild(this.number_text);
          this.number_text.destroy();
          this.number_text = null;
        }
      };

      /** Trigger the redrawing of the lines with parent treenode,
       * and also with children when toChildren is true. To be able to respect
       * broken slices, the distance to the next and previous section is asked
       * for. */
      this.drawEdges = function(toChildren) {
        if (toChildren) {
          for (var child of this.children.values()) {
            if (this.mustDrawLineWith(child)) {
              child.drawLineToParent();
            }
          }
        }

        if (this.mustDrawLineWith(this.parent)) {
          this.drawLineToParent();
        }
      };

      /** Prepare node for removal from cache. */
      this.obliterate = function() {
        this.id = null;
        this.parent = null;
        this.parent_id = null;
        this.children = null;
        this.connectors = null;
        this.visibilityGroups = null;
        if (this.c) {
          ptype.pointerEventManager.forget(this.c, SkeletonAnnotations.TYPE_NODE);
          this.c.node = null;
          this.c.parent.removeChild(this.c);
          this.c.destroy();
          this.c = null;
        }
        if (this.radiusGraphics) {
          this.radiusGraphics.parent.removeChild(this.radiusGraphics);
          this.radiusGraphics.destroy();
          this.radiusGraphics = null;
        }
        if (this.line) {
          this.line.parent.removeChild(this.line);
          this.line.destroy();
          this.line.removeAllListeners();
          this.line = null;
        }
        if (this.number_text) {
          // Already removed from parent line by line.destroy.
          this.number_text.destroy();
          this.number_text = null;
        }
      };

      /** Before reusing a node, clear all the member variables that
       * are relevant to the skeleton structure.
       * All numeric variables will be overwritten,
       * and the c and line will be reused. */
      this.disable = function() {
        this.id = this.DISABLED;
        this.parent = null;
        this.parent_id = this.DISABLED;
        this.children.clear();
        this.connectors.clear();
        this.visibilityGroups = null;
        if (this.c) {
          this.c.visible = false;
        }
        if (this.radiusGraphics) {
          this.radiusGraphics.parent.removeChild(this.radiusGraphics);
          this.radiusGraphics.destroy();
          this.radiusGraphics = null;
        }
        if (this.line) {
          this.line.visible = false;
        }
        if (this.number_text) {
          this.number_text.parent.removeChild(this.number_text);
          this.number_text.destroy();
          this.number_text = null;
        }
      };

      /** Reset all member variables and reposition graphical elements if existing. */
      this.reInit = function(id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, edition_time, user_id) {
        this.id = id;
        this.parent = parent;
        this.parent_id = parent_id;
        this.children.clear();
        this.connectors.clear();
        this.visibilityGroups = null;
        this.radius = radius; // the radius as stored in the database
        this.x = x;
        this.y = y;
        this.z = z;
        this.zdiff = zdiff;
        this.confidence = confidence;
        this.skeleton_id = skeleton_id;
        this.edition_time = edition_time;
        this.user_id = user_id;
        this.suppressed = undefined;

        if (this.c) {
          if (!this.shouldDisplay()) {
            this.c.visible = false;
            if (this.radiusGraphics) {
              this.radiusGraphics.visible = false;
            }
          }
        }
        if (this.line) {
          this.line.visible = false;
        }
        if (this.number_text) {
          this.number_text.parent.removeChild(this.number_text);
          this.number_text.destroy();
          this.number_text = null;
        }
      };

      /**
       * Draws a circle around the treenode and control its radius with the help of
       * the pointer (and a pointer-to-stack transform function).
       */
      this.drawSurroundingCircle = function(drawLine, toStack, stackToProject, onclickHandler) {
        var self = this;
        // Create a circle object that represents the surrounding circle
        var color = 0xFFFF00;

        var c = new PIXI.Graphics();
        c.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
        c.drawCircle(this[this.planeX], this[this.planeY], 0);
        this.overlayGlobals.skeletonElements.containers.nodes.addChild(c);
        c.hitArea = new PIXI.Circle(this[this.planeX], this[this.planeY], 1000000);
        c.interactive = true;
        c.visible = true;
        c.tint = color;

        // Create a line from the node to pointer if requested
        if (drawLine) {
          var line = new PIXI.Graphics();
          line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
          line.moveTo(this[this.planeX], this[this.planeY]);
          line.lineTo(this[this.planeX] + 1, this[this.planeY] + 1);
          line.tint = color;
          line.visible = true;
          this.overlayGlobals.skeletonElements.containers.lines.addChild(line);
        }

        // Create a label to measure current radius of the circle.
        var label = this.overlayGlobals.tracingOverlay.paper
            .append('g')
            .classed('radiuslabel', true)
            .attr({ 'pointer-events': 'none'});
        var fontSize = parseFloat(ptype.ArrowLine.prototype.scaledConfidenceFontSize) * 0.75;
        var pad = fontSize * 0.5;
        var labelShadow = label.append('rect').attr({
            x: this[this.planeX],
            y: this[this.planeY],
            rx: pad,
            ry: pad,
            stroke: '#000',
            fill: '#000',
            opacity: 0.75,
            'pointer-events': 'none'});
        var labelText = label.append('text').attr({
            x: this[this.planeX],
            y: this[this.planeY],
            'font-size': fontSize + 'pt',
            fill: '#FFF',
            'pointer-events': 'none'});

        // Mark this node as currently edited
        this.surroundingCircleElements = {
            c: c,
            line: line,
            label: label};

        // Store current position of this node, just in case this instance will be
        // re-initialized due to an update. This also means that the circle cannot
        // be drawn while the node is changing location.
        var nodeP = {x: this.x, y: this.y, z: this.z};
        var planeX = this.planeX;
        var planeY = this.planeY;
        var planeZ = this.planeZ;

        // Update radius on pointer move
        c.on('pointermove', function (event) {
          var e = event.data.originalEvent;
          var rS = toStack({x: e.offsetX, y: e.offsetY});
          var rP = stackToProject(rS);
          var r = {
            x: rP.x - nodeP.x,
            y: rP.y - nodeP.y,
            z: rP.z - nodeP.z
          };
          var newRP = Math.sqrt(Math.pow(r.x, 2) + Math.pow(r.y, 2) + Math.pow(r.z, 2));
          var newR = newRP / self.stackScaling;
          // c.scale.set(self.stackScaling);
          c.graphicsData[0].shape.radius = newRP;
          c.dirty++;
          c.clearDirty++; // Force re-rendering.
          // Strore also x and y components
          c.datum = r;
          // Update radius measurement label.
          labelText.attr({x: rP[planeX] + 3 * pad, y: rP[planeY] + 2 * pad});
          labelText.text(Math.round(newRP) + 'nm (' + Math.round(newR) + 'px)');
          var bbox = labelText.node().getBBox();
          labelShadow.attr({
              x: rP[planeX] + 2 * pad,
              y: rP[planeY] + 2 * pad - bbox.height,
              width: bbox.width + 2 * pad,
              height: bbox.height + pad});

          if (line) {
            var lineColor = CATMAID.TracingOverlay.Settings.session.active_skeleton_color;
            if (r.z !== 0) {
              lineColor = (r.z < 0) ?
                  CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color_above :
                  CATMAID.TracingOverlay.Settings.session.inactive_skeleton_color_below;
            }
            line.clear();
            line.lineStyle(self.EDGE_WIDTH, 0xFFFFFF, 1.0);
            line.moveTo(nodeP[planeX], nodeP[planeY]);
            line.lineTo(rP[planeX], rP[planeY]);
            line.tint = lineColor;
          }

          self.overlayGlobals.tracingOverlay.redraw();
        });

        // Don't let pointer down events bubble up
        c.on('pointerdown', function (event) {
          var e = event.data.originalEvent;
          e.preventDefault();
        });
        c.on('pointerupoutside', function (event) {
          // Stop both the Pixi event and the DOM event from propagation.
          // Otherwise other Pixi elements can receive this event as well.
          event.stopPropagation();

          var e = event.data.originalEvent;
          e.preventDefault();
          if (onclickHandler) { onclickHandler(); }
          return true;
        });
      };

      /**
       * Remove a surrounding circle, if it is present. The callback function, if
       * any, will be called with the last radius of the circle in project
       * coordinates.
       */
      this.removeSurroundingCircle = function(callback) {
        if (!this.surroundingCircleElements) {
          return;
        }
        // Get last radius components
        var sce = this.surroundingCircleElements;
        var r = sce.c.datum;
        // Clean up
        sce.c.parent.removeChild(sce.c);
        sce.c.destroy();
        sce.c.removeAllListeners();
        if (sce.line) {
          sce.line.parent.removeChild(sce.line);
          sce.line.destroy();
        }
        sce.label.remove();
        this.surroundingCircleElements = undefined;

        this.overlayGlobals.tracingOverlay.redraw();
        // Execute callback, if any, with radius in project coordinates as argument
        if (callback) {
          if (r) callback(r.x, r.y, r.z);
          else callback();
        }
      };
    };

    ptype.AbstractTreenode.prototype = ptype.NodePrototype;

    ptype.Node = function(
      id,         // unique id for the node from the database
      parent,     // the parent node (may be null if the node is not loaded)
      parent_id,  // is null only for the root node
      radius,     // the radius
      x,          // the x coordinate in project coordinates
      y,          // the y coordinate in project coordinates
      z,          // the z coordinate in project coordinates
      zdiff,      // the difference in z from the current slice
      confidence, // confidence with the parent
      skeleton_id,// the id of the skeleton this node is an element of
      edition_time, // Last time this node was edited
      user_id)   // id of the user who owns the node
    {
      this.id = id;
      this.parent = parent;
      this.parent_id = parent_id;
      this.children = new Map();
      this.connectors = new Map();
      this.radius = radius; // the radius as stored in the database
      this.x = x;
      this.y = y;
      this.z = z;
      this.zdiff = zdiff;
      this.confidence = confidence;
      this.skeleton_id = skeleton_id;
      this.edition_time = edition_time;
      this.user_id = user_id;
      this.c = null; // The circle for drawing and interacting with the node.
      this.radiusGraphics = null; // The circle for visualing skeleton radius.
      this.line = null; // The line element that represents an edge between nodes
      this.visibilityGroups = null;
      this.number_text = null;
      this.suppressed = undefined;
    };

    ptype.Node.prototype = new ptype.AbstractTreenode();

    function incrementFieldCount(field) {
      // `this` is bound to target object
      /* jshint validthis: true */
      this[field]++;
    }

    function incrementLinkVisibilityGroupCountsCached(link) {
      // `this` is bound to target object
      /* jshint validthis: true */
      link.treenode.getVisibilityGroups(false).forEach(incrementFieldCount, this);
    }

    function incrementLinkVisibilityGroupCountsUncached(link) {
      // `this` is bound to target object
      /* jshint validthis: true */
      link.treenode.getVisibilityGroups(true).forEach(incrementFieldCount, this);
    }

    ptype.AbstractConnectorNode = function() {
      // For drawing:
      this.markerType = CATMAID.TracingOverlay.Settings.session.connector_node_marker;
      this.NODE_RADIUS = this.markerType === 'disc' ? 8 : 15;

      this.CATCH_RADIUS = 0;

      this.type = SkeletonAnnotations.TYPE_CONNECTORNODE;

      this.getVisibilityGroups = function (noCache) {
        if (this.visibilityGroups && !noCache) return this.visibilityGroups;

        let VG = SkeletonAnnotations.VisibilityGroups;
        let VGg = VG.groups;
        let nVGg = VG.groups.length;

        // If there are no visibility groups, don't bother with creating a
        // target array.
        if (nVGg === 0) {
          return null;
        }

        this.visibilityGroups = [];
        var groupBooleans = Array(VGg.length).fill(false);
        var groupCounts = Array(VGg.length).fill(0);
        for (var groupID = VGg.length - 1; groupID >= 0; groupID--) {
          groupBooleans[groupID] = VG.isNodeInGroup(groupID, this);
        }

        var overrideID = VG.GROUP_IDS.OVERRIDE;

        // For hidden groups, the connector is in the group if *all* linked
        // treenodes are in the group. The connector has the override group
        // if *any* linked treenode is in the override group.
        let links = this.links;
        if (noCache) {
          links.forEach(incrementLinkVisibilityGroupCountsUncached, groupCounts);
        } else {
          links.forEach(incrementLinkVisibilityGroupCountsCached, groupCounts);
        }

        for (var groupID = SkeletonAnnotations.VisibilityGroups.groups.length - 1; groupID >= 0; groupID--) {
          if (groupBooleans[groupID] || (
                groupID === overrideID ?
                (groupCounts[groupID] > 0) :
                (links.length > 0 && groupCounts[groupID] === links.length)))
            this.visibilityGroups.push(groupID);
        }

        return this.visibilityGroups;
      };

      this.linkNode = function(nodeId, link) {
        this.links.push(link);
      };

      this.isConnectedToActiveSkeleton = function () {
        var atsID = SkeletonAnnotations.getActiveSkeletonId();
        if (null === atsID) return false;

        return this.links && this.links.some(function(link) {
          return link.treenode.skeleton_id === atsID;
        }, this);
      };

      this.getLinks = function() {
        return this.links.slice(0);
      };

      this.removeLink = function(link) {
        if (this.links) {
          this.links.forEach(function(l, i, array) {
            if (l === link) {
              array.splice(i, 1);
            }
          });
        }
      };

      /**
       * Suspend all links to disable pointer events.
       */
      this.suspend = function() {
        for (var i=0, imax=this.edges.length; i<imax; ++i) {
          this.edges[i].suspend();
        }
      };

      /** Disables the ArrowLine object and removes entries from the lines list. */
      this.removeConnectorArrows = function() {
        if (this.edges) {
          var disable = ElementPool.prototype.disableFn;
          for (var i=0, imax=this.edges.length; i<imax; ++i) {
            disable(this.edges[i]);
          }
          this.edges = [];
        }
      };

      this.obliterate = function() {
        this.id = null;
        if (this.c) {
          this.c.node = null;
          ptype.pointerEventManager.forget(this.c, SkeletonAnnotations.TYPE_CONNECTORNODE);
          this.c.parent.removeChild(this.c);
          this.c.destroy();
          this.c = null;
        }
        this.visibilityGroups = null;
        this.subtype = null;
        this.removeConnectorArrows(); // also removes confidence text associated with edges
        this.edges = null;
        this.links = null;
      };

      this.disable = function() {
        this.id = this.DISABLED;
        if (this.c) {
          this.c.visible = false;
        }
        this.subtype = null;
        this.removeConnectorArrows();
      };

      this.color = function() {
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          return 0x00FF00;
        }
        if (this.zdiff >= 0 && this.zdiff < 1) {
          if (this.isConnectedToActiveSkeleton()) {
            return 0xFFB92F;
          }
          return 0xEB7500;
        }
      };

      this.colorFromZDiff = function()
      {
        // zdiff is in sections, therefore the current section is at [0, 1)
        // -- notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return 0x0000FF;
        } else if (this.zdiff < 0) {
          return 0xFF0000;
        } else {
          return 0xEB7500;
        }
      };

      this.updateColors = function() {
        if (this.c) {
          var fillcolor = this.color();
          this.c.tint = fillcolor;
        }
      };

      this.updateVisibility = function (noCache) {
        if (this.shouldDisplay() && this.c) {
          this.c.visible = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups(noCache));
        }

        for (var i=0, imax=this.edges; i<imax; ++i) {
          this.edges[i].updateVisibility(this, false);
        }
      };

      this.drawEdges = function(redraw) {

        if (redraw) {
          this.removeConnectorArrows();
        }

        for (var i=0, imax=this.links.length; i<imax; ++i) {
          var link = this.links[i];
          var node = link.treenode;
          if (this.mustDrawLineWith(node)) {
            var edge = this.createArrow(this, node, link.confidence, link.relation_id, link.relation_name, link.outwards);
            this.edges.push(edge);
          }
        }
      };

      this.reInit = function(id, x, y, z, zdiff, confidence, subtype, edition_time, user_id) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.z = z;
        this.zdiff = zdiff;
        this.visibilityGroups = null;
        this.confidence = confidence;
        this.subtype = subtype;
        this.edition_time = edition_time;
        this.user_id = user_id;
        this.links = [];
        this.edges = [];

        if (this.c) {
          if (!this.shouldDisplay()) {
            this.c.visible = false;
          }
        }
      };

      /**
       * Using force causes this to leak a texture if the user switches between a small marker type (disc) and a large
       * marker type (any other). This is necessary to change the size of the marker and happens very infrequently.
       *
       * @param force
       */
      this.initTextures = function(force) {
        var oldMarkerType = this.markerType;
        this.markerType = CATMAID.TracingOverlay.Settings.session.connector_node_marker;
        force = force && (oldMarkerType === 'disc' ^ this.markerType === 'disc');
        this.NODE_RADIUS = this.markerType === 'disc' ? 8 : 15;
        var g = this.makeMarker();

        var tracingOverlay = this.overlayGlobals.tracingOverlay;
        var texture = tracingOverlay.pixiLayer._context.renderer.generateTexture(g, PIXI.settings.SCALE_MODES, 1);

        if (!force && this.NODE_TEXTURE) {
          var oldBaseTexture = this.NODE_TEXTURE.baseTexture;
          this.NODE_TEXTURE.baseTexture = texture.baseTexture;
          oldBaseTexture.destroy();
        } else {
          if (this.NODE_TEXTURE) console.log('Warning: Possible connector node texture leak');
          this.NODE_TEXTURE = texture;
        }
      };
    };

    ptype.AbstractConnectorNode.prototype = ptype.NodePrototype;

    ptype.ConnectorNode = function(
      id,         // unique id for the node from the database
      x,          // the x coordinate in project coordinates
      y,          // the y coordinate in project coordinates
      z,          // the z coordinate in project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence, // (TODO: UNUSED)
      subtype,    // the kind of connector node
      edition_time, // Last time this connector was edited
      user_id)   // id of the user who owns the node
    {
      this.id = id;
      this.subtype = subtype;
      this.x = x;
      this.y = y;
      this.z = z;
      this.zdiff = zdiff;
      this.confidence = confidence;
      this.edition_time = edition_time;
      this.user_id = user_id;
      this.links = [];
      this.edges = [];
      this.c = null; // The circle for drawing
      this.visibilityGroups = null;
    };

    ptype.ConnectorNode.prototype = new ptype.AbstractConnectorNode();

    var linkedToNode = function(link) {
      return link.treenode.id === this.id;
    };

    ptype.ConnectorLink = function( id, node, relation_id, relation_name,
        confidence, edition_time, outwards) {
      this.id = id;
      this.treenode = node;
      this.relation_id = relation_id;
      this.relation_name = relation_name;
      this.confidence = confidence;
      this.edition_time = edition_time;
      this.outwards = outwards;
    };

    addIsoTimeAccessor(ptype.ConnectorLink.prototype, 'edition_time');

    function eventShouldActiveNode(e) {
      return !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    }

    /**
     * Event handling functions.
     * Below, the function() is but a namespace that returns a manager object
     * with functions attach and forget.
    */
    ptype.pointerEventManager = new (function()
    {
      /** Variables used for pointer events, which involve a single node at a time.
       * Includes node.x, node.y, node.id and node.c
       * These are set at mc_start, then used at mc_move, and set to null at mc_up. */
      var o = null;
      var dragging = false;

      // Used to tell competing event handlers that another handler is currently
      // working on handling a previous event.
      var handlingPrimaryEvent = false;

      var is_middle_click = function(e) {
        return 1 === e.button;
      };

      /**
       * Here 'this' is the node's circle graphics, and node is the Node instance
       */
      var mc_click = function(event) {
        // Stop both the Pixi event and the DOM event from propagation.
        // Otherwise other Pixi elements can receive this event as well.
        event.stopPropagation();

        // Only handle one UI element event at a time.
        if (handlingPrimaryEvent) {
          return;
        }

        var e = event.data.originalEvent;
        e.preventDefault();
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }

        // Prevent node related click handling if the naviation mode is
        // enabled.
        if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
          return;
        }

        var node = this.node;
        if (e.shiftKey || e.altKey) {
          var atnID = SkeletonAnnotations.getActiveNodeId();
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            // Delete node, but relay only a boolean result status using !!
            return !!catmaidTracingOverlay.deleteNode(node.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              let atnSubType = SkeletonAnnotations.getActiveNodeSubType();
              let connectorNode = catmaidTracingOverlay.nodes.get(atnID);

              // If the Alt key is pressed, we want to show a menu for
              // connector type selection.
              if (e.altKey && !e.shiftKey) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to add links between node #" +
                      node.id + " and connector #" + atnID);
                  return;
                }
                catmaidTracingOverlay.askForConnectorType()
                  .then(function(selection) {
                    if (selection) {
                      // Don't allow link combinations that would result in a
                      // mixed connector type.
                      if (connectorNode.links && connectorNode.links.length > 0 &&
                          connectorNode.subtype !== selection.value) {
                        throw new CATMAID.Warning(`Can't mix connector types ` +
                            `${connectorNode.subtype} and ${selection.value}`);
                      }
                      connectorNode.subtype = selection.value;
                      catmaidTracingOverlay.createLink(node.id, atnID,
                          selection.relation);
                    }
                  })
                  .catch(CATMAID.handleError);
                return;
              }

              if (atnSubType === CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as having a gap junction with connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                SkeletonAnnotations.atn.subtype = CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR;
                catmaidTracingOverlay.createLink(node.id, atnID, "gapjunction_with")
                  .catch(CATMAID.handleError);
              } else if (atnSubType === CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as having a tight junction with connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                SkeletonAnnotations.atn.subtype = CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR;
                catmaidTracingOverlay.createLink(node.id, atnID, "tightjunction_with")
                  .catch(CATMAID.handleError);
              } else if (atnSubType === CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " linked to desmosome connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                SkeletonAnnotations.atn.subtype = CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR;
                catmaidTracingOverlay.createLink(node.id, atnID, "desmosome_with")
                  .catch(CATMAID.handleError);
              }  else if (atnSubType === CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as postsynaptic to connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                catmaidTracingOverlay.createLink(node.id, atnID, "postsynaptic_to")
                  .catch(CATMAID.handleError);
              } else if (atnSubType === CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as abutting against connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                catmaidTracingOverlay.createLink(node.id, atnID, "abutting")
                  .catch(CATMAID.handleError);
              } else if (atnSubType === CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as node close to attachment connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                catmaidTracingOverlay.createLink(node.id, atnID, "close_to")
                  .catch(CATMAID.handleError);
              } else {
                CATMAID.error("Unknown connector subtype: " + atnSubType);
                return;
              }
              // TODO check for error
              CATMAID.statusBar.replaceLast("Joined node #" + atnID + " to connector #" + node.id);
            } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
              // Joining two skeletons: only possible if one owns both nodes involved
              // or is a superuser
              if( node.skeleton_id === SkeletonAnnotations.getActiveSkeletonId() ) {
                alert('Can not join node with another node of the same skeleton!');
                return;
              }
              catmaidTracingOverlay.createTreenodeLink(atnID, node.id);
              // TODO check for error
              CATMAID.statusBar.replaceLast("Joined node #" + atnID + " to node #" + node.id);
            }
          } else {
            alert("Nothing to join without an active node!");
          }
        }
      };

      /** Here `this` is the circle graphic, and `this.node` is the Node instance. */
      var mc_move = function(event) {
        var e = event.data.originalEvent;
        if (this === null || this.parentNode === null) return; // Not from a valid source.

        if (is_middle_click(e)) return; // Allow middle-click panning

        if (!o) return; // Not properly initialized with mc_start
        if (e.shiftKey) return;
        if (!checkNodeID(this)) return;

        // Prevent node related pointer move handling if the naviation mode is
        // enabled.
        if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
          return;
        }

        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        var node = this.node;

        if (!node) {
          CATMAID.statusBar.replaceLast("Couldn't find moved node # " + node.id + " on tracing layer");
          return;
        }

        var newPosition = o.data.getLocalPosition(this.parent);
        if (!dragging) {
          var l1Distance = Math.abs(newPosition.x - node[node.planeX])
                         + Math.abs(newPosition.y - node[node.planeY]);
          if (l1Distance > node.stackScaling * 0.5) {
            dragging = true;
            this.alpha = 0.7;
          } else {
            return;
          }
        }

        e.preventDefault();

        if (!CATMAID.mayEdit() || !node.canEdit()) {
          CATMAID.statusBar.replaceLast("You don't have permission to move node #" + node.id);
          return;
        }

        if (o.id !== SkeletonAnnotations.getActiveNodeId()) return;

        // TODO
        this.x = node[node.planeX] = newPosition.x;
        this.y = node[node.planeY] = newPosition.y;
        if (this.node.radiusGraphics) {
          this.node.radiusGraphics.x = node[node.planeX];
          this.node.radiusGraphics.y = node[node.planeY];
        }
        node.drawEdges(true); // TODO for connector this is overkill
        // Update postsynaptic edges from connectors. Suprisingly this brute
        // approach of iterating through all nodes is sufficiently fast.
        // TODO: A two-way map would be ergonomic and speed up ops like this.
        if (node.type === SkeletonAnnotations.TYPE_NODE) {
          for (var conn of catmaidTracingOverlay.nodes.values()) {
            if (conn.type === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              if (conn.links.some(linkedToNode, node)) {
                conn.drawEdges(true);
              }
            }
          }
        }
        CATMAID.statusBar.replaceLast("Moving node #" + node.id);

        catmaidTracingOverlay.nodeIDsNeedingSync.add(node.id);

        catmaidTracingOverlay.redraw();
      };

      /** Here `this` is the circle graphic. */
      var mc_up = function(event) {
        var node = this.node;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(
            node.overlayGlobals.skeletonElements);
        var e = event.data.originalEvent;

        if (eventShouldActiveNode(e) && !(o && o.activated)) {
          // Activate this node if not already done
          catmaidTracingOverlay.activateNode(node);
        }

        if (SkeletonAnnotations.TYPE_NODE === node.type) {
          this.removeListener("pointerup", mc_click);
          this.removeListener("pointerupoutside", mc_click);
        } else {
          // SkeletonAnnotations.TYPE_CONNECTORNODE
          this.removeListener("pointerup", connector_mc_click);
          this.removeListener("pointerupoutside", connector_mc_click);
        }

        this.removeAllListeners('pointermove')
            .removeAllListeners('pointerout')
            .removeAllListeners('pointerleave')
            .removeAllListeners('pointercancel')
            .removeListener('pointerup', mc_up)
            .removeListener('pointerupoutside', mc_up);

        if (!dragging) {
          o = null;
          return;
        }
        dragging = false;
        var e = event.data.originalEvent;
        e.preventDefault();
        if (!checkNodeID(this)) return;
        o = null;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        catmaidTracingOverlay.updateNodeCoordinatesInDB();
        this.alpha = 1.0;
      };

      var checkNodeID = function(graphicsNode) {
        if (!o || o.id !== graphicsNode.node.id) {
          console.log("Warning: tracing layer node ID changed while mouse action in progress.");
          return false;
        }
        // Test if the supplied node has a parent
        if (!graphicsNode.parent) {
          console.log("Warning: tracing layer node removed from display while mouse action in progress.");
          return false;
        }
        return true;
      };

      /** Here `this` is the circle graphic. */
      var mc_start = function(event) {
        var e = event.data.originalEvent;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        var node = this.node;
        if (is_middle_click(e)) {
          // Allow middle-click panning
          return;
        }

        // Only handle one UI element event at a time.
        if (handlingPrimaryEvent) {
          return;
        }

        // This is needed to return false from dispatchEvent()
        e.preventDefault();

        o = {id: node.id,
             data: event.data};

        // If not trying to join or remove a node, but merely click on it to
        // drag it or select it already on mous down.
        if (eventShouldActiveNode(e)) {
          o.activated = true;
          catmaidTracingOverlay.activateNode(node);
        }

        if (SkeletonAnnotations.TYPE_NODE === node.type) {
          this.on("pointerupoutside", mc_click);
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
          this.on("pointerup", connector_mc_click);
          this.on("pointerupoutside", connector_mc_click);
        }

        this.on('pointermove', mc_move)
            .on('pointerup', mc_up)
            .on('pointerupoutside', mc_up)
            .on('pointerout', mc_up)
            .on('pointerleave', mc_up)
            .on('pointercancel', mc_up);
      };

      var connector_mc_click = function(event) {
        // Stop both the Pixi event and the DOM event from propagation.
        // Otherwise other Pixi elements can receive this event as well.
        event.stopPropagation();

        // Only handle one UI element event at a time.
        if (handlingPrimaryEvent) {
          return;
        }

        var e = event.data.originalEvent;
        e.preventDefault();
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }
        var atnID = SkeletonAnnotations.getActiveNodeId(),
            connectornode = this.node;
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }

        // return some log information when clicked on the node
        // this usually refers here to the c object
        if (e.shiftKey || e.altKey) {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            // Delete node, but relay only a boolean result status using !!
            return !!catmaidTracingOverlay.deleteNode(connectornode.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              alert("Can not join two connector nodes!");
            } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
              var linkType;
              if (e.altKey && !e.shiftKey) {
                catmaidTracingOverlay.askForConnectorType()
                  .then(function(selection) {
                    if (selection) {
                      // Don't allow link combinations that would result in a
                      // mixed connector type.
                      if (connectornode.links && connectornode.links.length > 0 &&
                          connectornode.subtype !== selection.value) {
                        throw new CATMAID.Warning(`Can't mix connector types ` +
                            `${connectornode.subtype} and ${selection.value}`);
                      }
                      connectornode.subtype = selection.value;
                      return catmaidTracingOverlay.createLink(atnID,
                          connectornode.id, selection.relation);
                    }
                  })
                  .catch(CATMAID.handleError);
                return;
              }
              if (connectornode.subtype === CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR) {
                linkType = "gapjunction_with";
              } else if (CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR === connectornode.subtype) {
                linkType = "tightjunction_with";
              } else if (CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR === connectornode.subtype) {
                linkType = "desmosome_with";
              } else if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === connectornode.subtype) {
                linkType = (e.altKey ? 'post' : 'pre') + "synaptic_to";
              } else if (CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR === connectornode.subtype) {
                linkType = "abutting";
              } else {
                CATMAID.error("The selected connector is of unknown type: " + connectornode.subtype);
                return;
              }
              catmaidTracingOverlay.createLink(atnID, connectornode.id, linkType)
                .catch(CATMAID.handleError);
              CATMAID.statusBar.replaceLast("Joined node #" + atnID + " with connector #" + connectornode.id);
            }
          } else {
            CATMAID.msg('BEWARE', 'You need to activate a node before ' +
                'joining it to a connector node!');
          }
        }
      };

      this.edge_mc_click = function (event) {
        // Stop both the Pixi event and the DOM event from propagation.
        // Otherwise other Pixi elements can receive this event as well.
        event.stopPropagation();

        var e = event.data.originalEvent;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }

        var node = this.node;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          // During handling of the event, we want the line to not deal with other
          // clicks. This will be reset after the event is handled.
          if (handlingPrimaryEvent) {
            return;
          }
          handlingPrimaryEvent = true;

          e.preventDefault();
          e.stopPropagation();
          catmaidTracingOverlay.activateNode(node);
          catmaidTracingOverlay.splitSkeleton(node.id)
            .finally(() => {
              // Unblock click handling
              handlingPrimaryEvent = false;
            });
        }
      };

      this.attach = function(mc, type) {
        mc.on('pointerdown', mc_start);
      };


      var trackedEvents = ['pointerdown', 'pointermove', 'pointerup',
        'pointerupoutside', 'pointerout', 'pointerleave', 'pointercancel',
        'click'];

      this.forget = function(mc, type) {
        for (var i=0, imax=trackedEvents.length; i<imax; ++i) {
          var eventName = trackedEvents[i];
          mc.removeAllListeners(eventName);
        }
      };
    })();


    ptype.ArrowLine = function() {
      this.line = new PIXI.Graphics();
      this.overlayGlobals.skeletonElements.containers.arrows.addChild(this.line);
      this.line.interactive = true;
      this.line.on('pointerdown', this.pointerdown);
      this.line.on('pointerover', this.pointerover);
      this.line.hitArea = new PIXI.Polygon(0, 0, 0, 0, 0, 0, 0, 0);
      this.line.link = this;
      this.confidence_text = null;
      this.treenode_id = null;
      this.connector_id = null;
      this.relation = null;
      this.visibility = true;
    };

    ptype.ArrowLine.prototype = new (function() {
      this.BASE_EDGE_WIDTH = 2;
      this.CATCH_SCALE = 3;
      this.CONFIDENCE_FONT_PT = 15;
      this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      this.scaledConfidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      this.scaling = 1.0;

      /** Function to assign to the graphical arrow. */
      this.pointerdown = function (event) {
        var e = event.data.originalEvent;
        if(!(e.shiftKey && (e.ctrlKey || e.metaKey))) {
          return;
        }
        // Mark this edge as suspended so that other interaction modes don't
        // expect it to be there.
        this.suspended = true;
        var self = this;

        // 'this' will be the the connector's mouse catcher line
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.link.overlayGlobals.skeletonElements);
        var command = new CATMAID.UnlinkConnectorCommand(
            catmaidTracingOverlay.state, project.id, this.link.connector_id, this.link.treenode_id);
        CATMAID.commands.execute(command)
          .then(function(result) {
            catmaidTracingOverlay.updateNodes(function() {
              // Reset deletion flag
              self.suspended = false;
            });
          })
          .catch(function(error) {
            self.suspended = false;
            CATMAID.handleError(error);
          });
      };

      this.pointerover = function (event) {
        // If this edge is suspended, don't try to retrieve any information.
        if (this.suspended) {
          return;
        }

        Promise.all([
            CATMAID.fetch(project.id + '/connectors/user-info', 'GET', {
              treenode_id: this.link.treenode_id,
              connector_id: this.link.connector_id,
              relation_id: this.link.relation_id
            }),
            // Link types are cached, so this doesn't add extra overhead
            CATMAID.Connectors.linkType(project.id, this.link.relation_id)
          ])
          .then(function(results) {
            let data = results[0];
            let linkType = results[1];
            var msg = linkType.name + ' edge: ' + data.map(function (info) {
              return 'created by ' + CATMAID.User.safeToString(info.user) + ' ' +
                  CATMAID.tools.contextualDateString(info.creation_time) +
                  ', last edited ' +
                  CATMAID.tools.contextualDateString(info.edition_time);
            }).join('; ');
            CATMAID.statusBar.replaceLast(msg);
          })
          .catch(function(json) {
            // Display only a warning in case of an error. Since it is
            // possible that we get false errors when the link or one of the
            // nodes get removed, this is probably okay.
            if (json && json.error) CATMAID.warn(json.error);
            return true;
          });
      };

      // A shared cache for the line normal computation in the update() function
      // below. This variable is internal to that function.
      let _updateNormalCache = [null, null];

      this.update = function(x1, y1, x2, y2, relationName, confidence, tgtRadius, srcRadius) {
        var xdiff = (x2 - x1);
        var ydiff = (y2 - y1);
        var length = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
        if( length === 0 ) {
            length = 0.9 * tgtRadius;
        }
        // tgtRadius is the radius of target node, which we don't want to touch.
        var F = 1 - tgtRadius / length;
        var x2new = xdiff * F + x1;
        var y2new = ydiff * F + y1;

        var x1new, y1new;

        // Adjust location if a source radius is given or it is > 0
        if (srcRadius) {
          var newXdiff = (x2new - x1);
          var newYdiff = (y2new - y1);
          var newLength = Math.sqrt(newXdiff * newXdiff + newYdiff * newYdiff);
          var radiusPpn = srcRadius / newLength;
          x1new = newXdiff * radiusPpn + x1;
          y1new = newYdiff * radiusPpn + y1;
        } else {
          x1new = x1;
          y1new = y1;
        }

        // Draw line.
        this.line.clear();
        this.line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
        this.line.moveTo(x1new, y1new);
        this.line.lineTo(x2new, y2new);

        // Draw arrowhead.
        var norm = setLineNormal(x1, y1, x2, y2, _updateNormalCache);
        var s = 1.5 * this.EDGE_WIDTH;
        var x2a = x2new - xdiff * 2 * s / length,
            y2a = y2new - ydiff * 2 * s / length;
        this.line.beginFill(0xFFFFFF, 1.0);
        this.line.drawPolygon([
            x2new, y2new,
            x2a + s * norm[0], y2a + s * norm[1],
            x2a - s * norm[0], y2a - s * norm[1],
            x2new, y2new]);
        this.line.endFill();

        // Create mouse catcher.
        s = this.EDGE_WIDTH * this.CATCH_SCALE;
        norm[0] *= s;
        norm[1] *= s;
        // Assign hit area to existing points array to avoid allocation.
        this.line.hitArea.points[0] = x1 + norm[0];
        this.line.hitArea.points[1] = y1 + norm[1];
        this.line.hitArea.points[2] = x2new + norm[0];
        this.line.hitArea.points[3] = y2new + norm[1];
        this.line.hitArea.points[4] = x2new - norm[0];
        this.line.hitArea.points[5] = y2new - norm[1];
        this.line.hitArea.points[6] = x1 - norm[0];
        this.line.hitArea.points[7] = y1 - norm[1];

        var stroke_color;
        let settings = CATMAID.TracingOverlay.Settings.session;
        if (relationName === 'presynaptic_to') {
          stroke_color = settings.presynaptic_to_rel_color;
        } else if (relationName === 'postsynaptic_to') {
          stroke_color = settings.postsynaptic_to_rel_color;
        } else if (relationName === 'gapjunction_with') {
          stroke_color = settings.gapjunction_rel_color;
        } else if (relationName === 'tightjunction_with') {
          stroke_color = settings.tightjunction_rel_color;
        } else if (relationName === 'desmosome_with') {
          stroke_color = settings.desmosome_rel_color;
        } else if (relationName === 'attached_to') {
          stroke_color = settings.attachment_rel_color;
        } else if (relationName === 'close_to') {
          stroke_color = settings.close_to_rel_color;
        } else {
          stroke_color = settings.other_rel_color;
        }

        if (confidence < 5) {
          this.confidence_text = this.updateConfidenceText(x2, y2, x1, y1, stroke_color, confidence, this.confidence_text);
        } else if (this.confidence_text) {
          this.confidence_text.parent.removeChild(this.confidence_text);
          this.confidence_text.destroy();
          this.confidence_text = null;
        }

        this.line.tint = stroke_color;
      };

      this.show = function() {
        this.line.visible = this.visibility;
      };

      this.updateVisibility = function (connector, noCache) {
        this.visibility = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(connector.getVisibilityGroups(noCache));
        this.show();
      };

      this.disable = function() {
        this.line.visible = false;
      };

      /**
       * Suspend all links to disable pointer events.
       */
      this.suspend = function() {
        this.line.suspended = true;
      };

      this.obliterate = function() {
        this.connector_id = null;
        this.treenode_id = null;
        this.relation = null;
        this.line.parent.removeChild(this.line);
        this.line.destroy();
        this.line.removeAllListeners();
        this.line = null;
        if (this.confidence_text) {
          // Already removed from parent line by line.destroy.
          this.confidence_text.destroy();
          this.confidence_text = null;
        }
      };

      this.init = function(connector, node, confidence, relationId, relationName, outwards) {
        this.connector_id = connector.id;
        this.treenode_id = node.id;
        this.relation_id = relationId;
        this.relation_name = relationName;
        var connectorRadiusPx = connector.NODE_RADIUS * connector.stackScaling;
        var nodeRadiusPx = node.NODE_RADIUS * node.stackScaling;
        if (outwards) {
          // Explicitly pass in a source radius of 0 to not change the parameter
          // type, which can cause deoptimizations in V8.
          this.update(node[node.planeX], node[node.planeY],
              connector[connector.planeX], connector[connector.planeY],
              relationName, confidence, connectorRadiusPx, 0);
        } else {
          this.update(connector[connector.planeX], connector[connector.planeY],
              node[node.planeX], node[node.planeY], relationName, confidence,
              nodeRadiusPx, connectorRadiusPx);
        }
        this.updateVisibility(connector, false);
      };

      this.scale = function(baseScale, resScale, dynamicScale) {
        this.stackScaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        this.scaling = baseScale * (dynamicScale ? dynamicScale : 1);
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * this.stackScaling;
        this.scaledConfidenceFontSize = this.CONFIDENCE_FONT_PT * this.stackScaling + 'pt';
        this.textResolution = resScale;
      };

      this.initTextures = function () {
        return;
      };
    })();


    /** Used for confidence between treenode nodes and confidence between
     * a connector and a treenode. */
    (function(classes) {
      // Cache for confidence text textures by confidence number.
      var confidenceTextCache = {};
      // Cache for line normal computation to avoid recreation of this array on
      // every call.
      var norm = [null, null];

      var updateConfidenceText = function (x, y,
                                           parentx, parenty,
                                           fillColor,
                                           confidence,
                                           existing) {
        setLineNormal(x, y, parentx, parenty, norm);
        var text,
            numberOffset = 0.8 * this.CONFIDENCE_FONT_PT * this.stackScaling,
            newConfidenceX = (x + parentx) / 2 + norm[0] * numberOffset,
            newConfidenceY = (y + parenty) / 2 + norm[1] * numberOffset;

        var cachedText = confidenceTextCache[confidence];

        if (!cachedText) {
          cachedText = new PIXI.Text('' + confidence, {
              fontWeight: 'normal',
              fontSize: this.confidenceFontSize,
              fill: 0xFFFFFF,
              baseline: 'middle'});
          cachedText.alpha = 1.0;
          cachedText.resolution = this.textResolution;
          var texture = this.overlayGlobals.tracingOverlay.pixiLayer._context.renderer.generateTexture(
              cachedText, PIXI.settings.SCALE_MODES, 1);
          confidenceTextCache[confidence] = cachedText;
        } else if (cachedText.style.fontSize !== this.confidenceFontSize) {
          cachedText.style = {
              fontWeight: 'normal',
              fontSize: this.confidenceFontSize,
              fill: 0xFFFFFF,
              baseline: 'middle'};
          cachedText.resolution = this.textResolution;
          var texture = this.overlayGlobals.tracingOverlay.pixiLayer._context.renderer.generateTexture(
              cachedText, PIXI.settings.SCALE_MODES, 1);
        }

        if (existing) {
          text = existing;
          text.visible = true;
          text.texture = cachedText.texture;
        } else {
          text = new PIXI.Sprite(cachedText.texture);
          text.anchor.x = text.anchor.y = 0.5;
          this.line.addChild(text);
        }

        text.scale.set(this.stackScaling, this.stackScaling);
        text.position.set(newConfidenceX, newConfidenceY);
        text.tint = fillColor;

        return text;
      };

      // Inject into classes that have the member variable 'this.line'
      classes.forEach(function(c) {
        c.updateConfidenceText = updateConfidenceText;
      });
    })([ptype.NodePrototype,
        ptype.ArrowLine.prototype]);

    return ptype;
  };


  /**
   * A simple pool for reusing objects such as DOM elements, which are expensive
   * to insert and remove.
   */
  var ElementPool = function(reserveSize, reserveProportion) {
    this.pool = [];
    this.nextIndex = 0;
    this.reserveSize = reserveSize;
    this.reserveProportion = reserveProportion;
  };

  ElementPool.prototype.reset = function() {
    this.nextIndex = 0;
  };

  ElementPool.prototype.obliterateFn = function(element) {
    element.obliterate();
  };

  ElementPool.prototype.disableFn = function(element) {
    element.disable();
  };

  ElementPool.prototype.clear = function() {
    this.pool.splice(0).forEach(this.obliterateFn);
    this.reset();
  };

  ElementPool.prototype.disableBeyond = function(newLength) {
    if (newLength < this.pool.length) {
      var reserve = Math.max(newLength + this.reserveSize,
                             Math.floor(newLength * this.reserveProportion));
      // Drop elements beyond new length plus reserve
      if (this.pool.length > reserve) {
        this.pool.splice(reserve).forEach(this.obliterateFn);
      }
      // Disable elements from cut off to new ending of node pool array
      for (var i=newLength; i<this.pool.length; ++i) {
        this.pool[i].disable();
      }
    }
  };

  ElementPool.prototype.next = function() {
    return this.nextIndex < this.pool.length ?
      this.pool[this.nextIndex++] : null;
  };

  /**
   * Append a new element at the end, implying that all other elements are in
   * use.
   */
  ElementPool.prototype.push = function(element) {
    this.pool.push(element);
    this.nextIndex += 1;
  };

})(CATMAID);
