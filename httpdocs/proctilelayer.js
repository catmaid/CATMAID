/**
 * proctilelayer.js
 *
 * requirements:
 *   tilelayer.js
 *
 */

/**
 * A tile layer that allows on-the-fly processing of the
 * stack's tiles by calling a manipulation script.
 */
function ProcTileLayer(
        stack,                      //!< reference to the parent stack
        baseURL,                    //!< base URL for image tiles
        tileWidth,
        tileHeight,
        fileExtension,
        tileSourceType
        )
{
    // call super constructor
    TileLayer.call(this, stack, baseURL, tileWidth, tileHeight, fileExtension, tileSourceType);

    // override URL creation function - Python version
    this.getTileURL = function( tileBaseName, slice, x_tile, y_tile, zoom_level )
    {
        var sids = [];
        var ints = [];
        for (var s in self.adjustable_stacks)
        {
            sids.push( s );
            ints.push( self.adjustable_stacks[ s ].intensity );
        }
        url = django_url + project.id + "/stack/" + sids.join() + "/combine_tiles/"
            + slice + "/" + x_tile + "/" + y_tile + "/" + zoom_level + "/" + ints.join() + "/";
        return url;
    };

    // sets the intensity of stack with id s to val
    this.setIntensity = function( s, val )
    {
        // set the intensity
        self.adjustable_stacks[ s ].intensity = val;
        // display some status information
        var title = self.adjustable_stacks[ s ].data.title;
        var percent = val.toFixed( 0 );
        statusBar.replaceLast( "Setting intensity of stack \"" + title  + "\" to " + percent + "%" );
        // update the screen
        self.redraw();
    };

    // initialization

    var self = this;

    var view = document.createElement( "div" );
    view.className = "IntensityLayer";
    view.id = "IntensityLayer";
    view.style.zIndex = 6;

    // create a slider for each stack available
    var project = stack.getProject();
    var stacks = projects_available[project.id];
    self.adjustable_stacks = new Array();
    for ( var s in stacks )
    {
        var container = document.createElement("div");
        var default_intensity = 100;

        var handler = function( val )
        {
            self.setIntensity( this.stackid, val );
        };
        var slider = new Slider(
                        SLIDER_HORIZONTAL,
                        false,
                        0,
                        300,
                        31,
                        default_intensity,
                        handler );

        slider.setByValue( default_intensity, true );
        slider.stackid = s;
        container.className = "IntensityBox";
        container.innerHTML += "Intensity of " + stacks[s].title + "<br />";
        container.appendChild( slider.getView() );
        view.appendChild(container);
        // fill stack data structure
        self.adjustable_stacks[ s ] = {
            intensity : default_intensity,
            data : stacks[s],
            slider : slider
        }
    };

    stack.getView().appendChild( view );

    return this;
}
extend( ProcTileLayer, TileLayer );

