(function(CATMAID) {

  "use strict";

  /**
   * A command wraps the execution of a function, it provides an interface for
   * executing it as well as undoing it. After a command has been instantiated,
   * it must be initialized
   */
  var Command = function(name, execute, undo) {
    this.initialized = false;
    this.executed = false;
    this.init(name, execute, undo);
  };

  /**
   * Initialize a this command.
   *
   * @param {function} execute Actual functionaliy of the command
   * @param {function} undo    The inverse operation to make the
   *                           original action undone.
   */
  Command.prototype.init = function(name, execute, undo) {
    this._name = name;
    this._fn = execute;
    this._undo = undo;
    this.executed = false;
    this.initialized = true;
  };

  /**
   * Mark a command as executed or unexecuted. Optionally with an action being
   * executed at the end. If a postWork action is set, it will be executed.
   *
   * @param {bool}     executed Wether the command has been executed
   */
  var done = function(executed) {
    this.executed = executed;
    CATMAID.tools.callIfFn(this.postAction);
  };

  /**
   * Execute the command and return a new promise, resolving in what the
   * executed handler returns.
   */
  Command.prototype.execute = function() {
    if (!this.initialized) {
      throw new CATMAID.Error('Commands need to be initialized before execution');
    }
    var result = this._fn(done.bind(this, true), this);
    return result;
  };

  /**
   * Undo the command and return a new promise, resolving in what the executed
   * handler returns.
   */
  Command.prototype.undo = function() {
    if (!this.executed) {
      throw new CATMAID.Error('Only executed commands can be undone');
    }
    var result = this._undo(done.bind(this, false), this);
    return result;
  };

  /**
   * Get a (potentially) specific name for this command.
   */
  Command.prototype.getName = function() {
    return this._name;
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

  // Add event support to project and define some event constants
  CATMAID.asEventSource(CommandHistory.prototype);
  CommandHistory.EVENT_COMMAND_EXECUTED = 'command_executed';
  CommandHistory.EVENT_COMMAND_UNDONE = 'command_undone';

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
   * A promise that resolves as soon as there is no command executing. Many
   * commands have asynchronous components that could take a few moments to
   * respond.
   */
  CommandHistory.prototype.submit = Promise.resolve();

  /**
   * Execute a command. Commands are expected to return a promise and the
   * history state.
   *
   * @param {Object} command Command instance to be executed
   * @returns Result of the command's execute function
   */
  CommandHistory.prototype.execute = function(command) {
    var executedCommand = this.submit.then((function() {
      var result = command.execute();
      this._advanceHistory(command);
      this.trigger(CommandHistory.EVENT_COMMAND_EXECUTED, command, false);
      return result;
    }).bind(this));

    // Allow errors to happen in command history and ignore them to make next
    // command executable after this one has either failed or succeeded.
    this.submit = executedCommand.catch(CATMAID.noop);

    return executedCommand;
  };

  /**
   * Undo the last command.
   *
   * @returns Result of the command's undo function
   */
  CommandHistory.prototype.undo = function() {
    var executedCommand = this.submit.then((function() {
      var command = this._commandList[this._currentCommand];
      if (!command) {
        throw new CATMAID.ValueError("Nothing to undo");
      }
      var result = command.undo();
      this._rollbackHistory();
      this.trigger(CommandHistory.EVENT_COMMAND_UNDONE, command);
      return result;
    }).bind(this));

    // Allow errors to happen in command history and ignore them to make next
    // command executable after this one has either failed or succeeded.
    this.submit = executedCommand.catch(CATMAID.noop);

    return executedCommand;
  };

  /**
   * Redo an the last undone command.
   *
   * @returns Result of the command's execute function
   */
  CommandHistory.prototype.redo = function() {
    var executedCommand = this.submit.then((function() {
      var command = this._commandList[this._currentCommand + 1];
      if (!command) {
        throw new CATMAID.ValueError("Nothing to redo");
      }
      var result = command.execute();
      this._currentCommand += 1;
      this.trigger(CommandHistory.EVENT_COMMAND_EXECUTED, command, true);
      return result;
    }).bind(this));

    // Allow errors to happen in command history and ignore them to make next
    // command executable after this one has either failed or succeeded.
    this.submit = executedCommand.catch(CATMAID.noop);

    return executedCommand;
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
   * Get a list of names, representing all commands in order.
   *
   * @returns {Object[]} Command representation
   */
  CommandHistory.prototype.getCommandNames = function() {
    return this._commandList.map(function(c) {
        return c.getName();
    });
  };

  /**
   * Get the index of the command executed last.
   *
   * @returns {integer} Index of command executed last
   */
  CommandHistory.prototype.currentEntry = function() {
    return this._currentCommand;
  };

  /**
   * A static command factory to simplify creation of new command types. It
   * basically implements prototype inheritance.
   */
  CATMAID.makeCommand = function(cmd) {
    cmd.prototype = Object.create(CATMAID.Command.prototype);
    cmd.constructor = cmd;
    return cmd;
  };

  // Export command and history
  CATMAID.Command = Command;
  CATMAID.CommandHistory = CommandHistory;

})(CATMAID);
