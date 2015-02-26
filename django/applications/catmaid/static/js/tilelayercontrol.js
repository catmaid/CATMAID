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
    this.view.id = "TilelayerControl";
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

    // Empty container
    $(this.view).empty();

    // Add slider for each layer
    for(var key in layers)
    {

      var container = document.createElement("div");

      var setOpac = function ( val )
      {
        this.setOpacity( this.idd, val );
        stack.redraw();
        return;
      };

      // Make layer re-evaluate it's opacity
      layers[key].setOpacity(layers[key].getOpacity());

      var slider = new Slider(
          SLIDER_HORIZONTAL,
          false,
          0,
          100,
          101,
          layers[key].getOpacity() * 100,
          setOpac );

      slider.idd = key;
      container.setAttribute("id", key + "-container");
      container.setAttribute("class", "layerControl");

      var layer_name = layers[key].getLayerName ? layers[key].getLayerName() : key;
      container.appendChild(document.createElement("strong").appendChild(
          document.createTextNode(layer_name)));
      container.appendChild( slider.getView() );

      // A clearing div is needed, because sliders are usually floating.
      // See i.e. http://stackoverflow.com/questions/14758932
      var clearing = document.createElement('div');
      clearing.setAttribute('class', 'clear');
      container.appendChild(clearing);

      this.view.appendChild(container);
    }
  };

  CATMAID.TilelayerControl = TilelayerControl;

})(CATMAID);
