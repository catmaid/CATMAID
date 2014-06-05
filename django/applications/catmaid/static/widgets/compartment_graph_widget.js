/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var GroupGraph = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.confidence_threshold = 0;
  this.synaptic_count_edge_filter = 0; // value equal or higher than this number or kept
  this.show_node_labels = true;
  this.trim_node_labels = false;
  this.clustering_bandwidth = 0;
  this.compute_risk = false;

  this.color_circles_of_hell = this.colorCirclesOfHell.bind(this);

  this.edge_color = '#555';
  this.edge_opacity = 1.0;
  this.edge_text_opacity = 1.0;
  // Edge width is computed as edge_min_width + edge_width_function(weight)
  this.edge_min_width = 0;
  this.edge_width_function = "sqrt"; // choices: identity, log, log10, sqrt

  this.setState('color_mode', 'source');

  // stores re-layout timeout when resizing
  this.relayoutTimeout = null;

  this.groups = {}; // groupID vs Group instances, where groupID is e.g. g0, g1, g2, ...
};

GroupGraph.prototype = {};
$.extend(GroupGraph.prototype, new InstanceRegistry());
$.extend(GroupGraph.prototype, new SkeletonSource());

GroupGraph.prototype.getName = function() {
  return "Graph " + this.widgetID;
};

