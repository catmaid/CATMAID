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

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Project closes with last stack viewer",
              CATMAID.Client.Settings[SETTINGS_SCOPE].last_stack_viewer_closes_project,
              'If the last stack viewer is closed, the project will be closed as well. This ' +
              'causes the destruction of all open widgets.',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].last_stack_viewer_closes_project = this.checked;
              }),
          CATMAID.Client.Settings,
          'last_stack_viewer_closes_project',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Transfer data in binary mode when possible',
              CATMAID.Client.Settings[SETTINGS_SCOPE].binary_data_transfer,
              'Using a binary transfer mode can speed up data loading slightly',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].binary_data_transfer = this.checked;
              }),
          CATMAID.Client.Settings,
          'binary_data_transfer',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Show context help',
              CATMAID.Client.Settings[SETTINGS_SCOPE].context_help_visibility,
              'Show a context aware help window.',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].context_help_visibility = this.checked;
              }),
          CATMAID.Client.Settings,
          'binary_data_transfer',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Save exported files in streaming mode (e.g. videos, CSVs, images)',
              CATMAID.Client.Settings[SETTINGS_SCOPE].use_file_export_streams,
              'Using streams allows the export of larger files, but the export/save dialog behaves slightly different. Make sure "Ask where to save each file before downloading" is enabled in the browser settings.',
              function() {
                CATMAID.Client.Settings[SETTINGS_SCOPE].use_file_export_streams = this.checked;
              }),
          CATMAID.Client.Settings,
          'use_file_export_streams',
          SETTINGS_SCOPE));
    };

    /**
     * Adds StackLayer settings to the given container.
     */
    var addStackLayerSettings = function(container)
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
              CATMAID.StackLayer.Settings[SETTINGS_SCOPE].prefer_webgl,
              'Choose whether to use WebGL or Canvas tile layer rendering when ' +
              'supported by your tile source and browser. Note that your tile ' +
              'source server may need to be <a href="http://enable-cors.org/">' +
              'configured to enable use in WebGL</a>. (Note: you must reload ' +
              'the page for this setting to take effect.)',
              function() {
                CATMAID.StackLayer.Settings[SETTINGS_SCOPE].prefer_webgl = this.checked;
              }),
          CATMAID.StackLayer.Settings,
          'prefer_webgl',
          SETTINGS_SCOPE));

      // Hide layers if nearest section is broken
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Hide layers if nearest section broken",
              CATMAID.StackLayer.Settings[SETTINGS_SCOPE].hide_if_nearest_section_broken,
              'Whether to hide tile layers by default if the nearest section ' +
              'is marked as broken, rather than displaying the nearest non-broken ' +
              'section. This can be adjusted for each individual layer.',
              function() {
                CATMAID.StackLayer.Settings[SETTINGS_SCOPE].hide_if_nearest_section_broken = this.checked;
              }),
          CATMAID.StackLayer.Settings,
          'hide_if_nearest_section_broken',
          SETTINGS_SCOPE));

      // Skip broken sections of extra tile layers
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

      // Animated section changing
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Animate section change by default",
              CATMAID.Navigator.Settings[SETTINGS_SCOPE].animate_section_change,
              'If enabled, inverts the behavior of the <kbd>Ctrl</kbd> ' +
              'modifier when changing the section with <kbd>,</kbd> and ' +
              '<kbd>.</kbd> so the default is to smoothly animate, waiting ' +
              'on all layers to render. Default behavior is still available ' +
              'with <kbd>Ctrl</kbd>.',
              function() {
                CATMAID.Navigator.Settings[SETTINGS_SCOPE].animate_section_change = this.checked;
              }),
          CATMAID.Navigator.Settings,
          'animate_section_change',
          SETTINGS_SCOPE));

      // Max FPS
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createNumericInputSetting(
              "Max frames per second",
              CATMAID.Navigator.Settings[SETTINGS_SCOPE].max_fps,
              1,
              "The maximum number of frames that should be computed per second. " +
              "Controls rendering update speed limit, useful e.g. when quickly " +
              "browsing image data with Ctrl + , or Ctrl + . or similar shortcuts.",
              function() {
                var newMaxFps = parseFloat(this.value);
                CATMAID.Navigator.Settings
                    .set(
                      'max_fps',
                      newMaxFps,
                      SETTINGS_SCOPE);
              }),
          CATMAID.Navigator.Settings,
          'max_fps',
          SETTINGS_SCOPE));

      // Tile interpolation
      var tileInterpolation = $('<select/>');
      var interpolationModes = [
        {name: 'Smoothly blur pixels (linear)', id: CATMAID.StackLayer.INTERPOLATION_MODES.LINEAR},
        {name: 'Keep images pixelated (nearest)', id: CATMAID.StackLayer.INTERPOLATION_MODES.NEAREST}
      ];
      let setInterpolation = CATMAID.StackLayer.Settings[SETTINGS_SCOPE].linear_interpolation ?
          CATMAID.StackLayer.INTERPOLATION_MODES.LINEAR :
          CATMAID.StackLayer.INTERPOLATION_MODES.NEAREST;
      interpolationModes.forEach(function(o) {
        var selected = (o.id === setInterpolation);
        this.append(new Option(o.name, o.id, selected, selected));
      }, tileInterpolation);

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createLabeledControl(
              'Image tile interpolation',
              tileInterpolation,
              'Choose how to interpolate pixel values when image tiles ' +
              'are magnified.'),
          CATMAID.StackLayer.Settings,
          'linear_interpolation',
          SETTINGS_SCOPE));
      tileInterpolation.on('change', function(e) {
        var interp = this.value === 'linear';
        CATMAID.StackLayer.Settings.set(
              'linear_interpolation',
              interp,
              SETTINGS_SCOPE)
           .then(function() {
              project.getStackViewers().forEach(function (stackViewer) {
                stackViewer.getLayers().forEach(function (layer) {
                  if (layer instanceof CATMAID.StackLayer) {
                    layer.refreshInterpolationMode();
                  }
                });
              });
           })
           .catch(CATMAID.handleError);
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

      // Default layouts
      var defaultLayoutInput = CATMAID.DOM.createInputSetting(
          "Default layouts",
          CATMAID.Layout.Settings[SETTINGS_SCOPE].default_layouts.join(', '),
          "A list of default layouts of which the first one matched will be " +
          "applied. Use v(a,b) and h(a,b) for vertical and horizontal splits, " +
          "o(a) for optional windows, where a and b can each be other v() or " +
          "h() nodes, one of [XY, XZ, ZY, F1, X3D] or any widget handle (see " +
          "<kbd>Ctrl</kbd> + <kbd>Space</kbd>). At the moment, with o(a), " +
          "\"a\" can't be XY, XZ or ZY. Use X3D to reference the 3D Viewer.",
          function() {
            let defaultLayouts = CATMAID.Layout.parseLayoutSpecList(this.value);
            CATMAID.Layout.Settings
                .set(
                  'default_layouts',
                  defaultLayouts,
                  SETTINGS_SCOPE);
          });
      $('input', defaultLayoutInput)
        .css('width', '30em')
        .css('font-family', 'monospace');

      ds.append(wrapSettingsControl(
          defaultLayoutInput,
          CATMAID.Layout.Settings,
          'default_layouts',
          SETTINGS_SCOPE));

      // User layouts
      var userLayoutInput = CATMAID.DOM.createTextAreaSetting(
          "Custom layouts",
          CATMAID.Layout.Settings[SETTINGS_SCOPE].user_layouts.join(',\n'),
          "A list of custom layouts that will be be available from the " +
          "layouts menu. The configuration is the same as for the default " +
          "layout, but each entry has to be wrapped in a layout() function " +
          "to provide an alias for the layout. For instance, an entry named " +
          "\"My layout\" with a 3D Viewer split screen woulf look like this: " +
          "layout(\"My layout\", h(XY, X3D, ratio)). The ratio is optional " +
          "and is expected to be in range [0,1].",
          function() {
            // Remove all new lines
            var data = this.value.replace(/\n/g, '');
            let userLayouts = CATMAID.Layout.parseLayoutSpecList(data);
            CATMAID.Layout.Settings
                .set(
                  'user_layouts',
                  userLayouts,
                  SETTINGS_SCOPE)
                 .then(function() {
                   CATMAID.Layout.trigger(CATMAID.Layout.EVENT_USER_LAYOUT_CHANGED);
                 })
                 .catch(CATMAID.handleError);
          },
          3,
          70);
      $('input', userLayoutInput)
        .css('width', '30em')
        .css('font-family', 'monospace');

      ds.append(wrapSettingsControl(
          userLayoutInput,
          CATMAID.Layout.Settings,
          'user_layouts',
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
          CATMAID.annotations.update()
            .then(() => {
              dialog.show();
              // Add auto complete to input field
              $(field).autocomplete({
                source: CATMAID.annotations.getAllNames()
              });
            })
            .catch(CATMAID.handleError);
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

            nnsAsyncContainer.append(wrapSettingsControl(
                CATMAID.DOM.createCheckboxSetting(
                    'Remove neighboring duplicates',
                    nameServiceInstance.getRemoveDuplicates(),
                    'If enabled, neigboring components with the same content are reduced to one.',
                    function() {
                      CATMAID.NeuronNameService.Settings
                        .set(
                          'remove_neighboring_duplicates',
                          this.checked,
                          SETTINGS_SCOPE)
                        .then(function () {
                          CATMAID.NeuronNameService.getInstance().loadConfigurationFromSettings();
                        });
                    }),
                CATMAID.NeuronNameService.Settings,
                'remove_neighboring_duplicates',
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
                CATMAID.TracingOverlay.Settings
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
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].display_node_radii),
          CATMAID.TracingOverlay.Settings,
          'display_node_radii',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Show extended status bar information',
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].extended_status_update,
              'If enabled, the status bar will not only show node type and ID ' +
              'when a node is selected. It will also show reviewer and time ' +
              'stamps, but needs to query the back-end to do this.',
              function() {
                CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].extended_status_update = this.checked;
              }),
          CATMAID.TracingOverlay.Settings,
          'extended_status_update',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Allow lazy node updates',
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].allow_lazy_updates,
              'If enabled, tracing layers will only update as a reaction of new ' +
              'node creation if that node is in their view. Otherwise it won\'t ' +
              'update, which causes edge intersections to be missed.',
              function() {
                CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].allow_lazy_updates = this.checked;
              }),
          CATMAID.TracingOverlay.Settings,
          'allow_lazy_updates',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              'Use cached data for matching sub-views',
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].subviews_from_cache,
              'If enabled, CATMAID will use already loaded tracing data when ' +
              'showing sub-views of a previously shown view, e.g. when zooming in.',
              function() {
                CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].subviews_from_cache = this.checked;
              }),
          CATMAID.TracingOverlay.Settings,
          'subviews_from_cache',
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
                checked: CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].screen_scaling},
               {id: 'overlay-scaling-stack', desc: 'Fixed stack size',
                checked: !CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].screen_scaling}],
              null,
              function () {
                CATMAID.TracingOverlay.Settings
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
          CATMAID.TracingOverlay.Settings,
          'screen_scaling',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createLabeledControl(
              $('<span>Size adjustment: <span id="overlay-scale-value">' +
                  (CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].scale*100).toFixed() +
                  '</span>%</span>'),
              $('<div id="overlay-scaling-slider" />').slider({
                  min: -2,
                  max: 2,
                  step: 0.1,
                  value: Math.log(CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].scale)/Math.LN2,
                  change: function (event, ui) {
                    CATMAID.TracingOverlay.Settings
                        .set(
                          'scale',
                          Math.pow(2, ui.value),
                          SETTINGS_SCOPE)
                        .then(function () {
                          $('#overlay-scale-value').text((
                              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].scale*100).toFixed());
                          project.getStackViewers().forEach(function (s) {
                            SkeletonAnnotations.getTracingOverlay(s.getId()).redraw(true);
                          });
                        });
                  }})),
          CATMAID.TracingOverlay.Settings,
          'scale',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
        CATMAID.DOM.createSelectSetting(
          'Connector node marker',
          {
            'Disc (classic)': 'disc',
            'Ring': 'ring',
            'Target': 'target',
            'Crosshair': 'crosshair',
            'Bullseye': 'bullseye'
          },
          "Texture to use for connector nodes: classic CATMAID uses 'Disc', but this obscures " +
          "image data underneath the node.",
          function() {
            CATMAID.TracingOverlay.Settings
              .set(
                'connector_node_marker',
                this.value,
                SETTINGS_SCOPE
              )
              .then(function() {
                project.getStackViewers().every(function(stackViewer) {
                  var overlay = SkeletonAnnotations.getTracingOverlay(stackViewer.getId());
                  if (overlay) {
                    overlay.graphics.cache.connectorPool.clear();
                    overlay.graphics.initTextures(true);
                    overlay.redraw(true);
                  }
                });
              });
          },
          CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].connector_node_marker
        ),
        CATMAID.TracingOverlay.Settings,
        'connector_node_marker',
        SETTINGS_SCOPE
      ));

      ds.append(wrapSettingsControl(
        CATMAID.DOM.createSelectSetting(
          'Data transfer mode',
          {
            'JSON': 'json',
            'Msgpack': 'msgpack',
            'GIF image': 'gif',
            'PNG image': 'png'
          },
          "Encoding of tracing data. For large views a binary format like Msgpack can have performance benefits.",
          function() {
            let format = this.value;
            CATMAID.TracingOverlay.Settings
              .set(
                'transfer_mode',
                this.value,
                SETTINGS_SCOPE
              )
              .then(function() {
                project.getStackViewers().every(function(stackViewer) {
                  var overlay = SkeletonAnnotations.getTracingOverlay(stackViewer.getId());
                  if (overlay) {
                    overlay.transferFormat = format;
                    overlay.redraw(true);
                  }
                });
              });
          },
          CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].transfer_mode
        ),
        CATMAID.TracingOverlay.Settings,
        'transfer_mode',
        SETTINGS_SCOPE
      ));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createNumericInputSetting(
              "Read-only mirror index",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].read_only_mirror_index,
              1,
              "Selects a mirror by index from the list of other CATMAID instances at the bottom of the Settings Widget, starting with 1. Empty values, -1 or 0 will disable this.",
              function() {
                var newIndex = parseInt(this.value, 10);
                if (!newIndex || Number.isNaN(newIndex)) {
                  newIndex = -1;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'read_only_mirror_index',
                      newIndex,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'read_only_mirror_index',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createRadioSetting(
              'lod-mode',
              [{id: 'lod-mode-absolute', desc: 'Absolute value', value: 'absolute',
                checked: CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].lod_mode === 'absolute'},
               {id: 'lod-mode-adaptive', desc: 'Adaptive linear mapping', value: 'adaptive',
                checked: CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].lod_mode === 'adaptive'},
               {id: 'lod-mode-mapping', desc: 'Zoom-to-LOD-percentage mapping', value: 'mapping',
                checked: CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].lod_mode === 'mapping'},
              ],
              null,
              function () {
                CATMAID.TracingOverlay.Settings
                    .set(
                      'lod_mode',
                      this.value,
                      SETTINGS_SCOPE)
                    .then(function () {
                      project.getStackViewers().forEach(function (s) {
                        SkeletonAnnotations.getTracingOverlay(s.getId()).redraw(true);
                      });
                    });
              }).addClass('setting'),
          CATMAID.TracingOverlay.Settings,
          'lod_mode',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Adaptive LOD zoom range",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].adaptive_lod_scale_range.join(', '),
              "Define two numbers A and B, separated by a comma. This settings defines " +
              "a range of zoom level percentages to which available level of detail (LOD) " +
              "information is mapped.",
              function() {
                let newValues = this.value.split(',')
                    .map(s => s.trim()).filter(s => s.length > 0).map(Number);

                if (newValues.length != 2) {
                  CATMAID.warn("Invalid LOD range");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'adaptive_lod_scale_range',
                      newValues,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'adaptive_lod_scale_range',
          SETTINGS_SCOPE));

      let mapArrayToStr = function(a) {
        return a.join(':');
      };

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Zoom to LOD mapping",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].lod_mapping.map(mapArrayToStr).join(', '),
              "Define number pairs of the form A:B, separated by commas. The first value defines a zoom " +
              "level and the second one the LOD level percentage in the range 0-1 that should be used at " +
              "the zoom level. Zoom levels in between are lineraly interpolated.",
              function() {
                let newValues = this.value.split(',')
                    .map(s => {
                      let a = s.split(':');
                      if (!a || a.length !== 2) {
                        CATMAID.warn("Invalid mapping");
                        return '';
                      }
                      let a0 = Number(a[0].trim());
                      let a1 = Number(a[1].trim());
                      if (a0 === undefined || Number.isNaN(a0) ||
                          a1 === undefined || Number.isNaN(a1)) {
                        CATMAID.warn("Invalid mapping");
                        return '';
                      }
                      return [a0, a1];
                    })
                    .filter(s => s.length > 0);

                if (newValues.length === 0) {
                  CATMAID.warn("Invalid LOD range");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'lod_mapping',
                      newValues,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'lod_mapping',
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
      var setColorOfTracingFields = function() {
        colors.forEach(function(field, label) {
          var input = colorControls.get(field);
          var color = $(input).find('input').val();
          color = new THREE.Color(color).getHex();
          CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE][field] = color;
        });
        updateTracingColors();
      };

      var colorControls = new Map();
      colors.forEach(function(field, label) {
        var color = new THREE.Color(CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE][field]);
        var input = CATMAID.DOM.createInputSetting(label, color.getStyle());
        this.append(wrapSettingsControl(input,
                                        CATMAID.TracingOverlay.Settings,
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


      addSkeletonLengthColoringSettings(ds, wrapSettingsControl, getScope);


      // Leyer configuration options include defaults for settings usually
      // available in the layer configuration panel.
      var dsTracingLayerDefaults = CATMAID.DOM.addSettingsContainer(ds,
          "Tracing layer skeleton filters", true);

      dsTracingLayerDefaults.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Limit to N largest skeletons",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].n_largest_skeletons_limit,
              "Only show the N largest skeletons in the field of view.",
              function() {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                  CATMAID.warn("Invalid N largest skeleton limit");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'n_largest_skeletons_limit',
                      value,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'n_largest_skeletons_limit',
          SETTINGS_SCOPE));

      dsTracingLayerDefaults.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Limit to N last edited skeletons",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].n_last_edited_skeletons_limit,
              "Only show the N last edited skeletons in the field of view.",
              function() {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                  CATMAID.warn("Invalid N last edited skeleton limit");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'n_last_edited_skeletons_limit',
                      value,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'n_last_edited_skeletons_limit',
          SETTINGS_SCOPE));

      // Get all available users
      var editorUsers = CATMAID.User.all();
      var editors = Object.keys(editorUsers).map(function (userId) { return editorUsers[userId]; });
      // Add reviewer options to select box
      var hideLastEditorSelect = $('<select/>').on('change', function() {
        let newValue;
        if (this.value === undefined || this.value === 'none') {
          newValue = 'none';
        } else {
          newValue = parseInt(this.value, 10);
          if (Number.isNaN(newValue)) {
            CATMAID.warn("Bad user ID: " + newValue);
            return;
          }
        }
        CATMAID.TracingOverlay.Settings
            .set(
              'hidden_last_editor_id',
              newValue,
              SETTINGS_SCOPE);
      });
      let hiddenLastEdtior = CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].hidden_last_editor_id;
      let noneSelected = hiddenLastEdtior === 'none';
      hideLastEditorSelect.append(new Option('(none)', 'none', noneSelected, noneSelected));
      editors.sort(CATMAID.User.displayNameCompare).forEach(function (user) {
        let selected = hiddenLastEdtior == user.id;
        this.append(new Option(user.getDisplayName(), user.id, selected, selected));
      }, hideLastEditorSelect);

      dsTracingLayerDefaults.append(
          CATMAID.DOM.createLabeledControl('Hide data last edited by', hideLastEditorSelect)
            .append($('<div class="help" />').append('Only show skeletons not edited last by this user.')));

      dsTracingLayerDefaults.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Min skeleton length (nm)",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].min_skeleton_length,
              "Only show skeletons with at least this length in the field of view.",
              function() {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                  CATMAID.warn("Invalid min. skeleton length");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'min_skeleton_length',
                      value,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'min_skeleton_length',
          SETTINGS_SCOPE));

      dsTracingLayerDefaults.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Min skeleton nodes",
              CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].min_skeleton_nodes,
              "Only show skeletons with at least this many nodes in the field of view.",
              function() {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                  CATMAID.warn("Invalid min. number of nodes");
                  return;
                }
                CATMAID.TracingOverlay.Settings
                    .set(
                      'min_skeleton_nodes',
                      value,
                      SETTINGS_SCOPE);
              }),
          CATMAID.TracingOverlay.Settings,
          'min_skeleton_nodes',
          SETTINGS_SCOPE));


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
          "preferSourceColor": skpPreferSourceColor.find('input').prop('checked'),
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
            sv.redraw();
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

        groupSetting.invert = $('#visibility-group-' + groupID + '-invert').prop('checked');

        var settingsCopy = CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].visibility_groups;
        settingsCopy = $.extend([], settingsCopy);
        settingsCopy[groupID] = groupSetting;
        CATMAID.TracingOverlay.Settings
            .set(
              'visibility_groups',
              settingsCopy,
              SETTINGS_SCOPE)
            .then(function () {
              SkeletonAnnotations.VisibilityGroups.setGroup(
                  groupID,
                  CATMAID.TracingOverlay.Settings.session.visibility_groups[groupID]);

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
        var scopedSettings = CATMAID.TracingOverlay.Settings[SETTINGS_SCOPE].visibility_groups[group.id];

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

        let invertOption = CATMAID.DOM.createCheckboxSetting(
              "Invert above condition",
              scopedSettings.hasOwnProperty('invert') ? scopedSettings.invert : false,
              "If enabled, the above condition is inverted.",
              (() => function() {
                updateVisibilityGroup(group.id);
              })());
        invertOption.find('input').attr('id', 'visibility-group-' + group.id + '-invert');
        groupRadioControl.append(invertOption);

        dsVisibilityGroupsRadioWrapper.append(groupRadioControl);
      });

      dsVisibilityGroups.append(wrapSettingsControl(
          dsVisibilityGroupsRadioWrapper,
          CATMAID.TracingOverlay.Settings,
          'visibility_groups',
          SETTINGS_SCOPE,
          function () {
            CATMAID.TracingOverlay.Settings.session.visibility_groups.forEach(function (group, i) {
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

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Edit radius after node creation",
              SkeletonAnnotations.Settings[SETTINGS_SCOPE].set_radius_after_node_creation,
              "The visual radius editing tool will be shown right after a node has been created.",
              function() {
                SkeletonAnnotations.Settings
                    .set(
                      'set_radius_after_node_creation',
                      this.checked,
                      SETTINGS_SCOPE);
              }),
          SkeletonAnnotations.Settings,
          'set_radius_after_node_creation',
          SETTINGS_SCOPE));

      ds.append(wrapSettingsControl(
          CATMAID.DOM.createCheckboxSetting(
              "Use connector type created last as new default",
              SkeletonAnnotations.Settings[SETTINGS_SCOPE].make_last_connector_type_default,
              "If enabled, the type of newly created connectors (synaptic, abutting, " +
              "gap-junction) will be used as new default. This default is used with " +
              "regular Shift+Click",
              function() {
                SkeletonAnnotations.Settings
                    .set(
                      'make_last_connector_type_default',
                      this.checked,
                      SETTINGS_SCOPE);
              }),
          SkeletonAnnotations.Settings,
          'make_last_connector_type_default',
          SETTINGS_SCOPE));

      var connectorTypesPlaceholder = document.createElement('div');
      ds.append(connectorTypesPlaceholder);
      CATMAID.Connectors.connectorTypes(project.id)
        .then(function(connectorTypes) {
          var items = connectorTypes.reduce(function(o, e) {
            o[e.name] = e.type;
            return o;
          }, {});
        let typeSelect = wrapSettingsControl(
            CATMAID.DOM.createSelectSetting(
                "Default connector type", items,
                "Select the connector type created by default.",
                function() {
                  SkeletonAnnotations.Settings
                      .set(
                        'default_connector_type',
                        this.value,
                        SETTINGS_SCOPE);
                },
                SkeletonAnnotations.Settings.session.default_connector_type),
            SkeletonAnnotations.Settings,
            'default_connector_type',
            SETTINGS_SCOPE);
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
      ds.append(wrapSettingsControl(
          CATMAID.DOM.createInputSetting(
              "Default new neuron name",
              SkeletonAnnotations.Settings[SETTINGS_SCOPE].new_neuron_name,
              "Every occurrence of '{nX}' in the default name with X being a " +
              "number is replaced by a number that is automatically incremented " +
              "(starting from X) to the smallest unique value in the project.",
              function () {
                SkeletonAnnotations.Settings
                    .set(
                      'new_neuron_name',
                      $(this).val(),
                      SETTINGS_SCOPE);
              }),
          SkeletonAnnotations.Settings,
          'new_neuron_name',
          SETTINGS_SCOPE));
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

      ds.append(wrapSettingsControl(
        CATMAID.DOM.createCheckboxSetting("Merge annotations of " +
            "single-node skeletons without asking",
            SkeletonAnnotations.Settings[SETTINGS_SCOPE].quick_single_node_merge,
            "If true, no merge dialog will be shown for single-node skeletons " +
            "with annotations. Instead, all annotations will be merged without asking.",
            function() {
                SkeletonAnnotations.Settings
                    .set(
                      'quick_single_node_merge',
                      this.checked,
                      SETTINGS_SCOPE);
            }),
            SkeletonAnnotations.Settings,
            'quick_single_node_merge',
            SETTINGS_SCOPE));

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

      // Fast split mode
      var dsFastSplit = CATMAID.DOM.addSettingsContainer(ds,
          "Fast split mode", true);
      var dsFastSplitRadioWrapper = CATMAID.DOM.createSkeletonNodeMatcherSetting({
            label: '',
            id: 'fast-split-mode',
            settings: SkeletonAnnotations.Settings[SETTINGS_SCOPE].fast_split_mode,
            help: 'Skeletons in this group will be split  without asking for ' +
                'confirmation. All annotations are copied over to the new skeleton.',
            updateSettings: function(newSetting) {
              SkeletonAnnotations.Settings
                .set('fast_split_mode', newSetting, SETTINGS_SCOPE)
                .then(function() {
                  SkeletonAnnotations.FastSplitMode.setFilters(
                      SkeletonAnnotations.Settings.session.fast_split_mode);
                });
            }
          });

      dsFastSplit.append(wrapSettingsControl(
          dsFastSplitRadioWrapper,
          SkeletonAnnotations.Settings,
          'fast_split_mode',
          SETTINGS_SCOPE,
          function () {
            SkeletonAnnotations.FastSplitMode.setFilters(
                SkeletonAnnotations.Settings.session.fast_split_mode);
          }));

      // Fast merge mode
      var dsFastMerge = CATMAID.DOM.addSettingsContainer(ds,
          "Fast merge mode", true);
      var dsFastMergeRadioWrapper = CATMAID.DOM.createSkeletonNodeMatcherSetting({
            label: '',
            id: 'fast-merge-mode',
            settings: SkeletonAnnotations.Settings[SETTINGS_SCOPE].fast_merge_mode,
            help: 'Skeletons in this group will be merged into the active ' +
                'skeleton without asking for confirmation. All their annotations ' +
                'are copied over.',
            updateSettings: function(newSetting) {
              SkeletonAnnotations.Settings
                .set('fast_merge_mode', newSetting, SETTINGS_SCOPE)
                .then(function() {
                  SkeletonAnnotations.FastMergeMode.setFilters(
                      SkeletonAnnotations.Settings.session.fast_merge_mode);
                });
            }
          });

      dsFastMerge.append(wrapSettingsControl(
          dsFastMergeRadioWrapper,
          SkeletonAnnotations.Settings,
          'fast_merge_mode',
          SETTINGS_SCOPE,
          function () {
            SkeletonAnnotations.FastMergeMode.setFilters(
                SkeletonAnnotations.Settings.session.fast_merge_mode);
          }));

      // Warning
      var dsTracingWarnings = CATMAID.DOM.addSettingsContainer(ds,
          "Warnings", true);

      // Create async selection and wrap it in container to have handle on initial
      // DOM location
      var volumeSelectionWrapper = CATMAID.createVolumeSelector({
        mode: "radio",
        label: "New nodes not in volume",
        title: "A warning will be shown when new nodes are created outside of the selected volume",
        selectedVolumeIds: [SkeletonAnnotations.getNewNodeVolumeWarning()],
        select: function(volumeId, selected, element){
          // Remove existing handler and new one if selected
          SkeletonAnnotations.setNewNodeVolumeWarning(element.value !== "none"? volumeId : null);
        }
      });
      dsTracingWarnings.append(volumeSelectionWrapper);


      // Skeleton length warning
      var skeletonLengthWarning = SkeletonAnnotations.getSkeletonLengthWarning();
      var skeletonLengthWarningInput = document.createElement('input');
      skeletonLengthWarningInput.classList.add('ui-corner-all');
      skeletonLengthWarningInput.value = skeletonLengthWarning ? skeletonLengthWarning : '';
      skeletonLengthWarningInput.addEventListener('change', function(event) {
        var limit = parseInt(this.value, 10);
        if (Number.isNaN(limit)) {
          CATMAID.warn("No valid number");
          return;
        }
        skeletonLengthWarning = limit;
        SkeletonAnnotations.setNewSkeletonLengthWarning(limit);
      });
      var skeletonLengthWarning = CATMAID.DOM.createCheckboxSetting('Skeleton length limit',
          !!skeletonLengthWarning, 'In nanometers. If a skeleton length warning larger ' +
          'than zero is set, a warning will be shown after skeleton modifications, if ' +
          'the skeleton length exceeds it.',
          function(event) {
            if (this.checked) {
              SkeletonAnnotations.setNewSkeletonLengthWarning(skeletonLengthWarning);
            } else {
              SkeletonAnnotations.setNewSkeletonLengthWarning(null);
            }
          },
          skeletonLengthWarningInput);
      dsTracingWarnings.append(skeletonLengthWarning);
    };

    var addRemoteSettings = function(container) {
      var ds = CATMAID.DOM.addSettingsContainer(container, "Other CATMAID instances");

      // The remote instance list
      let componentList = $('<select/>').addClass('multiline').attr('size', '4')[0];
      let remoteAsyncContainer = $('<div/>');
      ds.append(remoteAsyncContainer);
      CATMAID.Client.Settings
          .load()
          .then(function () {
            remoteAsyncContainer.append(wrapSettingsControl(
                CATMAID.DOM.createLabeledControl('Known CATMAID instances', componentList,
                  "The list of known CATMAID instances that can be used to " +
                  "e.g. retrieve tracing data.", 'cm-top'),
                CATMAID.Client.Settings,
                'remote_catmaid_instances',
                SETTINGS_SCOPE,
                function () {}));
          });

      // Remove selected remote instance
      var removeButton = $('<button/>').text('Remove instance reference').click(function() {
        if (componentList.selectedIndex < componentList.length) {
          let newList = CATMAID.tools.deepCopy(CATMAID.Client.Settings[SETTINGS_SCOPE].remote_catmaid_instances);
          newList.splice(componentList.selectedIndex, 1);
          CATMAID.Client.Settings.set(
              'remote_catmaid_instances',
              newList,
              SETTINGS_SCOPE)
            .then(function() {
              updateComponentList();
            })
            .catch(CATMAID.handleError);
        }
      });
      ds.append(CATMAID.DOM.createLabeledControl('', removeButton, "Remove " +
          "the remote instance reference selected in the list above."));

      // Remote instance list update
      var updateComponentList = function() {
        $(componentList).empty();
        let remotes = CATMAID.Client.Settings[SETTINGS_SCOPE].remote_catmaid_instances;
        remotes.map(function(o, i) {
          // Add each remote list element to the select control
          var optionElement = $('<option/>').attr('value', o.id)
              .text(`${o.name}: ${o.url}`);
          return optionElement[0];
        }).forEach(function(o) {
          componentList.appendChild(o);
        });
      };

      // Initialize component list
      updateComponentList();

      let newRemoteName = '';
      let newRemoteUrl = '';
      let newRemoteApiKey = '';
      let newRemoteAuthUser = '';
      let newRemoteAuthPass = '';

      let newRemoteNameInput = CATMAID.DOM.createInputSetting(
          "Instance name", newRemoteName, "The name under which the new " +
          "remote CATMAID instance will be accessible.", function() {
            newRemoteName = this.value.trim();
          });
      ds.append(newRemoteNameInput);

      let newRemoteNameUrlInput = CATMAID.DOM.createInputSetting(
          "Instance URL", newRemoteName, "The main URL under which the new " +
          "remote CATMAID instance can be reached, e.g. https://example.com/catmaid/",
          function() {
            newRemoteUrl = this.value.trim();
          });
      ds.append(newRemoteNameUrlInput);

      let newRemoteApiKeyInput = CATMAID.DOM.createInputSetting(
          "User API token", newRemoteApiKey, "The API key/token to use with the " +
          "new remote instance.", function() {
            newRemoteApiKey = this.value.trim();
          });
      ds.append(newRemoteApiKeyInput);

      let newRemoteAuthUserInput = CATMAID.DOM.createInputSetting(
          "HTTP auth user", newRemoteAuthUser, "(optional) The basic browser " +
          "HTTP username needed to access the remote instance, if any.", function() {
            newRemoteAuthUser = this.value.trim();
          });
      ds.append(newRemoteAuthUserInput);

      let newRemoteAuthPassInput = CATMAID.DOM.createInputSetting(
          "HTTP auth password", newRemoteAuthPass, "(optional) The basic browser " +
          "HTTP password needed to access the remote instance, if any.", function() {
            newRemoteAuthPass = this.value.trim();
          });
      newRemoteAuthPassInput.find('input').attr('type', 'password');
      ds.append(newRemoteAuthPassInput);

      // Add selected remote instance
      var addButton = $('<button/>').text('Add remote CATMAID instance').click(function() {
        if (!newRemoteName || newRemoteName.length === 0) {
          CATMAID.warn("Need a name for the new remote reference");
          return;
        }
        if (!newRemoteUrl || newRemoteUrl.length === 0) {
          CATMAID.warn("Need a URL by which to reach the new remote reference");
          return;
        }
        let newRemote = {
          name: newRemoteName,
          url: newRemoteUrl,
          api_key: newRemoteApiKey,
          http_auth_user: newRemoteAuthUser,
          http_auth_pass: newRemoteAuthPass,
        };

        let newList = CATMAID.tools.deepCopy(CATMAID.Client.Settings[SETTINGS_SCOPE].remote_catmaid_instances);
        newList.push(newRemote);
        CATMAID.Client.Settings.set(
            'remote_catmaid_instances',
            newList,
            SETTINGS_SCOPE)
          .then(function() {
            updateComponentList();
            newRemoteNameInput.find('input').val('');
            newRemoteNameUrlInput.find('input').val('');
            newRemoteApiKeyInput.find('input').val('');
            newRemoteAuthUserInput.find('input').val('');
            newRemoteAuthPassInput.find('input').val('');
          })
          .catch(CATMAID.handleError);
      });
      ds.append(CATMAID.DOM.createLabeledControl('', addButton));
    };

    var addSettingsFilter = function(container, searchContainer) {
      var searchForm = document.createElement('form');
      searchForm.setAttribute('data-role', 'filter');
      searchForm.style.marginTop="1em";
      searchForm.style.marginLeft="1em";
      searchForm.style.display="inline-block";

      var searchInput = document.createElement('input');
      searchInput.setAttribute('type', 'text');
      searchInput.setAttribute('data-role', 'filter');
      searchInput.setAttribute('placeholder', 'Filter');
      var visibleSettingBoxes = null;
      searchInput.onkeyup = function() {
        // Filter content
        if (this.value.length === 0) {
          $('div.setting', searchContainer).show();
          // Apply former expansion configuration
          if (visibleSettingBoxes && visibleSettingBoxes.length > 0) {
            $('.extend-box-open', searchContainer)
                .attr('class', 'extend-box-closed')
                .closest('.settings-container')
                  .find('.content').animate({
                    height: 'hide',
                    opacity: 'hide'
                  }, {
                    duration: 100
                  });
            visibleSettingBoxes.children('.extend-box-closed').attr('class', 'extend-box-open');
            visibleSettingBoxes.children('.content').animate({
                opacity: 'show',
                height: 'show'
            });
            visibleSettingBoxes = null;
          }
        } else {
          // Expand all setting blocks
          if (!visibleSettingBoxes) {
            visibleSettingBoxes = $(".extend-box-open", searchContainer).closest('.settings-container');
            var invisibleBoxes = $(".extend-box-closed", searchContainer).closest('.settings-container');
            $('.extend-box-closed', invisibleBoxes).attr('class', 'extend-box-open');
            $('.content', invisibleBoxes).animate({
              opacity: 'show',
              height: 'show'
            }, {
              duration: 100
            });
          }
          $('div.setting:icontainsnot(' + this.value + ')', searchContainer).hide();
          $('div.setting:icontains(' + this.value + ')', searchContainer).show();
        }
      };
      searchForm.appendChild(searchInput);
      container.appendChild(searchForm);
    };

    var SETTINGS_SCOPE = 'session';

    function getScope() {
      return SETTINGS_SCOPE;
    }

    var refresh = (function () {
      $(space).empty();

      let buttonContainer = document.createElement('p');
      buttonContainer.style.margin = ".5em .5em 1em .5em";
      addSettingsScopeSelect(buttonContainer);
      addSettingsFilter(buttonContainer, space);
      space.appendChild(buttonContainer);

      // Add all settings
      addGeneralSettings(space);
      addStackLayerSettings(space);
      addGridSettings(space);
      addTracingSettings(space);
      addRemoteSettings(space);

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

  var addSkeletonLengthColoringSettings = function(ds, wrapSettingsControl, getScope) {
    var SETTINGS_SCOPE = getScope();
    var dsNodeColors = CATMAID.DOM.addSettingsContainer(ds, "Skeleton length coloring", true);
    var dsColorWrapper = $('<div />').addClass('setting');
    var colors = new Map([
      ['Lower bound', 0],
      ['Center', 1],
      ['Upper bound', 2]]);

    // Add explanatory text
    dsColorWrapper.append($('<div/>').addClass('setting').append([
        'Select colors and cable length thresholds for skeleton length based ',
        'node coloring in the tracing layer. To toggle this coloring mode, ',
        'press <kbd>F7</kbd> or use the Tracing Tool icon button next to the ',
        'tag display toggle. Nodes of skeletons with a length below the lower ',
        'bound and above the upper bound, will only use the lower bound color ',
        'and the upper bound color, respectively. Nodes of skeletons with a ',
        'length inbetween will use an interpolated color between lower bound ',
        'and center and upper bound and center, respectively.'].join('')));

    colors.forEach(function(field, label) {
      var settings = CATMAID.TracingOverlay.Settings;
      var setting = settings[SETTINGS_SCOPE].length_color_steps;
      var step = setting[field];


      var color = new THREE.Color(step.color);
      var input = CATMAID.DOM.createInputSetting('Color', color.getStyle(),
          "The color to use at the set cable length");
      CATMAID.ColorPicker.enable($(input).find('input'), {
        initialColor: color.getHex(),
        onColorChange: setSkeletonLengthColors.bind(window, getScope, field)
      });
      dsColorWrapper.append(input);
      input.prepend($('<h4/>').append(label));
      input.css('white-space', 'nowrap');

      var stop = CATMAID.DOM.createNumericInputSetting('Cable length (nm)', step.stop,
          1000, "Cable length at which this color is used", function() {
            step.stop = parseInt(this.value, 10);
            // A copy is needed to convince the settings system that the object cheanged.
            settings.set('length_color_steps', CATMAID.tools.deepCopy(setting), SETTINGS_SCOPE);
            updateTracingDepthColoring(getScope);
          });
      stop.css('white-space', 'nowrap');
      dsColorWrapper.append(stop);

    }, dsNodeColors);

    dsNodeColors.append(wrapSettingsControl(
        dsColorWrapper,
        CATMAID.TracingOverlay.Settings,
        'length_color_steps',
        SETTINGS_SCOPE,
        updateTracingColors,
        hexColorToStr));
  };

  var updateTracingColors = function () {
    // Update all tracing layers
    project.getStackViewers().forEach(function(sv) {
      var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
      if (overlay) overlay.recolorAllNodes();
    });
  };

  var updateTracingDepthColoring = function(getScope) {
    if (CATMAID.TracingOverlay.Settings.session.color_by_length) {
      // Update all tracing layers
      project.getStackViewers().forEach(function(sv) {
        var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
        if (overlay) {
          var source = new CATMAID.ColorSource('length', overlay);
          overlay.setColorSource(source);
        }
      });
    }
  };

  var hexColorToStr = function(hex) {
    return new THREE.Color(hex).getStyle();
  };

  var setSkeletonLengthColors = function(getScope, field, rgb, alpha, colorChanged, alphaChanged, hex) {
    var setting = CATMAID.TracingOverlay.Settings[getScope()].length_color_steps;
    setting[field].color = parseInt(hex, 16);
    // A copy is needed to convince the settings system that the object cheanged.
    CATMAID.TracingOverlay.Settings.set('length_color_steps', CATMAID.tools.deepCopy(setting), getScope());
    updateTracingDepthColoring(getScope);
  };

  CATMAID.SettingsWidget = SettingsWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Settings",
    description: "Configure CATMAID",
    key: 'settings',
    creator: SettingsWidget
  });

})(CATMAID);
