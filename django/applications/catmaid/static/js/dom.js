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

  // Export DOM namespace
  CATMAID.DOM = DOM;

})(CATMAID);

