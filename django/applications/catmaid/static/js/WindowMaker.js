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

  var createContainer = function(id) {
    var container = document.createElement("div");
    if (id) {
      container.setAttribute("id", id);
    }
    container.setAttribute("class", "windowContent");
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
   * panel. If a button panel ID or element is provided, its height is
   * substracted from the window content height.
   */
  var getWindowContentHeight = function(win, buttonPanel) {
    var height = win.getContentHeight();
    if (buttonPanel !== undefined) {
      var $bar = typeof(buttonPanel) === "string" ? $('#' + buttonPanel) : $(buttonPanel);
      height = height - ($bar.is(':visible') ? $bar.height() : 0);
    }
    return height;
  };

  var addListener = function(win, container, button_bar, destroy, resize, focus) {
    win.addListener(
      function(callingWindow, signal) {

        // Keep track of scroll bar pixel position and ratio to total container
        // height to maintain scoll bar location on resize. From:
        // http://jsfiddle.net/JamesKyle/RmNap/
        var contentHeight = getWindowContentHeight(win, button_bar);
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
            contentHeight = getWindowContentHeight(win, button_bar);
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
    if (rootWindow.getFrame().parentNode != document.body) {
      document.body.appendChild(rootWindow.getFrame());
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
    if (config.helpText) {
      DOM.addHelpButton(win, 'Help: ' + instance.getName(), config.helpText);
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
      controls.setAttribute("class", "buttonpanel");
      config.createControls.call(instance, controls);
      container.appendChild(controls);
      DOM.addButtonDisplayToggle(win);
    }

    // Create content, ID and createContent() are optional
    var content = createContainer(config.contentID);
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
    addListener(win, content, controls, destroy, resize, focus);
    addLogic(win);

    if (CATMAID.tools.isFn(config.init)) {
      config.init.call(instance, win);
    }

    return {window: win, widget: instance};
  };

  var createConnectivityMatrixWindow = function(instance) {
    var CM = instance ? instance : new CATMAID.ConnectivityMatrixWidget();
    return createWidget(CM);
  };

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function()
  {

    if ( !Detector.webgl ) {
      alert('Your browser does not seem to support WebGL.');
      return;
    }

    CATMAID.throwOnInsufficientWebGlContexts(1);

    // A selection table is opened alongside the 3D viewer. Initialize it first,
    // so that it will default to the last opened skeleton source to pull from
    // (which otherwise would be the 3D viewer).
    var selectionTable = WindowMaker.create('selection-table');

    var WA = new CATMAID.WebGLApplication();

    checkAndLoadWidgetState(WA);

    var win = new CMWWindow(WA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement( "div" );
    bar.id = "3d_viewer_buttons";
    bar.setAttribute('class', 'buttonpanel');
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

    var viewControls = DOM.appendToTab(tabs['View'],
        [
          ['Center active', WA.look_at_active_node.bind(WA)],
          ['Follow active', o.follow_active, function() { WA.setFollowActive(this.checked); }, false],
          ['Update active',  o.update_active, function() { WA.setUpdateActive(this.checked); }, false],
          ['XY', WA.XYView.bind(WA)],
          ['XZ', WA.XZView.bind(WA)],
          ['ZY', WA.ZYView.bind(WA)],
          ['ZX', WA.ZXView.bind(WA)],
          [storedViewsSelect],
          ['Save view', storeView],
          ['Fullscreen', WA.fullscreenWebGL.bind(WA)],
          [connectorRestrictions],
          ['Refresh active skeleton', WA.updateActiveSkeleton.bind(WA)],
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
     ['sampler-domains', 'Reconstrucion sampler domains'],
     ['sampler-intervals', 'Reconstrucion sampler intervals']
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
     ['Same as skeleton', 'skeleton']
    ].forEach(function(e, i) {
       var selected = o.connector_color === e[1];
       synColors.options.add(new Option(e[1], e[1], selected, selected));
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

    // Update volume list
    var initVolumeList = function() {
      return CATMAID.Volumes.listAll(project.id).then(function(json) {
          var volumes = json.sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          }).map(function(volume) {
            return {
              title: volume.name,
              value: volume.id
            };
          });
          var selectedVolumes = WA.getLoadedVolumeIds();
          // Create actual element based on the returned data
          var node = DOM.createCheckboxSelect('Volumes', volumes,
              selectedVolumes);
          // Add a selection handler
          node.onchange = function(e) {
            var visible = e.target.checked;
            var volumeId = e.target.value;
            WA.showVolume(volumeId, visible);

            // Add extra display controls for enabled volumes
            var li = e.target.closest('li');
            if (visible) {
              var volumeControls = li.appendChild(document.createElement('span'));
              volumeControls.setAttribute('data-role', 'volume-controls');
              CATMAID.DOM.appendColorButton(volumeControls, 'c',
                'Change the color of this volume',
                undefined, undefined, {
                  initialColor: o.meshes_color,
                  initialAlpha: o.meshes_opacity,
                  onColorChange: updateVolumeColor.bind(null, volumeId)
                });
              var facesCb = CATMAID.DOM.appendCheckbox(volumeControls, "Faces",
                  "Whether faces should be displayed for this volume",
                  o.meshes_faces, updateVolumeFaces.bind(null, volumeId));
              facesCb.style.display = 'inline';
            } else {
              var volumeControls = li.querySelector('span[data-role=volume-controls]');
              if (volumeControls) {
                li.removeChild(volumeControls);
              }
            }
          };
          return node;
        });
    };

    // Create async selection and wrap it in container to have handle on initial
    // DOM location
    var volumeSelection = DOM.createAsyncPlaceholder(initVolumeList());
    var volumeSelectionWrapper = document.createElement('span');
    volumeSelectionWrapper.appendChild(volumeSelection);

    // Replace volume selection wrapper children with new select
    var refreshVolumeList = function() {
      while (0 !== volumeSelectionWrapper.children.length) {
        volumeSelectionWrapper.removeChild(volumeSelectionWrapper.children[0]);
      }
      var volumeSelection = DOM.createAsyncPlaceholder(initVolumeList());
      volumeSelectionWrapper.appendChild(volumeSelection);
    };

    DOM.appendToTab(tabs['View settings'],
        [
          [volumeSelectionWrapper],
          ['Faces ', o.meshes_faces, function() { WA.options.meshes_faces = this.checked;}, false],
          [WA.createMeshColorButton()],
          ['Active node', o.show_active_node, function() { WA.options.show_active_node = this.checked; WA.adjustContent(); }, false],
          ['Active node on top', o.active_node_on_top, function() { WA.options.active_node_on_top = this.checked; WA.adjustContent(); }, false],
          ['Black background', o.show_background, adjustFn('show_background'), false],
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
          ['Debug', o.debug, function() { WA.setDebug(this.checked); }, false],
          ['Line width', o.skeleton_line_width, null, function() { WA.updateSkeletonLineWidth(this.value); }, 4],
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
            type: 'numeric',
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
          }
        ]);

    var nodeScalingInput = DOM.appendNumericField(tabs['View settings'],
        'Node handle scaling', 'Size of handle spheres for tagged nodes.',
              o.skeleton_node_scaling, null, function() {
              WA.options.skeleton_node_scaling = Math.max(0, this.value) || 1.0;
              WA.adjustContent();
              WA.updateSkeletonNodeHandleScaling(this.value);
        }, 5);

    DOM.appendToTab(tabs['Stacks'],
        [
          ['Bounding box', o.show_box, adjustFn('show_box'), false],
          ['Z plane', o.show_zplane, adjustFn('show_zplane'), false],
          {type: 'checkbox', label: 'with stack images', value: o.zplane_texture,
           onclick: adjustFn('zplane_texture'), title: 'If checked, images ' +
             'of the current section of the active stack will be displayed on a Z plane.'},
          {type: 'numeric', label: 'Z plane zoom level ', value: o.zplane_zoomlevel,
           title: 'The zoom-level to use (slider value in top toolbar) for image tiles ' +
           'in a Z plane. If set to "max", the highest zoom-level available will be ' +
           'which in turn means the worst resolution available.', length: 2,
           onchange: function() {
             WA.options.zplane_zoomlevel = ("max" === this.value) ? this.value :
                 Math.max(0, this.value);
             WA.adjustStaticContent();
            }},
          {type: 'numeric', label: 'Z plane opacity', value: o.zplane_opacity, length: 2,
            title: 'The opacity of displayed Z planes', onchange: function(e) {
              var value = parseFloat(this.value);
              if (value) {
                WA.options.zplane_opacity = value;
                WA.adjustStaticContent();
              }
            }},
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
            },
            title: 'If checked, nodes at the respective sections in the displayed reference stack are placed at an interpolated location'
          },
          {
            type: 'text',
            label: 'on sections',
            length: 5,
            value: o.interpolated_sections.join(', '),
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
        ]);

    DOM.appendToTab(tabs['Shading parameters'],
        [
          ['Synapse clustering bandwidth', o.synapse_clustering_bandwidth, ' nm', function() { WA.updateSynapseClusteringBandwidth(this.value); }, 6],
          ['Near active node', o.distance_to_active_node, ' nm', function() {
            WA.updateActiveNodeNeighborhoodRadius(this.value); }, 6],
          ['Min. synapse-free cable', o.min_synapse_free_cable, ' nm', function() {
            WA.updateShadingParameter('min_synapse_free_cable', this.value, 'synapse-free'); }, 6],
          ['Strahler number', o.strahler_cut, '', function() { WA.updateShadingParameter('strahler_cut', this.value, ['dendritic-backbone', 'single-strahler-number', 'strahler-threshold']); }, 4],
          ['Tag (regex):', o.tag_regex, '', function() { WA.updateShadingParameter('tag_regex', this.value, 'downstream-of-tag'); }, 4]
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
          ['Rotation speed', o.animation_rotation_speed, '', function() {
            WA.options.animation_rotation_speed = parseFloat(this.value);
           }, 5],
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
          }, false]
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
          ['Export PNG', WA.exportPNG.bind(WA)],
          ['Export SVG', WA.exportSVG.bind(WA)],
          ['Export catalog SVG', WA.exportCatalogSVG.bind(WA)],
          ['Export skeletons as CSV', WA.exportSkeletonsAsCSV.bind(WA)],
          ['Export connectors as CSV', WA.exportConnectorsAsCSV.bind(WA)],
          ['Export synapses as CSV', WA.exportSynapsesAsCSV.bind(WA)],
          ['Synapse count CSV', WA.countObjects.bind(WA)],
          ['Export animation', WA.exportAnimation.bind(WA)],
        ]);

    content.appendChild( bar );

    $(bar).tabs();

    var container = createContainer("view_in_3d_webgl_widget" + WA.widgetID);
    content.appendChild(container);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas" + WA.widgetID);
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);

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

    // Clear listeners that were added above
    var unregisterUIListeners = function() {
      CATMAID.Volumes.off(CATMAID.Volumes.EVENT_VOLUME_ADDED,
          refreshVolumeList, WA);
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

    return {window: win, widget: WA};
  };

  var createGraphWindow = function()
  {
    var GG = new CATMAID.GroupGraph();

    var win = new CMWWindow(GG.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement('div');
    bar.setAttribute("id", 'compartment_graph_window_buttons' + GG.widgetID);
    bar.setAttribute('class', 'buttonpanel');
    DOM.addSourceControlsToggle(win, GG);
    DOM.addButtonDisplayToggle(win);
    DOM.addHelpButton(win, 'Help: ' + GG.getName(), "<h3>Visualize connecticity networks</h3>" +
        "<h4>How to...</h4><p><em>Hide edges/links:</em> Select an edge and use the <em>Hide</em> button in the <em>Selection</em> tab.</p>");
    addWindowConfigButton(win, GG);

    var tabs = DOM.addTabGroup(bar, GG.widgetID, ['Main', 'Grow', 'Graph',
        'Selection', 'Subgraphs', 'Align', 'Export']);

    DOM.appendToTab(tabs['Main'],
        [[document.createTextNode('From')],
         [CATMAID.skeletonListSources.createSelect(GG)],
         ['Append', GG.loadSource.bind(GG)],
         ['Append as group', GG.appendAsGroup.bind(GG)],
         ['Remove', GG.removeSource.bind(GG)],
         ['Clear', GG.clear.bind(GG)],
         ['Refresh', GG.update.bind(GG)],
         ['Properties', GG.graph_properties.bind(GG)],
         ['Clone', GG.cloneWidget.bind(GG)],
         ['Save', GG.saveJSON.bind(GG)],
         ['Open...', function() { document.querySelector('#gg-file-dialog-' + GG.widgetID).click(); }]]);

    tabs['Export'].appendChild(DOM.createFileButton(
          'gg-file-dialog-' + GG.widgetID, false, function(evt) {
            GG.loadFromJSON(evt.target.files);
          }));

    var color = document.createElement('select');
    color.setAttribute('id', 'graph_color_choice' + GG.widgetID);
    color.options.add(new Option('source', 'source'));
    color.options.add(new Option('review status (union)', 'union-review'));
    color.options.add(new Option('review status (team)', 'whitelist-review'));
    color.options.add(new Option('review status (own)', 'own-review'));
    color.options.add(new Option('input/output', 'I/O'));
    color.options.add(new Option('betweenness centrality', 'betweenness_centrality'));
    color.options.add(new Option('circles of hell (upstream)', 'circles_of_hell_upstream')); // inspired by Tom Jessell's comment
    color.options.add(new Option('circles of hell (downstream)', 'circles_of_hell_downstream'));
    color.onchange = GG._colorize.bind(GG, color);

    var layout = DOM.appendSelect(tabs['Graph'], null, null, GG.layoutStrings);

    var edges = document.createElement('select');
    edges.setAttribute('id', 'graph_edge_threshold' + GG.widgetID);
    for (var i=1; i<101; ++i) edges.appendChild(new Option(i, i));

    var edgeConfidence = document.createElement('select');
    edgeConfidence.setAttribute('id', 'graph_edge_confidence_threshold' + GG.widgetID);
    for (var i=1; i<6; ++i) edgeConfidence.appendChild(new Option(i, i));
    edges.onchange = edgeConfidence.onchange = function() {
        GG.filterEdges($('#graph_edge_threshold' + GG.widgetID).val(),
                       $('#graph_edge_confidence_threshold' + GG.widgetID).val()); };

    DOM.appendToTab(tabs['Graph'],
        [['Re-layout', GG.updateLayout.bind(GG, layout, null)],
         [' fit', true, GG.toggleLayoutFit.bind(GG), true],
         [document.createTextNode(' - Color: ')],
         [color],
         [document.createTextNode(' - Hide edges with less than ')],
         [edges],
         [document.createTextNode(' synapses ')],
         [document.createTextNode(' - Filter synapses below confidence ')],
         [edgeConfidence],
        ]);

    DOM.appendToTab(tabs['Selection'],
        [['Annotate', GG.annotate_skeleton_list.bind(GG)],
         [document.createTextNode(' - ')],
         ['Measure edge risk', GG.annotateEdgeRisk.bind(GG)],
         [document.createTextNode(' - ')],
         ['Group', GG.group.bind(GG)],
         ['Ungroup', GG.ungroup.bind(GG)],
         [document.createTextNode(' - ')],
         ['Hide', GG.hideSelected.bind(GG)],
         ['Show hidden', GG.showHidden.bind(GG), {id: 'graph_show_hidden' + GG.widgetID, disabled: true}],
         ['lock', GG.applyToNodes.bind(GG, 'lock', true)],
         ['unlock', GG.applyToNodes.bind(GG, 'unlock', true)],
         [document.createTextNode(' - ')],
         ['Remove', GG.removeSelected.bind(GG)],
         [document.createTextNode(' - ')],
         [DOM.createNumericField('gg_select_regex' + GG.widgetID, null, null, '', '', GG.selectByLabel.bind(GG), null)], // NOTE: actually used as text rather than being limited to numbers, despite the name
         ['Select by regex', GG.selectByLabel.bind(GG)],
         [document.createTextNode(' - ')],
         ['Invert', GG.invertSelection.bind(GG)],
        ]);

    DOM.appendToTab(tabs['Align'],
        [[document.createTextNode('Align: ')],
         [' X ', GG.equalizeCoordinate.bind(GG, 'x')],
         [' Y ', GG.equalizeCoordinate.bind(GG, 'y')],
         [document.createTextNode(' - Distribute: ')],
         [' X ', GG.distributeCoordinate.bind(GG, 'x')],
         [' Y ', GG.distributeCoordinate.bind(GG, 'y')]]);

    var f = function(name) {
      var e = document.createElement('select');
      e.setAttribute("id", "gg_n_min_" + name + GG.widgetID);
      e.appendChild(new Option("All " + name, 0));
      e.appendChild(new Option("No " + name, -1));
      for (var i=1; i<51; ++i) {
        e.appendChild(new Option(i, i));
      }
      e.selectedIndex = 3; // value of 2 pre or post min
      return e;
    };

    DOM.appendToTab(tabs['Grow'],
        [[document.createTextNode('Grow ')],
         ['Circles', GG.growGraph.bind(GG)],
         [document.createTextNode(" by ")],
         [DOM.createSelect("gg_n_circles_of_hell" + GG.widgetID, [1, 2, 3, 4, 5])],
         [document.createTextNode(" orders, limit:")],
         [f("upstream")],
         [f("downstream")],
         [DOM.createNumericField('gg_filter_regex' + GG.widgetID, 'filter (regex):',
                             'Only include neighbors with annotations matching this regex.',
                             '', '', undefined, 4)],
         [document.createTextNode(" - Find ")],
         ['paths', GG.growPaths.bind(GG)],
         [document.createTextNode(" by ")],
         [DOM.createSelect("gg_n_hops" + GG.widgetID, [2, 3, 4, 5, 6])],
         [document.createTextNode(" hops, limit:")],
         [f("path_synapses")],
         ['pick sources', GG.pickPathOrigins.bind(GG, 'source'), {id: 'gg_path_source' + GG.widgetID}],
         ['X', GG.clearPathOrigins.bind(GG, 'source')],
         ['pick targets', GG.pickPathOrigins.bind(GG, 'target'), {id: 'gg_path_target' + GG.widgetID}],
         ['X', GG.clearPathOrigins.bind(GG, 'target')]]);

    DOM.appendToTab(tabs['Export'],
        [['Export GML', GG.exportGML.bind(GG)],
         ['Export SVG', GG.showSVGOptions.bind(GG)],
         ['Export Adjacency Matrix', GG.exportAdjacencyMatrix.bind(GG)],
         ['Open Connectivity Matrix', GG.openConnectivityMatrix.bind(GG, false)],
         ['Open plot', GG.openPlot.bind(GG)],
         ['Quantify', GG.quantificationDialog.bind(GG)]]);

    DOM.appendToTab(tabs['Subgraphs'],
        [[document.createTextNode('Select node(s) and split by: ')],
         ['Axon & dendrite', GG.splitAxonAndDendrite.bind(GG)],
         ['Axon, backbone dendrite & dendritic terminals', GG.splitAxonAndTwoPartDendrite.bind(GG)],
         ['Synapse clusters', GG.splitBySynapseClustering.bind(GG)],
         ['Tag', GG.splitByTag.bind(GG)],
         ['Reset', GG.unsplit.bind(GG)]]);

    content.appendChild( bar );

    $(bar).tabs();

    /* Create graph container and assure that it's overflow setting is set to
     * 'hidden'. This is required, because cytoscape.js' redraw can be delayed
     * (e.g. due to animation). When the window's size is reduced, it can happen
     * that the cytoscape canvas is bigger than the container. The default
     * 'auto' setting then introduces scrollbars, triggering another resize.
     * This somehow confuses cytoscape.js and causes the graph to disappear.
     */
    var container = createContainer("graph_widget" + GG.widgetID);
    container.style.overflow = 'hidden';
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cyelement" + GG.widgetID);
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container, 'compartment_graph_window_buttons' + GG.widgetID,
        GG.destroy.bind(GG), GG.resize.bind(GG));

    addLogic(win);

    GG.init();

    return {window: win, widget: GG};
  };

  var createConnectivityGraphPlot = function(instance) {
    var GP = instance ? instance : new ConnectivityGraphPlot();

    var win = new CMWWindow(GP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'connectivity_graph_plot_buttons' + GP.widgetID);
    buttons.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);
    addWindowConfigButton(win, GP);

    var xml = document.createElement('input');
    xml.setAttribute("type", "button");
    xml.setAttribute("value", "Export SVG");
    xml.onclick = GP.exportSVG.bind(GP);
    buttons.appendChild(xml);

    content.appendChild(buttons);

    var container = createContainer('connectivity_graph_plot_div' + GP.widgetID);
    content.appendChild(container);

    var plot = document.createElement('div');
    plot.setAttribute('id', 'connectivity_graph_plot' + GP.widgetID);
    plot.style.width = "100%";
    plot.style.height = "100%";
    plot.style.backgroundColor = "#FFFFFF";
    container.appendChild(plot);

    addListener(win, container, 'connectivity_graph_plot_buttons' + GP.widgetID,
            GP.destroy.bind(GP), GP.resize.bind(GP));

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
    addListener(win, container, undefined, OS.destroy.bind(OS));
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
        result += '<dt><kbd>' + k + '</kbd></dt><dd>' + action.getHelpText() + '</dd>';
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

    var keysHTML = '<p id="keyShortcutsText">';
    keysHTML += '<a href="' + CATMAID.makeDocURL('/') + '" target="_blank">';
    keysHTML += 'General documentation for CATMAID release ' + CATMAID.getVersionRelease();
    keysHTML += '</a><br />';
    keysHTML += '<a href="' + CATMAID.makeChangelogURL() + '" target="_blank">';
    keysHTML += 'Changelog for CATMAID release ' + CATMAID.getVersionRelease();
    keysHTML += '</a>';
    keysHTML += '<h4>Global Key Help</h4>';

    actions = project.getActions();
    keysHTML += getHelpForActions(actions);

    tool = project.getTool();
    if (tool) {
      if (tool.hasOwnProperty('getMouseHelp')) {
        keysHTML += '<h4>Tool-specific Mouse Help</h4>';
        keysHTML += tool.getMouseHelp();
      }

      if (tool.hasOwnProperty('getActions')) {
        keysHTML += '<h4>Tool-specific Key Help</h4>';
        keysHTML += getHelpForActions(tool.getActions());
      }

      if (tool.hasOwnProperty('getUndoHelp')) {
        keysHTML += '<h4>Undo help</h4>';
        keysHTML += tool.getUndoHelp();
      }

    }
    keysHTML += '</p>';

    // If on Mac OS, replace all occurences of 'Ctrl' with '⌘'
    if ('MAC' === CATMAID.tools.getOS()) {
      keysHTML = keysHTML.replace(/Ctrl/gi, '⌘');
    }

    container.innerHTML = keysHTML;
    return container;
  };

  var createKeyboardShortcutsWindow = function()
  {
    var win = new CMWWindow( "Keyboard Shortcuts" );
    var container = self.setKeyShortcuts(win);

    $(container)
      .append($('<h4 />').text('Contributors'))
      .append('CATMAID &copy;&nbsp;2007&ndash;2017 ' +
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

    var container = createContainer("neuron-navigator" + NN.widgetID);
    container.classList.add('navigator_widget');

    // Add container to DOM
    content.appendChild(container);

    // Wire it up.
    addListener(win, container, undefined, NN.destroy.bind(NN));
    addLogic(win);

    // Let the navigator initialize the interface within
    // the created container.
    NN.init_ui(container, new_nn_instance === undefined);

    return {window: win, widget: NN};
  };

  var createHtmlWindow = function (params) {
    var win = new CMWWindow(params.title);
    var content = win.getFrame();
    var container = createContainer();
    content.appendChild(container);
    content.style.backgroundColor = "#ffffff";

    addListener(win, container);
    addLogic(win);

    container.innerHTML = params.html;

    return {window: win, widget: null};
  };

  var creators = {
    "keyboard-shortcuts": createKeyboardShortcutsWindow,
    "3d-webgl-view": create3dWebGLWindow,
    "graph-widget": createGraphWindow,
    "connectivity-graph-plot": createConnectivityGraphPlot,
    "ontology-search": createOntologySearchWidget,
    "neuron-navigator": createNeuronNavigatorWindow,
    "connectivity-matrix": createConnectivityMatrixWindow,
    "html": createHtmlWindow,
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
        var handles = creators[name](params);
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
   * @return {Map}            Map of window objects to widget instances.
   */
  this.getOpenWindows = function (name, create, params) {
    if (creators.hasOwnProperty(name)) {
      if (windows.has(name)) {
        var instances = windows.get(name);
        return new Map(instances);
      } else if (create) {
        var handles = creators[name](params);
        handles = new Map([[handles.window, handles.widget]]);
        windows.set(name, handles);
        return new Map(handles);
      } else {
        return new Map();
      }
    } else {
      CATMAID.error("No known window with name " + name);
    }
  };

  /** Always create a new instance of the widget. The caller is allowed to hand
   * in extra parameters that will be passed on to the actual creator method. */
  this.create = function(name, init_params) {
    if (creators.hasOwnProperty(name)) {
      try {
        var handles = creators[name](init_params);
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
  this.registerWidget = function(key, creator, replace, stateManager) {
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

    creators[key] = function(options, isInstance) {
      instance = isInstance ? options : new creator(options);
      return createWidget(instance);
    };
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

}();


(function(CATMAID) {

  "use strict";

  CATMAID.front = WindowMaker.getFocusedWindowWidget;

  /**
   * Make new widgets available under the given unique key, optionally replacing
   * existing widgets.
   */
  CATMAID.registerWidget = function(options) {
    WindowMaker.registerWidget(options.key, options.creator, options.replace, options.state);
  };

  /**
   * Register a state provider and target for a particular widget type, can also
   * used through registerWidget().
   */
  CATMAID.registerState = function(type, options) {
    WindowMaker.registerState(type, options);
  };

})(CATMAID);
