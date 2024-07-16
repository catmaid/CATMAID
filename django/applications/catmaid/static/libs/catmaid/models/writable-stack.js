(function(CATMAID) {

  'use strict';

  let WritableStack = function(config = null) {

  };

  WritableStack.list = function (projectId) {
    return CATMAID.fetch(`${projectId}/writable-stacks/`);
  };

  /**
   * Create a new writable stack for a particular stack in the specified
   * project.
   */
  WritableStack.create = function(projectId, stackId, name, filetype, metadata) {
    return CATMAID.fetch(`${projectId}/writable-stacks/`, 'POST', {
      stack_id: stackId,
      name: name,
      filetype: filetype,
      metadata: metadata,
    });
  };


  CATMAID.WritableStack = WritableStack;

})(CATMAID);
