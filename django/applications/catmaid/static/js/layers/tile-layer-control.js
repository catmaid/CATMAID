/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The tilelayer control element on the top-left of the stackViewer window
   */
  var TileLayerControl = function ( stackViewer )
  {
    this.stackViewer = stackViewer;
    this.view = document.createElement( "div" );
    this.view.className = "TileLayerControl";
    this.view.id = "TileLayerControl" + stackViewer.id;
    this.view.style.zIndex = 8;

    stackViewer.getView().appendChild( this.view );
  };

  TileLayerControl.prototype = {};

  /**
   * get the view object
   */
  TileLayerControl.prototype.getView = function()
  {
    return this.view;
  };

  /**
   * removes existing layer controls and re-creates them.
   */
  TileLayerControl.prototype.refresh = function()
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

    var benchmark = $view.siblings('.sliceBenchmark');
    var cb = $('<input/>')
        .attr('type', 'checkbox')
        .prop('checked', benchmark.is(':visible'))
        .change(function () {
          $view.siblings('.sliceBenchmark').toggle();
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

    $view.append('<h3>Layers by render order (drag to reorder)</h3>');
    var layerList = $('<ol/>');

    var setOpac = function (val) {
      var layer = stackViewer.getLayer(this.idd);

      if (!layer) return;

      layer.setOpacity(val);
      stackViewer.redraw();
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
            .append($('<input type="button" value="x" class="remove"/>').click(function () {
              stackViewer.removeLayer(key);
              stackViewer.redraw();
            })));
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

        blendLabel.append(blendSelect);
        container.append($('<div class="setting"/>').append(blendLabel));
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
        container.append($('<div class="setting"/>').append(filterLabel));

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

  CATMAID.TileLayerControl = TileLayerControl;

})(CATMAID);
