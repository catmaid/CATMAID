/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";
  /**
   * Constructor for the ontology tool.
   */
  function OntologyTool()
  {
      this.prototype = new CATMAID.Navigator();
      this.toolname = "ontologytool";
      var self = this;
      var actions = [];
      // The workspace mode indicates whether the semantic space of the
      // current project ("project") or of a dummy project ("classification")
      // should be used. The latter is of use for a semantic space to be
      // shared between projects.
      var workspace_mode = "project";

      this.addAction = function ( action ) {
          actions.push( action );
      };

      this.getActions = function () {
          return actions;
      };

      this.addAction( new CATMAID.Action({
          helpText: "Open the ontology editor",
          buttonName: "editor",
          buttonID: "ontology_button_editor",
          run: function(e) {
              WindowMaker.show('ontology-editor');
              return true;
          }
      }));

      this.addAction( new CATMAID.Action({
          helpText: "Show classification editor",
          buttonName: 'classification_editor',
          buttonID: "classification_editor_button",
          run: function (e) {
              WindowMaker.show('classification-editor');
              return true;
          }
      }));

      this.addAction( new CATMAID.Action({
          helpText: "Show clustering widget",
          buttonName: 'clustering_widget',
          buttonID: "clustering_button",
          run: function (e) {
              WindowMaker.create('ontology-clustering-widget');
              return true;
          }
      }));

      this.addAction( new CATMAID.Action({
          helpText: "Show ontology search widget",
          buttonName: 'search',
          buttonID: "ontology_search_button",
          run: function (e) {
              var widget = new CATMAID.OntologySearch();
              widget.workspacePid = self.workspace_mode === "classification" ? -1 : project.id;
              WindowMaker.create('ontology-search', widget);
              return true;
          }
      }));

      /**
       * Adds tools to the ontology tool box.
       */
      var setupSubTools = function()
      {
          // setup tool box
          var box = CATMAID.createButtonsFromActions(
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
        $("#edit_button_ontology").switchClass("button", "button_active", 0);
        setupSubTools();
        $("#toolbox_ontology").show();
        $("#toolbar_ontology").show();

        // Assign a function to the workspace radio buttons
        $("input[name='ontology_space']").change( function() {
            self.workspace_mode = $(this).val();
        });
      };

      /**
       * Updates the workspace toolbar according to the user profile.
       */
      var initToolbar = function() {
          var use_projects = CATMAID.userprofile.independent_ontology_workspace_is_default ? false : true;
          $("input[name='ontology_space'][value='project']").prop('checked', use_projects);
          $("input[name='ontology_space'][value='classification']").prop('checked', !use_projects);
          self.workspace_mode = use_projects ? "project" : "classification";
      };

    /**
     * unregister all stack related mouse and keyboard controls
     */
      this.unregister = function()
      {
          // nothing to do here currently
      };

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
          $("#toolbox_ontology").hide();
          $("#toolbar_ontology").hide();
          $("#edit_button_ontology").switchClass("button_active", "button", 0);
      };

      this.redraw = function()
      {
          // nothing to do here currently
      };

    this.resize = function( width, height )
    {
          // nothing to do here currently
    };

      var keyToAction = CATMAID.getKeyToActionMap(actions);

      /**
       * This function should return true if there was any action
       * linked to the key code, or false otherwise.
       */
      this.handleKeyPress = function( e )
      {
          var keyAction = CATMAID.UI.getMappedKeyAction(keyToAction, e);
          if (keyAction) {
            return keyAction.run(e);
          } else {
            return false;
          }
      };

      // init the workspace bar
      initToolbar();
  }

  // Export tool
  CATMAID.OntologyTool = OntologyTool;

})(CATMAID);
