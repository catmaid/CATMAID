/* global
  cytoscape3,
  InstanceRegistry,
  project,
*/

(function (CATMAID) {

  "use strict";

  /**
   * A graph widget that organizes connectivity around links of individual
   * treenodes. To save memory, only a reduced set of treenodes is kept per
   * skeleton: the root node and all nodes linked to a connector (and later
   * virtual split nodes). Graph nodes still represent whole skeletons for now,
   * edges are aggregated from the treenode level links.
   */
  let GraphWidget2 = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    // Skeleton ID vs reduced skeleton data: {model, rootId, nodes, links,
    // splitNodes}. The nodes field maps treenode IDs to {id, x, y, z}, links
    // is a list of [treenodeId, connectorId, relationName] entries.
    this.skeletons = new Map();

    // Link types to create edges for
    this.selectedLinkTypes = new Set(['synaptic-connector']);
    this.linkTypeColors = new Map([
      ['synaptic-connector', '#555'],
      ['default', '#ff9e25'],
    ]);

    this.edge_min_width = 0;
    this.layout_fit = true;

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

  GraphWidget2.prototype.updateNeuronNames = function() {
    if (!this.cy) return;
    let nns = CATMAID.NeuronNameService.getInstance();
    this.cy.batch(() => {
      this.cy.nodes().forEach(node => {
        node.data('label', nns.getName(node.data('skeleton_id')));
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
    let node = this.cy ? this.cy.getElementById(String(skeletonId)) : null;
    model.setVisible(!!(node && node.length > 0 && node.selected()));
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
      // Removing a node also removes its edges
      if (this.cy) this.cy.getElementById(String(skeletonId)).remove();
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
   * Reload all skeletons from the back-end.
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
   * the back-end. Returns a promise resolving into a Map of skeleton ID vs
   * reduced skeleton data.
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
          let [nodeRows, connectorRows] = result.skeletons[skeletonId];
          skeletons.set(Number(skeletonId),
              GraphWidget2.reduceSkeleton(nodeRows, connectorRows, relationNames));
        }
        return skeletons;
      });
  };

  /**
   * Create the reduced representation of a skeleton from compact-detail rows.
   * Only the root and treenodes linked to a connector are kept.
   */
  GraphWidget2.reduceSkeleton = function(nodeRows, connectorRows, relationNames) {
    let links = [];
    let linkedNodeIds = new Set();
    for (let row of connectorRows) {
      let relationName = relationNames.get(row[2]);
      if (!relationName) continue;
      links.push([row[0], row[1], relationName]);
      linkedNodeIds.add(row[0]);
    }

    let rootId = null;
    let nodes = new Map();
    for (let row of nodeRows) {
      let isRoot = row[1] === null;
      if (isRoot) rootId = row[0];
      if (isRoot || linkedNodeIds.has(row[0])) {
        nodes.set(row[0], {id: row[0], x: row[3], y: row[4], z: row[5]});
      }
    }

    return {
      rootId: rootId,
      nodes: nodes,
      links: links,
      splitNodes: new Set(),
    };
  };

  /**
   * Aggregate treenode level links between all loaded skeletons into edges
   * between skeletons, one edge per link type and skeleton pair. Returns a
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

        // Connector ID vs map of relation name vs list of [skeletonId, treenodeId]
        let connectors = new Map();
        for (let [skeletonId, skeleton] of this.skeletons) {
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
            relationPartners.push([skeletonId, treenodeId]);
          }
        }

        let edges = new Map();
        let addLink = (linkType, directed, source, target, connectorId) => {
          // Undirected edges are stored with ordered skeleton IDs
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
   * Rebuild all graph elements from the loaded skeletons. Positions and
   * selection state of existing nodes are kept, new nodes are laid out.
   */
  GraphWidget2.prototype.updateGraph = function() {
    return this.computeEdges()
      .then(edges => {
        let positions = {};
        let selected = new Set();
        this.cy.elements().forEach(element => {
          if (element.selected()) selected.add(element.id());
          // Copy, because the returned position object is updated in place
          if (element.isNode()) positions[element.id()] = Object.assign({}, element.position());
        });

        let nns = CATMAID.NeuronNameService.getInstance();
        let elements = {
          nodes: Array.from(this.skeletons.values(), skeleton => {
            let skeletonId = skeleton.model.id;
            return {
              data: {
                id: String(skeletonId),
                skeleton_id: skeletonId,
                label: nns.getName(skeletonId),
                color: '#' + skeleton.model.color.getHexString(),
                shape: 'ellipse',
              },
            };
          }),
          edges: edges.map(edge => {
            let weight = edge.links.length;
            return {
              data: {
                id: edge.id,
                source: String(edge.source),
                target: String(edge.target),
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
          }),
        };

        this.cy.elements().remove();
        this.cy.add(elements);

        let hasNewNodes = false;
        this.cy.batch(() => {
          this.cy.elements().forEach(element => {
            let id = element.id();
            if (selected.has(id)) element.select();
            if (element.isNode()) {
              if (id in positions) {
                element.position(positions[id]);
                element.lock();
              } else {
                hasNewNodes = true;
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
    let nns = CATMAID.NeuronNameService.getInstance();
    this.cy.batch(() => {
      for (let skeletonId in models) {
        let node = this.cy.getElementById(String(skeletonId));
        if (node.length === 0) continue;
        node.data('color', '#' + models[skeletonId].color.getHexString());
        node.data('label', nns.getName(skeletonId) || models[skeletonId].baseName);
      }
    });
  };

  GraphWidget2.prototype.appendAsGroup = function() {
  };

  GraphWidget2.prototype.appendGroup = function(models, position, color) {
  };

  GraphWidget2.prototype.updateFilter = function(models, skipUpdate) {
  };

  GraphWidget2.prototype.highlight = function(skeletonId) {
    if (!this.cy) return;
    let node = this.cy.getElementById(String(skeletonId));
    if (node.length === 0) return;
    node.animate({style: {width: 100, height: 100}}, {
      duration: 1000,
      // Fall back to the stylesheet size
      complete: () => node.removeStyle('width height'),
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
