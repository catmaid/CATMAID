/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A simple graph visualization of CATMAID's instanciated ontology space
   * (class instances).
   */
  var SkeletonHistoryGraph = function() {
    InstanceRegistry.call(this);

    this.widgetID = this.registerInstance();
    this.layout = 'cose';
    this.showName = true;
    this.initialUser = null;
    // Minimum and maximum nodes in a single annotation graph (connected
    // component).
    this.changesAfter = null;
    this.changesBefore = null;
    this.skeletonIds = null;

    // Register a skeletonSource
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });
  };

  SkeletonHistoryGraph.prototype = Object.create(InstanceRegistry.prototype);
  SkeletonHistoryGraph.prototype.constructor = SkeletonHistoryGraph;

  SkeletonHistoryGraph.prototype.getName = function() {
    return "Skeleton change history" + this.widgetID;
  };

  SkeletonHistoryGraph.prototype.destroy = function() {
    this.unregisterInstance();
    this.skeletonSource.destroy();
  };

  SkeletonHistoryGraph.prototype.getWidgetConfiguration = function() {
    var self = this;

    return {
      class: "skeleton-history-graph",
      createControls: function(buttons) {
        CATMAID.DOM.appendButton(buttons, 'Refresh',
            'Reload skeleton history data and redraw graph', () => self.updateGraph());
        CATMAID.DOM.appendSelect(buttons, undefined, "Layout", this.layoutOptions,
            "Select layout for skeleton history graph", this.layout, function() {
              self.layout = this.value;
              self.cy.layout(self.layouts[this.value]);
            });
        CATMAID.DOM.appendElement(buttons, {
          type: 'select',
          label: 'Initial user',
          entries: [

          ],
          title: 'The user who changed skeletons in the selected time window.',
          value: self.initialUser,
          onclick: function() {
            self.initialUser = this.value;
          }
        });
        CATMAID.DOM.appendTextField(buttons, undefined, "(Past) Skeleton IDs",
            "Skeleton IDs, optionally past ones, can be provided as a list using commas.", this.skeletonIds || '',
            undefined, function() {
              self.skeletonIds = this.value.length > 0 ? this.value : null;
              self.updateGraph();
            }, 15, '(all)');
        CATMAID.DOM.appendTextField(buttons, undefined, "Skeleton change after",
            "Display only skeleton ID changes after this date.", this.changesAfter || '',
            undefined, function() {
              self.changesAfter = this.value;
              self.updateGraph();
            }, 5, '(all)');
        CATMAID.DOM.appendTextField(buttons, undefined, "Skeleton change before",
            "Display only skeleton ID changes before this date.", this.changesBefore || '',
            undefined, function() {
              self.changesBefore = this.value ? this.value : null;
              self.updateGraph();
            }, 5, '(all)');
      },
      createContent: function(content) {
        var self = this;

        this.container = content;
        this.cy = cytoscape({
          container: content,
          style: [
            {
              selector: 'node',
              style: {
                "shape": "data(shape)",
                "border-width": 1,
                "background-color": "data(color)",
                'label': 'data(name)'
              }
            },
            {
              selector: 'node:selected',
              style: {
                "shape": "data(shape)",
                'background-color': 'green',
                'label': 'data(name)'
              }
            },
            {
              selector: 'edge',
              selectable: false,
              style: {
                "content": "data(weight)",
                'curve-style': 'bezier',
                "width": "data(mappedWeight)", //mapData(weight, 0, 100, 10, 50)",
                //'width': "mapData(weight, 0, 100, 1, 20)",
                'line-color': '#ccc',
                'target-arrow-color': '#ccc',
                'target-arrow-shape': 'triangle',
                "text-opacity": 1.0,
                "text-outline-color": "#fff",
                "text-outline-opacity": 1.0,
                "text-outline-width": 0.2,
              }
            }
          ],
          layout: {
            name: this.layout
          }
        });

        this.cy.on('click', function(event) {
          if (event.originalEvent.ctrlKey) {
            let skeletonId = event.cyTarget.data()['skeleton_id'];
            if (skeletonId === undefined) {
              return;
            }
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
          }
        });

        this.cy.on('select', function(event) {
          self.skeletonSource.clear();
          var data = event.cyTarget.data();
          if (event.cyTarget.isNode() && data) {
            self.skeletonSource.clear();
            let models = {};
            models[data.id] = new CATMAID.SkeletonModel(data.id);
            self.skeletonSource.append(models);
          }
        });
        this.cy.on('unselect', function(event) {
          self.skeletonSource.clear();
        });
      },
      init: function() {
      },
      helpText: [
        '<h1>Overview</h1>',
        '<p>The Skeleton History Widget shows a graph visualization of ',
        'skeleton ID changes of sets of nodes over time. These can ',
        'happen as results of skeleton splits and merges.</p>',
        '<p>History can be viewed for past and present skeletons. To load ',
        'the history for one or more skeletons, copy their skeleton IDs ',
        'into the <em>(Past) Skeleton IDs</em> field, separated by commas. ',
        'Every node that has ever been part of any of these skeletons ',
        'is tracked from the moment on they became part of them.</p>',
        '<p>For each node that has been part of any of the query skeletons, the ',
        'history of all its skeleton ID changes is collected, from the ',
        'moment it became part of a query skeleton to its most recent ',
        'appearence. Optionally, this query can be constrained by date ',
        'range and editing user.</p>',
        '<p><em>Colors:</em> yellow - existing skeleton, gray: past skeleton, ',
        'cyan: query skeleton, green: selected skeleton</p>',
        '<h1>Interaction</h1>',
        '<p>Skeletons/nodes can be selected by clicking on them. Multiple ',
        'skeletons can be selected using the <kbd>Shift</kbd> key. Selected skeletons ',
        'are colored green and are made available through the widget\'s ',
        'skeleton source API.</p>',
        '<p>Clicking on a skeleton node with the <kbd>Ctrl</kbd> key pressed down ',
        'will select the closest node of this skeleton (if it exists) ',
        'and centers the view on it.</p>.'
      ].join('\n')
    };
  };

  SkeletonHistoryGraph.prototype.redraw = function() {
    if (!this.skeletonHistoryData || !this.cy) {
      return;
    }
  };

  SkeletonHistoryGraph.prototype.updateData = function() {
    var self = this;
    return CATMAID.Skeletons.skeletonHistory(project.id, this.skeletonIds,
        this.userId, this.changesAfter, this.changesBefore)
      .then((history) => {
        this.skeletonHistoryData = {
          history: history,
        };
      });
  };

  /**
   * Explore connected component around node in a depth-first manner.
   */
  function exploreComponent(target, node, childIds, annotationIds, newComponentId) {
    // Ignore already added nodes
    if (target[node.id]) {
      return false;
    }

    target[node.id] = newComponentId;

    // Make sure all parent nodes of this node are in the same component
    var parents = node.annotations;
    for (var i=0, max=parents.length; i<max; ++i) {
      var a = annotationIds[parents[i].id];
      var created = exploreComponent(target, a, childIds, annotationIds, newComponentId);
    }
    // Make sure all children of this node are in the same component
    var children = childIds[node.id];
    if (children) {
      for (var i=0, max=children.length; i<max; ++i) {
        var a = annotationIds[children[i].id];
        var created = exploreComponent(target, a, childIds, annotationIds, newComponentId);
      }
    }

    return true;
  }

  /**
   * Return a mapping of component IDs versus lists of nodes. Each list
   * represents a single connected component.
   */
  function getComponents(annotations, annotationIds) {
    // Map meta-annotations (parents) to annotations (children)
    var children = annotations.reduce(function(g, n) {
      var metaAnnotations = n.annotations;
      for (var i=0, max=metaAnnotations.length; i<max; ++i) {
        var ma = metaAnnotations[i];
        var children = g[ma.id];
        if (children) {
          children.push(n);
        } else {
          g[ma.id] = [n];
        }
      }
      return g;
    }, {});

    // Find component members
    var componentId = 0;
    var componentMembers= annotations.reduce(function(g, n) {
      var created = exploreComponent(g, n, children, annotationIds, componentId);
      if (created) {
        ++componentId;
      }
      return g;
    }, {});

    // Collect component members into groups
    var components = Object.keys(componentMembers).reduce(function(g, n) {
      var componentId = componentMembers[n];
      var component = g[componentId];
      if (component) {
        component.push(n);
      } else {
        g[componentId] = [n];
      }
      return g;
    }, {});

    return components;
  }

  /**
   * Clear graph, filter available annotation data and rebuild graph.
   */
  SkeletonHistoryGraph.prototype.updateGraph = function() {
    return this.updateData()
      .then(() => {
        // Remove all nodes and edges
        this.cy.remove('node');

        let history = this.skeletonHistoryData.history;

        // Collect all nodes and add them to Cytoscape.js
        let seenNodes = new Set();
        this.cy.add(history.reduce((l, pathEntry) => {
          let skeletonIds = pathEntry[0];
          if (skeletonIds.length > 0) {
            let firstSkeletonId = skeletonIds[0];
            if (!seenNodes.has(firstSkeletonId)) {
              l.push({
                group: 'nodes',
                data: {
                  name: firstSkeletonId,
                  id: firstSkeletonId,
                  index: seenNodes.size,
                  shape: 'ellipse',
                  color: '#00ffff',
                  skeleton_id: firstSkeletonId,
                }
              });
              seenNodes.add(firstSkeletonId);
            }

            let lastSkeletonId = skeletonIds[skeletonIds.length - 1];
            if (!seenNodes.has(lastSkeletonId)) {
              l.push({
                group: 'nodes',
                data: {
                  name: lastSkeletonId,
                  id: lastSkeletonId,
                  index: seenNodes.size,
                  shape: 'ellipse',
                  color: pathEntry[2] == 1 ? '#ffff00' : '#ccc',
                  skeleton_id: lastSkeletonId,
                }
              });
              seenNodes.add(lastSkeletonId);
            }
          }
          return l;
        }, []));

        let mapWeight = (w, f) => 1 + f * Math.log(w);

        // Collect all edges and add them to Cytoscape.js
        let seenEdges = new Map();
        this.cy.add(history.reduce((l, pathEntry) => {
          let skeletonIds = pathEntry[0];
          if (skeletonIds.length > 1) {
            let firstSkeletonId = skeletonIds[0];
            let lastSkeletonId = skeletonIds[skeletonIds.length - 1];
             let edgeKey = `${firstSkeletonId}-${lastSkeletonId}`;
             if (seenEdges.has(edgeKey)) {
               let edge = seenEdges.get(edgeKey);
               edge.weight += pathEntry[1];
               edge.mappedWeight = mapWeight(edge.weight, 1);
             } else {
               let edge = {
                 group: 'edges',
                 data: {
                   source: firstSkeletonId,
                   target: lastSkeletonId,
                   weight: pathEntry[1],
                   mappedWeight: mapWeight(pathEntry[1], 1),
                   state: pathEntry[2],
                 }
               };
               l.push(edge);
               seenEdges.set(edgeKey, edge);
             }
           }
           return l;
        }, []));

        // Refresh layout
        this.cy.layout(this.layouts[this.layout]);
      })
      .then(this.redraw.bind(this))
      .catch(CATMAID.handleError);
  };

  SkeletonHistoryGraph.prototype.layouts = {
    preset: {
      name: 'preset',
      // whether to fit to viewport
      fit: true,
      // padding on fit
      padding: 30
    },
    grid: {
      name: 'grid',
      fit: true, // whether to fit the viewport to the graph
      rows: undefined, // force num of rows in the grid
      columns: undefined, // force num of cols in the grid
    },
    random: {
      name: 'random',
      fit: true // whether to fit to viewport
    },
    arbor: {
      name: 'arbor',
      liveUpdate: true, // whether to show the layout as it's running
      maxSimulationTime: 2000, // max length in ms to run the layout
      fit: true, // fit to viewport
      padding: [ 50, 50, 50, 50 ], // top, right, bottom, left
      ungrabifyWhileSimulating: true, // so you can't drag nodes during layout

      // forces used by arbor (use arbor default on undefined)
      repulsion: undefined,
      stiffness: undefined,
      friction: undefined,
      gravity: true,
      fps: undefined,
      precision: undefined,

      // static numbers or functions that dynamically return what these
      // values should be for each element
      nodeMass: undefined,
      edgeLength: undefined,

      stepSize: 1, // size of timestep in simulation

      // function that returns true if the system is stable to indicate
      // that the layout can be stopped
      stableEnergy: function( energy ){
          var e = energy;
          return (e.max <= 0.5) || (e.mean <= 0.3);
      }
    },
    circle: {
      name: 'circle',
      fit: true, // whether to fit the viewport to the graph
      rStepSize: 10, // the step size for increasing the radius if the nodes don't fit on screen
      padding: 30, // the padding on fit
      startAngle: 3/2 * Math.PI, // the position of the first node
      counterclockwise: false // whether the layout should go counterclockwise (true) or clockwise (false)
    },
    breadthfirst: {
      name: 'breadthfirst', // Hierarchical
      fit: true, // whether to fit the viewport to the graph
      directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
      padding: 30, // padding on fit
      circle: false, // put depths in concentric circles if true, put depths top down if false
      roots: undefined // the roots of the trees
    },
    cose: {
      name: 'cose',
      // Number of iterations between consecutive screen positions update (0 -> only updated on the end)
      refresh: 0,
      // Whether to fit the network view after when done
      fit: true,
      // Whether to randomize node positions on the beginning
      randomize: true,
      // Whether to use the JS console to print debug messages
      debug: false,

      // Node repulsion (non overlapping) multiplier
      nodeRepulsion: 10000,
      // Node repulsion (overlapping) multiplier
      nodeOverlap: 10,
      // Ideal edge (non nested) length
      idealEdgeLength: 50,
      // Divisor to compute edge forces
      edgeElasticity: 100,
      // Nesting factor (multiplier) to compute ideal edge length for nested edges
      nestingFactor: 5,
      // Gravity force (constant) for each group of nested nodes
      gravity: 250,

      // Maximum number of iterations to perform
      numIter: 100,
      // Initial temperature (maximum node displacement)
      initialTemp: 200,
      // Cooling factor (how the temperature is reduced between consecutive iterations)
      coolingFactor: 0.95,
      // Lower temperature threshold (below this point the layout will end)
      minTemp: 1
    },
    concentric: {
      name: 'concentric',
      fit: true, // whether to fit the viewport to the graph
      ready: undefined, // callback on layoutready
      stop: undefined, // callback on layoutstop
      padding: 30, // the padding on fit
      startAngle: 3/2 * Math.PI, // the position of the first node
      counterclockwise: false, // whether the layout should go counterclockwise (true) or clockwise (false)
      minNodeSpacing: 80, // min spacing between outside of nodes (used for radius adjustment)
      height: undefined, // height of layout area (overrides container height)
      width: undefined, // width of layout area (overrides container width)
      levelWidth: function(nodes) { // the variation of concentric values in each level
        return nodes.maxDegree() / 4;
      }
    },
    dagre: {
      name: 'dagre',
      // dagre algo options, uses default value on undefined
      nodeSep: undefined, // the separation between adjacent nodes in the same rank
      edgeSep: undefined, // the separation between adjacent edges in the same rank
      rankSep: undefined, // the separation between adjacent nodes in the same rank
      rankDir: undefined, // 'TB' for top to bottom flow, 'LR' for left to right
      minLen: function( edge ){ return 1; }, // number of ranks to keep between the source and target of the edge
      edgeWeight: function( edge ){ return 1; }, // higher weight edges are generally made shorter and straighter than lower weight edges
      // general layout options
      fit: true, // whether to fit to viewport
      padding: 30, // fit padding
      animate: false, // whether to transition the node positions
      animationDuration: 500, // duration of animation in ms if enabled
      boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
      ready: function(){}, // on layoutready
      stop: function(){} // on layoutstop
    },
    cola: {
      name: 'cola',
      animate: true, // whether to show the layout as it's running
      refresh: 1, // number of ticks per frame; higher is faster but more jerky
      maxSimulationTime: 4000, // max length in ms to run the layout
      ungrabifyWhileSimulating: false, // so you can't drag nodes during layout
      fit: true, // on every layout reposition of nodes, fit the viewport
      padding: 30, // padding around the simulation
      boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
      // layout event callbacks
      ready: function(){}, // on layoutready
      stop: function(){}, // on layoutstop
      // positioning options
      randomize: false, // use random node positions at beginning of layout
      avoidOverlap: true, // if true, prevents overlap of node bounding boxes
      handleDisconnected: true, // if true, avoids disconnected components from overlapping
      nodeSpacing: function( node ){ return 10; }, // extra spacing around nodes
      flow: undefined, // use DAG/tree flow layout if specified, e.g. { axis: 'y', minSeparation: 30 }
      alignment: undefined, // relative alignment constraints on nodes, e.g. function( node ){ return { x: 0, y: 1 } }
      // different methods of specifying edge length
      // each can be a constant numerical value or a function like `function( edge ){ return 2; }`
      edgeLength: undefined, // sets edge length directly in simulation
      edgeSymDiffLength: undefined, // symmetric diff edge length in simulation
      edgeJaccardLength: undefined, // jaccard edge length in simulation
      // iterations of cola algorithm; uses default values on undefined
      unconstrIter: undefined, // unconstrained initial layout iterations
      userConstIter: undefined, // initial layout iterations with user-specified constraints
      allConstIter: undefined, // initial layout iterations with all constraints including non-overlap
      // infinite layout options
      infinite: false // overrides all other options for a forces-all-the-time mode
    },
    spread: {
      name: 'spread',
      animate: true, // whether to show the layout as it's running
      ready: undefined, // Callback on layoutready
      stop: undefined, // Callback on layoutstop
      fit: true, // Reset viewport to fit default simulationBounds
      minDist: 20, // Minimum distance between nodes
      padding: 20, // Padding
      expandingFactor: -1.0, // If the network does not satisfy the minDist
      // criterium then it expands the network of this amount
      // If it is set to -1.0 the amount of expansion is automatically
      // calculated based on the minDist, the aspect ratio and the
      // number of nodes
      maxFruchtermanReingoldIterations: 50, // Maximum number of initial force-directed iterations
      maxExpandIterations: 4, // Maximum number of expanding iterations
      boundingBox: undefined // Constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
    },
    springy: {
      name: 'springy',
      animate: true, // whether to show the layout as it's running
      maxSimulationTime: 2000, // max length in ms to run the layout
      ungrabifyWhileSimulating: false, // so you can't drag nodes during layout
      fit: true, // whether to fit the viewport to the graph
      padding: 30, // padding on fit
      boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
      random: false, // whether to use random initial positions
      infinite: false, // overrides all other options for a forces-all-the-time mode
      ready: undefined, // callback on layoutready
      stop: undefined, // callback on layoutstop
      // springy forces
      stiffness: 400,
      repulsion: 400,
      damping: 0.5
    }
  };

  SkeletonHistoryGraph.prototype.layoutOptions = [
    { value: 'spread',        title: "Spread (force-directed)" },
    { value: 'breadthfirst',  title: "Hierarchical" },
    { value: 'grid',          title: "Grid" },
    { value: 'circle',        title: "Circle" },
    { value: 'concentric',    title: "Concentric (degree)" },
    { value: 'concentric out',title: "Concentric (out degree)" },
    { value: 'concentric in', title: "Concentric (in degree)" },
    { value: 'random',        title: "Random" },
    { value: 'cose',          title: "Compound Spring Embedder" },
    { value: 'preset',        title: "Manual" },
    { value: 'dagre',         title: "Dagre (DAG-based)" },
    { value: 'cola',          title: "Cola (force-directed)" },
    { value: 'arbor',         title: "Arbor (force-directed)" },
    { value: 'springy',       title: "Springy (force-directed)" }
  ];


  // Export widget
  CATMAID.SkeletonHistoryGraph = SkeletonHistoryGraph;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: 'Skeleton Change History',
    description: 'Show split and merge history of skeletons',
    key: 'skeleton-change-history',
    creator: SkeletonHistoryGraph
  });

})(CATMAID);

