/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Submitter test', function( assert ) {

  // Test chaining promises and maintaining order
  (function() {
    var results = [];
    var done = assert.async();
    var submit = CATMAID.submitterFn();
    submit.then(createSleepPromise.bind(this, 1000, 1, results, false));
    submit.then(createSleepPromise.bind(this, 10, 2, results, false));
    submit.then(function() {
      assert.deepEqual(results, [1,2],
          "Submitter execute promises in expected order");
      done();
    });
  })();

  // Test rejection behavior by letting first promise fail and expect the second
  // one not to run.
  (function() {
    var results = [];
    var done = assert.async();
    var submit = CATMAID.submitterFn();
    submit.then(createSleepPromise.bind(this, 1000, 1, results, true));
    submit.then(createSleepPromise.bind(this, 10, 2, results, false));
    submit.then(function() {
      // This should not be executed and will raise an error.
      assert.ok(false,
          "Submitter doesn't execute functions if earlier promise fails");
      done();
    });
    // Add result check as error callback
    submit(null, null, null, null, false, false, function() {
      assert.deepEqual(results, [],
          "Submitter resets if earlier promise fails");
      done();
    });
  })();

  // Test result propagation
  (function() {
    var results = [];
    var done1 = assert.async();
    var done2 = assert.async();
    var done3 = assert.async();
    var done4 = assert.async();
    var submit = CATMAID.submitterFn();
    submit.then(function(value) {
      assert.strictEqual(value, undefined,
          "Submitter is initialized with no last result.");
      done1();
      return "test";
    });
    submit.then(function(value) {
      assert.strictEqual(value, "test",
          "Submitter propageds promise return values, if used as a promise.");
      done2();
    });
    submit.then(createSleepPromise.bind(this, 1000, 1, results, false));
    submit.then(function(value) {
      assert.strictEqual(value, 1,
          "Submitter propageds promise return values, if used as a promise.");
      done3();
    });
    submit.then(createSleepPromise.bind(this, 10, 2, results, false));
    submit.then(function(value) {
      assert.strictEqual(value, 2,
          "Submitter propageds promise return values, if used as a promise.");
      done4();
    });
  })();

  // Test creation of additional promises queued promises
  (function() {
    var done1 = assert.async();
    var done2 = assert.async();
    var done3 = assert.async();
    var submit = CATMAID.submitterFn();
    submit.then(function() {
      done1();
      return new Promise(function(resolve, reject) {
        done2();
        resolve();
        return 42;
      });
    });
    submit.then(function(result) {
      assert.ok(42, result, "Queuing promises inside an already queued promise works");
      done3();
    });
  })();

  /**
  * Creates a promise that will sleep for some time before it is resolved. The
  * promise will write their value to the resilts array passed as argument
  * when they are executed. The promise is rejected if fail is truthy.
  */
  function createSleepPromise(milliseconds, value, results, fail) {
    return new Promise(function(resolve, reject) {
      if (fail) {
        reject("I was asked to fail");
      } else {
        setTimeout(function() {
          results.push(value);
          resolve(value);
        }, milliseconds);
      }
    });
  }

});
