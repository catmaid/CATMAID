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

    CATMAID.configure("c/", "d/");
    assert.strictEqual(CATMAID.backendURL, "c/",
        "CATMAID.configure sets the back-end URL if trailing slash is provided.");
    assert.strictEqual(CATMAID.staticURL, "d/",
        "CATMAID.configure sets the static URL if trailing slash is provided.");

    assert.throws(CATMAID.configure.bind(CATMAID, "", "b"),
        "CATMAID.configure throws error when backen URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", ""),
        "CATMAID.configure throws error when static URL is of length 0.");
    assert.throws(CATMAID.configure.bind(CATMAID, null, "b"),
        "CATMAID.configure throws error when backend URL is null.");
    assert.throws(CATMAID.configure.bind(CATMAID, "a", null),
        "CATMAID.configure throws error when static URL is null.");

    CATMAID.backendURL = "e";
    assert.strictEqual(CATMAID.backendURL, "c/",
        "CATMAID.backendURL cannot be overridden.");

    CATMAID.staticURL = "e";
    assert.strictEqual(CATMAID.staticURL, "d/",
        "CATMAID.staticURL cannot be overridden.");
  })();
});
