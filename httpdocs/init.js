/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


/* It's very easy to accidentally leave in a console.log if you're
 * working with Firebug, but this will break CATMAID for the majority
 * of browsers.  If window.console isn't defined, create a noop
 * version of console.log: */

if (!window.console) {
  window.console = {};
  window.console.log = function() {}
}

var statusBar; //!< global statusBar
var slider_trace_z;
var slider_trace_s;
var a_url; //!< URL to this page
var slider_crop_top_z;
var slider_crop_bottom_z;
var slider_crop_s;

var button_crop_apply;

var input_fontsize; //!< fontsize input
var input_fontcolourred; //!< fontcolour red input
var input_fontcolourgreen; //!< fontcolour green input
var input_fontcolourblue; //!< fontcolour blue input
var ui;
var requestQueue;
var project;

var project_view;

var project_menu;
var project_menu_open;

var message_menu;

var pid;
var sids = new Array();
var ss = new Array();
var zp;
var yp;
var xp;

var session;
var msg_timeout;
var MSG_TIMEOUT_INTERVAL = 60000; //!< length of the message lookup interval in milliseconds
var messageWindow = null;

var rootWindow;


/**
 * queue a login-request on pressing return
 * to be used as onkeydown-handler in the account and password input fields
 */

function login_oninputreturn(e) {
  if (ui.getKey(e) == 13) {
    login(document.getElementById("account").value, document.getElementById("password").value);
    return false;
  } else
  return true;
}

/**
 * queue a login-request optionally using account and password,
 * freeze the window to wait for an answer
 *
 * if account or password are set, a new session is instantiated or an error occurs
 * if account and password are not set, an existing session is tried to be recognised
 */

function login(
		account,		//!< string account
		password		//!< string password
)
{
	if ( msg_timeout ) window.clearTimeout( msg_timeout );
	
	ui.catchEvents( "wait" );
	if ( account || password )
		requestQueue.register(
			'model/login.php',
			'POST',
			{ name : account, pwd : password },
			handle_login );
	else
		requestQueue.register(
			'model/login.php',
			'GET',
			undefined,
			handle_login );
	return;
}

/**
 * handle a login-request answer
 * if the answer was session data, establish a session, update the projects menu
 * if the answer was an error, display an error alert,
 * if the answer was a notice, do nothing
 *
 * free the window
 */

function handle_login(status, text, xml) {
  if (status == 200 && text) {
    // console.log(text);
    var e = eval("(" + text + ")");

    if (e.id) {
      session = e;
      document.getElementById("account").value = "";
      document.getElementById("password").value = "";
      document.getElementById("session_longname").replaceChild(
      document.createTextNode(e.longname), document.getElementById("session_longname").firstChild);
      document.getElementById("login_box").style.display = "none";
      document.getElementById("logout_box").style.display = "block";
      document.getElementById("session_box").style.display = "block";

      document.getElementById("message_box").style.display = "block";

      document.getElementById("project_menu_new").style.display = "block";

      //msg_timeout = window.setTimeout( message, MSG_TIMEOUT_INTERVAL );
      message();
    } else if (e.error) {
      alert(e.error);
    }
    updateProjects();
  } else if (status != 200) {
    // Of course, lots of non-200 errors are fine - just report
    // all for the moment, however:
    alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
  }
  return;
}


/**
 * queue a logout-request
 * freeze the window to wait for an answer
 */

function logout() {
  if (msg_timeout) window.clearTimeout(msg_timeout);

  ui.catchEvents("wait");
  requestQueue.register('model/logout.php', 'GET', undefined, handle_logout);

  return;
}

/**
 * handle a logout-request answer
 * update the project menu
 *
 * free the window
 */
function handle_logout()
{
	session = undefined;
	document.getElementById( "login_box" ).style.display = "block";
	document.getElementById( "logout_box" ).style.display = "none";
	document.getElementById( "session_box" ).style.display = "none";
	
	document.getElementById( "message_box" ).style.display = "none";
	
	document.getElementById( "project_menu_new" ).style.display = "none";
			
	updateProjects();
	
	if ( project && project.id ) project.setTool( new Navigator() );
	
	return;
}


/**
 * queue a project-menu-update-request to the request queue
 *
 * the answer depends on the session, which wa sinstantiated by setting a cookie
 */

