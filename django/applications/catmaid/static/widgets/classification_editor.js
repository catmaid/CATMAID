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
                        self.overrideNewTreeSubmit(container, pid);
                     }
                     else if (e.page == 'show_graph')
                     {

                     }
                     else if (e.page == 'select_graph')
                     {

                     }
                }));
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
}
