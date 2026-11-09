/* global
  cytoscape3,
  InstanceRegistry,
  project,
  SkeletonAnnotations,
  SynapseClustering,
*/

(function (CATMAID) {

  "use strict";

  /**
   * A graph widget that organizes connectivity around links of individual
   * treenodes. To save memory, only a reduced set of treenodes is kept per
   * skeleton: the root node, all nodes linked to a connector and the split
   * nodes of virtual splits. Each split node is the root of a part of its
   * skeleton. Graph nodes represent skeletons or, if split, skeleton parts.
   * Edges are aggregated from the treenode level links.
   */
  let GraphWidget2 = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    // Skeleton ID vs reduced skeleton data: {model, rootId, nodes, links,
    // rootLabel, splitNodes, partLabels}. The nodes field maps treenode IDs to
    // {id, x, y, z, part}, links is a list of [treenodeId, connectorId,
    // relationName] entries. The splitNodes field maps treenode IDs to
    // {label, parentPart}, see GraphWidget2.assignParts().
    this.skeletons = new Map();

    // Link types to create edges for
    this.selectedLinkTypes = new Set(['synaptic-connector']);
    this.linkTypeColors = new Map([
      ['synaptic-connector', '#555'],
      ['default', '#ff9e25'],
    ]);

    this.edge_min_width = 0;
    this.layout_fit = true;

    // Remember split dialog choices
    this.splitOptions = {
      bandwidth: 5000,
      tag: '',
      tagRootLabel: 'proximal',
      tagOtherLabel: 'distal',
      proximalLabel: 'proximal',
      distalLabel: 'distal',
    };

    // A set of filter rules to apply to the handled skeletons
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
    // A set of connector nodes allowed by node filters
    this.allowedConnectorNodes = new Set();
  };

  GraphWidget2.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  GraphWidget2.prototype.constructor = GraphWidget2;

  $.extend(GraphWidget2.prototype, new InstanceRegistry());

  GraphWidget2.prototype.getName = function() {
    return "Graph Two " + this.widgetID;
  };

  GraphWidget2.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  GraphWidget2.prototype.getWidgetConfiguration = function() {
    return {
      subscriptionSource: [this],
      controlsID: `graph_widget_2_controls_${this.widgetID}`,
      createControls: function(controls) {
        let tabs = CATMAID.DOM.addTabGroup(controls, `graph_widget_2_${this.widgetID}`,
            ['Main', 'View', 'Grow', 'Nodes', 'Edges', 'Selection',
             'Selections', 'Subgraphs', 'Align', 'Export']);

        CATMAID.DOM.appendToTab(tabs['Main'], [
          [document.createTextNode('From')],
          [CATMAID.skeletonListSources.createSelect(this)],
          ['Append', () => this.loadSource()],
          ['Remove', () => this.removeSource()],
          ['Clear', () => this.clear()],
          ['Refresh', () => this.update()],
        ]);

        CATMAID.DOM.appendToTab(tabs['Subgraphs'], [
          [document.createTextNode('Select node(s) and split by: ')],
          ['Axon & dendrite', () => this.splitSelected(GraphWidget2.SPLIT_AXON_DENDRITE)],
          ['Axon, backbone dendrite & dendritic terminals',
              () => this.splitSelected(GraphWidget2.SPLIT_AXON_BACKBONE_TERMINALS)],
          ['Synapse clusters', () => this.splitBySynapseClustering()],
          ['Tag', () => this.splitByTag()],
          ['Reset', () => this.unsplitSelected()],
          [document.createTextNode(' - ')],
          ['Split at active node', () => this.splitAtActiveNode()],
        ]);

        $(controls).tabs();
      },
      contentID: `graph_widget_2_${this.widgetID}`,
      expandContent: true,
      createContent: function(content) {
        // Cytoscape.js can redraw with a delay. Without hidden overflow, a
        // canvas bigger than a shrunk container would add scrollbars, which
        // trigger another resize.
        content.style.overflow = 'hidden';

        let graph = document.createElement('div');
        graph.setAttribute("id", `graph_widget_2_cy_${this.widgetID}`);
        graph.style.width = "100%";
        graph.style.height = "100%";
        graph.style.backgroundColor = "white";
        content.appendChild(graph);
      },
      init: function() {
        this.init();
      },
      helpPath: 'graph-widget-2.html',
      filter: {
        rules: this.filterRules,
        update: this.updateFilter.bind(this),
      }
    };
  };

  GraphWidget2.prototype.init = function() {
    this.cy = cytoscape3({
      container: document.getElementById(`graph_widget_2_cy_${this.widgetID}`),
      style: [{
        selector: "node",
        style: {
          "label": "data(label)",
          "shape": "data(shape)",
          "border-width": 1,
          "background-color": "data(color)",
          "border-color": "#555",
          "text-valign": "top",
          "text-halign": "center",
          "width": 30,
          "height": 30,
        },
      }, {
        selector: "edge",
        style: {
          "label": "data(label)",
          "width": "data(width)",
          "target-arrow-shape": "data(arrow)",
          "target-arrow-color": "data(color)",
          "line-color": "data(color)",
          "opacity": 1.0,
          "text-outline-color": "#fff",
          "text-outline-width": 0.4,
          "color": "#555",
          "curve-style": "bezier",
        },
      }, {
        // Edges between parts of the same skeleton
        selector: "edge.part-edge",
        style: {
          "line-style": "dashed",
        },
      }, {
        selector: ":selected",
        style: {
          "background-color": "#b0ff72",
          "border-width": 3,
          "line-color": "#878787",
          "target-arrow-color": "#d6ffb5",
          "text-opacity": 1.0,
        },
      }, {
        selector: ".hidden",
        style: {
          "display": "none",
        },
      }],
      boxSelectionEnabled: true,
    });
  };

  GraphWidget2.prototype.resize = function() {
    if (this.cy) {
      // Delay the update until resizing is done
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => this.cy.resize(), 100);
    }
  };

  /**
   * Get the graph nodes of a skeleton, one per part if it is split.
   */
  GraphWidget2.prototype.getSkeletonNodes = function(skeletonId) {
    skeletonId = Number(skeletonId);
    return this.cy.nodes().filter(node => node.data('skeleton_id') === skeletonId);
  };

  /**
   * Get the graph node label for a skeleton or a part of it.
   */
  GraphWidget2.prototype.getNodeLabel = function(skeletonId, part) {
    let name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    return part === null ? name : `${name} [${part}]`;
  };

  GraphWidget2.prototype.updateNeuronNames = function() {
    if (!this.cy) return;
    this.cy.batch(() => {
      this.cy.nodes().forEach(node => {
        node.data('label', this.getNodeLabel(node.data('skeleton_id'), node.data('part')));
      });
    });
  };

  GraphWidget2.prototype.hasSkeleton = function(skeletonId) {
    return this.skeletons.has(Number(skeletonId));
  };

  GraphWidget2.prototype.getSkeletonModel = function(skeletonId) {
    let skeleton = this.skeletons.get(Number(skeletonId));
    if (!skeleton) return null;
    let model = skeleton.model.clone();
    // A skeleton is selected if any of its parts is selected
    let selected = !!this.cy && this.getSkeletonNodes(skeletonId).some(node => node.selected());
    model.setVisible(selected);
    return model;
  };

  GraphWidget2.prototype.getSkeletonModels = function() {
    let models = {};
    for (let skeletonId of this.skeletons.keys()) {
      models[skeletonId] = this.getSkeletonModel(skeletonId);
    }
    return models;
  };

  GraphWidget2.prototype.getSelectedSkeletonModels = function() {
    let models = {};
    if (!this.cy) return models;
    this.cy.nodes().forEach(node => {
      if (node.selected() && node.visible()) {
        let skeletonId = node.data('skeleton_id');
        models[skeletonId] = this.getSkeletonModel(skeletonId);
      }
    });
    return models;
  };

  GraphWidget2.prototype.updateModels = function(models) {
    this.append(models);
  };

  GraphWidget2.prototype.clear = function() {
    let removedModels = this.getSkeletonModels();
    this.skeletons.clear();
    if (this.cy) this.cy.elements().remove();
    CATMAID.NeuronNameService.getInstance().unregister(this, null);
    if (!CATMAID.tools.isEmpty(removedModels)) {
      this.triggerRemove(removedModels);
    }
  };

  GraphWidget2.prototype.removeSource = function() {
    let models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    if (CATMAID.tools.isEmpty(models)) {
      CATMAID.info('Selected source is empty.');
      return;
    }
    this.removeSkeletons(Object.keys(models));
  };

  GraphWidget2.prototype.removeSkeletons = function(skeletonIds) {
    let removedModels = {};
    for (let skeletonId of skeletonIds) {
      skeletonId = Number(skeletonId);
      if (!this.skeletons.has(skeletonId)) continue;
      removedModels[skeletonId] = this.getSkeletonModel(skeletonId);
      this.skeletons.delete(skeletonId);
      // Removing nodes also removes their edges
      if (this.cy) this.getSkeletonNodes(skeletonId).remove();
    }
    let removedIds = Object.keys(removedModels);
    if (removedIds.length > 0) {
      CATMAID.NeuronNameService.getInstance().unregister(this, removedIds);
      this.triggerRemove(removedModels);
    }
  };

  GraphWidget2.prototype.append = function(models) {
    let newModels = {};
    let changedModels = {};
    for (let skeletonId in models) {
      let model = models[skeletonId];
      let skeleton = this.skeletons.get(Number(skeletonId));
      if (skeleton) {
        // Update existing skeletons in place
        skeleton.model = model.clone();
        changedModels[skeletonId] = model;
      } else if (model.selected) {
        newModels[skeletonId] = model;
      }
    }

    if (!CATMAID.tools.isEmpty(changedModels)) {
      this.updateNodeProperties(changedModels);
      this.triggerChange(changedModels);
    }

    if (!CATMAID.tools.isEmpty(newModels)) {
      return this.load(newModels);
    }
    return Promise.resolve();
  };

  /**
   * Reload all skeletons from the back-end. Splits are kept.
   */
  GraphWidget2.prototype.update = function() {
    let models = {};
    for (let [skeletonId, skeleton] of this.skeletons) {
      models[skeletonId] = skeleton.model;
    }
    if (CATMAID.tools.isEmpty(models)) {
      CATMAID.info("Nothing to refresh");
      return Promise.resolve();
    }
    return this.load(models, true);
  };

  /**
   * Fetch the reduced treenode data for the passed in models and rebuild the
   * graph. New skeletons trigger an add event.
   */
  GraphWidget2.prototype.load = function(models, isReload = false) {
    let skeletonIds = Object.keys(models).map(Number);
    let nns = CATMAID.NeuronNameService.getInstance();
    return new Promise(resolve => nns.registerAll(this, models, resolve))
      .then(() => this.fetchSkeletons(skeletonIds))
      .then(skeletons => {
        let addedModels = {};
        for (let [skeletonId, skeleton] of skeletons) {
          // Ignore skeletons removed while loading
          let model = models[skeletonId];
          if (isReload && !this.skeletons.has(skeletonId)) continue;
          if (!isReload && !this.skeletons.has(skeletonId)) {
            addedModels[skeletonId] = model;
          }
          skeleton.model = model.clone();
          this.skeletons.set(skeletonId, skeleton);
        }
        this.updateGraph();
        if (!CATMAID.tools.isEmpty(addedModels)) {
          this.triggerAdd(addedModels);
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Get the reduced treenode representation of the passed in skeletons from
   * the back-end. Splits of already loaded skeletons are kept. Returns a
   * promise resolving into a Map of skeleton ID vs reduced skeleton data.
   */
  GraphWidget2.prototype.fetchSkeletons = function(skeletonIds) {
    let binary = !!CATMAID.Client.Settings.session.binary_data_transfer;
    return Promise.all([
        CATMAID.Connectors.linkTypes(project.id),
        CATMAID.fetch({
          url: `${project.id}/skeletons/compact-detail`,
          method: 'POST',
          data: {
            skeleton_ids: skeletonIds,
            with_connectors: true,
            with_relation_ids: true,
            format: binary ? 'msgpack' : 'json',
          },
          responseType: binary ? 'arraybuffer' : undefined,
          decoder: binary ? 'msgpack' : 'json',
        }),
      ])
      .then(([linkTypes, result]) => {
        let relationNames = new Map(linkTypes.map(lt => [lt.relation_id, lt.relation]));
        let skeletons = new Map();
        for (let skeletonId in result.skeletons) {
          skeletonId = Number(skeletonId);
          let [nodeRows, connectorRows] = result.skeletons[skeletonId];
          let skeleton = GraphWidget2.reduceSkeleton(nodeRows, connectorRows,
              relationNames, this.skeletons.get(skeletonId));
          if (skeleton.droppedSplitNodes.length > 0) {
            CATMAID.warn(`Removed ${skeleton.droppedSplitNodes.length} split ` +
                `node(s) that don't exist anymore from skeleton ${skeletonId}`);
          }
          delete skeleton.droppedSplitNodes;
          skeletons.set(skeletonId, skeleton);
        }
        return skeletons;
      });
  };

  /**
   * Create the reduced representation of a skeleton from compact-detail rows.
   * Only the root, treenodes linked to a connector and split nodes are kept.
   * Split nodes are taken from the optional previous representation, if they
   * still exist. Their IDs are returned as droppedSplitNodes otherwise.
   */
  GraphWidget2.reduceSkeleton = function(nodeRows, connectorRows, relationNames, previous) {
    let links = [];
    let linkedNodeIds = new Set();
    for (let row of connectorRows) {
      let relationName = relationNames.get(row[2]);
      if (!relationName) continue;
      links.push([row[0], row[1], relationName]);
      linkedNodeIds.add(row[0]);
    }

    let parents = new Map(nodeRows.map(row => [row[0], row[1]]));
    let splitNodes = new Map();
    let droppedSplitNodes = [];
    if (previous) {
      for (let [splitNodeId, split] of previous.splitNodes) {
        if (parents.has(splitNodeId)) {
          splitNodes.set(splitNodeId, split);
        } else {
          droppedSplitNodes.push(splitNodeId);
        }
      }
    }

    let rootId = null;
    let nodes = new Map();
    for (let row of nodeRows) {
      let isRoot = row[1] === null;
      if (isRoot) rootId = row[0];
      if (isRoot || linkedNodeIds.has(row[0]) || splitNodes.has(row[0])) {
        nodes.set(row[0], {id: row[0], x: row[3], y: row[4], z: row[5]});
      }
    }

    let skeleton = {
      rootId: rootId,
      nodes: nodes,
      links: links,
      rootLabel: splitNodes.size > 0 ? previous.rootLabel : null,
      splitNodes: splitNodes,
      droppedSplitNodes: droppedSplitNodes,
    };
    GraphWidget2.assignParts(skeleton, nodeId => parents.get(nodeId));
    return skeleton;
  };

  /**
   * Assign each stored node of a skeleton to a part: the part of its nearest
   * ancestor (including itself) that is a split node, or the root part if
   * there is none. This needs the parent of every node of the skeleton,
   * provided through the getParent function. For each split node, the part
   * of its parent node is stored as parentPart. The ordered list of part
   * labels is stored as partLabels. Without split nodes, the part is null.
   */
  GraphWidget2.assignParts = function(skeleton, getParent) {
    let splitNodes = skeleton.splitNodes;
    if (splitNodes.size === 0) {
      skeleton.rootLabel = null;
      skeleton.partLabels = [null];
      for (let node of skeleton.nodes.values()) node.part = null;
      return;
    }

    // Part labels of already visited nodes, to walk each path only once
    let visited = new Map();
    let getPart = nodeId => {
      let path = [];
      let part = skeleton.rootLabel;
      let current = nodeId;
      while (current !== null && current !== undefined) {
        if (visited.has(current)) {
          part = visited.get(current);
          break;
        }
        path.push(current);
        let split = splitNodes.get(current);
        if (split) {
          part = split.label;
          break;
        }
        current = getParent(current);
      }
      for (let pathNodeId of path) visited.set(pathNodeId, part);
      return part;
    };

    for (let node of skeleton.nodes.values()) {
      node.part = getPart(node.id);
    }
    for (let [splitNodeId, split] of splitNodes) {
      let parentId = getParent(splitNodeId);
      split.parentPart = (parentId === null || parentId === undefined) ?
          null : getPart(parentId);
    }

    skeleton.partLabels = Array.from(new Set([skeleton.rootLabel,
        ...Array.from(splitNodes.values(), split => split.label)]));
  };

  /**
   * Get the graph node ID of a skeleton part. Unsplit skeletons have a single
   * graph node with the skeleton ID as ID.
   */
  GraphWidget2.getPartNodeId = function(skeleton, part) {
    if (skeleton.splitNodes.size === 0) {
      return String(skeleton.model.id);
    }
    return `${skeleton.model.id}_${skeleton.partLabels.indexOf(part)}`;
  };

  /**
   * Aggregate treenode level links between all loaded skeletons into edges
   * between skeleton parts, one edge per link type and part pair. Returns a
   * promise resolving into a list of edge definitions.
   */
  GraphWidget2.prototype.computeEdges = function() {
    // Link pairs aren't cached by CATMAID.Connectors and don't change
    if (!this.linkPairs) {
      this.linkPairs = CATMAID.Connectors.linkPairs(project.id)
        .catch(error => {
          delete this.linkPairs;
          throw error;
        });
    }
    return Promise.all([
        CATMAID.Connectors.linkTypes(project.id),
        this.linkPairs,
      ])
      .then(([linkTypes, linkPairs]) => {
        let reciprocal = new Map(linkTypes.map(lt => [lt.relation, lt.isreciprocal]));

        // Connector ID vs map of relation name vs list of [graph node ID,
        // treenode ID]
        let connectors = new Map();
        for (let skeleton of this.skeletons.values()) {
          for (let [treenodeId, connectorId, relationName] of skeleton.links) {
            let partners = connectors.get(connectorId);
            if (!partners) {
              partners = new Map();
              connectors.set(connectorId, partners);
            }
            let relationPartners = partners.get(relationName);
            if (!relationPartners) {
              relationPartners = [];
              partners.set(relationName, relationPartners);
            }
            let part = skeleton.nodes.get(treenodeId).part;
            relationPartners.push([GraphWidget2.getPartNodeId(skeleton, part), treenodeId]);
          }
        }

        let edges = new Map();
        let addLink = (linkType, directed, source, target, connectorId) => {
          // Undirected edges are stored with ordered graph node IDs
          if (!directed && source[0] > target[0]) {
            [source, target] = [target, source];
          }
          let id = `${linkType}_${source[0]}_${target[0]}`;
          let edge = edges.get(id);
          if (!edge) {
            edge = {
              id: id,
              linkType: linkType,
              directed: directed,
              source: source[0],
              target: target[0],
              links: [],
            };
            edges.set(id, edge);
          }
          edge.links.push([source[1], connectorId, target[1]]);
        };

        for (let linkType of this.selectedLinkTypes) {
          let pair = linkPairs[linkType];
          if (!pair) continue;
          let directed = !reciprocal.get(pair.source);
          for (let [connectorId, partners] of connectors) {
            let sources = partners.get(pair.source);
            let targets = partners.get(pair.target);
            if (!sources || !targets) continue;
            if (pair.source === pair.target) {
              // Each unordered partner pair is linked once
              for (let i=0; i<sources.length; ++i) {
                for (let j=i+1; j<sources.length; ++j) {
                  addLink(linkType, directed, sources[i], sources[j], connectorId);
                }
              }
            } else {
              for (let source of sources) {
                for (let target of targets) {
                  addLink(linkType, directed, source, target, connectorId);
                }
              }
            }
          }
        }

        return Array.from(edges.values());
      });
  };

  /**
   * Get undirected edges that connect the parts of split skeletons along
   * their arbor: each split node's part with the part of its parent node.
   */
  GraphWidget2.prototype.computePartEdges = function() {
    let edges = new Map();
    for (let skeleton of this.skeletons.values()) {
      for (let split of skeleton.splitNodes.values()) {
        if (split.parentPart === null || split.parentPart === split.label) continue;
        let source = GraphWidget2.getPartNodeId(skeleton, split.parentPart);
        let target = GraphWidget2.getPartNodeId(skeleton, split.label);
        if (source > target) [source, target] = [target, source];
        let id = `part_${source}_${target}`;
        edges.set(id, {
          id: id,
          source: source,
          target: target,
          color: '#' + skeleton.model.color.getHexString(),
        });
      }
    }
    return Array.from(edges.values());
  };

  /**
   * Rebuild all graph elements from the loaded skeletons. Positions and
   * selection state of existing nodes are kept, new nodes are laid out. New
   * parts of a skeleton start at the position of its former graph node.
   */
  GraphWidget2.prototype.updateGraph = function() {
    return this.computeEdges()
      .then(edges => {
        let positions = {};
        let skeletonPositions = {};
        let selected = new Set();
        this.cy.elements().forEach(element => {
          if (element.selected()) selected.add(element.id());
          if (element.isNode()) {
            // Copy, because the returned position object is updated in place
            let position = Object.assign({}, element.position());
            positions[element.id()] = position;
            skeletonPositions[element.data('skeleton_id')] = position;
          }
        });

        let nodes = [];
        for (let skeleton of this.skeletons.values()) {
          let skeletonId = skeleton.model.id;
          let color = '#' + skeleton.model.color.getHexString();
          for (let part of skeleton.partLabels) {
            nodes.push({
              data: {
                id: GraphWidget2.getPartNodeId(skeleton, part),
                skeleton_id: skeletonId,
                part: part,
                label: this.getNodeLabel(skeletonId, part),
                color: color,
                shape: 'ellipse',
              },
            });
          }
        }

        let elements = {
          nodes: nodes,
          edges: edges.map(edge => {
            let weight = edge.links.length;
            return {
              data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                link_type: edge.linkType,
                directed: edge.directed,
                links: edge.links,
                weight: weight,
                label: weight,
                width: this.edge_min_width + Math.sqrt(weight),
                color: this.linkTypeColors.get(edge.linkType) ||
                    this.linkTypeColors.get('default'),
                arrow: edge.directed ? 'triangle' : 'none',
              },
            };
          }).concat(this.computePartEdges().map(edge => {
            return {
              data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                directed: false,
                label: '',
                width: 2,
                color: edge.color,
                arrow: 'none',
              },
              classes: 'part-edge',
            };
          })),
        };

        this.cy.elements().remove();
        this.cy.add(elements);

        let hasNewNodes = false;
        this.cy.batch(() => {
          let offset = 0;
          this.cy.elements().forEach(element => {
            let id = element.id();
            if (selected.has(id)) element.select();
            if (element.isNode()) {
              if (id in positions) {
                element.position(positions[id]);
                element.lock();
              } else {
                hasNewNodes = true;
                let skeletonPosition = skeletonPositions[element.data('skeleton_id')];
                if (skeletonPosition) {
                  offset += 40;
                  element.position({
                    x: skeletonPosition.x + offset,
                    y: skeletonPosition.y + offset,
                  });
                }
              }
            }
          });
        });

        if (hasNewNodes) {
          this.cy.layout({
            name: 'spread',
            fit: this.layout_fit,
            stop: () => this.cy.nodes().unlock(),
          }).run();
        } else {
          this.cy.nodes().unlock();
        }
      });
  };

  /**
   * Update label and color of graph nodes for the passed in models.
   */
  GraphWidget2.prototype.updateNodeProperties = function(models) {
    if (!this.cy) return;
    this.cy.batch(() => {
      for (let skeletonId in models) {
        let color = '#' + models[skeletonId].color.getHexString();
        this.getSkeletonNodes(skeletonId).forEach(node => {
          node.data('color', color);
          node.data('label', this.getNodeLabel(skeletonId, node.data('part')));
        });
        this.cy.edges('.part-edge').forEach(edge => {
          if (edge.source().data('skeleton_id') === Number(skeletonId)) {
            edge.data('color', color);
          }
        });
      }
    });
  };

  GraphWidget2.SPLIT_AXON_DENDRITE = 'axon-dendrite';
  GraphWidget2.SPLIT_AXON_BACKBONE_TERMINALS = 'axon-backbone-terminals';
  GraphWidget2.SPLIT_SYNAPSE_CLUSTERS = 'synapse-clusters';
  GraphWidget2.SPLIT_TAG = 'tag';

  /**
   * Get the IDs of all skeletons with at least one selected graph node.
   */
  GraphWidget2.prototype.getSelectedSkeletonIds = function() {
    return Object.keys(this.getSelectedSkeletonModels()).map(Number);
  };

  /**
   * Split the skeletons of all selected graph nodes with the passed in split
   * mode. Existing splits of these skeletons are replaced.
   */
  GraphWidget2.prototype.splitSelected = function(mode, options = {}) {
    let skeletonIds = this.getSelectedSkeletonIds();
    if (skeletonIds.length === 0) {
      CATMAID.info("Select one or more nodes first!");
      return Promise.resolve();
    }
    let withTags = mode === GraphWidget2.SPLIT_AXON_BACKBONE_TERMINALS ||
        mode === GraphWidget2.SPLIT_TAG;
    return Promise.all(skeletonIds.map(skeletonId => {
        return CATMAID.fetch(`${project.id}/${skeletonId}/1/1/${withTags ? 1 : 0}/compact-arbor`)
          .then(json => {
            let skeleton = this.skeletons.get(skeletonId);
            // Ignore skeletons removed while loading
            if (!skeleton) return;
            let ap = new CATMAID.ArborParser().init('compact-arbor', json);
            let split = GraphWidget2.computeSplit(mode, ap, json[2], options);
            if (!split) {
              CATMAID.info(`Couldn't split ${this.getNodeLabel(skeletonId, null)}`);
              return;
            }
            this.setSplit(skeleton, split.rootLabel, split.splitNodes, ap);
          });
      }))
      .then(() => this.updateGraph())
      .catch(CATMAID.handleError);
  };

  /**
   * Compute split nodes for a skeleton using one of the split modes. Returns
   * {rootLabel, splitNodes} with splitNodes mapping split node IDs to part
   * labels, or null if the skeleton can't be split this way.
   */
  GraphWidget2.computeSplit = function(mode, ap, tags, options) {
    let edges = ap.arbor.edges;
    if (mode === GraphWidget2.SPLIT_AXON_DENDRITE ||
        mode === GraphWidget2.SPLIT_AXON_BACKBONE_TERMINALS) {
      let axon = null;
      if (ap.n_inputs > 0 && ap.n_outputs > 0) {
        axon = SynapseClustering.prototype.findAxon(ap, 0.9, ap.positions);
      }
      let splitNodes = new Map();
      if (axon) {
        splitNodes.set(axon.root, 'axon');
      }

      let microtubulesEnd = tags['microtubules end'];
      if (mode === GraphWidget2.SPLIT_AXON_BACKBONE_TERMINALS && microtubulesEnd) {
        // Each subarbor attached to the backbone dendrite, outside of the axon,
        // is a dendritic terminal.
        let backbone = ap.arbor.upstreamArbor(microtubulesEnd.reduce((o, nodeId) => {
          o[nodeId] = true;
          return o;
        }, {}));
        for (let nodeId in edges) {
          nodeId = Number(nodeId);
          if (!backbone.contains(nodeId) && backbone.contains(edges[nodeId]) &&
              !(axon && axon.contains(nodeId))) {
            splitNodes.set(nodeId, 'dendritic terminals');
          }
        }
        return {rootLabel: 'backbone dendrite', splitNodes: splitNodes};
      }
      // Without a microtubules end tag, fall back to axon and dendrite
      return axon ? {rootLabel: 'dendrite', splitNodes: splitNodes} : null;
    } else if (mode === GraphWidget2.SPLIT_TAG) {
      let cuts = (tags[options.tag] || []).filter(nodeId => nodeId !== ap.arbor.root);
      if (cuts.length === 0) return null;
      let splitNodes = new Map(cuts.map((nodeId, i) => [nodeId,
          cuts.length === 1 ? options.otherLabel : `${options.otherLabel} ${i + 1}`]));
      return {rootLabel: options.rootLabel, splitNodes: splitNodes};
    } else if (mode === GraphWidget2.SPLIT_SYNAPSE_CLUSTERS) {
      let synapseMap = ap.createSynapseMap();
      let sc = new SynapseClustering(ap.arbor, ap.positions, synapseMap, options.bandwidth);
      let clusters = sc.clusterMaps(sc.densityHillMap());
      // Only clusters with synapses become parts, the others are added to
      // their parent part.
      let clusterIds = Object.keys(clusters).filter(clusterId =>
          Object.keys(clusters[clusterId]).some(nodeId => synapseMap[nodeId]));
      if (clusterIds.length < 2) return null;
      let rootLabel = 'root';
      let splitNodes = new Map();
      clusterIds.forEach((clusterId, i) => {
        let cluster = clusters[clusterId];
        // The cluster's top node is the only one whose parent is outside of it
        for (let nodeId in cluster) {
          let parentId = edges[nodeId];
          if (parentId === undefined) {
            rootLabel = String(i + 1);
          } else if (!cluster[parentId]) {
            splitNodes.set(Number(nodeId), String(i + 1));
          }
        }
      });
      return {rootLabel: rootLabel, splitNodes: splitNodes};
    }
    throw new CATMAID.ValueError(`Unknown split mode: ${mode}`);
  };

  /**
   * Set the split nodes of a skeleton and assign its stored nodes to parts,
   * using the full arbor in the passed in ArborParser.
   */
  GraphWidget2.prototype.setSplit = function(skeleton, rootLabel, splitNodes, ap) {
    let linkedNodeIds = new Set(skeleton.links.map(link => link[0]));
    // Remove nodes that were only kept as split nodes
    for (let splitNodeId of skeleton.splitNodes.keys()) {
      if (splitNodeId !== skeleton.rootId && !linkedNodeIds.has(splitNodeId)) {
        skeleton.nodes.delete(splitNodeId);
      }
    }
    skeleton.rootLabel = splitNodes.size > 0 ? rootLabel : null;
    skeleton.splitNodes = new Map();
    for (let [splitNodeId, label] of splitNodes) {
      // Arbor node IDs can be strings, because they are used as object keys
      splitNodeId = Number(splitNodeId);
      skeleton.splitNodes.set(splitNodeId, {label: label});
      if (!skeleton.nodes.has(splitNodeId)) {
        let position = ap.positions[splitNodeId];
        skeleton.nodes.set(splitNodeId, {id: splitNodeId,
            x: position.x, y: position.y, z: position.z});
      }
    }
    GraphWidget2.assignParts(skeleton, nodeId => {
      let parentId = ap.arbor.edges[nodeId];
      return parentId === undefined ? null : parentId;
    });
  };

  GraphWidget2.prototype.splitBySynapseClustering = function() {
    if (this.getSelectedSkeletonIds().length === 0) {
      CATMAID.info("Select one or more nodes first!");
      return;
    }
    let dialog = new CATMAID.OptionsDialog("Split by synapse clusters");
    let bandwidth = dialog.appendNumericField("Bandwidth (nm): ", `graph_widget_2_bandwidth_${this.widgetID}`,
        this.splitOptions.bandwidth, 1, undefined, undefined, true);
    dialog.onOK = () => {
      let value = Number(bandwidth.value);
      if (Number.isNaN(value) || value <= 0) {
        CATMAID.warn(`Invalid bandwidth: ${bandwidth.value}`);
        return;
      }
      this.splitOptions.bandwidth = value;
      this.splitSelected(GraphWidget2.SPLIT_SYNAPSE_CLUSTERS, {bandwidth: value});
    };
    dialog.show(300, 'auto', true);
  };

  GraphWidget2.prototype.splitByTag = function() {
    if (this.getSelectedSkeletonIds().length === 0) {
      CATMAID.info("Select one or more nodes first!");
      return;
    }
    let dialog = new CATMAID.OptionsDialog("Split at tag");
    let tag = dialog.appendField("Tag (exact match): ", `graph_widget_2_tag_${this.widgetID}`,
        this.splitOptions.tag);
    let rootLabel = dialog.appendField("Part with root node: ", `graph_widget_2_tag_root_label_${this.widgetID}`,
        this.splitOptions.tagRootLabel);
    let otherLabel = dialog.appendField("Other part(s): ", `graph_widget_2_tag_other_label_${this.widgetID}`,
        this.splitOptions.tagOtherLabel);
    dialog.onOK = () => {
      this.splitOptions.tag = tag.value;
      this.splitOptions.tagRootLabel = rootLabel.value;
      this.splitOptions.tagOtherLabel = otherLabel.value;
      this.splitSelected(GraphWidget2.SPLIT_TAG, {
        tag: tag.value,
        rootLabel: rootLabel.value,
        otherLabel: otherLabel.value,
      });
    };
    dialog.show(350, 'auto', true);
  };

  /**
   * Split the active skeleton at the active node, in addition to existing
   * splits of this skeleton.
   */
  GraphWidget2.prototype.splitAtActiveNode = function() {
    let nodeId = SkeletonAnnotations.getActiveNodeId();
    let skeletonId = SkeletonAnnotations.getActiveSkeletonId();
    if (!nodeId || SkeletonAnnotations.getActiveNodeType() !== SkeletonAnnotations.TYPE_NODE ||
        !SkeletonAnnotations.isRealNode(nodeId)) {
      CATMAID.warn("Please select a treenode first");
      return;
    }
    nodeId = Number(nodeId);
    let skeleton = this.skeletons.get(Number(skeletonId));
    if (!skeleton) {
      CATMAID.warn("The active skeleton isn't part of this graph");
      return;
    }
    if (nodeId === skeleton.rootId) {
      CATMAID.warn("Can't split at the root node");
      return;
    }
    if (skeleton.splitNodes.has(nodeId)) {
      CATMAID.info("The skeleton is already split at this node");
      return;
    }

    let isSplit = skeleton.splitNodes.size > 0;
    let dialog = new CATMAID.OptionsDialog("Split at active node");
    let proximalLabel = isSplit ? null : dialog.appendField("Part with root node: ",
        `graph_widget_2_proximal_label_${this.widgetID}`, this.splitOptions.proximalLabel);
    let distalLabel = dialog.appendField(isSplit ? "New part: " : "Other part: ",
        `graph_widget_2_distal_label_${this.widgetID}`, this.splitOptions.distalLabel);
    dialog.onOK = () => {
      if (proximalLabel) this.splitOptions.proximalLabel = proximalLabel.value;
      this.splitOptions.distalLabel = distalLabel.value;
      CATMAID.fetch(`${project.id}/${skeletonId}/1/0/0/compact-arbor`)
        .then(json => {
          // Ignore skeletons removed while loading
          if (this.skeletons.get(Number(skeletonId)) !== skeleton) return;
          let ap = new CATMAID.ArborParser().init('compact-arbor', json);
          if (!ap.arbor.contains(nodeId)) {
            throw new CATMAID.Warning("The active node isn't part of the active skeleton anymore");
          }
          let splitNodes = new Map(Array.from(skeleton.splitNodes,
              ([splitNodeId, split]) => [splitNodeId, split.label]));
          splitNodes.set(nodeId, distalLabel.value);
          this.setSplit(skeleton, isSplit ? skeleton.rootLabel : proximalLabel.value,
              splitNodes, ap);
          return this.updateGraph();
        })
        .catch(CATMAID.handleError);
    };
    dialog.show(350, 'auto', true);
  };

  /**
   * Remove the splits of the skeletons of all selected graph nodes.
   */
  GraphWidget2.prototype.unsplitSelected = function() {
    let skeletonIds = this.getSelectedSkeletonIds();
    if (skeletonIds.length === 0) {
      CATMAID.info("Select one or more nodes first!");
      return Promise.resolve();
    }
    for (let skeletonId of skeletonIds) {
      let skeleton = this.skeletons.get(skeletonId);
      // No parent information is needed without split nodes
      this.setSplit(skeleton, null, new Map(), null);
    }
    return this.updateGraph();
  };

  GraphWidget2.prototype.appendAsGroup = function() {
  };

  GraphWidget2.prototype.appendGroup = function(models, position, color) {
  };

  GraphWidget2.prototype.updateFilter = function(models, skipUpdate) {
  };

  GraphWidget2.prototype.highlight = function(skeletonId) {
    if (!this.cy) return;
    this.getSkeletonNodes(skeletonId).forEach(node => {
      node.animate({style: {width: 100, height: 100}}, {
        duration: 1000,
        // Fall back to the stylesheet size
        complete: () => node.removeStyle('width height'),
      });
    });
  };

  GraphWidget2.prototype.getState = function() {
    return this.state ? this.state : {};
  };

  GraphWidget2.prototype.setState = function(key, value) {
    if (!this.state) this.state = {};
    this.state[key] = value;
  };

  GraphWidget2.prototype.removeState = function(key) {
    if (this.state) delete this.state[key];
  };

  GraphWidget2.prototype.resetState = function() {
    delete this.state;
  };

  GraphWidget2.prototype.cloneWidget = function() {
  };

  // Register widget
  CATMAID.registerWidget({
    name: "Graph Widget 2",
    description: "Display and analyze neurons and parts of them as nodes in a directed graph",
    key: "graph-widget-2",
    creator: GraphWidget2,
    state: {
      // The Graph Widget can store UI state: node location, groups, view, etc.
      uiState: true,
      getState: function(widget, withInteractionState=false) {
        let state = {
        };

        if (withInteractionState) {
        }

        return state;
      },
      setState: function(widget, state) {
      },
      setPostLoadState: function(widget, state) {
      },
    },
  });

  CATMAID.GraphWidget2 = GraphWidget2;

})(CATMAID);
