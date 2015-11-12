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
    if (!userprofile) return editToolActions;

    if (userprofile.show_text_label_tool) {
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

    if (userprofile.show_tagging_tool) {
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

    if (userprofile.show_cropping_tool) {
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

    if (userprofile.show_segmentation_tool) {
      editToolActions.push(
        new CATMAID.Action({
           helpText: "Segmentation Tool",
           buttonID: 'edit_button_segmentation',
           buttonName: 'canvas',
           keyShortcuts: {
           },
           run: function (e) {
              project.setTool( new CATMAID.SegmentationTool() );
           }
        }));
    }

    if (userprofile.show_tracing_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Tracing tool",
          buttonID: 'edit_button_trace',
          buttonName: 'trace',
          run: function (e) {
            // Test if neuron tracing is set up properly for the current project.
            // Only load the tracing tool if this is the case.
            requestQueue.register(django_url + project.id + "/tracing/setup/test", "GET",
                null, function (status, text) {
                  var data;
                  if (status !== 200) {
                    alert("Testing the tracing setup failed with HTTP status code: "
                      + status);
                  } else {
                    data = $.parseJSON(text);
                    if (data.error) {
                      alert("An error was returned when trying to test the tracing setup: "
                        + data.error);
                    } else if (data.needs_setup) {
                      CATMAID.TracingTool.display_tracing_setup_dialog(project.id,
                        data.has_needed_permissions, data.missing_classes,
                        data.missing_relations, data.missing_classinstances,
                        data.initialize);
                    } else {
                      project.setTool( new CATMAID.TracingTool() );
                    }
                  }
            });
            return true;
          }
        }));
    }

    if (userprofile.show_ontology_tool) {
      editToolActions.push(
        new CATMAID.Action({
          helpText: "Show ontology tools",
          buttonID: "edit_button_ontology",
          buttonName: 'ontology_tools',
          run: function (e) {
            project.setTool( new OntologyTool() );
            return true;
          }
        }));
    }

    if (userprofile.show_roi_tool) {
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
