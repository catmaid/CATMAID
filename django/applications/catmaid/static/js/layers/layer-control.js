/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
    this.view.id = "LayerControl" + stackViewer.id;
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
        var settings = layer.getLayerSettings();
        if (0 < settings.length) {
          var layerSettings = $('<div />');
          for (var j=0; j<settings.length; ++j) {
            var setting = settings[j];
            var settingElement = $('<div />').addClass('setting');
            var label = $('<label />').append(setting.displayName);
            settingElement.append(label);
            label.attr('title', setting.help);
            if ('text' === setting.type || 'number' === setting.type || 'checkbox' == setting.type) {
              var input = $('<input />').attr({
                'type': setting.type,
                'placeholder': '(none)',
                'name': setting.name
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
                settingElement.append(input);
              }

            } else if ('select' === setting.type) {
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
              settingElement.append(select);
            } else if ('buttons' === setting.type) {
              var controls = $('<span />')
                .addClass('layerSetting');
              setting.buttons.forEach(function(b) {
                var button = $('<button />')
                  .addClass('layerSetting')
                  .on('click', b.onclick)
                  .append(b.name);
                this.append(button);
              }, controls);
              settingElement.append(controls);
            }
            layerSettings.append(settingElement);
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

      // Blend mode
      if (layer.getAvailableBlendModes) {
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

  CATMAID.LayerControl = LayerControl;

})(CATMAID);
