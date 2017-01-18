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

  var createContainer = function(id) {
    var container = document.createElement("div");
    if (id) {
      container.setAttribute("id", id);
    }
    container.setAttribute("class", "windowContent");
    return container;
  };

  /**
   * Get content height of a window and take into account a potential button
   * panel. If a button panel ID is provided, its height is substracted from the
   * window content height.
   */
  var getWindowContentHeight = function(win, buttonPanelId) {
    var height = win.getContentHeight();
    if( buttonPanelId !== undefined ) {
      var $bar = $('#' + buttonPanelId);
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

  /**
   * Create a general widget window for a widget instance that provides a widget
   * configuration.
   */
  var createWidget = function(instance) {
    var config = instance.getWidgetConfiguration();
    var win = new CMWWindow(instance.getName());
    var container = win.getFrame();
    container.style.backgroundColor = "#ffffff";

    // Add skeleton source subscription toggle if selected
    var source = config.subscriptionSource;
    if (source) {
      if (source instanceof Array) {
        source.forEach(function(s) {
          addWidgetSourceToggle(win, s);
        });
      } else {
        addWidgetSourceToggle(win, s);
      }
    }

    // Add a button to open help documentation if it is provided by the widget.
    if (config.helpText) {
      DOM.addHelpButton(win, 'Help: ' + instance.getName(), config.helpText);
    }

    // Create controls, if requested
    var controls;
    if (config.createControls) {
      var buttons = document.createElement("div");
      if (config.controlsID) {
        buttons.setAttribute("id", config.controlsID);
      }
      buttons.setAttribute("class", "buttonpanel");
      config.createControls.call(instance, buttons);
      container.appendChild(buttons);
      DOM.addButtonDisplayToggle(win);
    }

    // Create content, the ID is optional
    var content = createContainer(config.contentID);
    if (config.class) {
      $(content).addClass(config.class);
    }
    config.createContent.call(instance, content);
    container.appendChild(content);

    // Register to events
    var destroy = instance.destroy ? instance.destroy.bind(instance) : undefined;
    var resize = instance.resize ? instance.resize.bind(instance) : undefined;
    var focus = instance.focus ? instance.focus.bind(instance) : undefined;
    addListener(win, content, config.controlsID, destroy, resize, focus);
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

  var createStagingListWindow = function(instance, webglwin) {

    var ST = instance ? instance : new CATMAID.SelectionTable();

    var win = new CMWWindow(ST.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("neuron_staging_table" + ST.widgetID);
    $(container).addClass("selection-table");

    var buttons = document.createElement("div");
    buttons.setAttribute('id', 'ST_button_bar' + ST.widgetID);
    buttons.setAttribute('class', 'buttonpanel');

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(ST));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = ST.loadSource.bind(ST);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = ST.clear.bind(ST);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = ST.update.bind(ST);
    buttons.appendChild(update);

    var fileButton = buttons.appendChild(DOM.createFileButton(
          'st-file-dialog-' + ST.widgetID, false, function(evt) {
            ST.loadFromFiles(evt.target.files);
          }));
    var open = document.createElement('input');
    open.setAttribute("type", "button");
    open.setAttribute("value", "Open");
    open.onclick = function() { fileButton.click(); };
    buttons.appendChild(open);

    var save = document.createElement('input');
    save.setAttribute("type", "button");
    save.setAttribute("value", "Save");
    save.onclick = ST.saveToFile.bind(ST);
    buttons.appendChild(save);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.style.marginLeft = '1em';
    annotate.onclick = ST.annotate_skeleton_list.bind(ST);
    buttons.appendChild(annotate);

    var c = DOM.appendSelect(buttons, null, 'Color scheme ',
        ['CATMAID',
         'category10',
         'category20',
         'category20b',
         'category20c'].concat(Object.keys(colorbrewer)));


    var random = document.createElement('input');
    random.setAttribute("type", "button");
    random.setAttribute("value", "Colorize");
    random.onclick = function() { ST.colorizeWith(c.options[c.selectedIndex].text); };
    buttons.appendChild(random);

    var measure = document.createElement('input');
    measure.setAttribute('type', 'button');
    measure.setAttribute('value', 'Measure');
    measure.onclick = ST.measure.bind(ST);
    buttons.appendChild(measure);

    var summaryInfoButton = document.createElement('input');
    summaryInfoButton.setAttribute('type', 'button');
    summaryInfoButton.setAttribute('value', 'Summary info');
    summaryInfoButton.setAttribute('id', 'selection-table-info' + ST.widgetID);
    summaryInfoButton.onclick = ST.summary_info.bind(ST);
    buttons.appendChild(summaryInfoButton);

    var appendWithBatchColorCb = document.createElement('input');
    appendWithBatchColorCb.setAttribute('type', 'checkbox');
    appendWithBatchColorCb.onchange = function() {
      ST.appendWithBatchColor = this.checked;
    };
    var appendWithBatchColor = document.createElement('label');
    appendWithBatchColor.appendChild(appendWithBatchColorCb);
    appendWithBatchColorCb.checked = ST.appendWithBatchColor;
    appendWithBatchColor.appendChild(document.createTextNode(
          'Append with batch color'));
    buttons.appendChild(appendWithBatchColor);

    var hideVisibilitySettigsCb = document.createElement('input');
    hideVisibilitySettigsCb.setAttribute('type', 'checkbox');
    hideVisibilitySettigsCb.onchange = function() {
      ST.setVisibilitySettingsVisible(this.checked);
    };
    var hideVisibilitySettigs = document.createElement('label');
    hideVisibilitySettigs.appendChild(hideVisibilitySettigsCb);
    hideVisibilitySettigsCb.checked = true;
    hideVisibilitySettigs.appendChild(document.createTextNode(
          'Show visibility controls'));
    buttons.appendChild(hideVisibilitySettigs);

    win.getFrame().appendChild(buttons);
    content.appendChild(container);

    var tab = document.createElement('table');
    tab.setAttribute("id", "skeleton-table" + ST.widgetID);
    tab.setAttribute("class", "skeleton-table");
    tab.innerHTML =
        '<thead>' +
          '<tr>' +
            '<th>nr</th>' +
            '<th title="Remove one or all neurons"></th>' +
            '<th class="expanding" title="Neuron name">name</th>' +
            '<th title="% reviewed">rev</th>' +
            '<th title="Select a neuron and control its visibility (3D viewer)">selected</th>' +
            '<th title="Control visibility of pre-synaptic connections (3D viewer)">pre</th>' +
            '<th title="Control visibility of post-synaptic connections (3D viewer)">post</th>' +
            '<th title="Control visibility of tags (3D viewer)">text</th>' +
            '<th title="Control visibility of special nodes (3D viewer)">meta</th>' +
            '<th title="Control the color of a neuron (3D viewer)">color</th>' +
            '<th>actions</th>' +
          '</tr>' +
          '<tr>' +
            '<th></th>' +
            '<th><span class="ui-icon ui-icon-close" id="selection-table-remove-all' + ST.widgetID + '" title="Remove all"></th>' +
            '<th class="expanding"><input type="button" value="Filter" class="filter" />' +
              '<input class="filter" type="text" title="Use / for regex" placeholder="name filter" id="selection-table-filter' + ST.widgetID + '" />' +
              '<input class="filter" type="text" title="Use / for regex" placeholder="annotation filter" id="selection-table-ann-filter' + ST.widgetID + '" /></th>' +
            '<th><select class="review-filter">' +
              '<option value="Union" selected>Union</option>' +
              '<option value="Team">Team</option>' +
              '<option value="Self">Self</option>' +
            '</select></th>' +
            '<th><input type="checkbox" id="selection-table-show-all' + ST.widgetID + '" checked /></th>' +
            '<th><input type="checkbox" id="selection-table-show-all-pre' + ST.widgetID + '" checked style="float: left" /></th>' +
            '<th><input type="checkbox" id="selection-table-show-all-post' + ST.widgetID + '" checked style="float: left" /></th>' +
            '<th><input type="checkbox" id="selection-table-show-all-text' + ST.widgetID + '" style="float: left" /></th>' +
            '<th><input type="checkbox" id="selection-table-show-all-meta' + ST.widgetID + '" checked style="float: left" /></th>' +
            '<th><button id="selection-table-batch-color-button' + ST.widgetID +
                '" type="button" value="' + ST.batchColor + '" style="background-color: ' + ST.batchColor + '">Batch color</button></th>' +
            '<th></th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
        '</tbody>';
    container.appendChild(tab);

    $("select.review-filter", tab).on("change",  function () {
      ST.review_filter = this.value;
      ST.update();
    });
    $("button#selection-table-batch-color-button" + ST.widgetID, tab).on("click",
        function() {
          if (CATMAID.ColorPicker.visible()) {
            CATMAID.ColorPicker.hide(this);
            // Apply color on closing, even if the color picker itself wasn't
            // touched. This allows easier re-use of a previously set batch
            // color.
            var rgb = new THREE.Color(ST.batchColor);
            ST.batchColorSelected(rgb, ST.batchOpacity, true, true);
          } else {
            CATMAID.ColorPicker.show(this, {
              onColorChange: ST.batchColorSelected.bind(ST),
              initialColor: ST.batchColor,
              initialAlpha: ST.batchOpacity
            });
          }
        });
    $('th input[type=button].filter', tab).on("click", filterNeuronList);
    $('th input[type=text].filter', tab).on("keyup", function(e) {
      if (13 === e.keyCode) filterNeuronList();
    });

    // Add auto completetion to annotation filter
    CATMAID.annotations.add_autocomplete_to_input(
        $("#selection-table-ann-filter" + ST.widgetID, tab));

    /**
     * Trigger list filter.
     */
    function filterNeuronList() {
      var filters = $('th input[type=text].filter', tab);
      var nameFilter = filters[0].value;
      var annotationFilter = filters[1].value;
      ST.filterBy(nameFilter, annotationFilter);
    }

    $(tab)
      .on("click", "td .action-remove", ST, function(e) {
        var skeletonID = rowToSkeletonID(this);
        e.data.removeSkeletons([skeletonID]);
      })
      .on("click", "td .action-select", ST, function(e) {
        var skeletonID = rowToSkeletonID(this);
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton( 'skeleton', skeletonID );
      })
      .on("click", "td .action-annotate", function() {
        var skeletonID = rowToSkeletonID(this);
        CATMAID.annotate_neurons_of_skeletons([skeletonID]);
      })
      .on("click", "td .action-info", function() {
        var skeletonID = rowToSkeletonID(this);
        CATMAID.SelectionTable.prototype.skeleton_info([skeletonID]);
      })
      .on("click", "td .action-navigator", function() {
        var skeletonID = rowToSkeletonID(this);
        var navigator = new CATMAID.NeuronNavigator();
        WindowMaker.create('neuron-navigator', navigator);
        navigator.set_neuron_node_from_skeleton(skeletonID);
      })
      .on("click", "td input.action-visibility", ST, function(e) {
        var table = e.data;
        var skeletonID = rowToSkeletonID(this);
        var action = this.dataset.action;
        var skeleton = table.skeletons[table.skeleton_ids[skeletonID]];
        var visible = this.checked;
        skeleton[action] = visible;

        // The first checkbox controls all others
        if ("selected" === action) {
          ['pre_visible', 'post_visible', 'text_visible', 'meta_visible'].forEach(function(other, k) {
            if (visible && 2 === k) return; // don't make text visible
            skeleton[other] = visible;
            $('#skeleton' + other + table.widgetID + '-' + skeletonID).prop('checked', visible);
          });
          // Update table information
          table.updateTableInfo();
        }
        table.triggerChange(CATMAID.tools.idMap(skeleton));
      })
      .on("click", "td .action-changecolor", ST, function(e) {
        var table = e.data;
        var skeletonID = rowToSkeletonID(this);
        CATMAID.ColorPicker.toggle(this, {
          onColorChange: table.colorSkeleton.bind(table, skeletonID, false)
        });
      });

    /**
     * Find the closest table row element and read out skeleton ID.
     */
    function rowToSkeletonID(element) {
      var skeletonID = $(element).closest("tr").attr("data-skeleton-id");
      if (!skeletonID) throw new Error("Couldn't find skeleton ID");
      return skeletonID;
    }

    addListener(win, container, buttons.id, ST.destroy.bind(ST));
    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.FOCUS:
            ST.setLastFocused();
            break;
        }
        return true;
      });

    // addLogic(win);

    document.getElementById("content").style.display = "none";

    /* be the first window */
    var rootWindow = CATMAID.rootWindow;
    if (rootWindow.getFrame().parentNode != document.body) {
      document.body.appendChild(rootWindow.getFrame());
      document.getElementById("content").style.display = "none";
    }

    if (rootWindow.getChild() === null)
      rootWindow.replaceChild(win);
    else {
        if( webglwin === undefined) {
            rootWindow.replaceChild(new CMWHSplitNode(rootWindow.getChild(), win));
        } else {
          webglwin.getParent().replaceChild(new CMWVSplitNode(webglwin, win), webglwin);
        }
    }

    DOM.addSourceControlsToggle(win, ST);
    DOM.addButtonDisplayToggle(win);

    CATMAID.skeletonListSources.updateGUI();
    ST.init();
    win.focus();

    return {window: win, widget: ST};
  };

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function()
  {

    if ( !Detector.webgl ) {
      alert('Your browser does not seem to support WebGL.');
      return;
    }

    // A selection table is opened alongside the 3D viewer. Initialize it first,
    // so that it will default to the last opened skeleton source to pull from
    // (which otherwise would be the 3D viewer).
    var ST = new CATMAID.SelectionTable();

    var WA = new CATMAID.WebGLApplication();

    var win = new CMWWindow(WA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement( "div" );
    bar.id = "3d_viewer_buttons";
    bar.setAttribute('class', 'buttonpanel');
    DOM.addSourceControlsToggle(win, WA);
    DOM.addButtonDisplayToggle(win);

    var tabs = DOM.addTabGroup(bar, WA.widgetID, ['Main', 'View', 'Shading',
        'Skeleton filters', 'View settings', 'Stacks', 'Shading parameters',
        'Animation', 'History', 'Export']);

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
          ['Count', WA.countObjects.bind(WA)],
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
          ['Follow active', false, function() { WA.setFollowActive(this.checked); }, false],
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
     ['downstream-of-tag', 'Downstream of tag']
    ].forEach(function(e) {
       shadingMenu.options.add(new Option(e[1], e[0]));
     });
    shadingMenu.selectedIndex = 0;
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
    ].forEach(function(e) {
       colorMenu.options.add(new Option(e[1], e[0]));
    });
    colorMenu.selectedIndex = 0;
    colorMenu.onchange = WA.updateColorMethod.bind(WA, colorMenu);

    var synColors = document.createElement('select');
    synColors.options.add(new Option('Type: pre/red, post/cyan', 'cyan-red'));
    synColors.options.add(new Option('Type: pre/red, post/cyan (light background)', 'cyan-red-dark'));
    synColors.options.add(new Option('N with partner: pre[red > blue], post[yellow > cyan]', 'by-amount'));
    synColors.options.add(new Option('Synapse clusters', 'synapse-clustering'));
    synColors.options.add(new Option('Max. flow cut: axon (green) and dendrite (blue)', 'axon-and-dendrite'));
    synColors.options.add(new Option('Same as skeleton', 'skeleton'));
    synColors.onchange = WA.updateConnectorColors.bind(WA, synColors);

    DOM.appendToTab(tabs['Shading'],
        [
          [document.createTextNode('Shading: ')],
          [shadingMenu],
          [' Inv:', false, WA.toggleInvertShading.bind(WA), true],
          [document.createTextNode(' Color:')],
          [colorMenu],
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
    var o = CATMAID.WebGLApplication.prototype.OPTIONS;

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
          ['Faces ', false, function() { WA.options.meshes_faces = this.checked;}, false],
          [WA.createMeshColorButton()],
          ['Active node', true, function() { WA.options.show_active_node = this.checked; WA.adjustContent(); }, false],
          ['Active node on top', false, function() { WA.options.active_node_on_top = this.checked; WA.adjustContent(); }, false],
          ['Black background', true, adjustFn('show_background'), false],
          ['Floor', true, adjustFn('show_floor'), false],
          ['Debug', false, function() { WA.setDebug(this.checked); }, false],
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
            label: 'Custom Tags (regex):',
            title: 'Display handle spheres for nodes with tags matching this regex (must refresh 3D viewer after changing).',
            value: o.custom_tag_spheres_regex,
            onchange: function () { WA.options.custom_tag_spheres_regex = this.value; },
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
          ['Bounding box', true, adjustFn('show_box'), false],
          ['Z plane', false, adjustFn('show_zplane'), false],
          {type: 'checkbox', label: 'with stack images', value: true,
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
          ['Missing sections', false, adjustFn('show_missing_sections'), false],
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
        ]);

    DOM.appendToTab(tabs['Shading parameters'],
        [
          ['Synapse clustering bandwidth', o.synapse_clustering_bandwidth, ' nm', function() { WA.updateSynapseClusteringBandwidth(this.value); }, 6],
          ['Near active node', o.distance_to_active_node, ' nm', function() {
            WA.updateActiveNodeNeighborhoodRadius(this.value); }, 6],
          ['Min. synapse-free cable', o.min_synapse_free_cable, ' nm', function() {
            WA.updateShadingParameter('min_synapse_free_cable', this.value, 'synapse-free'); }, 6],
          ['Strahler number', o.strahler_cut, '', function() { WA.updateShadingParameter('strahler_cut', this.value, 'dendritic-backbone'); }, 4],
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
    WA.init( 800, 600, canvas.getAttribute("id") );

    // Since the initialization can potentially change the node scaling, the is
    // updated here explicitly. At some point we might want to have some sort of
    // observer for this.
    nodeScalingInput.value = WA.options.skeleton_node_scaling;

    // Create a Selection Table, preset as the sync target
    var st = createStagingListWindow( ST, win, WA.getName() );

    CATMAID.Volumes.on(CATMAID.Volumes.EVENT_VOLUME_ADDED,
        refreshVolumeList, WA);

    // Clear listeners that were added above
    var unregisterUIListeners = function() {
      CATMAID.Volumes.off(CATMAID.Volumes.EVENT_VOLUME_ADDED,
          refreshVolumeList, WA);
    };

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
              WA.destroy();
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

    CATMAID.skeletonListSources.updateGUI();

    // Now that a Selection Table exists, have the 3D viewer subscribe to it and
    // make it ignore local models. Don't make it selection based, to not reload
    // skeletons on visibility changes.
    var Subscription = CATMAID.SkeletonSourceSubscription;
    WA.addSubscription(new Subscription(st.widget, true, false,
          CATMAID.SkeletonSource.UNION, Subscription.ALL_EVENTS), true);
    // Override existing local models if subscriptions are updated
    WA.ignoreLocal = true;

    return {window: win, widget: WA};
  };

  var createSliceInfoWindow = function()
  {
    var win = new CMWWindow("Slice Info Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("table-container");
    content.appendChild( container );

    var slicetable = document.createElement('div');
    slicetable.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="slicetable"></table>';

    var segmentstable = document.createElement('div');
    segmentstable.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="segmentstable"></table>';

    container.appendChild( slicetable );
    container.appendChild( segmentstable );

    addListener(win, container);

    addLogic(win);

    return {window: win, widget: null};
  };

  var createSynapseFractionsWindow = function()
  {
    var SF = new CATMAID.SynapseFractions();

    var win = new CMWWindow(SF.getName());
    DOM.addButtonDisplayToggle(win);
    var content = win.getFrame();
    content.classList.add('synapse-fractions');
    content.style.backgroundColor = '#ffffff';

    var bar = document.createElement('div');
    bar.setAttribute("id", "synapse_fractions_buttons" + SF.widgetID);
    bar.setAttribute('class', 'buttonpanel');

    var tabs = DOM.addTabGroup(bar, SF.widgetID, ['Main', 'Filter', 'Color', 'Partner groups']);

    var partners_source = CATMAID.skeletonListSources.createPushSelect(SF, "filter");
    partners_source.onchange = SF.onchangeFilterPartnerSkeletons.bind(SF);

    var modes = DOM.createSelect("synapse_fraction_mode" + SF.widgetID, SF.MODES);
    modes.onchange = SF.onchangeMode.bind(SF, modes);

    DOM.appendToTab(tabs['Main'],
        [[document.createTextNode('From')],
         [CATMAID.skeletonListSources.createSelect(SF)],
         ['Append', SF.loadSource.bind(SF)],
         ['Clear', SF.clear.bind(SF)],
         ['Refresh', SF.update.bind(SF)],
         [document.createTextNode(' - ')],
         [modes],
         [document.createTextNode(' - ')],
         ['Export SVG', SF.exportSVG.bind(SF)]]);

    var nf = DOM.createNumericField("synapse_threshold" + SF.widgetID, // id
                                "By synapse threshold: ",             // label
                                "Below this number, neuron gets added to the 'others' heap", // title
                                SF.threshold,                            // initial value
                                undefined,                               // postlabel
                                SF.onchangeSynapseThreshold.bind(SF),    // onchange
                                5);                                      // textfield length in number of chars

    var cb = DOM.createCheckbox('show others', SF.show_others, SF.toggleOthers.bind(SF));

    DOM.appendToTab(tabs['Filter'],
        [[nf],
         [document.createTextNode(' - Only in: ')],
         [partners_source],
         [cb[0]],
         [cb[1]]
        ]);

    var partners_color = CATMAID.skeletonListSources.createPushSelect(SF, "color");
    partners_color.onchange = SF.onchangeColorPartnerSkeletons.bind(SF);

    var c = DOM.createSelect('color-scheme-synapse-fractions' + SF.widgetID,
        ['category10',
         'category20',
         'category20b',
         'category20c'].concat(Object.keys(colorbrewer)));

    c.selectedIndex = 1;
    c.onchange = SF.onchangeColorScheme.bind(SF, c);

    DOM.appendToTab(tabs['Color'],
        [[document.createTextNode("Color scheme: ")],
         [c],
         [document.createTextNode("Color by: ")],
         [partners_color]]);

    var partner_group = CATMAID.skeletonListSources.createPushSelect(SF, "group");

    DOM.appendToTab(tabs['Partner groups'],
        [[partner_group],
         ['Create group', SF.createPartnerGroup.bind(SF)]]);

    content.appendChild(bar);

    $(bar).tabs();

    var container = createContainer("synapse_fractions_widget" + SF.widgetID);
    container.style.overflow = 'hidden';
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "synapse_fractions" + SF.widgetID);
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#ffffff";
    container.appendChild(graph);

    addListener(win, container, 'synapse_fractions_buttons' + SF.widgetID,
        SF.destroy.bind(SF), SF.resize.bind(SF));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: SF};
  };

  var createSynapsePlotWindow = function()
  {
    var SP = new CATMAID.SynapsePlot();

    var win = new CMWWindow(SP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement('div');
    bar.setAttribute("id", "synapse_plot_buttons" + SP.widgetID);
    bar.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);

    var tabs = DOM.addTabGroup(bar, SP.widgetID, ['Main', 'Options']);

    var compartment = DOM.createSelect("synapse_plot_compartment" + SP.widgetID, SP.COMPARTMENTS);
    compartment.onchange = SP.onchangeCompartment.bind(SP, compartment);

    DOM.appendToTab(tabs['Main'],
        [[document.createTextNode('From')],
         [CATMAID.skeletonListSources.createSelect(SP)],
         ['Append', SP.loadSource.bind(SP)],
         ['Clear', SP.clear.bind(SP)],
         ['Refresh', SP.update.bind(SP)],
         [document.createTextNode(" - Compartment: ")],
         [compartment],
         [document.createTextNode(" - ")],
         ['Export SVG', SP.exportSVG.bind(SP)],
         ['Export CSV', SP.exportCSV.bind(SP)]]);

    var nf = DOM.createNumericField("synapse_count_threshold" + SP.widgetID, // id
                                "Synapse count threshold: ",             // label
                                "Synapse count threshold",               // title
                                SP.threshold,                            // initial value
                                undefined,                               // postlabel
                                SP.onchangeSynapseThreshold.bind(SP),    // onchange
                                5);                                      // textfield length in number of chars

    var filter = CATMAID.skeletonListSources.createPushSelect(SP, "filter");
    filter.onchange = SP.onchangeFilterPresynapticSkeletons.bind(SP);

    var ais_choice = DOM.createSelect("synapse_plot_AIS_" + SP.widgetID, ["Computed", "Node tagged with..."], "Computed");

    var tag = DOM.createNumericField("synapse_count_tag" + SP.widgetID,
                                 undefined,
                                 "Tag",
                                 "",
                                 undefined,
                                 undefined,
                                 10);
    tag.onchange = SP.onchangeAxonInitialSegmentTag.bind(SP, tag);

    ais_choice.onchange = SP.onchangeChoiceAxonInitialSegment.bind(SP, ais_choice, tag);

    var jitter = DOM.createNumericField("synapse_plot_jitter" + SP.widgetID,
                                   undefined,
                                   "Jitter",
                                   SP.jitter,
                                   undefined,
                                   undefined,
                                   5);

    jitter.onchange = SP.onchangeJitter.bind(SP, jitter);

    var choice_coloring = CATMAID.skeletonListSources.createPushSelect(SP, "coloring");
    choice_coloring.onchange = SP.onchangeColoring.bind(SP);

    var sigma = DOM.createNumericField("synapse_plot_smooth" + SP.widgetID,
                                   "Arbor smoothing: ",
                                   "Gaussian smoothing sigma",
                                   SP.sigma,
                                   " nm",
                                   SP.onchangeSigma.bind(SP),
                                   5);

    DOM.appendToTab(tabs['Options'],
        [[nf],
         [document.createTextNode(' Only in: ')],
         [filter],
         [document.createTextNode(' Axon initial segment: ')],
         [ais_choice],
         [document.createTextNode(' Tag: ')],
         [tag],
         [document.createTextNode(' Jitter: ')],
         [jitter],
         [document.createTextNode(' Color by: ')],
         [choice_coloring],
         [sigma]]);



    content.appendChild( bar );

    $(bar).tabs();

    var container = createContainer("synapse_plot_widget" + SP.widgetID);
    container.style.overflow = 'hidden';
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "synapse_plot" + SP.widgetID);
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#ffffff";
    container.appendChild(graph);

    addListener(win, container, 'synapse_plot_buttons' + SP.widgetID,
        SP.destroy.bind(SP), SP.resize.bind(SP));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: SP};
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
        [['Re-layout', GG.updateLayout.bind(GG, layout)],
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
         ['Export SVG', GG.exportSVG.bind(GG)],
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

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: GG};
  };

  var createCircuitGraphPlot = function() {

    var GP = new CATMAID.CircuitGraphPlot();

    var win = new CMWWindow(GP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'circuit_graph_plot_buttons' + GP.widgetID);
    buttons.setAttribute('class', 'buttonpanel');
    DOM.addSourceControlsToggle(win, GP);
    DOM.addButtonDisplayToggle(win);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(GP));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append");
    add.onclick = GP.loadSource.bind(GP);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = GP.clear.bind(GP);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = GP.update.bind(GP);
    buttons.appendChild(update);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.onclick = GP.annotate_skeleton_list.bind(GP);
    buttons.appendChild(annotate);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.onclick = GP.adjustOptions.bind(GP);
    buttons.appendChild(options);


    buttons.appendChild(document.createTextNode(' - X:'));

    var axisX = document.createElement('select');
    axisX.setAttribute('id', 'circuit_graph_plot_X_' + GP.widgetID);
    buttons.appendChild(axisX);

    buttons.appendChild(document.createTextNode(' Y:'));

    var axisY = document.createElement('select');
    axisY.setAttribute('id', 'circuit_graph_plot_Y_' + GP.widgetID);
    buttons.appendChild(axisY);

    var redraw = document.createElement('input');
    redraw.setAttribute("type", "button");
    redraw.setAttribute("value", "Draw");
    redraw.onclick = GP.redraw.bind(GP);
    buttons.appendChild(redraw);

    buttons.appendChild(document.createTextNode(" Names:"));
    var toggle = document.createElement('input');
    toggle.setAttribute("type", "checkbox");
    toggle.checked = true;
    toggle.onclick = GP.toggleNamesVisible.bind(GP, toggle);
    buttons.appendChild(toggle);

    var xml = document.createElement('input');
    xml.setAttribute("type", "button");
    xml.setAttribute("value", "Export SVG");
    xml.onclick = GP.exportSVG.bind(GP);
    buttons.appendChild(xml);

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = GP.exportCSV.bind(GP);
    buttons.appendChild(csv);

    var csva = document.createElement('input');
    csva.setAttribute("type", "button");
    csva.setAttribute("value", "Export CSV (all)");
    csva.onclick = GP.exportCSVAll.bind(GP);
    buttons.appendChild(csva);

    buttons.appendChild(document.createTextNode(' - '));

    var deselect = document.createElement('input');
    deselect.setAttribute("type", "button");
    deselect.setAttribute("value", "Deselect all");
    deselect.onclick = GP.clearSelection.bind(GP);
    buttons.appendChild(deselect);

    content.appendChild(buttons);

    var container = createContainer('circuit_graph_plot_div' + GP.widgetID);
    container.style.overflow = 'hidden';
    content.appendChild(container);

    var plot = document.createElement('div');
    plot.setAttribute('id', 'circuit_graph_plot' + GP.widgetID);
    plot.style.width = "100%";
    plot.style.height = "100%";
    plot.style.backgroundColor = "#FFFFF0";
    container.appendChild(plot);

    addListener(win, container, 'circuit_graph_plot_buttons' + GP.widgetID, GP.destroy.bind(GP), GP.resize.bind(GP));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: GP};
  };

  var createVennDiagramWindow = function() {

    var VD = new VennDiagram();

    var win = new CMWWindow(VD.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'venn_diagram_buttons' + VD.widgetID);
    buttons.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(VD));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append as group");
    add.onclick = VD.loadSource.bind(VD);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = VD.clear.bind(VD);
    buttons.appendChild(clear);

    var svg = document.createElement('input');
    svg.setAttribute("type", "button");
    svg.setAttribute("value", "Export SVG");
    svg.onclick = VD.exportSVG.bind(VD);
    buttons.appendChild(svg);

    var sel = document.createElement('span');
    sel.innerHTML = ' Selected: <span id="venn_diagram_sel' + VD.widgetID + '">none</span>';
    buttons.appendChild(sel);

    content.appendChild(buttons);

    var container = createContainer('venn_diagram_div' + VD.widgetID);
    content.appendChild(container);

    addListener(win, container, 'venn_diagram_buttons' + VD.widgetID, VD.destroy.bind(VD), VD.resize.bind(VD));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: VD};
  };


  var createAssemblyGraphWindow = function()
  {

    var win = new CMWWindow("Assembly graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'assembly_graph_window_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "testbutton");
    add.setAttribute("value", "Show graph");
    contentbutton.appendChild(add);

    content.appendChild( contentbutton );

    var container = createContainer("assembly_graph_widget");
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cytograph");
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container);

    addLogic(win);

    return {window: win, widget: null};
  };


  var createSegmentsTablesWindow = function()
  {

    var win = new CMWWindow("Segments Table Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    /*
    var container = createContainer("segments_table_widget");
    content.appendChild(container);


    var graph = document.createElement('div');
    graph.setAttribute("id", "segmentstable-div");
    graph.style.height = "100%";
    graph.style.width = "100%";
    container.appendChild(graph);
    */

    var container = createContainer("segmentstable-container");
    content.appendChild( container );

    container.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="segmentstable"></table>';

    addListener(win, container);

    addLogic(win);

    return {window: win, widget: null};
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

    var createAdjacencyMatrixWindow = function()
    {
        var win = new CMWWindow("Adjacency Matrix");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'skeleton_adjmatrix_buttons');
        contentbutton.setAttribute('class', 'buttonpanel');
        DOM.addButtonDisplayToggle(win);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "retrieve_adjmatrix");
        add.setAttribute("value", "Get matrix");
        add.onclick = AdjacencyMatrix.fetchMatrixForSkeletons;
        contentbutton.appendChild(add);

        content.appendChild( contentbutton );

        var container = createContainer( "adjacencymatrix_widget" );
        content.appendChild( container );

        addListener(win, container, 'skeleton_adjmatrix_buttons');

        addLogic(win);

        AdjacencyMatrix.init();

        return {window: win, widget: null};
    };

  var createOntologySearchWidget = function(osInstance)
  {
    // If available, a new instance passed as parameter will be used.
    var OS = osInstance ? osInstance : new CATMAID.OntologySearch();
    var win = new CMWWindow(OS.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

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

  this.setSearchWindow = function(win)
  {
    var actions, action, i, tool, content, container;

    // If a window hasn't been passed in, look it up.
    if (typeof win == 'undefined') {
      win = windows['search'];
      if (!win) {
        return;
      }
    }

    content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    container = document.getElementById("search-window");
    if (!container) {
      container = createContainer("search-window");
      content.appendChild( container );
    }

    $(container).empty()
      .append($('<form />')
          .attr('id', 'search-form')
          .attr('autocomplete', 'on')
          .on('submit', function(e) {
            // Submit form in iframe to store autocomplete information
            DOM.submitFormInIFrame(document.getElementById('search-form'));
            // Do actual search
            CATMAID.TracingTool.search();
            // Cancel submit in this context to not reload the page
            return false;
          })
          .append($('<input type="text" id="search-box" name="search-box" />'))
          .append($('<input type="submit" />')))
      .append('<div id="search-results" />');

    // Focus search box
    setTimeout(function() { $('input#search-box', container).focus(); }, 10);

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

  var createSearchWindow = function()
  {
    var win = new CMWWindow( "Search" );
    var container = self.setSearchWindow(win);

    addListener(win, container);

    addLogic(win);

    return {window: win, widget: null};
  };

  var createNotificationsWindow = function()
  {
    var win = new CMWWindow( "Notifications" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "notifications_widget" );
    content.appendChild( container );

    container.innerHTML = '<table cellpadding="0" cellspacing="0" border="0" class="display" id="notificationstable">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>description</th>' +
            '<th>status' +
              '<select name="search_type" id="search_type" class="search_init">' +
                '<option value="">Any</option>' +
                '<option value="0">Open</option>' +
                '<option value="1">Approved</option>' +
                '<option value="2">Rejected</option>' +
                '<option value="3">Invalid</option>' +
              '</select>' +
            '</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>node id</th>' +
            '<th>skeleton id</th>' +
            '<th>from</th>' +
            '<th>date</th>' +
            '<th>actions</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>description</th>' +
            '<th>status</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>node id</th>' +
            '<th>skeleton id</th>' +
            '<th>from</th>' +
            '<th>date</th>' +
            '<th>actions</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td colspan="8"></td></tr>' +
        '</tbody>' +
      '</table>';

    addListener(win, container);

    addLogic(win);

    NotificationsTable.init();

    return {window: win, widget: null};
  };

  var createNeuronNavigatorWindow = function(new_nn_instance)
  {
    // If available, a new instance passed as parameter will be used.
    var NN = new_nn_instance ? new_nn_instance : new CATMAID.NeuronNavigator();
    var win = new CMWWindow(NN.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

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

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: NN};
  };

  var createSettingsWindow = function()
  {
    var win = new CMWWindow("Settings");
    var content = win.getFrame();
    var container = createContainer("settings");
    container.setAttribute('id', 'settings_widget');
    content.appendChild( container );
    content.style.backgroundColor = "#ffffff";

    // Wire it up
    addListener(win, container);
    addLogic(win);

    // Initialize settings window with container added to the DOM
    var SW = new CATMAID.SettingsWidget();
    SW.init(container);

    return {window: win, widget: SW};
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
    "search": createSearchWindow,
    "3d-webgl-view": create3dWebGLWindow,
    "selection-table": createStagingListWindow,
    "graph-widget": createGraphWindow,
    "connectivity-graph-plot": createConnectivityGraphPlot,
    "assemblygraph-widget": createAssemblyGraphWindow,
    "sliceinfo-widget": createSliceInfoWindow,
    "adjacencymatrix-widget": createAdjacencyMatrixWindow,
    "ontology-search": createOntologySearchWidget,
    "notifications": createNotificationsWindow,
    "circuit-graph-plot": createCircuitGraphPlot,
    "venn-diagram": createVennDiagramWindow,
    "neuron-navigator": createNeuronNavigatorWindow,
    "settings": createSettingsWindow,
    "connectivity-matrix": createConnectivityMatrixWindow,
    "synapse-plot": createSynapsePlotWindow,
    "synapse-fractions": createSynapseFractionsWindow,
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
      var handles = creators[name](init_params);
      if (windows.has(name)) {
        windows.get(name).set(handles.window, handles.widget);
      } else {
        windows.set(name, new Map([[handles.window, handles.widget]]));
      }

      return handles;
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

  /**
   * Allow new widgets to register with a window maker.
   */
  this.registerWidget = function(key, creator, replace) {
    if (key in creators && !replace) {
      throw new CATMAID.ValueError("A widget with the following key is " +
          "already registered: " + key);
    }
    if (!CATMAID.tools.isFn(creator)) {
      throw new CATMAID.ValueError("No valid constructor function provided");
    }

    creators[key] = function(options, isInstance) {
      instance = isInstance ? options : new creator(options);
      return createWidget(instance);
    };
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
    WindowMaker.registerWidget(options.key, options.creator, options.replace);
  };

})(CATMAID);
