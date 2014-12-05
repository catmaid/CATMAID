/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


/* It's very easy to accidentally leave in a console.log if you're
 * working with Firebug, but this will break CATMAID for the majority
 * of browsers.  If window.console isn't defined, create a noop
 * version of console.log: */

if (!window.console) {
  window.console = {};
  window.console.log = function() {};
}

// Attach a general error handler
window.onerror = function(msg, url, lineno, colno, err)
{
  var info = 'An error occured in CATMAID and the current action can\'t be ' +
      'completed. You can try to reload the widget or tool you just used.';
  var detail = 'Error: ' + msg + ' URL: ' + url + ' Line: ' + lineno +
      ' Column: ' + colno + ' Stacktrace: ' + (err ? err.stack : 'N/A');

  // Log the error detail to the console
  console.log(detail);

  // Log the error object, if available
  if (err) {
    console.log('Error object:')
    console.log(err)
  } else {
    console.log('No error object was provided');
  }

  // Use alert() to inform the user, if the error function isn't available for
  // some reason
  if (error) {
    error(info, detail);
  } else {
    alert(info + ' Detail: ' + detail);
  }

  // Return true to indicate the exception is handled and doesn't need to be
  // shown to the user.
  return true;
};

var global_bottom = 29;
var statusBar; //!< global statusBar
var slider_trace_z;
var slider_trace_s;
var a_url; //!< URL to this page

var input_fontsize; //!< fontsize input
var input_fontcolourred; //!< fontcolour red input
var input_fontcolourgreen; //!< fontcolour green input
var input_fontcolourblue; //!< fontcolour blue input
var ui;
var requestQueue;
var project;
var project_view;

var current_dataview;
var dataview_menu;

var project_menu;
//var project_menu_open;
//var project_menu_current;

var stack_menu;

var message_menu;
// A menu for user related links
var user_menu;

var pid;
var sids = new Array();
var ss = new Array();
var zp;
var yp;
var xp;
var inittool;
var init_active_skeleton;
var init_active_node_id;

var session;
var msg_timeout;
var MSG_TIMEOUT_INTERVAL = 60000; //!< length of the message lookup interval in milliseconds
var messageWindow = null;
var latest_message_date = null;

var rootWindow;

// an object to store user profile properties
var userprofile = null;

var user_permissions = null;
var user_groups = null;

function checkPermission(p) {
  return user_permissions && user_permissions[p] && user_permissions[p][project.getId()];
}

function mayEdit() {
  return checkPermission('can_annotate');
}

function mayView() {
  return checkPermission('can_annotate') || checkPermission('can_browse');
}

// From: http://stackoverflow.com/q/956719/223092
function countProperties(obj) {
  var count = 0;
  for(var prop in obj) {
    if(obj.hasOwnProperty(prop))
      ++count;
  }
  return count;
}

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
		password,		//!< string password
		completionCallback	//!< function callback
)
{
	var loginCompletion = function ( status, text, xml ) {
		handle_login( status, text, xml, completionCallback );
	};
	if ( msg_timeout ) window.clearTimeout( msg_timeout );
	
	ui.catchEvents( "wait" );
	if ( account || password ) {
		// Attempt to login.
		requestQueue.register(
			django_url + 'accounts/login',
			'POST',
			{ name : account, pwd : password },
			loginCompletion );
	}
	else {
		// Check if the user is logged in.
		requestQueue.register(
			django_url + 'accounts/login',
			'GET',
			undefined,
			loginCompletion );
	}
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

function handle_login(status, text, xml, completionCallback) {
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

      // Check for unread messages
      check_messages();

      // Update user menu
      user_menu.update({
        "user_menu_entry_1": {
          action: django_url + "user/password_change/",
          title: "Change password",
          note: "",
        }
      });
      
    } else if (e.error) {
      alert(e.error);
    }

    // Continuation for user list retrieval
    function done() {
      handle_profile_update(e);
      updateProjects(completionCallback);
    };

    if (e.id || (e.permissions && -1 !== e.permissions.indexOf('catmaid.can_browse'))) {
      // Asynchronously, try to get a full list of users if a user is logged in
      // or the anonymous user has can_browse permissions.
      User.getUsers(done);
    } else {
      done();
    }
  } else if (status != 200) {
    // Of course, lots of non-200 errors are fine - just report
    // all for the moment, however:
    alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
    if ( typeof completionCallback !== "undefined" ) {
      completionCallback();
    }
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
  requestQueue.register(django_url + 'accounts/logout', 'POST', undefined, handle_logout);

  return;
}

