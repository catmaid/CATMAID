/**
 * windowmanager.js
 *
 * requirements:
 *   ui.js
 *   resize_handle.js
 *
 * Tiled window manager for frame-like Javascript-`windows'.
 * 
 * Tiled window configurations are expressed as a binary tree with branch
 * nodes being split horizontally or vertically and leaf-nodes being the
 * actual windows.
 */

/**
 * Node prototype
 */
function CMWNode(){}

CMWNode.CMWNodeUniqueId = 0;

CMWNode.prototype.uniqueId = function()
{
	return CMWNode.CMWNodeUniqueId++;
}

/**
 * @return width of the node in pixels
 */
CMWNode.prototype.getWidth = function()
{
	var frame = this.getFrame();
	if ( frame.offsetWidth )
		return frame.offsetWidth;
	else
		return 0;
}

/**
 * @return height of the node in pixels
 */
CMWNode.prototype.getHeight = function()
{
	var frame = this.getFrame();
	if ( frame.offsetHeight )
		return frame.offsetHeight;
	else
		return 0;
}

/**
 * @return left position of the node in pixels
 */
CMWNode.prototype.getLeft = function()
{
	var frame = this.getFrame();
	if ( frame.style.left )
		return parseInt( frame.style.left );
	else
		return 0;
}

/**
 * @return top position of the node in pixels
 */
CMWNode.prototype.getTop = function()
{
	var frame = this.getFrame();
	if ( frame.style.top )
		return parseInt( frame.style.top );
	else
		return 0;
}




/**
 * Root node
 */
function CMWRootNode()
{
	var self = this;
	
	var child = child;
	
	var id = this.uniqueId();
	
	var frame = document.createElement( "div" );
	frame.style.position = "absolute";
	frame.id = "CMW" + id;
	frame.style.top = "0px";
	
	this.getId = function(){ return id; }
	
	this.getFrame = function(){ return frame; }
	
	this.getChildren = function()
	{
		var children = new Array();
		if ( child != null ) 
		{
			children.push( child );
			children = children.concat( child.getChildren() );
		}
		return children;
	}
	
	this.getWindows = function()
	{
		if ( child != null )
			return child.getWindows();
		else	
			return [];
	}
	
	this.replaceChild = function( newChild )
	{
		child = newChild;
		if ( frame.lastChild )
			frame.removeChild( frame.lastChild );
		frame.appendChild( child.getFrame() );
		child.setParent( this );
		this.redraw();
	}
	
	this.redraw = function(){ child.redraw(); document.getElementById( "text" ).replaceChild( document.createTextNode( this.toXML() ), document.getElementById( "text" ).firstChild ); }
	
	this.catchDrag = function()
	{
		ui.catchFocus();
		ui.registerEvent( "onmouseup", self.releaseDrag );
		ui.catchEvents();
		child.catchDrag();
	}
	
	this.releaseDrag = function()
	{
		ui.releaseEvents();
		ui.removeEvent( "onmouseup", self.releaseDrag );
		child.releaseDrag();
	}
	
	this.toXML = function()
	{
		return "<root id\"" + id + "\">\n" + child.toXML( "\t" ) + "\n</root>";
	}
}

CMWRootNode.prototype = new CMWNode();
CMWRootNode.prototype.constructor = CMWRootNode;

CMWRootNode.prototype.getRootNode = function(){ return this; }



/**
 * Horizontal split node
 */
