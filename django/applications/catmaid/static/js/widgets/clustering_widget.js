
var ClusteringWidget = new function()
{
    var self = this;
    var content_div_id = 'clustering_content';
    var workspace_pid;

    /**
     * Creates the base URL, needed for all clustering requests and
     * appends the passed string to it. The combined result is returned.
     */
    this.get_clustering_url = function( sub_url ) {
        return django_url + 'clustering/' + self.workspace_pid + sub_url;
    };

    this.render_to_content = function( container, url, patch )
    {
        // display the clustering selection
        requestQueue.register(url,
            'GET', undefined,
            function(status, data, text) {
                if (status !== 200) {
                    alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
                } else {
                    container.innerHTML = "<p>" + data + "</p>";
                    // patch the data if requested
                    if (patch)
                    {
                        patch( container );
                    }
                }
            });
    };

    this.patch_clustering_setup = function( container )
    {
        var form = $("#clustering-setup-form", container);
        var found = form.length !== 0;
        if (found) {
            // Take care of submission on our own
            form.submit(function() {
                var src_button = $(".button[clicked=true]", $(this));
                // The button that caused the submission has to be treated
                // separately, because jQuery's serialize() used below won't
                // serialize submit button values (it doesn't know the origin)
                var post = $(src_button).attr("name") + "=" + $(src_button).val();
                $.ajax({
                    type: "POST",
                    url: form.attr('action'),
                    data: form.serialize() + "&" + post,
                    success: function(data, textStatus) {
                        container.innerHTML = "<p>" + data + "</p>";
                        ClusteringWidget.patch_clustering_setup( container );
                    }
                });
                return false;
            });
            // Override click event of all buttons in the form to
            // indicate which button was the one that was clicked.
            var submit_buttons = $(".button", form);
            submit_buttons.click(function(){
                $(".button", $(this).parents("form")).removeAttr("clicked");
                $(this).attr("clicked", "true");
            });
        }

        // additional functionality for the classification selection form
        var master_cb = $("#select-all", container);
        if (master_cb.length > 0) {
            var slave_cbs = $("#clustering-setup-form input[type=checkbox][class=autoselectable]",
                container);

            master_cb.click( function() {
                var val = master_cb.attr("checked") == "checked";
                slave_cbs.attr("checked", val);
            });

            slave_cbs.click( function() {
                master_cb.attr("checked", $.grep(slave_cbs, function(e) {
                    return $(e).attr("checked");
                }).length == slave_cbs.length);
            });
        }

        // add collapsing of sections in result view
        var result_titles = $("div#clustering_results p.title", container);
        if (result_titles.length > 0) {
            result_titles.click( function() {
                var section = this;
                $(section).next(".content").animate(
                    { height: "toggle",
                      opacity: "toggle" },
                    { complete: function() {
                        // change open/close indicator box
                        var open_elements = $(".extend-box-open", section);
                        if (open_elements.length > 0) {
                            open_elements.attr('class', 'extend-box-closed');
                        } else {
                            $(".extend-box-closed", section).attr('class', 'extend-box-open');
                        }
                        // update the position of the dendrogram handle
                        var canvas = document.getElementById("clustering-canvas");
                        var handle = document.getElementById("dendrogram-handle");
                        if (canvas != null && handle != null) {
                            handle.style.left = (canvas.offsetLeft + canvas.offsetWidth - 10) + "px";
                            handle.style.top = (canvas.offsetTop + canvas.offsetHeight -20) + "px";
                        }
                    }});
            });
        }

        // add feature selection trees if the div can be found
        var feature_div = $("#clutering-setup-features", container);
        if (feature_div.length !== 0) {
            // load tree for every ontology div found below
            $.each($("span", feature_div[0]), function(i, val) {
                var tree_id = $(val).attr("id") + "-tree";
                self.load_feature_tree( tree_id );
            });
        }
    };

    this.load_feature_tree = function( tree_id, container ) {
        var tree = $(tree_id);
        var pid = -1;
        console.log(tree_id);

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
    };

    this.render_clustering = function(dendrogram)
    {
        // The dendrogram data structure might contain NaN values
        // when empty sets were involved. Replace them by "null"
        // to be able to parse the JSON object.
        dendrogram = dendrogram.replace(/NaN/g, "null");
        // Parse JSON data
        dendrogram = $.parseJSON(dendrogram);
        // If the "clustering-graph" div is available, try to to draw
        // a hierarchical clustering graph.
        var container = $("#clustering-graph");
        var found = container.length !== 0;
        if (found) {
            // Replace the null values with 1.0 (for the maximum Jaccard
            // distance) to make them drawable and remember the null indices.
            var nan_clusters = new Array();
            $.each(dendrogram.dcoord, function(i, val) {
                var contains_nans = false;
                $.each(val, function(j, val2) {
                    if (val2 === null) {
                        contains_nans = true;
                        dendrogram.dcoord[i][j] = 1.0;
                    }
                });
                if (contains_nans) {
                    nan_clusters.push(i);
                }
            });

            container = container[0];
            // find maximum dissimilarity and x value
            var max_y = null;
            $.each(dendrogram.dcoord, function(i, val) {
                $.each(val, function(j, val2) {
                    if (max_y == null)
                        max_y = val2;
                    else if (val2 > max_y)
                        max_y = val2;
                });
            });
            var max_x = 5 + (dendrogram.ivl.length - 1) * 10;

            // create Raphael canvas
            var width = 400;
            var height = 500;
            var padding = 3;
            var canvas = document.createElement('div');
            canvas.setAttribute("id", "clustering-canvas");
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            container.appendChild(canvas);
            var r = new Raphael("clustering-canvas");
            // allow scaling with keeping the aspect ratio
            r.setViewBox(0, 0, width, height, true);
            r.setSize('100%', '100%');
            r.canvas.setAttribute('preserveAspectRatio', 'xMinYMin');

            // Sort clusters in a way that NaN clusters are drawn first
            // and create color array.
            var x_coords = new Array();
            var y_coords = new Array();
            var colors = [];
            $.each(nan_clusters, function(i, val) {
                x_coords.push(dendrogram.icoord[val]);
                y_coords.push(dendrogram.dcoord[val]);
                colors.push('rgb(140,140,140)');
            });
            $.each(dendrogram.dcoord, function(i, val) {
                if (nan_clusters.indexOf(i) == -1) {
                    x_coords.push(dendrogram.icoord[i]);
                    y_coords.push(dendrogram.dcoord[i]);
                    colors.push('rgb(0,0,0)');
                }
            });

            // create dendrogram
            var padding = 30;
            var chart = r.linechart(
                padding, 0,                  // left top anchor
                width - padding, height - padding,  // bottom right anchor
                x_coords,
                y_coords,
                {
                   nostroke: false,   // lines between points are drawn
                   axis: "0 0 0 1",   // draw axis on the left
                   smooth: false,     // don't curve the lines
                   colors: colors,
                   axisystep: 10,
                   minx: 0.0,
                   maxy: max_y < 1.0 ? 1.0 : max_y,
                });

            // get the paper coordinates of the x axis
            var x_axis_y = chart.worldToPaperY(0.0);

            // label leaves with incrementing numbers
            chart.labels = r.set();
            var x = 15; var h = 5;
            // draw labels 6px below X axis
            var label_y = x_axis_y + 6;
            // SciPy positions leaves every ten ticks, starting at five.
            // Iterate the clusters and get coordinates of leaf nodes.
            var label_coords = [];
            for (var i=0;i<dendrogram.leaves.length;i++) {
                var x_coord = 5 + i*10;
                var label_x = chart.worldToPaperX(x_coord);
                label_coords.push( {'x': label_x, 'y': label_y} );
            }
            // draw labels
            var label_center_y = null;
			var max_label_width = null;
			var labels = new Array();
            $.each(label_coords, function(i, coord) {
                // only draw labels for real leaves
                if (dendrogram.leaves[i] < dendrogram.ivl.length) {
                    // draw label
                    var text = r.text(coord.x, coord.y, dendrogram.ivl[i]);
                    // find maximum text width
                    var bb = text.getBBox();
                    if (max_label_width == null)
                        max_label_width = bb.width;
                    else if (bb.width > max_label_width)
                        max_label_width = bb.width;
                    // rotate the label
                    text.transform("r270");
                    // align it vertically to the top
                    var h = Math.abs(bb.y2) - Math.abs(bb.y) + 1;
                    text.attr({
                        //'y': bb.y + h,
                        'text-anchor': "end",
                        'font': "11px 'Fontin Sans', Fontin-Sans, sans-serif" });
                    // store vertical label center if not already done
                    if (label_center_y == null) {
                        label_center_y = bb.y + h;
                    }
                    // remember this label
                    labels.push(text);
                }
            });
            // adjust viewbox to make everything visible
            r.setViewBox(0, 0, width, height + max_label_width, true);

            // add a handle for cluster resizing
            var rhandle = document.createElement("div");
            rhandle.setAttribute("id", "dendrogram-handle");
            rhandle.style.width = "0px";
            rhandle.style.height = "0px";
            rhandle.style.borderStyle = "solid";
            rhandle.style.borderWidth = "0 0 10px 10px";
            rhandle.style.borderColor = "transparent transparent #ccc transparent";
            rhandle.style.position = "absolute";
            rhandle.style.left = (canvas.offsetLeft + canvas.offsetWidth - 10) + "px";
            rhandle.style.top = (canvas.offsetTop + canvas.offsetHeight -20) + "px";
            // add drag code
            var scale_ratio = width / height;
            var start_mouse_x, start_mouse_y,
                start_canvas_w, start_canvas_h;
            var move_handler = function(e) {
                var diff_x = e.clientX - start_mouse_x,
                    diff_y = e.clientY - start_mouse_y;
                if (width < height) {
                    var new_height = start_canvas_h + diff_y;
                    canvas.style.height = new_height  + "px";
                    canvas.style.width = (new_height * scale_ratio) + "px";
                } else {
                    var new_width = start_canvas_w + diff_x;
                    canvas.style.height = (new_width / scale_ratio) + "px";
                    canvas.style.width = new_width + "px";
                }
                rhandle.style.left = (canvas.offsetLeft + canvas.offsetWidth - 10) + "px";
                rhandle.style.top = (canvas.offsetTop + canvas.offsetHeight -20) + "px";
            };
            rhandle.addEventListener('mousedown',
                function(e) {
                    // stop default event behaviour to avoid text being selected
                    stopDefault(e);
                    // proces coordinates
                    start_mouse_x = e.clientX;
                    start_mouse_y = e.clientY;
                    start_canvas_w = canvas.offsetWidth;
                    start_canvas_h = canvas.offsetHeight;
                    window.addEventListener("mousemove", move_handler, true);
                }, false);
            window.addEventListener('mouseup',
                function(e) {
                    window.removeEventListener("mousemove", move_handler, true);
                }, false);
            // add handle
            container.appendChild(rhandle);

            // attach hovering functions
            var current_label = null;
            chart.hoverColumn(
                function() {
                    // The first leaf of a SciPy dendrogram is at x=5,
                    // calculate relative x to this.
                    var rel_leaf_x = Math.round(chart.paperToWorldX(this.x) - 5);
                    // Only show tags if a leaf column is hovered, i.e. the relative
                    // x coordinate can be divided by 10 without remainder.
                    if (rel_leaf_x % 10 == 0) {
                        var graph_idx = rel_leaf_x / 10;
                        var graph_name = dendrogram.ivl[graph_idx];
                        // highlight label
                        current_label = labels[graph_idx];
                        current_label.attr({'fill': "#0000FF"});
                    }
                },
                function() {
                    if (current_label) {
                        current_label.attr({'fill': "#000000"});
                        current_label = null;
                    }
                });

            // create export link
            var export_link = $("#dendrogram_export_link");
            if (export_link.length !== 0) {
                export_link = export_link[0];
                var svg = r.toSVG();
                var encoded_uri = "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(svg);
                export_link.setAttribute("href", encoded_uri);
                // The "download" attribute isn't supported by every browser,
                // try it nevertheless.
                export_link.setAttribute("download", "catmaid_dendrogram.svg");
            }
        }
    };

    this.init = function()
    {
        if (workspace_pid)
            self.refresh();
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

    this.refresh = function(completionCallback)
    {
        var container = document.getElementById(content_div_id);

        // get the view from Django
        container.innerHTML = "<p>Please select the features that should be used for clustering.</p>";
        ClusteringWidget.render_to_content(container,
            self.get_clustering_url('/setup'), self.patch_clustering_setup);
    };
}();
