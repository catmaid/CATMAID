/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with labels on nodes. All of them
   * return promises.
   */
  var Labels = {

    /**
     * Get labels for a specific node.
     *
     * @param {integer} projectId        The project the node is part of
     * @param {integer} nodeId           Id of node
     * @param {string}  nodeType         Either 'treenode' or 'connector'
     *
     * @returns {Object} Promise that is resolved with an object mapping label
     *                   IDs to label names.
     */
    forNode: function(projectId, nodeId, nodeType) {
      var url = projectId + '/labels/' + nodeType  + '/' + nodeId + '/';
      return CATMAID.fetch(url, 'GET');
    },

    /**
     * Get all labels in a project.
     *
     * @param {integer} projectId        The project the node is part of
     *
     * @returns {Object} Promise that is resolved with a list of available label
     *                   names.
     */
    listAll: function(projectId) {
      var url = projectId + '/labels/';
      return CATMAID.fetch(url, 'GET');
    },

    /**
     * Get all labels in a project.
     *
     * @param {integer} projectId        The project the node is part of
     *
     * @returns {Object} Promise that is resolved with a list of label objects,
     *                   each with an id and name field.
     */
    listAllDetail: function(projectId) {
      return CATMAID.fetch(projectId + '/labels/detail', 'GET');
    },

    /**
     * Update the label set of a specific node.
     *
     * @param {integer} projectId        The project the node is part of
     * @param {integer} nodeId           Id of node
     * @param {string}  nodeType         Either 'treenode' or 'connector'
     * @param {array}   newLabels        An array of strings representing labels
     *                                   that the node should have.
     * @param {bool}    deleteExisting   If true, all existing labels will be
     *                                   removed before new labels are added.
     *
     * @returns {Object} Promise that is resolved with update information once
     *                   the update request returned successfully.
     */
    update: function(projectId, nodeId, nodeType, newLabels, deleteExisting) {
      var url = projectId + '/label/' + nodeType + '/' + nodeId + '/update';
      var params = {
        tags: newLabels.join(','),
        delete_existing: !!deleteExisting
      };

      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        CATMAID.Labels.trigger(CATMAID.Labels.EVENT_NODE_LABELS_CHANGED, nodeId);
        if (json.warning) {
          CATMAID.warn(json.warning);
        }
        return {
          'newLabels': json.new_labels,
          'duplicateLabels': json.duplicate_labels,
          'deletedLabels': json.deleted_labels,
        };
      });
    },

    /**
     * Remove a label from a specific node.
     *
     * @param {integer} projectId The project the node is part of
     * @param {integer} nodeId    Id of node
     * @param {string}  nodeType  Either 'treenode' or 'connector'
     * @param {string}  label     The label to remove
     *
     * @returns {Object} Promise that is resolved with update information once
     *                   the update request returned successfully.
     */
    remove: function(projectId, nodeId, nodeType, label) {
      var url = projectId + '/label/' + nodeType + '/' + nodeId + '/remove';
      return CATMAID.fetch(url, 'POST', {tag: label}).then(function(json) {
        CATMAID.Labels.trigger(CATMAID.Labels.EVENT_NODE_LABELS_CHANGED, nodeId);
        return {
          'deletedLabels': [label],
        };
      });
    },
  };

  Labels.EVENT_NODE_LABELS_CHANGED = "node_labels_changed";
  CATMAID.asEventSource(Labels);

  // Export labels namespace into CATMAID namespace
  CATMAID.Labels = Labels;

  /**
   * Add a tag to the active treenode. If undo is called the tag set is
   * restored that existed for this node just before the new tag was added.
   * This information will only be acquired if the command is executed.
   */
  CATMAID.AddTagsToNodeCommand = CATMAID.makeCommand(function(projectId, nodeId, nodeType,
        tags, deleteExisting) {

    var exec = function(done, command) {
      var addLabel = CATMAID.Labels.update(projectId, nodeId, nodeType,
          tags, deleteExisting);
      // After the label has been added, store undo parameters in command and
      // mark command execution as done.
      return addLabel.then(function(result) {
        command._addedTags = result.newLabels;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._addedTags) {
        throw new CATMAID.ValueError('Can\'t undo creation of tag, original data not available');
      }

      // If the list of added tags is empty, undo will do nothing. This can
      // happen due to multiple reasons, e.g. lack of permissions or the tag
      // existed before. Othewise, remove all added tags.
      var removeLabel = 0 === command._addedTags.length ? Promise.resolve() :
        Promise.all(command._addedTags.map(function(t) {
          return CATMAID.Labels.remove(projectId, nodeId, nodeType, t);
        }));

      return removeLabel.then(done);
    };

    var title;
    if (deleteExisting) {
      title = (0 === tags.length) ? ("Remove all tags from node " + nodeId) :
          ("Replace existing tags of node " + nodeId + " with tags " + tags.join(", "));
    } else {
      title = "Add tag(s) " + tags.join(", ") + " to node " + nodeId;
    }
    this.init(title, exec, undo);
  });

  /**
   * This command will remove a tag from a particular neuron. If the tag was
   * actually removed, its undo() method will re-add the tag.
   */
  CATMAID.RemoveTagFromNodeCommand = CATMAID.makeCommand(function(projectId, nodeId,
        nodeType, tag) {

    var exec = function(done, command) {
      var removeLabel = CATMAID.Labels.remove(projectId, nodeId, nodeType, tag);
      // After the label has been removed, store undo parameters in command and
      // mark command execution as done.
      return removeLabel.then(function(result) {
        command._deletedLabels = result.deletedLabels;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._deletedLabels) {
        throw new CATMAID.ValueError('Can\'t undo deletion of tag, history data not available');
      }

      // If the list of added tags is empty, undo will do nothing. This can
      // happen due to multiple reasons, e.g. lack of permissions or the tag
      // existed before. Otherwise, remove all added tags.
      var addLabel = (command._deletedLabels.length === 0) ? Promise.resolve() :
          CATMAID.Labels.update(projectId, nodeId, nodeType, command._deletedLabels);

      return addLabel.then(done);
    };

    var title = "Remove tag " + tag + " from node " + nodeId;
    this.init(title, exec, undo);
  });

})(CATMAID);
