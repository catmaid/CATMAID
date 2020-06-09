(function(CATMAID) {

    /**
     * Creates a dialog which suggests a state update dialog.
     */
    var StateUpdateDialog = function(text, detail, refresh) {
      this.refresh = refresh;
      var originalError = (text ? (text + ": ") : "") + (detail ? detail : "");
      var message = "Your last action couldn't be performed, because the " +
        "server reported it has more recent data availale. Please update " +
        "your view, check if there were changes relevant for your original " +
        "action and try again. If you don't want to update your view manually, " +
        "you can use the \"Refresh view\" button below.";
      CATMAID.ErrorDialog.call(this, message, originalError);
      this.dialog.setAttribute("title", "Current view needs update");
    };

    StateUpdateDialog.prototype = {};

    StateUpdateDialog.prototype.show = function() {
      var self = this;
      $(this.dialog).dialog({
        width: '400px',
        height: 'auto',
        maxHeight: 600,
        modal: true,
        buttons: {
          "Refresh view": function() {
            $(this).dialog("destroy");
            CATMAID.tools.callIfFn(self.refresh);
          },
          "Close without refresh": function() {
            $(this).dialog("destroy");
          }
        },
        close: function() {
          $( this ).dialog( "destroy" );
        }
      });
    };

    // Make dialog available in CATMAID namespace
    CATMAID.StateUpdateDialog = StateUpdateDialog;

})(CATMAID);
