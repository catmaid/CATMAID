/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * A simple value error type to indicate some sort of input value problem.
   */
  CATMAID.ValueError = function(message) {
    this.message = message;
  };

  CATMAID.ValueError.prototype = new Error();

})(CATMAID);
