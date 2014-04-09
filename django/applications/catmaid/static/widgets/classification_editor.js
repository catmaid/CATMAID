var ClassificationEditor = new function()
{
    var self = this;
    var content_div_id = 'classification_editor_widget';
    var display_superclass_names = false;
    var display_previews = true;
    var display_edit_tools = true;
    var workspace_pid;
    var bboxtool = new BoxSelectionTool();
    // Offsets for the image preview when hovering a
    // ROI indication icon.
    var preview_x_offset = 0;
    var preview_y_offset = 30;

    /**
     * Initialization of the window.
     */
    this.init = function( pid )
    {
        // change to pid workspace if pid was passed
        if (pid) {
            self.change_workspace(pid, true);
        }
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
    this.load_classification = function(pid, completionCallback) {
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
                        // execute callback if available
                        if (completionCallback)
                            completionCallback();
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

        $("#display_previews").click(function () {
            if ($("#display_previews").attr('checked')) {
                display_previews = true;
            } else {
                display_previews = false;
            }
        });

        if ($("#display_edit_tools").length === 0) {
            display_edit_tools = false;
        } else {
            $("#display_edit_tools").click(function () {
                if ($("#display_edit_tools").attr('checked')) {
                    display_edit_tools = true;
                } else {
                    display_edit_tools = false;
                }
                tree.jstree("refresh", -1);
            });
        }

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
            // The UI plugin isn't used, because it doesn't let click events go
            // through to the node. This, however, is needed to support ROI links.
            "plugins": ["themes", "json_data", "crrm", "types", "contextmenu"],
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
            "themes": {
              "theme": "classic",
              "url": STATIC_URL_JS + "widgets/themes/kde/jsTree/classic/style.css",
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
                            }

                            // Add entry for linking a region of interest
                            menu['link_roi'] = {
                                "separator_before": true,
                                "separator_after": false,
                                "_class": "wider-context-menu",
                                "label": "Link new region of interest",
                                "action": function (obj) {
                                    var node_id = obj.attr("id").replace("node_", "");
                                    self.link_roi(tree_id, node_id);
                                }
                            };

                            // Add entry and submenu for removing a region of interest
                            var rois = JSON.parse(obj.attr("rois"));
                            var submenu = {}
                            for (i=0; i<rois.length; i++) {
                                var roi = rois[i];
                                submenu['remove_roi_' + roi] = {
                                    "separator_before": false,
                                    "separator_after": false,
                                    "label": "" + (i + 1) + ". Roi (" + roi + ")",
                                    "action": function (r_id) {
                                        return function (obj) {
                                            self.remove_roi(tree_id, r_id);
                                        }
                                    }(roi)
                                };
                            }
                            menu['remove_roi'] = {
                                "separator_before": false,
                                "separator_after": false,
                                "label": "Remove region of interest",
                                "_class": "wider-context-menu",
                                "_disabled": rois.length == 0,
                                "submenu": submenu,
                            };

                            if (node_type === "element") {
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

                        // add "Expand sub-tree" option to each menu
                        menu["expand_subtree"] = {
                            "separator_before": true,
                            "separator_after": false,
                            "label": "Expand sub-tree",
                            "action": function (obj) {
                                tree.jstree('open_all', obj);
                             }
                        };

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
                      "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/ontology/root.png"
                    },
                    "valid_children": "all",
                    "start_drag": false,
                    "delete_node": false,
                    "remove": false
                  },
                  "editnode": {
                    "icon": {
                      "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/ontology/edit.png"
                    },
                    "valid_children": "all",
                  },
                  "element": {
                    "icon": {
                      "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/ontology/class_instance.png"
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

        // react to the opening of a node
        tree.bind("open_node.jstree", function (e, data) {
            // If there are ROI links, adjust behaviour when clicked. Be
            // on the save side and make sure this is the only handler.
            $("img.roiimage", data.rslt.obj).unbind('click').bind('click',
                function() {
                    // Hide preview in mouse-out handler
                    $("#imagepreview").remove();
                    // Display the ROI
                    var roi_id = $(this).attr('roi_id');
                    self.display_roi(roi_id);
                    return false;
                });

            // Add a preview when hovering a roi image
            $("img.roiimage", data.rslt.obj).hover(
                function(e) {
                    if (display_previews) {
                        // Show preview in mouse-in handler
                        var roi_id = $(this).attr('roi_id');
                        var no_cache = "?v=" + (new Date()).getTime();
                        var roi_img_url = django_url + project.id +
                            "/roi/" + roi_id + "/image" + no_cache;
                        $("body").append("<p id='imagepreview'><img src='" +
                            roi_img_url + "' alt='Image preview' /></p>");
                        $("#imagepreview")
                            .css("top", (e.pageY - preview_y_offset) + "px")
                            .css("left", (e.pageX + preview_x_offset) + "px")
                            .fadeIn("fast");
                    }
                },
                function(e) {
                    if (display_previews) {
                        // Hide preview in mouse-out handler
                        $("#imagepreview").remove();
                    }
                });
            $("img.roiimage", data.rslt.obj).mousemove(
                function(e) {
                    if (display_previews) {
                        $("#imagepreview")
                            .css("top", (e.pageY - preview_y_offset) + "px")
                            .css("left", (e.pageX + preview_x_offset) + "px")
                    }
                });
        });

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

            $.blockUI({ message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Removing classification graph node. Just a moment...</h2>' });
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

        // rename the root node
        tree.bind("rename.jstree", function(e, data) {
            var treebefore = data.rlbk;
            var node = data.rslt.obj;
            if (!confirm("Are you sure you want to rename this node?")) {
                $.jstree.rollback(treebefore);
                return false;
            }
            $.blockUI({ message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Renaming classification graph node. Just a moment...</h2>' });
            $.post(self.get_cls_url(project.id, '/instance-operation'), {
                 "operation": "rename_node",
                 "id": node.attr("id").replace("node_", ""),
                 "title": data.rslt.new_name,
                 "pid": pid,
              }, function(r) {
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
                      content: 'Classification graph element renamed.',
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

    /**
     * Links the current view to the currently selected class instance.
     */
    this.link_roi = function(tree_id, node_id) {
        // Open Roi tool and register it with current stack. Bind own method
        // to apply button.
        var tool = new RoiTool();
        tool.button_roi_apply.onclick = function()
        {
            // Collect relevant information
            var cb = tool.getCropBox();
            var data = {
                x_min: cb.left,
                x_max: cb.right,
                y_min: cb.top,
                y_max: cb.bottom,
                z: tool.stack.z * tool.stack.resolution.z + tool.stack.translation.z,
                zoom_level: tool.stack.s,
                rotation_cw: cb.rotation_cw
            }
            // The actual creation and linking of the ROI happens in
            // the back-end. Create URL for initiating this:
            var roi_url = self.get_cls_url(project.id,
                "/stack/" + tool.stack.getId() + "/linkroi/" + node_id + "/");
            // Make Ajax call and handle response in callback
            requestQueue.register(roi_url, 'POST', data,
                self.create_error_aware_callback(
                    function(status, text, xml) {
                        var result = $.parseJSON(text);
                        if (result.status) {
                            self.show_status("Success", result.status);
                        } else {
                            alert("The server returned an unexpected response.");
                        }
                        $(tree_id).jstree("refresh", -1);
                    }));

            // Open the navigator tool as replacement
            project.setTool( new Navigator() );
        };

        // Create a cancel button
        var cancel_button = document.createElement("div");
        cancel_button.setAttribute("class", "box_right");
        var cancel_link = document.createElement("a");
        cancel_link.setAttribute("class", "button");
        cancel_link.onclick = function()
        {
            project.setTool( new Navigator() );
        };
        var cancel_img = document.createElement("img");
        cancel_img.setAttribute("src", STATIC_URL_JS + "widgets/themes/kde/cancel.gif");
        cancel_img.setAttribute("alt", "cancel");
        cancel_img.setAttribute("title", "cancel");
        cancel_link.appendChild(cancel_img);
        cancel_button.appendChild(cancel_link);

        // Add cancel button to toolbar
	    var toolbar = document.getElementById("toolbar_roi");
	    var toolbar_button = document.getElementById("button_roi_apply").parentNode;
        toolbar.insertBefore(cancel_button, toolbar_button.nextSibling);

        // Make sure the cancel button gets removed
        var original_destroy = tool.destroy;
        tool.destroy = function() {
            toolbar.removeChild(cancel_button);
            original_destroy.call(this);
        };

        project.setTool( tool );
    };

    /**
     * Removes the ROI link having the passed ID after asking the
     * user for confirmation.
     */
    this.remove_roi = function(tree_id, roi_id) {
        // Make sure the user knows what (s)he is doing
        if (!confirm("Are you sure you want to remove the region of interest?")) {
            return false;
        }
        // Remove the ROI
        var roi_remove_url = django_url + project.id +
            "/roi/" + roi_id + "/remove";
        // Make Ajax call and handle response in callback
        requestQueue.register(roi_remove_url, 'GET', null,
            self.create_error_aware_callback(
                function(status, text, xml) {
                    var result = $.parseJSON(text);
                    if (result.status) {
                        self.show_status("Success", result.status);
                    } else {
                        alert("The server returned an unexpected response.");
                    }
                    $(tree_id).jstree("refresh", -1);
                }));
    };

    /**
     * Retrieves the properties of the roi with ID <roi_id> and
     * displays it in its linked stack.
     */
    this.display_roi = function(roi_id) {
        // Get properties of the requested ROI
        var roi_info_url = django_url + project.id + "/roi/" + roi_id + "/info";
        requestQueue.register(roi_info_url, 'GET', null,
            self.create_error_aware_callback(
                function(status, text, xml) {
                    if (!project) {
                        console.log("There is currently no project definition available.");
                        return;
                    }
                    // Parse JSON data into object
                    var roi = $.parseJSON(text);
                    var pid_changes = roi.project_id !== project.id;
                    // If the project changes, detach the current
                    // classification editor content and to reinsert it later.
                    var container;
                    if (pid_changes) {
                        container = $('#' + content_div_id).detach();
                    }
                    // Close all open stacks and open only the one belonging
                    // to the ROI. This might also include changing the
                    // current project. The classification editor would need
                    // to be reopened with the same view.
                    var callback = function() {
                        if (project) {
                            // Focus the classification editor when there isn't
                            // a project change, reload it otherwise. Do this
                            // first to let ROI display work on correct view size.
                            WindowMaker.show('classification-editor');
                            // Reinsert the copied content on a project change.
                            if (pid_changes) {
                                container.appendTo( $('#' + content_div_id) );
                            }
                            // move the project to the ROI location
                            project.moveTo( roi.location[2], roi.location[1],
                                roi.location[0], roi.zoom_level );
                            // draw a ROI rectangle
                            var stack = project.getStack(roi.stack_id);
                            var hwidth = roi.width * 0.5;
                            var hheight = roi.height * 0.5;
                            bboxtool.destroy();
                            bboxtool.register(stack);
                            bboxtool.createCropBoxByWorld(
                                roi.location[0] - hwidth,
                                roi.location[1] - hheight,
                                roi.width, roi.height, roi.rotation_cw);
                            // Let the box be above the mouse catcher and
                            // make sure the crop box has no background
                            var cbview = bboxtool.getCropBox().layer.getView();
                            cbview.style.zIndex = "10";
                            cbview.style.background = "none";
                            // Add a closing button to the box
                            var closing_button = document.createElement("p");
                            closing_button.className = "close";
                            closing_button.appendChild(document.createTextNode("X"));
                            cbview.insertBefore(closing_button, cbview.firstChild);
                            // React to a click on that closing button
                            closing_button.onclick = function() {
                                bboxtool.destroy();
                            }
                            // set tool to navigator
                            project.setTool( new Navigator() );
                        }
                    };
                    openProjectStack( roi.project_id, roi.stack_id, callback);
                }));
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
         else if (page_type == 'setup')
         {
            // Override the submit behaviour if the setup form is displayed
            self.overrideSetupSubmit(container, pid);
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

  this.overrideSetupSubmit = function(container, pid) {
    var form = $("#setup-classification-form");
    var found = form.length !== 0;
    if (found) {
        form.submit(function(){
            $.ajax({
                type: "POST",
                url: form.attr('action'),
                data: form.serialize(),
                success: function(data, textStatus) {
                    ClassificationEditor.refresh();
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
            // Check if the container is available and only load
            // the data if it is.
            if ($('#' + content_div_id).length > 0) {
                self.workspace_pid = pid;
                self.refresh();
            }
        }
    };

    this.refresh = function(completionCallback)
    {
        if (project)
            self.load_classification(project.id, completionCallback);
    };

    /**
     * Shows a growl error message in the top right corner.
     */
    this.show_status = function( title, message, delaytime ) {
        if (!delaytime)
            delaytime = 2500;
        $('#growl-alert').growlAlert({
          autoShow: true,
          content: message,
          title: title,
          position: 'top-right',
          delayTime: delaytime,
          onComplete: function() { g.remove(); }
        });
    };
}