GroupGraph.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();
  neuronNameService.unregister(this);
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
			return skeleton_id === skeleton.id;
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
  return new SelectionTable.prototype.SkeletonModel(props.skeleton_id, props.label, new THREE.Color().setHex(parseInt('0x' + props.color.substring(1))));
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
  var dialog = document.createElement('div');
  dialog.setAttribute("id", "dialog-graph-confirm");
  dialog.setAttribute("title", "Graph properties");

  var label = document.createTextNode('Keep edges with confidence');
  dialog.appendChild(label);

  var conf = document.createElement('select');
  conf.setAttribute("id", "confidence_threshold");
  for (var i = 0; i < 6; ++i) {
    var option = document.createElement("option");
    option.text = i.toString();
    option.value = i;
    conf.appendChild(option);
  }
  dialog.appendChild(conf);
  // TODO: set confidence_threshold
  dialog.appendChild( document.createElement("br"));

  var label = document.createTextNode('or higher.');
  dialog.appendChild(label);
  dialog.appendChild( document.createElement("br"));

  var label = document.createTextNode('Bandwidth:');
  dialog.appendChild(label);
  var bandwidth = document.createElement('input');
  bandwidth.setAttribute('id', 'clustering_bandwidth_input');
  bandwidth.setAttribute('type', 'text');
  bandwidth.setAttribute('value', this.clustering_bandwidth );
  bandwidth.style.width = "80px";
  dialog.appendChild(bandwidth);
  dialog.appendChild( document.createElement("br"));

  dialog.appendChild(document.createTextNode('Compute synapse risk'));
  var risk = document.createElement('input');
  risk.setAttribute('id', 'synaptic_risk');
  risk.setAttribute('type', 'checkbox');
  if (this.compute_risk)
    risk.setAttribute('checked', 'true');
  dialog.appendChild(risk);
  dialog.appendChild( document.createElement("br"));

  var label = document.createTextNode('Keep edges with ');
  dialog.appendChild(label);
  var syncount = document.createElement('input');
  syncount.setAttribute('id', 'synaptic_count_edge_filter');
  syncount.setAttribute('type', 'text');
  syncount.setAttribute('value', this.synaptic_count_edge_filter );
  syncount.style.width = "30px";
  dialog.appendChild(syncount);
  label = document.createTextNode(' or more synapses.');
  dialog.appendChild(label);
  dialog.appendChild( document.createElement("br"));

  var label = document.createTextNode('Show node labels:');
  dialog.appendChild(label);
  var rand = document.createElement('input');
  rand.setAttribute("type", "checkbox");
  rand.setAttribute("id", "show_node_labels");
  if (this.show_node_labels)
    rand.setAttribute("checked", "true");
  rand.onclick = this.toggle_show_node_labels.bind(this);
  dialog.appendChild(rand);
  dialog.appendChild( document.createElement("br"));

  dialog.appendChild(document.createTextNode('Trim node labels:'));
  var check = document.createElement('input');
  check.setAttribute('type', 'checkbox');
  check.setAttribute('id', 'graph_toggle_short_names');
  if (this.trim_node_labels) check.setAttribute('checked', 'true');
  check.onclick = this.toggleTrimmedNodeLabels.bind(this);
  dialog.appendChild(check);
  dialog.appendChild(document.createElement("br"));

  var p = document.createElement('p');
  p.appendChild(document.createTextNode('Edge properties:'));
  p.appendChild(document.createElement("br"));
  var props = ["opacity", "text opacity", "min width"].map(function(prop) {
    var field = document.createElement('input');
    field.setAttribute('value', this["edge_" + prop.replace(/ /g, "_")]);
    field.style.width = "40px";
    p.appendChild(document.createTextNode("Edge " + prop + ": "));
    p.appendChild(field);
    p.appendChild(document.createElement("br"));
    return field;
  }, this);
  p.appendChild(document.createTextNode('Edge width as '));
  var edgeFnNames = ["identity", "log", "log10", "sqrt"];
  var edgeFnSel = document.createElement('select');
  edgeFnNames.forEach(function(name) { edgeFnSel.appendChild(new Option(name, name)); });
  edgeFnSel.selectedIndex = edgeFnNames.indexOf(this.edge_width_function);
  p.appendChild(edgeFnSel);
  p.appendChild(document.createTextNode(' of the synapse count.'));
  p.appendChild(document.createElement("br"));
  var cw_div = document.createElement('div');
  var edge_cw = Raphael.colorwheel(cw_div, 150);
  edge_cw.color(this.edge_color);
  p.appendChild(cw_div);
  dialog.appendChild(p);


  var self = this;

  $(dialog).dialog({
    height: 440,
    modal: true,
    buttons: {
      "OK": function() {
        self.clustering_bandwidth = bandwidth.value;

        if (!self.confidence_threshold && conf.value) {
          if (Object.keys(self.groups).length > 0) {
            if (confirm("Splitting by confidence ungroups all groups: proceed?")) {
              self.confidence_threshold = conf.value;
              self.resetGroups();
            }
          } else {
            self.confidence_threshold = conf.value;
          }
        }


        self.synaptic_count_edge_filter = syncount.value; // TODO not used?


        if (!self.compute_risk && risk.checked) {
          if (Object.keys(self.groups).length > 0) {
            if (confirm("Computing the synapse risk ungroups all groups: proceed?")) {
              self.compute_risk = risk.checked;
              self.resetGroups();
            }
          } else {
            self.compute_risk = risk.checked;
          }
        }

        var edge_opacity = Number(props[0].value.trim());
        if (!Number.isNaN(edge_opacity) && edge_opacity >= 0 && edge_opacity <= 1) self.edge_opacity = edge_opacity;
        var edge_text_opacity = Number(props[1].value.trim());
        if (!Number.isNaN(edge_text_opacity) && edge_text_opacity >= 0 && edge_text_opacity <= 1) self.edge_text_opacity = edge_text_opacity;
        var edge_min_width = Number(props[2].value.trim());
        if (!Number.isNaN(edge_min_width)) self.edge_min_width = edge_min_width;
        self.edge_width_function = edgeFnNames[edgeFnSel.selectedIndex];
        self.edge_color = '#' + parseColorWheel(edge_cw.color()).getHexString();
        self.updateEdgeGraphics();

        $(this).dialog("close");
      }
    },
    close: function(event, ui) {
      $('#dialog-graph-confirm').remove();
    }
  });
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
            "width": "mapData(node_count, 10, 2000, 30, 50)", //"data(node_count)",
            "height": "mapData(node_count, 10, 2000, 30, 50)"   // "data(node_count)"
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
            "color": "data(color)", // color of the text label
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
  };

  var sel = $("#cyelement" + this.widgetID);
  sel.cytoscape(options).css('background', 'white');
  this.cy = sel.cytoscape("get");

  // this.cy.nodes().bind("mouseover", function(e) {
  //   // console.log('node mouseover', e);
  // });

  this.cy.on('click', 'node', {}, function(evt){
    var node = this;
    if (evt.originalEvent.altKey) {
      // Select in the overlay
      TracingTool.goToNearestInNeuronOrSkeleton("skeleton", node.data('skeleton_id'));
    }
  });

  this.cy.on('click', 'edge', {}, function(evt){
    var edge = this,
        props = edge.data();
    if (props.directed && evt.originalEvent.altKey) {
      ConnectorSelection.show_shared_connectors( props.source, [props.target], "presynaptic_to" );
    }
  });
};

