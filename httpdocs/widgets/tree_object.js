/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

initObjectTree = function (pid) {

  // id of object tree
  object_tree_id = "#tree_object";

  $("#refresh_object_tree").click(function () {
    $("#tree_object").jstree("refresh", -1);
  });

  $(object_tree_id).jstree({
    "core": {
      "html_titles": false
    },
    "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
    "json_data": {
      "ajax": {
        "url": "model/tree.object.list.php",
        "data": function (n) {
          // depending on which type of node it is, display those
          // the result is fed to the AJAX request `data` option
          return {
            "pid": pid,
            "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
          };
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
        var id_of_node = obj.attr("id");
        var type_of_node = obj.attr("rel");
        var menu = {};
        if (type_of_node === "root") {
          menu = {
            "create_group": {
              "separator_before": false,
              "separator_after": false,
              "label": "Create group",
              "action": function (obj) {
                att = {
                  "state": "open",
                  "data": "group",
                  "attr": {
                    "rel": "group",
                    "relname": "part_of"
                  }
                };
                this.create(obj, "inside", att, null, true);
              }
            },
            "rename_root": {
              "separator_before": true,
              "separator_after": false,
              "label": "Rename root",
              "action": function (obj) {
                this.rename(obj);
              }
            }
          };
        } else if (type_of_node === "group") {
          menu = {
            "create_group": {
              "separator_before": false,
              "separator_after": false,
              "label": "Create group",
              "action": function (obj) {
                att = {
                  "state": "open",
                  "data": "group",
                  "attr": {
                    "rel": "group",
                    "relname": "part_of"
                  }
                };
                this.create(obj, "inside", att, null, true);
              }
            },
            "create_neuron": {
              "separator_before": false,
              "separator_after": false,
              "label": "Create neuron",
              "action": function (obj) {
                att = {
                  "state": "open",
                  "data": "neuron",
                  "attr": {
                    "rel": "neuron",
                    "relname": "part_of"
                  }
                };
                this.create(obj, "inside", att, null, true);
              }
            },
            "rename_group": {
              "separator_before": true,
              "separator_after": false,
              "label": "Rename group",
              "action": function (obj) {
                this.rename(obj);
              }
            },
            "remove_group": {
              "separator_before": false,
              "icon": false,
              "separator_after": false,
              "label": "Remove group",
              "action": function (obj) {
                this.remove(obj);
              }
            }
          };
        } else if (type_of_node === "neuron") {
          menu = {
/*
					"create_skeleton" : {
						"separator_before"	: false,
						"separator_after"	: false,
						"label"				: "Create skeleton",
						"action"			: function (obj) {
							att = { "state": "open",
									"data": "skeleton",
									"attr" : {"rel" : "skeleton", "relname" : "model_of" }
								};
							this.create(obj, "inside", att, null, true);
						}
					},*/
            "rename_neuron": {
              "separator_before": true,
              "separator_after": false,
              "label": "Rename neuron",
              "action": function (obj) {
                this.rename(obj);
              }
            },
            "remove_neuron": {
              "separator_before": false,
              "icon": false,
              "separator_after": false,
              "label": "Remove neuron",
              "action": function (obj) {
                this.remove(obj);
              }
            },
            "ccp": false
          };
        } else if (type_of_node === "presynapticterminal") {
          menu = {
            "goto_connector": {
              "separator_before": false,
              "separator_after": false,
              "label": "Go to connector node",
              "action": function (obj) {

                var terminid = obj.attr("id").replace("node_", "");
                requestQueue.register("model/connector.location.get.php", "POST", {
                  pid: project.id,
                  terminalid: terminid,
                  relationtype: "presynaptic_to"
                }, function (status, text, xml) {

                  if (status === 200) {
                    if (text && text !== " ") {
                      var e = $.parseJSON(text);
                      if (e.error) {
                        alert(e.error);
                      } else {
                        // go to node
                        project.moveTo(e.z, e.y, e.x);

                        // activate the node with a delay
                        window.setTimeout("project.selectNode( " + e.connector_id + " )", 1000);

                      }
                    }
                  }
                });
              }
            }
          };
        } else if (type_of_node === "postsynapticterminal") {
          menu = {
            "goto_connector": {
              "separator_before": false,
              "separator_after": false,
              "label": "Go to connector node",
              "action": function (obj) {

                var terminid = obj.attr("id").replace("node_", "");
                requestQueue.register("model/connector.location.get.php", "POST", {
                  pid: project.id,
                  terminalid: terminid,
                  relationtype: "postsynaptic_to"
                }, function (status, text, xml) {

                  if (status === 200) {
                    if (text && text !== " ") {
                      var e = $.parseJSON(text);
                      if (e.error) {
                        alert(e.error);
                      } else {
                        // go to node
                        project.moveTo(e.z, e.y, e.x);

                        // activate the node with a delay
                        window.setTimeout("project.selectNode( " + e.connector_id + " )", 1000);

                      }
                    }
                  }
                });

              }
            }
          };
        } else if (type_of_node === "skeleton") {
          menu = {
            "goto_parent": {
              "separator_before": false,
              "separator_after": false,
              "label": "Go to root node",
              "action": function (obj) {

                var skelid = obj.attr("id").replace("node_", "");
                requestQueue.register("model/skeleton.root.get.php", "POST", {
                  pid: project.id,
                  skeletonid: skelid
                }, function (status, text, xml) {

                  if (status === 200) {
                    if (text && text !== " ") {
                      var e = $.parseJSON(text);
                      if (e.error) {
                        alert(e.error);
                      } else {
                        // go to node
                        // console.log("returned", e, e.root_id);
                        project.moveTo(e.z, e.y, e.x);

                        // activate the node with a delay
                        window.setTimeout("project.selectNode( " + e.root_id + " )", 1000);

                      }
                    }
                  }
                });

              }
            },
            "show_treenode": {
              "separator_before": false,
              "separator_after": false,
              "label": "Show treenodes in table",
              "action": function (obj) {
                // deselect all (XXX: only skeletons? context?)
                this.deselect_all();
                // select the node
                this.select_node(obj);

                project.showDatatableWidget("treenode");
                // datatables grabs automatically the selected skeleton
                oTable.fnDraw();
              }
            },
            "rename_skeleton": {
              "separator_before": true,
              "separator_after": false,
              "label": "Rename skeleton",
              "action": function (obj) {
                this.rename(obj);
              }
            },
            "remove_skeleton": {
              "separator_before": false,
              "icon": false,
              "separator_after": false,
              "label": "Remove skeleton",
              "action": function (obj) {
                this.remove(obj);
              }
            }
          };
        }
        return menu;
      }

    },
    "crrm": {
      "move": {
        "always_copy": false,
        "check_move": function (m) {

          // valid moves (class - class)
          valid_moves = {
            "group": ["root", "group"],
            // part_of
            "neuron": ["group"],
            // part_of
            "skeleton": ["neuron"] // model_of
          };

          // http://snook.ca/archives/javascript/testing_for_a_v

          function oc(a) {
            var o = {}, i;
            for (i = 0; i < a.length; i++) {
              o[a[i]] = '';
            }
            return o;
          }

          srcrel = m.o.attr("rel"); // the node being moved
          dstrel = m.r.attr("rel"); // the node moved to
          if ( oc(valid_moves[srcrel]).hasOwnProperty(dstrel) ) {
            return true;
          }
          else {
            return false;
          }
        }
      }
    },
    "types": {
      "max_depth": -2,
      "max_children": -2,
      "valid_children": ["group"],
      "types": {
        // the default type
        "default": {
          "valid_children": "none"
          //"select_node"	: false,
          //"open_node"	: true,
          //"close_node"	: true,
          //"create_node"	: true,
          //"delete_node"	: true
        },
        "root": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/root.png"
          },
          "valid_children": ["group"],
          "start_drag": false,
          "select_node": false,
          "delete_node": false,
          "remove": false
        },
        "group": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/group.png"
          },
          "valid_children": ["group", "neuron"],
          "start_drag": true,
          "select_node": false
        },
        "neuron": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/neuron.png"
          },
          // XXX: need to discuss
          // "valid_children" : [ "modelof", "presynaptic", "postsynaptic" ],
          "valid_children": ["skeleton"],
          "start_drag": true,
          "select_node": true
        },
        "skeleton": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/skeleton.png"
          },
          "valid_children": ["synapse"],
          "start_drag": true,
          "select_node": true
        },
        "synapse": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/synapse.png"
          },
          "valid_children": ["none"],
          "start_drag": false,
          "select_node": true
        },
        "modelof": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/modelof.png"
          },
          "select_node": function () {
            return false;
          },
          "valid_children": ["skeleton"],
          "start_drag": false
        },
        "presynapticterminal": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/presynapse.png"
          },
          "select_node": function () {
            return false;
          },
          "valid_children": ["synapse"],
          "start_drag": false
        },
        "postsynapticterminal": {
          "icon": {
            "image": "widgets/themes/kde/jsTree/neuron/postsynapse.png"
          },
          "select_node": function () {
            return false;
          },
          "valid_children": ["synapse"],
          "start_drag": false
        }
      }
    }
  });

  // handlers
  //	"inst" : /* the actual tree instance */,
  //	"args" : /* arguments passed to the function */,
  //	"rslt" : /* any data the function passed to the event */,
  //	"rlbk" : /* an optional rollback object - it is not always present */
  $(object_tree_id).bind("loaded.jstree", function (event, data) {
    // console.log("Object tree loaded.");
  });

  $(object_tree_id).bind("deselect_node.jstree", function (event, data) {
    var key;
    id = data.rslt.obj.attr("id").replace("node_", "");
    type = data.rslt.obj.attr("rel");

    // deselection only works when explicitly done by ctrl
    // we get into a bad state when it gets deselected by selecting another node
    // thus, we only allow one selected node for now
    // remove all previously selected nodes (or push it to the history)
    for (key in project.selectedObjects.tree_object) {
      if(project.selectedObjects.tree_object.hasOwnProperty(key)) {
        delete project.selectedObjects.tree_object[key];
      }
    }

    project.selectedObjects.selectedneuron = null;

    // deselect skeleton
    if (type === "skeleton") {
      project.selectedObjects.selectedskeleton = null;
    }

  });

  $(object_tree_id).bind("select_node.jstree", function (event, data) {
    var key;
    id = data.rslt.obj.attr("id").replace("node_", "");
    type = data.rslt.obj.attr("rel");

    // remove all previously selected nodes (or push it to the history)
    for (key in project.selectedObjects.tree_object) {
      if(project.selectedObjects.tree_object.hasOwnProperty(key)) {
        delete project.selectedObjects.tree_object[key];
      }
    }


    project.selectedObjects.tree_object[id] = {
      'id': id,
      'type': type
    };

    if (type === "neuron") {
      project.selectedObjects.selectedneuron = id;
    } else if (type === "skeleton") {
      project.selectedObjects.selectedskeleton = id;
    }


  });

  $(object_tree_id).bind("create.jstree", function (e, data) {

    mynode = data.rslt.obj;
    data = {
      "operation": "create_node",
      "parentid": data.rslt.parent.attr("id").replace("node_", ""),
      "classname": data.rslt.obj.attr("rel"),
      "relationname": data.rslt.obj.attr("relname"),
      "objname": data.rslt.name,
      "pid": pid
    };

    $.ajax({
      async: false,
      type: 'POST',
      url: "model/instance.operation.php",
      data: data,
      dataType: 'json',
      success: function (data2) {
        // update node id
        mynode.attr("id", "node_" + data2.class_instance_id);
      }
    });

  });

  $(object_tree_id).bind("rename.jstree", function (e, data) {
    $.post("model/instance.operation.php", {
      "operation": "rename_node",
      "id": data.rslt.obj.attr("id").replace("node_", ""),
      "title": data.rslt.new_name,
      "pid": pid
    }, null);
  });

  $(object_tree_id).bind("remove.jstree", function (e, data) {
    treebefore = data.rlbk;
    // check if there are any subelements related to the object tree
    // part_of and model_of relationships
    $.post("model/instance.operation.php", {
      "operation": "has_relations",
      "relationnr": 2,
      "relation0": "part_of",
      "relation1": "model_of",
      "id": data.rslt.obj.attr("id").replace("node_", ""),
      "pid": pid
    }, function (retdata) {
      if (retdata === "True") {
        alert("Object Treenode has child relations. (Re-)move them first before you can delete it.");
        $.jstree.rollback(treebefore);
        return false;
      } else {
        // can remove
        if (confirm('Really remove "' + data.rslt.obj.text() + '" ?')) {
          $.post("model/instance.operation.php", {
            "operation": "remove_node",
            "id": data.rslt.obj.attr("id").replace("node_", ""),
            "title": data.rslt.new_name,
            "pid": pid,
            "rel": data.rslt.obj.attr("rel")
          }, function (retdata) {
            // need to deactive any currently active node
            // in the display. if the active treenode would
            // be element of the deleted skeleton, the
            // active node would become invalid
            activateNode(null);
            project.updateNodes();
          });
          return true;
        } else {
          $.jstree.rollback(treebefore);
          return false;
        }
      }

    });

  });

  $(object_tree_id).bind("move_node.jstree", function (e, data) {

    src = data.rslt.o;
    ref = data.rslt.r;

    // the relationship stays the same (otherwise it would not be
    // a valid move), thus we only have to change the parent
    $.ajax({
      async: false,
      type: 'POST',
      url: "model/instance.operation.php",
      data: {
        "operation": "move_node",
        "src": src.attr("id").replace("node_", ""),
        "ref": ref.attr("id").replace("node_", ""),
        "pid": pid
      },
      success: function (r, status) {
        if (r !== "True") {
          $.jstree.rollback(data.rlbk);
        }
      }
    });
  });

};
