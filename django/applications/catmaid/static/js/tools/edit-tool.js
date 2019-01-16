/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var EditTool = function() {};

  /**
   * Actions on available on the edit tool are dynamically created, based on the
   * current user profile.
   */
  Object.defineProperty(EditTool, "actions", {
     get: function() { return createEditToolActions(); }
  });

  /**
   * Return array containing edit actions depending on tool visibility settings.
   */
  var createEditToolActions = function() {
    // re-create the whole array
    var editToolActions = [];

    // Only check profile if it is available
    if (!CATMAID.userprofile) return editToolActions;

    if (CATMAID.userprofile.show_text_label_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Text label tool",
          buttonID: 'edit_button_text',
          buttonName: 'text',
          run: function (e) {
            project.setTool( new TextlabelTool() );
            return true;
          }
        }));
    }

    if (CATMAID.userprofile.show_tagging_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Tagging tool",
          buttonID: 'edit_button_tags',
          buttonName: 'tags',
          run: function (e) {
            project.setTool( new TaggingTool() );
            return true;
          }
        }));
    }

    if (CATMAID.userprofile.show_cropping_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Crop tool",
          buttonID: 'edit_button_crop',
          buttonName: 'crop',
          run: function (e) {
            project.setTool( new CATMAID.CroppingTool() );
            return true;
          }
        }));
    }

    if (CATMAID.userprofile.show_tracing_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Tracing tool",
          buttonID: 'edit_button_trace',
          buttonName: 'trace',
          run: function (e) {
            project.setTool( new CATMAID.TracingTool() );
          }
        }));
    }

    if (CATMAID.userprofile.show_ontology_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Show ontology tools",
          buttonID: "edit_button_ontology",
          buttonName: 'ontology_tools',
          run: function (e) {
            project.setTool( new CATMAID.OntologyTool() );
            return true;
          }
        }));
    }

    if (CATMAID.userprofile.show_roi_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Show ROI tool",
          buttonID: "edit_button_roi",
          buttonName: 'roitool',
          run: function (e) {
            project.setTool( new CATMAID.RoiTool() );
            return true;
          }
        }));
    }

    return editToolActions;
  };

  // Make EditTool available in CATMAID namespace
  CATMAID.EditTool = EditTool;

})(CATMAID);
