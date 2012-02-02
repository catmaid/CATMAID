/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ObjectTree = new function()
{
  this.init = function (pid) {
    // id of object tree
    var object_tree_id = "#tree_object";

    $("#refresh_object_tree").click(function () {
      $("#tree_object").jstree("refresh", -1);
    });

    $("#tree_object").bind("reload_nodes.jstree",
                           function (event, data) {
                             if (ObjectTree.currentExpandRequest) {
                               openTreePath($('#tree_object'), ObjectTree.currentExpandRequest);
                             }
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
            var expandRequest, parentName, parameters;
            // depending on which type of node it is, display those
            // the result is fed to the AJAX request `data` option
            parameters = {
              "pid": pid,
              "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
            };
            if (ObjectTree.currentExpandRequest) {
              parameters['expandtarget'] = ObjectTree.currentExpandRequest.join(',');
            }
            if (n[0]) {
              parameters['parentname'] = n[0].innerText;
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
              },
              "cut": {
                              "separator_before": true,
                              "icon": false,
                              "separator_after": false,
                              "label": "Cut",
                              "action": function (obj) {
                                this.cut(obj);
                              }
              },
              "paste": {
                              "separator_before": false,
                              "icon": false,
                              "separator_after": false,
                              "label": "Paste",
                              "action": function (obj) {
                                this.paste(obj);
                              }
              }
            };
          } else if (type_of_node === "neuron") {
            menu = {
              "select_nearest": {
                "separator_before": false,
                "separator_after": false,
                "label": "Select nearest node",
                "action": function (obj) {
                  var neuronid = obj.attr("id").replace("node_", "");
                  TracingTool.goToNearestInNeuron('neuron', neuronid);
                }
              },
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
              "cut": {
                              "separator_before": true,
                              "icon": false,
                              "separator_after": false,
                              "label": "Cut",
                              "action": function (obj) {
                                this.cut(obj);
                              }
              },
              "paste": {
                              "separator_before": false,
                              "icon": false,
                              "separator_after": false,
                              "label": "Paste",
                              "action": function (obj) {
                                this.paste(obj);
                              }
              },
              "ccp": false
            };
          } else if (type_of_node === "skeleton") {
            menu = {
              "show_webglviewer": {
                "separator_before": false,
                "separator_after": false,
                "label": "3D Viewer",
                "action": function (obj) {
                  console.log()
                  var myparent = $.jstree._focused()._get_parent(obj);

                  WindowMaker.show("3d-webgl-view");
                  var skelid = obj.attr("id").replace("node_", "");
                  addSkeletonTo3DWebGLView( project.id, skelid, this.get_text(obj), this.get_text(myparent) );
                }
              },
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
                          project.moveTo(e.z, e.y, e.x);

                          // activate the node with a delay
                          window.setTimeout("SkeletonAnnotations.staticSelectNode( " + e.root_id + "," + skelid + ")", 1000);

                        }
                      }
                    }
                  });

                }
              },
              "select_nearest": {
                "separator_before": false,
                "separator_after": false,
                "label": "Select nearest node",
                "action": function (obj) {
                  var skelid = obj.attr("id").replace("node_", "");
                  TracingTool.goToNearestInNeuron('skeleton', skelid);
                }
              },
              "show": {
                "label": "Show",
                "submenu": {
                  "show_treenode": {
                    "separator_before": false,
                    "separator_after": false,
                    "label": "Treenode table",
                    "action": function (obj) {
                      // deselect all (XXX: only skeletons? context?)
                      this.deselect_all();
                      // select the node
                      this.select_node(obj);

                      WindowMaker.show("node-table");
                      // datatables grabs automatically the selected skeleton
                      TreenodeTable.oTable.fnDraw();
                    }
                  },
                  "show_connectortable": {
                    "separator_before": false,
                    "separator_after": false,
                    "label": "Connector table",
                    "action": function (obj) {
                      // deselect all (XXX: only skeletons? context?)
                      this.deselect_all();
                      // select the node
                      this.select_node(obj);

                      WindowMaker.show("connector-table");
                      // datatables grabs automatically the selected skeleton
                      ConnectorTable.connectorTable.fnDraw();
                    }
                  }
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
            //"select_node": false,
            "delete_node": false,
            "remove": false
          },
          "group": {
            "icon": {
              "image": "widgets/themes/kde/jsTree/neuron/group.png"
            },
            "valid_children": ["group", "neuron"],
            "start_drag": true,
            //"select_node": false
          },
          "neuron": {
            "icon": {
              "image": "widgets/themes/kde/jsTree/neuron/neuron.png"
            },
            "valid_children": ["skeleton"],
            "start_drag": true,
            "select_node": true
          },
          "skeleton": {
            "icon": {
              "image": "widgets/themes/kde/jsTree/neuron/skeleton.png"
            },
            "valid_children": "none",
            "start_drag": true,
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
            "valid_children": "none",
            "start_drag": false
          },
          "postsynapticterminal": {
            "icon": {
              "image": "widgets/themes/kde/jsTree/neuron/postsynapse.png"
            },
            "select_node": function () {
              return false;
            },
            "valid_children": "none",
            "start_drag": false
          },
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
      var id = data.rslt.obj.attr("id").replace("node_", "");
      var type = data.rslt.obj.attr("rel");

      // deselection only works when explicitly done by ctrl
      // we get into a bad state when it gets deselected by selecting another node
      // thus, we only allow one selected node for now
      // remove all previously selected nodes (or push it to the history)
      for (key in project.selectedObjects.tree_object) {
        if(project.selectedObjects.tree_object.hasOwnProperty(key)) {
          // FIXME: use splice(1,1) instead
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
      // data.inst.toggle_node(data.rslt.obj);
      var key;
      id = data.rslt.obj.attr("id").replace("node_", "");
      type = data.rslt.obj.attr("rel");

      // remove all previously selected nodes (or push it to the history)
      for (key in project.selectedObjects.tree_object) {
        if(project.selectedObjects.tree_object.hasOwnProperty(key)) {
          // FIXME: use splice(1,1) instead
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
      var mynode = data.rslt.obj;
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
      var treebefore = data.rlbk;
      var friendly_name = data.rslt.obj.text().replace(/(^\s+|\s+$)/g, '');
      if (!confirm("Are you sure you want to remove '" + friendly_name + "' and anything it contains?")) {
        $.jstree.rollback(treebefore);
        return false;
      }

          type = data.rslt.obj.attr("rel");

      $.post("model/instance.operation.php", {
            "operation": "has_relations",
            "relationnr": 2,
            "relation0": "part_of",
            "relation1": "model_of",
            "id": data.rslt.obj.attr("id").replace("node_", ""),
            "pid": pid
        }, function (r) {
          r = $.parseJSON(r);
          if(type === "group" && r['has_relation']) {
            alert("Group node has subgroups or neurons. (Re)move them before you can delete it.");
            $.jstree.rollback(treebefore);
            return false;
          } else {
              // When removing a skeleton or neuron, we want to make sure
              // that it is not activated in the stack view, because if it would be
              // and we add a new treenode, it would try to connect it to the
              // not-existing active treenode
              if(type === "skeleton" || type === "neuron") {
                  project.deselectActiveNode();
              }

              // Remove group, neuron, skeleton
              $.post("model/instance.operation.php", {
                    "operation": "remove_node",
                    "id": data.rslt.obj.attr("id").replace("node_", ""),
                    "title": data.rslt.new_name,
                    "pid": pid,
                    "rel": data.rslt.obj.attr("rel")
                  }, function (r) {
                    r = $.parseJSON(r);
                    if(r['status']) {
                        $("#tree_object").jstree("refresh", -1);
                        project.updateTool();
                        $('#growl-alert').growlAlert({
                          autoShow: true,
                          content: 'Object tree element' + data.rslt.obj.text() + ' removed.',
                          title: 'SUCCESS',
                          position: 'top-right',
                          delayTime: 2500,
                          onComplete: function() { g.remove(); }
                        });
                    } else {
                        if(r['error'])
                            alert(r['error']);
                    };
              });
          }

        });

    });

    $(object_tree_id).bind("move_node.jstree", function (e, data) {

      var src = data.rslt.o;
      var ref = data.rslt.r;

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
          r = $.parseJSON(r);
          if(!r['status']) {
            $.jstree.rollback(data.rlbk);
          }
          else {
            $("#tree_object").jstree("refresh", -1);
          }
        }
      });
    });

  };

  /* A function that takes an array of ids starting from the root id
   * and ending in any given node,
   * and walks the array opening each child node as requested.
   */
  var openTreePath = function(treeOb, path) {
    var subNodeSelector;
    if (path.length < 1) {
      ObjectTree.currentExpandRequest = null;
      ObjectTree.afterRefresh = false;
      return;
    }
    subNodeSelector = "#node_" + path[0];
    /* If the node doesn't exist, refresh the whole tree in case it is
       one of the special nodes in "Isolated synaptic terminals" that
       is only fetch on selection of that node.  However, careful not
       to loop in the case that this node can't be found even after
       the refresh: */
    if ($(subNodeSelector).length === 0) {
      if (!ObjectTree.afterRefresh) {
        ObjectTree.afterRefresh = true;
        treeOb.jstree("refresh", -1);
        // The handler for reload_nodes.jstree will then recall
        // openTreePath, so just return in either case.
      }
      return;
    }
    // Invoke the open_node method on the jstree instance of the treeOb DOM element:
    treeOb.jstree("open_node",
                  $(subNodeSelector),
                  function() {
                    openTreePath(treeOb, path.slice(1))
                  },
                  false );
    if (1 == path.length) {
      // Set the skeleton node (the last id) as selected:
      treeOb.jstree("deselect_all");
      treeOb.jstree("select_node", $(subNodeSelector));
    }
  };

  this.requestOpenTreePath = function(treenode) {
    // Check if the node is already highlighted
    if ($('#node_' + treenode.skeleton_id + ' a').hasClass('jstree-clicked')) {
      return;
    }
    // Else, highlight it:
    $.ajax({
      async: true,
      type: 'POST',
      url: "model/tree.object.expand.php",
      data: { "skeleton_id" : treenode.skeleton_id,
              "pid" : project.id },
      success: function (r, status) {
                 r = $.parseJSON(r);
                 if (r['error']) {
                   alert("ERROR: " + r['error']);
                 } else {
                   ObjectTree.currentExpandRequest = r;
                   var treeOb = $('#tree_object');
                   openTreePath(treeOb, r);
                 }
               }
    });
  };

  // Refresh the Object Tree if it is visible.
  this.refresh = function() {
    if ($('#object_tree_widget').css('display') === "block") {
      $("#tree_object").jstree("refresh", -1);
    }
  };

};