/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  annotations,
  ConnectorSelection,
  growlAlert,
  NeuronNameService,
  OptionsDialog,
  project,
  requestQueue,
  SelectionTable,
  User,
  userprofile,
  WindowMaker
*/

"use strict";

var SettingsWidget = function() {};

SettingsWidget.prototype = {};

/**
 * Initializes the settings widget in the given container.
 */
SettingsWidget.prototype.init = function(space)
{
  /**
   * Helper function to create a collapsible settings container.
   */
  var addSettingsContainer = function(parent, name, closed)
  {
    var content = $('<div/>').addClass('content');
    if (closed) {
      content.css('display', 'none');
    }
    var sc = $('<div/>')
      .addClass('settings-container')
      .append($('<p/>')
        .addClass('title')
        .append($('<span/>')
          .addClass(closed ? 'extend-box-closed' : 'extend-box-open'))
        .append(name))
      .append(content);

    $(parent).append(sc);

    return content;
  };

  /**
   * Helper function to add a labeled control.
   */
  var createLabeledControl = function(name, control)
  {
    return $('<div/>').addClass('setting')
      .append($('<label/>')
        .append($('<span/>').addClass('description').append(name))
        .append(control));
  };

  /**
   * Helper function to create a checkbox with label.
   */
  var createCheckboxSetting = function(name, handler, checked)
  {
    var cb = $('<input/>').attr('type', 'checkbox');
    if (checked) {
      cb.prop('checked', checked);
    }
    if (handler) {
      cb.change(handler);
    }
    var label = $('<div/>')
      .addClass('setting')
      .append($('<label/>').append(cb).append(name));

    return label;
  };

  /**
   * Helper function to create a text input field with label.
   */
  var createInputSetting = function(name, val, handler)
  {
    var input = $('<input/>').attr('type', 'text').val(val);
    return createLabeledControl(name, input);
  };

  /**
   * Helper function to create a set of radio buttons.
   */
  var createRadioSetting = function(name, values, handler)
  {
    return values.reduce(function (cont, val) {
      return cont.append(createLabeledControl(val.desc, $('<input />').attr({
          type: 'radio',
          name: name,
          id: val.id,
          value: val.id,
          checked: val.checked
      }).change(handler)));
    }, $('<div />'));
  };

  /**
   * Adds TileLayer settings to the given container.
   */
  var addTileLayerSettings = function(container)
  {
    var ds = addSettingsContainer(container, "Tile Layer");
    // Add explanatory text
    ds.append($('<div/>').addClass('setting').append('Choose whether to use ' +
        'WebGL or Canvas tile layer rendering when supported by your tile ' +
        'source and browser. Note that your tile source server may need to ' +
        'be <a href="http://enable-cors.org/">configured to enable use in ' +
        'WebGL</a>. (Note: you must reload the page for this setting to take ' +
        'effect.)'));

    ds.append(createCheckboxSetting("Prefer WebGL Layers", function() {
      userprofile.prefer_webgl_layers = this.checked;
      userprofile.saveAll(function () {
        growlAlert('Success', 'User profile updated successfully.');
      });
    }, userprofile.prefer_webgl_layers));
  };

  /*
   * Adds a grid settings to the given container.
   */
  var addGridSettings = function(container)
  {
    var ds = addSettingsContainer(container, "Grid overlay");
    // Grid cell dimensions and offset
    var gridCellWidth = createInputSetting("Grid width (nm)", 1000);
    var gridCellHeight = createInputSetting("Grid height (nm)", 1000);
    var gridCellXOffset = createInputSetting("X offset (nm)", 0);
    var gridCellYOffset = createInputSetting("Y offset (nm)", 0);
    var gridLineWidth = createInputSetting("Line width (px)", 1);
    var getGridOptions = function() {
      return {
        cellWidth: parseInt($("input", gridCellWidth).val()),
        cellHeight: parseInt($("input", gridCellHeight).val()),
        xOffset: parseInt($("input", gridCellXOffset).val()),
        yOffset: parseInt($("input", gridCellYOffset).val()),
        lineWidth: parseInt($("input", gridLineWidth).val())
      };
    };
    // General grid visibility
    $(ds).append(createCheckboxSetting("Show grid on open stacks", function() {
          // Add a grid layer to all open stacks
          if (this.checked) {
            // Get current settings
            project.getStacks().forEach(function(s) {
              s.addLayer("grid", new CATMAID.GridLayer(s, getGridOptions()));
              s.redraw();
            });
          } else {
            project.getStacks().forEach(function(s) {
              s.removeLayer("grid");
            });
          }
        }));
    // Append grid options to settings
    $(ds).append(gridCellWidth);
    $(ds).append(gridCellHeight);
    $(ds).append(gridCellXOffset);
    $(ds).append(gridCellYOffset);
    var gridUpdate = function() {
      // Get current settings
      var o = getGridOptions();
      // Update grid, if visible
      project.getStacks().forEach(function(s) {
        var grid = s.getLayer("grid");
        if (grid) {
          grid.setOptions(o.cellWidth, o.cellHeight, o.xOffset,
              o.yOffset, o.lineWidth);
          s.redraw();
        }
      });
    };
    $("input[type=text]", ds).spinner({
      min: 0,
      change: gridUpdate,
      stop: gridUpdate
    });
    // Grid line width
    $(ds).append(gridLineWidth);
    $("input[type=text]", gridLineWidth).spinner({
      min: 1,
      change: gridUpdate,
      stop: gridUpdate
    });
  };

  var addTracingSettings = function(container)
  {
    var ds = addSettingsContainer(container, "Annotations");
    // Add explanatory text
    ds.append($('<div/>').addClass('setting').append("Many widgets of " +
        "the tracing tool display neurons in one way or another. This " +
        "setting allows you to change the way neurons are named in these " +
        "widgets. Neurons are usually annotated and below you can choose " +
        "if and how these annotations should be used for labeling a neuron. " +
        "You can add different representations to a fallback list, in case " +
        "a desired representation isn't available for a neuron."));

    ds.append(createCheckboxSetting("Append Skeleton ID", function() {
      NeuronNameService.getInstance().setAppendSkeletonId(this.checked);
    }));
    // Get all available options
    var namingOptions = NeuronNameService.getInstance().getOptions();
    // Add naming option select box
    var select = $('<select/>');
    namingOptions.forEach(function(o) {
      this.append(new Option(o.name, o.id));
    }, select);
    ds.append(createLabeledControl('Neuron label', select));

    // Create 'Add' button and fallback list
    var fallbackList = $('<select/>').addClass('multiline').attr('size', '4')[0];
    var addButton = $('<button/>').text('Add labeling').click(function() {
      var newLabel = select.val();
      // The function to be called to actually add the label
      var addLabeling = function(metaAnnotation) {
        if (metaAnnotation) {
          NeuronNameService.getInstance().addLabeling(newLabel, metaAnnotation);
        } else {
          NeuronNameService.getInstance().addLabeling(newLabel);
        }
        updateFallbackList();
      };

      // Get current labeling selection and ask for a meta annotation if
      // required.
      if (newLabel === 'all-meta' || newLabel === 'own-meta') {
        // Ask for meta annotation
        var dialog = new OptionsDialog("Please enter meta annotation");
        var field = dialog.appendField("Meta annotation", 'meta-annotation',
            '', true);
        dialog.onOK = function() {
          addLabeling($(field).val());
        };

        // Update all annotations before, showing the dialog
        annotations.update(function() {
          dialog.show();
          // Add auto complete to input field
          $(field).autocomplete({
            source: annotations.getAllNames()
          });
        });
      } else {
        addLabeling();
      }
    });
    var removeButton = $('<button/>').text('Remove labeling').click(function() {
      // The last element cannot be removed
      if (fallbackList.selectedIndex < fallbackList.length - 1) {
        // We display the fallback list reversed, therefore we need to mirror
        // the index.
        NeuronNameService.getInstance().removeLabeling(fallbackList.length - fallbackList.selectedIndex - 1);
        updateFallbackList();
      }
    });
    ds.append(createLabeledControl('', addButton));
    ds.append(createLabeledControl('', fallbackList));
    ds.append(createLabeledControl('', removeButton));

    var updateFallbackList = function() {
      $(fallbackList).empty();
      var options = NeuronNameService.getInstance().getFallbackList().map(function(o, i) {
        // Add each fallback list element to the select control. The last
        // element is disabled by default.
        var optionElement = $('<option/>').attr('value', o.id)
            .text(o.name);
        if (i === 0) {
          optionElement.attr('disabled', 'disabled');
        }
        return optionElement[0];
      });
      // We want to display the last fall back list element first, so we need
      // to reverse the options, before we add it.
      options.reverse();
      options.forEach(function(o) {
        fallbackList.appendChild(o);
      });
    };
    // Initialize fallback ist
    updateFallbackList();


    // Overlay settings
    ds = addSettingsContainer(container, "Tracing Overlay");
    // Add explanatory text
    ds.append($('<div/>').addClass('setting').append("Choose how nodes, " +
        "edges, connectors, and labels are scaled in the tracing overlay. " +
        "This setting can be saved to your user profile and will persist " +
        "across sessions. (Note: changes to text labels, edges and arrows " +
        "will not appear correctly in the stack view until you zoom, switch " +
        "sections or pan.)"));

    ds.append(createRadioSetting('overlay-scaling', [
        {id: 'overlay-scaling-screen', desc: 'Fixed screen size',
            checked: userprofile.tracing_overlay_screen_scaling},
        {id: 'overlay-scaling-stack', desc: 'Fixed stack size',
            checked: !userprofile.tracing_overlay_screen_scaling}
    ], function () {
      userprofile.tracing_overlay_screen_scaling = this.value === 'overlay-scaling-screen';
      project.getStacks().forEach(function (s) {s.redraw();});
    }).addClass('setting'));

    ds.append(createLabeledControl(
        $('<span>Size adjustment: <span id="overlay-scale-value">' +
            (userprofile.tracing_overlay_scale*100).toFixed() + '</span>%</span>'),
        $('<div id="overlay-scaling-slider" />').slider({
            min: -2,
            max: 2,
            step: 0.1,
            value: Math.log(userprofile.tracing_overlay_scale)/Math.LN2,
            change: function (event, ui) {
              userprofile.tracing_overlay_scale = Math.pow(2, ui.value);
              $('#overlay-scale-value').text((userprofile.tracing_overlay_scale*100).toFixed());
              project.getStacks().forEach(function (s) {s.redraw();});
            }})));

    ds.append($('<button>Save to your profile</button>').click(function () {
      userprofile.saveAll(function () {
        growlAlert('Success', 'User profile updated successfully.');
      });
    }).addClass('setting'));


    // Reviewer whitelist settings
    ds = addSettingsContainer(container, "Reviewer Team");
    // Add explanatory text
    ds.append($('<div/>').addClass('setting').append("Choose which users' " +
        "reviews to include when calculating review statistics. You may also " +
        "specify a time after which to include each user's reviews. Reviews " +
        "by that user prior to this time are ignored. Your team is private; " +
        "reviewers are not informed whether you have added them to your team."));

    // Get all available users
    var users = User.all();
    var reviewers = Object.keys(users).map(function (userId) { return users[userId]; });
    // Add reviewer options to select box
    var reviewerSelect = $('<select/>');
    reviewers.sort(User.displayNameCompare).forEach(function (user) {
      this.append(new Option(user.getDisplayName(), user.id));
    }, reviewerSelect);

    var acceptAfterInput = $('<input type="text" />').datepicker({
      changeMonth: true,
      changeYear: true,
      maxDate: 0 // Do not allow future dates
    });

    // Create 'Add' button and whitelist
    var whitelist = $('<select/>').addClass('multiline').attr('size', '4')[0];

    var addReviewerButton = $('<button/>').text('Add to team').click(function() {
      var newReviewer = reviewerSelect.val();
      // Let CATMAID.ReviewSystem.Whitelist choose a default date if none was entered
      var acceptAfter = acceptAfterInput.val() ? acceptAfterInput.val() : undefined;
      CATMAID.ReviewSystem.Whitelist
          .addReviewer(newReviewer, acceptAfter)
          .save(refreshWhitelist);
    });

    var removeReviewerButton = $('<button/>').text('Remove from team').click(function() {
      var removedReviewer = $(whitelist).val();
      CATMAID.ReviewSystem.Whitelist
          .removeReviewer(removedReviewer)
          .save(refreshWhitelist);
    });

    ds.append(createLabeledControl('Reviewer', reviewerSelect));
    ds.append(createLabeledControl('Accept after', acceptAfterInput));
    ds.append(createLabeledControl('', addReviewerButton));
    ds.append(createLabeledControl('', whitelist));
    ds.append(createLabeledControl('', removeReviewerButton));

    var refreshWhitelist = function () {
      $(whitelist).empty();
      var wlEntries = CATMAID.ReviewSystem.Whitelist.getWhitelist();
      var options = Object.keys(wlEntries).map(function(userId) {
        var user = User.safe_get(userId);
        var optionElement = $('<option/>')
            .attr('value', userId)
            .text(user.getDisplayName() + ' (' + wlEntries[userId].toDateString() + ')');
        return optionElement[0];
      });

      options.sort(function (a, b) {
          return User.displayNameCompare(users[a.value], users[b.value]); });

      options.forEach(whitelist.appendChild.bind(whitelist));
    };

    // Initialize whitelist
    refreshWhitelist();
  };


  // Add all settings
  addTileLayerSettings(space);
  addGridSettings(space);
  addTracingSettings(space);

  // Add collapsing support to all settings containers
  $("p.title", space).click(function() {
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
      }});
  });

  return;
};
