/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var CompartmentGraphWidget = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.confidence_threshold = 0;
  this.synaptic_count_edge_filter = 0; // value equal or higher than this number or kept
  this.show_node_labels = true;
  this.trim_node_labels = false;
  this.clustering_bandwidth = 0;
  this.compute_risk = false;

  this.color_circles_of_hell = this.colorCirclesOfHell.bind(this);

  this.setState('color_mode', 'source');

  // stores re-layout timeout when resizing
  this.relayoutTimeout = null;
}

CompartmentGraphWidget.prototype = {};
$.extend(CompartmentGraphWidget.prototype, new InstanceRegistry());
$.extend(CompartmentGraphWidget.prototype, new SkeletonSource());

CompartmentGraphWidget.prototype.getName = function() {
  return "Graph " + this.widgetID;
};

CompartmentGraphWidget.prototype.getSelectedSkeletons = function() {
  if (!this.cy) return [];
  // Collect unique, selected skeleton IDs
  var ids = {};
  this.cy.nodes(function(i, node) {
    if (node.selected() && node.visible()) {
      ids[node.data("skeleton_id")] = null;
    }
  });
  return Object.keys(ids).map(Number);
};

CompartmentGraphWidget.prototype.getSkeletons = function() {
  if (!this.cy) return [];
  // Collect unique skeleton IDs
  var ids = {};
  this.cy.nodes(function(i, node) {
    ids[node.data('skeleton_id')] = null;
  });
  return Object.keys(ids).map(Number);
};

/** One or more for each skeleton_id, depending on the synapse clustering bandwidth. */
CompartmentGraphWidget.prototype.getNodes = function(skeleton_id) {
  return this.cy.nodes().filter(function(i, node) {
    return skeleton_id === node.data("skeleton_id");
  });
};

CompartmentGraphWidget.prototype.getSkeletonColor = function(skeleton_id) {
  var nodes = this.getNodes(skeleton_id);
  if (nodes.length > 0) {
    return new THREE.Color(nodes[0].data("color"));
  }
  return new THREE.Color().setRGB(1, 0, 1);
};

CompartmentGraphWidget.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();
};

CompartmentGraphWidget.prototype.updateModels = function(models) {
  this.append(models);
};

CompartmentGraphWidget.prototype.hasSkeleton = function(skeleton_id) {
  return this.getNodes(skeleton_id).length > 0;
};

CompartmentGraphWidget.prototype.createSkeletonModel = function(props) {
  return new SelectionTable.prototype.SkeletonModel(props.skeleton_id, props.label, new THREE.Color().setHex(parseInt('0x' + props.color.substring(1))));
};

CompartmentGraphWidget.prototype.getSkeletonModel = function(skeleton_id) {
  var nodes = this.getNodes(skeleton_id);
  if (0 === nodes.length) return null;
  var node = nodes[0],
      props = node.data(),
      model = this.createSkeletonModel(props);
  model.setVisible(node.selected());
  return model;
};

/** Return a SkeletonModel for every skeleton ID, with the model selected if at least one of the nodes of that skeleton is visible. There could be more than one node when a skeleton is split by confidence or exploded by synapse clustering. */
CompartmentGraphWidget.prototype.getSkeletonModels = function() {
  return this.cy.nodes().toArray().reduce(function(m, node) {
    var props = node.data();
    if (props.branch) return m; // ignore branch nodes from neurons split by synapse clustering
    if (m[props.skeleton_id]) {
      // Already seen (there could be more than one when split by confidence or synapse clustering)
      if (node.selected()) m[props.skeleton_id].setVisible(true);
      return m;
    }
    var model = CompartmentGraphWidget.prototype.createSkeletonModel(props);
    model.setVisible(node.selected());
    m[props.skeleton_id] = model;
    return m;
  }, {});
};

