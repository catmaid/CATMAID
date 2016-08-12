/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * A general error containing a message of what went wrong.
   */
  CATMAID.Error = function(message, detail, type) {
    this.name = 'CATMAID error';
    this.message = message || '(no message)';
    this.stack = (new Error()).stack;
    this.detail= detail || this.stack;
    this.type = type;

    // Make error message also available through 'error' field, to be consistent
    // with the back-end API in that regard.
    this.error = this.message;
  };

  CATMAID.Error.prototype = Object.create(Error.prototype);
  CATMAID.Error.constructor = CATMAID.Error;

  /**
   * A simple value error type to indicate some sort of input value problem.
   */
  CATMAID.ValueError = function(message, detail) {
    CATMAID.Error.call(this, message, detail, 'ValueError');
  };

  CATMAID.ValueError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.ValueError.constructor = CATMAID.ValueError;

  /**
   * A simple permission error type to indicate some lack of permissions.
   */
  CATMAID.PermissionError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.PermissionError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.PermissionError.constructor = CATMAID.PermissionError;

  /**
   * An error type to indicate out of range errors in a command history.
   */
  CATMAID.CommandHistoryError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.CommandHistoryError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.CommandHistoryError.constructor = CATMAID.CommandHistoryError;

  /**
   * An error type to indicate a state mismatch between front-end and back-end.
   */
  CATMAID.StateMatchingError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.StateMatchingError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.StateMatchingError.constructor = CATMAID.StateMatchingError;

  /**
   * An error type to indicate an unsuccesful location lookup.
   */
  CATMAID.LocationLookupError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.LocationLookupError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.LocationLookupError.constructor = CATMAID.LocationLookupError;

})(CATMAID);
