/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  'use strict';

  function makeConstant(namespace, name, value) {
    Object.defineProperty(namespace, name, {
      configurable: false,
      enumerable: false,
      value: undefined === value ? name : value,
      writable: false
    });
  }

  // Some logic operators
  makeConstant(CATMAID, "AND");
  makeConstant(CATMAID, "OR");
  makeConstant(CATMAID, "XOR");
  makeConstant(CATMAID, "NOT");
  makeConstant(CATMAID, "UNION");
  makeConstant(CATMAID, "INTERSECTION");
  makeConstant(CATMAID, "DIFFERENCE");

})(CATMAID);

