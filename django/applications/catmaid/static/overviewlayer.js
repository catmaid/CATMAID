/**
 * Overview Layer navigator widget
 */
function OverviewLayer( stack )
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
		if(self.layers.hasOwnProperty(key))
			self.layers[key].setOpacity( val / 100 );
	}

	self.refresh = function()
	{
		for( var key in self.layers)
		{
			
			var container = document.createElement("div");

			var setOpac = function ( val )
			{
				self.setOpacity( this.idd, val );
				stack.redraw();
				return;
			}
			
			self.layers[key].updateOpacity();

			var slider = new Slider(
							SLIDER_HORIZONTAL,
							false,
							1,
							100,
							100,
							self.layers[key].getOpacity() * 100,
							setOpac );

			slider.idd = key;
			container.setAttribute("id", key + "-container");
			container.appendChild( document.createElement("strong").appendChild( document.createTextNode(key)) );
			container.appendChild( slider.getView() );
			view.appendChild(container);

		}
	};

	self.layers = stack.getLayers();

	var view = document.createElement( "div" );
	view.className = "OverviewLayer";
	view.id = "OverviewLayer";
	view.style.zIndex = 8;

	stack.getView().appendChild( view );

}

