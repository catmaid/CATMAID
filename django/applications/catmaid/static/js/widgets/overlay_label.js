/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/*
 * Simple wrapper for labels
 */
OverlayLabel = function (
id, // unique id for the node from the database
paper, // the D3 selector this node is drawn to
x, // the x coordinate in project coordinates
y, // y coordinates
text) {
  // the database treenode id
  this.id = id;
  this.x = x;
  this.y = y;
  this.text = text;

  // Scale labels relative to confidence text labels to account for overlay scaling.
  var fontSize = parseFloat(SkeletonElements.prototype.ArrowLine.prototype.confidenceFontSize) * 0.75;
  var pad = fontSize * 0.5,
      xg = this.x + pad*2,
      yg = this.y - pad*2,
      textBaseline = 0.2;

  // Create an SVG group for each label.
  var c = paper.append('g');
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

  this.remove = function () {
    c.remove();
  };
};
