/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ObjectTree = new function()
{

  this.deselectAll = function() {
    $('#tree_object').jstree("deselect_all");
    project.setSelectObject( null, null );
  }

  this.renameCurrentActiveNode = function() {
    $('#tree_object').jstree("rename");
  }

  var goToNearestNodeFn = function(type) {
    return function(obj) {
      TracingTool.goToNearestInNeuronOrSkeleton(type, obj.attr("id").replace("node_", ""));
    };
  };

  var sendToFragmentsFn = function(type) {
    return function(obj) {
      var title = document.getElementById(obj.attr("id")).childNodes[1].innerText;
      if (!confirm('Send ' + type + ' "' + title + '" to Fragments?')) {
        return;
      }
      requestQueue.register(django_url + project.id + '/object-tree/' + obj.attr("id").replace("node_", "") + '/' + type + '/send-to-fragments-group', 'POST', {}, function (status, text) {
        if (200 !== status) return;
        var json = $.parseJSON(text);
        if (json.error) {
          alert(json.error);
          return;
        }
        ObjectTree.refresh();
        growlAlert('Moved to Fragments', 'Successfully moved ' + type + ' "' + title + '" to Fragments');
      });
    };
  };

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
          "url": django_url + pid + '/object-tree/list',
          "type": 'POST',
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
        "url": STATIC_URL_JS + "widgets/themes/kde/jsTree/classic/style.css",
        "dots": false,
        "icons": true
      },
      "contextmenu": {
        "items": function (obj) {
          var id_of_node = obj.attr("id");
          var type_of_node = obj.attr("rel");
          var menu = {};
          var show_all_skeletons = {
                "separator_before": false,
                "separator_after": true,
                "label": "Show all skeletons",
                "action": function (obj) {
                  // Fetch skeletons with more than 1 node:
                  requestQueue.register(django_url + project.id + '/object-tree/' + obj.attr("id").replace("node_", "") + '/' + obj.attr("rel") + '/1/get-skeletons', "POST", {},
                      function(status, text, xml) {
                        if (200 === status) {
                          var json = $.parseJSON(text);
                          if (json.error) {
                            alert(json.error);
                          } else {
                            WindowMaker.show("3d-webgl-view");
                            json.forEach(function(skid) {
                              NeuronStagingArea.add_skeleton_to_stage_without_name( skid );
                            });
                          }
                        }
                      });
                }
              },
              all_skeletons_to_selection = {
                "separator_before": false,
                "separator_after": true,
                "label": "Add all to selection",
                "action": function (obj) {
                  // Fetch skeletons with more than 1 node:
                  requestQueue.register(django_url + project.id + '/object-tree/' + obj.attr("id").replace("node_", "") + '/' + obj.attr("rel") + '/1/get-skeletons', "POST", {},
                      function(status, text, xml) {
                        if (200 === status) {
                          var json = $.parseJSON(text);
                          if (json.error) {
                            alert(json.error);
                          } else {
                            json.forEach(function(skid) {
                              NeuronStagingArea.add_skeleton_to_stage_without_name( skid );
                            });
                          }
                        }
                      });
                }
              }
          if (type_of_node === "root") {
            menu = {
              "show_all_skeletons": show_all_skeletons,
              "create_group": {
                "separator_before": false,
                "separator_after": false,
                "label": "Create group",
                "action": function (obj) {
                  var att = {
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
              "show_all_skeletons": show_all_skeletons,
              "all_skeletons_to_selection": all_skeletons_to_selection,
              "create_group": {
                "separator_before": false,
                "separator_after": false,
                "label": "Create group",
                "action": function (obj) {
                  var att = {
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
                  var att = {
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
              "remove_empty_neurons": {
                "separator_before": true,
                "icon": false,
                "separator_after": false,
                "label": "Remove empty neurons",
                "action": function (obj) {
                  requestQueue.register(django_url + project.id + '/object-tree/group/' + obj.attr('id').replace("node_", "") + '/remove-empty-neurons', 'POST', {}, function(status, text) {
                    if (200 !== status) return;
                    var json = $.parseJSON(text);
                    if (json.error) {
                      alert(json.error);
                      return;
                    }
                    if (json.message) {
                      growlAlert('Deleting empty neurons', json.message);
                    } else {
                      alert('An error occurred while attempting to delete empty neurons');
                    }
                    ObjectTree.refresh();
                  });
                }
              },
              "sendToFragments": {
                "separator_before": false,
                "icon": false,
                "separator_after": false,
                "label": "Send to fragments",
                "action": sendToFragmentsFn(type_of_node)
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
              "show_all_skeletons": show_all_skeletons,
              "all_skeletons_to_selection": all_skeletons_to_selection,
              "select_nearest": {
                "separator_before": false,
                "separator_after": false,
                "label": "Select nearest node",
                "action": goToNearestNodeFn(type_of_node)
              },
/*              "show_in_catalog": {
                    "separator_before": true,
                    "separator_after": false,
                    "label": "Show in Neuron Catalog",
                    "action": function (obj) {
                        window.open( django_url + pid + '/view/' + obj.attr("id").replace("node_", "") );
                    }
                },

            "create_skeleton" : {
              "separator_before"	: false,
              "separator_after"	: false,
              "label"				: "Create skeleton",
              "action"			: function (obj) {
                var att = { "state": "open",
                    "data": "skeleton",
                    "attr" : {"rel" : "skeleton", "relname" : "model_of" }
                  };
                this.create(obj, "inside", att, null, true);
              }
            },*/

              "create_assembly": {
                  "separator_before": true,
                  "separator_after": true,
                  "label": "Create assembly",
                  "action": function (obj) {
                      att = {
                          "state": "open",
                          "data": "assembly",
                          "attr": {
                              "rel": "assembly",
                              "relname": "part_of"
                          }
                      };
                      this.create(obj, "inside", att, null, true);
                  }
                },

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
              "give": {
                "separator_before": true,
                "icon": false,
                "separator_after": false,
                "label": "Give neuron to user...",
                "action": function(obj) {
                  // 1. Fetch names of all possible users
                  requestQueue.register(django_url + '/accounts/' + project.id + '/all-usernames', "POST", {}, function(status, text) {
                    // 2. Offer to choose one
                    if (200 !== status) return;
                    var json = $.parseJSON(text);
                    if (json.error) {
                      alert(json.error);
                      return;
                    }
                    var dialog = document.createElement('div');
                    dialog.setAttribute("id", "dialog-confirm");
                    dialog.setAttribute("title", "Choose a user");

                    var msg = document.createElement('p');
                    msg.innerHTML = "Choose a user to give the neuron to:";
                    dialog.appendChild(msg);

                    var choice = document.createElement('select');
                    choice.setAttribute("id", "object-tree-user-choice");
                    var i = 0;
                    var option = null;
                    for (i=0; i<json.length; ++i) {
                      option = document.createElement('option');
                      option.text = json[i][1]; // the username
                      option.value = json[i][0]; // the id
                      choice.add(option);
                    }
                    dialog.appendChild(choice);

                    // The dialog is inserted into the document and shown by the following call:
                    $(dialog).dialog({
                      height: 140,
                      modal: true,
                      buttons: {
                        "Cancel": function() {
                          $(this).dialog("close");
                        },
                        "OK": function() {
                          $(this).dialog("close");
                          var target_user_id = choice.value;
                          var target_username = choice.options[choice.selectedIndex].text;
                          var neuron_id = id_of_node.replace("node_", "");
                          if (!confirm('Do you really want to give neuron "' + obj.context.innerText.replace(/^\s\s*/, '') + '" with ID #' + neuron_id + ' to user ' + target_username + ' with ID #' + target_user_id + "?")) {
                            return;
                          }
                          // 3. Move the neuron to the staging area of the chosen user
                          //    and change the user_id of the neuron, the skeleton,
                          //    and the class_instance_class_instance relations
                          //    to that of the user.
                          requestQueue.register(django_url + project.id + '/neuron/' + neuron_id + '/give-to-user', "POST", {target_user_id: target_user_id}, function(status, text) {
                            if (200 !== status) return;
                            var json = $.parseJSON(text);
                            if (json.error) {
                              alert(json.error);
                              return;
                            }
                            ObjectTree.refresh();
                          });
                        }
                      }
                    });
                  });
                }
              },
              "sendToFragments": {
                "separator_before": true,
                "icon": false,
                "separator_after": false,
                "label": "Send to fragments",
                "action": sendToFragmentsFn(type_of_node)
              },
              "ccp": false
            };
          } else if (type_of_node === "assembly") {
            menu = {
              "rename_assembly": {
                "separator_before": true,
                "separator_after": false,
                "label": "Rename assembly",
                "action": function (obj) {
                  this.rename(obj);
                }
              },
              "remove_assembly": {
                "separator_before": false,
                "icon": false,
                "separator_after": false,
                "label": "Remove assembly",
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

          } else if (type_of_node === "skeleton") {
            menu = {
              "show_webglviewer": {
                "separator_before": false,
                "separator_after": false,
                "label": "Show in 3D",
                "action": function (obj) {
                  // var myparent = $.jstree._focused()._get_parent(obj);
                  WindowMaker.show("3d-webgl-view");
                  var skelid = obj.attr("id").replace("node_", "");
                  NeuronStagingArea.add_skeleton_to_stage_without_name( skelid );
                }
              },
              "goto_parent": {
                "separator_before": false,
                "separator_after": false,
                "label": "Go to root node",
                "action": function (obj) {

                  var skelid = obj.attr("id").replace("node_", "");
                  requestQueue.register(django_url + project.id + '/skeleton/' + skelid + '/get-root', "POST", {
                    pid: project.id
                  }, function (status, text, xml) {
                    var nodeID, skeletonID;
                    if (status === 200) {
                      if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                          alert(e.error);
                        } else {
                          nodeID = e.root_id;
                          skeletonID = parseInt(skelid);
                          // go to node
                          SkeletonAnnotations.staticMoveTo(e.z, e.y, e.x,
                            function () {
                              SkeletonAnnotations.staticSelectNode(nodeID, skeletonID);
                            });
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
                "action": goToNearestNodeFn(type_of_node)
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
                      var skelid = obj.attr("id").replace("node_", "");
                      TreenodeTable.setSkeleton( skelid );
                      TreenodeTable.refresh();
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
                      var skelid = obj.attr("id").replace("node_", "");
                      ConnectorTable.setSkeleton( skelid );
                      ConnectorTable.refreshConnectorTable();
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
              },
              "sendToFragments": {
                "separator_before": true,
                "icon": false,
                "separator_after": false,
                "label": "Send to fragments",
                "action": sendToFragmentsFn(type_of_node)
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
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/root.png"
            },
            "valid_children": ["group"],
            "start_drag": false,
            //"select_node": false,
            "delete_node": false,
            "remove": false
          },
          "group": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/group.png"
            },
            "valid_children": ["group", "neuron"],
            "start_drag": true,
            //"select_node": false
          },
          "neuron": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/neuron.png"
            },
            "valid_children": ["skeleton", "assembly"],
            "start_drag": true,
            "select_node": true
          },
          "skeleton": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/skeleton.png"
            },
            "valid_children": "none",
            "start_drag": true,
            "select_node": true
          },
          "assembly": {
                "icon": {
                    "image": "widgets/themes/kde/jsTree/neuron/skeleton.png"
                },
                "valid_children": "none",
                "start_drag": true,
                "select_node": true
          },
          "modelof": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/modelof.png"
            },
            "select_node": function () {
              return false;
            },
            "valid_children": ["skeleton"],
            "start_drag": false
          },
          "presynapticterminal": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/presynapse.png"
            },
            "select_node": function () {
              return false;
            },
            "valid_children": "none",
            "start_drag": false
          },
          "postsynapticterminal": {
            "icon": {
              "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/neuron/postsynapse.png"
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

    $(object_tree_id).bind("select_node.jstree", function (event, data) {
      id = parseInt( data.rslt.obj.attr("id").replace("node_", "") );
      type = data.rslt.obj.attr("rel");
      project.setSelectObject( type, id );
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
        cache: false,
        type: 'POST',
        url: django_url + project.id + '/object-tree/instance-operation',
        data: data,
        dataType: 'json',
        success: function (data2) {
          // update node id
          mynode.attr("id", "node_" + data2.class_instance_id);
        }
      });

    });

    $(object_tree_id).bind("rename.jstree", function (e, data) {
      $.post(django_url + project.id + '/object-tree/instance-operation', {
        "operation": "rename_node",
        "id": data.rslt.obj.attr("id").replace("node_", ""),
        "title": data.rslt.new_name,
        "classname": data.rslt.obj.attr("rel"),
        "pid": pid
      }, function (r) {
          r = $.parseJSON(r);
          if(r['error']) {
            alert(r['error']);
            $.jstree.rollback(data.rlbk);
          }
      });
    });

    $(object_tree_id).bind("remove.jstree", function (e, data) {
      var treebefore = data.rlbk;
      var friendly_name = data.rslt.obj.context.text; // data.rslt.obj.text().replace(/(^\s+|\s+$)/g, '');
      if (!confirm("Are you sure you want to remove '" + friendly_name + "' and anything it contains?")) {
        $.jstree.rollback(treebefore);
        return false;
      }

      type = data.rslt.obj.attr("rel");

      $.post(django_url + project.id + '/object-tree/instance-operation', {
            "operation": "has_relations",
            "relationnr": 2,
            "relation0": "part_of",
            "relation1": "model_of",
            "id": data.rslt.obj.attr("id").replace("node_", ""),
            "pid": pid
        }, function (r) {
          r = $.parseJSON(r);
          if (r.error) {
            alert(r.error);
            $.jstree.rollback(treebefore);
            return;
          }
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

              $.blockUI({ message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Removing object tree node. Just a moment...</h2>' });
              // Remove group, neuron, skeleton
              $.post(django_url + project.id + '/object-tree/instance-operation', {
                    "operation": "remove_node",
                    "id": data.rslt.obj.attr("id").replace("node_", ""),
                    "title": data.rslt.new_name,
                    "pid": pid,
                    "rel": data.rslt.obj.attr("rel")
                  }, function (r) {
                    $.unblockUI();
                    r = $.parseJSON(r);
                    if (r['error']) {
                      alert(r['error']);
                      $.jstree.rollback(treebefore);
                      return;
                    }
                    if(r['status']) {
                        $("#tree_object").jstree("refresh", -1);
                        project.updateTool();
                        $('#growl-alert').growlAlert({
                          autoShow: true,
                          content: 'Object tree element' + data.rslt.obj.context.text + ' removed.',
                          title: 'SUCCESS',
                          position: 'top-right',
                          delayTime: 2500,
                          onComplete: function() { g.remove(); }
                        });
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
        cache: false,
        type: 'POST',
        url: django_url + project.id + '/object-tree/instance-operation',
        data: {
          "operation": "move_node",
          "src": src.attr("id").replace("node_", ""),
          "ref": ref.attr("id").replace("node_", ""),
          "classname": src.attr("rel"),
          "targetname": ref.context.text,
          "pid": pid
        },
        success: function (r, status) {
          r = $.parseJSON(r);
          if(r.error) {
            $.jstree.rollback(data.rlbk);
            alert("ERROR: " + r['error']);
          }
          else {
            $("#tree_object").jstree("refresh", -1);
          }
        }
      });
    });

    // Open tree path to the selected skeleton if any
    if (SkeletonAnnotations.getActiveSkeletonId()) {
      // TODO: I cannot find where in init is the request made for listing the root node;
      // TODO  for it is after that request that the requestOpenTreePath call must be made.
      setTimeout("ObjectTree.requestOpenTreePath(SkeletonAnnotations.getActiveSkeletonId())", 3000);
    }
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

  this.requestOpenTreePath = function(class_instance_id) {
    // Check if the node is already highlighted
    if ($('#node_' + class_instance_id + ' a').hasClass('jstree-clicked')) {
      return;
    }

    // Else, highlight it:
    $.ajax({
      async: true,
      cache: false,
      type: 'POST',
      //url: "model/tree.object.expand.php",
      url: django_url + project.id + '/object-tree/expand',
      data: { "class_instance_id" : class_instance_id,
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
