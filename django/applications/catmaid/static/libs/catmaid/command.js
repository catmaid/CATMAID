(function(CATMAID) {

  "use strict";

  // A global command counter which is used to provide an unique ID for
  // each command.
  var commandCounter = 0;

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
    this._id = commandCounter;
    this._name = name;
    this._fn = execute;
    this._undo = undo;
    this._store = new Map();
    this.executed = false;
    this.initialized = true;
    ++commandCounter;
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
   *
   * @param {CommandStore} mapper (Optional) CommandStore instance to allow
   *                              command the mapping of original IDs to changed
   *                              IDs. If not provided, a global default map is used.
   */
  Command.prototype.execute = function(mapper) {
    if (!this.initialized) {
      throw new CATMAID.Error('Commands need to be initialized before execution');
    }
    var result = this._fn(done.bind(this, true), mapper || globalMap, this);
    return result;
  };

  /**
   * Undo the command and return a new promise, resolving in what the executed
   * handler returns.
   *
   * @param {CommandStore} mapper (Optional) CommandStore instance to allow
   *                              command the mapping of original IDs to changed
   *                              IDs. If not provided, a global default map is used.
   */
  Command.prototype.undo = function(mapper) {
    if (!this.executed) {
      throw new CATMAID.Error('Only executed commands can be undone');
    }
    var result = this._undo(done.bind(this, false), mapper || globalMap, this);
    return result;
  };

  /**
   * Get a (potentially) specific name for this command.
   */
  Command.prototype.getName = function() {
    return this._name;
  };

  /**
   * Get a unique ID for this command instance, like a hash.
   */
  Command.prototype.getId = function() {
    return this._id;
  };

  /**
   * Store a value under a passed in alias for a particular command. Like
   */
  Command.prototype.store = function(alias, value) {
    this._store.set(alias, value);
  };

  /**
   * Get value for the passed in alias or undefined if the alias doesn't exist.
   */
  Command.prototype.get = function(alias) {
    return this._store.get(alias);
  };

  /**
   * If one of the arguments is undefined, an exception is thrown. Otherwise
   * nothing happens.
   */
  Command.prototype.validateForUndo = function() {
    for (var i=0; i<arguments.length; ++i) {
      if (undefined === arguments[i]) {
        var msg = 'Can\'t undo command, history data not available: ' + this._name;
        throw new CATMAID.ValueError(msg);
      }
    }
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
    // An object to map changed object IDs over undo/redo operations
    this._store = new CommandStore();
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
      var result = command.execute(this._store);
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
      var result = command.undo(this._store);
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
   * Redo the last undone command. This can have effects on commands redone
   * after the current command. If the command redone creates new database
   * objects (like neurons, annotations, nodes, etc.), their ID will be
   * different from the ones created in an earlier execution. To be able to
   * provide this information to commands executed after the current command,
   * commands are expected to store IDs and types of generated objects. This
   * mapping information is then provided to all commands.
   *
   * @returns Result of the command's execute function
   */
  CommandHistory.prototype.redo = function() {
    var executedCommand = this.submit.then((function() {
      var command = this._commandList[this._currentCommand + 1];
      if (!command) {
        throw new CATMAID.ValueError("Nothing to redo");
      }
      var result = command.execute(this._store);
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


  /**
   * This is used to map IDs of objects created by commands over undo/redo
   * calls. Ids are typed by a string (e.g. "connector") to avoid potential ID
   * collisions between different database tables.
   *
   * If commands create new database objects (like connectors, nodes, neurons,
   * etc.) and are undone and redone, the ID of such objects changes. To keep
   * track of these changes, commands store a mapping between these IDs. If
   * commands executed later references an ID that was changed during redo of
   * the earlier command, they can ask for a mapped ID.
   */
  var CommandStore = function() {
    // Keep track of initial values and the commands that created them
    this.initialValues = new Map();
    // To have a key/value store per type
    this.typeMaps = new Map();
    // To have a key/value store per command
    this.commandStore = new Map();
  };

  /**
   * Get a mapped ID for another ID. If no mapping exists, the query ID will be
   * returned.
   */
  CommandStore.prototype.get = function(type, id) {
    var oldId, idMap = this.typeMaps.get(type);
    if (idMap) {
      oldId =  idMap.get(id);
    }
    return oldId || id;
  };

  /**
   * Store a mapping between an old and a new value for a given type, created by
   * a particular command. The current mapping can be retrieved through the
   * map() method.
   *
   * @param {anything} value The value to store, can be anything.
   * @param {type}     type  The type of the value, one of avai
   */
  CommandStore.prototype.add = function(type, value, command) {
    var commandId = command.getId();
    var initialValue = this.initialValues.get(commandId);
    if (undefined === initialValue) {
      initialValue = value;
      // Remember all seen commands and the initial value
      this.initialValues.set(commandId, initialValue);
    }

    // Get type specific map
    var idMap = this.typeMaps.get(type);
    if (!idMap) {
      idMap = new Map();
      this.typeMaps.set(type, idMap);
    }

    // Store a mapping for redos and the initial value for the first execution
    idMap.set(initialValue, value);

    return this;
  };

  /**
   * Get mapping for a value of a particular type. If the value isn't found the
   * input value is returned.
   */
  CommandStore.prototype.get = function(type, value) {
    if (!this.typeMaps.has(type)) {
      return value;
    }
    var map = this.typeMaps.get(type);
    if (!map.has(value)) {
      return value;
    }
    return map.get(value);
  };

  // Add some constants to CommandStore's prototype
  var availableTypes = ['CONNECTOR', 'NODE', 'LINK', 'TAG', 'ANNOTATION'];
  availableTypes.forEach(function(c, n) {
    CommandStore.prototype[c] = n;
  });

  // This map is used if commands are used without history
  var globalMap = new CommandStore();


  // Export command, history and ID map
  CATMAID.Command = Command;
  CATMAID.CommandHistory = CommandHistory;
  CATMAID.CommandStore = CommandStore;

})(CATMAID);
