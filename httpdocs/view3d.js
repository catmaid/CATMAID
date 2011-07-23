/** Creates and returns a new 3d window. */
function create3dWindow()
{
  var win = new CMWWindow( "3D View" );
  var content = win.getFrame();
  content.style.backgroundColor = "#ffffff";

  var container = document.createElement( "div" );
  container.setAttribute( "id", "view_in_3d_widget" );
  container.setAttribute( "class", "sliceView");
  container.style.position = "absolute";
  container.style.bottom = "0px";
  container.style.width = "100%";
  container.style.overflow = "auto";
  container.style.backgroundColor = "#ffffff";
  content.appendChild( container );

  var add = document.createElement('input');
  add.setAttribute("type", "button");
  add.setAttribute("id", "add_current_to_3d_view");
  add.setAttribute("value", "Add current skeleton to 3D view");
  add.onclick = addTo3DView; // function declared in overlay.js
  container.appendChild( add );

  var introduction = document.createElement('p')
  introduction.setAttribute("id", "view3DIntroduction");
  container.appendChild(introduction);

  var list = document.createElement('ul');
  list.setAttribute("id", "view-3d-object-list")
  container.appendChild(list);

  var canvas = document.createElement('div');
  canvas.setAttribute("id", "viewer-3d-canvas");
  canvas.style.width = "500px";
  canvas.style.height = "500px";
  container.appendChild(canvas);

  var buttons = document.createElement('div');
  ['xy', 'xz', 'zy'].map(function (s) {
    var b = document.createElement('input');
    b.setAttribute("id", s + "-button");
    b.setAttribute("type", "button");
    b.setAttribute("value", s.toUpperCase());
    buttons.appendChild(b);
  });
  container.appendChild(buttons);

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
        container.style.height = win.getContentHeight() + "px";
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

  // Fill in with a Raphael canvas, now that the window exists in the DOM:
  createViewerFromCATMAID( canvas.getAttribute("id") );

  return win;
};