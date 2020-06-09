(function(CATMAID) {

  "use strict";

  /**
   * A history dialog allows the user to modify the current state of the current
   * command history. It provides tools to undo and redo saved commands.
   */
  var HistoryDialog = function(options) {
    this.dialog = document.createElement('div');
    this.dialog.classList.add('dialog.catmaid');
    this.dialog.setAttribute("title", "Command History");

    var nCommands = CATMAID.commands.nEntries();

    if (0 === nCommands) {
      this.appendMessage("No commands have been recorded yet.");
      return;
    }

    this.appendMessage("Below you will find a list of the last " + nCommands +
        " recorded commands. You can undo and redo them. The command " +
        "executed last is selected.");
    this._choice = this.appendChoice(null, "history-dialog-history-list",
        [], [], null);
    this._choice.setAttribute("multiple", "yes");
    this._choice.setAttribute("size", "9");
    this._choice.style.width = "100%";
    this.update();
  };

  HistoryDialog.prototype = Object.create(CATMAID.OptionsDialog.prototype);
  HistoryDialog.prototype.constructor = HistoryDialog;

  /**
   * Update UI of this dialog.
   */
  HistoryDialog.prototype.update = function() {
    // Clear options of select
    var select = this._choice;
    while(select.options.length > 0){
      select.remove(0);
    }
    var lastCommand = CATMAID.commands.currentEntry();
    CATMAID.commands.getCommandNames().forEach(function(n, i) {
      var selected = (i === lastCommand);
      var option = new Option(n, i, selected, selected);
      if (i > lastCommand) {
        // Display undo-able in a lighter gray
        option.style.color = "#aaaaaa";
      }
      this.add(option);
    }, select.options);
  };

  /**
   * Takes three optional arguments; default to 600, 300, true.
   */
  HistoryDialog.prototype.show = function(width, height, modal) {
    var self = this;
    var buttons = {
      "Undo": function() {
        CATMAID.commands.undo().then(function() {
          self.update();
        }).catch(CATMAID.handleError);
      },
      "Redo": function() {
        CATMAID.commands.redo().then(function() {
          self.update();
        }).catch(CATMAID.handleError);
      },
      "Close": function() {
        if (self.onOK) self.onOK();
        $(this).dialog("destroy");
      }
    };
    $(this.dialog).dialog({
      width: width ? width : 600,
      height: height ? height : 300,
      modal: modal !== undefined ? modal : true,
      close: function() {
        if (self.onCancel) self.onCancel();
        $(this).dialog("destroy");
      },
      buttons: buttons
    });
  };


  // Export history dialog
  CATMAID.HistoryDialog = HistoryDialog;

})(CATMAID);

