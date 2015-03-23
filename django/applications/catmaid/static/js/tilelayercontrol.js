/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  Slider,
  SLIDER_HORIZONTAL
*/

(function(CATMAID) {

  "use strict";

  /**
   * The tilelayer control element on the top-left of the stack window
   */
  var TilelayerControl = function ( stack )
  {
    this.stack = stack;
    this.view = document.createElement( "div" );
    this.view.className = "TilelayerControl";
    this.view.id = "TilelayerControl" + stack.id;
    this.view.style.zIndex = 8;

    stack.getView().appendChild( this.view );
  };

  TilelayerControl.prototype = {};

  /**
   * get the view object
   */
  TilelayerControl.prototype.getView = function()
  {
    return this.view;
  };

  /**
   * removes existing layer controls and re-creates them.
   */
  TilelayerControl.prototype.refresh = function()
  {
    // Get current set of layers
    var stack = this.stack;
    var layers = stack.getLayers();
    var layerOrder = stack.getLayerOrder();

    // Empty container
    var $view = $(this.view);
    $view.empty();

    var benchmark = $view.siblings('.sliceBenchmark');
    var cb = $('<input/>')
        .attr('type', 'checkbox')
        .prop('checked', benchmark.is(':visible'))
        .change(function () {
          $view.siblings('.sliceBenchmark').toggle();
        });
    var label = $('<div/>')
        .addClass('setting')
        .append($('<label/>').append(cb).append('Show Scale Bar'));
    $view.append(label);
    $view.append('<h3>Layers by render order (drag to reorder)</h3>');
    var layerList = $('<ol/>');

    var setOpac = function (val) {
      var layers = stack.getLayers();

      if (!layers.hasOwnProperty(this.idd)) return;

      layers[this.idd].setOpacity(val);
      stack.redraw();
    };

    // Add slider for each layer
    for (var i = 0; i < layerOrder.length; i++) {
      var key = layerOrder[i];
      var layer = layers[key];
      var self = this;

      var container = $('<li/>');
      container.data('key', key);
      container.addClass('layerControl');
      if (layer.isOrderable) container.addClass('orderable');

      var layer_name = layer.getLayerName ? layer.getLayerName() : key;
      container.append($('<h4/>').append(layer_name));

      // Opacity slider
      var opacitySelect = $('<div class="setting"/>');
      opacitySelect.append('<span>Opacity</span>');

      // Make layer re-evaluate its opacity
      layer.setOpacity(layer.getOpacity());

      var slider = new Slider(
          SLIDER_HORIZONTAL,
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
          stack.getLayers()[key].setBlendMode(this.value);
          stack.redraw();
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
          var layer = stack.getLayers()[key];
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
                var layer = stack.getLayers()[key];
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
            var layer = stack.getLayers()[key];
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
        stack.moveLayer(ui.item.data('key'), beforeKey);
        stack.redraw();
      }
    });
  };

  CATMAID.TilelayerControl = TilelayerControl;

})(CATMAID);
