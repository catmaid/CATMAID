/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Miscellaneous tests', function( assert ) {

  // Test CATMAID front-end configuration
  (function() {
    CATMAID.configure("a", "b");
    assert.strictEqual(CATMAID.backendURL, "a/",
        "CATMAID.configure sets the back-end URL if trailing slash is not provided.");
    assert.strictEqual(CATMAID.staticURL, "b/",
        "CATMAID.configure sets the static URL if trailing slash is not provided.");

    assert.throws(CATMAID.configure.bind(CATMAID, "", "b"),
        "CATMAID.configure throws error when backen URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", ""),
        "CATMAID.configure throws error when static URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, null, "b"),
        "CATMAID.configure throws error when backend URL is null.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", null),
        "CATMAID.configure throws error when static URL is null.");

    CATMAID.backendURL = "c";
    assert.strictEqual(CATMAID.backendURL, "a/",
        "CATMAID.backendURL cannot be overridden.");

    CATMAID.staticURL = "d";
    assert.strictEqual(CATMAID.staticURL, "b/",
        "CATMAID.staticURL cannot be overridden.");

    /* As long as this PhantomJS bug is not fixed, this test will fail on our CI
     * setup: https://github.com/ariya/phantomjs/issues/11856.
     * */
    if (!CATMAID.tests.runByPhantomJS()) {
      CATMAID.configure("c/", "d/");
      assert.strictEqual(CATMAID.backendURL, "c/",
          "CATMAID.configure sets the back-end URL if trailing slash is provided.");
      assert.strictEqual(CATMAID.staticURL, "d/",
          "CATMAID.configure sets the static URL if trailing slash is provided.");
    }
  })();

  // Test CATMAID.makeURL
  (function() {
    CATMAID.configure("a", "b");
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
    CATMAID.configure("a", "b");
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
});
