/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with skeletons, which model
   * neurons. All of them return promises.
   */
  var Skeletons = {

    /**
     * Split a skeleton at a specific treenodes.
     *
     * @param {State}   state      Neighborhood state for node
     * @param {integer} projectId  The project space to work in
     * @param {integer} treenodeId Treenode to split skeleton at
     * @param {object}  upstream_annot_map Map of annotation names vs annotator
     *                                     IDs for the upstream split part.
     * @param {object}  upstream_annot_map Map of annotation names vs annotator
     *                                     IDs for the downstream split part.
     *
     * @returns A new promise that is resolved once the skeleton is split.
     */
    split: function(state, projectId, treenodeId,
        upstream_annot_map, downstream_annot_map) {

      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to split skeletons');
      var url = projectId + '/skeleton/split';
      var params = {
        treenode_id: treenodeId,
        upstream_annotation_map: JSON.stringify(upstream_annot_map),
        downstream_annotation_map: JSON.stringify(downstream_annot_map),
        state: state.makeNeighborhoodState(treenodeId)
      };

      return CATMAID.fetch(url, 'POST', params).then((function(json) {
        this.trigger(CATMAID.Nodes.EVENT_SKELETON_SPLIT, json.skeleton_id,
            treenodeId);
        return json;
      }).bind(this));
    }

  };

  // Provide some basic events
  Skeletons.EVENT_SKELETON_DELETED = "skeleton_deleted";
  Skeletons.EVENT_SKELETON_CHANGED = "skeleton_changed";
  Skeletons.EVENT_SKELETON_SPLIT = "skeleton_split";
  Skeletons.EVENT_SKELETONS_JOINED = "skeletons_joined";
  CATMAID.asEventSource(Skeletons);

  // Export Skeleton namespace
  CATMAID.Skeletons = Skeletons;

})(CATMAID);

