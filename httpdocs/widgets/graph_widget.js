/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var GraphWidget = new function()
{

  var vis;

  this.init = function()
  {
      // id of Cytoscape Web container div
      var div_id = "cytoscapeweb";

      // you could also use other formats (e.g. GraphML) or grab the network data via AJAX
      var networ_json = {
          data: {

              nodes: [ { id: "1" }, { id: "2" } ],
              edges: [ { id: "2to1", target: "1", source: "2"} ]
          }
      };

      // initialization options
      var options = {
          // where you have the Cytoscape Web SWF
          swfPath: "libs/cytoscapeweb/swf/CytoscapeWeb",
          // where you have the Flash installer SWF
          flashInstallerPath: "libs/cytoscapeweb/swf/playerProductInstall"
      };

      // init and draw
      vis = new org.cytoscapeweb.Visualization(div_id, options);
      // vis.draw({ network: networ_json });
  };

  this.updateGraphFrom3DViewer = function() {
    var data = WebGLApp.getListOfAllSkeletonIDs();
    var nodes = [], edges = [];
    for( var skeleton_id in data['nodes'])
    {
      if( data['nodes'].hasOwnProperty(skeleton_id) ) {
        nodes.push({
          id: skeleton_id,
          label: data['nodes'][skeleton_id].baseName,
          color: data['nodes'][skeleton_id].color
        })
      }
    }
    for( var fromkey in data['edges'])
    {
      if( data['edges'].hasOwnProperty(fromkey) ) {
        for( var tokey in data['edges'][fromkey]) {
          edges.push({
            id: fromkey+'_'+tokey,
            source: fromkey.toString(),
            target: tokey.toString(),
            weight: data['edges'][fromkey][tokey].weight,
            label: data['edges'][fromkey][tokey].weight.toString(),
            directed: true
          })
        }
      }
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

      var networ_json = {
          dataSchema: {
              nodes: [ { name: "label", type: "string" },
                       { name: "color", type: "string" },
                  ],
              edges: [ { name: "label", type: "string" },
                       { name: "weight", type: "number" }
              ]
          },
          data: {
              nodes: nodes,
              edges: edges
          }
      };
      vis.draw({ network: networ_json,
        edgeLabelsVisible: true,
        nodeLabelsVisible: true,
        visualStyle: visual_style,
        panZoomControlPosition: 'topRight'
        
      });
    
  }

};