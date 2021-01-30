(function(CATMAID) {

  'use strict';

  let DeepLink = function(config = null) {

  };

  /**
   * Generate a short (six characters) ID for a new deep link. This method is
   * based on the code suggested here: https://stackoverflow.com/a/6248722/1665417.
   * It was expanded to seven digits. This should have a chance of 0.06% of
   * collission in 10000 IDs. This should be plenty here.
   */
  DeepLink.makeUniqueId = function() {
    var firstPart = (Math.random() * 46656) | 0;
    var secondPart = (Math.random() * 1679616) | 0;
    firstPart = ("000" + firstPart.toString(36)).slice(-3);
    secondPart = ("0000" + secondPart.toString(36)).slice(-4);
    return firstPart + secondPart;
  };

  CATMAID.DeepLink = DeepLink;

})(CATMAID);
