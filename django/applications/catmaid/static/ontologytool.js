/**
 * Constructor for the ontology tool.
 */
function OntologyTool()
{
    this.prototype = new Navigator();
    this.toolname = "ontologytool";
    var self = this;
    var actions = new Array();

    this.addAction = function ( action ) {
        actions.push( action );
    };

    this.getActions = function () {
        return actions;
    };

    this.addAction( new Action({
        helpText: "Open the ontology editor",
        buttonName: "editor",
        buttonID: "ontology_button_editor",
        run: function(e) {
            WindowMaker.show('ontology-editor');
            return true;
        }
    }));

    this.addAction( new Action({
        helpText: "Show classification editor",
        buttonName: 'classification_editor',
        buttonID: "classification_editor_button",
        run: function (e) {
          WindowMaker.show('classification-editor');
          return true;
        }
    }));

    /**
     * Adds tools to the ontology tool box.
     */
    var setupSubTools = function()
    {
        // setup tool box
        var box = createButtonsFromActions(
            actions,
            "toolbox_ontology",
            "ontology_");
        $( "#toolbox_ontology" ).replaceWith( box );
    };

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
    {
      $("#edit_button_ontology").addClass("button_active");
      $("#edit_button_ontology").removeClass("button");
      setupSubTools();
      $("#toolbox_ontology").show();
      $("#toolbar_ontology").show();

      // Assign a function to the workspace radio buttons
      $("input[name='ontology_space']").change( function() {
          if ($(this).val() === "classification") {
              OntologyEditor.change_workspace(-1);
              ClassificationEditor.change_workspace(-1);
          } else {
              OntologyEditor.change_workspace(OntologyEditor.original_pid);
              ClassificationEditor.change_workspace(ClassificationEditor.original_pid);
          }
      });
    };

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
    this.unregister = function()
    {
        $("#toolbox_ontology").hide();
    };

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
        $("#toolbox_ontology").hide();
        $("#toolbar_ontology").hide();
        $("#edit_button_ontology").removeClass("button_active");
        $("#edit_button_ontology").addClass("button");
    }

    this.redraw = function()
    {
        // nothing to do here currently
    };

	this.resize = function( width, height )
	{
        // nothing to do here currently
	};

    var keyCodeToAction = getKeyCodeToActionMap(actions);

    /**
     * This function should return true if there was any action
     * linked to the key code, or false otherwise.
     */
    this.handleKeyPress = function( e )
    {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
          return keyAction.run(e);
        } else {
          return false;
        }
    }
}
