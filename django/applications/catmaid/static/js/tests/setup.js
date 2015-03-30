/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * Configure Sinon to not use the fake timer and fake server by default.
 */
sinon.config = {
    injectIntoThis: true,
    injectInto: null,
    properties: ["spy", "stub", "mock", "clock", "sandbox"],
    useFakeTimers: false,
    useFakeServer: false
};

/**
 * Add methods to a CATMAID.tests namespace.
 */
(function(CATMAID) {

  CATMAID.tests = {

    /**
     * Return true if the current user agent indicates that PhatomJS is used.
     * False otherwise.
     */
    runByPhantomJS: function() {
      return (-1 !== navigator.userAgent.toUpperCase().indexOf('PHANTOMJS'));
    }

  };

})(CATMAID);
