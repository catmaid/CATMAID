/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * The tilelayer control element on the top-left of the stack window
 */
function TilelayerControl( stack )
{
  var self = this;

  /**
   * get the view object
   */
  self.getView = function()
  {
    return view;
  }

  /**
   * set opacity for a layer
   */
  self.setOpacity = function ( key, val )
  {
    // Get current set of layers
    var layers = stack.getLayers();

    if(layers.hasOwnProperty(key))
      layers[key].setOpacity( val / 100 );
  }

  /**
   * removes existing layer controls and re-creates them.
   */
  self.refresh = function()
  {
    // Get current set of layers
    var layers = stack.getLayers();

    // Empty container
    $(view).empty()

    // Add slider for each layer
    for(var key in layers)
    {

      var container = document.createElement("div");

      var setOpac = function ( val )
      {
        self.setOpacity( this.idd, val );
        stack.redraw();
        return;
      }

      // Make layer re-evaluate it's opacity
      layers[key].setOpacity(layers[key].getOpacity());

      var slider = new Slider(
          SLIDER_HORIZONTAL,
          false,
          1,
          100,
          100,
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

      view.appendChild(container);
    }
  };

  var view = document.createElement( "div" );
  view.className = "TilelayerControl";
  view.id = "TilelayerControl";
  view.style.zIndex = 8;

  stack.getView().appendChild( view );
};
