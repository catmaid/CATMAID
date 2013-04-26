/**
 * boxselectiontool.js
 *
 * requirements:
 *   tools.js
 *   slider.js
 *   stack.js
 */

/**
 * Box selection tool. Allows drawing of a box on the view.
 */
function BoxSelectionTool()
{
    this.stack = null;
    this.cropBox = false;
    this.cropBoxCache = {};
    this.zoomlevel = null;

    // Output unit and factor wrt. nm
    this.output_unit = unescape( "nm" );
    this.output_unit_factor = 1.0;

    this.getCropBox = function()
    {
        return this.cropBox;
    };
};

BoxSelectionTool.prototype.toPx = function( world_coord, resolution )
{
    return world_coord / resolution * this.stack.scale;
};

BoxSelectionTool.prototype.toWorld = function( px_coord, resolution )
{
    return px_coord / this.stack.scale * resolution;
};

/**
 * A method that expects a value in nano meters to convert
 * it depending on the tool settings.
 */
BoxSelectionTool.prototype.convertWorld = function( val )
{
    return val * this.output_unit_factor;
};

BoxSelectionTool.prototype.getScreenLeft = function()
{
    var stack = this.stack;
    return ( ( stack.x - stack.viewWidth / stack.scale / 2 ) + stack.translation.x ) * stack.resolution.x;
};

BoxSelectionTool.prototype.getScreenTop = function()
{
    var stack = this.stack;
    return ( ( stack.y - stack.viewHeight / stack.scale / 2 ) + stack.translation.y ) * stack.resolution.y;
};

/**
 * Gets the bounding box of the current crop box in world
 * and pixel coordinates.
 */
BoxSelectionTool.prototype.getCropBoxBoundingBox = function()
{
    var t = Math.min( this.cropBox.top, this.cropBox.bottom );
    var b = Math.max( this.cropBox.top, this.cropBox.bottom );
    var l = Math.min( this.cropBox.left, this.cropBox.right );
    var r = Math.max( this.cropBox.left, this.cropBox.right );
    var width = r - l;
    var height = b - t;
    //! left-most border of the view in physical project coordinates
    var screen_left = this.getScreenLeft();
    var screen_top = this.getScreenTop();

    var rx = this.stack.resolution.x / this.stack.scale;
    var ry = this.stack.resolution.y / this.stack.scale;

    var left_px = Math.floor( ( l - screen_left ) / rx );
    var top_px = Math.floor( ( t - screen_top ) / ry );
    var width_px = Math.floor( ( r - l ) / rx );
    var height_px = Math.floor( ( b - t ) / ry );
    var right_px = left_px + width_px;
    var bottom_px = top_px + height_px;

    return { left_world : l, top_world : t, right_world : r, bottom_world : b, width_world : width, height_world : height,
             left_px : left_px, top_px : top_px, right_px : right_px, bottom_px : bottom_px, width_px : width_px, height_px : height_px }
};

/**
 * Updates the visual representation of the current crop box.
 */
BoxSelectionTool.prototype.updateCropBox = function()
{
    var cropBoxBB = this.getCropBoxBoundingBox();

    // update all cached cropping boxes
    for ( var s in this.cropBoxCache )
    {
        var cb = this.cropBoxCache[ s ];

        cb.view.style.visibility = "visible";
        cb.view.style.left = cropBoxBB.left_px + "px";
        cb.view.style.top = cropBoxBB.top_px + "px";
        cb.view.style.width = cropBoxBB.width_px  + "px";
        cb.view.style.height = cropBoxBB.height_px  + "px";

        var world_unit = this.output_unit;
        var current_scale = this.stack.scale;
        var output_scale = 1 / Math.pow( 2, this.zoomlevel );
        var output_width_px = ( cropBoxBB.width_px / current_scale) * output_scale;
        var output_height_px = ( cropBoxBB.height_px / current_scale) * output_scale;
        var output_width_world = this.convertWorld( cropBoxBB.width_world );
        var output_height_world = this.convertWorld( cropBoxBB.height_world );

        cb.textWorld.replaceChild( document.createTextNode( output_width_world.toFixed( 3 ) + " x " + output_height_world.toFixed( 3 ) + " " + world_unit ), cb.textWorld.firstChild );
        cb.textScreen.replaceChild( document.createTextNode( output_width_px.toFixed( 0 ) + " x " + output_height_px.toFixed( 0 ) + " px" ), cb.textScreen.firstChild );
    }

    statusBar.replaceLast( this.convertWorld( cropBoxBB.left_world).toFixed( 3 ) + ", " + this.convertWorld( cropBoxBB.top_world ).toFixed( 3 ) +
        " -> " + this.convertWorld( cropBoxBB.right_world ).toFixed( 3 ) + "," + this.convertWorld( cropBoxBB.bottom_world ).toFixed( 3 ) );

    return;
};

