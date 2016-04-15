Commands and command history
============================

Commands are used to represent actions in CATMAID that are undoable. A command's
interface consistes of only two methods: execute() and undo(). Of course, these
functions can be executed right away on a command object, but if executed
through a command history, commands are kept track of. A history also has
execute() and undo() methods, however, the execute method of a history expects a
command as argument.

function

new CATMAID.Command(function(done, command) [{
    done();
}, function(done, command) {
    done();
});
