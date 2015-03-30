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
}

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

BoxSelectionTool.prototype.getScreenLeft = function(stack)
{
    return ( ( stack.x - stack.viewWidth / stack.scale / 2 ) +
        stack.translation.x ) * stack.resolution.x;
};

BoxSelectionTool.prototype.getScreenTop = function(stack)
{
    return ( ( stack.y - stack.viewHeight / stack.scale / 2 ) +
        stack.translation.y ) * stack.resolution.y;
};

/**
 * Gets the bounding box of the current crop box in world
 * and pixel coordinates.
 */
BoxSelectionTool.prototype.getCropBoxBoundingBox = function(stack)
{
    var t = Math.min( this.cropBox.top, this.cropBox.bottom );
    var b = Math.max( this.cropBox.top, this.cropBox.bottom );
    var l = Math.min( this.cropBox.left, this.cropBox.right );
    var r = Math.max( this.cropBox.left, this.cropBox.right );
    var width = r - l;
    var height = b - t;
    //! left-most border of the view in physical project coordinates
    var screen_left = this.getScreenLeft(stack);
    var screen_top = this.getScreenTop(stack);

    var rx = stack.resolution.x / stack.scale;
    var ry = stack.resolution.y / stack.scale;

    var left_px = Math.floor( ( l - screen_left ) / rx );
    var top_px = Math.floor( ( t - screen_top ) / ry );
    var width_px = Math.floor( ( r - l ) / rx );
    var height_px = Math.floor( ( b - t ) / ry );
    var right_px = left_px + width_px;
    var bottom_px = top_px + height_px;

    return { left_world : l, top_world : t,
             right_world : r, bottom_world : b,
             width_world : width, height_world : height,
             left_px : left_px, top_px : top_px,
             right_px : right_px, bottom_px : bottom_px,
             width_px : width_px, height_px : height_px,
             rotation_cw: this.cropBox.rotation_cw };
};

/**
 * Updates the visual representation of the current crop box.
 */
BoxSelectionTool.prototype.updateCropBox = function()
{
    // update all cached cropping boxes
    for ( var s in this.cropBoxCache )
    {
        var cb = this.cropBoxCache[ s ];
        cb.layer.redraw();
    }

    return;
};

/**
 * Redraws the content.
 */
BoxSelectionTool.prototype.redraw = function()
{
    // nothing to do here
};

/**
 * Creates a new cropping box and attaches it to the stack.
 */
BoxSelectionTool.prototype.initCropBox = function( stack )
{
    var cb = {};
    cb.stack = stack;

    // Add new layer (it removes existing ones by itself)
    cb.layer = new BoxSelectionLayer(stack, this, cb);
    stack.addLayer("BoxSelectionLayer", cb.layer);

    return cb;
};

/**
 * Creates a new crop box and attaches it to the view. Its position and extent
 * are expected to be in screen coordinates. Any existing crop box gets removed
 * first.
 */
