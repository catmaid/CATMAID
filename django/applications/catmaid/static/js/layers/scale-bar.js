(function(CATMAID) {

  "use strict";

  /**
   * A DOM view indicating physical scale of graphic content.
   *
   * @class ScaleBar
   * @constructor
   * @param {Element} domElement DIV element that will become the view.
   */
  function ScaleBar(
    domElement
  ) {
    this.width = 0;
    this.text = "";
    this.view = domElement;
    this.view.className = "scaleBenchmark";
    this.view.appendChild(document.createElement("p"));
    this.view.firstChild.appendChild(document.createElement("span"));
    this.view.firstChild.firstChild.appendChild(document.createTextNode(this.text));
  }

  ScaleBar.prototype = {};
  ScaleBar.prototype.constructor = ScaleBar;

  /**
   * Get the view element for this scale bar.
   * @return {Element}
   */
  ScaleBar.prototype.getView = function () {
    return this.view;
  };

  /**
   * Set the visibility of the scale bar.
   * @param {boolean} visible
   */
  ScaleBar.prototype.setVisibility = function (visible) {
    this.view.style.display = visible ? 'initial' : 'none';
  };

  /**
   * Update the scale bar view.
   *
   * @param  {number} meter    Scale of the bar, in pixels per nm.
   * @param  {number} minWidth Minimum display width of the bar, in pixels.
   */
  ScaleBar.prototype.update = function (meter, minWidth) {
    var width = 0;
    var text = "";
    for (var i = 0; i < ScaleBar.SIZES.length; ++i) {
      text = ScaleBar.SIZES[i];
      width = ScaleBar.SIZES[i] * meter;
      if (width > Math.min(192, minWidth))
        break;
    }
    var ui = 0;
    while (text >= 1000 && ui < ScaleBar.UNITS.length - 1) {
      text /= 1000;
      ++ui;
    }
    this.text = text + " " + ScaleBar.UNITS[ui];
    this.width = width;
    this.view.style.width = width + "px";
    this.view.firstChild.firstChild.replaceChild(
      document.createTextNode(this.text),
      this.view.firstChild.firstChild.firstChild);
  };

  /** Known scale bar sizes in nanometers. */
  ScaleBar.SIZES = [
        10,
        20,
        25,
        50,
        100,
        200,
        250,
        500,
        1000,
        2000,
        2500,
        5000,
        10000,
        20000,
        25000,
        50000,
        100000,
        200000,
        250000,
        500000,
        1000000,
        2000000,
        2500000,
        5000000,
        10000000,
        20000000,
        25000000,
        50000000,
        100000000,
        200000000,
        250000000,
        500000000,
        1000000000,
        2000000000,
        2500000000,
        5000000000,
        10000000000,
        20000000000,
        25000000000,
        50000000000,
        100000000000,
        200000000000,
        250000000000,
        500000000000];

  /** Known scale bar units (SI). */
  ScaleBar.UNITS = [
        "nm",
        unescape("%u03BCm"),
        "mm",
        "m"];

  CATMAID.ScaleBar = ScaleBar;

})(CATMAID);
