/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The neuron controler provides access to several back-end API functions
   * concerning neurons (e.g. deleting neurons and treenodes). It provides
   * multiple events that one can register to.
   */
  var NeuronController = function() {
    this.EVENT_SKELETONS_JOINED = "neuron_manager_skeletons_joined";
  };

  NeuronController.prototype = {};
  CATMAID.asEventSource(NeuronController.prototype);

  // Create a singleton instance
  CATMAID.neuronController = new NeuronController();

})(CATMAID);