/** Unlocks locked nodes, if any, when done. */
GroupGraph.prototype.updateLayout = function(layout) {
  var index = layout ? layout.selectedIndex : 0;
  var name = ['arbor', 'breadthfirst', 'grid', 'circle', 'concentric', 'concentric out', 'concentric in', 'random', 'cose', 'preset'][index];
  var options = this.createLayoutOptions(name);
  options.stop = (function() { this.cy.nodes().unlock(); }).bind(this);
  this.cy.layout( options );
};

GroupGraph.prototype.createLayoutOptions = function(name) {
  var options;
  if ('grid' === name) {
    options = {
      name: 'grid',
      fit: true, // whether to fit the viewport to the graph
      rows: undefined, // force num of rows in the grid
      columns: undefined, // force num of cols in the grid
    };
  } else if ('arbor' === name) {
    options = {
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
    };
  } else if ('circle' === name) {
      options = {
          name: 'circle',
          fit: true, // whether to fit the viewport to the graph
          rStepSize: 10, // the step size for increasing the radius if the nodes don't fit on screen
          padding: 30, // the padding on fit
          startAngle: 3/2 * Math.PI, // the position of the first node
          counterclockwise: false // whether the layout should go counterclockwise (true) or clockwise (false)
      };
  } else if ('breadthfirst' === name) {
    options = {
        name: 'breadthfirst', // Hierarchical
        fit: true, // whether to fit the viewport to the graph
        directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
        padding: 30, // padding on fit
        circle: false, // put depths in concentric circles if true, put depths top down if false
        roots: undefined // the roots of the trees
    };
  } else if ('random' === name) {
    options = {
        name: 'random',
        fit: true // whether to fit to viewport
    };
  } else if ('cose' === name) {
    options = {
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
      idealEdgeLength: 10,
      // Divisor to compute edge forces
      edgeElasticity: 100,
      // Nesting factor (multiplier) to compute ideal edge length for nested edges
      nestingFactor: 5,
      // Gravity force (constant)
      gravity: 250,

      // Maximum number of iterations to perform
      numIter: 100,
      // Initial temperature (maximum node displacement)
      initialTemp: 200,
      // Cooling factor (how the temperature is reduced between consecutive iterations)
      coolingFactor: 0.95,
      // Lower temperature threshold (below this point the layout will end)
      minTemp: 1
    };
  } else if ('preset' === name) {
    options = {
      name: 'preset',
      // whether to fit to viewport
      fit: true,
      // padding on fit
      padding: 30
    };
  } else if (0 === name.indexOf('concentric')) {
    options = {
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
    };

    // Define the concentric value function: returns numeric value for each node, placing higher nodes in levels towards the centre
    if      ('concentric'     === name) options.concentric = function() { return this.degree(); };
    else if ('concentric in ' === name) options.concentric = function() { return this.indegree(); };
    else if ('concentric out' === name) options.concentric = function() { return this.outdegree(); };
  }

  return options;
};

GroupGraph.prototype.updateNeuronNames = function() {
  this.cy.nodes().each(function(i, node) {
    var models = node.data('skeletons');
    // skip groups
    if (1 == models.length) node.data('label', neuronNameService.getName(models[0].id));
  });
};

/** There is a model for every skeleton ID included in json.
 *  But there could be models for which there isn't a skeleton_id in json: these are disconnected nodes. */
