/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  project,
  SkeletonAnnotations,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var SettingsWidget = function() {
    InstanceRegistry.call(this);
    this.widgetID = this.registerInstance();
  };

  SettingsWidget.prototype = Object.create(InstanceRegistry.prototype);
  SettingsWidget.prototype.constructor = SettingsWidget;

  SettingsWidget.prototype.getName = function() {
    return "Settings " + this.widgetID;
  };

  SettingsWidget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  SettingsWidget.prototype.getWidgetConfiguration = function() {
    return {
      contentID: "settings-widget",
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.init(this.content);
      }
    };
  };

  /**
   * Initializes the settings widget in the given container.
   */
  SettingsWidget.prototype.init = function(space)
  {

    /**
     * Add meta controls and information about settings cascade, scope and
     * overrides/locking to a settings element. Optionally, a toStr() function
     * can be provided to format the string representation of a settings value.
     */
    var wrapSettingsControl = function (control, settings, key, scope, update, toStr) {
      var valueScope = settings.rendered[scope][key].valueScope;
      var fromThisScope = valueScope === scope;
      var overridable = settings.rendered[scope][key].overridable;
      var meta = $('<ul />');
      var updateAndRefresh = function () {
        var updateValue = CATMAID.tools.isFn(update) ? update() : undefined;
        Promise.resolve(updateValue).then(refresh);
      };

      if (!fromThisScope) {
        control.addClass('inherited');
        meta.append($('<li />').text('This value is inherited from ' + valueScope + ' settings.'));
      }

      if (!overridable && !fromThisScope) {
        control.addClass('disabled');
        control.find('button,input,select').prop('disabled', true);
        control.find('.ui-slider').slider('option', 'disabled', true);
        meta.append($('<li />').text('This value is locked by ' + valueScope + ' settings.'));
      }

      var defaultValue = settings.schema.entries[key].default;
      if (toStr) {
        defaultValue = toStr(defaultValue);
      }
      meta.append($('<li />')
          .text('CATMAID\'s default is ' + JSON.stringify(defaultValue) + '.'));

      meta = $('<div class="settingsMeta" />').append(meta);

      if (fromThisScope) {
        meta.append($('<button />')
            .text('Reset to inherited default')
            .click(function () {
              settings.unset(key, scope).then(updateAndRefresh);
            }));
      }

      // Do not allow user-specific scopes to set overridability because it
      // is confusing.
      if ((scope === 'global' || scope === 'project') &&
          (overridable || fromThisScope)) {
        meta.append($('<button />')
            .text(overridable ? 'Lock this setting' : 'Unlock this setting')
            .click(function () {
              settings.setOverridable(key, !overridable, scope).then(updateAndRefresh);
            }));
      }

      control.prepend($('<button class="settingsMetaToggle" />')
          .button({
              icons: {
                primary: "ui-icon-gear"
              },
              text: false
            })
          .click(function () { meta.toggle(); }));

      return control.append(meta);
    };

    /**
     * Adds a selector for the scope of settings displayed by the widget.
     */
    var addSettingsScopeSelect = function (container) {
      var scopeSelect = $('<select/>');
      var scopeOptions = [
        {name: 'Your default settings', val: 'user'},
        {name: 'Your settings for this project', val: 'session'}
      ];
      if (CATMAID.hasPermission(project.id, 'can_administer')) {
        scopeOptions = [
          {name: 'All users: server defaults', val: 'global'},
          {name: 'All users: project defaults', val: 'project'},
        ].concat(scopeOptions);
      }
      scopeOptions.forEach(function(o) {
        var selected = o.val === SETTINGS_SCOPE;
        this.append(new Option(o.name + ' (' + o.val + ')', o.val, selected, selected));
      }, scopeSelect);

      scopeSelect.on('change', function(e) {
        SETTINGS_SCOPE = this.value;
        refresh();
      });

      $(container).append(scopeSelect);
    };

    /**
     * Adds general settings to the given container.
     */
    var addGeneralSettings = function(container)
    {
      var ds = CATMAID.DOM.addSettingsContainer(container, "General settings");

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
      msgPosition.val(CATMAID.messagePosition);

      ds.append(CATMAID.DOM.createLabeledControl('Message position', msgPosition,
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

      ds.append(CATMAID.DOM.createLabeledControl('Window hover behavior',
            hoverBehavior, 'Select if and how focus should change when the ' +
            'mouse pointer moves over a window.'));
      hoverBehavior.on('change', function(e) {
        CATMAID.focusBehavior = parseInt(this.value, 10);
      });

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              'Table page length options',
              CATMAID.Client.Settings[SETTINGS_SCOPE].table_page_length_options,
              'A list of numbers, representing page length options that ' +
              'nearly all tables will use. A value of -1 stands for "All ' +
              'values". Widgets have to be reloaded to respect setting changes.',
              function () {
                var newOptions = this.value.split(',')
                  .map(CATMAID.tools.trimString)
                  .map(Number);
                CATMAID.Client.Settings
                  .set('table_page_length_options', newOptions, SETTINGS_SCOPE)
                  .catch(function(e) {
                    CATMAID.msg("Warning: invalid value", e.message ? e.message : e);
                  });
              }),
          CATMAID.Client.Settings,
          'table_page_length_options',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Save widget state when widgets are closed',
              CATMAID.Client.Settings[SETTINGS_SCOPE].auto_widget_state_save,
              null,
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].auto_widget_state_save = this.checked;
              }),
          CATMAID.Client.Settings,
          'auto_widget_state_save',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Load widget state when widgets are opened',
              CATMAID.Client.Settings[SETTINGS_SCOPE].auto_widget_state_load,
              'Some widgets support saving and loading state information like ' +
              'their settings. If saving and/or loading are enabled, those ' +
              'widgets will automatically save their state when closed and ' +
              'load it when they are started, respectively.',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].auto_widget_state_load = this.checked;
              }),
          CATMAID.Client.Settings,
          'auto_widget_state_load',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Ask for confirmation before closing project',
              CATMAID.Client.Settings[SETTINGS_SCOPE].confirm_project_closing,
              'To prevent accidental loss of the current window configuration, ' +
              'CATMAID can ask for confirmation before closing a project.',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].confirm_project_closing = this.checked;
              }),
          CATMAID.Client.Settings,
          'confirm_project_closing',
          SETTINGS_SCOPE));
    };

    /**
     * Adds TileLayer settings to the given container.
     */
    var addTileLayerSettings = function(container)
    {
      var ds = CATMAID.DOM.addSettingsContainer(container, "Stack view");

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Invert mouse wheel",
              CATMAID.Navigator.Settings[SETTINGS_SCOPE].invert_mouse_wheel,
              null,
              function() {
                CATMAID.Navigator.Settings[SETTINGS_SCOPE].invert_mouse_wheel = this.checked;
              }),
          CATMAID.Navigator.Settings,
          'invert_mouse_wheel',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Display reference lines",
              CATMAID.StackViewer.Settings[SETTINGS_SCOPE].display_stack_reference_lines,
              "Show a faint horizontal and vertical line that meet at the " +
              "current view's center.",
              function() {
                CATMAID.StackViewer.Settings
                    .set(
                      'display_stack_reference_lines',
                      this.checked,
                      SETTINGS_SCOPE)
                    .then(function () {
                      project.getStackViewers().forEach(function(s) {
                        s.showReferenceLines(CATMAID.StackViewer.Settings.session.display_stack_reference_lines);
                      });
                    });
              }),
          CATMAID.StackViewer.Settings,
          'display_stack_reference_lines',
          SETTINGS_SCOPE));

      // Cursor following zoom
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Use cursor following zoom",
              CATMAID.Navigator.Settings[SETTINGS_SCOPE].use_cursor_following_zoom,
              "Choose whether zooming follows the position of the cursor " +
              "(checked) or the center of the stack view (unchecked).",
              function() {
                CATMAID.Navigator.Settings[SETTINGS_SCOPE].use_cursor_following_zoom = this.checked;
              }),
          CATMAID.Navigator.Settings,
          'use_cursor_following_zoom',
          SETTINGS_SCOPE));

      // WebGL tile layers
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Prefer WebGL Layers",
              CATMAID.TileLayer.Settings[SETTINGS_SCOPE].prefer_webgl,
              'Choose whether to use WebGL or Canvas tile layer rendering when ' +
              'supported by your tile source and browser. Note that your tile ' +
              'source server may need to be <a href="http://enable-cors.org/">' +
              'configured to enable use in WebGL</a>. (Note: you must reload ' +
              'the page for this setting to take effect.)',
              function() {
                CATMAID.TileLayer.Settings[SETTINGS_SCOPE].prefer_webgl = this.checked;
              }),
          CATMAID.TileLayer.Settings,
          'prefer_webgl',
          SETTINGS_SCOPE));

      // WebGL tile layers
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Skip broken sections of extra tile layers by default",
              CATMAID.StackViewer.Settings[SETTINGS_SCOPE].respect_broken_sections_new_stacks,
              'Choose whether layers added after the first one should be ' +
              'respected by default when checking for broken sections during ' +
              'navigation.',
              function() {
                CATMAID.StackViewer.Settings[SETTINGS_SCOPE].respect_broken_sections_new_stacks = this.checked;
              }),
          CATMAID.StackViewer.Settings,
          'respect_broken_sections_new_stacks',
          SETTINGS_SCOPE));

      // Major section step size
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createNumericInputSetting(
              "Major section step",
              CATMAID.Navigator.Settings[SETTINGS_SCOPE].major_section_step,
              1,
              "The number of sections to move when Shift is pressed while using " +
              "one of the movement keys or the mouse wheel.",
              function() {
                var newStep = parseInt(this.value, 10);
                CATMAID.Navigator.Settings
                    .set(
                      'major_section_step',
                      newStep,
                      SETTINGS_SCOPE);
              }),
          CATMAID.Navigator.Settings,
          'major_section_step',
          SETTINGS_SCOPE));

      // Tile interpolation
      var tileInterpolation = $('<select/>');
      var interpolationModes = [
        {name: 'Smoothly blur pixels (linear)', id: 'linear'},
        {name: 'Keep images pixelated (nearest)', id: 'nearest'}
      ];
      interpolationModes.forEach(function(o) {
        var selected = (o.id === (CATMAID.TileLayer.Settings[SETTINGS_SCOPE].linear_interpolation ? 'linear' : 'nearest'));
        this.append(new Option(o.name, o.id, selected, selected));
      }, tileInterpolation);

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createLabeledControl(
              'Image tile interpolation',
              tileInterpolation,
              'Choose how to interpolate pixel values when image tiles ' +
              'are magnified.'),
          CATMAID.TileLayer.Settings,
          'linear_interpolation',
          SETTINGS_SCOPE));
      tileInterpolation.on('change', function(e) {
        var interp = this.value === 'linear';
        CATMAID.TileLayer.Settings[SETTINGS_SCOPE].linear_interpolation = interp;
        project.getStackViewers().forEach(function (stackViewer) {
          stackViewer.getLayers().forEach(function (layer) {
            if (layer instanceof CATMAID.TileLayer) {
              layer.setInterpolationMode(interp);
            }
          });
        });
      });

      // Layer insertion strategy
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createSelectSetting(
              "Layer insertion strategy",
              {'Append': 'append',
               'Image data first': 'image-data-first'},
              "In what order new layers are added to a stack viewer.",
              function() {
                CATMAID.StackViewer.Settings
                    .set(
                      'layer_insertion_strategy',
                      this.value,
                      SETTINGS_SCOPE);
              },
              CATMAID.StackViewer.Settings[SETTINGS_SCOPE].layer_insertion_strategy),
          CATMAID.StackViewer.Settings,
          'layer_insertion_strategy',
          SETTINGS_SCOPE));
    };

    /*
     * Adds a grid settings to the given container.
     */
    var addGridSettings = function(container)
    {
      var ds = CATMAID.DOM.addSettingsContainer(container, "Grid overlay", true);
      // Grid cell dimensions and offset
      var gridCellWidth = CATMAID.DOM.createInputSetting("Grid width (nm)", 1000);
      var gridCellHeight = CATMAID.DOM.createInputSetting("Grid height (nm)", 1000);
      var gridCellXOffset = CATMAID.DOM.createInputSetting("X offset (nm)", 0);
      var gridCellYOffset = CATMAID.DOM.createInputSetting("Y offset (nm)", 0);
      var gridLineWidth = CATMAID.DOM.createInputSetting("Line width (px)", 1);
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
      $(ds).append(CATMAID.DOM.createCheckboxSetting("Show grid on open stacks", false, null,
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
      var ds = CATMAID.DOM.addSettingsContainer(container, "Annotations");
      // Add explanatory text
      ds.append($('<div/>').addClass('setting').append("Many widgets of " +
          "the tracing tool display neurons in one way or another. This " +
          "setting allows you to change the way neurons are named in these " +
          "widgets. Neurons are usually annotated and below you can choose " +
          "if and how these annotations should be used for labeling a neuron. " +
          "You can add different representations to a list of available " +
          "components, which are then formatted into a label for the neuron."));

      // Get all available options
      var namingOptions = CATMAID.NeuronNameService.getInstance().getOptions();
      // Add naming option select box
      var select = $('<select/>');
      namingOptions.forEach(function(o) {
        this.append(new Option(o.name, o.id));
      }, select);
      ds.append(CATMAID.DOM.createLabeledControl('Neuron label', select));

      // Neuron name service configuration
      var nameServiceInstance = CATMAID.NeuronNameService.getInstance();
      if (SETTINGS_SCOPE !== 'session') {
        // Create a dummy neuron name service instance to manage settings
        // at scopes other than session.
        nameServiceInstance = CATMAID.NeuronNameService.newInstance(true);
        nameServiceInstance.loadConfigurationFromSettings(SETTINGS_SCOPE, true);
      }

      var persistComponentList = function () {
        CATMAID.NeuronNameService.Settings
            .set(
              'component_list',
              nameServiceInstance.getComponentList(),
              SETTINGS_SCOPE)
            .then(function () {
                  CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                });
          };
      var componentList = $('<select/>').addClass('multiline').attr('size', '4')[0];
      var addButton = $('<button/>').text('Add label component').click(function() {
        var newLabel = select.val();
        // The function to be called to actually add the label
        var addLabeling = function(metaAnnotation) {
          if (metaAnnotation) {
            nameServiceInstance.addLabeling(newLabel, metaAnnotation);
          } else {
            nameServiceInstance.addLabeling(newLabel);
          }
          persistComponentList();
          updateComponentList();
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
      var removeButton = $('<button/>').text('Remove label component').click(function() {
        // The last element cannot be removed
        if (componentList.selectedIndex < componentList.length - 1) {
          // We display the component list reversed, therefore we need to mirror
          // the index.
          nameServiceInstance.removeLabeling(componentList.length - componentList.selectedIndex - 1);
          persistComponentList();
          updateComponentList();
        }
      });
      ds.append(CATMAID.DOM.createLabeledControl('', addButton));
      // A container is necessary since this component may complete asynchronously.
      var nnsAsyncContainer = $('<div/>');
      ds.append(nnsAsyncContainer);
      CATMAID.NeuronNameService.Settings
          .load()
          .then(function () {
            nnsAsyncContainer.append(wrapSettingsControl(
                CATMAID.DOM.createLabeledControl('', componentList),
                CATMAID.NeuronNameService.Settings,
                'component_list',
                SETTINGS_SCOPE,
                function () {
                  return CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                }));
          });
      ds.append(CATMAID.DOM.createLabeledControl('', removeButton));

      var updateComponentList = function() {
        $(componentList).empty();
        var options = nameServiceInstance.getComponentList().map(function(o, i) {
          // Add each component list element to the select control. The last
          // element is disabled by default.
          var optionElement = $('<option/>').attr('value', o.id)
              .text(i + ': ' + o.name);
          if (i === 0) {
            optionElement.attr('disabled', 'disabled');
          }
          return optionElement[0];
        });
        // We want to display the last component list element first, so we need
        // to reverse the options, before we add it.
        options.reverse();
        options.forEach(function(o) {
          componentList.appendChild(o);
        });
      };
      // Initialize component list
      updateComponentList();

      nnsAsyncContainer = $('<div/>');
      ds.append(nnsAsyncContainer);
      CATMAID.NeuronNameService.Settings
          .load()
          .then(function () {
            nnsAsyncContainer.append(wrapSettingsControl(
                CATMAID.DOM.createInputSetting(
                    "Formatted neuron name",
                    nameServiceInstance.getFormatString(),
                    "Format the neuron label using label components from list above. " +
                    "Reference the Nth component by using \"%N\". " +
                    "Use \"%f\" for a fallback that uses first available component " +
                    "from the top. Optionally, append \"{<em>delimiter</em>}\" to specify " +
                    "how component values should be separated, defaulting to \"{, }\".",
                    function () {
                      CATMAID.NeuronNameService.Settings
                        .set(
                          'format_string',
                          $(this).val(),
                          SETTINGS_SCOPE)
                        .then(function () {
                          CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                        });
                    }),
                CATMAID.NeuronNameService.Settings,
                'format_string',
                SETTINGS_SCOPE,
                function () {
                  return CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                }));

            nnsAsyncContainer.append(wrapSettingsControl(
                CATMAID.DOM.createCheckboxSetting(
                    'Auto-trim empty components',
                    nameServiceInstance.getAutoTrimEmpty(),
                    'If enabled, all spaces around undefined name components will be removed.',
                    function() {
                      CATMAID.NeuronNameService.Settings
                        .set(
                          'auto_trim_empty',
                          this.checked,
                          SETTINGS_SCOPE)
                        .then(function () {
                          CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                        });
                    }),
                CATMAID.NeuronNameService.Settings,
                'auto_trim_empty',
                SETTINGS_SCOPE,
                function() {
                  return CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                }));
          });

      // Overlay settings
      ds = CATMAID.DOM.addSettingsContainer(container, "Tracing Overlay");


      // Active node radius display.
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createSelectSetting(
              "Display node radii",
              {'Do not display': 'none',
               'Active node': 'active-node',
               'Active skeleton': 'active-skeleton',
               'All nodes': 'all'},
              "Show radii around these nodes. Note that showing radii for " +
              "many nodes will slow down the tracing overlay.",
              function() {
                SkeletonAnnotations.TracingOverlay.Settings
                    .set(
                      'display_node_radii',
                      this.value,
                      SETTINGS_SCOPE)
                    .then(function () {
                      project.getStackViewers().every(function(sv) {
                        var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
                        if (overlay) {
                          overlay.updateNodeRadiiVisibility();
                        }
                      });
                    });
              },
              SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].display_node_radii),
          SkeletonAnnotations.TracingOverlay.Settings,
          'display_node_radii',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Show extended status bar information',
              SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].extended_status_update,
              'If enabled, the status bar will not only show node type and ID ' +
              'when a node is selected. It will also show reviewer and time ' +
              'stamps, but needs to query the back-end to do this.',
              function() {
                SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].extended_status_update = this.checked;
              }),
          SkeletonAnnotations.TracingOverlay.Settings,
          'extended_status_update',
          SETTINGS_SCOPE));


      // Add explanatory text
      ds.append($('<div/>').addClass('setting').append("Choose how nodes, " +
          "edges, connectors, and labels are scaled in the tracing overlay. " +
          "This setting will persist " +
          "across sessions. (Note: changes to text labels, edges and arrows " +
          "will not appear correctly in the stack view until you zoom, switch " +
          "sections or pan.)"));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createRadioSetting(
              'overlay-scaling',
              [{id: 'overlay-scaling-screen', desc: 'Fixed screen size',
                checked: SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].screen_scaling},
               {id: 'overlay-scaling-stack', desc: 'Fixed stack size',
                checked: !SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].screen_scaling}],
              null,
              function () {
                SkeletonAnnotations.TracingOverlay.Settings
                    .set(
                      'screen_scaling',
                      this.value === 'overlay-scaling-screen',
                      SETTINGS_SCOPE)
                    .then(function () {
                      project.getStackViewers().forEach(function (s) {
                        SkeletonAnnotations.getTracingOverlay(s.getId()).redraw(true);
                      });
                    });
              }).addClass('setting'),
          SkeletonAnnotations.TracingOverlay.Settings,
          'screen_scaling',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createLabeledControl(
              $('<span>Size adjustment: <span id="overlay-scale-value">' +
                  (SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].scale*100).toFixed() +
                  '</span>%</span>'),
              $('<div id="overlay-scaling-slider" />').slider({
                  min: -2,
                  max: 2,
                  step: 0.1,
                  value: Math.log(SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].scale)/Math.LN2,
                  change: function (event, ui) {
                    SkeletonAnnotations.TracingOverlay.Settings
                        .set(
                          'scale',
                          Math.pow(2, ui.value),
                          SETTINGS_SCOPE)
                        .then(function () {
                          $('#overlay-scale-value').text((
                              SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].scale*100).toFixed());
                          project.getStackViewers().forEach(function (s) {
                            SkeletonAnnotations.getTracingOverlay(s.getId()).redraw(true);
                          });
                        });
                  }})),
          SkeletonAnnotations.TracingOverlay.Settings,
          'scale',
          SETTINGS_SCOPE));


      var dsNodeColors = CATMAID.DOM.addSettingsContainer(ds, "Skeleton colors", true);
      dsNodeColors.append(CATMAID.DOM.createCheckboxSetting(
          'Hide skeletons not in the skeleton source subscriptions',
          project.getStackViewers().every(function(sv) {
            var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
            return overlay && overlay.graphics.overlayGlobals.hideOtherSkeletons;
          }),
          'If checked, skeletons not present in the subscribed skeleton ' +
          'sources will not be displayed in the tracing overlay.',
          function () {
            var checked = this.checked;
            project.getStackViewers().forEach(function(sv) {
              var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
              if (overlay) {
                overlay.graphics.overlayGlobals.hideOtherSkeletons = checked;
                overlay.redraw(true);
              }
            });
          }));

      // Node color settings: Title vs. SkeletonAnnotations field.
      var colors = new Map([
        ['Active node', 'active_node_color'],
        ['Active virtual node', 'active_virtual_node_color'],
        ['Active suppressed virtual node', 'active_suppressed_virtual_node_color'],
        ['Active skeleton', 'active_skeleton_color'],
        ['Inactive skeleton', 'inactive_skeleton_color'],
        ['Active skeleton virtual node/edge', 'active_skeleton_color_virtual'],
        ['Inactive skeleton virtual node/edge', 'inactive_skeleton_color_virtual'],
        ['Inactive upstream edge', 'inactive_skeleton_color_above'],
        ['Inactive downstream edge', 'inactive_skeleton_color_below'],
        ['Root node', 'root_node_color'],
        ['Leaf node', 'leaf_node_color'],
      ]);

      var updateTracingColors = function () {
        // Update all tracing layers
        project.getStackViewers().forEach(function(sv) {
          var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
          if (overlay) overlay.recolorAllNodes();
        });
      };
      var setColorOfTracingFields = function() {
        colors.forEach(function(field, label) {
          var input = colorControls.get(field);
          var color = $(input).find('input').val();
          color = new THREE.Color(color).getHex();
          SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE][field] = color;
        });
        updateTracingColors();
      };

      var hexColorToStr = function(hex) {
        return new THREE.Color(hex).getStyle();
      };

      var colorControls = new Map();
      colors.forEach(function(field, label) {
        var color = new THREE.Color(SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE][field]);
        var input = CATMAID.DOM.createInputSetting(label, color.getStyle());
        this.append(wrapSettingsControl(input,
                                        SkeletonAnnotations.TracingOverlay.Settings,
                                        field,
                                        SETTINGS_SCOPE,
                                        updateTracingColors,
                                        hexColorToStr));
        var colorField = $(input).find('input');
        CATMAID.ColorPicker.enable(colorField, {
          initialColor: color.getHex(),
          onColorChange: setColorOfTracingFields
        });
        colorControls.set(field, input);
      }, dsNodeColors);

      // Allow color confirmation with enter
      dsNodeColors.find('input').on('keyup', function(e) {
        if ('Enter' === e.key) {
          setColorOfTracingFields();
        }
      });


      var dsSkeletonProjection = CATMAID.DOM.addSettingsContainer(ds,
          "Skeleton projection layer", true);

      // Figure out if all displayed stack viewers have a skeleton projection
      // layer
      var allHaveLayers = project.getStackViewers().every(function(sv) {
        return !!sv.getLayer('skeletonprojection');
      });

      var skpVisible = CATMAID.DOM.createCheckboxSetting("Display projections",
          allHaveLayers, "Activating this layer adds upstream and downstream " +
          "projections of the active skeleton to the tracing display.",
          updateSkeletonProjectionDisplay);
      dsSkeletonProjection.append(skpVisible);

      var skpSource = $(CATMAID.skeletonListSources.createUnboundSelect(
          'Skeleton projection layer'));
      var currentSource = CATMAID.SkeletonProjectionLayer.options.source ||
        SkeletonAnnotations.activeSkeleton;
      skpSource.val(currentSource.getName());
      skpSource.on('change', updateSkeletonProjectionDisplay);
      dsSkeletonProjection.append(CATMAID.DOM.createLabeledControl('Source', skpSource));

      var skpShading = $('<select/>');
      var skpShadingOptions = [
        {name: 'Plain color', id: 'plain'},
        {name: 'Skeleton color gradient', id: 'skeletoncolorgradient'},
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

      dsSkeletonProjection.append(CATMAID.DOM.createLabeledControl(
            'Shading', skpShading));

      // Set default properties
      var skpPreferSourceColor = CATMAID.DOM.createCheckboxSetting("Use source color",
          CATMAID.SkeletonProjectionLayer.options.preferSourceColor, null,
          updateSkeletonProjectionDisplay);
      var skpDownstreamColor = CATMAID.DOM.createInputSetting("Downstream color",
          new THREE.Color(CATMAID.SkeletonProjectionLayer.options.downstreamColor).getStyle());
      var skpUpstreamColor = CATMAID.DOM.createInputSetting("Upstream color",
          new THREE.Color(CATMAID.SkeletonProjectionLayer.options.upstreamColor).getStyle());
      var skpShowEdges = CATMAID.DOM.createCheckboxSetting("Show edges",
          CATMAID.SkeletonProjectionLayer.options.showEdges, null,
          updateSkeletonProjectionDisplay);
      var skpShowNodes = CATMAID.DOM.createCheckboxSetting("Show nodes",
          CATMAID.SkeletonProjectionLayer.options.showNodes, null,
          updateSkeletonProjectionDisplay);
      var skpMinStrahler = CATMAID.DOM.createInputSetting("Min. Strahler",
          CATMAID.SkeletonProjectionLayer.options.strahlerShadingMin);
      var skpMaxStrahler = CATMAID.DOM.createInputSetting("Max. Strahler",
          CATMAID.SkeletonProjectionLayer.options.strahlerShadingMax,
          "For Strahler based shading, the relative min and max Strahler " +
          "number can be set. These numbers are relative to the active Node. " +
          "Nodes not in this range won't be shown. -1 deactivates a condition.");
      var skpDistanceFalloff = CATMAID.DOM.createInputSetting("Distance falloff",
          CATMAID.SkeletonProjectionLayer.options.distanceFalloff,
          "For distance based shading, a fall-off can be set, by which " +
          "opacity is reduced with every layer");

      dsSkeletonProjection.append(skpPreferSourceColor);
      dsSkeletonProjection.append(skpDownstreamColor);
      dsSkeletonProjection.append(skpUpstreamColor);
      dsSkeletonProjection.append(skpShowEdges);
      dsSkeletonProjection.append(skpShowNodes);
      dsSkeletonProjection.append(skpMinStrahler);
      dsSkeletonProjection.append(skpMaxStrahler);
      dsSkeletonProjection.append(skpDistanceFalloff);

      // Add color picker to input fields
      [skpDownstreamColor, skpUpstreamColor].forEach(function(colorOption) {
        var colorField = $(colorOption).find('input');
        CATMAID.ColorPicker.enable(colorField, {
          initialColor: colorField.val(),
          onColorChange: updateSkeletonProjectionDisplay
        });
      });

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
          if ('Enter' === e.key) updateSkeletonProjectionDisplay();
        });

      // Get all relevant skeleton projection options
      function getSkeletonProjectionOptions() {
        return {
          "visible": skpVisible.find('input').prop('checked'),
          "shadingMode": skpShading.val(),
          "downstreamColor": new THREE.Color(skpDownstreamColor.find('input').val()).getHex(),
          "upstreamColor": new THREE.Color(skpUpstreamColor.find('input').val()).getHex(),
          "showEdges": skpShowEdges.find('input').prop('checked'),
          "showNodes": skpShowNodes.find('input').prop('checked'),
          "strahlerShadingMin": skpMinStrahler.find('input').val(),
          "strahlerShadingMax": skpMaxStrahler.find('input').val(),
          "distanceFalloff": skpDistanceFalloff.find('input').val(),
          "source": CATMAID.skeletonListSources.getSource(skpSource.val())
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


      var dsVisibilityGroups = CATMAID.DOM.addSettingsContainer(ds,
          "Visibility groups", true);
      var dsVisibilityGroupsRadioWrapper = $('<div />').addClass('setting');
      var visibilityGroups = [{
          name: 'Hidden group 1',
          description: 'Toggle visibility of this group with <kbd>HOME</kbd>',
          id: SkeletonAnnotations.VisibilityGroups.GROUP_IDS.GROUP_1,
        },{
          name: 'Hidden group 2',
          description: 'Toggle visibility of this group with <kbs>SHIFT</kbd>+<kbd>HOME</kbd>',
          id: SkeletonAnnotations.VisibilityGroups.GROUP_IDS.GROUP_2,
        },{
          name: 'Always visible',
          description: 'Skeletons in this group are always visible, ' +
                       'even if they are also in hidden groups.',
          id: SkeletonAnnotations.VisibilityGroups.GROUP_IDS.OVERRIDE,
        }];
      var updateVisibilityGroup = function (groupID) {
        var radioValue = $('input[type="radio"][name="visibility-group-' + groupID + '"]:checked').val();
        var groupSetting = {};
        switch (radioValue.split('-').slice(-1)[0]) {
          case 'universal':
            groupSetting.universal = $('#visibility-group-' + groupID + '-value-0').val();
            break;
          case 'annotation':
            groupSetting.metaAnnotationName = $('#visibility-group-' + groupID + '-value-1').val();
            break;
          case 'creator':
            var creatorValue = $('#visibility-group-' + groupID + '-value-2').val();
            groupSetting.creatorID = parseInt(creatorValue, 10);
            break;
        }

        var settingsCopy = SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].visibility_groups;
        settingsCopy = $.extend([], settingsCopy);
        settingsCopy[groupID] = groupSetting;
        SkeletonAnnotations.TracingOverlay.Settings
            .set(
              'visibility_groups',
              settingsCopy,
              SETTINGS_SCOPE)
            .then(function () {
              SkeletonAnnotations.VisibilityGroups.setGroup(
                  groupID,
                  SkeletonAnnotations.TracingOverlay.Settings.session.visibility_groups[groupID]);

              // Redraw all overlays
              project.getStackViewers().forEach(function(sv) {
                var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
                if (overlay) {
                  overlay.redraw(true);
                }
              });
            });
      };

      visibilityGroups.forEach(function (group) {
        var scopedSettings = SkeletonAnnotations.TracingOverlay.Settings[SETTINGS_SCOPE].visibility_groups[group.id];

        var groupRadioControl = CATMAID.DOM.createRadioSetting(
              'visibility-group-' + group.id,
              [{
                id: 'visibility-group-' + group.id + '-universal',
                desc: 'Universal match',
                checked: scopedSettings.hasOwnProperty('universal')
              },{
                id: 'visibility-group-' + group.id + '-meta-annotation',
                desc: 'Match meta-annotation',
                checked: scopedSettings.hasOwnProperty('metaAnnotationName')
              },{
                id: 'visibility-group-' + group.id + '-creator',
                desc: 'Match by creator',
                checked: scopedSettings.hasOwnProperty('creatorID')
              }],
              null,
              function () {
                updateVisibilityGroup(group.id);
              }).addClass('setting');

        groupRadioControl.children().each(function (i, radio) {
          var select;
          var checkRadioOnChange = function (name) {
            return function () {
              $('#visibility-group-' + group.id + '-' + name)
                  .prop('checked', true)
                  .trigger('change');
            };
          };
          switch (i) {
            case 0:
              var selected = scopedSettings.hasOwnProperty('universal') ?
                scopedSettings.universal : 'none';
              select = CATMAID.DOM.createSelectSetting(
                    '',
                    {'All skeletons': 'all', 'No skeletons': 'none'},
                    null,
                    checkRadioOnChange('universal'),
                    selected);
              select = select.children('label').children('select');
              break;
            case 1:
              var selected = scopedSettings.hasOwnProperty('metaAnnotationName') ?
                scopedSettings.metaAnnotationName : null;
              select = $('<input/>').attr('type', 'text')
                  .addClass("ui-corner-all").val(selected);
              select.change(checkRadioOnChange('meta-annotation'));
              select.autocomplete({
                source: CATMAID.annotations.getAllNames(),
                change: checkRadioOnChange('meta-annotation')
              });
              break;
            case 2:
              var selected = scopedSettings.hasOwnProperty('creatorID') ?
                scopedSettings.creatorID : null;
              var users = CATMAID.User.all();
              users = Object.keys(users)
                  .map(function (userID) { return users[userID]; })
                  .sort(CATMAID.User.displayNameCompare)
                  .reduce(function (o, user) {
                    o[user.getDisplayName()] = user.id;
                    return o;
                  }, {});
              select = CATMAID.DOM.createSelectSetting(
                    '',
                    users,
                    null,
                    checkRadioOnChange('creator'),
                    selected);
              select = select.children('label').children('select');
              break;
          }

          select.attr('id', 'visibility-group-' + group.id + '-value-' + i);
          $(radio).append(select);
        });

        groupRadioControl.prepend($('<p/>')
              .addClass('help')
              .append(group.description));
        groupRadioControl.prepend($('<h4/>').append(group.name));

        dsVisibilityGroupsRadioWrapper.append(groupRadioControl);
      });

      dsVisibilityGroups.append(wrapSettingsControl(
          dsVisibilityGroupsRadioWrapper,
          SkeletonAnnotations.TracingOverlay.Settings,
          'visibility_groups',
          SETTINGS_SCOPE,
          function () {
            SkeletonAnnotations.TracingOverlay.Settings.session.visibility_groups.forEach(function (group, i) {
              SkeletonAnnotations.VisibilityGroups.setGroup(i, group);
            });

            project.getStackViewers().forEach(function(sv) {
              var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
              if (overlay) {
                overlay.redraw(true);
              }
            });
          }));


      // Reviewer whitelist settings
      ds = CATMAID.DOM.addSettingsContainer(container, "Reviewer Team");
      // Add explanatory text
      ds.append($('<div/>').addClass('setting').append("Choose which users' " +
          "reviews to include when calculating review statistics. You may also " +
          "specify a time after which to include each user's reviews. Reviews " +
          "by that user prior to this time are ignored. Your team is private; " +
          "reviewers are not informed whether you have added them to your team."));

      // Get all available users
      var users = CATMAID.User.all();
      var reviewers = Object.keys(users).map(function (userId) { return users[userId]; });
      // Add reviewer options to select box
      var reviewerSelect = $('<select/>');
      reviewers.sort(CATMAID.User.displayNameCompare).forEach(function (user) {
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

      ds.append(CATMAID.DOM.createLabeledControl('Reviewer', reviewerSelect));
      ds.append(CATMAID.DOM.createLabeledControl('Accept after', acceptAfterInput));
      ds.append(CATMAID.DOM.createLabeledControl('', addReviewerButton));
      ds.append(CATMAID.DOM.createLabeledControl('', whitelist));
      ds.append(CATMAID.DOM.createLabeledControl('', removeReviewerButton));

      var refreshWhitelist = function () {
        $(whitelist).empty();
        var wlEntries = CATMAID.ReviewSystem.Whitelist.getWhitelist();
        var options = Object.keys(wlEntries).map(function(userId) {
          var user = CATMAID.User.safe_get(userId);
          var optionElement = $('<option/>')
              .attr('value', userId)
              .text(user.getDisplayName() + ' (' + wlEntries[userId].toDateString() + ')');
          return optionElement[0];
        });

        options.sort(function (a, b) {
            return CATMAID.User.displayNameCompare(users[a.value], users[b.value]); });

        options.forEach(whitelist.appendChild.bind(whitelist));
      };

      // Initialize whitelist
      refreshWhitelist();

      // Tracing settings
      ds = CATMAID.DOM.addSettingsContainer(container, "Tracing");
      ds.append(CATMAID.DOM.createCheckboxSetting("Edit radius after node creation",
        SkeletonAnnotations.setRadiusAfterNodeCreation, "The visual radius " +
        "editing tool will be shown right after a node has been created.",
        function() {
          SkeletonAnnotations.setRadiusAfterNodeCreation = this.checked;
        }));
      ds.append(CATMAID.DOM.createCheckboxSetting("Use connector type created last as new default",
        SkeletonAnnotations.useNewConnectorTypeAsDefault,
        "If enabled, the type of newly created connectors (synaptic, abutting, " +
        "gap-junction) will be used as new default. This default is used with " +
        "regular Shift+Click",
        function() {
          SkeletonAnnotations.useNewConnectorTypeAsDefault = this.checked;
        }));

      var connectorTypesPlaceholder = document.createElement('div');
      ds.append(connectorTypesPlaceholder);
      CATMAID.Connectors.connectorTypes(project.id)
        .then(function(connectorTypes) {
          var items = connectorTypes.reduce(function(o, e) {
            o[e.name] = e.type;
            return o;
          }, {});
          var typeSelect = CATMAID.DOM.createSelectSetting(
              "Default connector type", items,
              "Select the connector type created by default.",
              function() {
                SkeletonAnnotations.newConnectorType = this.value;
              },
              SkeletonAnnotations.newConnectorType);

          $(connectorTypesPlaceholder).replaceWith(typeSelect);
      });


      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Invert behavior of modifier key to ignore/respect virtual nodes",
              CATMAID.TracingTool.Settings[SETTINGS_SCOPE].invert_virtual_node_ignore_modifier,
              "When navigating parent/child topology with " +
              "<kbd>[</kbd>/<kbd>]</kbd>, invert the behavior of holding " +
              "<kbd>CTRL</kbd>.",
              function() {
                CATMAID.TracingTool.Settings
                    .set(
                      'invert_virtual_node_ignore_modifier',
                      this.checked,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingTool.Settings,
          'invert_virtual_node_ignore_modifier',
          SETTINGS_SCOPE));
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Respect suppressed virtual nodes during navigation",
              SkeletonAnnotations.Settings[SETTINGS_SCOPE].skip_suppressed_virtual_nodes,
              "When navigating parent/child topology, skip virtual nodes " +
              "that have been marked as suppressed. This has a marginal " +
              "impact on performance. Suppressed virtual nodes are always " +
              "respected during review.",
              function() {
                SkeletonAnnotations.Settings
                    .set(
                      'skip_suppressed_virtual_nodes',
                      this.checked,
                      SETTINGS_SCOPE);
              }),
          SkeletonAnnotations.Settings,
          'skip_suppressed_virtual_nodes',
          SETTINGS_SCOPE));
      ds.append($('<div/>').addClass('setting').text());
      ds.append(CATMAID.DOM.createInputSetting("Default new neuron name",
          SkeletonAnnotations.defaultNewNeuronName,
          "Every occurrence of '{nX}' in the default name with X being a " +
          "number is replaced by a number that is automatically incremented " +
          "(starting from X) to the smallest unique value in the project.",
          function () {
            SkeletonAnnotations.defaultNewNeuronName = $(this).val();
          }));
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Personal tag set",
              SkeletonAnnotations.Settings[SETTINGS_SCOPE].personal_tag_set.join(', '),
              "This comma separated list of tags represents a common set of " +
              "tags that can be applied in one go to a node.",
              function() {
                SkeletonAnnotations.Settings
                    .set(
                      'personal_tag_set',
                      this.value.split(',').map(function(t) {
                        return t.trim();
                      }),
                      SETTINGS_SCOPE);
              }),
          SkeletonAnnotations.Settings,
          'personal_tag_set',
          SETTINGS_SCOPE));

      ds.append(CATMAID.DOM.createCheckboxSetting("Merge annotations of " +
        "single-node skeletons without asking",
        SkeletonAnnotations.quickSingleNodeSkeletonMerge, "If true, no merge dialog " +
        "will be shown for single-node skeletons with annotations. Instead, all " +
        "annotations will be merged without asking.",
        function() {
          SkeletonAnnotations.quickSingleNodeSkeletonMerge = this.checked;
        }));

      var autoAnnotationChange = function() {
          var annotationName = this.value;
          SkeletonAnnotations.Settings
              .set(
                'auto_annotations',
                annotationName ? [{annotationNames: [annotationName]}] : [],
                SETTINGS_SCOPE)
              .then(function () {
                SkeletonAnnotations.AutoAnnotator.loadFromSettings();
              });
        };
      var autoAnnotationName = SkeletonAnnotations.Settings[SETTINGS_SCOPE].auto_annotations;
      autoAnnotationName = autoAnnotationName.length > 0 ?
          autoAnnotationName[0].annotationNames :
          '';
      var autoAnnotationInput = CATMAID.DOM.createInputSetting(
              "Auto-annotate changed skeletons",
              autoAnnotationName,
              "Any skeletons you create, split, join or extend will be " +
              "automatically annotated with the annotation entered here. " +
              "Leave blank to not auto-annotate.",
              autoAnnotationChange);
      ds.append(wrapSettingsControl(
          autoAnnotationInput,
          SkeletonAnnotations.Settings,
          'auto_annotations',
          SETTINGS_SCOPE));
      $(autoAnnotationInput).find('input[type=text]').autocomplete({
        source: CATMAID.annotations.getAllNames(),
        change: autoAnnotationChange,
      });

      // Auto-select skeleton source created last
      ds.append(CATMAID.DOM.createCheckboxSetting('Auto-select widget created last as source ' +
            'for new widgets', CATMAID.skeletonListSources.defaultSelectLastSource,
            'Many widget support pulling in skeletons from other widgets. With ' +
            'this option the skeleton source created last, is selected by ' +
            'default, otherwise the active skeleton is.', function() {
              CATMAID.skeletonListSources.defaultSelectLastSource = this.checked;
            }));

      // Review status coloring
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting('Use detailed review color status',
              CATMAID.ReviewSystem.Settings[SETTINGS_SCOPE].detailed_review_colors,
              'If true, review status is displayed in nine different colors between ' +
              'the regular 0% and 100% colors.', function() {
                  CATMAID.ReviewSystem.Settings
                      .set('detailed_review_colors', this.checked, SETTINGS_SCOPE);
              }),
          CATMAID.ReviewSystem.Settings,
          'detailed_review_colors',
          SETTINGS_SCOPE));

      var dsTracingWarnings = CATMAID.DOM.addSettingsContainer(ds,
          "Warnings", true);

      var twVolumeSelect = CATMAID.DOM.createSelectSetting("New nodes not in " +
          "volume", {"None": "none"}, "A warning will be shown when new " +
          "nodes are created outside of the selected volume", function(e) {
            var volumeID = null;

            // Add new handler if, needed
            if (-1 !== this.selectedIndex) {
              var o = this.options[this.selectedIndex];
              if ("none" !== o.value) {
                volumeID = o.value;
              }
            }

            // Remove existing handler and new one if selected
            SkeletonAnnotations.setNewNodeVolumeWarning(volumeID);
          });
      dsTracingWarnings.append(twVolumeSelect);

      // Get volumes
      CATMAID.fetch(project.id + "/volumes/")
        .then(function(json) {
          var currentWarningVolumeID = SkeletonAnnotations.getNewNodeVolumeWarning();
          var select = twVolumeSelect.find("select")[0];
          json.forEach(function(volume) {
            var name = volume.name + " (#" + volume.id + ")";
            var selected = currentWarningVolumeID == volume.id ? true : undefined;
            select.options.add(new Option(name, volume.id, selected, selected));
          });
        })
        .catch(CATMAID.handleError);
    };


    var SETTINGS_SCOPE = 'session';

    var refresh = (function () {
      $(space).empty();

      addSettingsScopeSelect(space);

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
    }).bind(this);

    refresh();
  };

  CATMAID.SettingsWidget = SettingsWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'settings',
    creator: SettingsWidget
  });

})(CATMAID);
