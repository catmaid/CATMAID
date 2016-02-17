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
    container.setAttribute("id", id);
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

  var addListener = function(win, container, button_bar, destroy, resize) {
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
              rootWindow.close();
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
        }
        return true;
      });
  };

  var addLogic = function(win) {
    document.getElementById("content").style.display = "none";

    /* be the first window */
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

    // Create controls, if requested
    var controls;
    if (config.controlsID && config.createControls) {
      var buttons = document.createElement("div");
      buttons.setAttribute("id", config.controlsID);
      buttons.setAttribute("class", "buttonpanel");
      config.createControls.call(instance, buttons);
      container.appendChild(buttons);
      DOM.addButtonDisplayToggle(win);
    }

    // Create content
    var content = createContainer(config.contentID);
    if (config.class) {
      $(content).addClass(config.class);
    }
    config.createContent.call(instance, content);
    container.appendChild(content);

    // Register to events
    var destroy = instance.destroy ? instance.destroy.bind(instance) : undefined;
    var resize = instance.resize ? instance.resize.bind(instance) : undefined;
    addListener(win, content, config.controlsID, destroy, resize);
    addLogic(win);

    return {window: win, widget: instance};
  };

  var createSelect = function(id, items, selectedValue) {
    var select = document.createElement('select');
    if (id) {
      select.setAttribute("id", id);
    }
    items.forEach(function(item, i) {
      var option = document.createElement("option");
      var itemType = typeof item;
      var text, value;
      if ('object' === itemType) {
        text = item.title;
        value = item.value;
      } else {
        text = item;
        value = item;
      }
      option.text = text;
      option.value = value;
      if (option.value === selectedValue) {
        option.defaultSelected = true;
        option.selected = true;
      }
      select.appendChild(option);
    });
    return select;
  };

  var appendSelect = function(div, id, label, entries, title, value, onChangeFn) {
    id = id ? (div.id + '_' + id) : undefined;
    var select = createSelect(id, entries, value);
    div.appendChild(select);
    if (title) {
      select.title = title;
    }
    if (onChangeFn) {
      select.onchange= onChangeFn;
    }
    if (label) {
      var labelElement = document.createElement('label');
      labelElement.setAttribute('title', title);
      labelElement.appendChild(document.createTextNode(label));
      labelElement.appendChild(select);
      div.appendChild(labelElement);
    }
    return select;
  };

  var appendButton = function(div, label, onclickFn, attr) {
    var b = document.createElement('input');
    if (attr) Object.keys(attr).forEach(function(key) { b.setAttribute(key, attr[key]); });
    b.setAttribute('type', 'button');
    b.setAttribute('value', label);
    b.onclick = onclickFn;
    div.appendChild(b);
    return b;
  };

  var createCheckbox = function(label, value, onclickFn) {
    var cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.checked = value ? true : false;
    cb.onclick = onclickFn;
    return [cb, document.createTextNode(label)];
  };

  var appendCheckbox = function(div, label, title, value, onclickFn, left) {
    var labelEl = document.createElement('label');
    labelEl.setAttribute('title', title);
    var elems = createCheckbox(label, value, onclickFn);
    if (left) elems.reverse();
    elems.forEach(function(elem) { labelEl.appendChild(elem); });
    div.appendChild(labelEl);
    return left ? elems[elems.length - 1] : elems[0];
  };

  var createNumericField = function(id, label, title, value, postlabel, onchangeFn, length) {
    var nf = document.createElement('input');
    if (id) nf.setAttribute('id', id);
    nf.setAttribute('type', 'text');
    nf.setAttribute('value', value);
    if (length) nf.setAttribute('size', length);
    if (onchangeFn) nf.onchange = onchangeFn;
    if (label || postlabel) {
      var labelEl = document.createElement('label');
      labelEl.setAttribute('title', title);
      if (label) labelEl.appendChild(document.createTextNode(label));
      labelEl.appendChild(nf);
      if (postlabel) labelEl.appendChild(document.createTextNode(postlabel));
      return labelEl;
    } else {
      return nf;
    }
  };

  var appendNumericField = function(div, label, title, value, postlabel, onchangeFn, length) {
    var field = createNumericField(undefined, label, title, value, postlabel, onchangeFn, length);
    div.appendChild(field);
    return field;
  };

  /**
   * Construct elements from an array of parameters and append them to a tab
   * element.
   * @param  {Element}     tab   The tab to which to append constructed elements.
   * @param  {Array.<(Object|Array)>} elems
   *                             An array of parameters from which to construct
   *                             elements. The elements of the array are either
   *                             arrays of parameters, in which case the length
   *                             of the array is used to choose element type, or
   *                             an object specifying parameters, in which case
   *                             the `type` property specifies element type.
   * @return {Element[]}         An array of the constructed elements.
   */
  var appendToTab = function(tab, elems) {
    return elems.map(function(e) {
      if (Array.isArray(e)) {
        switch (e.length) {
          case 1: return tab.appendChild(e[0]);
          case 2: return appendButton(tab, e[0], e[1]);
          case 3: return appendButton(tab, e[0], e[1], e[2]);
          case 4: return appendCheckbox(tab, e[0], e[0], e[1], e[2], e[3]);
          case 5: return appendNumericField(tab, e[0], e[0], e[1], e[2], e[3], e[4]);
          default: return undefined;
        }
      } else {
        switch (e.type) {
          case 'child':
            return tab.appendChild(e.element);
          case 'button':
            return appendButton(tab, e.label, e.onclickFn, e.attr);
          case 'checkbox':
            return appendCheckbox(tab, e.label, e.title, e.value, e.onclickFn, e.left);
          case 'numeric':
            return appendNumericField(tab, e.label, e.title, e.value, e.postlabel, e.onchangeFn, e.length);
          case 'select':
            return appendSelect(tab, e.id, e.label, e.entries, e.title, e.value, e.onchangeFn);
          default: return undefined;
        }
      }
    });
  };

  /**
   * Create a tab group and add it to the given container. The widget ID is
   * expected to be unique.
   */
  var appendTabs = function(container, widgetID, titles) {
    var ul = document.createElement('ul');
    container.appendChild(ul);
    return titles.reduce(function(o, name) {
      var id = name.replace(/ /, '') + widgetID;
      ul.appendChild($('<li><a href="#' + id + '">' + name + '</a></li>')[0]);
      var div = document.createElement('div');
      div.setAttribute('id', id);
      container.appendChild(div);
      o[name] = div;
      return o;
    }, {});
  };

  var createConnectorSelectionWindow = function()
  {
    var win = new CMWWindow("Connector Selection Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var div = document.createElement('div');
    div.setAttribute('id', 'connector-selection-label');
    content.appendChild(div);

    var container = createContainer("connector_selection_widget");
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectorselectiontable">' +
        '<thead>' +
          '<tr>' +
            '<th>Connector</th>' +
            '<th>Node 1</th>' +
            '<th class="preheader">Presyn. neuron</th>' +
            '<th>C 1</th>' +
            '<th>Creator 1</th>' +
            '<th>Node 2</th>' +
            '<th class="postheader">Postsyn. neuron</th>' +
            '<th>C 2</th>' +
            '<th>Creator 2</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>Connector</th>' +
            '<th>Node 1</th>' +
            '<th class="preheader">Presyn. neuron</th>' +
            '<th>C 1</th>' +
            '<th>Creator 1</th>' +
            '<th>Node 2</th>' +
            '<th class="postheader">Postsyn. neuron</th>' +
            '<th>C 2</th>' +
            '<th>Creator 2</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container);
    addLogic(win);
    CATMAID.ConnectorSelection.init(); // MUST go after adding the container to the window, otherwise one gets "cannot read property 'aoData' of null" when trying to add data to the table

    return {window: win, widget: null};
  };

  var createSkeletonMeasurementsTable = function()
  {
    var SMT = new CATMAID.SkeletonMeasurementsTable();
    var win = new CMWWindow("Skeleton Measurements Table " + SMT.widgetID);
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(SMT));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = SMT.loadSource.bind(SMT);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = SMT.clear.bind(SMT);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = SMT.update.bind(SMT);
    buttons.appendChild(update);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.onclick = SMT.adjustOptions.bind(SMT);
    buttons.appendChild(options);

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = SMT.exportCSV.bind(SMT);
    buttons.appendChild(csv);

    var container = createContainer("skeleton_measurements_widget" + SMT.widgetID);

    content.appendChild(buttons);
    content.appendChild(container);

    var headings = '<tr>' + SMT.labels.map(function(label) { return '<th>' + label + '</th>'; }).join('') + '</tr>';

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeleton_measurements_table' + SMT.widgetID + '">' +
        '<thead>' + headings + '</thead>' +
        '<tfoot>' + headings + '</tfoot>' +
        '<tbody>' +
          '<tr>' + SMT.labels.map(function() { return '<td></td>'; }).join('') + '</tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container, null, SMT.destroy.bind(SMT));
    addLogic(win);

    SMT.init(); // Must be invoked after the table template has been created above.

    return {window: win, widget: SMT};
  };


  var createAnalyzeArbor = function() {
    var AA = new AnalyzeArbor();
    var win = new CMWWindow(AA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(AA));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = AA.loadSource.bind(AA);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = AA.clear.bind(AA);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = AA.update.bind(AA);
    buttons.appendChild(update);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.onclick = AA.adjustOptions.bind(AA);
    buttons.appendChild(options);

    var pies = document.createElement('input');
    pies.setAttribute("type", "button");
    pies.setAttribute("value", "Export charts as SVG");
    pies.onclick = AA.exportSVG.bind(AA);
    buttons.appendChild(pies);

    content.appendChild(buttons);

    var container = createContainer("table_analyze_arbor_widget" + AA.widgetID);
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="analyzearbor' + AA.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th rowspan="2">Neuron name</th>' +
            '<th colspan="5">Arbor</th>' +
            '<th colspan="5">Backbone</th>' +
            '<th colspan="5">Dendrites</th>' +
            '<th colspan="5">Axon terminals</th>' +
          '</tr>' +
          '<tr>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
          '</tr>' +
        '</thead>' +
      '</table>';

    container.appendChild(document.createElement('br'));
    container.appendChild(createContainer('analyze_widget_charts_div' + AA.widgetID));

    addListener(win, container, 'analyze_arbor' + AA.widgetID, AA.destroy.bind(AA));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();
    AA.init();

    return {window: win, widget: AA};
  };


  var createNeuronDendrogram = function(ndInstance) {
    var ND = ndInstance ? ndInstance : new NeuronDendrogram();
    var win = new CMWWindow(ND.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");
    buttons.setAttribute("id", "dendrogram_buttons" + ND.widgetID);
    buttons.setAttribute("class", "buttonpanel");

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Display active skeleton");
    load.onclick = ND.loadActiveSkeleton.bind(ND);
    buttons.appendChild(load);

    var exportSVG = document.createElement('input');
    exportSVG.setAttribute("type", "button");
    exportSVG.setAttribute("value", "Export SVG");
    exportSVG.onclick = ND.exportSVG.bind(ND);
    buttons.appendChild(exportSVG);

    var highlightTags = document.createElement('input');
    highlightTags.setAttribute("type", "button");
    highlightTags.setAttribute("value", "Highlight tags");
    highlightTags.onclick = ND.chooseHighlightTags.bind(ND);
    buttons.appendChild(highlightTags);

    var minStrahler = document.createElement('label');
    minStrahler.appendChild(document.createTextNode('Collapse Strahler <'));
    var minStrahlerInput = document.createElement('input');
    minStrahlerInput.setAttribute('type', 'number');
    minStrahlerInput.setAttribute('min', 1);
    minStrahlerInput.setAttribute('max', 999);
    minStrahlerInput.setAttribute('id', 'dendrogram-minStrahler-' + ND.widgetID);
    if (ND.minStrahler) {
      minStrahlerInput.value = ND.minStrahler;
    }
    minStrahlerInput.onchange = function(e) {
        ND.setMinStrahler(parseInt(this.value, 10));
        ND.update();
    };
    minStrahlerInput.oninput = function(e) {
      if (13 === e.keyCode) {
        ND.update();
      } else {
        ND.setMinStrahler(parseInt(this.value, 10));
      }
    };
    minStrahlerInput.onwheel = function(e) {
        if ((e.deltaX + e.deltaY) > 0) {
          if (this.value > 1) {
            this.value = parseInt(this.value, 10) - 1;
            this.onchange();
          }
        } else {
          this.value = parseInt(this.value, 10) + 1;
          this.onchange();
        }

        return false;
    };
    minStrahler.appendChild(minStrahlerInput);
    buttons.appendChild(minStrahler);

    var hSpacingFactor = document.createElement('label');
    hSpacingFactor.appendChild(document.createTextNode('H Space Factor'));
    var hSpacingFactorInput = document.createElement('input');
    hSpacingFactorInput.setAttribute('type', 'number');
    hSpacingFactorInput.setAttribute('min', 0.01);
    hSpacingFactorInput.setAttribute('max', 10);
    hSpacingFactorInput.setAttribute('step', 0.01);
    hSpacingFactorInput.setAttribute('id', 'dendrogram-hSpacingFactor-' + ND.widgetID);
    if (ND.hNodeSpaceFactor) {
      hSpacingFactorInput.value = ND.hNodeSpaceFactor.toFixed(2);
    }
    hSpacingFactorInput.onchange = function(e) {
        ND.setHSpaceFactor(parseFloat(this.value));
        ND.update();
    };
    hSpacingFactorInput.oninput = function(e) {
      if (13 === e.keyCode) {
        ND.update();
      } else {
        ND.setHSpaceFactor(parseFloat(this.value));
      }
    };
    hSpacingFactorInput.onwheel = function(e) {
        if ((e.deltaX + e.deltaY) > 0) {
          if (this.value > 0.01) {
            this.value = (parseFloat(this.value) - 0.01).toFixed(2);
            this.onchange();
          }
        } else {
          this.value = (parseFloat(this.value) + 0.01).toFixed(2);
          this.onchange();
        }

        return false;
    };
    hSpacingFactor.appendChild(hSpacingFactorInput);
    buttons.appendChild(hSpacingFactor);

    var vSpacingFactor = document.createElement('label');
    vSpacingFactor.appendChild(document.createTextNode('V Space Factor'));
    var vSpacingFactorInput = document.createElement('input');
    vSpacingFactorInput.setAttribute('type', 'number');
    vSpacingFactorInput.setAttribute('min', 0.01);
    vSpacingFactorInput.setAttribute('max', 10);
    vSpacingFactorInput.setAttribute('step', 0.01);
    vSpacingFactorInput.setAttribute('id', 'dendrogram-vSpacingFactor-' + ND.widgetID);
    if (ND.hNodeSpaceFactor) {
      vSpacingFactorInput.value = ND.vNodeSpaceFactor.toFixed(2);
    }
    vSpacingFactorInput.onchange = function(e) {
        ND.setVSpaceFactor(parseFloat(this.value));
        ND.update();
    };
    vSpacingFactorInput.oninput = function(e) {
      if (13 === e.keyCode) {
        ND.update();
      } else {
        ND.setVSpaceFactor(parseFloat(this.value));
      }
    };
    vSpacingFactorInput.onwheel = function(e) {
        if ((e.deltaX + e.deltaY) > 0) {
          if (this.value > 0.01) {
            this.value = (parseFloat(this.value) - 0.01).toFixed(2);
            this.onchange();
          }
        } else {
          this.value = (parseFloat(this.value) + 0.01).toFixed(2);
          this.onchange();
        }

        return false;
    };
    vSpacingFactor.appendChild(vSpacingFactorInput);
    buttons.appendChild(vSpacingFactor);

    var collapse = document.createElement('label');
    var collapseInput = document.createElement('input');
    collapseInput.setAttribute('type', 'checkbox');
    if (ND.collapsed) {
      collapseInput.setAttribute('checked', 'checked');
    }
    collapseInput.onchange = function() {
      ND.setCollapsed(this.checked);
      ND.update();
    };
    collapse.appendChild(collapseInput);
    collapse.appendChild(document.createTextNode('Only branches and tagged nodes'));
    buttons.appendChild(collapse);

    var collapseNotABranch = document.createElement('label');
    var collapseNotABranchInput = document.createElement('input');
    collapseNotABranchInput.setAttribute('type', 'checkbox');
    if (ND.collapseNotABranch) {
      collapseNotABranchInput.setAttribute('checked', 'checked');
    }
    collapseNotABranchInput.onchange = function() {
      ND.setCollapseNotABranch(this.checked);
      ND.update();
    };
    collapseNotABranch.appendChild(collapseNotABranchInput);
    collapseNotABranch.appendChild(document.createTextNode('Collapse \"not a branch\" nodes'));
    buttons.appendChild(collapseNotABranch);

    var naming = document.createElement('label');
    var namingInput = document.createElement('input');
    namingInput.setAttribute('type', 'checkbox');
    if (ND.showNodeIDs) {
      namingInput.setAttribute('checked', 'checked');
    }
    namingInput.onchange = function() {
      ND.setShowNodeIds(this.checked);
      ND.update();
    };
    naming.appendChild(namingInput);
    naming.appendChild(document.createTextNode('Show node IDs'));
    buttons.appendChild(naming);

    var showTags = document.createElement('label');
    var showTagsInput = document.createElement('input');
    showTagsInput.setAttribute('type', 'checkbox');
    if (ND.showTags) {
      showTagsInput.setAttribute('checked', 'checked');
    }
    showTagsInput.onchange = function() {
      ND.setShowTags(this.checked);
      ND.update();
    };
    showTags.appendChild(showTagsInput);
    showTags.appendChild(document.createTextNode('Show tags'));
    buttons.appendChild(showTags);

    var showStrahler = document.createElement('label');
    var showStrahlerInput = document.createElement('input');
    showStrahlerInput.setAttribute('type', 'checkbox');
    if (ND.showStrahler) {
      showStrahlerInput.setAttribute('checked', 'checked');
    }
    showStrahlerInput.onchange = function() {
      ND.setShowStrahler(this.checked);
      ND.update();
    };
    showStrahler.appendChild(showStrahlerInput);
    showStrahler.appendChild(document.createTextNode('Show Strahler'));
    buttons.appendChild(showStrahler);

    var warnCollapsed = document.createElement('label');
    var warnCollapsedInput = document.createElement('input');
    warnCollapsedInput.setAttribute('type', 'checkbox');
    if (ND.warnCollapsed) {
      warnCollapsedInput.setAttribute('checked', 'checked');
    }
    warnCollapsedInput.onchange = function() {
      ND.setWarnCollapsed(this.checked);
      ND.update();
    };
    warnCollapsed.appendChild(warnCollapsedInput);
    warnCollapsed.appendChild(document.createTextNode('Warn if collapsed'));
    warnCollapsed.setAttribute('alt', 'If activated, a warning is displayed ' +
        'everytime one tries to select a node that is currently collapsed.');
    buttons.appendChild(warnCollapsed);

    var radial = document.createElement('label');
    var radialInput = document.createElement('input');
    radialInput.setAttribute('type', 'checkbox');
    if (ND.radialDisplay) {
      radialInput.setAttribute('checked', 'checked');
    }
    radialInput.onchange = function() {
      ND.setRadialDisplay(this.checked);
      ND.update();
    };
    radial.appendChild(radialInput);
    radial.appendChild(document.createTextNode('Radial'));
    buttons.appendChild(radial);

    content.appendChild(buttons);

    var container = createContainer("dendrogram" + ND.widgetID);
    content.appendChild(container);

    addListener(win, container, 'dendrogram_buttons' + ND.widgetID,
        ND.destroy.bind(ND), ND.resize.bind(ND));
    addLogic(win);

    ND.init(container);

    return {window: win, widget: ND};
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

    var fileButton = buttons.appendChild(CATMAID.DOM.createFileButton(
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

    var c = appendSelect(buttons, null, 'Color scheme ',
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
      ST.setVisbilitySettingsVisible(this.checked);
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

    var tabs = appendTabs(bar, WA.widgetID, ['Main', 'View', 'Shading',
        'Skeleton filters', 'View settings', 'Shading parameters',
        'Animation', 'Export']);

    var select_source = CATMAID.skeletonListSources.createSelect(WA);

    appendToTab(tabs['Main'],
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
        ]);

    var storedViewsSelect = document.createElement('select');

    var connectorRestrictionsSl = document.createElement('select');
    connectorRestrictionsSl.options.add(new Option('All connectors', 'none', true, true));
    connectorRestrictionsSl.options.add(new Option('All shared connectors', 'all-shared'));
    connectorRestrictionsSl.options.add(new Option('All pre->post connectors', 'all-pre-post'));
    connectorRestrictionsSl.options.add(new Option('All group shared', 'all-group-shared'));
    connectorRestrictionsSl.options.add(new Option('All pre->post group shared', 'all-group-shared-pre-post'));
    connectorRestrictionsSl.onchange = function () {
      WA.setConnectorRestriction(this.value);
    };
    var connectorRestrictions = document.createElement('label');
    connectorRestrictions.appendChild(document.createTextNode('Connector restriction'));
    connectorRestrictions.appendChild(connectorRestrictionsSl);

    var viewControls = appendToTab(tabs['View'],
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
     ['creator', 'By Creator'],
     ['all-reviewed', 'All Reviewed'],
     ['whitelist-reviewed', 'Team Reviewed'],
     ['own-reviewed', 'Own Reviewed'],
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

    appendToTab(tabs['Shading'],
        [
          [document.createTextNode('Shading: ')],
          [shadingMenu],
          [' Inv:', false, WA.toggleInvertShading.bind(WA), true],
          [document.createTextNode(' Color:')],
          [colorMenu],
          [document.createTextNode(' Synapse color:')],
          [synColors],
          ['User colormap', WA.toggle_usercolormap_dialog.bind(WA)],
        ]);

    var adjustFn = function(param_name) {
      return function() {
        WA.options[param_name] = this.checked;
        WA.adjustStaticContent();
      };
    };
    var o = CATMAID.WebGLApplication.prototype.OPTIONS;

    var volumeSelection = CATMAID.DOM.createAsyncPlaceholder(
        CATMAID.fetch(project.id + '/volumes/', 'GET').then(function(json) {
          var volumes = json.reduce(function(o, volume) {
            o[volume.name] = volume.id;
            return o;
          }, {});
          // Create actual element based on the returned data
          var node = CATMAID.DOM.createCheckboxSelect('Volumes', volumes);
          // Add a selection handler
          node.onchange = function(e) {
            var visible = e.srcElement.checked;
            var volumeId = e.srcElement.value;
            WA.showVolume(volumeId, visible);
          };
          return node;
        }));

    appendToTab(tabs['View settings'],
        [
          ['Meshes ', false, function() { WA.options.show_meshes = this.checked; WA.adjustContent(); }, false],
          [volumeSelection],
          [WA.createMeshColorButton()],
          ['Active node', true, function() { WA.options.show_active_node = this.checked; WA.adjustContent(); }, false],
          ['Active node on top', false, function() { WA.options.active_node_on_top = this.checked; WA.adjustContent(); }, false],
          ['Black background', true, adjustFn('show_background'), false],
          ['Floor', true, adjustFn('show_floor'), false],
          ['Bounding box', true, adjustFn('show_box'), false],
          ['Z plane', false, adjustFn('show_zplane'), false],
          ['Debug', false, function() { WA.setDebug(this.checked); }, false],
          ['Missing sections', false, adjustFn('show_missing_sections'), false],
          ['with height:', o.missing_section_height, ' %', function() {
              WA.options.missing_section_height = Math.max(0, Math.min(this.value, 100));
              WA.adjustStaticContent();
            }, 4],
          ['Line width', o.skeleton_line_width, null, function() { WA.updateSkeletonLineWidth(this.value); }, 4],
          {
            type: 'numeric',
            label: 'Custom Tags (regex):',
            title: 'Display handle spheres for nodes with tags matching this regex (must refresh 3D viewer after changing).',
            value: o.custom_tag_spheres_regex,
            onchangeFn: function () { WA.options.custom_tag_spheres_regex = this.value; },
            length: 10
          }
        ]);

    var nodeScalingInput = appendNumericField(tabs['View settings'],
        'Node handle scaling', 'Size of handle spheres for tagged nodes.',
              o.skeleton_node_scaling, null, function() {
              WA.options.skeleton_node_scaling = Math.max(0, this.value) || 1.0;
              WA.adjustContent();
              WA.updateSkeletonNodeHandleScaling(this.value);
        }, 5);

    appendToTab(tabs['Skeleton filters'],
        [
          ['Smooth', o.smooth_skeletons, function() { WA.options.smooth_skeletons = this.checked; WA.updateSkeletons(); }, false],
          ['with sigma', o.smooth_skeletons_sigma, ' nm', function() { WA.updateSmoothSkeletonsSigma(this.value); }, 10],
          ['Resample', o.resample_skeletons, function() { WA.options.resample_skeletons = this.checked; WA.updateSkeletons(); }, false],
          ['with delta', o.resampling_delta, ' nm', function() { WA.updateResampleDelta(this.value); }, 10],
          ['Lean mode (no synapses, no tags)', o.lean_mode, function() { WA.options.lean_mode = this.checked; WA.updateSkeletons();}, false],
        ]);

    appendToTab(tabs['Shading parameters'],
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
    axisOptions.options.add(new Option("Camera Up", "up"));
    axisOptions.options.add(new Option("X", "x"));
    axisOptions.options.add(new Option("Y", "y"));
    axisOptions.options.add(new Option("Z", "z"));
    axisOptions.onchange = function() {
      WA.options.animation_axis = this.value;
    };
    var axisOptionsLabel = document.createElement('label');
    axisOptionsLabel.appendChild(document.createTextNode('Rotation axis:'));
    axisOptionsLabel.appendChild(axisOptions);

    appendToTab(tabs['Animation'],
        [
          ['Play', function() {
            try {
              WA.startAnimation(WA.createAnimation());
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
            onchangeFn: function(e) {
              var type = this.value;
              if ('one-per-rotation' === type) {
                type = 'n-per-rotation';
                WA.setAnimationNeuronVisibility(type, {n: 1});
              } else if ('n-per-rotation' === type) {
                // Ask for n
                var dialog = new CATMAID.OptionsDialog();
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
                var dialog = new CATMAID.OptionsDialog();
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

    appendToTab(tabs['Export'],
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

    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof project === undefined || project === null) {
              rootWindow.close();
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
          CATMAID.SkeletonSource.UNION, Subscription.ALL_EVENTS));
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
    content.style.backgroundColor = '#ffffff';

    var bar = document.createElement('div');
    bar.setAttribute("id", "synapse_fractions_buttons" + SF.widgetID);
    bar.setAttribute('class', 'buttonpanel');

    var tabs = appendTabs(bar, SF.widgetID, ['Main', 'Filter', 'Color', 'Partner groups']);

    var partners_source = CATMAID.skeletonListSources.createPushSelect(SF, "filter");
    partners_source.onchange = SF.onchangeFilterPartnerSkeletons.bind(SF);

    var modes = createSelect("synapse_fraction_mode" + SF.widgetID, SF.MODES);
    modes.onchange = SF.onchangeMode.bind(SF, modes);

    appendToTab(tabs['Main'],
        [[document.createTextNode('From')],
         [CATMAID.skeletonListSources.createSelect(SF)],
         ['Append', SF.loadSource.bind(SF)],
         ['Clear', SF.clear.bind(SF)],
         ['Refresh', SF.update.bind(SF)],
         [document.createTextNode(' - ')],
         [modes],
         [document.createTextNode(' - ')],
         ['Export SVG', SF.exportSVG.bind(SF)]]);

    var nf = createNumericField("synapse_threshold" + SF.widgetID, // id
                                "By synapse threshold: ",             // label
                                "Below this number, neuron gets added to the 'others' heap", // title
                                SF.threshold,                            // initial value
                                undefined,                               // postlabel
                                SF.onchangeSynapseThreshold.bind(SF),    // onchangeFn
                                5);                                      // textfield length in number of chars

    var cb = createCheckbox('show others', SF.show_others, SF.toggleOthers.bind(SF));

    appendToTab(tabs['Filter'],
        [[nf],
         [document.createTextNode(' - Only in: ')],
         [partners_source],
         [cb[0]],
         [cb[1]]
        ]);

    var partners_color = CATMAID.skeletonListSources.createPushSelect(SF, "color");
    partners_color.onchange = SF.onchangeColorPartnerSkeletons.bind(SF);

    var c = createSelect('color-scheme-synapse-fractions' + SF.widgetID,
        ['category10',
         'category20',
         'category20b',
         'category20c'].concat(Object.keys(colorbrewer)));

    c.selectedIndex = 1;
    c.onchange = SF.onchangeColorScheme.bind(SF, c);

    appendToTab(tabs['Color'],
        [[document.createTextNode("Color scheme: ")],
         [c],
         [document.createTextNode("Color by: ")],
         [partners_color]]);

    var partner_group = CATMAID.skeletonListSources.createPushSelect(SF, "group");

    appendToTab(tabs['Partner groups'],
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

    var tabs = appendTabs(bar, SP.widgetID, ['Main', 'Options']);

    var compartment = createSelect("synapse_plot_compartment" + SP.widgetID, SP.COMPARTMENTS);
    compartment.onchange = SP.onchangeCompartment.bind(SP, compartment);

    appendToTab(tabs['Main'],
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

    var nf = createNumericField("synapse_count_threshold" + SP.widgetID, // id
                                "Synapse count threshold: ",             // label
                                "Synapse count threshold",               // title
                                SP.threshold,                            // initial value
                                undefined,                               // postlabel
                                SP.onchangeSynapseThreshold.bind(SP),    // onchangeFn
                                5);                                      // textfield length in number of chars

    var filter = CATMAID.skeletonListSources.createPushSelect(SP, "filter");
    filter.onchange = SP.onchangeFilterPresynapticSkeletons.bind(SP);

    var ais_choice = createSelect("synapse_plot_AIS_" + SP.widgetID, ["Computed", "Node tagged with..."], "Computed");

    var tag = createNumericField("synapse_count_tag" + SP.widgetID,
                                 undefined,
                                 "Tag",
                                 "",
                                 undefined,
                                 undefined,
                                 10);
    tag.onchange = SP.onchangeAxonInitialSegmentTag.bind(SP, tag);

    ais_choice.onchange = SP.onchangeChoiceAxonInitialSegment.bind(SP, ais_choice, tag);

    var jitter = createNumericField("synapse_plot_jitter" + SP.widgetID,
                                   undefined,
                                   "Jitter",
                                   SP.jitter,
                                   undefined,
                                   undefined,
                                   5);

    jitter.onchange = SP.onchangeJitter.bind(SP, jitter);

    var choice_coloring = CATMAID.skeletonListSources.createPushSelect(SP, "coloring");
    choice_coloring.onchange = SP.onchangeColoring.bind(SP);

    var sigma = createNumericField("synapse_plot_smooth" + SP.widgetID,
                                   "Arbor smoothing: ",
                                   "Gaussian smoothing sigma",
                                   SP.sigma,
                                   " nm",
                                   SP.onchangeSigma.bind(SP),
                                   5);

    appendToTab(tabs['Options'],
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

    var tabs = appendTabs(bar, GG.widgetID, ['Main', 'Grow', 'Graph',
        'Selection', 'Subgraphs', 'Align', 'Export']);

    appendToTab(tabs['Main'],
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

    tabs['Export'].appendChild(CATMAID.DOM.createFileButton(
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

    var layout = appendSelect(tabs['Graph'], null, null, GG.layoutStrings);

    var edges = document.createElement('select');
    edges.setAttribute('id', 'graph_edge_threshold' + GG.widgetID);
    for (var i=1; i<101; ++i) edges.appendChild(new Option(i, i));

    var edgeConfidence = document.createElement('select');
    edgeConfidence.setAttribute('id', 'graph_edge_confidence_threshold' + GG.widgetID);
    for (var i=1; i<6; ++i) edgeConfidence.appendChild(new Option(i, i));
    edges.onchange = edgeConfidence.onchange = function() {
        GG.filterEdges($('#graph_edge_threshold' + GG.widgetID).val(),
                       $('#graph_edge_confidence_threshold' + GG.widgetID).val()); };

    appendToTab(tabs['Graph'],
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

    appendToTab(tabs['Selection'],
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

    appendToTab(tabs['Align'],
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

    appendToTab(tabs['Grow'],
        [[document.createTextNode('Grow ')],
         ['Circles', GG.growGraph.bind(GG)],
         [document.createTextNode(" by ")],
         [createSelect("gg_n_circles_of_hell" + GG.widgetID, [1, 2, 3, 4, 5])],
         [document.createTextNode(" orders, limit:")],
         [f("upstream")],
         [f("downstream")],
         [createNumericField('gg_filter_regex' + GG.widgetID, 'filter (regex):',
                             'Only include neighbors with annotations matching this regex.',
                             '', '', undefined, 4)],
         [document.createTextNode(" - Find ")],
         ['paths', GG.growPaths.bind(GG)],
         [document.createTextNode(" by ")],
         [createSelect("gg_n_hops" + GG.widgetID, [2, 3, 4, 5, 6])],
         [document.createTextNode(" hops, limit:")],
         [f("path_synapses")],
         ['pick sources', GG.pickPathOrigins.bind(GG, 'source'), {id: 'gg_path_source' + GG.widgetID}],
         ['X', GG.clearPathOrigins.bind(GG, 'source')],
         ['pick targets', GG.pickPathOrigins.bind(GG, 'target'), {id: 'gg_path_target' + GG.widgetID}],
         ['X', GG.clearPathOrigins.bind(GG, 'target')]]);

    appendToTab(tabs['Export'],
        [['Export GML', GG.exportGML.bind(GG)],
         ['Export SVG', GG.exportSVG.bind(GG)],
         ['Export Adjacency Matrix', GG.exportAdjacencyMatrix.bind(GG)],
         ['Open plot', GG.openPlot.bind(GG)],
         ['Quantify', GG.quantificationDialog.bind(GG)]]);

    appendToTab(tabs['Subgraphs'],
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


  var createMorphologyPlotWindow = function() {

    var MA = new MorphologyPlot();

    var win = new CMWWindow(MA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'morphology_plot_buttons' + MA.widgetID);
    buttons.setAttribute('class', 'buttonpanel');
    DOM.addSourceControlsToggle(win, MA);
    DOM.addButtonDisplayToggle(win);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(CATMAID.skeletonListSources.createSelect(MA));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append");
    add.onclick = MA.loadSource.bind(MA);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = MA.clear.bind(MA);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = MA.update.bind(MA);
    buttons.appendChild(update);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.onclick = MA.annotate_skeleton_list.bind(MA);
    buttons.appendChild(annotate);

    buttons.appendChild(document.createTextNode(' - '));

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = MA.exportCSV.bind(MA);
    buttons.appendChild(csv);

    var svg = document.createElement('input');
    svg.setAttribute("type", "button");
    svg.setAttribute("value", "Export SVG");
    svg.onclick = MA.exportSVG.bind(MA);
    buttons.appendChild(svg);

    buttons.appendChild(document.createElement('br'));

    appendSelect(buttons, "function", null,
        ['Sholl analysis',
         'Radial density of cable',
         'Radial density of branch nodes',
         'Radial density of ends',
         'Radial density of input synapses',
         'Radial density of output synapses']);

    buttons.appendChild(document.createTextNode(' Radius (nm): '));
    var radius = document.createElement('input');
    radius.setAttribute("id", "morphology_plot_step" + MA.widgetID);
    radius.setAttribute("type", "text");
    radius.setAttribute("value", "1000");
    radius.style.width = "40px";
    buttons.appendChild(radius);

    appendSelect(buttons, "center", ' Center: ',
        ['First branch node',
         'Root node',
         'Active node',
         'Bounding box center',
         'Average node position',
         'Highest centrality node',
         'Highest signal flow centrality']);

    var redraw = document.createElement('input');
    redraw.setAttribute("type", "button");
    redraw.setAttribute("value", "Draw");
    redraw.onclick = MA.redraw.bind(MA);
    buttons.appendChild(redraw);

    content.appendChild(buttons);

    var container = createContainer('morphology_plot_div' + MA.widgetID);
    content.appendChild(container);

    addListener(win, container, 'morphology_plot_buttons' + MA.widgetID, MA.destroy.bind(MA), MA.resize.bind(MA));

    addLogic(win);

    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: MA};
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

  var createNodeTableWindow = function(tnt_instance)
  {
    var TNT = tnt_instance ? tnt_instance : new TreenodeTable();
    var win = new CMWWindow(TNT.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_skeleton_buttons' + TNT.widgetID);
    contentbutton.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);

    contentbutton.appendChild(document.createTextNode('From'));
    contentbutton.appendChild(CATMAID.skeletonListSources.createSelect(TNT));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append");
    add.onclick = TNT.loadSource.bind(TNT);
    contentbutton.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = TNT.clear.bind(TNT);
    contentbutton.appendChild(clear);

    var refresh = document.createElement('input');
    refresh.setAttribute("type", "button");
    refresh.setAttribute("value", "Refresh");
    refresh.onclick = TNT.refresh.bind(TNT);
    contentbutton.appendChild(refresh);

    content.appendChild( contentbutton );

    var container = createContainer("treenode_table_widget" + TNT.widgetID);
    content.appendChild( container );

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="treenodetable' + TNT.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type' +
              '' +
              '<select name="search_type" id="search_type' + TNT.widgetID + '" class="search_init">' +
              '<option value="">Any</option><option value="R">Root</option><option value="L" selected="selected">Leaf</option>' +
              '<option value="B">Branch</option><option value="S">Slab</option></select>' +
            '</th>' +
        // <input type="text" name="search_type" value="Search" class="search_init" />
            '<th>tags<input type="text" name="search_labels" id="search_labels' + TNT.widgetID + '" value="Search" class="search_init" /></th>' +
            '<th>c</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</th>' +
            '<th>r</th>' +
            '<th>user</th>' +
            '<th>last modified</th>' +
            '<th>reviewer</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>tags</th>' +
            '<th>c</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</th>' +
            '<th>r</th>' +
            '<th>user</th>' +
            '<th>last modified</th>' +
            '<th>reviewer</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
          '</tr>' +
        '</tbody>' +
      '</table>';
    // Above notice that without an empty row the table will fail to initialize.
    // This empty row gets removed when calling fnClearTable

    addListener(win, container, 'table_of_skeleton_buttons' + TNT.widgetID, TNT.destroy.bind(TNT));

    addLogic(win);

    TNT.init( project.getId() );

    return {window: win, widget: TNT};
  };

  var createConnectorTableWindow = function(ct_instance)
  {
    var CT = ct_instance ? ct_instance : new ConnectorTable();
    var win = new CMWWindow(CT.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_connector_buttons' + CT.widgetID);
    contentbutton.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_connectortable_current_skeleton" + CT.widgetID);
    add.setAttribute("value", "List current skeleton");
    add.onclick = CT.updateConnectorTable.bind(CT);
    contentbutton.appendChild(add);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "refresh_connectortable_current_skeleton" + CT.widgetID);
    add.setAttribute("value", "Refresh");
    add.onclick = CT.refreshConnectorTable.bind(CT);
    contentbutton.appendChild(add);

    var direction = document.createElement('select');
    direction.setAttribute("id", "connector_relation_type" + CT.widgetID);
    var objOption = document.createElement("option");
    objOption.innerHTML = "Incoming connectors";
    objOption.value = "0";
    direction.appendChild(objOption);
    var objOption2 = document.createElement("option");
    objOption2.innerHTML = "Outgoing connectors";
    objOption2.value = "1";
    objOption2.selected = "selected";
    direction.appendChild(objOption2);
    contentbutton.appendChild(direction);

    content.appendChild( contentbutton );

    var container = createContainer("connectortable_widget" + CT.widgetID);
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectortable'+ CT.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_top' + CT.widgetID + '">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>confidence</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_top' + CT.widgetID + '"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_top' + CT.widgetID + '">target treenode ID</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_bottom' + CT.widgetID + '">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>confidence</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_bottom' + CT.widgetID + '"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_bottom' + CT.widgetID + '">target treenode ID</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</tfoot>' +
      '</table>';


    addListener(win, container, 'table_of_connector_buttons' + CT.widgetID, CT.destroy.bind(CT));

    addLogic(win);

    CT.init( project.getId() );

    return {window: win, widget: CT};
  };


  var createSkeletonAnalyticsWindow = function()
  {
    var SA = new SkeletonAnalytics();

    var win = new CMWWindow(SA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var div = document.createElement('div');
    div.setAttribute('id', 'skeleton_analytics');
    content.appendChild(div);

    div.appendChild(CATMAID.skeletonListSources.createSelect(SA));

    appendSelect(div, "extra" + SA.widgetID, ' extra ', [
        {title: "No others", value: 0},
        {title: "Downstream skeletons", value: 1},
        {title: "Upstream skeletons", value: 2},
        {title: "Both upstream and downstream", value: 3}]);
    var adjacents = [];
    for (var i=0; i<5; ++i) adjacents.push(i);
    appendSelect(div, "adjacents" + SA.widgetID, ' adjacents ', adjacents);

    var update = document.createElement('input');
    update.setAttribute('type', 'button');
    update.setAttribute('value', 'Update');
    update.onclick = SA.load.bind(SA);
    div.appendChild(update);

    var container = createContainer('skeleton_analytics_widget');
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeletonanalyticstable' + SA.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>Issue</th>' +
            '<th>Neuron ID</th>' +
            '<th>Treenode ID</th>' +
            '<th>Skeleton ID</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>Issue</th>' +
            '<th>Neuron ID</th>' +
            '<th>Treenode ID</th>' +
            '<th>Skeleton ID</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td></td><td></td><td></td><td></td></tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container, 'skeleton_analytics', SA.destroy.bind(SA));
    addLogic(win);

    SA.init(); // must be called after the above placeholder table is created
    CATMAID.skeletonListSources.updateGUI();

    return {window: win, widget: SA};
  };

    var createLogTableWindow = function()
    {
        var win = new CMWWindow("Log");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'table_of_log_buttons');
        contentbutton.setAttribute('class', 'buttonpanel');
        DOM.addButtonDisplayToggle(win);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "update_logtable");
        add.setAttribute("value", "Update table");
        add.onclick = updateLogTable; // function declared in table_log.js
        contentbutton.appendChild(add);

        /* users */
        var sync = document.createElement('select');
        sync.setAttribute("id", "logtable_username");
        var option = document.createElement("option");
        option.text = "All";
        option.value = "All";
        sync.appendChild(option);
        option = document.createElement("option");
        option.text = "Team";
        option.value = "Team";
        sync.appendChild(option);
        contentbutton.appendChild(sync);

        requestQueue.register(django_url + 'user-list', 'GET', undefined,
            function (status, data, text) {
                var e = $.parseJSON(data);
                if (status !== 200) {
                    alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
                } else {
                    var new_users = document.getElementById("logtable_username");
                    for (var i in e) {
                        var option = document.createElement("option");
                        option.text = e[i].login + " (" + e[i].full_name + ")";
                        option.value = e[i].id;
                        new_users.appendChild(option);
                    }
                }
        });

        var sync = document.createElement('select');
        sync.setAttribute("id", "logtable_operationtype");
        var option = document.createElement("option");
        option.text = "All";
        option.value = -1;
        sync.appendChild(option);
        var operation_type_array = [
          "rename_root",
          "create_neuron",
          "rename_neuron",
          "remove_neuron",
          "move_neuron",

          "create_group",
          "rename_group",
          "remove_group",
          "move_group",

          "create_skeleton",
          "rename_skeleton",
          "remove_skeleton",
          "move_skeleton",

          "split_skeleton",
          "join_skeleton",
          "reroot_skeleton",

          "change_confidence",

          "reset_reviews"
        ];
        for( var i = 0; i < operation_type_array.length; i++ ) {
          var option = document.createElement("option");
            option.text = operation_type_array[i];
            option.value = operation_type_array[i];
            sync.appendChild(option);
        }
        contentbutton.appendChild(sync);
        content.appendChild( contentbutton );

        var container = createContainer("logtable_widget");
        content.appendChild(container);

        container.innerHTML =
            '<table cellpadding="0" cellspacing="0" border="0" class="display" id="logtable">' +
                '<thead>' +
                '<tr>' +
                    '<th>user</th>' +
                    '<th>operation</th>' +
                    '<th>timestamp</th>' +
                    '<th>x</th>' +
                    '<th>y</th>' +
                    '<th>z</th>' +
                    '<th>freetext<input type="text" name="search_freetext" id="search_freetext" value="" class="search_init" /></th>' +
                '</tr>' +
                '</thead>' +
                '<tfoot>' +
                '<tr>' +
                    '<th>user</th>' +
                    '<th>operation</th>' +
                    '<th>timestamp</th>' +
                    '<th>x</th>' +
                    '<th>y</th>' +
                    '<th>z</th>' +
                    '<th>freetext</th>' +
                '</tr>' +
                '</tfoot>' +
            '</table>';

        addListener(win, container, 'table_of_log_buttons');

        addLogic(win);

        LogTable.init( project.getId() );

        return {window: win, widget: null};
    };

    var createReviewWindow = function()
    {
        var win = new CMWWindow("Review System");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var bar = document.createElement( "div" );
        bar.id = "review_widget_buttons";
        bar.setAttribute('class', 'buttonpanel');
        DOM.addButtonDisplayToggle(win);

        var RS = CATMAID.ReviewSystem;
        RS.init();

        var tabs = appendTabs(bar, '-review', ['Main', 'Miscellaneous']);

        appendToTab(tabs['Main'],
            [
              ['Start to review skeleton',
                  RS.startReviewActiveSkeleton.bind(RS, false)],
              ['Start to review current sub-arbor',
                  RS.startReviewActiveSkeleton.bind(RS, true)],
              ['End review', RS.endReview.bind(RS)],
              ['Reset own revisions', RS.resetOwnRevisions.bind(RS)],
              ['Auto centering', RS.getAutoCentering(),
                  function() { RS.setAutoCentering(this.checked); }, false]
            ]);

        appendToTab(tabs['Miscellaneous'],
            [
              ['In-between node step', RS.virtualNodeStep, null, function() {
                  RS.virtualNodeStep = parseInt(this.value, 10);
                }, 3],
              ['Cache tiles', false, RS.cacheImages.bind(this), false],
              ['No refresh after segment done', RS.noRefreshBetwenSegments,
                  function() { RS.noRefreshBetwenSegments = this.checked; }, false]
            ]);

        content.appendChild(bar);
        $(bar).tabs();

        var container = createContainer('review_widget');

        var cacheCounter = document.createElement('div');
        cacheCounter.setAttribute("id", "counting-cache");
        container.appendChild(cacheCounter);

        var cacheInfoCounter = document.createElement('div');
        cacheInfoCounter.setAttribute("id", "counting-cache-info");
        container.appendChild(cacheInfoCounter);

        var label = document.createElement('div');
        label.setAttribute("id", "reviewing_skeleton");
        container.appendChild(label);

        var table = document.createElement("div");
        table.setAttribute("id", "project_review_widget");
        table.style.position = "relative";
        table.style.width = "100%";
        table.style.overflow = "auto";
        table.style.backgroundColor = "#ffffff";
        container.appendChild(table);

        content.appendChild(container);
        addListener(win, container, 'review_widget_buttons');
        addLogic(win);

        return {window: win, widget: RS};
    };

    var createConnectivityWindow = function()
    {
        var SC = new CATMAID.SkeletonConnectivity();
        var widgetID = SC.widgetID;

        var win = new CMWWindow(SC.getName());
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("class", "buttonpanel");
        contentbutton.setAttribute("id", 'skeleton_connectivity_buttons' + widgetID);
        DOM.addSourceControlsToggle(win, SC);
        DOM.addButtonDisplayToggle(win);

        contentbutton.appendChild(document.createTextNode('From'));
        contentbutton.appendChild(CATMAID.skeletonListSources.createSelect(SC));

        var op = document.createElement('select');
        op.setAttribute('id', 'connectivity_operation' + widgetID);
        op.appendChild(new Option('All partners', 'OR'));
        op.appendChild(new Option('Common partners', 'AND')); // added prefix, otherwise gets sent as nonsense
        contentbutton.appendChild(op);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = SC.loadSource.bind(SC);
        contentbutton.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = SC.clear.bind(SC);
        contentbutton.appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = SC.update.bind(SC);
        contentbutton.appendChild(update);

        var plot = document.createElement('input');
        plot.setAttribute("type", "button");
        plot.setAttribute("value", "Open plot");
        plot.onclick = SC.openPlot.bind(SC);
        contentbutton.appendChild(plot);

        var plot2 = document.createElement('input');
        plot2.setAttribute("type", "button");
        plot2.setAttribute("value", "Open partner chart");
        plot2.onclick = SC.openStackedBarChart.bind(SC);
        contentbutton.appendChild(plot2);

        var layoutToggle = document.createElement('input');
        layoutToggle.setAttribute('id', 'connectivity-layout-toggle-' + widgetID);
        layoutToggle.setAttribute('type', 'checkbox');
        if (SC.tablesSideBySide) {
          layoutToggle.setAttribute('checked', 'checked');
        }
        layoutToggle.onchange = (function() {
          this.tablesSideBySide = this.checked;
        }).bind(SC);
        var layoutLabel = document.createElement('label');
        layoutLabel.appendChild(document.createTextNode('Tables side by side'));
        layoutLabel.appendChild(layoutToggle);
        contentbutton.appendChild(layoutLabel);

        var autoUpdate = document.createElement('input');
        autoUpdate.setAttribute('id', 'connectivity-auto-update-' + widgetID);
        autoUpdate.setAttribute('type', 'checkbox');
        if (SC.autoUpdate) {
          autoUpdate.setAttribute('checked', 'checked');
        }
        autoUpdate.onchange = function(e) {
          SC.autoUpdate = this.checked;
        };
        var autoUpdateLabel = document.createElement('label');
        autoUpdateLabel.appendChild(document.createTextNode('Auto update'));
        autoUpdateLabel.appendChild(autoUpdate);
        contentbutton.appendChild(autoUpdateLabel);

        var gapjunctionToggle = document.createElement('input');
        gapjunctionToggle.setAttribute('id', 'connectivity-gapjunctiontable-toggle-' + widgetID);
        gapjunctionToggle.setAttribute('type', 'checkbox');
        if (SC.showGapjunctionTable) {
          gapjunctionToggle.setAttribute('checked', 'checked');
        }
        gapjunctionToggle.onchange = (function() {
          this.showGapjunctionTable = this.checked;
        }).bind(SC);
        var gapjunctionLabel = document.createElement('label');
        gapjunctionLabel.appendChild(document.createTextNode('Show gap junctions'));
        gapjunctionLabel.appendChild(gapjunctionToggle);
        contentbutton.appendChild(gapjunctionLabel);

        content.appendChild( contentbutton );

        var container = createContainer( "connectivity_widget" + widgetID );
        container.classList.add('connectivity_widget');
        content.appendChild( container );

        addListener(win, container, 'skeleton_connectivity_buttons' + widgetID, SC.destroy.bind(SC));

        addLogic(win);
        CATMAID.skeletonListSources.updateGUI();

        return {window: win, widget: SC};
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

  var createExportWidget = function()
  {
      var win = new CMWWindow("Export widget");
      var content = win.getFrame();
      content.style.backgroundColor = "#ffffff";

      var container = createContainer( "project_export_widget" );
      content.appendChild( container );

      addListener(win, container);

      addLogic(win);

      $('#project_export_widget').load(django_url + project.id + '/exportwidget',
        function(response, status, xhr) {
          if (status == "success") {
            // Bind NetworkX JSON link to handler
            $(this).find('#export-networkx').click(function() {
              graphexport_nxjson();
            });
            // Bind NeuroML link to handler
            $(this).find('#export-neuroml181').click(function() {
              graphexport_NeuroML181();
            });
            // Bind treenode export link to handler
            $(this).find('#export-treenode-archive').click(function() {
              // Show dialog to select
              export_treenodes();
            });
            // Bind connector export link to handler
            $(this).find('#export-connector-archive').click(function() {
              // Show dialog to select
              export_connectors();
            });
            // Bind tree geometry export link to handler
            $(this).find('#export-tree-geometry').click(function() {
              // Show dialog to select
              export_tree_geometry();
            });
          }
        });

      return {window: win, widget: null};
  };


  var createOntologyWidget = function()
  {
    var win = new CMWWindow( "Ontology editor" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "ontology_editor_widget" );
    content.appendChild( container );

    container.innerHTML =
      '<input type="button" id="refresh_ontology_editor" value="refresh" style="display:block; float:left;" />' +
      '<br clear="all" />' +
      '<div id="ontology_known_roots">Known root class names: <span id="known_root_names"></span></div>' +
      '<div id="ontology_warnings"></div>' +
      '<div id="ontology_tree_name"><h4>Ontology</h4>' +
      '<div id="ontology_tree_object"></div></div>' +
      '<div id="ontology_relations_name"><h4>Relations</h4>' +
      '<div id="ontology_relations_tree"></div></div>' +
      '<div id="ontology_classes_name"><h4>Classes</h4>' +
      '<div id="ontology_classes_tree"></div></div>' +
      '<div id="ontology_add_dialog" style="display:none; cursor:default">' +
      '<div id="input_rel"><p>New relation name: <input type="text" id="relname" /></p></div>' +
      '<div id="input_class"><p>New class name: <input type="text" id="classname" /></p></div>' +
      '<div id="select_class"><p>Subject: <select id="classid"></p></select></div>' +
      '<div id="select_rel"></p>Relation: <select id="relid"></select></p></div>' +
      '<div id="target_rel"><p>Relation: <span id="name"></span></p></div>' +
      '<div id="target_object"><p>Object: <span id="name"></span></p></div>' +
      '<p><input type="button" id="cancel" value="Cancel" />' +
      '<input type="button" id="add" value="Add" /></p></div>' +
      '<div id="cardinality_restriction_dialog" style="display:none; cursor:default">' +
      '<p><div id="select_type">Cardinality type: <select id="cardinality_type"></select></div>' +
      '<div id="input_value">Cardinality value: <input type="text" id="cardinality_val" /></div></p>' +
      '<p><input type="button" id="cancel" value="Cancel" />' +
      '<input type="button" id="add" value="Add" /></p></div>';

    addListener(win, container);

    addLogic(win);

    OntologyEditor.init();

    return {window: win, widget: null};
  };

  var createOntologySearchWidget = function(osInstance)
  {
    // If available, a new instance passed as parameter will be used.
    var OS = osInstance ? osInstance : new OntologySearch();
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

  var createClassificationWidget = function()
  {
    var win = new CMWWindow( "Classification editor" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "classification_editor_widget" );
    content.appendChild( container );

    addListener(win, container);

    addLogic(win);

    ClassificationEditor.init();

    return {window: win, widget: null};
  };

  var createClusteringWidget = function()
  {
    var win = new CMWWindow( "Clustering" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "clustering_widget" );
    content.appendChild( container );

    container.innerHTML = '<div id="clustering_content"></div>';

    addListener(win, container);

    addLogic(win);

    ClusteringWidget.init();

    return {window: win, widget: null};
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
      .append('CATMAID &copy;&nbsp;2007&ndash;2016 ' +
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


  var createStatisticsWindow = function()
  {
    var win = new CMWWindow( "Statistics" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "project_stats_widget" );
    content.appendChild( container );

    addListener(win, container);

    addLogic(win);

    CATMAID.ProjectStatistics.init();

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

  var createNeuronAnnotationsWindow = function()
  {
    var NA = new CATMAID.NeuronAnnotations();
    var win = new CMWWindow(NA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var queryFields = document.createElement('div');
    queryFields.setAttribute('id', 'neuron_annotations_query_fields' + NA.widgetID);
    queryFields.setAttribute('class', 'buttonpanel');
    DOM.addButtonDisplayToggle(win);

    // Create the query fields HTML and use {{NA-ID}} as template for the
    // actual NA.widgetID which will be replaced afterwards.
    var queryFields_html =
      '<form id="neuron_query_by_annotations{{NA-ID}}" autocomplete="on">' +
      '<table cellpadding="0" cellspacing="0" border="0" ' +
          'class="neuron_annotations_query_fields" ' +
          'id="neuron_annotations_query_fields{{NA-ID}}">' +
        '<tr id="neuron_query_by_name{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">named as:</td> ' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_name" ' +
                'id="neuron_query_by_name{{NA-ID}}" value="" class="" />' +
            '<em>(optional)</em>' +
          '</td> ' +
        '</tr>' +
        '<tr id="neuron_query_by_annotation{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">annotated:</td> ' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_annotation" autocomplete="off" ' +
                'class="neuron_query_by_annotation_name{{NA-ID}}" value="" placeholder="Use / for RegEx" />' +
            '<input type="checkbox" name="neuron_query_include_subannotation" ' +
                'class="neuron_query_include_subannotation{{NA-ID}}" value="" />' +
            'Include sub-annotations ' +
            '<input type="button" name="neuron_annotations_add_annotation" ' +
                'id="neuron_annotations_add_annotation{{NA-ID}}" value="+" ' +
                'class="" />' +
          '</td> ' +
        '</tr>' +
        '<tr id="neuron_query_by_annotator{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">by:</td>' +
          '<td class="neuron_annotations_query_field">' +
            '<select name="neuron_query_by_annotator" ' +
                'id="neuron_query_by_annotator{{NA-ID}}" class="">' +
              '<option value="-2">Anyone</option>' +
              '<option value="Team">Team</option>' +
            '</select>' +
          '</td>' +
        '</tr>' +
        '<tr id="neuron_query_by_date_range{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">between:</td>' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_start_date" ' +
                'id="neuron_query_by_start_date{{NA-ID}}" size="10" ' +
                'value="" class=""/>' +
            ' and ' +
            '<input type="text" name="neuron_query_by_end_date" ' +
                'id="neuron_query_by_end_date{{NA-ID}}" size="10" ' +
                'value="" class=""/> ' +
          '</td>' +
        '</tr>' +
      '</table>' +
      '<input type="submit" />' +
      '</form>';
    // Replace {{NA-ID}} with the actual widget ID
    queryFields.innerHTML = queryFields_html.replace(/{{NA-ID}}/g, NA.widgetID);
    content.appendChild(queryFields);

    var container = createContainer("neuron_annotations_query_results" + NA.widgetID);
    // Create container HTML and use {{NA-ID}} as template for the
    // actual NA.widgetID which will be replaced afterwards.
    var container_html =
      '<div id="neuron_annotations_query_footer{{NA-ID}}" ' +
          'class="neuron_annotations_query_footer">' +
        '<input type="button" id="neuron_annotations_annotate{{NA-ID}}" ' +
            'value="Annotate" />' +
        '<input type="button" id="neuron_annotations_export_csv{{NA-ID}}" ' +
            'value="Export CSV" title="Export selected neuron IDs and names. ' +
            'Annotations are exported if displayed."/>' +
        '<label>' +
          '<input type="checkbox" id="neuron_search_show_annotations{{NA-ID}}" />' +
          'Show annotations' +
        '</label>' +
      '</div>' +
      '<table cellpadding="0" cellspacing="0" border="0" ' +
            'class="neuron_annotations_query_results_table display" ' +
            'id="neuron_annotations_query_results_table{{NA-ID}}">' +
        '<thead>' +
          '<tr>' +
            '<th>' +
              '<input type="checkbox" ' +
                  'id="neuron_annotations_toggle_neuron_selections_checkbox{{NA-ID}}" />' +
              '<span>Entity Name</span>' +
            '</th>' +
            '<th>Type</th>' +
            '<th>' +
              '<div class="result_annotations_column">Annotations</div>' +
              '<div>' +
                '<label for="neuron_annotations_user_filter{{NA-ID}}">' +
                    'By ' +
                '</label>' +
                '<select name="annotator_filter" class="" ' +
                    'id="neuron_annotations_user_filter{{NA-ID}}">' +
                  '<option value="show_all" selected>Anyone</option>' +
                '</select>' +
              '</div>' +
            '</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr><td colspan="3"></td></tr>' +
        '</tbody>' +
      '</table>';
    // Replace {{NA-ID}} with the actual widget ID
    container.innerHTML = container_html.replace(/{{NA-ID}}/g, NA.widgetID);
    content.appendChild( container );

    // Add a container that gets displayed if no results could be found
    var no_results = createContainer("neuron_annotations_query_no_results" + NA.widgetID);
    no_results.innerHTML = '<em>No results could be found.</em>';
    content.appendChild(no_results);
    $(no_results).hide();


    // Wire it up.
    addListener(win, container, queryFields.id, NA.destroy.bind(NA));
    addLogic(win);

    // Update annotation cache and add autocompletion to annotation input field
    CATMAID.annotations.update(NA.handleAnnotationUpdate.bind(NA));

    $('#neuron_annotations_add_annotation' + NA.widgetID)[0].onclick =
        NA.add_query_field.bind(NA);
    $('#neuron_query_by_annotations' + NA.widgetID).submit(function(event) {
          // Submit form in iframe to make browser save search terms for
          // autocompletion.
          var form = document.getElementById('neuron_query_by_annotations' + NA.widgetID);
          DOM.submitFormInIFrame(form);
          // Do actual query
          NA.query.call(NA, true);
          event.preventDefault();
          return false;
        });
    $('#neuron_annotations_annotate' + NA.widgetID)[0].onclick = (function() {
        // Get IDs of selected entities
        var selected_entity_ids = this.get_selected_neurons().map( function(e) {
          return e.id;
        });
        // Refresh display after annotations have been added
        CATMAID.annotate_entities(selected_entity_ids,
            this.refresh_annotations.bind(this));
    }).bind(NA);
    $('#neuron_annotations_export_csv' + NA.widgetID)[0].onclick = NA.exportCSV.bind(NA);
    $('#neuron_search_show_annotations' + NA.widgetID)
      .prop('checked', NA.displayAnnotations)
      .on('change', NA, function(e) {
        var widget = e.data;
        widget.displayAnnotations = this.checked;
        widget.updateAnnotations();
      });

    $('#neuron_annotations_toggle_neuron_selections_checkbox' + NA.widgetID)[0].onclick =
        NA.toggle_neuron_selections.bind(NA);

    // Fill user select boxes
    var $select = $('tr #neuron_query_by_annotator' + NA.widgetID);
    var $filter_select = $("#neuron_annotations_query_results_table" +
        NA.widgetID + ' select[name=annotator_filter]');
    var users = CATMAID.User.all();
    for (var userID in users) {
      if (users.hasOwnProperty(userID) && userID !== "-1") {
        var user = users[userID];
        {
          // Add entry to query select
          var opts = {value: user.id, text: user.fullName};
          $("<option />", opts).appendTo($select);
          // Add entry to filter select and select current user by default
          $("<option />", opts)
              .prop('selected', userID == session.userid)
              .appendTo($filter_select);
        }
      }
    }

    // Make it support autocompletion
    $select.combobox();

    // Make annotation filter select support autocompletion and attach the
    // selected event handler right away. Unfortunately, this can't be done
    // later.
    $filter_select.combobox({
      selected: function(event, ui) {
        var val = $(this).val();
        NA.annotationUserFilter = val != 'show_all' ? val : null;
        NA.updateAnnotationFiltering();
      }
    });

    $( "#neuron_query_by_start_date" + NA.widgetID ).datepicker(
        { dateFormat: "yy-mm-dd" });
    $( "#neuron_query_by_end_date" + NA.widgetID ).datepicker(
        { dateFormat: "yy-mm-dd" });

    // Hide the result container by default. It would be more logical to do this
    // right after the contaienr creation. However, adding auto completion to
    // the filter select box doesn't work when it is hidden.
    $(container).hide();

    CATMAID.skeletonListSources.updateGUI();

    // Focus search box
    setTimeout(function() {
      $('input#neuron_query_by_name' + NA.widgetID).focus();
    }, 10);

    return {window: win, widget: NA};
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

  var creators = {
    "keyboard-shortcuts": createKeyboardShortcutsWindow,
    "search": createSearchWindow,
    "3d-webgl-view": create3dWebGLWindow,
    "node-table": createNodeTableWindow,
    "connector-table": createConnectorTableWindow,
    "log-table": createLogTableWindow,
    "export-widget": createExportWidget,
    "neuron-staging-area": createStagingListWindow,
    "create-connector-selection": createConnectorSelectionWindow,
    "skeleton-measurements-table": createSkeletonMeasurementsTable,
    "graph-widget": createGraphWindow,
    "connectivity-graph-plot": createConnectivityGraphPlot,
    "assemblygraph-widget": createAssemblyGraphWindow,
    "sliceinfo-widget": createSliceInfoWindow,
    "statistics": createStatisticsWindow,
    "review-system": createReviewWindow,
    "connectivity-widget": createConnectivityWindow,
    "adjacencymatrix-widget": createAdjacencyMatrixWindow,
    "skeleton-analytics-widget": createSkeletonAnalyticsWindow,
    "ontology-editor": createOntologyWidget,
    "ontology-search": createOntologySearchWidget,
    "classification-editor": createClassificationWidget,
    "notifications": createNotificationsWindow,
    "clustering-widget": createClusteringWidget,
    "circuit-graph-plot": createCircuitGraphPlot,
    "morphology-plot": createMorphologyPlotWindow,
    "venn-diagram": createVennDiagramWindow,
    "neuron-annotations": createNeuronAnnotationsWindow,
    "neuron-navigator": createNeuronNavigatorWindow,
    "settings": createSettingsWindow,
    "analyze-arbor": createAnalyzeArbor,
    "neuron-dendrogram": createNeuronDendrogram,
    "connectivity-matrix": createConnectivityMatrixWindow,
    "synapse-plot": createSynapsePlotWindow,
    "synapse-fractions": createSynapseFractionsWindow,
  };

  /** If the window for the given name is already showing, just focus it.
   * Otherwise, create it new. */
  this.show = function(name)
  {
    if (creators.hasOwnProperty(name)) {
      if (windows.has(name)) {
        windows.get(name).keys().next().value.focus();
      } else {
        var handles = creators[name]();
        windows.set(name, new Map([[handles.window, handles.widget]]));
      }
    } else {
      alert("No known window with name " + name);
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
      alert("No known window with name " + name);
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
  this.registerWidget = function(key, creator) {
    if (key in creators) {
      throw new CATMAID.ValueError("A widget with the following key is " +
          "already registered: " + key);
    }
    if (!CATMAID.tools.isFn(creator)) {
      throw new CATMAID.ValueError("No valid constructor function provided");
    }

    creators[key] = function(options) {
      return createWidget(new creator(options));
    };
  };
}();


(function(CATMAID) {

  "use strict";

  CATMAID.front = WindowMaker.getFocusedWindowWidget;

  /**
   * Make new widgets available under the given unique key.
   */
  CATMAID.registerWidget = function(options) {
    WindowMaker.registerWidget(options.key, options.creator);
  };

})(CATMAID);
