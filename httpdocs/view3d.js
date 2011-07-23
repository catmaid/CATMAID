/** Creates and returns a new 3d window. */
function create3dWindow()
{
	var win = new CMWWindow( "3D View" );
	var content = win.getFrame();
	content.style.backgroundColor = "#ffffff";
	var context = document.createElement( "div" );
	context.setAttribute( "id", "view_3d_context" );
	context.style.position = "absolute";
	context.style.bottom = "0px";
	context.style.width = "100%";
	context.style.overflow = "auto";
	content.appendChild( context );

	console.log("id is: " + context.getAttribute("id"));
	createViewerFromCATMAID( context.getAttribute( "id" ) );
/*
	var keyboardShortcutsList = document.createElement( "p" );
    keyboardShortcutsList.id="keyShortcutsText";
    var keysHTML = '';
    for (i in stringToKeyAction) {
      keysHTML += '<button style="width:3em; margin-right:1em">' + i + '</button>' + stringToKeyAction[i].helpText + "<br />";
    }
    keyboardShortcutsList.innerHTML = keysHTML;
    keyboardShortcutsContext.appendChild( keyboardShortcutsList );
    keyboardShortcutsContent.appendChild( keyboardShortcutsContext );
*/

	win.addListener(
		function( callingWindow, signal )
		{
			switch ( signal )
			{
			case CMWWindow.CLOSE:
				if ( typeof project == undefined || project == null )
				{
					rootWindow.close();
					document.getElementById( "content" ).style.display = "none";
				}
				else {
					win.close();
        }
				win = null;
				break;
			case CMWWindow.RESIZE:
				context.style.height = win.getContentHeight() + "px";
				break;
			}
			return true;
		});

	document.getElementById( "content" ).style.display = "none";

	/* be the first window */
	if ( rootWindow.getFrame().parentNode != document.body )
	{
		document.body.appendChild( rootWindow.getFrame() );
		document.getElementById( "content" ).style.display = "none";
	}

	if ( rootWindow.getChild() == null )
		rootWindow.replaceChild( win );
	else
		rootWindow.replaceChild( new CMWHSplitNode( rootWindow.getChild(), win ) );

	return win;
};