function updateProjects() {
  //ui.catchEvents( "wait" );
  project_menu_open.update(null);

  document.getElementById("projects_h").style.display = "none";

  var pp = document.getElementById("projects_dl");

  while (pp.firstChild) pp.removeChild(pp.firstChild);

  var w = document.createElement("dd");
  w.className = "wait_bgwhite";
  w.appendChild(document.createTextNode("loading ..."));
  pp.appendChild(w);

  requestQueue.register('model/project.list.php', 'GET', undefined, handle_updateProjects);
  return;
}

/**
 * handle a project-menu-update-request answer
 * update the project menu
 *
 * free the window
 */

function handle_updateProjects(status, text, xml) {
  if (status == 200 && text) {
    var e = eval("(" + text + ")");

    var keep_project_alive = false;
    var keep_project_editable = false;

    var pp = document.getElementById("projects_dl");
    while (pp.firstChild) pp.removeChild(pp.firstChild);

    if (e.error) {
      project_menu_open.update();
      alert(e.error);
    } else {
      for (var i in e) {
        if (project && project.id == i) {
          keep_project_alive = true;
          keep_project_editable = e[i].editable;
        }

        var dt = document.createElement("dt");
        dt.appendChild(document.createTextNode(e[i].title));

        document.getElementById("projects_h").style.display = "block";
        pp.appendChild(dt);

        for (var j in e[i].action) {
          var dd = document.createElement("dd");
          var a = document.createElement("a");
          var ddc = document.createElement("dd");
          a.href = e[i].action[j].action;
          a.appendChild(document.createTextNode(e[i].action[j].title));
          dd.appendChild(a);
          pp.appendChild(dd);
          if (e[i].action[j].comment) {
            var ddc = document.createElement("dd");
            ddc.innerHTML = e[i].action[j].comment;
            pp.appendChild(ddc);
          }

        }
      }
      project_menu_open.update(e)
    }
    if (project) {
      if (keep_project_alive) project.setEditable(keep_project_editable);
      else {
        project.unregister();
        delete project;
      }
    }
  }
  ui.releaseEvents();
  return;
}

/**
 * queue an open-project-stack-request to the request queue
 * freeze the window to wait for an answer
 */
function openProjectStack( pid, sid )
{
	if ( project && project.id != pid )
	{
		project.unregister();
	}
	ui.catchEvents( "wait" );
	requestQueue.register(
		'model/project.stack.php',
		'POST',
		{ pid : pid, sid : sid },
		handle_openProjectStack );
	return;
}

/**
 * handle an open-project-stack-request answer
 * open the project or, if already opened, add the stack to the opened project
 *
 * free the window
 */
function handle_openProjectStack( status, text, xml )
{
	if ( status == 200 && text )
	{
		var e = eval( "(" + text + ")" );
		if ( e.error )
		{
			alert( e.error );
		}
		else
		{
			//console.replaceLast( e );
			
			//! look if the project is already opened, otherwise open a new one
			if ( !( project && project.id == e.pid ) )
			{
				project = new Project( e.pid );
				project_view = project.getView();
				project.register();
			}
			
			project.setEditable( e.editable );

			var stack = new Stack(
					project,
					e.sid,
					e.stitle,
					e.dimension,
					e.resolution,
					e.translation,		//!< @todo replace by an affine transform
					e.broken_slices,
					e.trakem2_project );
			
			document.getElementById( "toolbox_project" ).style.display = "block";
			
			var tilelayer = new TileLayer(
					stack,
					e.image_base,
					e.tile_width,
					e.tile_height );
			
			stack.addLayer( "TileLayer", tilelayer );
			
			project.addStack( stack );
			
			//! if the stack was initialized by an URL query, move it to a given position
			if ( pid == e.pid && sids.length > 0 )
			{
				for ( var i = 0; i < sids.length; ++i )
				{
					if ( sids[ i ] == e.sid )
					{
						if (
							typeof ss[ i ] == "number" &&
							typeof zp == "number" &&
							typeof yp == "number" &&
							typeof xp == "number" )
						{
							project.moveTo( zp, yp, xp );
							stack.moveToPixel( stack.z, stack.y, stack.x, ss[i] );
							sids.splice( i, 1 );
							ss.splice( i, 1 );
							break;
						}
					}
				}
			}
		}
	}
	ui.releaseEvents();
	return;
}

/**
 * look for user messages
 */

function message() {
  requestQueue.register('model/message.list.php', 'GET', undefined, handle_message);
  return;
}

/**
 * handle a user message
 */
