/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  mayEdit,
  project,
  requestQueue,
  SkeletonAnnotations,
*/


(function(CATMAID) {

  "use strict";

  d3.selection.prototype.toFront = function () {
    return this.each(function () {
      this.parentNode.appendChild(this);
    });
  };

  d3.selection.prototype.toBack = function () {
    return this.each(function () {
      var firstChild = this.parentNode.firstChild;
      if (firstChild) {
        this.parentNode.insertBefore(this, firstChild);
      }
    });
  };

  d3.selection.prototype.hide = function () {
    return this.attr('visibility', 'hidden');
  };

  d3.selection.prototype.show = function () {
    return this.attr('visibility', 'visible');
  };

  /**
   * Construct new SkeletonElement instances with this factory.
   */
  CATMAID.SkeletonElementsFactory = (function() {
    return {
      /**
       * Create a new SkeletonInstance and return it.
       */
      createSkeletonElements: function(paper, defSuffix) {
        // Add prototype
        SkeletonElements.prototype = createSkeletonElementsPrototype();

        return new SkeletonElements(paper, defSuffix);
      }
    };
  })();

  /** Namespace where SVG element instances are created, cached and edited. */
  var SkeletonElements = function(paper, defSuffix)
  {
    // Allow a suffix for SVG definition IDs
    this.USE_HREF_SUFFIX = defSuffix || '';
    // Create definitions for reused elements and markers
    var defs = paper.append('defs');

    // Let (concrete) element classes initialize any shared SVG definitions
    // required by their instances. Even though called statically, initDefs is an
    // instance (prototype) method so that we can get overriding inheritance of
    // pseudo-static variables.
    var concreteElements = [
      SkeletonElements.prototype.Node.prototype,
      SkeletonElements.prototype.ConnectorNode.prototype,
      SkeletonElements.prototype.ArrowLine.prototype,
    ];
    concreteElements.forEach(function (klass) {klass.initDefs(defs, defSuffix);});

    // Create element groups to enforce drawing order: lines, arrows, nodes, labels
    paper.append('g').classed('lines', true);
    paper.append('g').classed('arrows', true);
    paper.append('g').classed('nodes', true);
    paper.append('g').classed('labels', true);

    this.cache = {
      nodePool : new this.ElementPool(100),
      connectorPool : new this.ElementPool(20),
      arrowPool : new this.ElementPool(50),

      clear : function() {
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
      paper = null;
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
          arrow = new ArrowLine(paper, defSuffix);
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
      x,          // the x coordinate in oriented project coordinates
      y,          // the y coordinate in oriented project coordinates
      z,          // the z coordinate in oriented project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence,
      skeleton_id,// the id of the skeleton this node is an element of
      can_edit)   // a boolean combining (is_superuser or user owns the node)
    {
      var node = this.cache.nodePool.next();
      if (node) {
        node.reInit(id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit);
      } else {
        node = new this.Node(paper, id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit, defSuffix);
        this.cache.nodePool.push(node);
      }
      return node;
    };

    /** Surrogate constructor for ConnectorNode.
     * See "newNode" for explanations. */
    this.newConnectorNode = function(
      id,         // unique id for the node from the database
      x,          // the x coordinate in oriented project coordinates
      y,          // the y coordinate in oriented project coordinates
      z,          // the z coordinate in oriented project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence,
      subtype,
      can_edit)   // a boolean combining (is_superuser or user owns the node)
    {
      var connector = this.cache.connectorPool.next();
      if (connector) {
        connector.reInit(id, x, y, z, zdiff, confidence, subtype, can_edit);
      } else {
        connector = new this.ConnectorNode(paper, id, x, y, z, zdiff, confidence, subtype, can_edit, defSuffix);
        connector.createArrow = this.createArrow;
        this.cache.connectorPool.push(connector);
      }
      return connector;
    };
  };

  ////// Definition of classes used in SkeletonElements

  var createSkeletonElementsPrototype = function() {
    var ptype = {};

      /** For reusing objects such as DOM elements, which are expensive to insert and remove. */
    ptype.ElementPool = function(reserve_size) {
      this.pool = [];
      this.nextIndex = 0;
      this.reserve_size = reserve_size;
    };

    ptype.ElementPool.prototype = (function() {
      return {
        reset : function() {
          this.nextIndex = 0;
        },

        obliterateFn : function(element) {
          element.obliterate();
        },

        disableFn : function(element) {
          element.disable();
        },

        clear : function() {
          this.pool.splice(0).forEach(this.obliterateFn);
          this.reset();
        },

        disableBeyond : function(new_length) {
          if (new_length < this.pool.length) {
            // Drop elements beyond new length plus reserve
            if (this.pool.length > new_length + this.reserve_size) {
              this.pool.splice(new_length + this.reserve_size).forEach(this.obliterateFn);
            }
            // Disable elements from cut off to new ending of node pool array
            this.pool.slice(new_length).forEach(this.disableFn);
          }
        },

        next : function() {
          return this.nextIndex < this.pool.length ?
            this.pool[this.nextIndex++] : null;
        },

        /** Append a new element at the end, implying that all other elements are in use. */
        push : function(element) {
          this.pool.push(element);
          this.nextIndex += 1;
        }
      };
    })();


    /** A prototype for both Treenode and Connector. */
    ptype.NodePrototype = new (function() {
      this.CONFIDENCE_FONT_PT = 15;
      this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      // Store current node scaling factor
      this.scaling = 1.0;
      // Store current section distance to next and previous sections. These can
      // be changed to correct for broken nodes.
      this.dToSecBefore = -1;
      this.dToSecAfter = 1;

      /** Update the local x,y coordinates of the node
       * and for its SVG object c well. */
      this.setXY = function(xnew, ynew) {
        this.x = xnew;
        this.y = ynew;
        if (this.c) {
          this.c.attr({
            x: xnew,
            y: ynew
          });
        }
      };

      /** Create the SVG circle elements if and only if the zdiff is zero, that is, if the node lays on the current section. */
      this.createCircle = function() {
        if (!this.shouldDisplay()) {
          return;
        }
        // c may already exist if the node is being reused
        if (!this.c) {
          // create a circle object
          this.c = this.paper.select('.nodes').append('use')
                              .attr('xlink:href', '#' + this.USE_HREF + this.hrefSuffix)
                              .attr('x', this.x)
                              .attr('y', this.y)
                              .classed('overlay-node', true);

          ptype.mouseEventManager.attach(this.c, this.type);
        }

        var fillcolor = this.color();

        this.c.attr({
          fill: fillcolor,
          stroke: fillcolor,
          opacity: 1.0,
          'stroke-width': this.CATCH_RADIUS*2,// Use a large transparent stroke to
          'stroke-opacity': 0                 // catch mouse events near the circle.
        });
        this.c.datum(this.id);

        if ("hidden" === this.c.attr('visibility')) this.c.show();
      };

      /** Recreate the GUI components, namely the circle and edges.
       *  This is called only when creating a single node. */
      this.createGraphics = function() {
        this.createCircle();
        this.drawEdges();
      };

      this.shouldDisplay = function() {
        return this.zdiff >= 0 && this.zdiff < 1;
      };

      /** Draw a line with the other node if this or the other should be displayed. */
      this.mustDrawLineWith = function(node) {
        return this.shouldDisplay() || (node && node.shouldDisplay());
      };

      this.scale = function(baseScale, resScale, dynamicScale) {
        this.scaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        // To account for SVG non-scaling-stroke in screen scale mode the resolution
        // scaling must not be applied to edge. While all three scales could be
        // combined to avoid this without the non-scaling-stroke, this is necessary
        // to avoid the line size be inconcistent on zoom until a redraw.
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * baseScale * (dynamicScale ? 1 : resScale);
        this.confidenceFontSize = this.CONFIDENCE_FONT_PT*this.scaling + 'pt';
        this.circleDef.attr('r', this.NODE_RADIUS*this.scaling);
      };

      this.initDefs = function(defs, hrefSuffix) {
        this.circleDef = defs.append('circle').attr({
          id: this.USE_HREF + (hrefSuffix || ''),
          cx: 0,
          cy: 0,
          r: this.NODE_RADIUS
        });
      };
    })();

    ptype.AbstractTreenode = function() {
      // For drawing:
      this.USE_HREF = 'treenodeCircle';
      this.NODE_RADIUS = 3;
      this.CATCH_RADIUS = 6;
      this.BASE_EDGE_WIDTH = 2;

      // ID of the disabled nodes
      this.DISABLED = -1;

      this.addChildNode = function(childNode) {
        if (!this.children.hasOwnProperty(childNode.id)) {
          ++ this.numberOfChildren;
        }
        // Still set new node object in any case, since
        // node objects can be reused for different IDs
        this.children[childNode.id] = childNode;
      };

      /** Set the node fill color depending on its distance from the
      * current slice, whether it's the active node, the root node, or in
      * an active skeleton. */
      this.color = function() {
        var color;
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          // The active node is always in green:
          color = SkeletonAnnotations.getActiveNodeColor();
        } else if (this.isroot) {
          // The root node should be colored red unless it's active:
          color = SkeletonAnnotations.root_node_color;
        } else if (0 === this.numberOfChildren) {
          color = SkeletonAnnotations.leaf_node_color;
        } else {
          // If none of the above applies, just colour according to the z difference.
          color = this.colorFromZDiff();
        }

        return color;
      };

      this.updateColors = function() {
        if (this.c) {
          var fillcolor = this.color();
          this.c.attr({fill: fillcolor});
        }
        if (this.line) {
          var linecolor = this.colorFromZDiff();
          this.line.attr({stroke: linecolor});
        }
      };

      /** Updates the coordinates of the SVG line from the node to the parent. */
      this.drawLineToParent = function() {
        if (!this.parent) {
          return;
        }
        if (!this.mustDrawLineWith(this.parent)) {
          return;
        }
        var lineColor = this.colorFromZDiff();

        if (!this.line) {
          this.line = this.paper.select('.lines').append('line');
          this.line.toBack();
          this.line.datum(this.id);
          this.line.on('click', ptype.mouseEventManager.edge_mc_click);
        }

        // If the parent or this itself is more than one slice away from the current
        // Z, draw the line only until it meets with the next non-boken slice,
        // in direction of the child or the parent, respectively.
        var childLocation = getIntersection(this, this.parent,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.zdiff)));
        var parentLocation = getIntersection(this.parent, this,
            Math.max(this.dToSecBefore, Math.min(this.dToSecAfter, this.parent.zdiff)));

        this.line.attr({
            x1: childLocation[0], y1: childLocation[1],
            x2: parentLocation[0], y2: parentLocation[1],
            stroke: lineColor,
            'stroke-width': this.EDGE_WIDTH
        });

        // May be hidden if the node was reused
        this.line.show();

        if (this.confidence < 5) {
          // Create new or update
          this.number_text = this.updateConfidenceText(
              childLocation[0], childLocation[1],
              parentLocation[0], parentLocation[1],
              lineColor,
              this.confidence,
              this.number_text);
        } else if (this.number_text) {
          this.number_text.remove();
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

      /**
       * Return a color depending upon some conditions, such as whether the zdiff
       * with the current section is positive, negative, or zero, and whether the
       * node belongs to the active skeleton.
       */
      this.colorFromZDiff = function() {
        // zdiff is in sections, therefore the current section is at [0, 1) --
        // notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return SkeletonAnnotations.inactive_skeleton_color_above;
        } else if (this.zdiff < 0) {
          return SkeletonAnnotations.inactive_skeleton_color_below;
        } else if (SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id) {
          if (SkeletonAnnotations.isRealNode(this.id)) {
            return SkeletonAnnotations.active_skeleton_color;
          } else {
            return SkeletonAnnotations.active_skeleton_color_virtual;
          }
        } else if (SkeletonAnnotations.isRealNode(this.id)) {
          return SkeletonAnnotations.inactive_skeleton_color;
        } else {
          return SkeletonAnnotations.inactive_skeleton_color_virtual;
        }
      };

      /** Prepare node for removal from cache. */
      this.obliterate = function() {
        this.paper = null;
        this.id = null;
        this.parent = null;
        this.parent_id = null;
        this.type = null;
        this.children = null;
        if (this.c) {
          ptype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_NODE);
          this.c.remove();
          this.c = null;
        }
        if (this.line) {
          this.line.remove();
          this.line = null;
        }
        if (this.number_text) {
          this.number_text.remove();
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
        if (this.c) {
          this.c.datum(null);
          this.c.hide();
        }
        if (this.line) {
          this.line.hide();
        }
        if (this.number_text) {
          this.number_text.remove();
          this.number_text = null;
        }
      };

      /** Reset all member variables and reposition SVG circles when existing. */
      this.reInit = function(id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit) {
        this.id = id;
        this.parent = parent;
        this.parent_id = parent_id;
        this.children = {};
        this.numberOfChildren = 0;
        this.radius = radius; // the radius as stored in the database
        this.x = x;
        this.y = y;
        this.z = z;
        this.zdiff = zdiff;
        this.confidence = confidence;
        this.skeleton_id = skeleton_id;
        this.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
        this.can_edit = can_edit;
        this.needsync = false;

        if (this.c) {
          this.c.datum(id);
          if (0 !== zdiff) {
            this.c.hide();
          } else {
            this.c.attr({x: x, y: y});
          }
        }
        if (this.line) {
          this.line.datum(id);
          this.line.hide();
        }
        if (this.number_text) {
          this.number_text.remove();
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
        var color = "rgb(255,255,0)";
        var c = this.paper.select('.nodes').append('circle')
          .attr({
            cx: this.x,
            cy: this.y,
            r: 0,
            fill: "none",
            stroke: color,
            'stroke-width': 1.5,
          });
        // Create a line from the node to mouse if requested
        if (drawLine) {
          var line = this.paper.select('.lines').append('line')
            .attr({
              x1: this.x,
              y1: this.y,
              x2: this.x,
              y2: this.y,
              stroke: color,
              'stroke-width': this.EDGE_WIDTH
            });
        }
        // Create an adhoc mouse catcher
        var mc = this.paper.select('.nodes').append('circle')
          .attr({
            cx: this.x,
            cy: this.y,
            r: '300%',
            fill: color,  // If opacity is zero it must have a fillcolor, otherwise the mouse events ignore it
            stroke: "none",
            opacity: 0
          });
        // Create a label to measure current radius of the circle.
        var label = this.paper.append('g').classed('radiuslabel', true).attr({
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
        this.surroundingCircleElements = [c, mc, label, line];

        // Store current position of this node, just in case this instance will be
        // re-initialized due to an update. This also means that the circle cannot
        // be drawn while the node is changing location.
        var nodeX = this.x;
        var nodeY = this.y;
        var nodeZ = this.z;

        // Update radius on mouse move
        mc.on('mousemove', function() {
          var e = d3.event;
          var rS = toStack({x: e.layerX, y: e.layerY});
          var r = {
            x: rS.x - nodeX,
            y: rS.y - nodeY,
            z: rS.z - nodeZ
          };
          var newR = Math.sqrt(Math.pow(r.x, 2) + Math.pow(r.y, 2) + Math.pow(r.z, 2));
          c.attr('r', newR);
          // Strore also x and y components
          c.datum(r);
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
            var lineColor = SkeletonAnnotations.active_skeleton_color;
            if (r.z !== 0) {
              lineColor = (r.z < 0) ?
                  SkeletonAnnotations.inactive_skeleton_color_above :
                  SkeletonAnnotations.inactive_skeleton_color_below;
            }
            line.attr({x2: nodeX + r.x, y2: nodeY + r.y, stroke: lineColor});
          }
        });

        // Don't let mouse down events bubble up
        mc.on('mousedown', function() {
            d3.event.stopPropagation();
        });
        mc.on('click', function() {
          d3.event.stopPropagation();
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
        var r = this.surroundingCircleElements[0].datum();
        // Clean up
        this.surroundingCircleElements.forEach(function (e) { if (e) e.remove() ;});
        delete this.surroundingCircleElements;
        // Execute callback, if any, with radius in stack coordinates as argument
        if (callback) {
          if (r) callback(r.x, r.y, r.z);
          else callback();
        }
      };
    };

    ptype.AbstractTreenode.prototype = ptype.NodePrototype;

    ptype.Node = function(
      paper,
      id,         // unique id for the node from the database
      parent,     // the parent node (may be null if the node is not loaded)
      parent_id,  // is null only for the root node
      radius,     // the radius
      x,          // the x coordinate in pixels
      y,          // y coordinates in pixels
      z,          // z coordinates in pixels
      zdiff,      // the difference in z from the current slice
      confidence, // confidence with the parent
      skeleton_id,// the id of the skeleton this node is an element of
      can_edit,   // whether the user can edit (move, remove) this node
      hrefSuffix) // a suffix that is appended to the ID of the referenced geometry
    {
      this.paper = paper;
      this.id = id;
      this.type = SkeletonAnnotations.TYPE_NODE;
      this.parent = parent;
      this.parent_id = parent_id;
      this.children = {};
      this.numberOfChildren = 0;
      this.radius = radius; // the radius as stored in the database
      this.x = x;
      this.y = y;
      this.z = z;
      this.zdiff = zdiff;
      this.confidence = confidence;
      this.skeleton_id = skeleton_id;
      this.can_edit = can_edit;
      this.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
      this.c = null; // The SVG circle for drawing
      this.line = null; // The SVG line element that represents an edge between nodes
      this.hrefSuffix = hrefSuffix;
    };

    ptype.Node.prototype = new ptype.AbstractTreenode();

    ptype.AbstractConnectorNode = function() {
      // For drawing:
      this.USE_HREF = 'connectornodeCircle';
      this.NODE_RADIUS = 8;
      this.CATCH_RADIUS = 0;

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
      };

      this.obliterate = function() {
        this.paper = null;
        this.id = null;
        if (this.c) {
          ptype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_CONNECTORNODE);
          this.c.remove();
        }
        this.subtype = null;
        this.pregroup = null;
        this.postgroup = null;
        this.undirgroup = null;
        // Note: mouse event handlers are removed by c.remove()
        this.removeConnectorArrows(); // also removes confidence text associated with edges
        this.preLines = null;
        this.postLines = null;
        this.undirLines = null;
      };

      this.disable = function() {
        this.id = this.DISABLED;
        if (this.c) {
          this.c.datum(null);
          this.c.hide();
        }
        this.subtype = null;
        this.removeConnectorArrows();
        this.pregroup = null;
        this.postgroup = null;
        this.undirgroup = null;
      };

      this.colorFromZDiff = function()
      {
        // zdiff is in sections, therefore the current section is at [0, 1) -- notice 0 is inclusive and 1 is exclusive.
        if (this.zdiff >= 1) {
          return "rgb(0,0,255)";
        } else if (this.zdiff < 0) {
          return "rgb(255,0,0)";
        } else {
          return "rgb(235,117,0)";
        }
      };

      this.color = function() {
        if (SkeletonAnnotations.getActiveNodeId() === this.id) {
          return "rgb(0,255,0)";
        }
        if (this.zdiff >= 0 && this.zdiff < 1) {
          return "rgb(235,117,0)";
        }
      };

      this.updateColors = function() {
        if (this.c) {
          var fillcolor = this.color();
          this.c.attr({fill: fillcolor});
        }
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
              this.preLines.push(this.createArrow(this, node, this.pregroup[i].confidence, true));
            }
          }
        }

        for (i in this.postgroup) {
          if (this.postgroup.hasOwnProperty(i)) {
            node = this.postgroup[i].treenode;
            if (this.mustDrawLineWith(node)) {
              if (!this.postLines) this.postLines = [];
              this.postLines.push(this.createArrow(this, node, this.postgroup[i].confidence, false));
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
      };

      this.reInit = function(id, x, y, z, zdiff, confidence, subtype, can_edit) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.z = z;
        this.zdiff = zdiff;
        this.confidence = confidence;
        this.subtype = subtype;
        this.can_edit = can_edit;
        this.pregroup = {};
        this.postgroup = {};
        this.undirgroup = {};
        this.needsync = false;

        if (this.c) {
          this.c.datum(id);
          if (this.shouldDisplay()) {
            this.c.attr({x: x, y: y});
          } else {
            this.c.hide();
          }
        }

        this.preLines = null;
        this.postLines = null;
        this.undirLines = null;
      };
    };

    ptype.AbstractConnectorNode.prototype = ptype.NodePrototype;

    ptype.ConnectorNode = function(
      paper,
      id,         // unique id for the node from the database
      x,          // the x coordinate in oriented project coordinates
      y,          // the y coordinate in oriented project coordinates
      z,          // the z coordinate in oriented project coordinates
      zdiff,      // the difference in Z from the current slice in stack space
      confidence, // (TODO: UNUSED)
      subtype,    // the kind of connector node
      can_edit,   // whether the logged in user has permissions to edit this node -- the server will in any case enforce permissions; this is for proper GUI flow
      hrefSuffix) // a suffix that is appended to the ID of the referenced geometry
    {
      this.paper = paper;
      this.id = id;
      this.type = SkeletonAnnotations.TYPE_CONNECTORNODE;
      this.subtype = subtype;
      this.needsync = false; // state variable; whether this node is already synchronized with the database
      this.x = x;
      this.y = y;
      this.z = z;
      this.zdiff = zdiff;
      this.confidence = confidence;
      this.can_edit = can_edit;
      this.pregroup = {}; // set of presynaptic treenodes
      this.postgroup = {}; // set of postsynaptic treenodes
      this.undirgroup = {}; // set of undirected treenodes
      this.c = null; // The SVG circle for drawing
      this.preLines = null; // Array of ArrowLine to the presynaptic nodes
      this.postLines = null; // Array of ArrowLine to the postsynaptic nodes
      this.undirLines = null; // Array of undirected ArraowLine
      this.hrefSuffix = hrefSuffix;
    };

    ptype.ConnectorNode.prototype = new ptype.AbstractConnectorNode();

    /** Event handling functions for 'c'
     * Realize that on constructing the c, we declared:
     *    c.datum() = node.id;  // 'node' is the node
     *
     * Below, the function() is but a namespace that returns a manager object
     * with functions attach and forget.
    */
    ptype.mouseEventManager = new (function()
    {
      /** Variables used for mouse events, which involve a single node at a time.
       * Includes node.x, node.y, node.id and node.c
       * These are set at mc_start, then used at mc_move, and set to null at mc_up. */
      var o = null;

      var is_middle_click = function(e) {
        return 1 === e.button;
      };

      /** Here 'this' is c's SVG node. */
      var mc_dblclick = function(d) {
        d3.event.stopPropagation();
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        catmaidSVGOverlay.ensureFocused();
      };

      /** 
       * Here 'this' is c's SVG node, and node is the Node instance
       */
      this.mc_click = function(d) {
        var e = d3.event;
        e.stopPropagation();
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        if (catmaidSVGOverlay.ensureFocused()) {
          return;
        }
        var node = catmaidSVGOverlay.nodes[d];
        if (e.shiftKey) {
          var atnID = SkeletonAnnotations.getActiveNodeId();
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            return catmaidSVGOverlay.deleteNode(node.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              var atnSubType = SkeletonAnnotations.getActiveNodeSubType();
              if (atnSubType === SkeletonAnnotations.SUBTYPE_SYNAPTIC_CONNECTOR) {
                if (!mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as postsynaptic to connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                catmaidSVGOverlay.createLink(node.id, atnID, "postsynaptic_to");
              } else if (atnSubType === SkeletonAnnotations.SUBTYPE_ABUTTING_CONNECTOR) {
                if (!mayEdit()) {
                  CATMAID.error("You lack permissions to declare node #" + node.id +
                      " as abutting against connector #" + atnID);
                  return;
                }
                // careful, atnID is a connector
                catmaidSVGOverlay.createLink(node.id, atnID, "abutting");
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
              catmaidSVGOverlay.createTreenodeLink(atnID, node.id);
              // TODO check for error
              CATMAID.statusBar.replaceLast("Joined node #" + atnID + " to node #" + node.id);
            }

          } else {
            alert("Nothing to join without an active node!");
          }
        } else {
          // activate this node
          catmaidSVGOverlay.activateNode(node);
        }
      };

      /** Here 'this' is c's SVG node, and node is the Node instance. */
      var mc_move = function(d) {
        var e = d3.event.sourceEvent;
        if (this === null || this.parentNode === null) return; // Not from a valid SVG source.

        if (is_middle_click(e)) return; // Allow middle-click panning

        e.stopPropagation();

        if (!o) return; // Not properly initialized with mc_start
        if (e.shiftKey) return;

        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        var node = catmaidSVGOverlay.nodes[d];

        if (!mayEdit() || !node.can_edit) {
          CATMAID.statusBar.replaceLast("You don't have permission to move node #" + d);
          return;
        }

        if (o.id !== SkeletonAnnotations.getActiveNodeId()) return;
        if (!checkNodeID(this)) return;

        node.x += d3.event.dx;
        node.y += d3.event.dy;
        node.c.attr({
          x: node.x,
          y: node.y
        });
        node.drawEdges(true); // TODO for connector this is overkill
        CATMAID.statusBar.replaceLast("Moving node #" + node.id);

        node.needsync = true;
      };

      /** Here 'this' is c's SVG node. */
      var mc_up = function(d) {
        d3.event.sourceEvent.stopPropagation();
        if (!checkNodeID(this)) return;
        o = null;
        d3.select(this).attr({
          opacity: 1
        });
      };

      var checkNodeID = function(svgNode) {
        if (!o || o.id !== svgNode.__data__) {
          console.log("WARNING: detected ID mismatch in mouse event system.");
          // Reload nodes if the source node is still part of the SVG. It might
          // happen that this is not the case, e.g. if the section was changed
          // before the mouse up event is triggered.
          if (svgNode.parentNode && svgNode.parentNode.parentNode) {
            var svg = SkeletonAnnotations.getSVGOverlayByPaper(svgNode.parentNode.parentNode);
            if (svg) {
              svg.updateNodes();
            } else {
              console.log("Couldn't find SVG overlay for the node receiving the event");
            }
          } else {
            console.log("Couldn't find parent SVG elements for the node receiving the event");
          }
          return false;
        }
        return true;
      };

      /** Here 'this' is c's SVG node. */
      var mc_start = function(d) {
        var e = d3.event.sourceEvent;
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        var node = catmaidSVGOverlay.nodes[d];
        if (is_middle_click(e)) {
          // Allow middle-click panning
          return;
        }
        e.stopPropagation();
        e.preventDefault();

        // If not trying to join or remove a node, but merely click on it to drag it or select it:
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          catmaidSVGOverlay.activateNode(node);
        }

        o = {ox: node.x,
             oy: node.y,
             id: node.id};

        node.c.attr({
          opacity: 0.7
        });
      };

      var mc_mousedown = function(d) {
        var e = d3.event;
        if (is_middle_click(e)) return; // Allow middle-click panning
        e.stopPropagation();
      };

      var connector_mc_click = function(d) {
        var e = d3.event;
        e.stopPropagation();
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        if (catmaidSVGOverlay.ensureFocused()) {
          return;
        }
        var atnID = SkeletonAnnotations.getActiveNodeId(),
            connectornode = catmaidSVGOverlay.nodes[d];
        if (catmaidSVGOverlay.ensureFocused()) {
          return;
        }
        // return some log information when clicked on the node
        // this usually refers here to the c object
        if (e.shiftKey) {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            return catmaidSVGOverlay.deleteNode(connectornode.id);
          }
          if (atnID) {
            var atnType = SkeletonAnnotations.getActiveNodeType();
            // connected activated treenode or connectornode
            // to existing treenode or connectornode
            if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
              alert("Can not join two connector nodes!");
            } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
              var linkType;
              if (SkeletonAnnotations.SUBTYPE_SYNAPTIC_CONNECTOR === connectornode.subtype) {
                linkType = (e.altKey ? 'post' : 'pre') + "synaptic_to";
              } else if (SkeletonAnnotations.SUBTYPE_ABUTTING_CONNECTOR === connectornode.subtype) {
                linkType = "abutting";
              } else {
                CATMAID.error("The selected connector is of unknown type: " + connectornode.subtype);
                return;
              }
              catmaidSVGOverlay.createLink(atnID, connectornode.id, linkType);
              CATMAID.statusBar.replaceLast("Joined node #" + atnID + " with connector #" + connectornode.id);
            }
          } else {
            CATMAID.msg('BEWARE', 'You need to activate a node before ' +
                'joining it to a connector node!');
          }
        } else {
          // activate this node
          catmaidSVGOverlay.activateNode(connectornode);
        }
      };

      this.edge_mc_click = function (d) {
        var e = d3.event;
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        if (catmaidSVGOverlay.ensureFocused()) {
          return;
        }
        var node = catmaidSVGOverlay.nodes[d];
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          e.stopPropagation();
          catmaidSVGOverlay.activateNode(node);
          catmaidSVGOverlay.splitSkeleton(d);
        }
      };

      this.attach = function(mc, type) {
        var drag = d3.behavior.drag();
        drag.on('dragstart', mc_start)
            .on('drag', mc_move)
            .on('dragend', mc_up);
        mc.on('mousedown', mc_mousedown)
          .on("dblclick", mc_dblclick)
          .call(drag);

        if (SkeletonAnnotations.TYPE_NODE === type) {
          mc.on("click", this.mc_click);
        } else {
          // SkeletonAnnotations.TYPE_CONNECTORNODE
          mc.on("click", connector_mc_click);
        }
      };

      this.forget = function(mc, type) {
        ['dragstart', 'drag', 'dragstop', 'mousedown', 'dblclick', 'click'].forEach(function (l) {
          mc.on(l, null);
        });
      };
    })();


    ptype.ArrowLine = function(paper, hrefSuffix) {
      this.line = paper.select('.arrows').append('line');
      // Because the transparent stroke trick will not work for lines, a separate,
      // larger stroked, transparent line is needed to catch mouse events. In SVG2
      // this can be achieved on the original line with a marker-segment.
      this.catcher = paper.select('.arrows').append('line');
      this.catcher.on('mousedown', this.mousedown);
      this.catcher.on('mouseover', this.mouseover);
      this.confidence_text = null;
      this.hrefSuffix = hrefSuffix;
    };

    ptype.ArrowLine.prototype = new (function() {
      this.PRE_COLOR = "rgb(200,0,0)";
      this.POST_COLOR = "rgb(0,217,232)";
      this.OTHER_COLOR = "rgb(0,200,0)";
      this.BASE_EDGE_WIDTH = 2;
      this.CATCH_SCALE = 3;
      this.CONFIDENCE_FONT_PT = 15;
      this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';
      this.scaling = 1.0;

      /** Function to assign to the SVG arrow. */
      this.mousedown = (function(d) {
        var e = d3.event;
        e.stopPropagation();
        if(!(e.shiftKey && (e.ctrlKey || e.metaKey))) {
          return;
        }
        // Mark this edge as suspended so that other interaction modes don't
        // expect it to be there.
        d.suspended = true;

        // 'this' will be the the connector's mouse catcher line
        var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode.parentNode);
        requestQueue.register(django_url + project.id + '/link/delete', "POST", {
          pid: project.id,
          connector_id: d.connector_id,
          treenode_id: d.treenode_id
        }, function (status, text) {
          if (status !== 200) {
            alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
          } else {
              if (text && text !== " ") {
                var e = $.parseJSON(text);
                if (e.error) {
                  d.suspended = false;
                  alert(e.error);
                } else {
                  catmaidSVGOverlay.updateNodes(function() {
                    // Reset deletion flag
                    d.suspended = false;
                  });
                  return true;
                }
              }
          }
        });
      });

      this.mouseover = function (d) {
        // If this edge is suspended, don't try to retrieve any information.
        if (d.suspended) {
          return;
        }
        var relation_name, title;
        if (d.is_pre === undefined) {
          relation_name = 'abutting';
          title = 'Abutting';
        } else if (d.is_pre) {
          relation_name = 'presynaptic_to';
          title = 'Presynaptic';
        } else {
          relation_name = 'postsynaptic_to';
          title = 'Postsynaptic';
        }

        requestQueue.register(
            django_url + project.id + '/connector/user-info',
            'GET',
            { treenode_id: d.treenode_id,
              connector_id: d.connector_id,
              relation_name: relation_name},
            CATMAID.jsonResponseHandler(function(data) {
              var msg = title + ' edge: ' + data.map(function (info) {
                return 'created by ' + User.safeToString(info.user) + ' ' +
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

        this.line.attr({x1: x1, y1: y1, x2: x2new, y2: y2new});
        this.catcher.attr({x1: x1, y1: y1, x2: x2new, y2: y2new});

        var stroke_color;
        if (undefined === is_pre) stroke_color = this.OTHER_COLOR;
        else stroke_color = is_pre ? this.PRE_COLOR : this.POST_COLOR;

        if (confidence < 5) {
          this.confidence_text = this.updateConfidenceText(x2, y2, x1, y1, stroke_color, confidence, this.confidence_text);
        } else if (this.confidence_text) {
          this.confidence_text.remove();
          this.confidence_text = null;
        }
        // Adjust
        var opts = {stroke: stroke_color, 'stroke-width': this.EDGE_WIDTH };
        if (undefined === is_pre) {
          opts['marker-end'] = 'none';
        } else {
          var def = is_pre ? 'markerArrowPre' : 'markerArrowPost';
          opts['marker-end'] = 'url(#' + def + this.hrefSuffix + ')';
        }
        this.line.attr(opts);
        this.catcher.attr({stroke: stroke_color, // Though invisible, must be set for mouse events to trigger
                           'stroke-opacity': 0,
                           'stroke-width': this.EDGE_WIDTH*this.CATCH_SCALE });

        this.show();
      };

      this.show = function() {
        // Ensure visible
        if ('hidden' === this.line.attr('visibility')) {
          this.line.show();
          this.catcher.show();
        }
      };

      this.disable = function() {
        this.catcher.datum(null);
        this.line.hide();
        this.catcher.hide();
        if (this.confidence_text) this.confidence_text.hide();
      };

      this.obliterate = function() {
        this.catcher.datum(null);
        this.catcher.on('mousedown', null);
        this.catcher.on('mouseover', null);
        this.line.remove();
        this.line = null;
        this.catcher.remove();
        this.catcher = null;
        if (this.confidence_text) {
          this.confidence_text.remove();
          this.confidence_text = null;
        }
      };

      this.init = function(connector, node, confidence, is_pre) {
        this.catcher.datum({connector_id: connector.id, treenode_id: node.id, is_pre: is_pre});
        if (is_pre) {
          this.update(node.x, node.y, connector.x, connector.y, is_pre, confidence, connector.NODE_RADIUS*node.scaling);
        } else {
          this.update(connector.x, connector.y, node.x, node.y, is_pre, confidence, node.NODE_RADIUS*node.scaling);
        }
      };

      var markerSize = [5, 4];

      this.scale = function(baseScale, resScale, dynamicScale) {
        this.scaling = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
        this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * baseScale * (dynamicScale ? 1 : resScale);
        this.confidenceFontSize = this.CONFIDENCE_FONT_PT*this.scaling + 'pt';
        // If not in screen scaling mode, do not need to scale markers (but must reset scale).
        var scale = dynamicScale ? resScale*dynamicScale : 1;
        this.markerDefs.forEach(function (m) {
          m.attr({
            markerWidth: markerSize[0]*scale,
            markerHeight: markerSize[1]*scale
          });
        });
      };

      this.initDefs = function(defs, hrefSuffix) {
        // Note that in SVG2 the fill could be set to 'context-stroke' and would
        // work appropriately as an end marker for both pre- and post- connectors.
        // However, this SVG2 feature is not supported in current browsers, so two
        // connectors are created, one for each color.
        this.markerDefs = [
          defs.append('marker'),
          defs.append('marker')];
        var ids = ['markerArrowPost', 'markerArrowPre'];
        var colors = [this.POST_COLOR, this.PRE_COLOR];
        this.markerDefs.forEach(function (m, i) {
            m.attr({
            id: ids[i] + (hrefSuffix || ''),
            viewBox: '0 0 10 10',
            markerWidth: markerSize[0],
            markerHeight: markerSize[1],
            markerUnits: 'strokeWidth',
            refX: '10',
            refY: '5',
            orient: 'auto'
          }).append('path').attr({
            d: 'M 0 0 L 10 5 L 0 10 z',
            fill: colors[i]
          });
        });
      };
    })();


    /** Used for confidence between treenode nodes and confidence between
     * a connector and a treenode. */
    (function(classes) {
      var updateConfidenceText = function (x, y,
                                           parentx, parenty,
                                           fillColor,
                                           confidence,
                                           existing) {
        var text,
        numberOffset = 0.8 * this.CONFIDENCE_FONT_PT * this.scaling,
        xdiff = parentx - x,
        ydiff = parenty - y,
        length = Math.sqrt(xdiff*xdiff + ydiff*ydiff),
        // Compute direction to offset label from edge. If node and parent are at
        // the same location, hardwire to offset vertically to prevent NaN x, y.
        nx = length === 0 ? 0 : -ydiff / length,
        ny = length === 0 ? 1 : xdiff / length,
        newConfidenceX = (x + parentx) / 2 + nx * numberOffset,
        newConfidenceY = (y + parenty) / 2 + ny * numberOffset;

        if (existing) {
          text = existing;
          text.show();
        } else {
          text = d3.select(this.line.node().parentNode).append('text');
          text.toBack();
        }

        text.attr({x: newConfidenceX,
                   y: newConfidenceY,
                   'font-size': this.confidenceFontSize,
                   'text-anchor': 'middle',
                   'alignment-baseline': 'middle',
                   fill: fillColor})
            .text(""+confidence);

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
