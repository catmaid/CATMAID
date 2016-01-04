/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Command history test', function(assert) {

  var makeCounterCommand = function() {
    var counter = 0;
    var command = new CATMAID.Command(function() { ++counter; return counter; },
                                      function() { --counter; return counter; });
    command.getCounter = function() { return counter; };
    return command;
  };

  var noop1 = new CATMAID.Command(CATMAID.noop, CATMAID.noop);
  var noop2 = new CATMAID.Command(CATMAID.noop, CATMAID.noop);

  // Create a history with a maximum of five entries
  var history = new CATMAID.CommandHistory(5);

  var count1 = makeCounterCommand();
  assert.strictEqual(count1.getCounter(), 0, "Test command is initialized correctly");
  var result1 = history.execute(count1);
  assert.strictEqual(count1.getCounter(), 1, "Commands are executed properly");
  assert.strictEqual(result1, 1, "History returns expected return value");

  // Expect command index point to last command
  assert.strictEqual(history.currentEntry(), 0, 'Advances command index on execute');

  // Add five noop2 commands and exceed the history limit
  for (var i=0; i<5; ++i) {
    history.execute(noop2)
  }

  assert.strictEqual(history.nEntries(), 5,
      'Removes old items if history limit is reached');
  // Expect only noop2 instances in the history (due to the oldest entry being
  // removed because only five elements are allowed).
  var allNoop2 = true;
  for (var i=0; i<5; ++i) {
    allNoop2 = allNoop2 && noop2 === history._commandList[i];
  }
  assert.ok(allNoop2, 'Removes the correct items if history limit is reached');

  // Push noop1 to test undo and redo
  var count2 = makeCounterCommand();
  var resultDo = history.execute(count2);

  // Undo one command and expect command index to change
  var resultUndo = history.undo();
  assert.strictEqual(history.currentEntry(), 3, 'Decrement command index on undo');
  assert.strictEqual(history._commandList[3], noop2, "Undo moves to the correct command");
  assert.strictEqual(history._commandList[4], count2, "Undo keeps old command on stack");
  assert.strictEqual(resultUndo, 0,
      'Undo function is executed and its value is returned from history');

  // Redo last command
  var resultRedo = history.redo();
  assert.strictEqual(history.currentEntry(), 4, 'Increment command index on redo');
  assert.strictEqual(history._commandList[4], count2, "Redo moves to the correct command");
  assert.strictEqual(resultRedo, 1,
      'Redo function is executed and its value is returned from history');

});