/**
 * handle a logout-request answer
 * update the project menu
 *
 * free the window
 */
function handle_logout(status, text, xml) {
	session = undefined;
	document.getElementById( "login_box" ).style.display = "block";
	document.getElementById( "logout_box" ).style.display = "none";
	document.getElementById( "session_box" ).style.display = "none";
	
	document.getElementById( "message_box" ).style.display = "none";
	
	if ( project && project.id ) project.setTool( new Navigator() );

	if (status == 200 && text) {
		var e = $.parseJSON(text);
		handle_profile_update(e);
	}

	updateProjects();

	return;
}

/**
 * Update profile dependend information. This is e.g. the visibility of
 * tools in the toolbar.
 */
function handle_profile_update(e) {
  try {
    if (e.userprofile) {
      userprofile = new Userprofile(e.userprofile);
    } else {
      throw "The server returned no valid user profile.";
    }
  } catch (error) {
    /* A valid user profile is needed to start CATMAID. This is a severe error
     * and a message box will tell the user to report this problem.
     */
    new ErrorDialog("The user profile couldn't be loaded. This, however, is " +
        "required to start CATMAID. Please report this problem to your " +
        "administrator and try again later.", error).show();
    return;
  }

  // update the edit tool actions and its div container
  createEditToolActions();
  var new_edit_actions = createButtonsFromActions(editToolActions,
    'toolbox_edit', '');
  $('#toolbox_edit').replaceWith(new_edit_actions);
  $('#toolbox_edit').hide();
}

/**
 * queue a project-menu-update-request to the request queue
 *
 * the answer depends on the session, which was instantiated by setting a cookie
 */

function updateProjects(completionCallback) {
	// Whatever happened, get details of which projects this user (or no
	// user) is allowed to edit:
	$.get(django_url + 'permissions', function (data) {
		if (data.error) {
			alert(data.error);
		} else {
			user_permissions = data[0];
      user_groups = data[1];
		}
	}, 'json');

	//ui.catchEvents( "wait" );
	project_menu.update(null);

	document.getElementById("projects_h").style.display = "none";
	document.getElementById("project_filter_form").style.display = "none";

	var pp = document.getElementById("projects_dl");

	while (pp.firstChild) pp.removeChild(pp.firstChild);

	var w = document.createElement("dd");
	w.className = "wait_bgwhite";
	w.appendChild(document.createTextNode("loading ..."));
	pp.appendChild(w);

	requestQueue.register(django_url + 'projects',
		'GET',
		undefined,
		function (status, text, xml) {
			handle_updateProjects(status, text, xml);
			if (typeof completionCallback !== "undefined") {
				completionCallback();
			}
		});
	return;
}

var cachedProjectsInfo = null;

/**
 * handle a project-menu-update-request answer
 * update the project menu
 *
 * free the window
 */

function handle_updateProjects(status, text, xml) {
	if (status == 200 && text) {
		var e = $.parseJSON(text);

		if (e.error) {
			project_menu.update();
			alert(e.error);
		} else {
			cachedProjectsInfo = e;
			// recreate the project data view
			if (current_dataview) {
				switch_dataview(current_dataview);
			} else {
				load_default_dataview();
			}
			// update the project > open menu
			project_menu.update(cachedProjectsInfo);
		}
		if (project) {
			project.destroy();
			project = undefined;
		}
	}
	ui.releaseEvents();
	return;
}

function updateProjectListMessage(text) {
  $('#project_list_message').text(text);
}

/**
 * Do a delayed call to updateProjectListFromCache() and indicate
 * the progress.
 */
