/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The OntologyEditor is a widget that shows information about the
   * semantic space, linked to a project. It also allows creation and
   * removal of relations, classes and class-class links.
   */
  var OntologyEditor = function(options) {
    this.workspace_pid = undefined;
    this.trees = [];
    var content_div_id = "ontology_editor_widget";

    this.init = function( pid )
    {
      // clear the trees array
      self.trees = [];
      // display the known root class names
      $.getJSON(CATMAID.makeURL('ontology/knownroots'),
          function(data) {
            var text = "";
            if (data.knownroots)
              text = data.knownroots.join(', ');
            else
              text = "(None)";
            $("span#known_root_names").append(text);
          });

      // change to pid workspace if pid was passed
      if (pid) {
        this.change_workspace(pid, true);
      } else if (CATMAID.userprofile.independent_ontology_workspace_is_default) {
        this.change_workspace(-1, true);
      } else {
        this.change_workspace(project.id, true);
      }
    };

    this.register_tree = function(tree_id)
    {
      this.trees.push(tree_id);
    };

    this.load_ontology_tree = function( pid, tree_id, root_class )
    {
      var tree = $(tree_id);

      this.register_tree( tree_id );

      var self = this;
      tree.bind("reload_nodes.jstree",
         function (event, data) {
         if (self.currentExpandRequest) {
           openTreePath($(tree_id), self.currentExpandRequest);
         }
         });

      tree.jstree({
        "core": {
          "html_titles": false,
          "data": {
            "url": CATMAID.makeURL(pid + '/ontology/list'),
            "data": function (n) {
              // depending on which type of node it is, display those
              // the result is fed to the AJAX request `data` option
              var parameters = {
                "parenttype": n.type ? n.type : "relation",
                "parentid": n.parent !== null ? n.original.oid : 0
              };
              // if a specific root class is requested, add it to the request
              if (root_class) {
                parameters["rootclass"] = root_class;
              }
              if (n.type && n.type === "relation") {
                parameters['classbid'] = n.original.classbid;
              }
              return parameters;
            },
            "success": function (e) {
              if (e.error) {
                CATMAID.handleError(e.error);
              } else if (e.warning) {
                $("#ontology_warnings").html("Warning: " + e.warning);
              } else {
                $("#ontology_warnings").html("");
                // Mark all elements in this result as "no children"
                for (var i=0, l=e.length; i<l; ++i) {
                  var o = e[i];
                  o['children'] = true;
                  // Rename ID field of result, since jsTree expects to be unique,
                  // which we can't guarantee in a graph.
                  if (undefined !== o.id) {
                    o.oid = o.id;
                    delete o.id;
                  }
                }
              }
            }
          }
        },
        "plugins": ["types", "dnd", "contextmenu"],
        "ui": {
          "select_limit": 1,
          "select_multiple_modifier": "ctrl",
          "selected_parent_close": "deselect"
        },
        "contextmenu": {
        "items": function (node, callback) {
          var type_of_node = node.type;
          var menu = {};
          if (type_of_node === "root") {
            menu = {
            "add_class_with_relation": {
              "separator_before": false,
              "separator_after": false,
              "label": "Relate a class to this one",
              "action": function (data) {
                return self.create_link_handler(pid, node.original, tree_id);
               }
            },
            "remove_all_links": {
              "separator_before": true,
              "separator_after": false,
              "label": "Remove all class-class links",
              "action": function (obj) {
                // assure that this was on purpose
                if (confirm("Are you sure you want to remove all ontology class-class links?")) {
                  return self.remove_all_links_handler(pid, tree_id);
                }
               }
            }
            };
          } else if (type_of_node === "class") {
            var restriction_types = JSON.parse(node.original.restrictions);
            // create restrictions submenu
            var add_restriction_submenu = {
              "add_cardinality_restriction": {
                "separator_before": false,
                "separator_after": false,
                "label": "Cardinality",
                "action": function (obj) {
                  return self.create_cardinality_restriction(pid, node.original);
                 }
              },
              "add_exclusivity_restriction": {
                "separator_before": false,
                "separator_after": false,
                "label": "Exclusivity",
                "action": function (obj) {
                  // A exclusivity constraint is a cardinality constraint
                  // that restricts to exactly one value.
                  return self.create_cardinality_restriction(pid, node.original, 1);
                 }
              }
            };

            menu = {
              "add_class_with_relation": {
                "separator_before": false,
                "separator_after": false,
                "label": "Relate a class to this one",
                "action": function (data) {
                  return self.create_link_handler(pid, node.original, tree_id);
                 }
              },
              "add_restriction": {
                "separator_before": true,
                "separator_after": false,
                "_disabled": false,
                "label": "Add restriction",
                "submenu": add_restriction_submenu
              }
            };

            // if there are restrictions present, offer to remove them
            var has_restrictions = false;
            var rem_restriction_submenu = {};

            for (var r_type in restriction_types) {
              has_restrictions = true;
              var restrictions = restriction_types[r_type];
              for (var r=0; r<restrictions.length; r++) {
                var restriction = restrictions[r];
                var r_name = "";
                if (r_type == 'cardinality') {
                  r_name = "Type " + restriction.type + " cardinality with value " + restriction.value;
                } else {
                  r_name = r_type;
                }
                // add ID
                r_name = r_name + " (" + restriction.id + ")";
                rem_restriction_submenu['rem_restriction_' + restriction.id] = {
                  "separator_before": false,
                  "separator_after": false,
                  "label": r_name,
                  "action": function(rid) {
                    return function (data) {
                      return self.remove_restriction(pid, node.original, rid);
                    };}(restriction.id)
                  };
              }
            }

            if (has_restrictions) {
              menu["remove_restriction"] = {
                "separator_before": false,
                "separator_after": false,
                "_disabled": false,
                "label": "Remove restriction",
                "submenu": rem_restriction_submenu
              };
            }

            // add remove parent-link entry
            menu["remove_parent_links"] = {
              "separator_before": true,
              "separator_after": false,
              "label": "Remove parent relation link",
              "action": function (data) {
                // assure that this was on purpose
                if (confirm("Are you sure you want to remove the class-class " +
                      "link between this class and the class connected with " +
                      "the parent relation?")) {
                  return self.remove_link_handler(pid, node.original.ccid, tree_id);
                }
               }
            };
          } else if (type_of_node === "relation") {
            menu = {
            "add_class_with_relation": {
              "separator_before": false,
              "separator_after": false,
              "label": "Relate a class with this relation",
              "action": function (data) {
                return self.create_link_handler(pid, node.original, tree_id);
               }
            },
            "remove_all_links": {
              "separator_before": true,
              "separator_after": false,
              "label": "Remove all links with this relation",
              "action": function (data) {
                // assure that this was on purpose
                if (confirm("Are you sure you want to remove all ontology " +
                      "class-class links that use this relation?")) {
                  return self.remove_selected_links_handler(pid, node.original.oid,
                      node.original.classbid, tree_id);
                }
               }
            }
            };
          }

          // add "Expand sub-tree" option to each menu
          menu["expand_subtree"] = {
            "separator_before": true,
            "separator_after": false,
            "label": "Expand sub-tree",
            "action": function (data) {
              instance.open_all(node);
             }
          };

          callback(menu);
        }
        },
        "types": {
          "root": {
            "icon": CATMAID.makeStaticURL("images/ontology_root.png")
          },
          "class": {
            "icon": CATMAID.makeStaticURL("images/ontology_class.png")
          },
          "relation": {
            "icon": CATMAID.makeStaticURL("images/ontology_relation.png")
          }
        }
      });

      // handlers
      //  "inst" : /* the actual tree instance */,
      //  "args" : /* arguments passed to the function */,
      //  "rslt" : /* any data the function passed to the event */,
      //  "rlbk" : /* an optional rollback object - it is not always present */

      // create a node
      tree.bind("create.jstree", function (e, data) {
        var mynode = data.rslt.obj;
        var myparent = data.rslt.parent;
        // check what type of node has been created
        alert("yes");
        data = {
          "operation": "create_node",
          "parentid": data.rslt.parent.attr("id").replace("node_", ""),
          "template_node_id": data.rslt.obj.attr("template_node_id"),
          "classname": data.rslt.obj.attr("classname"),
          "relationname": data.rslt.obj.attr("relname"),
          "objname": data.rslt.name,
          "pid": pid
        };

      });
    };

    /**
     * Creates a jsTree that displays all available relations for
     * a particular project.
     */
    this.load_ontology_relations_tree = function( pid, tree_id )
    {
      var tree = $(tree_id);

      this.register_tree( tree_id );

      var self = this;
      tree.bind("reload_nodes.jstree",
         function (event, data) {
         if (self.currentExpandRequest) {
           openTreePath($(tree_id), self.currentExpandRequest);
         }
         });

      tree.jstree({
        "core": {
          "html_titles": false,
          "data": {
            "url": CATMAID.makeURL(pid + '/ontology/relations/list'),
            "data": function (node) {
              // depending on which type of node it is, display those
              // the result is fed to the AJAX request `data` option
              return {
                "parentid": "root" === node.type ? 1 : 0
              };
            },
            "success": function (e) {
              if (e.error) {
                alert(e.error);
              } else {
                // Mark all elements in this result as "no children"
                for (var i=0, l=e.length; i<l; ++i) {
                  if (e[i].type == 'root') {
                    e[i]['children'] = true;
                  }
                }
              }
            }
          },
        },
        "plugins": ["types", "dnd", "contextmenu"],
        "ui": {
          "select_limit": 1,
          "select_multiple_modifier": "ctrl",
          "selected_parent_close": "deselect"
        },
        "contextmenu": {
          "items": function (node, callback) {
            var type_of_node = node.type;
            var menu = {};
            if (type_of_node === "root") {
              menu = {
              "add_relation": {
                "separator_before": false,
                "separator_after": false,
                "label": "Add new relation",
                "action": function (data) {
                  return self.create_relation_handler(pid, tree_id);
                 }
              },
              "remove_all_relations": {
                "separator_before": true,
                "separator_after": false,
                "label": "Remove all relations",
                "action": function (data) {
                  // assure that this was on purpose
                  if (confirm("Are you sure you want to remove all ontology relations?")) {
                    return self.remove_all_relations_handler(pid, tree_id);
                  }
                 }
              }
              };
            } else if (type_of_node === "relation") {
              menu = {
              "rename_relation": {
                "separator_before": false,
                "separator_after": false,
                "label": "Rename relation",
                "action": function (data) {
                  var instance = $.jstree.reference(data.reference);
                  var node = instance.get_node(data.reference).original;
                  return self.rename_relation_handler(node.id, node.name,
                      pid, tree_id);
                 }
              },
              "remove_relation": {
                "separator_before": false,
                "separator_after": false,
                "label": "Remove relation",
                "action": function (data) {
                  var instance = $.jstree.reference(data.reference);
                  var node = instance.get_node(data.reference).original;
                  // assure that this was on purpose
                  if (confirm("Are you sure you want to remove this relation?")) {
                    return self.remove_relation_handler(pid, node.id, tree_id);
                  }
                 }
              }
              };
            }

            callback(menu);
          }
        },
        "types": {
          "root": {
            "icon": CATMAID.makeStaticURL("images/ontology_root.png")
          },
          "relation": {
            "icon": CATMAID.makeStaticURL("images/ontology_relation.png")
          }
        }
      });

      // handlers
      //  "inst" : /* the actual tree instance */,
      //  "args" : /* arguments passed to the function */,
      //  "rslt" : /* any data the function passed to the event */,
      //  "rlbk" : /* an optional rollback object - it is not always present */

      // create a node
      tree.bind("create.jstree", function (e, data) {
        var mynode = data.rslt.obj;
        var myparent = data.rslt.parent;
        // check what type of node has been created
        alert("yes");
        data = {
          "operation": "create_node",
          "parentid": data.rslt.parent.attr("id").replace("node_", ""),
          "template_node_id": data.rslt.obj.attr("template_node_id"),
          "classname": data.rslt.obj.attr("classname"),
          "relationname": data.rslt.obj.attr("relname"),
          "objname": data.rslt.name,
          "pid": pid
        };

      });
    };

    /**
     * Creates a jsTree that displays all available classes for
     * a particular project.
     */
    this.load_ontology_classes_tree = function( pid, tree_id )
    {
      var tree = $(tree_id);

      this.register_tree( tree_id );

      var self = this;
      tree.bind("reload_nodes.jstree",
         function (event, data) {
         if (self.currentExpandRequest) {
           openTreePath($(tree_id), self.currentExpandRequest);
         }
         });

      tree.jstree({
        "core": {
          "html_titles": false,
          "data": {
            "url": CATMAID.makeURL(pid + '/ontology/classes/list'),
            "data": function (n) {
              // depending on which type of node it is, display those
              // the result is fed to the AJAX request `data` option
              return {
                "parentid": n.type == "root" ? 1 : 0,
                "roots": 0
              };
            },
            "success": function (e) {
              if (e.error) {
                alert(e.error);
              } else {
                // Mark all elements in this result as "no children"
                for (var i=0, l=e.length; i<l; ++i) {
                  if (e[i].type == 'root') {
                    e[i]['children'] = true;
                  }
                }
              }
            }
          },
        },
        "plugins": ["types", "dnd", "contextmenu"],
        "ui": {
          "select_limit": 1,
          "select_multiple_modifier": "ctrl",
          "selected_parent_close": "deselect"
        },
        "contextmenu": {
          "items": function (node, callback) {
            var type_of_node = node.type;
            var menu = {};
            if (type_of_node === "root") {
              menu = {
              "add_class": {
                "separator_before": false,
                "separator_after": false,
                "label": "Add new class",
                "action": function (node) {
                  return self.create_class_handler(pid, tree_id);
                 }
              },
              "remove_all_classes": {
                "separator_before": true,
                "separator_after": false,
                "label": "Remove all classes",
                "action": function (node) {
                  // assure that this was on purpose
                  if (confirm("Are you sure you want to remove all ontology classes?")) {
                    return self.remove_all_classes_handler(pid, tree_id);
                  }
                 }
              }
              };
            } else if (type_of_node === "class") {
              menu = {
              "rename_class": {
                "separator_before": false,
                "separator_after": false,
                "label": "Rename class",
                "action": function (data) {
                  var instance = $.jstree.reference(data.reference);
                  var node = instance.get_node(data.reference).original;
                  return self.rename_class_handler(node.id, node.name, pid, tree_id);
                 }
              },
              "remove_class": {
                "separator_before": false,
                "separator_after": false,
                "label": "Remove class",
                "action": function (data) {
                  var instance = $.jstree.reference(data.reference);
                  var node = instance.get_node(data.reference).original;
                  // assure that this was on purpose
                  if (confirm("Are you sure you want to remove this class?")) {
                    return self.remove_class_handler(pid, node.id, tree_id);
                  }
                 }
              }
              };
            }

            callback(menu);
          }
        },
        "types": {
          "root": {
            "icon": CATMAID.makeStaticURL("images/ontology_root.png")
          },
          "class": {
            "icon": CATMAID.makeStaticURL("images/ontology_class.png")
          }
        }
      });
    };

    /**
     * Handles the creation of a relation out of the tree's context menu.
     */
    this.create_relation_handler = function (pid, tree_id) {
      var self = this;
      $('#ontology_add_dialog #cancel').off("click").on("click",
      function() {
        // clear input box
        $('#ontology_add_dialog #relname').val("");
        $.unblockUI();
        return false;
      });
      $('#ontology_add_dialog #add').off("click").on("click",
      function() {
        $.unblockUI();
        self.display_wait_message("Creating relation. Just a moment...");
        var relname= $('#ontology_add_dialog #relname').val();
        // add relation with Ajax call
        self.create_new_relation(pid, relname)
          .then(function() {
            self.hide_wait_message();
            self.refresh_tree(tree_id);
            CATMAID.msg("Success", "A new relation has been created.");
            // clear input box
            $('#ontology_add_dialog #relname').val("");
          })
          .catch(CATMAID.handleError);
      });
      // show only relation field
      $('#ontology_add_dialog #input_rel').css("display", "block");
      $('#ontology_add_dialog #input_class').css("display", "none");
      $('#ontology_add_dialog #select_class').css("display", "none");
      $('#ontology_add_dialog #select_rel').css("display", "none");
      $('#ontology_add_dialog #target_rel').css("display", "none");
      $('#ontology_add_dialog #target_object').css("display", "none");
      // show dialog
      $.blockUI({ message: $('#ontology_add_dialog') });
    };

    var general_rename_handler = function(entity_name, current_name, rename_fn) {
      var dialog = document.createElement('div');
      dialog.setAttribute("id", "dialog-rename-entity");
      dialog.setAttribute("title", "Rename " + entity_name);
      var msg = document.createElement('p');
      msg.innerHTML = "Please enter a new name for the currently " +
        "selected " + entity_name + ".";
      dialog.appendChild(msg);
      var form = document.createElement('p');
      dialog.appendChild(form);
      var input = document.createElement('input');
      input.setAttribute("id", "dialog-rename-input");
      input.value = current_name;
      input.setAttribute("type", "text");
      form.appendChild(input);
      var label = document.createElement('label');
      label.setAttribute("for", "dialog-rename-input");
      label.innerHTML = "New " + entity_name + " name:";
      form.insertBefore(label, input);
      var buttons = {
        "Cancel": function() {
          $(this).dialog("close");
        },
        "Rename": function() {
          $(this).dialog("close");
          rename_fn(input.value);
        },
      };
      // The dialog is inserted into the document and shown by the following call:
      $(dialog).dialog({
        height: 200,
        modal: true,
        buttons: buttons,
      });
    };

    /**
     * Handles the renaming of a relation out of the tree's context menu.
     */
    this.rename_relation_handler = function (rel_id, rel_name, pid, tree_id) {
      var self = this;
      general_rename_handler("relation", rel_name,
        function(new_name) {
          self.display_wait_message(
            "Renaming relation. Just a moment...");
          CATMAID.fetch(pid + '/ontology/relations/rename', 'POST',
              {"relid": rel_id, "newname": new_name})
            .then(function() {
              self.refresh_tree(tree_id);
              CATMAID.msg("Success", "The relation has been renamed.");
            })
            .catch(CATMAID.handleError)
            .then(function() {
              self.hide_wait_message();
            });
        });
    };

    /**
     * Handles the renaming of a class out of the tree's context menu.
     */
    this.rename_class_handler = function (class_id, class_name, pid, tree_id) {
      var self = this;
      general_rename_handler("class", class_name,
        function(new_name) {
          self.display_wait_message(
            "Renaming class. Just a moment...");
            CATMAID.fetch(pid + '/ontology/classes/rename', 'POST',
                {"classid": class_id, "newname": new_name,})
              .then(function() {
                self.refresh_tree(tree_id);
                CATMAID.msg("Success", "The class has been removed.");
              })
              .catch(CATMAID.handleError)
              .then(function() {
                self.hide_wait_message();
              });
        });
    };

    /**
     * Handles the removal of a relation.
     */
    this.remove_relation_handler = function(pid, relation_id, tree_id) {
      var self = this;
      self.display_wait_message("Removing relation. Just a moment...");
      CATMAID.fetch(pid + '/ontology/relations/remove', 'POST',
          {"relid": relation_id})
        .then(function() {
          self.refresh_tree(tree_id);
          CATMAID.msg("Success", "The relation has been removed.");
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Handles the removal of all relations in a project.
     */
    this.remove_all_relations_handler = function(pid, tree_id) {
      var self = this;
      self.display_wait_message("Removing all relations. Just a moment...");
      CATMAID.fetch(pid + '/ontology/relations/removeall')
        .then(function(jsonData) {
          var refresh = true;
          // output some status
          var deleted = jsonData['deleted_relations'].length;
          var not_deleted = jsonData['not_deleted_relations'].length;
          if (not_deleted === 0) {
            self.show_error_status( "Success", "All " + deleted + " relations have been removed." );
          } else if (deleted === 0) {
            refresh = false;
            self.show_error_status( "No success", "No relation could be removed due to their use by in some class links." );
          } else {
            var total = deleted + not_deleted;
            var msg = not_deleted + " of " + total + " relations could not be removed due to their use in some class links.";
            self.show_error_status( "Partial success", msg );
          }
          // refresh tree
          if (refresh) {
            self.refresh_tree(tree_id);
          }
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    this.create_new_class = function(pid, classname, silent) {
      // add class with Ajax call
      return CATMAID.fetch(pid + '/ontology/classes/add', 'POST', {
            "classname": classname,
            "silent": silent
          });
    };

    this.create_new_relation = function(pid, relationname, silent) {
      return CATMAID.fetch(pid + '/ontology/relations/add', 'POST',
          {
            "relname": relationname,
            "silent": silent
          });
    };

    /**
     * Handles the creation of a class out of the tree's context menu.
     */
    this.create_class_handler = function (pid, tree_id) {
      var self = this;
      $('#ontology_add_dialog #cancel').off("click").on("click",
      function() {
        // clear input box
        $('#ontology_add_dialog #classname').val("");
        $.unblockUI();
        return false;
      });
      $('#ontology_add_dialog #add').off("click").on("click",
          function() {
            $.unblockUI();
            self.display_wait_message("Adding class. Just a moment...");
            var classname= $('#ontology_add_dialog #classname').val();
            self.create_new_class(pid, classname)
              .then(function() {
                self.hide_wait_message();
                self.refresh_trees();
                CATMAID.msg("Success", "A new class has been created.");
                // clear input box
                $('#ontology_add_dialog #classname').val("");
              })
              .catch(CATMAID.handlError);
          });
      // show only class field
      $('#ontology_add_dialog #input_rel').css("display", "none");
      $('#ontology_add_dialog #input_class').css("display", "block");
      $('#ontology_add_dialog #select_class').css("display", "none");
      $('#ontology_add_dialog #select_rel').css("display", "none");
      $('#ontology_add_dialog #target_rel').css("display", "none");
      $('#ontology_add_dialog #target_object').css("display", "none");
      // show dialog
      $.blockUI({ message: $('#ontology_add_dialog') });
    };

    /**
     * Handles the removal of a class.
     */
    this.remove_class_handler = function (pid, class_id, tree_id) {
      var self = this;
      self.display_wait_message("Removing class. Just a moment...");
      CATMAID.fetch(pid + '/ontology/classes/remove', 'POST',
          {"classid": class_id})
        .then(function() {
          self.refresh_trees();
          CATMAID.msg("Success", "The class has been removed.");
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Handles the removal of all classes.
     */
    this.remove_all_classes_handler = function (pid, class_id, tree_id) {
      var self = this;
      this.display_wait_message("Removing all classes. Just a moment...");
      CATMAID.fetch(pid + '/ontology/classes/removeall', 'POST')
        .then(function(jsonData) {
          var refresh = true;
          // output some status
          var deleted = jsonData['deleted_classes'].length;
          var not_deleted = jsonData['not_deleted_classes'].length;
          if (not_deleted === 0) {
            self.show_error_status( "Success", "All " + deleted + " classes have been removed." );
          } else if (deleted === 0) {
            refresh = false;
            self.show_error_status( "No success", "No class could be removed due to relations to other classes." );
          } else {
            var total = deleted + not_deleted;
            var msg = not_deleted + " of " + total + " classes could not be removed due to relations to other classes.";
            self.show_error_status( "Partial success", msg );
          }
          // refresh tree
          if (refresh) {
            self.refresh_trees();
          }
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Creates a new link, based on a context menu selection in
     * the class-class link tree.
     */
    this.create_link_handler = function (pid, node, tree_id)
    {
      var self = this;
      var is_relation = (node.type == "relation");
      var classbname = is_relation ? node.classbname : node.cname;
      $('#ontology_add_dialog #cancel').off("click").on("click",
      function() {
        $.unblockUI();
        return false;
      });
      $('#ontology_add_dialog #add').off("click").on("click",
      function() {
        $.unblockUI();
        self.display_wait_message("Creating link. Just a moment...");
        // get relation ID and class b ID
        var relid = -1;
        var classbid = -1;
        if (is_relation) {
          classbid = node.classbid;
          relid = node.oid;
        } else {
          // class b is just the parent then
          classbid = node.oid;
          // check if an available relation was selected
          relid = $('#relid').val();
        }
        // get class a ID
        var classaid = $('#classid').val();
        // create class-class relation
        var postdata = {
          'classaid': classaid,
          'classbid': classbid,
          'relid': relid
        };
        CATMAID.fetch(pid + '/ontology/links/add', 'POST', postdata)
          .then(function(jsonData) {
            if (!jsonData['class_class_id']) {
              alert( "Can't understand server response: " + data );
            }
            self.refresh_trees();
          })
          .catch(CATMAID.handleError)
          .then(function() {
            self.hide_wait_message();
          });
      });

      // get currently available classes and fill class select box
      CATMAID.fetch(pid + '/ontology/classes')
        .then(function(classes) {
          // sort classes
          var sorted_classes = [];
          $.each(classes, function (key, value) {
            sorted_classes.push([key, value]);
          });
          sorted_classes.sort(function(a, b) {return a[0].localeCompare(b[0]);});

          // populate class select box
          var class_select = $('#ontology_add_dialog #classid');
          class_select.empty();
          $.each(sorted_classes, function (i) {
            var class_name = sorted_classes[i][0];
            var class_id = sorted_classes[i][1];
            class_select.append($('<option></option>').attr("value", class_id).text(class_name + " (" + class_id + ")"));
          });
          // show class dropdown
          $('#ontology_add_dialog #select_class').css("display", "block");

          // don't allow free text input for new classes and relations
          $('#ontology_add_dialog #input_rel').css("display", "none");
          $('#ontology_add_dialog #input_class').css("display", "none");
          // show only relation dropdown if a class is the origin of this call
          if (is_relation) {
            $('#ontology_add_dialog #select_rel').css("display", "none");
            $('#ontology_add_dialog #target_rel').css("display", "block");
            $('#ontology_add_dialog #target_rel #name').html(node.name);
            // show dialog
            $.blockUI({ message: $('#ontology_add_dialog') });
          } else {
            $('#ontology_add_dialog #target_rel').css("display", "none");
            // request current relations
            CATMAID.fetch(pid + '/ontology/relations')
              .then(function(relations) {
                // populate class select box
                var relation_select = $('#ontology_add_dialog #relid');
                relation_select.empty();
                $.each(relations, function (key, value) {
                  relation_select.append($('<option></option>').attr("value", value).text(key + " (" + value + ")"));
                });
                $('#ontology_add_dialog #select_rel').css("display", "block");
              })
              .catch(CATMAID.handleError);
            // show dialog
            $.blockUI({ message: $('#ontology_add_dialog') });
          }
        })
        .catch(CATMAID.handleError);

      // fill target object
      $('#ontology_add_dialog #target_object').css("display", "block");
      $('#ontology_add_dialog #target_object #name').html(classbname);
    };

    /**
     * Removes a class-class link.
     */
    this.remove_link_handler = function(pid, link_id, tree_id) {
      var self = this;
      this.display_wait_message("Removing class-class link. Just a moment...");
      CATMAID.fetch(pid + '/ontology/links/remove', 'POST', { "ccid": link_id })
        .then(function(jsonData) {
          self.refresh_tree(tree_id);
          // give out some information
          if (jsonData.deleted_link == link_id) {
            self.show_error_status( "Success", "The class-class link has been removed." );
          } else {
            var msg = "Something went wrong: Should have removed link " +
                link_id + ", but server says link " + jsonData.deleted_link +
                " got removed.";
            self.show_error_status( "Problem", msg );
          }
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Removes all class-class links that match a certain class_b and a
     * particular relation.
     */
    this.remove_selected_links_handler = function(pid, rel_id, class_b_id, tree_id) {
      var self = this;
      this.display_wait_message("Removing selected class-class links. Just a moment...");
      CATMAID.fetch(pid + '/ontology/links/removeselected', 'POST',
          {"relid": rel_id, "classbid": class_b_id})
        .then(function(jsonData) {
          self.refresh_tree(tree_id);
          // give out some information
          var num_deleted_links = jsonData.deleted_links.length;
          var msg = num_deleted_links + " class-class link(s) have been removed.";
          self.show_error_status( "Success", msg );
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Removes all class-class links that match of a project.
     */
    this.remove_all_links_handler = function(pid, tree_id) {
      var self = this;
      this.display_wait_message("Removing all class-class links. Just a moment...");
      CATMAID.fetch(pid + '/ontology/links/removeall', 'POST')
        .then(function() {
          self.refresh_tree(tree_id);
          // give out some information
          var num_deleted_links = jsonData.deleted_links.length;
          CATMAID.msg( "Success", num_deleted_links + " class-class link(s) have been removed.");
        })
        .catch(CATMAID.handleError)
        .then(function() {
          self.hide_wait_message();
        });
    };

    /**
     * Simplifies response handling for most instance operations.
     */
    this.handle_operation_response = function(status, data, text, handler) {
      if (status !== 200) {
        this.show_error_msg( status, text );
        return;
      }
      var jsonData = JSON.parse(data);
      if (jsonData.error) {
        this.show_error_status( "Error", jsonData.error, 5000 );
      } else {
        handler( jsonData );
      }
    };

    /**
     * Creates a cardinality restriction
     */
    this.create_cardinality_restriction = function( pid, node, cardinality ) {
      var self = this;
      if (!cardinality) {
        // ask user for cardinality and type
        $('#cardinality_restriction_dialog #cancel').off("click").on("click",
        function() {
          $.unblockUI();
          return false;
        });
        $('#cardinality_restriction_dialog #add').off("click").on("click",
        function() {
          $.unblockUI();
          self.display_wait_message("Creating restriction. Just a moment...");
          // create restriction
          var postdata = {
             "linkid": node.ccid,
             "cardinality": $('#cardinality_val').val(),
             "cardinalitytype": $('#cardinality_type').val(),
             "restriction": "cardinality"
          };
          CATMAID.fetch(pid + '/ontology/restrictions/add', 'POST', postdata)
            .then(function(jsonData) {
              if (!jsonData['new_restriction'])
              {
                alert( "Can't understand server response: " + data );
              } else {
                var r_id = jsonData.new_restriction;
                var msg = "A new restriction with ID " + r_id + " has been created.";
                self.show_error_status( "Success", msg );
              }
              self.refresh_trees();
            })
            .catch(CATMAID.handleError)
            .then(function() {
              self.hide_wait_message();
            });
        });
        // get currently available cardinality restriction types for type select box
        CATMAID.fetch(pid + '/ontology/restrictions/cardinality/types')
          .then(function(json_data) {
            var types = json_data.types;
            // populate type select box
            var type_select = $('#cardinality_restriction_dialog #cardinality_type');
            type_select.empty();
            type_select.append($('<option></option>').attr("value", "-1").text("(None)"));
            $.each(types, function (key, value) {
              type_select.append($('<option></option>').attr("value", key).text(key + " (" + value + ")"));
            });
            // show class selection
            $('#cardinality_restriction_dialog #select_type').css("display", "block");
            $('#cardinality_restriction_dialog #input_value').css("display", "block");
            // show dialog
            $.blockUI({ message: $('#cardinality_restriction_dialog') });
          })
          .catch(CATMAID.handleError);
      } else {
        // add restriction with Ajax call
        CATMAID.fetch(pid + '/ontology/restrictions/add', 'POST', {
             "linkid": node.ccid,
             "cardinality": cardinality,
             "cardinalitytype": 0,
             "restriction": "cardinality"
            })
          .then(function(jsonData) {
            self.refresh_trees();
            // give out some information
            var r_id = jsonData.new_restriction;
            var msg = "A new restriction with ID " + r_id + " has been created.";
            self.show_error_status( "Success", msg );
          })
          .catch(CATMAID.handleError);
      }
    };

    /**
     * Removes a restriction
     */
    this.remove_restriction = function(pid, node, rid) {
      var self = this;
      // add restriction with Ajax call
      CATMAID.fetch(pid + '/ontology/restrictions/remove', 'POST',
          {'restrictionid': rid})
        .then(function(jsonData) {
          self.refresh_trees();
          // give out some information
          var r_id = jsonData.removed_restriction;
          var msg = "The restriction with ID " + r_id + " has been removed.";
          self.show_error_status( "Success", msg );
        })
        .catch(CATMAID.handleError);
    };

    /**
     * Refreshes a tree.
     */
    this.refresh_tree = function(tree_id) {
      $(tree_id).jstree("refresh", -1);
    };

    /**
     * Refresh all trees that are stored in trees
     * array.
     */
    this.refresh_trees = function()
    {
      for (var i=0; i<this.trees.length; i++)
      {
        var tree_id = this.trees[i];
        var tree = $(tree_id);
        tree.jstree("refresh", -1);
      }
    };

    /**
     * Changes the workspace according to the value of the radio
     * buttons
     */
    this.change_workspace = function(pid, force)
    {
      if (pid != this.workspace_pid || force) {
        // Do a quick check that all the containers are available
        // and only load the trees if they are.
        if ($('#' + content_div_id).length > 0) {
          this.workspace_pid = pid;
          this.load_ontology_tree( pid,
            "#ontology_tree_object" );
          this.load_ontology_relations_tree( pid,
            "#ontology_relations_tree" );
          this.load_ontology_classes_tree( pid,
            "#ontology_classes_tree" );
        }
      }
    };

    /**
     * Shows a JavaScript alert box with text about a request
     * status error.
     */
    this.show_error_msg = function( status, text ) {
      alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
    };

    /**
     * Show an error message.
     */
    this.show_error_status = function( title, message, delaytime ) {
        if (!delaytime)
          delaytime = 2500;
        CATMAID.msg(title, message, {style: 'error', duratin: delaytime});
    };

    this.display_wait_message = function( message ) {
      $.blockUI({ message: '<h2><img src="' + STATIC_URL_JS + 'images/busy.gif" />' + message + '</h2>' });
    };

    this.hide_wait_message = function() {
      $.unblockUI();
    };
  };

  OntologyEditor.prototype.getName = function() {
    return "Ontology Editor";
  };

  OntologyEditor.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "ontology_editor_controls",
      contentID: 'ontology_editor_widget',
      createControls: function(controls) {
        var self = this;
        CATMAID.DOM.appendButton(controls, "Refresh",
            "Reload the displayed ontology information", function() {
              self.refresh_trees();
            });
        CATMAID.DOM.appendButton(controls, "Init classification system",
            "Create all needed classes and relations to start creating " +
            "classification ontologies", function() {
              // Create "classification_root" class and "is_a" relation
              Promise.all([
                  self.create_new_class(self.workspace_pid, "classification_root", true),
                  self.create_new_relation(self.workspace_pid, "is_a", true)])
                .then(function(results) {
                  var classJson = results[0];
                  var relJson = results[1];
                  self.refresh_trees();
                  if (classJson.already_present && relJson.already_present) {
                    CATMAID.msg("Success", "Classification system alrady initialized");
                  } else {
                    CATMAID.msg("Success", "Initialized classification system");
                  }
                })
                .catch(CATMAID.handleError);
            });
      },

      /**
       * Create content, which is basically a DataTable instance, getting Data
       * from the back-end.
       */
      createContent: function(container) {
        container.innerHTML =
          '<div id="ontology_known_roots">Known root class names: <span id="known_root_names"></span></div>' +
          '<div id="ontology_warnings"></div>' +
          '<div id="ontology_tree_name"><h4>Ontology</h4>' +
          '<div id="ontology_tree_object"></div></div>' +
          '<div id="ontology_relations_name"><h4>Relations</h4>' +
          '<div id="ontology_relations_tree"></div></div>' +
          '<div id="ontology_classes_name"><h4>Classes</h4>' +
          '<div id="ontology_classes_tree"></div></div>' +
          '<div id="ontology_add_dialog" style="display:none; cursor:default">' +
          '<div id="input_rel"><p>New relation name: <input type="text" id="relname" /></p></div>' +
          '<div id="input_class"><p>New class name: <input type="text" id="classname" /></p></div>' +
          '<div id="select_class"><p>Subject: <select id="classid"></p></select></div>' +
          '<div id="select_rel"></p>Relation: <select id="relid"></select></p></div>' +
          '<div id="target_rel"><p>Relation: <span id="name"></span></p></div>' +
          '<div id="target_object"><p>Object: <span id="name"></span></p></div>' +
          '<p><input type="button" id="cancel" value="Cancel" />' +
          '<input type="button" id="add" value="Add" /></p></div>' +
          '<div id="cardinality_restriction_dialog" style="display:none; cursor:default">' +
          '<p><div id="select_type">Cardinality type: <select id="cardinality_type"></select></div>' +
          '<div id="input_value">Cardinality value: <input type="text" id="cardinality_val" /></div></p>' +
          '<p><input type="button" id="cancel" value="Cancel" />' +
          '<input type="button" id="add" value="Add" /></p></div>';
      },

      init: function() {
        this.init();
      }
    };
  };

  // Export Ontology Editor
  CATMAID.OntologyEditor = OntologyEditor;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Ontology Editor",
    description: "Edit ontology classes and relations",
    key: "ontology-editor",
    creator: OntologyEditor
  });

})(CATMAID);
