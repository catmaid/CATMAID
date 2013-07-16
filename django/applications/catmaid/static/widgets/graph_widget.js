/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var GraphWidget = new function()
{

  var vis;
  var self = this;

  this.init = function()
  {
      // id of Cytoscape Web container div
      var div_id = "cytoscapeweb";

      // initialization options
      var options = {
          // where you have the Cytoscape Web SWF
          swfPath: STATIC_URL_JS + "libs/cytoscapeweb/swf/CytoscapeWeb",
          // where you have the Flash installer SWF
          flashInstallerPath: STATIC_URL_JS + "libs/cytoscapeweb/swf/playerProductInstall"
      };

      // init and draw
      vis = new org.cytoscapeweb.Visualization(div_id, options);
  };

  this.updateGraph = function( data ) {

    for(var k in data.nodes) {
      data.nodes[k]['color'] = WebGLApp.getColorOfSkeleton( parseInt(data.nodes[k].id));
    }

    var visual_style = {
      global: {
        // backgroundColor: "#ABCFD6"
      },
      nodes: {
        shape: "OCTAGON",
        borderWidth: 3,
        borderColor: "#ffffff",
        size: {
          defaultValue: 50,
          continuousMapper: { attrName: "weight", minValue: 25, maxValue: 75 }
        },
        color: {
          passthroughMapper: { attrName: "color" }
        },
        labelHorizontalAnchor: "center"
      },
      edges: {
        width: {
          defaultValue: 1,
          continuousMapper: { attrName: "weight", minValue: 1, maxValue: 50 }
        },
        color: "#0B94B1"
      }
    };

    var network_json = {
      dataSchema: {
        nodes: [ { name: "label", type: "string" },
          { name: "color", type: "string" }
        ],
        edges: [ { name: "label", type: "string" },
          { name: "weight", type: "number" }
        ]
      },
      data: {
        nodes: data.nodes,
        edges: data.edges
      }
    };
    vis.draw({ network: network_json,
      edgeLabelsVisible: true,
      nodeLabelsVisible: true,
      visualStyle: visual_style,
      panZoomControlPosition: 'topRight'

    });

  }

  this.updateGraphFrom3DViewer = function() {

    jQuery.ajax({
      url: django_url + project.id + "/skeletongroup/skeletonlist_subgraph",
      type: "POST",
      dataType: "json",
      data: { skeleton_list: WebGLApp.getListOfSkeletonIDs(true) },
      success: function (data) {
        self.updateGraph( data );
      }
    });
  }

  this.exportGraphML = function() {
    if (vis) {
      console.log( vis.graphml() );
      var d = window.open().document;
      var pre = d.createElement("pre");
      pre.innerHTML = vis.graphml().replace(/>/g,'&gt;').replace(/</g,'&lt;');
      d.body.appendChild(pre);
    } else {
      alert("No graph present!");
    }
  };
};