var cacheLoadingTimeout = null;
function updateProjectListFromCacheDelayed()
{
  // the filter form can already be displayed
  $('#project_filter_form').show();
  // indicate active filtered loading of the projects
  var indicator = document.getElementById("project_filter_indicator");
  window.setTimeout( function() { indicator.className = "filtering"; }, 1);

  // clear timeout if already present and create a new one
  if (cacheLoadingTimeout != null)
  {
    clearTimeout(cacheLoadingTimeout);
  }
  cacheLoadingTimeout = window.setTimeout(
    function() {
      updateProjectListFromCache();
      // indicate finish of filtered loading of the projects
      indicator.className = "";
    }, 500);
}

/**
 * Retrieves stack menu information from the back-end and
 * executes a callback on success. This callback is passed
 * the returned JSON object containing the stack information.
 */
function getStackMenuInfo(project_id, callback) {
    requestQueue.register(django_url + project_id + '/stacks',
        'GET', undefined, function(status, text, xml) {
            if (status == 200 && text) {
                var e = $.parseJSON(text);
                if (e.error) {
                    alert(e.error);
                } else if (callback){
                    callback(e);
                }
            } else {
                alert("Sorry, the stacks for the current project couldn't be retrieved.");
            }
        });
    return;
}

/**
 * Update the displayed project list based on the cache
 * entries. This can involve a filter in the text box
 * "project_filter_text".
 */
function updateProjectListFromCache() {
  var matchingProjects = 0,
      searchString = $('#project_filter_text').val(),
      display,
      re = new RegExp(searchString, "i"),
      title,
      toappend,
      i, j, k,
      dt, dd, a, ddc,
      p,
      catalogueElement, catalogueElementLink,
      pp = document.getElementById("projects_dl");
  // remove all the projects
  while (pp.firstChild) pp.removeChild(pp.firstChild);
  updateProjectListMessage('');
  // add new projects according to filter
  for (i in cachedProjectsInfo) {
    p = cachedProjectsInfo[i];
    display = false;
    toappend = [];

    dt = document.createElement("dt");

    title = p.title;
    if (re.test(title)) {
      display = true;
    }
    dt.appendChild(document.createTextNode(p.title));

    document.getElementById("projects_h").style.display = "block";
    document.getElementById("project_filter_form").style.display = "block";
    toappend.push(dt);

    // add a link for every action (e.g. a stack link)
    for (j in p.action) {
      var sid_title = p.action[j].title;
      var sid_action = p.action[j].action;
      var sid_note = p.action[j].comment;
      dd = document.createElement("dd");
      a = document.createElement("a");
      ddc = document.createElement("dd");
      a.href = sid_action;
      if (re.test(sid_title)) {
        display = true;
      }
      a.appendChild(document.createTextNode(sid_title));
      dd.appendChild(a);
      toappend.push(dd);
      if (sid_note) {
        ddc = document.createElement("dd");
        ddc.innerHTML = sid_note;
        toappend.push(ddc);
      }
    }
    // optionally, add a neuron catalogue link
    if (p.catalogue) {
      catalogueElement = document.createElement('dd');
      catalogueElementLink = document.createElement('a');
      catalogueElementLink.href = django_url + p.pid;
      catalogueElementLink.appendChild(document.createTextNode('Browse the Neuron Catalogue'));
      catalogueElement.appendChild(catalogueElementLink);
      toappend.push(catalogueElement);
    }
    if (display) {
      ++ matchingProjects;
      for (k = 0; k < toappend.length; ++k) {
        pp.appendChild(toappend[k]);
      }
    }
  }
  if (cachedProjectsInfo.length === 0) {
    updateProjectListMessage("No CATMAID projects have been created");
  } else if (matchingProjects === 0) {
    updateProjectListMessage("No projects matched '"+searchString+"'");
  }
  project_menu.update(cachedProjectsInfo);
}

/**
 * queue an open-project-stack-request to the request queue
 * freeze the window to wait for an answer
 */
function openProjectStack( pid, sid, completionCallback, stackConstructor )
{
	if ( project && project.id != pid )
	{
		project.destroy();
	}

	ui.catchEvents( "wait" );
	requestQueue.register(
		django_url + pid + '/stack/' + sid + '/info',
		'GET',
		{ },
		function(args)
		{
			// Convert arguments to array and append stackConstructor
			var stack = handle_openProjectStack.apply(
					this,
					Array.prototype.slice.call(arguments).concat(stackConstructor));
			if (completionCallback)
			{
				completionCallback(stack);
			}
		});
	return;
}

