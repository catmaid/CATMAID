/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Tile sources test', function( assert ) {
    var baseURL = "https://example.com/";
    var fileExt = "png";
    var bn = "test/";
    var tw = 512;
    var th = 514;
    var c = 4;
    var r = 5;
    var z = 0;
    var p = 1;
    var s = {
      id: 1,
      orientation: CATMAID.Stack.ORIENTATION_XY
    };
    var spp = [3]; // Z coordinate of the slice
    var tsID = 1;

    var ts1 = CATMAID.TileSources.get(tsID, 1, baseURL, fileExt, tw, th);
    assert.ok(ts1 instanceof CATMAID.DefaultTileSource,
            "CATMAID.TileSources.get maps type 1 correctly");
    assert.equal(ts1.getTileURL(p, s, spp, c, r, z),
        "https://example.com/3/5_4_0.png",
        "Tile source 1 produces correct URL");

    var ts2 = CATMAID.TileSources.get(tsID, 2, baseURL, fileExt, tw, th);
    assert.ok(ts2 instanceof CATMAID.RequestTileSource,
            "CATMAID.TileSources.get maps type 2 correctly");
    assert.equal(ts2.getTileURL(p, s, spp, c, r, z),
        "https://example.com/?x=2048&y=2570&width=512&height=514&row=y&col=x&scale=1&z=3",
        "Tile source 2 produces correct URL");

    var ts3 = CATMAID.TileSources.get(tsID, 3, baseURL, fileExt, tw, th);
    assert.ok(ts3 instanceof CATMAID.HDF5TileSource,
            "CATMAID.TileSources.get maps type 3 correctly");

    var ts4 = CATMAID.TileSources.get(tsID, 4, baseURL, fileExt, tw, th);
    assert.ok(ts4 instanceof CATMAID.BackslashTileSource,
            "CATMAID.TileSources.get maps type 4 correctly");
    assert.equal(ts4.getTileURL(p, s, spp, c, r, z),
        "https://example.com/3/0/5_4.png",
        "Tile source 4 produces correct URL");

    var ts5 = CATMAID.TileSources.get(tsID, 5, baseURL, fileExt, tw, th);
    assert.ok(ts5 instanceof CATMAID.LargeDataTileSource,
            "CATMAID.TileSources.get maps type 5 correctly");
    assert.equal(ts5.getTileURL(p, s, spp, c, r, z),
        "https://example.com/0/3/5/4.png",
        "Tile source 5 produces correct URL");

    var ts6 = CATMAID.TileSources.get(tsID, 6, baseURL, fileExt, tw, th);
    assert.ok(ts6 instanceof CATMAID.DVIDImageblkTileSource,
            "CATMAID.TileSources.get maps type 6 correctly");
    assert.equal(ts6.getTileURL(p, s, spp, c, r, z),
        "https://example.com/512_514/2048_2570_3/png",
        "Tile source 6 produces correct URL");

    var ts7 = CATMAID.TileSources.get(tsID, 7, baseURL, fileExt, tw, th);
    assert.ok(ts7 instanceof CATMAID.RenderServTileSource,
            "CATMAID.TileSources.get maps type 7 correctly");
    assert.equal(ts7.getTileURL(p, s, spp, c, r, z),
        "https://example.com/largeDataTileSource/512/514/0/3/5/4.png",
        "Tile source 7 produces correct URL");

    var ts8 = CATMAID.TileSources.get(tsID, 8, baseURL, fileExt, tw, th);
    assert.ok(ts8 instanceof CATMAID.DVIDImagetileTileSource,
            "CATMAID.TileSources.get maps type 8 correctly");
    assert.equal(ts8.getTileURL(p, s, spp, c, r, z),
        "https://example.com/xy/0/4_5_3",
        "Tile source 8 produces correct URL for XY stack");
    var stackXZ = CATMAID.tools.deepCopy(s);
    stackXZ.orientation = CATMAID.Stack.ORIENTATION_XZ;
    assert.equal(ts8.getTileURL(p, stackXZ, spp, c, r, z),
        "https://example.com/xz/0/4_3_5",
        "Tile source 8 produces correct URL for XZ stack");
    var stackZY = CATMAID.tools.deepCopy(s);
    stackZY.orientation = CATMAID.Stack.ORIENTATION_ZY;
    assert.equal(ts8.getTileURL(p, stackZY, spp, c, r, z),
        "https://example.com/yz/0/3_5_4",
        "Tile source 8 produces correct URL for ZY stack");
});