/**
 * Redraws the content.
 */
BoxSelectionTool.prototype.redraw = function()
{
    // update crop box if available
    if ( this.cropBox )
        this.updateCropBox();
};

/**
 * Creates a new cropping box and attaches it to the stack.
 */
BoxSelectionTool.prototype.initCropBox = function( stack )
{
    var view = stack.getView();
    var cb = {};
    cb.view = document.createElement( "div" );
    cb.view.className = "cropBox";
    cb.view.style.visibility = "hidden";
    cb.textWorld = document.createElement( "p" );
    cb.textWorld.className = "world";
    cb.textWorld.appendChild( document.createTextNode( "0 x 0" ) );
    cb.textScreen = document.createElement( "p" );
    cb.textScreen.className = "screen";
    cb.textScreen.appendChild( document.createTextNode( "0 x 0" ) );
    cb.view.appendChild( cb.textWorld );
    cb.view.appendChild( cb.textScreen );
    view.appendChild( cb.view );
    cb.stack = stack;

    return cb;
};

/**
 * Creates a new crop box and attaches it to the view. Its position and extent
 * are expected to be in screen coordinates. Any existing crop box gets removed
 * first.
 */
BoxSelectionTool.prototype.createCropBox = function( screenX, screenY, screenWidth, screenHeight )
{
    if(typeof(screenWidth)==='undefined') screenWidth = 0;
    if(typeof(screenHeight)==='undefined') screenHeight = 0;
    var s = this.stack;
    var worldX = (s.x + ( screenX  - s.viewWidth / 2 ) / s.scale ) * s.resolution.x;
    var worldY = (s.y + ( screenY - s.viewHeight / 2 ) / s.scale ) * s.resolution.y;
    var worldWidth = this.toWorld( screenWidth, s.resolution.x );
    var worldHeight = this.toWorld( screenHeight, s.resolution.y );

    this.createCropBoxByWorld(worldX, worldY, worldWidth, worldHeight);
};

/**
 * Creates a new crop box and attaches it to the view. Its position and extent
 * are expected to be in world coordinates. Any existing crop box gets removed
 * first.
 */
BoxSelectionTool.prototype.createCropBoxByWorld = function( worldX, worldY, worldWidth, worldHeight )
{
    var view = this.stack.getView();
    if ( this.cropBox && this.cropBox.view.parentNode == view )
    {
        view.removeChild( this.cropBox.view );
        delete this.cropBox;
        this.cropBox = false;
    }
    this.cropBox = this.initCropBox( this.stack );
    this.cropBox.left = worldX + this.stack.translation.x;
    this.cropBox.top = worldY + this.stack.translation.y;
    this.cropBox.right = this.cropBox.left + worldWidth;
    this.cropBox.bottom = this.cropBox.top + worldHeight;
    this.cropBox.xdist = 0;
    this.cropBox.ydist = 0;
    this.cropBox.xorigin = this.cropBox.left;
    this.cropBox.yorigin = this.cropBox.top;

    // update the cache
    this.cropBoxCache[ this.stack.getId() ] = this.cropBox;

    // update other (passive) crop boxes
    this.updateCropBox();
};

/**
 * unregister all project related GUI control connections and event
 * handlers, toggle off tool activity signals (like buttons)
 */
BoxSelectionTool.prototype.destroy = function()
{
    // clear cache
    for ( var s in this.cropBoxCache )
    {
        var cb = this.cropBoxCache[ s ];
        cb.stack.getView().removeChild( cb.view );
        delete this.cropBoxCache[ s ];
    }
    this.cropBoxCache = {};
    this.cropBox = false;

    this.stack = null;

    return;
};

/**
* install this tool in a stack.
* register all GUI control elements and event handlers
*/
BoxSelectionTool.prototype.register = function( parentStack )
{
    // make sure the tool knows all (and only) open projecs
    var project = parentStack.getProject();
    var stacks = projects_available[ project.id ];
    for (var s in stacks)
    {
        var id = stacks[ s ].id
        var opened_stack = project.getStack( id );
        if ( id in this.cropBoxCache )
        {
            // remove the entry if the project isn't opened
            if ( !opened_stack )
                delete this.cropBoxCache[ id ];
        }
        else
        {
            // make sure it has got a cropping box container in the cache
            if ( opened_stack )
                this.cropBoxCache[ id ] = this.initCropBox( opened_stack );
        }
    }

    // bring a cached version back to life and
    // deactivate other available cropping boxes
    for ( var s in this.cropBoxCache )
    {
        var cb = this.cropBoxCache[ s ];
        if (cb.stack == parentStack)
        {
            this.cropBox = cb;
            this.cropBox.view.className = "cropBox";
        }
        else
        {
            cb.view.className = "cropBoxNonActive";
        }
    }

    this.stack = parentStack;
    this.zoomlevel = this.stack.s;

    return;
};

