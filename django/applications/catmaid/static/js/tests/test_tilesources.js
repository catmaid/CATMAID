/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Tile sources test', function( assert ) {
    var baseURL = "https://example.com";
    var fileExt = "png";

    var ts1 = CATMAID.getTileSource(1, baseURL, fileExt);
    assert.ok(ts1 instanceof CATMAID.DefaultTileSource,
            "CATMAID.getTileSource maps type 1 correctly");

    var ts2 = CATMAID.getTileSource(2, baseURL, fileExt);
    assert.ok(ts2 instanceof CATMAID.RequestTileSource,
            "CATMAID.getTileSource maps type 2 correctly");

    var ts3 = CATMAID.getTileSource(3, baseURL, fileExt);
    assert.ok(ts3 instanceof CATMAID.HDF5TileSource,
            "CATMAID.getTileSource maps type 3 correctly");

    var ts4 = CATMAID.getTileSource(4, baseURL, fileExt);
    assert.ok(ts4 instanceof CATMAID.BackslashTileSource,
            "CATMAID.getTileSource maps type 4 correctly");

    var ts5 = CATMAID.getTileSource(5, baseURL, fileExt);
    assert.ok(ts5 instanceof CATMAID.LargeDataTileSource,
            "CATMAID.getTileSource maps type 5 correctly");

    var ts6 = CATMAID.getTileSource(6, baseURL, fileExt);
    assert.ok(ts6 instanceof CATMAID.DVIDTileSource,
            "CATMAID.getTileSource maps type 6 correctly");

    var ts7 = CATMAID.getTileSource(7, baseURL, fileExt);
    assert.ok(ts7 instanceof CATMAID.RenderServTileSource,
            "CATMAID.getTileSource maps type 7 correctly");

    var ts8 = CATMAID.getTileSource(8, baseURL, fileExt);
    assert.ok(ts8 instanceof CATMAID.DVIDMultiScaleTileSource,
            "CATMAID.getTileSource maps type 8 correctly");
});
