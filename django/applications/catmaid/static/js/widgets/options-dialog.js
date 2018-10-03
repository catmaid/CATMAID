/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
 */

(function(CATMAID) {

  /**
   * Create a flexible option dialog.
   */
  var OptionsDialog = function(title, buttons, manualDestroy) {
    this.dialog = document.createElement('div');
    this.dialog.setAttribute("id", "dialog-confirm");
    this.dialog.setAttribute("class", "dialog-confirm");
    this.dialog.setAttribute("title", title);
    this.buttons = buttons;
    this.manualDestroy = manualDestroy;
  };

  OptionsDialog.prototype = {};

  /**
   * Show ValueError instances as warning, otherwise let CATMAID deal with the
   * error.
   */
  function handleError(error) {
    if (error instanceof CATMAID.ValueError) {
      CATMAID.warn(error);
    } else {
      CATMAID.handleError(error);
    }
  }

  /**
   * Takes three optional arguments; default to 300, 200, true.
   */
  OptionsDialog.prototype.show = function(width, height, modal, maxHeight, resize) {
    var self = this;
    var buttons;
    if (this.buttons) {
      buttons = {};
      for (var b in this.buttons) {
        buttons[b] = (function(callback) {
          return function() {
            try {
              CATMAID.tools.callIfFn(callback);
              if (!self.manualDestroy) {
                $(this).dialog("destroy");
              }
            } catch (error) {
              handleError(error);
            }
          };
        })(this.buttons[b]);
      }
    } else {
      buttons = {
        "Cancel": function() {
          try {
            if (self.onCancel) self.onCancel();
            if (!self.manualDestroy) {
              $(this).dialog("destroy");
            }
          } catch (error) {
            handleError(error);
          }
        },
        "OK": function() {
          try {
            if (self.onOK) self.onOK();
            if (!self.manualDestroy) {
              $(this).dialog("destroy");
            }
          } catch (error) {
            handleError(error);
          }
        }
      };
    }
    // With auto height the maximum height is set to two thirds of the available
    // height.
    var fallbackMaxHeight = height === 'auto' ?
        Math.floor(CATMAID.ui.getFrameHeight() * 0.66) : undefined;

    $(this.dialog).dialog({
      width: width ? width : 300,
      height: height ? height : 200,
      maxHeight: CATMAID.tools.getDefined(maxHeight, fallbackMaxHeight),
      modal: modal !== undefined ? modal : true,
      close: function() {
        try {
          if (self.onCancel) self.onCancel();
          $(this).dialog("destroy");
        } catch (error) {
          handleError(error);
        }
      },
      buttons: buttons,
      resize: resize
    });
  };

  OptionsDialog.prototype.appendChild = function(element) {
    var container = document.createElement('p');
    container.appendChild(element);
    this.dialog.appendChild(container);
    return container;
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
        if (e.key == 'Enter') {
          $(this.dialog).parent().find(
              '.ui-dialog-buttonpane button:last').click();
          return false;
        }
      }).bind(this));
    }
    return input;
  };

  OptionsDialog.prototype.appendNumericField = function(title, fieldID,
      initialValue, min, max, step, submitOnEnter) {
    var input = this.appendField(title, fieldID, initialValue, submitOnEnter);
    input.setAttribute('type', 'number');
    if (min !== undefined) {
      input.setAttribute('min', min);
    }
    if (max !== undefined) {
      input.setAttribute('max', max);
    }
    if (step !== undefined) {
      input.setAttribute('step', step);
    }
    return input;
  };

  OptionsDialog.prototype.appendCheckbox = function(title, checkboxID, selected, helptext) {
    var p = document.createElement('p');
    var checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.setAttribute('id', checkboxID);
    if (selected) checkbox.setAttribute('checked', 'true');
    p.appendChild(checkbox);
    p.appendChild(document.createTextNode(title));
    if (helptext) {
      p.setAttribute('title', helptext);
    }
    this.dialog.appendChild(p);
    return checkbox;
  };

  /**
   * Add a table to the options dialog that includes sorting controls for each
   * row. This table has two columns: row order controls and title. If the row
   * order in the displayed table changes, the original input array is updated
   * as well.
   *
   * @param {object[]} items  An array of objects. Each object is expected to
   *                          have a title field, but is free to have additional
   *                          members.
   * @param {string}   title  (optional) A column title for the data column. By
   *                          default, 'Item' is used.
   * @param {boolean}  paging (optional) Whether pagination controls should be
   *                          shown. False by default.
   * @returns {Element} The DOM reference to the created table.
   */
  OptionsDialog.prototype.appendSortableTable = function(items, title, paging) {
    // Keep a (shallow) copy of the original sorting
    var originalData = items.slice();
    // Annotate each items with its orignal index
    var augmentedRows = items.map(function(d, i) {
      return {
        originalIndex: i,
        data: d
      };
    });
    var table = this.dialog.appendChild(document.createElement('table'));
    var header = table.appendChild(document.createElement('thead'));
    var headerRow = header.appendChild(document.createElement('tr'));
    var header1 = headerRow.appendChild(document.createElement('th'));
    var header2 = headerRow.appendChild(document.createElement('th'));
    header2.appendChild(document.createTextNode(title || 'Item'));

    var datatable = $(table).DataTable({
      dom: paging ? 't<ip>' : 't<i>',
      order: [],
      data: augmentedRows,
      autoWidth: false,
      paging: !!paging,
      columns: [{
        width: '15%',
        class: 'cm-center',
        orderable: false,
        render: function(data, type, row, meta) {
          var upClasses = meta.row === 0 ? 'fa fa-caret-up fa-disabled' : 'fa fa-caret-up';
          var downClasses = meta.row === (items.length - 1) ? 'fa fa-caret-down fa-disabled' : 'fa fa-caret-down';
          return '<i class="' + upClasses + '" data-action="move-up" title="Move item up in list"></i>' +
              '<i class="' + downClasses + '" data-action="move-down" title="Move item down in list"></i>';
        }
      }, {
        width: '85%',
        data: 'data.title',
        orderable: true,
      }]
    }).on('click', 'i', function() {
      var action = this.dataset.action;
      var tr = this.closest('tr');
      var index = datatable.row(tr).index();
      var currentValue = items[index];
      if (action === 'move-up') {
        if (index === 0) {
          return;
        }
        items[index] = items[index -1];
        items[index - 1] = currentValue;
      } else if (action === 'move-down') {
        if (index === items.length - 1) {
          return;
        }
        items[index] = items[index + 1];
        items[index + 1] = currentValue;
      } else {
        throw new CATMAID.ValueError("Unknown action: " + action);
      }
      // Add original index information
      var augmentedItems = items.map(function(d, i) {
        var originalIndex = i;
        return {
          originalIndex: originalData.indexOf(d),
          data: d
        };
      });
      // Repopulate table
      datatable.clear();
      datatable.rows.add(augmentedItems);
      datatable.draw();
    }).on("order.dt", function(e) {
      // Get the current order of skeletons
      var rows = datatable.rows({order: 'current'}).data().toArray();
      var sortedOriginalIndexes = rows.map(function(d) {
        return d.originalIndex;
      });
      // Update order in input data. This is easiest done with respect to the
      // original sorting order.
      items.sort(function(a, b) {
        // Get original indices (the input data indices could have changed
        // alrady).
        var orignalIndexA = originalData.indexOf(a);
        var orignalIndexB = originalData.indexOf(b);
        var newIndexA = sortedOriginalIndexes.indexOf(orignalIndexA);
        var newIndexB = sortedOriginalIndexes.indexOf(orignalIndexB);
        return newIndexA - newIndexB;
      });
    });

    return table;
  };


  /**
   * Add extra dialog controls to the left of the dialog footer.
   */
  OptionsDialog.prototype.appendExtraControls = function(extraControls) {
    var customOptions = document.createElement('div');
    customOptions.setAttribute('class', 'ui-dialog-extra-buttonset');

    CATMAID.DOM.appendToTab(customOptions, extraControls);

    // Add extra options to the button pane
    $(".ui-dialog-buttonpane", this.dialog.parent).prepend(customOptions);
  };

  // Make option dialog available in CATMAID namespace
  CATMAID.OptionsDialog = OptionsDialog;

})(CATMAID);
