(function(CATMAID) {

  "use strict";

  /**
   * Simple wrapper for displaying text labels with SVG in the tracing overlay.
   *
   * @param {number|string} id        Unique id for the node from the database.
   * @param {Object}        paper     The D3 selector this node is drawn to.
   * @param {number}        x         The x coordinate in project coordinates.
   * @param {number}        y         The y coordinate in project coordinates.
   * @param {number}        fontSize  Font size of label.
   * @param {string}        text      Label text.
   * @param {boolean}       visible   Whether this label should be visible.
   */
  var OverlayLabel = function (id, paper, x, y, fontSize, text, visible) {

    this.id = id;
    this.x = x;
    this.y = y;
    this.text = text;

    var pad = fontSize * 0.5,
        xg = this.x + pad*2,
        yg = this.y - pad*2,
        textBaseline = 0.2;

    // Create an SVG group for each label.
    var c = paper.append('g').classed('label', true);
    var t = c.append('text').attr({
            x: xg,
            y: yg,
            'font-size': fontSize + 'pt',
            fill: '#FFF'})
        .text(this.text);
    var bbox = t.node().getBBox();
    c.insert('path', ':first-child').attr({
            d:  'M' + (x + pad) + ',' + (y - pad) +
                ' ' + xg + ',' + (yg - pad) +
                'V' + (yg - bbox.height*(1 - textBaseline)) +
                'h' + bbox.width +
                'v' + bbox.height +
                'L' + (xg + pad) + ',' + (yg + bbox.height*textBaseline) +
                'z',
            'stroke-width': pad,
            'stroke-linejoin': 'round',
            stroke: '#000',
            fill: '#000',
            opacity: 0.75
        });

    this.visibility = function (visible) {
      if (typeof visible === 'undefined')
        return c.style('visibility') === 'visible';

      c.style('visibility', visible ? 'visible' : 'hidden');
    };

    this.visibility(visible);

    this.remove = function () {
      c.remove();
    };
  };

  CATMAID.OverlayLabel = OverlayLabel;

})(CATMAID);
