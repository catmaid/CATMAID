var OntologyTree = new function()
{
    this.init = function( pid )
    {
        //OntologyTree.load_tree( pid );
        OntologyTree.load_tree( -1 );
    };

    this.load_tree = function( pid )
    {
        var ontology_tree_id = "#ontology_tree_object";
        var tree = $(ontology_tree_id);

        $("#refresh_ontology_tree").click(function () {
          tree.jstree("refresh", -1);
        });

        tree.bind("reload_nodes.jstree",
           function (event, data) {
             if (OntologyTree.currentExpandRequest) {
               openTreePath($('#ontology_tree_object'), OntologyTree.currentExpandRequest);
             }
           });

        tree.jstree({
          "core": {
            "html_titles": false
          },
          "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
          "json_data": {
            "ajax": {
              "url": django_url + pid + '/ontology/list',
              "data": function (n) {
                var expandRequest, parentName, parameters;
                // depending on which type of node it is, display those
                // the result is fed to the AJAX request `data` option
                parameters = {
                  "pid": pid,
                  "parenttype": n.attr ? n.attr("rel") : "relation",
                  "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
                };
                if (ObjectTree.currentExpandRequest) {
                  parameters['expandtarget'] = ObjectTree.currentExpandRequest.join(',');
                }
                if (n[0]) {
                  parameters['parentname'] = n[0].innerText;
                }
                if (n.attr && n.attr("rel") == "relation") {
                  parameters['classbid'] = n.attr("classbid");
                }
                return parameters;
              },
              "success": function (e) {
                if (e.error) {
                  alert(e.error);
                }
              }
            },
            "progressive_render": true
          },
          "ui": {
            "select_limit": 1,
            "select_multiple_modifier": "ctrl",
            "selected_parent_close": "deselect"
          },

          "themes": {
            "theme": "classic",
            "url": "widgets/themes/kde/jsTree/classic/style.css",
            "dots": false,
            "icons": true
          },
          "contextmenu": {
            "items": function (obj) {
                return {};
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "class": {
                    "icon": {
                        "image": "widgets/themes/kde/jsTree/ontology/class.png"
                    },
                },
                "relation": {
                    "icon": {
                        "image": "widgets/themes/kde/jsTree/ontology/relation.png"
                    },
                }
            }
          }
        });
    };
};