BoxSelectionTool.prototype.createCropBox = function( screenX, screenY,
    screenWidth, screenHeight )
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
BoxSelectionTool.prototype.createCropBoxByWorld = function( worldX,
    worldY, worldWidth, worldHeight, rotation_cw )
{
    var view = this.stack.getView();
    if ( this.cropBox )
    {
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
    this.cropBox.rotation_cw = rotation_cw ? rotation_cw : 0;

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
        cb.stack.removeLayer( "BoxSelectionLayer" );
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
    var self = this;
    // make sure the tool knows all (and only) open projecs
    getStackMenuInfo(project.id, function(stacks) {
        $.each(stacks, function(i, s) {
            var id = s.id;
            var opened_stack = project.getStack( id );
            if ( id in self.cropBoxCache )
            {
                // remove the entry if the project isn't opened
                if ( !opened_stack )
                    delete self.cropBoxCache[ id ];
            }
            else
            {
                // make sure it has got a cropping box container in the cache
                if ( opened_stack )
                    self.cropBoxCache[ id ] = self.initCropBox( opened_stack );
            }
        });

        // bring a cached version back to life and
        // deactivate other available cropping boxes
        for ( var s in self.cropBoxCache )
        {
            var cb = self.cropBoxCache[ s ];
            var is_active = (cb.stack == parentStack);
            cb.layer.setActive( is_active );
            if (is_active)
                self.cropBox = cb;
        }
    });

    this.stack = parentStack;
    this.zoomlevel = this.stack.s;

    return;
};

/**
 * The box selection layer that hosts the a box selection/region of
 * interest.
 */
function BoxSelectionLayer( stack, tool, crop_box)
{
    this.setOpacity = function( val )
    {
        view.style.opacity = val;
        opacity = val;
    };

    this.getOpacity = function()
    {
        return opacity;
    };

    this.redraw = function(completionCallback)
    {
        var cropBoxBB = tool.getCropBoxBoundingBox(stack);

        // Size and positioning
        view.style.visibility = "visible";
        view.style.left = cropBoxBB.left_px + "px";
        view.style.top = cropBoxBB.top_px + "px";
        view.style.width = cropBoxBB.width_px  + "px";
        view.style.height = cropBoxBB.height_px  + "px";

        // Rotation
        var rotation_cmd = "rotate(" + cropBoxBB.rotation_cw + "deg)";
        view.style.webkitTransform = rotation_cmd;
        view.style.MozTransform = rotation_cmd;
        view.style.msTransform = rotation_cmd;
        view.style.OTransform = rotation_cmd;
        view.style.transform = rotation_cmd;

        var current_scale = stack.scale;
        var output_scale = 1 / Math.pow( 2, tool.zoomlevel );
        var output_width_px = ( cropBoxBB.width_px / current_scale) * output_scale;
        var output_height_px = ( cropBoxBB.height_px / current_scale) * output_scale;
        var output_width_world = tool.convertWorld( cropBoxBB.width_world );
        var output_height_world = tool.convertWorld( cropBoxBB.height_world );

        // Update text nodes
        textWorld.replaceChild( document.createTextNode(
            output_width_world.toFixed( 3 ) + " x " +
            output_height_world.toFixed( 3 ) + " " + tool.output_unit ),
            textWorld.firstChild );
        textScreen.replaceChild( document.createTextNode(
            output_width_px.toFixed( 0 ) + " x " +
            output_height_px.toFixed( 0 ) + " px" ),
            textScreen.firstChild );

        // let active crop box show status info
        if (is_active) {
            CATMAID.statusBar.replaceLast(
                tool.convertWorld(cropBoxBB.left_world).toFixed( 3 ) + ", " +
                tool.convertWorld( cropBoxBB.top_world ).toFixed( 3 ) + " -> " +
                tool.convertWorld( cropBoxBB.right_world ).toFixed( 3 ) + "," +
                tool.convertWorld( cropBoxBB.bottom_world ).toFixed( 3 ) );
        }

        if (completionCallback) {
            completionCallback();
        }

        return;
    };

    this.resize = function( width, height )
    {
        return;
    };

    this.show = function ()
    {
        view.style.display = "block";
    };

    this.hide = function ()
    {
        view.style.display = "none";
    };

    this.getView = function()
    {
        return view;
    };

    this.unregister = function()
    {
        if ( stack && view.parentNode == stack.getView() )
            stack.getView().removeChild( view );
    };

    this.setActive = function( active )
    {
        is_active = active;

        if (active)
            view.className = "cropBox";
        else
            view.className = "cropBoxNonActive";
    };

    var self = this;

    // indicates if this the currently active crop box
    var is_active = true;

    var stack = stack;
    var crop_box = crop_box;

    var view = document.createElement( "div" );
    view.className = "cropBox";
    view.style.visibility = "hidden";
    var textWorld = document.createElement( "p" );
    textWorld.className = "world";
    textWorld.appendChild( document.createTextNode( "0 x 0" ) );
    view.appendChild( textWorld );
    var textScreen = document.createElement( "p" );
    textScreen.className = "screen";
    textScreen.appendChild( document.createTextNode( "0 x 0" ) );
    view.appendChild( textScreen );

    // internal opacity variable
    var opacity = 1;
    this.visible = true;

    // add view to DOM
    if( self.visible )
        stack.getView().appendChild( view );
}

/**
 * Return friendly name of this layer.
 */
BoxSelectionLayer.prototype.getLayerName = function()
{
  return "Rectangular selection";
};
