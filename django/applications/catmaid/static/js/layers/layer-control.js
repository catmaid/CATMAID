(function(CATMAID) {

  "use strict";

  /**
   * The tilelayer control element on the top-left of the stackViewer window
   */
  var LayerControl = function ( stackViewer )
  {
    this.stackViewer = stackViewer;
    this.view = document.createElement( "div" );
    this.view.className = "LayerControl";
    this.view.id = "LayerControl" + stackViewer.getId();
    this.view.style.zIndex = 6;

    stackViewer.getView().appendChild( this.view );
  };

  LayerControl.prototype = {};

  /**
   * get the view object
   */
  LayerControl.prototype.getView = function()
  {
    return this.view;
  };

  /**
   * removes existing layer controls and re-creates them.
   */
  LayerControl.prototype.refresh = function()
  {
    // Get current set of layers
    var stackViewer = this.stackViewer;
    var layerOrder = stackViewer.getLayerOrder();

    // Empty container
    var $view = $(this.view);
    $view.empty();

    $view.append('<h3>Stack Viewer</h3>');

    var navcb = $('<input/>')
        .attr('type', 'checkbox')
        .prop('checked', stackViewer.navigateWithProject)
        .change(function () {
          stackViewer.navigateWithProject = !stackViewer.navigateWithProject;
        });
    var navlabel = $('<div/>')
        .addClass('setting')
        .append($('<label/>').append(navcb).append('Navigate with project'));
    $view.append(navlabel);

    var cb = $('<input/>')
        .attr('type', 'checkbox')
        .prop('checked', stackViewer.showScaleBar)
        .change(function () {
          stackViewer.updateScaleBar(this.checked);
        });
    var label = $('<div/>')
        .addClass('setting')
        .append($('<label/>').append(cb).append('Show scale bar'));
    $view.append(label);

    var offsetTable = $('<table />');
    var row = $('<tr/>');
    var cellNames = ['X', 'Y', 'Z'];
    for (var j = 0; j < 3; ++j) {
      var cell = $('<input type="number" step="1" value="' + stackViewer._offset[j] + '"/>');
      cell.change((function (ind) {
        return function () {
          var offset = stackViewer.getOffset();
          offset[ind] = Number($(this).val());
          stackViewer.setOffset(offset);
        };
      })(j));
      cell.css('width', '4em');
      row.append($('<td/>').append($('<label/>').append(cellNames[j]).append(cell)));
    }
    offsetTable.append(row);

    var offsetSelect = $('<div class="setting"/>');
    offsetSelect.append('<span>Offset from project (stack coordinates)</span>');
    offsetSelect.append(offsetTable);
    $view.append(offsetSelect);

    var layerOffsetcb = $('<input/>')
        .attr('type', 'checkbox')
        .prop('checked', CATMAID.StackViewer.Settings.session.apply_layer_offsets)
        .change(function () {
          CATMAID.StackViewer.Settings.set('apply_layer_offsets', this.checked, 'session');
          layerOffsetInput.prop('disabled', !this.checked);
        });
    var layerOffsetInput = $('<input />')
        .attr({
          disabled: !CATMAID.StackViewer.Settings.session.apply_layer_offsets,
          value: CATMAID.StackViewer.Settings.session.layer_offsets.length > 0 ?
              JSON.stringify(CATMAID.StackViewer.Settings.session.layer_offsets) : '',
          placeholder: '[{"z": [z1, z1], "offset": [x, y], "radius:: [x, y, r]}]',
          title: 'This can be a JSON list with objects of the form {"z": [z1, z2], "offset": [x, y], radius: [x, z, r]}, with radius being optional. All coordinates are in stack space. If enabled, the current location will be adjusted automatically by the given planar offset as soon as the user moves from z1 to z2. If the user moves from z2 to z1, the offset will be applied inversely. By default it doesn\'t matter ay which X and Y one enters the new Z plane. If a radius is provided, this offset effect will only be applied to locations within the given radius on the Z slic, centered at the X and Y coordinate of the defined location',
        })
        .css({'width': '20em'})
        .change(function() {
          try {
            let val = this.value.length > 0 ? JSON.parse(this.value) : [];
            if (val instanceof Array) {
              CATMAID.StackViewer.Settings.set('layer_offsets', val, 'session');
            } else {
              CATMAID.warn('Please provide a JSON list of objects.');
            }
          } catch (e) {
            CATMAID.warn('Could not parse layer offsets. They need to be a JSON list of objects.');
          }
        });
    var layerOffsetlabel = $('<div/>')
        .addClass('setting')
        .append($('<label/>').append(layerOffsetcb).append(
            $('<span />')
              .append('Layer offsets ')
              .append(layerOffsetInput)
              .append($('<button />')
                .append('Add current loc.')
                .attr('title', 'Add offset template for current location')
                .click(e => {
                  let nextZ = stackViewer.toValidZ(stackViewer.z + 1, 1);
                  let offsets = CATMAID.tools.deepCopy(CATMAID.StackViewer.Settings.session.layer_offsets);
                  offsets.push({
                    "z": [stackViewer.z, nextZ],
                    "offset": [0, 0],
                    "radius": [stackViewer.x, stackViewer.y, 0],
                  });
                  CATMAID.StackViewer.Settings.set('layer_offsets', offsets, 'session');
                  layerOffsetInput.val(JSON.stringify(offsets));
                }))));
    $view.append(layerOffsetlabel);

    var uniqueStackIds = new Set(stackViewer._stacks.map(function(s) {
      return s.id;
    }));
    var brokenSectionStacks = CATMAID.DOM.createCheckboxSelect(
        "Skip broken sections of stacks",
        stackViewer._stacks.filter(function(s) {
          if (uniqueStackIds.has(s.id)) {
            uniqueStackIds.delete(s.id);
            return true;
          }
          return false;
        }).map(function(s) {
          return {title: s.title, value: s.id};
        }), Array.from(stackViewer._brokenSliceStacks).map(function(s) {
          return s.id;
        }));
    brokenSectionStacks.onchange = function(e) {
      var respected = e.target.checked;
      var stackId = e.target.value;
      var matches = stackViewer._stacks.filter(function(s) {
        return s.id == stackId;
      });
      if (matches.length !== 1) {
        throw new CATMAID.ValueError("Could not find stack for ID " + stackId);
      }
      var stack = matches[0];
      if (respected) {
        stackViewer.addBrokenSliceStack(stack);
      } else {
        stackViewer.removeBrokenSliceStack(stack);
      }
    };
    $view.append(brokenSectionStacks);

    $view.append('<h3>Layers by render order (drag to reorder)</h3>');
    var layerList = $('<ol/>');

    var setOpac = function (val) {
      var layer = stackViewer.getLayer(this.idd);

      if (!layer) return;

      layer.setOpacity(val);
      stackViewer.redraw();
    };

    // Create a remove handler so that it has its own closure, i.e. not share a
    // variable with other callbacks.
    var makeRemoveHandler = function(stackViewer, key) {
      return function() {
        stackViewer.removeLayer(key);
        stackViewer.redraw();
      };
    };

    // Add slider for each layer
    for (var i = 0; i < layerOrder.length; i++) {
      var key = layerOrder[i];
      var layer = stackViewer.getLayer(key);
      var self = this;

      if (layer.internal) {
        layer.setOpacity(layer.getOpacity());
        continue;
      }

      var container = $('<li/>');
      container.data('key', key);
      container.addClass('layerControl');
      if (layer.isOrderable) container.addClass('orderable');

      var layer_name = layer.getLayerName ? layer.getLayerName() : key;
      if (stackViewer.isLayerRemovable(key)) {
        container.append($('<div class="layerClose">')
            .append($('<input type="button" value="x" class="remove"/>')
                .click(makeRemoveHandler(stackViewer, key))));
      }

      container.append($('<h4/>').append(layer_name));

      if (CATMAID.tools.isFn(layer.getLayerDisplayInfo)) {
        let info = layer.getLayerDisplayInfo();

        let infoDom = $('<dl>');
        for (const [key, value] of info.entries()) {
          infoDom.append($('<dt>').append(key));
          infoDom.append($('<dd>').append(value));
        }

        container.append(infoDom);
      }

      // Opacity slider
      var opacitySelect = $('<div class="setting"/>');
      opacitySelect.append('<span>Opacity</span>');

      // Make layer re-evaluate its opacity
      layer.setOpacity(layer.getOpacity());

      var slider = new CATMAID.Slider(
          CATMAID.Slider.HORIZONTAL,
          false,
          0,
          1,
          101,
          layer.getOpacity(),
          setOpac);

      slider.idd = key;
      opacitySelect.append(slider.getView());
      container.append(opacitySelect);

      var hidecb = $('<input/>')
          .attr('type', 'checkbox')
          .prop('checked', layer.isHideable)
          .change(function () {
            var key = $(this).parents('.layerControl').data('key');
            var layer = stackViewer.getLayer(key);
            layer.isHideable = !layer.isHideable;
          });
      var hidelabel = $('<div/>')
          .addClass('setting')
          .append($('<label/>').append(hidecb).append('Hide this layer when <kbd>SPACE</kbd> is held'));
      container.append(hidelabel);

      // Layer settings
      if (CATMAID.tools.isFn(layer.getLayerSettings)) {
        let settings = layer.getLayerSettings();
        if (0 < settings.size) {
          let layerSettings = $('<div />');
          for (let [groupName, group] of settings) {
            if (group.length) layerSettings.append($('<h5 />').append(groupName));
            for (let setting of group) {
              let settingElement = $('<div />').addClass('setting');
              let label = $('<label />').append(setting.displayName);
              settingElement.append(label);
              label.attr('title', setting.help);
              CATMAID.LayerControl.SettingControls[setting.type]
                .createControl(setting, settingElement, label);
              layerSettings.append(settingElement);
            }
          }

          container.append(layerSettings);
          var eventData = { 'layer': layer, 'stackViewer': stackViewer };
          layerSettings.on('change', '.layerSetting', eventData, function(e) {
            if (CATMAID.tools.isFn(e.data.layer.setLayerSetting)) {
              var value = this.value.trim();
              if (0 === value.length) {
                value = null;
              }
              if (this.type === 'checkbox') value = this.checked;
              e.data.layer.setLayerSetting(this.name, value);
              e.data.stackViewer.redraw();
            }
          });
        }
      }

      if (layer.getAvailableBlendModes || layer.getAvailableFilters) {
        container.append($('<h5 />').append('Blending and Filters'));
      }

      // Blend mode
      if (layer.getAvailableBlendModes) {
        try {
          var blendModes = layer.getAvailableBlendModes();
          var activeMode = layer.getBlendMode();

          var blendLabel = $('<label/>')
              .append('Blend mode');
          var blendSelect = $('<select/>');
          blendModes.forEach(function (key) {
            var option = document.createElement("option");
            option.text = key;
            option.value = key;
            if (activeMode === key) option.selected = 'selected';
            blendSelect.append(option);
          });
          blendSelect.change(function () {
            var key = $(this).parents('.layerControl').data('key');
            stackViewer.getLayer(key).setBlendMode(this.value);
            stackViewer.redraw();
          });

          container.append($('<div class="setting"/>').append(blendLabel).append(blendSelect));
        } catch (error) {
          CATMAID.warn('Could not access WebGL blend modes, this indicates problems with graphics card driver.');
          console.log(error);
        }
      }

      // Filters
      if (layer.getAvailableFilters) {
        var availFilters = layer.getAvailableFilters();

        var filterLabel = $('<label/>')
            .append('Filters');
        var filterSelect = $('<select/>');
        Object.keys(availFilters).forEach(function (key) {
          var option = document.createElement("option");
          option.text = key;
          option.value = key;
          filterSelect.append(option);
        });

        var filtersContainer = $('<ol/>');

        var filterAdd = $('<input type="button" value="Add"/>');
        filterAdd.click(function () {
          var key = $(this).parents('.layerControl').data('key');
          var layer = stackViewer.getLayer(key);
          var filterName = $(this).siblings('select')[0].value;
          var filter = new (layer.getAvailableFilters()[filterName])();
          layer.addFilter(filter);
          layer.redraw();
          self.refresh();
        });

        filterLabel.append(filterSelect).append(filterAdd);
        container.append($('<div class="setting"/>').append(filterLabel).append(filterSelect).append(filterAdd));

        var filters = layer.getFilters();
        filters.forEach(function (filter) {
          var filterContainer = $('<li class="layerFilterControl"/>');
          var removeBtn = $('<input type="button" value="x" class="remove"/>')
              .click(function () {
                var key = $(this).parents('.layerControl').data('key');
                var layer = stackViewer.getLayer(key);
                layer.removeFilter(filter);
                layer.redraw();
                self.refresh();
              });
          filterContainer.append(removeBtn);
          filter.redrawControl(filterContainer);
          filtersContainer.append(filterContainer);
        });

        container.append(filtersContainer);
        filtersContainer.sortable({
          placeholder: 'highlight',
          start: function (event, ui) {
            ui.item.startIndex = ui.item.index();
          },
          stop: function (event, ui) {
            var key = $(this).parents('.layerControl').data('key');
            var layer = stackViewer.getLayer(key);
            layer.moveFilter(ui.item.startIndex, ui.item.index());
            layer.redraw();
          }
        });
      }

      if (layer.getAvailableBlendModes && layer.getLayerWindow) {
        container.append($('<h5 />').append('Blending window'));

        var layerWindow = layer.getLayerWindow();

        const layerWindowSizeLabel = $('<label/>')
            .append('Window size (layers)');
        const layerWindowSize = CATMAID.DOM.createNumericField(undefined, undefined,
            'Size of window as a number of layers', layerWindow.size, undefined,
            event => {
              const value = Number(event.srcElement.value);
              if (!Number.isNaN(value)) {
                var key = $(event.srcElement).parents('.layerControl').data('key');
                stackViewer.getLayer(key).setLayerWindowSize(value);
                stackViewer.redraw();
              }
            }, undefined, undefined, false, 1, 0);
        const layerWindowPosLabel = $('<label/>')
            .append('Window alignment');
        const layerWindowPosSelect = CATMAID.DOM.createSelect(undefined, [
            {title: 'Window before current Z', value: 'pre'},
            {title: 'Window centered on current Z', value: 'center'},
            {title: 'Window after current Z', value: 'post'}],
            layerWindow.windowPos,
            event => {
              var key = $(event.srcElement).parents('.layerControl').data('key');
              stackViewer.getLayer(key).setLayerWindowPosition(event.srcElement.value);
              stackViewer.redraw();
            });

        container.append($('<div class="setting"/>').append(layerWindowSizeLabel).append(layerWindowSize))
            .append($('<div class="setting"/>').append(layerWindowPosLabel).append(layerWindowPosSelect));

        try {
          var blendModes = layer.getAvailableBlendModes();
          var activeMode = layerWindow.blendMode;

          var blendLabel = $('<label/>')
              .append('Blend mode');
          var blendSelect = CATMAID.DOM.createSelect(undefined, blendModes, activeMode, event => {
            var key = $(event.srcElement).parents('.layerControl').data('key');
            stackViewer.getLayer(key).setLayerWindowBlendMode(event.srcElement.value);
            stackViewer.redraw();
          });

          container.append($('<div class="setting"/>').append(blendLabel).append(blendSelect));
        } catch (error) {
          CATMAID.warn('Could not access WebGL blend modes, this indicates problems with graphics card driver.');
          console.log(error);
        }
      }

      // Source specific settings storage - stores as settings of the stack
      // viewer.
      if (CATMAID.tools.isFn(layer.getSourceSpec)) {
        let saveSettings = e => {
          var key = $(e.target).parents('.layerControl').data('key');
          var layer = stackViewer.getLayer(key);
          let sourceSpec = layer.getSourceSpec();
          let scope = 'session';
          let settings = Array.from(layer.getLayerSettings().values()).reduce((o,s) => {
            for (let entry of s) {
              o[entry.name] = entry.value;
            }
            return o;
          }, {});
          settings['opacity'] = layer.getOpacity();
          settings['isHideable'] = layer.isHideable;
          if (layer.getAvailableBlendModes) {
            settings['blendMode'] = layer.getBlendMode();

            let filters = layer.filters.map(f => {
              return {
                'name': f.displayName,
                'params': f.params.map(p => {
                  return {
                    'name': p.name,
                    'value': f.pixiFilter[p.name],
                  };
                }),
              };
            });
            settings['layerFilters'] = filters;
          }

          let defaultLayerConfig = CATMAID.tools.deepCopy(CATMAID.StackViewer.Settings[scope].default_layer_config);
          defaultLayerConfig[sourceSpec] = settings;
          CATMAID.StackViewer.Settings.set('default_layer_config', defaultLayerConfig, scope);
          CATMAID.msg('Success', 'Stores settings as defaults for source');
        };
        let restoreFromSettings = e => {
          var key = $(e.target).parents('.layerControl').data('key');
          var layer = stackViewer.getLayer(key);
          let sourceSpec = layer.getSourceSpec();
          let scope = 'session';
          let settings = CATMAID.StackViewer.Settings[scope].default_layer_config[sourceSpec];
          if (settings) {
            layer.applySettings(settings);
            if (layer.getAvailableBlendModes) {
              layer.syncFilters();
            }
            layer.redraw();
            this.refresh();
            CATMAID.msg('Success', 'Restored settings from source specific defaults');
          } else {
            CATMAID.warn('Did not find any default setting for this layer and source');
          }
        };
        let clearSettings = e => {
          let key = $(e.target).parents('.layerControl').data('key');
          let layer = stackViewer.getLayer(key);
          let sourceSpec = layer.getSourceSpec();
          let scope = 'session';
          let defaultLayerConfig = CATMAID.tools.deepCopy(CATMAID.StackViewer.Settings[scope].default_layer_config);
          delete defaultLayerConfig[sourceSpec];
          CATMAID.StackViewer.Settings.set('default_layer_config', defaultLayerConfig, scope);
          CATMAID.msg('Success', 'Source specific settings cleared');
        };
        container.append($('<h5 />').append('Source specific settings storage'))
            .append($('<div class="setting distribute"/>')
                .append($('<button/>').append('Save as default for source').click(saveSettings))
                .append($('<button/>').append('Restore from default').click(restoreFromSettings))
                .append($('<button/>').append('Clear default').click(clearSettings)));
      }

      layerList.append(container);
    }

    $view.append(layerList);

    // Make layer list reorderable by dragging layers.
    layerList.sortable({
      items: 'li.orderable',
      placeholder: 'highlight',
      update: function (event, ui) {
        var beforeKey = ui.item.next().data('key') || null;
        stackViewer.moveLayer(ui.item.data('key'), beforeKey);
        stackViewer.redraw();
      }
    });
  };

  // Static classes here are only used for dispatch because the settings
  // themselves are flat objects and there's no point in constructing real
  // instances.
  class SettingControl {
    static createControl(setting, element, label) {
      throw new CATMAID.NotImplementedException();
    }
  }

  class InputControl extends SettingControl {
    static createControl(setting, element, label) {
      var input = $('<input />').attr({
        type: setting.type,
        placeholder: '(none)',
        name: setting.name
      });
      if (setting.range && 2 === setting.range.length) {
        input.attr('min', setting.range[0]);
        input.attr('max', setting.range[1]);
      } else {
        if (setting.min !== undefined) {
          input.attr('min', setting.min);
        }
        if (setting.max !== undefined) {
          input.attr('max', setting.max);
        }
      }
      if (setting.step) {
        input.attr('step', setting.step);
      }
      input.addClass('layerSetting');
      if (setting.hasOwnProperty('value')) {
        if ('checkbox' === setting.type) {
          input.prop('checked', !!setting.value);
        } else {
          input.attr('value', setting.value);
        }
      }
      if ('checkbox' === setting.type) {
        label.prepend(input);
      } else {
        element.append(input);
      }
    }
  }

  class SelectControl extends SettingControl {
    static createControl(setting, element, label) {
      var select = $('<select />').attr({
        'name': setting.name,
      });
      setting.options.forEach(function (option) {
        select.append($('<option />', {
            value: option[0],
            text: option[1]
        }));
      });
      select.val(setting.value);
      select.addClass('layerSetting');
      element.append(select);
    }
  }

  class ButtonControl extends SettingControl {
    static createControl(setting, element, label) {
      var controls = $('<span />')
        .addClass('layerSetting');
      setting.buttons.forEach(function(b) {
        var button = $('<button />')
          .addClass('layerSetting')
          .on('click', b.onclick)
          .append(b.name);
        this.append(button);
      }, controls);
      element.append(controls);
    }
  }

  LayerControl.SettingControls = {
    buttons: ButtonControl,
    checkbox: InputControl,
    number: InputControl,
    select: SelectControl,
    text: InputControl,
  };

  CATMAID.LayerControl = LayerControl;

})(CATMAID);
