/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** An object that encapsulates the functions for creating accessory windows. */
var WindowMaker = new function()
{
  /** Map of window widget names to a map of CMWindow instances to widget objects.
   * Only windows that are open are stored. */
  var windows = new Map();
  var self = this;
  var DOM = CATMAID.DOM;
  var windowManagerStoragePrefix = "catmaid-widgets-";

  // Map types to state manager objects
  var stateManagers = new Map();
  // A serializer to stringify widget state.
  var stateSerializer = new CATMAID.JsonSerializer();

  var createContainer = function(id, expandContent) {
    var container = document.createElement("div");
    if (id) {
      container.setAttribute("id", id);
    }
    container.classList.add("windowContent");
    if (!expandContent) {
      container.classList.add("padded-content");
    }
    return container;
  };

  /**
   * Store the state of a widget in a cookie using the passed in state provider.
   */
  var storeWidgetState = function(widget, stateManager) {
    key = windowManagerStoragePrefix + stateManager.key;
    var serializedState = stateSerializer.serialize({
      'state': stateManager.getState(widget)
    });
    localStorage.setItem(key, serializedState);
    return true;
  };

  /**
   * Store the state of a widget if there is a state manager available for it.
   */
  CATMAID.saveWidgetState = function(widget) {
    var widgetStateManager = stateManagers.get(widget.constructor);
    if (widgetStateManager) {
      try {
        return storeWidgetState(widget, widgetStateManager);
      } catch (e) {
        CATMAID.warn("Coudln't save widget state");
        return false;
      }
    }
  };

  /**
   * Clear the stored state of a widget if there is a state manager available
   * for it.
   */
  CATMAID.clearSavedWidgetState = function(widget) {
    var stateManager = stateManagers.get(widget.constructor);
    if (stateManager) {
      try {
        var key = windowManagerStoragePrefix + stateManager.key;
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        CATMAID.warn("Coudln't save widget state");
        return false;
      }
    } else {
      CATMAID.warn("No state manager found");
      return false;
    }
  };

  /**
   *  Try to load a widget state from a cookie using the passed in state
   *  manager.
   */
  var loadWidgetState = function(widget, stateManager) {
    key = windowManagerStoragePrefix + stateManager.key;
    var serializedWidgetData = localStorage.getItem(key);
    if (!serializedWidgetData) {
      // Try to find information in cookie. If the item is found, it is copied
      // to the local storage and removed from the cookie. This test can be
      // removed in future versions and is only meant to not surprise users with
      // lost defaults and stale cookie information.
      serializedWidgetData = CATMAID.getCookie(key);
      if (serializedWidgetData) {
        localStorage.setItem(key, serializedWidgetData);
        // Remove old cookie entry
        CATMAID.setCookie(key, '', -1);
      }
    }
    if (serializedWidgetData) {
      var widgetData = stateSerializer.deserialize(serializedWidgetData);
      if (widgetData && widgetData.state) {
        stateManager.setState(widget, widgetData.state);
      }
      return true;
    } else {
      return false;
    }
  };

  /**
   * If enabled by the client settings (or force is truthy), this loads the last
   * saved state for a widget.
   */
  var checkAndLoadWidgetState = function(widget, force) {
    if (!(CATMAID.Client.Settings.session.auto_widget_state_load || force)) {
      return;
    }
    var stateManager = stateManagers.get(widget.constructor);
    if (stateManager) {
      try {
        loadWidgetState(widget, stateManagers.get(widget.constructor));
      } catch (e) {
        CATMAID.warn("Couldn't load last widget state");
      }
    }
  };

  /**
   * Return a function that first tries to save the widget state of <widget>
   * before calling <fn>, if it is a function.
   */
  var wrapSaveState = function(widget, fn) {
    return function() {
      // Try to serialize the widget state before closing.
      if (CATMAID.Client.Settings.session.auto_widget_state_save) {
        CATMAID.saveWidgetState(widget);
      }
      if (CATMAID.tools.isFn(fn)) {
        fn.call(widget);
      }
    };
  };

  /**
   * Get content height of a window and take into account a potential button
   * panel. If a button panel class is provided, the height of all visible
   * elements of this class will be substracted from the window content height.
   */
  var getWindowContentHeight = function(win, panelSelector = '.windowpanel') {
    let height = win.getContentHeight();
    if (panelSelector) {
      let panels = win.getFrame().querySelectorAll(panelSelector);
      let totalPanelHeight = 0;
      for (let panel of panels) {
        if ($(panel).is(':visible')) {
          totalPanelHeight += panel.getBoundingClientRect().height;
        }
      }
      // Update content height
      height = height - totalPanelHeight;
    }
    return height;
  };

  var addListener = function(win, container, destroy, resize, focus) {
    win.addListener(
      function(callingWindow, signal) {

        // Keep track of scroll bar pixel position and ratio to total container
        // height to maintain scoll bar location on resize. From:
        // http://jsfiddle.net/JamesKyle/RmNap/
        var contentHeight = getWindowContentHeight(win);
        var $container = $(container);
        var scrollPosition = $container.scrollTop();
        var scrollRatio = scrollPosition / contentHeight;

        $container.on("scroll", function() {
          scrollPosition = $container.scrollTop();
          scrollRatio = scrollPosition / contentHeight;
        });

        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof(destroy) === "function") {
              destroy();
            }
            if (typeof(project) === "undefined" || project === null) {
              CATMAID.rootWindow.close();
              document.getElementById("content").style.display = "none";
            } else {
              // Remove from listing
              windows.forEach(function (widgetWindows, widgetName) {
                widgetWindows.delete(win);
                if (widgetWindows.size === 0) {
                  windows.delete(widgetName);
                }
              });
            }
            break;
          case CMWWindow.RESIZE:
            contentHeight = getWindowContentHeight(win);
            container.style.height = contentHeight + "px";
            container.style.width = ( win.getAvailableWidth() + "px" );

            if (typeof(resize) === "function") {
              resize();
            }

            // Scoll to last known scroll position, after resize has been
            // performed, in case a redraw changes the content.
            $container.scrollTop(contentHeight * scrollRatio);

            break;
          case CMWWindow.POINTER_ENTER:
            if (CATMAID.FOCUS_ALL === CATMAID.focusBehavior) win.focus();
            break;
          case CMWWindow.FOCUS:
            CATMAID.tools.callIfFn(focus);
            break;
        }
        return true;
      });
  };

  var addLogic = function(win) {
    document.getElementById("content").style.display = "none";

    /* be the first window */
    var rootWindow = CATMAID.rootWindow;

    let windowContainer = document.getElementById("windows");
    if (!windowContainer) {
      throw new CATMAID.ValueError("Could not find window container");
    }

    if (rootWindow.getFrame().parentNode != windowContainer) {
      windowContainer.appendChild(rootWindow.getFrame());
      document.getElementById("content").style.display = "none";
    }

    if (rootWindow.getChild() === null)
      rootWindow.replaceChild(win);
    else
      rootWindow.replaceChild(new CMWHSplitNode(rootWindow.getChild(), win));

    win.focus();
  };

  /**
   * A custom source toggle wrapper to not repeat custom title control code. If
   * source is an array it is assumed that the first element is the actual
   * source and the second a title.
   */
  var addWidgetSourceToggle = function(win, source) {
    // Allow custom titles if element is an array
    if (source instanceof Array) {
      DOM.addSourceControlsToggle(win, source[0], source[1]);
    } else {
      DOM.addSourceControlsToggle(win, source);
    }
  };

  var addWindowConfigButton = function(win, instance) {
    var supportsStateSaving = instance && stateManagers.has(instance.constructor);
    DOM.addWindowConfigButton(win, instance, supportsStateSaving);
  };

  /**
   * Create a general widget window for a widget instance that provides a widget
   * configuration.
   */
  var createWidget = function(instance) {
    try {
      CATMAID.throwOnInsufficientWebGlContexts(instance.MIN_WEBGL_CONTEXTS || 0);
    } catch (e) {
      if (CATMAID.tools.isFn(instance.destroy)) {
        instance.destroy();
      }
      throw e;
    }

    var config = instance.getWidgetConfiguration();

    // Try to load state, if not disabled
    checkAndLoadWidgetState(instance);

    var win = new CMWWindow(instance.getName());
    var container = win.getFrame();
    container.style.backgroundColor = "#ffffff";

    // Add a button to open help documentation if it is provided by the widget.
    if (config.helpText || config.helpPath) {
      let exteHelpContentUrl;
      if (config.helpPath) {
        exteHelpContentUrl = CATMAID.makeStaticURL(`html/doc/widgets/${config.helpPath}`);
      }
      DOM.addHelpButton(win, 'Help: ' + instance.getName(), config.helpText, exteHelpContentUrl);
    }

    // Widgets can announce they have filtering support
    if (config.filter) {
      DOM.addFilterControlsToggle(win, 'Filter: ' +
          instance.getName(), config.filter);
    }

    // Add skeleton source subscription toggle if selected
    var source = config.subscriptionSource;
    if (source) {
      if (source instanceof Array) {
        source.forEach(function(s) {
          addWidgetSourceToggle(win, s);
        });
      } else {
        addWidgetSourceToggle(win, source);
      }
    }

    // Create controls, if requested
    var controls;
    if (config.createControls) {
      controls = document.createElement("div");
      if (config.controlsID) {
        controls.setAttribute("id", config.controlsID);
      }
      controls.classList.add('windowpanel', 'buttonpanel');
      config.createControls.call(instance, controls);
      container.appendChild(controls);
      DOM.addButtonDisplayToggle(win);
    }

    // Create content, ID and createContent() are optional
    var content = createContainer(config.contentID, config.expandContent);
    if (config.class) {
      $(content).addClass(config.class);
    }
    if (CATMAID.tools.isFn(config.createContent)) {
      config.createContent.call(instance, content);
    }
    container.appendChild(content);

    // Add access to window settings
    addWindowConfigButton(win, instance);

    // Register to events
    var destroy = wrapSaveState(instance, instance.destroy);
    var resize = instance.resize ? instance.resize.bind(instance) : undefined;
    var focus = instance.focus ? instance.focus.bind(instance) : undefined;
    addListener(win, content, destroy, resize, focus);
    addLogic(win);

    if (CATMAID.tools.isFn(config.init)) {
      config.init.call(instance, win);
    }

    return {window: win, widget: instance};
  };

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function(options)
  {
    if ( !WEBGL.isWebGLAvailable() ) {
      throw new CATMAID.NoWebGLAvailableError("The 3D Viewer requires WebGL, but it is not available");
    }

    if (!options) options = { selectionTable: true };

    CATMAID.throwOnInsufficientWebGlContexts(1);

    // A selection table is opened alongside the 3D viewer. Initialize it first,
    // so that it will default to the last opened skeleton source to pull from
    // (which otherwise would be the 3D viewer).
    var selectionTable = options.selectionTable ? WindowMaker.create('selection-table') : null;

    var WA = new CATMAID.WebGLApplication();

    checkAndLoadWidgetState(WA);

    var win = new CMWWindow(WA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement( "div" );
    bar.id = "3d_viewer_buttons";
    bar.classList.add('windowpanel', 'buttonpanel');
    DOM.addFilterControlsToggle(win, 'Filter: ' +
        WA.getName(), {
          rules: WA.filterRules,
          update: WA.updateFilter.bind(WA)
        });
    DOM.addSourceControlsToggle(win, WA);
    DOM.addButtonDisplayToggle(win);
    addWindowConfigButton(win, WA);

    var tabs = DOM.addTabGroup(bar, WA.widgetID, ['Main', 'View', 'Shading',
        'Skeleton filters', 'View settings', 'Stacks', 'Shading parameters',
        'Animation', 'History', 'Export']);
    var o = WA.options;

    var select_source = CATMAID.skeletonListSources.createSelect(WA);

    DOM.appendToTab(tabs['Main'],
        [
          [document.createTextNode('From')],
          [select_source],
          ['Append', WA.loadSource.bind(WA)],
          ['Clear', WA.clear.bind(WA)],
          ['Refresh', WA.updateSkeletons.bind(WA)],
          [document.createTextNode(' - ')],
          ['Spatial select', WA.spatialSelect.bind(WA)],
          [document.createTextNode(' - ')],
          ['List connectors', WA.listConnectors.bind(WA)],
        ]);

    var storedViewsSelect = document.createElement('select');

    var connectorRestrictionsSl = document.createElement('select');
    connectorRestrictionsSl.options.add(new Option('All connectors', 'none', true, true));
    connectorRestrictionsSl.options.add(new Option('All shared connectors', 'all-shared'));
    connectorRestrictionsSl.options.add(new Option('All pre->post connectors', 'all-pre-post'));
    connectorRestrictionsSl.options.add(new Option('Group shared connectors', 'all-group-shared'));
    connectorRestrictionsSl.onchange = function () {
      WA.setConnectorRestriction(this.value);
    };
    var connectorRestrictions = document.createElement('label');
    connectorRestrictions.appendChild(document.createTextNode('Connector restriction'));
    connectorRestrictions.appendChild(connectorRestrictionsSl);

    let vrLabel = document.createElement('label');
    let vrCheckbox = document.createElement('input');
    vrCheckbox.type = 'checkbox';
    vrCheckbox.onclick = () => WA.webVRSetup(vrButton, vrCheckbox);
    vrLabel.appendChild(vrCheckbox);
    vrLabel.appendChild(document.createTextNode('VR'));
    let vrButton = document.createElement('button');
    vrButton.textContent = 'Enter';
    vrButton.disabled = true;
    let vrGroup = document.createElement('span');
    vrGroup.setAttribute('style', 'white-space:nowrap');
    vrGroup.appendChild(vrLabel);
    vrGroup.appendChild(vrButton);

    var viewControls = DOM.appendToTab(tabs['View'],
        [
          ['Center active', WA.look_at_active_node.bind(WA)],
          ['Follow active', o.follow_active, function() { WA.setFollowActive(this.checked); }, false],
          ['Update active',  o.update_active, function() { WA.setUpdateActive(this.checked); }, false],
          {
            type: 'button',
            label: 'Focus skeleton',
            title: 'Look at active skeleton\'s center of mass from current camera location',
            onclick: function() {
              let activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
              if (activeSkeletonId) {
                if (WA.hasSkeleton(activeSkeletonId)) {
                  WA.lookAtSkeleton(activeSkeletonId);
                } else {
                  CATMAID.warn('Active skeleton not loaded in 3D Viewer');
                }
              } else {
                CATMAID.warn('No skeleton selected!');
              }
            }
          },
          ['XY', WA.XYView.bind(WA)],
          ['XZ', WA.XZView.bind(WA)],
          ['ZY', WA.ZYView.bind(WA)],
          ['ZX', WA.ZXView.bind(WA)],
          [storedViewsSelect],
          ['Save view', storeView],
          ['Fullscreen', WA.fullscreenWebGL.bind(WA)],
          [vrGroup],
          [connectorRestrictions],
          ['Refresh active skeleton', function() { WA.updateActiveSkeleton(); }],
          ['Orthographic mode', false, function() { WA.updateCameraView(this.checked); }, false],
          ['Lock view', false, function() { WA.options.lock_view = this.checked;  }, false],
        ]);

    // Wait for the 3D viewer to have initialized to get existing views
    var initInterval = window.setInterval(function() {
      if (WA.initialized) {
        window.clearInterval(initInterval);
        updateAvailableViews();
      }
    }, 200);

    // Change view if the drop down is changed or clicked
    storedViewsSelect.onchange = function() {
      if (-1 === this.selectedIndex || 0 === WA.getStoredViews().length) {
        return;
      }
      var name = this.options[this.selectedIndex].value;
      WA.activateView(name);
      // Update orthographic view checkbox
      viewControls[11].checked = ('orthographic' === WA.options.camera_view);
    };
    storedViewsSelect.onclick = storedViewsSelect.onchange;
    // Update the list when the element is focused
    storedViewsSelect.onfocus = updateAvailableViews;

    function storeView()
    {
      WA.storeCurrentView(null, function() {
        updateAvailableViews();
        storedViewsSelect.selectedIndex = storedViewsSelect.options.length - 1;
      });
    }

    function updateAvailableViews()
    {
      // Get currently selected view
      var lastIdx = storedViewsSelect.selectedIndex;
      var lastView = -1 === lastIdx ? -1 : storedViewsSelect[lastIdx].value;
      // Re-populate the view
      $(storedViewsSelect).empty();
      var views = WA.getStoredViews();
      if (views.length > 0) {
        views.forEach(function(name, i) {
          storedViewsSelect.options.add(new Option(name, name));
        });
        // Select view that was selected before
        var newIndex = -1;
        for (var i=0; i<views.length; ++i) {
          var view = storedViewsSelect.options[i].value;
          if (view === lastView) {
            newIndex = i;
            break;
          }
        }
        storedViewsSelect.selectedIndex = newIndex;
      } else {
        storedViewsSelect.options.add(new Option("(None)", -1));
        storedViewsSelect.selectedIndex = 0;
      }
    }

    var shadingMenu = document.createElement('select');
    shadingMenu.setAttribute("id", "skeletons_shading" + WA.widgetID);
    [['none', 'None'],
     ['active_node_split', 'Active node split'],
     ['near_active_node', 'Near active node'],
     ['near_active_node_z_project', 'Near active node (Z only)'],
     ['near_active_node_z_camera', 'Near active node (camera plane)'],
     ['axon-and-dendrite', 'Axon and dendrite'],
     ['synapse-free', 'Synapse-free chunks'],
     ['downstream_amount', 'Downstream cable'],
     ['betweenness_centrality', 'Betweenness centrality'],
     ['slab_centrality', 'Slab centrality'],
     ['flow_centrality', 'Flow centrality'],
     ['centrifugal flow_centrality', 'Centrifugal flow centrality'],
     ['centripetal flow_centrality', 'Centripetal flow centrality'],
     ['dendritic-backbone', 'Dendritic backbone'],
     ['distance_to_root', 'Distance to root'],
     ['partitions', 'Principal branch length'],
     ['strahler', 'Strahler analysis'],
     ['single-strahler-number', 'Single Strahler number'],
     ['strahler-threshold', 'Strahler threshold'],
     ['downstream-of-tag', 'Downstream of tag'],
     ['sampler-domains', 'Reconstrucion sampler domains'],
     ['sampler-intervals', 'Reconstrucion sampler intervals']
    ].forEach(function(e) {
       var selected = o.shading_method === e[0];
       shadingMenu.options.add(new Option(e[1], e[0], selected, selected));
     });
    if (shadingMenu.selectedIndex === -1) {
        shadingMenu.selectedIndex = 0;
    }
    shadingMenu.onchange = WA.set_shading_method.bind(WA);

    var colorMenu = document.createElement('select');
    colorMenu.setAttribute('id', 'webglapp_color_menu' + WA.widgetID);
    [['none', 'Source'],
     ['creator', 'By Creator (all users)'],
     ['creator-relevant', 'By Creator (relevant users)'],
     ['all-reviewed', 'All Reviewed'],
     ['whitelist-reviewed', 'Team Reviewed'],
     ['own-reviewed', 'Own Reviewed'],
     ['last-reviewed', 'Last Reviewer'],
     ['axon-and-dendrite', 'Axon and dendrite'],
     ['x-lut', 'X Width rainbow'],
     ['y-lut', 'Y Height rainbow'],
     ['z-lut', 'Z Depth rainbow'],
     ['skeleton-x-lut', 'X Width rainbow per skeleton'],
     ['skeleton-y-lut', 'Y Height rainbow per skeleton'],
     ['skeleton-z-lut', 'Z Depth rainbow per skeleton'],
     ['sampler-domains', 'Reconstrucion sampler domains'],
     ['binary-sampler-intervals', 'Reconstrucion sampler intervals (2 colors)'],
     ['multicolor-sampler-intervals', 'Reconstrucion sampler intervals (11 colors)']
    ].forEach(function(e) {
       var selected = o.color_method === e[0];
       colorMenu.options.add(new Option(e[1], e[0], selected, selected));
    });
    if (colorMenu.selectedIndex === -1) {
      colorMenu.selectedIndex = 0;
    }
    colorMenu.onchange = WA.updateColorMethod.bind(WA, colorMenu);

    var synColors = document.createElement('select');
    [['Type: pre/red, post/cyan', 'cyan-red'],
     ['Type: pre/red, post/cyan (light background)', 'cyan-red-dark'],
     ['N with partner: pre[red > blue], post[yellow > cyan]', 'by-amount'],
     ['Synapse clusters', 'synapse-clustering'],
     ['Max. flow cut: axon (green) and dendrite (blue)', 'axon-and-dendrite'],
     ['Same as skeleton', 'skeleton'],
     ['Polyadicity', 'global-polyadicity'],
     ['Custom', 'custom']
    ].forEach(function(e, i) {
       var selected = o.connector_color === e[1];
       synColors.options.add(new Option(e[0], e[1], selected, selected));
    });
    if (synColors.selectedIndex === -1) {
      synColors.selectedIndex = 0;
    }
    synColors.onchange = WA.updateConnectorColors.bind(WA, synColors);

    DOM.appendToTab(tabs['Shading'],
        [
          [document.createTextNode('Shading: ')],
          [shadingMenu],
          [' Inv:', o.invert_shading, WA.toggleInvertShading.bind(WA), false],
          [document.createTextNode(' Color:')],
          [colorMenu],
          [' Interpolate:', o.interpolate_vertex_colots, function() {
            WA.setInterpolateVertexColors(this.checked);
          }, false],
          [document.createTextNode(' Synapse color:')],
          [synColors],
          {
            type: 'button',
            label: 'User colormap',
            title: 'Show usernames associated to used colors. Requires user-based coloring mode.',
            onclick: WA.toggleUserColormapDialog.bind(WA)
          }
        ]);

    var adjustFn = function(param_name) {
      return function() {
        WA.options[param_name] = this.checked;
        WA.adjustStaticContent();
      };
    };

    var updateLandmarkGroupColor = function(landmarkGroupId, rgb, alpha, colorChanged,
        alphaChanged, colorHex) {
      WA.setLandmarkGroupColor(landmarkGroupId,
          colorChanged ? ('#' + colorHex) : null,
          alphaChanged ? alpha : null);
    };

    var updateLandmarkGroupFaces = function(landmarkGroupId, e) {
      var facesVisible = e.target.checked;
      WA.setLandmarkGroupStyle(landmarkGroupId, "faces", facesVisible);
      // Stop propagation or the general landmark group list change handler is
      // called.
      e.stopPropagation();
    };

    var updateLandmarkGroupBb = function(landmarkGroupId, e) {
      var showBb = e.target.checked;
      WA.setLandmarkGroupBoundingBox(landmarkGroupId, showBb);
      // Stop propagation or the general volume list change handler is called.
      e.stopPropagation();
    };


    var updateLandmarkGroupText = function(landmarkGroupId, e) {
      var textVisible = e.target.checked;
      WA.setLandmarkGroupStyle(landmarkGroupId, "text", textVisible);
      // Stop propagation or the general landmark group list change handler is
      // called.
      e.stopPropagation();
    };

    var updatePointCloudColor = function(pointCloudId, rgb, alpha, colorChanged,
        alphaChanged, colorHex) {
      WA.setPointCloudColor(pointCloudId,
          colorChanged ? ('#' + colorHex) : null,
          alphaChanged ? alpha : null);
    };

    var updatePointCloudFaces = function(pointCloudId, e) {
      var facesVisible = e.target.checked;
      WA.setPointCloudStyle(pointCloudId, "faces", facesVisible);
      // Stop propagation or the general landmark group list change handler is
      // called.
      e.stopPropagation();
    };

    var updateVolumeColor = function(volumeId, rgb, alpha, colorChanged,
        alphaChanged, colorHex) {
      WA.setVolumeColor(volumeId,
          colorChanged ? ('#' + colorHex) : null,
          alphaChanged ? alpha : null);
    };

    var updateVolumeFaces = function(volumeId, e) {
      var facesVisible = e.target.checked;
      WA.setVolumeStyle(volumeId, facesVisible);
      // Stop propagation or the general volume list change handler is called.
      e.stopPropagation();
    };

    var updateVolumeSubiv = function(volumeId, smooth, subdivisions) {
      var subdiv = smooth ? (subdivisions === undefined ? 3 : subdivisions) : 0;
      WA.setVolumeSubdivisions(volumeId, subdiv);
    };

    var updateVolumeBb = function(volumeId, e) {
      var showBb = e.target.checked;
      WA.setVolumeBoundingBox(volumeId, showBb);
      // Stop propagation or the general volume list change handler is called.
      e.stopPropagation();
    };

    function setVolumeEntryVisible(li, volumeId, visible, faces, color, alpha,
        subdiv, bb) {
      // Add extra display controls for enabled volumes
      if (!li) {
        return;
      }
      if (visible) {
        var volumeControls = li.appendChild(document.createElement('span'));
        volumeControls.setAttribute('data-role', 'volume-controls');
        CATMAID.DOM.appendColorButton(volumeControls, 'c',
          'Change the color of this volume',
          undefined, undefined, {
            initialColor: color,
            initialAlpha: alpha,
            onColorChange: updateVolumeColor.bind(null, volumeId)
          });

        var facesCb = CATMAID.DOM.appendCheckbox(volumeControls, "Faces",
            "Whether faces should be displayed for this volume",
            faces, updateVolumeFaces.bind(null, volumeId));
        facesCb.style.display = 'inline';

        // Make sure a change signal is not propagated, otherwise the menu
        // closes.
        var subdivInput = CATMAID.DOM.createNumericField(undefined, ' ',
            "The number of subdivisions to use.", '3', undefined,
            (e) => {
              updateVolumeSubiv(volumeId, subdivCb.querySelector('input').checked, e.target.value);
              e.stopPropagation();
            },
            3, undefined, !!subdiv, 1, 0, undefined, undefined);

        var subdivCb = CATMAID.DOM.appendCheckbox(volumeControls, "Subdivide",
            "Whether meshes should be smoothed by subdivision",
            !!subdiv, (e) => {
              updateVolumeSubiv(volumeId, e.target.checked, parseInt(subdivInput.querySelector('input').value));
              // Stop propagation or the general volume list change handler is called.
              e.stopPropagation();
            });
        subdivCb.style.display = 'inline';
        volumeControls.appendChild(subdivInput);

        var bbCb = CATMAID.DOM.appendCheckbox(volumeControls, "BB",
            "Whether or not to show the bounding box of this mesh",
            !!bb, updateVolumeBb.bind(null, volumeId));
        bbCb.style.display = 'inline';
      } else {
        var volumeControls = li.querySelector('span[data-role=volume-controls]');
        if (volumeControls) {
          li.removeChild(volumeControls);
        }
      }
    }

    // Update landmark list
    var initLandmarkList = function() {
      return CATMAID.Landmarks.listGroups(project.id).then(function(json) {
          var landmarkGroups = json.sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          }).map(function(landmarkGroup) {
            return {
              title: landmarkGroup.name,
              value: landmarkGroup.id
            };
          });
          var selectedLandmarkGroups = WA.getLoadedLandmarkGroupIds();
          // Create actual element based on the returned data
          var node = DOM.createCheckboxSelect('Landmark groups', landmarkGroups,
              selectedLandmarkGroups, true);
          // Add a selection handler
          node.onchange = function(e) {
            var visible = e.target.checked;
            var landmarkGroupId = e.target.value;
            WA.showLandmarkGroup(landmarkGroupId, visible);

            // Add extra display controls for enabled volumes
            var li = e.target.closest('li');
            if (!li) {
              return;
            }
            if (visible) {
              var landmarkGroupControls = li.appendChild(document.createElement('span'));
              landmarkGroupControls.setAttribute('data-role', 'landmarkGroup-controls');
              CATMAID.DOM.appendColorButton(landmarkGroupControls, 'c',
                'Change the color of this landmark group',
                undefined, undefined, {
                  initialColor: o.landmarkgroup_color,
                  initialAlpha: o.landmarkgroup_opacity,
                  onColorChange: updateLandmarkGroupColor.bind(null, landmarkGroupId)
                });
              var facesCb = CATMAID.DOM.appendCheckbox(landmarkGroupControls, "Faces",
                  "Whether faces should be displayed for this landmark group",
                  o.landmarkgroup_faces, updateLandmarkGroupFaces.bind(null, landmarkGroupId));
              facesCb.style.display = 'inline';
              var namesCb = CATMAID.DOM.appendCheckbox(landmarkGroupControls, "Names",
                  "Whether landmark names should be displayed for this landmark group",
                  o.landmarkgroup_text, updateLandmarkGroupText.bind(null, landmarkGroupId));
              namesCb.style.display = 'inline';
              var bbCb = CATMAID.DOM.appendCheckbox(landmarkGroupControls, "BB",
                  "Whether or not to show the bounding box of this landmark group",
                  o.landmarkgroup_bb, updateLandmarkGroupBb.bind(null, landmarkGroupId));
              bbCb.style.display = 'inline';
            } else {
              var landmarkGroupControls = li.querySelector('span[data-role=landmarkGroup-controls]');
              if (landmarkGroupControls) {
                li.removeChild(landmarkGroupControls);
              }
            }
          };
          return node;
        });
    };

    // Update point cloud list
    var initPointCloudList = function() {
      return CATMAID.Pointcloud.listAll(project.id, true, false, 'name').then(function(json) {
          var pointClouds = json.map(function(pointCloud) {
            return {
              title: pointCloud.name + ' (' + pointCloud.id + ')',
              value: pointCloud.id
            };
          });
          var selectedPointClouds = WA.getLoadedPointCloudIds();
          // Create actual element based on the returned data
          var node = DOM.createCheckboxSelect('Point clouds', pointClouds,
              selectedPointClouds, true);
          // Add a selection handler
          node.onchange = function(e) {
            var visible = e.target.checked;
            var pointCloudId = e.target.value;
            WA.showPointCloud(pointCloudId, visible);

            // Add extra display controls for enabled volumes
            var li = e.target.closest('li');
            if (!li) {
              return;
            }
            if (visible) {
              var pointCloudControls = li.appendChild(document.createElement('span'));
              pointCloudControls.setAttribute('data-role', 'pointcloud-controls');
              CATMAID.DOM.appendColorButton(pointCloudControls, 'c',
                'Change the color of this point cloud',
                undefined, undefined, {
                  initialColor: o.landmarkgroup_color,
                  initialAlpha: o.landmarkgroup_opacity,
                  onColorChange: updatePointCloudColor.bind(null, pointCloudId)
                });
              var facesCb = CATMAID.DOM.appendCheckbox(pointCloudControls, "Faces",
                  "Whether faces should be displayed for this point cloud",
                  o.pointcloud_faces, updatePointCloudFaces.bind(null, pointCloudId));
              facesCb.style.display = 'inline';
            } else {
              var pointCloudControls = li.querySelector('span[data-role=pointcloud-controls]');
              if (pointCloudControls) {
                li.removeChild(pointCloudControls);
              }
            }
          };
          return node;
        });
    };

    // Create async selection and wrap it in container to have handle on initial
    // DOM location
    var volumeSelectionWrapper = CATMAID.createVolumeSelector({
      mode: "checkbox",
      selectedVolumeIds: WA.getLoadedVolumeIds(),
      select: function(volumeId, visible, element){
        WA.showVolume(volumeId, visible, undefined, undefined, o.meshes_faces)
          .catch(CATMAID.handleError);

        setVolumeEntryVisible(element.closest('li'), volumeId, visible,
            o.meshes_faces, o.meshes_color, o.meshes_opacity,
            o.meshes_subdiv, o.meshes_boundingbox);
      },
      rowCallback: function(row, id, visible) {
        let loadedVolume = WA.loadedVolumes.get(id);
        let faces, color, alpha, subdiv, bb;
        if (loadedVolume) {
          faces = loadedVolume.faces;
          color = loadedVolume.color;
          alpha = loadedVolume.opacity;
          subdiv = loadedVolume.subdiv;
          bb = loadedVolume.boundingBox;
        }
      }
    });

    // Create async selection and wrap it in container to have handle on initial
    // DOM location
    var landmarkGroupSelection = DOM.createAsyncPlaceholder(initLandmarkList());
    var landmarkGroupSelectionWrapper = document.createElement('span');
    landmarkGroupSelectionWrapper.appendChild(landmarkGroupSelection);

    // Create async selection and wrap it in container to have handle on initial
    // DOM location
    var pointCloudSelection = DOM.createAsyncPlaceholder(initPointCloudList());
    var pointCloudSelectionWrapper = document.createElement('span');
    pointCloudSelectionWrapper.appendChild(pointCloudSelection);

    // Replace volume selection wrapper children with new select
    var refreshVolumeList = function() {
      volumeSelectionWrapper.refresh(WA.getLoadedVolumeIds());
    };

    // Replace point cloud selection wrapper children with new select
    var refreshPointcloudList = function() {
      while (0 !== pointCloudSelectionWrapper.children.length) {
        pointCloudSelectionWrapper.removeChild(pointCloudSelectionWrapper.children[0]);
      }
      var pointcloudSelection = DOM.createAsyncPlaceholder(initPointCloudList());
      pointCloudSelectionWrapper.appendChild(pointcloudSelection);
    };

    DOM.appendToTab(tabs['View settings'],
        [
          [volumeSelectionWrapper],
          ['Faces ', o.meshes_faces, function() { WA.options.meshes_faces = this.checked;}, false],
          [WA.createMeshColorButton()],
          {
            type: 'checkbox',
            label: 'Pickable',
            title: 'Whether or not to include volumes when picking a location using Shift + Click',
            value: WA.options.volume_location_picking,
            onclick: function() {
              WA.options.volume_location_picking = this.checked;
            }
          },
          [landmarkGroupSelection],
          {
            type: 'numeric',
            label: 'Landmark scale',
            value: o.landmark_scale,
            length: 3,
            onchange: function() {
              let value  = parseInt(this.value, 10);
              if (value && !Number.isNaN(value)) {
                WA.options.landmark_scale = value;
                WA.adjustContent();
              }
            }
          },
          [pointCloudSelectionWrapper],
          {
            type: 'numeric',
            label: 'Point cloud scale',
            value: o.pointcloud_scale,
            length: 3,
            onchange: function() {
              let value  = parseInt(this.value, 10);
              if (value && !Number.isNaN(value)) {
                WA.options.pointcloud_scale = value;
                WA.adjustContent();
              }
            }
          },
          {
            type: 'numeric',
            label: 'Point cloud sample',
            value: o.pointcloud_sample * 100,
            length: 3,
            step: 1,
            min: 0,
            max: 100,
            onchange: function() {
              let value  = parseInt(this.value, 10);
              if (value && !Number.isNaN(value)) {
                WA.options.pointcloud_sample = value / 100.0;
                WA.adjustContent();
              }
            }
          },
          ['Active node', o.show_active_node, function() { WA.options.show_active_node = this.checked; WA.adjustContent(); }, false],
          ['Active node on top', o.active_node_on_top, function() { WA.options.active_node_on_top = this.checked; WA.adjustContent(); }, false],
          ['Radius adaptive active node', o.active_node_respects_radius, function() { WA.options.active_node_respects_radius = this.checked; WA.adjustContent(); }, false],
          {
            type: 'color-button',
            label: 'background',
            title: 'Adjust the background color',
            value: o.background_color,
            color: {
              initialColor: o.background_color,
              initialAlpha: 1.0,
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.options.background_color = '#' + colorHex;
                WA.adjustStaticContent();
              },
            },
            length: 10
          },
          ['Floor', o.show_floor, adjustFn('show_floor'), false],
          {
            type: 'color-button',
            label: 'color',
            title: 'Adjust the floor color',
            value: o.floor_color,
            color: {
              initialColor: o.floor_color,
              initialAlpha: 1.0,
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.options.floor_color = '#' + colorHex;
                WA.adjustStaticContent();
              },
            },
            length: 10
          },
          ['Axes', o.show_axes, function() { WA.setAxesVisibility(this.checked); }, false],
          ['Debug', o.debug, function() { WA.setDebug(this.checked); }, false],
          ['Line width', o.skeleton_line_width, null, function() { WA.updateSkeletonLineWidth(this.value); }, 4],
          {
            type: 'checkbox',
            label: 'Volumetric lines',
            value: o.triangulated_lines,
            onclick: function() {
              WA.options.triangulated_lines = this.checked;
              WA.reloadSkeletons(WA.getSelectedSkeletons());
            },
            title: 'If checked, lines will be rendered as triangle mesh, which allows more robust line width adjustment.'
          },
          {
            type: 'checkbox',
            label: 'Flat neuron material',
            value: o.neuron_material === 'basic',
            onclick: function() {
              WA.updateNeuronShading(this.checked ? 'basic' : 'lambert');
            },
            title: 'If checked, neurons will ignore light sources and appear "flat"'
          },
          {
            type: 'text',
            label: 'Custom Tags:',
            placeholder: 'Name or regex',
            title: 'Display handle spheres for nodes with tags matching this regex (must refresh 3D viewer after changing).',
            value: o.custom_tag_spheres_regex,
            onchange: function () { WA.options.custom_tag_spheres_regex = this.value; },
            length: 10
          },
          {
            type: 'color-button',
            label: 'color',
            title: 'Adjust the color of matched custom tags',
            value: o.custom_tag_spheres_color,
            color: {
              initialColor: o.custom_tag_spheres_color,
              initialAlpha: o.custom_tag_spheres_opacity,
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.updateCustomTagColor(colorChanged ? ('#' + colorHex) : null ,
                    alphaChanged ? alpha : null);
              },
            },
            length: 10
          },
          {
            type: 'checkbox',
            label: 'Native resolution',
            value: o.use_native_resolution,
            onclick: function() {
              WA.setNativeResolution(this.checked);
            },
            title: 'If checked, the native pixel resolution will be used. Improves quality on HiDPI displays.'
          },
          {
            type: 'checkbox',
            label: 'Show connector links',
            value: o.show_connector_links,
            onclick: function() {
              WA.setConnectorLinkVisibility(this.checked);
            },
            title: 'If checked, links between connectors and partner nodes will be visible.'
          },
          {
            type: 'checkbox',
            label: 'Show radius',
            value: o.show_radius,
            onclick: function() {
              WA.setRadiusVisibility(this.checked);
            },
            title: 'If checked, the node radii will be rendered as cylinders.'
          },
          {
            type: 'checkbox',
            label: 'Ortho scale bar',
            value: o.show_ortho_scale_bar,
            onclick: function() {
              WA.options.show_ortho_scale_bar = this.checked;
              WA.space.updateScaleBar();
            },
            title: 'If checked, a scale bar will be shown when in orthographic mode.'
          }
        ]);

    var nodeScalingInput = DOM.appendNumericField(tabs['View settings'],
        'Node handle scaling', 'Size of handle spheres for tagged nodes.',
        o.skeleton_node_scaling, null, function() {
              WA.options.skeleton_node_scaling = Math.max(0, parseInt(this.value, 10)) || 1.0;
              WA.adjustContent();
              WA.updateSkeletonNodeHandleScaling(this.value);
        }, 3, undefined, false, 10, 0);

    var linkNodeScalingInput = DOM.appendNumericField(tabs['View settings'],
        'Link site scaling', 'Size of handle spheres for nodes linked to connectors.',
        o.link_node_scaling, null, function() {
              WA.options.link_node_scaling = Math.max(0, parseInt(this.value, 10)) || 1.0;
              WA.adjustContent();
              WA.updateLinkNodeHandleScaling(this.value);
        }, 3, undefined, false, 10, 0);

    var textScalingInput = DOM.appendNumericField(tabs['View settings'],
        'Text scaling', 'Scaling of text.', o.text_scaling, null, function() {
              let value = parseInt(this.value, 10);
              WA.updateTextScaling(value);
        }, 3, undefined, false, 0.1, 0);

    DOM.appendToTab(tabs['Stacks'],
        [
          ['Bounding box', o.show_box, adjustFn('show_box'), false],
          ['Z plane', o.show_zplane, adjustFn('show_zplane'), false],
          {type: 'checkbox', label: 'with stack images', value: o.zplane_texture,
           onclick: adjustFn('zplane_texture'), title: 'If checked, images ' +
             'of the current section of the active stack will be displayed on a Z plane.'},
          {type: 'text', label: 'Z plane zoom level ', value: o.zplane_zoomlevel,
           title: 'The zoom-level to use (slider value in top toolbar) for image tiles ' +
           'in a Z plane. If set to "max", the highest zoom-level available will be ' +
           'which in turn means the worst resolution available.', length: 2,
           onchange: function() {
             WA.options.zplane_zoomlevel = ("max" === this.value) ? this.value :
                 Math.max(0, this.value);
             WA.adjustStaticContent();
            }},
          {type: 'numeric', label: 'Z plane opacity', value: o.zplane_opacity, length: 4,
            min: 0, max: 1, step: 0.1, title: 'The opacity of displayed Z planes', onchange: function(e) {
              var value = parseFloat(this.value);
              if (value) {
                WA.options.zplane_opacity = value;
                WA.adjustStaticContent();
              }
            }},
          {
            type: 'checkbox',
            label: 'Replace background color',
            value: o.zplane_replace_background,
            onclick: function() {
              WA.options.zplane_replace_background = this.checked;
              WA.adjustStaticContent();
              $(`#3d-viewier-zplane-min-bg-val-${WA.widgetID}`).prop('disabled', this.checked ? '' : 'disabled');
              $(`#3d-viewier-zplane-max-bg-val-${WA.widgetID}`).prop('disabled', this.checked ? '' : 'disabled');
              $(`#3d-viewier-zplane-new-bg-color-${WA.widgetID}`).prop('disabled', this.checked ? '' : 'disabled');
            },
            title: 'If enabled, the background color of displayed data will be replaced by a selectable color.'
          },
          {
            id: `3d-viewier-zplane-min-bg-val-${WA.widgetID}`,
            type: 'numeric', label: 'Min BG val', value: o.zplane_min_bg_val, length: 4,
            disabled: !o.zplane_replace_background,
            min: 0, max: 1, step: 0.1, title: 'Minimum value of background filter', onchange: function(e) {
              var value = parseFloat(this.value);
              if (value) {
                WA.options.zplane_min_bg_val = value;
                WA.adjustStaticContent();
              }
            }},
          {
            id: `3d-viewier-zplane-max-bg-val-${WA.widgetID}`,
            type: 'numeric', label: 'Max BG val', value: o.zplane_max_bg_val, length: 4,
            disabled: !o.zplane_replace_background,
            min: 0, max: 1, step: 0.1, title: 'Maximum value of background filter', onchange: function(e) {
              var value = parseFloat(this.value);
              if (value) {
                WA.options.zplane_max_bg_val = value;
                WA.adjustStaticContent();
              }
            }},
          {
            id: `3d-viewier-zplane-new-bg-color-${WA.widgetID}`,
            type: 'color-button',
            label: 'New background',
            title: 'The new background color replacing the old one',
            value: o.zplane_replacement_bg_color,
            disabled: !o.zplane_replace_background,
            color: {
              initialColor: o.zplane_replacement_bg_color,
              initialAlpha: 1.0,
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.options.zplane_replacement_bg_color = '#' + colorHex;
                WA.adjustStaticContent();
              },
            },
            length: 10
          },
          {type: 'checkbox', label: 'Data size check', value: o.zplane_size_check,
           onclick: adjustFn('zplane_size_check'), title: 'Whether to require user ' +
              'confirmation to load more than 100 MB of image data for the Z plane.'},
          ['Missing sections', o.show_missing_sections, adjustFn('show_missing_sections'), false],
          ['with height:', o.missing_section_height, ' %', function() {
              WA.options.missing_section_height = Math.max(0, Math.min(this.value, 100));
              WA.adjustStaticContent();
            }, 4]
        ]);

    DOM.appendToTab(tabs['Skeleton filters'],
        [
          ['Smooth', o.smooth_skeletons, function() { WA.options.smooth_skeletons = this.checked; WA.updateSkeletons(); }, false],
          ['with sigma', o.smooth_skeletons_sigma, ' nm', function() { WA.updateSmoothSkeletonsSigma(this.value); }, 10],
          ['Resample', o.resample_skeletons, function() { WA.options.resample_skeletons = this.checked; WA.updateSkeletons(); }, false],
          ['with delta', o.resampling_delta, ' nm', function() { WA.updateResampleDelta(this.value); }, 10],
          ['Lean mode (no synapses, no tags)', o.lean_mode, function() { WA.options.lean_mode = this.checked; WA.updateSkeletons();}, false],
          {
            type: 'checkbox',
            label: 'Interpolate locations',
            value: o.interpolate_sections,
            onclick: function() {
              WA.options.interpolate_sections = this.checked;
              WA.updateLocationFiltering();
              $('input#catmaid-3dviewer-interpolate-x-' + WA.widgetID + ',' +
                'input#catmaid-3dviewer-interpolate-y-' + WA.widgetID + ',' +
                'input#catmaid-3dviewer-interpolate-z-' + WA.widgetID + ',' +
                'input#catmaid-3dviewer-interpolate-xy-sections-' + WA.widgetID).prop('disabled', !this.checked);
            },
            title: 'If checked, nodes at the respective sections in the displayed reference stack are placed at an interpolated location'
          },
          {
            type: 'text',
            label: 'on sections',
            length: 5,
            value: o.interpolated_sections.join(', '),
            id: 'catmaid-3dviewer-interpolate-xy-sections-' + WA.widgetID,
            disabled: !o.interpolate_sections,
            onchange: function() {
              try {
                this.classList.remove('ui-state-error');
                WA.options.interpolated_sections = this.value.split(',').map(
                    function(s) {
                      s = s.trim();
                      if (s.length === 0) {
                        return s;
                      }
                      var val = parseInt(s, 10);
                      if (isNaN(val)) {
                        throw new CATMAID.ValueError("No number: " + s.trim());
                      }
                      return val;
                    });
                WA.updateLocationFiltering();
              } catch(e) {
                this.classList.add('ui-state-error');
              }
            },
            title: 'Specify a list of sections that should be used for interpolation'
          },
          {
            type: 'text',
            label: 'X',
            length: 5,
            value: o.interpolated_sections_x.join(", "),
            title: 'Sections at these X project coordinates in a ZY view will be interpolated',
            id: 'catmaid-3dviewer-interpolate-x-' + WA.widgetID,
            disabled: !o.interpolate_sections,
            onchange: function() {
              try {
                this.classList.remove('ui-state-error');
                WA.options.interpolated_sections_x = this.value.split(',').map(
                    function(s) {
                      s = s.trim();
                      if (s.length === 0) {
                        return s;
                      }
                      var val = parseInt(s, 10);
                      if (isNaN(val)) {
                        throw new CATMAID.ValueError("No number: " + s.trim());
                      }
                      return val;
                    });
                WA.updateLocationFiltering();
              } catch(e) {
                this.classList.add('ui-state-error');
              }
            }
          },
          {
            type: 'text',
            label: 'Y',
            length: 5,
            value: o.interpolated_sections_y.join(", "),
            title: 'Sections at these Y project coordinates in an XZ view will be interpolated',
            id: 'catmaid-3dviewer-interpolate-y-' + WA.widgetID,
            disabled: !o.interpolate_sections,
            onchange: function() {
              try {
                this.classList.remove('ui-state-error');
                WA.options.interpolated_sections_y = this.value.split(',').map(
                    function(s) {
                      s = s.trim();
                      if (s.length === 0) {
                        return s;
                      }
                      var val = parseInt(s, 10);
                      if (isNaN(val)) {
                        throw new CATMAID.ValueError("No number: " + s.trim());
                      }
                      return val;
                    });
                WA.updateLocationFiltering();
              } catch(e) {
                this.classList.add('ui-state-error');
              }
            }
          },
          {
            type: 'text',
            label: 'Z',
            length: 5,
            value: o.interpolated_sections_z.join(", "),
            title: 'Sections at these Z project coordinates in an XY view will be interpolated',
            id: 'catmaid-3dviewer-interpolate-z-' + WA.widgetID,
            disabled: !o.interpolate_sections,
            onchange: function() {
              try {
                this.classList.remove('ui-state-error');
                WA.options.interpolated_sections_z = this.value.split(',').map(
                    function(s) {
                      s = s.trim();
                      if (s.length === 0) {
                        return s;
                      }
                      var val = parseInt(s, 10);
                      if (isNaN(val)) {
                        throw new CATMAID.ValueError("No number: " + s.trim());
                      }
                      return val;
                    });
                WA.updateLocationFiltering();
              } catch(e) {
                this.classList.add('ui-state-error');
              }
            }
          },
          {
            type: 'checkbox',
            label: 'Interpolate broken sections',
            value: o.interpolate_broken_sections,
            onclick: function() {
              WA.options.interpolate_broken_sections = this.checked;
              WA.updateLocationFiltering();
            },
            title: 'If checked, nodes on broken sections of the reference stack are move to an interpolated location'
          },
          {
            type: 'checkbox',
            label: 'Apply node filters',
            value: o.apply_filter_rules,
            onclick: function() {
              var activeFiltersBefore = WA.getActivesNodeWhitelist() || [];
              WA.options.apply_filter_rules = this.checked;
              var activeFiltersAfer = WA.getActivesNodeWhitelist() || [];
              if (activeFiltersBefore.length !== activeFiltersAfer.length) {
                WA.updateSkeletons();
              }
            },
            title: 'If checked, nodes are filtered according to the filter rules (filter icon in top bar)'
          },
          {
            type: 'checkbox',
            label: 'Collapse "not a branch"',
            value: o.collapse_artifactual_branches,
            onclick: function() {
              WA.options.collapse_artifactual_branches = this.checked;
              WA.updateSkeletons();
            },
            title: 'If enabled, collapses artifactual branches that are marked with the tag "not a branch".'
          },
        ]);

    DOM.appendToTab(tabs['Shading parameters'],
        [
          ['Synapse clustering bandwidth', o.synapse_clustering_bandwidth, ' nm', function() { WA.updateSynapseClusteringBandwidth(this.value); }, 6],
          ['Near active node', o.distance_to_active_node, ' nm', function() {
            WA.updateActiveNodeNeighborhoodRadius(this.value); }, 6],
          ['Min. synapse-free cable', o.min_synapse_free_cable, ' nm', function() {
            WA.updateShadingParameter('min_synapse_free_cable', this.value, 'synapse-free'); }, 6],
          ['Strahler number', o.strahler_cut, '', function() { WA.updateShadingParameter('strahler_cut', this.value, ['dendritic-backbone', 'single-strahler-number', 'strahler-threshold']); }, 4],
          {
            type: 'text',
            label: 'Tag (regex):',
            value: o.tag_regex,
            onchange, function() {
              WA.updateShadingParameter('tag_regex', this.value, 'downstream-of-tag');
            },
            length: 4
          },
          {
            type: 'text',
            label: 'Sampler domain IDs',
            placeholder: '1, 2, …',
            title: 'If a sampler domain shading or coloring method is used, only these domains will be shown.',
            value: o.allowed_sampler_domain_ids.join(', '),
            onchange: function() {
              WA.options.allowed_sampler_domain_ids = this.value.split(',').filter(
                  function(s) {
                    s = s.trim();
                    return s.length > 0;
                  }).map(function(s) {
                    var val = parseInt(s, 10);
                    if (isNaN(val)) {
                      throw new CATMAID.ValueError("No number: " + s.trim());
                    }
                    return val;
                  });
              WA.updateSkeletonColors()
                .then(function() { WA.render(); });
            },
            length: 4,
          },
          {
            type: 'text',
            label: 'Sampler interval IDs',
            placeholder: '1, 2, …',
            title: 'If a sampler interval shading or coloring method is used, only these intervals will be shown.',
            value: o.allowed_sampler_interval_ids.join(', '),
            onchange: function() {
              WA.options.allowed_sampler_interval_ids = this.value.split(',').filter(
                  function(s) {
                    s = s.trim();
                    return s.length > 0;
                  }).map(function(s) {
                    var val = parseInt(s, 10);
                    if (isNaN(val)) {
                      throw new CATMAID.ValueError("No number: " + s.trim());
                    }
                    return val;
                  });
              WA.updateSkeletonColors()
                .then(function() { WA.render(); });
            },
            length: 4,
          },
          {
            type: 'color-button',
            label: 'Custom pre-color',
            title: 'The color used for presynaptic sites when custom connector coloring is selected.',
            color: {
              initialColor: WA.options.custom_connector_colors['presynaptic_to'],
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.options.custom_connector_colors['presynaptic_to'] = '#' + colorHex;
                if (WA.options.connector_color === 'custom') {
                  WA.updateConnectorColors();
                }
              }
            },
          },
          {
            type: 'color-button',
            label: 'Custom post-color',
            title: 'The color used for postsynaptic sites when custom connector coloring is selected.',
            color: {
              initialColor: WA.options.custom_connector_colors['postsynaptic_to'],
              onColorChange: function(rgb, alpha, colorChanged, alphaChanged, colorHex) {
                WA.options.custom_connector_colors['postsynaptic_to'] = '#' + colorHex;
                if (WA.options.connector_color === 'custom') {
                  WA.updateConnectorColors();
                }
              }
            },
          },
          {
            type: 'button',
            label: 'Polyadicity colors',
            title: 'Define colors for different polyadicity levels for synapses.',
            onclick: () => {
              WA.editConnectorPolyadicityColors();
            },
          },
        ]);

    var axisOptions = document.createElement('select');
    for (var axis in CATMAID.AnimationFactory.AxisTypes) {
      var label = CATMAID.AnimationFactory.AxisTypes[axis];
      axisOptions.options.add(new Option(label, axis));
    }
    axisOptions.onchange = function() {
      WA.options.animation_axis = this.value;
    };
    var axisOptionsLabel = document.createElement('label');
    axisOptionsLabel.appendChild(document.createTextNode('Rotation axis:'));
    axisOptionsLabel.appendChild(axisOptions);

    DOM.appendToTab(tabs['Animation'],
        [
          ['Play', function() {
            try {
              WA.createAnimation()
                .then(WA.startAnimation.bind(WA))
                .catch(CATMAID.handleError);
            } catch(e) {
              if (e instanceof CATMAID.ValueError) {
                CATMAID.msg("Error", e.message);
              } else {
                throw e;
              }
            }
          }],
          ['Stop', WA.stopAnimation.bind(WA)],
          [axisOptionsLabel],
          {
            type: 'numeric',
            label: 'Rotation time (sec)',
            value: o.animation_rotation_time,
            length: 4,
            min: 0,
            onchange: function() {
              let value = Number(this.value);
              if (!Number.isNaN(value)) {
                WA.options.animation_rotation_time = value;
              }
            },
          },
          {
            type: 'select',
            label: 'Neuron visibility:',
            entries: [
              {title: 'Show all immeditely', value: 'all'},
              {title: 'One per rotation', value: 'one-per-rotation'},
              {title: 'N per rotation', value: 'n-per-rotation'},
              {title: 'Explicit order', value: 'explicit-order'}
            ],
            title: 'Select a neuron visibility pattern that is applied ' +
                   'over the course of the animation.',
            value: o.animation_stepwise_visibility,
            onchange: function(e) {
              var type = this.value;
              if ('one-per-rotation' === type) {
                type = 'n-per-rotation';
                WA.setAnimationNeuronVisibility(type, {n: 1});
              } else if ('n-per-rotation' === type) {
                // Ask for n
                var dialog = new CATMAID.OptionsDialog("Visible skeletons");
                dialog.appendMessage('Please enter the number of skeletons ' +
                    'to make visible after one rotation.');
                var nSkeletonsPerRot = dialog.appendField('Show n skeletons per rotation ',
                   'show-n-skeletons-per-rot-' + WA.widgetID, 1, true);
                dialog.onOK = function() {
                  var options = {
                    n: Number(nSkeletonsPerRot.value)
                  };
                  WA.setAnimationNeuronVisibility(type, options);
                };
                dialog.show('auto', 'auto', true);
              } else if ('explicit-order' === type) {
                // Ask for order
                var dialog = new CATMAID.OptionsDialog("Visible skeletons");
                dialog.appendMessage('Please map a list of skleton IDs to ' +
                    'rotations after which they should be shown. This has ' +
                    'to follow the pattern "(0: id1); (1: id2, id3); (4: id4); ...". ' +
                    'Skeletons not referenced will not be shown.');
                var input = dialog.appendField('Pattern: ',
                    'visibility-pattern-' + WA.widgetID, '', true);
                dialog.onOK = function() {
                  // Remove all whitespace
                  var regex = /\((\d+):((?:\w+)(?:,\w+)*)\)/;
                  var rotations = input.value.replace(/\s+/g, '').split(';')
                    .reduce(function(o, rot) {
                      var matches = rot.match(regex);
                      if (matches && 3 === matches.length) {
                        o[matches[1]] = matches[2].split(',');
                      }
                      return o;
                    }, {});
                  var options = {
                    rotations: rotations
                  };
                  WA.setAnimationNeuronVisibility(type, options);
                };
                // Don't make this dialog modal so that skeleton IDs can be
                // copied from the UI.
                dialog.show(500, 'auto', false);
              }
            }
          },
          ['Back and forth', o.animation_back_forth, function() {
            WA.options.animation_back_forth = this.checked;
          }, false],
          {
            type: 'checkbox',
            label: 'Animate stack Z plane',
            value: o.animation_animate_z_plane,
            onclick: function() {
              WA.options.animation_animate_z_plane = this.checked;
              let changeFreqField = document.getElementById(
                  '3dviewer-animation-zplane-change-frequency-' + WA.widgetID);
              let changeStepField = document.getElementById(
                  '3dviewer-animation-zplane-change-step-' + WA.widgetID);
              if (changeFreqField) {
                if (this.checked) {
                  changeFreqField.removeAttribute('disabled');
                } else {
                  changeFreqField.setAttribute('disabled', 'disabled');
                }
              }
              if (changeStepField) {
                if (this.checked) {
                  changeStepField.removeAttribute('disabled');
                } else {
                  changeStepField.setAttribute('disabled', 'disabled');
                }
              }
            },
            title: 'If checked, the Z plane will be animated using the change frequency and step parameters.',
          },
          {
            type: 'numeric',
            label: 'Z plane changes/sec',
            id: '3dviewer-animation-zplane-change-frequency-' + WA.widgetID,
            value: o.animation_zplane_changes_per_sec,
            length: 3,
            min: 0,
            disabled: !o.animation_animate_z_plane,
            onchange: function() {
              let value = Number(this.value);
              if (!Number.isNaN(value)) {
                o.animation_zplane_changes_per_sec = value;
              }
            },
          },
          {
            type: 'numeric',
            label: 'Z plane change step',
            id: '3dviewer-animation-zplane-change-step-' + WA.widgetID,
            value: o.animation_zplane_change_step,
            length: 3,
            disabled: !o.animation_animate_z_plane,
            onchange: function() {
              let value = Math.floor(Number(this.value));
              if (!Number.isNaN(value)) {
                o.animation_zplane_change_step = value;
              }
              this.value = value;
            },
          },
        ]);

    var historyTimeDisplay = document.createElement('span');
    historyTimeDisplay.classList.add('right');

    var timeRangeRecorded = false;

    var storeTimeRange = document.createElement('label');
    storeTimeRange.setAttribute('title', 'If checked, start and end time of ' +
        'the current animation will be recorded into the respective text fields.');
    var storeTimeRangeCb = document.createElement('input');
    storeTimeRangeCb.setAttribute('type', 'checkbox');
    storeTimeRangeCb.value = !!o.animation_record_timerange;
    storeTimeRangeCb.onchange = function() {
      WA.options.animation_record_timerange = this.checked;
    };
    storeTimeRange.appendChild(storeTimeRangeCb);
    storeTimeRange.appendChild(document.createTextNode('Record start and end date'));

    var startDateField = CATMAID.DOM.createDateField(null, 'Start',
        'Set start date of the animation. If empty, oldest skeleton date is used.',
        '', false, function() {
          WA.options.animation_start_date = this.value.length > 0 ?
              new Date(Date.parse(this.value)) : null;
          timeRangeRecorded = false;
          storeTimeRangeCb.checked = false;
          WA.options.animation_record_timerange = false;
        }, null, 'YYYY-MM-DD hh:mm', true);

    var endDateField = CATMAID.DOM.createDateField(null, 'End',
        'Set end date of the animation. If empty, oldest skeleton date is used.',
        '', false, function() {
          WA.options.animation_end_date = this.value.length > 0 ?
              new Date(Date.parse(this.value)) : null;
          timeRangeRecorded = false;
          storeTimeRangeCb.checked = false;
          WA.options.animation_record_timerange = false;
        }, null, 'YYYY-MM-DD hh:mm', true);

    var animationFinished = false;
    var animationPaused = false;
    var sliderInitialized = false;
    var timeSliderTimeout = null;
    var historyPauseOptions = {
      emptyBoutLength: null,
      noCache: true
    };

    var timeSliderUpdate = function(val) {
      window.clearTimeout(timeSliderTimeout);
      timeSliderTimeout = null;
      if (WA.animation) {
        animationFinished = false;
        WA.stopAnimation(true);
        var time = Math.round(val / WA.options.animation_hours_per_tick);
        WA.renderAnimation(WA.animation, time, true, historyPauseOptions);
      }
    };
    var timeSliderDelayedUpdate = function(val) {
      if (timeSliderTimeout) {
          window.clearTimeout(timeSliderTimeout);
      }
      timeSliderTimeout = window.setTimeout(timeSliderDelayedUpdate, 50);
    };
    var timeSlider = new CATMAID.Slider(CATMAID.Slider.HORIZONTAL,
        false, 0, 10, 100, 0, timeSliderUpdate, undefined, false, false);
    var timeSliderLabel = document.createElement('label');
    timeSliderLabel.appendChild(document.createTextNode('Time'));
    timeSliderLabel.appendChild(timeSlider.getView());

    var stopAnimation = function() {
      WA.stopAnimation();
      timeRangeRecorded = false;
      sliderInitialized = false;
      animationPaused = false;
    };
    var pauseAnimation = function() {
      WA.stopAnimation(true);
      animationPaused = true;
    };
    var startAnimation = function() {
      if (animationFinished) {
        animationPaused = false;
      }
      if (animationPaused) {
        animationPaused = false;
        WA.startAnimation(WA.animation, WA.animationTime);
        return;
      }
      try {
        var options = {
          notify: function(currentDate, startDate, endDate) {
            // Update time display and if the end is reached, stop animation
            if (currentDate > endDate) {
              animationFinished = true;
              pauseAnimation();
            } else {
              historyTimeDisplay.textContent = currentDate.toString();
            }

            // Record time if requested
            if (WA.options.animation_record_timerange && !timeRangeRecorded) {
              WA.options.animation_start_date = startDate;
              WA.options.animation_end_date = endDate;
              $('input',
              startDateField).val(startDate.toISOString()
                  .replace(/\..*$/, '').replace(/T/, ' ').replace(/:\d\d$/, ''));
              $('input', endDateField).val(endDate.toISOString()
                  .replace(/\..*$/, '').replace(/T/, ' ').replace(/:\d\d$/, ''));
              timeRangeRecorded = true;
            }

            // Init time slider, if not already done
            if (!sliderInitialized) {
              var epochTotalDiff = endDate.getTime() - startDate.getTime();
              var hourTotalDiff = Number((epochTotalDiff / 1000 / 60 / 60).toFixed(1));
              timeSlider.update(0, hourTotalDiff, 100, 0, timeSliderUpdate);
              sliderInitialized = true;
            }

            // Set time slider value to current hour since start
            var epochDiff = currentDate.getTime() - startDate.getTime();
            var hourDiff = Number((epochDiff / 1000 / 60 / 60).toFixed(1));
            timeSlider.setByValue(hourDiff, true);
          }
        };
        WA.createAnimation('history', options)
          .then(WA.startAnimation.bind(WA))
          .catch(CATMAID.handleError);
      } catch(e) {
        if (e instanceof CATMAID.ValueError) {
          CATMAID.msg("Error", e.message);
        } else {
          throw e;
        }
      }
    };

    DOM.appendToTab(tabs['History'],
        [
          ['Play', startAnimation],
          ['Stop', function() {
            stopAnimation();
            historyTimeDisplay.textContent = "";
          }],
          ['Pause', function() {
            pauseAnimation();
          }],
          ['Reset', function() {
            stopAnimation();
            animationPaused = false;
            animationFinished = false;
            historyTimeDisplay.textContent = "";
            if (!WA.options.animation_history_reset_after_stop) {
              WA.reloadSkeletons(WA.getSelectedSkeletons());
            }
            timeSlider.setByValue(0, true);
          }],
          [timeSliderLabel],
          ['Hours per tick', o.animation_hours_per_tick, '', function() {
            WA.options.animation_hours_per_tick = parseFloat(this.value);
           }, 5],
          {
            type: 'numeric',
            label: 'Empty bout length',
            title: 'If set, empty bouts exceeding more minutes than this, will be skipped.',
            value: o.animation_history_empy_bout_length || '',
            onchange: function() {
              WA.options.animation_history_empy_bout_length = 0 === this.value.length ?
                  null : Number(this.value);
            },
            length: 4,
            placeholder: 'minutes'
          },
          [historyTimeDisplay],
          [startDateField],
          [endDateField],
          [storeTimeRange],
          {
            type: 'checkbox',
            label: 'Include merges',
            value: o.animation_history_include_merges,
            onclick: function() {
              WA.options.animation_history_include_merges = this.checked;
            },
            title: 'If checked, history of merged in arbors will also be shown for a skeleton'
          },
          {
            type: 'checkbox',
            label: 'Reset after animation',
            value: o.animation_history_reset_after_stop,
            onclick: function() {
              WA.options.animation_history_reset_after_stop = this.checked;
            },
            title: 'If checked, all skeletons will be reset to their original state once the animation stops.'
          }
        ]);

    DOM.appendToTab(tabs['Export'],
        [
          ['PNG', WA.exportPNG.bind(WA)],
          ['SVG', WA.exportSVG.bind(WA)],
          ['Catalog SVG', WA.exportCatalogSVG.bind(WA)],
          ['Skeletons as CSV', WA.exportSkeletonsAsCSV.bind(WA)],
          ['Neuron names', WA.exportNames.bind(WA)],
          ['Connectors as CSV', WA.exportConnectorsAsCSV.bind(WA)],
          ['Synapses as CSV', WA.exportSynapsesAsCSV.bind(WA)],
          ['Synapse count CSV', WA.countObjects.bind(WA)],
          ['Animation', WA.exportAnimation.bind(WA)],
          ['Skeletons as OBJ', function() {
            // Export visible skeletons
            let visibleSkeletons = WA.getSelectedSkeletons();
            WA.exportObj(visibleSkeletons);
          }]
        ]);

    content.appendChild( bar );

    $(bar).tabs();

    var container = createContainer("view_in_3d_webgl_widget" + WA.widgetID, true);
    container.classList.add('expand');
    content.appendChild(container);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas" + WA.widgetID);
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);

    var scaleBar = document.createElement('div');
    canvas.appendChild(scaleBar);

    var axes = document.createElement('div');
    axes.classList.add('axes-3d-viewer');
    canvas.appendChild(axes);

    // Add window to DOM, init WebGLView (requires element in DOM) and
    // create a staging list. The listeners are added last to prevent
    // the execution of the RESIZE handler before the canvas is
    // initialized.
    addLogic(win);
    WA.init( 800, 600, canvas );

    WA.adjustStaticContent();

    // Since the initialization can potentially change the node scaling, the is
    // updated here explicitly. At some point we might want to have some sort of
    // observer for this.
    nodeScalingInput.value = WA.options.skeleton_node_scaling;
    linkNodeScalingInput.value = WA.options.link_node_scaling;

    // Arrange previously created selection table below 3D viewer. To do this,
    // the Selection Table has to be moved out of its split node and moved into
    // a new one that is shared with the 3D viewer.
    if (selectionTable) {
      var webglSplitNode = win.getParent();
      var webglSibling = webglSplitNode.getSiblingOf(win);
      webglSplitNode.removeResizeHandle();
      webglSplitNode.getParent().replaceChild(webglSibling, webglSplitNode);

      // Make sibling expand over all available space
      var siblingFrame = webglSibling.getFrame();
      siblingFrame.style.top = "0px";
      siblingFrame.style.left = "0px";
      siblingFrame.style.width = "";
      siblingFrame.style.height = "";

      // create new split node with selection table below 3D viewer
      var stWin = selectionTable.window;
      stWin.getParent().replaceChild(new CMWVSplitNode(win, stWin), stWin);
      stWin.getRootNode().redraw();
    }

    CATMAID.Volumes.on(CATMAID.Volumes.EVENT_VOLUME_ADDED,
        refreshVolumeList, WA);
    CATMAID.Pointcloud.on(CATMAID.Pointcloud.EVENT_POINTCLOUD_ADDED,
        refreshPointcloudList, WA);
    CATMAID.Pointcloud.on(CATMAID.Pointcloud.EVENT_POINTCLOUD_DELETED,
        refreshPointcloudList, WA);

    // Clear listeners that were added above
    var unregisterUIListeners = function() {
      CATMAID.Volumes.off(CATMAID.Volumes.EVENT_VOLUME_ADDED,
          refreshVolumeList, WA);
      CATMAID.Pointcloud.off(CATMAID.Pointcloud.EVENT_POINTCLOUD_ADDED,
          refreshPointcloudList, WA);
      CATMAID.Pointcloud.off(CATMAID.Pointcloud.EVENT_POINTCLOUD_DELETED,
          refreshPointcloudList, WA);
    };

    var destroy = wrapSaveState(WA, WA.destroy);
    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof project === undefined || project === null) {
              CATMAID.rootWindow.close();
              document.getElementById("content").style.display = "none";
            }
            else {
              // Remove from listing
              windows.forEach(function (widgetWindows, widgetName) {
                widgetWindows.delete(win);
                if (widgetWindows.size === 0) {
                  windows.delete(widgetName);
                }
              });
              unregisterUIListeners();
              destroy();
            }
            break;
          case CMWWindow.RESIZE:
            var frame = win.getFrame();
            var w = win.getAvailableWidth();
            var h = win.getContentHeight() - bar.offsetHeight;
            container.style.width = w + "px";
            container.style.height = h + "px";
            WA.resizeView( w, h );
            // Update the container height to account for the table-div having been resized
            // TODO
            break;
        }
        return true;
      });

    // Resize WebGLView after staging list has been added
    win.callListeners( CMWWindow.RESIZE );

    if (selectionTable) {
      // Make selection table smaller so that it only occupies about 25% of the
      // available vertical space (instead of 50%).
      win.getParent().changeHeight(Math.abs(win.getHeight() * 0.5));

      // Now that a Selection Table exists, have the 3D viewer subscribe to it and
      // make it ignore local models. Don't make it selection based, to not reload
      // skeletons on visibility changes.
      var Subscription = CATMAID.SkeletonSourceSubscription;
      WA.addSubscription(new Subscription(selectionTable.widget, true, false,
            CATMAID.SkeletonSource.UNION, Subscription.ALL_EVENTS), true);
      // Override existing local models if subscriptions are updated
      WA.ignoreLocal = true;
    }

    return {window: win, widget: WA};
  };

  var createConnectivityGraphPlot = function(instance) {
    var GP = instance ? instance : new CATMAID.ConnectivityGraphPlot();

    var win = new CMWWindow(GP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'connectivity_graph_plot_buttons' + GP.widgetID);
    buttons.classList.add('windowpanel', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);
    addWindowConfigButton(win, GP);

    var xml = document.createElement('input');
    xml.setAttribute("type", "button");
    xml.setAttribute("value", "Export SVG");
    xml.onclick = GP.exportSVG.bind(GP);
    buttons.appendChild(xml);

    content.appendChild(buttons);

    var container = createContainer('connectivity_graph_plot_div' + GP.widgetID, true);
    content.appendChild(container);

    var plot = document.createElement('div');
    plot.setAttribute('id', 'connectivity_graph_plot' + GP.widgetID);
    plot.style.width = "100%";
    plot.style.height = "100%";
    plot.style.backgroundColor = "#FFFFFF";
    container.appendChild(plot);

    addListener(win, container, GP.destroy.bind(GP), GP.resize.bind(GP));

    addLogic(win);

    return {window: win, widget: GP};
  };

  var createOntologySearchWidget = function(osInstance)
  {
    // If available, a new instance passed as parameter will be used.
    var OS = osInstance ? osInstance : new CATMAID.OntologySearch();
    var win = new CMWWindow(OS.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";
    addWindowConfigButton(win, OS);

    var container = createContainer("ontology-search" + OS.widgetID);
    container.classList.add('ontology_search');

    // Add container to DOM
    content.appendChild(container);

    // Wire it up.
    addListener(win, container, OS.destroy.bind(OS));
    addLogic(win);

    // Let the ontology search initialize the interface within the created
    // container.
    OS.init_ui(container);

    return {window: win, widget: OS};
  };

  var getHelpForActions = function(actions)
  {
    var action, keys, i, k, result = '<dl class="keyboardShortcuts">';
    for( i = 0; i < actions.length; ++i ) {
      action = actions[i];
      keys = action.getKeys();
      for( k in keys ) {
        result += '<div class="help-item"><dt><kbd>' + k + '</kbd></dt><dd>' + action.getHelpText() + '</dd></div>';
      }
    }
    return result + '</dl>';
  };

  this.setKeyShortcuts = function(win)
  {
    var actions, action, i, tool, content, container;

    // If a window hasn't been passed in, look it up.
    if (typeof win == 'undefined') {
      win = windows['keyboard-shortcuts'];
      if (!win) {
        return;
      }
    }

    content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    container = document.getElementById("keyboard-shortcuts-window");
    if (!container) {
      container = createContainer("keyboard-shortcuts-window");
      content.appendChild( container );
    }

    var mainContent = document.createElement('div');

    var searchForm = document.createElement('form');
    searchForm.setAttribute('data-role', 'filter');
    searchForm.style.marginTop="1em";

    var searchInput = document.createElement('input');
    searchInput.setAttribute('type', 'text');
    searchInput.setAttribute('data-role', 'filter');
    searchInput.setAttribute('placeholder', 'Filter');
    searchInput.onkeyup = function() {
      // Filter content
      if (this.value.length === 0) {
        $('div[data-content=doc]').show();
        $('div.help-item', mainContent).show();
        $('li', mainContent).show();
      } else {
        $('div[data-content=doc]').hide();
        $('div.help-item dd:icontainsnot(' + this.value + ')', mainContent).closest('div').hide();
        $('div.help-item dd:icontains(' + this.value + ')', mainContent).closest('div').show();
        $('li:icontainsnot(' + this.value + ')').hide();
        $('li:icontains(' + this.value + ')').show();
      }
    };
    searchForm.appendChild(searchInput);

    var htmlComponents = ['<p id="keyShortcutsText">',
      '<div data-content="doc"><h4>Documentation</h4>',
      '<a href="' + CATMAID.makeDocURL('/') + '" target="_blank">',
      'General documentation for CATMAID release ' + CATMAID.getVersionRelease(),
      '</a><br />',
      '<a href="' + CATMAID.makeChangelogURL() + '" target="_blank">',
      'Changelog for CATMAID release ' + CATMAID.getVersionRelease(),
      '</a></div>',
      '<h4>Global Key Help</h4>'];

    actions = project.getActions();
    htmlComponents.push(getHelpForActions(actions));

    tool = project.getTool();
    if (tool) {
      if (tool.hasOwnProperty('getMouseHelp')) {

        htmlComponents.push('<h4>Tool-specific Mouse Help</h4>',
            tool.getMouseHelp());
      }

      if (tool.hasOwnProperty('getActions')) {
        htmlComponents.push('<h4>Tool-specific Key Help</h4>',
            getHelpForActions(tool.getActions()));
      }

      if (tool.hasOwnProperty('getUndoHelp')) {
        htmlComponents.push('<h4>Undo help</h4>',
            tool.getUndoHelp());
      }

    }
    htmlComponents.push('</p>');

    var html = htmlComponents.join('');

    // If on Mac OS, replace all occurences of 'Ctrl' with '⌘'
    if ('MAC' === CATMAID.tools.getOS()) {
      html = html.replace(/Ctrl/gi, '⌘');
    }

    mainContent.innerHTML = html;
    container.append(searchForm);
    container.append(mainContent);
    return container;
  };

  var createKeyboardShortcutsWindow = function()
  {
    var win = new CMWWindow( "Keyboard Shortcuts" );
    var container = self.setKeyShortcuts(win);

    $(container)
      .append($('<h4 />').text('Contributors'))
      .append('CATMAID &copy;&nbsp;2007&ndash;2018 ' +
          '<a href="http://fly.mpi-cbg.de/~saalfeld/">Stephan Saalfeld</a>, ' +
          '<a href="http://www.unidesign.ch/">Stephan Gerhard</a>, ' +
          '<a href="http://longair.net/mark/">Mark Longair</a>, ' +
          '<a href="http://albert.rierol.net/">Albert Cardona</a>, ' +
          '<a href="https://github.com/tomka">Tom Kazimiers</a> and ' +
          '<a href="https://github.com/aschampion">Andrew Champion</a>.<br /><br />' +
          'Funded by <a href="http://www.mpi-cbg.de/research/research-groups/pavel-tomancak.html">' +
          'Pavel Toman&#x010d;&aacute;k</a>, MPI-CBG, Dresden, Germany and ' +
          '<a href="http://albert.rierol.net/">Albert Cardona</a>, ' +
          'HHMI Janelia Research Campus, U.S..<br /><br />' +
          'Visit the <a href="http://www.catmaid.org/" target="_blank">' +
          'CATMAID homepage</a> for further information. You can find the ' +
          'source code on <a href="https://github.com/catmaid/CATMAID">' +
          'GitHub</a>, where you can also <a href="https://github.com/catmaid/CATMAID/issues">' +
          'report</a> bugs and problems.');

    addListener(win, container);

    addLogic(win);

    return {window: win, widget: null};
  };

  var createNeuronNavigatorWindow = function(new_nn_instance)
  {
    // If available, a new instance passed as parameter will be used.
    var NN = new_nn_instance ? new_nn_instance : new CATMAID.NeuronNavigator();
    var win = new CMWWindow(NN.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";
    addWindowConfigButton(win, NN);

    var container = createContainer("neuron-navigator" + NN.widgetID, true);
    container.classList.add('navigator_widget');

    // Add container to DOM
    content.appendChild(container);

    // Wire it up.
    addListener(win, container, NN.destroy.bind(NN));
    addLogic(win);

    // Let the navigator initialize the interface within
    // the created container.
    NN.init_ui(container, new_nn_instance === undefined);

    return {window: win, widget: NN};
  };

  var createHtmlWindow = function (params) {
    var win = new CMWWindow(params.title);
    var content = win.getFrame();
    var container = createContainer(undefined, true);
    content.appendChild(container);
    content.style.backgroundColor = "#ffffff";
    content.classList.add('html-window');

    addListener(win, container);
    addLogic(win);

    container.innerHTML = params.html;

    return {window: win, widget: null};
  };

  var creators = {
    "keyboard-shortcuts": {
      name: 'Keyboard Shortcuts',
      description: 'A tool specific list of keyboard shortcuts',
      init: createKeyboardShortcutsWindow
    },
    "3d-viewer": {
      name: '3D Viewer',
      description: 'Visualize neurons, synapses and image data in 3D',
      init: create3dWebGLWindow
    },
    "connectivity-graph-plot": {
      name: 'Connectivity Graph Plot',
      description: 'Plot # of upstream/downstream partners over synapse count',
      init: createConnectivityGraphPlot
    },
    "ontology-search": {
      name: 'Ontology Search',
      description: 'Search for elements of the symantic space',
      init: createOntologySearchWidget
    },
    "neuron-navigator": {
      name: 'Neuron Navigator',
      description: 'Traverse and constrain neuron, user and annotation networks',
      init: createNeuronNavigatorWindow
    },
    "html": {
      name: 'HTML Widget',
      description: 'A generic HTML widget',
      init: createHtmlWindow,
      hidden: true,
    },
  };

  /** If the window for the given name is already showing, just focus it.
   * Otherwise, create it new. */
  this.show = function(name, params)
  {
    if (creators.hasOwnProperty(name)) {
      if (windows.has(name)) {
        var instances = windows.get(name);
        var win = instances.keys().next().value;
        win.focus();
        return {
          window: win,
          widget: instances.get(win)
        };
      } else {
        var handles = creators[name].init(params);
        windows.set(name, new Map([[handles.window, handles.widget]]));
        return handles;
      }
    } else {
      CATMAID.error("No known window with name " + name);
    }
  };

  /**
   * Retrieve a map from window objects to widget instances for all open widget
   * windows of a given name.
   * @param  {string}  name   Name of the widget window to search for.
   * @param  {boolean} create Whether to create a new widget if none is open.
   * @param  {Object}  params Parameters with which to create the window.
   * @param  {Boolean} silent (optional) Wheter to drop all error messages.
   * @return {Map}            Map of window objects to widget instances.
   */
  this.getOpenWindows = function (name, create, params, silent) {
    if (creators.hasOwnProperty(name)) {
      if (windows.has(name)) {
        var instances = windows.get(name);
        return new Map(instances);
      } else if (create) {
        var handles = creators[name].init(params);
        handles = new Map([[handles.window, handles.widget]]);
        windows.set(name, handles);
        return new Map(handles);
      } else {
        return new Map();
      }
    } else if (!silent) {
      CATMAID.error("No known window with name " + name);
    }
  };

  /** Always create a new instance of the widget. The caller is allowed to hand
   * in extra parameters that will be passed on to the actual creator method. */
  this.create = function(name, options, isInstance) {
    if (creators.hasOwnProperty(name)) {
      try {
        var handles = creators[name].init(options, isInstance);
        if (windows.has(name)) {
          windows.get(name).set(handles.window, handles.widget);
        } else {
          windows.set(name, new Map([[handles.window, handles.widget]]));
        }

        return handles;
      } catch (e) {
        if (e instanceof CATMAID.TooManyWebGlContextsError) {
          CATMAID.handleError(e);
        } else {
          throw e;
        }
      }
    } else {
      CATMAID.error("No known window with name " + name);
    }
  };

  /**
   * Return the widget instance, if any, associated with the focused window if
   * it was created through WindowMaker.
   * @return {object} The widget instance associated with the focused window, or
   *                  null if none.
   */
  this.getFocusedWindowWidget = function () {
    var focusedWidget = null;
    windows.forEach(function (widgetWindows) {
      widgetWindows.forEach(function (widget, window) {
        if (window.hasFocus()) {
          focusedWidget = widget;
        }
      });
    });
    return focusedWidget;
  };

  var saveStateManager = function(type, key, options) {
    if (stateManagers.has(type)) {
      throw new CATMAID.ValueError("State manager for type " + options.type + " already present");
    }
    stateManagers.set(type, {
      type: type,
      key: options.key || key,
      getState: options.getState,
      setState: options.setState
    });
  };

  /**
   * Allow new widgets to register with a window maker.
   */
  this.registerWidget = function(key, creator, replace, stateManager, options) {
    if (key in creators && !replace) {
      throw new CATMAID.ValueError("A widget with the following key is " +
          "already registered: " + key);
    }
    if (!CATMAID.tools.isFn(creator)) {
      throw new CATMAID.ValueError("No valid constructor function provided");
    }

    if (stateManager) {
      saveStateManager(creator, key, stateManager);
    }

    creators[key] = {
      init: function(options, isInstance) {
        instance = isInstance ? options : new creator(options);
        return createWidget(instance);
      },
      name: options.name || key,
      description: options.description || ''
    };

    if (options.websocketHandlers) {
      for (var msgName in options.websocketHandlers) {
        if (CATMAID.Client.messageHandlers.has(msgName) && !replace) {
          throw new CATMAID.ValueError("A handler for message '" + msgName +
              "' is already registered");
        }
        CATMAID.Client.messageHandlers.set(msgName, options.websocketHandlers[msgName]);
      }
    }
  };

  this.registerState = function(type, options) {
    if (!type) {
      throw new CATMAID.ValueError("Need type for state management");
    }
    if (!options.key) {
      throw new CATMAID.ValueError("Need key for state management");
    }
    if (!CATMAID.tools.isFn(options.getState)) {
      throw new CATMAID.ValueError("Need getState() function for state management");
    }
    if (!CATMAID.tools.isFn(options.setState)) {
      throw new CATMAID.ValueError("Need setState() function for state management");
    }

    saveStateManager(type, options.key, options);
  };

  /**
   *  * Get a list of all available widget names.
   *   */
  this.getAvailableWidgetNames = function() {
      return Object.keys(creators);
  };

  /**
   * Get a copy of the descriptions of a registered widget.
   */
  this.getWidgetDescription = function(widgetKey) {
     return $.extend(true, {}, creators[widgetKey]);
  };

  /**
   * Return a widget and its key for the passed in window if no widget is known
   * for the window.
   */
  this.getWidgetKeyForWindow = function(win) {
    for (let key of windows.keys()) {
      let widgetInfo = windows.get(key);
      if (widgetInfo && widgetInfo.has(win)) {
        return {
          widget: widgetInfo.get(win),
          key: key
        };
      }
    }
    return null;
  };

  function windowIsStackViewer(stackViewers, win) {
    for (var i=0; i<stackViewers.length; ++i) {
      var stackViewer = stackViewers[i];
      if (stackViewer._stackWindow === win) {
        return true;
      }
    }
    return false;
  }

  /**
   * Close all widget, leave only passed in stack viewers open.
   */
  this.closeAllButStackViewers = function(stackViewers) {
    var allWindows = CATMAID.rootWindow.getWindows();
    while (allWindows.length > 0) {
      var win = allWindows.pop();
      if (!windowIsStackViewer(stackViewers, win)) {
        win.close();
      }
    }
  };

}();


(function(CATMAID) {

  "use strict";

  CATMAID.front = WindowMaker.getFocusedWindowWidget;

  /**
   * Make new widgets available under the given unique key, optionally replacing
   * existing widgets.
   */
  CATMAID.registerWidget = function(options) {
    WindowMaker.registerWidget(options.key, options.creator, options.replace, options.state, options);
  };

  /**
   * Register a state provider and target for a particular widget type, can also
   * used through registerWidget().
   */
  CATMAID.registerState = function(type, options) {
    WindowMaker.registerState(type, options);
  };

  CATMAID.WindowMaker = WindowMaker;

})(CATMAID);
