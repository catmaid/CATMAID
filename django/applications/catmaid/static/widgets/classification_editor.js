var ClassificationEditor = new function()
{
    var self = this;
    var content_div_id = 'classification_editor_widget';
    var display_superclass_names = false;
    var display_edit_tools = true;
    var original_pid;
    var workspace_pid;

    /**
     * Initialization of the window.
     */
    this.init = function( pid )
    {
        // save the pid and change workspace
        self.original_pid = pid;
        self.change_workspace(pid, true);
    };

    /**
     * Creates the base URL, needed for all classification requests and
     * appends the passed string to it. The combined result is returned.
     */
    this.get_cls_url = function( pid, sub_url ) {
        return django_url + pid + '/classification/' + self.workspace_pid + sub_url;
    };

    /**
     * Load the classification data.
     */
    this.load_classification = function(pid) {
        requestQueue.register(self.get_cls_url(pid, '/show'),
            'GET', undefined, self.create_error_aware_callback(
                function(status, data, text) {
                    var e = $.parseJSON(data);
                    if (e.error) {
                        alert(e.error);
                    } else {
                        var container = document.getElementById(content_div_id);
                        container.innerHTML = e.content;
                        self.handleContent( e.page, container, pid );
                    }
                }));
    }

    this.load_tree = function(pid, link_id) {
        // id of object tree
        var tree_id = '#classification_graph_object';
        var tree = $(tree_id);

        $("#refresh_classification_graph").click(function () {
            tree.jstree("refresh", -1);
        });

        $("#display_super_classes").click(function () {
            if ($("#display_super_classes").attr('checked')) {
                display_superclass_names = true;
            } else {
                display_superclass_names = false;
            }
            tree.jstree("refresh", -1);
        });

        $("#display_edit_tools").click(function () {
            if ($("#display_edit_tools").attr('checked')) {
                display_edit_tools = true;
            } else {
                display_edit_tools = false;
            }
            tree.jstree("refresh", -1);
        });

        tree.bind("reload_nodes.jstree",
            function (event, data) {
                if (self.currentExpandRequest) {
                    openTreePath($(tree_id), self.currentExpandRequest);
                }
            });

        var url = self.get_cls_url(pid, '/list');
        if (link_id != null) {
            url += "/" + link_id;
        }

        tree.jstree({
            "core": {
              "html_titles": true,
              "load_open": true
            },
            "plugins": ["themes", "json_data", "ui", "crrm", "types", "contextmenu"],
            "json_data": {
              "ajax": {
                "url": url,
                "data": function (n) {
                  var expandRequest, parentName, parameters;
                  // depending on which type of node it is, display those
                  // the result is fed to the AJAX request `data` option
                  parameters = {
                    "pid": pid,
                    "parentid": n.attr ? n.attr("id").replace("node_", "") : 0,
                    "superclassnames": display_superclass_names ? 1 : 0,
                    "edittools": display_edit_tools ? 1 : 0
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
                    if (node_type === "root" || node_type === "element") {
                        var child_groups = JSON.parse(obj.attr("child_groups"));
                        var menu = {};
                        if (display_edit_tools) {
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
                                var only_disabled_items = true;
                                for (i=0; i<child_classes.length; i++) {
                                    var subchild = child_classes[i];
                                    only_disabled_items = (only_disabled_items && subchild.disabled);
                                    submenu['add_child_' + group_name + '_sub_' + i] = {
                                      "separator_before": false,
                                      "separator_after": false,
                                      "_disabled": subchild.disabled,
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
                                  "_disabled": only_disabled_items,
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
                        }
                        return menu;
                    }
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
                  "editnode": {
                    "icon": {
                      "image": "widgets/themes/kde/jsTree/ontology/edit.png"
                    },
                    "valid_children": "all",
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
          var parentid = myparent.attr("id").replace("node_", "");
          var classid = mynode.attr("classid");
          var relid = mynode.attr("relid");
          var name = data.rslt.name;
          self.create_new_instance(tree_id, pid, parentid, classid, relid, name);
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

            $.blockUI({ message: '<h2><img src="widgets/busy.gif" /> Removing classification graph node. Just a moment...</h2>' });
            // Remove classes
            $.post(self.get_cls_url(project.id, '/instance-operation'), {
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
                    $("#annotation_graph_object").jstree("refresh", -1);
                    project.updateTool();
                    $('#growl-alert').growlAlert({
                      autoShow: true,
                      content: 'Classification graph element "' + friendly_name + '" removed.',
                      title: 'SUCCESS',
                      position: 'top-right',
                      delayTime: 2500,
                      onComplete: function() { g.remove(); }
                    });
                };
            });
        });

        // things that need to be done when a node is loaded
        tree.bind("load_node.jstree", function(e, data) {
            // Add handlers to select elements available in edit mode
            self.addEditSelectHandlers(tree_id, pid);
        });
    };

    this.create_new_instance = function(treeid, pid, parentid, classid, relid, name) {
      var data = {
        "operation": "create_node",
        "parentid": parentid,
        "classid": classid,
        "relationid": relid,
        "objname": name,
        "pid": pid
      };

      $.ajax({
        async: false,
        cache: false,
        type: 'POST',
        url: self.get_cls_url(project.id, '/instance-operation'),
        data: data,
        dataType: 'json',
        success: function (data2) {
          // Deselect all selected nodes first to prevent selection
          // confusion with the refreshed tree.
          $(treeid).jstree("deselect_all");
          // update node id
          //mynode.attr("id", "node_" + data2.class_instance_id);
          // reload the node
          //tree.jstree("refresh", myparent);
          //tree.jstree("load_node", myparent, function() {}, function() {});
          // TODO: Refresh only the sub tree, startins from parent
          $(treeid).jstree("refresh", -1);
        }
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

    /* Depending on the type of the page, some rewrites need to
     * to be done. That is to make sure that replies on actions
     * taken on the current page are also rendered in this
     * CATMAID window.
     */
    this.handleContent = function(page_type, container, pid, linkid) {
         if (page_type == 'new_graph')
         {
            // Override the submit behaviour if the create graph is displayed
            self.overrideNewGraphSubmit(container, pid);
            // Override the submit behaviour if link graph form is displayed
            self.overrideLinkGraphSubmit(container, pid);
         }
         else if (page_type == 'show_graph')
         {
            // Override the remove link behaviour
            self.overrideRemoveGraphLink(container, pid);
            // Override the add link behaviour
            self.overrideAddGraphLink(container, pid);
            // Override the autofill link behaviour
            self.overrideAutofillLink(container, pid);
            // Show the graph
            self.load_tree(pid, linkid);
         }
         else if (page_type == 'select_graph')
         {
            // Override the submit behaviour if select graph form is displayed
            self.overrideSelectGraphSubmit(container, pid);
         }
    }

  this.overrideNewGraphSubmit = function(container, pid) {
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
                    setTimeout("ClassificationEditor.refresh()", 1500);
                }
            });
            return false;
        });
    }

    return found;
  };

  this.overrideLinkGraphSubmit = function(container, pid) {
    var form = $("#link-classification-form");
    var found = form.length !== 0;
    if (found) {
        form.submit(function(){
            $.ajax({
                type: "POST",
                url: form.attr('action'),
                data: form.serialize(),
                success: function(data, textStatus) {
                    container.innerHTML = "<p>" + data + "</p><p>Reloading in a few seconds.</p>";
                    setTimeout("ClassificationEditor.refresh()", 1500);
                }
            });
            return false;
        });
    }

    return found;
  };

  this.overrideRemoveGraphLink = function(container, pid) {
    var remove_link = $("#remove_classification_link");
    var found = remove_link.length !== 0;
    if (found) {
         remove_link.click(function(){
             if (confirm("Are you sure you want to remove the whole classification graph?")) {
                 $.ajax({
                     type: "POST",
                     url: remove_link.attr('href'),
                     success: function(data, textStatus) {
                         container.innerHTML = "<p>" + data + "</p><p>Reloading in a few seconds.</p>";
                         setTimeout("ClassificationEditor.refresh()", 3000);
                     }
                 });
             }
             return false;
         });
    }

    return found;
  }

  this.overrideAddGraphLink = function(container, pid) {
    var remove_link = $("#add_classification_link");
    var found = remove_link.length !== 0;
    if (found) {
        remove_link.click(function(){
            $.ajax({
                type: "GET",
                url: remove_link.attr('href'),
                success: function(data, textStatus) {
                   container.innerHTML = data;
                   // Override the submit behaviour if the create graph is displayed
                   self.overrideNewGraphSubmit(container, pid);
                   // Override the submit behaviour if link graph form is displayed
                   self.overrideLinkGraphSubmit(container, pid);
                }
            });
            return false;
        });
    }

    return found;
  }

  this.overrideAutofillLink = function(container, pid) {
    var remove_link = $("#autofill_classification_link");
    var found = remove_link.length !== 0;
    if (found) {
         remove_link.click(function(){
             if (confirm("Are you sure you want to autofill this classification graph?")) {
                 $.ajax({
                     type: "POST",
                     url: remove_link.attr('href'),
                     success: function(data, textStatus) {
                         container.innerHTML = "<p>" + data + "</p><p>Reloading in a few seconds.</p>";
                         setTimeout("ClassificationEditor.refresh()", 3000);
                     }
                 });
             }
             return false;
         });
    }

    return found;
  }

  this.overrideSelectGraphSubmit = function(container, pid) {
    var form = $("#select-classification-form");
    var found = form.length !== 0;
    if (found) {
        form.submit(function(){
            $.ajax({
                type: "POST",
                url: form.attr('action'),
                data: form.serialize(),
                success: function(data, textStatus) {
                    var e = $.parseJSON(data);
                    container.innerHTML = e.content;
                    self.handleContent( e.page, container, pid, e.link );
                }
            });
            return false;
        });
    }

    return found;
  };

    /**
     * Adds an event handler to every edit mode select box. This
     * handler will create a new item. It uses a jQuery UI menu
     * to get user input.
     */
    this.addEditSelectHandlers = function(treeid, pid) {
        var select_elements = $("a.editnode");
        var found = select_elements.length !== 0;
        if (found) {
            $.each(select_elements, function(index, record) {
                if (!this.hasChangeEventHandler) {
                    var menu_class = "div.select_new_classification_instance";
                    var menu_elem  = $(menu_class, this)
                    var menu = menu_elem.menu({
                        menus: menu_class,
                        select: function( ev, ui ) {
                            // let a menu selection create a new class instance
                            var item = ui.item
                            var parentid = menu_elem.attr("parentid");
                            var classid = item.attr("value");
                            var relid = item.attr("relid");
                            var name = "";
                            self.create_new_instance(treeid, pid, parentid, classid, relid, name);
                            return false;
                        }});
                    // hide the menu by default
                    menu.menu('widget').hide()
                    // show it when hovering over the node
                    $(this).hover(function() {
                        menu.menu('widget').fadeIn(100);
                    }, function() {
                        menu.menu('widget').fadeOut(100);
                    });
                    this.hasChangeEventHandler = true;
                }
            });
        }

        return found;
    }

    /**
     * Changes the workspace according to the value of the radio
     * buttons
     */
    this.change_workspace = function(pid, force)
    {
        if (pid != self.workspace_pid || force) {
            self.workspace_pid = pid;
            self.refresh();
        }
    };

    this.refresh = function()
    {
        self.load_classification(project.id);
    };
}
