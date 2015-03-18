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
   * set opacity for a layer
   */
  TilelayerControl.prototype.setOpacity = function ( key, val )
  {
    // Get current set of layers
    var layers = this.stack.getLayers();

    if(layers.hasOwnProperty(key))
      layers[key].setOpacity( val / 100 );
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
    var self = this;

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
        .append($('<label/>').append(cb).append('Show Benchmark'));
    $view.append(label);
    var layerList = $('<ol/>');

    // Add slider for each layer
    for (var i = 0; i < layerOrder.length; i++) {
      var key = layerOrder[i];
      var layer = layers[key];

      var container = $('<li/>');

      var setOpac = function ( val )
      {
        self.setOpacity( this.idd, val );
        stack.redraw();
        return;
      };

      // Make layer re-evaluate it's opacity
      layer.setOpacity(layer.getOpacity());

      var slider = new Slider(
          SLIDER_HORIZONTAL,
          false,
          0,
          100,
          101,
          layer.getOpacity() * 100,
          setOpac );

      slider.idd = key;
      container.attr('id', key + '-container');
      container.data('key', key);
      container.addClass('layerControl');
      if (layer.isOrderable) container.addClass('orderable');

      var layer_name = layer.getLayerName ? layer.getLayerName() : key;
      container.append($('<h4/>').append(layer_name));
      container.append($('<span>Opacity</span>'));
      container.append(slider.getView());

      layerList.append(container);
    }

    $view.append(layerList);

    // Make layer list reorderable by dragging layers.
    layerList.sortable({
      items: 'li.orderable',
      update: function (event, ui) {
        var beforeKey = ui.item.next().data('key') || null;
        stack.moveLayer(ui.item.data('key'), beforeKey);
        stack.redraw();
      }
    });
  };

  CATMAID.TilelayerControl = TilelayerControl;

})(CATMAID);