function handle_message( status, text, xml )
{
	if ( !session )
		return;
	
	if ( status == 200 && text )
	{
		var e = eval( "(" + text + ")" );
		if ( e.error )
		{
			alert( e.error );
		}
		else
		{
			var message_container = document.getElementById( "message_container" );
			if ( !( typeof message_container == "undefined" || message_container == null ) )
			{
				//! remove old messages	
				while ( message_container.firstChild ) message_container.removeChild( message_container.firstChild );
				
				//! add new messages
				var n = 0;
				for ( var i in e )
				{
					e[ i ].action = "model/message.read.php?id=" + e[ i ].id;
					e[ i ].note = e[ i ].time_formatted;
					++n;
					var dt = document.createElement( "dt" );
					dt.appendChild( document.createTextNode( e[ i ].time_formatted ) );
					var dd1 = document.createElement( "dd" );
					var dd1a = document.createElement( "a" );
					dd1a.href = e[ i ].action;
					dd1a.appendChild( document.createTextNode( e[ i ].title ) );
					dd1.appendChild( dd1a );
					var dd2 = document.createElement( "dd" );
					dd2.innerHTML = e[ i ].text;
					message_container.appendChild( dt );
					message_container.appendChild( dd1 );
					message_container.appendChild( dd2 );
				}
				message_menu.update( e );
				if ( n > 0 ) document.getElementById( "message_menu_text" ).className = "alert";
				else document.getElementById( "message_menu_text" ).className = "";
			}
		}
	}
	
	msg_timeout = window.setTimeout( message, MSG_TIMEOUT_INTERVAL );
	
	return;
}

/**
 * update the lists of users
 */

function updateUsers() {
  document.getElementById("new_project_form").elements[3].style.display = "none";
  document.getElementById("new_project_owners_wait").style.display = "block";
  requestQueue.register('model/user.list.php', 'GET', undefined, handle_updateUsers);
  return;
}

/**
 * handle a lists of users update response
 */

function handle_updateUsers(status, text, xml) {
  if (!session) return;

  if (status == 200 && text) {
    var e = eval("(" + text + ")");
    if (e.error) {
      alert(e.error);
    } else {
      var new_project_owners = document.getElementById("new_project_form").elements[3];
      while (new_project_owners.length > 0)
      new_project_owners.remove(0);
      for (var i in e) {
        var option = document.createElement("option");
        option.text = e[i].longname;
        option.value = e[i].id;
        if (e[i].id == session.id) {
          option.selected = true;
        }
        new_project_owners.appendChild(option);
      }
      new_project_owners.size = e.length;

    }
  }
  document.getElementById("new_project_owners_wait").style.display = "none";
  document.getElementById("new_project_form").elements[3].style.display = "block";

  return;
}

/**
 * mark a message as read
 */

function read_message(id) {
  requestQueue.register('model/message.read.php', 'POST', {
    id: id
  }, null);
  return;
}

/*
 * resize the view and its content on window.onresize event
 */
function global_resize( e )
{
	var top = document.getElementById( "toolbar_container" ).offsetHeight;
	var bottom = 64;
	var height = Math.max( 0, ui.getFrameHeight() - top - bottom );
	var width = ui.getFrameWidth();
	
	var content = document.getElementById( "content" );
	content.style.top = top + "px";
	content.style.width = width + "px";
	content.style.height = height + "px";

	return true;
}


/**
 * initialise everything
 * to be called by the onload-handler of document.body
 */