function CMWHSplitNode( parent, child1, child2 )
{
	var id = this.uniqueId();
	
	var parent = parent;
	
	var child1 = child1;
	
	var child2 = child2;
	
	if ( typeof child1 === "undefined" )
		child1 = new CMWWindow( this, "Window 1" );
	else
		child1.setParent( this );
	if ( typeof child2 === "undefined" )
		child2 = new CMWWindow( this, "Window 2" );
	else
		child2.setParent( this );
		
	var frame = document.createElement( "div" );
	frame.className = "sliceView";
	frame.style.position = "absolute";
	frame.id = "CMW" + id;
	frame.style.top = "0px";
	frame.style.bottom = "0px";
	
	frame.appendChild( child1.getFrame() );
	frame.appendChild( child2.getFrame() );
	
	var resizeHandle = new ResizeHandle( "h", this );
	child1.getFrame().appendChild( resizeHandle.getView() );
	
	var widthRatio = 0.5;
	
	this.getId = function(){ return id; }
	
	this.getFrame = function(){ return frame; }
	
	this.getParent = function(){ return parent; }
	
	this.setParent = function( newParent ){ parent = newParent; }
	
	this.getRootNode = function()
	{
		return parent.getRootNode();
	}
	
	this.getChildren = function()
	{
		return [ child1, child2 ].concat( child1.getChildren() ).concat( child2.getChildren() );
	}
	
	this.getWindows = function()
	{
		return child1.getWindows().concat( child2.getWindows() );
	}
	
	this.redraw = function()
	{
		var f1 = child1.getFrame();
		var f2 = child2.getFrame();
		var w = this.getWidth();
		w1 = Math.max( 20, Math.min( w - 20, Math.round( w * widthRatio ) ) );
		
		f1.style.width = w1 + "px";
		
		f2.style.width = ( w - w1 ) + "px";
		f2.style.left = w1 + "px";
		
		child1.redraw();
		child2.redraw();
		
		return this;
	}
	
	this.changeWidth = function( d )
	{
		var f1 = child1.getFrame();
		var f2 = child2.getFrame();
		var w = this.getWidth();
		var w1 = Math.max( 20, Math.min( w - 20, child1.getWidth() + d ) );
		widthRatio = w1 / w;
		
		return this.redraw();
	}
	
	this.removeResizeHandle = function()
	{
		return child1.getFrame().removeChild( resizeHandle.getView() );
	}
	
	this.replaceChild = function( newChild, oldChild )
	{
		if ( oldChild == child1 )
			return this.replaceLeftChild( newChild );
		else if ( oldChild == child2 )
			return this.replaceRightChild( newChild );
	}
	
	this.replaceLeftChild = function( newChild )
	{
		var oldChild = child1;
		this.removeResizeHandle();
		if ( newChild.getFrame().parentNode != null )
			newChild.getFrame().parentNode.removeChild( newChild.getFrame() );
		newChild.getFrame().appendChild( resizeHandle.getView() );
		if ( child1.getFrame().parentNode == frame )
			frame.replaceChild( newChild.getFrame(), child1.getFrame() );
		else
			frame.appendChild( newChild.getFrame() );
		child1 = newChild;
		newChild.setParent( this );
		this.redraw();
		return oldChild;
	}
	
	this.replaceRightChild = function( newChild )
	{
		var oldChild = child2;
		if ( newChild.getFrame().parentNode != null )
			newChild.getFrame().parentNode.removeChild( newChild.getFrame() );
		if ( child2.getFrame().parentNode == frame )
			frame.replaceChild( newChild.getFrame(), child2.getFrame() );
		else
			frame.appendChild( newChild.getFrame() );
		child2 = newChild;
		newChild.setParent( this );
		this.redraw();
		return oldChild;
	}
	
	this.getSiblingOf = function( child )
	{
		if ( child1 == child )
			return child2;
		else if ( child2 == child )
			return child1;
		else
			return null;
	}
	
	this.catchDrag = function()
	{
		child1.catchDrag();
		child2.catchDrag();
	}
	
	this.releaseDrag = function()
	{
		child1.releaseDrag();
		child2.releaseDrag();
	}
	
	this.toXML = function( tabs )
	{
		return tabs + "<hsplitnode id\"" + id + "\">\n" + child1.toXML( tabs + "\t" ) + "\n" + child2.toXML( tabs + "\t" ) + "\n" + tabs + "</hsplitnode>";
	}
}

CMWHSplitNode.prototype = new CMWNode();
CMWHSplitNode.prototype.constructor = CMWHSplitNode;




/**
 * Vertical split node.
 */