/**
 * handle an open-project-stack-request answer
 * open the project or, if already opened, add the stack to the opened project
 *
 * free the window
 */
function handle_openProjectStack( status, text, xml, stackConstructor )
{
	var stack = null;
	if ( status == 200 && text )
	{
		var e = eval( "(" + text + ")" );
		if ( e.error )
		{
			if (e.permission_error) {
				new LoginDialog(e.error, realInit).show();
			} else {
				new ErrorDialog(e.error, e.detail).show();
			}
		}
		else
		{
			//! look if the project is already opened, otherwise open a new one
			if ( !( project && project.id == e.pid ) )
			{
				project = new Project( e.pid );
				project_view = project.getView();
				project.register();
			}

			var labelupload = '';

			if( e.hasOwnProperty('labelupload_url') && e.tile_source_type === 2 ) {
				labelupload = e.labelupload_url;
			}

			if (typeof stackConstructor === 'undefined') stackConstructor = Stack;
			stack = new stackConstructor(
					project,
					e.sid,
					e.stitle,
					e.dimension,
					e.resolution,
					e.translation,		//!< @todo replace by an affine transform
					e.broken_slices,
					e.trakem2_project,
					e.num_zoom_levels,
					-2,
					e.tile_source_type,
					labelupload, // TODO: if there is any
					e.metadata,
					userprofile.inverse_mouse_wheel,
					e.orientation );

			document.getElementById( "toolbox_project" ).style.display = "block";

			var tilesource = getTileSource( e.tile_source_type, e.image_base,
					e.file_extension );
			var tilelayer = new TileLayer(
					"Image data",
					stack,
					e.tile_width,
					e.tile_height,
					tilesource,
					true,
					1,
					true);

			stack.addLayer( "TileLayer", tilelayer );

			$.each(e.overlay, function(key, value) {
				var tilesource = getTileSource( value.tile_source_type,
					value.image_base, value.file_extension );
				var layer_visibility = false;
				if( parseInt(value.default_opacity) > 0) 
					layer_visibility = true;
				var tilelayer2 = new TileLayer(
								value.title,
								stack,
								value.tile_width,
								value.tile_height,
								tilesource,
								layer_visibility,
								value.default_opacity / 100,
								false);
				stack.addLayer( value.title, tilelayer2 );
			});

			// If the requested stack is already loaded, the existing
			// stack is returned. Continue work with the existing stack.
			stack = project.addStack( stack );

			// refresh the overview handler to also register the mouse events on the buttons
			stack.tilelayercontrol.refresh();

			var tools = {
				navigator: Navigator,
				tracingtool: TracingTool,
				segmentationtool: SegmentationTool,
				classification_editor: null
			};

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
							project.moveTo( zp, yp, xp, ss[i],
									function() {
										// Set the tool only after the move;
										// otherwise, thousands of skeleton nodes may be fetched and painted
										// unnecessarily.
										var tool = tools[inittool];
										if (tool) {
											project.setTool(new tool());
										}
										if (init_active_node_id) {
											// initialization hack
											SkeletonAnnotations.init_active_node_id = init_active_node_id;
										}
									});

							sids.splice( i, 1 );
							ss.splice( i, 1 );
							break;
						}
					}
				}
			}
			else if ( inittool )
			{
				var tool = tools[ inittool ];
				if ( tool )
					project.setTool( new tool() );
			}

			/* Update the projects stack menu. If there is more
			than one stack linked to the current project, a submenu for easy
			access is generated. */
			stack_menu.update();
			getStackMenuInfo(project.id, function(stacks) {
				if (stacks.length > 1)
				{
					var stack_menu_content = new Array();
					$.each(stacks, function(i, s) {
						stack_menu_content.push(
							{
								id : s.id,
								title : s.title,
								note : s.note,
								action : s.action
							}
						);
					});

					stack_menu.update( stack_menu_content );
					document.getElementById( "stackmenu_box" ).style.display = "block";
				}
			});
		}
	}
	ui.releaseEvents();
	return stack;
}