var init = function()
{
	//! set some non standard attributes
	/*
	document.body.oncontextmenu = function( e ){ return false; };
	document.body.onselectstart = function( e ){ return false; };
	document.body.ondragstart = function( e ){ return false; };
	*/
	
	//! analyze the URL
	var z;
	var y;
	var x;
	var s;
	
	var account;
	var password;
	
	var values = parseQuery();
	if ( values )
	{
		// simply parse the fragment values
		// @todo take care for the values proper range
		if ( values[ "z" ] ) z = parseInt( values[ "z" ] );
		if ( isNaN( z ) ) delete z;
		if ( values[ "y" ] ) y = parseInt( values[ "y" ] );
		if ( isNaN( y ) ) delete y;
		if ( values[ "x" ] ) x = parseInt( values[ "x" ] );
		if ( isNaN( x ) ) delete x;
		if ( values[ "s" ] ) s = parseInt( values[ "s" ] );
		if ( isNaN( s ) ) delete s;
		
		if ( !(
				typeof z == "undefined" ||
				typeof y == "undefined" ||
				typeof x == "undefined" ||
				typeof s == "undefined" ) )
		{
			pid = 1;
			sids = new Array();
			sids[ 0 ] = 1;
			ss = new Array();
			ss[ 0 ] = 1;
		}
		else
		{
			if ( values[ "pid" ] ) pid = parseInt( values[ "pid" ] );
			if ( isNaN( pid ) ) delete pid;
			if ( values[ "zp" ] ) zp = parseInt( values[ "zp" ] );
			if ( isNaN( z ) ) delete zp;
			if ( values[ "yp" ] ) yp = parseInt( values[ "yp" ] );
			if ( isNaN( y ) ) delete yp;
			if ( values[ "xp" ] ) xp = parseInt( values[ "xp" ] );
			if ( isNaN( x ) ) delete xp;
			
			for ( var i = 0; values[ "sid" + i ]; ++i )
			{
				sids.push( parseInt( values[ "sid" + i ] ) );
				if ( values[ "s" + i ] )
					ss.push( parseInt( values[ "s" + i ] ) );
				else
					ss.push( NaN );
				if ( isNaN( sids[ i ] ) || isNaN( ss[ i ] ) )
				{
					sids.pop();
					ss.pop();
				}
			}
		}
		
		if ( values[ "account" ] && values[ "password" ] )
		{
			account = values[ "account" ];
			password = values[ "password" ];
		}
	}
	
	statusBar = new Console();
	document.body.appendChild( statusBar.getView() );
	
	ui = new UI();
	
	input_fontsize = document.getElementById( "fontsize" );
	
	a_url = document.getElementById( "a_url" );
	a_url.onmouseover = function( e )
	{
		this.href = project.createURL();
		return true;
	}
	
	button_crop_apply = document.getElementById( "button_crop_apply" );
	
	
	
	slider_crop_top_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ statusBar.replaceLast( "crop top z: " + val ); return; } );
	
	slider_crop_bottom_z = new Slider(
			SLIDER_HORIZONTAL,
			true,
			1,
			1,
			1,
			1,
			function( val ){ statusBar.replaceLast( "crop bottom z: " + val ); return; } );

	slider_crop_s = new Slider(
			SLIDER_HORIZONTAL,
			true,
			5,
			0,
			6,
			5,
			function( val ){ statusBar.replaceLast( "crop s: " + val ); } );
	
	var slider_crop_top_z_view = slider_crop_top_z.getView();
	slider_crop_top_z_view.id = "slider_crop_top_z";
	document.getElementById( "slider_crop_top_z" ).parentNode.replaceChild(
			slider_crop_top_z_view,
			document.getElementById( "slider_crop_top_z" ) );
	document.getElementById( "slider_crop_top_z" ).parentNode.replaceChild(
			slider_crop_top_z.getInputView(),
			slider_crop_top_z_view.nextSibling );
	
	var slider_crop_bottom_z_view = slider_crop_bottom_z.getView();
	slider_crop_bottom_z_view.id = "slider_crop_bottom_z";
	document.getElementById( "slider_crop_bottom_z" ).parentNode.replaceChild(
			slider_crop_bottom_z_view,
			document.getElementById( "slider_crop_bottom_z" ) );
	document.getElementById( "slider_crop_bottom_z" ).parentNode.replaceChild(
			slider_crop_bottom_z.getInputView(),
			slider_crop_bottom_z_view.nextSibling );

	var slider_crop_s_view = slider_crop_s.getView();
	slider_crop_s_view.id = "slider_crop_s";
	document.getElementById( "slider_crop_s" ).parentNode.replaceChild(
			slider_crop_s_view,
			document.getElementById( "slider_crop_s" ) );
	document.getElementById( "slider_crop_s" ).parentNode.replaceChild(
			slider_crop_s.getInputView(),
			slider_crop_s_view.nextSibling );
	
	document.getElementById( "login_box" ).style.display = "block";
	document.getElementById( "logout_box" ).style.display = "none";
	document.getElementById( "session_box" ).style.display = "none";
	
	document.getElementById( "toolbar_nav" ).style.display = "none";
	document.getElementById( "toolbar_text" ).style.display = "none";
	document.getElementById( "toolbar_crop" ).style.display = "none";
	document.getElementById( "toolbox_project" ).style.display = "none";
	document.getElementById( "toolbox_edit" ).style.display = "none";
	document.getElementById( "toolbox_show" ).style.display = "none";
	
	document.getElementById( "account" ).onkeydown = login_oninputreturn;
	document.getElementById( "password" ).onkeydown = login_oninputreturn;
	
	project_menu = new Menu();
	project_menu.update(
		{
			0 :
			{
				title : "New",
				id : "project_menu_new",
				action : function()
				{
					if ( project ) project.unregister();
					document.getElementById( "project list" ).style.display = "none";
					document.getElementById( "new_project_dialog" ).style.display = "block";
					updateUsers();
					return;
				},
				note : ""
			},
			1 :
			{
				title : "Open",
				id : "project_menu_open",
				action : {},
				note : ""
			}
		}
	);
	document.getElementById( "project_menu" ).appendChild( project_menu.getView() );
	
	project_menu_open = project_menu.getPulldown( "Open" );
	document.getElementById( "project_menu_new" ).style.display = "none";
	//project_menu_open.appendChild( project_menu_open.getView() );
	
	message_menu = new Menu();
	document.getElementById( "message_menu" ).appendChild( message_menu.getView() );

	
	//! auto login by url (unsafe as can be but convenient)
	if ( account && password )
		login( account, password );
	else
		login();
	
	if ( pid && sids.length > 0 )
	{
		for ( var i = 0; i < sids.length; ++i )
		{
			openProjectStack( pid, sids[ i ] )
		}
	}
	
	// the text-label toolbar
	
	input_fontsize = new Input( "fontsize", 3, function( e ){ return true; }, 32 );
	document.getElementById( "input_fontsize" ).appendChild( input_fontsize.getView() );
	input_fontcolourred = new Input( "fontcolourred", 3, function( e ){ return true; }, 255 );
	document.getElementById( "input_fontcolourred" ).appendChild( input_fontcolourred.getView() );
	input_fontcolourgreen = new Input( "fontcolourgreen", 3, function( e ){ return true; }, 127 );
	document.getElementById( "input_fontcolourgreen" ).appendChild( input_fontcolourgreen.getView() );
	input_fontcolourblue = new Input( "fontcolourblue", 3, function( e ){ return true; }, 0 );
	document.getElementById( "input_fontcolourblue" ).appendChild( input_fontcolourblue.getView() );
	
	
	/*
	var testLabel = new Textlabel( 1, "This is a textlabel containing some useless text." );
	document.body.appendChild( testLabel.getView() );
	testLabel.redraw( 200, 100, 600, 600 );
	*/
	
	ui.registerEvent( "onresize", global_resize );
	
	rootWindow = new CMWRootNode();
	ui.registerEvent( "onresize", resize );
	
	window.onresize();

	return;
}

