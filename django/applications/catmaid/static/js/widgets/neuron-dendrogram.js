/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  InstanceRegistry,
  project,
  SkeletonAnnotations
*/

(function(CATMAID) {

  "use strict";

  /**
   * The neuron dendrogram widget represents a neuron as a dendrogram.
   */
  var NeuronDendrogram = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.collapsed = true;
    this.showNodeIDs = false;
    this.showTags = true;
    this.showStrahler = false;
    this.showConnectorPartners = false;
    this.radialDisplay = true;
    this.minStrahler = 1;
    this.collapseNotABranch = true;
    this.warnCollapsed = true;
    this.highlightTags = [];

    // Stores a reference to the current SVG, if any
    this.svg = null;
    // The current translation and scale, to preserve state between updates
    this.translation = null;
    this.scale = null;
    // The last node selected
    this.selectedNodeId = null;

    // Indicates if an update is currently in progress
    this.updating = false;
    // Indicates whether the widget should update automatically if the skeleton
    // changes.
    this.autoUpdate = true;

    // Multipliers for horizontal node spacing and vertical leaf spacing
    this.hNodeSpaceFactor = 1.0;
    this.vNodeSpaceFactor = 1.0;

    // Factor for the default line width
    this.lineWidthFactor = 1.0;

    // Listen to change events of the active node and skeletons
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
        this.handleSkeletonChange, this);
  };

  NeuronDendrogram.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  NeuronDendrogram.prototype.constructor = NeuronDendrogram;

  $.extend(NeuronDendrogram.prototype, new InstanceRegistry());
  CATMAID.asEventSource(NeuronDendrogram.prototype);

  /* Implement interfaces */

  NeuronDendrogram.prototype.getName = function()
  {
    return "Neuron Dendrogram " + this.widgetID;
  };

  NeuronDendrogram.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "dendrogram_buttons" + this.widgetID,
      contentID: "dendrogram" + this.widgetID,
      createControls: function(controls) {
        var self = this;

        // Create tabs
        var tabs = CATMAID.DOM.addTabGroup(controls,
            'dendrogram_buttons' + this.widgetID, ['Main', 'Display']);

        var load = document.createElement('input');
        load.setAttribute("type", "button");
        load.setAttribute("value", "Display active skeleton");
        load.onclick = this.loadActiveSkeleton.bind(this);
        tabs['Main'].appendChild(load);

        var exportSVG = document.createElement('input');
        exportSVG.setAttribute("type", "button");
        exportSVG.setAttribute("value", "Export SVG");
        exportSVG.onclick = this.exportSVG.bind(this);
        tabs['Main'].appendChild(exportSVG);

        var highlightTags = document.createElement('input');
        highlightTags.setAttribute("type", "button");
        highlightTags.setAttribute("value", "Highlight tags");
        highlightTags.onclick = this.chooseHighlightTags.bind(this);
        tabs['Main'].appendChild(highlightTags);

        var minStrahler = document.createElement('label');
        minStrahler.appendChild(document.createTextNode('Collapse Strahler <'));
        var minStrahlerInput = document.createElement('input');
        minStrahlerInput.setAttribute('type', 'number');
        minStrahlerInput.setAttribute('min', 1);
        minStrahlerInput.setAttribute('max', 999);
        minStrahlerInput.setAttribute('id', 'dendrogram-minStrahler-' + this.widgetID);
        if (this.minStrahler) {
          minStrahlerInput.value = this.minStrahler;
        }
        minStrahlerInput.onchange = function(e) {
            self.setMinStrahler(parseInt(this.value, 10));
            self.update();
        };
        minStrahlerInput.oninput = function(e) {
          if ('Enter' === e.key) {
            self.update();
          } else {
            self.setMinStrahler(parseInt(this.value, 10));
          }
        };
        minStrahlerInput.onwheel = function(e) {
            if ((e.deltaX + e.deltaY) > 0) {
              if (this.value > 1) {
                this.value = parseInt(this.value, 10) - 1;
                this.onchange();
              }
            } else {
              this.value = parseInt(this.value, 10) + 1;
              this.onchange();
            }

            return false;
        };
        minStrahler.appendChild(minStrahlerInput);
        tabs['Main'].appendChild(minStrahler);

        var collapse = document.createElement('label');
        var collapseInput = document.createElement('input');
        collapseInput.setAttribute('type', 'checkbox');
        if (this.collapsed) {
          collapseInput.setAttribute('checked', 'checked');
        }
        collapseInput.onchange = function() {
          self.setCollapsed(this.checked);
          self.update();
        };
        collapse.appendChild(collapseInput);
        collapse.appendChild(document.createTextNode('Only branches and tagged nodes'));
        tabs['Main'].appendChild(collapse);

        var showConnectorPartners = document.createElement('label');
        var showConnectorPartnersInput = document.createElement('input');
        showConnectorPartnersInput.setAttribute('type', 'checkbox');
        if (this.showConnectorPartners) {
          showConnectorPartnersInput.setAttribute('checked', 'checked');
        }
        showConnectorPartnersInput.onchange = function() {
          self.setShowConnectorPartners(this.checked);
          self.update();
        };
        showConnectorPartners.appendChild(showConnectorPartnersInput);
        showConnectorPartners.appendChild(document.createTextNode('Show connector partners'));
        tabs['Main'].appendChild(showConnectorPartners);

        var collapseNotABranch = document.createElement('label');
        var collapseNotABranchInput = document.createElement('input');
        collapseNotABranchInput.setAttribute('type', 'checkbox');
        if (this.collapseNotABranch) {
          collapseNotABranchInput.setAttribute('checked', 'checked');
        }
        collapseNotABranchInput.onchange = function() {
          self.setCollapseNotABranch(this.checked);
          self.update();
        };
        collapseNotABranch.appendChild(collapseNotABranchInput);
        collapseNotABranch.appendChild(document.createTextNode('Collapse \"not a branch\" nodes'));
        tabs['Main'].appendChild(collapseNotABranch);

        var warnCollapsed = document.createElement('label');
        var warnCollapsedInput = document.createElement('input');
        warnCollapsedInput.setAttribute('type', 'checkbox');
        if (this.warnCollapsed) {
          warnCollapsedInput.setAttribute('checked', 'checked');
        }
        warnCollapsedInput.onchange = function() {
          self.setWarnCollapsed(this.checked);
          self.update();
        };
        warnCollapsed.appendChild(warnCollapsedInput);
        warnCollapsed.appendChild(document.createTextNode('Warn if collapsed'));
        warnCollapsed.setAttribute('alt', 'If activated, a warning is displayed ' +
            'everytime one tries to select a node that is currently collapsed.');
        tabs['Main'].appendChild(warnCollapsed);

        var radial = document.createElement('label');
        var radialInput = document.createElement('input');
        radialInput.setAttribute('type', 'checkbox');
        if (this.radialDisplay) {
          radialInput.setAttribute('checked', 'checked');
        }
        radialInput.onchange = function() {
          self.setRadialDisplay(this.checked);
          self.update();
        };
        radial.appendChild(radialInput);
        radial.appendChild(document.createTextNode('Radial'));
        tabs['Main'].appendChild(radial);

        var hSpacingFactor = document.createElement('label');
        hSpacingFactor.appendChild(document.createTextNode('H Space Factor'));
        var hSpacingFactorInput = document.createElement('input');
        hSpacingFactorInput.setAttribute('type', 'number');
        hSpacingFactorInput.setAttribute('min', 0.01);
        hSpacingFactorInput.setAttribute('max', 10);
        hSpacingFactorInput.setAttribute('step', 0.01);
        hSpacingFactorInput.setAttribute('id', 'dendrogram-hSpacingFactor-' + this.widgetID);
        hSpacingFactorInput.style.width = '5em';
        if (this.hNodeSpaceFactor) {
          hSpacingFactorInput.value = this.hNodeSpaceFactor.toFixed(2);
        }
        hSpacingFactorInput.onchange = function(e) {
            self.setHSpaceFactor(parseFloat(this.value));
            self.update();
        };
        hSpacingFactorInput.oninput = function(e) {
          if ('Enter' === e.key) {
            self.update();
          } else {
            self.setHSpaceFactor(parseFloat(this.value));
          }
        };
        hSpacingFactorInput.onwheel = function(e) {
          var step = Number(this.step);
          if ((e.deltaX + e.deltaY) > 0) {
            if (this.value > 0.01) {
              this.value = (parseFloat(this.value) - step).toFixed(2);
              this.onchange();
            }
          } else {
            this.value = (parseFloat(this.value) + step).toFixed(2);
            this.onchange();
          }

          return false;
        };
        hSpacingFactor.appendChild(hSpacingFactorInput);
        tabs['Display'].appendChild(hSpacingFactor);

        var vSpacingFactor = document.createElement('label');
        vSpacingFactor.appendChild(document.createTextNode('V Space Factor'));
        var vSpacingFactorInput = document.createElement('input');
        vSpacingFactorInput.setAttribute('type', 'number');
        vSpacingFactorInput.setAttribute('min', 0.01);
        vSpacingFactorInput.setAttribute('max', 10);
        vSpacingFactorInput.setAttribute('step', 0.01);
        vSpacingFactorInput.setAttribute('id', 'dendrogram-vSpacingFactor-' + this.widgetID);
        vSpacingFactorInput.style.width = '5em';
        if (this.hNodeSpaceFactor) {
          vSpacingFactorInput.value = this.vNodeSpaceFactor.toFixed(2);
        }
        vSpacingFactorInput.onchange = function(e) {
            self.setVSpaceFactor(parseFloat(this.value));
            self.update();
        };
        vSpacingFactorInput.oninput = function(e) {
          if ('Enter' === e.key) {
            self.update();
          } else {
            self.setVSpaceFactor(parseFloat(this.value));
          }
        };
        vSpacingFactorInput.onwheel = function(e) {
          var step = Number(this.step);
          if ((e.deltaX + e.deltaY) > 0) {
            if (this.value > 0.01) {
              this.value = (parseFloat(this.value) - step).toFixed(2);
              this.onchange();
            }
          } else {
            this.value = (parseFloat(this.value) + step).toFixed(2);
            this.onchange();
          }

          return false;
        };
        vSpacingFactor.appendChild(vSpacingFactorInput);
        tabs['Display'].appendChild(vSpacingFactor);

        var lineWidthFactor = document.createElement('label');
        lineWidthFactor.appendChild(document.createTextNode('Line Width Factor'));
        var lineWidthFactorInput = document.createElement('input');
        lineWidthFactorInput.setAttribute('type', 'number');
        lineWidthFactorInput.setAttribute('min', 0);
        lineWidthFactorInput.setAttribute('step', 1);
        lineWidthFactorInput.setAttribute('id', 'dendrogram-lineWidthFactor-' + this.widgetID);
        lineWidthFactorInput.style.width = '5em';
        if (this.lineWidthFactor) {
          lineWidthFactorInput.value = this.lineWidthFactor.toFixed(1);
        }
        lineWidthFactorInput.onchange = function(e) {
            self.lineWidthFactor = parseFloat(this.value);
            self.update();
        };
        lineWidthFactorInput.oninput = function(e) {
          if ('Enter' === e.key) {
            self.update();
          } else {
            self.lineWidthFactor = parseFloat(this.value);
          }
        };
        lineWidthFactorInput.onwheel = function(e) {
          var step = Number(this.step);
          if ((e.deltaX + e.deltaY) > 0) {
            if (this.value > 0) {
              this.value = (parseFloat(this.value) - step).toFixed(1);
              this.onchange();
            }
          } else {
            this.value = (parseFloat(this.value) + step).toFixed(1);
            this.onchange();
          }

          return false;
        };
        lineWidthFactor.appendChild(lineWidthFactorInput);
        tabs['Display'].appendChild(lineWidthFactor);

        var naming = document.createElement('label');
        var namingInput = document.createElement('input');
        namingInput.setAttribute('type', 'checkbox');
        if (this.showNodeIDs) {
          namingInput.setAttribute('checked', 'checked');
        }
        namingInput.onchange = function() {
          self.setShowNodeIds(this.checked);
          self.update();
        };
        naming.appendChild(namingInput);
        naming.appendChild(document.createTextNode('Show node IDs'));
        tabs['Display'].appendChild(naming);

        var showTags = document.createElement('label');
        var showTagsInput = document.createElement('input');
        showTagsInput.setAttribute('type', 'checkbox');
        if (this.showTags) {
          showTagsInput.setAttribute('checked', 'checked');
        }
        showTagsInput.onchange = function() {
          self.setShowTags(this.checked);
          self.update();
        };
        showTags.appendChild(showTagsInput);
        showTags.appendChild(document.createTextNode('Show tags'));
        tabs['Display'].appendChild(showTags);

        var showStrahler = document.createElement('label');
        var showStrahlerInput = document.createElement('input');
        showStrahlerInput.setAttribute('type', 'checkbox');
        if (this.showStrahler) {
          showStrahlerInput.setAttribute('checked', 'checked');
        }
        showStrahlerInput.onchange = function() {
          self.setShowStrahler(this.checked);
          self.update();
        };
        showStrahler.appendChild(showStrahlerInput);
        showStrahler.appendChild(document.createTextNode('Show Strahler'));
        tabs['Display'].appendChild(showStrahler);

        // Initialize tabs
        $(controls).tabs();
      },
      createContent: function(content) {
        this.init(content);
      }
    };
  };

  NeuronDendrogram.prototype.destroy = function() {
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
        this.handleSkeletonChange, this);
    this.unregisterInstance();
    this.unregisterSource();
  };

  NeuronDendrogram.prototype.append = function() {};
  NeuronDendrogram.prototype.clear = function(source_chain) {};
  NeuronDendrogram.prototype.removeSkeletons = function() {};
  NeuronDendrogram.prototype.updateModels = function() {};

  NeuronDendrogram.prototype.getSelectedSkeletons = function()
  {
    if (this.currentSkeletonId) {
      return [this.currentSkeletonId];
    } else {
      return [];
    }
  };

  NeuronDendrogram.prototype.hasSkeleton = function(skeleton_id)
  {
    return this.currentSkeletonId === skeleton_id;
  };

  NeuronDendrogram.prototype.getSelectedSkeletonModels = function()
  {
    var models = {};
    if (this.currentSkeletonId) {
      models[this.currentSkeletonId] = new CATMAID.SkeletonModel(
          this.currentSkeletonId, "", new THREE.Color(1, 1, 0));
    }
    return models;
  };

  NeuronDendrogram.prototype.highlight = function(skeleton_id)
  {
    // TODO: Highlight
  };

  /* Non-interface methods */

  NeuronDendrogram.prototype.init = function(container)
  {
    this.container = container;
  };

  /**
   * Will select the active node, if its skeleton is laoded. If the active node is
   * a collapsed node, the next visible child will be selected.
   */
  NeuronDendrogram.prototype.selectActiveNode = function(activeNode)
  {
    if (activeNode) {
      this.selectNode(activeNode.id, activeNode.skeleton_id);
    } else {
      this.resetHighlighting();
    }
  };

  /**
   * Will select the node with the given ID, if its skeleton is laoded. If the
   * active node is a collapsed node, the next visible child will be selected.
   */
  NeuronDendrogram.prototype.selectNode = function(node_id, skeleton_id)
  {
    // If there is an update in progress, currently, then wait for it to finish
    if (this.updating) {
      // Try again in 100ms
      setTimeout(this.selectNode.bind(this, node_id, skeleton_id), 100);
      return;
    }

    if (!node_id || skeleton_id !== this.currentSkeletonId || !this.renderTree) {
      this.selectedNodeId = null;
      this.resetHighlighting();
      return;
    }

    var nodesToChildren = this.currentSkeletonTree.reduce(function(o, n) {
      // Map node ID to parent ID
      var c = o[n[0]];
      if (!c) {
        o[n[0]] = [];
      }

      // Map all children to parent
      var p = o[n[1]];
      if (!p) {
       p = [];
       o[n[1]] = p;
      }
      p.push(n[0]);

      return o;
    }, {});

    // If a virtual node should be selected, use the real parent instead.
    if (!SkeletonAnnotations.isRealNode(node_id)) {
      node_id = SkeletonAnnotations.getChildOfVirtualNode(node_id);
    }

    // Make sure the requested node is part of the current skeleton
    if (!(node_id in nodesToChildren)) {
      if (this.autoUpdate) {
        // Reload the skeleton and disable auto update during this time to not end
        // in an infinite loop by accident (if the nodes cannot be retrieved).
        this.autoUpdate = false;
        this.loadSkeleton(this.currentSkeletonId)
          .then(() => {
            this.selectNode(node_id, skeleton_id);
            this.autoUpdate = true;
          });
      } else {
        CATMAID.msg("Error", "The requested node (" + node_id + ") was not " +
            "found in the internal skeleton representation. Try updating it.");
      }
      return;
    }

    this.selectedNodeId = node_id;

    // Find either node itself or closest parent
    var nodeToHighlight = node_id;
    var toExplore = [];
    while (true) {
      if (-1 !== this.renderedNodeIds.indexOf(nodeToHighlight)) {
        break;
      } else {
        // Get set of child nodes
        toExplore.push.apply(toExplore, nodesToChildren[nodeToHighlight]);

        if (0 === toExplore.length) {
          if (this.warnCollapsed) {
            CATMAID.info("Couldn highlight the currently selected node, because " +
                "it is collapsed and no visible node downstream was found");
          }
          // Return, because the closest visible parent has been found
          return;
        }
        // test next node in queue
        nodeToHighlight = toExplore.pop();
      }
    }

    if (!nodeToHighlight) {
      CATMAID.error("Couldn't find node to highlight in dendrogram");
      return;
    } else if (nodeToHighlight !== node_id && this.warnCollapsed) {
      var getDepth = function(node, depth) {
        var children = nodesToChildren[node];
        if (node === nodeToHighlight) { return depth; }
        if (0 === children.length) { return null; }

        for (var i=0; i<children.length; ++i) {
          var result = getDepth(children[i], depth + 1);
          if (null !== result) { return result; }
        }

        return null;
      };
      var numDownstreamSteps = getDepth(node_id, 0);

      CATMAID.info("The active node is currently not visible in the dendrogram. " +
         "Therefore, the next visible node downstream has been selected, which " +
         "is " + numDownstreamSteps + " hop(s) away.");
    }

    this.highlightNode(nodeToHighlight);
  };

  /**
   * Reacts to the change in the given skeleton
   */
  NeuronDendrogram.prototype.handleSkeletonChange = function(skeletonID)
  {
    if (skeletonID === this.currentSkeletonId) {
      if (this.selectedNodeId) {
        // Make sure we have the correct skeleton loaded
        CATMAID.Treenodes.info(project.id, this.selectedNodeId)
          .then(result => {
            this.loadSkeleton(result.skeleton_id);
          })
          .catch(CATMAID.handleError);
      } else {
        this.loadSkeleton(skeletonID);
      }
    }
  };

  /**
   * Load the active skeleton
   */
  NeuronDendrogram.prototype.loadActiveSkeleton = function()
  {
    var skid = SkeletonAnnotations.getActiveSkeletonId();
    if (!skid) {
      alert("There is currently no skeleton selected.");
      return;
    }

    this.loadSkeleton(skid)
      .then(() => {
        let activeTreenodeId = SkeletonAnnotations.getActiveNodeId();
        return this.selectNode(activeTreenodeId, skid);
      })
      .catch(CATMAID.handleError);
  };

  NeuronDendrogram.prototype.reset = function()
  {
    this.scale = null;
    this.translation = null;
  };

  /**
   * Load the given skeleton.
   */
  NeuronDendrogram.prototype.loadSkeleton = function(skid)
  {
    if (!skid) {
      alert("Please provide a skeleton ID");
      return;
    }

    // Indicate update
    this.updating = true;

    // Retrieve skeleton data
    return CATMAID.fetch(project.id + '/skeletons/' + skid + '/compact-detail', 'GET', {
        with_connectors: true,
        with_tags: true
      })
      .then((function(data) {
        this.reset();
        this.currentSkeletonId = skid;
        this.currentSkeletonTree = data[0];
        this.currentSkeletonConnectors = data[1];
        this.currentSkeletonTags = data[2];
        var ap  = new CATMAID.ArborParser().init('compact-skeleton', data);
        this.currentArbor = ap.arbor;
        this.update();
        this.updating = false;
      }).bind(this))
      .catch((function(error) {
        this.updating = false;
        CATMAID.handleError(error);
      }).bind(this));
  };

  /**
   * Traverses the given tree and returns a list of the IDs of all nodes in it.
   */
  NeuronDendrogram.prototype.getNodesInTree = function(rootNode)
  {
    function traverse(node, node_ids)
    {
      node_ids.push(node.id);

      if (node.children) {
        node.children.forEach(function(c) {
          traverse(c, node_ids);
        });
      }
    }

    var node_ids = [];

    if (rootNode) {
      traverse(rootNode, node_ids);
    }

    return node_ids;
  };

  /**
   * Helper to create a tree representation of a skeleton. Expects data to be of
   * the format [id, parent_id, user_id, x, y, z, radius, confidence].
   */
  var createTree = function(index, taggedNodes, connectorPartnerNodes, data,
      belowTag, collapsed, strahler, minStrahler, blacklist) {
    var id = data[0];
    var tagged = taggedNodes.has(id);
    belowTag =  belowTag || tagged;
    // Basic node data structure
    var node = {
      'id': id,
      'loc_x': data[3],
      'loc_y': data[4],
      'loc_z': data[5],
      'tagged': tagged,
      'belowTag': belowTag,
      'strahler': strahler[id],
      'connectorLinked': connectorPartnerNodes.get(id)
    };

    // Add children to node, if they exist
    if (index.hasOwnProperty(id)) {

      var findNext = function(n) {
        var cid = n[0];
        var skip = (collapsed && // collapse active?
                    index.hasOwnProperty(cid) && // is parent?
                    (1 === index[cid].length) && // only one child?
                    !connectorPartnerNodes.has(cid) && // no connector node
                    !taggedNodes.has(cid)) || // not tagged?
                   (minStrahler && // Alternatively, is min Strahler set?
                    strahler[cid] < minStrahler) || // Strahler below threshold?
                   (blacklist.has(cid)); // Alternatively, blacklisted?
        if (skip) {
            // Test if child can also be skipped, if available
            var c = index[cid];
            return c ? findNext(c[0]) : null;
        } else {
          return n;
        }
      };

      var notNull = function(o) {
        return o !== null;
      };

      node.children = index[id].map(findNext).filter(notNull).map(function(c) {
        return createTree(index, taggedNodes, connectorPartnerNodes, c,
            belowTag, collapsed, strahler, minStrahler, blacklist);
      });

    }

    return node;
  };

  /**
   * Creates a tree representation of a node array. Nodes that appear in
   * taggedNodes get a label attached.
   */
  NeuronDendrogram.prototype.createTreeRepresentation = function(nodes,
      taggedNodes, connectorPartnerNodes, nodesToSkip)
  {
    // Prepare hierarchical node data structure which is readable by d3. This is
    // done by indexing by parent first and then building the tree object.
    var parentToChildren = nodes.reduce(function(o, n) {
      var parent = n[1];
      if (!o.hasOwnProperty(parent)) {
        o[parent] = [];
      }
      // Push whole table row as value
      o[parent].push(n);
      return o;
    }, {});
    // Make sure we have exactly one root node
    if (!parentToChildren.hasOwnProperty(null)) {
      alert("Couldn't find root node. Aborting dendrogram rendering!");
      return;
    }
    if (parentToChildren[null].length > 1) {
      alert("Found more than one root node. Aborting dendrogram rendering!");
      return;
    }

    // Create Strahler indexes
    var strahler = this.currentArbor.strahlerAnalysis();

    // Create the tree, starting from the root node
    var root = parentToChildren[null][0];
    var tree = createTree(parentToChildren, taggedNodes, connectorPartnerNodes,
        root, false, this.collapsed, strahler, this.minStrahler, nodesToSkip);

    return tree;
  };

  NeuronDendrogram.prototype.resize = function()
  {
    // For now do nothing.
  };

  function makeConnectorTypeElement(list) {
    return [list[0], list[2]];
  }

  function getConnectorPartnerNodes(connectorNodes) {
    return connectorNodes.map(makeConnectorTypeElement);
  }


  NeuronDendrogram.prototype.update = function()
  {
    if (!(this.currentSkeletonTree && this.currentSkeletonTags))
    {
      return;
    }

    var getTaggedNodes = (function(tags)
    {
      var mapping = this.currentSkeletonTags;
      // Add all tagged node IDs to result
      return tags.reduce(function(o, tag) {
        if (mapping.hasOwnProperty(tag)) {
          o = o.concat(mapping[tag]);
        }
        return o;
      }, []);
    }).bind(this);

    var taggedNodeIds = new Set(getTaggedNodes(this.highlightTags));
    var connectorPartnerNodes = new Map(this.showConnectorPartners ?
        getConnectorPartnerNodes(this.currentSkeletonConnectors) : []);
    var blacklist = new Set(this.collapseNotABranch ? getTaggedNodes(['not a branch']): []);
    this.renderTree = this.createTreeRepresentation(this.currentSkeletonTree,
        taggedNodeIds, connectorPartnerNodes, blacklist);
    this.renderedNodeIds = this.getNodesInTree(this.renderTree);

    if (this.currentSkeletonTree && this.currentSkeletonTags) {
      this.renderDendogram(this.renderTree, this.currentSkeletonTags,
         this.highlightTags);
    }

    // Select the active node after every change
    if (this.selectedNodeId && this.currentSkeletonId) {
      this.selectNode(this.selectedNodeId, this.currentSkeletonId);
    }
  };

  /**
   * Return the number of leaf nodes in the given tree representation.
   */
  NeuronDendrogram.prototype.getNumLeafs = function(node)
  {
    if (node.hasOwnProperty("children")) {
      return 1 + node.children
          .map(NeuronDendrogram.prototype.getNumLeafs)
          .reduce(function(s, n) {
        return Math.max(s, n);
      }, 0);
    } else {
      return 1;
    }
  };

  /**
   * Return the maximum depth of the given tree representation.
   */
  NeuronDendrogram.prototype.getMaxDepth = function(node)
  {
    if (node.hasOwnProperty("children")) {
      return node.children
          .map(NeuronDendrogram.prototype.getMaxDepth)
          .reduce(function(s, n) {
        return s + n;
      }, 0);
    } else {
      return 1;
    }
  };

  /**
   * Remove the 'highlight' class from all nodes.
   */
  NeuronDendrogram.prototype.resetHighlighting = function()
  {
    d3.selectAll('.node').classed('highlight', false);
  };

  /**
   * Add the 'highlight' class to a node element and its children.
   */
  NeuronDendrogram.prototype.highlightNode = function(node_id)
  {
    this.resetHighlighting();

    // Get the actual node
    var node = d3.select("#node" + node_id).data();
    if (node.length !== 1) {
      CATMAID.error("Couldn't find node " + node_id + " in dendrogram");
      return;
    } else {
      node = node[0];
    }

    // Highlight current node and children
    function highlightNodeAndChildren(n) {
      // Set node to be highlighted
      d3.select("#node" + n.id).classed('highlight', true);
      // Highlight children
      if (n.children) {
        n.children.forEach(highlightNodeAndChildren);
      }
    }
    highlightNodeAndChildren(node);
  };

  /**
    * Renders a new dendrogram containing the provided list of nodes.
    */
  NeuronDendrogram.prototype.renderDendogram = function(tree, tags, referenceTags)
  {
    var margin = {top: 50, right: 70, bottom: 50, left: 70};
    var baseWidth = this.container.clientWidth - margin.left - margin.right;
    var baseHeight = this.container.clientHeight - margin.top - margin.bottom;

    // Adjust the width and height so that each node has at least a space of 20x80px
    var nodeSize = [20, 80];
    var width;
    var height;
    var factor = 1;
    if (this.radialDisplay) {
      width = baseWidth * factor;
      height = baseHeight * factor;
    } else {
      baseWidth = this.hNodeSpaceFactor * baseWidth;
      baseHeight = this.vNodeSpaceFactor * baseHeight;
      width = Math.max(baseWidth, this.hNodeSpaceFactor * nodeSize[0] * this.getMaxDepth(tree));
      height = Math.max(baseHeight, this.vNodeSpaceFactor * nodeSize[1] * this.getNumLeafs(tree));
    }

    // Create clustering where each leaf node has the same distance to its
    // neighbors.
    var dendrogramSize;
    if (this.radialDisplay) dendrogramSize = [360 * this.vNodeSpaceFactor, 360 * this.hNodeSpaceFactor];
    else dendrogramSize = [height, width];
    var dendrogram = d3.layout.cluster()
      .size(dendrogramSize)
      .separation(function() { return 1; });

    // Find default scale so that everything can be seen, if no scale is cached.
    if (!this.scale) {
      this.scale =  baseWidth > baseHeight ? baseHeight / height : baseWidth / width;
    }
    // Set default translation to margin, if no translation is cached
    if (!this.translation) {
      this.translation = [margin.left, margin.top];
    }

    // Clear existing container
    $("#dendrogram" + this.widgetID).empty();

    // Create display specific parts
    var nodeTransform;
    var styleNodeText;
    var pathGenerator;
    var layoutOffset;
    if (this.radialDisplay) {
      layoutOffset = [width / 2, height / 2];
      // Radial scales for x and y.
      var lx = function(d) { return factor * d.y * Math.cos((d.x - 90) / 180 * Math.PI); };
      var ly = function(d) { return factor * d.y * Math.sin((d.x - 90) / 180 * Math.PI); };
      pathGenerator = function(d) {
        return "M" + lx(d.source) + "," + ly(d.source)
             + "L" + lx(d.target) + "," + ly(d.target);
      };
      nodeTransform = function(d) { return "rotate(" + (d.x - 90) + ")translate(" + (d.y * factor) + ")"; };
      styleNodeText = function(node) {
        function inner(d) { return d.children ? d.x <= 180 : d.x > 180; }
        return node
        .attr("dx", function(d) { return inner(d) ? -8 : 8; })
        .attr("dy", 3)
        .style("text-anchor", function(d) { return inner(d) ? "end" : "start"; })
        .attr("transform", function(d) { return d.x > 180 ? "rotate(180)" : null; });
      };
    } else {
      layoutOffset = [0, 0];
      pathGenerator = function elbow(d, i) {
          return "M" + d.source.y + "," + d.source.x
               + "V" + d.target.x + "H" + d.target.y;
      };
      nodeTransform = function(d) { return "translate(" + d.y + "," + d.x + ")"; };
      styleNodeText = function(node) {
        return node
        .attr("dx", function(d) { return d.children ? -8 : 8; })
        .attr("dy", 3)
        .style("text-anchor", function(d) { return d.children ? "end" : "start"; });
      };
    }

    // Create new SVG
    var zoomHandler = d3.behavior.zoom()
      .scaleExtent([0.1, 100])
      .on("zoom", zoom.bind(this));
    this.svg = d3.select("#dendrogram" + this.widgetID)
      .append("svg:svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .call(zoomHandler)
        .on("mousemove", mouseMove);
    // Add a background rectangle to get all mouse events for panning and zoom.
    // This is added before the group containing the dendrogram to give the graph
    // a chance to react to mouse events.
    var rect = this.svg.append("rect")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .style("fill", "none")
      .style("pointer-events", "all");
    // Add SVG groups that are used to draw the dendrogram
    var canvas = this.svg.append("svg:g")
        .attr("transform", "translate(" + layoutOffset[0] + "," +
          layoutOffset[1] + ")");
    var vis = canvas.append("svg:g")
        .attr("transform", "translate(" + this.translation[0] + "," +
            this.translation[1] + ")" + "scale(" + this.scale + ")");

    zoomHandler.scale(this.scale);

    var nodes = dendrogram.nodes(tree);
    var links = dendrogram.links(nodes);

    // Add all links
    var upLink = vis.selectAll(".link")
      .data(links)
      .enter().append("path")
      .attr("class", "link")
      .classed('tagged', function(d) { return d.source.belowTag; })
      .attr("d", pathGenerator);

    var lineWidth = this.lineWidthFactor;
    if (this.showStrahler) {
      upLink.style("stroke-width", function (d) { return lineWidth * d.target.strahler; });
    } else {
      upLink.style("stroke-width", function (d) { return lineWidth; });
    }

    /**
     * The node click handler is called if users double click on a node. It will
     * select the current node and highlight all downstream neurons in the
     * dendrogram. The highlighting is done as response to the active node change.
     */
    var nodeClickHandler = function(skid) {
      return function(n) {
        // Don't let the event bubble up
        d3.event.stopPropagation();

        // Select node in tracing layer
        SkeletonAnnotations.staticMoveTo(
                n.loc_z,
                n.loc_y,
                n.loc_x)
            .then(function () {
              return SkeletonAnnotations.staticSelectNode(n.id);
            })
            .catch(CATMAID.handleError);
        };
      }(this.currentSkeletonId);

    var nodeName = function(showTags, showIds, showStrahler) {
      function isTaggedWith(t) {
        /* jshint validthis: true */ // `this` is the node id set by filter()
        if (tags.hasOwnProperty(t)) {
          return -1 !== tags[t].indexOf(this);
        }
        return false;
      }
      function addTag(d, wrapped) {
        if (d.tagged) {
          var nodeTags = referenceTags.filter(isTaggedWith, d.id);
          return nodeTags.join(",") + (wrapped.length > 0 ? " (" + wrapped + ")" : "");
        } else {
          return wrapped;
        }
      }
      function addStrahler(d, wrapped) {
        return (wrapped.length > 0 ? wrapped + " *" : "*") + d.strahler;
      }

      return function(d) {
        var name = showIds? "" + d.id : "";
        if (showTags) {
          name = addTag(d, name);
        }
        if (showStrahler) {
          name = addStrahler(d, name);
        }
        return name;
      };
    }(this.showTags, this.showNodeIDs, this.showStrahler);

    // Add all nodes
    var node = vis.selectAll(".node")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .attr("id", function(d) { return "node" + d.id; })
      .attr("transform", nodeTransform)
      .classed('tagged', function(d) { return d.belowTag; })
      .on("dblclick", nodeClickHandler.bind(this));

    if (this.showConnectorPartners) {
      node = node
        .classed('connector-linked', function(d) { return d.connectorLinked !== undefined; })
        .classed('pre', function(d) { return d.connectorLinked === 0; })
        .classed('post', function(d) { return d.connectorLinked === 1; })
        .classed('gapjunction', function(d) { return d.connectorLinked === 2; });
    }

    node.append("circle")
      .attr("r", 4.5);
    styleNodeText(node.append("text")).text(nodeName);

    function zoom() {
      /* jshint validthis: true */ // `this` is bound to this NeuronDendrogram
      // Compensate for margin
      var tx = d3.event.translate[0] + margin.left,
          ty = d3.event.translate[1] + margin.top;
      // Store current translation and scale
      this.scale = d3.event.scale;
      this.translation[0] = tx;
      this.translation[1] = ty;
      // Translate and scale dendrogram
      vis.attr("transform", "translate(" + tx + "," + ty + ")scale(" + d3.event.scale + ")");
    }

    /**
     * Compensate for margin and layout offset.
     */
    function mouseMove() {
      /* jshint validthis: true */ // `this` is the D3 svg object
      var m = d3.mouse(this);
      zoomHandler.center([
          m[0] - layoutOffset[0] - margin.left,
          m[1] - layoutOffset[1] - margin.top]);
    }
  };

  /**
   * Exports the currently displayed dendrogram as SVG. This is done by converting
   * the existing SVG DOM element to XML and adding the needed style sheets as
   * CDATA into a style element.
   */
  NeuronDendrogram.prototype.exportSVG = function()
  {
    if (!this.svg) {
      return;
    }

    // Create XML representation of SVG
    var svg = this.svg[0][0];
    var xml = $.parseXML(new XMLSerializer().serializeToString(svg));

    // Find needed CSS rules, others are ignored
    var rules = ['.node', '.node.tagged', '.node circle', '.node.tagged circle',
        '.node.highlight circle', '.link', '.link.tagged'];

    var css = rules.reduce(function(o, r) {
      // Find element in SVG that matches the rule
      var elems = $(svg).find(r);
      // Ignore rules that we didn't find
      if (elems.length > 0) {
        // Get all computed CSS styles for it
        var cs = window.getComputedStyle(elems[0], null);
        var style = "";
        for (var i=0;i<cs.length; i++) {
          var s = cs[i];
          style = style + s + ": " + cs.getPropertyValue(s) + ";";
        }
        // Append it to the style sheet string
        o = o + r + " {" + style + "}";
      }
      return o;
    }, "");
    CATMAID.svgutil.addStyles(xml, css);

    // Serialize SVG including CSS and export it as blob
    var data = new XMLSerializer().serializeToString(xml);
    var blob = new Blob([data], {type: 'text/svg'});
    saveAs(blob, "dendrogram-" + this.skeletonID + "-" + this.widgetID + ".svg");
  };

  /**
   * Show a dialog with a checkbox for each tag that is used in the current
   * skeleton. A user can then select the tags that should be highlighted.
   */
  NeuronDendrogram.prototype.chooseHighlightTags = function()
  {
    if (!this.currentSkeletonId) {
      CATMAID.warn("No skeleton selected");
      return;
    }

    // Get all the tags for the current skeleton
    var dialog = new CATMAID.OptionsDialog("Select tags to highlight");
    dialog.appendMessage("The following tags are used in the selected " +
        "skeleton. Every node labeled with at least one of the selected tags, " +
        "will be highlighted and its sub-arbor will be highlighted as well.");

    // Map tags to checkboxes
    var checkboxes = {};
    for (var tag in this.currentSkeletonTags) {
      var checked = (-1 !== this.highlightTags.indexOf(tag));
      checkboxes[tag] = dialog.appendCheckbox(tag, undefined, checked);
    }

    dialog.onOK = (function() {
      this.highlightTags = Object.keys(checkboxes).filter(function(t) {
        return checkboxes[t].checked;
      });
      this.update();
    }).bind(this);

    dialog.show(400, 'auto', true);
  };

  NeuronDendrogram.prototype.setCollapsed = function(value)
  {
    this.collapsed = Boolean(value);
  };

  NeuronDendrogram.prototype.setShowNodeIds = function(value)
  {
    this.showNodeIDs = Boolean(value);
  };

  NeuronDendrogram.prototype.setShowTags = function(value)
  {
    this.showTags = Boolean(value);
  };

  NeuronDendrogram.prototype.setShowStrahler = function(value)
  {
    this.showStrahler = Boolean(value);
  };

  NeuronDendrogram.prototype.setRadialDisplay = function(value)
  {
    this.reset();
    this.radialDisplay = Boolean(value);
  };

  NeuronDendrogram.prototype.setMinStrahler = function(value)
  {
    this.minStrahler = value;
  };

  NeuronDendrogram.prototype.setCollapseNotABranch = function(value)
  {
    this.collapseNotABranch = Boolean(value);
  };

  NeuronDendrogram.prototype.setWarnCollapsed = function(value)
  {
    this.warnCollapsed = Boolean(value);
  };

  NeuronDendrogram.prototype.setHSpaceFactor = function(value)
  {
    this.hNodeSpaceFactor = value;
  };

  NeuronDendrogram.prototype.setVSpaceFactor = function(value)
  {
    this.vNodeSpaceFactor = value;
  };

  NeuronDendrogram.prototype.setShowConnectorPartners = function(value)
  {
    this.showConnectorPartners = !!value;
  };

  // Export widget
  CATMAID.NeuronDendrogram = NeuronDendrogram;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron Dendrogram",
    description: "Visualize the topology of a neuron",
    key: "neuron-dendrogram",
    creator: NeuronDendrogram
  });

})(CATMAID);