/**
 * Check, if there are new messages for the current user.
 */

function check_messages() {
  requestQueue.register(django_url + 'messages/latestunreaddate', 'GET',
      undefined, jsonResponseHandler(function(data) {
        // If there is a newer latest message than we know of, get all
        // messages to display them in the message menu and widget.
        if (data.latest_unread_date) {
          if (!latest_message_date || latest_message_date < data.latest_unread_date) {
            // Save the date and get all messages
            latest_message_date = data.latest_unread_date;
            get_messages();
          } else {
            // Check again later
            msg_timeout = window.setTimeout( check_messages, MSG_TIMEOUT_INTERVAL );
          }
        } else {
          // Check again later
          msg_timeout = window.setTimeout( check_messages, MSG_TIMEOUT_INTERVAL );
        }
      }));

  return;
}

/**
 * look for user messages
 */

function get_messages() {
  requestQueue.register(django_url + 'messages/list', 'GET', undefined, handle_message);
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
					if (e [ i ].id == -1) {
						var notifications_count = e [ i ].notification_count;
						var notifications_button_img = $('#data_button_notifications_img');
						if (notifications_button_img !== undefined) {
							if (notifications_count > 0)
								notifications_button_img.attr('src', STATIC_URL_JS + 'images/table_notifications_open.png');
							else
								notifications_button_img.attr('src', STATIC_URL_JS + 'images/table_notifications.png');
						}
						
						delete e [ i ];
					} else {
						e[ i ].action = django_url + 'messages/mark_read?id=' + e[ i ].id;
						e[ i ].note = e[ i ].time_formatted;
						++n;
						var dt = document.createElement( "dt" );
						dt.appendChild( document.createTextNode( e[ i ].time_formatted ) );
						var dd1 = document.createElement( "dd" );
						var dd1a = document.createElement( "a" );
						dd1a.href = e[ i ].action;
						dd1a.target = '_blank'; // FIXME: does not open in new window
						dd1a.appendChild( document.createTextNode( e[ i ].title ) );
						dd1.appendChild( dd1a );
						var dd2 = document.createElement( "dd" );
						dd2.innerHTML = e[ i ].text;
						message_container.appendChild( dt );
						message_container.appendChild( dd1 );
						message_container.appendChild( dd2 );
					}
				}
				message_menu.update( e );
				if ( n > 0 ) document.getElementById( "message_menu_text" ).className = "alert";
				else document.getElementById( "message_menu_text" ).className = "";
			}

		}
	}
	
	msg_timeout = window.setTimeout( check_messages, MSG_TIMEOUT_INTERVAL );
	
	return;
}

/**
 * mark a message as read
 */

function read_message(id) {
  requestQueue.register(django_url + 'messages/mark_read', 'POST', {
    id: id
  }, null);
  return;
}

/**
 * Look for data views.
 */
function dataviews() {
	requestQueue.register(django_url + 'dataviews/list', 'GET', undefined, handle_dataviews);
	return;
}

function handle_dataviews(status, text, xml) {
	if ( status == 200 && text )
	{
		var e = eval( "(" + text + ")" );
		if ( e.error )
		{
			alert( e.error );
		}
		else
		{
			// a function for creating data view menu handlers
			var create_handler = function( id, code_type ) {
				return function() {
					// close any open project and its windows
					rootWindow.closeAllChildren();
					// open data view
					switch_dataview( id, code_type );
				};
			};
			/* As we want to handle a data view change in JS,
			 * a function is added as action for all the menu
			 * elements. Also add small links to each menu entry
			 * as comment.
			 */
			for ( var i in e )
			{
				e[i].action = create_handler( e[i].id,
					e[i].code_type );
				var link = '<a class="hoverlink" href="' + django_url +
					'?dataview=' + e[i].id + '">&para;&nbsp;</a>';
				e[i].note = link + e[i].note;
			}

			dataview_menu.update( e );
		}
	}

	return;
}

