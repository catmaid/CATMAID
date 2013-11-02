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
}

CompartmentGraphWidget.prototype = {};
$.extend(CompartmentGraphWidget.prototype, new InstanceRegistry());
$.extend(CompartmentGraphWidget.prototype, new SkeletonSource());

CompartmentGraphWidget.prototype.getName = function() {
  return "Graph " + this.widgetID;
};

CompartmentGraphWidget.prototype.getSelectedSkeletons = function() {
  if (!this.cy) return [];
  // Collect unique skeleton IDs
  var ids = {};
  this.cy.nodes(function(i, node) {
    if (node.selected()) {
      var id = node.data("id");
      ids[id.substring(0, id.lastIndexOf('_'))] = null;
    }
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

CompartmentGraphWidget.prototype.getSkeletonModels = function() {
  return this.cy.nodes().toArray().reduce(function(m, node) {
    var props = node.data(),
        model = CompartmentGraphWidget.prototype.createSkeletonModel(props);
    model.setVisible(node.selected());
    m[props.skeleton_id] = model;
    return m;
  }, {});
};

CompartmentGraphWidget.prototype.getSelectedSkeletonModels = function() {
  return this.cy.nodes().toArray().reduce(function(m, node) {
    if (node.selected()) {
      var props = node.data();
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
    var edge = this;
    if (evt.originalEvent.altKey) {
      var splitedge = edge.id().split('_');
      ConnectorSelection.show_shared_connectors( splitedge[0], [splitedge[2]], "presynaptic_to" );
    }
  });
};

/** Unlocks of locked nodes, if any, when done. */
CompartmentGraphWidget.prototype.updateLayout = function(layout) {
  var index = layout ? layout.selectedIndex : 0;
  var options;

  if ( 2 === index ) {
    options = {
      name: 'grid',
      fit: true, // whether to fit the viewport to the graph
      rows: undefined, // force num of rows in the grid
      columns: undefined, // force num of cols in the grid
    };
  } else if ( 0 === index) {
    options = {
        name: 'arbor',
        liveUpdate: true, // whether to show the layout as it's running
        maxSimulationTime: 4000, // max length in ms to run the layout
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
  } else if (3 === index) {
      options = {
          name: 'circle',
          fit: true, // whether to fit the viewport to the graph
          rStepSize: 10, // the step size for increasing the radius if the nodes don't fit on screen
          padding: 30, // the padding on fit
          startAngle: 3/2 * Math.PI, // the position of the first node
          counterclockwise: false // whether the layout should go counterclockwise (true) or clockwise (false)
      };
  } else if (1 === index) {
    options = {
        name: 'breadthfirst', // Hierarchical
        fit: true, // whether to fit the viewport to the graph
        directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
        padding: 30, // padding on fit
        circle: false, // put depths in concentric circles if true, put depths top down if false
        roots: undefined // the roots of the trees
    };
  } else if (4 === index) {
    options = {
        name: 'random',
        fit: true // whether to fit to viewport
    };
  }

  options.stop = (function() { this.cy.nodes().unlock(); }).bind(this);

  this.cy.layout( options );
};

CompartmentGraphWidget.prototype.updateGraph = function(data, models) {
  // Set color of new nodes
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
    console.log(edge.data.source,
                edge.data.target,
                edge.data.risk);
  });

  // Store positions of current nodes and their selected state
  var positions = {},
      selected = {};
  this.cy.nodes().each(function(i, node) {
    positions[node.id()] = node.position();
    if (node.selected()) selected[node.id()] = true;
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
    // Make branch nodes, if any, be smaller
    if (node.data().branch) {
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
    if (skid in models) {
      if (model.selected) {
        node.data('label', model.baseName);
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
              alert(json.error);
              return;
          }
          this.updateGraph(json, models);
      }).bind(this),
      "graph_widget_request");
};

CompartmentGraphWidget.prototype.highlight = function(skeleton_id) {
  var nodes = this.cy.nodes().filter(function(i, node) {
    return skeleton_id === node.data("skeleton_id");
  });
  var css = {};
  nodes.each(function(i, node) {
    css[node.id()] = {w: node.css('width'),
                      h: node.css('height')};
  });
  if (0 === nodes.length) return;
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
    var props = node.data(); // props.id, props.color, props.skeleton_id, props.node_count, props.label,
    ids[props.id] = i;
    var p = node.position(); // pos.x, pos.y
    items.push(["node [",
                "id " + i,
                "skeleton_id " + props.skeleton_id,
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
                'label "' + props.label + ' #' + props.id + '"'].join("\n    "));
    items.push("]");
  });

  this.cy.edges(function(i, edge) {
    var props = edge.data();
    items.push(["edge [",
                "source " + ids[props.source],
                "target " + ids[props.target],
                ["graphics [",
                 "width 1.5",
                 'fill "' + props.color + '"',
                 'type "line"',
                 "Line [",
                 "]",
                 "source_arrow 0",
                 "target_arrow 3"].join("\n      "),
                "]",
                'label "' + props.weight + '"'].join("\n    "));
    items.push("]");
  });

  return items.join("\n  ") + "\n]";
};

CompartmentGraphWidget.prototype.exportGML = function() {
  if (0 === this.cy.nodes().size()) {
    alert("Load a graph first!");
    return;
  }
  var html = "<html><head><title>Graph as GML</title></head><body><pre><div id='myprintrecipe'>" + this.writeGML() + "</div></pre></body></html>";
  var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');
  recipe.document.open();
  recipe.document.write(html);
  recipe.document.close();
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
        var pseudomodel = {selected: true, color: new THREE.Color().setHex(0xffae56)};
        self.append(json.reduce(function(m, skid) {
          m[skid] = pseudomodel;
          return m;
        }, {}));
      });
};

CompartmentGraphWidget.prototype.hideSelected = function() {
  if (!this.cy) return;
  this.cy.elements().each(function(i, e) {
    if (e.selected()) {
      e.hide(); // if it's a node, hides edges too
      e.unselect();
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
};

CompartmentGraphWidget.prototype.showHidden = function() {
  if (!this.cy) return;
  this.cy.elements().show();
  if (this.show_node_labels) {
    this.cy.elements().css('text-opacity', 1);
  } else {
    this.cy.edges().css('text-opacity', 0);
  }
};
