QUnit.test('Event system test', function( assert ) {
  var e = Events.Event;

  /**
   * Test if something is a function. From:
   * http://stackoverflow.com/questions/5999998
   */
  function isFunction(functionToCheck) {
     var getType = {};
     return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
  }

  // Make sure the event object has an on and a trigger function
  assert.ok(isFunction(e.on), 'has on function');
  assert.ok(isFunction(e.trigger), 'has trigger function');

  // Test if callback is executed when event is triggered
  var wasCalled = false;
  function callback() {
    wasCalled = true;
  }
  e.on('foo', callback);
  e.trigger('foo');
  assert.ok(wasCalled, 'executes callback when even is triggered');

  // Test if callback is called with correct number of arguments
  var receivedArguments;
  function callback2() {
    receivedArguments = [];
    for (var i=0, l=arguments.length; i<l; i++) {
      receivedArguments.push(arguments[i]);
    }

  }
  e.on('foo2', callback2);
  e.trigger('foo2', 1, 2);
  assert.deepEqual(receivedArguments, [1, 2], 'executes callback with ' +
        'correct number of arguments when event is triggered');

  // Test if callback is executed in context of another object
  var obj = {};
  e.on('foo3', function() {
    assert.strictEqual(this, obj);
  }, obj);
  e.trigger('foo3');

  // Test fallback to event object as context, if no context is provided
  e.on('foo4', function() {
    assert.strictEqual(this, e);
  });
  e.trigger('foo4');

  // Test removal of all listeners of an event
  var wasExecuted = false;
  e.on('foo5', function() {
    wasExecuted = true;
  });
  assert.strictEqual(e.clear('foo5'), true, 'removal of listeners for an ' +
      'existing event was successful');
  e.trigger('foo5');
  assert.strictEqual(wasExecuted, false, 'removed all listeners after ' +
        'call to off function for an event');

  // Test removal of single listeners of an event
  var wasExecuted2 = false;
  var wasExecuted3 = false;
  function callback3() {
    wasExecuted2 = true;
  }
  e.on('foo6', callback3);
  e.on('foo6', function() {
    wasExecuted3 = true;
  });
  e.on('foo6', callback3);
  e.off('foo6', callback3);
  e.trigger('foo6');
  assert.strictEqual(wasExecuted2, false, 'removed single listener');
  assert.strictEqual(wasExecuted3, true, 'left correct listeners in place');

  // Test extension of object with event system
  var obj2 = {};
  Events.extend(obj2);
  assert.strictEqual(obj2.on, Events.Event.on);
  assert.strictEqual(obj2.trigger, Events.Event.trigger);

  // Test if extension of an object returns the object
  var obj3 = {};
  assert.strictEqual(Events.extend(obj3), obj3);
});

