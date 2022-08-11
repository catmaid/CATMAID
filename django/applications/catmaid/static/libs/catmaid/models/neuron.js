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
       * Rename all neurons modeled by a set of skeletons 1
       *
       * @param projectId The project to operate in.
       * @param neuronNameMap A list of two-element lists: neuron ID, new name
       */
      renameAll: function(projectId, neuronNameList) {
        if (neuronNameList.length === 0) {
          return Promise.reject(new CATMAID.ValueError("Need at least one neuron/name mapping"));
        }

        let result = CATMAID.fetch(`${projectId}/neurons/rename`, 'POST', {
          'names': neuronNameList,
        });

        result.then(r => {
          CATMAID.Neurons.trigger(CATMAID.Neurons.EVENT_NEURON_RENAMED,
              null, null);
        });

        return result;
      },

      /**
       * Get a mapping of skeleton IDs to neuron IDs.
       */
      idsFromSkeletons: function(projectId, skeletonIds) {
        return CATMAID.fetch(`${projectId}/neurons/from-models`, 'POST', {
          'model_ids': skeletonIds,
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
      },

      /**
       * Return all skeletons linked to this neuron.
       */
      getSkeletons: function(projectId, neuronId) {
        return CATMAID.fetch(`${projectId}/neuron/${neuronId}/get-all-skeletons`);
      },

      /**
       * Return all skeletons linked to all input neurons.
       */
      getAllSkeletons: function(projectId, neuronIds) {
        return CATMAID.fetch(`${projectId}/neurons/all-skeletons`, 'POST', {
          'neuron_ids': neuronIds,
        });
      },

      /**
       * Import from an SWC file and a name.
       *
       * @param {numer}  projectId The current project ID.
       * @param {File}   swcFile   The opened SWC File object.
       * @param {String} name      (Optional) Name of the new neuron. If not
       *                           provided, a default name is used.
       *
       * @returns {Promise} Resolves once imported.
       */
        importFromSWC: function(projectId, swcFile, name) {
          if (!swcFile) {
            return Promise.reject(new CATMAID.ValueError("Need SWC file"));
          }

          var data = new FormData();
          data.append('name', name);
          data.append('file', swcFile);

          return CATMAID.fetch(`${project.id}/skeletons/import`, "POST", data,
              undefined, undefined, undefined, undefined, {"Content-type" : null});
        },
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

