/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* gobal
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  var DOM = {};

  /**
   * Remove all elements from a parent element.
   */
  DOM.removeAllChildren = function(element) {
    while (element.lastChild) {
      element.removeChild(element.lastChild);
    }
  };

  /**
   * Helper function to create a collapsible settings container.
   */
  DOM.addSettingsContainer = function(parent, name, closed)
  {
    var content = $('<div/>').addClass('content');
    if (closed) {
      content.css('display', 'none');
    }
    var sc = $('<div/>')
      .addClass('settings-container')
      .append($('<p/>')
        .addClass('title')
        .append($('<span/>')
          .addClass(closed ? 'extend-box-closed' : 'extend-box-open'))
        .append(name))
      .append(content);

    $(parent).append(sc);

    return content;
  };

  /**
   * Create a container for help text.
   */
  DOM.createHelpText = function(text)
  {
    return $('<div/>').addClass('help').append(text);
  };

  /**
   * Helper function to add a labeled control.
   */
  DOM.createLabeledControl = function(name, control, helptext, extraClass)
  {
    var description = $('<span/>')
        .addClass('description')
        .append(name);

    if (extraClass) {
      description.addClass(extraClass);
    }

    var label = $('<label/>')
      .append(description)
      .append(control);

    if (helptext) {
      label.append(CATMAID.DOM.createHelpText(helptext));
    }

    return $('<div/>').addClass('setting').append(label);
  };

  /**
   * Helper function to create a checkbox with label.
   */
  DOM.createCheckboxSetting = function(name, checked, helptext, handler, subElement)
  {
    var cb = $('<input/>').attr('type', 'checkbox');
    if (checked) {
      cb.prop('checked', checked);
    }

    if (subElement) {
      var checkBoxName = $('<span />').append(cb).append(name);
      var disableHandler = function(event) {
        subElement.disabled = !this.checked;
        if (CATMAID.tools.isFn(handler)) {
          handler.call(this, event);
        }
      };
      cb.change(disableHandler);
      if (!checked) {
        $(subElement).prop('disabled', true);
      }
      return CATMAID.DOM.createLabeledControl(checkBoxName, subElement, helptext);
    }

    if (handler) {
      cb.change(handler);
    }

    // If no sub-element should be added, display name in one wide row.
    var label = $('<div/>')
        .addClass('setting checkbox-row')
        .append($('<label/>').append(cb).append(name));

    if (helptext) {
      label.append(CATMAID.DOM.createHelpText(helptext));
    }

    if (subElement) {

    }
    return label;
  };

  /**
   * Helper function to create a text input field with label.
   */
  DOM.createInputSetting = function(name, val, helptext, handler)
  {
    var input = $('<input/>').attr('type', 'text')
      .addClass("ui-corner-all").val(val);
    if (handler) {
      input.change(handler);
    }
    return CATMAID.DOM.createLabeledControl(name, input, helptext);
  };

  /**
   * Helper function to create a textarea input field with label.
   */
  DOM.createTextAreaSetting = function(name, val, helptext, handler, rows, cols) {
    rows = CATMAID.tools.getDefined(rows, 4);
    cols = CATMAID.tools.getDefined(cols, 50);
    var input = $('<textarea/>')
      .attr('rows', rows)
      .attr('cols', cols)
      .addClass("ui-corner-all").val(val);
    if (handler) {
      input.change(handler);
    }
    return CATMAID.DOM.createLabeledControl(name, input, helptext, 'top');
  };

  /**
   * Helper function to create a number input field with label.
   */
  DOM.createNumericInputSetting = function(name, val, step, helptext, handler)
  {
    var input = $('<input/>').attr('type', 'number')
      .attr('min', '0')
      .attr('step', undefined === step ? 1 : step)
      .addClass("ui-corner-all").val(val);
    if (handler) {
      input.change(handler);
    }

    return CATMAID.DOM.createLabeledControl(name, input, helptext);
  };

  /**
   * Helper function to create a set of radio buttons.
   */
  DOM.createRadioSetting = function(name, values, helptext, handler)
  {
    return values.reduce(function (cont, val) {
      return cont.append(CATMAID.DOM.createLabeledControl(val.desc, $('<input />').attr({
          type: 'radio',
          name: name,
          id: val.id,
          value: val.value !== undefined ? val.value : val.id
      }, helptext).prop('checked', val.checked).change(handler)));
    }, $('<div />'));
  };

  /**
   * Helper function to create a select element with options.
   */
  DOM.createSelectSetting = function(name, options, helptext, handler, defaultValue)
  {
    var select = document.createElement('select');
    for (var o in options) {
      var value = options[o];
      var selected = (defaultValue === value);
      var option = new Option(o, value, selected, selected);
      select.add(option);
    }
    if (handler) {
      select.onchange = handler;
    }
    return CATMAID.DOM.createLabeledControl(name, select, helptext);
  };

  /**
   * Create a file open button that can be optionally initialized hidden.
   */
  DOM.createFileButton = function(id, visible, onchangeFn, multiple, selectFolders) {
    var fb = document.createElement('input');
    fb.setAttribute('type', 'file');
    if (id) {
      fb.setAttribute('id', id);
    }
    fb.setAttribute('name', 'files[]');
    if (!visible) {
      fb.style.display = 'none';
    }
    if (selectFolders) {
      fb.setAttribute('webkitdirectory', 'webkitdirectory');
      fb.setAttribute('multiple', 'multiple');
    }
    if (multiple) {
      fb.setAttribute('multiple', 'multiple');
    }
    fb.onchange = function(event) {
      try {
        if (CATMAID.tools.isFn(onchangeFn)) {
          onchangeFn.call(this, event);
        }
      } finally {
        // Reset file button. Otherwise the same file can't be loaded again.
        this.value = '';
      }
    };
    return fb;
  };

  DOM.appendFileButton = function(div, id, label, title, multiple, onchange) {
    var open = document.createElement('input');
    if (onchange) {
      // Wrap onchange function to include a referenc to the actual button in
      // the argument list.
      let originalOnChange = onchange;
      onchange = function(event) {
        originalOnChange.call(this, event, open);
      };
    }
    var fileButton = DOM.createFileButton(id, false, onchange, true, false);
    div.appendChild(fileButton);
    open.setAttribute("type", "button");
    open.setAttribute("value", label || "Open");
    open.setAttribute("title", title);
    open.onclick = function() { fileButton.click(); };
    div.appendChild(open);

    return open;
  };

  DOM.appendFolderButton = function(div, id, label, title, multiple, onchange) {
    var open = document.createElement('input');
    if (onchange) {
      // Wrap onchange function to include a referenc to the actual button in
      // the argument list.
      let originalOnChange = onchange;
      onchange = function(event) {
        originalOnChange.call(this, event, open);
      };
    }
    var fileButton = DOM.createFileButton(id, false, onchange, true, true);
    div.appendChild(fileButton);
    open.setAttribute("type", "button");
    open.setAttribute("value", label || "Open");
    open.setAttribute("title", title);
    open.onclick = function() { fileButton.click(); };
    div.appendChild(open);

    return open;
  };

  /**
   * Clones the given form into a dynamically created iframe and submits it
   * there. This can be used to store autocompletion information of a form that
   * actually isn't submitted (where e.g. an AJAX request is done manually).  A
   * search term is only added to the autocomplete history if the form is
   * actually submitted. This, however, triggers a reload (or redirect) of the
   * current page. To prevent this, an iframe is created where the submit of the
   * form is done and where a reload doesn't matter. The search term is stored
   * and the actual search can be executed.
   * Based on http://stackoverflow.com/questions/8400269.
   */
  DOM.submitFormInIFrame = function(form) {
    // Create a new hidden iframe element as sibling of the form
    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', '');
    iframe.setAttribute('style', 'display:none');
    form.parentNode.appendChild(iframe);
    // Submit form in iframe to store autocomplete information
    var iframeWindow = iframe.contentWindow;
    iframeWindow.document.body.appendChild(form.cloneNode(true));
    var frameForm = iframeWindow.document.getElementById(form.id);
    frameForm.onsubmit = null;
    frameForm.submit();
    // Remove the iframe again after the submit (hopefully) run
    setTimeout(function() { form.parentNode.removeChild(iframe); }, 100);
  };

  /**
   * Inject an extra button into the caption of a window. This button can be
   * assigned style classes and a click handler.
   */
  DOM.addCaptionButton = function(win, iconClass, title, handler) {
    var toggle = document.createElement('i');
    toggle.setAttribute('class', iconClass);
    toggle.classList.add('windowButton');
    toggle.onpointerdown = handler;

    if (title) {
      toggle.setAttribute('title', title);
    }

    $('.stackTitle', win.getFrame()).after(toggle);

    return toggle;
  };

  /**
   * Inject a help button into the caption of a window. This button opens a
   * widget containing the passed help text when clicked.
   *
   * @param {CMWWindow} win          Window to which the button with be added.
   * @param {string}    title        Title of the help window that will open.
   * @param {string}    helpTextHtml HTML source of the help text.
   * @param {string}    externalLink (optional) Link with content to embed in
   *                                 this help page.
   */
  DOM.addHelpButton = function (win, title, helpTextHtml, externalLink) {
    var helpTextFeedback =
        '<p class="ui-state-highlight ui-widget">' +
        'Is this documentation incomplete or incorrect? Help out by ' +
        '<a target="_blank" href="' +
        CATMAID.makeDocURL('contributing.html#in-client-documentation') +
        '">letting us know or contributing a fix.</a></p>';
    let html = '';
    if (helpTextHtml) {
      html += helpTextHtml;
    }
    if (externalLink) {
      html += `<iframe src="${externalLink}"></iframe>`;
    } else {
      html += helpTextFeedback;
    }
    DOM.addCaptionButton(win,
        'fa fa-question',
        'Show help documentation for this widget',
        function () {
          let creationResult = WindowMaker.create('html', {
            title: title,
            html: html,
          });

          // Inject CSS reference to style external link
          if (externalLink) {
            let content = creationResult.window.getFrame();
            content.classList.add('help-window');
            let externalContent = content.querySelector('iframe');
            if (externalContent) {
              let cssLinks = ['css/screen.css', 'css/keyboard-shortcuts.css'].map(n => {
                let cssLink = document.createElement('link');
                cssLink.href = CATMAID.makeStaticURL(n);
                cssLink.rel = 'stylesheet';
                cssLink.type = 'text/css';
                return cssLink;
              });
              externalContent.addEventListener('load', (e) => {
                e.target.contentDocument.body.classList.add('catmaid');
                cssLinks.forEach(cl => e.target.contentDocument.body.appendChild(cl));
                let feedbackContainer = e.target.contentDocument.createElement('div');
                feedbackContainer.innerHTML = helpTextFeedback;
                e.target.contentDocument.body.appendChild(feedbackContainer);
              });
            }
          }
        });
  };


  // A toggle function that also allows to recreate the UI.
  function toggleWindowConfigurationPanel(win, originalTitle, recreate, widget, stateSaving) {
    // Create controls for the window settings if not present, otherwise remove
    // them.
    var frame = win.getFrame();
    var panel = frame.querySelector('.window-settings');
    var show = !panel;
    // Parse title to get current alias
    var currentAlias = win.getTitle()
        .replace(originalTitle, '').replace(/ \((.*)\)/, '$1');

    if (!show) {
      panel.remove();
    }

    if (show || recreate) {
      // Create new panel
      panel = document.createElement('div');
      panel.classList.add('windowpanel', 'window-settings');

      var aliasInput = document.createElement('input');
      aliasInput.value = currentAlias;
      var aliasSetting = document.createElement('label');
      aliasSetting.appendChild(document.createTextNode('Alias'));
      aliasSetting.appendChild(aliasInput);

      aliasInput.onkeyup = function() {
        if (this.value.length) {
          win.setTitle(originalTitle + " (" + this.value + ")");
        } else {
          win.setTitle(originalTitle);
        }
      };
      panel.appendChild(aliasSetting);

      // Save settings button
      if (widget && stateSaving) {
        var saveStateLabel = document.createElement('span');
        saveStateLabel.appendChild(document.createTextNode('Widget state: '));
        panel.appendChild(saveStateLabel);
        var saveStateButton = document.createElement('button');
        saveStateButton.appendChild(document.createTextNode('Save settings'));
        saveStateButton.onclick = function() {
          if (CATMAID.saveWidgetState(widget)) {
            CATMAID.msg('Success', 'Widget settings stored');
          }
        };
        panel.appendChild(saveStateButton);

        var resetStateButton = document.createElement('button');
        resetStateButton.appendChild(document.createTextNode('Clear saved settings'));
        resetStateButton.onclick = function() {
          if (CATMAID.clearSavedWidgetState(widget)) {
            CATMAID.msg('Success', 'Stored widget settings cleared');
          }
        };
        panel.appendChild(resetStateButton);
      }

      // Add as first element after caption and event catcher
      var eventCatcher = frame.querySelector('.eventCatcher');
      if (eventCatcher) {
        // insertBefore will handle the case where there is no next sibling,
        // the element will be appended to the end.
        frame.insertBefore(panel, eventCatcher.nextSibling);
      }
    }

    return show;
  }

  /**
   * Inject a caption button that toggles window related settings.
   *
   * @param {CMWWindow} win          Window to which the button with be added.
   * @param {Widget}    instance     The widget instance in this window.
   * @param {boolean}   stateSaving  If state saving related UI should be shown
   */
  DOM.addWindowConfigButton = function(win, widget, stateSaving) {
    DOM.addCaptionButton(win, 'fa fa-window-maximize',
        'Show window settings for this widget',
        toggleWindowConfigurationPanel.bind(window, win, win.getTitle(), false, widget, stateSaving));
  };


  /**
   * Inject an extra button into the caption of a window. This button allows to
   * show and hide a windows button panel (a top level element of class
   * buttonpanel).
   */
  DOM.addButtonDisplayToggle = function(win, title) {
    title = title || 'Show and hide widget controls';
    DOM.addCaptionButton(win, 'fa fa-gear', title, function() {
      var frame = $(this).closest('.' + CMWNode.FRAME_CLASS);
      var panels = $('.buttonpanel', frame);
      if (panels.length > 0) {
       // Toggle display of first button panel found
        var style = 'none' === panels[0].style.display ? 'block' : 'none';
        panels[0].style.display = style;
      }
    });
  };

  /**
   * Inject an extra button into the caption of a window. This button allows to
   * show and hide skeleton source controls for a widget.
   */
  DOM.addSourceControlsToggle = function(win, source, title, options) {
    title = title || 'Show and hide skeleton source controls';

    // A toggle function that also allows to recreate the UI.
    var toggle = function(recreate) {
      // Create controls for the skeleton source if not present, otherwise
      // remove them.
      var frame = win.getFrame();
      var panel = frame.querySelector('.sourcepanel');
      var show = !panel;

      if (!show) {
        panel.remove();
      }

      if (show || recreate) {
        // Create new panel
        panel = CATMAID.skeletonListSources.createSourceControls(source, options);
        panel.classList.add('windowpanel', 'sourcepanel');
        // Add as first element after caption and event catcher
        var eventCatcher = frame.querySelector('.eventCatcher');
        if (eventCatcher) {
          // insertBefore will handle the case where there is no next sibling,
          // the element will be appended to the end.
          frame.insertBefore(panel, eventCatcher.nextSibling);
        }
      }

      return show;
    };

    // Make a update function that can be referred to from handlers
    var update = toggle.bind(window, true);

    return DOM.addCaptionButton(win, 'fa fa-link', title, function() {
      // Do a regular toggle update by default
      var opened = toggle();

      if (opened) {
        // Register to the source's subscription added and removed
        // events to recreate the UI.
        source.on(source.EVENT_SUBSCRIPTION_ADDED, update);
        source.on(source.EVENT_SUBSCRIPTION_REMOVED, update);
      } else {
        source.off(source.EVENT_SUBSCRIPTION_ADDED, update);
        source.off(source.EVENT_SUBSCRIPTION_REMOVED, update);
      }
    });
  };

  var stringifyCornerCases = function(key, value) {
    if (value instanceof Set) {
      return JSON.stringify(Array.from(value.values()));
    }
    return value;
  };

  /**
   * Inject an extra button into the caption of a window. This button allows to
   * show and hide filter controls for a widget.
   */
  DOM.addFilterControlsToggle = function(win, title, options) {
    title = title || 'Toggle filter controls';
    var type = CATMAID.tools.getDefined(options.type, 'skeleton');

    // A toggle function that also allows to recreate the UI.
    var toggle = function(recreate) {
      // Create controls for the skeleton source if not present, otherwise
      // remove them.
      var frame = win.getFrame();
      var panel = frame.querySelector('.dropdown-panel');
      var show = !panel;

      if (!show) {
        panel.remove();
      }

      if (show || recreate) {
        var filterRules = options.rules;
        if (!filterRules) {
          throw new CATMAID.ValueError('Need "rules" field for filter panel');
        }
        // Create new panel
        panel = document.createElement('div');
        panel.classList.add('windowpanel', 'dropdown-panel');

        // Add tab panel, with first tab listing current rules and second allows
        // to add new rules.
        var tabPanel = panel.appendChild(document.createElement('div'));
        var tabs = CATMAID.DOM.addTabGroup(tabPanel,
            'filter-controls', ['Filters', 'Add filter']);
         
        var filterListContent = tabs['Filters'];
        var newFilterContent = tabs['Add filter'];
        filterListContent.style.overflow = "auto";
        newFilterContent.style.overflow = "visible";

        // Initialize tabs
        $(tabPanel).tabs();

        // Add a list of active filter rules
        var table = document.createElement('table');
        table.style.width = "100%";
        var header = table.createTHead();
        var hrow = header.insertRow(0);
        var columns = ['On', 'Name', 'Merge mode', 'Options', 'Is skeleton',
            'Invert', 'Has name', 'Action'];
        columns.forEach(function(c) {
          hrow.insertCell().appendChild(document.createTextNode(c));
        });
        filterListContent.appendChild(table);

        var self = this;

        var datatable = $(table).DataTable({
          dom: "tp",
          ajax: function(data, callback, settings) {
            callback({
              draw: data.draw,
              recordsTotal: filterRules.length,
              recordsFiltered: filterRules.length,
              data: filterRules
            });
          },
          order: [],
          columns: [
            {
              orderable: false,
              render: function(data, type, row, meta) {
                var checked = !row.skip;
                return '<input data-action="skip" type="checkbox" ' + (checked ? 'checked /> ' : '/>');
              }
            },
            {
              orderable: false,
              data: "strategy.name"
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                if (type === "display") {
                  if (meta.row === 0) {
                    return "-";
                  } else {
                    return '<select data-action="merge-mode" title="Rules are applied in a ' +
                      'left-associative fashion. This selects which operation to use for this.">' +
                      '<option value="' + CATMAID.UNION + '">Union</option><option value="' +
                      CATMAID.INTERSECTION + '">Intersection</option></select>';
                  }
                } else {
                  return row.mergeMode;
                }
              }
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                return row.options ? JSON.stringify(row.options, stringifyCornerCases) : "-";
              }
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                var value = row.validOnlyForSkid ? row.validOnlyForSkid : '';
                if (type === "display") {
                  return '<input size="10" data-action="skeleton" placeholder="Skeleton ID" value="' +
                      value + '" />';
                } else {
                  return value;
                }
              },
              visible: type === 'skeleton',
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                if (type === "display") {
                  return row.invert ? 'Yes' : 'No';
                }
                return row.invert;
              },
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                var value = row.validOnlyForName ? row.validOnlyForName : '';
                if (type === "display") {
                  return '<input size="10" data-action="name" placeholder="Neuron name" value="' +
                      value + '" />';
                } else {
                  return value;
                }
              },
              visible: type === 'skeleton',
            },
            {
              orderable: false,
              data: null,
              defaultContent: "",
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  return '<a href="#" data-index="' + meta.row + '">remove</a>';
                }
              }
            }
          ],
          language: {
            emptyTable: "No filters added yet (defaults to take all nodes)"
          }
        });

        // Updated skipping of rules
        $(table).on('change', 'input[data-action=skip]', function(e) {
          var tr = $(this).closest("tr");
          var rule = datatable.row(tr).data();
          rule.skip = !e.target.checked;
          CATMAID.tools.callIfFn(options.update);
        });
        $(table).on('click', 'a[data-index]', function(e) {
          var ruleIndex = this.dataset.index;
          if (!ruleIndex) {
            CATMAID.warn("No rule index found");
            return;
          } else {
            ruleIndex = parseInt(ruleIndex, 10);
            filterRules.splice(ruleIndex, 1);
            // Trigger table update
            datatable.rows().invalidate();
            datatable.ajax.reload();
            // Trigger client update
            CATMAID.tools.callIfFn(options.update);
          }
        }).on('change', 'select[data-action=merge-mode]', function(e) {
          var tr = $(this).closest("tr");
          var rule = datatable.row(tr).data();
          rule.mergeMode = this.value;
          CATMAID.tools.callIfFn(options.update);
          return false;
        }).on('change', 'input[data-action=skeleton]', function(e) {
          var tr = $(this).closest("tr");
          var rule = datatable.row(tr).data();
          rule.validOnlyForSkid = this.value;
          CATMAID.tools.callIfFn(options.update);
          return false;
        }).on('change', 'input[data-action=name]', function(e) {
          var tr = $(this).closest("tr");
          var rule = datatable.row(tr).data();
          rule.validOnlyForName = this.value;
          CATMAID.tools.callIfFn(options.update);
          return false;
        });

        // Get available filter strategies
        var Strategy = CATMAID.FilterStrategies.get(type);
        var nodeFilters = Object.keys(Strategy).reduce(function(o, p) {
          o[Strategy[p].name] = p;
          return o;
        }, {});

        CATMAID.DOM.appendNewNodeFilterControls(type, nodeFilters, newFilterContent,
            function(rule, strategy) {
              filterRules.push(rule);
              CATMAID.tools.callIfFn(options.update);
              CATMAID.msg("Success", "New filter rule added");
              // Trigger table update
              datatable.rows().invalidate();
              datatable.ajax.reload();
            });

        // Add as first element after caption and event catcher
        var eventCatcher = frame.querySelector('.eventCatcher');
        if (eventCatcher) {
          // insertBefore will handle the case where there is no next sibling,
          // the element will be appended to the end.
          frame.insertBefore(panel, eventCatcher.nextSibling);
        }
      }

      return show;
    };

    // Make a update function that can be referred to from handlers
    var update = toggle.bind(window, true);

    return DOM.addCaptionButton(win, 'fa fa-filter', title,
        function() {
          // Do a regular toggle update by default
          var opened = toggle();
        });
  };

  DOM.appendNewNodeFilterControls = function(type, nodeFilters, target,
      onNewRule, showMergeModeField, showSkeletonIdField, showNameField) {
    var $target = $(target);
    var nodeFilterSettingsContainer = document.createElement('span');
    var nodeFilterSettings = CATMAID.DOM.createLabeledControl("",
        nodeFilterSettingsContainer);
    var newRuleOptions = null;
    var newRuleStrategy = null;
    var newRuleSkeletonID = null;
    var newRuleSkeletonName = null;
    var newRuleMergeMode = CATMAID.UNION;
    var mergeRules = {};
    mergeRules["Union"] = CATMAID.UNION;
    mergeRules["Intersection"] = CATMAID.INTERSECTION;
    var updateNodeFilterSettings = function(strategy) {
      newRuleOptions = {};
      newRuleStrategy = strategy;
      newRuleSkeletonID = undefined;
      newRuleSkeletonName = undefined;
      // Show UI for selected filte
      CATMAID.DOM.removeAllChildren(nodeFilterSettingsContainer);
      // Add general settings
      var $nodeFilterSettingsContainer = $(nodeFilterSettingsContainer);
      if (showMergeModeField) {
        var $mergeMode = CATMAID.DOM.createSelectSetting("Merge operation", mergeRules,
            "Rules are applied in a left-associative fashion. This selects which operation to use for this.",
            function() {
              newRuleMergeMode = this.value;
            });
        $nodeFilterSettingsContainer.append($mergeMode);
      }
      if (showSkeletonIdField) {
        var $skeletonId = CATMAID.DOM.createInputSetting(
            "Apply only to skeleton ID (Optional)", "",
            "If a valid skeleton ID is provided, this rule will apply to this skeleton exclusively.",
            function() {
              newRuleSkeletonID = this.value;
            });
        $nodeFilterSettingsContainer.append($skeletonId);
      }
      if (showNameField) {
        var $skeletonName = CATMAID.DOM.createInputSetting(
            "... having this name (Optional)", "",
            "Along with a skeleton ID a name can also be used. If supplied, skeletons are also checked againsts it and only if skeleton ID and name match, the rule will be applied.",
            function() {
              newRuleSkeletonName = this.value;
            });
        $nodeFilterSettingsContainer.append($skeletonName);
      }

      // Add filter specific settings
      var SpecificFactories;
      if (type === "node") {
        SpecificFactories = CATMAID.NodeFilterSettingFactories;
      } else if (type === "skeleton") {
        SpecificFactories = CATMAID.SkeletonFilterSettingFactories;
      } else {
        throw new CATMAID.ValueError("Unknown filter type: " + type);
      }
      var createSettings = SpecificFactories[strategy];
      if (!createSettings) {
        throw new CATMAID.ValueError("Couldn't find settings method " +
            "for node filter \"" + strategy + "\"");
      }
      createSettings(nodeFilterSettingsContainer, newRuleOptions);
    };

    $target.append(CATMAID.DOM.createSelectSetting("Node filter",
      nodeFilters, "Nodes inside the " + name, function(e) {
        updateNodeFilterSettings(this.value);
      }));
    $target.append(nodeFilterSettings);

    let newRuleInvert = false;
    let invertRuleLabel = document.createElement('label');
    let invertRuleCb = invertRuleLabel.appendChild(document.createElement('input'));
    invertRuleCb.setAttribute('type', 'checkbox');
    invertRuleCb.addEventListener('change', function(e) {
      newRuleInvert = this.checked;
    });
    invertRuleLabel.appendChild(document.createTextNode('Invert'));
    $target.append(invertRuleLabel);

    var addRuleButton = document.createElement('button');
    addRuleButton.appendChild(document.createTextNode("Add new filter rule"));
    addRuleButton.onclick = function() {
      var TypeSpecificRule = CATMAID.FilterRules.get(type);
      var typeSpecificFactories = CATMAID.FilterStrategies.get(type);
      var strategy = typeSpecificFactories[newRuleStrategy];
      var rule = new TypeSpecificRule(strategy, newRuleOptions,
          newRuleMergeMode, newRuleSkeletonID, newRuleSkeletonName,
          newRuleInvert);

      updateNodeFilterSettings(newRuleStrategy);

      if (CATMAID.tools.isFn(onNewRule)) {
        onNewRule(rule, strategy);
      }
    };
    $target.append(CATMAID.DOM.createLabeledControl("", addRuleButton));

    // Set default filter setting UI
    updateNodeFilterSettings('take-all');

    return target;
  };

  DOM.createCheckboxSelectPanel = function(options, selectedKeys, showFilter, rowFn) {
    var selectedSet = new Set(selectedKeys ? selectedKeys : undefined);
    var container = document.createElement('div');
    var checkboxes = document.createElement('ul');
    var entryIndex = new Map();
    for (var i=0; i<options.length; ++i) {
      var o = options[i];
      var entry = document.createElement('label');
      var checkbox = document.createElement('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.setAttribute('value', o.value);
      checkbox.setAttribute('data-role', 'option');
      entry.appendChild(checkbox);
      entry.appendChild(document.createTextNode(o.title));
      var selected = selectedSet.has(o.value);
      if (selected) {
        checkbox.checked = true;
      }
      var listElement = document.createElement('li');
      listElement.style.display = 'flex';
      listElement.appendChild(entry);
      checkboxes.appendChild(listElement);
      // Save in index
      if (showFilter) {
        var labelElements = entryIndex.get(o.title);
        if (!labelElements) {
          labelElements = [];
          entryIndex.set(o.title, labelElements);
        }
        labelElements.push(entry);
      }

      if (CATMAID.tools.isFn(rowFn)) {
        rowFn(listElement, o.value, selected);
      }
    }
    var entryKeys = Array.from(entryIndex.keys());

    checkboxes.onclick = function(e) {
      // Cancel bubbling
      e.cancelBubble = true;
      if (e.stopPropagation) e.stopPropagation();
    };

    if (showFilter) {
      var selectedFilterContainer = document.createElement('label');
      var selectedFilter = document.createElement('input');
      selectedFilter.setAttribute('type', 'checkbox');
      selectedFilter.onclick = function(e) {
        e.cancelBubble = true;
        if (e.stopPropagation) e.stopPropagation();
      };
      selectedFilter.onchange = function(e) {
        filterInput.onkeyup(e);
      };
      selectedFilterContainer.appendChild(selectedFilter);
      selectedFilterContainer.appendChild(document.createTextNode('Selected Only'));
      var filterInput = document.createElement('input');
      filterInput.setAttribute('placeholder', 'Filter');
      filterInput.setAttribute('type', 'text');
      filterInput.onclick = function(e) {
        e.cancelBubble = true;
        if (e.stopPropagation) e.stopPropagation();
      };
      filterInput.onkeyup = function(e) {
        var filterTerm = this.value;
        var keys = entryKeys;
        var regex = new RegExp(CATMAID.tools.escapeRegEx(filterTerm), 'i');
        for (var i=0, max=keys.length; i<max; ++i) {
          var key = keys[i];
          var elements = entryIndex.get(key);
          var checkbox = elements.reduce(function (cbox, el) {
            return cbox || $(el).find('input[type="checkbox"]').get(0);
          }, undefined);
          var match = (!selectedFilter.checked || checkbox.checked) && key.match(regex);
          for (var j=0, jmax=elements.length; j<jmax; ++j) {
            var element = elements[j];
            element.style.display = match ? 'block' : 'none';
          }
        }
        e.cancelBubble = true;
        if (e.stopPropagation) e.stopPropagation();
      };
      container.appendChild(selectedFilterContainer);
      container.appendChild(filterInput);
    }
    container.appendChild(checkboxes);

    return container;
  };


  /**
   * Create a new select element that when clicked (or optionally hovered) shows
   * a custom list in a DIV container below it. This custom list provides
   * checkbox elements for each entry
   *
   * Main idea from: http://stackoverflow.com/questions/17714705
   *
   * @param title        {String}   A title showing as the first element of the select
   * @param options      {Object[]} A list of {title: <>, value: <>} objects.
   * @param selectedKeys {String[]} (Optional) list of keys that should be
   *                                selected initially
   * @param showFilter   {Bool}     Whether to show a filter input field.
   * @param rowFn        {Function} (optional) A function that is called for each entry.
   *
   * @returns a wrapper around the select element
   */
  DOM.createCheckboxSelect = function(title, options, selectedKeys, showFilter, rowFn) {
    var container = DOM.createCheckboxSelectPanel(options, selectedKeys, showFilter, rowFn);
    return CATMAID.DOM.createCustomContentSelect(title, container);
  };

  /**
   * Create a new select element that when clicked (or optionally hovered) shows
   * a custom list in a DIV container below it. This custom list provides a
   * radio element for each entry.
   *
   * @param title        {String}   A title showing as the first element of the select
   * @param options      {Object[]} A list of {title: <>, value: <>} objects.
   * @param selectedKey  {String}   (Optional) the key that should be selected initially
   * @param showFilter   {Bool}     Whether to show a filter input field.
   *
   * @returns a wrapper around the select element
   */
  DOM.createRadioSelectPanel = function(title, options, selectedKey, showFilter) {
    var container = document.createElement('div');
    var radiobuttons = document.createElement('ul');
    var entryIndex = new Map();
    for (var i=0; i<options.length; ++i) {
      var o = options[i];
      var entry = document.createElement('label');
      var radiobutton = document.createElement('input');
      radiobutton.setAttribute('type', 'radio');
      radiobutton.setAttribute('value', o.value);
      radiobutton.setAttribute('name', title);
      entry.appendChild(radiobutton);
      entry.appendChild(document.createTextNode(o.title));
      if (selectedKey == o.value) {
        radiobutton.checked = true;
      }
      radiobuttons.appendChild(entry);

      // Save in index
      if (showFilter) {
        var labelElements = entryIndex.get(o.title);
        if (!labelElements) {
          labelElements = [];
          entryIndex.set(o.title, labelElements);
        }
        labelElements.push(entry);
      }
    }
    radiobuttons.onclick = function(e) {
      // Cancel bubbling
      e.cancelBubble = true;
      if (e.stopPropagation) e.stopPropagation();
    };

    var entryKeys = Array.from(entryIndex.keys());

    if (showFilter) {
      var filterInput = document.createElement('input');
      filterInput.setAttribute('placeholder', 'Filter');
      filterInput.setAttribute('type', 'text');
      filterInput.onclick = function(e) {
        e.cancelBubble = true;
        if (e.stopPropagation) e.stopPropagation();
      };
      filterInput.onkeyup = function(e) {
        var filterTerm = this.value;
        var keys = entryKeys;
        var regex = new RegExp(CATMAID.tools.escapeRegEx(filterTerm), 'i');
        for (var i=0, max=keys.length; i<max; ++i) {
          var key = keys[i];
          var elements = entryIndex.get(key);
          var match = key.match(regex);
          for (var j=0, jmax=elements.length; j<jmax; ++j) {
            var element = elements[j];
            element.style.display = match ? 'block' : 'none';
          }
          e.cancelBubble = true;
          if (e.stopPropagation) e.stopPropagation();
        }
      };
      container.appendChild(filterInput);
    }
    container.appendChild(radiobuttons);

    return container;
  };


  /**
   * Create a new select element that when clicked (or optionally hovered) shows
   * a custom list in a DIV container below it. This custom list provides a
   * radio element for each entry.
   *
   * @param title        {String}   A title showing as the first element of the select
   * @param options      {Object[]} A list of {title: <>, value: <>} objects.
   * @param selectedKey  {String}   (Optional) the key that should be selected initially
   * @param showFilter   {Bool}     Whether to show a filter input field.
   * @param titleMode    {String}   (Optional) Whether to only show the passed in
   *                                title ('title', default), the selected item only
   *                                ('selected') or both ('title-selected').
   * @param emptyValue   {String}   (Optional) A value shown if no item is selected,
   *                                default: "(none)".
   *
   * @returns a wrapper around the select element
   */
  DOM.createRadioSelect = function(title, options, selectedKey, showFilter,
      titleMode, emptyValue) {
    var container = DOM.createRadioSelectPanel(title, options, selectedKey, showFilter);
    return CATMAID.DOM.createCustomContentSelect(title, container, selectedKey,
        titleMode, emptyValue);
  };

  /**
   * Create a new select element that when clicked (or optionally hovered) shows
   * content in a DIV container below it.
   *
   * Main idea from: http://stackoverflow.com/questions/17714705
   *
   * @param {String} title      A title showing as the first element of the select
   * @param {Object} content    Content to be displayed when select is clicked
   * @param {String} titleMode  (Optional) Whether to only show the passed in
   *                            title ('title', default), the selected item only
   *                            ('selected') or both ('title-selected').
   * @param {String} emptyValue (Optional) A value shown if no item is selected,
   *                            default: "(none)".
   *
   * @returns a wrapper around the select element
   */
  DOM.createCustomContentSelect = function(title, content, selectedKey,
      titleMode = 'title', emptyValue = '(none)') {
    // Expandable container
    var container = document.createElement('span');
    container.setAttribute('class', 'customselect');

    var selectBox = document.createElement('div');
    selectBox.setAttribute('class', 'customselect-selectbox');

    var toggleSelect = document.createElement('select');
    toggleSelect.options.add(new Option(title));
    CATMAID.DOM._updateSelectTitle(toggleSelect, content, title, selectedKey,
        titleMode, emptyValue);
    selectBox.appendChild(toggleSelect);

    // Hide the selects drop down menu, which is needed for creating our own
    // drop down as well as for showing thre rest of the panel if the menu is
    // expanded.
    var overSelect = document.createElement('div');
    overSelect.setAttribute('class', 'customselect-overselect');
    selectBox.appendChild(overSelect);

    container.appendChild(selectBox);

    var customContent = document.createElement('div');
    customContent.setAttribute('class', 'customselect-content');
    customContent.style.display = "none";
    customContent.appendChild(content);
    container.appendChild(customContent);

    var onpointerdown = function() {
      toggleExpansion();
    };

    // The function responsible for hiding and showing all controls has a
    // private state variable and an IIFE is used to encapsulate it (to reduce
    // closure size).
    var toggleExpansion = (function(context) {
      var expanded = false;
      return function() {
        var customContent = context.querySelector('div.customselect-content');
        if (expanded) {
          customContent.style.display = 'none';
          CATMAID.ui.releaseEvents();
          CATMAID.ui.removeEvent("onpointerdown", onpointerdown);
        } else {
          customContent.style.display = 'block';
          $(customContent).scrollintoview();

          // Enable general UI click handler to close drop down if the pointer
          // was clicked outside of the control.
          CATMAID.ui.catchEvents();
          CATMAID.ui.registerEvent("onpointerdown", onpointerdown);
        }
        // TODO: find a better counter-action to scrollIntoView below. But
        // currently this is needed for CATMAID windows after the custom
        // select has been scrolled into view.
        if (CATMAID.rootWindow) {
          CATMAID.rootWindow.redraw();
        }
        expanded = !expanded;
      };
    })(container);

    // Expand whe the container is clicked
    container.onclick = toggleExpansion;
    toggleSelect.onclick = function(e) {
      toggleExpansion();
      return false; // Don't bubble up
    };

    // This wrapper is used to make the actual control container expand more
    // reliable.
    var wrapper = document.createElement('span');
    wrapper.appendChild(container);

    // Cancel change events of the text input during capturing phase.
    wrapper.addEventListener('change', event => {
      if (event.target.type === 'text') event.stopPropagation();
    }, true);

    // Update the title on a non-text input change
    wrapper.addEventListener('change', event => {
      if (event.target.type === 'text') return;
      CATMAID.DOM._updateSelectTitle(toggleSelect, content, title,
          event.target.value, titleMode, emptyValue);
    });

    return wrapper;
  };

  DOM._updateSelectTitle = function(select, content, title, value, titleMode,
      emptyValue = '(none)') {
    let text = (value === undefined || value === null || value.length === 0) ? emptyValue :
        ($(content).find(`input[value='${value}']`).closest('label').text());
    let newTitle;
    if (titleMode === 'title') {
      newTitle = title;
    } else if (titleMode === 'selected') {
      newTitle = text;
    } else if (titleMode === 'title-selected') {
      newTitle = `${title}: ${text}`;
    }
    select.options[0].text = newTitle;
  };

  /**
   * Create a simple placeholder.
   */
  DOM.createPlaceholder= function() {
    var placeholder = document.createElement('span');
    placeholder.classList.add('placeholder');
    var img = document.createElement('img');
    img.src = CATMAID.makeStaticURL('images/wait_bgtransgrey.gif');
    placeholder.appendChild(img);
    return placeholder;
  };

  /**
   * Create a placeholder element that will get replaced once async content has
   * been loaded, i.e. the passed in promise has been resolved. The promise is
   * expected to return the actual element to be displayed.
   */
  DOM.createAsyncPlaceholder = function(promise) {
    var placeholder = CATMAID.DOM.createPlaceholder();
    if (!promise || !CATMAID.tools.isFn(promise.then)) {
      throw new CATMAID.ValueError('Async musst be either a callback or promise');
    }

    // After promise is fulfilled, replace placeholder
    promise.then(function(element) {
      if (placeholder.parentNode) {
        placeholder.parentNode.replaceChild(element, placeholder);
      } else {
        throw new CATMAID.ValueError('Placeholder node doesn\'t have a parent');
      }
    }).catch(CATMAID.handleError);

    return placeholder;
  };

  DOM.createLabeledAsyncPlaceholder = function(label, promise, helptext) {
    var placeholder = CATMAID.DOM.createAsyncPlaceholder(promise);
    var wrapper = document.createElement('span');
    wrapper.appendChild(placeholder);
    var labeledWrapper = CATMAID.DOM.createLabeledControl(
        label, wrapper, helptext);
    return labeledWrapper.get(0);
  };

	DOM.createCheckbox = function(label, value, onclickFn, id) {
		var cb = document.createElement('input');
		cb.setAttribute('type', 'checkbox');
		if (id) cb.setAttribute('id', id);
		cb.checked = value ? true : false;
		cb.onchange = onclickFn;
		return [cb, document.createTextNode(label)];
	};

	DOM.createRadioButton = function(label, name, value, checked, onclickFn, id) {
		var cb = document.createElement('input');
		cb.setAttribute('type', 'radio');
		cb.setAttribute('name', name);
		if (id) cb.setAttribute('id', id);
		cb.checked = !!checked;
		cb.onchange = onclickFn;
		return [cb, document.createTextNode(label)];
	};

  /**
   * Create a new numeric field based on the passed in configuration.
   */
  DOM.createNumericField = function(id, label, title, value, postlabel,
      onchangeFn, length, placeholder, disabled, step, min, max) {
    var attrs = {};
    if (step !== undefined) {
      attrs['step'] = step;
    }
    if (min !== undefined) {
      attrs['min'] = min;
    }
    if (max !== undefined) {
      attrs['max'] = max;
    }
    return DOM.createInput('number', id, label, title, value,
        postlabel, onchangeFn, length, placeholder, disabled, undefined, attrs);
  };

  /**
   * Create a new input field based on the passed in configuration.
   */
  DOM.createInput = function(type, id, label, title, value, postlabel,
      onchangeFn, length, placeholder, disabled, onEnterFn, attrs) {
    var nf = document.createElement('input');
    if (id) nf.setAttribute('id', id);
    nf.setAttribute('type', type);

    if (value !== undefined) {
      nf.setAttribute('value', value);
    }

    if (attrs) {
      for (var a in attrs) {
        nf.setAttribute(a, attrs[a]);
      }
    }

    if (placeholder) {
      nf.setAttribute('placeholder', placeholder);
    }

    if (disabled !== undefined) {
      nf.disabled = !!disabled;
    }

    if (length) {
      nf.style.width = length + 'em';
    }
    if (onchangeFn) nf.onchange = onchangeFn;
    if (onEnterFn) {
      nf.addEventListener('keyup', function(e) {
        if (e.keyCode === 13) onEnterFn.call(this, e);
      });
    }
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

  /**
   * Create a new text field based on the passed in configuration.
   */
  DOM.createTextField = function(id, label, title, value, postlabel, onchangeFn,
      length, placeholder, disabled, onEnterFn) {
    return DOM.createInput("text", id, label, title, value, postlabel,
        onchangeFn, length, placeholder, disabled, onEnterFn);
  };

  /**
   * Create a new date field based on the passed in configuration, optionally
   * show time selector.
   */
  DOM.createDateField = function(id, label, title, value, postlabel, onchangeFn,
      length, placeholder, time) {
    var df = document.createElement('input');
    if (id) df.setAttribute('id', id);
    df.setAttribute('type', 'text');
    df.setAttribute('value', value);

    if (placeholder) {
      df.setAttribute('placeholder', placeholder);
    }

    if (length) df.setAttribute('size', length);
    if (onchangeFn) df.onchange = onchangeFn;
    if (label || postlabel) {
      var labelEl = document.createElement('label');
      labelEl.setAttribute('title', title);
      if (label) labelEl.appendChild(document.createTextNode(label));
      labelEl.appendChild(df);
      if (postlabel) labelEl.appendChild(document.createTextNode(postlabel));
      return labelEl;
    } else {
      return df;
    }
  };

  DOM.appendOptionsToSelect = function(select, items, selectedValue, clear) {
    if (clear) {
      while (select.lastChild) {
        select.removeChild(select.lastChild);
      }
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
      if (option.value == selectedValue) {
        option.defaultSelected = true;
        option.selected = true;
      }
      select.appendChild(option);
    });
  };

  DOM.createSelect = function(id, items, selectedValue, onChange) {
    var select = document.createElement('select');
    if (id) {
      select.setAttribute("id", id);
    }
    DOM.appendOptionsToSelect(select, items, selectedValue);
    if (CATMAID.tools.isFn(onChange)) {
      select.addEventListener("change", onChange);
    }
    return select;
  };

  DOM.createSelectElement = function(label, entries, title, value, onChangeFn, id) {
    let select = CATMAID.DOM.createSelect(id, entries, value);
    var labelElement = document.createElement('label');
    if (title) {
      select.title = title;
      labelElement.setAttribute('title', title);
    }
    if (onChangeFn) {
      select.onchange= onChangeFn;
    }

    labelElement.appendChild(document.createTextNode(label || ''));
    labelElement.appendChild(select);

    return labelElement;
  };

  /**
   * Create a tab group and add it to the passed in container. The widget ID is
   * expected to be unique.
   */
  DOM.addTabGroup = function(container, widgetId, titles) {
    var ul = document.createElement('ul');
    container.appendChild(ul);
    return titles.reduce(function(o, name) {
      var id = name.replace(/ /g, '') + widgetId;
      ul.appendChild($('<li><a href="#' + id + '">' + name + '</a></li>')[0]);
      var div = document.createElement('div');
      div.setAttribute('id', id);
      container.appendChild(div);
      o[name] = div;
      return o;
    }, {});
  };

  DOM.appendElement = function(target, e) {
    switch (e.type) {
      case 'child':
        return target.appendChild(e.element);
      case 'button':
        return CATMAID.DOM.appendButton(target, e.label, e.title, e.onclick, e.attr, e.disabled, e.id);
      case 'color-button':
        return CATMAID.DOM.appendColorButton(target, e.label, e.title, e.attr, e.onchange, e.color);
      case 'checkbox':
        return CATMAID.DOM.appendCheckbox(target, e.label, e.title, e.value, e.onclick, e.left, e.id);
      case 'radio':
        return CATMAID.DOM.appendRadioButton(target, e.label, e.title, e.name,
            e.value, e.checked, e.onclick, e.left, e.id);
      case 'numeric':
        return CATMAID.DOM.appendNumericField(target, e.label, e.title,
            e.value, e.postlabel, e.onchange, e.length, e.placeholder,
            e.disabled, e.step, e.min, e.max, e.id);
      case 'text':
        return CATMAID.DOM.appendTextField(target, e.id, e.label, e.title, e.value,
            e.postlabel, e.onchange, e.length, e.placeholder, e.disabled, e.onenter);
      case 'date':
        return CATMAID.DOM.appendDateField(target, e.label, e.title, e.value,
            e.postlabel, e.onchange, e.length, e.placeholder, e.time);
      case 'select':
        return CATMAID.DOM.appendSelect(target, e.relativeId, e.label, e.entries, e.title, e.value, e.onchange, e.id);
      case 'file':
        return CATMAID.DOM.appendFileButton(target, e.id, e.label, e.title, e.multiple, e.onclick);
      case 'folder':
        return CATMAID.DOM.appendFolderButton(target, e.id, e.label, e.title, e.multiple, e.onclick);
      default:
        return undefined;
    }
  };

  /**
   * Construct elements from an array of parameters and append them to a tab
   * element.

   * @param {Element}     tab   The tab to which to append constructed elements.
   * @param {Array.<(Object|Array)>} elements
   *                             An array of parameters from which to construct
   *                             elements. The elements of the array are either
   *                             arrays of parameters, in which case the length
   *                             of the array is used to choose element type, or
   *                             an object specifying parameters, in which case
   *                             the `type` property specifies element type.
   * @return {Element[]}         An array of the constructed elements.
   */
  DOM.appendToTab = function(tab, elements) {
    return elements.map(function(e) {
      if (Array.isArray(e)) {
        switch (e.length) {
          case 1: return tab.appendChild(e[0]);
          case 2: return CATMAID.DOM.appendButton(tab, e[0], undefined, e[1]);
          case 3: return CATMAID.DOM.appendButton(tab, e[0], undefined, e[1], e[2]);
          case 4: return CATMAID.DOM.appendCheckbox(tab, e[0], e[0], e[1], e[2], e[3]);
          case 5: return CATMAID.DOM.appendNumericField(tab, e[0], e[0], e[1], e[2], e[3], e[4]);
          default: return undefined;
        }
      } else {
        return CATMAID.DOM.appendElement(tab, e);
      }
    });
  };

  /**
   * Append a new button to another element.
   */
  DOM.appendButton = function(div, label, title, onclickFn, attr, disabled, id) {
    var b = document.createElement('input');
    if (id) {
      b.setAttribute('id', id);
    }
    if (attr) Object.keys(attr).forEach(function(key) { b.setAttribute(key, attr[key]); });
    b.setAttribute('type', 'button');
    b.setAttribute('value', label);
    if (title) {
      b.setAttribute('title', title);
    }
    if (disabled) {
      b.disabled = true;
    }
    b.onclick = onclickFn;
    div.appendChild(b);
    return b;
  };

  /**
   * Append a new color button to another element.
   */
  DOM.appendColorButton = function(div, label, title, attr, onChange, colorOptions) {
    colorOptions = colorOptions || {};

    if (onChange) {
      colorOptions['onColorChange'] = onChange;
    }

    var b = document.createElement('button');
    if (attr) {
      Object.keys(attr).forEach(function(key) { b.setAttribute(key, attr[key]); });
    }
    b.appendChild(document.createTextNode(label));
    if (title) {
      b.setAttribute('title', title);
    }

    CATMAID.ColorPicker.enable(b, colorOptions);

    div.appendChild(b);
    return b;
  };

  /**
   * Append a new checkbox to another element.
   */
  DOM.appendCheckbox = function(div, label, title, value, onclickFn, left, id) {
    var labelEl = document.createElement('label');
    if (title) {
      labelEl.setAttribute('title', title);
    }
    var elems = DOM.createCheckbox(label, value, onclickFn, id);
    if (left) elems.reverse();
    elems.forEach(function(elem) { labelEl.appendChild(elem); });
    div.appendChild(labelEl);
    return labelEl;
  };

  /**
   * Append a new radio button to another element.
   */
  DOM.appendRadioButton = function(div, label, title, name, value, checked,
      onclickFn, left, id) {
    var labelEl = document.createElement('label');
    if (title) {
      labelEl.setAttribute('title', title);
    }
    var elems = DOM.createRadioButton(label, name, value, checked, onclickFn, id);
    if (left) elems.reverse();
    elems.forEach(function(elem) { labelEl.appendChild(elem); });
    div.appendChild(labelEl);
    return labelEl;
  };

  /**
   * Append a new numeric input field to another element.
   */
  DOM.appendNumericField = function(div, label, title, value, postlabel,
      onchangeFn, length, placeholder, disabled, step, min, max, id) {
    var field = DOM.createNumericField(id, label, title, value, postlabel,
        onchangeFn, length, placeholder, disabled, step, min, max);
    div.appendChild(field);
    return field;
  };

  /**
   * Append a new text input field to another element.
   */
  DOM.appendTextField = function(div, id, label, title, value, postlabel,
      onchangeFn, length, placeholder, disabled, onEnterFn) {
    var field = DOM.createInput('text', id, label, title, value, postlabel,
        onchangeFn, length, placeholder, disabled, onEnterFn);
    div.appendChild(field);
    return field;
  };

  /**
   * Append a new date input field to another element.
   */
  DOM.appendDateField = function(div, label, title, value, postlabel,
      onchangeFn, length, placeholder, time) {
    var field = DOM.createDateField(undefined, label, title, value, postlabel,
        onchangeFn, length, placeholder, time);
    div.appendChild(field);
    return field;
  };

  /**
   * Append a new select element to another element.
   */
  DOM.appendSelect = function(div, relId, label, entries, title, value,
      onChangeFn, id) {
    id = id ? id : (relId ? (div.id + '_' + relId) : undefined);
    let selectWrapper = CATMAID.DOM.createSelectElement(label, entries, title, value,
        onChangeFn, id);
    div.append(selectWrapper);
    let select = selectWrapper.querySelector('select');
    return select;
  };

  DOM.appendLabeledElement = function(target, title, element) {
    var label = document.createElement('label');
    label.setAttribute('title', title);
    label.appendChild(document.createTextNode(label));
    label.appendChild(element);
    return label;
  };

  DOM.createSkeletonNodeMatcherSetting = function(options) {
    var settings = options.settings;
    if (!settings) {
      throw new CATMAID.ValueError('Need settings reference');
    }
    var id = options.id;
    if (!id) {
      throw new CATMAID.ValueError('Need ID');
    }
    var update = options.updateSettings;
    if (!CATMAID.tools.isFn(update)) {
      throw new CATMAID.ValueError('Need update function');
    }
    var radioControl = CATMAID.DOM.createRadioSetting(
        id,
        [{
          id: id + '-universal',
          desc: 'Universal match',
          checked: settings.hasOwnProperty('universal')
        },{
          id: id + '-meta-annotation',
          desc: 'Match meta-annotation',
          checked: settings.hasOwnProperty('metaAnnotationName')
        },{
          id: id + '-creator',
          desc: 'Match by creator',
          checked: settings.hasOwnProperty('creatorID')
        }],
        null,
        function () {
          var radioValue = $('input[type="radio"][name="' + id + '"]:checked').val();
          var newSetting = {};
          switch (radioValue.split('-').slice(-1)[0]) {
            case 'universal':
              newSetting.universal = $('#' + id + '-value-0').val();
              break;
            case 'annotation':
              newSetting.metaAnnotationName = $('#' + id + '-value-1').val();
              break;
            case 'creator':
              var creatorValue = $('#' + id + '-value-2').val();
              newSetting.creatorID = parseInt(creatorValue, 10);
              break;
          }

          update(newSetting);
        }).addClass('setting');

    // Add additional controls
    radioControl.children().each(function (i, radio) {
      var select;
      var checkRadioOnChange = function (name) {
        return function () {
          $('#' + id + '-' + name)
              .prop('checked', true)
              .trigger('change');
        };
      };
      switch (i) {
        case 0:
          var selected = settings.hasOwnProperty('universal') ?
              settings.universal : 'none';
          select = CATMAID.DOM.createSelectSetting(
                '',
                {'All skeletons': 'all', 'No skeletons': 'none'},
                null,
                checkRadioOnChange('universal'),
                selected);
          select = select.children('label').children('select');
          break;
        case 1:
          var selected = settings.hasOwnProperty('metaAnnotationName') ?
              settings.metaAnnotationName : null;
          select = $('<input/>').attr('type', 'text')
              .addClass("ui-corner-all").val(selected);
          select.change(checkRadioOnChange('meta-annotation'));
          select.autocomplete({
            source: CATMAID.annotations.getAllNames(),
            change: checkRadioOnChange('meta-annotation')
          });
          break;
        case 2:
          var selected = settings.hasOwnProperty('creatorID') ?
              settings.creatorID : null;
          var users = CATMAID.User.all();
          users = Object.keys(users)
              .map(function (userID) { return users[userID]; })
              .sort(CATMAID.User.displayNameCompare)
              .reduce(function (o, user) {
                o[user.getDisplayName()] = user.id;
                return o;
              }, {});
          select = CATMAID.DOM.createSelectSetting(
                '',
                users,
                null,
                checkRadioOnChange('creator'),
                selected);
          select = select.children('label').children('select');
          break;
      }

      select.attr('id', id + '-value-' + i);
      $(radio).append(select);
    });

    if (options.help) {
    radioControl.prepend($('<p/>')
          .addClass('help')
          .append(options.help));
    }

    if (options.label) {
      radioControl.prepend($('<h4/>').append(label));
    }

    var radioWrapper = $('<div />').addClass('setting');
    radioWrapper.append(radioControl);
    return radioWrapper;
  };

  DOM.initLinkTypeList = function(target) {
    return CATMAID.Connectors.linkTypes(project.id)
      .then(function(json) {
        var seenLinkTypes = new Set();
        let linkTypes;
        if (target.byPartnerReference) {
          linkTypes = json.sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.partner_reference, b.partner_reference);
          }).map(function(lt) {
            return {
              title: lt.partner_reference,
              value: lt.partner_reference
            };
          });
        } else {
          linkTypes = json.sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.type, b.type);
          }).filter(function(lt, i, a) {
            // Remove duplicates
            let isNew = !seenLinkTypes.has(lt.type);
            seenLinkTypes.add(lt.type);
            return isNew;
          }).map(function(lt) {
            return {
              title: lt.type,
              value: lt.type_id
            };
          });
        }

        var selectedLinkTypes = target.getSelectedLinkTypes();
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createCheckboxSelect('Link types', linkTypes,
            selectedLinkTypes, true);

        // Add color buttons for already display options
        if (target.color) {
          $('input:checked', node).each(function(e) {
            var li = this.closest('li');
            if (!li) {
              return;
            }
            var linkTypeId = this.value;
            var linkTypeControls = li.appendChild(document.createElement('span'));
            linkTypeControls.setAttribute('data-role', 'link-type-controls');
            CATMAID.DOM.appendColorButton(linkTypeControls, 'c',
              'Change the color of this link type',
              undefined, undefined, {
                initialColor: target.getLinkTypeColor(linkTypeId),
                initialAlpha: target.getLinkTypeOpacity(linkTypeId),
                onColorChange: target.updateLinkTypeColor.bind(window, linkTypeId)
              });
          });
        }

        // Add a selection handler
        node.onchange = function(e) {
          var visible = e.target.checked;
          var linkTypeId = e.target.value;
          target.setLinkTypeVisibility(linkTypeId, visible);
          target.update();

          // Add extra display controls for enabled volumes
          var li = e.target.closest('li');
          if (!li) {
            return;
          }
          if (target.color) {
            if (visible) {
              var linkTypeControls = li.appendChild(document.createElement('span'));
              linkTypeControls.setAttribute('data-role', 'link-type-controls');
              CATMAID.DOM.appendColorButton(linkTypeControls, 'c',
                'Change the color of this link type',
                undefined, undefined, {
                  initialColor: target.getLinkTypeColor(linkTypeId),
                  initialAlpha: target.getLinkTypeOpacity(linkTypeId),
                  onColorChange: target.updateLinkTypeColor.bind(target, linkTypeId)
                });
            } else {
              var linkTypeControls = li.querySelector('span[data-role=link-type-controls]');
              if (linkTypeControls) {
                li.removeChild(linkTypeControls);
              }
            }
          }
        };
        return node;
      });
    };

  // Export DOM namespace
  CATMAID.DOM = DOM;

})(CATMAID);

