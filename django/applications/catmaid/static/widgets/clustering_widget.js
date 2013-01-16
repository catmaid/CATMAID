
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
                    if (patch != null)
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
    }

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
