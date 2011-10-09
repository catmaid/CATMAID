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
            var container = document.createElement("div");

            var setOpac = function ( val )
            {
                self.setOpacity( this.idd, val );
                return;
            }

            var slider = new Slider(
                    SLIDER_HORIZONTAL,
                    false,
                    1,
                    100,
                    100,
                    100,
                    setOpac );

            slider.idd = key;
            container.innerHTML += key + "<br />";
            container.appendChild( slider.getView() );
            view.appendChild(container);
        }
    };

	var self = this;

    self.layers = stack.getLayers();

	var view = document.createElement( "div" );
	view.className = "OverviewLayer";
    view.id = "OverviewLayer";
	// view.style.width = "300px";
	//view.style.height = "150px";
    //view.style.backgroundColor = "#FF0000";
    view.style.zIndex = 6;




}

