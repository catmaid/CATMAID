(function(CATMAID) {

    var singleton = null;

    /**
     * Creates a simple login dialog.
     */
    var LoginDialog = function(text, callback, force, title, showLocalLoginText = true,
        loginErrorCallback = undefined, cancelCallback = undefined) {
      // If there is already a login dialog, don't create a new one, return
      // existing one.
      if (singleton && !force) {
        return singleton;
      }

      // Update singleton
      singleton = this;

      let buttons = {
        'Cancel': e => {
          singleton = null;
          CATMAID.tools.callIfFn(cancelCallback);
        }
      };

      loginErrorCallback = loginErrorCallback || CATMAID.handleError;

      if (CATMAID.Client.Settings.session.show_external_login_controls) {
        Object.keys(CATMAID.extraAuthConfig).sort().forEach(cId => {
          let c = CATMAID.extraAuthConfig[cId];
          let url = c.login_url;
          buttons[`Login with ${c.name}`] = e => {
            singleton = null;
            window.location.href = url;
          };
        });
      }

      if (CATMAID.Client.Settings.session.show_regular_login_controls) {
        buttons['Login'] = function() {
          CATMAID.client.login($(user_field).val(), $(pass_field).val())
            .then(callback)
            .catch(loginErrorCallback);
          singleton = null;
        };
      }

      this.dialog = new CATMAID.OptionsDialog(title || "Permission required", buttons);

      if (text) {
        this.dialog.appendMessage(text);
      }
      // Add short login text
      if (showLocalLoginText) {
        var login_text = "Please sign in as user with the required permissions.";
        this.dialog.appendMessage(login_text);
      }

      if (CATMAID.Client.Settings.session.show_regular_login_controls) {
        // Add input fields
        var user_field = this.dialog.appendField('Username', 'username', '', true);
        var pass_field = this.dialog.appendField('Password', 'password', '', true);
        pass_field.setAttribute('type', 'password');
        // Align input fields better
        $(this.dialog.dialog).find('label').css('width', '25%');
        $(this.dialog.dialog).find('label').css('display', 'inline-block');
      }
    };

    LoginDialog.prototype = {};

    /**
     * Displays the login dialog.
     */
    LoginDialog.prototype.show = function() {
      this.dialog.show('400', 'auto', true);
    };

    // Make dialog available in CATMAID namespace
    CATMAID.LoginDialog = LoginDialog;

})(CATMAID);
