/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var COLORS = [[1, 1, 0], // yellow
                [1, 0, 1], // magenta
                [0, 0, 1], // blue
                [0, 1, 0], // green
                [1, 1, 1], // white
                [0, 1, 1], // cyan
                [1, 0.5, 0], // orange
                [0.5, 1, 0], // light green
                [0.5, 0.5, 0.5], // grey
                [0, 1, 0.5], // pale green
                [1, 0, 0], // red
                [0.5, 0.5, 1], // light blue
                [0.75, 0.75, 0.75], // silver
                [1, 0.5, 0.5], // pinkish
                [0.5, 1, 0.5], // light cyan
                [1, 0, 0.5], // purplish
                [0.5, 0, 0], // maroon
                [0.5, 0, 0.5], // purple
                [0, 0, 0.5], // navy blue
                [1, 0.38, 0.28], // tomato
                [0.85, 0.64, 0.12], // gold
                [0.25, 0.88, 0.82], // turquoise
                [1, 0.75, 0.79]]; // pink


  /**
   * Return a color, first by using all colors of the color array above then by
   * creating variations of those colors.
   */
  var pickColor = function() {
    if (undefined === this.next_color_index) this.next_color_index = 0;

    var c = this.COLORS[this.next_color_index % this.COLORS.length];
    var color = new THREE.Color(c[0], c[1], c[2]);
    if (this.next_color_index < this.COLORS.length) {
      this.next_color_index += 1;
      return color;
    }
    // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
    var hsl = color.getHSL({});
    color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
                 Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
                 hsl.l);
    this.next_color_index += 1;
    return color;
  };

  /**
   * A mixin that adds ability to pick colors almost randomly, keeping state.
   */
  var Colorizer = function() {
    this.COLORS = COLORS;
    this.pickColor = pickColor;
    this.next_color_index = 0;
  };

  // Export colorizer mixin
  CATMAID.asColorizer = function(obj) {
    Colorizer.call(obj);
  };

  CATMAID.Colorizer = function() {
    CATMAID.asColorizer(this);
  };

})(CATMAID);
