**
 * 
 */
function TileLayer(
		stack,						//!< reference to the parent stack
		baseURL,					//!< base URL for image tiles
		tileWidth,
		tileHeight
		)
{

  /** */
	this.redraw = function()
	{
    // should never update from database - is called frequently
    // on dragging
  };
  
  

  /** */
  this.resize = function( width, height )
	{
//		alert( "resize tileLayer of stack" + stack.getId() );
		
		/* TODO 2 more?  Should be 1---not?! */
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		initTiles( rows, cols );
		self.redraw();
		return;
	};
  
}
