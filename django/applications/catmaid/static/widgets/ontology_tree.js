/**
 * The OntologyTree is a widget that shows information about the
 * semantic space, linked to a project. It also allows creation and
 * removal of relations, classes and class-class links.
 */
var OntologyTree = new function()
{
    this.init = function( pid )
    {
        cls_pid = -1;
        OntologyTree.load_classification_tree( cls_pid );
        OntologyTree.load_classification_relations_tree( cls_pid );
        OntologyTree.load_classification_classes_tree( cls_pid );
    };

    this.load_classification_tree = function( pid )
    {
        var ontology_tree_id = "#ontology_tree_object";
        var tree = $(ontology_tree_id);

        $("#refresh_ontology_tree").off("click").on("click",
        function () {
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
            "dots": true,
            "icons": true
          },
          "contextmenu": {
            "items": function (obj) {
                var id_of_node = obj.attr("id");
                var type_of_node = obj.attr("rel");
                var menu = {};
                if (type_of_node === "class") {
                    menu = {
                    "add_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new relation",
                        "action": function (obj) {
                            return OntologyTree.create_relation_handler(pid);
                         }
                    },
                    "add_class_with_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Relate (new) class to this",
                        "action": function (obj) {
                            return OntologyTree.create_link_handler(this, pid, obj);
                         }
                    }
                    }
                } else if (type_of_node === "relation") {
                    menu = {
                    "add_class_with_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Relate (new) class",
                        "action": function (obj) {
                            return OntologyTree.create_link_handler(this, pid, obj);
                         }
                    },
                    "add_class": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new class",
                        "action": function (obj) {
                            return OntologyTree.create_class_handler(pid);
                         }
                    }
                    }
                }
                return menu;
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
    this.load_classification_relations_tree = function( pid )
    {
        var tree_id = "#classification_relations_tree";
        var tree = $(tree_id);

        $("#refresh_ontology_tree").off("click").on("click",
        function () {
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
              "url": django_url + pid + '/ontology/relations/list',
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
                            return OntologyTree.create_relation_handler(pid);
                         }
                    },
                    "remove_all_relations": {
                        "separator_before": true,
                        "separator_after": false,
                        "label": "Remove all relations",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove all classification relations?")) {
                                return OntologyTree.remove_all_relations_handler(pid);
                            }
                         }
                    }
                    }
                } else if (type_of_node === "relation") {
                    menu = {
                    "add_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new relation",
                        "action": function (obj) {
                            return OntologyTree.create_relation_handler(pid);
                         }
                    },
                    "remove_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Remove relation",
                        "action": function (obj) {
                            // assure that this was on purpose
                            if (confirm("Are you sure you want to remove this relation?")) {
                                var rel_id = obj.attr('id').replace("node_", "")
                                return OntologyTree.remove_relation_handler(pid, rel_id);
                            }
                         }
                    }
                    }
                }
                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "root": {
                    "icon": {
                        "image": "widgets/themes/kde/jsTree/ontology/root.png"
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
    this.load_classification_classes_tree = function( pid )
    {
        var tree_id = "#classification_classes_tree";
        var tree = $(tree_id);

        $("#refresh_ontology_tree").off("click").on("click",
        function () {
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
              "url": django_url + pid + '/ontology/classes/list',
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
                    "add_relation": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new relation",
                        "action": function (obj) {
                            return OntologyTree.create_relation_handler(pid);
                         }
                    }
                    }
                } else if (type_of_node === "relation") {
                    menu = {
                    "add_class": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Add new class",
                        "action": function (obj) {
                            return OntologyTree.create_class_handler(pid, obj);
                         }
                    }
                    }
                }
                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "root": {
                    "icon": {
                        "image": "widgets/themes/kde/jsTree/ontology/root.png"
                    },
                },
                "class": {
                    "icon": {
                        "image": "widgets/themes/kde/jsTree/ontology/class.png"
                    },
                }
            }
          }
        });
    };

    /**
     * Handles the creation of a relation out of the tree's context menu.
     */
    this.create_relation_handler = function (pid) {
        $('#ontology_add_dialog #cancel').off("click").on("click",
        function() {
            $.unblockUI();
            return false;
        });
        $('#ontology_add_dialog #add').off("click").on("click",
        function() {
            $.unblockUI();
            var relname= $('#ontology_add_dialog #relname').val();
            // add relation with Ajax call
            requestQueue.register(django_url + pid + '/ontology/relations/add',
                'POST', { "relname": relname },
                function(status, data, text) {
                    if (status !== 200) {
                        OntologyTree.show_error_msg( status, text );
                        return
                    }
                    // refresh tree
                    var ontology_tree_id = "#classification_relations_tree";
                    $(ontology_tree_id).jstree("refresh", -1);
                });
        });
        // show only relation field
        $('#ontology_add_dialog #input_rel').css("display", "block");
        $('#ontology_add_dialog #select_rel').css("display", "none");
        $('#ontology_add_dialog #input_class').css("display", "none");
        $('#ontology_add_dialog #select_class').css("display", "none");
        // show dialog
        $.blockUI({ message: $('#ontology_add_dialog') });
    };

    /**
     * Handles the removal of a relation.
     */
    this.remove_relation_handler = function (pid, relation_id) {
        // make relation with Ajax call
        requestQueue.register(django_url + pid + '/ontology/relations/remove',
            'POST', { "relid": relation_id },
            function(status, data, text) {
                if (status !== 200) {
                    OntologyTree.show_error_msg( status, text );
                    return
                }
                // refresh tree
                var ontology_tree_id = "#classification_relations_tree";
                $(ontology_tree_id).jstree("refresh", -1);
            });
    };

    /**
     * Handles the removal of all relations in a project.
     */
    this.remove_all_relations_handler = function(pid) {
        // make relation with Ajax call
        requestQueue.register(django_url + pid + '/ontology/relations/removeall',
            'GET', null,
            function(status, data, text) {
                if (status !== 200) {
                    OntologyTree.show_error_msg( status, text );
                    return
                }
                // refresh tree
                var ontology_tree_id = "#classification_relations_tree";
                $(ontology_tree_id).jstree("refresh", -1);
            });
    }

    /**
     * Handles the creation of a class out of the tree's context menu.
     */
    this.create_class_handler = function (pid) {
        $('#ontology_add_dialog #cancel').off("click").on("click",
        function() {
            $.unblockUI();
            return false;
        });
        $('#ontology_add_dialog #add').off("click").on("click",
        function() {
            $.unblockUI();
            var classname= $('#ontology_add_dialog #classname').val();
            att = {
              "state": "open",
              "data": classname,
              "attr": {
                "rel": "class"
              }
            }
            // add class with Ajax call
            requestQueue.register(django_url + pid + '/ontology/classes/add',
                'POST', { "classname": classname },
                function(status, data, text) {
                    if (status !== 200) {
                        OntologyTree.show_error_msg( status, text );
                        return
                    }
                    OntologyTree.update_classes_display( pid )
                });
        });
        // show only class field
        $('#ontology_add_dialog #input_rel').css("display", "none");
        $('#ontology_add_dialog #select_rel').css("display", "none");
        $('#ontology_add_dialog #input_class').css("display", "block");
        $('#ontology_add_dialog #select_class').css("display", "block");
        // show dialog
        $.blockUI({ message: $('#ontology_add_dialog') });
    };

    /**
     * Creates a new link, based on a context menu selection in
     * the class-class link tree.
     */
    this.create_link_handler = function (caller, pid, obj)
    {
        var is_relation = (obj.attr("rel") == "relation");
        $('#ontology_add_dialog #cancel').off("click").on("click",
        function() {
            $.unblockUI();
            return false;
        });
        $('#ontology_add_dialog #add').off("click").on("click",
        function() {
            $.unblockUI();
            // get relation ID and class b ID
            var relid = -1;
            var classbid = -1;
            if (is_relation) {
                classbid = obj.attr('classbid');
                relid = obj.attr('id').replace("node_", "")
            } else {
                // class b is just the parent then
                classbid = obj.attr('id').replace("node_", "")
                // check if an available relation was selected
                relid = $('#relid').val();
                if (relid < 0) {
                    // create a new relation
                    relname = $('#ontology_add_dialog #relname').val();
                    // do this wth. of a sync AJAX call
                    var url = django_url + pid + '/ontology/relations/add';
                    var res = sync_request( url, "POST", { "relname": relname } );
                    var relation = JSON.parse(res);
                    if (!relation["relation_id"]) {
                        alert("The server returned an unexpected result:\n" + res);
                        return;
                    }
                    relid = relation["relation_id"];
                }
            }
            // get class a ID
            var classaid = $('#classid').val();
            if (classaid < 0) {
                // create a new class
                var classname = $('#ontology_add_dialog #classname').val();
                // do this wth. of a sync AJAX call
                var url = django_url + pid + '/ontology/classes/add';
                var res = sync_request( url, "POST", { "classname": classname } );
                var added_class = JSON.parse(res);
                if (!added_class["class_id"]) {
                    alert("The server returned an unexpected result:\n" + res);
                    return;
                }
                classaid = added_class["class_id"];
            }
            // create class-class relation
            var postdata = {
                'classaid': classaid,
                'classbid': classbid,
                'relid': relid
            };
            requestQueue.register(django_url + pid + '/ontology/links/add',
                'POST', postdata,
                function(status, data, text) {
                    if (status !== 200) {
                        OntologyTree.show_error_msg( status, text );
                        return
                    }
                    var relation = JSON.parse(data);
                    if (!relation['class_class_id'])
                    {
                        alert( "Can't understand server response: " + data )
                        return
                    }
                    // refresh tree
                    var ontology_tree_id = "#ontology_tree_object";
                    $(ontology_tree_id).jstree("refresh", -1);
                });
            //caller.create(obj, "inside", att, null, true);
        });
        // get currently available classes and fill class select box
        requestQueue.register(django_url + pid + '/ontology/classes',
            'GET', undefined,
            function(status, data, text) {
                if (status !== 200) {
                    OntologyTree.show_error_msg( status, text );
                    return
                }
                var classes = JSON.parse(data);
                // populate class select box
                var class_select = $('#ontology_add_dialog #classid');
                class_select.empty();
                class_select.append($('<option></option>').attr("value", "-1").text("(None)"));
                $.each(classes, function (key, value) {
                    class_select.append($('<option></option>').attr("value", value).text(key + " (" + value + ")"));
                });
                // show class selection
                $('#ontology_add_dialog #input_class').css("display", "block");
                $('#ontology_add_dialog #select_class').css("display", "block");

                // show only relation field if a class is the origin of this call
                if (is_relation) {
                    $('#ontology_add_dialog #input_rel').css("display", "none");
                    $('#ontology_add_dialog #select_rel').css("display", "none");
                    // show dialog
                    $.blockUI({ message: $('#ontology_add_dialog') });
                } else {
                    // request current relations
                    requestQueue.register(django_url + pid + '/ontology/relations',
                        'GET', undefined,
                        function(status, data, text) {
                            if (status !== 200) {
                                OntologyTree.show_error_msg( status, text );
                                return
                            }
                            var relations = JSON.parse(data);
                            // populate class select box
                            var relation_select = $('#ontology_add_dialog #relid');
                            relation_select.empty();
                            relation_select.append($('<option></option>').attr("value", "-1").text("(None)"));
                            $.each(relations, function (key, value) {
                                relation_select.append($('<option></option>').attr("value", value).text(key + " (" + value + ")"));
                            });
                            $('#ontology_add_dialog #input_rel').css("display", "block");
                            $('#ontology_add_dialog #select_rel').css("display", "block");
                        });
                    // show dialog
                    $.blockUI({ message: $('#ontology_add_dialog') });
                }
            });
    };

    /**
     * Fetches all available class names/IDs from the backend
     * and displays it in a container.
     */
    this.update_classes_display = function( pid )
    {
        requestQueue.register(django_url + pid + '/ontology/classes',
            'GET', undefined,
            function(status, data, text) {
                if (status !== 200) {
                    OntologyTree.show_error_msg( status, text );
                    return
                }
                var classes = JSON.parse(data);
                var text = ""
                var added_first = false;
                for (c in classes) {
                    if (added_first) {
                        text += ", " + c + "(" + classes[c] + ")"
                    } else {
                        added_first = true;
                        text += c + "(" + classes[c] + ")"
                    }
                }
                var container = document.getElementById('ontology_classes');
                container.innerHTML = text;
            });
    };

    this.show_error_msg = function( status, text )
    {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
    };
};
