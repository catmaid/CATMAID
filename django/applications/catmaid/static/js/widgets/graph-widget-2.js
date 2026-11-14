/* global
  cytoscape3,
  InstanceRegistry,
  project,
  saveAs,
  SkeletonAnnotations,
  SynapseClustering,
  THREE,
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

    // Group ID vs group: {id, label, color, hideSelfEdges, members,
    // initialPosition}. The members field maps member keys to {skeletonId,
    // part} entries, see GraphWidget2.getMemberKey(). A member is a whole
    // skeleton (part null) or a part of a split skeleton.
    this.groups = new Map();
    // Member key vs group ID, rebuilt by updateGroups()
    this.memberGroups = new Map();

    // IDs of graph nodes locked by the user. Other nodes are only locked
    // temporarily, while new nodes are laid out.
    this.lockedNodeIds = new Set();

    // Link types to create edges for
    this.selectedLinkTypes = new Set(['synaptic-connector']);
    // Link type vs {color, opacity} of its edges
    this.linkTypeColors = new Map([
      ['synaptic-connector', {color: '#555', opacity: 1}],
      ['default', {color: '#ff9e25', opacity: 1}],
    ]);
    // Graph node ID vs arrow shape of the directed edges leaving it
    this.arrowShapes = new Map();

    // Edge options, see the Edges tab
    this.edgeOptions = {
      // One of 'link-type', 'source' or 'target'
      colorMode: 'link-type',
      minLinks: 1,
      // Links count only if both partner links have at least this confidence
      minConfidence: 1,
      hideSelfEdges: false,
      // Value of an entry in GraphWidget2.EDGE_LABEL_STRATEGIES
      labelStrategy: 'absolute',
      textColor: '#555',
      textOpacity: 1,
      textOutlineWidth: 0.4,
      textOutlineOpacity: 1,
      minWidth: 0,
      // Key of GraphWidget2.EDGE_WIDTH_FUNCTIONS
      widthFunction: 'sqrt',
    };

    this.layout_fit = true;
    // Index into GraphWidget2.LAYOUTS, used for new nodes and re-layouts
    this.layoutIndex = 0;
    // Value of an entry in GraphWidget2.NODE_COLOR_MODES
    this.nodeColorMode = 'source';
    // Graph node IDs hidden by hideUnconnectedNodes()
    this.hiddenUnconnectedIds = new Set();
    // Graph node ID vs counter value at the time it was selected, to process
    // selected nodes in selection order.
    this.selectionOrder = new Map();
    this.selectionCounter = 0;
    // Grid snapping of dragged nodes, see the Align tab
    this.gridOptions = {
      snap: false,
      size: 10,
    };
    // Grow options, see the Grow tab. A minimum of zero links accepts all
    // partners in a direction, -1 none.
    this.growOptions = {
      circles: 1,
      minUpstream: 2,
      minDownstream: 2,
      // A regular expression, only partners with a matching annotation are
      // added. Empty to add all partners.
      annotationFilter: '',
      hops: 2,
      minPathLinks: 2,
    };
    // Named selections of skeletons and skeleton parts, in the order of the
    // list in the Selections tab. Each is {name, members}, the members field
    // maps member keys to {skeletonId, part}, see GraphWidget2.getMemberKey().
    // A graph node is part of a selection if any of its members is.
    this.selections = [];
    this.selectionOptions = {
      preventOverlaps: true,
      // Whether aligning selections as columns hides all other nodes
      hideOtherNodes: false,
      // Opacity of faded edges in percent
      fadedEdgeOpacity: 30,
    };
    // Member key vs {skeletonId, part} of the skeletons and skeleton parts
    // picked as path sources and targets, see GraphWidget2.getMemberKey().
    // Unlike graph node IDs, member keys aren't reused for other parts.
    this.pathOrigins = {
      source: new Map(),
      target: new Map(),
    };

    // Display options, see the View tab
    this.viewOptions = {
      fitIgnoresLabels: true,
      wheelSensitivity: 1,
      showLabels: true,
      trimLabels: false,
      labelVAlign: 'top',
      labelHAlign: 'center',
      // A maximum label width of zero disables wrapping
      labelMaxWidth: 0,
      nodeWidth: 30,
      nodeHeight: 30,
      nodeBorderWidth: 1,
    };

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
    // The IDs of all treenodes allowed by the filter rules, null without
    // active filter rules
    this.allowedNodeIds = null;
    // The IDs of all connectors linked to an allowed treenode, null without
    // active filter rules. Only links to these connectors are used.
    this.allowedConnectorIds = null;
    // Counts filter runs, to ignore the results of outdated ones
    this.filterRun = 0;
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
            ['Main', 'View', 'Groups', 'Grow', 'Nodes', 'Edges', 'Selection',
             'Selections', 'Subgraphs', 'Align', 'Export']);

        CATMAID.DOM.appendToTab(tabs['Main'], [
          [document.createTextNode('From')],
          [CATMAID.skeletonListSources.createSelect(this)],
          ['Append', () => this.loadSource()],
          ['Append as group', () => this.appendAsGroup()],
          ['Remove', () => this.removeSource()],
          ['Clear', () => this.clear()],
          ['Refresh', () => this.update()],
        ]);

        let options = this.viewOptions;
        let setOption = (name, value) => {
          options[name] = value;
          this.applyStyle();
        };
        CATMAID.DOM.appendToTab(tabs['View'], [
          {type: 'button', label: 'Fit', onclick: () => this.fitView()},
          {type: 'button', label: '+', title: 'Zoom in', onclick: () => this.zoomBy(1.25)},
          {type: 'button', label: '−', title: 'Zoom out', onclick: () => this.zoomBy(0.8)},
          {type: 'checkbox', label: 'Fit ignores labels', value: options.fitIgnoresLabels,
              title: 'Fit only the nodes into the view, long labels may be cut off',
              onclick: e => { options.fitIgnoresLabels = e.target.checked; }},
          this.createNumericViewOption('Mouse wheel sensitivity:',
              'Lower values allow to zoom in smaller steps', 'wheelSensitivity',
              0.01, 0.1, value => {
                if (this.cy) this.cy.renderer().wheelSensitivity = value;
              }),
          {type: 'heading', label: 'Labels'},
          {type: 'checkbox', label: 'Show', value: options.showLabels,
              onclick: e => setOption('showLabels', e.target.checked)},
          {type: 'checkbox', label: "Trim after ';'", value: options.trimLabels,
              title: "Show neuron names only up to the first ';'",
              onclick: e => {
                options.trimLabels = e.target.checked;
                this.updateNeuronNames();
              }},
          {type: 'select', label: 'Vertical: ', entries: ['top', 'center', 'bottom'],
              value: options.labelVAlign,
              onchange: e => setOption('labelVAlign', e.target.value)},
          {type: 'select', label: 'Horizontal: ', entries: ['left', 'center', 'right'],
              value: options.labelHAlign,
              onchange: e => setOption('labelHAlign', e.target.value)},
          this.createNumericViewOption('Max width:', 'Wrap labels at this width ' +
              'in pixels, zero disables wrapping', 'labelMaxWidth', 0, 10),
          {type: 'heading', label: 'Nodes'},
          this.createNumericViewOption('Width:', 'Node width in pixels', 'nodeWidth', 1, 1),
          this.createNumericViewOption('Height:', 'Node height in pixels', 'nodeHeight', 1, 1),
          this.createNumericViewOption('Border:', 'Node border width in pixels',
              'nodeBorderWidth', 0, 0.5),
        ]);

        let edgeOptions = this.edgeOptions;
        let setEdgeOption = (name, value) => {
          edgeOptions[name] = value;
          this.updateEdgeProperties();
        };
        let updateEdges = () => this.updateEdgeProperties();
        let linkTypeSelection = CATMAID.DOM.createAsyncPlaceholder(
          CATMAID.DOM.initLinkTypeList({
            getSelectedLinkTypes: () => this.selectedLinkTypes,
            setLinkTypeVisibility: (linkType, visible) => this.setLinkTypeVisibility(linkType, visible),
            // All link types are loaded already
            update: () => this.updateGraph(),
            color: true,
            getLinkTypeColor: linkType => this.getLinkTypeColor(linkType),
            getLinkTypeOpacity: linkType => this.getLinkTypeOpacity(linkType),
            // Called with a different context
            updateLinkTypeColor: (...args) => this.updateLinkTypeColor(...args),
          }));
        let linkTypeWrapper = document.createElement('span');
        linkTypeWrapper.appendChild(linkTypeSelection);
        let arrowShapeSpec = {type: 'select', label: 'Arrow shape: ',
            title: 'Arrow shape for the edges leaving the selected nodes',
            entries: GraphWidget2.ARROW_SHAPES, value: 'triangle'};
        let synapseTypeSpec = {type: 'select', label: 'Synapse type: ',
            title: 'Hide or show synaptic edges between axon and dendrite ' +
                'parts of skeletons split into axon and dendrite',
            entries: Object.keys(GraphWidget2.SYNAPSE_TYPES), value: 'axo-axonic'};
        let edgeSpecs = [
          {type: 'select', label: 'Color by: ', title: 'Color directed edges ' +
              'like their link type, or like their source or target node',
              entries: [{title: 'link type', value: 'link-type'},
                        {title: 'source', value: 'source'},
                        {title: 'target', value: 'target'}],
              value: edgeOptions.colorMode,
              onchange: e => setEdgeOption('colorMode', e.target.value)},
          this.createNumericOption(edgeOptions, 'Min. links:',
              'Hide edges with fewer links', 'minLinks', 1, undefined, 1, updateEdges),
          {type: 'select', label: 'Min. confidence: ', title: 'Ignore links ' +
              'whose confidence or whose partner link\'s confidence is lower',
              entries: ['1', '2', '3', '4', '5'], value: String(edgeOptions.minConfidence),
              onchange: e => setEdgeOption('minConfidence', Number(e.target.value))},
          {type: 'checkbox', label: 'Hide self edges', value: edgeOptions.hideSelfEdges,
              title: 'Hide edges whose source and target node are the same',
              onclick: e => setEdgeOption('hideSelfEdges', e.target.checked)},
          {type: 'checkbox', label: 'Apply node/edge filters', value: this.applyFilterRules,
              title: 'Apply all enabled node filters (funnel icon in title bar). ' +
                  'If node filters are active, only edges with at least one node ' +
                  'allowed by the filter will be shown.',
              onclick: e => {
                this.applyFilterRules = e.target.checked;
                if (this.filterRules.length > 0) this.updateFilter();
              }},
          {type: 'child', element: linkTypeWrapper},
          [document.createTextNode(' - ')],
          arrowShapeSpec,
          ['Set', () => this.setArrowShapeOfSelectedNodes(arrowShapeSelect.value)],
          [document.createTextNode(' - ')],
          synapseTypeSpec,
          ['Hide', () => this.setSynapseTypeVisibility(synapseTypeSelect.value, false)],
          ['Show', () => this.setSynapseTypeVisibility(synapseTypeSelect.value, true)],
          {type: 'heading', label: 'Display'},
          {type: 'select', label: 'Label: ', title: 'Edge labels, relative ' +
              'values include partners that aren\'t part of the graph',
              entries: GraphWidget2.EDGE_LABEL_STRATEGIES, value: edgeOptions.labelStrategy,
              onchange: e => setEdgeOption('labelStrategy', e.target.value)},
          {type: 'color-button', label: 'Text color', title: 'Color of edge labels',
              color: {initialColor: edgeOptions.textColor},
              onchange: (rgb, alpha, colorChanged, alphaChanged, colorHex) => {
                if (!colorChanged) return;
                edgeOptions.textColor = '#' + colorHex;
                this.applyStyle();
              }},
          this.createNumericOption(edgeOptions, 'Text opacity:', 'Opacity of edge labels',
              'textOpacity', 0, 1, 0.1, () => this.applyStyle()),
          this.createNumericOption(edgeOptions, 'Text outline:', 'Outline width of edge labels',
              'textOutlineWidth', 0, undefined, 0.1, () => this.applyStyle()),
          this.createNumericOption(edgeOptions, 'Outline opacity:', 'Opacity of edge label outlines',
              'textOutlineOpacity', 0, 1, 0.1, () => this.applyStyle()),
          this.createNumericOption(edgeOptions, 'Min. width:', 'Width added to all edges',
              'minWidth', 0, undefined, 0.5, updateEdges),
          {type: 'select', label: 'Width: ', title: 'Edge width as a function of the link count',
              entries: Object.keys(GraphWidget2.EDGE_WIDTH_FUNCTIONS), value: edgeOptions.widthFunction,
              onchange: e => setEdgeOption('widthFunction', e.target.value)},
        ];
        let edgeElements = CATMAID.DOM.appendToTab(tabs['Edges'], edgeSpecs);
        let arrowShapeSelect = edgeElements[edgeSpecs.indexOf(arrowShapeSpec)];
        let synapseTypeSelect = edgeElements[edgeSpecs.indexOf(synapseTypeSpec)];

        CATMAID.DOM.appendToTab(tabs['Nodes'], [
          {type: 'select', label: 'Layout: ', title: 'The layout to use for re-layouts and new nodes',
              entries: GraphWidget2.LAYOUTS.map((layout, i) => ({title: layout.title, value: String(i)})),
              value: String(this.layoutIndex),
              onchange: e => { this.layoutIndex = Number(e.target.value); }},
          ['Re-layout', () => this.relayout()],
          {type: 'checkbox', label: 'fit', value: this.layout_fit,
              title: 'Fit the view to the graph after a layout',
              onclick: e => { this.layout_fit = e.target.checked; }},
          [document.createTextNode(' - ')],
          {type: 'select', label: 'Color: ', title: 'How to color nodes',
              entries: GraphWidget2.NODE_COLOR_MODES, value: this.nodeColorMode,
              onchange: e => this.setNodeColorMode(e.target.value)},
          [document.createTextNode(' - ')],
          {type: 'button', label: 'Hide unconnected',
              title: 'Hide all nodes that have either no connected edges or only edges to themselves',
              onclick: () => this.hideUnconnectedNodes()},
          {type: 'button', label: 'Show unconnected',
              title: 'Show all nodes hidden by "Hide unconnected"',
              onclick: () => this.showUnconnectedNodes()},
          {type: 'button', label: 'Remove unconnected',
              title: 'Remove all skeletons whose nodes have either no connected edges or only edges to themselves',
              onclick: () => this.removeUnconnectedNodes()},
        ]);

        let selectTextSpec = {type: 'text', id: `graph_widget_2_select_text_${this.widgetID}`,
            placeholder: 'Name or /regex', title: 'Select nodes whose label ' +
            'contains this text, or matches a regular expression starting with /',
            onenter: () => this.selectByName(selectText.value)};
        let showHiddenSpec = {type: 'button', label: 'Show hidden', disabled: true,
            id: `graph_widget_2_show_hidden_${this.widgetID}`,
            onclick: () => this.showHidden()};
        let selectionSpecs = [
          ['Annotate', () => this.annotate_skeleton_list()],
          [document.createTextNode(' - ')],
          ['Measure edge risk', () => this.measureEdgeRisk()],
          [document.createTextNode(' - ')],
          ['Hide', () => this.hideSelected()],
          showHiddenSpec,
          ['Lock', () => this.lockSelected(true)],
          ['Unlock', () => this.lockSelected(false)],
          [document.createTextNode(' - ')],
          ['Remove', () => this.removeSelected()],
          [document.createTextNode(' - ')],
          selectTextSpec,
          ['Select by name', () => this.selectByName(selectText.value)],
          [document.createTextNode(' - ')],
          ['Invert', () => this.invertSelection()],
        ];
        let selectionElements = CATMAID.DOM.appendToTab(tabs['Selection'], selectionSpecs);
        let selectText = selectionElements[selectionSpecs.indexOf(selectTextSpec)];
        this.showHiddenButton = selectionElements[selectionSpecs.indexOf(showHiddenSpec)];

        CATMAID.DOM.appendToTab(tabs['Align'], [
          [document.createTextNode('Align: ')],
          {type: 'button', label: 'X', onclick: () => this.alignNodes('x'),
              title: 'Use the X coordinate of the first selected node for all selected nodes'},
          {type: 'button', label: 'Y', onclick: () => this.alignNodes('y'),
              title: 'Use the Y coordinate of the first selected node for all selected nodes'},
          [document.createTextNode(' - Distribute: ')],
          {type: 'button', label: 'X', onclick: () => this.distributeNodes('x'),
              title: 'Space the selected nodes evenly along X, between the outermost ones'},
          {type: 'button', label: 'Y', onclick: () => this.distributeNodes('y'),
              title: 'Space the selected nodes evenly along Y, between the outermost ones'},
          [document.createTextNode(' - ')],
          {type: 'checkbox', label: 'Snap to grid', value: this.gridOptions.snap,
              title: 'Move dragged nodes to the nearest grid point when they are released',
              onclick: e => { this.gridOptions.snap = e.target.checked; }},
          this.createNumericOption(this.gridOptions, 'Grid size:', 'Grid cell size in pixels',
              'size', 1, undefined, 1, () => {}),
          {type: 'button', label: 'Snap selected', onclick: () => this.snapSelectedToGrid(),
              title: 'Move the selected nodes to the nearest grid point'},
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

        CATMAID.DOM.appendToTab(tabs['Groups'], [
          ['Group selected', () => this.group()],
          ['Ungroup selected', () => this.ungroup()],
          [document.createTextNode(' - ')],
          ['Group equally named', () => this.groupEquallyNamed()],
          ['Group equally colored', () => this.groupEquallyColored()],
        ]);

        CATMAID.DOM.appendToTab(tabs['Export'], [
          ['Export GML', () => this.exportGML()],
          ['Export SVG', () => this.showSVGOptions()],
          ['Export Adjacency Matrix', () => this.exportAdjacencyMatrix()],
          ['Open Connectivity Matrix', () => this.openConnectivityMatrix()],
          ['Open plot', () => this.openPlot()],
          ['Quantify', () => this.quantificationDialog()],
        ]);

        let selectionOptions = this.selectionOptions;
        let selectionListSpec = {type: 'select', entries: [],
            title: 'The selection that the buttons to the right work on'};
        let selectionsSpecs = [
          {type: 'button', label: 'Create selection',
              title: 'Remember the selected nodes as a new named selection',
              onclick: () => this.createSelection()},
          {type: 'checkbox', label: 'prevent overlaps', value: selectionOptions.preventOverlaps,
              title: 'Leave out nodes that are part of another selection already',
              onclick: e => { selectionOptions.preventOverlaps = e.target.checked; }},
          selectionListSpec,
          {type: 'button', label: '\u25B2', title: 'Move the selection up in the list',
              onclick: () => this.moveSelection(-1)},
          {type: 'button', label: '\u25BC', title: 'Move the selection down in the list',
              onclick: () => this.moveSelection(1)},
          ['Select', () => this.activateSelection(true)],
          ['Deselect', () => this.activateSelection(false)],
          ['Remove', () => this.removeSelection()],
          ['Select all', () => this.activateAllSelections()],
          [document.createTextNode(' - ')],
          {type: 'button', label: 'As columns',
              title: 'Arrange the nodes of each selection as a column, in list order',
              onclick: () => this.alignSelectionsAsColumns()},
          {type: 'checkbox', label: 'hide other nodes', value: selectionOptions.hideOtherNodes,
              title: 'Hide nodes that are not part of any selection when arranging columns',
              onclick: e => { selectionOptions.hideOtherNodes = e.target.checked; }},
          Object.assign(this.createNumericOption(selectionOptions, 'edge opacity:',
              'The opacity of faded edges in percent', 'fadedEdgeOpacity', 0, 100, 1, () => {}),
              {postlabel: '%'}),
          {type: 'button', label: 'Fade edges',
              title: 'Fade all edges, except for the ones that connect the ' +
                  'selected nodes to neighboring columns and further on',
              onclick: () => this.fadeEdges()},
          {type: 'button', label: 'Restore edges', title: 'Undo the fading of edges',
              onclick: () => this.restoreEdges()},
          {type: 'button', label: 'Hide non-seq edges',
              title: 'Hide all edges that don\'t lead from one selection to the next one in the list',
              onclick: () => this.hideNonSequentialEdges()},
        ];
        let selectionsElements = CATMAID.DOM.appendToTab(tabs['Selections'], selectionsSpecs);
        this.selectionSelect = selectionsElements[selectionsSpecs.indexOf(selectionListSpec)];
        this.updateSelectionSelect();

        let growOptions = this.growOptions;
        let numberEntries = (first, last) => Array.from({length: last - first + 1},
            (_, i) => ({title: String(first + i), value: String(first + i)}));
        let limitEntries = direction => [
          {title: `All ${direction}`, value: '0'},
          {title: `No ${direction}`, value: '-1'},
        ].concat(numberEntries(1, 50));
        let pickSourcesSpec = {type: 'button', label: 'Pick sources',
            title: 'Add the selected nodes to the nodes that paths start at',
            onclick: () => this.pickPathOrigins('source')};
        let pickTargetsSpec = {type: 'button', label: 'Pick targets',
            title: 'Add the selected nodes to the nodes that paths end at',
            onclick: () => this.pickPathOrigins('target')};
        let growSpecs = [
          [document.createTextNode('Grow ')],
          {type: 'button', label: 'Circles',
              title: 'Add the partners of the selected nodes, connected ' +
                  'through the link types selected in the Edges tab',
              onclick: () => this.growCircles()},
          {type: 'select', label: ' by ', title: 'How many orders of partners to add',
              entries: numberEntries(1, 5), value: String(growOptions.circles),
              onchange: e => { growOptions.circles = Number(e.target.value); }},
          [document.createTextNode(' orders, limit: ')],
          {type: 'select', title: 'The minimum number of links of a single ' +
              'link type from an upstream partner',
              entries: limitEntries('upstream'), value: String(growOptions.minUpstream),
              onchange: e => { growOptions.minUpstream = Number(e.target.value); }},
          {type: 'select', title: 'The minimum number of links of a single ' +
              'link type to a downstream partner',
              entries: limitEntries('downstream'), value: String(growOptions.minDownstream),
              onchange: e => { growOptions.minDownstream = Number(e.target.value); }},
          {type: 'text', label: 'Filter (regex):', title: 'Only include ' +
              'partners with annotations matching this regular expression',
              value: growOptions.annotationFilter, length: 4,
              onchange: e => { growOptions.annotationFilter = e.target.value; }},
          [document.createTextNode(' - Find ')],
          {type: 'button', label: 'Paths',
              title: 'Add the neurons on paths from the picked sources to ' +
                  'the picked targets, along the link types selected in the Edges tab',
              onclick: () => this.growPaths()},
          {type: 'select', label: ' by ', title: 'The number of links a path consists of',
              entries: numberEntries(2, 6), value: String(growOptions.hops),
              onchange: e => { growOptions.hops = Number(e.target.value); }},
          [document.createTextNode(' hops, ')],
          this.createNumericOption(growOptions, 'Min. links:', 'The minimum ' +
              'number of links of a single link type between the neurons of a path',
              'minPathLinks', 1, undefined, 1, () => {}),
          pickSourcesSpec,
          {type: 'button', label: 'X', title: 'Forget all path sources',
              onclick: () => this.clearPathOrigins('source')},
          pickTargetsSpec,
          {type: 'button', label: 'X', title: 'Forget all path targets',
              onclick: () => this.clearPathOrigins('target')},
        ];
        let growElements = CATMAID.DOM.appendToTab(tabs['Grow'], growSpecs);
        this.pathOriginButtons = {
          source: growElements[growSpecs.indexOf(pickSourcesSpec)],
          target: growElements[growSpecs.indexOf(pickTargetsSpec)],
        };
        this.updatePathOriginButtons();

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
      style: this.getStylesheet(),
      boxSelectionEnabled: true,
    });
    // Not passed as option, because Cytoscape.js warns about custom values
    this.cy.renderer().wheelSensitivity = this.viewOptions.wheelSensitivity;

    this.cy.on('select', 'node', e => {
      let id = e.target.id();
      if (!this.selectionOrder.has(id)) this.selectionOrder.set(id, ++this.selectionCounter);
    });
    this.cy.on('unselect remove', 'node', e => this.selectionOrder.delete(e.target.id()));

    // Snap released nodes to the grid
    this.cy.on('dragfree', 'node', e => {
      if (this.gridOptions.snap) this.snapToGrid(e.target);
    });

    // Circles of hell colors depend on the selected node. Selecting many nodes
    // at once triggers many events, recolor only once for them.
    this.cy.on('select unselect', 'node', () => {
      if (!this.nodeColorMode.startsWith('circles-of-hell') || this.recolorTimeout) return;
      this.recolorTimeout = setTimeout(() => {
        this.recolorTimeout = null;
        this.applyNodeColors();
      }, 0);
    });
  };

  /**
   * Get the graph stylesheet, based on the current view options.
   */
  GraphWidget2.prototype.getStylesheet = function() {
    let options = this.viewOptions;
    let edgeOptions = this.edgeOptions;
    let nodeStyle = {
      "label": "data(label)",
      "shape": "data(shape)",
      "border-width": options.nodeBorderWidth,
      "background-color": "data(color)",
      "border-color": "#555",
      "text-opacity": options.showLabels ? 1 : 0,
      "text-valign": options.labelVAlign,
      "text-halign": options.labelHAlign,
      "width": options.nodeWidth,
      "height": options.nodeHeight,
    };
    if (options.labelMaxWidth > 0) {
      nodeStyle["text-wrap"] = "wrap";
      nodeStyle["text-max-width"] = `${options.labelMaxWidth}px`;
    }
    return [{
        selector: "node",
        style: nodeStyle,
      }, {
        selector: "edge",
        style: {
          "label": "data(label)",
          "width": "data(width)",
          "target-arrow-shape": "data(arrow)",
          "target-arrow-color": "data(color)",
          "line-color": "data(color)",
          "opacity": "data(opacity)",
          "text-opacity": edgeOptions.textOpacity,
          "text-outline-color": "#fff",
          "text-outline-width": edgeOptions.textOutlineWidth,
          "text-outline-opacity": edgeOptions.textOutlineOpacity,
          "color": edgeOptions.textColor,
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
      }, {
        // Edges of hidden nodes are hidden explicitly, the renderer fails for
        // displayed edges of nodes that aren't displayed. See setHidden().
        selector: "node.hidden <-> node",
        style: {
          "display": "none",
        },
      }, {
        // Edges removed by edge filters
        selector: ".filtered",
        style: {
          "display": "none",
        },
      }];
  };

  /**
   * Replace the graph stylesheet with one based on the current view options.
   */
  GraphWidget2.prototype.applyStyle = function() {
    if (this.cy) this.cy.style(this.getStylesheet());
  };

  /**
   * Create a numeric field element for a view option, which is applied on
   * change. Invalid values are refused.
   */
  GraphWidget2.prototype.createNumericViewOption = function(label, title, name,
      min, step, onChange) {
    return this.createNumericOption(this.viewOptions, label, title, name, min,
        undefined, step, onChange || (() => this.applyStyle()));
  };

  /**
   * Create a numeric field element for a field of an options object. The
   * passed in function is called with valid new values, invalid values are
   * refused. The maximum is optional.
   */
  GraphWidget2.prototype.createNumericOption = function(options, label, title,
      name, min, max, step, onChange) {
    return {
      type: 'numeric',
      label: label,
      title: title,
      value: options[name],
      length: 3,
      min: min,
      max: max,
      step: step,
      onchange: e => {
        let value = Number(e.target.value);
        if (e.target.value === '' || Number.isNaN(value) || value < min ||
            (max !== undefined && value > max)) {
          CATMAID.warn(max === undefined ? `Please use a number of at least ${min}` :
              `Please use a number between ${min} and ${max}`);
          e.target.value = options[name];
          return;
        }
        options[name] = value;
        onChange(value);
      },
    };
  };

  /**
   * Fit all graph nodes into the view, optionally ignoring their labels.
   */
  GraphWidget2.prototype.fitView = function() {
    if (!this.cy) return;
    let nodes = this.cy.nodes(':visible');
    if (nodes.empty()) return;
    if (this.viewOptions.fitIgnoresLabels) {
      this.cy.fit(nodes.boundingBox({includeLabels: false}), 30);
    } else {
      this.cy.fit(nodes, 30);
    }
  };

  /**
   * Zoom in (factor > 1) or out (factor < 1) around the center of the view.
   */
  GraphWidget2.prototype.zoomBy = function(factor) {
    if (!this.cy) return;
    this.cy.zoom({
      level: this.cy.zoom() * factor,
      renderedPosition: {x: this.cy.width() / 2, y: this.cy.height() / 2},
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
   * Get the graph nodes of a skeleton, one per part if it is split, including
   * group nodes that contain the skeleton or a part of it.
   */
  GraphWidget2.prototype.getSkeletonNodes = function(skeletonId) {
    skeletonId = Number(skeletonId);
    return this.cy.nodes().filter(node => node.data('skeleton_ids').includes(skeletonId));
  };

  /**
   * Get the graph node label for a skeleton or a part of it.
   */
  GraphWidget2.prototype.getNodeLabel = function(skeletonId, part) {
    let name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    if (this.viewOptions.trimLabels && name) {
      let end = name.indexOf(';');
      if (end !== -1) name = name.substring(0, end);
    }
    return part === null ? name : `${name} [${part}]`;
  };

  GraphWidget2.prototype.updateNeuronNames = function() {
    if (!this.cy) return;
    this.cy.batch(() => {
      this.cy.nodes().forEach(node => {
        // Group nodes keep their group label
        if (node.data('group_id')) return;
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
        for (let skeletonId of node.data('skeleton_ids')) {
          models[skeletonId] = this.getSkeletonModel(skeletonId);
        }
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
    this.groups.clear();
    this.memberGroups.clear();
    this.lockedNodeIds.clear();
    this.hiddenUnconnectedIds.clear();
    this.arrowShapes.clear();
    this.selectionOrder.clear();
    // Ignore pending filter runs
    ++this.filterRun;
    this.allowedNodeIds = null;
    this.allowedConnectorIds = null;
    if (this.cy) this.cy.elements().remove();
    this.updateShowHiddenButton();
    this.prunePathOrigins();
    this.pruneSelections();
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
    let groupsChanged = false;
    for (let skeletonId of skeletonIds) {
      skeletonId = Number(skeletonId);
      if (!this.skeletons.has(skeletonId)) continue;
      removedModels[skeletonId] = this.getSkeletonModel(skeletonId);
      this.skeletons.delete(skeletonId);
      if (this.isGrouped(skeletonId)) {
        // Group nodes and their edges are rebuilt below
        groupsChanged = true;
      } else if (this.cy) {
        // Removing nodes also removes their edges
        this.getSkeletonNodes(skeletonId).remove();
      }
    }
    let removedIds = Object.keys(removedModels);
    if (removedIds.length > 0) {
      CATMAID.NeuronNameService.getInstance().unregister(this, removedIds);
      this.triggerRemove(removedModels);
    }
    // With filter rules, a connector can lose its only allowed treenode
    if ((groupsChanged || this.allowedNodeIds) && removedIds.length > 0 && this.cy) {
      return this.updateGraph();
    }
    this.updateShowHiddenButton();
    this.prunePathOrigins();
    this.pruneSelections();
    return Promise.resolve();
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
        // Filter rules have to see new and changed skeletons as well
        return this.updateFilter(undefined, true)
          .then(() => {
            this.updateGraph();
            if (!CATMAID.tools.isEmpty(addedModels)) {
              this.triggerAdd(addedModels);
            }
          });
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
            with_link_confidence: true,
            with_partner_counts: true,
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
      // Rows end with the link confidence and partner counts
      links.push([row[0], row[1], relationName, row[6], row[7]]);
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
   * Get the key of a group member, a whole skeleton (part null) or a part of
   * it. Unlike graph node IDs, member keys don't change if the part order
   * changes.
   */
  GraphWidget2.getMemberKey = function(skeletonId, part) {
    return `${skeletonId}|${part}`;
  };

  /**
   * Get the ID of the graph node that represents the passed in skeleton part:
   * its group node, if it is grouped, or its own node.
   */
  GraphWidget2.prototype.getGraphNodeId = function(skeleton, part) {
    let groupId = this.memberGroups.get(GraphWidget2.getMemberKey(skeleton.model.id, part));
    return groupId === undefined ? GraphWidget2.getPartNodeId(skeleton, part) : groupId;
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
        // Needed synchronously for edge labels
        this.resolvedLinkPairs = linkPairs;
        // Update groups only now, because they can change while link types
        // are loaded. Graph nodes are created from the same state, right
        // after this.
        this.updateGroups();
        let allowedConnectorIds = this.updateAllowedConnectors();
        let reciprocal = new Map(linkTypes.map(lt => [lt.relation, lt.isreciprocal]));

        // Connector ID vs map of relation name vs list of [graph node ID,
        // treenode ID]
        let connectors = new Map();
        for (let skeleton of this.skeletons.values()) {
          for (let [treenodeId, connectorId, relationName, confidence] of skeleton.links) {
            if (allowedConnectorIds && !allowedConnectorIds.has(connectorId)) continue;
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
            relationPartners.push([this.getGraphNodeId(skeleton, part), treenodeId, confidence]);
          }
        }

        let edges = new Map();
        let addLink = (linkType, directed, source, target, connectorId) => {
          if (source[0] === target[0]) {
            let group = this.groups.get(source[0]);
            if (group && group.hideSelfEdges) return;
          }
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
          // A link pair is as confident as its less confident link
          edge.links.push([source[1], connectorId, target[1], Math.min(source[2], target[2])]);
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
   * Parts in the same graph node, e.g. a group, aren't connected.
   */
  GraphWidget2.prototype.computePartEdges = function() {
    let edges = new Map();
    for (let skeleton of this.skeletons.values()) {
      for (let split of skeleton.splitNodes.values()) {
        if (split.parentPart === null || split.parentPart === split.label) continue;
        let source = this.getGraphNodeId(skeleton, split.parentPart);
        let target = this.getGraphNodeId(skeleton, split.label);
        if (source === target) continue;
        if (source > target) [source, target] = [target, source];
        let id = `part_${source}_${target}`;
        edges.set(id, {
          id: id,
          source: source,
          target: target,
          skeletonId: skeleton.model.id,
          color: '#' + skeleton.model.color.getHexString(),
        });
      }
    }
    return Array.from(edges.values());
  };

  /**
   * Remove group members that don't exist anymore, because their skeleton was
   * removed or split differently, and rebuild the member index. Empty groups
   * are removed.
   */
  GraphWidget2.prototype.updateGroups = function() {
    this.memberGroups.clear();
    let removedLabels = [];
    for (let [groupId, group] of this.groups) {
      for (let [key, member] of group.members) {
        let skeleton = this.skeletons.get(member.skeletonId);
        if (skeleton && skeleton.partLabels.includes(member.part)) {
          this.memberGroups.set(key, groupId);
        } else {
          group.members.delete(key);
        }
      }
      if (group.members.size === 0) {
        this.groups.delete(groupId);
        removedLabels.push(group.label);
      }
    }
    if (removedLabels.length > 0) {
      CATMAID.info(`Removed empty group(s): ${removedLabels.join(', ')}`);
    }
  };

  GraphWidget2.prototype.isGrouped = function(skeletonId) {
    for (let group of this.groups.values()) {
      for (let member of group.members.values()) {
        if (member.skeletonId === skeletonId) return true;
      }
    }
    return false;
  };

  /**
   * Rebuild all graph elements from the loaded skeletons and groups.
   * Positions and selection state of existing nodes are kept, new nodes are
   * laid out. New parts of a skeleton start at the position of its former
   * graph node, ungrouped members at the position of their former group.
   */
  GraphWidget2.prototype.updateGraph = function() {
    return this.computeEdges()
      .then(edges => {
        let positions = {};
        let memberPositions = {};
        let skeletonPositions = {};
        let selected = new Set();
        let hidden = new Set();
        this.cy.elements().forEach(element => {
          if (element.selected()) selected.add(element.id());
          if (element.hasClass('hidden')) hidden.add(element.id());
          if (element.isNode()) {
            // Copy, because the returned position object is updated in place
            let position = Object.assign({}, element.position());
            positions[element.id()] = position;
            for (let member of element.data('members')) {
              memberPositions[GraphWidget2.getMemberKey(member.skeletonId, member.part)] = position;
              skeletonPositions[member.skeletonId] = position;
            }
          }
        });

        let nodes = [];
        for (let skeleton of this.skeletons.values()) {
          let skeletonId = skeleton.model.id;
          let color = '#' + skeleton.model.color.getHexString();
          for (let part of skeleton.partLabels) {
            // Grouped members are represented by their group node
            if (this.memberGroups.has(GraphWidget2.getMemberKey(skeletonId, part))) continue;
            nodes.push({
              data: {
                id: GraphWidget2.getPartNodeId(skeleton, part),
                skeleton_id: skeletonId,
                skeleton_ids: [skeletonId],
                part: part,
                members: [{skeletonId: skeletonId, part: part}],
                label: this.getNodeLabel(skeletonId, part),
                color: color,
                shape: 'ellipse',
              },
            });
          }
        }

        // Group nodes. New groups start at their initial position.
        let initialPositions = {};
        for (let group of this.groups.values()) {
          let members = Array.from(group.members.values());
          nodes.push({
            data: {
              id: group.id,
              group_id: group.id,
              skeleton_ids: Array.from(new Set(members.map(member => member.skeletonId))),
              members: members,
              label: group.label,
              color: '#' + group.color.getHexString(),
              shape: 'hexagon',
            },
          });
          if (group.initialPosition) {
            initialPositions[group.id] = group.initialPosition;
            delete group.initialPosition;
          }
        }

        let elements = {
          nodes: nodes,
          // Weight, label, width, color, opacity and arrow are set by
          // updateEdgeProperties().
          edges: edges.map(edge => {
            return {
              data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                link_type: edge.linkType,
                directed: edge.directed,
                links: edge.links,
                weight: edge.links.length,
                label: '',
                width: 1,
                color: this.getLinkTypeColor(edge.linkType),
                opacity: 1,
                arrow: 'none',
              },
            };
          }).concat(this.computePartEdges().map(edge => {
            return {
              data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                directed: false,
                skeleton_id: edge.skeletonId,
                label: '',
                width: 2,
                color: edge.color,
                opacity: 1,
                arrow: 'none',
              },
              classes: 'part-edge',
            };
          })),
        };

        // Removing and reselecting elements would change the selection order
        let selectionOrder = new Map(this.selectionOrder);
        this.cy.elements().remove();
        this.cy.add(elements);

        let hasNewNodes = false;
        this.cy.batch(() => {
          let offset = 0;
          this.cy.elements().forEach(element => {
            let id = element.id();
            if (selected.has(id)) element.select();
            if (hidden.has(id)) this.setHidden(element, true);
            if (element.isNode()) {
              // A new group can reuse the ID of a former group
              if (id in initialPositions) {
                element.position(initialPositions[id]);
                element.lock();
              } else if (id in positions) {
                element.position(positions[id]);
                element.lock();
              } else {
                hasNewNodes = true;
                let member = element.data('members')[0];
                let previousPosition = memberPositions[GraphWidget2.getMemberKey(
                    member.skeletonId, member.part)] || skeletonPositions[member.skeletonId];
                if (previousPosition) {
                  offset += 40;
                  element.position({
                    x: previousPosition.x + offset,
                    y: previousPosition.y + offset,
                  });
                }
              }
            }
          });
        });
        this.selectionOrder = new Map(Array.from(selectionOrder).filter(
            ([id]) => this.cy.getElementById(id).selected()));

        // Forget locks and arrow shapes of nodes that don't exist anymore
        for (let id of this.lockedNodeIds) {
          if (this.cy.getElementById(id).empty()) this.lockedNodeIds.delete(id);
        }
        for (let id of this.arrowShapes.keys()) {
          if (this.cy.getElementById(id).empty()) this.arrowShapes.delete(id);
        }
        this.prunePathOrigins();
        this.pruneSelections();
        this.updateEdgeProperties();
        this.updateShowHiddenButton();
        // Nodes are created with source colors
        this.applyNodeColors();

        if (hasNewNodes) {
          this.runLayout(() => this.releaseLayoutLocks());
        } else {
          this.releaseLayoutLocks();
        }
      });
  };

  GraphWidget2.EDGE_WIDTH_FUNCTIONS = {
    identity: w => w,
    log: Math.log,
    log10: Math.log10,
    sqrt: Math.sqrt,
  };

  GraphWidget2.EDGE_LABEL_STRATEGIES = [
    {title: 'Absolute number of connections', value: 'absolute'},
    {title: 'Fraction of outbound connections', value: 'outbound-relative'},
    {title: 'Fraction of inbound connections', value: 'inbound-relative'},
  ];

  GraphWidget2.ARROW_SHAPES = ['triangle', 'tee', 'circle', 'square', 'diamond',
      'vee', 'triangle-tee', 'triangle-cross', 'triangle-backcurve', 'none'];

  GraphWidget2.prototype.getLinkTypeColor = function(linkType) {
    return (this.linkTypeColors.get(linkType) || this.linkTypeColors.get('default')).color;
  };

  GraphWidget2.prototype.getLinkTypeOpacity = function(linkType) {
    return (this.linkTypeColors.get(linkType) || this.linkTypeColors.get('default')).opacity;
  };

  /**
   * Change color and opacity of a link type's edges, called by the color
   * buttons of the link type list. Link types without an own entry start
   * with the default color and opacity.
   */
  GraphWidget2.prototype.updateLinkTypeColor = function(linkType, rgb, alpha,
      colorChanged, alphaChanged, colorHex) {
    let entry = this.linkTypeColors.get(linkType);
    if (!entry) {
      let defaults = this.linkTypeColors.get('default');
      entry = {color: defaults.color, opacity: defaults.opacity};
      this.linkTypeColors.set(linkType, entry);
    }
    if (colorChanged) entry.color = '#' + colorHex;
    if (alphaChanged) entry.opacity = alpha;
    if (colorChanged || alphaChanged) this.updateEdgeProperties();
  };

  GraphWidget2.prototype.setLinkTypeVisibility = function(linkType, visible) {
    if (visible) {
      this.selectedLinkTypes.add(linkType);
    } else {
      this.selectedLinkTypes.delete(linkType);
    }
  };

  /**
   * Update weight, label, width, color, opacity and arrow of all link edges
   * from the edge options, and filter edges by them. Filtered edges get the
   * "filtered" class, independent of manually hidden elements.
   */
  GraphWidget2.prototype.updateEdgeProperties = function() {
    if (!this.cy) return;
    let options = this.edgeOptions;
    let widthFunction = GraphWidget2.EDGE_WIDTH_FUNCTIONS[options.widthFunction];
    // Partner totals are computed once per graph node and relation
    let totals = new Map();
    let getTotal = (node, relation) => {
      let key = `${node.id()}|${relation}`;
      let total = totals.get(key);
      if (total === undefined) {
        total = this.getPartnerTotal(node, relation, options.minConfidence);
        totals.set(key, total);
      }
      return total;
    };

    this.cy.batch(() => {
      this.cy.edges().forEach(edge => {
        if (edge.hasClass('part-edge')) return;
        let weight = edge.data('links').reduce((count, link) =>
            link[3] >= options.minConfidence ? count + 1 : count, 0);
        let source = edge.source(), target = edge.target();
        let linkType = edge.data('link_type');
        let directed = edge.data('directed');

        let label = weight;
        if (options.labelStrategy !== 'absolute' && this.resolvedLinkPairs) {
          let pair = this.resolvedLinkPairs[linkType];
          let total = options.labelStrategy === 'outbound-relative' ?
              getTotal(source, pair.source) : getTotal(target, pair.target);
          // Two decimals precision
          label = total > 0 ? Math.round(100 * weight / total) / 100 : 0;
        }

        let color = this.getLinkTypeColor(linkType);
        if (directed && options.colorMode === 'source') {
          color = source.data('color');
        } else if (directed && options.colorMode === 'target') {
          color = target.data('color');
        }

        edge.data({
          weight: weight,
          label: label,
          // Width functions like log can be negative or undefined for small values
          width: options.minWidth + (weight > 0 ? Math.max(0, widthFunction(weight)) : 0),
          color: color,
          opacity: this.getLinkTypeOpacity(linkType),
          arrow: directed ? (this.arrowShapes.get(source.id()) || 'triangle') : 'none',
        });

        if (weight === 0 || weight < options.minLinks ||
            (options.hideSelfEdges && source.id() === target.id())) {
          edge.addClass('filtered');
        } else {
          edge.removeClass('filtered');
        }
      });
    });
  };

  /**
   * Count the partner links of all links with the passed in relation in a
   * graph node: links of other skeletons or of the same skeleton to the same
   * connectors, with the partner relation. This includes partners that aren't
   * part of the graph. Only link pairs with both confidences of at least
   * minConfidence are counted, and only links to connectors allowed by the
   * filter rules.
   */
  GraphWidget2.prototype.getPartnerTotal = function(node, relation, minConfidence) {
    let allowedConnectorIds = this.allowedConnectorIds;
    let total = 0;
    for (let member of node.data('members')) {
      let skeleton = this.skeletons.get(member.skeletonId);
      for (let [treenodeId, connectorId, relationName, confidence, partnerCounts] of skeleton.links) {
        if (relationName !== relation || confidence < minConfidence) continue;
        if (allowedConnectorIds && !allowedConnectorIds.has(connectorId)) continue;
        if (skeleton.nodes.get(treenodeId).part !== member.part) continue;
        for (let i = minConfidence - 1; i < 5; ++i) total += partnerCounts[i];
      }
    }
    return total;
  };

  /**
   * Use the passed in arrow shape for all directed edges leaving the selected
   * nodes.
   */
  GraphWidget2.prototype.setArrowShapeOfSelectedNodes = function(shape) {
    if (!this.cy) return;
    let nodes = this.cy.nodes(':selected');
    if (nodes.empty()) {
      CATMAID.warn("Select source nodes first!");
      return;
    }
    nodes.forEach(node => this.arrowShapes.set(node.id(), shape));
    this.updateEdgeProperties();
  };

  /**
   * Get whether a graph node represents an axon ('axo') or dendrite
   * ('dendro'), based on its part label from an axon/dendrite split. Returns
   * null for other nodes.
   */
  GraphWidget2.getCompartment = function(node) {
    let part = node.data('part');
    if (part === 'axon') return 'axo';
    if (part === 'dendrite' || part === 'backbone dendrite' ||
        part === 'dendritic terminals') {
      return 'dendro';
    }
    return null;
  };

  GraphWidget2.SYNAPSE_TYPES = {
    'axo-axonic': ['axo', 'axo'],
    'axo-dendritic': ['axo', 'dendro'],
    'dendro-axonic': ['dendro', 'axo'],
    'dendro-dendritic': ['dendro', 'dendro'],
  };

  /**
   * Hide or show synaptic edges by the compartments of their nodes, e.g. all
   * axo-dendritic edges. This needs nodes from axon/dendrite splits.
   */
  GraphWidget2.prototype.setSynapseTypeVisibility = function(type, visible) {
    if (!this.cy) return;
    let [sourceCompartment, targetCompartment] = GraphWidget2.SYNAPSE_TYPES[type];
    let edges = this.cy.edges().filter(edge =>
        edge.data('link_type') === 'synaptic-connector' &&
        GraphWidget2.getCompartment(edge.source()) === sourceCompartment &&
        GraphWidget2.getCompartment(edge.target()) === targetCompartment);
    if (edges.empty()) {
      CATMAID.info(`No ${type} edges found, split skeletons into axon and dendrite first`);
      return;
    }
    if (visible) {
      edges.removeClass('hidden');
    } else {
      edges.unselect();
      edges.addClass('hidden');
    }
    this.updateShowHiddenButton();
  };

  /**
   * Layouts available for this widget, see the Nodes tab. Fitting is done by
   * fitView(), to respect the view options. Layouts don't move locked nodes.
   */
  GraphWidget2.LAYOUTS = [
    {title: 'Spread (force-directed)', options: {name: 'spread'}},
    {title: 'Hierarchical', options: {name: 'breadthfirst'}},
    {title: 'Grid', options: {name: 'grid'}},
    {title: 'Circle', options: {name: 'circle'}},
    {title: 'Concentric (degree)', options: {name: 'concentric', minNodeSpacing: 80,
        concentric: node => node.degree(), levelWidth: nodes => nodes.maxDegree() / 4}},
    {title: 'Concentric (out degree)', options: {name: 'concentric', minNodeSpacing: 80,
        concentric: node => node.outdegree(), levelWidth: nodes => nodes.maxDegree() / 4}},
    {title: 'Concentric (in degree)', options: {name: 'concentric', minNodeSpacing: 80,
        concentric: node => node.indegree(), levelWidth: nodes => nodes.maxDegree() / 4}},
    {title: 'Random', options: {name: 'random'}},
    {title: 'Compound Spring Embedder', options: {name: 'cose'}},
    // Without positions, the preset layout keeps the current ones
    {title: 'Manual', options: {name: 'preset'}},
    {title: 'Dagre (DAG-based)', options: {name: 'dagre'}},
    {title: 'Cola (force-directed)', options: {name: 'cola'}},
  ];

  /**
   * Run the selected layout on all nodes and call the optional callback when
   * it is done.
   */
  GraphWidget2.prototype.runLayout = function(callback) {
    let layout = GraphWidget2.LAYOUTS[this.layoutIndex];
    this.cy.layout(Object.assign({}, layout.options, {
      fit: false,
      stop: () => {
        if (callback) callback();
        if (this.layout_fit) this.fitView();
      },
    })).run();
  };

  GraphWidget2.prototype.relayout = function() {
    if (!this.cy || this.cy.nodes().empty()) return;
    this.runLayout();
  };

  GraphWidget2.NODE_COLOR_MODES = [
    {title: 'source', value: 'source'},
    {title: 'review status (union)', value: 'union-review'},
    {title: 'review status (team)', value: 'whitelist-review'},
    {title: 'review status (own)', value: 'own-review'},
    {title: 'input/output', value: 'io'},
    {title: 'betweenness centrality', value: 'betweenness-centrality'},
    {title: 'circles of hell (upstream)', value: 'circles-of-hell-upstream'},
    {title: 'circles of hell (downstream)', value: 'circles-of-hell-downstream'},
  ];

  GraphWidget2.prototype.setNodeColorMode = function(mode) {
    this.nodeColorMode = mode;
    return this.applyNodeColors();
  };

  /**
   * Whether an element is shown: neither it nor, for edges, its nodes have the
   * hidden class. Cytoscape.js updates the cached visibility of edges only when
   * rendering, so the hidden class is tested directly.
   */
  GraphWidget2.isShown = function(element) {
    if (element.hasClass('hidden') || element.hasClass('filtered')) return false;
    return element.isNode() ||
        !(element.source().hasClass('hidden') || element.target().hasClass('hidden'));
  };

  /**
   * Get all shown edges that represent links, i.e. no part edges.
   */
  GraphWidget2.prototype.getShownLinkEdges = function() {
    return this.cy.edges().filter(edge => !edge.hasClass('part-edge') && GraphWidget2.isShown(edge));
  };

  /**
   * Get the color of a node in the "source" mode: its skeleton's or group's
   * color.
   */
  GraphWidget2.prototype.getSourceColor = function(node) {
    let groupId = node.data('group_id');
    let color = groupId ? this.groups.get(groupId).color :
        this.skeletons.get(node.data('skeleton_id')).model.color;
    return '#' + color.getHexString();
  };

  /**
   * Color all graph nodes according to the node color mode. Returns a promise
   * that resolves once colors are set.
   */
  GraphWidget2.prototype.applyNodeColors = function() {
    if (!this.cy) return Promise.resolve();
    let mode = this.nodeColorMode;
    // Results of earlier asynchronous colorings are ignored
    let token = this.nodeColorToken = {};
    let setColors = getColor => {
      this.cy.batch(() => {
        this.cy.nodes().forEach(node => node.data('color', getColor(node)));
      });
      // Edges can be colored like their nodes
      if (this.edgeOptions.colorMode !== 'link-type') this.updateEdgeProperties();
    };

    if (mode === 'source') {
      setColors(node => this.getSourceColor(node));
    } else if (mode.endsWith('-review')) {
      let skeletonIds = Array.from(this.skeletons.keys());
      if (skeletonIds.length === 0) return Promise.resolve();
      let data = {skeleton_ids: skeletonIds};
      if (mode === 'own-review') data.user_ids = [CATMAID.session.userid];
      else if (mode === 'whitelist-review') data.whitelist = true;
      return CATMAID.fetch(`${project.id}/skeletons/review-status`, 'POST', data)
        .then(json => {
          if (this.nodeColorToken !== token) return;
          setColors(node => {
            // Parts and groups show the mean review status of their skeletons
            let skeletonIds = node.data('skeleton_ids');
            let percent = skeletonIds.reduce((sum, skeletonId) => {
              let counts = json[skeletonId];
              return counts && counts[0] > 0 ? sum + Math.floor(100 * counts[1] / counts[0]) : sum;
            }, 0) / skeletonIds.length;
            return CATMAID.ReviewSystem.getBackgroundColor(percent);
          });
        })
        .catch(CATMAID.handleError);
    } else if (mode === 'io') {
      let io = GraphWidget2.getNodesIO(this.cy.nodes(), this.getShownLinkEdges());
      setColors(node => GraphWidget2.getIOColor(io.get(node.id())));
    } else if (mode === 'betweenness-centrality') {
      let centrality = this.computeBetweennessCentrality();
      let color = new THREE.Color();
      setColors(node => {
        // Hidden nodes have no centrality and are white, like disconnected ones
        let c = centrality.get(node.id()) || 0;
        return '#' + color.setHSL(0, c, 1 - (c / 2)).getHexString();
      });
    } else if (mode.startsWith('circles-of-hell-')) {
      let colors = this.computeCirclesOfHellColors(mode === 'circles-of-hell-upstream');
      setColors(node => colors.get(node.id()) || '#fff');
    } else {
      throw new CATMAID.ValueError(`Unknown node color mode: ${mode}`);
    }
    return Promise.resolve();
  };

  /**
   * Sum the weights of the passed in directed edges into inputs and outputs
   * per node. Returns a Map of node ID vs {inputs, outputs}.
   */
  GraphWidget2.getNodesIO = function(nodes, edges) {
    let io = new Map(nodes.map(node => [node.id(), {inputs: 0, outputs: 0}]));
    edges.forEach(edge => {
      if (!edge.data('directed')) return;
      io.get(edge.target().id()).inputs += edge.data('weight');
      io.get(edge.source().id()).outputs += edge.data('weight');
    });
    return io;
  };

  /**
   * Map inputs and outputs to a color: purely output nodes are red, purely
   * input nodes green, mixed nodes span the hue from red to green, with
   * balanced nodes being yellow. Nodes without both are white.
   */
  GraphWidget2.getIOColor = function(io) {
    if (io.inputs === 0) {
      return io.outputs === 0 ? '#fff' : '#f00';
    }
    if (io.outputs === 0) return '#0f0';
    return '#' + new THREE.Color().setHSL((io.inputs / (io.inputs + io.outputs)) * 0.333,
        1, 0.5).getHexString();
  };

  /**
   * Compute the normalized betweenness centrality of all shown nodes, along
   * shown directed link edges weighted by their link count. Returns a Map of
   * node ID vs value in [0, 1].
   */
  GraphWidget2.prototype.computeBetweennessCentrality = function() {
    // Cytoscape.js follows all outgoing edges of a node, so a separate graph
    // is needed to ignore hidden, part and undirected edges.
    let nodes = this.cy.nodes().filter(node => GraphWidget2.isShown(node));
    let edges = this.getShownLinkEdges().filter(edge => edge.data('directed'));
    let graph = cytoscape3({
      headless: true,
      elements: {
        nodes: nodes.map(node => ({data: {id: node.id()}})),
        edges: edges.map(edge => ({data: {id: edge.id(), source: edge.source().id(),
            target: edge.target().id(), weight: edge.data('weight')}})),
      },
    });
    let bc = graph.elements().betweennessCentrality({
      directed: true,
      weight: edge => edge.data('weight'),
    });
    let centrality = new Map(graph.nodes().map(node => [node.id(), bc.betweennessNormalized(node)]));
    graph.destroy();
    return centrality;
  };

  /**
   * Color nodes by their distance to the only selected node, following shown
   * link edges upstream or downstream. Undirected links are followed in both
   * directions. Returns a Map of node ID vs color, unreached nodes have none.
   */
  GraphWidget2.prototype.computeCirclesOfHellColors = function(upstream) {
    let colors = new Map();
    let selected = this.cy.nodes(':selected');
    if (selected.length !== 1) {
      if (selected.length > 1) CATMAID.info("Need 1 (and only 1) selected node!");
      return colors;
    }

    // Node ID vs IDs of nodes to walk to
    let next = new Map();
    let addStep = (from, to) => {
      let targets = next.get(from);
      if (targets) {
        targets.add(to);
      } else {
        next.set(from, new Set([to]));
      }
    };
    this.getShownLinkEdges().forEach(edge => {
      let source = edge.source().id(), target = edge.target().id();
      if (source === target) return;
      if (!edge.data('directed') || !upstream) addStep(source, target);
      if (!edge.data('directed') || upstream) addStep(target, source);
    });

    let circles = GraphWidget2.getCircles(selected.id(), next);
    circles.forEach((circle, i) => {
      // The selected node uses the selection color, the next circles get
      // lighter with increasing distance.
      let color = i === 0 ? '#b0ff72' :
          '#' + new THREE.Color().setHSL(0.66, 1, 0.55 + 0.45 * i / circles.length).getHexString();
      for (let nodeId of circle) colors.set(nodeId, color);
    });
    return colors;
  };

  /**
   * Breadth-first search from a start node along the passed in steps, a Map
   * of node ID vs Set of next node IDs. Returns a list of node ID lists, one
   * per distance, starting with the start node.
   */
  GraphWidget2.getCircles = function(startId, next) {
    let seen = new Set([startId]);
    let circles = [[startId]];
    while (true) {
      let circle = [];
      for (let nodeId of circles[circles.length - 1]) {
        for (let nextId of (next.get(nodeId) || [])) {
          if (seen.has(nextId)) continue;
          seen.add(nextId);
          circle.push(nextId);
        }
      }
      if (circle.length === 0) break;
      circles.push(circle);
    }
    return circles;
  };

  /**
   * Find all shown nodes without shown link edges to other nodes.
   */
  GraphWidget2.prototype.findUnconnectedNodes = function() {
    let connected = new Set();
    this.getShownLinkEdges().forEach(edge => {
      if (edge.source().id() === edge.target().id()) return;
      connected.add(edge.source().id());
      connected.add(edge.target().id());
    });
    return this.cy.nodes().filter(node => GraphWidget2.isShown(node) && !connected.has(node.id()));
  };

  GraphWidget2.prototype.hideUnconnectedNodes = function() {
    if (!this.cy) return;
    let nodes = this.findUnconnectedNodes();
    if (nodes.empty()) {
      CATMAID.info("No unconnected nodes found");
      return;
    }
    nodes.forEach(node => this.hiddenUnconnectedIds.add(node.id()));
    nodes.unselect();
    this.setHidden(nodes, true);
    this.updateShowHiddenButton();
  };

  /**
   * Show nodes hidden by hideUnconnectedNodes(), other hidden nodes stay
   * hidden.
   */
  GraphWidget2.prototype.showUnconnectedNodes = function() {
    if (!this.cy) return;
    for (let nodeId of this.hiddenUnconnectedIds) {
      this.setHidden(this.cy.getElementById(nodeId), false);
    }
    this.hiddenUnconnectedIds.clear();
    this.updateShowHiddenButton();
  };

  /**
   * Remove all skeletons whose graph nodes are all unconnected, after asking
   * for confirmation. Skeletons with a connected part or group are kept.
   */
  GraphWidget2.prototype.removeUnconnectedNodes = function() {
    if (!this.cy) return;
    let unconnected = new Set(this.findUnconnectedNodes().map(node => node.id()));
    let skeletonIds = Array.from(this.skeletons.keys()).filter(skeletonId => {
      let nodes = this.getSkeletonNodes(skeletonId);
      return nodes.nonempty() && nodes.every(node => unconnected.has(node.id()));
    });
    if (skeletonIds.length === 0) {
      CATMAID.info("No skeletons with only unconnected nodes found");
      return;
    }
    let dialog = new CATMAID.OptionsDialog("Remove unconnected");
    dialog.appendMessage(`Remove ${skeletonIds.length} skeleton(s) without connections ` +
        'to other nodes?');
    dialog.onOK = () => {
      this.removeSkeletons(skeletonIds).catch(CATMAID.handleError);
    };
    dialog.show(350, 'auto', true);
  };

  /**
   * Unlock all nodes that weren't locked by the user.
   */
  GraphWidget2.prototype.releaseLayoutLocks = function() {
    this.cy.nodes().forEach(node => {
      if (!this.lockedNodeIds.has(node.id())) node.unlock();
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
          // Group nodes keep their group color and label
          if (node.data('group_id')) return;
          if (this.nodeColorMode === 'source') node.data('color', color);
          node.data('label', this.getNodeLabel(skeletonId, node.data('part')));
        });
        this.cy.edges('.part-edge').forEach(edge => {
          if (edge.data('skeleton_id') === Number(skeletonId)) {
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

  /**
   * Show the number of hidden elements on the "Show hidden" button, which is
   * disabled if nothing is hidden.
   */
  GraphWidget2.prototype.updateShowHiddenButton = function() {
    let button = this.showHiddenButton;
    if (!button) return;
    let count = this.cy ? this.cy.elements('.hidden').length : 0;
    button.value = count > 0 ? `Show hidden (${count})` : 'Show hidden';
    button.disabled = count === 0;
  };

  /**
   * Hide all selected nodes and edges. Edges of hidden nodes are hidden too.
   */
  GraphWidget2.prototype.hideSelected = function() {
    if (!this.cy) return;
    let selected = this.cy.elements(':selected');
    if (selected.empty()) {
      CATMAID.info("Select one or more nodes or edges first!");
      return;
    }
    selected.unselect();
    this.setHidden(selected, true);
    this.updateShowHiddenButton();
  };

  /**
   * Hide or show the passed in elements by setting or removing their hidden
   * class. The stylesheet also hides the edges of hidden nodes. Cytoscape.js
   * doesn't update the style of edges when the classes of their nodes
   * change, so this is done explicitly.
   */
  GraphWidget2.prototype.setHidden = function(elements, hidden) {
    if (hidden) {
      elements.addClass('hidden');
    } else {
      elements.removeClass('hidden');
    }
    elements.nodes().connectedEdges().updateStyle();
  };

  GraphWidget2.prototype.showHidden = function() {
    if (!this.cy) return;
    this.setHidden(this.cy.elements(), false);
    this.hiddenUnconnectedIds.clear();
    this.updateShowHiddenButton();
  };

  /**
   * Lock or unlock the positions of all selected nodes. Locks are kept when
   * the graph is updated.
   */
  GraphWidget2.prototype.lockSelected = function(lock) {
    if (!this.cy) return;
    let nodes = this.cy.nodes(':selected');
    if (nodes.empty()) {
      CATMAID.info("Select one or more nodes first!");
      return;
    }
    nodes.forEach(node => {
      if (lock) {
        this.lockedNodeIds.add(node.id());
        node.lock();
      } else {
        this.lockedNodeIds.delete(node.id());
        node.unlock();
      }
    });
  };

  /**
   * Remove the skeletons of all selected visible nodes, including all parts of
   * split skeletons and all members of groups, after asking for confirmation.
   * Selected edges without selected nodes are hidden, because edges are
   * recreated from links with every graph update.
   */
  GraphWidget2.prototype.removeSelected = function() {
    if (!this.cy) return;
    let skeletonIds = this.getSelectedSkeletonIds();
    if (skeletonIds.length === 0) {
      let edges = this.cy.edges(':selected');
      if (edges.empty()) {
        CATMAID.info("Select one or more nodes first!");
        return;
      }
      edges.unselect();
      edges.addClass('hidden');
      this.updateShowHiddenButton();
      CATMAID.info(`Edges can't be removed, hid ${edges.length} selected edge(s) instead`);
      return;
    }
    let dialog = new CATMAID.OptionsDialog("Remove skeletons");
    dialog.appendMessage(`Remove ${skeletonIds.length} skeleton(s) of the selected nodes, ` +
        'including all their parts and group memberships?');
    dialog.onOK = () => {
      this.removeSkeletons(skeletonIds).catch(CATMAID.handleError);
    };
    dialog.show(350, 'auto', true);
  };

  /**
   * Select all visible nodes whose label contains the passed in text, or
   * matches it as regular expression if it starts with '/'. The current
   * selection is kept.
   */
  GraphWidget2.prototype.selectByName = function(text) {
    if (!this.cy) return;
    let match = CATMAID.createTextMatchingFunction(text);
    if (!match) return;
    let count = 0;
    this.cy.nodes(':visible').forEach(node => {
      if (match(node.data('label'))) {
        node.select();
        ++count;
      }
    });
    CATMAID.msg("Select by name", `Selected ${count} node(s)`);
  };

  GraphWidget2.prototype.invertSelection = function() {
    if (!this.cy) return;
    this.cy.nodes(':visible').forEach(node => {
      if (node.selected()) {
        node.unselect();
      } else {
        node.select();
      }
    });
  };

  /**
   * Label selected synaptic edges with their risk: how likely the target
   * would lose the edge's synapses due to a single error in its arbor. An
   * edge is considered if it is selected or both its nodes are. Edges into
   * groups are ignored.
   */
  GraphWidget2.prototype.measureEdgeRisk = function() {
    if (!this.cy) return Promise.resolve();
    // Target skeleton ID vs list of edges
    let edgesByTarget = new Map();
    let autapses = 0;
    this.getShownLinkEdges().forEach(edge => {
      // Risk is computed from synaptic inputs only
      if (edge.data('link_type') !== 'synaptic-connector') return;
      if (!edge.selected() && !(edge.source().selected() && edge.target().selected())) return;
      let target = edge.target();
      if (target.data('group_id')) return;
      if (edge.source().id() === target.id()) {
        edge.data('label', `${edge.data('weight')} [MAX]`);
        ++autapses;
        return;
      }
      let targetSkeletonId = target.data('skeleton_id');
      let edges = edgesByTarget.get(targetSkeletonId);
      if (edges) {
        edges.push(edge);
      } else {
        edgesByTarget.set(targetSkeletonId, [edge]);
      }
    });

    if (edgesByTarget.size === 0) {
      if (autapses === 0) {
        CATMAID.info("Select at least 2 connected nodes, that are not groups!");
      }
      return Promise.resolve();
    }

    return Promise.all(Array.from(edgesByTarget, ([skeletonId, edges]) => {
        return CATMAID.fetch(`${project.id}/${skeletonId}/1/1/0/compact-arbor`)
          .then(json => {
            let ap = new CATMAID.ArborParser().init('compact-arbor', json);
            GraphWidget2.prepareRiskArbor(ap);
            for (let edge of edges) {
              let minConfidence = this.edgeOptions.minConfidence;
              let risk = GraphWidget2.computeEdgeRisk(ap, edge.data('links')
                  .filter(link => link[3] >= minConfidence).map(link => link[2]));
              if (risk === null) {
                CATMAID.info(`Couldn't measure the risk of edge ${edge.source().data('label')} ` +
                    `→ ${edge.target().data('label')}, the skeleton changed`);
                continue;
              }
              let label = risk.toFixed(2);
              if (label === '0.00') label = 'MIN';
              else if (label === '1.00') label = 'MAX';
              edge.data('risk', risk);
              edge.data('label', `${edge.data('weight')} [${label}]`);
            }
          });
      }))
      .catch(CATMAID.handleError);
  };

  /**
   * Prepare an arbor for edge risk computation: reroot it at the node with
   * the highest centrifugal flow centrality closest to the root, if the
   * skeleton has outputs.
   */
  GraphWidget2.prepareRiskArbor = function(ap) {
    if (ap.n_inputs === 0 || ap.n_outputs === 0) return;
    let fc = ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs);
    if (!fc) return;
    let max = 0;
    let node = null;
    for (let nodeId in fc) {
      if (max < fc[nodeId].centrifugal) {
        max = fc[nodeId].centrifugal;
        node = nodeId;
      }
    }
    if (node === null) return;
    // Walk towards the root while the centrality stays maximal
    let child = node;
    while (fc[node] && fc[node].centrifugal === max) {
      child = node;
      node = ap.arbor.edges[node];
    }
    ap.arbor.reroot(child);
  };

  /**
   * Compute the risk of an edge into the arbor of the passed in ArborParser,
   * represented by the treenodes receiving its synapses: one minus the
   * fraction of all inputs that would be lost by cutting the arbor at the
   * nearest common ancestor of these treenodes. Returns null if none of the
   * treenodes is part of the arbor anymore or the arbor has no inputs.
   */
  GraphWidget2.computeEdgeRisk = function(ap, treenodeIds) {
    if (ap.n_inputs === 0) return null;
    let synapseNodes = {};
    for (let treenodeId of treenodeIds) {
      if (ap.arbor.contains(treenodeId)) synapseNodes[treenodeId] = true;
    }
    if (CATMAID.tools.isEmpty(synapseNodes)) return null;
    let lca = ap.arbor.nearestCommonAncestor(synapseNodes);
    let subNodes = ap.arbor.subArbor(lca).nodes();
    let lostInputs = 0;
    for (let nodeId in ap.inputs) {
      if (subNodes[nodeId] !== undefined) lostInputs += ap.inputs[nodeId];
    }
    return 1 - lostInputs / ap.n_inputs;
  };

  /**
   * Get the selected nodes in the order they were selected.
   */
  GraphWidget2.prototype.getOrderedSelectedNodes = function() {
    let infinity = Number.POSITIVE_INFINITY;
    return this.cy.nodes(':selected').sort((a, b) =>
        (this.selectionOrder.get(a.id()) || infinity) -
        (this.selectionOrder.get(b.id()) || infinity));
  };

  /**
   * Report locked nodes that couldn't be moved.
   */
  GraphWidget2.reportLockedNodes = function(nodes) {
    let nLocked = nodes.filter(node => node.locked()).length;
    if (nLocked > 0) CATMAID.info(`${nLocked} locked node(s) weren't moved`);
  };

  /**
   * Give all selected nodes the coordinate of the first selected node on the
   * passed in axis ('x' or 'y').
   */
  GraphWidget2.prototype.alignNodes = function(axis) {
    if (!this.cy) return;
    let nodes = this.getOrderedSelectedNodes();
    if (nodes.length < 2) {
      CATMAID.warn("Please select at least two nodes");
      return;
    }
    let value = nodes[0].position(axis);
    let others = nodes.slice(1);
    // Locked nodes keep their position
    others.forEach(node => node.position(axis, value));
    GraphWidget2.reportLockedNodes(others);
  };

  /**
   * Space the selected nodes evenly on the passed in axis ('x' or 'y'),
   * between the two outermost ones.
   */
  GraphWidget2.prototype.distributeNodes = function(axis) {
    if (!this.cy) return;
    let nodes = this.cy.nodes(':selected').sort((a, b) => a.position(axis) - b.position(axis));
    if (nodes.length < 3) {
      CATMAID.warn("Please select at least three nodes");
      return;
    }
    let first = nodes[0].position(axis);
    let step = (nodes[nodes.length - 1].position(axis) - first) / (nodes.length - 1);
    let inner = nodes.slice(1, nodes.length - 1);
    // Locked nodes keep their position
    inner.forEach((node, i) => node.position(axis, first + (i + 1) * step));
    GraphWidget2.reportLockedNodes(inner);
  };

  /**
   * Move a node to the nearest point of the grid.
   */
  GraphWidget2.prototype.snapToGrid = function(node) {
    let size = this.gridOptions.size;
    let position = node.position();
    node.position({
      x: Math.round(position.x / size) * size,
      y: Math.round(position.y / size) * size,
    });
  };

  GraphWidget2.prototype.snapSelectedToGrid = function() {
    if (!this.cy) return;
    let nodes = this.cy.nodes(':selected');
    if (nodes.empty()) {
      CATMAID.warn("Please select nodes first");
      return;
    }
    nodes.forEach(node => this.snapToGrid(node));
    GraphWidget2.reportLockedNodes(nodes);
  };

  GraphWidget2.prototype.nextGroupId = function() {
    let max = 0;
    for (let groupId of this.groups.keys()) {
      max = Math.max(max, Number(groupId.substring(1)));
    }
    return `g${max + 1}`;
  };

  /**
   * Create a new group from the passed in members, a Map of member key vs
   * {skeletonId, part}. Members are removed from their previous groups, groups
   * left empty are removed. Doesn't update the graph.
   */
  GraphWidget2.prototype.createGroup = function(members, label, color,
      hideSelfEdges, position) {
    // Get the ID first, so that the new group doesn't take over the graph node
    // of a merged group.
    let groupId = this.nextGroupId();
    for (let [otherGroupId, group] of this.groups) {
      for (let key of members.keys()) group.members.delete(key);
      if (group.members.size === 0) this.groups.delete(otherGroupId);
    }
    this.groups.set(groupId, {
      id: groupId,
      label: label,
      color: color,
      hideSelfEdges: hideSelfEdges,
      members: members,
      initialPosition: position,
    });
    return groupId;
  };

  /**
   * Collect the group members of the passed in graph nodes, along with their
   * mean position and mean color.
   */
  GraphWidget2.prototype.collectMembers = function(nodes) {
    let members = new Map();
    let position = {x: 0, y: 0};
    let color = new THREE.Color(0, 0, 0);
    nodes.forEach(node => {
      let p = node.position();
      position.x += p.x;
      position.y += p.y;
      color.add(new THREE.Color(node.data('color')));
      for (let member of node.data('members')) {
        members.set(GraphWidget2.getMemberKey(member.skeletonId, member.part), member);
      }
    });
    position.x /= nodes.length;
    position.y /= nodes.length;
    color.multiplyScalar(1 / nodes.length);
    return {members, position, color};
  };

  /**
   * Append the selected skeletons of the selected source and group them,
   * including all parts of already loaded split skeletons.
   */
  GraphWidget2.prototype.appendAsGroup = function() {
    let models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    let skeletonIds = Object.keys(models).map(Number);
    if (skeletonIds.length === 0) {
      CATMAID.info('Selected source is empty.');
      return Promise.resolve();
    }
    if (skeletonIds.length === 1) {
      return this.append(models);
    }
    return this.append(models)
      .then(() => {
        let members = new Map();
        for (let skeletonId of skeletonIds) {
          let skeleton = this.skeletons.get(skeletonId);
          // Skeletons can fail to load
          if (!skeleton) continue;
          for (let part of skeleton.partLabels) {
            members.set(GraphWidget2.getMemberKey(skeletonId, part),
                {skeletonId: skeletonId, part: part});
          }
        }
        if (members.size === 0) return;
        return this.appendGroup(members);
      });
  };

  /**
   * Ask for the name, color and options of a new group of the passed in
   * members, a Map of member key vs {skeletonId, part}, and create it. The
   * name can be picked from the skeletons' annotations and node labels.
   */
  GraphWidget2.prototype.appendGroup = function(members, position, color) {
    let skeletonIds = Array.from(new Set(Array.from(members.values(),
        member => member.skeletonId)));
    return CATMAID.fetch(`${project.id}/annotations/forskeletons`, 'POST', {
        skeleton_ids: skeletonIds,
      })
      .then(json => {
        let annotationSets = skeletonIds.map(skeletonId => new Set(
            (json.skeletons[skeletonId] || []).map(annotation => annotation.id)));
        let allIds = new Set();
        for (let ids of annotationSets) {
          for (let id of ids) allIds.add(id);
        }
        let commonIds = Array.from(allIds).filter(id => annotationSets.every(ids => ids.has(id)));
        let toNames = ids => ids.map(id => json.annotations[id]).sort();
        let common = ['--'].concat(toNames(commonIds));
        let all = ['--'].concat(toNames(Array.from(allIds)));
        let names = ['--'].concat(Array.from(members.values(),
            member => this.getNodeLabel(member.skeletonId, member.part)).sort());

        let idSuffix = `-graph-widget-2-${this.widgetID}`;
        let dialog = new CATMAID.OptionsDialog("Group properties");
        dialog.appendMessage(`Creating new group with ${members.size} node(s) ` +
            `of ${skeletonIds.length} neuron(s).`);
        dialog.appendMessage("Choose a group name from:");
        dialog.appendMessage("(Will pick first non-empty match.)");
        let commonChoice = dialog.appendChoice("Common annotations: ",
            `gg-common${idSuffix}`, common, common, common[0]);
        let allChoice = dialog.appendChoice("All annotations: ",
            `gg-all${idSuffix}`, all, all, all[0]);
        let nameChoice = dialog.appendChoice("All node names: ",
            `gg-names${idSuffix}`, names, names, names[0]);
        let typedName = dialog.appendField("Or type a new name: ",
            `gg-typed${idSuffix}`, "", true);
        let hideSelfEdges = dialog.appendCheckbox("Hide intragroup edges",
            `gg-edges${idSuffix}`, true);
        let appendCount = dialog.appendCheckbox("Append number of neurons to name",
            `gg-number${idSuffix}`, true);
        let colorMessage = dialog.appendMessage("Choose group color: ");
        let groupColor = color ? '#' + color.getHexString() : '#aaaaff';
        let colorButton = document.createElement('button');
        colorButton.appendChild(document.createTextNode('Color'));
        colorMessage.appendChild(colorButton);
        CATMAID.ColorPicker.enable(colorButton, {
          initialColor: groupColor,
          onColorChange: rgb => {
            groupColor = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
                Math.round(rgb.g * 255), Math.round(rgb.b * 255));
          },
        });

        dialog.onOK = () => {
          let label = [typedName, commonChoice, allChoice, nameChoice]
              .map(element => element.value.trim())
              .find(text => text.length > 0 && text !== '--');
          if (!label) {
            // Keeps the dialog open
            throw new CATMAID.ValueError("You must choose a name!");
          }
          if (appendCount.checked) label += ` [#${skeletonIds.length}]`;
          this.createGroup(members, label, new THREE.Color(groupColor),
              hideSelfEdges.checked, position);
          this.updateGraph().catch(CATMAID.handleError);
        };

        dialog.show(350, 'auto', true);
        typedName.focus();
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Group all selected graph nodes into a single node. Selected groups are
   * merged into the new group.
   */
  GraphWidget2.prototype.group = function() {
    if (!this.cy) return Promise.resolve();
    let nodes = this.cy.nodes().filter(node => node.selected() && node.visible());
    if (nodes.length < 2) {
      CATMAID.info("Select at least 2 nodes!");
      return Promise.resolve();
    }
    let {members, position, color} = this.collectMembers(nodes);
    return this.appendGroup(members, position, color);
  };

  /**
   * Split all selected group nodes into their member nodes.
   */
  GraphWidget2.prototype.ungroup = function() {
    if (!this.cy) return Promise.resolve();
    let count = 0;
    this.cy.nodes().forEach(node => {
      let groupId = node.data('group_id');
      if (groupId && node.selected()) {
        this.groups.delete(groupId);
        ++count;
      }
    });
    if (count === 0) {
      CATMAID.info("Nothing to ungroup!");
      return Promise.resolve();
    }
    return this.updateGraph();
  };

  /**
   * Group all ungrouped nodes with the same label, one group per label.
   */
  GraphWidget2.prototype.groupEquallyNamed = function() {
    if (!this.cy) return Promise.resolve();
    let nodesByLabel = new Map();
    this.cy.nodes().forEach(node => {
      if (node.data('group_id')) return;
      let label = node.data('label');
      let nodes = nodesByLabel.get(label);
      if (nodes) {
        nodes.push(node);
      } else {
        nodesByLabel.set(label, [node]);
      }
    });
    let created = 0;
    for (let [label, nodes] of nodesByLabel) {
      if (nodes.length < 2) continue;
      let {members, position} = this.collectMembers(nodes);
      this.createGroup(members, label, new THREE.Color(nodes[0].data('color')),
          false, position);
      ++created;
    }
    if (created === 0) {
      CATMAID.info("No equally named nodes found");
      return Promise.resolve();
    }
    return this.updateGraph();
  };

  /**
   * Group all ungrouped nodes with the same color, one group per color. The
   * name of each group is asked for.
   */
  GraphWidget2.prototype.groupEquallyColored = function() {
    if (!this.cy) return Promise.resolve();
    let nodesByColor = new Map();
    this.cy.nodes().forEach(node => {
      if (node.data('group_id')) return;
      let color = node.data('color');
      let nodes = nodesByColor.get(color);
      if (nodes) {
        nodes.push(node);
      } else {
        nodesByColor.set(color, [node]);
      }
    });
    let colors = Array.from(nodesByColor.keys()).filter(color => nodesByColor.get(color).length > 1);
    if (colors.length === 0) {
      CATMAID.info("No equally colored nodes found");
      return Promise.resolve();
    }

    let groupNames = new Map();
    let createGroups = () => {
      for (let color of colors) {
        let nodes = nodesByColor.get(color);
        let {members, position} = this.collectMembers(nodes);
        this.createGroup(members, groupNames.get(color), new THREE.Color(color),
            false, position);
      }
      this.updateGraph().catch(CATMAID.handleError);
    };

    // Ask for one group name per color
    let index = 0;
    let askForNextGroupName = () => {
      if (index === colors.length) {
        createGroups();
        return;
      }
      let color = colors[index];
      let nameField;
      let dialog = new CATMAID.OptionsDialog(`Group name for color ${color}`, {
        'Next': () => {
          let name = nameField.value.trim();
          if (name.length === 0) {
            // Keeps the dialog open
            throw new CATMAID.ValueError("Please enter a name");
          }
          groupNames.set(color, name);
          ++index;
          askForNextGroupName();
        },
      });
      let message = dialog.appendMessage("Please enter a name for the group with color ");
      let colorPane = document.createElement('span');
      colorPane.style.height = '1em';
      colorPane.style.width = '5em';
      colorPane.style.background = color;
      colorPane.style.display = 'inline-block';
      colorPane.style.border = '1px solid black';
      colorPane.style.verticalAlign = 'middle';
      message.appendChild(colorPane);
      nameField = dialog.appendField('Name: ', `gg-color-name-graph-widget-2-${this.widgetID}`,
          '', true);
      dialog.show(400, 'auto', true);
      nameField.focus();
    };
    askForNextGroupName();
    return Promise.resolve();
  };

  /**
   * Get all groups as CATMAID.SkeletonGroup instances, implementing the
   * SkeletonGroupSource interface. Grouped parts are represented by their
   * whole skeleton.
   */
  GraphWidget2.prototype.getGroups = function() {
    return Array.from(this.groups.values(), group => {
      let models = {};
      for (let member of group.members.values()) {
        models[member.skeletonId] = this.skeletons.get(member.skeletonId).model.clone();
      }
      return new CATMAID.SkeletonGroup(models, group.label, group.color.clone());
    });
  };

  /**
   * Get one CATMAID.SkeletonGroup per selected graph node, implementing the
   * SkeletonGroupSource interface.
   */
  GraphWidget2.prototype.getSelectedGroups = function() {
    if (!this.cy) return [];
    let groups = [];
    this.cy.nodes().forEach(node => {
      if (!node.selected()) return;
      let models = {};
      for (let skeletonId of node.data('skeleton_ids')) {
        models[skeletonId] = this.skeletons.get(skeletonId).model.clone();
      }
      groups.push(new CATMAID.SkeletonGroup(models, node.data('label'),
          new THREE.Color(node.data('color'))));
    });
    return groups;
  };

  /**
   * Get the members of all selected and shown graph nodes: a map of member
   * keys vs {skeletonId, part}.
   */
  GraphWidget2.prototype.getSelectedMembers = function() {
    let members = new Map();
    if (!this.cy) return members;
    this.cy.nodes(':selected').forEach(node => {
      if (!GraphWidget2.isShown(node)) return;
      for (let member of node.data('members')) {
        members.set(GraphWidget2.getMemberKey(member.skeletonId, member.part), member);
      }
    });
    return members;
  };

  /**
   * Sort the passed in members into the IDs of unsplit skeletons and the
   * parts of split skeletons to grow from. Each part comes with the IDs of
   * all connectors its treenodes are linked to, to limit back-end queries to
   * the links of this part. Connectors that aren't allowed by the filter
   * rules and parts without links are left out.
   */
  GraphWidget2.prototype.collectGrowSeeds = function(members) {
    let skeletonIds = [];
    let parts = [];
    for (let member of members) {
      let skeleton = this.skeletons.get(member.skeletonId);
      if (!skeleton) continue;
      if (skeleton.splitNodes.size === 0) {
        skeletonIds.push(member.skeletonId);
        continue;
      }
      let allowedConnectorIds = this.allowedConnectorIds;
      let connectorIds = new Set();
      for (let [treenodeId, connectorId] of skeleton.links) {
        if (allowedConnectorIds && !allowedConnectorIds.has(connectorId)) continue;
        if (skeleton.nodes.get(treenodeId).part === member.part) {
          connectorIds.add(connectorId);
        }
      }
      // Without allowed connectors, the back-end follows all links
      if (connectorIds.size === 0) continue;
      parts.push({
        skeletonId: member.skeletonId,
        part: member.part,
        connectorIds: Array.from(connectorIds),
      });
    }
    return {skeletonIds, parts};
  };

  /**
   * Get the IDs of all skeletons that are connected to the passed in
   * skeletons through links of the selected link types, over the passed in
   * number of circles. Partners need the passed in minimum number of links
   * of a single link type, -1 excludes all up- or downstream partners.
   * Only links to the passed in connectors are followed, by default the ones
   * allowed by the filter rules. Without filter rules, all are followed.
   */
  GraphWidget2.prototype.fetchPartners = function(skeletonIds, nCircles,
      minUpstream, minDownstream, allowedConnectorIds) {
    if (!allowedConnectorIds && this.allowedConnectorIds) {
      allowedConnectorIds = Array.from(this.allowedConnectorIds);
    }
    // The back-end follows all links if no connector is passed in
    if (allowedConnectorIds && allowedConnectorIds.length === 0) {
      return Promise.resolve([]);
    }
    return CATMAID.fetch(`${project.id}/graph/circlesofhell`, 'POST', {
        skeleton_ids: skeletonIds,
        n_circles: nCircles,
        min_pre: minUpstream,
        min_post: minDownstream,
        link_types: Array.from(this.selectedLinkTypes),
        allowed_connector_ids: allowedConnectorIds,
      })
      .then(json => json[0]);
  };

  /**
   * Get the IDs of all skeletons that are directly connected to at least one
   * of the passed in skeleton parts, see collectGrowSeeds(). The minimum
   * number of links applies to each part on its own.
   */
  GraphWidget2.prototype.fetchPartPartners = function(parts, minUpstream, minDownstream) {
    return Promise.all(parts.map(part => this.fetchPartners([part.skeletonId], 1,
          minUpstream, minDownstream, part.connectorIds)))
      .then(results => Array.from(new Set([].concat(...results))));
  };

  /**
   * Get the passed in skeleton IDs that have at least one annotation
   * matching the passed in regular expression. Without one, all are returned.
   */
  GraphWidget2.prototype.filterByAnnotation = function(skeletonIds, regex) {
    if (!regex || skeletonIds.length === 0) return Promise.resolve(skeletonIds);
    return CATMAID.fetch(`${project.id}/annotations/forskeletons`, 'POST', {
        skeleton_ids: skeletonIds,
      })
      .then(json => skeletonIds.filter(skeletonId => {
        let annotations = json.skeletons[skeletonId];
        return annotations && annotations.some(a => regex.test(json.annotations[a.id]));
      }));
  };

  /**
   * Append the passed in skeletons that aren't part of the graph yet. If
   * there are none, the passed in message is shown.
   */
  GraphWidget2.prototype.appendGrown = function(skeletonIds, emptyMessage) {
    let color = new THREE.Color(0xffae56);
    let models = {};
    for (let skeletonId of skeletonIds) {
      if (this.skeletons.has(Number(skeletonId))) continue;
      models[skeletonId] = new CATMAID.SkeletonModel(Number(skeletonId), "", color);
    }
    let count = Object.keys(models).length;
    if (count === 0) {
      CATMAID.info(emptyMessage);
      return Promise.resolve();
    }
    return this.append(models)
      .then(() => CATMAID.msg("Grow", `Added ${count} neuron(s)`));
  };

  /**
   * Whether growing is possible at all. Without a selected link type the
   * back-end would fall back to synaptic links.
   */
  GraphWidget2.prototype.canGrow = function() {
    if (this.selectedLinkTypes.size === 0) {
      CATMAID.warn("Select at least one link type in the Edges tab first");
      return false;
    }
    return true;
  };

  /**
   * Add the partners of all selected nodes to the graph, over as many orders
   * as set in the grow options. Partners are connected through links of the
   * selected link types. Selected parts of split skeletons only grow along
   * their own links. Partners further away than the first order are found
   * through whole skeletons.
   */
  GraphWidget2.prototype.growCircles = function() {
    let options = this.growOptions;
    let seeds = this.collectGrowSeeds(this.getSelectedMembers().values());
    if (seeds.skeletonIds.length === 0 && seeds.parts.length === 0) {
      CATMAID.info("Select one or more nodes with links first!");
      return Promise.resolve();
    }
    if (options.minUpstream === -1 && options.minDownstream === -1) {
      CATMAID.warn("Can't grow with neither upstream nor downstream partners");
      return Promise.resolve();
    }
    if (!this.canGrow()) return Promise.resolve();
    let regex = null;
    if (options.annotationFilter !== '') {
      try {
        regex = new RegExp(options.annotationFilter, 'i');
      } catch (error) {
        CATMAID.warn(`Invalid filter expression: ${options.annotationFilter}`);
        return Promise.resolve();
      }
    }

    let firstCircle = [this.fetchPartPartners(seeds.parts, options.minUpstream,
        options.minDownstream)];
    if (seeds.skeletonIds.length > 0) {
      firstCircle.push(this.fetchPartners(seeds.skeletonIds, 1,
          options.minUpstream, options.minDownstream));
    }
    return Promise.all(firstCircle)
      .then(results => this.filterByAnnotation(
          Array.from(new Set([].concat(...results))), regex))
      .then(partners => {
        // Growing continues from the partners found so far. Split skeletons
        // aren't included, to not grow along their unselected parts.
        let skeletonIds = Array.from(new Set(seeds.skeletonIds.concat(partners)));
        if (options.circles === 1 || skeletonIds.length === 0) return partners;
        return this.fetchPartners(skeletonIds, options.circles - 1,
              options.minUpstream, options.minDownstream)
          .then(furtherPartners => this.filterByAnnotation(furtherPartners, regex))
          .then(furtherPartners => partners.concat(furtherPartners));
      })
      .then(partners => this.appendGrown(partners, "No new partners found"))
      .catch(CATMAID.handleError);
  };

  /**
   * Add the members of all selected nodes to the path sources or targets,
   * depending on the passed in type: 'source' or 'target'.
   */
  GraphWidget2.prototype.pickPathOrigins = function(type) {
    let members = this.getSelectedMembers();
    if (members.size === 0) {
      CATMAID.info("Select one or more nodes first!");
      return;
    }
    for (let [key, member] of members) {
      this.pathOrigins[type].set(key, member);
    }
    this.updatePathOriginButtons();
  };

  GraphWidget2.prototype.clearPathOrigins = function(type) {
    this.pathOrigins[type].clear();
    this.updatePathOriginButtons();
  };

  /**
   * Forget path sources and targets that don't exist anymore, because their
   * skeleton was removed or split differently.
   */
  GraphWidget2.prototype.prunePathOrigins = function() {
    for (let origins of Object.values(this.pathOrigins)) {
      for (let [key, member] of origins) {
        let skeleton = this.skeletons.get(member.skeletonId);
        if (!skeleton || !skeleton.partLabels.includes(member.part)) {
          origins.delete(key);
        }
      }
    }
    this.updatePathOriginButtons();
  };

  GraphWidget2.prototype.updatePathOriginButtons = function() {
    if (!this.pathOriginButtons) return;
    for (let type in this.pathOrigins) {
      let count = this.pathOrigins[type].size;
      this.pathOriginButtons[type].value = `Pick ${type}s` + (count > 0 ? ` (${count})` : '');
    }
  };

  /**
   * Get all picked path sources or targets whose graph node is shown.
   */
  GraphWidget2.prototype.getShownPathOrigins = function(type) {
    let members = [];
    for (let member of this.pathOrigins[type].values()) {
      let skeleton = this.skeletons.get(member.skeletonId);
      let node = this.cy.getElementById(this.getGraphNodeId(skeleton, member.part));
      if (node.nonempty() && GraphWidget2.isShown(node)) members.push(member);
    }
    return members;
  };

  /**
   * Add all skeletons to the graph that are part of a path from a picked
   * source to a picked target. Paths follow links of the selected link types
   * and have as many hops as set in the grow options. For parts of split
   * skeletons, paths continue from the partners of the part: downstream
   * partners of source parts and upstream partners of target parts.
   */
  GraphWidget2.prototype.growPaths = function() {
    if (!this.cy) return Promise.resolve();
    this.prunePathOrigins();
    for (let type in this.pathOrigins) {
      if (this.pathOrigins[type].size === 0) {
        CATMAID.warn(`Pick ${type} node(s) for the paths first!`);
        return Promise.resolve();
      }
    }
    if (!this.canGrow()) return Promise.resolve();

    let nHops = this.growOptions.hops;
    let minLinks = this.growOptions.minPathLinks;
    let linkTypes = Array.from(this.selectedLinkTypes);
    let sources = this.collectGrowSeeds(this.getShownPathOrigins('source'));
    let targets = this.collectGrowSeeds(this.getShownPathOrigins('target'));

    return Promise.all([
        this.fetchPartPartners(sources.parts, -1, minLinks),
        this.fetchPartPartners(targets.parts, minLinks, -1),
      ])
      .then(([sourcePartners, targetPartners]) => {
        // The first hop from a source part and the last hop to a target part
        // are covered by their partners already.
        let searches = [
          [sources.skeletonIds, targets.skeletonIds, nHops],
          [sourcePartners, targets.skeletonIds, nHops - 1],
          [sources.skeletonIds, targetPartners, nHops - 1],
          [sourcePartners, targetPartners, nHops - 2],
        ].filter(([sourceIds, targetIds, hops]) =>
            sourceIds.length > 0 && targetIds.length > 0 && hops >= 1);
        return Promise.all(searches.map(([sourceIds, targetIds, hops]) =>
            CATMAID.fetch(`${project.id}/graph/dps`, 'POST', {
              sources: sourceIds,
              targets: targetIds,
              n_hops: hops,
              min_synapses: minLinks,
              link_types: linkTypes,
            })));
      })
      .then(results => {
        let skeletonIds = new Set([].concat(...results).map(Number));
        // Show hidden nodes of skeletons on a path
        this.cy.nodes('.hidden').forEach(node => {
          if (node.data('skeleton_ids').some(skeletonId => skeletonIds.has(skeletonId))) {
            this.setHidden(node, false);
            this.hiddenUnconnectedIds.delete(node.id());
          }
        });
        this.updateShowHiddenButton();
        return this.appendGrown(Array.from(skeletonIds), "No new paths found");
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Update the list of selections in the Selections tab. The passed in index
   * becomes the active entry, by default the current one is kept.
   */
  GraphWidget2.prototype.updateSelectionSelect = function(activeIndex) {
    let select = this.selectionSelect;
    if (!select) return;
    if (activeIndex === undefined) activeIndex = select.selectedIndex;
    select.options.length = 0;
    for (let selection of this.selections) {
      select.add(new Option(selection.name, selection.name));
    }
    select.selectedIndex = Math.max(0, Math.min(activeIndex, this.selections.length - 1));
  };

  /**
   * Get the selection that is active in the list of the Selections tab.
   */
  GraphWidget2.prototype.getActiveSelection = function() {
    if (!this.selectionSelect) return null;
    return this.selections[this.selectionSelect.selectedIndex] || null;
  };

  /**
   * Remember the members of all selected nodes as a new named selection. If
   * overlaps are prevented, members of other selections are left out and
   * their nodes are deselected.
   */
  GraphWidget2.prototype.createSelection = function() {
    if (!this.cy) return;
    let existing = new Set();
    if (this.selectionOptions.preventOverlaps) {
      for (let selection of this.selections) {
        for (let key of selection.members.keys()) existing.add(key);
      }
    }
    let members = new Map();
    let droppedNodes = [];
    this.cy.nodes(':selected').forEach(node => {
      if (!GraphWidget2.isShown(node)) return;
      let nAdded = 0;
      for (let member of node.data('members')) {
        let key = GraphWidget2.getMemberKey(member.skeletonId, member.part);
        if (existing.has(key)) continue;
        members.set(key, member);
        ++nAdded;
      }
      if (nAdded === 0) droppedNodes.push(node);
    });
    if (members.size === 0) {
      CATMAID.warn(droppedNodes.length > 0 ?
          "All selected nodes belong to other selections already!" :
          "Select at least one node!");
      return;
    }

    let askName = () => {
      droppedNodes.forEach(node => node.unselect());
      let dialog = new CATMAID.OptionsDialog("Create selection");
      let nameField = dialog.appendField("Name: ",
          `graph_widget_2_selection_name_${this.widgetID}`, "", true);
      dialog.onOK = () => {
        let name = nameField.value.trim();
        // Errors keep the dialog open
        if (!name) {
          throw new CATMAID.ValueError("Need a name for the selection!");
        }
        if (this.selections.some(selection => selection.name === name)) {
          throw new CATMAID.ValueError("Name already exists!");
        }
        this.selections.push({name: name, members: members});
        this.updateSelectionSelect(this.selections.length - 1);
      };
      dialog.show(350, 'auto', true);
      nameField.focus();
    };

    if (droppedNodes.length === 0) {
      askName();
      return;
    }
    let dialog = new CATMAID.OptionsDialog("Create selection");
    dialog.appendMessage(`${droppedNodes.length} node(s) already belong to other ` +
        "selections and will be deselected. Continue?");
    dialog.onOK = askName;
    dialog.show(350, 'auto', true);
  };

  /**
   * Move the active selection up (-1) or down (1) in the list.
   */
  GraphWidget2.prototype.moveSelection = function(offset) {
    if (!this.selectionSelect) return;
    let index = this.selectionSelect.selectedIndex;
    let newIndex = index + (offset > 0 ? 1 : -1);
    if (index < 0 || newIndex < 0 || newIndex >= this.selections.length) return;
    let selections = this.selections;
    [selections[index], selections[newIndex]] = [selections[newIndex], selections[index]];
    this.updateSelectionSelect(newIndex);
  };

  GraphWidget2.prototype.removeSelection = function() {
    let selection = this.getActiveSelection();
    if (!selection) return;
    this.selections.splice(this.selections.indexOf(selection), 1);
    this.updateSelectionSelect();
  };

  /**
   * Forget selection members that don't exist anymore, because their skeleton
   * was removed or split differently. Selections without members are removed.
   */
  GraphWidget2.prototype.pruneSelections = function() {
    let removedNames = [];
    this.selections = this.selections.filter(selection => {
      for (let [key, member] of selection.members) {
        let skeleton = this.skeletons.get(member.skeletonId);
        if (!skeleton || !skeleton.partLabels.includes(member.part)) {
          selection.members.delete(key);
        }
      }
      if (selection.members.size === 0) removedNames.push(selection.name);
      return selection.members.size > 0;
    });
    if (removedNames.length > 0) {
      CATMAID.info(`Removed empty selection(s): ${removedNames.join(', ')}`);
      this.updateSelectionSelect();
    }
  };

  /**
   * Get the index of the selection a graph node is part of, the last one in
   * the list if there are multiple, or -1.
   */
  GraphWidget2.prototype.getSelectionIndex = function(node) {
    let keys = node.data('members').map(
        member => GraphWidget2.getMemberKey(member.skeletonId, member.part));
    for (let i = this.selections.length - 1; i >= 0; --i) {
      let members = this.selections[i].members;
      if (keys.some(key => members.has(key))) return i;
    }
    return -1;
  };

  /**
   * Get all graph nodes with at least one member in the passed in selection.
   */
  GraphWidget2.prototype.getSelectionNodes = function(selection) {
    return this.cy.nodes().filter(node => node.data('members').some(member =>
        selection.members.has(GraphWidget2.getMemberKey(member.skeletonId, member.part))));
  };

  /**
   * Select or deselect the nodes of the active selection.
   */
  GraphWidget2.prototype.activateSelection = function(select) {
    let selection = this.getActiveSelection();
    if (!selection || !this.cy) return;
    let nodes = this.getSelectionNodes(selection);
    if (select) {
      nodes.select();
    } else {
      nodes.unselect();
    }
  };

  GraphWidget2.prototype.activateAllSelections = function() {
    if (!this.cy) return;
    this.cy.nodes().filter(node => this.getSelectionIndex(node) !== -1).select();
  };

  /**
   * Arrange the nodes of each selection as a column, in the order of the
   * selection list, with the nodes of a column sorted by label. The zoom
   * level is reset to 100% and the columns are spread over the view. Nodes of
   * multiple selections are part of the last one. Locked nodes aren't moved.
   * Optionally, nodes that aren't part of any selection are hidden.
   */
  GraphWidget2.prototype.alignSelectionsAsColumns = function() {
    if (!this.cy) return;
    if (this.selections.length === 0) {
      CATMAID.warn("Create at least one selection first!");
      return;
    }
    let columns = this.selections.map(() => []);
    let others = [];
    let nOverlapping = 0;
    this.cy.nodes().forEach(node => {
      let index = this.getSelectionIndex(node);
      if (index === -1) {
        others.push(node);
        return;
      }
      columns[index].push(node);
      let nSelections = this.selections.filter(
          selection => this.getSelectionNodes(selection).contains(node)).length;
      if (nSelections > 1) ++nOverlapping;
    });
    if (nOverlapping > 0) {
      CATMAID.warn(`${nOverlapping} node(s) are part of more than one selection ` +
          "and are placed in the column of the last one");
    }

    this.cy.zoom(1.0);

    let marginX = this.viewOptions.nodeWidth * 2;
    let marginY = this.viewOptions.nodeHeight * 2;
    let width = this.cy.width() - 2 * marginX;
    let height = this.cy.height() - 2 * marginY;
    let columnSpacing = columns.length > 1 ? width / (columns.length - 1) : 0;

    let moved = [];
    this.cy.batch(() => {
      columns.forEach((column, i) => {
        column.sort((a, b) => a.data('label').localeCompare(b.data('label'),
            undefined, {numeric: true, sensitivity: 'base'}));
        let rowSpacing = column.length > 1 ? height / (column.length - 1) : 0;
        column.forEach((node, k) => {
          // Locked nodes keep their position. A single node is centered.
          node.renderedPosition({
            x: marginX + i * columnSpacing,
            y: column.length > 1 ? marginY + k * rowSpacing : marginY + height / 2,
          });
          moved.push(node);
        });
      });
      if (this.selectionOptions.hideOtherNodes) {
        others.forEach(node => {
          node.unselect();
          this.setHidden(node, true);
        });
      }
    });
    this.updateShowHiddenButton();
    GraphWidget2.reportLockedNodes(moved);
  };

  /**
   * Fade all edges, except for the ones that lead to the selected nodes from
   * the previous column or from them to the next column, and so on from
   * column to column. Columns are the selections in list order.
   */
  GraphWidget2.prototype.fadeEdges = function() {
    if (!this.cy) return;
    let selected = this.cy.nodes(':selected').filter(node => GraphWidget2.isShown(node));
    if (selected.empty()) {
      CATMAID.warn("Select at least one node first!");
      return;
    }
    let edges = this.getShownLinkEdges();
    let nColumns = this.selections.length;
    let opaque = new Set();
    // Follow edges to neighboring columns: -1 upstream, 1 downstream
    let follow = (node, direction, visited) => {
      if (visited.has(node.id())) return;
      visited.add(node.id());
      let column = this.getSelectionIndex(node);
      if (column === -1) return;
      edges.forEach(edge => {
        let near = direction > 0 ? edge.source() : edge.target();
        let far = direction > 0 ? edge.target() : edge.source();
        if (near.id() !== node.id()) return;
        let farColumn = this.getSelectionIndex(far);
        if (farColumn !== column + direction) return;
        opaque.add(edge.id());
        if (farColumn > 0 && farColumn < nColumns - 1) follow(far, direction, visited);
      });
    };
    selected.forEach(node => {
      follow(node, -1, new Set());
      follow(node, 1, new Set());
    });
    let opacity = this.selectionOptions.fadedEdgeOpacity / 100;
    this.cy.batch(() => {
      edges.forEach(edge => {
        edge.style('opacity', opaque.has(edge.id()) ? 1 : opacity);
      });
    });
  };

  /**
   * Undo fadeEdges(): edges get the opacity of their link type again.
   */
  GraphWidget2.prototype.restoreEdges = function() {
    if (!this.cy) return;
    this.cy.edges().removeStyle('opacity');
  };

  /**
   * Hide all edges, except for the ones from the nodes of a selection to the
   * nodes of the next selection in the list.
   */
  GraphWidget2.prototype.hideNonSequentialEdges = function() {
    if (!this.cy) return;
    if (this.selections.length === 0) {
      CATMAID.warn("Create at least one selection first!");
      return;
    }
    let edges = this.getShownLinkEdges().filter(edge => {
      let source = this.getSelectionIndex(edge.source());
      let target = this.getSelectionIndex(edge.target());
      return source === -1 || target === -1 || source + 1 !== target;
    });
    edges.unselect();
    this.setHidden(edges, true);
    this.updateShowHiddenButton();
  };

  /**
   * Get all shown nodes, or show a warning if there are none.
   */
  GraphWidget2.prototype.getShownNodesOrWarn = function() {
    let nodes = this.cy ? this.cy.nodes().filter(node => GraphWidget2.isShown(node)) : [];
    if (nodes.length === 0) {
      CATMAID.warn("Load a graph first!");
      return null;
    }
    return nodes;
  };

  /**
   * Get the adjacency matrix of all shown nodes: {ids, names, models,
   * matrix}. Each matrix cell is the sum of the weights of all shown link
   * edges from the row node to the column node. Undirected edges count in
   * both directions. The models field has a list of skeleton models for each
   * node.
   */
  GraphWidget2.prototype.getAdjacencyMatrix = function() {
    let ids = [], names = [], models = [];
    let indices = new Map();
    if (!this.cy) return {ids, names, models, matrix: []};
    this.cy.nodes().forEach(node => {
      if (!GraphWidget2.isShown(node)) return;
      indices.set(node.id(), ids.length);
      ids.push(node.id());
      names.push(node.data('label'));
      models.push(node.data('skeleton_ids').map(
          skeletonId => this.skeletons.get(skeletonId).model.clone()));
    });
    let matrix = ids.map(() => new Uint32Array(ids.length));
    this.getShownLinkEdges().forEach(edge => {
      let source = indices.get(edge.source().id());
      let target = indices.get(edge.target().id());
      let weight = edge.data('weight');
      matrix[source][target] += weight;
      if (!edge.data('directed') && source !== target) {
        matrix[target][source] += weight;
      }
    });
    return {ids, names, models, matrix};
  };

  /**
   * Get the adjacency matrix of all shown nodes as CSV text. The first row
   * and the first column contain the node labels.
   */
  GraphWidget2.prototype.writeAdjacencyMatrix = function() {
    let m = this.getAdjacencyMatrix();
    let names = m.names.map(name =>
        '"' + name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    return '"Neurons",' + names.join(',') + '\n' +
        m.matrix.map((row, i) => names[i] + ',' + Array.from(row).join(',')).join('\n');
  };

  GraphWidget2.prototype.exportAdjacencyMatrix = function() {
    if (!this.getShownNodesOrWarn()) return;
    let blob = new Blob([this.writeAdjacencyMatrix()], {type: 'text/plain'});
    saveAs(blob, "adjacency_matrix.csv");
  };

  /**
   * Get all shown nodes and the shown edges between them as GML text. With
   * linearized IDs, nodes are numbered from zero instead of using their graph
   * node IDs, which aren't numbers for groups and skeleton parts. Edges
   * between the parts of a split skeleton have the link type "part" and no
   * weight.
   */
  GraphWidget2.prototype.writeGML = function(linearizeIds) {
    let quote = text => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    let ids = new Map();
    let items = ['Creator "CATMAID"\nVersion 1.0\ngraph ['];
    if (!this.cy) return items.join("\n  ") + "\n]";

    this.cy.nodes().forEach(node => {
      if (!GraphWidget2.isShown(node)) return;
      let exportId = linearizeIds ? ids.size : node.id();
      ids.set(node.id(), exportId);
      let p = node.position();
      items.push(["node [",
                  "id " + exportId,
                  ["graphics [",
                   "x " + p.x,
                   "y " + p.y,
                   "w " + node.width(),
                   "h " + node.height(),
                   'fill ' + quote(node.data('color')),
                   'type ' + quote(node.data('shape')),
                   'outline "#000000"',
                   "outline_width 1"].join("\n      "),
                  "]",
                  'name ' + quote(node.data('label')),
                  "unit_id " + node.id()].join("\n    "));
      items.push("]");
    });

    this.cy.edges().forEach(edge => {
      if (!GraphWidget2.isShown(edge)) return;
      let isPartEdge = edge.hasClass('part-edge');
      let properties = ['link_type ' + quote(isPartEdge ? 'part' : edge.data('link_type'))];
      if (!isPartEdge) properties.push('weight ' + edge.data('weight'));
      if (edge.data('risk') !== undefined) {
        properties.push('risk ' + edge.data('risk'), 'label ' + quote(edge.data('label')));
      }
      items.push(["edge [",
                  "source " + ids.get(edge.source().id()),
                  "target " + ids.get(edge.target().id()),
                  ["graphics [",
                   'type "line"',
                   "Line [",
                   "]",
                   "source_arrow 0",
                   "target_arrow " + (edge.data('directed') ? 3 : 0)].join("\n      "),
                  "]"].concat(properties).join("\n    "));
      items.push("]");
    });

    return items.join("\n  ") + "\n]";
  };

  GraphWidget2.prototype.exportGML = function() {
    if (!this.getShownNodesOrWarn()) return;
    let dialog = new CATMAID.OptionsDialog('Export GML');
    dialog.appendMessage('Please check the export options.');
    let linearizeIds = dialog.appendCheckbox('Linearize IDs',
        `graph_widget_2_linearize_ids_${this.widgetID}`, true,
        "Replace graph node IDs with incremental IDs starting from zero. Some tools require this.");
    dialog.onOK = () => {
      let blob = new Blob([this.writeGML(linearizeIds.checked)], {type: "text/plain"});
      saveAs(blob, "graph.gml");
    };
    dialog.show(500, 'auto', true);
  };

  /**
   * Create an SVG document of all shown nodes and edges, as they are
   * currently displayed. Returns a CATMAID.SVGFactory. Adobe Illustrator
   * needs the arrowOnSeparateLine option.
   */
  GraphWidget2.prototype.generateSVG = function(options = {}) {
    let cy = this.cy;
    let container = cy.container();
    let extent = cy.extent();
    let svg = new CATMAID.SVGFactory(container.clientWidth, container.clientHeight,
        extent.x1, extent.y1, extent.x2 - extent.x1, extent.y2 - extent.y1);
    let renderer = cy.renderer();

    // Edge geometry is taken from the render cache of Cytoscape.js
    cy.edges().forEach(edge => {
      if (!GraphWidget2.isShown(edge)) return;
      let opacity = Number(edge.style('opacity'));
      if (opacity === 0) return;
      let rscratch = edge._private.rscratch;
      let strokeWidth = parseFloat(edge.style('width'));
      let lineStyle = {
        'stroke': edge.style('line-color'),
        'stroke-width': strokeWidth + 'px',
        'fill': 'none',
        'opacity': opacity,
      };
      if (edge.style('line-style') === 'dashed') {
        lineStyle['stroke-dasharray'] = `${3 * strokeWidth},${2 * strokeWidth}`;
      }
      let lineOptions = {
        edgeType: rscratch.edgeType,
        arrowOnSeparateLine: CATMAID.getOption(options, 'arrowOnSeparateLine', false),
        refX: CATMAID.getOption(options, 'arrowRefX', undefined),
        strokeWidth: strokeWidth,
        controlPoints: rscratch.ctrlpts,
      };
      let label = edge.style('label');
      if (label) {
        Object.assign(lineOptions, {
          label: label,
          labelOffsetX: 0,
          labelOffsetY: 0,
          labelX: rscratch.labelX,
          labelY: rscratch.labelY,
          labelStyle: {
            'fill': edge.style('color'),
            'stroke-width': '0px',
            'font-family': 'Verdana',
            'font-size': edge.style('font-size'),
            'opacity': edge.style('text-opacity'),
          },
        });
      }
      // "Arrow" means end marker here
      let arrow = edge.style('target-arrow-shape');
      if (arrow && arrow !== 'none') {
        // Arrow sizes are in a rather narrow range, absolute sizes are easier
        let size = 3 * (0.5 * strokeWidth + 1.5);
        Object.assign(lineOptions, {
          arrow: arrow,
          arrowStyle: lineStyle,
          arrowUnit: 'userSpaceOnUse',
          arrowWidth: size,
          arrowHeight: size,
          refX: 0,
          refY: 0,
        });
      }
      svg.drawLine(rscratch.startX, rscratch.startY, rscratch.arrowEndX,
          rscratch.arrowEndY, lineStyle, lineOptions);
    });

    cy.nodes().forEach(node => {
      if (!GraphWidget2.isShown(node)) return;
      let position = node.position();
      let width = node.width(), height = node.height();
      let shapeStyle = {
        'fill': node.style('background-color'),
        'stroke': node.style('border-color'),
        'stroke-width': node.style('border-width'),
        'opacity': node.style('opacity'),
      };
      let textStyle = {
        'fill': node.style('color'),
        'stroke-width': '0px',
        'font-family': 'Verdana',
        'font-size': node.style('font-size'),
        'opacity': node.style('text-opacity'),
      };

      // Label position relative to the node position
      let halign = node.style('text-halign'), valign = node.style('text-valign');
      let labelHeight = node._private.rstyle.labelHeight || 0;
      let dx = 0, dy = 0;
      if (halign === 'center') {
        textStyle['text-anchor'] = 'middle';
      } else if (halign === 'right') {
        dx = width / 2 + 1;
        textStyle['text-anchor'] = 'start';
      } else if (halign === 'left') {
        dx = -(width / 2 + 1);
        textStyle['text-anchor'] = 'end';
      }
      if (valign === 'center') {
        dy = labelHeight / 3;
      } else if (valign === 'bottom') {
        dy = height / 2 + 1 + labelHeight;
      } else if (valign === 'top') {
        dy = -(height / 2 + 1);
      }

      let label = node.style('label');
      let shape = node.data('shape');
      if (shape === 'ellipse' && width === height) {
        svg.drawLabeledCircle(position.x, position.y, width / 2, shapeStyle,
            label, dx, dy, textStyle);
      } else if (shape in renderer.nodeShapes && renderer.nodeShapes[shape].points) {
        svg.drawLabeledPolygonPath(position.x, position.y, width, height,
            renderer.nodeShapes[shape].points, shapeStyle, label, dx, dy, textStyle);
      } else {
        CATMAID.warn(`Could not export graph element. Unknown shape: ${shape}`);
      }
    });

    return svg;
  };

  GraphWidget2.prototype.showSVGOptions = function() {
    if (!this.getShownNodesOrWarn()) return;
    let dialog = new CATMAID.OptionsDialog("SVG Export", {
      'Illustrator SVG': () => this.exportSVG({arrowOnSeparateLine: true}),
      'Regular SVG': () => this.exportSVG({arrowRefX: 0}),
    });
    dialog.appendMessage("If you want to use the exported SVG file with Adobe " +
        "Illustrator, please use the respective export button below. Unfortunately, " +
        "Illustrator is not standards conformant and will not work properly with regular " +
        "SVG files. We recommend Inkscape, which works well with regular SVGs.");
    dialog.show('400', 'auto', true);
  };

  GraphWidget2.prototype.exportSVG = function(options) {
    if (!this.getShownNodesOrWarn()) return;
    this.generateSVG(options).save(`graph-${this.widgetID}.svg`);
  };

  /**
   * Open all shown nodes in a new connectivity matrix widget. Groups are
   * added as groups. The connectivity matrix works with whole skeletons, so
   * parts of split skeletons are added as their whole skeleton.
   */
  GraphWidget2.prototype.openConnectivityMatrix = function() {
    let nodes = this.getShownNodesOrWarn();
    if (!nodes) return;
    let getModels = node => {
      let models = {};
      for (let skeletonId of node.data('skeleton_ids')) {
        models[skeletonId] = this.skeletons.get(skeletonId).model.clone();
      }
      return models;
    };
    let matrix = new CATMAID.ConnectivityMatrixWidget();
    let single = {};
    nodes.forEach(node => {
      if (node.data('group_id') === undefined) {
        Object.assign(single, getModels(node));
      } else {
        matrix.rowDimension.appendAsGroup(getModels(node), node.data('label'));
        matrix.colDimension.appendAsGroup(getModels(node), node.data('label'));
      }
    });
    matrix.rowDimension.append(single);
    matrix.colDimension.append(single);
    WindowMaker.create('connectivity-matrix', matrix, true);
  };

  /**
   * Open the adjacency matrix of all shown nodes in a new circuit graph plot.
   */
  GraphWidget2.prototype.openPlot = function() {
    if (!this.getShownNodesOrWarn()) return;
    WindowMaker.create('circuit-graph-plot');
    let plot = CATMAID.CircuitGraphPlot.prototype.getLastInstance();
    let m = this.getAdjacencyMatrix();
    plot.plot(m.ids, m.names, m.models, m.matrix);
  };

  /**
   * Show the number of shown nodes, edges, neurons and links.
   */
  GraphWidget2.prototype.quantificationDialog = function() {
    if (!this.cy) return;
    let nodes = this.cy.nodes().filter(node => GraphWidget2.isShown(node));
    let nDirected = 0, nUndirected = 0, nLinks = 0;
    this.getShownLinkEdges().forEach(edge => {
      if (edge.data('directed')) {
        ++nDirected;
      } else {
        ++nUndirected;
      }
      nLinks += edge.data('weight');
    });
    let skeletonIds = new Set();
    nodes.forEach(node => node.data('skeleton_ids').forEach(id => skeletonIds.add(id)));

    let dialog = new CATMAID.OptionsDialog("Graph Quantification", {
      'OK': () => {},
    });
    let table = document.createElement('table');
    [
      ["Number of nodes:", nodes.length, "(shown nodes, includes groups and skeleton parts)"],
      ["Number of directed edges:", nDirected, "(shown edges, e.g. synaptic)"],
      ["Number of undirected edges:", nUndirected, "(shown edges, e.g. gap junctions)"],
      ["Number of neurons:", skeletonIds.size, ""],
      ["Number of in-graph links:", nLinks, "(sum of the link counts of all shown edges)"],
    ].forEach(cells => {
      let row = table.insertRow();
      cells.forEach(cell => { row.insertCell().textContent = cell; });
    });
    dialog.dialog.appendChild(table);
    dialog.show(500, 'auto', true);
  };

  /**
   * Whether filter rules are applied and at least one is switched on.
   */
  GraphWidget2.prototype.isFilterActive = function() {
    return this.applyFilterRules && this.filterRules.some(rule => !rule.skip);
  };

  /**
   * Reevaluate the current set of node filter rules for the passed in
   * skeleton models, by default all loaded ones, to update the set of allowed
   * treenodes. Unless skipUpdate is set, the graph is rebuilt afterwards.
   * Skeletons aren't loaded again. Returns a promise.
   */
  GraphWidget2.prototype.updateFilter = function(models, skipUpdate) {
    let run = ++this.filterRun;
    let update = () => (skipUpdate || !this.cy) ? undefined : this.updateGraph();
    let skeletons = models || this.getSkeletonModels();
    if (CATMAID.tools.isEmpty(skeletons) || !this.isFilterActive()) {
      this.allowedNodeIds = null;
      this.updateAllowedConnectors();
      return Promise.resolve().then(update);
    }

    let filter = new CATMAID.SkeletonFilter(this.filterRules, skeletons);
    return filter.execute()
      .then(filtered => {
        // Rules or skeletons changed in the meantime, a newer run handles it
        if (run !== this.filterRun) return;
        this.allowedNodeIds = new Set(Object.keys(filtered.nodes).map(Number));
        if (this.updateAllowedConnectors().size === 0) {
          CATMAID.warn("No links left after filter application");
        }
        return update();
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Update and return the set of connectors that links are used of with
   * active filter rules: all connectors linked to at least one allowed
   * treenode of a loaded skeleton. Without active filter rules it is null.
   */
  GraphWidget2.prototype.updateAllowedConnectors = function() {
    let allowedNodeIds = this.allowedNodeIds;
    if (!allowedNodeIds) {
      this.allowedConnectorIds = null;
      return null;
    }
    let connectorIds = new Set();
    for (let skeleton of this.skeletons.values()) {
      for (let [treenodeId, connectorId] of skeleton.links) {
        if (allowedNodeIds.has(treenodeId)) connectorIds.add(connectorId);
      }
    }
    this.allowedConnectorIds = connectorIds;
    return connectorIds;
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
