/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * A general error containing a message of what went wrong.
   */
  CATMAID.Error = function(message, detail) {
    this.name = 'CATMAID error';
    this.message = message || '(no message)';
    this.detail= detail || null;
    this.stack = (new Error()).stack;
  };

  CATMAID.Error.prototype = Object.create(Error.prototype);
  CATMAID.Error.constructor = CATMAID.Error;

  /**
   * A simple value error type to indicate some sort of input value problem.
   */
  CATMAID.ValueError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
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

})(CATMAID);
