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

    this.refresh = function()
    {

        var layers = stack.getLayers();
        
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

            var setOpacity = function( val )
            {
                layers[ key ].setOpacity( val / 100 );
                return;
            }

            var slider = new Slider(
                    SLIDER_HORIZONTAL,
                    false,
                    1,
                    100,
                    100,
                    100,
                    setOpacity );
            // XXX: not independent sliders
            container.innerHTML += key + "<br />";
            container.appendChild( slider.getView() );
            view.appendChild(container);
        }
    };

    // need to keep for each layer visibility & opacity
    var layers_state = {};

	var self = this;

	var view = document.createElement( "div" );
	view.className = "OverviewLayer";
    view.id = "OverviewLayer";
	// view.style.width = "300px";
	//view.style.height = "150px";
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
/*
      var createContainer = function(id) {
        var container = document.createElement("div");
        container.setAttribute("id", id);
        container.setAttribute("class", "sliceView");
        container.style.position = "relative";
        container.style.bottom = "0px";
        container.style.width = "100%";
        container.style.overflow = "auto";
        container.style.backgroundColor = "#ffffff";
        return container;
      };
*/


}

