/**
 * Overview Layer navigator widget
 */
function OverviewLayer( stack )
{
	/**
	 * get the view object
	 */
	this.getView = function()
	{
		return view;
	}

	
	this.redraw = function()
	{
        
		for ( var layer in layers )
			layers[ layer ].redraw();
		
		return;
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
		return;
	}
	
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
	}
	
	var self = this;
	
	var layers = {};
	
	var view = document.createElement( "div" );
	view.className = "box";
    view.id = "OverviewLayer";
	//view.style.width = "300px";
	view.style.height = "150px";

    //view.style.backgroundColor = "#FF0000";
    view.style.zIndex = 6;

    var slider = new Slider(
            SLIDER_HORIZONTAL,
            false,
            1,
            100,
            100,
            50,
            function( val ){
                //console.log( val );
                var st = stack.getLayer( "TileLayer2");
                st.setOpacity( val / 100 );
                return;
            } );

    var stackname = document.createTextNode("Tile Layer 2");
    var para = document.createElement("p");
    para.appendChild( stackname );
    view.appendChild( para );
    view.appendChild( slider.getView() );

}

