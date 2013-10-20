/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var cy;

var CompartmentGraphWidget = new function()
{

  var self = this;

  var confidence_threshold = 0,
      synaptic_count_edge_filter = 0, // value equal or higher than this number or kept
      show_node_labels = true,
      trim_node_labels = false;
      clustering_bandwidth = 0;

  this.toggle_show_node_labels = function() {
    if( show_node_labels ) {
      show_node_labels = false;
      cy.nodes().css('text-opacity', 0);
    } else {
      show_node_labels = true;
      cy.nodes().css('text-opacity', 1);
    }
  };

  this.graph_properties = function() {

    console.log('initialize value',synaptic_count_edge_filter, clustering_bandwidth, confidence_threshold)

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
    bandwidth.setAttribute('value', clustering_bandwidth );
    bandwidth.style.width = "80px";
    dialog.appendChild(bandwidth);
    dialog.appendChild( document.createElement("br"));

    var label = document.createTextNode('Keep edges with weight ');
    dialog.appendChild(label);
    var syncount = document.createElement('input');
    syncount.setAttribute('id', 'synaptic_count_edge_filter');
    syncount.setAttribute('type', 'text');
    syncount.setAttribute('value', synaptic_count_edge_filter );
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
    if( show_node_labels )
      rand.setAttribute("checked", "true");
    rand.onclick = self.toggle_show_node_labels;
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    dialog.appendChild(document.createTextNode('Trim node labels:'));
    var check = document.createElement('input');
    check.setAttribute('type', 'checkbox');
    check.setAttribute('id', 'graph_toggle_short_names');
    if (trim_node_labels) check.setAttribute('checked', 'true');
    check.onclick = self.toggleTrimmedNodeLabels;
    dialog.appendChild(check);
    dialog.appendChild(document.createElement("br"));

    $(dialog).dialog({
      height: 440,
      modal: true,
      buttons: {
        "OK": function() {
          
          self.whatvalue();
          // TODO: fixme, does not return correct value after update
          clustering_bandwidth = $('#clustering_bandwidth_input').val();
          confidence_threshold = $('#confidence_threshold').val();
          synaptic_count_edge_filter = $('#synaptic_count_edge_filter').val();

          $(this).dialog("close");

        }
      },
      close: function(event, ui) { 
        $('#dialog-graph-confirm').remove();
      }
    });

  }

  this.whatvalue = function()
  {
    console.log('what value',synaptic_count_edge_filter, clustering_bandwidth, confidence_threshold)
    console.log('dom', $('#clustering_bandwidth_input').val() )

  }

  this.init = function()
  {

      $("#edgecount_threshold").bind("keyup paste", function(){
          setTimeout(jQuery.proxy(function() {
              this.val(this.val().replace(/[^0-9]/g, ''));
          }, $(this)), 0);
      });

      // id of Cytoscape Web container div
      var div_id = "#cyelement";

      var options = {
        ready: function(){
          // console.log('cytoscape ready')
        },
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
              })
            .selector(":selected")
              .css({
                "background-color": "#000",
                "line-color": "#000",
                "source-arrow-color": "#000",
                "target-arrow-color": "#000",
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
      /* elements: {
          nodes: [
            { data: { id: 'foo' } }, // NB no group specified
            { data: { id: 'bar' } },
            {
                  data: { weight: 100 }, // elided id => autogenerated id 
                  position: {
                    x: 100,
                    y: 200
                  },
                  classes: 'className1 className2',
                  selected: true,
                  selectable: true,
                  locked: false,
                  grabbable: true
            },

          ],

          edges: [
            { data: { id: 'baz', source: 'foo', target: 'bar' } },
          ]
        }*/

      };
      $(div_id).cytoscape(options);
      cy = $(div_id).cytoscape("get");

  };

  this.updateLayout = function( layout ) {
    var options;

    if ( 1 === layout ) {
      options = {
        name: 'grid',
        fit: true, // whether to fit the viewport to the graph
        rows: undefined, // force num of rows in the grid
        columns: undefined, // force num of cols in the grid
        ready: undefined, // callback on layoutready
        stop: undefined // callback on layoutstop
      };
    } else if ( 0 === layout) {
      options = {
          name: 'arbor',
          liveUpdate: true, // whether to show the layout as it's running
          ready: undefined, // callback on layoutready 
          stop: undefined, // callback on layoutstop
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
    }

    cy.layout( options );
  };

  this.updateGraph = function( data ) {

    for (var i = 0; i < data.nodes.length; i++) {
      var color = NeuronStagingArea.getSkeletonColor(parseInt(data.nodes[i]['data'].id));
      data.nodes[i]['data']['color'] = color ? '#' + color.getHexString() : '#60AFFE';
    }

    var grey = [0, 0, 0.267]; // HSV for #444
    var red = [0, 1, 1]; // HSV for #F00 
    var max = 0.75;
    var min = 0.0;

    for (var i=0; i<data.edges.length; i++) {
      var d = data.edges[i].data;
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
      console.log(data.edges[i].data.source,
                  data.edges[i].data.target,
                  data.edges[i].data.risk);
    }

    // first remove all nodes
    cy.elements("node").remove();

    cy.add( data );

    // Make branch nodes, if any, be smaller
    cy.nodes().each(function(i, node) {
      if (node.data().branch) {
        node.css('height', 15);
        node.css('width', 15);
      }
    });

    // If hide labels, hide them
    if (!show_node_labels) {
      cy.nodes().css('text-opacity', 0);
    }

    // if text is to be short, render as short
    if (trim_node_labels || $('#graph_toggle_short_names').attr('checked')) {
      delete this.originalNames;
      this.toggleTrimmedNodeLabels();
    }

    this.updateLayout( 0 );

    // cy.nodes().bind("mouseover", function(e) {
    //   // console.log('node mouseover', e);
    // });

    cy.on('click', 'node', {}, function(evt){
      var node = this;
      var splitname = node.id().split('_');
      if (evt.originalEvent.altKey) {
        // Toggle visibility in the 3d viewer
        NeuronStagingArea.selectSkeletonById( splitname[0] );
      } else if (evt.originalEvent.shiftKey) {
        // Select in the overlay
        TracingTool.goToNearestInNeuronOrSkeleton("skeleton", parseInt(splitname[0]));
      }
    });

    cy.on('click', 'edge', {}, function(evt){
      var edge = this;
      var splitedge = edge.id().split('_');
      if (evt.originalEvent.shiftKey) {
        ConnectorSelection.show_shared_connectors( splitedge[0], [splitedge[2]], "presynaptic_to" );
      }
    });
  };

  this.toggleTrimmedNodeLabels = function() {
    if (this.originalNames) {
      trim_node_labels = false;
      // Restore
      var originalNames = this.originalNames;
      cy.nodes().each(function(i, element) {
        if (element.id() in originalNames) {
          element.data('label', originalNames[element.id()]);
        }
      });
      delete this.originalNames;
    } else {
      // Crop at semicolon
      trim_node_labels = true;
      this.originalNames = {};
      var originalNames = this.originalNames;
      cy.nodes().each(function(i, element) {
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

  this.updateFromSelectionTable = function() {
    var skellist = NeuronStagingArea.getSelectedSkeletons();
    if( skellist.length == 0) {
      alert('Please add skeletons to the selection table before updating the graph.')
      return;
    }
    this.update(skellist);
  };

  this.update = function(skellist) {
    requestQueue.replace(django_url + project.id + "/skeletongroup/skeletonlist_confidence_compartment_subgraph",
        "POST",
        { skeleton_list: skellist,
          confidence_threshold: confidence_threshold,
          bandwidth: clustering_bandwidth },
        function (status, text) {
            if (200 !== status) return;
            var json = $.parseJSON(text);
            if (json.error) {
                alert(json.error);
                return;
            }
            self.updateGraph( json );
        },
        "graph_widget_request");
  }

  this.writeGML = function() {
    var ids = {};
    var items = ['Creator "CATMAID"\nVersion 1.0\ngraph ['];

    cy.nodes(function(i, node) {
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

    cy.edges(function(i, edge) {
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

  this.exportGML = function() {
    if (0 === cy.nodes().size()) {
      alert("Load a graph first!");
      return;
    }
    var html = "<html><head><title>Graph as GML</title></head><body><pre><div id='myprintrecipe'>" + CompartmentGraphWidget.writeGML() + "</div></pre></body></html>";
    var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');
    recipe.document.open();
    recipe.document.write(html);
    recipe.document.close();
  };

  this.growGraph = function() {
    this.grow('circlesofhell', 1);
  };

  this.growPaths = function() {
    this.grow('directedpaths', 2);
  };

  this.grow = function(subURL, minimum) {
    // Collect unique IDs
    var ids = {};
    cy.nodes(function(i, node) {
      var id = node.data("id");
      ids[id.substring(0, id.lastIndexOf('_'))] = null;
    });

    var skeleton_ids = Object.keys(ids).map(Number);
    if (skeleton_ids.length < minimum) {
      growlAlert("Information", "Need at least " + minimum + " skeleton IDs!");
      return;
    }

    var n_circles = $('#n_circles_of_hell').val(),
        min_pre = $('#n_circles_min_pre').val(),
        min_post = $('#n_circles_min_post').val();

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
            growlAlert("Information", "No further skeletons found!");
            return;
          }
          self.update(skeleton_ids.concat(json));
        });
  };
};
