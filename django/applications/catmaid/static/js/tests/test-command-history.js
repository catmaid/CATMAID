QUnit.test('Command history test', function(assert) {

  var makeCounterCommand = function() {
    var counter = 0;
    var IncrementCommand = CATMAID.makeCommand(function() {
      var exec = function(done, command, map) { ++counter; done(); return Promise.resolve(counter); };
      var undo = function(done, command, map) { --counter; done(); return Promise.resolve(counter); };

      this.init("Increment counter", exec, undo);
    });

    // Create new instance and add inspection function
    var command = new IncrementCommand();
    command.getCounter = function() { return counter; };
    return command;
  };

  var NoopCommand = CATMAID.makeCommand(function() {
    var noop = function(done, command) { done(); return Promise.resolve(); };
    this.init("No-op", noop, noop);
  });

  var noop1 = new NoopCommand();
  var noop2 = new NoopCommand();

  // Create a history with a maximum of five entries
  var history = new CATMAID.CommandHistory(5);

  var count1 = makeCounterCommand();
  var done1 = assert.async();
  assert.strictEqual(count1.getCounter(), 0, "Test command is initialized correctly");
  history.execute(count1).then(function(result1) {
    assert.strictEqual(count1.getCounter(), 1, "Commands are executed properly");
    assert.strictEqual(result1, 1, "History returns expected return value");

    // Expect command index point to last command
    assert.strictEqual(history.currentEntry(), 0, 'Advances command index on execute');

    done1();
  });

  // Add five noop2 commands and exceed the history limit
  var noop2Promises = [];
  for (var i=0; i<5; ++i) {
    noop2Promises.push(history.execute(noop2));
  }

  var done2 = assert.async();
  var done3 = assert.async();
  Promise.all(noop2Promises).then(function() {
    assert.strictEqual(history.nEntries(), 5,
        'Removes old items if history limit is reached');
    // Expect only noop2 instances in the history (due to the oldest entry being
    // removed because only five elements are allowed).
    var allNoop2 = true;
    for (var i=0; i<5; ++i) {
      allNoop2 = allNoop2 && noop2 === history._commandList[i];
    }
    assert.ok(allNoop2, 'Removes the correct items if history limit is reached');

    done2();
  }).then(function() {
    // Push noop1 to test undo and redo
    var count2 = makeCounterCommand();
    var resultDo = history.execute(count2).then(function() {
      // Undo one command and expect command index to change
      return  history.undo();
    }).then(function(resultUndo) {
      assert.strictEqual(history.currentEntry(), 3, 'Decrement command index on undo');
      assert.strictEqual(history._commandList[3], noop2, "Undo moves to the correct command");
      assert.strictEqual(history._commandList[4], count2, "Undo keeps old command on stack");
      assert.strictEqual(resultUndo, 0,
          'Undo function is executed and its value is returned from history');
      // Redo last command
      return history.redo();
    }).then(function(resultRedo) {
      assert.strictEqual(history.currentEntry(), 4, 'Increment command index on redo');
      assert.strictEqual(history._commandList[4], count2, "Redo moves to the correct command");
      assert.strictEqual(resultRedo, 1,
          'Redo function is executed and its value is returned from history');

      done3();
    });
  });

});
