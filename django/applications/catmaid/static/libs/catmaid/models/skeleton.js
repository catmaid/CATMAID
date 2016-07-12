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
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_SPLIT,
            json.new_skeleton_id,
            json.existing_skeleton_id,
            treenodeId);
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
            json.existing_skeleton_id);
        return json;
      }).bind(this));
    },

    /**
     * Join two skeletons by adding an edge between the two passed in nodes.
     *
     * @param {State}   state         Multi node state with both treenodes
     * @param {integer} projectId     The project space to work in
     * @param {integer} fromId        The skeleton that will be merged
     * @param {integer} toId          The skeleton that will get more nodes
     * @param {object}  annotationSet (Optional) Map of annotation name vs
     *                                annotator ID.
     *
     * @returns A new promise that is resolved once both skeletons are joined.
     */
    join: function(state, projectId, fromId, toId, annotationSet) {

      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to join skeletons');
      var url = projectId + '/skeleton/join';
      var params = {
        from_id: fromId,
        to_id: toId,
        state: state.makeMultiNodeState([fromId, toId])
      };

      if (annotationSet) {
        params.annotation_set = JSON.stringify(annotationSet);
      }

      return CATMAID.fetch(url, 'POST', params).then((function(json) {
        // Trigger join, delete and change events
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETONS_JOINED, json.deleted_skeleton_id,
                json.result_skeleton_id);
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETON_DELETED, json.deleted_skeleton_id);
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETON_CHANGED, json.result_skeleton_id);
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

  /**
   * A command that wraps splitting skeletons. For now, it will block undo.
   *
   * @param {State}   state      Neighborhood state for node
   * @param {integer} projectId  The project space to work in
   * @param {integer} treenodeId Treenode to split skeleton at
   * @param {object}  upstream_annot_map Map of annotation names vs annotator
   *                                     IDs for the upstream split part.
   * @param {object}  upstream_annot_map Map of annotation names vs annotator
   *                                     IDs for the downstream split part.
   */
  CATMAID.SplitSkeletonCommand = CATMAID.makeCommand(
      function(state, projectId, treenodeId, upstream_annot_map, downstream_annot_map) {

    var exec = function(done, command, map) {
      var split = CATMAID.Skeletons.split(state,
          project.id, treenodeId, upstream_annot_map, downstream_annot_map);
      return split.then(function(result) {
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      throw new CATMAID.ValueError("Undo of skeleton splits is not allowed at the moment");
    };

    var title = "Split skeleton at treenode " + treenodeId;

    this.init(title, exec, undo);
  });

  /**
   * Join two skeletons by connecting two treenodes.
     *
     * @param {State}   state         Multi node state with both treenodes
     * @param {integer} projectId     The project space to work in
     * @param {integer} fromId        The skeleton that will be merged
     * @param {integer} toId          The skeleton that will get more nodes
     * @param {object}  annotationSet (Optional) Map of annotation name vs
     *                                annotator ID.
   */
  CATMAID.JoinSkeletonsCommand = CATMAID.makeCommand(
      function(state, projectId, fromId, toId, annotationSet) {

    var exec = function(done, command, map) {
      var join = CATMAID.Skeletons.join(state, project.id, fromId, toId, annotationSet);
      return join.then(function(result) {
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      throw new CATMAID.ValueError("Undo of skeleton joins is not allowed at the moment");
    };

    var title = "Join skeleton throuh treenode " + toId + " into " + fromId + ".";

    this.init(title, exec, undo);
  });

})(CATMAID);