GroupGraph.prototype.updateGraph = function(json, models) {
  // A neuron that is split cannot be part of a group anymore: makes no sense.
  // Neither by confidence nor by synapse clustering.
  // Also, when computing the risk there can't be any groups.


  var data = {};

  // TODO move the risk computation to the client, and only for selected nodes with other selected nodes.
  if (this.compute_risk) {
    data = json;

    // Color nodes
    data.nodes.forEach(function(node) {
      node.data.color = '#' + models[node.data.skeleton_id].color.getHexString();
    });

    // Set color of new edges
    data.edges.forEach(function(edge) {
      var d = edge.data;
      if (d.risk) {
        /*
        var hsv = [0,
                   d.risk > 0.75 ? 0 : 1 - d.risk / 0.75,
                   d.risk > 0.75 ? 0.267 : 1.267 - d.risk / 0.75];
        */
        // TODO how to convert HSV to RGB hex?
        d.color = '#444';
        d.label += ' (' + d.risk.toFixed(2) + ')';
      } else {
        d.color = '#444';
      }
      if (d.arrow === 'none') {
        d.color = '#F00';
      }
    });

  } else {
    var edge_color = this.edge_color;
    var asEdge = function(edge) {
        return {data: {directed: true,
                       arrow: 'triangle',
                       id: edge[0] + '_' + edge[1],
                       label: edge[2],
                       color: edge_color,
                       source: edge[0],
                       target: edge[1],
                       weight: edge[2]}};
    };

    var asNode = function(nodeID) {
        nodeID = nodeID + '';
        var i_ = nodeID.indexOf('_'),
            skeleton_id = -1 === i_ ? nodeID : nodeID.substring(0, i_),
            model = models[skeleton_id];
        return {data: {id: nodeID, // MUST be a string, or fails
                       skeletons: [model.clone()],
                       label: neuronNameService.getName(model.id),
                       node_count: 0,
                       color: '#' + model.color.getHexString()}};
    };

    // Figure out what kind of response we got
    var modes = {basic: false,
                 confidence_split: false,
                 dual_split: false};
    if ('branch_nodes' in json && 'intraedges' in json) modes.dual_split = true;
    else if ('nodes' in json) modes.confidence_split = true;
    else modes.basic = true;

    if (modes.basic) {
      // Basic graph: infer nodes from json.edges
      var seen = {},
          nodes = [],
          appendNode = function(skid) {
            if (seen[skid]) return;
            var node = asNode('' + skid);
            seen[skid] = true;
            nodes.push(node);
          };

      json.edges.forEach(function(edge) {
        edge.slice(0, 2).forEach(appendNode);
      });

      // For nodes without edges, add them from the local list
      Object.keys(models).forEach(appendNode);

      data.nodes = nodes;
      data.edges = json.edges.map(asEdge);

    } else if (modes.confidence_split) {
      // Graph with skeletons potentially split at low confidence edges
      data.nodes = json.nodes.map(asNode);
      data.edges = json.edges.map(asEdge);

    } else {
      // Graph with skeletons potentially split both at low confidence edges
      // and by synapse clustering
      data.nodes = json.nodes.map(asNode).concat(json.branch_nodes.map(function(bnodeID) {
        var node = asNode(bnodeID);
        node.data.label = '';
        node.data.branch = true;
        return node;
      }));

      data.edges = json.edges.map(asEdge).concat(json.intraedges.map(function(edge) {
        return {data: {directed: false,
                       arrow: 'none',
                       id: edge[0] + '_' + edge[1],
                       label: edge[2],
                       color: '#F00',
                       source: edge[0],
                       target: edge[1],
                       weight: 10}}; // default weight for intraedge
      }));
    }

    // Group neurons, if any groups exist, skipping splitted neurons
    // (Neurons may have been splitted either by synapse clustering or at low-confidence edges.)
    var splitted = {};
    if (data.nodes) {
      splitted = data.nodes.reduce(function(o, nodeID) {
        nodeID = nodeID + '';
        var i_ = nodeID.lastIndexOf('_');
        if (-1 !== i_) o[nodeID.substring(0, i_)] = true;
        return o;
      }, {});
    }
    this._regroup(data, splitted, models);
  }

  // Compute edge width for rendering the edge width

  var edgeWidth = this.edgeWidthFn();

  data.edges.forEach(function(edge) {
    edge.data.width = this.edge_min_width + edgeWidth(edge.data.weight);
  }, this);

  // Store positions of current nodes and their selected state
  var positions = {},
      selected = {},
      hidden = {};
  this.cy.nodes().each(function(i, node) {
    var id = node.id();
    positions[id] = node.position();
    if (node.selected()) selected[id] = true;
    if (node.hidden()) hidden[id] = true;
  });

  // Remove all nodes (and their edges)
  // (Can't just remove removed ones: very hard to get right if the value of the clustering_bandwidth changes. Additionally, their size may have changed.)
  this.cy.elements().remove();

  // Re-add them
  this.cy.add( data );

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
    // Make branch nodes, if any, be smaller
    if (node.data('branch')) {
      node.css('height', 15);
      node.css('width', 15);
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
      added_to_group = 0;

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
          var name = neuronNameService.getName(new_model.id);
          node.data('label', name ? name : new_model.baseName);
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

		});
  });

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
  var models = SkeletonListSources.getSelectedSkeletonModels(this);
  if (0 === models.length) {
    growlAlert('Info', 'Selected source is empty.');
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

    // Find common annotations, if any
    var skids = Object.keys(json);
    var common = json[skids[0]].filter(function(annotation) {
      return skids.reduce(function(all, skid) {
        return all && -1 !== json[skid].indexOf(annotation);
      }, true);
    }).sort();

    // Find set of all annotations
    var all = Object.keys(skids.reduce(function(o, skid) {
      return json[skid].reduce(function(o, annotation) {
        o[annotation] = true;
        return o;
      }, o);
    }, {})).sort();

    // All neuron names
    var names = Object.keys(models).map(function(skid) {
      return models[skid].baseName;
    }).sort();

    common.unshift("--");
    all.unshift("--");
    names.unshift("--");

    var options = new OptionsDialog("Group properties");
    options.appendMessage("Choose a group name from:");
    options.appendMessage("(Will pick first non-empty match.)");
    options.appendChoice("Common annotations: ", "gg-common", common, common, common[0]);
    options.appendChoice("All annotations: ", "gg-all", all, all, all[0]);
    options.appendChoice("All neuron names: ", "gg-names", names, names, names[0]);
    options.appendField("Or type a new name: ", "gg-typed", "", null);
    options.appendCheckbox("Hide intragroup edges", "gg-edges", true);
    options.appendMessage("Choose group color:");
    var display = document.createElement('input');
    display.setAttribute('type', 'button');
    display.setAttribute('value', 'Color');
    var default_color = '#aaaaff';
    $(display).css("background-color", default_color);
    options.dialog.appendChild(display);
    var div = document.createElement('div');
    options.dialog.appendChild(div);
    var cw = Raphael.colorwheel(div, 150);
    cw.color(default_color);
    cw.onchange(function(color) {
      $(display).css("background-color", '#' + parseColorWheel(color).getHexString());
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

      var gid = self.nextGroupID();
      self.groups[gid] = new GroupGraph.prototype.Group(gid, models, label, parseColorWheel(cw.color()), $('#gg-edges').is(':checked'));
      self.append(models); // will remove/add/group nodes as appropriate
    };

    options.show(300, 500, true);

  }).bind(this);

  requestQueue.register(django_url + project.id + "/annotations/skeletons/list", "POST",
                        {skids: Object.keys(models)}, f);
};

