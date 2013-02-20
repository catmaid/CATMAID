var ClassificationEditor = new function()
{
    var self = this;

    /**
     * Initialization of the window.
     */
    this.init = function( pid )
    {
        var content_div_id = 'classification_editor_widget';
        // Check if the classification system is set up correctly
        requestQueue.register(django_url + pid + '/classification/show',
            'GET', undefined, self.create_error_aware_callback(
                function(status, data, text) {
                    var e = $.parseJSON(data);
                    var container = document.getElementById(content_div_id);
                    container.innerHTML = e.content;

                    /* depending on the type of the page, some rewrites need to
                     * to be done. That is to make sure that replies on actions
                     * taken on the current page are also rendered in this
                     * CATMAID window.
                     */
                     if (e.page == 'new_graph')
                     {
                        // Override the submit behaviour if the create graph is displayed
                        self.overrideNewTreeSubmit(container, pid);
                     }
                     else if (e.page == 'show_graph')
                     {
                        // Override the remove link behaviour
                        self.overrideRemoveTreeLink(container, pid);
                        // Override the add link behaviour
                        self.overrideAddTreeLink(container, pid);
                        // Show the tree
                        self.load_tree(pid);
                     }
                     else if (e.page == 'select_graph')
                     {

                     }
                }));
    };

    this.load_tree = function(pid, link_id) {
        // id of object tree
        var tree_id = '#classification_graph_object';
        var tree = $(tree_id);

        $("#refresh_classification_graph").click(function () {
            tree.jstree("refresh", -1);
        });

        tree.bind("reload_nodes.jstree",
            function (event, data) {
                if (self.currentExpandRequest) {
                    openTreePath($(tree_id), self.currentExpandRequest);
                }
            });

        var url = django_url + pid + '/classification/list';
        if (link_id != null) {
            url += "/" + link_id;
        }

        tree.jstree({
            "core": {
              "html_titles": false,
              "load_open": true
            },
            "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
            "json_data": {
              "ajax": {
                "url": url,
                "data": function (n) {
                  var expandRequest, parentName, parameters;
                  // depending on which type of node it is, display those
                  // the result is fed to the AJAX request `data` option
                  parameters = {
                    "pid": pid,
                    "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
                  };
                  if (self.currentExpandRequest) {
                    parameters['expandtarget'] = self.currentExpandRequest.join(',');
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
              "cache": false,
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
                "items": function(obj) {
                    var node_id = obj.attr("id");
                    var node_type = obj.attr("rel");
                    var child_groups = JSON.parse(obj.attr("child_groups"));
                    var menu = {};
                    // Add entries to create child class instances
                    for (group_name in child_groups) {
                        var menu_id = 'add_child_' + group_name;
                        // Create "add child node" sub menu and put child nodes
                        // with the same name into the same sub menu.
                        var submenu = {}
                        if (menu[menu_id]) {
                            submenu = menu[menu_id]['submenu'];
                        }
                        var child_classes = child_groups[group_name];
                        for (i=0; i<child_classes.length; i++) {
                            var subchild = child_classes[i];
                            var disabled = false;
                            submenu['add_child_' + group_name + '_sub_' + i] = {
                              "separator_before": false,
                              "separator_after": false,
                              "_disabled": disabled,
                              "label": subchild.name,
                              // the action function has to be created wth. of a closure
                              "action": (function(cname, cid, rname, rid) {
                                  return function (obj) {
                                    att = {
                                      "state": "open",
                                      "data": cname,
                                      "attr": {
                                          "classid": cid,
                                          "classname": cname,
                                          "relid": rid,
                                          "relname": rname
                                          //"rel": type_of_node,
                                      }
                                    };
                                    this.create(obj, "inside", att, null, true);
                                  }})(subchild.name, subchild.id, subchild.relname, subchild.relid)
                            }
                        }
                        // add complete contextmenu
                        menu[menu_id] = {
                          "separator_before": false,
                          "separator_after": false,
                          "label": 'Add ' + group_name,
                          "submenu": submenu,
                        };
                    }
                    // Add custom renames
                    if (node_type === "root") {
                        // Add root renaming entry
                        menu["rename_root"] = {
                            "separator_before": true,
                            "separator_after": false,
                            "label": "Rename root",
                            "action": function (obj) {
                              this.rename(obj);
                            }
                          };
                    } else if (node_type === "element") {
                        // Add removing entry
                        menu["remove_element"] = {
                            "separator_before": true,
                            "separator_after": false,
                            "label": "Remove",
                            "action": function (obj) {
                                this.remove(obj);
                            }
                        };
                    }
                    return menu;
                },
            },
            "types": {
                // disable max root nodes checking
                "max_children": -2,
                // disable max depth checking
                "max_depth": -2,
                // allow all childres
                "valid_children": "all",
                "types": {
                  // the default type
                  "default": {
                    "valid_children": "all",
                  },
                  "root": {
                    "icon": {
                      "image": "widgets/themes/kde/jsTree/ontology/root.png"
                    },
                    "valid_children": "all",
                    "start_drag": false,
                    "delete_node": false,
                    "remove": false
                  },
                  "element": {
                    "icon": {
                      "image": "widgets/themes/kde/jsTree/ontology/class_instance.png"
                    },
                    "valid_children": "all",
                  },
                }
            }
        });

        // handlers
        //	"inst" : /* the actual tree instance */,
        //	"args" : /* arguments passed to the function */,
        //	"rslt" : /* any data the function passed to the event */,
        //	"rlbk" : /* an optional rollback object - it is not always present */

        // create a node
        tree.bind("create.jstree", function (e, data) {
          var mynode = data.rslt.obj;
          var myparent = data.rslt.parent;
          data = {
            "operation": "create_node",
            "parentid": myparent.attr("id").replace("node_", ""),
            "classid": mynode.attr("classid"),
            "relationid": mynode.attr("relid"),
            "objname": data.rslt.name,
            "pid": pid
          };

          $.ajax({
            async: false,
            cache: false,
            type: 'POST',
            url: django_url + project.id + '/classification/instance-operation',
            data: data,
            dataType: 'json',
            success: function (data2) {
              // update node id
              mynode.attr("id", "node_" + data2.class_instance_id);
              // reload the node
              //tree.jstree("refresh", myparent);
              //tree.jstree("load_node", myparent, function() {}, function() {});
              // TODO: Refresh only the sub tree, startins from parent
              tree.jstree("refresh", -1);
            }
          });
        });

        // remove a node
        tree.bind("remove.jstree", function (e, data) {
            var treebefore = data.rlbk;
            var mynode = data.rslt.obj;
            var friendly_name = mynode.text().trim();
            if (!confirm("Are you sure you want to remove '" + friendly_name + "' and anything it contains?")) {
                $.jstree.rollback(treebefore);
                return false;
            }

            $.blockUI({ message: '<h2><img src="widgets/busy.gif" /> Removing classification tree node. Just a moment...</h2>' });
            // Remove classes
            $.post(django_url + project.id + '/classification/instance-operation', {
                "operation": "remove_node",
                "id": mynode.attr("id").replace("node_", ""),
                "linkid": mynode.attr("linkid"),
                "title": data.rslt.new_name,
                "pid": pid,
                "rel": mynode.attr("rel")
              }, function (r) {
                $.unblockUI();
                r = $.parseJSON(r);
                if (r['error']) {
                  alert(r['error']);
                  $.jstree.rollback(treebefore);
                  return;
                }
                if(r['status']) {
                    $("#annotation_tree_object").jstree("refresh", -1);
                    project.updateTool();
                    $('#growl-alert').growlAlert({
                      autoShow: true,
                      content: 'Classification tree element "' + friendly_name + '" removed.',
                      title: 'SUCCESS',
                      position: 'top-right',
                      delayTime: 2500,
                      onComplete: function() { g.remove(); }
                    });
                };
            });
        });
    };

    this.create_error_aware_callback = function( fx )
    {
        return function(status, data, text)
        {
            if (status !== 200) {
                alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
            } else {
                fx(status, data, text);
            }
        }
    };

  this.overrideNewTreeSubmit = function(container, pid) {
    var form = $("#add-new-classification-form");
    var found = form.length !== 0;
    if (found) {
        form.submit(function(){
            $.ajax({
                type: "POST",
                url: form.attr('action'),
                data: form.serialize(),
                success: function(data, textStatus) {
                    container.innerHTML = "<p>" + data + "</p><p>Reloading in a few seconds.</p>";
                    setTimeout("ClassificationEditor.init(" + pid + ")", 1500);
                }
            });
            return false;
        });
    }

    return found;
  };

  this.overrideRemoveTreeLink = function(container, pid) {
    var remove_link = $("#remove_classification_link");
    var found = remove_link.length !== 0;
    if (found) {
         remove_link.click(function(){
             if (confirm("Are you sure you want to remove the whole classification tree?")) {
                 $.ajax({
                     type: "POST",
                     url: remove_link.attr('href'),
                     success: function(data, textStatus) {
                         container.innerHTML = "<p>" + data + "</p><p>Reloading in a few seconds.</p>";
                         setTimeout("ClassificationEditor.init(" + pid + ")", 3000);
                     }
                 });
             }
             return false;
         });
    }

    return found;
  }

  this.overrideAddTreeLink = function(container, pid) {
    var remove_link = $("#add_classification_link");
    var found = remove_link.length !== 0;
    if (found) {
         remove_link.click(function(){
             $.ajax({
                 type: "POST",
                 url: remove_link.attr('href'),
                 success: function(data, textStatus) {
                     container.innerHTML = data;
                 }
             });
             return false;
         });
    }

    return found;
  }
}
