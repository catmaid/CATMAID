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
                    var container = document.getElementById(content_div_id);
                    container.innerHTML = data;
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
}
