/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    /**
     * Creates a simple widget open dialog.
     */
    var OpenWidgetDialog = function(text, callback) {
      this.dialog = new CATMAID.OptionsDialog("Open widget");
      this.dialog.dialog.classList.add('widget-list');
      if (text) {
        this.dialog.appendMessage(text);
      }

      var message = "Please enter the name of the widget";
      this.dialog.appendMessage(message);

      // Add input fields
      this.widgetField = this.dialog.appendField('Widget', 'widget-name', '', true);
      this.widgetField.setAttribute('autocomplete', 'widget-name');
      // Align input fields better
      $(this.dialog.dialog).find('label').css('width', '5em');
      $(this.dialog.dialog).find('label').css('display', 'inline-block');

      // Add list
      var widgetIndex = {};
      var availableWidgetKeys = WindowMaker.getAvailableWidgetNames().sort(
          CATMAID.tools.compareStrings);
      var widgetListContainer = document.createElement('div');
      this.widgetNameTable = document.createElement('table');
      this.availableWidgets = availableWidgetKeys.map(function(widgetKey) {
        var config = WindowMaker.getWidgetDescription(widgetKey);
        config.key = widgetKey;
        widgetIndex[widgetKey] = config;
        return config;
      }).filter(function(config) {
        return !config.hidden;
      });
      widgetListContainer.appendChild(this.widgetNameTable);
      this.dialog.appendChild(widgetListContainer);

      var self = this;
      var datatable = $(this.widgetNameTable).DataTable({
        dom: 't<ip>',
        autoWidth: false,
        order: [],
        data: this.availableWidgets,
        language: {
          info: "Showing _START_ to _END_  of _TOTAL_ widgets",
          infoFiltered: "(filtered from _MAX_ total widgets)",
          emptyTable: 'No widget found',
          zeroRecords: 'No matching widgets found'
        },
        columns: [{
          data: 'name'
        }, {
          data: 'key'
        }, {
          data: 'description',
        }]
      }).on('click', 'tbody tr', function() {
        var table = $(this.closest('table')).DataTable();
        var row = table.row(this);
        var data = row.data();
        self.widgetField.value = data.key;
      }).on('dblclick', 'tbody tr', function() {
        var table = $(this.closest('table')).DataTable();
        var data = table.row(this).data();
        WindowMaker.create(data.key);
        $(self.dialog.dialog).dialog("destroy");
      });

      var referenceRow = 0;
      var updated = false;

      this.widgetField.onkeydown = function(e) {
        let up = e.key === 'ArrowUp';
        let down = e.key === 'ArrowDown';
        if (up || down) {
          var rows = datatable.rows({order: 'applied', search: 'applied'}).data();
          if (rows) {
            referenceRow = (referenceRow + (up ? -1 : 1)) % rows.length;
            if (referenceRow < 0) {
              referenceRow = rows.length - 1;
            }
            let row = rows[referenceRow];
            if (row) {
              updated = true;
              self.widgetField.value = row.key;
            }
          }
        }
      };

      this.widgetField.onkeyup = function() {
        if (!updated) {
          referenceRow = 0;
          datatable.search(this.value).draw();
        }
        updated = false;
      };

      var self = this;
      this.dialog.onOK = function() {
        var widgetName = self.widgetField.value;
        // If there is no valid widget with this key, take the first entry from
        // the table.
        if (!widgetIndex[widgetName]) {
          var visibleRows = datatable.rows({order: 'applied', search: 'applied'}).data();
          if (visibleRows.length > 0) {
            widgetName = visibleRows[0].key;
          } else {
            CATMAID.warn("No valid widget selected");
            return;
          }
        }
        WindowMaker.create(widgetName);
      };

      // Resizing a select element is apparently only manually possible.
      this._onresize = function() {
        /*
        var dialogStyle = window.getComputedStyle(this.dialog.dialog, null);
        var optionStyle = window.getComputedStyle(widgetNameTable[0], null);
        var fontSize = parseFloat(optionStyle.getPropertyValue('font-size'));
        var remainingElements = 11 * fontSize;

        var dialogHeight = parseFloat(dialogStyle.getPropertyValue('height')) - remainingElements;
        var optionHeight = parseFloat(optionStyle.getPropertyValue('height'));
        widgetNameTable.size = Math.max(2, Math.floor(dialogHeight / optionHeight));
        */
      };
    };

    OpenWidgetDialog.prototype = {};

    /**
     * Displays the widget open dialog.
     */
    OpenWidgetDialog.prototype.show = function() {
      this.dialog.show('700', '380', true, undefined, this._onresize.bind(this));

			// Allow content to overflow the dialog borders. This is needed for
			// displaying all annotation autocompletion options.
			this.dialog.dialog.parentNode.style.overflow = 'visible';

      this._onresize();
    };

    // Make dialog available in CATMAID namespace
    CATMAID.OpenWidgetDialog = OpenWidgetDialog;

})(CATMAID);

