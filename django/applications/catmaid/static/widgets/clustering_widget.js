
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
    }

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
            var slave_cbs = $("#clustering-setup-form input[type=checkbox]",
                container);

            master_cb.click( function() {
                var val = master_cb.attr("checked") == "checked";
                slave_cbs.attr("checked", val);
            });

            slave_cbs.click( function() {
                master_cb.attr("checked", $.grep(slave_cbs, function(e) {
                    return $(e).attr("checked");
                }).length == slave_cbs.length)
            });
        }
    }

    this.render_clustering = function(dendrogram)
    {
        // If the "clustering-graph" div is available, try to to draw
        // a hierarchical clustering graph.
        var container = $("#clustering-graph");
        var found = container.length !== 0;
        if (found) {
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

            // create a colors for each cluster
            var colors = [];
            Raphael.getColor.reset();
            $.each(dendrogram.leaves, function(i, val) {
                colors.push( 'rgb(0,0,0)' );
            });

            // create dendrogram
            var padding = 30;
            var chart = r.linechart(
                padding, 0,                  // left top anchor
                width - padding, height - padding,  // bottom right anchor
                dendrogram.icoord,
                dendrogram.dcoord,
                {
                   nostroke: false,   // lines between points are drawn
                   axis: "0 0 0 1",   // draw axis on the left
                   smooth: false,     // don't curve the lines
                   colors: colors,
                   axisystep: 10,
                   minx: 0.0,
                   maxy: max_y < 1.0 ? 1.0 : max_y,
                });

            // draw own x axis
            r.path("M" + chart.worldToPaperX(0.0) +
                   "," + chart.worldToPaperY(0.0) +
                   "H" + chart.worldToPaperX(max_x + 5));

            // get the paper coordinates of the x axis
            var x_axis_y = chart.worldToPaperY(0.0);

            // label leaves with incrementing numbers
            chart.labels = r.set();
            var x = 15; var h = 5;
            // draw labels 3px below X axis
            var label_y = x_axis_y + 3;
            // SciPy positions leaves every ten ticks, starting at five.
            // Iterate the clusters and get coordinates of leaf nodes.
            var label_coords = [];
            for (var i=0;i<dendrogram.leaves.length;i++) {
                var x_coord = 5 + i*10;
                var label_x = chart.worldToPaperX(x_coord);
                label_coords.push( {'x': label_x, 'y': label_y} );
            }
            // draw labels
            var label_num = 1;
            var label_center_y = null;
            $.each(label_coords, function(i, coord) {
                // only draw labels for real leaves
                if (dendrogram.leaves[i] < dendrogram.ivl.length) {
                    var text = r.text(coord.x, coord.y, "" + (i+1));
                    // align it vertically to the top
                    var b = text.getBBox();
                    var h = Math.abs(b.y2) - Math.abs(b.y) + 1;
                    text.attr({
                        'y': b.y + h,
                        'font': "11px 'Fontin Sans', Fontin-Sans, sans-serif" });
                    // increment counter
                    label_num = label_num + 1;
                    // store vertical label center if not already done
                    if (label_center_y == null) {
                        label_center_y = b.y + h;
                    }
                }
            });

            // add a handle for cluster resizing
            var rhandle = document.createElement("div");
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

            // create a legend
            var legend = document.createElement('div');
            legend.setAttribute("id", "clustering-legend");
            legend.setAttribute("class", "indented");
            var legend_table = document.createElement('table');
            $.each(dendrogram.ivl, function(i, val) {
                var row = document.createElement('tr');
                var cell_1 = document.createElement('td');
                var cell_2 = document.createElement('td');
                var content_1 = document.createTextNode((i + 1) + ".");
                var content_2 = document.createTextNode(val);
                cell_1.appendChild(content_1);
                cell_2.appendChild(content_2);
                row.appendChild(cell_1);
                row.appendChild(cell_2);
                legend_table.appendChild(row);
            });
            legend.appendChild(legend_table);
            container.appendChild(legend);

            // attach hovering functions
            chart.hoverColumn(
                function() {
                    // The first leaf of a SciPy dendrogram is at x=5,
                    // calculate relative x to this.
                    var rel_leaf_x = Math.round(chart.paperToWorldX(this.x) - 5);
                    // Only show tags if a leaf column is hovered, i.e. the relative
                    // x coordinate can be divided by 10 without remainder.
                    if (rel_leaf_x % 10 == 0) {
                        var graph_idx = rel_leaf_x / 10
                        var graph_name = dendrogram.ivl[graph_idx];
                        // Make the tag appear on the right of the pointer for
                        // the first half of leafs and to the left for the rest.
                        var dir = (this.x < width * 0.5) ? 0 : 180;
                        // create tag
                        this.bulletWidth = 2;
                        this.tags = r.set()
                        this.tags.push(
                            r.tag(this.x, label_center_y, graph_name, dir, 10)
                                .insertBefore(this)
                                .attr([{ fill: "#CED8F6" }, { fill : "#000" }]));
                    }
                },
                function() {
                    this.tags && this.tags.remove();
                });
        }
    };

    this.init = function()
    {
        if (workspace_pid)
            self.refresh();
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
        var container = document.getElementById(content_div_id);

        // get the view from Django
        container.innerHTML = "<p>Please select the features that should be used for clustering.</p>";
        ClusteringWidget.render_to_content(container,
            self.get_clustering_url('/setup'), self.patch_clustering_setup);
    };
}
