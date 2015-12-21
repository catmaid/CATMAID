/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* gobal
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  var DOM = {};

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
  DOM.createLabeledControl = function(name, control, helptext)
  {
    var label = $('<label/>')
      .append($('<span/>')
        .addClass('description')
        .append(name))
      .append(control);

    if (helptext) {
      label.append(CATMAID.DOM.createHelpText(helptext));
    }

    return $('<div/>').addClass('setting').append(label);
  };

  /**
   * Helper function to create a checkbox with label.
   */
  DOM.createCheckboxSetting = function(name, checked, helptext, handler)
  {
    var cb = $('<input/>').attr('type', 'checkbox');
    if (checked) {
      cb.prop('checked', checked);
    }
    if (handler) {
      cb.change(handler);
    }
    var label = $('<div/>')
      .addClass('setting checkbox-row')
      .append($('<label/>').append(cb).append(name));

    if (helptext) {
      label.append(CATMAID.DOM.createHelpText(helptext));
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
   * Helper function to create a set of radio buttons.
   */
  DOM.createRadioSetting = function(name, values, helptext, handler)
  {
    return values.reduce(function (cont, val) {
      return cont.append(CATMAID.DOM.createLabeledControl(val.desc, $('<input />').attr({
          type: 'radio',
          name: name,
          id: val.id,
          value: val.id
      }, helptext).prop('checked', val.checked).change(handler)));
    }, $('<div />'));
  };

  /**
   * Helper function to create a select element with options.
   */
  DOM.createSelectSetting = function(name, options, helptext, handler)
  {
    var select = $('<select />');
    for (var o in options) {
      select.append(new Option(o, options[o]));
    }
    if (handler) {
      select.on('change', handler);
    }
    return CATMAID.DOM.createLabeledControl(name, select, helptext);
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
    var toggle = document.createElement('span');
    toggle.setAttribute('class', iconClass);
    toggle.onmousedown = handler;

    var wrapper = document.createElement('span');
    wrapper.setAttribute('class', 'ui-state-focus windowButton');
    wrapper.appendChild(toggle);
    if (title) {
      wrapper.setAttribute('title', title);
    }

    $('.stackTitle', win.getFrame()).after(wrapper);
  };

  /**
   * Inject an extra button into the caption of a window. This button allows to
   * show and hide a windows button panel (a top level element of class
   * buttonpanel).
   */
  DOM.addButtonDisplayToggle = function(win, title) {
    title = title || 'Show and hide widget controls';
    DOM.addCaptionButton(win, 'ui-icon ui-icon-gear', title, function() {
      var frame = $(this).closest('.sliceView');
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
  DOM.addSourceControlsToggle = function(win, source, title) {
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
        panel = CATMAID.skeletonListSources.createSourceControls(source);
        panel.setAttribute('class', 'sourcepanel');
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

    DOM.addCaptionButton(win, 'ui-icon ui-icon-link', title, function() {
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

  // Export DOM namespace
  CATMAID.DOM = DOM;

})(CATMAID);

