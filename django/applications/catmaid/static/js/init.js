/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// These globals are currently used in many places and have yet to be moved into
// the CATMAID namespace.
var requestQueue;
var project;

(function(CATMAID) {

  "use strict";

  /**
   * Global access to window and project control events and variables.
   * @namespace
   */
  CATMAID.Init = {

    /**
     * Interval (in milliseconds) to check client CATMAID version against server
     * version.
     * @type {Number}
     */
    CHECK_VERSION_TIMEOUT_INTERVAL: 15*60*1000,

    /**
     * Check if the client CATMAID version matches the server version. If it
     * does not, disruptively prompt the user to refresh.
     */
    checkVersion: function () {
      CATMAID.fetch('version')
        .then(function(data) {
          if (CATMAID.CLIENT_VERSION !== data.SERVER_VERSION) {
            var dialog = new CATMAID.VersionMismatchDialog(
                CATMAID.CLIENT_VERSION, data.SERVER_VERSION);
            dialog.show();
          }
        })
        .catch(function(error) {
          CATMAID.statusBar.replaceLast('Unable to check version (network may be disconnected).');
        })
        .then(function() {
          window.setTimeout(CATMAID.Init.checkVersion, CATMAID.Init.CHECK_VERSION_TIMEOUT_INTERVAL);
        });
    }
  };

  CATMAID.asEventSource(CATMAID.Init);
  CATMAID.Init.EVENT_PROJECT_CHANGED = "init_project_changed";
  CATMAID.Init.EVENT_USER_CHANGED = "init_user_changed";

  /**
   * A menu showing available data views.
   * @type {Menu}
   */
  var dataview_menu;
  /**
   * A menu for all visible projets.
   * @type {Menu}
   */
  var project_menu;
  /**
   * A menu showing available layouts.
   * @type {Menu}
   */
  var layout_menu;
  /**
   * A menu for all stacks in the current project.
   * @type {Menu}
   */
  var stack_menu;
  /**
   * A menu for message related links.
   * @type {Menu}
   */
  var message_menu;
  /**
   * A menu for user related links.
   * @type {Menu}
   */
  var user_menu;

  // Timeout reference for user edit domain updates.
  var edit_domain_timeout;

  /**
   * Length (in milliseconds) of the interval to refresh user edit domain data.
   * @type {Number}
   */
  var EDIT_DOMAIN_TIMEOUT_INTERVAL = 5*60*1000;

  /**
   * Length (in milliseconds) of the message lookup interval.
   * @type {Number}
   */
  var MSG_TIMEOUT_INTERVAL = 60000;

  // Height of status bar
  var global_bottom = 29;


  /**
   * CATMAID's web front-end.
   */
  var Client = function(options) {
    let self = this;

    // Lazy load images in container with ID "content" and class "lazy".
    this.blazy = new Blazy({
      selector: ".lazy",
      container: "#content",
      loadInvisible: true,
      errorClass: "missing-image"
    });

    // A reference to the currently displayed data view
    this.current_dataview = null;

    // Currently visible projects
    this.projects = null;

    // The spinner icon in the top right corner
    this._spinner = null;
    // The context help icon in the top right corner
    this._contextHelpButton = null;
    // The context help container
    this._contextHelp = document.createElement('div');
    this._contextHelp.setAttribute('id', 'context-help');
    this._contextHelp.addEventListener('click', function(e) {
      // Close context help on click on close
      if (e.target.closest('.close-box')) {
        self.setContextHelpVisibility(false);
      }
    });

    this.showContextHelp = false;
    // Indicates if help visibility is defined through URL.
    this.contextHelpVisibilityEnforced = false;

    // Timeout reference for message updates if no websockets are available
    this._messageTimeout = undefined;

    // General update WebSockets connection reference (if available)
    this._updateSocket = undefined;

    // The number of attempts of re-opening a closed socket
    this._updateSocketRetries = 0;

    // Do periodic update checks
    window.setTimeout(CATMAID.Init.checkVersion, CATMAID.Init.CHECK_VERSION_TIMEOUT_INTERVAL);

    CATMAID.Layout.on(CATMAID.Layout.EVENT_USER_LAYOUT_CHANGED, function () {
      updateLayoutMenu();
    });

    CATMAID.Project.on(CATMAID.Project.EVENT_TOOL_CHANGED,
        this._handleProjectToolChange, this);
    CATMAID.Project.on(CATMAID.Project.EVENT_PROJECT_DESTROYED,
        this._handleProjectDestroyed, this);

    // Show and hide a spinner icon in the top right corner during active
    // requests.
    CATMAID.RequestQueue.on(CATMAID.RequestQueue.EVENT_REQUEST_STARTED,
        this._handleRequestStart, this);
    CATMAID.RequestQueue.on(CATMAID.RequestQueue.EVENT_REQUEST_ENDED,
        this._handleRequestEnd, this);

    this.init(options);
  };

  Client.Settings = new CATMAID.Settings(
    'client-settings',
    {
      version: 0,
      entries: {
        table_page_length_options: {
          default: [25, 50, 100, 500, 2000, -1]
        },
        auto_widget_state_save: {
          default: true
        },
        auto_widget_state_load: {
          default: true
        },
        confirm_project_closing: {
          default: true
        },
        binary_data_transfer: {
          default: true
        },
        context_help_visibility: {
          default: false
        },
        use_file_export_streams: {
          default: false
        },
        // Expect objects with the fields: id, name, url, api_key,
        // http_auth_user, http_auth_pass.
        remote_catmaid_instances: {
          default: []
        },
        last_stack_viewer_closes_project: {
          default: true,
        },
        warn_on_potential_gl_issues: {
          default: true,
        },
      }
    });

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, function () {
    // Load user settings
    CATMAID.Client.Settings
        .load()
        .then(function () {
          /**
           * Convenience wrappers for table page length settings.
           */
          Object.defineProperties(CATMAID, {
            pageLengthOptions: {
              get: function() {
                return CATMAID.Client.Settings.session.table_page_length_options;
              },
              configurable: true,
            },
            pageLengthLabels: {
              get: function() {
                var opts = CATMAID.Client.Settings.session.table_page_length_options;
                return CATMAID.getPageLengthLabels(opts);
              },
              configurable: true,
            },
          });

          CATMAID.client.updateContextHelp();
          // Show context help if configured for this project or if enforced
          // through first URL open.
          if (CATMAID.client.contextHelpVisibilityEnforced) {
            CATMAID.client.setContextHelpVisibility(CATMAID.client.showContextHelp);
          } else {
            CATMAID.client.setContextHelpVisibility(CATMAID.Client.Settings.session.context_help_visibility);
          }
          // This should only applied the first time.
          CATMAID.client.contextHelpVisibilityEnforced = false;
        });
  });



  // The front end's root window. This should eventually become part of Client,
  // it is already initialized by it.
  CATMAID.rootWindow = null;

  /**
   * Initialize the CATMAID web front-end based on the passed in options.
   */
  Client.prototype.init = function(options) {
    var pid;
    var sids = [];
    var ss = [];
    var sg, sgs;
    var inittool;
    var z;
    var y;
    var x;
    var s;
    var zp;
    var yp;
    var xp;
    var init_active_node_id;
    var init_active_skeleton_id;
    var singleStackViewer = false;
    var initialDataviewId = null;
    var help;

    var account;
    var password;

    if ( options )
    {
      // simply parse the fragment options
      // @todo take care for the options proper range
      if ( options[ "z" ] ) z = parseInt( options[ "z" ] );
      if ( isNaN( z ) ) z = undefined;
      if ( options[ "y" ] ) y = parseInt( options[ "y" ] );
      if ( isNaN( y ) ) y = undefined;
      if ( options[ "x" ] ) x = parseInt( options[ "x" ] );
      if ( isNaN( x ) ) x = undefined;
      if ( options[ "s" ] ) s = parseFloat( options[ "s" ] );
      if ( isNaN( s ) ) s = undefined;
      if ( options[ "active_skeleton_id" ] ) init_active_skeleton_id = parseInt( options[ "active_skeleton_id" ] );
      if ( options[ "active_node_id" ] ) init_active_node_id = parseInt( options[ "active_node_id" ] );

      if ( options.hasOwnProperty("help") ) help = options["help"] !== "false";
      if (help !== undefined) {
        this.setContextHelpVisibility(help);
        this.contextHelpVisibilityEnforced = true;
      }

      if ( !(
          typeof z == "undefined" ||
          typeof y == "undefined" ||
          typeof x == "undefined" ||
          typeof s == "undefined" ) )
      {
        pid = 1;
        sids = [];
        sids[ 0 ] = 1;
        ss = [];
        ss[ 0 ] = 1;
      }
      else
      {
        if ( options[ "pid" ] ) pid = options[ "pid" ];
        if ( options[ "zp" ] ) zp = parseInt( options[ "zp" ] );
        if ( isNaN( zp ) ) zp = undefined;
        if ( options[ "yp" ] ) yp = parseInt( options[ "yp" ] );
        if ( isNaN( yp ) ) yp = undefined;
        if ( options[ "xp" ] ) xp = parseInt( options[ "xp" ] );
        if ( isNaN( xp ) ) xp = undefined;
        if ( options[ "tool" ] ) inittool = options[ "tool"];

        for ( var i = 0; options[ "sid" + i ]; ++i )
        {
          var sid = options[ "sid" + i ];
          // Make sure a stack isn't opened multiple times
          if ( -1 !== sids.indexOf( sid ) ) {
            continue;
          }
          sids.push( sid );
          if ( options[ "s" + i ] )
            ss.push( parseFloat( options[ "s" + i ] ) );
          else
            ss.push( NaN );
          if ( isNaN( ss[ i ] ) )
          {
            sids.pop();
            ss.pop();
          }
        }
      }

      if ( options[ "sg" ] ) sg = Number( options[ "sg" ] );
      if ( isNaN( sg ) ) sg = undefined;

      if ( options[ "sgs" ] ) sgs = Number( options[ "sgs" ] );
      if ( isNaN( sgs ) ) sgs = undefined;

      if ( options[ "account" ] && options[ "password" ] )
      {
        account = options[ "account" ];
        password = options[ "password" ];
      }

      // find data view setting
      if ( options[ "dataview" ] ) {
        var dataViewId = parseInt( options["dataview"] );
        if ( !isNaN(dataViewId) ) {
          initialDataviewId = dataViewId;
        }
      }

      // Check if only one stack viewer should be used for all stacks
      if ( options[ "composite" ] ) {
        singleStackViewer = ("1" === options["composite"]);
      }
    }

    CATMAID.statusBar = new CATMAID.Console();
    document.body.appendChild( CATMAID.statusBar.getView() );

    var a_url = document.getElementById( "a_url" );
    a_url.onpointerover = function( e )
    {
      this.href = project.createURL();
      return true;
    };

    $(document.body).on('click', 'a[data-role=url-to-clipboard]', function() {
      let l = document.location;
      CATMAID.tools.copyToClipBoard(l.origin + l.pathname + project.createURL());
    });

    document.getElementById( "login_box" ).style.display = "block";
    document.getElementById( "logout_box" ).style.display = "none";
    document.getElementById( "session_box" ).style.display = "none";

    // Create the toolboxes
    $('#toolbox_project').replaceWith(CATMAID.createButtonsFromActions(
      CATMAID.toolActions, 'toolbox_project', ''));
    $('#toolbox_edit').replaceWith(CATMAID.createButtonsFromActions(
      CATMAID.EditTool.actions, 'toolbox_edit', ''));
    $('#toolbox_data').replaceWith(CATMAID.createButtonsFromActions(
      CATMAID.TracingTool.actions, 'toolbox_data', ''));

    // Add the toolbar buttons:
    document.getElementById( "toolbar_nav" ).style.display = "none";
    document.getElementById( "toolbar_text" ).style.display = "none";
    document.getElementById( "toolbar_tags" ).style.display = "none";
    document.getElementById( "toolbar_roi" ).style.display = "none";
    document.getElementById( "toolbox_project" ).style.display = "none";
    document.getElementById( "toolbox_edit" ).style.display = "none";
    document.getElementById( "toolbox_ontology" ).style.display = "none";
    document.getElementById( "toolbox_data" ).style.display = "none";
    document.getElementById( "toolbox_show" ).style.display = "none";

    document.getElementById( "account" ).onkeydown = login_oninputreturn;
    document.getElementById( "password" ).onkeydown = login_oninputreturn;

    dataview_menu = new Menu();
    document.getElementById( "dataview_menu" ).appendChild( dataview_menu.getView() );
    CATMAID.DataViews.list().then(handle_dataviews);

    project_menu = new Menu();
    document.getElementById( "project_menu" ).appendChild( project_menu.getView() );

    layout_menu = new Menu();
    document.getElementById( "layout_menu" ).appendChild( layout_menu.getView() );

    stack_menu = new Menu();
    document.getElementById( "stack_menu" ).appendChild( stack_menu.getView() );

    message_menu = new Menu();
    document.getElementById( "message_menu" ).appendChild( message_menu.getView() );

    user_menu = new Menu();
    document.getElementById( "user_menu" ).appendChild( user_menu.getView() );

    var self = this;

    var loadView;
    if (initialDataviewId) {
      loadView = CATMAID.DataViews.getConfig(initialDataviewId)
        .then(function(config) {
          self.current_dataview = CATMAID.DataView.makeDataView(config);
        })
        .catch(CATMAID.handleError);
    } else {
      loadView = Promise.resolve();
    }

    // login and thereafter load stacks if requested
    loadView
      .then(function() {
        return self.login();
      })
      .then(function() {
        var tools = {
          navigator: CATMAID.Navigator,
          tracingtool: CATMAID.TracingTool,
          classification_editor: null
        };

        var load = null;
        if (sg) {
          load = CATMAID.openStackGroup(pid, sg)
            .then(function() {
              if (typeof zp == "number" && typeof yp == "number" &&
                  typeof xp == "number") {
                project.moveTo(zp, yp, xp, sgs);
              }
            });
        } else  {
          load = loadStacksFromURL(singleStackViewer);
        }

        // After stacks or stack groups have been loaded, init selected tool.
        load.then(function() {
          var tool = tools[inittool];
          if (tool) {
            project.setTool(new tool());
          }

          var locationIsProvided = typeof zp == "number" &&
              typeof yp == "number" && typeof xp == "number";
          if (init_active_node_id) {
            // initialization hack
            SkeletonAnnotations.init_active_node_id = init_active_node_id;

            if (!locationIsProvided) {
              return CATMAID.Nodes.getLocation(init_active_node_id)
                .then(function(result) {
                   return project.moveTo(result[3], result[2], result[1])
                      .then(function(){
                         return SkeletonAnnotations.staticSelectNode(init_active_node_id);
                      });
                })
                .catch(function() {
                  CATMAID.warn('Could not select node ' + init_active_node_id);
                });
            }
          } else if (init_active_skeleton_id) {
            // initialization hack
            SkeletonAnnotations.init_active_skeleton_id = init_active_skeleton_id;

            if (!locationIsProvided) {
              return CATMAID.Skeletons.getRootNode(project.id, init_active_skeleton_id)
                .then(function(result) {
                   return project.moveTo(result.z, result.y, result.x)
                      .then(function(){
                         return SkeletonAnnotations.staticSelectNode(result.root_id);
                      });
                })
                .catch(function() {
                  CATMAID.warn('Could not select skeleton ' + init_active_skeleton_id);
                });
            }
          }
        })
        .catch(function(e) {
          // Handle login errors explicitely to re-init the web client
          // after login.
          if (e instanceof CATMAID.PermissionError) {
            new CATMAID.LoginDialog(e.error, CATMAID.initWebClient).show();
          } else {
            CATMAID.handleError(e);
          }
        });

        // Open stacks one after another and move to the requested location. Load
        // the requested tool after everything has been loaded.
        function loadStacksFromURL(composite, loaded) {
          loaded = loaded || 0;
          var useExistingStackViewer = composite && (loaded > 0);
          if (pid) {
            if (sids.length > 0) {
              var noLayout = sids.length > 1;
              // Open stack and queue test/loading for next one
              var sid = sids.shift();
              var s = ss.shift();
              return CATMAID.openProjectStack(pid, sid, useExistingStackViewer, undefined, noLayout, false)
                .then(function() {
                  // Moving every stack is not really necessary, but for now a
                  // convenient way to apply the requested scale to each stack.
                  if (typeof zp == "number" && typeof yp == "number" &&
                      typeof xp == "number" && typeof s == "number" ) {
                    return project.moveTo(zp, yp, xp, s)
                      .then(function() {
                        // Queue loading of next stack
                        return loadStacksFromURL(composite, loaded + 1);
                      });
                  }
                });
            }
          }
          return Promise.resolve();
        }
      })
      .catch(CATMAID.handleError)
      .then(function() {
        if (help !== undefined) {
          self.setContextHelpVisibility(help);
        }
      });

    // the text-label toolbar

    var input_fontsize = new Input( "fontsize", 3, function( e ){ return true; }, 32 );
    document.getElementById( "input_fontsize" ).appendChild( input_fontsize.getView() );
    var input_fontcolourred = new Input( "fontcolourred", 3, function( e ){ return true; }, 255 );
    document.getElementById( "input_fontcolourred" ).appendChild( input_fontcolourred.getView() );
    var input_fontcolourgreen = new Input( "fontcolourgreen", 3, function( e ){ return true; }, 127 );
    document.getElementById( "input_fontcolourgreen" ).appendChild( input_fontcolourgreen.getView() );
    var input_fontcolourblue = new Input( "fontcolourblue", 3, function( e ){ return true; }, 0 );
    document.getElementById( "input_fontcolourblue" ).appendChild( input_fontcolourblue.getView() );

    CATMAID.rootWindow = new CMWRootNode();
    CATMAID.ui.registerEvent( "onresize", resize );

    // change global bottom bar height, hide the copyright notice
    // and move the statusBar
    CATMAID.statusBar.setBottom();

    // Context help button
    self._contextHelpButton = document.getElementById('context-help-button');
    if (self._contextHelpButton) {
      self._contextHelpButton.addEventListener('click', function() {
        self.setContextHelpVisibility(!self.showContextHelp);
      });
    }
    self.updateContextHelp();

    window.onresize();

    console.log('CATMAID (Client version ' + CATMAID.CLIENT_VERSION + ')\n' +
                'For help interacting with CATMAID from the console see:\n' +
                'https://github.com/catmaid/CATMAID/wiki/Scripting');
  };

  /**
   * Update the list of known projects. This implies a menu and data view
   * update.
   *
   * @returns {Promise} Resolved once the update is complete.
   */
  Client.prototype.updateProjects = function() {
    project_menu.update(null);

    // Set a temporary loading data view
    this.switch_dataview(new CATMAID.DataView({
       id: null,
       type: 'empty',
       config: {
         message: 'Loading...',
         classList: 'wait_bgwhite'
       }
    }));

    var self = this;
    return CATMAID.Project.list(true)
      .then(function(json) {
        self.projects = json;

        self.refresh();

        // maps project tags to parent menus (which are dropped if no project is tagged)
        var tagToMenuData = {
          '' : {
            'title': 'untagged projects',
            'comment': '',
            'note': '',
            'action': []
          }
        };

        // Prepare JSON so that a menu can be created from it. Display only
        // projects that have at least one stack linked to them.
        json.filter(function(p) {
          return p.stacks.length > 0;
        }).forEach(function(p) {
          var stacks = p.stacks.reduce(function(o, s) {
            o[s.id] = {
              'title': s.title,
              'comment': s.comment,
              'note': '',
              'action': CATMAID.openProjectStack.bind(window, p.id, s.id, false, undefined, false, true)
            };
            return o;
          }, {});
          var stackgroups = p.stackgroups.reduce(function(o, sg) {
            o[sg.id] = {
              'title': sg.title,
              'comment': sg.comment,
              'note': '',
              'action': CATMAID.openStackGroup.bind(window, p.id, sg.id, true)
            };
            return o;
          }, {});

          var projectMenuData = {
            'title': p.title,
            'note': '',
            'action': [{
              'title': 'Stacks',
              'comment': '',
              'note': '',
              'action': stacks
            }]

          };

          // only add stackgroups sub-menu if they exist
          if (stackgroups.length > 0) {
            projectMenuData.action.push({
                                          'title': 'Stack groups',
                                          'comment': '',
                                          'note': '',
                                          'action': stackgroups
                                        });
          }

          if (p.hasOwnProperty('tags')) {

            // add project to parent tag menu for each of its tags
            for (var i=0; i < p.tags.length; i++) {
              var tag = p.tags[i];
              var tagMenuData;
              if (! tagToMenuData.hasOwnProperty(tag)) {
                tagMenuData = {
                  'title': tag + ' projects',
                  'comment': '',
                  'note': '',
                  'action': []
                };
                tagToMenuData[tag] = tagMenuData;
              } else {
                tagMenuData = tagToMenuData[tag];
              }

              tagMenuData.action.push(projectMenuData);
            }

          } else {

            // add project to untagged parent
            tagToMenuData[''].action.push(projectMenuData);

          }

        });

        // place untagged projects at top of root level
        var menuData = tagToMenuData[''].action;

        // nest remaining tag menus in tag order
        var sortedTagList = Object.keys(tagToMenuData).sort();
        for (var i=1; i < sortedTagList.length; i++) {
          menuData.push(tagToMenuData[sortedTagList[i]]);
        }

        project_menu.update(menuData);

        return self.projects;
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Update profile dependent information, e.g., the visibility of tools in the
   * toolbar. If a project is open and the user has browse permission, the
   * active project stays open.
   */
  Client.prototype.refresh = function() {
    if (project) {
      // Close an active project, if the active user doesn't have permission to
      // browse it.
      if (!CATMAID.mayView()) {
        project.destroy();
        project = null;
      } else {
        // Reset current tool
        project.setTool(project.getTool());
      }
    }

    // update the edit tool actions and its div container
    var new_edit_actions = CATMAID.createButtonsFromActions(CATMAID.EditTool.actions,
      'toolbox_edit', '');
    $('#toolbox_edit').replaceWith(new_edit_actions);
    if (project) {
      $('#toolbox_edit').show();
    } else {
      $('#toolbox_edit').hide();
    }
  };

  /**
   * Resize the main content and root window.
   *
   * Called by the window.onresize event.
   */
  var resize = function( e )
  {
    var top = document.getElementById( "toolbar_container" ).offsetHeight;
    var height = Math.max( 0, CATMAID.ui.getFrameHeight() - top - global_bottom );
    var width = CATMAID.ui.getFrameWidth();

    var content = document.getElementById( "content" );
    content.style.top = top + "px";
    content.style.width = width + "px";
    content.style.height = height + "px";

    var rootFrame = CATMAID.rootWindow.getFrame();
    rootFrame.style.top = top + "px";
    rootFrame.style.width = CATMAID.UI.getFrameWidth() + "px";
    rootFrame.style.height = height + "px";

    CATMAID.rootWindow.redraw();

    return true;
  };

  /**
   * Queue a login request optionally using account and password,
   * freeze the window to wait for an answer.
   *
   * If account or password are set, a new session is instantiated or an error occurs.
   * If account and password are not set, an existing session is tried to be recognised.
   *
   * @param  {string}   account
   * @param  {string}   password
   * @returns {Promise}
   */
  Client.prototype.login = function(account, password) {
    this.closeBackChannel();

    CATMAID.ui.catchEvents( "wait" );
    var login;
    if ( account || password ) {
      // Attempt to login.
      login = CATMAID.fetch('accounts/login', 'POST', {
          name: account,
          pwd : password
        });
    }
    else {
      // Check if the user is logged in.
      login = CATMAID.fetch('accounts/login', 'GET');
    }

    // Queue actual login handler
    login = login.then(handleSessionChange);

    // Handle error to reset cursor, but also return it to communicate it to
    // caller.
    login.catch(error => {
        if (error instanceof CATMAID.InactiveLoginError) {
          // If an inactive account is a member of inactivity groups, display
          // information on them. Otherwise show only a warning.
          if (error.meta && error.meta.inactivity_groups && error.meta.inactivity_groups.length > 0) {
            let dialog = new CATMAID.InactiveLoginDialog(error.meta.inactivity_groups);
            dialog.show();
            return;
          }
        }
        return CATMAID.handleError(error);
      })
      .then((function() {
        CATMAID.ui.releaseEvents();
        this.refreshBackChannel();
      }).bind(this));

    return login;
  };

  /**
   * Update the active user's edit domain (the list of user IDs whose
   * class instances they have permission to edit).
   */
  Client.prototype.refreshEditDomain = function () {
    function resetEditDomainTimeout() {
      if (edit_domain_timeout) {
        window.clearTimeout(edit_domain_timeout);
      }

      edit_domain_timeout = window.setTimeout(CATMAID.client.refreshEditDomain,
                                              EDIT_DOMAIN_TIMEOUT_INTERVAL);
    }

    CATMAID.fetch('accounts/login', 'GET')
        .then(function (json) {
          CATMAID.session.domain = new Set(json.domain);
          resetEditDomainTimeout();
        }, function () {
          CATMAID.statusBar.replaceLast('Unable to update account information (network may be disconnected).');
          resetEditDomainTimeout();
        });
  };

  // Publicly accessible session
  CATMAID.session = null;

  /**
   * Handle an updated session, typically as a reaction to a login or logout
   * action.
   *
   * @param   {Object}  session The session object returned by the back-end.
   * @returns {Promise} A promise resolving once all required updates for the
   *                    new session have been performed.
   */
  function handleSessionChange(e) {
    CATMAID.session = e;
    CATMAID.session.domain = new Set(e.domain);

    if (edit_domain_timeout) {
      window.clearTimeout(edit_domain_timeout);
    }

    if (e.id) { // Logged in as a non-anonymous user.
      document.getElementById("account").value = "";
      document.getElementById("password").value = "";
      document.getElementById("session_longname").replaceChild(
      document.createTextNode(e.longname), document.getElementById("session_longname").firstChild);
      document.getElementById("login_box").style.display = "none";
      document.getElementById("logout_box").style.display = "block";
      document.getElementById("session_box").style.display = "block";

      document.getElementById("message_box").style.display = "block";

      // Update user menu
      user_menu.update({
        "user_menu_entry_1": {
          action: CATMAID.makeURL("user/password_change/"),
          title: "Change password",
          note: "",
        },
        "user_menu_entry_2": {
          action: CATMAID.getAuthenticationToken,
          title: "Get API token",
          note: ""
        }
      });

      edit_domain_timeout = window.setTimeout(CATMAID.client.refreshEditDomain,
                                              EDIT_DOMAIN_TIMEOUT_INTERVAL);
    } else {
      document.getElementById( "login_box" ).style.display = "block";
      document.getElementById( "logout_box" ).style.display = "none";
      document.getElementById( "session_box" ).style.display = "none";

      document.getElementById( "message_box" ).style.display = "none";
    }

    // Continuation for user list retrieval
    var done = function () {
      // Try to update user profile
      try {
        if (e.userprofile) {
          CATMAID.userprofile = new CATMAID.Userprofile(e.userprofile);
        } else {
          throw new CATMAID.Error("The server returned no valid user profile.");
        }
      } catch (error) {
        /* A valid user profile is needed to start CATMAID. This is a severe error
        * and a message box will tell the user to report this problem.
        */
        throw new CATMAID.Error("The user profile couldn't be loaded. This " +
            "however, is required to start CATMAID. Please report this problem " +
            "to your administrator and try again later.", error);
      }

      // Show loading data view
      CATMAID.client.switch_dataview(new CATMAID.DataView({
         id: null,
         type: 'empty',
         config: {
            message: 'Loading list of available projects...'
         }
      }));

      var projectUpdate = CATMAID.client.updateProjects()
        .then(function() {
          var backgroundDataView = !!project;
          CATMAID.client.load_default_dataview(backgroundDataView);
        })
        .catch(CATMAID.handleError);

      // Update all datastores to reflect the current user before triggering
      // any events. This is necessary so that settings are correct when
      // updating for user change.
      var initDataStores = CATMAID.DataStoreManager.reloadAll().then(function () {
        CATMAID.Init.trigger(CATMAID.Init.EVENT_USER_CHANGED);
      });

      return Promise.all([projectUpdate, initDataStores]);
    };

    // Re-configure CSRF protection to update the CSRF cookie.
    CATMAID.setupCsrfProtection();

    var load = CATMAID.updatePermissions();
    if (e.id || (e.permissions && -1 !== e.permissions.indexOf('catmaid.can_browse'))) {
      // Asynchronously, try to get a full list of users if a user is logged in
      // or the anonymous user has can_browse permissions.
      load = load.then(CATMAID.User.getUsers.bind(CATMAID.User));
    }

    return load.then(done);
  }

  /**
   * Queue a login request on pressing return.
   * Used as onkeydown-handler in the account and password input fields.
   *
   * @param  {Object}  e Key event.
   * @return {boolean}   False if enter was pressed, true otherwise.
   */
  function login_oninputreturn(e) {
    if (e.key === 'Enter') {
      CATMAID.client.login(document.getElementById("account").value, document.getElementById("password").value);
      return false;
    } else {
      return true;
    }
  }

  /**
   * Check if there are new messages for the current user.
   */
  Client.prototype.check_messages = (function() {

    // The date of the last unread message
    var latest_message_date = null;

    return function(singleRequest) {
      CATMAID.fetch('messages/latestunreaddate')
        .then(function(data) {
          // If there is a newer latest message than we know of, get all
          // messages to display them in the message menu and widget.
          if (data.latest_unread_date) {
            if (!latest_message_date || latest_message_date < data.latest_unread_date) {
              // Save the date and get all messages
              latest_message_date = data.latest_unread_date;
              CATMAID.client.get_messages()
                .then(handle_message);
              return;
            }
          }
        })
        .catch(function(error) {
          CATMAID.statusBar.replaceLast('Unable to check for messages (network may be disconnected).');
        })
        .then((function() {
          if (!singleRequest) {
            // Check again later
            this._messageTimeout = window.setTimeout(CATMAID.client.check_messages,
                MSG_TIMEOUT_INTERVAL);
          }
        }).bind(this));
    };
  })();

  /**
   * Parse WebSockets messages and take appropriate action.
   */
  Client.prototype._handleWebsockMessage = function(message) {
    var data = JSON.parse(message.data);
    if (!data) {
      throw new CATMAID.ValueError("Unexpected message format: " +
          message.data);
    }
    var handler = CATMAID.Client.messageHandlers.get(data.event);
    if (!handler) {
      throw new CATMAID.ValueError("Unexpected message from server: " +
          message.data);
    }
    handler(this, data.payload);
  };

  Client.messageHandlers = new Map([[
        'new-message',
        function(client, payload) {
          CATMAID.msg("New message", payload.message_title);
          client.check_messages(true);
        }
      ], [
        'unknown',
        function(message) {
          var report = "An unknown message has been received" +
              (message ? (": " + message) : "");
          CATMAID.warn(report);
          console.log(report);
        }
      ]]);

  /**
   * Try to setup WebSockets channels to the back-end server to avoid long
   * polling for message updates and more. If this is not possible, resort to
   * long polling.
   */
  Client.prototype.refreshBackChannel = function() {
    if (Modernizr.websockets) {
      // Close existing socket, if any
      if (this._updateSocket) {
        this._updateSocket.close();
      }
      // Create new socket
      var url = (window.location.protocol.startsWith('https') ? 'wss://' : 'ws://') +
          window.location.host + CATMAID.makeURL('/channels/updates/');
      this._updateSocket = new WebSocket(url);

      this._updateSocket.onopen = (function() {
        console.log('WebSockets connection established.');
        this._updateSocketRetries = 0;
      }).bind(this);

      // If errors happen (e.g. the back-end doesn't support WebSockets), fall
      // back to long polling.
      this._updateSocket.onerror = (function() {
        console.log('There was an error establishing WebSockets connections. ' +
            'Falling back to long polling.');
        this.refreshLongPolling();
        // Don't call clone handler after error
        this._updateSocket.onclose = null;
      }).bind(this);

      // When a WebSockets connection is closed, try to re-open it three times
      // before falling back to long polling.
      this._updateSocket.onclose = (function() {
        let maxRetries = 3;
        if (this._updateSocketRetries >= maxRetries) {
          console.log('WebSockets connection closed and maximum number of ' +
            'retries reached, falling back to long polling.');
          this.refreshLongPolling();
        } else {
          this._updateSocket = undefined;
          ++this._updateSocketRetries;
          console.log('WebSockets connection closed. Trying to re-open it in 3 second, retry ' +
              this._updateSocketRetries + '/' + maxRetries + '.');
          setTimeout(this.refreshBackChannel.bind(this), 3000);
        }

      }).bind(this);

      this._updateSocket.onmessage = this._handleWebsockMessage.bind(this);

      // Initial message update without long polling
      this.check_messages(true);

      // In case the socket was opened before the event listener was registered.
      if (this._updateSocket.readyState == WebSocket.OPEN) {
        this._updateSocket.onopen();
      }
    } else {
      this.refreshLongPolling();
    }
  };

  /**
   * Close any existing back-end server connections.
   */
  Client.prototype.closeBackChannel = function() {
    if (this._messageTimeout) window.clearTimeout(this._messageTimeout);
  };

  /**
   * Enable long polling update functions.
   */
  Client.prototype.refreshLongPolling = function() {
    this.check_messages();
  };

  /**
   * Retrieve user messages.
   */
  Client.prototype.get_messages = function() {
    return CATMAID.fetch('messages/list');
  };

  /**
   * Handle use message request response.
   *
   * @param  {Object}  e  A map of message objects.
   */
  function handle_message(e)
  {
    if ( !CATMAID.session || !CATMAID.session.id )
      return;

    var message_container = document.getElementById( "message_container" );
    if ( !( typeof message_container === "undefined" || message_container === null ) )
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
              notifications_button_img.attr('src', STATIC_URL_JS + 'images/table_notifications_open.svg');
            else
              notifications_button_img.attr('src', STATIC_URL_JS + 'images/table_notifications.svg');
          }

          delete e [ i ];
        } else {
          var timeFormatted = (new Date(e[i].time)).toLocaleString();
          e[ i ].action = CATMAID.makeURL('messages/' + e[i].id + '/mark_read');
          e[ i ].note = timeFormatted;
          ++n;
          var dt = document.createElement( "dt" );
          dt.appendChild( document.createTextNode( timeFormatted ) );
          var dd1 = document.createElement( "dd" );
          var dd1a = document.createElement( "a" );
          dd1a.href = e[ i ].action;
          dd1a.target = '_blank';
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
      // Make all message links open in a new page
      var links = message_menu.getView().querySelectorAll('a');
      for (var j=0; j<links.length; ++j) {
        links[j].target = '_blank';
      }
      if ( n > 0 ) document.getElementById( "message_menu_text" ).className = "alert";
      else document.getElementById( "message_menu_text" ).className = "";
    }
  }

  /**
   * Mark a message as read
   *
   * @param  {number} id ID of the message to mark as read.
   */
  Client.prototype.read_message = function(id) {
    return CATMAID.fetch('messages/' + id + '/mark_read', 'POST');
  };

  /**
   * Display the messages window.
   */
  Client.prototype.showMessages = (function()
  {
    // A reference to the currently displayed message window (if any)
    var messageWindow = null;

    return function() {
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
              if ( typeof project === "undefined" || project === null )
              {
                CATMAID.rootWindow.close();
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

        var rootWindow = CATMAID.rootWindow;

        /* be the first window */
        let windowContainer = document.getElementById('windows');
        if (!windowContainer) {
          throw new CATMAID.ValueError("Could not find window container");
        }
        if (rootWindow.getFrame().parentNode != windowContainer)
        {
          windowContainer.appendChild( rootWindow.getFrame() );
          document.getElementById( "content" ).style.display = "none";
        }

        if ( rootWindow.getChild() === null )
          rootWindow.replaceChild( messageWindow );
        else
          rootWindow.replaceChild( new CMWVSplitNode( messageWindow, rootWindow.getChild() ) );
      }

      messageWindow.focus();
    };

  })();

  /**
   * Queue a logout request.
   * Freeze the window to wait for an answer.
   */
  Client.prototype.logout = function() {
    this.closeBackChannel();

    CATMAID.ui.catchEvents("wait");
    var logout = CATMAID.fetch('accounts/logout', 'POST');

    logout = logout.then(handleSessionChange);

    // Handle error to reset cursor, but also return it to communicate it to
    // caller.
    logout.catch(CATMAID.handleError)
      .then((function() {
        CATMAID.ui.releaseEvents();
        this.refreshBackChannel();
      }).bind(this));

    return logout;
  };

  /**
   * An object to store profile properties of the current user.
   * @type {CATMAID.Userprofile}
   */
  CATMAID.userprofile = null;

  // a function for creating data view menu handlers
  var handleDataViewSelection = function(id) {
    // close any open project and its windows
    if (project) {
      project.destroy();
    } else {
      CATMAID.rootWindow.closeAllChildren();
    }

    CATMAID.DataViews.getConfig(id)
      .then(function(config) {
        // open data view
        var dataview = CATMAID.DataView.makeDataView(config);
        CATMAID.client.switch_dataview(dataview);
      })
      .catch(CATMAID.handleError);
  };

  function handle_dataviews(e) {
    var menuItems = {};
    /* As we want to handle a data view change in JS,
     * a function is added as action for all the menu
     * elements. Also add small links to each menu entry
     * as comment.
     */
    for ( var i in e )
    {
      var dv = e[i];
      var url = CATMAID.makeURL('?dataview=' + dv.id);
      var link = '<a class="hoverlink" href="' + url + '">&para;&nbsp;</a>';
      menuItems[i] = {
        title: dv.title,
        note: link + dv.note,
        action: handleDataViewSelection.bind(undefined, dv.id)
      };
    }

    dataview_menu.update(menuItems);
  }

  /**
   * Load a particular data view.
   *
   * @param background {bool} Optional, if the data view should only be loaded,
   *                          not activated.
   */
  Client.prototype.switch_dataview = function(dataview, background) {
    var container = document.getElementById("data_view");

    // Get container and remove old content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let self = this;
    dataview.createContent(container)
      .then(function() {
        dataview.refresh();
        // Revalidate content to lazy-load
        CATMAID.client.blazy.revalidate();

        self.current_dataview = dataview;
      });

    // Make sure container is visible
    container.style.display = "block";
  };

  /**
   * Load the default data view.
   *
   * @param background {bool} Optional, if the data view should only be loaded,
   *                          not activated.
   */
  Client.prototype.load_default_dataview = function(background) {
    var self = this;
    CATMAID.DataViews.getDefaultConfig()
      .then(function(config) {
        // If no data view is defined on the back-end, use a default data view.
        if (!config || !config.id || CATMAID.tools.isEmpty(config.config)) {
          config = {
            id: null,
            type: 'simple_project_list_data_view',
            config: {
              header: false,
              message: false
            }
          };
        }
        var dataview = CATMAID.DataView.makeDataView(config);
        self.switch_dataview(dataview, background);
      })
      .catch(CATMAID.handleError);
  };

  Client.prototype.handleKeyPress = function(e) {
    if (this.current_dataview) {
      if (CATMAID.tools.isFn(this.current_dataview.handleKeyPress)) {
        return this.current_dataview.handleKeyPress(e);
      }
    }
    return false;
  };

  Client.prototype._handleProjectToolChange = function() {
    this.updateContextHelp();
  };

  Client.prototype._handleProjectDestroyed = function() {
    this.updateContextHelp(true);
  };

  Client.prototype._handleRequestStart = function() {
    this.setSpinnerVisibility(true);
    this.setContextHelpButtonVisibility(false);
  };

  Client.prototype._handleRequestEnd = function() {
    this.setSpinnerVisibility(false);
    this.setContextHelpButtonVisibility(true);
  };

  Client.prototype.setSpinnerVisibility = function(visible) {
    if (!this._spinner) {
      this._spinner = document.getElementById( "spinner" );
    }
    if (this._spinner) {
      this._spinner.style.display = visible ? "block" : "none";
    }
  };

  Client.prototype.setContextHelpButtonVisibility = function(visible) {
    if (!this._contextHelpButton) {
      this._contextHelpButton = document.getElementById("context-help-button");
    }
    if (this._contextHelpButton) {
      this._contextHelpButton.style.display = visible ? "block" : "none";
    }
  };

  Client.prototype.setContextHelpVisibility = function(visible) {
    if (!this._contextHelp) {
      this._contextHelp = document.getElementById("context-help");
    }
    let dialogContainer = document.getElementById('dialogs');
    if (this._contextHelp && dialogContainer) {
      if (visible) {
        dialogContainer.appendChild(this._contextHelp);
      } else if (this._contextHelp.parentNode == dialogContainer) {
        dialogContainer.removeChild(this._contextHelp);
      }
    }
    this.showContextHelp = visible;
  };

  Client.prototype.updateContextHelp = function(forceNoProject) {
    if (!this._contextHelp) {
      this._contextHelp = document.getElementById("context-help");
    }
    if (!this._contextHelp) {
      return;
    }

    let content = [
      '<div class="close-box"><i class="fa fa-close"></i></div>',
      '<div class="content">',
      '<h1>Overview</h1>',
      '<p>CATMAID is a collaborative platform for browsing large image stacks, ',
      'neuron reconstruction, circuit and morphology ananlysis as well as ',
      'ontology annotation.</p>'
    ];

    if (project && !forceNoProject) {
      Array.prototype.push.apply(content, [
        '<p>With a project open, the top bar provides access to ',
        'various tools. The first section contains general tools (<em>Open Widget</em>, ',
        '<em>Navigator</em>, <em>Settings</em>, <em>Help</em>). The second section ',
        'shows all enabled workflow tools (<em>Neuron reconstruction</em>, ',
        '<em>Ontologies</em>, ...). With a particular workflow tool selected, a ',
        'provides quick access icons for widgets related to this tool.</p>',
        '<p>There is a dynamically adjusted scale displayed in the lower left ',
        'corner. The little blue/white box in the lower left corner is used to ',
        'toggle the display of the layer settings, which all the configuration ',
        'of all displayed <em>layers</em> in the current <em>Stack Viewer</em>. ',
        'If <em>WebGL</em> is enabled, tools like additive color blending, look ',
        'up tables or contrast / saturation / brighness adjustment can be ',
        'configured there.  The lower right corner provides access to a thumbnail ',
        'sized overview image of the current location.<p>'
      ]);

      let tool = project.getTool();
      if (tool && CATMAID.tools.isFn(tool.getContextHelp)) {
        content.push(tool.getContextHelp());
      }
    } else {
      Array.prototype.push.apply(content, [
        '<p>The front-page is organized in so called ',
        '<em>data views</em>. In their simplest form the current ',
        'data view shows all projects visible to the current user ',
        'along with their linked <em>Stacks</em> and <em>Stack groups</em>.</p>',
        '<p>Other views are, however, possible as well so that other ',
        'or filered content might be shown. Custom data views can be ',
        'configured in the admin interface. The context menu for the ',
        '<em>Home</em> menu link in the top tool bar provides access ',
        'to all available data views. The small icon at the right of ',
        'each menu entry allows to link directly to a particular view.</p>',
        '<p>The <em>Projects menu</em> provides an alternate way to access ',
        'visible projects. For each project, stacks and stack groups are ',
        'shown in the menu. ',
        'Clicking on a particular <em>Stack</em> or <em>Stack group</em> ',
        'link will open the respective project along with the selected ',
        'stack selection.</p>'
      ]);
    }

    this._contextHelp.innerHTML = content.join('');
  };

  /**
   * Warns the user with a dialog about potential WebGL performance issues.
   */
  Client.warnOnPotentialGlPerformanceProblems = function () {
    let glSupported = PIXI.utils.isWebGLSupported(false);
    let glSupportedStrict = PIXI.utils.isWebGLSupported(true);

    if (CATMAID.Client.Settings.session.warn_on_potential_gl_issues &&
        glSupported && !glSupportedStrict) {
      let handler = (e) => {
        if (e.target.id !== 'no-gl-perf-warn') return;
        CATMAID.Client.Settings.session.warn_on_potential_gl_issues = !e.target.checked;
      };
      document.addEventListener('change', handler);
      let duration = 5000;
      CATMAID.warn("Potential graphics performance problem: due to the graphics hardware or graphics driver installed, rendering speed might be reduced. Potential fix in case of Nvidia hardware and Linux: make sure official Nvidia drivers are in use.<br /><label><input id='no-gl-perf-warn' type='checkbox' style='position:relative; top:0.25em;' />Don't show again</label>", {
        duration: duration,
      });
      // Remove the handler after three times the duration to allow users to
      // click on it. There are certainly more robust ways to do this, but for
      // this corner case, a simpler approach like this feels justified.
      setTimeout(() => {
        document.removeEventListener('change', handler);
      }, 3 * duration);
    }
  };

  // Export Client
  CATMAID.Client = Client;

  /**
   * Open the given a specific stack group in a project.
   *
   * @param {number}  pid          ID of the project to open.
   * @param {number}  sgid         ID of the stack group to open.
   * @param {boolean} handleErrors (optional) If true, errors are handled
   *                               internally and even in the case of errors a
   *                               resolved promise is returned
   * @returns promise that will be resolved on success
   */
  CATMAID.openStackGroup = function(pid, sgid, handleErrors) {
    var request = CATMAID.fetch(pid + "/stackgroup/" + sgid + "/info", "GET")
      .then(function(json) {
        if (!json.stacks || 0 === json.stacks.length) {
          // If a stack group has no stacks associated, cancel loading.
          CATMAID.error("The selected stack group has no stacks associated",
              "Canceling loading");
          return;
        }

        if (project) {
          project.destroy();
        }

        CATMAID.throwOnInsufficientWebGlContexts(json.stacks.length);
        CATMAID.Client.warnOnPotentialGlPerformanceProblems();

        var loadedStackViewers = [];

        // Open first stack
        return loadNextStack(json.project_id, 0, json.id, json.stacks);

        function loadNextStack(pid, stackIndex, sgId, stacks, firstStackViewer) {
          var stack = stacks[stackIndex];
          return CATMAID.fetch(pid + '/stack/' + stack.id + '/info')
            .then(function(json) {
              var stackViewer;
              // If there is already a stack loaded and this stack is a channel of
              // the group, add it to the existing stack viewer. Otherwise, open
              // the stack in a new stack viewer.
              if (firstStackViewer && 'channel' === stack.relation) {
                stackViewer = firstStackViewer;
              }
              // Try to load stacks and continue trying if loading fails for
              // one. Load stacks invisible (opacity of 0) to avoid a Pixi.js
              // initialization problem with multiple renderers at the same
              // time.
              return handle_openProjectStack(json, stackViewer, undefined, true)
                .catch(CATMAID.handleError)
                .then(function(newStackViewer) {
                  loadedStackViewers.push(newStackViewer);
                  var nextIndex = stackIndex + 1;
                  if (nextIndex < stacks.length) {
                    var sv = firstStackViewer ? firstStackViewer : newStackViewer;
                    return loadNextStack(pid, nextIndex, sgId, stacks, sv);
                  } else {
                    project.lastLoadedStackGroup = {
                      id: sgId,
                      stacks: stacks
                    };
                    CATMAID.layoutStackViewers();
                    // Make all stack layers visible, they have been initialized
                    // invisible.
                    for (var i=0; i<loadedStackViewers.length; ++i) {
                      var sv = loadedStackViewers[i];
                      var stackLayers = sv.getLayersOfType(CATMAID.StackLayer);
                      for (var j=0; j<stackLayers.length; ++j) {
                        var tl = stackLayers[j];
                        tl.setOpacity(1.0);
                        tl.redraw();
                      }
                    }
                  }
                });
            });
        }
      });

    // Catch error, but return rejected promise
    request.catch(function(error) {
      if (error && error.error && error.detail) {
        CATMAID.error("Couldn't load stack group: " + error.error, error.detail);
      } else {
        CATMAID.error("Couldn't load stack group", error);
      }
    });

    if (handleErrors) {
      request = request.catch(CATMAID.handleError);
    }
    return request;
  };

  /*
   * Open a project and stack in a stack viewer, returning a promise yielding
   * the stack viewer.
   *
   * @param  {number|string} projectID   ID of the project to open. If different
   *                                     than the ID of the currently open
   *                                     project, it will be destroyed.
   * @param  {number|string} reorientedStackID ID of the stack to open.
   * @param  {boolean} useExistingViewer True to add the stack to the existing,
   *                                     focused stack viewer.
   * @param  {number}  mirrorInde        An optional mirror index, defaults to
   *                                     the first available.
   * @param  {boolean} noLayout          Falsy to layout all available stack
   *                                     viewers (default).
   * @param  {boolean} handleErrors      (optional) If true, errors are handled
   *                                     internally and even in the case of
   *                                     errors a resolved promise is returned
   * @return {Promise}                   A promise yielding the stack viewer.
   */
  CATMAID.openProjectStack = function(projectID, reorientedStackID, useExistingViewer,
      mirrorIndex, noLayout, handleErrors) {
    if (project && project.id != projectID) {
      project.destroy();
    }

    let {stackID, reorient} = CATMAID.Stack.parseReorientedID(reorientedStackID);

    CATMAID.ui.catchEvents("wait");
    var open = CATMAID.fetch(projectID + '/stack/' + stackID + '/info')
      .then(function(json) {
        return handle_openProjectStack(json,
            useExistingViewer ? project.focusedStackViewer : undefined,
            mirrorIndex,
            undefined,
            reorient)
          .then(function() {
            if (noLayout) {
              return;
            }
            try {
              // Don't let all of open() fail, only because the layout failed
              CATMAID.layoutStackViewers();
            } catch(error) {
              CATMAID.handleError(error);
            }
          });
      });

    // Catch any error, but return original rejected promise
    open.catch(function(e) {
      CATMAID.ui.releaseEvents();
    });

    if (handleErrors) {
      open = open.catch(CATMAID.handleError);
    }
    return open;
  };

  function updateLayoutMenu() {
    var layoutMenuContent = [{
      id: 'save-current-layout',
      title: 'Save current layout',
      note: '',
      action: function() {
        // Ask for name
        var dialog = new CATMAID.OptionsDialog();
        dialog.appendMessage('Please enter the name for the new layout');
        var nameInput = dialog.appendField("Name: ", 'new-layout-name', '', true);
        dialog.onOK = function() {
          var layoutName =nameInput.value.trim();
          if (layoutName.length === 0) {
            throw new CATMAID.ValueError('Please choose a valid layout name');
          }
          CATMAID.Layout.addUserLayout(layoutName, CATMAID.rootWindow)
            .then(function() {
              CATMAID.msg('Success', 'New layout "' + layoutName + '" stored');
            })
            .catch(CATMAID.handleError);
        };
        dialog.show('auto', 'auto');
      }
    }, {
      id: 'close-all-widgets',
      title: 'Close all widgets',
      note: '',
      action: function() {
        if (!confirm('Are you sure you want to close all widgets?')) {
          return;
        }
        CATMAID.WindowMaker.closeAllButStackViewers(project.getStackViewers());
      }
    }];
    var userLayouts = CATMAID.Layout.Settings.session.user_layouts;
    if (userLayouts && userLayouts.length > 0) {
      userLayouts.forEach(function(spec) {
        try {
          let info = CATMAID.Layout.parseAliasedLayout(spec);
          layoutMenuContent.push({
            id: 'layout-' + layoutMenuContent.length,
            title: info.name,
            note: '',
            action: function() {
              let layout = new CATMAID.Layout(info.spec);
              if (CATMAID.switchToLayout(layout)) {
                CATMAID.msg('Success', 'Layout ' + info.name + ' loaded');
              }
            }
          });
        } catch (error) {
          CATMAID.warn(error);
        }
      });
    }

    layout_menu.update(layoutMenuContent);
  }

  /**
   * Open a stack from a stack info API JSON response. Open the project or, if
   * already opened, add the stack to the opened project. If not opening a new
   * project, an existing stack viewer can be specified to receive the stack.
   *
   * @param  {Object} e                JSON response from the stack info API.
   * @param  {StackViewer} stackViewer Viewer to which to add the stack.
   * @param  {number}      mirrorIndex Optional mirror index, defaults to
   *                                   the first available.
   * @param  {Boolean} hide            The stack's layer will initially be
   *                                   hidden.
   * @return {Promise}                 A promise yielding the stack viewer
   *                                   containing the new stack.
   */
  function handle_openProjectStack( e, stackViewer, mirrorIndex, hide, reorient )
  {
    if (!stackViewer) {
      CATMAID.throwOnInsufficientWebGlContexts(1);
      CATMAID.Client.warnOnPotentialGlPerformanceProblems();
    }
    // If the stack's project is not the opened project, replace it.
    if (!(project && project.id == e.pid)) {
      project = new CATMAID.Project(e.pid);
      project.register();
      // Update all datastores to reflect the active project before triggering
      // any events. This is necessary so that settings are correct when
      // updating for the project change.
      return Promise.all([project.updateInterpolatableLocations(),
          CATMAID.DataStoreManager.reloadAll()]).then(function () {
        CATMAID.Init.trigger(CATMAID.Init.EVENT_PROJECT_CHANGED, project);

        updateLayoutMenu();

        // Make menus visible if a project is loaded, otherwise hide them.
        var layoutMenuBox = document.getElementById( "layoutmenu_box" );
        layoutMenuBox.firstElementChild.lastElementChild.style.display = "none";
        layoutMenuBox.style.display = "block";

        // Update the projects stack menu. If there is more than one stack
        // linked to the current project, a submenu for easy access is
        // generated. This need to be done only once on project creation.
        stack_menu.update();
        CATMAID.Stack.list(project.id, true)
          .then(function(stacks) {
            if (stacks.length > 1) {
              var stack_menu_content = [];
              stacks.forEach(function(s) {
                stack_menu_content.push({
                    id: s.id,
                    title: s.title,
                    note: '',
                    action: [{
                        title: 'Open in new viewer',
                        note: '',
                        action: CATMAID.openProjectStack.bind(window, s.pid, s.id, false, undefined, true, true)
                      },{
                        title: 'Add to focused viewer',
                        note: '',
                        action: CATMAID.openProjectStack.bind(window, s.pid, s.id, true, undefined, true, true)
                      }
                    ]
                  }
                );
              });

              stack_menu.update( stack_menu_content );
              var stackMenuBox = document.getElementById( "stackmenu_box" );
              stackMenuBox.firstElementChild.lastElementChild.style.display = "none";
              stackMenuBox.style.display = "block";
            }
          }).catch(CATMAID.handleError);

        return loadStack(e, undefined, hide, reorient);
      });
    } else {
      // Call loadStack() asynchronously to catch potential errors in the
      // promise handling code. Otherwise, an error during the construction of
      // one stack viewer will cancel the following ones.
      return new Promise(function(resolve, reject) {
        resolve(loadStack(e, stackViewer, hide, reorient));
      });
    }

    function loadStack(e, stackViewer, hideStackLayer, reorient) {
      var useExistingViewer = typeof stackViewer !== 'undefined';

      var stack = new CATMAID.Stack.fromStackInfoJson(e);
      if (CATMAID.tools.isNumber(reorient)) {
        stack = new CATMAID.ReorientedStack(stack, reorient);
      }

      // If this is a label stack, not a raw stack, create a label annotation
      // manager.
      // TODO: should eventually use a backend image label space instead.
      if (!!stack.labelMetadata()) {
        CATMAID.LabelAnnotations.get(stack);
      }

      if (!useExistingViewer) {
        stackViewer = new CATMAID.StackViewer(project, stack);
      }

      document.getElementById( "toolbox_project" ).style.display = "block";

      var stackLayerConstructor = CATMAID.StackLayer.preferredConstructorForStack();
      var stackLayer = new stackLayerConstructor(
          stackViewer,
          "Image data (" + stack.title + ")",
          stack,
          mirrorIndex,
          !hideStackLayer,
          hideStackLayer ? 0 : 1,
          !useExistingViewer,
          CATMAID.StackLayer.INTERPOLATION_MODES.INHERIT,
          true);

      if (!useExistingViewer) {
        stackViewer.addLayer("StackLayer", stackLayer);

        project.addStackViewer( stackViewer );

        // refresh the overview handler to also register the pointer events on the buttons
        stackViewer.layercontrol.refresh();
      } else {
        stackViewer.addStackLayer(stack, stackLayer);
      }

      CATMAID.ui.releaseEvents();
      return stackViewer;
    }
  }

  CATMAID.getAuthenticationToken = function() {
    var dialog = new CATMAID.OptionsDialog('API Authentication Token', undefined, true);
    dialog.appendMessage('To retrieve your API authentication token, you must ' +
                         're-enter your password.');
    var password = dialog.appendField('Password:', 'password', '', true);
    password.setAttribute('type', 'password');
    dialog.onCancel = function() {
      $(this.dialog).dialog("destroy");
    };
    dialog.onOK = function () {
      CATMAID.fetch('/api-token-auth/',
                    'POST',
                    {username: CATMAID.session.username,
                     password: password.value})
          .then(function (json) {
            $(dialog.dialog).dialog("destroy");
            var resultDialog = new CATMAID.OptionsDialog('API Authentication Token');
            resultDialog.appendHTML('Your API token is');
            var container = document.createElement('p');
            var token = document.createElement('input');
            token.setAttribute('value', json.token);
            token.setAttribute('readonly', true);
            token.setAttribute('size', 40);
            var copyButton = $('<button />')
                .button({
                  icons: {primary: "ui-icon-clipboard"},
                  label: 'Copy to clipboard',
                  text: false
                })
                .click(function () {
                  token.select();
                  document.execCommand('copy');
                });
            container.appendChild(token);
            container.appendChild(copyButton.get(0));
            resultDialog.dialog.appendChild(container);
            resultDialog.appendHTML(
                'This token is tied to your account and shares your ' +
                'permissions. ' +
                'Requests using this token can do anything your account can ' +
                'do, so <b>do not distribute this token or check it into ' +
                'source control.</b>');
            resultDialog.appendHTML(
                'For help using your API token, see the ' +
                '<a target="_blank" href="' +
                CATMAID.makeDocURL('api.html#api-token') + '">' +
                'API use documentation</a> and ' +
                '<a target="_blank" href="' + CATMAID.makeURL('/apis/') + '">' +
                'this server\'s API documentation</a>.');
            resultDialog.show(460, 280, true);
          })
          .catch(function(error) {
            if (error.statusCode === 400) {
              CATMAID.warn("Wrong password");
            } else {
              CATMAID.handleError(error);
            }
          });
    };

    dialog.show(460, 200, true);
  };

  /**
   * Initialize CATMAID.
   *
   * Check browser capabilities.
   * Parse deep link from the URL if necessary.
   * Setup UI and windowing system.
   *
   * Called by the onload-handler of document.body.
   */
  CATMAID.initWebClient = function() {
    // If the browser supports everything but webgl, let the user dismiss the warning message
    if (Modernizr.opacity && Modernizr.canvas && Modernizr.svg && Modernizr.json)
    {
      $('#browser_unsupported .message').append($('<p><a href="#">Dismiss<a/></p>').click(function () {
        $('#browser_unsupported').hide();
      }));
    }

    // If promises are missing, load a polyfill then try to init again.
    if (!Modernizr.promises)
    {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = STATIC_URL_JS + 'libs/promise-polyfill/es6-promise-2.0.1.min.js';
      script.onload = function () {
        window.ES6Promise.polyfill();
        Modernizr.promises = true;
        CATMAID.initWebClient();
      };
      document.head.appendChild(script);
      return;
    }

    // Initialize a new CATMAID front-end
    var options = CATMAID.tools.parseQuery(window.location.search);
    CATMAID.client = new CATMAID.Client(options);
  };

  CATMAID.mayEdit = function() {
    return checkPermission('can_annotate');
  };

  CATMAID.mayView = function() {
    return checkPermission('can_annotate') || checkPermission('can_browse');
  };

  function checkPermission(p) {
    return CATMAID.hasPermission(project.getId(), p);
  }

})(CATMAID);
