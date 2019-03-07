/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * A general warning with description.
   */
  CATMAID.Warning = function(message) {
    this.name = 'CATMAID warning';
    this.message = message || '(no message)';
  };

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
  CATMAID.Error.prototype.constructor = CATMAID.Error;

  /**
   * A simple value error type to indicate some sort of input value problem.
   */
  CATMAID.ValueError = function(message, detail) {
    CATMAID.Error.call(this, message, detail, 'ValueError');
  };

  CATMAID.ValueError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.ValueError.prototype.constructor = CATMAID.ValueError;

  /**
   * A simple permission error type to indicate some lack of permissions.
   */
  CATMAID.PermissionError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.PermissionError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.PermissionError.prototype.constructor = CATMAID.PermissionError;

  /**
   * An error type to indicate out of range errors in a command history.
   */
  CATMAID.CommandHistoryError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.CommandHistoryError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.CommandHistoryError.prototype.constructor = CATMAID.CommandHistoryError;

  /**
   * An error type to indicate a state mismatch between front-end and back-end.
   */
  CATMAID.StateMatchingError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.StateMatchingError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.StateMatchingError.prototype.constructor = CATMAID.StateMatchingError;

  /**
   * An error type to indicate an unsuccesful location lookup.
   */
  CATMAID.LocationLookupError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.LocationLookupError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.LocationLookupError.prototype.constructor = CATMAID.LocationLookupError;

  CATMAID.TooManyWebGlContextsError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.TooManyWebGlContextsError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.TooManyWebGlContextsError.prototype.constructor = CATMAID.TooManyWebGlContextsError;

  /**
   * Represent the error condition of no WebGL support.
   */
  CATMAID.NoWebGLAvailableError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.NoWebGLAvailableError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.NoWebGLAvailableError.prototype.constructor = CATMAID.NoWebGLAvailableError;

  /**
   * An error type to indicate network access problems.
   */
  CATMAID.NetworkAccessError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.NetworkAccessError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.NetworkAccessError.prototype.constructor = CATMAID.NetworkAccessError;

  /*
   * An error type to indicate a pre-condition for some action is not met.
   */
  CATMAID.PreConditionError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  CATMAID.PreConditionError.prototype = Object.create(CATMAID.Error.prototype);
  CATMAID.PreConditionError.prototype.constructor = CATMAID.PreConditionError;

  /**
   * An error type to indicate an abstract method is not implemented.
   */
  CATMAID.NotImplementedError = class NotImplementedError extends CATMAID.Error {};

  /**
   * An error type to indicate an invalid user login.
   */
  CATMAID.InvalidLoginError = class InvalidLoginError extends CATMAID.Error {};

  /**
   * An error type to indicate an inactive user account. The optional meta field
   * contains information on the reason of the inactivation.
   */
  CATMAID.InactiveLoginError = class InactiveLoginError extends CATMAID.Error {
    constructor(message, detail, meta) {
      super(message, detail);
      this.meta = meta || {};
    }
  };

})(CATMAID);