function CMWVSplitNode( parent, child1, child2 )
{
	var id = this.uniqueId();
	
	var parent = parent;
	
	var child1 = child1;
	
	var child2 = child2;
	
	if ( typeof child1 === "undefined" )
		child1 = new CMWWindow( this, "Window 1" );
	else
		child1.setParent( this );
	if ( typeof child2 === "undefined" )
		child2 = new CMWWindow( this, "Window 2" );
	else
		child2.setParent( this );
		
	var frame = document.createElement( "div" );
	frame.className = "sliceView";
	frame.style.position = "absolute";
	frame.id = "CMW" + id;
	frame.style.top = "0px";
	frame.style.bottom = "0px";
	
	frame.appendChild( child1.getFrame() );
	frame.appendChild( child2.getFrame() );
	
	var resizeHandle = new ResizeHandle( "v", this );
	child1.getFrame().appendChild( resizeHandle.getView() );
	
	var heightRatio = 0.5;
	
	this.getId = function(){ return id; }
	
	this.getFrame = function(){ return frame; }
	
	this.getParent = function(){ return parent; }
	
	this.setParent = function( newParent ){ parent = newParent; }
	
	this.getRootNode = function()
	{
		return parent.getRootNode();
	}
	
	this.getChildren = function()
	{
		return [ child1, child2 ].concat( child1.getChildren() ).concat( child2.getChildren() );
	}
	
	this.getWindows = function()
	{
		return child1.getWindows().concat( child2.getWindows() );
	}
	
	this.redraw = function()
	{
		var f1 = child1.getFrame();
		var f2 = child2.getFrame();
		var h = this.getHeight();
		h1 = Math.max( 20, Math.min( h - 20, Math.round( h * heightRatio ) ) );
		
		f1.style.height = h1 + "px";
		
		f2.style.height = ( h - h1 ) + "px";
		f2.style.top = h1 + "px";
		
		child1.redraw();
		child2.redraw();
		
		return this;
	}
	
	this.changeHeight = function( d )
	{
		var f1 = child1.getFrame();
		var f2 = child2.getFrame();
		var h = this.getHeight();
		var h1 = Math.max( 20, Math.min( h - 20, child1.getHeight() + d ) );
		heightRatio = h1 / h;
		
		return this.redraw();
	}
	
	this.removeResizeHandle = function()
	{
		return child1.getFrame().removeChild( resizeHandle.getView() );
	}
	
	this.replaceChild = function( newChild, oldChild )
	{
		if ( oldChild == child1 )
			return this.replaceTopChild( newChild );
		else if ( oldChild == child2 )
			return this.replaceBottomChild( newChild );
	}
	
	this.replaceTopChild = function( newChild )
	{
		var oldChild = child1;
		this.removeResizeHandle();
		if ( newChild.getFrame().parentNode != null )
			newChild.getFrame().parentNode.removeChild( newChild.getFrame() );
		newChild.getFrame().appendChild( resizeHandle.getView() );
		if ( child1.getFrame().parentNode == frame )
			frame.replaceChild( newChild.getFrame(), child1.getFrame() );
		else
			frame.appendChild( newChild.getFrame() );
		child1 = newChild;
		newChild.setParent( this );
		this.redraw();
		return oldChild;
	}
	
	this.replaceBottomChild = function( newChild )
	{
		var oldChild = child2;
		if ( newChild.getFrame().parentNode != null )
			newChild.getFrame().parentNode.removeChild( newChild.getFrame() );
		if ( child2.getFrame().parentNode == frame )
			frame.replaceChild( newChild.getFrame(), child2.getFrame() );
		else
			frame.appendChild( newChild.getFrame() );
		child2 = newChild;
		newChild.setParent( this );
		this.redraw();
		return oldChild;
	}
	
	this.getSiblingOf = function( child )
	{
		if ( child1 == child )
			return child2;
		else if ( child2 == child )
			return child1;
		else
			return null;
	}
	
	this.catchDrag = function()
	{
		child1.catchDrag();
		child2.catchDrag();
	}
	
	this.releaseDrag = function()
	{
		child1.releaseDrag();
		child2.releaseDrag();
	}
	
	this.toXML = function( tabs )
	{
		return tabs + "<vsplitnode id\"" + id + "\">\n" + child1.toXML( tabs + "\t" ) + "\n" + child2.toXML( tabs + "\t" ) + "\n" + tabs + "</vsplitnode>";
	}
}

CMWVSplitNode.prototype = new CMWNode();
CMWVSplitNode.prototype.constructor = CMWVSplitNode;



/**
 * Window is leaf of the binary tree.
 */
