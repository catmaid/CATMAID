/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CircuitGraphPlot,
  cytoscape,
  fetchSkeletons,
  InstanceRegistry,
  NeuronNameService,
  project,
  requestQueue,
  session,
  SVGCanvas,
  SynapseClustering,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var GroupGraph = function() {
    this.widgetID = this.registerInstance();
    this.registerSource();

    this.label_valign = 'top';
    this.label_halign = 'center';
    this.show_node_labels = true;
    this.trim_node_labels = false;
    this.node_width = 30; // pixels
    this.node_height = 30; // pixels

    this.color_circles_of_hell_upstream = this.colorCirclesOfHell.bind(this, true);
    this.color_circles_of_hell_downstream = this.colorCirclesOfHell.bind(this, false);

    this.edge_color = '#555';
    this.edge_opacity = 1.0;
    this.edge_text_color = '#555';
    this.edge_text_opacity = 1.0;
    // Edge width is computed as edge_min_width + edge_width_function(weight)
    this.edge_min_width = 0;
    this.edge_width_function = "sqrt"; // choices: identity, log, log10, sqrt

    this.edge_threshold = 1;
    this.edge_confidence_threshold = 1;

    this.setState('color_mode', 'source');

    // stores re-layout timeout when resizing
    this.relayoutTimeout = null;

    this.groups = {}; // groupID vs Group instances, where groupID is e.g. g0, g1, g2, ...

    // Keep set of selected elements as arrays of [id, index]
    // so that the order of the selection is stored.
    // The counter always increases, so that deleting nodes doesn't alter the order.
    this.selection = {entries: {},
                      counter: 0};

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
  };

  GroupGraph.prototype = {};
  $.extend(GroupGraph.prototype, new InstanceRegistry());
  $.extend(GroupGraph.prototype, new CATMAID.SkeletonSource());

  GroupGraph.prototype.SUBGRAPH_AXON_DENDRITE =  -1;
  GroupGraph.prototype.SUBGRAPH_AXON_BACKBONE_TERMINALS = -2;
  GroupGraph.prototype.SUBGRAPH_SPLIT_AT_TAG = -3;

  GroupGraph.prototype.getName = function() {
    return "Graph " + this.widgetID;
  };

  GroupGraph.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    NeuronNameService.getInstance().unregister(this);
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
    return new THREE.Color().setRGB(1, 0, 1);
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

    var newEdgeColor = this.edge_color;
    var colorButton = document.createElement('button');
    colorButton.appendChild(document.createTextNode('edge color'));
    CATMAID.ColorPicker.enable(colorButton, {
      initialColor: this.edge_color,
      onColorChange: function(rgb, alpha, colorChanged, alphaChanged) {
        if (colorChanged) {
          newEdgeColor = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
              Math.round(rgb.g * 255), Math.round(rgb.b * 255));
        }
      }
    });

    var newEdgeTextColor = this.edge_text_color;
    var textColorButton = document.createElement('button');
    textColorButton.appendChild(document.createTextNode('edge text color'));
    CATMAID.ColorPicker.enable(textColorButton, {
      initialColor: this.edge_text_color,
      onColorChange: function(rgb, alpha, colorChanged, alphaChanged) {
        if (colorChanged) {
          newEdgeTextColor = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
              Math.round(rgb.g * 255), Math.round(rgb.b * 255));
        }
      }
    });

    var p = document.createElement('p');
    p.appendChild(colorButton);
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
      if (!Number.isNaN(edge_opacity) && edge_opacity >= 0 && edge_opacity <= 1) this.edge_opacity = edge_opacity;
      var edge_text_opacity = Number(props[1].value.trim());
      if (!Number.isNaN(edge_text_opacity) && edge_text_opacity >= 0 && edge_text_opacity <= 1) this.edge_text_opacity = edge_text_opacity;
      var edge_min_width = Number(props[2].value.trim());
      if (!Number.isNaN(edge_min_width)) this.edge_min_width = edge_min_width;
      this.edge_width_function = edgeFnNames[edgeFnSel.selectedIndex];
      this.edge_color = newEdgeColor;
      this.edge_text_color = newEdgeTextColor;
      this.updateEdgeGraphics();
    }).bind(this);

    dialog.show(440, 300, true);
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
              "content": "data(label)",
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
          }
        }

        requestQueue.register(django_url + project.id + '/connector/pre-post-info', "POST",
          {cids: connector_ids,
           pre: source_skids,
           post: target_skids},
          function(status, text) {
            if (200 !== status) return;
            var json = $.parseJSON(text);
            if (json.error) return new CATMAID.ErrorDialog(
                "Cound not fetch edge data.", json.error);
            CATMAID.ConnectorSelection.show_connectors(json);
          });
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
  GroupGraph.prototype.updateLayout = function(layout) {
    var index = layout ? layout.selectedIndex : 0;
    var name = ['spread', 'breadthfirst', 'grid', 'circle', 'concentric', 'concentric out', 'concentric in', 'random', 'cose', 'preset', 'dagre', 'cola', 'arbor', 'springy'][index];
    var options = this.createLayoutOptions(name);
    options.stop = (function() { this.cy.nodes().unlock(); }).bind(this);
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
        var name = NeuronNameService.getInstance().getName(models[0].id);
        if (this.subgraphs[models[0].id]) {
          var label = node.data('label');
          var i_ = label.lastIndexOf(' [');
          if (-1 !== i_) name = name + label.substring(i_);
        }
        node.data('label', name);
      }
    }).bind(this));
  };

  /** There is a model for every skeleton ID included in json.
   *  But there could be models for which there isn't a skeleton_id in json: these are disconnected nodes. */
  GroupGraph.prototype.updateGraph = function(json, models, morphology) {

    var subgraph_skids = Object.keys(this.subgraphs);
    if (subgraph_skids.length > 0 && !morphology) {
      // Need to load skeleton + connectors of skids in subgraph_skids
      var morphologies = {};
      fetchSkeletons(
          subgraph_skids,
          (function(skid) {
            var mode = this.subgraphs[skid],
                with_tags = (mode === this.SUBGRAPH_AXON_BACKBONE_TERMINALS || mode === this.SUBGRAPH_SPLIT_AT_TAG ? 1 : 0);
            return django_url + project.id + '/' + skid + '/1/1/' + with_tags + '/compact-arbor';
          }).bind(this),
          function(skid) { return {}; },
          function(skid, json) { morphologies[skid] = json; },
          (function(skid) { delete this.subgraphs[skid]; }).bind(this), // failed loading
          (function() { this.updateGraph(json, models, morphologies); }).bind(this));
      return;
    }

    // A neuron that is split cannot be part of a group anymore: makes no sense.
    // Neither by confidence nor by synapse clustering.

    var edge_color = this.edge_color;
    var edge_text_color = this.edge_text_color;
    var edge_confidence_threshold = this.edge_confidence_threshold;
    var asEdge = function(edge) {
        var count = _filterSynapses(edge[2], edge_confidence_threshold);
        return {data: {directed: true,
                       arrow: 'triangle',
                       id: edge[0] + '_' + edge[1],
                       label: count,
                       color: edge_color,
                       label_color: edge_text_color,
                       source: edge[0],
                       target: edge[1],
                       confidence: edge[2],
                       weight: count}};
    };

    var asNode = function(nodeID) {
        nodeID = nodeID + '';
        var i_ = nodeID.indexOf('_'),
            skeleton_id = -1 === i_ ? nodeID : nodeID.substring(0, i_),
            model = models[skeleton_id];
        return {data: {id: nodeID, // MUST be a string, or fails
                        skeletons: [model.clone()],
                        label: NeuronNameService.getInstance().getName(model.id),
                        node_count: 0,
                        shape: "ellipse",
                        color: '#' + model.color.getHexString()}};
    };

    // Infer nodes from json.edges
    var elements = {},
        seen = {},
        nodes = [],
        appendNode = (function(skid) {
          //if (seen[skid]) return;
          if (undefined !== this.subgraphs[skid]) return; // will be added later
          var node = asNode('' + skid);
          seen[skid] = true;
          nodes.push(node);
        }).bind(this);

    Object.keys(models).forEach(appendNode);

    elements.nodes = nodes;
    elements.edges = [];

    // Store positions of current nodes and their selected state
    var positions = {},
        selected = {},
        hidden = {},
        locked = {};
    this.cy.nodes().each(function(i, node) {
      var id = node.id();
      positions[id] = node.position();
      if (node.selected()) selected[id] = true;
      if (node.hidden()) hidden[id] = true;
      if (node.locked()) locked[id] = true;
    });

    // Store visibility and selection state of edges as well
    this.cy.edges().each(function(i, edge) {
      var id = edge.id();
      if (edge.selected()) selected[id] = true;
      if (edge.hidden()) hidden[id] = true;
    });

    // Recreate subgraphs
    var subnodes = {},
        subedges = {}; // map of {connectorID: {pre: graph node ID,
                       //                       post: {graph node ID: count}}}
    subgraph_skids.forEach((function(skid) {
      var m = morphology[skid],
          ap = new CATMAID.ArborParser().init('compact-arbor', m),
          mode = this.subgraphs[skid],
          parts = {},
          name = NeuronNameService.getInstance().getName(skid),
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
            delete this.subgraphs[skid];
            elements.nodes.push(asNode('' + skid));
            return;
          }
        }

        for (var i=1; i<graph.length; ++i) {
          // ... connected by an undirected edge, in sequence
          elements.edges.push({data: {directed: false,
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
            elements.edges.push({data: {directed: false,
                                        arrow: 'none',
                                        id: source_id + '_' + target_id,
                                        color: common.color,
                                        label_color: common.color,
                                        source: source_id,
                                        target: target_id,
                                        weight: 10}});
          });

        } else {
          CATMAID.info("No subgraph possible for '" + name + "' and tag '" + this.tag.regex + "'");
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
          delete this.subgraphs[skid];
          elements.nodes.push(asNode('' + skid));
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
          elements.edges.push({data: {directed: false,
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
            var count = connector.post[targetSkid];
            connector.post[targetSkid] = count ? count + 1 : 1;
          }
        } else {
          if (undefined === this.subgraphs[sourceSkid]) connector.pre = sourceSkid;
          var count = connector.post[node_id];
          connector.post[node_id] = count ? count + 1 : 1;
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

    // Append all new nodes from the subgraphs
    elements.nodes = elements.nodes.concat(Object.keys(subnodes).map(function(id) { return subnodes[id]; }));

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
        e[target_id] = (count ? count : 0) + connector.post[target_id];
      });
    });

    Object.keys(cedges).forEach(function(source_id) {
      var e = cedges[source_id];
      Object.keys(e).forEach(function(target_id) {
        var count = e[target_id];
        elements.edges.push({data: {directed: true,
                                    arrow: 'triangle',
                                    color: edge_color,
                                    label_color: edge_text_color,
                                    id: source_id + '_' + target_id,
                                    source: source_id,
                                    target: target_id,
                                    label: count,
                                    weight: count}});
      });
    });

    // Add all other edges
    json.edges.forEach((function(e) {
      // Skip edges that are part of subgraphs
      if (this.subgraphs[e[0]] || this.subgraphs[e[1]]) return;
      elements.edges.push(asEdge(e));
    }).bind(this));

    // Group neurons, if any groups exist, skipping splitted neurons
    this._regroup(elements, this.subgraphs, models);

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

    this.cy.nodes().each(function(i, node) {
      // Lock old nodes into place and restore their position
      var id = node.id();
      if (id in positions) {
        node.position(positions[id]);
        node.lock();
      }
      // Restore selection state
      if (id in selected) node.select();
      // Restore visibility state
      if (id in hidden) node.hide();
      // Restore locked state
      if (id in locked) node.lock();
      // Make branch nodes, if any, be smaller
      if (node.data('branch')) {
        node.css('height', 15);
        node.css('width', 15);
      }
    });

    var edge_threshold = this.edge_threshold;

    this.cy.edges().each(function(i, edge) {
      var id = edge.id();
      // Restore selection state
      if (id in selected) edge.select();
      // Restore visibility state
      if (id in hidden) edge.hide();
      // Hide edge if under threshold
      if (edge.data('weight') < edge_threshold) edge.hide();
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

    this.updateEdgeGraphics();

    this.updateLayout();
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
    if (this.cy) this.cy.elements("node").remove();
  };

  GroupGraph.prototype.removeSkeletons = function(skeleton_ids) {
    // Convert array values into object keys
    var skids = skeleton_ids.reduce(function(o, skid) {
      o[skid] = true;
      return o;
    }, {});

    var groups = this.groups;

    // Inspect each node, remove node if all its skeletons are to be removed
    this.cy.nodes().each(function(i, node) {
      var models = node.data('skeletons'),
          sks = models.filter(function(model) {
        return !skids[model.id];
      });
      if (0 === sks.length) {
        node.remove();
        if (models.length > 1) {
          // Remove the corresponding group
          delete groups[node.id()];
        }
      }
    });
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

        if (new_model.selected) {
          // Update node properties

          if (new_model.baseName) {
            var name = NeuronNameService.getInstance().getName(new_model.id),
                name = name ? name : new_model.baseName,
                label = node.data('label');
            if (subgraphs[new_model.id] && label.length > 0) {
              var i_ = label.lastIndexOf(' [');
              name = name + (-1 !== i_ ? label.substring(i_) : '');
            }
            node.data('label', name);
          }
          skeleton.color = new_model.color.clone();

          if (one) {
            // Update color in the case of singleton nodes
            node.data('color', '#' + skeleton.color.getHexString());
          }

          var gid = member_of[skeleton.id];
          if (gid && gid !== node.id()) added_to_group += 1;

          set[skeleton.id] = new_model;

        } else {
          // Remove
          if (one) node.remove();
          else {
            // Remove model from the lists of skeletons of the node representing a group
            skeletons.remove(skeleton);
            removed_from_group += 1; // must reload its contribution to the group's edges
          }
        }

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
    if (0 === models.length) {
      CATMAID.info('Selected source is empty.');
      return;
    } else if (1 === models.length) {
      this.append(models);
      return;
    }
    this.appendGroup(models);
  };

  GroupGraph.prototype.appendGroup = function(models) {
    var f = (function (status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
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

      // All neuron names
      var names = Object.keys(models).map(function(skid) {
        // Groups and subgraphs are incompatible
        delete this.subgraphs[skid];
        return models[skid].baseName;
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
      options.appendField("Or type a new name: ", "gg-typed", "", null);
      options.appendCheckbox("Hide intragroup edges", "gg-edges", true);
      options.appendCheckbox("Append number of neurons to name", "gg-number", true);
      options.appendMessage("Choose group color:");
      var groupColor = '#aaaaff';
      var colorButton = document.createElement('button');
      colorButton.appendChild(document.createTextNode('Color'));
      options.dialog.appendChild(colorButton);
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
            new THREE.Color(groupColor), $('#gg-edges').prop('checked'));
        self.append(models); // will remove/add/group nodes as appropriate
      };

      options.show(300, 500, true);

    }).bind(this);

    requestQueue.register(django_url + project.id + "/annotations/forskeletons", "POST",
                          {skeleton_ids: Object.keys(models)}, f);
  };

  GroupGraph.prototype.update = function() {
    var models = this.getSkeletonModels();
    this.load(models);
  };

  GroupGraph.prototype.load = function(models) {
    // Register with name service before we attempt to load the graph
    NeuronNameService.getInstance().registerAll(this, models, (function() {
      this._load(models);
    }).bind(this));
  };

  /** Fetch data from the database and remake the graph. */
  GroupGraph.prototype._load = function(models) {
    var skeleton_ids = Object.keys(models);
    if (0 === skeleton_ids.length) return CATMAID.info("Nothing to load!");

    requestQueue.replace(django_url + project.id + "/skeletons/confidence-compartment-subgraph",
        "POST",
        {skeleton_ids: skeleton_ids},
        (function (status, text) {
            if (200 !== status) return;
            var json = $.parseJSON(text);
            if (json.error) {
              if ('REPLACED' === json.error) return;
              alert(json.error);
              return;
            }
            this.updateGraph(json, models);
        }).bind(this),
        "graph_widget_request");
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

  GroupGraph.prototype.updateEdgeGraphics = function() {
    if (!this.cy) return;
    var directed = this.cy.edges().filter(function(i, edge) {
      return edge.data('directed');
    });
    directed.css('line-color', this.edge_color);
    directed.css('color', this.edge_text_color);
    directed.css('opacity', this.edge_opacity);
    directed.css('text-opacity', this.edge_text_opacity);

    var min = this.edge_min_width,
        color = this.edge_color,
        labelColor = this.edge_text_color,
        edgeWidth = this.edgeWidthFn();

    this.cy.edges().each(function(i, edge) {
      if (edge.data('directed')) {
        edge.data('color', color);
        edge.data('label_color', labelColor);
        edge.data('width', min + edgeWidth(edge.data('weight')));
      }
    });
  };

  GroupGraph.prototype.writeGML = function() {
    var ids = {};
    var items = ['Creator "CATMAID"\nVersion 1.0\ngraph ['];

    this.cy.nodes(function(i, node) {
      if (node.hidden()) return;
      var props = node.data(); // props.id, props.color, props.skeletons, props.node_count, props.label,
      ids[props.id] = i;
      var p = node.position(); // pos.x, pos.y
      // node name with escaped \ and "
      var name = props.label.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
      items.push(["node [",
                  "id " + i,
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

    var blob = new Blob([this.writeGML()], {type: "text/plain"});
    saveAs(blob, "graph.gml");
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
          requestQueue.register(django_url + project.id + "/graph/circlesofhell",
              "POST",
              {skeleton_ids: skids,
               n_circles: n_circles,
               min_pre: p.min_upstream,
               min_post: p.min_downstream},
              CATMAID.jsonResponseHandler(function(json) {
                if (p.filter_regex !== '') {
                  requestQueue.register(django_url + project.id + "/annotations/forskeletons",
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
        node.data('skeletons').forEach(function(sk) { origins[sk.id] = true; });
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
    for (var i=0; i<types; ++i) {
      var type = 'path_' + types[i];
      if (!this[type] || 0 === Object.keys(this[type]).length)  {
        return CATMAID.msg('Select ' + type + ' nodes first!');
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
      requestQueue.register(django_url + project.id + "/graph/directedpaths", "POST",
          {sources: source_skids,
           targets: target_skids,
           path_length: n_hops + 1,
           min_synapses: min_synapses},
           function(status, text) {
             if (200 !== status) return;
             var json = $.parseJSON(text);
             if (json.error) return alert(json.error);
             else process(json);
             continuation();
           });
    };

    var addSkids = function(json) {
      for (var i=0; i<json.length; ++i) {
        var path = json[i];
        for (var j=0; j<path.length; ++j) {
          new_skids[path[j]] = true;
        }
      }
    };

    var end = (function() {
      var all = {};
      this.cy.nodes().each(function(i, node) {
        // If any of the new skeletons is present but hidden, make it visible
        node.data('skeletons').forEach(function(skeleton) {
          if (new_skids[skeleton.id]) node.show();
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
        e.hide(); // if it's a node, hides edges too
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
    this.cy.elements().show();
    if (this.show_node_labels) {
      this.cy.elements().css('text-opacity', 1);
    } else {
      this.cy.edges().css('text-opacity', 0);
    }
    $('#graph_show_hidden' + this.widgetID).val('Show hidden').prop('disabled', true);
  };

  GroupGraph.prototype.removeSelected = function() {
    var nodes = this.orderedSelectedNodes();
    if (0 === nodes.length) return alert("Select one or more nodes first!");
    if (!confirm("Remove " + nodes.length + " selected node" + (nodes.length > 1 ? "s":"") + "?")) return;
    nodes.forEach(function(node) {
      delete this.groups[node.id()]; // ok if not present
      node.remove();
    }, this);
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

  GroupGraph.prototype._colorize = function(select) {
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
      if ('own-review' === mode) postData['user_ids'] = [session.userid];
      else if ('whitelist-review' === mode) postData['whitelist'] = true;
      requestQueue.register(django_url + project.id + "/skeletons/review-status", "POST",
          postData,
          function(status, text) {
            if (status !== 200) return;
            var json = $.parseJSON(text);
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

  /** Synchronously load the heavy-weight SVG libraries if not done already. */
  GroupGraph.prototype.loadSVGLibraries = function(callback) {
    if (GroupGraph.prototype.svg_libs_loaded) {
      if (callback) callback();
      return;
    }

    var libs = ["MochiKit/Base.js", "MochiKit/Iter.js", "MochiKit/Logging.js", "MochiKit/DateTime.js", "MochiKit/Format.js", "MochiKit/Async.js", "MochiKit/DOM.js", "MochiKit/Style.js", "MochiKit/Color.js", "MochiKit/Signal.js", "MochiKit/Position.js", "MochiKit/Visual.js", "MochiKit/LoggingPane.js", "SVGKit/SVGKit.js", "SVGKit/SVGCanvas.js"];

    $.blockUI();

    var scripts = document.getElementsByTagName("script"),
        last = scripts[scripts.length -1];

    var jQuery = $,
        cleanup = function() {
          // FIX DOM.js overwriting jQuery
          window.$ = jQuery;
          $.unblockUI();
        },
        error = function(e) {
          console.log(e, e.stack);
          alert("Sorry: failed to load SVG rendering libraries.");
        },
        fixAPI = function() {
          // Fix up API mismatches between SVGCanvas and Canvas
          SVGCanvas.prototype.fillText = SVGCanvas.prototype.text;
          SVGCanvas.prototype.strokeText = function() {
            // Fortunately always used in ways that can fixed below.
            // Absence of this function explains the need to fix the stroke in SVG elements below.
          };
          SVGCanvas.prototype.setTransform = function() {
            // Fortunately all calls are to the identity transform, that is, to reset,
            // and explains perhaps the issues with the position of the M point in paths below,
            // which is fixable.
          };
          // Monkey path SVGCanvas so that beginPath() does not perform a moveTo()
          SVGCanvas.prototype.beginPath = function() {
            // This is all the original function does, besides moveTo()
            this._subpaths = [""];
          };
        },
        chainLoad = function(libs, i) {
      try {
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = false;
        s.src = STATIC_URL_JS + 'libs/' + libs[i];
        var exec = false;
        s.onreadystatechange = function() {
          if (!exec && (!this.readyState || this.readyState === "loaded" || this.readyState === "complete")) {
            exec = true;
            console.log("Loaded script " + libs[i]);
            console.log(window.SVGCanvas);
            if (i < libs.length -1) chainLoad(libs, i + 1);
            else {
              GroupGraph.prototype.svg_libs_loaded = true;
              cleanup();
              fixAPI();
              if (callback) callback();
            }
          }
        };
        s.onload = s.onreadystatechange;
        last.parentNode.appendChild(s);
      } catch (e) {
        cleanup();
        CATMAID.error(e);
      }
    };

    chainLoad(libs, 0);
  };

  GroupGraph.prototype.exportSVG = function() {
    if (0 === this.cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }

    if (0 === this.cy.edges().length) {
      // This limitation has to do with:
      // 1. Transforms and bounds are not correct for nodes when the graph lacks any edges.
      // 2. Need at least one edge for the heuristics below to detect where the edges end and the nodes start--which could be overcome by testing if the graph has any edges, but given that without edges the rendering is wrong anyway, the best is to avoid it.
      alert("The SVG exporter is currently limited to graphs with edges.");
      return;
    }

    GroupGraph.prototype.loadSVGLibraries(this._exportSVG.bind(this));
  };

  /** Assumes SVG libraries are loaded, a graph exists and has at least one edge. */
  GroupGraph.prototype._exportSVG = function() {

    var div= $('#graph_widget' + this.widgetID),
        width = div.width(),
        height = div.height();
    var svg = new SVGCanvas(width, height);

    // Cytoscape uses Path2D if it is available. Unfortunately, SVGKit isn't able
    // to make use of this as well and silently fails to draw paths. We therefore
    // have to monkey-patch Cytoscape to not use Path2D by overriding its test.
    // We reset to the original function after the graph has been rendered.
    var CanvasRenderer = cytoscape('renderer', 'canvas');
    var orignalUsePaths = CanvasRenderer.usePaths;
    CanvasRenderer.usePaths = function() { return false; };

    this.cy.renderer().renderTo( svg, 1.0, {x: 0, y: 0}, 1.0 );

    // Reset Path2D test of Cytoscape
    CanvasRenderer.usePaths = orignalUsePaths;

    // Fix rendering issues.
    // Painting order is from bottom to top (logically).
    // All edge lines are painted first. Then all edge strings. Then all nodes, as two circles: one is the contour and the other the filling. Then all node strings.
    // Edges are painted as three consecutive path elements:
    //   1. edge line
    //   2. arrowhead line
    //   3. arrowhead filling
    // .. or just with one line when lacking arrowhead.
    // Paths 2 and 3 are identical except one has stroke and the other fill.

    var children = svg.svg.htmlElement.childNodes;

    var edges = [],
        remove = [],
        i = 0;
    // Group the path elements of each edge
    for (; i<children.length; ++i) {
      var child = children[i];
      if ('text' === child.localName) continue;
      if (!child.pathSegList) continue;
      switch(child.pathSegList.length) {
        case 2:
          // New graph edge
          edges.push([child]);
          break;
        case 5:
          // Arrowhead of previous edge
          edges[edges.length -1].push(child);
          break;
      }
    }

    // Fix edge arrowheads if necessary
    for (var k=0; k<edges.length; ++k) {
      var edge = edges[k];
      if (edge.length < 3) continue; // undirected edge or edge without duplicates
      // Fix the style
      var path = edge[2],
          attr = path.attributes;
      attr.stroke.value = attr.fill.value;
      // Remove bogus lineTo
      path.pathSegList.removeItem(2);
      remove.push(edge[1]);
    }

    // Fix edge labels: stroke should be white and of 0.2 thickness
    for (; i<children.length; ++i) {
        var child = children[i];
        if ('text' !== child.localName) break;
        child.attributes.stroke.value = '#ffffff';
        child.style.strokeWidth = '0.2';
    }

    // Fix nodes: instead of two separate paths (one for the filling
    // and one for the contour), add a fill value to the contour
    // and delete the other.
    // Also add the text-anchor: middle to the text.
    for (; i<children.length;) {
      // The second one is the contour
      var child = children[i+1],
          path = child.pathSegList;
      // Find out the type
      var commands = {};
      for (var k=0; k<path.length; ++k) {
        var letter = path[k].pathSegTypeAsLetter,
            count = commands[letter];
        if (count) commands[letter] = count + 1;
        else commands[letter] = 1;
      }
      if (commands['A'] > 0) {
        // Circle: the coordinates of the M are wrong:
        // make the M have the coordinates of the first L
        // Note: cannot remove the L, circle would draw as semicircle
        path[0].x = path[1].x;
        path[0].y = path[1].y;
      }
      // Set the fill value
      child.attributes.fill.value = children[i].attributes.fill.value;
      // Mark the first circle for removal
      remove.push(children[i]);
      // Fix text anchor if present
      var c = children[i+2];
      if (c && 'text' === c.nodeName) {
        c.style.textAnchor = 'middle';
        i += 3;
      } else {
        // Node without text label (branch node in synapse clustering)
        i += 2;
      }
    }


    remove.forEach(function(child) {
      child.parentNode.removeChild(child);
    });


    var s = new XMLSerializer().serializeToString(svg.svg.htmlElement);

    var blob = new Blob([s], {type: 'text/svg'});
    saveAs(blob, "graph-" + this.widgetID + ".svg");
  };

  GroupGraph.prototype.openPlot = function() {
    if (0 === this.cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }
    WindowMaker.create('circuit-graph-plot');
    var GP = CircuitGraphPlot.prototype.getLastInstance(),
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

  GroupGraph.prototype.Group = function(gid, models, label, color, hide_self_edges) {
    this.id = gid;
    this.label = label;
    this.models = models; // skeleton id vs model
    this.color = color;
    this.hide_self_edges = hide_self_edges;
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
  GroupGraph.prototype._regroup = function(data, splitted, models) {
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

    if (0 === groupIDs.length) return;

    // Remove nodes that have been assigned to groups
    data.nodes = data.nodes.filter(function(node) {
      return !member_of[node.data.id];
    });

    // Create one node for each group
    var gnodes = groupIDs.map(function(gid) {
      var group = this.groups[gid];
      return {data: {id: gid,
                     skeletons: Object.keys(group.models).map(function(skid) { return group.models[skid];}),
                     label: group.label,
                     color: '#' + group.color.getHexString(),
                     shape: 'hexagon'}};
    }, this);

    // map of edge_id vs edge, involving groups
    var gedges = {};

    // Remove edges from grouped nodes,
    // and reassign them to new edges involving groups.
    data.edges = data.edges.filter(function(edge) {
      var d = edge.data,
          source = member_of[d.source],
          target = member_of[d.target],
          intragroup = source === target && undefined !== source && undefined !== target;
      if (source || target) {
        source = source ? source : d.source;
        target = target ? target : d.target;
        // Edge between skeletons, with at least one of them belonging to a group
        var id = source + '_' + target;
        var gedge = gedges[id];
        if (gedge) {
          // Just append the synapse count to the already existing edge
          gedge.data.weight += d.weight;
          gedge.data.label = gedge.data.weight;
        } else {
          // Don't show self-edge if desired
          if (intragroup && this.groups[source].hide_self_edges) return false;
          // Reuse edge
          d.id = id;
          d.source = source + ""; // ensure both are strings, fixes issue with edges not curving out (to avoid overlap) in reciprocal connections involving a group
          d.target = target + "";
          gedges[id] = edge;
        }
        return false;
      }

      // Keep only edges among ungrouped nodes
      return true;
    }, this);

    data.nodes = data.nodes.concat(gnodes);
    data.edges = data.edges.concat(Object.keys(gedges).map(function(gid) { return gedges[gid]; }));
  };

  /** Group selected nodes into a single node. */
  GroupGraph.prototype.group = function() {
    var models = this.cy.nodes().filter(function(i, node) {
      return node.selected();
    }).toArray().reduce((function(o, node) {
      if (undefined !== this.groups[node.id()]) delete this.groups[node.id()];
      return node.data('skeletons').reduce(function(o, model) {
        o[model.id] = model;
        return o;
      }, o);
    }).bind(this), {});
    if (Object.keys(models).length > 1) this.appendGroup(models);
    else CATMAID.info("Select at least 2 nodes!");
  };

  /** Split nodes representing groups into their constituent nodes, one per skeleton. */
  GroupGraph.prototype.ungroup = function() {
    var groups = this.groups;
    var count = 0;
    this.cy.nodes().each(function(i, node) {
      if (node.selected() && node.data('skeletons').length > 1) {
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
          return django_url + project.id + '/connector/list/one_to_many';
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
          return django_url + project.id + '/' + skid + '/1/1/0/compact-arbor';
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
            var source = edge.data('source');

            // Find out how many total synapses are thrown away
            // when cutting the arbor at the synapses that make up
            // the edge between source and target.
            var edge_synapses = connectors.reduce(function(o, row) {
              // 2: treenode ID receiving the input
              // 8: skeleton ID of the partner arbor
              if (row[8] === source) o[row[2]] = true;
              return o;
            }, {});

            if (0 === Object.keys(edge_synapses)) {
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
    WindowMaker.create('graph-widget');
    var copy = GroupGraph.prototype.getLastInstance();
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

    var copier = function(elem) { return {data: $.extend(true, {}, elem.data())}; };

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

  GroupGraph.prototype.loadFromJSON = function(files) {
    try {
      if (0 === files.length) return alert("Choose at least one file!");
      if (files.length > 1) return alert("Choose only one file!");
      var name = files[0].name;
      if (name.lastIndexOf('.json') !== name.length - 5) return alert("File extension must be '.json'");
      var reader = new FileReader();
      reader.onload = (function(e) {
        try {
          var json = $.parseJSON(e.target.result);
          var skids = {};
          var asModel = function(ob) {
            skids[ob.id] = true;
            var color = new THREE.Color(ob.color.r, ob.color.g, ob.color.b);
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
            g.color = new THREE.Color(g.color.r, g.color.g, g.color.b);
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
          requestQueue.register(django_url + project.id + '/skeleton/neuronnames', "POST",
              {skids: Object.keys(skids)},
              (function(status, text) {
                if (200 !== status) return;
                var json = $.parseJSON(text);
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
        } catch (error) {
          CATMAID.error("Failed to parse file", error);
        }
      }).bind(this);
      reader.readAsText(files[0]);
    } catch (e) {
      alert("Oops: " + e);
    }
  };

  GroupGraph.prototype.filterEdges = function(countThreshold, confidenceThreshold) {
    // TODO refactor _validate into a Util or CATMAID namespace
    countThreshold = CATMAID.WebGLApplication.prototype._validate(countThreshold, 'Invalid synaptic count', 1);
    confidenceThreshold = CATMAID.WebGLApplication.prototype._validate(confidenceThreshold, 'Invalid synaptic confidence threshold', 1);
    if (!countThreshold) return;
    countThreshold = countThreshold | 0; // cast to int
    this.edge_threshold = countThreshold;
    this.edge_confidence_threshold = confidenceThreshold;
    var edge_threshold = this.edge_threshold;
    var edge_confidence_threshold = this.edge_confidence_threshold;
    this.cy.edges().each(function(i, edge) {
      var props = edge.data();
      if (props.directed) {
        var count = _filterSynapses(props.confidence, edge_confidence_threshold);
        props.weight = count;
        edge.data('label', count);
        edge.data('weight', count);
        if (props.weight < edge_threshold) edge.hide();
        else edge.show();
      }
    });
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

  // Export Graph Widget
  CATMAID.GroupGraph = GroupGraph;

})(CATMAID);
