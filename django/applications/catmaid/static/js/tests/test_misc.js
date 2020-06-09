QUnit.test('Miscellaneous tests', function( assert ) {

  var originalRequestQueue = window.requestQueue;
  //var server = this.sandbox.useFakeServer();
  var server = sinon.fakeServer.create();
  var sandbox = sinon.sandbox.create();

  var permissionResponse = JSON.stringify([{fake_permission: [1]}]);
  server.respondWith("GET", "a/permissions",
    [200, {"Content-Type": "application/json"}, permissionResponse]);
  server.respondWith("GET", "c/permissions",
    [200, {"Content-Type": "application/json"}, permissionResponse]);

  // Test CATMAID front-end configuration
  (function() {
    CATMAID.configure("a", "b", "c");
    assert.strictEqual(CATMAID.backendURL, "a/",
        "CATMAID.configure sets the back-end URL if trailing slash is not provided.");
    assert.strictEqual(CATMAID.staticURL, "b/",
        "CATMAID.configure sets the static URL if trailing slash is not provided.");
    assert.strictEqual(CATMAID.staticExtensionURL, "c/",
        "CATMAID.configure sets the static extension URL if trailing slash is not provided.");

    assert.throws(CATMAID.configure.bind(CATMAID, "", "b", "c"),
        "CATMAID.configure throws error when backen URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", "", "c"),
        "CATMAID.configure throws error when static URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, null, "b", "c"),
        "CATMAID.configure throws error when backend URL is null.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", null, "c"),
        "CATMAID.configure throws error when static URL is null.");

    CATMAID.backendURL = "c";
    assert.strictEqual(CATMAID.backendURL, "a/",
        "CATMAID.backendURL cannot be overridden.");

    CATMAID.staticURL = "d";
    assert.strictEqual(CATMAID.staticURL, "b/",
        "CATMAID.staticURL cannot be overridden.");

    CATMAID.staticExtensionURL = "e";
    assert.strictEqual(CATMAID.staticExtensionURL, "c/",
        "CATMAID.staticExtensionURL cannot be overridden.");

    CATMAID.configure("c/", "d/", "e/");
    assert.strictEqual(CATMAID.backendURL, "c/",
        "CATMAID.configure sets the back-end URL if trailing slash is provided.");
    assert.strictEqual(CATMAID.staticURL, "d/",
        "CATMAID.configure sets the static URL if trailing slash is provided.");
    assert.strictEqual(CATMAID.staticExtensionURL, "e/",
        "CATMAID.configure sets the static extension URL if trailing slash is provided.");
  })();

  // Test CATMAID.makeURL
  (function() {
    CATMAID.configure("a", "b", "c");
    assert.throws(CATMAID.makeURL.bind(CATMAID, ""),
        "CATMAID.makeURL throws error when path is empty.");
    assert.throws(CATMAID.makeURL.bind(CATMAID, null),
        "CATMAID.makeURL throws error when path is null.");
    assert.throws(CATMAID.makeURL.bind(CATMAID, {}),
        "CATMAID.makeURL throws error when path is empty object.");

    assert.strictEqual(CATMAID.makeURL("c"), "a/c",
        "CATMAID.makeURL creates correct path if input has no leading slash");
    assert.strictEqual(CATMAID.makeURL("/c"), "a/c",
        "CATMAID.makeURL creates correct path if input has leading slash");
  })();

  // Test CATMAID.makeStaticURL
  (function() {
    CATMAID.configure("a", "b", "c");
    assert.throws(CATMAID.makeStaticURL.bind(CATMAID, ""),
        "CATMAID.makeStaticURL throws error when path is empty.");
    assert.throws(CATMAID.makeStaticURL.bind(CATMAID, null),
        "CATMAID.makeStaticURL throws error when path is null.");
    assert.throws(CATMAID.makeStaticURL.bind(CATMAID, {}),
        "CATMAID.makeStaticURL throws error when path is empty object.");

    assert.strictEqual(CATMAID.makeStaticURL("c"), "b/c",
        "CATMAID.makeStaticURL creates correct path if input has no leading slash");
    assert.strictEqual(CATMAID.makeStaticURL("/c"), "b/c",
        "CATMAID.makeStaticURL creates correct path if input has leading slash");
  })();

  setTimeout(server.respond.bind(server), 0);
  sandbox.restore();
  window.requestQueue = originalRequestQueue;

  // Test CATMAID.fetch()
  (function() {
    var done = assert.async();
    // Test wrong URL
    CATMAID.fetch('non-existing-endpoint', 'GET')
        .then(function(args) {
          assert.ok(false, "CATMAID.fetch() should not run success handler on error");
          done();
        })
        .catch(function(args) {
          assert.ok(true, "CATMAID.fetch() runs error handler on error");
          done();
        });
  })();
});
