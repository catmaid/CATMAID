/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  CATMAID.State = function() {};

  /**
   * Serialize a state into JSON. It looks like this for a NodeState:
   *
   *   {
   *     parent: (<id>, <edition_time>),
   *     children: ((<child_id>, <child_edition_time>), ...),
   *     links: ((<connector_id>, <connector_edition_time>, <relation_id>), ...)
   *   }
   */
  CATMAID.State.prototype.serialize = function() {
    return JSON.stringify(this);
  };

  /**
   * A general state representation for existing nodes.
   */
  CATMAID.NodeState = function(nodeId, editionTime, parentId, parentEditTime,
      children, links) {
    this.edition_time = editionTime;
    this.parent = [parentId, parentEditTime];
    this.children = children;
    this.links = links;
  };

  CATMAID.NodeState.prototype = Object.create(CATMAID.State.prototype);
  CATMAID.NodeState.constructor = CATMAID.NodeState;

  /**
   * A state representation for new nodes.
   */
  CATMAID.NewNodeState = function(parentId, parentEditTime) {
    this.parent = {
      "id": parentId,
      "edition_time": parentEditTime
    };
  };

  CATMAID.NewNodeState.prototype = Object.create(CATMAID.State.prototype);
  CATMAID.NewNodeState.constructor = CATMAID.NewNodeState;

  /**
   * A dummy state that causes the back-end to not do state checks.
   */
  CATMAID.NoState = function() {
    this.nocheck = true;
  };

  CATMAID.NoState.prototype = Object.create(CATMAID.State.prototype);
  CATMAID.NoState.constructor = CATMAID.NoState;

})(CATMAID);