function CMWWindow( parent, title )
{
	var self = this;
	
	var id = this.uniqueId();
	
	var parent = parent;
	
	var title = title;
	
	var titleText = document.createElement( "p" );
	titleText.className = "stackTitle";
	titleText.appendChild( document.createTextNode( title ) );
	
	var closeHandle = document.createElement( "p" );
	closeHandle.className = "stackClose";
	closeHandle.onclick = this.close;
	closeHandle.appendChild( document.createTextNode( "close [ x ]" ) );
	
	var titleBar = document.createElement( "div" );
	titleBar.className = "stackInfo_selected";
	titleBar.style.position = "relative";
	titleBar.style.cursor = "move";
	titleBar.appendChild( titleText );
	titleBar.appendChild( closeHandle );
	
	var frame = document.createElement( "div" );
	frame.className = "sliceView";
	frame.style.position = "absolute";
	frame.id = "CMW" + id;
	frame.style.top = "0px";
	frame.style.bottom = "0px";
	frame.appendChild( titleBar );
	
	var eventCatcher = document.createElement( "div" );
	eventCatcher.className = "eventCatcher";
	frame.appendChild( eventCatcher );
	
	var listeners = new Array();
	
	this.catchDrag = function()
	{
		eventCatcher.style.display = "block";
		return false;
	}
	
	this.releaseDrag = function()
	{
		eventCatcher.style.display = "none";
		return false;
	}
	
	titleBar.onmousedown = function( e )
	{
		CMWWindow.selectedWindow = self;
		self.getRootNode().catchDrag();
        return false;
	}
	
	eventCatcher.onmousemove = function( e )
	{
		if ( self != CMWWindow.selectedWindow ) 
		{
			var m = ui.getMouse(e);
			var min = m.offsetY;
			var s = "Top";
			if ( m.offsetY > self.getHeight() / 2 ) 
			{
				min = self.getHeight() - m.offsetY;
				s = "Bottom";
			}
			if ( m.offsetX < min )
			{
				min = m.offsetX;
				s = "Left";
			}
			if ( self.getWidth() - m.offsetX < min ) 
				s = "Right";
			
			eventCatcher.className = "eventCatcher" + s;
		}
		return false;
    }
	
	eventCatcher.onmouseout = function()
	{
		eventCatcher.className = "eventCatcher";
	}
	
	eventCatcher.onmouseup = function( e )
	{
		if ( !( CMWWindow.selectedWindow == self || eventCatcher.className == "eventCatcher" ) )
		{
			var sourceSplitNode = CMWWindow.selectedWindow.getParent();
			var sourceSibling = sourceSplitNode.getSiblingOf( CMWWindow.selectedWindow );
			var sourceSiblingFrame = sourceSibling.getFrame();
			var selectedWindowFrame = CMWWindow.selectedWindow.getFrame();
			var targetSibling = parent.getSiblingOf( self );
			var targetSiblingFrame = targetSibling.getFrame();
			
			sourceSplitNode.removeResizeHandle();
			sourceSplitNode.getParent().replaceChild( sourceSibling, sourceSplitNode );
			
			sourceSiblingFrame.style.top = selectedWindowFrame.style.top = frame.style.top = targetSiblingFrame.style.top = "0px";
			sourceSiblingFrame.style.left = selectedWindowFrame.style.left = frame.style.left = targetSiblingFrame.style.left = "0px";
			sourceSiblingFrame.style.width = selectedWindowFrame.style.width = frame.style.width = targetSiblingFrame.style.width = "";
			sourceSiblingFrame.style.height = selectedWindowFrame.style.height = frame.style.height = targetSiblingFrame.style.height = "";
		
			if ( eventCatcher.className == "eventCatcherTop" )
			{
				parent.replaceChild( new CMWVSplitNode( parent, CMWWindow.selectedWindow, self ), self );
			}
			else if ( eventCatcher.className == "eventCatcherBottom" )
			{
				parent.replaceChild( new CMWVSplitNode( parent, self, CMWWindow.selectedWindow ), self );
			}
			else if ( eventCatcher.className == "eventCatcherLeft" )
			{
				parent.replaceChild( new CMWHSplitNode( parent, CMWWindow.selectedWindow, self ), self );
			}
			else if ( eventCatcher.className == "eventCatcherRight" )
			{
				parent.replaceChild( new CMWHSplitNode( parent, self, CMWWindow.selectedWindow ), self );
			}
		}
		var rootNode = self.getRootNode();
		rootNode.releaseDrag();
		CMWWindow.selectedWindow = null;
		eventCatcher.className = "eventCatcher";
		rootNode.redraw();
	}
	
	this.addListener = function( listener ){ listeners.push( listener ); return; }
	
	this.removeListener = function( listener )
	{
		for ( var i = 0; i < listeners.length; ++i )
		{
			if ( listeners[ i ] == listener )
			{
				listeners.splice( i, 1 );
				break;
			}
		}
		return;
	}
	
	this.clearListeners = function()
	{
		delete listeners;
		listeners = new Array();
	}
	
	this.getId = function(){ return id; }
	
	this.getFrame = function(){ return frame; }
	
	this.getParent = function(){ return parent; }
	
	this.getTitle = function(){ return title; }
	
	this.getSibling = function(){ return parent.getSiblingOf( self ); }
	
	this.setParent = function( newParent ){ parent = newParent; return; }
	
	this.getChildren = function(){ return []; }
	
	this.getWindows = function(){ return [ this ]; }
	
	/**
	 * Set the window title
	 * 
	 * @param {String} title
	 * @return this allows chains of calls like myWindow.setTitle( "new" ).show()
	 */
	this.setTitle = function( newTitle )
	{
		title = newTitle;
		titleText.replaceChild( document.createTextNode( title ), titleText.firstChild );
		return this;
	}
	
	/**
	 * @return root node
	 */
	this.getRootNode = function()
	{
		return parent.getRootNode();
	}
	
	this.redraw = function()
	{
		for ( var i = 0; i < listeners.length; ++i )
			listeners[ i ]( this, CMWWindow.RESIZE );
	}
	
	this.close = function()
	{
		if ( self.getRootNode() == parent )
		var sourceSibling = sourceSplitNode.getSiblingOf( CMWWindow.selectedWindow );
		var sourceSiblingFrame = sourceSibling.getFrame();
			var selectedWindowFrame = CMWWindow.selectedWindow.getFrame();
			
			sourceSplitNode.removeResizeHandle();
			sourceSplitNode.getParent().replaceChild( sourceSibling, sourceSplitNode );
			
			sourceSiblingFrame.style.top = selectedWindowFrame.style.top = frame.style.top = "0px";
			sourceSiblingFrame.style.left = selectedWindowFrame.style.left = frame.style.left = "0px";
			sourceSiblingFrame.style.width = selectedWindowFrame.style.width = frame.style.width = "";
			sourceSiblingFrame.style.height = selectedWindowFrame.style.height = frame.style.height = "";
	}
	
	this.toXML = function( tabs )
	{
		return tabs + "<window id\"" + id + "\" title=\"" + title + "\" \\>";
	}
}

