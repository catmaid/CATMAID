function TaggingTool()
{
    var self = this;
    this.stackViewer = null;
    this.toolname = "taggingtool";

    // indicate if the tags have been loaded
    this.project_tags_ready = false;
    this.stack_tags_ready = false;

    // store the original values to test for change
    this.initial_project_tags = null;
    this.initial_stack_tags = null;

    // an object to save update states of objects
    this.update_states = {};

    // get references for the input controls
    this.input_project_tags = document.getElementById( "project_tags" );
    this.input_stack_tags = document.getElementById( "stack_tags" );
    this.button_tags_apply = document.getElementById( "button_tags_apply" );

    /**
     * Initiates calls to the server to get the tags of
     * the current project.
     */
    this.retrieve_project_tags = function()
    {
        var projectId = self.stackViewer.getProject().id;
        CATMAID.fetch(projectId + '/tags/list')
          .then(function(result) {
            var tags = result.tags.join(', ');
            self.input_project_tags.value = tags;
            self.input_project_tags.disabled = false;
            self.project_tags_ready = true;
            self.initial_project_tags = self.trim_elements( tags );
          })
          .catch(CATMAID.handleError);
    };

    /**
     * Initiates calls to the server to get the tags of
     * the current stack.
     */
    this.retrieve_stack_tags = function()
    {
        var projectId = self.stackViewer.getProject().id;
        var sid = self.stackViewer.primaryStack.id;
        CATMAID.fetch(projectId + '/stack/' + sid + '/tags/list')
          .then(function(result) {
            var tags = result.tags.join(', ');
            self.input_stack_tags.value = tags;
            self.input_stack_tags.disabled = false;
            self.stack_tags_ready = true;
            self.initial_stack_tags = self.trim_elements( tags );
          })
          .catch(CATMAID.handleError);
    };

    /**
     * This method takes a string that represents a list (e.g. "a, b, c")
     * andd will produce a string with all the spaces before and after
     * each element removed (e.g. "a,b,c").
     */
    this.trim_elements = function( list_string )
    {
        var outer_trim = list_string.replace(/^\s+|\s+$/g, "");
        var inner_trim = outer_trim.replace(/\s*,\s*/g, ",");
        return inner_trim;
    };

    /**
     * Updates the tags of the current project and stack in the
     * model.
     */
    this.update_tags = function()
    {
        // act only when tags are loaded
        if ( !(self.project_tags_ready && self.stack_tags_ready) )
        {
            return;
        }

        // get currently set tags
        var project_tags = self.trim_elements( self.input_project_tags.value );
        var stack_tags = self.trim_elements( self.input_stack_tags.value );

        // get project and stack IDs
        var project = self.stackViewer.getProject();
        var pid = project.id;
        var sid = self.stackViewer.primaryStack.id;

        /* check if there was a change and return if there wasn't
         * one. Send the tags to the server otherwise.
         */
        var project_tags_changed = (self.initial_project_tags != project_tags);
        var stack_tags_changed = (self.initial_stack_tags != stack_tags);

        // give some feedback if no changes happened
        if (!project_tags_changed && !stack_tags_changed)
        {
            alert("You did not make any changes to the tags. No change to apply.");
            return;
        }

        // trigger the actual updates
        if (project_tags_changed)
        {
            var url = pid + '/tags/';
            if (project_tags.length > 0)
            {
                url += project_tags + '/update';
            }
            else
            {
                url += 'clear';
            }
            self.update_states.project = "pending";
            CATMAID.fetch(url)
              .then(function(json) {
                self.update_states.project = "done";
                // update the project tags
                self.retrieve_project_tags();
              })
              .catch(function(e) {
                self.update_states.project = "error";
                CATMAID.handleError(e);
              });
        }
        if (stack_tags_changed)
        {
            var url = pid + '/stack/' + sid + '/tags/';
            if (stack_tags.length > 0)
            {
                url += stack_tags + '/update';
            }
            else
            {
                url += 'clear';
            }
            self.update_states.stack = "pending";
            CATMAID.fetch(url)
              .then(function() {
                self.update_states.stack = "done";
                // update the stack tags
                self.retrieve_stack_tags();
              })
              .catch(function(e) {
                self.update_states.stack = "error";
                CATMAID.handleError(e);
              });
        }

        // see if all updates went well
        self.check_updates();
    };

    /**
     * Checks what tag updates have been requested and displays
     * a message when all of them are done.
     */
    this.check_updates = function()
    {
        // see if there are still pending requests
        var pending_count = 0;
        for (var key in self.update_states)
        {
            if (self.update_states[key] == "pending")
            {
                pending_count = pending_count + 1;
            }
        }

        /* If there are zero pending, tell the user about the result
         * of all the requests. Else, try again in 200ms.
         */
        if (pending_count === 0)
        {
            var failed_count = 0;
            var failed_objs = "";
            var done_count = 0;
            var done_objs = "";
            var new_obj;

            for (var key in self.update_states)
            {
                if (self.update_states[key] == "error")
                {
                    new_obj = (failed_count === 0) ? key : (", " + key);
                    failed_objs = failed_objs + new_obj;
                    failed_count = failed_count + 1;
                }
                else if (self.update_states[key] == "done")
                {
                    new_obj = (done_count === 0) ? key : (", " + key);
                    done_objs = done_objs + new_obj;
                    done_count = done_count + 1;
                }
            }

            // tell the user if there were problems
            if (failed_count > 0)
            {
                alert("The tags for following objects could not be updated: " + failed_objs);
            }

            // tell the user about the done projects
            if (done_count > 0)
            {
                alert("The tags for following objects have been updated: " + done_objs);
            }

            // reset state object
            for (var key in self.update_states)
            {
                delete self.update_states[key];
            }
        }
        else
        {
            // try again in 200ms
            setTimeout(self.check_updates, 200);
        }
    };

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {
        self.project_tags_ready = false;
        self.stack_tags_ready = false;
    };

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function( buttonName )
    {
        self.unregister();

        // disable button and toolbar
        document.getElementById( "edit_button_tags" ).className = "button";
        document.getElementById( "toolbar_tags" ).style.display = "none";

        self.stackViewer = null;
    };

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer )
    {
        self.stackViewer = parentStackViewer;

        // enable button and toolbar
        document.getElementById( "edit_button_tags" ).className = "button_active";
        document.getElementById( "toolbar_tags" ).style.display = "block";

        // disable inputs while the tags are retrieved
        self.input_project_tags.disabled = true;
        self.input_stack_tags.disabled = true;
        self.input_project_tags.value = "(Retrieving tags)";
        self.input_stack_tags.value = "(Retrieving tags)";

        // get the tags
        self.retrieve_project_tags();
        self.retrieve_stack_tags();

		// initialize crop button
		self.button_tags_apply.onclick = self.update_tags;
    };

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */
    this.handleKeyPress = function( e )
    {
        return false;
    };
}
