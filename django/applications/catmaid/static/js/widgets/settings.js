/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  NeuronNameService,
  project,
  requestQueue,
  SelectionTable,
  SkeletonAnnotations,
  User,
  userprofile,
  WindowMaker
*/

(function(CATMAID) {

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
     * Create a container for help text.
     */
    var createHelpText = function(text)
    {
      return $('<div/>').addClass('help').append(text);
    };

    /**
     * Helper function to add a labeled control.
     */
    var createLabeledControl = function(name, control, helptext)
    {
      var label = $('<label/>')
        .append($('<span/>')
          .addClass('description')
          .append(name))
        .append(control);

      if (helptext) {
        label.append(createHelpText(helptext));
      }

      return $('<div/>').addClass('setting').append(label);
    };

    /**
     * Helper function to create a checkbox with label.
     */
    var createCheckboxSetting = function(name, checked, helptext, handler)
    {
      var cb = $('<input/>').attr('type', 'checkbox');
      if (checked) {
        cb.prop('checked', checked);
      }
      if (handler) {
        cb.change(handler);
      }
      var label = $('<div/>')
        .addClass('setting checkbox-row')
        .append($('<label/>').append(cb).append(name));

      if (helptext) {
        label.append(createHelpText(helptext));
      }

      return label;
    };

    /**
     * Helper function to create a text input field with label.
     */
    var createInputSetting = function(name, val, helptext, handler)
    {
      var input = $('<input/>').attr('type', 'text').val(val);
      if (handler) {
        input.change(handler);
      }
      return createLabeledControl(name, input, helptext);
    };

    /**
     * Helper function to create a set of radio buttons.
     */
    var createRadioSetting = function(name, values, helptext, handler)
    {
      return values.reduce(function (cont, val) {
        return cont.append(createLabeledControl(val.desc, $('<input />').attr({
            type: 'radio',
            name: name,
            id: val.id,
            value: val.id
        }, helptext).prop('checked', val.checked).change(handler)));
      }, $('<div />'));
    };

    /**
     * Adds general settings to the given container.
     */
    var addGeneralSettings = function(container)
    {
      var ds = addSettingsContainer(container, "General settings");

      var msgPosition = $('<select/>');
      var positionOptions = [
        {name: 'Top left', id: 'tl'},
        {name: 'Top right', id: 'tr'},
        {name: 'Bottom left', id: 'bl'},
        {name: 'Bottom right', id: 'br'},
        {name: 'Top center', id: 'tc'},
        {name: 'Bottom center', id: 'bc'}
      ];
      positionOptions.forEach(function(o) {
        this.append(new Option(o.name, o.id));
      }, msgPosition);

      ds.append(createLabeledControl('Message position', msgPosition,
            'Choose where on the screen messages should be displayed. By ' +
            'default they are displayed in the upper right corner'));
      msgPosition.on('change', function(e) {
        CATMAID.messagePosition = this.value;
      });

      // Focus follows cursor settings
      var hoverBehavior = $('<select/>');
      var behaviors = [
        {name: 'Don\'t change focus', id: CATMAID.FOCUS_SAME},
        {name: 'Focus stacks when hovered', id: CATMAID.FOCUS_STACKS},
        {name: 'Focus any window when hovered', id: CATMAID.FOCUS_ALL}
      ];
      behaviors.forEach(function(o) {
        var selected = (o.id === CATMAID.focusBehavior);
        this.append(new Option(o.name, o.id, selected, selected));
      }, hoverBehavior);

      ds.append(createLabeledControl('Window hover behavior', hoverBehavior,
            'Select if and how focus should change when the mouse pointer ' +
            'moves over a window.'));
      hoverBehavior.on('change', function(e) {
        CATMAID.focusBehavior = parseInt(this.value, 10);
      });
    };

    /**
     * Adds TileLayer settings to the given container.
     */
    var addTileLayerSettings = function(container)
    {
      var ds = addSettingsContainer(container, "Stack view");

      ds.append(createCheckboxSetting("Invert mouse wheel",
        userprofile.inverse_mouse_wheel, null, function() {
          userprofile.inverse_mouse_wheel = this.checked;
          userprofile.saveAll(function () {
            CATMAID.msg('Success', 'User profile updated successfully.');
          });
        }));

      ds.append(createCheckboxSetting("Display reference lines",
        userprofile.display_stack_reference_lines, "Show a faint horizontal " +
        "and vertical line that meet at the current view's center.",
        function() {
          userprofile.display_stack_reference_lines = this.checked;
          userprofile.saveAll(function () {
            project.getStackViewers().forEach(function(s) {
              s.showReferenceLines(userprofile.display_stack_reference_lines);
            });
            CATMAID.msg('Success', 'User profile updated successfully.');
          });
        }));

      // Cursor following zoom
      ds.append(createCheckboxSetting("Use cursor following zoom",
        userprofile.use_cursor_following_zoom, "Choose whether zooming " +
        "follows the position of the cursor (checked) or the center of the " +
        "stack view (unchecked).",
        function () {
          userprofile.use_cursor_following_zoom = this.checked;
          userprofile.saveAll(function () {
            CATMAID.msg('Success', 'User profile updated successfully.');
          });
        }));

      // WebGL layers
      ds.append(createCheckboxSetting("Prefer WebGL Layers",
        userprofile.prefer_webgl_layers,
        'Choose whether to use WebGL or Canvas tile layer rendering when ' +
        'supported by your tile source and browser. Note that your tile ' +
        'source server may need to be <a href="http://enable-cors.org/">' +
        'configured to enable use in WebGL</a>. (Note: you must reload ' +
        'the page for this setting to take effect.)',
        function() {
          userprofile.prefer_webgl_layers = this.checked;
          userprofile.saveAll(function () {
            CATMAID.msg('Success', 'User profile updated successfully.');
          });
        }));
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
      $(ds).append(createCheckboxSetting("Show grid on open stacks", false, null,
          function() {
            // Add a grid layer to all open stacks
            if (this.checked) {
              // Get current settings
              project.getStackViewers().forEach(function(s) {
                s.addLayer("grid", new CATMAID.GridLayer(s, getGridOptions()));
                s.redraw();
              });
            } else {
              project.getStackViewers().forEach(function(s) {
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
        project.getStackViewers().forEach(function(s) {
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

      ds.append(createCheckboxSetting("Append Skeleton ID",
        NeuronNameService.getInstance().getAppendSkeletonId(), null, function() {
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
          var dialog = new CATMAID.OptionsDialog("Please enter meta annotation");
          var field = dialog.appendField("Meta annotation", 'meta-annotation',
              '', true);
          dialog.onOK = function() {
            addLabeling($(field).val());
          };

          // Update all annotations before, showing the dialog
          CATMAID.annotations.update(function() {
            dialog.show();
            // Add auto complete to input field
            $(field).autocomplete({
              source: CATMAID.annotations.getAllNames()
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
        project.getStackViewers().forEach(function (s) {s.redraw();});
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
                project.getStackViewers().forEach(function (s) {s.redraw();});
              }})));

      ds.append($('<button>Save to your profile</button>').click(function () {
        userprofile.saveAll(function () {
          CATMAID.msg('Success', 'User profile updated successfully.');
        });
      }).addClass('setting'));


      var dsNodeColors = addSettingsContainer(ds, "Skeleton colors", true);
      // Node color settings: Title vs. SkeletonAnnotations field.
      var colors = new Map([
        ['Active node', 'atn_fillcolor'],
        ['Active skeleton', 'active_skeleton_color'],
        ['Inactive skeleton', 'inactive_skeleton_color'],
        ['Active virtual node/edge', 'active_skeleton_color_virtual'],
        ['Inactive virtual node/edge', 'inactive_skeleton_color_virtual'],
        ['Inactive upstream edge', 'inactive_skeleton_color_above'],
        ['Inactive downstream edge', 'inactive_skeleton_color_below'],
        ['Root node', 'root_node_color'],
        ['Leaf node', 'leaf_node_color'],
      ]);

      var colorControls = new Map();
      colors.forEach(function(field, label) {
        var input = createInputSetting(label, SkeletonAnnotations[field]);
        this.append(input);
        colorControls.set(field, input);
      }, dsNodeColors);

      // Allow color confirmation with enter
      dsNodeColors.find('input').on('keyup', function(e) {
        if (13 === e.keyCode) {
          colors.forEach(function(field, label) {
            var input = colorControls.get(field);
            var color = $(input).find('input').val();
            SkeletonAnnotations[field] = color;
          });
          // Update all tracing layers
          project.getStackViewers().forEach(function(sv) {
            var overlay = SkeletonAnnotations.getSVGOverlay(sv.getId());
            if (overlay) overlay.recolorAllNodes();
          });
        }
      });


      var dsSkeletonProjection = addSettingsContainer(ds,
          "Active skeleton projection", true);

      // Figure out if all displayed stack viewers have a skeleton projection
      // layer
      var allHaveLayers = project.getStackViewers().every(function(sv) {
        return !!sv.getLayer('skeletonprojection');
      });

      var skpVisible = createCheckboxSetting("Display projections",
          allHaveLayers, "Activating this layer adds upstream and downstream " +
          "projections of the active skeleton to the tracing display.",
          updateSkeletonProjectionDisplay);
      dsSkeletonProjection.append(skpVisible);

      var skpShading = $('<select/>');
      var skpShadingOptions = [
        {name: 'Plain color', id: 'plain'},
        {name: 'Z distance', id: 'zdistance'},
        {name: 'Relative Strahler gradient', id: 'relstrahlergradient'},
        {name: 'Relative Strahler cut', id: 'relstrahlercut'},
        {name: 'Absolute Strahler gradient', id: 'strahlergradient'},
        {name: 'Absolute Strahler cut', id: 'strahlercut'}
      ];
      skpShadingOptions.forEach(function(o) {
        var selected = o.id === CATMAID.SkeletonProjectionLayer.options.shadingMode;
        this.append(new Option(o.name, o.id, selected, selected));
      }, skpShading);
      skpShading.on('change', updateSkeletonProjectionDisplay);

      dsSkeletonProjection.append(createLabeledControl('Shading', skpShading));

      // Set default properties
      var skpDownstreamColor = createInputSetting("Downstream color",
          CATMAID.SkeletonProjectionLayer.options.downstreamColor);
      var skpUpstreamColor = createInputSetting("Upstream color",
          CATMAID.SkeletonProjectionLayer.options.upstreamColor);
      var skpShowEdges = createCheckboxSetting("Show edges",
          CATMAID.SkeletonProjectionLayer.options.showEdges, null,
          updateSkeletonProjectionDisplay);
      var skpShowNodes = createCheckboxSetting("Show nodes",
          CATMAID.SkeletonProjectionLayer.options.showNodes, null,
          updateSkeletonProjectionDisplay);
      var skpMinStrahler = createInputSetting("Min. Strahler",
          CATMAID.SkeletonProjectionLayer.options.strahlerShadingMin);
      var skpMaxStrahler = createInputSetting("Max. Strahler",
          CATMAID.SkeletonProjectionLayer.options.strahlerShadingMax,
          "For Strahler based shading, the relative min and max Strahler " +
          "number can be set. These numbers are relative to the active Node. " +
          "Nodes not in this range won't be shown. -1 deactivates a condition.");
      var skpDistanceFalloff = createInputSetting("Distance falloff",
          CATMAID.SkeletonProjectionLayer.options.distanceFalloff,
          "For distance based shading, a fall-off can be set, by which " +
          "opacity is reduced with every layer");

      dsSkeletonProjection.append(skpDownstreamColor);
      dsSkeletonProjection.append(skpUpstreamColor);
      dsSkeletonProjection.append(skpShowEdges);
      dsSkeletonProjection.append(skpShowNodes);
      dsSkeletonProjection.append(skpMinStrahler);
      dsSkeletonProjection.append(skpMaxStrahler);
      dsSkeletonProjection.append(skpDistanceFalloff);

      // Add a spinner to Strahler configuration
      $(skpMinStrahler).add(skpMaxStrahler).find('input').spinner({
        min: -1,
        change: updateSkeletonProjectionDisplay,
        stop: updateSkeletonProjectionDisplay
      });

      // Add a spinner to z distance fallof
      $(skpDistanceFalloff).find('input').spinner({
        min: 0,
        step: 0.001,
        change: updateSkeletonProjectionDisplay,
        stop: updateSkeletonProjectionDisplay
      });

      // Allow color confirmation with enter
      skpDownstreamColor.find('input').add(skpUpstreamColor.find('input'))
        .on('keyup', function(e) {
          if (13 === e.keyCode) updateSkeletonProjectionDisplay();
        });

      // Get all relevant skeleton projection options
      function getSkeletonProjectionOptions() {
        return {
          "visible": skpVisible.find('input').prop('checked'),
          "shadingMode": skpShading.val(),
          "downstreamColor": skpDownstreamColor.find('input').val(),
          "upstreamColor": skpUpstreamColor.find('input').val(),
          "showEdges": skpShowEdges.find('input').prop('checked'),
          "showNodes": skpShowNodes.find('input').prop('checked'),
          "strahlerShadingMin": skpMinStrahler.find('input').val(),
          "strahlerShadingMax": skpMaxStrahler.find('input').val(),
          "distanceFalloff": skpDistanceFalloff.find('input').val(),
          "initialNode": SkeletonAnnotations.atn
        };
      }

      function updateSkeletonProjectionDisplay() {
        var options = getSkeletonProjectionOptions();
        CATMAID.SkeletonProjectionLayer.updateDefaultOptions(options);
        // Create a skeleton projection layer for all stack viewers that
        // don't have one already.
        project.getStackViewers().forEach(function(sv) {
          var layer = sv.getLayer('skeletonprojection');
          if (options.visible) {
            if (layer) {
              // Update existing instance
              layer.updateOptions(options, false);
              layer.update(options.initialNode);
            } else {
              // Create new if not already present
              layer = new CATMAID.SkeletonProjectionLayer(sv, options);
              sv.addLayer("skeletonprojection", layer);
            }
          } else if (layer) {
            sv.removeLayer("skeletonprojection");
          }
        });
      }

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

      // Tracing settings
      ds = addSettingsContainer(container, "Tracing");
      ds.append(createCheckboxSetting("Edit radius after node creation",
        SkeletonAnnotations.setRadiusAfterNodeCreation, "The visual radius " +
        "editing tool will be shown right after a node has been created.",
        function() {
          SkeletonAnnotations.setRadiusAfterNodeCreation = this.checked;
        }));
      ds.append(createCheckboxSetting("Create abutting connectors",
        SkeletonAnnotations.newConnectorType === SkeletonAnnotations.SUBTYPE_ABUTTING_CONNECTOR,
        "Instead of creating synaptic connectors, abutting ones will be created",
        function() {
          if (this.checked) {
            SkeletonAnnotations.newConnectorType = SkeletonAnnotations.SUBTYPE_ABUTTING_CONNECTOR;
          } else {
            SkeletonAnnotations.newConnectorType = SkeletonAnnotations.SUBTYPE_SYNAPTIC_CONNECTOR;
          }
        }));
      ds.append($('<div/>').addClass('setting').text());
      ds.append(createInputSetting("Default new neuron name",
          SkeletonAnnotations.defaultNewNeuronName,
          "Every occurrence of '{nX}' in the default name with X being a " +
          "number is replaced by a number that is automatically incremented " +
          "(starting from X) to the smallest unique value in the project.",
          function () {
            SkeletonAnnotations.defaultNewNeuronName = $(this).val();
          }));
    ds.append(createCheckboxSetting("Merge annotations of single-node skeletons without asking",
      SkeletonAnnotations.quickSingleNodeSkeletonMerge, "If true, no merge dialog " +
      "will be shown for single-node skeletons with annotations. Instead, all " +
      "annotations will be merged without asking.",
      function() {
        SkeletonAnnotations.quickSingleNodeSkeletonMerge = this.checked;
      }));
    };


    // Add all settings
    addGeneralSettings(space);
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

  CATMAID.SettingsWidget = SettingsWidget;

})(CATMAID);
