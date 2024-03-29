// These globals are currently used in many places and have yet to be moved into
// the CATMAID namespace.
var requestQueue; // jshint ignore:line
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
  CATMAID.Init.EVENT_KNOWN_REMOTES_CHANGED = "init_remotes_changed";

  /**
   * UI menus for top-level navigation and user actions.
   * @type {Object.<string, Menu>}
   */
  var menus = {};

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

    // A reference to the container, this CATMAID client is initialized in.
    this._container = undefined;

    // Whether or not this client is authenticated with a back-end.
    this._is_authenticated = false;

    // A list of known data views
    this._knownDataViews = {};

    // Do periodic update checks
    window.setTimeout(CATMAID.Init.checkVersion, CATMAID.Init.CHECK_VERSION_TIMEOUT_INTERVAL);

    CATMAID.Layout.on(CATMAID.Layout.EVENT_USER_LAYOUT_CHANGED, function () {
      updateLayoutMenu();
    });

    CATMAID.Project.on(CATMAID.Project.EVENT_TOOL_CHANGED,
        this._handleProjectToolChange, this);
    CATMAID.Project.on(CATMAID.Project.EVENT_PROJECT_CHANGED,
        this._handleProjectChanged, this);
    CATMAID.Project.on(CATMAID.Project.EVENT_PROJECT_DELETED,
        this._handleProjectDeleted, this);
    CATMAID.Project.on(CATMAID.Project.EVENT_PROJECT_DESTROYED,
        this._handleProjectDestroyed, this);

    // Show and hide a spinner icon in the top right corner during active
    // requests.
    CATMAID.RequestQueue.on(CATMAID.RequestQueue.EVENT_REQUEST_STARTED,
        this._handleRequestStart, this);
    CATMAID.RequestQueue.on(CATMAID.RequestQueue.EVENT_REQUEST_ENDED,
        this._handleRequestEnd, this);

    //If the set of available volumes was updatedd, refresh respectvie UI
    //elements.
    let updateVolumeLists = function() {
      let elements = document.querySelectorAll('span[data-role=volume-select][data-auto-update=true]');
      if (elements) {
        for (let e of elements) {
          if (CATMAID.tools.isFn(e.refresh)) {
            e.refresh();
          }
        }
      }
    };
    CATMAID.Volumes.on(CATMAID.Volumes.EVENT_VOLUME_ADDED, updateVolumeLists);
    CATMAID.Volumes.on(CATMAID.Volumes.EVENT_VOLUME_DELETED, updateVolumeLists);
    CATMAID.Volumes.on(CATMAID.Volumes.EVENT_VOLUME_UPDATED, updateVolumeLists);

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
          default: false
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
        // http_auth_user, http_auth_pass, space, type. The type key can
        // currently be catmaid or neuprint.
        remote_servers: {
          default: []
        },
        // A list of known remote projects (typically CATMAID projects),
        // referencing above data source instances.
        remote_projects: {
          default: [],
        },
        last_stack_viewer_closes_project: {
          default: true,
        },
        warn_on_potential_gl_issues: {
          default: true,
        },
        show_regular_login_controls: {
          default: true,
          overridable: false,
        },
        show_external_login_controls: {
          default: false,
          overridable: false,
        },
        warn_on_caps_lock: {
          default: true
        },
      }
    });

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, function (project) {
    // Update window title bar
    document.title = `CATMAID - ${project.title}`;

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

          CATMAID._updateUserMenu();
          CATMAID._updateLoginMenu();
        });
  });



  // The front end's root window. This should eventually become part of Client,
  // it is already initialized by it.
  CATMAID.rootWindow = null;

  /**
   * Initialize the CATMAID web front-end based on the passed in options.
   */
  Client.prototype.init = function(options) {
    let link;
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
    let initialLayout;
    let projectToken;

    var account;
    var password;

    if ( options )
    {
      if (options['token']) projectToken = options['token'];

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
      // The active node ID isn't necessazrily a number, since it can also
      // reference virtual nodes.
      if ( options[ "active_node_id" ] ) init_active_node_id = options[ "active_node_id" ];

      if ( options.hasOwnProperty("help") ) help = options["help"] !== "false";
      if (help !== undefined) {
        this.setContextHelpVisibility(help);
        this.contextHelpVisibilityEnforced = true;
      }

      if (options.hasOwnProperty("container")) {
        this._container = options["container"];
      }

      if ( options[ "pid" ] ) pid = options[ "pid" ];
      if ( options[ "link" ] ) link = options[ "link" ];

      if ( !(
          typeof z == "undefined" ||
          typeof y == "undefined" ||
          typeof x == "undefined" ||
          typeof s == "undefined" ) )
      {
        sids = [];
        sids[ 0 ] = 1;
        ss = [];
        ss[ 0 ] = 1;
      }
      else
      {
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

      if (options["layout"]) {
        initialLayout = decodeURIComponent(options["layout"]);
      }
    }

    if (!this._container) {
      this._container = document.querySelector('.catmaid');
    }

    if (!this._container) {
      throw new CATMAID.ValueError(`No valid CATMAID container found: ${this._container}`);
    }

    if (!this._container.ownerDocument) {
      throw new CATMAID.ValueError(`The CATMAID container doesn't seem to be part of a DOM: ${this._container}`);
    }

    CATMAID.statusBar = new CATMAID.Console();
    document.body.appendChild( CATMAID.statusBar.getView() );
    this.showVersionInStatusBar();

    let checkLinkLength = (link) => {
      if (link.length > 4096) {
        CATMAID.warn('URL length > 4096 characters. Consider using Ctrl + Shift to create a persistent layout link.');
      }
    };

    var a_url = document.getElementById( "a_url" );
    a_url.onpointerover = function( e )
    {
      this.href = project.createURL(e.shiftKey);
      return true;
    };
    let urlToViewJustClicked = false;
    a_url.addEventListener('contextmenu', e => {
      e.target.href = project.createURL(e.shiftKey);
      // Needs to be done through timeout, because Chrome/Chromium
      // won't show anchor element context menu on right click.
      setTimeout(() => checkLinkLength(e.target.href), 10);
    });
    a_url.onclick = function( e )
    {
      // In case a deep link is created, the click is canceled to asyncronously
      // create the deep link and reissued afterwards. For this second click we
      // want to avoid to update the URL or create a new deep link. This is why
      // we use this toggle variable here.
      if (urlToViewJustClicked) {
        urlToViewJustClicked = false;
      } else if (e.ctrlKey) {
        Client.createDeepLink(e.shiftKey)
          .then(link => {
            // Update link and copy deep link to clipboard
            this.href = link;
            CATMAID.tools.copyToClipBoard(link);
            e.target.href = link;
            urlToViewJustClicked = true;

            // Reissue click event with original properties
            let oEvent = document.createEvent('MouseEvent');
            oEvent.initMouseEvent('click', e.bubbles, e.cancelable, document.defaultView,
              e.button, e.pointerX, e.pointerY, e.pointerX, e.pointerY,
              e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.srcElement);
            e.srcElement.dispatchEvent(oEvent);
          })
          .catch(CATMAID.handleError);
        return false;
      } else {
        this.href = project.createURL(e.shiftKey);
        checkLinkLength(this.href);
      }
      return true;
    };

    let linkMenu = new Menu();
    linkMenu.update([{
      id: 'create-link',
      title: 'Customize link features',
      note: '',
      action: function() {
        CATMAID.Client.createShareableLink();
      }
    }, {
      id: 'copy-current-layout-url',
      title: 'Create URL to view with layout',
      note: '',
      action: () => {
        Client.createDeepLink(true, true, true)
          .then(link => {
            CATMAID.msg('Success', 'Copied URL to view with layout to clipboard. See it also in the Link Widget.');
            CATMAID.tools.copyToClipBoard(link);
          })
          .catch(CATMAID.handleError);
      }
    }, {
      id: 'copy-current-layout-url-no-skeletons',
      title: 'Create URL to view with layout (no skeletons)',
      note: '',
      action: function() {
        Client.createDeepLink(true, false, true)
          .then(link => {
            CATMAID.msg('Success', 'Copied URL to view with layout to clipboard, don\'t include skeletons. See it also in the Link Widget.');
            CATMAID.tools.copyToClipBoard(link);
          })
          .catch(CATMAID.handleError);
      }
    }, {
      id: 'copy-current-layout-url-no-settings',
      title: 'Create URL to view with layout (no widget settings)',
      note: '',
      action: function() {
        Client.createDeepLink(true, true, false)
          .then(link => {
            CATMAID.msg('Success', 'Copied URL to view with layout to clipboard, don\'t include skeletons. See it also in the Link Widget.');
            CATMAID.tools.copyToClipBoard(link);
          })
          .catch(CATMAID.handleErrors);
      }
    }]);
    let linkMenuView = linkMenu.getView();
    // This is done to prevent an overflow out of screen. Haven't found a good
    // simple dynamic CSS-only version.
    linkMenuView.style.left = '-14.5em';
    document.getElementById('share_menu').appendChild(linkMenuView);

    $(document.body).on('click', 'a[data-role=url-to-clipboard]', e => {
      e.preventDefault();
      if (e.ctrlKey) {
        Client.createDeepLink(e.shiftKey)
          .then(link => {
            CATMAID.tools.copyToClipBoard(link);
          })
          .catch(CATMAID.handleErrors);
      } else {
        CATMAID.tools.copyToClipBoard(CATMAID.Client.getAndCheckUrl(e.shiftKey));
      }
    });

    // Assume an unauthenticated session by default
    this.setAuthenticated(false);
    CATMAID.Client.Settings
        .load()
        .then(() => {
          this._updateLoginControls();
        })
        .catch(CATMAID.handleError);

    // Create the toolboxes
    $('#toolbox_project').replaceWith(CATMAID.createButtonsFromActions(
      CATMAID.toolActions, 'toolbox_project', '', 'toolbar_item'));
    $('#toolbox_edit').replaceWith(CATMAID.createButtonsFromActions(
      CATMAID.EditTool.actions, 'toolbox_edit', '', 'toolbar_item'));

    // Add the toolbar buttons:
    document.getElementById( "toolbar_nav" ).style.display = "none";
    document.getElementById( "toolbar_text" ).style.display = "none";
    document.getElementById( "toolbar_tags" ).style.display = "none";
    document.getElementById( "toolbar_roi" ).style.display = "none";
    document.getElementById( "toolbox_project" ).style.display = "none";
    document.getElementById( "toolbox_edit" ).style.display = "none";
    document.getElementById( "toolbox_ontology" ).style.display = "none";
    document.getElementById( "toolbox_show" ).style.display = "none";

    CATMAID.DOM.removeAllChildren(document.getElementById("toolbox_data"));

    document.getElementById( "account" ).onkeydown = login_oninputreturn;
    document.getElementById( "password" ).onkeydown = login_oninputreturn;

    ['dataview', 'project', 'layout', 'stack', 'message', 'user', 'login'].forEach(name => {
      menus[name] = new Menu();
      document.getElementById(name + '_menu').appendChild(menus[name].getView());
    });
    CATMAID.DataViews.list().then(dataviews => {
      this._knownDataViews = dataviews;
      this._updateDataViewMenu();
    });
    CATMAID._updateLoginMenu();

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

    let message;

    // login and thereafter load stacks if requested
    let prepare = loadView
      .then(function() {
        return self.login();
      });

    // If a project token is provided, ignore all other parameters.
    if (projectToken) {
      prepare
        .then(() => {
          // An anonymous user will be asked to login first, if a token is supplied.
          if (!CATMAID.session.is_authenticated) {
            let extraMsg = Client.Settings.session.show_external_login_controls ?
                ' After the login with an external provider, you will be redirected to the front page and may have to open the token link again.' : '';
            return CATMAID.askForLogin("A project token was provided to give you access to a project. " +
                `In order to use it, you need to be logged in.${extraMsg}`);
          } else {
            return CATMAID.applyProjectToken(projectToken)
              .then(() => {
                // Remove project token from URL
                let url = window.location.href.replace(/[\?&]?token=[a-zA-Z0-9\-]+/, '');
                window.history.pushState({}, window.title, url);
              })
              .catch(e => {
                 if (e.type === 'ValidationError') {
                   CATMAID.warn('Invalid project token');
                 } else {
                   CATMAID.handleError(e);
                 }
              });
          }
        });
    } else {
      prepare
      .then(() => {
        // If a link ID is provided, try to get link info
        if ((pid || pid === 0) && link) {

          let getLinkDetails = function() {
            return CATMAID.fetch(`${pid}/links/${link}/details`)
              .then(linkInfo => {
                if (!xp && xp !== 0) xp = linkInfo.location_x;
                if (!yp && yp !== 0) yp = linkInfo.location_y;
                if (!zp && zp !== 0) zp = linkInfo.location_z;
                if (!inittool && linkInfo.tool) inittool = linkInfo.tool;
                if (!init_active_node_id) {
                  if (linkInfo.active_connector) init_active_node_id = linkInfo.active_connector;
                  else if (linkInfo.active_treenode) init_active_node_id = linkInfo.active_treenode;
                  else if (!init_active_skeleton_id && linkInfo.active_skeleton) init_active_skeleton_id = linkInfo.active_skeleton;
                }
                if (ss.length === 0 && sids.length === 0 && linkInfo.stacks.length > 0) {
                  for (let i=0; i<linkInfo.stacks.length; ++i) {
                    sids.push(linkInfo.stacks[i].stack_id);
                    ss.push(linkInfo.stacks[i].zoom_level);
                  }
                }
                if (help === undefined && linkInfo.show_help) {
                  help = true;
                  this.setContextHelpVisibility(help);
                  this.contextHelpVisibilityEnforced = true;
                }
                if (!initialLayout && linkInfo.layout) initialLayout = linkInfo.layout;
                if (!message && linkInfo.message) message = linkInfo.message;
              })
              .catch(e => {
                // If getting link details fails due to permissions, show a
                // login dialog and attempt to fetch the data again after the
                // login attempt (if any).
                if (e instanceof CATMAID.PermissionError) {
                  return new Promise((resolve, reject) => {
                    new CATMAID.LoginDialog(
                      "You need to log-in to access data in this project",
                      () => resolve(getLinkDetails()),
                      false, undefined, true,
                      loginError => resolve(getLinkDetails()),
                      () => reject(new CATMAID.Warning('Login cancelled'))
                    ).show();
                  });
                } else {
                  throw new CATMAID.Warning('Could not load provided link');
                }
              });
          };
          return getLinkDetails();
        }
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
        } else if (pid && sids.length === 0) {
          // Get first available stack for project
          load = CATMAID.fetch(`${pid}/stacks`)
            .then(stacks => {
              if (stacks.length === 0) {
                throw new CATMAID.ValueError("No stacks found for project " + pid);
              }
              // Push stack with lowest ID using zoom level 0
              stacks.sort((a,b) => a.id - b.id);
              sids.push(stacks[0].id);
              ss.push(0);
              return loadStacksFromURL(singleStackViewer);
            });
        } else {
          load = loadStacksFromURL(singleStackViewer, 0, !!initialLayout);
        }

        // After stacks or stack groups have been loaded, init selected tool.
        return load.then(function() {
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
        function loadStacksFromURL(composite, loaded, noLayout) {
          loaded = loaded || 0;
          var useExistingStackViewer = composite && (loaded > 0);
          if (pid) {
            if (sids.length > 0) {
              var noLayout = noLayout || sids.length > 1;
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
                        return loadStacksFromURL(composite, loaded + 1, noLayout);
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
        if (initialLayout) {
          let layout = new CATMAID.Layout(initialLayout);
          if (!CATMAID.switchToLayout(layout, true)) {
            CATMAID.warn(`Layout ${initialLayout} could not be loaded`);
          }
        }
        if (message) {
          CATMAID.msg('Message', message);
        }
      });
    }

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
    menus.project.update(null);

    // Set a temporary loading data view
    let currentDataView = this.current_dataview;
    this.switch_dataview(new CATMAID.DataView({
       id: null,
       type: 'empty',
       config: {
         message: 'Loading...',
         classList: 'wait_bgwhite'
       }
    }));

    var self = this;
    return CATMAID.Project.list(true, false, true)
      .then(json => {
        self.projects = json;
        self.projectsById = json.reduce((o, p) => {
          o[p.id] = p;
          return o;
        }, {});

        self.refresh();

        if (currentDataView) {
          this.switch_dataview(currentDataView);
        }

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
              'action': () => CATMAID.openProjectStack(p.id, s.id, false, undefined, false, true).catch(CATMAID.handleError)
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

        menus.project.update(menuData);

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
      } else {
        // Reset current tool
        project.setTool(project.getTool());
      }
    }

    CATMAID._updateUserMenu();

    // update the edit tool actions and its div container
    var new_edit_actions = CATMAID.createButtonsFromActions(CATMAID.EditTool.actions,
      'toolbox_edit', '', 'toolbar_item');
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

  /**
   * Update the internal state and UI elements for an authenticated context.
   * This doesn't check the validity of the updated state and mainly
   * encapsulates DOM and CSS updates.
   */
  Client.prototype.setAuthenticated = function(isAuthenticated) {
    // Only non-anonymous users can be authenticated.
    if (isAuthenticated) {
      if (this._container) {
        // This determines the visibility of login/logout/session controls.
        this._container.classList.add('authenticated');
      }
      document.getElementById("account").value = "";
      document.getElementById("password").value = "";
      document.getElementById("session_longname").replaceChild(
          document.createTextNode(CATMAID.session.longname),
          document.getElementById("session_longname").firstChild);

      // Update user menu
      CATMAID._updateUserMenu();
      // Update login menu
      CATMAID._updateLoginMenu();
    } else {
      if (this._container) {
        this._container.classList.remove('authenticated');
      }
    }
  };

  Client.prototype._updateLoginControls = function() {
    if (this._container) {
      if (Client.Settings.session.show_regular_login_controls) {
        this._container.classList.remove('no_local_login');
      } else {
        this._container.classList.add('no_local_login');
      }

      let externalLoginContainer = this._container.querySelector('#external-login-options');
      while (externalLoginContainer.lastChild) externalLoginContainer.removeChild(externalLoginContainer.lastChild);

      if (Client.Settings.session.show_external_login_controls) {
        this._container.classList.remove('no_external_login');
        let loginOptions = Object.keys(CATMAID.extraAuthConfig).sort().map(cId => {
          let c = CATMAID.extraAuthConfig[cId];
          let loginElement = document.createElement('a');
          loginElement.append(`Login with ${c.name}`);
          loginElement.href =c.login_url;
          loginElement.classList.add('external-login-option');
          return loginElement;
        });
        externalLoginContainer.append(...loginOptions);
      } else {
        this._container.classList.add('no_external_login');
      }
    }
  };

  // Publicly accessible session
  CATMAID.session = null;

  /**
   * If there OAuth2 login providers enabled, they are dispalyed in a login
   * menu.
   */
  CATMAID._updateLoginMenu = function() {
    menus.login.update(Object.keys(CATMAID.extraAuthConfig).sort().map(cId => {
      let c = CATMAID.extraAuthConfig[cId];
      return {
          action: c.login_url,
          title: `Login with ${c.name}`,
          note: "",
      };
    }));
  };

  CATMAID._updateUserMenu = function() {
      let userMenuItems = [{
          action: CATMAID.makeURL("user/password_change/"),
          title: "Change password",
          note: "",
        },
        {
          action: CATMAID.getAuthenticationToken,
          title: "Get API token",
          note: ""
        },
        {
          action: () => {
            let dialog = new CATMAID.UserInfoDialog();
            dialog.show();
          },
          title: "User info",
          note: ""
        },
        {
          action: () => {
            CATMAID.tools.copyToClipBoard(CATMAID.CLIENT_VERSION);
            CATMAID.msg('Copied to clipboard', `Version: ${CATMAID.CLIENT_VERSION}`);
          },
          title: "Copy CATMAID version",
          note: ""
        },
        {
          action: () => CATMAID.askForProjectToken(),
          title: 'Use project token',
          note: ''
        }];

      // If users are allowed to create new spaces, add the respective menu
      // entry
      let s = CATMAID.session;
      let canForkProjects = s.is_authenticated || (s.permissions && -1 !== s.permissions.indexOf('catmaid.can_fork'));
      if (project && canForkProjects) {
        userMenuItems.push({
          title: "Create own space",
          note: "",
          action: () => CATMAID.forkCurrentProject(),
        });
      }

      // Super-users also habe button to open the instance settings dialog.
      let isSuperUser = s.is_authenticated && s.is_superuser;
      if (isSuperUser) {
          userMenuItems.push({
            title: "Instance configuration",
            note: "",
            action: () => CATMAID.editInstanceConfig(),
          });
      }

      menus.user.update(userMenuItems);
  };

  CATMAID.askForLogin = function(message) {
    let msg = message || '';
    if (CATMAID.Client.Settings.session.show_regular_login_controls) {
      if (CATMAID.Client.Settings.session.show_external_login_controls) {
        msg += "Please log in with either your username and password or one of the external login options availalbe as buttons below.";
      } else {
        msg += "Please log in with your username and password and press \"Login\".";
      }
    } else {
      if (CATMAID.Client.Settings.session.show_external_login_controls) {
        msg += "Please log in with your username and password and press \"Login\".";
      }
    }
    let dialog = new CATMAID.LoginDialog(msg, CATMAID.initWebClient, false,
        "Please login or create an account", false);
    dialog.show();
  };

  CATMAID.applyProjectToken = function(projectToken, silent = false) {
    return CATMAID.fetch('project-tokens/apply', 'POST', {
        'token': projectToken,
      })
      .then(result => {
        return CATMAID.client.updateProjects()
          .then(() => {
            if (!silent) {
              if (project && result.project_id === project.id) {
                CATMAID.msg('Already in project', 'You already are in the project you added a token for');
                return;
              }
              let newProjectDialog = new CATMAID.OptionsDialog('Switch to new project?', {
                'Stay here': CATMAID.noop,
                'Switch to new project': e => {
                  if (project) {
                    project.setTool(null);
                  }
                  return CATMAID.openProject(result.project_id)
                    .then(()=> {
                      CATMAID.msg("Success", "Opened project");
                    })
                    .catch(CATMAID.handleError);
                },
              });
              newProjectDialog.appendHTML(`You now have access to project #${result.project_id} with the following permissions: <em>${result.permissions.sort().join(', ')}</em>, it's name is <strong>${result.project_name}</strong>. You will be able to see this project in the projet menu, front-pages that show all available projects and the "My projects" view in the Home menu. Do you want to switch to the new project?`);
              newProjectDialog.show(400, 'auto');
              CATMAID.msg('Success', 'Added token');
            }
          })
          .then(() => result);
      });
  };

  CATMAID.askForProjectToken = function() {
    let dialog = new CATMAID.OptionsDialog('Enter new Project Token', {
      'Cancel': CATMAID.noop,
      'Use token': e => {
        if (tokenInput.value.trim().length === 0 || !CATMAID.tools.isUUID(tokenInput.value)) {
          throw new CATMAID.Warning('No valid project token');
        }
        return CATMAID.applyProjectToken(tokenInput.value)
          .catch(CATMAID.handleErrors);
      }
    });
    dialog.appendMessage('Please enter the project token in the input field below and click "Ok". If valid, this will allow you to access new projects.');
    let tokenInput = dialog.appendField('Project token:', undefined, '', true, '(New project token)');
    tokenInput.style.width = '21em';
    dialog.appendMessage('Note: when you join a project using a project token, you make your full name available to everyone in this project.');
    dialog.show(400, 'auto');
  };

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
    CATMAID.session.deferredPermissionCheckObjects = new Set();

    if (edit_domain_timeout) {
      window.clearTimeout(edit_domain_timeout);
    }

    CATMAID.client.setAuthenticated(e.is_authenticated);

    if (e.is_authenticated) {
      edit_domain_timeout = window.setTimeout(CATMAID.client.refreshEditDomain,
                                              EDIT_DOMAIN_TIMEOUT_INTERVAL);
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
          // If the user user has a home view set, load it. Otherwise load the
          // default data view.
          return CATMAID.client.loadHomeView(!!project);
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

    let load = Promise.all([
      CATMAID.updatePermissions(),
      // Get the list of visible users. For the anonymous user without can_browse
      // permission, this means essentially a list consisting only of the
      // anonymous user itself. For logged in users and the anonymous user
      // *with* can_browse permissions, all users are provided by the back-end.
      CATMAID.User.getUsers(),
      CATMAID.Group.updateGroupCache(),
    ]);

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
        // Don't call clone handler after error, if the is still a socket around.
        if (this._updateSocket) {
          this._updateSocket.onclose = null;
        }
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
    if (!CATMAID.session)
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
      menus.message.update( e );
      // Make all message links open in a new page
      var links = menus.message.getView().querySelectorAll('a');
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
    // If a project is active, ask for confirmation before closing it.
    if (project) {
        if (!confirm('Are you sure you want to close all widgets and views?')) {
          return;
        }
      project.destroy();
    } else {
      CATMAID.rootWindow.closeAllChildren();
    }

    return CATMAID.DataViews.getConfig(id)
      .then(function(config) {
        // open data view
        var dataview = CATMAID.DataView.makeDataView(config);
        CATMAID.client.switch_dataview(dataview);
      });
  };

  /**
   * Update the home/dataview menu. The currently selected data view is marked
   * as highlighted.
   */
  Client.prototype._updateDataViewMenu = function() {
    var menuItems = {};
    for (var i in this._knownDataViews) {
      let dv = this._knownDataViews[i];
      let dvId = dv.id;
      let isActiveView = this.current_dataview && this.current_dataview.id === dv.id;
      var url = CATMAID.makeURL(`?dataview=${dvId}`);
      var link = `<a class="hoverlink auth-only" href="#" onclick="CATMAID.client.makeHomeView(${dvId}).then(r => CATMAID.msg('Success', 'New home view set')).catch(CATMAID.handleError);"><i class="fa fa-home"></i>&nbsp;</a>&nbsp;<a class="hoverlink" href="${url}"><i class="fa fa-link"></i>&nbsp;</a>`;
      menuItems[i] = {
        state: isActiveView ? '*' : '',
        active: isActiveView,
        title: dv.title,
        note: link + dv.note,
        action: e => {
          handleDataViewSelection(dvId)
            .then(() => this._updateDataViewMenu())
            .catch(CATMAID.handleError);
        },
      };
    }
    menus.dataview.update(menuItems);
  };

  /**
   * Make the data view with the passed in ID the default for the current user.
   */
  Client.prototype.makeHomeView = function(dataViewId) {
    return CATMAID.fetch(`/dataviews/${dataViewId}/make-home-view`)
      .then(() => {
        CATMAID.session.home_view_id = dataViewId;
      });
  };

  /**
   * Load the user's home view or the default view.
   */
  Client.prototype.loadHomeView = function(backgroundDataView = false) {
    if (CATMAID.userprofile.home_view_id !== undefined && CATMAID.userprofile.home_view_id !== null) {
      return CATMAID.DataViews.getConfig(CATMAID.userprofile.home_view_id)
        .then(config => CATMAID.client.switch_dataview(
            CATMAID.DataView.makeDataView(config), backgroundDataView))
        .catch(e => {
          CATMAID.handleError(e);
          return CATMAID.client.load_default_dataview(backgroundDataView);
        });
    } else {
      return CATMAID.client.load_default_dataview(backgroundDataView);
    }
  };

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

    dataview.createContent(container)
      .then(() => {
        dataview.refresh();
        // Revalidate content to lazy-load
        CATMAID.client.blazy.revalidate();

        this.current_dataview = dataview;

        this._updateDataViewMenu();
        CATMAID._updateUserMenu();
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
              header: true,
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

  Client.prototype._handleProjectChanged = function(projectData) {
    // Update window title bar
    if (projectData) {
      document.title = `CATMAID - ${projectData.title}`;
    }
    this.updateProjects();
  };

  Client.prototype._handleProjectDeleted = function(deletedProjectId) {
    if (project && project.id == deletedProjectId) {
      project.destroy();
      project = null;
    }
    this.updateProjects();
  };

  Client.prototype._handleProjectDestroyed = function() {
    project = null;
    this.updateContextHelp(true);
    document.title = 'CATMAID';
    CATMAID._updateUserMenu();
    this.showVersionInStatusBar();
  };

  Client.prototype.showVersionInStatusBar = function() {
    CATMAID.statusBar.replaceLast(`CATMAID Version ${CATMAID.CLIENT_VERSION}`, 'grey');
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
   * A command is a string that can trigger some action. By default this string
   * will first looked as a project or stack location. If this interpretation
   * isn't successful, it is interpreted as a location and concept ID. Next,
   * bookmarks are looked up. Ultimately, it is tried to interpret it as regular
   * URL parameters. Additional interpretors can be added through
   * CATMAID.registerCommandParser().
   */
  Client.prototype.handleCommand = function(command) {
    return Promise.resolve()
      .then(() => CATMAID.handleTextCommand(command))
      .then(handled => {
        if (!handled) {
          CATMAID.warn("Could not find any match");
        }
        return handled;
      });
  };

  /**
   * Store a deep link and return the new link
   */
  Client.createDeepLink = function(withLayout = false, withSkeletons = true, withWidgetSettings = true,
      alias = null, isPrivate = false, isExportable = false) {
    let stackConfig = project.getStackAndStackGroupConfiguration();
    let params = {
      alias: alias || CATMAID.DeepLink.makeUniqueId(),
      is_public: !isPrivate,
      is_exportable: isExportable,
      location_x: project.coordinates.x,
      location_y: project.coordinates.y,
      location_z: project.coordinates.z,
      stacks: stackConfig.stacks.map((s,i) => [s, stackConfig.stackScaleLevels[i]]),
    };

    if (stackConfig.stackGroupId || stackConfig.stackGroupId === 0) {
      params.stack_group = stackConfig.stackGroupId;
      params.stack_group_scale_levels = stackConfig.stackGroupScaleLevels;
    }

    let activeNode = SkeletonAnnotations.getActiveNodeId();
    let withActiveSkeleton = true;
    if (withActiveSkeleton && activeNode) {
      if (!SkeletonAnnotations.isRealNode(activeNode)) {
        activeNode = SkeletonAnnotations.getChildOfVirtualNode(activeNode);
      }
      if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_NODE) {
        params.active_treenode_id = activeNode;
        params.active_skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
      } else {
        params.active_connector_id = activeNode;
      }
    }

    if (withLayout) {
      params.layout = CATMAID.Layout.makeLayoutSpecForWindow(CATMAID.rootWindow,
          withSkeletons, withWidgetSettings);
    }

    if (project.getTool()) {
      params.tool = project.getTool().toolname;
    }

    return CATMAID.fetch(`${project.id}/links/`, 'POST', params)
      .then(link => {
        let l = document.location;
        return `${l.origin}${l.pathname}${project.id}/links/${link.alias}`;
      });
  };

  /**
   * Generate a URL to the current view and warn the user if this URL is too
   * long.
   */
  Client.getAndCheckUrl = function(withLayout = false, withSkeletons = true, withWidgetSettings = true) {
    let l = document.location;
    let url = l.origin + l.pathname + project.createURL(withLayout, withSkeletons, withWidgetSettings);
    if (url.length > 4096) {
      CATMAID.msg('Long URL', 'The generated URL is very long, consider creating an alias using the Link Widget.');
    }
    return url;
  };


  Client.createShareableLink = function() {
    let linkLink = document.createElement('a');
    linkLink.href = '#';
    linkLink.target = '_blank';
    linkLink.style.color = 'blue';
    linkLink.style.display = 'none';
    let linkLinkText = document.createElement('a');
    linkLinkText.style.color = 'blue';

    let dialog = new CATMAID.OptionsDialog("Share current view", {
      'Close': () => {},
      'Create link': () => {
        createLink()
          .then(link => {
            CATMAID.tools.copyToClipBoard(linkLink.href);
            CATMAID.msg('Success', 'Link to view copied to clipboard. It\'s also available in the Link Widget.');
          })
          .catch(CATMAID.handleError);
      },
    });
    dialog.appendMessage('Share a link to the current location. There are different options available:');

    let optionContainer = document.createElement('span');
    optionContainer.style.display = 'grid';
    optionContainer.style.gridTemplate = '3em / 15em 10em 13em 8em';

    let withLayout = CATMAID.DOM.appendCheckbox(optionContainer, 'With layout and widgets',
        'Include widget layout information in the created URL.', true,
        e => {
          withSkeletons.disabled = !e.target.checked;
          withWidgetSettings.disabled = !e.target.checked;
          updateLink();
        }, false, 'deep-link-layout').querySelector('input');
    let withSkeletons = CATMAID.DOM.appendCheckbox(optionContainer, 'With skeletons',
        'Include skeletons in widgets in layout.', true, updateLink, false,
        'deep-link-skeletons').querySelector('input');
    let withWidgetSettings = CATMAID.DOM.appendCheckbox(optionContainer, 'With widget settings',
        'Include the configuration of individual widgets in the layout', true, updateLink, false,
        'deep-link-settings').querySelector('input');
    let showHelp = CATMAID.DOM.appendCheckbox(optionContainer, 'Show help',
        'Show the context help when then link is opened, available through button in upper right corner.',
        false, updateLink, false, 'deep-link-show-help').querySelector('input');

    dialog.appendChild(optionContainer);

    let messageField = dialog.appendField('Optional message', 'deep-link-message', '', false, '(none)');

    dialog.appendMessage('Deep links that include the current layout tend to get long. Therefore by default a persistent link is created, which can be listed in the Link Widget, has a custom alias and can be private.');

    let optionContainer2 = document.createElement('span');
    optionContainer2.style.display = 'grid';
    optionContainer2.style.gridTemplate = '3em / 21em 10em 10em';
    let persistent = CATMAID.DOM.appendCheckbox(optionContainer2, 'Shorten link and add to Link Widget',
        'This alias needs to be unique per project and is stored on the server', true, e => {
          let presentUrl = makeLongLinkAddress();
          if (presentUrl.length > 4096) {
            CATMAID.warn('URL would be longer than allowed 4096 characters. Please change link settings and close more widgets to use a long URL.');
            e.target.checked = true;
            return;
          }
          aliasField.disabled = !e.target.checked;
          isPrivate.disabled = !e.target.checked;
          isExportable.disabled = !e.target.checked;
          lastMessage.innerHTML = e.target.checked ? persistMsg : regularMsg;
          linkLink.style.display = e.target.checked ? 'none' : 'block';
          linkLinkText.style.display = e.target.checked ? 'block' : 'none';
          updateLink();
        }, false,'deep-link-allow-alias').querySelector('input');
    let isPrivate = CATMAID.DOM.appendCheckbox(optionContainer2, 'Private',
        'Private links can only be opened by you and will only be visible to you in the Link Widget.',
        false, updateLink, false, 'deep-link-private').querySelector('input');
    let isExportable = CATMAID.DOM.appendCheckbox(optionContainer2, 'Exportable',
        'Exportable links can be recognized by later data exports (e.g. for publication figures).',
        false, updateLink, false, 'deep-link-exportable').querySelector('input');

    dialog.appendChild(optionContainer2);

    let alias = CATMAID.DeepLink.makeUniqueId();

    let aliasField = dialog.appendField('Alias', 'deep-link-alias', '', true, alias);
    aliasField.style.width = '25em';
    let linkWrapper = document.createElement('div');
    linkWrapper.style.maxHeight = '100px';
    linkWrapper.style.wordBreak = 'break-all';
    linkWrapper.style.overflow = 'auto';

    let refreshAliasButton = document.createElement('i');
    refreshAliasButton.classList.add('fa', 'fa-refresh', 'refresh-icon');
    refreshAliasButton.onclick = e => {
      alias = CATMAID.DeepLink.makeUniqueId();
      aliasField.placeholder = alias;
      aliasField.value = '';
      updateLink();
    };
    aliasField.parentNode.appendChild(refreshAliasButton);

    let regularMsg = 'URL to current view:';
    let persistMsg = 'URL to current view (Link will only be accessible once "Create link" is pressed):';
    let lastMessage = dialog.appendMessage(persistMsg);
    linkWrapper.appendChild(linkLink);
    linkWrapper.appendChild(linkLinkText);
    dialog.appendChild(linkWrapper);

    function makeLongLinkAddress() {
      let message = messageField.value.trim();
      let l = window.location;
      if (message.length === 0) message = null;
      return l.origin + l.pathname + project.createURL(withLayout.checked,
          withSkeletons.checked, withWidgetSettings.checked, undefined,
          showHelp.checked, message);
    }

    function updateLink() {
      let url, l = window.location;
      if (persistent.checked) {
        url = `${l.origin}${l.pathname}${project.id}/links/${alias}`;
      } else {
        url = makeLongLinkAddress();
      }
      linkLink.href = url;
      linkLink.innerHTML = url;
      linkLinkText.innerHTML = url;
    }
    updateLink();


    aliasField.addEventListener('keydown', e => {
      if (!CATMAID.DeepLink.AllowedChars.test(e.key)) {
        CATMAID.warn("Only alphanumeric characters, '-', '_' and '.' allowed.");
        e.preventDefault();
        return true;
      }
    });

    aliasField.addEventListener('keyup', e => {
      if (e.target.value.length === 0) {
        alias = CATMAID.DeepLink.makeUniqueId();
        e.target.setAttribute('placeholder', alias);
      } else {
        alias = e.target.value.trim();
      }
      updateLink();
    });

    let withActiveSkeleton = true;

    function createLink() {
      if (persistent.checked) {
        let stackConfig = project.getStackAndStackGroupConfiguration();
        let params = {
          alias: alias,
          is_public: !isPrivate.checked,
          is_exportable: isExportable .checked,
          location_x: project.coordinates.x,
          location_y: project.coordinates.y,
          location_z: project.coordinates.z,
          show_help: showHelp.checked,
          stacks: stackConfig.stacks.map((s,i) => [s, stackConfig.stackScaleLevels[i]]),
        };

        if (stackConfig.stackGroupId || stackConfig.stackGroupId === 0) {
          params.stack_group = stackConfig.stackGroupId;
          params.stack_group_scale_levels = stackConfig.stackGroupScaleLevels;
        }

        let activeNode = SkeletonAnnotations.getActiveNodeId();
        if (withActiveSkeleton && activeNode) {
          if (!SkeletonAnnotations.isRealNode(activeNode)) {
            activeNode = SkeletonAnnotations.getChildOfVirtualNode(activeNode);
            CATMAID.warn('Using child of active node. Consider using only an active skeleton!');
          }
          if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_NODE) {
            params.active_treenode_id = activeNode;
            params.active_skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
          } else {
            params.active_connector_id = activeNode;
          }
        }

        if (withLayout.checked) {
          params.layout = CATMAID.Layout.makeLayoutSpecForWindow(CATMAID.rootWindow,
              withSkeletons.checked, withWidgetSettings.checked);
        }

        if (project.getTool()) {
          params.tool = project.getTool().toolname;
        }

        let message = messageField.value.trim();
        if (message.length > 0) {
          params.message = message;
        }

        return CATMAID.fetch(`${project.id}/links/`, 'POST', params);
      } else {
        return Promise.resolve(linkLink.href);
      }
    }

    dialog.show(750, 'auto');

    // Allow user to write immediately into alias field
    aliasField.focus();
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

  Client.createRelativeDeepLink = function(projectId, options = {}) {
    let components = [`pid=${projectId}`];
    if (options.skeletonId) {
      components.push(`active_skeleton_id=${options.skeletonId}`);
    }
    if (options.tool) {
      components.push(`tool=${options.tool}`);
    }
    return `?${components.join('&')}`;
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
                      if (!sv) continue;
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


  CATMAID.openProject = function(projectId) {
    return CATMAID.fetch(`${projectId}/stacks`)
      .then(stacks => {
        if (stacks.length > 0) {
          return CATMAID.openProjectStack(projectId, stacks[0].id);
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Open a project and stack in a stack viewer, returning a promise yielding
   * the stack viewer.
   *
   * @param  {number|string} projectID   ID of the project to open. If different
   *                                     than the ID of the currently open
   *                                     project, it will be destroyed.
   * @param  {number|string} reorientedStackID ID of the stack to open.
   * @param  {boolean} useExistingViewer True to add the stack to the existing,
   *                                     focused stack viewer.
   * @param  {number}  mirrorIndex       An optional mirror index, defaults to
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
          .then(function(stackViewer) {
            if (noLayout) {
              return;
            }
            try {
              // Don't let all of open() fail, only because the layout failed
              CATMAID.layoutStackViewers();
            } catch(error) {
              CATMAID.handleError(error);
            }
            return stackViewer;
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
      id: 'copy-current-layout-spec',
      title: 'Copy current layout spec',
      note: '',
      action: function() {
        let layout = CATMAID.Layout.makeLayoutSpecForWindow(CATMAID.rootWindow);
        if (layout) {
          CATMAID.tools.copyToClipBoard(layout);
          CATMAID.msg('Success', `Copied layout spec: ${layout}`);
        } else {
          CATMAID.warn('Could not create layout');
        }
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

    menus.layout.update(layoutMenuContent);
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
      project = new CATMAID.Project(e.pid, e.ptitle);
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

        // Update the projects stack menu. A submenu for easy access is
        // generated. This needs to be done only once on project creation.
        menus.stack.update();
        CATMAID.Stack.list(project.id, true)
          .then(function(stacks) {
            let stackMenuContent = stacks.map(s => {
              return {
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
                };
              });

            menus.stack.update(stackMenuContent);
            var stackMenuBox = document.getElementById( "stackmenu_box" );
            stackMenuBox.firstElementChild.lastElementChild.style.display = "none";
            stackMenuBox.style.display = "block";
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

      var stack = new CATMAID.Stack.fromStackInfoJson(e,
          CATMAID.StackViewer.Settings.session.min_zoom_level);
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


  CATMAID.editInstanceConfig = function() {
    let isSuperUser = CATMAID.session.is_authenticated && CATMAID.session.is_superuser;
    if (!isSuperUser) {
      CATMAID.warn("You don't have the required permissions to edit the instance configuration");
      return;
    }

    let dialog = new CATMAID.OptionsDialog("CATMAID instance configuration", {
      'Close': CATMAID.noop,
    });

    let showRegularLogin = CATMAID.DOM.createCheckboxSetting('Show regular login',
      CATMAID.Client.Settings.global.show_regular_login_controls,
      'Whether or not to show the common username and password fields in the upper right corner',
      e => {
        CATMAID.Client.Settings.set('show_regular_login_controls', e.target.checked, 'global')
          .then(() => {
            CATMAID.msg('Success', 'Setting updated, reload for it to take effect');
            CATMAID.client._updateLoginControls();
          })
          .catch(CATMAID.handleError);
      })[0];
    dialog.appendChild(showRegularLogin);

    let showExternalLogin = CATMAID.DOM.createCheckboxSetting('Show external login',
      CATMAID.Client.Settings.global.show_external_login_controls,
      'Whether or not to show buttons for external logins (if any) in the upper right corner',
      e => {
        CATMAID.Client.Settings.set('show_external_login_controls', e.target.checked, 'global')
          .then(() => {
            CATMAID.msg('Success', 'Setting updated, reload for it to take effect');
            CATMAID.client._updateLoginControls();
          })
          .catch(CATMAID.handleError);
      })[0];
    dialog.appendChild(showExternalLogin);

    dialog.show(500, 'auto');
  };

  /**
   * Attempt to fork the passed in project.
   */
  CATMAID.forkCurrentProject = function() {
    if (!CATMAID.mayFork()) {
      CATMAID.warn("You don't have the required permissions to create your own space");
      return;
    }

    CATMAID.Project.list()
      .then(projects => {
        let projectDetails = projects.reduce((o,p) => p.id === project.id ? p : o, undefined);
        if (!projectDetails) {
          throw new CATMAID.ValueError(`Could not find details on current project ID: ${project.id}`);
        }
        let [x, y, z] = [project.coordinates.x, project.coordinates.y, project.coordinates.z];
        let s = project.focusedStackViewer.s;
        let nSpaces = projects.length;
        let newName = `Space #${nSpaces + 1} - ${projectDetails.title.replace(/^Space #[0-9]+ - /, '')}`;
        let description = '';
        let createProjectToken = false, approvalNeeded = false;

        let originProjectId = project.id;
        // FIXME: This is a hack
        let originProject = {
          id: project.id,
          title: project.title,
        };

        let switchToNewProject = function(result) {
          let newProjectId = result.new_project_id;
          let showOriginTracingData = defaultLayerField.checked;
          let switchDialog = new CATMAID.OptionsDialog("Switch to new project?", {
            'Stay here': e => {},
            'Switch to new space': e => {
              // Open new space
              let stackId = project.focusedStackViewer.primaryStack.id;
              project.setTool(null);
              return CATMAID.openProjectStack(newProjectId, stackId)
                .then(stackViewer => {
                  CATMAID.msg("Success", "Opened newly created space");
                  return Promise.all([stackViewer, stackViewer.moveTo(z, y, x, s)]);
                })
                .then(results => {
                  let stackViewer = results[0];
                  // Add default remote data
                  if (showOriginTracingData) {
                    project.setTool(new CATMAID.TracingTool());
                    let tool = project.getTool();
                    if (tool instanceof CATMAID.TracingTool) {
                      return tool.openAdditionalTracinData('This instance', originProject, stackViewer)
                          .then(() => tool._updateMoreToolsMenu(true));
                    }
                  }
                })
                .catch(CATMAID.handleError);
            },
          });
          if (result.project_token) {
            switchDialog.appendMessage(`Your new space (project) has been created successfully. The following project token was generated, which can be looked up in in the Project Management widget of the new project as well:`);
            let tokenPanel = document.createElement('div');
            let tokenContainer = tokenPanel.appendChild(document.createElement('span'));
            tokenContainer.classList.add('strong-highlight');
            tokenContainer.appendChild(document.createTextNode(result.project_token));
            let copyButton = tokenPanel.appendChild(document.createElement('i'));
            copyButton.classList.add('fa', 'fa-copy', 'copy-button');
            copyButton.title = 'Copy token to clipboard';
            copyButton.onclick = e => {
              CATMAID.tools.copyToClipBoard(result.project_token);
              CATMAID.msg('Success', 'Copyied project token to clipboard. Use it with care!');
            };
            switchDialog.appendChild(tokenPanel);
            switchDialog.appendMessage('This Project Token can be shared with others, who then can use it to gain access to the new space, according to the defined permissions.');
          switchDialog.appendMessage(`Do you want to switch to the new space? It is also visible from the front page views, the project menu and the 'My projects' view.`);
          } else {
            switchDialog.appendMessage(`Your new project has been created successfully, it has has ID ${newProjectId}. Do you want to switch to it? It is also visible from the front page views and the project menu.`);
          }

          switchDialog.show(400, 'auto');
        };

        let confirmationDialog = new CATMAID.OptionsDialog("Create own copy of project", {
          'Create copy': () => {
            newName = newName.trim();
            if (newName.length === 0) {
              throw new CATMAID.Warning('Empty name not allowed');
            }
            let projectTokenOptions = null;
            if (createProjectToken) {
              let defaultPermissions = [];
              if (canBrowse) defaultPermissions.push('can_browse');
              if (canAnnotate) defaultPermissions.push('can_annotate');
              if (canImport) defaultPermissions.push('can_import');
              if (canFork) defaultPermissions.push('can_fork');
              projectTokenOptions = {
                defaultPermissions: defaultPermissions,
                approvalNeeded: approvalNeeded,
              };
            }
            CATMAID.Project.createFork(originProjectId, newName, description, volumeField.checked, projectTokenOptions)
              .then(result => {
                return switchToNewProject(result);
              })
              .then(() => {
                return Promise.all([
                  CATMAID.client.updateProjects(),
                  CATMAID.updatePermissions(),
                ]);
              })
              .catch(CATMAID.handleError);
          },
          'Cancel': () => {
            //
          }
        });
        confirmationDialog.appendMessage("Please confirm the creation of the new space. Update the name if you like.");

        let basicOptions = document.createElement('div');
        confirmationDialog.appendChild(basicOptions);
        basicOptions.style.display = 'grid';
        basicOptions.style.gridTemplate = 'auto auto / 7em auto';
        basicOptions.style.gridGap = '1em';

        basicOptions.appendChild(document.createElement('span')).appendChild(document.createTextNode('Name'));
        CATMAID.DOM.appendElement(basicOptions, {
          type: 'text',
          value: newName,
          length: 20,
          onchange: e => {
            newName = e.target.value;
          },
        });

        basicOptions.appendChild(document.createElement('span')).appendChild(document.createTextNode('Description'));
        CATMAID.DOM.appendElement(basicOptions, {
          type: 'text',
          placeholder: '(optional)',
          length: 20,
          onchange: e => {
            description = e.target.value;
          }
        });

        var defaultLayerField = confirmationDialog.appendCheckbox("Show tracing data of source project (the current project)", undefined, true,
            "If enabled, the tracing data of the current project is shown by default");

        var volumeField = confirmationDialog.appendCheckbox("Copy volumes/meshes", undefined, true,
            "If enabled, all visible volumes/meshes will copied from this project to the new space");

        confirmationDialog.appendHTML("<strong>By default the new project is only visible to you.</strong> If you want to invite other users into this new projects, you can create a sharable <em>project token</em>. <strong>This is optional</strong> and also possible in the Project Management widget. The token is displayed once the space is created.");

        let optionContainer0 = document.createElement('span');
        optionContainer0.style.display = 'grid';
        optionContainer0.style.gridTemplate = '1.5em / 12em 18em';

        CATMAID.DOM.appendCheckbox(optionContainer0, 'Create project token',
            'A project token is a unique random text string that can be shared. Users knowing this project token will ' +
            'get assigned the default permissions below.', createProjectToken,
            e => {
              createProjectToken = e.target.checked;
              permissionContainer.style.display = createProjectToken ? 'block' : 'none';
              [canBrowseCb, canAnnotateCb, canImportCb, canForkCb, approvalField].forEach(
                  cb => cb.disabled = !createProjectToken);
            }, false, 'fork-create-token').querySelector('input');

        confirmationDialog.appendChild(optionContainer0);

        let permissionContainer = document.createElement('span');
        permissionContainer.style.display = createProjectToken ? 'block' : 'none';
        permissionContainer.style.background = 'aliceblue';
        permissionContainer.style.padding = '0.5em';
        confirmationDialog.appendChild(permissionContainer);

        let permissionInfo = permissionContainer.appendChild(document.createElement('span'));
        permissionInfo.style.display = 'block';
        permissionInfo.style.marginBottom = '1em';
        permissionInfo.appendChild(document.createTextNode('Select the permissions that users knowing this token will have by default:'));

        let optionContainer = document.createElement('span');
        optionContainer.style.display = 'grid';
        optionContainer.style.gridTemplate = '2.5em / 12em 13em 8em 7em';

        let canBrowse = true, canAnnotate = false, canImport = false, canFork = true;

        let canBrowseCb = CATMAID.DOM.appendCheckbox(optionContainer, 'Can read (browse)',
            'Whether invited users should be able see the project and its data by default.', canBrowse,
            e => {
              canBrowse = e.target.checked;
            }, false, 'perms-can-browse').querySelector('input');
        canBrowseCb.disabled = !createProjectToken;
        let canAnnotateCb = CATMAID.DOM.appendCheckbox(optionContainer, 'Can write (annotate)',
            'Whether invited users should be able to write to the project by default', canAnnotate,
            e => {
              canAnnotate = e.target.checked;
            }, false, 'perms-can-annotate').querySelector('input');
        canAnnotateCb.disabled = !createProjectToken;
        let canImportCb = CATMAID.DOM.appendCheckbox(optionContainer, 'Can import',
            'Whether invited users should be able to import into the project by default', canImport,
            e => {
              canImport = e.target.checked;
            }, false, 'perms-can-import').querySelector('input');
        canImportCb.disabled = !createProjectToken;
        let canForkCb = CATMAID.DOM.appendCheckbox(optionContainer, 'Can fork',
            'Whether invited users should be able to fork the new space themselves.',
            canFork, e => { canFork = e.target.checked; }, false, 'perms-can-fork').querySelector('input');
        canForkCb.disabled = !createProjectToken;

        permissionContainer.appendChild(optionContainer);

        let optionContainer2 = document.createElement('span');
        optionContainer2.style.display = 'grid';
        optionContainer2.style.gridTemplate = '2.5em / 20em';

        let approvalField = CATMAID.DOM.appendCheckbox(optionContainer2, 'Require approval of new users',
            'If users add this project token to their profile, they get assigned the default permissions of this token. If this should require the approval of a project admin, enable this.', approvalNeeded,
            e => {
              approvalNeeded = e.target.checked;
            }, false, 'project-token-approval').querySelector('input');
        approvalField.disabled = !createProjectToken;

        permissionContainer.appendChild(optionContainer2);

        return confirmationDialog.show(500, 'auto');
      })
      .catch(CATMAID.handleError);
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
    } else {
      /**
       * Make sure we have finally() available.
       * From: https://stackoverflow.com/questions/53327711
       */
      Promise.prototype.finally = Promise.prototype.finally || {
        finally (fn) {
          const onFinally = value => Promise.resolve(fn()).then(() => value);
          return this.then(
            result => onFinally(result),
            reason => onFinally(Promise.reject(reason))
          );
        }
      }.finally;
    }

    // Initialize a new CATMAID front-end
    var options = CATMAID.tools.parseQuery(window.location.href);
    CATMAID.client = new CATMAID.Client(options);
  };

  CATMAID.mayEdit = function() {
    return checkPermission('can_annotate');
  };

  CATMAID.mayView = function() {
    return checkPermission('can_annotate') || checkPermission('can_browse');
  };

  CATMAID.mayFork = function() {
    return checkPermission('can_fork');
  };

  function checkPermission(p) {
    return CATMAID.hasPermission(project.getId(), p);
  }

  CATMAID.getAbsoluteURL = function() {
    return CATMAID.tools.urlJoin(window.location.origin, CATMAID.makeURL('/'));
  };

})(CATMAID);
