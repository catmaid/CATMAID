/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Some back-end functions require a user to send a state along (e.g. node
   * removal or creation). In a collaborative environment, clients can never be
   * sure if the information they see is the most recent one. The back-end
   * required to make changes off of the most recent version. To represent the
   * (local) state the client sees the world in, the state generating functions
   * are used. There is a NodeState and a ParentState where the last one is a
   * subset of the first one, representing only the parent information of a node
   * (used e.g. for node creation). Then there is also NoCheckState, which
   * causes the back-end to disable state checking for a request.
   */

  /**
   * A general state representation for existing nodes.
   *
   * {
   *   parent: (<id>, <edition_time>),
   *   children: ((<child_id>, <child_edition_time>), ...),
   *   links: ((<connector_id>, <connector_edition_time>, <relation_id>), ...)
   * }
   */
  CATMAID.getNodeState = function(nodeId, editionTime, parentId, parentEditTime,
      children, links) {
    var state = {
      "edition_time": editionTime,
      "parent": [parentId, parentEditTime],
      "children": children,
      "links": links,
    };
    return JSON.stringify(state);
  };

  /**
   * A state representation for new nodes.
   */
  CATMAID.getParentState = function(parentId, parentEditTime) {
    var state = {
      "parent": [parentId, parentEditTime]
    };
    return JSON.stringify(state);
  };

  /**
   * A state to represent parent and child edition time.
   */
  CATMAID.getEdgeState = function(parentId, parentEditTime, childId, childEditTime) {
    var state = {
      "parent": [parentId, parentEditTime],
      "children": [childId, childEditTime]
    };
    return JSON.stringify(state);
  };

  /**
   * A dummy state that causes the back-end to not do state checks.
   */
  CATMAID.getNoCheckState = function() {
    var state = {
      "nocheck": true
    };
    return JSON.stringify(state);
  };

})(CATMAID);