CMWWindow.prototype = new CMWNode();
CMWWindow.prototype.constructor = CMWWindow;

CMWWindow.prototype.close = function(){}

/**
 * Constants
 */
CMWWindow.CLOSE = 0;
CMWWindow.RESIZE = 1;





/**
 * a vertical or horizontal resize handle
 *
 */
function ResizeHandle( type, node )
{
	/**
	 * @return the html-element
	 */
	this.getView = function(){ return view; }

	var onmousemove =
	{
		h : function( e )
		{
			node.changeWidth( ui.diffX );
			return false;
        },
		v : function( e )
		{
			node.changeHeight( ui.diffY );
			return false;
        }
	};

	var onmouseup =
	{
		h : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", onmousemove.h );
			ui.removeEvent( "onmouseup", onmouseup.h );
			return false;
        },
		v : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", onmousemove.v );
			ui.removeEvent( "onmouseup", onmouseup.v );
			return false;
        }
	};

	var onmousedown =
	{
		h : function( e )
		{
			ui.registerEvent( "onmousemove", onmousemove.h );
			ui.registerEvent( "onmouseup", onmouseup.h );
			ui.catchEvents( "e-resize" );
            ui.onmousedown( e );
			ui.catchFocus();

            return false;
        },
		v : function( e )
		{
			ui.registerEvent( "onmousemove", onmousemove.v );
			ui.registerEvent( "onmouseup", onmouseup.v );
			ui.catchEvents( "s-resize" );
            ui.onmousedown( e );
			ui.catchFocus();

            return false;
        }
	};
	
	
	// initialise
	if ( typeof ui === "undefined" ) ui = new UI();

	var self = this;

	if ( type != "v" ) type = "h";
	var view = document.createElement( "div" );
	view.className = "resize_handle_" + type;
	view.onmousedown = onmousedown[ type ];
	view.onmouseup = onmouseup[ type ];
}

