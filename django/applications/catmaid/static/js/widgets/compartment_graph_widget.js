/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  cytoscape,
  fetchSkeletons,
  InstanceRegistry,
  project,
  requestQueue,
  SynapseClustering,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var GroupGraph = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.label_valign = 'top';
    this.label_halign = 'center';
    this.show_node_labels = true;
    this.trim_node_labels = false;
    this.node_width = 30; // pixels
    this.node_height = 30; // pixels

    this.color_circles_of_hell_upstream = this.colorCirclesOfHell.bind(this, true);
    this.color_circles_of_hell_downstream = this.colorCirclesOfHell.bind(this, false);

    this.edge_text_color = '#555';
    this.edge_text_opacity = 1.0;
    // Edge width is computed as edge_min_width + edge_width_function(weight)
    this.edge_min_width = 0;
    this.edge_width_function = "sqrt"; // choices: identity, log, log10, sqrt
    this.edge_label_strategy = "absolute"; // choicess: edgeLabelStrategies keys

    this.edge_threshold = 1;
    this.edge_confidence_threshold = 1;

    this.selectedLinkTypes = new Set(['synaptic-connector']);
    this.linkTypeColors = new Map([
      ['synaptic-connector', {
        'color': '#555',
        'opacity': 1.0
      }],
      ['default', {
        'color': '#ff9e25',
        'opacity': 1.0
      }]
    ]);

    this.setState('color_mode', 'source');

    // stores re-layout timeout when resizing
    this.relayoutTimeout = null;

    this.groups = {}; // groupID vs Group instances, where groupID is e.g. g0, g1, g2, ...

    // Keep set of selected elements as arrays of [id, index]
    // so that the order of the selection is stored.
    // The counter always increases, so that deleting nodes doesn't alter the order.
    this.selection = {entries: {},
                      counter: 0};

    // Variables related to the "Selections" tab for managing multiple selections
    this.selections = {};
    this.prevent_selection_overlaps = true;
    //

    this.grid_snap = false;
    this.grid_side = 10; // px

    // Map of skeleton ID vs one of:
    // * SUBGRAPH_AXON_DENDRITE
    // * SUBGRAPH_AXON_BACKBONE_TERMINALS
    // * a number larger than zero (bandwidth value for synapse clustering)
    this.subgraphs = {};

    // Remember "Split at tag" dialog choices
    this.tag_text = '';
    this.tag_title_root = '';
    this.tag_title_others = '';

    this.layout_fit = true;

    this.layout_options = {
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

    // Handle neuron deletion and merge events
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, this.handleSkeletonChanged, this);
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_DELETED, this.handleSkeletonDeletion, this);
  };

  GroupGraph.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  GroupGraph.prototype.constructor = GroupGraph;

  $.extend(GroupGraph.prototype, new InstanceRegistry());

  GroupGraph.prototype.SUBGRAPH_AXON_DENDRITE =  -1;
  GroupGraph.prototype.SUBGRAPH_AXON_BACKBONE_TERMINALS = -2;
  GroupGraph.prototype.SUBGRAPH_SPLIT_AT_TAG = -3;

  GroupGraph.prototype.getWidgetConfiguration = function() {
    return {
      subscriptionSource: [this],
      controlsID: 'compartment_graph_window_buttons' + this.widgetID,
      createControls: function(controls) {
        var GG = this;
        var tabs = CATMAID.DOM.addTabGroup(controls, GG.widgetID, ['Main', 'Grow', 'Nodes',
            'Edges', 'Selection', 'Selections', 'Subgraphs', 'Align', 'Export']);

        CATMAID.DOM.appendToTab(tabs['Main'],
            [[document.createTextNode('From')],
             [CATMAID.skeletonListSources.createSelect(GG)],
             ['Append', GG.loadSource.bind(GG)],
             ['Append as group', GG.appendAsGroup.bind(GG)],
             ['Remove', GG.removeSource.bind(GG)],
             ['Clear', GG.clear.bind(GG)],
             ['Refresh', GG.update.bind(GG)],
             [document.createTextNode(' - ')],
             ['Group equally named', GG.groupEquallyNamed.bind(GG)],
             ['Group equally colored', GG.groupEquallyColored.bind(GG)],
             [document.createTextNode(' - ')],
             ['Properties', GG.graph_properties.bind(GG)],
             ['Clone', GG.cloneWidget.bind(GG)],
             ['Save', GG.saveJSON.bind(GG)],
             ['Open...', function() { document.querySelector('#gg-file-dialog-' + GG.widgetID).click(); }]]);

        tabs['Export'].appendChild(CATMAID.DOM.createFileButton(
              'gg-file-dialog-' + GG.widgetID, false, function(evt) {
                GG.loadFromFile(evt.target.files);
              }));

        var layout = CATMAID.DOM.appendSelect(tabs['Nodes'], null, null, GG.layoutStrings);

        var edges = document.createElement('select');
        edges.setAttribute('id', 'graph_edge_threshold' + GG.widgetID);
        for (var i=1; i<101; ++i) edges.appendChild(new Option(i, i));

        var edgeConfidence = document.createElement('select');
        edgeConfidence.setAttribute('id', 'graph_edge_confidence_threshold' + GG.widgetID);
        for (var i=1; i<6; ++i) edgeConfidence.appendChild(new Option(i, i));
        edges.onchange = edgeConfidence.onchange = function() {
            GG.filterEdges($('#graph_edge_threshold' + GG.widgetID).val(),
                           $('#graph_edge_confidence_threshold' + GG.widgetID).val()); };

        var linkTypeSelection = CATMAID.DOM.createAsyncPlaceholder(
          CATMAID.DOM.initLinkTypeList({
            getSelectedLinkTypes: function() {
              return GG.selectedLinkTypes;
            },
            update: GG.update.bind(GG),
            setLinkTypeVisibility: GG.setLinkTypeVisibility.bind(GG),
            color: true,
            getLinkTypeColor: GG.getLinkTypeColor.bind(GG),
            getLinkTypeOpacity: GG.getLinkTypeOpacity.bind(GG),
            updateLinkTypeColor: GG.updateLinkTypeColor.bind(GG)
          }));
        var linkTypeSelectionWrapper = document.createElement('span');
        linkTypeSelectionWrapper.appendChild(linkTypeSelection);

        CATMAID.DOM.appendToTab(tabs['Nodes'],
            [['Re-layout', GG.updateLayout.bind(GG, layout, null)],
             [' fit', true, GG.toggleLayoutFit.bind(GG), true],
             [document.createTextNode(' - Color: ')],
             [CATMAID.DOM.createSelect('graph_color_choice' + GG.widgetID,
               [{title: 'source', value: 'source'},
                {title: 'review status (union)', value: 'union-review'},
                {title: 'review status (team)', value: 'whitelist-review'},
                {title: 'review status (own)', value: 'own-review'},
                {title: 'input/output', value: 'I/O'},
                {title: 'betweenness centrality', value: 'betweenness_centrality'},
                {title: 'circles of hell (upstream)', value: 'circles_of_hell_upstream'},
                {title: 'circles of hell (downstream)', value: 'circles_of_hell_downstream'}],
               'source',
                GG._colorize.bind(GG))],
            ]);

        CATMAID.DOM.appendToTab(tabs['Edges'],
            [[document.createTextNode('Color by: ')],
             [CATMAID.DOM.createSelect(
                 'gg_edge_color_choice' + GG.widgetID,
                 ["source", "target", "generic"],
                 "generic",
                  GG.updateEdgeGraphics.bind(GG, true))],
             [document.createTextNode(' - Hide edges with less than ')],
             [edges],
             [document.createTextNode(' synapses ')],
             ['Hide self edges', GG.hideSelfEdges.bind(GG)],
             [document.createTextNode(' Filter synapses below confidence ')],
             [edgeConfidence],
             {type: 'child', element: linkTypeSelectionWrapper},
             [document.createTextNode(' - Arrow shape: ')],
             [CATMAID.DOM.createSelect(
               'gg_edge_arrow_shape' + GG.widgetID,
               ["triangle", "tee", "circle", "square", "diamond", "vee", "triangle-tee", "none"], // Only available in cytoscape 3.2.11 or later: "triangle-cross", "triangle-backcurve",
               "triangle",
               null)],
             ['Set', GG.setArrowShapeToSelectedNodes.bind(GG)],
            ]);

        CATMAID.DOM.appendToTab(tabs['Selection'],
            [['Annotate', GG.annotate_skeleton_list.bind(GG)],
             [document.createTextNode(' - ')],
             ['Measure edge risk', GG.annotateEdgeRisk.bind(GG)],
             [document.createTextNode(' - ')],
             ['Group', GG.group.bind(GG)],
             ['Ungroup', GG.ungroup.bind(GG)],
             [document.createTextNode(' - ')],
             ['Hide', GG.hideSelected.bind(GG)],
             ['Show hidden', GG.showHidden.bind(GG), {id: 'graph_show_hidden' + GG.widgetID, disabled: true}],
             ['lock', GG.applyToNodes.bind(GG, 'lock', true)],
             ['unlock', GG.applyToNodes.bind(GG, 'unlock', true)],
             [document.createTextNode(' - ')],
             ['Remove', GG.removeSelected.bind(GG)],
             [document.createTextNode(' - ')],
             [CATMAID.DOM.createTextField('gg_select_regex' + GG.widgetID, null, null, '', '', GG.selectByLabel.bind(GG), null)],
             ['Select by regex', GG.selectByLabel.bind(GG)],
             [document.createTextNode(' - ')],
             ['Invert', GG.invertSelection.bind(GG)],
            ]);

        CATMAID.DOM.appendToTab(tabs['Selections'],
            [['Create selection', GG.createSelection.bind(GG)],
             {type: 'checkbox',
              label: 'prevent overlaps',
              title: '',
              value: true,
              onclick: GG.togglePreventSelectionOverlaps.bind(GG),
              id: "gg_prevent_overlaps" + GG.widgetID},
             [CATMAID.DOM.createSelect("gg_selections" + GG.widgetID, [])],
             ['\u25B2', GG.moveSelection.bind(GG, -1)],
             ['\u25BC', GG.moveSelection.bind(GG, 1)],
             ['Select', GG.activateSelection.bind(GG, true)],
             ['Deselect', GG.activateSelection.bind(GG, false)],
             ['Remove', GG.removeSelection.bind(GG)],
             ['Select all', GG.activateAllSelections.bind(GG)],
             [document.createTextNode(' - ')],
             ['As columns', GG.alignSelectionsAsColumns.bind(GG)],
             {type: 'checkbox',
              label: 'hide other nodes',
              title: 'Hide nodes not part of any selection',
              value: true,
              onclick: null, // TODO consider adding a function to show/hide nodes not in selections
              id: "gg_hide_nodes_not_in_selections" + GG.widgetID},
             [CATMAID.DOM.createNumericField('gg_columns_edge_opacity' + GG.widgetID, 'edge opacity:', null, '30', '%', GG.showRelevantEdgesToColumns.bind(GG), 2, GG.showRelevantEdgesToColumns.bind(GG), 3)],
             ['Fade edges', GG.showRelevantEdgesToColumns.bind(GG)],
             ['Restore edges', GG.updateEdgeGraphics.bind(GG, true)],
             ['Hide non-seq edges', GG.hideNonSequentialEdges.bind(GG)],
            ]);

        CATMAID.DOM.appendToTab(tabs['Align'],
            [[document.createTextNode('Align: ')],
             [' X ', GG.equalizeCoordinate.bind(GG, 'x')],
             [' Y ', GG.equalizeCoordinate.bind(GG, 'y')],
             [document.createTextNode(' - Distribute: ')],
             [' X ', GG.distributeCoordinate.bind(GG, 'x')],
             [' Y ', GG.distributeCoordinate.bind(GG, 'y')]]);

        var f = function(name) {
          var e = document.createElement('select');
          e.setAttribute("id", "gg_n_min_" + name + GG.widgetID);
          e.appendChild(new Option("All " + name, 0));
          e.appendChild(new Option("No " + name, -1));
          for (var i=1; i<51; ++i) {
            e.appendChild(new Option(i, i));
          }
          e.selectedIndex = 3; // value of 2 pre or post min
          return e;
        };

        CATMAID.DOM.appendToTab(tabs['Grow'],
            [[document.createTextNode('Grow ')],
             ['Circles', GG.growGraph.bind(GG)],
             [document.createTextNode(" by ")],
             [CATMAID.DOM.createSelect("gg_n_circles_of_hell" + GG.widgetID, [1, 2, 3, 4, 5])],
             [document.createTextNode(" orders, limit:")],
             [f("upstream")],
             [f("downstream")],
             [CATMAID.DOM.createTextField('gg_filter_regex' + GG.widgetID, 'filter (regex):',
                                 'Only include neighbors with annotations matching this regex.',
                                 '', undefined, undefined, 4)],
             [document.createTextNode(" - Find ")],
             ['paths', GG.growPaths.bind(GG)],
             [document.createTextNode(" by ")],
             [CATMAID.DOM.createSelect("gg_n_hops" + GG.widgetID, [2, 3, 4, 5, 6])],
             [document.createTextNode(" hops, limit:")],
             [f("path_synapses")],
             ['pick sources', GG.pickPathOrigins.bind(GG, 'source'), {id: 'gg_path_source' + GG.widgetID}],
             ['X', GG.clearPathOrigins.bind(GG, 'source')],
             ['pick targets', GG.pickPathOrigins.bind(GG, 'target'), {id: 'gg_path_target' + GG.widgetID}],
             ['X', GG.clearPathOrigins.bind(GG, 'target')]]);

        CATMAID.DOM.appendToTab(tabs['Export'],
            [['Export GML', GG.exportGML.bind(GG)],
             ['Export SVG', GG.showSVGOptions.bind(GG)],
             ['Export Adjacency Matrix', GG.exportAdjacencyMatrix.bind(GG)],
             ['Open Connectivity Matrix', GG.openConnectivityMatrix.bind(GG, false)],
             ['Open plot', GG.openPlot.bind(GG)],
             ['Quantify', GG.quantificationDialog.bind(GG)]]);

        CATMAID.DOM.appendToTab(tabs['Subgraphs'],
            [[document.createTextNode('Select node(s) and split by: ')],
             ['Axon & dendrite', GG.splitAxonAndDendrite.bind(GG)],
             ['Axon, backbone dendrite & dendritic terminals', GG.splitAxonAndTwoPartDendrite.bind(GG)],
             ['Synapse clusters', GG.splitBySynapseClustering.bind(GG)],
             ['Tag', GG.splitByTag.bind(GG)],
             ['Reset', GG.unsplit.bind(GG)]]);

        $(controls).tabs();
      },
      contentID: "graph_widget" + this.widgetID,
      expandContent: true,
      createContent: function(content) {
        /* Create graph container and assure that it's overflow setting is set to
         * 'hidden'. This is required, because cytoscape.js' redraw can be delayed
         * (e.g. due to animation). When the window's size is reduced, it can happen
         * that the cytoscape canvas is bigger than the container. The default
         * 'auto' setting then introduces scrollbars, triggering another resize.
         * This somehow confuses cytoscape.js and causes the graph to disappear.
         */
        content.style.overflow = 'hidden';

        var graph = document.createElement('div');
        graph.setAttribute("id", "cyelement" + this.widgetID);
        graph.style.width = "100%";
        graph.style.height = "100%";
        graph.style.backgroundColor = "#FFFFF0";
        content.appendChild(graph);
      },
      init: function() {
        this.init();
      },
      helpPath: 'graph-widget.html',
    };
  };

  GroupGraph.prototype.getName = function() {
    return "Graph " + this.widgetID;
  };

  GroupGraph.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, this.handleSkeletonChanged, this);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_DELETED, this.handleSkeletonDeletion, this);
  };

  GroupGraph.prototype.nextGroupID = function() {
    var keys = Object.keys(this.groups).map(function(key) {
      return parseInt(key.substr(1));
    }).sort(function(a, b) {
      return a === b ? 0 : (a < b ? -1 : 1);
    });
    return 'g' + (0 === keys.length ? 1 : keys[keys.length -1] + 1);
  };

  GroupGraph.prototype.getSelectedSkeletons = function() {
    if (!this.cy) return [];
    // Collect unique, selected skeleton IDs
    var ids = {};
    this.cy.nodes(function(i, node) {
      if (node.selected() && node.visible()) {
        node.data("skeletons").forEach(function(skeleton) {
          ids[skeleton.id] = true;
        });
      }
    });
    return Object.keys(ids).map(Number);
  };

  GroupGraph.prototype.getSkeletons = function() {
    if (!this.cy) return [];
    // Collect unique skeleton IDs
    var ids = {};
    this.cy.nodes(function(i, node) {
      node.data("skeletons").forEach(function(skeleton) {
        ids[skeleton.id] = true;
      });
    });
    return Object.keys(ids).map(Number);
  };

  /** One or more for each skeleton_id, depending on the synapse clustering bandwidth and the confidence value for splitting up skeletons at low-confidence edges. */
  GroupGraph.prototype.getNodes = function(skeleton_id) {
    return this.cy.nodes().filter(function(i, node) {
      return node.data("skeletons").some(function(skeleton) {
        return skeleton_id == skeleton.id; // == and not === to allow number and "number"
      });
    });
  };

  /** Return the color of the first node found, or a default magenta color. */
  GroupGraph.prototype.getSkeletonColor = function(skeleton_id) {
    var nodes = this.getNodes(skeleton_id);
    if (nodes.length > 0) {
      return new THREE.Color(nodes[0].data("color"));
    }
    return new THREE.Color(1, 0, 1);
  };

  GroupGraph.prototype.updateModels = function(models) {
    this.append(models);
  };

  GroupGraph.prototype.hasSkeleton = function(skeleton_id) {
    return this.getNodes(skeleton_id).length > 0;
  };

  GroupGraph.prototype.createSkeletonModel = function(props) {
    return new CATMAID.SkeletonModel(props.skeleton_id, props.label, new THREE.Color().setHex(parseInt('0x' + props.color.substring(1))));
  };

  GroupGraph.prototype.getSkeletonModel = function(skeleton_id) {
    var nodes = this.getNodes(skeleton_id);
    if (0 === nodes.length) return null;
    var node = nodes[0],
        props = node.data(),
        model = props.skeletons[0].clone();
    model.color = new THREE.Color().setHex(parseInt('0x' + props.color.substring(1)));
    model.setVisible(node.selected());
    return model;
  };

  GroupGraph.prototype.getSkeletonModels = function() {
    return this.cy.nodes().toArray().reduce(this._asModels, {});
  };

  GroupGraph.prototype.getSelectedSkeletonModels = function() {
    return this.cy.nodes().toArray().reduce(function(m, node) {
      if (node.selected() && node.visible()) {
        GroupGraph.prototype._asModels(m, node);
      }
      return m;
    }, {});
  };

  GroupGraph.prototype._asModels = function(m, node) {
    var props = node.data(),
        color = new THREE.Color().setHex(parseInt('0x' + props.color.substring(1))),
        selected = node.selected();
    return props.skeletons.reduce(function(m, skeleton) {
      var copy = skeleton.clone();
      copy.baseName = node.data('label');
      copy.color = color.clone();
      copy.setVisible(selected);
      m[copy.id] = copy;
      return m;
    }, m);
  };

  GroupGraph.prototype.toggle_show_node_labels = function() {
    if (this.show_node_labels) {
      this.show_node_labels = false;
      this.cy.nodes().css('text-opacity', 0);
    } else {
      this.show_node_labels = true;
      this.cy.nodes().css('text-opacity', 1);
    }
  };

  GroupGraph.prototype.handleKeyPress = function(event) {
    // In case shift is pressed, the mousewheel sensitivity will be changed so
    // that zooming happens in smaller steps.
    if (event.key === 'Shift' && this.cy) {
      this.cy._private.renderer.wheelSensitivity = 0.5;
    }
  };

  GroupGraph.prototype.handleKeyUp = function(event) {
    // In case shift is pressed, the mousewheel sensitivity will be set back to
    // normal.
    if (event.key === 'Shift' && this.cy) {
      this.cy._private.renderer.wheelSensitivity = 1;
    } else if (event.key === 'j') {
      // Letter 'J' (would prefer shift+G)
      this.group();
    } else if (event.key === 'Delete') {
      this.removeSelected();
    }
  };

  GroupGraph.prototype.graph_properties = function() {

    var dialog = new CATMAID.OptionsDialog("Graph properties");
    var vpos = ["top", "center", "bottom"];
    var label_vpos = dialog.appendChoice("Node label vertical position", "valign", vpos, vpos, this.label_valign);
    var hpos = ["left", "center", "right"];
    var label_hpos = dialog.appendChoice("Node label horizontal position", "halign", hpos, hpos, this.label_halign);
    var node_labels = dialog.appendCheckbox("Show node labels", "node_labels", this.show_node_labels);
    node_labels.onclick = this.toggle_show_node_labels.bind(this);
    var trim_labels = dialog.appendCheckbox("Trim node labels beyond first ';'", "trim_labels", this.trim_node_labels);
    trim_labels.onclick = this.toggleTrimmedNodeLabels.bind(this);
    var node_width = dialog.appendField("Node width:", "node_width", this.node_width);
    var node_height = dialog.appendField("Node height:", "node_height", this.node_height);
    var grid_snap = dialog.appendCheckbox("Snap node position to grid", "snap", this.grid_snap);
    var grid_side = dialog.appendField("Grid cell side (px):", "side", this.grid_side);
    dialog.appendMessage("Edge properties:");
    var props = ["opacity", "text opacity", "min width"].map(function(prop) {
      var field = dialog.appendField("Edge " + prop + ":", prop.replace(/ /, '-'), this["edge_" + prop.replace(/ /g, "_")]);
      field.style.width = "40px";
      return field;
    }, this);
    var edgeFnNames = ["identity", "log", "log10", "sqrt"];
    var edgeFnSel = dialog.appendChoice("Edge width as a function of synaptic count:", "edge_width_fn", edgeFnNames, edgeFnNames, this.edge_width_function);

    var edgeLabelFnValues = Object.keys(edgeLabelStrategies);
    var edgeLabelFnNames = edgeLabelFnValues.map(function(v) { return edgeLabelStrategies[v].name; });
    var edgeLabelFnSelect = dialog.appendChoice("Edge label:", "edge_label_strategy",
        edgeLabelFnNames, edgeLabelFnValues, this.edge_label_strategy);

    var linkTypeSelection = CATMAID.DOM.createAsyncPlaceholder(
      CATMAID.DOM.initLinkTypeList({
        getSelectedLinkTypes: (function() {
          return this.selectedLinkTypes;
        }).bind(this),
        update: this.update.bind(this),
        setLinkTypeVisibility: this.setLinkTypeVisibility.bind(this),
        color: true,
        getLinkTypeColor: this.getLinkTypeColor.bind(this),
        getLinkTypeOpacity: this.getLinkTypeOpacity.bind(this),
        updateLinkTypeColor: this.updateLinkTypeColor.bind(this)
      }));
    var linkTypeSelectionWrapper = document.createElement('span');
    linkTypeSelectionWrapper.appendChild(linkTypeSelection);

    var newEdgeTextColor = this.edge_text_color;
    var textColorButton = document.createElement('button');
    textColorButton.appendChild(document.createTextNode('edge text color'));
    CATMAID.ColorPicker.enable(textColorButton, {
      initialColor: this.edge_text_color,
      onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
        if (colorChanged) {
          newEdgeTextColor = "#" + colorHex;
        }
      }
    });

    var p = document.createElement('p');
    p.appendChild(linkTypeSelectionWrapper);
    p.appendChild(textColorButton);
    dialog.dialog.appendChild(p);

    dialog.onOK = (function() {

      var validate = function(name, old_value, new_value) {
        try {
          var v = parseInt(new_value);
          if (v < 0) {
            CATMAID.warn("Value for " + name + " must be positive!");
            return old_value;
          }
          return new_value;
        } catch (e) {
          CATMAID.warn("Bad value: " + new_value);
          return old_value;
        }
      };

      var needsReload = false;

      this.label_halign = label_hpos.value;
      this.label_valign = label_vpos.value;
      this.node_width = validate('node_width', node_width, node_width.value);
      this.node_height = validate('node_height', node_height, node_height.value);

      var style = {"text-halign": this.label_halign,
                   "text-valign": this.label_valign,
                   "width": this.node_width + "px",
                   "height": this.node_height + "px"};

      // Update general style, for new nodes
      this.cy.style().selector("node").css(style);
      // Update style of current nodes
      this.cy.nodes().css(style);

      this.grid_side = validate('grid_side', this.grid_side, grid_side.value);
      this.grid_snap = grid_snap.checked;

      var edge_opacity = Number(props[0].value.trim());
      if (!Number.isNaN(edge_opacity) && edge_opacity >= 0 && edge_opacity <= 1) {
        this.linkTypeColors.forEach(function(linkType, linkTypeName, map) {
          linkType.opacity = edge_opacity;
        });
      }
      var edge_text_opacity = Number(props[1].value.trim());
      if (!Number.isNaN(edge_text_opacity) && edge_text_opacity >= 0 && edge_text_opacity <= 1) this.edge_text_opacity = edge_text_opacity;
      var edge_min_width = Number(props[2].value.trim());
      if (!Number.isNaN(edge_min_width)) this.edge_min_width = edge_min_width;
      this.edge_width_function = edgeFnNames[edgeFnSel.selectedIndex];

      var new_edge_label_strategy = edgeLabelFnValues[edgeLabelFnSelect.selectedIndex];
      if (new_edge_label_strategy !== this.edge_label_strategy) {
        needsReload = true;
        this.edge_label_strategy = new_edge_label_strategy;
      }

      this.edge_text_color = newEdgeTextColor;
      if (needsReload) {
        this.update();
      } else {
        this.updateEdgeGraphics(true);
      }
    }).bind(this);

    dialog.show(440, 'auto', true);
  };

  GroupGraph.prototype.init = function() {
    var options = {
      ready: function() {},
      style: cytoscape.stylesheet()
        .selector("node")
            .css({
              "content": "data(label)",
              "shape": "data(shape)",
              "border-width": 1,
              "background-color": "data(color)",
              "border-color": "#555",
              "text-valign": this.label_valign,
              "text-halign": this.label_halign,
              "width": this.node_width,
              "height": this.node_height
            })
          .selector("edge")
            .css({
              "content": "data(weight)",
              "width": "data(width)", //mapData(weight, 0, 100, 10, 50)",
              "target-arrow-shape": "data(arrow)",
              "target-arrow-color": "data(color)",
              // "source-arrow-shape": "circle",
              "line-color": "data(color)",
              "opacity": 1.0,
              "text-opacity": 1.0,
              "text-outline-color": "#fff",
              "text-outline-opacity": 1.0,
              "text-outline-width": 0.2,
              "color": "data(label_color)", // color of the text label
              "curve-style": "bezier"
            })
          .selector(":selected")
            .css({
              "background-color": "#b0ff72",
              "border-width": 3,
              "line-color": "#878787",
              "source-arrow-color": "#d6ffb5",
              "target-arrow-color": "#d6ffb5",
              "text-opacity": 1.0
            })
          .selector(".hidden")
            .css({
              "display": "none"
            })
          .selector(".ui-cytoscape-edgehandles-source")
            .css({
              "border-color": "#5CC2ED",
              "border-width": 3
            })
          .selector(".ui-cytoscape-edgehandles-target, node.ui-cytoscape-edgehandles-preview")
            .css({
              "background-color": "#444", //"#5CC2ED"
            })
          .selector("edge.ui-cytoscape-edgehandles-preview")
            .css({
              "line-color": "#5CC2ED"
            })
          .selector("node.ui-cytoscape-edgehandles-preview, node.intermediate")
            .css({
              "shape": "rectangle",
              "width": 15,
              "height": 15
            }),
        boxSelectionEnabled: true,
    };
    var sel = $("#cyelement" + this.widgetID);
    sel.cytoscape(options).css('background', 'white');
    this.cy = sel.cytoscape("get");

    // this.cy.nodes().bind("mouseover", function(e) {
    //   // console.log('node mouseover', e);
    // });

    var unselect = (function(evt) {
      delete this.entries[evt.cyTarget.id()];
    }).bind(this.selection);

    this.cy.on('click', 'node', {}, (function(evt){
      var node = evt.cyTarget;
      if (evt.originalEvent.altKey) {
        // Select in the overlay
        var models = node.data('skeletons');
        if (1 === models.length) CATMAID.TracingTool.goToNearestInNeuronOrSkeleton("skeleton", models[0].id);
      } else if (evt.originalEvent.shiftKey && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey)) {
        // Remove node
        delete this.groups[node.id()]; // if present
        delete this.subgraphs[node.data('skeletons')[0].id]; // if present
        node.remove();
        unselect(evt); // remove should have triggered, but not always
      }
    }).bind(this));

    this.cy.on('click', 'edge', {}, function(evt){
      var edge = this,
          props = edge.data();
      if (props.directed && evt.originalEvent.altKey) {
        var source = '' + props.source,
            target = '' + props.target,
            isGroup = function(s) { return 0 === s.indexOf('g'); },
            isSplit = function(s) { return -1 !== s.indexOf('_'); },
            isSingle = function(s) { return !isGroup(s) && !isSplit(s); },
            getData = function(s) { return edge.cy().nodes('[id="' + s + '"]').data(); },
            getSkids = function(s) {
              return getData(s).skeletons.map(function(model) { return model.id; });
            };
        // If both source and target are not split and are not groups:
        if (isSingle(source) && isSingle(target)) {
          CATMAID.ConnectorSelection.show_shared_connectors( [source], [target], "presynaptic_to" );
        } else {
          var source_skids,
              target_skids,
              connector_ids;
          if (isSplit(source)) {
            // Target can be a group or a split
            var source_data = getData(source);
            source_skids = [source_data.skeletons[0].id];
            target_skids = getSkids(target);
            connector_ids = target_skids.reduce(function(a, skid) { return a.concat(source_data.downstream_skids[skid]); }, []);
          } else if (isGroup(source)) {
            source_skids = getSkids(source);
            target_skids = getSkids(target);
            if (isSplit(target)) {
              connector_ids = getData(target).upstream_skids[target_skids[0]];
            }
          } else {
            source_skids = getSkids(source);
            target_skids = getSkids(target);
          }

          var params = {
            cids: connector_ids,
            pre: source_skids,
            post: target_skids
          };

          CATMAID.fetch(project.id + '/connector/info', "POST", params)
            .then(function(result) {
              CATMAID.ConnectorSelection.show_connectors(result);
            })
            .catch(CATMAID.handleError);
        }
      }
    });

    this.cy.on('select', 'node', {}, (function(evt) {
      this.entries[evt.cyTarget.id()] = {node: evt.cyTarget,
                                         order: this.counter++};
    }).bind(this.selection));

    this.cy.on('unselect', 'node', {}, unselect);
    this.cy.on('remove', 'node', {}, unselect);

    this.cy.on('mouseup', 'node', {}, (function(evt) {
      if (this.grid_snap) {
        var list = (undefined === this.selection.entries[evt.cyTarget.id()] ?
          [evt.cyTarget]
          : Object.keys(this.selection.entries).map(function(nodeID) { return this.cy.nodes("[id='" + nodeID + "']"); }, this));
        list.forEach(function(node) {
          var p = node.position();
          node.position({x: p.x + p.x % this.grid_side,
                         y: p.y + p.y % this.grid_side});
        }, this);
      }
    }).bind(this));
  };

  // The index is relied upon by the updateLayout function
  GroupGraph.prototype.layoutStrings = ["Spread (force-directed)", "Hierarchical", "Grid", "Circle",
           "Concentric (degree)", "Concentric (out degree)", "Concentric (in degree)",
           "Random", "Compound Spring Embedder", "Manual", "Dagre (DAG-based)", "Cola (force-directed)",
           "Arbor (force-directed)", "Springy (force-directed)"];

  /** Unlocks locked nodes, if any, when done. */
  GroupGraph.prototype.updateLayout = function(layout, callback) {
    var index = layout ? layout.selectedIndex : 0;
    var name = ['spread', 'breadthfirst', 'grid', 'circle', 'concentric', 'concentric out', 'concentric in', 'random', 'cose', 'preset', 'dagre', 'cola', 'arbor', 'springy'][index];
    var options = this.createLayoutOptions(name);
    options.stop = function() { if (callback) callback(); };
    this.cy.layout( options );
  };

  GroupGraph.prototype.applyToNodes = function(fn, selected) {
    this.cy.nodes().each(function(i, node) {
      if (selected && !node.selected()) return;
      node[fn]();
    });
  };

  GroupGraph.prototype.toggleLayoutFit = function() {
    this.layout_fit = !this.layout_fit;
  };

  GroupGraph.prototype.createLayoutOptions = function(name) {
    var original;

    if (0 === name.indexOf('concentric')) {
      original = name;
      name = 'concentric';
    }

    var options = this.layout_options[name];
    if (!options) return alert("Invalid layout: " + name);

    // clone, to avoid modifying the original
    options = $.extend({}, options);
    options.fit = this.layout_fit;

    if (original) {
      // Define the concentric value function: returns numeric value for each node, placing higher nodes in levels towards the centre
      if      ('concentric'     === original) options.concentric = function() { return this.degree(); };
      else if ('concentric in ' === original) options.concentric = function() { return this.indegree(); };
      else if ('concentric out' === original) options.concentric = function() { return this.outdegree(); };
    }

    return options;
  };

  GroupGraph.prototype.updateNeuronNames = function() {
    this.cy.nodes().each((function(i, node) {
      var models = node.data('skeletons');
      // skip groups
      if (1 === models.length) {
        var name = CATMAID.NeuronNameService.getInstance().getName(models[0].id);
        if (this.subgraphs[models[0].id]) {
          var label = node.data('label');
          var i_ = label.lastIndexOf(' [');
          if (-1 !== i_) name = name + label.substring(i_);
        }
        node.data('label', name);
      }
    }).bind(this));
  };

  GroupGraph.prototype.makeEdgeLabelOptions = function(rawData) {
    var edgeLabelStrategy = edgeLabelStrategies[this.edge_label_strategy];
    if (!edgeLabelStrategy) {
      throw new CATMAID.ValueError("Unknown edge label strategy: " + this.edge_label_strategy);
    }
    var edgeLabelOptions = {
      edge_confidence_threshold: this.edge_confidence_threshold,
      originIndex: {},
      relationMap: {}
    };
    for (let linkType in rawData) {
      if (edgeLabelStrategy.requires && edgeLabelStrategy.requires.has('originIndex')) {
        let linkTypeData = rawData[linkType];
        let overallCounts = linkTypeData.overall_counts;
        let targetOverallCounts = edgeLabelOptions.originIndex;
        for (let nodeId in overallCounts) {
          let nodeData = overallCounts[nodeId];
          let targetNodeData = targetOverallCounts[nodeId];
          if (!targetNodeData) {
            targetNodeData = targetOverallCounts[nodeId] = {};
          }
          for (let relationId in nodeData) {
            let relationData = nodeData[relationId];
            let targetRelationData = targetNodeData[relationId];
            if (!targetRelationData) {
              targetRelationData = targetNodeData[relationId] = [0, 0, 0, 0, 0];
            }
            for (let i=0; i<5; ++i) {
              targetRelationData[i] += relationData[i];
            }
          }
        }
        for (let relationName in linkTypeData.relation_map) {
          if (edgeLabelOptions[relationName] === undefined) {
            let relationId = linkTypeData.relation_map[relationName];
            edgeLabelOptions.relationMap[relationName] = relationId;
          }
        }
      }
    }
    return edgeLabelOptions;
  };

  /** Helper function for updateGraph. */
  GroupGraph.prototype._recreateSubgraphs = function(morphology, models) {
    var subnodes = {},
        subedges = {}; // map of {connectorID: {pre: graph node ID,
                       //                       post: {graph node ID: counts binned by confidence}}}
    // Additional edges to be inserted
    var additional = {edges: []};

    var unsplittable = [];

    Object.keys(morphology).forEach((function(skid) {
      var m = morphology[skid],
          ap = new CATMAID.ArborParser().init('compact-arbor', m),
          mode = this.subgraphs[skid],
          parts = {},
          name = CATMAID.NeuronNameService.getInstance().getName(skid),
          color = '#' + models[skid].color.getHexString(),
          common = {skeletons: [models[skid]],
                    shape: "ellipse",
                    node_count: 0,
                    color: color,
                    label_color: color},
          createNode = function(id, label, is_branch) {
            return {data: $.extend(is_branch ? {branch: true} : {}, common,
              {id: id,
               label: label,
               upstream_skids: {}, // map of skeleton ID vs number of postsynaptic relations
               downstream_skids: {}})}; // map of skeleton ID vs number of presynaptic relations
          };

      var graph = [];

      var splitDendrite = function(axon) {
        // Split dendrite further into backbone and terminal subarbors
        var backbone = ap.arbor.upstreamArbor(m[2]['microtubules end'].reduce(function(o, nodeID) { o[nodeID] = true; return o; }, {}));
        var node_dend1 = createNode(skid + '_backbone_dendrite', name + ' [backbone dendrite]'),
            node_dend2 = createNode(skid + '_dendritic_terminals', name + ' [dendritic terminals]');
        graph.push(node_dend1);
        graph.push(node_dend2);
        subnodes[node_dend1.data.id] = node_dend1;
        subnodes[node_dend2.data.id] = node_dend2;
        parts[node_dend1.data.id] = function(treenodeID) {
          return backbone.contains(treenodeID) && !axon.contains(treenodeID);
        };
        parts[node_dend2.data.id] = function(treenodeID) {
          return !backbone.contains(treenodeID) && !axon.contains(treenodeID);
        };
      };

      if (mode === this.SUBGRAPH_AXON_DENDRITE
        || mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS) {

        var axon = null;

        if (ap.n_inputs > 0 && ap.n_outputs > 0) {
          axon = SynapseClustering.prototype.findAxon(ap, 0.9, ap.positions);
        }

        if (axon) {
          // Subgraph with a node for the axon
          var node_axon = createNode(skid + '_axon', name + ' [axon]');
          graph.push(node_axon);
          parts[node_axon.data.id] = function(treenodeID) { return axon.contains(treenodeID); };
          subnodes[node_axon.data.id] = node_axon;

          // Create nodes for dendrites
          if (mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS && !m[2].hasOwnProperty('microtubules end')) {
            // Fall back
            mode = this.SUBGRAPH_AXON_DENDRITE;
          }

          if (mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS) {
            // Split dendrite further into backbone and terminal subarbors
            splitDendrite(axon);
          } else if (mode === this.SUBGRAPH_AXON_DENDRITE) {
            var node_dend = createNode(skid + '_dendrite', name + ' [dendrite]');
            graph.push(node_dend);
            subnodes[node_dend.data.id] = node_dend;
            parts[node_dend.data.id] = function(treenodeID) { return !axon.contains(treenodeID); };
          }
        } else {
          // Axon-dendrite not computable
          if (mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS && m[2].hasOwnProperty('microtubules end')) {
            splitDendrite({contains: function() { return false; }});
          } else {
            unsplittable.push(skid);
            return;
          }
        }

        for (var i=1; i<graph.length; ++i) {
          // ... connected by an undirected edge, in sequence
          additional.edges.push({data: {directed: false,
                                        arrow: 'none',
                                        id: graph[i-1].data.id + '_' + graph[i].data.id,
                                        color: common.color,
                                        label_color: common.color,
                                        source: graph[i-1].data.id,
                                        target: graph[i].data.id,
                                        weight: 10}});
        }
      } else if (mode === this.SUBGRAPH_SPLIT_AT_TAG) {
        var cuts = m[2][this.tag_text];
        if (cuts && cuts.length > 0) {
          var arbors = ap.arbor.split(cuts.reduce(function(o, node) { o[node] = true; return o; }, {})),
              keepers = {};
          // Find the arbor containing the root node
          var first;
          for (var i=0; i<arbors.length; ++i) {
            if (arbors[i].contains(ap.arbor.root)) {
              first = arbors[i];
              break;
            }
          }
          // Create node for part of the arbor containing the root node
          var first_node = createNode(skid + '_first', name + ' [' + this.tag_title_root + ']');
          keepers[first.root] = first_node.data.id;
          parts[first_node.data.id] = function(treenodeID) { return first.contains(treenodeID); };
          subnodes[first_node.data.id] = first_node;
          // Create a node for the rest of parts
          var two = 2 === arbors.length;
          for (var i=0, k=1; i<arbors.length; ++i, ++k) {
            if (first === arbors[i]) continue;
            var next = createNode(skid + '_other' + (two ? '' : k),
                                  name + ' [' + this.tag_title_others + (two ? '' : ' ' + k) + ']');
            parts[next.data.id] = (function(treenodeID) { return this.contains(treenodeID); }).bind(arbors[i]);
            subnodes[next.data.id] = next;
            keepers[arbors[i].root] = next.data.id;
          }

          // Add undirected edges
          var simple = ap.arbor.simplify(keepers);

          simple.nodesArray().forEach(function(node) {
            var paren = simple.edges[node];
            if (!paren) return; // root
            var source_id = keepers[paren],
                target_id = keepers[node];
            additional.edges.push({data: {directed: false,
                                          arrow: 'none',
                                          id: source_id + '_' + target_id,
                                          color: common.color,
                                          label_color: common.color,
                                          source: source_id,
                                          target: target_id,
                                          weight: 10}});
          });

        } else {
          CATMAID.info("No subgraph possible for '" + name + "' and tag '" + this.tag_title + "'");
        }
      } else if (mode > 0) {
        // Synapse clustering: mode is the bandwidth
        var synapse_map = ap.createSynapseMap(),
            sc = new SynapseClustering(ap.arbor, ap.positions, synapse_map, mode),
            clusters = sc.clusterMaps(sc.densityHillMap());
        var clusterIDs = Object.keys(clusters);
        // Remove clusters of treenodes that lack synapses
        var synapse_treenodes = Object.keys(synapse_map);
        clusterIDs = clusterIDs.filter(function(clusterID) {
          var treenodes = clusters[clusterID];
          for (var k=0; k<synapse_treenodes.length; ++k) {
            if (treenodes[synapse_treenodes[k]]) return true;
          }
          return false;
        });
        if (1 === clusterIDs.length) {
          // Not splittable
          unsplittable.push(skid);
          return;
        }
        // Relabel clusters (could be skipping indices and start at zero)
        clusters = clusterIDs.reduce(function(o, clusterID, i) {
          o[i+1] = clusters[clusterID];
          return o;
        }, {});
        clusterIDs = Object.keys(clusters);
        // Else, create subgraph
        var orders = ap.arbor.nodesOrderFrom(ap.arbor.root),
            roots = {},
            keepers = {};
        clusterIDs.forEach(function(clusterID) {
          var cluster_nodes_with_synapses = {};
          Object.keys(clusters[clusterID]).forEach(function(node) {
            if (synapse_map[node]) {
              cluster_nodes_with_synapses[node] = true;
            }
          });
          var common = ap.arbor.nearestCommonAncestor(cluster_nodes_with_synapses);
          roots[common] = clusterID;
          keepers[common] = true;
        });
        var simple = ap.arbor.simplify(keepers);

        simple.nodesArray().forEach(function(node) {
          // Create a node and a part
          var clusterID = roots[node],
              source_id;
          if (undefined === clusterID) {
            // Branch point
            source_id = skid + '_' + node;
            subnodes[source_id] = createNode(source_id, '', true);
          } else {
            source_id = skid + '_' + clusterID;
            parts[source_id] = function(treenodeID) { return clusters[clusterID][treenodeID]; };
            subnodes[source_id] = createNode(source_id, name + ' [' + clusterID + ']');
          }
          // Add undirected edges: one less than nodes
          var paren = simple.edges[node];
          if (!paren) return; // node is the root
          var parent_clusterID = roots[paren],
              target_id = skid + '_' + (undefined === parent_clusterID ? paren : parent_clusterID);
          additional.edges.push({data: {directed: false,
                                        arrow: 'none',
                                        id: source_id + '_' + target_id,
                                        color: common.color,
                                        label_color: common.color,
                                        source: source_id,
                                        target: target_id,
                                        weight: 10}});
        });
      }

      var findPartID = function(treenodeID) {
        var IDs = Object.keys(parts);
        for (var i=0; i<IDs.length; ++i) {
          if (parts[IDs[i]](treenodeID)) return IDs[i];
        }
        return null;
      };

      // ... and connected to all other nodes: preparing data
      // m[1] is the array of connectors as returned in json
      var upstream = {},
          downstream = {};
      m[1].forEach(function(row) {
        // Accumulate connection into the subnode for later use in e.g. grow command
        var treenodeID = row[0],
            confidence = Math.min(row[1], row[2]),
            other_skid = row[5],
            node_id = findPartID(treenodeID),
            presynaptic = 0 === row[6],
            ob = presynaptic ? downstream : upstream,
            map = ob[node_id];
        if (null === node_id) {
          console.log("Oops: could not find a partID for treenode ", treenodeID);
          return;
        }
        if (!map) {
          map = {};
          ob[node_id] = map;
        }

        var connectorID = row[2],
            connector_ids = map[other_skid];
        if (connector_ids) connector_ids.push(connectorID);
        else map[other_skid] = [connectorID]; // OK to have some connectors repeated if they connect to it more than once.

        // Stop here if the other skeleton is not in the graph
        // (The accumulated partners will be used for the grow and find path operations.)
        if (!models[other_skid]) return;

        // Accumulate synapses for an edge with another node in the graph
        var sourceSkid = presynaptic ? skid : other_skid,
            targetSkid = presynaptic ? other_skid : skid,
            node_id = findPartID(treenodeID),
            connector = subedges[connectorID];
        if (!connector) {
          connector = {pre: null,
                       post: {}};
          subedges[connectorID] = connector;
        }
        if (presynaptic) {
          connector.pre = node_id;
          if (undefined === this.subgraphs[targetSkid]) {
            var count = connector.post[targetSkid] || [0, 0, 0, 0, 0];
            count[confidence - 1] += 1;
            connector.post[targetSkid] = count;
          }
        } else {
          if (undefined === this.subgraphs[sourceSkid]) connector.pre = sourceSkid;
          var count = connector.post[node_id] || [0, 0, 0, 0, 0];
          count[confidence - 1] += 1;
          connector.post[node_id] = count;
        }
      }, this);

      // Assign partners to each subnode
      Object.keys(upstream).forEach(function(id) {
        subnodes[id].data.upstream_skids = upstream[id];
      });
      Object.keys(downstream).forEach(function(id) {
        subnodes[id].data.downstream_skids = downstream[id];
      });
    }).bind(this));

    // Add up connectors to create edges for subgraph nodes
    var cedges = {};
    Object.keys(subedges).forEach(function(connectorID) {
      var connector = subedges[connectorID],
          source_id = connector.pre,
          e = cedges[source_id];
      if (!e) {
        e = {};
        cedges[source_id] = e;
      }
      Object.keys(connector.post).forEach(function(target_id) {
        var count = e[target_id];
        e[target_id] = (count ? count : [0, 0, 0, 0, 0]).map(function (v, i) {
          return v + connector.post[target_id][i];
        });
      });
    });

    var nodes = Object.keys(subnodes).map(function(id) { return subnodes[id]; });

    var edges_raw = Object.keys(cedges).reduce(function(a, source_id) {
      var e = cedges[source_id];
      return Object.keys(e).reduce(function(a, target_id) {
        var confidence = e[target_id]; // an array
        a.push([source_id, target_id, confidence]);
        return a;
      }, a);
    }, []);

    return {nodes: nodes, // ready to be appended to elements.nodes
            edges: additional.edges, // ready to be appended to elements.edges
            edges_raw: edges_raw, // to be processed with asEdge prior to appending to elements.edges
            unsplittable_skids: unsplittable}; // to be removed from this.subgraphs and re-added as regular nodes
  };

  /** There is a model for every skeleton ID included in json.
   *  But there could be models for which there isn't a skeleton_id in json: these are disconnected nodes. */
  GroupGraph.prototype.updateGraph = function(json, models, morphology, pos = null) {

    var subgraph_skids = Object.keys(this.subgraphs);
    if (subgraph_skids.length > 0 && !morphology) {
      // Need to load skeleton + connectors of skids in subgraph_skids
      var morphologies = {};
      fetchSkeletons(
          subgraph_skids,
          (function(skid) {
            var mode = this.subgraphs[skid],
                with_tags = (mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS || mode === this.SUBGRAPH_SPLIT_AT_TAG ? 1 : 0);
            return CATMAID.makeURL(project.id + '/' + skid + '/1/1/' + with_tags + '/compact-arbor');
          }).bind(this),
          function(skid) { return {}; },
          function(skid, json) { morphologies[skid] = json; },
          (function(skid) { delete this.subgraphs[skid]; }).bind(this), // failed loading
          (function() { this.updateGraph(json, models, morphologies, positions); }).bind(this));
      return;
    }

    // A neuron that is split cannot be part of a group anymore: makes no sense.
    // Neither by confidence nor by synapse clustering.

    var getEdgeColor = this.getLinkTypeColor.bind(this);
    var edge_text_color = this.edge_text_color;
    var edgeLabelStrategy = edgeLabelStrategies[this.edge_label_strategy];
    var edgeLabelOptions = this.makeEdgeLabelOptions(json);
    var edge_confidence_threshold = this.edge_confidence_threshold;

    var asEdge = function(edge, linkTypeId) {
        var count = _filterSynapses(edge[2], edge_confidence_threshold);
        edgeLabelOptions.count = count;
        edgeLabelOptions.sourceId = edge[0];
        edgeLabelOptions.targetId = edge[1];
        edgeLabelOptions.synapses = edge[2];
        var value = edgeLabelStrategy.run(edgeLabelOptions);
        var edge_color = getEdgeColor(linkTypeId);
        return {data: {directed: true,
                       arrow: 'triangle',
                       id: edge[0] + '_' + edge[1],
                       label: value,
                       link_type: linkTypeId,
                       color: edge_color,
                       label_color: edge_text_color,
                       source: edge[0],
                       target: edge[1],
                       confidence: edge[2],
                       weight: count}};
    };

    let asSynapticEdge = function(edge) {
      return asEdge(edge, 'synaptic-connector');
    };

    var asNode = function(nodeID) {
        nodeID = nodeID + '';
        var i_ = nodeID.indexOf('_'),
            skeleton_id = -1 === i_ ? nodeID : nodeID.substring(0, i_),
            model = models[skeleton_id];
        return {data: {id: nodeID, // MUST be a string, or fails
                        skeletons: [model.clone()],
                        label: CATMAID.NeuronNameService.getInstance().getName(model.id),
                        node_count: 0,
                        shape: "ellipse",
                        color: '#' + model.color.getHexString()}};
    };

    // Infer nodes from json.edges
    var elements = {},
        nodes = [],
        appendNode = (function(skid) {
          if (undefined !== this.subgraphs[skid]) return; // will be added later
          var node = asNode('' + skid);
          nodes.push(node);
        }).bind(this);

    Object.keys(models).forEach(appendNode);

    elements.nodes = nodes;
    elements.edges = [];

    // Store positions of current nodes and their selected state
    var positions = pos || {},
        selected = {},
        hidden = {},
        locked = {},
        arrow_shapes = {};
    this.cy.nodes().each(function(i, node) {
      var id = node.id();
      positions[id] = node.position();
      if (node.selected()) selected[id] = true;
      if (node.hidden()) hidden[id] = true;
      if (node.locked()) locked[id] = true;
      var s = node.data('arrowshape');
      arrow_shapes[id] = s ? s : 'triangle';
    });

    // Store visibility and selection state of edges as well
    this.cy.edges().each(function(i, edge) {
      var id = edge.id();
      if (edge.selected()) selected[id] = true;
      if (edge.hidden()) hidden[id] = true;
    });

    // Recreate subgraphs
    if (subgraph_skids.length > 0) {
      var sg = this._recreateSubgraphs(morphology, models);

      // Append all new nodes and edges from the subgraphs
      elements.nodes = elements.nodes.concat(sg.nodes);
      elements.edges = elements.edges.concat(sg.edges);
      elements.edges = elements.edges.concat(sg.edges_raw.map(asSynapticEdge)); // Sub-graphs only respect synaptic connectors at the moment.

      // Update nodes: some couldn't be split
      sg.unsplittable_skids.forEach(function(skid) {
        delete this.subgraphs[skid];
        elements.nodes.push(asNode('' + skid));
      }, this);
    }

    // Add all other edges
    let addEdgeToGraph = (function(e, linkTypeId) {
      var n1 = e[0], n2 = e[1];
      // Skip edges that are part of subgraphs
      if (this.subgraphs[n1] || this.subgraphs[n2]) return;
      // Only allow edges that link existing models
      if (n1 in models && n2 in models) {
        elements.edges.push(asEdge(e, linkTypeId));
      }
    }).bind(this);
    let linkTypeIds = Object.keys(json);
    linkTypeIds.forEach(function(linkTypeId) {
      let linkType = json[linkTypeId];
      let linkTypeEdges = linkType.edges;
      if (!linkTypeEdges) {
        return;
      }
      for (let i=0, imax=linkTypeEdges.length; i<imax; ++i) {
        addEdgeToGraph(linkTypeEdges[i], linkTypeId);
      }
    });

    // Group neurons, if any groups exist, skipping splitted neurons
    var to_lock = this._regroup(elements, this.subgraphs, models,
        edgeLabelStrategy, edgeLabelOptions);

    // Compute edge width for rendering the edge width
    var edgeWidth = this.edgeWidthFn();

    elements.edges.forEach(function(edge) {
      edge.data.width = this.edge_min_width + edgeWidth(edge.data.weight);
    }, this);

    // Remove all nodes (and their edges)
    // (Can't just remove removed ones: very hard to get right if the value of the clustering_bandwidth changes. Additionally, their size may have changed.)
    this.cy.elements().remove();

    // Re-add them
    this.cy.add( elements );

    // Batch node property changes
    this.cy.startBatch();

    this.cy.nodes().each(function(i, node) {
      // Lock old nodes into place and restore their position
      var id = node.id();
      if (id in positions) {
        node.position(positions[id]);
        node.lock();
      }
      // Locl newly added groups made from old nodes, for which a position is set
      if (id in to_lock) {
        node.lock();
      }
      // Restore selection state
      if (id in selected) node.select();
      // Restore visibility state
      if (id in hidden) node.addClass('hidden');
      // Make branch nodes, if any, be smaller
      if (node.data('branch')) {
        node.css('height', 15);
        node.css('width', 15);
        // ... and hide their title, if any
        node.css('text-opacity', 0);
      }
    });

    var edge_threshold = this.edge_threshold;

    this.cy.edges().each(function(i, edge) {
      var id = edge.id();
      // Restore selection state
      if (id in selected) edge.select();
      // Restore visibility state
      if (id in hidden) edge.addClass('hidden');
      // Hide edge if under threshold
      if (edge.data('weight') < edge_threshold) edge.addClass('hidden');
      // Restore arrow shape
      var s = arrow_shapes[edge.source().id()];
      if (s) {
        edge.data('arrow', s);
        edge.style({'target-arrow-shape': s,
                    'target-arrow-color': edge.style('background-color')});
      }
    });

    // If hide labels, hide them
    if (!this.show_node_labels) {
      this.cy.nodes().css('text-opacity', 0);
    }

    // if text is to be short, render as short
    if (this.trim_node_labels || $('#graph_toggle_short_names').attr('checked')) {
      delete this.originalNames;
      this.toggleTrimmedNodeLabels();
    }

    this.resetState();
    this.colorBy($('#graph_color_choice' + this.widgetID)[0].value);

    this.updateEdgeGraphics(false);

    this.cy.endBatch();

    this.updateLayout(
        null,
        (function() {
          this.cy.nodes().each(function(i, node) {
            // All old nodes and newly formed groups (from old nodes) are locked
            var id = node.id();
            // Restore locked state
            if (!(id in locked)) node.unlock();
          });
        }).bind(this));
  };

  GroupGraph.prototype.toggleTrimmedNodeLabels = function() {
    if (this.originalNames) {
      this.trim_node_labels = false;
      // Restore
      var originalNames = this.originalNames;
      this.cy.nodes().each(function(i, element) {
        if (element.id() in originalNames) {
          element.data('label', originalNames[element.id()]);
        }
      });
      delete this.originalNames;
    } else {
      // Crop at semicolon
      this.trim_node_labels = true;
      this.originalNames = {};
      var originalNames = this.originalNames;
      this.cy.nodes().each(function(i, element) {
        if (element.isNode()) {
          var label = element.data().label;
          originalNames[element.id()] = label;
          var i_semicolon = label.indexOf(';');
          if (i_semicolon > 0) {
            element.data('label', label.substring(0, i_semicolon));
          }
        }
      });
    }
  };

  GroupGraph.prototype.clear = function() {
    this.groups = {};
    this.subgraphs = {};
    this.resetPathOrigins();
    this.resetSelections();
    if (this.cy) this.cy.elements("node").remove();
  };

  GroupGraph.prototype.removeSource = function () {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    if (0 === models.length) {
      CATMAID.info('Selected source is empty.');
      return;
    }
    this.removeSkeletons(Object.keys(models));
  };

  GroupGraph.prototype.removeSkeletons = function(skeleton_ids) {
    // Convert array values into object keys
    var skids = skeleton_ids.reduce(function(o, skid) {
      o[skid] = true;
      return o;
    }, {});

    var groups = this.groups;
    var subgraphs = this.subgraphs;
    let needsUpdate= false;

    // Inspect each node, remove node if all its skeletons are to be removed
    this.cy.nodes().each(function(i, node) {
      var models = node.data('skeletons'),
          removedModels = models.filter(m => skids[m.id]);
      if (removedModels.length === models.length) {
        // No models are left for this node, therefore remove node.
        node.remove();
        if (models.length > 1) {
          // Remove the corresponding group
          delete groups[node.id()];
        } else {
          // Remove the subgraph if node is split, no effect otherwise.
          delete subgraphs[models[0].id];
        }
      } else if (removedModels.length > 0 &&
          removedModels.length < models.length) {
        // At least one model remains in this node after removing the passed in
        // skeletons. Remove the deleted models from this node.
        let group = groups[node.id()];
        for (let removedModel of removedModels) {
          delete group.models[removedModel.id];
        }
        let keptModels = models.filter(m => !skids[m.id]);
        node.data('skeletons', keptModels);
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      this.update();
    }
  };

  GroupGraph.prototype.append = function(models) {
    var set = {},
        removed_from_group = 0,
        added_to_group = 0,
        subgraphs = this.subgraphs;

    var member_of = Object.keys(this.groups).reduce((function(o, gid) {
      return Object.keys(this.groups[gid].models).reduce(function(o, skid) {
        o[skid] = gid;
        return o;
      }, o);
    }).bind(this), {});

    // Determine which nodes to update, which to remove, and which to add anew
    this.cy.nodes().each(function(i, node) {
      var skeletons = node.data('skeletons'),
          one = 1 === skeletons.length;

      // Iterate a copy of the node's skeleton models
      skeletons.slice(0).forEach(function(skeleton, i) {
        var new_model = models[skeleton.id];

        // Nothing to do:
        if (!new_model) {
          // Keep the same model
          set[skeleton.id] = skeleton;
          return;
        }

        var gid = member_of[skeleton.id];
        // Update node properties
        skeleton.color = new_model.color.clone();
        // Update node name and color if the node is not part of a group
        if (gid) {
          if (gid === node.id()) {
            // The new skeleton model is part of a group (this node), and needs
            // no further updates.
            CATMAID.msg("Skeleton updated", "Skeleton #" + skeleton.id +
                " in group \"" + node.data('label') + "\" was updated");
          } else {
            CATMAID.msg("Group updated", "Skeleton #" + skeleton.id +
                " in now part of group \"" + node.data('label'));
            // Count every existing model that is added to a new group
            added_to_group += 1;
          }
        } else {
          // Update node label for singleton nodes
          if (new_model.baseName) {
            var name = CATMAID.NeuronNameService.getInstance().getName(new_model.id),
                name = name ? name : new_model.baseName,
                label = node.data('label');
            if (subgraphs[new_model.id] && label.length > 0) {
              var i_ = label.lastIndexOf(' [');
              name = name + (-1 !== i_ ? label.substring(i_) : '');
            }
            node.data('label', name);
          }
          // Update color in the case of singleton nodes
          node.data('color', '#' + skeleton.color.getHexString());
        }

        set[skeleton.id] = new_model;
      }, this);
    });

    // Update colors of undirected edges, if any
    var subs = Object.keys(this.subgraphs);
    if (subs.length > 0) {
      var colors = {};
      var to_update = subs.filter(function(skid) {
        var model = models[skid];
        if (model) {
          colors[model.id] = '#' + model.color.getHexString();
          return true;
        }
        return false;
      });

      if (to_update.length > 0) {
        this.cy.edges().each((function(i, edge) {
          var props = edge.data();
          if (props.directed) return;
          edge.data('color', colors[props.id.substring(0, props.id.indexOf('_'))]);
        }).bind(this));
      }
    }

    var additions = 0;

    Object.keys(models).forEach(function(skid) {
      if (skid in set) return;
      var model = models[skid];
      if (model.selected) {
        set[skid] = model;
        ++additions;
      }
    });

    if (0 === additions && 0 === removed_from_group && 0 === added_to_group) return; // all updating and removing done above

    this.load(set);
  };

  GroupGraph.prototype.appendAsGroup = function() {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    var nModels = Object.keys(models).length;
    if (0 === nModels) {
      CATMAID.info('Selected source is empty.');
      return;
    } else if (1 === nModels) {
      this.append(models);
      return;
    }
    this.appendGroup(models);
  };

  GroupGraph.prototype.appendGroup = function(models, position, color) {
    var f = (function (status, text) {
      if (200 !== status) return;
      var json = JSON.parse(text);
      if (json.error) return alert(json.error);

      function hasAnnotation(aid, annotation) {
        return annotation.id == aid;
      }

      // Find common annotations, if any
      var skids = Object.keys(json.skeletons);
      var common = skids.length > 0 ? json.skeletons[skids[0]] : [];
      common = common.filter(function(annotation) {
        var match = hasAnnotation.bind(window, annotation);
        return skids.reduce(function(all, skid) {
          return all && -1 !== json.skeletons[skid].some(match);
        }, true);
      }).map(function(a) { return json.annotations[a.id]; }).sort();

      // Find set of all annotations
      var all = Object.keys(skids.reduce(function(o, skid) {
        return json.skeletons[skid].reduce(function(o, annotation) {
          o[annotation.id] = true;
          return o;
        }, o);
      }, {})).map(function(aid) { return json.annotations[aid]; }).sort();

      // All neuron names, and remove skid from subgraphs as a side effect
      var names = Object.keys(models).map(function(skid) {
        // Groups and subgraphs are incompatible
        delete this.subgraphs[skid];
        return CATMAID.NeuronNameService.getInstance().getName(skid);
      }, this).sort();

      common.unshift("--");
      all.unshift("--");
      names.unshift("--");

      var options = new CATMAID.OptionsDialog("Group properties");
      options.appendMessage("Creating new group with " + (names.length - 1) + " neurons.");
      options.appendMessage("Choose a group name from:");
      options.appendMessage("(Will pick first non-empty match.)");
      options.appendChoice("Common annotations: ", "gg-common", common, common, common[0]);
      options.appendChoice("All annotations: ", "gg-all", all, all, all[0]);
      options.appendChoice("All neuron names: ", "gg-names", names, names, names[0]);
      var groupName = options.appendField("Or type a new name: ", "gg-typed", "", true);
      options.appendCheckbox("Hide intragroup edges", "gg-edges", true);
      options.appendCheckbox("Append number of neurons to name", "gg-number", true);
      var groupColorMessage = options.appendMessage("Choose group color:");
      var groupColor = color ? '#' + color.getHexString() : '#aaaaff';
      var colorButton = document.createElement('button');
      colorButton.appendChild(document.createTextNode('Color'));
      groupColorMessage.appendChild(colorButton);
      CATMAID.ColorPicker.enable(colorButton, {
        initialColor: groupColor,
        onColorChange: function(rgb, alpha, colorChanged, alphaChanged) {
          groupColor = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
              Math.round(rgb.g * 255), Math.round(rgb.b * 255));
        }
      });

      var self = this;
      options.onOK = function() {
        var label = ['typed', 'common', 'all', 'names'].reduce(function(s, tag) {
          if (s) return s;
          var text = $('#gg-' + tag).val().trim();
          if (text.length > 0 && "--" !== text) return text;
          return s;
        }, null);

        if (!label) return alert("You must choose a name!");

        if ($('#gg-number').prop('checked')) label += ' [#' + (names.length -1) + ']';

        var gid = self.nextGroupID();
        self.groups[gid] = new GroupGraph.prototype.Group(gid, models, label,
            new THREE.Color(groupColor), $('#gg-edges').prop('checked'), position);
        self.append(models); // will remove/add/group nodes as appropriate
      };

      options.show(300, 500, true);
      groupName.focus();

    }).bind(this);

    requestQueue.register(CATMAID.makeURL(project.id + "/annotations/forskeletons"), "POST",
                          {skeleton_ids: Object.keys(models)}, f);
  };

  GroupGraph.prototype.update = function() {
    var models = this.getSkeletonModels();
    this.load(models);
  };

  GroupGraph.prototype.load = function(models, positions = null) {
    // Register with name service before we attempt to load the graph
    CATMAID.NeuronNameService.getInstance().registerAll(this, models, (function() {
      this._load(models, positions);
    }).bind(this));
  };

  /** Fetch data from the database and remake the graph. */
  GroupGraph.prototype._load = function(models, positions = null) {
    var skeleton_ids = Object.keys(models);
    if (0 === skeleton_ids.length) return CATMAID.info("Nothing to load!");

    var edgeLabelStrategy = edgeLabelStrategies[this.edge_label_strategy];
    var with_overall_counts = edgeLabelStrategy.requires &&
        edgeLabelStrategy.requires.has('originIndex');

    CATMAID.fetch({
        url: project.id + "/skeletons/confidence-compartment-subgraph",
        method: "POST",
        data: {
            skeleton_ids: skeleton_ids,
            with_overall_counts: with_overall_counts,
            link_types: Array.from(this.selectedLinkTypes)
        },
        replace: true,
        id: 'graph_widget_request',
      })
      .then(json => this.updateGraph(json, models, undefined, positions))
      .catch(error => {
        if (error instanceof CATMAID.ReplacedRequestError) return;
        CATMAID.handleError(error);
      });
  };

  GroupGraph.prototype.highlight = function(skeleton_id) {
    var nodes = this.getNodes(skeleton_id),
        css = {};
    if (0 === nodes.length) return;
    nodes.each(function(i, node) {
      css[node.id()] = {w: node.css('width'),
                        h: node.css('height')};
    });
    nodes.animate({css: {width: '100px',
                         height: '100px'}},
                  {duration: 1000,
                   complete: function() { nodes.each(function(i, node) {
                     var p = css[node.id()];
                     node.css('width', p.w)
                         .css('height', p.h);
                   });}});
  };

  GroupGraph.prototype.edgeWidthFn = function() {
    return {identity: function(w) { return w; },
            sqrt: Math.sqrt,
            log10: function(w) { return Math.log(w) / Math.LN10; },
            log: Math.log}[this.edge_width_function];
  };

  GroupGraph.prototype.updateEdgeGraphics = function(batch) {
    if (!this.cy) return;

    if (batch) {
      // Update all properties at once, without intermediate rendering updates
      this.cy.startBatch();
    }

    for (let linkTypeId of this.selectedLinkTypes) {
      let linkTypeEdges = this.cy.edges().filter(function(i, edge) {
        return edge.data('link_type') == linkTypeId && edge.data('directed');
      });
      let linkTypeColor = this.getLinkTypeColor(linkTypeId);
      linkTypeEdges.css('line-color', linkTypeColor);
      linkTypeEdges.css('target-arrow-color', linkTypeColor);
      linkTypeEdges.css('opacity', this.getLinkTypeOpacity(linkTypeId));
      linkTypeEdges.data('color', linkTypeColor);
    }
    var directed = this.cy.edges().filter(function(i, edge) {
      return edge.data('directed');
    });
    directed.css('text-opacity', this.edge_text_opacity);
    directed.css('color', this.edge_text_color);

    var min = this.edge_min_width,
        labelColor = this.edge_text_color,
        edgeWidth = this.edgeWidthFn();

    // For directed edges only
    var mode = this.getEdgeColorMode();
    var arrowShapeFn = function(node) {
      var s = node.data('arrowshape');
      return s ? s : 'triangle';
    };

    this.cy.edges().each(function(i, edge) {
      if (edge.data('directed')) {
        if ("source" === mode || "target" === mode) {
          labelColor = edge[mode]().data('color'); // color of the source or target node
          edge.style({'line-color': labelColor,
                      'target-arrow-color': labelColor,
                      'target-arrow-shape': arrowShapeFn(edge.source())});
        }
        edge.data('color', labelColor);
        edge.data('label_color', labelColor);
        edge.data('width', min + edgeWidth(edge.data('weight')));
      }
    });

    if (batch) {
      this.cy.endBatch();
    }
  };

  GroupGraph.prototype.writeGML = function(linearizeIds) {
    var ids = {};
    var items = ['Creator "CATMAID"\nVersion 1.0\ngraph ['];

    this.cy.nodes(function(i, node) {
      if (node.hidden()) return;
      var props = node.data(); // props.id, props.color, props.skeletons, props.node_count, props.label,
      let exportId = linearizeIds ? i : props.id;
      ids[props.id] = exportId;
      var p = node.position(); // pos.x, pos.y
      // node name with escaped \ and "
      var name = props.label.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
      items.push(["node [",
                  "id " + exportId,
                  ["graphics [",
                   "x " + p.x,
                   "y " + p.y,
                   "w " + node.width(),
                   "h " + node.height(),
                   'fill "' + props.color + '"',
                   'type "ellipse"',
                   'outline "#000000"',
                   "outline_width 1"].join("\n      "),
                  "]",
                  'name "' + name + '"',
                  "unit_id " + props.id].join("\n    "));
      items.push("]");
    });

    this.cy.edges(function(i, edge) {
      var props = edge.data();
      var risk = props.risk ? ['risk ' + props.risk, 'label "' + props.label + '"'] : [];
      items.push(["edge [",
                  "source " + ids[props.source],
                  "target " + ids[props.target],
                  ["graphics [",
                   'type "line"',
                   "Line [",
                   "]",
                   "source_arrow 0",
                   "target_arrow " + (props.directed ? 3 : 0)].join("\n      "),
                  "]",
                  'weight ' + props.weight].concat(risk).join("\n    "));
      items.push("]");
    });

    return items.join("\n  ") + "\n]";
  };

  GroupGraph.prototype.exportGML = function() {
    if (0 === this.cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }

    // Ask for user input
    let dialog = new CATMAID.OptionsDialog('Export GML');
    dialog.appendMessage('Please check the export options.');
    var linearizeIds = dialog.appendCheckbox('Linearize IDs',
        'linearize-ids', true,
        "Replace original skeleton IDs with incremental IDs starting from zero. Some tools require this.");

    dialog.onOK = () => {
      var blob = new Blob([this.writeGML(linearizeIds.checked)], {type: "text/plain"});
      saveAs(blob, "graph.gml");
    };

    dialog.show(500, 'auto', true);
  };

  GroupGraph.prototype._getGrowParameters = function() {
    return {n_circles: Number($('#gg_n_circles_of_hell' + this.widgetID).val()),
            min_downstream: Number($('#gg_n_min_downstream' + this.widgetID).val()),
            min_upstream: Number($('#gg_n_min_upstream' + this.widgetID).val()),
            filter_regex: $('#gg_filter_regex' + this.widgetID).val()};
  };

  // Find skeletons to grow from groups or single skeleton nodes
  // and skeletons to append from subnodes
  GroupGraph.prototype._findSkeletonsToGrow = function(nodes, min_downstream, min_upstream) {
    var skids = {},
        split_partners = {},
        splits = [],
        find = function(node, min, map_name) {
          if (-1 === min) return; // none
          var map = node.data(map_name);
          if (map) {
            var partners = {};
            Object.keys(map).forEach(function(skid) {
              if (map[skid].length >= min) {
                partners[skid] = true;
                split_partners[skid] = true;
              }
            });
            splits.push([node.id(), partners, node.data('skeletons')[0].id]);
          }
        };
    nodes.each((function(i, node) {
      if (node.selected() && node.visible()) {
        node.data("skeletons").forEach(function(skeleton) {
          if (this.subgraphs[skeleton.id]) {
            find(node, min_downstream, 'downstream_skids');
            find(node, min_upstream, 'upstream_skids');
          } else {
            skids[skeleton.id] = true;
          }
        }, this);
      }
    }).bind(this));

    return {skids: skids,
            split_partners: split_partners,
            splits: splits};
  };

  GroupGraph.prototype.growGraph = function() {
    var p = this._getGrowParameters(),
        s = this._findSkeletonsToGrow(this.cy.nodes(), p.min_downstream, p.min_upstream),
        accum = $.extend({}, s.split_partners); // TODO unused?

    var grow = function(skids, n_circles, callback) {
          requestQueue.register(CATMAID.makeURL(project.id + "/graph/circlesofhell"),
              "POST",
              {skeleton_ids: skids,
               n_circles: n_circles,
               min_pre: p.min_upstream,
               min_post: p.min_downstream},
              CATMAID.jsonResponseHandler(function(json) {
                if (p.filter_regex !== '') {
                  requestQueue.register(CATMAID.makeURL(project.id + "/annotations/forskeletons"),
                      "POST",
                      {skeleton_ids: json[0]},
                      CATMAID.jsonResponseHandler(function (json) {
                        var filterRegex = new RegExp(p.filter_regex, 'i');
                        var filteredNeighbors = Object.keys(json.skeletons).filter(function (skid) {
                          return json.skeletons[skid].some(function (a) {
                            return filterRegex.test(json.annotations[a.id]);
                          });
                        });
                        callback(skids.concat(filteredNeighbors));
                      }));
                } else callback(skids.concat(json[0]));
              }));
        },
        append = (function(skids) {
          var color = new THREE.Color().setHex(0xffae56),
              models = skids.reduce(function(m, skid) {
                var model = new CATMAID.SkeletonModel(skid, "", color);
                model.selected = true;
                m[skid] = model;
                return m;
              }, {});
          this.append(models);
        }).bind(this),
        rest = function(skids, n_circles) {
          if (0 === p.n_circles -1) append(Object.keys(skids));
          else grow(Object.keys(skids), n_circles, append);
        },
        skids = Object.keys(s.skids);

    // If there are any non-split skeletons, grow these first by one, then load the rest
    if (skids.length > 0) {
      grow(skids, 1, function(ids) {
        var unique = $.extend({}, s.split_partners);
        ids.forEach(function(id) { unique[id] = true; });
        rest(unique, p.n_circles -1);
      });
    } else if (s.splits.length > 0) {
      // Otherwise directly just grow the partners of the split nodes by n_circles -1
      rest(s.split_partners, p.n_circles -1);
    } else {
      CATMAID.info("No partners found.");
    }
  };

  /** Populates variables this.path_source and this.path_target.
   * The type is one of "source" or "target". */
  GroupGraph.prototype.pickPathOrigins = function(type) {
    if (type !== 'source' && type !== 'target') return; // sanitize
    var origin = 'path_' + type;
    if (!this[origin]) this[origin] = {};
    var origins = this[origin];
    var count = Object.keys(origins).length;
    this.cy.nodes().each((function(i, node) {
      if (node.visible() && node.selected()) {
        // Collect node IDs so that groups can be evaluated dynamically
        origins[node.id()] = true;
      }
    }).bind(this));
    if (count === Object.keys(origins).length) {
      return CATMAID.info("Select one or more nodes first!");
    }
    $('#gg_path_' + type + this.widgetID).val('pick ' + type + 's (' + Object.keys(origins).length + ')');
  };

  GroupGraph.prototype.clearPathOrigins = function(type) {
    if (type !== 'source' && type !== 'target') return; // sanitize
    var origin = 'path_' + type;
    delete this[origin];
    $('#gg_path_' + type + this.widgetID).val('pick ' + type + 's');
  };

  GroupGraph.prototype.resetPathOrigins = function() {
    delete this['path_source'];
    delete this['path_target'];
  };

  GroupGraph.prototype.removeFromPathOrigins = function(nodeID) {
    ['path_source', 'path_target'].forEach(function(type) {
      if (!this[type]) return;
      delete this[type][nodeID];
      var count = Object.keys(this[type]).length;
      $('#gg_' + type + this.widgetID).val('pick ' + type.substring(5) + 's' + (count > 0 ? ' (' + count + ')' : ''));
    }, this);
  };

  GroupGraph.prototype.nodesWillChangeFor = function(skid) {
    this.getNodes(skid).each((function(i, node) {
      this.removeFromPathOrigins(node.id());
    }).bind(this));
  };

  GroupGraph.prototype.growPaths = function() {
    var types = ['source', 'target'];
    for (var i=0; i<types.length; ++i) {
      var rawType = types[i];
      var type = 'path_' + rawType;
      if (!this[type] || 0 === Object.keys(this[type]).length)  {
        return CATMAID.msg('No ' + rawType + ' for path',
            'Select ' + rawType + ' node(s) first!', {style: 'warning'});
      }
    }

    var collect = function(nodes, set, subgraphs, direction, min_synapses) {
      var skids = {},
          split_skids = {};
      nodes.each(function(i, node) {
        if (set[node.id()] && node.visible()) {
          node.data('skeletons').forEach(function(skeleton) {
            if (subgraphs[skeleton.id]) {
              var map = node.data(direction); // upstream_skids or downstream_skids
              if (map) {
                Object.keys(map).forEach(function(skid) {
                  if (map[skid].length >= min_synapses) split_skids[skid] = true;
                });
              }
            } else skids[skeleton.id] = true;
          });
        }
      });
      return {skids: skids,
              split_skids: split_skids};
    };

    var n_hops = Number($('#gg_n_hops' + this.widgetID).val()),
        min_synapses = Number($('#gg_n_min_path_synapses' + this.widgetID).val()),
        sources = collect(this.cy.nodes(), this['path_source'], this.subgraphs, 'downstream_skids', min_synapses),
        targets = collect(this.cy.nodes(), this['path_target'], this.subgraphs, 'upstream_skids', min_synapses);

    // Paths:
    // 1. skids to skids
    // 2. skids to split_skid partners with hops -1
    // 3. split_skid partners to skids with hops -1
    // 4. split_partners to split_partners with hops -2

    var new_skids = {};

    var findPaths = function(source_skids, target_skids, n_hops, process, continuation) {
      requestQueue.register(CATMAID.makeURL(project.id + "/graph/dps"), "POST",
          {sources: source_skids,
           targets: target_skids,
           n_hops: n_hops,
           min_synapses: min_synapses},
           function(status, text) {
             if (200 !== status) return;
             var json = JSON.parse(text);
             if (json.error) return alert(json.error);
             else process(json);
             continuation();
           });
    };

    var addSkids = function(json) {
      for (var i=0; i<json.length; ++i) {
        new_skids[json[i]] = true;
      }
    };

    var end = (function() {
      var all = {};
      this.cy.nodes().each(function(i, node) {
        // If any of the new skeletons is present but hidden, make it visible
        node.data('skeletons').forEach(function(skeleton) {
          if (new_skids[skeleton.id]) node.removeClass('hidden');
          all[skeleton.id] = true;
        });
      });
      // Skip skeletons that are already loaded
      var skids = Object.keys(new_skids).filter(function(skid) { return !all[skid]; });
      if (0 === skids.length) return CATMAID.info("No new paths found.");
      // Append all new
      this.append(skids.reduce(function(o, skid) {
        o[skid] = new CATMAID.SkeletonModel(skid, "", new THREE.Color().setHex(0xffae56));
        return o;
      }, {}));
    }).bind(this);

    var stepper = function(s, t, n_hops, next) {
      return function() {
        if (n_hops < 1) return next();

        var src = Object.keys(s),
            tgt = Object.keys(t);

        if (0 === src.length || 0 === tgt.length) return next();

        findPaths(src, tgt, n_hops, addSkids, next);
      };
    };

    var f4 = stepper(sources.split_skids, targets.split_skids, n_hops -2, end);
    var f3 = stepper(sources.skids,       targets.split_skids, n_hops -1, f4);
    var f2 = stepper(sources.split_skids, targets.skids,       n_hops -1, f3);
    var f1 = stepper(sources.skids,       targets.skids,       n_hops,    f2);

    f1();
  };

  GroupGraph.prototype.hideSelected = function() {
    if (!this.cy) return;
    var hidden = 0;
    this.cy.elements().each(function(i, e) {
      if (e.selected()) {
        e.addClass('hidden'); // if it's a node, hides edges too
        e.unselect();
        hidden += 1;
      }
      /* doesn't work?
      if (e.isNode()) {
        e.edges().css('text-opacity', 0); // the edge label
      }
      */
    });
    // Work-around cytoscapejs bug
    this.cy.edges().each(function(i, e) {
      if (e.hidden()) e.css('text-opacity', 0);
    });
    $('#graph_show_hidden' + this.widgetID).val('Show hidden' + (0 === hidden ? '' : ' (' + hidden + ')')).prop('disabled', false);
  };

  GroupGraph.prototype.showHidden = function() {
    if (!this.cy) return;
    this.cy.elements().removeClass('hidden');
    if (this.show_node_labels) {
      this.cy.elements().css('text-opacity', 1);
    } else {
      this.cy.edges().css('text-opacity', 0);
    }
    $('#graph_show_hidden' + this.widgetID).val('Show hidden').prop('disabled', true);
  };

  GroupGraph.prototype.removeSelected = function() {
    var nodes = this.orderedSelectedNodes();
    if (0 === nodes.length) {
      // If no node is selected explicitely, just remove the selected Cytoscape
      // element. This should usually be an edge.
      var nRemoved = 0;
      this.cy.elements().each(function(i, e) {
        if (e.selected()) {
          e.unselect();
          e.remove();
          ++nRemoved;
        }
      });
      if (0 === nRemoved) {
        alert("Select one or more nodes first!");
        return;
      }
    } else {
      var removalConfirmation = "Remove " + nodes.length + " selected node" +
          (nodes.length > 1 ? "s":"") + "?";
      if (!confirm(removalConfirmation)) {
        return;
      }
      nodes.forEach(function(node) {
        delete this.groups[node.id()]; // ok if not present
        var skid = node.data('skeletons')[0].id;
        node.remove();

        // If the node is part of a split subgraph, also remove all other nodes
        // in the subgraph.
        if (this.subgraphs.hasOwnProperty(skid)) {
          this.cy.nodes().filter(function (i, splitNode) {
            return splitNode.data('skeletons').some(function (model) {
              return model.id === skid;
            });
          }).remove();
          delete this.subgraphs[skid];
        }
      }, this);
    }
    this.deselectAll();
  };

  GroupGraph.prototype.deselectAll = function() {
    this.selection.entries = {};
    this.selection.counter = 0;
    this.cy.nodes().unselect();
  };

  GroupGraph.prototype.getState = function() {
    return this.state ? this.state : {};
  };

  GroupGraph.prototype.setState = function(key, value) {
    if (!this.state) this.state = {};
    this.state[key] = value;
  };

  GroupGraph.prototype.removeState = function(key) {
    if (this.state) delete this.state[key];
  };

  GroupGraph.prototype.resetState = function() {
    delete this.state;
  };

  GroupGraph.prototype.getSkeletonHexColors = function() {
    var colors = {};
    this.cy.nodes().each(function(i, node) {
      var color = node.data('color');
      node.data('skeletons').forEach(function(model) {
        if (!colors[model.id]) colors[model.id] = color;
      });
    });
    return colors;
  };

  /** Return an object with skeleton ID as keys and a {inputs: <total-inputs>, outputs: <total-outputs>} as values. */
  GroupGraph.prototype.getNodesIO = function() {
    var io = {};
    this.cy.nodes().each(function(i, node) {
      io[node.id()] = {inputs: 0,
                       outputs: 0};
    });
    this.cy.edges().each(function(i, edge) {
      var e = edge.data();
      if (e.directed) {
        io[e.target].inputs += e.weight;
        io[e.source].outputs += e.weight;
      }
    });
    return io;
  };

  GroupGraph.prototype._colorize = function(evt) {
    var select = evt.target;
    this.colorBy(select.value, select);
  };

  GroupGraph.prototype.colorBy = function(mode, select) {
    var current_mode = this.getState().color_mode;
    if (mode === current_mode) return;

    if ('source' === current_mode) {
      // Requested mode is not source: preserve colors for when resetting to source
      this.setState('colors', this.getSkeletonHexColors());
    }

    this.setState('color_mode', mode);

    this.cy.nodes().off({'select': this.color_circles_of_hell_upstream,
                         'unselect': this.color_circles_of_hell_upstream});
    this.cy.nodes().off({'select': this.color_circles_of_hell_downstream,
                         'unselect': this.color_circles_of_hell_downstream});

    if ('source' === mode) {
      // Color by the color given in the SkeletonModel
      var colors = this.getState().colors;
      if (!colors) {
        // Color state was not preserved. This can occur when updateGraph resets state.
        return;
      }
      this.cy.nodes().each(function(i, node) {
        node.data('color', colors[node.data('skeletons')[0]]); // use first skeleton
      });
      this.removeState('colors');

    } else if (-1 !== mode.indexOf("review")) {
      // Color by review status
      var cy = this.cy,
          postData = {skeleton_ids: this.getSkeletons()};
      // if neither user_ids nor whitelist is specified, returns the union
      if ('own-review' === mode) postData['user_ids'] = [CATMAID.session.userid];
      else if ('whitelist-review' === mode) postData['whitelist'] = true;
      requestQueue.register(CATMAID.makeURL(project.id + "/skeletons/review-status"), "POST",
          postData,
          function(status, text) {
            if (status !== 200) return;
            var json = JSON.parse(text);
            cy.nodes().each(function(i, node) {
              var skeletons = node.data("skeletons");
              // Compute average
              var percent_reviewed = skeletons.reduce(function(sum, model) {
                var counts = json[model.id];
                return sum + Math.floor(100 * counts[1] / counts[0]);
              }, 0) / skeletons.length;
              node.data('color', CATMAID.ReviewSystem.getBackgroundColor(percent_reviewed));
            });
          });

    } else if ('I/O' === mode) {
      // Color according to the number of inputs and outputs,
      // where purely output nodes are red,
      // and purely input nodes are green,
      // and mixed nodes span the hue axis from red to green, with balanced input/output nodes being yellow.
      var ios = this.getNodesIO();
      var color = new THREE.Color();
      this.cy.nodes().each(function(i, node) {
        var io = ios[node.id()];
        var hex;
        if (0 === io.inputs) {
          if (0 === io.outputs) hex = '#FFF'; // white
          else hex = '#F00'; // red
        } else if (0 === io.outputs) hex = '#0F0'; // green
        // Map between red (H:0) and green (H:0.333)
        else hex = '#' + color.setHSL((io.inputs / (io.inputs + io.outputs)) * 0.333, 1, 0.5).getHexString();
        node.data('color', hex);
      });

    } else if ('betweenness_centrality' === mode) {
      // Color according to the betweenness centrality of each node,
      // with the centrality value mapped to the range from white to red.
      // Disconnected nodes are white.
      var graph = jsnx.DiGraph();
      this.cy.edges().each(function(i, edge) {
        var d = edge.data();
        graph.add_edge(d.source, d.target, {weight: d.weight});
      });

      if (graph.number_of_nodes() > 10) $.blockUI({message: '<img src="' + STATIC_URL_JS + 'images/busy.gif" /> <span>Computing betweenness centrality for ' + graph.number_of_nodes() + ' nodes and ' + graph.number_of_edges() + ' edges.</span>'});

      try {
        var bc = jsnx.betweenness_centrality(graph, {weight: 'weight'});
        var max = Object.keys(bc).reduce(function(max, nodeID) {
          return Math.max(max, bc[nodeID]);
        }, 0);

        // Set centrality of disconnected nodes to zero
        this.cy.nodes().each(function(i, node) {
          if (!bc.hasOwnProperty(node.id())) bc[node.id()] = 0;
        });

        // Handle edge case
        if (0 === max) max = 1;

        var color = new THREE.Color();
        this.cy.nodes().each(function(i, node) {
          var c = bc[node.id()] / max;
          // Map centrality to a color between white (0) and red (1)
          node.data('color', '#' + color.setHSL(0, c, 1 - (c / 2)).getHexString());
        });
      } catch (e) {
        console.log(e, e.stack);
        CATMAID.msg('ERROR', 'Problem computing betweenness centrality');
      }
      $.unblockUI();

    } else if (0 === mode.indexOf('circles_of_hell_')) {
      var fnName = 'color_circles_of_hell_' + mode.substring(16);
      this.cy.nodes().on({'select': this[fnName],
                          'unselect': this[fnName]});
      this[fnName]();
    }

    this.updateEdgeGraphics(true);
  };

  /** upstream: true when coloring circles upstream of node. False when coloring downstream. */
  GroupGraph.prototype.colorCirclesOfHell = function(upstream) {
    // Make all nodes white when deselecting
    var selected = this.cy.nodes().toArray().filter(function(node) { return node.selected(); });
    if (1 !== selected.length) {
      if (0 !== selected.length) CATMAID.info("Need 1 (and only 1) selected node!");
      this.cy.nodes().data('color', '#fff');
      return;
    }

    var m = this.createAdjacencyMatrix(),
        circles = [],
        current = {},
        next,
        consumed = {},
        n_consumed = 1,
        n = 0,
        indices = m.ids.reduce(function(o, id, i) { o[id] = i; return o; }, {});

    current[selected[0].id()] = true;
    circles.push(current);
    consumed[selected[0].id()] = true;

    while (n_consumed < m.ids.length) {
      current = circles[circles.length -1];
      next = {};
      n = 0;
      Object.keys(current).forEach(function(id1) {
        var k = indices[id1];
        if (upstream) {
          // Upstream:
          m.AdjM.forEach(function(row, i) {
            if (0 === row[k]) return;
            var id2 = m.ids[i];
            if (consumed[id2]) return;
            next[id2] = true;
            consumed[id2] = true;
            n += 1;
          });
        } else {
          // Downstream:
          var ud = m.AdjM[k]; // Uint32Array lacks forEach
          for (var i=0; i<ud.length; ++i) {
            if (0 === ud[i]) continue; // no synapses
            var id2 = m.ids[i];
            if (consumed[id2]) continue;
            next[id2] = true;
            consumed[id2] = true;
            n += 1;
          }
        }
      });
      if (0 === n) break;
      n_consumed += n;
      circles.push(next);
    }

    var disconnected = m.ids.reduce(function(o, id) {
      if (id in consumed) return o;
      o[id] = true;
      return o;
    }, {});

    // Color selected neuron in selection green
    // Next circles are colored by a linear saturation gradient from blue 90% to green 20%
    // Color disconnected in white

    var colors = ['#b0ff72'].concat(circles.slice(1).map(function(circle, i) {
      return '#' + new THREE.Color().setHSL(0.66, 1, 0.55 + 0.45 * (i+1) / circles.length).getHexString();
    }));
    colors.push('#fff'); // white

    circles.push(disconnected);

    this.cy.nodes().each(function(i, node) {
      circles.some(function(circle, i) {
        // Use the lowest circle found
        if (node.id() in circle) {
          node.data('color', colors[i]);
          return true; // break
        }
        return false; // continue
      });
    });
  };

  /** Includes only visible nodes and edges.
   *  Split or grouped skeletons are considered as they are: many nodes or one node. */
  GroupGraph.prototype.createAdjacencyMatrix = function() {
    if (0 === this.cy.nodes().size()) {
      return {ids: [],
              skeletons: [],
              AdjM: [],
              names: []};
    }
    // Collect unique, visible node IDs
    var ids = [],
        skeletons = [],
        names = [],
        indices = {};
    this.cy.nodes().each(function(i, node) {
      if (node.hidden()) return;
      var id = node.id();
      ids.push(id);
      indices[id] = i;
      skeletons.push(node.data("skeletons"));
      names.push(node.data('label'));
    });
    var AdjM = ids.map(function() { return new Uint32Array(ids.length); });
    this.cy.edges().each(function(i, edge) {
      if (edge.hidden()) return;
      var e = edge.data();
      if (!e.directed) return; // intra-edge of a neuron split by synapse clustering
      var source = e.source,
          target = e.target;
      AdjM[indices[source]][indices[target]] = e.weight;
    });

    return {ids: ids, // list of node IDs
            AdjM: AdjM,
            skeletons: skeletons, // list of list of models
            names: names}; // list of strings
  };

  GroupGraph.prototype.exportAdjacencyMatrix = function() {
    if (0 === this.cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }

    var m = this.createAdjacencyMatrix(),
        names = m.names.map(function(name) {
          return '"' + name.replace(/\\/g, '\\\\').replace(/"/g,'\\"') + '"';
        });

    // First row and first column take the neuron names plus the #<skeleton_id>
    var csv = '"Neurons",' + names.join(',') + '\n' + m.AdjM.map(function(row, i) {
      var rowValues = "";
      var delim = "";
      for (var j=0; j<row.length; ++j) {
        rowValues += delim + row[j].toString();
        delim = ',';
      }
      return names[i] + ',' + rowValues;
    }).join('\n');

    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "adjacency_matrix.csv");
  };

  GroupGraph.prototype.showSVGOptions = function() {
    var self = this;
    var dialog = new CATMAID.OptionsDialog("SVG Export", {
      'Illustrator SVG': function() {
        self.exportSVG({
          arrowOnSeparateLine: true
        });
      },
      'Regular SVG': function() {
        self.exportSVG({
          arrowRefX: 0,
        });
      }
    });

    dialog.appendMessage("If you want to use the exported SVG file with Adobe " +
        "Illustrator, please use the respective export button below. Unfortunately, " +
        "Illustrator is not standards conformant and will not work properly with regular " +
        "SVG files. We recommend Inkscape, which works well with regular SVGs.");

    dialog.show('400', 'auto', true);
  };

  GroupGraph.prototype.generateSVG = function(options) {
    options = options || {};

    var cy = this.cy;

    // Manually create SVG for graph, which is easier than making Cytoscape.js
    var div= $('#graph_widget' + this.widgetID),
        width = div.width(),
        height = div.height(),
        extent = cy.extent(),
        viewX = extent.x1,
        viewY = extent.y1,
        viewWidth = extent.x2 - extent.x1,
        viewHeight = extent.y2 - extent.y1;

    var svg = new CATMAID.SVGFactory(width, height, viewX, viewY, viewWidth, viewHeight);

    var templateTextStyle = {
      'fill': null,
      'stroke-width': '0px',
      'font-family': 'Verdana',
      'font-size': '10'
    };

    var templateLineStyle = {
      'stroke': null,
      'stroke-width': '1px',
      'fill': 'none'
    };

    var templateShapeStyle = {
      'fill': null,
      'stroke': null,
      'stroke-width': null
    };

    var templateLineOptions = {
      'edgeType': 'haystack',
      'arrowOnSeparateLine': CATMAID.getOption(options, 'arrowOnSeparateLine', false),
      'refX': CATMAID.getOption(options, 'arrowRefX', undefined)
    };

    var renderer = cy.renderer();

    // Add all edges, for now, draw from node centers
    this.cy.edges().each(function(i, edge) {
      if (edge.hidden()) {
        return;
      }

      var style = edge.style();

      if (0 === style.opacity) {
        return;
      }

      var data = edge.data();
      var startId = data.start;

      var rscratch = edge._private.rscratch;

      templateTextStyle['fill'] = data.label_color;
      templateTextStyle['font-size'] = style['font-size'];
      templateTextStyle['opacity'] = CATMAID.tools.getDefined(style['text-opacity'], '1');
      templateLineStyle['stroke'] = style['line-color'];
      templateLineStyle['opacity'] = CATMAID.tools.getDefined(style['opacity'], '1');

      var strokeWidth = 'width' in data ? data.width : 1.0;
      templateLineStyle['stroke-width'] = strokeWidth + 'px';

      templateLineOptions['strokeWidth'] = strokeWidth;

      templateLineOptions['edgeType'] = rscratch.edgeType;
      switch (rscratch.edgeType) {
        case 'bezier':
        case 'self':
        case 'compound':
        case 'multibezier':
          templateLineOptions['controlPoints'] = rscratch.ctrlpts;
          break;
      }
      if (data.label) {
        templateLineOptions['label'] = data.label;
        templateLineOptions['labelOffsetX'] = 0;
        templateLineOptions['labelOffsetY'] = 0;
        templateLineOptions['labelStyle'] = templateTextStyle;
        templateLineOptions['labelX'] = rscratch.labelX;
        templateLineOptions['labelY'] = rscratch.labelY;
      } else {
        templateLineOptions['label'] = undefined;
      }

      // Cytoscape.js luckily keeps render locations cached, so we don't need
      // to do the math ourselves. Arrow locations are available even without
      // arrows in use.
      var x1 = rscratch.startX,
          y1 = rscratch.startY,
          x2 = rscratch.arrowEndX,
          y2 = rscratch.arrowEndY;

      // "arrow" here means "end marker"
      if (data.arrow && data.arrow !== 'none') {
        templateLineOptions['arrow'] = data.arrow;
        templateLineOptions['arrowStyle'] = templateLineStyle;

        // Since our arrows width are in a reather narrow ranger, setting the
        // arrow dimensions in absolute pixels is easier.
        var d = 3 * (0.5 * strokeWidth + 1.5);
        templateLineOptions['arrowUnit'] = 'userSpaceOnUse';
        templateLineOptions['arrowWidth'] = d;
        templateLineOptions['arrowHeight'] = d;
        templateLineOptions['refX'] = 0; // d;
        templateLineOptions['refY'] = 0; // 0.5 * d;
      } else {
        templateLineOptions['arrow'] = undefined;
      }

      svg.drawLine(x1, y1, x2, y2, templateLineStyle, templateLineOptions);
    });

    // Add all nodes to SVG
    this.cy.nodes().each(function(i, node) {
      if (node.hidden()) {
        return;
      }
      var data = node.data();
      var pos = node.position();
      var style = node.style();

      templateTextStyle['fill'] = style['color'];
      templateTextStyle['opacity'] = CATMAID.tools.getDefined(style['text-opacity'], '1');
      templateShapeStyle['fill'] = style['background-color'];
      templateShapeStyle['stroke'] = style['border-color'];
      templateShapeStyle['stroke-width'] = style['border-width'];
      templateShapeStyle['opacity'] = CATMAID.tools.getDefined(style['opacity'], '1');

      // Determine label position and style
      var valign = style["text-valign"];
      var halign = style["text-halign"];
      var w = node.width();
      var h = node.height();
      var labelHeight = node._private.rstyle.labelHeight;
      // Label position relative to node position
      var dx = 0;
      var dy = 0;
      if      ("center" === halign) { dx = 0;          templateTextStyle["text-anchor"] = "middle"; }
      else if ("right"  === halign) { dx =   w/2 + 1;  templateTextStyle["text-anchor"] = "start";  }
      else if ("left"   === halign) { dx = -(w/2 + 1); templateTextStyle["text-anchor"] = "end";   }
      if      ("center" === valign) { dy = labelHeight/3; }
      else if ("bottom" === valign) { dy =   h/2 + 1 + labelHeight; }
      else if ("top"    === valign) { dy = -(h/2 + 1);  }

      if (data.shape === 'ellipse') {
        var r = node.width() / 2.0;
        svg.drawLabeledCircle(pos.x, pos.y, r, templateShapeStyle,
            data.label, dx, dy, templateTextStyle);
      } else if (data.shape in renderer.nodeShapes) {
        var w = node.width();
        var h = node.height();
        var shape = renderer.nodeShapes[data.shape].points;
        svg.drawLabeledPolygonPath(pos.x, pos.y, w, h, shape,
           templateShapeStyle, data.label, dx, dy, templateTextStyle);
      } else {
        CATMAID.warn('Could not export graph element. Unknown shape: ' + data.shape);
      }
    });

    return svg;
  };

  GroupGraph.prototype.exportSVG = function() {
    if (0 === this.cy.nodes().size()) {
      CATMAID.warn("Load a graph first!");
      return;
    }

    var svg = this.generateSVG();
    svg.save("graph-" + this.widgetID + ".svg");
  };

  /**
   * Open the currently loaded neurons and groups in a connectivity matrix
   * widget, optionally including only selected nodes.
   */
  GroupGraph.prototype.openConnectivityMatrix = function(onlySelected) {
    if (0 === this.cy.nodes().size()) {
      CATMAID.warn("Please select at least one node");
      return;
    }

    // Optionally, use only selected nodes
    var nodes = this.cy.nodes();
    if (onlySelected) {
      nodes = nodes.filter(function(i, node) {
        return node.selected();
      });
      if (0 === nodes.size()) {
        CATMAID.warn("Please select at least one node");
        return;
      }
    }

    // Collect groups and single nodes
    var self = this;
    var models = nodes.toArray().reduce((function(o, node) {
      var group = self.groups[node.id()];
      if (group) {
        o.groups[group.label] = group.models;
      } else {
        node.data('skeletons').reduce(function(t, model) {
          t[model.id] = model;
          return t;
        }, o.single);
      }

      return o;
    }).bind(this), {
      'groups': {},
      'single': {}
    });

    // Initialize new connectivity matrix with groups and single models
    var cm = new CATMAID.ConnectivityMatrixWidget();
    for (var g in models.groups) {
      cm.rowDimension.appendAsGroup(models.groups[g], g);
      cm.colDimension.appendAsGroup(models.groups[g], g);
    }
    cm.rowDimension.append(models.single);
    cm.colDimension.append(models.single);

    // Create UI for widget and display it
    WindowMaker.create('connectivity-matrix', cm, true);
  };

  GroupGraph.prototype.openPlot = function() {
    if (0 === this.cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }
    WindowMaker.create('circuit-graph-plot');
    var GP = CATMAID.CircuitGraphPlot.prototype.getLastInstance(),
        m = this.createAdjacencyMatrix();
    GP.plot(m.ids, m.names, m.skeletons, m.AdjM);
  };

  GroupGraph.prototype.resize = function() {
    if (this.cy) {
      // Schedule a re-layout without changing the node position after 100ms and
      // override it automatically if resizing isn't finished, yet.
      if (this.relayoutTimeout) {
        clearTimeout(this.relayoutTimeout);
      }
      this.relayoutTimeout = setTimeout((function() {
        // Invalidate dimensions of cytoscape canvases
        this.cy.resize();
        // Update the layout accordingly
        var options = {
          name: 'preset',
          fit: false,
        };
        this.cy.layout( options );
      }).bind(this), 100);
    }
  };

  GroupGraph.prototype.resetGroups = function() {
    this.groups = {};
  };

  GroupGraph.prototype.Group = function(gid, models, label, color, hide_self_edges, initial_position) {
    this.id = gid;
    this.label = label;
    this.models = models; // skeleton id vs model
    this.color = color;
    this.hide_self_edges = hide_self_edges;
    this.initial_position = initial_position; // will be deleted after adding the group for the first time
  };

  /**
   * Returns array of CATMAID.SkeletonGroup instances
   * Implements duck-typing interface SkeletonGroupSource
   */
  GroupGraph.prototype.getGroups = function() {
    return Object.keys(this.groups).map(function(gid) {
      var group = this.groups[gid];
      return new CATMAID.SkeletonGroup(group.models, group.label, group.color).clone(); // deep clone
    }, this);
  };

  /**
   * Returns array of CATMAID.SkeletonGroup instances, one for each selected node
   * (a node is a group of at least one skeleton ID).
   * Implements duck-typing interface SkeletonGroupSource
   */
  GroupGraph.prototype.getSelectedGroups = function() {
    var groups = [];
    this.cy.nodes().each(function(i, node) {
      if (node.selected()) {
        var data = node.data();
        var models = data.skeletons.reduce(function(o, model) { o[model.id] = model.clone(); return o; }, {});
        groups.push(new CATMAID.SkeletonGroup(models, data.label, new THREE.Color(data.color)));
      }
    });
    return groups;
  };

  var addToConfidenceList = function(target, diff) {
    for (let i=0, imax=target.length; i<imax; ++i) {
      target[i] += diff[i];
    }
    return target;
  };

  /** Reformat in place the data object, to:
   * 1) Group some of the nodes if any groups exist.
   * 2) Exclude from existing groups any splitted neurons, removing them from the group.
   *
   * Arguments:
   *
   * - data: the datastructure with nodes and edges required by cytoscapejs,
   * with two top-level entries "nodes" and "edges", each consisting of an array
   * of {data: {...}} objects.
   *
   * - splitted: an object of nodeID vs {data: {...}}, containing future nodes for skeletons that have been splitted up by synapse clustering or at low-confidence edges.
   *
   * - models: one for every skeleton_id in data.
   */
  GroupGraph.prototype._regroup = function(data, splitted, models,
      edgeLabelStrategy, edgeLabelOptions) {
    // Remove splitted neurons from existing groups when necessary,
    // construct member_of: a map of skeleton ID vs group ID,
    // and reset the group's nodes list.
    var member_of = {};

    var groupIDs = Object.keys(this.groups).filter(function(gid) {
      var group = this.groups[gid],
          gmodels = group.models;

      var n_models = Object.keys(gmodels).reduce(function(c, skid) {
        if (skid in splitted) {
          // Remove from the group
          delete gmodels[skid];
          return c;
        }
        member_of[skid] = gid;
        return c + 1;
      }, 0);

      if (0 === n_models) {
        // Remove empty group
        delete this.groups[gid];
        return false;
      }

      return true;
    }, this);

    if (0 === groupIDs.length) return {};

    // Remove nodes that have been assigned to groups
    data.nodes = data.nodes.filter(function(node) {
      return !member_of[node.data.id];
    });

    var to_lock = {};

    // Create one node for each group
    var gnodes = groupIDs.map(function(gid) {
      var group = this.groups[gid];
      var gnode = {data: {id: gid,
                     skeletons: Object.keys(group.models).map(function(skid) { return group.models[skid];}),
                     label: group.label,
                     color: '#' + group.color.getHexString(),
                     shape: 'hexagon'}};
      if (undefined !== group.initial_position) {
        gnode.position = group.initial_position;
        delete group.initial_position;
        to_lock[gid] = true;
      }
      return gnode;
    }, this);

    // map of edge_id vs edge, involving groups
    var gedges = {};
    // Pre and post ID are needed if the edge label strategy requires an origin
    // index.
    var createOriginIndex = edgeLabelStrategy.requires &&
        edgeLabelStrategy.requires.has('originIndex');

    // A new origin index that includes groups is created. This is needed to
    // calculate new labels for the group edges.
    var originalOriginIndex = edgeLabelOptions.originIndex;
    if (createOriginIndex) {
      let preId = edgeLabelOptions.relationMap['presynaptic_to'];
      let postId = edgeLabelOptions.relationMap['postsynaptic_to'];
      let groupOriginIndex = $.extend(true, {}, originalOriginIndex);
      let seenGroupNodes = new Set();
      data.edges.forEach(function(edge) {
        var d = edge.data,
            source = member_of[d.source],
            target = member_of[d.target],
            sourceInGroup = source !== undefined,
            targetInGroup = target !== undefined,
            intragroup = source === target && sourceInGroup && targetInGroup;
        if (sourceInGroup || targetInGroup) {
          source = source ? source : d.source;
          target = target ? target : d.target;

          // If the source node has not been seen yet, add its overall counts.
          var nodesToAdd = [];
          if (sourceInGroup && !seenGroupNodes.has(d.source)) {
            nodesToAdd.push([d.source, source]);
            seenGroupNodes.add(d.source);
          }
          if (targetInGroup && !seenGroupNodes.has(d.target)) {
            nodesToAdd.push([d.target, target]);
            seenGroupNodes.add(d.target);
          }
          for (let i=0; i<nodesToAdd.length; ++i) {
            var nodeToAdd = nodesToAdd[i][0];
            var groupId = nodesToAdd[i][1];
            var groupOriginCount = groupOriginIndex[groupId];
            var preCount, postCount;
            if (groupOriginCount === undefined) {
              groupOriginCount = groupOriginIndex[groupId] = {};
              preCount = groupOriginCount[preId] = [0,0,0,0,0];
              postCount = groupOriginCount[postId] = [0,0,0,0,0];
            } else {
              preCount = groupOriginCount[preId];
              postCount = groupOriginCount[postId];
            }
            var nodeCount = originalOriginIndex[nodeToAdd];
            if (nodeCount[preId]) {
              addToConfidenceList(preCount, nodeCount[preId]);
            }
            if (nodeCount[postId]) {
              addToConfidenceList(postCount, nodeCount[postId]);
            }
          }
        }
      }, this);

      // Override non-group origin index, reset it after label processing.
      edgeLabelOptions.originIndex = groupOriginIndex;
    }

    // Remove edges from grouped nodes, and reassign them to new edges involving
    // groups.
    var groupEdges = [];
    data.edges = data.edges.filter(function(edge) {
      var d = edge.data,
          source = member_of[d.source],
          target = member_of[d.target],
          sourceInGroup = source !== undefined,
          targetInGroup = target !== undefined,
          intragroup = source === target && sourceInGroup && targetInGroup;
      if (sourceInGroup || targetInGroup) {
        source = source ? source : d.source;
        target = target ? target : d.target;
        // Edge between skeletons, with at least one of them belonging to a group
        var id = source + '_' + target;
        var gedge = gedges[id];
        if (gedge) {
          // Just append the synapse count to the already existing edge
          addToConfidenceList(gedge.data.confidence, d.confidence);
        } else {
          // Don't show self-edge if desired
          if (intragroup && this.groups[source].hide_self_edges) return false;
          // Reuse edge
          d.id = id;
          // Ensure both are strings, fixes issue with edges not curving out (to
          // avoid overlap) in reciprocal connections involving a group.
          d.source = source + "";
          d.target = target + "";
          gedges[id] = edge;
          groupEdges.push(edge);
        }
        return false;
      }

      // Keep only edges among ungrouped nodes
      return true;
    }, this);

    // Assign new labels to loaded group edges.
    var edgeConfidenceThreshold = edgeLabelStrategy.edge_confidence_threshold;
    groupEdges.forEach(function(edge) {
      let d = edge.data;
      let synapses = d.confidence;
      let count = _filterSynapses(synapses, edgeConfidenceThreshold);

      // Prepare options for current edge, group based index is already set
      // above.
      edgeLabelOptions.count = count;
      edgeLabelOptions.sourceId = d.source;
      edgeLabelOptions.targetId = d.target;
      edgeLabelOptions.synapses = synapses;

      d.weight = count;
      d.label = edgeLabelStrategy.run(edgeLabelOptions);
    });

    // Reset label option origin index
    if (createOriginIndex) {
      edgeLabelOptions.originIndex = originalOriginIndex;
    }

    data.nodes = data.nodes.concat(gnodes);
    data.edges = data.edges.concat(Object.keys(gedges).map(function(gid) { return gedges[gid]; }));

    return to_lock;
  };

  /** Group selected nodes into a single node. */
  GroupGraph.prototype.group = function() {
    var position;
    var color;
    var models = this.cy.nodes().filter(function(i, node) {
      return node.selected();
    }).toArray().reduce((function(o, node) {
      // Side effect 1: remove node from this.groups if it was one
      if (undefined !== this.groups[node.id()]) delete this.groups[node.id()];
      // Side effect 2: add up position coordinates
      var p = node.position();
      if (!position) {
        position = {x: p.x, y: p.y};
        color = new THREE.Color(node.data("color"));
      }
      else {
        position.x += p.x;
        position.y += p.y;
        color.add(new THREE.Color(node.data("color")));
      }
      return node.data('skeletons').reduce(function(o, model) {
        o[model.id] = model;
        return o;
      }, o);
    }).bind(this), {});
    var n_nodes = Object.keys(models).length;
    if (n_nodes > 1) {
      position.x /= n_nodes;
      position.y /= n_nodes;
      color.r /= n_nodes;
      color.g /= n_nodes;
      color.b /= n_nodes;
      this.appendGroup(models, position, color);
    }
    else CATMAID.info("Select at least 2 nodes!");
  };

  /** Split nodes representing groups into their constituent nodes, one per skeleton. */
  GroupGraph.prototype.ungroup = function() {
    var groups = this.groups;
    var count = 0;
    this.cy.nodes().each(function(i, node) {
      let group = groups[node.id()];
      if (node.selected() && group) {
        delete groups[node.id()];
        count += 1;
      }
    });
    if (count > 0) this.update();
    else CATMAID.info("Nothing to ungroup!");
  };

  /** Iterate over all visible directed edges
   * and invoke the function fn with the edge and its data
   * as arguments.
   */
  GroupGraph.prototype.iterateEdges = function(fn) {
    this.cy.edges().each(function(i, edge) {
      if (edge.hidden()) return;
      var e = edge.data();
      if (!e.directed) return; // intra-edge of a neuron split by synapse clustering
      fn(edge, e);
    });
  };

  /** Annotate the data of each edge with a risk value between 0 (none) and 1 (highest risk).
   * Autapses have by definition a risk of 1.
   * The edge label is appended with the risk value, intrepreted as MIN, MAX or a numeric value, in square brackets. */
  GroupGraph.prototype.annotateEdgeRisk = function() {
    // Reverse edges from target to source
    var edges = {},
        autapses = false;

    // Find selected edges if any, defined as:
    // 1. The edge itself being selected
    // 2. Both the source and target nodes being selected
    this.iterateEdges((function(edge, data) {
      // Can't be part of a group
      if (this.groups[data.source] || this.groups[data.target]) return;
      if (edge.selected() || (edge.source().selected() && edge.target().selected())) {
        // Label autapses with maximum risk
        if (data.source === data.target) {
          edge.data('label', data.weight + ' [MAX]');
          autapses = true;
          return;
        }
        var a = edges[data.target];
        if (a) a.push(edge);
        else edges[data.target] = [edge];
      }
    }.bind(this)));

    // TODO handle split nodes

    var targets = Object.keys(edges);

    if (0 === targets.length) {
      if (!autapses) CATMAID.info("Select at least 2 connected nodes, that are not groups!");
      return;
    }

    // Fetch locations of input synapses for each target
    var inputs = {};

    fetchSkeletons(
        targets,
        function(skid) {
          return CATMAID.makeURL(project.id + '/connector/list/one_to_many');
        },
        function(target) {
          return {skid: target,
                  skids: edges[target].map(function(edge) { return edge.data('source'); }),
                  relation: 'postsynaptic_to'};
        },
        function(skid, json) {
          inputs[skid] = json;
        },
        function(skid) {
          // Failed to load
          delete edges[skid];
        },
        function() {
          GroupGraph.prototype.computeRisk(
            edges,
            inputs,
            function(risks) {
              risks.forEach(function(pair) {
                var edge = pair[0],
                    risk = pair[1],
                    label = Number(risk).toFixed(2);
                edge.data('risk', risk);
                if ('0.00' === label) label = 'MIN';
                else if ('1.00' === label) label = 'MAX';
                edge.data('label', edge.data('weight') + ' [' + label + ']');
              });
            });
        });
  };


  /** Compute the risk for subset of edges, by estimating, for each edge,
   * what fraction of the synapses of the target arbor would be removed
   * if the subtree starting at the lowest common ancestor node of the synapses
   * in the edge was to be cut off from the arbor.
   * Risk is a value between 0 and 1.
   * edges: a map of edge.target keys vs array of edge.
   * inputs: a map of edge.target vs connector data as obtained from /connector/list/one_to_many.
   * Invokes callback with one parameter: an array of [edge, risk] pairs. */
  GroupGraph.prototype.computeRisk = function(edges, inputs, callback) {
    var risks = [];

    fetchSkeletons(
        Object.keys(edges), // targets could have changed if some failed to load
        function(skid) {
          return CATMAID.makeURL(project.id + '/' + skid + '/1/1/0/compact-arbor');
        },
        function(skid) {
          return {}; // POST
        },
        function(target, json) {
          var connectors = inputs[target];

          if (0 === connectors.length) {
            // edge(s) disappeared from database
            CATMAID.info('Could not find edges for skeleton #' + target);
            return;
          }

          var ap = new CATMAID.ArborParser().init('compact-arbor', json);

          if (0 === ap.n_inputs) {
            // Database changed
            CATMAID.info('Skeleton #' + target + ' no longer has any input synapses');
            return;
          }

          // Reroot arbor at highest centrality node closest to the root
          // but only if possible:
          if (ap.n_outputs > 0) {
            var fc = ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs),
                nodes = Object.keys(fc),
                max = nodes.reduce(function(o, node) {
                  var m = fc[node].centrifugal;
                  if (o.max < m) {
                    o.max = m;
                    o.node = node;
                  }
                  return o;
                }, {max: 0, node: null}),
                node = max.node,
                child = node;

            while (fc[node] === max.max) {
              child = node;
              node = ap.arbor.edges[node]; // its parent
            }

            ap.arbor.reroot(child);
          }

          // For each source
          edges[target].forEach(function(edge) {
            var source = parseInt(edge.data('source'), 10);

            // Find out how many total synapses are thrown away
            // when cutting the arbor at the synapses that make up
            // the edge between source and target.
            var edge_synapses = connectors.reduce(function(o, row) {
              // 2: treenode ID receiving the input
              // 8: skeleton ID of the partner arbor
              if (row[8] === source) o[row[2]] = true;
              return o;
            }, {});

            if (0 === Object.keys(edge_synapses).length) {
              // Database changed
              CATMAID.info('Skeleton #' + target + ' no longer receives inputs from skeleton #' + source);
              return;
            }

            var lca = ap.arbor.nearestCommonAncestor(edge_synapses),
                sub_nodes = ap.arbor.subArbor(lca).nodes(),
                lost_inputs = Object.keys(ap.inputs).reduce(function(sum, node) {
                  return undefined === sub_nodes[node] ? sum : sum + ap.inputs[node];
                }, 0),
                risk = 1 - lost_inputs / ap.n_inputs;

            risks.push([edge, risk]);
          });
        },
        function(skid) {
          // Failed loading: will be handled by fetchSkeletons
        },
        function() {
          // DONE
          callback(risks);
        });
  };

  GroupGraph.prototype.orderedSelectedNodes = function() {
    var entries = this.selection.entries;
    return Object.keys(entries).map(function(id) { return entries[id]; })
      .sort(function(a, b) {
        return a.order < b.order ? -1 : 1;
      })
      .map(function(a) { return a.node; });
  };

  GroupGraph.prototype.whenMinSelected = function(min, fn) {
    var sel = this.orderedSelectedNodes();
    if (sel.length < min) return alert("Please select more than one node.");
    fn(sel);
  };

  /** Make the given axis coordinate of all selected nodes
   * be that of the first selected node.
   * Axis must be 'x' or 'y'. */
  GroupGraph.prototype.equalizeCoordinate = function(axis) {
    if ('x' !== axis && 'y' !== axis) return alert("Invalid axis: " + axis);
    this.whenMinSelected(2, function(nodes) {
      var value = nodes[0].position(axis);
      for (var i=1; i<nodes.length; ++i) {
        nodes[i].position(axis, value);
      }
    });
  };

  GroupGraph.prototype.distributeCoordinate = function(axis) {
    if ('x' !== axis && 'y' !== axis) return alert("Invalid axis: " + axis);
    this.whenMinSelected(3, function(nodes) {
      var sorted = nodes.sort(function(a, b) {
        var ca = a.position(axis),
            cb = b.position(axis);
        return ca < cb ? -1 : 1;
      }),
          span = nodes[nodes.length - 1].position(axis) - nodes[0].position(axis),
          offset = nodes[0].position(axis);
      for (var i=1, l=nodes.length -1; i<l; ++i) {
        nodes[i].position(axis, offset + i * (span / l));
      }
    });
  };

  GroupGraph.prototype.quantificationDialog = function() {
    var n_synapses = 0,
        n_edges = 0;
    this.cy.edges().each(function(i, edge) {
      if (edge.data('directed')) {
        n_synapses += edge.data('weight');
        n_edges += 1;
      }
    });
    var dialog = document.createElement('div');
    dialog.setAttribute("title", "Graph Quantification");
    var table = document.createElement('table');
    table.style.border = 1;
    table.innerHTML = [
      ["Number of nodes:", this.cy.nodes().length, "(includes splits)"],
      ["Number of edges:", n_edges, "(only directed edges)"],
      ["Number of neurons:", this.getSkeletons().length, ""],
      ["Number of in-graph synapses:", n_synapses, "(edges times their synapse count)"],
    ].map(function(row) {
      return "<tr>" + row.map(function(cell) { return "<td>" + cell + "</td>"; }).join('') + "</tr>";
    }).join('');
    dialog.appendChild(table);
    $(dialog).dialog({
      height: 400,
      modal: true,
      buttons: {
        "OK": function() {
          $(this).dialog("close");
        }
      }
    });
  };

  GroupGraph.prototype.split = function(mode) {
    var sel = this.getSelectedSkeletons();
    if (0 === sel.length) return CATMAID.info("Select one or more nodes first!");
    sel.forEach(function(skid) {
      if (undefined === mode) delete this.subgraphs[skid];
      else {
        this.subgraphs[skid] = mode;
        this.nodesWillChangeFor(skid);
      }
    }, this);
    this.update();
  };

  GroupGraph.prototype.splitAxonAndDendrite = function() {
    this.split(this.SUBGRAPH_AXON_DENDRITE);
  };

  GroupGraph.prototype.splitAxonAndTwoPartDendrite = function() {
    this.split(this.SUBGRAPH_AXON_BACKBONE_TERMINALS);
  };

  GroupGraph.prototype.splitBySynapseClustering = function() {
    var skids = this.getSelectedSkeletons(),
        bandwidth = 5000;
    for (var i=0; i<skids.length; ++i) {
      var p = this.subgraphs[skids[i]];
      if (p && p > 0) {
        bandwidth = p;
        break;
      }
    }
    var new_bandwidth = prompt("Synapse clustering bandwidth", bandwidth);
    if (new_bandwidth) {
      try {
        new_bandwidth = Number(new_bandwidth);
        if (Number.NaN === new_bandwidth) throw ("Invalid bandwidth " + new_bandwidth);
        this.split(new_bandwidth);
      } catch (e) {
        alert("Invalid bandwidth: " + new_bandwidth + "\n" + e);
        console.log(e);
      }
    }
  };

  GroupGraph.prototype.splitByTag = function() {
    if (0 === this.getSelectedSkeletons().length) return this.split(); // will show message
    var dialog = new CATMAID.OptionsDialog("Split at tag"),
        input = dialog.appendField("Tag (exact match): ", "tag_text", this.tag_text),
        first = dialog.appendField("Part with root node: ", "root_text", this.tag_title_root),
        rest = dialog.appendField("Other(s): ", "other_text", this.tag_title_others);
    dialog.onOK = (function() {
      this.tag_text = input.value;
      this.tag_title_root = first.value;
      this.tag_title_others = rest.value;
      this.split(this.SUBGRAPH_SPLIT_AT_TAG);
    }).bind(this);
    dialog.show(300, 300, true);
  };

  GroupGraph.prototype.unsplit = function() {
    this.split(); // without argument
  };

  /** Copies all except the selection state. */
  GroupGraph.prototype.cloneWidget = function() {
    var copy = WindowMaker.create('graph-widget').widget;
    if (this.state) copy.state = $.extend(true, {}, this.state);
    copy.setContent(this.copyContent());
  };

  GroupGraph.prototype.setContent = function(p) {
    $.extend(this, p.properties);
    this.groups = p.groups;
    this.subgraphs = p.subgraphs;
    this.cy.ready(function() {
      this.add(p.elements);
      this.layout(p.layout);
    });
  };

  GroupGraph.prototype.copyContent = function() {
    var properties = {};
    ['label_valign',
     'label_halign',
     'show_node_labels',
     'trim_node_labels',
     'node_width',
     'node_height',
     'edge_color',
     'edge_opacity',
     'edge_text_color',
     'edge_text_opacity',
     'edge_min_width',
     'edge_width_function',
     'grid_snap',
     'grid_side'
    ].forEach(function(key) {
      properties[key] = this[key];
    }, this);

    var layout = {
      name: 'preset',
      positions: this.cy.nodes().toArray().reduce(function(p, node) { p[node.id()] = node.position(); return p; }, {}),
      fit: false,
      zoom: this.cy.zoom(),
      pan: this.cy.pan()
    };

    var copier = function(elem) {
      return {
        data: $.extend(true, {}, elem.data()),
        classes: elem.hidden() ? 'hidden' : ''
      };
    };

    return {
      properties: properties,
      elements: {nodes: this.cy.nodes().toArray().map(copier),
                 edges: this.cy.edges().toArray().map(copier)},
      groups: this.groups,
      subgraphs: this.subgraphs,
      layout: layout
    };
  };

  GroupGraph.prototype.saveJSON = function() {
    var filename = prompt("File name", "graph" + this.widgetID + ".json");
    if (!filename) return;
    saveAs(new Blob([JSON.stringify(this.copyContent())], {type: 'text/plain'}), filename);
  };

  GroupGraph.prototype.loadFromFile = function(files) {
    try {
      if (0 === files.length) throw new CATMAID.Error("Choose at least one file!");
      if (files.length > 1) throw new CATMAID.Error("Choose only one file!");

      let file = files[0];
      let nameComponents = file.name.split('.');
      if (nameComponents.length === 1) {
        throw new CATMAID.ValueError("A file extension is needed");
      }
      let extension = nameComponents[nameComponents.length - 1];
      let supportedExtensions = ['json', 'graphml'];
      if (supportedExtensions.indexOf(extension) === -1) {
        throw new CATMAID.ValueError("Unsupported file type: " + extension);
      }

      var reader = new FileReader();
      reader.onload = (e) => {
        try {
          let data = e.target.result;
          if (extension === 'json') {
            this.loadFromJSON(data);
          } else if (extension === 'graphml') {
            this.loadFromGraphML(data);
          }
        } catch (error) {
          CATMAID.error("Failed to parse file", error);
        }
      };
      reader.readAsText(file);
    } catch (e) {
      CATMAID.handleError(e);
    }
  };

  GroupGraph.prototype.loadFromJSON = function(jsonData) {
    var json = JSON.parse(jsonData);
    var skids = {};
    var asModel = function(ob) {
      skids[ob.id] = true;
      var color = CATMAID.tools.getColor(ob.color);
      return $.extend(new CATMAID.SkeletonModel(ob.id, ob.baseName, color), ob, {color: color});
    };
    // Replace JSON of models with proper SkeletonModel instances
    json.elements.nodes.forEach(function(node) {
      node.data.skeletons = node.data.skeletons.map(asModel);
    });
    // Replace group colors with proper THREE.Color instances
    // and group models with proper SkeletonModel instances
    Object.keys(json.groups).forEach(function(gid) {
      var g = json.groups[gid];
      g.color = CATMAID.tools.getColor(g.color);
      Object.keys(g.models).forEach(function(skid) {
        g.models[skid] = asModel(g.models[skid]);
      });
    });
    // Add label color information if it is missing
    if (!json.properties.edge_text_color) {
      json.properties.edge_text_color = json.properties.edge_color;
    }
    json.elements.edges.forEach(function(edge) {
      if (!edge.data.label_color) {
        edge.data.label_color = edge.data.color;
      }
    });
    this.clear();
    this.setContent(json);
    // Find out which ones exist
    requestQueue.register(CATMAID.makeURL(project.id + '/skeleton/neuronnames'), "POST",
        {skids: Object.keys(skids)},
        (function(status, text) {
          if (200 !== status) return;
          var json = JSON.parse(text);
          if (json.error) return alert(json.error);
          var missing = Object.keys(skids).filter(function(skid) {
            return undefined === json[skid];
          });
          if (missing.length > 0) {
            this.removeSkeletons(missing);
            CATMAID.warn("Did NOT load " + missing.length + " missing skeleton" + (1 === missing.length ? "" : "s"));
          }
          this.update(); // removes missing ones (but doesn't) and regenerate the data for subgraph nodes
        }).bind(this));
  };

  GroupGraph.prototype.loadFromGraphML = function(xmlData) {
    let preferUnitId = true, preferName = true, invertY = true;

    let dialog = new CATMAID.OptionsDialog('Import GraphML');
    dialog.appendMessage('Please check the import options.');
    var preferUnitIdControl = dialog.appendCheckbox('Prefer "unit_id" field for ID',
        'prefer-unit-id', preferUnitId,
        'If imported nodes have a "unit_id" field, prefer it over the regular "id" field.');
    var preferNameControl = dialog.appendCheckbox('Prefer "unit_id" field for name',
        'prefer-name', preferName,
        'If imported nodes have a "name" field, prefer it over the regular "label" field.');
    var invertYControl = dialog.appendCheckbox('Invert Y coorindates',
        'invert-y', preferName,
        'Mirror all Y coordinates to switch between left-handed and right-handed coordinates.');

    dialog.onOK = () => {
      this.loadFromGraphMLData(xmlData, preferUnitIdControl.checked,
        preferNameControl.checked, invertYControl.checked);
    };

    dialog.show(500, 'auto', true);
  };

  /**
   * Import graph data from an XML string following the GraphML schema.
   *
   * This is a simple example fo such a format:
   *
   * <?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns">
   * <graph edgedefault="undirected">
   * <node id="MNhead_l">
   * <data key="label">MNhead_l</data>
   * <data key="eigencentrality">0.002632824571430125</data>
   * <data key="modularity_class">0</data>
   * <data key="size">10.0</data>
   * <data key="r">192</data>
   * <data key="g">192</data>
   * <data key="b">192</data>
   * <data key="x">-246.87581</data>
   * <data key="y">304.34338</data>
   * </node>
   * <node id="MUSlong_headvl_3">
   * <data key="label">MUSlong_headvl_3</data>
   * <data key="eigencentrality">0.05049855646879798</data>
   * <data key="modularity_class">0</data>
   * <data key="size">10.0</data>
   * <data key="r">192</data>
   * <data key="g">192</data>
   * <data key="b">192</data>
   * <data key="x">-269.6634</data>
   * <data key="y">312.24014</data>
   * </node>
   * <edge id="2494" source="INdecuss_l 1800116" target="meso 1818273">
   * <data key="weight">2.0</data>
   * </edge>
   ``* </graph>
   * </graphml>
   */
  GroupGraph.prototype.loadFromGraphMLData = function(xmlData, preferUnitId = true,
      preferName = true, invertY = true) {
    let xml = $.parseXML(xmlData);
    let nodeData = Array.from(xml.querySelectorAll('node'));
    let edgeData = Array.from(xml.querySelectorAll('edge'));

    if (!nodeData || nodeData.length === 0) {
      throw new CATMAID.ValueError("Could not find any nodes");
    }

    let nodes = nodeData.map(n => {
      // Prefer "unit_id" field that we export for explicit ID reference.
      let unitId = parseInt(n.querySelector('data[key=unit_id]').childNodes[0].data, 10);
      let importId = (!Number.isNaN(unitId) && preferUnitId) ? unitId : n.id;
      // Prefer "name" field that we export over label field.
      let name = n.querySelector('data[key=name]').childNodes[0].data;
      let label = n.querySelector('data[key=label]').childNodes[0].data;
      let importName = (name && preferName) ? name : label;
      return {
        'id': importId,
        'label': importName,
        'x': Number(n.querySelector('data[key=x]').childNodes[0].data),
        'y': Number(n.querySelector('data[key=y]').childNodes[0].data),
        'r': Number(n.querySelector('data[key=r]').childNodes[0].data),
        'g': Number(n.querySelector('data[key=g]').childNodes[0].data),
        'b': Number(n.querySelector('data[key=b]').childNodes[0].data),
      };
    });

    let models = nodes.reduce((o, n) => {
      o[n.id] =new CATMAID.SkeletonModel(n.id, '',
          new THREE.Color(n.r/255, n.g/255, n.b/255));
      return o;
    }, {});

    let yFactor = invertY ? -1 : 1;
    let positions = nodes.reduce((o, n) => {
      o[n.id] = {
        x: n.x,
        y: yFactor * n.y,
      };
      return o;
    }, {});

    this.clear();
    this.load(models, positions);
  };

  GroupGraph.prototype.filterEdges = function(countThreshold, confidenceThreshold) {
    countThreshold = CATMAID.tools.validateNumber(countThreshold,
        'Invalid synaptic count', 1);
    confidenceThreshold = CATMAID.tools.validateNumber(confidenceThreshold,
        'Invalid synaptic confidence threshold', 1);
    if (!countThreshold) return;
    countThreshold = countThreshold | 0; // cast to int
    this.edge_threshold = countThreshold;
    this.edge_confidence_threshold = confidenceThreshold;
    var edge_threshold = this.edge_threshold;
    var edge_confidence_threshold = this.edge_confidence_threshold;
    this.cy.startBatch();
    this.cy.edges().each(function(i, edge) {
      var props = edge.data();
      if (props.directed) {
        var count = _filterSynapses(props.confidence, edge_confidence_threshold);
        edge.data('weight', count);
        edge.data('label', count);
        edge.data('weight', count);
        if (count < edge_threshold) edge.addClass('hidden');
        else edge.removeClass('hidden');
      }
    });
    this.cy.endBatch();
  };

  /** The @text param is optional. Will otherwise use the text field with id: gg_select_regex + widgetID
   *  If the text starts with a slash, then it will be interpreted as a regular expression.
   *  Otherwise a literal search for a substring match is done.
   */
  GroupGraph.prototype.selectByLabel = function(ev, text) {
    text = text ? text.trim() : $("#gg_select_regex" + this.widgetID).val();
    var match = CATMAID.createTextMatchingFunction(text);
    if (!match) return;
    var count = 0;
    this.cy.nodes().forEach(function(node) {
      if (match(node.data('label'))) {
        node.select();
        ++count;
      }
    });
    CATMAID.msg("Select by regular expression", "Selected " + count + " nodes.");
  };

  GroupGraph.prototype.invertSelection = function() {
    this.cy.nodes().forEach(function(node) {
      if (node.selected()) node.unselect();
      else node.select();
    });
  };

  GroupGraph.prototype.groupEquallyNamed = function() {
    var seen = {};

    this.cy.nodes().each(function(i, node) {
        var name = node.data("label");
        var list = seen[name];
        if (undefined === list) {
            seen[name] = [node];
        } else {
            list.push(node);
        }
    });

    Object.keys(seen).forEach(function(name) {
       var list = seen[name];

       if (list.length > 1) {
         var position = null;
         var color = null;
         var models = list.reduce(function(o, node) {
           var p = node.position();
           if (!position) {
             position = {x: p.x, y: p.y};
             color = new THREE.Color(node.data("color"));
           } else {
             position.x += p.x;
             position.y += p.y;
             color.add(new THREE.Color(node.data("color")));
           }
           node.data("skeletons").forEach(function(model) {
              o[model.id] = model;
           });
           return o;
         }, {});

         position.x /= list.length;
         position.y /= list.length;

         var gid = this.nextGroupID();
         this.groups[gid] = new CATMAID.GroupGraph.prototype.Group(gid, models, name, color, false, position);

         this.update();
       }
    }, this);
  };

  GroupGraph.prototype.groupEquallyColored = function() {
    let seen = new Map();

    this.cy.nodes().each(function(i, node) {
        var name = node.data("color");
        var list = seen.get(name);
        if (undefined === list) {
            seen.set(name, [node]);
        } else {
            list.push(node);
        }
    });

    let groupNames = new Map();
    let createGroups = () => {
      seen.forEach((list, key) => {
        if (list.length > 1) {
          var position = null;
          var color = null;
          var models = list.reduce(function(o, node) {
            var p = node.position();
            if (!position) {
              position = {x: p.x, y: p.y};
              color = new THREE.Color(node.data("color"));
            } else {
              position.x += p.x;
              position.y += p.y;
              color.add(new THREE.Color(node.data("color")));
            }
            node.data("skeletons").forEach(function(model) {
               o[model.id] = model;
            });
            return o;
          }, {});

          position.x /= list.length;
          position.y /= list.length;

          var gid = this.nextGroupID();
          let name = groupNames.get(key);
          this.groups[gid] = new CATMAID.GroupGraph.prototype.Group(gid, models, name, color, false, position);

          this.update();
        }
      });
    };

    // Ask user for group names
    let groupsToName = Array.from(seen.keys()).filter(color => seen.get(color).length > 1);
    let askForNextGroupName = function() {
      let color = groupsToName.shift();
      if (!color) {
        createGroups();
        return;
      }
      let dialog = new CATMAID.OptionsDialog(`Group name for color ${color}`, {
        'Next': () => {
          let groupName = nameField.value;
          groupNames.set(color, groupName);
          askForNextGroupName();
        },
      });
      let msg = dialog.appendMessage("Please enter a name for the group with color ");
      let colorPane = document.createElement('span');
      colorPane.style.height = '1em';
      colorPane.style.width = '5em';
      colorPane.style.background = color;
      colorPane.style.display = 'inline-block';
      colorPane.style.border = '1px solid black';
      colorPane.style.verticalAlign = 'middle';
      msg.appendChild(colorPane);

      var nameField = dialog.appendField('Name', 'color-name', '', true);

      dialog.show(400, 'auto', true);
    };
    askForNextGroupName();
  };

  GroupGraph.prototype.setLinkTypeVisibility = function(linkType, visible) {
    if (visible) {
      this.selectedLinkTypes.add(linkType);
    } else {
      this.selectedLinkTypes.delete(linkType);
    }
  };

  GroupGraph.prototype.getLinkTypeColor = function(linkTypeId) {
    let linkType = this.linkTypeColors.get(linkTypeId);
    return linkType ? linkType.color : this.linkTypeColors.get('default').color;
  };

  GroupGraph.prototype.getLinkTypeOpacity = function(linkTypeId) {
    let linkType = this.linkTypeColors.get(linkTypeId);
    return linkType ? linkType.opacity : this.linkTypeColors.get('default').opacity;
  };

  /**
   * Update an existing link type color configuration or create a new one if no
   * configuration exists for the passed in link type ID. Only truthy passed in
   * values will be set.
   */
  GroupGraph.prototype.updateLinkTypeColor = function(linkTypeId, color, opacity, colorChanged, alphaChanged, colorHex) {
    let linkType = this.linkTypeColors.get(linkTypeId);
    if (linkType) {
      if (colorChanged) {
        linkType.color = '#' + colorHex;
      }
      if (alphaChanged) {
        linkType.opacity = opacity;
      }
      if (colorChanged || alphaChanged) {
        this.updateEdgeGraphics(true);
      }
      return false;
    } else {
      linkType = {};
      linkType.color = colorChanged ? ('#' + colorHex) : this.linkTypeColors.get('default').color;
      linkType.opacity = alphaChanged ? opacity : this.linkTypeColors.get('default').opacity;
      this.linkTypeColors.set(linkTypeId, linkType);
      this.updateEdgeGraphics(true);
      return true;
    }
  };

  /**
   * Helper to get the number of synapses with confidence greater than or
   * equal to a threshold.
   */
  var _filterSynapses = function (synapses, threshold) {
    if (!synapses) return 0;
    return synapses
            .slice(threshold - 1)
            .reduce(function (skidSum, c) {return skidSum + c;}, 0);
  };

  var edgeLabelStrategies = {
    "absolute": {
      name: "Absolute number of connections",
      run: function(options) {
        return options.count;
      }
    },
    "outbound-relative": {
      name: "Fraction of outbound connections",
      requires: new Set(["originIndex"]),
      run: function(options) {
        var preId = options.relationMap['presynaptic_to'];
        var allOutboundConnections = options.originIndex[options.sourceId][preId];
        var outboundCount = _filterSynapses(allOutboundConnections,
            options.edge_confidence_threshold);
        // Return a two decimal precision number
        return Math.round(100 * options.count / outboundCount) / 100;
      }
    },
    "inbound-relative": {
      name: "Fraction of inbound connections",
      requires: new Set(["originIndex"]),
      run: function(options) {
        var postId = options.relationMap['postsynaptic_to'];
        var allInboundConnections = options.originIndex[options.targetId][postId];
        var inboundCount = _filterSynapses(allInboundConnections,
            options.edge_confidence_threshold);
        // Return a two decimal precision number
        return Math.round(100 * options.count / inboundCount) / 100;
      }
    }
  };

  GroupGraph.prototype.hideEdges = function() {
    this.cy.edges().hide();
  };

  /** Return an object with the name and the set of node ids in the selection activated in the UI pulldown menu. */
  GroupGraph.prototype.getActiveSelection = function() {
    if (!this.selections) return null;
    var select = $("#gg_selections" + this.widgetID)[0];
    if (0 === select.options.length) return null;
    var name = select.options[select.selectedIndex].text;
    return {
      index: select.selectedIndex,
      name: name,
      ids: this.selections[name]
    };
  };

  GroupGraph.prototype.togglePreventSelectionOverlaps = function() {
    this.prevent_selection_overlaps = !this.prevent_selection_overlaps;
  };

  /** Create a new selection, can be overlapping. */
  GroupGraph.prototype.createSelection = function() {
    var existing_ids = {};
    // Prevent overlaps with existing selections if specified by the checkbox
    if (this.selections && this.prevent_selection_overlaps) {
      Object.keys(this.selections).forEach(function(name) {
        $.extend(existing_ids, this.selections[name]);
      }, this);
    }
    // Collect node ids
    var ids = {};
    var to_deselect = [];
    this.cy.nodes().each(function(i, node) {
      if (node.selected()) {
        if (existing_ids[node.id()]) {
          // for clarity, deselect the node that won't be part of this selection
          to_deselect.push(node);
        } else {
          ids[node.id()] = true;
        }
      }
    });
    // Check preconditions: valid name and at least one node selected
    if (0 === Object.keys(ids).length) {
      return CATMAID.warn("Select at least one node!");
    }
    if (to_deselect.length > 0 && !confirm("Some nodes already belong to other selections and will be deselected: continue?")) {
       return;
    }
    var name = prompt("Name: ", "");
    if (!name) {
      return CATMAID.warn("Need a name for the selection!");
    }
    if (this.selections && this.selections[name]) {
      return CATMAID.warn("Name already exists!");
    }
    // For clarity, deselect the nodes that won't be part of this selection
    if (to_deselect.length > 0) {
      to_deselect.forEach(function(node) { node.deselect(); });
    }
    // Create the new selection
    if (!this.selections) this.selections = {};
    this.selections[name] = ids;
    var select = $("#gg_selections" + this.widgetID)[0];
    select.append(new Option(name, name));
  };

  /** Change the order of the active selection in the selections pulldown menu.
   * @param inc Either 1 or -1. */
  GroupGraph.prototype.moveSelection = function(inc) {
    var sel = $('#gg_selections' + this.widgetID)[0];
    var index = sel.selectedIndex;
    inc = inc > 0 ? 1 : -1;
    var new_index = index + inc;
    if (new_index < 0 || new_index >= sel.options.length) return;
    if (inc > 0) {
      sel.insertBefore(sel.options[index], sel.options[new_index].nextSibling);
    } else if (inc < 0) {
      sel.insertBefore(sel.options[index], sel.options[index].previousSibling);
    }
  };

  /** Select or deselect the nodes for the selection chosen in the pulldown menu. */
  GroupGraph.prototype.activateSelection = function(activate) {
    var sel = this.getActiveSelection();
    if (!sel) return;
    this.cy.nodes().each(function(i, node) {
      if (sel.ids[node.id()]) {
        if (activate) node.select();
        else node.unselect();
      }
    });
  };

  GroupGraph.prototype.activateAllSelections = function() {
    if (!this.selections) return;
    var ids = {};
    Object.keys(this.selections).forEach(function(name) {
      $.extend(ids, this.selections[name]);
    }, this);
    this.cy.nodes().each(function(i, node) {
      if (ids[node.id()]) node.select();
    });
  };

  GroupGraph.prototype.removeSelection = function() {
    var sel = this.getActiveSelection();
    if (!sel) return;
    // Remove data structure
    delete this.selections[sel.name];
    // Update UI
    var select = $("#gg_selections" + this.widgetID)[0];
    select.remove(sel.index);
  };

  /** @param evt Optional: undefined/null, or the event associated with the select UI element. */
  GroupGraph.prototype.getEdgeColorMode = function(evt) {
      var select = evt ? evt.target : $('#gg_edge_color_choice' + this.widgetID)[0];
      return select.options[select.selectedIndex].value;
  };

  GroupGraph.prototype.setArrowShapeToSelectedNodes = function() {
    var select = $('#gg_edge_arrow_shape' + this.widgetID)[0];
    var shape = select.options[select.selectedIndex].text;
    var nodes = this.cy.nodes().filter(function(i, node) { return node.selected(); }).toArray();
    if (0 === nodes.length) return CATMAID.warn("Select source nodes first!");
    this.cy.startBatch();
    this.cy.edges().each(function(i, edge) {
      var node = edge.source();
      if (node.selected()) {
        node.data('arrowshape', shape); // storing the arrow shape in the source node
        edge.data('arrow', shape);
        edge.style({'target-arrow-shape': shape,
                    'target-arrow-color': edge.data('color')});
      }
    });
    this.cy.endBatch();
  };

  /**
   * Take the selections of nodes, if any,
   * reset zoom to 100%,
   * define small margins based on node width/height,
   * compute the new positions of nodes in the selections
   *   so that each selection becomes a column (even if nodes overlap because a column has too many),
   * and hide nodes not in the selections.
   *
   * @param options An optional object with the margins and the intracolumn node sorting function.
   */
  GroupGraph.prototype.alignSelectionsAsColumns = function(options) {
    if (!this.selections) return;

    var nodesById = {};
    this.cy.nodes().each(function(i, node) {
      nodesById[node.id()] = node;
    });

    // Check if any selection overlaps with any other selection
    var names = Object.keys(this.selections);
    var warn = false;
    if (names.length > 1) {
      for (var i=0; i<names.length; ++i) {
        var nodeIDs1 = Object.keys(this.selections[names[i]]);
        for (var k=i+1; k<names.length; ++k) {
          var s2 = this.selections[names[k]];
          for (var g=0; g<nodeIDs1.length; ++g) {
            if (s2[nodeIDs1[g]]) {
              warn = true;
              console.log("Node " + nodesById[nodeIDs1[g]].data().label + " from selection '" + names[k] + "' is also present in selection '" + names[i] + "'");
            }
          }
        }
      }
    }
    if (warn) CATMAID.warn("Some nodes are present in more than one selection. Check the console.");

    this.cy.zoom(1.0);

    var margins = options && options.margins ?
      options.margins
      : {top: this.node_height * 2,
         bottom: this.node_height * 2,
         left: this.node_width * 2,
         right: this.node_width * 2};

    // Sort: default is by node label, with natural sort of alphanumeric strings
    var sortFn = options && options.sortFn ?
      options.sortFn
      : function(node1, node2) {
        var label1 = node1.data().label;
        var label2 = node2.data().label;
        return label1.localeCompare(label2, undefined, {numeric: true, sensitivity: 'base'});
      };

    var width  = this.cy.width() - margins.left - margins.right;
    var height = this.cy.height() - margins.top - margins.bottom;

    var columns = this.getSelections();
    var column_spacing = width / (columns.length - 1);

    this.cy.startBatch();

    for (var i=0; i<columns.length; ++i) {
      var x = margins.left + i * column_spacing;
      var column = Object.keys(columns[i].nodeIDs)
        .map(function(nodeID) { return nodesById[nodeID]; })
        .sort(sortFn);
      var row_spacing = height / (column.length - 1);
      column.forEach(function(node, k) {
        node.renderedPosition({x: x, y: margins.top + k * row_spacing});
      });
    }

    this.cy.endBatch();
  };

  /** Return the top-left and bottom-right points of the bounding box of all node positions (node centers). */
  GroupGraph.prototype.getBounds = function() {
    var bounds = {topleft: null,
                  bottomright: null};

    gg.cy.nodes().each(function(i, node) {
      var position = node.position();
      if (null === bounds.topleft) {
        bounds.topleft = {x: position.x,
                          y: position.y};
      } else {
        bounds.topleft.x = Math.min(bounds.topleft.x, position.x);
        bounds.topleft.y = Math.min(bounds.topleft.y, position.y);
      }
      if (null === bounds.bottomright) {
        bounds.bottomright = {x: position.x,
                              y: position.y};
      } else {
        bounds.bottomright.x = Math.max(bounds.bottomright.x, position.x);
        bounds.bottomright.y = Math.max(bounds.bottomright.y, position.y);
      }
    });

    return bounds;
  };

  /** Return selections as an array, ordered like in the UI pulldown menu. */
  GroupGraph.prototype.getSelections = function() {
    var sel = $('#gg_selections' + this.widgetID)[0];
    var selections = [];
    for (var i=0; i<sel.options.length; ++i) {
      var name = sel.options[i].text;
      selections.push({name: name,
                       nodeIDs: this.selections[name]});
    }
    return selections;
  };

  GroupGraph.prototype.getValidatedEdgeOpacityValue = function() {
    var opacity = $('#gg_columns_edge_opacity' + this.widgetID).val();
    // Validate opacity value
    opacity = Number(opacity);
    if (Number.isNaN(opacity) || opacity < 0 || opacity > 100) {
      CATMAID.warn("Invalid opacity! Must be in 0-100 % range.");
      return null;
    }
    return opacity / 100.0;
  };

  /** Returns a function that takes a nodeID as argument and returns the index of the selection the node is part of, or nothing. */
  GroupGraph.prototype.createGetSelectionIndexFn = function() {
    return (function(sel_indices, node_ID) {
      return sel_indices[node_ID];
    }).bind(null, this.getSelections().reduce(function(o, selection, index) {
      return Object.keys(selection.nodeIDs).reduce(function(o, nodeID) {
        o[nodeID] = index;
        return o;
      }, o);
    }, {}));
  };

  /** Fade all edges, keeping at 100% opacity only those relevant to select nodes across columns. */
  GroupGraph.prototype.showRelevantEdgesToColumns = function() {
    if (0 === this.cy.nodes().filter(function(i, node) { return node.selected(); }).size()) {
      return CATMAID.warn("Select at least one node first!");
    }

    var opacity = this.getValidatedEdgeOpacityValue();
    if (null === opacity || undefined === opacity) return;

    var columns = this.getSelections();

    // Column index is the same as selection index
    var getColumnIndex = this.createGetSelectionIndexFn();

    // Show edges from nodes on the column to the left of the node's column
    var showIncommingEdges = function(node) {
      if (!node.visible()) return;
      var column_index = getColumnIndex(node.id());
      node.connectedEdges().each(function(i, edge) {
        if (!edge.visible()) return;
        if (getColumnIndex(edge.source().id()) === column_index - 1) {
           edge.style('opacity', 1.0);
           if (column_index - 1 > 0) {
             // Recurse
             showIncommingEdges(edge.source());
           }
         }
      });
    };

    // Show edges onto nodes on the column to the right of the node's column
    var showOutgoingEdges = function(node) {
      if (!node.visible()) return;
      var column_index = getColumnIndex(node.id());
      node.connectedEdges().each(function(i, edge) {
        if (!edge.visible()) return;
        if (getColumnIndex(edge.target().id()) === column_index + 1) {
           edge.style('opacity', 1.0);
           if (column_index + 1 < columns.length -1) {
             // Recurse
             showOutgoingEdges(edge.target());
           }
         }
      });
    };

    this.cy.startBatch();

    this.cy.edges().style('opacity', opacity);

    this.cy.nodes().each(function(i, node) {
      if (node.selected()) {
        showIncommingEdges(node);
        showOutgoingEdges(node);
      }
    });

    this.cy.endBatch();
  };

  GroupGraph.prototype.resetSelections = function() {
    this.selections = {};
    $('#gg_selections' + this.widgetID)[0].options.length = 0;
  };

  GroupGraph.prototype.hideSelfEdges = function() {
    this.cy.startBatch();
    this.cy.edges().each(function(i, edge) {
      if (edge.source().id() === edge.target().id()) {
        edge.hide();
      }
    });
    this.cy.endBatch();
  };

  /** Hide all edges except those from selection 'i' to the selection 'i+1'. */
  GroupGraph.prototype.hideNonSequentialEdges = function() {
    if (!this.selections) return;
    var getColumnIndex = this.createGetSelectionIndexFn();
    this.cy.startBatch();
    this.cy.edges().each(function(i, edge) {
      var indexSrc = getColumnIndex(edge.source().id()),
          indexTgt = getColumnIndex(edge.target().id());
      if (undefined === indexSrc || undefined === indexTgt || indexSrc + 1 !== indexTgt) {
        edge.hide();
      }
    });
    this.cy.endBatch();
  };

  GroupGraph.prototype.handleSkeletonChanged = function(changedSkeletonId) {
    if (this.hasSkeleton(changedSkeletonId)) {
      let models = {};
      models[changedSkeletonId] = this.getSkeletonModel(changedSkeletonId);
      this.append(models);
    }
  };

  GroupGraph.prototype.handleSkeletonDeletion = function(deletedSkeletonId) {
    if (this.hasSkeleton(deletedSkeletonId)) {
      this.removeSkeletons([deletedSkeletonId]);
    }
  };

  // Register widget
  CATMAID.registerWidget({
    name: "Graph Widget",
    description: "Display and analyze neurons as nodes in a directed graph",
    key: "graph-widget",
    creator: GroupGraph,
    state: {
      getState: function(widget) {
        return {
          label_valign: widget.label_valign,
          label_halign: widget.label_halign,
          show_node_labels: widget.show_node_labels,
          trim_node_labels: widget.trim_node_labels,
          node_width: widget.node_width,
          node_height: widget.node_height,
          edge_text_color: widget.edge_text_color,
          edge_text_opacity: widget.edge_text_opacity,
          edge_min_width: widget.edge_min_width,
          edge_width_function: widget.edge_width_function,
          grid_snap: widget.grid_snap,
          grid_side: widget.grid_side,
          prevent_selection_overlaps: widget.prevent_selection_overlaps,
          linkTypeColors: Array.from(widget.linkTypeColors)
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'label_valign');
        CATMAID.tools.copyIfDefined(state, widget, 'label_halign');
        CATMAID.tools.copyIfDefined(state, widget, 'show_node_labels');
        CATMAID.tools.copyIfDefined(state, widget, 'trim_node_labels');
        CATMAID.tools.copyIfDefined(state, widget, 'node_height');
        CATMAID.tools.copyIfDefined(state, widget, 'node_height');
        CATMAID.tools.copyIfDefined(state, widget, 'edge_text_color');
        CATMAID.tools.copyIfDefined(state, widget, 'edge_text_opacity');
        CATMAID.tools.copyIfDefined(state, widget, 'edge_min_width');
        CATMAID.tools.copyIfDefined(state, widget, 'edge_width_function');
        CATMAID.tools.copyIfDefined(state, widget, 'grid_snap');
        CATMAID.tools.copyIfDefined(state, widget, 'gris_side');
        CATMAID.tools.copyIfDefined(state, widget, 'prevent_selection_overlaps');

        if (state.linkTypeColors) {
          for (var i=0; i<state.linkTypeColors.length; ++i) {
            var ltc = state.linkTypeColors[i];
            widget.linkTypeColors[ltc[0]] = CATMAID.tools.deepCopy(ltc[1]);
          }
        }
      }
    },
  });

  // Export Graph Widget
  CATMAID.GroupGraph = GroupGraph;

})(CATMAID);