CompartmentGraphWidget.prototype.getSelectedSkeletonModels = function() {
  return this.cy.nodes().toArray().reduce(function(m, node) {
    if (node.selected() && node.visible()) {
      var props = node.data();
    if (props.branch) return m; // ignore branch nodes from neurons split by synapse clustering
    if (m[props.skeleton_id]) return m; // already seen (there could be more than one when split by confidence or synapse clustering)
      m[props.skeleton_id] = new SelectionTable.prototype.SkeletonModel(props.skeleton_id, props.label, new THREE.Color(props.color));
    }
    return m;
  }, {});
};

CompartmentGraphWidget.prototype.toggle_show_node_labels = function() {
  if (this.show_node_labels) {
    this.show_node_labels = false;
    this.cy.nodes().css('text-opacity', 0);
  } else {
    this.show_node_labels = true;
    this.cy.nodes().css('text-opacity', 1);
  }
};

CompartmentGraphWidget.prototype.graph_properties = function() {
  var dialog = document.createElement('div');
  dialog.setAttribute("id", "dialog-graph-confirm");
  dialog.setAttribute("title", "Graph properties");

  var label = document.createTextNode('Keep edges with confidence');
  dialog.appendChild(label);

  var sync = document.createElement('select');
  sync.setAttribute("id", "confidence_threshold");
  for (var i = 0; i < 6; ++i) {
    var option = document.createElement("option");
    option.text = i.toString();
    option.value = i;
    sync.appendChild(option);
  }
  dialog.appendChild(sync);
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

  var label = document.createTextNode('Keep edges with weight ');
  dialog.appendChild(label);
  var syncount = document.createElement('input');
  syncount.setAttribute('id', 'synaptic_count_edge_filter');
  syncount.setAttribute('type', 'text');
  syncount.setAttribute('value', this.synaptic_count_edge_filter );
  syncount.style.width = "30px";
  dialog.appendChild(syncount);
  label = document.createTextNode(' or higher.');
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

  var self = this;

  $(dialog).dialog({
    height: 440,
    modal: true,
    buttons: {
      "OK": function() {
        // TODO: fixme, does not return correct value after update
        self.clustering_bandwidth = bandwidth.value;
        self.confidence_threshold = sync.value;
        self.synaptic_count_edge_filter = syncount.value;
        self.compute_risk = risk.checked;
        $(this).dialog("close");
      }
    },
    close: function(event, ui) { 
      $('#dialog-graph-confirm').remove();
    }
  });
};

CompartmentGraphWidget.prototype.init = function() {
  // TODO what is this?
  $("#edgecount_threshold").bind("keyup paste", function(){
      setTimeout(jQuery.proxy(function() {
          this.val(this.val().replace(/[^0-9]/g, ''));
      }, $(this)), 0);
  });

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
            "width": "data(weight)", //mapData(weight, 0, 100, 10, 50)",
            "target-arrow-shape": "data(arrow)",
            // "source-arrow-shape": "circle",
            "line-color": "data(color)",
            "opacity": 0.4,
            "text-opacity": 1.0
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

/** Unlocks of locked nodes, if any, when done. */
CompartmentGraphWidget.prototype.updateLayout = function(layout) {
  var index = layout ? layout.selectedIndex : 0;
  var name = ['arbor', 'breadthfirst', 'grid', 'circle', 'random', 'cose', 'preset'][index];
  var options = this.createLayoutOptions(name);
  options.stop = (function() { this.cy.nodes().unlock(); }).bind(this);
  this.cy.layout( options );
};

CompartmentGraphWidget.prototype.createLayoutOptions = function(name) {
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
  }

  return options;
};

