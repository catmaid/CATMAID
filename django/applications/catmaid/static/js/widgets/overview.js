(function(CATMAID) {

  /**
   * Overview navigator widget
   */
  function Overview(stackViewer, showByDefault = true)
  {
    /**
     * get the view object
     */
    this.getView = function()
    {
      return view;
    };

    var onpointerdown =
    {
      jump : function( e )
      {
        var m = CATMAID.ui.getMouse( e, self.getView() );
        if ( m )
        {
          stackViewer.moveToPixel( stackViewer.z, Math.round( m.offsetY / scale ), Math.round( m.offsetX / scale ), stackViewer.s );
        }
        return false;
      },
      drag : function( e )
      {
        CATMAID.ui.registerEvent( "onpointermove", onpointermove );
        CATMAID.ui.registerEvent( "onpointerup", onpointerup );
        CATMAID.ui.catchEvents( "move" );
        CATMAID.ui.onpointerdown( e );

        CATMAID.ui.catchFocus();

        return false;
      }
    };

    var onpointermove = function( e )
    {
      stackViewer.moveToPixel( stackViewer.z,
                             stackViewer.y + CATMAID.ui.diffY / scale,
                             stackViewer.x + CATMAID.ui.diffX / scale,
                             stackViewer.s );
      return false;
    };

    var onpointerup = function( e )
    {
      CATMAID.ui.releaseEvents();
      CATMAID.ui.removeEvent( "onpointermove", onpointermove );
      CATMAID.ui.removeEvent( "onpointerup", onpointerup );
      return false;
    };

    this.redraw = function()
    {
      // If it is minimized, don't redraw. Avoids fetching and decoding an extra jpeg
      if ( view.classList.contains( 'smallMapView_hidden' ) ) return;

      if ( typeof scale === "undefined" )
      {
        let style = window.getComputedStyle(view);
        var scaleY = parseInt(style['max-height']) / maxY;
        var scaleX = parseInt(style['max-width']) / maxX;
        scale = Math.min( scaleX, scaleY );
      }

      var height = scale / stackViewer.scale * stackViewer.viewHeight;
      var width = scale / stackViewer.scale * stackViewer.viewWidth;
      rect.style.height = Math.floor( height ) + "px";
      rect.style.width = Math.floor( width ) + "px";
      rect.style.top = Math.floor( scale * stackViewer.y - height / 2 ) + "px";
      rect.style.left = Math.floor( scale * stackViewer.x - width / 2 ) + "px";

      for ( var layer in layers )
        layers[ layer ].redraw();
    };

    /**
     * Add a layer.  Layers are associated by a unique key.
     * If a layer with the passed key exists, then this layer will be replaced.
     *
     * @param key
     * @param layer
     */
    this.addLayer = function( key, layer )
    {
      if ( layers[ key ] )
        layers[ key ].unregister();
      layers[ key ] = layer;
    };

    /**
     * Remove a layer specified by its key.  If no layer with this key exists,
     * then nothing will happen.  The layer is returned;
     *
     */
    this.removeLayer = function( key )
    {
      var layer = layers[ key ];
      if ( typeof layer != "undefined" && layer )
      {
        layer.unregister();
        delete layers[ key ];
        return layer;
      }
      else
        return null;
    };

    var self = this;

    var layers = {};

    // initialize
    var maxX = stackViewer.primaryStack.dimension.x - 1;
    var maxY = stackViewer.primaryStack.dimension.y - 1;
    var scale;

    var view = document.createElement( "div" );
    view.className = "smallMapView";
    view.onpointerdown = onpointerdown.jump;

    var rect = document.createElement( "div" );
    rect.className = "smallMapRect";
    rect.onpointerdown = onpointerdown.drag;
    view.appendChild( rect );

    this.hide = function() {
      toggle.title = "show overview";
      view.className = "smallMapView_hidden";
    };

    this.show = function() {
      toggle.title = "hide overview";
      view.className = "smallMapView";
      self.redraw();
    };

    var toggle = document.createElement( "div" );
    toggle.className = "smallMapToggle";
    toggle.title = "hide general view";
    toggle.onpointerdown = function( e )
    {
      if (typeof event != "undefined" && event) {
        event.cancelBubble = true;
      }
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }

      if ( view.className == "smallMapView_hidden" ) {
        self.show();
      } else {
        self.hide();
      }
      return false;
    };

    view.appendChild( toggle );

    if (!showByDefault) {
      self.hide();
    }
  }

  // Make Overview available in CATMAID namespace
  CATMAID.Overview = Overview;

})(CATMAID);