function switch_dataview( view_id, view_type ) {
	/* Some views are dynamic, e.g. the plain list view offers a
	 * live filter of projects. Therefore we treat different types
	 * of dataviews differently and need to know whether the
	 * requested view is a legacy view.
	 */
	var do_switch_dataview = function( view_id, view_type ) {
		if ( view_type == "legacy_project_list_data_view" ) {
			// Show the standard plain list data view
			document.getElementById("data_view").style.display = "none";
			document.getElementById("clientside_data_view").style.display = "block";
			updateProjectListFromCache();
		} else {
			// let Django render the requested view and display it
			document.getElementById("clientside_data_view").style.display = "none";
			document.getElementById("data_view").style.display = "block";
			load_dataview( view_id );
		}
	};

	/* If view type is passed, switch to the data view directly.
	 * Otherwise, retrieve the data view type first.
	 */
	if (view_type) {
		do_switch_dataview(view_id, view_type);
	} else {
		requestQueue.register(django_url + 'dataviews/type/' + view_id,
			'GET', undefined, function(status, text, xml) {
				if (status == 200 && text) {
					var e = $.parseJSON(text);
					if (e.error) {
						alert(e.error);
					} else {
						do_switch_dataview(view_id, e.type);
					}
				} else {
					alert("A problem occurred while retrieving data view information.");
				}
		});
	}
}

/**
 * Load the default data view.
 */
function load_default_dataview() {
	requestQueue.register(django_url + 'dataviews/default',
		'GET', undefined, handle_load_default_dataview);
	return;
}

function handle_load_default_dataview(status, text, xml) {
	if ( status == 200 && text )
	{
		var e = eval( "(" + text + ")" );
		if ( e.error )
		{
			alert( e.error );
		}
		else
		{
		    switch_dataview( e.id, e.code_type );
		}
	}
}

/**
 * Load a specific data view.
 */
function load_dataview( view_id ) {
	requestQueue.register(django_url + 'dataviews/show/' + view_id,
		'GET', undefined, handle_load_dataview);
	return;
}

function handle_load_dataview(status, text, xml) {
	var data_view_container = document.getElementById("data_view");

	if ( !( typeof data_view_container == "undefined" || data_view_container == null ) )
	{
		//! remove old content
		while ( data_view_container.firstChild )
		{
			data_view_container.removeChild( data_view_container.firstChild );
		}

		// put content into data view div
		if ( status == 200 && text )
		{
			//! add new content
			data_view_container.innerHTML = text;
		} else {
			// create error message
			var error_paragraph = document.createElement( "p" );
			data_view_container.appendChild( error_paragraph );
			error_paragraph.appendChild( document.createTextNode(
				"Sorry, there was a problem loading the requested data view." ) );
			// create new error iframe
			var error_iframe = document.createElement( "iframe" );
			error_iframe.style.width = "100%";
			error_iframe.style.height = "400px";
			data_view_container.appendChild( error_iframe );
			error_iframe.contentDocument.write( text );
		}
	}

	return;
}

/*
 * resize the view and its content on window.onresize event
 */
