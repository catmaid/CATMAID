(function(CATMAID) {

  "use strict";

  /**
   * A command wraps an action
   */
  var Command = function(execute, undo) {
    this.initialized = false;
    this.init(execute, undo);
  };

  /**
   * Initialize a this command.
   *
   * @param {function} execute Actual functionaliy of the command
   * @param {function} undo    The inverse operation to make the
   *                           original action undone.
   */
  Command.prototype.init = function(execute, undo) {
    this._fn = execute;
    this._undo = undo;
    this.initialized = true;
  };

  /**
   * Execute the command and return a new promise, resolving in what the
   * executed handler returns.
   */
  Command.prototype.execute = function() {
    return this._fn();
  };

  /**
   * Undo the command and return a new promise, resolving in what the executed
   * handler returns.
   */
  Command.prototype.undo = function() {
    return this._undo();
  };

  /**
   * A command history keeps track of the serial execution of commands. It can
   * undo already executed commands and redo commands that have been undone are
   * not yet overridden (by the application of a new command).
   *
   * @param {integer] The maximum number of history entries. Optional, defaults
   *                  to not limiting the number of entries.
   */
  var CommandHistory = function(maxEntries) {
    // Contains Command instances
    this._commandList = [];
    // Index of current command to. Instead of using push/pop, we keep commands,
    // unless they are overridden.
    this._currentCommand = -1;
    // If the number of max entries is not given, default to infinity
    this._maxEntries = undefined === maxEntries ? false : maxEntries;
  };

  /**
   * If a maximum number of history entries is set, this function will remove
   * old entries so that the number of commands stays within bounds.
   */
  CommandHistory.prototype.limitHistory = function(maxEntries) {
    if (maxEntries) {
      var nCommandsToRemove = this._commandList.length > maxEntries;
      if (nCommandsToRemove > 0) {
        this._commandList.splice(0, nCommandsToRemove);
        this._currentCommand = Math.max(-1, this._currentCommand - nCommandsToRemove);
      }
    }
  };

  /**
   * Advance the course of the history.
   *
   * @param {Object} command The command to push to the history stack
   */
  CommandHistory.prototype._advanceHistory = function(command) {
    this._currentCommand += 1;
    this._commandList[this._currentCommand] = command;
    // Remove diverging this of commands previously undone, following the
    // just executed command.
    if (this._commandList[this._currentCommand + 1]) {
      this._commandList.splice(this._currentCommand  + 1);
    }
    // Limit this size
    this.limitHistory(this._maxEntries);
  };

  /**
   * Rollback history by one commmand.
   *
   */
  CommandHistory.prototype._rollbackHistory = function() {
    this._currentCommand -= 1;
  };

  /**
   * Execute a command. Commands are expected to return a promise and the
   * history state.
   *
   * @param {command}  Command instance to be executed
   * @returns Result of the command's execute function
   */
  CommandHistory.prototype.execute = function(command) {
    var result = command.execute();
    this._advanceHistory(command);
    return result;
  };

  /**
   * Undo the last command.
   *
   * @returns Result of the command's undo function
   */
  CommandHistory.prototype.undo = function() {
    var command = this._commandList[this._currentCommand];
    if (!command) {
      throw new CATMAID.Error("Nothing to undo");
    }
    var result = command.undo();
    this._rollbackHistory();
    return result;
  };

  /**
   * Redo an the last undone command.
   *
   * @returns Result of the command's execute function
   */
  CommandHistory.prototype.redo = function() {
    var command = this._commandList[this._currentCommand + 1];
    if (!command) {
      throw new CATMAID.Error("Nothing to redo");
    }
    var result = command.execute();
    this._currentCommand += 1;

    return result;
  };

  /**
   * Get the number of recorded commands.
   *
   * @returns {integer} Number of commands in history
   */
  CommandHistory.prototype.nEntries = function() {
    return this._commandList.length;
  };

  /**
   * Get the index of the command executed last.
   *
   * @returns {integer} Index of command executed last
   */
  CommandHistory.prototype.currentEntry = function() {
    return this._currentCommand;
  };

  // Export command and history
  CATMAID.Command = Command;
  CATMAID.CommandHistory = CommandHistory;

})(CATMAID);
