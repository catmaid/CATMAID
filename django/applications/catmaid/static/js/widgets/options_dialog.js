/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
 */

(function(CATMAID) {

  /**
   * Create a flexible option dialog.
   */
  var OptionsDialog = function(title) {
    this.dialog = document.createElement('div');
    this.dialog.setAttribute("id", "dialog-confirm");
    this.dialog.setAttribute("title", title);
  };

  OptionsDialog.prototype = {};

  /**
   * Takes three optional arguments; default to 300, 200, true.
   */
  OptionsDialog.prototype.show = function(width, height, modal) {
    var self = this;
    $(this.dialog).dialog({
      width: width ? width : 300,
      height: height ? height : 200,
      modal: modal !== undefined ? modal : true,
      close: function() {
        if (self.onCancel) self.onCancel();
        $(this).dialog("destroy");
      },
      buttons: {
        "Cancel": function() {
          if (self.onCancel) self.onCancel();
          $(this).dialog("destroy");
        },
        "OK": function() {
          if (self.onOK) self.onOK();
          $(this).dialog("destroy");
        }
      }
    });
  };

  OptionsDialog.prototype.appendHTML = function(html) {
    var container = document.createElement('p');
    container.innerHTML = html;
    this.dialog.appendChild(container);
    return container;
  };

  OptionsDialog.prototype.appendMessage = function(text) {
    var msg = document.createElement('p');
    msg.appendChild(document.createTextNode(text));
    this.dialog.appendChild(msg);
    return msg;
  };

  OptionsDialog.prototype.appendChoice = function(title, choiceID, names, values, defaultValue) {
    if (!names || !values || names.length !== values.length) {
      alert("Improper arrays for names and values.");
      return;
    }
    var p = document.createElement('p');
    if (title) p.innerHTML = title;
    var choice = document.createElement('select');
    choice.setAttribute("id", choiceID);
    for (var i=0, len=names.length; i<len; ++i) {
      var option = document.createElement('option');
      option.text = names[i];
      option.value = values[i];
      option.defaultSelected = defaultValue === values[i];
      choice.add(option);
    }
    p.appendChild(choice);
    this.dialog.appendChild(p);
    return choice;
  };

  OptionsDialog.prototype.appendField = function(title, fieldID,
      initialValue, submitOnEnter) {
    var p = document.createElement('p');
    var label = document.createElement('label');
    label.setAttribute('for', fieldID);
    label.appendChild(document.createTextNode(title));
    p.appendChild(label);
    var input = document.createElement('input');
    input.setAttribute("id", fieldID);
    input.setAttribute("value", initialValue);
    p.appendChild(input);
    this.dialog.appendChild(p);
    // Make this field press okay on Enter, if wanted
    if (submitOnEnter) {
      $(input).keypress((function(e) {
        if (e.keyCode == $.ui.keyCode.ENTER) {
          $(this.dialog).parent().find(
              '.ui-dialog-buttonpane button:last').click();
          return false;
        }
      }).bind(this));
    }
    return input;
  };

  OptionsDialog.prototype.appendCheckbox = function(title, checkboxID, selected) {
    var p = document.createElement('p');
    var checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.setAttribute('id', checkboxID);
    if (selected) checkbox.setAttribute('checked', 'true');
    p.appendChild(checkbox);
    p.appendChild(document.createTextNode(title));
    this.dialog.appendChild(p);
    return checkbox;
  };

  // Make option dialog available in CATMAID namespace
  CATMAID.OptionsDialog = OptionsDialog;

})(CATMAID);
