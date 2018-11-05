(function(CATMAID) {

  "use strict";

  // A global command counter which is used to provide an unique ID for
  // each command.
  var commandCounter = 0;

  // Commands try to add a header field to requests made during the command
  // execution, undo or redo operation.
  var contextHeader = "X-CATMAID-Execution-Context";

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
    // Keeps track of how often this command has been executed
    this.nExecuted = 0;
    ++commandCounter;
  };

  /**
   * Mark a command as executed or unexecuted. Optionally with an action being
   * executed at the end. If a postWork action is set, it will be executed.
   *
   * @param {bool}     executed Wether the command has been executed
   */
  var done = function(executed, undone) {
    this.executed = executed;
    if (executed) {
      ++this.nExecuted;
    }
    CATMAID.tools.callIfFn(this.postAction);
  };

  /**
   * This makes removing the header as promise continuations easier.
   */
  var removeContextHeader = function() {
    CATMAID.removeHeaderFromRequests(contextHeader);
  };

  /**
   * Execute the command and return a new promise, resolving in what the
   * executed handler returns.
   *
   * @param {CommandStore} mapper (Optional) CommandStore instance to allow
   *                              command the mapping of original IDs to changed
   *                              IDs. If not provided, a global default map is used.
   * @param {bool}         redo   (Optional) Indicates that this execution is a
   *                              actually a redo operation of a former execution.
   */
  Command.prototype.execute = function(mapper, redo) {
    if (!this.initialized) {
      throw new CATMAID.Error('Commands need to be initialized before execution');
    }
    // Mark request during execution as regular command execution
    CATMAID.addHeaderToRequests(contextHeader, redo ? "REDO" : "EXEC");
    var result = this._fn(done.bind(this, true), this, mapper || globalMap);
    result.then(removeContextHeader).catch(removeContextHeader);

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
    // Mark request during execution as regular command execution
    CATMAID.addHeaderToRequests(contextHeader, "UNDO");
    var result = this._undo(done.bind(this, false), this, mapper || globalMap);
    result.then(removeContextHeader).catch(removeContextHeader);

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
   * @param {number} maxEntries (optional) The maximum number of history entries.
   *                             Defaults to not limiting the number of entries.
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
      var nCommandsToRemove = this._commandList.length - maxEntries;
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
      var result = command.execute(this._store, false);

      // Branch off internal handler chain, handling errors is up to the
      // original caller, they are ignored internally.
      result.then((function() {
        this._advanceHistory(command);
        this.trigger(CommandHistory.EVENT_COMMAND_EXECUTED, command, false);
      }).bind(this)).catch(CATMAID.noop);

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
        throw new CATMAID.CommandHistoryError("Nothing to undo");
      }
      var result = command.undo(this._store);

      // Branch off internal handler chain, handling errors is up to the
      // original caller, they are ignored internally.
      result.then((function() {
        this._rollbackHistory();
        this.trigger(CommandHistory.EVENT_COMMAND_UNDONE, command);
      }).bind(this)).catch(CATMAID.noop);

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
        throw new CATMAID.CommandHistoryError("Nothing to redo");
      }
      var result = command.execute(this._store, true);
      result.then((function() {
        this._currentCommand += 1;
        this.trigger(CommandHistory.EVENT_COMMAND_EXECUTED, command, true);
      }).bind(this));
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
    cmd.prototype.constructor = cmd;
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
  };

  /**
   * Store a mapping between an old and a new value for a given type, created by
   * a particular command. The current mapping can be retrieved through the
   * map() method.
   *
   * @param {type}     type      The type of the value, one of avai
   * @param {anything} original  Original value that the new value is mapped to
   * @param {anything} value     The value to store, can be anything.
   * @param {String}   timestamp The timestampt to asspciate with value
   */
  CommandStore.prototype.add = function(type, original, value, timestamp) {
    if (!value) {
      throw CATMAID.ValueError("Can't add value to store: invalid value");
    }
    if (!timestamp) {
      throw CATMAID.ValueError("Can't add value to store: invalid timestamp");
    }

    // Get type specific map
    var idMap = this.typeMaps.get(type);
    if (!idMap) {
      idMap = {};
      this.typeMaps.set(type, idMap);
    }

    if (!original) {
      original = value;
    }

    // Store a mapping for redos, with reference to the initial value, which was
    // originally added by the passed in command (hence redo). If this is the
    // first execution the initial value is the passed in value.
    var currentMapping = idMap[original];
    if (!currentMapping) {
      // Properties get assigned below
      currentMapping = {};
      idMap[original] = currentMapping;
    }

    currentMapping.value = value;
    currentMapping.timestamp = timestamp;

    return this;
  };

  /**
   * Get mapping for a value of a particular type. If the value isn't found or a
   * the command has never been executed yet, the input value is returned.
   * Commands are expected to use the state provided to them for their first
   * run.
   */
  CommandStore.prototype.get = function(type, value, command) {
    if (0 === command.nExecuted || !this.typeMaps.has(type)) {
      return value;
    }
    var map = this.typeMaps.get(type);
    var mappedValue = map[value];
    return value in map ? map[value].value : value;
  };

  /**
   * Get a value linked to a command store entry. This could for instance be an
   * edition time stamp, which is versioned along with the link target value.
   */
  CommandStore.prototype.getWithTime = function(type, value, timestamp, command) {
    var result = {value: value, timestamp: timestamp};
    if (0 !== command.nExecuted && this.typeMaps.has(type)) {
      var map = this.typeMaps.get(type);
      if (value in map) {
        var entry = map[value];
        result.value = entry.value;
        result.timestamp = entry.timestamp;
      }
    }
    return result;
  };

  /**
   * Map a single node ID, a shortcut for get().
   */
  CommandStore.prototype.getNodeId = function(nodeId, command) {
    return this.get(this.NODE, nodeId, command);
  };

  /**
   * Map a single node ID, a shortcut for getWithData().
   */
  CommandStore.prototype.getNodeWithTime = function(nodeId, timestamp, command) {
    return this.getWithTime(this.NODE, nodeId, timestamp, command);
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