function global_resize( e )
{
	var top = document.getElementById( "toolbar_container" ).offsetHeight;
	var height = Math.max( 0, ui.getFrameHeight() - top - global_bottom );
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
var realInit = function()
{
	//! set some non standard attributes
	/*
	document.body.oncontextmenu = function( e ){ return false; };
	document.body.onselectstart = function( e ){ return false; };
	document.body.ondragstart = function( e ){ return false; };
	*/
	
	// If the browser supports everything but webgl, let the user dismiss the warning message
	if (Modernizr.opacity && Modernizr.canvas && Modernizr.svg && Modernizr.json)
	{
		$('#browser_unsupported .message').append($('<p><a href="#">Dismiss<a/></p>').click(function () {
			$('#browser_unsupported').hide();
		}));
	}

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
		if ( isNaN( z ) ) z = undefined;
		if ( values[ "y" ] ) y = parseInt( values[ "y" ] );
		if ( isNaN( y ) ) y = undefined;
		if ( values[ "x" ] ) x = parseInt( values[ "x" ] );
		if ( isNaN( x ) ) x = undefined;
		if ( values[ "s" ] ) s = parseFloat( values[ "s" ] );
        if ( isNaN( s ) ) s = undefined;
        if ( values[ "active_skeleton_id" ] ) init_active_skeleton = parseInt( values[ "active_skeleton_id" ] );
        if ( values[ "active_node_id" ] ) init_active_node_id = parseInt( values[ "active_node_id" ] );

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
			if ( isNaN( pid ) ) pid = undefined;
			if ( values[ "zp" ] ) zp = parseInt( values[ "zp" ] );
			if ( isNaN( zp ) ) zp = undefined;
			if ( values[ "yp" ] ) yp = parseInt( values[ "yp" ] );
			if ( isNaN( yp ) ) yp = undefined;
			if ( values[ "xp" ] ) xp = parseInt( values[ "xp" ] );
			if ( isNaN( xp ) ) xp = undefined;
			if ( values[ "tool" ] ) inittool = values[ "tool"];
			
			for ( var i = 0; values[ "sid" + i ]; ++i )
			{
				var sid = parseInt( values[ "sid" + i ] );
				// Make sure a stack isn't opened multiple times
				if ( -1 !== sids.indexOf( sid ) ) {
					continue;
				}
				sids.push( sid );
				if ( values[ "s" + i ] )
					ss.push( parseFloat( values[ "s" + i ] ) );
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

		// find data view setting
		if ( values[ "dataview" ] )
			current_dataview = parseInt( values["dataview"] );
		if ( isNaN( current_dataview ) ) current_dataview = undefined;
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
	};
	
	document.getElementById( "login_box" ).style.display = "block";
	document.getElementById( "logout_box" ).style.display = "none";
	document.getElementById( "session_box" ).style.display = "none";

	// Create the toolboxes
	$('#toolbox_project').replaceWith(createButtonsFromActions(
		toolActions, 'toolbox_project', ''));
	$('#toolbox_edit').replaceWith(createButtonsFromActions(
		editToolActions, 'toolbox_edit', ''));
  $('#toolbox_segmentation').replaceWith(createButtonsFromActions(
    segmentationWindowActions, 'toolbox_segmentation', ''));
	$('#toolbox_data').replaceWith(createButtonsFromActions(
		tracingWindowActions, 'toolbox_data', ''));

	// Add the toolbar buttons:
	document.getElementById( "toolbar_nav" ).style.display = "none";
	document.getElementById( "toolbar_text" ).style.display = "none";
	document.getElementById( "toolbar_tags" ).style.display = "none";
	document.getElementById( "toolbar_roi" ).style.display = "none";
	document.getElementById( "toolbox_project" ).style.display = "none";
	document.getElementById( "toolbox_edit" ).style.display = "none";
	document.getElementById( "toolbox_ontology" ).style.display = "none";
	document.getElementById( "toolbox_data" ).style.display = "none";
  document.getElementById( "toolbox_segmentation" ).style.display = "none";
	document.getElementById( "toolbox_show" ).style.display = "none";
	
	document.getElementById( "account" ).onkeydown = login_oninputreturn;
	document.getElementById( "password" ).onkeydown = login_oninputreturn;

	dataview_menu = new Menu();
	document.getElementById( "dataview_menu" ).appendChild( dataview_menu.getView() );
	dataviews();
	
	project_menu = new Menu();
	document.getElementById( "project_menu" ).appendChild( project_menu.getView() );
	
	stack_menu = new Menu();
	document.getElementById( "stack_menu" ).appendChild( stack_menu.getView() );
	
	message_menu = new Menu();
	document.getElementById( "message_menu" ).appendChild( message_menu.getView() );

	user_menu = new Menu();
	document.getElementById( "user_menu" ).appendChild( user_menu.getView() );

	// login and thereafter load stacks if requested
	login(undefined, undefined, function() {
		if ( pid && sids.length > 0 )
		{
			for ( var i = 0; i < sids.length; ++i )
			{
				openProjectStack( pid, sids[ i ] );
			}
		}
	});
	
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

  // change global bottom bar height, hide the copyright notice
  // and move the statusBar
  statusBar.setBottom();

	window.onresize();

	return;
};

/**
 * resize the view and its content on window.onresize event
 */
var resize = function( e )
{
	var top = document.getElementById( "toolbar_container" ).offsetHeight;
	var height = Math.max( 0, ui.getFrameHeight() - top - global_bottom );
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
};

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
