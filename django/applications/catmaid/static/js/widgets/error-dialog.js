(function(CATMAID) {

  "use strict";

    /**
     * Creates a jQuery UI based error dialog. If detail is passed, it is hidden by
     * default. The dialog allows to expand it, however.
     */
    var ErrorDialog = function(text, detail) {
      var title = "An error occured";
      var metaMsg = "Several errors have occured";
      var id = "error-dialog-confirm";
      CATMAID.DetailDialog.call(this, text, detail, title, metaMsg, id);
    };

    ErrorDialog.prototype = Object.create(CATMAID.DetailDialog.prototype);


    /**
     * A special form of the error dialog is the version mismatch dialog.
     * Optionally, an alternative text can be provided.
     */
    var VersionMismatchDialog = function(clientVersion, serverVersion, text, detail) {
      this.clientVersion = clientVersion;
      this.serverVersion = serverVersion;

      text = text || "Your version of CATMAID is different " +
          "from the server's version. Please refresh your browser " +
          "immediately to update to the server's version. Continuing to " +
          "use a different version than the server can cause " +
          "unintended behavior and data loss.";
      detail = 'Client version: ' + clientVersion + '; ' +
          'Server version: ' + serverVersion;

      var title = "New CATMAID version";

      var metaMsg = "The version check was done multiple times";
      var id = "version-dialog-confirm";
      CATMAID.DetailDialog.call(this, text, detail, title, metaMsg, id);
    };

    VersionMismatchDialog.prototype = CATMAID.DetailDialog.prototype;

    var TooManyWebGlContextsDialog = function(text, detail) {
      var title = 'Too many WebGL contexts';
      text = text || 'Browsers constrain how many graphics-heavy elements can be used at once. ' +
        'You have tried to open more than your browser allows. Please close some other stack viewers or 3D viewers,' +
        ' or other browser tabs if they have WebGL elements; then re-open the widget you wanted.';
      var metaMsg = '';
      detail = detail || `Stack / 3D Viewers currently open: ${CATMAID.countWebGlContexts()}\n` +
        `Maximum allowed: ${CATMAID.MAX_WEBGL_CONTEXTS}`;
      var id = 'too-many-webgl-contexts-confirm';
      CATMAID.DetailDialog.call(this, text, detail, title, metaMsg, id);
    };

    TooManyWebGlContextsDialog.prototype = CATMAID.DetailDialog.prototype;

    // Make in CATMAID namespace
    CATMAID.ErrorDialog = ErrorDialog;
    CATMAID.VersionMismatchDialog = VersionMismatchDialog;
    CATMAID.TooManyWebGlContextsDialog = TooManyWebGlContextsDialog;

})(CATMAID);
