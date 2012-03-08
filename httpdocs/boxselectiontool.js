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
    this.zoomlevel = null;

    // Output unit and factor wrt. nm
    this.output_unit = unescape( "nm" )
    this.output_unit_factor = 1.0;
}

BoxSelectionTool.prototype.toPx = function( world_coord, resolution )
{
    return world_coord / resolution * this.stack.scale;
}

BoxSelectionTool.prototype.toWorld = function( px_coord, resolution )
{
    return px_coord / this.stack.scale * resolution;
}

/**
 * A method that expects a value in nano meters to convert
 * it depending on the tool settings.
 */
BoxSelectionTool.prototype.convertWorld = function( val )
{
    return val * this.output_unit_factor;
}

BoxSelectionTool.prototype.getScreenLeft = function()
{
    var stack = this.stack;
    return ( ( stack.x - stack.viewWidth / stack.scale / 2 ) + stack.translation.x ) * stack.resolution.x;
}

BoxSelectionTool.prototype.getScreenTop = function()
{
    var stack = this.stack;
    return ( ( stack.y - stack.viewHeight / stack.scale / 2 ) + stack.translation.y ) * stack.resolution.y;
}

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
}

/**
 * Updates the visual representation of the current crop box.
 */
BoxSelectionTool.prototype.updateCropBox = function()
{
    var cropBoxBB = this.getCropBoxBoundingBox();

    this.cropBox.view.style.left = cropBoxBB.left_px + "px";
    this.cropBox.view.style.top = cropBoxBB.top_px + "px";
    this.cropBox.view.style.width = cropBoxBB.width_px  + "px";
    this.cropBox.view.style.height = cropBoxBB.height_px  + "px";

    var world_unit = this.output_unit;
    var current_scale = this.stack.scale;
    var output_scale = 1 / Math.pow( 2, this.zoomlevel );
    var output_width_px = ( cropBoxBB.width_px / current_scale) * output_scale;
    var output_height_px = ( cropBoxBB.height_px / current_scale) * output_scale;
    var output_width_world = this.convertWorld( cropBoxBB.width_world );
    var output_height_world = this.convertWorld( cropBoxBB.height_world );

    statusBar.replaceLast( this.convertWorld( cropBoxBB.left_world).toFixed( 3 ) + ", " + this.convertWorld( cropBoxBB.top_world ).toFixed( 3 ) +
        " -> " + this.convertWorld( cropBoxBB.right_world ).toFixed( 3 ) + "," + this.convertWorld( cropBoxBB.bottom_world ).toFixed( 3 ) );

    this.cropBox.textWorld.replaceChild( document.createTextNode( output_width_world.toFixed( 3 ) + " x " + output_height_world.toFixed( 3 ) + " " + world_unit ), this.cropBox.textWorld.firstChild );
    this.cropBox.textScreen.replaceChild( document.createTextNode( output_width_px.toFixed( 0 ) + " x " + output_height_px.toFixed( 0 ) + " px" ), this.cropBox.textScreen.firstChild );

    return;
}

/**
 * Redraws the content.
 */
BoxSelectionTool.prototype.redraw = function()
{
    // update crop box if available
    if ( this.cropBox )
        this.updateCropBox();
}

/**
 * Creates a new crop box and attaches it to the view. Any existing
 * crop box gets removed first.
 */
BoxSelectionTool.prototype.createCropBox = function( screenX, screenY, screenWidth, screenHeight )
{
    if(typeof(screenWidth)==='undefined') screenWidth = 0;
    if(typeof(screenHeight)==='undefined') screenHeight = 0;

    stack = this.stack;
    view = stack.getView();
    if ( this.cropBox )
    {
        view.removeChild( this.cropBox.view );
        delete this.cropBox;
        this.cropBox = false;
    }
    this.cropBox = {
        left : (stack.x + ( screenX  - stack.viewWidth / 2 ) / stack.scale ) * stack.resolution.x + stack.translation.x,
        top : (stack.y + ( screenY - stack.viewHeight / 2 ) / stack.scale ) * stack.resolution.y + stack.translation.y
    };
    this.cropBox.right = this.cropBox.left + this.toWorld( screenWidth, stack.resolution.x );
    this.cropBox.bottom = this.cropBox.top + this.toWorld( screenHeight, stack.resolution.y );
    this.cropBox.view = document.createElement( "div" );
    this.cropBox.view.className = "cropBox";
    this.cropBox.textWorld = document.createElement( "p" );
    this.cropBox.textWorld.className = "world";
    this.cropBox.textWorld.appendChild( document.createTextNode( "0 x 0" ) );
    this.cropBox.textScreen = document.createElement( "p" );
    this.cropBox.textScreen.className = "screen";
    this.cropBox.textScreen.appendChild( document.createTextNode( "0 x 0" ) );
    this.cropBox.xdist = 0;
    this.cropBox.ydist = 0;
    this.cropBox.xorigin = this.cropBox.left;
    this.cropBox.yorigin = this.cropBox.top;

    this.cropBox.view.appendChild( this.cropBox.textWorld );
    this.cropBox.view.appendChild( this.cropBox.textScreen );
    view.appendChild( this.cropBox.view );
}

/**
 * unregister all project related GUI control connections and event
 * handlers, toggle off tool activity signals (like buttons)
 */
BoxSelectionTool.prototype.destroy = function()
{
    if ( this.cropBox )
    {
        this.stack.getView().removeChild( this.cropBox.view );
        delete this.cropBox;
        this.cropBox = false;
    }

    this.stack = null;

    return;
}

/**
* install this tool in a stack.
* register all GUI control elements and event handlers
*/
BoxSelectionTool.prototype.register = function( parentStack )
{
    /* It could happen that register is called on a different stack than
    the one the tool is currently installed for. In that case we need
    to destroy the previous link to a stack. */
    if ( this.stack )
        this.destroy();

    this.stack = parentStack;
    this.zoomlevel = this.stack.s;

    return;
}

