QUnit.test('Event system test', function( assert ) {
  var e = Events.Event;

  /**
   * Test if something is a function. From:
   * http://stackoverflow.com/questions/5999998
   */
  function isFunction(functionToCheck) {
     var getType = {};
     return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
  };

  // Make sure the event object has an on and a trigger function
  assert.ok(isFunction(e.on), 'has on function');
  assert.ok(isFunction(e.trigger), 'has trigger function');

  // Test if callback is executed when event is triggered
  var wasCalled = false;
  function callback() {
    wasCalled = true;
  };
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

  };
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

  // Test extension of object with event system
  var obj2 = {};
  Events.extend(obj2);
  assert.strictEqual(obj2.on, Events.Event.on);
  assert.strictEqual(obj2.trigger, Events.Event.trigger);

  // Test if extension of an object returns the object
  var obj3 = {};
  assert.strictEqual(Events.extend(obj3), obj3);
});