GroupGraph.prototype.update = function() {
  var models = this.getSkeletonModels();
  this.load(models);
};

GroupGraph.prototype.load = function(models) {
  // Register with name service before we attempt to load the graph
  neuronNameService.registerAll(this, models, (function() {
    this._load(models);
  }).bind(this));
};

/** Fetch data from the database and remake the graph. */
GroupGraph.prototype._load = function(models) {
  var skeleton_ids = Object.keys(models);
  if (0 === skeleton_ids.length) {
    growlAlert("Info", "Nothing to load!");
    return;
  }
  var post = {skeleton_list: skeleton_ids,
              confidence_threshold: this.confidence_threshold,
              risk: this.compute_risk ? 1 : 0};
  if (this.clustering_bandwidth > 0) {
    var selected = Object.keys(this.cy.nodes().toArray().reduce(function(m, node) {
      if (node.selected()) {
        return node.data('skeletons').reduce(function(m, model) {
          m[model.id] = true;
          return m;
        }, m);
      }
      return m;
    }, {}));
    if (selected.length > 0) {
      post.bandwidth = this.clustering_bandwidth;
      post.expand = selected;
    }
  }

  requestQueue.replace(django_url + project.id + "/skeletongroup/skeletonlist_confidence_compartment_subgraph",
      "POST",
      post,
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
  directed.css('color', this.edge_color);
  directed.css('opacity', this.edge_opacity);
  directed.css('text-opacity', this.edge_text_opacity);

  var min = this.edge_min_width,
      color = this.edge_color,
      edgeWidth = this.edgeWidthFn();

  this.cy.edges().each(function(i, edge) {
    if (edge.data('directed')) {
      edge.data('color', color);
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
                'weight ' + props.weight].join("\n    "));
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

GroupGraph.prototype.growGraph = function() {
  this.grow('circlesofhell', 1);
};

GroupGraph.prototype.growPaths = function() {
  this.grow('directedpaths', 2);
};

GroupGraph.prototype.grow = function(subURL, minimum) {
  var skeleton_ids = this.getSelectedSkeletons();
  if (skeleton_ids.length < minimum) {
    growlAlert("Information", "Need at least " + minimum + " skeletons selected!");
    return;
  }

  var n_circles = $('#n_circles_of_hell' + this.widgetID).val(),
      min_pre = $('#n_circles_min_pre' + this.widgetID).val(),
      min_post = $('#n_circles_min_post' + this.widgetID).val();

  var self = this;
  requestQueue.register(django_url + project.id + "/graph/" + subURL,
      "POST",
      {skeleton_ids: skeleton_ids,
       n_circles: n_circles,
       min_pre: min_pre,
       min_post: min_post},
      function(status, text) {
        if (200 !== status) return;
        var json = $.parseJSON(text);
        if (json.error) {
          alert(json.error);
          return;
        }
        if (0 === json.length) {
          growlAlert("Information", "No further skeletons found, with parameters min_pre=" + min_pre + ", min_post=" + min_post);
          return;
        }
        var color = new THREE.Color().setHex(0xffae56);
        self.append(json[0].reduce(function(m, skid) {
          var model = new SelectionTable.prototype.SkeletonModel(skid, json[1][skid], color);
          model.selected = true;
          m[skid] = model;
          return m;
        }, {}));
      });
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

  this.cy.nodes().off({'select': this.color_circles_of_hell,
                       'unselect': this.color_circles_of_hell});

  if ('source' === mode) {
    // Color by the color given in the SkeletonModel
    var colors = this.getState().colors;
    if (!colors) {
      ("Oops: color state was not preserved.");
      return;
    }
    this.cy.nodes().each(function(i, node) {
      node.data('color', colors[node.data('skeletons')[0]]); // use first skeleton
    });
    this.removeState('colors');

  } else if (-1 !== mode.indexOf("review")) {
    // Color by review status like in the connectivity widget:
    // greenish '#6fff5c': fully reviewed
    // orange '#ffc71d': review started
    // redish '#ff8c8c': not reviewed at all
    var cy = this.cy,
        postData = {skeleton_ids: this.getSkeletons()};
    // if user_ids is not specified, returns the union
    if ('own-review' === mode) postData['user_ids'] = [session.userid];
    requestQueue.register(django_url + project.id + "/skeleton/review-status", "POST",
        postData,
        function(status, text) {
          if (status !== 200) return;
          var json = $.parseJSON(text);
          cy.nodes().each(function(i, node) {
            var skeletons = node.data("skeletons");
            // Compute average
            var percent_reviewed = skeletons.reduce(function(sum, model) {
              return sum + json[model.id];
            }, 0) / skeletons.length,
                hex = '#ff8c8c';
            if (100 === percent_reviewed) hex = '#6fff5c';
            else if (percent_reviewed > 0) hex = '#ffc71d';
            node.data('color', hex);
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

    if (graph.number_of_nodes() > 10) $.blockUI({message: '<img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> <h2>Computing betweenness centrality for ' + graph.number_of_nodes() + ' nodes and ' + graph.number_of_edges() + ' edges.</div></h2>'});

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
      growlAlert('ERROR', 'Problem computing betweenness centrality');
    }
    $.unblockUI();

  } else if ('circles_of_hell' === mode) {
    this.cy.nodes().on({'select': this.color_circles_of_hell,
                        'unselect': this.color_circles_of_hell});
    this.color_circles_of_hell();
  }
};

GroupGraph.prototype.colorCirclesOfHell = function() {
  var selected = this.cy.nodes().toArray().filter(function(node) { return node.selected(); });
  if (1 !== selected.length) {
    growlAlert("Info", "Need 1 (and only 1) selected node!");
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
      // Downstream:
      m.AdjM[k].forEach(function(count, i) {
        if (0 === count) return;
        var id2 = m.ids[i];
        if (consumed[id2]) return;
        next[id2] = true;
        consumed[id2] = true;
        n += 1;
      });
      // Upstream:
      m.AdjM.forEach(function(row, i) {
        if (0 === row[k]) return;
        var id2 = m.ids[i];
        if (consumed[id2]) return;
        next[id2] = true;
        consumed[id2] = true;
        n += 1;
      });
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
  colors.push['#fff']; // white

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
  var AdjM = ids.map(function() { return ids.map(function() { return 0; })}),
      edges = {};
  // Plan for potentially split neurons
  this.cy.edges().each(function(i, edge) {
    if (edge.hidden()) return;
    var e = edge.data();
    if (!e.directed) return; // intra-edge of a neuron split by synapse clustering
    var source = e.source,
        target = e.target,
        c = edges[source];
    if (!c) {
      edges[source] = {};
      edges[source][target] = e.weight;
    } else if (c[target]) {
      c[target] += e.weight;
    } else {
      c[target] = e.weight;
    }
  });
  Object.keys(edges).forEach(function(source) {
    var c = edges[source];
    Object.keys(c).forEach(function(target) {
      AdjM[indices[source]][indices[target]] = c[target];
    });
  });
  return {ids: ids, // list of node IDs
          AdjM: AdjM,
          skeletons: skeletons, // list of models
          names: names}; // list of strings
};

GroupGraph.prototype.exportAdjacencyMatrix = function() {
  if (0 === this.cy.nodes().size()) {
    alert("Load a graph first!");
    return;
  }

  var m = this.createAdjacencyMatrix(),
      names = m.names.map(function(o, name, i) {
        var managed = neuronNameService.getName(m.ids[i]);
        if (managed) name = managed;
        return '"' + name.replace(/\\/g, '\\\\').replace(/"/g,'\\"');
      }, {});

  // First row and first column take the neuron names plus the #<skeleton_id>
  var csv = '"Neurons",' + names.join(',') + '\n' + m.AdjM.map(function(row, i) {
    return names[i] + ',' + row.join(',');
  }).join('\n');

  var blob = new Blob([csv], {type: 'text/plain'});
  saveAs(blob, "adjacency_matrix.csv");
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
  var groupIDs = Object.keys(this.groups);
  if (0 === groupIDs.length) return;

  // Remove splitted neurons from existing groups when necessary,
  // construct member_of: a map of skeleton ID vs group ID,
  // and reset the group's nodes list.
  var member_of = {};

  groupIDs.forEach(function(gid) {
    var group = this.groups[gid],
        gmodels = group.models;

    Object.keys(gmodels).forEach(function(skid) {
      if (skid in splitted) {
        // Remove from the group
        delete gmodels[skid];
        return;
      }
      member_of[skid] = gid;
    });

    if (0 === gmodels.length) {
      // Remove empty group
      delete this.groups[gid];
      return;
    }
  }, this);

  // Update: empty ones have been removed
  groupIDs = Object.keys(this.groups);
  if (0 === groupIDs.length) return;

  // Remove nodes that have been assigned to groups
  data.nodes = data.nodes.filter(function(node) {
    return !member_of[node.data.id];
  });

  // Create one node for each group
  var gnodes = Object.keys(this.groups).map(function(gid) {
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
        intragroup = undefined !== source && undefined !== target;
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
        d.source = source;
        d.target = target;
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
  }).toArray().reduce(function(o, node) {
    return node.data('skeletons').reduce(function(o, model) {
      o[model.id] = model;
      return o;
    }, o);
  }, {});
  if (Object.keys(models).length > 1) this.appendGroup(models);
  else growlAlert("Information", "Select at least 2 nodes!");
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
  else growlAlert("Information", "Nothing to ungroup!");
};
