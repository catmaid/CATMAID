/**
 * project.js
 *
 * requirements:
 *   tools.js
 *   request.js
 *
 */

(function(CATMAID) {

  "use strict";

  /**
   * A CATMAID project.
   *
   * - contains abstract objects on top of a common project-specific semantic framework
   * - is related to one ore more stacks of statically aligned layers
   *   ( all stacks of a project are related by translation using physical dimensions )
   *
   * @class
   * @param {number} pid  API ID of this CATMAID project.
   */
  function Project(pid, title) {

    this.interpolatableSections = {
      'x': [],
      'y': [],
      'z': []
    };

    // A general purpurse clipboard.
    var clipboard = null;

    this.getView = function() {
      return view;
    };

    /**
     * Add a stack viewer to the project.
     *
     * @param {StackViewer} stackViewer Viewer to add to the project and UI.
     */
    this.addStackViewer = function( stackViewer ) {
      // Save a local reference to the currently focused stack, because it gets
      // overwritten if the new stack is added.
      var lastFocusedStackViewer = self.focusedStackViewer;

      stackViewers.push( stackViewer );

      var inTree = false;
      var node = stackViewer.getWindow();

      while (!inTree && node !== null) {
        node = node.getParent();
        inTree = node instanceof CMWRootNode;
      }

      if (!inTree) {
        var rootWindow = CATMAID.rootWindow;

        if ( rootWindow.getChild() === null ) {
          rootWindow.replaceChild( stackViewer.getWindow() );
        } else {
          rootWindow.replaceChild( new CMWHSplitNode( rootWindow.getChild(),
            stackViewer.getWindow() ) );
        }
      }

      stackViewer.getWindow().focus();
      CATMAID.ui.onresize();

      if ( stackViewers.length > 1 ) {
        self.moveToProject( self.coordinates.z, self.coordinates.y, self.coordinates.x,
            lastFocusedStackViewer.primaryStack.stackToProjectSMP( lastFocusedStackViewer.s ));
      } else {
        var c = stackViewer.projectCoordinates();
        self.moveTo( c.z, c.y, c.x );
      }

      self.setFocusedStackViewer( stackViewer );

      // only set the tool for the first stack viewer
      if ( stackViewers.length == 1 ) {
        if ( !tool )
          tool = new CATMAID.Navigator();
        self.setTool( tool );
      }

      // Announce that a new stack view was added
      this.trigger(Project.EVENT_STACKVIEW_ADDED, stackViewer);
      Project.trigger(Project.EVENT_STACKVIEW_ADDED, stackViewer);
    };

    /**
     * Get one of the projects currently opened stack viewers.
     */
    this.getStackViewer = function (id) {
      for ( var i = 0; i < stackViewers.length; ++i ) {
        if ( stackViewers[ i ].getId() === id ) return stackViewers[ i ];
      }
      return false;
    };

    /**
     * Get all currently opened stack viewers.
     *
     * @return {StackViewer[]}
     */
    this.getStackViewers = function() {
      return stackViewers;
    };

    /**
     * Get all stack viewers whose primary stack has a given ID.
     * @param  {number} stackId  ID of the primary stack to search for.
     * @return {StackViewer[]}
     */
    this.getViewersForStack = function (stackId) {
      return stackViewers.filter(function (stackViewer) {
        return stackViewer.primaryStack.id === stackId;
      });
    };

    /**
     * Remove a stack viewer from the list.
     */
    this.removeStackViewer = function (id) {
      for ( var i = 0; i < stackViewers.length; ++i )
      {
        if ( stackViewers[ i ].getId() === id )
        {
          var removedViews = stackViewers.splice( i, 1 );

          // Announce that this stack view was closed. Do this before
          // potentially destroying the project.
          this.trigger(Project.EVENT_STACKVIEW_CLOSED, removedViews[0]);
          Project.trigger(Project.EVENT_STACKVIEW_CLOSED, removedViews[0]);

          if ( stackViewers.length === 0 ) {
            if (CATMAID.Client.Settings.session.last_stack_viewer_closes_project) {
              self.destroy();
            }
          } else {
            stackViewers[ ( i + 1 ) % stackViewers.length ].getWindow().focus();
          }
        }
      }
      CATMAID.ui.onresize();
    };

    /**
     * focus a stack and blur the rest
     */
    this.setFocusedStackViewer = function( stackViewer ) {
      self.focusedStackViewer = stackViewer;
      if ( tool )
        self.focusedStackViewer.setTool( tool );
      this.trigger(Project.EVENT_STACKVIEW_FOCUS_CHANGED, stackViewer);
      Project.trigger(Project.EVENT_STACKVIEW_FOCUS_CHANGED, stackViewer);
    };

    /**
     * focus the next or prior stack
     */
    this.switchFocus = function( s ) {
      var i;
      for ( i = 0; i < stackViewers.length; ++i )
        if ( self.focusedStackViewer == stackViewers[ i ] ) break;

      stackViewers[ ( i + stackViewers.length + s ) % stackViewers.length ].getWindow().focus();
    };

    //!< Associative array of selected objects
    // in the Treenode Table and Object Tree.
    // I.e. enables communication between the Object Tree and the Table of Nodes.
    this.selectedObjects = {
      'tree_object': {},
      'table_treenode': {},
      'selectedneuron': null,
      'selectedskeleton': null,
    };

    this.setSelectObject = function( type, id ) {
        this.selectedObjects.selectedneuron = null;
        this.selectedObjects.selectedskeleton = null;
        if( type == "neuron" ) {
            this.selectedObjects.selectedneuron = id;
        } else if( type == "skeleton" ) {
            this.selectedObjects.selectedskeleton = id;
        }
    };

    this.hideToolbars = function() {
      document.getElementById( "toolbar_nav" ).style.display = "none";
      document.getElementById( "toolbar_text" ).style.display = "none";
      document.getElementById( "toolbar_trace" ).style.display = "none";
    };

    this.setTool = function( newTool ) {
      // Destroy the old project only, if it isn't the very same project that gets
      // set again.
      if( tool && newTool !== tool )
        tool.destroy();
      tool = newTool;

      CATMAID.DOM.removeAllChildren(document.getElementById("toolbox_data"));

      var prepare, initError = false;
      if (newTool && CATMAID.tools.isFn(newTool.init)) {
        // Add tool actios, if there are any available.
        if (newTool.constructor.actions) {
          $('#toolbox_data').replaceWith(CATMAID.createButtonsFromActions(
              newTool.constructor.actions, 'toolbox_data', ''));
        }
        prepare = newTool.init()
          .catch(function(error) {
            initError = true;
            return Promise.reject(error);
          });
      } else {
        prepare = Promise.resolve();
      }

      prepare
        .then(function() {
          if ( !self.focusedStackViewer && stackViewers.length > 0 ) {
            self.setFocusedStackViewer( stackViewers[ 0 ] );
          }

          if ( self.focusedStackViewer ) {
            self.focusedStackViewer.setTool( tool );
            if (!self.focusedStackViewer.getWindow().hasFocus())
              self.focusedStackViewer.getWindow().focus();
          } else {
            // Attempt to load the tool without any registered stack-viewer.
            tool.register();
          }
          window.onresize();
          WindowMaker.setKeyShortcuts();
          self.trigger(Project.EVENT_TOOL_CHANGED, tool);
          Project.trigger(Project.EVENT_TOOL_CHANGED, tool);
        })
        .catch(function(error) {
          if (initError) {
            // Unselect all tools on initialization errors
            self.setTool(null);
            self.trigger(Project.EVENT_TOOL_CHANGED, null);
            Project.trigger(Project.EVENT_TOOL_CHANGED, null);
          }
          CATMAID.handleError(error);
        });
    };

    this.getTool = function( ) {
      return tool;
    };

    this.toggleShow = function( m ) {
      switch ( m )
      {
      case "text":
        if ( show_textlabels && mode != "text" )
        {
          show_textlabels = false;
          document.getElementById( "show_button_text" ).className = "button";
          for ( var i = 0; i < stackViewers.length; ++i )
            stackViewers[ i ].showTextlabels( false );
        }
        else
        {
          show_textlabels = true;
          for ( var i = 0; i < stackViewers.length; ++i )
            stackViewers[ i ].showTextlabels( true );
          document.getElementById( "show_button_text" ).className = "button_active";
        }
      }
    };

    /**
     * register all GUI elements
     */
    this.register = function() {
      document.getElementById("toolbox_edit").style.display = "block";
      document.getElementById("content").style.display = "none";
      document.getElementById("windows").appendChild(view);
    };

    /**
     * unregister and remove all stacks, free the event-handlers, hide the stack-toolbar
     *
     * @todo: should not the stack handle the navigation toolbar?
     */
    this.destroy = function() {
      if ( tool ) tool.destroy();

      //! Close all windows. There is no need to explicitely call close()
      //! on the root window as this done by the last child.
      CATMAID.rootWindow.closeAllChildren();

      try
      {
        document.getElementById("windows").removeChild( view );
      }
      catch ( error ) {}
      self.id = 0;
      document.getElementById( "content" ).style.display = "block";
      document.getElementById( "stackmenu_box" ).style.display = "none";
      document.getElementById( "layoutmenu_box" ).style.display = "none";
      document.getElementById( "stack_menu" ).style.display = "none";
      // TODO: bars should be unset by tool on unregister
      document.getElementById("toolbox_edit").style.display = "none";
      document.getElementById( "toolbox_project" ).style.display = "none";
      document.getElementById( "toolbar_nav" ).style.display = "none";

      CATMAID.DOM.removeAllChildren(document.getElementById("toolbox_data"));

      CATMAID.statusBar.replaceLast('');
      CATMAID.statusBar.printCoords('');

      this.trigger(Project.EVENT_PROJECT_DESTROYED);
      Project.trigger(Project.EVENT_PROJECT_DESTROYED, this.id);
    };

    /**
     * Indicate if the project location can be changed. Stack viewers
     * can block location change requests (e.g. to not interrupt user
     * input).
     */
    this.canMove = function() {
      return stackViewers.every(function(sv) {
        return sv.navigateWithProject ? sv.canMove() : true;
      });
    };

    /**
     * move all stacks to the physical coordinates, except sp, sp is a
     * stack specific scale level that cannot be traced back to where it
     * came from, so we just pass it through.
           * Rxecute a completion * callback when everything is done.
           * One stack is moved as a continuation
     * of the stack before (except first stack, which is moved directly). This
     * makes sure we also wait for asynchronous requests to finish, that a stack
     * move might imply (e.g. requesting more treenodes for the tracing tool).
     */
    this.moveTo = function(zp, yp, xp, sp, completionCallback) {
      if (!this.canMove()) {
        return Promise.reject(new CATMAID.Warning("A location change is not possible at this moment"));
      }

      self.coordinates.x = xp;
      self.coordinates.y = yp;
      self.coordinates.z = zp;

      var movePromises = stackViewers.map(function (sv) {
        return sv.navigateWithProject ?
            sv.moveTo(zp, yp, xp, sp) : Promise.resolve();
      });

      return Promise.all(movePromises).then(function () {
        if (tool && tool.redraw)
          tool.redraw();
        self.trigger(Project.EVENT_LOCATION_CHANGED, self.coordinates.x,
          self.coordinates.y, self.coordinates.z);
        Project.trigger(Project.EVENT_LOCATION_CHANGED, self.coordinates.x,
          self.coordinates.y, self.coordinates.z);
        if (typeof completionCallback !== "undefined") {
          completionCallback();
        }
      });
    };

    /**
     * move all stacks to the physical coordinates, at a given resolution
     * in units per pixels
     */
    this.moveToProject = function(zp, yp, xp, res, completionCallback) {
      if (!this.canMove()) {
        return Promise.reject(new CATMAID.Warning("A location change is not possible at this moment"));
      }

      self.coordinates.x = xp;
      self.coordinates.y = yp;
      self.coordinates.z = zp;

      var movePromises = stackViewers.map(function (sv) {
        return sv.navigateWithProject ?
          new Promise(function (resolve, reject) {
            sv.moveToProject(zp, yp, xp, res, resolve);
          }) :
          Promise.resolve();
      });

      return Promise.all(movePromises).then(function () {
        if (tool && tool.redraw)
          tool.redraw();
        self.trigger(Project.EVENT_LOCATION_CHANGED, self.coordinates.x,
          self.coordinates.y, self.coordinates.z);
        Project.trigger(Project.EVENT_LOCATION_CHANGED, self.coordinates.x,
          self.coordinates.y, self.coordinates.z);
        if (typeof completionCallback !== "undefined") {
          completionCallback();
        }
      });
    };

    this.updateTool = function() {
      if ( tool && tool.updateLayer )
        tool.updateLayer();
    };

    // Need to add this "tool-specific" function
    // to project because need to call it from the
    // object tree widget
    this.deselectActiveNode = function() {
      if ( tool && tool.deselectActiveNode )
        tool.deselectActiveNode();
    };

    this.getStackAndStackGroupConfiguration = function() {
      let stackGroupId, sgs = [], stacks = [], stackScaleLevels = [];

      if (stackViewers.length > 0) {
        var sgStacks;
        if (this.lastLoadedStackGroup) {
          stackGroupId = this.lastLoadedStackGroup.id;
          sgStacks = new Set(this.lastLoadedStackGroup.stacks.map(function(s) {
            return s.id;
          }));
        }

        var sgsAdded = false;

        for ( var i = 0; i < stackViewers.length; ++i )
        {
          var sv = stackViewers[i];
          if (this.lastLoadedStackGroup && !sgsAdded && sgStacks && sgStacks.has(sv.primaryStack.id)) {
            sgs.push(sv.s);
            sgsAdded = true;
          }

          stacks.push(sv.primaryStack.encodedId());
          stackScaleLevels.push(sv.s);
        }
      }

      return {
        stackGroupId: stackGroupId,
        stackGroupScaleLevels: sgs,
        stacks: stacks,
        stackScaleLevels: stackScaleLevels,
      };
    };

    /**
     * create a URL to the current view
     */
    this.createURL = function(withLayout = false, withSkeletons = true, withWidgetSettings = true,
        ignoredWindowTitle = null, showHelp = null, message = null) {
      let x, y, z, activeNodeId, activeSkeletonId, stackGroupId, sgs = [],
          stacks = [], stackScaleLevels = [];
      let tool = project.getTool().toolname;

      if (stackViewers.length > 0) {
        [x, y, z] = [self.coordinates.x, self.coordinates.y, self.coordinates.z];

        if( tool === 'tracingtool' && !SkeletonAnnotations.atn.isRemote()) {
          activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
          activeNodeId = SkeletonAnnotations.getActiveNodeId();
        }

        let stackConfig = this.getStackAndStackGroupConfiguration();
        stackGroupId = stackConfig.stackGroupId;
        sgs = stackConfig.stackGroupScaleLevels;
        stacks = stackConfig.stacks;
        stackScaleLevels = stackConfig.stackScaleLevels;
      }

      let layout;
      if (withLayout){
        layout = CATMAID.Layout.makeLayoutSpecForWindow(CATMAID.rootWindow, withSkeletons,
            withWidgetSettings, ignoredWindowTitle);
      }

      if (showHelp === null) {
        showHelp = CATMAID.client.showContextHelp;
      }

      return Project.createRelativeURL(self.id, x, y, z, tool, activeNodeId,
        activeSkeletonId, stacks, stackScaleLevels, stackGroupId, sgs,
        showHelp, layout, message);
    };

    /** This function should return true if there was any action
      linked to the key code, or false otherwise. */

    this.handleKeyPress = function( e ) {
      var keyAction = CATMAID.UI.getMappedKeyAction(keyToAction, e);
      if (keyAction) {
        return keyAction.run(e);
      } else {
        return false;
      }
    };

    /**
     * Get project ID.
     */
    this.getId = function(){ return pid; };

    // initialise
    var self = this;
    this.id = pid;
    this.title = title;

    var tool = null;

    var view = CATMAID.rootWindow.getFrame();
    view.className = "projectView";

    this.coordinates = {
      x : 0,
      y : 0,
      z : 0
    };

    var stackViewers = [];  //!< a list of stacks related to the project
    this.focusedStackViewer = undefined;

    // Remember the stack group loaded last to allow stack group URL creation.
    this.lastLoadedStackGroup = null;

    var mode = "move";
    var show_textlabels = true;

    /** The only actions that should be added to Project are those
        that should be run regardless of the current tool, such as
        actions that switch tools. */

    var actions = CATMAID.toolActions.concat(CATMAID.EditTool.actions);

    actions.push(new CATMAID.Action({
        helpText: "Toggle/check checkboxes under selection rectangle (<kbd>Ctrl</kbd>: toggle <kbd>Shift</kbd>: check)",
        keyShortcuts: { "X": [ "Ctrl + x", "Shift + x" ] },
        run: function(event) {
          var checkOnly = event.shiftKey;
          CATMAID.ui.toggleRectCheckboxSelect(checkOnly);
        }
    }));

    actions.push(new CATMAID.Action({
      helpText: "Copy selected skeletons of active widget using <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>C</kbd> into clipboard",
      keyShortcuts: { "C": [ "Alt + Ctrl + c", "Meta + Ctrl + c"] },
      run: function(event) {
        var activeWidget = CATMAID.front();
        if (!activeWidget) {
          CATMAID.warn("No active widget found, No data to copy to clipboard");
          return false;
        }
        var sources = CATMAID.skeletonListSources.getSourcesOfOwner(activeWidget);
        if (!sources || sources.length === 0) {
          CATMAID.msg("No active skeleton source", "Please select a skeleton skeleton source widget first");
          return false;
        }

        // Take first available source by default
        var activeSource = sources[0];
        var models = activeSource.getSelectedSkeletonModels();
        var nModels = Object.keys(models).length;
        if (nModels === 0) {
          CATMAID.msg("No selected skeletons", "Please select at least one skeleton first");
          return false;
        }

        clipboard = new ClipboardElement("skeleton-models", models);
        CATMAID.msg("Success", "Copied " + nModels + " to clipboard");
        return true;
      }
    }));

    actions.push(new CATMAID.Action({
      helpText: "Paste previously copied data using <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>V</kbd>, like skeleton models",
      keyShortcuts: { "V": [ "Alt + Ctrl + v", "Meta + Ctrl + v" ] },
      run: function(event) {
        if (!clipboard) {
          CATMAID.warn("Please copy data to the clipboard first");
          return false;
        }
        var activeWidget = CATMAID.front();
        if (!activeWidget) {
          CATMAID.warn("Please activate widget first");
          return false;
        }
        if (!clipboard.data) {
          throw new CATMAID.ValueError("No clipboarod data in clipboard element");
        }
        if (clipboard.type === "skeleton-models") {
          var nModels = Object.keys(clipboard.data).length;
          activeWidget.append(clipboard.data);
          CATMAID.msg("Success", "Pasted " + nModels + " skeletons into " +
              activeWidget.getName());
        } else {
          throw new CATMAID.ValueError("Unknown clipboard data type: " + clipboard.type);
        }

        return true;
      }
    }));

    this.getActions = function () {
      return actions;
    };

    var keyToAction = CATMAID.getKeyToActionMap(actions);
  }

  /**
   * Get all visible projects, optionally sorted by name. This request is
   * performed in parallel.
   *
   * @param {Boolean} hasTracingData (optional) If true, only projects with
   *                                 tracing data are return. False by default.
   * @param {Boolean} with_mirrors   (optional) If true, mirror data will be
   *                                 returned, too. False by default.
   * @param {API}     api            (optional) An API instance to use.
   */
  Project.list = function(sort, hasTracingData = false, with_mirrors = false, api = undefined) {
    var projects = CATMAID.fetch({
      url: 'projects/',
      data: {
        has_tracing_data: hasTracingData,
        with_mirrors: with_mirrors,
      },
      parallel: true,
      api: api,
    });
    if (sort) {
      projects = projects.then(function(projects) {
        return projects.sort(function(a, b) {
          return CATMAID.tools.compareStrings(a.title, b.title);
        });
      });
    }

    return projects;
  };

  /**
   * Create a fork of this project with this name.
   */
  Project.createFork = function(projectId, name, description = null, copyVolumes = false, projectTokenOptions = null) {
    return CATMAID.fetch({
      url: `${projectId}/fork`,
      method: 'POST',
      data: {
        name: name,
        description: description,
        copy_volumes: copyVolumes,
        project_token: !!projectTokenOptions,
        project_token_default_permissions: projectTokenOptions ? projectTokenOptions.defaultPermissions : undefined,
        project_token_approval_needed: projectTokenOptions ? projectTokenOptions.approvalNeeded : undefined,
      }
    });
  };

  Project.createRelativeURL = function(projectId, x, y, z, tool, activeNodeId,
      activeSkeletonId, stacks, stackScaleLevels, stackGroupId, sgs, help, layout, message) {
    var url = `?pid=${projectId}&zp=${z}&yp=${y}&xp=${x}`;
    if (tool) {
      url += `&tool=${tool}`;
    }
    if (activeSkeletonId) {
      url += `&active_skeleton_id=${activeSkeletonId}`;
    }
    if (activeNodeId) {
      url += `&active_node_id=${activeNodeId}`;
    }
    if (stacks && stackScaleLevels) {
      for (let i=0; i<stacks.length; ++i) {
        url += `&sid${i}=${stacks[i]}&s${i}=${stackScaleLevels[i]}`;
      }
    }
    if (stackGroupId) {
      url += `&sg=${stackGroupId}`;
    }
    if (sgs) {
      for (let i=0; i<sgs.length; ++i) {
        url += `&sgs=${sgs[i]}`;
      }
    }
    if (help) {
      url += `&help=true`;
    }
    if (message) {
      url += `&message=${message}`;
    }
    if (layout) {
      url += `&layout=${layout}`;
    }
    return url;
  };

  /**
   * Get all explicitly defined user permissions for a project. This is only
   * available for superusers and those with can_administer permission in the
   * project. Implicit group permissions are ignored.
   *
   * @param projectId {Integer} The project to look up the permissions for.
   * @returns {Promise} resolving in a map of user IDs to objects with a user name
   *          and a list of permissions.
   */
  Project.getUserPermissions = function(projectId) {
    if (!CATMAID.hasPermission(project.id, 'can_administer')) {
      return Promise.reject(new CATMAID.PermissionError("Need administration permission in this project"));
    }
    return CATMAID.fetch(`${project.id}/permissions/project-user`);
  };

  /**
   * Update a set of permission for a user in a project. This is only allowed
   * for superusers or users with the can_administer role in this project.
   *
   * @param projectId   {Integer} The project to update permissions in.
   * @param userId      {Integer} The user to update permissions of.
   * @param permissions {Object} Maps role names like can_administer to boolean
   *                             values, indicating whether to switch them on or off.
   */
  Project.updateUserPermission = function(projectId, userId, permissions) {
    if (!CATMAID.hasPermission(project.id, 'can_administer')) {
      return Promise.reject(new CATMAID.PermissionError("Need administration permission in this project"));
    }
    return CATMAID.fetch(`${project.id}/permissions/project-user`, 'POST', {
      'user_id': userId,
      'permissions': Object.keys(permissions).map(p => [p, permissions[p]]),
    });
  };

  /**
   * Get all explicitly defined group permissions for a project. This is only
   * available for superusers and those with can_administer permission in the
   * project.
   *
   * @param projectId {Integer} The project to look up the permissions for.
   * @returns {Promise} resolving in a map of group IDs to objects with a group name
   *          and a list of permissions.
   */
  Project.getGroupPermissions = function(projectId) {
    if (!CATMAID.hasPermission(project.id, 'can_administer')) {
      return Promise.reject(new CATMAID.PermissionError("Need administration permission in this project"));
    }
    return CATMAID.fetch(`${project.id}/permissions/project-group`);
  };

  /**
   * Update a set of permission for a group in a project. This is only allowed
   * for superusers or users with the can_administer role in this project.
   *
   * @param projectId   {Integer} The project to update permissions in.
   * @param groupId     {Integer} The group to update permissions of.
   * @param permissions {Object} Maps role names like can_administer to boolean
   *                             values, indicating whether to switch them on or off.
   */
  Project.updateGroupPermission = function(projectId, groupId, permissions) {
    if (!CATMAID.hasPermission(project.id, 'can_administer')) {
      return Promise.reject(new CATMAID.PermissionError("Need administration permission in this project"));
    }
    return CATMAID.fetch(`${project.id}/permissions/project-group`, 'POST', {
      'group_id': groupId,
      'permissions': Object.keys(permissions).map(p => [p, permissions[p]]),
    });
  };

  /**
   * Delete the current project.
   *
   * @param projectId {Integer} The project to delete.
   * @returns {Promise} Resolves once the project is deleted.
   */
  Project.delete = function(projectId) {
    if (!CATMAID.hasPermission(projectId, 'delete_project')) {
      return Promise.reject(new CATMAID.PermissionError("Need deletion permission in this project"));
    }
    let result = CATMAID.fetch(`${projectId}/`, 'DELETE');
    result.then(result => {
      Project.trigger(Project.EVENT_PROJECT_DELETED, projectId);
    });
    return result;
  };

  /**
   * Update properties of this project.
   *
   * @param projectId {Integer} The project to delete.
   * @param properties {Object} An object containing one or more of the fields
   *                            'title', 'comment'.
   * @returns {Promise} Resolves once the project is updated.
   */
  Project.updateProperties = function(projectId, properties) {
    if (!CATMAID.hasPermission(projectId, 'can_administer')) {
      return Promise.reject(new CATMAID.PermissionError("Need administration permissions in this project"));
    }
    const allowedFields = new Set(['title', 'comment']);
    for (let key in properties) {
      if (!allowedFields.has(key)) {
        throw new CATMAID.ValueError(`Property "${key}" is not allowed for project updates`);
      }
    }

    return CATMAID.fetch(`${projectId}/`, 'POST', properties);
  };

  /**
   * Update properties of this project.
   *
   * @param projectId {Integer} The project to delete.
   * @param properties {Object} An object containing one or more of the fields
   *                            'title', 'comment'.
   * @returns {Promise} Resolves once the project is updated.
   */
  Project.prototype.updateProperties = function(properties) {
    let result = CATMAID.Project.updateProperties(this.id, properties);
    result.then(response => {
      this.title = response.title;
      this.comment = response.comment;
      Project.trigger(Project.EVENT_PROJECT_CHANGED, response);
    });

    return result;
  };

  /**
   * Refresh properties of this project.
   * @returns {Promise} Resolves once the project is updated.
   */
  Project.prototype.refresh = function() {
    return CATMAID.fetch(`${project.id}/`)
      .then(response => {
        this.title = response.title;
      });
  };

  // Add event support to project and define some event constants
  CATMAID.asEventSource(Project.prototype);
  CATMAID.asEventSource(Project);
  Project.EVENT_STACKVIEW_ADDED = 'project_stackview_added';
  Project.EVENT_STACKVIEW_CLOSED = 'project_stackview_closed';
  Project.EVENT_STACKVIEW_FOCUS_CHANGED = 'project_stackview_focus_changed';
  Project.EVENT_LOCATION_CHANGED = 'project_location_changed';
  Project.EVENT_PROJECT_CHANGED = 'project_changed';
  Project.EVENT_PROJECT_DELETED = 'project_deleted';
  Project.EVENT_PROJECT_DESTROYED = 'project_project_destroyed';
  Project.EVENT_TOOL_CHANGED = 'project_tool_changed';

  Project.prototype.updateInterpolatableLocations = function() {
    var self = this;
    return CATMAID.fetch(this.id + '/interpolatable-sections/')
      .then(function(result) {
        if (result['x'] && result['y'] && result['z']) {
          self.interpolatableSections = result;
        } else {
          CATMAID.warn("Could not load interpolatable sections for project " + self.id);
        }
      });
  };

  function ClipboardElement(type, data) {
    this.type = type;
    this.data = data;
  }

  // Make Project available in CATMAID namespace
  CATMAID.Project = Project;

})(CATMAID);
