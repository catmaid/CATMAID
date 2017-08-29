/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  project,
  requestQueue,
  SkeletonAnnotations,
*/


(function(CATMAID) {

  "use strict";

  var lineNormal = function (x1, y1, x2, y2) {
    var xdiff = x2 - x1,
        ydiff = y2 - y1,
        length = Math.sqrt(xdiff*xdiff + ydiff*ydiff),
        // Compute normal of edge from edge. If node and parent are at
        // the same location, hardwire to offset vertically to prevent NaN x, y.
        nx = length === 0 ? 0 : -ydiff / length,
        ny = length === 0 ? 1 : xdiff / length;

    return [nx, ny];
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
        SkeletonElements.prototype = createSkeletonElementsPrototype();

        return new SkeletonElements(tracingOverlay, pixiContainer, skeletonDisplayModels);
      }
    };
  })();

  /** Namespace where graphics element instances are created, cached and edited. */
  var SkeletonElements = function (tracingOverlay, pixiContainer, skeletonDisplayModels) {
    this.overlayGlobals = {
      tracingOverlay: tracingOverlay,
      skeletonElements: this,
      skeletonDisplayModels: skeletonDisplayModels || {},
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
    concreteElements.forEach(function (klass) {
      klass.overlayGlobals = this.overlayGlobals;
      klass.initTextures();
    }, this);

    // Create element groups to enforce drawing order: lines, arrows, nodes, labels
    this.containers = ['lines', 'arrows', 'nodes', 'labels'].reduce(function (o, name) {
      o[name] = pixiContainer.addChild(new PIXI.Container());
      return o;
    }, {});

    this.cache = {
      nodePool: new this.ElementPool(100, 1.2),
      connectorPool: new this.ElementPool(20, 1.2),
      arrowPool: new this.ElementPool(50, 1.2),

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
      return function(connector, node, confidence, is_pre) {
        var arrow = arrowPool.next();
        if (!arrow) {
          arrow = new ArrowLine();
          arrowPool.push(arrow);
        }
        arrow.init(connector, node, confidence, is_pre);
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
      x,          // the x coordinate in stack coordinates
      y,          // the y coordinate in stack coordinates
      z,          // the z coordinate in stack coordinates
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
      x,          // the x coordinate in stack coordinates
      y,          // the y coordinate in stack coordinates
      z,          // the z coordinate in stack coordinates
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

    this.newLinkNode = function(id, node, relation_id, confidence, edition_time) {
      return new this.ConnectorLink(id, node, relation_id, confidence, edition_time);
    };
  };

  ////// Definition of classes used in SkeletonElements

  var createSkeletonElementsPrototype = function() {
    var ptype = {};

      /** For reusing objects such as DOM elements, which are expensive to insert and remove. */
    ptype.ElementPool = function(reserveSize, reserveProportion) {
      this.pool = [];
      this.nextIndex = 0;
      this.reserveSize = reserveSize;
      this.reserveProportion = reserveProportion;
    };

    $.extend(ptype.ElementPool.prototype, {
        reset: function() {
          this.nextIndex = 0;
        },

        obliterateFn: function(element) {
          element.obliterate();
        },

        disableFn: function(element) {
          element.disable();
        },

        clear: function() {
          this.pool.splice(0).forEach(this.obliterateFn);
          this.reset();
        },

        disableBeyond: function(newLength) {
          if (newLength < this.pool.length) {
            var reserve = Math.max(newLength + this.reserveSize,
                                   Math.floor(newLength * this.reserveProportion));
            // Drop elements beyond new length plus reserve
            if (this.pool.length > reserve) {
              this.pool.splice(reserve).forEach(this.obliterateFn);
            }
            // Disable elements from cut off to new ending of node pool array
            this.pool.slice(newLength).forEach(this.disableFn);
          }
        },

        next: function() {
          return this.nextIndex < this.pool.length ?
            this.pool[this.nextIndex++] : null;
        },

        /** Append a new element at the end, implying that all other elements are in use. */
        push: function(element) {
          this.pool.push(element);
          this.nextIndex += 1;
        }
      });

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
      // Store current node scaling factor
      this.scaling = 1.0;
      this.baseScale = 1.0;
      this.stackScaling = 1.0;
      this.resolutionScale = 1.0;
      this.radiiVisibility = RADII_VISIBILITY.indexOf('none');
      // Store current section distance to next and previous sections. These can
      // be changed to correct for broken nodes.
      this.dToSecBefore = -1;
      this.dToSecAfter = 1;

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

          ptype.mouseEventManager.attach(this.c, this.type);
        }

        this.c.x = this.x;
        this.c.y = this.y;
        this.c.scale.set(this.stackScaling);

        this.c.tint = this.color();

        this.c.visible = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups());
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
          this.radiusGraphics.drawCircle(0, 0, this.radius / this.resolutionScale);
          this.radiusGraphics.tint = this.c.tint;
          this.radiusGraphics.visible = this.c.visible;
          this.radiusGraphics.x = this.x;
          this.radiusGraphics.y = this.y;
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
        this.drawEdges();
      };

      this.shouldDisplay = function() {
        return this.id !== this.DISABLED && this.zdiff >= 0 && this.zdiff < 1;
      };

      this.isVisible = function () {
        return this.shouldDisplay() &&
            SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups());
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
        this.resolutionScale = resScale;
        this.baseScale = baseScale;
        this.stackScaling = baseScale * (dynamicScale ? dynamicScale : 1);
        this.scaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * this.stackScaling;//baseScale * (dynamicScale ? 1 : resScale);
        this.confidenceFontSize = this.CONFIDENCE_FONT_PT*this.stackScaling + 'pt';
        this.textResolution = resScale;

        this.pixelsPerUnitSq = 1 / (this.stackScaling * this.stackScaling);

        if (oldScaling !== this.scaling) this.initTextures();
      };

      this.initTextures = function () {
        var g = new PIXI.Graphics();
        g.beginFill(0xFFFFFF);
        g.drawCircle(0, 0, this.NODE_RADIUS * this.baseScale);
        g.endFill();

        var tracingOverlay = this.overlayGlobals.tracingOverlay;
        var texture = tracingOverlay.pixiLayer._context.renderer.generateTexture(
            g, PIXI.SCALE_MODES.DEFAULT, 1);

        if (this.NODE_TEXTURE) {
          var oldTexture = this.NODE_TEXTURE.baseTexture;
          this.NODE_TEXTURE.baseTexture = texture.baseTexture;
          oldTexture.destroy();
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
        if (!this.children.hasOwnProperty(childNode.id)) {
          ++ this.numberOfChildren;
        }
        // Still set new node object in any case, since
        // node objects can be reused for different IDs
        this.children[childNode.id] = childNode;
      };

      this.linkConnector = function(connectorId, link) {
        this.connectors[connectorId] = link;
      };

      this.shouldDisplay = function () {
        return this.id !== this.DISABLED && this.zdiff >= 0 && this.zdiff < 1 &&
            (!this.overlayGlobals.hideOtherSkeletons ||
             this.overlayGlobals.skeletonDisplayModels.hasOwnProperty(this.skeleton_id));
      };

      this.getVisibilityGroups = function (noCache) {
        if (this.visibilityGroups && !noCache) return this.visibilityGroups;

        this.visibilityGroups = [];

        for (var groupID = SkeletonAnnotations.VisibilityGroups.groups.length - 1; groupID >= 0; groupID--) {
          if (SkeletonAnnotations.VisibilityGroups.isNodeInGroup(groupID, this))
            this.visibilityGroups.push(groupID);
        }

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
        var model = this.overlayGlobals.skeletonDisplayModels[this.skeleton_id];
        if (model) return this.colorCustom(model.color);
        var color;
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            color = SkeletonAnnotations.TracingOverlay.Settings.session.active_node_color;
          } else {
            if (this.overlayGlobals.tracingOverlay.isVirtualNodeSuppressed(this.id)) {
              color = SkeletonAnnotations.TracingOverlay.Settings.session.active_suppressed_virtual_node_color;
            } else {
              color = SkeletonAnnotations.TracingOverlay.Settings.session.active_virtual_node_color;
            }
          }
        } else if (null === this.parent_id) {
          // The root node should be colored red unless it's active:
          color = SkeletonAnnotations.TracingOverlay.Settings.session.root_node_color;
        } else if (0 === this.numberOfChildren) {
          color = SkeletonAnnotations.TracingOverlay.Settings.session.leaf_node_color;
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
            return SkeletonAnnotations.TracingOverlay.Settings.session.active_node_color;
          } else {
            if (this.overlayGlobals.tracingOverlay.isVirtualNodeSuppressed(this.id)) {
              return SkeletonAnnotations.TracingOverlay.Settings.session.active_suppressed_virtual_node_color;
            } else {
              return SkeletonAnnotations.TracingOverlay.Settings.session.active_virtual_node_color;
            }
          }
        } else if (null === this.parent_id) {
          return baseColor.clone().offsetHSL(0, 0, 0.25).getHex();
        } else if (0 === this.numberOfChildren) {
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
        var model = this.overlayGlobals.skeletonDisplayModels[this.skeleton_id];
        if (model) return this.colorCustomFromZDiff(model.color);
        // zdiff is in sections, therefore the current section is at [0, 1) --
        // notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color_above;
        } else if (this.zdiff < 0) {
          return SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color_below;
        } else if (SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            return SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color;
          } else {
            return SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color_virtual;
          }
        } else if (SkeletonAnnotations.isRealNode(this.id)) {
          return SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color;
        } else {
          return SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color_virtual;
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
            return SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color;
          } else {
            return SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color_virtual;
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

      /** Updates the coordinates of the line from the node to the parent. */
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
        var childLocation = getIntersection(this, this.parent,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.zdiff)));
        var parentLocation = getIntersection(this.parent, this,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.parent.zdiff)));

        var lengthSq = (parentLocation[0] - childLocation[0]) *
                       (parentLocation[0] - childLocation[0]) +
                       (parentLocation[1] - childLocation[1]) *
                       (parentLocation[1] - childLocation[1]);
        if (lengthSq * this.pixelsPerUnitSq < this.MIN_EDGE_LENGTH_SQ) {
          if (this.line) this.line.tooShort = true;
          return;
        }

        if (!this.line) {
          this.line = new PIXI.Graphics();
          this.overlayGlobals.skeletonElements.containers.lines.addChild(this.line);
          this.line.node = this;
          this.line.interactive = true;
          this.line.on('click', ptype.mouseEventManager.edge_mc_click);
          this.line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
          this.line.moveTo(0, 0);
          this.line.lineTo(0, 0);
          this.line.hitArea = new PIXI.Polygon(0, 0, 0, 0, 0, 0, 0, 0);
        }

        this.line.tooShort = false;

        // Rather than clear and re-draw the line, modify the PIXI.Graphics and
        // GraphicsData directly to avoid needless allocation.
        // Note: aliasing this.line.currentPath.shape.points with a local
        // var prevents Chrome 55 from optimizing this function.
        this.line.currentPath.lineWidth = this.EDGE_WIDTH;
        this.line.currentPath.shape.points[0] = childLocation[0];
        this.line.currentPath.shape.points[1] = childLocation[1];
        this.line.currentPath.shape.points[2] = parentLocation[0];
        this.line.currentPath.shape.points[3] = parentLocation[1];
        this.line.dirty++;
        this.line.clearDirty++;
        this.line._spriteRect = null;
        var lineColor = this.colorFromZDiff();
        this.line.tint = lineColor;

        var norm = lineNormal(childLocation[0], childLocation[1],
                              parentLocation[0], parentLocation[1]);
        var s = this.BASE_EDGE_WIDTH * 2.0;
        norm[0] *= s;
        norm[1] *= s;
        // Assign hit area to existing points array to avoid allocation.
        this.line.hitArea.points[0] = childLocation[0]  + norm[0];
        this.line.hitArea.points[1] = childLocation[1]  + norm[1];
        this.line.hitArea.points[2] = parentLocation[0] + norm[0];
        this.line.hitArea.points[3] = parentLocation[1] + norm[1];
        this.line.hitArea.points[4] = parentLocation[0] - norm[0];
        this.line.hitArea.points[5] = parentLocation[1] - norm[1];
        this.line.hitArea.points[6] = childLocation[0]  - norm[0];
        this.line.hitArea.points[7] = childLocation[1]  - norm[1];

        this.line.visible = SkeletonAnnotations.VisibilityGroups.areGroupsVisible(this.getVisibilityGroups());

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

        /**
         * Get the intersection X and Y coordinate between node and and two with the
         * plane that is @zDiff units above node two. If it happens that there is no
         * difference in Z, node one's X and Y coordinate are returned.
         */
        function getIntersection(node1, node2, zDiff) {
          if (0 === zDiff) {
            return [node1.x, node1.y];
          } else {
            return CATMAID.tools.intersectLineWithZPlane(node1.x, node1.y, node1.z,
              node2.x, node2.y, node2.z, node2.z + zDiff);
          }
        }
      };

      /** Trigger the redrawing of the lines with parent treenode,
       * and also with children when toChildren is true. To be able to respect
       * broken slices, the distance to the next and previous section is asked
       * for. */
      this.drawEdges = function(toChildren) {
        if (toChildren) {
          for (var ID in this.children) {
            if (this.children.hasOwnProperty(ID)) {
              var child = this.children[ID];
              if (this.mustDrawLineWith(child)) {
                child.drawLineToParent();
              }
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
          ptype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_NODE);
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
        this.children = {};
        this.numberOfChildren = 0;
        this.connectors = {};
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
        this.children = {};
        this.numberOfChildren = 0;
        this.connectors = {};
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
        delete this.suppressed;

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
       * the mouse (and a mouse-to-stack transform function).
       */
      this.drawSurroundingCircle = function(drawLine, toStack, stackToProject, onclickHandler) {
        var self = this;
        // Create a circle object that represents the surrounding circle
        var color = 0xFFFF00;

        var c = new PIXI.Graphics();
        c.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
        c.drawCircle(this.x, this.y, 0);
        this.overlayGlobals.skeletonElements.containers.nodes.addChild(c);
        c.hitArea = new PIXI.Circle(this.x, this.y, 1000000);
        c.interactive = true;
        c.visible = true;
        c.tint = color;

        // Create a line from the node to mouse if requested
        if (drawLine) {
          var line = new PIXI.Graphics();
          line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
          line.moveTo(this.x, this.y);
          line.lineTo(this.x + 1, this.y + 1);
          line.tint = color;
          line.visible = true;
          this.overlayGlobals.skeletonElements.containers.lines.addChild(line);
        }

        // Create a label to measure current radius of the circle.
        var label = this.overlayGlobals.tracingOverlay.paper.append('g').classed('radiuslabel', true).attr({
            'pointer-events': 'none'});
        var fontSize = parseFloat(ptype.ArrowLine.prototype.confidenceFontSize) * 0.75;
        var pad = fontSize * 0.5;
        var labelShadow = label.append('rect').attr({
            x: this.x,
            y: this.y,
            rx: pad,
            ry: pad,
            stroke: '#000',
            fill: '#000',
            opacity: 0.75,
            'pointer-events': 'none'});
        var labelText = label.append('text').attr({
            x: this.x,
            y: this.y,
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
        var nodeX = this.x;
        var nodeY = this.y;
        var nodeZ = this.z;

        // Update radius on mouse move
        c.on('mousemove', function (event) {
          var e = event.data.originalEvent;
          var rS = toStack({x: e.offsetX, y: e.offsetY});
          var r = {
            x: rS.x - nodeX,
            y: rS.y - nodeY,
            z: rS.z - nodeZ
          };
          var newR = Math.sqrt(Math.pow(r.x, 2) + Math.pow(r.y, 2) + Math.pow(r.z, 2));
          c.graphicsData[0].shape.radius = newR;
          c.dirty++;
          c.clearDirty++; // Force re-rendering.
          // Strore also x and y components
          c.datum = r;
          // Update radius measurement label.
          var rP = stackToProject(r);
          var newRP = Math.sqrt(Math.pow(rP.x, 2) + Math.pow(rP.y, 2) + Math.pow(rP.z, 2));
          labelText.attr({x: nodeX + r.x + 3 * pad, y: nodeY + r.y + 2 * pad});
          labelText.text(Math.round(newRP) + 'nm (' + Math.round(newR) + 'px)');
          var bbox = labelText.node().getBBox();
          labelShadow.attr({
              x: nodeX + r.x + 2 * pad,
              y: nodeY + r.y + 2 * pad - bbox.height,
              width: bbox.width + 2 * pad,
              height: bbox.height + pad});

          if (line) {
            var lineColor = SkeletonAnnotations.TracingOverlay.Settings.session.active_skeleton_color;
            if (r.z !== 0) {
              lineColor = (r.z < 0) ?
                  SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color_above :
                  SkeletonAnnotations.TracingOverlay.Settings.session.inactive_skeleton_color_below;
            }
            line.clear();
            line.lineStyle(self.EDGE_WIDTH, 0xFFFFFF, 1.0);
            line.moveTo(nodeX, nodeY);
            line.lineTo(nodeX + r.x, nodeY + r.y);
            line.tint = lineColor;
          }

          self.overlayGlobals.tracingOverlay.redraw();
        });

        // Don't let mouse down events bubble up
        c.on('mousedown', function (event) {
          var e = event.data.originalEvent;
          e.stopPropagation();
          e.preventDefault();
        });
        c.on('click', function (event) {
          var e = event.data.originalEvent;
          e.stopPropagation();
          e.preventDefault();
          if (onclickHandler) { onclickHandler(); }
          return true;
        });
      };

      /**
       * Remove a surrounding circle, if it is present. The callback function, if
       * any, will be called with the last radius of the circle.
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
        delete this.surroundingCircleElements;

        this.overlayGlobals.tracingOverlay.redraw();
        // Execute callback, if any, with radius in stack coordinates as argument
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
      x,          // the x coordinate in stack coordinates
      y,          // the y coordinate in stack coordinates
      z,          // the z coordinate in stack coordinates
      zdiff,      // the difference in z from the current slice
      confidence, // confidence with the parent
      skeleton_id,// the id of the skeleton this node is an element of
      edition_time, // Last time this node was edited
      user_id)   // id of the user who owns the node
    {
      this.id = id;
      this.parent = parent;
      this.parent_id = parent_id;
      this.children = {};
      this.numberOfChildren = 0;
      this.connectors = {};
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
    };

    ptype.Node.prototype = new ptype.AbstractTreenode();

    ptype.AbstractConnectorNode = function() {
      // For drawing:
      this.NODE_RADIUS = 8;
      this.CATCH_RADIUS = 0;

      this.type = SkeletonAnnotations.TYPE_CONNECTORNODE;

      this.linkGroups = ['pregroup', 'postgroup', 'gjgroup', 'undirgroup'];
      this.lineGroups = ['preLines', 'postLines', 'gjLines', 'undirLines'];

      this.getVisibilityGroups = function (noCache) {
        if (this.visibilityGroups && !noCache) return this.visibilityGroups;

        this.visibilityGroups = [];

        var groupBooleans = Array(SkeletonAnnotations.VisibilityGroups.groups.length).fill(false);
        var groupCounts = Array(SkeletonAnnotations.VisibilityGroups.groups.length).fill(0);
        for (var groupID = SkeletonAnnotations.VisibilityGroups.groups.length - 1; groupID >= 0; groupID--) {
          groupBooleans[groupID] = SkeletonAnnotations.VisibilityGroups.isNodeInGroup(groupID, this);
        }

        var overrideID = SkeletonAnnotations.VisibilityGroups.GROUP_IDS.OVERRIDE;

        // For hidden groups, the connector is in the group if *all* linked
        // treenodes are in the group. The connector has the override group
        // if *any* linked treenode is in the override group.
        var links = this.getLinks();
        links.forEach(function (link) {
          link.treenode.getVisibilityGroups(noCache).forEach(function (groupID) {
            groupCounts[groupID]++;
          });
        });

        for (var groupID = SkeletonAnnotations.VisibilityGroups.groups.length - 1; groupID >= 0; groupID--) {
          if (groupBooleans[groupID] || (
                groupID === overrideID ?
                (groupCounts[groupID] > 0) :
                (links.length > 0 && groupCounts[groupID] === links.length)))
            this.visibilityGroups.push(groupID);
        }

        return this.visibilityGroups;
      };

      this.isConnectedToActiveSkeleton = function () {
        var atsID = SkeletonAnnotations.getActiveSkeletonId();
        if (null === atsID) return false;

        return this.linkGroups.some(function (group) {
          return this[group] && Object.keys(this[group]).some(function (partner) {
            return this[group][partner].treenode.skeleton_id === atsID;
          }, this);
        }, this);
      };

      /**
       * Get al links of a specific connector group or an empty list.
       */
      this.expandGroup = function(target, group) {
        var partners = this[group];
        if (partners) {
          for (var partner in partners) {
            target.push(partners[partner]);
          }
        }
        return target;
      };

      this.getLinks = function() {
        return this.linkGroups.reduce(this.expandGroup.bind(this), []);
      };

      this.removeLink = function(link) {
        this.linkGroups.forEach(function(groupName) {
          var group = this[groupName];
          if (group[link.treenode.id] === link) {
            delete group[link.treenode.id];
          }
        }, this);
      };

      /**
       * Suspend all links to disable mouse events.
       */
      this.suspend = function() {
        this.lineGroups.forEach(function(group) {
          var lines = this[group];
          if (lines) {
            for (var i=0; i<lines.length; ++i) {
              lines[i].suspend();
            }
          }
        }, this);
      };

      /** Disables the ArrowLine object and removes entries from the preLines and postLines. */
      this.removeConnectorArrows = function() {
        if (this.preLines) {
          this.preLines.forEach(ptype.ElementPool.prototype.disableFn);
          this.preLines = null;
        }
        if (this.postLines) {
          this.postLines.forEach(ptype.ElementPool.prototype.disableFn);
          this.postLines = null;
        }
        if (this.undirLines) {
          this.undirLines.forEach(ptype.ElementPool.prototype.disableFn);
          this.undirLines = null;
        }
        if (this.gjLines) {
          this.gjLines.forEach(ptype.ElementPool.prototype.disableFn);
          this.gjLines = null;
        }
      };

      this.obliterate = function() {
        this.id = null;
        if (this.c) {
          this.c.node = null;
          ptype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_CONNECTORNODE);
          this.c.parent.removeChild(this.c);
          this.c.destroy();
          this.c = null;
        }
        this.visibilityGroups = null;
        this.subtype = null;
        this.pregroup = null;
        this.postgroup = null;
        this.undirgroup = null;
        this.gjgroup = null;
        this.removeConnectorArrows(); // also removes confidence text associated with edges
        this.preLines = null;
        this.postLines = null;
        this.undirLines = null;
        this.gjLines = null;
      };

      this.disable = function() {
        this.id = this.DISABLED;
        if (this.c) {
          this.c.visible = false;
        }
        this.subtype = null;
        this.removeConnectorArrows();
        this.pregroup = null;
        this.postgroup = null;
        this.undirgroup = null;
        this.gjgroup = null;
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

        if (this.preLines)
          this.preLines.forEach(function (arrow) { arrow.updateVisibility(this); }, this);
        if (this.postLines)
          this.postLines.forEach(function (arrow) { arrow.updateVisibility(this); }, this);
        if (this.undirLines)
          this.undirLines.forEach(function (arrow) { arrow.updateVisibility(this); }, this);
        if (this.gjLines)
          this.gjLines.forEach(function (arrow) { arrow.updateVisibility(this); }, this);
      };

      this.drawEdges = function(redraw) {

        if (redraw) {
          this.removeConnectorArrows();
        }

        var i, node;

        // re-create
        for (i in this.pregroup) {
          if (this.pregroup.hasOwnProperty(i)) {
            node = this.pregroup[i].treenode;
            if (this.mustDrawLineWith(node)) {
              if (!this.preLines) this.preLines = [];
              this.preLines.push(this.createArrow(this, node, this.pregroup[i].confidence, 1));
            }
          }
        }

        for (i in this.postgroup) {
          if (this.postgroup.hasOwnProperty(i)) {
            node = this.postgroup[i].treenode;
            if (this.mustDrawLineWith(node)) {
              if (!this.postLines) this.postLines = [];
              this.postLines.push(this.createArrow(this, node, this.postgroup[i].confidence, 0));
            }
          }
        }

        for (i in this.undirgroup) {
          if (this.undirgroup.hasOwnProperty(i)) {
            node = this.undirgroup[i].treenode;
            if (this.mustDrawLineWith(node)) {
              if (!this.undirLines) this.undirLines = [];
              this.undirLines.push(this.createArrow(this, node, this.undirgroup[i].confidence, undefined));
            }
          }
        }

        for (i in this.gjgroup) {
          if (this.gjgroup.hasOwnProperty(i)) {
            node = this.gjgroup[i].treenode;
            if (this.mustDrawLineWith(node)) {
              if (!this.gjLines) this.gjLines = [];
              this.gjLines.push(this.createArrow(this, node, this.gjgroup[i].confidence, 2));
            }
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
        this.pregroup = {};
        this.postgroup = {};
        this.undirgroup = {};
        this.gjgroup = {};

        if (this.c) {
          if (!this.shouldDisplay()) {
            this.c.visible = false;
          }
        }

        this.preLines = null;
        this.postLines = null;
        this.undirLines = null;
        this.gjLines = null;
      };
    };

    ptype.AbstractConnectorNode.prototype = ptype.NodePrototype;

    ptype.ConnectorNode = function(
      id,         // unique id for the node from the database
      x,          // the x coordinate in stack coordinates
      y,          // the y coordinate in stack coordinates
      z,          // the z coordinate in stack coordinates
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
      this.pregroup = {}; // set of presynaptic treenodes
      this.postgroup = {}; // set of postsynaptic treenodes
      this.undirgroup = {}; // set of undirected treenodes
      this.gjgroup = {}; // set of gap junction treenodes
      this.c = null; // The circle for drawing
      this.preLines = null; // Array of ArrowLine to the presynaptic nodes
      this.postLines = null; // Array of ArrowLine to the postsynaptic nodes
      this.undirLines = null; // Array of undirected ArraowLine
      this.gjLines = null; // Array of gap junction ArrowLine
    };

    ptype.ConnectorNode.prototype = new ptype.AbstractConnectorNode();

    ptype.ConnectorLink = function( id, node, relation_id, confidence,
        edition_time) {
      this.id = id;
      this.treenode = node;
      this.relation_id = relation_id;
      this.confidence = confidence;
      this.edition_time = edition_time;
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
    ptype.mouseEventManager = new (function()
    {
      /** Variables used for mouse events, which involve a single node at a time.
       * Includes node.x, node.y, node.id and node.c
       * These are set at mc_start, then used at mc_move, and set to null at mc_up. */
      var o = null;
      var dragging = false;

      var is_middle_click = function(e) {
        return 1 === e.button;
      };

      /**
       * Here 'this' is the node's circle graphics, and node is the Node instance
       */
      this.mc_click = function(event) {
        var e = event.data.originalEvent;
        e.stopPropagation();
        e.preventDefault();
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }
        var node = this.node;
        if (e.shiftKey || e.altKey) {
          var atnID = SkeletonAnnotations.getActiveNodeId();
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            return catmaidTracingOverlay.deleteNode(node.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              var atnSubType = SkeletonAnnotations.getActiveNodeSubType();
              if ((e.altKey && !e.shiftKey) ||
                  atnSubType === CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR) {
                if (!CATMAID.mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as having a gap junction with connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                SkeletonAnnotations.atn.subtype = CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR;
                catmaidTracingOverlay.createLink(node.id, atnID, "gapjunction_with")
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

        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        var node = this.node;

        if (!node) {
          CATMAID.statusBar.replaceLast("Couldn't find moved node # " + node.id + " on tracing layer");
          return;
        }

        var newPosition = o.data.getLocalPosition(this.parent);
        if (!dragging) {
          var l1Distance = Math.abs(newPosition.x - node.x) + Math.abs(newPosition.y - node.y);
          if (l1Distance > node.scaling * 0.5) {
            dragging = true;
            this.alpha = 0.7;
          } else {
            return;
          }
        }

        e.stopPropagation();
        e.preventDefault();

        if (!CATMAID.mayEdit() || !node.canEdit()) {
          CATMAID.statusBar.replaceLast("You don't have permission to move node #" + node.id);
          return;
        }

        if (o.id !== SkeletonAnnotations.getActiveNodeId()) return;

        this.x = node.x = newPosition.x;
        this.y = node.y = newPosition.y;
        if (this.node.radiusGraphics) {
          this.node.radiusGraphics.x = this.x;
          this.node.radiusGraphics.y = this.y;
        }
        node.drawEdges(true); // TODO for connector this is overkill
        // Update postsynaptic edges from connectors. Suprisingly this brute
        // approach of iterating through all nodes is sufficiently fast.
        // TODO: A two-way map would be ergonomic and speed up ops like this.
        if (node.type === SkeletonAnnotations.TYPE_NODE) {
          for (var connID in catmaidTracingOverlay.nodes) {
            if (catmaidTracingOverlay.nodes.hasOwnProperty(connID)) {
              var conn = catmaidTracingOverlay.nodes[connID];
              if (conn.type === SkeletonAnnotations.TYPE_CONNECTORNODE) {
                if (node.id in conn.postgroup ||
                    node.id in conn.pregroup ||
                    node.id in conn.undirgroup ||
                    node.id in conn.gjgroup) {
                  conn.drawEdges(true);
                }
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
        this.removeAllListeners('mousemove')
            .removeAllListeners('mouseup')
            .removeAllListeners('mouseupoutside');

        var node = this.node;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(
            node.overlayGlobals.skeletonElements);
        var e = event.data.originalEvent;

        if (eventShouldActiveNode(e) && !(o && o.activated)) {
          // Activate this node if not already done
          catmaidTracingOverlay.activateNode(node);
        }

        if (!dragging) {
          o = null;
          return;
        }
        dragging = false;
        var e = event.data.originalEvent;
        e.stopPropagation();
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
        e.stopPropagation();
        e.preventDefault();

        o = {id: node.id,
             data: event.data};

        // If not trying to join or remove a node, but merely click on it to
        // drag it or select it already on mous down.
        if (eventShouldActiveNode(e)) {
          o.activated = true;
          catmaidTracingOverlay.activateNode(node);
        }

        this.on('mousemove', mc_move)
            .on('mouseup', mc_up)
            .on('mouseupoutside', mc_up);
      };

      var connector_mc_click = function(event) {
        var e = event.data.originalEvent;
        e.stopPropagation();
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
            return catmaidTracingOverlay.deleteNode(connectornode.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              alert("Can not join two connector nodes!");
            } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
              var linkType;
              if ((e.altKey && !e.shiftKey) ||
                  connectornode.subtype === CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR) {
                linkType = "gapjunction_with";
                connectornode.subtype = CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR;
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
        var e = event.data.originalEvent;
        var catmaidTracingOverlay = SkeletonAnnotations.getTracingOverlayBySkeletonElements(this.node.overlayGlobals.skeletonElements);
        if (catmaidTracingOverlay.ensureFocused()) {
          return;
        }
        var node = this.node;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          e.stopPropagation();
          e.preventDefault();
          catmaidTracingOverlay.activateNode(node);
          catmaidTracingOverlay.splitSkeleton(node.id);
        }
      };

      this.attach = function(mc, type) {
        mc.on('mousedown', mc_start);

        if (SkeletonAnnotations.TYPE_NODE === type) {
          mc.on("click", this.mc_click);
        } else {
          // SkeletonAnnotations.TYPE_CONNECTORNODE
          mc.on("click", connector_mc_click);
        }
      };

      this.forget = function(mc, type) {
        ['mousedown',
         'mousemove',
         'mouseup',
         'mouseupoutside',
         'click'].forEach(function (l) {
          mc.removeAllListeners(l);
        });
      };
    })();


    ptype.ArrowLine = function() {
      this.line = new PIXI.Graphics();
      this.overlayGlobals.skeletonElements.containers.arrows.addChild(this.line);
      this.line.interactive = true;
      this.line.on('mousedown', this.mousedown);
      this.line.on('mouseover', this.mouseover);
      this.line.hitArea = new PIXI.Polygon(0, 0, 0, 0, 0, 0, 0, 0);
      this.line.link = this;
      this.confidence_text = null;
      this.treenode_id = null;
      this.connector_id = null;
      this.relation = null;
      this.visibility = true;
    };

    ptype.ArrowLine.prototype = new (function() {
      this.PRE_COLOR = new THREE.Color("rgb(200,0,0)").getHex();
      this.POST_COLOR = new THREE.Color("rgb(0,217,232)").getHex();
      this.GJ_COLOR = new THREE.Color("rgb(159,37,194)").getHex();
      this.OTHER_COLOR = new THREE.Color("rgb(0,200,0)").getHex();
      this.BASE_EDGE_WIDTH = 2;
      this.CATCH_SCALE = 3;
      this.CONFIDENCE_FONT_PT = 15;
      this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      this.scaling = 1.0;

      /** Function to assign to the graphical arrow. */
      this.mousedown = function (event) {
        var e = event.data.originalEvent;
        e.stopPropagation();
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

      this.mouseover = function (event) {
        // If this edge is suspended, don't try to retrieve any information.
        if (this.suspended) {
          return;
        }
        var relation_name, title;
        if (this.link.relation === undefined) {
          relation_name = 'abutting';
          title = 'Abutting';
        } else if (this.link.relation === 2) {
          relation_name = 'gapjunction_with';
          title = 'Gap junction';
        } else if (this.link.relation === 1) {
          relation_name = 'presynaptic_to';
          title = 'Presynaptic';
        } else {
          relation_name = 'postsynaptic_to';
          title = 'Postsynaptic';
        }

        requestQueue.register(
            django_url + project.id + '/connector/user-info',
            'GET',
            { treenode_id: this.link.treenode_id,
              connector_id: this.link.connector_id,
              relation_name: relation_name},
            CATMAID.jsonResponseHandler(function(data) {
              var msg = title + ' edge: ' + data.map(function (info) {
                return 'created by ' + CATMAID.User.safeToString(info.user) + ' ' +
                    CATMAID.tools.contextualDateString(info.creation_time) +
                    ', last edited ' +
                    CATMAID.tools.contextualDateString(info.edition_time);
              }).join('; ');
              CATMAID.statusBar.replaceLast(msg);
            }, function(json) {
              // Display only a warning in case of an error. Since it is
              // possible that we get false errors when the link or one of the
              // nodes get removed, this is probably okay.
              if (json && json.error) CATMAID.warn(json.error);
              return true;
            }));
      };

      this.update = function(x1, y1, x2, y2, is_pre, confidence, rloc) {
        var xdiff = (x2 - x1);
        var ydiff = (y2 - y1);
        var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
        if( le === 0 ) {
            le = 0.9 * rloc;
        }
        // rloc is the radius of target node, which we don't want to touch.
        var F = 1 - rloc / le;
        var x2new = (x2 - x1) * F + x1;
        var y2new = (y2 - y1) * F + y1;

        // Draw line.
        this.line.clear();
        this.line.lineStyle(this.EDGE_WIDTH, 0xFFFFFF, 1.0);
        this.line.moveTo(x1, y1);
        this.line.lineTo(x2new, y2new);

        // Draw arrowhead.
        var norm = lineNormal(x1, y1, x2, y2);
        var s = 1.5 * this.EDGE_WIDTH;
        var x2a = x2new - (x2 - x1) * 2 * s / le,
            y2a = y2new - (y2 - y1) * 2 * s / le;
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
        if (undefined === is_pre) stroke_color = this.OTHER_COLOR;
        else if (2 === is_pre) stroke_color = this.GJ_COLOR;
        else stroke_color = is_pre ? this.PRE_COLOR : this.POST_COLOR;

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
       * Suspend all links to disable mouse events.
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

      this.init = function(connector, node, confidence, is_pre) {
        this.connector_id = connector.id;
        this.treenode_id = node.id;
        this.relation = is_pre;
        if (1 === is_pre) {
          this.update(node.x, node.y, connector.x, connector.y, is_pre, confidence, connector.NODE_RADIUS*connector.stackScaling);
        } else {
          this.update(connector.x, connector.y, node.x, node.y, is_pre, confidence, node.NODE_RADIUS*node.stackScaling);
        }
        this.updateVisibility(connector);
      };

      this.scale = function(baseScale, resScale, dynamicScale) {
        this.stackScaling = baseScale * (dynamicScale ? dynamicScale : 1);
        this.scaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * this.stackScaling;
        this.confidenceFontSize = this.CONFIDENCE_FONT_PT * this.stackScaling + 'pt';
        this.textResolution = resScale;
      };

      this.initTextures = function () {
        return;
      };
    })();


    /** Used for confidence between treenode nodes and confidence between
     * a connector and a treenode. */
    (function(classes) {
      var confidenceTextCache = {};

      var updateConfidenceText = function (x, y,
                                           parentx, parenty,
                                           fillColor,
                                           confidence,
                                           existing) {
        var text,
            numberOffset = 0.8 * this.CONFIDENCE_FONT_PT * this.stackScaling,
            norm = lineNormal(x, y, parentx, parenty),
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
              cachedText, PIXI.SCALE_MODES.DEFAULT, 1);
          confidenceTextCache[confidence] = cachedText;
        } else if (cachedText.style.fontSize !== this.confidenceFontSize) {
          cachedText.style = {
              fontWeight: 'normal',
              fontSize: this.confidenceFontSize,
              fill: 0xFFFFFF,
              baseline: 'middle'};
          cachedText.resolution = this.textResolution;
          var texture = this.overlayGlobals.tracingOverlay.pixiLayer._context.renderer.generateTexture(
              cachedText, PIXI.SCALE_MODES.DEFAULT, 1);
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

        text.x = newConfidenceX;
        text.y = newConfidenceY;
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
})(CATMAID);