CompartmentGraphWidget.prototype.updateGraph = function(json, models) {

  var data = {};

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
    var asEdge = function(edge) {
        return {data: {directed: true,
                       arrow: 'triangle',
                       id: edge[0] + '_' + edge[1],
                       label: edge[2],
                       color: '#444',
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
                       skeleton_id: parseInt(skeleton_id),
                       label: model.baseName,
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
  }

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

CompartmentGraphWidget.prototype.toggleTrimmedNodeLabels = function() {
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

CompartmentGraphWidget.prototype.clear = function() {
  if (this.cy) this.cy.elements("node").remove();
};

CompartmentGraphWidget.prototype.removeSkeletons = function(skeleton_ids) {
  var models = this.getSkeletonModels();
  skeleton_ids.forEach(function(skid) {
    delete models[skid];
  });
  this.load(Object.keys(models), models);
};

CompartmentGraphWidget.prototype.append = function(models) {

  var set = {};

  this.cy.nodes().each(function(i, node) {
    var skid = node.data('skeleton_id'),
        model = models[skid];
    if (model) {
      if (model.selected) {
        // Update name only if present
        if (model.baseName) node.data('label', model.baseName);
        node.data('color', '#' + model.color.getHexString());
        set[skid] = model;
      } else {
        node.remove();
      }
    } else {
      set[skid] = CompartmentGraphWidget.prototype.createSkeletonModel(node.data());
    }
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

  if (0 === additions) return; // all updating and removing done above

  this.load(Object.keys(set), set);
};

CompartmentGraphWidget.prototype.update = function() {
  var models = this.getSkeletonModels();
  this.load(Object.keys(models), models);
};

CompartmentGraphWidget.prototype.load = function(skeleton_ids, models) {
  if (0 === skeleton_ids.length) {
    growlAlert("Info", "Nothing to load!");
    return;
  }
  var post = {skeleton_list: skeleton_ids,
              confidence_threshold: this.confidence_threshold,
              risk: this.compute_risk ? 1 : 0};
  if (this.clustering_bandwidth > 0) {
    var selected = Object.keys(this.cy.nodes().toArray().reduce(function(m, node) {
      if (node.selected()) m[node.data('skeleton_id')] = true;
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

CompartmentGraphWidget.prototype.highlight = function(skeleton_id) {
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

CompartmentGraphWidget.prototype.writeGML = function() {
  var ids = {};
  var items = ['Creator "CATMAID"\nVersion 1.0\ngraph ['];

  this.cy.nodes(function(i, node) {
    if (node.hidden()) return;
    var props = node.data(); // props.id, props.color, props.skeleton_id, props.node_count, props.label,
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
                "skeleton_id " + props.skeleton_id].join("\n    "));
    items.push("]");
  });

  this.cy.edges(function(i, edge) {
    if (edge.hidden()) return;
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

CompartmentGraphWidget.prototype.exportGML = function() {
  if (0 === this.cy.nodes().size()) {
    alert("Load a graph first!");
    return;
  }

  var blob = new Blob([this.writeGML()], {type: "text/plain"});
  saveAs(blob, "graph.gml");
};

CompartmentGraphWidget.prototype.growGraph = function() {
  this.grow('circlesofhell', 1);
};

CompartmentGraphWidget.prototype.growPaths = function() {
  this.grow('directedpaths', 2);
};

CompartmentGraphWidget.prototype.grow = function(subURL, minimum) {
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
          m[skid] = {selected: true,
                     color: color,
                     baseName: json[1][skid]};
          return m;
        }, {}));
      });
};

CompartmentGraphWidget.prototype.hideSelected = function() {
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

CompartmentGraphWidget.prototype.showHidden = function() {
  if (!this.cy) return;
  this.cy.elements().show();
  if (this.show_node_labels) {
    this.cy.elements().css('text-opacity', 1);
  } else {
    this.cy.edges().css('text-opacity', 0);
  }
  $('#graph_show_hidden' + this.widgetID).val('Show hidden').prop('disabled', true);
};

CompartmentGraphWidget.prototype.getState = function() {
  return this.state ? this.state : {};
};

CompartmentGraphWidget.prototype.setState = function(key, value) {
  if (!this.state) this.state = {};
  this.state[key] = value;
};

CompartmentGraphWidget.prototype.removeState = function(key) {
  if (this.state) delete this.state[key];
};

CompartmentGraphWidget.prototype.resetState = function() {
  delete this.state;
};

CompartmentGraphWidget.prototype.getSkeletonHexColors = function() {
  var colors = {};
  this.cy.nodes().each(function(i, node) {
    var id = node.data('skeleton_id');
    if (!colors[id]) colors[id] = node.data('color');
  });
  return colors;
};

/** Return an object with skeleton ID as keys and a {inputs: <total-inputs>, outputs: <total-outputs>} as values. */
CompartmentGraphWidget.prototype.getSkeletonsIO = function() {
  var nodes = this.getSkeletons().reduce(function(o, skid) {
    o[skid] = {inputs: 0, outputs: 0};
    return o;
  }, {});
  this.cy.edges().each(function(i, edge) {
    var e = edge.data();
    if (e.directed) {
      nodes[e.target].inputs += e.weight;
      nodes[e.source].outputs += e.weight;
    }
  });
  return nodes;
};

CompartmentGraphWidget.prototype._colorize = function(select) {
  this.colorBy(select.value, select);
};

CompartmentGraphWidget.prototype.colorBy = function(mode, select) {
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
      node.data('color', colors[node.data('skeleton_id')]);
    });
    this.removeState('colors');

  } else if ('union-review' === mode || 'own-review' === mode) {
    // Color by review status like in the connectivity widget (either
    // by union or by own reviews):
    // greenish '#6fff5c': fully reviewed
    // orange '#ffc71d': review started
    // redish '#ff8c8c': not reviewed at all
    var cy = this.cy;
    // Create post data with review parameters. If user_ids isn't specified, a
    // union status is returned.
    var postData = {skeleton_ids: this.getSkeletons()};
    if ('own-review' === mode) {
      postData['user_ids'] = [session.userid];
    }
    // Request review status
    requestQueue.register(django_url + project.id + "/skeleton/review-status", "POST",
        postData,
        function(status, text) {
          if (status !== 200) return;
          var json = $.parseJSON(text);
          cy.nodes().each(function(i, node) {
            var percent_reviewed = json[node.data('skeleton_id')],
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
    var ios = this.getSkeletonsIO();
    var color = new THREE.Color();
    this.cy.nodes().each(function(i, node) {
      var io = ios[node.data('skeleton_id')];
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

CompartmentGraphWidget.prototype.colorCirclesOfHell = function() {
  var selected = this.getSelectedSkeletons();
  if (1 !== selected.length) {
    growlAlert("Info", "Need 1 (and only 1) selected neuron!");
    this.cy.nodes().each(function(i, node) {
      node.data('color', '#fff');
    });
    return;
  }

  var m = this.createAdjacencyMatrix(),
      circles = [],
      current = {},
      next,
      consumed = {},
      n_consumed = 1,
      n = 0;

  current[selected[0]] = true;
  circles.push(current);
  consumed[selected[0]] = true;

  while (n_consumed < m.skeleton_ids.length) {
    current = circles[circles.length -1];
    next = {};
    n = 0;
    Object.keys(current).forEach(function(skid1) {
      var k = m.indices[skid1];
      // Downstream:
      m.AdjM[k].forEach(function(count, i) {
        if (0 === count) return;
        var skid2 = m.skeleton_ids[i];
        if (consumed[skid2]) return;
        next[skid2] = true;
        consumed[skid2] = true;
        n += 1;
      });
      // Upstream:
      m.AdjM.forEach(function(row, i) {
        if (0 === row[k]) return;
        var skid2 = m.skeleton_ids[i];
        if (consumed[skid2]) return;
        next[skid2] = true;
        consumed[skid2] = true;
        n += 1;
      });
    });
    if (0 === n) break;
    n_consumed += n;
    circles.push(next);
  }

  var disconnected = m.skeleton_ids.reduce(function(o, skid) {
    if (skid in consumed) return o;
    o[skid] = true;
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
    var skid = node.data('skeleton_id');
    circles.some(function(circle, i) {
      if (skid in circle) {
        node.data('color', colors[i]); 
        return true; // break
      }
      return false; // continue
    });
  });
};

/** Includes only visible nodes and edges. */
CompartmentGraphWidget.prototype.createAdjacencyMatrix = function() {
  if (0 === this.cy.nodes().size()) {
    return {skeleton_ids: [],
            AdjM: []};
  }
  // Collect unique, visible skeleton IDs
  var unique_ids = {};
  this.cy.nodes(function(i, node) {
    if (node.hidden()) return;
    unique_ids[node.data('skeleton_id')] = true;
  });
  var skeleton_ids = Object.keys(unique_ids).map(Number),
      indices = skeleton_ids.reduce(function(o, skid, i) { o[skid] = i; return o;}, {}),
      AdjM = skeleton_ids.map(function() { return skeleton_ids.map(function() { return 0; })}),
      edges = {};
  // Handle synapse clustered sub-neurons and neurons split by confidence
  var asNumericID = function(id) {
    if (id.toFixed) return id; // is a number
    var i_ = id.lastIndexOf('_');
    if (-1 === i_) return parseInt(i_);
    return parseInt(id.substring(0, i_));
  };
  // Plan for potentially split neurons
  this.cy.edges().each(function(i, edge) {
    if (edge.hidden()) return;
    var e = edge.data();
    if (!e.directed) return; // intra-edge of a neuron split by synapse clustering
    var source = asNumericID(e.source),
        target = asNumericID(e.target),
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
  return {skeleton_ids: skeleton_ids,
          indices: indices,
          AdjM: AdjM};
};

CompartmentGraphWidget.prototype.exportAdjacencyMatrix = function() {
  if (0 === this.cy.nodes().size()) {
    alert("Load a graph first!");
    return;
  }

  var m = this.createAdjacencyMatrix(),
      models = this.getSkeletonModels(),
      names = m.skeleton_ids.reduce(function(o, skid) {
        var name = models[skid].baseName
            .replace(/\\/g, '\\\\').replace(/"/g,'\\"');
        o[skid] = '"' + name + ' #' + skid + '"';
        return o;
      }, {});

  // First row and first column take the neuron names plus the #<skeleton_id>
  var csv = '"Neurons",' + m.skeleton_ids.map(function(skid) {
    return names[skid];
  }).join(',') + '\n' + m.AdjM.map(function(row, i) {
    return names[m.skeleton_ids[i]] + ',' + row.join(',');
  }).join('\n');

  var blob = new Blob([csv], {type: 'text/plain'});
  saveAs(blob, "adjacency_matrix.csv");
};

CompartmentGraphWidget.prototype.openPlot = function() {
  if (0 === this.cy.nodes().size()) {
    alert("Load a graph first!");
    return;
  }
  WindowMaker.create('circuit-graph-plot');
  var GP = CircuitGraphPlot.prototype.getLastInstance(),
      models = this.getSkeletonModels(),
      m = this.createAdjacencyMatrix();
  GP.plot(m.skeleton_ids, models, m.AdjM);
};

CompartmentGraphWidget.prototype.annotate_skeleton_list = function() {
  var skeleton_ids = this.getSelectedSkeletons();
  NeuronAnnotations.prototype.annotate_neurons_of_skeletons(skeleton_ids);
};

CompartmentGraphWidget.prototype.resize = function() {
  if (this.cy) {
    // Schedule a re-layout without chaning the node position after 400ms and
    // override it automatically if resizing isn't finished, yet.
    if (this.relayoutTimeout) {
      clearTimeout(this.relayoutTimeout);
    }
    this.relayoutTimeout = setTimeout((function() {
      // Update the layout accordingly
      var options = {
        name: 'preset',
        fit: false,
      };
      this.cy.layout( options );
    }).bind(this), 400);
  }
};
