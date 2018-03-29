/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var ClassificationEditor = function()
  {
    var self = this;
    this.widgetID = this.registerInstance();

    this.workspace_pid = project.id;
    this.project_id = project.id;

    this.synchronize = true;
    this.displaySuperClasses = false;
    this.displayPreviews = true;
    this.displayEditToos = true;

    var content_div_id = 'classification_editor_widget' + this.widgetID;
    var bboxtool = new CATMAID.BoxSelectionTool();
    // Offsets for the image preview when hovering a
    // ROI indication icon.
    var preview_x_offset = 0;
    var preview_y_offset = 30;

    // The currently selected graph
    var currentRootLink = null;

    // Reference to current jsTree instanec
    var tree = null;

    /**
     * Initialization of the window.
     */
    this.init = function( pid )
    {
      CATMAID.fetch(this.project_id + '/classification/' + this.workspace_pid + '/setup/test')
        .then(function(json) {
          if (!json.all_good) {
            // Let user know about required setup/update
            self.show_setup_message(self.project_id, self.workspace_pid);
            return;
          }
          // change to pid workspace if pid was passed
          if (pid) {
            self.change_workspace(pid, true);
          } else if (CATMAID.userprofile.independent_ontology_workspace_is_default) {
            self.change_workspace(-1, true);
          } else {
            self.change_workspace(project.id, true);
          }
      });
    };

    /**
     * Creates the base URL, needed for all classification requests and
     * appends the passed string to it. The combined result is returned.
     */
    this.get_cls_url = function( pid, sub_url, relative ) {
      if (relative) {
        return pid + '/classification/' + self.workspace_pid + sub_url;
      } else {
        return CATMAID.makeURL(pid + '/classification/' + self.workspace_pid + sub_url);
      }
    };

    /**
     * Get widget container and optionally empty it.
     */
    var getContainer = function(empty) {
      var container = document.getElementById(content_div_id);
      if (!container) {
        throw new CATMAID.Error("Could not find widget container");
      }

      // Empty container
      if (empty) {
        while (container.lastChild) {
          container.removeChild(container.lastChild);
        }
      }

      return container;
    };

    /**
     * Replace current content with a classification setup form.
     */
    this.show_setup_message = function(project_id, workspace_id) {
      var container = getContainer(true);
      var p1 = document.createElement('p');
      p1.appendChild(document.createTextNode("The classification system " +
          "doesn't seem to be set-up to work with this project. It needs " +
          "certain classes and relations which have not been found (or only " +
          "parts of it)."));
      container.appendChild(p1);

      if (!CATMAID.hasPermission(workspace_id, 'can_annotate')) {
        var p2 = document.createElement('p');
        p2.appendChild(document.createTextNode("Unfortunately, you don't " +
            "have the permissions to add the missing bits to the current " +
            "project. Please report this to your administrator."));
        container.appendChild(p2);
      } else {
        var p2 = document.createElement('p');
        p2.appendChild(document.createTextNode("Please press the \"Setup\" " +
            "button below and all needed objects are created. Thereafter, " +
            "the Classification Editor should work with this project."));
        var button = document.createElement('input');
        button.setAttribute('type', 'button');
        button.setAttribute('value', 'Setup');
        button.onclick = function() {
          CATMAID.fetch(project_id + '/classification/' + workspace_id +
              '/setup/rebuild', 'GET')
            .then(function(json) {
              if (json.all_good) {
                CATMAID.msg("Success", "Classification initialized");
                self.refresh();
              } else {
                CATMAID.warn("There was a problem during classification setup");
              }
            })
            .catch(CATMAID.handleError);
        };
        var p3 = document.createElement('p');
        p3.appendChild(button);

        container.appendChild(p2);
        container.appendChild(p3);
      }
    };

    /**
     * Display options to create a new graph.
     */
    this.show_new_graph_form = function(existingRoots) {
      var container = getContainer(true);

      // Don't attemt to find root classes, if user has no permission
      if (!CATMAID.hasPermission(self.workspace_pid, 'can_annotate')) {
        var p = document.createElement('p');
        p.appendChild(document.createTextNode("Unfortunately, you don't " +
            "have permission to create new annotation graphs for the current " +
            "workspace."));
        container.appendChild(p);
        return;
      }

      var prepare = undefined !== existingRoots ?
          Promise.resolve(existingRoots) :
          CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid + '/roots/')
          .then(function(json) {
            return json.root_instances.length;
          })
          .catch(CATMAID.handleError);

      // Request classification root classes
      Promise.all([prepare, CATMAID.fetch(self.workspace_pid + '/ontology/roots/')])
        .then(function(rootInfo) {
          var root_instances = rootInfo[0];
          var json = rootInfo[1];
          var nExistingRoots = root_instances.length;

          if (0 === json.root_classes.length) {
            container.innerHTML = "<p>There are currently no valid " +
                "classification ontologies available.<p>" +
                " <p>Please create at least one classification ontology " +
                "(e.g. with the help of the ontology editor) to start a " +
                "new classification graph. A class is seen as the root node " +
                "of a classification ontology if it is linked to the " +
                "<em>classification_root</em> class with an <em>is_a</em> " +
                "relation.</p>";
          } else {
            var intro = "";
            if (0 === nExistingRoots) {
              intro = "There is currently no classification graph associated " +
                  "with this project. Feel free to create a new one. ";
            }

            var p1 = document.createElement('p');
            p1.appendChild(document.createTextNode(intro + "To create a new " +
                "classification graph, please select an ontology that you " +
                "would like the new graph to be based on and click on " +
                "\"Create\"."));

            var p2 = document.createElement('div');
            p2.style.marginTop = "1em";
            var ontologySelect = document.createElement('select');
            json.root_classes.forEach(function(rc) {
              var option = new Option(rc.name, rc.id);
              this.add(option);
            }, ontologySelect);
            var $ontologySelectLabel = CATMAID.DOM.createLabeledControl("Ontology",
                ontologySelect, "Select the ontology the new graph is based on");
            $(p2).append($ontologySelectLabel);

            var p3 = document.createElement('div');
            var createButton = document.createElement('input');
            createButton.setAttribute('type', 'button');
            createButton.setAttribute('value', 'Create');
            createButton.onclick = function() {
              var ontologyId = ontologySelect.value;
              if (!ontologyId) {
                CATMAID.warn('Please select ontolgy first');
                return;
              }
              CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid + '/new',
                  'POST', {
                    ontology_id: ontologyId
                  })
                .then(function(json) {
                  CATMAID.msg('Success', 'A new classification graph was created');
                  self.refresh();
                })
                .catch(CATMAID.handleError);
            };
            p3.appendChild(createButton);

            container.appendChild(p1);
            container.appendChild(p2);
            container.appendChild(p3);

            // Request other existing classification roots, linked to other
            // projects.
            CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid + '/roots/',
               'GET', {
                  with_classnames: true
                })
              .then(function(json) {
                if (0 === json.root_instances.length) {
                  var p4 = document.createElement('p');
                  p4.style.marginTop = "1em";
                  p4.appendChild(document.createTextNode("If there were existing " +
                      "classification graphs, you could also link to those. " +
                      "However, there aren't any."));
                  container.appendChild(p4);
                } else {
                  var p4 = document.createElement('p');
                  p4.style.marginTop = "1em";
                  p4.appendChild(document.createTextNode("Alternatively, you can " +
                      "link an existing classification graph to this project. If " +
                      "you want to do so, please select the tree below and click " +
                      "\"Link\"."));

                  var p5 = document.createElement('div');
                  p5.style.marginTop = "1em";
                  var classificationSelect = document.createElement('select');
                  var seenRoots = new Set();
                  json.root_instances.forEach(function(rc) {
                    if (seenRoots.has(rc.id)) {
                      return;
                    }
                    seenRoots.add(rc.id);
                    var name = rc.name ? rc.name : rc.classname;
                    name = name + " (" + rc.id + ")";
                    var option = new Option(name, rc.id);
                    this.add(option);
                  }, classificationSelect);
                  var $classificationSelectLabel = CATMAID.DOM.createLabeledControl("Classification",
                      classificationSelect, "Select the classification graph to link this project to");
                  $(p5).append($classificationSelectLabel);

                  var p6 = document.createElement('div');
                  var linkButton = document.createElement('input');
                  linkButton.setAttribute('type', 'button');
                  linkButton.setAttribute('value', 'Link');
                  linkButton.onclick = function() {
                    var rootId = classificationSelect.value;
                    if (!this.value) {
                      CATMAID.warn("Please select a classification root first");
                      return;
                    }
                    CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid + '/link',
                        'POST', {
                          root_id: rootId
                        })
                      .then(function(json) {
                        CATMAID.msg('Success', 'The classification graph was linked');
                        self.show_graph(json.created_link_id);
                      })
                      .catch(CATMAID.handleError);
                  };
                  p6.appendChild(linkButton);

                  container.appendChild(p4);
                  container.appendChild(p5);
                  container.appendChild(p6);
                }
              })
              .catch(CATMAID.handleError);
          }
        });
    };

    /**
     * Show one particular graph.
     */
    this.show_graph = function(graphId) {
      var container = getContainer(true);
      this.currentRootLink = graphId;

      var refresh = document.createElement('input');
      refresh.setAttribute('type', 'button');
      refresh.setAttribute('value', 'Refresh');
      refresh.style.cssFloat = 'left';
      refresh.onclick = function() {
        self.refreshTree();
      };
      container.appendChild(refresh);

      CATMAID.DOM.appendCheckbox(container, "Synchronize", null, this.synchronize,
        function() {
          self.synchronize = this.checked;
        });

      CATMAID.DOM.appendCheckbox(container, "Display types", null, this.displaySuperClasses,
        function() {
          self.displaySuperClasses = this.checked;
          self.refreshTree();
        });

      CATMAID.DOM.appendCheckbox(container, "Previews", null, this.displayPreviews,
        function() {
          self.displayPreviews = this.checked;
          self.refreshTree();
        });

      if (CATMAID.mayEdit()) {
        CATMAID.DOM.appendCheckbox(container, "Edit toos", null, this.displayEditToos,
          function() {
            self.displayEditToos = this.checked;
            self.refreshTree();
          });

        var removeLink = document.createElement('a');
        removeLink.appendChild(document.createTextNode("Remove this graph"));
        removeLink.href = "#";
        removeLink.onclick = function() {
          if (confirm("Are you sure you want to remove the whole classification graph?")) {
            CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid +
                '/' + graphId + '/remove', 'POST')
              .then(function(json) {
                CATMAID.msg('Success', 'The classification graph was removed');
                self.refresh();
              })
              .catch(CATMAID.handleError);
          }
        };
        container.appendChild(removeLink);

        var addLink = document.createElement('a');
        addLink.style.marginLeft = "0.5em";
        addLink.appendChild(document.createTextNode("Add/link new graph"));
        addLink.href = "#";
        addLink.onclick = function() {
          self.show_new_graph_form();
        };
        container.appendChild(addLink);

        var autofill = document.createElement('a');
        autofill.style.marginLeft = "0.5em";
        autofill.appendChild(document.createTextNode("Auto fill this graph"));
        autofill.href = "#";
        autofill.onclick = function() {
          if (confirm("Are you sure you want to autofill this classification graph?")) {
            CATMAID.fetch(self.project_id + '/classification/' + self.workspace_pid +
                '/' + graphId + '/autofill', 'POST')
              .then(function(json) {
                CATMAID.msg('Success', 'The classification graph was auto filled');
                self.refresh();
              })
              .catch(CATMAID.handleError);
          }
        };
        container.appendChild(autofill);
      }

      var spacer = document.createElement('br');
      spacer.style.clear = "both";
      container.appendChild(spacer);

      var content = document.createElement('div');
      content.style.marginTop = "1em";
      content.setAttribute('data-role', 'classification_graph_object');
      container.appendChild(content);

      // Show the graph
      this.load_tree(this.project_id, graphId);
    };

    this.show_graph_selection = function(existingRoots) {
      var container = getContainer(true);

      var prepare = undefined !== existingRoots ?
          Promise.resolve(existingRoots) :
          CATMAID.fetch(self.project_id + '/classification/' +
              self.workspace_pid + '/roots/', 'GET', {
                with_classnames: true
              })
          .then(function(json) {
            return json.root_instances;
          })
          .catch(CATMAID.handleError);
      prepare.then(function(graphs) {
        var p1 = document.createElement('p');
        p1.appendChild(document.createTextNode("There are " + graphs.length +
            " classification graphs associated with this project. Please " +
            "select which one you want to display."));

        var p2 = document.createElement('div');
        p2.style.marginTop = "1em";
        var classificationSelect = document.createElement('select');
        var seenLinks = new Set();
        graphs.forEach(function(rc) {
          if (seenLinks.has(rc.link_id)) {
            return;
          }
          seenLinks.add(rc.link_id);
          var name = rc.name ? rc.name : rc.classname;
          name = name + " (" + rc.link_id + ")";
          var option = new Option(name, rc.link_id);
          this.add(option);
        }, classificationSelect);
        var $classificationSelectLabel = CATMAID.DOM.createLabeledControl("Classification graph",
            classificationSelect, "Select the classification graph to show");
        $(p2).append($classificationSelectLabel);

        var show = document.createElement('input');
        show.setAttribute('type', 'button');
        show.setAttribute('value', 'Show');
        show.onclick = function() {
          var link_id = classificationSelect.value;
          if (!link_id) {
            CATMAID.warn("Please select a classification graph");
            return;
          }
          self.show_graph(link_id);
        };

        container.appendChild(p1);
        container.appendChild(p2);
        container.appendChild(show);
      });
    };

    this.load_tree = function(pid, link_id) {
      // id of object tree
      var container = getContainer(false);
      tree = $('div[data-role=classification_graph_object]', container);

      tree.bind("reload_nodes.jstree",
        function (event, data) {
          if (self.currentExpandRequest) {
            openTreePath(tree, self.currentExpandRequest);
          }
        });

      var url = self.get_cls_url(pid, '/list');
      if (link_id != null) { // jshint ignore:line
        url += "/" + link_id;
      }

      tree.jstree({
        "core": {
          "html_titles": true,
          "load_open": true,
          "check_callback": function(operation, node, node_parent, node_position, more) {
            if ('rename_node' === operation) {
              if (!confirm("Are you sure you want to rename this node?")) {
                return false;
              }
              tree.jstree(true).save_state();
            } else if ('delete_node' === operation) {
              if (!confirm("Are you sure you want to remove '" + node.text.trim() +
                  "' and anything it contains?")) {
                return false;
              }
              tree.jstree(true).save_state();
            } else if ('create_node' === operation) {
              return true;
            }
          },
          "data": {
            "url": url,
            "cache": false,
            "data": function (n) {
              // depending on which type of node it is, display those
              // the result is fed to the AJAX request `data` option
              var parameters = {
                "parentid": n.parent !== null ? n.original.oid : 0,
                "superclassnames": self.displaySuperClasses ? 1 : 0,
                "edittools": self.displayEditToos ? 1 : 0
              };
              if (n[0]) {
                parameters['parentname'] = n[0].innerText;
              }
              return parameters;
              },
              "converters": {
                "text json": function(value) {
                  var data = JSON.parse(value);
                  if (!data.error) {
                    // Mark non-edit nodes elements to potentially have children
                    // and rename their "id" property to "oid".
                    for (var i=0, l=data.length; i<l; ++i) {
                      var d = data[i];
                      if (d.type === 'editnode') {
                        d['text'] = "<span>(Add " + d['child_type'] + ")</span>";
                      } else {
                        d['children'] = true;
                      }
                      // Rename ID field of result, since jsTree expects to be
                      // unique, which we can't guarantee in our graph.
                      if (undefined !== d.id) {
                        d.oid = d.id;
                        delete d.id;
                      }
                    }
                  }
                  return data;
                }
              },
              "success": function (e) {
                if (e.error) {
                  CATMAID.error(e.error, e.detail);
                }
              }
          },
        },
        // The UI plugin isn't used, because it doesn't let click events go
        // through to the node. This, however, is needed to support ROI links.
        "plugins": ["types", "contextmenu", "state"],
        "contextmenu": {
          "items": function(node) {
            var node_id = node.original.oid;
            var node_type = node.type;
            if (node_type === "root" || node_type === "element") {
              var menu = {};
              if (self.displayEditToos) {
                var child_groups = node.original.child_groups;
                // Add entries to create child class instances
                for (var group_name in child_groups) {
                  var menu_id = 'add_child_' + group_name;
                  // Create "add child node" sub menu and put child nodes
                  // with the same name into the same sub menu.
                  var submenu = {};
                  if (menu[menu_id]) {
                    submenu = menu[menu_id]['submenu'];
                  }
                  var child_classes = child_groups[group_name];
                  var only_disabled_items = true;
                  for (var i=0; i<child_classes.length; i++) {
                    var subchild = child_classes[i];
                    only_disabled_items = (only_disabled_items && subchild.disabled);
                    submenu['add_child_' + group_name + '_sub_' + i] = {
                      "separator_before": false,
                      "separator_after": false,
                      "_disabled": subchild.disabled,
                      "label": subchild.name,
                      // the action function has to be created wth. of a closure
                      "action": (function(cname, cid, rname, rid) {
                        return function (data) {
                          var att = {
                            "classid": cid,
                            "classname": cname,
                            "relid": rid,
                            "children:": false,
                            "relname": rname,
                            "name": cname
                            //"rel": type_of_node,
                          };
                          var ref = $.jstree.reference(data.reference);
                          ref.create_node(node, att, "last", null, true);
                        };
                      })(subchild.name, subchild.id, subchild.relname, subchild.relid)
                    };
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
                    "action": function (data) {
                      var ref = $.jstree.reference(data.reference);
                      ref.rename_node(data.node);
                    }
                  };
                }

                // Add entry for linking a region of interest
                menu['link_roi'] = {
                  "separator_before": true,
                  "separator_after": false,
                  "label": "Link new region of interest",
                  "action": function (data) {
                    self.link_roi(node.original.oid);
                  }
                };

                // Add entry and submenu for removing a region of interest
                var rois = JSON.parse(node.original.rois);
                var submenu = {};
                for (var i=0; i<rois.length; i++) {
                  var roi = rois[i];
                  submenu['remove_roi_' + roi] = {
                    "separator_before": false,
                    "separator_after": false,
                    "label": "" + (i + 1) + ". Roi (" + roi + ")",
                    "action": function (r_id) {
                      return function (data) {
                        self.remove_roi(r_id);
                      };
                    }(roi)
                  };
                }
                menu['remove_roi'] = {
                  "separator_before": false,
                  "separator_after": false,
                  "label": "Remove region of interest",
                  "_disabled": rois.length === 0,
                  "submenu": submenu,
                };

                if (node_type === "element") {
                  // Add removing entry
                  menu["remove_element"] = {
                    "separator_before": true,
                    "separator_after": false,
                    "label": "Remove",
                    "action": function (data) {
                      var ref = $.jstree.reference(data.reference),
                          sel = ref.get_selected();
                      if(!sel.length) { return false; }
                      ref.delete_node(sel);
                    }
                  };
                }
              }

              // add "Expand sub-tree" option to each menu
              menu["expand_subtree"] = {
                "separator_before": true,
                "separator_after": false,
                "label": "Expand sub-tree",
                "action": function (data) {
                  var instance = $.jstree.reference(data.reference);
                  var node = instance.get_node(data.reference);
                  instance.open_all(node);
                 }
              };

              return menu;
            }
          },
        },
        "types": {
          "root": {
            "icon": CATMAID.makeStaticURL("images/ontology_root.png"),
          },
          "editnode": {
            "icon": CATMAID.makeStaticURL("images/ontology_edit.png")
          },
          "element": {
            "icon": CATMAID.makeStaticURL("images/ontology_class_instance.png")
          },
          }
      });

      // handlers
      //  "inst" : /* the actual tree instance */,
      //  "args" : /* arguments passed to the function */,
      //  "rslt" : /* any data the function passed to the event */,
      //  "rlbk" : /* an optional rollback object - it is not always present */

      // react to the opening of a node
      tree.on("open_node.jstree", function (e, data) {
        // If there are ROI links, adjust behaviour when clicked. Be
        // on the save side and make sure this is the only handler.
        $("img.roiimage", e.target).off('click').on('click',
          function() {
            // Hide preview in mouse-out handler
            $("#imagepreview").remove();
            // Display the ROI
            var roi_id = $(this).attr('roi_id');
            self.display_roi(roi_id);
            return false;
          });

        // Add a preview when hovering a roi image
        $("img.roiimage", e.target).hover(
          function(e) {
            if (self.displayPreviews) {
              // Show preview in mouse-in handler
              var roi_id = $(this).attr('roi_id');
              var no_cache = "?v=" + (new Date()).getTime();
              var roi_img_url = CATMAID.makeURL(project.id +
                "/roi/" + roi_id + "/image" + no_cache);
              $("body").append("<p id='imagepreview'><img src='" +
                roi_img_url + "' alt='Image preview' /></p>");
              $("#imagepreview")
                .css("top", (e.pageY - preview_y_offset) + "px")
                .css("left", (e.pageX + preview_x_offset) + "px")
                .attr("class", "ui-front")
                .fadeIn("fast");
            }
          },
          function(e) {
            if (self.displayPreviews) {
              // Hide preview in mouse-out handler
              $("#imagepreview").remove();
            }
          });
        $("img.roiimage", e.target).mousemove(
          function(e) {
            if (self.displayPreviews) {
              $("#imagepreview")
                .css("top", (e.pageY - preview_y_offset) + "px")
                .css("left", (e.pageX + preview_x_offset) + "px");
            }
          });
      });

      // create a node
      tree.on("create_node.jstree", function (e, data) {
        var mynode = e.target;
        var myparent = data.instance.get_node(data.node.parent);
        var parentid = myparent.original.oid;
        var classid = data.node.original.classid;
        var relid = data.node.original.relid;
        var name = data.node.original.name;
        self.create_new_instance(pid, parentid, classid, relid, name);
      });

      // remove a node
      tree.on("delete_node.jstree", function (e, data) {
        var mynode = data.instance.get_node(data.node);
        var friendly_name = mynode.text.trim();
        $.blockUI({
          message: '<img src="' + STATIC_URL_JS + 'images/busy.gif" />' +
              '<span>Removing classification graph node. Just a moment...</span>'
        });
        // Remove classes
        CATMAID.fetch(self.get_cls_url(project.id, '/instance-operation', true),
          'POST', {
            "operation": "remove_node",
            "id": mynode.original.oid,
            "linkid": mynode.original.linkid,
            "rel": mynode.original.type
        }).then(function (r) {
          $.unblockUI();
          if(r['status']) {
            data.instance.refresh(-1);
            project.updateTool();
            CATMAID.msg('SUCCESS',
              'Classification graph element "' + friendly_name + '" removed.');
          }
        }).catch(function(r) {
          $.unblockUI();
          data.instance.restore_state();
          CATMAID.handleError(r.error, r.detail);
          });
      });

      // rename a node
      tree.on("rename_node.jstree", function(e, data) {
        var mynode = data.instance.get_node(data.node);
        var friendly_name = mynode.text.trim();
        $.blockUI({
          message: '<img src="' + STATIC_URL_JS + 'images/busy.gif" /' +
            '><span>Renaming classification graph node. Just a moment...</span>'
        });
        CATMAID.fetch(self.get_cls_url(project.id, '/instance-operation', true),
          'POST', {
             "operation": "rename_node",
             "id": mynode.original.oid,
             "title": data.text,
          }).then(function(r) {
            $.unblockUI();
            if(r['status']) {
              data.instance.refresh(-1);
              project.updateTool();
              CATMAID.msg('SUCCESS', 'Classification graph element renamed.');
            }
          }).catch(function(r) {
            $.unblockUI();
            CATMAID.error(r);
            data.instance.restore_state();
          });
      });

      tree.on("hover_node.jstree", function(e, data) {
        var node = data.node.original;
        var parentNode = data.instance.get_node( data.node.parent);
        if ("editnode" === node.type) {
          var menu = document.createElement('div');
          menu.classList.add('select_new_classification_instance');
          for (var i=0, l=node.child_options.length; i<l; ++i) {
            var c = node.child_options[i];
            var entry = document.createElement('div');
            entry.dataset.value = c.class_id;
            entry.dataset.relationId = c.relation_id;
            var a = document.createElement('a');
            a.href = '#';
            a.appendChild(document.createTextNode(c.name));
            entry.appendChild(a);
            menu.appendChild(entry);
          }
          // Make menu invisible by default
          menu.style.display = "none";
          node.editMenu = menu;

          // Find SPAN element as part of the node's list element
          // and add menu to it.
          var li = $("#" + data.node.id, data.instance.element);
          var span = $('span', li);

          span.append(menu);
          var jqMenu = $(menu).menu({
            menus: 'div.select_new_classification_instance', // Needed?
            select: function( ev, data ) {
              // let a menu selection create a new class instance
              var item = data.item;
              var parentid = '#' === parentNode.original.oid ?
                  undefined : parentNode.original.oid;
              var classid = item.data("value");
              var relid = item.data("relationId");
              var name = "";
              self.create_new_instance(pid, parentid, classid, relid, name);
              return false;
            }
          });

          $(node.editMenu).menu('widget').fadeIn(100);
        }
      });

      tree.on("dehover_node.jstree", function(e, data) {
        var node = data.node.original;
        if ("editnode" === node.type) {
          // Remove any visible edit menu
          if (node.editMenu) {
              $(node.editMenu).menu('widget').fadeOut(100);
              node.editMenu.parentNode.removeChild(node.editMenu);
              node.editMenu = null;
          }
        }
      });
    };

    /**
     * Links the current view to the currently selected class instance.
     */
    this.link_roi = function(node_id) {
      // Open Roi tool and register it with current stack. Bind own method
      // to apply button.
      var tool = new CATMAID.RoiTool();
      tool.button_roi_apply.onclick = function() {
        // Collect relevant information
        var cb = tool.getCropBox();
        var data = {
          x_min: cb.left,
          x_max: cb.right,
          y_min: cb.top,
          y_max: cb.bottom,
          z: tool.stackViewer.z * tool.stackViewer.primaryStack.resolution.z + tool.stackViewer.primaryStack.translation.z,
          zoom_level: tool.stackViewer.s,
          rotation_cw: cb.rotation_cw
        };
        // The actual creation and linking of the ROI happens in
        // the back-end. Create URL for initiating this:
        var roi_url = self.get_cls_url(project.id,
          "/stack/" + tool.stackViewer.primaryStack.id + "/linkroi/" + node_id + "/", true);
        CATMAID.fetch(roi_url, 'POST', data)
          .then(function(json) {
            CATMAID.msg("Success", "ROI linked");
          })
          .catch(CATMAID.handleError)
          .then(function() {
            tree.jstree("refresh", -1);
          });
      };

      // Open the navigator tool as replacement
      project.setTool( new CATMAID.Navigator() );

      // Create a cancel button
      var cancel_button = document.createElement("div");
      cancel_button.setAttribute("class", "box_right");
      var cancel_link = document.createElement("a");
      cancel_link.setAttribute("class", "button");
      cancel_link.onclick = function()
      {
        project.setTool( new CATMAID.Navigator() );
      };
      var cancel_img = document.createElement("img");
      cancel_img.setAttribute("src", STATIC_URL_JS + "images/cancel.gif");
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
    this.remove_roi = function(roi_id) {
      // Make sure the user knows what (s)he is doing
      if (!confirm("Are you sure you want to remove the region of interest?")) {
        return false;
      }
      // Remove the ROI
      CATMAID.fetch(project.id + "/roi/" + roi_id + "/remove")
        .then(function(result) {
          self.show_status("Success", result.status);
        })
        .catch(CATMAID.handleError)
        .then(function() {
          tree.jstree("refresh", -1);
        });
    };

    /**
     * Retrieves the properties of the roi with ID <roi_id> and
     * displays it in its linked stack.
     */
    this.display_roi = function(roi_id) {
      // Get properties of the requested ROI
      CATMAID.fetch(project.id + "/roi/" + roi_id + "/info")
        .then(function(roi) {
          if (!project) {
            console.log("There is currently no project definition available.");
            return;
          }
          var pid_changes = roi.project_id !== project.id;
          // If the project changes, detach the current
          // classification editor content and to reinsert it later.
          var container;
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
              var stackviewers = project.getStackViewers();
              var stackviewer = null;
              for (var i=0; i<stackviewers.length; ++i) {
                var sv = stackviewers[i];
                if (sv.primaryStack.id == roi.stack_id) {
                    stackviewer = sv;
                    break;
                }
              }
              if (!stackviewer) {
                CATMAID.warn("Couldn't find stack for ROI");
                return;
              }
              var hwidth = roi.width * 0.5;
              var hheight = roi.height * 0.5;
              bboxtool.destroy();
              bboxtool.register(stackviewer);
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
              };
              // set tool to navigator
              project.setTool( new CATMAID.Navigator() );
            }
          };
          if (pid_changes) {
            container = $('#' + content_div_id).detach();
            CATMAID.openProjectStack(roi.project_id, roi.stack_id)
              .then(callback)
              .catch(CATMAID.handleError);
          } else {
            callback();
          }
        });
    };

    this.create_new_instance = function(pid, parentid, classid, relid, name) {
      var data = {
        "operation": "create_node",
        "parentid": parentid,
        "classid": classid,
        "relationid": relid,
        "objname": name,
        "pid": pid
      };

      CATMAID.fetch(self.get_cls_url(project.id, '/instance-operation', true), 'POST',
          data).then(function(r) {
            // Deselect all selected nodes first to prevent selection
            // confusion with the refreshed tree.
            tree.jstree("deselect_all");
            // TODO: Refresh only the sub tree, startins from parent
            tree.jstree("refresh", -1);
          }).catch(CATMAID.handleError);
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
      };
    };

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

    this.refreshTree = function() {
      if (tree) {
        tree.jstree("refresh", -1);
      }
    };

    /**
     * Refresh user interface based on current state. If a particular
     * classification graph is selected, this graph is updated. Otherwise, if no
     * graph is available, the user is provided an option to create a new one.
     * If a single graph is available, this graph is shown and if multiple
     * graphs are available options to select a graph are provided.
     */
    this.refresh = function(completionCallback)
    {
      if (!project) {
        return;
      }

      if (currentRootLink) {
        self.show_graph(currentRootLink);
      } else {
        // Get all root classes
        CATMAID.fetch(self.project_id + '/classification/' +
            self.workspace_pid + '/roots/', 'GET', {
              with_classnames: true
            })
          .then(function(json) {
            var nRoots = json.root_instances.length;
            if (0 === nRoots) {
              // Show "New Graph" view
              self.show_new_graph_form(json.root_instances);
            } else if (1 === nRoots) {
              // Show the one available graph
              self.show_graph(json.root_instances[0].link_id);
            } else {
              // Show option to select a graph
              self.show_graph_selection(json.root_instances);
            }
          })
          .catch(CATMAID.handleError);
      }
    };

    /**
     * Shows status information.
     */
    this.show_status = function( title, message, delaytime ) {
      if (!delaytime)
        delaytime = 2500;
      CATMAID.msg(title, message, {duration: delaytime});
    };
  };


  $.extend(ClassificationEditor.prototype, new InstanceRegistry());

  ClassificationEditor.prototype.getName = function() {
    return "Classification Editor " + this.widgetID;
  };

  ClassificationEditor.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "classification_editor_controls" + this.widgetID,
      contentID: "classification_editor_widget" + this.widgetID,
      createControls: function() {},
      createContent: function(content) {},
      init: function() {
        this.init(project.id);
      }
    };
  };

  ClassificationEditor.prototype.destroy = function() {
    this.unregisterInstance();
  };

  // Export classification editor into CATMAID namespace
  CATMAID.ClassificationEditor = ClassificationEditor;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Classification Editor",
    description: "View and edit semantic classifications",
    key: "classification-editor",
    creator: ClassificationEditor
  });

})(CATMAID);
