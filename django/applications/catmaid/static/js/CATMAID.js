/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  OptionsDialog,
  login
*/

(function(CATMAID)
 {
  // The UI singleton
  var ui;
  Object.defineProperty(CATMAID, 'ui', {
    get: function() {
      // Initialize the singleton if it doesn't exist, yet
      if (!ui) {
        ui = new CATMAID.UI();
      }
      return ui;
    },
  });
})(CATMAID);


/* It's very easy to accidentally leave in a console.log if you're working with
 * Firebug, but this will break CATMAID for some browsers.  If window.console
 * isn't defined, create a noop version of console.log: */
if (!window.console) {
  window.console = {};
  window.console.log = function() {};
}


// Attach a general error handler
window.onerror = function(msg, url, lineno, colno, err)
{
  var info = 'An error occured in CATMAID and the current action can\'t be ' +
      'completed. You can try to reload the widget or tool you just used.';
  var detail = 'Error: ' + msg + ' URL: ' + url + ' Line: ' + lineno +
      ' Column: ' + colno + ' Stacktrace: ' + (err ? err.stack : 'N/A');

  // Log the error detail to the console
  console.log(detail);

  // Log the error in the backend, bypass the request queue and make a direct
  // AJAX call through jQuery.
  $.ajax({
    'url': django_url + 'log/error',
    'type': 'POST',
    'data': {
      'msg': detail,
    }
  });

  // Log the error object, if available
  if (err) {
    console.log('Error object:');
    console.log(err);
  } else {
    console.log('No error object was provided');
  }

  // Use alert() to inform the user, if the error function isn't available for
  // some reason
  if (CATMAID && CATMAID.error) {
    CATMAID.error(info, detail);
  } else {
    alert(info + ' Detail: ' + detail);
  }

  // Return true to indicate the exception is handled and doesn't need to be
  // shown to the user.
  return true;
};


/**
 * Creates a jQuery UI based error dialog. If detail is passed, it is hidden by
 * default. The dialog allows to expand it, however.
 */
CATMAID.ErrorDialog = function(text, detail) {
  this.dialog = document.getElementById("error-dialog-confirm");
  if (null === this.dialog) {
    this.dialog = document.createElement('div');
    this.dialog.setAttribute("id", "error-dialog-confirm");
    this.dialog.setAttribute("title", "An error occured");
  } else {
    var metaMsg = "Several errors have occured:";
    if (this.dialog.firstChild.textContent !== metaMsg) {
      this.dialog.insertAdjacentHTML("afterbegin", "<h3>" + metaMsg + "</h3>");
    }
  }
  // Create error message tags
  var msg = document.createElement('p');
  msg.appendChild(document.createTextNode(text));
  this.dialog.appendChild(msg);
  // Create detail field, if detail available
  if (detail) {
    var detail_head = document.createElement('p');
    var detail_head_em = document.createElement('em');
    detail_head_em.appendChild(document.createTextNode('Show/hide detail'));
    detail_head.appendChild(detail_head_em);
    this.dialog.appendChild(detail_head);
    var detail_text = document.createElement('p');
    detail_text.appendChild(document.createTextNode(detail));
    this.dialog.appendChild(detail_text);
    // Hide detail by default and toggle display by click on header
    $(detail_text).hide();
    $(detail_head).click(function() {
      $(detail_text).toggle();
    });
    $(detail_head_em).css('cursor', 'pointer');
  }
};

CATMAID.ErrorDialog.prototype = {};

/**
 * Displays the error dialog.
 */
CATMAID.ErrorDialog.prototype.show = function() {
  $(this.dialog).dialog({
    width: '400px',
    height: 'auto',
    maxHeight: 600,
    modal: true,
    buttons: {
      "OK": function() {
        $(this).dialog("destroy");
      }
    },
    close: function() {
      $( this ).dialog( "destroy" );
    }
  });
};

/**
 * Creates a simple login dialog.
 */
CATMAID.LoginDialog = function(text, callback) {
  this.dialog = new OptionsDialog("Permission required");
  if (text) {
    this.dialog.appendMessage(text);
  }
  // Add short login text
  var login_text = "Please enter the credentials for a user with the " +
      "necessary credentials to continue to the requested information";
  this.dialog.appendMessage(login_text);
  // Add input fields
  var user_field = this.dialog.appendField('Username', 'username', '', true);
  var pass_field = this.dialog.appendField('Password', 'password', '', true);
  pass_field.setAttribute('type', 'password');
  // Align input fields better
  $(this.dialog.dialog).find('label').css('width', '25%');
  $(this.dialog.dialog).find('label').css('display', 'inline-block');

  // If OK is pressed, the dialog should cause a (re-)login
  this.dialog.onOK = function() {
    login($(user_field).val(), $(pass_field).val(), callback);
  };
};

CATMAID.LoginDialog.prototype = {};

/**
 * Displays the login dialog.
 */
CATMAID.LoginDialog.prototype.show = function() {
  this.dialog.show('400', 'auto', true);
};

/**
 * Creates a generic JSON response handler that complains when the response
 * status is different from 200 or a JSON error is set.
 *
 * @param success Called on success
 * @param error Called on error
 * @param silent No error dialogs are shown, if true
 */
CATMAID.jsonResponseHandler = function(success, error, silent)
{
  return function(status, text, xml) {
    if (status === 200 && text) {
      var json = $.parseJSON(text);
      if (json.error) {
        // Call error handler, if any, and force silence if it returned true.
        if (CATMAID.tools.isFn(error)) {
          silent = silent || error(json);
        }
        if (!silent) {
          CATMAID.error(json.error, json.detail);
        }
      } else {
        CATMAID.tools.callIfFn(success, json);
      }
    } else {
      // Call error handler, if any, and force silence if it returned true.
      if (CATMAID.tools.isFn(error)) {
        silent = silent || error();
      }
      if (!silent) {
        CATMAID.error("An error occured", "The server returned an unexpected " +
            "status: " + status);
      }
    }
  };
};

/**
 * Convenience function to show an error dialog.
 */
CATMAID.error = function(msg, detail)
{
  new CATMAID.ErrorDialog(msg, detail).show();
};

/**
 * Convenience function to show a growl message
 */
CATMAID.msg = function(title, msg)
{
  growlAlert(title, msg);
};

/**
 * Convenience function to show a growl info message.
 */
CATMAID.info = CATMAID.msg.bind(window, "Information");

/**
 * Convenience function to show a growl warning message.
 */
CATMAID.warn = CATMAID.msg.bind(window, "Warning");
