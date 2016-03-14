/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with neurons. All
   * of them return promises.
   */
  var Neurons = {

      /**
       * Rename a neuron.
       *
       * @returns a promise that is resolved once the neuron is renamed
       */
      rename: function(projectId, neuronId, newName) {
        var url = project.id + '/neurons/' + neuronId + '/rename';
        var params = {
          name: newName
        };

        return CATMAID.fetch(url, 'POST', params)
          .then(function(result) {
            if (result.renamed_neuron) {
              CATMAID.Neurons.trigger(CATMAID.Neurons.EVENT_NEURON_RENAMED,
                  result.renamed_neuron, newName);
            }
            return {
              'oldName': result.old_name,
              'renamedNeuron': result.renamed_neuron
            };
          });
      },

      /**
       * Delete a neuron and the skeleton is is modeled by.
       *
       * @param {number} projectId The ID of the project the neuron is part of
       * @param {number} neuronId  The ID of the neuron to delete
       *
       * @returns promise deleting the skeleton and neuron
       */
      delete: function(projectId, neuronId) {
        var url = projectId + '/neuron/' + neuronId + '/delete';
        return CATMAID.fetch(url, 'GET')
          .then(function(result) {
            // Emit deletion event for every deleted skeleton
            result.skeleton_ids.forEach(function(skid) {
              this.trigger(this.EVENT_SKELETON_DELETED, skid);
            }, CATMAID.Skeletons);
            CATMAID.Neurons.trigger(CATMAID.Neurons.EVENT_NEURON_DELETED, neuronId);
            return result;
          });
      }
  };

  // Provide some basic events
  Neurons.EVENT_NEURON_RENAMED = "neuron_renamed";
  Neurons.EVENT_NEURON_DELETED = "neuron_deleted";
  CATMAID.asEventSource(Neurons);

  // Export Neuron namespace
  CATMAID.Neurons = Neurons;

  /**
   * Rename a neuron through a command.
   */
  CATMAID.RenameNeuronCommand = CATMAID.makeCommand(function(projectId, neuronId, newName) {
    var exec = function(done, command) {
      var rename = CATMAID.Neurons.rename(projectId, neuronId, newName);

      return rename.then(function(result) {
        command._oldName = result.oldName;
        command._renamedNeuron = result.renamedNeuron;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._oldName || undefined === command._renamedNeuron) {
        throw new CATMAID.ValueError('Can\'t undo renaming of neuron, history data not available');
      }

      return CATMAID.Neurons.rename(projectId, command._renamedNeuron, command._oldName)
        .then(done);
    };

    var title = "Rename neuron #" + neuronId + " to \"" + newName + "\"";
    this.init(title, exec, undo);
  });

})(CATMAID);

