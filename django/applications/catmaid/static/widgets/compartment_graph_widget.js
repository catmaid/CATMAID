/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var cy;

var CompartmentGraphWidget = new function()
{

  var self = this;

  var confidence_threshold = 0,
      synaptic_count_edge_filter = 0, // value equal or higher than this number or kept
      show_node_labels = true,
      clustering_bandwidth = 0;

  this.toggle_show_node_labels = function() {
    if( show_node_labels ) {
      show_node_labels = false;
      cy.nodes().css('text-opacity', 0);
    } else {
      show_node_labels = true;
      cy.nodes().css('text-opacity', 1);
    }
  }

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
    rand.setAttribute("value", "Show node labels");
    if( show_node_labels )
      rand.setAttribute("checked", "true");
    rand.onclick = self.toggle_show_node_labels;
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

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
                "background-color": "data(color)", //#DDD",
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

  this.updateLayout = function() {


    var layout =  $('#compartment_layout :selected').attr("value");

    if( layout == 1 ) {
      var options = {
        name: 'grid',
        fit: true, // whether to fit the viewport to the graph
        rows: undefined, // force num of rows in the grid
        columns: undefined, // force num of cols in the grid
        ready: undefined, // callback on layoutready
        stop: undefined // callback on layoutstop
        };

      cy.layout( options );
    } else if ( layout == 2) {
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

      cy.layout( options );

    }

    
  }


  this.updateGraph = function( data ) {

    for(var i = 0; i < data.nodes.length; i++) {
      data.nodes[i]['data']['color'] = '#' + NeuronStagingArea.get_color_of_skeleton( parseInt(data.nodes[i]['data'].id) ).getHexString();
    }

    // first remove all nodes
    cy.elements("node").remove();

    cy.add( data );

    // force arbor, does not work
    var options = {
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
      },
      stop: function() {
        console.log('layout stop');
      },
    };

    // grid
    var options = {
      name: 'grid',
      fit: true, // whether to fit the viewport to the graph
      rows: undefined, // force num of rows in the grid
      columns: undefined, // force num of cols in the grid
      ready: undefined, // callback on layoutready
      stop: undefined // callback on layoutstop
      };

    cy.layout( options );

    // cy.nodes().bind("mouseover", function(e) {
    //   // console.log('node mouseover', e);
    // });

    cy.on('click', 'node', {}, function(evt){
      var node = this;
      var splitname = node.id().split('_');
      if (evt.originalEvent.altKey) {
        // Toggle visibility in the 3d viewer
        NeuronStagingArea.select_skeleton( splitname[0] );
      } else if (evt.originalEvent.shiftKey) {
        // Select in the overlay
        TracingTool.goToNearestInNeuronOrSkeleton("skeleton", parseInt(splitname[0]));
      }
    });

    cy.on('click', 'edge', {}, function(evt){
      var edge = this;
      var splitedge = edge.id().split('_');
      if (evt.originalEvent.shiftKey) {
        ConnectorSelection.show_shared_connectors( splitedge[0], splitedge[2] );
      }
    });
  };

  this.updateConfidenceGraphFrom3DViewer = function() {
    var skellist = NeuronStagingArea.get_selected_skeletons();
    if( skellist.length == 0) {
      alert('Please add skeletons to the selection table before updating the graph.')
      return;
    }
    requestQueue.replace(django_url + project.id + "/skeletongroup/skeletonlist_confidence_compartment_subgraph",
        "POST",
        { skeleton_list: NeuronStagingArea.get_selected_skeletons(),
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
};