/**
 * resize the view and its content on window.onresize event
 */
var resize = function( e )
{
	var top = document.getElementById( "toolbar_container" ).offsetHeight;
	var bottom = 64;
	var height = Math.max( 0, ui.getFrameHeight() - top - bottom );
	var width = ui.getFrameWidth();
	
	var content = document.getElementById( "content" );
	content.style.top = top + "px";
	content.style.width = width + "px";
	content.style.height = height + "px";
	
	rootFrame = rootWindow.getFrame();
	rootFrame.style.top = top + "px";
	rootFrame.style.width = UI.getFrameWidth() + "px";
	rootFrame.style.height = height + "px";
	
	rootWindow.redraw();
	
	return true;
}

function showMessages()
{
	if ( !messageWindow )
	{
		messageWindow = new CMWWindow( "Messages" );
		var messageContent = messageWindow.getFrame();
		messageContent.style.backgroundColor = "#ffffff";
		var messageContext = document.getElementById( "message_context" );
		if ( messageContext.parentNode )
			messageContext.parentNode.removeChild( messageContext );
		messageContent.appendChild( messageContext );
		
		messageWindow.addListener(
			function( callingWindow, signal )
			{
				switch ( signal )
				{
				case CMWWindow.CLOSE:
					if ( messageContext.parentNode )
						messageContext.parentNode.removeChild( messageContext );
					document.getElementById( "dump" ).appendChild( messageContext );
					if ( typeof project == undefined || project == null )
					{
						rootWindow.close();
						document.getElementById( "content" ).style.display = "block";
					}
					messageWindow = null;
					break;
				case CMWWindow.RESIZE:
					messageContext.style.height = messageWindow.getContentHeight() + "px";
					break;
				}
				return true;
			} );
	
		/* be the first window */
		if ( rootWindow.getFrame().parentNode != document.body )
		{
			document.body.appendChild( rootWindow.getFrame() );
			document.getElementById( "content" ).style.display = "none";
		}
		
		if ( rootWindow.getChild() == null )
			rootWindow.replaceChild( messageWindow );
		else
			rootWindow.replaceChild( new CMWVSplitNode( messageWindow, rootWindow.getChild() ) );
	}
			
	messageWindow.focus();
}
