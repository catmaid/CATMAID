/**
 * The OntologyEditor is a widget that shows information about the
 * semantic space, linked to a project. It also allows creation and
 * removal of relations, classes and class-class links.
 */
var OntologyEditor = new function()
{
    this.workspace_pid;
    this.trees = new Array();
    var content_div_id = "ontology_editor_widget";

    this.init = function( pid )
    {
        // clear the trees array
        self.trees = new Array();
        // display the known root class names
        $.getJSON(django_url + 'ontology/knownroots',
                function(data) {
                    var text = "";
                    if (data.knownroots)
                        text = data.knownroots.join(', ');
                    else
                        text = "(None)";
                    $("span#known_root_names").append(text);
                });

        // Assign a function to the refresh button
        $("#refresh_ontology_editor").click(function() {
            OntologyEditor.refresh_trees();
        });

        // change to pid workspace if pid was passed
        if (pid) {
            OntologyEditor.change_workspace(pid, true);
        }
    };

    this.register_tree = function(tree_id)
    {
        OntologyEditor.trees.push(tree_id);
    };

    this.load_ontology_tree = function( pid, tree_id, root_class )
    {
        var tree = $(tree_id);

        OntologyEditor.register_tree( tree_id );

        tree.bind("reload_nodes.jstree",
           function (event, data) {
             if (OntologyEditor.currentExpandRequest) {
               openTreePath($(tree_id), OntologyEditor.currentExpandRequest);
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
                // if a specific root class is requested, add it to the request
                if (root_class) {
                  parameters["rootclass"] = root_class;
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
                if (e.warning) {
                    $("#ontology_warnings").html("Warning: " + e.warning);
                } else {
                    $("#ontology_warnings").html("");
                }
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
            "url": STATIC_URL_JS + "libs/jsTree/classic/style.css",
            "dots": true,
            "icons": true
          },
          "contextmenu": {
            "items": function (obj) {
                var id_of_node = obj.attr("id");
                var type_of_node = obj.attr("rel");
                var menu = {};
                if (type_of_node === "root") {
                    menu = {
                    "add_class_with_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Relate a class to this one",
                        "_class": "wider-context-menu",
                        "action": function (obj) {
                            return OntologyEditor.create_link_handler(this, pid, obj, tree_id);
                         }
                    },
                    "remove_all_links": {
                        "separator_before": true,
                        "separator_after": false,
                        "label": "Remove all class-class links",
                        "_class": "wider-context-menu",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove all ontology class-class links?")) {
                                return OntologyEditor.remove_all_links_handler(pid, tree_id);
                            }
                         }
                    }
                    };
                } else if (type_of_node === "class") {
                    var restriction_types = JSON.parse(obj.attr("restrictions"));
                    // create restrictions submenu
                    add_restriction_submenu = {
                        "add_cardinality_restriction": {
                            "separator_before": false,
                            "separator_after": false,
                            "label": "Cardinality",
                            "action": function (obj) {
                                return OntologyEditor.create_cardinality_restriction(pid, obj);
                             }
                        },
                        "add_exclusivity_restriction": {
                            "separator_before": false,
                            "separator_after": false,
                            "label": "Exclusivity",
                            "action": function (obj) {
                                // A exclusivity constraint is a cardinality constraint
                                // that restricts to exactly one value.
                                return OntologyEditor.create_cardinality_restriction(pid, obj, 1);
                             }
                        }
                    };

                    menu = {
                    "add_class_with_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Relate a class to this one",
                        "action": function (obj) {
                            return OntologyEditor.create_link_handler(this, pid, obj, tree_id);
                         }
                    },
                    "add_restriction": {
                        "separator_before": true,
                        "separator_after": false,
                        "_disabled": false,
                        "label": "Add restriction",
                        "submenu": add_restriction_submenu
                    }};

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
                                "_class": "even-wider-context-menu",
                                "action": function(rid) {
                                    return function (obj) {
                                        return OntologyEditor.remove_restriction(pid, obj, rid);
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
                        "_class": "wider-context-menu",
                        "label": "Remove parent relation link",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove the class-class link between this class and the class connected with the parent relation?")) {
                                var cc_id = obj.attr('ccid');
                                return OntologyEditor.remove_link_handler(pid, cc_id, tree_id);
                            }
                         }
                    };
                } else if (type_of_node === "relation") {
                    menu = {
                    "add_class_with_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Relate a class with this relation",
                        "_class": "wider-context-menu",
                        "action": function (obj) {
                            return OntologyEditor.create_link_handler(this, pid, obj, tree_id);
                         }
                    },
                    "remove_all_links": {
                        "separator_before": true,
                        "separator_after": false,
                        "label": "Remove all links with this relation",
                        "_class": "wider-context-menu",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove all ontology class-class links that use this relation?")) {
                                var rel_id = obj.attr('id').replace("node_", "");
                                var class_b_id = obj.attr('classbid');
                                return OntologyEditor.remove_selected_links_handler(pid, rel_id, class_b_id, tree_id);
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
                    "action": function (obj) {
                        tree.jstree('open_all', obj);
                     }
                };

                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "root": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_root.png"
                    },
                },
                "class": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_class.png"
                    },
                },
                "relation": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_relation.png"
                    },
                }
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

        OntologyEditor.register_tree( tree_id );

        tree.bind("reload_nodes.jstree",
           function (event, data) {
             if (OntologyEditor.currentExpandRequest) {
               openTreePath($(tree_id), OntologyEditor.currentExpandRequest);
             }
           });

        tree.jstree({
          "core": {
            "html_titles": false
          },
          "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
          "json_data": {
            "ajax": {
              "url": django_url + pid + '/ontology/relations/list',
              "data": function (n) {
                var expandRequest, parentName, parameters;
                // depending on which type of node it is, display those
                // the result is fed to the AJAX request `data` option
                parameters = {
                  "pid": pid,
                  "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
                };
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
            "url": STATIC_URL_JS + "libs/jsTree/classic/style.css",
            "dots": true,
            "icons": true
          },
          "contextmenu": {
            "items": function (obj) {
                var type_of_node = obj.attr("rel");
                var menu = {};
                if (type_of_node === "root") {
                    menu = {
                    "add_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new relation",
                        "action": function (obj) {
                            return OntologyEditor.create_relation_handler(pid, tree_id);
                         }
                    },
                    "remove_all_relations": {
                        "separator_before": true,
                        "separator_after": false,
                        "label": "Remove all relations",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove all ontology relations?")) {
                                return OntologyEditor.remove_all_relations_handler(pid, tree_id);
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
                        "action": function (obj) {
                            var rel_id = obj.attr('id').replace("node_", "");
                            var rel_name = obj.attr('name');
                            return OntologyEditor.rename_relation_handler(
                                rel_id, rel_name, pid, tree_id);
                         }
                    },
                    "remove_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Remove relation",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove this relation?")) {
                                var rel_id = obj.attr('id').replace("node_", "");
                                return OntologyEditor.remove_relation_handler(pid, rel_id, tree_id);
                            }
                         }
                    }
                    };
                }
                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "root": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_root.png"
                    },
                },
                "relation": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_relation.png"
                    },
                }
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

        OntologyEditor.register_tree( tree_id );

        tree.bind("reload_nodes.jstree",
           function (event, data) {
             if (OntologyEditor.currentExpandRequest) {
               openTreePath($(tree_id), OntologyEditor.currentExpandRequest);
             }
           });

        tree.jstree({
          "core": {
            "html_titles": false
          },
          "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
          "json_data": {
            "ajax": {
              "url": django_url + pid + '/ontology/classes/list',
              "data": function (n) {
                var expandRequest, parentName, parameters;
                // depending on which type of node it is, display those
                // the result is fed to the AJAX request `data` option
                parameters = {
                  "pid": pid,
                  "roots": 0, // show root classes (0 or 1)?
                  "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
                };
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
            "url": STATIC_URL_JS + "libs/jsTree/classic/style.css",
            "dots": true,
            "icons": true
          },
          "contextmenu": {
            "items": function (obj) {
                var id_of_node = obj.attr("id");
                var type_of_node = obj.attr("rel");
                var menu = {};
                if (type_of_node === "root") {
                    menu = {
                    "add_class": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new class",
                        "action": function (obj) {
                            return OntologyEditor.create_class_handler(pid, tree_id);
                         }
                    },
                    "remove_all_classes": {
                        "separator_before": true,
                        "separator_after": false,
                        "label": "Remove all classes",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove all ontology classes?")) {
                                return OntologyEditor.remove_all_classes_handler(pid, tree_id);
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
                        "action": function (obj) {
                            var class_id = obj.attr('id').replace("node_", "");
                            var class_name = obj.attr('name');
                            return OntologyEditor.rename_class_handler(
                                class_id, class_name, pid, tree_id);
                         }
                    },
                    "remove_class": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Remove class",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove this class?")) {
                                var class_id = obj.attr('id').replace("node_", "");
                                return OntologyEditor.remove_class_handler(pid, class_id, tree_id);
                            }
                         }
                    }
                    };
                }
                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "root": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_root.png"
                    },
                },
                "class": {
                    "icon": {
                        "image": STATIC_URL_JS + "images/ontology_class.png"
                    },
                }
            }
          }
        });
    };

    /**
     * Handles the creation of a relation out of the tree's context menu.
     */
    this.create_relation_handler = function (pid, tree_id) {
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
            OntologyEditor.display_wait_message("Creating relation. Just a moment...");
            var relname= $('#ontology_add_dialog #relname').val();
            // add relation with Ajax call
            requestQueue.register(django_url + pid + '/ontology/relations/add',
                'POST', { "relname": relname },
                function(status, data, text) {
                    OntologyEditor.hide_wait_message();
                    OntologyEditor.handle_operation_response(status, data, text,
                        function() {
                            OntologyEditor.refresh_tree(tree_id);
                            OntologyEditor.show_error_status( "Success", "A new relation has been created." );
                        });
                });
            // clear input box
            $('#ontology_add_dialog #relname').val("");
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
        general_rename_handler("relation", rel_name,
            function(new_name) {
                OntologyEditor.display_wait_message(
                    "Renaming relation. Just a moment...");
                // rename relation with AJAX call
                requestQueue.register(django_url + pid + '/ontology/relations/rename',
                    'POST',
                    { "relid": rel_id,
                      "newname": new_name, },
                    function(status, data, text) {
                        OntologyEditor.hide_wait_message();
                        OntologyEditor.handle_operation_response(status, data, text,
                            function() {
                                OntologyEditor.refresh_tree(tree_id);
                                OntologyEditor.show_error_status( "Success",
                                    "The relation has been renamed." );
                            });
                    });
            });
    };

    /**
     * Handles the renaming of a class out of the tree's context menu.
     */
    this.rename_class_handler = function (class_id, class_name, pid, tree_id) {
        general_rename_handler("class", class_name,
            function(new_name) {
                OntologyEditor.display_wait_message(
                    "Renaming class. Just a moment...");
                // rename relation with AJAX call
                requestQueue.register(django_url + pid + '/ontology/classes/rename',
                    'POST',
                    { "classid": class_id,
                      "newname": new_name, },
                    function(status, data, text) {
                        OntologyEditor.hide_wait_message();
                        OntologyEditor.handle_operation_response(status, data, text,
                            function() {
                                OntologyEditor.refresh_tree(tree_id);
                                OntologyEditor.show_error_status( "Success",
                                    "The class has been renamed." );
                            });
                    });
            });
    };

    /**
     * Handles the removal of a relation.
     */
    this.remove_relation_handler = function (pid, relation_id, tree_id) {
        OntologyEditor.display_wait_message("Removing relation. Just a moment...");
        // make relation with Ajax call
        requestQueue.register(django_url + pid + '/ontology/relations/remove',
            'POST', { "relid": relation_id },
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function() {
                        OntologyEditor.refresh_tree(tree_id);
                        OntologyEditor.show_error_status( "Success", "The relation has been removed." );
                    });
            });
    };

    /**
     * Handles the removal of all relations in a project.
     */
    this.remove_all_relations_handler = function(pid, tree_id) {
        OntologyEditor.display_wait_message("Removing all relations. Just a moment...");
        // make relation with Ajax call
        requestQueue.register(django_url + pid + '/ontology/relations/removeall',
            'GET', null,
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        var refresh = true;
                        // output some status
                        var deleted = jsonData['deleted_relations'].length;
                        var not_deleted = jsonData['not_deleted_relations'].length;
                        if (not_deleted == 0) {
                            OntologyEditor.show_error_status( "Success", "All " + deleted + " relations have been removed." );
                        } else if (deleted == 0) {
                            refresh = false;
                            OntologyEditor.show_error_status( "No success", "No relation could be removed due to their use by in some class links." );
                        } else {
                            var total = deleted + not_deleted;
                            var msg = not_deleted + " of " + total + " relations could not be removed due to their use in some class links.";
                            OntologyEditor.show_error_status( "Partial success", msg );
                        }
                        // refresh tree
                        if (refresh) {
                            OntologyEditor.refresh_tree(tree_id);
                        }
                    });
            });
    };

    /**
     * Handles the creation of a class out of the tree's context menu.
     */
    this.create_class_handler = function (pid, tree_id) {
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
            OntologyEditor.display_wait_message("Adding class. Just a moment...");
            var classname= $('#ontology_add_dialog #classname').val();
            // add class with Ajax call
            requestQueue.register(django_url + pid + '/ontology/classes/add',
                'POST', { "classname": classname },
                function(status, data, text) {
                    OntologyEditor.hide_wait_message();
                    OntologyEditor.handle_operation_response(status, data, text,
                        function() {
                            OntologyEditor.refresh_trees();
                            OntologyEditor.show_error_status( "Success", "A new class has been created." );
                        });
                });
            // clear input box
            $('#ontology_add_dialog #classname').val("");
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
        OntologyEditor.display_wait_message("Removing class. Just a moment...");
        // remove class with Ajax call
        requestQueue.register(django_url + pid + '/ontology/classes/remove',
            'POST', { "classid": class_id },
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function() {
                        OntologyEditor.refresh_trees();
                        OntologyEditor.show_error_status( "Success", "The class has been removed." );
                    });
                });
    };

    /**
     * Handles the removal of all classes.
     */
    this.remove_all_classes_handler = function (pid, class_id, tree_id) {
        OntologyEditor.display_wait_message("Removing all classes. Just a moment...");
        // remove classes with Ajax call
        requestQueue.register(django_url + pid + '/ontology/classes/removeall',
            'POST', null,
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        var refresh = true;
                        // output some status
                        var deleted = jsonData['deleted_classes'].length;
                        var not_deleted = jsonData['not_deleted_classes'].length;
                        if (not_deleted == 0) {
                            OntologyEditor.show_error_status( "Success", "All " + deleted + " classes have been removed." );
                        } else if (deleted == 0) {
                            refresh = false;
                            OntologyEditor.show_error_status( "No success", "No class could be removed due to relations to other classes." );
                        } else {
                            var total = deleted + not_deleted;
                            var msg = not_deleted + " of " + total + " classes could not be removed due to relations to other classes.";
                            OntologyEditor.show_error_status( "Partial success", msg );
                        }
                        // refresh tree
                        if (refresh) {
                            OntologyEditor.refresh_trees();
                        }
                    });
                });
    };

    /**
     * Creates a new link, based on a context menu selection in
     * the class-class link tree.
     */
    this.create_link_handler = function (caller, pid, obj, tree_id)
    {
        var is_relation = (obj.attr("rel") == "relation");
        var classbname;
        if (is_relation) {
            classbname = obj.attr("classbname");
        } else {
            classbname = obj.attr("cname");
        }
        $('#ontology_add_dialog #cancel').off("click").on("click",
        function() {
            $.unblockUI();
            return false;
        });
        $('#ontology_add_dialog #add').off("click").on("click",
        function() {
            $.unblockUI();
            OntologyEditor.display_wait_message("Creating link. Just a moment...");
            // get relation ID and class b ID
            var relid = -1;
            var classbid = -1;
            if (is_relation) {
                classbid = obj.attr('classbid');
                relid = obj.attr('id').replace("node_", "");
            } else {
                // class b is just the parent then
                classbid = obj.attr('id').replace("node_", "");
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
            requestQueue.register(django_url + pid + '/ontology/links/add',
                'POST', postdata,
                function(status, data, text) {
                    OntologyEditor.hide_wait_message();
                    OntologyEditor.handle_operation_response(status, data, text,
                        function( jsonData ) {
                            if (!jsonData['class_class_id'])
                            {
                                alert( "Can't understand server response: " + data );
                            }
                            OntologyEditor.refresh_trees();
                        });
                });
            //caller.create(obj, "inside", att, null, true);
        });
        // get currently available classes and fill class select box
        requestQueue.register(django_url + pid + '/ontology/classes',
            'GET', undefined,
            function(status, data, text) {
                if (status !== 200) {
                    OntologyEditor.show_error_msg( status, text );
                    return;
                }
                var classes = JSON.parse(data);
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
                    $('#ontology_add_dialog #target_rel #name').html(obj.attr("name"));
                    // show dialog
                    $.blockUI({ message: $('#ontology_add_dialog') });
                } else {
                    $('#ontology_add_dialog #target_rel').css("display", "none");
                    // request current relations
                    requestQueue.register(django_url + pid + '/ontology/relations',
                        'GET', undefined,
                        function(status, data, text) {
                            if (status !== 200) {
                                OntologyEditor.show_error_msg( status, text );
                                return;
                            }
                            var relations = JSON.parse(data);
                            // populate class select box
                            var relation_select = $('#ontology_add_dialog #relid');
                            relation_select.empty();
                            $.each(relations, function (key, value) {
                                relation_select.append($('<option></option>').attr("value", value).text(key + " (" + value + ")"));
                            });
                            $('#ontology_add_dialog #select_rel').css("display", "block");
                        });
                    // show dialog
                    $.blockUI({ message: $('#ontology_add_dialog') });
                }
            });
        // fill target object
        $('#ontology_add_dialog #target_object').css("display", "block");
        $('#ontology_add_dialog #target_object #name').html(classbname);
    };

    /**
     * Removes a class-class link.
     */
    this.remove_link_handler = function(pid, link_id, tree_id) {
        OntologyEditor.display_wait_message("Removing class-class link. Just a moment...");
        // remove class with Ajax call
        requestQueue.register(django_url + pid + '/ontology/links/remove',
            'POST', { "ccid": link_id },
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        OntologyEditor.refresh_tree(tree_id);
                        // give out some information
                        if (jsonData.deleted_link == link_id) {
                            OntologyEditor.show_error_status( "Success", "The class-class link has been removed." );
                        } else {
                            var msg = "Something went wrong: Should have removed link " + link_id + ", but server says link " + jsonData.deleted_link + " got removed.";
                            OntologyEditor.show_error_status( "Problem", msg );
                        }
                    });
                });
    };

    /**
     * Removes all class-class links that match a certain class_b and a
     * particular relation.
     */
    this.remove_selected_links_handler = function(pid, rel_id, class_b_id, tree_id) {
        OntologyEditor.display_wait_message("Removing selected class-class links. Just a moment...");
        // remove class with Ajax call
        requestQueue.register(django_url + pid + '/ontology/links/removeselected',
            'POST', {
                 "relid": rel_id,
                 "classbid": class_b_id },
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        OntologyEditor.refresh_tree(tree_id);
                        // give out some information
                        var num_deleted_links = jsonData.deleted_links.length;
                        var msg = num_deleted_links + " class-class link(s) have been removed.";
                        OntologyEditor.show_error_status( "Success", msg );
                    });
                });
    };

    /**
     * Removes all class-class links that match of a project.
     */
    this.remove_all_links_handler = function(pid, tree_id) {
        OntologyEditor.display_wait_message("Removing all class-class links. Just a moment...");
        // remove class with Ajax call
        requestQueue.register(django_url + pid + '/ontology/links/removeall',
            'POST', null,
            function(status, data, text) {
                OntologyEditor.hide_wait_message();
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        OntologyEditor.refresh_tree(tree_id);
                        // give out some information
                        var num_deleted_links = jsonData.deleted_links.length;
                        var msg = num_deleted_links + " class-class link(s) have been removed.";
                        OntologyEditor.show_error_status( "Success", msg );
                    });
                });
    };

    /**
     * Simplifies response handling for most instance operations.
     */
    this.handle_operation_response = function(status, data, text, handler) {
        if (status !== 200) {
            OntologyEditor.show_error_msg( status, text );
            return;
        }
        var jsonData = $.parseJSON(data);
        if (jsonData.error) {
            OntologyEditor.show_error_status( "Error", jsonData.error, 5000 );
        } else {
            handler( jsonData );
        }
    };

    /**
     * Creates a cardinality restriction
     */
    this.create_cardinality_restriction = function( pid, obj, cardinality ) {
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
                OntologyEditor.display_wait_message("Creating restriction. Just a moment...");
                // create restriction
                var postdata = {
                     "linkid": obj.attr("ccid"),
                     "cardinality": $('#cardinality_val').val(),
                     "cardinalitytype": $('#cardinality_type').val(),
                     "restriction": "cardinality"};
                requestQueue.register(django_url + pid + '/ontology/restrictions/add',
                    'POST', postdata,
                    function(status, data, text) {
                        OntologyEditor.hide_wait_message();
                        OntologyEditor.handle_operation_response(status, data, text,
                            function( jsonData ) {
                                if (!jsonData['new_restriction'])
                                {
                                    alert( "Can't understand server response: " + data );
                                } else {
                                    var r_id = jsonData.new_restriction;
                                    var msg = "A new restriction with ID " + r_id + " has been created.";
                                    OntologyEditor.show_error_status( "Success", msg );
                                }
                                OntologyEditor.refresh_trees();
                            });
                    });
            });
            // get currently available cardinality restriction types for type select box
            requestQueue.register(django_url + pid + '/ontology/restrictions/cardinality/types',
                'GET', undefined,
                function(status, data, text) {
                    if (status !== 200) {
                        OntologyEditor.show_error_msg( status, text );
                        return;
                    }
                    var json_data = JSON.parse(data);
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
                });
        } else {
            // add restriction with Ajax call
            requestQueue.register(django_url + pid + '/ontology/restrictions/add',
                'POST', {
                     "linkid": obj.attr("ccid"),
                     "cardinality": cardinality,
                     "cardinalitytype": 0,
                     "restriction": "cardinality" },
                function(status, data, text) {
                    OntologyEditor.handle_operation_response(status, data, text,
                        function( jsonData ) {
                            OntologyEditor.refresh_trees();
                            // give out some information
                            var r_id = jsonData.new_restriction;
                            var msg = "A new restriction with ID " + r_id + " has been created.";
                            OntologyEditor.show_error_status( "Success", msg );
                        });
                    });
        }
    };

    /**
     * Removes a restriction
     */
    this.remove_restriction = function( pid, obj, rid ) {
        // add restriction with Ajax call
        requestQueue.register(django_url + pid + '/ontology/restrictions/remove',
            'POST', { 'restrictionid': rid },
            function(status, data, text) {
                OntologyEditor.handle_operation_response(status, data, text,
                    function( jsonData ) {
                        OntologyEditor.refresh_trees();
                        // give out some information
                        var r_id = jsonData.removed_restriction;
                        var msg = "The restriction with ID " + r_id + " has been removed.";
                        OntologyEditor.show_error_status( "Success", msg );
                    });
                });
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
        for (var i=0; i<OntologyEditor.trees.length; i++)
        {
            var tree_id = OntologyEditor.trees[i];
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
        if (pid != OntologyEditor.workspace_pid || force) {
            // Do a quick check that all the containers are available
            // and only load the trees if they are.
            if ($('#' + content_div_id).length > 0) {
                OntologyEditor.workspace_pid = pid;
                OntologyEditor.load_ontology_tree( pid,
                    "#ontology_tree_object" );
                OntologyEditor.load_ontology_relations_tree( pid,
                    "#ontology_relations_tree" );
                OntologyEditor.load_ontology_classes_tree( pid,
                    "#ontology_classes_tree" );
            }
        }
    };

    /**
     * Shows a JavaScript alert box with text about a request
     * status error.
     */
    this.show_error_msg = function( status, text )
    {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
    };

    /**
     * Shows a growl error message in the top right corner.
     */
    this.show_error_status = function( title, message, delaytime ) {
            if (!delaytime)
                delaytime = 2500;
            growlAlert(title, message, {style: 'error', duratin: delaytime});
    };

    this.display_wait_message = function( message ) {
        $.blockUI({ message: '<h2><img src="' + STATIC_URL_JS + 'images/busy.gif" />' + message + '</h2>' });
    };

    this.hide_wait_message = function() {
        $.unblockUI();
    };
}();
