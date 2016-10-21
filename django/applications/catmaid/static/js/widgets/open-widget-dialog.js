/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    /**
     * Creates a simple widget open dialog.
     */
    var OpenWidgetDialog = function(text, callback) {
      this.dialog = new CATMAID.OptionsDialog("Open widget");
      if (text) {
        this.dialog.appendMessage(text);
      }
      // Add short login text
      var message = "Please enter the name of the widget";
      this.dialog.appendMessage(message);

      // Add input fields
      this.widgetField = this.dialog.appendField('Widget', 'username', '', true);
      // Align input fields better
      $(this.dialog.dialog).find('label').css('width', '25%');
      $(this.dialog.dialog).find('label').css('display', 'inline-block');

      // If OK is pressed, the dialog should cause a (re-)login
      var self = this;
      this.dialog.onOK = function() {
        var widgetName = self.widgetField.value;
        WindowMaker.create(widgetName);
      };
    };

    OpenWidgetDialog.prototype = {};

    /**
     * Displays the login dialog.
     */
    OpenWidgetDialog.prototype.show = function() {
      this.dialog.show('400', 'auto', true);
      $(this.widgetField).autocomplete({
        source: WindowMaker.getAvailableWidgetNames()
      });

			// Allow content to overflow the dialog borders. This is needed for
			// displaying all annotation autocompletion options.
			this.dialog.dialog.parentNode.style.overflow = 'visible';
    };

    // Make dialog available in CATMAID namespace
    CATMAID.OpenWidgetDialog = OpenWidgetDialog;

})(CATMAID);

