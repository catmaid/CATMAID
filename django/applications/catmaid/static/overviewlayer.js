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

  /**
	 * set opacity for a layer
	 */
	this.setOpacity = function ( key, val )
	{
		self.layers[key].setOpacity( val / 100 );
	}

	this.refresh = function()
	{
		var layers = stack.getLayers();
		self.sliderfunct = {};
		self.sliderslider = {};

		if ( view.hasChildNodes() )
		{
			while ( view.childNodes.length >= 1 )
			{
				view.removeChild( view.firstChild );
			}
		}

		for( var key in layers)
		{
			var container = document.createElement("div"), default_opacity = 100;

			var setOpac = function ( val )
			{
				self.setOpacity( this.idd, val );
				return;
			}

			if(layers[key].hasOwnProperty('getOpacity'))
			{
				default_opacity = layers[key].getOpacity();
			}
			
			var slider = new Slider(
							SLIDER_HORIZONTAL,
							false,
							1,
							100,
							100,
							default_opacity,
							setOpac );

			slider.idd = key;
			// container.innerHTML += "<input type='checkbox' name='" + key + "-check' id='" + key + "-check' checked>" + key + "<br />";
			container.innerHTML += "<button type='button' id='"+ key + "-button'>" + key + "</button><br />";
			container.setAttribute("id", key + "-container");
			
			container.appendChild( slider.getView() );
			view.appendChild(container);

			self.setButtonHandle( key );

		}
	};

	this.setButtonHandle = function( key ) {
		$('#'+ key + '-button').click(function() {
			if( !self.layers[key].visible ) {
				self.layers[key].reattachTileLayer();
			} else {
				self.layers[key].isolateTileLayer();
			}
	    });
	}

	var self = this;

	self.layers = stack.getLayers();

	var view = document.createElement( "div" );
	view.className = "OverviewLayer";
	view.id = "OverviewLayer";
	view.style.zIndex = 8;

}

